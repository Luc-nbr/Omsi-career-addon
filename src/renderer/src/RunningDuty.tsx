import { useState, type JSX, type ReactNode } from 'react'
import type { IbisPlan } from '../../core/ibis'
import type { Duty } from '../../core/types'
import type { SessionResult } from '../../shared/api'
import { formatTime } from '../../shared/format'
import { RouteViewer } from './DutyMap'
import { useT } from './language'

interface Props {
  duty: Duty
  ibis?: IbisPlan
  /** Wat OMSI tot nu toe doorgaf; leeg zolang het spel nog niets meldt. */
  session?: SessionResult
  /** Geeft de plugin gegevens door? Dan draait het spel echt. */
  connected: boolean
  busy: boolean
  /** Een examenrit gaat naar de examencommissie, niet naar het logboek. */
  exam?: boolean
  overlayOpen: boolean
  onToggleOverlay(): void
  onCancel(): void
  onFinish(): void
  /** De hele dienstkaart, die achter "Bekijk volledige dienst" schuilgaat. */
  full: ReactNode
}

/**
 * Het scherm terwijl je rijdt.
 *
 * Zodra OMSI draait heb je geen rooster meer nodig: je zit in de bus en wilt
 * weten welke lijn en welke route je intoetst, waar je vandaan vertrekt en waar
 * je heen rijdt. Dat is de eerste rit, en verder niets. De hele dienst en de
 * routekaart staan achter een knop, want die zoek je één keer op en daarna niet
 * meer -- en annuleren en afronden horen binnen handbereik te blijven.
 */
export function RunningDuty({
  duty,
  ibis,
  session,
  connected,
  busy,
  exam,
  overlayOpen,
  onToggleOverlay,
  onCancel,
  onFinish,
  full
}: Props): JSX.Element {
  const [showFull, setShowFull] = useState(false)
  const [showRoute, setShowRoute] = useState(false)
  const tr = useT()

  const leg = duty.legs[0]
  const entry = ibis?.legs[0]
  const line = ibis?.line || leg.lineNumber

  /* Hoe het ervoor staat: eerst of het spel er is, dan pas de cijfers. */
  const delay = session?.delayMinutes
  const status = !connected
    ? tr('run.waiting')
    : tr('run.live', {
        km: (session?.drivenKm ?? 0).toFixed(1),
        delay:
          delay === undefined || Math.abs(delay) < 1
            ? tr('run.onTime')
            : delay > 0
              ? tr('run.late', { minutes: Math.round(delay) })
              : tr('run.early', { minutes: Math.round(-delay) })
      })

  return (
    <section className="card running">
      <header className="duty-head">
        <span className="badge">{line}</span>
        <div>
          <div className="duty-title">{tr('run.title')}</div>
          <div className="duty-sub">
            {tr('run.sub', { map: duty.mapName, trips: duty.legs.length })}
          </div>
        </div>
        <div className="duty-times">
          <b>
            {formatTime(leg.departure)} – {formatTime(leg.arrival)}
          </b>
          <div className="duty-sub">{tr('run.firstTrip')}</div>
        </div>
      </header>

      <div className="ibis-grid running-grid">
        <div className="ibis-field">
          <span>{tr('ibis.line')}</span>
          <b>{line || '—'}</b>
        </div>
        <div className="ibis-field">
          <span>{tr('run.route')}</span>
          <b>{entry?.route ?? '—'}</b>
        </div>
        <div className="ibis-field">
          <span>{tr('run.departs')}</span>
          <b>{formatTime(leg.departure)}</b>
        </div>
        <div className="ibis-field wide">
          <span>{tr('run.from')}</span>
          <b>{leg.stops[0] ?? tr('duty.unknown')}</b>
        </div>
        <div className="ibis-field wide">
          <span>{tr('run.towards')}</span>
          <b>{leg.terminus}</b>
        </div>
      </div>

      <p className="note running-status">
        {status}
        {' · '}
        {tr('run.stops', { stops: leg.stops.length, minutes: Math.round(leg.minutes) })}
      </p>

      <div className="actions">
        <button type="button" className="btn secondary" onClick={() => setShowFull(true)}>
          {tr('run.full')}
        </button>
        <button type="button" className="btn secondary" onClick={() => setShowRoute(true)}>
          {tr('run.viewRoute')}
        </button>
        <button type="button" className="btn secondary" onClick={onToggleOverlay}>
          {tr(overlayOpen ? 'act.overlayHide' : 'act.overlayShow')}
        </button>
        <button type="button" className="btn" onClick={onFinish} disabled={busy}>
          {tr(exam ? 'exam.finish' : 'act.finish')}
        </button>
        <button type="button" className="btn secondary running-cancel" onClick={onCancel} disabled={busy}>
          {tr('act.cancel')}
        </button>
      </div>
      <p className="note">{tr('run.note')}</p>

      {showRoute && <RouteViewer duty={duty} ibis={ibis} onClose={() => setShowRoute(false)} />}

      {showFull && (
        <div className="backdrop">
          <section className="dialog proposal">
            <header className="proposal-head">
              <h2>{tr('run.fullTitle')}</h2>
              <div className="proposal-actions">
                <button type="button" className="btn secondary" onClick={() => setShowFull(false)}>
                  {tr('prop.close')}
                </button>
              </div>
            </header>
            <div className="proposal-body">{full}</div>
          </section>
        </div>
      )}
    </section>
  )
}
