import { Pool, type PoolClient } from 'pg';
import type {
  BudgetResult,
  CoachRepository,
  InvitationInput,
  PracticeSession,
} from './repository.js';

interface InvitationRow {
  id: string;
  expires_at: Date;
  max_tokens: string;
  used_tokens: string;
  reserved_tokens: string;
}

export class PostgresRepository implements CoachRepository {
  readonly pool: Pool;
  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      max: 8,
      connectionTimeoutMillis: 5000,
      statement_timeout: 5000,
    });
    // pg removes failed idle clients; its error event still needs a listener to avoid a crash.
    this.pool.on('error', () => {
      console.error('An idle PostgreSQL connection failed. The pool will replace it.');
    });
  }
  private async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  async createInvitation(input: InvitationInput): Promise<void> {
    await this.pool.query(
      'INSERT INTO invitations (id, token_hash, expires_at, max_tokens) VALUES ($1,$2,$3,$4)',
      [input.id, input.tokenHash, input.expiresAt, input.maxTokens],
    );
  }
  async exchangeInvitation(
    tokenHash: string,
    sessionHash: string,
    expiresAt: Date,
    now: Date,
  ): Promise<PracticeSession | null> {
    return this.transaction(async (client) => {
      const result = await client.query<InvitationRow>(
        'SELECT id, expires_at FROM invitations WHERE token_hash=$1 AND expires_at>$2 AND revoked_at IS NULL FOR UPDATE',
        [tokenHash, now],
      );
      const row = result.rows[0];
      if (!row) return null;
      const expiry = new Date(Math.min(expiresAt.getTime(), row.expires_at.getTime()));
      await client.query(
        'INSERT INTO sessions (token_hash, invitation_id, expires_at) VALUES ($1,$2,$3)',
        [sessionHash, row.id, expiry],
      );
      return { invitationId: row.id, expiresAt: expiry };
    });
  }
  async getSession(sessionHash: string, now: Date): Promise<PracticeSession | null> {
    const result = await this.pool.query<{ invitation_id: string; expires_at: Date }>(
      'SELECT s.invitation_id,s.expires_at FROM sessions s JOIN invitations i ON i.id=s.invitation_id WHERE s.token_hash=$1 AND s.expires_at>$2 AND i.expires_at>$2 AND i.revoked_at IS NULL',
      [sessionHash, now],
    );
    const row = result.rows[0];
    return row ? { invitationId: row.invitation_id, expiresAt: row.expires_at } : null;
  }
  async revokeSession(sessionHash: string): Promise<void> {
    await this.pool.query('DELETE FROM sessions WHERE token_hash=$1', [sessionHash]);
  }
  async reserveBudget(
    invitationId: string,
    requestId: string,
    reserveTokens: number,
    globalLimit: number,
    now: Date,
  ): Promise<BudgetResult> {
    return this.transaction(async (client) => {
      // Lock order is invitation, then global day, on reserve and settle alike.
      const invitation = (
        await client.query<InvitationRow>(
          'SELECT id,expires_at,max_tokens,used_tokens,reserved_tokens FROM invitations WHERE id=$1 AND revoked_at IS NULL FOR UPDATE',
          [invitationId],
        )
      ).rows[0];
      if (!invitation || invitation.expires_at <= now) return { ok: false, reason: 'budget' };
      const prior = await client.query(
        'SELECT request_id FROM token_reservations WHERE invitation_id=$1 AND request_id=$2',
        [invitationId, requestId],
      );
      if (prior.rowCount) return { ok: false, reason: 'duplicate' };
      const day = now.toISOString().slice(0, 10);
      await client.query(
        'INSERT INTO daily_token_budgets (day) VALUES ($1) ON CONFLICT DO NOTHING',
        [day],
      );
      const global = (
        await client.query<{ used_tokens: string; reserved_tokens: string }>(
          'SELECT used_tokens,reserved_tokens FROM daily_token_budgets WHERE day=$1 FOR UPDATE',
          [day],
        )
      ).rows[0]!;
      if (
        Number(invitation.used_tokens) + Number(invitation.reserved_tokens) + reserveTokens >
          Number(invitation.max_tokens) ||
        Number(global.used_tokens) + Number(global.reserved_tokens) + reserveTokens > globalLimit
      )
        return { ok: false, reason: 'budget' };
      await client.query(
        'INSERT INTO token_reservations (invitation_id,request_id,day,reserved_tokens) VALUES ($1,$2,$3,$4)',
        [invitationId, requestId, day, reserveTokens],
      );
      await client.query('UPDATE invitations SET reserved_tokens=reserved_tokens+$2 WHERE id=$1', [
        invitationId,
        reserveTokens,
      ]);
      await client.query(
        'UPDATE daily_token_budgets SET reserved_tokens=reserved_tokens+$2 WHERE day=$1',
        [day, reserveTokens],
      );
      return { ok: true };
    });
  }
  async settleBudget(
    invitationId: string,
    requestId: string,
    chargedTokens: number,
  ): Promise<void> {
    await this.transaction(async (client) => {
      await client.query('SELECT id FROM invitations WHERE id=$1 FOR UPDATE', [invitationId]);
      const row = (
        await client.query<{ day: string; reserved_tokens: string; charged_tokens: string | null }>(
          'SELECT day::text,reserved_tokens,charged_tokens FROM token_reservations WHERE invitation_id=$1 AND request_id=$2 FOR UPDATE',
          [invitationId, requestId],
        )
      ).rows[0];
      if (!row || row.charged_tokens !== null) return;
      const reserved = Number(row.reserved_tokens);
      if (!Number.isSafeInteger(chargedTokens) || chargedTokens < 0 || chargedTokens > reserved)
        throw new Error('Invalid token settlement');
      await client.query(
        'UPDATE invitations SET reserved_tokens=reserved_tokens-$2,used_tokens=used_tokens+$3 WHERE id=$1',
        [invitationId, reserved, chargedTokens],
      );
      await client.query(
        'UPDATE daily_token_budgets SET reserved_tokens=reserved_tokens-$2,used_tokens=used_tokens+$3 WHERE day=$1',
        [row.day, reserved, chargedTokens],
      );
      await client.query(
        'UPDATE token_reservations SET charged_tokens=$3,settled_at=NOW() WHERE invitation_id=$1 AND request_id=$2',
        [invitationId, requestId, chargedTokens],
      );
    });
  }
  async close(): Promise<void> {
    await this.pool.end();
  }
}
