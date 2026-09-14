import { useCallback, useState, type JSX } from 'react'
import type { IbisPlan } from '../../core/ibis'
import type { Duty, DutyLeg } from '../../core/types'
import type { Vehicle } from '../../core/vehicles'
import type { Assignment, PrinterInfo } from '../../shared/api'
import { describeDays, formatDuration, formatTime } from '../../shared/format'
import { useLanguage, useT } from './language'
import { DutyMap } from './DutyMap'

interface Props {
  assignment: Assignment
  ibis?: IbisPlan
  vehicle?: Vehicle
  vehicleGroups: Array<[string, Vehicle[]]>
  vehicleOverride: string
  onVehicleChange(path: string): void
  busy: boolean
  /** Of de dienst al loopt: dan is de kilometerstand vastgelegd. */
  started: boolean
  overlayOpen: boolean
  onBegin(): void
  onToggleOverlay(): void
  onFinish(): void
  printers: PrinterInfo[]
  printer: string
  onPrinterChange(name: string): void
}

/** De dienstkaart: wat de chauffeur moet rijden, rit voor rit. */
export function DutyCard({
  assignment,
  ibis,
  vehicle,
  vehicleGroups,
  vehicleOverride,
  onVehicleChange,
  busy,
  started,
  overlayOpen,
  onBegin,
  onToggleOverlay,
  onFinish,
  printers,
  printer,
  onPrinterChange
}: Props): JSX.Element {
  const [openLeg, setOpenLeg] = useState<number>()
  const language = useLanguage()
  const tr = useT()
  const { duty } = assignment

  return (
    <section className="card">
      <header className="duty-head">
        <span className="badge">{duty.lineFile}</span>
        <div>
          <div className="duty-title">{duty.mapName}</div>
          <div className="duty-sub">
            {tr('duty.head', {
              days: describeDays(duty.days, language),
              trips: duty.legs.length,
              stops: duty.totalStops,
              depot: duty.depot
                ? tr('duty.depot', { name: duty.depot })
                : tr('duty.depotUnknown')
            })}
          </div>
        </div>
        <div className="duty-times">
          <b>
            {formatTime(duty.start)} – {formatTime(duty.end)}
          </b>
          <div className="duty-sub">
            {tr('duty.signOn', {
              duration: formatDuration(duty.durationMinutes, language),
              time: formatTime(duty.signOn)
            })}
          </div>
        </div>
      </header>

      <SelectPanel duty={duty} />

      <DutyMap duty={duty} ibis={ibis} />

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
            <span className="leg-code" title={tr('duty.routeNumber')}>
              {ibis?.legs[index]?.route ?? '—'}
            </span>
            <span className="leg-dest">
              <b>{leg.terminus}</b>
              {/*
                Alleen het vertrekpunt tonen. De eindbestemming uit [trip] is de
                bestemmingsfilm en staat los van de haltelijst: die eindigt vaak
                op een andere naam, en OMSI heeft meerdere haltes die hetzelfde
                heten. "eerste → laatste halte" zou dus een onwaarheid zijn.
              */}
              <span>{tr('duty.from', { stop: leg.stops[0] ?? tr('duty.unknown') })}</span>
            </span>
            <span className="leg-meta">
              {tr('duty.legMeta', {
                stops: leg.stops.length,
                minutes: Math.round(leg.minutes)
              })}
            </span>
          </button>
          {openLeg === index && (
            <LegDetail leg={leg} index={index} ibis={ibis} />
          )}
        </div>
      ))}

      <div className="actions">
        {!started ? (
          <button type="button" className="btn" onClick={onBegin} disabled={busy || !vehicle}>
            {tr('act.start')}
          </button>
        ) : (
          <button type="button" className="btn" onClick={onFinish} disabled={busy}>
            {tr('act.finish')}
          </button>
        )}
        {/* Ook voor het starten bruikbaar, om de overlay alvast neer te zetten. */}
        <button type="button" className="btn secondary" onClick={onToggleOverlay}>
          {tr(overlayOpen ? 'act.overlayHide' : 'act.overlayShow')}
        </button>
        {overlayOpen && (
          <button
            type="button"
            className="btn secondary"
            onClick={() => void window.career.editOverlay(true)}
          >
            {tr('act.overlayEdit')}
          </button>
        )}
        <span className="note">
          {tr(
            started ? 'act.startedNote' : overlayOpen ? 'act.overlayNote' : 'act.loadNote'
          )}
        </span>
      </div>

      <PrintPanel
        duty={duty}
        ibis={ibis}
        vehicle={vehicle ? `${vehicle.manufacturer} ${vehicle.type}` : undefined}
        printers={printers}
        printer={printer}
        onPrinterChange={onPrinterChange}
      />
    </section>
  )
}

/**
 * Het dienstkaartje op papier.
 *
 * Een bonprinter van 80 mm is hier het doel; er wordt via het Windows-
 * stuurprogramma afgedrukt, dus elke printer die Windows kent werkt. Het
 * voorbeeld opent hetzelfde kaartje in een venster, zodat je het kunt bekijken
 * zonder papier te verbranden.
 */
function PrintPanel({
  duty,
  ibis,
  vehicle,
  printers,
  printer,
  onPrinterChange
}: {
  duty: Duty
  ibis?: IbisPlan
  vehicle?: string
  printers: PrinterInfo[]
  printer: string
  onPrinterChange(name: string): void
}): JSX.Element {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string>()
  const language = useLanguage()
  const tr = useT()

  const run = useCallback(
    async (preview: boolean) => {
      setBusy(true)
      setNote(undefined)
      try {
        const payload = { duty, ibis, vehicle, language }
        const result = preview
          ? await window.career.previewReceipt(payload)
          : await window.career.printReceipt(payload, printer || undefined)
        if (!result.ok) setNote(result.reason ?? tr('print.failed'))
        else if (!preview) setNote(tr('print.done'))
      } finally {
        setBusy(false)
      }
    },
    [duty, ibis, vehicle, printer, language, tr]
  )

  return (
    <div className="ibis print-panel">
      <h3 className="section-title">{tr('print.title')}</h3>
      <div className="print-row">
        <select
          value={printer}
          onChange={(event) => onPrinterChange(event.target.value)}
          aria-label={tr('print.printer')}
        >
          {printers.length === 0 && <option value="">{tr('print.noPrinter')}</option>}
          {printers.map((item) => (
            <option key={item.name} value={item.name}>
              {item.displayName}
              {item.isDefault ? tr('print.default') : ''}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn"
          disabled={busy || printers.length === 0}
          onClick={() => void run(false)}
        >
          {tr('print.print')}
        </button>
        <button type="button" className="btn secondary" disabled={busy} onClick={() => void run(true)}>
          {tr('print.preview')}
        </button>
      </div>
      <p className="note">
        {note ?? tr('print.note')}
      </p>
    </div>
  )
}

/**
 * Hoe je deze dienst in OMSI instelt.
 *
 * Het menu heet Set Time Table en werkt in die volgorde: eerst een Line, dan
 * een Tour daarbinnen, dan de Trip waarmee je begint. "Line" is het lijnbestand
 * van de kaart — op Berlin-Spandau heet dat gewoon 54, op Thueringer Wald
 * KI-OVF. Het lijnnummer uit de rit (8343) staat niet in dat lijstje, dus daar
 * zoek je je blind op.
 */
function SelectPanel({ duty }: { duty: Duty }): JSX.Element {
  const tr = useT()
  const first = duty.legs[0]
  return (
    <div className="ibis select-panel">
      <h3 className="section-title">{tr('select.title')}</h3>
      <div className="ibis-grid">
        <div className="ibis-field">
          <span>Line</span>
          <b>{duty.lineFile}</b>
        </div>
        <div className="ibis-field">
          <span>Tour</span>
          <b>{duty.tourNumber}</b>
        </div>
        <div className="ibis-field">
          <span>Trip</span>
          <b>{formatTime(first.departure)}</b>
        </div>
        <div className="ibis-field wide">
          <span>First stop</span>
          <b>{first.stops[0] ?? tr('duty.unknown')}</b>
        </div>
      </div>
      <p className="note">
        {tr('select.howto', {
          line: duty.lineFile,
          tour: duty.tourNumber,
          time: formatTime(first.departure),
          terminus: first.terminus,
          stop: first.stops[0] ?? tr('duty.unknown')
        })}
      </p>
    </div>
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
  const tr = useT()
  const entry = ibis?.legs[index]
  const route = entry?.route
  const film = entry?.display

  return (
    <div className="leg-detail">
      <ol className="instructions">
        {leg.layoverBefore > 0 && (
          <li>
            {tr('leg.layover', {
              minutes: leg.layoverBefore,
              stop: leg.stops[0] ?? tr('duty.unknown'),
              time: formatTime(leg.departure)
            })}
          </li>
        )}
        <li>
          {route
            ? tr('leg.ibis', {
                line: leg.lineNumber,
                route,
                extra:
                  (entry?.routeName ? ` (${entry.routeName})` : '') +
                  (film ? tr('leg.blind', { text: film }) : '')
              })
            : tr('leg.ibisNoRoute', { line: leg.lineNumber, terminus: leg.terminus })}
        </li>
        <li>
          {tr('leg.driveTo', {
            terminus: leg.terminus,
            stops: leg.stops.length,
            minutes: Math.round(leg.minutes),
            time: formatTime(leg.arrival)
          })}
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
  const tr = useT()
  const auto = assignment.vehicle
  const yard = assignment.yard ? tr('bus.yard', { yard: assignment.yard }) : ''

  return (
    <div className="bus-panel">
      <div>
        <h3 className="section-title">{tr('bus.title')}</h3>
        <div className="bus-name">
          {vehicle ? `${vehicle.manufacturer} ${vehicle.type}` : tr('bus.none')}
        </div>
        <p className="note">
          {!auto ? (
            <span className="warn">{tr('bus.noneNote')}</span>
          ) : vehicleOverride ? (
            tr('bus.chosenSelf', { bus: `${auto.manufacturer} ${auto.type}` })
          ) : (
            tr(assignment.fromMapFleet ? 'bus.chosenFleet' : 'bus.chosenOutside', {
              count: assignment.alternatives ?? 1,
              yard
            })
          )}
        </p>
      </div>
      <div className="bus-picker">
        <label htmlFor="bus">{tr('bus.other')}</label>
        <select id="bus" value={vehicleOverride} onChange={(event) => onVehicleChange(event.target.value)}>
          <option value="">
            {tr('bus.auto')}
            {auto ? ` (${auto.manufacturer} ${auto.type})` : ''}
          </option>
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
  const tr = useT()
  if (!ibis) {
    return (
      <div className="ibis">
        <h3 className="section-title">{tr('ibis.title')}</h3>
        <p className="note">{tr('ibis.looking')}</p>
      </div>
    )
  }

  const first = ibis.legs.find((leg) => leg.route)
  // Bij elk keerpunt toets je de route van de volgende rit in; de terugkerende
  // routes zijn nuttiger dan een regel per rit.
  const unique = [...new Map(ibis.legs.filter((l) => l.route).map((l) => [l.route, l])).values()]

  return (
    <div className="ibis">
      <h3 className="section-title">{tr('ibis.title')}</h3>
      <div className="ibis-grid">
        <div className="ibis-field">
          <span>{tr('ibis.line')}</span>
          <b>{ibis.line || '—'}</b>
        </div>
        <div className="ibis-field">
          <span>{tr('ibis.routeAtStart')}</span>
          <b>{first?.route ?? '—'}</b>
        </div>
      </div>

      {unique.length > 0 && (
        <div className="ibis-codes">
          {unique.map((leg) => (
            <div className="ibis-code" key={leg.route}>
              <b>{leg.route}</b>
              <span>
                {leg.routeName || leg.terminus}
                {leg.display ? ` · ${tr('ibis.film', { text: leg.display })}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}

      <p className="note">
        {ibis.resolved === ibis.total ? (
          tr('ibis.allResolved', { yard: ibis.yard ?? '' })
        ) : ibis.resolved > 0 ? (
          <span className="warn">
            {tr('ibis.someMissing', {
              total: ibis.total,
              missing: ibis.total - ibis.resolved,
              yard: ibis.yard ?? ''
            })}
          </span>
        ) : ibis.hasRoutes ? (
          <span className="warn">{tr('ibis.noRoutes')}</span>
        ) : (
          <span className="warn">{tr('ibis.noTable')}</span>
        )}
      </p>
    </div>
  )
}
