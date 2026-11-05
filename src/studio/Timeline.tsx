import { useEffect, useMemo, useRef } from 'react';
import type { ScoreDocument, ScoreTrack } from '../engine/types';
import type { PlayerState } from '../player/PlayerController';
import { formatPitch } from '../engine/exploration';
import {
  HOMEWORK_SOURCE_ID,
  HOMEWORK_SYMBOLS,
  progressionStudyTonic,
  progressionStudy,
} from '../player/demo';
import { passageForSource } from '../songs/catalog';
import { timelineEvents, visibleEvents } from './timeline-events';
export function Timeline({
  score,
  track,
  readPlayer,
  staticView,
  octaves,
}: {
  score: ScoreDocument;
  track: ScoreTrack;
  readPlayer: () => PlayerState;
  staticView: boolean;
  octaves: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const events = useMemo(() => timelineEvents(score, track, octaves), [score, track, octaves]);
  const knownStrings = !track.isPercussion && track.tuningMidi.length === 6;
  const maxDuration = useMemo(
    () => events.reduce((max, e) => Math.max(max, e.duration), 0),
    [events],
  );
  const tonic = progressionStudyTonic(score.hash);
  const symbols =
    score.hash === HOMEWORK_SOURCE_ID
      ? [...HOMEWORK_SYMBOLS]
      : tonic
        ? progressionStudy(tonic).symbols
        : passageForSource(score.hash)?.chords.map((c) => c.symbol);
  const currentOccurrence = score.playbackOccurrences?.find(
    (o) => readPlayer().currentTick >= o.startTick && readPlayer().currentTick < o.endTick,
  );
  const hasUnassigned = !knownStrings || events.some((e) => e.string === null);
  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    const ctx = node.getContext('2d');
    if (!ctx) return;
    let frame = 0;
    let stopped = false;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    function draw() {
      if (stopped || !node || !ctx) return;
      const width = node.clientWidth,
        height = node.clientHeight,
        dpr = Math.min(devicePixelRatio, 2);
      if (node.width !== Math.floor(width * dpr) || node.height !== Math.floor(height * dpr)) {
        node.width = Math.floor(width * dpr);
        node.height = Math.floor(height * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const p = readPlayer();
      const step = 3840;
      const fixed = staticView || reduced.matches;
      const tick = fixed ? Math.floor(p.currentTick / step) * step : p.currentTick;
      const left = knownStrings ? 68 : 28;
      const playX = left + 24;
      const scale = (width - playX - 24) / step;
      const laneCount = knownStrings ? 6 + (hasUnassigned ? 1 : 0) : 1;
      const row = (height - 72) / laneCount;
      ctx.fillStyle = '#101d24';
      ctx.fillRect(0, 0, width, height);
      for (let i = 0; i < laneCount; i++) {
        const y = 55 + i * row;
        ctx.strokeStyle = '#485861';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(width - 16, y);
        ctx.stroke();
        ctx.fillStyle = '#d2d8d6';
        ctx.font = '12px "DM Sans"';
        ctx.fillText(
          i < 6 && knownStrings
            ? `${i + 1} · ${formatPitch(track.tuningMidi[i]!, false)}`
            : 'Notes',
          12,
          y + 4,
        );
      }
      for (let t = Math.floor(tick / 960) * 960; t <= tick + step; t += 960) {
        const x = playX + (t - tick) * scale;
        if (x < left) continue;
        ctx.strokeStyle = '#293b44';
        ctx.beginPath();
        ctx.moveTo(x, 28);
        ctx.lineTo(x, height - 22);
        ctx.stroke();
        ctx.fillStyle = '#8fa3ab';
        ctx.fillText(String(Math.floor(t / 960) + 1), x + 5, 18);
      }
      ctx.strokeStyle = '#f5ce8a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playX, 27);
      ctx.lineTo(playX, height - 18);
      ctx.stroke();
      ctx.save();
      ctx.beginPath();
      ctx.rect(left, 27, width - left - 16, height - 27);
      ctx.clip();
      for (const e of visibleEvents(events, tick - 250, tick + step, maxDuration)) {
        const rowIndex = knownStrings ? (e.string ? e.string - 1 : 6) : 0;
        const x = playX + (e.tick - tick) * scale,
          y = 55 + rowIndex * row;
        const w = Math.max(42, e.duration * scale - 7);
        ctx.fillStyle =
          e.tick <= p.currentTick && e.tick + e.duration > p.currentTick ? '#f4cc89' : '#9edacb';
        ctx.beginPath();
        const startX = Math.max(left, x);
        const endX = Math.min(width - 16, x + w);
        ctx.roundRect(startX, y - 15, Math.max(0, endX - startX), 30, 5);
        ctx.fill();
        ctx.fillStyle = '#102b2b';
        ctx.font = '600 13px "DM Sans"';
        if (endX - startX > 30) ctx.fillText(e.label, startX + 9, y + 5);
      }
      ctx.restore();
      frame = requestAnimationFrame(draw);
    }
    draw();
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
    };
  }, [events, track, readPlayer, staticView, knownStrings, hasUnassigned, maxDuration]);
  const current = readPlayer().currentTick;
  const visible = events.filter(
    (e) =>
      e.tick >= Math.floor(current / 3840) * 3840 &&
      e.tick < Math.floor(current / 3840) * 3840 + 3840,
  );
  return (
    <section className="stage-timeline" aria-label="Passage timeline">
      <div className="timeline-heading">
        <span>{staticView ? 'Static passage' : 'Follow the play line'}</span>
        <span>Note names · {knownStrings ? 'string 1 at the top' : 'unassigned note lane'}</span>
      </div>
      {symbols && (
        <div className="timeline-chords" aria-label="Authored chord progression">
          {symbols.map((symbol, i) => (
            <span key={i} aria-current={currentOccurrence?.measureIndex === i ? 'step' : undefined}>
              {symbol}
              <small>bar {i + 1}</small>
            </span>
          ))}
        </div>
      )}
      <canvas ref={canvas} aria-hidden="true" />
      <details className="timeline-equivalent">
        <summary>Read this passage as text</summary>
        <ol>
          {visible.map((e) => (
            <li key={e.id}>
              {e.label}
              {e.string ? `, string ${e.string}, fret ${e.fret}` : ', position unassigned'} · beat{' '}
              {Math.round((e.tick / 960) * 100) / 100 + 1} · {e.duration / 960} beats
            </li>
          ))}
        </ol>
      </details>
      <p>Playback guide. Following the notes does not assess your playing.</p>
    </section>
  );
}
