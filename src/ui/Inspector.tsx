import { useState } from 'react';
import { ArrowRight, Music2, Volume2 } from 'lucide-react';
import type { ExerciseKind, NoteEvent, ScoreTrack } from '../engine/types';
import {
  analyzeTriad,
  deriveTriad,
  soundingAt,
  isQuizEligible,
  parsePitch,
} from '../engine/theory';
import { displayNoteLabel, findNotePositions, formatPitch } from '../engine/exploration';
import { audition } from '../audition';
import { analyzeHarmony } from '../engine/harmony';
import { Fretboard } from './Fretboard';
import { ChordExplorer, FRET_WINDOWS, FretWindowControl, type FretWindow } from './ChordExplorer';
import './exploration.css';

function locationLabel(name: string, midi: number, showOctaves: boolean): string {
  if (!showOctaves) return name;
  const reference = parsePitch(`${name}4`);
  const spelling = reference === null ? '' : `${name}${4 + (midi - reference) / 12}`;
  return parsePitch(spelling) === midi ? spelling : formatPitch(midi, true);
}

export function Inspector({
  note,
  track,
  showOctaves = false,
  onSelect,
  onAudition,
  onError,
  onPractice,
}: {
  note: NoteEvent | undefined;
  track: ScoreTrack | undefined;
  showOctaves?: boolean;
  onSelect(id: string): void;
  onAudition(): void;
  onError(message: string): void;
  onPractice?(kind: ExerciseKind, options?: { locationMatch?: 'pitch-class' | 'exact' }): void;
}) {
  const [view, setView] = useState<'notes' | 'chords'>('notes');
  const [match, setMatch] = useState<'pitch-class' | 'exact'>('pitch-class');
  const [window, setWindow] = useState<FretWindow>('0-5');
  if (!note || !track)
    return (
      <div className="empty-panel">
        <Music2 size={32} />
        <h3>Every note has a place.</h3>
        <p>Select a note in the score to find it across the neck or explore the chord around it.</p>
      </div>
    );
  const sounding = soundingAt(track.notes, note.onsetTicks);
  const triad = track.harmonySupported === false ? null : analyzeTriad(sounding);
  const harmony = track.harmonySupported === false ? null : analyzeHarmony(sounding);
  const bass = [...sounding]
    .filter((item) => item.soundingMidi !== null)
    .sort((a, b) => a.soundingMidi! - b.soundingMidi!)[0];
  const chord = triad
    ? `${triad.rootName}${triad.quality === 'minor' ? 'm' : ''}${triad.bassRole !== 'root' && bass ? `/${displayNoteLabel(bass)}` : ''}`
    : null;
  const eligiblePosition = Boolean(
    note.position && isQuizEligible(note) && track.supported !== false,
  );
  const alternatives =
    eligiblePosition && note.soundingMidi !== null
      ? findNotePositions(note.soundingMidi, track.tuningMidi, track.capo, {
          match,
          ...FRET_WINDOWS[window],
        })
      : [];
  const sourceInArea = alternatives.some(
    (position) =>
      position.string === note.position?.string && position.fret === note.position?.fret,
  );
  const play = (midis: number[]) => {
    onAudition();
    void audition(midis).catch(() =>
      onError(
        'The listening example could not play. Try it again after enabling audio in your browser.',
      ),
    );
  };
  return (
    <div className="note-exploration">
      <div className="panel-heading">
        <span className="eyebrow">Inside the music</span>
        <span className="bar-badge">Bar {note.measureIndex + 1}</span>
      </div>
      <div className="note-identity">
        <div>
          <h2>{displayNoteLabel(note, showOctaves)}</h2>
          {triad && chord && (
            <span className="note-chord-context">
              {triad.roles[note.id]} of {chord}
            </span>
          )}
        </div>
        <button
          className="round-button"
          aria-label="Hear selected note"
          disabled={note.soundingMidi === null}
          onClick={() => note.soundingMidi !== null && play([note.soundingMidi])}
        >
          <Volume2 size={21} />
        </button>
      </div>
      <p className="note-coordinate">
        {note.position
          ? `String ${note.position.string} · Fret ${note.position.fret}`
          : 'Pitched instrument'}
        {track.capo ? ` · Frets from capo ${track.capo}` : ''}
      </p>
      {note.effects.bend?.length ? (
        <p className="exploration-copy">
          Bend: {note.effects.bend.map((point) => point.semitones).join(' → ')} semitones. The label
          names the starting pitch.
        </p>
      ) : null}
      <div className="exploration-switch" role="group" aria-label="Explore the fretboard">
        <button aria-pressed={view === 'notes'} onClick={() => setView('notes')}>
          Notes across the neck
        </button>
        <button aria-pressed={view === 'chords'} onClick={() => setView('chords')}>
          Chord shapes
        </button>
      </div>
      {view === 'notes' ? (
        <section className="exploration-section" aria-label="Notes across the neck">
          <h3>Find {displayNoteLabel(note)} across the neck</h3>
          {eligiblePosition ? (
            <>
              <p className="exploration-copy">
                {match === 'pitch-class'
                  ? 'One note name, several registers. Tap a marked note to hear how high or low it sounds.'
                  : 'These locations match the selected sound, including its octave.'}
              </p>
              <div className="exploration-switch compact" role="group" aria-label="Note matching">
                <button
                  aria-pressed={match === 'pitch-class'}
                  onClick={() => setMatch('pitch-class')}
                >
                  Any octave
                </button>
                <button aria-pressed={match === 'exact'} onClick={() => setMatch('exact')}>
                  Exact pitch
                </button>
              </div>
              <FretWindowControl value={window} onChange={setWindow} />
              <Fretboard
                tuning={track.tuningMidi}
                capo={track.capo}
                markers={alternatives.map((position) => ({
                  position,
                  label: locationLabel(
                    displayNoteLabel(note),
                    track.tuningMidi[position.string - 1]! + track.capo + position.fret,
                    showOctaves,
                  ),
                }))}
                currentPosition={note.position}
                minFret={FRET_WINDOWS[window].minFret}
                maxFret={FRET_WINDOWS[window].maxFret}
                showOctaves={showOctaves}
                onChoose={(position) =>
                  play([track.tuningMidi[position.string - 1]! + track.capo + position.fret])
                }
                label={`${displayNoteLabel(note)} locations, ${match === 'pitch-class' ? 'any octave' : 'exact pitch'}`}
              />
              <p className="exploration-caption" role="status">
                {alternatives.length} {alternatives.length === 1 ? 'location' : 'locations'} in this
                area.{' '}
                {sourceInArea
                  ? 'The outlined note is the source position.'
                  : 'The source position is outside this area.'}
                {' Scroll the diagram horizontally to see the whole area.'}
              </p>
              {!alternatives.length && (
                <p className="exploration-empty">Try another neck area to find this note.</p>
              )}
              <div className="exploration-challenge">
                <strong>Connect the locations</strong>
                <p>
                  Play the source note, then find it on a different string. Say its name before
                  checking the diagram.
                </p>
              </div>
              {onPractice && (
                <button
                  className="secondary-button full-width"
                  onClick={() => onPractice('note-location', { locationMatch: match })}
                >
                  Practice finding this note <ArrowRight size={16} />
                </button>
              )}
            </>
          ) : (
            <p className="exploration-empty">
              This note has an articulation or instrument position that cannot be mapped to ordinary
              fretted locations. Select a plain fretted note to explore the neck.
            </p>
          )}
        </section>
      ) : triad && chord && track.supported !== false && track.tuningMidi.length >= 3 ? (
        <ChordExplorer
          triad={triad}
          sourceChord={chord}
          track={track}
          showOctaves={showOctaves}
          sourcePitches={sounding.map((item) => item.soundingMidi!)}
          onPlay={play}
          onPractice={onPractice ? () => onPractice('triad-role') : undefined}
        />
      ) : (
        <section className="exploration-section">
          <h3>Other chord shapes</h3>
          <p className="exploration-empty">
            Use the progression studio above for seventh chords, extensions, and partial voicings.
            Confirm the intended harmony there before moving it.
          </p>
        </section>
      )}
      <section className="inspector-section source-chord">
        <h3>{chord ? `Inside ${chord}` : 'Notes sounding together'}</h3>
        {triad && (
          <p className="exploration-copy">
            {triad.quality === 'major' ? 'Major' : 'Minor'} triad. {triad.rootName} is the root.
            {triad.bassRole !== 'root' && bass
              ? ` ${displayNoteLabel(bass)} is the lowest note, so ${chord} names the chord and its bass separately.`
              : ' The root is also the lowest note.'}
          </p>
        )}
        <div className="note-rows">
          {sounding.map((item) => (
            <button
              key={item.id}
              className={`note-row ${item.id === note.id ? 'selected' : ''}`}
              onClick={() => onSelect(item.id)}
            >
              <span>
                {item.position ? `S${item.position.string} · f${item.position.fret}` : 'Pitch'}
              </span>
              <strong>{displayNoteLabel(item, showOctaves)}</strong>
              <span>{triad?.roles[item.id] ?? 'source note'}</span>
            </button>
          ))}
        </div>
        {!triad && (
          <p className="exploration-copy">
            {track.harmonySupported === false
              ? 'This articulation is outside supported chord analysis.'
              : harmony?.interpretations.length
                ? `Possible harmony: ${harmony.interpretations.map((item) => item.chord.symbol).join(' or ')}. Confirm its role in the progression studio.`
                : 'These notes do not establish a supported chord. You can confirm the intended harmony in the progression studio.'}
          </p>
        )}
        {triad && (
          <>
            <button
              className="secondary-button full-width"
              onClick={() => {
                const derived = deriveTriad(
                  sounding,
                  triad.quality === 'major' ? 'minor' : 'major',
                );
                if (derived) play(derived.pitches.map((pitch) => pitch.midi));
              }}
            >
              <Volume2 size={16} /> Hear it as {triad.quality === 'major' ? 'minor' : 'major'}
            </button>
            <p className="exploration-caption">
              Move every third by one semitone to hear the difference. Your score stays intact.
            </p>
          </>
        )}
      </section>
      <p className="caption source-reference">
        Source: track {track.index + 1}, bar {note.measureIndex + 1}, voice {note.voiceIndex + 1}.
        {showOctaves && note.soundingMidi !== null
          ? ` Concert pitch ${displayNoteLabel(note, true)}.`
          : ''}
      </p>
    </div>
  );
}
