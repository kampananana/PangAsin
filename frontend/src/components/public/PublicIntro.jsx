// WHAT: Maikling introduksiyon tungkol sa ASIN at ang salt industry sa
//       Pangasinan — pang-unang bagay na nakikita sa public page.
// WHY: Ang bisitante ay nangangailangan ng konteksto bago ang mga numero:
//      sino ang ASIN Center, ano ang sinusukat, at saan galing ang datos.
import React, { useMemo } from 'react';
import { CalendarClock, Factory, MapPin, Layers } from 'lucide-react';

export default function PublicIntro({ municipalities = [], supplyDemand = null }) {
  // WHAT: Buod ng katotohanan mula sa live payload.
  // WHY: walang bagong request — kinukuha sa /api/public/dashboard na naka-load
  //      na ng GuestDashboard, kaya laging tugma sa mga chart sa ibaba.
  const facts = useMemo(() => {
    const beds = municipalities.reduce((sum, m) => sum + (Number(m.saltBeds) || 0), 0);
    const methods = new Set();
    municipalities.forEach((m) => {
      if (Number(m.solarProductionMT) > 0) methods.add('solar');
      if (Number(m.cookedProductionMT) > 0) methods.add('cooked');
      if (Number(m.hybridProductionMT) > 0) methods.add('hybrid');
    });
    return { producing: municipalities.length, beds, methods: methods.size };
  }, [municipalities]);

  const asOf = supplyDemand?.asOfDate ? String(supplyDemand.asOfDate) : 'latest approved records';

  return (
    <section className="public-intro" aria-labelledby="public-intro-title">
      <div className="public-intro-copy">
        <div className="public-intro-eyebrow">Salt in Pangasinan</div>
        <h2 className="public-intro-title" id="public-intro-title">
          Salt production, tracked from the salt bed to the national market.
        </h2>
        <p className="public-intro-body">
          The coastal municipalities of Pangasinan produce salt through solar evaporation and cooked
          salt works, feeding household, food-processing, industrial and agricultural demand across the
          country. The Accelerating Salt Research and Innovation (ASIN) Center at Pangasinan State
          University records, validates and publishes that production so planners, producers and the
          public work from the same numbers.
        </p>
        <p className="public-intro-body public-intro-body--muted">
          Every figure on this page comes from approved production records only, and is updated as
          records are validated.
        </p>
      </div>

      <ul className="public-intro-facts">
        <li className="public-fact">
          <span className="public-fact-icon public-fact-icon--ocean"><MapPin size={16} strokeWidth={1.75} /></span>
          <span className="public-fact-label">Salt-producing municipalities</span>
          <span className="public-fact-value">{facts.producing}</span>
        </li>
        <li className="public-fact">
          <span className="public-fact-icon public-fact-icon--green"><Factory size={16} strokeWidth={1.75} /></span>
          <span className="public-fact-label">Salt beds in operation</span>
          <span className="public-fact-value">{facts.beds.toLocaleString()}</span>
        </li>
        <li className="public-fact">
          <span className="public-fact-icon public-fact-icon--gold"><Layers size={16} strokeWidth={1.75} /></span>
          <span className="public-fact-label">Production methods tracked</span>
          <span className="public-fact-value">{facts.methods}</span>
        </li>
        <li className="public-fact">
          <span className="public-fact-icon public-fact-icon--navy"><CalendarClock size={16} strokeWidth={1.75} /></span>
          <span className="public-fact-label">Data as of</span>
          <span className="public-fact-value public-fact-value--text">{asOf}</span>
        </li>
      </ul>
    </section>
  );
}
