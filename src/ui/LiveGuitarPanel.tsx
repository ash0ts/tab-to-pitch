import { useEffect, useState } from 'react';
import type { LiveGuitarSession } from '../hooks/useLiveGuitar';
import { formatPitch } from '../engine/exploration';
import { LIVE_VERSION } from '../shared/live-guitar';
import './live-guitar.css';

const names = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const symbols = { major: '', minor: 'm', '7': '7', maj7: 'maj7', m7: 'm7', '6': '6' };
type Preferences = { provider: 'browser-audio' | 'midi'; deviceId: string; channel: number };
function preferences(): Preferences {
  try {
    const p = JSON.parse(localStorage.getItem(`${LIVE_VERSION}:input`) ?? 'null');
    if (
      p &&
      ['browser-audio', 'midi'].includes(p.provider) &&
      typeof p.deviceId === 'string' &&
      Number.isInteger(p.channel) &&
      p.channel >= 0 &&
      p.channel < 32
    )
      return p;
  } catch {}
  return { provider: 'browser-audio', deviceId: '', channel: 0 };
}
export function LiveGuitarPanel({
  session: s,
  blocked,
  onReplay,
  listOutputs,
  selectOutput,
  setupOnly = false,
}: {
  setupOnly?: boolean;
  session: LiveGuitarSession;
  blocked: boolean;
  onReplay(): void;
  listOutputs(): Promise<{ deviceId: string; label: string }[]>;
  selectOutput(id: string): Promise<void>;
}) {
  const [prefs, setPrefs] = useState(preferences);
  const [devices, setDevices] = useState<{ id: string; name: string }[]>([]);
  const [notice, setNotice] = useState('');
  const [view, setView] = useState<'explore' | 'attempt'>('explore');
  const [help, setHelp] = useState(false);
  const [outputId, setOutputId] = useState('');
  const [outputs, setOutputs] = useState<{ deviceId: string; label: string }[]>([]);
  const listening = s.input?.status === 'listening';
  const requestedMode = s.task.kind === 'chords' ? 'chords' : 'notes';
  const [connectedMode, setConnectedMode] = useState(requestedMode);
  useEffect(() => {
    if (listening && connectedMode !== requestedMode) s.stop();
  }, [requestedMode]);
  async function discover() {
    try {
      if (prefs.provider === 'midi') {
        if (!navigator.requestMIDIAccess)
          throw new Error('Use Chrome for the optional MIDI input.');
        const access = await navigator.requestMIDIAccess({ sysex: false });
        setDevices(
          [...access.inputs.values()].map((d) => ({ id: d.id, name: d.name ?? 'MIDI input' })),
        );
      } else {
        const all = await navigator.mediaDevices.enumerateDevices();
        setDevices(
          all
            .filter((d) => d.kind === 'audioinput')
            .map((d, i) => ({ id: d.deviceId, name: d.label || `Audio input ${i + 1}` })),
        );
      }
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Input devices could not be listed.');
    }
  }
  function connect() {
    try {
      localStorage.setItem(`${LIVE_VERSION}:input`, JSON.stringify(prefs));
    } catch {
      setNotice('Setup stays in memory because browser storage is unavailable.');
    }
    setConnectedMode(requestedMode);
    s.start({ ...prefs, mode: requestedMode });
  }
  useEffect(() => {
    if (listening) void discover();
  }, [listening]);
  async function output(id: string) {
    try {
      s.finish(true);
      await selectOutput(id);
      setOutputId(id);
    } catch {
      setNotice('Output selection is unavailable. Choose your interface in macOS Sound.');
    }
  }
  const masked = s.active;
  const o = s.observation;
  const signal = o?.problems.includes('clipping')
    ? 'Input clipping'
    : o?.rms && o.rms > 0.008
      ? 'Signal present'
      : 'Waiting for signal';
  const detected =
    o?.stable && !o.problems.length
      ? o.kind === 'note'
        ? o.pitches.map((p) => formatPitch(Math.round(p), false)).join(', ')
        : o.chords.map((c) => `${names[c.root]}${symbols[c.quality]}`).join(' / ')
      : 'Could not assess yet';
  const showResult = !masked && view === 'explore';
  return (
    <section className="live-guitar-panel" aria-label={setupOnly ? "Optional guitar input" : "Play with my guitar"}>
      <header className="live-heading">
        <div>
          <span className="eyebrow">Your instrument, in this lesson</span>
          <h2>Play with my guitar</h2>
        </div>
        <span className="live-badge">Experimental · Mac / Chrome</span>
      </header>
      <p>
        Plug into your interface’s instrument input. Use its direct monitor or your amp for guitar
        sound; this app listens to the clean input.
      </p>
      <details open={!listening}>
        <summary>Guitar connection</summary>
        <div className="live-setup">
          <label>
            Input source
            <select
              disabled={listening || s.active}
              value={prefs.provider}
              onChange={(e) => {
                setPrefs({
                  ...prefs,
                  provider: e.target.value as Preferences['provider'],
                  deviceId: '',
                });
                setDevices([]);
              }}
            >
              <option value="browser-audio">USB audio interface</option>
              <option value="midi">Optional MIDI companion</option>
            </select>
          </label>
          <label>
            Guitar input
            <select
              disabled={listening || s.active}
              value={prefs.deviceId}
              onChange={(e) => setPrefs({ ...prefs, deviceId: e.target.value })}
            >
              <option value="">
                {prefs.provider === 'midi' ? 'Choose a MIDI input' : 'System default input'}
              </option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          {prefs.provider === 'browser-audio' && (
            <label>
              Guitar channel
              <select
                disabled={listening || s.active}
                value={prefs.channel}
                onChange={(e) => setPrefs({ ...prefs, channel: Number(e.target.value) })}
              >
                {Array.from({ length: 8 }, (_, i) => (
                  <option key={i} value={i}>
                    Channel {i + 1}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button className="secondary-button" onClick={() => void discover()} disabled={s.active}>
            Refresh inputs
          </button>
        </div>
        <p className="caption">
          Choose the hardware input, not a loopback or computer-audio mix. Wired headphones keep
          backing audio out of your input. Browser permission may call this a microphone.
        </p>
        <div className="live-controls">
          <label>
            Backing output
            <select
              disabled={s.active}
              value={outputId}
              onChange={(e) => void output(e.target.value)}
            >
              <option value="">System default</option>
              {outputs.map((o) => (
                <option key={o.deviceId} value={o.deviceId}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <button
            className="secondary-button"
            disabled={s.active}
            onClick={() =>
              void listOutputs()
                .then(setOutputs)
                .catch(() => setNotice('Choose your interface in macOS Sound.'))
            }
          >
            Refresh outputs
          </button>
        </div>
        <p className="caption">
          If output selection is unavailable, choose your interface in macOS Sound. Check the route
          with backing playback.
        </p>
        {prefs.provider === 'midi' && (
          <p className="caption">
            Choose the virtual MIDI output from your installed guitar converter. Conversion is
            estimated; MIDI channels do not verify strings. Pitch bends and sustain are not
            assessed.
          </p>
        )}
      </details>
      <div className="live-controls">
        <button
          className="primary-button"
          disabled={s.active || s.input?.status === 'requesting' || listening}
          onClick={connect}
        >
          {s.input?.status === 'requesting' ? 'Opening input…' : 'Connect guitar'}
        </button>
        <button
          className="secondary-button"
          onClick={() => {
            s.stop();
          }}
          disabled={!listening && s.input?.status !== 'requesting'}
        >
          Stop listening
        </button>
        <span role="status">
          {listening
            ? '● Listening locally'
            : s.input?.status === 'requesting'
              ? 'Requesting permission'
              : 'Input stopped'}
        </span>
      </div>
      <div className="live-meter">
        <label htmlFor="guitar-level">{signal}</label>
        <meter
          id="guitar-level"
          min={0}
          max={1}
          value={Math.min(1, (o?.rms ?? 0) * 4)}
          aria-label="Guitar input level"
        />
        {s.input?.sampleRate && (
          <small>
            {s.input.sampleRate} Hz · channel {s.input.channel + 1}
          </small>
        )}
      </div>
      {listening && s.input?.provider === 'browser-audio' && !s.input.processingDisabled && (
        <p className="caption">
          The browser did not confirm all speech processing is disabled. Detection remains
          unqualified.
        </p>
      )}
      {(s.error || notice) && (
        <p role="alert" className="teaching-cue">
          {s.error || notice}
        </p>
      )}
      {!setupOnly && <>
      <nav className="live-controls" aria-label="Live feedback mode">
        <button
          className="secondary-button"
          disabled={s.active}
          aria-pressed={view === 'explore'}
          onClick={() => setView('explore')}
        >
          Explore sound
        </button>
        <button
          className="secondary-button"
          disabled={s.active}
          aria-pressed={view === 'attempt'}
          onClick={() => setView('attempt')}
        >
          Make an attempt
        </button>
      </nav>
      <label>
        Playing task
        <select
          value={s.task.id}
          disabled={s.active || blocked}
          onChange={(e) => {
            s.select(e.target.value);
            setHelp(false);
          }}
        >
          {s.tasks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.id === 'live-phrase'
                ? 'Play your constructed phrase'
                : t.id === 'live-exact'
                  ? 'Match the exact pitch'
                  : t.id === 'live-note'
                    ? 'Find the selected note'
                    : t.id === 'live-connection'
                      ? 'Seventh to third'
                      : t.id === 'live-arpeggio'
                        ? 'Pick the selected chord tones'
                        : t.id === 'live-homework'
                          ? 'Pick the homework fragment'
                          : 'Strum the selected progression'}
            </option>
          ))}
        </select>
      </label>
      {!s.tasks.some((t) => t.kind === 'chords') && (
        <p className="caption">
          Strummed practice needs confirmed chords. Open a progression study or confirm this passage
          in Understand.
        </p>
      )}
      <h3>{s.task.prompt}</h3>
      {s.task.kind !== 'chords' && !s.active && (
        <p className="live-targets">
          {s.task.pitches.map((p, i) => (
            <span key={i}>{formatPitch(p, s.task.exactOctave)}</span>
          ))}
        </p>
      )}
      {showResult && (
        <p className="live-detection" aria-live="off">
          {detected}
          {o?.stable && o.kind === 'note' && (
            <small>
              {' '}
              {Math.round((o.pitches[0]! - Math.round(o.pitches[0]!)) * 100)} cents from nearest
              note
            </small>
          )}
        </p>
      )}
      {view === 'attempt' && (
        <div className="live-controls">
          <button
            className="primary-button"
            disabled={!listening || s.active || blocked}
            onClick={() => {
              setHelp(false);
              s.begin();
            }}
          >
            Start attempt
          </button>
          <button className="secondary-button" disabled={!s.active} onClick={() => s.finish()}>
            Finish response
          </button>
          <button className="text-button" disabled={!s.active} onClick={() => s.finish(true)}>
            Cancel attempt
          </button>
        </div>
      )}
      {s.active && (
        <p role="status">
          Listening to your response. Labels stay hidden until you finish. No timing or
          fret-position grade.
        </p>
      )}
      <div className="live-controls">
        <button
          className="secondary-button"
          disabled={!s.active}
          onClick={() => {
            if (s.help('cue')) setHelp(true);
          }}
        >
          Attention cue
        </button>
        <button
          className="text-button"
          disabled={blocked}
          onClick={() => {
            if (!s.active || s.help('example')) onReplay();
          }}
        >
          Hear the backing
        </button>
      </div>
      {help && (
        <p className="teaching-cue">
          Let each note settle, then release it before the next attack. For an unclear chord, finish
          this response and try its notes separately.
        </p>
      )}
      {s.result && (
        <div className="live-feedback" role="status">
          <strong>
            {
              (
                {
                  match: 'Supported match',
                  discrepancy: 'Supported discrepancy',
                  unassessed: 'Could not assess',
                  interrupted: 'Attempt interrupted',
                } as const
              )[s.result.outcome]
            }
          </strong>
          <p>{s.result.reason}</p>
          <small>
            Experimental detector ·{' '}
            {s.result.assisted ? 'assisted or retry' : 'first response without requested help'}
          </small>
        </div>
      )}
      {blocked && (
        <p className="caption">
          Finish or pause the other assessment before starting a live response.
        </p>
      )}
      <p className="caption">
        Sound can support a pitch or chord match. Your chosen string, fret, CAGED grip, and hand
        technique remain unverified. Raw audio is not saved or uploaded.
      </p>
      <details>
        <summary>Session evidence ({s.attempts.length})</summary>
        <p>
          {s.attempts.filter((a) => a.outcome === 'match').length} experimental matches;{' '}
          {
            s.attempts.filter((a) => a.outcome === 'unassessed' || a.outcome === 'interrupted')
              .length
          }{' '}
          unassessed or interrupted. These do not count as verified fretboard fluency.
        </p>
      </details>
      </>}
    </section>
  );
}
