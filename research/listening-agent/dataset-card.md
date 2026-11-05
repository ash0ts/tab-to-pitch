# Listening-agent fixtures

These are original authored music and scripted learner histories, licensed CC0-1.0. No popular-song audio, Guitar Pro attachment, playlist, real learner transcript, or private practice history enters this campaign.

There are 18 progression contexts: six development contexts and twelve held-out contexts. Each has four evidence patterns: unseen, roots correct with a quality error, reordered chords, and assisted/revealed work. This produces 24 development and 48 checkpoint cases. Twelve held-out contexts also seed six-turn scripted episodes and twelve boundary probes.

Each authored context has a distinct synthetic-recording identity. Development and evaluation progression families are disjoint after root transposition is normalized; transposed variants stay in one family. Chord qualities are part of that signature. This is a fixture identity convention, not a dataset of recorded human performances. The original C/G onboarding study is related practice and is not counted as two independent evaluation families.

Inspect [the authored harmony](../../src/songs/authored.ts), [case construction](cases.ts), and [cohort assertions](contracts.test.ts). Campaign `cases.json` preserves exact membership; `manifest.json` records SHA-256 hashes of fixtures and executable sources. `source/` is the frozen source tree. Derived responses, tool calls, usage, and scores are retained separately from source fixtures.

The teacher receives the supplied key, confirmed chord spans, constraints, source type, and bounded history. Root, quality, and sequence evidence are distinct. Scripted episodes carry dialogue forward; help is recorded before an assisted question response. Their answers come from the deterministic exercise engine. These episodes test orchestration and memory, not whether a learner can hear a chord.

The popular-song catalog remains separate. Official YouTube previews for U2, Ben E. King, and The Beatles have not qualified as aligned grading stimuli. The 4 November isolated-browser check returned “video unavailable” for all three embeds. They are excluded from this evaluation and its distributable media. No familiar-song recognition estimate is reported. Future unfamiliar audio probes need an actual listening protocol and cannot be replaced by text-only teacher cases.

The independent reviewer reuses the existing 120 factual fixtures (60 development, 60 held out) and 24 dialogue challenges. They cover incorrect notes/roles, invented playing observations, answer leakage, and instruction takeover. Reviewer failures remain missing evaluator output. A runtime critic's approval is not an independent quality rating.
