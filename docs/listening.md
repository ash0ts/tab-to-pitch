# Learn from my songs

The listening activity connects a short harmonic passage to the existing teacher and progression workspace. A learner hears the passage, answers a chord question, examines a missed root or quality, and takes the progression to another neck region.

## Start a lesson

Open **Choose a song**. Paste `Artist - Title` lines, import a CSV with `artist,title` columns, or use the demonstration playlist. Matching uses normalized titles and artists; it never guesses a recording from a title alone. Lists remain local and are not included in teacher requests.

**Four chords, one key** opens the original Dm7–G7–Cmaj7–Am7 accompaniment. **Hear synthesized passage** uses the existing alphaTab player with guitar and bass. Guided asks for one missing chord; Recall asks for the sequence. Transfer opens the related study in another key and then offers the same fretboard workspace. This transposition is practice, not an independent measurement of unfamiliar-song transfer.

Choose an answer at each supplied change. Feedback separates root and quality errors and identifies a reordered chord set. **Find this progression on the neck** opens the arrangement controls with the same key, harmonic timing, and lesson evidence. Notes are prominent and octaves remain optional. Voicing movement, extensions, and supported substitutions retain their existing engine constraints.

The tonic reference is supplied support. Answer-choice auditions, synthesized bass comparisons, and teacher help mark an active attempt assisted before revealing material. Replaying the unchanged stimulus is recorded without marking assistance. Playback-start events establish exposure, not that a person listened attentively. A zero-replay or familiar-song answer does not establish recognition by ear.

## Catalog status

The original studies are available offline. With or Without You, Stand by Me, and Let It Be have candidate harmonic outlines and specific official YouTube uploads for visible previews. Their excerpt timestamps, chord alignment, and embedding qualification remain pending. They cannot become graded questions until reviewed. The interface says this explicitly. On 4 November 2026, the isolated Chromium check loaded all three player frames but each reported “video unavailable.” That environment-specific failure and the unreviewed alignment keep the quizzes locked; no successful recording playback is claimed.

The Beatles music video is a particular performance; it is not automatically interchangeable with an album or single version. Each cover, live performance, and transposition needs its own recording identity and alignment. The catalog stores provenance, revision, accepted interpretations, supported chord detail, and whether a chart is a teaching reduction. No audio, lyrics, third-party score, or melody is redistributed.

A reviewer must record the exact recording, excerpt boundaries, chord spans, key, accepted alternatives, reduction choices, and a successful embed/audio check before changing a passage to `reviewed` and its recording to `verified`. A search result or a working video URL alone is insufficient. See the [catalog module](../src/songs/catalog.ts) and [dataset card](../research/listening-agent/dataset-card.md).

## Implementation

`SongListProvider`, `RecordingProvider`, and `HarmonyProvider` separate discovery from audio and grading. The shipped providers are local list parsing, visible YouTube playback, and curated annotations. Spotify has a disabled metadata boundary; no OAuth flow, scraping, audio download, or transcription is included.

A catalog passage generates a separate alphaTab accompaniment. Its `catalog:songs-v1:…` identity never masquerades as an imported score. A lesson records either a score source or a catalog passage source. A frozen listening definition contains the passage revision, stimulus source, answer slots, and choices. Grading accepts the declared interpretations, including enharmonic root equivalents; a different root with the same quality does not count as the same chord.

`PlaybackCoordinator` stops other sources when alphaTab, a synthesized audition, or the visible YouTube player starts. It owns no audio clock. Recording playback uses the official IFrame API. Initial buffering does not create a wrong answer; later interruption, blocked playback, or source failure interrupts the question. Synthesized playback is explicitly a different stimulus. Excerpt looping is not sample-accurate.

The existing `ProgressionWorkspace` owns the shared lesson and progression controllers. Listening and teacher panels use those same instances. During an unassisted question, the score, progression diagrams, inspector, and conversation history are removed or hidden from both visual and accessibility output. Source, workspace, or cross-tab changes invalidate unfinished work. Source arrangements remain immutable; saving a variation remains explicit.

IndexedDB version 4 adds frozen listening definitions and immutable listening attempts. Version 1–3 backups remain accepted. Answers, reveals, interruptions, assistance, and actual playback starts are distinct events. Memory is updated synchronously before queued persistence, so a storage failure does not discard the current session. Export before closing a memory-only session. A reloaded unfinished question is interrupted rather than resumed as untouched recall.

## Experimental teacher

`/api/teacher/next` accepts `teacher-v1` and `teacher-v2`. V2 adds bounded passage identity, source, difficulty, active-question state, and separate root/quality/order evidence. Existing clients retain their contracts. The new tools inspect a verified passage and prepare recording replay, tonic reference, listening questions, synthesized bass comparisons, fretboard handoff, or a related example. Existing musical tools handle voicings and extensions.

The teacher still has four actor calls, eight tools, one critic, and one shared 60-second deadline. Model output never becomes an answer key. Invalid or stale actions are rejected. A failed review withholds actor prose and exposes the local guide. Complete engine output remains available in research traces; the actor receives compact candidate views to stay within the request-byte limit.

`TEACHER_AGENT_ENABLED` controls invited experimental access. `TEACHER_QUALIFICATION` reports the configuration's qualification status separately. Turning the feature on does not qualify it. Cloud consent covers the typed request, bounded recent conversation, normalized music, and bounded evidence. Production traces use the lifecycle allowlist. Authored research uses a separate policy; recordings, playlists, raw scores, and private song files are excluded.

See [deployment](deployment.md), the [listening research protocol](../research/listening-agent/README.md), and [results](../research/listening-agent/results.md). The existing voicing model and Registry lineage are unchanged. Prompt experiments do not create new training runs.

## Teaching basis and limits

The whole/part/whole and audiation tradition motivates connecting a heard progression, an isolated comparison, and musical context. It does not prescribe a compulsory sequence for the agent or prove this interface improves learning. [Gordon Institute methodology](https://giml.org/mlt/methodology/).

A root error, a quality error, and a sequence error call for different comparisons. The teacher can isolate bass motion, contrast qualities, or revisit a change, then return to the progression. A correct screen answer, remembered chart, self-reported playing, and assessed performance are different evidence. No microphone assessment exists here.

The listening difficulty is selected explicitly. Existing note/role/location exercises retain their hint fading and delayed-review policy; this iteration does not claim a separately validated listening scheduler. Human annotation review, real-device audio qualification, and a consented learner study remain required before stronger catalog or learning claims.
