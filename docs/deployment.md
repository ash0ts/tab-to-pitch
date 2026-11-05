# Deployment and recovery

The release unit is a Node 24 OCI image containing the Fastify service, compiled
administration commands, migrations, and the Vite build. It runs as the `node`
user on port 3000. The default hosted service needs no persistent application disk: scores and practice
history stay in the browser; PostgreSQL holds invitation/session hashes and
token accounting. The cloud API contract is in [the server guide](../server/README.md).

## Build and check

From a clean checkout with Node 24, Docker, and npm:

```sh
npm ci
npm run typecheck
npm test
npm run build
npx playwright install chromium
PLAYWRIGHT_CHANNEL=chromium npm run test:browser
PLAYWRIGHT_CHANNEL=chromium npm run test:ear
PLAYWRIGHT_CHANNEL=chromium npm run test:live
PLAYWRIGHT_CHANNEL=chromium npm run test:guitar-homework
PLAYWRIGHT_CHANNEL=chromium npm run test:studio
PLAYWRIGHT_CHANNEL=chromium npm run test:renderer
PLAYWRIGHT_CHANNEL=chromium npm run test:offline
docker build --tag tab-to-pitch:release .
docker run --detach --name tab-to-pitch-check --publish 127.0.0.1:3199:3000 tab-to-pitch:release
PLAYWRIGHT_CHANNEL=chromium node server/check-production.mjs http://127.0.0.1:3199
node server/check-recovery.mjs tab-to-pitch:release
docker rm --force tab-to-pitch-check
```

The production check exercises the actual Fastify image, including worker and
worklet JavaScript MIME types, SoundFont bytes, missing-asset 404s, playback clock
advancement, offline reload, and practice. The recovery rehearsal creates a
disposable PostgreSQL 16 container with networking disabled, runs compiled migrations twice,
backs up synthetic authentication and quota records, restores into a second
database, and compares every persisted field. It removes its container on
completion. CI runs these checks without inference credentials.

`npm ci` applies the pinned alphaTab patch and materializes its assets before
Vite builds. The Docker build needs no API keys. `.dockerignore` excludes local
environment files and backup dumps. Store the approved release image in your
registry under an immutable digest and retain the previous working digest.
The Node base tag follows Node 24 security updates, so rebuilding a source
commit can produce a different image; rollback uses the recorded digest.

The optional [Ear Lab worker](../audio_worker/README.md) runs locally and owns its
explicitly imported audio/artifact directory. It is not provisioned by the hosted
Blueprint. With no worker, ordinary lessons, unplugged homework and browser
guitar input remain available. Live input requires a secure browser origin and
explicit device activation; deployment does not qualify its detection or timing.
Run browser suites sequentially because they share diagnostic output directories.

## Render setup

Import this repository as a Blueprint using [`render.yaml`](../render.yaml).
It defines one CPU web service and PostgreSQL 16 in the same region. External
database access is blocked; migrations run before each deploy; automatic
deploys are disabled. The selected plans are paid resources. Review them
before provisioning. Field definitions follow the current
[Render Blueprint reference](https://render.com/docs/blueprint-spec).

The Blueprint generates `SESSION_SECRET` and supplies the private database
connection. `PUBLIC_ORIGIN` references the service's
[`RENDER_EXTERNAL_URL`](https://render.com/docs/environment-variables).
For a custom domain, replace this reference with the exact HTTPS origin,
without a trailing slash. API writes accept that origin only.

The first release serves the player and local practice with cloud coaching
disabled. To enable invitation-only coaching, set `WANDB_API_KEY` and
`FORGE_PROJECT=entity/project` in the service's secret environment. Confirm the
account exposes the configured `FORGE_MODEL`. Change `CLOUD_COACH_ENABLED` to
`"true"` in the Blueprint and deploy. Keep the tracked value aligned with the
intended setting: a later Blueprint sync reapplies it. `FORGE_TRACING_ENABLED`
is a separate opt-in for metadata-only Agent Lens traces.

Create an invitation from a private service shell:

```sh
node scripts/invitation.js --days 7 --tokens 100000
```

The command prints a secret once. Share it privately; never add it to an app URL
or build logs. Global `FORGE_DAILY_TOKEN_LIMIT` and invitation limits count
tokens, not dollars. Provider pricing and spending controls remain separate.
The agent validates catalog membership at runtime; a real two-tool interaction
is still needed to verify account access and tool support. No live provider
interaction is part of CI.

## Release procedure

1. Require passing CI and record the source commit, new image digest, previous
   image digest, migration names, and backup location.
2. Take a private database backup and rehearse restoration into an isolated
   database. Record the restore check before changing production.
3. Apply migrations from the new image. Render's `preDeployCommand` does this;
   another OCI host runs the command below before switching traffic.
4. Start the image with private runtime environment variables and HTTPS at the
   edge. Keep `HOST=0.0.0.0`, set the platform's `PORT`, and preserve the session
   secret across replicas and restarts.
5. Verify `/healthz`, `/api/health`, score rendering, playback, and local practice.
   If cloud coaching is enabled, exchange a fresh invitation and verify that
   logout revokes it and an eligible proposal is returned. A local fallback is
   safe behavior, but does not verify successful inference.

```sh
docker run --rm --env-file /private/tab-to-pitch.production.env tab-to-pitch:release node scripts/migrate.js
```

Migrations hold a PostgreSQL advisory lock and transact each file once. The
initial migration is additive. Future migrations must preserve compatibility
with the previous release until the rollback window closes. A failing migration
must stop deployment. `/healthz` is process liveness; it does not test PostgreSQL
or Forge availability.

## Back up and restore

Use PostgreSQL 16 client tools on a trusted administrator host with network
access to the database. The runtime image intentionally contains no database
client binaries. Install the repository's locked dependencies there. Put only
the intended source database's `DATABASE_URL` in a private environment file:

```sh
node --env-file=/private/source.env --import tsx scripts/backup.ts /private/backups/pre-release.dump
```

The script creates a custom-format dump with owner/ACL restoration disabled,
refuses to overwrite an existing file, restricts the output to its owner, and passes credentials through environment
variables. Store backups encrypted with restricted access and a retention
policy appropriate to the beta. Browser-owned tabs and practice history are
outside this database; users export progress from the app separately.

Create an empty, isolated PostgreSQL 16 database. Put its connection in a
different private environment file. The restore command replaces objects in
the selected target inside one transaction:

```sh
node --env-file=/private/restore-target.env --import tsx scripts/restore.ts /private/backups/pre-release.dump --confirm-restore
node --env-file=/private/restore-target.env --import tsx scripts/migrate.ts
```

Check schema migration names, invitation/session counts and expiries, daily
usage, and both settled and outstanding token reservations against the source
snapshot. Start an isolated instance against the restored database and verify
session lookup and a local coach response. Preserve `SESSION_SECRET` to retain
valid sessions; rotate it intentionally if recovery should sign everyone out.
Use a replacement database and switch `DATABASE_URL` after validation. Keep the
original database intact until recovery is accepted.

Render's private database connection is available within its private network.
For an administrator host outside that network, explicitly allow only the
administrator's IP and use the external TLS connection for the duration of the
operation, then remove that access. Do not widen the committed empty allowlist.

## Roll back

Disable cloud coaching if its behavior or accounting is in question. Route
traffic to the retained previous image digest with the current database when
the migration remains compatible. Do not run an automatic down-migration.
If data recovery is necessary, restore to a replacement database and validate it
before switching the connection. A rollback can leave existing browser tabs on
their cached app version until they accept the update prompt or reload; keep
the previous client/API contract supported during that window.

## Production assets and offline behavior

The image serves `/assets/alphaTab.worker-*.js`,
`/assets/alphaTab.worklet-*.js`, `/soundfont/sonivox.sf2`, `/font/`, and `/fonts/`
from `dist`. Modified alphaTab source and license notices ship at
`/vendor/alphatab-source/`. Missing assets return 404 rather than SPA HTML.

The service worker precaches the built app, fonts, worker, worklet, and
SoundFont after an online visit. Offline operation requires that installation
to finish and browser storage to remain available. API routes are excluded from
the navigation fallback and API responses use `Cache-Control: no-store`.
Cloud coaching requires a network connection; deterministic practice remains
available offline. Service worker updates wait for the user's update action.

## Invited experimental listening teacher

The existing endpoint now accepts `teacher-v2` listening contexts as well as `teacher-v1`. Configure `TEACHER_AGENT_ENABLED=true` independently of `TEACHER_QUALIFICATION=unqualified`. This explicitly enables invited experimentation without claiming the model passed release gates. Keep invitation sessions, origin validation, persistent quotas, cancellation, action validation, and the runtime critic enabled. The maximum reservation covers actor and critic calls together; existing invitation limits are not increased automatically.

The UI displays the qualification status from `/api/health`. Only change the status to `qualified` for an exact configuration supported by a completed, independently evaluated campaign. See the [listening contract](listening.md) and [research results](../research/listening-agent/results.md).

`scripts/listening-demo-server.ts` is a loopback-only capture harness. It uses the real API route and Forge actor/critic with an ephemeral test invitation repository, admits only the original C/G studies, and caps the demo at three serialized turns and $0.10 within the remaining research allowance. It is not a production deployment or a persistence qualification. Production continues to require PostgreSQL. The private demo-session file is excluded from publication.
