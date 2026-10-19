// WHAT: "Environment" as stat tiles plus the reported methods.
// WHY: the old chart put "Reports" and "Salt beds" on one axis - two unrelated
//      units - and printed a literal "m\u00B2". Tiles keep each number in its
//      own unit and name the source.
import { Leaf } from 'lucide-react';
import MuniCard, { MuniChip } from './MuniCard';
import { fmtInt, fmtMT } from './muniData';

export default function MuniEnvironmentPanel({ environment }) {
  const { reports, beds, area, methods } = environment;

  return (
    <MuniCard
      icon={Leaf}
      title="Environment"
      sub="Approved environment reports for the selected municipalities"
      chips={<MuniChip label={`${fmtInt(reports)} report${reports === 1 ? '' : 's'}`} meta />}
      caption="Salt beds and area here come from approved environment reports, not from the production records."
    >
      {reports === 0 ? (
        <div className="muni-empty">
          <span className="muni-empty-chip">No data</span>
          No approved environment report for the selected municipalities.
        </div>
      ) : (
        <>
          <div className="muni-tiles">
            <div className="muni-tile">
              <span className="muni-tile-label">Reports</span>
              <span className="muni-tile-value">{fmtInt(reports)}</span>
            </div>
            <div className="muni-tile">
              <span className="muni-tile-label">Salt beds</span>
              <span className="muni-tile-value">{fmtInt(beds)}</span>
            </div>
            <div className="muni-tile">
              <span className="muni-tile-label">Production area</span>
              <span className="muni-tile-value">
                {fmtMT(area)} <span className="muni-tile-unit">m²</span>
              </span>
            </div>
          </div>
          <div className="muni-methods">
            <span className="muni-tile-label">Reported methods</span>
            <div className="muni-chips">
              {methods.length === 0 ? (
                <span className="muni-muted-sm">No method recorded on the approved reports.</span>
              ) : methods.map((m) => (
                <span key={m.method} className="muni-chip muni-chip--muted">
                  {m.method.charAt(0).toUpperCase() + m.method.slice(1)} · {fmtInt(m.count)}
                </span>
              ))}
            </div>
          </div>
        </>
      )}
    </MuniCard>
  );
}
