import type { JSX } from 'react'
import { LANGUAGES, loose, t, type Language } from '../../shared/i18n'
import { formatDuration } from '../../shared/format'
import type { CareerSummary, GameMode } from '../../core/career'
import { Flag } from './Flag'
import { Icoon } from './Icoon'
import { ThemaKnop, type Thema } from './ThemaKnop'
import { Versie } from './Versie'

interface Props {
  language: Language
  onLanguage: (language: Language) => void
  thema: Thema
  onThema: (thema: Thema) => void
  /** De naam van de chauffeur die nu rijdt. */
  chauffeur: string
  samenvatting?: CareerSummary
  /** De modus waarop de app nu staat; die tegel staat aangewezen. */
  modus: GameMode
  /** Loopt er een dienst, en zo ja in welke modus? */
  lopend?: GameMode
  onModus: (modus: GameMode) => void
  onStaatVanDienst: () => void
  onInstellingen: () => void
  onChauffeur: () => void
}

const MODI: GameMode[] = ['career', 'service', 'free']

/**
 * Het hoofdscherm: waar je binnenkomt en waar je kiest wat je gaat doen.
 *
 * WAAROM DIT GEEN LIJST MEER IS
 * De modus stond eerst als drie regels in hetzelfde keuzevel als de kaarten en
 * de diensten: dezelfde rijen, dezelfde kolommen, met twee kolommen die voor
 * twee van de drie modi niets te melden hadden. Dat werkt voor een lijst van
 * veertig bussen, maar dit is geen lijst -- het zijn drie manieren om te
 * spelen, en dat is de belangrijkste keuze van de hele app. Die hoort als
 * tegels op tafel te liggen, groot genoeg om te lezen waar je aan begint.
 *
 * Eromheen staat wat er verder bij het binnenkomen hoort en nergens anders
 * thuishoorde: wie er rijdt, wat hij tot nu toe deed, en de knoppen naar de
 * instellingen van het spel. Zo is dit scherm de hub en niet een stap.
 *
 * Kleur blijft doen wat DESIGN.md zegt: blauw is de keuze die je maakt, geel
 * alleen het lijnnummer (dat hier niet voorkomt), de rest is grond, vel en
 * inkt.
 */
export function Starthub({
  language,
  onLanguage,
  thema,
  onThema,
  chauffeur,
  samenvatting,
  modus,
  lopend,
  onModus,
  onStaatVanDienst,
  onInstellingen,
  onChauffeur
}: Props): JSX.Element {
  const uren = samenvatting ? formatDuration(samenvatting.minutes, language) : undefined

  return (
    <div className="hub">
      <header className="vel hub-balk">
        <span className="hub-merk">OMSI Enhancer</span>
        <Versie klasse="hub-versie" />
        <div className="balk-rechts">
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
      </header>

      <main className="hub-vel vel">
        <div className="hub-kop">
          <h1>{t(language, 'hub.title', { naam: chauffeur })}</h1>
          <p>{t(language, 'hub.intro')}</p>
        </div>

        {/* De hoofdkeuze: drie tegels, en niets anders even groot. */}
        <div className="hub-tegels">
          {MODI.map((naam) => (
            <button
              key={naam}
              type="button"
              className="hub-tegel"
              aria-pressed={naam === modus}
              onClick={() => onModus(naam)}
            >
              <span className="hub-tegel-icoon">
                <Icoon naam={naam === 'career' ? 'licence' : naam === 'service' ? 'duty' : 'map'} />
              </span>
              <span className="hub-tegel-naam">{t(language, `mode.${naam}` as const)}</span>
              <span className="hub-tegel-uitleg">{t(language, `mode.${naam}Intro` as const)}</span>
              {lopend === naam && (
                <span className="hub-tegel-stand">{t(language, 'setup.modeRunning')}</span>
              )}
            </button>
          ))}
        </div>

        <div className="hub-onder">
          {/* Wat je tot nu toe deed. De hele staat van dienst zit erachter. */}
          <button type="button" className="hub-paneel" onClick={onStaatVanDienst}>
            <span className="hub-paneel-kop">{t(language, 'hub.record')}</span>
            <span className="hub-cijfers">
              <span>
                <b>{samenvatting?.duties ?? 0}</b>
                {t(language, 'hub.duties')}
              </span>
              <span>
                <b>{uren ?? '0'}</b>
                {t(language, 'hub.hours')}
              </span>
              <span>
                <b>{Math.round(samenvatting?.km ?? 0)}</b>
                {t(language, 'hub.km')}
              </span>
              <span>
                <b>{samenvatting?.licences ?? 0}</b>
                {t(language, 'hub.licences')}
              </span>
            </span>
            <span className="hub-rang">
              {samenvatting ? loose(language, `rank.${samenvatting.rank}`, samenvatting.rank) : ''}
            </span>
          </button>

          <div className="hub-knoppen">
            <button type="button" className="hub-knop" onClick={onInstellingen}>
              <Icoon naam="stuur" />
              {t(language, 'setup.omsiSettings')}
            </button>
            <button type="button" className="hub-knop" onClick={onChauffeur}>
              <Icoon naam="profile" />
              {t(language, 'hub.driver', { naam: chauffeur })}
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
