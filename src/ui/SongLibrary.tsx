import { useState } from 'react';
import { Music2, ArrowRight, Upload } from 'lucide-react';
import {
  SONGS,
  RECORDINGS,
  matchSong,
  localSongLists,
  passageReady,
  type Passage,
  type SongListEntry,
} from '../songs/catalog';
import './songs.css';
import { RecordingPlayer } from './RecordingPlayer';
import { playback } from '../player/PlaybackCoordinator';

export function SongLibrary({ onOpen }: { onOpen(p: Passage): void }) {
  const [expanded, setExpanded] = useState(false),
    [text, setText] = useState(''),
    [error, setError] = useState('');
  const [preview, setPreview] = useState<Passage | null>(null);
  const [entries, setEntries] = useState<SongListEntry[]>(SONGS);
  function parse(value: string) {
    try {
      setEntries(localSongLists.parse(value));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <section className="song-library" aria-label="Learn from my songs">
      <div className="songs-heading">
        <div>
          <span className="eyebrow">
            <Music2 size={15} /> Learn from my songs
          </span>
          {expanded && (
            <>
              <h2>Hear the change. Find it on the neck.</h2>
              <p>Use a short passage to connect your ear, the chord names, and your guitar.</p>
            </>
          )}
        </div>
        <button
          className="secondary-button"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Close song list' : 'Choose a song'} <ArrowRight size={16} />
        </button>
      </div>
      {expanded && (
        <>
          <form
            className="song-import"
            onSubmit={(e) => {
              e.preventDefault();
              parse(text);
            }}
          >
            <label htmlFor="song-list">
              Paste Artist - Title, one song per line, or CSV with artist,title columns
            </label>
            <textarea
              id="song-list"
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={100000}
              placeholder={'U2 - With or Without You\nBen E. King - Stand by Me'}
            />
            <div className="song-actions">
              <button className="secondary-button" disabled={!text.trim()}>
                Match my songs
              </button>
              <label className="secondary-button file-label">
                <Upload size={15} /> Import CSV
                <input
                  aria-label="Import song list CSV"
                  type="file"
                  accept=".csv,.txt,text/csv,text/plain"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (!file) return;
                    if (file.size > 100000) {
                      setError('Use a list smaller than 100 KB.');
                      return;
                    }
                    try {
                      const value = await file.text();
                      setText(value);
                      parse(value);
                    } catch {
                      setError('The song list could not be read.');
                    }
                  }}
                />
              </label>
              <button className="text-button" type="button" onClick={() => setEntries(SONGS)}>
                Demo playlist
              </button>
            </div>
            <p className="caption">
              Lists stay on this device. Spotify connection is not enabled yet.
            </p>
          </form>
          {error && <p role="alert">{error}</p>}
          <div className="song-list">
            {entries.map((entry, i) => {
              const match = matchSong(entry);
              return (
                <article key={i} className="song-row">
                  <div>
                    <strong>{entry.title}</strong>
                    <span>{entry.artist || 'Artist not supplied'}</span>
                  </div>
                  <div className="song-row-action">
                    <span className={`song-status ${match.status}`}>
                      {match.status === 'ready'
                        ? 'Ready'
                        : match.status === 'confirmation'
                          ? 'Needs song/version confirmation'
                          : 'Not yet supported'}
                    </span>
                    {match.passages
                      .filter((p) => passageReady(p))
                      .map((p) => (
                        <button
                          key={p.id}
                          className="text-button"
                          onClick={() => {
                            onOpen(p);
                            setExpanded(false);
                          }}
                        >
                          {p.title} <ArrowRight size={14} />
                        </button>
                      ))}
                    {match.status === 'confirmation' && (
                      <details>
                        <summary>What is available?</summary>
                        {match.passages.map((p) => (
                          <p key={p.id}>
                            {RECORDINGS.find((r) => r.id === p.recordingId)?.description} {p.review}{' '}
                            {RECORDINGS.find((r) => r.id === p.recordingId)?.videoId && (
                              <button
                                className="text-button"
                                onClick={() => {
                                  playback.stopAll();
                                  setPreview(p);
                                }}
                              >
                                Preview recording · quiz pending
                              </button>
                            )}{' '}
                            {p.sources.map((url) => (
                              <a href={url} key={url} target="_blank" rel="noreferrer">
                                Reference ↗{' '}
                              </a>
                            ))}
                          </p>
                        ))}
                      </details>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          {preview && (
            <section aria-label="Recording preview">
              <h3>{RECORDINGS.find((r) => r.id === preview.recordingId)?.description}</h3>
              <p>
                This full recording is for exploration. Its excerpt has not qualified for a
                listening quiz.
              </p>
              <RecordingPlayer
                key={preview.id}
                passage={preview}
                recording={RECORDINGS.find((r) => r.id === preview.recordingId)!}
                onStarted={() => {}}
                onInterrupted={() => {}}
              />
              <button className="text-button" onClick={() => setPreview(null)}>
                Close recording
              </button>
            </section>
          )}
          <p className="caption">
            A familiar title alone does not identify the recording or establish its chords. Pending
            passages are excluded from quizzes.
          </p>
        </>
      )}
    </section>
  );
}
