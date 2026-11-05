"""Render source-grounded dataset diagrams with Matplotlib 3.11.1.

The guitar example is real annotated music. The review sequence is explicitly
schematic and contains no individual review records or fabricated outcomes.
"""

import argparse
import hashlib
import json
from pathlib import Path
import textwrap
import xml.etree.ElementTree as ET

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch

INK = "#182B33"
MUTED = "#52636A"
BLUE = "#355E7A"
TEAL = "#087E77"
AMBER = "#986414"
PANEL = "#F3F6F7"


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def text(ax, x, y, value, size=12.5, color=INK, weight="normal", width=None):
    if width:
        value = "\n".join(textwrap.fill(line, width) for line in value.split("\n"))
    ax.text(
        x,
        y,
        value,
        fontsize=size,
        color=color,
        weight=weight,
        va="top",
        linespacing=1.4,
    )


def card(ax, y, height, label, color=BLUE):
    ax.add_patch(
        FancyBboxPatch(
            (0.07, y - height),
            0.86,
            height,
            boxstyle="round,pad=0.009,rounding_size=0.012",
            facecolor=PANEL,
            edgecolor="#DCE4E7",
            linewidth=0.8,
        )
    )
    text(ax, 0.105, y - 0.016, label, size=12.7, color=color, weight="bold")


def arrow(ax, top, bottom, label=None):
    ax.annotate(
        "",
        xy=(0.5, bottom),
        xytext=(0.5, top),
        arrowprops={"arrowstyle": "-|>", "color": MUTED, "lw": 1.4},
    )
    if label:
        text(ax, 0.11, top - 0.003, label, size=10.5, color=MUTED)


def canvas(height):
    fig = plt.figure(figsize=(5, height), facecolor="white")
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis("off")
    return fig, ax


def save(fig, output, stem, title, description):
    fig.canvas.draw()
    renderer = fig.canvas.get_renderer()
    for axis in fig.axes:
        for label in axis.texts:
            bounds = label.get_window_extent(renderer)
            if (
                bounds.x0 < -1
                or bounds.y0 < -1
                or bounds.x1 > fig.bbox.width + 1
                or bounds.y1 > fig.bbox.height + 1
            ):
                raise ValueError(f"Text outside figure: {label.get_text()}")
    files = []
    for extension in ("png", "svg"):
        path = output / f"{stem}.{extension}"
        metadata = {"Description": description}
        if extension == "svg":
            metadata["Date"] = None
        fig.savefig(path, dpi=200, metadata=metadata)
        files.append(path)
    preview = output / f"{stem}-390.png"
    fig.savefig(preview, dpi=78)
    files.append(preview)
    plt.close(fig)
    svg = output / f"{stem}.svg"
    ET.register_namespace("", "http://www.w3.org/2000/svg")
    tree = ET.parse(svg)
    root = tree.getroot()
    root.set("role", "img")
    root.set("aria-labelledby", f"{stem}-title {stem}-description")
    for tag, suffix, value in [
        ("desc", "description", description),
        ("title", "title", title),
    ]:
        item = ET.Element(
            "{http://www.w3.org/2000/svg}" + tag, {"id": f"{stem}-{suffix}"}
        )
        item.text = value
        root.insert(0, item)
    tree.write(svg, encoding="utf-8", xml_declaration=True)
    return files


def guitar(data, output):
    item = data["guitar"]
    note = item["observed"]
    canonical = item["canonical"]
    fig, ax = canvas(10.5)
    title = "One recorded note\nbecomes two questions"
    text(ax, 0.075, 0.965, title, size=20, weight="bold")
    text(
        ax, 0.075, 0.87, "GuitarSet · actual annotated example", color=MUTED, size=11.5
    )
    card(ax, 0.825, 0.16, "1  Keep the source observation")
    text(
        ax,
        0.105,
        0.775,
        f"B string · source index {note['sourceStringIndex']}\nOnset {note['timeSeconds']:.3f} s · duration {note['durationSeconds'] * 1000:.0f} ms\nPitch estimate: MIDI {note['observedMidi']:.3f}",
        size=12.5,
    )
    arrow(ax, 0.65, 0.625)
    card(ax, 0.61, 0.17, "2  Check it before generating", color=TEAL)
    text(
        ax,
        0.105,
        0.56,
        f"{note['centsFromNearest']:+.1f} cents from {item['pitch']} · {note['contourFrames']} voiced frames\nPasses the versioned stability filters.\nMIDI {canonical['soundingMidi']} → {item['pitch']} · string {canonical['position']['string']}, fret {canonical['position']['fret']}",
        size=12.5,
    )
    text(
        ax,
        0.105,
        0.455,
        "Fret inferred from standard tuning; no finger tracking.",
        size=9.6,
        color=MUTED,
    )
    arrow(ax, 0.421, 0.397)
    card(ax, 0.382, 0.225, "3  Ask only what the data supports", color=TEAL)
    text(ax, 0.105, 0.332, "Name string 2, fret 3, including octave.", size=12.0)
    text(
        ax,
        0.105,
        0.301,
        f"Answer: {item['pitch']}",
        size=13.5,
        color=TEAL,
        weight="bold",
    )
    text(
        ax,
        0.105,
        0.265,
        f"Find the exact same {item['pitch']} on another string.",
        size=12.0,
    )
    answers = " · ".join(
        f"{p['string']}/{p['fret']}" for p in item["alternativePositions"]
    )
    text(ax, 0.105, 0.232, answers, size=13.5, color=TEAL, weight="bold")
    text(
        ax,
        0.105,
        0.2,
        "Accepted string/fret pairs; same pitch and octave.",
        size=10.2,
        color=MUTED,
    )
    text(
        ax,
        0.075,
        0.126,
        "These are generated questions, not learner answers.\nNo spelling or articulation labels: interval and\ntriad-role questions are withheld.",
        size=10.3,
        color=MUTED,
    )
    text(
        ax,
        0.075,
        0.052,
        "Source: Xi et al., GuitarSet v1.1.0 · CC BY 4.0.\nAnnotated performance; derived research diagram.",
        size=9.7,
        color=MUTED,
    )
    description = f"Actual GuitarSet annotated note: source string index {note['sourceStringIndex']}, onset {note['timeSeconds']:.9f} seconds, duration {note['durationSeconds']:.9f} seconds, fractional MIDI {note['observedMidi']:.9f}. It passes the experimental filters and maps to D4 at inferred string 2 fret 3. Generated questions accept D4 as the name and strings/frets 3/7, 4/12, 5/17, 6/22 as exact-pitch alternatives. These are not learner responses or observed fingering."
    return save(
        fig, output, "guitarset-note-to-question", title.replace("\n", " "), description
    ), description


def recall(data, output):
    fig, ax = canvas(10.5)
    title = "Predict the next review.\nKeep its answer hidden."
    text(ax, 0.075, 0.965, title, size=20, weight="bold")
    text(
        ax,
        0.075,
        0.87,
        "FSRS · schematic, not a learner record",
        color=MUTED,
        size=11.5,
    )
    card(ax, 0.825, 0.145, "1  Earlier reviews of the same card")
    text(
        ax,
        0.105,
        0.775,
        "Prior review and lapse counts\nEarlier self-ratings and recall rate\nPrevious gap between reviews",
        size=12.5,
    )
    arrow(ax, 0.664, 0.64)
    card(ax, 0.625, 0.15, "2  Predict before the answer")
    text(
        ax,
        0.105,
        0.575,
        "Add the elapsed time known now.\nFreeze this review’s features.\nPredict a probability of self-rated recall.",
        size=12.0,
    )
    ax.plot(
        [0.075, 0.925],
        [0.452, 0.452],
        color=AMBER,
        linestyle=(0, (4, 4)),
        linewidth=1.2,
    )
    text(
        ax,
        0.1,
        0.439,
        "CURRENT ANSWER IS NOT A FEATURE",
        size=10.5,
        color=AMBER,
        weight="bold",
    )
    card(ax, 0.397, 0.15, "3  Observe the current self-rating", color=AMBER)
    text(
        ax,
        0.105,
        0.347,
        "Rating > 1 becomes label 1.\nCompare that label with the prediction.\nThis answer may inform a later review.",
        size=12.0,
    )
    text(
        ax,
        0.075,
        0.211,
        "A self-rating is not an independently graded answer.\nNo guitar context, hint labels or assigned teaching\nconditions: this tests prediction, not instruction.",
        size=10.3,
        color=MUTED,
    )
    split = data["recall"]["splits"]
    text(
        ax,
        0.075,
        0.126,
        f"Actual benchmark: {split['train']['reviews']:,} fitting reviews.\nTests: {split['temporal']['reviews']:,} later reviews from fitting groups;\n{split['heldout']['reviews']:,} from groups excluded from fitting.",
        size=10.3,
        color=MUTED,
    )
    text(
        ax,
        0.075,
        0.052,
        "Source: Open Spaced Repetition, FSRS dataset.\nMIT-declared. No individual histories shown.",
        size=9.7,
        color=MUTED,
    )
    description = "Schematic, not an individual learner record. Earlier reviews of the same card provide prior counts, lapses, ratings and recall rate. Time elapsed before the current response is also known. These features predict the current self-rating, which becomes an evaluation label only after the response. The current answer and response duration never enter their own features. The answer can inform a later review without refitting model parameters. Self-ratings on flashcards do not establish guitar learning or the effect of instruction."
    return save(
        fig,
        output,
        "fsrs-feature-target-boundary",
        title.replace("\n", " "),
        description,
    ), description


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", required=True, type=Path)
    args = parser.parse_args()
    data = json.loads(args.data.read_text())
    output = args.data.parent
    plt.rcParams.update(
        {
            "font.family": "DejaVu Sans",
            "svg.fonttype": "path",
            "svg.hashsalt": "tabtopitch-dataset-explainer-v1",
            "axes.unicode_minus": True,
        }
    )
    guitar_files, guitar_description = guitar(data, output)
    recall_files, recall_description = recall(data, output)
    contract = {
        "question": "What useful evidence does each dataset supply, and where does it stop?",
        "takeaway": data["evidenceBoundary"],
        "audience": "Product and engineering readers unfamiliar with either dataset",
        "forbiddenClaims": [
            "Observed guitar fingering",
            "Guitar learner response labels in GuitarSet",
            "FSRS prediction validates guitar teaching",
            "Schematic depicts an actual learner history",
        ],
        "sourceDataSha256": sha(args.data),
        "renderer": {
            "name": "Matplotlib",
            "version": matplotlib.__version__,
            "scriptSha256": sha(Path(__file__)),
        },
        "figures": [
            {
                "stem": "guitarset-note-to-question",
                "evidence": "guitar.observed, guitar.canonical, guitar.questions",
                "status": "actual annotated record with derived exercises",
                "description": guitar_description,
            },
            {
                "stem": "fsrs-feature-target-boundary",
                "evidence": "recall.featureNames, recall.splits; benchmark feature contract",
                "status": "explicit schematic; counts are actual aggregate results",
                "description": recall_description,
            },
        ],
        "rounding": "Display seconds and MIDI to three decimals, duration to integer milliseconds, cents to one decimal; exact values retained in source JSON.",
        "colorSemantics": {
            "blue": "source information available",
            "teal": "derived eligible music question",
            "amber": "held-back target response",
            "grey": "limitations and attribution",
        },
        "privacy": "No raw recall rows, IDs, timestamps, histories, or answer text. Public GuitarSet note metadata is included with attribution.",
        "files": {path.name: sha(path) for path in guitar_files + recall_files},
    }
    (output / "figure-manifest.json").write_text(json.dumps(contract, indent=2) + "\n")
    (output / "figure-descriptions.md").write_text(
        "# Dataset figure descriptions\n\n"
        + guitar_description
        + "\n\n"
        + recall_description
        + "\n"
    )
    print(
        json.dumps({"output": str(output), "files": list(contract["files"])}, indent=2)
    )


if __name__ == "__main__":
    main()
