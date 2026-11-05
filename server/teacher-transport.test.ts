import { expect, it } from 'vitest';
import { decodeTeacherAction, parseTeacherJson } from './teacher-transport.js';

it('rejects duplicate keys per object while accepting repeated coordinate field names', () => {
  expect(parseTeacherJson('{"pairs":[{"string":2,"fret":6},{"string":2,"fret":5}]}')).toEqual({
    pairs: [
      { string: 2, fret: 6 },
      { string: 2, fret: 5 },
    ],
  });
  expect(() => parseTeacherJson('{"note":"F","note":"E"}')).toThrow('Duplicate');
  expect(() => parseTeacherJson('{"note":"F","\\u006eote":"E"}')).toThrow('Duplicate');
  expect(() => parseTeacherJson('{"nested":{"note":"F","note":"E"}}')).toThrow('Duplicate');
  expect(() => parseTeacherJson('```json\n{}\n```')).toThrow();
  expect(() => parseTeacherJson('{} {}')).toThrow();
  expect(() => parseTeacherJson('[]')).toThrow();
});

it('accepts only a complete tool call or a complete JSON action', () => {
  const raw = { choices: [{ finish_reason: 'stop', message: { content: '{"kind":"tools"}' } }] };
  expect(decodeTeacherAction(raw, 'teacher_step').protocol).toBe('strict-json-action');
  expect(() =>
    decodeTeacherAction(
      { choices: [{ ...raw.choices[0]!, finish_reason: 'length' }] },
      'teacher_step',
    ),
  ).toThrow();
  expect(() =>
    decodeTeacherAction(
      {
        choices: [
          {
            finish_reason: 'tool_calls',
            message: {
              content: 'Unchecked prose',
              tool_calls: [
                { id: 'x', type: 'function', function: { name: 'teacher_step', arguments: '{}' } },
              ],
            },
          },
        ],
      },
      'teacher_step',
    ),
  ).toThrow();
});

it('normalizes a declared native musical tool into the same validated actor step', () => {
  const raw = {
    choices: [
      {
        finish_reason: 'tool_calls',
        message: {
          tool_calls: [
            {
              id: 'inspect-1',
              type: 'function' as const,
              function: { name: 'inspect_music', arguments: '{}' },
            },
          ],
        },
      },
    ],
  };
  expect(decodeTeacherAction(raw, 'teacher_step').args).toEqual({
    kind: 'tools',
    calls: [{ name: 'inspect_music', args: {} }],
  });
  expect(() => decodeTeacherAction(raw, 'review_teacher_reply')).toThrow('Unexpected');
});

// Sanitized shape retained from the 120B qualification failure; usage is not a reply.
it('does not turn an HTTP-success null completion into a teacher response', () => {
  expect(() =>
    decodeTeacherAction(
      { choices: [{ finish_reason: null, message: { content: null } }] },
      'teacher_step',
    ),
  ).toThrow('Incomplete');
  expect(() =>
    decodeTeacherAction(
      { choices: [{ finish_reason: 'length', message: { content: '{"kind":"final"}' } }] },
      'teacher_step',
    ),
  ).toThrow('Incomplete');
});
