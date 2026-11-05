import { useEffect, useState } from 'react';
import { Headphones, ArrowRight, Volume2 } from 'lucide-react';
import { RECORDINGS } from '../songs/catalog';
import { parseChordSymbol, scaleTones } from '../engine/harmony';
import { passageNumerals, type ListeningDifficulty } from '../songs/listening';
import type { ListeningSession } from '../hooks/useListeningSession';
import { RecordingPlayer } from './RecordingPlayer';
import { playback } from '../player/PlaybackCoordinator';
import './songs.css';

export function ListeningPanel({
  session: s,
  onPlay,
  onAudition,
  onWorkspace,
  audioReady,
  onTransfer,
}: {
  onTransfer(): void;
  session: ListeningSession;
  onPlay(bassOnly?: boolean): void;
  onAudition(pitches: number[]): void;
  onWorkspace(): void;
  audioReady: boolean;
}) {
  const [answers, setAnswers] = useState<string[]>([]);
  const [choicesOpen, setChoicesOpen] = useState(false);
  useEffect(() => {
    setAnswers([]);
    setChoicesOpen(false);
  }, [s.exercise?.id]);
  const p = s.passage;
  if (!p) return null;
  const recording = RECORDINGS.find((r) => r.id === p.recordingId)!;
  const played = () => onPlay(false);
  return (
    <section className="listening-panel" aria-label="Listening lesson">
      <div className="songs-heading">
        <div>
          <span className="eyebrow">
            <Headphones size={15} /> Listen, then find the changes
          </span>
          <h2>{p.title}</h2>
          <p>Key: {p.tonic} major. Start with the sound; the chord names can wait.</p>
        </div>
        <span className="song-status ready">
          {s.source === 'recording' ? 'Song recording' : 'Synthesized teaching example'}
        </span>
      </div>
      {s.difficulty === 'transfer' && (
        <p>
          A different passage or key is loaded. Listen before opening its fretboard, then choose a
          new neck region.
        </p>
      )}
      <div className="listening-controls">
        <label>
          Listening difficulty
          <select
            value={s.difficulty}
            disabled={s.active}
            onChange={(e) => {
              const level = e.target.value as ListeningDifficulty;
              if (level === 'transfer' && s.difficulty !== 'transfer') onTransfer();
              else s.setDifficulty(level);
            }}
          >
            <option value="guided">Guided · one missing chord</option>
            <option value="recall">Recall · the whole progression</option>
            <option value="transfer">Transfer · connect it to the neck</option>
          </select>
        </label>
        <label>
          Audio source
          <select
            value={s.source}
            onChange={(e) => s.changeSource(e.target.value as typeof s.source)}
          >
            <option value="synthesized">Synthesized accompaniment</option>
            {recording.provider === 'youtube' && (
              <option value="recording">Original recording</option>
            )}
          </select>
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={s.familiar}
            disabled={s.active}
            onChange={(e) => s.setFamiliar(e.target.checked)}
          />{' '}
          I already know this progression
        </label>
      </div>
      {s.source === 'recording' ? (
        <RecordingPlayer
          command={s.recordingCommand}
          passage={p}
          recording={recording}
          onStarted={s.replay}
          onInterrupted={s.interrupt}
        />
      ) : (
        <div className="song-actions">
          <button className="secondary-button" disabled={!audioReady} onClick={played}>
            <Volume2 size={16} /> Hear synthesized passage
          </button>
          <button className="text-button" onClick={() => playback.stopAll()}>
            Pause audio
          </button>
        </div>
      )}
      <div className="song-actions">
        <button
          className="text-button"
          onClick={() => {
            const tonic = scaleTones({ tonic: p.tonic, mode: 'ionian' })[0]!;
            onAudition([48 + tonic.pitchClass]);
          }}
        >
          Hear the tonic
        </button>
        <button
          className="text-button"
          type="button"
          disabled={!audioReady}
          onClick={() => {
            s.assist('Synthesized bass comparison requested.');
            if (s.source !== 'synthesized') s.changeSource('synthesized');
            onPlay(true);
          }}
        >
          Compare synthesized bass · counts as help
        </button>
        {!s.active && (
          <button className="primary-button" onClick={() => s.begin()}>
            Try a listening question <ArrowRight size={16} />
          </button>
        )}
      </div>
      {s.exercise && (
        <form
          className="listening-question"
          onSubmit={(e) => {
            e.preventDefault();
            s.answer(answers);
          }}
        >
          <p>
            {s.difficulty === 'guided'
              ? 'Which chord belongs in the empty position?'
              : 'Place a chord at each change. Listen for the roots, then the qualities.'}{' '}
            The change boundaries are supplied.
          </p>
          <div className="listening-slots">
            {p.chords.map((chord, index) => {
              const answerIndex = s.exercise!.slots.indexOf(index);
              return (
                <div className="listening-slot" key={index}>
                  <span>
                    Change {index + 1} · {chord.beats} beats
                  </span>
                  {answerIndex >= 0 ? (
                    <select
                      aria-label={`Chord at change ${index + 1}`}
                      value={answers[answerIndex] ?? ''}
                      disabled={!s.active}
                      onChange={(e) =>
                        setAnswers((a) => {
                          const next = [...a];
                          next[answerIndex] = e.target.value;
                          return next;
                        })
                      }
                    >
                      <option value="">Choose a chord</option>
                      {s.exercise!.choices.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  ) : (
                    <strong>{chord.symbol}</strong>
                  )}
                </div>
              );
            })}
          </div>
          {s.active && (
            <div className="song-actions">
              <button
                className="primary-button"
                disabled={!s.exercise.slots.every((_, i) => answers[i])}
              >
                Check progression
              </button>
              <button type="button" className="text-button" onClick={s.reveal}>
                Reveal progression
              </button>
              <button type="button" className="text-button" onClick={() => s.assist()}>
                Give me an attention cue
              </button>
            </div>
          )}
          {s.active && (
            <div>
              <button
                type="button"
                className="text-button"
                aria-expanded={choicesOpen}
                onClick={() => {
                  if (!choicesOpen) s.assist('Answer-choice audition requested.');
                  setChoicesOpen(!choicesOpen);
                }}
              >
                Compare answer choices · counts as help
              </button>
              {choicesOpen && (
                <div className="song-actions">
                  {s.exercise.choices.map((c) => (
                    <button
                      type="button"
                      className="secondary-button"
                      key={c}
                      onClick={() => {
                        s.assist('Answer choice auditioned.');
                        const chord = parseChordSymbol(c)!;
                        onAudition(chord.tones.map((t) => 48 + chord.rootPitchClass + t.semitones));
                      }}
                    >
                      {c} <Volume2 size={14} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {s.assisted && s.active && (
            <p role="status">
              Help is recorded. Attend to the bass movement first, then compare chord qualities.
              This answer will count as assisted.
            </p>
          )}
        </form>
      )}
      {s.outcome && (
        <div className="listening-feedback" role="status">
          <strong>
            {s.outcome.outcome === 'interrupted'
              ? 'Question interrupted'
              : s.outcome.outcome === 'revealed'
                ? 'Progression revealed'
                : s.outcome.grade?.correct
                  ? 'The progression matches'
                  : 'A change to listen for'}
          </strong>
          {s.outcome.grade?.feedback.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
          <p>
            {(s.outcome.outcome === 'revealed' || s.outcome.grade?.correct) && (
              <>
                {p.chords.map((c) => c.symbol).join(' → ')}
                <br />
                {passageNumerals(p).join(' → ')}
              </>
            )}
          </p>
          <p className="caption">
            {s.outcome.assisted ? 'Assisted' : 'Without in-app hints'} · {s.outcome.replayCount}{' '}
            playback starts · {s.familiar ? 'Familiar progression' : 'Familiarity not reported'}. A
            screen answer is separate from playing.
          </p>
          {s.needsRetry && (
            <div className="song-actions">
              <button className="secondary-button" onClick={s.retry}>
                Try this progression again
              </button>
              <button className="text-button" onClick={s.reveal}>
                Show the full explanation
              </button>
            </div>
          )}
          {!s.masked && (
            <button className="secondary-button" onClick={onWorkspace}>
              Find this progression on the neck <ArrowRight size={16} />
            </button>
          )}
        </div>
      )}
      {s.masked && (
        <p className="listening-mask-note">
          Score, diagrams, and earlier explanations are hidden while you answer.
        </p>
      )}
      {!s.masked && (
        <details className="listening-provenance">
          <summary>About this passage</summary>
          <p>{p.review}</p>
          <p>
            {p.representation === 'teaching-reduction'
              ? 'This is a teaching reduction, not a complete transcription of the arrangement.'
              : 'This accompaniment was authored for the lesson.'}{' '}
            {p.reuse}
          </p>
          {p.sources.map((url) => (
            <a key={url} href={url} target="_blank" rel="noreferrer">
              Source reference ↗{' '}
            </a>
          ))}
        </details>
      )}
    </section>
  );
}
