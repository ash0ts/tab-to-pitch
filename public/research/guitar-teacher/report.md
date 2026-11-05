# Can the teacher deliver something you can play?

Measured 5 November 2026. [Inspect all cases](./index.html) · [Frozen protocol](./protocol.md) · [Displayed data](./results.json) · [Full response evidence](./evidence.json).

The current teacher delivered **11/144** accepted musical demonstrations. The evidence-first prompt delivered **35/144**. The independent engine control produced **72/72** valid artifacts when called directly. These results do not qualify the teacher for reliable musical instruction.

## What we actually tested

Two requests per GuitarSet passage: show a specified chord role in a selected fretboard region; prepare the same three-chord accompaniment in another region. Hosted conditions use the same Forge `openai/gpt-oss-20b`, tools, factual reviewer, four actor calls, eight tools and 60-second turn deadline. The inherited transport also has a 30-second per-request deadline. Temperature is zero, actor allowance is 4,096 tokens and critic allowance is 2,048. The evidence-first prompt adds demonstration and output-format guidance; this is a prompt package, not a factorial attribution to one instruction.

There are 36 evaluation recordings, 72 requests, two hosted trials per request/condition, and one deterministic local response per request: **288 actual hosted turns and 72 local responses**. Forty-eight separate factual-review probes test the reviewer. Failed and unavailable results remain in the denominators; no cases were replaced by successful retries. A bounded in-turn repair is part of the unchanged production agent.

Six development recordings and their histories are separate from evaluation. Development run 001 exposed a runner bug in handling model-discovery GETs, so its actors never reached inference. Run 002 corrected that harness. Run 003 added an instruction to keep numeric frets and ranges in diagrams rather than prose. All three runs are retained and accounted for. No production prompt was changed, and no evaluated prompt was tuned on held-out results.

## Dataset context

[GuitarSet 1.1.0](https://zenodo.org/records/3371780) provides recorded acoustic guitar, string-specific note annotations, intended lead-sheet chords and performed chord labels. The latter are partly derived from the notes. We use intended chords for the requested accompaniment and a stable annotated chord tone to anchor the role request; we do not claim the intended chord exactly describes every performed note. Inferred fret coordinates are not observations of hand technique. Learner requests and history are authored. No recording audio reaches the teacher.

Development uses performers 00/01 and progression family 1. Evaluation uses performers 02/03/04 and families 2/3, with six recordings in every performer/family cell. All selected recordings are accompaniment. Three publisher-reported erroneous recordings and the previous live-coach cohort are excluded. Development contains major-triad passages; evaluation also contains minor, dominant-seventh and half-diminished material. The split therefore includes a harmony-domain shift.

The corpus appeared in earlier voicing research. “Held out” means disjoint from this prompt development, not globally unseen; pretraining overlap is unknown. [Checksums, exclusions and attribution](./dataset-manifest.json) identify the derived dataset. GuitarSet: Xi, Bittner, Pauwels, Ye and Bello, ISMIR 2018; CC BY 4.0.

## Artifact delivery

| Policy | Chord role | Progression | Primary total | Including fallback artifacts | Median / p95 turn |
| --- | ---: | ---: | ---: | ---: | ---: |
| local | 0/36 | 0/36 | 0/72 | 0/72 | 0.0s / 0.0s |
| current | 2/72 | 9/72 | 11/144 | 78/144 | 12.3s / 30.1s |
| evidence-first | 13/72 | 22/72 | 35/144 | 100/144 | 13.2s / 28.4s |

Hosted primary success requires an accepted reply containing an independently valid requested artifact, with no unrequested quiz or invalid structured claim. Local primary success requires that artifact without a quiz. Every valid constrained fingering is accepted. The checker uses independent note arithmetic and chord tables, and verifies highlight coverage, coordinates, required tones, voice count, distinct strings, fret span and harmonic timing. Deliberate mutations test the checker.

The paired recording-macro difference is **16.7 percentage points**, with a conditional recording-bootstrap 95% interval of **9.0 to 24.3 points**. Paired checkpoint/trial outcomes: {"neither": 101, "current-only": 8, "treatment-only": 32, "both": 3}. Only three performers and two families contribute; shared lead sheets and small group counts limit inference. The bootstrap does not remove those dependencies.

Failures by runtime category:

- current: invalid-response: 114, critic-rejected: 5, unavailable: 14.
- evidence-first: invalid-response: 86, unavailable: 8, critic-rejected: 15.

A fallback can preserve a valid tool-generated variation even when the model's final message fails. That is useful product behavior, but it is not an accepted actor response. Generic explanations, an unrequested quiz, and inspection alone do not fulfill these requests. Free-form explanation quality has no qualified score here.

The current teacher called tools as follows: {"explore_voicings": 68, "demonstrate": 15}. The revised prompt called: {"explore_voicings": 74, "demonstrate": 24, "inspect_music": 1}. It rarely followed its requested inspection sequence. The measured difference belongs to this prompt package; it cannot be attributed specifically to evidence inspection.

## Reviewer diagnostic

Six roots × major/minor seventh × four statement conditions. Labels and note arithmetic are authored independently of the actor.

| Condition | Correct classifications | Unavailable |
| --- | ---: | ---: |
| correct | 12/12 | 0 |
| wrong-role | 12/12 | 0 |
| wrong-position | 12/12 | 0 |
| invented-playing | 12/12 | 0 |

The reviewer classified 48/48 correctly, rejected 36/36 unsupported claims and accepted 12/12 correct claims. This diagnostic is narrower than the previous failed qualification suite and does not replace it. Actor and runtime reviewer share the same model family, so correlated errors remain possible.

## The local policy also needs work

A separate development-motivated deterministic diagnostic reused the 72 requests. The original wording “not a quiz” or “not take a quiz” produced 72/72 unwanted quizzes. The equivalent wording “no quiz” produced 0/72, while delivering only 20/72 requested artifacts. The local policy's language predicates and limited action selection are concrete product gaps. [All variants and outputs](./local-choice.json) are retained. This is a post-development diagnostic, not another held-out efficacy result.

## What should change next

1. Carry an explicit learner choice to explore or practice into action eligibility. A request to stop quizzing should not depend on one regex phrase.
2. Fix the overly broad prose-coordinate guard while preserving independently validated note-position demonstrations. A harmless fret-range description and a false pitch coordinate need different handling.
3. Reduce output-protocol ambiguity and expose task-specific action schemas. Re-evaluate any prompt or provider change on a new frozen cohort; this study does not support promoting the prompt variant.
4. Test the critic on retained subtle errors and valid rejected claims. Obvious wrong-note fixtures alone do not establish reliable factual review.
5. After reliable task delivery, evaluate whether a learner can complete an independent musical attempt, retain it and transfer it. This study contains no learner-effectiveness result.

## Forge evidence and cost

- [local Weave replay](https://forge.coreweave.com/wandb/wandb/tab-to-pitch-public-data-research/weave/calls/01a1adaf-2ff5-78ec-b36f-132cbaff1927)
- [current Weave replay](https://forge.coreweave.com/wandb/wandb/tab-to-pitch-public-data-research/weave/calls/01a1adb1-b605-7fd3-becd-86f7023e7611)
- [evidence-first Weave replay](https://forge.coreweave.com/wandb/wandb/tab-to-pitch-public-data-research/weave/calls/01a1adb1-e38e-7fcd-a487-139c446bdd8e)
- [critic Weave replay](https://forge.coreweave.com/wandb/wandb/tab-to-pitch-public-data-research/weave/calls/01a1adb2-118c-7483-b099-e6ab7274e6b3)
- [W&B case comparison Table](https://forge.coreweave.com/wandb/wandb/tab-to-pitch-public-data-research/runs/guitar-teacher-evaluation-001-comparison)

Remote readback matched **336 conversations, 2520 Lens spans, 408 Weave outputs and scores, and 408 Table rows**. Source outputs and criteria were compared row by row; replay made no actor calls. Execution latency is distinct from replay latency. Lens model spans retain outputs and usage; full request bodies have hashes, while prompt text and bounded context live in the frozen manifest and Weave rows.

Evaluation used **628 actual actor/critic calls**, accounted at **$0.14922** using the checked list prices. 12 calls have unknown usage; any such call retains its worst-case reservation. Development used **129 calls / $0.02409**. All calls use the existing atomic shared ledger and original cumulative authorization; spending is not reset. [Pricing](https://coreweave.com/forge-pricing/inference-agents) was checked before execution.

The first local replay end was rejected before the server could read its acknowledged start. Independent readback found all 216 child calls complete. The retained aggregate then closed that existing root; its end timestamp records publication repair, not inference or replay execution duration. No actor call or evaluation was repeated. All four evaluations subsequently reconciled exact outputs and scores.

The Table summary became visible after a publication delay. Independent readback compared all flattened metrics and the downloaded file hash with the original measured values. No upload or inference was repeated.

No model was trained or promoted for this comparison. Models and Registry retain the actual earlier voicing-model lineage; prompt changes are evaluations, not training runs. Dashboards remain private. Public artifacts contain licensed music facts and authored requests, never private recordings or learner histories.

The captured source manifest is `43141f54d802e5af6226e8c223efbeb68e4c4833dcba05bfebc91fa16704984c`. Runtime base revision: `af6e09434d4cc8e00dd981767787482e76cacc29`. Full executed file hashes and prompt text are in `results.json`. Any later cleanup is separate from that execution snapshot.
