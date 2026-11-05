export interface PlaybackClockSnapshot {
  epoch: number;
  tick: number;
  scoreMs: number;
  observedAt: number;
  speed: number;
  playing: boolean;
  timingQualified: false;
  reason: string;
}
/** Position callbacks are anchors for display, not hardware input calibration. */
export class PlaybackClockBridge {
  private value: PlaybackClockSnapshot = {
    epoch: 0,
    tick: 0,
    scoreMs: 0,
    observedAt: 0,
    speed: 1,
    playing: false,
    timingQualified: false,
    reason: 'Hardware input/output alignment has not been measured.',
  };
  reset(reason: string) {
    this.value = { ...this.value, epoch: this.value.epoch + 1, reason };
  }
  observe(tick: number, scoreMs: number, speed: number, playing: boolean, at: number) {
    if (tick < this.value.tick || speed !== this.value.speed || playing !== this.value.playing)
      this.reset('Playback changed; timing remains unqualified.');
    this.value = { ...this.value, tick, scoreMs, speed, playing, observedAt: at };
  }
  snapshot() {
    return { ...this.value };
  }
}
