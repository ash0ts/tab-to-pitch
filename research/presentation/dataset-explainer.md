# What these datasets actually tell us

TabToPitch needs evidence about two different things: the music a question refers to, and what a learner remembers. We found public datasets for each side separately. They do not connect a guitar practice session to that learner's later recall.

| | GuitarSet | Public FSRS dataset |
| --- | --- | --- |
| What was collected | Annotations of human guitar performances | Numeric logs of Anki flashcard reviews |
| One observation | A note event on a string, with onset, duration and fractional MIDI pitch | A review of one card at one time, including the user's recall rating |
| Grouping | Notes belong to recordings and performers | Reviews belong to cards and collection files; a file is an unverified learner proxy |
| Our bounded corpus | 360 recordings, six performers, 62,476 note events | 1,791,362 source rows in 24 deterministically selected collection files |
| What we derived | 46,215 eligible notes; pitch-name and exact-pitch-location questions | 358,818 eligible labels after card sampling and review exclusions; prior-history features for a recall predictor |
| Useful evidence | Does musical data become a traceable, gradeable question? Can the agent choose an eligible question without breaking its tool contract? | Can a small model predict later self-ratings from earlier history? Does that result transfer to collections excluded from fitting? |
| Missing evidence | Learner answers, retention, independent observed fingering and teaching outcomes | Guitar knowledge, card content, hint use, teaching assignments and independently graded answers |
| License and source | [GuitarSet v1.1.0](https://zenodo.org/records/3371780), CC BY 4.0 | [Open Spaced Repetition FSRS](https://huggingface.co/datasets/open-spaced-repetition/fsrs-dataset), MIT declared in its pinned dataset card |

The FSRS card has little narrative documentation. We do not assume that collection files represent distinct people or invent participant consent for a TabToPitch study. Raw reviews remain local; the published research bundle contains aggregate results, coefficients and provenance. This is the older FSRS dataset, not the newer Anki datasets with different terms.

## A real guitar note becomes a question

The example comes from the first B-string note in public recording `05_BN3-119-G_comp`. Its source annotation starts at **0.519 seconds**, lasts **203 milliseconds**, and has pitch **62.091 MIDI**, approximately **9.1 cents above D4**. MIDI is a numeric pitch scale: 62 is D4; a fractional value preserves the pitch estimate instead of pretending the performance was exactly on the equal-tempered grid.

The source calls this string index 4, counting from low E. TabToPitch calls it string 2, counting from high E. Preserving that mapping matters: sorting tuning pitches would erase the physical coordinates.

The note passes our experimental eligibility checks. It has 34 voiced contour frames, sufficient duration and a consistent pitch contour. These checks compare related annotations; they do not independently prove a correct transcription or technique. Under standard tuning, the app rounds to MIDI 62 and infers string 2, fret 3. No camera observed that fret.

The existing exercise generator produces these exact prompts:

> Name the concert pitch at string 2, fret 3. Include the octave.

The accepted answer is **D4**.

> Find another place for D4. Use a different string from string 2, fret 3.

All four accepted alternatives on the configured 24-fret neck are string 3/fret 7, string 4/fret 12, string 5/fret 17 and string 6/fret 22. The extraction script calls the actual exercise generator and grader, and verifies each position against tuning. These answers have the same octave, not merely the same letter name.

The figure shortens the prompts for readability; the companion source JSON retains the full generated questions. This adapter withholds interval and triad-role questions because the annotations do not supply validated spelling or articulation. It does not demonstrate Guitar Pro import, microphone assessment or observed fingering.

## What one flashcard review predicts

The FSRS figure is a **schematic**, not a sampled or invented learner history. It shows the information boundary used by the real benchmark.

Before a review, the model can use earlier ratings of that card, the number of prior reviews and lapses, the previous interval, and the time elapsed now. It predicts the probability that the upcoming self-rating will be above 1. The current rating and response duration cannot enter that review's predictors. After the response has been scored, its outcome can become history for a later review. Model parameters stay fixed during evaluation.

We fitted on 109,399 reviews. The temporal test contains 36,946 later reviews from collections that contributed fitting rows. The collection test contains 34,434 later reviews from six collections excluded from fitting. That second test is not cold start: earlier card history is available, while model fitting excludes those collections. Additional eligible rows are held-out pre-cutoff history or an explicitly exploratory diagnostic; the 358,818 eligible rows are not all independent test observations.

The logistic candidate improved temporal Brier score but had a worse held-out point estimate than the history baseline; the held-out uncertainty interval crossed zero. We retained it as a research artifact and did not deploy it. Even a clear flashcard prediction win would not show that its recommendations help a guitarist learn.

## The missing connection

GuitarSet supplies musical content without learner outcomes. FSRS supplies self-reported outcomes without guitar instruction. Combining their dashboards cannot fill that gap.

A useful next study needs guitar-specific questions, recorded hint and reveal states, first responses, later unassisted recall, and held-out neck positions or passages. To test teaching, practice policies must differ in a planned comparison and their later outcomes must be measured. The public datasets help test the machinery and expose failure modes before that study; they are not substitutes for it.

## Provenance and rendering

GuitarSet attribution: Qingyang Xi, Rachel M. Bittner, Johan Pauwels, Xuzhou Ye and Juan P. Bello, *GuitarSet: A Dataset for Guitar Transcription*, ISMIR 2018. The derived example rounds annotated pitch, infers standard-tuning positions and generates questions. The original source annotations are preserved. Full transformation rules and counts are in the [music-data guide](../music-data/README.md).

FSRS attribution: Open Spaced Repetition, revision `ae96575728d364265a75f2447fe7b7fa389ba96c`. Dataset selection, source limitations, feature construction and evaluation are in the [recall benchmark guide](../recall-benchmark/README.md).

The editable extractor and renderer live in this directory. Run from the app root:

```sh
npx tsx research/presentation/extract-dataset-examples.ts
uv --no-config run --no-project --python 3.12 --with matplotlib==3.11.1 \
  research/presentation/render-dataset-explainer.py \
  --data ../tabtopitch-real-data/presentation/dataset-examples.json
```

Exports live in the sibling `tabtopitch-real-data/presentation/` directory: PNG and SVG figures, native 390-pixel previews, the public example JSON, accessible descriptions and a figure manifest with hashes. These are derived figures, not application screenshots. Article placement follows visual review; original experiments and their results remain unchanged.
