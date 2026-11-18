import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(tmp_path, monkeypatch):
    """API client backed by a throw-away SQLite file and backup directory."""
    monkeypatch.setenv("DE_LAB_DB", str(tmp_path / "test.db"))
    from app import config
    monkeypatch.setattr(config, "BACKUP_DIR", tmp_path / "backups")
    from app.main import app
    return TestClient(app)
