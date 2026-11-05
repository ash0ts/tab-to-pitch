import { earScore } from './ear-score';
import type { EarStudy } from '../ear/model';
import { PlaybackClockBridge } from '../live/clock';
import { buildPracticeScore } from './practice-study';
import type { TimedStudy } from '../engine/musicianship';
import { playback } from './PlaybackCoordinator';
import { catalogScore } from './catalog-score';
import type { Passage } from '../songs/catalog';
import * as alphaTab from '@coderline/alphatab';
import { adaptScore, hashSource, parseScoreBytes, sourceNoteId } from '../engine/adapter';
import { applyPitchLabels, type LabelMode } from '../engine/presentation';
import type { NoteEvent, ScoreDocument } from '../engine/types';
import {
  HOMEWORK_ALPHATEX,
  HOMEWORK_SOURCE_ID,
  DEMO_ALPHATEX,
  DEMO_SOURCE_ID,
  progressionStudy,
} from './demo';
import { measurePlaybackRange, notePlaybackTick } from './timeline';
import { buildVariationScore } from './variation';
import type { ProgressionVariation } from '../engine/harmony';

export interface PlayerState {
  ready: boolean;
  rendered: boolean;
  playing: boolean;
  currentTick: number;
  endTick: number;
  currentTime: number;
  endTime: number;
  activeTrack: number;
  speed: number;
  loop: { startTick: number; endTick: number } | null;
}

export interface PlayerCallbacks {
  onDocument?: (document: ScoreDocument) => void;
  onState?: (state: PlayerState) => void;
  onNote?: (note: NoteEvent) => void;
  onError?: (message: string) => void;
  onRendered?: () => void;
}

export interface PresentationOptions {
  mode: LabelMode;
  fretHint?: boolean;
  showOctaves?: boolean;
  maskedNoteIds?: readonly string[];
}

export class PlayerController {
  readonly api: alphaTab.AlphaTabApi;
  readonly clock = new PlaybackClockBridge();
  document: ScoreDocument | null = null;
  state: PlayerState = {
    ready: false,
    rendered: false,
    playing: false,
    currentTick: 0,
    endTick: 0,
    currentTime: 0,
    endTime: 0,
    activeTrack: 0,
    speed: 1,
    loop: null,
  };
  private mode: LabelMode = 'pitch';
  private fretHint = false;
  private showOctaves = false;
  private mask = new Set<string>();
  private score: alphaTab.model.Score | null = null;
  private sourceScore: alphaTab.model.Score | null = null;
  private notationWithStaff = false;
  private pendingSeek: number | null = null;
  private previewTrack: number | null = null;
  private noteEvents = new Map<string, NoteEvent>();
  private disposed = false;
  private viewportReady = false;
  private rendering = false;
  private renderPending = false;
  private renderedTrack = -1;
  private generation = 0;
  private mixer = new Map<number, { mute?: boolean; solo?: boolean; volume?: number }>();
  private cleanups: Array<() => void> = [];

  constructor(
    host: HTMLElement,
    private callbacks: PlayerCallbacks = {},
  ) {
    const compact = window.matchMedia('(max-width: 700px)');
    this.api = new alphaTab.AlphaTabApi(host, {
      core: { engine: 'svg', useWorkers: true, fontDirectory: '/font/', includeNoteBounds: true },
      display: {
        staveProfile: alphaTab.StaveProfile.Tab,
        scale: 1,
        padding: [22, 18, 22, 18],
        layoutMode: compact.matches ? alphaTab.LayoutMode.Horizontal : alphaTab.LayoutMode.Page,
      },
      notation: {
        rhythmMode: alphaTab.TabRhythmMode.ShowWithBeams,
        elements: new Map([
          [alphaTab.NotationElement.ScoreTitle, false],
          [alphaTab.NotationElement.ScoreArtist, false],
          [alphaTab.NotationElement.GuitarTuning, false],
        ]),
      },
      player: {
        playerMode: alphaTab.PlayerMode.EnabledSynthesizer,
        soundFont: '/soundfont/sonivox.sf2',
        enableCursor: true,
        enableElementHighlighting: true,
        enableUserInteraction: true,
        scrollElement: host.parentElement ?? host,
      },
    });
    const resizeLayout = () => {
      if (this.disposed) return;
      this.api.pause();
      this.api.settings.display.layoutMode = compact.matches
        ? alphaTab.LayoutMode.Horizontal
        : alphaTab.LayoutMode.Page;
      this.api.updateSettings();
      if (this.score && this.viewportReady) this.requestRender();
    };
    compact.addEventListener('change', resizeLayout);
    this.cleanups.push(() => compact.removeEventListener('change', resizeLayout));
    const listen = <T extends unknown[]>(
      event: { on(fn: (...values: T) => void): void; off(fn: (...values: T) => void): void },
      fn: (...values: T) => void,
    ) => {
      const guarded = (...values: T) => {
        if (!this.disposed) fn(...values);
      };
      event.on(guarded);
      this.cleanups.push(() => event.off(guarded));
    };
    listen(this.api.error, (error) => {
      this.rendering = false;
      this.renderPending = false;
      this.pendingReplay = false;
      callbacks.onError?.(error.message);
    });
    listen(this.api.playerReady, () => this.playWhenReady());
    listen(this.api.soundFontLoaded, () => this.playWhenReady());
    listen(this.api.midiLoaded, () => {
      if (this.api.score !== this.score) return;
      for (const [index, settings] of this.mixer) {
        if (this.studyIdentity) break;
        const track = this.score?.tracks[index];
        if (!track) continue;
        if (settings.mute !== undefined) this.api.changeTrackMute([track], settings.mute);
        if (settings.solo !== undefined) this.api.changeTrackSolo([track], settings.solo);
        if (settings.volume !== undefined) this.api.changeTrackVolume([track], settings.volume);
      }
      if (this.studyIdentity && this.score)
        for (const track of this.score.tracks) {
          this.api.changeTrackMute([track], false);
          this.api.changeTrackSolo([track], false);
          this.api.changeTrackVolume([track], track.index === 0 ? 1 : 0.5);
        }
      if (this.pendingSeek !== null) {
        this.api.tickPosition = this.pendingSeek;
        this.pendingSeek = null;
        this.api.playbackRange = this.state.loop;
        this.api.isLooping = Boolean(this.state.loop);
      }
      this.playWhenReady();
    });
    listen(this.api.playerStateChanged, (event) => {
      const playing = event.state === alphaTab.synth.PlayerState.Playing;
      this.update({ playing });
      if (playing && this.document)
        playback.started('score', this.studyIdentity ?? this.document.hash);
    });
    listen(this.api.playerPositionChanged, (event) =>
      this.update({
        currentTick: event.currentTick,
        endTick: event.endTick,
        currentTime: event.currentTime,
        endTime: event.endTime,
        ready: this.api.isReadyForPlayback,
      }),
    );
    listen(this.api.renderStarted, () => {
      this.rendering = true;
    });
    listen(this.api.postRenderFinished, () => {
      this.rendering = false;
      if (this.renderPending) {
        this.renderPending = false;
        this.requestRender();
        return;
      }
      this.update({ rendered: true, ready: this.api.isReadyForPlayback });
      callbacks.onRendered?.();
    });
    listen(this.api.noteMouseDown, (source) => {
      if (source.beat.voice.bar.staff.track.index === this.previewTrack) return;
      const event = this.noteEvents.get(sourceNoteId(source));
      if (event) callbacks.onNote?.(event);
    });
    listen(this.api.playedBeatChanged, (beat) => {
      if (beat.voice.bar.staff.track.index === this.previewTrack) return;
      const source =
        beat.notes.find((note) => !note.isTieDestination && !note.isDead) ?? beat.notes[0];
      if (!source) return;
      const event = this.noteEvents.get(sourceNoteId(source));
      if (event) callbacks.onNote?.(event);
    });
    // alphaTab installs its viewport reset handler in its own first animation
    // frame. Fonts and worker rendering can finish earlier in a background tab.
    // Start after that handler, using the latest score, track and presentation.
    const initializationFrame = window.requestAnimationFrame(() => {
      if (this.disposed) return;
      this.viewportReady = true;
      if (this.score) this.requestRender();
    });
    this.cleanups.push(() => window.cancelAnimationFrame(initializationFrame));
  }

  private requestRender(): void {
    if (!this.score || !this.viewportReady || this.disposed) return;
    if (this.rendering) {
      this.renderPending = true;
      return;
    }
    this.rendering = true;
    const sameTrack = this.renderedTrack === this.state.activeTrack;
    this.renderedTrack = this.state.activeTrack;
    if (this.api.score !== this.score) this.api.renderScore(this.score, [this.state.activeTrack]);
    else if (!sameTrack) this.api.renderTracks([this.score.tracks[this.state.activeTrack]!]);
    else this.api.render();
  }

  private playWhenReady(): void {
    const ready = this.api.score === this.score && this.api.isReadyForPlayback;
    this.update({ ready });
    if (ready && this.pendingReplay) {
      this.pendingReplay = false;
      this.playPause();
    }
  }

  refreshLayout(): void {
    if (!this.disposed && this.score && this.viewportReady) this.requestRender();
  }

  private update(update: Partial<PlayerState>): void {
    if (this.disposed) return;
    this.state = { ...this.state, ...update };
    this.clock.observe(
      this.state.currentTick,
      this.state.currentTime,
      this.state.speed,
      this.state.playing,
      performance.now(),
    );
    this.callbacks.onState?.(this.state);
  }

  async loadBytes(bytes: Uint8Array, fileName = 'Imported study'): Promise<ScoreDocument | null> {
    if (this.disposed) return null;
    const generation = ++this.generation;
    try {
      if (bytes.byteLength > 20 * 1024 * 1024)
        throw new Error('Choose a Guitar Pro file smaller than 20 MB.');
      const hash = await hashSource(bytes);
      if (this.disposed || generation !== this.generation) return null;
      const score = parseScoreBytes(bytes);
      if (!score.title) score.title = fileName.replace(/\.[^.]+$/, '');
      return this.installScore(score, hash);
    } catch (error) {
      if (this.disposed || generation !== this.generation) return null;
      this.callbacks.onError?.(
        error instanceof Error ? error.message : 'This score could not be read.',
      );
      return null;
    }
  }

  loadDemo(): ScoreDocument {
    if (this.disposed) throw new Error('The player has been destroyed.');
    this.cancelPendingLoad();
    return this.installScore(
      alphaTab.importer.ScoreLoader.loadAlphaTex(DEMO_ALPHATEX),
      DEMO_SOURCE_ID,
    );
  }

  loadEarStudy(study: EarStudy): ScoreDocument {
    if (this.disposed) throw new Error('The player has been destroyed.');
    this.cancelPendingLoad();
    return this.installScore(earScore(study), 'ear-study:' + study.id);
  }

  loadCatalogPassage(passage: Passage): ScoreDocument {
    if (this.disposed) throw new Error('The player has been destroyed.');
    this.cancelPendingLoad();
    const study = catalogScore(passage);
    return this.installScore(
      alphaTab.importer.ScoreLoader.loadAlphaTex(study.alphaTex),
      study.sourceId,
    );
  }

  loadHomeworkDemo(): ScoreDocument {
    if (this.disposed) throw new Error('The player has been destroyed.');
    this.cancelPendingLoad();
    return this.installScore(
      alphaTab.importer.ScoreLoader.loadAlphaTex(HOMEWORK_ALPHATEX),
      HOMEWORK_SOURCE_ID,
    );
  }

  loadProgressionDemo(tonic = 'C'): ScoreDocument {
    if (this.disposed) throw new Error('The player has been destroyed.');
    this.cancelPendingLoad();
    const study = progressionStudy(tonic);
    return this.installScore(
      alphaTab.importer.ScoreLoader.loadAlphaTex(study.alphaTex),
      study.sourceId,
    );
  }

  cancelPendingLoad(): void {
    ++this.generation;
  }

  private pendingReplay = false;
  private studyIdentity: string | null = null;
  replaySource(): void {
    this.pause();
    this.previewVariation(null);
    this.setLoop(null, null);
    this.seek(0);
    if (this.state.ready) this.playPause();
    else {
      this.pendingSeek = 0;
      this.pendingReplay = true;
    }
  }

  private installScore(score: alphaTab.model.Score, hash: string): ScoreDocument {
    playback.stopAll();
    this.pendingReplay = false;
    const document = adaptScore(score, hash);
    this.api.stop();
    this.api.playbackRange = null;
    this.api.isLooping = false;
    this.mask.clear();
    this.score = score;
    this.sourceScore = score;
    this.studyIdentity = null;
    this.mixer.clear();
    this.pendingSeek = null;
    this.previewTrack = null;
    this.document = document;
    this.noteEvents.clear();
    for (const track of this.document.tracks)
      for (const note of track.notes) this.noteEvents.set(note.id, note);
    const activeTrack = this.document.tracks.find((track) => track.supported)?.index ?? 0;
    this.setStaveProfile(activeTrack);
    this.update({
      ready: false,
      rendered: false,
      playing: false,
      activeTrack,
      currentTick: 0,
      currentTime: 0,
      endTime: 0,
      endTick: this.document.playbackOccurrences?.at(-1)?.endTick ?? 0,
      loop: null,
    });
    applyPitchLabels(score, {
      mode: this.mode,
      fretHint: this.fretHint,
      showOctaves: this.showOctaves,
    });
    this.callbacks.onDocument?.(this.document);
    if (this.viewportReady) this.requestRender();
    return this.document;
  }

  selectTrack(index: number): void {
    if (!this.score?.tracks[index]) return;
    if (this.previewTrack !== null) this.previewVariation(null);
    this.api.pause();
    this.mask.clear();
    this.setStaveProfile(index);
    this.update({ activeTrack: index, rendered: false });
    applyPitchLabels(this.score, {
      mode: this.mode,
      fretHint: this.fretHint,
      showOctaves: this.showOctaves,
    });
    if (this.viewportReady) this.requestRender();
  }

  private setStaveProfile(index: number): void {
    const hasFrets = Boolean(
      this.score?.tracks[index]?.staves.some(
        (staff) => staff.tuning.length > 0 && !staff.isPercussion,
      ),
    );
    const profile = hasFrets
      ? this.notationWithStaff
        ? alphaTab.StaveProfile.ScoreTab
        : alphaTab.StaveProfile.Tab
      : alphaTab.StaveProfile.Score;
    if (this.api.settings.display.staveProfile !== profile) {
      this.api.settings.display.staveProfile = profile;
      this.api.updateSettings();
    }
  }

  setStaffNotation(enabled: boolean): void {
    if (this.notationWithStaff === enabled) return;
    this.notationWithStaff = enabled;
    this.api.pause();
    this.setStaveProfile(this.state.activeTrack);
    if (this.score && this.viewportReady) this.requestRender();
  }

  /** Switch the rendered/synthesized score without replacing the imported document or its identity. */
  previewVariation(
    variation: ProgressionVariation | null,
    trackIndex = this.state.activeTrack,
  ): void {
    if (!this.sourceScore || !this.document || this.disposed) return;
    this.pendingReplay = false;
    if (!variation && this.previewTrack === null && trackIndex === this.state.activeTrack) return;
    const score = variation
      ? buildVariationScore(this.sourceScore, trackIndex, variation)
      : this.sourceScore;
    this.studyIdentity = null;
    const derived = variation ? adaptScore(score, this.document.hash) : this.document;
    this.api.pause();
    this.pendingSeek = this.state.currentTick;
    this.score = score;
    this.previewTrack = variation ? trackIndex : null;
    this.noteEvents.clear();
    for (const track of derived.tracks) {
      const source = this.document.tracks.find((item) => item.id === track.id);
      for (const note of track.notes) {
        const reference =
          variation && track.index === trackIndex
            ? (source?.notes.find((item) => item.onsetTicks === note.onsetTicks) ??
              source?.notes.find((item) => item.measureIndex === note.measureIndex))
            : note;
        if (reference) this.noteEvents.set(note.id, reference);
      }
    }
    applyPitchLabels(score, {
      mode: this.mode,
      fretHint: this.fretHint,
      showOctaves: this.showOctaves,
      maskedNoteIds: this.mask,
    });
    this.setStaveProfile(trackIndex);
    this.update({ ready: false, rendered: false, playing: false, activeTrack: trackIndex });
    if (this.viewportReady) this.requestRender();
  }

  previewPracticeStudy(study: TimedStudy): void {
    if (!this.sourceScore || this.disposed || this.pendingReplay) return;
    const score = buildPracticeScore(study);
    this.studyIdentity = study.id;
    playback.stopAll();
    this.api.pause();
    this.api.playbackRange = null;
    this.api.isLooping = false;
    this.pendingSeek = 0;
    this.pendingReplay = true;
    this.score = score;
    this.previewTrack = 0;
    this.noteEvents.clear();
    applyPitchLabels(score, {
      mode: this.mode,
      fretHint: this.fretHint,
      showOctaves: this.showOctaves,
    });
    this.setStaveProfile(0);
    this.update({ ready: false, rendered: false, playing: false, activeTrack: 0, loop: null });
    if (this.viewportReady) this.requestRender();
  }

  setLabels(mode: LabelMode, fretHint = false): void {
    this.setPresentation({
      mode,
      fretHint,
      showOctaves: this.showOctaves,
      maskedNoteIds: [...this.mask],
    });
  }

  /** Mask text in the actual measured glyph, without a covering HTML layer. */
  setMaskedNotes(ids: readonly string[], _hide?: string): void {
    this.setPresentation({
      mode: this.mode,
      fretHint: this.fretHint,
      showOctaves: this.showOctaves,
      maskedNoteIds: ids,
    });
  }

  setPresentation({
    mode,
    fretHint = false,
    showOctaves = false,
    maskedNoteIds = [],
  }: PresentationOptions): void {
    if (this.disposed) return;
    const mask = new Set(maskedNoteIds);
    if (
      this.mode === mode &&
      this.fretHint === fretHint &&
      this.showOctaves === showOctaves &&
      this.mask.size === mask.size &&
      [...mask].every((id) => this.mask.has(id))
    )
      return;
    this.mode = mode;
    this.fretHint = fretHint;
    this.showOctaves = showOctaves;
    this.mask = mask;
    this.refreshLabels();
  }

  private refreshLabels(): void {
    if (!this.score || this.disposed) return;
    this.api.pause();
    applyPitchLabels(this.score, {
      mode: this.mode,
      fretHint: this.fretHint,
      showOctaves: this.showOctaves,
      maskedNoteIds: this.mask,
    });
    this.update({ rendered: false });
    if (this.viewportReady) this.requestRender();
  }

  playPause(): void {
    playback.claim('score');
    if (this.api.isReadyForPlayback) this.api.playPause();
  }
  pause(): void {
    this.pendingReplay = false;
    this.api.pause();
  }
  stop(): void {
    this.api.stop();
  }
  seek(tick: number): void {
    this.clock.reset('Seek invalidated timing alignment.');
    this.api.tickPosition = Math.max(0, Math.min(tick, this.state.endTick));
  }
  seekNote(id: string, occurrence = 0): void {
    const note = this.noteEvents.get(id);
    if (!this.document || !note) return;
    const tick = notePlaybackTick(this.document, note, occurrence);
    if (tick !== null) this.seek(tick);
  }
  setLoop(startTick: number | null, endTick: number | null = null): void {
    this.clock.reset('Loop changed.');
    const loop =
      startTick !== null && endTick !== null && endTick > startTick ? { startTick, endTick } : null;
    this.api.playbackRange = loop;
    this.api.isLooping = Boolean(loop);
    this.update({ loop });
  }
  setMeasureLoop(firstIndex: number, lastIndex: number, occurrence = 0): void {
    const range = this.document
      ? measurePlaybackRange(this.document, firstIndex, lastIndex, occurrence)
      : null;
    this.setLoop(range?.startTick ?? null, range?.endTick ?? null);
  }
  setSpeed(ratio: number): void {
    const speed = Math.max(0.25, Math.min(1.5, ratio));
    this.api.playbackSpeed = speed;
    this.update({ speed });
  }
  setZoom(scale: number): void {
    if (this.disposed || !Number.isFinite(scale)) return;
    this.api.pause();
    this.api.settings.display.scale = Math.max(0.75, Math.min(1.5, scale));
    this.api.updateSettings();
    if (this.score) {
      this.update({ rendered: false });
      if (this.viewportReady) this.requestRender();
    }
  }
  setMasterVolume(volume: number): void {
    this.api.masterVolume = Math.max(0, Math.min(1, volume));
  }
  setTrackVolume(index: number, volume: number): void {
    const track = this.score?.tracks[index];
    if (track) {
      const level = Math.max(0, Math.min(1, volume));
      this.mixer.set(index, { ...this.mixer.get(index), volume: level });
      this.api.changeTrackVolume([track], level);
    }
  }
  setTrackMute(index: number, mute: boolean): void {
    const track = this.score?.tracks[index];
    if (track) {
      this.mixer.set(index, { ...this.mixer.get(index), mute });
      this.api.changeTrackMute([track], mute);
    }
  }
  setTrackSolo(index: number, solo: boolean): void {
    const track = this.score?.tracks[index];
    if (track) {
      this.mixer.set(index, { ...this.mixer.get(index), solo });
      this.api.changeTrackSolo([track], solo);
    }
  }
  setMetronome(enabled: boolean): void {
    this.api.metronomeVolume = enabled ? 0.65 : 0;
  }
  setCountIn(enabled: boolean): void {
    this.api.countInVolume = enabled ? 0.65 : 0;
  }
  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    ++this.generation;
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups = [];
    this.api.destroy();
  }
}
