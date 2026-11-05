import { tracing } from '@coreweave/forge-sdk/agentlens';
import type { TraceRunner } from '../../server/tracing.js';
import { stableUuid } from '../teacher-agent/adapter.js';
export function studyTrace(
  identity: string,
  arm: string,
  question: string,
  record: (id: string) => void,
): TraceRunner {
  return {
    close: async () => {},
    run: async (work) =>
      tracing.runIsolated(async () => {
        const conversation = tracing.startConversation({
          conversationId: stableUuid(identity),
          agentName: 'guitar-teacher-grounding-study',
          agentVersion: 'v1',
          attributes: {
            'ttp.campaign': 'guitar-teacher-grounding-v1',
            'ttp.arm': arm,
            'ttp.case_identity': identity,
            'ttp.payload_policy': 'licensed-symbolic-music-and-authored-requests',
            'ttp.learner_history_synthetic': true,
          },
        });
        record(conversation.conversationId);
        const turn = conversation.startTurn({ userMessage: question });
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
                span.end({ error: new Error('Retained model failure') });
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
                span.end({ error: new Error('Retained tool rejection') });
                throw error;
              }
            },
          });
        } catch (error) {
          failed = true;
          throw error;
        } finally {
          const error = failed ? { error: new Error('Retained study failure') } : undefined;
          turn.end(error);
          conversation.end(error);
        }
      }),
  };
}
