"""Interview question bank aggregate (>= 300 questions across 14 topics).

To extend: add `Q(...)` entries to any qb_*.py file, or import JSON through the Mock Interviews UI.
Scenario *templates* (frontend/src/lib/templates.ts) generate additional unique variants on top of this bank.
"""
from __future__ import annotations

from .qb_cloud_rest import CLOUD_REST, SCENARIO_DESIGN_TROUBLE
from .qb_etl_spark_orch import ETL_SPARK_ORCH
from .qb_extra_a import EXTRA_A
from .qb_extra_b import EXTRA_B
from .qb_fund_dw import FUND_DW
from .qb_sql_python import SQL_PY

BANK = SQL_PY + FUND_DW + ETL_SPARK_ORCH + CLOUD_REST + SCENARIO_DESIGN_TROUBLE + EXTRA_A + EXTRA_B
