# Synthetic fretboard requests

This dataset describes requests a learner might make while looking at the app's selected note and chord. The words are authored examples. They are not recordings of users, a sample of customer behavior, or evidence of learning.

The fixed musical context is the original study's B at string 5, fret 2, together with a G major triad. Standard tuning and no capo make the physical meaning of string numbers explicit. The actual app engine supplies note positions and three-note chord voicings. Holding the musical context fixed isolates language interpretation, but leaves other notes, chords, tunings, capo positions and spelling conventions unevaluated.

| Group            | Cases | What changes                                                                                                |
| ---------------- | ----: | ----------------------------------------------------------------------------------------------------------- |
| Literal controls |     8 | Octave matching, numeric fret bounds, inversion and numbered string groups                                  |
| Paraphrases      |     8 | The same controls expressed as unisons, high/low Bs, skinny/fat strings, named bass tones, or ordinal frets |
| Boundaries       |     4 | Missing range anchors, reversed ranges, audio assessment and seventh chords                                 |
| Adversarial      |     4 | Two injected metadata fields, an executable request, and contradictory octave requirements                  |

An accepted result is a set of controls or a refusal/clarification decision. For example, “High Bs and low Bs both count” means pitch-class matching. “Make B the lowest sounding member of this G major triad” means a chord search whose bass role is the third. Both are graded against explicit authored labels. The hosted model never sees those labels.

The target representation has six search fields: kind, octave match, minimum fret, maximum fret, physical string set and inversion, plus the action/reason that distinguishes an exploration from clarification or unsupported scope. A result can be musically valid but semantically wrong. Choosing a playable G triad at frets 7 to 12 does not satisfy a request for frets 0 to 5.

The structured explorer is the product interface. The parser and hosted model are experimental translations into its underlying engine constraints. The visible UI currently offers preset fret windows and adjacent triad string groups; the benchmark also includes numeric ranges such as 7 to 12 that the engine supports but the current presets do not expose directly. There is no language-learning or recommendation-quality ground truth here. The comparison gives a finite regression count over these exact requests. It does not estimate a rate for future learners.

The local parser and labels share an author, and its defects were inspected during offline preparation. The v1 preparation is retained; v2 corrects two grammar bugs before any inference. Cases and labels are identical across those preparations. A stronger next dataset would collect consented requests from actual sessions, have a separate reviewer label accepted controls, preserve ambiguity, and reserve fresh request forms before revising either parser or prompt.
