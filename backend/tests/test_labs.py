"""SQL and Python lab execution, validation and sandbox guarantees."""
import pytest

from app import content, python_lab, sql_lab


@pytest.mark.parametrize("ex", content.sql_exercises(), ids=lambda e: e["id"])
def test_sql_reference_solution_is_valid(ex):
    res = sql_lab.validate(ex["solution"], ex["solution"], ordered=ex.get("ordered", False), setup_sql=ex.get("setup"))
    assert res["passed"], res


def test_sql_wrong_answer_is_rejected():
    ex = content.sql_exercises()[0]
    res = sql_lab.validate("SELECT 1 AS nothing", ex["solution"], ordered=ex.get("ordered", False), setup_sql=ex.get("setup"))
    assert res["passed"] is False


def test_sql_error_is_reported_without_crashing():
    res = sql_lab.run_query("SELEC nonsense")
    assert "error" in res


def test_sql_can_create_modify_and_reset():
    sql_lab.reset()
    assert "error" not in sql_lab.run_query("CREATE TABLE scratch_t(a INT)")
    assert "error" not in sql_lab.run_query("INSERT INTO scratch_t VALUES (1), (2)")
    assert sql_lab.run_query("SELECT count(*) AS n FROM scratch_t")["rows"] == [[2]]
    sql_lab.reset()
    assert "error" in sql_lab.run_query("SELECT * FROM scratch_t")


def test_sql_schema_lists_sample_tables():
    names = {t["table"] for t in sql_lab.list_schema()}
    assert {"customers", "orders"} <= names


@pytest.mark.parametrize("ex", content.python_exercises(), ids=lambda e: e["id"])
def test_python_solution_passes_and_starter_fails(ex):
    good = python_lab.run_python(ex["solution"], tests=ex["tests"])
    assert good["passed"], good
    bad = python_lab.run_python(ex["starter"], tests=ex["tests"])
    assert not bad["passed"]


def test_python_run_captures_output_and_traceback():
    ok = python_lab.run_python("print('hello')")
    assert ok["stdout"].strip() == "hello"
    err = python_lab.run_python("1/0")
    assert "ZeroDivisionError" in err["stderr"]


def test_python_timeout_is_enforced():
    res = python_lab.run_python("while True:\n    pass", timeout=2)
    assert res["timed_out"] is True


def test_python_network_is_blocked():
    code = "import socket\ns = socket.socket()\ns.connect(('127.0.0.1', 8765))"
    res = python_lab.run_python(code)
    assert res["stderr"], res


def test_python_empty_and_oversized_code_rejected():
    assert "error" in python_lab.run_python("   ")
    assert "error" in python_lab.run_python("x=1\n" * 50_000)
