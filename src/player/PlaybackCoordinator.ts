/** Coordinates ownership only. Each renderer keeps its own audio clock. */
export class PlaybackCoordinator {
  private stops = new Map<string, () => void>();
  private listeners = new Set<(player: string, source: string) => void>();
  observe(listener: (player: string, source: string) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  started(player: string, source: string) {
    this.claim(player);
    for (const listener of this.listeners) listener(player, source);
  }
  register(id: string, stop: () => void) {
    this.stops.set(id, stop);
    return () => {
      if (this.stops.get(id) === stop) this.stops.delete(id);
    };
  }
  claim(id: string) {
    for (const [other, stop] of this.stops) if (other !== id) stop();
  }
  stopAll() {
    for (const stop of this.stops.values()) stop();
  }
}
export const playback = new PlaybackCoordinator();
