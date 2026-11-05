# Recall prediction research

This is an offline experiment scaffold. It predicts whether a learner will answer a supported question correctly without hints. Answer buttons still supply choices for some question types, so this outcome includes recognition and is not a uniform measure of free recall. It does not assess playing, change the app scheduler, or claim that a model improves learning.

The default run writes local JSON files. It never opens a W&B client. No real learner dataset or trained product model is included. Test records are synthetic and cannot be linked to Registry.

## Data contract

An ordinary progress export is not consent to research. Assemble a dataset only after recording each learner's consent for the stated purpose. A marker records that process; setting a Boolean does not replace it. Keep exports and run outputs outside version control.

The wrapper has this shape. The empty attempt list is illustrative and deliberately cannot train a model.

```json
{
  "schemaVersion": 1,
  "synthetic": false,
  "attemptSemantics": "first-terminal-answer-v1",
  "learners": [
    {
      "learnerId": "study-pseudonym",
      "consent": {
        "granted": true,
        "purpose": "recall-model-research",
        "recordedAt": "2026-10-29T00:00:00Z",
        "allowArtifactUpload": false
      },
      "export": {
        "schemaVersion": 1,
        "exportedAt": "2026-10-29T00:00:00Z",
        "attempts": []
      }
    }
  ]
}
```

`export` is the app's exported progress object. Use one unique pseudonym per learner and deduplicate overlapping exports. The current UI records one terminal event per question presentation. The `attemptSemantics` declaration requires that contract to have been audited for the exporting application revision. Repeated presentations of one exercise are separate events, not independent learners. Legacy or externally edited exports with unknown semantics need review before inclusion.

Only `correct` and `incorrect` events with `assisted:false`, no hints, and `evidence:"answer"` become labels. Reveals, interruptions, self-reports and assisted answers are excluded. Earlier reveals and assisted answers may count as prior exposure to an item; they never count as successful recall. Explicitly revoked or missing consent stops the entire run.

Raw responses, source note IDs, titles and score content are not loaded into feature records. Local split manifests contain hashed attempt and learner identifiers. Attempt identities hash a structured learner/attempt pair so separators inside either identifier cannot merge distinct records. W&B uploads exclude the dataset and split manifest.

## Features and splits

Each feature vector uses only events whose `answeredAt` is strictly earlier than the current `startedAt`. Unfinished overlapping attempts and simultaneous completions remain unavailable. Current correctness, current response, current response time and future events are excluded. Feature order is versioned in `features.py`.

Features describe the skill, planned review mode, prior skill answers/accuracy, time since a prior answer, and previous exposure to the same item. IDs are grouping keys, never model inputs. Personal history from a held-out learner can be available at inference time; it never becomes a fitting label. This is a learner-generalization test with available prior history, not a claim of cold-start performance.

Freeze the chronological cutoff and held-out learner IDs before inspecting results. Training answers must finish before the cutoff. Evaluation presentations must start at or after it. Presentations spanning the cutoff are excluded. One evaluation set covers later answers from training learners; the other covers learners excluded from fitting. Earlier evaluation-period outcomes can become later inference features, as they would during actual use, but never refit model parameters.

The pipeline stops if a split is empty or lacks either answer class, or if held-out learners leave no training learners. These checks establish computational feasibility, not adequate statistical power. There is no universal sample-size threshold in this code.

## Run locally

From `ml/`:

```sh
uv --no-config sync --locked --extra train
uv --no-config run --locked --extra train recall-research private-data/consented.json \
  --output outputs/shadow-001 \
  --cutoff 2026-11-15T00:00:00Z \
  --holdout-learner-id study-heldout-a
```

The date and pseudonym above are example inputs, not a collected study. `--no-config` prevents the enclosing W&B development repository's uv configuration from affecting this standalone project.

The baseline is the training cohort's smoothed success rate for each skill, with a training-only global fallback. The candidate is regularized logistic regression with training-only standardization. Its scaling is folded into plain JSON coefficients. The evaluator reports Brier score, log loss, calibration-bin counts and mean probabilities, and learner-averaged Brier score, both pooled and by exercise family. A family with no observations is explicitly unavailable; it is never reported as zero error. Calibration bins with no observations remain empty. The output is:

- `model.json`: versioned feature contract, finite coefficients, fit settings, and `promotionEligible:false`.
- `report.json`: baseline/candidate metrics, denominators, exclusions and limitations.
- `split-manifest.json`: exact local split membership and dataset hash.
- `run-manifest.json`: source hash, dataset/split hashes, Python/library versions and fit configuration.

An existing output directory is never overwritten. `model.py` reads JSON without executing code; it rejects unknown feature orders, dimensions and nonfinite coefficients. There is no pickle loading or automatic promotion path.

Run pipeline checks without optional training dependencies:

```sh
PYTHONPATH=src python3 -m unittest discover -s tests -v
```

Run the full synthetic end-to-end check after installing the training extra:

```sh
uv --no-config run --locked --extra train python -m unittest discover -s tests -v
```

Tests block socket connections. The synthetic end-to-end run uses a temporary directory and asserts that publication never runs. Synthetic data require `--allow-synthetic` outside tests and remain labeled throughout every artifact.

## Optional W&B publication

Publication requires `--log-wandb`, `--wandb-project`, and `allowArtifactUpload:true` in every included learner's consent. Installing the W&B extra alone does not enable logging. `--upload-artifacts` separately authorizes uploading the model, aggregate report and run manifest. `--registry-path` also requires artifact upload and links only the `shadow` alias. Registry linking is forbidden for synthetic datasets.

```sh
uv --no-config sync --locked --extra train --extra wandb
uv --no-config run --locked --extra train --extra wandb recall-research private-data/consented.json \
  --output outputs/shadow-002 \
  --cutoff 2026-11-15T00:00:00Z \
  --holdout-learner-id study-heldout-a \
  --log-wandb --wandb-project recall-research --upload-artifacts \
  --registry-path wandb-registry-model/recall-shadow
```

This command is an explicit external publication action. No upload was performed while building or testing this scaffold. Registry storage does not authorize serving the model or changing the product scheduler.

The [prospective protocol](prospective-protocol.md) defines the next evidence needed. Library references: [logistic regression](https://scikit-learn.org/stable/modules/generated/sklearn.linear_model.LogisticRegression.html), [probability calibration](https://scikit-learn.org/stable/modules/calibration.html), [W&B Registry linking](https://docs.wandb.ai/guides/core/registry/model_registry/link-model-version/).
