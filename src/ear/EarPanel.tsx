import { useEffect, useRef, useState } from 'react';
import { Headphones, Play, Pause, ArrowRight } from 'lucide-react';
import type { EarSession } from './useEarSession';
import { gradeEarProposal, hasEarReference } from './model';
import { parseChordSymbol } from '../engine/harmony';
import { midiToSpn, parsePitch } from '../engine/theory';
import { draftPositions, hypothesisHarmony } from './draft';
import { playback } from '../player/PlaybackCoordinator';
import '../ui/songs.css';
import './ear.css';

export function EarPanel({
  session: s,
  onAudition,
  showOctaves = false,
}: {
  session: EarSession;
  onAudition(notes: number[]): void;
  showOctaves?: boolean;
}) {
  const player = useRef<HTMLAudioElement>(null);
  const [permission, setPermission] = useState('owned'),
    [pauseAfter, setPauseAfter] = useState(true);
  const [part, setPart] = useState('');
  const [draftTab, setDraftTab] = useState(false),
    [inspectAt, setInspectAt] = useState(0);
  const [legacy, setLegacy] = useState('');
  const positions = draftTab ? draftPositions(s.notes) : [];
  const harmony = hypothesisHarmony(s.notes, inspectAt);
  const state = s.state;
  const latest = useRef(s);
  latest.current = s;
  useEffect(() => playback.register('ear-recording', () => player.current?.pause()), []);
  useEffect(() => {
    setPart('');
    player.current?.pause();
  }, [state?.asset.id, state?.start, state?.end]);
  function play() {
    const audio = player.current;
    if (!audio || !state) return;
    playback.claim('ear-recording');
    audio.currentTime = part ? 0 : state.start;
    void audio.play().catch(() => {
      audio.pause();
    });
  }
  const playedCommand = useRef(0);
  useEffect(() => {
    if (s.command > playedCommand.current) {
      if (part) {
        setPart('');
        return;
      }
      playedCommand.current = s.command;
      play();
    }
  }, [s.command, part]);
  useEffect(() => {
    const hide = () => {
      if (document.hidden) {
        player.current?.pause();
        if (latest.current.state?.activeQuestion)
          latest.current.revise(
            { activeQuestion: false },
            'audio-change',
            'Question interrupted while the page was hidden.',
          );
      }
    };
    document.addEventListener('visibilitychange', hide);
    return () => document.removeEventListener('visibilitychange', hide);
  }, []);
  if (!s.enabled && !state)
    return (
      <details className="ear-unavailable">
        <summary>Work it out by ear · experimental</summary>
        <p>
          Local audio analysis is disabled. Start the local audio worker to use your own recordings.
          The catalog lessons remain available.
        </p>
      </details>
    );
  const result = state?.completed ? gradeEarProposal(state) : null;
  return (
    <section className="listening-panel ear-panel" aria-label="Work it out by ear">
      <div className="songs-heading">
        <div>
          <span className="eyebrow">
            <Headphones size={16} /> Experimental ear workspace
          </span>
          <h2>Work it out by ear.</h2>
          <p>Listen, test an idea, then take it to the fretboard.</p>
        </div>
        {state && (
          <button className="text-button" onClick={s.close}>
            Close activity
          </button>
        )}
      </div>
      {!state ? (
        <div className="ear-start">
          <button
            className="primary-button"
            disabled={s.busy || !s.enabled}
            onClick={() => void s.loadDemo()}
          >
            Open original listening study
          </button>
          <details>
            <summary>Use my own audio</summary>
            <label>
              Audio permission
              <select value={permission} onChange={(e) => setPermission(e.target.value)}>
                <option value="owned">I own this recording</option>
                <option value="permission">I have permission to analyze it</option>
                <option value="public-domain">Public domain recording</option>
              </select>
            </label>
            <label>
              Local audio file
              <input
                type="file"
                accept="audio/*"
                disabled={!s.enabled || s.busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void s.upload(f, permission);
                }}
              />
            </label>
            <p className="caption">
              Up to 32 MB and ten minutes. Audio stays on this computer. Select an excerpt up to 60
              seconds.
            </p>
          </details>
        </div>
      ) : (
        <>
          <div className="ear-source">
            <span className="song-status">
              {part
                ? 'Estimated isolated part'
                : state.asset.origin === 'authored'
                  ? 'Original synthesized study · CC0'
                  : 'Your recording · local'}
            </span>
            <audio
              ref={player}
              preload="metadata"
              src={'/api/audio/artifacts/' + (part || state.asset.id)}
              onPlay={() => s.started(part ? 'estimated-part' : 'original')}
              onError={() =>
                s.revise(
                  { activeQuestion: false },
                  'audio-change',
                  'Playback unavailable; no incorrect answer recorded.',
                )
              }
              onTimeUpdate={() => {
                const a = player.current;
                if (!a) return;
                if (a.currentTime >= (part ? state.end - state.start : state.end)) {
                  a.pause();
                  if (!pauseAfter) {
                    a.currentTime = part ? 0 : state.start;
                    void a.play().catch(() => {});
                  }
                }
              }}
            />
            <div className="song-actions">
              <button className="secondary-button" onClick={play}>
                <Play size={16} /> Hear passage
              </button>
              {part && (
                <button className="secondary-button" onClick={s.replay}>
                  Replay original
                </button>
              )}
              <button className="text-button" onClick={() => player.current?.pause()}>
                <Pause size={16} /> Pause
              </button>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={pauseAfter}
                  onChange={(e) => setPauseAfter(e.target.checked)}
                />{' '}
                Leave space to sing or play
              </label>
            </div>
            {state.asset.origin === 'upload' && (
              <div className="ear-excerpt">
                <label>
                  Start, seconds
                  <input
                    type="number"
                    min="0"
                    max={state.end - 0.1}
                    value={state.start}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (n >= 0 && n < state.end)
                        s.revise({
                          start: n,
                          jobId: null,
                          draftVisible: false,
                          activeQuestion: false,
                        });
                    }}
                  />
                </label>
                <label>
                  End, seconds
                  <input
                    type="number"
                    min={state.start + 0.1}
                    max={Math.min(state.asset.duration, state.start + 60)}
                    value={state.end}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (n > state.start && n <= Math.min(state.asset.duration, state.start + 60))
                        s.revise({
                          end: n,
                          jobId: null,
                          draftVisible: false,
                          activeQuestion: false,
                        });
                    }}
                  />
                </label>
              </div>
            )}
          </div>
          <div className="ear-proposal">
            <h3>Your proposal</h3>
            <p>
              {state.asset.origin === 'authored'
                ? 'Two changes, four seconds each. Identify roots, then qualities.'
                : 'Describe two equal-length spans as a working hypothesis. These boundaries are your teaching reduction.'}
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                s.answer();
              }}
            >
              <div className="listening-slots">
                {state.proposal.map((value, i) => (
                  <label className="listening-slot" key={i}>
                    Change {i + 1}
                    <input
                      aria-label={'Your chord ' + (i + 1)}
                      placeholder="Chord symbol"
                      value={value}
                      maxLength={24}
                      onChange={(e) => {
                        const p = [...state.proposal];
                        p[i] = e.target.value;
                        s.revise({ proposal: p, completed: false });
                      }}
                    />
                  </label>
                ))}
              </div>
              <div className="song-actions">
                <button
                  className="primary-button"
                  disabled={!state.proposal.every((v) => parseChordSymbol(v))}
                >
                  {state.asset.origin === 'authored' ? 'Check my proposal' : 'Save my hypothesis'}
                </button>
                {!state.activeQuestion && hasEarReference(state) && (
                  <button type="button" className="text-button" onClick={s.begin}>
                    Try without help
                  </button>
                )}
              </div>
            </form>
            {result && (
              <div className="listening-feedback" role="status">
                {result.map((r, i) => (
                  <p key={i}>
                    Change {i + 1}: {r.feedback} Root {r.root ? 'matches' : 'differs'} · quality{' '}
                    {r.quality ? 'matches' : 'differs'}.
                  </p>
                ))}
                <p>
                  {state.assisted ? 'Assisted' : 'No in-app help recorded'} · {state.replayCount}{' '}
                  playback starts. This does not assess your playing.
                </p>
              </div>
            )}
          </div>
          {s.masked ? (
            <div className="listening-mask-note">
              <p>Earlier explanations, notation, and analysis are hidden while you answer.</p>
              <button className="secondary-button" onClick={() => s.assist()}>
                Get help · marks this attempt assisted
              </button>
            </div>
          ) : (
            <div className="ear-investigate">
              <h3>Investigate one uncertainty</h3>
              <details className="ear-note-proposal">
                <summary>Try a bass or melody note</summary>
                <p>
                  Sing or play the fragment first. Enter a note with its octave to compare a
                  specific pitch.
                </p>
                <label>
                  Your proposed note
                  <input
                    maxLength={8}
                    placeholder="e.g. F3"
                    value={state.noteProposal ?? ''}
                    onChange={(e) => s.revise({ noteProposal: e.target.value })}
                  />
                </label>
                <button
                  className="secondary-button"
                  disabled={parsePitch(state.noteProposal ?? '') === null}
                  onClick={() => {
                    const midi = parsePitch(state.noteProposal ?? '');
                    if (midi !== null) {
                      s.assist('Learner note proposal auditioned.');
                      onAudition([midi]);
                    }
                  }}
                >
                  Hear my note proposal
                </button>
                <p className="caption">
                  This is your comparison sound, not a verified transcription or a hearing grade.
                </p>
              </details>
              <div className="song-actions">
                {state.proposal.map((symbol, i) => {
                  const chord = parseChordSymbol(symbol);
                  return (
                    <button
                      className="secondary-button"
                      key={i}
                      disabled={!chord}
                      onClick={() => {
                        s.assist('Learner proposal auditioned.');
                        onAudition(
                          chord!.tones.map((t) => 48 + chord!.rootPitchClass + t.semitones),
                        );
                      }}
                    >
                      Hear my {symbol || 'chord'} proposal
                    </button>
                  );
                })}
                <button
                  className="secondary-button"
                  disabled={
                    !s.analysisReady ||
                    s.busy ||
                    s.job?.status === 'running' ||
                    s.job?.status === 'queued'
                  }
                  onClick={() => void s.analyze()}
                >
                  Prepare draft notes
                </button>
                <button
                  className="text-button"
                  disabled={
                    !s.analysisReady ||
                    !s.separationReady ||
                    s.busy ||
                    s.job?.status === 'running' ||
                    s.job?.status === 'queued'
                  }
                  onClick={() =>
                    void s.analyze(['separate', 'transcribe', 'corroborate', 'timing'])
                  }
                >
                  Separate parts and compare evidence
                </button>
              </div>
              {!s.analysisReady && (
                <p className="caption">
                  Model analysis is unavailable. The local worker needs its analysis dependencies
                  and permitted research configuration. Listening and your own proposals remain
                  available.
                </p>
              )}
              {s.job && (
                <p role="status">
                  Local analysis: {s.job.status}{' '}
                  {(s.job.status === 'running' || s.job.status === 'queued') && (
                    <button className="text-button" onClick={() => void s.cancel()}>
                      Cancel analysis
                    </button>
                  )}
                </p>
              )}
              {!!s.job?.result?.stems.length && (
                <label>
                  Listen to an estimated part
                  <select
                    value={part}
                    onChange={(e) => {
                      s.assist('Estimated isolation audition requested.');
                      player.current?.pause();
                      setPart(e.target.value);
                    }}
                  >
                    <option value="">Original recording</option>
                    {s.job.result.stems.map((stem) => (
                      <option key={stem.artifact + stem.part} value={stem.artifact}>
                        {stem.part} · {stem.model} · estimated
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {s.job?.status === 'completed' && !state.draftVisible && (
                <button className="secondary-button" onClick={s.reveal}>
                  Reveal draft · counts as help
                </button>
              )}
              {state.draftVisible && (
                <div className="ear-draft">
                  <h3>Model hypothesis</h3>
                  <p>
                    Showing {Math.min(64, s.notes.length)} of {s.notes.length} note hypotheses.
                    Export retains all notes and omissions.
                  </p>
                  <label>
                    Inspect overlap at {inspectAt.toFixed(2)} seconds
                    <input
                      type="range"
                      min="0"
                      max={state.end - state.start}
                      step="0.05"
                      value={inspectAt}
                      onChange={(e) => setInspectAt(Number(e.target.value))}
                    />
                  </label>
                  <p>
                    Hypothetical harmony:{' '}
                    {harmony.interpretations.map((i) => i.chord.symbol).join(' or ') ||
                      'unavailable'}
                    . This interpretation depends on the displayed notes being right.
                  </p>
                  <button
                    className="secondary-button"
                    onClick={() => {
                      s.assist('Draft fingering inspected.');
                      setDraftTab((v) => !v);
                    }}
                  >
                    {draftTab ? 'Hide' : 'Show'} proposed tablature positions
                  </button>
                  <button
                    className="text-button"
                    onClick={() => {
                      const data = {
                        version: 'ear-draft-v1',
                        assetId: state.asset.id,
                        start: state.start,
                        end: state.end,
                        revision: state.revision,
                        originalNotes: s.job?.result?.notes ?? [],
                        reviews: s.reviews,
                        notes: s.notes,
                        positions: draftPositions(s.notes),
                        authority: 'hypotheses-and-learner-corrections',
                        timing: 'unchanged',
                        tuning: [64, 59, 55, 50, 45, 40],
                        capo: 0,
                      };
                      const url = URL.createObjectURL(
                        new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
                      );
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = 'ear-draft.json';
                      a.click();
                      setTimeout(() => URL.revokeObjectURL(url), 1000);
                    }}
                  >
                    Export inspected draft
                  </button>
                  {!!s.reviews.length && (
                    <details>
                      <summary>Your review decisions ({s.reviews.length})</summary>
                      {s.reviews.flatMap((r) =>
                        r.decisions.map((d, i) => (
                          <p key={r.id + ':' + i}>
                            {d.noteId}: {d.decision}
                            {d.midi === undefined ? '' : ' → ' + midiToSpn(d.midi)}. Original
                            hypothesis remains in the export.
                          </p>
                        )),
                      )}
                    </details>
                  )}
                  {draftTab && (
                    <p>
                      Standard tuning, capo 0. One proposed realization, not the performer’s
                      fingering. No notes are shifted; unassigned notes are listed.
                    </p>
                  )}
                  <p>
                    These notes may be wrong or missing. Your corrections remain learner
                    interpretations, separate from a verified reference.
                  </p>
                  <div className="ear-notes">
                    {s.notes.slice(0, 64).map((n) => (
                      <div
                        className={'ear-note' + (draftTab ? ' ear-note-with-position' : '')}
                        key={n.id}
                      >
                        <span>
                          {n.start.toFixed(2)}–{n.end.toFixed(2)}s
                        </span>
                        <strong>
                          {showOctaves
                            ? midiToSpn(n.midi)
                            : midiToSpn(n.midi).replace(/-?\d+$/, '')}
                        </strong>
                        <span>
                          {n.authority === 'learner-confirmed'
                            ? 'Your correction'
                            : 'Model hypothesis'}{' '}
                          · confidence {n.confidence === null ? 'unknown' : n.confidence}
                        </span>
                        {draftTab && (
                          <span>
                            {(() => {
                              const p = positions.find((p) => p.noteId === n.id);
                              return p?.position
                                ? 'String ' + p.position.string + ' · fret ' + p.position.fret
                                : p?.omission;
                            })()}
                          </span>
                        )}
                        <label>
                          Correct note
                          <input
                            aria-label={'Correct ' + n.id}
                            placeholder="e.g. F3"
                            maxLength={8}
                            defaultValue={midiToSpn(n.midi)}
                            onBlur={(e) => {
                              const v = parsePitch(e.target.value);
                              if (v !== null && v >= 0 && v <= 127) {
                                e.target.setCustomValidity('');
                                if (v !== n.midi) void s.correct(n.id, v);
                              } else
                                e.target.setCustomValidity('Enter a note and octave, such as F3.');
                            }}
                          />
                        </label>
                        <button className="text-button" onClick={() => void s.correct(n.id, null)}>
                          Reject note
                        </button>
                      </div>
                    ))}
                  </div>
                  {!s.notes.length && (
                    <p>No note hypotheses are available. This does not establish silence.</p>
                  )}
                </div>
              )}
              <button
                className="primary-button"
                disabled={!state.proposal.every((v) => parseChordSymbol(v))}
                onClick={s.workspace}
              >
                Play my proposal across the neck <ArrowRight size={16} />
              </button>
              <p className="caption">
                Opens a separate synthesized accompaniment. The notes and fingering are a derived
                teaching example.
              </p>
            </div>
          )}
        </>
      )}
      <details className="ear-legacy">
        <summary>Inspect a Toraneko project export</summary>
        <p>
          Reads version 2.7.0 without changing the original. Audio references remain unresolved
          until their files are supplied locally.
        </p>
        <input
          aria-label="Toraneko project export"
          type="file"
          accept=".json"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 8 * 1024 * 1024) {
              setLegacy('Choose a project under 8 MB.');
              return;
            }
            try {
              const r = await fetch('/api/audio/projects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/octet-stream' },
                body: file,
              });
              if (!r.ok) throw new Error();
              const result = await r.json();
              setLegacy(
                result.sourceNoteCount +
                  ' source notes preserved. Reference authority is unestablished; media remains unresolved.',
              );
            } catch {
              setLegacy('This project export could not be imported. Your original is unchanged.');
            }
          }}
        />
        {legacy && <p role="status">{legacy}</p>}
      </details>
      {s.message && (
        <p className="ear-status" role="status">
          {s.message}
        </p>
      )}
    </section>
  );
}
