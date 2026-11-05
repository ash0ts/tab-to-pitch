import { formatPitch } from '../engine/exploration';
import type { TriadRole } from '../engine/theory';
import type { FretPosition } from '../engine/types';

export interface FretboardMarker {
  position: FretPosition;
  label?: string;
  role?: TriadRole | 'seventh' | 'extension' | 'scale' | 'target';
}

interface Props {
  tuning: readonly number[];
  capo: number;
  positions?: FretPosition[];
  markers?: FretboardMarker[];
  currentPosition?: FretPosition | null;
  strings?: number[];
  minFret?: number;
  maxFret?: number;
  showOctaves?: boolean;
  onChoose?(position: FretPosition): void;
  hideLabels?: boolean;
  selectableAll?: boolean;
  selectedPositions?: FretPosition[];
  label?: string;
}

export function Fretboard({
  tuning,
  capo,
  positions = [],
  markers,
  currentPosition,
  strings,
  minFret = 0,
  maxFret = 12,
  showOctaves = false,
  onChoose,
  hideLabels = false,
  selectableAll = false,
  selectedPositions = [],
  label = 'Guitar fretboard',
}: Props) {
  const first = Math.max(0, Math.min(24, Math.floor(minFret)));
  const last = Math.max(first, Math.min(24, Math.floor(maxFret)));
  const frets = Array.from({ length: last - first + 1 }, (_, offset) => first + offset);
  const shownStrings = strings ?? tuning.map((_, index) => index + 1);
  const byPosition = new Map(
    (markers ?? positions.map((position) => ({ position }) as FretboardMarker)).map((marker) => [
      `${marker.position.string}:${marker.position.fret}`,
      marker,
    ]),
  );
  return (
    <div
      className="fretboard-scroll exploration-board"
      role="region"
      aria-label={label}
      tabIndex={0}
    >
      <div
        className="fretboard"
        style={{ gridTemplateColumns: `54px repeat(${frets.length}, minmax(44px, 1fr))` }}
      >
        <span className="fret-number string-heading">String</span>
        {frets.map((fret) => (
          <span className="fret-number" key={fret}>
            {fret === 0 ? 'Open' : fret}
          </span>
        ))}
        {shownStrings.map((string) => (
          <div className="fret-string" key={string}>
            <span className="string-name">
              S{string}
              {!hideLabels && <small>{formatPitch(tuning[string - 1]! + capo, showOctaves)}</small>}
            </span>
            {frets.map((fret) => {
              const marker = byPosition.get(`${string}:${fret}`);
              if (!marker && !selectableAll)
                return (
                  <span className={`fret ${fret === 0 ? 'nut' : ''}`} aria-hidden="true" key={fret}>
                    <span>{[3, 5, 7, 9, 12, 15, 17, 19, 21, 24].includes(fret) ? '·' : ''}</span>
                  </span>
                );
              const chosen = selectedPositions.some((p) => p.string === string && p.fret === fret);
              const current = currentPosition?.string === string && currentPosition.fret === fret;
              const pitch =
                marker?.label ?? formatPitch(tuning[string - 1]! + capo + fret, showOctaves);
              return (
                <button
                  key={fret}
                  className={`fret ${marker ? 'marked' : ''} ${!hideLabels && marker?.role ? `role-${marker.role}` : ''} ${chosen ? 'selected-cell' : ''} ${current ? 'source-position' : ''} ${fret === 0 ? 'nut' : ''}`}
                  aria-pressed={onChoose ? chosen : undefined}
                  onClick={() => onChoose?.({ string, fret })}
                  disabled={!onChoose}
                  aria-label={`String ${string}, fret ${fret}${hideLabels || !marker ? '' : `, ${pitch}${marker?.role ? `, ${marker.role}` : ''}`}${current ? ', source position' : ''}`}
                >
                  <span>{!hideLabels && marker ? pitch : chosen ? '●' : '·'}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
