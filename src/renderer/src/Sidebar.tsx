import { useEffect, useState, type JSX } from 'react'
import type { CareerPayload } from '../../shared/api'
import { formatDuration, formatMoney } from '../../shared/format'
import { LANGUAGES, rankName, t, type Language } from '../../shared/i18n'
import { Flag } from './Flag'

interface Props {
  language: Language
  onLanguage(language: Language): void
  career?: CareerPayload
  onRename(name: string): void
  onSelectProfile(id: string): void
  onNewProfile(name: string): void
}

/**
 * Het versienummer, onderin de zijbalk.
 *
 * Klein en grijs, want je kijkt er nooit naar -- behalve als je een fout gaat
 * melden, en dan is het de eerste regel die gevraagd wordt.
 */
function Versie(): JSX.Element | null {
  const [versie, setVersie] = useState<string>()
  useEffect(() => {
    let staat = true
    void window.career.version().then((waarde) => {
      if (staat) setVersie(waarde)
    })
    return () => {
      staat = false
    }
  }, [])
  if (!versie) return null
  return <div className="side-version">OMSI Enhancer {versie}</div>
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
          aria-label={t(language, 'welcome.name')}
        />
        <div className="rank">{rankName(language, summary.rank)}</div>
        {summary.nextRank && (
          <>
            <div className="progress">
              <div style={{ width: `${Math.round(summary.progress * 100)}%` }} />
            </div>
            <div className="progress-label">
              {t(language, 'side.toward', {
                percent: Math.round(summary.progress * 100),
                rank: summary.nextRank ? rankName(language, summary.nextRank) : ''
              })}
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
            aria-label={t(language, 'side.otherProfile')}
          >
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {t(language, 'side.profileDuties', {
                  driver: profile.driver,
                  count: profile.duties
                })}
              </option>
            ))}
          </select>
        )}
        {adding ? (
          <input
            value={newName}
            autoFocus
            placeholder={t(language, 'welcome.name')}
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
            {t(language, 'side.newProfile')}
          </button>
        )}
      </div>

      <div className="stats">
        <div className="stat">
          <b>{summary.duties}</b>
          <span>{t(language, 'side.duties')}</span>
        </div>
        <div className="stat">
          <b>{formatDuration(summary.minutes, language)}</b>
          <span>{t(language, 'side.driven')}</span>
        </div>
        <div className="stat">
          <b>{summary.km > 0 ? `${summary.km} km` : summary.stops}</b>
          <span>{t(language, summary.km > 0 ? 'side.km' : 'side.stops')}</span>
        </div>
        <div className="stat">
          <b>{formatMoney(summary.earnings, language)}</b>
          <span>{t(language, 'side.earned')}</span>
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
        <h2 className="section-title">{t(language, 'side.log')}</h2>
        {state.entries.length === 0 ? (
          <p className="empty">{t(language, 'side.noEntries')}</p>
        ) : (
          state.entries.slice(0, 25).map((entry) => (
            <div className="log-entry" key={entry.id}>
              <b>
                {t(language, 'side.logLine', {
                  lines: entry.lineNumbers.join('/'),
                  duration: formatDuration(entry.durationMinutes, language)
                })}
              </b>
              <span>
                {entry.mapName} ·{' '}
                {entry.drivenKm !== undefined && entry.drivenKm > 0
                  ? `${entry.drivenKm.toFixed(1)} km`
                  : t(language, 'side.logStops', { count: entry.stopCount })}
                {entry.delayMinutes !== undefined
                  ? ` · ${t(language, 'side.logDelay', { minutes: entry.delayMinutes })}`
                  : ''}{' '}
                · {formatMoney(entry.pay, language)}
              </span>
            </div>
          ))
        )}
      </div>

      <Versie />
    </aside>
  )
}
