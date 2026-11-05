import { audioJobReceiptSchema } from '../src/shared/audio.js';
import { tracing } from '@coreweave/forge-sdk/agentlens';
import { COACH_POLICY_VERSION, COACH_PROMPT_VERSION } from '../src/shared/coach.js';
import type { ServerConfig } from './config.js';

export function audioTraceProjection(name: string, result: unknown): Record<string, string> {
  if (name !== 'audio_job_receipt' || !result || typeof result !== 'object' || !('data' in result))
    return {};
  const data = result.data;
  if (!data || typeof data !== 'object' || !('job' in data)) return {};
  const parsed = audioJobReceiptSchema.safeParse(data.job);
  return parsed.success ? { audioJobId: parsed.data.id, audioJobStatus: parsed.data.status } : {};
}
export interface AgentTrace {
  id?: string;
  /** Fixed failure category only; never pass learner or model content. */
  fail?(reason: 'validation' | 'critic' | 'unavailable' | 'limit'): void;
  account?(values: {
    actorCalls: number;
    criticCalls: number;
    toolCalls: number;
    chargedTokens: number;
    reservedTokens: number;
  }): void;
  model<T>(
    model: string,
    work: () => Promise<T>,
    usage: (result: T) => { inputTokens?: number; outputTokens?: number },
  ): Promise<T>;
  tool<T>(name: string, work: () => T): T;
}
const noTrace: AgentTrace = {
  model: async (_model, work) => work(),
  tool: (_name, work) => work(),
};
export interface TraceRunner {
  run<T>(
    work: (trace: AgentTrace) => Promise<T>,
    options?: { conversationId?: string },
  ): Promise<T>;
  close(): Promise<void>;
}
export function createTraceRunner(
  config: ServerConfig,
  options: Pick<tracing.TracingInitOptions, 'spanProcessor'> = {},
  identity = {
    agentName: 'tab-to-pitch-coach',
    policy: COACH_POLICY_VERSION,
    prompt: COACH_PROMPT_VERSION,
  },
): TraceRunner {
  let initialized: Promise<boolean> | undefined;
  async function enabled(): Promise<boolean> {
    if (
      !config.tracingEnabled ||
      !config.cloudEnabled ||
      !config.forgeApiKey ||
      !config.forgeProject
    )
      return false;
    initialized ??= tracing
      .init(config.forgeProject, {
        apiKey: config.forgeApiKey,
        serviceName: identity.agentName,
        ...options,
      })
      .then(() => true)
      .catch(() => false);
    return initialized;
  }
  return {
    async run(work, runOptions) {
      if (!(await enabled())) return work(noTrace);
      return tracing.runIsolated(async () => {
        const conversation = tracing.startConversation({
          ...(runOptions?.conversationId ? { conversationId: runOptions.conversationId } : {}),
          agentName: identity.agentName,
          agentVersion: '1',
          attributes: {
            'ttp.schema_version': 1,
            'ttp.prompt_version': identity.prompt,
            'ttp.policy_version': identity.policy,
            'ttp.payload_policy': 'no-learner-content',
          },
        });
        const turn = conversation.startTurn({ userMessage: 'Choose a validated proposal.' });
        let failure: Error | undefined;
        const trace: AgentTrace = {
          id: conversation.conversationId,
          fail(reason) {
            failure = new Error(`Agent attempt failed: ${reason}`);
          },
          account(values) {
            if (Object.values(values).some((value) => !Number.isSafeInteger(value) || value < 0))
              return;
            turn.setAttributes({
              'ttp.actor_calls': values.actorCalls,
              'ttp.critic_calls': values.criticCalls,
              'ttp.tool_calls': values.toolCalls,
              'ttp.charged_tokens': values.chargedTokens,
              'ttp.reserved_tokens': values.reservedTokens,
            });
          },
          async model(model, execute, getUsage) {
            const llm = turn.startLLM({ model, providerName: 'coreweave' });
            try {
              const result = await execute();
              llm.record({ usage: getUsage(result) });
              // No provider messages, reasoning, learner evidence, or IDs enter traces.
              llm.output('Bounded tool request received.');
              return result;
            } catch (error) {
              llm.end({ error: new Error('Model request failed') });
              throw error;
            } finally {
              llm.end();
            }
          },
          tool(name, execute) {
            const tool = turn.startTool({ name });
            try {
              const result = execute();
              const status =
                result && typeof result === 'object' && 'status' in result
                  ? result.status
                  : undefined;
              if (status === 'invalid')
                tool.end({ error: new Error('Tool validation failed'), errorType: 'validation' });
              else
                tool.end({
                  result: {
                    validated: status !== 'unavailable',
                    ...audioTraceProjection(name, result),
                  },
                });
              return result;
            } catch (error) {
              tool.end({ error: new Error('Tool validation failed'), errorType: 'validation' });
              throw error;
            }
          },
        };
        try {
          return await work(trace);
        } catch (error) {
          // Protocol validation can fail after a successful model span has closed.
          failure = new Error('Coach attempt failed');
          throw error;
        } finally {
          turn.end(failure ? { error: failure } : undefined);
          conversation.end(failure ? { error: failure } : undefined);
        }
      });
    },
    async close() {
      if (initialized && (await initialized)) await tracing.shutdown();
    },
  };
}
