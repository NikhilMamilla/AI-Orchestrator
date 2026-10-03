"""Natural-language-inference scorer: P(evidence entails claim).

Entailment is the right question for faithfulness ("does the source support this sentence?"), and unlike
word overlap it distinguishes "binary search is O(log n)" from "binary search is O(n)". We use a small
free cross-encoder fine-tuned on MNLI/SNLI that runs on CPU. If it cannot be loaded the verifier falls
back to the lexical+embedding score, and the trace records which was used.
"""
from __future__ import annotations

import logging
from typing import List, Sequence, Tuple

import numpy as np

logger = logging.getLogger(__name__)
DEFAULT_MODEL = "cross-encoder/nli-deberta-v3-xsmall"


class NLIScorer:
    def __init__(self, model_name: str = DEFAULT_MODEL):
        from sentence_transformers import CrossEncoder
        self.name = model_name
        self._model = CrossEncoder(model_name, max_length=320)
        id2label = {int(k): v.lower() for k, v in self._model.model.config.id2label.items()}
        self._entail = next(i for i, v in id2label.items() if "entail" in v)
        self._contra = next(i for i, v in id2label.items() if "contra" in v)

    def entailment(self, pairs: Sequence[Tuple[str, str]]) -> np.ndarray:
        """pairs = [(premise, hypothesis)] -> P(entailment) per pair."""
        if not pairs:
            return np.zeros(0, dtype=np.float32)
        logits = np.asarray(self._model.predict(list(pairs), show_progress_bar=False, batch_size=16))
        logits = logits - logits.max(axis=1, keepdims=True)
        probs = np.exp(logits)
        probs /= probs.sum(axis=1, keepdims=True)
        return probs[:, self._entail].astype(np.float32)


def load_nli(enabled: bool = True):
    if not enabled:
        return None
    try:
        return NLIScorer()
    except Exception as e:
        logger.warning("NLI model unavailable (%s); verifier will use lexical+embedding support", e)
        return None
