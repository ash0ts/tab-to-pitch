import { createHash, createHmac, randomBytes } from 'node:crypto';

export const invitationHash = (token: string): string =>
  createHash('sha256').update(token).digest('hex');
export const sessionHash = (token: string, secret: string): string =>
  createHmac('sha256', secret).update(token).digest('hex');
export const newToken = (): string => randomBytes(32).toString('base64url');
