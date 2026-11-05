import type {
  BudgetResult,
  CoachRepository,
  InvitationInput,
  PracticeSession,
} from './repository.js';

/** Test-only implementation. Production startup never imports this module. */
export class InMemoryTestRepository implements CoachRepository {
  readonly invitations = new Map<string, InvitationInput & { used: number; reserved: number }>();
  readonly sessions = new Map<string, PracticeSession>();
  readonly reservations = new Map<
    string,
    { invitationId: string; day: string; reserved: number; charged?: number }
  >();
  readonly days = new Map<string, { used: number; reserved: number }>();
  async createInvitation(input: InvitationInput): Promise<void> {
    this.invitations.set(input.id, { ...input, used: 0, reserved: 0 });
  }
  async exchangeInvitation(
    tokenHash: string,
    sessionHash: string,
    expiresAt: Date,
    now: Date,
  ): Promise<PracticeSession | null> {
    const invitation = [...this.invitations.values()].find(
      (value) => value.tokenHash === tokenHash && value.expiresAt > now,
    );
    if (!invitation) return null;
    const session = {
      invitationId: invitation.id,
      expiresAt: new Date(Math.min(invitation.expiresAt.getTime(), expiresAt.getTime())),
    };
    this.sessions.set(sessionHash, session);
    return session;
  }
  async getSession(sessionHash: string, now: Date): Promise<PracticeSession | null> {
    const session = this.sessions.get(sessionHash);
    const invitation = session && this.invitations.get(session.invitationId);
    return session && session.expiresAt > now && invitation && invitation.expiresAt > now
      ? session
      : null;
  }
  async revokeSession(sessionHash: string): Promise<void> {
    this.sessions.delete(sessionHash);
  }
  async reserveBudget(
    invitationId: string,
    requestId: string,
    reserveTokens: number,
    globalLimit: number,
    now: Date,
  ): Promise<BudgetResult> {
    // No await within the critical section: concurrent callers are atomic in this test double.
    const key = `${invitationId}:${requestId}`;
    if (this.reservations.has(key)) return { ok: false, reason: 'duplicate' };
    const invitation = this.invitations.get(invitationId);
    const day = now.toISOString().slice(0, 10);
    const global = this.days.get(day) ?? { used: 0, reserved: 0 };
    if (
      !invitation ||
      invitation.expiresAt <= now ||
      invitation.used + invitation.reserved + reserveTokens > invitation.maxTokens ||
      global.used + global.reserved + reserveTokens > globalLimit
    )
      return { ok: false, reason: 'budget' };
    invitation.reserved += reserveTokens;
    global.reserved += reserveTokens;
    this.days.set(day, global);
    this.reservations.set(key, { invitationId, day, reserved: reserveTokens });
    return { ok: true };
  }
  async settleBudget(
    invitationId: string,
    requestId: string,
    chargedTokens: number,
  ): Promise<void> {
    const reservation = this.reservations.get(`${invitationId}:${requestId}`);
    if (!reservation || reservation.charged !== undefined) return;
    if (
      !Number.isSafeInteger(chargedTokens) ||
      chargedTokens < 0 ||
      chargedTokens > reservation.reserved
    )
      throw new Error('Invalid token settlement');
    const invitation = this.invitations.get(invitationId)!;
    const global = this.days.get(reservation.day)!;
    invitation.reserved -= reservation.reserved;
    invitation.used += chargedTokens;
    global.reserved -= reservation.reserved;
    global.used += chargedTokens;
    reservation.charged = chargedTokens;
  }
  async close(): Promise<void> {}
}
