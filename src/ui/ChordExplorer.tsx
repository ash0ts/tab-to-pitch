import { useId, useState } from 'react';
import { ArrowLeft, ArrowRight, Volume2 } from 'lucide-react';
import { generateTriadVoicings } from '../engine/exploration';
import type { TriadAnalysis, TriadRole } from '../engine/theory';
import type { ScoreTrack } from '../engine/types';
import { Fretboard } from './Fretboard';

export const FRET_WINDOWS = {
  '0-5': { label: 'Frets 0–5', minFret: 0, maxFret: 5 },
  '5-9': { label: 'Frets 5–9', minFret: 5, maxFret: 9 },
  '9-12': { label: 'Frets 9–12', minFret: 9, maxFret: 12 },
  '12-24': { label: 'Frets 12–24', minFret: 12, maxFret: 24 },
  all: { label: 'All frets 0–24', minFret: 0, maxFret: 24 },
} as const;
export type FretWindow = keyof typeof FRET_WINDOWS;

export function FretWindowControl({
  value,
  onChange,
}: {
  value: FretWindow;
  onChange(value: FretWindow): void;
}) {
  const id = useId();
  return (
    <label className="exploration-field" htmlFor={id}>
      Neck area
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as FretWindow)}
      >
        {Object.entries(FRET_WINDOWS).map(([key, range]) => (
          <option key={key} value={key}>
            {range.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ChordExplorer({
  triad,
  sourceChord,
  track,
  showOctaves,
  sourcePitches,
  onPlay,
  onPractice,
}: {
  triad: TriadAnalysis;
  sourceChord: string;
  track: ScoreTrack;
  showOctaves: boolean;
  sourcePitches: number[];
  onPlay(pitches: number[]): void;
  onPractice?(): void;
}) {
  const [window, setWindow] = useState<FretWindow>('0-5');
  const [stringStart, setStringStart] = useState(1);
  const [selectedId, setSelectedId] = useState('');
  const [bassRole, setBassRole] = useState<TriadRole | 'any'>('any');
  const groupCount = Math.max(0, track.tuningMidi.length - 2);
  const firstString = Math.min(stringStart, Math.max(1, groupCount));
  const strings = [firstString, firstString + 1, firstString + 2];
  const shapes = generateTriadVoicings(triad, track.tuningMidi, track.capo, {
    ...FRET_WINDOWS[window],
    strings,
  }).filter((shape) => bassRole === 'any' || shape.bassRole === bassRole);
  const shapeIndex = Math.max(
    0,
    shapes.findIndex((shape) => shape.id === selectedId),
  );
  const shape = shapes[shapeIndex];
  const stringControlId = useId();
  const chordName = `${triad.rootName}${triad.quality === 'minor' ? 'm' : ''}`;
  return (
    <section className="exploration-section" aria-label="Other chord shapes">
      <h3>Other {chordName} shapes</h3>
      <p className="exploration-copy">
        Keep the root, third and fifth. Move them to other strings and octaves to make a new
        voicing.
      </p>
      <div className="exploration-filters">
        <label className="exploration-field" htmlFor={stringControlId}>
          Three strings
          <select
            id={stringControlId}
            value={firstString}
            onChange={(event) => setStringStart(Number(event.target.value))}
            disabled={!groupCount}
          >
            {Array.from({ length: groupCount }, (_, index) => (
              <option key={index} value={index + 1}>
                Strings {index + 1}, {index + 2}, {index + 3}
              </option>
            ))}
          </select>
        </label>
        <FretWindowControl value={window} onChange={setWindow} />
        <label className="exploration-field inversion-field">
          Lowest note
          <select
            value={bassRole}
            onChange={(event) => setBassRole(event.target.value as TriadRole | 'any')}
          >
            <option value="any">Any inversion</option>
            <option value="root">Root in bass</option>
            <option value="third">Third in bass</option>
            <option value="fifth">Fifth in bass</option>
          </select>
        </label>
      </div>
      {shape ? (
        <>
          <div className="shape-navigation">
            <button
              className="round-button"
              aria-label="Previous chord shape"
              disabled={shapeIndex === 0}
              onClick={() => setSelectedId(shapes[shapeIndex - 1]!.id)}
            >
              <ArrowLeft size={18} />
            </button>
            <div aria-live="polite" aria-atomic="true">
              <strong>{shape.chordName}</strong>
              <span>{shape.inversion}</span>
              <small>
                Shape {shapeIndex + 1} of {shapes.length}
              </small>
            </div>
            <button
              className="round-button"
              aria-label="Next chord shape"
              disabled={shapeIndex === shapes.length - 1}
              onClick={() => setSelectedId(shapes[shapeIndex + 1]!.id)}
            >
              <ArrowRight size={18} />
            </button>
          </div>
          <Fretboard
            tuning={track.tuningMidi}
            capo={track.capo}
            minFret={shape.minFret}
            maxFret={Math.min(24, Math.max(shape.minFret + 3, shape.maxFret))}
            strings={strings}
            showOctaves={showOctaves}
            markers={shape.notes.map((note) => ({
              position: note.position,
              label: showOctaves ? note.label : note.noteName,
              role: note.role,
            }))}
            onChoose={(position) => {
              const note = shape.notes.find(
                (item) =>
                  item.position.string === position.string && item.position.fret === position.fret,
              );
              if (note) onPlay([note.midi]);
            }}
            label={`${shape.chordName} chord shape, ${shape.inversion}`}
          />
          <div className="chord-role-key" aria-label="Chord notes and roles">
            {(['root', 'third', 'fifth'] as const).map((role) => {
              const note = shape.notes.find((item) => item.role === role)!;
              return (
                <span className={`role-${role}`} key={role}>
                  <strong>{showOctaves ? note.label : note.noteName}</strong> {role}
                </span>
              );
            })}
          </div>
          <p className="exploration-copy">
            {shape.bassRole === triad.bassRole
              ? `This keeps the ${shape.bassRole} in the bass, like the source ${sourceChord}.`
              : `The ${shape.bassRole} is now the lowest note. The source ${sourceChord} has the ${triad.bassRole} in the bass.`}
          </p>
          <div className="chord-auditions">
            <button className="secondary-button" onClick={() => onPlay(sourcePitches)}>
              <Volume2 size={16} /> Source {sourceChord}
            </button>
            <button
              className="secondary-button"
              onClick={() => onPlay(shape.notes.map((note) => note.midi))}
            >
              <Volume2 size={16} /> Hear this shape
            </button>
          </div>
          <p className="exploration-caption">
            Play only the three shown strings. These are note-correct examples, not fingering
            instructions. The source score stays unchanged.
          </p>
          <div className="exploration-challenge">
            <strong>Try it on your guitar</strong>
            <p>
              Find the root, then play the shape. Move to another shape and name its lowest note
              before listening.
            </p>
          </div>
          {onPractice && (
            <button className="secondary-button full-width" onClick={onPractice}>
              Practice root, third and fifth <ArrowRight size={16} />
            </button>
          )}
        </>
      ) : (
        <p className="exploration-empty" role="status">
          No complete three-note {chordName} shapes fit these filters. Try another area, string
          group or bass note.
        </p>
      )}
    </section>
  );
}
