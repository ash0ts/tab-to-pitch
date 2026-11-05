import { createHmac } from 'node:crypto';

/** Stable across replicas/restarts, isolated by invitation, and never the local lesson ID. */
export function teacherConversationId(
  secret: string,
  invitationId: string,
  lessonId: string,
): string {
  const digest = createHmac('sha256', secret)
    .update(JSON.stringify(['teacher-v1', invitationId, lessonId]))
    .digest();
  digest[6] = (digest[6]! & 0x0f) | 0x40;
  digest[8] = (digest[8]! & 0x3f) | 0x80;
  const hex = digest.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
