import type { JSX, ReactNode } from 'react'
import { t, type Language } from '../../shared/i18n'

interface Props {
  language: Language
  /** Is de dienst al aangenomen? Dan is opnieuw genereren niet meer aan de orde. */
  confirmed: boolean
  busy: boolean
  onRegenerate(): void
  onClose(): void
  children: ReactNode
}

/**
 * De voorgestelde dienst, over het scherm heen.
 *
 * Je drukt op genereren en krijgt er één te zien: de dienstkaart met de
 * instructies erbij. Bevalt hij niet, dan genereer je een andere; neem je hem
 * aan, dan start je hem hiervandaan. Dat is een andere volgorde dan een lijst
 * met acht diensten waaruit je maar wat kiest -- je krijgt er één toegewezen,
 * zoals op een echte remise.
 */
export function DutyProposal({
  language,
  confirmed,
  busy,
  onRegenerate,
  onClose,
  children
}: Props): JSX.Element {
  return (
    <div className="backdrop">
      <section className="dialog proposal">
        <header className="proposal-head">
          <h2>{t(language, confirmed ? 'prop.accepted' : 'prop.title')}</h2>
          <div className="proposal-actions">
            {!confirmed && (
              <button type="button" className="btn secondary" disabled={busy} onClick={onRegenerate}>
                {t(language, 'app.regenerate')}
              </button>
            )}
            <button type="button" className="btn secondary" onClick={onClose}>
              {t(language, 'prop.close')}
            </button>
          </div>
        </header>
        <p className="note proposal-intro">
          {t(language, confirmed ? 'prop.acceptedNote' : 'prop.intro')}
        </p>
        {/* De dienstkaart zelf; die kent alle panelen al. */}
        <div className="proposal-body">{children}</div>
      </section>
    </div>
  )
}
