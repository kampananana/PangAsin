"""
Smoke tests. Run:  python test_forecasting_smoke.py      (or: pytest)
They need only numpy, pandas, scikit-learn (statsmodels is used if installed).
"""
import math

import numpy as np
import pandas as pd

try:
    from app.services.forecasting import model as fm, service
except ImportError:          # running from inside the folder
    import model as fm
    import service

SHARES = np.array([0.0025, 0.0063, 0.0549, 0.3834, 0.2925, 0.1461, 0.0407, 0.0096, 0.0169, 0.0195, 0.0236, 0.0312])
SHARES = SHARES / SHARES.sum()


def make_df(totals, years=(2024, 2025), seed=0):
    rng = np.random.default_rng(seed)
    rows = []
    for muni, yearly in totals.items():
        for y, total in zip(years, yearly):
            s = SHARES * (1 + rng.uniform(-0.15, 0.15, 12))
            s = s / s.sum()
            rows += [{"municipality": muni, "year": y, "month": m + 1, "kg": total * s[m]} for m in range(12)]
    return pd.DataFrame(rows)


TOTALS = {"Alpha": (450_000, 1_100_000), "Beta": (120_000, 1_300_000), "Gamma": (100_000, 106_000)}


def test_all_municipalities_and_province():
    out = fm.forecast_all(fm.to_series_dict(make_df(TOTALS)), horizon=12, n_sims=300)
    assert all(r["status"] == "ok" for r in out["municipalities"]), out["municipalities"]
    for r in out["municipalities"]:
        fc = r["forecast"]
        assert len(fc) == 12 and fc.index[0] == pd.Timestamp("2026-01-01")
        assert (fc >= 0).all().all()
        assert (fc["lower_kg"] <= fc["predicted_kg"]).all() and (fc["predicted_kg"] <= fc["upper_kg"]).all()
    prov = out["province"]
    expected = sum(r["forecast"]["predicted_kg"].to_numpy() for r in out["municipalities"])
    assert np.allclose(prov["forecast"]["predicted_kg"].to_numpy(), expected) and prov["complete"]


def test_short_series_fails_cleanly_and_others_still_run():
    df = pd.concat([make_df({"Alpha": (450_000, 1_100_000)}), make_df({"Short": (1, 2)}, years=(2025, 2025)).iloc[:12]])
    out = fm.forecast_all(fm.to_series_dict(df), horizon=6, n_sims=200)
    status = {r["municipality"]: r for r in out["municipalities"]}
    assert status["Alpha"]["status"] == "ok"
    assert status["Short"]["status"] == "error" and "at least" in status["Short"]["error"]
    assert out["province"]["excluded"] == ["Short"]


def test_evaluation_is_a_true_holdout():
    # The old logic fitted every model on ALL months and then scored forecasts of the months AFTER
    # the data against the LAST months. A correct hold-out fits only on the months before the test window.
    fitted_on = []

    class Spy:
        def __init__(self, y_log):
            fitted_on.append(len(y_log))
            self.last_vals = np.asarray(y_log.iloc[-12:])

        def point(self, h):
            return self.last_vals[:h]

    y = pd.Series(np.tile(SHARES * 1_000_000, 3), index=pd.date_range("2023-01-01", periods=36, freq="MS"))
    real = fm._builders
    fm._builders = lambda y_log, scope_date: {"spy": (lambda: Spy(y_log))}
    try:
        fm.evaluate_models(y, None, horizon=3, origins=1)
        assert fitted_on == [33], fitted_on                 # 36 months - 3 held out
        fitted_on.clear()
        fm.evaluate_models(y, None, horizon=3, origins=3)
        assert fitted_on == [31, 32, 33], fitted_on          # rolling: each fit sees only earlier months
    finally:
        fm._builders = real


def test_unstable_model_is_excluded_not_ranked():
    class Explodes:
        def point(self, h):
            return np.full(h, 1e30)

    y = pd.Series(np.tile(SHARES * 1_000_000, 2), index=pd.date_range("2024-01-01", periods=24, freq="MS"))
    real = fm._builders

    def patched(y_log, scope_date):
        b = real(y_log, scope_date)
        b["exploder"] = lambda: Explodes()
        return b

    fm._builders = patched
    try:
        metrics, failures = fm.evaluate_models(y, None)
    finally:
        fm._builders = real
    assert "exploder" in failures and all(m["model"] != "exploder" for m in metrics)


# ---- service layer, with stand-ins for Flask-SQLAlchemy ---------------------------------
class _Q:
    def __init__(self, rows): self.rows = rows
    def filter_by(self, **kw): return _Q([r for r in self.rows if all(getattr(r, k) == v for k, v in kw.items())])
    def all(self): return list(self.rows)


class FakeRun:
    store = []
    def __init__(self, **kw):
        self.__dict__.update(kw); self.points = []
    class _QueryProp:
        def __get__(self, obj, cls): return _Q(cls.store)
    query = _QueryProp()


class FakePoint:
    def __init__(self, **kw): self.__dict__.update(kw)


class FakeSession:
    def __init__(self): self.commits = 0; self.rollbacks = 0
    def add(self, run): FakeRun.store.append(run)
    def delete(self, run): FakeRun.store.remove(run)
    def commit(self): self.commits += 1
    def rollback(self): self.rollbacks += 1


class FakeDB:
    session = FakeSession()


def test_service_saves_valid_rows_and_replaces_old_runs():
    ids = {"Alpha": 1, "Beta": 2, "Gamma": 3}
    df = make_df(TOTALS)
    FakeRun.store = []
    s1 = service.run_and_store(FakeDB, FakeRun, FakePoint, df, ids, horizon=12, n_sims=200, note="test")
    assert not s1["failed"], s1
    assert len(FakeRun.store) == 4                       # 3 municipalities + province
    s2 = service.run_and_store(FakeDB, FakeRun, FakePoint, df, ids, horizon=12, n_sims=200, note="test")
    assert len(FakeRun.store) == 4                       # replaced, not duplicated
    for run in FakeRun.store:
        assert len(run.points) == 24 and sum(p.is_forecast for p in run.points) == 12
        assert run.projected_total >= 0
        assert run.expected_change_pct is None or -100 <= run.expected_change_pct <= 9999.99
        for col in ("mae", "rmse", "mape", "r2", "projected_total"):
            v = getattr(run, col)
            assert v is None or math.isfinite(v)
        assert run.period_start.isoformat() == "2026-01-01" and run.period_end.isoformat() == "2026-12-31"
    prov = [r for r in FakeRun.store if r.municipality_id is None]
    assert len(prov) == 1


def test_unknown_municipality_is_reported_not_crashed():
    FakeRun.store = []
    s = service.run_and_store(FakeDB, FakeRun, FakePoint, make_df(TOTALS), {"Alpha": 1}, horizon=6, n_sims=200)
    assert ("Beta", "municipality not found in the database") in s["failed"]
    assert "Alpha" in s["saved"]


if __name__ == "__main__":
    print("statsmodels:", fm.HAS_STATSMODELS, "| scikit-learn:", fm.HAS_SKLEARN)
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok  ", name)
