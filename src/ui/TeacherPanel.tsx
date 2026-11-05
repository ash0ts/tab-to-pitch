import type { EarSession } from '../ear/useEarSession';
import { INTEGRATED_TEACHER_VERSION } from '../shared/teacher';
import type { LiveGuitarSession } from '../hooks/useLiveGuitar';
import type { HomeworkSession } from '../hooks/useHomeworkSession';
import { HOMEWORK_VERSION } from '../shared/homework';
import type { PracticeSession } from '../hooks/usePracticeSession';
import { PRACTICE_VERSION } from '../shared/practice';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Eye, MessageCircle, Volume2 } from 'lucide-react';
import {
  CURRICULUM_VERSION,
  teacherRequestSchema,
  type TeacherAction,
  type TeacherRequest,
  type TeacherTurn,
} from '../shared/teacher';
import {
  exposureKeysForTeacherTurn,
  teacherPositionExposureKeys,
  relevantTeacherExposureKeys,
  localTeacher,
  resolveTeacherAction,
  validateTeacherTurn,
} from '../engine/teacher';
import type {
  AttemptRecord,
  NoteEvent,
  ExerciseDefinition,
  ExerciseSelection,
  ScoreDocument,
  ScoreTrack,
} from '../engine/types';
import type { ProgressionSession } from '../hooks/useProgressionSession';
import type { LearningSession, ListeningSession } from '../hooks/useListeningSession';
import { progressionStudyTonic } from '../player/demo';
import { parsePitch, soundingAt } from '../engine/theory';
import { executeArrangementIntent } from '../shared/arrangements';
import { getMemoryLessonData } from '../storage';
import { Fretboard, type FretboardMarker } from './Fretboard';
import './teacher.css';

export interface TeacherPanelProps {
  onReturnToTask?(): void;
  ear?: EarSession;
  focusRequest?: number;
  cloudEnabled?: boolean;
  onCloudChange?: (enabled: boolean) => void;
  presentationRevision?: string;
  presentation?: TeacherRequest['context']['presentation'];
  learning: LearningSession;
  live?: LiveGuitarSession;
  practice?: PracticeSession;
  homework?: HomeworkSession;
  listening?: ListeningSession;
  onReplay(bassOnly?: boolean): void;
  onTransfer(): void;
  score: ScoreDocument;
  track: ScoreTrack;
  progression: ProgressionSession;
  attempts: AttemptRecord[];
  selectedNote: NoteEvent | null;
  activeQuestion: ExerciseSelection | null;
  exploring: boolean;
  onExercise(exercise: ExerciseDefinition): void;
  onHelp(): void;
  onUnderstand(): void;
  onOpenStudy(): void;
  onListen(pitches: number[]): void;
}

const objectives = [
  {
    id: 'listening',
    title: 'Hear the progression',
    prompt: 'Help me hear the chord changes and connect them to the fretboard.',
  },
  {
    id: 'foundations',
    title: 'Notes and chord roles',
    prompt: 'Help me understand the notes and chord roles in this passage.',
  },
  {
    id: 'connections',
    title: 'Connect the chords',
    prompt: 'Help me hear and find a connection between these chords in another neck position.',
  },
  {
    id: 'extensions',
    title: 'Extensions and rootless chords',
    prompt: 'Help me compare an extension and explain what a rootless voicing means over the bass.',
  },
] as const;

function evidenceResponse(attempt: AttemptRecord): string {
  const value = attempt.response.trim();
  return /^(?:[A-G](?:#|b){0,2}-?\d?|(?:major |minor |diminished |augmented )?(?:root|second|third|fourth|fifth|sixth|seventh|ninth|eleventh|thirteenth)|[b#]?\d{1,2}|\d+[:,/]\d+(?:\s*(?:->|>|→|to)\s*\d+[:,/]\d+)?)$/i.test(
    value,
  )
    ? value.slice(0, 120)
    : value
      ? 'Other response'
      : '';
}

export function TeacherPanel(props: TeacherPanelProps) {
  const { score, track, progression, attempts, activeQuestion } = props;
  const learning = props.learning;
  const listening = props.listening;
  const ear = props.ear;
  const earMasked = !!ear?.masked;
  const { lesson, events, record } = learning;
  const [expanded, setExpanded] = useState(true);
  useEffect(() => {
    if (props.focusRequest) setExpanded(true);
  }, [props.focusRequest]);
  const [draft, setDraft] = useState('');
  const [localCloud, setLocalCloud] = useState(false);
  const cloud = props.cloudEnabled ?? localCloud;
  const setCloud = props.onCloudChange ?? setLocalCloud;
  const [qualification, setQualification] = useState('unqualified');
  useEffect(() => {
    const abort = new AbortController();
    void fetch('/api/health', { signal: abort.signal })
      .then((r) => r.json())
      .then((value) =>
        setQualification(value.teacherQualification === 'qualified' ? 'qualified' : 'unqualified'),
      )
      .catch(() => {});
    return () => abort.abort();
  }, []);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [proposal, setProposal] = useState<{
    request: TeacherRequest;
    turn: TeacherTurn;
    validContextVersion: string;
  } | null>(null);
  const [markers, setMarkers] = useState<FretboardMarker[]>([]);
  const [bassTrack, setBassTrack] = useState(() =>
    progressionStudyTonic(score.hash)
      ? (score.tracks.find((item) => item.id !== track.id && !item.isPercussion)?.id ?? '')
      : '',
  );
  const conversation = useRef<HTMLDivElement | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const relevantAttempts = attempts.filter(
    (attempt) => attempt.scoreId === score.id && attempt.trackId === track.id,
  );
  const workspaceView = progression.previewing
    ? 'preview'
    : Object.keys(progression.targets).length
      ? 'proposal'
      : 'source';
  const selectedNote =
    !progression.previewing &&
    props.selectedNote?.eligible &&
    props.selectedNote.soundingMidi !== null
      ? props.selectedNote
      : null;
  const selectedToken = selectedNote
    ? `${selectedNote.onsetTicks}:${selectedNote.position?.string}:${selectedNote.position?.fret}:${selectedNote.soundingMidi}`
    : 'none';
  const baseVersion = `${progression.contextVersion}:n${selectedToken}:${workspaceView}:p${progression.path}:${lesson?.objective ?? 'foundations'}:${relevantAttempts.at(-1)?.id.slice(-36) ?? 'new'}:${bassTrack}:g${props.live?.revision ?? 0}:l${listening?.revision ?? 0}:stage${props.presentation?.activity ?? ''}:${props.presentation?.mode ?? ''}:ear${ear?.state?.revision ?? 'none'}:${ear?.job?.status ?? 'none'}`;
  const versionFor = (revision: number) =>
    `${baseVersion}:r${revision}:${activeQuestion?.support ?? 'none'}:x${learning.externalRevision}`;
  const contextVersion = versionFor(lesson?.revision ?? 0);
  const contextRef = useRef(contextVersion);
  contextRef.current = contextVersion;
  const expectedContext = useRef<string | null>(null);
  const linkedTasks = new Set(
    events.flatMap((event) => (event.exerciseId ? [event.exerciseId] : [])),
  );
  const unknownLegacyExposure =
    learning.legacyExposure ||
    relevantAttempts.some((attempt) => !linkedTasks.has(attempt.exerciseId));
  const exposureKeys = [
    ...new Set([
      ...events.flatMap((event) => event.exposureKeys),
      ...(unknownLegacyExposure ? ['legacy:unknown'] : []),
    ]),
  ];
  const questionId = activeQuestion?.exercise.id;

  useEffect(() => {
    if (conversation.current) conversation.current.scrollTop = conversation.current.scrollHeight;
  }, [lesson?.messages.length, expanded, questionId]);

  useEffect(() => {
    if (
      !lesson ||
      listening?.masked ||
      props.practice?.masked ||
      props.homework?.masked ||
      props.live?.masked ||
      earMasked
    )
      return;
    const request = requestFor('Index source positions made available in the score.');
    if (!request) return;
    const positions = track.notes.flatMap((note) => (note.position ? [note.position] : []));
    const keys = teacherPositionExposureKeys(request, positions).filter(
      (key) => !exposureKeys.includes(key),
    );
    if (!keys.length) return;
    record(
      {},
      [],
      [
        {
          kind: 'exposure',
          exposureKeys: keys,
          detail:
            'Source score available: conservatively indexed every physical position on this track, including bars outside the viewport.',
        },
      ],
    );
  }, [lesson?.id, track, progression.contextVersion]);

  useEffect(() => {
    if (
      !lesson ||
      !props.exploring ||
      activeQuestion ||
      listening?.masked ||
      props.practice?.masked ||
      props.homework?.masked ||
      props.live?.masked ||
      earMasked ||
      document.hidden
    )
      return;
    const request = requestFor('Inspect the displayed progression.');
    if (!request) return;
    const keys = exposureKeysForTeacherTurn(request, localTeacher(request));
    if (keys.every((key) => events.some((event) => event.exposureKeys.includes(key)))) return;
    record(
      {},
      [],
      [
        {
          kind: 'exposure',
          exposureKeys: keys,
          detail: 'Progression diagrams and chord roles displayed.',
        },
      ],
    );
  }, [props.exploring, progression.contextVersion, lesson?.id, bassTrack]);

  useEffect(() => {
    if (expectedContext.current === contextVersion) {
      expectedContext.current = null;
      return;
    }
    generation.current++;
    activeRequest.current?.abort();
    setBusy(false);
    setProposal(null);
    setMarkers([]);
  }, [contextVersion]);
  useEffect(() => {
    generation.current++;
    activeRequest.current?.abort();
    setBusy(false);
    setProposal(null);
    setMarkers([]);
  }, [cloud, questionId, props.presentationRevision]);
  useEffect(
    () => () => {
      generation.current++;
      activeRequest.current?.abort();
    },
    [],
  );

  function recordOwnTurn(...args: Parameters<typeof record>) {
    const next = record(...args);
    if (next) {
      expectedContext.current = versionFor(next.revision);
      contextRef.current = expectedContext.current;
    }
    return next;
  }

  useEffect(() => {
    if (!lesson) return;
    const recorded = new Set(events.flatMap((event) => (event.attemptId ? [event.attemptId] : [])));
    const taskIds = new Set(
      events.flatMap((event) =>
        event.kind === 'task-started' && event.exerciseId ? [event.exerciseId] : [],
      ),
    );
    const fresh = relevantAttempts.filter(
      (attempt) => taskIds.has(attempt.exerciseId) && !recorded.has(attempt.id),
    );
    if (!fresh.length) return;
    record(
      { pendingTaskId: null },
      [],
      fresh.map((attempt) => ({
        kind:
          attempt.outcome === 'revealed'
            ? 'reveal'
            : attempt.outcome === 'interrupted'
              ? 'interrupted'
              : 'attempt',
        attemptId: attempt.id,
        exerciseId: attempt.exerciseId,
        exposureKeys: [...(attempt.transferKeys ?? [])],
        detail: `${attempt.outcome}; ${attempt.assisted ? 'assisted' : 'unassisted'}; ${attempt.evidence}`,
      })),
    );
  }, [attempts, lesson?.id, events, record]);

  function requestFor(text: string): TeacherRequest | null {
    if (!lesson) return null;
    const backing = score.tracks.find(
      (item) => item.id === bassTrack && item.id !== track.id && !item.isPercussion,
    );
    const bass: TeacherRequest['context']['bass'] = [];
    if (backing && backing.harmonySupported !== false) {
      for (const [spanIndex, span] of progression.sourceSpans.entries()) {
        const notes = soundingAt(backing.notes, span.startTick).filter(
          (note) =>
            note.eligible &&
            note.soundingMidi !== null &&
            note.onsetTicks + note.durationTicks >= span.endTick,
        );
        if (notes.length)
          bass.push({
            spanIndex,
            midi: Math.min(...notes.map((note) => note.soundingMidi!)),
            source: progressionStudyTonic(score.hash) ? 'authored' : 'observed',
          });
      }
    }
    const request = {
      schemaVersion: INTEGRATED_TEACHER_VERSION,
      capabilities: [
        ...(listening?.passage ? ['listening-v1'] : []),
        ...(props.practice ? ['teaching-practice-v1'] : []),
        ...(props.homework ? ['homework-caged-v1'] : []),
        ...(props.live ? ['teacher-live-v1'] : []),
        ...(ear?.context ? ['ear-lab-v1'] : []),
        ...(props.presentation ? ['practice-stage-v1'] : []),
      ],
      requestId: crypto.randomUUID(),
      lessonId: lesson.id,
      turnId: crypto.randomUUID(),
      contextVersion,
      request: text,
      ...(ear?.state && ear.analysisReady
        ? {
            localAudio: {
              assetId: ear.state.asset.id,
              start: ear.state.start,
              end: ear.state.end,
              stages: ['transcribe', 'timing'] as const,
              contextRevision: ear.state.revision,
            },
          }
        : {}),
      context: {
        ...(ear?.context ? { ear: ear.context } : {}),
        ...(props.presentation ? { presentation: props.presentation } : {}),
        objective: lesson.objective,
        ...(props.live ? { live: props.live.context } : {}),
        ...(props.homework
          ? {
              homework: {
                capability: HOMEWORK_VERSION,
                revision: lesson.revision,
                active: props.homework.active,
                assisted:
                  (props.homework.state?.support.length ?? 0) > 0 ||
                  (props.homework.state?.responses.length ?? 0) > 0,
                goal:
                  props.homework.state?.goal ?? 'Find notes and use chord tones across the neck',
                taskKind: props.homework.active ? (props.homework.task?.kind ?? null) : null,
                family: props.homework.family,
                symbol: props.homework.active
                  ? props.homework.task!.symbol
                  : props.homework.setup.symbol,
                region: props.homework.active
                  ? props.homework.task!.region
                  : props.homework.setup.region,
                evidence: props.homework.observations
                  .slice(-12)
                  .map(({ response: _response, ...e }) => e),
              },
            }
          : {}),
        ...(props.practice
          ? {
              practice: {
                capability: PRACTICE_VERSION,
                goal: props.practice.state.goal,
                strategy: props.practice.state.strategy,
                reflection: props.practice.state.reflection,
                review: props.practice.state.review,
                studyId: props.practice.task?.id,
                active: props.practice.active
                  ? {
                      id: props.practice.state.episode!.id,
                      kind: props.practice.state.episode!.kind,
                      assisted: props.practice.state.episode!.support.length > 0,
                      responseCount: props.practice.state.episode!.responseCount,
                    }
                  : null,
                evidence: props.practice.evidence.slice(-12),
                reserved: props.practice.reserved,
              },
            }
          : {}),
        ...(listening?.passage
          ? {
              listening: {
                passageId: listening.passage.id,
                annotationVersion: listening.passage.version,
                source: listening.source,
                difficulty: listening.difficulty,
                activeQuestion: listening.active
                  ? { id: listening.exercise!.id, assisted: listening.assisted }
                  : null,
                evidence: listening.recent.map((a, i) => ({
                  id: `listening-answer-${i}`,
                  outcome: a.outcome,
                  assisted: a.assisted,
                  source: a.source,
                  familiar: a.familiar,
                  root: a.grade?.root ?? [],
                  quality: a.grade?.quality ?? [],
                  sequence: a.grade?.sequence ?? null,
                })),
              },
            }
          : {}),
        music: {
          tuning: track.tuningMidi,
          capo: track.capo,
          key: progression.context,
          selectedSpan: progression.selectedIndex,
          spans: progression.spans.map((span) => ({
            symbol: span.chord?.symbol ?? null,
            confirmed: span.confirmation === 'confirmed',
            startTick: span.startTick,
            endTick: span.endTick,
            melody: (span.melodyAnchors ?? []).map(({ startTick, endTick, midi }) => ({
              startTick,
              endTick,
              midi,
            })),
          })),
        },
        selectedNotes:
          selectedNote &&
          (!selectedNote.position ||
            track.tuningMidi[selectedNote.position.string - 1]! +
              track.capo +
              selectedNote.position.fret ===
              selectedNote.soundingMidi)
            ? [
                {
                  id: 'n0',
                  midi: selectedNote.soundingMidi!,
                  position: selectedNote.position,
                  spelling:
                    selectedNote.spelling &&
                    parsePitch(selectedNote.spelling) === selectedNote.soundingMidi
                      ? selectedNote.spelling
                      : null,
                },
              ]
            : [],
        workspace: {
          view: workspaceView,
          sourceSymbols: progression.sourceSpans.map((span) => span.chord?.symbol ?? null),
        },
        constraints: progression.options,
        bass,
        evidence: relevantAttempts.slice(-12).map((attempt, index) => ({
          id: `answer-${index}`,
          kind: attempt.kind,
          outcome: attempt.outcome,
          assisted: attempt.assisted,
          response: evidenceResponse(attempt),
          mode: attempt.mode,
          elapsedDays: Math.max(0, Math.min(36500, (Date.now() - attempt.answeredAt) / 86400000)),
        })),
        history: lesson.messages
          .slice(-8)
          .map(({ role, text }) => ({ role, text: text.slice(0, 2000) })),
        exposures: [],
        activeQuestion: activeQuestion
          ? {
              id: activeQuestion.exercise.id.slice(0, 160),
              kind: activeQuestion.exercise.kind,
              assisted: activeQuestion.support === 'guided',
            }
          : null,
      },
    };
    const parsed = teacherRequestSchema.safeParse(request);
    if (!parsed.success) {
      setNotice(
        'Choose a supported six-string passage with up to eight chord spans, or open the original study.',
      );
      return null;
    }
    parsed.data.context.exposures = relevantTeacherExposureKeys(parsed.data, exposureKeys);
    const bounded = teacherRequestSchema.safeParse(parsed.data);
    if (!bounded.success) {
      setNotice(
        'This lesson has more exposure history than a cloud request can safely include. Start a different passage; your existing history remains local.',
      );
      return null;
    }
    return bounded.data;
  }

  async function send(text: string) {
    if (
      !text.trim() ||
      busy ||
      activeQuestion ||
      listening?.masked ||
      props.practice?.masked ||
      props.homework?.masked ||
      props.live?.masked ||
      earMasked ||
      !lesson ||
      learning.externalRevision
    )
      return;
    if (lesson.messages.length >= 198) {
      setNotice(
        'This lesson has reached its conversation limit. Export your history and open another passage to continue.',
      );
      return;
    }
    const request = requestFor(text.trim());
    if (!request) return;
    const userMessage = {
      id: crypto.randomUUID(),
      role: 'user' as const,
      text: text.trim(),
      at: Date.now(),
    };
    recordOwnTurn(
      {},
      [userMessage],
      [{ kind: 'message', messageId: userMessage.id, exposureKeys: [] }],
    );
    request.contextVersion = contextRef.current;
    setDraft('');
    setNotice('');
    setBusy(true);
    setExpanded(true);
    const token = ++generation.current;
    const abort = new AbortController();
    activeRequest.current = abort;
    const timer = setTimeout(() => abort.abort(), 65000);
    let turn: TeacherTurn;
    try {
      if (cloud) {
        const response = await fetch('/api/teacher/next', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
          signal: abort.signal,
        });
        if (!response.ok) throw new Error('Cloud teacher unavailable.');
        const checked = validateTeacherTurn(await response.json(), request);
        if (!checked) throw new Error('Invalid teacher response.');
        turn = checked;
      } else turn = localTeacher(request);
    } catch {
      turn = localTeacher(request, 'unavailable');
    } finally {
      clearTimeout(timer);
    }
    if (token !== generation.current || request.contextVersion !== contextRef.current) return;
    const checked = validateTeacherTurn(turn, request);
    setBusy(false);
    if (!checked) {
      setNotice('The teacher response could not be verified. Your music is unchanged.');
      return;
    }
    const reserved = checked.actions.some(
      (action) => action.type === 'question' && action.recipe.assessment === 'heldout',
    );
    const displayed = reserved
      ? {
          ...checked,
          message: 'A reserved question is ready. Try it before opening explanations.',
          actions: checked.actions
            .filter(
              (action) => action.type === 'question' && action.recipe.assessment === 'heldout',
            )
            .slice(0, 1),
        }
      : checked;
    const message = {
      id: crypto.randomUUID(),
      role: 'assistant' as const,
      text: displayed.message,
      at: Date.now(),
      source: checked.source,
    };
    recordOwnTurn(
      {},
      [message],
      [
        {
          kind: 'message',
          messageId: message.id,
          exposureKeys: reserved ? [] : exposureKeysForTeacherTurn(request, checked),
        },
      ],
    );
    setProposal({ request, turn: displayed, validContextVersion: contextRef.current });
    if (checked.audioJobs?.length) ear?.acceptJobs(checked.audioJobs);
    if (cloud && checked.fallbackReason)
      setNotice('Using the on-device guide. Your question and music remain available.');
  }

  function useAction(action: TeacherAction) {
    if (
      !proposal ||
      busy ||
      activeQuestion ||
      listening?.masked ||
      props.practice?.masked ||
      props.homework?.masked ||
      props.live?.masked ||
      earMasked ||
      proposal.validContextVersion !== contextRef.current ||
      learning.externalRevision
    )
      return;
    const currentRequest = {
      ...proposal.request,
      context: {
        ...proposal.request.context,
        exposures: relevantTeacherExposureKeys(proposal.request, exposureKeys),
      },
    };
    const resolved = resolveTeacherAction(currentRequest, action);
    if (!resolved) {
      setNotice(
        action.type === 'question' &&
          action.recipe.assessment === 'heldout' &&
          unknownLegacyExposure
          ? 'Earlier exposure is unknown. Ask to practice this question; it cannot be counted as reserved.'
          : 'This action no longer matches the selected music or its exposure history. Ask for an updated step.',
      );
      return;
    }
    if (action.type === 'ear') {
      ear?.action(action);
      return;
    }
    if (action.type === 'live') {
      props.live?.apply(action);
      return;
    }
    if (action.type === 'homework') {
      props.homework?.apply(action);
      props.onReturnToTask?.();
      return;
    }
    if (
      window.matchMedia('(max-width: 900px)').matches &&
      (action.type === 'preview' || action.type === 'practice')
    )
      setExpanded(false);
    if (action.type === 'practice') {
      props.practice?.apply(action);
      return;
    }
    if (action.type === 'listening') {
      if (!listening) return;
      if (action.operation === 'question') listening.begin(action.difficulty);
      if (action.operation === 'replay') {
        if (listening.source === 'recording') listening.requestRecording();
        else props.onReplay();
      }
      if (action.operation === 'tonic' && resolved.pitches) props.onListen(resolved.pitches);
      if (action.operation === 'workspace') props.onUnderstand();
      if (action.operation === 'transfer') props.onTransfer();
      if (action.operation === 'bass') {
        listening.assist('Synthesized bass comparison requested.');
        if (listening.source !== 'synthesized') listening.changeSource('synthesized');
        props.onReplay(true);
      }
      return;
    }
    if (resolved.exercise) {
      const exercise = {
        ...resolved.exercise,
        id: `${resolved.exercise.id}:${score.hash}`,
        scoreId: score.id,
        trackId: track.id,
      };
      const frozen = getMemoryLessonData().exerciseDefinitions.find(
        (item) => item.id === exercise.id,
      ) ?? {
        id: exercise.id,
        generatorVersion: CURRICULUM_VERSION,
        createdAt: Date.now(),
        definition: exercise,
      };
      record(
        { pendingTaskId: exercise.id },
        [],
        [{ kind: 'task-started', exerciseId: exercise.id, exposureKeys: [] }],
        [frozen],
      );
      props.onExercise(exercise);
      return;
    }
    if (resolved.positions)
      setMarkers(resolved.positions.map((position) => ({ position, role: 'target' })));
    if (action.type === 'preview' && resolved.variation) {
      props.onUnderstand();
      const arrangementRequest = {
        requestId: proposal.request.requestId,
        contextVersion: proposal.request.contextVersion,
        request: proposal.request.request.slice(0, 600),
        context: proposal.request.context.music,
        constraints: proposal.request.context.constraints,
      };
      const execution = executeArrangementIntent(arrangementRequest, action.intent);
      progression.loadProposal(
        action.intent.constraints,
        execution.spans,
        resolved.variation,
        true,
      );
    }
    if (resolved.pitches && action.type === 'audition') props.onListen(resolved.pitches);
    recordOwnTurn(
      {},
      [],
      [
        {
          kind: action.type === 'preview' ? 'preview' : 'exposure',
          exposureKeys: resolved.exposureKeys,
          detail: action.type,
        },
      ],
    );
    setProposal((previous) =>
      previous ? { ...previous, validContextVersion: contextRef.current } : null,
    );
  }

  if (!lesson) return null;
  return (
    <section
      className={`teacher-panel ${expanded ? 'conversation-open' : ''}`}
      aria-label="Music teacher"
    >
      <div className="teacher-heading">
        <div>
          <span className="eyebrow">
            <MessageCircle size={15} /> Music teacher
          </span>
          <h2>Ask about the music in front of you.</h2>
        </div>
        <button
          className="secondary-button"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Close conversation' : 'Open teacher'}
        </button>
      </div>
      {expanded && (
        <>
          {!activeQuestion &&
            !listening?.masked &&
            !props.practice?.active &&
            !props.homework?.masked &&
            !props.live?.masked &&
            !earMasked && (
              <>
                <div className="teacher-intents" aria-label="How should the teacher help?">
                  {['Explain', 'Demonstrate', 'Let me try', 'Change approach', 'Just explore'].map(
                    (intent) => (
                      <button
                        key={intent}
                        className="text-button"
                        onClick={() =>
                          setDraft(
                            intent === 'Just explore'
                              ? 'Just explore with me. Do not quiz me.'
                              : intent,
                          )
                        }
                      >
                        {intent}
                      </button>
                    ),
                  )}
                </div>
                <div className="teacher-objectives" aria-label="Lesson focus">
                  {objectives.map((objective) => (
                    <button
                      key={objective.id}
                      disabled={
                        !!activeQuestion || !!listening?.masked || !!props.practice?.masked || busy
                      }
                      aria-pressed={lesson.objective === objective.id}
                      onClick={() => {
                        learning.changeObjective(objective.id);
                        setDraft(objective.prompt);
                      }}
                    >
                      {objective.title}
                    </button>
                  ))}
                </div>
              </>
            )}
          {activeQuestion ||
          listening?.masked ||
          props.practice?.active ||
          props.homework?.masked ||
          props.live?.masked ||
          earMasked ? (
            <div className="teacher-recall" role="status">
              <strong>Your question is active.</strong>
              <p>
                {props.practice?.active
                  ? 'Earlier conversation stays hidden while this question is active. Choose focused help on the task, request its full explanation, or stop the question to talk.'
                  : 'Conversation, diagrams and earlier explanations are hidden while you answer. Asking for help records a reveal before showing them.'}
              </p>
              <button
                className="secondary-button"
                onClick={() => {
                  if (earMasked) ear?.assist();
                  else if (props.live?.masked) props.live.help('teacher');
                  else if (props.homework?.masked) props.homework.help('answer');
                  else if (props.practice?.active) props.practice.help('answer');
                  else if (listening?.masked) listening.reveal();
                  else props.onHelp();
                }}
              >
                <Eye size={16} />{' '}
                {props.practice?.active
                  ? 'Explain this question'
                  : 'Ask for help and show the conversation'}
              </button>
              {props.practice?.active && (
                <button
                  className="text-button"
                  onClick={() =>
                    props.practice?.interrupt('The learner stopped the question to talk.')
                  }
                >
                  Stop question and talk
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="teacher-context">
                <span>
                  {props.practice?.task
                    ? 'Original activity · synthesized study'
                    : workspaceView === 'preview'
                      ? 'Variation in the player'
                      : workspaceView === 'proposal'
                        ? 'Variation proposal'
                        : 'Selected passage'}
                </span>
                <strong>
                  {props.practice?.task
                    ? 'G7 → Cmaj7'
                    : progression.spans.map((span) => span.chord?.symbol ?? '?').join(' → ')}
                </strong>
                <span>
                  Frets {progression.options.minFret}–{progression.options.maxFret}
                </span>
                {workspaceView !== 'source' && (
                  <small>
                    Original:{' '}
                    {progression.sourceSpans.map((span) => span.chord?.symbol ?? '?').join(' → ')}
                  </small>
                )}
              </div>
              {!lesson.messages.length && (
                <div className="teacher-introduction">
                  <p>
                    Follow a question about a note, a chord change, or an extension. The teacher can
                    inspect the passage, show another voicing, compare sounds, and ask you to try an
                    idea.
                  </p>
                  <div className="teacher-starters">
                    <button
                      className="text-button"
                      onClick={() =>
                        void send(objectives.find((item) => item.id === lesson.objective)!.prompt)
                      }
                    >
                      Start with this passage <ArrowRight size={15} />
                    </button>
                    <button className="text-button" onClick={props.onOpenStudy}>
                      Open the original four-chord study
                    </button>
                  </div>
                </div>
              )}
              <div
                ref={conversation}
                className="teacher-conversation"
                role="log"
                aria-label="Lesson conversation"
                aria-live="polite"
              >
                {lesson.messages.map((message) => (
                  <article key={message.id} className={`teacher-message ${message.role}`}>
                    <span className="teacher-speaker">
                      {message.role === 'user'
                        ? 'You'
                        : message.source === 'forge'
                          ? 'Teacher · Forge'
                          : 'On-device guide'}
                    </span>
                    <p>{message.text}</p>
                  </article>
                ))}
              </div>
              {proposal && (
                <div className="teacher-actions">
                  {proposal.turn.actions.map((action, index) => (
                    <button
                      key={index}
                      className="secondary-button"
                      disabled={busy || !!learning.externalRevision}
                      onClick={() => useAction(action)}
                    >
                      {action.type === 'ear' ? (
                        {
                          replay: 'Replay the fragment',
                          analyze: 'Start local analysis',
                          draft: 'Reveal draft',
                          compare: 'Compare my proposal',
                          'compare-note': 'Hear my note proposal',
                          correct: 'Apply my draft correction',
                          question: 'Try an ear question',
                          workspace: 'Open accompaniment',
                        }[action.operation]
                      ) : action.type === 'live' ? (
                        'Prepare this guitar task'
                      ) : action.type === 'homework' ? (
                        action.operation === 'task' ? (
                          `Try ${action.kind} homework`
                        ) : (
                          `Compare ${action.family} family`
                        )
                      ) : action.type === 'practice' ? (
                        action.operation === 'strategy' ? (
                          'Consider this approach'
                        ) : action.operation === 'reflection' ? (
                          'Reflect on this attempt'
                        ) : (
                          `Try ${action.activity}`
                        )
                      ) : action.type === 'listening' ? (
                        {
                          question: 'Try a listening question',
                          replay: 'Replay selected passage',
                          tonic: 'Hear the tonic',
                          workspace: 'Explore on the neck',
                          bass: 'Compare synthesized bass',
                          transfer: 'Try a related passage in another key',
                        }[action.operation]
                      ) : action.type === 'question' ? (
                        'Try this question'
                      ) : action.type === 'preview' ? (
                        'Preview this voicing'
                      ) : action.type === 'highlight' ? (
                        'Show these notes'
                      ) : (
                        <>
                          <Volume2 size={15} />{' '}
                          {action.includeBass
                            ? 'Hear with the bass'
                            : action.omitRoot
                              ? 'Hear the upper shape alone'
                              : 'Hear this chord'}
                        </>
                      )}
                    </button>
                  ))}
                  {proposal.turn.source === 'forge' && (
                    <details className="teacher-trace">
                      <summary>How this response was checked</summary>
                      <p>
                        Music and actions are checked by the engine. The explanation also received a
                        model review; that review can miss errors.
                      </p>
                      <p>
                        {proposal.turn.versions.model} · review: {proposal.turn.review.status}
                      </p>
                      {proposal.turn.traceId && (
                        <p>
                          Agent Lens conversation <code>{proposal.turn.traceId}</code>
                        </p>
                      )}
                    </details>
                  )}
                </div>
              )}
              {markers.length > 0 && (
                <Fretboard
                  tuning={track.tuningMidi}
                  capo={track.capo}
                  markers={markers}
                  minFret={progression.options.minFret}
                  maxFret={progression.options.maxFret}
                  label="Teacher demonstration"
                  onChoose={(position) =>
                    props.onListen([
                      track.tuningMidi[position.string - 1]! + track.capo + position.fret,
                    ])
                  }
                />
              )}
              <form
                className="teacher-composer"
                onSubmit={(event) => {
                  event.preventDefault();
                  void send(draft);
                }}
              >
                <label htmlFor="teacher-message">Your question</label>
                <textarea
                  id="teacher-message"
                  rows={3}
                  maxLength={2000}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Why does that note work here? Show me a different position…"
                />
                <button
                  className="primary-button"
                  disabled={busy || !draft.trim() || !!learning.externalRevision}
                >
                  {busy ? 'Working with the music…' : cloud ? 'Ask teacher' : 'Ask on-device guide'}{' '}
                  <ArrowRight size={16} />
                </button>
                {busy && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      generation.current++;
                      activeRequest.current?.abort();
                      setBusy(false);
                      setNotice('Request cancelled.');
                    }}
                  >
                    Cancel
                  </button>
                )}
              </form>
              <details className="teacher-settings">
                <summary>Lesson context and cloud access</summary>
                <label>
                  Backing bass track
                  <select value={bassTrack} onChange={(event) => setBassTrack(event.target.value)}>
                    <option value="">No established backing bass</option>
                    {score.tracks
                      .filter((item) => item.id !== track.id && !item.isPercussion)
                      .map((item) => (
                        <option value={item.id} key={item.id}>
                          {item.name}
                        </option>
                      ))}
                  </select>
                </label>
                <p className="caption">
                  Only notes that sustain through the selected chord are supplied as bass context. A
                  rootless guitar shape alone does not establish a bass note.
                </p>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={cloud}
                    onChange={(event) => setCloud(event.target.checked)}
                  />{' '}
                  Use the experimental Forge teacher
                </label>
                <p className="caption">
                  Experimental teacher · qualification: {qualification}. Validated tools and factual
                  review remain active.
                </p>
                <p className="caption">
                  Cloud teaching sends your question, recent conversation, selected normalized
                  music, chosen goal and strategy, optional reflection, and recent answer summaries,
                  including experimental live-input summaries, to the application server and Forge.
                  Ear lessons send bounded hypotheses, their authority and opaque job references.
                  Raw audio, estimated stems, filenames, device names, your file, song metadata and
                  full practice history stay local. Configured traces record approved lifecycle
                  metadata. Use your invitation in Practice guide. Data contribution for training is
                  separate and is not enabled.
                </p>
              </details>
            </>
          )}
          {notice && (
            <p className="caption" role="status">
              {notice}
            </p>
          )}
          {learning.storageWarning && (
            <p className="teacher-storage-warning" role="status">
              {learning.storageWarning} Use Export progress in Settings.
            </p>
          )}
          <p className="teacher-evidence-note">
            Screen answers, detected pitch and self-reported playing are separate. The teacher
            receives bounded musical evidence, not raw audio or verified fingering.
          </p>
        </>
      )}
    </section>
  );
}
