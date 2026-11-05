# Research presentation artifacts

The [dataset explainer](dataset-explainer.md) connects public source records to the questions each experiment can answer. It contains the comparison, source attribution, privacy limits and reproduction commands.

`extract-dataset-examples.ts` verifies the frozen source hashes, extracts one public GuitarSet note, invokes the application exercise generator and grader, and reads aggregate FSRS results. It never reads raw flashcard reviews. `render-dataset-explainer.py` turns that source JSON into PNG/SVG diagrams and accessible descriptions using pinned Matplotlib. The flashcard sequence is explicitly schematic; it does not portray a real or fabricated learner.

Outputs go to the sibling `tabtopitch-real-data/presentation/` directory. The figure manifest records source, renderer and export hashes. Keep diagrams separate from actual application captures, and inspect both the full-size export and the native 390-pixel preview before article placement.

`audit-hosted-evidence.mjs --archive <preserved-data-directory> --output <new-receipt-directory>` compares the arrangement confirmation and listening 003 datasets, recorded outputs, criteria, and evaluation trees with their hosted versions. It requires the existing W&B credential through `WANDB_API_KEY`, refuses remote writes, makes no inference calls, and does not rerun a scorer under changed dependencies. The output must be outside the preserved archive. The [5 November audit](../../public/research/notebook/evidence-audit.md) records this check alongside Lens, Models, Registry, Table, and local archive checks. It is an evidence-integrity check, not a new qualification.
