import { useState, type JSX } from 'react'
import { LANGUAGES, t, type Language } from '../../shared/i18n'
import { Flag } from './Flag'

interface Props {
  language: Language
  onLanguage(language: Language): void
  onCreate(name: string): Promise<void>
}

/**
 * Het eerste scherm. Er is nog geen chauffeur, dus er valt nog niets te rijden;
 * wat hier gebeurt is een taal kiezen en jezelf aanmelden.
 *
 * De taal staat boven het naamveld en niet in een instellingenscherm ergens
 * anders: wie de app opent en geen Engels leest, moet er meteen langs kunnen.
 * Het account is er een op deze computer — er is geen server om bij aan te
 * kloppen, en dat staat er ook zo bij.
 */
export function Welcome({ language, onLanguage, onCreate }: Props): JSX.Element {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const create = async (): Promise<void> => {
    if (!name.trim() || busy) return
    setBusy(true)
    try {
      await onCreate(name.trim())
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="welcome">
      <div className="welcome-inner">
        <header className="welcome-head">
          <span className="welcome-mark">OMSI Enhancer</span>
          <h1>{t(language, 'welcome.title')}</h1>
          <p className="welcome-intro">{t(language, 'welcome.intro')}</p>
        </header>

        <section className="welcome-card">
          <h2>{t(language, 'welcome.language')}</h2>
          <div className="lang-grid" role="radiogroup" aria-label={t(language, 'welcome.language')}>
            {LANGUAGES.map((option) => (
              <button
                key={option.code}
                type="button"
                role="radio"
                aria-checked={option.code === language}
                className={`lang ${option.code === language ? 'picked' : ''}`}
                onClick={() => onLanguage(option.code)}
              >
                <Flag code={option.code} />
                <span className="lang-name">{option.native}</span>
              </button>
            ))}
          </div>
          <p className="note">{t(language, 'welcome.languageNote')}</p>
        </section>

        <section className="welcome-card">
          <h2>{t(language, 'welcome.accountTitle')}</h2>
          <p className="note">{t(language, 'welcome.accountIntro')}</p>
          <label htmlFor="welcome-name">{t(language, 'welcome.name')}</label>
          <input
            id="welcome-name"
            value={name}
            autoFocus
            placeholder={t(language, 'welcome.namePlaceholder')}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void create()
            }}
          />
          <div className="actions">
            <button type="button" className="btn" disabled={!name.trim() || busy} onClick={() => void create()}>
              {busy ? t(language, 'welcome.creating') : t(language, 'welcome.create')}
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
