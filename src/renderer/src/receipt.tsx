import { useEffect, useState, type JSX } from 'react'
import { createRoot } from 'react-dom/client'
import type { IbisPlan } from '../../core/ibis'
import type { Duty } from '../../core/types'
import { describeDays, formatDuration, formatTime } from '../../shared/format'
import { DEFAULT_LANGUAGE, t, type Language } from '../../shared/i18n'
import './receipt.css'

interface ReceiptData {
  duty: Duty
  ibis?: IbisPlan
  vehicle?: string
  driver: string
  printedAt: string
  /** De taal van de app; het kaartje gaat mee met wat de chauffeur leest. */
  language?: Language
}

declare global {
  interface Window {
    receipt: {
      onData(handler: (data: ReceiptData) => void): void
      ready(heightPx: number): void
    }
  }
}

/**
 * Het dienstkaartje zoals het uit de bonprinter komt.
 *
 * Alles is zwart op wit en zonder vlakken: een thermische kop maakt geen grijs,
 * die brandt punten. Vandaar ook geen omgekeerde tekst of achtergronden — die
 * kosten papierwarmte en worden vlekkerig.
 */
function Receipt(): JSX.Element | null {
  const [data, setData] = useState<ReceiptData>()

  useEffect(() => {
    window.receipt.onData(setData)
  }, [])

  useEffect(() => {
    if (!data) return
    // Pas melden als de opmaak echt staat, anders meten we een halve pagina.
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => window.receipt.ready(document.body.scrollHeight))
    )
    return () => cancelAnimationFrame(id)
  }, [data])

  if (!data) return null
  const { duty, ibis, vehicle, driver, printedAt } = data
  const language = data.language ?? DEFAULT_LANGUAGE
  const tr = (key: Parameters<typeof t>[1], vars?: Record<string, string | number>): string =>
    t(language, key, vars)
  const first = duty.legs[0]

  return (
    <div className="receipt">
      <div className="head">
        <div className="brand">OMSI CAREER</div>
        <div className="sub">{tr('receipt.sub')}</div>
      </div>

      <hr />

      <div className="line-badge">{tr('receipt.line', { line: duty.lineFile })}</div>
      <div className="times">
        {formatTime(duty.start)} – {formatTime(duty.end)}
      </div>
      <div className="meta">
        {tr('receipt.meta', {
          duration: formatDuration(duty.durationMinutes, language),
          trips: duty.legs.length,
          stops: duty.totalStops
        })}
      </div>
      <div className="meta">
        {duty.mapName} · {describeDays(duty.days)}
      </div>
      <div className="meta">{tr('receipt.signOn', { time: formatTime(duty.signOn) })}</div>

      <hr />

      <div className="section">{tr('receipt.setup')}</div>
      <div className="kv">
        <span>Line</span>
        <b>{duty.lineFile}</b>
      </div>
      <div className="kv">
        <span>Tour</span>
        <b>{duty.tourNumber}</b>
      </div>
      <div className="kv">
        <span>Trip</span>
        <b>{formatTime(first.departure)}</b>
      </div>
      <div className="kv">
        <span>First stop</span>
        <b>{first.stops[0] ?? tr('duty.unknown')}</b>
      </div>

      {ibis && ibis.line && (
        <>
          <hr />
          <div className="section">IBIS</div>
          <div className="kv">
            <span>{tr('ibis.line')}</span>
            <b>{ibis.line}</b>
          </div>
          <div className="kv">
            <span>Route</span>
            <b>{ibis.legs.find((leg) => leg.route)?.route ?? '—'}</b>
          </div>
        </>
      )}

      <hr />

      <div className="section">{tr('receipt.trips')}</div>
      {duty.legs.map((leg, index) => {
        const route = ibis?.legs[index]?.route
        return (
          <div className="leg" key={`${leg.tripFile}-${leg.departure}`}>
            <div className="leg-top">
              <span className="t">{formatTime(leg.departure)}</span>
              <span className="r">{route ?? '—'}</span>
              <span className="d">{leg.terminus}</span>
            </div>
            <div className="leg-sub">
              {tr('receipt.legSub', {
                stop: leg.stops[0] ?? tr('duty.unknown'),
                stops: leg.stops.length,
                minutes: Math.round(leg.minutes)
              })}
              {leg.layoverBefore > 0 ? tr('receipt.wait', { minutes: leg.layoverBefore }) : ''}
            </div>
          </div>
        )
      })}

      <hr />

      {vehicle && <div className="meta">{tr('receipt.bus', { bus: vehicle })}</div>}
      {ibis?.yard && <div className="meta">{tr('receipt.fleet', { yard: ibis.yard })}</div>}
      <div className="meta">{tr('receipt.driver', { driver })}</div>

      <div className="foot">
        <div>{printedAt}</div>
        <div className="wish">{tr('receipt.farewell')}</div>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Receipt />)
