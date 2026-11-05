import { it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { earHistoricalSpending } from './budget';
it('accounts for both workspaces once and rejects duplicate responses', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ear-budget-'));
  try {
    const a = join(root, 'a'),
      b = join(root, 'b'),
      legacy = join(root, 'legacy.json');
    await mkdir(join(a, 'first'), { recursive: true });
    await mkdir(join(b, 'second'), { recursive: true });
    await writeFile(legacy, JSON.stringify({ completionRequests: 0, rows: [] }));
    const receipt = (id: string) => ({
      requests: [
        {
          responseId: id,
          model: 'openai/gpt-oss-20b',
          costDollars: 0.01,
          usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
        },
      ],
    });
    await writeFile(join(a, 'first/campaign.json'), JSON.stringify(receipt('one')));
    await writeFile(join(b, 'second/campaign.json'), JSON.stringify(receipt('two')));
    expect(await earHistoricalSpending([a, b], legacy)).toMatchObject({
      calls: 2,
      dollars: 0.02,
      unknownUsage: 0,
    });
    await writeFile(
      join(b, 'second/campaign.json'),
      JSON.stringify({ ...receipt('one'), version: 2 }),
    );
    await expect(earHistoricalSpending([a, b], legacy)).rejects.toThrow('Duplicate response');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
