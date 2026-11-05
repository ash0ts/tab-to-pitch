"""Publish the audited recall bundle with W&B 0.31.0 and verify downloaded bytes.

Run with ml/.venv/bin/python; WANDB_API_KEY is read only from the environment.
This creates a publication run, never changes the existing evaluation run, and
records no training metrics. An uncertain write is not retried automatically.
"""

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys

ENTITY = "wandb"
PROJECT = "tab-to-pitch-public-data-research"
BASE_URL = "https://api.forge.coreweave.com"
ARTIFACT = "tabtopitch-public-recall-proxy"
EXPECTED = {
    "report.json": "1fd45ed156ac3a61bdfdc038cc360e087708bd5bde3314aab868f0506cb1cf48",
    "model.json": "7451bfc24f517d0426382cad3127170357848a8ecae2469f4d64dd737b2f7dd3",
    "dataset-manifest.json": "126ad30d6d9542f2683df0b34467ea1448ac75eaf5dd8361e46d122557581306",
    "run-manifest.json": "c1d08d3f56d8c05a6435a42833bb811954094efd1b1911c1dff5716469e466dc",
    "metrics.json": "dc3d1d482195885ffa686f3ad7dbbd85ff5f7284b4de0f6469558dcbecc3cb80",
}


def now():
    return datetime.now(timezone.utc).isoformat()


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def validate_bundle(source):
    actual = {name: sha(source / name) for name in EXPECTED}
    if actual != EXPECTED:
        raise ValueError("Audited five-file bundle hash mismatch")
    manifest = json.loads((source / "run-manifest.json").read_text())
    if manifest["publicationAllowlist"] != list(EXPECTED):
        raise ValueError("Publication allowlist differs")
    for name in EXPECTED:
        if re.search(
            r"collection_id|card_id|user_id|/Users/|\.parquet|\.csv",
            (source / name).read_text(),
            re.I,
        ):
            raise ValueError("Bundle contains a forbidden field or local path")
    return actual


def checkpoint(path, receipt, **updates):
    receipt.update(updates)
    receipt["updatedAt"] = now()
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(receipt, indent=2) + "\n")
    temporary.replace(path)


def private_project(session, key, run_id):
    # No retries, redirects, or arbitrary endpoint override. SDK writes use this
    # same origin, so a shell-proxy read alone does not qualify the SDK route.
    response = session.post(
        BASE_URL + "/graphql",
        json={
            "query": "query($e:String!,$p:String!,$r:String!){viewer{username} project(entityName:$e,name:$p){name access run(name:$r){name state}}}",
            "variables": {"e": ENTITY, "p": PROJECT, "r": run_id},
        },
        auth=("api", key),
        timeout=(5, 8),
        allow_redirects=False,
    )
    response.raise_for_status()
    data = response.json()
    if data.get("errors"):
        raise ValueError("Preflight GraphQL errors")
    project = data["data"]["project"]
    if not project or project["name"] != PROJECT or project["access"] != "PRIVATE":
        raise ValueError("Private project not independently verified")
    return {"access": "PRIVATE", "verifiedAt": now(), "existingRun": project["run"]}


def worker(args):
    import requests
    import wandb

    path = args.output / "receipt.json"
    receipt = json.loads(path.read_text())
    run = None
    try:
        if wandb.__version__ != "0.31.0":
            raise ValueError("Requalify before changing the pinned W&B SDK")
        checkpoint(path, receipt, sdkVersion=wandb.__version__, status="preflight")
        session = requests.Session()
        preflight = private_project(
            session, os.environ["WANDB_API_KEY"], receipt["runId"]
        )
        if preflight["existingRun"] is not None:
            raise ValueError(
                "Publication run already exists; independent readback required"
            )
        checkpoint(
            path,
            receipt,
            preflight=preflight,
            status="creating-publication-run",
            writeAttempted=True,
        )
        settings = wandb.Settings(
            base_url=BASE_URL,
            init_timeout=25,
            finish_timeout=10,
            finish_timeout_raises=True,
            disable_code=True,
            disable_git=True,
            disable_job_creation=True,
            console="off",
            silent=True,
            x_disable_meta=True,
            x_disable_stats=True,
            x_disable_machine_info=True,
            x_save_requirements=False,
            x_graphql_retry_max=0,
            x_graphql_timeout_seconds=8,
            x_file_stream_retry_max=0,
            x_file_stream_timeout_seconds=8,
            x_file_transfer_retry_max=0,
            x_file_transfer_timeout_seconds=10,
        )
        run = wandb.init(
            entity=ENTITY,
            project=PROJECT,
            id=receipt["runId"],
            resume="never",
            name="Audited public recall model artifact publication",
            job_type="audited-artifact-publication",
            tags=["public-data", "recall-proxy", "research-only", "no-promotion"],
            config={
                "sourceEvaluationRun": "recall-public-v1",
                "target": "Anki self-rated recall (review_rating > 1)",
                "synthetic": False,
                "promotionEligible": False,
                "servingEnabled": False,
                "bundleSha256": EXPECTED,
            },
            dir=str(args.output / "sdk"),
            settings=settings,
        )
        checkpoint(path, receipt, status="uploading-artifact", runCreated=True)
        artifact = wandb.Artifact(
            ARTIFACT,
            type="model",
            description="Audited public self-rated flashcard recall research candidate. Not validated for guitar learning; no Registry promotion or deployment.",
            metadata={
                "synthetic": False,
                "promotionEligible": False,
                "servingEnabled": False,
                "aggregateOnly": True,
                "sourceEvaluationRun": "recall-public-v1",
                "sha256": EXPECTED,
            },
        )
        for name in EXPECTED:
            artifact.add_file(str(args.source / name), name=name)
        logged = run.log_artifact(artifact, aliases=[]).wait(timeout=25)
        qualified = logged.qualified_name
        if not re.fullmatch(
            re.escape(f"{ENTITY}/{PROJECT}/{ARTIFACT}:") + r"v\d+", qualified
        ):
            raise ValueError("Expected immutable artifact version")
        checkpoint(
            path,
            receipt,
            status="artifact-committed-awaiting-download",
            artifact=qualified,
            artifactId=logged.id,
            artifactDigest=logged.digest,
        )
        run.finish()
        run = None
        api = wandb.Api(overrides={"base_url": BASE_URL}, timeout=8)
        observed = api.artifact(qualified, type="model")
        if set(observed.manifest.entries) != set(EXPECTED):
            raise ValueError("Remote artifact file allowlist mismatch")
        downloaded = Path(
            observed.download(root=str(args.output / "downloaded"), skip_cache=True)
        )
        hashes = {name: sha(downloaded / name) for name in EXPECTED}
        if hashes != EXPECTED:
            raise ValueError("Downloaded bytes do not match audited bundle")
        final_project = private_project(
            session, os.environ["WANDB_API_KEY"], receipt["runId"]
        )
        if final_project["existingRun"]["state"] != "finished":
            raise ValueError("Publication run not finished on server")
        checkpoint(
            path,
            receipt,
            status="verified",
            downloadedSha256=hashes,
            finalProject=final_project,
            sourceEvaluationRunUnmodified=True,
            finishedAt=now(),
        )
    except Exception as error:
        # Provider errors and SDK logs can contain signed URLs. Receipts retain
        # only the exception class; no credentials, response bodies, or URLs.
        checkpoint(
            path,
            receipt,
            status="unverified-write"
            if receipt.get("writeAttempted")
            else "blocked-before-write",
            errorType=type(error).__name__,
            failedStage=receipt["status"],
            finishedAt=now(),
        )
        return 2
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--attempt", required=True)
    parser.add_argument("--worker", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()
    args.source = args.source.resolve()
    args.output = args.output.resolve()
    if not re.fullmatch(r"[a-z0-9-]{1,24}", args.attempt):
        parser.error("attempt must be a short lowercase identifier")
    validate_bundle(args.source)
    if args.worker:
        return worker(args)
    if not os.environ.get("WANDB_API_KEY"):
        parser.error("WANDB_API_KEY is required in the environment")
    args.output.mkdir(parents=True, exist_ok=False)
    (args.output / "sdk").mkdir()
    receipt_path = args.output / "receipt.json"
    receipt = {
        "schemaVersion": 1,
        "status": "prepared",
        "createdAt": now(),
        "project": f"{ENTITY}/{PROJECT}",
        "runId": f"recall-artifact-{args.attempt}",
        "sourceEvaluationRun": "recall-public-v1",
        "sourceSha256": EXPECTED,
        "sdkVersionExpected": "0.31.0",
        "scriptSha256": sha(Path(__file__)),
        "deadlineSeconds": 100,
        "writeAttempted": False,
        "retryPolicy": "No automatic rerun; read back any uncertain write first",
        "noInferenceCalls": True,
    }
    checkpoint(receipt_path, receipt)
    # Separate process group bounds SDK services and any internal download retries.
    # SDK logs remain local diagnostics and are never artifact inputs.
    with (args.output / "sdk-local.log").open("w") as log:
        child = subprocess.Popen(
            [
                sys.executable,
                str(Path(__file__).resolve()),
                "--source",
                str(args.source),
                "--output",
                str(args.output),
                "--attempt",
                args.attempt,
                "--worker",
            ],
            stdout=log,
            stderr=log,
            start_new_session=True,
        )
        try:
            code = child.wait(timeout=100)
        except subprocess.TimeoutExpired:
            os.killpg(child.pid, signal.SIGKILL)
            child.wait(timeout=5)
            receipt = json.loads(receipt_path.read_text())
            checkpoint(
                receipt_path,
                receipt,
                status="deadline-unverified-write"
                if receipt.get("writeAttempted")
                else "deadline-before-write",
                finishedAt=now(),
            )
            code = 2
    receipt = json.loads(receipt_path.read_text())
    print(
        json.dumps(
            {
                key: receipt.get(key)
                for key in [
                    "status",
                    "runId",
                    "artifact",
                    "writeAttempted",
                    "failedStage",
                    "errorType",
                ]
            }
        )
    )
    return code


if __name__ == "__main__":
    raise SystemExit(main())
