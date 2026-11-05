import { playback } from '../player/PlaybackCoordinator';
import { getMemoryLessonData } from '../storage';
import { useEffect, useRef, useState } from 'react';
import type { useLessonSession } from './useLessonSession';
import {
  emptyPractice,
  type ActivityKind,
  type PracticeState,
  type PracticeResponse,
  type SupportKind,
  type LearningEvidence,
  type PracticeAction,
} from '../shared/practice';
import {
  musicianshipTask,
  gradeMusicianship,
  studySoundKey,
  isReservedStudy,
  type TimedStudy,
} from '../engine/musicianship';
import type { LessonEvent } from '../lesson-storage';

type Observation = Omit<LessonEvent, 'id' | 'lessonId' | 'at' | 'contextVersion'>;
export function usePracticeSession(
  learning: ReturnType<typeof useLessonSession>,
  context: string,
  onStop: () => void,
) {
  const state = learning.lesson?.practice ?? emptyPractice();
  const current = useRef(state);
  current.current = state;
  const [feedback, setFeedback] = useState('');
  const [reflectionRequested, setReflectionRequested] = useState(false);
  const mountedLesson = useRef('');
  const audition = useRef<TimedStudy | null>(null);
  const recording = useRef(learning.record);
  recording.current = learning.record;
  useEffect(
    () =>
      playback.observe((player, identity) => {
        if (player !== 'score' || !identity.startsWith('musicianship-v1:')) return;
        recording.current(
          {},
          [],
          [
            {
              kind: 'exposure',
              exposureKeys: [
                identity,
                ...(audition.current?.id === identity ? [studySoundKey(audition.current)] : []),
              ],
              detail: 'Original study or learner proposal playback started.',
            },
          ],
        );
      }),
    [],
  );
  const exposures = new Set(
    [...getMemoryLessonData().lessonEvents, ...learning.events].flatMap(
      (event) => event.exposureKeys,
    ),
  );
  const evidence = learning.events.flatMap((event) =>
    event.practice?.evidence ? [event.practice.evidence] : [],
  );
  function commit(next: PracticeState, events: Observation[]) {
    const saved = learning.record({ practice: next }, [], events);
    if (!saved) return false;
    current.current = next;
    return true;
  }
  function interrupt(detail: string) {
    const before = current.current;
    const episode = before.episode;
    if (!episode || episode.status !== 'active') return;
    onStop();
    commit({ ...before, episode: { ...episode, status: 'interrupted' } }, [
      {
        kind: 'interrupted',
        exerciseId: episode.stimulusId,
        exposureKeys: [],
        detail,
        practice: { episodeId: episode.id },
      },
    ]);
  }
  useEffect(() => {
    if (!learning.lesson || mountedLesson.current === learning.lesson.id) return;
    mountedLesson.current = learning.lesson.id;
    // Resume the goal and bookmark, not a supposedly unexposed attempt.
    interrupt('The session resumed. The unfinished response is not a fresh assessment.');
  }, [learning.lesson?.id]);
  useEffect(() => {
    if (current.current.episode?.context !== context) interrupt('The musical selection changed.');
  }, [context]);
  const episode = state.episode;
  const task =
    episode && episode.context === context && episode.status !== 'interrupted'
      ? (episode.definition ?? musicianshipTask(episode.kind, episode.variant))
      : null;
  const heard =
    !!task &&
    learning.events.some(
      (e) =>
        e.kind === 'exposure' && e.at >= episode!.startedAt && e.exposureKeys.includes(task.id),
    );
  const heardComparison =
    !!task &&
    learning.events.some(
      (e) =>
        e.kind === 'exposure' &&
        e.at >= episode!.startedAt &&
        e.exposureKeys.includes(task.comparison.id),
    );
  const active = !!episode && episode.context === context && episode.status === 'active';
  function setGoal(wording: string, intent: PracticeState['intent']) {
    if (!wording.trim()) return;
    interrupt('The learner changed their goal.');
    commit(
      {
        ...current.current,
        intent,
        goal: {
          wording: wording.trim().slice(0, 500),
          target: wording.trim().slice(0, 500),
          context,
          chosenAt: Date.now(),
        },
        episode: null,
      },
      [{ kind: 'practice-goal', exposureKeys: [], detail: wording.slice(0, 500) }],
    );
    setFeedback('');
  }
  function strategy(approach: string, rationale: string, accepted: boolean | null) {
    commit(
      { ...current.current, strategy: { approach, rationale, accepted, proposedAt: Date.now() } },
      [
        {
          kind: 'practice-strategy',
          exposureKeys: [],
          detail: `${accepted === null ? 'Proposed' : accepted ? 'Accepted' : 'Declined'}: ${approach}`,
        },
      ],
    );
  }
  function begin(kind: ActivityKind, variant?: number, reserved = false) {
    const available = [0, 1, 2, 3].filter((index) =>
      isReservedStudy(musicianshipTask(kind, index), exposures),
    );
    const index = variant ?? available[0] ?? 0;
    const nextTask = musicianshipTask(kind, index);
    if (reserved && !available.includes(index)) {
      setFeedback(
        'This example has already been exposed. Choose practice or another reserved example.',
      );
      return;
    }
    interrupt('A different activity was selected.');
    const now = Date.now();
    const next: PracticeState = {
      ...current.current,
      episode: {
        definition: structuredClone(nextTask),
        id: crypto.randomUUID(),
        stimulusId: nextTask.id,
        kind,
        variant: index,
        context,
        startedAt: now,
        status: 'active',
        responseCount: 0,
        firstResponse: null,
        support: [],
        exposure: isReservedStudy(nextTask, exposures) ? 'reserved' : 'exposed',
        revealed: false,
      },
      bookmark: { activity: kind, at: now },
    };
    if (
      commit(next, [
        {
          kind: 'task-started',
          exerciseId: nextTask.id,
          exposureKeys: [nextTask.id],
          detail: 'Original study opened; subsequent checks cannot call it reserved.',
        },
      ])
    )
      setFeedback('');
  }
  function help(kind: SupportKind) {
    const before = current.current,
      ep = before.episode;
    if (!ep || ep.status !== 'active' || ep.context !== context || ep.support.length >= 32) return;
    // The synchronous memory checkpoint and event happen before React reveals the support.
    commit(
      {
        ...before,
        episode: {
          ...ep,
          support: [...ep.support, { kind, at: Date.now() }],
          revealed: ep.revealed || kind === 'answer',
        },
      },
      [
        {
          kind: 'practice-support',
          exerciseId: ep.stimulusId,
          exposureKeys: [],
          practice: { episodeId: ep.id, support: kind },
        },
      ],
    );
  }
  function answer(response: PracticeResponse) {
    const before = current.current,
      ep = before.episode;
    if (!ep || ep.status !== 'active' || ep.context !== context) return;
    const frozen = ep.definition ?? musicianshipTask(ep.kind, ep.variant);
    if (
      frozen.kind !== 'phrase' &&
      (!heard || (frozen.kind === 'expression' && !heardComparison))
    ) {
      setFeedback('Listen to the study before answering this listening question.');
      return;
    }
    const result = gradeMusicianship(frozen, response);
    const now = Date.now();
    const observation: LearningEvidence = {
      id: crypto.randomUUID(),
      episodeId: ep.id,
      stimulusId: ep.stimulusId,
      skill: frozen.skill,
      format: ep.kind === 'phrase' ? 'construction' : 'hearing',
      responseFormat:
        ep.kind === 'phrase' ? 'construction' : ep.kind === 'rhythm' ? 'recall' : 'recognition',
      outcome: result.correct ? 'correct' : 'incorrect',
      feedback: result.feedback,
      assisted: ep.support.length > 0 || ep.responseCount > 0,
      firstResponse: ep.responseCount === 0,
      familiarity: 'original',
      exposure: ep.exposure,
      delayDays: (() => {
        const prior = evidence.filter((e) => e.skill === frozen.skill && e.firstResponse).at(-1);
        return prior ? (now - prior.at) / 86400000 : null;
      })(),
      context,
      at: now,
    };
    const next: PracticeState = {
      ...before,
      episode: {
        ...ep,
        firstResponse: ep.firstResponse ?? result.response,
        responseCount: ep.responseCount + 1,
        status: result.correct ? 'completed' : 'active',
      },
      review: result.correct
        ? nextReview(
            before.review,
            frozen.skill,
            now,
            !observation.assisted && observation.firstResponse,
          )
        : before.review,
    };
    if (
      commit(next, [
        {
          kind: 'practice-response',
          exerciseId: ep.stimulusId,
          exposureKeys: [],
          practice: { episodeId: ep.id, response: result.response, evidence: observation },
        },
      ])
    )
      setFeedback(result.feedback);
  }
  function reflect(text: string, confidence: 'unsure' | 'partly' | 'ready' | null) {
    const now = Date.now();
    commit(
      {
        ...current.current,
        reflection: { text: text.slice(0, 1000), confidence, evidence: 'self-report', at: now },
        bookmark: { activity: current.current.episode?.kind ?? null, at: now },
      },
      [{ kind: 'practice-reflection', exposureKeys: [], detail: text.slice(0, 500) }],
    );
    setReflectionRequested(false);
  }
  function apply(action: PracticeAction) {
    if (action.operation === 'strategy') strategy(action.approach, action.rationale, null);
    else if (action.operation === 'activity')
      begin(action.activity, action.variant, action.assessment === 'reserved');
    else setReflectionRequested(true);
  }
  return {
    state,
    task,
    active,
    heard,
    heardComparison,
    masked: active && !episode?.revealed,
    feedback,
    evidence,
    reflectionRequested,
    prepareAudition: (study: TimedStudy) => {
      audition.current = study;
    },
    setGoal,
    strategy,
    begin,
    help,
    answer,
    reflect,
    apply,
    interrupt,
    reserved: (['rhythm', 'phrase', 'expression'] as const)
      .flatMap((kind) => [0, 1, 2, 3].map((v) => musicianshipTask(kind, v)))
      .filter((task) => isReservedStudy(task, exposures))
      .map((task) => task.id),
  };
}
export function nextReview(
  previous: PracticeState['review'],
  skill: string,
  now: number,
  independent: boolean,
): PracticeState['review'] {
  if (previous?.skill === skill && previous.dueAt > now) return previous;
  const intervalDays =
    independent && previous?.skill === skill ? (previous.intervalDays === 1 ? 3 : 7) : 1;
  return {
    dueAt: now + intervalDays * 86400000,
    intervalDays,
    policy: 'review-defaults-v1',
    skill,
  };
}
export type PracticeSession = ReturnType<typeof usePracticeSession>;
