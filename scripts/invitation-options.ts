import {
  TEACHER_INVITATION_DEFAULT_TOKENS,
  TEACHER_TOKEN_RESERVATION,
} from '../server/teacher-limits.js';

export function invitationOptions(argv: string[]) {
  const teacher = argv.includes('--teacher');
  if (argv.filter((arg) => arg === '--teacher').length > 1) throw new Error('Duplicate option');
  const args = argv.filter((arg) => arg !== '--teacher');
  if (args.length % 2 !== 0) throw new Error('Option needs a value');
  const values = new Map<string, number>();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index]!;
    const value = Number(args[index + 1]);
    if (
      !['--days', '--tokens'].includes(flag) ||
      values.has(flag) ||
      !Number.isSafeInteger(value) ||
      value <= 0
    )
      throw new Error('Invalid option');
    values.set(flag, value);
  }
  const days = values.get('--days') ?? 7;
  const maxTokens =
    values.get('--tokens') ?? (teacher ? TEACHER_INVITATION_DEFAULT_TOKENS : 100_000);
  if (days > 365 || maxTokens > 100_000_000 || (teacher && maxTokens < TEACHER_TOKEN_RESERVATION))
    throw new Error('Invalid invitation allowance');
  return { days, maxTokens, teacher };
}
