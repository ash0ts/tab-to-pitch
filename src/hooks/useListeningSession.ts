import { useEffect, useRef, useState } from 'react';
import type { useLessonSession } from './useLessonSession';
import { catalogSourceId, type Passage } from '../songs/catalog';
import {
  createListeningExercise,
  gradeListening,
  type ListeningDifficulty,
  type ListeningExercise,
  type ListeningAttempt,
} from '../songs/listening';
import { playback } from '../player/PlaybackCoordinator';
import { getMemoryLessonData } from '../storage';

export type LearningSession = ReturnType<typeof useLessonSession>;
export function useListeningSession(
  passage: Passage | undefined,
  learning: LearningSession,
  onMask: (masked: boolean) => void,
  contextVersion: string,
  initialDifficulty: ListeningDifficulty = 'guided',
) {
  const [exercise, setExercise] = useState<ListeningExercise | null>(null);
  const [difficulty, setDifficulty] = useState<ListeningDifficulty>(initialDifficulty);
  const [source, setSource] = useState<'recording' | 'synthesized'>('synthesized');
  const [assisted, setAssisted] = useState(false),
    [outcome, setOutcome] = useState<ListeningAttempt | null>(null);
  const [recordingCommand, setRecordingCommand] = useState(0);
  const [familiar, setFamiliar] = useState(false),
    [revision, setRevision] = useState(0);
  const current = useRef<{
    exercise: ListeningExercise;
    started: number;
    assisted: boolean;
    replays: number;
    complete: boolean;
  } | null>(null);
  const callbacks = useRef({ learning, onMask });
  callbacks.current = { learning, onMask };
  const active = !!exercise && !outcome;
  const masked = active && !assisted;
  function observe(
    kind: 'listening-replay' | 'listening-assistance' | 'source-changed',
    detail: string,
  ) {
    learning.record(
      {},
      [],
      [{ kind, detail, exposureKeys: [], exerciseId: current.current?.exercise.id }],
    );
    setRevision((r) => r + 1);
  }
  function finish(kind: ListeningAttempt['outcome'], response: string[] = []) {
    const c = current.current;
    if (!c || c.complete) return;
    c.complete = true;
    const attempt: ListeningAttempt = {
      id: crypto.randomUUID(),
      exerciseId: c.exercise.id,
      at: Date.now(),
      response,
      outcome: kind,
      assisted: c.assisted || kind === 'revealed',
      replayCount: c.replays,
      responseMs: Math.max(0, Date.now() - c.started),
      familiar,
      source: c.exercise.source,
      grade: kind === 'answered' ? gradeListening(c.exercise, response) : null,
    };
    callbacks.current.learning.record(
      { pendingTaskId: null },
      [],
      [
        {
          kind: kind === 'interrupted' ? 'interrupted' : 'listening-response',
          exerciseId: c.exercise.id,
          attemptId: attempt.id,
          exposureKeys: kind === 'interrupted' ? [] : [`harmony:${c.exercise.passage.id}`],
          detail: `${kind}; ${attempt.assisted ? 'assisted' : 'unassisted'}; ${attempt.source}`,
        },
      ],
      [],
      [],
      [attempt],
    );
    setOutcome(attempt);
    callbacks.current.onMask(false);
    setRevision((r) => r + 1);
  }
  const finishRef = useRef(finish);
  finishRef.current = finish;
  useEffect(() => {
    const hide = () => {
      if (document.hidden) {
        playback.stopAll();
        finishRef.current('interrupted');
      }
    };
    document.addEventListener('visibilitychange', hide);
    return () => {
      finishRef.current('interrupted');
      callbacks.current.onMask(false);
      document.removeEventListener('visibilitychange', hide);
    };
  }, []);
  useEffect(() => {
    if (learning.externalRevision) finishRef.current('interrupted');
  }, [learning.externalRevision]);
  const previousContext = useRef(contextVersion);
  useEffect(() => {
    if (previousContext.current !== contextVersion) finishRef.current('interrupted');
    previousContext.current = contextVersion;
  }, [contextVersion]);
  const replayRef = useRef(() => {});
  replayRef.current = replay;
  useEffect(
    () =>
      playback.observe((player, identity) => {
        if (
          player === 'score' &&
          source === 'synthesized' &&
          passage &&
          identity === catalogSourceId(passage)
        )
          replayRef.current();
      }),
    [source, passage?.id],
  );
  function begin(level = difficulty) {
    if (!passage || !learning.lesson || learning.externalRevision) return;
    finish('interrupted');
    playback.stopAll();
    const previous = getMemoryLessonData().listeningAttempts.filter((a) =>
      a.exerciseId.includes(`:${passage.id}:`),
    );
    const next = createListeningExercise(passage, level, source, previous.length);
    current.current = {
      exercise: next,
      started: Date.now(),
      assisted: false,
      replays: 0,
      complete: false,
    };
    setExercise(next);
    setDifficulty(level);
    setAssisted(false);
    setOutcome(null);
    onMask(true);
    setRevision((r) => r + 1);
    learning.record(
      { objective: 'listening', pendingTaskId: next.id },
      [],
      [{ kind: 'task-started', exerciseId: next.id, exposureKeys: [] }],
      [],
      [next],
    );
  }
  function assist(reason = 'Teacher help requested before the first answer.') {
    if (current.current && !current.current.complete) {
      current.current.assisted = true;
      setAssisted(true);
      onMask(false);
      observe('listening-assistance', reason);
    }
  }
  function replay() {
    if (current.current && !current.current.complete) current.current.replays++;
    observe('listening-replay', `Playback started: ${source}.`);
  }
  function changeSource(next: typeof source) {
    finish('interrupted');
    playback.stopAll();
    setSource(next);
    setExercise(null);
    setOutcome(null);
    onMask(false);
    observe('source-changed', next);
  }
  return {
    recordingCommand,
    requestRecording: () => setRecordingCommand((c) => c + 1),
    passage,
    exercise,
    difficulty,
    setDifficulty,
    source,
    changeSource,
    assisted,
    active,
    masked,
    outcome,
    familiar,
    setFamiliar,
    revision,
    begin,
    assist,
    replay,
    answer: (answers: string[]) => finish('answered', answers),
    reveal: () => finish('revealed'),
    interrupt: () => finish('interrupted'),
    recent: getMemoryLessonData()
      .listeningAttempts.filter((a) => a.exerciseId.includes(`:${passage?.id}:`))
      .slice(-8),
  };
}
export type ListeningSession = ReturnType<typeof useListeningSession>;
