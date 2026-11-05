import { passageForSource } from '../songs/catalog';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  analyzeHarmony,
  buildHarmonySpans,
  extractMelodyAnchors,
  HARMONY_VERSION,
  parseChordSymbol,
  scaleTones,
  type HarmonicContext,
  type HarmonySpan,
  type ProgressionResult,
  type ProgressionVariation,
} from '../engine/harmony';
import { createHarmonyExercises } from '../engine/harmony-exercises';
import type { ExerciseDefinition, ExerciseKind, ScoreDocument, ScoreTrack } from '../engine/types';
import { soundingAt } from '../engine/theory';
import {
  DEFAULT_ARRANGEMENT_CONSTRAINTS,
  type ArrangementConstraints,
} from '../shared/arrangements';
import { listVariations, saveVariation, type SavedVariation } from '../storage';
import { progressionStudy, progressionStudyTonic } from '../player/demo';

const contextId = (text: string) => {
  let hash = 2166136261;
  for (const char of text) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `harmony-v1:${(hash >>> 0).toString(36)}`;
};

export interface ProgressionSessionInput {
  score: ScoreDocument;
  track: ScoreTrack;
  firstBar: number;
  lastBar: number;
  active: boolean;
  compact: boolean;
  showOctaves: boolean;
  currentTick: number;
  onRange(first: number, last: number): void;
  onPreview(variation: ProgressionVariation | null): void;
  onExercises(exercises: ExerciseDefinition[]): void;
  onPractice(kind: ExerciseKind): void;
  onOpenStudy(tonic?: string): void;
  onAuditionScale(tonic: number, pitches: number[]): void;
  onAudition(pitches: number[]): void;
  onSelectNote(id: string): void;
  onError(message: string): void;
}

/** Shared controls, generation and preview lifecycle for manual exploration and teaching. */
export function useProgressionSession(props: ProgressionSessionInput) {
  const { score, track, firstBar, lastBar, active, currentTick } = props;
  const callbacks = useRef(props);
  callbacks.current = props;
  const [barGrid, setBarGrid] = useState(false);
  const [symbols, setSymbols] = useState<Record<string, string>>({});
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState(0);
  const [operation, setOperation] = useState<'move' | 'color' | 'substitute'>('move');
  const catalogPassage = passageForSource(score.hash);
  const [context, setContext] = useState<HarmonicContext | null>(
    catalogPassage
      ? { tonic: catalogPassage.tonic, mode: 'ionian' }
      : progressionStudyTonic(score.hash)
        ? { tonic: progressionStudyTonic(score.hash)!, mode: 'ionian' }
        : null,
  );
  const [options, setOptions] = useState<ArrangementConstraints>({
    ...DEFAULT_ARRANGEMENT_CONSTRAINTS,
    maxFret: 5,
    omitFifth: true,
  });
  const [melodyVoice, setMelodyVoice] = useState('');
  const [result, setResult] = useState<ProgressionResult | null>(null);
  const [working, setWorking] = useState(false);
  const [path, setPath] = useState(0);
  const [previewing, setPreviewing] = useState(false);
  const [message, setMessage] = useState('');
  const [saved, setSaved] = useState<SavedVariation[]>([]);
  const [applied, setApplied] = useState<SavedVariation | null>(null);
  const previousApplied = useRef<SavedVariation | null>(null);
  const [restoreRevision, setRestoreRevision] = useState(0);
  const restorePreview = useRef(false);
  const [scaleVisible, setScaleVisible] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [targetsVisible, setTargetsVisible] = useState(false);
  const preferredPath = useRef(0);
  const preferredVariation = useRef<string | null>(null);
  const preferredShape = useRef<string | null>(null);
  const worker = useRef<Worker | null>(null);
  const first = score.measures[firstBar],
    last = score.measures[lastBar];
  const rangeValid = Boolean(first && last && lastBar >= firstBar && lastBar - firstBar < 8);
  const start = first?.startTicks ?? 0,
    end = (last?.startTicks ?? 0) + (last?.durationTicks ?? 0);
  const sourceSpans = useMemo(() => {
    if (!rangeValid || track.tuningMidi.length !== 6 || track.supported === false) return [];
    const spans: HarmonySpan[] = catalogPassage
      ? catalogPassage.chords
          .map((chord, index) => {
            const measure = score.measures[index]!;
            return {
              id: `catalog-span:${catalogPassage.id}:${index}`,
              startTick: measure.startTicks,
              endTick: measure.startTicks + measure.durationTicks,
              sourceNoteIds: track.notes.filter((n) => n.measureIndex === index).map((n) => n.id),
              chord: parseChordSymbol(chord.symbol),
              confirmation: 'confirmed' as const,
              source: 'catalog' as const,
            };
          })
          .filter((s) => s.startTick >= start && s.endTick <= end)
      : barGrid
        ? score.measures.slice(firstBar, lastBar + 1).map((measure) => {
            const notes = soundingAt(track.notes, measure.startTicks);
            const analysis = track.harmonySupported === false ? null : analyzeHarmony(notes);
            const chord =
              analysis?.status === 'supported' ? analysis.interpretations[0]!.chord : null;
            return {
              id: `${track.id}:bar:${measure.index}`,
              startTick: measure.startTicks,
              endTick: measure.startTicks + measure.durationTicks,
              sourceNoteIds: notes.map((note) => note.id),
              chord,
              confirmation: 'suggested',
              source: 'inferred',
              alternatives: analysis?.interpretations.map((item) => item.chord),
            };
          })
        : buildHarmonySpans(track, start, end);
    return spans.map((span) => {
      const authored = progressionStudyTonic(score.hash)
        ? progressionStudy(progressionStudyTonic(score.hash)!).symbols[
            score.measures.findIndex(
              (measure) =>
                span.startTick >= measure.startTicks &&
                span.startTick < measure.startTicks + measure.durationTicks,
            )
          ]
        : undefined;
      const imported = track.chordSymbols
        ?.filter((item) => item.startTick <= span.startTick)
        .at(-1)?.symbol;
      const manual = symbols[span.id];
      const text = manual ?? authored ?? imported;
      const chord = text ? parseChordSymbol(text) : span.chord;
      const melody = melodyVoice
        ? track.notes.filter((note) => `${note.staffIndex}:${note.voiceIndex}` === melodyVoice)
        : [];
      const anchors = melodyVoice
        ? extractMelodyAnchors(melody, span.startTick, span.endTick)
        : null;
      return {
        ...span,
        chord,
        confirmation: manual || authored ? ('confirmed' as const) : span.confirmation,
        source: manual
          ? ('manual' as const)
          : authored || imported
            ? ('imported' as const)
            : span.source,
        melodyAnchors: anchors?.status === 'ok' ? anchors.anchors : undefined,
      };
    });
  }, [score, track, rangeValid, firstBar, lastBar, start, end, barGrid, symbols, melodyVoice]);
  const spans = useMemo(
    () =>
      sourceSpans.map((span) => ({
        ...span,
        chord: targets[span.id] ? parseChordSymbol(targets[span.id]!) : span.chord,
      })),
    [sourceSpans, targets],
  );
  const valid =
    spans.length > 0 &&
    spans.length <= 8 &&
    spans.every((span) => span.confirmation === 'confirmed' && span.chord);
  const generationKey = JSON.stringify([
    spans,
    options,
    track.tuningMidi,
    track.capo,
    restoreRevision,
  ]);
  useEffect(() => {
    const generator = new Worker(new URL('../engine/harmony.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.current = generator;
    return () => {
      generator.terminate();
      worker.current = null;
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    void listVariations(score.hash, track.id)
      .then((values) => {
        if (!cancelled) setSaved(values);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [score.hash, track.id]);
  useEffect(() => {
    const generator = worker.current;
    setResult(null);
    setPreviewing(false);
    callbacks.current.onPreview(null);
    if (!valid || !generator) {
      setWorking(false);
      return;
    }
    const id = crypto.randomUUID();
    setWorking(true);
    const listener = (
      event: MessageEvent<{ id: string; result?: ProgressionResult; error?: string }>,
    ) => {
      if (event.data.id !== id) return;
      setWorking(false);
      if (event.data.result) {
        setResult(event.data.result);
        const restored = preferredShape.current
          ? event.data.result.variations.findIndex(
              (item) => shapeSignature(item) === preferredShape.current,
            )
          : preferredVariation.current
            ? event.data.result.variations.findIndex(
                (item) => item.id === preferredVariation.current,
              )
            : -1;
        setPath(
          restored >= 0
            ? restored
            : Math.min(preferredPath.current, Math.max(0, event.data.result.variations.length - 1)),
        );
        if ((preferredVariation.current || preferredShape.current) && restored < 0)
          setMessage(
            'The saved path is unavailable under this engine version. Review the newly generated alternatives.',
          );
        if (restorePreview.current && restored >= 0) {
          try {
            callbacks.current.onPreview(event.data.result.variations[restored]!);
            setPreviewing(true);
          } catch (error) {
            callbacks.current.onError(
              error instanceof Error ? error.message : 'The restored variation could not play.',
            );
          }
        }
        restorePreview.current = false;
        preferredPath.current = 0;
        preferredVariation.current = null;
        preferredShape.current = null;
      } else setMessage(event.data.error ?? 'The variation could not be generated.');
    };
    const failed = () => {
      setWorking(false);
      setMessage('The local search could not finish. Change a control to try again.');
    };
    generator.addEventListener('message', listener);
    generator.addEventListener('error', failed);
    generator.postMessage({ id, spans, tuning: track.tuningMidi, capo: track.capo, options });
    return () => {
      generator.removeEventListener('message', listener);
      generator.removeEventListener('error', failed);
    };
  }, [generationKey, valid]);
  const variation = result?.variations[path] ?? null;
  const exerciseKey = JSON.stringify([sourceSpans, variation, options.minFret, options.maxFret]);
  useEffect(() => {
    callbacks.current.onExercises(
      createHarmonyExercises(score, track, sourceSpans, variation, {
        minFret: options.minFret,
        maxFret: options.maxFret,
      }),
    );
  }, [exerciseKey, score, track]);
  useEffect(() => {
    if (!active && previewing) {
      callbacks.current.onPreview(null);
      setPreviewing(false);
    }
  }, [active, previewing]);
  const selectedIndex = Math.min(selected, Math.max(0, spans.length - 1));
  const span = spans[selectedIndex],
    sourceSpan = sourceSpans[selectedIndex];
  const event = variation?.events.find((item) => item.spanId === span?.id);
  const chord = span?.chord;
  const toneSet = context ? scaleTones(context) : [];
  const monophonic = [
    ...new Set(track.notes.map((note) => `${note.staffIndex}:${note.voiceIndex}`)),
  ].filter(
    (voice) =>
      sourceSpans.length &&
      sourceSpans.every(
        (item) =>
          extractMelodyAnchors(
            track.notes.filter((note) => `${note.staffIndex}:${note.voiceIndex}` === voice),
            item.startTick,
            item.endTick,
          ).status === 'ok',
      ),
  );
  const playback = score.playbackOccurrences?.find(
    (item) => currentTick >= item.startTick && currentTick < item.endTick,
  );
  const notationTick = playback
    ? score.measures[playback.measureIndex]!.startTicks + currentTick - playback.startTick
    : currentTick;
  const contextVersion = contextId(
    JSON.stringify([score.hash, track.id, spans, context, options, selectedIndex]),
  );
  function show(variation: ProgressionVariation | null) {
    try {
      callbacks.current.onPreview(variation);
      setPreviewing(Boolean(variation));
      setMessage('');
      return true;
    } catch (error) {
      callbacks.current.onError(
        error instanceof Error ? error.message : 'This variation could not play.',
      );
      return false;
    }
  }
  function changeOptions(patch: Partial<ArrangementConstraints>) {
    setOptions((previous) => ({ ...previous, ...patch }));
    setMessage('');
  }
  function pickChord(symbol: string) {
    if (span) setSymbols((previous) => ({ ...previous, [span.id]: symbol }));
  }
  function targetChord(symbol: string) {
    if (span) setTargets((previous) => ({ ...previous, [span.id]: symbol }));
  }
  async function apply() {
    if (!variation) return;
    const item: SavedVariation = {
      id: crypto.randomUUID(),
      version: HARMONY_VERSION,
      sourceHash: score.hash,
      trackId: track.id,
      savedAt: Date.now(),
      firstBar,
      lastBar,
      barGrid,
      symbols,
      targets,
      context,
      options,
      melodyVoice,
      variationId: variation.id,
    };
    if (!show(variation)) return;
    previousApplied.current = applied;
    setApplied(item);
    setSaved((previous) => [item, ...previous]);
    try {
      await saveVariation(item);
      setMessage('Variation saved on this device. The imported score is unchanged.');
    } catch {
      setMessage(
        'The variation is active, but storage is unavailable. Use Export variations below before closing this session.',
      );
    }
  }
  function restore(item: SavedVariation, preview = false) {
    restorePreview.current = preview;
    setRestoreRevision((value) => value + 1);
    props.onRange(item.firstBar, item.lastBar);
    setBarGrid(item.barGrid);
    setSymbols(item.symbols);
    setTargets(item.targets);
    setContext(item.context);
    setOptions(item.options);
    setMelodyVoice(item.melodyVoice);
    preferredPath.current = 0;
    preferredVariation.current = item.variationId;
    setMessage('Saved controls restored. Preview the regenerated variation before applying it.');
  }
  function loadProposal(
    constraints: ArrangementConstraints,
    proposedSpans: HarmonySpan[],
    proposed: ProgressionVariation,
    preview = true,
  ) {
    if (proposedSpans.length !== sourceSpans.length)
      throw new Error('The proposed passage changed.');
    preferredShape.current = shapeSignature(proposed);
    restorePreview.current = preview;
    setRestoreRevision((value) => value + 1);
    setOptions(constraints);
    setTargets(
      Object.fromEntries(
        proposedSpans.map((item, index) => [sourceSpans[index]!.id, item.chord!.symbol]),
      ),
    );
    setMessage(
      'The verified proposal is loaded in the shared controls. Apply & save keeps a separate variation.',
    );
  }
  return {
    barGrid,
    setBarGrid,
    symbols,
    setSymbols,
    targets,
    setTargets,
    selectedIndex,
    setSelected,
    operation,
    setOperation,
    context,
    setContext,
    options,
    setOptions,
    melodyVoice,
    setMelodyVoice,
    result,
    working,
    path,
    setPath,
    previewing,
    message,
    setMessage,
    saved,
    applied,
    setApplied,
    previousApplied,
    scaleVisible,
    setScaleVisible,
    contextOpen,
    setContextOpen,
    targetsVisible,
    setTargetsVisible,
    preferredPath,
    sourceSpans,
    spans,
    valid,
    rangeValid,
    variation,
    span,
    sourceSpan,
    event,
    chord,
    toneSet,
    monophonic,
    notationTick,
    contextVersion,
    show,
    changeOptions,
    pickChord,
    targetChord,
    apply,
    restore,
    loadProposal,
  };
}

function shapeSignature(variation: ProgressionVariation): string {
  return JSON.stringify(
    variation.events.map((event) => [event.startTick, event.endTick, event.voicing.id]),
  );
}

export type ProgressionSession = ReturnType<typeof useProgressionSession>;
