import { model } from '@coderline/alphatab';
import { midiToSpn } from './theory';
import { sourceNoteId, sourceSpelling } from './adapter';

export type LabelMode = 'pitch' | 'fret';
export interface LabelOptions {
  mode: LabelMode;
  fretHint?: boolean;
  showOctaves?: boolean;
  maskedNoteIds?: ReadonlySet<string>;
}
export type PresentedNote = model.Note & {
  tabToPitchLabel?: string | null;
  tabToPitchWidthText?: string | null;
};

/** Presentation only: never changes source pitch, string, fret or playback. */
export function applyPitchLabels(score: model.Score, options: LabelOptions): void {
  for (const track of score.tracks)
    for (const staff of track.staves)
      for (const bar of staff.bars)
        for (const voice of bar.voices)
          for (const beat of voice.beats)
            for (const note of beat.notes) {
              const presented = note as PresentedNote;
              const spn =
                sourceSpelling(note).spelling ?? midiToSpn(note.realValue, bar.keySignature < 0);
              const label = options.showOctaves
                ? spn
                : spn.replace(/^([A-G](?:#{1,2}|b{1,2}|♯{1,2}|♭{1,2})?)-?\d+/, '$1');
              // Reserve the revealed hybrid width even when a quiz hides the answer.
              presented.tabToPitchWidthText =
                note.isStringed && !note.isDead && !note.isPercussion
                  ? `(${spn}·${note.fret})`
                  : null;
              if (!note.isStringed || note.isDead || note.isPercussion) {
                presented.tabToPitchLabel = null;
              } else if (options.maskedNoteIds?.has(sourceNoteId(note))) {
                presented.tabToPitchLabel = '?';
              } else if (options.mode === 'fret') {
                presented.tabToPitchLabel = null;
              } else {
                // Bends retain their native curve; the SPN is the fretted base pitch.
                presented.tabToPitchLabel = options.fretHint ? `${label}·${note.fret}` : label;
              }
            }
}
