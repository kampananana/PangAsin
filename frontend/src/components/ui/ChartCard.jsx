// WHAT: Shared chart card: Card + Card.Header (icon chip + title) + ResponsiveContainer
//       + ChartCaption underneath. One consistent look for every admin chart.
// WHY: deletes one-off card/header/caption duplicates across admin pages.
import React from 'react';
import { Card } from 'react-bootstrap';
import { ResponsiveContainer } from 'recharts';
import ChartCaption from '../ChartCaption';

export default function ChartCard({
  icon: Icon,
  title,
  subtitle,
  children,
  caption,
  captionTone = 'info',
  height = 300,
  className = '',
  headerClassName = '',
}) {
  return (
    <Card className={`encoder-card h-100 ${className}`}>
      <Card.Header className={headerClassName}>
        <div className="admin-card-head d-flex align-items-center justify-content-between w-100">
          <div className="d-flex align-items-center gap-2">
            {Icon && <Icon size={16} strokeWidth={2} />}
            <h5 className="admin-card-head-title mb-0">{title}</h5>
          </div>
          {subtitle && <span className="fw-normal text-muted small ms-2">{subtitle}</span>}
        </div>
      </Card.Header>
      <Card.Body className="p-0 d-flex flex-column">
        <div style={{ height }} className="flex-fill">
          <ResponsiveContainer width="100%" height="100%">
            {children}
          </ResponsiveContainer>
        </div>
        {caption && (
          <div className="p-3 pt-2">
            <ChartCaption tone={captionTone}>{caption}</ChartCaption>
          </div>
        )}
      </Card.Body>
    </Card>
  );
}
