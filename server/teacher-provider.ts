import { z } from 'zod';
import { actionCompletionSchema } from './arrangement-transport.js';
import type { ServerConfig } from './config.js';
import { ForgeFailure } from './forge-agent.js';
import type { AgentTrace } from './tracing.js';
import { decodeTeacherAction } from './teacher-transport.js';
import { teacherActorStepSchema, teacherActionSchema } from '../src/shared/teacher.js';
import { practiceActionSchema } from '../src/shared/practice.js';
import { homeworkActionSchema } from '../src/shared/homework.js';
import { teacherToolArgumentSchemas } from '../src/shared/teacher-tools.js';
import { teacherToolDescriptions } from '../src/engine/teacher.js';
import {
  TEACHER_ACTOR_COMPLETION_TOKENS,
  TEACHER_CRITIC_COMPLETION_TOKENS,
  TEACHER_MAX_ACTOR_CALLS,
  TEACHER_MAX_MODEL_REQUEST_BYTES,
  TEACHER_TOKEN_RESERVATION,
} from './teacher-limits.js';

const usageSchema = z
  .object({
    prompt_tokens: z.number().int().nonnegative(),
    completion_tokens: z.number().int().nonnegative(),
    total_tokens: z.number().int().nonnegative(),
  })
  .refine((usage) => usage.total_tokens >= usage.prompt_tokens + usage.completion_tokens);

/** Keep the transport grammar compact. Bounds and patterns are enforced by the full local Zod schema; types, required fields, unions and enums remain in the provider grammar. */
export function teacherProviderSchema(schema: z.ZodType): unknown {
  const project = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(project);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) =>
            ![
              'propertyNames',
              '$schema',
              'minLength',
              'maxLength',
              'minimum',
              'maximum',
              'minItems',
              'maxItems',
              'pattern',
              'format',
            ].includes(key),
        )
        .map(([key, item]) => [key, project(item)]),
    );
  };
  return project(z.toJSONSchema(schema, { target: 'draft-7' }));
}

export interface TeacherCallReceipt {
  role: 'actor' | 'critic';
  model: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  protocol?: 'native-tool' | 'strict-json-action';
  status: 'received' | 'failed';
  failure?: string;
  httpStatus?: number;
  finishReason?: string | null;
}

/** A turn owns this object so actor and critic share one accounting envelope. */
export class TeacherProvider {
  readonly calls: TeacherCallReceipt[] = [];
  private charged = 0;
  private unknown = false;
  private inFlight = false;
  private actors = 0;
  private critics = 0;
  constructor(
    private readonly config: ServerConfig,
    private readonly fetcher: typeof fetch,
    private readonly trace: AgentTrace,
    private readonly signal: AbortSignal,
  ) {}
  get chargedTokens(): number {
    return this.unknown || this.inFlight
      ? TEACHER_TOKEN_RESERVATION
      : Math.min(this.charged, TEACHER_TOKEN_RESERVATION);
  }
  private headers() {
    return {
      Authorization: `Bearer ${this.config.forgeApiKey}`,
      'OpenAI-Project': this.config.forgeProject!,
      'Content-Type': 'application/json',
    };
  }
  async verifyModels() {
    this.signal.throwIfAborted();
    const response = await this.fetcher(`${this.config.forgeBaseUrl}/models`, {
      headers: this.headers(),
      signal: this.signal,
    });
    if (!response.ok) throw new ForgeFailure('unavailable', 0);
    const catalog = z
      .object({ data: z.array(z.object({ id: z.string() })) })
      .parse(await response.json());
    if (
      !response.ok ||
      ![this.config.forgeModel, this.config.teacherCriticModel].every((id) =>
        catalog.data.some((model) => model.id === id),
      )
    )
      throw new ForgeFailure('unavailable', 0);
  }
  async complete(
    role: 'actor' | 'critic',
    messages: Record<string, unknown>[],
    schema: z.ZodType,
    capabilities: { homework?: boolean; practice?: boolean; listening?: boolean } = {},
  ) {
    this.signal.throwIfAborted();
    if (
      (role === 'actor' && this.actors >= TEACHER_MAX_ACTOR_CALLS) ||
      (role === 'critic' && this.critics >= 1)
    )
      throw new ForgeFailure('invalid-response', this.chargedTokens);
    const name = role === 'actor' ? 'teacher_step' : 'review_teacher_reply';
    const model = role === 'actor' ? this.config.forgeModel : this.config.teacherCriticModel;
    const tools = Object.entries(teacherToolArgumentSchemas).filter(([name]) =>
      name.startsWith('homework_')
        ? capabilities.homework
        : name === 'practice_activity'
          ? capabilities.practice && !capabilities.homework
          : ['inspect_passage', 'listening_activity'].includes(name)
            ? capabilities.listening
            : true,
    );
    const actionOptions = teacherActionSchema.options.filter((option) => {
      if (option === practiceActionSchema) return capabilities.practice && !capabilities.homework;
      if (option === homeworkActionSchema) return capabilities.homework;
      if (!('shape' in option)) return false;
      return option.shape.type.value !== 'listening' || capabilities.listening;
    });
    const finalSchema = teacherActorStepSchema.options[1]!.extend({
      actions: z.array(z.union(actionOptions)).max(4),
    });
    const body = JSON.stringify({
      model,
      messages,
      tools: [
        {
          type: 'function',
          function: {
            name,
            description:
              role === 'actor'
                ? 'Request musical tools or return a final teacher reply.'
                : 'Review the entire teacher reply against verified evidence.',
            parameters: teacherProviderSchema(
              role === 'actor' && schema === teacherActorStepSchema ? finalSchema : schema,
            ),
            strict: true,
          },
        },
        ...(role === 'actor'
          ? tools.map(([toolName, args]) => ({
              type: 'function',
              function: {
                name: toolName,
                description:
                  teacherToolDescriptions[toolName as keyof typeof teacherToolDescriptions],
                parameters: teacherProviderSchema(args),
                strict: true,
              },
            }))
          : []),
      ],
      tool_choice: role === 'actor' ? 'required' : { type: 'function', function: { name } },
      parallel_tool_calls: false,
      max_tokens:
        role === 'actor' ? TEACHER_ACTOR_COMPLETION_TOKENS : TEACHER_CRITIC_COMPLETION_TOKENS,
      temperature: 0,
    });
    if (Buffer.byteLength(body) > TEACHER_MAX_MODEL_REQUEST_BYTES)
      throw new ForgeFailure('invalid-response', this.chargedTokens);
    if (role === 'actor') this.actors += 1;
    else this.critics += 1;
    const receipt: TeacherCallReceipt = { role, model, latencyMs: 0, status: 'failed' };
    this.calls.push(receipt);
    const started = Date.now();
    try {
      const completion = await this.trace.model(
        model,
        async () => {
          this.inFlight = true;
          const response = await this.fetcher(`${this.config.forgeBaseUrl}/chat/completions`, {
            method: 'POST',
            headers: this.headers(),
            body,
            signal: this.signal,
          });
          receipt.httpStatus = response.status;
          const text = await response.text();
          if (Buffer.byteLength(text) > 262_144) throw new Error('Provider response too large');
          let raw: unknown;
          try {
            raw = JSON.parse(text);
          } catch {
            this.unknown = true;
            this.inFlight = false;
            if (!response.ok) throw new ForgeFailure('unavailable', this.chargedTokens);
            throw new Error('Provider returned non-JSON content');
          }
          const usage = z.object({ usage: usageSchema }).safeParse(raw);
          if (usage.success) {
            this.charged += usage.data.usage.total_tokens;
            Object.assign(receipt, {
              inputTokens: usage.data.usage.prompt_tokens,
              outputTokens: usage.data.usage.completion_tokens,
              totalTokens: usage.data.usage.total_tokens,
            });
          } else this.unknown = true;
          this.inFlight = false;
          if (!response.ok) throw new ForgeFailure('unavailable', this.chargedTokens);
          const completion = actionCompletionSchema.parse(raw);
          receipt.finishReason = completion.choices[0]?.finish_reason;
          return completion;
        },
        (value) => ({
          inputTokens: value.usage?.prompt_tokens,
          outputTokens: value.usage?.completion_tokens,
        }),
      );
      const decoded = this.trace.tool(
        role === 'actor' ? 'decode_teacher_step' : 'decode_teacher_review',
        () => decodeTeacherAction(completion, name),
      );
      receipt.protocol = decoded.protocol;
      receipt.status = 'received';
      return decoded;
    } catch (error) {
      receipt.failure =
        error instanceof Error ? error.message.slice(0, 160) : 'Provider request failed';
      throw error;
    } finally {
      receipt.latencyMs = Date.now() - started;
    }
  }
}
