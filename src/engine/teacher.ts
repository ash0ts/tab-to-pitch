import { instrumentExposureId, positionExposureKey } from './exposure.js';
import { asksAboutConnection, explainHomework } from '../homework/explain.js';
import { hasProseCoordinates } from './teacher-prose.js';
import { cagedPlacements } from './caged.js';
import { makeHomeworkTask, solution } from './homework.js';
import { musicianshipTask } from './musicianship.js';
import { earFacts, earActionAllowed } from '../ear/teacher.js';
import { curatedHarmony } from '../songs/catalog.js';
import { scaleTones } from './harmony.js';
import { z } from 'zod';
import { teacherToolArgumentSchemas as toolArgs } from '../shared/teacher-tools.js';
import {
  arrangementIntentSchema,
  executeArrangementIntent,
  type ArrangementRequest,
} from '../shared/arrangements.js';
import {
  CURRICULUM_VERSION,
  TEACHER_PROMPT_VERSION,
  TEACHER_VERSION,
  teacherActionSchema,
  teacherRequestSchema,
  teacherTaskRecipeSchema,
  teacherTurnSchema,
  type TeacherAction,
  type TeacherFact,
  type TeacherRequest,
  type TeacherTaskRecipe,
  type TeacherToolCall,
  type TeacherToolResult,
  type TeacherTurn,
} from '../shared/teacher.js';
import { findNotePositions, formatPitch } from './exploration.js';
import {
  defineChord,
  generateVoicings,
  parseChordSymbol,
  type ChordDefinition,
  type ProgressionVariation,
} from './harmony.js';
import { DEGREE_LABELS } from './harmony-exercises.js';
import { pitchClass, midiToSpn } from './theory.js';
import type { ExerciseDefinition, FretPosition } from './types.js';
import { TEACHING_REFERENCES, LESSON_DEFINITIONS } from './teacher-references.js';
import { rankVoicingsWithModel, validateVoicingRankerModel } from './voicing-ranker.js';
import rankerArtifact from '../research-data/voicing-ranker-v1.json' with { type: 'json' };

export const teacherToolDescriptions = {
  inspect_live_input:
    'args {}. Inspect local input availability and bounded experimental performance evidence. Detection can support pitches, never a string, fret, grip, hand technique, mastery, or precise timing. Unknown is not incorrect. No raw audio reaches you.',
  live_activity:
    'args {action:{type:live,taskId}}. Select an eligible task returned by inspect_live_input. The learner must explicitly start capture and the attempt. No invented targets or answer keys. Do not start another task during a response.',
  inspect_playing_homework:
    'args {}. Inspect the selected playing objective and distinct self-report and performance-reference evidence. No audio, fingering or technique is verified by a self-report.',
  playing_homework_activity:
    'args {action:{type:playing-homework,operation:select|isolate|retry,stepId}}. Choose an eligible step, isolate its first chord change, or prepare a retry. Never activate a device or a paid follow-up automatically.',
  homework_map:
    'args {}. Inspect the selected CAGED map, parent versus sounding chord, root anchors and playable fragments. Requires homework capability and no unassisted question. Conventional shapes require standard string intervals. General note and chord exercises still support other tunings.',
  homework_activity:
    'args {action:{type:homework,operation:task,kind:locate|name|roots|complete|voicing|neighbor|connection|target,family:C|A|G|E|D}|{type:homework,operation:compare,family:C|A|G|E|D}}. Prepare an eligible deterministic homework task or a family comparison. No answer key is supplied by the model. Shape families are not chord names; extensions are derived chord interpretations, not canonical parent shapes. Playing remains self-reported.',

  practice_activity:
    'args {action:{type:practice,operation:strategy,approach,rationale}|{type:practice,operation:activity,activity:rhythm|phrase|expression,variant:0..3,assessment:practice|reserved}|{type:practice,operation:reflection}}. Requires practice capability. Propose an approach for learner acceptance, open an original two-bar G7 to Cmaj7 study, or invite optional self-reflection. Tasks grade symbolic constraints, not playing or artistic quality. Reserved IDs must come from read_learner. No mandatory sequence.',
  inspect_audio:
    'args {}. Inspect timed audio hypotheses and their authority. A model suggestion, a learner correction, and an authored reference are different. No audio or filenames are supplied.',
  ear_activity:
    'args {action:{type:ear,operation:replay|analyze|draft|compare|compare-note|correct|question|workspace}}. Prepare a local action. When a local worker binding is available, analyze queues an asynchronous job and returns its receipt; otherwise it prepares a learner action. A receipt is NOT a completed result. Draft/compare mark help. compare-note auditions the learner’s entered note. correct requires noteId from inspect_audio and midi (0–127, or null to reject); it prepares an explicit learner-applied correction, never a reference answer. Only the original authored source supports a graded listening question. Workspace opens separate derived accompaniment.',

  inspect_passage:
    'args {}. Verified catalog passage, audio source, learning support, and separate root/quality/order evidence. Familiarity and playback are not learning or playing assessments. No media or song metadata is supplied.',
  listening_activity:
    'args {operation:replay|tonic|question|workspace|bass|transfer,difficulty:guided|recall|transfer}. Prepare a playback, tonic reference, listening question, fretboard handoff, synthesized bass comparison, or related example in a new key. The engine freezes and grades questions locally. Answer keys never come from the model.',

  inspect_music:
    'args {}. Confirmed harmony, spelling, chord roles, tuning/capo and explicit bass facts. Unconfirmed harmony cannot grade a question.',
  read_learner:
    'args {}. Bounded recorded answers, assistance, goals/history and exposure. Screen answers are not observations of playing; one error is not a diagnosis.',
  teaching_reference:
    'args {id?:string}. Retrieve sourced teaching guidance; omit id to list references/objectives. No mandatory lesson sequence.',
  explore_voicings:
    'args {intent:ArrangementIntent}. Intent has action propose/clarify/reject, reason requested/ambiguous/unsupported/unconfirmed-harmony/no-melody/incompatible, operation move/color/substitute, full constraints, targetQuality:null or supported quality (m9, maj9, 9, etc), substituteSymbol:null or chord. Returns candidate IDs and preview actions. rootless needs an explicit compatible bass fact.',
  demonstrate:
    'args {action:TeacherAction}. Allowed action: {type:highlight,spanIndex,degree}; {type:audition,spanIndex,includeBass,omitRoot?:boolean}; or a validated preview/question action from another tool. omitRoot removes root notes from the generated guitar shape; includeBass adds the explicit ensemble bass. Actions prepare reversible demonstrations; they never save or replace a source.',
  create_question:
    'args {recipe:{kind:note-name|note-location|chord-tone|next-target|changed-tone|voice-connection,spanIndex,degree,targetDegree?,semitones?,targetSymbol?,region?:{minFret,maxFret},assessment:practice|heldout}}. voice-connection needs targetDegree and signed semitones; changed-tone needs targetSymbol. A heldout question needs unexposed positions or roles; region can explicitly reserve another neck area. Its final reply must contain only that question action: the UI withholds prose before the answer. Returns eligible question action and prompt without grading key. Frozen stimuli are derived, not imported source notes.',
  find_review:
    'args {}. Recent recorded unassisted successes at least one day old, with elapsed days. These are review candidates, not mastery claims.',
  research_ranker:
    'args {spanIndex,previous:[{string,fret}],candidateId}. Optional recorded-choice ranker for standard tuning, no capo, 3–6 voices and 3–4 distinct pitch classes. candidateId selects a generated voicing whose pitch-class multiset defines alternatives. No comfort or learning prediction.',
} as const;

function hash(value: unknown): string {
  let h = 14695981039346656037n;
  for (const c of JSON.stringify(value))
    h = BigInt.asUintN(64, (h ^ BigInt(c.codePointAt(0)!)) * 1099511628211n);
  return h.toString(36);
}
function arrangement(request: TeacherRequest): ArrangementRequest {
  return {
    requestId: request.requestId,
    contextVersion: request.contextVersion,
    request: request.request.slice(0, 600),
    context: request.context.music,
    constraints: request.context.constraints,
  };
}
function chordAt(request: TeacherRequest, index: number): ChordDefinition | null {
  const span = request.context.music.spans[index];
  return span?.confirmed && span.symbol ? parseChordSymbol(span.symbol) : null;
}
function midiAt(request: TeacherRequest, p: FretPosition): number {
  return request.context.music.tuning[p.string - 1]! + request.context.music.capo + p.fret;
}
function positionsFor(request: TeacherRequest, pc: number): FretPosition[] {
  const c = request.context.constraints;
  return findNotePositions(60 + pc, request.context.music.tuning, request.context.music.capo, {
    match: 'pitch-class',
    minFret: c.minFret,
    maxFret: c.maxFret,
  }).filter((p) => c.strings.includes(p.string) && (c.allowOpenStrings || p.fret !== 0));
}
const instrumentKey = (request: TeacherRequest) =>
  instrumentExposureId(request.context.music.tuning, request.context.music.capo);
const positionExposure = (request: TeacherRequest, p: FretPosition) =>
  positionExposureKey(request.context.music.tuning, request.context.music.capo, p);
/** Client-side score observations share the same coordinate identity as generated questions. */
export function teacherPositionExposureKeys(
  request: TeacherRequest,
  positions: readonly FretPosition[],
): string[] {
  return [
    ...new Set(
      positions
        .filter(
          (p) =>
            Number.isInteger(p.string) &&
            p.string >= 1 &&
            p.string <= 6 &&
            Number.isInteger(p.fret) &&
            p.fret >= 0 &&
            p.fret <= 24,
        )
        .map((p) => positionExposure(request, p)),
    ),
  ];
}
const roleExposure = (chord: ChordDefinition, degree: string) =>
  `role:${chord.rootPitchClass}:${chord.quality}:${degree}`;
function musicExposureKeys(request: TeacherRequest): string[] {
  return [
    ...new Set(
      request.context.music.spans.flatMap((_, index) => {
        const chord = chordAt(request, index);
        return (
          chord?.tones.flatMap((t) => [
            roleExposure(chord, t.degree),
            ...positionsFor(request, t.pitchClass).map((p) => positionExposure(request, p)),
          ]) ?? []
        );
      }),
    ),
  ];
}
/** Project all persisted exposure, not merely the most recent events, into a bounded request. */
export function relevantTeacherExposureKeys(
  request: TeacherRequest,
  all: readonly string[],
): string[] {
  const roles = request.context.music.spans.flatMap((_, i) => {
    const c = chordAt(request, i);
    return c ? [`role:${c.rootPitchClass}:`, `color:${c.rootPitchClass}:`] : [];
  });
  return [...new Set(all)].filter(
    (key) =>
      key.startsWith(`position:${instrumentKey(request)}:`) ||
      roles.some((prefix) => key.startsWith(prefix)) ||
      key === 'legacy:unknown',
  );
}
const contextKey = (request: TeacherRequest) =>
  hash({
    music: request.context.music,
    constraints: request.context.constraints,
    bass: request.context.bass,
  });
function listeningFacts(request: TeacherRequest): TeacherFact[] {
  const l = request.context.listening;
  if (!l) return [];
  const passage = curatedHarmony.getPassage(l.passageId);
  if (!passage) return [];
  return [
    {
      id: 'listening-context',
      kind: 'music',
      text: `Verified ${passage.representation} in ${passage.tonic} major. Selected audio: ${l.source}. Difficulty: ${l.difficulty}. Listening answers and playing are separate.`,
    },
    ...l.evidence.map((e) => ({
      id: e.id,
      kind: 'observation' as const,
      text: `Listening response: ${e.outcome}; assisted ${e.assisted}; ${e.source}; familiarity reported ${e.familiar}; roots ${JSON.stringify(e.root)}; qualities ${JSON.stringify(e.quality)}; sequence ${e.sequence}. This is not an observation of playing or a diagnosis.`,
    })),
  ];
}
function musicalFacts(request: TeacherRequest): TeacherFact[] {
  const facts: TeacherFact[] = [
    ...listeningFacts(request),
    ...(request.context.playingHomework?.stimulus
      ? [
          {
            id: 'playing-stimulus',
            kind: 'music' as const,
            text: `Authored derived homework ${request.context.playingHomework.stimulus.stimulusId}: ${request.context.playingHomework.stimulus.instruction} Region ${request.context.playingHomework.stimulus.region.minFret}–${request.context.playingHomework.stimulus.region.maxFret}. These are task targets, not detected playing or imported source-note identities.`,
          },
        ]
      : []),
    ...(request.context.playingHomework
      ? [
          {
            id: 'playing-boundary',
            kind: 'boundary' as const,
            text: 'Homework completion and self-reported playing are not verified success. Coordinates, chord roles and detected audio remain separate. An uncertain detector result is not an incorrect answer.',
          },
          ...request.context.playingHomework.evidence.map((e, i) => ({
            id: `playing:${i}`,
            kind: 'observation' as const,
            text: JSON.stringify(e),
          })),
        ]
      : []),
    ...(request.context.live
      ? [
          {
            id: 'live-boundary',
            kind: 'boundary' as const,
            text: 'Live observations are experimental local detector hypotheses. No string, fret, CAGED grip, hand technique, timing, or mastery was verified. Unknown is not incorrect.',
          },
          ...request.context.live.evidence.map((e) => ({
            id: `live:${e.id}`,
            kind: 'observation' as const,
            text: JSON.stringify(e),
          })),
        ]
      : []),
    {
      id: 'instrument',
      kind: 'music',
      text: `Physical strings 1–6 have open MIDI pitches ${request.context.music.tuning.join(', ')}; capo ${request.context.music.capo}. Frets are relative to the capo.`,
    },
    {
      id: 'evidence-boundary',
      kind: 'boundary',
      text: 'Screen answers measure recall; playback and self-reported playing do not establish performance or mastery.',
    },
    {
      id: 'ranker-limit',
      kind: 'boundary',
      text: 'This model ranks agreement with recorded GuitarSet choices, not comfort, learning, or musical superiority.',
    },
  ];
  request.context.music.spans.forEach((_, i) => {
    const chord = chordAt(request, i);
    facts.push({
      id: `harmony:${i}`,
      kind: 'music',
      text: chord
        ? `Confirmed harmony ${i}: ${chord.symbol}; ${chord.tones.map((t) => `${t.noteName} is degree ${t.degree}`).join(', ')}.`
        : `Harmony ${i} is unconfirmed; no supported grading key.`,
    });
    for (const t of chord?.tones ?? [])
      facts.push({
        id: `tone:${i}:${t.degree}`,
        kind: 'music',
        text: `In ${chord!.symbol}, ${t.noteName} is ${DEGREE_LABELS[t.degree]} (degree ${t.degree}).`,
      });
    const next = chordAt(request, i + 1);
    const seventh = chord?.tones.find((t) => t.degree === 'b7');
    const third = next?.tones.find((t) => t.degree === '3');
    if (seventh && third && (third.pitchClass - seventh.pitchClass + 12) % 12 === 11)
      facts.push({
        id: `connection:${i}`,
        kind: 'music',
        text: `${seventh.noteName}, the minor seventh of ${chord!.symbol}, can descend one semitone to ${third.noteName}, the major third of ${next!.symbol}. This is a possible directed voice-leading example, not an observation of the learner's performance.`,
      });
  });
  const workspace = request.context.workspace;
  if (workspace)
    facts.push({
      id: 'workspace',
      kind: 'music',
      text: `The selected workspace is a ${workspace.view}. Original symbols: ${workspace.sourceSymbols.map((s) => s ?? 'unconfirmed').join(' → ')}. Current confirmed symbols: ${request.context.music.spans.map((s) => (s.confirmed ? (s.symbol ?? 'unconfirmed') : 'unconfirmed')).join(' → ')}. A proposal is not proof that its audio has been heard or its variation saved.`,
    });
  for (const b of request.context.bass) {
    if (!request.context.music.spans[b.spanIndex]) continue;
    facts.push({
      id: `bass:${b.spanIndex}`,
      kind: 'music',
      text: `Explicit ${b.source} ensemble bass for span ${b.spanIndex}: MIDI ${b.midi}. This is distinct from the lowest guitar voice.`,
    });
  }
  for (const n of request.context.selectedNotes ?? [])
    facts.push({
      id: `selected:${n.id}`,
      kind: 'music',
      text: `Selected ordinary note ${n.id}: ${n.spelling ?? midiToSpn(n.midi)} (MIDI ${n.midi})${n.position ? `, string ${n.position.string}, fret ${n.position.fret}` : ''}. Its identity is separate from its role in the selected chord.`,
    });
  for (const e of request.context.evidence)
    facts.push({
      id: e.id,
      kind: 'observation',
      text: `Recorded ${e.kind} response ${JSON.stringify(e.response)}: ${e.outcome}; ${e.assisted ? 'assisted' : 'unassisted'}; ${e.mode}; ${e.elapsedDays} days ago. No playing diagnosis follows.`,
    });
  for (const [i, e] of (request.context.practice?.evidence ?? []).entries())
    facts.push({
      id: `practice-evidence:${i}`,
      kind: 'observation',
      text: `Recorded ${e.format}/${e.responseFormat ?? 'unknown format'} (${e.skill}): ${e.outcome}; ${e.assisted ? 'assisted' : 'unassisted'}; ${e.firstResponse ? 'first response' : 'revision'}; exposure ${e.exposure}; delay ${e.delayDays ?? 'unknown'} days. Engine feedback: ${e.feedback ?? 'not recorded'}. This does not establish another skill or performance.`,
    });
  const studyId = request.context.practice?.studyId;
  if (studyId) {
    const [, kind, variant] = studyId.split(':');
    const study = musicianshipTask(kind as 'rhythm' | 'phrase' | 'expression', Number(variant));
    facts.push({
      id: 'practice-study',
      kind: 'music',
      text: `The current activity is the original authored ${study.title} (${study.id}), over G7 then Cmaj7. It is a separate synthesized example, not an annotation of the imported score. Supplied instruction: ${study.prompt}`,
    });
  }
  if (request.context.practice)
    facts.push({
      id: 'practice-boundary',
      kind: 'boundary',
      text: 'Original authored studies check symbolic answers and construction constraints. Reflection and confidence are self-report; artistic preferences and playing are not graded.',
    });
  return facts;
}

/** Exposure uses musical context, not a chat/request ID; re-asking cannot create a new holdout. */
export function exposureKeysForTeacherTurn(request: TeacherRequest, turn: TeacherTurn): string[] {
  if (!turn.message.trim() && !turn.actions.length) return [];
  // The UI withholds prose and diagrams for a reserved assessment until its first answer.
  if (
    turn.actions.length === 1 &&
    turn.actions[0]?.type === 'question' &&
    turn.actions[0].recipe.assessment === 'heldout'
  )
    return [];
  // Conservatively include every displayed region position and chord role, even if the actor omits references.
  const keys = musicExposureKeys(request);
  if (request.context.homework) {
    const { region } = request.context.homework;
    for (let fret = region.minFret; fret <= region.maxFret; fret++)
      for (let string = 1; string <= request.context.music.tuning.length; string++)
        keys.push(
          positionExposureKey(request.context.music.tuning, request.context.music.capo, {
            string,
            fret,
          }),
        );
  }
  for (const a of turn.actions) {
    if (a.type === 'question' && a.recipe.kind === 'changed-tone')
      keys.push(
        ...(createTeacherExercise(request, { ...a.recipe, assessment: 'practice' })?.stimulus
          ?.exposureKeys ?? []),
      );
  }
  return [...new Set(keys)];
}

export function createTeacherExercise(
  request: TeacherRequest,
  raw: unknown,
): ExerciseDefinition | null {
  const parsed = teacherTaskRecipeSchema.safeParse(raw);
  if (!parsed.success) return null;
  const r = parsed.data;
  if (r.region)
    request = {
      ...request,
      context: { ...request.context, constraints: { ...request.context.constraints, ...r.region } },
    };
  const chord = chordAt(request, r.spanIndex);
  const tone = chord?.tones.find((t) => t.degree === r.degree);
  if (!chord || !tone) return null;
  const positions = positionsFor(request, tone.pitchClass);
  if (!positions.length) return null;
  let keys = positions.map((p) => positionExposure(request, p));
  const stimulusId = `derived:${hash({ version: TEACHER_VERSION, music: request.context.music, constraints: request.context.constraints, recipe: r })}`;
  const result: ExerciseDefinition = {
    id: `${stimulusId}:question`,
    scoreId: `derived:${contextKey(request)}`,
    trackId: 'derived-accompaniment',
    kind: r.kind,
    skillId: r.kind,
    prompt: '',
    noteIds: [],
    choices: [],
    answer: { type: 'text', accepted: [] },
    mask: { noteIds: [], hide: 'role' },
    explanation: '',
    partition: r.assessment,
    transferKeys: [],
    stimulus: {
      id: stimulusId,
      version: TEACHER_VERSION,
      pitches: [chord.tones.map((t) => 60 + t.semitones + chord.rootPitchClass)],
      exposureKeys: [],
    },
  };
  const pos = positions[0]!,
    midi = midiAt(request, pos);
  if (r.kind === 'note-name') {
    result.prompt = `Name the note on string ${pos.string}, fret ${pos.fret}. Octave is optional.`;
    result.answer = { type: 'pitch', midi, octaveRequired: false };
    result.mask.hide = 'pitch';
    result.explanation = `That position sounds ${tone.noteName} with the selected tuning and capo.`;
    keys = [positionExposure(request, pos)];
  } else if (r.kind === 'note-location') {
    result.prompt = `Find ${tone.noteName} on an allowed string between frets ${request.context.constraints.minFret} and ${request.context.constraints.maxFret}. Enter string:fret.`;
    result.answer = { type: 'position', positions };
    result.mask.hide = 'fret';
    result.explanation = `Every allowed position sounding ${tone.noteName}, in any octave, is accepted.`;
  } else if (r.kind === 'chord-tone') {
    result.prompt = `What role does ${tone.noteName} have in ${chord.symbol}?`;
    result.answer = { type: 'text', accepted: [tone.degree, DEGREE_LABELS[tone.degree]] };
    result.explanation = `${tone.noteName} is the ${DEGREE_LABELS[tone.degree]} of ${chord.symbol}.`;
    keys = [roleExposure(chord, tone.degree)];
  } else if (r.kind === 'next-target' || r.kind === 'voice-connection') {
    const next = chordAt(request, r.spanIndex + 1),
      target = next?.tones.find((t) => t.degree === (r.targetDegree ?? '3'));
    if (!next || !target) return null;
    const destinations = positionsFor(request, target.pitchClass);
    if (!destinations.length) return null;
    if (r.kind === 'next-target') {
      result.prompt = `Find the ${DEGREE_LABELS[target.degree]} of the next chord, ${next.symbol}. Enter string:fret.`;
      result.answer = { type: 'position', positions: destinations };
      keys = destinations.map((p) => positionExposure(request, p));
      result.explanation = `${target.noteName} is the ${DEGREE_LABELS[target.degree]} of ${next.symbol}. This question checks a destination, not a voice-leading pair.`;
    } else {
      if (r.semitones === undefined || !r.targetDegree) return null;
      const pairs = positions.flatMap((from) =>
        destinations
          .filter((to) => midiAt(request, to) - midiAt(request, from) === r.semitones)
          .map((to) => ({ from, to })),
      );
      if (!pairs.length) return null;
      result.prompt = `Connect the ${DEGREE_LABELS[tone.degree]} of ${chord.symbol} to the ${DEGREE_LABELS[target.degree]} of ${next.symbol}, ${r.semitones < 0 ? 'down' : 'up'} ${Math.abs(r.semitones)} semitone(s). Enter string:fret → string:fret.`;
      result.answer = { type: 'position-pair', pairs };
      result.explanation = `${tone.noteName} → ${target.noteName}, ${r.semitones} signed semitone(s). Both positions and the exact sounding movement are checked.`;
      result.stimulus!.pitches = [
        [midiAt(request, pairs[0]!.from)],
        [midiAt(request, pairs[0]!.to)],
      ];
      keys = [
        ...new Set(
          pairs.flatMap((pair) => [
            positionExposure(request, pair.from),
            positionExposure(request, pair.to),
          ]),
        ),
      ];
    }
    result.mask.hide = 'fret';
  } else if (r.kind === 'changed-tone') {
    const target = r.targetSymbol ? parseChordSymbol(r.targetSymbol) : null;
    if (!target || target.rootPitchClass !== chord.rootPitchClass) return null;
    const added = target.tones.filter(
      (t) => !chord.tones.some((s) => s.pitchClass === t.pitchClass),
    );
    if (
      added.length !== 1 ||
      chord.tones.some((t) => !target.tones.some((s) => s.pitchClass === t.pitchClass))
    )
      return null;
    result.prompt = `Compare ${chord.symbol} with ${target.symbol}. Which note was added?`;
    result.answer = { type: 'pitch', midi: 60 + added[0]!.pitchClass, octaveRequired: false };
    result.explanation = `${added[0]!.noteName}, the ${DEGREE_LABELS[added[0]!.degree]}, was added. The other chord tones remain.`;
    result.listeningExample = [
      chord.tones.map((t) => 60 + chord.rootPitchClass + t.semitones),
      target.tones.map((t) => 60 + target.rootPitchClass + t.semitones),
    ];
    result.stimulus!.pitches = result.listeningExample;
    result.mask.hide = 'pitch';
    keys = [
      `color:${chord.rootPitchClass}:${chord.quality}:${target.quality}:${added[0]!.pitchClass}`,
    ];
  }
  if (
    r.assessment === 'heldout' &&
    (request.context.exposures.includes('legacy:unknown') ||
      keys.some((key) => request.context.exposures.includes(key)))
  )
    return null;
  if (['note-location', 'next-target', 'voice-connection'].includes(r.kind))
    result.prompt += ` Use strings ${request.context.constraints.strings.join(', ')} at frets ${request.context.constraints.minFret}–${request.context.constraints.maxFret}.`;
  result.transferKeys = keys;
  result.stimulus!.exposureKeys = keys;
  return result;
}

export interface ResolvedTeacherAction {
  exercise?: ExerciseDefinition;
  variation?: ProgressionVariation;
  positions?: FretPosition[];
  pitches?: number[];
  facts: TeacherFact[];
  exposureKeys: string[];
}
function rootlessAllowed(
  request: TeacherRequest,
  intent: z.infer<typeof arrangementIntentSchema>,
): boolean {
  return (
    !intent.constraints.rootless ||
    request.context.music.spans.every((_, i) => {
      const c =
          intent.operation === 'substitute' &&
          i === request.context.music.selectedSpan &&
          intent.substituteSymbol
            ? parseChordSymbol(intent.substituteSymbol)
            : chordAt(request, i),
        bass = request.context.bass.find((b) => b.spanIndex === i);
      return c && bass && pitchClass(bass.midi) === c.rootPitchClass;
    })
  );
}
export function resolveTeacherAction(
  request: TeacherRequest,
  raw: unknown,
): ResolvedTeacherAction | null {
  const p = teacherActionSchema.safeParse(raw);
  if (!p.success) return null;
  const a = p.data,
    exposureKeys = musicExposureKeys(request);
  const playing = request.context.playingHomework;
  if (playing?.active && !playing.assisted) return null;
  // Homework studies have a separate source; do not apply a derived proposal to the imported score.
  if (playing?.stimulus && a.type === 'preview') return null;
  if (a.type === 'playing-homework') {
    if (
      !playing ||
      playing.active ||
      !playing.eligible.some((t) => t.id === a.stepId) ||
      (a.operation !== 'select' && a.stepId !== playing.stepId)
    )
      return null;
    return {
      facts: musicalFacts(request).filter((f) => f.id === 'playing-boundary'),
      exposureKeys: [],
    };
  }
  const live = request.context.live;
  if (live?.active && !live.assisted) return null;
  if (a.type === 'live') {
    if (!live || live.active || !live.eligible.some((t) => t.id === a.taskId)) return null;
    return {
      facts: musicalFacts(request).filter((f) => f.id === 'live-boundary'),
      exposureKeys: [],
    };
  }
  const homework = request.context.homework;
  if (homework?.active && !homework.assisted) return null;
  if (a.type === 'homework') {
    if (!homework) return null;
    const music = request.context.music;
    const chord = parseChordSymbol(homework.symbol);
    if (!chord) return null;
    if (a.operation === 'task') {
      const task = makeHomeworkTask(
        a.kind,
        homework.symbol,
        a.family,
        homework.region,
        music.tuning,
        music.capo,
      );
      if (!task || !solution(task).length) return null;
    } else if (
      !cagedPlacements(chord.rootName, music.tuning, music.capo).some(
        (p) =>
          p.family === a.family &&
          p.fragments.some((f) =>
            f.positions.every(
              (pos) => pos.fret >= homework.region.minFret && pos.fret <= homework.region.maxFret,
            ),
          ),
      )
    )
      return null;
    return {
      facts: [
        {
          id: 'homework-boundary',
          kind: 'boundary',
          text: 'CAGED family describes the parent major shape, not the sounding chord. Small fragments can have multiple family affiliations. Constructed answers are engine graded; playing and technique have not been assessed.',
        },
      ],
      exposureKeys: [],
    };
  }
  if (a.type === 'practice') {
    const practice = request.context.practice;
    if (!practice || practice.active) return null;
    if (a.operation === 'activity') {
      const task = musicianshipTask(a.activity, a.variant);
      if (a.assessment === 'reserved' && !practice.reserved.includes(task.id)) return null;
      return {
        facts: [
          {
            id: 'practice-boundary',
            kind: 'boundary',
            text: 'Original authored two-bar studies assess symbolic answers or explicit construction constraints. They do not assess playing or artistic quality.',
          },
        ],
        exposureKeys: [],
      };
    }
    return { facts: [], exposureKeys: [] };
  }
  if (request.context.practice?.active && !request.context.practice.active.assisted) return null;
  if (a.type === 'ear')
    return earActionAllowed(request.context.ear, a)
      ? { facts: earFacts(request.context.ear), exposureKeys: [] }
      : null;
  if (a.type === 'listening') {
    const listening = request.context.listening;
    const passage = listening && curatedHarmony.getPassage(listening.passageId);
    if (!passage || (listening?.activeQuestion && !listening.activeQuestion.assisted)) return null;
    const tonic = scaleTones({ tonic: passage.tonic, mode: 'ionian' })[0]!;
    return {
      facts: listeningFacts(request),
      exposureKeys: [],
      ...(a.operation === 'tonic' ? { pitches: [48 + tonic.pitchClass] } : {}),
    };
  }
  if (a.type === 'question') {
    const exercise = createTeacherExercise(request, a.recipe);
    return exercise ? { exercise, facts: [], exposureKeys: [] } : null;
  }
  if (a.type === 'preview') {
    if (!rootlessAllowed(request, a.intent)) return null;
    const run = executeArrangementIntent(arrangement(request), a.intent),
      variation = run.result?.variations.find((v) => v.id === a.candidateId);
    if (!variation) return null;
    return {
      variation,
      facts: run.facts.map((f) => ({
        ...f,
        id: `arrangement:${hash(a.intent)}:${f.id}`,
        kind: 'music',
      })),
      exposureKeys: [
        ...new Set([
          ...exposureKeys,
          ...variation.events.flatMap((e) =>
            e.voicing.notes.flatMap((n) => [
              positionExposure(request, n.position),
              roleExposure(e.voicing.chord, n.degree),
            ]),
          ),
        ]),
      ],
    };
  }
  const chord = chordAt(request, a.spanIndex);
  if (!chord) return null;
  if (a.type === 'highlight') {
    const t = chord.tones.find((t) => t.degree === a.degree);
    if (!t) return null;
    return {
      positions: positionsFor(request, t.pitchClass),
      facts: musicalFacts(request).filter((f) => f.id === `tone:${a.spanIndex}:${t.degree}`),
      exposureKeys,
    };
  }
  const voices = generateVoicings(chord, request.context.music.tuning, request.context.music.capo, {
    ...request.context.constraints,
    maxCandidates: 1,
  });
  const voicing = voices.voicings[0];
  if (!voicing) return null;
  const bass = request.context.bass.find((b) => b.spanIndex === a.spanIndex);
  if (a.includeBass && !bass) return null;
  if (request.context.constraints.rootless && !bass) return null;
  const notes = a.omitRoot ? voicing.notes.filter((n) => n.degree !== '1') : voicing.notes;
  if (!notes.length) return null;
  const pitches = notes.map((n) => n.midi);
  if (a.includeBass) pitches.push(bass!.midi);
  return {
    pitches,
    positions: notes.map((n) => n.position),
    facts: musicalFacts(request).filter(
      (f) => f.id === `harmony:${a.spanIndex}` || (a.includeBass && f.id === `bass:${a.spanIndex}`),
    ),
    exposureKeys,
  };
}

export function createTeacherToolRuntime(request: TeacherRequest) {
  teacherRequestSchema.parse(request);
  const facts = [...musicalFacts(request), ...earFacts(request.context.ear)],
    actions: TeacherAction[] = [];
  const accept = (result: TeacherToolResult): TeacherToolResult => {
    for (const f of result.facts) if (!facts.some((old) => old.id === f.id)) facts.push(f);
    for (const a of result.actions)
      if (!actions.some((old) => JSON.stringify(old) === JSON.stringify(a))) actions.push(a);
    return result;
  };
  return {
    facts,
    actions,
    execute(call: TeacherToolCall): TeacherToolResult {
      try {
        if (call.name === 'inspect_playing_homework') {
          toolArgs.inspect_playing_homework.parse(call.args);
          return accept({
            status: request.context.playingHomework ? 'ok' : 'unavailable',
            facts: facts.filter((f) => f.id.startsWith('playing')),
            actions: [],
            data: request.context.playingHomework ?? null,
          });
        }
        if (call.name === 'playing_homework_activity') {
          const { action } = toolArgs.playing_homework_activity.parse(call.args);
          const resolved = resolveTeacherAction(request, action);
          return resolved
            ? accept({ status: 'ok', facts: resolved.facts, actions: [action] })
            : {
                status: 'unavailable',
                facts: [],
                actions: [],
                reason: 'This step is stale, absent, or a response is active.',
              };
        }
        if (call.name === 'inspect_live_input') {
          toolArgs.inspect_live_input.parse(call.args);
          const live = request.context.live;
          return accept({
            status: live ? 'ok' : 'unavailable',
            facts: facts.filter((f) => f.id.startsWith('live')),
            actions: [],
            data: live ?? null,
          });
        }
        if (call.name === 'live_activity') {
          const { action } = toolArgs.live_activity.parse(call.args);
          const resolved = resolveTeacherAction(request, action);
          return resolved
            ? accept({ status: 'ok', facts: resolved.facts, actions: [action] })
            : {
                status: 'unavailable',
                facts: [],
                actions: [],
                reason: 'This live task is unavailable or another response is active.',
              };
        }
        if (call.name === 'homework_map') {
          toolArgs.homework_map.parse(call.args);
          const h = request.context.homework;
          if (!h || (h.active && !h.assisted))
            return {
              status: 'unavailable',
              facts: [],
              actions: [],
              reason: 'Homework context and recorded assistance before a reveal are required.',
            };
          const chord = parseChordSymbol(h.symbol)!;
          const placements = cagedPlacements(
            chord.rootName,
            request.context.music.tuning,
            request.context.music.capo,
          ).filter(
            (p) =>
              p.family === h.family &&
              p.fragments.some((f) =>
                f.positions.every(
                  (pos) => pos.fret >= h.region.minFret && pos.fret <= h.region.maxFret,
                ),
              ),
          );
          return accept({
            status: 'ok',
            facts: [
              {
                id: 'homework-map',
                kind: 'music',
                text: JSON.stringify(
                  placements.map((p) => ({
                    family: p.family,
                    soundingChord: p.chord.symbol,
                    notes: p.notes,
                    roots: p.roots,
                  })),
                ),
              },
              {
                id: 'homework-limits',
                kind: 'boundary',
                text: 'These are major parent maps. Minor and extended chords must be checked by their actual degrees. Note, role, location and self-reported playing evidence are distinct. CAGED availability does not establish comfort or learner fluency.',
              },
            ],
            actions: [],
            data: { placements, evidence: h.evidence },
          });
        }
        if (call.name === 'homework_activity') {
          const { action } = toolArgs.homework_activity.parse(call.args);
          const resolved = resolveTeacherAction(request, action);
          return resolved
            ? accept({ status: 'ok', facts: resolved.facts, actions: [action] })
            : {
                status: 'unavailable',
                facts: [],
                actions: [],
                reason:
                  'No eligible homework action under this context. The learner can change approach or choose a different region.',
              };
        }
        if (call.name === 'inspect_audio') {
          toolArgs.inspect_audio.parse(call.args);
          return {
            status: request.context.ear ? 'ok' : 'unavailable',
            facts: earFacts(request.context.ear),
            actions: [],
            data: request.context.ear ?? null,
          };
        }
        if (call.name === 'ear_activity') {
          const { action } = toolArgs.ear_activity.parse(call.args);
          return earActionAllowed(request.context.ear, action)
            ? accept({
                status: 'ok',
                facts: earFacts(request.context.ear),
                actions: [action],
                data: { status: 'prepared', executed: false },
              })
            : {
                status: 'unavailable',
                facts: [],
                actions: [],
                reason: 'Source, question, or analysis state does not permit this action.',
              };
        }
        if (call.name === 'inspect_music') {
          toolArgs[call.name].parse(call.args);
          return {
            status: 'ok',
            facts: facts.filter((f) => f.kind !== 'observation'),
            actions: [],
            data: { key: request.context.music.key, constraints: request.context.constraints },
          };
        }
        if (call.name === 'practice_activity') {
          const { action } = toolArgs.practice_activity.parse(call.args);
          const resolved = resolveTeacherAction(request, action);
          return resolved
            ? accept({ status: 'ok', facts: resolved.facts, actions: [action] })
            : {
                status: 'unavailable',
                facts: [],
                actions: [],
                reason: 'Practice capability, fresh context and an eligible example are required.',
              };
        }
        if (call.name === 'read_learner') {
          toolArgs[call.name].parse(call.args);
          return {
            status: 'ok',
            facts: facts.filter((f) => f.kind !== 'music'),
            actions: [],
            data: {
              objective: request.context.objective,
              practice: request.context.practice,
              live: request.context.live,
              homework: request.context.homework,
              playingHomework: request.context.playingHomework,
              evidence: request.context.evidence,
              history: request.context.history,
              exposures: request.context.exposures,
              activeQuestion: request.context.activeQuestion,
            },
          };
        }
        if (call.name === 'inspect_passage') {
          toolArgs.inspect_passage.parse(call.args);
          const l = request.context.listening;
          return {
            status: l ? 'ok' : 'unavailable',
            facts: listeningFacts(request),
            actions: [],
            data: l
              ? {
                  difficulty: l.difficulty,
                  source: l.source,
                  evidence: l.evidence,
                  activeQuestion: l.activeQuestion,
                }
              : null,
          };
        }
        if (call.name === 'listening_activity') {
          const action = {
            type: 'listening' as const,
            ...toolArgs.listening_activity.parse(call.args),
          };
          const resolved = resolveTeacherAction(request, action);
          return resolved
            ? accept({ status: 'ok', facts: resolved.facts, actions: [action] })
            : {
                status: 'unavailable',
                facts: [],
                actions: [],
                reason: 'A verified passage and assistance before help are required.',
              };
        }
        if (call.name === 'teaching_reference') {
          const { id } = toolArgs.teaching_reference.parse(call.args);
          const refs = id ? TEACHING_REFERENCES.filter((r) => r.id === id) : TEACHING_REFERENCES;
          return {
            status: refs.length ? 'ok' : 'unavailable',
            facts: [],
            actions: [],
            data: { references: refs, lessons: LESSON_DEFINITIONS },
          };
        }
        if (call.name === 'find_review') {
          toolArgs[call.name].parse(call.args);
          return {
            status: 'ok',
            facts: [],
            actions: [],
            data: request.context.evidence.filter(
              (e) => e.outcome === 'correct' && !e.assisted && e.elapsedDays >= 1,
            ),
          };
        }
        if (call.name === 'create_question' || call.name === 'demonstrate') {
          const action: TeacherAction =
            call.name === 'create_question'
              ? { type: 'question', recipe: toolArgs.create_question.parse(call.args).recipe }
              : toolArgs.demonstrate.parse(call.args).action;
          const resolved = resolveTeacherAction(request, action);
          if (!resolved)
            return {
              status: 'unavailable',
              facts: [],
              actions: [],
              reason:
                'No eligible result under the confirmed harmony, bass, exposure, and position constraints.',
            };
          return accept({
            status: 'ok',
            facts: resolved.facts,
            actions: [action],
            data: resolved.exercise
              ? {
                  id: resolved.exercise.id,
                  prompt: resolved.exercise.prompt,
                  kind: resolved.exercise.kind,
                }
              : { positions: resolved.positions, pitches: resolved.pitches },
          });
        }
        if (call.name === 'explore_voicings') {
          const { intent } = toolArgs.explore_voicings.parse(call.args);
          if (!rootlessAllowed(request, intent))
            return {
              status: 'unavailable',
              facts: [],
              actions: [],
              reason:
                'Rootless accompaniment needs an explicit root bass fact for each chord span.',
            };
          const run = executeArrangementIntent(arrangement(request), intent);
          return accept({
            status: run.result?.variations.length ? 'ok' : 'unavailable',
            facts: run.facts.map((f) => ({
              ...f,
              id: `arrangement:${hash(intent)}:${f.id}`,
              kind: 'music',
            })),
            actions:
              run.result?.variations.map((v) => ({
                type: 'preview' as const,
                intent,
                candidateId: v.id,
              })) ?? [],
            data: {
              status: run.status,
              candidates: run.result?.variations.map((v) => ({
                id: v.id,
                cost: v.cost,
                events: v.events.map((e) => ({
                  id: e.voicing.id,
                  chord: e.voicing.chord.symbol,
                  notes: e.voicing.notes,
                  omittedDegrees: e.voicing.omittedDegrees,
                })),
              })),
            },
          });
        }
        const args = toolArgs.research_ranker.parse(call.args);
        if (new Set(args.previous.map((p) => p.string)).size !== args.previous.length)
          throw new Error('Duplicate string in previous shape.');
        const chord = chordAt(request, args.spanIndex),
          model = validateVoicingRankerModel(rankerArtifact);
        if (!chord || !model)
          return {
            status: 'unavailable',
            facts: [],
            actions: [],
            reason: !model
              ? 'Trained ranking parameters are not bundled. Use deterministic movement ordering.'
              : 'Confirmed harmony required.',
          };
        const candidates = generateVoicings(
          chord,
          request.context.music.tuning,
          request.context.music.capo,
          { ...request.context.constraints, maxCandidates: 64 },
        ).voicings;
        const selected = candidates.find((v) => v.id === args.candidateId);
        if (!selected)
          return {
            status: 'unavailable',
            facts: [],
            actions: [],
            reason: 'Inspect a generated voicing ID first.',
          };
        const pcs = selected.notes.map((n) => pitchClass(n.midi)).sort((a, b) => a - b);
        const eligible = candidates.filter(
          (v) =>
            JSON.stringify(v.notes.map((n) => pitchClass(n.midi)).sort((a, b) => a - b)) ===
            JSON.stringify(pcs),
        );
        const ranked = rankVoicingsWithModel({
          voicings: eligible,
          previous: args.previous.map((position) => ({
            position,
            midi: midiAt(request, position),
          })),
          requestedPitchClassMultiset: pcs,
          tuningMidi: request.context.music.tuning,
          capo: request.context.music.capo,
          model,
        });
        return {
          status: ranked.status === 'ranked' ? 'ok' : 'unavailable',
          facts: [
            {
              id: 'ranker-limit',
              kind: 'boundary',
              text: 'This model ranks agreement with recorded GuitarSet choices, not comfort, learning, or musical superiority.',
            },
          ],
          actions: [],
          data: ranked,
        };
      } catch (error) {
        return {
          status: 'invalid',
          facts: [],
          actions: [],
          reason: error instanceof Error ? error.message.slice(0, 400) : 'Invalid tool arguments.',
        };
      }
    },
  };
}

export function validateTeacherTurn(value: unknown, request: TeacherRequest): TeacherTurn | null {
  const parsed = teacherTurnSchema.safeParse(value);
  if (!parsed.success) return null;
  const t = parsed.data;
  if (
    t.versions.policy !== TEACHER_VERSION ||
    t.versions.prompt !== TEACHER_PROMPT_VERSION ||
    t.versions.curriculum !== CURRICULUM_VERSION
  )
    return null;
  if (t.source === 'forge' && t.review.status !== 'passed') return null;
  if (t.source === 'forge' && hasProseCoordinates(t.message)) return null;
  if (
    t.source === 'local' &&
    (t.versions.model !== 'authored-adaptive-v1' || t.review.status === 'passed')
  )
    return null;
  if (
    t.schemaVersion !== request.schemaVersion ||
    t.lessonId !== request.lessonId ||
    t.turnId !== request.turnId ||
    t.contextVersion !== request.contextVersion
  )
    return null;
  if (
    t.audioJobs?.some(
      (j) =>
        j.contextRevision !== request.localAudio?.contextRevision ||
        j.contextRevision !== request.context.ear?.revision,
    )
  )
    return null;
  if (
    t.actions.length &&
    ((request.context.activeQuestion && !request.context.activeQuestion.assisted) ||
      (request.context.practice?.active && !request.context.practice.active.assisted) ||
      (request.context.homework?.active && !request.context.homework.assisted) ||
      (request.context.live?.active && !request.context.live.assisted) ||
      (request.context.ear?.activeQuestion && !request.context.ear.assisted) ||
      (request.context.listening?.activeQuestion &&
        !request.context.listening.activeQuestion.assisted))
  )
    return null;
  if (
    t.actions.some((a) => a.type === 'question' && a.recipe.assessment === 'heldout') &&
    t.actions.length !== 1
  )
    return null;
  const facts = [...musicalFacts(request), ...earFacts(request.context.ear)];
  for (const a of t.actions) {
    const resolved = resolveTeacherAction(request, a);
    if (!resolved) return null;
    facts.push(...resolved.facts);
  }
  if (
    t.factRefs.some((id) => !facts.some((f) => f.id === id)) ||
    t.referenceIds.some((id) => !TEACHING_REFERENCES.some((r) => r.id === id))
  )
    return null;
  for (const c of t.claims) {
    if (
      c.kind === 'tone-role' &&
      !chordAt(request, c.spanIndex)?.tones.some(
        (t) => t.degree === c.degree && t.noteName === c.noteName,
      )
    )
      return null;
    if (c.kind === 'position-pitch' && midiAt(request, c.position) !== c.midi) return null;
    if (
      c.kind === 'observation' &&
      !request.context.evidence.some(
        (e) => e.id === c.evidenceId && e.outcome === c.outcome && e.assisted === c.assisted,
      )
    )
      return null;
  }
  return t;
}

/** Authored fallback can explain or offer a task, but never applies one automatically. */
export function localTeacher(request: TeacherRequest, reason = 'offline'): TeacherTurn {
  const index = request.context.music.selectedSpan,
    chord = chordAt(request, index);
  const text = request.request.toLowerCase();
  const playingClaim =
    /hear me|heard me|how did i play|my technique|did i use|played well|clean chord/.test(text);
  const conceptual =
    !playingClaim &&
    !/detection|detector|input signal/.test(text) &&
    /why|explain|compare|difference|\brole\b|third|fifth|caged|shape famil|neighbor.*shape/.test(
      text,
    );
  const objective = /rootless|extension|ninth|add.?9/.test(text)
    ? 'extensions'
    : asksAboutConnection(text)
      ? 'connections'
      : request.context.objective;
  let message = chord
    ? `${chord.symbol} contains ${chord.tones.map((t) => `${t.noteName} (${DEGREE_LABELS[t.degree]})`).join(', ')}. A note’s name stays the same when its role changes with the chord. Choose a question or compare a voicing in the workspace.`
    : 'Confirm the harmony in the progression strip before creating a graded question. We can still discuss the musical idea; the current passage has no verified chord interpretation.';
  const actions: TeacherAction[] = [];
  const factRefs = chord ? [`harmony:${index}`] : [];
  const referenceIds = ['gordon-context'];
  let recipe: TeacherTaskRecipe | undefined;
  if (chord && objective === 'foundations') {
    const degree = chord.tones.find((t) => t.degree === 'b3' || t.degree === '3')?.degree ?? '1';
    const recent = request.context.evidence.at(-1);
    const kind = /locat|elsewhere|another position|find/.test(text)
      ? 'note-location'
      : /note name|name the note/.test(text)
        ? 'note-name'
        : recent?.kind === 'chord-tone' && recent.outcome === 'incorrect'
          ? 'note-name'
          : 'chord-tone';
    recipe = { kind, spanIndex: index, degree, assessment: 'practice' };
    if (recent?.outcome === 'incorrect') {
      message += ` Your last recorded ${recent.kind} answer was incorrect. Let’s check the note’s name separately from its chord role; one answer does not tell us why it was missed.`;
      factRefs.push(recent.id);
    }
    actions.push({ type: 'highlight', spanIndex: index, degree });
  }
  if (chord && objective === 'connections') {
    const namedPair = request.context.music.spans.findIndex(
      (span, i) =>
        span.symbol &&
        text.includes(span.symbol.toLowerCase()) &&
        request.context.music.spans[i + 1]?.symbol &&
        text.includes(request.context.music.spans[i + 1]!.symbol!.toLowerCase()),
    );
    const start = namedPair >= 0 ? namedPair : index;
    for (
      let i = start;
      i < (namedPair >= 0 ? start + 1 : request.context.music.spans.length - 1);
      i++
    ) {
      const candidate: TeacherTaskRecipe = {
        kind: 'voice-connection',
        spanIndex: i,
        degree: 'b7',
        targetDegree: '3',
        semitones: -1,
        assessment: 'practice',
      };
      if (createTeacherExercise(request, candidate)) {
        recipe = candidate;
        const from = chordAt(request, i)!,
          to = chordAt(request, i + 1)!;
        const departure = from.tones.find((t) => t.degree === 'b7')!,
          arrival = to.tones.find((t) => t.degree === '3')!;
        message = `In ${from.symbol} → ${to.symbol}, ${departure.noteName} (${DEGREE_LABELS[departure.degree]}) can descend one semitone to ${arrival.noteName} (${DEGREE_LABELS[arrival.degree]}). Find both positions, then hear the connection in the full progression.`;
        factRefs.push(`harmony:${i}`, `harmony:${i + 1}`);
        actions.push(
          { type: 'highlight', spanIndex: i, degree: 'b7' },
          { type: 'highlight', spanIndex: i + 1, degree: '3' },
        );
        break;
      }
    }
    message +=
      ' A destination-note answer checks one position. A connection checks both positions and their exact pitch movement.';
  }
  if (chord && objective === 'extensions') {
    const target = defineChord(
      chord.rootName,
      chord.quality === 'm7' ? 'm9' : chord.quality === 'maj7' ? 'maj9' : '9',
    );
    if (target)
      recipe = {
        kind: 'changed-tone',
        spanIndex: index,
        degree: '1',
        targetSymbol: target.symbol,
        assessment: 'practice',
      };
    message +=
      ' Adding a ninth introduces a new tone; an add9 chord and a ninth chord differ in whether a seventh is included. Interpret a rootless shape only with an explicit bass context.';
  }
  if (request.context.ear) {
    const ear = request.context.ear;
    message =
      'Start with the sound, then test one idea. Replay the fragment or audition your proposed chord. A transcription is a draft: uncertain and missing notes stay uncertain. The score workspace is a separate derived example.';
    if (ear.analysis === 'failed')
      message += ' Local analysis failed; you can still listen and compare your own proposal.';
    actions.splice(0, actions.length, { type: 'ear', operation: 'replay' });
    const operation = /draft|transcri|analy/.test(text)
      ? ear.analysis === 'completed'
        ? 'draft'
        : 'analyze'
      : /question|quiz/.test(text)
        ? 'question'
        : /neck|fret|voic/.test(text)
          ? 'workspace'
          : 'compare';
    if (earActionAllowed(ear, { type: 'ear', operation })) actions.push({ type: 'ear', operation });
    factRefs.splice(0, factRefs.length, 'ear:boundary', 'ear:state');
    recipe = undefined;
  }
  if (recipe && createTeacherExercise(request, recipe)) actions.push({ type: 'question', recipe });
  if (/rootless/.test(text)) {
    const span = request.context.music.spans.findIndex(
      (_, i) =>
        chordAt(request, i)?.symbol === 'Cmaj7' &&
        request.context.bass.some((b) => b.spanIndex === i && pitchClass(b.midi) === 0),
    );
    if (span >= 0) {
      message =
        'E–G–B by itself spells E minor. With an explicit C bass, those notes supply the third, fifth, and major seventh of Cmaj7. Compare the upper shape alone and with that bass; the context changes the harmonic interpretation. These chords are not interchangeable in every progression.';
      actions.length = 0;
      let fullUpperShape = true;
      for (const includeBass of [false, true]) {
        const action: TeacherAction = {
          type: 'audition',
          spanIndex: span,
          includeBass,
          omitRoot: true,
        };
        const resolved = resolveTeacherAction(request, action);
        const pcs = [...new Set(resolved?.pitches?.map(pitchClass))].sort((a, b) => a - b);
        if (JSON.stringify(pcs) === JSON.stringify(includeBass ? [0, 4, 7, 11] : [4, 7, 11]))
          actions.push(action);
        else fullUpperShape = false;
      }
      if (!fullUpperShape) {
        actions.length = 0;
        message +=
          ' The current voice-count and omission controls do not supply that complete upper shape. Use four voices with the fifth retained to audition this example.';
      }
      factRefs.push(`harmony:${span}`, `bass:${span}`);
    } else {
      message +=
        ' For example, E–G–B alone spells E minor; over an established C bass it can supply Cmaj7’s third, fifth, and seventh. That is a hypothetical comparison until this workspace supplies that bass context.';
    }
  }
  if (/mode|dorian|mixolydian|scale position/.test(text)) {
    message =
      'A neck position tells you where to play a collection of notes. A mode also depends on the tonal center: the same white-note collection heard around D has a different tonal organization from that collection heard around C. Moving a fingering alone does not establish a new mode. Set an explicit tonic in the tonal view and compare the collection over its tonic drone.';
    actions.length = 0;
    referenceIds.push('modes');
  }
  if (!request.context.ear && request.context.listening && objective === 'listening') {
    const l = request.context.listening,
      last = [...l.evidence].reverse().find((e) => e.outcome === 'answered') ?? l.evidence.at(-1);
    message =
      'Listen to the passage with its tonic in mind. Try placing the chords, then compare the root movement and chord qualities separately. After the answer, bring the progression to another neck region.';
    if (last?.outcome === 'answered' && last.sequence === false) {
      message = last.root.every(Boolean)
        ? 'Your recorded roots matched. Compare the chord qualities next: hear the same root with different thirds. One response does not explain why a change was missed.'
        : 'Your last sequence did not match. Replay the passage and follow the bass movement, then compare the chord qualities. A bass note is not always the chord root.';
    }
    actions.length = 0;
    actions.push(
      { type: 'listening', operation: 'replay', difficulty: l.difficulty },
      {
        type: 'listening',
        operation: last?.sequence ? 'workspace' : 'question',
        difficulty: l.difficulty,
      },
    );
    factRefs.push('listening-context');
    if (last) factRefs.push(last.id);
  }
  const practice = request.context.practice;
  if (
    practice &&
    /rhythm|timing|in time|phrase|response|express|articulation|dynamic|change approach|another approach|compare two|do not want.*repeat|reflect/.test(
      text,
    )
  ) {
    actions.length = 0;
    if (/change approach|another approach|compare two|do not want.*repeat/.test(text)) {
      message =
        'We can change approach. Try comparing two short versions, then decide whether you want to answer, make your own example, or keep exploring.';
      actions.push({
        type: 'practice',
        operation: 'strategy',
        approach: 'Compare two versions',
        rationale: 'Attend to one difference before deciding whether to try another response.',
      });
    } else if (/reflect/.test(text)) {
      message =
        'What helped you notice the change, and what would you try next? Reflection is optional and records your perspective, not a score.';
      actions.push({ type: 'practice', operation: 'reflection' });
    } else {
      const activity = /phrase|make.*response|construct/.test(text)
        ? 'phrase'
        : /express|articulation|dynamic/.test(text)
          ? 'expression'
          : 'rhythm';
      message =
        activity === 'phrase'
          ? 'Make a short response and listen to it. The original study supplies notes, rests and a destination; different phrases can satisfy the same constraints. Your artistic preference is yours.'
          : activity === 'expression'
            ? 'Compare two authored versions of the same phrase. First identify what changed in the sound, then describe which intention you prefer. We can check the factual difference, not grade your taste.'
            : 'Use a short original G7 to Cmaj7 study. Place attacks and rests on half-beat slots, then compare your pattern with the original. This checks a symbolic response, not your guitar timing.';
      const reserved = /reserved|fresh|transfer/.test(text);
      const id = practice.reserved.find((id) => id.startsWith(`musicianship-v1:${activity}:`));
      if (!reserved || id)
        actions.push({
          type: 'practice',
          operation: 'activity',
          activity,
          variant: id ? Number(id.split(':').at(-1)) : 0,
          assessment: reserved ? 'reserved' : 'practice',
        });
      else
        message +=
          ' No unexposed example remains in this small authored set. We can revisit it as practice.';
    }
  }
  if (/dominant seventh|blues|always.*v\b/.test(text)) {
    message =
      'Dominant seventh names a chord quality. Function depends on context: a blues tonic can be a dominant seventh without functioning as V. Choose a key and progression before assigning a functional label.';
    actions.length = 0;
  }
  if (/don't quiz|do not quiz|no quiz|stop quizzing|just explore|just explain/.test(text)) {
    for (let i = actions.length - 1; i >= 0; i--)
      if (
        actions[i]!.type === 'question' ||
        actions[i]!.type === 'practice' ||
        (actions[i]!.type === 'listening' &&
          (actions[i] as { operation: string }).operation === 'question')
      )
        actions.splice(i, 1);
  }
  if (playingClaim) {
    message =
      'This app has no microphone or camera assessment. I can use your screen answers or a playing result you report yourself, but I cannot hear your guitar or assess your technique. Describe the part that felt unclear and we can inspect its notes or chord movement.';
    actions.length = 0;
  }
  const hw = request.context.homework;
  if (hw && !conceptual) {
    actions.length = 0;
    message = `CAGED names five parent major shapes. An E-family shape can sound G major; the family and chord names answer different questions. Use a small fragment, name its notes, then apply those notes in the progression. Your screen answers and self-reported playing remain separate.`;
    referenceIds.push('caged-landmarks');
    if (/stop|no quiz|just explor|change approach/.test(text))
      message =
        'We can explore without a quiz. Compare neighboring family maps, listen to the fragment, and choose what you want to investigate next. Changing position does not change the selected mode.';
    else if (/heard|clean chord|technique|played well/.test(text))
      message =
        'I cannot hear or assess your playing. Your guitar result is self-reported. I can check a selected note, chord role, or constructed voicing on screen.';
    else if (!hw.active) {
      const action: TeacherAction = {
        type: 'homework',
        operation: 'task',
        kind: /seventh|connect.*chord|resolv/.test(text)
          ? 'connection'
          : /voicing|build/.test(text)
            ? 'voicing'
            : /root/.test(text)
              ? 'roots'
              : 'locate',
        family: hw.family,
      };
      if (resolveTeacherAction(request, action)) actions.push(action);
    }
    const recent = hw.evidence.filter((e) => e.kind === 'answer').at(-1);
    if (recent && !recent.correct)
      message +=
        ' The last recorded screen answer did not meet its constraints. We can check the note name and chord role separately; that response alone does not explain why it was missed.';
  }
  const live = request.context.live;
  if (live && !conceptual) {
    actions.length = 0;
    factRefs.push('live-boundary');
    const last = live.evidence.at(-1);
    const result = {
      match: 'a supported match',
      discrepancy: 'a supported difference',
      unassessed: 'insufficient evidence',
      interrupted: 'an interruption',
    };
    message = last
      ? `The detector reported ${result[last.outcome]} for this response.`
      : 'Connect your clean guitar input, choose a task, then start a response. I can use bounded local detection summaries; I do not receive your audio.';
    if (last) {
      factRefs.push(`live:${last.id}`);
      if (last.detectedPitches.length && last.kind !== 'chords')
        message += ` The detected notes were ${last.detectedPitches
          .slice(0, 8)
          .map((p) => formatPitch(Math.round(p), false))
          .join(' → ')}.`;
      message +=
        ' This is experimental sound evidence. It does not establish which fret or grip you used, clean technique, or timing.';
      if (last.assisted || !last.firstResponse)
        message +=
          ' Help or a previous response was recorded, so this remains separate from unassisted first attempts.';
    }
    if (last?.outcome === 'unassessed' || last?.outcome === 'interrupted')
      message +=
        ' No incorrect answer is inferred. Check the input level, or pick the chord tones separately.';
    else if (last?.outcome === 'discrepancy')
      message +=
        ' Isolate one change, compare its notes, then try again. The first response remains recorded.';
    if (!live.active && !/stop|no quiz|just explain/.test(text)) {
      const oneNote = /(?:one|single) note/.test(text);
      const task = live.eligible.find(
        (t) =>
          t.id ===
          (!oneNote && last?.kind === 'chords' && last.outcome !== 'match'
            ? 'live-arpeggio'
            : 'live-note'),
      );
      if (task) actions.push({ type: 'live', taskId: task.id });
    }
  }
  const playing = request.context.playingHomework;
  if (playing && !conceptual) {
    actions.length = 0;
    factRefs.push('playing-boundary');
    const last = playing.evidence
      .filter((e) => e.kind === 'self-report' || e.kind === 'performance-reference')
      .at(-1);
    if (last?.selfReport)
      message = `You reported “${last.selfReport.replaceAll('-', ' ')}”. That tells us how the pass felt; it does not verify the notes or position. `;
    else if (!request.context.live?.evidence.length)
      message =
        'Pick up the guitar and try one small musical idea. You can use the controls without plugging in. ';
    message += /stop|no quiz|just play|just explor/.test(text)
      ? 'We can stop quizzing. Repeat the passage or explore freely, and save what you want to revisit.'
      : 'Try one change slowly, then return it to the progression. A coordinate check is available separately if you want to check the location.';
    if (playingClaim)
      message =
        'A sounding C does not establish its string, fret, CAGED family, clean technique or timing. Select a coordinate separately if location is the goal. You can still play and report how the pass felt.';
    if (/could not assess|uncertain/.test(text))
      message =
        'That result is unassessed, not incorrect. Pick the intended notes individually, check the input level, then return to the chord change. I cannot conclude which note was missing from uncertain audio.';
    if (/goal/.test(text))
      message =
        'Change the goal in the stage header, then choose a matching playing step. The active response will be interrupted and its first response preserved. We can focus on hearing a seventh before returning to the progression.';
    if (!playing.active && !/stop|no quiz|just explain|just play|just explor|goal/.test(text)) {
      actions.push({
        type: 'playing-homework',
        operation:
          /isolat|change/.test(text) && playing.objective === 'progression' ? 'isolate' : 'retry',
        stepId: playing.stepId,
      });
    }
  }
  if (conceptual && (playing || hw)) {
    const explanation = explainHomework(request);
    if (explanation) {
      message = explanation.message;
      actions.splice(0, actions.length, ...explanation.actions);
      factRefs.splice(0, factRefs.length, ...explanation.factRefs);
    }
    if (!/quiz|question|test me/.test(text)) {
      for (let i = actions.length - 1; i >= 0; i--)
        if (actions[i]!.type === 'question') actions.splice(i, 1);
    }
  }
  if (
    (request.context.playingHomework?.active && !request.context.playingHomework.assisted) ||
    (request.context.practice?.active && !request.context.practice.active.assisted) ||
    (request.context.ear?.activeQuestion && !request.context.ear.assisted) ||
    (request.context.activeQuestion && !request.context.activeQuestion.assisted) ||
    (request.context.homework?.active && !request.context.homework.assisted) ||
    (request.context.live?.active && !request.context.live.assisted) ||
    (request.context.practice?.active && !request.context.practice.active.assisted) ||
    (request.context.listening?.activeQuestion &&
      !request.context.listening.activeQuestion.assisted)
  ) {
    message =
      'A question is active. Use “Ask for help” first; help is recorded before an explanation appears.';
    actions.length = 0;
  }
  return {
    schemaVersion: request.schemaVersion,
    lessonId: request.lessonId,
    turnId: request.turnId,
    contextVersion: request.contextVersion,
    source: 'local',
    message,
    actions: actions.filter((action) => resolveTeacherAction(request, action)),
    factRefs: [...new Set(factRefs)],
    referenceIds,
    claims: [],
    versions: {
      policy: TEACHER_VERSION,
      prompt: TEACHER_PROMPT_VERSION,
      model: 'authored-adaptive-v1',
      curriculum: CURRICULUM_VERSION,
    },
    review: { status: 'local', reasons: [] },
    fallbackReason: reason,
  };
}
