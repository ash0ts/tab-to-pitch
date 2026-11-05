import { playback } from './player/PlaybackCoordinator';
let context: AudioContext | undefined;
let generation = 0;
const voices = new Set<OscillatorNode>();

export function stopAudition() {
  generation++;
  for (const voice of voices) voice.stop();
  voices.clear();
}
playback.register('audition', stopAudition);
type AuditionEvent = { midi: number; start: number; duration: number; volume: number };

/** Audio-clock scheduling for a short illustration, never a score-playback clock. */
async function playEvents(events: AuditionEvent[]) {
  playback.claim('audition');
  stopAudition();
  const request = generation;
  const audio = (context ??= new AudioContext());
  await audio.resume();
  if (request !== generation || context !== audio) return;
  const now = audio.currentTime;
  for (const event of events) {
    if (!Number.isFinite(event.midi) || event.midi < 0 || event.midi > 127) continue;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.value = 440 * 2 ** ((event.midi - 69) / 12);
    const start = now + event.start;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(event.volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, start + event.duration);
    oscillator.connect(gain);
    gain.connect(audio.destination);
    voices.add(oscillator);
    oscillator.start(start);
    oscillator.stop(start + event.duration + 0.05);
    oscillator.onended = () => {
      voices.delete(oscillator);
      oscillator.disconnect();
      gain.disconnect();
    };
  }
}
/** A short, explicitly synthesized chord audition, separate from score transport. */
export function audition(pitches: number[]) {
  return playEvents(
    pitches.map((midi, index) => ({
      midi,
      start: index * 0.035,
      duration: 1.2,
      volume: 0.11 / Math.sqrt(Math.max(1, pitches.length)),
    })),
  );
}
/** The tonic drone establishes a center; the ascending line resolves to that tonic. */
export function auditionScale(tonic: number, pitches: number[]) {
  const line = [...pitches, tonic + 24, tonic + 12];
  const events = line.map((midi, index) => ({
    midi,
    start: 0.25 + index * 0.4,
    duration: 0.38,
    volume: 0.09,
  }));
  return playEvents([
    { midi: tonic, start: 0, duration: line.length * 0.4 + 0.6, volume: 0.035 },
    ...events,
  ]);
}
export async function closeAudition() {
  stopAudition();
  const previous = context;
  context = undefined;
  if (previous && previous.state !== 'closed') await previous.close();
}
