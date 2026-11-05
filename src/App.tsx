import type { EarStudy } from './ear/model';
import {
  StudioHeader,
  StudioHome,
  ActivityLibrary,
  ResearchPage,
  ProgressPage,
} from './studio/StudioPages';
import { useStudio } from './studio/useStudio';
import { activity, type ActivityId } from './studio/catalog';
import { Timeline } from './studio/Timeline';
import {
  scoreRun,
  personalBestKey,
  stageRunSchema,
  STAGE_POLICY,
  type StageRun,
} from './studio/contracts';
import './studio/studio.css';
import type { SupportKind } from './shared/practice';
import { SongLibrary } from './ui/SongLibrary';
import { PASSAGES, passageForSource, type Passage } from './songs/catalog';
import { playback } from './player/PlaybackCoordinator';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import {
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  FileMusic,
  FolderOpen,
  GraduationCap,
  Headphones,
  HelpCircle,
  LoaderCircle,
  Music2,
  Pause,
  Play,
  Repeat2,
  ShieldCheck,
  SlidersHorizontal,
  Square,
  Target,
  Trash2,
  Upload,
  Volume2,
  X,
} from 'lucide-react';
import { PlayerController, type PlayerState } from './player/PlayerController';
import { useWorkspace, type AppMode, type LabelMode } from './store';
import type {
  ExerciseDefinition,
  ExerciseKind,
  ExerciseSelection,
  GradeResult,
  ScoreDocument,
} from './engine/types';
import type { ProgressionVariation } from './engine/harmony';
import { createExerciseBank, exerciseLoop } from './engine/exercises';
import {
  recordAttempt,
  gradeExercise,
  practiceMetrics,
  buildPracticeEvidence,
} from './engine/assessment';
import { selectNextExercise } from './engine/scheduler';
import { displayNoteLabel, formatPitch } from './engine/exploration';
import { coachContextSchema, type CoachContext } from './shared/coach';
import { readSetting, writeSetting, exportProgress, getMemoryLessonData, type LibraryEntry } from './storage';
import { useLocalData } from './useLocalData';
import { useDesktopLayout } from './useMediaQuery';
import { Inspector } from './ui/Inspector';
import { PracticePanel } from './ui/PracticePanel';
import { CoachPanel } from './ui/CoachPanel';
import { Modal } from './ui/Modal';
import { ProgressionWorkspace } from './ui/ProgressionStudio';
import { closeAudition, stopAudition, audition, auditionScale } from './audition';

const initialPlayer: PlayerState = {
  ready: false,
  rendered: false,
  playing: false,
  currentTick: 0,
  endTick: 0,
  currentTime: 0,
  endTime: 0,
  activeTrack: 0,
  speed: 0.75,
  loop: null,
};
const time = (milliseconds: number) =>
  `${Math.floor(milliseconds / 60000)}:${String(Math.floor(milliseconds / 1000) % 60).padStart(2, '0')}`;

export default function App() {
  const studio = useStudio();
  const stageActive = studio.route.page === 'stage';
  const activeActivity = studio.route.activity;
  const teachingTransition = useRef(false);
  const [teacherOpen, setTeacherOpen] = useState(false);
  const [run, setRun] = useState<StageRun | null>(null);
  const [savedRuns, setSavedRuns] = useState<StageRun[]>([]);
  const [recap, setRecap] = useState(false);
  const [reflection, setReflection] = useState('');
  const [stageSurface, setStageSurface] = useState<'timeline' | 'notation'>('timeline');

  const host = useRef<HTMLDivElement>(null),
    controller = useRef<PlayerController | null>(null),
    fileInput = useRef<HTMLInputElement>(null),
    backupInput = useRef<HTMLInputElement>(null);
  const [earStudy, setEarStudy] = useState<EarStudy | undefined>();
  const [score, setScore] = useState<ScoreDocument | null>(null),
    [player, setPlayer] = useState(initialPlayer),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [listeningDifficulty, setListeningDifficulty] = useState<'guided' | 'recall' | 'transfer'>(
    'guided',
  );
  const local = useLocalData(setError);
  const {
    attempts,
    attemptsRef,
    library,
    hydrated,
    octaveRequired,
    setOctaveRequired,
    showOctaves,
    setShowOctaves,
    exactLocation,
    setExactLocation,
    persist,
  } = local;
  const desktop = useDesktopLayout();
  const [modal, setModal] = useState<'library' | 'settings' | 'mixer' | null>(null);
  const [foreground, setForeground] = useState(!document.hidden);
  const [mobilePanel, setMobilePanel] = useState(false),
    [dragging, setDragging] = useState(false),
    [loading, setLoading] = useState(false);
  const loadGeneration = useRef(0);
  const dataOperation = useRef(false);
  const [kind, setKind] = useState<ExerciseKind>('note-name');
  const [answerText, setAnswerText] = useState('');
  const [selection, setSelection] = useState<ExerciseSelection | null>(null),
    [result, setResult] = useState<GradeResult | null>(null),
    [revealed, setRevealed] = useState(false);
  const [metronome, setMetronome] = useState(false),
    [countIn, setCountIn] = useState(false),
    [volume, setVolume] = useState(0.8),
    [mutes, setMutes] = useState<Record<number, boolean>>({}),
    [solos, setSolos] = useState<Record<number, boolean>>({});
  const [panelTab, setPanelTab] = useState<'note' | 'coach'>('note');
  const [zoom, setZoom] = useState(1);
  const [listeningMasked, setListeningMasked] = useState(false);
  const [staffNotation, setStaffNotation] = useState(false);
  const [previewActive, setPreviewActive] = useState(false);
  const [localRevision, setLocalRevision] = useState(0);
  const [harmonyBank, setHarmonyBank] = useState<ExerciseDefinition[]>([]);
  const [teacherTask, setTeacherTask] = useState<ExerciseDefinition | null>(null);
  const workspace = useWorkspace();
  const { mode, labelMode, speed, trackIndex, selectedNoteId, loopStart, loopEnd, looping } =
    workspace;
  const currentAttempt = useRef({
    startedAt: Date.now(),
    completed: true,
    episodeId: crypto.randomUUID(),
    responseIndex: 0,
    hints: [] as string[],
  });
  const recordSupport = useRef<(kind: SupportKind, episodeId: string) => boolean>(() => false);
  const [supportLevel, setSupportLevel] = useState<SupportKind | null>(null);
  const latest = useRef({ selection, mode });
  latest.current = { selection, mode };
  const track = score?.tracks.find((t) => t.index === trackIndex);
  const selectedNote = track?.notes.find((n) => n.id === selectedNoteId) ?? track?.notes[0];
  const sourceBank = useMemo(
    () =>
      score && track
        ? createExerciseBank(score, track.id, {
            octaveRequired,
            showOctaves,
            locationMatch: exactLocation ? 'exact' : 'pitch-class',
          })
        : [],
    [score, track, octaveRequired, showOctaves, exactLocation],
  );
  const bank = useMemo(
    () => [
      ...sourceBank,
      ...harmonyBank.filter((item) => item.scoreId === score?.id && item.trackId === track?.id),
    ],
    [sourceBank, harmonyBank, score, track],
  );
  const metrics = useMemo(() => practiceMetrics(attempts), [attempts]);
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    lastPlayer = useRef(initialPlayer);

  const notify = (message: string) => {
    setNotice(message);
  };

  function persistEvidence(attempt: Parameters<typeof persist>[0]) {
    persist(attempt);
    setRun((previous) =>
      previous && !previous.endedAt
        ? { ...previous, attemptIds: [...previous.attemptIds, attempt.id] }
        : previous,
    );
  }
  function finishInterrupted() {
    const current = latest.current;
    if (current.mode === 'practice' && current.selection && !currentAttempt.current.completed) {
      currentAttempt.current.completed = true;
      persistEvidence(
        recordAttempt(current.selection.exercise, '', {
          id: crypto.randomUUID(),
          startedAt: currentAttempt.current.startedAt,
          answeredAt: Date.now(),
          mode: current.selection.mode,
          outcome: 'interrupted',
          hintsUsed: currentAttempt.current.hints,
          episodeId: currentAttempt.current.episodeId,
          responseIndex: currentAttempt.current.responseIndex,
        }),
      );
    }
  }
  const interruptRef = useRef(finishInterrupted);
  interruptRef.current = finishInterrupted;

  useEffect(() => {
    if (!host.current) return;
    const api = new PlayerController(host.current, {
      onDocument: (document) => {
        setScore(document);
        setListeningMasked(false);
        setPreviewActive(false);
        setResult(null);
        setRevealed(false);
        setSelection(null);
        setMutes({});
        setSolos({});
        const first = document.tracks.find((t) => t.supported)?.index ?? 0;
        useWorkspace.getState().setTrack(first);
        useWorkspace.getState().setLoop(0, Math.min(1, document.measures.length - 1), false);
      },
      onState: (state) => {
        const changed =
          state.playing !== lastPlayer.current.playing ||
          state.ready !== lastPlayer.current.ready ||
          state.rendered !== lastPlayer.current.rendered;
        lastPlayer.current = state;
        if (changed) {
          setPlayer(state);
          return;
        }
        if (!statusTimer.current)
          statusTimer.current = setTimeout(() => {
            setPlayer(lastPlayer.current);
            statusTimer.current = null;
          }, 100);
      },
      onNote: (note) => {
        if (useWorkspace.getState().mode !== 'practice')
          useWorkspace.getState().selectNote(note.id);
      },
      onError: setError,
    });
    controller.current = api;
    const unregisterPlayback = playback.register('score', () => api.pause());
    try {
      api.setLabels('pitch', true);
      api.loadDemo();
      api.setSpeed(useWorkspace.getState().speed);
      api.setMasterVolume(0.8);
    } catch (cause) {
      setError(String(cause));
    }
    const keyboard = (event: KeyboardEvent) => {
      if (
        !location.hash.startsWith('#/stage') ||
        (event.target as HTMLElement)?.closest('input,select,textarea,button,[role="dialog"]') ||
        event.metaKey ||
        event.ctrlKey
      )
        return;
      if (event.code === 'Space') {
        event.preventDefault();
        stopAudition();
        api.playPause();
      }
      if (event.key.toLowerCase() === 'l') {
        event.preventDefault();
        const s = useWorkspace.getState();
        s.setLoop(s.loopStart, s.loopEnd, !s.looping);
      }
    };
    const visibility = () => {
      setForeground(!document.hidden);
      if (document.hidden) {
        stopAudition();
        api.pause();
        interruptRef.current();
        setResult(null);
        setSelection(null);
      }
    };
    window.addEventListener('keydown', keyboard);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      loadGeneration.current++;
      interruptRef.current();
      if (statusTimer.current) clearTimeout(statusTimer.current);
      unregisterPlayback();
      api.destroy();
      controller.current = null;
      void closeAudition().catch(() => {});
      window.removeEventListener('keydown', keyboard);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [persist]);

  useEffect(() => {
    if (!controller.current || !score) return;
    const hidden =
      mode === 'practice' &&
      selection &&
      !result?.correct &&
      !revealed &&
      selection.support === 'hidden';
    controller.current.setStaffNotation(staffNotation && !hidden);
    controller.current.setPresentation({
      mode: hidden || labelMode !== 'fret' ? 'pitch' : 'fret',
      fretHint: !hidden && labelMode === 'hybrid',
      showOctaves:
        showOctaves ||
        (mode === 'practice' &&
          (kind === 'interval' ||
            (kind === 'note-location' && exactLocation) ||
            (kind === 'note-name' && octaveRequired))),
      maskedNoteIds:
        hidden && selection.exercise.mask.hide === 'pitch'
          ? track?.notes.map((note) => note.id)
          : [],
    });
  }, [
    score,
    mode,
    labelMode,
    staffNotation,
    showOctaves,
    kind,
    exactLocation,
    octaveRequired,
    selection,
    result,
    revealed,
    track,
  ]);
  useEffect(() => controller.current?.setSpeed(speed), [speed]);
  useEffect(() => {
    if (!score) return;
    if (looping) controller.current?.setMeasureLoop(loopStart, loopEnd);
    else controller.current?.setLoop(null, null);
  }, [looping, loopStart, loopEnd, score]);

  const begin = useCallback((next: ExerciseSelection | null) => {
    setSelection(next);
    setAnswerText('');
    setResult(null);
    setRevealed(false);
    currentAttempt.current = {
      startedAt: Date.now(),
      completed: !next,
      episodeId: crypto.randomUUID(),
      responseIndex: 0,
      hints: [],
    };
    setSupportLevel(null);
    if (next) {
      const target = next.exercise.mask.noteIds[0] ?? next.exercise.noteIds[0];
      useWorkspace.getState().selectNote(target ?? null);
      controller.current?.pause();
      if (target) controller.current?.seekNote(target);
    }
  }, []);
  useEffect(() => {
    if (
      stageActive &&
      activeActivity === 'knowledge' &&
      mode === 'practice' &&
      (!desktop || panelTab === 'note') &&
      !selection &&
      hydrated &&
      foreground &&
      !loading
    )
      begin(selectNextExercise(bank, attemptsRef.current, Date.now(), kind));
  }, [
    mode,
    selection,
    bank,
    attempts,
    kind,
    begin,
    hydrated,
    foreground,
    loading,
    desktop,
    panelTab,
  ]);

  function switchMode(next: AppMode) {
    if (next === mode) return;
    finishInterrupted();
    stopAudition();
    controller.current?.pause();
    workspace.setMode(next);
    setPanelTab('note');
    setSelection(null);
    setResult(null);
    setRevealed(false);
  }
  const previewVariation = useCallback((variation: ProgressionVariation | null) => {
    stopAudition();
    controller.current?.previewVariation(variation);
    setPreviewActive(Boolean(variation));
  }, []);
  function listen(pitches: number[]) {
    controller.current?.pause();
    void audition(pitches).catch(() =>
      setError('Audio could not start. Try again after enabling sound.'),
    );
  }
  function listenScale(tonic: number, pitches: number[]) {
    controller.current?.pause();
    void auditionScale(tonic, pitches).catch(() =>
      setError('Audio could not start. Try again after enabling sound.'),
    );
  }
  function openCatalogPassage(
    passage: Passage,
    difficulty: 'guided' | 'recall' | 'transfer' = 'guided',
  ) {
    studio.go('stage', 'listening');
    setListeningDifficulty(difficulty);
    finishInterrupted();
    playback.stopAll();
    loadGeneration.current++;
    controller.current?.loadCatalogPassage(passage);
    workspace.setMode('understand');
    workspace.setLoop(0, passage.chords.length - 1, false);
    workspace.setSpeed(1);
    setSelection(null);
    setResult(null);
    setRevealed(false);
    setError('');
  }
  function replayCatalog(bassOnly = false) {
    const api = controller.current;
    if (!api || !player.ready) return;
    for (const t of score?.tracks ?? []) {
      api.setTrackSolo(t.index, bassOnly && t.index === 1);
      api.setTrackMute(t.index, false);
    }
    setSolos(bassOnly ? { 1: true } : {});
    setMutes({});
    api.replaySource();
  }
  function openProgressionStudy(tonic = 'C') {
    studio.go('stage', 'progression');
    finishInterrupted();
    stopAudition();
    loadGeneration.current++;
    controller.current?.loadProgressionDemo(tonic);
    workspace.setMode('understand');
    workspace.setLoop(0, 3, true);
    setSelection(null);
    setResult(null);
    setRevealed(false);
    setError('');
    setModal(null);
  }
  function practiceHarmony(nextKind: ExerciseKind) {
    const next = selectNextExercise(bank, attemptsRef.current, Date.now(), nextKind);
    if (!next) {
      notify(
        'This passage has no eligible question for that focus. Confirm its chords or choose another chord change.',
      );
      return;
    }
    teachingTransition.current = true;
    studio.go('stage', 'knowledge');
    finishInterrupted();
    stopAudition();
    controller.current?.previewVariation(null);
    workspace.setMode('practice');
    setPanelTab('note');
    setKind(nextKind);
    begin(next);
    setMobilePanel(false);
  }
  function changePanel(next: 'note' | 'coach') {
    if (next === panelTab) return;
    if (mode === 'practice') {
      finishInterrupted();
      setSelection(null);
      setResult(null);
      setRevealed(false);
    }
    setPanelTab(next);
  }
  function changeKind(next: ExerciseKind) {
    finishInterrupted();
    setKind(next);
    begin(selectNextExercise(bank, attemptsRef.current, Date.now(), next));
  }
  function practiceSelected(
    nextKind: ExerciseKind,
    options?: { locationMatch?: 'pitch-class' | 'exact' },
  ) {
    const focusedBank =
      options?.locationMatch && score && track
        ? createExerciseBank(score, track.id, {
            octaveRequired,
            showOctaves,
            locationMatch: options.locationMatch,
          })
        : bank;
    const exercise = focusedBank.find(
      (candidate) =>
        candidate.kind === nextKind && candidate.mask.noteIds.includes(selectedNote?.id ?? ''),
    );
    if (!exercise) {
      notify(
        nextKind === 'note-location'
          ? 'This note has no other location under that matching rule. Choose Any octave to explore a different register.'
          : 'This selected note has no eligible question. Choose another note to practice.',
      );
      return;
    }
    teachingTransition.current = true;
    studio.go('stage', 'knowledge');
    setNotice('');
    finishInterrupted();
    stopAudition();
    controller.current?.pause();
    setKind(nextKind);
    workspace.setMode('practice');
    setPanelTab('note');
    if (options?.locationMatch) setExactLocation(options.locationMatch === 'exact');
    begin({
      exercise,
      mode: 'learn',
      support: 'guided',
      reason: 'Start with the note you explored. Then check it with the clues hidden.',
    });
    setMobilePanel(false);
  }
  function nextQuestion() {
    finishInterrupted();
    if (run?.mode === 'challenge' && !run.endedAt) {
      const recorded = new Set(
        run.attemptIds.map((id) => attemptsRef.current.find((a) => a.id === id)?.exerciseId),
      );
      const next = run.targetExerciseIds
        .map((id) => bank.find((e) => e.id === id))
        .find((e) => e && !recorded.has(e.id));
      if (!next) {
        saveBookmark(true);
        return;
      }
      begin({
        exercise: next,
        support: 'hidden',
        mode: 'recall',
        reason: 'A screen-answer challenge. No playing or timing is assessed.',
      });
      return;
    }
    if (teacherTask && selection?.exercise.id === teacherTask.id) {
      setSelection(null);
      setTeacherTask(null);
      workspace.setMode('understand');
      setPanelTab('note');
      setMobilePanel(false);
      studio.go('stage', 'progression');
      setTeacherOpen(true);
      return;
    }
    const next = selectNextExercise(bank, attemptsRef.current, Date.now(), kind);
    begin(
      run?.mode === 'challenge' && next ? { ...next, support: 'hidden', mode: 'recall' } : next,
    );
  }
  function startTeacherExercise(exercise: ExerciseDefinition) {
    teachingTransition.current = true;
    studio.go('stage', 'knowledge');
    setTeacherOpen(false);
    finishInterrupted();
    stopAudition();
    controller.current?.previewVariation(null);
    setTeacherTask(exercise);
    workspace.setMode('practice');
    setPanelTab('note');
    setKind(exercise.kind);
    begin({
      exercise,
      mode: exercise.partition === 'heldout' ? 'transfer' : 'recall',
      support: 'hidden',
      reason: 'A question about the selected musical idea. Answers are checked on this device.',
    });
    setMobilePanel(false);
  }
  function answer(response: string) {
    if (!selection || currentAttempt.current.completed) return;
    currentAttempt.current.completed = true;
    const attempt = recordAttempt(selection.exercise, response, {
      id: crypto.randomUUID(),
      startedAt: currentAttempt.current.startedAt,
      answeredAt: Date.now(),
      mode: selection.mode,
      assisted:
        selection.support === 'guided' ||
        currentAttempt.current.hints.length > 0 ||
        currentAttempt.current.responseIndex > 0,
      hintsUsed: [
        ...(selection.support === 'guided' ? ['teaching-cue'] : []),
        ...currentAttempt.current.hints,
        ...(currentAttempt.current.responseIndex > 0 ? ['retry-after-feedback'] : []),
      ],
      episodeId: currentAttempt.current.episodeId,
      responseIndex: currentAttempt.current.responseIndex++,
    });
    persistEvidence(attempt);
    setResult(gradeExercise(selection.exercise, response));
  }
  function support(kind: SupportKind) {
    if (!selection || !recordSupport.current(kind, currentAttempt.current.episodeId)) return;
    setRun((previous) => (previous ? { ...previous, assisted: true } : previous));
    currentAttempt.current.hints = [...new Set([...currentAttempt.current.hints, kind])];
    setSupportLevel(kind);
    if (kind === 'answer') {
      if (!currentAttempt.current.completed) {
        currentAttempt.current.completed = true;
        persistEvidence(
          recordAttempt(selection.exercise, '', {
            id: crypto.randomUUID(),
            startedAt: currentAttempt.current.startedAt,
            answeredAt: Date.now(),
            mode: selection.mode,
            outcome: 'revealed',
            hintsUsed: currentAttempt.current.hints,
            episodeId: currentAttempt.current.episodeId,
            responseIndex: currentAttempt.current.responseIndex++,
          }),
        );
      }
      setRevealed(true);
    }
  }
  function reveal() {
    support('answer');
  }
  function retryAnswer() {
    if (!selection || !result || result.correct) return;
    setRun((previous) => (previous ? { ...previous, assisted: true } : previous));
    currentAttempt.current.completed = false;
    currentAttempt.current.startedAt = Date.now();
    setResult(null);
    setAnswerText('');
  }
  function askTeacherForHelp() {
    reveal();
    setTeacherOpen(true);
    setMobilePanel(false);
    requestAnimationFrame(() =>
      document.querySelector('.teacher-panel')?.scrollIntoView({ block: 'start' }),
    );
  }
  function selfReport() {
    const exercise = selection?.exercise ?? bank[0];
    if (!exercise) return;
    const now = Date.now();
    persistEvidence(
      recordAttempt(exercise, 'tried', {
        id: crypto.randomUUID(),
        startedAt: now,
        answeredAt: now,
        outcome: 'self-reported',
      }),
    );
    notify('Practice noted as self-reported. Your recall score is unchanged.');
  }
  function selectTrack(index: number) {
    finishInterrupted();
    controller.current?.selectTrack(index);
    workspace.setTrack(index);
    setSelection(null);
    setResult(null);
  }

  async function importFile(file: File) {
    if (!hydrated || dataOperation.current) return;
    if (!/\.(gp[345]?|gpx)$/i.test(file.name)) {
      setError('Choose a Guitar Pro file: .gp, .gp3, .gp4, .gp5, or .gpx.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError('Choose a Guitar Pro file smaller than 20 MB.');
      return;
    }
    await openScore(() => file.arrayBuffer(), file.name, true);
    studio.go('stage', 'notation');
  }
  async function openScore(readBytes: () => Promise<ArrayBuffer>, name: string, remember: boolean) {
    if (!hydrated || dataOperation.current) return;
    const generation = ++loadGeneration.current;
    stopAudition();
    controller.current?.cancelPendingLoad();
    finishInterrupted();
    setSelection(null);
    setResult(null);
    setRevealed(false);
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const bytes = await readBytes();
      if (generation !== loadGeneration.current) return;
      const opened = await controller.current?.loadBytes(new Uint8Array(bytes), name);
      if (!opened || generation !== loadGeneration.current) return;
      workspace.setMode('play');
      setModal(null);
      setMobilePanel(false);
      if (remember) {
        try {
          await local.rememberScore({ id: opened.hash, name, bytes, savedAt: Date.now() });
          if (generation === loadGeneration.current) notify('Imported and saved on this device.');
        } catch {
          if (generation === loadGeneration.current)
            setError(
              'The score is open, but browser storage is full or unavailable. Keep your original file.',
            );
        }
      }
    } catch {
      if (generation === loadGeneration.current)
        setError('The file could not be read. Your previous score is still available.');
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  }
  function openSavedFile(entry: LibraryEntry) {
    studio.go('stage', 'notation');
    return openScore(() => Promise.resolve(entry.bytes), entry.name, false);
  }
  const coachContext = useMemo<CoachContext | null>(() => {
    if (!score || !track || bank.length === 0) return null;
    const candidates: CoachContext['candidates'] = [];
    for (const skill of ['note-name', 'note-location', 'interval', 'triad-role'] as const) {
      const choice = selectNextExercise(bank, attemptsRef.current, Date.now(), skill);
      if (!choice) continue;
      const loop = exerciseLoop(choice.exercise, score);
      if (loop)
        candidates.push({
          id: choice.exercise.id,
          kind: skill,
          skillId: skill,
          noteIds: choice.exercise.noteIds,
          tempoBpm: loop.tempoBpm,
          loop: { startTick: loop.startTick, endTick: loop.endTick },
        });
    }
    if (!candidates.length) return null;
    const noteIds = new Set(candidates.flatMap((c) => c.noteIds)),
      notes = track.notes.filter((n) => noteIds.has(n.id));
    const context = {
      schemaVersion: 1 as const,
      phrase: {
        id: 'selected-practice',
        noteCount: notes.length,
        distinctPitchClasses: new Set(
          notes.filter((n) => n.soundingMidi !== null).map((n) => n.soundingMidi! % 12),
        ).size,
        stringCrossings: notes
          .slice(1)
          .filter((n, i) => n.position?.string !== notes[i]?.position?.string).length,
        positionChanges: notes
          .slice(1)
          .filter((n, i) => Math.abs((n.position?.fret ?? 0) - (notes[i]?.position?.fret ?? 0)) > 3)
          .length,
      },
      evidence: buildPracticeEvidence(attempts),
      candidates,
    };
    const parsed = coachContextSchema.safeParse(context);
    return parsed.success ? parsed.data : null;
  }, [score, track, bank, attempts]);
  function startCoached(id: string) {
    const exercise = bank.find((e) => e.id === id);
    if (!exercise) return;
    const next = selectNextExercise(bank, attemptsRef.current, Date.now(), exercise.kind);
    if (next?.exercise.id !== id) {
      notify('Your practice history changed. Ask the guide for an updated suggestion.');
      return;
    }
    finishInterrupted();
    teachingTransition.current = true;
    studio.go('stage', 'knowledge');
    setKind(exercise.kind);
    workspace.setMode('practice');
    setPanelTab('note');
    const selected = track?.notes.filter((note) => exercise.noteIds.includes(note.id)) ?? [];
    if (selected.length)
      workspace.setLoop(
        Math.min(...selected.map((note) => note.measureIndex)),
        Math.max(...selected.map((note) => note.measureIndex)),
        true,
      );
    workspace.setSpeed(1);
    begin({
      exercise,
      mode: next.mode,
      support: next.support,
      reason: 'A focused exercise selected from your practice evidence.',
    });
    setMobilePanel(false);
  }

  function stepNote(direction: number) {
    if (!track?.notes.length) return;
    controller.current?.pause();
    const index = Math.max(
      0,
      track.notes.findIndex((note) => note.id === selectedNote?.id),
    );
    const next = track.notes[(index + direction + track.notes.length) % track.notes.length]!;
    workspace.selectNote(next.id);
    controller.current?.seekNote(next.id);
  }

  const readPlayer = useCallback(() => controller.current?.state ?? initialPlayer, []);
  const masked =
    listeningMasked || (mode === 'practice' && !!selection && !result?.correct && !revealed);
  const runScore = run ? scoreRun(run, attempts) : null;
  const best = run
    ? Math.max(
        0,
        ...savedRuns
          .filter((r) => personalBestKey(r) === personalBestKey(run))
          .map((r) => scoreRun(r, attempts))
          .filter((s) => s.ranked)
          .map((s) => s.points),
      )
    : 0;
  useEffect(() => {
    const restore = () => {
      void readSetting('stage-runs-v1', [])
        .then((data) => {
          const result = stageRunSchema.array().max(200).safeParse(data);
          if (result.success) setSavedRuns(result.data);
        })
        .catch(() => {});
    };
    restore();
    window.addEventListener('studio-restored', restore);
    return () => window.removeEventListener('studio-restored', restore);
  }, []);
  useEffect(() => {
    if (!run?.endedAt) return;
    setSavedRuns((old) => {
      if (old.some((r) => r.id === run.id)) return old;
      const next = [...old, run].slice(-200);
      void writeSetting('stage-runs-v1', next).catch(() =>
        setError('Challenge references are kept in memory. Export progress before closing.'),
      );
      return next;
    });
  }, [run]);

  function startActivity(id: ActivityId) {
    finishInterrupted();
    playback.stopAll();
    setRecap(false);
    setRun(null);
    setMobilePanel(false);
    if (id === 'listening' && !passageForSource(score?.hash ?? '')) {
      const original = PASSAGES.find((p) => p.id === 'original-c');
      if (original) openCatalogPassage(original);
    }
    if (id === 'homework' && score?.hash === 'tabtopitch-original-study-v1')
      controller.current?.loadHomeworkDemo();
    if (id === 'progression' && score?.hash === 'tabtopitch-original-study-v1')
      openProgressionStudy();
    studio.go('stage', id);
    studio.visit(id, studio.set.bookmark?.activity === id ? 'resumed' : 'started');
  }
  function saveBookmark(completed = false) {
    if (!score) return;
    const homework = activeActivity === 'homework' ? getMemoryLessonData().lessons.filter(l=>l.sourceHash===score.hash&&l.homework?.playing).sort((a,b)=>b.updatedAt-a.updatedAt)[0]?.homework : undefined;
    const playingStep = homework?.playing?.steps[homework.playing.index];
    studio.change({
      reflection,
      bookmark: {
        activity: activeActivity,
        sourceHash: score.hash,
        track: trackIndex,
        firstBar: loopStart,
        lastBar: loopEnd,
        speed,
        at: Date.now(),
        next: playingStep ? `${playingStep.title} · frets ${playingStep.region.minFret}–${playingStep.region.maxFret}` : activity(activeActivity).title,
      },
      visits: [
        ...studio.set.visits,
        {
          at: Date.now(),
          activity: activeActivity,
          kind: completed ? ('completed' as const) : ('saved' as const),
        },
      ].slice(-1000),
    });
    finishInterrupted();
    playback.stopAll();
    setRun((previous) => (previous ? { ...previous, endedAt: Date.now() } : previous));
    setRecap(true);
  }
  function startChallenge() {
    const target = bank.find((e) => e.kind === kind && e.partition === 'practice');
    const next = target
      ? {
          exercise: target,
          support: 'hidden' as const,
          mode: 'recall' as const,
          reason: 'Five screen questions, with first responses preserved.',
        }
      : null;
    if (!next || !score) return;
    finishInterrupted();
    playback.stopAll();
    setRun({
      id: crypto.randomUUID(),
      mode: 'challenge',
      policy: STAGE_POLICY,
      sourceId: score.id,
      taskVersion: `${kind}:v1:${octaveRequired}:${exactLocation}`,
      input: 'screen',
      tempo: speed,
      support: 'hidden',
      startedAt: Date.now(),
      capability: { qualified: true, timingQualified: false },
      targetExerciseIds: bank
        .filter((e) => e.kind === kind && e.partition === 'practice')
        .slice(0, 5)
        .map((e) => e.id),
      attemptIds: [],
      assisted: false,
    });
    workspace.setMode('practice');
    begin({ ...next, support: 'hidden', mode: 'recall' });
  }
  useEffect(() => {
    setRun((previous) =>
      previous &&
      !previous.endedAt &&
      (previous.sourceId !== score?.id ||
        previous.tempo !== speed ||
        previous.taskVersion !== `${kind}:v1:${octaveRequired}:${exactLocation}`)
        ? { ...previous, assisted: true, endedAt: Date.now() }
        : previous,
    );
  }, [score?.id, speed, kind, octaveRequired, exactLocation]);
  const restoredBookmark = useRef(false);
  useEffect(() => {
    if (!studio.ready || !hydrated || !controller.current || restoredBookmark.current) return;
    restoredBookmark.current = true;
    const b = studio.set.bookmark;
    if (!b) return;
    const saved = library.find((x) => x.id === b.sourceHash);
    if (saved)
      void openScore(() => Promise.resolve(saved.bytes), saved.name, false).then(() => {
        controller.current?.selectTrack(b.track);
        workspace.setTrack(b.track);
        workspace.setLoop(b.firstBar, b.lastBar, true);
        workspace.setSpeed(b.speed);
      });
    else if (b.sourceHash.startsWith('tabtopitch-progression-study-v1'))
      controller.current.loadProgressionDemo(
        b.sourceHash.split(':').at(-1)?.length === 1 ? b.sourceHash.split(':').at(-1) : 'C',
      );
    else if (b.sourceHash.startsWith('tabtopitch-homework')) controller.current.loadHomeworkDemo();
    else {
      const passage = passageForSource(b.sourceHash);
      if (passage) controller.current.loadCatalogPassage(passage);
    }
    workspace.setLoop(b.firstBar, b.lastBar, true);
    workspace.setSpeed(b.speed);
  }, [studio.ready, hydrated]);
  const priorRoute = useRef('');
  useEffect(() => {
    const key = `${studio.route.page}:${activeActivity}`;
    if (priorRoute.current === key) return;
    priorRoute.current = key;
    if (teachingTransition.current && stageActive && activeActivity === 'knowledge') {
      teachingTransition.current = false;
      return;
    }
    finishInterrupted();
    playback.stopAll();
    setRun((previous) => (previous ? { ...previous, endedAt: Date.now() } : previous));
    setSelection(null);
    setResult(null);
    setRevealed(false);
    setRecap(false);
    setMobilePanel(false);
    if (stageActive && activeActivity === 'homework' && score?.hash === 'tabtopitch-original-study-v1') controller.current?.loadHomeworkDemo();
    if (stageActive && activeActivity === 'listening' && score && !passageForSource(score.hash)) {
      const original = PASSAGES.find((p) => p.id === 'original-c');
      if (original) controller.current?.loadCatalogPassage(original);
    }
    if (stageActive)
      workspace.setMode(
        activeActivity === 'knowledge'
          ? 'practice'
          : activeActivity === 'timeline'
            ? 'play'
            : 'understand',
      );
  }, [studio.route.page, activeActivity]);
  useEffect(() => {
    if (stageActive) {
      const frame = requestAnimationFrame(() => controller.current?.refreshLayout());
      return () => cancelAnimationFrame(frame);
    }
  }, [stageActive, stageSurface, activeActivity]);
  useEffect(() => {
    if (stageActive && activeActivity === 'homework' && score?.hash === 'tabtopitch-original-study-v1') controller.current?.loadHomeworkDemo();
    if (stageActive && activeActivity === 'listening' && score && !passageForSource(score.hash)) {
      const p = PASSAGES.find((p) => p.id === 'original-c');
      if (p) controller.current?.loadCatalogPassage(p);
    }
  }, [stageActive, activeActivity, score?.hash]);
  const playGuide = (
    <>
      <div className="panel-heading">
        <span className="eyebrow">Your practice room</span>
        <span className="bar-badge">01</span>
      </div>
      <h2 className="panel-title">
        Know what
        <br />
        you play.
      </h2>
      <p className="panel-intro">
        Same strings. Same rhythm.
        <br />
        Now, the notes have names.
      </p>
      <div className="reading-key">
        <div>
          <span className="example-label">
            B{showOctaves ? '2' : ''}
            <span>·2</span>
          </span>
          <div>
            <strong>B is the note. After the dot: the fret.</strong>
            <p>
              {showOctaves
                ? 'The small number before the dot is the octave.'
                : 'Start with names and shapes. Add octaves when you need them.'}
            </p>
          </div>
        </div>
      </div>
      <ol className="journey">
        <li>
          <span>1</span>
          <div>
            <strong>Play a familiar phrase</strong>
            <p>Slow it down. Loop a few bars.</p>
          </div>
        </li>
        <li>
          <span>2</span>
          <div>
            <strong>Find it across the neck</strong>
            <p>Explore the same note, then another chord shape.</p>
          </div>
        </li>
        <li>
          <span>3</span>
          <div>
            <strong>Try it without the clues</strong>
            <p>Recall it in another place.</p>
          </div>
        </li>
      </ol>
      <button className="primary-button full-width" onClick={() => switchMode('practice')}>
        Try a short practice
        <Target size={16} />
      </button>
      <div className="quiet-divider" />
      <div className="panel-heading">
        <span className="eyebrow">Your recall so far</span>
        <span className="small-muted">On this device</span>
      </div>
      <div className="metric-row">
        <div>
          <strong>{metrics.unassisted || '—'}</strong>
          <span>first answers</span>
        </div>
        <div>
          <strong>
            {metrics.unassistedAccuracy === null
              ? '—'
              : `${Math.round(metrics.unassistedAccuracy * 100)}%`}
          </strong>
          <span>without hints</span>
        </div>
      </div>
      <p className="caption">
        {metrics.revealed} revealed · {metrics.interrupted} interrupted · {metrics.selfReported}{' '}
        self-reported
      </p>
      <p className="caption">
        Delayed recall: {metrics.delayedCorrect}/{metrics.delayedAttempts}. Held-back phrase checks:{' '}
        {metrics.transferCorrect}/{metrics.transferAttempts}. Knowledge recall, measured separately
        from playing.
      </p>
    </>
  );
  const panel = listeningMasked ? (
    <p>Answer the listening question above, or request help before opening explanations.</p>
  ) : (
    <>
      {desktop && panelTab === 'coach' ? (
        <CoachPanel context={coachContext} onStart={startCoached} />
      ) : mode === 'play' ? (
        playGuide
      ) : mode === 'understand' && previewActive ? (
        <section className="empty-panel">
          <Music2 size={28} />
          <h3>Hearing your variation</h3>
          <p>
            Its notes and chord roles are in the progression diagram above. Choose Original score to
            inspect the imported notes again.
          </p>
          <a className="secondary-button" href="#progression-studio">
            Back to progression
          </a>
        </section>
      ) : mode === 'understand' ? (
        <Inspector
          note={selectedNote}
          track={track}
          onSelect={workspace.selectNote}
          onAudition={() => controller.current?.pause()}
          onError={setError}
          showOctaves={showOctaves}
          onPractice={practiceSelected}
        />
      ) : (
        <PracticePanel
          selection={selection}
          result={result}
          revealed={revealed}
          kind={kind}
          onKind={changeKind}
          onAnswer={answer}
          answerText={answerText}
          onAnswerText={setAnswerText}
          onListen={listen}
          teacherQuestion={selection?.exercise.id === teacherTask?.id}
          onTeacherHelp={askTeacherForHelp}
          onReveal={reveal}
          supportLevel={supportLevel}
          onSupport={support}
          onRetry={retryAnswer}
          onNext={nextQuestion}
          onSelfReport={selfReport}
          octaveRequired={octaveRequired}
          exactLocation={exactLocation}
          onExactLocation={(value) => {
            finishInterrupted();
            setExactLocation(value);
            begin(null);
          }}
          waiting={!hydrated || loading || !foreground}
          onOctave={(value) => {
            finishInterrupted();
            setOctaveRequired(value);
            begin(null);
          }}
        />
      )}
      {(!desktop || panelTab !== 'coach') && mode !== 'practice' && (
        <CoachPanel context={coachContext} onStart={startCoached} />
      )}
    </>
  );

  const feedback = (
    <>
      {error && (
        <div className="alert error" role="alert">
          <span>{error}</span>
          <button aria-label="Dismiss error" onClick={() => setError('')}>
            <X size={17} />
          </button>
        </div>
      )}
      {notice && (
        <div className="alert notice" role="status">
          <Check size={16} />
          <span>{notice}</span>
          <button aria-label="Dismiss notice" onClick={() => setNotice('')}>
            <X size={17} />
          </button>
        </div>
      )}
    </>
  );

  return (
    <div
      className={`app-shell studio-shell ${stageActive ? 'on-stage' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) void importFile(file);
      }}
    >
      <StudioHeader
        studio={studio}
        onSettings={() => setModal('settings')}
        onImport={() => fileInput.current?.click()}
      />
      <p className="local-status" role="status">
        {local.storageStatus === 'unavailable'
          ? 'Local storage needs attention'
          : local.storageStatus === 'loading'
            ? 'Opening local progress…'
            : local.storageStatus === 'saving'
              ? 'Saving on this device…'
              : 'Local storage ready'}
      </p>
      {studio.error && (
        <p className="alert error" role="status">
          {studio.error}
        </p>
      )}
      {studio.route.page === 'studio' && (
        <StudioHome
          attempts={attempts}
          studio={studio}
          onStart={startActivity}
          source={score?.title ?? 'Original study'}
          ready={hydrated && !!score}
        />
      )}
      {studio.route.page === 'library' && (
        <ActivityLibrary
          studio={studio}
          onStart={startActivity}
          onFiles={() => setModal('library')}
        >
          <SongLibrary onOpen={openCatalogPassage} />
        </ActivityLibrary>
      )}
      {studio.route.page === 'research' && <ResearchPage studio={studio} onStart={startActivity} />}
      {studio.route.page === 'progress' && <ProgressPage studio={studio} attempts={attempts} />}
      <input
        ref={fileInput}
        className="sr-only"
        type="file"
        accept=".gp,.gp3,.gp4,.gp5,.gpx"
        aria-label="Import Guitar Pro file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void importFile(file);
        }}
      />
      <input
        ref={backupInput}
        className="sr-only"
        type="file"
        accept=".json"
        aria-label="Import progress backup"
        disabled={loading || !hydrated}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          dataOperation.current = true;
          finishInterrupted();
          setSelection(null);
          setResult(null);
          setRevealed(false);
          setLoading(true);
          try {
            await studio.flush();
            const count = await local.restoreProgress(await file.text());
            notify(`Imported ${count} practice records.`);
          } catch {
            setError('That progress file is invalid or could not be saved.');
          } finally {
            dataOperation.current = false;
            setLoading(false);
          }
        }}
      />
      {!modal && (desktop || !mobilePanel) && feedback}
      <main
        hidden={!stageActive}
        className={`workspace studio-stage activity-${activeActivity} ${mode === 'understand' ? 'explore-workspace' : ''}`}
      >
        <div className="song-header">
          <div>
            <div className="eyebrow">
              <span className="status-dot" />
              PRACTICE STAGE · {activity(activeActivity).category}
            </div>
            <h1>{activity(activeActivity).title}</h1>
            <details className="stage-goal">
              <summary>{studio.set.goal}</summary>
              <label>
                My practice goal
                <input
                  className="field-input"
                  maxLength={500}
                  value={studio.set.goal}
                  onChange={(e) => {
                    finishInterrupted();
                    playback.stopAll();
                    setRun((previous) =>
                      previous ? { ...previous, endedAt: Date.now(), assisted: true } : previous,
                    );
                    studio.change({ goal: e.target.value });
                  }}
                />
              </label>
            </details>
            <div className="song-meta">
              <span>{score?.title || 'Opening study…'}</span>
              <span className="meta-dot">·</span>
              <span>{score?.measures.length ?? 0} bars</span>
              <span className="meta-dot">·</span>
              <span>{score?.measures[0]?.tempoBpm ?? 96} BPM</span>
              <span className="original-badge">
                {score?.artist?.includes('original CC0') ? 'Original study' : 'Local score'}
              </span>
            </div>
          </div>
          <button
            className="icon-button mixer-shortcut"
            aria-label="Open track mixer"
            onClick={() => setModal('mixer')}
          >
            <SlidersHorizontal size={20} />
          </button>
        </div>
        <Tabs.Root
          value={mode}
          onValueChange={(value) => {
            if (activeActivity === 'notation' && value !== 'practice') {
              switchMode(value as AppMode);
              return;
            }
            if (value === 'practice') startActivity('knowledge');
            else if (value === 'play') startActivity('timeline');
            else startActivity('progression');
          }}
          className="mode-tabs"
        >
          <Tabs.List aria-label="Workspace mode">
            <Tabs.Trigger value="play">
              <Play size={15} />
              Play
            </Tabs.Trigger>
            <Tabs.Trigger value="understand">
              <BookOpen size={16} />
              Understand
            </Tabs.Trigger>
            <Tabs.Trigger value="practice">
              <GraduationCap size={18} />
              Practice
            </Tabs.Trigger>
          </Tabs.List>
          <span className="mode-description">
            {mode === 'play'
              ? 'Get comfortable with the notes.'
              : mode === 'understand'
                ? 'A shape becomes a musical idea.'
                : 'One small step toward knowing the neck.'}
          </span>
        </Tabs.Root>
        <div className="stage-actions">
          <a href={`#/research/${activeActivity}`}>Why this exercise?</a>
          <button className="text-button" onClick={() => saveBookmark()}>
            Save for next time
          </button>
          <button
            className="text-button"
            onClick={() => {
              finishInterrupted();
              playback.stopAll();
              studio.go('studio');
            }}
          >
            Exit to studio
          </button>
        </div>
        {activeActivity === 'timeline' && (
          <div className="stage-view-controls">
            <button
              className="secondary-button"
              aria-pressed={stageSurface === 'timeline'}
              onClick={() => setStageSurface('timeline')}
            >
              Timeline
            </button>
            <button
              className="secondary-button"
              aria-pressed={stageSurface === 'notation'}
              onClick={() => setStageSurface('notation')}
            >
              Original notation
            </button>
            <label>
              <input
                type="checkbox"
                checked={studio.set.staticStage}
                onChange={(e) => studio.change({ staticStage: e.target.checked })}
              />
              Static stage
            </label>
          </div>
        )}
        {stageActive &&
          activeActivity === 'timeline' &&
          stageSurface === 'timeline' &&
          score &&
          track &&
          !masked &&
          !previewActive && (
            <Timeline
              score={score}
              track={track}
              readPlayer={readPlayer}
              staticView={studio.set.staticStage}
              octaves={showOctaves}
            />
          )}
        {previewActive && activeActivity === 'timeline' && (
          <p className="alert notice">
            A variation is playing. Open the progression view for its verified notes; the source
            timeline is hidden.
          </p>
        )}
        {activeActivity === 'knowledge' && (
          <div className="challenge-bar">
            <span>
              {run && !run.endedAt ? 'Knowledge challenge' : 'Rehearsal · screen answers'}
            </span>
            {runScore && (
              <span>
                {runScore.points} points · {runScore.combo} consecutive ·{' '}
                {runScore.assisted
                  ? 'Assisted practice'
                  : runScore.unassessed
                    ? 'Unassessed · no ranked result'
                    : 'No timing score'}
              </span>
            )}
            {best > 0 && <span>Comparable personal best: {best}</span>}
            <button className="secondary-button" disabled={!bank.length} onClick={startChallenge}>
              {run ? 'New challenge' : 'Try a knowledge challenge'}
            </button>
            <p>
              Up to five questions. 100 points per correct first answer. Help makes this assisted
              practice. Playing is not assessed.
            </p>
          </div>
        )}
        {stageActive && activeActivity === 'knowledge' && (
          <section className="stage-question" aria-label="Knowledge task">
            {panel}
          </section>
        )}
        {score && track && (
          <ProgressionWorkspace
            key={`${score.hash}:${track.id}:${localRevision}`}
            teacherOpen={teacherOpen}
            onTeacherOpenChange={setTeacherOpen}
            workload={studio.set.workload}
            activity={activeActivity}
            stageVisible={stageActive}
            bandmate={studio.set.bandmate}
            playing={player.playing}
            goalRevision={studio.set.goal}
            stageMode={run && !run.endedAt && !run.assisted ? 'challenge' : 'rehearsal'}
            onActivity={startActivity}
            listOutputs={async () => controller.current?.api.enumerateOutputDevices() ?? []}
            selectOutput={async (id) => {
              const c = controller.current;
              if (!c) return;
              const device = (await c.api.enumerateOutputDevices()).find((d) => d.deviceId === id);
              if (id && !device) throw new Error('This output is no longer available.');
              await c.api.setOutputDevice(device ?? null);
              c.clock.reset('Output changed; recalibration required.');
            }}
            earSeed={score.hash.startsWith('ear-study:') ? earStudy?.seed : undefined}
            onEarStudy={(study) => {
              finishInterrupted();
              playback.stopAll();
              setEarStudy(study);
              controller.current?.loadEarStudy(study);
              workspace.setMode('understand');
              workspace.setLoop(0, study.symbols.length - 1, true);
              studio.go('stage', 'progression');
            }}
            initialListeningDifficulty={listeningDifficulty}
            onTransfer={() =>
              openCatalogPassage(
                PASSAGES.find(
                  (p) => p.id === (score.hash.includes('original-g') ? 'original-c' : 'original-g'),
                )!,
                'transfer',
              )
            }
            onListeningMask={setListeningMasked}
            supportRecorder={recordSupport}
            onReplay={replayCatalog}
            audioReady={player.ready}
            onHomeworkPlayback={(study) => { stopAudition(); setCountIn(study.countIn); controller.current?.previewHomeworkStudy(study); }}
            onStudy={(study) => {
              stopAudition();
              controller.current?.previewPracticeStudy(study);
            }}
            onStopStudy={() => {
              stopAudition();
              controller.current?.pause();
              controller.current?.previewVariation(null, track.index);
            }}
            score={score}
            track={track}
            firstBar={loopStart}
            lastBar={loopEnd}
            active={stageActive && mode === 'understand'}
            compact={!desktop}
            showOctaves={showOctaves}
            currentTick={player.currentTick}
            onRange={(first, last) => workspace.setLoop(first, last, true)}
            onPreview={previewVariation}
            onExercises={setHarmonyBank}
            onPractice={practiceHarmony}
            onOpenHomework={() => {
              finishInterrupted();
              playback.stopAll();
              loadGeneration.current++;
              controller.current?.loadHomeworkDemo();
              workspace.setMode('understand');
              workspace.setLoop(0, 3, true);
              setSelection(null);
              setResult(null);
              setRevealed(false);
              setError('');
            }}
            onOpenStudy={openProgressionStudy}
            onAudition={listen}
            onAuditionScale={listenScale}
            onSelectNote={workspace.selectNote}
            onError={setError}
            teacher={{
              attempts,
              selectedNote: selectedNote ?? null,
              activeQuestion:
                mode === 'practice' && selection && !result?.correct && !revealed
                  ? selection
                  : null,
              onExercise: startTeacherExercise,
              onHelp: askTeacherForHelp,
              onUnderstand: () => {
                studio.go('stage', 'progression');
                finishInterrupted();
                workspace.setMode('understand');
                setSelection(null);
                setMobilePanel(false);
              },
            }}
          />
        )}
        <section
          className={`music-workspace ${listeningMasked || (activeActivity !== 'notation' && !(activeActivity === 'timeline' && stageSurface === 'notation')) ? 'assessment-masked' : ''}`}
          aria-hidden={
            listeningMasked ||
            (activeActivity !== 'notation' &&
              !(activeActivity === 'timeline' && stageSurface === 'notation')) ||
            undefined
          }
          inert={
            listeningMasked ||
            (activeActivity !== 'notation' &&
              !(activeActivity === 'timeline' && stageSurface === 'notation'))
          }
        >
          <div className="score-card">
            <div className="score-toolbar">
              <label className="track-select">
                <Music2 size={16} />
                <span className="sr-only">Instrument track</span>
                <select
                  aria-label="Instrument track"
                  value={trackIndex}
                  onChange={(e) => selectTrack(Number(e.target.value))}
                >
                  {score?.tracks.map((t) => (
                    <option key={t.id} value={t.index}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={13} />
              </label>
              <div className="label-switch" aria-label="Score labels">
                {(['hybrid', 'pitch', 'fret'] as LabelMode[]).map((value) => (
                  <button
                    key={value}
                    aria-pressed={labelMode === value}
                    disabled={mode === 'practice' && !result?.correct && !revealed}
                    onClick={() => workspace.setLabels(value)}
                  >
                    {value === 'hybrid' ? 'Notes + hints' : value === 'pitch' ? 'Notes' : 'Frets'}
                  </button>
                ))}
              </div>
              <label className="octave-toggle">
                <input
                  type="checkbox"
                  checked={showOctaves}
                  disabled={!hydrated || (mode === 'practice' && !result?.correct && !revealed)}
                  onChange={(event) => setShowOctaves(event.target.checked)}
                />
                Octaves
              </label>
              <label className="octave-toggle">
                <input
                  type="checkbox"
                  checked={staffNotation}
                  disabled={mode === 'practice' && !result?.correct && !revealed}
                  onChange={(event) => {
                    setStaffNotation(event.target.checked);
                    controller.current?.setStaffNotation(event.target.checked);
                  }}
                />
                Staff
              </label>
              <label className="zoom-control">
                <span className="sr-only">Notation zoom</span>
                <select
                  aria-label="Notation zoom"
                  value={zoom}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setZoom(next);
                    controller.current?.setZoom(next);
                  }}
                >
                  {[0.75, 1, 1.25, 1.5].map((value) => (
                    <option key={value} value={value}>
                      {Math.round(value * 100)}%
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="icon-button mobile-inspect"
                aria-label="Open practice details"
                onClick={() => setMobilePanel(true)}
              >
                <HelpCircle size={18} />
              </button>
            </div>
            <div className="tuning-strip">
              <span>
                {track?.tuningMidi.length
                  ? `${track.tuningMidi.length}-string tuning`
                  : 'Instrument'}
              </span>
              <strong>
                {mode === 'practice' &&
                selection?.support === 'hidden' &&
                kind === 'note-name' &&
                !result?.correct &&
                !revealed
                  ? 'Tuning names hidden for recall'
                  : track?.tuningMidi.map((n) => formatPitch(n, showOctaves)).join(' · ') ||
                    'Pitched notation'}
              </strong>
              <span>Capo {track?.capo ?? 0}</span>
              {mode === 'practice' &&
                selection?.support === 'hidden' &&
                !result?.correct &&
                !revealed && (
                  <span className="masked-badge">
                    <EyeIcon />
                    Answer clues hidden
                  </span>
                )}
            </div>
            <div
              className={`score-viewport ${mode === 'practice' ? 'practice-score' : ''}`}
              data-testid="score-viewport"
            >
              <div ref={host} className="alphatab-host" />
              {(!player.rendered || loading) && (
                <div className="score-loading" role="status">
                  <LoaderCircle size={22} className="spin" />
                  <span>{loading ? 'Reading your tab…' : 'Laying out the music…'}</span>
                </div>
              )}
            </div>
            <div className="score-footer">
              {mode === 'understand' && (
                <div className="note-navigation">
                  <button className="text-button" onClick={() => stepNote(-1)}>
                    Previous note
                  </button>
                  <button className="text-button" onClick={() => stepNote(1)}>
                    Next note
                  </button>
                  <span className="sr-only" aria-live="polite">
                    {selectedNote
                      ? `Selected ${displayNoteLabel(selectedNote, showOctaves)}, bar ${selectedNote.measureIndex + 1}`
                      : ''}
                  </span>
                </div>
              )}
              <span>
                <ShieldCheck size={14} />
                Your score stays on this device
              </span>
              <button
                className="text-button"
                onClick={() => {
                  if (mode === 'practice') {
                    setPanelTab('note');
                    if (desktop)
                      document
                        .querySelector('.learning-panel')
                        ?.scrollIntoView({ block: 'nearest' });
                    else setMobilePanel(true);
                  } else switchMode('understand');
                }}
              >
                {mode === 'practice' ? 'Open the question' : 'Select a note to explore'}
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
          {score?.warnings?.length ? (
            <details className="import-warnings">
              <summary>
                {score.warnings.length} import observation{score.warnings.length > 1 ? 's' : ''}
              </summary>
              <ul>
                {score.warnings.map((warning, i) => (
                  <li key={i}>{warning}</li>
                ))}
              </ul>
            </details>
          ) : null}
          <div className="phrase-controls">
            <div className="phrase-title">
              <Repeat2 size={17} />
              <strong>A little at a time</strong>
              <span>Loop your passage</span>
            </div>
            <div className="phrase-range">
              <label>
                From
                <select
                  aria-label="Loop start bar"
                  value={loopStart}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    workspace.setLoop(next, Math.max(next, loopEnd), looping);
                  }}
                >
                  {score?.measures.map((m, i) => (
                    <option key={i} value={i}>
                      Bar {m.index + 1}
                    </option>
                  ))}
                </select>
              </label>
              <ArrowRight size={14} />
              <label>
                To
                <select
                  aria-label="Loop end bar"
                  value={loopEnd}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    workspace.setLoop(Math.min(next, loopStart), next, looping);
                  }}
                >
                  {score?.measures.map((m, i) => (
                    <option key={i} value={i}>
                      Bar {m.index + 1}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className={`loop-toggle ${looping ? 'active' : ''}`}
                aria-pressed={looping}
                onClick={() => workspace.setLoop(loopStart, loopEnd, !looping)}
              >
                <Repeat2 size={16} />
                {looping ? 'Loop on' : 'Loop off'}
              </button>
            </div>
          </div>
          <div className="workspace-footnote">
            <Headphones size={15} />
            <span>Make room for one idea. You can always slow the song down.</span>
            <button className="text-button" onClick={() => setModal('library')}>
              Open a different song
              <FolderOpen size={14} />
            </button>
          </div>
        </section>
        {desktop &&
          stageActive &&
          activeActivity === 'notation' &&
          mode === 'understand' &&
          !masked && (
            <aside className="learning-panel">
              <div className="panel-tabs">
                <button
                  className={panelTab === 'note' ? 'active' : ''}
                  aria-pressed={panelTab === 'note'}
                  onClick={() => changePanel('note')}
                >
                  Explore the neck
                </button>
                <button
                  className={panelTab === 'coach' ? 'active' : ''}
                  aria-pressed={panelTab === 'coach'}
                  onClick={() => changePanel('coach')}
                >
                  Practice guide
                </button>
              </div>
              <div className="panel-body">{panel}</div>
            </aside>
          )}
      </main>
      <footer className="transport" hidden={!stageActive}>
        <div className="transport-main">
          <button
            className="stop-button"
            aria-label="Stop playback"
            onClick={() => {
              stopAudition();
              controller.current?.stop();
            }}
          >
            <Square size={14} />
          </button>
          <button
            className="play-button"
            aria-label={player.playing ? 'Pause playback' : 'Play score'}
            disabled={!player.ready}
            onClick={() => {
              stopAudition();
              controller.current?.playPause();
            }}
          >
            {player.playing ? (
              <Pause size={20} fill="currentColor" />
            ) : (
              <Play size={20} fill="currentColor" />
            )}
          </button>
          <div className="transport-title">
            <strong>{track?.name ?? 'Guitar'}</strong>
            <span>{player.ready ? 'Space to play / pause' : 'Preparing audio…'}</span>
          </div>
          <span className="time-label">{time(player.currentTime)}</span>
        </div>
        <div className="scrubber">
          <input
            type="range"
            aria-label="Playback position"
            min={0}
            max={Math.max(1, player.endTick)}
            value={Math.min(player.currentTick, Math.max(1, player.endTick))}
            onChange={(e) => controller.current?.seek(Number(e.target.value))}
          />
          <span>{time(player.endTime)}</span>
        </div>
        <div className="transport-tools">
          <button
            className="tool-button stage-loop-button"
            aria-label="Loop selected passage"
            aria-pressed={looping}
            onClick={() => workspace.setLoop(loopStart, loopEnd, !looping)}
          >
            <Repeat2 size={18} />
            <span>Loop</span>
          </button>
          <label className="speed-control">
            <span>Speed</span>
            <select
              aria-label="Playback speed"
              value={speed}
              onChange={(e) => workspace.setSpeed(Number(e.target.value))}
            >
              {[0.25, 0.5, 0.65, 0.75, 0.85, 1, 1.25, 1.5].map((s) => (
                <option key={s} value={s}>
                  {Math.round(s * 100)}%
                </option>
              ))}
            </select>
          </label>
          <button
            className={`tool-button ${metronome ? 'active' : ''}`}
            aria-label="Metronome"
            aria-pressed={metronome}
            onClick={() => {
              controller.current?.setMetronome(!metronome);
              setMetronome(!metronome);
            }}
          >
            <MetronomeIcon />
          </button>
          <button
            className={`tool-button count-in ${countIn ? 'active' : ''}`}
            aria-label="Count in"
            aria-pressed={countIn}
            onClick={() => {
              controller.current?.setCountIn(!countIn);
              setCountIn(!countIn);
            }}
          >
            1·2
          </button>
          <button
            className="tool-button"
            aria-label="Volume and mixer"
            onClick={() => setModal('mixer')}
          >
            <Volume2 size={19} />
          </button>
        </div>
      </footer>
      <Modal
        open={recap}
        onOpenChange={setRecap}
        title="Keep the idea going."
        description="A bookmark is a place to return, not a deadline."
      >
        <p>{activity(activeActivity).title}</p>
        {runScore && (
          <p>
            {runScore.correct}/{runScore.correct + runScore.incorrect} supported correct first
            answers · {runScore.assisted ? 'assisted' : 'without help'} · {runScore.unassessed}{' '}
            unassessed. Knowledge, not playing.
          </p>
        )}
        <label>
          What would you like to try next? (optional)
          <textarea
            className="field-input"
            maxLength={1000}
            value={reflection}
            onChange={(e) => setReflection(e.target.value)}
          />
        </label>
        <div className="recap-actions">
          <button
            className="primary-button"
            onClick={() => {
              setRecap(false);
              if (activeActivity === 'knowledge') nextQuestion();
            }}
          >
            Try again
          </button>
          <button
            className="secondary-button"
            onClick={() => startActivity(activity(activeActivity).next)}
          >
            Try elsewhere
          </button>
          <button
            className="secondary-button"
            onClick={() => {
              studio.change({ reflection });
              setRecap(false);
              studio.go('studio');
            }}
          >
            Save for next time
          </button>
        </div>
      </Modal>
      <Modal
        feedback={feedback}
        open={!desktop && mobilePanel && activeActivity === 'notation'}
        onOpenChange={setMobilePanel}
        title={
          mode === 'practice'
            ? 'Your exercise'
            : mode === 'understand'
              ? 'Inside the notes'
              : 'Your practice room'
        }
        description="Explore one idea from your song."
      >
        {!desktop && mobilePanel ? panel : null}
      </Modal>
      <Modal
        feedback={feedback}
        open={modal === 'library'}
        onOpenChange={(open) => !open && setModal(null)}
        title="Your song shelf"
        description="Files are saved in this browser. Nothing is uploaded when you import a tab."
      >
        <button className="library-entry demo-entry" onClick={() => openProgressionStudy()}>
          <span className="file-icon">
            <FileMusic size={23} />
          </span>
          <span>
            <strong>One progression, many places</strong>
            <small>Original ii–V–I–vi · Seventh chords · CC0</small>
          </span>
          <ArrowRight size={18} />
        </button>
        <button
          className="library-entry demo-entry"
          disabled={dataOperation.current}
          onClick={() => {
            loadGeneration.current++;
            finishInterrupted();
            controller.current?.loadDemo();
            setLoading(false);
            setError('');
            setNotice('');
            workspace.setMode('play');
            setModal(null);
          }}
        >
          <span className="file-icon">
            <FileMusic size={23} />
          </span>
          <span>
            <strong>A shape, two meanings</strong>
            <small>Original study · Guitar + bass · Always available</small>
          </span>
          <ArrowRight size={18} />
        </button>
        {library.map((entry) => (
          <div className="library-row" key={entry.id}>
            <button className="library-entry" onClick={() => void openSavedFile(entry)}>
              <span className="file-icon">
                <FileMusic size={21} />
              </span>
              <span>
                <strong>{entry.name}</strong>
                <small>{new Date(entry.savedAt).toLocaleDateString()} · On this device</small>
              </span>
            </button>
            <button
              className="icon-button"
              aria-label={`Remove ${entry.name}`}
              onClick={async () => {
                try {
                  await local.removeScore(entry.id);
                } catch {
                  setError('Your browser could not remove this file. Please try again.');
                }
              }}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        <button
          className="primary-button full-width"
          onClick={() => {
            setModal(null);
            fileInput.current?.click();
          }}
        >
          <Upload size={16} />
          Import Guitar Pro file
        </button>
        <p className="caption">.gp · .gp3 · .gp4 · .gp5 · .gpx · Up to 20 MB</p>
      </Modal>
      <Modal
        feedback={feedback}
        open={modal === 'settings'}
        onOpenChange={(open) => !open && setModal(null)}
        title="Your practice, your data"
        description="Progress and imported files live in this browser. Export a backup to move your recall history to another device."
      >
        <label className="settings-zoom">
          Notation zoom
          <select
            value={zoom}
            onChange={(event) => {
              const next = Number(event.target.value);
              setZoom(next);
              controller.current?.setZoom(next);
            }}
          >
            {[0.75, 1, 1.25, 1.5].map((value) => (
              <option key={value} value={value}>
                {Math.round(value * 100)}%
              </option>
            ))}
          </select>
        </label>
        <div className="settings-actions">
          <button
            className="secondary-button"
            onClick={() =>
              void exportProgress(attempts, {
                studio: studio.set,
                stageRuns: [
                  ...new Map([...savedRuns, ...(run ? [run] : [])].map((r) => [r.id, r])).values(),
                ].slice(-200),
              })
                .then((complete) => {
                  if (!complete)
                    notify(
                      'Recall history exported from memory. Saved variations could not be read; export them from the progression panel if available.',
                    );
                })
                .catch(() => setError('The browser could not create a backup download.'))
            }
          >
            <ArrowDownToLine size={17} />
            Export progress
          </button>
          <button className="secondary-button" onClick={() => backupInput.current?.click()}>
            <Upload size={17} />
            Import progress
          </button>
        </div>
        <section className="inspector-section">
          <h3>What is measured?</h3>
          <p className="small-muted">
            First-answer recall, assistance, and delayed questions stay separate from playing. Live
            guitar input is optional and experimental; it reports sounding-pitch evidence, not
            verified fingering or technique. Audio stays local and transient by default.
          </p>
        </section>
        <button
          className="danger-button"
          disabled={loading || !hydrated}
          onClick={async () => {
            if (
              !window.confirm(
                'Delete all saved tabs, settings, and practice history from this browser? Export a backup first if you want to keep them.',
              )
            )
              return;
            dataOperation.current = true;
            loadGeneration.current++;
            controller.current?.cancelPendingLoad();
            currentAttempt.current.completed = true;
            setSelection(null);
            setResult(null);
            setRevealed(false);
            setLoading(true);
            try {
              await studio.flush();
              await local.clear();
              setRun(null);
              setSavedRuns([]);
              window.dispatchEvent(new Event('studio-restored'));
              setLocalRevision((value) => value + 1);
              controller.current?.previewVariation(null);
              setError('');
              notify('Local files and practice history deleted.');
              setModal(null);
            } catch {
              setError(
                'Your browser could not delete its saved data. Try again or clear this site’s storage in browser settings.',
              );
            } finally {
              dataOperation.current = false;
              setLoading(false);
            }
          }}
        >
          Delete local data
        </button>
      </Modal>
      <Modal
        feedback={feedback}
        open={modal === 'mixer'}
        onOpenChange={(open) => !open && setModal(null)}
        title="Make room for your part"
        description="Mute the guitar to play along, or solo a part to hear it clearly."
      >
        <div className="mobile-audio-options">
          <button
            className="secondary-button"
            aria-pressed={metronome}
            onClick={() => {
              controller.current?.setMetronome(!metronome);
              setMetronome(!metronome);
            }}
          >
            Metronome {metronome ? 'on' : 'off'}
          </button>
          <button
            className="secondary-button"
            aria-pressed={countIn}
            onClick={() => {
              controller.current?.setCountIn(!countIn);
              setCountIn(!countIn);
            }}
          >
            Count-in {countIn ? 'on' : 'off'}
          </button>
        </div>
        <label className="mixer-master">
          Master volume
          <input
            aria-label="Master volume"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            onChange={(e) => {
              const v = Number(e.target.value);
              setVolume(v);
              controller.current?.setMasterVolume(v);
            }}
          />
        </label>
        {score?.tracks.map((t) => (
          <div className="mixer-track" key={t.id}>
            <div>
              <Music2 size={17} />
              <strong>{t.name}</strong>
            </div>
            <button
              aria-pressed={!!mutes[t.index]}
              onClick={() => {
                const value = !mutes[t.index];
                setMutes((s) => ({ ...s, [t.index]: value }));
                controller.current?.setTrackMute(t.index, value);
              }}
            >
              Mute
            </button>
            <button
              aria-pressed={!!solos[t.index]}
              onClick={() => {
                const value = !solos[t.index];
                setSolos((s) => ({ ...s, [t.index]: value }));
                controller.current?.setTrackSolo(t.index, value);
              }}
            >
              Solo
            </button>
          </div>
        ))}
      </Modal>
      {dragging && (
        <div className="drop-overlay">
          <Upload size={38} />
          <h2>Bring your song.</h2>
          <p>Drop a Guitar Pro file to open it on this device.</p>
        </div>
      )}
    </div>
  );
}
function MetronomeIcon() {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
    >
      <path d="m6 21 4-18h4l4 18H6ZM12 15l6-10M8 18h8" />
    </svg>
  );
}
function EyeIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M3 3l18 18M10 5C5 6 2 12 2 12s4 7 10 7c2 0 4-1 6-2M14 5c5 1 8 7 8 7l-2 3" />
    </svg>
  );
}
