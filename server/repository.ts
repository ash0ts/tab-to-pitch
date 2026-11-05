export interface PracticeSession {
  invitationId: string;
  expiresAt: Date;
}
export type BudgetResult = { ok: true } | { ok: false; reason: 'budget' | 'duplicate' };
export interface InvitationInput {
  id: string;
  tokenHash: string;
  expiresAt: Date;
  maxTokens: number;
}
export interface CoachRepository {
  createInvitation(input: InvitationInput): Promise<void>;
  exchangeInvitation(
    tokenHash: string,
    sessionHash: string,
    expiresAt: Date,
    now: Date,
  ): Promise<PracticeSession | null>;
  getSession(sessionHash: string, now: Date): Promise<PracticeSession | null>;
  revokeSession(sessionHash: string): Promise<void>;
  reserveBudget(
    invitationId: string,
    requestId: string,
    reserveTokens: number,
    globalLimit: number,
    now: Date,
  ): Promise<BudgetResult>;
  settleBudget(invitationId: string, requestId: string, chargedTokens: number): Promise<void>;
  close(): Promise<void>;
}
