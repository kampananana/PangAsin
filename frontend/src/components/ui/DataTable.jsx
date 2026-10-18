// WHAT: Shared data table for admin pages: sticky header, row hover, right-aligned
//       numbers (formatMT), search, pagination, empty/loading states.
// WHY: one table style used everywhere; replaces one-off <Table> duplicates.
import React, { useMemo, useState } from 'react';
import { Table } from 'react-bootstrap';
import { formatMT } from '../../utils/volumeFormat';

export default function DataTable({
  columns = [], // [{key, label, numeric, format = (v) => v}]
  data = [],
  loading = false,
  error = null,
  emptyMessage = 'No data available.',
  pageSize = 10,
  className = '',
}) {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');

  const searchable = (q || '').toLowerCase();
  const filtered = useMemo(() => {
    if (!searchable) return data;
    const keys = columns.map((c) => c.key);
    return data.filter((row) =>
      keys.some((k) => String(row[k] ?? '').toLowerCase().includes(searchable)),
    );
  }, [data, searchable, columns]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const start = (currentPage - 1) * pageSize;
  const pageData = filtered.slice(start, start + pageSize);

  if (loading) {
    return (
      <div className="skeleton-list" role="status" aria-label="Loading">
        <div className="skeleton-list-head" style={{ display: 'grid', gap: '12px', gridTemplateColumns: `repeat(${columns.length || 4}, 1fr)` }}>
          {columns.map((c) => <div key={c.key} className="skeleton-list-head-cell" />)}
        </div>
        {Array.from({ length: 6 }).map((_, r) => (
          <div key={r} className="skeleton-list-row" style={{ display: 'grid', gap: '12px', gridTemplateColumns: `repeat(${columns.length || 4}, 1fr)` }}>
            {columns.map((_, c) => (
              <div key={c} className="skeleton-list-cell" />
            ))}
          </div>
        ))}
      </div>
    );
  }
  if (error) {
    return <div className="text-danger text-center py-4">{error}</div>;
  }
  if (filtered.length === 0) {
    return (
      <div className="text-center py-4 text-muted">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={`admin-data-table ${className}`} role="region" aria-label="Data table">
      <div className="table-controls d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
        <label className="form-label visually-hidden">Search table</label>
        <input
          type="text"
          className="form-control form-control-sm"
          placeholder="Search…"
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
          aria-label="Search table rows"
        />
      </div>
      <Table striped hover size="sm" className="mb-0 encoder-table admin-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className="text-nowrap" style={{ textAlign: c.numeric ? 'right' : 'left' }}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pageData.map((row) => (
            <tr key={row.id ?? row.key ?? row.label ?? JSON.stringify(row)}>
              {columns.map((c) => {
                const v = row[c.key];
                const formatted = c.format ? c.format(v) : (c.numeric ? formatMT(v) : v);
                return (
                  <td key={c.key} className="text-nowrap" style={{ textAlign: c.numeric ? 'right' : 'left' }}>
                    {formatted == null || formatted === '' ? '—' : formatted}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </Table>
      {totalPages > 1 && (
        <div className="table-pagination d-flex justify-content-center align-items-center gap-2 mt-3">
          <button
            className="btn btn-sm btn-outline-secondary"
            disabled={currentPage === 1}
            onClick={() => setPage(currentPage - 1)}
            aria-label="Previous page"
          >
            Prev
          </button>
          <span className="small text-muted">
            Page {currentPage} of {totalPages}
          </span>
          <button
            className="btn btn-sm btn-outline-secondary"
            disabled={currentPage === totalPages}
            onClick={() => setPage(currentPage + 1)}
            aria-label="Next page"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
