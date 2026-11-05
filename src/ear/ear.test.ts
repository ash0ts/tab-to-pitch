import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { earActionAllowed, earFacts } from './teacher';
import { gradeEarProposal, earMasked, EAR_REFERENCE, reviewedNotes, type EarState } from './model';
import { audioJobRequestSchema, earContextSchema, earActionSchema } from '../shared/audio';
import { earScore } from '../player/ear-score';
import { createTeacherToolRuntime, localTeacher, validateTeacherTurn } from '../engine/teacher';
import { DEFAULT_ARRANGEMENT_CONSTRAINTS } from '../shared/arrangements';
import { teacherRequestSchema, EAR_TEACHER_VERSION, type TeacherRequest } from '../shared/teacher';

const ear = () =>
  earContextSchema.parse({
    revision: randomUUID(),
    duration: 8,
    analysis: 'none',
    origin: 'upload',
    draftVisible: false,
    activeQuestion: false,
    assisted: false,
    hypotheses: [
      {
        id: 'h0',
        midi: 65,
        start: 0,
        end: 4,
        authority: 'model-hypothesis',
        confidence: null,
        independentFamilies: 2,
      },
    ],
    proposal: ['G7', 'Cmaj7'],
    referenceAvailable: false,
  });
const state = (): EarState => ({
  asset: {
    id: EAR_REFERENCE.assetId,
    schemaVersion: 'ear-lab-v1',
    recordingId: 'a'.repeat(64),
    duration: 8,
    origin: 'authored',
    permission: 'public-domain',
  },
  start: 0,
  end: 8,
  proposal: ['G', 'Cmaj7'],
  jobId: null,
  draftVisible: false,
  activeQuestion: true,
  completed: false,
  assisted: false,
  replayCount: 0,
  revision: randomUUID(),
});
export function earRequest(): TeacherRequest {
  return {
    schemaVersion: EAR_TEACHER_VERSION,
    requestId: randomUUID(),
    lessonId: randomUUID(),
    turnId: randomUUID(),
    contextVersion: 'ear-context',
    request: 'Help me test my proposal.',
    context: {
      objective: 'listening',
      ear: ear(),
      music: {
        tuning: [64, 59, 55, 50, 45, 40],
        capo: 0,
        key: null,
        selectedSpan: 0,
        spans: [
          { symbol: 'G7', confirmed: true, startTick: 0, endTick: 3840, melody: [] },
          { symbol: 'Cmaj7', confirmed: true, startTick: 3840, endTick: 7680, melody: [] },
        ],
      },
      constraints: { ...DEFAULT_ARRANGEMENT_CONSTRAINTS },
      bass: [],
      evidence: [],
      history: [],
      exposures: [],
      activeQuestion: null,
    },
  };
}
describe('ear evidence boundaries', () => {
  it('rejects an unrelated authored asset or excerpt as an answer key', () => {
    const s = state();
    s.asset.id = 'c'.repeat(64);
    expect(gradeEarProposal(s)).toBeNull();
    s.asset.id = EAR_REFERENCE.assetId;
    s.start = 1;
    expect(gradeEarProposal(s)).toBeNull();
  });
  it('reconstructs immutable review decisions without mutating model output', () => {
    const notes = [
      {
        id: 'n1',
        midi: 66,
        start: 0,
        end: 1,
        family: 'muscriptor',
        instrument: 'guitar',
        authority: 'model-hypothesis' as const,
        confidence: null,
      },
    ];
    const result = reviewedNotes(notes, [
      {
        id: 'r1',
        createdAt: 1,
        authority: 'learner-confirmed',
        decisions: [{ noteId: 'n1', decision: 'replace', midi: 65 }],
      },
    ]);
    expect(result[0]).toMatchObject({ midi: 65, authority: 'learner-confirmed' });
    expect(notes[0].midi).toBe(66);
  });
  it('rejects metadata disguised as a cloud chord proposal and invalid timing', () => {
    const c = ear();
    expect(earContextSchema.safeParse({ ...c, proposal: ['private filename', 'C'] }).success).toBe(
      false,
    );
    expect(
      earContextSchema.safeParse({ ...c, hypotheses: [{ ...c.hypotheses[0], start: 4, end: 2 }] })
        .success,
    ).toBe(false);
  });
  it('grades quality separately from root only on the authored reference', () => {
    const s = state();
    expect(gradeEarProposal(s)?.[0]).toMatchObject({ root: true, quality: false });
    s.asset.origin = 'upload';
    expect(gradeEarProposal(s)).toBeNull();
  });
  it('does not use model agreement or learner confirmation as a grading key', () => {
    const c = ear();
    expect(earActionAllowed(c, { type: 'ear', operation: 'question' })).toBe(false);
    c.referenceAvailable = true;
    expect(earActionAllowed(c, { type: 'ear', operation: 'question' })).toBe(false);
    expect(earFacts(c).some((f) => f.text.includes('does not establish a grading key'))).toBe(true);
  });
  it('keeps help hidden until assistance, and accepts replay', () => {
    const c = ear();
    c.activeQuestion = true;
    expect(earActionAllowed(c, { type: 'ear', operation: 'replay' })).toBe(true);
    expect(earActionAllowed(c, { type: 'ear', operation: 'compare' })).toBe(false);
    expect(earMasked(state())).toBe(true);
    expect(earMasked({ ...state(), assisted: true })).toBe(false);
  });
  it('rejects raw metadata, invalid excerpts, and invented references', () => {
    expect(earContextSchema.safeParse({ ...ear(), filename: 'private.wav' }).success).toBe(false);
    expect(
      audioJobRequestSchema.safeParse({
        assetId: 'a'.repeat(64),
        start: 2,
        end: 1,
        stages: ['timing'],
        contextRevision: 'x',
      }).success,
    ).toBe(false);
    const req = earRequest(),
      turn = localTeacher(req);
    expect(validateTeacherTurn(turn, req)).not.toBeNull();
    expect(validateTeacherTurn({ ...turn, factRefs: ['ear:invented'] }, req)).toBeNull();
    expect(validateTeacherTurn({ ...turn, contextVersion: 'stale' }, req)).toBeNull();
  });
  it('tools prepare jobs without pretending inference has completed', () => {
    const result = createTeacherToolRuntime(earRequest()).execute({
      name: 'ear_activity',
      args: { action: { type: 'ear', operation: 'analyze' } },
    });
    expect(result.status).toBe('ok');
    expect(result.data).toEqual({ status: 'prepared', executed: false });
  });
  it('derived accompaniment preserves duration and playable coordinates', () => {
    const score = earScore({
      id: randomUUID(),
      symbols: ['G7', 'Cmaj7'],
      secondsPerChord: 4,
      seed: state(),
    });
    expect(score.tempo).toBe(60);
    expect(score.masterBars).toHaveLength(2);
    for (const track of score.tracks)
      for (const staff of track.staves)
        for (const bar of staff.bars)
          for (const voice of bar.voices)
            for (const beat of voice.beats) {
              const strings = beat.notes.map((n) => n.string);
              expect(new Set(strings).size).toBe(strings.length);
              for (const n of beat.notes) {
                expect(n.fret).toBeGreaterThanOrEqual(0);
                expect(n.fret).toBeLessThanOrEqual(24);
              }
            }
  });
});

it('bounds teacher corrections to visible referenced hypotheses and preserves assessment masking', () => {
  const c = ear();
  c.analysis = 'completed';
  const noteId = c.hypotheses[0]!.id;
  const correction = { type: 'ear' as const, operation: 'correct' as const, noteId, midi: 65 };
  expect(earActionSchema.safeParse(correction).success).toBe(true);
  expect(earActionAllowed(c, correction)).toBe(true);
  expect(earActionAllowed(c, { ...correction, noteId: 'h99' })).toBe(false);
  expect(earActionSchema.safeParse({ ...correction, midi: 128 }).success).toBe(false);
  expect(earActionSchema.safeParse({ type: 'ear', operation: 'correct' }).success).toBe(false);
  c.activeQuestion = true;
  c.assisted = false;
  expect(earActionAllowed(c, correction)).toBe(false);
});
it('treats a learner note audition as a proposal rather than recording truth', () => {
  const c = ear();
  c.noteProposal = 65;
  expect(earActionAllowed(c, { type: 'ear', operation: 'compare-note' })).toBe(true);
  expect(earFacts(c).find((f) => f.id === 'ear:note-proposal')?.text).toContain(
    'not a reference fact',
  );
  c.noteProposal = null;
  expect(earActionAllowed(c, { type: 'ear', operation: 'compare-note' })).toBe(false);
});

it('distinguishes legacy v3 envelopes and negotiates combined v5 context explicitly', () => {
  const request = earRequest();
  expect(teacherRequestSchema.safeParse(request).success).toBe(true);
  request.context.practice = { capability: 'teaching-practice-v1', goal: null, strategy: null, reflection: null, active: null, evidence: [], reserved: [] };
  expect(teacherRequestSchema.safeParse(request).success).toBe(false);
  request.schemaVersion = 'teacher-v5';
  request.capabilities = ['ear-lab-v1', 'teaching-practice-v1'];
  expect(teacherRequestSchema.safeParse(request).success).toBe(true);
  request.capabilities = ['ear-lab-v1'];
  expect(teacherRequestSchema.safeParse(request).success).toBe(false);
});
