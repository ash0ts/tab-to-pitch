import { registerAudio } from './audio.js';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { z } from 'zod';
import {
  coachRequestSchema,
  forgeCoachVersions,
  localCoach,
  proposalForCandidate,
  type CoachResponse,
  type SessionStatus,
} from '../src/shared/coach.js';
import {
  arrangementRequestSchema,
  localArrangement,
  validateArrangementResponse,
} from '../src/shared/arrangements.js';
import {
  ForgeArrangementAgent,
  ARRANGEMENT_DEADLINE_MS,
  ARRANGEMENT_TOKEN_RESERVATION,
  type ArrangementAgent,
} from './arrangements.js';
import { invitationHash, newToken, sessionHash } from './auth.js';
import { readConfig, type ServerConfig } from './config.js';
import {
  ForgeCoachAgent,
  ForgeFailure,
  COACH_DEADLINE_MS,
  COACH_TOKEN_RESERVATION,
  type CoachAgent,
} from './forge-agent.js';
import { PostgresRepository } from './postgres.js';
import type { CoachRepository, PracticeSession } from './repository.js';
import { teacherRequestSchema } from '../src/shared/teacher.js';
import { localTeacher, validateTeacherTurn } from '../src/engine/teacher.js';
import { ForgeTeacherAgent, type TeacherAgent } from './teacher.js';
import {
  TEACHER_DEADLINE_MS,
  TEACHER_MAX_HTTP_REQUEST_BYTES,
  TEACHER_TOKEN_RESERVATION,
} from './teacher-limits.js';
import { teacherConversationId } from './teacher-identity.js';

export interface AppOptions {
  config?: ServerConfig;
  repository?: CoachRepository;
  agent?: CoachAgent;
  arrangementAgent?: ArrangementAgent;
  teacherAgent?: TeacherAgent;
  staticRoot?: string;
  now?: () => Date;
}

export async function buildApp(options: AppOptions = {}) {
  const config = options.config ?? readConfig();
  const repository =
    options.repository ??
    (config.databaseUrl ? new PostgresRepository(config.databaseUrl) : undefined);
  const agent = options.agent ?? (config.cloudEnabled ? new ForgeCoachAgent(config) : undefined);
  const arrangementAgent =
    options.arrangementAgent ??
    (config.cloudEnabled ? new ForgeArrangementAgent(config) : undefined);
  const teacherAgent =
    options.teacherAgent ??
    (config.cloudEnabled && config.teacherEnabled ? new ForgeTeacherAgent(config) : undefined);
  const now = options.now ?? (() => new Date());
  const app = Fastify({
    logger: false,
    bodyLimit: 64 * 1024,
    requestTimeout: 30_000,
    trustProxy: false,
  });
  await app.register(cookie);
  const cookieName = config.production ? '__Host-ttp_session' : 'ttp_session';
  const cookieOptions = {
    path: '/',
    httpOnly: true,
    secure: config.production,
    sameSite: 'strict' as const,
  };
  const exchangeRate = new Map<string, { count: number; resetAt: number }>();
  const sessionFor = async (token?: string): Promise<PracticeSession | null> => {
    if (!repository || !config.sessionSecret || !token || !/^[A-Za-z0-9_-]{43}$/.test(token))
      return null;
    return repository.getSession(sessionHash(token, config.sessionSecret), now());
  };

  app.addHook('onRequest', async (request, reply) => {
    reply
      .header('X-Content-Type-Options', 'nosniff')
      .header('Referrer-Policy', 'strict-origin-when-cross-origin')
      .header('X-Frame-Options', 'DENY');
    // Fastify decodes route segments, so raw URLs such as /%61pi/session reach the API too.
    if ((request.routeOptions.url ?? request.url).startsWith('/api/')) {
      reply.header('Cache-Control', 'no-store');
      if (
        ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) &&
        (!config.publicOrigin || request.headers.origin !== config.publicOrigin)
      ) {
        return reply.code(403).send({ error: 'origin-not-allowed' });
      }
    }
  });
  app.setErrorHandler((error, _request, reply) => {
    const parsed = z.object({ statusCode: z.number().int().min(400).max(499) }).safeParse(error);
    const status = parsed.success ? parsed.data.statusCode : 500;
    return reply
      .code(status)
      .send({ error: status === 500 ? 'request-failed' : 'invalid-request' });
  });
  const audioService = await registerAudio(app, config);
  app.get('/api/health', async () => ({
    ok: true,
    cloudEnabled: config.cloudEnabled,
    teacherEnabled: config.cloudEnabled && config.teacherEnabled,
    teacherQualification: config.teacherQualification ?? 'unqualified',
    version: '0.1.0',
  }));
  app.get('/health', async () => ({ ok: true }));
  app.get('/healthz', async () => ({ ok: true }));
  app.get('/api/session', async (request): Promise<SessionStatus> => {
    try {
      const session = await sessionFor(request.cookies[cookieName]);
      return {
        authenticated: !!session,
        cloudEnabled: config.cloudEnabled,
        ...(session ? { expiresAt: session.expiresAt.toISOString() } : {}),
      };
    } catch {
      return { authenticated: false, cloudEnabled: false };
    }
  });
  app.post('/api/invitations/exchange', async (request, reply) => {
    if (!config.cloudEnabled || !repository || !config.sessionSecret)
      return reply.code(503).send({ error: 'cloud-disabled' });
    const timestamp = now().getTime();
    // Bounded memory, including clients that send only invalid tokens.
    if (exchangeRate.size >= 1000) {
      for (const [key, value] of exchangeRate)
        if (value.resetAt <= timestamp) exchangeRate.delete(key);
      if (exchangeRate.size >= 1000 && !exchangeRate.has(request.ip))
        return reply.code(429).send({ error: 'try-later' });
    }
    const rate = exchangeRate.get(request.ip);
    if (rate && rate.resetAt > timestamp && rate.count >= 10)
      return reply.code(429).send({ error: 'try-later' });
    exchangeRate.set(request.ip, {
      count: rate && rate.resetAt > timestamp ? rate.count + 1 : 1,
      resetAt: rate && rate.resetAt > timestamp ? rate.resetAt : timestamp + 60_000,
    });
    const parsed = z
      .object({ invitation: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
      .strict()
      .safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid-invitation' });
    const token = newToken();
    const session = await repository.exchangeInvitation(
      invitationHash(parsed.data.invitation),
      sessionHash(token, config.sessionSecret),
      new Date(timestamp + 24 * 60 * 60 * 1000),
      now(),
    );
    if (!session) return reply.code(401).send({ error: 'invalid-invitation' });
    // Re-exchange rotates this browser's session, preventing unused session accumulation.
    const previous = request.cookies[cookieName];
    if (previous && /^[A-Za-z0-9_-]{43}$/.test(previous))
      await repository.revokeSession(sessionHash(previous, config.sessionSecret));
    reply.setCookie(cookieName, token, { ...cookieOptions, expires: session.expiresAt });
    return {
      authenticated: true,
      cloudEnabled: true,
      expiresAt: session.expiresAt.toISOString(),
    } satisfies SessionStatus;
  });
  app.delete('/api/session', async (request, reply) => {
    const token = request.cookies[cookieName];
    try {
      if (token && repository && config.sessionSecret)
        await repository.revokeSession(sessionHash(token, config.sessionSecret));
    } finally {
      reply.clearCookie(cookieName, cookieOptions);
    }
    return { authenticated: false, cloudEnabled: config.cloudEnabled } satisfies SessionStatus;
  });
  app.post('/api/coach/next', async (request, reply): Promise<CoachResponse | unknown> => {
    const parsed = coachRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid-coach-context' });
    const { context, requestId } = parsed.data;
    if (!config.cloudEnabled || !repository || !agent) return localCoach(context, 'disabled');
    let session: PracticeSession | null;
    try {
      session = await sessionFor(request.cookies[cookieName]);
    } catch {
      return localCoach(context, 'unavailable');
    }
    if (!session) return localCoach(context, 'session-required');
    try {
      const reservation = await repository.reserveBudget(
        session.invitationId,
        requestId,
        COACH_TOKEN_RESERVATION,
        config.dailyTokenLimit,
        now(),
      );
      if (!reservation.ok) return localCoach(context, reservation.reason);
    } catch {
      return localCoach(context, 'unavailable');
    }
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), COACH_DEADLINE_MS);
    timer.unref();
    const disconnected = () => {
      if (!reply.raw.writableEnded) abort.abort();
    };
    reply.raw.on('close', disconnected);
    let charged = COACH_TOKEN_RESERVATION;
    let response: CoachResponse;
    try {
      const result = await agent.run(context, abort.signal);
      charged = result.chargedTokens;
      response = {
        source: 'forge',
        versions: forgeCoachVersions(config.forgeModel),
        proposal: proposalForCandidate(context, result.candidateId),
        ...(result.traceId ? { traceId: result.traceId } : {}),
      };
    } catch (error) {
      if (error instanceof ForgeFailure) charged = error.chargedTokens;
      response = localCoach(context, error instanceof ForgeFailure ? error.reason : 'unavailable');
    } finally {
      clearTimeout(timer);
      reply.raw.off('close', disconnected);
      // Failed settlements retain the full reservation, so outages cannot create free usage.
      try {
        await repository.settleBudget(session.invitationId, requestId, charged);
      } catch {
        /* Fail closed; the persisted reservation remains. */
      }
    }
    return response;
  });
  app.post('/api/arrangements/propose', async (request, reply) => {
    const parsed = arrangementRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid-arrangement-context' });
    const context = parsed.data;
    const fallback = (reason: Parameters<typeof localArrangement>[1]) =>
      localArrangement(context, reason);
    if (!config.cloudEnabled || !config.arrangementEnabled || !repository || !arrangementAgent)
      return fallback('disabled');
    let session: PracticeSession | null;
    try {
      session = await sessionFor(request.cookies[cookieName]);
    } catch {
      return fallback('unavailable');
    }
    if (!session) return fallback('session-required');
    try {
      const reserved = await repository.reserveBudget(
        session.invitationId,
        context.requestId,
        ARRANGEMENT_TOKEN_RESERVATION,
        config.dailyTokenLimit,
        now(),
      );
      if (!reserved.ok) return fallback(reserved.reason);
    } catch {
      return fallback('unavailable');
    }
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), ARRANGEMENT_DEADLINE_MS);
    timer.unref();
    const disconnected = () => {
      if (!reply.raw.writableEnded) abort.abort();
    };
    reply.raw.on('close', disconnected);
    let charged = ARRANGEMENT_TOKEN_RESERVATION;
    try {
      const result = await arrangementAgent.run(context, abort.signal);
      if (
        !Number.isSafeInteger(result.chargedTokens) ||
        result.chargedTokens < 0 ||
        result.chargedTokens > ARRANGEMENT_TOKEN_RESERVATION
      )
        throw new Error('Invalid accounting');
      charged = result.chargedTokens;
      const response = validateArrangementResponse(result.response, context);
      // An invitation can be revoked while the provider is generating a proposal.
      if (!(await sessionFor(request.cookies[cookieName]))) return fallback('session-required');
      return response;
    } catch (error) {
      if (error instanceof ForgeFailure) charged = error.chargedTokens;
      return fallback(error instanceof ForgeFailure ? error.reason : 'unavailable');
    } finally {
      clearTimeout(timer);
      reply.raw.off('close', disconnected);
      try {
        await repository.settleBudget(session.invitationId, context.requestId, charged);
      } catch {
        /* Reservation remains charged on failure. */
      }
    }
  });
  app.post(
    '/api/teacher/next',
    { bodyLimit: TEACHER_MAX_HTTP_REQUEST_BYTES },
    async (request, reply) => {
      const parsed = teacherRequestSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: 'invalid-teacher-context' });
      const context = parsed.data;
      const fallback = (reason: string) => localTeacher(context, reason);
      if (
        !config.cloudEnabled ||
        !config.teacherEnabled ||
        !repository ||
        !teacherAgent ||
        !config.sessionSecret
      )
        return fallback('disabled');
      let session: PracticeSession | null;
      try {
        session = await sessionFor(request.cookies[cookieName]);
      } catch {
        return fallback('unavailable');
      }
      if (!session) return fallback('session-required');
      try {
        const reserved = await repository.reserveBudget(
          session.invitationId,
          context.requestId,
          TEACHER_TOKEN_RESERVATION,
          config.dailyTokenLimit,
          now(),
        );
        if (!reserved.ok) return fallback(reserved.reason);
      } catch {
        return fallback('unavailable');
      }
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), TEACHER_DEADLINE_MS);
      timer.unref();
      const disconnected = () => {
        if (!reply.raw.writableEnded) abort.abort();
      };
      reply.raw.on('close', disconnected);
      let charged = TEACHER_TOKEN_RESERVATION;
      try {
        const result = await teacherAgent.run(context, abort.signal, {
          requestAudioAnalysis: audioService?.requestAnalysis,
          conversationId: teacherConversationId(
            config.sessionSecret,
            session.invitationId,
            context.lessonId,
          ),
        });
        if (
          !Number.isSafeInteger(result.chargedTokens) ||
          result.chargedTokens < 0 ||
          result.chargedTokens > TEACHER_TOKEN_RESERVATION
        )
          throw new Error('Invalid accounting');
        charged = result.chargedTokens;
        if (abort.signal.aborted) return fallback('cancelled-or-timeout');
        if (!(await sessionFor(request.cookies[cookieName]))) return fallback('session-required');
        return validateTeacherTurn(result.response, context) ?? fallback('invalid-response');
      } catch (error) {
        if (
          error instanceof ForgeFailure &&
          Number.isSafeInteger(error.chargedTokens) &&
          error.chargedTokens >= 0 &&
          error.chargedTokens <= TEACHER_TOKEN_RESERVATION
        )
          charged = error.chargedTokens;
        return fallback(error instanceof ForgeFailure ? error.reason : 'unavailable');
      } finally {
        clearTimeout(timer);
        reply.raw.off('close', disconnected);
        try {
          await repository.settleBudget(session.invitationId, context.requestId, charged);
        } catch {
          /* Failed settlement retains the full reservation. */
        }
      }
    },
  );
  if (options.staticRoot) {
    await app.register(fastifyStatic, { root: options.staticRoot, wildcard: false });
    app.setNotFoundHandler(async (request, reply) => {
      if (request.url.startsWith('/api/')) return reply.code(404).send({ error: 'not-found' });
      // Hashed assets and worker/SoundFont files must produce a real 404 when missing.
      if (request.method !== 'GET' || request.url.split('?')[0]!.includes('.'))
        return reply.code(404).send({ error: 'not-found' });
      return reply.type('text/html').sendFile('index.html');
    });
  }
  app.addHook('onClose', async () => {
    await agent?.close();
    await arrangementAgent?.close();
    await teacherAgent?.close();
    await repository?.close();
  });
  return app;
}
