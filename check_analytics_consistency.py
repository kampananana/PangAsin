"""Consistency verification for PangAsin admin analytics endpoints.
Compares API values with direct SQL and checks internal consistency.
"""
from app import create_app

app = create_app()
client = app.test_client()
with client.session_transaction() as sess:
    sess['_user_id'] = '1'
    sess['_user_type'] = 'User'
    sess['_id'] = 'test'

failures = []
passes = []

def check(name, ok, detail=""):
    status = "PASS" if ok else "FAIL"
    print(f"[{status}] {name}" + (f"  -- {detail}" if detail else ""))
    if ok:
        passes.append(name)
    else:
        failures.append(name)

with app.app_context():
    from app.extensions import db
    from app.models.municipality import Municipality
    from app.models.production_record import ProductionRecord
    from app.models.forecast import ForecastRun, ForecastPoint
    from sqlalchemy import func

    # ---- 1) Forecast totals agree (headline vs series vs municipalities) ----
    r = client.get('/api/admin/analytics/predictive')
    data = r.get_json()
    prod = data.get('production', {})
    forecast_mt = prod.get('forecast_mt')
    series = data.get('series', [])
    series_forecast = [e for e in series if e.get('is_forecast')]
    series_sum = sum(e.get('predicted_value') or 0 for e in series_forecast)
    by_muni = data.get('by_municipality', [])
    muni_sum = sum(m.get('forecast_mt') or 0 for m in by_muni)

    check("Headline forecast_mt == sum of forecast series points",
          abs(forecast_mt - series_sum) < 0.5,
          f"headline={forecast_mt}, series_sum={series_sum}")
    check("Headline forecast_mt == sum of municipality forecast_mt",
          abs(forecast_mt - muni_sum) < 0.5,
          f"headline={forecast_mt}, muni_sum={muni_sum}")

    # Direct SQL cross-check for all-municipalities forecast total
    run = ForecastRun.query.filter_by(municipality_id=None).order_by(ForecastRun.created_at.desc()).first()
    if run:
        sql_sum = sum(float(p.predicted_value or 0) for p in run.points if p.is_forecast)
        check("Headline forecast_mt == direct SQL sum of forecast points",
              abs(forecast_mt - sql_sum) < 0.001,
              f"headline={forecast_mt}, sql_sum={sql_sum}")
        check("Forecast total == sum of municipality forecasts (per-run points)",
              abs(sql_sum - muni_sum) < 0.5,
              f"sql_sum={sql_sum}, muni_sum={muni_sum}")

    # ---- 2) No NaN/negative/infinite values reach the UI ----
    def clean_numbers(obj, path=""):
        problems = []
        if isinstance(obj, dict):
            for k, v in obj.items():
                problems += clean_numbers(v, f"{path}.{k}")
        elif isinstance(obj, list):
            for i, v in enumerate(obj):
                problems += clean_numbers(v, f"{path}[{i}]")
        elif isinstance(obj, float):
            import math
            if math.isnan(obj) or math.isinf(obj):
                problems.append(f"{path}={obj}")
            elif obj < 0 and path.endswith(('forecast_mt','total_projected','total_target','recorded_to_date_mt','period_demand_mt','demand_shortfall_mt','range_low_mt','range_high_mt','monthly_targets','monthly_forecasts','annual_target')):
                # negative allowed for variance/demand_shortfall only
                if not path.endswith(('variance','demand_shortfall_mt')):
                    problems.append(f"{path}={obj} negative")
        return problems

    probs = clean_numbers(data)
    check("No NaN/Inf/negative forecast/demand values in API response",
          len(probs) == 0,
          f"{len(probs)} problems: {probs[:5]}")

    # ---- 3) Direction consistency: forecast_mt vs expected_change_pct sign ----
    exp_change = prod.get('expected_change_pct')  # not in production dict; check run
    run_forecast_mt = forecast_mt
    # expected_change_pct is on the run, not in predictive production dict.
    # Use municipality-outlook expected_change_pct vs trend_direction consistency.
    r2 = client.get('/api/admin/forecast/municipality-outlook')
    out = r2.get_json()
    dir_mismatch = 0
    for o in out.get('municipalities', []):
        ec = o.get('expected_change_pct')
        td = o.get('trend_direction')
        if ec is not None:
            expected_td = 'increasing' if ec > 2 else ('declining' if ec < -2 else 'stable')
            if td != expected_td:
                dir_mismatch += 1
                print(f"  DIR MISMATCH: {o['municipality_name']} ec={ec} trend={td} expected={expected_td}")
    check("Direction consistent with expected_change_pct across all municipalities",
          dir_mismatch == 0,
          f"{dir_mismatch} mismatches")

    # ---- 4) No negative forecast values ----
    neg_forecast = [e for e in series_forecast if (e.get('predicted_value') or 0) < 0]
    check("No negative forecast values in series", len(neg_forecast) == 0,
          f"{len(neg_forecast)} negative forecasts")

    # ---- 5) evaluate-target horizon > points -> shortfall_months > 0 ----
    r3 = client.post('/api/admin/forecast/evaluate-target', json={
        'municipality_id': None, 'annual_target': 10000, 'forecast_horizon': 36, 'split_method': 'equal'
    })
    ev = r3.get_json().get('evaluation', {})
    check("evaluate-target horizon(12) > points -> shortfall_months > 0",
          ev.get('shortfall_months', 0) > 0 and len(ev.get('monthly_forecasts', [])) == 12,
          f"shortfall_months={ev.get('shortfall_months')}, points={len(ev.get('monthly_forecasts', []))}")

print(f"\n{'='*60}")
print(f"PASSED: {len(passes)}  FAILED: {len(failures)}")
for f in failures:
    print(f"  FAIL: {f}")
