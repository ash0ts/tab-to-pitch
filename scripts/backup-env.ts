/** Credentials are passed in the child environment, never its arguments or printed output. */
export function postgresEnvironment(): NodeJS.ProcessEnv {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error('DATABASE_URL is required');
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol))
    throw new Error('Expected a Postgres URL');
  return {
    PATH: process.env.PATH,
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGSSLMODE: url.searchParams.get('sslmode') ?? 'prefer',
    PGCONNECT_TIMEOUT: '10',
  };
}
