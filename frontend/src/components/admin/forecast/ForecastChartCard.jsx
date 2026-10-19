// WHAT: Shared card shell for every chart on the Forecasting page.
// WHY: one header pattern (icon + title left, small chips right), one chart
//      height rule and one muted caption line for all four charts.
import { Card } from 'react-bootstrap';

export function ChartChip({ label, color, dashed = false, meta = false }) {
  if (meta) {
    return <span className="fc-chip fc-chip--meta">{label}</span>;
  }
  const style = dashed
    ? { borderColor: color, backgroundColor: 'transparent' }
    : { backgroundColor: color, borderColor: color };
  return (
    <span className="fc-chip">
      <span className={`fc-chip-swatch${dashed ? ' fc-chip-swatch--dashed' : ''}`} style={style} />
      {label}
    </span>
  );
}

export default function ForecastChartCard({
  icon: Icon,
  title,
  subtitle,
  chips,
  children,
  caption,
  height = 320,
  className = '',
}) {
  return (
    <Card className={`fc-card ${className}`}>
      <Card.Header className="fc-card-head">
        <div className="fc-card-head-left">
          {Icon && (
            <span className="fc-card-head-icon">
              <Icon size={16} strokeWidth={1.75} />
            </span>
          )}
          <div className="fc-card-head-text">
            <h5 className="fc-card-title">{title}</h5>
            {subtitle && <p className="fc-card-sub">{subtitle}</p>}
          </div>
        </div>
        {chips ? <div className="fc-card-head-right">{chips}</div> : null}
      </Card.Header>
      <Card.Body className="fc-card-body">
        <div className="fc-chart" style={{ height }}>
          {children}
        </div>
        {caption && <p className="fc-chart-caption">{caption}</p>}
      </Card.Body>
    </Card>
  );
}
