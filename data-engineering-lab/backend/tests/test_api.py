"""HTTP API: health, content, labs and persistence."""
import json


def test_health_and_content(client):
    assert client.get("/api/health").json()["status"] == "ok"
    assert len(client.get("/api/content/modules").json()) == 10
    lessons = client.get("/api/content/lessons").json()
    assert len(lessons) >= 40 and "body" not in lessons[0]
    body = client.get(f"/api/content/lessons/{lessons[0]['id']}").json()
    assert body["body"]
    assert client.get("/api/content/lessons/nope").status_code == 404
    assert len(client.get("/api/content/projects").json()) == 7
    assert len(client.get("/api/content/questions").json()) >= 300
    assert len(client.get("/api/content/mcq").json()) >= 200


def test_exercise_listing_hides_solutions(client):
    for path in ("/api/sql/exercises", "/api/python/exercises"):
        items = client.get(path).json()
        assert items and all("solution" not in e for e in items)
    assert all("tests" not in e for e in client.get("/api/python/exercises").json())


def test_sql_endpoints(client):
    ex = client.get("/api/sql/exercises").json()[0]
    sol = client.get(f"/api/sql/exercises/{ex['id']}/solution").json()["solution"]
    assert client.get(f"/api/sql/exercises/{ex['id']}/expected").json()["rows"]
    ok = client.post("/api/sql/validate", json={"exercise_id": ex["id"], "sql": sol}).json()
    assert ok["passed"] is True
    bad = client.post("/api/sql/validate", json={"exercise_id": ex["id"], "sql": "SELECT 1"}).json()
    assert bad["passed"] is False
    run = client.post("/api/sql/run", json={"sql": "SELECT 1 AS x"}).json()
    assert run["rows"] == [[1]]
    assert client.post("/api/sql/reset").json()["ok"] is True
    assert client.post("/api/sql/validate", json={"exercise_id": "missing", "sql": "SELECT 1"}).status_code == 404


def test_python_endpoints(client):
    ex = client.get("/api/python/exercises").json()[0]
    sol = client.get(f"/api/python/exercises/{ex['id']}/solution").json()["solution"]
    assert client.post("/api/python/validate", json={"exercise_id": ex["id"], "code": sol}).json()["passed"] is True
    assert client.post("/api/python/run", json={"code": "print(2+2)"}).json()["stdout"].strip() == "4"


def test_oversized_payload_rejected(client):
    assert client.post("/api/sql/run", json={"sql": "x" * 30_000}).status_code == 422


def test_state_roundtrip_and_validation(client):
    assert client.put("/api/state/progress", json={"value": {"a": 1}}).json()["ok"]
    assert client.get("/api/state/progress").json()["value"] == {"a": 1}
    assert client.get("/api/state").json()["progress"] == {"a": 1}
    assert client.put("/api/state/bad key!", json={"value": 1}).status_code in (400, 404)


def test_import_export_and_reset(client):
    payload = {"progress": {"x": 1}, "notes": {"l": "hi"}}
    assert client.post("/api/state/import", json={"data": payload}).json()["keys"] == 2
    assert client.get("/api/state").json() == payload
    assert client.post("/api/state/import", json={"data": {"bad key!": 1}}).status_code == 400
    assert client.delete("/api/state").json()["ok"] is True
    assert client.get("/api/state").json() == {}


def test_backup_and_restore(client):
    client.put("/api/state/progress", json={"value": {"n": 7}})
    name = client.post("/api/backup").json()["name"]
    client.delete("/api/state")
    assert client.get("/api/state").json() == {}
    assert name in [b["name"] for b in client.get("/api/backup").json()]
    assert client.post("/api/backup/restore", json={"name": name}).json()["ok"]
    assert client.get("/api/state/progress").json()["value"] == {"n": 7}


def test_restore_rejects_path_traversal(client):
    assert client.post("/api/backup/restore", json={"name": "../../etc/passwd"}).status_code == 422


def test_ai_disabled_by_default(client):
    assert client.get("/api/ai/status").json()["configured"] is False


def test_state_persists_across_connections(client):
    client.put("/api/state/prefs", json={"value": json.loads('{"theme":"light"}')})
    from app import db
    assert db.get_key("prefs") == {"theme": "light"}
