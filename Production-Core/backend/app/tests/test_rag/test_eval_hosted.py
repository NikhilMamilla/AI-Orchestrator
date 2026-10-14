"""The evaluation scripts can measure the deployed (hosted) configuration, and the evidence-gate threshold is a separate
setting per configuration. Nothing here calls the network or an LLM."""
import inspect

import pytest

from backend.app.config import settings
from backend.app.rag import evaluation, gen_eval, redteam_eval
from backend.app.rag.configurations import pipeline_config


def test_the_gate_threshold_is_a_setting_per_configuration(monkeypatch):
    monkeypatch.setattr(settings, "RAG_GATE_LOCAL", 0.14)
    monkeypatch.setattr(settings, "RAG_GATE_HOSTED", 0.31)
    assert pipeline_config(hosted=False).min_top_score == 0.14
    assert pipeline_config(hosted=True).min_top_score == 0.31


def test_both_gate_settings_default_to_the_calibrated_local_value():
    assert settings.RAG_GATE_LOCAL == 0.14 and settings.RAG_GATE_HOSTED == 0.14


def test_the_service_builds_its_pipeline_with_the_per_configuration_config():
    from backend.app.services import rag_service
    assert "pipeline_config(" in inspect.getsource(rag_service._build)


def test_hosted_evaluation_needs_a_hugging_face_token(monkeypatch):
    monkeypatch.setattr(settings, "HF_TOKEN", "")
    with pytest.raises(SystemExit) as e:
        evaluation.build_embedder(neural=False, hosted=True)
    assert "HF_TOKEN" in str(e.value)


def test_hosted_evaluation_uses_the_hosted_embedder_without_touching_the_network(monkeypatch):
    monkeypatch.setattr(settings, "HF_TOKEN", "hf_test_token")
    emb = evaluation.build_embedder(neural=False, hosted=True)
    assert "(hosted)" in emb.name


def test_hosted_runs_use_a_lexical_reranker_and_their_own_output_files():
    assert evaluation.reranker_for(neural=True, hosted=True).name == "lexical-fallback"
    for module, flag_default in ((evaluation, "results.json"), (redteam_eval, "redteam.md"), (gen_eval, "generation.json")):
        args = module.make_parser().parse_args(["--hosted"])
        assert args.hosted is True
        assert "hosted" in module.output_path(args).name and flag_default.split(".")[0] in module.output_path(args).name
        assert "hosted" not in module.output_path(module.make_parser().parse_args([])).name
