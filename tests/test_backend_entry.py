import importlib
import threading
from unittest.mock import patch

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPBasicCredentials


ADMIN_ENV_KEYS = ("HGBO_ADMIN_USER", "HGBO_ADMIN_PASS")


def load_entry(monkeypatch, admin_user=None, admin_pass=None):
    for key in ADMIN_ENV_KEYS:
        monkeypatch.delenv(key, raising=False)
    if admin_user is not None:
        monkeypatch.setenv("HGBO_ADMIN_USER", admin_user)
    if admin_pass is not None:
        monkeypatch.setenv("HGBO_ADMIN_PASS", admin_pass)

    import backend.entry as entry

    return importlib.reload(entry)


def test_admin_credentials_fail_closed_when_unset(monkeypatch):
    entry = load_entry(monkeypatch)

    with pytest.raises(HTTPException) as exc_info:
        entry.get_admin_creds(
            HTTPBasicCredentials(username="admin", password="s3cr3t")
        )

    assert exc_info.value.status_code == 401


def test_admin_credentials_accept_values_from_environment(monkeypatch):
    entry = load_entry(monkeypatch, admin_user="ops", admin_pass="from-env")

    assert (
        entry.get_admin_creds(
            HTTPBasicCredentials(username="ops", password="from-env")
        )
        == "ops"
    )


def test_long_task_does_not_require_worker_thread_event_loop(monkeypatch):
    entry = load_entry(monkeypatch, admin_user="ops", admin_pass="from-env")
    errors = []

    def run_task():
        try:
            with patch.object(entry.time, "sleep", return_value=None):
                entry.long_task("missing-websocket", 1)
        except Exception as exc:  # pragma: no cover - assertion reports details
            errors.append(exc)

    worker = threading.Thread(target=run_task)
    worker.start()
    worker.join(timeout=2)

    assert not worker.is_alive()
    assert errors == []
