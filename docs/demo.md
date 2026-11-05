# Reproducible product demonstration

Start the app with `npm run dev`. Use a fresh browser profile, or export existing progress before deleting local data in Settings. Both bundled studies are original CC0 material. Record the displayed source and controls with each capture; older captures of **A shape, two meanings** do not show the progression studio.

## Move a progression

1. Open **Understand**, then **Open ii–V–I study**. **One progression, many places** contains Dm7–G7–Cmaj7–Am7 in C major. Select all four bars. Its authored symbols are confirmed; an imported song requires reviewing and confirming the suggested harmony.
2. Play the original with the shared transport. Slow it down and loop the passage. Note names are the default; **Octaves** adds register without changing the music or grading contract.
3. In the progression studio, choose **Move the voicing**, then **Frets 5–9**. Inspect the selected chord's diagram, degree labels, guitar bass, omitted tones, and next-chord targets. Step through the chords and available paths. The movement summary does not measure hand comfort.
4. Choose **Preview variation** and use the same tempo and loop. Compare **Original score** with the generated accompaniment. The bass track remains in place. The generated guitar uses block chords; it does not promise to retain the source strumming or articulations.
5. Choose **Apply & save**, then **Undo**. Open **Saved variations**, restore its controls, and preview the regenerated result. Export variations or progress before leaving if storage reports a failure. The imported score remains unchanged.
6. Open the advanced controls. Restrict strings or bass, compare fifth omission, and try an impossible region. The app must report no match without widening the constraints. A melody constraint is available only for an eligible ordinary monophonic source voice; this chordal lesson need not offer one.

## Connect position, color, and key

1. Select **Add color** and a supported extension for the current chord. Inspect which notes were added and omitted. Changing the number of voices can expose why a complete extended formula does not fit the chosen strings.
2. Select **Try a substitution** with C major confirmed. Compare one offered function-family alternative in the phrase. The label is a bounded tonal explanation, not a guarantee that the replacement suits the melody.
3. Show scale notes and next targets. Move to another neck region and confirm that the tonic and mode stay fixed. Select another mode explicitly and use **Hear the mode over its tonic**. Do not describe a change of fretboard position as a new mode.
4. Open the lesson through the fifths controls in another major key. Confirm that guitar and bass transpose together and the symbols change. Imported songs and saved variations retain their own source identity.

## Practice a connection

1. Select **Practice chord tones** from the progression studio. Answer a guided role question, then continue with revealing labels hidden. Try a wrong answer and a reveal. Both restore guidance and remain separate from unassisted answers.
2. Return to Understand and select **Find the next target**. The question asks for the next chord's third within the selected fret region. It accepts every matching location in any octave. The explorer can show sevenths too; that does not make them answers to a third question.
3. For a color change that adds exactly one pitch class and removes none, use **Compare the added tone**. Other changes do not produce this exercise.
4. Open **A shape, two meanings** for single-note exploration. Its first B at string 5/fret 2 is the third of G/B. Compare it with open string 2 using note-name matching, then select **Exact pitch** to restrict the search to B2. Start **Practice finding this note**. The exact-octave option is a separate advanced contract.
5. Inspect progress, export it, reload, and restore saved local material. Guided answers, reveals, interruptions, and self-reported playing remain separate. These demonstration interactions are not learner results. After a production build's initial cache finishes, repeat local playback and practice offline.

## Describe a variation

Open **Describe a variation** and use an explicit request such as a fret-range change. The local parser works without cloud access. Inspect the proposed controls, preview them, and apply only after listening. A validation pass establishes musical constraints; it does not establish that the request was interpreted correctly.

Cloud arrangement requires the deployment invitation flow, separate learner opt-in for request text and normalized musical context, and the operator's experimental arrangement flag. Follow [the server contract](../server/README.md#arrangement-previews). Keep it disabled for an unqualified model. A local fallback is not evidence of a successful Forge request.

The [arrangement study](../research/arrangement-agent/README.md) retains frozen authored cases, actual outputs, request correctness, musical checks, failures, and publication readback. The original native-tool campaign, its regression replay, and the fresh strict-JSON confirmation campaign are separate comparisons. Agent Lens shows execution steps; Weave stores recorded-output scoring. Neither turns a synthetic case into a learner outcome.

## Inspect the learned ranking study

The [voicing study](../research/voicing-ranking/README.md) asks whether a model ranks valid shapes closer to observed GuitarSet choices. Start with its dataset card, inspect one previous/next shape and candidate set, then compare held-out ranks. Review performer/progression membership before aggregate scores. Guitar-TECHS supplies a separate formula and inversion check, not preference labels.

Show only verified W&B run, artifact, and Registry identities from the publication receipt. Downloaded-model replay and hash checks are distinct from upload acknowledgement. The learned ranker remains outside the app's deterministic path search. In Understand, enable **Research: recorded-choice ordering** for a chord after the first, with stable source notes and matching voice count. It offers one-change candidate audition under the model's declared domain. The UI's bank of up to 64 candidates differs from the study enumeration, so do not label the UI with the offline recovery score. The retained [recall experiment](../research/recall-benchmark/README.md) concerns flashcard ratings and is not evidence for guitar voicing quality or learning.

## Teach with the workspace

1. Open the original four-chord study, then **Open teacher**. Keep the bass track selected as authored context. Ask why F has a different role in Dm7 and G7. The on-device guide offers a bounded explanation and a question; an enabled, qualified cloud configuration uses the free-form actor. The response labels which one ran.
2. Choose **Connect the chords** and ask “Show me how G7 resolves to Cmaj7.” Start the connection question. In standard tuning, answer `2:6 -> 2:5` for F4 to E4. An E in another octave must fail that exact movement even though a destination-only task would accept its pitch class.
3. During an unanswered question, check that the conversation and diagrams are absent. Choose **Ask for help**. The reveal is recorded before the explanation appears; a subsequent answer is not an unassisted first success.
4. Choose **Extensions and rootless chords**. Compare Dm7 and Dm9, then ask about a rootless Cmaj7. With four voices and the fifth retained, audition the E–G–B upper shape alone and with the authored C bass. The imported score stays unchanged.
5. For a cloud preview, inspect the proposed constraints and generated notes before **Apply & save**. Use **Undo**, then verify the same transport and backing tracks. A preview is not a saved variation.
6. Reload and inspect the retained conversation and progress backup. An interrupted question does not resume as a new untouched first attempt. Disable the backend or network and verify the local guide remains available.

The [teacher study](../research/teacher-agent/README.md) records actor, reviewer, and evaluator failures separately. Use the original study for captures. Show the response source and review status; do not present local fallback or a recorded replay as a live model success.
