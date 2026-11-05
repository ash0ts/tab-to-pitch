import { useEffect, useRef, useState } from 'react';
import type { useLessonSession } from './useLessonSession';
import { LiveInputController, type InputOptions } from '../live/LiveInputController';
import { assessPerformance } from '../live/assessment';
import {
  LIVE_VERSION,
  performanceAttemptSchema,
  type LiveAssessmentContract,
  type LiveInputSession,
  type PerformanceObservation,
  type PerformanceAttempt,
  type LiveContext,
  type LiveAction,
} from '../shared/live-guitar';

type Running = {
  task: LiveAssessmentContract;
  episodeId: string;
  responseIndex: number;
  inputSessionId: string;
  provider: PerformanceAttempt['provider'];
  inputConfiguration: LiveInputSession;
  startedAt: number;
  supports: PerformanceAttempt['supports'];
  observations: PerformanceObservation[];
};
export function useLiveGuitar(
  learning: ReturnType<typeof useLessonSession>,
  contextVersion: string,
  tasks: LiveAssessmentContract[],
  blocked: boolean,
) {
  const [input, setInput] = useState<LiveInputSession | null>(null);
  const [observation, setObservation] = useState<PerformanceObservation | null>(null);
  const [error, setError] = useState('');
  const [active, setActive] = useState(false);
  const [assisted, setAssisted] = useState(false);
  const [result, setResult] = useState<PerformanceAttempt | null>(null);
  const [revision, setRevision] = useState(0);
  const [taskId, setTaskId] = useState('live-note');
  const resumedLesson = useRef<string | null>(null);
  useEffect(() => {
    const saved = learning.lesson;
    if (saved && resumedLesson.current !== saved.id) {
      resumedLesson.current = saved.id;
      if (saved.live) {
        setTaskId(saved.live.task.id);
        const bookmark = saved.live;
        if (bookmark.pending) {
          const attempt = performanceAttemptSchema.parse({
            version: LIVE_VERSION,
            id: crypto.randomUUID(),
            episodeId: bookmark.episodeId,
            task: bookmark.task,
            ...bookmark.pending,
            finishedAt: Date.now(),
            responseIndex: Math.max(0, bookmark.responseIndex - 1),
            assisted: true,
            supports: [],
            observations: [],
            outcome: 'interrupted',
            reason: 'The page closed before this response was committed. No answer was graded.',
            qualification: 'experimental',
            evidence: 'detected-audio',
            timingGraded: false,
            positionVerified: false,
          });
          learning.record(
            {
              live: {
                task: bookmark.task,
                episodeId: bookmark.episodeId,
                responseIndex: bookmark.responseIndex,
              },
            },
            [],
            [
              {
                kind: 'live-response',
                exposureKeys: [],
                live: { attempt, taskId: bookmark.task.id },
              },
            ],
          );
        }
      }
    }
  }, [learning.lesson]);
  const armedAfter = useRef(0);
  const running = useRef<Running | null>(null),
    lastObservation = useRef<PerformanceObservation | null>(null);
  const controller = useRef<LiveInputController | null>(null);
  const inputRef = useRef(input);
  inputRef.current = input;
  const current = useRef({ learning, contextVersion, tasks, blocked });
  current.current = { learning, contextVersion, tasks, blocked };
  const attempts = learning.events.flatMap((e) => (e.live?.attempt ? [e.live.attempt] : []));
  const task = tasks.find((t) => t.id === taskId) ?? tasks[0]!;
  function finish(interrupted = false) {
    const run = running.current;
    if (!run) return;
    running.current = null;
    setActive(false);
    const latest = current.current;
    const graded = interrupted
      ? {
          outcome: 'interrupted' as const,
          reason: 'The input or lesson changed. This attempt was interrupted, not incorrect.',
        }
      : assessPerformance(run.task, run.observations, latest.contextVersion);
    const attempt = performanceAttemptSchema.parse({
      version: LIVE_VERSION,
      id: crypto.randomUUID(),
      ...run,
      finishedAt: Date.now(),
      assisted: run.supports.length > 0 || run.responseIndex > 0,
      ...graded,
      qualification: 'experimental',
      evidence: 'detected-audio',
      timingGraded: false,
      positionVerified: false,
    });
    const saved = latest.learning.record(
      { live: { task: run.task, episodeId: run.episodeId, responseIndex: run.responseIndex + 1 } },
      [],
      [{ kind: 'live-response', exposureKeys: [], live: { attempt, taskId: run.task.id } }],
    );
    if (!saved) {
      setError('This lesson changed in another view. The live attempt was not saved.');
      return;
    }
    setResult(attempt);
    setRevision((n) => n + 1);
    return attempt;
  }
  const finishRef = useRef(finish);
  finishRef.current = finish;
  useEffect(() => {
    const instance = new LiveInputController({
      state: (s) => {
        inputRef.current = s;
        setInput(s);
        setRevision((n) => n + 1);
      },
      error: setError,
      interrupted: () => finishRef.current(true),
      observation: (o) => {
        lastObservation.current = o;
        const run = running.current;
        if (
          !run ||
          o.sessionId !== run.inputSessionId ||
          (o.stable && o.attackId <= armedAfter.current)
        )
          return;
        // Freeze the first stable response for each attack, plus changed fault states.
        const last = run.observations.at(-1);
        if (
          (o.stable &&
            !run.observations.some((old) => old.stable && old.attackId === o.attackId)) ||
          (!o.stable &&
            (JSON.stringify(last?.problems) !== JSON.stringify(o.problems) ||
              (o.problems.some((p) => p === 'ambiguous' || p === 'weak-signal') &&
                o.captureMs - (last?.captureMs ?? 0) >= 100)))
        ) {
          if (run.observations.length >= 255) {
            finishRef.current(true);
            return;
          }
          run.observations.push(o);
        }
      },
    });
    controller.current = instance;
    const timer = setInterval(() => setObservation(lastObservation.current), 100);
    return () => {
      clearInterval(timer);
      instance.dispose();
      controller.current = null;
    };
  }, []);
  useEffect(() => {
    finishRef.current(true);
    setResult(null);
  }, [contextVersion, learning.lesson?.id, blocked, learning.externalRevision]);
  function select(id: string) {
    finish(true);
    setTaskId(id);
    setResult(null);
    setRevision((n) => n + 1);
  }
  function start(options: InputOptions) {
    finish(true);
    setError('');
    lastObservation.current = null;
    setObservation(null);
    void controller.current?.start(options);
  }
  function stop() {
    finish(true);
    controller.current?.stop();
    lastObservation.current = null;
    setObservation(null);
  }
  function begin(reservation?: { episodeId: string; responseIndex: number; assisted: boolean }) {
    if (
      blocked ||
      !learning.lesson ||
      learning.externalRevision ||
      inputRef.current?.status !== 'listening' ||
      running.current
    )
      return;
    const previous = learning.lesson.live;
    const same = previous?.task.id === task.id && previous.task.sourceRevision === contextVersion;
    const bookmark = {
      task: structuredClone(task),
      episodeId: reservation?.episodeId ?? (same ? previous.episodeId : crypto.randomUUID()),
      responseIndex: reservation?.responseIndex ?? (same ? previous.responseIndex : 0),
    };
    const pending = {
      inputSessionId: inputRef.current.id,
      provider: inputRef.current.provider,
      inputConfiguration: structuredClone(inputRef.current),
      startedAt: Date.now(),
    };
    if (
      !learning.record(
        { live: { ...bookmark, responseIndex: bookmark.responseIndex + 1, pending } },
        [],
        [{ kind: 'live-started', exposureKeys: [], live: { taskId: task.id } }],
      )
    )
      return;
    armedAfter.current = lastObservation.current?.attackId ?? 0;
    running.current = {
      ...bookmark,
      ...pending,
      supports: reservation?.assisted ? ['example'] : [],
      observations: [],
    };
    setActive(true);
    setAssisted(!!reservation?.assisted);
    setResult(null);
    setRevision((n) => n + 1);
    return true;
  }
  function help(kind: PerformanceAttempt['supports'][number]) {
    const run = running.current;
    if (!run || run.supports.length >= 32) return false;
    if (
      !learning.record(
        {},
        [],
        [{ kind: 'live-support', exposureKeys: [], live: { taskId: run.task.id, support: kind } }],
      )
    )
      return false;
    run.supports.push(kind);
    setAssisted(true);
    setRevision((n) => n + 1);
    return true;
  }
  const context: LiveContext = {
    capability: LIVE_VERSION,
    revision,
    ready: input?.status === 'listening',
    active,
    assisted,
    qualification: 'experimental',
    eligible: blocked || active ? [] : tasks.map((t) => ({ id: t.id, label: t.prompt })),
    evidence: attempts.slice(-8).map((a) => ({
      id: a.id,
      outcome: a.outcome,
      kind: a.task.kind,
      assisted: a.assisted,
      firstResponse: a.responseIndex === 0,
      provider: a.provider,
      qualification: a.qualification,
      taskPrompt: a.task.prompt,
      detectedChords: a.observations
        .filter((o) => o.stable && !o.problems.length)
        .flatMap((o) => o.chords)
        .slice(0, 8),
      detectedPitches: a.observations
        .filter((o) => o.stable && !o.problems.length)
        .flatMap((o) => o.pitches)
        .slice(0, 32),
      problems: [...new Set(a.observations.flatMap((o) => o.problems))].slice(0, 8),
    })),
  };
  function apply(action: LiveAction) {
    if (!blocked && !active && tasks.some((t) => t.id === action.taskId)) select(action.taskId);
  }
  return {
    input,
    observation,
    error,
    active,
    masked: active && !assisted,
    assisted,
    result,
    revision,
    task,
    taskId,
    tasks,
    attempts,
    context,
    select,
    start,
    stop,
    begin,
    finish,
    help,
    apply,
  };
}
export type LiveGuitarSession = ReturnType<typeof useLiveGuitar>;
