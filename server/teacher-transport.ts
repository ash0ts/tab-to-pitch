import { z } from 'zod';
import { actionCompletionSchema } from './arrangement-transport.js';
import { teacherToolNames } from '../src/shared/teacher.js';

export class TeacherProtocolError extends Error {}

/** JSON.parse permits duplicate keys; a model action must have one interpretation. */
export function parseTeacherJson(text: string): unknown {
  if (Buffer.byteLength(text) > 32_768) throw new TeacherProtocolError('Action too large');
  const value: unknown = JSON.parse(text);
  let offset = 0;
  const space = () => {
    while (/\s/.test(text[offset] ?? '') && offset < text.length) offset += 1;
  };
  const string = (): string => {
    const start = offset++;
    while (offset < text.length) {
      if (text[offset] === '\\') offset += 2;
      else if (text[offset++] === '"') return JSON.parse(text.slice(start, offset)) as string;
    }
    throw new TeacherProtocolError('Unterminated string');
  };
  const visit = (depth: number): void => {
    if (depth > 32) throw new TeacherProtocolError('Action nesting too deep');
    space();
    const first = text[offset];
    if (first === '{') {
      offset += 1;
      space();
      const keys = new Set<string>();
      while (text[offset] !== '}') {
        const key = string();
        if (keys.has(key)) throw new TeacherProtocolError('Duplicate action key');
        keys.add(key);
        space();
        offset += 1; // JSON.parse has already validated the colon.
        visit(depth + 1);
        space();
        if (text[offset] === ',') {
          offset += 1;
          space();
        } else break;
      }
      offset += 1;
    } else if (first === '[') {
      offset += 1;
      space();
      while (text[offset] !== ']') {
        visit(depth + 1);
        space();
        if (text[offset] === ',') offset += 1;
        else break;
      }
      offset += 1;
    } else if (first === '"') string();
    else {
      while (offset < text.length && !/[\s,}\]]/.test(text[offset]!)) offset += 1;
    }
  };
  visit(0);
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TeacherProtocolError('Expected one JSON object');
  return value;
}

export function decodeTeacherAction(
  completion: z.infer<typeof actionCompletionSchema>,
  name: 'teacher_step' | 'review_teacher_reply',
) {
  const choice = completion.choices[0]!;
  if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls?.length === 1) {
    const call = choice.message.tool_calls[0]!;
    const nativeTool =
      name === 'teacher_step' && teacherToolNames.some((tool) => tool === call.function.name);
    if ((!nativeTool && call.function.name !== name) || choice.message.content?.trim())
      throw new TeacherProtocolError('Unexpected teacher action');
    const parsed = parseTeacherJson(call.function.arguments);
    return {
      protocol: 'native-tool' as const,
      args: nativeTool
        ? { kind: 'tools', calls: [{ name: call.function.name, args: parsed }] }
        : parsed,
      assistant: { role: 'assistant', content: null, tool_calls: [call] },
      result: (result: unknown) => ({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(result),
      }),
    };
  }
  if (
    choice.finish_reason !== 'stop' ||
    choice.message.tool_calls?.length ||
    typeof choice.message.content !== 'string'
  )
    throw new TeacherProtocolError('Incomplete teacher action');
  const content = choice.message.content.trim();
  return {
    protocol: 'strict-json-action' as const,
    args: parseTeacherJson(content),
    assistant: { role: 'assistant', content },
    result: (result: unknown) => ({
      role: 'user',
      content: JSON.stringify({ coordinatorTool: name, result }),
    }),
  };
}
