# WHAT: Read-only admin analytics endpoints (descriptive + predictive).
# WHY: Central place for all analytics queries; approved records only. Each
#      endpoint has a docstring stating what it measures and its unit. Old
#      fields are kept as aliases with a "# DEPRECATED alias" comment; only
#      new fields are added, so responses stay backward compatible.
from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from app.extensions import db
from app.models.production_record import ProductionRecord
from app.models.forecast import ForecastRun, ForecastPoint
from app.models.municipality import Municipality
from app.models.demand_benchmark import DemandBenchmark
from app.models.producer import Producer
from app.models.producer_report import ProducerReportEntry
from app.services.forecast_service import (
    run_forecast,
    run_forecast_all_municipalities,
    get_municipality_outlook,
)
from app.services.aggregates import (
    _monthly_aggregates,
    _reindex_complete,
    _last_month_with_data,
    _reporting_grid,
)
from app.utils import _admin_only, _parse_date
from datetime import date, timedelta
from sqlalchemy import func, extract

analytics_api_bp = Blueprint("analytics_api", __name__, url_prefix="/api/admin/analytics")

MONTH_NAMES = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

# A year is "complete" when at least 10 months have approved records.
_COMPLETE_YEAR_MONTHS = 10


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _add_months(source_date, months):
    """Add `months` to a date and return the last day of the resulting month."""
    month = source_date.month - 1 + months
    year = source_date.year + month // 12
    month = month % 12 + 1
    # Last day of the resulting month
    if month == 12:
        return date(year + 1, 1, 1) - timedelta(days=1)
    return date(year, month + 1, 1) - timedelta(days=1)


def _query_records(municipality_id, start=None, end=None):
    q = ProductionRecord.query.filter(ProductionRecord.status == "approved")
    if municipality_id is not None:
        q = q.filter(ProductionRecord.municipality_id == municipality_id)
    if start is not None:
        q = q.filter(ProductionRecord.record_date >= start)
    if end is not None:
        q = q.filter(ProductionRecord.record_date <= end)
    return q


def _monthly_series(municipality_id, start, end):
    """List of {month, total_mt} for approved records in [start, end]."""
    labels, values, _ = _monthly_aggregates(municipality_id, start, end)
    return [
        {"month": labels[i], "total_mt": round(values[i], 3)}
        for i in range(len(labels))
    ]


def _complete_years(labels):
    """Set of years with at least _COMPLETE_YEAR_MONTHS months of data."""
    counts = {}
    for lb in labels:
        y = int(lb[:4])
        counts[y] = counts.get(y, 0) + 1
    return {y for y, c in counts.items() if c >= _COMPLETE_YEAR_MONTHS}


# ===========================================================================
# Descriptive: What our data shows
# ===========================================================================

@analytics_api_bp.route("/descriptive", methods=["GET"])
@login_required
def descriptive():
    """Descriptive analytics for approved production records.

    Measures (units): total_recorded_mt (MT), this_year_mt / last_year_mt (MT),
    yoy_change_pct (%), best_month (month), municipalities_reporting (count),
    latest_record_month (month). Monthly series in MT; yearly overlay in MT;
    by_municipality recorded_mt (MT) + share_pct (%); seasonal_pattern avg_mt
    (MT); producers counts; methods share (MT); yield_per_bed_mt (MT/bed) and
    yield_per_ha_mt (MT/ha); reporting_grid (boolean per municipality/month).

    Query: municipality_id (optional, defaults to all 7 municipalities).
    """
    if _admin_only():
        return jsonify({"error": "Admin access only."}), 403

    municipality_id = request.args.get("municipality_id", type=int)

    today = date.today()
    this_year = today.year
    last_year = this_year - 1

    # Approved records overall for KPI scope.
    q_all = _query_records(municipality_id)
    total_recorded = q_all.with_entities(func.coalesce(func.sum(ProductionRecord.production_volume_mt), 0)).scalar() or 0

    # This year / last year.
    this_year_mt = (
        _query_records(municipality_id, date(this_year, 1, 1), date(this_year, 12, 31))
        .with_entities(func.coalesce(func.sum(ProductionRecord.production_volume_mt), 0)).scalar() or 0
    )
    last_year_mt = (
        _query_records(municipality_id, date(last_year, 1, 1), date(last_year, 12, 31))
        .with_entities(func.coalesce(func.sum(ProductionRecord.production_volume_mt), 0)).scalar() or 0
    )
    yoy_change_pct = None
    if last_year_mt:
        yoy_change_pct = round(((this_year_mt - last_year_mt) / last_year_mt) * 100, 1)

    # Best month (all time, by month total).
    labels, values, _ = _monthly_aggregates(municipality_id, date(2000, 1, 1), today)
    best_month = None
    if values:
        best_idx = max(range(len(values)), key=lambda i: values[i])
        best_month = labels[best_idx]

    # Municipalities reporting (have at least one approved record).
    muni_rows = (
        db.session.query(
            ProductionRecord.municipality_id,
            Municipality.name,
            func.sum(ProductionRecord.production_volume_mt).label("total_volume"),
            func.count(ProductionRecord.id).label("record_count"),
        )
        .join(Municipality, Municipality.id == ProductionRecord.municipality_id)
        .filter(ProductionRecord.status == "approved")
    )
    if municipality_id is not None:
        muni_rows = muni_rows.filter(ProductionRecord.municipality_id == municipality_id)
    muni_rows = muni_rows.group_by(ProductionRecord.municipality_id, Municipality.name).all()

    by_municipality = []
    grand_total = sum(float(r.total_volume or 0) for r in muni_rows)
    for r in muni_rows:
        mv = float(r.total_volume or 0)
        by_municipality.append({
            "id": r.municipality_id,
            "name": r.name,
            "recorded_mt": round(mv, 3),
            "share_pct": round((mv / grand_total * 100), 1) if grand_total > 0 else 0.0,
            "record_count": int(r.record_count or 0),
        })
    by_municipality.sort(key=lambda x: x["recorded_mt"], reverse=True)

    municipalities_reporting = len(by_municipality)

    # Latest record month.
    latest_row = _query_records(municipality_id).order_by(ProductionRecord.record_date.desc()).first()
    latest_record_month = None
    if latest_row:
        latest_record_month = f"{latest_row.record_date.year:04d}-{latest_row.record_date.month:02d}"

    # Monthly series (last 24 months by default; full range if small).
    series_start = date(today.year - 2, today.month, 1)
    monthly_series = _monthly_series(municipality_id, series_start, today)

    # Yearly overlay {year: [12 values]} over complete years.
    all_labels, all_values, _ = _monthly_aggregates(municipality_id, date(2000, 1, 1), today)
    complete_years = sorted(_complete_years(all_labels))
    yearly_overlay = {}
    month_totals = {m: 0.0 for m in range(1, 13)}
    month_counts = {m: 0 for m in range(1, 13)}
    for lb, v in zip(all_labels, all_values):
        y = int(lb[:4])
        m = int(lb[5:7])
        if y in complete_years:
            month_totals[m] += v
            month_counts[m] += 1
    for y in complete_years:
        yearly_overlay[str(y)] = [
            round(month_totals[m] / month_counts[m], 3) if month_counts[m] > 0 else 0.0
            for m in range(1, 13)
        ]

    # Seasonal pattern: average by calendar month over complete years.
    seasonal_pattern = []
    for m in range(1, 13):
        if month_counts[m] > 0:
            seasonal_pattern.append({
                "month": m,
                "month_name": MONTH_NAMES[m - 1],
                "avg_mt": round(month_totals[m] / month_counts[m], 3),
            })

    # Producers: by municipality, gender split, age buckets (from approved records).
    # ProductionRecord carries registered/male/female and age bucket counts per record.
    producers_by_municipality = []
    for r in muni_rows:
        muni_id = r.municipality_id
        agg = (
            _query_records(muni_id)
            .with_entities(
                func.coalesce(func.sum(ProductionRecord.registered_producers), 0).label("registered"),
                func.coalesce(func.sum(ProductionRecord.male_producers), 0).label("male"),
                func.coalesce(func.sum(ProductionRecord.female_producers), 0).label("female"),
                *[func.coalesce(func.sum(getattr(ProductionRecord, f)), 0).label(f) for f in [
                    "producers_18_30", "producers_31_40", "producers_41_50",
                    "producers_51_60", "producers_61_plus",
                ]],
            )
            .first()
        )
        producers_by_municipality.append({
            "municipality_id": muni_id,
            "municipality_name": r.name,
            "registered_producers": int(agg.registered or 0),
            "male_producers": int(agg.male or 0),
            "female_producers": int(agg.female or 0),
            "age_buckets": {
                "18-30": int(getattr(agg, "producers_18_30") or 0),
                "31-40": int(getattr(agg, "producers_31_40") or 0),
                "41-50": int(getattr(agg, "producers_41_50") or 0),
                "51-60": int(getattr(agg, "producers_51_60") or 0),
                "61+": int(getattr(agg, "producers_61_plus") or 0),
            },
        })

    # Methods share (MT) from production_method.
    methods_rows = (
        _query_records(municipality_id)
        .with_entities(
            ProductionRecord.production_method,
            func.coalesce(func.sum(ProductionRecord.production_volume_mt), 0).label("volume"),
        )
        .group_by(ProductionRecord.production_method)
        .all()
    )
    methods_total = sum(float(r.volume or 0) for r in methods_rows)
    methods_share = [
        {
            "method": r.production_method,
            "volume_mt": round(float(r.volume or 0), 3),
            "share_pct": round((float(r.volume or 0) / methods_total * 100), 1) if methods_total > 0 else 0.0,
        }
        for r in methods_rows
    ]
    methods_share.sort(key=lambda x: x["volume_mt"], reverse=True)

    # Yield per salt bed and per hectare by municipality (skip missing denominators).
    yield_by_municipality = []
    for r in muni_rows:
        muni_id = r.municipality_id
        agg = (
            _query_records(muni_id)
            .with_entities(
                func.coalesce(func.sum(ProductionRecord.production_volume_mt), 0).label("volume"),
                func.coalesce(func.sum(ProductionRecord.num_salt_beds), 0).label("beds"),
                func.coalesce(func.sum(ProductionRecord.num_salt_beds * ProductionRecord.area_per_salt_bed), 0).label("area_m2"),
            )
            .first()
        )
        volume = float(agg.volume or 0)
        beds = int(agg.beds or 0)
        area_m2 = float(agg.area_m2 or 0)
        yield_per_bed = round(volume / beds, 3) if beds > 0 else None
        yield_per_ha = round(volume / (area_m2 / 10000.0), 3) if area_m2 > 0 else None
        yield_by_municipality.append({
            "municipality_id": muni_id,
            "municipality_name": r.name,
            "yield_per_bed_mt": yield_per_bed,
            "yield_per_ha_mt": yield_per_ha,
            # DEPRECATED alias: kept for backward compatibility.
            "yield_per_bed": yield_per_bed,
            "area_per_salt_bed_m2": round(area_m2 / beds, 2) if beds > 0 else None,
        })

    # Reporting grid: last 36 months, which months each municipality reported.
    muni_ids_in_scope = [r.municipality_id for r in muni_rows] or ([municipality_id] if municipality_id else [])
    municipality_names = {r.municipality_id: r.name for r in muni_rows}
    grid_labels, reporting_grid = _reporting_grid(
        muni_ids_in_scope,
        municipality_names,
        range_months=36,
    )

    return jsonify({
        "scope": "all_municipalities" if municipality_id is None else municipality_id,
        "kpis": {
            "total_recorded_mt": round(float(total_recorded), 3),
            "this_year_mt": round(float(this_year_mt), 3),
            "last_year_mt": round(float(last_year_mt), 3),
            "yoy_change_pct": yoy_change_pct,
            "best_month": best_month,
            "municipalities_reporting": municipalities_reporting,
            "latest_record_month": latest_record_month,
        },
        "monthly_series": monthly_series,
        "yearly_overlay": yearly_overlay,
        "by_municipality": by_municipality,
        "seasonal_pattern": seasonal_pattern,
        "producers": producers_by_municipality,
        "methods_share": methods_share,
        "yield_by_municipality": yield_by_municipality,
        "reporting_grid": reporting_grid,
    })


# ===========================================================================
# Predictive: What to expect
# ===========================================================================

def _demand_benchmark(municipality_id=None):
    """Latest provincial demand benchmark. Returns dict or None."""
    prov = (
        DemandBenchmark.query.filter_by(geographic_scope="provincial")
        .order_by(DemandBenchmark.year.desc())
        .first()
    )
    if not prov:
        return None
    return {
        "benchmark_year": prov.year,
        "annual_demand_mt": float(prov.demand_volume),
        "local_production_mt": float(prov.local_production) if prov.local_production is not None else None,
        "import_volume_mt": float(prov.import_volume) if prov.import_volume is not None else None,
        "source_name": prov.source_name,
    }


def _period_demand(annual_demand_mt, months, growth_pct, years_ahead):
    """period_demand_mt = annual * months/12 * (1+growth)^years_ahead."""
    if not annual_demand_mt:
        return None
    factor = (1 + growth_pct / 100.0) ** years_ahead
    return round(annual_demand_mt * (months / 12.0) * factor, 3)


@analytics_api_bp.route("/predictive", methods=["GET"])
@login_required
def predictive():
    """Predictive analytics: forecast production vs salt demand for a period.

    Measures: forecast_mt / range_low_mt / range_high_mt (MT),
    recorded_to_date_mt (MT), demand_shortfall_mt (MT), covered_pct (%),
    recorded_coverage_pct (%), recorded_share_of_local_pct (%),
    import_share_pct (%), data_sufficiency, forecast_confidence, forecast_method,
    partial_reporting_tail, backtest, model_comparison.

    Query: municipality_id, range (this_month|next_3|rest_of_year|next_12|custom),
    start, end, growth_pct (default 0).
    """
    if _admin_only():
        return jsonify({"error": "Admin access only."}), 403

    municipality_id = request.args.get("municipality_id", type=int)
    range_opt = request.args.get("range") or "next_12"
    start = _parse_date(request.args.get("start")) if request.args.get("start") else None
    end = _parse_date(request.args.get("end")) if request.args.get("end") else None
    growth_pct = float(request.args.get("growth_pct") or 0)

    today = date.today()
    # Resolve the requested period.
    period = {"start": None, "end": None, "months": 0, "label": range_opt}
    last_ym = _last_month_with_data(municipality_id)
    last_data_date = None
    if last_ym:
        last_data_date = date(int(last_ym[:4]), int(last_ym[5:7]), 1)

    if range_opt == "this_month":
        period["start"] = date(today.year, today.month, 1)
        period["end"] = _add_months(period["start"], 1)
        period["months"] = 1
        period["label"] = "This month"
    elif range_opt == "next_3":
        base = last_data_date or today
        period["start"] = date(base.year, base.month, 1)
        period["end"] = _add_months(period["start"], 3)
        period["months"] = 3
        period["label"] = "Next 3 months"
    elif range_opt == "rest_of_year":
        base = last_data_date or today
        period["start"] = date(base.year, base.month, 1)
        period["end"] = date(base.year, 12, 31)
        period["months"] = 12 - base.month + 1
        period["label"] = "Rest of this year"
    elif range_opt == "custom" and start and end:
        period["start"] = start
        period["end"] = end
        period["months"] = (end.year - start.year) * 12 + (end.month - start.month) + 1
        period["label"] = "Custom period"
    else:  # next_12 default
        base = last_data_date or today
        period["start"] = date(base.year, base.month, 1)
        period["end"] = _add_months(period["start"], 12)
        period["months"] = 12
        period["label"] = "Next 12 months"

    if period["months"] < 1:
        period["months"] = 1

    # Run forecast for the scope (auto window; 12-month horizon default).
    horizon = max(period["months"], 12)
    if municipality_id is None:
        forecast_run = run_forecast_all_municipalities(horizon)
        scope_label = "All 7 municipalities"
    else:
        forecast_run = run_forecast(municipality_id, horizon)
        scope_label = "All 7 municipalities" if municipality_id is None else str(municipality_id)

    # Build series: history + forecast with bounds.
    points = sorted(forecast_run.points, key=lambda p: p.period_label) if forecast_run.points else []
    history = []
    forecast_series = []
    forecast_mt = 0.0
    range_low_mt = None
    range_high_mt = None
    recorded_to_date_mt = None

    in_period = lambda lb: (
        period["start"] is None or
        (date(int(lb[:4]), int(lb[5:7]), 1) >= period["start"] and
         date(int(lb[:4]), int(lb[5:7]), 1) <= period["end"])
    )

    for p in points:
        label = p.period_label
        entry = {
            "period_label": label,
            "predicted_value": round(float(p.predicted_value or 0), 3),
            "is_forecast": bool(p.is_forecast),
        }
        if p.lower_bound is not None:
            entry["lower_bound"] = round(float(p.lower_bound), 3)
        if p.upper_bound is not None:
            entry["upper_bound"] = round(float(p.upper_bound), 3)
        if p.is_forecast:
            forecast_series.append(entry)
            if in_period(label):
                forecast_mt += float(p.predicted_value or 0)
                if range_low_mt is None or (p.lower_bound is not None and float(p.lower_bound) < range_low_mt):
                    range_low_mt = float(p.lower_bound) if p.lower_bound is not None else range_low_mt
                if range_high_mt is None or (p.upper_bound is not None and float(p.upper_bound) > range_high_mt):
                    range_high_mt = float(p.upper_bound) if p.upper_bound is not None else range_high_mt
        else:
            if in_period(label):
                history.append(entry)
                if recorded_to_date_mt is None:
                    recorded_to_date_mt = 0.0
                recorded_to_date_mt += float(p.predicted_value or 0)

    # Demand.
    demand = _demand_benchmark(municipality_id)
    annual_demand = demand["annual_demand_mt"] if demand else None
    period_demand = _period_demand(annual_demand, period["months"], growth_pct, 0) if annual_demand else None
    demand_shortfall = None
    covered_pct = None
    if period_demand is not None:
        demand_shortfall = round(period_demand - forecast_mt, 3)
        covered_pct = round((forecast_mt / period_demand * 100), 1) if period_demand > 0 else None

    # Contribution per benchmark year.
    contribution = []
    if demand:
        bench = (
            DemandBenchmark.query.filter_by(geographic_scope="provincial")
            .order_by(DemandBenchmark.year.desc())
            .all()
        )
        for b in bench:
            recorded = (
                _query_records(municipality_id, date(b.year, 1, 1), date(b.year, 12, 31))
                .with_entities(func.coalesce(func.sum(ProductionRecord.production_volume_mt), 0)).scalar() or 0
            )
            recorded = float(recorded)
            local = float(b.local_production) if b.local_production is not None else None
            imports = float(b.import_volume) if b.import_volume is not None else None
            coverage_pct = round((recorded / float(b.demand_volume) * 100), 1) if b.demand_volume else None
            share_local = round((recorded / local * 100), 1) if local else None
            import_share = round((imports / float(b.demand_volume) * 100), 1) if (b.demand_volume and imports is not None) else None
            flagged = None
            if local is not None and recorded > local:
                flagged = "Recorded production exceeds local production benchmark for this year."
            contribution.append({
                "year": b.year,
                "recorded_mt": round(recorded, 3),
                "demand_mt": float(b.demand_volume),
                "other_local_mt": local,
                "imports_mt": imports,
                "recorded_coverage_pct": coverage_pct,
                "recorded_share_of_local_pct": share_local,
                "import_share_pct": import_share,
                # DEPRECATED alias.
                "recorded_coverage": coverage_pct,
                "flagged": flagged,
            })

    # Per-municipality forecast MT for the selected period.
    by_muni_forecast = []
    muni_list = Municipality.query.filter_by(status="active").order_by(Municipality.name).all()
    for m in muni_list:
        run_m = (
            ForecastRun.query.filter_by(municipality_id=m.id)
            .order_by(ForecastRun.created_at.desc())
            .first()
        )
        muni_fc_mt = 0.0
        if run_m and run_m.points:
            for p in run_m.points:
                if p.is_forecast and in_period(p.period_label):
                    muni_fc_mt += float(p.predicted_value or 0)
        by_muni_forecast.append({
            "municipality_id": m.id,
            "municipality_name": m.name,
            "forecast_mt": round(muni_fc_mt, 3),
        })
    by_muni_forecast.sort(key=lambda x: x["forecast_mt"], reverse=True)

    # Data sufficiency / confidence.
    readiness = forecast_run.readiness or "not_ready"
    if readiness == "ready":
        data_sufficiency = "sufficient"
        forecast_confidence = forecast_run.reliability or "moderate"
    elif readiness == "limited":
        data_sufficiency = "limited"
        forecast_confidence = "low"
    else:
        data_sufficiency = "insufficient"
        forecast_confidence = "low"

    # Assumptions (plain language).
    assumptions = [
        "Future demand is the latest demand benchmark held flat, plus an optional annual growth % (default 0%).",
        "Recorded coverage counts approved records from the 7 salt-producing municipalities only; actual production may be higher.",
        "Partial-month reporting: the current month may be under-reported because the year is still in progress.",
        f"Forecast method used: {forecast_run.algorithm or 'none'}.",
    ]
    if forecast_run.incomplete_tail:
        assumptions.append("Incomplete recent months detected; forecast is anchored to the established seasonal pattern.")

    return jsonify({
        "scope": scope_label,
        "municipality_id": municipality_id,
        "period": period,
        "growth_pct": growth_pct,
        "production": {
            "forecast_mt": round(forecast_mt, 3),
            "range_low_mt": round(range_low_mt, 3) if range_low_mt is not None else None,
            "range_high_mt": round(range_high_mt, 3) if range_high_mt is not None else None,
            "recorded_to_date_mt": round(recorded_to_date_mt, 3) if recorded_to_date_mt is not None else None,
        },
        "series": history + forecast_series,
        "by_municipality": by_muni_forecast,
        "demand": {
            "scope": "provincial",
            "benchmark_year": demand["benchmark_year"] if demand else None,
            "annual_demand_mt": annual_demand,
            "assumed_growth_pct": growth_pct,
            "period_demand_mt": period_demand,
            "demand_shortfall_mt": demand_shortfall,
            "covered_pct": covered_pct,
            # DEPRECATED aliases.
            "local_production_mt": demand["local_production_mt"] if demand else None,
            "import_volume_mt": demand["import_volume_mt"] if demand else None,
        },
        "contribution": contribution,
        "assumptions": assumptions,
        "data_sufficiency": data_sufficiency,
        "forecast_confidence": forecast_confidence,
        "forecast_method": forecast_run.algorithm or "none",
        "partial_reporting_tail": bool(forecast_run.incomplete_tail),
        "note": forecast_run.note,
        "model_comparison": forecast_run.candidate_metrics and [
            {
                "algorithm": k,
                "rmse": (v or {}).get("rmse"),
                "mae": (v or {}).get("mae"),
                "mape": (v or {}).get("mape"),
            }
            for k, v in forecast_run.candidate_metrics.items()
        ],
        "backtest": forecast_run.backtest if hasattr(forecast_run, "backtest") else None,
    })

    # --- Backend consistency assertion ---
    # The headline forecast_mt must equal the sum of forecast series points
    # in the period, and must equal the sum of by-municipality forecasts
    # (within 0.5% for floating-point rounding).
    series_fc_sum = sum(e.get("predicted_value", 0) for e in forecast_series)
    muni_fc_sum = sum(m.get("forecast_mt", 0) for m in by_muni_forecast)
    if abs(forecast_mt - series_fc_sum) > max(0.005 * abs(forecast_mt), 0.01):
        raise ValueError(
            f"Forecast total mismatch: headline={forecast_mt}, series_sum={series_fc_sum}"
        )
    if abs(forecast_mt - muni_fc_sum) > max(0.005 * abs(forecast_mt), 0.01):
        raise ValueError(
            f"Forecast total mismatch: headline={forecast_mt}, muni_sum={muni_fc_sum}"
        )

