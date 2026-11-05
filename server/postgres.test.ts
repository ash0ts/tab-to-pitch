import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { migrate } from '../scripts/migrate.js';
import { PostgresRepository } from './postgres.js';

it('handles idle connection errors without crashing or logging credentials', async () => {
  const repository = new PostgresRepository('postgresql://localhost/unused');
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    expect(() =>
      repository.pool.emit('error', new Error('Connection failed: private-password')),
    ).not.toThrow();
    expect(error).toHaveBeenCalled();
    expect(JSON.stringify(error.mock.calls)).not.toContain('private-password');
  } finally {
    error.mockRestore();
    await repository.close();
  }
});

// Opt-in integration suite; use an isolated test database because it applies migrations.
const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)('Postgres budget transactions', () => {
  let repository: PostgresRepository;
  const invitationIds: string[] = [];
  beforeAll(async () => {
    await migrate(databaseUrl!);
    repository = new PostgresRepository(databaseUrl!);
  });
  afterAll(async () => {
    for (const id of invitationIds) {
      await repository.pool.query('DELETE FROM token_reservations WHERE invitation_id=$1', [id]);
      await repository.pool.query('DELETE FROM invitations WHERE id=$1', [id]);
    }
    await repository.close();
  });
  it('serializes global reservations from separate connections and persists usage across restart', async () => {
    const now = new Date('2099-11-15T12:00:00Z');
    await repository.pool.query('DELETE FROM daily_token_budgets WHERE day=$1', ['2099-11-15']);
    const ids = [randomUUID(), randomUUID()];
    invitationIds.push(...ids);
    for (const id of ids)
      await repository.createInvitation({
        id,
        tokenHash: id,
        maxTokens: 1000,
        expiresAt: new Date('2100-01-01'),
      });
    const requests = [randomUUID(), randomUUID()];
    const results = await Promise.all(
      ids.map((id, index) => repository.reserveBudget(id, requests[index]!, 600, 1000, now)),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    const winner = results.findIndex((result) => result.ok);
    await repository.settleBudget(ids[winner]!, requests[winner]!, 200);
    await repository.settleBudget(ids[winner]!, requests[winner]!, 200);
    const secondRepository = new PostgresRepository(databaseUrl!);
    try {
      const row = (
        await secondRepository.pool.query(
          'SELECT used_tokens,reserved_tokens FROM invitations WHERE id=$1',
          [ids[winner]],
        )
      ).rows[0];
      expect(row).toEqual({ used_tokens: '200', reserved_tokens: '0' });
      expect(
        await secondRepository.reserveBudget(ids[winner]!, requests[winner]!, 600, 1000, now),
      ).toEqual({ ok: false, reason: 'duplicate' });
    } finally {
      await secondRepository.close();
    }
  });
  it('persists invitation sessions, respects expiry, and revokes on logout', async () => {
    const id = randomUUID();
    invitationIds.push(id);
    const now = new Date('2026-10-29T12:00:00Z');
    const expiry = new Date('2026-10-30T12:00:00Z');
    const tokenHash = randomUUID();
    const sessionHash = randomUUID();
    await repository.createInvitation({ id, tokenHash, expiresAt: expiry, maxTokens: 1000 });
    expect(await repository.exchangeInvitation('invalid', sessionHash, expiry, now)).toBeNull();
    expect(
      await repository.exchangeInvitation(tokenHash, sessionHash, new Date('2026-11-01'), now),
    ).toEqual({ invitationId: id, expiresAt: expiry });
    const secondRepository = new PostgresRepository(databaseUrl!);
    try {
      expect(await secondRepository.getSession(sessionHash, now)).toEqual({
        invitationId: id,
        expiresAt: expiry,
      });
      expect(await secondRepository.getSession(sessionHash, expiry)).toBeNull();
      await secondRepository.revokeSession(sessionHash);
      expect(await repository.getSession(sessionHash, now)).toBeNull();
    } finally {
      await secondRepository.close();
    }
  });
});
