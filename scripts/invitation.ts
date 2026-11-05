import { randomUUID } from 'node:crypto';
import { invitationHash, newToken } from '../server/auth.js';
import { PostgresRepository } from '../server/postgres.js';
import { invitationOptions } from './invitation-options.js';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.info(
    'Usage: npm run invite -- [--teacher] [--days 7] [--tokens N]\nTeacher invitations default to 2000000 tokens; other invitations default to 100000. Requires DATABASE_URL. Prints a secret invitation token once.',
  );
} else {
  let repository: PostgresRepository | undefined;
  try {
    const { days, maxTokens } = invitationOptions(args);
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL missing');
    repository = new PostgresRepository(process.env.DATABASE_URL);
    const token = newToken();
    const id = randomUUID();
    const expiresAt = new Date(Date.now() + days * 86_400_000);
    await repository.createInvitation({
      id,
      tokenHash: invitationHash(token),
      expiresAt,
      maxTokens,
    });
    console.info(
      JSON.stringify(
        { invitationId: id, invitation: token, expiresAt: expiresAt.toISOString(), maxTokens },
        null,
        2,
      ),
    );
  } catch {
    console.error(
      'Could not create invitation. Check DATABASE_URL, migrations, --days, and --tokens.',
    );
    process.exitCode = 1;
  } finally {
    await repository?.close();
  }
}
