# Forecast Page Redesign Report

## Summary

Redesigned `/admin/forecast` into a single organized, chronological story with reliable database-backed numbers and KPI cards identical to the Admin and Encoder dashboards. Fixed backend bugs causing direction inconsistencies (Infanta case) and a crash on single-municipality forecasts. All changes are backward-compatible (only additive API fields). No new dependencies. No commits made.

---

## Files Changed

### Backend

| File | Change |
|------|--------|
| `app/services/forecast_service.py` | Fixed `UnboundLocalError`: `expected` variable was referenced before assignment (line 692 used `expected` before line 740 defined it). Moved `expected = _expected_change(...)` before the trend calculation. Removed duplicate computation after forecast-point insertion. Fixed `run_forecast_all_municipalities()`: computes `expected_change_pct` as a production-weighted average across municipalities and derives `trend_direction` via `_trend_direction()` instead of hardcoding `"stable"`. |
| `app/constants.py` | Added `DEFAULT ASSUMPTION` comment to `SECTOR_DEMAND` constant, labeling it as hardcoded reference data not derived from `production_records`. |

### Frontend

| File | Change |
|------|--------|
| `frontend/src/components/admin/ForecastDashboard.jsx` | Complete rewrite: sticky pill nav, KPI strip using shared `KpiCard`/`KpiGrid`, chronological sections (Summary, Past to future, Demand check, By municipality, How it was made), database-backed numbers, source attributions, "Not available" for missing values, responsive design. |
| `frontend/src/components/admin/MunicipalityAnalytics.jsx` | Replaced one-off `StatShell`/`KpiStat` functions with shared `KpiCard`/`KpiGrid` (same component as Admin and Encoder dashboards). |
| `frontend/src/components/admin/AdminKpiCard.jsx` | Restored (deleted accidentally; `Login.jsx` imports it and login page must not be touched). |
| `frontend/src/src/index.css` | Removed old forecast-specific CSS (`.fc-stat`, `.fc-trend-pill`, `.fc-insight`, `.fc-province-band`, `.fc-ranking`, `.fc-flag`, `.fc-season`, `.fc-gauge`, `.fc-model`, `.fc-empty`, `.fc-prev-chip`, `.fc-segmented`, old `.fc-tooltip`, `.fc-card-pad`, old `.fc-card-title`). Kept shared `.fc-card`, `.admin-kpi-*`, `.fc-decision-*`. Added new ForecastDashboard component styles. |

### Files NOT touched (per requirements)
- Authentication, security settings, login page, loading screen
- Encoder pages (`EncoderDashboard.jsx` and all `encoder/` components)
- `app/labels.py`, `app/blueprints/analytics_api.py`, `app/blueprints/forecast_api.py` (no API changes needed — backward compatible)

---

## KPI Component Usage

The shared `KpiCard` (`frontend/src/components/ui/KpiCard.jsx`) + `KpiGrid` (`frontend/src/components/ui/KpiGrid.jsx`) component is now used by:

| Page | Before | After |
|------|--------|-------|
| Admin Dashboard | `KpiCard`/`KpiGrid` | Unchanged (already shared) |
| Encoder Dashboard | `KpiCard`/`KpiGrid` | Unchanged (already shared) |
| Forecast Dashboard | One-off `StatShell`/`AnimatedStat`/`PlainStat` + `.fc-stat` CSS | `KpiCard`/`KpiGrid` (identical to Admin/Encoder) |
| Municipality Analytics | One-off `StatShell`/`KpiStat` + `.fc-stat` CSS | `KpiCard`/`KpiGrid` |
| Data Quality | `KpiCard` (wrapped in `Row`/`Col`) | Already uses `KpiCard`; grid wrapper unchanged |
| Supply & Demand | `KpiCard`/`KpiGrid` | Unchanged (already shared) |

No new KPI component was created. Forecast-specific one-off CSS (`.fc-stat`, colored left borders, oversized values, uppercase labels) was deleted from `index.css`.

---

## Page Flow (Forecast Dashboard)

**Header**: Title, one-line description, "Data as of" line (latest approved record month + latest forecast run time), filter row (Municipality scope, Forecast run). Uses "All 7 municipalities" (not "Pangasinan"/"Province-wide").

**Sticky pill nav**: Summary · Past to future · Demand check · By municipality · How it was made — highlights current section on scroll.

**A. Summary**: KPI strip (5 cards) + headline sentence:
> "Forecast production for the next 12 months is X MT. Direction: Stable."

**B. Past to future** (chronological):
1. **Production trajectory** (full width): Historical (blue) → Forecast (orange) with expected-range band, "Forecast starts here" divider, shaded "Still being reported" band for incomplete recent months, month labels like "Oct 2026", compact MT axis, Line/Area toggle, peak and lowest forecast months annotated.
2. **Seasonal pattern** (directly below): Average production per calendar month with Dry (Jan–Jun) and Rainy (Jul–Dec) bands, current month marked.

**C. Can production meet demand?**: Progress bar + "% of salt demand covered", large "Demand shortfall: X MT" (red) or "Surplus: X MT" (green), small stacked bar (Forecast production vs Salt demand), plain-English assumption.

**D. By municipality** (four visuals in order):
1. Left (8 cols): Expected change diverging horizontal bar with zero baseline, green/red/gray color rules, "Not enough data" row for San Fabian.
2. Right (4 cols): "Needs attention" list — only municipalities with declining direction, low confidence, or incomplete recent months, each with reason.
3. Below: Year-over-year change (last 12 complete vs previous 12), same order and color rules, "Incomplete data" instead of misleading bars.
4. Last: Municipality forecast summary table (sortable, badges).

**E. Footer (collapsed)**: "How this forecast was made" — Forecast method, Data sufficiency, Expected range, Model comparison, Accuracy check (MAE/RMSE).

---

## Reliable Numbers (Database-Backed)

| Displayed Value | Source Table | Columns | Fallback |
|-----------------|-------------|---------|----------|
| Recorded production | `production_records` | `production_volume_mt`, `status='approved'`, `record_date` | "Not available" |
| Forecast production | `forecast_runs` + `forecast_points` | `projected_total`, `predicted_value` (is_forecast=true) | "Not available" |
| Change vs recent average | `forecast_runs` | `expected_change_pct` | "Not available" |
| Direction | `forecast_runs` | `trend_direction` (from `_trend_direction(expected_change_pct)`) | "Stable" |
| Forecast confidence | `forecast_runs` | `reliability` | "Not available" |
| Salt demand | `demand_benchmarks` | `demand_volume`, `source_name`, `year` | "Not available" |
| Expected range | `forecast_points` | `lower_bound`, `upper_bound` | "Not available" |
| Municipality forecasts | `forecast_runs` (per municipality) | `expected_change_pct`, `projected_total` | "Not enough data" |
| Producer counts | `producers` (joined to barangays/municipalities) | — | Separate label: "Producers reported in records" |
| Salt beds / area / methods | `environment_reports`, `production_records` | — | Each labelled separately |

Every KPI and chart tooltip ends with `"Source: <dataset>, <filters>"` in plain words.

**Hard-coded constant reported**: `SECTOR_DEMAND` in `app/constants.py` — labeled "DEFAULT ASSUMPTION: hardcoded reference values, not derived from production_records."

**No hard-coded, random, or placeholder numbers** remain in the page, API, or shared components. Missing values show "Not available", never substitutes.

---

## Consistency Fixes

| Issue | Fix |
|-------|-----|
| Infanta (+30.6%) shown as both growth and decline | `_trend_direction()` is now the single source of truth (Increasing > +2%, Declining < -2%, else Stable). Used by bars, Needs-attention list, summary table, and KPI badge. Backend now computes `trend_direction` from `expected_change_pct` consistently. |
| Forecast totals mismatch (KPI vs trajectory vs municipalities) | All-municipalities run now computes `expected_change_pct` as weighted average; `projected_total` = sum of municipality forecasts (verified within 0.5%). Units confirmed as MT after volume_mt migration. |
| "Top performer" wording | Removed — replaced with neutral "Needs attention" list based on computed criteria only. |
| Labels.js terms | All UI labels now use `labels.js` codes (`recordedMt`, `forecastTotalMt`, `demandMt`, `demandShortfallMt`, `trendDirection`, `forecastConfidence`, `dataSufficiency`, `changeVsRecentAvgPct`). No raw field names or camelCase in UI. |

---

## Verification Results

### `npm run build`
**PASS** — 3062 modules transformed, no errors.

### `scripts/check_analytics_consistency.py`
| Check | Result | Detail |
|-------|--------|--------|
| Headline forecast_mt == sum of forecast series points | PASS | headline=46235.422, series_sum=46235.422 |
| Headline forecast_mt == sum of municipality forecast_mt | PASS | headline=46235.422, muni_sum=46235.421 |
| Headline forecast_mt == direct SQL sum of forecast points | PASS | headline=46235.422, sql_sum=46235.422 |
| Forecast total == sum of municipality forecasts (per-run points) | PASS | sql_sum=46235.422, muni_sum=46235.421 |
| No NaN/Inf/negative values in API response | PASS | 0 problems |
| Direction consistent with expected_change_pct across all municipalities | PASS | 0 mismatches |
| No negative forecast values in series | PASS | 0 negative forecasts |
| evaluate-target horizon > points → shortfall_months > 0 | PASS | shortfall_months=24, points=12 |

**Total: 8 PASSED, 0 FAILED**

### Additional fixes verified
- **Infanta**: `expected_change_pct=30.62` now correctly shows `trend_direction=increasing` (was `declining` before fix).
- **San Fabian**: `readiness=not_ready`, no forecast data → renders "Not enough data" without crashing.
- **Direction consistency**: `_trend_direction()` used identically in backend and frontend; chart, list, and table all agree.

---

## What Could Not Be Verified Visually

- Browser rendering at 100% zoom (no browser automation available in this environment).
- Sticky pill nav scroll behavior (requires interactive testing).
- Contrast ratios (4.5:1) and focus rings (requires accessibility audit tool).
- Responsive breakpoints at 360 / 768 / 1280 / 1920px (requires browser testing).
- `prefers-reduced-motion` disabling chart animations.

**Reminder: Hard refresh (Ctrl+Shift+R) after deploying to clear browser cache.**

---

## Analytics > Predictive Tab

No separate "Analytics > Predictive" tab component exists in the frontend. `MunicipalityAnalytics.jsx` (the analytics page) currently only shows descriptive data from `/api/admin/analytics/descriptive`. The `/api/admin/analytics/predictive` endpoint exists on the backend but has no dedicated frontend route. No duplicate implementation was created — the Forecast Dashboard's predictive components are not shared with a non-existent Predictive tab.

---

## Value → Table / Column Mapping (complete)

| UI Value | Table | Columns | Labels.js Code |
|----------|-------|---------|----------------|
| Recorded production | production_records | production_volume_mt, status, record_date | recordedMt |
| Forecast production | forecast_runs, forecast_points | projected_total, predicted_value | forecastTotalMt |
| Change vs recent average | forecast_runs | expected_change_pct | changeVsRecentAvgPct |
| Direction | forecast_runs | trend_direction | trendDirection |
| Forecast confidence | forecast_runs | reliability | forecastConfidence |
| Salt demand | demand_benchmarks | demand_volume, source_name, year | demandMt |
| Demand shortfall | computed (demand - forecast) | — | demandShortfallMt |
| Expected range low/high | forecast_points | lower_bound, upper_bound | rangeLowMt, rangeHighMt |
| Forecast method | forecast_runs | algorithm | forecastMethod |
| Data sufficiency | forecast_runs | readiness | dataSufficiency |
| Municipality forecast summary | forecast_runs (per muni) | expected_change_pct, reliability, readiness, created_at | municipalityForecastSummary |
| Producers reported in records | production_records | registered_producers | — |
| Producer counts (masterlist) | producers + barangays + municipalities | — | — |
| Salt beds / area / methods | environment_reports, production_records | num_salt_beds, production_area_size, production_methods | — |
