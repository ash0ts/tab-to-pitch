import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, LockKeyhole, Sparkles, WifiOff } from 'lucide-react';
import {
  localCoach,
  validateCoachResponse,
  type CoachContext,
  type CoachResponse,
  type SessionStatus,
} from '../shared/coach';

export function CoachPanel({
  context,
  onStart,
}: {
  context: CoachContext | null;
  onStart(candidateId: string): void;
}) {
  const [session, setSession] = useState<SessionStatus>({
    authenticated: false,
    cloudEnabled: false,
  });
  const [consent, setConsent] = useState(false);
  const [invitation, setInvitation] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [recommendation, setRecommendation] = useState<CoachResponse | null>(null);
  const activeRequest = useRef<AbortController | null>(null),
    generation = useRef(0);
  useEffect(() => {
    let active = true;
    fetch('/api/session')
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (active && s) setSession(s);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    generation.current++;
    activeRequest.current?.abort();
    setBusy(false);
    setRecommendation(null);
    return () => {
      generation.current++;
      activeRequest.current?.abort();
    };
  }, [context, consent, session.authenticated]);
  async function exchange() {
    setBusy(true);
    setMessage('');
    try {
      const res = await fetch('/api/invitations/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invitation }),
      });
      if (!res.ok)
        throw new Error(
          res.status === 503
            ? 'Cloud coaching is not configured on this installation.'
            : 'That invitation could not be accepted.',
        );
      const status = await fetch('/api/session').then((r) => r.json());
      setSession(status);
      setInvitation('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not connect.');
    } finally {
      setBusy(false);
    }
  }
  async function recommend() {
    if (!context) return;
    setBusy(true);
    setMessage('');
    if (!session.authenticated || !consent || !session.cloudEnabled) {
      setRecommendation(localCoach(context));
      setBusy(false);
      return;
    }
    const controller = new AbortController();
    activeRequest.current = controller;
    const requestGeneration = generation.current;
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      const res = await fetch('/api/coach/next', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: crypto.randomUUID(), context }),
      });
      if (!res.ok) throw new Error('The cloud coach is unavailable.');
      const response = validateCoachResponse(await res.json(), context);
      if (requestGeneration !== generation.current) return;
      setRecommendation(response);
    } catch {
      if (requestGeneration === generation.current) {
        setRecommendation(localCoach(context, 'unavailable'));
        setMessage('Using your on-device practice guide.');
      }
    } finally {
      clearTimeout(timer);
      if (requestGeneration === generation.current) setBusy(false);
    }
  }
  return (
    <section className="coach-card">
      <div className="coach-heading">
        <Sparkles size={18} />
        <h3>Your next small step</h3>
        <span>{recommendation?.source === 'forge' ? 'Forge' : 'Local guide'}</span>
      </div>
      <p>Choose a focused exercise from what you’ve practiced.</p>
      {recommendation ? (
        <div className="coach-recommendation">
          <p>{recommendation.proposal.explanation}</p>
          <button
            className="primary-button full-width"
            onClick={() => onStart(recommendation.proposal.candidateId)}
          >
            Start this exercise
            <ArrowRight size={16} />
          </button>
          <span className="caption">
            {recommendation.source === 'forge'
              ? 'Selected with Forge. Verified by the music engine.'
              : 'Selected on your device. Works offline.'}
          </span>
          {recommendation.source === 'forge' && (
            <details className="coach-record">
              <summary>Coaching record</summary>
              {recommendation.traceId && (
                <p>
                  Agent Lens conversation <code>{recommendation.traceId}</code>
                </p>
              )}
              <p>Model: {recommendation.versions.model}</p>
              <p>
                Policy: {recommendation.versions.policy} · Prompt: {recommendation.versions.prompt}
              </p>
            </details>
          )}
        </div>
      ) : (
        <button
          className="secondary-button full-width"
          onClick={recommend}
          disabled={busy || !context}
        >
          {busy ? 'Choosing an exercise…' : 'Suggest a practice step'}
          <ArrowRight size={16} />
        </button>
      )}
      <details className="cloud-details">
        <summary>
          <LockKeyhole size={13} />
          Invited cloud coaching
        </summary>
        <p className="caption">
          If enabled, selected passage statistics, exercise choices, and answer summaries reach our
          server and Forge. Song files, titles, lyrics, and audio stay on this device. Progress is
          stored locally. Training-data collection is not enabled.
        </p>
        <label className="check-label">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => {
              setConsent(e.target.checked);
              setRecommendation(null);
            }}
          />
          Allow this session’s coaching context to be sent
        </label>
        {session.authenticated ? (
          <>
            <p className="caption">
              <Check size={13} />
              Invitation active
            </p>
            <button
              className="text-button"
              onClick={async () => {
                setConsent(false);
                try {
                  const response = await fetch('/api/session', { method: 'DELETE' });
                  if (!response.ok) throw new Error();
                  setSession((s) => ({ ...s, authenticated: false }));
                } catch {
                  setMessage(
                    'Cloud requests are stopped. Reconnect to the network to end the server session.',
                  );
                }
              }}
            >
              Disconnect cloud coach
            </button>
          </>
        ) : (
          <form
            className="invite-form"
            onSubmit={(e) => {
              e.preventDefault();
              void exchange();
            }}
          >
            <input
              aria-label="Invitation code"
              value={invitation}
              onChange={(e) => setInvitation(e.target.value)}
              type="password"
              placeholder="Invitation code"
              autoComplete="off"
            />
            <button className="secondary-button" disabled={busy || !invitation || !consent}>
              Connect
            </button>
          </form>
        )}
        {!session.cloudEnabled && (
          <p className="caption">
            <WifiOff size={12} />
            Cloud coaching is not configured. Local practice is available.
          </p>
        )}
      </details>
      {message && (
        <p className="caption" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
