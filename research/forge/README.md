# Forge research publication

These tools publish licensed public research outputs to the private `wandb/tab-to-pitch-public-data-research` project. The application and its users' files are outside this pipeline. The earlier synthetic project and failed runs remain unchanged.

`project.mjs` checks project access before an experiment write and reads it again after creation. `transport.mjs` records request hashes, acknowledgements, failures, connection stages, and readbacks. A stable operation key can reuse a successful acknowledgement. An unresolved write cannot be replayed automatically. A server acknowledgement is not proof that a dashboard has the expected data. Native mode uses one persistent connection; JSON and multipart op-source uploads share it.

`curl-fetch.mjs` is a scoped transport for the Forge shell's `/api/wandb` and `/api/trace` proxies. It supplies credentials through process stdin, limits request duration and size, follows no redirects, and performs no retries. `createForgeSdkFetch()` maps the SDK's public API origins to those proxies. It rejects inference traffic. Native HTTPS is also available through `ForgeTransport({mode: 'native'})`.

The routing choice addresses two observed client behaviors: W&B Python 0.31.0 normalizes the Forge proxy URL back to the API origin, and Weave JavaScript 0.16.10's default initializer adds a long retry wrapper. `weave-client.mjs` retains that pinned SDK's object, table, op, and evaluation serialization while supplying the explicit transport. Its internal initialization adapter must be requalified when the dependency changes. A failed request opens a local circuit; a successful flush alone is never reported as ingestion proof.

## Commands

From the application directory, with `WANDB_API_KEY` supplied through the environment:

```sh
FORGE_TRANSPORT=curl node research/forge/qualify.mjs ../tabtopitch-real-data/forge
node research/forge/models.mjs ../tabtopitch-real-data/forge ../tabtopitch-real-data/recall/run-003 recall-public-v1
```

Project creation requires an independently successful read. A failed creation remains in its receipt. `FORGE_CREATION_ATTEMPT` identifies an explicitly reviewed new attempt; changing it is appropriate only after checking the prior receipt and re-reading project state.

The Models publisher accepts exactly `report.json`, `model.json`, `dataset-manifest.json`, `run-manifest.json`, and `metrics.json`. It verifies frozen report/model hashes and excludes identifiers and source paths. It writes one history point for the measured static evaluation, then checks the summary, history, and finished run state. It does not invent a training curve or promote a model to Registry. The model predicts self-rated Anki recall, not guitar playing or a teaching policy's effect.

For the recorded coach comparison:

```sh
npx tsx research/forge/publish-coach.mjs --check \
  --manifest ../tabtopitch-real-data/coach-recovery/manifest.json \
  --baseline ../tabtopitch-real-data/coach-recovery/baseline.json \
  --campaign ../tabtopitch-real-data/coach-recovery/campaign.json
```

The default `--check` mode validates inputs without cloud access. `--publish` creates a new immutable local publication receipt, snapshots its exact input files, verifies the private project, and uploads through the pinned SDK. Supply `--receipt <new-path>` for a separate publication attempt. `--verify --receipt <path>` rereads the saved snapshots and checks existing cloud data without creating evaluations.

`publish-coach.mjs` uses one source-only `Dataset`, one `Evaluation`, and one shared six-criterion scorer across complete recorded arms. Recorded responses are looked up outside the dataset. Missing or partial hosted arms remain unavailable; the driver never fills them with baseline responses. Qualification attempts and their request evidence are a separate object outside the held-out cohort.

Readback verifies the 20 source rows, their exact digests, shared object refs, and 61 complete calls per arm: one evaluation, 20 prediction/score parents, 20 model replays, and 20 scorer calls. It reconciles each response and all 120 criterion values to the original receipt and checks the published aggregate. The SDK's call ID and trace ID are recorded separately. Original execution latency is `model_output.recorded.elapsedMs`; Weave's `model_latency` measures replay. A valid fallback can pass all application contracts while hosted selection failed, so provider success is reported separately.

The publisher allows up to three read-only initial connection qualifications. It never retries an uncertain write. The SDK's asynchronous table-row references are awaited before an evaluation begins; errors cannot silently leave an evaluation with unverified row identity. A later verification attempt may be needed while acknowledged writes become queryable.

## Research contract

The publication question is whether the cloud contains the exact reviewed outputs and provenance. The unit of evidence is a versioned dataset, evaluation call, or run, with independent server readback. This transport does not change musical grading, the recall model, or inference policy.

The cohort and estimands belong to each source experiment's frozen contract. Recall inputs come from the audited `recall/run-003` bundle. Its 63 metrics include chronological, unseen-collection, and explicitly exploratory post-only results. GuitarSet evaluation membership and model settings belong to the coach campaign manifest. A metadata-only smoke qualifies transport, not model quality.

Publication failures remain infrastructure failures. Missing server data is unavailable evidence, not a zero score or a successful upload. Stop on privacy drift, source-hash drift, uncertain writes, or credential-routing ambiguity. Retain prior attempts and use a new attempt identity after an explicit state check. Only aggregate public recall data, public music-derived context, evaluated outputs, and source/model hashes cross the boundary; raw learning rows and user scores do not.

## Implementation references

The endpoint routes are defined in the enclosing Core repository's `services/shell/src/forgeApi.ts` and Forge host trace-proxy configuration. Request contracts come from `services/weave-trace/generated/typescript/src/resources/`, `services/gorilla/api/schema/`, and the pinned SDK source. These repository contracts outrank guessed URL templates. Current provider API documentation is linked from the application's [deployment guide](../../docs/deployment.md).

Receipts live outside the application in `../tabtopitch-real-data/forge/`. The [private dashboard tour](dashboard-tour.md) links the verified cloud views and distinguishes them from unfinished artifact publication.
