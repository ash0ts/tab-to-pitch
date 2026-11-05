"""Extract a new teacher cohort directly from licensed GuitarSet JAMS, without app theory code."""
import hashlib
import json
import math
import re
import sys
from pathlib import Path

VERSION = "guitar-teacher-grounding-v1"
TUNING = [64, 59, 55, 50, 45, 40]
NATURAL = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
FORMULAS = {
    "maj": ("", [("1", 0), ("3", 4), ("5", 7)]),
    "min": ("m", [("1", 0), ("b3", 3), ("5", 7)]),
    "7": ("7", [("1", 0), ("3", 4), ("5", 7), ("b7", 10)]),
    "maj7": ("maj7", [("1", 0), ("3", 4), ("5", 7), ("7", 11)]),
    "min7": ("m7", [("1", 0), ("b3", 3), ("5", 7), ("b7", 10)]),
    "hdim7": ("m7b5", [("1", 0), ("b3", 3), ("b5", 6), ("b7", 10)]),
    "dim": ("dim", [("1", 0), ("b3", 3), ("b5", 6)]),
}
KNOWN = {"04_BN3-154-E_comp", "04_Jazz1-200-B_comp", "02_Funk2-119-G_comp"}


def sha(value):
    return hashlib.sha256(value if isinstance(value, bytes) else value.encode()).hexdigest()


def pitch_name(root, degree, pc):
    letter = "CDEFGAB"[("CDEFGAB".index(root[0]) + int(degree.lstrip("b#")) - 1) % 7]
    delta = (pc - NATURAL[letter] + 6) % 12 - 6
    return letter + ("#" * delta if delta >= 0 else "b" * -delta)


def chord(label):
    m = re.fullmatch(r"([A-G])([b#]?):(maj|min|7|maj7|min7|hdim7|dim)", label)
    if not m:
        return None
    letter, accidental, quality = m.groups()
    root = letter + accidental
    pc = (NATURAL[letter] + {"": 0, "#": 1, "b": -1}[accidental]) % 12
    suffix, intervals = FORMULAS[quality]
    return {"symbol": root + suffix, "root": root, "quality": quality,
            "tones": [{"degree": d, "pc": (pc + offset) % 12,
                       "name": pitch_name(root, d, (pc + offset) % 12)} for d, offset in intervals]}


def extract(path):
    raw = path.read_bytes()
    source = json.loads(raw)
    annotations = source["annotations"]
    instructed = [(i, a) for i, a in enumerate(annotations) if a["namespace"] == "chord"
                  and not a["annotation_metadata"].get("annotation_rules")]
    if len(instructed) != 1:
        return None
    ai, sheet = instructed[0]
    tempo = next(a["data"][0]["value"] for a in annotations if a["namespace"] == "tempo")
    key = next(a["data"][0]["value"] for a in annotations if a["namespace"] == "key_mode")
    notes = []
    for ni, a in enumerate(annotations):
        if a["namespace"] != "note_midi":
            continue
        string = 6 - int(a["annotation_metadata"]["data_source"])
        for oi, observation in enumerate(a["data"]):
            midi = math.floor(observation["value"] + .5)
            fret = midi - TUNING[string - 1]
            if abs(midi - observation["value"]) <= .35 and observation["duration"] >= .08 and 0 <= fret <= 24:
                notes.append({"annotation": ni, "observation": oi, "time": observation["time"],
                              "duration": observation["duration"], "fractionalMidi": observation["value"],
                              "midi": midi, "position": {"string": string, "fret": fret}})
    candidates = []
    for start in range(len(sheet["data"]) - 2):
        rows = sheet["data"][start:start + 3]
        chords = [chord(r["value"]) for r in rows]
        if not all(chords) or len({c["symbol"] for c in chords}) < 2:
            continue
        for selected, (r, c) in enumerate(zip(rows, chords)):
            for tone in c["tones"]:
                if tone["degree"] not in ("3", "b3", "7", "b7"):
                    continue
                observed = [n for n in notes if n["midi"] % 12 == tone["pc"] and
                            n["time"] >= r["time"] + .05 and n["time"] + n["duration"] <= r["time"] + r["duration"] - .05]
                if not observed:
                    continue
                n = min(observed, key=lambda x: sha(f'{path.stem}:{x["annotation"]}:{x["observation"]}'))
                candidates.append({"selected": selected, "tone": tone, "note": n,
                                   "spans": [{**c, "annotation": ai, "observation": start + j,
                                              "time": r["time"], "duration": r["duration"],
                                              "label": r["value"]} for j, (r, c) in enumerate(zip(rows, chords))]})
    if not candidates:
        return None
    # Prefer seventh-role material when present; tie-breaking never consults model outputs.
    candidates.sort(key=lambda c: (c["tone"]["degree"] not in ("7", "b7"), sha(json.dumps(c, sort_keys=True))))
    m = re.fullmatch(r"(\d\d)_([A-Za-z]+)(\d)-(.+)_comp", path.stem)
    return {"recording": path.stem, "sourceSha256": sha(raw), "performer": m[1], "style": m[2],
            "family": m[3], "tempo": tempo, "key": key, **candidates[0]}


def main():
    root, output = map(Path, sys.argv[1:])
    output.mkdir(parents=True, exist_ok=False)
    prior = {r["recordingId"] for r in json.loads((root / "campaign-test-cases.json").read_text())}
    eligible, exclusions = [], []
    for path in sorted((root / "raw").glob("*_comp.jams")):
        reason = "publisher-known-annotation-error" if path.stem in KNOWN else "previous-live-coach-cohort" if path.stem in prior else None
        row = extract(path) if not reason else None
        if row:
            eligible.append(row)
        else:
            exclusions.append({"recording": path.stem, "reason": reason or "no-supported-three-span-window-with-stable-role-note"})
    selected = []
    for split, performers, families, count in [("development", ["00", "01"], ["1"], 3),
                                                ("evaluation", ["02", "03", "04"], ["2", "3"], 6)]:
        for performer in performers:
            for family in families:
                group = sorted([x for x in eligible if x["performer"] == performer and x["family"] == family],
                               key=lambda x: sha(VERSION + x["recording"]))
                assert len(group) >= count, (split, performer, family, len(group))
                for item in group[:count]:
                    selected.append({"split": split, **item})
    for name, data in [("passages.json", selected), ("exclusions.json", exclusions)]:
        (output / name).write_text(json.dumps(data, indent=2) + "\n")
    manifest = {"version": VERSION, "source": "https://zenodo.org/records/3371780", "license": "CC-BY-4.0",
                "attribution": "Xi, Bittner, Pauwels, Ye and Bello. GuitarSet: A Dataset for Guitar Transcription. ISMIR 2018.",
                "labels": "Instructed lead-sheet harmony; recorded note annotations. Tasks and learner requests are authored. Frets are inferred.",
                "knownIssues": ["https://github.com/marl/GuitarSet/issues/4", "https://github.com/marl/GuitarSet/issues/5"],
                "previousUse": "The corpus was used in prior ranking studies. Held out means disjoint from this prompt development, not globally unseen or independent of model pretraining.",
                "eligibleRecordings": len(eligible), "selectedRecordings": len(selected),
                "files": {n: sha((output / n).read_bytes()) for n in ["passages.json", "exclusions.json"]},
                "builderSha256": sha(Path(__file__).read_bytes())}
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps({"eligible": len(eligible), "development": sum(x["split"] == "development" for x in selected),
                      "evaluation": sum(x["split"] == "evaluation" for x in selected), "excluded": len(exclusions)}))


if __name__ == "__main__":
    main()
