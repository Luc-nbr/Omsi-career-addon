import { useEffect, useRef, useState, type CSSProperties, type JSX, type ReactNode } from 'react'
import type { MapGeometry } from '../../core/geo'
import type { Duty } from '../../core/types'
import { useT } from './language'
import { Icoon as Pictogram, ICONEN } from './Icoon'
import { RouteMap } from './RouteMap'
import './setup.css'

/**
 * De stappen die je aflegt voordat OMSI start, in vaste volgorde.
 *
 * Niet elke modus loopt ze allemaal langs -- `stappen` zegt per scherm welke er
 * in de balk staan. `line` is er alleen bij vrij rijden, waar je je rit zelf
 * samenstelt; `licence` alleen in de carriere, waar je niet rijdt wat je kiest
 * maar wat je mag. In beide gevallen zit de stap op dezelfde plek in de reeks:
 * na de kaart, voor de dienst. Dat is waar de vraag hoort die bepaalt wat er in
 * de dienstenlijst komt.
 */
export const STAPPEN = ['profile', 'mode', 'map', 'line', 'licence', 'duty', 'bus'] as const
export type Stap = (typeof STAPPEN)[number]

/**
 * Een regel in het vel.
 *
 * Elke stap kiest uit een lijst, en die lijsten lijken meer op elkaar dan ze
 * verschillen: een naam en twee getallen. Door ze door dezelfde vorm te halen
 * ziet elke stap er hetzelfde uit, en hoeft niemand per scherm opnieuw te leren
 * waar hij moet kijken.
 */
export interface Rij {
  id: string
  /** Drie kolommen, in dezelfde volgorde als de koppen. */
  cellen: [string, string, string]
  /** Zet een klokje voor de derde kolom; dat is altijd een tijdsduur. */
  klok?: boolean
  /** Grijs en niet aanklikbaar, met een reden die als titel meekomt. */
  uit?: string
  /**
   * Een handeling die bij deze regel hoort en niet bij de keuze -- een chauffeur
   * weggooien bijvoorbeeld. Staat achteraan de regel en is een eigen knop, want
   * hij mag nooit per ongeluk meeliften op het aanklikken van de regel zelf.
   */
  actie?: { label: string; gevaarlijk?: boolean; onDoen: () => void }
}

/**
 * Een tegel in een rooster: voor keuzes die je met een blik wilt overzien.
 *
 * Een lijst met 342 bussen die allemaal "Citybus by Kajosoft" heten is geen
 * keuze maar een muur. Deze vorm hakt dat in drieën -- merk, type, uitvoering --
 * en toont per stap een handvol tegels met de vorm van de bus erop.
 */
export interface Tegel {
  id: string
  titel: string
  /** Wat eronder staat: een aantal, een motor, een uitvoering. */
  onder?: string
  /** De vorm van de bus; die tekent het icoon. */
  vorm?: Busvorm
  /** Een ander icoon dan een bus, voor wat geen bus is. */
  icoon?: 'hof'
  /**
   * Een monogram in plaats van een bus: de initialen van het merk in een eigen
   * kleur. Geen nagemaakt logo -- MAN en Mercedes-Benz zijn echte bedrijven en
   * hun merkteken is van hen. Dit lost op waar het om ging: merken die je in
   * een rooster van dertig tegels meteen uit elkaar houdt.
   */
  monogram?: string
  /**
   * Een echte afbeelding in plaats van een icoon.
   *
   * De kaarten van OMSI hebben er zelf een: `picture.jpg` in de kaartmap, het
   * plaatje dat het spel in zijn eigen kaartkeuze laat zien. Een gebruiker
   * vroeg om die tegels, en terecht -- Hamburg herken je aan de haven, niet aan
   * de letters HH. Ontbreekt het bestand, dan valt de tegel terug op het
   * monogram; van de twaalf kaarten hier is dat er een.
   */
  beeld?: string
  gekozen?: boolean
  onDoen: () => void
}

export type Busvorm = 'solo' | 'geleed' | 'dubbel' | 'midi'

/** Een handeling naast de hoofdknop. */
export interface Nevenknop {
  tekst: string
  onDoen: () => void
}

/** Een kruimel in het spoor terug: merk › type › uitvoering. */
export interface Kruimel {
  label: string
  onDoen?: () => void
}

interface Props {
  /** Waar de speler nu is; alles ervoor is klaar, alles erna nog niet. */
  stap: Stap
  /**
   * Welke stappen er in de balk staan.
   *
   * Niet elke modus kent ze allemaal. In dienst en carriere kiest de app de
   * lijnen zelf -- een dienst loopt over lijnen heen, dus er valt er niet een
   * te kiezen -- en dan hoort die stap er ook niet te staan. Weggelaten betekent
   *: alle stappen.
   */
  stappen?: readonly Stap[]
  /** Het lijnnummer voor het gele plaatje; leeg zolang er geen lijn gekozen is. */
  lijn?: string
  titel: string
  onderschrift: string
  koppen: [string, string, string]
  rijen: Rij[]
  gekozen: number
  onKies: (index: number) => void
  voet: string
  /** Waar de kaart onder alles vandaan komt; zonder dienst blijft hij leeg. */
  duty?: Duty
  /**
   * Een kaart zonder dienst: teken het net van déze kaartmap.
   *
   * Op de kaartstap is er nog geen dienst en stond er dus een lege belofte. Nu
   * je een kaart kunt aanwijzen hoort daar te staan wat je aanwijst -- de wegen
   * en de haltes van die kaart. Luc vroeg erom: "als je er vervolgens een
   * selecteert, zie je idealiter alle details en het netwerk".
   */
  netkaart?: string
  onStart: () => void
  startTekst?: string
  bezig?: boolean
  /** Terug naar een eerdere stap; de balk is ook de navigatie. */
  onStap?: (stap: Stap) => void
  /**
   * Handelingen naast de hoofdknop, bijvoorbeeld iets toevoegen.
   *
   * Meestal is het er een. Er mogen er meer: op de chauffeursstap staat er naast
   * "nieuwe chauffeur" ook de staat van dienst, en dat zijn twee dingen die
   * allebei niet de weg vooruit zijn. Ze komen in dezelfde rij, links van de
   * hoofdknop, in de volgorde waarin ze hier staan.
   */
  tweede?: Nevenknop | Nevenknop[]
  /**
   * Een stap terug.
   *
   * De balk bovenaan kan dat al -- een stap die je gehad hebt is een knop -- en
   * toch hoort deze er te staan. De balk is klein, staat ver van je muis, en op
   * een smal venster zijn het alleen nog icoontjes. Terug is de handeling die
   * je het vaakst doet na Verder, en die hoort naast Verder te staan en niet
   * ergens anders op het scherm.
   *
   * Weggelaten op de eerste stap: daar is niets om naar terug te gaan.
   */
  onTerug?: () => void
  /**
   * Knoppen die bepalen wat er in de lijst komt te staan -- hoe lang de dienst
   * mag duren, op welk dagdeel. Ze staan boven de lijst en niet erin: ze zijn
   * geen keuze uit de lijst maar de vraag die de lijst oplevert.
   */
  regelaars?: ReactNode
  /**
   * De kaart naast het vel houden, ook als er vrije inhoud in staat.
   *
   * Vrije inhoud maakt het vel normaal schermvullend -- de instellingen van
   * OMSI zijn een formulier en hebben niets aan een kaart ernaast. Tijdens het
   * rijden is dat net andersom: dan is de kaart de navigatie.
   */
  metKaart?: boolean
  /**
   * Wat de kaart tijdens het rijden moet weten: welke rit, waar de bus is, en
   * of de route al getekend mag worden.
   */
  navigatie?: {
    nextStopId?: string
    activeLeg?: number
    routeMode?: 'all' | 'active' | 'none'
    vehicle?: { x: number; y: number; heading: number; speedKmh: number }
  }
  /**
   * Iets wat de speler moet weten voordat hij verder gaat.
   *
   * Niet hetzelfde als de voet: die vertelt over de lijst die eronder staat.
   * Dit staat erboven omdat het over het rijden gaat en niet over de keuze --
   * dat OMSI op volledig scherm stond bijvoorbeeld, wat de overlay een zwart
   * beeld kan opleveren. Het staat er alleen als er iets is; een lege doos die
   * altijd meeschuift leert je hem over te slaan.
   */
  waarschuwing?: ReactNode
  /** De voet toont een fout en krijgt daar de kleur van. */
  voetFout?: boolean
  /** Een venstertje over het scherm heen; het vel blijft eronder staan. */
  dialoog?: ReactNode
  /** Het vel over het hele venster, ook zonder tegels of vrije inhoud. */
  vullend?: boolean
  /** De regels tonen iets, ze zijn geen keuze: geen bolletje, geen markering. */
  keuzeloos?: boolean
  /**
   * Een invulregel bovenaan de lijst, in dezelfde vorm als een keuzeregel.
   * Bedoeld voor het toevoegen van iets dat er nog niet is.
   */
  invoer?: {
    waarde: string
    plaatshouder: string
    onWaarde: (waarde: string) => void
    onBevestig: () => void
    onAnnuleer: () => void
  }
  /** Een rooster met tegels in plaats van een lijst met regels. */
  tegels?: Tegel[]
  /** Het spoor terug door de niveaus heen. */
  kruimels?: Kruimel[]
  /**
   * Een andere naam voor een stap in de balk.
   *
   * De reeks is per modus dezelfde en de plek in de reeks ook, maar wat er op
   * die plek gevraagd wordt niet altijd. Bij vrij rijden staat op de plek van
   * de dienst je rit -- geen dienstenlijst maar waar en wanneer -- en dan hoort
   * er ook "Rit" te staan en niet "Dienst".
   */
  stapnamen?: Partial<Record<Stap, string>>
  /** Wat rechts in de stappenbalk hangt; de taalkeuze hoort daar. */
  rechtsInBalk?: ReactNode
  /**
   * Iets anders dan een keuzelijst in het vel.
   *
   * De instellingen van OMSI zijn een formulier en geen lijst; die in rijen
   * persen zou betekenen dat we er een lijst van doen alsof. Ze krijgen wel
   * dezelfde wereld eromheen: hetzelfde vel, dezelfde balk, dezelfde letters.
   */
  inhoud?: ReactNode
}


/**
 * De vorm van een bus, getekend en niet gefotografeerd.
 *
 * OMSI levert geen afbeeldingen bij zijn voertuigen -- geen preview, alleen de
 * texturen van de beschildering. Een getekende zijkant zegt bovendien meer dan
 * een foto: je ziet in één oogopslag of het een solobus, een gelede bus of een
 * dubbeldekker is, en dat is precies waar je op kiest.
 */
function Busicoon({ vorm }: { vorm: Busvorm }): JSX.Element {
  return (
    <svg className="busicoon" viewBox="0 0 96 40" aria-hidden="true">
      {vorm === 'geleed' ? (
        <>
          <rect x="2" y="8" width="44" height="22" rx="4" />
          <rect x="48" y="10" width="6" height="18" rx="2" opacity="0.5" />
          <rect x="56" y="8" width="38" height="22" rx="4" />
          <circle cx="14" cy="32" r="4" />
          <circle cx="40" cy="32" r="4" />
          <circle cx="82" cy="32" r="4" />
        </>
      ) : vorm === 'dubbel' ? (
        <>
          <rect x="6" y="2" width="72" height="28" rx="4" />
          <line x1="6" y1="16" x2="78" y2="16" />
          <circle cx="20" cy="32" r="4" />
          <circle cx="66" cy="32" r="4" />
        </>
      ) : vorm === 'midi' ? (
        <>
          <rect x="16" y="10" width="52" height="20" rx="4" />
          <circle cx="28" cy="32" r="4" />
          <circle cx="58" cy="32" r="4" />
        </>
      ) : (
        <>
          <rect x="6" y="8" width="78" height="22" rx="4" />
          <circle cx="20" cy="32" r="4" />
          <circle cx="70" cy="32" r="4" />
        </>
      )}
    </svg>
  )
}

/**
 * Een remise: waar de bussen staan en waar het hof-bestand over gaat.
 *
 * Bewust geen bus: het hof-bestand bepaalt welke eindbestemmingen op de
 * matrixborden kunnen staan, en dat is een eigenschap van het bedrijf en niet
 * van het voertuig.
 */
/**
 * Een monogram voor een merk.
 *
 * De letters onderscheiden het merk, de kleur niet. Eerder kwam er via een
 * optelsom over de naam een eigen tint uit, en dan staan er twaalf tegels met
 * twaalf kleuren op een scherm waar kleur maar drie dingen mag betekenen: de
 * route, het lijnnummer en de tijd (DESIGN.md, de Three Jobs Rule). Een
 * regenboog aan merktegels zegt niets en pakt de aandacht die de route nodig
 * heeft.
 */
function Monogram({ tekst }: { tekst: string }): JSX.Element {
  const letters = tekst
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((woord) => woord[0]?.toUpperCase() ?? '')
    .join('')
  return (
    <span className="monogram">{letters || tekst.slice(0, 2).toUpperCase()}</span>
  )
}

/**
 * De afbeelding van een kaart, met een uitweg.
 *
 * Niet elke kaart heeft een `picture.jpg` -- Vienna 2005 bijvoorbeeld niet --
 * en een gebroken plaatje is lelijker dan geen plaatje. Gaat het laden mis, dan
 * staat er het monogram van de naam, net als bij de bussen.
 */
function Tegelbeeld({ bron, naam }: { bron: string; naam: string }): JSX.Element {
  const [mis, setMis] = useState(false)
  if (mis) return <Monogram tekst={naam} />
  return (
    <img className="tegel-beeld" src={bron} alt="" loading="lazy" onError={() => setMis(true)} />
  )
}

function Hoficoon(): JSX.Element {
  return (
    <svg className="busicoon" viewBox="0 0 96 40" aria-hidden="true">
      <path d="M10 34V14l20-8 20 8v20" />
      <path d="M50 34V20h30v14" />
      <line x1="4" y1="34" x2="92" y2="34" />
      <rect x="20" y="22" width="10" height="12" />
      <line x1="58" y1="26" x2="72" y2="26" />
    </svg>
  )
}

/*
 * Het icoontje van een stap. De vormen staan in Icoon.tsx, bij de rest: ze
 * stonden hier, en toen kwamen er ook icoontjes bij het weer, het dagdeel en het
 * chauffeursoverzicht. Twee plekken met tekeningen worden twee stijlen.
 */
function Icoon({ stap, klasse }: { stap: Stap; klasse?: string }): JSX.Element {
  return <Pictogram naam={stap} klasse={klasse} />
}

/**
 * Het scherm waarop je je rit klaarzet.
 *
 * De kaart is hier geen illustratie naast de keuze maar de ondergrond ervan: je
 * ziet waar je gaat rijden voordat je weet hoe de lijn heet. Daarboven zweven
 * twee vellen -- de stappen en de keuzelijst -- en één knop die altijd op
 * dezelfde plek staat. Verder ligt er niets op het scherm.
 */
export function Setup({
  stap,
  lijn,
  titel,
  onderschrift,
  koppen,
  rijen,
  gekozen,
  onKies,
  voet,
  duty,
  netkaart,
  onStart,
  startTekst,
  bezig,
  onStap,
  onTerug,
  tweede,
  waarschuwing,
  voetFout,
  regelaars,
  metKaart,
  navigatie,
  dialoog,
  vullend,
  keuzeloos,
  invoer,
  stapnamen,
  rechtsInBalk,
  inhoud,
  tegels,
  kruimels,
  stappen
}: Props): JSX.Element {
  const tr = useT()
  const balk = stappen ?? STAPPEN
  const nu = balk.indexOf(stap)

  /*
   * Voor de kaartstap valt er niets te tonen naast de keuze, dus vult het vel
   * dan het venster. Vanaf de kaart schuift hij naar links en komt de kaart
   * ernaast.
   */
  /*
   * `vullend` is voor schermen die wel een lijst tonen maar geen keuze zijn --
   * een overzicht van eenenveertig bussen bijvoorbeeld. Die passen niet in de
   * zijbalk, terwijl ze geen tegels of vrije inhoud hebben om dat vanzelf af te
   * dwingen.
   */
  const beeldvullend =
    !metKaart &&
    (stap === 'profile' || stap === 'mode' || Boolean(inhoud) || Boolean(tegels) || Boolean(vullend))

  /*
   * De kaart hoort bij de kaartmap, niet bij de dienst: wie een andere dienst
   * op dezelfde kaart aanklikt, hoort geen lege ondergrond te zien terwijl de
   * tegels opnieuw gelezen worden.
   */
  const bedieningRef = useRef<{ zoomBy: (factor: number) => void; refit: () => void }>(undefined)
  const gekozenRef = useRef<HTMLButtonElement>(null)
  const [geometry, setGeometry] = useState<MapGeometry>()
  const kaartmap = duty?.mapFolder ?? netkaart
  useEffect(() => {
    if (!kaartmap) return undefined
    let geldig = true
    void window.career.geometry(kaartmap).then((gevonden) => {
      if (geldig) setGeometry(gevonden)
    })
    return () => {
      geldig = false
    }
  }, [kaartmap])

  /*
   * Bij elke stap opnieuw passend maken. Zonder dit blijft de kaart staan waar
   * de vorige stap hem liet -- bij de bus zag je een stuk straat van vijfhonderd
   * meter in plaats van de hele lijn.
   */
  useEffect(() => {
    const tijd = setTimeout(() => bedieningRef.current?.refit(), 60)
    return () => clearTimeout(tijd)
  }, [stap, geometry, kaartmap])

  /*
   * De lijst opent op zijn keuze. Bij de bus staat de aanbevolen bus bovenaan
   * maar kan de lijst een paar honderd regels tellen; opende hij halverwege,
   * dan zei de voet "de eerste past het best" terwijl je die eerste niet zag.
   */
  useEffect(() => {
    gekozenRef.current?.scrollIntoView({ block: 'nearest' })
  }, [stap, gekozen, rijen.length])

  return (
    <div className="setup" data-vol={beeldvullend ? 'ja' : 'nee'}>
      <div className="setup-kaart">
        {/*
          Zolang er geen dienst gekozen is valt er geen route te tekenen. Dan
          niet een zwart vlak laten staan maar zeggen wat er gaat komen: de
          kaart is de belofte van dit scherm, en een lege belofte is erger dan
          een uitgestelde.
        */}
        {!beeldvullend && !(geometry && (duty || netkaart)) && (
          <p className="kaart-leeg">{tr('setup.mapSoon')}</p>
        )}
        {/*
          Niet verbergen maar weglaten. Een kaart die met display:none in beeld
          komt heeft nul bij nul gemeten en past zichzelf op niets aan; je zag
          dan een straat van honderd meter in plaats van de hele lijn. Zo komt
          hij vers ter wereld op het moment dat hij ruimte heeft.
        */}
        {!beeldvullend && geometry && (duty || netkaart) && (
          <RouteMap
            duty={duty}
            geometry={geometry}
            variant="full"
            /*
             * Tijdens het rijden is dit de navigatie: alleen de rit die loopt
             * als route, met de bus erop. Daarbuiten de hele dienst, zodat je
             * ziet wat je kiest.
             */
            routeMode={navigatie?.routeMode ?? 'all'}
            nextStopId={navigatie?.nextStopId}
            activeLeg={navigatie?.activeLeg}
            vehicle={navigatie?.vehicle}
            bediening={(b) => {
              bedieningRef.current = b
            }}
          />
        )}
      </div>

      <header className="vel setup-stappen">
        {lijn && <span className="lijnplaatje">{lijn}</span>}
        <ol className="stappen">
          {balk.map((naam, index) => {
            const stand = index < nu ? 'klaar' : index === nu ? 'nu' : 'straks'
            return (
              <li key={naam} className="stap" data-stand={stand}>
                {/*
                  De balk is ook de navigatie: een stap die je al gehad hebt
                  brengt je erheen terug. Wat nog moet komen is geen knop, want
                  vooruitspringen naar een keuze die nog niet bestaat kan niet.
                */}
                <button
                  type="button"
                  className="stapknop"
                  disabled={stand !== 'klaar' || !onStap}
                  onClick={() => onStap?.(naam)}
                >
                  <Icoon stap={naam} klasse="stap-icoon" />
                  {stapnamen?.[naam] ?? tr(`setup.step.${naam}` as const)}
                </button>
                {index < balk.length - 1 && (
                  <span
                    className="stap-streep"
                    data-stand={index < nu ? 'klaar' : 'straks'}
                    aria-hidden="true"
                  />
                )}
              </li>
            )
          })}
        </ol>
        {rechtsInBalk && <div className="balk-rechts">{rechtsInBalk}</div>}
      </header>

      {/*
        De sleutel maakt de beweging waar die in setup.css beloofd wordt. Zonder
        hem blijft dit tussen de stappen door hetzelfde element -- React wisselt
        de inhoud en laat de doos staan -- en speelt de animatie precies een
        keer af, bij het openen van de app.

        De diepte staat erbij voor de busstap: die wisselt drie keer van inhoud
        (merk, type, uitvoering) zonder dat de stap verandert, en dat zijn
        evengoed nieuwe schermen. De titel zou ook kunnen, maar die verandert
        ook als je in de dienstenlijst een andere dienst aanwijst -- dan zou de
        lijst waar je net in klikte onder je handen opnieuw opkomen.
      */}
      <section
        key={`${stap}-${kruimels?.length ?? 0}`}
        className="vel dienstenvel"
        data-stap={stap}
        data-keuze={keuzeloos ? 'nee' : 'ja'}
      >
        <div className="velkop">
          {/*
            Het icoontje volgt de stap en is dus niet altijd de bus uit de
            goedgekeurde afbeelding. Bewuste afwijking: die afbeelding toont
            alleen de dienststap, en vier schermen met hetzelfde busje erboven
            zeggen niet waar je bent. Het icoon herhaalt wat de balk aanwijst.
          */}
          <Icoon stap={stap} klasse="velicoon" />
          <h2 className="veltitel">{titel}</h2>
          <p className="velonderschrift">{onderschrift}</p>
        </div>

        {waarschuwing && <div className="velwaarschuwing">{waarschuwing}</div>}

        {inhoud && <div className="velinhoud">{inhoud}</div>}

        {kruimels && kruimels.length > 1 && (
          <nav className="kruimels">
            {kruimels.map((kruimel, index) => (
              <span key={kruimel.label + index} className="kruimel">
                {index > 0 && <span className="kruimel-scheiding">›</span>}
                {kruimel.onDoen ? (
                  <button type="button" onClick={kruimel.onDoen}>
                    {kruimel.label}
                  </button>
                ) : (
                  <span className="kruimel-hier">{kruimel.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}

        {regelaars && <div className="regelaars">{regelaars}</div>}

        {tegels && (
          <div className="tegels">
            {tegels.map((tegel, index) => (
              <button
                key={tegel.id}
                type="button"
                className="tegel"
                style={{ '--i': index } as CSSProperties}
                aria-pressed={tegel.gekozen}
                onClick={tegel.onDoen}
              >
                {tegel.beeld ? (
                  <Tegelbeeld bron={tegel.beeld} naam={tegel.titel} />
                ) : tegel.icoon === 'hof' ? (
                  <Hoficoon />
                ) : tegel.monogram ? (
                  <Monogram tekst={tegel.monogram} />
                ) : (
                  <Busicoon vorm={tegel.vorm ?? 'solo'} />
                )}
                <span className="tegel-titel">{tegel.titel}</span>
                {tegel.onder && <span className="tegel-onder">{tegel.onder}</span>}
              </button>
            ))}
          </div>
        )}

        {/*
          Koppen boven een lege lijst zijn koppen boven niets. Bij de eerste
          start staat er alleen een invulveld, en daar hoort geen tabelhoofd bij.
        */}
        {!inhoud && !tegels && rijen.length > 0 && (
          <div className="kolomkoppen">
            {/* Een lege cel op de plek van het keuzerondje, zodat de koppen boven hun kolom staan. */}
            {!keuzeloos && <span aria-hidden="true" />}
            {koppen.map((kop) => (
              <span key={kop}>{kop}</span>
            ))}
          </div>
        )}

        {!inhoud && !tegels && invoer && (
          <div className="invoerrij">
            <input
              className="invoerveld"
              value={invoer.waarde}
              placeholder={invoer.plaatshouder}
              autoFocus
              onChange={(e) => invoer.onWaarde(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') invoer.onBevestig()
                if (e.key === 'Escape') invoer.onAnnuleer()
              }}
            />
            <button
              type="button"
              className="invoerknop"
              disabled={!invoer.waarde.trim()}
              onClick={invoer.onBevestig}
            >
              {tr('setup.add')}
            </button>
          </div>
        )}

        {inhoud || tegels ? null : rijen.length === 0 && !invoer ? (
          <p className="vel-leeg">{tr('setup.empty')}</p>
        ) : (
          <ul className="dienstenlijst">
            {rijen.map((rij, index) => (
              /* `--i` is het volgnummer; setup.css maakt er de vertraging van. */
              <li key={rij.id} style={{ '--i': index } as CSSProperties}>
                <button
                  type="button"
                  className="dienstrij"
                  ref={index === gekozen ? gekozenRef : undefined}
                  aria-pressed={index === gekozen}
                  disabled={Boolean(rij.uit)}
                  title={rij.uit}
                  onClick={() => onKies(index)}
                >
                  {/* Geen bolletje als er niets te kiezen valt; dat belooft een keuze. */}
                  {!keuzeloos && <span className="dienstbol" aria-hidden="true" />}
                  {/*
                    De eerste kolom kapt gewoon aan het eind af: dat die bussen
                    hetzelfde model zijn, is waar. Het verschil zit in de tweede
                    kolom, en die korten we in het midden af zodat het eind --
                    juist het onderscheidende stuk -- blijft staan.
                  */}
                  <span className="dienstnaam" title={rij.cellen[0]}>
                    {rij.cellen[0]}
                  </span>
                  <span title={rij.cellen[1]}>{rij.cellen[1]}</span>
                  <span className="dienstduur">
                    {rij.klok && (
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d={ICONEN.duty.d} fill="currentColor" fillRule="evenodd" />
                      </svg>
                    )}
                    {rij.cellen[2]}
                  </span>
                  {/*
                    Een eigen cel achteraan, niet aangeplakt aan de duur: het is
                    een handeling en geen waarde, en ingeklemd naast een tijd
                    druk je hem per ongeluk.
                  */}
                  <span className="rijactie-cel">
                    {rij.actie && (
                      <span
                        role="button"
                        tabIndex={0}
                        className={`rijactie ${rij.actie.gevaarlijk ? 'gevaarlijk' : ''}`}
                        title={rij.actie.label}
                        aria-label={rij.actie.label}
                        onClick={(e) => {
                          e.stopPropagation()
                          rij.actie?.onDoen()
                        }}
                        onKeyDown={(e) => {
                          if (e.key !== 'Enter' && e.key !== ' ') return
                          e.preventDefault()
                          e.stopPropagation()
                          rij.actie?.onDoen()
                        }}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path
                            d="M9 3h6l1 2h4v2H4V5h4l1-2ZM6 9h12l-1 12H7L6 9Z"
                            fill="currentColor"
                          />
                        </svg>
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {/*
          De voet hangt aan zijn tekst en niet aan de vorm van het vel. Dat
          stond eerst op "geen tegels en geen vrije inhoud", en dat klopte
          zolang die twee nooit iets te melden hadden -- maar de ritstap van
          vrij rijden is vrije inhoud met wel degelijk een regel eronder. De
          schermen die niets te zeggen hebben geven een lege voet mee en
          verdwijnen daar vanzelf mee.
        */}
        {voet && (
        <div className={`velvoet ${voetFout ? 'fout' : ''}`}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-1 4h2v2h-2V7Zm0 4h2v6h-2v-6Z"
              fill="currentColor"
              fillRule="evenodd"
            />
          </svg>
          {voet}
        </div>
        )}
      </section>

      {geometry && duty && (
        <div className="kaartknoppen">
          <button
            type="button"
            className="kaartknop"
            onClick={() => bedieningRef.current?.refit()}
            aria-label={tr('setup.centre')}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 11 21 3l-8 18-2-7-8-3Z" fill="currentColor" />
            </svg>
          </button>
          <button
            type="button"
            className="kaartknop"
            onClick={() => bedieningRef.current?.zoomBy(1 / 1.4)}
            aria-label={tr('setup.zoomIn')}
          >
            {/* Getekend, niet getypt: een plusteken uit de letter heeft een
                andere lijndikte en een ander midden dan de iconen ernaast. */}
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z" fill="currentColor" />
            </svg>
          </button>
          <button
            type="button"
            className="kaartknop"
            onClick={() => bedieningRef.current?.zoomBy(1.4)}
            aria-label={tr('setup.zoomOut')}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 11h14v2H5v-2Z" fill="currentColor" />
            </svg>
          </button>
        </div>
      )}

      {/*
        De twee knoppen in een rij. Ze stonden allebei los rechtsonder, en de
        tweede rekende de breedte van de eerste na om zich ernaast te zetten.
        Dat werkt zolang het opschrift kort is; bij "Yes, that is it" brak de
        tekst over twee regels en liep hij de knop uit. Een rij lost dat op: de
        breedte volgt de tekst in plaats van andersom.
      */}
      <div className="knoppenrij">
        {onTerug && (
          <button
            type="button"
            className="terugknop"
            onClick={onTerug}
            aria-label={tr('setup.back')}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15 5 8 12l7 7" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {tr('setup.back')}
          </button>
        )}

        {/* Een knop om iets toe te voegen terwijl het veld al openstaat, zegt niets. */}
        {!invoer &&
          (Array.isArray(tweede) ? tweede : tweede ? [tweede] : []).map((knop) => (
            <button key={knop.tekst} type="button" className="tweedeknop" onClick={knop.onDoen}>
              {knop.tekst}
            </button>
          ))}

        <button
          type="button"
          className="startknop"
          onClick={onStart}
          disabled={bezig || (!inhoud && !tegels && rijen.length === 0)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 4v16l13-8L7 4Z" fill="currentColor" />
          </svg>
          {startTekst ?? tr('setup.start')}
        </button>
      </div>

      {/* Helemaal achteraan, zodat hij over de rest heen ligt zonder z-index. */}
      {dialoog}
    </div>
  )
}
