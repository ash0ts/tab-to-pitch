import { z } from 'zod';
/** Native tool fields are optional at the provider boundary, never at the action-schema boundary. */
export const actionCompletionSchema = z.object({
  model: z.string().optional(),
  usage: z
    .object({
      prompt_tokens: z.number().int().nonnegative(),
      completion_tokens: z.number().int().nonnegative(),
      total_tokens: z.number().int().nonnegative(),
    })
    .optional(),
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullable(),
        message: z.object({
          content: z.string().nullable().optional(),
          tool_calls: z
            .array(
              z.object({
                id: z.string(),
                type: z.literal('function'),
                function: z.object({ name: z.string(), arguments: z.string() }),
              }),
            )
            .optional(),
        }),
      }),
    )
    .min(1),
});
export function decodeAction(raw: z.infer<typeof actionCompletionSchema>, expectedName: string) {
  const choice = raw.choices[0]!;
  if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls?.length === 1) {
    const call = choice.message.tool_calls[0]!;
    if (call.function.name !== expectedName) throw new Error('Unexpected tool');
    return {
      protocol: 'native-tool' as const,
      call,
      args: JSON.parse(call.function.arguments) as unknown,
      content: null,
    };
  }
  if (
    choice.finish_reason !== 'stop' ||
    choice.message.tool_calls?.length ||
    typeof choice.message.content !== 'string'
  )
    throw new Error('Incomplete action');
  const content = choice.message.content.trim();
  if (!content.startsWith('{') || !content.endsWith('}'))
    throw new Error('Expected only one JSON object');
  // The action contract does not contain arbitrary text. Reject duplicate keys before parsing.
  const keys = [...content.matchAll(/"((?:\\.|[^"\\])*)"\s*:/g)].map(
    (match) => JSON.parse(`"${match[1]}"`) as string,
  );
  if (new Set(keys).size !== keys.length) throw new Error('Duplicate action key');
  const args: unknown = JSON.parse(content);
  if (!args || typeof args !== 'object' || Array.isArray(args))
    throw new Error('Expected one action object');
  return { protocol: 'strict-json-action' as const, call: null, args, content };
}
