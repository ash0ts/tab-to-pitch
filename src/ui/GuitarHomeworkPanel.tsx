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
import { Fretboard, type FretboardMarker } from './Fretboard';
import { LiveGuitarPanel } from './LiveGuitarPanel';
import './guitar-homework.css';
const reports = [
  ['felt-secure', 'Felt secure'],
  ['needs-another-pass', 'Needs another pass'],
  ['not-sure', 'Not sure'],
  ['skipped', 'Skipped'],
] as const;
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
          const role =
            tone?.degree === '1'
              ? 'root'
              : tone?.degree.includes('3')
                ? 'third'
                : tone?.degree.includes('5')
                  ? 'fifth'
                  : tone?.degree.includes('7')
                    ? 'seventh'
                    : tone
                      ? 'extension'
                      : undefined;
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
  return (
    <section className="guitar-homework" aria-label="Guitar homework">
      <header>
        <div>
          <span className="eyebrow">Pick up your guitar</span>
          <h2>{step?.title ?? 'A little homework. Actual playing.'}</h2>
        </div>
        <span>{h.state?.minutes ?? props.workload} min suggested workload</span>
      </header>
      {!s || !step ? (
        <>
          <p>
            Find notes, connect small CAGED fragments, then use them in a progression. A USB
            interface is optional.
          </p>
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
          <p className="caption" role="status">
            {p.saving
              ? 'Saving homework…'
              : p.durable
                ? 'Homework saved on this device'
                : 'Homework is available in this session. Export progress if storage is unavailable.'}
          </p>
          <p className="guitar-instruction">{step.instruction}</p>
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
                <option value="self-report">Play without an interface · self-report</option>
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
          <Fretboard
            tuning={props.tuning}
            capo={props.capo}
            minFret={step.region.minFret}
            maxFret={step.region.maxFret}
            markers={markers}
            hideLabels={!s.labels}
            label="Suggested guitar locations"
          />
          <p className="caption">
            {s.labels
              ? 'A proposed realization. These markers are not observations of your hands.'
              : 'Labels and location markers are hidden.'}{' '}
            Playing sound does not verify a string, fret or CAGED family.
          </p>
          <div className="guitar-actions">
            <button
              className="secondary-button"
              disabled={!h.fresh || !props.audioReady}
              onClick={() => audition(true)}
            >
              Hear example
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
              Play along
            </button>
            <button
              className="secondary-button"
              disabled={!h.fresh || !props.audioReady}
              onClick={() => audition(false)}
            >
              Repeat this change
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
            <button className="primary-button" disabled={!p.active} onClick={finish}>
              Finish attempt
            </button>
            <button
              className="text-button"
              disabled={!p.active}
              onClick={() => {
                p.interrupt();
                stop();
              }}
            >
              Cancel attempt
            </button>
          </div>
          {!props.audioReady && <p role="status">Preparing backing audio…</p>}
          {p.active && (
            <p role="status">
              {s.method === 'live'
                ? 'Listening locally. Feedback appears when you finish.'
                : 'Play at your own pace. Tell us how the pass felt when you finish.'}
            </p>
          )}
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
                  'Your report is saved separately from note, role and location checks.'}
              </p>
              {performance?.outcome === 'unassessed' && (
                <p>
                  Pick the notes individually or choose a fragment task, then return to the change.
                  Uncertain input is not a wrong answer.
                </p>
              )}
              <small>
                First response preserved · {s.responseIndex} response(s) in this episode
              </small>
            </div>
          )}
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
          <div className="guitar-actions">
            <button
              className="secondary-button"
              disabled={p.active || s.index === s.steps.length - 1}
              onClick={() => {
                stop();
                p.select(s.index + 1);
              }}
            >
              Next musical step
            </button>
            <button
              className="text-button"
              onClick={() => {
                p.interrupt();
                stop();
                props.onCoordinates();
              }}
            >
              Check note locations separately
            </button>
          </div>
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
      <p className="caption">
        Keyboard or keyboard pedal: P play along · R repeat · F finish · Escape cancel. Space
        controls playback. Nothing starts a paid teacher turn automatically.
      </p>
    </section>
  );
}
