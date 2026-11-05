import { createHash, randomUUID } from 'node:crypto';
import { link, mkdir, open, readFile, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  type SpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { ProtobufTraceSerializer } from '@opentelemetry/otlp-transformer';

export interface LensCaptureReceipt {
  schemaVersion: 1;
  source: 'forge-sdk-actual-spans';
  format: 'otlp-protobuf';
  sequence: number;
  filename: string;
  sha256: string;
  bytes: number;
  spanCount: number;
  traceIds: string[];
  spanIds: string[];
  spans: { traceId: string; spanId: string; parentSpanId?: string; name: string }[];
}

/** Commit complete bytes without replacing any previous batch, including after a retry. */
async function writeOnce(path: string, bytes: Buffer) {
  const verifyExisting = async () => {
    const previous = await readFile(path);
    if (!previous.equals(bytes)) throw new Error(`Capture batch collision: ${path}`);
  };
  try {
    await verifyExisting();
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const temporary = `${path}.partial-${randomUUID()}`;
  const file = await open(temporary, 'wx', 0o600);
  try {
    try {
      await file.writeFile(bytes);
      await file.sync();
    } finally {
      await file.close();
    }
    try {
      // Linking a fully flushed temporary file is atomic and cannot overwrite a batch.
      await link(temporary, path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      await verifyExisting();
    }
  } finally {
    await unlink(temporary);
  }
}

/** Capture only actual completed SDK spans; transport and ingestion verification are separate. */
export function createLensCapture(directory: string): {
  spanProcessor: SpanProcessor;
  checkpoint(): Promise<LensCaptureReceipt | null>;
} {
  const exporter = new InMemorySpanExporter();
  const processor = new SimpleSpanProcessor(exporter);
  let queue: Promise<unknown> = Promise.resolve();
  let nextSequence: number | undefined;
  let pending: { receipt: LensCaptureReceipt; bytes: Buffer; count: number } | undefined;

  async function save(): Promise<LensCaptureReceipt | null> {
    await processor.forceFlush();
    const finished = exporter.getFinishedSpans();
    if (!pending && finished.length === 0) return null;
    await mkdir(directory, { recursive: true });
    if (nextSequence === undefined) {
      // Orphaned protobufs also reserve their number. A receipt is the commit marker.
      const sequenceNumbers = (await readdir(directory)).flatMap((name) => {
        const match = name.match(/^batch-(\d+)\.(?:otlp\.pb|json)$/);
        return match ? [Number(match[1])] : [];
      });
      nextSequence = Math.max(0, ...sequenceNumbers) + 1;
    }
    if (!pending) {
      const snapshot = finished.slice();
      const ordered = [...snapshot].sort((a, b) => {
        const left = a.spanContext(),
          right = b.spanContext();
        return left.traceId.localeCompare(right.traceId) || left.spanId.localeCompare(right.spanId);
      });
      const serialized = ProtobufTraceSerializer.serializeRequest(ordered);
      if (!serialized?.length)
        throw new Error('OTLP serializer produced no bytes for finished spans');
      const bytes = Buffer.from(serialized);
      const spans = ordered.map((span) => ({
        traceId: span.spanContext().traceId,
        spanId: span.spanContext().spanId,
        ...(span.parentSpanContext ? { parentSpanId: span.parentSpanContext.spanId } : {}),
        name: span.name,
      }));
      pending = {
        count: snapshot.length,
        bytes,
        receipt: {
          schemaVersion: 1,
          source: 'forge-sdk-actual-spans',
          format: 'otlp-protobuf',
          sequence: nextSequence,
          filename: `batch-${String(nextSequence).padStart(6, '0')}.otlp.pb`,
          sha256: createHash('sha256').update(bytes).digest('hex'),
          bytes: bytes.length,
          spanCount: spans.length,
          traceIds: [...new Set(spans.map((span) => span.traceId))].sort(),
          spanIds: spans.map((span) => span.spanId),
          spans,
        },
      };
    }
    const { receipt, bytes, count } = pending;
    await writeOnce(join(directory, receipt.filename), bytes);
    await writeOnce(
      join(directory, receipt.filename.replace(/\.otlp\.pb$/, '.json')),
      Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`),
    );
    const folder = await open(directory, 'r');
    try {
      await folder.sync();
    } finally {
      await folder.close();
    }
    // The installed exporter exposes its live array. Remove only the persisted prefix;
    // spans that finish while filesystem writes are pending remain for the next checkpoint.
    finished.splice(0, count);
    pending = undefined;
    nextSequence = receipt.sequence + 1;
    return receipt;
  }
  function checkpoint() {
    const result = queue.then(save);
    queue = result.catch(() => {});
    return result;
  }
  const spanProcessor: SpanProcessor = {
    onStart: (span, context) => processor.onStart(span, context),
    onEnd: (span) => processor.onEnd(span),
    forceFlush: () => processor.forceFlush(),
    async shutdown() {
      // InMemorySpanExporter.shutdown clears its buffer, so persist before delegating.
      while (await checkpoint()) {
        /* Drain spans that finished during the previous write. */
      }
      await processor.shutdown();
    },
  };
  return { spanProcessor, checkpoint };
}
