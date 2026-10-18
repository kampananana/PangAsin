import { useEffect, useState, useMemo } from 'react';
import { Row, Col, Card, Alert, Form, Button, Modal } from 'react-bootstrap';
import ErrorBoundary from '../ErrorBoundary';
import {
  ComposedChart, Line, Area, Bar, BarChart, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell, ReferenceArea, ReferenceLine,
} from 'recharts';
import {
  ChartLine, CalendarDays, Target, Boxes, TrendingUp, ArrowDownRight,
  Activity, ShieldCheck, Clock, Flag, List, Table as TableIcon, Zap,
} from 'lucide-react';
import {
  runForecast, getForecastRuns, getMunicipalityOutlook, getAdminMunicipalities,
  getAdminSupplyDemand, getAdminTrends, getAdminMonths,
} from '../../services/dataService';
import { useToast } from '../Toast';
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
  { id: 'demand', label: 'Demand check', controls: 'forecast-tabpanel-demand' },
  { id: 'municipality', label: 'By municipality', controls: 'forecast-tabpanel-municipality' },
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
  const { toastSuccess, toastError } = useToast();

  const [municipalities, setMunicipalities] = useState([]);
  const [runs, setRuns] = useState([]);
  const [selectedRunId, setSelectedRunId] = useState(null);
  const [outlook, setOutlook] = useState([]);
  const [supplyDemand, setSupplyDemand] = useState(null);
  const [trends, setTrends] = useState([]);
  const [adminMonths, setAdminMonths] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [running, setRunning] = useState(false);
  const [activeSection, setActiveSection] = useState('summary');
  const [selectedMuni, setSelectedMuni] = useState('all');
  const [provinceRuns, setProvinceRuns] = useState([]);
  const [recordedWindow, setRecordedWindow] = useState('12');
  const [forecastHorizon, setForecastHorizon] = useState(12);
  const [forecastNotes, setForecastNotes] = useState('');
  const [showForecastModal, setShowForecastModal] = useState(false);

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
      getForecastRuns({}).then((res) => setProvinceRuns(res.runs || [])).catch(() => setProvinceRuns([])),
    ]).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = selectedMuni !== 'all' ? { municipality_id: Number(selectedMuni) } : {};
    getForecastRuns(params)
      .then((res) => {
        const runsList = res.runs || [];
        setRuns(runsList);
        if (runsList.length > 0 && !selectedRunId) {
          setSelectedRunId(String(runsList[0].id));
        }
        setLoading(false);
      })
      .catch((err) => { setError(err.message || 'Failed to load forecast runs.'); setLoading(false); });
  }, [selectedMuni, selectedRunId]);

  const selectedRun = useMemo(() => {
    // Validate the stored selection against the current scope. When scope is
    // "All 7 municipalities" the displayed run must be a province-wide run
    // (municipality_id == null), never a single-municipality run like
    // Alaminos City; the reverse holds for a municipality scope.
    const byId = runs.find((r) => String(r.id) === String(selectedRunId));
    if (byId) {
      const isProvinceScope = selectedMuni === 'all';
      const runIsProvince = byId.municipality_id == null;
      if (isProvinceScope === runIsProvince) return byId;
    }
    const pool = runs.filter((r) =>
      selectedMuni === 'all' ? r.municipality_id == null : r.municipality_id === Number(selectedMuni)
    );
    if (pool.length) {
      pool.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
      return pool[0];
    }
    return runs[0] || null;
  }, [runs, selectedRunId, selectedMuni]);

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

  const latestRunTime = useMemo(() => {
    if (!runs || runs.length === 0) return null;
    const sorted = [...runs].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    return sorted[0].created_at || null;
  }, [runs]);

  // Province-wide run (municipality_id == null) — used for demand comparison.
  // Always the NEWEST province-wide run, never an arbitrary first match.
  const provinceRun = useMemo(() => {
    const provinceWide = provinceRuns
      .filter((r) => r.municipality_id == null)
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    return provinceWide.length > 0 ? provinceWide[0] : null;
  }, [provinceRuns]);

  const provinceForecastMT = useMemo(() => {
    if (!provinceRun || provinceRun.projected_total == null) return null;
    return provinceRun.projected_total;
  }, [provinceRun]);

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

  const muniForecastProduction = useMemo(() => {
    // Per-municipality forecast production = sum of run.points where
    // is_forecast=true, from each municipality's NEWEST run. Computed from
    // the runs already fetched (provinceRuns); no extra API call needed.
    const latestByMuni = {};
    provinceRuns.forEach((r) => {
      if (r.municipality_id == null) return;
      const cur = latestByMuni[r.municipality_id];
      if (!cur || new Date(r.created_at || 0) > new Date(cur.created_at || 0)) {
        latestByMuni[r.municipality_id] = r;
      }
    });
    const out = {};
    Object.entries(latestByMuni).forEach(([mid, run]) => {
      const sum = (run.points || [])
        .filter((p) => p.is_forecast)
        .reduce((s, p) => s + (Number(p.predicted_value) || 0), 0);
      out[Number(mid)] = sum;
    });
    return out;
  }, [provinceRuns]);

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

  /* ---------------- Actions ---------------- */

  const openForecastModal = () => setShowForecastModal(true);

  const submitForecast = () => {
    setRunning(true);
    setError(null);
    const payload = {
      municipality_id: selectedMuni !== 'all' ? Number(selectedMuni) : null,
      forecast_horizon: forecastHorizon,
      notes: forecastNotes.trim() || undefined,
    };
    runForecast(payload)
      .then(() => {
        toastSuccess('Forecast has been generated.', 'Forecast complete');
        return Promise.all([
          getForecastRuns(selectedMuni !== 'all' ? { municipality_id: Number(selectedMuni) } : {}),
          getForecastRuns({}),
        ]);
      })
      .then(([runsRes, provinceRes]) => {
        setRuns(runsRes.runs || []);
        setProvinceRuns(provinceRes.runs || []);
        if (runsRes.runs && runsRes.runs.length > 0) setSelectedRunId(String(runsRes.runs[0].id));
      })
      .catch((err) => {
        const message = err.message || 'Could not run the forecast.';
        setError(message);
        toastError(message);
      })
      .finally(() => { setRunning(false); setShowForecastModal(false); });
  };

  function formatRunLabel(r) {
    // "Municipality · date (X MT)" with real characters. Falls back safely
    // when created_at or projected_total is missing — never "Invalid Date".
    const who = r.municipality_name || SCOPE_ALL_LABEL;
    const when = r.created_at
      ? new Date(r.created_at).toLocaleDateString()
      : 'date unknown';
    const amount = r.projected_total != null ? ` (${formatMT(r.projected_total)})` : '';
    return `${who} · ${when}${amount}`;
  }

  const handleRunSelect = (id) => setSelectedRunId(String(id));

  /* ---------------- Headline sentence (computed before early returns) ---------------- */

  const headlineSentence = useMemo(() => {
    if (forecastProductionMT == null) {
      return 'No forecast has been generated yet. Run a forecast to see projected production.';
    }
    let sentence = `Forecast production for the next 12 months is ${formatMT(forecastProductionMT)} MT`;
    if (demandShortfallMT != null) {
      const verb = demandShortfallMT >= 0 ? 'exceeds' : 'falls short of';
      const abs = Math.abs(demandShortfallMT);
      sentence += `, which ${verb} provincial salt demand by ${formatMT(abs)} MT`;
    }
    sentence += `. Direction: ${directionLabel(direction)}.`;
    return sentence;
  }, [forecastProductionMT, demandShortfallMT, direction]);

  const demandAssumption = useMemo(() => {
    if (demandShortfallMT == null) {
      return 'Missing demand benchmark or forecast — assumption cannot be computed.';
    }
    const covered = demandCoveredPct != null ? demandCoveredPct.toFixed(1) + '%' : 'n/a';
    if (demandShortfallMT <= 0) {
      return `Assumption: Forecast production meets or exceeds salt demand. Forecast covers ${covered} of demand. Gap = salt demand − forecast production. Source: DOST NICER / ASIN Center benchmark, 2026.`;
    }
    return `Assumption: Forecast production is below salt demand; gap = salt demand − forecast production. Forecast covers ${covered} of demand. Source: DOST NICER / ASIN Center benchmark, 2026.`;
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

  // No forecast exists for the current scope — show a clear empty state
  // instead of zeroed KPIs and blank charts.
  if (runs.length === 0) {
    return (
      <div className="admin-single-page forecast-page">
        <PageHeader
          id="admin-forecast-header"
          variant="sub"
          title="Forecast &amp; Production Outlook"
          subtitle="Chronological forecast story for the province and its municipalities."
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
            <Button variant="outline-secondary" size="sm" onClick={openForecastModal} disabled={running} className="fc-run-btn">
              {running ? <span role="status" aria-label="Running">Running…</span> : 'Run Forecast'}
            </Button>
          </div>
        </PageHeader>

        <div className="fc-empty-forecast">
          <div className="fc-empty-forecast-card">
            <span className="fc-empty-forecast-icon"><Zap size={32} strokeWidth={2} /></span>
            <h3>No forecast yet</h3>
            <p>Click <strong>Run Forecast</strong> to begin — this generates a 12-month projection from approved production records.</p>
            <Button variant="primary" size="sm" onClick={openForecastModal} disabled={running}>Run Forecast</Button>
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
              {latestRunTime ? ` · latest forecast run ${new Date(latestRunTime).toLocaleString()}` : ''}
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
          <label className="fc-filter-label" htmlFor="forecast-run-select">Forecast run</label>
          <Form.Select id="forecast-run-select" className="fc-filter-select" value={selectedRunId || ''} onChange={(e) => handleRunSelect(e.target.value)} aria-label="Forecast run">
            {!selectedRunId && <option value="">Latest run</option>}
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                {formatRunLabel(r)}
              </option>
            ))}
          </Form.Select>
          <Button variant="outline-secondary" size="sm" onClick={openForecastModal} disabled={running} className="fc-run-btn">
            {running ? <span role="status" aria-label="Running">Running…</span> : 'Run Forecast'}
          </Button>
        </div>
      </PageHeader>

      {/* ============ Tab navigation ============ */}
      <div className="fc-nav-wrap">
        <PillNav activeId={activeSection} onSelect={setActiveSection} />
      </div>

      {/* ============ A. Summary ============ */}
      <section className="fc-section" role="tabpanel" id="forecast-tabpanel-summary" aria-labelledby="forecast-tab-summary" hidden={activeSection !== 'summary'}>
        <div className="fc-section-head">
          <span className="fc-section-chip"><Boxes size={16} strokeWidth={2} /></span>
          <div>
            <h2 className="fc-section-title">{label('forecastTotalMt') || 'Forecast production'}</h2>
            <p className="fc-section-sub">{headlineSentence}</p>
          </div>
        </div>
        <KpiGrid columns={5} className="fc-kpi-strip">
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
      </section>

      {/* ============ B. Past to future ============ */}
      <section className="fc-section" role="tabpanel" id="forecast-tabpanel-trajectory" aria-labelledby="forecast-tab-trajectory" hidden={activeSection !== 'trajectory'}>
        <div className="fc-section-head">
          <span className="fc-section-chip"><ChartLine size={16} strokeWidth={2} /></span>
          <div>
            <h2 className="fc-section-title">Production trajectory</h2>
            <p className="fc-section-sub">Historical (blue) then forecast (orange) with expected-range band. "Forecast starts here" marks the boundary.</p>
          </div>
        </div>

        <ChartCard
          icon={ChartLine}
          title="Historical vs Forecast Production"
          subtitle={`${selectedMuniName} · ${chartData.length} months`}
          height={360}
          caption={
            <div className="fc-trajectory-caption">
              {hasIncompleteTail && (
                <span className="fc-incomplete-badge" title="Recent months have fewer approved records than normal — may be under-reported.">
                  Still being reported
                </span>
              )}
            </div>
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
              <TrendingUp size={12} strokeWidth={2} /> Peak forecast: {monthLabel(forecastPoints.reduce((a, b) => (b.forecast > a.forecast ? b : a)).label)} at {formatMT(Math.max(...forecastPoints.map((d) => d.forecast)))}
            </span>
            <span className="fc-annotation">
              <ArrowDownRight size={12} strokeWidth={2} /> Lowest forecast: {monthLabel(forecastPoints.reduce((a, b) => (b.forecast < a.forecast ? b : a)).label)} at {formatMT(Math.min(...forecastPoints.map((d) => d.forecast)))}
            </span>
          </div>
        )}
      </section>

      {/* ============ B2. Seasonal pattern ============ */}
      <section id="seasonal" className="fc-section" style={{ marginTop: 0 }}>
        <div className="fc-section-head">
          <span className="fc-section-chip"><CalendarDays size={16} strokeWidth={2} /></span>
          <div>
            <h2 className="fc-section-title">Seasonal pattern</h2>
            <p className="fc-section-sub">Average production per calendar month. Dry = Jan–Jun, Rainy = Jul–Dec.</p>
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
      </section>

      {/* ============ C. Demand check ============ */}
      <section className="fc-section" role="tabpanel" id="forecast-tabpanel-demand" aria-labelledby="forecast-tab-demand" hidden={activeSection !== 'demand'}>
        <div className="fc-section-head">
          <span className="fc-section-chip"><Target size={16} strokeWidth={2} /></span>
          <div>
            <h2 className="fc-section-title">Can production meet demand?</h2>
            <p className="fc-section-sub">Salt demand vs forecast production, side by side.</p>
          </div>
        </div>

        <Row className="g-3">
          <Col lg={6} md={12}>
            <Card className="fc-card h-100">
              <Card.Body className="fc-card-body">
                <div className="fc-demand-head d-flex align-items-start justify-content-between gap-3 mb-3">
                  <div>
                    <div className="fc-demand-label">{label('demandMt') || 'Salt demand'}</div>
                    <div className="fc-demand-value">
                      {demandBenchmark != null ? formatMT(demandBenchmark) : na()}
                    </div>
                    <div className="fc-demand-source">{demandSource ? `Source: DOST NICER / ASIN Center benchmark, ${demandSource.year} (${demandSource.sourceName})` : '\u2014'}</div>
                  </div>
                </div>
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
              </Card.Body>
            </Card>
          </Col>
          <Col lg={6} md={12}>
            <Card className="fc-card h-100">
              <Card.Body className="fc-card-body p-0">
                <div className="fc-stacked-bar-wrap">
                  <div className="fc-stacked-bar-label">Forecast production vs Salt demand</div>
                  <div style={{ height: 200 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={[
                          { name: 'Forecast production', value: provinceForecastMT != null ? provinceForecastMT : 0, fill: BRAND.gold },
                          { name: 'Salt demand', value: demandBenchmark != null ? demandBenchmark : 0, fill: BRAND.ocean },
                        ]}
                        layout="vertical"
                        margin={{ top: 20, right: 24, bottom: 20, left: 90 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--ui-chart-grid)" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v).toLocaleString()} MT`} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={90} />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload || payload.length === 0) return null;
                            const d = payload[0].payload;
                            return (
                              <div className="fc-tooltip">
                                <div className="fc-tooltip-label">{d.name}</div>
                                <div className="fc-tooltip-row">
                                  <span>Volume</span><b>{formatMT(d.value)} MT</b>
                                </div>
                                <div className="fc-tooltip-source">Source: forecast production = province-wide forecast run; salt demand = DOST NICER / ASIN Center benchmark, 2026.</div>
                              </div>
                            );
                          }}
                        />
                        <Bar dataKey="value" name="Volume" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                          {[
                            { fill: BRAND.gold },
                            { fill: BRAND.ocean },
                          ].map((fill, i) => (
                            <Cell key={`stack-${i}`} fill={fill.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </section>

      {/* ============ D. By municipality ============ */}
      <section className="fc-section" role="tabpanel" id="forecast-tabpanel-municipality" aria-labelledby="forecast-tab-municipality" hidden={activeSection !== 'municipality'}>
        <div className="fc-section-head">
          <span className="fc-section-chip"><List size={16} strokeWidth={2} /></span>
          <div>
            <h2 className="fc-section-title">By municipality</h2>
            <p className="fc-section-sub">Expected change, needs attention, YoY, and forecast summary for all 7 municipalities.</p>
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

      {/* ============ Forecast modal (unchanged feature) ============ */}
      <Modal show={showForecastModal} onHide={() => setShowForecastModal(false)} centered backdrop="static">
        <Modal.Header closeButton>
          <Modal.Title>Run Forecast</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Municipality scope</Form.Label>
              <Form.Select
                value={selectedMuni}
                onChange={(e) => setSelectedMuni(e.target.value)}
                disabled={running}
              >
                <option value="all">{SCOPE_ALL_LABEL}</option>
                {municipalities.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </Form.Select>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Forecast horizon (months)</Form.Label>
              <Form.Control
                type="number"
                min="1"
                max="36"
                value={forecastHorizon}
                onChange={(e) => setForecastHorizon(Math.max(1, Math.min(36, Number(e.target.value || 12))))}
                disabled={running}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Notes / context (optional)</Form.Label>
              <Form.Control as="textarea" rows={3} value={forecastNotes} onChange={(e) => setForecastNotes(e.target.value)} placeholder="Any context for this forecast run..." disabled={running} />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowForecastModal(false)} disabled={running}>Cancel</Button>
          <Button variant="primary" onClick={submitForecast} disabled={running}>
            {running ? 'Running…' : 'Run Forecast'}
          </Button>
        </Modal.Footer>
      </Modal>
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
