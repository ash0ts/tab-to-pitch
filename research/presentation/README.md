# Research presentation artifacts

The [dataset explainer](dataset-explainer.md) connects public source records to the questions each experiment can answer. It contains the comparison, source attribution, privacy limits and reproduction commands.

`extract-dataset-examples.ts` verifies the frozen source hashes, extracts one public GuitarSet note, invokes the application exercise generator and grader, and reads aggregate FSRS results. It never reads raw flashcard reviews. `render-dataset-explainer.py` turns that source JSON into PNG/SVG diagrams and accessible descriptions using pinned Matplotlib. The flashcard sequence is explicitly schematic; it does not portray a real or fabricated learner.

Outputs go to the sibling `tabtopitch-real-data/presentation/` directory. The figure manifest records source, renderer and export hashes. Keep diagrams separate from actual application captures, and inspect both the full-size export and the native 390-pixel preview before article placement.
