import { useMemo, useState } from 'react';
import recorded from '../research-data/recorded-arrangement-v2.json';
import {
  arrangementRequestSchema,
  executeArrangementIntent,
  validateArrangementResponse,
} from '../shared/arrangements';
import { Fretboard } from './Fretboard';
import { DEGREE_LABELS } from '../engine/harmony-exercises';

/** A retained successful case, clearly separate from the disabled live research model. */
export function RecordedArrangement({ onAudition }: { onAudition(pitches: number[]): void }) {
  const [selected, setSelected] = useState(0);
  const replay = useMemo(() => {
    try {
      const request = arrangementRequestSchema.parse(recorded.request);
      const response = validateArrangementResponse(recorded.response, request);
      const execution = executeArrangementIntent(request, response.intent);
      const variation = execution.result?.variations.find(
        (item) => item.id === response.candidateId,
      );
      return variation ? { request, response, variation } : null;
    } catch {
      return null;
    }
  }, []);
  const event = replay?.variation.events[selected];
  return (
    <details className="recorded-arrangement">
      <summary>Recorded Forge research proposal</summary>
      <p className="caption">
        A real gpt-oss-20b response from the frozen evaluation, replayed locally without an
        inference call. The full evaluation scored 46/64 on fresh requests, below the 90% release
        gate. Live arrangement coaching remains disabled by default.
      </p>
      {!replay || !event ? (
        <p role="status">This saved proposal no longer passes the current validator.</p>
      ) : (
        <>
          <blockquote>{replay.request.request}</blockquote>
          <p>DADGAD · D major · 4 voices · frets 2–9 · no open strings</p>
          <div className="neck-presets" role="group" aria-label="Recorded proposal chords">
            {replay.variation.events.map((item, index) => (
              <button
                key={item.spanId}
                aria-pressed={selected === index}
                onClick={() => setSelected(index)}
              >
                {item.voicing.chord.symbol}
              </button>
            ))}
          </div>
          <Fretboard
            tuning={replay.request.context.tuning}
            capo={0}
            minFret={2}
            maxFret={9}
            markers={event.voicing.notes.map((note) => ({
              position: note.position,
              label: note.noteName,
            }))}
            label="Validated recorded Forge voicing"
            onChoose={(position) =>
              onAudition([replay.request.context.tuning[position.string - 1]! + position.fret])
            }
          />
          <p>
            {event.voicing.notes
              .map((note) => `${note.noteName}: ${DEGREE_LABELS[note.degree]}`)
              .join(' · ')}
          </p>
          <p className="caption">{replay.response.explanation}</p>
          <p className="caption">
            The application regenerated this candidate and checked its pitches, constraints and
            explanation references. This replay does not alter your selected passage.
          </p>
          <button
            className="secondary-button"
            onClick={() => onAudition(event.voicing.notes.map((note) => note.midi))}
          >
            Hear the recorded voicing
          </button>{' '}
          <a className="text-button" href={recorded.traceUrl} target="_blank" rel="noreferrer">
            Open associated Agent Lens trace (private project)
          </a>
        </>
      )}
    </details>
  );
}
