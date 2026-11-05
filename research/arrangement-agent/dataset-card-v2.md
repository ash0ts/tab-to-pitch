# Arrangement requests v2: regression and confirmation

The v2 study contains two separately reported suites. The 96 original requests
across 24 musical contexts are a regression set: their failures informed the
transport and prompt revision. A new confirmation set contains 32 requests across
eight authored contexts, with a literal, paraphrase, boundary, and adversarial
request for each context. Two development cases are excluded from both suites.
All examples are synthetic and dedicated to CC0.

Each confirmation context contains three confirmed chords, compared with two in
the original set. The examples include DADGAD and half-step-down tuning, capo,
rootless voicings, ninths and thirteenths, explicit fret limits, and absent-melody
boundaries. `fresh-cases-v2.ts` defines the contexts and expected actions. No
GuitarSet recording, learner history, Hotelier score, filename, or lyric appears
in this dataset.

For example, `fresh-1-literal` supplies D → Gmaj7 → A7 in DADGAD and asks:
“Revoice at frets 2 to 9. Avoid open strings.” Its label requires those exact
limits while preserving the other controls. Both the deterministic parser and
one recorded 20B attempt produce a valid four-voice progression. A separate case
asks to reduce a dominant thirteenth to a ninth; its label requires quality `9`,
with the chord root supplied separately by the context.

Labels describe requested application controls. The deterministic music engine
derives candidate notes and movement heuristics. They are not performer-preferred
voicings, comfort ratings, or evidence of teaching success. A no-match result can
be correct when the interpreted controls are correct and the engine finds no
legal candidate. `usableProposal` is reported separately.

The same developer authored the cases, prompt, and parser. Four requests share
each musical context, and two model trials repeat each request. Therefore the
64 model attempts contain only 32 unique requests and eight unique contexts.
There are no learner outcomes. The fresh suite was frozen after separate
development qualification exposed a neutral-action prompt problem, but before
any scored v2 call. The original regression cases must not be described as a
fresh holdout.

The confirmation cases have SHA-256
`6325ff219bac9c5012cf7d49f57251a378d8d0e0c01076de2fc889e67ba38e08`.
The original regression cases retain SHA-256
`aecc7af2dd62746202589163f3b7a025d894ff32491ac1ce4099ad2af0c3f326`.
The final v2 source manifest has SHA-256
`43bd0df53315f4a0f7b8924ff4f816d5519f4a3c53ca21ca4c9110280eafed96`.
Frozen inputs, source copies, failed provider outputs, usage reservations, and
readback receipts live under the adjacent
`.context/tabtopitch-real-data/arrangement-agent-v2` evidence directory. See
[the protocol](protocol-v2.md) and [results](results.md) for release gates and
measured outcomes.
