import { useEffect, useState, type JSX } from 'react'
import { createRoot } from 'react-dom/client'
import type { LiveStatus } from '../../core/live'
import type { Duty } from '../../core/types'
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

      <div className="row">
        <span className="label">Halte</span>
        <span className="value">{status.nextStop || '—'}</span>
        {!status.nextStop && <span className="sub">deze bus meldt geen halte</span>}
      </div>

      <div className="grid">
        <div>
          <b>{status.passengers}</b>
          <span>aan boord</span>
        </div>
        <div>
          <b>{Math.round(status.speedKmh)}</b>
          <span>km/u</span>
        </div>
        <div className={`mood mood-${Math.round(status.mood * 4)}`}>
          <b>{status.moodLabel}</b>
          <span>stemming*</span>
        </div>
      </div>

      {(status.entryRequest || status.exitRequest) && (
        <div className="request">
          {status.entryRequest ? 'Iemand wil instappen' : 'Iemand wil uitstappen'}
        </div>
      )}
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Overlay />)
