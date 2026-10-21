import L from 'leaflet';

export function buildMapDetailCard({ name, rows }) {
  const rowsHtml = rows
    .map(
      ([label, value]) => `
        <div class="map-popup-row">
          <span class="map-popup-label">${label}</span>
          <span class="map-popup-value">${value}</span>
        </div>
      `
    )
    .join('');

  return `
    <div class="map-popup-card">
      <div class="map-popup-header">${name}</div>
      ${rowsHtml}
      <div class="map-popup-foot">Administrative summary</div>
    </div>
  `;
}

export function clampMapDetailTooltip(map, anchor, containerEl) {
  const tooltipEl = anchor.getTooltip().getElement();
  if (!tooltipEl) return;
  const w = tooltipEl.offsetWidth;
  const h = tooltipEl.offsetHeight;
  const cRect = containerEl.getBoundingClientRect();
  const eRect = tooltipEl.getBoundingClientRect();
  const margin = 6;
  const cW = cRect.width;
  const cH = cRect.height;
  const left = eRect.left - cRect.left;
  const top = eRect.top - cRect.top;
  const targetX = Math.min(Math.max(left, margin), Math.max(margin, cW - w - margin));
  const targetY = Math.min(Math.max(top, margin), Math.max(margin, cH - h - margin));
  const dx = targetX - left;
  const dy = targetY - top;
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
  const p = map.latLngToContainerPoint(anchor.getLatLng());
  anchor.setLatLng(map.containerPointToLatLng(L.point(p.x + dx, p.y + dy)));
  window.requestAnimationFrame(() => {
    if (anchor.isTooltipOpen()) anchor.openTooltip();
  });
}

/* WHAT: Huwag na payag ang mapa na "mapatay" ang detail card.
   WHY: ang card ay isang interactive Leaflet tooltip sa zero-size anchor
        marker; paglabas ng mouse sa card, ang mouseout ay bumabalik sa
        mapa at nagsasara ng tooltip (nawawala ang card pagkatapos ng
        pan + zoom). Hinahawakan dito ang 'mouseover mouseout' sa mismong
        tooltip element para hindi ito maisabog sa mapa.
   onClose: tinatawag kapag nakatuwa ang card, para ma-sync ang hover state
        (para hindi maiwanang naka-stuck ang hover tooltip suppression). */
export function protectMapDetailCard(anchor, { onClose } = {}) {
  anchor.on('tooltipopen', () => {
    const tip = anchor.getTooltip();
    const el = tip && tip.getElement();
    if (el && !el.dataset.pangAsinTooltipGuard) {
      el.dataset.pangAsinTooltipGuard = '1';
      L.DomEvent.on(el, 'mouseover mouseout', L.DomEvent.stopPropagation);
    }
  });
  if (typeof onClose === 'function') anchor.on('tooltipclose', onClose);
}