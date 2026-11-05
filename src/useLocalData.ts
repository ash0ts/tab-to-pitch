import { useCallback, useEffect, useRef, useState } from 'react';
import type { AttemptRecord } from './engine/types';
import {
  clearLocalData,
  deleteFile,
  getAttempts,
  importProgress,
  listLibrary,
  parseBackup,
  readSetting,
  saveAttempt,
  saveFile,
  writeSetting,
  type LibraryEntry,
} from './storage';

type StorageStatus = 'loading' | 'saving' | 'saved' | 'unavailable';

/** Owns local evidence, pending writes and the distinction between memory and disk. */
export function useLocalData(onError: (message: string) => void) {
  const [attempts, setAttempts] = useState<AttemptRecord[]>([]);
  const attemptsRef = useRef(attempts);
  const [library, setLibrary] = useState<LibraryEntry[]>([]);
  const [octaveRequired, setOctave] = useState(false);
  const [showOctaves, setShowOctavesState] = useState(false);
  const [exactLocation, setExactLocationState] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [storageStatus, setStorageStatus] = useState<StorageStatus>('loading');
  const pending = useRef(new Set<Promise<unknown>>());
  const hasUnsavedData = useRef(false);

  const mergeHistory = useCallback((stored: AttemptRecord[]) => {
    const merged = [
      ...new Map(
        [...stored, ...attemptsRef.current].map((attempt) => [attempt.id, attempt]),
      ).values(),
    ];
    attemptsRef.current = merged;
    setAttempts(merged);
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.allSettled([
      getAttempts(),
      listLibrary(),
      readSetting<unknown>('octaveRequired', false),
      readSetting<unknown>('showOctaves', false),
      readSetting<unknown>('exactLocation', false),
    ]).then(([history, files, octave, labels, location]) => {
      if (!active) return;
      if (history.status === 'fulfilled') mergeHistory(history.value);
      if (files.status === 'fulfilled') setLibrary(files.value);
      if (octave.status === 'fulfilled') setOctave(octave.value === true);
      if (labels.status === 'fulfilled') setShowOctavesState(labels.value === true);
      if (location.status === 'fulfilled') setExactLocationState(location.value === true);
      if (
        [history, files, octave, labels, location].some((result) => result.status === 'rejected')
      ) {
        hasUnsavedData.current = true;
        onError(
          'Browser storage is unavailable. You can still play and practice; export progress before leaving.',
        );
      }
      setStorageStatus(hasUnsavedData.current ? 'unavailable' : 'saved');
      setHydrated(true);
    });
    return () => {
      active = false;
    };
  }, [mergeHistory, onError]);

  const write = useCallback(
    async <T>(operation: () => Promise<T>, memoryChanged = true): Promise<T> => {
      const task = Promise.resolve().then(operation);
      pending.current.add(task);
      setStorageStatus(hasUnsavedData.current ? 'unavailable' : 'saving');
      try {
        return await task;
      } catch (error) {
        if (memoryChanged) hasUnsavedData.current = true;
        throw error;
      } finally {
        pending.current.delete(task);
        setStorageStatus(
          hasUnsavedData.current ? 'unavailable' : pending.current.size ? 'saving' : 'saved',
        );
      }
    },
    [],
  );

  const persist = useCallback(
    (attempt: AttemptRecord) => {
      attemptsRef.current = [...attemptsRef.current, attempt];
      setAttempts(attemptsRef.current);
      void write(() => saveAttempt(attempt)).catch(() =>
        onError(
          'This attempt is kept in memory, but your browser could not save it. Export your progress before closing this tab.',
        ),
      );
    },
    [onError, write],
  );

  const flush = () => Promise.allSettled([...pending.current]);
  async function rememberScore(entry: LibraryEntry) {
    await write(() => saveFile(entry));
    setLibrary(await listLibrary());
  }
  async function removeScore(id: string) {
    await write(() => deleteFile(id), false);
    setLibrary(await listLibrary());
  }
  async function restoreProgress(text: string) {
    parseBackup(text);
    await flush();
    // Import is transactional; rejected input does not leave new in-memory data.
    const count = await write(() => importProgress(text, attemptsRef.current), false);
    mergeHistory(await getAttempts());
    return count;
  }
  async function clear() {
    await flush();
    await write(clearLocalData, false);
    attemptsRef.current = [];
    setAttempts([]);
    setLibrary([]);
    setOctave(false);
    setShowOctavesState(false);
    setExactLocationState(false);
    hasUnsavedData.current = false;
    setStorageStatus('saved');
  }
  function setOctaveRequired(value: boolean) {
    setOctave(value);
    void write(() => writeSetting('octaveRequired', value)).catch(() =>
      onError('The octave setting could not be saved. It applies for this session.'),
    );
  }
  function setShowOctaves(value: boolean) {
    setShowOctavesState(value);
    void write(() => writeSetting('showOctaves', value)).catch(() =>
      onError('The display setting could not be saved. It applies for this session.'),
    );
  }
  function setExactLocation(value: boolean) {
    setExactLocationState(value);
    void write(() => writeSetting('exactLocation', value)).catch(() =>
      onError('The location setting could not be saved. It applies for this session.'),
    );
  }
  return {
    attempts,
    attemptsRef,
    library,
    octaveRequired,
    setOctaveRequired,
    showOctaves,
    setShowOctaves,
    exactLocation,
    setExactLocation,
    hydrated,
    storageStatus,
    persist,
    rememberScore,
    removeScore,
    restoreProgress,
    clear,
  };
}
