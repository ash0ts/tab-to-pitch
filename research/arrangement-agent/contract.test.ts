import { describe, it, expect } from 'vitest';
import { testCases, developmentCases } from './cases.js';
import {
  arrangementRequestSchema,
  arrangementResponse,
  executeArrangementIntent,
  localArrangement,
} from '../../src/shared/arrangements.js';
import { scoreArrangement } from './contract.js';
describe('frozen arrangement experiment contract', () => {
  it('has 96 unique cases over 24 contexts, with separate development cases', () => {
    expect(testCases).toHaveLength(96);
    expect(new Set(testCases.map((c) => c.id)).size).toBe(96);
    expect(new Set(testCases.map((c) => c.contextId)).size).toBe(24);
    expect(developmentCases.every((d) => testCases.every((t) => d.contextId !== t.contextId))).toBe(
      true,
    );
  });
  it('validates every context and accepts every independently authored expected intent', () => {
    for (const task of testCases) {
      arrangementRequestSchema.parse(task.request);
      const execution = executeArrangementIntent(task.request, task.expected);
      const response = arrangementResponse(
        task.request,
        task.expected,
        execution.result?.variations[0]?.id ?? null,
      );
      expect(scoreArrangement(task, response).requestCorrect, task.id).toBe(true);
      expect(scoreArrangement(task, response).validNotes, task.id).toBe(true);
    }
  });
  it('counts missing provider results and wrong intent as failures even if output notes are valid', () => {
    const task = testCases.find((c) => c.category === 'paraphrase')!;
    expect(scoreArrangement(task, null).requestCorrect).toBe(false);
    expect(scoreArrangement(task, localArrangement(task.request))).toMatchObject({
      validNotes: true,
      requestCorrect: false,
    });
  });
});
