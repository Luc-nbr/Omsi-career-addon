import type { JSX } from 'react'
import type { GameMode } from '../../core/career'
import { t, type Language } from '../../shared/i18n'

interface Props {
  language: Language
  driver: string
  /** Aantal lijnen waar de chauffeur een vergunning voor heeft. */
  licences: number
  /** In welke modus de openstaande dienst is aangenomen, als er een is. */
  running?: GameMode
  onPick(mode: GameMode): void
  onBack(): void
}

const MODES: Array<{ mode: GameMode; title: 'mode.career' | 'mode.service' | 'mode.free'; intro: 'mode.careerIntro' | 'mode.serviceIntro' | 'mode.freeIntro' }> = [
  { mode: 'career', title: 'mode.career', intro: 'mode.careerIntro' },
  { mode: 'service', title: 'mode.service', intro: 'mode.serviceIntro' },
  { mode: 'free', title: 'mode.free', intro: 'mode.freeIntro' }
]

/**
 * De tweede stap: waar heb je zin in?
 *
 * De drie modi staan naast elkaar met wat ze betekenen erbij, want het verschil
 * zit niet in de knop maar in de regels erachter. Ligt er nog een dienst open,
 * dan staat dat bij de modus waar hij bij hoort -- daar kom je hem tegen.
 */
export function Modes({ language, driver, licences, running, onPick, onBack }: Props): JSX.Element {
  return (
    <div className="welcome">
      <div className="welcome-inner wide">
        <header className="welcome-head">
          <span className="welcome-mark">OMSI Career</span>
          <h1>{t(language, 'mode.title', { driver })}</h1>
          <p className="welcome-intro">{t(language, 'mode.intro')}</p>
        </header>

        <div className="mode-grid">
          {MODES.map((item) => (
            <button
              key={item.mode}
              type="button"
              className={`mode-card ${running === item.mode ? 'running' : ''}`}
              onClick={() => onPick(item.mode)}
            >
              <span className="mode-name">{t(language, item.title)}</span>
              <span className="mode-intro">{t(language, item.intro)}</span>
              <span className="mode-foot">
                {running === item.mode
                  ? t(language, 'mode.running')
                  : item.mode === 'career'
                    ? licences > 0
                      ? t(language, 'mode.licences', { count: licences })
                      : t(language, 'mode.noLicence')
                    : ''}
              </span>
            </button>
          ))}
        </div>

        <button type="button" className="btn secondary" onClick={onBack}>
          {t(language, 'mode.otherDriver')}
        </button>
      </div>
    </div>
  )
}
