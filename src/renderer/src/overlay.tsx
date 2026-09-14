import { useEffect, useState, type JSX } from 'react'
import { createRoot } from 'react-dom/client'
import type { LiveStatus } from '../../core/live'
import type { Duty, DutyLeg } from '../../core/types'
import { formatTime } from '../../shared/format'
import './overlay.css'

interface Frame {
  status?: LiveStatus
  duty?: Duty
  /** Draait OMSI met onze plugin? */
  connected: boolean
}

declare global {
  interface Window {
    overlay: { onFrame(handler: (frame: Frame) => void): void }
  }
}

function Overlay(): JSX.Element {
  const [frame, setFrame] = useState<Frame>({ connected: false })

  useEffect(() => {
    window.overlay.onFrame(setFrame)
  }, [])

  if (!frame.connected || !frame.status) {
    return (
      <div className="panel waiting">
        <span className="dot" /> Wacht op OMSI…
      </div>
    )
  }

  const { status, duty } = frame
  const late = status.delayMinutes >= 1
  const leg = status.leg

  if (status.dutyComplete) {
    return (
      <div className="panel done">
        <header>
          <span className="clock">{formatTime(status.clockMinutes)}</span>
          <span className="delay ontime">dienst uitgereden</span>
        </header>
        <div className="row">
          <span className="value">Rond de dienst af in de app</span>
          <span className="sub">
            {status.harshBrakes} keer hard geremd · {status.passengers} aan boord
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="panel">
      <header>
        <span className="clock">{formatTime(status.clockMinutes)}</span>
        {leg && <span className="line">{leg.lineNumber}</span>}
        <span className={`delay ${late ? 'late' : 'ontime'}`}>
          {late ? `+${Math.round(status.delayMinutes)} min` : 'op tijd'}
          {status.delayFromIbis ? '' : '*'}
        </span>
      </header>

      {leg && (
        <div className="row">
          <span className="label">Naar</span>
          <span className="value">{leg.terminus}</span>
          <span className="sub">
            aankomst {formatTime(leg.arrival)}
            {duty ? ` · rit ${status.legIndex + 1} van ${duty.legs.length}` : ''}
          </span>
        </div>
      )}

      {leg ? (
        <NextStops leg={leg} status={status} />
      ) : (
        <div className="row">
          <span className="label">Halte</span>
          <span className="sub">geen rit gevonden voor dit tijdstip</span>
        </div>
      )}

      <div className="grid">
        <div>
          <b>{status.passengers}</b>
          <span>aan boord</span>
        </div>
        <div>
          <b>{Math.round(status.speedKmh)}</b>
          <span>km/u</span>
        </div>
        <div className={status.hasPassengers ? `mood mood-${Math.round(status.mood * 4)}` : 'mood'}>
          <b>{status.moodLabel}</b>
          <span>stemming</span>
        </div>
      </div>

      {(status.harshBrakes > 0 || status.harshAccels > 0) && (
        <div className="counters">
          {status.harshBrakes > 0 && <span>{status.harshBrakes}× hard geremd</span>}
          {status.harshAccels > 0 && <span>{status.harshAccels}× hard opgetrokken</span>}
        </div>
      )}

      {(status.entryRequest || status.exitRequest) && (
        <div className="request">
          {status.entryRequest ? 'Iemand wil instappen' : 'Iemand wil uitstappen'}
        </div>
      )}

      {status.advice.map((item) => (
        <div key={item.id} className={`advice ${item.severity}`}>
          {item.text}
        </div>
      ))}
    </div>
  )
}

/**
 * De haltes die nog komen, als een lijndiagram.
 *
 * Waar je bent komt uit de IBIS; die vult zich pas als de lijn en route zijn
 * ingetoetst. Zolang dat niet is gebeurd staat de hele rit er gewoon, vanaf het
 * begin — dan weet je tenminste wat er aankomt.
 */
function NextStops({ leg, status }: { leg: DutyLeg; status: LiveStatus }): JSX.Element {
  const total = leg.stops.length
  const known = status.reportsStops && status.stopIndex !== undefined
  const passed = known ? Math.min(Math.max(status.stopIndex ?? 0, 0), total) : 0

  // Eentje terug geeft richting; verder vooruit past niet in de cabine.
  const from = Math.max(0, passed - 1)
  const shown = leg.stops.slice(from, from + 6)
  const left = total - (from + shown.length)

  return (
    <div className="nav">
      <div className="nav-head">
        <span className="label">Halte</span>
        {known ? (
          <span className="sub">
            nog {Math.max(0, total - passed)} van {total}
          </span>
        ) : (
          <span className="sub">
            {status.offersStops
              ? 'toets lijn en route in op de IBIS, dan volgt de kaart mee'
              : 'deze bus geeft geen halte door — dit is de hele rit'}
          </span>
        )}
      </div>

      <ol className="strip">
        {shown.map((name, index) => {
          const at = from + index
          const state = !known ? 'ahead' : at < passed ? 'done' : at === passed ? 'now' : 'ahead'
          return (
            <li key={`${at}-${name}`} className={`stop ${state}`}>
              <span className="pin" />
              <span className="name">{name}</span>
              {at === total - 1 && <span className="tag">eindpunt</span>}
            </li>
          )
        })}
      </ol>

      {left > 0 && <div className="nav-rest">en nog {left} verder naar {leg.terminus}</div>}
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Overlay />)
