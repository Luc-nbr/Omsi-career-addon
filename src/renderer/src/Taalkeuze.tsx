import type { JSX } from 'react'
import { LANGUAGES, type Language } from '../../shared/i18n'
import { Flag } from './Flag'
import { Versie } from './Versie'

interface Props {
  onKies: (taal: Language) => void
}

/**
 * De allereerste vraag: in welke taal lees je dit?
 *
 * WAAROM DIT VOOR ALLES KOMT
 * De app start in het Nederlands omdat er iets moet staan, en dat is een gok.
 * Alles wat daarna komt -- waar OMSI staat, hoe je chauffeur heet, wat de
 * installatie doet -- is tekst, en tekst in een taal die je niet leest is geen
 * uitleg maar ruis. Dus staat deze vraag ervoor, eenmalig.
 *
 * Geen kop in één taal erboven: wie hier staat heeft nog niets gekozen, en dan
 * is elke taal die je aanwijst een aanname. De tegels zeggen het zelf, elk in
 * de eigen taal, met de vlag erbij. Vier stuks is te overzien in één blik.
 */
export function Taalkeuze({ onKies }: Props): JSX.Element {
  return (
    <div className="welkom taalkeuze">
      <div className="welkom-vel">
        <h1>OMSI Enhancer</h1>
        <Versie klasse="welkom-versie" />
        {/* De namen van de talen zijn zelf de uitleg; zie hierboven. */}
        <p className="welkom-intro">Taal · Sprache · Language · Langue</p>

        <div className="taaltegels">
          {LANGUAGES.map((taal) => (
            <button
              key={taal.code}
              type="button"
              className="taaltegel"
              onClick={() => onKies(taal.code)}
            >
              <Flag code={taal.code} />
              <span className="taaltegel-naam">{taal.native}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
