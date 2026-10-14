"""'Time invested' is estimated from the timed answers; it is never a permanent zero and says it is an estimate."""
import inspect

from backend.app.api.v1 import dashboard
from backend.app.learning.time_spent import ATTEMPT_CAP_SECONDS, estimated_minutes


def test_the_estimate_adds_up_timed_answers():
    assert estimated_minutes([{"s": 30}, {"s": 90}, {"s": 60}]) == 3


def test_a_question_left_open_for_hours_is_capped_not_counted_as_study():
    assert estimated_minutes([{"s": 7200}]) == round(ATTEMPT_CAP_SECONDS / 60)


def test_untimed_answers_and_an_empty_history_add_nothing():
    assert estimated_minutes([{"s": None}, {}, {"s": 0}, {"s": -5}]) == 0
    assert estimated_minutes([]) == 0


def test_the_dashboard_reports_the_estimate_and_says_so():
    src = inspect.getsource(dashboard.get_dashboard_summary)
    assert "estimated_minutes(" in src and '"time_is_estimated": True' in src
