"""Render frozen public recall results; no fitting, network, or cloud publication.

uv --no-config run --no-project --python 3.12 --with matplotlib==3.11.1 \
  plot_results.py --report /absolute/path/run-003/report.json
"""

import argparse
import csv
import hashlib
import json
from pathlib import Path
import platform
import xml.etree.ElementTree as ET

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
from matplotlib.ticker import FuncFormatter

EXPECTED_REPORT_SHA256 = (
    "1fd45ed156ac3a61bdfdc038cc360e087708bd5bde3314aab868f0506cb1cf48"
)
HISTORY = "#46647C"
LOGISTIC = "#087E77"
INK = "#182B33"
MUTED = "#52636A"
GRID = "#DEE5E8"
ROW_LABELS = {"temporal": "Temporal", "heldout": "Held-out collections"}
DESCRIPTION = (
    "Real public Anki self-ratings, not verified answers or guitar outcomes. "
    "The L2 logistic model improves the temporal Brier point estimate relative to "
    "the card-history baseline. Its held-out point estimate is worse, and the "
    "paired 95% collection-bootstrap interval includes zero."
)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def extract(report):
    rows = []
    if report["synthetic"] or report["promotionEligible"]:
        raise ValueError("Expected the frozen, nonpromotable public-data benchmark")
    for split in ["temporal", "heldout"]:
        result = report["results"][split]
        history = result["models"]["card_history"]
        logistic = result["models"]["logistic"]
        paired = result["paired_differences"]["card_history"]
        difference = paired["candidate_minus_baseline"]["brier"]
        if (history["reviews"], history["collections"]) != (
            logistic["reviews"],
            logistic["collections"],
        ):
            raise ValueError("Model denominators differ")
        if abs(logistic["brier"] - history["brier"] - difference["estimate"]) > 1e-12:
            raise ValueError("Paired difference does not reconcile")
        rows.append(
            {
                "split": split,
                "reviews": history["reviews"],
                "collection_groups": history["collections"],
                "history_brier": history["brier"],
                "logistic_brier": logistic["brier"],
                "logistic_minus_history": difference["estimate"],
                "ci95_low": difference["low"],
                "ci95_high": difference["high"],
                "bootstrap_replicates": paired["replicates"],
            }
        )
    return rows


def style_axis(ax, left_labels):
    ax.set_ylim(-0.55, 1.55)
    ax.set_yticks([1, 0])
    ax.set_yticklabels(left_labels)
    ax.tick_params(axis="both", length=0, pad=10, colors=MUTED)
    ax.grid(axis="x", color=GRID, linewidth=0.8, zorder=0)
    for spine in ["left", "right", "top"]:
        ax.spines[spine].set_visible(False)
    ax.spines["bottom"].set_color(GRID)
    ax.set_axisbelow(True)


def panel_scores(ax, rows, mobile):
    labels = [
        f"{ROW_LABELS[row['split']]}\n{row['reviews']:,} reviews · {row['collection_groups']} groups"
        for row in rows
    ]
    style_axis(ax, labels if not mobile else ["", ""])
    ax.set_xlim(0.118, 0.166)
    ax.set_xticks([0.12, 0.13, 0.14, 0.15, 0.16])
    ax.xaxis.set_major_formatter(FuncFormatter(lambda value, _: f"{value:.2f}"))
    ax.set_xlabel("Mean Brier score · lower is better", color=INK, labelpad=12)
    ax.set_title(
        "A  Prediction error",
        loc="left",
        pad=22 if mobile else 46,
        color=INK,
        weight="bold",
    )
    for y, row in zip([1, 0], rows):
        h, c = row["history_brier"], row["logistic_brier"]
        ax.plot([h, c], [y, y], color="#AAB8BE", linewidth=2, zorder=2)
        ax.scatter(
            h,
            y,
            s=85,
            marker="o",
            color=HISTORY,
            edgecolor="white",
            linewidth=1,
            zorder=3,
        )
        ax.scatter(
            c,
            y,
            s=78,
            marker="s",
            color=LOGISTIC,
            edgecolor="white",
            linewidth=1,
            zorder=4,
        )
        ax.annotate(
            f"{h:.5f}",
            (h, y),
            xytext=(0, 17),
            textcoords="offset points",
            ha="center",
            color=HISTORY,
            weight="bold",
        )
        ax.annotate(
            f"{c:.5f}",
            (c, y),
            xytext=(0, -24),
            textcoords="offset points",
            ha="center",
            color=LOGISTIC,
            weight="bold",
        )
        if mobile:
            ax.text(
                0.0,
                y + 0.41,
                labels[1 - y],
                transform=ax.get_yaxis_transform(),
                color=INK,
                fontsize=11.3,
                linespacing=1.4,
            )


def panel_difference(ax, rows, mobile):
    style_axis(ax, ["", ""])
    ax.set_xlim(-0.0155, 0.0055)
    ax.set_xticks([-0.015, -0.010, -0.005, 0, 0.005])
    ax.xaxis.set_major_formatter(
        FuncFormatter(lambda value, _: "0" if value == 0 else f"{value:+.3f}")
    )
    ax.axvline(0, color="#62747D", linestyle=(0, (4, 4)), linewidth=1.2, zorder=2)
    ax.set_xlabel("Brier difference · negative favors logistic", color=INK, labelpad=12)
    ax.set_title(
        "B  Logistic − history",
        loc="left",
        pad=22 if mobile else 46,
        color=INK,
        weight="bold",
    )
    for y, row in zip([1, 0], rows):
        point = row["logistic_minus_history"]
        ax.errorbar(
            point,
            y,
            xerr=[[point - row["ci95_low"]], [row["ci95_high"] - point]],
            fmt="D",
            markersize=7,
            color=INK,
            ecolor=INK,
            elinewidth=2.2,
            capsize=5,
            capthick=1.5,
            zorder=3,
        )
        annotation = f"{point:+.5f}  [{row['ci95_low']:+.5f}, {row['ci95_high']:+.5f}]"
        ax.text(
            0.0,
            y - 0.31,
            annotation,
            transform=ax.get_yaxis_transform(),
            ha="left",
            color=INK,
            fontsize=10.8 if mobile else 11.5,
        )
        if mobile:
            ax.text(
                0.0,
                y + 0.33,
                ROW_LABELS[row["split"]],
                transform=ax.get_yaxis_transform(),
                color=INK,
                fontsize=11.3,
            )
    ax.text(
        0.0,
        1.04,
        "Paired 95% collection-bootstrap intervals",
        transform=ax.transAxes,
        color=MUTED,
        fontsize=10.5 if mobile else 11,
    )


def add_svg_accessibility(path, description):
    ET.register_namespace("", "http://www.w3.org/2000/svg")
    tree = ET.parse(path)
    root = tree.getroot()
    root.set("role", "img")
    root.set("aria-labelledby", "recall-title recall-description")
    title = ET.Element("{http://www.w3.org/2000/svg}title", {"id": "recall-title"})
    title.text = "Recall prediction on real flashcard reviews"
    desc = ET.Element("{http://www.w3.org/2000/svg}desc", {"id": "recall-description"})
    desc.text = description
    root.insert(0, desc)
    root.insert(0, title)
    tree.write(path, encoding="utf-8", xml_declaration=True)


def render(rows, output, mobile=False):
    plt.rcParams.update(
        {
            "font.family": "DejaVu Sans",
            "font.size": 12 if mobile else 12.5,
            "svg.fonttype": "path",
            "svg.hashsalt": "tabtopitch-recall-v1",
            "axes.unicode_minus": True,
            "savefig.facecolor": "white",
        }
    )
    if mobile:
        fig = plt.figure(figsize=(5.0, 11.5), facecolor="white")
        left = fig.add_axes([0.12, 0.55, 0.82, 0.22])
        right = fig.add_axes([0.12, 0.21, 0.82, 0.22])
        title = "Recall prediction on\nreal flashcard reviews"
        subtitle = "A temporal improvement;\nan uncertain held-out result."
        fig.text(
            0.08,
            0.96,
            title,
            color=INK,
            fontsize=20,
            weight="bold",
            va="top",
            linespacing=1.2,
        )
        fig.text(
            0.08, 0.875, subtitle, color=MUTED, fontsize=13, va="top", linespacing=1.4
        )
        legend_anchor = (0.08, 0.826)
        footer = (
            "Self-rated flashcard recall; no guitar outcomes.\n"
            "Equal weight per review. 1,000 bootstrap draws\n"
            "resample collections with the fitted model fixed.\n"
            "Only six held-out groups; no model promotion.\n\n"
            "Source: Open Spaced Repetition, FSRS dataset\n"
            "(MIT-declared)."
        )
        fig.text(
            0.08, 0.12, footer, color=MUTED, fontsize=9.7, va="top", linespacing=1.3
        )
    else:
        fig = plt.figure(figsize=(12.8, 6.5), facecolor="white")
        left = fig.add_axes([0.205, 0.29, 0.32, 0.40])
        right = fig.add_axes([0.625, 0.29, 0.335, 0.40])
        fig.text(
            0.045,
            0.94,
            "Recall prediction on real flashcard reviews",
            color=INK,
            fontsize=23,
            weight="bold",
            va="top",
        )
        fig.text(
            0.045,
            0.87,
            "A temporal improvement, but no clear advantage on held-out collections.",
            color=MUTED,
            fontsize=14,
            va="top",
        )
        legend_anchor = (0.195, 0.75)
        footer = (
            "Self-rated flashcard recall, not verified answers or guitar outcomes. Equal weight per review.\n"
            "Intervals: 1,000 paired collection-bootstrap draws, fitted model fixed. Six held-out groups limit precision; no model promotion.\n"
            "Source: Open Spaced Repetition, FSRS dataset (MIT-declared)."
        )
        fig.text(
            0.045, 0.125, footer, color=MUTED, fontsize=11.1, va="top", linespacing=1.6
        )
    panel_scores(left, rows, mobile)
    panel_difference(right, rows, mobile)
    handles = [
        Line2D(
            [0],
            [0],
            marker="o",
            color="none",
            markerfacecolor=HISTORY,
            markeredgecolor=HISTORY,
            markersize=8,
            label="Card history",
        ),
        Line2D(
            [0],
            [0],
            marker="s",
            color="none",
            markerfacecolor=LOGISTIC,
            markeredgecolor=LOGISTIC,
            markersize=7.5,
            label="L2 logistic",
        ),
    ]
    fig.legend(
        handles=handles,
        loc="center left",
        bbox_to_anchor=legend_anchor,
        frameon=False,
        ncol=2,
        handletextpad=0.5,
        columnspacing=1.5,
        fontsize=12,
    )
    stem = "recall-results-mobile" if mobile else "recall-results"
    png = output / f"{stem}.png"
    svg = output / f"{stem}.svg"
    fig.savefig(png, dpi=200, metadata={"Description": DESCRIPTION})
    fig.savefig(svg, metadata={"Date": None, "Description": DESCRIPTION})
    narrow = []
    if mobile:
        preview = output / "recall-results-mobile-390.png"
        fig.savefig(preview, dpi=78, metadata={"Description": DESCRIPTION})
        narrow.append(preview)
    plt.close(fig)
    add_svg_accessibility(svg, DESCRIPTION)
    return [png, svg, *narrow]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--report", required=True, type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    report_path = args.report.resolve()
    if sha(report_path) != EXPECTED_REPORT_SHA256:
        raise ValueError(
            "Unexpected report hash; review changed evidence before rendering"
        )
    output = args.output or report_path.parent / "figures"
    output.mkdir(parents=True, exist_ok=True)
    rows = extract(json.loads(report_path.read_text()))
    csv_path = output / "source-data.csv"
    with csv_path.open("w", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    files = render(rows, output) + render(rows, output, mobile=True)
    alt_path = output / "description.md"
    table = [
        "| Evaluation | Reviews | Groups | History Brier | Logistic Brier | Difference | 95% interval |",
        "| --- | ---: | ---: | ---: | ---: | ---: | --- |",
    ]
    for row in rows:
        table.append(
            f"| {ROW_LABELS[row['split']]} | {row['reviews']:,} | {row['collection_groups']} | {row['history_brier']:.5f} | {row['logistic_brier']:.5f} | {row['logistic_minus_history']:+.5f} | [{row['ci95_low']:+.5f}, {row['ci95_high']:+.5f}] |"
        )
    alt_path.write_text(
        "# Recall figure\n\n"
        + DESCRIPTION
        + "\n\n"
        + "\n".join(table)
        + "\n\nBrier is the mean squared difference between predicted recall probability and the binary self-rating. Lower is better. Differences subtract card-history Brier from logistic Brier on the same reviews. Intervals resample collection groups 1,000 times with the fitted model fixed; they omit training uncertainty. A collection is a learner proxy whose person-level independence is not established.\n"
        + "\nSource: Open Spaced Repetition, [FSRS dataset](https://huggingface.co/datasets/open-spaced-repetition/fsrs-dataset), MIT-declared revision `ae96575728d364265a75f2447fe7b7fa389ba96c`. Frozen report SHA-256: `"
        + EXPECTED_REPORT_SHA256
        + "`.\n"
    )
    contract = {
        "question": "Does the temporal predictive gain hold for collections excluded from fitting?",
        "audience": "Product and engineering readers comparing predictive research results",
        "takeaway": "Temporal Brier improves; the held-out point estimate worsens and its interval crosses zero.",
        "forbiddenClaims": [
            "Improved guitar learning",
            "Verified answer accuracy",
            "Causal teaching benefit",
            "Successful cloud publication",
            "Population-wide generalization",
        ],
        "evidence": {
            "sourceReport": "../report.json",
            "sha256": EXPECTED_REPORT_SHA256,
            "locators": [
                "results.temporal.models",
                "results.heldout.models",
                "results.*.paired_differences.card_history.candidate_minus_baseline.brier",
            ],
        },
        "metric": "Review-weighted mean Brier; no missing observations in displayed cohorts; five decimals for display only",
        "uncertainty": "Paired collection-cluster bootstrap percentile 95% intervals, 1000 draws, no model refit",
        "privacy": "Aggregate-only values; no source review or collection identifiers",
        "semantics": {
            "blueCircle": "Card-history baseline",
            "greenSquare": "L2 logistic candidate",
            "darkDiamondAndLine": "Paired difference and interval",
            "dashedZero": "Equal Brier",
        },
        "renderer": {
            "name": "Matplotlib",
            "version": matplotlib.__version__,
            "python": platform.python_version(),
        },
        "scriptSha256": sha(Path(__file__)),
        "sourceDataSha256": sha(csv_path),
        "files": {path.name: sha(path) for path in [csv_path, alt_path, *files]},
    }
    (output / "figure-manifest.json").write_text(json.dumps(contract, indent=2) + "\n")
    print(
        json.dumps(
            {
                "output": str(output),
                "files": [path.name for path in files],
                "sourceDataSha256": sha(csv_path),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
