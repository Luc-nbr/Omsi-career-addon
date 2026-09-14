import { useState, type JSX } from 'react'
import type { CareerPayload } from '../../shared/api'
import { formatDuration, formatMoney } from '../../shared/format'
import { LANGUAGES, t, type Language } from '../../shared/i18n'
import { Flag } from './Flag'

interface Props {
  language: Language
  onLanguage(language: Language): void
  career?: CareerPayload
  onRename(name: string): void
  onSelectProfile(id: string): void
  onNewProfile(name: string): void
}

/** Chauffeursprofiel, cijfers en logboek. */
export function Sidebar({
  language,
  onLanguage,
  career,
  onRename,
  onSelectProfile,
  onNewProfile
}: Props): JSX.Element {
  const [name, setName] = useState<string>()
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')

  if (!career?.state || !career.summary) return <aside className="sidebar" />
  const { state, summary, profiles } = career

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

      {/* Wisselen van chauffeur; elk profiel houdt zijn eigen logboek bij. */}
      <div>
        {profiles.length > 1 && (
          <select
            className="profile-picker"
            value={state.id ?? ''}
            onChange={(event) => onSelectProfile(event.target.value)}
            aria-label="Ander profiel"
          >
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.driver} — {profile.duties} diensten
              </option>
            ))}
          </select>
        )}
        {adding ? (
          <input
            value={newName}
            autoFocus
            placeholder="Naam van de chauffeur"
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && newName.trim()) {
                onNewProfile(newName)
                setNewName('')
                setAdding(false)
              } else if (event.key === 'Escape') {
                setAdding(false)
              }
            }}
            onBlur={() => setAdding(false)}
          />
        ) : (
          <button type="button" className="link-button" onClick={() => setAdding(true)}>
            + Nieuw profiel
          </button>
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
          <b>{summary.km > 0 ? `${summary.km} km` : summary.stops}</b>
          <span>{summary.km > 0 ? 'kilometers' : 'haltes'}</span>
        </div>
        <div className="stat">
          <b>{formatMoney(summary.earnings)}</b>
          <span>verdiend</span>
        </div>
      </div>

      <div className="lang-row" role="radiogroup" aria-label={t(language, 'welcome.language')}>
        {LANGUAGES.map((option) => (
          <button
            key={option.code}
            type="button"
            role="radio"
            aria-checked={option.code === language}
            aria-label={option.native}
            title={option.native}
            className={`lang-pick ${option.code === language ? 'picked' : ''}`}
            onClick={() => onLanguage(option.code)}
          >
            <Flag code={option.code} />
          </button>
        ))}
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
                {entry.mapName} ·{' '}
                {entry.drivenKm !== undefined && entry.drivenKm > 0
                  ? `${entry.drivenKm.toFixed(1)} km`
                  : `${entry.stopCount} haltes`}
                {entry.delayMinutes !== undefined ? ` · ${entry.delayMinutes} min vertraging` : ''} ·{' '}
                {formatMoney(entry.pay)}
              </span>
            </div>
          ))
        )}
      </div>
    </aside>
  )
}
