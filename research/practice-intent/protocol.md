# Fretboard intent protocol v2

The decision is whether natural-language control would add a useful input method to the new note and triad explorer. The experiment tests semantic translation into those controls. It does not measure instruction quality, learning, recall, playing, or a live application's coaching.

Preparation v1 made no hosted calls. Its audit found that numeric string lists were mistakenly parsed as fret ranges, and “seventh fret” was mistaken for a seventh chord. The v1 preparation and source snapshot are retained. Version 2 fixes those two parser defects without changing the cases or expected labels.

## Inputs and controls

The cohort contains 24 authored synthetic requests: eight literal requests, eight paraphrases, four ambiguity/scope boundaries, and four adversarial requests or metadata injections. Twelve contrast groups preserve request relationships. They are finite developer-authored examples, not independent learners or a representative sample of guitarists. Expected controls were authored before model calls. The same author wrote the parser and expected controls; there is no independent teacher annotation. A later study needs real consented requests and separately reviewed labels.

Both arms see the same request and verified selected context: B2, a G major triad, standard six-string tuning, and no capo. Two cases include malicious synthetic metadata. Neither arm receives expected controls. Notes default to pitch-class matching across octaves; exact pitch must be requested. The selected note/root/quality cannot be changed by either arm. Triad generation uses the application engine and its maximum fretted span of four. Engine output is deterministic and remains the authority for pitches and positions.

The local arm is the documented regular-expression parser in parser.ts. It supports explicit octave terms, numeric fret ranges, physical string groups, and conventional inversion names. It asks for clarification on ambiguous ranges. The hosted arm is openai/gpt-oss-20b, pinned by requested identifier and recording returned model identifiers. One forced propose_exploration tool call translates each request; no second model turn, repair or fallback is added. Structured form controls define the target representation, rather than being counted as a language-model comparison arm.

## Freeze and allowance

The preparation step saves exact source, dataset, qualification, prompt, scorer, engine and dependency hashes plus source snapshots. Existing manifests and campaigns cannot be overwritten. Any evaluated source change requires a new campaign and retained prior receipt. Two distinct qualification requests precede the 24-case test cohort; the first exact, schema-valid qualification response admits the model. A second qualification is allowed only as a different predeclared case, never a retry. Both failures leave the test arm unstarted.

At most 26 completion requests and 40,000 accounted tokens are permitted. Completion output is capped at 1,024 tokens and the request deadline at 20 seconds. An unknown token count consumes UTF-8 request bytes plus the output cap plus 128 tokens as a conservative reservation. Known usage must reconcile input/output/total counts. Allowance is checked before each call, including qualification. Requests never retry automatically. Up to three read-only model discovery attempts can establish the persistent connection; every attempt is retained. A live private-project read and fresh model discovery precede inference.

Each started request is checkpointed before transmission and retains its HTTP/transport result, returned model, response identity, tool output, token evidence and wall latency. Process interruption leaves an active attempt; it cannot be resumed automatically. Invalid tools, timeouts, refusals and cap exhaustion remain failures. Missing or unstarted tasks are reported separately and cannot improve the headline denominator.

## Measures

Exact intent agreement is the primary outcome, using all 24 planned test cases per arm as denominator. Physical string order is ignored; every other control and the abstention decision must agree. Report category counts and paired wins/losses/shared failures. This is a finite synthetic regression result, without population intervals or teaching claims.

Schema validity, action agreement and engine safety are separate Boolean criteria over the same denominator. Usable exploration is reported only among the 18 expected exploration cases; it requires a valid schema, an explore decision, a safe engine execution and at least one result. Correct clarification is not a usable exploration. Conversely, an engine-valid proposal with the wrong range, octave mode or inversion still fails exact intent. Actual result counts are retained for inspection. The scorer contains no model-based judge.

Provider completion, unknown usage, request count, and original wall latency are infrastructure measures. Weave replay completion is not provider success. Replay makes no inference calls and has its own latency. Agent Lens stores actual Forge SDK conversations, turns, model and deterministic tool spans. W&B Models stores one measured aggregate point per experiment, not a training curve. Every published dataset, score and run requires server readback before it is called verified.

## Privacy and interpretation

The private project is wandb/tab-to-pitch-public-data-research, with separately named fretboard-intent-v2 objects. The publication allowlist is authored request/context/expected controls, recorded tool proposals, per-case criteria, aggregate metrics, hashes, model/version and trace identifiers. No imported song, filename, actual learner history, audio, credential, or raw public-dataset identifier crosses the boundary. Prior GuitarSet, recall and synthetic coaching runs remain unchanged.

This experimental harness is separate from the app's existing coach endpoint. A successful run does not mean cloud intent is integrated into the product, that the model teaches better, or that learned adaptation is ready. No model or policy is promoted. A weak result is a reason to retain structured controls and improve the experiment, not to rename the outcome.

## Reproduction

From the standalone app, run `npx tsx research/practice-intent/run.ts --prepare`, inspect the manifest and baseline, then run `npx tsx research/practice-intent/run.ts --run` with the existing authorized Forge credential. Results and frozen source snapshots go to the sibling `tabtopitch-real-data/practice-intent-v2/` directory. `--summarize` performs no network calls. Publication commands and readbacks are recorded beside that run.
