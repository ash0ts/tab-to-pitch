# Research and evaluations

The public-data studies qualify parts of TabToPitch against recorded observations. The separate practice-intent study uses authored synthetic requests. Neither replaces the product's consented learner pilot or enables learned scheduling.

- `music-data/` imports GuitarSet annotations and derives conservative pitch/location exercises. The notes come from recordings; the exercises are generated. Frets are inferred from annotated string/pitch and tuning, not independent fingering observations.
- `coach-benchmark/` runs the existing bounded coaching agent on frozen held-out passages. The local policy and qualified hosted models are evaluated on the same frozen candidates; the two configured models must qualify before testing. There is no learner history in this dataset. Scores measure application contracts and execution reliability, not teaching quality.
- `recall-benchmark/` tests recall prediction on MIT-declared public Anki review observations. The outcome is self-rated recall in a different domain, not a verified TabToPitch answer.
- `forge/` publishes allowlisted experiment outputs and verifies their persisted state. Agent Lens conversations, Weave evaluations, Models experiments and hosted inference have separate receipts.
- `practice-intent/` compares a local parser with hosted inference when translating authored note/chord exploration requests into the actual fretboard controls. Exact meaning and engine safety are scored separately. Its [dataset card](practice-intent/dataset-card.md) and [results](practice-intent/results.md) explain the synthetic scope, retained failures and absence of a learning claim.

Read [the research contract](research-contract.md) before interpreting a result. Downloaded data and execution receipts live outside source control under the parent workspace's `.context/tabtopitch-real-data/`. Scripts take explicit paths. Keep source URLs, licenses, hashes, exclusions, split membership and actual model versions with every run.

Publication requires a private public-data project. Only licensed derived music facts, aggregate recall results, model coefficients, and provenance belong there. User-imported songs, private progress exports, raw review identifiers and credentials are excluded. No experiment automatically promotes a model to Registry or the application.
