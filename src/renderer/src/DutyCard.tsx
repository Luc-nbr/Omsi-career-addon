import { useState, type JSX } from 'react'
import type { IbisPlan } from '../../core/ibis'
import type { Duty } from '../../core/types'
import type { Vehicle } from '../../core/vehicles'
import type { LaunchResult } from '../../shared/api'
import { formatDuration, formatTime } from '../../shared/format'

interface Props {
  duty: Duty
  ibis?: IbisPlan
  vehicle?: Vehicle
  launched?: LaunchResult
  busy: boolean
  onStart(): void
  onFinish(): void
}

/** De dienstkaart: wat de chauffeur moet rijden, rit voor rit. */
export function DutyCard({ duty, ibis, vehicle, launched, busy, onStart, onFinish }: Props): JSX.Element {
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

      <IbisPanel ibis={ibis} />

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
            <span className="leg-code" title="Bestemmingscode voor de IBIS">
              {ibis?.legs[index]?.code ?? '—'}
            </span>
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

      {launched && <LaunchNote launched={launched} />}
    </section>
  )
}

/**
 * Wat de chauffeur bij het instappen in de IBIS moet intoetsen. De codes komen
 * uit het wagenpark van deze bus en verschillen per tijdvak, dus ze horen bij
 * precies deze dienst op precies deze kaart.
 */
function IbisPanel({ ibis }: { ibis?: IbisPlan }): JSX.Element {
  if (!ibis) {
    return (
      <div className="ibis">
        <h3 className="section-title">IBIS invoeren</h3>
        <p className="note">Bestemmingscodes worden opgezocht…</p>
      </div>
    )
  }

  const first = ibis.legs.find((leg) => leg.code)
  // Bij elk keerpunt voert de chauffeur de code van de volgende rit in, dus de
  // twee terugkerende codes zijn nuttiger dan een lijst van alle ritten.
  const unique = [...new Map(ibis.legs.filter((l) => l.code).map((l) => [l.code, l])).values()]

  return (
    <div className="ibis">
      <h3 className="section-title">IBIS invoeren</h3>
      <div className="ibis-grid">
        <div className="ibis-field">
          <span>Linie</span>
          <b>{ibis.line || '—'}</b>
        </div>
        <div className="ibis-field">
          <span>Umlauf</span>
          <b>{ibis.tour || '—'}</b>
        </div>
        <div className="ibis-field">
          <span>Ziel bij vertrek</span>
          <b>{first?.code ?? '—'}</b>
        </div>
      </div>

      {unique.length > 0 && (
        <div className="ibis-codes">
          {unique.map((leg) => (
            <div className="ibis-code" key={leg.code}>
              <b>{leg.code}</b>
              <span>{leg.display ?? leg.terminus}</span>
            </div>
          ))}
        </div>
      )}

      <p className="note">
        {ibis.resolved === ibis.total ? (
          <>
            Codes uit wagenpark <b>{ibis.yard}</b>. Bij elk keerpunt voer je de code van de volgende
            rit in.
          </>
        ) : ibis.resolved > 0 ? (
          <span className="warn">
            Van {ibis.total} ritten hebben er {ibis.total - ibis.resolved} geen code in wagenpark{' '}
            {ibis.yard}. Die bestemmingen zet je met de hand op de film.
          </span>
        ) : (
          <span className="warn">
            Deze bus kent de bestemmingen van deze kaart niet. Kies een bus die bij dit wagenpark
            hoort, anders staan er alleen lege of verkeerde bestemmingen op de film.
          </span>
        )}
      </p>
    </div>
  )
}

/** Uitleg na het starten: wat de speler in OMSI nog moet doen. */
function LaunchNote({ launched }: { launched: LaunchResult }): JSX.Element {
  if (!launched.vehiclePlaced) {
    return (
      <p className="note" style={{ marginTop: 10 }}>
        OMSI start op de juiste kaart en tijd, maar deze kaart had nog geen situatiebestand: kies je
        bus zelf. Na deze sessie onthoudt OMSI de plek en gaat het de volgende keer vanzelf.
      </p>
    )
  }
  return (
    <p className="note" style={{ marginTop: 10 }}>
      {launched.startsFromMenu ? (
        <>
          OMSI start op. Laat in het startscherm <b>Load last situation on map</b> staan en druk op{' '}
          <b>Start</b> — de dienst wordt dan geladen zoals hierboven.
        </>
      ) : (
        <>
          OMSI start op. Kies in het startscherm <b>Load situation</b> en daarin <b>OMSI Career</b>.
        </>
      )}
    </p>
  )
}
