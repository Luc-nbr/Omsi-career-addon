import { useState, type JSX } from 'react'
import type { Duty } from '../../core/types'
import type { Vehicle } from '../../core/vehicles'
import type { LaunchResult } from '../../shared/api'
import { formatDuration, formatTime } from '../../shared/format'

interface Props {
  duty: Duty
  vehicle?: Vehicle
  launched?: LaunchResult
  busy: boolean
  onStart(): void
  onFinish(): void
}

/** De dienstkaart: wat de chauffeur moet rijden, rit voor rit. */
export function DutyCard({ duty, vehicle, launched, busy, onStart, onFinish }: Props): JSX.Element {
  const [openLeg, setOpenLeg] = useState<number>()

  return (
    <section className="card">
      <header className="duty-head">
        <span className="badge">{duty.lineNumbers.join(' / ')}</span>
        <div>
          <div className="duty-title">
            {duty.mapName} · omloop {duty.tourNumber}
          </div>
          <div className="duty-sub">
            {duty.depot ? `Remise ${duty.depot}` : 'Remise onbekend'} · {duty.legs.length} ritten ·{' '}
            {duty.totalStops} haltes
          </div>
        </div>
        <div className="duty-times">
          <b>
            {formatTime(duty.start)} – {formatTime(duty.end)}
          </b>
          <div className="duty-sub">
            {formatDuration(duty.durationMinutes)} · aanmelden {formatTime(duty.signOn)}
          </div>
        </div>
      </header>

      {duty.legs.map((leg, index) => (
        <div key={`${leg.tripFile}-${leg.departure}`}>
          <button
            type="button"
            className="leg"
            onClick={() => setOpenLeg(openLeg === index ? undefined : index)}
            aria-expanded={openLeg === index}
          >
            <span className="leg-time">
              {formatTime(leg.departure)} – {formatTime(leg.arrival)}
            </span>
            <span className="leg-line">{leg.lineNumber}</span>
            <span className="leg-dest">
              <b>{leg.terminus}</b>
              {/*
                Alleen het vertrekpunt tonen. De eindbestemming uit [trip] is de
                bestemmingsfilm en staat los van de haltelijst: die eindigt vaak
                op een andere naam, en OMSI heeft meerdere haltes die hetzelfde
                heten. "eerste → laatste halte" zou dus een onwaarheid zijn.
              */}
              <span>vanaf {leg.stops[0] ?? 'onbekend'}</span>
            </span>
            <span className="leg-meta">
              {leg.stops.length} haltes · {Math.round(leg.minutes)} min
            </span>
          </button>
          {openLeg === index && (
            <div className="stop-list">
              {leg.stops.map((stop, stopIndex) => (
                <span key={`${stop}-${stopIndex}`}>
                  {stopIndex > 0 && ' · '}
                  <i>{stop}</i>
                </span>
              ))}
            </div>
          )}
        </div>
      ))}

      <div className="actions">
        <button type="button" className="btn" onClick={onStart} disabled={busy || !vehicle}>
          Rijden in OMSI
        </button>
        {launched && (
          <button type="button" className="btn secondary" onClick={onFinish}>
            Dienst afronden
          </button>
        )}
        {vehicle && (
          <span className="note">
            {vehicle.manufacturer} {vehicle.type}
          </span>
        )}
      </div>

      {launched && (
        <p className="note" style={{ marginTop: 10 }}>
          {launched.vehiclePlaced ? (
            <>
              OMSI start op. Kies in het menu de situatie <b>OMSI Career</b> — bus, lijn en tijd staan
              al goed.
            </>
          ) : (
            <>
              OMSI start op de juiste kaart en tijd, maar deze kaart had nog geen situatiebestand: kies
              je bus zelf. Na deze sessie onthoudt OMSI de plek en gaat het de volgende keer vanzelf.
            </>
          )}
        </p>
      )}
    </section>
  )
}
