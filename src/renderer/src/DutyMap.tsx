import { useEffect, useMemo, useState, type JSX } from 'react'
import type { MapGeometry } from '../../core/geo'
import type { Duty } from '../../core/types'

interface Props {
  duty: Duty
}

/** Rand rond de tekening, zodat een halte aan de rand niet half wegvalt. */
const PAD = 14
const VIEW_W = 640
/** Hoger dan dit wordt het kaartje een kolom; dan maar minder breed benutten. */
const VIEW_H_MAX = 360

/**
 * Waar je de bus neerzet.
 *
 * OMSI plaatst je bus waar de camera staat, dus de vraag is vooral: waar ligt de
 * eerste halte? De haltes van de hele kaart tekenen het net; daartussen springen
 * de haltes van deze dienst eruit, met het vertrekpunt als ring.
 *
 * De posities komen uit de tegels van de kaart, die 300 bij 300 meter zijn. De
 * y-as wordt omgeklapt: op de kaart loopt hij naar het noorden, op een scherm
 * naar beneden.
 */
export function DutyMap({ duty }: Props): JSX.Element | null {
  const [geometry, setGeometry] = useState<MapGeometry>()

  useEffect(() => {
    let current = true
    void window.career.geometry(duty.mapFolder).then((found) => {
      if (current) setGeometry(found)
    })
    return () => {
      current = false
    }
  }, [duty.mapFolder])

  const model = useMemo(() => {
    if (!geometry || geometry.stops.length === 0) return undefined

    const byId = new Map(geometry.stops.map((stop) => [stop.id, stop]))
    const routeIds = new Set(duty.legs.flatMap((leg) => leg.stopIds))
    const route = [...routeIds].map((id) => byId.get(id)).filter(Boolean) as MapGeometry['stops']
    const start = byId.get(duty.legs[0]?.stopIds[0] ?? '')

    // Bijsnijden op wat er te zien valt: de dienst plus wat lucht eromheen.
    const focus = route.length > 0 ? route : geometry.stops
    const pad = 600
    const minX = Math.max(0, Math.min(...focus.map((s) => s.x)) - pad)
    const maxX = Math.min(geometry.widthM, Math.max(...focus.map((s) => s.x)) + pad)
    const minY = Math.max(0, Math.min(...focus.map((s) => s.y)) - pad)
    const maxY = Math.min(geometry.heightM, Math.max(...focus.map((s) => s.y)) + pad)

    const spanX = Math.max(1, maxX - minX)
    const spanY = Math.max(1, maxY - minY)

    /*
     * Passend maken op beide assen. Alleen op breedte schalen levert bij een
     * lijn die van noord naar zuid loopt een kaartje op dat het hele venster
     * vult; dat leest niet meer als kaart.
     */
    const scale = Math.min((VIEW_W - PAD * 2) / spanX, (VIEW_H_MAX - PAD * 2) / spanY)
    const drawW = spanX * scale
    const drawH = spanY * scale
    const viewH = Math.round(drawH) + PAD * 2
    // Overgebleven ruimte gelijk verdelen, zodat de tekening gecentreerd staat.
    const offsetX = (VIEW_W - drawW) / 2

    const place = (stop: { x: number; y: number }) => ({
      cx: offsetX + (stop.x - minX) * scale,
      // Noord boven: de y-as omklappen.
      cy: viewH - PAD - (stop.y - minY) * scale
    })

    /*
     * Per rit de haltes op volgorde aan elkaar rijgen. Losse stippen lezen niet
     * als route; een lijn laat in een oogopslag zien welke kant je op rijdt.
     */
    const paths = duty.legs
      .map((leg) => {
        const points: { cx: number; cy: number }[] = []
        for (const id of leg.stopIds) {
          const stop = byId.get(id)
          if (stop) points.push(place(stop))
        }
        return points
      })
      .filter((points) => points.length > 1)

    return {
      viewH,
      scale,
      start,
      place,
      paths,
      others: geometry.stops.filter(
        (stop) => !routeIds.has(stop.id) && stop.x >= minX && stop.x <= maxX && stop.y >= minY && stop.y <= maxY
      ),
      route
    }
  }, [geometry, duty])

  if (!geometry) {
    return (
      <div className="ibis">
        <h3 className="section-title">Waar zet je de bus</h3>
        <p className="note">Kaart wordt uitgelezen…</p>
      </div>
    )
  }

  const first = duty.legs[0]
  const startName = first?.stops[0] ?? 'onbekend'

  if (!model || !model.start) {
    return (
      <div className="ibis">
        <h3 className="section-title">Waar zet je de bus</h3>
        <p className="note">
          Bij <b>{startName}</b>. Deze kaart geeft geen halteposities prijs, dus een kaartje kan
          hier niet.
        </p>
      </div>
    )
  }

  const startPoint = model.place(model.start)
  // Een streepje van 500 meter geeft de schaal zonder een legenda te hoeven zijn.
  const barPx = 500 * model.scale

  return (
    <div className="ibis">
      <h3 className="section-title">Waar zet je de bus</h3>
      <p className="note map-lead">
        Bij <b>{startName}</b> — de ring op het kaartje. Zet de camera daar neer en kies dan je bus.
      </p>
      <svg className="duty-map" viewBox={`0 0 ${VIEW_W} ${model.viewH}`} role="img" aria-label={`Kaart met ${startName} als vertrekpunt`}>
        {model.others.map((stop) => {
          const p = model.place(stop)
          return <circle key={stop.id} cx={p.cx} cy={p.cy} r={1.6} className="map-dot" />
        })}
        {model.paths.map((points, index) => (
          <polyline
            key={index}
            className="map-path"
            points={points.map((p) => `${p.cx.toFixed(1)},${p.cy.toFixed(1)}`).join(' ')}
          />
        ))}
        {model.route.map((stop) => {
          const p = model.place(stop)
          return <circle key={stop.id} cx={p.cx} cy={p.cy} r={3} className="map-route" />
        })}
        <circle cx={startPoint.cx} cy={startPoint.cy} r={9} className="map-start-ring" />
        <circle cx={startPoint.cx} cy={startPoint.cy} r={3.5} className="map-start" />
        <g className="map-scale">
          <line
            x1={PAD}
            y1={model.viewH - 6}
            x2={PAD + barPx}
            y2={model.viewH - 6}
          />
          <text x={PAD + barPx + 6} y={model.viewH - 3}>
            500 m
          </text>
        </g>
      </svg>
    </div>
  )
}
