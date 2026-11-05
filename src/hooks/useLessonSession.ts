import type { ListeningExercise, ListeningAttempt } from '../songs/listening';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CURRICULUM_VERSION } from '../shared/teacher';
import {
  getLessonData,
  cacheLessonSession,
  getLessonWriteGeneration,
  getMemoryLessonData,
  saveLessonSession,
  LESSON_WRITER_ID,
} from '../storage';
import type {
  FrozenExercise,
  LessonEvent,
  LessonMessage,
  LessonObjective,
  LessonSession,
} from '../lesson-storage';

export function useLessonSession(
  sourceHash: string,
  trackId: string,
  contextVersion: string,
  source?: LessonSession['source'],
) {
  const [lesson, setLesson] = useState<LessonSession | null>(null);
  const [events, setEvents] = useState<LessonEvent[]>([]);
  const [storageWarning, setStorageWarning] = useState('');
  const [externalRevision, setExternalRevision] = useState(0);
  const [legacyExposure, setLegacyExposure] = useState(false);
  const current = useRef<LessonSession | null>(null);
  const eventRef = useRef<LessonEvent[]>([]);
  const versions = useRef(contextVersion);
  versions.current = contextVersion;
  const writes = useRef(Promise.resolve());
  const writeGeneration = useRef(getLessonWriteGeneration());

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel('tabtopitch-lessons');
    channel.onmessage = (event: MessageEvent<unknown>) => {
      const value = event.data as {
        writerId?: unknown;
        lessonId?: unknown;
        deleted?: unknown;
      } | null;
      if (
        !value ||
        value.writerId === LESSON_WRITER_ID ||
        (!value.deleted && value.lessonId !== current.current?.id)
      )
        return;
      setExternalRevision((revision) => revision + 1);
      setStorageWarning(
        'This lesson changed in another tab. Reload before requesting another teaching step; your current work remains exportable.',
      );
    };
    return () => channel.close();
  }, []);

  useEffect(() => {
    let active = true;
    void getLessonData()
      .catch(() => {
        if (active)
          setStorageWarning(
            'Teaching history is kept in memory. Export progress before closing this tab.',
          );
        return getMemoryLessonData();
      })
      .then((data) => {
        if (!active) return;
        writeGeneration.current = getLessonWriteGeneration();
        setLegacyExposure(
          data.lessons.some(
            (item) =>
              item.sourceHash === sourceHash &&
              item.trackId === trackId &&
              item.curriculumVersion !== CURRICULUM_VERSION,
          ),
        );
        const saved = data.lessons
          .filter(
            (item) =>
              item.sourceHash === sourceHash &&
              item.trackId === trackId &&
              item.curriculumVersion === CURRICULUM_VERSION,
          )
          .sort((a, b) => b.updatedAt - a.updatedAt)[0];
        const now = Date.now();
        const next: LessonSession = saved
          ? { ...saved, pendingTaskId: null }
          : {
              id: crypto.randomUUID(),
              schemaVersion: 2,
              source,
              curriculumVersion: CURRICULUM_VERSION,
              sourceHash,
              trackId,
              objective: source?.kind === 'catalog-passage' ? 'listening' : 'foundations',
              contextVersion: versions.current,
              revision: 0,
              createdAt: now,
              updatedAt: now,
              status: 'active',
              messages: [],
              pendingTaskId: null,
            };
        // A previous question is not resumed as an untouched first response after reload.
        const interruptions: LessonEvent[] = saved?.pendingTaskId
          ? [
              {
                id: crypto.randomUUID(),
                lessonId: next.id,
                at: now,
                contextVersion: versions.current,
                kind: 'interrupted',
                exerciseId: saved.pendingTaskId,
                exposureKeys: [],
                detail: 'The page reloaded before the question was completed.',
              },
            ]
          : [];
        if (interruptions.length) {
          next.revision++;
          next.updatedAt = now;
          writes.current = writes.current
            .then(() => saveLessonSession(next, interruptions, [], writeGeneration.current))
            .catch(() => {
              if (active)
                setStorageWarning(
                  'Teaching history is kept in memory. Export progress before closing this tab.',
                );
            });
        }
        current.current = next;
        eventRef.current = [
          ...data.lessonEvents.filter((event) => event.lessonId === next.id),
          ...interruptions,
        ];
        setEvents(eventRef.current);
        setLesson(next);
      });
    return () => {
      active = false;
    };
  }, [sourceHash, trackId]);

  const persistedRevision = useRef(-1);
  const record = useCallback(
    (
      patch: Partial<Pick<LessonSession, 'objective' | 'status' | 'pendingTaskId' | 'practice' | 'homework' | 'live' | 'ear' | 'source'>>,
      additions: LessonMessage[] = [],
      observations: Omit<LessonEvent, 'id' | 'lessonId' | 'at' | 'contextVersion'>[] = [],
      definitions: FrozenExercise[] = [],
      listeningExercises: ListeningExercise[] = [],
      listeningAttempts: ListeningAttempt[] = [],
    ) => {
      const before = current.current;
      if (
        !before ||
        before.sourceHash !== sourceHash ||
        before.trackId !== trackId ||
        externalRevision
      )
        return;
      const now = Date.now();
      const next: LessonSession = {
        ...before,
        ...patch,
        messages: [...before.messages, ...additions],
        revision: before.revision + 1,
        contextVersion: versions.current,
        updatedAt: now,
      };
      const appended = observations.map((event) => ({
        ...event,
        id: crypto.randomUUID(),
        lessonId: next.id,
        at: now,
        contextVersion: versions.current,
      }));
      cacheLessonSession(next, appended, definitions, listeningExercises, listeningAttempts);
      current.current = next;
      eventRef.current = [...eventRef.current, ...appended];
      setLesson(next);
      setEvents(eventRef.current);
      writes.current = writes.current
        .then(async () => {
          await saveLessonSession(
            next,
            appended,
            definitions,
            writeGeneration.current,
            listeningExercises,
            listeningAttempts,
          );
          persistedRevision.current = next.revision;
        })
        .catch(() => {
          setStorageWarning(
            'Teaching history is kept in memory. Export progress before closing this tab.',
          );
        });
      return next;
    },
    [sourceHash, trackId, externalRevision],
  );

  const changeObjective = useCallback(
    (objective: LessonObjective) => {
      record(
        { objective, pendingTaskId: null },
        [],
        [{ kind: 'objective-changed', exposureKeys: [] }],
      );
    },
    [record],
  );

  return {
    flush: async () => {
      await writes.current;
      return persistedRevision.current >= (current.current?.revision ?? 0);
    },
    lesson,
    events,
    record,
    changeObjective,
    storageWarning,
    externalRevision,
    legacyExposure,
  };
}
