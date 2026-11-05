import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as alphaTab from '@coderline/alphatab';
import { PlayerController } from './PlayerController';
import { DEMO_ALPHATEX } from './demo';
import { adaptScore } from '../engine/adapter';
import { generateProgressionVariations, parseChordSymbol } from '../engine/harmony';

const mocks = vi.hoisted(() => {
  const event = () => ({ on: vi.fn(), off: vi.fn() });
  class Api {
    settings: { display: { layoutMode: number; staveProfile?: number; scale: number } };
    error = event();
    playerReady = event();
    soundFontLoaded = event();
    midiLoaded = event();
    playerStateChanged = event();
    playerPositionChanged = event();
    postRenderFinished = event();
    renderStarted = event();
    score: unknown = null;
    deferRender = false;
    finishRender = () => this.postRenderFinished.on.mock.calls.forEach(([callback]) => callback());
    startRender = () => {
      this.renderStarted.on.mock.calls.forEach(([callback]) => callback());
      if (!this.deferRender) this.finishRender();
    };
    noteMouseDown = event();
    playedBeatChanged = event();
    changeTrackMute = vi.fn();
    changeTrackSolo = vi.fn();
    changeTrackVolume = vi.fn();
    pause = vi.fn();
    stop = vi.fn();
    updateSettings = vi.fn();
    render = vi.fn(() => this.startRender());
    renderScore = vi.fn((score: unknown, _tracks?: number[]) => {
      this.score = score;
      this.startRender();
    });
    renderTracks = vi.fn((_tracks: unknown[]) => this.startRender());
    destroy = vi.fn();
    playPause = vi.fn();
    isReadyForPlayback = true;
    playbackRange: { startTick: number; endTick: number } | null = null;
    isLooping = false;
    constructor(_host: unknown, settings: Api['settings']) {
      this.settings = settings;
      instances.push(this);
    }
  }
  const instances: Api[] = [];
  return { Api, instances, hashSource: vi.fn() };
});

vi.mock('@coderline/alphatab', async (original) => ({
  ...(await original<typeof import('@coderline/alphatab')>()),
  AlphaTabApi: mocks.Api,
}));
vi.mock('../engine/adapter', async (original) => {
  const actual = await original<typeof import('../engine/adapter')>();
  return { ...actual, hashSource: mocks.hashSource, adaptScore: vi.fn(actual.adaptScore) };
});

function deferred() {
  let resolve!: (value: string) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<string>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe('player ownership and presentation', () => {
  const players: PlayerController[] = [];
  const frames = new Map<number, FrameRequestCallback>();
  let frameId = 0;
  const flushFrames = () => {
    for (const callback of frames.values()) callback(0);
    frames.clear();
  };
  const media = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  const create = (
    callbacks: ConstructorParameters<typeof PlayerController>[1] = {},
    initializeViewport = true,
  ) => {
    const player = new PlayerController(
      { parentElement: null, getBoundingClientRect: () => ({ width: 900 }) } as HTMLElement,
      callbacks,
    );
    players.push(player);
    if (initializeViewport) flushFrames();
    return player;
  };
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.instances.length = 0;
    mocks.hashSource.mockReset().mockResolvedValue('source-hash');
    frames.clear();
    frameId = 0;
    vi.stubGlobal('window', {
      matchMedia: () => media,
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        frames.set(++frameId, callback);
        return frameId;
      },
      cancelAnimationFrame: (id: number) => frames.delete(id),
    });
  });

  it('defers engraving until viewport initialization and uses the latest presentation', () => {
    const player = create({}, false);
    player.loadDemo();
    player.setLabels('pitch', true);
    player.setZoom(1.25);
    player.loadDemo();
    player.setLabels('fret');
    const api = mocks.instances[0]!;
    expect(api.renderScore).not.toHaveBeenCalled();
    expect(api.render).not.toHaveBeenCalled();
    flushFrames();
    expect(api.renderScore).toHaveBeenCalledTimes(1);
    const score = api.renderScore.mock.calls[0]![0] as alphaTab.model.Score;
    const note = score.tracks[0]!.staves[0]!.bars[0]!.voices[0]!.beats[0]!.notes[0]!;
    expect(note).toMatchObject({ tabToPitchLabel: null });
    expect(api.settings.display.scale).toBe(1.25);
    expect(api.render).not.toHaveBeenCalled();
  });

  it('cancels the initial engraving when disposed before the first animation frame', () => {
    const player = create({}, false);
    player.loadDemo();
    player.destroy();
    flushFrames();
    expect(mocks.instances[0]!.renderScore).not.toHaveBeenCalled();
  });
  afterEach(() => {
    players.splice(0).forEach((player) => player.destroy());
    vi.unstubAllGlobals();
  });

  it('serializes worker renders and installs only the latest queued score', () => {
    const player = create();
    const api = mocks.instances[0]!;
    api.deferRender = true;
    player.loadDemo();
    const first = api.score;
    player.loadDemo();
    player.loadDemo();
    expect(api.renderScore).toHaveBeenCalledTimes(1);
    expect(api.score).toBe(first);
    api.finishRender();
    expect(api.renderScore).toHaveBeenCalledTimes(2);
    expect(api.score === first).toBe(false);
    api.finishRender();
    expect(player.state.rendered).toBe(true);
  });

  it('does not wait for a completion event when alphaTab skips a hidden render', () => {
    let width = 0;
    const player = new PlayerController({
      parentElement: null,
      getBoundingClientRect: () => ({ width }),
    } as HTMLElement);
    players.push(player);
    flushFrames();
    const api = mocks.instances[0]!;
    api.renderScore.mockImplementation((score) => {
      api.score = score;
    });
    player.loadDemo();
    const first = api.score;
    player.loadHomeworkDemo();
    expect(api.renderScore).toHaveBeenCalledTimes(2);
    expect(api.score).not.toBe(first);
    width = 900;
    player.refreshLayout();
    expect(api.render).toHaveBeenCalledTimes(1);
    expect(player.state.rendered).toBe(true);
  });

  it('changes hints and masking atomically, and leaves an identical policy playing', () => {
    const player = create();
    const document = player.loadDemo();
    const api = mocks.instances[0]!;
    const ids = document.tracks[0]!.notes.slice(0, 2).map((note) => note.id);
    player.setPresentation({ mode: 'pitch', fretHint: true, maskedNoteIds: ids });
    expect(api.render).toHaveBeenCalledTimes(1);
    expect(api.pause).toHaveBeenCalledTimes(1);
    player.setPresentation({ mode: 'pitch', fretHint: true, maskedNoteIds: [...ids].reverse() });
    expect(api.render).toHaveBeenCalledTimes(1);
    expect(api.pause).toHaveBeenCalledTimes(1);
    player.setPresentation({ mode: 'pitch' });
    expect(api.render).toHaveBeenCalledTimes(2);
  });

  it('never installs an older import after a newer source or explicit cancellation', async () => {
    const source = alphaTab.importer.ScoreLoader.loadAlphaTex(DEMO_ALPHATEX);
    const bytes = new alphaTab.exporter.Gp7Exporter().export(source);
    const onDocument = vi.fn(),
      onError = vi.fn();
    const player = create({ onDocument, onError });
    const old = deferred();
    mocks.hashSource.mockImplementationOnce(() => old.promise).mockResolvedValueOnce('new-hash');
    const oldLoad = player.loadBytes(bytes);
    const newer = await player.loadBytes(bytes);
    expect(newer?.id).toBe('new-hash');
    old.resolve('old-hash');
    expect(await oldLoad).toBeNull();
    expect(onDocument).toHaveBeenCalledTimes(1);
    const cancelled = deferred();
    mocks.hashSource.mockImplementationOnce(() => cancelled.promise);
    const pending = player.loadBytes(bytes);
    player.cancelPendingLoad();
    cancelled.reject(new Error('obsolete read failed'));
    expect(await pending).toBeNull();
    expect(onError).not.toHaveBeenCalled();
    expect(player.document?.id).toBe('new-hash');
  });

  it('clears transport ranges on replacement and disposes listeners exactly once', async () => {
    const onDocument = vi.fn(),
      onError = vi.fn();
    const player = create({ onDocument, onError });
    player.loadDemo();
    const api = mocks.instances[0]!;
    player.setLoop(100, 900);
    player.loadDemo();
    expect(api.playbackRange).toBeNull();
    expect(api.isLooping).toBe(false);
    expect(player.state).toMatchObject({ currentTick: 0, currentTime: 0, endTime: 0, loop: null });
    const digest = deferred();
    mocks.hashSource.mockImplementationOnce(() => digest.promise);
    const pending = player.loadBytes(new Uint8Array([1]));
    player.destroy();
    player.destroy();
    digest.reject(new Error('late failure'));
    expect(await pending).toBeNull();
    expect(onDocument).toHaveBeenCalledTimes(2);
    expect(onError).not.toHaveBeenCalled();
    expect(api.destroy).toHaveBeenCalledTimes(1);
    expect(api.error.off).toHaveBeenCalledTimes(1);
    expect(api.postRenderFinished.off).toHaveBeenCalledTimes(1);
    expect(media.removeEventListener).toHaveBeenCalledTimes(1);
    expect(await player.loadBytes(new Uint8Array([2]))).toBeNull();
  });

  it('preserves the installed score and loop when adapting a replacement fails', async () => {
    const player = create({ onError: vi.fn() });
    const original = player.loadDemo();
    player.setLoop(0, 960);
    const api = mocks.instances[0]!;
    const bytes = new alphaTab.exporter.Gp7Exporter().export(
      alphaTab.importer.ScoreLoader.loadAlphaTex(DEMO_ALPHATEX),
    );
    vi.mocked(adaptScore).mockImplementationOnce(() => {
      throw new Error('unsupported source structure');
    });
    expect(await player.loadBytes(bytes)).toBeNull();
    expect(player.document).toBe(original);
    expect(api.playbackRange).toEqual({ startTick: 0, endTick: 960 });
    expect(api.renderScore).toHaveBeenCalledTimes(1);
  });
  it('previews a derived score without replacing source identity, then restores source and seek/loop state', () => {
    const onDocument = vi.fn();
    const player = create({ onDocument });
    const document = player.loadDemo();
    const api = mocks.instances[0]!;
    const sourceScore = api.renderScore.mock.calls[0]![0] as alphaTab.model.Score;
    const before = alphaTab.model.JsonConverter.scoreToJson(sourceScore);
    const variation = generateProgressionVariations(
      [
        {
          id: 'phrase',
          startTick: 0,
          endTick: 3840,
          sourceNoteIds: [],
          chord: parseChordSymbol('C'),
          confirmation: 'confirmed',
          source: 'manual',
        },
      ],
      document.tracks[0]!.tuningMidi,
      0,
      { voiceCount: 3 },
    ).variations[0]!;
    player.setLoop(0, 3840);
    api.playerPositionChanged.on.mock.calls[0]![0]({
      currentTick: 960,
      endTick: 15360,
      currentTime: 600,
      endTime: 9600,
    });
    player.previewVariation(variation);
    const derived = api.renderScore.mock.calls.at(-1)![0] as alphaTab.model.Score;
    expect(derived === sourceScore).toBe(false);
    expect(player.document).toBe(document);
    expect(onDocument).toHaveBeenCalledTimes(1);
    expect(alphaTab.model.JsonConverter.scoreToJson(sourceScore)).toBe(before);
    api.midiLoaded.on.mock.calls[0]![0]();
    expect(api).toMatchObject({
      tickPosition: 960,
      playbackRange: { startTick: 0, endTick: 3840 },
      isLooping: true,
    });
    player.previewVariation(null);
    expect(api.renderScore.mock.calls.at(-1)![0] === sourceScore).toBe(true);
    api.midiLoaded.on.mock.calls[0]![0]();
    expect(api).toMatchObject({
      tickPosition: 960,
      playbackRange: { startTick: 0, endTick: 3840 },
      isLooping: true,
    });
  });

  it('keeps the current source installed after an invalid preview and drops obsolete seek on file replacement', () => {
    const player = create();
    const document = player.loadDemo();
    const api = mocks.instances[0]!;
    const variation = generateProgressionVariations(
      [
        {
          id: 'phrase',
          startTick: 0,
          endTick: 3840,
          sourceNoteIds: [],
          chord: parseChordSymbol('C'),
          confirmation: 'confirmed',
          source: 'manual',
        },
      ],
      document.tracks[0]!.tuningMidi,
      0,
      { voiceCount: 3 },
    ).variations[0]!;
    const invalid = structuredClone(variation);
    invalid.events[0]!.startTick = 1;
    const pauseCount = api.pause.mock.calls.length;
    expect(() => player.previewVariation(invalid)).toThrow(/whole bars/);
    expect(player.document).toBe(document);
    expect(api.renderScore).toHaveBeenCalledTimes(1);
    expect(api.pause).toHaveBeenCalledTimes(pauseCount);
    api.playerPositionChanged.on.mock.calls[0]![0]({
      currentTick: 960,
      endTick: 15360,
      currentTime: 600,
      endTime: 9600,
    });
    player.previewVariation(variation);
    player.loadProgressionDemo();
    api.midiLoaded.on.mock.calls[0]![0]();
    expect(api).not.toHaveProperty('tickPosition');
    expect(player.state.currentTick).toBe(0);
    expect(player.document?.id).not.toBe(document.id);
    expect(api.playbackRange).toBeNull();
  });

  it('renders the latest source when a preview is reverted before viewport initialization', () => {
    const player = create({}, false);
    const document = player.loadDemo();
    const api = mocks.instances[0]!;
    const variation = generateProgressionVariations(
      [
        {
          id: 'phrase',
          startTick: 0,
          endTick: 3840,
          sourceNoteIds: [],
          chord: parseChordSymbol('C'),
          confirmation: 'confirmed',
          source: 'manual',
        },
      ],
      document.tracks[0]!.tuningMidi,
      0,
      { voiceCount: 3 },
    ).variations[0]!;
    player.previewVariation(variation);
    player.previewVariation(null);
    expect(api.renderScore).not.toHaveBeenCalled();
    flushFrames();
    const shown = api.renderScore.mock.calls[0]![0] as alphaTab.model.Score;
    expect(
      shown.tracks[0]!.staves[0]!.bars[0]!.voices[0]!.beats[0]!.notes.map((note) => note.realValue),
    ).toEqual([47, 50, 55, 62]);
    expect(api.renderScore).toHaveBeenCalledTimes(1);
  });
  it('reapplies mixer overrides after MIDI replacement without mutating the source track', () => {
    const player = create();
    player.loadProgressionDemo();
    const api = mocks.instances[0]!;
    player.setTrackMute(1, true);
    player.setTrackSolo(0, false);
    player.setTrackVolume(1, 0.4);
    const loaded = api.midiLoaded.on.mock.calls[0]![0] as () => void;
    loaded();
    expect(api.changeTrackMute).toHaveBeenLastCalledWith(
      [expect.objectContaining({ index: 1 })],
      true,
    );
    expect(api.changeTrackVolume).toHaveBeenLastCalledWith(
      [expect.objectContaining({ index: 1 })],
      0.4,
    );
    const count = api.changeTrackMute.mock.calls.length;
    player.loadDemo();
    loaded();
    expect(api.changeTrackMute.mock.calls.length).toBe(count);
  });
});
