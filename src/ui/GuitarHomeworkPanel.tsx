import { ArrowRight, Flag, Headphones, Play, Repeat2, Check, Guitar } from 'lucide-react';
import { HOMEWORK_PHASES, homeworkGuide } from '../homework/presentation';
import { positionExposureKey } from '../engine/exposure';
import { useEffect, useRef, useState } from 'react';
import type { HomeworkSession } from '../hooks/useHomeworkSession';
import type { PlayingHomeworkSession } from '../hooks/usePlayingHomework';
import type { LiveGuitarSession } from '../hooks/useLiveGuitar';
import type { ProgressionSession } from '../hooks/useProgressionSession';
import type { HomeworkPlayback } from '../shared/homework-playing';
import { locations, noteAt } from '../engine/caged';
import { formatPitch } from '../engine/exploration';
import { parseChordSymbol } from '../engine/harmony';
import { DEGREE_LABELS } from '../engine/harmony-exercises';
import { Fretboard, type FretboardMarker } from './Fretboard';
import { LiveGuitarPanel } from './LiveGuitarPanel';
import './guitar-homework.css';
const reports = [
  ['felt-secure', 'Felt secure'],
  ['needs-another-pass', 'Needs another pass'],
  ['not-sure', 'Not sure'],
  ['skipped', 'Skipped'],
] as const;
function toneRole(degree: string): FretboardMarker['role'] {
  if (degree === '1') return 'root';
  if (['b3', '3'].includes(degree)) return 'third';
  if (['b5', '5', '#5'].includes(degree)) return 'fifth';
  if (['bb7', 'b7', '7'].includes(degree)) return 'seventh';
  return 'extension';
}
export function GuitarHomeworkPanel(props: {
  homework: HomeworkSession;
  playing: PlayingHomeworkSession;
  guitar: LiveGuitarSession;
  progression: ProgressionSession;
  tuning: readonly number[];
  capo: number;
  trackIndex: number;
  workload: 5 | 15 | 30;
  tempo: number;
  ready: boolean;
  audioReady: boolean;
  audioPlaying: boolean;
  currentTick: number;
  onPlayback(study: HomeworkPlayback): void;
  onStop(): void;
  onWrapUp(): void;
  onCoordinates(): void;
  onOriginal(): void;
  listOutputs(): Promise<{ deviceId: string; label: string }[]>;
  selectOutput(id: string): Promise<void>;
}) {
  const { homework: h, playing: p, guitar, progression } = props;
  const { state: s, step } = p;
  const [finishing, setFinishing] = useState(false),
    [notice, setNotice] = useState('');
  const [reflection, setReflection] = useState(h.state?.reflection ?? '');
  const [chordIndex, setChordIndex] = useState(0);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const feedbackRequested = useRef(false);
  useEffect(() => {
    setFinishing(false);
    setNotice('');
    setChordIndex(0);
  }, [step?.id]);
  function stop() {
    props.onStop();
  }
  function audition(example: boolean) {
    if (!s || !step || !props.audioReady) return;
    if (example && !p.help('example')) return;
    try {
      props.onPlayback({
        step,
        trackIndex: props.trackIndex,
        tuning: props.tuning,
        capo: props.capo,
        tempo: props.tempo,
        example,
        countIn: s.countIn,
        responseMeasures: s.responseMeasures,
        restMeasures: s.restMeasures,
      });
    } catch (e) {
      p.interrupt();
      setNotice(e instanceof Error ? e.message : 'The example could not be prepared.');
    }
  }
  function begin() {
    if (!props.audioReady) return;
    setFinishing(false);
    if (p.begin()) audition(false);
  }
  function finish() {
    if (!p.active) return;
    feedbackRequested.current = true;
    stop();
    if (s?.method === 'live') p.finish();
    else setFinishing(true);
  }
  const commands = useRef({
    begin,
    finish,
    repeat: () => audition(false),
    cancel: () => {
      p.interrupt();
      stop();
    },
  });
  commands.current = {
    begin,
    finish,
    repeat: () => audition(false),
    cancel: () => {
      p.interrupt();
      stop();
    },
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.repeat ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        (e.target as HTMLElement)?.closest('input,textarea,select,button,[role="dialog"]')
      )
        return;
      const command = (
        {
          KeyP: commands.current.begin,
          KeyF: commands.current.finish,
          KeyR: commands.current.repeat,
          Escape: commands.current.cancel,
        } as Record<string, (() => void) | undefined>
      )[e.code];
      if (command) {
        e.preventDefault();
        command();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  // Follow the player clock; the diagram never owns musical time.
  let cursor = 0;
  const playbackChord =
    p.active && props.audioPlaying
      ? step?.progression.findIndex((span) => {
          const start = span.startTick ?? cursor;
          cursor = start + span.ticks;
          return props.currentTick >= start && props.currentTick < cursor;
        })
      : -1;
  const displayedChord =
    playbackChord !== undefined && playbackChord >= 0 ? playbackChord : chordIndex;
  const currentChord = step?.progression[displayedChord];
  const chord =
    currentChord || step?.family
      ? parseChordSymbol(currentChord?.symbol ?? step!.title.split(' major')[0]!)
      : null;
  const shown =
    currentChord?.positions ??
    (step?.fragment.length
      ? step.fragment
      : step
        ? locations(step.pitches[0]!, props.tuning, props.capo, step.region, step.exact)
        : []);
  const markers: FretboardMarker[] =
    s?.labels && step
      ? shown.map((position) => {
          const midi = noteAt(position, props.tuning, props.capo)!;
          const tone = chord?.tones.find((t) => t.pitchClass === midi % 12);
          const role = tone ? toneRole(tone.degree) : undefined;
          return {
            position,
            label: `${formatPitch(midi, false)}${tone ? ` · ${tone.degree}` : ''}`,
            role,
          };
        })
      : [];
  const exposureSignature = s?.labels
    ? shown.map((x) => positionExposureKey(props.tuning, props.capo, x)).join('|')
    : '';
  useEffect(() => {
    if (exposureSignature) p.expose(exposureSignature.split('|'));
  }, [exposureSignature]);
  const last = p.events
    .filter(
      (e) =>
        e.episodeId === s?.episodeId &&
        (e.kind === 'self-report' ||
          e.kind === 'performance-reference' ||
          e.kind === 'interrupted'),
    )
    .at(-1);
  const performance = last?.performanceAttemptId
    ? guitar.attempts.find((a) => a.id === last.performanceAttemptId)
    : undefined;
  useEffect(() => {
    if (!feedbackRequested.current || (p.active && !finishing)) return;
    const frame = requestAnimationFrame(() => {
      feedbackRef.current?.focus({ preventScroll: true });
      feedbackRef.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    });
    if (!p.active) feedbackRequested.current = false;
    return () => cancelAnimationFrame(frame);
  }, [finishing, p.active, last?.id]);
  const guide = step ? homeworkGuide(step) : null;
  const tried = new Set(
    p.sessionEvents
      .filter(
        (e) =>
          e.kind === 'performance-reference' ||
          (e.kind === 'self-report' && e.selfReport !== 'skipped'),
      )
      .map((e) => e.stepId),
  );
  const wrapUp = () => {
    p.interrupt();
    stop();
    props.onWrapUp();
  };
  return (
    <section
      className={`guitar-homework ${s ? 'has-assignment' : 'homework-intro'} ${p.active ? 'is-playing' : ''}`}
      aria-label="Guitar homework"
    >
      <div className="homework-session-bar">
        <span className="mission-label">
          {s ? `STEP ${s.index + 1} / ${s.steps.length}` : 'YOUR PRACTICE ROUTE'}
        </span>
        <span>{h.state?.minutes ?? props.workload} min · at your pace</span>
        {s && (
          <button className="text-button" onClick={wrapUp}>
            <Flag size={14} /> Wrap up session
          </button>
        )}
      </div>
      <nav className="homework-route" aria-label="Homework learning route">
        {HOMEWORK_PHASES.map((phase, i) => {
          const index =
            s?.steps.findIndex((t) =>
              (phase.objectives as readonly string[]).includes(t.objective),
            ) ?? -1;
          const current =
            !!step && (phase.objectives as readonly string[]).includes(step.objective);
          return (
            <button
              key={phase.id}
              disabled={!s || index < 0}
              aria-current={current ? 'step' : undefined}
              onClick={() => {
                stop();
                p.select(index);
              }}
            >
              <span>{String(i + 1).padStart(2, '0')}</span>
              <strong>{phase.title}</strong>
            </button>
          );
        })}
      </nav>
      <header className="homework-task-heading">
        <div>
          <span className="eyebrow">{s ? 'ON YOUR GUITAR' : 'TODAY’S MISSION'}</span>
          <h2>
            {step?.objective === 'connection'
              ? 'Hear F resolve to E'
              : (step?.title ?? 'From a note to a progression.')}
          </h2>
        </div>
        {step && (
          <span className="region-chip">
            FRETS {step.region.minFret}–{step.region.maxFret}
          </span>
        )}
      </header>
      {!s || !step ? (
        <>
          <p className="guitar-instruction">
            Pick up your guitar. You’ll find notes, connect small chord shapes, and use them in a
            progression.
          </p>
          <div className="homework-brief">
            <div>
              <Headphones size={22} />
              <strong>Hear it</strong>
              <p>Audition an example whenever you need one.</p>
            </div>
            <div>
              <Guitar size={22} />
              <strong>Play it</strong>
              <p>Use the backing, slow down, or repeat a change.</p>
            </div>
            <div>
              <Flag size={22} />
              <strong>Keep a next step</strong>
              <p>Reflect on your attempt and save where to return.</p>
            </div>
          </div>
          <p className="homework-input-note">
            No cable needed. Start with self-reported practice; connect USB input later if you want
            experimental sound feedback.
          </p>
          <div className="guitar-actions intro-actions">
            <button
              className="primary-button"
              disabled={!props.ready}
              onClick={() =>
                h.startPlaying(
                  props.workload,
                  progression.spans.every((x) => x.confirmation === 'confirmed' && x.chord)
                    ? progression.spans.map((x) => ({
                        symbol: x.chord!.symbol,
                        ticks: x.endTick - x.startTick,
                        startTick: x.startTick,
                      }))
                    : [],
                  progression.homeworkWorkspace(),
                )
              }
            >
              Start guitar homework
            </button>
            <button className="secondary-button" onClick={props.onOriginal}>
              Use the original C–F–G–C study
            </button>
          </div>
          {progression.spans.some((x) => x.confirmation !== 'confirmed' || !x.chord) && (
            <p>
              Confirm every chord before using this passage for progression homework. Note practice
              and the labeled original studies remain available.
            </p>
          )}
          <p className="caption">
            About {props.workload * 0.8} minutes of playing or listening-and-playing, with{' '}
            {props.workload * 0.2} minutes for optional checks and reflection. Repeat one change or
            choose another task whenever you want.
          </p>
        </>
      ) : (
        <>
          <p className="guitar-instruction">{guide?.instruction}</p>

          {!h.fresh && (
            <div role="alert">
              The passage or constraints changed. Your attempts remain saved.{' '}
              <button
                onClick={() =>
                  h.startPlaying(
                    props.workload,
                    progression.spans.every((x) => x.confirmation === 'confirmed' && x.chord)
                      ? progression.spans.map((x) => ({
                          symbol: x.chord!.symbol,
                          ticks: x.endTick - x.startTick,
                          startTick: x.startTick,
                        }))
                      : [],
                    progression.homeworkWorkspace(),
                  )
                }
              >
                Start a new assignment for this selection
              </button>
            </div>
          )}
          <div className="guitar-toolbar">
            <label>
              Response method
              <select
                value={s.method}
                onChange={(e) => {
                  stop();
                  p.change({ method: e.target.value as 'live' | 'self-report' });
                }}
              >
                <option value="self-report">Without an interface · self-report</option>
                {step.responseMethods.includes('live') && (
                  <option value="live">USB / MIDI · experimental sound feedback</option>
                )}
              </select>
            </label>
            <button
              className="text-button"
              disabled={p.active}
              onClick={() => p.change({ labels: !s.labels })}
            >
              {s.labels ? 'Try without labels' : 'Show labels · counts as help'}
            </button>
          </div>
          {step.progression.length > 0 && (
            <nav className="guitar-chords" aria-label="Homework progression">
              {step.progression.map((c, i) => (
                <button
                  key={i}
                  className="secondary-button"
                  aria-pressed={displayedChord === i}
                  onClick={() => setChordIndex(i)}
                >
                  {c.symbol}
                </button>
              ))}
            </nav>
          )}
          <div className="guitar-actions">
            <button
              className="secondary-button"
              disabled={!h.fresh || !props.audioReady}
              onClick={() => audition(true)}
            >
              <Headphones size={16} /> Hear example
            </button>
            <button
              className="primary-button"
              disabled={
                !h.fresh ||
                !props.audioReady ||
                p.active ||
                (s.method === 'live' && guitar.input?.status !== 'listening')
              }
              onClick={begin}
            >
              <Play size={16} fill="currentColor" /> Play along
            </button>
            <button
              className="secondary-button"
              disabled={!h.fresh || !props.audioReady}
              onClick={() => audition(false)}
            >
              <Repeat2 size={16} /> Repeat this change
            </button>
            {step.progression.length > 2 && (
              <button
                className="secondary-button"
                disabled={p.active || !h.fresh}
                onClick={() => {
                  stop();
                  p.apply({ type: 'playing-homework', operation: 'isolate', stepId: step.id });
                }}
              >
                Isolate the first change
              </button>
            )}
            <button
              className="primary-button"
              hidden={!p.active}
              disabled={!p.active}
              onClick={finish}
            >
              <Check size={16} /> Finish attempt
            </button>
            <button
              className="text-button"
              hidden={!p.active}
              disabled={!p.active}
              onClick={() => {
                p.interrupt();
                stop();
              }}
            >
              Cancel attempt
            </button>
          </div>
          <div className="homework-instrument">
            <div className="instrument-heading">
              <span>{p.active ? 'PLAYING' : 'YOUR NECK MAP'}</span>
              <span>{s.labels ? 'Suggested locations' : 'From memory · labels hidden'}</span>
            </div>
            <Fretboard
              tuning={props.tuning}
              capo={props.capo}
              minFret={step.region.minFret}
              maxFret={step.region.maxFret}
              markers={markers}
              hideLabels={!s.labels}
              label="Suggested guitar locations"
            />
            {s.labels && chord && (
              <div className="homework-role-key" aria-label="Chord tone colors">
                {chord.tones
                  .filter((tone) =>
                    shown.some(
                      (position) =>
                        noteAt(position, props.tuning, props.capo)! % 12 === tone.pitchClass,
                    ),
                  )
                  .map((tone) => (
                    <span key={tone.degree} className={toneRole(tone.degree)}>
                      {tone.degree} {DEGREE_LABELS[tone.degree] ?? tone.degree}
                    </span>
                  ))}
              </div>
            )}
          </div>
          <p className="caption">
            {s.labels ? 'Suggested positions.' : 'Labels and location markers are hidden.'} Audio
            cannot verify the string, fret or CAGED family you used.
          </p>
          {!props.audioReady && <p role="status">Preparing backing audio…</p>}
          {p.active && (
            <p role="status">
              {s.method === 'live'
                ? 'Listening locally. Feedback appears when you finish.'
                : 'Play at your own pace. Tell us how the pass felt when you finish.'}
            </p>
          )}
          <div className="homework-feedback" ref={feedbackRef} tabIndex={-1}>
            {finishing && p.active && s.method === 'self-report' && (
              <fieldset className="guitar-reflection">
                <legend>Your report · the app did not hear this performance</legend>
                {reports.map(([value, label]) => (
                  <button
                    key={value}
                    className="secondary-button"
                    onClick={() => {
                      p.finish(value);
                      setFinishing(false);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </fieldset>
            )}
            {!p.active && last && (
              <div className="guitar-result" role="status">
                <strong>
                  {performance
                    ? {
                        match: 'Supported match',
                        discrepancy: 'Supported discrepancy',
                        unassessed: 'Could not assess',
                        interrupted: 'Attempt interrupted',
                      }[performance.outcome]
                    : last.selfReport
                      ? `You reported: ${reports.find((r) => r[0] === last.selfReport)![1]}`
                      : 'Attempt interrupted'}
                </strong>
                <p>
                  {performance?.reason ??
                    'Your self-report is saved. It describes how playing felt, not verified correctness.'}
                </p>
                <p className="next-cue">{guide?.check}</p>
                {performance?.outcome === 'unassessed' && (
                  <p>
                    Pick the notes individually or choose a fragment task, then return to the
                    change. Uncertain input is not a wrong answer.
                  </p>
                )}
                <small>
                  First response preserved · {s.responseIndex} response(s) in this episode
                </small>
              </div>
            )}
          </div>
          <div className="homework-next">
            <div>
              <span className="mission-label">
                {s.index < s.steps.length - 1 ? 'UP NEXT' : 'END OF THE ROUTE'}
              </span>
              <p>{s.steps[s.index + 1]?.title ?? 'Keep a next step for your next practice.'}</p>
            </div>
            {s.index < s.steps.length - 1 ? (
              <button
                className="primary-button"
                disabled={p.active}
                onClick={() => {
                  stop();
                  p.select(s.index + 1);
                }}
              >
                Next musical step <ArrowRight size={17} />
              </button>
            ) : (
              <button className="primary-button" disabled={p.active} onClick={wrapUp}>
                Finish session <Flag size={16} />
              </button>
            )}
          </div>
          <p className="homework-participation">
            {tried.size} of {s.steps.length} steps tried. You can repeat, skip, or finish here. This
            is practice participation, not a score.
          </p>
          <p className="caption homework-save-status" role="status">
            {p.saving
              ? 'Saving homework…'
              : p.durable
                ? 'Homework saved on this device'
                : 'Homework is available in this session. Export progress if storage is unavailable.'}
          </p>
          <details className="task-purpose">
            <summary>Why this step?</summary>
            <p>{guide?.why}</p>
          </details>
          <details>
            <summary>Count-in, response and rest</summary>
            <div className="guitar-toolbar">
              <label>
                <input
                  type="checkbox"
                  checked={s.countIn}
                  onChange={(e) => {
                    stop();
                    p.change({ countIn: e.target.checked });
                  }}
                />
                Count-in
              </label>
              <label>
                Minimum response measures
                <select
                  value={s.responseMeasures}
                  onChange={(e) => {
                    stop();
                    p.change({ responseMeasures: Number(e.target.value) as 1 | 2 | 4 });
                  }}
                >
                  {[1, 2, 4].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
              <label>
                Rest measures
                <select
                  value={s.restMeasures}
                  onChange={(e) => {
                    stop();
                    p.change({ restMeasures: Number(e.target.value) });
                  }}
                >
                  {[0, 1, 2, 4].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
            </div>
            <p className="caption">
              Progression play-along keeps the source timing and backing tracks. Response and rest
              measures apply to isolated examples, which use derived 4/4 bars. Tempo and loop
              controls remain available.
            </p>
          </details>
          {s.method === 'live' && (
            <LiveGuitarPanel
              setupOnly
              session={guitar}
              blocked={false}
              onReplay={() => audition(false)}
              listOutputs={props.listOutputs}
              selectOutput={props.selectOutput}
            />
          )}
          <details>
            <summary>Choose a different task</summary>
            <div className="guitar-task-list">
              {s.steps.map((t, i) => (
                <button
                  key={t.id}
                  className="secondary-button"
                  aria-pressed={i === s.index}
                  onClick={() => {
                    stop();
                    p.select(i);
                  }}
                >
                  {t.title}
                </button>
              ))}
            </div>
          </details>
          <details>
            <summary>Check note locations separately</summary>
            <p>
              Sound does not tell us which string or fret you used. Use a screen answer for a
              separate location check.
            </p>
            <button
              className="secondary-button"
              onClick={() => {
                p.interrupt();
                stop();
                props.onCoordinates();
              }}
            >
              Open location check
            </button>
          </details>
          <details>
            <summary>Save what to try next</summary>
            <label>
              What needed another pass?
              <textarea
                value={reflection}
                maxLength={1000}
                onChange={(e) => setReflection(e.target.value)}
              />
            </label>
            <button className="secondary-button" onClick={() => h.reflect(reflection)}>
              Save reflection
            </button>
            <p className="caption">
              Use Save for next time above to bookmark this passage, region, tempo and assignment.
            </p>
          </details>
        </>
      )}
      <button
        className="text-button"
        onClick={() => {
          p.interrupt();
          stop();
          props.onCoordinates();
        }}
      >
        Explore or check the fretboard
      </button>
      {notice && <p role="alert">{notice}</p>}
      <details className="homework-shortcuts">
        <summary>Keyboard & pedal controls</summary>
        <p>P play along · R repeat · F finish · Escape cancel. Space controls playback.</p>
      </details>
    </section>
  );
}
