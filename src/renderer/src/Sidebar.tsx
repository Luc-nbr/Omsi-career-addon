import { useState, type JSX } from 'react'
import type { CareerState, CareerSummary } from '../../core/career'
import { formatDuration, formatMoney } from '../../shared/format'

interface Props {
  career?: { state: CareerState; summary: CareerSummary }
  onRename(name: string): void
}

/** Chauffeursprofiel, cijfers en logboek. */
export function Sidebar({ career, onRename }: Props): JSX.Element {
  const [name, setName] = useState<string>()

  if (!career) return <aside className="sidebar" />
  const { state, summary } = career

  return (
    <aside className="sidebar">
      <div>
        <input
          className="driver-name"
          value={name ?? state.driver}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => {
            if (name !== undefined && name !== state.driver) onRename(name)
            setName(undefined)
          }}
          aria-label="Naam van de chauffeur"
        />
        <div className="rank">{summary.rank}</div>
        {summary.nextRank && (
          <>
            <div className="progress">
              <div style={{ width: `${Math.round(summary.progress * 100)}%` }} />
            </div>
            <div className="progress-label">
              {Math.round(summary.progress * 100)}% op weg naar {summary.nextRank}
            </div>
          </>
        )}
      </div>

      <div className="stats">
        <div className="stat">
          <b>{summary.duties}</b>
          <span>diensten</span>
        </div>
        <div className="stat">
          <b>{formatDuration(summary.minutes)}</b>
          <span>gereden</span>
        </div>
        <div className="stat">
          <b>{summary.stops}</b>
          <span>haltes</span>
        </div>
        <div className="stat">
          <b>{formatMoney(summary.earnings)}</b>
          <span>verdiend</span>
        </div>
      </div>

      <div>
        <h2 className="section-title">Logboek</h2>
        {state.entries.length === 0 ? (
          <p className="empty">Nog geen diensten gereden.</p>
        ) : (
          state.entries.slice(0, 25).map((entry) => (
            <div className="log-entry" key={entry.id}>
              <b>
                Lijn {entry.lineNumbers.join('/')} · {formatDuration(entry.durationMinutes)}
              </b>
              <span>
                {entry.mapName} · {entry.stopCount} haltes · {formatMoney(entry.pay)}
              </span>
            </div>
          ))
        )}
      </div>
    </aside>
  )
}
