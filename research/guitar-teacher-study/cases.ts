import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { teacherRequestSchema, type TeacherRequest } from '../../src/shared/teacher.js';
import { DEFAULT_ARRANGEMENT_CONSTRAINTS } from '../../src/shared/arrangements.js';
import { stableUuid } from '../teacher-agent/adapter.js';

export const PROTOCOL = 'guitar-teacher-grounding-v1';
export const EVIDENCE_FIRST = `For a request to show a chord tone, inspect_music and read_learner first, then use demonstrate to prepare the requested highlight and finish with the verified action. For a request to move a progression, inspect_music and explore_voicings with the user's unchanged constraints, then select one returned preview action. Copy the tool's candidate ID exactly. Inspection alone does not fulfill a demonstration request. Batch independent inspection calls to leave room for the final reply. Do not add a quiz when the learner asks to play. Explain the result briefly using the facts; never claim to have heard the learner. Keep numeric frets, string numbers, and fret ranges out of prose, including harmless repetitions of the requested region; say "the selected region" and let the validated diagram display coordinates. A tool call is one step, after which you receive its result and can make another call; it does not need to contain the final explanation.`;

export interface Tone {
  degree: string;
  pc: number;
  name: string;
}
export interface Passage {
  split: 'development' | 'evaluation';
  recording: string;
  sourceSha256: string;
  performer: string;
  family: string;
  style: string;
  tempo: number;
  key: string;
  selected: number;
  tone: Tone;
  note: {
    midi: number;
    position: { string: number; fret: number };
    time: number;
    duration: number;
    annotation: number;
    observation: number;
  };
  spans: {
    symbol: string;
    root: string;
    quality: string;
    tones: Tone[];
    time: number;
    duration: number;
    annotation: number;
    observation: number;
    label: string;
  }[];
}
export interface StudyCase {
  id: string;
  kind: 'role' | 'move';
  passage: Passage;
  request: TeacherRequest;
}
export const passages: Passage[] = JSON.parse(
  readFileSync(new URL('./data/passages.json', import.meta.url), 'utf8'),
);
const roleNames: Record<string, string> = {
  '3': 'major third',
  b3: 'minor third',
  '7': 'major seventh',
  b7: 'minor seventh',
};

export function makeCase(passage: Passage, kind: StudyCase['kind'], identity: string): StudyCase {
  const id = `${passage.recording}:${kind}`;
  const offset = passage.spans[0]!.time;
  const region =
    createHash('sha256').update(id).digest()[0]! % 2
      ? { minFret: 5, maxFret: 10 }
      : { minFret: 7, maxFret: 12 };
  const symbol = passage.spans[passage.selected]!.symbol;
  const request = teacherRequestSchema.parse({
    schemaVersion: 'teacher-v5',
    capabilities: ['practice-stage-v1'],
    requestId: stableUuid(identity + ':request'),
    lessonId: stableUuid(identity + ':lesson'),
    turnId: stableUuid(identity + ':turn'),
    contextVersion: `${PROTOCOL}:${id}`,
    request:
      kind === 'role'
        ? `For the selected ${symbol} in this passage, show its ${roleNames[passage.tone.degree]} on the fretboard in the selected region and explain its role briefly. Prepare a playable demonstration, not a quiz. The harmony is the supplied lead sheet; the note annotation is not evidence of my playing.`
        : `Move this entire three-chord passage to frets ${region.minFret}–${region.maxFret}. Prepare a four-note accompaniment preview with the same harmony and timing, at most four frets of span, and the existing constraints. I want to play it there, not take a quiz. An alternative fingering is not a claim about the recorded guitarist's hands.`,
    context: {
      objective: 'foundations',
      presentation: {
        activity: 'progression',
        mode: 'rehearsal',
        playing: false,
        feedbackVisible: true,
        goal:
          kind === 'role'
            ? 'Locate a chord tone, then play it'
            : 'Play the progression in another neck region',
      },
      music: {
        tuning: [64, 59, 55, 50, 45, 40],
        capo: 0,
        key: {
          tonic: passage.key.split(':')[0],
          mode: passage.key.endsWith(':minor') ? 'aeolian' : 'ionian',
        },
        selectedSpan: passage.selected,
        spans: passage.spans.map((s) => ({
          symbol: s.symbol,
          confirmed: true,
          startTick: Math.round((s.time - offset) * passage.tempo * 16),
          endTick: Math.round((s.time + s.duration - offset) * passage.tempo * 16),
          melody: [],
        })),
      },
      selectedNotes: [
        { id: 'n0', midi: passage.note.midi, position: passage.note.position, spelling: null },
      ],
      constraints: {
        ...DEFAULT_ARRANGEMENT_CONSTRAINTS,
        ...region,
        allowOpenStrings: false,
        voiceCount: 4,
        omitFifth: true,
      },
      bass: [],
      evidence: [],
      exposures: [],
      activeQuestion: null,
      history: [
        {
          role: 'user',
          text: 'I want a short musical example I can play on my guitar. Please keep the notes and roles connected to this passage.',
        },
      ],
    },
  });
  return { id, kind, passage, request };
}
export function cases(split: Passage['split'], identity: string) {
  return passages
    .filter((p) => p.split === split)
    .flatMap((p) =>
      (['role', 'move'] as const).map((kind) =>
        makeCase(p, kind, `${identity}:${p.recording}:${kind}`),
      ),
    );
}
