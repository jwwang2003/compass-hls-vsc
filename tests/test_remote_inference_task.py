import importlib
import sys
import types
from pathlib import Path

import yaml


HGBO_DSE = Path(__file__).resolve().parents[1] / "3rdParty" / "HGBO-DSE"
sys.path.insert(0, str(HGBO_DSE))


class FakeTask:
    pass


class FakeCelery:
    instances = []

    def __init__(self, name, broker=None, backend=None, include=None):
        self.name = name
        self.broker = broker
        self.backend = backend
        self.include = include
        self.Task = None
        self.tasks = {}
        FakeCelery.instances.append(self)

    def task(self, *args, **kwargs):
        def decorator(func):
            self.tasks[func.__name__] = {"func": func, "args": args, "kwargs": kwargs}
            return func

        if args and callable(args[0]) and len(args) == 1 and not kwargs:
            return decorator(args[0])
        return decorator


def install_fake_celery(monkeypatch):
    FakeCelery.instances = []
    celery_module = types.ModuleType("celery")
    celery_module.Celery = FakeCelery
    celery_module.Task = FakeTask
    monkeypatch.setitem(sys.modules, "celery", celery_module)


def unload_remote_inference_modules():
    for module_name in ("backend.tasks", "backend.celery_app", "helpers.celery_app"):
        sys.modules.pop(module_name, None)


def normalize_environment(service):
    environment = service.get("environment") or {}
    if isinstance(environment, list):
        return dict(item.split("=", 1) for item in environment)
    return environment


def test_backend_celery_app_uses_env_urls(monkeypatch):
    install_fake_celery(monkeypatch)
    unload_remote_inference_modules()
    monkeypatch.setenv("CELERY_BROKER_URL", "redis://broker:6379/2")
    monkeypatch.setenv("CELERY_RESULT_BACKEND", "redis://backend:6379/3")

    celery_app = importlib.import_module("backend.celery_app")

    assert celery_app.app.broker == "redis://broker:6379/2"
    assert celery_app.app.backend == "redis://backend:6379/3"


def test_backend_celery_app_defaults_to_local_redis(monkeypatch):
    install_fake_celery(monkeypatch)
    unload_remote_inference_modules()
    monkeypatch.delenv("CELERY_BROKER_URL", raising=False)
    monkeypatch.delenv("CELERY_RESULT_BACKEND", raising=False)

    celery_app = importlib.import_module("backend.celery_app")

    assert celery_app.app.broker == "redis://localhost:6379/0"
    assert celery_app.app.backend == "redis://localhost:6379/0"


def test_remote_inference_task_returns_gnn_prediction(monkeypatch):
    install_fake_celery(monkeypatch)
    unload_remote_inference_modules()
    calls = []

    fake_hgp_pred = types.ModuleType("bome.hgp_pred")

    def fake_get_gnn_pred(prj_path, hls_attr, case):
        calls.append((prj_path, hls_attr, case))
        return {"LUT": 12, "FF": 34}

    fake_hgp_pred.getGNNPred = fake_get_gnn_pred
    monkeypatch.setitem(sys.modules, "bome.hgp_pred", fake_hgp_pred)

    tasks = importlib.import_module("backend.tasks")

    result = tasks.run_remote_inference("/tmp/prj", [1, 2, 3], "bfs")

    assert result == {"LUT": 12, "FF": 34}
    assert calls == [("/tmp/prj", [1, 2, 3], "bfs")]


def test_docker_compose_targets_mcp_server():
    compose_source = (HGBO_DSE / "docker-compose.yaml").read_text()
    compose = yaml.safe_load(compose_source)
    services = compose["services"]

    assert set(services) == {"mcp-inference"}
    assert services["mcp-inference"]["command"] == "uv run python -m backend.mcp_server"
    assert services["mcp-inference"]["volumes"] == ["hgbo_mcp_data:/var/lib/hgbo-mcp"]
    assert normalize_environment(services["mcp-inference"])["HGBO_MCP_SECRET_DIR"] == "/var/lib/hgbo-mcp"
    assert "celery -A" not in compose_source
    assert "redis://redis:6379/0" not in compose_source
