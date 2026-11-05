import { useEffect, useRef, useState } from 'react';
import type { LessonEvent } from '../lesson-storage';
import type { LearningSession } from '../hooks/useListeningSession';
import {
  audioAssetSchema,
  type AudioJob,
  type AudioJobReceipt,
  type AudioReview,
  type AudioNote,
  type EarAction,
} from '../shared/audio';
import {
  earContext,
  earMasked,
  gradeEarProposal,
  hasEarReference,
  reviewedNotes,
  EAR_REFERENCE,
  type EarState,
  type EarStudy,
} from './model';
import { parsePitch } from '../engine/theory';
import { parseChordSymbol } from '../engine/harmony';
import { playback } from '../player/PlaybackCoordinator';
export async function audioApi<T>(
  path: string,
  body?: unknown,
  method = body ? 'POST' : 'GET',
): Promise<T> {
  const r = await fetch('/api/audio/' + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok)
    throw new Error('Local audio operation failed. Your source and answers are unchanged.');
  return r.json() as Promise<T>;
}
export function useEarSession(
  learning: LearningSession,
  onMask: (masked: boolean) => void,
  onWorkspace: (study: EarStudy) => void,
  seed?: EarState,
  onAudition?: (notes: number[]) => void,
) {
  const [state, setState] = useState<EarState | null>(seed ?? null);
  const [job, setJob] = useState<AudioJob | null>(null),
    [notes, setNotes] = useState<AudioNote[]>([]);
  const [reviews, setReviews] = useState<AudioReview[]>([]);
  const [enabled, setEnabled] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const [command, setCommand] = useState(0);
  const [capabilities, setCapabilities] = useState({
    transcribe: false,
    separate: false,
    corroborate: false,
    timing: false,
    researchMode: false,
  });
  const current = useRef(state);
  current.current = state;
  const callbacks = useRef({ learning, onMask, onWorkspace, onAudition });
  callbacks.current = { learning, onMask, onWorkspace, onAudition };
  const token = useRef(0);
  useEffect(() => {
    let active = true;
    void audioApi<{
      enabled: boolean;
      models?: { transcribe: boolean; separate: boolean; corroborate: boolean; timing: boolean };
      researchMode?: boolean;
    }>('health')
      .then((r) => {
        if (active) {
          setEnabled(r.enabled);
          if (r.models) setCapabilities({ ...r.models, researchMode: !!r.researchMode });
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!current.current && learning.lesson?.ear) {
      setState({ ...learning.lesson.ear, activeQuestion: false });
    }
  }, [learning.lesson?.id]);
  function change(
    next: EarState,
    kind:
      | 'audio-change'
      | 'audio-response'
      | 'audio-assistance'
      | 'audio-replay'
      | 'audio-review' = 'audio-change',
    detail = 'Ear workspace changed.',
    audioEvidence?: LessonEvent['audioEvidence'],
  ) {
    current.current = next;
    setState(next);
    callbacks.current.learning.record(
      {
        ear: next,
        source: { kind: 'audio-excerpt', assetId: next.asset.id, revision: next.revision },
      },
      [],
      [
        {
          kind,
          detail,
          exposureKeys: kind === 'audio-assistance' ? ['ear:revealed'] : [],
          ...(audioEvidence ? { audioEvidence } : {}),
        },
      ],
    );
  }
  function revise(patch: Partial<EarState>, kind?: Parameters<typeof change>[1], detail?: string) {
    const s = current.current;
    if (!s) return;
    change({ ...s, ...patch, revision: crypto.randomUUID() }, kind, detail);
  }
  useEffect(() => {
    onMask(earMasked(state));
  }, [state?.activeQuestion, state?.assisted]);
  useEffect(
    () => () => {
      callbacks.current.onMask(false);
      token.current++;
      playback.stopAll();
    },
    [],
  );
  useEffect(() => {
    if (!state?.jobId) {
      setJob(null);
      setNotes([]);
      setReviews([]);
      return;
    }
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const j = await audioApi<AudioJob>('jobs/' + state.jobId);
        if (!active) return;
        setJob(j);
        if (j.status === 'completed' && j.result) {
          const reviews = await audioApi<AudioReview[]>('jobs/' + j.id + '/reviews');
          if (!active) return;
          setReviews(reviews);
          setNotes(reviewedNotes(j.result.notes, reviews));
          setMessage('Analysis is ready. Reveal the draft when you want to compare it.');
        } else if (j.status === 'failed')
          setMessage(
            'Analysis unavailable: ' +
              j.error +
              '. You can keep listening and testing your own proposal.',
          );
        else if (j.status === 'queued' || j.status === 'running')
          timer = setTimeout(() => void poll(), 1000);
      } catch {
        if (active)
          setMessage(
            'This analysis is unavailable on this computer. The saved source reference remains in your lesson.',
          );
      }
    };
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [state?.jobId]);
  async function loadDemo() {
    const generation = ++token.current;
    setBusy(true);
    try {
      const r = await audioApi<{ asset: unknown }>('demo', {});
      if (generation !== token.current) return;
      load(audioAssetSchema.parse(r.asset));
      setMessage('Original synthesized passage. Listen before opening its notes.');
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function load(asset: ReturnType<typeof audioAssetSchema.parse>) {
    playback.stopAll();
    setJob(null);
    setNotes([]);
    change({
      asset,
      revision: crypto.randomUUID(),
      start: 0,
      end: Math.min(asset.duration, 30),
      proposal: ['', ''],
      jobId: null,
      draftVisible: false,
      assisted: false,
      activeQuestion: false,
      completed: false,
      replayCount: 0,
    });
  }
  async function upload(file: File, permission: string) {
    if (file.size > 32 * 1024 * 1024) {
      setMessage('Choose an audio file under 32 MB.');
      return;
    }
    const generation = ++token.current;
    setBusy(true);
    try {
      const r = await fetch('/api/audio/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream', 'X-Audio-Permission': permission },
        body: file,
      });
      if (!r.ok)
        throw new Error('Audio import failed. Use a mono or stereo recording under ten minutes.');
      const asset = audioAssetSchema.parse(await r.json());
      if (generation === token.current) load(asset);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function assist(reason = 'Teacher help requested.') {
    if (!current.current) return;
    revise({ assisted: true }, 'audio-assistance', reason);
  }
  function reveal() {
    assist('Draft displayed; this is assistance, not a verified answer.');
    revise({ draftVisible: true });
  }
  async function analyze(stages: AudioJob['stages'] = ['transcribe', 'timing']) {
    const s = current.current;
    if (!s) return;
    const generation = token.current;
    setBusy(true);
    setMessage('Submitting local analysis…');
    try {
      const j = await audioApi<AudioJob>('jobs', {
        assetId: s.asset.id,
        start: s.start,
        end: s.end,
        stages,
        contextRevision: s.revision,
      });
      if (generation !== token.current || current.current?.revision !== s.revision) return;
      setJob(j);
      revise({ jobId: j.id, draftVisible: false });
      setMessage('Local analysis queued. Keep listening while it runs.');
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function correct(noteId: string, midi: number | null) {
    const s = current.current;
    if (!s || !job || job.status !== 'completed') return;
    const sourceId = s.asset.id,
      jobId = job.id;
    assist('A transcription correction was inspected.');
    try {
      const review = await audioApi<AudioReview>('reviews', {
        jobId: job.id,
        contextRevision: job.contextRevision,
        decisions: [
          {
            noteId,
            decision: midi === null ? 'reject' : 'replace',
            ...(midi === null ? {} : { midi }),
          },
        ],
      });
      if (current.current?.asset.id !== sourceId || current.current?.jobId !== jobId) return;
      setReviews((rs) => [...rs, review]);
      setNotes((ns) =>
        midi === null
          ? ns.filter((n) => n.id !== noteId)
          : ns.map((n) =>
              n.id === noteId
                ? { ...n, midi, authority: 'learner-confirmed', confidence: null }
                : n,
            ),
      );
      revise({}, 'audio-review', 'Learner correction saved. It is not an independent reference.');
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  function workspace() {
    const s = current.current;
    if (!s || !s.proposal.every((v) => parseChordSymbol(v))) {
      setMessage('Enter a valid chord at each change first.');
      return;
    }
    assist('Opening a derived accompaniment.');
    callbacks.current.onWorkspace({
      id: crypto.randomUUID(),
      symbols: s.proposal,
      secondsPerChord: (s.end - s.start) / s.proposal.length,
      seed: { ...current.current!, activeQuestion: false, completed: true },
    });
  }
  async function answer() {
    const s = current.current;
    if (!s) return;
    const result = gradeEarProposal(s);
    change(
      { ...s, revision: crypto.randomUUID(), activeQuestion: false, completed: true },
      'audio-response',
      result ? 'Answered authored listening stimulus.' : 'Saved an exploration proposal.',
      {
        assetId: s.asset.id,
        start: s.start,
        end: s.end,
        referenceVersion: result ? EAR_REFERENCE.version : null,
        proposal: s.proposal,
        assisted: s.assisted,
        replayCount: s.replayCount,
        grade: result?.map(({ root, quality }) => ({ root, quality })) ?? null,
      },
    );
    setMessage('Saving this response…');
    const saved = await callbacks.current.learning.flush();
    setMessage(
      saved
        ? 'Answer saved locally. Screen answers do not assess your playing.'
        : 'Answer kept in memory. Export progress before closing this tab.',
    );
  }
  function begin() {
    const s = current.current;
    if (!s) return;
    if (!hasEarReference(s)) {
      setMessage(
        'Use this upload for exploration. A graded listening question needs an independent reference.',
      );
      return;
    }
    revise({
      activeQuestion: true,
      assisted: false,
      completed: false,
      draftVisible: false,
      proposal: ['', ''],
      replayCount: 0,
    });
  }
  function replay() {
    setCommand((n) => n + 1);
  }
  function started(source: 'original' | 'estimated-part' = 'original') {
    revise(
      { replayCount: (current.current?.replayCount ?? 0) + (source === 'original' ? 1 : 0) },
      'audio-replay',
      source === 'original'
        ? 'Original stimulus playback started.'
        : 'Estimated part playback started.',
    );
  }
  function action(a: EarAction) {
    if (a.operation === 'correct' && a.noteId && a.midi !== undefined) {
      const note = notes[Number(a.noteId.slice(1))];
      if (note) void correct(note.id, a.midi);
    }
    if (a.operation === 'compare-note') {
      const midi = parsePitch(current.current?.noteProposal ?? '');
      if (midi !== null) {
        assist('Learner note proposal auditioned.');
        callbacks.current.onAudition?.([midi]);
      }
    }
    if (a.operation === 'analyze') void analyze();
    if (a.operation === 'replay') replay();
    if (a.operation === 'draft') reveal();
    if (a.operation === 'compare') {
      const chord = parseChordSymbol(current.current?.proposal[0] ?? '');
      if (chord) {
        assist('Auditioning a proposed chord.');
        callbacks.current.onAudition?.(
          chord.tones.map((t) => 48 + chord.rootPitchClass + t.semitones),
        );
      }
    }
    if (a.operation === 'question') begin();
    if (a.operation === 'workspace') workspace();
  }
  return {
    state,
    job,
    notes,
    reviews,
    enabled,
    analysisReady: capabilities.transcribe && capabilities.timing && capabilities.researchMode,
    separationReady: capabilities.separate && capabilities.corroborate && capabilities.researchMode,
    busy,
    message,
    command,
    loadDemo,
    upload,
    assist,
    reveal,
    analyze,
    correct,
    workspace,
    answer,
    begin,
    replay,
    started,
    action,
    masked: earMasked(state),
    context: state ? earContext(state, notes, job?.status ?? 'none') : undefined,
    acceptJobs: (jobs: AudioJobReceipt[]) => {
      const job = jobs.find((j) => j.contextRevision === current.current?.revision);
      if (job) {
        revise({ jobId: job.id, draftVisible: false });
        setMessage('Teacher requested local analysis. No draft has been revealed.');
      }
    },
    revise,
    cancel: async () => {
      if (job) setJob(await audioApi<AudioJob>('jobs/' + job.id, undefined, 'DELETE'));
    },
    close: () => {
      token.current++;
      playback.stopAll();
      current.current = null;
      setState(null);
      setJob(null);
      setNotes([]);
      callbacks.current.onMask(false);
      learning.record(
        { ear: undefined },
        [],
        [{ kind: 'source-changed', detail: 'Closed ear workspace.', exposureKeys: [] }],
      );
    },
  };
}
export type EarSession = ReturnType<typeof useEarSession>;
