# Authored music-teacher scenarios

## Origin and intended use

These examples were authored for TabToPitch's free-form teacher evaluation. They describe hypothetical learners and original progressions, not scraped conversations, recorded practice, or learner outcomes. The prompts reflect product tasks motivated by supplied guitar-learning discussions, but no Reddit text or identities appear in the dataset.

The musical examples use ii7–V7–Imaj7–vi7 progressions in eight major keys, alternate tunings, capo, different neck regions, and explicitly present or absent bass context. Separate lesson objectives cover chord roles, connecting a dominant seventh to a tonic third, and ninth/rootless interpretation. Musical fact strings and expected claim labels are authored independently of the production explanation generator. The same engineering team wrote the fixtures and harness; there is no independent music-teacher annotation.

## Membership

| Partition             | Count | Unit                                                               |
| --------------------- | ----: | ------------------------------------------------------------------ |
| Development           |    36 | Nine contexts across three lessons, each with four evidence states |
| Fixed histories       |    96 | Twenty-four contexts, each with four evidence states               |
| Boundary              |    24 | Eight boundary requests in each lesson                             |
| Episodes              |    24 | One scripted conversation per evaluation context, up to six turns  |
| Judge development     |    60 | Twenty fact contexts, each with three claim labels                 |
| Judge held-out        |    60 | Twenty different fact contexts, each with three claim labels       |
| Judge dialogue probes |    24 | Six known error/valid-response categories with surface variations  |

Development teaching contexts use separate identities and regions, although some keys and teaching concepts recur. This is a fixture split, not a learner-held-out split. Judge dialogue surface variants are correlated and are reported as probes, not 24 independent pedagogical observations. Trial repetition does not increase the number of contexts.

The four evidence states are untested, incorrect first response, assisted/revealed correctness, and repeated unassisted answers on variants. They are synthetic histories. The episode script can request help or a new example, but cannot measure whether instruction caused learning.

## Labels and limitations

Ordinary labels describe learner goals, allowed observations, and forbidden unsupported claims. They do not require the local teacher's wording or exact tool sequence. Structural criteria are computed from actual execution. Free-prose judgments use a separately qualified model and remain automated opinions about these fixtures. Claim calibration tests known factual and evidence-boundary cases, not every subtle musical statement or every pedagogical choice.

No public music dataset supplies teaching-quality labels here. GuitarSet recorded-choice ranking and Guitar-TECHS tool-conformance results retain their separate data cards and scopes. The Hotelier attachment, imported files, filenames, lyrics, and real practice history are excluded.

Each preparation writes a source snapshot, exact fixture JSON, partition membership, and SHA-256 checksums. Existing preparations cannot be overwritten. New outputs require a new immutable campaign identity. The scenario text and musical examples are original project material; no third-party score or recording license is needed for these fixtures.
