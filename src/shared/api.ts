import type { ActiveDuty, CareerState, CareerSummary, GameMode } from '../core/career'
import type { LineSummary } from '../core/duty'
import type { ExamMeasurement } from '../core/exam'
import type { ControllerConfig } from './controllers'
import type { KeyBinding } from '../core/omsiKeys'
import type { WeatherKind } from './weather'
import type { ProfileSummary } from '../core/profiles'
import type { MapGeometry } from '../core/geo'
import type { IbisPlan } from '../core/ibis'
import type { TripRoute } from '../core/routing'
import type { PluginStatus } from '../core/pluginInstall'
import type { AanmeldUitslag, OmsiToets } from './telefoon'
import type { Duty } from '../core/types'
import type { Vehicle } from '../core/vehicles'
import type { LiveStatus } from '../core/live'
import type { VehiclePosition } from '../core/vehicle'
import type { Settings } from '../core/settings'
import type { OverlayLayout } from './overlay'

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
  lijst: Array<{ index: number; naam: string; setvars: Record<string, number> }>
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
}

/** Wat vrij rijden nodig heeft: de speler stelt alles zelf samen. */
export interface FreeRequest {
  mapFolder: string
  /** Optioneel: dan staat het dienstregelingsmenu meteen op deze lijn. */
  lineFile?: string
  vehiclePath?: string
  /** De kleurstelling op naam, zoals OMSI's "Appearance"; leeg laat OMSI kiezen. */
  kleurstelling?: string
  /** Waar de bus komt te staan; zonder halte zet de app hem bij de lijn neer. */
  stopId?: string
  yard?: string
  year: number
  dayOfYear: number
  /** Tijd in minuten na middernacht. */
  minutes: number
  weather: WeatherKind
}

export interface FreeResult {
  file: string
  startup?: PreparedSituation['startup']
  launched: boolean
  running: boolean
  /** De dienst die erbij hoort, als er een lijn gekozen was; anders niets. */
  duty: Duty | null
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
  /** Er is met opzet niets klaargezet: je stapt in een spel dat al draait. */
  meegereden?: boolean
  prepared?: PreparedSituation
  /** Waarom het klaarzetten niet lukte; de overlay staat er dan alsnog. */
  prepareError?: string
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

export interface CareerApi {
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
  /**
   * Een toets van OMSI laten indrukken: het kaartje geven of het wisselgeld
   * teruggeven. Geeft terug of de opdracht weggeschreven is; of hij ook
   * aankwam, zegt het volgende beeld (`status.opdracht`).
   */
  telefoonToets(actie: OmsiToets): Promise<boolean>
  /** De knoppen van de apparaten in de bus bijschrijven; zie core/bustoetsen.ts. */
  telefoonKnoppen(): Promise<{ toegevoegd: number; geenPlek: number } | undefined>
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
  /** Hoe ver de app is met het klaarzetten van de kaarten. */
  kaartenStand(): Promise<KaartenStand>
  /** Begin met klaarzetten (als dat nog niet liep) en geef de stand terug. */
  kaartenVoorbereiden(): Promise<KaartenStand>
  /** Meeluisteren met het klaarzetten; geeft een opzegfunctie terug. */
  opKaartenWarm(luisteraar: (stand: KaartenStand) => void): () => void
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
  startFree(request: FreeRequest): Promise<FreeResult>
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
  /** Een vastgelopen OMSI afsluiten, alleen op verzoek van de speler. */
  sluitOmsi(pid: number): Promise<boolean>
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
    }
  ): Promise<CareerPayload>
  renameDriver(name: string): Promise<CareerPayload>
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
