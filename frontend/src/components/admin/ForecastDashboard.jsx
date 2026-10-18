import { useEffect, useState, useMemo } from 'react';
import { Row, Col, Card, Alert, Form } from 'react-bootstrap';
import ErrorBoundary from '../ErrorBoundary';
import {
  ComposedChart, Line, Area, Bar, BarChart, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell, ReferenceArea, ReferenceLine,
} from 'recharts';
import {
  ChartLine, CalendarDays, Target, TrendingUp, ArrowDownRight,
  Activity, ShieldCheck, Clock, Flag, List, Table as TableIcon, Zap,
} from 'lucide-react';
import {
  getMunicipalityOutlook, getAdminMunicipalities,
  getAdminSupplyDemand, getAdminTrends, getAdminMonths, getAdminPredictive,
  getForecastRuns,
} from '../../services/dataService';
import { SkeletonBlock, SkeletonCards, SkeletonChart } from '../Skeleton';
import { BRAND, STATUS } from '../../theme/colors';
import PageHeader from './PageHeader';
import KpiCard from '../ui/KpiCard';
import KpiGrid from '../ui/KpiGrid';
import ChartCard from '../ui/ChartCard';
import ChartCaption from '../ChartCaption';
import { formatMT } from '../../utils/volumeFormat';
import {
  label, unit, definition, TREND_LABELS, FORECAST_CONFIDENCE, DATA_SUFFICIENCY,
  SCOPE_ALL_LABEL,
} from '../../constants/labels';

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* ---------------------------------------------------------------
   Safe helpers (never crash on null/undefined)
   --------------------------------------------------------------- */

function directionFromPct(changePct) {
  if (changePct === null || changePct === undefined) return 'stable';
  if (changePct > 2) return 'increasing';
  if (changePct < -2) return 'declining';
  return 'stable';
}

function directionLabel(d) {
  return TREND_LABELS[d] || 'Stable';
}

function directionTone(d) {
  if (d === 'increasing') return 'good';
  if (d === 'declining') return 'bad';
  return 'neutral';
}

function formatPctSigned(val) {
  if (val === null || val === undefined || !Number.isFinite(val)) return '\u2014';
  const sign = val > 0 ? '+' : val < 0 ? '\u2212' : '';
  return `${sign}${Math.abs(val).toFixed(1)}%`;
}

function monthLabel(ym) {
  if (!ym) return '\u2014';
  const m = parseInt(ym.slice(5, 7), 10);
  const y = ym.slice(0, 4);
  return `${MONTH_SHORT[m - 1]} ${y}`;
}

function na() {
  return '\u2014';
}

const SECTIONS = [
  { id: 'summary', label: 'Summary', controls: 'forecast-tabpanel-summary' },
  { id: 'trajectory', label: 'Past to future', controls: 'forecast-tabpanel-trajectory' },
];

function PillNav({ activeId, onSelect }) {
  return (
    <div className="fc-nav-wrap" role="tablist" aria-label="Forecast sections">
      {SECTIONS.map((s) => (
        <button
          key={s.id}
          id={`forecast-tab-${s.id}`}
          type="button"
          role="tab"
          aria-selected={activeId === s.id ? 'true' : 'false'}
          aria-controls={s.controls}
          tabIndex={activeId === s.id ? 0 : -1}
          className={`fc-pill ${activeId === s.id ? 'fc-pill--active' : ''}`}
          onClick={() => onSelect(s.id)}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return;
            e.preventDefault();
            const idx = SECTIONS.findIndex((x) => x.id === activeId);
            let next = idx;
            if (e.key === 'ArrowRight') next = (idx + 1) % SECTIONS.length;
            if (e.key === 'ArrowLeft') next = (idx - 1 + SECTIONS.length) % SECTIONS.length;
            if (e.key === 'Home') next = 0;
            if (e.key === 'End') next = SECTIONS.length - 1;
            onSelect(SECTIONS[next].id);
            const el = document.getElementById(`forecast-tab-${SECTIONS[next].id}`);
            if (el) el.focus();
          }}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

/* ===============================================================
   Main component
   =============================================================== */

function InnerForecastDashboard() {
  const [municipalities, setMunicipalities] = useState([]);
  const [runs, setRuns] = useState([]);
  const [outlook, setOutlook] = useState([]);
  const [supplyDemand, setSupplyDemand] = useState(null);
  const [trends, setTrends] = useState([]);
  const [adminMonths, setAdminMonths] = useState([]);
  const [predictive, setPredictive] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeSection, setActiveSection] = useState('summary');
  const [selectedMuni, setSelectedMuni] = useState('all');
  const [recordedWindow, setRecordedWindow] = useState('12');

  /* ---------------- Data loading ---------------- */

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      getAdminMunicipalities().then((res) => setMunicipalities(res.municipalities || [])).catch(() => setMunicipalities([])),
      getMunicipalityOutlook().then((res) => setOutlook(res.municipalities || [])).catch(() => setOutlook([])),
      getAdminSupplyDemand().then((res) => setSupplyDemand(res)).catch(() => setSupplyDemand(null)),
      getAdminTrends().then((res) => setTrends(res.municipalities || [])).catch(() => setTrends([])),
      getAdminMonths().then((res) => setAdminMonths(res.months || [])).catch(() => setAdminMonths([])),
      getAdminPredictive().then((res) => setPredictive(res)).catch(() => setPredictive(null)),
    ]).finally(() => setLoading(false));
  }, []);

  // Per-scope forecast runs. Scope "All 7" returns the province-wide run
  // (municipality_id == null); a municipality scope returns that
  // municipality's runs. The newest run in the list is the selection.
  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = selectedMuni !== 'all' ? { municipality_id: Number(selectedMuni) } : {};
    getForecastRuns(params)
      .then((res) => {
        setRuns(res.runs || []);
        setLoading(false);
      })
      .catch((err) => { setError(err.message || 'Failed to load forecast runs.'); setLoading(false); });
  }, [selectedMuni]);

  const selectedRun = useMemo(() => {
    if (!runs || runs.length === 0) return null;
    const pool = runs.filter((r) =>
      selectedMuni === 'all' ? r.municipality_id == null : r.municipality_id === Number(selectedMuni)
    );
    const source = pool.length > 0 ? pool : runs;
    const sorted = [...source].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    return sorted[0];
  }, [runs, selectedMuni]);

  const selectedMuniName = useMemo(() => {
    if (selectedMuni === 'all') return SCOPE_ALL_LABEL;
    const m = municipalities.find((x) => String(x.id) === String(selectedMuni));
    return m ? m.name : '\u2014';
  }, [selectedMuni, municipalities]);

  /* ---------------- Derived data ---------------- */

  const latestRecordMonth = useMemo(() => {
    if (!adminMonths || adminMonths.length === 0) return null;
    return adminMonths[adminMonths.length - 1];
  }, [adminMonths]);

  // Province-wide forecast production (always the full 12-month projection,
  // regardless of the municipality scope). Source: /api/admin/analytics/
  // predictive, which sums is_forecast points from each municipality's latest
  // run — so it is NOT subject to the runs query's limit=50 cap.
  const provinceForecastMT = useMemo(() => {
    if (!predictive || predictive.pangasinan == null) return null;
    return predictive.pangasinan.forecast_total_mt != null
      ? predictive.pangasinan.forecast_total_mt
      : null;
  }, [predictive]);

  // Per-municipality forecast production, from /predictive (by_municipality).
  const muniForecastProduction = useMemo(() => {
    if (!predictive || !predictive.by_municipality) return {};
    const out = {};
    predictive.by_municipality.forEach((m) => {
      out[m.municipality_id] = m.forecast_total_mt != null ? m.forecast_total_mt : null;
    });
    return out;
  }, [predictive]);

  // Which municipalities are excluded from the province-wide forecast total
  // because they have no forecast run (San Fabian).
  const excludedMunicipalities = useMemo(() => {
    if (!predictive || !predictive.by_municipality) return [];
    return predictive.by_municipality
      .filter((m) => m.forecast_total_mt == null)
      .map((m) => m.municipality_name);
  }, [predictive]);

  const chartData = useMemo(() => {
    if (!selectedRun || !selectedRun.points) return [];
    return selectedRun.points.map((p) => ({
      label: p.period_label,
      labelShort: monthLabel(p.period_label),
      historical: p.is_forecast ? null : (p.predicted_value != null ? p.predicted_value : null),
      forecast: p.is_forecast ? (p.predicted_value != null ? p.predicted_value : null) : null,
      lower: p.lower_bound != null ? p.lower_bound : null,
      upper: p.upper_bound != null ? p.upper_bound : null,
      isForecast: p.is_forecast,
    }));
  }, [selectedRun]);

  const historyPoints = chartData.filter((d) => !d.isForecast && d.historical != null);
  const forecastPoints = chartData.filter((d) => d.isForecast && d.forecast != null);
  const forecastStartIdx = chartData.findIndex((d) => d.isForecast);
  const forecastHorizon = forecastPoints.length;

  const incompleteMonths = useMemo(() => {
    if (chartData.length === 0) return [];
    const hist = chartData.filter((d) => !d.isForecast);
    const recent = hist.slice(-6);
    return recent.filter((d) => d.historical === null || d.historical === undefined);
  }, [chartData]);

  const hasIncompleteTail = selectedRun ? Boolean(selectedRun.incomplete_tail) : incompleteMonths.length > 0;

  const recordedProductionMT = useMemo(() => {
    if (historyPoints.length === 0) return null;
    const windowMonths = recordedWindow === 'all' ? Infinity : Number(recordedWindow);
    const recent = historyPoints.slice(-windowMonths);
    return recent.reduce((sum, d) => sum + (d.historical || 0), 0);
  }, [historyPoints, recordedWindow]);

  const forecastProductionMT = useMemo(() => {
    if (!selectedRun || selectedRun.projected_total == null) return null;
    return selectedRun.projected_total;
  }, [selectedRun]);

  const expectedChangePct = useMemo(() => {
    if (!selectedRun || selectedRun.expected_change_pct == null) return null;
    return selectedRun.expected_change_pct;
  }, [selectedRun]);

  const direction = useMemo(() => directionFromPct(expectedChangePct), [expectedChangePct]);

  const forecastConfidence = useMemo(() => {
    if (!selectedRun) return null;
    return selectedRun.reliability || null;
  }, [selectedRun]);

  const forecastRunDate = useMemo(() => {
    if (!selectedRun || !selectedRun.created_at) return null;
    return selectedRun.created_at;
  }, [selectedRun]);

  const demandBenchmark = useMemo(() => {
    if (!supplyDemand || !supplyDemand.pangasinan) return null;
    return supplyDemand.pangasinan.demand_volume != null ? supplyDemand.pangasinan.demand_volume : null;
  }, [supplyDemand]);

  const demandSource = useMemo(() => {
    if (!supplyDemand || !supplyDemand.pangasinan) return null;
    return {
      sourceName: supplyDemand.pangasinan.source_name || '—',
      year: supplyDemand.pangasinan.year || '—',
    };
  }, [supplyDemand]);

  // Demand comparison always uses province-wide forecast (per admin requirement)
  const demandShortfallMT = useMemo(() => {
    if (demandBenchmark == null || provinceForecastMT == null) return null;
    return demandBenchmark - provinceForecastMT;
  }, [demandBenchmark, provinceForecastMT]);

  const demandCoveredPct = useMemo(() => {
    if (demandBenchmark == null || demandBenchmark <= 0 || provinceForecastMT == null) return null;
    return (provinceForecastMT / demandBenchmark) * 100;
  }, [demandBenchmark, provinceForecastMT]);

  // The 12-point rule: % covered and the surplus/shortfall verdict are only
  // meaningful when the forecast has a full 12-month horizon. With fewer
  // points the comparison is misleading, so hide those and show a notice.
  const demandHasFullHorizon = forecastHorizon >= 12;

  // Shared, consistent municipality order used by BOTH the "Expected change"
  // chart and the "Year-over-year change" chart. Forecasted municipalities sort
  // by expected change (highest first); municipalities with no forecast sort
  // after them, alphabetically.
  const muniOrder = useMemo(() => {
    return [...outlook]
      .map((o) => ({
        id: o.municipality_id,
        name: o.municipality_name,
        change: o.expected_change_pct,
        hasForecast: o.expected_change_pct != null && o.expected_change_pct !== undefined,
      }))
      .sort((a, b) => {
        if (a.hasForecast !== b.hasForecast) return a.hasForecast ? -1 : 1;
        if (a.hasForecast) return b.change - a.change;
        return a.name.localeCompare(b.name);
      });
  }, [outlook]);

  const muniExpectedChange = useMemo(() => {
    return muniOrder
      .filter((o) => o.hasForecast)
      .map((o) => {
        const outlookRow = outlook.find((x) => x.municipality_id === o.id);
        return {
          name: o.name,
          id: o.id,
          change: o.change,
          trend: directionFromPct(o.change),
          readiness: outlookRow ? outlookRow.readiness : null,
          reliability: outlookRow ? outlookRow.reliability : null,
          algorithm: outlookRow ? outlookRow.algorithm : null,
          lastRunAt: outlookRow ? outlookRow.last_run_at : null,
        };
      });
  }, [muniOrder, outlook]);

  // Combined dataset for the Expected change chart: forecasted municipalities
  // (sorted by change) followed by municipalities with no forecast, shown as
  // gray dashed "No data" bars so every municipality appears in one chart.
  const muniExpectedChangeAll = useMemo(() => {
    const rows = muniExpectedChange.map((o) => ({
      name: o.name,
      id: o.id,
      change: o.change,
      trend: o.trend,
    }));
    muniOrder
      .filter((o) => !o.hasForecast)
      .forEach((o) => rows.push({ name: o.name, id: o.id, change: null, trend: 'noData' }));
    return rows;
  }, [muniExpectedChange, muniOrder]);

  const muniNoForecast = useMemo(() => {
    return [...outlook]
      .filter((o) => o.expected_change_pct == null || o.expected_change_pct === undefined)
      .map((o) => o.municipality_name);
  }, [outlook]);

  const needsAttention = useMemo(() => {
    return [...outlook]
      .filter((o) => {
        const dir = directionFromPct(o.expected_change_pct);
        const lowConf = o.reliability === 'low';
        const noData = o.expected_change_pct == null || o.expected_change_pct === undefined;
        return dir === 'declining' || lowConf || noData;
      })
      .map((o) => {
        const reasons = [];
        const dir = directionFromPct(o.expected_change_pct);
        if (dir === 'declining') reasons.push('Declining forecast');
        if (o.reliability === 'low') reasons.push('Low forecast confidence');
        if (o.expected_change_pct == null || o.expected_change_pct === undefined) reasons.push('Not enough data');
        return {
          name: o.municipality_name,
          id: o.municipality_id,
          change: o.expected_change_pct,
          trend: dir,
          readiness: o.readiness,
          reliability: o.reliability,
          reasons,
        };
      });
  }, [outlook]);

  const yoyRows = useMemo(() => {
    // Same municipality order as the Expected change chart (muniOrder).
    const trendByName = {};
    (trends || []).forEach((m) => { trendByName[m.name] = m; });
    return muniOrder.map((o) => {
      const t = trendByName[o.name];
      if (!t) {
        return { name: o.name, changePct: null, current: null, previous: null, hasData: false };
      }
      return {
        name: o.name,
        changePct: t.changePct != null ? t.changePct : null,
        current: t.current,
        previous: t.previous,
        hasData: t.changePct != null && t.current != null && t.previous != null,
      };
    });
  }, [muniOrder, trends]);

  const muniSummaryTable = useMemo(() => {
    return [...outlook].map((o) => {
      const dir = directionFromPct(o.expected_change_pct);
      const conf = o.reliability || 'low';
      const suff = o.readiness || 'not_ready';
      const hasForecast = o.expected_change_pct != null && o.expected_change_pct !== undefined;
      return {
        name: o.municipality_name,
        id: o.municipality_id,
        forecastMT: hasForecast ? (muniForecastProduction[o.municipality_id] ?? null) : null,
        changePct: hasForecast ? o.expected_change_pct : null,
        direction: dir,
        confidence: conf,
        sufficiency: suff,
        method: o.algorithm || 'none',
        lastRun: o.last_run_at ? new Date(o.last_run_at).toLocaleDateString() : '\u2014',
        hasForecast,
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [outlook, muniForecastProduction]);

  /* ---------------- Headline sentence (computed before early returns) ---------------- */

  const headlineSentence = useMemo(() => {
    if (forecastProductionMT == null) {
      return 'No forecast has been generated yet for this selection.';
    }
    const horizon = forecastHorizon > 0 ? forecastHorizon : 12;
    let sentence = `Forecast production for the next ${horizon} month${horizon === 1 ? '' : 's'} is ${formatMT(forecastProductionMT)} MT`;
    if (demandShortfallMT != null) {
      // A POSITIVE shortfall means demand EXCEEDS forecast (a shortage), so
      // the verb must be "falls short of". The old code had this inverted.
      const verb = demandShortfallMT > 0 ? 'falls short of' : 'exceeds';
      const abs = Math.abs(demandShortfallMT);
      sentence += `, which ${verb} provincial salt demand by ${formatMT(abs)} MT`;
    }
    sentence += `. Direction: ${directionLabel(direction)}.`;
    return sentence;
  }, [forecastProductionMT, demandShortfallMT, direction, forecastHorizon]);

  const demandAssumption = useMemo(() => {
    if (demandShortfallMT == null) {
      return 'Missing demand benchmark or forecast — assumption cannot be computed.';
    }
    const covered = demandCoveredPct != null ? demandCoveredPct.toFixed(1) + '%' : 'n/a';
    if (demandShortfallMT <= 0) {
      return `Assumption: Forecast production meets or exceeds salt demand. Forecast covers ${covered} of demand. Gap = salt demand − forecast production.`;
    }
    return `Assumption: Forecast production is below salt demand; gap = salt demand − forecast production. Forecast covers ${covered} of demand.`;
  }, [demandShortfallMT, demandCoveredPct]);

  const kpiLoading = loading || !selectedRun;

  /* ---------------- Loading / error states ---------------- */

  if (loading) {
    return (
      <div className="skeleton-dashboard">
        <SkeletonBlock width="45%" height={24} />
        <SkeletonBlock width="70%" height={13} />
        <div className="mt-4"><SkeletonCards count={5} /></div>
        <div className="skeleton-card"><SkeletonChart height={320} /></div>
        <div className="skeleton-card"><SkeletonChart height={240} /></div>
      </div>
    );
  }

  if (error) {
    return <Alert variant="danger">{error}</Alert>;
  }

  // No forecast exists for the current scope — neutral message, no button.
  // A failed request is handled by the `error` guard above and never reaches
  // here, so this only fires when the scope genuinely has no forecast.
  if (!selectedRun) {
    return (
      <div className="admin-single-page forecast-page">
        <PageHeader
          id="admin-forecast-header"
          variant="sub"
          title="Forecast &amp; Production Outlook"
          subtitle={`Chronological forecast story for ${selectedMuniName}.`}
        >
          <div className="fc-header-meta">
            <span className="fc-data-as-of">
              <span className="fc-meta-label">Data as of</span>
              <span className="fc-meta-value">
                {latestRecordMonth ? monthLabel(latestRecordMonth) : na()}
              </span>
            </span>
          </div>
          <div className="fc-filter-row">
            <label className="fc-filter-label" htmlFor="forecast-recorded-window">Recorded window</label>
            <Form.Select id="forecast-recorded-window" className="fc-filter-select" value={recordedWindow} onChange={(e) => setRecordedWindow(e.target.value)} aria-label="Recorded production window">
              <option value="3">Last 3 months</option>
              <option value="6">Last 6 months</option>
              <option value="12">Last 12 months</option>
              <option value="all">All history</option>
            </Form.Select>
            <label className="fc-filter-label" htmlFor="forecast-muni-scope">Municipality scope</label>
            <Form.Select id="forecast-muni-scope" className="fc-filter-select" value={selectedMuni} onChange={(e) => setSelectedMuni(e.target.value)} aria-label="Municipality scope">
              <option value="all">{SCOPE_ALL_LABEL}</option>
              {municipalities.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </Form.Select>
          </div>
        </PageHeader>

        <div className="fc-empty-forecast">
          <div className="fc-empty-forecast-card">
            <span className="fc-empty-forecast-icon"><Zap size={32} strokeWidth={2} /></span>
            <h3>No forecast available for this selection yet.</h3>
          </div>
        </div>
      </div>
    );
  }

  /* ===============================================================
     Render
     =============================================================== */

  return (
    <div className="admin-single-page forecast-page">
      {/* ============ Header ============ */}
      <PageHeader
        id="admin-forecast-header"
        variant="sub"
        title="Forecast &amp; Production Outlook"
        subtitle={`Chronological forecast story for ${selectedMuniName}. Data-backed KPIs, trajectory, demand check, and per-municipality outlook.`}
      >
        <div className="fc-header-meta">
          <span className="fc-data-as-of">
            <span className="fc-meta-label">Data as of</span>
            <span className="fc-meta-value">
              {latestRecordMonth ? monthLabel(latestRecordMonth) : na()}
            </span>
          </span>
        </div>
        <div className="fc-filter-row">
          <label className="fc-filter-label" htmlFor="forecast-recorded-window">Recorded window</label>
          <Form.Select id="forecast-recorded-window" className="fc-filter-select" value={recordedWindow} onChange={(e) => setRecordedWindow(e.target.value)} aria-label="Recorded production window">
            <option value="3">Last 3 months</option>
            <option value="6">Last 6 months</option>
            <option value="12">Last 12 months</option>
            <option value="all">All history</option>
          </Form.Select>
          <label className="fc-filter-label" htmlFor="forecast-muni-scope">Municipality scope</label>
          <Form.Select id="forecast-muni-scope" className="fc-filter-select" value={selectedMuni} onChange={(e) => setSelectedMuni(e.target.value)} aria-label="Municipality scope">
            <option value="all">{SCOPE_ALL_LABEL}</option>
            {municipalities.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </Form.Select>
        </div>
      </PageHeader>

      {/* ============ Tab navigation ============ */}
      <div className="fc-nav-wrap">
        <PillNav activeId={activeSection} onSelect={setActiveSection} />
      </div>

      {/* ============ B. Past to future ============ */}
      <section className="fc-section" role="tabpanel" id="forecast-tabpanel-trajectory" aria-labelledby="forecast-tab-trajectory" hidden={activeSection !== 'trajectory'}>
        <div className="fc-section-head">
          <span className="fc-section-chip"><ChartLine size={16} strokeWidth={2} /></span>
          <div>
            <h2 className="fc-section-title">Production trajectory</h2>
            <p className="fc-section-sub">{headlineSentence}</p>
          </div>
        </div>

        <KpiGrid columns={5} className="fc-kpi-strip mb-3">
          <KpiCard
            icon={ChartLine}
            title={label('recordedMt') || 'Recorded production'}
            value={recordedProductionMT != null ? recordedProductionMT : null}
            unit={unit('recordedMt') || 'MT'}
            supporting={`Sum of approved records, last ${recordedWindow === 'all' ? 'all available' : recordedWindow} months${latestRecordMonth ? ` through ${monthLabel(latestRecordMonth)}` : ''}`}
            info={definition('recordedMt') + ' Source: approved production records.'}
            loading={kpiLoading}
          />
          <KpiCard
            icon={Target}
            title={label('forecastTotalMt') || 'Forecast production'}
            value={forecastProductionMT != null ? forecastProductionMT : null}
            unit={unit('forecastTotalMt') || 'MT'}
            supporting={`Next 12 months${forecastRunDate ? ` · ${new Date(forecastRunDate).toLocaleDateString()}` : ''}`}
            info={definition('forecastTotalMt') + ' Source: model forecast run.'}
            badge={{ text: directionLabel(direction), tone: directionTone(direction) }}
            loading={kpiLoading}
          />
          <KpiCard
            icon={TrendingUp}
            title={label('changeVsRecentAvgPct') || 'Change vs recent average'}
            value={expectedChangePct != null ? expectedChangePct : null}
            unit={unit('changeVsRecentAvgPct') || '%'}
            supporting={`Forecast vs recent historical average`}
            info={definition('changeVsRecentAvgPct') + ' Source: latest forecast run.'}
            trend={{
              direction: direction === 'increasing' ? 'up' : direction === 'declining' ? 'down' : 'up',
              value: expectedChangePct != null ? Math.abs(expectedChangePct) : 0,
              label: directionLabel(direction),
              goodWhen: direction === 'declining' ? 'down' : 'up',
            }}
            loading={kpiLoading}
          />
          <KpiCard
            icon={Activity}
            title={label('trendDirection') || 'Direction'}
            value={na()}
            unit={null}
            supporting={directionLabel(direction)}
            info={definition('trendDirection')}
            badge={{ text: directionLabel(direction), tone: directionTone(direction) }}
            loading={kpiLoading}
          />
          <KpiCard
            icon={ShieldCheck}
            title={label('forecastConfidence') || 'Forecast confidence'}
            value={na()}
            unit={null}
            supporting={forecastConfidence ? (FORECAST_CONFIDENCE[forecastConfidence] || forecastConfidence) : '—'}
            info={definition('forecastConfidence') + ' Source: latest forecast run.'}
            badge={{ text: forecastConfidence ? (FORECAST_CONFIDENCE[forecastConfidence] || forecastConfidence) : '—', tone: forecastConfidence === 'high' ? 'good' : forecastConfidence === 'moderate' ? 'neutral' : 'bad' }}
            loading={kpiLoading}
          />
        </KpiGrid>

        <ChartCard
          icon={ChartLine}
          title="Historical vs Forecast Production"
          subtitle={`${selectedMuniName} · ${chartData.length} months`}
          height={360}
          caption={
            hasIncompleteTail ? (
              <ChartCaption tone="info">
                <span className="fc-incomplete-badge" title="Recent months have fewer approved records than normal — may be under-reported.">
                  Still being reported
                </span>
                Recent months are under-reported; the forecast is anchored to the established seasonal pattern.
              </ChartCaption>
            ) : (
              <ChartCaption tone="info">
                Historical production (blue) then forecast (orange) with expected-range band. "Forecast starts here" marks the boundary.
              </ChartCaption>
            )
          }
          className="fc-trajectory-card"
        >
          {chartData.length === 0 ? (
            <div className="fc-empty-state">
              <Zap size={24} strokeWidth={2} />
              <p>No forecast data available. <strong>Run Forecast</strong> to generate a projection.</p>
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 20, right: 24, bottom: 24, left: 0 }}>
                <defs>
                  <linearGradient id="fcBandGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={BRAND.ocean} stopOpacity={0.20} />
                    <stop offset="100%" stopColor={BRAND.ocean} stopOpacity={0.08} />
                  </linearGradient>
                  <linearGradient id="fcAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={BRAND.gold} stopOpacity={0.30} />
                    <stop offset="100%" stopColor={BRAND.gold} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--ui-chart-grid)" />
                <XAxis
                  dataKey="labelShort"
                  tick={{ fontSize: 11 }}
                  interval={Math.max(1, Math.floor(chartData.length / 8))}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => `${Math.round(v).toLocaleString()} MT`}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="fc-tooltip">
                        <div className="fc-tooltip-label">{d.labelShort}</div>
                        {d.historical != null && (
                          <div className="fc-tooltip-row">
                            <span>Historical</span><b>{formatMT(d.historical)} MT</b>
                          </div>
                        )}
                        {d.forecast != null && (
                          <div className="fc-tooltip-row">
                            <span>Forecast</span><b>{formatMT(d.forecast)} MT</b>
                          </div>
                        )}
                        {d.lower != null && d.upper != null && (
                          <div className="fc-tooltip-row">
                            <span>Expected range</span><b>{formatMT(d.lower)} – {formatMT(d.upper)} MT</b>
                          </div>
                        )}
                        <div className="fc-tooltip-source">Source: approved production records for historical months; model forecast for future months.</div>
                      </div>
                    );
                  }}
                />
                {forecastStartIdx >= 0 && chartData[forecastStartIdx] && (
                  <ReferenceLine
                    x={chartData[forecastStartIdx].labelShort}
                    stroke="#9CA3AF"
                    strokeDasharray="4 3"
                    strokeWidth={2}
                    label={{
                      value: 'Forecast starts here',
                      position: 'top',
                      fontSize: 11,
                      fill: '#6B7280',
                    }}
                  />
                )}
                {chartData.some((d) => d.lower != null && d.upper != null) && (
                  <>
                    <Area type="monotone" dataKey="upper" stroke="none" fill="url(#fcBandGrad)" name="Upper bound" connectNulls />
                    <Area type="monotone" dataKey="lower" stroke="none" fill="url(#fcBandGrad)" name="Lower bound" connectNulls />
                  </>
                )}
                <Line type="monotone" dataKey="historical" stroke={BRAND.ocean} strokeWidth={3} dot={false} name="Historical" connectNulls isAnimationActive={false} />
                <Line type="monotone" dataKey="forecast" stroke={BRAND.gold} strokeWidth={3} strokeDasharray="6 4" dot={false} name="Forecast" connectNulls isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
            <div className="fc-trajectory-legend">
              <span className="fc-legend-item"><span className="fc-legend-swatch" style={{ backgroundColor: BRAND.ocean }} /> Historical</span>
              <span className="fc-legend-item"><span className="fc-legend-swatch" style={{ backgroundColor: BRAND.gold }} /> Forecast</span>
              <span className="fc-legend-item"><span className="fc-legend-swatch" style={{ backgroundColor: 'rgba(240, 154, 40, 0.20)', border: '1px solid rgba(240, 154, 40, 0.40)' }} /> Expected range</span>
            </div>
            </>
          )}
</ChartCard>

        {forecastPoints.length > 0 && (
            <div className="fc-annotation-row">
              <span className="fc-annotation">
                <TrendingUp size={12} strokeWidth={2} /> Peak forecast: {monthLabel(forecastPoints.reduce((a, b) => (b.forecast > a.forecast ? b : a)).label)} at {formatMT(Math.max(...forecastPoints.map((d) => d.forecast)))} MT
              </span>
              <span className="fc-annotation">
                <ArrowDownRight size={12} strokeWidth={2} /> Lowest forecast: {monthLabel(forecastPoints.reduce((a, b) => (b.forecast < a.forecast ? b : a)).label)} at {formatMT(Math.min(...forecastPoints.map((d) => d.forecast)))} MT
              </span>
            </div>
          )}
      </section>

      <section className="fc-section" role="tabpanel" id="forecast-tabpanel-seasonal" aria-labelledby="forecast-tab-seasonal" hidden={activeSection !== 'trajectory'} style={{ marginTop: 0 }}>
        <div className="fc-section-head">
          <span className="fc-section-chip"><CalendarDays size={16} strokeWidth={2} /></span>
          <div>
            <h2 className="fc-section-title">Average production by month</h2>
            <p className="fc-section-sub">Seasonal cycle across complete years</p>
          </div>
        </div>

        <ChartCard
          icon={CalendarDays}
          title="Average Production by Month"
          subtitle="Seasonal cycle across complete years"
          height={260}
          caption={
            <ChartCaption tone="info">
              Dry months (Jan–Jun) typically show higher output; rainy months (Jul–Dec) lower. The navy marker shows the latest month with approved records.
            </ChartCaption>
          }
        >
          {(() => {
            const monthTotals = {};
            const monthCounts = {};
            historyPoints.forEach((d) => {
              const m = parseInt(d.label.slice(5, 7), 10);
              if (!monthTotals[m]) { monthTotals[m] = 0; monthCounts[m] = 0; }
              monthTotals[m] += d.historical;
              monthCounts[m] += 1;
            });
            const series = [];
            for (let m = 1; m <= 12; m++) {
              if (monthCounts[m] > 0) {
                series.push({ month: m, label: MONTH_SHORT[m - 1], value: monthTotals[m] / monthCounts[m] });
              } else {
                series.push({ month: m, label: MONTH_SHORT[m - 1], value: null });
              }
            }
            // Current month = the calendar month of the latest approved record,
            // not the wall-clock month. The seasonal average is built from
            // complete years, so the marker points at where reporting actually
            // stands right now.
            const seasonalCurrentMonth = (() => {
              if (!latestRecordMonth) return null;
              const parsed = parseInt(latestRecordMonth.slice(5, 7), 10);
              return Number.isFinite(parsed) && parsed >= 1 && parsed <= 12 ? parsed : null;
            })();
            return (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={series} margin={{ top: 20, right: 20, bottom: 24, left: 0 }}>
                  <defs>
                    <linearGradient id="fcSeasonGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={BRAND.gold} stopOpacity={0.30} />
                      <stop offset="100%" stopColor={BRAND.gold} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--ui-chart-grid)" vertical={false} />
                  <ReferenceArea x1={1} x2={6} fill="rgba(12, 35, 64, 0.13)" />
                  <ReferenceArea x1={7} x2={12} fill="rgba(240, 154, 40, 0.16)" />
                  <ReferenceLine x={6.5} stroke="rgba(12, 35, 64, 0.22)" strokeDasharray="3 3" strokeWidth={1} />
                  <XAxis
                    type="number"
                    dataKey="month"
                    domain={[1, 12]}
                    ticks={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]}
                    tickFormatter={(m) => MONTH_SHORT[m - 1]}
                    tick={{ fontSize: 11 }}
                    interval={0}
                    tickLine={false}
                  />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v).toLocaleString()} MT`} width={44} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || payload.length === 0) return null;
                      const d = payload[0].payload;
                      if (d.value == null) return null;
                      return (
                        <div className="fc-tooltip">
                          <div className="fc-tooltip-label">{d.label}</div>
                          <div className="fc-tooltip-row">
                            <span>Average production</span><b>{formatMT(d.value)} MT</b>
                          </div>
                          <div className="fc-tooltip-source">Source: approved production records, grouped by calendar month across complete years.</div>
                        </div>
                      );
                    }}
                  />
                  <Area type="monotone" dataKey="value" stroke={BRAND.gold} strokeWidth={2} fill="url(#fcSeasonGrad)" dot={{ r: 4 }} connectNulls isAnimationActive={false} />
                  {seasonalCurrentMonth && (
                    <ReferenceLine
                      x={seasonalCurrentMonth}
                      stroke={BRAND.ocean}
                      strokeDasharray="5 3"
                      strokeWidth={2.5}
                      label={{ value: 'Reporting as of', position: 'top', fontSize: 10, fill: BRAND.ocean }}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            );
          })()}
</ChartCard>

        {/* Supply-demand gap insight — one compact card, province-wide only.
            The 12-point rule hides % covered and the verdict when the forecast
            has fewer than 12 points (a 6-month run cannot be fairly compared
            against an annual demand benchmark). */}
        <Card className="fc-card">
          <Card.Header className="fc-card-header">
            <div className="d-flex align-items-center gap-2">
              <Target size={16} strokeWidth={2} />
              <h5 className="fc-card-title mb-0">Forecast (next {forecastHorizon} month${forecastHorizon === 1 ? '' : 's'}) vs annual demand benchmark</h5>
            </div>
          </Card.Header>
          <Card.Body className="fc-card-body">
            <div className="d-flex align-items-baseline justify-content-between gap-3 mb-3">
              <div>
                <div className="fc-demand-label">Forecast production</div>
                <div className="fc-demand-value">
                  {provinceForecastMT != null ? formatMT(provinceForecastMT) : na()}
                </div>
              </div>
              <div className="text-end">
                <div className="fc-demand-label">Annual salt demand</div>
                <div className="fc-demand-value">
                  {demandBenchmark != null ? formatMT(demandBenchmark) : na()}
                </div>
                {demandSource && (
                  <div className="fc-demand-source">DOST NICER / ASIN Center benchmark, {demandSource.year} ({demandSource.sourceName})</div>
                )}
              </div>
            </div>

            {demandHasFullHorizon ? (
              <>
                <div className="fc-progress-wrap">
                  <div className="fc-progress-label d-flex justify-content-between mb-1">
                    <span>% of salt demand covered</span>
                    <span className="fc-progress-pct">{demandCoveredPct != null ? demandCoveredPct.toFixed(1) + '%' : na()}</span>
                  </div>
                  <div className="fc-progress-track">
                    <div
                      className="fc-progress-fill"
                      style={{
                        width: demandCoveredPct != null ? Math.max(0, Math.min(100, demandCoveredPct)) : 0,
                        backgroundColor: demandShortfallMT != null && demandShortfallMT <= 0 ? BRAND.green : STATUS.not_ready,
                      }}
                    />
                  </div>
                </div>
                <div className="fc-demand-verdict mt-3">
                  {demandShortfallMT != null ? (
                    demandShortfallMT <= 0 ? (
                      <div className="fc-verdict-surplus">
                        <span className="fc-verdict-icon">✓</span>
                        <span className="fc-verdict-text">Surplus: {formatMT(Math.abs(demandShortfallMT))} MT</span>
                      </div>
                    ) : (
                      <div className="fc-verdict-shortfall">
                        <span className="fc-verdict-icon">!</span>
                        <span className="fc-verdict-text">Demand shortfall: {formatMT(demandShortfallMT)} MT</span>
                      </div>
                    )
                  ) : (
                    <div className="fc-verdict-na">Not available — missing demand benchmark or forecast.</div>
                  )}
                </div>
                <div className="fc-demand-assumption mt-2">
                  <small>{demandAssumption}</small>
                </div>
                {excludedMunicipalities.length > 0 && (
                  <div className="fc-demand-excluded mt-2">
                    <small className="fc-demand-excluded-text">
                      Total excludes {excludedMunicipalities.join(', ')} (not enough data — no forecast run).
                    </small>
                  </div>
                )}
              </>
            ) : (
              <div className="fc-demand-insufficient mt-2">
                <p className="fc-demand-insufficient-text">
                  This forecast covers only {forecastHorizon} month${forecastHorizon === 1 ? '' : 's'}, so it cannot be fairly compared against an annual demand benchmark. Run a 12-month forecast to see the demand comparison.
                </p>
                {excludedMunicipalities.length > 0 && (
                  <p className="fc-demand-excluded-text mt-1">
                    Total also excludes {excludedMunicipalities.join(', ')} (not enough data — no forecast run).
                  </p>
                )}
              </div>
            )}
          </Card.Body>
        </Card>
      </section>

      {/* ============ A. Summary ============ */}
      <section className="fc-section" role="tabpanel" id="forecast-tabpanel-summary" aria-labelledby="forecast-tab-summary" hidden={activeSection !== 'summary'}>
        <div className="fc-section-head">
          <span className="fc-section-chip"><List size={16} strokeWidth={2} /></span>
          <div>
            <h2 className="fc-section-title">By municipality</h2>
            <p className="fc-section-sub">Expected change, needs attention, year-over-year, and forecast summary for all 7 municipalities.</p>
          </div>
        </div>

        {/* D1 + D2 side by side: 8 cols + 4 cols */}
        <Row className="g-3 mb-3">
          <Col lg={8} md={12}>
            <Card className="fc-card h-100">
              <Card.Header className="fc-card-header">
                <div className="d-flex align-items-center gap-2">
                  <TrendingUp size={16} strokeWidth={2} />
                  <h5 className="fc-card-title mb-0">Expected change by municipality</h5>
                </div>
              </Card.Header>
              <Card.Body className="fc-card-body p-0">
                <div style={{ height: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={muniExpectedChange}
                      layout="vertical"
                      margin={{ top: 10, right: 20, bottom: 10, left: 90 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--ui-chart-grid)" horizontal={false} />
                      <ReferenceLine x={0} stroke="#6c757d" strokeWidth={1} />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`}
                        domain={['auto', 'auto']}
                      />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={90} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload || payload.length === 0) return null;
                          const d = payload[0].payload;
                          if (d.trend === 'noData') {
                            return (
                              <div className="fc-tooltip">
                                <div className="fc-tooltip-label">{d.name}</div>
                                <div className="fc-tooltip-row">
                                  <span>Status</span><b>Not enough data</b>
                                </div>
                                <div className="fc-tooltip-source">No forecast generated yet — fewer than 6 observed months. Run a forecast for this municipality first.</div>
                              </div>
                            );
                          }
                          return (
                            <div className="fc-tooltip">
                              <div className="fc-tooltip-label">{d.name}</div>
                              <div className="fc-tooltip-row">
                                <span>Expected change</span><b>{formatPctSigned(d.change)}</b>
                              </div>
                              <div className="fc-tooltip-row">
                                <span>Direction</span><b>{directionLabel(d.trend)}</b>
                              </div>
                              <div className="fc-tooltip-source">Source: latest forecast run per municipality.</div>
                            </div>
                          );
                        }}
                      />
                      <Bar
                        dataKey="change"
                        name="Expected change (%)"
                        maxBarSize={24}
                        isAnimationActive={false}
                        label={({ x, y, width, height, value }) => {
                          if (value == null || value === 0) return null;
                          const isPos = value > 0;
                          return (
                            <text
                              x={isPos ? (x + width + 4) : (x - 4)}
                              y={y + height / 2}
                              textAnchor={isPos ? 'start' : 'end'}
                              dominantBaseline="central"
                              fontSize={11}
                              fontWeight={700}
                              fill={isPos ? BRAND.green : STATUS.not_ready}
                            >{value > 0 ? '+' : ''}{value.toFixed(1)}%</text>
                          );
                        }}
                      >
                        {muniExpectedChangeAll.map((entry, i) => (
                          <Cell
                            key={`muni-${i}`}
                            fill={entry.trend === 'increasing' ? BRAND.green : entry.trend === 'declining' ? STATUS.not_ready : entry.trend === 'noData' ? '#e2e8f0' : '#adb5bd'}
                            stroke={entry.trend === 'noData' ? '#adb5bd' : undefined}
                            strokeDasharray={entry.trend === 'noData' ? '4 3' : undefined}
                            radius={[0, 6, 6, 0]}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="fc-muni-legend mt-2">
                  <span className="fc-legend-item"><span className="fc-legend-dot" style={{ backgroundColor: BRAND.green }} /> Increasing (&gt;+2%)</span>
                  <span className="fc-legend-item"><span className="fc-legend-dot" style={{ backgroundColor: STATUS.not_ready }} /> Declining (&lt;-2%)</span>
                  <span className="fc-legend-item"><span className="fc-legend-dot" style={{ backgroundColor: '#adb5bd' }} /> Stable (within ±2%)</span>
                  {muniNoForecast.length > 0 && (
                    <span className="fc-legend-item fc-legend-no-data">
                      <span className="fc-legend-dot" style={{ backgroundColor: '#e2e8f0', border: '1px dashed #adb5bd' }} /> Not enough data: {muniNoForecast.join(', ')}
                    </span>
                  )}
                </div>
                {muniNoForecast.length > 0 && (
                  <div className="fc-not-enough-data mt-2">
                    <p className="fc-not-enough-text">
                      {muniNoForecast.join(', ')} <strong>Not enough data</strong> — no forecast generated (fewer than 6 observed months). Run a forecast for this municipality first.
                    </p>
                  </div>
                )}
              </Card.Body>
            </Card>
          </Col>

          <Col lg={4} md={12}>
            <Card className="fc-card h-100">
              <Card.Header className="fc-card-header">
                <div className="d-flex align-items-center gap-2">
                  <Flag size={16} strokeWidth={2} />
                  <h5 className="fc-card-title mb-0">Needs attention</h5>
                </div>
              </Card.Header>
              <Card.Body className="fc-card-body p-0">
                {needsAttention.length === 0 ? (
                  <div className="fc-empty-state">
                    <p>No municipalities need attention at this time.</p>
                  </div>
                ) : (
                  <div className="fc-needs-attention-list">
                    {needsAttention.map((m) => (
                      <div key={m.id} className="fc-attention-item">
                        <div className="fc-attention-name">
                          <span className="fc-attention-dot" style={{ backgroundColor: m.trend === 'declining' ? STATUS.not_ready : m.reliability === 'low' ? '#f59e0b' : '#adb5bd' }} />
                          <span className="fc-attention-title">{m.name}</span>
                          <span className="fc-attention-change">{m.change != null ? formatPctSigned(m.change) : '\u2014'}</span>
                        </div>
                        <div className="fc-attention-reasons">
                          {m.reasons.map((r, i) => (
                            <span key={i} className="fc-attention-reason">{r}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card.Body>
            </Card>
          </Col>
        </Row>

        {/* D3. Year-over-year change */}
        <div className="row g-3 mb-3">
          <Col lg={12}>
            <Card className="fc-card h-100">
              <Card.Header className="fc-card-header">
                <div className="d-flex align-items-center gap-2">
                  <Clock size={16} strokeWidth={2} />
                  <h5 className="fc-card-title mb-0">Year-over-year change</h5>
                </div>
              </Card.Header>
              <Card.Body className="fc-card-body p-0">
                <div style={{ height: 260 }}>
                  <ResponsiveContainer width="100%" height="100%">
<BarChart
                       data={yoyRows}
                       layout="vertical"
                       margin={{ top: 10, right: 48, bottom: 10, left: 90 }}
                     >
                       <CartesianGrid strokeDasharray="3 3" stroke="var(--ui-chart-grid)" horizontal={false} />
                       <ReferenceLine x={0} stroke="#6c757d" strokeWidth={1.5} />
                       <XAxis
                         type="number"
                         tick={{ fontSize: 11 }}
                         tickFormatter={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`}
                         domain={['auto', 'auto']}
                       />
                       <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={90} />
                       <Tooltip
                         content={({ active, payload }) => {
                           if (!active || !payload || payload.length === 0) return null;
                           const d = payload[0].payload;
                           if (!d.hasData) {
                             return (
                               <div className="fc-tooltip">
                                 <div className="fc-tooltip-label">{d.name}</div>
                                 <div className="fc-tooltip-row">
                                   <span>Status</span><b>Incomplete data</b>
                                 </div>
                                 <div className="fc-tooltip-source">Not enough complete months for a valid year-over-year comparison.</div>
                               </div>
                             );
                           }
                           return (
                             <div className="fc-tooltip">
                               <div className="fc-tooltip-label">{d.name}</div>
                               <div className="fc-tooltip-row">
                                 <span>Last 12 months</span><b>{formatMT(d.current)} MT</b>
                               </div>
                               <div className="fc-tooltip-row">
                                 <span>Previous 12 months</span><b>{formatMT(d.previous)} MT</b>
                               </div>
                               <div className="fc-tooltip-row">
                                 <span>YoY change</span><b>{formatPctSigned(d.changePct)}</b>
                               </div>
                               <div className="fc-tooltip-source">Source: approved production records, last 12 complete months vs previous 12 complete months.</div>
                             </div>
                           );
                         }}
                       />
                       <Bar dataKey="changePct" name="YoY change (%)" maxBarSize={22} isAnimationActive={false}
                         label={({ x, y, width, height, value }) => {
                           if (value == null) return null;
                           const isPos = value > 0;
                           return (
                             <text
                               x={isPos ? (x + width + 4) : (x - 4)}
                               y={y + height / 2}
                               textAnchor={isPos ? 'start' : 'end'}
                               dominantBaseline="central"
                               fontSize={11}
                               fontWeight={700}
                               fill={isPos ? BRAND.green : STATUS.not_ready}
                             >{value > 0 ? '+' : ''}{value.toFixed(1)}%</text>
                           );
                         }}
                       >
                         {yoyRows.map((m, i) => (
                           <Cell
                             key={`yoy-${i}`}
                             fill={!m.hasData ? '#e2e8f0' : m.changePct >= 0 ? BRAND.green : STATUS.not_ready}
                             stroke={!m.hasData ? '#adb5bd' : undefined}
                             strokeDasharray={!m.hasData ? '4 3' : undefined}
                             radius={[0, 6, 6, 0]}
                           />
                         ))}
                       </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="fc-yoy-legend mt-2">
                  <span className="fc-legend-item"><span className="fc-legend-dot" style={{ backgroundColor: BRAND.green }} /> Increase</span>
                  <span className="fc-legend-item"><span className="fc-legend-dot" style={{ backgroundColor: STATUS.not_ready }} /> Decrease</span>
                  <span className="fc-legend-item"><span className="fc-legend-dot" style={{ backgroundColor: '#adb5bd' }} /> Incomplete data</span>
                </div>
                {yoyRows.filter((m) => !m.hasData).length > 0 && (
                  <div className="fc-yoy-incomplete mt-2">
                    <p className="fc-yoy-incomplete-text">
                      {yoyRows.filter((m) => !m.hasData).map((m) => m.name).join(', ')} — <strong>Incomplete data</strong> (not enough complete months for a valid YoY comparison).
                    </p>
                  </div>
                )}
              </Card.Body>
            </Card>
          </Col>
        </div>

        {/* D4. Municipality forecast summary table */}
        <div className="row g-3">
          <Col lg={12}>
            <Card className="fc-card h-100">
              <Card.Header className="fc-card-header">
                <div className="d-flex align-items-center gap-2">
                  <TableIcon size={16} strokeWidth={2} />
                  <h5 className="fc-card-title mb-0">Municipality forecast summary</h5>
                </div>
              </Card.Header>
              <Card.Body className="fc-card-body p-0">
                <div className="fc-table-wrap">
                  <table className="fc-summary-table">
                    <thead>
                      <tr>
                        <th>Municipality</th>
                        <th>Forecast production</th>
                        <th>Change vs recent average</th>
                        <th>Direction</th>
                        <th>Forecast confidence</th>
                        <th>Data sufficiency</th>
                        <th>Last run</th>
                      </tr>
                    </thead>
                    <tbody>
                      {muniSummaryTable.length === 0 ? (
                        <tr>
                          <td colSpan="7" className="fc-table-empty">No municipality forecast data available.</td>
                        </tr>
                      ) : (
                        muniSummaryTable.map((m) => (
                          <tr key={m.id}>
                            <td className="fc-table-name">{m.name}</td>
                            <td className="fc-table-numeric">
                              {m.forecastMT != null ? formatMT(m.forecastMT) : na()}
                            </td>
                            <td className="fc-table-numeric">
                              {m.changePct != null ? formatPctSigned(m.changePct) : na()}
                            </td>
                            <td className="fc-table-badge">
                              {m.hasForecast ? (
                                <span className={`fc-badge fc-badge--${directionTone(m.direction)}`}>{directionLabel(m.direction)}</span>
                              ) : (
                                <span className="fc-badge fc-badge--neutral">Not enough data</span>
                              )}
                            </td>
                            <td className="fc-table-badge">
                              <span className={`fc-badge fc-badge--${m.confidence === 'high' ? 'good' : m.confidence === 'moderate' ? 'neutral' : 'bad'}`}>{FORECAST_CONFIDENCE[m.confidence] || m.confidence}</span>
                            </td>
                            <td className="fc-table-badge">
                              <span className={`fc-badge fc-badge--${m.sufficiency === 'ready' ? 'good' : m.sufficiency === 'limited' ? 'neutral' : 'bad'}`}>{DATA_SUFFICIENCY[m.sufficiency] || m.sufficiency}</span>
                            </td>
                            <td className="fc-table-numeric">{m.lastRun}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <ChartCaption tone="info">
                  Forecast production, change vs recent average, direction, confidence, and data sufficiency per municipality.
                  {muniNoForecast.length > 0 && ` Municipalities without a forecast (${muniNoForecast.join(', ')}) show "Not enough data".`}
                </ChartCaption>
              </Card.Body>
            </Card>
          </Col>
        </div>
      </section>
    </div>
  );
}

export default function ForecastDashboard() {
  return (
    <ErrorBoundary>
      <InnerForecastDashboard />
    </ErrorBoundary>
  );
}
