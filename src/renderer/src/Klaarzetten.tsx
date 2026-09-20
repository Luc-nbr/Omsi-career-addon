import type { JSX } from 'react'
import { t, type Language } from '../../shared/i18n'
import type { KaartenStand } from '../../shared/api'
import { ThemaKnop, type Thema } from './ThemaKnop'

interface Props {
  language: Language
  thema: Thema
  onThema: (thema: Thema) => void
  stand: KaartenStand
  /** Doorgaan zonder te wachten. */
  onOverslaan: () => void
}

/**
 * De laatste stap van het installeren: de kaarten klaarzetten.
 *
 * WAAROM DIT EEN EIGEN SCHERM IS
 * Een kaart uitlezen kost tot ruim twee seconden, en dat hoeft maar één keer:
 * daarna staat hij in de cache en is hij in tientallen milliseconden terug.
 * Tot nu toe gebeurde dat inlezen terwijl de speler al aan het klikken was.
 * Sinds het in een aparte thread draait hangt de app daar niet meer van, maar
 * het blijft zo dat je op een kaart moet wachten die nog niet gelezen is.
 *
 * Daarom staat het hier, één keer, met een balk erbij: wie dit laat lopen, ziet
 * daarna elke kaart meteen. En wie niet wil wachten drukt op overslaan; dan
 * gebeurt het alsnog op de achtergrond, precies zoals het ervoor ging.
 */
export function Klaarzetten({ language, thema, onThema, stand, onOverslaan }: Props): JSX.Element {
  const deel = stand.totaal > 0 ? Math.round((stand.klaar / stand.totaal) * 100) : 0
  return (
    <div className="welkom">
      <div className="welkom-talen">
        <ThemaKnop language={language} thema={thema} onThema={onThema} />
      </div>

      <div className="welkom-vel">
        <h1>{t(language, 'prepare.title')}</h1>
        <p className="welkom-intro">{t(language, 'prepare.intro')}</p>

        <span className="welkom-label">
          {t(language, 'prepare.progress', { klaar: stand.klaar, totaal: stand.totaal })}
        </span>

        {/* De balk is het hele verhaal: hoeveel is er klaar, en welke is bezig. */}
        <div
          className="klaarbalk"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={stand.totaal}
          aria-valuenow={stand.klaar}
        >
          <span className="klaarbalk-vulling" style={{ width: `${deel}%` }} />
        </div>

        <p className="welkom-pad">{stand.bezig ?? t(language, 'prepare.almost')}</p>

        <div className="welkom-knoppen">
          <button type="button" className="welkom-knop" onClick={onOverslaan}>
            {t(language, 'prepare.skip')}
          </button>
        </div>

        <p className="welkom-voet">{t(language, 'prepare.foot')}</p>
      </div>
    </div>
  )
}
