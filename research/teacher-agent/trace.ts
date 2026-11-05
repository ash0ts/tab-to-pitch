import { tracing } from '@coreweave/forge-sdk/agentlens';
import type { TraceRunner } from '../../server/tracing.js';
import { stableUuid } from './adapter.js';

/** Evaluation payloads contain authored data only. Production trace projection is separate. */
export function researchTrace(
  identity: {
    campaign: string;
    task: string;
    arm: string;
    trial: number;
    lesson: string;
    turn: number;
  },
  record: (id: string) => void,
): TraceRunner {
  return {
    close: async () => {},
    run: async (work, options) =>
      tracing.runIsolated(async () => {
        const conversation = tracing.startConversation({
          conversationId:
            options?.conversationId ??
            stableUuid(`${identity.campaign}:${identity.arm}:${identity.trial}:${identity.lesson}`),
          agentName: identity.arm.includes('judge')
            ? 'tab-to-pitch-teacher-evaluator'
            : 'tab-to-pitch-teacher-research',
          agentVersion: 'teacher-v1',
          attributes: {
            'ttp.synthetic': true,
            'ttp.payload_policy': 'authored-research-only',
            'ttp.campaign': identity.campaign,
            'ttp.task_id': identity.task,
            'ttp.arm': identity.arm,
            'ttp.trial': identity.trial,
            'ttp.turn': identity.turn,
          },
        });
        record(conversation.conversationId);
        const turn = conversation.startTurn({
          userMessage: 'Evaluate an authored music-teaching scenario.',
        });
        let failed = false;
        try {
          return await work({
            id: conversation.conversationId,
            fail: () => {
              failed = true;
            },
            model: async (model, execute, usage) => {
              const span = turn.startLLM({ model, providerName: 'coreweave' });
              try {
                const value = await execute();
                span.record({ usage: usage(value) });
                span.output(JSON.stringify(value));
                return value;
              } catch (error) {
                span.end({ error: new Error('Recorded model execution failed') });
                throw error;
              } finally {
                span.end();
              }
            },
            tool: (name, execute) => {
              const span = turn.startTool({ name });
              try {
                const result = execute();
                span.end({ result: JSON.parse(JSON.stringify(result ?? null)) });
                return result;
              } catch (error) {
                span.end({ error: new Error('Recorded tool rejected action') });
                throw error;
              }
            },
          });
        } catch (error) {
          failed = true;
          throw error;
        } finally {
          const error = failed ? { error: new Error('Recorded teacher turn failed') } : undefined;
          turn.end(error);
          conversation.end(error);
        }
      }),
  };
}
