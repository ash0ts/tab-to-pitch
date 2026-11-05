import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ForgeTransport } from '../forge/transport.mjs';
import { PROJECT } from '../forge/project.mjs';
/** v2 eager evaluation ends need their persisted start. Preserve the SDK payload. */
export function studyWeaveTransport(directory) {
  const transport = new ForgeTransport({ directory, mode: 'native', deadlineMs: 30000 });
  const post = transport.post.bind(transport);
  transport.post = async (service, path, value, options) => {
    if (service === 'trace' && path.endsWith('/call/end') && value.end?.id) {
      await writeFile(
        join(directory, `sdk-end-${value.end.id}.json`),
        JSON.stringify(value, null, 2),
        { flag: 'wx' },
      );
      let call;
      for (let i = 0; i < 6; i++) {
        ({ call } = await post('trace', '/call/read', { project_id: PROJECT, id: value.end.id }));
        if (call?.started_at) break;
        await new Promise((done) => setTimeout(done, 400));
      }
      if (!call?.started_at)
        throw new Error('Evaluation start not readable; retain end payload before retrying');
      value = { ...value, end: { ...value.end, started_at: call.started_at } };
    }
    return post(service, path, value, options);
  };
  return transport;
}
