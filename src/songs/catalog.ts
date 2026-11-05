import { AUTHORED_PASSAGES, AUTHORED_RECORDINGS } from './authored.js';
import { z } from 'zod';
import { parseChordSymbol } from '../engine/harmony.js';

export const CATALOG_VERSION = 'songs-v1';
const symbol = z
  .string()
  .max(24)
  .refine((value) => !!parseChordSymbol(value));
export const songSchema = z
  .object({
    id: z.string().max(80),
    title: z.string().max(200),
    artist: z.string().max(200),
  })
  .strict();
export const recordingSchema = z
  .object({
    id: z.string().max(80),
    songId: z.string().max(80),
    provider: z.enum(['youtube', 'synthesized']),
    videoId: z
      .string()
      .regex(/^[\w-]{11}$/)
      .optional(),
    description: z.string().max(400),
    availability: z.enum(['verified', 'pending']),
  })
  .strict();
export const passageSchema = z
  .object({
    id: z.string().max(100),
    version: z.literal(CATALOG_VERSION),
    recordingId: z.string().max(80),
    title: z.string().max(160),
    tonic: z.string().regex(/^[A-G](?:#|b)?$/),
    bpm: z.number().min(30).max(240),
    startSeconds: z.number().nonnegative().nullable(),
    endSeconds: z.number().positive().nullable(),
    chords: z
      .array(
        z
          .object({
            symbol,
            beats: z.number().int().min(1).max(16),
            alternatives: z.array(symbol).max(4),
          })
          .strict(),
      )
      .min(2)
      .max(8),
    status: z.enum(['authored', 'reviewed', 'pending']),
    representation: z.enum(['authored', 'teaching-reduction']),
    sources: z.array(z.string().url()).max(8),
    review: z.string().max(1000),
    reuse: z.string().max(800),
  })
  .strict()
  .superRefine((p, ctx) => {
    if (
      p.status === 'reviewed' &&
      (p.startSeconds === null || p.endSeconds === null || p.endSeconds <= p.startSeconds)
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Reviewed recordings require aligned excerpt boundaries.',
      });
  });
export type Song = z.infer<typeof songSchema>;
export type Recording = z.infer<typeof recordingSchema>;
export type Passage = z.infer<typeof passageSchema>;
const chords = (symbols: string[], beats = 4) =>
  symbols.map((symbol) => ({ symbol, beats, alternatives: [] }));
export const SONGS: Song[] = [
  { id: 'original', title: 'One progression, many places', artist: 'TabToPitch' },
  { id: 'u2-with-or-without-you', title: 'With or Without You', artist: 'U2' },
  { id: 'king-stand-by-me', title: 'Stand by Me', artist: 'Ben E. King' },
  { id: 'beatles-let-it-be', title: 'Let It Be', artist: 'The Beatles' },
];
export const RECORDINGS: Recording[] = [
  ...AUTHORED_RECORDINGS,
  {
    id: 'original-synth',
    songId: 'original',
    provider: 'synthesized',
    availability: 'verified',
    description: 'Original CC0 accompaniment, synthesized locally.',
  },
  {
    id: 'u2-official',
    songId: 'u2-with-or-without-you',
    provider: 'youtube',
    videoId: 'ujNeHIo7oTE',
    availability: 'pending',
    description: 'Official music video. Excerpt alignment has not been reviewed.',
  },
  {
    id: 'king-original',
    songId: 'king-stand-by-me',
    provider: 'youtube',
    videoId: 'TJx9E-rUqhg',
    availability: 'pending',
    description: 'Official audio upload. Embedding and excerpt alignment still need review.',
  },
  {
    id: 'beatles-original',
    songId: 'beatles-let-it-be',
    provider: 'youtube',
    videoId: 'CGj85pVzRJs',
    availability: 'pending',
    description:
      'Official music video, remastered 2015. This performance needs its own excerpt alignment.',
  },
];
const pending = {
  version: CATALOG_VERSION,
  startSeconds: null,
  endSeconds: null,
  status: 'pending',
  representation: 'teaching-reduction',
  review:
    'The harmonic outline is a catalog candidate. Exact recording, timing, and embedding require review before grading.',
  reuse:
    'Recording shown only in its supported YouTube player. No recording, lyrics, melody, or third-party score is distributed.',
} as const;
export const PASSAGES: Passage[] = [
  {
    id: 'original-c',
    version: CATALOG_VERSION,
    recordingId: 'original-synth',
    title: 'Four chords, one key',
    tonic: 'C',
    bpm: 84,
    startSeconds: 0,
    endSeconds: (16 * 60) / 84,
    chords: chords(['Dm7', 'G7', 'Cmaj7', 'Am7']),
    status: 'authored',
    representation: 'authored',
    sources: [],
    review: 'Original authored harmony; independently checked in catalog fixtures.',
    reuse: 'CC0-1.0',
  },
  {
    id: 'original-g',
    version: CATALOG_VERSION,
    recordingId: 'original-synth',
    title: 'The same relationships in G',
    tonic: 'G',
    bpm: 84,
    startSeconds: 0,
    endSeconds: (16 * 60) / 84,
    chords: chords(['Am7', 'D7', 'Gmaj7', 'Em7']),
    status: 'authored',
    representation: 'authored',
    sources: [],
    review:
      'Authored transposition of the original study; a related example, not independent evidence of transfer.',
    reuse: 'CC0-1.0',
  },
  {
    ...pending,
    id: 'u2-verse',
    recordingId: 'u2-official',
    title: 'Verse harmonic outline',
    tonic: 'D',
    bpm: 110,
    chords: chords(['D', 'A', 'Bm', 'G']),
    sources: [
      'https://www.hooktheory.com/theorytab/view/u2/with-or-without-you',
      'https://www.u2.com/pages/videos/with-or-without-you',
    ],
  },
  {
    ...pending,
    id: 'king-verse',
    recordingId: 'king-original',
    title: 'Verse harmonic outline',
    tonic: 'A',
    bpm: 118,
    chords: ['A', 'F#m', 'D', 'E', 'A'].map((symbol, i) => ({
      symbol,
      beats: [8, 8, 4, 4, 8][i]!,
      alternatives: [],
    })),
    sources: [
      'https://www.hooktheory.com/theorytab/view/ben-e-king/stand-by-me',
      'https://www.youtube.com/watch?v=TJx9E-rUqhg',
    ],
  },
  {
    ...pending,
    id: 'beatles-opening',
    recordingId: 'beatles-original',
    title: 'Opening phrase harmonic outline',
    tonic: 'C',
    bpm: 72,
    chords: chords(['C', 'G', 'Am', 'F']),
    sources: [
      'https://www.hooktheory.com/theorytab/view/the-beatles/let-it-be',
      'https://www.thebeatles.com/let-it-be-3',
    ],
  },
];
PASSAGES.push(...AUTHORED_PASSAGES);
export function passageReady(
  p: Passage,
  recording = RECORDINGS.find((r) => r.id === p.recordingId),
): boolean {
  return (
    !!recording &&
    recording.availability === 'verified' &&
    p.status !== 'pending' &&
    (recording.provider === 'synthesized' ||
      (!!recording.videoId &&
        p.status === 'reviewed' &&
        p.startSeconds !== null &&
        p.endSeconds !== null))
  );
}
export const catalogSourceId = (p: Passage) => `catalog:${p.version}:${p.id}`;
export const passageForSource = (id: string) => PASSAGES.find((p) => catalogSourceId(p) === id);

export interface SongListEntry {
  artist: string;
  title: string;
}
export interface SongListProvider {
  id: string;
  parse(text: string): SongListEntry[];
}
export interface HarmonyProvider {
  getPassage(id: string): Passage | undefined;
}
export interface RecordingProvider {
  getRecording(id: string): Recording | undefined;
}
export const curatedHarmony: HarmonyProvider = {
  getPassage: (id) => PASSAGES.find((p) => p.id === id),
};
export const catalogRecordings: RecordingProvider = {
  getRecording: (id) => RECORDINGS.find((r) => r.id === id),
};
/** Metadata boundary only; no Spotify API request or credential is accepted. */
export const spotifyProvider = {
  id: 'spotify',
  enabled: false,
  reason: 'Live playlist connection is pending a permitted integration route.',
} as const;

function csvRows(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = '',
    quoted = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i]!;
    if (c === '"') {
      if (quoted && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (c === ',' || c === '\n')) {
      row.push(cell.trim());
      cell = '';
      if (c === '\n') {
        if (row.some(Boolean)) rows.push(row);
        row = [];
      }
    } else if (c !== '\r') cell += c;
  }
  if (quoted) throw new Error('A quoted CSV field is unfinished.');
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}
export const localSongLists: SongListProvider = {
  id: 'local',
  parse(text) {
    if (text.length > 100_000) throw new Error('Use a list smaller than 100 KB.');
    const rows = csvRows(text.replace(/^\uFEFF/, ''));
    if (rows.length > 501) throw new Error('Import up to 500 songs at a time.');
    const header = rows[0]?.map((c) => c.toLowerCase());
    const artistIndex = header?.indexOf('artist') ?? -1;
    const titleIndex = header?.findIndex((c) => c === 'title' || c === 'track name') ?? -1;
    const entries =
      artistIndex >= 0 && titleIndex >= 0
        ? rows.slice(1).map((r) => ({ artist: r[artistIndex] ?? '', title: r[titleIndex] ?? '' }))
        : rows.map((r) => {
            if (r.length >= 2) return { artist: r[0]!, title: r[1]! };
            const parts = r[0]!.split(/\s+[–—-]\s+/);
            return { artist: parts.length > 1 ? parts.shift()! : '', title: parts.join(' - ') };
          });
    if (entries.some((e) => !e.title || e.artist.length > 200 || e.title.length > 200))
      throw new Error('Each row needs a title, with artist and title under 200 characters.');
    return entries;
  },
};
const normalize = (s: string) =>
  s
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
export function matchSong(entry: SongListEntry) {
  const songs = SONGS.filter(
    (s) =>
      normalize(s.title) === normalize(entry.title) &&
      (!entry.artist || normalize(s.artist) === normalize(entry.artist)),
  );
  const passages = PASSAGES.filter((p) =>
    RECORDINGS.some((r) => r.id === p.recordingId && songs.some((s) => s.id === r.songId)),
  );
  const status = !songs.length
    ? 'unsupported'
    : !entry.artist || songs.length > 1 || !passages.some((p) => passageReady(p))
      ? 'confirmation'
      : 'ready';
  return { entry, status, songs, passages } as const;
}
