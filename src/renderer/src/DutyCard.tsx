import { useState, type JSX } from 'react'
import type { IbisPlan } from '../../core/ibis'
import type { DutyLeg } from '../../core/types'
import type { Vehicle } from '../../core/vehicles'
import type { Assignment, LaunchResult } from '../../shared/api'
import { describeDays, formatDuration, formatTime } from '../../shared/format'

interface Props {
  assignment: Assignment
  ibis?: IbisPlan
  vehicle?: Vehicle
  vehicleGroups: Array<[string, Vehicle[]]>
  vehicleOverride: string
  onVehicleChange(path: string): void
  launched?: LaunchResult
  busy: boolean
  onStart(): void
  onFinish(): void
}

/** De dienstkaart: wat de chauffeur moet rijden, rit voor rit. */
export function DutyCard({
  assignment,
  ibis,
  vehicle,
  vehicleGroups,
  vehicleOverride,
  onVehicleChange,
  launched,
  busy,
  onStart,
  onFinish
}: Props): JSX.Element {
  const [openLeg, setOpenLeg] = useState<number>()
  const { duty } = assignment

  return (
    <section className="card">
      <header className="duty-head">
        <span className="badge">{duty.lineNumbers.join(' / ')}</span>
        <div>
          <div className="duty-title">{duty.mapName}</div>
          <div className="duty-sub">
            {describeDays(duty.days)} · {duty.legs.length} ritten · {duty.totalStops} haltes ·{' '}
            {duty.depot ? `remise ${duty.depot}` : 'remise onbekend'}
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

      <BusPanel
        assignment={assignment}
        vehicle={vehicle}
        vehicleGroups={vehicleGroups}
        vehicleOverride={vehicleOverride}
        onVehicleChange={onVehicleChange}
      />

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
            <LegDetail leg={leg} index={index} ibis={ibis} />
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
      </div>

      {launched && <LaunchNote launched={launched} />}
    </section>
  )
}

/** Instructies voor één rit: wat instellen, waar rijden, wat daarna. */
function LegDetail({
  leg,
  index,
  ibis
}: {
  leg: DutyLeg
  index: number
  ibis?: IbisPlan
}): JSX.Element {
  const code = ibis?.legs[index]?.code
  const film = ibis?.legs[index]?.display

  return (
    <div className="leg-detail">
      <ol className="instructions">
        {leg.layoverBefore > 0 && (
          <li>
            Je staat {leg.layoverBefore} minuten stil op {leg.stops[0] ?? 'het eindpunt'}. Vertrek om{' '}
            <b>{formatTime(leg.departure)}</b>.
          </li>
        )}
        <li>
          Zet de IBIS op lijn <b>{leg.lineNumber}</b>
          {code ? (
            <>
              {' '}
              en bestemming <b>{code}</b>
              {film ? ` — op de film verschijnt “${film}”` : ''}.
            </>
          ) : (
            <> — deze bus heeft geen code voor {leg.terminus}, zet de film met de hand.</>
          )}
        </li>
        <li>
          Rijd naar <b>{leg.terminus}</b>: {leg.stops.length} haltes in {Math.round(leg.minutes)}{' '}
          minuten, aankomst <b>{formatTime(leg.arrival)}</b>.
        </li>
      </ol>
      <div className="stop-list">
        {leg.stops.map((stop, stopIndex) => (
          <span key={`${stop}-${stopIndex}`}>
            {stopIndex > 0 && ' · '}
            <i>{stop}</i>
          </span>
        ))}
      </div>
    </div>
  )
}

/** De bus die bij de dienst gezocht is, met de mogelijkheid hem te wisselen. */
function BusPanel({
  assignment,
  vehicle,
  vehicleGroups,
  vehicleOverride,
  onVehicleChange
}: {
  assignment: Assignment
  vehicle?: Vehicle
  vehicleGroups: Array<[string, Vehicle[]]>
  vehicleOverride: string
  onVehicleChange(path: string): void
}): JSX.Element {
  const auto = assignment.vehicle

  return (
    <div className="bus-panel">
      <div>
        <h3 className="section-title">Toegewezen bus</h3>
        <div className="bus-name">
          {vehicle ? `${vehicle.manufacturer} ${vehicle.type}` : 'Geen passende bus gevonden'}
        </div>
        <p className="note">
          {!auto ? (
            <span className="warn">
              Geen enkele geïnstalleerde bus kent de eindbestemmingen van deze dienst. Kies er zelf
              een; de bestemmingsfilms blijven dan mogelijk leeg.
            </span>
          ) : vehicleOverride ? (
            <>
              Zelf gekozen. De app stelde {auto.manufacturer} {auto.type} voor.
            </>
          ) : (
            <>
              Gekozen uit {assignment.alternatives ?? 1} passende bussen
              {assignment.fromMapFleet
                ? ' uit het wagenpark van de kaart'
                : ' — geen ervan staat in het wagenpark van de kaart'}
              {assignment.yard ? `, wagenpark ${assignment.yard}` : ''}.
            </>
          )}
        </p>
      </div>
      <div className="bus-picker">
        <label htmlFor="bus">Andere bus</label>
        <select id="bus" value={vehicleOverride} onChange={(event) => onVehicleChange(event.target.value)}>
          <option value="">Automatisch{auto ? ` (${auto.manufacturer} ${auto.type})` : ''}</option>
          {vehicleGroups.map(([folder, items]) => (
            <optgroup key={folder} label={folder}>
              {items.map((item) => (
                <option key={item.relativePath} value={item.relativePath}>
                  {item.manufacturer} {item.type}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
    </div>
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
  // terugkerende codes zijn nuttiger dan een lijst van alle ritten.
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
