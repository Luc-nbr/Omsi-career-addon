import { useState, type JSX } from 'react'
import { t, type Language } from '../../shared/i18n'
import type { BusfotoStand } from '../../shared/api'
import { ThemaKnop, type Thema } from './ThemaKnop'

interface Props {
  language: Language
  thema: Thema
  onThema: (thema: Thema) => void
  stand: BusfotoStand
  /**
   * Waarom dit scherm er staat. Bij het installeren is het een vraag die je mag
   * overslaan; via de knop op het startscherm heb je al ja gezegd, en loopt de
   * ronde al als het scherm opengaat.
   */
  aanleiding: 'installatie' | 'bijwerken'
  onMaken: () => void
  onStoppen: () => void
  /** Verder de app in; de ronde is dan klaar, gestopt of nooit begonnen. */
  onKlaar: () => void
}

/**
 * Hoe lang één foto duurt voordat er iets gemeten is.
 *
 * Gemeten op deze installatie: 830 tot 870 ms per bus zodra de werker warm is,
 * de eerste van een model tot 1,4 seconde. Een seconde is dan een eerlijke
 * schatting, en eerder te ruim dan te krap.
 */
const MS_PER_BUS = 1000

/** Minuten, naar boven afgerond: "nog 0 minuten" zegt niemand iets. */
function minuten(ms: number): number {
  return Math.max(1, Math.ceil(ms / 60000))
}

/**
 * De busfoto's in één keer maken.
 *
 * WAAROM DIT EEN EIGEN SCHERM IS
 * De app tekent een foto van een bus uit zijn eigen 3D-model, en dat kost de
 * eerste keer ongeveer een seconde per bus. Tot nu toe gebeurde dat pas als de
 * tegel in beeld kwam: wie een merk met twintig uitvoeringen opende, keek een
 * halve minuut naar iconen die één voor één een foto werden. Luc wilde het in
 * de installatie, in één keer, en met de mogelijkheid het over te slaan.
 *
 * Dezelfde vorm als het klaarzetten van de kaarten, met twee verschillen. Het
 * begint pas als je erom vraagt -- een paar minuten rekenen is iets anders dan
 * de halve minuut van de kaarten -- en de foto die net klaar is staat erbij,
 * want daar gaat het om: je ziet je eigen bussen voorbijkomen.
 */
export function Busplaatjes({
  language,
  thema,
  onThema,
  stand,
  aanleiding,
  onMaken,
  onStoppen,
  onKlaar
}: Props): JSX.Element {
  /*
   * Of er vanuit dit scherm een ronde begonnen is. Zonder dat valt "nog niet
   * begonnen" niet te onderscheiden van "klaar": in beide gevallen loopt er
   * niets.
   */
  const [begonnen, setBegonnen] = useState(aanleiding === 'bijwerken')
  const [gestopt, setGestopt] = useState(false)

  const deel = stand.totaal > 0 ? Math.round((stand.klaar / stand.totaal) * 100) : 0

  const kop = (
    <div className="welkom-talen">
      <ThemaKnop language={language} thema={thema} onThema={onThema} />
    </div>
  )

  /* Nog niets gevraagd: de vraag, met wat het kost. */
  if (!begonnen && !stand.loopt) {
    return (
      <div className="welkom">
        {kop}
        <div className="welkom-vel">
          <h1>{t(language, 'photos.title')}</h1>
          <p className="welkom-intro">{t(language, 'photos.intro')}</p>
          <p className="welkom-pad fotoaantal">
            {t(language, 'photos.count', {
              aantal: stand.resterend,
              minuten: minuten(stand.resterend * MS_PER_BUS)
            })}
          </p>
          <div className="welkom-knoppen">
            <button type="button" className="welkom-knop" onClick={onKlaar}>
              {t(language, 'photos.skip')}
            </button>
            <button
              type="button"
              className="welkom-knop primair"
              onClick={() => {
                setBegonnen(true)
                onMaken()
              }}
            >
              {t(language, 'photos.start')}
            </button>
          </div>
          <p className="welkom-voet">{t(language, 'photos.foot')}</p>
        </div>
      </div>
    )
  }

  /* Bezig: de balk, de bus die nu getekend wordt, en de laatste foto. */
  if (stand.loopt) {
    /*
     * De schatting pas na een paar bussen: de eerste van een model duurt het
     * langst, en daarop afgaan maakt van vijf minuten er tien. De telling komt
     * uit het hoofdproces; hier meten waar de ronde begon ging mis bij het
     * bijwerken, dat al "loopt" terwijl het nog kijkt welke bussen er zijn --
     * toen stond er "nog minder dan een minuut" bij 320 bussen te gaan.
     */
    const perBus = stand.verwerkt >= 3 ? stand.duur / stand.verwerkt : MS_PER_BUS
    const rest = stand.resterend * perBus
    return (
      <div className="welkom">
        {kop}
        <div className="welkom-vel">
          <h1>{t(language, aanleiding === 'bijwerken' ? 'photos.syncTitle' : 'photos.title')}</h1>

          <div className="fotovoorbeeld" aria-live="polite">
            {stand.laatste ? (
              <>
                <img
                  key={stand.laatste.adres}
                  src={stand.laatste.adres}
                  alt={stand.laatste.naam}
                  draggable={false}
                />
                <span className="fotovoorbeeld-naam">{stand.laatste.naam}</span>
              </>
            ) : (
              <span className="fotovoorbeeld-wacht">{t(language, 'photos.first')}</span>
            )}
          </div>

          <span className="welkom-label">
            {/* Tijdens het nakijken is er nog geen totaal; dan geen "0 van 0". */}
            {stand.totaal > 0
              ? t(language, 'photos.progress', { klaar: stand.klaar, totaal: stand.totaal })
              : '\u00a0'}
          </span>
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
          <p className="welkom-hint">
            {rest < 60000
              ? t(language, 'photos.restShort')
              : t(language, 'photos.rest', { minuten: minuten(rest) })}
          </p>

          <div className="welkom-knoppen">
            <button
              type="button"
              className="welkom-knop"
              onClick={() => {
                setGestopt(true)
                onStoppen()
                // Bij het installeren is stoppen hetzelfde als overslaan: door.
                if (aanleiding === 'installatie') onKlaar()
              }}
            >
              {t(language, aanleiding === 'installatie' ? 'photos.skipNow' : 'photos.stop')}
            </button>
          </div>
          <p className="welkom-voet">{t(language, 'photos.footBusy')}</p>
        </div>
      </div>
    )
  }

  /* Klaar, of gestopt: wat het opleverde, en verder. */
  return (
    <div className="welkom">
      {kop}
      <div className="welkom-vel">
        <h1>{t(language, aanleiding === 'bijwerken' ? 'photos.syncTitle' : 'photos.title')}</h1>
        {stand.laatste && (
          <div className="fotovoorbeeld">
            <img src={stand.laatste.adres} alt={stand.laatste.naam} draggable={false} />
            <span className="fotovoorbeeld-naam">{stand.laatste.naam}</span>
          </div>
        )}
        <p className="welkom-intro">
          {gestopt
            ? t(language, 'photos.stopped', { gemaakt: stand.gemaakt })
            : stand.gemaakt > 0
              ? t(language, 'photos.done', { gemaakt: stand.gemaakt })
              : t(language, stand.resterend > 0 ? 'photos.doneNone' : 'photos.nothing')}
        </p>
        {!gestopt && stand.resterend > 0 && (
          <p className="welkom-hint">
            {t(language, 'photos.failed', { aantal: stand.resterend })}
          </p>
        )}
        {stand.zonder > 0 && (
          <p className="welkom-hint">{t(language, 'photos.none', { zonder: stand.zonder })}</p>
        )}
        <div className="welkom-knoppen">
          <button type="button" className="welkom-knop primair" onClick={onKlaar}>
            {t(language, 'photos.continue')}
          </button>
        </div>
      </div>
    </div>
  )
}
