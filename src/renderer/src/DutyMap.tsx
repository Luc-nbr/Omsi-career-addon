import { useEffect, useState, type JSX } from 'react'
import type { MapGeometry } from '../../core/geo'
import type { IbisPlan } from '../../core/ibis'
import type { Duty } from '../../core/types'
import { formatTime } from '../../shared/format'
import { useT } from './language'
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
  const tr = useT()

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

  const startName = duty.legs[0]?.stops[0] ?? tr('duty.unknown')

  if (!geometry) {
    return (
      <div className="ibis">
        <h3 className="section-title">{tr('map.title')}</h3>
        <p className="note">{tr('map.reading')}</p>
      </div>
    )
  }

  const hasStart = geometry.stops.some((stop) => stop.id === duty.legs[0]?.stopIds[0])

  if (!hasStart) {
    return (
      <div className="ibis">
        <h3 className="section-title">{tr('map.title')}</h3>
        <p className="note">{tr('map.noPositions', { stop: startName })}</p>
      </div>
    )
  }

  return (
    <div className="ibis">
      <div className="map-head">
        <h3 className="section-title">{tr('map.title')}</h3>
        <button type="button" className="ghost" onClick={() => setOpen(true)}>
          {tr('map.view')}
        </button>
      </div>
      <p className="note map-lead">{tr('map.lead', { stop: startName })}</p>
      <div className="map-box">
        <RouteMap duty={duty} geometry={geometry} activeLeg={0} />
      </div>
      {open && (
        <RouteWindow duty={duty} ibis={ibis} geometry={geometry} onClose={() => setOpen(false)} />
      )}
    </div>
  )
}

/**
 * De grote kaart, los van de dienstkaart.
 *
 * Tijdens het rijden staat er geen dienstkaart meer op het scherm -- daar past
 * alleen de kern van de eerste rit -- maar de route wil je wel kunnen opzoeken.
 * Dit is dezelfde kaart achter een eigen knop, die zijn eigen posities ophaalt.
 */
export function RouteViewer({
  duty,
  ibis,
  onClose
}: {
  duty: Duty
  ibis?: IbisPlan
  onClose(): void
}): JSX.Element {
  const [geometry, setGeometry] = useState<MapGeometry>()
  const tr = useT()

  useEffect(() => {
    let current = true
    void window.career.geometry(duty.mapFolder).then((found) => {
      if (current) setGeometry(found)
    })
    return () => {
      current = false
    }
  }, [duty.mapFolder])

  // Het inlezen duurt even; een knop die niets lijkt te doen is erger dan wachten.
  if (!geometry) {
    return (
      <div className="backdrop">
        <section className="dialog">
          <h2>{tr('map.title')}</h2>
          <p className="note">{tr('map.reading')}</p>
          <button type="button" className="btn secondary" onClick={onClose}>
            {tr('map.close')}
          </button>
        </section>
      </div>
    )
  }
  return <RouteWindow duty={duty} ibis={ibis} geometry={geometry} onClose={onClose} />
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
  // Een dienst rijdt heen en terug; je kijkt naar een rit tegelijk.
  const [leg, setLeg] = useState(0)
  const tr = useT()

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const startName = duty.legs[0]?.stops[0] ?? tr('duty.unknown')
  const firstRoute = ibis?.legs.find((trip) => trip.route)

  return (
    <div className="map-window" role="dialog" aria-modal="true" aria-label="Route bekijken">
      <div className="map-window-inner">
        <header className="map-window-head">
          <div>
            <div className="duty-title">{duty.mapName}</div>
            <div className="duty-sub">
              {tr('map.windowSub', {
                lines: duty.lineNumbers.join(' & '),
                tour: duty.tourNumber,
                from: formatTime(duty.start),
                to: formatTime(duty.end)
              })}
            </div>
          </div>
          <button type="button" className="ghost" onClick={onClose}>
            {tr('map.close')}
          </button>
        </header>

        <div className="map-window-body">
          <RouteMap
            duty={duty}
            geometry={geometry}
            variant="full"
            focusStopId={focus}
            activeLeg={leg}
          />

          <aside className="map-side">
            <div className="entry-card">
              <span className="entry-tag">{tr('map.entry')}</span>
              <b className="entry-name">{startName}</b>
              <span className="note">{tr('map.entryNote')}</span>
              {firstRoute && (
                <div className="entry-ibis ibis-grid">
                  <div className="ibis-field">
                    <span>{tr('ibis.line')}</span>
                    <b>{firstRoute.lineNumber}</b>
                  </div>
                  <div className="ibis-field">
                    <span>{tr('map.legRoute', { route: '' }).trim()}</span>
                    <b>{firstRoute.route}</b>
                  </div>
                </div>
              )}
            </div>

            <div className="stop-scroll">
              {duty.legs.map((trip, index) => (
                <div
                  key={`${trip.tripFile}-${trip.departure}`}
                  className={`stop-leg ${index === leg ? 'stop-leg-on' : ''}`}
                >
                  <button
                    type="button"
                    className="stop-leg-head"
                    onClick={() => setLeg(index)}
                    aria-pressed={index === leg}
                  >
                    {tr('map.legHead', {
                      time: formatTime(trip.departure),
                      line: trip.lineNumber,
                      terminus: trip.terminus
                    })}
                    {ibis?.legs[index]?.route ? (
                      <span className="stop-route">
                        {tr('map.legRoute', { route: ibis.legs[index].route ?? '' })}
                      </span>
                    ) : null}
                  </button>
                  <ol className="stop-list">
                    {trip.stops.map((name, at) => (
                      <li key={`${trip.stopIds[at]}-${at}`}>
                        <button
                          type="button"
                          className="stop-jump"
                          onClick={() => {
                            setLeg(index)
                            setFocus(trip.stopIds[at])
                          }}
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
