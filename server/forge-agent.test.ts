import { describe, expect, it, vi } from 'vitest';
import { fixtureContext } from '../evals/fixtures.js';
import { readConfig } from './config.js';
import { COACH_TOKEN_RESERVATION, ForgeCoachAgent, ForgeFailure } from './forge-agent.js';

const config = { ...readConfig({}), forgeApiKey: 'test-secret', forgeProject: 'test/project' };
const catalog = () => Response.json({ data: [{ id: config.forgeModel }] });
const tool = (name: string, args: unknown, usage = true) =>
  Response.json({
    choices: [
      {
        finish_reason: 'tool_calls',
        message: {
          tool_calls: [
            {
              id: 'tool-call',
              type: 'function',
              function: { name, arguments: JSON.stringify(args) },
            },
          ],
        },
      },
    ],
    ...(usage ? { usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 } } : {}),
  });
function transport(responses: Response[]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetcher = vi.fn(async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const response = responses.shift();
    if (!response) throw new Error('Unexpected request');
    return response;
  }) as unknown as typeof fetch;
  return { fetcher, calls };
}

describe('bounded Forge tool agent', () => {
  it('verifies the catalog, inspects evidence, then resolves an eligible candidate alias', async () => {
    const { fetcher, calls } = transport([
      catalog(),
      tool('inspect_practice', {}),
      tool('choose_drill', { candidate: 'c1' }),
    ]);
    const agent = new ForgeCoachAgent(config, fetcher);
    const result = await agent.run(fixtureContext, AbortSignal.timeout(1000));
    expect(result).toMatchObject({ candidateId: 'interval-drill', chargedTokens: 240 });
    expect(calls).toHaveLength(3);
    expect(calls[0]!.url).toMatch(/\/models$/);
    const prompt = String(calls[2]!.init!.body);
    expect(prompt).toContain('inspect_practice');
    expect(prompt).toContain('assisted');
    expect(prompt).not.toContain(fixtureContext.phrase.id);
    expect(prompt).not.toContain('note-drill');
    expect(prompt).not.toContain('n1');
    expect(calls[2]!.init!.headers).toMatchObject({ 'OpenAI-Project': 'test/project' });
    await agent.close();
  });
  it('rejects injected tool arguments and records known usage', async () => {
    const { fetcher } = transport([
      catalog(),
      tool('inspect_practice', {}),
      tool('choose_drill', { candidate: 'c0', explanation: 'Invented fact' }),
    ]);
    const agent = new ForgeCoachAgent(config, fetcher);
    await expect(agent.run(fixtureContext, AbortSignal.timeout(1000))).rejects.toMatchObject({
      reason: 'invalid-response',
      chargedTokens: 240,
    });
    await agent.close();
  });
  it('rejects out-of-range candidate references without additional inference steps', async () => {
    const { fetcher, calls } = transport([
      catalog(),
      tool('inspect_practice', {}),
      tool('choose_drill', { candidate: 'c99' }),
    ]);
    const agent = new ForgeCoachAgent(config, fetcher);
    await expect(agent.run(fixtureContext, AbortSignal.timeout(1000))).rejects.toBeInstanceOf(
      ForgeFailure,
    );
    expect(calls).toHaveLength(3);
    await agent.close();
  });
  it('keeps missing usage conservative even when a later step reports usage', async () => {
    const { fetcher } = transport([
      catalog(),
      tool('inspect_practice', {}, false),
      tool('choose_drill', { candidate: 'c0' }),
    ]);
    const agent = new ForgeCoachAgent(config, fetcher);
    expect((await agent.run(fixtureContext, AbortSignal.timeout(1000))).chargedTokens).toBe(
      COACH_TOKEN_RESERVATION,
    );
    await agent.close();
  });
  it.each([{ total_tokens: 0 }, { prompt_tokens: 100, completion_tokens: 20, total_tokens: 0 }])(
    'charges the reservation for malformed provider usage: %j',
    async (usage) => {
      const malformed = await tool('inspect_practice', {}).json();
      malformed.usage = usage;
      const { fetcher, calls } = transport([catalog(), Response.json(malformed)]);
      const agent = new ForgeCoachAgent(config, fetcher);
      await expect(agent.run(fixtureContext, AbortSignal.timeout(1000))).rejects.toMatchObject({
        reason: 'invalid-response',
        chargedTokens: COACH_TOKEN_RESERVATION,
      });
      expect(calls).toHaveLength(2);
      await agent.close();
    },
  );
  it('does not bill a catalog-only failure or call an unavailable model', async () => {
    const { fetcher, calls } = transport([Response.json({ data: [] })]);
    const agent = new ForgeCoachAgent(config, fetcher);
    await expect(agent.run(fixtureContext, AbortSignal.timeout(1000))).rejects.toMatchObject({
      reason: 'unavailable',
      chargedTokens: 0,
    });
    expect(calls).toHaveLength(1);
    await agent.close();
  });
  it('passes cancellation to inference and charges unknown in-flight usage', async () => {
    const fetcher = vi.fn(async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
      if (String(url).endsWith('/models')) return catalog();
      return new Promise<Response>((_resolve, reject) => {
        init!.signal!.addEventListener('abort', () => reject(new Error('Cancelled')), {
          once: true,
        });
      });
    }) as unknown as typeof fetch;
    const agent = new ForgeCoachAgent(config, fetcher);
    const abort = new AbortController();
    const promise = agent.run(fixtureContext, abort.signal);
    await new Promise((resolve) => setTimeout(resolve, 10));
    abort.abort();
    await expect(promise).rejects.toMatchObject({
      reason: 'unavailable',
      chargedTokens: COACH_TOKEN_RESERVATION,
    });
    await agent.close();
  });
});
