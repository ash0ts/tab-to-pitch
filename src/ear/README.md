# Work it out by ear

This experimental activity adds listening investigation to the existing teacher and progression workspace. The learner controls the approach: replay a fragment, sing or play in the pause, audition a note or chord proposal, inspect a draft, or move the proposed progression across the neck.

The source recording, learner proposal, and model hypothesis remain separate. The original eight-second G7→Cmaj7 study has a versioned, fingerprint-bound answer contract. Uploaded recordings support exploration without automatic listening grades. Root and quality feedback are separate. Answer events freeze the submitted symbols, source range, reference version, assistance, replay count, and component grades.

Unassisted questions hide the score, progression, earlier teacher messages, and draft views. Help marks assistance before display. Playback of the original is recorded separately. Audio interruptions do not become incorrect answers. The playback coordinator stops the other players when the original, estimated part, or alphaTab synthesis starts.

Draft notes retain instrument hypotheses and source times. The overlap inspector calls the existing harmony engine on notes sounding at the selected instant; it does not merge an entire measure into one chord. Competing interpretations remain alternatives. The optional fingering proposal uses six strings, frets 0–24, and a four-fret span. It is a deterministic greedy realization, not an inference about the performer's hands. Every unassigned note has an inspectable reason; a search failure does not prove impossibility. JSON export retains all notes, times, authorities, and omissions.

Opening a proposal creates a separate synthesized accompaniment under the existing alphaTab controller. The learner's chord symbols seed confirmed harmony in the shared progression workspace. The accompaniment uses equal-length spans supplied by this first interface. It is a teaching reduction, not a faithful transcription. Existing preview, Apply & save, and Undo operate on the derived score.

Lesson checkpoints and immutable events use the existing IndexedDB stores. Older backups remain readable because the audio fields are optional. The app reports save completion and memory-only operation. Worker media and model artifacts remain in local filesystem storage, separate from browser backups.

The teacher can inspect bounded numeric evidence, retrieve teaching references, prepare demonstrations, request asynchronous analysis, and open the proposal in the fretboard. A local-only request binding never enters Forge payloads. Opaque job receipts can be traced. Job completion does not trigger another model turn, reveal notes, or save a variation.

Teaching references: [Liscio's observational ear-learning study](https://uwspace.uwaterloo.ca/items/6a548281-ef22-47cf-a3c1-a7067415896a) motivates fragment replay and auditionable proposals; [Rush's pilot](https://doi.org/10.1177/02557614251339552) motivates allowing different strategies; [Carone et al.](https://proceedings.mlr.press/v303/carone26a.html) motivates separating audio perception from symbolic explanation. These inform design choices, not claims of learning effectiveness.
