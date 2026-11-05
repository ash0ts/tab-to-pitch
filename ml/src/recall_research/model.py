from __future__ import annotations

import math
from typing import Any
import warnings

from .data import DataError
from .features import FEATURE_NAMES, FEATURE_VERSION, FeatureRow


def fit_logistic(rows: tuple[FeatureRow, ...], inverse_regularization: float = 1.0) -> dict[str, Any]:
    if not math.isfinite(inverse_regularization) or inverse_regularization <= 0:
        raise DataError("Inverse regularization C must be finite and positive.")
    if {row.label for row in rows} != {0, 1}:
        raise DataError("Logistic fitting requires both observed answer classes.")
    try:
        import sklearn
        from sklearn.exceptions import ConvergenceWarning
        from sklearn.linear_model import LogisticRegression
        from sklearn.preprocessing import StandardScaler
    except ImportError as error:
        raise DataError("Training dependency missing. Run uv sync --extra train.") from error
    matrix = [row.features for row in rows]
    labels = [row.label for row in rows]
    scaler = StandardScaler()
    transformed = scaler.fit_transform(matrix)
    model = LogisticRegression(C=inverse_regularization, solver="lbfgs", max_iter=1000)
    with warnings.catch_warnings():
        warnings.simplefilter("error", ConvergenceWarning)
        try:
            model.fit(transformed, labels)
        except ConvergenceWarning as error:
            raise DataError("Logistic fitting did not converge; no model will be saved.") from error
    weights = [float(coefficient / scale) for coefficient, scale in zip(model.coef_[0], scaler.scale_)]
    intercept = float(model.intercept_[0] - sum(weight * mean for weight, mean in zip(weights, scaler.mean_)))
    return {
        "schemaVersion": 1,
        "modelType": "regularized-logistic-recall",
        "featureVersion": FEATURE_VERSION,
        "featureNames": list(FEATURE_NAMES),
        "weights": weights,
        "intercept": intercept,
        "inverseRegularization": inverse_regularization,
        "fit": {"library": "scikit-learn", "version": sklearn.__version__, "solver": "lbfgs", "scaling": "train-only; folded into raw-feature coefficients"},
        "deploymentStatus": "shadow-only",
        "promotionEligible": False,
    }


def validate_model(model: Any) -> None:
    if not isinstance(model, dict) or model.get("schemaVersion") != 1 or model.get("modelType") != "regularized-logistic-recall":
        raise DataError("Unsupported model format.")
    if model.get("featureVersion") != FEATURE_VERSION or model.get("featureNames") != list(FEATURE_NAMES):
        raise DataError("Model feature contract does not match this implementation.")
    weights, intercept = model.get("weights"), model.get("intercept")
    if not isinstance(weights, list) or len(weights) != len(FEATURE_NAMES):
        raise DataError("Invalid coefficient dimensions.")
    if any(isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) for value in [intercept, *weights]):
        raise DataError("Model coefficients must be finite numbers.")


def predict(model: dict[str, Any], rows: tuple[FeatureRow, ...]) -> list[float]:
    validate_model(model)
    predictions = []
    for row in rows:
        if len(row.features) != len(FEATURE_NAMES) or any(not math.isfinite(value) for value in row.features):
            raise DataError("Invalid feature vector.")
        logit = model["intercept"] + sum(weight * value for weight, value in zip(model["weights"], row.features))
        if logit >= 0:
            probability = 1 / (1 + math.exp(-logit))
        else:
            exp_logit = math.exp(logit)
            probability = exp_logit / (1 + exp_logit)
        predictions.append(probability)
    return predictions
