import { useState, type JSX } from 'react'
import { t, type Language } from '../../shared/i18n'
import { Versie } from './Versie'

interface Props {
  language: Language
  onAanmaken: (naam: string) => void
  bezig?: boolean
}

/**
 * De tweede vraag van de eerste start: hoe heet je?
 *
 * WAAROM DIT EEN EIGEN SCHERM IS EN NIET DE CHAUFFEURSSTAP
 * De chauffeursstap hoort bij het stappenvel, en dat vel leunt op alles wat uit
 * de OMSI-map komt -- kaarten, bussen, dienstregelingen. Bij de eerste start is
 * die map nog niet eens aangewezen, dus stond de app hier op "Dienstregeling
 * inlezen..." te wachten op iets wat niet kon komen.
 *
 * Deze drie schermen zijn de deur voor de app: taal, chauffeur, waar staat
 * OMSI. Ze dragen dezelfde vorm -- één kaart midden in beeld, één vraag, geen
 * stappenbalk -- want er is telkens niets anders te doen dan antwoorden.
 */
export function Chauffeurstart({ language, onAanmaken, bezig }: Props): JSX.Element {
  const [naam, setNaam] = useState('')
  const klaar = naam.trim().length > 0

  return (
    <div className="welkom">
      <div className="welkom-vel">
        <h1>{t(language, 'welcome.title')}</h1>
        <Versie klasse="welkom-versie" />
        <p className="welkom-intro">{t(language, 'welcome.intro')}</p>

        <div className="startnaam">
          <input
            className="invoerveld"
            value={naam}
            placeholder={t(language, 'setup.driverName')}
            autoFocus
            disabled={bezig}
            onChange={(e) => setNaam(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && klaar) onAanmaken(naam.trim())
            }}
          />
        </div>

        <div className="welkom-knoppen">
          <button
            type="button"
            className="welkom-knop primair"
            disabled={!klaar || bezig}
            onClick={() => onAanmaken(naam.trim())}
          >
            {t(language, 'setup.next')}
          </button>
        </div>

        <p className="welkom-voet">{t(language, 'welcome.accountIntro')}</p>
      </div>
    </div>
  )
}
