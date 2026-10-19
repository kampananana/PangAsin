// WHAT: Per-municipality rows for the contribution chart.
// WHY: the ranking, the "No data" state and the coverage label are decided
//      here, so the chart only has to draw them.

export function buildMunicipalityRows(breakdown) {
  const rows = (breakdown || []).map((r) => {
    const hasForecast = r.forecast_mt !== null && r.forecast_mt !== undefined;
    const ratio = hasForecast && r.target_share_mt > 0 ? r.forecast_mt / r.target_share_mt : null;
    return {
      id: r.municipality_id,
      name: r.name,
      hasForecast,
      forecast: r.forecast_mt,
      targetShare: r.target_share_mt,
      monthsLabel: r.months_label,
      ratio,
      above: ratio === null ? null : ratio >= 1,
    };
  });
  rows.sort((a, b) => {
    if (a.hasForecast !== b.hasForecast) return a.hasForecast ? -1 : 1;
    if (a.hasForecast && b.hasForecast && b.ratio !== a.ratio) return b.ratio - a.ratio;
    return a.name.localeCompare(b.name);
  });
  return rows;
}
