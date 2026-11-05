import { expect, it } from 'vitest';
import { invitationOptions } from '../scripts/invitation-options.js';
import { TEACHER_TOKEN_RESERVATION } from './teacher-limits.js';

it('sizes new teacher invitations for actor and critic without changing existing invitation defaults', () => {
  expect(invitationOptions([]).maxTokens).toBe(100_000);
  expect(invitationOptions(['--teacher']).maxTokens).toBe(2_000_000);
  expect(() => invitationOptions(['--teacher', '--tokens', '100000'])).toThrow();
  expect(
    invitationOptions(['--teacher', '--tokens', String(TEACHER_TOKEN_RESERVATION)]).maxTokens,
  ).toBe(TEACHER_TOKEN_RESERVATION);
  expect(() => invitationOptions(['--teacher', '--days'])).toThrow();
  expect(() => invitationOptions(['--tokens', '10', '--tokens', '20'])).toThrow();
});
