import { playingPlan } from '../homework/planner';
import { PLAYING_VERSION, type PlayingState, type PlayingEvent } from '../shared/homework-playing';
import { useEffect, useRef, useState } from 'react';
import type { useLessonSession } from './useLessonSession';
import {
  HOMEWORK_VERSION,
  type HomeworkAssignment,
  type HomeworkObservation,
  type HomeworkResponse,
  type HomeworkSupport,
  type HomeworkKind,
  type HomeworkAction,
} from '../shared/homework';
import { gradeHomework } from '../engine/homework';
import { planHomeworkTasks } from '../engine/homework-planner';
import type { CagedFamily, NeckRegion } from '../engine/caged';
import type { LessonEvent } from '../lesson-storage';

export function useHomeworkSession(
  learning: ReturnType<typeof useLessonSession>,
  context: string,
  tuning: readonly number[],
  capo: number,
  onStop: () => void,
  setup: { symbol: string; symbols: string[]; region: NeckRegion },
) {
  const state = learning.lesson?.homework;
  const current = useRef(state);
  current.current = state;
  const [feedback, setFeedback] = useState('');
  const [minutes, setMinutes] = useState<5 | 15 | 30>(15);
  useEffect(() => {
    if (state) setMinutes(state.minutes);
  }, [state?.id]);
  const [family, setFamilyState] = useState<CagedFamily>('A');
  const [view, setViewState] = useState<'explore' | 'recall' | 'apply'>('explore');
  const observations = learning.events.flatMap((e) => (e.homework ? [e.homework] : []));
  const exposures = new Set(learning.events.flatMap((e) => e.exposureKeys));
  const task = state?.tasks[state.index];
  const fresh = state?.contextVersion === context;
  const active = !!state && state.status === 'active' && fresh && view === 'recall';
  const masked = active && !state?.support.includes('answer');
  const mounted = useRef('');
  const frozenIds = useRef(new Set<string>());
  learning.events.forEach((e) => {
    if (e.homeworkDefinition) frozenIds.current.add(e.homeworkDefinition.id);
  });
  function commit(
    next: HomeworkAssignment,
    observation?: HomeworkObservation,
    exposureKeys: string[] = [],
  ) {
    const events: Omit<LessonEvent, 'id' | 'at' | 'lessonId' | 'contextVersion'>[] = observation
      ? [{ kind: 'homework', exposureKeys, homework: observation }]
      : [];
    const newDefinitions = next.tasks.filter((t) => !frozenIds.current.has(t.id));
    events.push(
      ...newDefinitions.map((t) => ({
        kind: 'homework' as const,
        exposureKeys: [],
        homeworkDefinition: t,
      })),
    );
    const saved = learning.record({ homework: next }, [], events);
    if (saved) newDefinitions.forEach((t) => frozenIds.current.add(t.id));
    if (saved) current.current = next;
    return !!saved;
  }
  function event(
    kind: HomeworkObservation['kind'],
    extra: Partial<HomeworkObservation> = {},
  ): HomeworkObservation {
    const s = current.current!,
      t = s.tasks[s.index]!;
    return {
      kind,
      taskId: t.id,
      at: Date.now(),
      assisted: s.support.length > 0 || s.responses.length > 0,
      firstResponse: s.responses.length === 0,
      skill: t.kind,
      exposure: s.exposure,
      ...extra,
    };
  }
  function pause() {
    const s = current.current;
    if (s && s.status === 'active') {
      onStop();
      commit({ ...s, status: 'paused', updatedAt: Date.now() }, event('interrupted'));
    }
  }
  useEffect(() => {
    if (!learning.lesson || mounted.current === learning.lesson.id) return;
    mounted.current = learning.lesson.id;
    pause();
    setViewState('explore');
  }, [learning.lesson?.id]);
  useEffect(() => {
    if (current.current?.contextVersion !== context) pause();
  }, [context]);
  function begin(
    minutes: 5 | 15 | 30,
    region: NeckRegion,
    symbol: string,
    family: CagedFamily,
    kind?: HomeworkKind,
    exact = false,
  ) {
    if (!learning.lesson || learning.externalRevision) return;
    onStop();
    const tasks = planHomeworkTasks({
      minutes,
      region,
      symbol,
      symbols: setup.symbols,
      family,
      tuning,
      capo,
      kind,
      exact,
      history: observations,
      definitions: learning.events.flatMap((e) =>
        e.homeworkDefinition ? [e.homeworkDefinition] : [],
      ),
      now: Date.now(),
    });
    if (!tasks.length) {
      setFeedback(
        'No eligible task fits these constraints. Expand the region or choose note recall. Conventional CAGED requires standard string intervals.',
      );
      return;
    }
    const now = Date.now();
    const first = tasks[0]!;
    const exposure = learning.legacyExposure
      ? 'unknown'
      : first.exposureKeys.some((k) => exposures.has(k))
        ? 'exposed'
        : 'reserved';
    const next: HomeworkAssignment = {
      id: crypto.randomUUID(),
      version: HOMEWORK_VERSION,
      lessonId: learning.lesson.id,
      goal: `Find notes and use ${symbol} across the neck`,
      contextVersion: context,
      minutes,
      region,
      tasks,
      index: 0,
      support: [],
      responses: [],
      status: 'active',
      createdAt: now,
      updatedAt: now,
      dueAt: null,
      reviewDays: 1,
      reviewPolicy: 'review-defaults-v1',
      reflection: '',
      exposure,
    };
    if (commit(next)) {
      setFamilyState(first.family);
      setViewState('recall');
      setFeedback('');
      return true;
    }
    return false;
  }
  function help(kind: HomeworkSupport) {
    const s = current.current;
    if (!s || s.contextVersion !== context || s.support.length >= 32) return false;
    return commit(
      { ...s, support: [...s.support, kind], updatedAt: Date.now() },
      event('support', { support: kind, assisted: true }),
      s.tasks[s.index]!.exposureKeys,
    );
  }
  function answer(response: HomeworkResponse) {
    const s = current.current;
    if (
      !s ||
      s.status !== 'active' ||
      s.contextVersion !== context ||
      view !== 'recall' ||
      s.responses.length >= 100
    )
      return;
    const t = s.tasks[s.index]!;
    const graded = gradeHomework(t, response);
    const now = Date.now();
    const clean = graded.correct && !s.support.length && !s.responses.length;
    const prior = observations.filter(
      (e) =>
        e.taskId === t.id && e.kind === 'answer' && e.correct && !e.assisted && e.firstResponse,
    );
    const days = clean ? (prior.length >= 2 ? 7 : prior.length === 1 ? 3 : 1) : 1;
    if (
      commit(
        {
          ...s,
          responses: [...s.responses, structuredClone(graded.response)],
          updatedAt: now,
          dueAt: now + days * 86400000,
          reviewDays: days,
        },
        event('answer', { response: graded.response, correct: graded.correct }),
        t.exposureKeys,
      )
    )
      setFeedback(graded.feedback);
  }
  function next() {
    const s = current.current;
    if (!s || !fresh) return;
    const index = s.index + 1;
    if (index >= s.tasks.length) {
      commit({ ...s, status: 'completed', updatedAt: Date.now() });
      setFeedback('');
      setViewState('apply');
      return;
    }
    const next = s.tasks[index]!;
    commit({
      ...s,
      index,
      support: [],
      responses: [],
      updatedAt: Date.now(),
      exposure: learning.legacyExposure
        ? 'unknown'
        : next.exposureKeys.some((k) => exposures.has(k))
          ? 'exposed'
          : 'reserved',
    });
    setFamilyState(next.family);
    setViewState('recall');
    setFeedback('');
  }
  function resume() {
    const s = current.current;
    if (!s) return;
    if (s.tasks.some((t) => t.variant === null)) {
      setFeedback(
        'This earlier assignment is preserved as history. Start a new assignment to use the current grading contract.',
      );
      return;
    }
    if (!fresh) {
      setFeedback(
        'The music or constraints changed. Start a new assignment for this selection; your earlier responses remain saved.',
      );
      return;
    }
    if (
      commit(
        {
          ...s,
          status: 'active',
          support: [...s.support.slice(0, 31), 'cue'],
          exposure: 'exposed',
          updatedAt: Date.now(),
        },
        event('support', { support: 'cue', assisted: true }),
      )
    )
      setViewState('recall');
  }
  function setFamily(next: CagedFamily) {
    if (next === family) return;
    learning.record({});
    setFamilyState(next);
  }
  function setView(next: 'explore' | 'recall' | 'apply') {
    if (next !== view) setFeedback('');
    if (next !== 'recall' && active) help('answer');
    learning.record({});
    setViewState(next);
  }
  function expose(keys: string[]) {
    const s = current.current;
    if (keys.every((k) => exposures.has(k))) return;
    if (!s) {
      learning.record({}, [], [{ kind: 'exposure', exposureKeys: keys }]);
      return;
    }
    commit(
      { ...s, updatedAt: Date.now() },
      event('exposure', { assisted: true, firstResponse: false }),
      keys,
    );
  }
  function reflect(text: string) {
    const s = current.current;
    if (s) commit({ ...s, reflection: text.slice(0, 1000), updatedAt: Date.now() });
  }
  function updatePlaying(next: PlayingState, observation?: PlayingEvent) {
    const s = current.current;
    if (
      !s ||
      (s.contextVersion !== context && observation?.kind !== 'interrupted') ||
      learning.externalRevision
    )
      return false;
    const updated = { ...s, playing: next, updatedAt: Date.now() };
    const saved = learning.record(
      { homework: updated },
      [],
      observation ? [{ kind: 'homework-playing', exposureKeys: [], playing: observation }] : [],
    );
    if (saved) current.current = updated;
    return !!saved;
  }
  function startPlaying(
    workload: 5 | 15 | 30,
    harmony: { symbol: string; ticks: number; startTick?: number }[],
  ) {
    const steps = playingPlan(context, tuning, capo, setup.region, harmony, workload);
    if (!steps.length) return;
    if (!begin(workload, setup.region, setup.symbol, family) || !current.current) return;
    setViewState('explore');
    updatePlaying({
      version: PLAYING_VERSION,
      steps,
      index: 0,
      method: 'self-report',
      labels: true,
      countIn: true,
      responseMeasures: 1,
      restMeasures: 1,
      status: 'ready',
      episodeId: crypto.randomUUID(),
      responseIndex: 0,
      startedAt: null,
      support: [],
      attemptIds: [],
    });
  }
  function playing() {
    const s = current.current;
    if (s)
      commit(
        { ...s, updatedAt: Date.now() },
        event('playing', { assisted: true, firstResponse: false }),
      );
  }
  function apply(action: HomeworkAction) {
    const s = current.current;
    if (active && s && !s.support.length && !s.responses.length) return;
    pause();
    if (action.operation === 'compare') {
      setFamily(action.family);
      setView('explore');
    } else {
      setFamily(action.family);
      begin(minutes, setup.region, setup.symbol, action.family, action.kind);
    }
  }
  return {
    setup,
    updatePlaying,
    startPlaying,
    minutes,
    setMinutes,
    state,
    task,
    active,
    masked,
    view,
    family,
    setFamily,
    fresh,
    feedback,
    observations,
    begin,
    help,
    answer,
    next,
    pause,
    resume,
    setView,
    expose,
    reflect,
    playing,
    apply,
  };
}
export type HomeworkSession = ReturnType<typeof useHomeworkSession>;
