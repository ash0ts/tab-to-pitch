import { describe, expect, it } from 'vitest';
import { accountedTokens, requireAllowance, validUsage } from './contracts.js';
import { CURL_ARGS, inferenceFetch, quoteCurlConfig, splitCurlResponse } from './https-fetch.js';

describe('campaign accounting', () => {
  it('retains the reservation when a response has no trustworthy usage', () => {
    expect(
      validUsage({ prompt_tokens: 20, completion_tokens: 10, total_tokens: 25 }),
    ).toBeUndefined();
    expect(accountedTokens([{ reservedTokens: 8000 }])).toBe(8000);
    expect(() => requireAllowance([{ reservedTokens: 8000 }], 8000, 2, 10000)).toThrow();
  });
  it('settles real usage while retaining a hard call cap', () => {
    const rows = [
      {
        reservedTokens: 8000,
        usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
      },
    ];
    expect(accountedTokens(rows)).toBe(30);
    expect(() => requireAllowance(rows, 8000, 1, 200000)).toThrow();
    expect(() => requireAllowance(rows, 8000, 2, 200000)).not.toThrow();
  });
});
describe('scoped curl transport', () => {
  it('disables ambient curl configuration before reading the scoped configuration', () => {
    expect(CURL_ARGS).toEqual(['--disable', '--config', '-']);
  });
  it('keeps multiline config input inside one quoted value', () => {
    expect(quoteCurlConfig('header\nurl = "wrong"')).toBe('"header\\nurl = \\"wrong\\""');
    expect(() => quoteCurlConfig('a\0b')).toThrow();
  });
  it('separates JSON body from an independently reported HTTP code', () => {
    expect(splitCurlResponse('{"message":"200"}\n401')).toEqual({
      body: '{"message":"200"}',
      status: 401,
    });
    expect(() => splitCurlResponse('data\n000')).toThrow();
  });
  it('rejects unapproved origins before starting a subprocess', async () => {
    await expect(inferenceFetch('https://example.com/v1/models')).rejects.toThrow('Unapproved');
    await expect(
      inferenceFetch('https://api.inference.wandb.ai/v1/models?token=x'),
    ).rejects.toThrow('Unapproved');
  });
});
