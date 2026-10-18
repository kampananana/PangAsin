// WHAT: Redesigned Data Quality page — reporting completeness moved here from
//       the Descriptive tab, grouped by year, with a compact heatmap grid,
//       per-municipality quality scores, and a field-issues table.
// WHY: Data quality and reporting completeness belong together; admins act on
//      both to keep forecasts accurate.
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Card, Table } from 'react-bootstrap';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import { BadgeCheck, ClipboardCheck, ClipboardList, Building2, AlertTriangle, Clock } from 'lucide-react';
import { getDataQuality } from '../../services/dataService';
import { BRAND, STATUS } from '../../theme/colors';
import KpiCard from '../ui/KpiCard';
import KpiGrid from '../ui/KpiGrid';
import PageHeader from './PageHeader';
import { SkeletonBlock, SkeletonCards } from '../Skeleton';
import ChartCaption from '../ChartCaption';
import { label, unit, definition } from '../../constants/labels';
import { formatMT } from '../../utils/volumeFormat';

const MONTH_LETTERS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const RANGE_OPTIONS = [12, 24, 36];

function scoreClass(score) {
  if (score >= 85) return 'text-success';
  if (score >= 65) return 'text-warning';
  return 'text-danger';
}

function severityBadge(score) {
  if (score >= 85) return { text: 'Good', tone: 'success' };
  if (score >= 65) return { text: 'Limited', tone: 'warning' };
  return { text: 'Poor', tone: 'danger' };
}

export default function DataQualityDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rangeMonths, setRangeMonths] = useState(36);

  // All hooks MUST be called unconditionally, before any early return.
  useEffect(() => {
    getDataQuality({ range: rangeMonths })
      .then((d) => { setData(d); setLoading(false); })
      .catch((err) => { setError(err.message); setLoading(false); });
  }, [rangeMonths]);

  // Safe defaults so hooks stay stable even when data is null.
  const safe = data || {
    overall_quality_score: 0,
    pending_validation_count: 0,
    reporting_completeness_pct: 0,
    reporting_grid: [],
    grid_labels: [],
    municipalities_missing_recent: [],
    municipalities: [],
    overall_completeness: {},
  };

  const {
    overall_quality_score,
    pending_validation_count,
    reporting_completeness_pct,
    reporting_grid,
    grid_labels,
    municipalities_missing_recent,
    municipalities,
    overall_completeness,
  } = safe;

  // Municipalities reporting = those with at least one record.
  const municipalities_reporting = (municipalities || []).length;

  // Recent 3 months from grid_labels.
  const recentLabels = grid_labels.slice(-3);
  const missingRecentCallout = municipalities_missing_recent.length > 0
    ? `${municipalities_missing_recent.join(', ')} ha${municipalities_missing_recent.length === 1 ? 's' : 've'} no approved records for ${recentLabels.length} recent month${recentLabels.length !== 1 ? 's' : ''}.`
    : null;

  // Group grid labels by year for header bands.
  const yearGroups = useMemo(() => {
    const groups = [];
    let currentYear = null;
    let startIdx = 0;
    grid_labels.forEach((lbl, i) => {
      const yr = lbl.slice(0, 4);
      if (yr !== currentYear) {
        if (currentYear !== null) {
          groups.push({ year: currentYear, start: startIdx, end: i - 1 });
        }
        currentYear = yr;
        startIdx = i;
      }
    });
    if (currentYear !== null) {
      groups.push({ year: currentYear, start: startIdx, end: grid_labels.length - 1 });
    }
    return groups;
  }, [grid_labels]);

  // Per-municipality rows sorted by lowest completeness first (backend already sorts).
  const muniRows = (reporting_grid || []).map((row) => {
    const sev = severityBadge(row.completeness_pct);
    return {
      id: row.municipality_id,
      name: row.municipality_name,
      completeness_pct: row.completeness_pct,
      missing_months: row.missing_months,
      last_reported_month: row.last_reported_month || '—',
      severity: sev,
    };
  });

  const fieldLabels = {
    production_volume_mt: 'Salt Production (MT)',
    num_salt_beds: 'Number of Salt Beds',
    area_per_salt_bed: 'Area per Salt Bed',
    registered_producers: 'Total Producers Listed',
    male_producers: 'Male Producers',
    female_producers: 'Female Producers',
    record_date: 'Date of Record',
    production_method: 'How Salt Was Made',
    barangay_id: 'Barangay / Village',
  };

  // Field completeness chart data (province-wide).
  const fieldChart = useMemo(() => {
    return Object.entries(overall_completeness || {})
      .map(([field, value]) => ({ field: fieldLabels[field] || field, value }))
      .sort((a, b) => a.value - b.value);
  }, [overall_completeness, fieldLabels]);

  // Field issues table: fields with completeness < 85%.
  const fieldIssues = useMemo(() => {
    return Object.entries(overall_completeness || {})
      .filter(([, v]) => v < 85)
      .map(([field, value]) => ({
        field: fieldLabels[field] || field,
        completeness: value,
        severity: value < 50 ? 'danger' : 'warning',
      }))
      .sort((a, b) => a.completeness - b.completeness);
  }, [overall_completeness]);

  if (loading) {
    return (
      <div className="skeleton-dashboard">
        <SkeletonBlock width="45%" height={24} />
        <SkeletonBlock width="70%" height={13} />
        <div className="mt-4"><SkeletonCards count={4} /></div>
        <SkeletonBlock width="100%" height={260} />
      </div>
    );
  }
  if (error) {
    return <Alert variant="danger">{error}</Alert>;
  }
  if (!data) return null;

  return (
    <div className="admin-single-page">
      <PageHeader
        id="admin-data-quality"
        variant="sub"
        title="Data Quality"
        subtitle="How well-filled are our records, and which months each municipality reported."
      />

      {/* Row 1: KPI strip */}
      <div className="row g-3 mb-4">
        <div className="col-md-3 col-sm-6">
          <KpiCard
            icon={BadgeCheck}
            title={label('dataSufficiency')}
            value={`${overall_quality_score}%`}
            supporting="Weighted completeness of required fields"
            info={definition('dataSufficiency')}
            tone={overall_quality_score >= 85 ? 'default' : overall_quality_score >= 65 ? 'warning' : 'danger'}
          />
        </div>
        <div className="col-md-3 col-sm-6">
          <KpiCard
            icon={Clock}
            title="Reporting completeness"
            value={`${reporting_completeness_pct}%`}
            unit={unit('coveragePct')}
            supporting={`Last ${rangeMonths} months, all municipalities`}
            info="Share of municipality-month cells that have approved records. Gaps reduce forecast accuracy."
          />
        </div>
        <div className="col-md-3 col-sm-6">
          <KpiCard
            icon={AlertTriangle}
            title="Municipalities missing recent months"
            value={municipalities_missing_recent.length}
            supporting="No approved records in the last 3 months"
            info="Municipalities with gaps in recent reporting need encoder follow-up."
          />
        </div>
        <div className="col-md-3 col-sm-6">
          <KpiCard
            icon={ClipboardCheck}
            title="Records awaiting validation"
            value={pending_validation_count}
            supporting="Pending, rejected, or returned records"
            info="Review and act on these records in the Validation Queue."
          />
        </div>
      </div>

      {/* Call-out when municipalities have missing recent months */}
      {missingRecentCallout && (
        <div className="mb-3">
          <Alert variant="warning" className="d-flex align-items-center">
            <AlertTriangle size={20} className="me-2" />
            <span>{missingRecentCallout}</span>{' '}
            <a href="/admin/validation" className="ms-auto btn btn-sm btn-outline-primary">
              Go to Validation Queue
            </a>
          </Alert>
        </div>
      )}

      {/* Row 2: Reporting completeness card (full width) */}
      <div className="row g-3 mb-4">
        <div className="col-12">
          <Card className="encoder-card h-100">
            <Card.Header className="d-flex align-items-center justify-content-between w-100">
              <div className="d-flex align-items-center gap-2">
                <ClipboardList size={16} strokeWidth={2} />
                <h5 className="admin-card-head-title mb-0">Reporting completeness</h5>
              </div>
              <div className="d-flex gap-2">
                {RANGE_OPTIONS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`btn btn-sm ${rangeMonths === n ? 'btn-primary' : 'btn-outline-secondary'}`}
                    onClick={() => setRangeMonths(n)}
                  >
                    {n} months
                  </button>
                ))}
              </div>
            </Card.Header>
            <Card.Body className="p-0">
              <div className="reporting-grid-wrapper">
                <div className="reporting-grid" style={{ '--rg-cols': (grid_labels || []).length }}>
                  {/* Sticky column header (top-left corner) */}
                  <div className="rg-cell rg-header rg-corner" />
                  {/* Year header bands */}
                  {(yearGroups || []).map((g) => (
                    <div
                      key={g.year}
                      className="rg-cell rg-year-header"
                      style={{
                        gridColumnStart: g.start + 2,
                        gridColumnEnd: g.end + 3,
                      }}
                    >
                      {g.year}
                    </div>
                  ))}
                  {/* Month letters */}
                  {(grid_labels || []).map((lbl, i) => (
                    <div key={lbl} className="rg-cell rg-month-header">
                      {MONTH_LETTERS[i % 12]}
                    </div>
                  ))}
                  {/* Municipality rows */}
                  {(muniRows || []).map((row) => (
                    <div key={row.id} className="rg-muni-row">
                      {/* Sticky municipality name cell */}
                      <div className="rg-cell rg-muni-name" title={row.name}>
                        {row.name}
                      </div>
                      {/* Month cells */}
                      {(row.months || []).map((mo, i) => {
                        const isCurrentIncomplete = i === (grid_labels || []).length - 1 && !mo.reported;
                        let cellClass = 'rg-cell rg-month-cell';
                        if (mo.reported) cellClass += ' rg-reported';
                        else if (isCurrentIncomplete) cellClass += ' rg-current-incomplete';
                        else cellClass += ' rg-missing';
                        return (
                          <div
                            key={mo.month_label}
                            className={cellClass}
                            title={`${row.name}, ${lblToDisplay(mo.month_label)}: ${mo.reported ? 'reported' : 'no approved records'}`}
                          >
                            {mo.reported ? '✓' : '—'}
                          </div>
                        );
                      })}
                      {/* Summary columns */}
                      <div className="rg-cell rg-summary">
                        <div className="rg-summary-value">{row.completeness_pct}%</div>
                        <div className="rg-summary-label">Completeness</div>
                      </div>
                      <div className="rg-cell rg-summary">
                        <div className="rg-summary-value">{row.missing_months}</div>
                        <div className="rg-summary-label">Missing</div>
                      </div>
                      <div className="rg-cell rg-summary">
                        <div className="rg-summary-value" style={{ fontSize: 11 }}>
                          {row.last_reported_month === '—' ? '—' : row.last_reported_month.slice(5, 7)}
                        </div>
                        <div className="rg-summary-label">Last</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-2">
                <span className="badge bg-success me-2">✓ Reported</span>
                <span className="badge bg-secondary me-2">— Missing</span>
                <span className="badge bg-warning text-dark">Amber outline = current incomplete month</span>
              </div>
              <ChartCaption tone="info">
                Which months each municipality had approved records. Gaps reduce forecast accuracy. Sort by lowest completeness first.
              </ChartCaption>
            </Card.Body>
          </Card>
        </div>
      </div>

      {/* Row 3: quality score per municipality (8) | field issues (4) */}
      <div className="row g-3 mb-4">
        <div className="col-lg-8">
          <Card className="encoder-card h-100">
            <Card.Header className="d-flex align-items-center justify-content-between w-100">
              <div className="d-flex align-items-center gap-2">
                <Building2 size={16} strokeWidth={2} />
                <h5 className="admin-card-head-title mb-0">Data quality score by municipality</h5>
              </div>
            </Card.Header>
            <Card.Body className="p-0">
              <div style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={muniRows}
                    layout="vertical"
                    margin={{ top: 10, right: 100, bottom: 5, left: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--gray-200)" horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={120} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || !payload.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="admin-chart-tooltip">
                            <div className="ct-label">{d.name}</div>
                            <div className="ct-row"><span className="ct-name">Quality score</span><span className="ct-value">{d.completeness_pct}%</span></div>
                          </div>
                        );
                      }}
                    />
                    <Bar
                      dataKey="completeness_pct"
                      name="Quality score"
                      radius={[0, 6, 6, 0]}
                      isAnimationActive
                    >
                      {muniRows.map((row, i) => {
                        const sev = severityBadge(row.completeness_pct);
                        return (
                          <Cell key={i} fill={sev.tone === 'success' ? BRAND.green : sev.tone === 'warning' ? BRAND.gold : STATUS.not_ready} />
                        );
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <ChartCaption tone="info">
                Per-municipality weighted data quality score, sorted lowest first. Scores below 85% need attention.
              </ChartCaption>
            </Card.Body>
          </Card>
        </div>
        <div className="col-lg-4">
          <Card className="encoder-card h-100">
            <Card.Header className="d-flex align-items-center justify-content-between w-100">
              <div className="d-flex align-items-center gap-2">
                <AlertTriangle size={16} strokeWidth={2} />
                <h5 className="admin-card-head-title mb-0">Field issues</h5>
              </div>
            </Card.Header>
            <Card.Body className="p-0">
              {fieldIssues.length === 0 ? (
                <div className="text-center text-muted py-4">
                  No fields below 85% completeness.
                </div>
              ) : (
                <Table striped hover size="sm" className="mb-0 encoder-table admin-table">
                  <thead>
                    <tr>
                      <th>Field</th>
                      <th>Completeness</th>
                      <th>Severity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fieldIssues.map((issue) => (
                      <tr key={issue.field}>
                        <td className="fw-semibold">{issue.field}</td>
                        <td>{issue.completeness}%</td>
                        <td>
                          <span className={`badge bg-${issue.severity === 'danger' ? 'danger' : 'warning'}`}>
                            {issue.severity.charAt(0).toUpperCase() + issue.severity.slice(1)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
              <ChartCaption tone="info">
                Fields province-wide with completeness below 85%. Lower completeness means less reliable data.
              </ChartCaption>
            </Card.Body>
          </Card>
        </div>
      </div>

      {/* Row 4: Field completeness chart (full width) */}
      <div className="row g-3 mb-4">
        <div className="col-12">
          <Card className="encoder-card h-100">
            <Card.Header className="d-flex align-items-center justify-content-between w-100">
              <div className="d-flex align-items-center gap-2">
                <BadgeCheck size={16} strokeWidth={2} />
                <h5 className="admin-card-head-title mb-0">Field completeness (province-wide)</h5>
              </div>
            </Card.Header>
            <Card.Body className="p-0">
              <div style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={fieldChart}
                    layout="vertical"
                    margin={{ top: 5, right: 20, bottom: 5, left: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--gray-200)" horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="field" tick={{ fontSize: 10 }} width={170} />
                    <Tooltip />
                    <Bar dataKey="value" name="% Filled In" fill={BRAND.ocean} radius={[0, 4, 4, 0]} isAnimationActive />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <ChartCaption tone="info">
                Share of records with each required field filled in, province-wide.
              </ChartCaption>
            </Card.Body>
          </Card>
        </div>
      </div>
    </div>
  );

  function lblToDisplay(ym) {
    const m = parseInt(ym.slice(5, 7), 10);
    return MONTH_NAMES[m - 1] || ym;
  }
}
