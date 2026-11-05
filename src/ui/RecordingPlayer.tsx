import { useEffect, useRef, useState } from 'react';
import { playback } from '../player/PlaybackCoordinator';
import type { Passage, Recording } from '../songs/catalog';

interface YouTubePlayer {
  playVideo(): void;
  pauseVideo(): void;
  destroy(): void;
  cueVideoById(options: { videoId: string; startSeconds: number; endSeconds: number }): void;
}
interface YouTubeApi {
  Player: new (element: HTMLElement, options: Record<string, unknown>) => YouTubePlayer;
}
declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}
let apiPromise: Promise<YouTubeApi> | undefined;
function loadApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  return (apiPromise ??= new Promise<YouTubeApi>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    const timeout = setTimeout(() => {
      apiPromise = undefined;
      reject(new Error('YouTube did not load.'));
    }, 15000);
    window.onYouTubeIframeAPIReady = () => {
      clearTimeout(timeout);
      previous?.();
      if (window.YT) resolve(window.YT);
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = () => {
      clearTimeout(timeout);
      apiPromise = undefined;
      reject(new Error('YouTube is unavailable.'));
    };
    document.head.append(script);
  }));
}
export function RecordingPlayer({
  passage,
  recording,
  onStarted,
  onInterrupted,
  command = 0,
}: {
  passage: Passage;
  recording: Recording;
  onStarted(): void;
  onInterrupted(): void;
  command?: number;
}) {
  const host = useRef<HTMLDivElement>(null),
    player = useRef<YouTubePlayer | null>(null);
  const [ready, setReady] = useState(false),
    [error, setError] = useState('');
  const callbacks = useRef({ onStarted, onInterrupted });
  callbacks.current = { onStarted, onInterrupted };
  useEffect(() => {
    setReady(false);
    setError('');
    let cancelled = false,
      hasPlayed = false;
    const container = document.createElement('div');
    host.current?.append(container);
    const unregister = playback.register('youtube', () => player.current?.pauseVideo());
    void loadApi()
      .then((api) => {
        if (cancelled || !recording.videoId) return;
        player.current = new api.Player(container, {
          width: '100%',
          height: '270',
          videoId: recording.videoId,
          playerVars: { origin: location.origin, playsinline: 1 },
          events: {
            onReady: () => {
              if (!cancelled) setReady(true);
            },
            onStateChange: (event: { data: number }) => {
              if (cancelled) return;
              if (event.data === 3 && hasPlayed) callbacks.current.onInterrupted();
              if (event.data === 1) {
                hasPlayed = true;
                playback.claim('youtube');
                callbacks.current.onStarted();
              }
            },
            onError: () => {
              if (cancelled) return;
              setError(
                'This recording cannot play here. Choose the synthesized example to continue with a different stimulus.',
              );
              callbacks.current.onInterrupted();
            },
            onAutoplayBlocked: () => {
              if (!cancelled) {
                setError('Press Play in the visible video player to enable audio.');
                callbacks.current.onInterrupted();
              }
            },
          },
        });
      })
      .catch(() => {
        if (!cancelled) {
          setError('YouTube could not load. The local synthesized example is still available.');
          callbacks.current.onInterrupted();
        }
      });
    return () => {
      cancelled = true;
      unregister();
      player.current?.destroy();
      player.current = null;
      container.remove();
    };
  }, [recording.id]);
  function replay() {
    if (passage.startSeconds === null || passage.endSeconds === null || !recording.videoId) return;
    playback.claim('youtube');
    player.current?.cueVideoById({
      videoId: recording.videoId,
      startSeconds: passage.startSeconds,
      endSeconds: passage.endSeconds,
    });
    player.current?.playVideo();
  }
  useEffect(() => {
    if (command && ready) replay();
  }, [command]);
  return (
    <div className="recording-player">
      <div ref={host} />
      <div className="song-actions">
        <button
          className="secondary-button"
          disabled={!ready || passage.startSeconds === null || passage.endSeconds === null}
          onClick={replay}
        >
          Replay recording excerpt
        </button>
        <button className="text-button" onClick={() => player.current?.pauseVideo()}>
          Pause recording
        </button>
      </div>
      {error && <p role="status">{error}</p>}
    </div>
  );
}
