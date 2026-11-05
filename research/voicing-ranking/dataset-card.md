# Dataset context

## GuitarSet observed choices

[GuitarSet v1.1.0](https://zenodo.org/records/3371780) contains recordings by six guitarists playing 30 lead sheets in accompaniment and solo versions. The lead sheets vary style, progression and tempo. Per-string pitch and timing annotations come from a hexaphonic pickup. Frets in our input are inferred from rounded pitch and known tuning; they are not independently observed hand positions.

The [original paper](https://ismir2018.ismir.net/doc/pdfs/188_Paper.pdf) describes how performers could choose voicings and extensions. Its performed-chord annotation uses the same notes with the lead sheet's root and segmentation. We therefore use observed string/fret shapes as a choice target, not those chord annotations as independent harmonic truth.

The existing adapter retains stable pitches and excludes three upstream errata recordings. This study samples a sound state 40 ms after each note attack and requires another 40 ms of sustain. States must contain three to six distinct strings, three or four distinct pitch classes, and no more than four frets of fretted span. Open strings do not expand that span. Consecutive identical accepted states collapse; transitions more than two seconds apart are excluded.

The final cohort contains 4,317 transitions from 168 recordings. Each target is a recorded shape plus a supplied previous recorded shape. The input contains the requested pitch-class multiset, including duplicates, so voice count and chord-tone membership are already known. Candidate octave/register and physical locations remain unknown. This is more constrained than generating an arrangement from a chord symbol.

Alternative shapes are generated examples. They are musically valid alternatives, not documented bad choices. The model learns observed-choice likelihood; one guitarist choosing a shape does not make every other shape wrong. Arpeggiated/transient partial chords can still appear as accepted stable states. The extraction does not establish an intended full harmonic label.

Each held-out fold excludes one performer and one progression family from fitting. Its test set is their intersection; all 18 intersections are scored once. Related recordings remain correlated. Recording bootstrap intervals describe this corpus conditional on fitted models; six performers and three progression families limit generalization.

Attribution: Qingyang Xi, Rachel M. Bittner, Johan Pauwels, Xuzhou Ye, Juan P. Bello, _GuitarSet: A Dataset for Guitar Transcription_, ISMIR 2018. Data license: CC BY 4.0. Modifications: stable-note filtering, rounded-pitch fret inference, overlapping-state extraction, candidate enumeration, numeric features and choice-model fitting. Source annotations and prior experiments remain unchanged.

## Guitar-TECHS independent conformance

[Guitar-TECHS](https://zenodo.org/records/14963133) provides prescribed chord shapes recorded by two players, with synchronized per-string MIDI. Its chord collection includes major/minor/augmented/diminished triads and major seventh, dominant seventh, minor seventh and half-diminished seventh voicings, including drop-2/drop-3 shapes and inversions. These recordings supply independent musical coverage, not preference labels. [Collection method](https://arxiv.org/html/2501.03720v1).

The acquisition retrieves 56 MIDI files using exact byte ranges from the two official chord ZIP files. It retrieves archive directories and MIDI entries only. It checks pinned publisher sizes/checksums, ZIP CRC32 and a local SHA-256 for each extracted entry. Because the complete archives were not downloaded, their whole-archive MD5 values were not independently verified. No audio was downloaded.

The check uses documented string groups, filename chord quality, note pitches and sounding bass. It preserves symmetric-root ambiguity. Extra/missing-string states, out-of-range frets and ambiguous repeated note-on intervals remain explicit exclusions. Formula mismatches remain scored mismatches. Revision 1 stopped on a repeated note-on; revision 2 excludes all snapshots overlapping ambiguous intervals instead of guessing note-off correspondence. Revision 3 corrects the negative-fret sentinel check and produces the same counts on this corpus. Every receipt remains available. The actual application engine is checked separately on the 2,043 formula-matching states; its 2,043 matches do not include the 30 formula mismatches.

Attribution: Hegel Pedroza and colleagues, _Guitar-TECHS: An Electric Guitar Dataset Covering Techniques, Musical Excerpts, Chords and Scales Using a Diverse Array of Hardware_, ICASSP 2025. Official release: Zenodo record 14963133. Data license: CC BY 4.0. Modifications: selective MIDI extraction, stable-state sampling, coordinate/formula/inversion checks. No learner data is present in either dataset.
