# Music-teacher evaluation status

No hosted teacher or independent judge qualified. The third policy stopped after two inference deadlines; judge qualification stopped at its smoke cases. The held-out teacher cohort and judge holdout remain unexecuted. Existing arrangement-agent and voicing-ranking measurements remain in their original reports.

## Decision and latest evidence

Keep the hosted teacher experimental and disabled by default. The local teacher completed all 264 structural checks, but no qualified independent judge scored its explanations. No human teacher or learner has validated this version.

Run 004 made six inference requests: two 20B actor calls timed out; the 120B judge returned one incomplete response and one timeout; both 20B judge calls timed out. The frozen transport caps an individual HTTP call at 30 seconds inside the 60-second turn deadline. These failures do not estimate the third policy's musical or teaching quality. Its remaining ten development turns were not started, and the 120B actor was excluded rather than retried.

Run 004 accounted for **$0.00396155**, retaining full reservations for five calls with missing usage. Across all prior projects and these teacher runs, the audited total is **644 inference requests and $0.07257308**, below the original $25 ceiling. The three teacher runs contributed 40 requests and $0.01430305. The [complete 004 receipt (archived reference)](../../integration/historical-evidence.md#artifact-bf9a3b935c9d) preserves every call and the [frozen source manifest (archived reference)](../../integration/historical-evidence.md#artifact-97d3495b9e69) identifies the executed implementation.

The original 004 summary prints zero for missing judge holdout accuracy and a generic planned count of twelve for the excluded 120B actor. Those fields are reporting defects, not measurements: **judge accuracy is unavailable, and no 120B actor cases were scheduled in 004**. The current reporter represents these states as null and zero scheduled cases. The frozen receipt is preserved.

Agent Lens readback for 004 verified **12 of 12 spans across six conversations**, covering its actor and judge failures. [004 Lens receipt (archived reference)](../../integration/historical-evidence.md#artifact-0c16cc59aa92). Weave readback verified **270 recorded rows and 816 evaluation-tree calls** across six groups: the 264 local turns, two actor attempts, and four judge attempts. [004 Weave receipt (archived reference)](../../integration/historical-evidence.md#artifact-0ef12c5bdde7). Inspect the [20B judge failure evaluation](https://forge.coreweave.com/wandb/wandb/tab-to-pitch-public-data-research/weave/calls/01a18ee0-0b14-7987-b19e-efa0c4adbd7a) alongside the [local fixed-history evaluation](https://forge.coreweave.com/wandb/wandb/tab-to-pitch-public-data-research/weave/calls/01a18edd-d5da-704d-b9fd-3de881db03b9). Replayed local turns across runs are repeated observations, not additional learners or independent tasks.

## Qualification 002

The native-tool policy used source hash `6fa871b7c67ef797f1d2f8d1442627cdaa8fd83ca4fa76a67b2dece0becc59b3`. Both model identifiers appeared in live discovery. Thirty inference requests produced twenty observed teacher turns; this includes tool continuation calls and runtime critics, not thirty independent examples.

| Actor | Completed validated responses | Planned turns | Result                                                                                                                                         |
| ----- | ----------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 20B   | 2 of 8 observed               | 12            | Four invalid responses and two unavailable failures. The consecutive-unavailability rule stopped the remaining four cases.                     |
| 120B  | 0 of 12 observed              | 12            | Every HTTP 200 response had null content and null finish reason. The 13–23 returned completion tokens do not indicate output-limit exhaustion. |

Neither met the 11-of-12 development gate. The two completed responses passed application validation and the runtime critic; they have not established good teaching. One asked which chord was selected despite the selected span being present. Another explained a chord role before asking about it. That sequence can be legitimate supported practice, but cannot establish unassisted recall or retention.

The rejected 20B drafts include incorrect capo/note relationships, missing final fields, an empty final message, an invalid demonstration action, and a truncated runtime critic. Those drafts did not become accepted musical changes. Raw responses, executed tools, fallback responses, and failure categories remain in the [campaign (archived reference)](../../integration/historical-evidence.md#artifact-497b906a1ab9).

Conservative accounted inference was **$0.00782605**, including three responses with unknown usage reserved in full. The audited cumulative total after this run is **$0.06861153 across 638 requests**. Pricing-based accounting is not a billing invoice.

Agent Lens independently returned exactly **101 of 101 captured span identities across 20 conversations**. The [readback receipt (archived reference)](../../integration/historical-evidence.md#artifact-714faabf2ed0) includes the full membership. A separate backend probe used a mocked provider to test conversation identity across process restarts; its 24 spans are not included here.

Weave's first readback rejected the uploaded episode dataset: the SDK serialized repeated shared object identities as `[Circular]` in 120 of 144 episode-source rows. The local source and recorded responses remained intact. That failed publication is retained. The corrected publisher copies JSON values before upload, verifies the dataset before replay, and imports the campaign's frozen scorer so subsequent prompt changes cannot alter historical validation. Corrected hosted readback verified **284 rows and 857 evaluation-tree calls** across five groups, including all twenty observed actor qualification failures/successes. It matched source values, recorded outputs, criterion values, and exact call membership. [Verified receipt (archived reference)](../../integration/historical-evidence.md#artifact-a0626555cd45).

Open [20B qualification in Weave](https://forge.coreweave.com/wandb/wandb/tab-to-pitch-public-data-research/weave/calls/01a18edb-aa02-7e27-bc15-f6cbe913fd97) or the [rejected musical draft in Agent Lens](https://forge.coreweave.com/agent-lens/wandb/tab-to-pitch-public-data-research/conversations/a711a01c-00a5-430b-bf51-5e5db423294e). These private identities were read back through the service APIs; the rendered dashboard pages have not been visually rechecked for this release. Replay latency is not inference latency.

## Current freeze

The third policy's source hash is `dd4d667a13daf814dfff037cfc3d183a8d7ebbfcb71178f7bca018b2493c70d2`. It exposes initial verified facts and permits one schema-only repair within the existing four actor-call limit. It does not repair incorrect musical actions or bypass the critic. Its 20B qualification uses development block 1, which neither prior run used. The 120B actor remains excluded after its null-response failure. A prepared intermediate calibration snapshot made zero inference calls and was superseded before execution.

Before any independent judge calls, the evaluation added exact-quote and evidence-ID validation, explicit dialogue-probe scoring, and correct completed-judgment counts. This amendment precedes judge holdout access; it does not rewrite the earlier actor results. The frozen [protocol](protocol.json) records the calibration gates.

## Qualification 001

The frozen run used source hash `157317d09971adb6fed7a891ed1756b862db11c85d77f72d61df6be66fbadc3c` and fixture hash `3b51a84dd9a2b56e8a42b2c26f1f31bb9ca7f054b5eedb593ed504b51a006329`. Four completion requests ran, two for each model. The runner stopped each qualification after two responses classified unavailable. No test request was sent.

| Model        | Observed behavior                                                                                                                               | Result                                                 |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| GPT-OSS 20B  | Returned native `teaching_reference` and `inspect_music` calls instead of the exposed `teacher_step` wrapper. The strict decoder rejected them. | 0/2 usable development turns; no teacher-quality score |
| GPT-OSS 120B | Both requests returned HTTP 400: `Grammar error: Unimplemented keys: ["propertyNames"]`.                                                        | 0/2 usable development turns; provider-schema failure  |

The decoder reported the 20B protocol mismatches as unavailable. That classification is retained in the original receipts; later versions distinguish protocol rejection from network/model unavailability. These results motivated a provider-compatible schema and actual native tools, not a conclusion about either model's teaching ability.

Conservative accounted inference is **$0.00251545**, including full reservations for the two HTTP 400 responses with no usage. The cumulative audited ledger is **$0.06078548** across **608 historical and current requests**, including the earlier synthetic demonstration. This is pricing-based accounting, not a billing invoice.

The authored local policy completed 264 prepared turns: 96 fixed-history checkpoints, 24 boundaries, and 144 turns in 24 episodes. All passed structural checks. None received a qualified independent explanation judgment. This establishes local execution, not useful teaching or learning.

The [manifest (archived reference)](../../integration/historical-evidence.md#artifact-c2a6f0284914), [unaltered campaign (archived reference)](../../integration/historical-evidence.md#artifact-0a2712c885e9), and [summary (archived reference)](../../integration/historical-evidence.md#artifact-59fe2cdfa602) retain inputs, actual outputs, costs, and the source snapshot. Agent Lens readback verified **10 of 10 captured spans across four conversations**. [001 Lens receipt (archived reference)](../../integration/historical-evidence.md#artifact-bdd731d04b49). No Weave publication is claimed for 001.

## Corrections between frozen runs

After 001, an implementation audit added pre-inference rejection of help during an unassisted active question and rejected duplicate evidence/fact identities. The research adapter began carrying production exposure keys through scripted episodes; its first version retained dialogue but not those keys. These corrections were frozen in later runs. The old inputs and outputs remain unchanged.

Next, qualify a reliable provider transport and a judge before spending on the held-out comparison. Preserve this suite as regression evidence and reserve a fresh confirmation set for later policy changes. Human teacher review and a consented learner study remain separate later steps.
