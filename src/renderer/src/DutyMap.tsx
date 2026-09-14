import { useEffect, useState, type JSX } from 'react'
import type { MapGeometry } from '../../core/geo'
import type { IbisPlan } from '../../core/ibis'
import type { Duty } from '../../core/types'
import { formatTime } from '../../shared/format'
import { RouteMap } from './RouteMap'

interface Props {
  duty: Duty
  ibis?: IbisPlan
}

/**
 * Waar je de bus neerzet, en hoe de route loopt.
 *
 * OMSI plaatst je bus waar de camera staat, dus de eerste vraag is: waar ligt de
 * eerste halte? Het kaartje beantwoordt die, en achter "Bekijk route" zit de
 * hele dienst om rond te kijken voordat je wegrijdt.
 */
export function DutyMap({ duty, ibis }: Props): JSX.Element {
  const [geometry, setGeometry] = useState<MapGeometry>()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let current = true
    setGeometry(undefined)
    void window.career.geometry(duty.mapFolder).then((found) => {
      if (current) setGeometry(found)
    })
    return () => {
      current = false
    }
  }, [duty.mapFolder])

  const startName = duty.legs[0]?.stops[0] ?? 'onbekend'

  if (!geometry) {
    return (
      <div className="ibis">
        <h3 className="section-title">Waar zet je de bus</h3>
        <p className="note">Kaart wordt uitgelezen…</p>
      </div>
    )
  }

  const hasStart = geometry.stops.some((stop) => stop.id === duty.legs[0]?.stopIds[0])

  if (!hasStart) {
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

  return (
    <div className="ibis">
      <div className="map-head">
        <h3 className="section-title">Waar zet je de bus</h3>
        <button type="button" className="ghost" onClick={() => setOpen(true)}>
          Bekijk route
        </button>
      </div>
      <p className="note map-lead">
        Bij <b>{startName}</b> — het bord met de ring. Zet de camera daar neer en kies dan je bus.
      </p>
      <RouteMap duty={duty} geometry={geometry} />
      {open && (
        <RouteWindow duty={duty} ibis={ibis} geometry={geometry} onClose={() => setOpen(false)} />
      )}
    </div>
  )
}

/** De hele dienst op een grote kaart, met de haltes ernaast. */
function RouteWindow({
  duty,
  ibis,
  geometry,
  onClose
}: {
  duty: Duty
  ibis?: IbisPlan
  geometry: MapGeometry
  onClose(): void
}): JSX.Element {
  const [focus, setFocus] = useState<string>()

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const startName = duty.legs[0]?.stops[0] ?? 'onbekend'
  const firstRoute = ibis?.legs.find((leg) => leg.route)

  return (
    <div className="map-window" role="dialog" aria-modal="true" aria-label="Route bekijken">
      <div className="map-window-inner">
        <header className="map-window-head">
          <div>
            <div className="duty-title">{duty.mapName}</div>
            <div className="duty-sub">
              lijn {duty.lineNumbers.join(' & ')} · omloop {duty.tourNumber} ·{' '}
              {formatTime(duty.start)} – {formatTime(duty.end)}
            </div>
          </div>
          <button type="button" className="ghost" onClick={onClose}>
            Sluiten
          </button>
        </header>

        <div className="map-window-body">
          <RouteMap duty={duty} geometry={geometry} variant="full" focusStopId={focus} />

          <aside className="map-side">
            <div className="entry-card">
              <span className="entry-tag">Instappunt</span>
              <b className="entry-name">{startName}</b>
              <span className="note">
                Hier zet je de bus neer. Op de kaart is het het bord met de ring eromheen.
              </span>
              {firstRoute && (
                <div className="entry-ibis ibis-grid">
                  <div className="ibis-field">
                    <span>Linie</span>
                    <b>{firstRoute.lineNumber}</b>
                  </div>
                  <div className="ibis-field">
                    <span>Route</span>
                    <b>{firstRoute.route}</b>
                  </div>
                </div>
              )}
            </div>

            <div className="stop-scroll">
              {duty.legs.map((leg, index) => (
                <div key={`${leg.tripFile}-${leg.departure}`} className="stop-leg">
                  <div className="stop-leg-head">
                    <b>{formatTime(leg.departure)}</b> lijn {leg.lineNumber} → {leg.terminus}
                    {ibis?.legs[index]?.route ? (
                      <span className="stop-route">route {ibis.legs[index].route}</span>
                    ) : null}
                  </div>
                  <ol className="stop-list">
                    {leg.stops.map((name, at) => (
                      <li key={`${leg.stopIds[at]}-${at}`}>
                        <button
                          type="button"
                          className="stop-jump"
                          onClick={() => setFocus(leg.stopIds[at])}
                        >
                          {name}
                        </button>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
