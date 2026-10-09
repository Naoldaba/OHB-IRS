'use client';

/**
 * Geographic compliance map (Phase 21). Plots each laboratory on an outline of
 * the Oromia region at its admin-managed coordinates, colored by a compliance
 * band on the shared Phase 8 report-state palette. Color is never the sole
 * carrier: every marker also shows the lab code and a full-figure tooltip, and
 * the legend is labelled. Labs without coordinates degrade gracefully — they
 * are listed below, not plotted. Nothing here is computed on the client beyond
 * choosing a band from the compliance rate the API already derived.
 *
 * Rendered as inline SVG from a committed, simplified GeoJSON outline (no map
 * tiles, no runtime dependency) so it works offline and themes with the design
 * tokens. Boundary data © geoBoundaries (CC BY 4.0), simplified.
 */

import { useMemo, useState } from 'react';
import type { LabComplianceRow } from '@/lib/types';
import oromiaGeo from '@/lib/oromia-geo.json';

/** The committed outline, narrowed from the widened JSON-import type. */
const OROMIA = oromiaGeo as unknown as {
  bbox: [number, number, number, number];
  geometry: { coordinates: number[][][][] };
};

const VIEW_W = 640;
const VIEW_H = 520;
const PAD = 28;

type BandKey = 'compliant' | 'at_risk' | 'behind' | 'none';

const BANDS: { key: BandKey; label: string; color: string }[] = [
  { key: 'compliant', label: 'Compliant (≥ 90%)', color: 'var(--state-approved)' },
  { key: 'at_risk', label: 'At risk (70–90%)', color: 'var(--state-revision)' },
  { key: 'behind', label: 'Behind (< 70%)', color: 'var(--state-overdue)' },
  { key: 'none', label: 'No expectations', color: 'var(--state-pending)' },
];
const BAND_BY_KEY = Object.fromEntries(BANDS.map((b) => [b.key, b])) as Record<
  BandKey,
  (typeof BANDS)[number]
>;

/** Pick a compliance band from the rate the API already derived (90% / 70% cutoffs). */
function bandOf(lab: LabComplianceRow): BandKey {
  if (lab.expected === 0) return 'none';
  if (lab.complianceRate >= 0.9) return 'compliant';
  if (lab.complianceRate >= 0.7) return 'at_risk';
  return 'behind';
}

const pct = (rate: number) => `${Math.round(rate * 100)}%`;

type Projected = { lab: LabComplianceRow; band: BandKey; x: number; y: number };

export function ComplianceMap({ labs }: { labs: LabComplianceRow[] }) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const bbox = OROMIA.bbox;

  // Equirectangular fit of the region's bbox into the viewBox, with an x scale
  // correction by cos(mid-latitude) so the shape is not stretched east–west.
  const project = useMemo(() => {
    const [minLon, minLat, maxLon, maxLat] = bbox;
    const midLatRad = (((minLat + maxLat) / 2) * Math.PI) / 180;
    const cosLat = Math.cos(midLatRad);
    const lonSpan = (maxLon - minLon) * cosLat;
    const latSpan = maxLat - minLat;
    const innerW = VIEW_W - PAD * 2;
    const innerH = VIEW_H - PAD * 2;
    const scale = Math.min(innerW / lonSpan, innerH / latSpan);
    const offX = PAD + (innerW - lonSpan * scale) / 2;
    const offY = PAD + (innerH - latSpan * scale) / 2;
    return (lon: number, lat: number): [number, number] => [
      offX + (lon - minLon) * cosLat * scale,
      offY + (maxLat - lat) * scale, // SVG y grows downward
    ];
  }, [bbox]);

  // The region outline as one SVG path (MultiPolygon → M…L…Z per ring).
  const outlinePath = useMemo(() => {
    const geom = OROMIA.geometry;
    return geom.coordinates
      .map((poly) =>
        poly
          .map(
            (ring) =>
              ring
                .map(([lon, lat], i) => {
                  const [x, y] = project(lon, lat);
                  return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
                })
                .join(' ') + 'Z',
          )
          .join(' '),
      )
      .join(' ');
  }, [project]);

  const plotted = useMemo<Projected[]>(() => {
    const rows = labs
      .filter((l) => l.latitude != null && l.longitude != null)
      .map((lab) => {
        const [x, y] = project(lab.longitude as number, lab.latitude as number);
        return { lab, band: bandOf(lab), x, y };
      });
    // Draw worse states last so they sit on top where markers overlap.
    const order: BandKey[] = ['none', 'compliant', 'at_risk', 'behind'];
    return rows.sort((a, b) => order.indexOf(a.band) - order.indexOf(b.band));
  }, [labs, project]);

  const unplotted = labs.filter((l) => l.latitude == null || l.longitude == null);
  const active = plotted.find((p) => p.lab.laboratoryId === activeId) ?? null;

  if (labs.length === 0) {
    return <div className="table__empty">No laboratories to map.</div>;
  }

  return (
    <>
      <div className="geomap">
        <svg
          className="geomap__svg"
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          role="img"
          aria-label="Map of Oromia laboratories colored by reporting compliance"
          preserveAspectRatio="xMidYMid meet"
        >
          <path className="geomap__region" d={outlinePath} />
          {plotted.map((p) => {
            const band = BAND_BY_KEY[p.band];
            const isActive = p.lab.laboratoryId === activeId;
            const label =
              p.lab.expected === 0
                ? `${p.lab.laboratoryName}: no expected submissions`
                : `${p.lab.laboratoryName}: ${pct(p.lab.complianceRate)} compliance, ` +
                  `${p.lab.submitted} of ${p.lab.expected} submitted, ${p.lab.overdue} overdue`;
            return (
              <g
                key={p.lab.laboratoryId}
                className={`geomap__marker${isActive ? ' is-active' : ''}`}
                tabIndex={0}
                role="img"
                aria-label={label}
                onMouseEnter={() => setActiveId(p.lab.laboratoryId)}
                onMouseLeave={() => setActiveId((id) => (id === p.lab.laboratoryId ? null : id))}
                onFocus={() => setActiveId(p.lab.laboratoryId)}
                onBlur={() => setActiveId((id) => (id === p.lab.laboratoryId ? null : id))}
              >
                <title>{label}</title>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={isActive ? 9 : 7}
                  fill={band.color}
                  stroke="var(--surface)"
                  strokeWidth={2}
                />
                <text className="geomap__code" x={p.x} y={p.y - 11} textAnchor="middle">
                  {p.lab.laboratoryCode}
                </text>
              </g>
            );
          })}
        </svg>

        <div className="geomap__active" aria-live="polite">
          {active ? (
            <>
              <span
                className="geomap__active-dot"
                style={{ background: BAND_BY_KEY[active.band].color }}
              />
              <b>{active.lab.laboratoryName}</b> — {BAND_BY_KEY[active.band].label}
              {active.lab.expected > 0 && (
                <>
                  {' · '}
                  {pct(active.lab.complianceRate)} compliance · {active.lab.submitted}/
                  {active.lab.expected} submitted · {active.lab.overdue} overdue
                </>
              )}
            </>
          ) : (
            <span className="muted">Hover or focus a laboratory marker to see its figures.</span>
          )}
        </div>
      </div>

      <div className="legend">
        {BANDS.map((b) => (
          <span className="legend__item" key={b.key}>
            <span className="legend__swatch" style={{ background: b.color }} />
            {b.label}
          </span>
        ))}
      </div>

      {unplotted.length > 0 && (
        <div className="geomap__unplotted">
          <span className="micro-label">Not plotted — no coordinates set</span>
          <div className="geomap__chips">
            {unplotted.map((l) => (
              <span className="pill pill--slate" key={l.laboratoryId} title={l.laboratoryName}>
                <span className="pill__dot" />
                {l.laboratoryCode}
              </span>
            ))}
          </div>
          <div className="text-sm muted" style={{ marginTop: 6 }}>
            Set a laboratory&apos;s latitude and longitude on the Laboratories screen to plot it.
          </div>
        </div>
      )}
    </>
  );
}
