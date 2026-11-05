import { useEffect, useState } from 'react';
import type { HarmonySpan, VoicingOptions } from '../engine/harmony';
import { isQuizEligible } from '../engine/theory';
import type { ScoreTrack } from '../engine/types';
import type { RankedVoicings } from '../engine/voicing-ranker';
import { Fretboard } from './Fretboard';

export function RecordedChoiceExplorer({
  track,
  span,
  previous,
  options,
  onAudition,
}: {
  track: ScoreTrack;
  span: HarmonySpan;
  previous?: HarmonySpan;
  options: VoicingOptions & { preserveMelody?: boolean };
  onAudition(pitches: number[]): void;
}) {
  const [enabled, setEnabled] = useState(false);
  const [result, setResult] = useState<
    (RankedVoicings & { candidateCount?: number; searchStatus?: string }) | null
  >(null);
  const [selected, setSelected] = useState(0);
  const key = JSON.stringify([track.id, span, previous, options, enabled]);
  useEffect(() => {
    setResult(null);
    setSelected(0);
    if (!enabled) return;
    const source = track.notes.filter((note) => span.sourceNoteIds.includes(note.id));
    const before = track.notes.filter((note) => previous?.sourceNoteIds.includes(note.id));
    if (
      !previous ||
      options.preserveMelody ||
      !source.length ||
      [...source, ...before].some((note) => !isQuizEligible(note) || !note.position)
    ) {
      setResult({
        status: 'unsupported',
        voicings: [],
        reason:
          'Select a chord after the first, with stable source notes and no melody constraint. This experiment orders one change from the previous recorded shape.',
      });
      return;
    }
    const worker = new Worker(new URL('../engine/voicing-ranker.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (event) => setResult(event.data);
    worker.onerror = () =>
      setResult({
        status: 'unsupported',
        voicings: [],
        reason: 'Experimental ordering is unavailable. Use the movement-based progression above.',
      });
    worker.postMessage({
      chord: span.chord,
      options,
      tuning: track.tuningMidi,
      capo: track.capo,
      previous: before.map((note) => ({ position: note.position!, midi: note.soundingMidi! })),
      pitchClasses: source.map((note) => note.soundingMidi! % 12),
    });
    return () => worker.terminate();
  }, [key, track]);
  const voicing = result?.status === 'ranked' ? result.voicings[selected] : null;
  return (
    <details className="recorded-choice">
      <summary>Research: recorded-choice ordering</summary>
      <p className="caption">
        Compare shapes using a model trained on GuitarSet accompaniment. It keeps this source
        chord’s notes and doublings, and uses the previous source shape. This is a one-change
        comparison; the progression above keeps its movement ranking.
      </p>
      <label className="check-label">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        Enable experimental candidate ordering
      </label>
      {enabled && !result && <p role="status">Ordering eligible shapes…</p>}
      {result?.status === 'unsupported' && (
        <p role="status" className="caption">
          {result.reason} Match the voice count to the source, or try another region.
        </p>
      )}
      {voicing && (
        <>
          <p className="caption">
            {result!.candidateCount} matching shapes in a bounded bank of up to 64.{' '}
            {result!.searchStatus === 'incomplete' ? 'Search incomplete. ' : ''}Scores order
            candidates; they are not confidence, comfort or musical-quality estimates.
          </p>
          <label>
            Candidate
            <select
              aria-label="Experimental candidate"
              value={selected}
              onChange={(event) => setSelected(Number(event.target.value))}
            >
              {result!.voicings.map((item, index) => (
                <option key={item.id} value={index}>
                  #{index + 1} · frets {item.minFret}–{item.maxFret} · {item.inversion}
                </option>
              ))}
            </select>
          </label>
          <Fretboard
            tuning={track.tuningMidi}
            capo={track.capo}
            minFret={options.minFret}
            maxFret={options.maxFret}
            markers={voicing.notes.map((note) => ({
              position: note.position,
              label: note.noteName,
            }))}
            label="Experimental recorded-choice candidate"
            onChoose={(position) =>
              onAudition([track.tuningMidi[position.string - 1]! + track.capo + position.fret])
            }
          />
          <button
            className="secondary-button"
            onClick={() => onAudition(voicing.notes.map((note) => note.midi))}
          >
            Hear this candidate
          </button>
        </>
      )}
    </details>
  );
}
