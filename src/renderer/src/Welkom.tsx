import type { JSX } from 'react'
import { LANGUAGES, t, type Language } from '../../shared/i18n'
import { Flag } from './Flag'
import type { OmsiState } from '../../shared/api'
import { ThemaKnop, type Thema } from './ThemaKnop'
import { Versie } from './Versie'

interface Props {
  language: Language
  onLanguage: (language: Language) => void
  thema: Thema
  onThema: (thema: Thema) => void
  omsi: OmsiState
  bezig: boolean
  /** De gevonden map vastleggen als de juiste. */
  onBevestig: () => void
  /** Zelf een map aanwijzen. */
  onKiezen: () => void
}

/**
 * Het eerste dat iemand van deze app ziet.
 *
 * WAAROM DIT EEN EIGEN SCHERM IS
 * Alles wat de app doet hangt aan één map: de kaarten, de bussen, de
 * dienstregelingen, het spel zelf starten. De app zoekt die map op de plekken
 * die we kennen -- Steam via het register, zijn bibliotheken, en de handvol
 * paden waar de doosversie pleegt te staan -- en heeft het meestal bij het
 * rechte eind. Maar er zijn te veel installaties denkbaar om erop te gokken:
 * Steam op een tweede schijf, twee kopieën naast elkaar, een map die iemand
 * zelf ergens heeft neergezet. Wie stil de verkeerde krijgt, merkt dat pas als
 * er kaarten ontbreken die er wel degelijk staan.
 *
 * Dus vraagt de app het eenmaal, en daarna weet hij het in plaats van dat hij
 * het denkt.
 *
 * Het staat midden op het scherm en niet in het stappenvel van de rest: dit is
 * geen stap in het klaarzetten van een dienst maar de deur ervoor. De knoppen
 * staan daarom ook onder de vraag en niet rechtsonder in beeld -- er is hier
 * niets anders te doen dan antwoorden.
 */
export function Welkom({
  language,
  onLanguage,
  thema,
  onThema,
  omsi,
  bezig,
  onBevestig,
  onKiezen
}: Props): JSX.Element {
  return (
    <div className="welkom">
      {/* De taalkeuze hoort hier al te staan: dit is het eerste wat iemand leest. */}
      <div className="welkom-talen">
        <ThemaKnop language={language} thema={thema} onThema={onThema} />
        {LANGUAGES.map((taal) => (
          <button
            key={taal.code}
            type="button"
            aria-pressed={taal.code === language}
            aria-label={taal.native}
            title={taal.native}
            onClick={() => onLanguage(taal.code)}
          >
            <Flag code={taal.code} />
          </button>
        ))}
      </div>

      <div className="welkom-vel">
        <h1>{t(language, 'welcome.title')}</h1>
        {/* Het eerste scherm mag zeggen wat je voor je hebt. */}
        <Versie klasse="welkom-versie" />
        <p className="welkom-intro">{t(language, 'omsi.findIntro')}</p>

        {omsi.path ? (
          <>
            <span className="welkom-label">{t(language, 'omsi.findFound')}</span>
            <p className="welkom-pad">{omsi.path}</p>
            {omsi.via === 'kind' && <p className="welkom-hint">{t(language, 'omsi.findInside')}</p>}
            {omsi.via === 'ouder' && <p className="welkom-hint">{t(language, 'omsi.findAbove')}</p>}
            {omsi.zonderKaarten && (
              <p className="welkom-waarschuwing">{t(language, 'omsi.findNoMaps')}</p>
            )}
          </>
        ) : (
          <p className="welkom-hint">{t(language, 'omsi.findNothing')}</p>
        )}

        {omsi.wrong && <p className="welkom-waarschuwing">{t(language, 'omsi.findWrong')}</p>}

        <div className="welkom-knoppen">
          {omsi.path && (
            <button type="button" className="welkom-knop" disabled={bezig} onClick={onKiezen}>
              {t(language, 'omsi.findOther')}
            </button>
          )}
          <button
            type="button"
            className="welkom-knop primair"
            disabled={bezig}
            onClick={omsi.path ? onBevestig : onKiezen}
          >
            {t(language, omsi.path ? 'omsi.findConfirm' : 'omsi.findButton')}
          </button>
        </div>

        <p className="welkom-voet">{t(language, 'omsi.findFoot')}</p>
      </div>
    </div>
  )
}
