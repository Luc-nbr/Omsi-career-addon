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
import type { Duty } from '../core/types'
import type { Vehicle } from '../core/vehicles'
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
}

/** Wat vrij rijden nodig heeft: de speler stelt alles zelf samen. */
export interface FreeRequest {
  mapFolder: string
  /** Optioneel: dan staat het dienstregelingsmenu meteen op deze lijn. */
  lineFile?: string
  vehiclePath?: string
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
  date?: DutyDate
  lineNumber: string
  terminus: string
  yard?: string
}

export interface BeginResult {
  connected: boolean
  launched: boolean
  running: boolean
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
export interface SessionResult {
  drivenKm: number
  elapsedMinutes: number
  delayMinutes?: number
  /** Gemeten rijstijl over deze dienst. */
  harshBrakes?: number
  harshAccels?: number
  topSpeed?: number
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
export interface CareerApi {
  status(): Promise<OmsiStatus>
  maps(): Promise<MapSummary[]>
  /** Opnieuw in de OMSI-map kijken en melden wat erbij is gekomen. */
  checkInstalled(): Promise<InstalledCheck>
  vehicles(): Promise<Vehicle[]>
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
    }
  ): Promise<CareerPayload>
  renameDriver(name: string): Promise<CareerPayload>
}

/** Vertaalt het gekozen dagdeel naar vroegste en laatste vertrektijd in minuten. */
export const TIME_WINDOWS: Record<DutyRequest['window'], { label: string; from?: number; to?: number }> = {
  heledag: { label: 'Hele dag' },
  ochtend: { label: 'Ochtend', from: 4 * 60, to: 11 * 60 },
  middag: { label: 'Middag', from: 11 * 60, to: 16 * 60 },
  avond: { label: 'Avond', from: 16 * 60, to: 22 * 60 },
  nacht: { label: 'Nacht', from: 22 * 60, to: 30 * 60 }
}
