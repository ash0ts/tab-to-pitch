"""Export recorded comparisons, or publish a W&B Table without new inference.

Use the repository's pinned W&B 0.31.0 environment for --publish. Publication
requires independently read-back Lens and Weave receipts. --check is offline.
"""

import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re

COLUMNS = [
    "case_id", "context", "split", "scenario", "arm", "trial", "question",
    "verified_context", "response", "actions", "actor_outcome", "application_outcome",
    "evaluator_outcome", "failure", "criteria", "judgment", "execution_ms",
    "usage_receipts", "reserved_dollars", "lens_trace", "weave_evaluation",
]


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def encode(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False)


def rows_for(campaign, cases, lens=None, weave=None):
    """Preserve missing outputs; a successful fallback cannot become actor success."""
    observed = {(r["taskId"], r["arm"], r["trial"]): r for r in campaign["rows"]}
    if len(observed) != len(campaign["rows"]):
        raise ValueError("Duplicate case/arm/trial")
    expected = [(c, "authored", 0) for c in cases["evaluation"]]
    for split in ("development", "evaluation"):
        for c in cases[split]:
            for arm in ("current-prompt", "revised-prompt"):
                for trial in range(2):
                    expected.append((c, arm, trial))
    if set(observed) - {(c["id"], a, t) for c, a, t in expected}:
        raise ValueError("Unexpected evaluated case")
    result = []
    for case, arm, trial in expected:
        row = observed.get((case["id"], arm, trial))
        output = row.get("output", {}) if row else {}
        judge = row.get("judge") if row else None
        failure = row.get("failure") if row else None
        fallback = bool(output.get("fallbackReason"))
        actor = ("authored" if arm == "authored" else
                 "failed" if failure or fallback else
                 "responded" if output.get("source") == "forge" else "unexecuted")
        valid = row and row["scores"]["executableActionsValid"]
        application = "unexecuted" if not row else "fallback" if fallback else "response" if valid else "invalid"
        evaluator = "unmeasured" if not row else "scored" if judge else "failed" if any(
            j["id"] == row["id"] for j in campaign.get("judges", [])
        ) else "unmeasured"
        trace_id = row.get("traceId") if row else None
        link = None
        if lens and lens.get("verified") and trace_id in lens.get("conversationIds", []):
            link = f"https://forge.coreweave.com/agent-lens/{campaign['project']}/conversations/{trace_id}"
        group = next((g for g in (weave or {}).get("groups", []) if g["arm"] == arm), None)
        weave_ref = group["evaluationRef"] if group and weave.get("status") == "verified" else None
        calls = [r for r in campaign.get("requests", [])
                 if row and f":{row['id']}:" in r["id"]]
        result.append([
            case["id"], case["contextId"], case["split"], case["scenario"], arm, trial,
            case["request"]["request"], encode(case["request"]["context"]),
            output.get("message"), encode(output.get("actions", [])), actor, application,
            evaluator, failure, encode(row["scores"] if row else None), encode(judge),
            row.get("executionMs") if row else None, encode(calls),
            sum(c.get("reservedDollars", 0) for c in calls) if calls else None,
            link, weave_ref,
        ])
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", type=Path, required=True)
    parser.add_argument("--publish", action="store_true")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    directory = args.dir.resolve()
    campaign = json.loads((directory / "campaign.json").read_text())
    manifest = json.loads((directory / "manifest.json").read_text())
    cases = json.loads((directory / "cases.json").read_text())
    if campaign["protocol"] != "teaching-practice-v1" or sha(directory / "cases.json") != manifest["casesHash"]:
        raise ValueError("Frozen case inputs changed")
    for source in manifest["sourceHashes"]:
        if sha(directory / "source" / source["path"]) != source["sha256"]:
            raise ValueError("Frozen source changed")
    publication = directory / "publication"
    publication.mkdir(exist_ok=True)
    def receipt(name):
        path = publication / name
        return json.loads(path.read_text()) if path.exists() else None
    lens, weave = receipt("lens/lens-readback.json"), receipt("weave.json")
    data = rows_for(campaign, cases, lens, weave)
    export = {"columns": COLUMNS, "data": data, "campaignHash": sha(directory / "campaign.json")}
    (publication / "comparison-table.json").write_text(json.dumps(export, indent=2) + "\n")
    if not args.publish:
        print(json.dumps({"rows": len(data), "remoteWrites": 0, "inferenceCalls": 0}))
        return
    if not lens or not lens.get("verified") or not weave or weave.get("status") != "verified":
        raise ValueError("Publish and reconcile Lens and Weave before Tables")
    if weave["campaignHash"] != export["campaignHash"]:
        raise ValueError("Weave receipt belongs to different outputs")
    import requests
    import wandb
    if wandb.__version__ != "0.31.0":
        raise ValueError("Requalify before changing the pinned W&B SDK")
    helper_path = Path(__file__).resolve().parents[1] / "forge/artifact_upload.py"
    spec = importlib.util.spec_from_file_location("publication_helpers", helper_path)
    helper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helper)
    run_id = "practice-table-" + export["campaignHash"][:12]
    session = requests.Session()
    preflight = helper.private_project(session, os.environ["WANDB_API_KEY"], run_id)
    if preflight["existingRun"]:
        raise ValueError("Publication run exists; inspect readback before retrying")
    path = publication / "table-receipt.json"
    result = {"status": "pending", "runId": run_id, "campaignHash": export["campaignHash"]}
    with path.open("x") as file:
        json.dump(result, file)
    try:
        settings = wandb.Settings(
            base_url=helper.BASE_URL, init_timeout=25, finish_timeout=10,
            finish_timeout_raises=True, disable_code=True, disable_git=True,
            disable_job_creation=True, console="off", silent=True,
            x_disable_meta=True, x_disable_stats=True, x_disable_machine_info=True,
            x_save_requirements=False, x_graphql_retry_max=0,
            x_graphql_timeout_seconds=8, x_file_stream_retry_max=0,
            x_file_stream_timeout_seconds=8, x_file_transfer_retry_max=0,
            x_file_transfer_timeout_seconds=10,
        )
        with wandb.init(entity=helper.ENTITY, project=helper.PROJECT, id=run_id,
                        resume="never", job_type="evaluation-publication",
                        name="Teaching practice: recorded case comparisons",
                        settings=settings, config={"protocol": "teaching-practice-v1", "training": False}) as run:
            table = wandb.Table(columns=COLUMNS, data=data)
            artifact = wandb.Artifact(run_id, type="evaluation", metadata={"campaignHash": export["campaignHash"]})
            artifact.add(table, "cases")
            logged = run.log_artifact(artifact).wait(timeout=25)
            result["artifact"] = logged.qualified_name
            run.log({"case_comparisons": table})
        if not re.fullmatch(re.escape(f"{helper.ENTITY}/{helper.PROJECT}/{run_id}:") + r"v\d+", result["artifact"]):
            raise ValueError("Expected immutable artifact version")
        api = wandb.Api(overrides={"base_url": helper.BASE_URL}, timeout=8)
        downloaded = Path(api.artifact(result["artifact"], type="evaluation").download(
            root=str(publication / "table-download"), skip_cache=True))
        observed = json.loads((downloaded / "cases.table.json").read_text())
        if observed["columns"] != COLUMNS or observed["data"] != data:
            raise ValueError("Downloaded table membership, output or score mismatch")
        final = helper.private_project(session, os.environ["WANDB_API_KEY"], run_id)
        if final["existingRun"]["state"] != "finished":
            raise ValueError("Publication run has not finished on server")
        result.update(status="verified", rows=len(data), inferenceCalls=0,
                      url=f"https://forge.coreweave.com/wandb/{campaign['project']}/runs/{run_id}")
    except Exception as error:
        result.update(status="failed-or-unknown", error=str(error))
        raise
    finally:
        path.write_text(json.dumps(result, indent=2) + "\n")


if __name__ == "__main__":
    main()
