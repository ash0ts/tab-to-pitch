# Arrangement agent results

The evaluated 20B arrangement agent did not meet the release gate. On the fresh
confirmation suite it interpreted 46 of 64 attempts correctly (71.875%); the
explicit-command parser handled 24 of the 32 unique requests (75%). Cloud
arrangements remain disabled by default. The local progression controls and
engine remain available.

These are authored application requests. They measure request interpretation,
constraint enforcement, and evidence handling. They do not measure player
learning, comfort, preferred voicings, or musical taste. The separate GuitarSet
ranking experiment has different data and outcomes.

## Separate experiment versions

| Suite                 | Unique requests / musical contexts | Parser correct | 20B correct | Accepted 20B responses | Usable requested proposals |
| --------------------- | ---------------------------------- | -------------- | ----------- | ---------------------- | -------------------------- |
| Original v1           | 96 / 24                            | 74/96          | 51/192      | 79/192                 | 10/192                     |
| v2 regression         | 96 / 24                            | 74/96          | 105/192     | 165/192                | 19/192                     |
| v2 fresh confirmation | 32 / 8                             | 24/32          | 46/64       | 56/64                  | 14/64                      |

The model runs each request twice; those repetitions do not add independent
requests or contexts. Accepted responses include clarification, rejection, and
no-match outcomes. Every accepted response passed the deterministic note, source,
melody, and fact-reference checks. That safety result does not make an unnecessary
rejection a correct interpretation. Failed calls remain in each denominator.

The v1 transport required native function calls. Some provider responses instead
contained JSON actions in message content, which v1 rejected. V2 accepts one
complete JSON action with the same strict schema, rejects duplicate keys and
surrounding prose, and executes the same engine tools. It also changes the prompt,
raises the completion cap from 768 to 4,096 tokens, and uses a TLS 1.2 research
transport with four concurrent attempts. The regression improvement cannot be
attributed to any single change. The original results remain unchanged.

The 120B deployment failed both original development qualification attempts. The
larger-cap v2 qualification also failed both 30-second deadlines. It has no scored
evaluation arm; qualification failures are retained rather than represented as
zero-percent scores on requests that were never sent.

## Fresh confirmation detail

| Request category | Parser | 20B, two trials |
| ---------------- | ------ | --------------- |
| Literal          | 8/8    | 9/16            |
| Paraphrase       | 0/8    | 5/16            |
| Boundary         | 8/8    | 16/16           |
| Adversarial      | 8/8    | 16/16           |

Comparing each model attempt with the repeated parser result yields 41 attempts
where both were correct, five model-only successes, seven parser-only successes,
and 11 where neither was correct. Half the requests are boundary or adversarial
cases, so overall accuracy depends on this authored mix. Natural request
prevalence is unknown.

Fresh attempts had median latency 2.60 seconds and 95th-percentile latency 14.31
seconds. Eight responses failed the strict protocol or action schema; ten were
accepted but interpreted the request incorrectly. There were no fresh transport
failures with unknown token usage. The original-regression v2 arm retained 24
invalid responses and three unavailable attempts.

A successful example is `fresh-1-literal`: D → Gmaj7 → A7 in DADGAD, with frets
2–9 and open strings forbidden. The actual 20B response selected engine candidate
`harmony-v1:variation:d2a8578e`. Its supplied fact reports three events, three
retained common tones, and movement cost 9.32, explicitly described as a geometric
heuristic. The parser also succeeded. The recorded request, response, parser
output, versions, and trace ID are in `demonstration-record.json`; the application
can replay this recorded result without making an inference request or enabling
an unqualified live feature.

Two retained failures explain why the gate matters. For `fresh-3-literal`,
“Revoice rootless using 3 voices,” the model returned a schema-valid unsupported
rejection even though the engine supports the controls. For
`fresh-8-paraphrase`, reducing A13 to a dominant ninth produced `targetQuality:
"A9"`; the interface requires quality `"9"` because the root is already known.
The schema rejected the response. Both examples need interface work before a new
version is qualified; they do not justify changing the frozen scores.

## Spending and provenance

All paid inference in this work totals 528 completion requests: 226 in v1, five
in a retained failed v2 development run, and 297 in final v2. The conservative
estimated total is **$0.05436667**, below the authorized $25 ceiling. This includes
24 requests with unavailable usage charged at their reserved maximum. Known
usage totals 640,541 tokens; accounted usage including those reservations totals
783,709 tokens. This is a pricing-based estimate, not a reconciled billing invoice.
The inference rates were recorded in the frozen manifests and every request
reserved its maximum cost before transmission.

The final v2 source manifest is
`43bd0df53315f4a0f7b8924ff4f816d5519f4a3c53ca21ca4c9110280eafed96`.
The confirmation case checksum is
`6325ff219bac9c5012cf7d49f57251a378d8d0e0c01076de2fc889e67ba38e08`.
The [dataset card](dataset-card-v2.md) explains labels, context counts, licensing,
and exclusions. Parent campaign evidence retains every call. Derived suite
ledgers exclude qualification costs to avoid double-counting. A metadata
reconciliation receipt preserves the runner’s inherited display counts and the
original aggregate ledger; it changes no case, response, or score.

## Forge readback

The existing private research project is
`wandb/tab-to-pitch-public-data-research`. V1 is reconciled across Agent Lens,
Weave, and Models: 196 conversations, 733 spans, three evaluations with 867 calls
and 2,592 criterion values, and a finished Models run with matching history and
summary. V2 is also reconciled: 260 conversations and 1,588 spans in the completed
campaign, plus four conversations and 17 spans from the retained failed
development qualification. The fresh Weave suite contains three evaluations,
291 calls, and 864 criterion values; the regression suite contains three
evaluations, 867 calls, and 2,592 criterion values. Both Models runs are finished
with matching history and summaries. Receipts are recorded alongside each suite.

Weave evaluations replay the recorded provider outputs through the deterministic
checker. They make no additional inference calls. Each published dataset row,
model output, scorer input, criterion result, aggregate, and call tree is read back
and compared with the local evidence. Agent Lens receives captured Forge SDK
spans for actual model calls and tool executions, including rejected actions and
qualification failures. It is not inferred from ordinary Weave calls.
