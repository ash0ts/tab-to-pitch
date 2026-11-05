import { z } from 'zod';
import type { CoachContext } from '../src/shared/coach.js';
import type { ServerConfig } from './config.js';
import { createTraceRunner, type TraceRunner } from './tracing.js';

export const COACH_DEADLINE_MS = 20_000;
export const MAX_AGENT_STEPS = 2;
export const MAX_COMPLETION_TOKENS = 384;
const MAX_REQUEST_BYTES = 8192;
// Conservative byte-count envelope for both prompts, completion caps, and message framing.
export const COACH_TOKEN_RESERVATION =
  MAX_AGENT_STEPS * (MAX_REQUEST_BYTES + MAX_COMPLETION_TOKENS + 128);
export interface AgentResult {
  candidateId: string;
  chargedTokens: number;
  traceId?: string;
}
export interface CoachAgent {
  run(context: CoachContext, signal: AbortSignal): Promise<AgentResult>;
  close(): Promise<void>;
}
export class ForgeFailure extends Error {
  constructor(
    readonly reason: 'unavailable' | 'invalid-response',
    readonly chargedTokens: number,
  ) {
    super(reason);
  }
}

const toolCallSchema = z.object({
  id: z.string().min(1).max(128),
  type: z.literal('function'),
  function: z.object({
    name: z.enum(['inspect_practice', 'choose_drill']),
    arguments: z.string().max(1024),
  }),
});
const usageSchema = z
  .object({
    prompt_tokens: z.number().int().nonnegative(),
    completion_tokens: z.number().int().nonnegative(),
    total_tokens: z.number().int().nonnegative(),
  })
  .refine((usage) => usage.total_tokens >= usage.prompt_tokens + usage.completion_tokens);
const responseSchema = z.object({
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullish(),
        message: z.object({ tool_calls: z.array(toolCallSchema).length(1) }),
      }),
    )
    .min(1),
  usage: usageSchema.optional(),
});

/** Deliberately excludes labels, note IDs, score IDs, timestamps, and free-form text. */
export function modelContext(context: CoachContext) {
  return {
    phrase: {
      noteCount: context.phrase.noteCount,
      distinctPitchClasses: context.phrase.distinctPitchClasses,
      stringCrossings: context.phrase.stringCrossings,
      positionChanges: context.phrase.positionChanges,
    },
    candidates: context.candidates.map((candidate, index) => {
      const evidence = context.evidence.filter((item) => item.skillId === candidate.skillId);
      return {
        candidate: `c${index}`,
        kind: candidate.kind,
        attempts: evidence.reduce((sum, item) => sum + item.attempts, 0),
        correct: evidence.reduce((sum, item) => sum + item.correct, 0),
        assisted: evidence.reduce((sum, item) => sum + item.assisted, 0),
      };
    }),
  };
}

export class ForgeCoachAgent implements CoachAgent {
  private readonly tracer: TraceRunner;
  private catalogVerifiedAt = 0;
  constructor(
    private readonly config: ServerConfig,
    private readonly fetcher: typeof fetch = fetch,
    tracer?: TraceRunner,
  ) {
    this.tracer = tracer ?? createTraceRunner(config);
  }
  private async verifyModel(signal: AbortSignal): Promise<void> {
    if (Date.now() - this.catalogVerifiedAt < 60_000) return;
    try {
      const result = await this.fetcher(`${this.config.forgeBaseUrl}/models`, {
        signal,
        headers: this.headers(),
      });
      if (!result.ok) throw new Error('Catalog unavailable');
      const body = z
        .object({ data: z.array(z.object({ id: z.string() })) })
        .parse(await result.json());
      if (!body.data.some((item) => item.id === this.config.forgeModel))
        throw new Error('Model unavailable');
      this.catalogVerifiedAt = Date.now();
    } catch {
      throw new ForgeFailure('unavailable', 0);
    }
  }
  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.forgeApiKey}`,
      'OpenAI-Project': this.config.forgeProject!,
      'Content-Type': 'application/json',
    };
  }
  async run(context: CoachContext, signal: AbortSignal): Promise<AgentResult> {
    await this.verifyModel(signal);
    let totalTokens = 0;
    let unknownUsage = false;
    let inFlight = false;
    return this.tracer.run(async (trace) => {
      const inspect = {
        type: 'function',
        function: {
          name: 'inspect_practice',
          description: 'Read numeric recall evidence and eligible drill candidates.',
          parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
          strict: true,
        },
      };
      const choose = {
        type: 'function',
        function: {
          name: 'choose_drill',
          description:
            'Select one eligible drill. The app supplies its validated settings and explanation.',
          parameters: {
            type: 'object',
            properties: {
              candidate: {
                type: 'string',
                enum: context.candidates.map((_item, index) => `c${index}`),
              },
            },
            required: ['candidate'],
            additionalProperties: false,
          },
          strict: true,
        },
      };
      const messages: Record<string, unknown>[] = [
        {
          role: 'system',
          content:
            'You choose one recall drill for a guitarist. Inspect numeric practice evidence first. Prioritize mistakes, then assisted recall, then untested skills. On a tie choose the earliest listed candidate. Select only an eligible candidate. This is recall evidence, not proof of guitar performance or learning. Use tools only; do not produce prose.',
        },
        {
          role: 'user',
          content: 'Inspect my available drills, then choose the next useful recall drill.',
        },
      ];
      try {
        for (let step = 0; step < MAX_AGENT_STEPS; step += 1) {
          const expectedTool = step === 0 ? 'inspect_practice' : 'choose_drill';
          const body = JSON.stringify({
            model: this.config.forgeModel,
            messages,
            tools: [inspect, choose],
            tool_choice: { type: 'function', function: { name: expectedTool } },
            parallel_tool_calls: false,
            max_tokens: MAX_COMPLETION_TOKENS,
          });
          if (Buffer.byteLength(body) > MAX_REQUEST_BYTES)
            throw new ForgeFailure('invalid-response', totalTokens);
          const result = await trace.model(
            this.config.forgeModel,
            async () => {
              // A timeout can occur after generation; unknown usage consumes the reserved envelope.
              inFlight = true;
              const response = await this.fetcher(`${this.config.forgeBaseUrl}/chat/completions`, {
                method: 'POST',
                headers: this.headers(),
                body,
                signal,
              });
              if (!response.ok) throw new Error('Inference unavailable');
              const raw: unknown = await response.json();
              const usage = z.object({ usage: usageSchema }).safeParse(raw);
              if (usage.success) totalTokens += usage.data.usage.total_tokens;
              else unknownUsage = true;
              inFlight = false;
              return responseSchema.parse(raw);
            },
            (value) => ({
              inputTokens: value.usage?.prompt_tokens,
              outputTokens: value.usage?.completion_tokens,
            }),
          );
          if (totalTokens > COACH_TOKEN_RESERVATION)
            throw new ForgeFailure('unavailable', COACH_TOKEN_RESERVATION);
          const call = result.choices[0]!.message.tool_calls[0]!;
          if (call.function.name !== expectedTool || result.choices[0]!.finish_reason === 'length')
            throw new ForgeFailure('invalid-response', totalTokens);
          const args: unknown = JSON.parse(call.function.arguments);
          if (step === 0) {
            z.object({}).strict().parse(args);
            const state = trace.tool('inspect_practice', () => modelContext(context));
            messages.push(
              { role: 'assistant', content: null, tool_calls: [call] },
              { role: 'tool', tool_call_id: call.id, content: JSON.stringify(state) },
            );
          } else {
            const { candidate } = z
              .object({ candidate: z.string().regex(/^c\d{1,2}$/) })
              .strict()
              .parse(args);
            const selected = trace.tool('choose_drill', () => {
              const item = context.candidates[Number(candidate.slice(1))];
              if (!item || `c${Number(candidate.slice(1))}` !== candidate)
                throw new Error('Ineligible candidate');
              return item;
            });
            return {
              candidateId: selected.id,
              chargedTokens: unknownUsage ? COACH_TOKEN_RESERVATION : totalTokens,
              traceId: trace.id,
            };
          }
        }
        throw new ForgeFailure('invalid-response', totalTokens);
      } catch (error) {
        const reason =
          error instanceof ForgeFailure
            ? error.reason
            : error instanceof z.ZodError || error instanceof SyntaxError
              ? 'invalid-response'
              : 'unavailable';
        throw new ForgeFailure(
          reason,
          unknownUsage || inFlight
            ? COACH_TOKEN_RESERVATION
            : Math.min(totalTokens, COACH_TOKEN_RESERVATION),
        );
      }
    });
  }
  async close(): Promise<void> {
    await this.tracer.close();
  }
}
