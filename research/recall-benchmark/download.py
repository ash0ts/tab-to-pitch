"""Download a frozen, outcome-blind cohort from the public FSRS dataset."""

import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import time
import urllib.request

DATASET = "open-spaced-repetition/fsrs-dataset"
REVISION = "ae96575728d364265a75f2447fe7b7fa389ba96c"


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def fetch(url):
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=45) as response:
                data = response.read(150_000_001)
            if len(data) > 150_000_000:
                raise ValueError("source file exceeds 150 MB bound")
            return data
        except (OSError, TimeoutError):
            if attempt == 2:
                raise
            time.sleep(1)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--output", type=Path, required=True)
    args = p.parse_args()
    out = args.output
    out.mkdir(parents=True, exist_ok=True)
    raw = out / "raw"
    raw.mkdir(exist_ok=True)
    protocol = json.loads(Path(__file__).with_name("protocol.json").read_text())
    metadata_path = out / "hf-metadata.json"
    if metadata_path.exists():
        metadata = json.loads(metadata_path.read_text())
    else:
        data = fetch(
            f"https://huggingface.co/api/datasets/{DATASET}/revision/{REVISION}"
        )
        metadata_path.write_bytes(data)
        metadata = json.loads(data)
    if metadata["sha"] != REVISION or metadata["cardData"]["license"] != "mit":
        raise ValueError("dataset revision or license drift")
    names = [
        x["rfilename"]
        for x in metadata["siblings"]
        if x["rfilename"].startswith("float-delta-t/")
    ]
    selected = sorted(names, key=lambda x: digest("tabtopitch-cohort-v1:" + x))[
        : protocol["collectionCount"]
    ]
    holdout = set(
        sorted(selected, key=lambda x: digest("tabtopitch-holdout-v1:" + x))[
            : protocol["heldoutCount"]
        ]
    )
    frozen = {
        "revision": REVISION,
        "selectedFiles": selected,
        "heldoutFiles": sorted(holdout),
        "protocolSha256": digest(Path(__file__).with_name("protocol.json").read_text()),
        "frozenAt": datetime.now(timezone.utc).isoformat(),
    }
    freeze_path = out / "selection.json"
    if freeze_path.exists():
        old = json.loads(freeze_path.read_text())
        if any(
            old[k] != frozen[k]
            for k in ["revision", "selectedFiles", "heldoutFiles", "protocolSha256"]
        ):
            raise ValueError("selection drift")
    else:
        freeze_path.write_text(json.dumps(frozen, indent=2) + "\n")

    def one(name):
        path = raw / Path(name).name
        url = f"https://huggingface.co/datasets/{DATASET}/resolve/{REVISION}/{name}"
        data = path.read_bytes() if path.exists() else fetch(url)
        if not data.startswith(b"review_time\tcard_id\t"):
            raise ValueError(f"Unexpected source schema for {name}")
        if not path.exists():
            path.write_bytes(data)
        row = {
            "sourceFile": name,
            "url": url,
            "sha256": hashlib.sha256(data).hexdigest(),
            "bytes": len(data),
            "heldout": name in holdout,
        }
        print(json.dumps({"downloaded": name, "bytes": len(data)}), flush=True)
        return row

    with ThreadPoolExecutor(max_workers=3) as pool:
        sources = list(pool.map(one, selected))
    source_card = fetch(
        f"https://huggingface.co/datasets/{DATASET}/resolve/{REVISION}/README.md"
    )
    (out / "source-readme.md").write_bytes(source_card)
    manifest = {
        "schemaVersion": 1,
        "dataset": DATASET,
        "revision": REVISION,
        "sourceUrl": f"https://huggingface.co/datasets/{DATASET}",
        "license": "MIT as declared in the upstream dataset card",
        "licenseEvidenceUrl": f"https://huggingface.co/datasets/{DATASET}/blob/{REVISION}/README.md",
        "cardSha256": hashlib.sha256(source_card).hexdigest(),
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "files": sources,
        "synthetic": False,
        "semantics": "Real self-rated flashcard review logs. Not TabToPitch attempts.",
        "redistribution": "Raw rows remain local; publish only aggregate results and model coefficients.",
    }
    (out / "dataset-manifest-local.json").write_text(
        json.dumps(manifest, indent=2) + "\n"
    )
    print(
        json.dumps(
            {"completedFiles": len(sources), "bytes": sum(x["bytes"] for x in sources)}
        ),
        flush=True,
    )


if __name__ == "__main__":
    main()
