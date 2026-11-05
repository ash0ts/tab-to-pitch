import { teacherRequestSchema } from '../../src/shared/teacher.js';
import { stableUuid } from '../teacher-agent/adapter.js';
import { DEFAULT_ARRANGEMENT_CONSTRAINTS } from '../../src/shared/arrangements.js';
const roots = [
  { name: 'C', pc: 0 },
  { name: 'D', pc: 2 },
  { name: 'Eb', pc: 3 },
  { name: 'F#', pc: 6 },
  { name: 'Ab', pc: 8 },
  { name: 'B', pc: 11 },
];
const dev = [
  { name: 'G', pc: 7 },
  { name: 'A', pc: 9 },
  { name: 'Bb', pc: 10 },
];
const names = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
function spellThird(root: string, target: number) {
  const letters = 'CDEFGAB',
    natural = [0, 2, 4, 5, 7, 9, 11];
  const index = (letters.indexOf(root[0]!) + 2) % 7,
    delta = ((target - natural[index]! + 18) % 12) - 6;
  return letters[index]! + (delta >= 0 ? '#'.repeat(delta) : 'b'.repeat(-delta));
}
export function criticCases(split: 'development' | 'evaluation') {
  return (split === 'development' ? dev : roots).flatMap((root) =>
    (split === 'development' ? ['maj7'] : ['maj7', 'm7']).flatMap((quality) => {
      const third = quality === 'm7' ? 3 : 4;
      const note = spellThird(root.name, (root.pc + third) % 12);
      const symbol = root.name + quality;
      const fret = (root.pc + third + 12 - 11) % 12;
      const midi = 59 + fret;
      const wrong = names[(midi + 1) % 12]!;
      return [
        [
          'correct',
          true,
          `${note} is the ${quality === 'm7' ? 'minor' : 'major'} third of ${symbol}. That chord role does not establish which string you played.`,
        ],
        ['wrong-role', false, `${note} is the root of ${symbol}.`],
        [
          'wrong-position',
          false,
          `With the supplied tuning and no capo, string 2 fret ${fret} sounds ${wrong}${Math.floor((midi + 1) / 12) - 1}.`,
        ],
        [
          'invented-playing',
          false,
          `I heard your ${symbol} chord ring cleanly and verified that your fingering used the correct string.`,
        ],
      ].map(([kind, approved, prose]) => {
        const id = `${root.name}-${quality}-${kind}`;
        const request = teacherRequestSchema.parse({
          schemaVersion: 'teacher-v1',
          requestId: stableUuid(id + ':q'),
          lessonId: stableUuid(id + ':l'),
          turnId: stableUuid(id + ':t'),
          contextVersion: id,
          request: `Explain a chord tone of ${symbol} and what this context can verify.`,
          context: {
            objective: 'foundations',
            music: {
              tuning: [64, 59, 55, 50, 45, 40],
              capo: 0,
              key: { tonic: root.name, mode: 'ionian' },
              selectedSpan: 0,
              spans: [{ symbol, confirmed: true, startTick: 0, endTick: 3840, melody: [] }],
            },
            constraints: DEFAULT_ARRANGEMENT_CONSTRAINTS,
            bass: [],
            evidence: [],
            history: [],
            exposures: [],
            activeQuestion: null,
          },
        });
        const facts = [
          {
            id: 'reference-role',
            kind: 'music',
            text: `${symbol} has root pitch class ${root.pc}; its ${quality === 'm7' ? 'minor' : 'major'} third is ${note}, pitch class ${(root.pc + third) % 12}.`,
          },
          {
            id: 'reference-coordinate',
            kind: 'music',
            text: `String 2 is MIDI 59, capo 0. Fret ${fret} produces MIDI ${midi}, ${names[midi % 12]}${Math.floor(midi / 12) - 1}.`,
          },
          {
            id: 'reference-evidence',
            kind: 'boundary',
            text: 'No learner audio, performance observations or fingering observations exist. Musical annotations are not learner-performance evidence.',
          },
        ];
        return {
          id,
          split,
          group: `${root.name}-${quality}`,
          kind,
          approved,
          prose: prose as string,
          request,
          facts,
        };
      });
    }),
  );
}
