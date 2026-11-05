import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  localCoach,
  proposalForCandidate,
  forgeCoachVersions,
  LOCAL_COACH_VERSIONS,
  type CoachResponse,
} from '../src/shared/coach.js';
import { readConfig } from '../server/config.js';
import { COACH_DEADLINE_MS, ForgeCoachAgent } from '../server/forge-agent.js';
import { coachFixtures, type CoachFixture } from './fixtures.js';
import { scoreCoach } from './scorers.js';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.info(
    'Usage: npx tsx evals/replay.ts [--output path.json] [--live] [--publish]\nDefault: local synthetic regression replay. --live calls paid Forge inference. --publish uploads only these authored fixtures/results to Weave.',
  );
} else {
  const live = args.includes('--live');
  const publish = args.includes('--publish');
  const config = readConfig();
  if (live && !config.cloudEnabled)
    throw new Error('--live requires the configured cloud coach environment');
  if (publish && !(process.env.WANDB_API_KEY && process.env.FORGE_PROJECT))
    throw new Error('--publish requires WANDB_API_KEY and FORGE_PROJECT');
  const outputIndex = args.indexOf('--output');
  const outputPath = resolve(
    outputIndex >= 0 ? args[outputIndex + 1]! : 'evals/artifacts/latest.json',
  );
  const agent = live ? new ForgeCoachAgent(config) : undefined;
  const evaluate = async (fixture: CoachFixture): Promise<CoachResponse> => {
    if (!agent) return localCoach(fixture.context);
    const result = await agent.run(fixture.context, AbortSignal.timeout(COACH_DEADLINE_MS));
    return {
      source: 'forge',
      versions: forgeCoachVersions(config.forgeModel),
      proposal: proposalForCandidate(fixture.context, result.candidateId),
    };
  };
  try {
    const rows: { id: string; output: CoachResponse; scores: ReturnType<typeof scoreCoach> }[] = [];
    for (const fixture of coachFixtures) {
      const output = await evaluate(fixture);
      rows.push({ id: fixture.id, output, scores: scoreCoach(fixture, output) });
    }
    let weaveSummary: unknown;
    let weaveRefs:
      | { dataset: string; datasetUrl: string; evaluation: string; evaluationUrl: string }
      | undefined;
    if (publish) {
      const weave = await import('weave');
      const client = await weave.init(process.env.FORGE_PROJECT!);
      // Replay already-produced outputs so publishing does not make another paid model call.
      const dataset = new weave.Dataset({
        name: 'tab-to-pitch-synthetic-coach-v1',
        rows: coachFixtures.map((fixture, index) => ({
          ...fixture,
          recordedOutput: rows[index]!.output,
        })),
      });
      const model = weave.op(
        async ({ datasetRow }: { datasetRow: CoachFixture & { recordedOutput: CoachResponse } }) =>
          datasetRow.recordedOutput,
        { name: live ? 'forge-coach-recorded-v1' : 'deterministic-coach-v1' },
      );
      const scorer = weave.op(
        ({ datasetRow, modelOutput }: { datasetRow: CoachFixture; modelOutput: CoachResponse }) =>
          scoreCoach(datasetRow, modelOutput),
        { name: 'coach-contract-v1' },
      );
      const evaluation = new weave.Evaluation({
        name: 'tab-to-pitch-synthetic-regression-v1',
        dataset,
        scorers: [scorer],
      });
      const datasetRef = await dataset.save();
      const evaluationRef = await client.publish(evaluation);
      weaveRefs = {
        dataset: datasetRef.uri(),
        datasetUrl: datasetRef.ui_url(),
        evaluation: evaluationRef.uri(),
        evaluationUrl: evaluationRef.ui_url(),
      };
      weaveSummary = await evaluation.evaluate({ model, maxConcurrency: 1 });
      await weave.flush();
    }
    await mkdir(dirname(outputPath), { recursive: true });
    const artifact = {
      schemaVersion: 1,
      evaluationType: 'synthetic-contract-regression',
      realLearnerCount: 0,
      createdAt: new Date().toISOString(),
      versions: live ? forgeCoachVersions(config.forgeModel) : LOCAL_COACH_VERSIONS,
      rows,
      ...(weaveSummary ? { weaveSummary, weaveRefs } : {}),
    };
    await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
    const passed = rows.every((row) => Object.values(row.scores).every(Boolean));
    console.info(
      `${rows.length} synthetic regression cases; ${passed ? 'all passed' : 'review failures'}. Artifact: ${outputPath}`,
    );
    if (!passed) process.exitCode = 1;
  } finally {
    await agent?.close();
  }
}
