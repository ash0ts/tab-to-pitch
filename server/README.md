# Cloud coach service

The Fastify service serves the built app and an optional invitation-only coach.
The browser owns scores, audio, answers, and practice history. This service
stores invitation hashes, session hashes, and token accounting. It does not store
tabs, audio, learner answers, or conversation transcripts in Postgres.

## Enable cloud coaching

Set `CLOUD_COACH_ENABLED=true`, `PUBLIC_ORIGIN`, `DATABASE_URL`, `SESSION_SECRET`
(at least 32 characters), `WANDB_API_KEY`, and `FORGE_PROJECT` (`entity/project`).
The public origin must use HTTPS in production. Missing configuration disables
cloud coaching; it never substitutes an in-memory database. Use `HOST=0.0.0.0`
inside a deployment container. The default host is loopback.

Run `npm run db:migrate` before starting a new version. Migrations acquire a
Postgres advisory lock and commit each file once. Create an invitation with
`npm run invite -- --days 7 --tokens 100000`. That command prints the secret token
once. The database retains its SHA-256 hash. Share the token through the intended
private channel, not a URL query parameter.

## API

| Route                            | Contract                                                                                        |
| -------------------------------- | ----------------------------------------------------------------------------------------------- |
| `GET /api/health`                | Liveness and whether cloud configuration is enabled. This is not a provider availability check. |
| `POST /api/invitations/exchange` | JSON `{invitation}`; issues a session cookie after checking expiry.                             |
| `GET /api/session`               | Authentication state, cloud configuration state, and session expiry.                            |
| `DELETE /api/session`            | Revokes the database session and clears its cookie.                                             |
| `POST /api/coach/next`           | Validated `CoachRequest`; returns a validated proposal or the local baseline.                   |

Writes require an exact `Origin` match, including percent-encoded API paths.
The development origin defaults to `http://127.0.0.1:5173`, matching `npm run dev`.
Production cookies are `__Host-` scoped,
Secure, HttpOnly, and SameSite=Strict. Sessions last at most a day and never
outlast their invitation. Tokens are random; session hashes also use the server
secret. Keep the secret stable across server restarts and replicas.

The shared schema in `src/shared/coach.ts` rejects unknown fields. The service
replaces candidate IDs with temporary aliases before inference. Only drill
kinds, numeric evidence aggregates, and numeric phrase features reach the model.
It receives no score IDs, titles, note IDs, raw tabs, audio, or user-written text.

## Bounded agent and accounting

The agent checks that the configured model appears in `/models`, then makes at
most two chat completions: inspect practice evidence and choose one eligible
candidate. The provider must return the requested function-call shape. Unsupported
tools, invalid output, rate limits, and a 20-second deadline return the local
baseline. `FORGE_MODEL` defaults to `openai/gpt-oss-20b`; catalog membership alone
does not establish tool support. A successful two-call interaction verifies it.

The model supplies only a candidate alias. The service copies the candidate's
note references, tempo, and loop, and generates the explanation and evidence
references from validated counts. It never displays model-written factual claims.

Every response includes strict `versions` metadata: the selection policy,
prompt revision, and model identifier. Local responses identify the deterministic
baseline and use `prompt: "none"`. Cloud responses identify the configured
catalog model; this is a requested model ID, not a provider-guaranteed immutable
revision. The browser rejects unknown policy/prompt revisions and any response
whose metadata does not match its source. Agent Lens and replay artifacts use
the same version constants. Drill support still comes from the local scheduler.

Before inference, a transaction reserves a conservative token envelope against
both the invitation and the global UTC-day budget. `FORGE_DAILY_TOKEN_LIMIT`
defaults to 1,000,000. Settlements release unused tokens when usage includes
consistent, nonnegative prompt, completion, and total counts. Timeouts or missing
or malformed usage consume the reservation. A crash or failed settlement
retains the reservation, so accounting fails closed. Duplicate request IDs never
start a second model run. These are token limits, not dollar spending caps.

## Forge observability and evaluation

`FORGE_TRACING_ENABLED=true` enables the Forge SDK's Agent Lens conversation,
turn, model, and tool spans. Manual instrumentation records tool names, model
identity, token usage, version tags, and a random conversation ID. It deliberately
omits learner evidence, model messages, reasoning, identifiers, and credentials.
Turn spans mark rejected attempts as failed, including protocol validation that
rejects an otherwise successful model response. Error messages are fixed strings;
the original exception and its content are never sent to Agent Lens.
The app still needs to disclose that cloud coaching sends aggregate practice
context to inference. Tracing is off by default.

`npx tsx evals/replay.ts` writes a local synthetic contract-regression artifact.
`--publish` sends those authored fixtures and recorded results to Weave.
`--live` runs the bounded agent against Forge and consumes inference credits.
Neither synthetic tests nor those comparisons establish improvement for learners.

## Database recovery

The backup scripts require PostgreSQL client tools on `PATH`. Run
`npx tsx scripts/backup.ts /private/path/backup.dump` with `DATABASE_URL`.
The output contains authentication metadata and must stay private. Restore into
an isolated database first using
`npx tsx scripts/restore.ts /private/path/backup.dump --confirm-restore`, with
`DATABASE_URL` pointing at that database. Restore replaces its schema inside one
transaction. Run migrations and verify session and token records before using
the recovered database. Credentials pass through child environment variables,
not command arguments. The scripts never print database URLs or tool stderr.
The backup command refuses an existing output path and removes its partial file
if `pg_dump` fails.

The optional Postgres integration suite uses `TEST_DATABASE_URL` and applies
migrations. Point it only at an isolated test database. The default suite uses
an explicitly injected test repository; production startup does not import it.

## Arrangement previews

`POST /api/arrangements/propose` accepts the strict versioned contract in
`src/shared/arrangements.ts`. It uses the same invitation session, origin checks,
persistent token reservations, and duplicate request protection as the recall
coach. The route also rechecks revocation after generation. The existing numeric
recall endpoint remains unchanged.

The new boundary accepts request text (at most 600 characters), normalized chord
symbols and durations, optional confirmed key and monophonic melody, physical
string tuning and capo, and bounded voicing controls. It accepts no source files,
filenames, lyrics, source note IDs, or history. Opt-in disclosure must describe
request text and normalized musical context reaching Forge. Imported metadata
must never be concatenated into the request. Runtime traces contain operation
names, usage, and version tags; the separate research campaign explicitly traces
authored synthetic requests and results.

The agent makes at most two completions: interpret controls, then select from
engine-generated variations and cite supplied fact IDs. A 30-second deadline,
4,096-token completion cap, and 16,384-byte request limit bound generation. A
conservative 41,216-token envelope is reserved before inference. Unknown usage
retains that reservation. The browser recomputes the candidate and explanation
from the current context and rejects stale context versions, invented candidates,
and invented facts. The application applies a proposal only after a learner
previews it. Local controls and the explicit-command parser work without cloud.

The engine preserves confirmed harmony for a move. Color changes are restricted
to supported chord families. Substitutions require an explicit major key and
matching conventional major-key function family. These substitutions are
preview experiments: melody, bass, and phrase context still matter. Missing melody or unconfirmed harmony asks for clarification.
An empty candidate search does not relax the requested controls.

The campaign protocol, cases, receipts, and release qualification live in
`research/arrangement-agent/`. A model catalog entry is not qualification. Keep
arrangement cloud access experimental until the complete frozen arm meets its
request-correctness and validity gates. It is off by default;
`ARRANGEMENT_AGENT_ENABLED=true` is a separate operator opt-in from the existing
recall coach. Do not enable it for an unqualified deployment model.

The current experimental arrangement transport is `arrangement-tools-v2-json`.
It accepts a native function call or a complete JSON action object, then applies
the same strict schema and deterministic checks. It rejects prose, code fences,
duplicate keys, and partial completions. Traces distinguish `native-tool` from
`strict-json-action`; the latter means the coordinator parsed an action, not that
the provider emitted a native tool call. Its fresh confirmation study remains
separate from the original strict-tool result and the regression replay.

## Music teacher

`POST /api/teacher/next` accepts `teacher-v1` and listening-aware `teacher-v2` from `src/shared/teacher.ts`.
`TEACHER_AGENT_ENABLED=true` is a separate operator flag. It defaults to false;
invited experimental use can enable it before qualification. `TEACHER_QUALIFICATION`
reports qualification separately and defaults to `unqualified`. `GET /api/health`
exposes both `teacherEnabled` and `teacherQualification`. Authentication, exact-origin
checks, invitation revocation, duplicate request protection, and persistent token
reservations are shared with the existing endpoints.

The actor controls the teaching sequence. Up to four actor calls can request eight
deterministic tools in total. The tools inspect confirmed harmony and learner
evidence, retrieve teaching references, generate legal voicings, prepare reversible
demonstrations, create eligible questions, find review candidates, and query the
optional recorded-choice ranker. They do not call another language model. Tool
arguments, musical claims, actions, and response freshness are checked by the
shared engine. Generated questions do not send their grading key to inference.

The `teacher-tools-v5-listening` prompt starts with verified selected-note, chord,
and instrument facts. It allows one format repair when a complete final object
omits required arrays or has an empty message. That repair consumes another of
the four actor calls; the rejected draft remains in the call receipts. The
replacement still passes musical validation and the independent critic. Invalid
actions, unsupported claims, provider errors, and empty provider responses do not
trigger this repair. It does not extend the deadline or change constraints.

One separate critic call checks the entire proposed prose, including claims the
actor omitted from its structured claim list. The critic checks musical support,
invented observations about playing, and answer leakage. It does not require the
actor to follow the authored lesson sequence. `TEACHER_CRITIC_MODEL` defaults to
`FORGE_MODEL`; configure a different model only after qualification. A same-model
critic has correlated error risk. Critic rejection or failure withholds the actor's
prose and returns the authored fallback with any independently validated tool
actions. The result records a fallback reason and withheld review, so fallback
does not count as a successful agent turn.

The whole turn has a 60-second deadline, including the critic. Actor completion
caps are 4,096 tokens; the critic cap is 2,048. Each serialized provider request is
limited to 32,768 UTF-8 bytes. The HTTP route has the same body limit. The service
reserves 182,912 tokens before inference for all five potential calls, including
message framing. Missing usage consumes that envelope. Known usage settles both
actor and critic together. This conservative token reservation is distinct from
the research campaign's dollar ceiling.

Create a new teacher invitation with `npm run invite -- --teacher`; it defaults to
2,000,000 tokens. Explicit `--tokens` values must cover at least one teacher turn.
Existing invitations keep their original allowances, including the ordinary
100,000-token invitation default. Re-exchanging an invitation does not change its
allowance or reset usage.

Teacher consent must cover request text, bounded recent conversation and recall
evidence, and normalized musical context. The strict request rejects filenames,
lyrics, raw score data, and arbitrary metadata. Production Agent Lens traces keep
operation names, model identity, protocol versions, latency, call counts, usage,
reservation totals, and fixed failure categories. They omit request text, model
prose, tool payloads, learner answers, and grading keys. An HMAC of invitation and
local lesson identity produces the opaque conversation ID, so separate requests
and server restarts join the same lesson while different invitations stay
separate. Each request starts a distinct isolated turn tree. Rotating the session
secret also rotates these trace identities.

The service does not persist conversation text in PostgreSQL. Lessons and their
evidence remain in the browser's local storage. A revoked invitation is checked
again after inference; its generated response is not delivered. Disconnects cancel
provider work and settlement still runs. Trace export failures must not disclose
payloads or turn a failed teacher response into a successful one.

Research traces use authored examples and a separate explicit payload policy.
The frozen teacher suites and qualification reports live in
`research/teacher-agent/`. Existing arrangement and voicing experiments remain
separate; neither qualifies the conversational teacher.

### Trace grouping verification

On 2026-10-30, a metadata-only integration probe sent three real HTTP requests
through invitation exchange and `/api/teacher/next`. Two requests used the same
authored lesson identity in separate Node processes. The restarted process also
handled a second lesson concurrently. The provider was mocked; the probe made no
inference requests and incurred no inference usage.

Agent Lens readback matched all 24 captured SDK spans. The first lesson had two
distinct turn trees and 16 spans under one opaque conversation ID; the other had
one turn tree and eight spans under a different ID. The in-memory test repository
was recreated with the same authored invitation ID after restart. This verifies
HTTP integration and deterministic trace identity, not PostgreSQL persistence or
teacher quality. The separate Postgres integration tests require an isolated
`TEST_DATABASE_URL`; it was not configured for this check.

The [probe receipt](../../teacher-trace-probe/campaign.json),
[Agent Lens readback](../../teacher-trace-probe/publication/lens-readback.json),
and [captured source](../../teacher-trace-probe/source/probe-v1.ts) retain the
observed run. From the application root, reproduce into a fresh output directory:

```sh
TEACHER_TRACE_PROBE_OUTPUT=../teacher-trace-probe-recheck-001 \
  node --import tsx ../teacher-trace-probe/probe.ts
```

The capture step writes local SDK spans only. Publishing them uses
`publishLens` from `research/forge/publish-lens.mjs`, with `coachDirectory` set to
that fresh output directory and a fresh `directory` for publication receipts.
The publisher independently verifies the existing private project before writes
and reconciles span identities on readback. Existing capture and publication
receipts must not be overwritten.

Runtime actor and critic model identifiers and roles are retained in each turn's
call receipts. The critic prompt is versioned as `teacher-review-v1` and included
in each research campaign's frozen source hashes. A model identifier is the
requested catalog name, not a provider-guaranteed immutable model revision.

Listening tools inspect curated passage facts and prepare replay, tonic reference, questions, synthesized bass, fretboard handoff, and related examples. The client applies these through the shared lesson/player controller. No playlist or recording bytes enter the endpoint. The [listening contract](../docs/listening.md) owns source identity and assistance semantics.
