# Arrangement requests v1

This dataset contains 96 synthetic requests across 24 authored musical contexts.
Each context has a literal request, a paraphrase, a boundary case, and an
adversarial request. The two development cases use separate context IDs and are
excluded from scored evaluation.

The contexts cover twelve root spellings, standard and drop-D tuning, capo,
major/minor and seventh/ninth chords, and explicit melody anchors. Requests cover
neck regions, string limits, bass preservation, extensions, contextual
substitutions, rootless voicings, and melody preservation. Boundary cases include
unconfirmed harmony, absent melody, vague preferences, and impossible fret limits.
All harmonic timing and note anchors were authored for this application; none was
extracted from the user's Guitar Pro file. These fixtures are dedicated to CC0.

Expected actions and constraints are authored labels. The engine derives legal
voicings, pitch values, and fact references; generated notes are not independent
human judgments of musical quality. The checker separately validates physical
string/fret pitch, chord membership, source immutability, and melody anchors.

The same developer authored the parser, cases, and prompt. The request templates
are a limited language sample, and four variants of a context share music.
Repeated model trials do not increase the number of unique contexts. This dataset
can expose application failures but cannot estimate learning gains, natural user
request prevalence, or a model's general musical ability.

`cases.json` and `development-cases.json` in the campaign evidence directory are
the frozen inputs. `manifest.json` contains their SHA-256 digests and the source
hashes. `campaign.json` retains original outputs and failed requests;
`summary.json` uses the frozen denominator. Public GuitarSet and Guitar-TECHS
annotations belong to the separate voicing-ranking study, not this request set.
