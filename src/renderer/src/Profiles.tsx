import { useState, type JSX } from 'react'
import type { ProfileSummary } from '../../core/profiles'
import { formatDuration } from '../../shared/format'
import { LANGUAGES, t, type Language } from '../../shared/i18n'
import { Flag } from './Flag'

interface Props {
  language: Language
  onLanguage(language: Language): void
  profiles: ProfileSummary[]
  onChoose(id: string): void
  onCreate(name: string): void
}

/**
 * Het scherm waarmee de app opent: wie gaat er rijden?
 *
 * Ook met één chauffeur staat het er, en dat is opzet. Een dienst hoort bij een
 * chauffeur, dus je begint met kiezen wie je bent; daarna pas waar je zin in
 * hebt. Wie nog een dienst open heeft staan, ziet dat hier meteen.
 */
export function Profiles({ language, onLanguage, profiles, onChoose, onCreate }: Props): JSX.Element {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')

  const create = (): void => {
    if (!name.trim()) return
    onCreate(name.trim())
    setName('')
    setAdding(false)
  }

  return (
    <div className="welcome">
      <div className="welcome-inner">
        <header className="welcome-head">
          <span className="welcome-mark">OMSI Career</span>
          <h1>{t(language, 'pick.title')}</h1>
          <p className="welcome-intro">{t(language, 'pick.intro')}</p>
        </header>

        <section className="welcome-card">
          <div className="driver-grid">
            {profiles.map((profile) => (
              <button
                key={profile.id}
                type="button"
                className="driver-pick"
                onClick={() => onChoose(profile.id)}
              >
                <span className="driver-pick-name">{profile.driver}</span>
                <span className="driver-pick-meta">
                  {profile.duties === 0
                    ? t(language, 'pick.fresh')
                    : t(language, 'pick.record', {
                        count: profile.duties,
                        duration: formatDuration(profile.minutes, language)
                      })}
                </span>
                {/* Een open dienst is het eerste wat je wilt weten. */}
                {profile.onDuty && <span className="driver-pick-duty">{t(language, 'pick.onDuty')}</span>}
                <span className="driver-pick-go">{t(language, 'pick.continue')}</span>
              </button>
            ))}
          </div>

          {adding ? (
            <div className="driver-new">
              <input
                value={name}
                autoFocus
                placeholder={t(language, 'welcome.namePlaceholder')}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') create()
                  else if (event.key === 'Escape') setAdding(false)
                }}
              />
              <button type="button" className="btn" disabled={!name.trim()} onClick={create}>
                {t(language, 'pick.create')}
              </button>
              <button type="button" className="btn secondary" onClick={() => setAdding(false)}>
                {t(language, 'pick.cancel')}
              </button>
            </div>
          ) : (
            <button type="button" className="btn secondary" onClick={() => setAdding(true)}>
              {t(language, 'pick.new')}
            </button>
          )}
        </section>

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
      </div>
    </div>
  )
}
