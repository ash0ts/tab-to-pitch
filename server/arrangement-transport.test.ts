import { describe, it, expect } from 'vitest';
import { actionCompletionSchema, decodeAction } from './arrangement-transport.js';
const content = (value: string) =>
  actionCompletionSchema.parse({
    choices: [{ finish_reason: 'stop', message: { content: value, tool_calls: [] } }],
  });
describe('strict coordinator action transport', () => {
  it('distinguishes native function calls from coordinator-parsed JSON', () => {
    const native = actionCompletionSchema.parse({
      choices: [
        {
          finish_reason: 'tool_calls',
          message: {
            tool_calls: [
              {
                id: 'actual-call',
                type: 'function',
                function: { name: 'interpret_arrangement', arguments: '{"action":"clarify"}' },
              },
            ],
          },
        },
      ],
    });
    expect(decodeAction(native, 'interpret_arrangement')).toMatchObject({
      protocol: 'native-tool',
      args: { action: 'clarify' },
      call: { id: 'actual-call' },
    });
    expect(decodeAction(content('{"action":"clarify"}'), 'interpret_arrangement')).toMatchObject({
      protocol: 'strict-json-action',
      args: { action: 'clarify' },
      call: null,
    });
  });
  it.each([
    '```json\n{"action":"clarify"}\n```',
    'Here is {"action":"clarify"}',
    '[{"action":"clarify"}]',
    '{"action":"propose","action":"reject"}',
    '{"act\\u0069on":"propose","action":"reject"}',
    '{"action":"clarify"} {"action":"reject"}',
  ])('rejects non-single or duplicate JSON: %s', (value) => {
    expect(() => decodeAction(content(value), 'interpret_arrangement')).toThrow();
  });
  it('does not salvage a partial response or a wrong native function name', () => {
    const partial = content('{"action":"clarify"}');
    partial.choices[0]!.finish_reason = 'length';
    expect(() => decodeAction(partial, 'interpret_arrangement')).toThrow();
    const wrong = actionCompletionSchema.parse({
      choices: [
        {
          finish_reason: 'tool_calls',
          message: {
            tool_calls: [
              { id: 'call', type: 'function', function: { name: 'execute_code', arguments: '{}' } },
            ],
          },
        },
      ],
    });
    expect(() => decodeAction(wrong, 'interpret_arrangement')).toThrow();
  });
});
