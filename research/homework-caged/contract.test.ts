import { describe, it, expect } from 'vitest';
import { homeworkCases } from './cases';
import { scoreHomeworkCase } from './contract';
import {
  createTeacherToolRuntime,
  localTeacher,
  resolveTeacherAction,
} from '../../src/engine/teacher';
import { teacherRequestSchema, type TeacherRequest } from '../../src/shared/teacher';
import { ForgeTeacherAgent } from '../../server/teacher';
import { readConfig } from '../../server/config';
const cases = homeworkCases('evaluation');
describe('frozen homework categories', () => {
  for (const item of cases)
    it(item.id, () => {
      expect(teacherRequestSchema.safeParse(item.request).success).toBe(true);
      const before = JSON.stringify(item.request),
        output = localTeacher(item.request);
      expect(
        scoreHomeworkCase(item, output, before === JSON.stringify(item.request)),
      ).toMatchObject({
        contractValid: true,
        executableActionsValid: true,
        respectsStop: true,
        sourceUnchanged: true,
        modelSuccess: false,
      });
    });
  it('keeps development roots disjoint and includes every requested category', () => {
    const development = homeworkCases('development');
    expect(new Set(cases.map((c) => c.category)).size).toBe(5);
    expect(
      development.every(
        (c) =>
          !cases.some(
            (e) => e.request.context.homework!.symbol === c.request.context.homework!.symbol,
          ),
      ),
    ).toBe(true);
  });
  it('does not enable CAGED from an unsupported tuning or manufacture eligibility', () => {
    const request: TeacherRequest = structuredClone(cases[0]!.request);
    request.context.music.tuning = [64, 59, 55, 50, 45, 38];
    expect(
      resolveTeacherAction(request, {
        type: 'homework',
        operation: 'task',
        kind: 'roots',
        family: 'C',
      }),
    ).toBeNull();
    expect(
      resolveTeacherAction(request, {
        type: 'homework',
        operation: 'task',
        kind: 'locate',
        family: 'C',
      }),
    ).not.toBeNull();
    const runtime = createTeacherToolRuntime(request);
    expect(
      runtime.execute({
        name: 'homework_activity',
        args: {
          action: { type: 'homework', operation: 'task', kind: 'invent-notes', family: 'C' },
        },
      }).status,
    ).toBe('invalid');
  });
  it('requires assistance before any inference or map reveal', async () => {
    const request: TeacherRequest = structuredClone(cases[0]!.request);
    request.context.homework!.active = true;
    expect(
      createTeacherToolRuntime(request).execute({ name: 'homework_map', args: {} }).status,
    ).toBe('unavailable');
    let calls = 0;
    const agent = new ForgeTeacherAgent(
      { ...readConfig({}), forgeApiKey: 'test-only', tracingEnabled: false },
      async () => {
        calls++;
        throw new Error('must not call');
      },
    );
    const result = await agent.run(request, AbortSignal.timeout(1000));
    expect(calls).toBe(0);
    expect(result.failure).toBe('assistance-required');
    expect(result.response.actions).toEqual([]);
  });
});
