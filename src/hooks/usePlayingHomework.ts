import { useEffect, useRef, useState } from 'react';
import type { HomeworkSession } from './useHomeworkSession';
import type { LiveGuitarSession } from './useLiveGuitar';
import type { LearningSession } from './useListeningSession';
import {
  PLAYING_VERSION,
  type PlayingAction,
  type PlayingEvent,
  type PlayingState,
} from '../shared/homework-playing';
import type { PerformanceAttempt } from '../shared/live-guitar';

/** Orchestration only: homework owns the bookmark; existing lesson events own evidence. */
export function usePlayingHomework(
  h: HomeworkSession,
  learning: LearningSession,
  guitar: LiveGuitarSession,
  visible: boolean,
) {
  const state = h.state?.playing;
  const [saving, setSaving] = useState(false);
  const [durable, setDurable] = useState(false);
  useEffect(() => {
    if (!state) return;
    let current = true;
    setSaving(true);
    void learning.flush().then((saved) => {
      if (current) {
        setSaving(false);
        setDurable(saved);
      }
    });
    return () => {
      current = false;
    };
  }, [learning.lesson?.revision]);
  useEffect(() => {
    if (!saving) return;
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [saving]);
  const current = useRef(state);
  current.current = state;
  const step = state?.steps[state.index];
  const events = learning.events.flatMap((e) => (e.playing ? [{ ...e.playing, id: e.id }] : []));
  const event = (
    s: PlayingState,
    kind: PlayingEvent['kind'],
    extra: Partial<PlayingEvent> = {},
  ): PlayingEvent => ({
    stepId: s.steps[s.index]!.id,
    episodeId: s.episodeId,
    responseIndex: s.responseIndex,
    sourceRevision: s.steps[s.index]!.sourceRevision,
    method: s.method,
    kind,
    assisted: s.labels || !!s.support.length || s.responseIndex > 0,
    ...extra,
  });
  function save(s: PlayingState, observation?: PlayingEvent) {
    if (h.updatePlaying(s, observation)) {
      setSaving(true);
      setDurable(false);
      current.current = s;
      return true;
    }
    return false;
  }
  function link(attempt: PerformanceAttempt) {
    const s = current.current;
    if (!s || s.episodeId !== attempt.episodeId || s.attemptIds.includes(attempt.id)) return;
    save(
      {
        ...s,
        status: attempt.outcome === 'interrupted' ? 'paused' : 'feedback',
        startedAt: null,
        responseIndex: Math.max(s.responseIndex, attempt.responseIndex + 1),
        attemptIds: [...s.attemptIds, attempt.id].slice(-200),
      },
      event(s, 'performance-reference', {
        responseIndex: attempt.responseIndex,
        performanceAttemptId: attempt.id,
        assisted: attempt.assisted,
      }),
    );
  }
  function interrupt() {
    const s = current.current;
    if (!s || s.status !== 'playing') return;
    const result = guitar.finish(true);
    if (result) link(result);
    else
      save(
        { ...s, status: 'paused', startedAt: null, responseIndex: s.responseIndex + 1 },
        event(s, 'interrupted'),
      );
  }
  const firstMount = useRef<string | null>(null);
  useEffect(() => {
    const id = h.state?.id;
    if (id && firstMount.current !== id) {
      firstMount.current = id;
      // A reload never reopens capture or replaces a previously reserved response.
      if (
        state?.status === 'playing' &&
        !(state.method === 'live' && learning.lesson?.live?.pending)
      )
        interrupt();
    }
  }, [h.state?.id]);
  useEffect(() => {
    if (!visible || !h.fresh) {
      interrupt();
      guitar.stop();
    }
  }, [visible, h.fresh]);
  useEffect(() => {
    const s = current.current;
    const completed =
      guitar.result ??
      guitar.attempts.findLast(
        (a) => a.episodeId === s?.episodeId && a.responseIndex === s?.responseIndex,
      );
    if (completed) link(completed);
  }, [guitar.result?.id, guitar.attempts.length]);
  function begin() {
    const s = current.current;
    if (!s || !h.fresh || s.status === 'playing' || !visible) return false;
    if (
      s.method === 'live' &&
      !guitar.begin({
        episodeId: s.episodeId,
        responseIndex: s.responseIndex,
        assisted: s.labels || !!s.support.length || s.responseIndex > 0,
      })
    )
      return false;
    return save({ ...s, status: 'playing', startedAt: Date.now() }, event(s, 'started'));
  }
  function finish(report?: PlayingEvent['selfReport']) {
    const s = current.current;
    if (!s || s.status !== 'playing') return false;
    if (s.method === 'live') {
      const a = guitar.finish();
      if (a) link(a);
      return !!a;
    }
    if (!report) return false;
    return save(
      { ...s, status: 'feedback', startedAt: null, responseIndex: s.responseIndex + 1 },
      event(s, 'self-report', { selfReport: report }),
    );
  }
  function help(kind: NonNullable<PlayingEvent['support']>) {
    const s = current.current;
    if (!s || s.support.length >= 32) return false;
    if (
      !save(
        { ...s, support: [...s.support, kind] },
        event(s, 'support', { support: kind, assisted: true }),
      )
    )
      return false;
    if (guitar.active) guitar.help(kind === 'labels' ? 'answer' : kind);
    return true;
  }
  function change(
    patch: Partial<
      Pick<PlayingState, 'method' | 'labels' | 'countIn' | 'responseMeasures' | 'restMeasures'>
    >,
  ) {
    interrupt();
    const s = current.current;
    if (!s) return;
    if (patch.labels && !s.labels && !help('labels')) return;
    if (patch.method && patch.method !== s.method) guitar.stop();
    save({ ...current.current!, ...patch, status: 'ready' });
  }
  function expose(keys: string[]) {
    const known = new Set(learning.events.flatMap((e) => e.exposureKeys));
    const unseen = keys.filter((k) => !known.has(k));
    if (unseen.length) learning.record({}, [], [{ kind: 'exposure', exposureKeys: unseen }]);
  }
  function select(index: number) {
    interrupt();
    guitar.stop();
    const s = current.current;
    if (!s || index < 0 || index >= s.steps.length || index === s.index) return;
    const previous = events
      .filter(
        (e) =>
          e.stepId === s.steps[index]!.id &&
          ['self-report', 'performance-reference', 'interrupted'].includes(e.kind),
      )
      .at(-1);
    save({
      ...s,
      index,
      method: 'self-report',
      status: 'ready',
      episodeId: previous?.episodeId ?? crypto.randomUUID(),
      responseIndex: previous ? previous.responseIndex + 1 : 0,
      startedAt: null,
      support: [],
      attemptIds: [],
    });
  }
  function apply(action: PlayingAction) {
    const s = current.current;
    if (!s || !h.fresh || s.status === 'playing') return;
    const index = s.steps.findIndex((x) => x.id === action.stepId);
    if (index < 0) return;
    if (action.operation === 'select') select(index);
    else if (index === s.index && action.operation === 'retry') save({ ...s, status: 'ready' });
    else if (index === s.index && s.steps[index]!.progression.length > 2 && s.steps.length < 20) {
      const original = s.steps[index]!;
      const isolated = {
        ...original,
        id: `${original.id}:change`,
        stimulusId: `${original.stimulusId}:change`,
        title: `Isolate ${original.progression[0]!.symbol} → ${original.progression[1]!.symbol}`,
        progression: original.progression.slice(0, 2),
      };
      const existing = s.steps.findIndex((t) => t.id === isolated.id);
      if (existing >= 0) select(existing);
      else
        save({
          ...s,
          steps: [...s.steps, isolated],
          index: s.steps.length,
          status: 'ready',
          episodeId: crypto.randomUUID(),
          responseIndex: 0,
          support: [],
          attemptIds: [],
        });
    }
  }
  const relevant = events.filter((e) => e.stepId === step?.id);
  return {
    state,
    step,
    saving,
    durable,
    events: relevant,
    sessionEvents: learning.events.flatMap((e) =>
      e.playing &&
      e.at >= (h.state?.createdAt ?? Infinity) &&
      state?.steps.some((s) => s.id === e.playing!.stepId)
        ? [{ ...e.playing, id: e.id }]
        : [],
    ),
    active: state?.status === 'playing',
    masked: state?.status === 'playing' && !state.labels && !state.support.length,
    begin,
    finish,
    interrupt,
    help,
    change,
    select,
    apply,
    expose,
    context:
      state && step
        ? {
            capability: PLAYING_VERSION as typeof PLAYING_VERSION,
            revision: learning.lesson?.revision ?? 0,
            active: state.status === 'playing',
            assisted: state.labels || !!state.support.length || state.responseIndex > 0,
            stepId: step.id,
            objective: step.objective,
            stimulus: step,
            method: state.method,
            eligible:
              state.status === 'playing'
                ? []
                : state.steps.map((x) => ({ id: x.id, title: x.title })),
            evidence: relevant.slice(-12).map(({ id: _id, ...e }) => e),
          }
        : undefined,
  };
}
export type PlayingHomeworkSession = ReturnType<typeof usePlayingHomework>;
