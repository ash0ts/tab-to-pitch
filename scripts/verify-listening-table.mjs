import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { ForgeTransport } from '../research/forge/transport.mjs';
import { readRun } from '../research/forge/models.mjs';
const dir = resolve(process.argv[2]),
  receipt = JSON.parse(await readFile(join(dir, 'publication/table/receipt.json'), 'utf8'));
const transport = new ForgeTransport({
  directory: join(dir, 'publication/table', `readback-${Date.now()}`),
  mode: process.env.FORGE_TRANSPORT ?? 'curl',
  deadlineMs: 30000,
});
try {
  const run = await readRun(transport, receipt.runName),
    summary = JSON.parse(run.summaryMetrics || '{}');
  const file = await readFile(join(dir, 'publication/table/downloaded.table.json'));
  const hash = createHash('sha256').update(file).digest('hex');
  const verified =
    run.state === 'finished' &&
    summary.comparison?.sha256 === receipt.sha256 &&
    summary.comparison?.nrows === receipt.rows &&
    hash === receipt.sha256;
  const result = {
    verified,
    runState: run.state,
    historyLines: run.historyLineCount,
    history: run.history,
    runName: receipt.runName,
    rows: receipt.rows,
    summary,
    downloadHashMatches: hash === receipt.sha256,
    checkedAt: new Date().toISOString(),
    url: receipt.url,
  };
  await writeFile(join(dir, 'publication/table/readback.json'), JSON.stringify(result, null, 2));
  console.info(JSON.stringify(result));
  if (!verified) process.exitCode = 1;
} finally {
  transport.close();
}
