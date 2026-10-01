import type { BedrijfPlanApi } from './bedrijfApi'
import type { Controle } from '../core/addoncheck'
import type { LakOverzicht } from './lak'
import type { Schermvorm } from './scherm'
import type { Busanalyse, Busmap } from '../core/busklaar'
import type { Aanbod, MarktBus, OpleidingId } from '../core/bedrijf'
import type { ActiveDuty, CareerState, CareerSummary, GameMode } from '../core/career'
import type { LineSummary } from '../core/duty'
import type { ExamMeasurement } from '../core/exam'
import type { ControllerConfig } from './controllers'
import type { KeyBinding } from '../core/omsiKeys'
import type { ProfileSummary } from '../core/profiles'
import type { MapGeometry } from '../core/geo'
import type { IbisPlan } from '../core/ibis'
import type { WeatherKind } from './weather'
import type { TripRoute } from '../core/routing'
import type { PluginStatus } from '../core/pluginInstall'
import type { AanmeldUitslag, WisselAanbod } from './telefoon'
import type { MeetStap, MetingBeeld } from './meetstand'
import type { Duty, Koppelsoort } from '../core/types'
import type { Vehicle } from '../core/vehicles'
import type { LiveStatus } from '../core/live'
import type { VehiclePosition } from '../core/vehicle'
import type { Settings } from '../core/settings'
import type { OverlayLayout } from './overlay'
import type { Bus3dKeuze, Bus3dOpenVraag, Bus3dVensterMelding } from './bus3d'

/** Kaart zoals de UI hem toont. */
export interface MapSummary {
  folder: string
  name: string
  tours: number
  /** Heeft deze kaart een situatiebestand om de bus mee klaar te zetten? */
  hasTemplate: boolean
  /** Tijdvak waarin deze kaart speelt, overgenomen uit het sjabloon. */
  year: number
  dayOfYear: number
}

/**
 * Hoe ver de app is met het klaarzetten van de kaarten.
 *
 * Een kaart die nog niet klaarstaat moet uit de tegels gelezen worden, en dat
 * duurt tot ruim twee seconden. Eén keer per kaart: daarna staat hij in de
 * cache op schijf en is hij in tientallen milliseconden terug. Het
 * installatiescherm laat zien hoeveel er nog te gaan zijn.
 */
export interface KaartenStand {
  /** De kaart die nu gelezen wordt, als er één gelezen wordt. */
  bezig?: string
  klaar: number
  totaal: number
  /** Hoeveel kaarten er nog ingelezen moeten worden. */
  resterend: number
}

/**
 * Wat de app over het draaiende OMSI te melden heeft; zie core/omsiProces.ts.
 *
 * `crash`: OMSI verdween tijdens een dienst zonder netjes af te sluiten.
 * `vast`: het proces is er nog, maar reageert al een halve minuut niet.
 * `overlays`: net na het laden zitten er overlays in die de speler weg wil.
 */
export interface OmsiMelding {
  soort: 'crash' | 'vast' | 'overlays'
  /** ISO-tijd van het moment dat de app het zag. */
  tijd: string
  pid?: number
  /** Wanneer dat proces startte; met het pid samen is dat welk OMSI het was (core/omsiProces.ts). */
  start?: string
  /** Alleen in het scherm: de knop "OMSI afsluiten" vond niets meer, of het lukte niet. */
  afgesloten?: 'al-dicht' | 'mislukt'
  overlays: Array<{ soort: string; pad: string }>
}

/** Het antwoord op "wat zit er nu in OMSI?". */
export interface OmsiOverlays {
  draait: boolean
  reageert?: boolean
  overlays: Array<{ soort: string; pad: string }>
  /** Programma's die van buitenaf in het beeld zitten, zoals LosslessScaling. */
  extern: string[]
}

/**
 * De kleurstellingen van een bus, zoals OMSI ze in "Appearance" aanbiedt.
 *
 * `index` is het nummer dat OMSI zelf telt (zie core/kleurstelling.ts); de
 * volgorde van de lijst is die van OMSI, het scherm sorteert zelf op naam.
 */
export interface BusKleurstellingen {
  /** De scriptvariabele die het nummer draagt, meestal `Colorscheme`. */
  variabele: string
  /**
   * `eigen`: een eigen lak uit de Lakstudio, in alle delen van deze bus (§6).
   * `wacht`: klaargezet, nog niet in OMSI (index -1; `kleurVars` vindt hem nog niet).
   */
  lijst: Array<{ index: number; naam: string; setvars: Record<string, number>; eigen?: true; wacht?: true }>
}

/**
 * Hoe ver de app is met het tekenen van de busfoto's.
 *
 * Zelfde vorm als bij de kaarten, met twee dingen erbij: of er een ronde loopt
 * (die kun je stoppen, een kaart niet), en welke foto net klaar is -- die laat
 * het scherm zien, en de bustegels krijgen hem meteen.
 */
export interface BusfotoStand {
  /** Loopt er nu een ronde? */
  loopt: boolean
  /** De bus die nu getekend wordt. */
  bezig?: string
  /** Bussen met een foto, of waarvan vaststaat dat ze er geen krijgen. */
  klaar: number
  totaal: number
  /** Bussen die nog nooit geprobeerd zijn. */
  resterend: number
  /** Bussen waar geen foto van te maken is: een versleuteld of onleesbaar model. */
  zonder: number
  /** Hoeveel foto's deze ronde gemaakt heeft. */
  gemaakt: number
  /** Hoe lang deze ronde al loopt, in milliseconden; voor de schatting van de rest. */
  duur: number
  /** Hoeveel bussen deze ronde al langs is geweest, gelukt of niet. */
  verwerkt: number
  /** De foto die het laatst klaar kwam. */
  laatste?: { relativePath: string; adres: string; naam: string }
}

/**
 * Wat er in de OMSI-map staat, en wat er nieuw is sinds de vorige keer kijken.
 *
 * Kaarten en bussen zet je erbij door een map neer te zetten; niets meldt dat
 * aan de app. Deze uitkomst hoort bij de knop die opnieuw gaat kijken.
 */
export interface InstalledCheck {
  /** De verse lijsten, zodat de app meteen bij is. */
  maps: MapSummary[]
  vehicles: Vehicle[]
  /** Nooit eerder gekeken? Dan is alles "nieuw", en dat is geen nieuws. */
  first: boolean
  /** Namen van kaarten die erbij kwamen of verdwenen sinds de vorige keer. */
  addedMaps: string[]
  removedMaps: string[]
  /** Mapnamen van bussen, idem. */
  addedBuses: string[]
  removedBuses: string[]
}

export interface OmsiStatus {
  found: boolean
  path?: string
}

export interface DutyRequest {
  mapFolder: string
  targetMinutes: number
  /** Dagdeel waarin de dienst moet beginnen. */
  window: 'heledag' | 'ochtend' | 'middag' | 'avond' | 'nacht'
  /**
   * Alleen diensten op deze lijn. In dienstmodus kiest de chauffeur zijn route
   * zelf, in carrieremodus mag hij alleen waar hij een vergunning voor heeft.
   */
  lineFile?: string
  /**
   * De lijnen waaruit gekozen mag worden, als het er meer dan een zijn. Zo
   * rijdt de carriere alleen op vergunde lijnen, terwijl de dienst er binnen
   * die verzameling gewoon overheen mag lopen.
   */
  lineFiles?: string[]
  /**
   * Vroegste en laatste vertrek in minuten na middernacht; gaat voor `window`.
   * Voor een andere dienst terwijl OMSI al draait: de klok van het spel loopt
   * dan al, en een dienst die om zes uur begon is om tien uur geen keuze meer.
   */
  earliestStart?: number
  latestStart?: number
}

/**
 * Vrij rijden: kaart en bus, en verder niets. Waar de bus staat kiest de app
 * (core/beginplek.ts); de omloop kies je in OMSI, en de navigatie vindt hem
 * (core/omloopvolgen.ts).
 */
export interface FreeRequest {
  mapFolder: string
  vehiclePath?: string
  /** De kleurstelling op naam, zoals OMSI's "Appearance"; leeg laat OMSI kiezen. */
  kleurstelling?: string
  /** Wat de speler zelf aan datum en tijd koos; leeg is automatisch. */
  wanneer?: VrijWanneer
  /** Leeg: het weer van de kaart, of anders de standaard van OMSI. */
  weather?: WeatherKind
  /** Het wagenpark (.hof) naast de bus; leeg laat OMSI kiezen. */
  yard?: string
  /**
   * Het inzetpunt dat de controle op de kaartstap vond; zo komt de bus waar de
   * voet zei. Alleen met een zelf gekozen tijd: met een automatische bepaalt
   * START plek en moment opnieuw (core/vrijstart.ts), en dan zijn deze de
   * terugval als dat een fout gooit.
   */
  plek?: number
  /** En het moment dat daarbij hoort. */
  moment?: { year: number; dayOfYear: number; minutes: number }
}

/** De keuze van de speler; wat ontbreekt rekent de app zelf uit. */
export interface VrijWanneer {
  /** jjjj-mm-dd */
  datum?: string
  /** Minuten na middernacht. */
  tijd?: number
}

/** Wat er klaargezet is: het startscherm, alleen de situatie, of niets. */
export type Klaargezet = 'start' | 'situatie' | 'niets'

export interface FreeResult {
  running: boolean
  launched: boolean
  /** Hoe het starten van OMSI afliep, als de app het startte. */
  start?: 'gestart' | 'geweigerd' | 'mislukt'
  klaargezet: Klaargezet
  /** De naam van de plek waar de bus staat. */
  plek?: string
  /**
   * `bekijken`: de app draait alleen om te bekijken (main/versiewacht.ts) en zet niets klaar.
   * `anderSpel`: het andere spel draait al (OMSI 2 of openOMSI; de naam staat in `foutTekst`).
   * `kiesSpel`: de speler koos nog geen spel (openOMSI staat er); `voorstel` is wat de app voorstelt.
   * `spelNietGevonden`: openOMSI gekozen, maar niet gevonden.
   */
  fout?:
    | 'geenBus'
    | 'onvolledig'
    | 'geenPlek'
    | 'geenDienstregeling'
    | 'schrijven'
    | 'bekijken'
    | 'anderSpel'
    | 'kiesSpel'
    | 'spelNietGevonden'
  foutTekst?: string
  /** In welk spel de rit begon (zonder: OMSI 2). */
  motor?: 'omsi' | 'openomsi'
  voorstel?: SpelVoorstel
}

/** De controle op de kaartstap: kan de bus hier neer, en waar. */
export interface FreeCheck {
  ok: boolean
  fout?: 'onvolledig' | 'geenPlek' | 'geenDienstregeling'
  plek?: {
    nr: number
    naam: string
    bron: 'vertrekken' | 'uitrukken' | 'remise' | 'eerste' | 'halte'
    aantal: number
    tot?: number
    eerste?: number
    /** Kaartmeters, voor de marker op de kaart. */
    x: number
    y: number
    heading: number
  }
  moment: { iso: string; minutes: number; bron: 'klok' | 'eersteVertrek' }
}

/** Een omloop die straks vertrekt; voor wie in OMSI nog niets koos. */
export interface VrijSuggestie {
  lineFile: string
  tourNumber: string
  lineNumber: string
  /** Minuten na middernacht. */
  vertrek: number
  vanaf: string
  naar: string
  /** De eerste rit van de omloop: hier rukt hij uit. */
  uitrukken: boolean
  /** Binnen 300 m van de bus. */
  dichtbij: boolean
  meters?: number
}

/**
 * Waar vrij rijden staat. Het hoofdproces rekent het uit; het rijscherm, de
 * overlay en de telefoon tonen hetzelfde (renderer/vrijstaat.ts).
 */
export type VrijStaat =
  | { soort: 'wacht'; lang?: boolean }
  | { soort: 'geenBus'; klaargezet: Klaargezet }
  | { soort: 'geenGeheugen' }
  | { soort: 'andereKaart' }
  | { soort: 'geenOmloop'; suggesties: VrijSuggestie[]; halte?: string; losgelaten?: boolean }
  | { soort: 'gevolgd'; koppeling: Koppelsoort; line: string; tour: string }
  | { soort: 'alleenRit'; line: string; tour: string; trip: string }
  | { soort: 'onbekend'; line: string; tour: string; trip: string }

/** Wat een beeld van de overlay over vrij rijden meekrijgt. */
export interface VrijBeeld {
  kaart: string
  mapFolder: string
  staat?: VrijStaat
  /** De kaart die eerst gekozen was, als de app naar de kaart van OMSI wisselde. */
  gewisseldVan?: string
  /**
   * Naar de eerste halte van een rit die nog niet begonnen is: een rechte lijn
   * met de afstand, als gok (fase 1 heeft geen route).
   */
  aanrij?: { naar: string; meters: number; punten: [number, number, number, number]; gok: true }
}

/** Een toegewezen dienst met de bus die erbij gezocht is. */
/** De dag waarop deze omloop volgens de dienstregeling rijdt. */
export interface DutyDate {
  year: number
  /** Dag van het jaar, 1-366; zo noteert OMSI hem in een situatiebestand. */
  dayOfYear: number
  /** ISO-datum, voor het tonen: jjjj-mm-dd. */
  iso: string
  /** Schooldag, schoolvakantie of feestdag -- dat bepaalt welke omloop rijdt. */
  kind: 'school' | 'break' | 'holiday'
}

/** Wat er van het klaarzetten terecht is gekomen. */
export interface PreparedSituation {
  file: string
  vehiclePlaced: boolean
  spawnPlaced: boolean
  template?: string
  date: DutyDate
  /** Of het startscherm van OMSI de situatie al klaar heeft staan. */
  startup?: {
    lastSituation: boolean
    lastMap: boolean
    backup?: string
  }
  /** Of de lijn en de omloop in het dienstregelingsmenu al gekozen zijn. */
  timetableSet?: boolean
}

/**
 * Een wagenparkbestand (.hof) dat naast een busmodel ligt.
 *
 * Eén bus heeft er vaak meerdere: per stad en per tijdvak een. Daarin staan de
 * bestemmingscodes die de chauffeur in de IBIS intoetst, dus welke je kiest
 * bepaalt wat er op de film verschijnt.
 */
export interface YardOption {
  name: string
  /** Hoeveel eindbestemmingen van deze dienst dit wagenpark kent. */
  known: number
  /** Hoeveel het er in totaal zijn. */
  total: number
  /** Of de app deze zelf gekozen zou hebben. */
  suggested: boolean
}

/** Alles wat het klaarzetten en starten van een dienst nodig heeft. */
/** Een busmap in de lijst van "Bussen klaarmaken". */
export interface Busmapinfo extends Busmap {
  /** Er staan apparaten voor deze bus in de instellingen. */
  klaar: boolean
  apparaten: string[]
}

export interface Busanalyseinfo extends Busanalyse {
  /** Wat er al gekozen was, als de bus eerder klaargemaakt is. */
  gekozen?: string[]
}

export interface Busklaaruitslag {
  /** Hoeveel verschillende knoppen er aan een toets moesten. */
  knoppen: number
  bijgeschreven: number
  /** Waarvan op een toets van een andere bus of variant. */
  gedeeld: number
  /** Knoppen zonder toets, in de variant waar het er het meest waren. */
  geenPlek: number
  /** OMSI draaide: onthouden, en bijgeschreven zodra het dicht is. */
  onthouden?: boolean
  /** `bekijken`: de app draait alleen om te bekijken (main/versiewacht.ts); er is niets bewaard of bijgeschreven. */
  fout?: 'bekijken'
}

export interface BeginRequest {
  duty: Duty
  ibis?: IbisPlan
  /** Pad van de bus vanaf de OMSI-map; zonder bus wordt er niets neergezet. */
  vehiclePath?: string
  /** De kleurstelling op naam, zoals OMSI's "Appearance"; leeg laat OMSI kiezen. */
  kleurstelling?: string
  /**
   * OMSI opnieuw starten binnen dezelfde dienst, na een crash of vastloper. Wat
   * er tot dan gereden is telt mee; de meting begint opnieuw bij de herstart.
   */
  herstart?: boolean
  /**
   * Instappen in een OMSI dat al draait.
   *
   * De app zet een dienst normaal klaar in het startscherm van OMSI: kaart,
   * situatie, dienstregeling, bus bij de halte. Dat werkt alleen bij het
   * opstarten -- het spel leest dat scherm één keer en daarna nooit meer. Wie de
   * app opent terwijl hij al in de bus zit, heeft daar dus niets aan, en kreeg
   * tot nu toe een klaargezette situatie die hij pas de volgende keer zou zien
   * plus de mededeling dat hij het spel maar opnieuw moest starten.
   *
   * Hiermee slaat de app dat klaarzetten over en doet ze wat er wél kan: de
   * dienst gaat lopen, de overlay gaat open, en die vertelt welke kaart, welke
   * omloop en welke codes je zelf moet kiezen -- precies de schermen die er al
   * waren voor wie zijn dienst in het spel aanwees.
   */
  meerijden?: boolean
  date?: DutyDate
  lineNumber: string
  terminus: string
  yard?: string
}

export interface BeginResult {
  connected: boolean
  launched: boolean
  running: boolean
  /** Hoe het starten van OMSI afliep, als de app het startte (zoals `FreeResult.start`). */
  start?: 'gestart' | 'geweigerd' | 'mislukt'
  /** Waarom het starten mislukte, als er een fout was. */
  startFout?: string
  /** Er is met opzet niets klaargezet: je stapt in een spel dat al draait. */
  meegereden?: boolean
  prepared?: PreparedSituation
  /** Waarom het klaarzetten niet lukte; de overlay staat er dan alsnog. */
  prepareError?: string
  /**
   * `bekijken`: de app draait alleen om te bekijken (main/versiewacht.ts). Dan
   * begint er niets: geen situatie, geen startscherm, geen OMSI, en de dienst
   * krijgt geen begintijd.
   *
   * `anderSpel`: het andere spel draait al (`anderSpel`); de app start nooit
   * een tweede spel naast het eerste (ontwerp openomsi-koppeling §7).
   *
   * `kiesSpel`: de speler koos nog geen spel terwijl openOMSI er staat; er
   * begint niets tot hij kiest (`voorstel` is wat de app voorstelt).
   * `spelNietGevonden`: openOMSI gekozen, maar niet gevonden; er begint niets
   * (niet stilletjes OMSI 2).
   */
  fout?: 'bekijken' | 'anderSpel' | 'kiesSpel' | 'spelNietGevonden'
  /** In welk spel de dienst begon of zou beginnen. */
  motor?: 'omsi' | 'openomsi'
  anderSpel?: 'omsi' | 'openomsi'
  voorstel?: SpelVoorstel
}

export interface Assignment {
  duty: Duty
  /**
   * Op welke datum je deze dienst in OMSI moet zetten. Het spel toont in het
   * dienstregelingsmenu alleen de omlopen die op de ingestelde dag rijden, en
   * dat hangt niet alleen van de weekdag af maar ook van schoolvakanties.
   */
  date?: DutyDate
  /** Null als geen enkele geinstalleerde bus bij deze dienst past. */
  vehicle: Vehicle | null
  yard?: string
  /** Aandeel van de eindbestemmingen dat de bus kan tonen, 0 tot 1. */
  fit?: number
  /** Of de bus in het wagenpark van de kaart zelf staat. */
  fromMapFleet?: boolean
  alternatives?: number
}

/** Wat er van een dienst terecht is gekomen, gemeten via de plugin. */
/**
 * Een bus die de kaart van deze dienst (nog) niet kent.
 *
 * Een wagenpark hoort in de map van de bus en niet bij de kaart, dus een bus die
 * het bestand niet naast zich heeft liggen kent geen enkele bestemmingscode --
 * de IBIS weigert je invoer en de film blijft leeg. Zo'n bus laat de app nu ook
 * niet in het busmenu zien.
 */
export interface HofOffer {
  /** Mapnaam onder Vehicles. */
  folder: string
  /** Hoeveel eindbestemmingen van deze dienst hij nu herkent. */
  known: number
  /** Van hoeveel. */
  total: number
  /** Het wagenpark dat hij daarvoor gebruikt, als hij er een heeft. */
  knownFile?: string
  /** Wat de app zou neerzetten, en hoeveel bestemmingen dat kent. */
  offerFile?: string
  offerMatched?: number
}

/** Wat de app van de OMSI-map weet. */
export interface OmsiState {
  /** Waar hij staat, gevonden of aangewezen. Leeg als er niets is. */
  path?: string
  /** Heeft de speler deze map zelf bevestigd? */
  confirmed: boolean
  /** Hoe hij gevonden is toen de speler een map aanwees. */
  via?: 'zelf' | 'kind' | 'ouder'
  /** De installatie staat er, maar er zijn geen kaarten om op te rijden. */
  zonderKaarten?: boolean
  /** De aangewezen map draagt geen Omsi.exe, ook niet in de mappen eromheen. */
  wrong?: boolean
}

export interface SessionResult {
  /**
   * Gereden kilometers, of niets als de kilometerteller van de bus onzin zegt.
   *
   * `kmcounter_km` is een variabele van het voertuig en niet elke bus vult hem
   * netjes; zie `gereden` in het hoofdproces. Niets is hier een echt antwoord en
   * geen ontbrekende waarde: het betekent "deze dienst is niet gemeten", en dat
   * is iets anders dan nul kilometer.
   */
  drivenKm?: number
  elapsedMinutes: number
  delayMinutes?: number
  /** Gemeten rijstijl over deze dienst. */
  harshBrakes?: number
  harshAccels?: number
  topSpeed?: number
  /** Verkochte kaartjes, aanrijdingen en verbruikte brandstof over deze dienst. */
  tickets?: number
  collisions?: number
  worstCollision?: number
  fuelUsed?: number
  /** Stand van tank en accu aan het eind, als deel van 0 tot 1. */
  fuel?: number
  battery?: number
  /**
   * Hoeveel haltes van de hele dienst er gehaald zijn. Hiermee wordt betaald:
   * een halve dienst levert een halve dag op. Niets als het spel zich niet laat
   * lezen -- dan valt er niets te meten en telt de dienst gewoon voor vol.
   */
  stopsDone?: number
  /** De eindtijd is voorbij en de bus staat stil. */
  dutyComplete: boolean
  /** Onwaar zolang OMSI niet draait; dan valt er niets te meten. */
  finished: boolean
  /**
   * Een dienst in openOMSI (ontwerp openomsi-koppeling §6): daar komt alles
   * achteraf uit ~/.openomsi/sessions. `loopt`/`herstart`: het spel draait nog;
   * `wacht`: het is weg en de app wacht (hooguit 30 s) op het sessiebestand;
   * `klaar`: de afrekening staat hierboven; `onvolledig`: openOMSI schreef geen
   * rit (gecrasht of hard afgesloten).
   */
  spel?: {
    motor: 'openomsi'
    stand: 'geenSpel' | 'loopt' | 'herstart' | 'wacht' | 'klaar' | 'onvolledig'
    /** De processen van de keten (met een sessiebestand, als `klaar`). */
    pids: number[]
    /** Processen zonder sessiebestand. */
    ontbreekt?: number[]
    haltes?: number
    teVroeg?: number
    teLaat?: number
    schokken?: number
    gewonden?: number
  }
}

/**
 * Welk spel START neemt, wat er gevonden is en wat er (nog) niet kan (ontwerp
 * openomsi-koppeling §7).
 */
/**
 * Het spel dat de app voorstelt als de speler nog niet koos (core/spelmotor.ts):
 * `draait` (dat spel staat open), `laatst` (het laatst gespeeld), `alleen`
 * (alleen OMSI 2 staat er), `standaard` (niets bekend: OMSI 2).
 */
export interface SpelVoorstel {
  motor: 'omsi' | 'openomsi'
  reden: 'draait' | 'laatst' | 'alleen' | 'standaard'
}

export interface SpelStand {
  /** Wat de speler koos ("Spel: OMSI 2 / openOMSI"); leeg als hij nog niet koos. */
  keuze?: 'omsi' | 'openomsi'
  /** Het spel waarmee START nu zou beginnen (bij `kiezen`: het voorstel). */
  motor: 'omsi' | 'openomsi'
  /** openOMSI staat er en de speler koos nog niet: START vraagt het eerst. */
  kiezen: boolean
  voorstel: SpelVoorstel
  /** openOMSI gekozen, maar niet gevonden: START begint niets. */
  nietGevonden: boolean
  /** Het spel is dat van de dienst die al loopt (opnieuw starten gaat daarin verder). */
  vanDienst: boolean
  /** Wat er nu draait. */
  draait?: 'omsi' | 'openomsi'
  /** Draait het andere spel, dan begint START niets. */
  anderSpel?: 'omsi' | 'openomsi'
  openomsi?: { versie?: string; map: string; inOmsiMap: boolean; launcher: boolean; uitTemp: boolean }
  waarschuwingen: Array<'uitTemp' | 'tweeSpellen'>
  kan: { overlay: boolean; dienstLive: boolean; motorKnoppen: 'altijd' | 'nee'; afrekeningAchteraf: boolean }
  /** De motor van de dienst die loopt. */
  dienst: 'omsi' | 'openomsi'
}

/**
 * De carrière zoals de interface hem krijgt. `state` is null zolang er nog geen
 * profiel bestaat; dan vraagt de app eerst om een naam.
 */
export interface CareerPayload {
  state: CareerState | null
  summary: CareerSummary | null
  profiles: ProfileSummary[]
}

export interface PrinterInfo {
  name: string
  displayName: string
  isDefault: boolean
}

export interface ReceiptPayload {
  duty: Duty
  ibis?: IbisPlan
  vehicle?: string
}

export interface PrintResult {
  ok: boolean
  reason?: string
}

/** De instellingen van OMSI zelf, zoals ze in options.cfg staan. */
export interface GameSettingsPayload {
  /** Per sleutel de waarde uit het bestand; leeg betekent uit. */
  values: Record<string, string>
  /** Draait OMSI? Dan overschrijft het spel dit bij het afsluiten. */
  omsiRunning: boolean
}

/** De toetsindeling van OMSI, met de namen die het spel er zelf bij toont. */
export interface GameKeysPayload {
  bindings: KeyBinding[]
  /** Scancode -> naam van de toets, uit ENG.kyb of DEU.kyb. */
  keyNames: Array<[number, string]>
  /** Handeling -> leesbare naam, uit de taalbestanden van OMSI. */
  labels: Array<[string, string]>
  omsiRunning: boolean
}

/** De gamecontrollers zoals OMSI ze kent, met de namen van de handelingen. */
export interface GameControllersPayload {
  controllers: ControllerConfig[]
  /** Handeling -> leesbare naam, dezelfde lijst als bij het toetsenbord. */
  labels: Array<[string, string]>
  omsiRunning: boolean
}

/** Wat de renderer via `window.career` kan aanroepen. */
/** Wat er van een schakelbare overlay te zeggen valt; zie core/overlayknop.ts. */
export interface OverlayKnopStand {
  /** Staat hij aan? Niets betekent: niet vast te stellen. */
  aan?: boolean
  /**
   * Waarom hij nu niet om kan. `steam` betekent: Steam draait, en dat schrijft
   * zijn instellingen bij het afsluiten terug over de onze heen. `allespellen`:
   * Steam heeft de overlay voor alle spellen uit, en die schakelaar laat de app
   * met rust.
   *
   * Waar de schakelaar met de hand staat, zegt het scherm zelf in de taal van
   * de speler; hier stond eerst een vast Nederlands pad.
   */
  belet?: OverlayBelet
}

export interface OverlayKnoppen {
  steam: OverlayKnopStand
  gamebar: OverlayKnopStand
}

/** Zie `Belet` in core/overlayknop.ts. */
export type OverlayBelet = 'steam' | 'allespellen'

/**
 * Vaste codes, die het scherm vertaalt (`ovl.knop.reden.*`). Hier ging eerst de
 * ruwe code of Nodes Engelse foutmelding de zin in: "Did not work: steam".
 */
export type OverlayReden =
  | OverlayBelet
  | 'nietgevonden'
  | 'geenblok'
  | 'lezen'
  | 'schrijven'
  | 'register'
  | 'bekijken'

export interface OverlayUitkomst {
  gelukt: boolean
  reden?: OverlayReden
  aantal?: number
}

/** De overlays waar de app werkelijk aan kan komen. */
export type Schakelbaar = 'steam' | 'gamebar'

/** De webpagina voor telefoon en tablet; zie main/apparaat.ts. */
export interface ApparaatStand {
  aan: boolean
  /** Het adres voor de QR-code, met de sleutel erin. */
  url?: string
  /** Alle adressen van deze pc waarop de pagina te bereiken is. */
  adressen: string[]
  /** Hoeveel telefoons en tablets er nu meekijken. */
  kijkers: number
  /** Wat er misging bij het starten, als het misging. */
  fout?: string
}

export interface CareerApi extends BedrijfPlanApi {
  status(): Promise<OmsiStatus>
  /**
   * De telefoon: aanmelden met je personeelsnummer en pincode.
   *
   * Het nakijken gebeurt in het hoofdproces, niet in het venster. Zo kan een
   * telefoon of tablet op het netwerk zich ook aanmelden zonder dat de pincode
   * die kant op gaat, en zien de overlay en het toestel dezelfde stand.
   * Zonder `pin` wordt alleen het nummer nagekeken.
   */
  telefoonAanmelden(nummer: string, pin?: string): Promise<AanmeldUitslag>
  /** Geen nummer en geen pincode bekend: dan zonder aanmelden verder. */
  telefoonOverslaan(): Promise<void>
  /** De dienstopdracht aanvaarden ("tekenen"). */
  telefoonAanvaard(): Promise<void>
  /** Pauze begonnen (speltijd) of afgelopen (niets). */
  telefoonPauze(vanaf?: number): Promise<void>
  /** "IBIS ingevoerd" voor deze rit. */
  telefoonIbis(tripKey: string): Promise<void>
  /** Andere diensten die nu in OMSI te rijden zijn, in plaats van de aangenomen. */
  telefoonAanbod(): Promise<WisselAanbod>
  /** Er een uit dat aanbod aannemen; `false` als het aanbod intussen niet meer geldt. */
  telefoonWissel(nr: number): Promise<boolean>
  /**
   * De telefoon heeft een andere dienst aangenomen. Het hoofdvenster hoort dat
   * van buiten, want het koos die dienst niet zelf. Geeft een afmelder terug.
   */
  onDienstGewisseld(handler: (payload: CareerPayload) => void): () => void
  /**
   * Een toets van OMSI laten indrukken: het kaartje geven of het wisselgeld
   * teruggeven. Geeft terug of de opdracht weggeschreven is; of hij ook
   * aankwam, zegt het volgende beeld (`status.opdracht`).
   */
  telefoonToets(actie: string): Promise<boolean>
  /** De knoppen van de apparaten in de bus bijschrijven; zie core/bustoetsen.ts. */
  telefoonKnoppen(): Promise<{ toegevoegd: number; geenPlek: number; fout?: 'bekijken' } | undefined>
  /** Een apparaat uit deze bus in de telefoon zetten of eruit halen. */
  telefoonModule(id: string, aan: boolean): Promise<void>
  /**
   * De meetstand (core/meetstand.ts): het beeld (null als hij uit staat), een
   * stap afvinken, opslaan (de bestandsnaam van de zip, of null) en de map met
   * metingen openen in Verkenner.
   */
  metingStand(): Promise<MetingBeeld | null>
  metingVink(stap: MeetStap, aan: boolean): Promise<boolean>
  metingOpslaan(): Promise<string | null>
  metingMap(): Promise<void>
  /**
   * De vorm van een nagebouwd apparaatscherm, op id; zie shared/scherm.ts. Het
   * beeld zegt welke id er nu hoort; de vorm zelf gaat er niet elke keer mee.
   */
  schermvorm(id: string): Promise<Schermvorm | null>
  /** De navigatie op een telefoon of tablet: de server aan, en het adres voor de QR-code. */
  apparaatStart(): Promise<ApparaatStand>
  apparaatStop(): Promise<ApparaatStand>
  apparaatStand(): Promise<ApparaatStand>
  /** Een nieuwe sleutel in het adres: wat eerder gescand is, werkt dan niet meer. */
  apparaatNieuw(): Promise<ApparaatStand>
  maps(): Promise<MapSummary[]>
  /** Het logboek van de app in de verkenner tonen; geeft het pad terug. */
  logboekOpenen(): Promise<string | undefined>
  /** Een regel in het logboek zetten; voor metingen die alleen bij de speler optreden. */
  logboekMelden(regel: string): Promise<void>
  /**
   * Een foto van deze bus, getekend uit zijn eigen model.
   *
   * Geeft een `omsibus://`-adres terug, of niets als het model niet te tekenen
   * was. De eerste keer kost het enkele honderden milliseconden; daarna komt
   * het plaatje van schijf.
   */
  busFoto(relatiefPad: string, kleurstelling?: string): Promise<string | undefined>
  /** De kleurstellingen van een bus, of niets als hij er geen heeft. */
  busKleurstellingen(relatiefPad: string): Promise<BusKleurstellingen | undefined>
  /**
   * Het 3D-venster (bus3d-ontwerp §8.1): openen met deze bus, of dezelfde vraag
   * naar het venster dat er al is. Geeft het volgnummer; 0 als de schakelaar
   * `bus3d` uit staat.
   */
  bus3dOpen(vraag: Bus3dOpenVraag): Promise<number>
  /** Het doel hield op (de busstap verlaten, START): het venster dicht als het nog deze vraag toont. */
  bus3dSluit(aanvraag: number): void
  /** [Kiezen] in het 3D-venster, door main getoetst: doe wat een klik op die tegel doet. */
  opBus3dKeuze(luisteraar: (keuze: Bus3dKeuze) => void): () => void
  /** Open of dicht, en welke bus erin staat (de gevulde 3D-knop), of dat het onverwacht wegging. */
  opBus3dVenster(luisteraar: (melding: Bus3dVensterMelding) => void): () => void
  /** Hoe ver de app is met het klaarzetten van de kaarten. */
  kaartenStand(): Promise<KaartenStand>
  /** Begin met klaarzetten (als dat nog niet liep) en geef de stand terug. */
  kaartenVoorbereiden(): Promise<KaartenStand>
  /** Meeluisteren met het klaarzetten; geeft een opzegfunctie terug. */
  opKaartenWarm(luisteraar: (stand: KaartenStand) => void): () => void
  /**
   * Het hoofdproces vergat wat het van de kaarten wist (andere OMSI-map,
   * nakijken, een wagenpark of add-on erbij); wat een venster ervan onthoudt,
   * zoals de routes in `renderer/src/trajecten.ts`, klopt dan ook niet meer.
   * Geeft een opzegfunctie terug.
   */
  opKaartenVergeten(luisteraar: () => void): () => void
  /** Hoeveel bussen er al een foto hebben. */
  busfotosStand(): Promise<BusfotoStand>
  /**
   * Van elke bus zonder foto er een maken, één voor één.
   *
   * Loopt er al een ronde, dan gebeurt er niets nieuws; de stand komt terug.
   */
  busfotosMaken(): Promise<BusfotoStand>
  /** De lopende ronde afbreken na de bus die nu getekend wordt. */
  busfotosStoppen(): Promise<BusfotoStand>
  /** Meeluisteren met het tekenen; geeft een opzegfunctie terug. */
  opBusfotos(luisteraar: (stand: BusfotoStand) => void): () => void
  /** Opnieuw in de OMSI-map kijken en melden wat erbij is gekomen. */
  checkInstalled(): Promise<InstalledCheck>
  vehicles(): Promise<Vehicle[]>
  /**
   * De bus die de app op deze kaart zou voorstellen als er geen dienst is.
   *
   * Voor vrij rijden: daar valt niets te matchen op eindbestemmingen, dus komt
   * het antwoord uit de remiselijst van de kaart zelf.
   */
  suggestVehicle(mapFolder: string): Promise<Vehicle | undefined>
  /** Halteposities van een kaart, om te tonen waar je de bus neerzet. */
  geometry(mapFolder: string): Promise<MapGeometry>
  /**
   * De route van elke rit als lijn over de kaart, afwisselend x en y in meters.
   * Een lege lijn als de haltes van die rit niet op de kaart staan.
   */
  routes(
    mapFolder: string,
    legs: Array<{ tripFile: string; stopIds: string[] }>
  ): Promise<TripRoute[]>
  settings(): Promise<Settings>
  /** Bewaart alleen wat je meegeeft; de rest blijft staan. */
  saveSettings(settings: Partial<Settings>): Promise<Settings>
  /** Zet de overlay in of uit de bewerkstand; geeft terug of hij nu aan staat. */
  editOverlay(on?: boolean): Promise<boolean>
  /** Meldt of de muis boven een knop van de overlay hangt. */
  overlayHit(on: boolean): Promise<void>
  /**
   * Vasthouden tijdens slepen of schalen.
   *
   * Buiten het slepen is het venster precies zo groot als de overlay zelf; je
   * kunt hem dan niet verder verplaatsen dan zijn eigen rand. Tijdens het slepen
   * groeit het venster even naar het hele scherm en daarna weer terug.
   */
  overlayGrab(on: boolean): Promise<void>
  /**
   * Hoe groot het overlayvenster hoeft te zijn: het vak waar de elementen in
   * staan, in schermpunten vanaf de linkerbovenhoek van het werkgebied. Niets
   * meegeven betekent schermvullend, wat nodig is om te kunnen slepen.
   */
  overlayBounds(box?: { x: number; y: number; w: number; h: number }): Promise<void>
  overlayLayout(): Promise<OverlayLayout>
  saveOverlayLayout(layout: OverlayLayout): Promise<OverlayLayout>
  resetOverlayLayout(): Promise<OverlayLayout>
  /** Zet de overlay-plugin klaar in OMSI en meldt de stand. */
  pluginStatus(): Promise<PluginStatus>
  /** Een rooster om uit te kiezen. */
  listDuties(request: DutyRequest): Promise<Assignment[]>
  /** De lijnen van een kaart, om een route of een examen te kiezen. */
  lines(mapFolder: string): Promise<LineSummary[]>
  /** Een examenrit op deze lijn: een rit, met een bus erbij gezocht. */
  examDuty(mapFolder: string, lineFile: string): Promise<Assignment | null>
  /** Legt de examenrit langs de eisen en zet het oordeel in het profiel. */
  finishExam(duty: Duty, measured: ExamMeasurement, basic: boolean): Promise<CareerPayload>
  /** Vrij rijden: alleen klaarzetten en starten, zonder dienst en zonder logboek. */
  ibis(duty: Duty, vehicle: Vehicle, year: number, yard?: string): Promise<IbisPlan>
  /** De wagenparkbestanden die naast deze bus liggen, met hun kennis van deze dienst. */
  yards(duty: Duty, vehicle: Vehicle, year: number): Promise<YardOption[]>
  /** Zet de overlay boven het spel open of dicht. Geeft terug of hij nu open is. */
  setOverlay(duty: Duty | undefined, open: boolean, ibis?: IbisPlan): Promise<boolean>
  overlayIsOpen(): Promise<boolean>
  /** Meldt elke keer dat de overlay open of dicht gaat, van waar ook. Geeft een afmelder terug. */
  onOverlayState(handler: (open: boolean) => void): () => void
  /** Voor de overlay zelf: sluit hem. */
  closeOverlay(): Promise<void>
  /**
   * Neemt een dienst aan. Hij staat daarna in het profiel en blijft vast tot hij
   * is afgerond of geannuleerd; zolang kan er geen andere worden aangenomen.
   */
  confirmDuty(
    assignment: Assignment,
    vehicleOverride: string,
    mode?: GameMode,
    exam?: ActiveDuty['exam']
  ): Promise<CareerPayload>
  /** Geeft de aangenomen dienst terug zonder hem te boeken. */
  cancelDuty(): Promise<CareerPayload>
  /**
   * Start de dienst: eerst de situatie klaarzetten in OMSI, dan de overlay
   * openen, de kilometerstand vastleggen en het spel aanzwengelen.
   */
  beginDuty(request: BeginRequest): Promise<BeginResult>
  /** Geeft de plugin gegevens door? Zo ja, dan draait OMSI en is de kaart geladen. */
  liveConnected(): Promise<boolean>
  /** Wat de bus nu doorgeeft, voor de meelopende dienstregeling. */
  liveStatus(): Promise<{ status?: LiveStatus; vehicle?: VehiclePosition }>
  /** Draait het spel al? Los van de plugin, die zich pas meldt met een bus erin. */
  omsiRunning(): Promise<boolean>
  /** Welk spel START neemt (OMSI 2 of openOMSI) en wat er gevonden is. */
  spelStand(): Promise<SpelStand>
  /** Een dienst in openOMSI afronden: het spel netjes stoppen en de afrekening afwachten. */
  stopSpel(): Promise<SessionResult>
  /** Het versienummer van de app zelf, zoals het in de installer staat. */
  version(): Promise<string>
  /** Hoe OMSI de vorige keer draaide: op volledig scherm of in een venster. */
  screenMode(): Promise<'volledig' | 'venster' | undefined>
  /**
   * Laat de speler zijn OMSI-map aanwijzen. `wrong` betekent: hij koos een map
   * zonder Omsi.exe erin, en dan blijft alles zoals het was.
   */
  chooseOmsi(): Promise<{ found: boolean; path?: string; chosen?: boolean; wrong?: boolean }>
  /** De instellingen van OMSI zelf. */
  gameSettings(): Promise<GameSettingsPayload>
  /** Kijken welke overlays er nu in OMSI zitten; kost ongeveer anderhalve seconde. */
  omsiOverlays(): Promise<OmsiOverlays>
  /**
   * De overlays die de app zélf kan omzetten, en of dat nu kan.
   *
   * Twee van de vier: Steam en de Xbox Game Bar bewaren hun keuze in een gewoon
   * bestand of in het register. Discord en NVIDIA niet -- voor die twee blijft
   * het bij zeggen waar de schakelaar staat. Zie `core/overlayknop.ts`.
   */
  overlayKnoppen(): Promise<OverlayKnoppen>
  /** Een van die twee omzetten. Geeft terug of het lukte, en zo niet waarom. */
  zetOverlayKnop(welke: Schakelbaar, aan: boolean): Promise<OverlayUitkomst>
  /** De laatste melding over OMSI (crash, vastloper, overlays), als die er is. */
  omsiMelding(): Promise<OmsiMelding | undefined>
  /** De melding als gezien markeren. */
  vergeetOmsiMelding(): Promise<void>
  /** Meeluisteren met meldingen over OMSI; geeft een opzegfunctie terug. */
  opOmsiMelding(luisteraar: (melding: OmsiMelding) => void): () => void
  /**
   * Een vastgelopen OMSI afsluiten, alleen op verzoek van de speler, en alleen
   * als onder dat pid nog hetzelfde OMSI draait.
   */
  sluitOmsi(pid: number): Promise<'gesloten' | 'al-dicht' | 'mislukt'>
  /** Schrijft alleen de instellingen die veranderd zijn terug naar options.cfg. */
  saveGameSettings(changes: Record<string, string>): Promise<Record<string, string>>
  /** De toetsindeling van OMSI, met de namen uit zijn eigen bestanden. */
  gameKeys(): Promise<GameKeysPayload>
  /** De gamecontrollers uit Inputs\gamectrler.cfg. */
  gameControllers(): Promise<GameControllersPayload>
  saveGameControllers(controllers: ControllerConfig[]): Promise<ControllerConfig[]>
  saveGameKeys(bindings: KeyBinding[]): Promise<KeyBinding[]>
  /** Zet de toetsen terug op de indeling waarmee OMSI geleverd wordt. */
  resetGameKeys(): Promise<KeyBinding[]>
  /** Printers die Windows kent, standaardprinter vooraan. */
  printers(): Promise<PrinterInfo[]>
  /** Drukt het dienstkaartje af op een bonprinter van 80 mm. */
  printReceipt(payload: ReceiptPayload, deviceName?: string): Promise<PrintResult>
  /** Toont het kaartje in een venster zonder af te drukken. */
  previewReceipt(payload: ReceiptPayload): Promise<PrintResult>
  career(): Promise<CareerPayload>
  /** Maakt een nieuw chauffeursprofiel aan en maakt het meteen actief. */
  createProfile(name: string): Promise<CareerPayload>
  selectProfile(id: string): Promise<CareerPayload>
  deleteProfile(id: string): Promise<CareerPayload>
  /**
   * Opent een bestandsvenster en zet de gekozen afbeelding neer als de foto van
   * deze chauffeur. Kiest hij niets, dan komt dezelfde stand terug.
   *
   * De afbeelding wordt gekopieerd naar `<gebruikersgegevens>\profielfotos`; in
   * het profiel staat alleen de bestandsnaam, en de pagina komt er via het
   * schema `omsifoto://` bij. Een pad van de schijf gaat hier nooit doorheen.
   */
  chooseProfilePhoto(id: string): Promise<CareerPayload>
  /** Haalt de foto weer weg; de tegel valt dan terug op het monogram. */
  clearProfilePhoto(id: string): Promise<CareerPayload>
  /** Vinkt af dat de chauffeur zijn personeelsnummer en pincode gezien heeft. */
  dienstpasGezien(): Promise<CareerPayload>
  /** Vrij rijden: de bus neerzetten, klaarzetten en OMSI starten. */
  startFree(request: FreeRequest): Promise<FreeResult>
  /** Kan de bus op deze kaart neer, en waar; de voet van de kaartstap. */
  checkFree(mapFolder: string, wanneer?: VrijWanneer): Promise<FreeCheck>
  /** De vrije rit afsluiten: de overlay gaat dicht. */
  stopFree(): Promise<void>
  /** De wagenparken naast een bus, gemeten aan alle eindbestemmingen van de kaart. */
  vrijeYards(mapFolder: string, vehiclePath: string, year: number): Promise<YardOption[]>
  /**
   * Vrij rijden: hoe het ervoor staat, met de omloop die gevolgd wordt en zijn
   * IBIS-codes zodra die er is.
   */
  onVrijStaat(
    handler: (uitslag: {
      staat: VrijStaat
      duty?: Duty
      ibis?: IbisPlan
      kaart: string
      mapFolder: string
    }) => void
  ): () => void
  /** De geïnstalleerde bussen, per map, en welke al klaargemaakt zijn. */
  bussen(): Promise<Busmapinfo[]>
  /** Een bus uitlezen: welke apparaten er zijn en wat ze zijn. Kan een minuut duren. */
  busAnalyse(sleutel: string): Promise<Busanalyseinfo>
  /** De gekozen apparaten van een bus bewaren en hun knoppen aan een toets hangen. */
  busKlaar(sleutel: string, ids: string[]): Promise<Busklaaruitslag>
  /** Leest uit OMSI's eigen situatiebestand wat er van de dienst terechtkwam. */
  checkSession(): Promise<SessionResult>
  completeDuty(
    duty: Duty,
    vehicle: string,
    measured?: {
      drivenKm?: number
      delayMinutes?: number
      harshBrakes?: number
      harshAccels?: number
      /** Hoeveel haltes er gehaald zijn; bepaalt wat de dienst oplevert. */
      stopsDone?: number
      tickets?: number
      collisions?: number
      fuelUsed?: number
      /** Alleen uit openOMSI (ontwerp openomsi-koppeling §6). */
      teVroeg?: number
      teLaat?: number
      bron?: 'openomsi'
    }
  ): Promise<CareerPayload>
  renameDriver(name: string): Promise<CareerPayload>
  /** Het busbedrijf; zie core/bedrijf.ts. */
  bedrijfOprichten(naam: string): Promise<CareerPayload>
  bedrijfInschrijven(
    mapFolder: string,
    lineFile: string
  ): Promise<{ payload: CareerPayload; fout?: 'kas' | 'al' | 'lijn' | 'geen' }>
  bedrijfOpzeggen(mapFolder: string, lineFile: string): Promise<CareerPayload>
  /** Met `fout: 'rit'` zolang er een bedrijfsrit aangenomen is. */
  bedrijfDagAf(): Promise<{ payload: CareerPayload; fout?: 'rit' } | CareerPayload>
  bedrijfMarkt(): Promise<{ nieuw: MarktBus[]; tweedehands: Aanbod[] }>
  bedrijfKoop(
    soort: 'nieuw' | 'tweedehands',
    wat: string | number
  ): Promise<{ payload: CareerPayload; fout?: 'kas' | 'weg' | 'geen' }>
  bedrijfVerkoop(nummer: number): Promise<CareerPayload>
  bedrijfAannemen(nr: number): Promise<{ payload: CareerPayload; fout?: 'weg' | 'geen' }>
  bedrijfOntslaan(id: number): Promise<CareerPayload>
  bedrijfOpslag(id: number): Promise<CareerPayload>
  bedrijfOpleiding(id: OpleidingId): Promise<{ payload: CareerPayload; fout?: string }>
  bedrijfBijscholing(id: number): Promise<{ payload: CareerPayload; fout?: string }>
  /** Zelf in de werkplaats, met de score van de minigame (0 tot 1). */
  bedrijfZelf(nummer: number, wat: 'onderhoud' | 'reparatie', score: number): Promise<{ payload: CareerPayload; fout?: string }>
  /** Een bericht in het postvak gelezen; zonder id het hele postvak. */
  bedrijfPost(id?: number): Promise<CareerPayload>
  /** De add-on-manager (stap 7); zie core/addon.ts. Een fout komt als `{ fout }` terug. */
  addonKies(soort: 'zip' | 'map'): Promise<string | undefined>
  /** Het pad van een bestand dat in het venster is losgelaten. */
  addonPad(bestand: File): string
  addonPlan(pad: string): Promise<{ plan: AddonPlan } | AddonFout>
  /** `metCode`: de speler vertrouwt de maker, en de plugins gaan mee. */
  addonInstalleer(
    pad: string,
    naam?: string,
    metCode?: boolean
  ): Promise<{ id: string; geschreven: number; overschreven: number; code: number } | AddonFout>
  addonLijst(): Promise<AddonOverzicht[]>
  addonVerwijder(id: string): Promise<{ verwijderd: number; teruggezet: number; gebleven: number; gewijzigd: string[] } | AddonFout>
  addonInhoud(): Promise<{ bussen: string[]; kaarten: string[] }>
  addonControleer(soort: 'bus' | 'kaart', naam: string): Promise<Controle | AddonFout>
  opAddonVoortgang(luisteraar: (stand: { fase: string; n: number }) => void): () => void
  /**
   * De Lakstudio in Addons (lakstudio-ontwerp §5.6-§5.8), achter de schakelaar
   * `bus3d`: eigen kleurstellingen, wachtende lakken en wezen. Zonder schakelaar
   * geven ze niets.
   */
  lakLijst(): Promise<LakOverzicht[]>
  lakWachtrij(): Promise<Array<{ projectId: string; naam: string; bus: string; versie: number; sinds: string; reden?: string }>>
  lakNietPlaatsen(projectId: string): Promise<boolean>
  lakVerwijder(projectId: string, ookOntwerp?: boolean, keuze?: 'alles' | 'laten'): Promise<unknown>
  lakWezen(): Promise<Array<{ id: string; cti: string; naam: string; nnnn: number; bestanden: string[] }>>
  lakWeesWeg(id: string): Promise<unknown>
  lakWeesOvernemen(id: string): Promise<unknown>
  /** Eigen bussen die in deze lak rijden (ls.gebruik), vóór verwijderen vanuit Addons (§5.6 stap 1). */
  lakGebruik(projectId: string): Promise<number[]>
  /** Eigen lakken die bestanden van deze add-on noemen (de start, §5.6): de waarschuwing bij verwijderen. */
  addonLakAfhankelijk(addonId: string): Promise<Array<{ naam: string; aantal: number }>>
  /** Een kleurstelling kwam erbij of ging weg (Lakstudio): de lijsten opnieuw vragen. */
  opKleurstellingenVeranderd(luisteraar: (bussen: string[]) => void): () => void
  /**
   * De bouwstempel (`bouw 1a2b3c4 · 2026-09-28 20:15 · setup`), en of deze exe
   * alleen kijkt omdat een nieuwere versie de gebruikersmap bijwerkte (zie
   * core/versiewacht.ts).
   */
  bouw(): Promise<{ stempel: string; alleenBekijken?: { versie: string; bouw?: string } }>
  bedrijfWerkplaats(
    nummer: number,
    wat: 'onderhoud' | 'reparatie'
  ): Promise<{ payload: CareerPayload; fout?: 'kas' | 'weg' | 'geen' }>
  /**
   * Welke bussen de kaart van deze dienst niet kennen, en wat eraan te doen is.
   * Leest alleen; er wordt pas iets neergezet als de chauffeur dat vraagt.
   */
  /**
   * De stand van de OMSI-map bij het opstarten.
   *
   * `confirmed` zegt of de speler hem zelf heeft aangewezen. Zo niet, dan is
   * `path` een vondst van de app en hoort hij hem een keer voorgelegd te
   * krijgen -- er zijn te veel installaties denkbaar om te gokken.
   */
  omsiState(): Promise<OmsiState>
  /** De gevonden of aangewezen map vastleggen als de juiste. */
  confirmOmsi(path: string): Promise<OmsiState>
  /** Een map aanwijzen; legt nog niets vast, zodat het scherm het eerst toont. */
  browseOmsi(): Promise<OmsiState>
  /**
   * Welke bussen deze kaart niet kennen, en wat eraan te doen is.
   *
   * Het gaat over de kaart en niet over de dienst: een wagenpark hoort bij een
   * bus en een kaart. Dat scheelt twee scheve uitkomsten -- een bus die de halve
   * kaart kent maar net niet de vier haltes van deze ene dienst, en vrij rijden,
   * waar geen dienst bestaat en dus nooit iets gevraagd werd.
   */
  hofOffers(mapFolder: string): Promise<HofOffer[]>
  /**
   * Hetzelfde voor een bus, en dat is waar het om draait: je kiest een bus, elke
   * remise zegt "0 van 2", en dan hoort de app te vragen of hij het bestand
   * erbij zet. Niets als er niets passends te vinden is.
   */
  hofOfferFor(mapFolder: string, folder: string): Promise<HofOffer | undefined>
  /** Hetzelfde, maar voor de bestemmingen van deze ene dienst. */
  hofOfferForDuty(duty: Duty, folder: string): Promise<HofOffer | undefined>
  /**
   * Het beste wagenpark dat bij deze bus gelegd kán worden, ook als het niet
   * beter is dan wat hij al heeft; voor de knop die er altijd staat.
   */
  hofCandidate(
    duty: Duty,
    folder: string
  ): Promise<
    | {
        path: string
        file: string
        matched: number
        known: number
        total: number
        past: boolean
        alAanwezig?: boolean
      }
    | undefined
  >
  /** En dat bestand er werkelijk neerleggen. */
  placeHofCandidate(duty: Duty, folder: string): Promise<{ placed: number; file?: string }>
  /**
   * Zet de aangeboden wagenparken neer bij de genoemde bussen. Geeft terug
   * hoeveel er werkelijk bij zijn gekomen -- een bestand dat er al lag telt niet
   * mee en wordt nooit overschreven.
   */
  placeHofs(mapFolder: string, folders: string[]): Promise<{ placed: number; failed: string[] }>
}

/** Vertaalt het gekozen dagdeel naar vroegste en laatste vertrektijd in minuten. */
export const TIME_WINDOWS: Record<DutyRequest['window'], { label: string; from?: number; to?: number }> = {
  heledag: { label: 'Hele dag' },
  ochtend: { label: 'Ochtend', from: 4 * 60, to: 11 * 60 },
  middag: { label: 'Middag', from: 11 * 60, to: 16 * 60 },
  avond: { label: 'Avond', from: 16 * 60, to: 22 * 60 },
  nacht: { label: 'Nacht', from: 22 * 60, to: 30 * 60 }
}

/** Een klus van de add-on-manager die niet lukte; `melding` is de tekst van de fout, als die er is. */
export interface AddonFout {
  fout: 'bezig' | 'omsi' | 'plan' | 'weg' | 'fout' | 'ruimte' | 'geen-zip' | 'zip64' | 'versleuteld' | 'methode' | 'kapot'
  melding?: string
}

/** Past het op de schijf? Per schijf wat er nodig is en wat er vrij is; zie `ruimteVoor` in core/addon.ts. */
export interface AddonRuimte {
  /** `bytes` is wat er bij komt, `nodig` dat met de marge die daarna vrij moet blijven. */
  schijven: Array<{ wat: 'omsi' | 'reserve' | 'samen'; schijf: string; bytes: number; nodig: number; vrij?: number; past: boolean }>
  past: boolean
}

/** Een installatieplan zoals het venster het ziet: tellingen en de eerste regels. */
export interface AddonPlan {
  naam: string
  nieuw: number
  gelijk: number
  /** Wat overschreven wordt (de eerste 200), met de add-on waar het nu van is. */
  anders: Array<{ doel: string; van?: string }>
  andersAantal: number
  overig: string[]
  overigAantal: number
  /** Namen die buiten de OMSI-map uitkwamen of op Windows niet mogen (de eerste 100). */
  geweigerd: string[]
  geweigerdAantal: number
  /** Op dezelfde plek als een eerder bestand uit de bron; niet neergezet (de eerste 100). */
  dubbel: string[]
  dubbelAantal: number
  /** Het pad in de OMSI-map wordt te lang voor OMSI; niet neergezet (de eerste 100). */
  teLang: string[]
  teLangAantal: number
  /** Overgeslagen rommel: `__MACOSX`, `Thumbs.db`, ... */
  rommel: number
  /** Plugins: alleen met het vinkje. Met hun staat (nieuw, gelijk, anders). */
  code: Array<{ doel: string; staat: 'nieuw' | 'gelijk' | 'anders' }>
  /** Programma's en scripts die nooit neergezet worden. */
  nooit: string[]
  plekken: Array<{ plek: string; bestanden: number; bytes: number }>
  bussen: string[]
  kaarten: string[]
  bytes: number
  /** Past het, zonder en met de plugins. */
  ruimte: AddonRuimte
  ruimteMetCode: AddonRuimte
}

export interface AddonOverzicht {
  id: string
  naam: string
  geinstalleerd: string
  bestanden: number
  overschreven: number
  bussen: string[]
  kaarten: string[]
}
