import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { DEFAULT_ARRANGEMENT_CONSTRAINTS } from '../shared/arrangements';
import { teacherRequestSchema, type TeacherRequest } from '../shared/teacher';
import { gradeExercise } from './assessment';
import {
  createTeacherExercise,
  createTeacherToolRuntime,
  exposureKeysForTeacherTurn,
  localTeacher,
  resolveTeacherAction,
  validateTeacherTurn,
} from './teacher';

function request(symbols = ['G7', 'Cmaj7']): TeacherRequest {
  return teacherRequestSchema.parse({
    schemaVersion: 'teacher-v1',
    requestId: '00000000-0000-4000-8000-000000000001',
    lessonId: '00000000-0000-4000-8000-000000000002',
    turnId: '00000000-0000-4000-8000-000000000003',
    contextVersion: 'test:1',
    request: 'Show me a connection.',
    context: {
      objective: 'connections',
      music: {
        tuning: [64, 59, 55, 50, 45, 40],
        capo: 0,
        key: { tonic: 'C', mode: 'ionian' },
        selectedSpan: 0,
        spans: symbols.map((symbol, i) => ({
          symbol,
          confirmed: true,
          startTick: i * 3840,
          endTick: (i + 1) * 3840,
          melody: [],
        })),
      },
      constraints: { ...DEFAULT_ARRANGEMENT_CONSTRAINTS, minFret: 3, maxFret: 9 },
      bass: [],
      evidence: [],
      history: [],
      exposures: [],
      activeQuestion: null,
    },
  });
}
describe('teacher musical tools', () => {
  it('grounds selected ordinary notes without uploading source identities', () => {
    const r = request();
    r.context.selectedNotes = [
      { id: 'n0', midi: 60, position: { string: 2, fret: 1 }, spelling: 'B#3' },
    ];
    expect(teacherRequestSchema.safeParse(r).success).toBe(true);
    expect(createTeacherToolRuntime(r).facts.find((f) => f.id === 'selected:n0')?.text).toContain(
      'B#3',
    );
    r.context.selectedNotes[0]!.midi = 61;
    expect(teacherRequestSchema.safeParse(r).success).toBe(false);
  });
  it('distinguishes a derived workspace from its original chord symbols', () => {
    const r = request(['Dm9']);
    r.context.workspace = { view: 'proposal', sourceSymbols: ['Dm7'] };
    const fact = createTeacherToolRuntime(r).facts.find((f) => f.id === 'workspace');
    expect(fact?.text).toContain('Original symbols: Dm7');
    expect(fact?.text).toContain('Current confirmed symbols: Dm9');
    const q = createTeacherExercise(r, { kind: 'chord-tone', spanIndex: 0, degree: '9' })!;
    expect(q.prompt).toContain('E');
    expect(gradeExercise(q, 'ninth').correct).toBe(true);
  });
  it('grades both physical endpoints and the exact descending semitone', () => {
    const q = createTeacherExercise(request(), {
      kind: 'voice-connection',
      spanIndex: 0,
      degree: 'b7',
      targetDegree: '3',
      semitones: -1,
      assessment: 'practice',
    })!;
    // Independent fixture: standard B string at fret 6 is F4, fret 5 is E4.
    expect(gradeExercise(q, '2:6 → 2:5').correct).toBe(true);
    expect(gradeExercise(q, '2:5').correct).toBe(false);
    expect(gradeExercise(q, '2:6 → 5:7').correct).toBe(false); // E3 is the right class, wrong movement.
    expect(gradeExercise(q, '1:5 → 2:5').correct).toBe(false); // A is not the G7 seventh.
    expect(q.noteIds).toEqual([]);
    expect(q.stimulus?.id).toMatch(/^derived:/);
  });
  it('keeps destination-only grading distinct', () => {
    const q = createTeacherExercise(request(), {
      kind: 'next-target',
      spanIndex: 0,
      degree: 'b7',
      targetDegree: '3',
    })!;
    expect(gradeExercise(q, '2:5').correct).toBe(true);
    expect(gradeExercise(q, '5:7').correct).toBe(true);
    expect(q.kind).toBe('next-target');
  });
  it('applies capo once and preserves reentrant physical string order', () => {
    const r = request();
    r.context.music.capo = 1;
    r.context.music.tuning = [52, 59, 55, 50, 45, 64];
    const q = createTeacherExercise(r, {
      kind: 'voice-connection',
      spanIndex: 0,
      degree: 'b7',
      targetDegree: '3',
      semitones: -1,
    })!;
    expect(gradeExercise(q, '2:5 → 2:4').correct).toBe(true);
    expect(gradeExercise(q, '2:6 → 2:5').correct).toBe(false);
  });
  it('excludes unsupported or impossible connections and ambiguous harmony', () => {
    const r = request();
    r.context.music.spans[0]!.confirmed = false;
    expect(createTeacherExercise(r, { kind: 'chord-tone', spanIndex: 0, degree: 'b7' })).toBeNull();
    expect(
      createTeacherExercise(request(), {
        kind: 'voice-connection',
        spanIndex: 0,
        degree: 'b7',
        targetDegree: '3',
        semitones: 1,
      }),
    ).toBeNull();
  });
  it('identifies the ninth in Dm9 without treating add9 as the same transformation', () => {
    const r = request(['Dm7']);
    const q = createTeacherExercise(r, {
      kind: 'changed-tone',
      spanIndex: 0,
      degree: '1',
      targetSymbol: 'Dm9',
    })!;
    expect(gradeExercise(q, 'E').correct).toBe(true);
    expect(gradeExercise(q, 'F').correct).toBe(false);
    expect(
      createTeacherExercise(r, {
        kind: 'changed-tone',
        spanIndex: 0,
        degree: '1',
        targetSymbol: 'Dmadd9',
      }),
    ).toBeNull();
  });
  it('preserves spelling in roles even when pitches are enharmonic', () => {
    const r = request(['F#maj7']);
    const turn = localTeacher(r);
    turn.claims = [{ kind: 'tone-role', spanIndex: 0, noteName: 'E#', degree: '7' }];
    expect(validateTeacherTurn(turn, r)).not.toBeNull();
    turn.claims = [{ kind: 'tone-role', spanIndex: 0, noteName: 'F', degree: '7' }];
    expect(validateTeacherTurn(turn, r)).toBeNull();
  });
  it('requires explicit root bass context for rootless generation', () => {
    const r = request(['Cmaj7']);
    r.context.constraints.voiceCount = 3;
    const intent = {
      action: 'propose',
      reason: 'requested',
      operation: 'move',
      constraints: { ...r.context.constraints, rootless: true },
      targetQuality: null,
      substituteSymbol: null,
    };
    expect(
      createTeacherToolRuntime(r).execute({ name: 'explore_voicings', args: { intent } }).status,
    ).toBe('unavailable');
    r.context.bass = [{ spanIndex: 0, midi: 36, source: 'authored' }];
    const result = createTeacherToolRuntime(r).execute({
      name: 'explore_voicings',
      args: { intent },
    });
    expect(result.status).toBe('ok');
    expect(result.actions.length).toBeGreaterThan(0);
    expect(
      resolveTeacherAction(r, result.actions[0])?.variation?.events[0]?.voicing.notes.some(
        (n) => n.degree === '1',
      ),
    ).toBe(false);
  });
  it('never exposes grading keys in question tool results', () => {
    const result = createTeacherToolRuntime(request()).execute({
      name: 'create_question',
      args: { recipe: { kind: 'chord-tone', spanIndex: 0, degree: 'b7' } },
    });
    expect(result.status).toBe('ok');
    expect(JSON.stringify(result)).not.toContain('accepted');
    expect(JSON.stringify(result)).not.toContain('answer');
  });
  it('invalidates stale proposals, invented evidence, and unassisted actions', () => {
    const r = request(),
      turn = localTeacher(r);
    turn.contextVersion = 'stale';
    expect(validateTeacherTurn(turn, r)).toBeNull();
    turn.contextVersion = r.contextVersion;
    turn.claims = [
      { kind: 'observation', evidenceId: 'invented', outcome: 'incorrect', assisted: false },
    ];
    expect(validateTeacherTurn(turn, r)).toBeNull();
    turn.claims = [];
    r.context.activeQuestion = { id: 'question', kind: 'chord-tone', assisted: false };
    expect(validateTeacherTurn(turn, r)).toBeNull();
    expect(localTeacher(r).actions).toEqual([]);
  });
  it('does not relabel an exposed example as a held-out assessment', () => {
    const r = request(),
      recipe = { kind: 'chord-tone', spanIndex: 0, degree: 'b7', assessment: 'heldout' };
    expect(createTeacherExercise(r, recipe)).not.toBeNull();
    r.context.exposures = exposureKeysForTeacherTurn(r, localTeacher(r));
    expect(createTeacherExercise(r, recipe)).toBeNull();
  });
  it('does not reset exposure by changing a neck boundary or voice count', () => {
    const r = request();
    r.context.exposures = exposureKeysForTeacherTurn(r, localTeacher(r));
    r.context.constraints.voiceCount = 3;
    r.context.constraints.maxFret = 10;
    expect(
      createTeacherExercise(r, {
        kind: 'note-location',
        spanIndex: 0,
        degree: 'b7',
        assessment: 'heldout',
      }),
    ).toBeNull();
    // Frets 15–19 are physically distinct from every position displayed at frets 3–9.
    expect(
      createTeacherExercise(r, {
        kind: 'note-location',
        spanIndex: 0,
        degree: 'b7',
        assessment: 'heldout',
        region: { minFret: 15, maxFret: 19 },
      }),
    ).not.toBeNull();
    expect(
      createTeacherExercise(r, {
        kind: 'chord-tone',
        spanIndex: 0,
        degree: 'b7',
        assessment: 'heldout',
        region: { minFret: 15, maxFret: 19 },
      }),
    ).toBeNull();
  });
  it('respects named chord connections in the authored policy', () => {
    const r = request(['Dm7', 'G7', 'Cmaj7', 'Am7']);
    r.request = 'Show me how G7 resolves to Cmaj7';
    const action = localTeacher(r).actions.find((a) => a.type === 'question');
    expect(action?.type === 'question' && action.recipe.spanIndex).toBe(1);
  });
  it('keeps matching provenance references without bundled trained parameters', () => {
    expect(
      readFileSync(new URL('../research-data/voicing-ranker-v1.json', import.meta.url), 'utf8'),
    ).toBe(
      readFileSync(
        new URL('../../public/research/voicing-ranker-v1.json', import.meta.url),
        'utf8',
      ),
    );
  });
  it('keeps trained parameters out of both runtime distributions', () => {
    for (const path of [
      '../research-data/voicing-ranker-v1.json',
      '../../public/research/voicing-ranker-v1.json',
    ]) {
      const reference = JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
      expect(reference.kind).toBe('model-reference');
      for (const key of ['weights', 'mean', 'std']) expect(reference).not.toHaveProperty(key);
    }
    const result = createTeacherToolRuntime(request()).execute({
      name: 'research_ranker',
      args: {
        spanIndex: 0,
        previous: [
          { string: 1, fret: 0 },
          { string: 2, fret: 1 },
          { string: 3, fret: 0 },
        ],
        candidateId: 'unavailable',
      },
    });
    expect(result.status).toBe('unavailable');
    expect(result.reason).toContain('not bundled');
  });
  it('returns argument errors for repair without executing invented tools', () => {
    const result = createTeacherToolRuntime(request()).execute({
      name: 'demonstrate',
      args: { action: { type: 'save-source' } },
    });
    expect(result.status).toBe('invalid');
    expect(result.actions).toEqual([]);
  });
});
