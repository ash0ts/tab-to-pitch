import { useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import {
  arrangementRequestSchema,
  executeArrangementIntent,
  localArrangement,
  validateArrangementResponse,
  type ArrangementRequest,
  type ArrangementResponse,
} from '../shared/arrangements';

export function ArrangementPrompt({
  context,
  onPreview,
}: {
  context: Omit<ArrangementRequest, 'requestId' | 'request'>;
  onPreview(response: ArrangementResponse, request: ArrangementRequest): void;
}) {
  const [requestText, setRequestText] = useState('Move the voicing to frets 5 to 9');
  const [cloud, setCloud] = useState(false);
  const [busy, setBusy] = useState(false);
  const [response, setResponse] = useState<ArrangementResponse | null>(null);
  const [message, setMessage] = useState('');
  const pending = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const sent = useRef<ArrangementRequest | null>(null);
  const contextKey = JSON.stringify(context);
  useEffect(() => {
    generation.current++;
    pending.current?.abort();
    setBusy(false);
    setResponse(null);
    setMessage('');
    return () => {
      generation.current++;
      pending.current?.abort();
    };
  }, [contextKey, cloud, requestText]);
  async function propose() {
    const parsed = arrangementRequestSchema.safeParse({
      ...context,
      request: requestText,
      requestId: crypto.randomUUID(),
    });
    if (!parsed.success) {
      setMessage(
        'Confirm a passage of up to eight chords and check your fretboard controls first.',
      );
      return;
    }
    const request = parsed.data;
    sent.current = request;
    const current = generation.current;
    const abort = new AbortController();
    pending.current = abort;
    setBusy(true);
    setMessage('');
    setResponse(null);
    const timer = setTimeout(() => abort.abort(), 35000);
    try {
      if (!cloud) {
        setResponse(localArrangement(request));
        return;
      }
      const result = await fetch('/api/arrangements/propose', {
        method: 'POST',
        signal: abort.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      if (!result.ok)
        throw new Error(
          result.status === 401
            ? 'Use your invitation in Practice guide to enable cloud access.'
            : 'Cloud arrangement is unavailable. The local planner is still available.',
        );
      const validated = validateArrangementResponse(await result.json(), request);
      if (current === generation.current) setResponse(validated);
    } catch (cause) {
      if (current === generation.current) {
        setMessage(cause instanceof Error ? cause.message : 'Cloud arrangement is unavailable.');
        setResponse(localArrangement(request, 'unavailable'));
      }
    } finally {
      clearTimeout(timer);
      if (current === generation.current) setBusy(false);
    }
  }
  return (
    <details className="arrangement-prompt">
      <summary>
        <Sparkles size={16} /> Describe a variation
      </summary>
      <p className="small-muted">
        Ask for a neck region, voice count, extension, or bass. You preview every proposal before
        applying it.
      </p>
      <label className="field-label" htmlFor="arrangement-request">
        Your musical request
      </label>
      <textarea
        id="arrangement-request"
        rows={2}
        maxLength={600}
        value={requestText}
        onChange={(event) => setRequestText(event.target.value)}
      />
      <label className="check-label">
        <input
          type="checkbox"
          checked={cloud}
          onChange={(event) => setCloud(event.target.checked)}
        />
        Use Forge for this request
      </label>
      {cloud && (
        <p className="caption">
          Your request text, selected chord context and controls go to the application server and
          Forge. Configured traces record the request lifecycle. Your file, title, lyrics and
          practice history stay local. Invitation access is required.
        </p>
      )}
      <button
        className="secondary-button"
        onClick={() => void propose()}
        disabled={busy || !requestText.trim()}
      >
        {busy ? 'Checking the proposal…' : cloud ? 'Ask Forge' : 'Ask local planner'}
      </button>
      {message && (
        <p role="status" className="exploration-empty">
          {message}
        </p>
      )}
      {response && (
        <div className="proposal-result" role="status">
          <strong>
            {response.source === 'forge' ? 'Forge proposal' : 'Local planner'} · {response.status}
          </strong>
          <p>{response.explanation}</p>
          {response.status === 'proposal' && (
            <button
              className="primary-button"
              onClick={() => {
                const request = sent.current;
                if (!request || request.contextVersion !== context.contextVersion) return;
                validateArrangementResponse(response, request);
                const execution = executeArrangementIntent(request, response.intent);
                if (execution.result?.variations.some((item) => item.id === response.candidateId))
                  onPreview(response, request);
              }}
            >
              Preview this proposal
            </button>
          )}
          {response.traceId && (
            <details>
              <summary>Agent Lens record</summary>
              <p>
                Conversation <code>{response.traceId}</code>
              </p>
              <p>
                {response.versions.model} · {response.versions.policy}
              </p>
            </details>
          )}
        </div>
      )}
    </details>
  );
}
