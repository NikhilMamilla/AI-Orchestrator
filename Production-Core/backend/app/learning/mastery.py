"""Learner modelling: Bayesian Knowledge Tracing (BKT) and a spaced-repetition schedule.

BKT (Corbett & Anderson, 1995) is the classic, interpretable knowledge-tracing model: a hidden binary
state "knows the concept" updated from each observed answer with four parameters. It is cheap, needs no
training data, and its output is a probability that maps directly onto the PRD's mastery thresholds.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional


@dataclass(frozen=True)
class BKTParams:
    p_init: float = 0.20     # prior probability the learner already knows the concept
    p_learn: float = 0.18    # chance of learning it from one practice opportunity
    p_slip: float = 0.10     # knows it but answers wrong
    p_guess: float = 0.25    # does not know it but answers right (4-option multiple choice)


def params_for_level(level: int) -> BKTParams:
    """Harder concepts: lower prior, slower learning, slightly more slips."""
    return {1: BKTParams(0.25, 0.20, 0.08, 0.25),
            2: BKTParams(0.18, 0.17, 0.10, 0.25),
            3: BKTParams(0.12, 0.14, 0.12, 0.25)}.get(level, BKTParams())


def bkt_update(p_known: float, correct: bool, params: BKTParams = BKTParams()) -> float:
    """Posterior P(known) after one observation, then the learning transition."""
    p = min(max(p_known, 1e-4), 1 - 1e-4)
    if correct:
        posterior = p * (1 - params.p_slip) / (p * (1 - params.p_slip) + (1 - p) * params.p_guess)
    else:
        posterior = p * params.p_slip / (p * params.p_slip + (1 - p) * (1 - params.p_guess))
    return posterior + (1 - posterior) * params.p_learn


def assisted(params: BKTParams, hints: int = 0, confidence: Optional[str] = None) -> BKTParams:
    """Parameters for a *correct* answer given help: hints and a self-reported guess make luck a likelier explanation,
    so the same correct answer earns less mastery. (Wrong answers are left untouched.)"""
    boost = 0.12 * max(0, hints) + (0.20 if confidence == "guess" else 0.0)
    return BKTParams(params.p_init, params.p_learn, params.p_slip, min(0.60, params.p_guess + boost))


MASTERED, DEEPEN, READY = 0.80, 0.60, 0.60       # PRD thresholds (section 7.5 decision logic)


# ---------- spaced repetition ----------
@dataclass
class ReviewState:
    interval_days: float = 0.0
    ease: float = 2.3
    reps: int = 0


def next_review(state: ReviewState, correct: bool, mastery: float,
                now: Optional[datetime] = None) -> tuple[ReviewState, datetime]:
    """SM-2-style schedule driven by correctness and current mastery.

    Correct answers grow the interval (1 d, 3 d, then x ease); a wrong answer resets to 1 day and lowers
    the ease so shaky concepts come back sooner. Not yet-mastered concepts are reviewed within a day.
    """
    now = now or datetime.now(timezone.utc)
    if not correct:
        st = ReviewState(interval_days=1.0, ease=max(1.3, state.ease - 0.2), reps=0)
    else:
        reps = state.reps + 1
        if reps == 1:
            interval = 1.0
        elif reps == 2:
            interval = 3.0
        else:
            interval = max(state.interval_days, 3.0) * state.ease
        if mastery < DEEPEN:
            interval = min(interval, 1.0)
        st = ReviewState(interval_days=round(interval, 2), ease=min(2.8, state.ease + 0.05), reps=reps)
    return st, now + timedelta(days=st.interval_days)


def retention(days_since_review: float, interval_days: float) -> float:
    """Estimated recall probability: exponential forgetting curve with stability ~ interval."""
    import math
    stability = max(interval_days, 0.5)
    return math.exp(-max(days_since_review, 0.0) / (stability * 1.44))
