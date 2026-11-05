export interface ServerConfig {
  production: boolean;
  publicOrigin: string;
  databaseUrl?: string;
  sessionSecret?: string;
  forgeApiKey?: string;
  forgeProject?: string;
  forgeBaseUrl: string;
  forgeModel: string;
  dailyTokenLimit: number;
  cloudEnabled: boolean;
  arrangementEnabled: boolean;
  teacherEnabled: boolean;
  teacherQualification?: 'unqualified' | 'qualified';
  teacherCriticModel: string;
  tracingEnabled: boolean;
  port: number;
  host: string;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0)
    throw new Error('Expected a positive integer configuration value');
  return parsed;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const production = env.NODE_ENV === 'production';
  const publicOrigin = env.PUBLIC_ORIGIN ?? (production ? '' : 'http://127.0.0.1:5173');
  if (publicOrigin && new URL(publicOrigin).origin !== publicOrigin)
    throw new Error('PUBLIC_ORIGIN must be an origin without a path');
  if (production && publicOrigin && !publicOrigin.startsWith('https://'))
    throw new Error('Production PUBLIC_ORIGIN must use HTTPS');
  const sessionSecret =
    env.SESSION_SECRET && env.SESSION_SECRET.length >= 32 ? env.SESSION_SECRET : undefined;
  const forgeProject = env.FORGE_PROJECT;
  if (forgeProject && !/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(forgeProject))
    throw new Error('FORGE_PROJECT must be entity/project');
  const forgeBaseUrl = env.FORGE_BASE_URL ?? 'https://api.inference.wandb.ai/v1';
  if (new URL(forgeBaseUrl).protocol !== 'https:') throw new Error('FORGE_BASE_URL must use HTTPS');
  const databaseUrl = env.DATABASE_URL;
  const forgeApiKey = env.WANDB_API_KEY;
  return {
    production,
    publicOrigin,
    databaseUrl,
    sessionSecret,
    forgeApiKey,
    forgeProject,
    forgeBaseUrl,
    forgeModel: env.FORGE_MODEL ?? 'openai/gpt-oss-20b',
    dailyTokenLimit: positiveInteger(env.FORGE_DAILY_TOKEN_LIMIT, 1_000_000),
    cloudEnabled:
      env.CLOUD_COACH_ENABLED === 'true' &&
      !!(publicOrigin && databaseUrl && sessionSecret && forgeApiKey && forgeProject),
    arrangementEnabled: env.ARRANGEMENT_AGENT_ENABLED === 'true',
    teacherEnabled: env.TEACHER_AGENT_ENABLED === 'true',
    teacherQualification: env.TEACHER_QUALIFICATION === 'qualified' ? 'qualified' : 'unqualified',
    teacherCriticModel: env.TEACHER_CRITIC_MODEL ?? env.FORGE_MODEL ?? 'openai/gpt-oss-20b',
    tracingEnabled: env.FORGE_TRACING_ENABLED === 'true',
    port: positiveInteger(env.PORT, 3000),
    host: env.HOST ?? '127.0.0.1',
  };
}
