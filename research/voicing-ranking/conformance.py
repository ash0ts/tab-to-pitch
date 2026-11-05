"""Independent Guitar-TECHS annotation checks; no fitted model or audio scoring."""
import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import re
import mido
from benchmark import TUNING, candidates, pitches, span, write

FORMULAS = {"maj": (0,4,7), "min": (0,3,7), "aug": (0,4,8), "dim": (0,3,6), "Maj7": (0,4,7,11), "7": (0,4,7,10), "m7": (0,3,7,10), "m7b5": (0,3,6,10)}
STRINGS = {"e": 0, "B": 1, "G": 2, "D": 3, "A": 4, "E": 5}


def events(path):
    midi = mido.MidiFile(path)
    names = {}
    for track in midi.tracks:
        name = next((e.name for e in track if e.type == "track_name"), None)
        if name in STRINGS:
            for e in track:
                if e.type == "note_on":
                    if e.channel in names and names[e.channel] != STRINGS[name]:
                        raise ValueError("Inconsistent MIDI string channel")
                    names[e.channel] = STRINGS[name]
    active, notes, time = {}, [], 0.0
    for event in midi:
        time += event.time
        if event.type not in ("note_on", "note_off"):
            continue
        key = (event.channel, event.note)
        if event.type == "note_on" and event.velocity:
            if key in active:
                # Preserve this entire repeated-onset interval as unavailable.
                # Do not guess which onset an eventual note-off closes.
                active[key][1] += 1
                active[key][2] = True
            else:
                active[key] = [time, 1, False]
        elif key in active:
            active[key][1] -= 1
            if not active[key][1]:
                start, _, ambiguous = active.pop(key)
                notes.append({"string": names[event.channel], "midi": event.note, "start": start, "end": time, "ambiguous": ambiguous})
    for (channel, note), (start, _, _) in active.items():
        notes.append({"string": names[channel], "midi": note, "start": start, "end": time, "ambiguous": True})
    return notes


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    contract = {"revision": 2, "dataset": "Guitar-TECHS 14963133", "license": "CC-BY-4.0", "definition": "Each distinct stable observed shape per MIDI recording, sampled 40 ms after attacks and sustained another 40 ms. Expected string group and voice count come from dataset documentation; formula from filename. No correction of extra/missing notes. Repeated note-on intervals with uncertain note-off matching and unclosed notes are unavailable, and every snapshot overlapping them is excluded.", "amendment": "Revision 1 stopped before scores on a repeated note-on. Its failure is retained; revision 2 records and excludes ambiguous intervals.", "formulaRoot": "All twelve roots considered; symmetric augmented triads can remain ambiguous", "scope": "Annotation conformance and independent candidate coverage, not audio transcription, preference or learning", "sourceSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
    write(args.output / "contract.json", contract)
    rows, counts = [], Counter()
    for path in sorted(args.data.glob("P*/midi/*.mid")):
        match = re.fullmatch(r"midi_(Set[1-4]|Drop3)_(maj|min|aug|dim|Maj7|7|m7|m7b5)\.mid", path.name)
        if not match:
            raise ValueError("Unknown chord filename")
        group, quality = match.groups()
        formula = FORMULAS[quality]
        expected = (1,2,3,5) if group == "Drop3" else tuple(range(int(group[-1])-1, int(group[-1])-1+len(formula)))
        notes = events(path)
        counts["ambiguous_note_intervals"] += sum(n["ambiguous"] for n in notes)
        seen = set()
        for t in sorted(set(n["start"] + .04 for n in notes)):
            active = [n for n in notes if n["start"] <= t and n["end"] >= t + .04]
            if any(n["ambiguous"] and n["start"] <= t + .04 and n["end"] >= t for n in notes):
                counts["snapshots_overlapping_ambiguous_intervals"] += 1
                continue
            shape = [-1]*6
            strings = tuple(sorted(n["string"] for n in active))
            if len(strings) != len(set(strings)):
                counts["overlapping_notes_on_string"] += 1
                continue
            for n in active:
                shape[n["string"]] = n["midi"] - TUNING[n["string"]]
            key = tuple(shape)
            if key in seen:
                continue
            seen.add(key)
            if strings != expected:
                counts["distinct_shapes_with_missing_or_extra_strings"] += 1
                continue
            if any(n["midi"] - TUNING[n["string"]] < 0 or n["midi"] - TUNING[n["string"]] > 24 for n in active):
                counts["out_of_fret_range"] += 1
                continue
            ps = pitches(shape)
            pcs = set(p % 12 for p in ps)
            roots = [r for r in range(12) if {(r+i)%12 for i in formula} == pcs]
            ms = tuple(sorted(p%12 for p in ps))
            choices = candidates(ms)
            rows.append({"recording": str(path.relative_to(args.data)), "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "timeSeconds": t, "quality": quality, "stringGroup": group, "shape": shape, "midi": ps, "formulaMatches": bool(roots), "possibleRoots": roots, "possibleBassDegrees": [formula.index((min(ps)-r)%12) for r in roots], "candidateCovered": key in choices, "fretSpan": span(shape)})
    byquality = {}
    for q in FORMULAS:
        items = [r for r in rows if r["quality"] == q]
        byquality[q] = {"shapes": len(items), "formulaMatches": sum(r["formulaMatches"] for r in items), "candidateCovered": sum(r["candidateCovered"] for r in items), "inversionsPresent": sorted(set(i for r in items for i in r["possibleBassDegrees"]))}
    report = {"midiFiles": len(list(args.data.glob("P*/midi/*.mid"))), "distinctExpectedStringShapes": len(rows), "formulaMatches": sum(r["formulaMatches"] for r in rows), "candidateCovered": sum(r["candidateCovered"] for r in rows), "counts": dict(counts), "byQuality": byquality, "allRowsRetained": True, "trainingUse": False}
    write(args.output / "examples.json", rows)
    write(args.output / "report.json", report)
    print(json.dumps(report))


if __name__ == "__main__":
    main()
