import { existsSync, readdirSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'
import {
  kiesVertrekplek,
  leesInzetpunten,
  minutenNa,
  tegelsCompleet,
  vertrekkenOp,
  type Beginplek,
  type Inzetpunt,
  type Vertrek,
  type VrijCheckVol
} from './beginplek'
import { dateForMask, dayKind, readCalendar, type Calendar } from './calendar'
import {
  komendeVertrekken,
  koppelOmsiKeuze,
  onbruikbaar,
  ritIndexKlopt,
  type Koppeling,
  type OmsiKeuze
} from './omloopvolgen'
import { herkenKaart, type Herkenning, type Monster } from './kaartherkenning'
import { bestemmingenVan } from './haltes'
import { hofVoorKaart, listHofs, matchHof, type Hof } from './hof'
import { spawnAtStop } from './spawn'
import { generateDuties, buildNetwork, dutyVanRitten, type Network } from './duty'
import { kaartDag, lijnWeek } from './bedrijfsplan'
import { bouwLijnplan } from './lijnplan'
import { lijnSleutel, type LijnPlek } from './bedrijfsklok'
import type { KaartDag, LijnPlan, LijnWeek } from './planTypen'
import {
  buildFleetIndex,
  maakBusGeheugen,
  pickVehicleForDuty,
  readMapDepot,
  readMapFleet,
  suggestFromDepot,
  type FleetIndex
} from './fleet'
import { bouwBusTekeningMetPlaten, type BusTekeningMetPlaten } from './busbeeld'
import { eigenKleurstellingen, kleurstellingenVanBus, omsiHoofdletters } from './kleurstelling'
import type { BusKleurstellingen } from '../shared/api'
import { ritSleutel } from '../shared/traject'
import { readMapData, readTileGrid, type Lane, type MapGeometry } from './geo'
import { leesUitCache, schrijfInCache, vingerafdruk } from './kaartcache'
import { LaneNetwork, routeForTrip, routeZonderHaltes, type TripRoute } from './routing'
import { findTemplate, readSituationTime } from './situation'
import { listMaps, loadMap, readMapOverview } from './timetable'
import { listVehicles, type Vehicle } from './vehicles'
import {
  besteKandidaat,
  planHofs,
  scanHofs,
  wagenparkAfdruk,
  type BusHofState,
  type HofFile
} from './hofTool'
import type { Duty, OmsiMap } from './types'
import {
  TIME_WINDOWS,
  type Assignment,
  type DutyDate,
  type DutyRequest,
  type HofOffer,
  type MapSummary,
  type VrijSuggestie,
  type VrijWanneer,
  type YardOption
} from '../shared/api'

/**
 * Alles wat uit de OMSI-map gelezen moet worden, met zijn caches.
 *
 * WAAROM DIT EEN EIGEN LAAG IS
 * Deze functies stonden in het hoofdproces, en daar zaten ze vast: het
 * hoofdproces doet één ding tegelijk, dus terwijl het een kaart uitlas of een
 * dienstenlijst samenstelde reageerde de app nergens meer op. Gemeten op deze
 * installatie: `duty:list` 1989 ms, `map:geometry` 2767 ms, `map:routes` 810 ms
 * -- allemaal tijd waarin geen knop iets doet. Dat is de klacht die op
 * 19-09-2026 binnenkwam.
 *
 * Nu is het een laag zonder Electron eronder, die twee keer bestaat: één keer
 * in het hoofdproces (voor wat klein en direct moet) en één keer in de werker
 * (voor het zware werk). Beide lezen dezelfde bestanden en schrijven in dezelfde
 * schijfcache, dus wie wat doet is een kwestie van waar het snel genoeg is.
 *
 * De caches zitten in de laag zelf en niet in module-variabelen: twee lagen in
 * hetzelfde proces zouden elkaars geheugen anders overschrijven.
 */
export interface Kaartlaag {
  map(folder: string): OmsiMap
  /** De tekening: haltes, wegen, water, borden. Geheugen, dan schijf, dan tegels. */
  geometrie(folder: string): MapGeometry
  /** De rijstroken; nodig om een route te plannen of een bus neer te zetten. */
  stroken(folder: string): Lane[]
  rijstrokennet(folder: string): LaneNetwork
  net(folder: string): Network
  wagenparkVanKaart(folder: string): Set<string>
  eindbestemmingen(folder: string): string[]
  remises(folder: string): Map<string, number>
  tijdvak(folder: string): { year: number; dayOfYear: number }
  kalender(folder: string): Calendar
  dienstDatum(folder: string, days: number): DutyDate | undefined
  wagenpark(): FleetIndex
  /** Leest de kaart uit de tegels en zet hem in beide caches. Het dure stuk. */
  leesKaart(folder: string): { geometry: MapGeometry; lanes: Lane[] }
  /** Staat de kaart al op schijf of in het geheugen? */
  kaartStaatKlaar(folder: string): boolean
  /** De kaartenlijst voor het keuzescherm: naam, aantal omlopen, tijdvak. */
  overzicht(): MapSummary[]
  /** Alle bussen die er staan; het doorlezen van Vehicles kost ruim honderd ms. */
  voertuigen(): Vehicle[]
  /** Welke bus hier het meest rondrijdt, volgens de remiselijst van de kaart. */
  busvoorstel(folder: string): Vehicle | undefined
  /** Wagenparken die meer eindbestemmingen van deze kaart kennen dan wat er staat. */
  hofAanbod(folder: string): HofOffer[]
  /** Hetzelfde aanbod, maar voor één busmap; komt uit dezelfde rekensom. */
  hofAanbodVoor(folder: string, busmap: string): HofOffer | undefined
  /**
   * En hetzelfde voor de bestemmingen van één dienst.
   *
   * Dat is een andere vraag dan die van de kaart. Een bus kan veertig van de
   * honderdnegenenvijftig bestemmingen van Ahlheim kennen -- en geen van de
   * twee die op jouw dienst staan.
   */
  hofAanbodVoorRit(termini: string[], busmap: string): HofOffer | undefined
  /**
   * Het beste wagenpark dat je bij deze bus zou kunnen leggen, ook als het niet
   * beter is dan wat hij al heeft. Voor de knop die er altijd hoort te staan.
   */
  wagenparkKandidaat(
    termini: string[],
    busmap: string,
    kaartFolder?: string
  ):
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
  /** Alle .hof-bestanden die er liggen; komt van schijf zolang Vehicles niet wijzigt. */
  wagenparkBestanden(): HofFile[]
  diensten(request: DutyRequest): Assignment[]
  routes(folder: string, legs: Array<{ tripFile: string; stopIds: string[] }>): TripRoute[]
  /**
   * De tekening van een bus: zijn onderdelen en de texturen die wij zelf
   * kunnen uitpakken (.dds en .tga). Het lezen kost 283 tot 1376 ms per bus en
   * hoort dus niet in het hoofdproces.
   */
  bustekening(busPad: string, kleurstelling?: string): BusTekeningMetPlaten | undefined
  /** De kleurstellingen van een bus, zonder de texturen; zie kleurstelling.ts. */
  kleurstellingen(busPad: string): BusKleurstellingen | undefined
  /*
   * VRIJ RIJDEN. Alles hieronder draait in de werker: een dienstregeling of
   * rijstrokennet inlezen hoort niet in het hoofdproces (tegenlezing B3 --
   * HamburgLi20 koud 1759 ms, Ahlheim 3084 ms voor het net).
   */
  /** Kan de bus op deze kaart neer, waar, en wanneer. Zie core/beginplek.ts. */
  vrijCheck(folder: string, wanneer?: VrijWanneer): VrijCheckVol
  /** De inzetpunten van de kaart die bruikbaar zijn. */
  inzetpunten(folder: string): Inzetpunt[]
  /** De `.ttl`-bestanden in de volgorde van readdir, zonder extensie: OMSI's lijnnummers. */
  ttlNamen(folder: string): string[]
  /** Idem de `.ttp`-bestanden: OMSI's ritnummers. */
  ttpNamen(folder: string): string[]
  /** De omloop die OMSI rijdt, teruggevonden in de dienstregeling; zie core/omloopvolgen.ts. */
  koppel(folder: string, keuze: OmsiKeuze, datum?: string, voorkeur?: 'bestand' | 'vertrek'): Koppeling
  /** Wat er straks vertrekt, voor wie nog geen omloop koos; met de halte waar de bus staat. */
  vertrekken(
    folder: string,
    datum: string | undefined,
    klok: number,
    bus?: { x: number; y: number }
  ): { suggesties: VrijSuggestie[]; halte?: string }
  /**
   * Staat de bus op deze kaart, en zo niet, op welke dan? Zie
   * core/kaartherkenning.ts. De eerste keer leest dit global.cfg en het terrein
   * van alle kaarten: 62 tot 75 ms, te veel voor het hoofdproces.
   */
  herken(folder: string, monsters: Monster[]): Herkenning
  /**
   * Een andere kaart waar deze keuze van OMSI wel past: het lijnbestand bestaat
   * er, het ritnummer wijst daar dezelfde rit aan, en de plek van de bus spreekt
   * het niet tegen. Alleen als er precies één is.
   */
  elders(
    folder: string,
    keuze: { lineName: string; trip: number; tripName: string },
    monsters: Monster[]
  ): string | undefined
  /**
   * De wagenparken naast een bus, gemeten aan alle eindbestemmingen van de
   * kaart: vrij rijden heeft vooraf geen dienst. Koud 63 tot 348 ms (de
   * dienstregeling, en 22 wagenparken naast de MAN SG: 30 ms, ook warm).
   */
  vrijeWagenparken(folder: string, vehiclePath: string, year: number): YardOption[]
  /*
   * De planning van het busbedrijf (bedrijfsplan.ts). `kaartDag` blijft in het
   * geheugen (hoogstens 64): het venster vraagt bij elke actie een paar dagen
   * op, en warm kost het een paar ms.
   */
  kaartDag(folder: string, lineFiles: string[], anker: string, dag: number): KaartDag
  lijnWeek(folder: string, anker: string, vanDag: number): Record<string, LijnWeek>
  /** De dienst voor OMSI bij een stuk van een omloop uit het plan; zie `dutyVanRitten`. */
  dienstDuty(folder: string, deel: { lineFile: string; tourNumber: string; days: number; ritten: string[] }): Duty | undefined
  /** Het lijnplan voor de vlootkaart; zie lijnplan.ts. */
  lijnplan(folder: string, lineFiles: string[], anker: string, dag: number): LijnPlan
  /**
   * Op welke geïnstalleerde kaarten een lijn (de naam van het .ttl-bestand,
   * zonder .ttl, zoals OMSI hem in `mem.lineName` zet) voorkomt. Gemeten bij
   * Luc: 48 van de 52 lijnnamen van HafenCity staan ook op een andere kaart,
   * dus een lijnnaam alleen wijst zelden één kaart aan.
   */
  kaartenMetLijn(lijn: string): LijnPlek[]
}

function diepBevroren<T>(x: T): T {
  if (x && typeof x === 'object' && !Object.isFrozen(x)) {
    Object.freeze(x)
    for (const v of Object.values(x)) diepBevroren(v)
  }
  return x
}

export function maakKaartlaag(omsiPath: string, userData: string): Kaartlaag {
  const mapCache = new Map<string, OmsiMap>()
  const networkCache = new Map<string, Network>()
  const mapFleetCache = new Map<string, Set<string>>()
  const mapTerminiCache = new Map<string, string[]>()
  const mapDepotCache = new Map<string, Map<string, number>>()
  const mapEraCache = new Map<string, { year: number; dayOfYear: number }>()
  const calendarCache = new Map<string, Calendar>()
  const geometryCache = new Map<string, MapGeometry>()
  const laneCache = new Map<string, Lane[]>()
  const laneNetworkCache = new Map<string, LaneNetwork>()
  const routeCache = new Map<string, TripRoute>()
  const inzetCache = new Map<string, Inzetpunt[]>()
  const ttlCache = new Map<string, string[]>()
  const ttpCache = new Map<string, string[]>()
  const vertrekCache = new Map<string, Vertrek[]>()
  const ttrBeginCache = new Map<string, Map<string, { x: number; y: number } | null>>()
  const checkCache = new Map<string, { op: number; uit: VrijCheckVol }>()
  let fleetIndex: FleetIndex | undefined
  let voertuigenCache: Vehicle[] | undefined
  let hofBestanden: HofFile[] | undefined
  let kaartlijst: { op: number; mappen: string[] } | undefined

  const aanbodCache = new Map<string, BusHofState[]>()
  const kaartDagCache = new Map<string, KaartDag>()
  const lijnWeekCache = new Map<string, Record<string, LijnWeek>>()
  let lijnIndex: { lijnen: Map<string, LijnPlek[]>; mapsTijd: number; gebouwd: number } | undefined

  const kaartPad = (folder: string): string => join(omsiPath, 'maps', folder)

  /*
   * Het wagenparkplan van een kaart: welke bus kent wat, en wat valt er bij te
   * leggen. Het is één rekensom voor de hele kaart -- de lijst én de vraag per
   * bus komen eruit -- dus hij hoort één keer gemaakt te worden.
   */
  const plan = (folder: string): BusHofState[] => {
    const bewaard = aanbodCache.get(folder)
    if (bewaard) return bewaard
    const termini = laag.eindbestemmingen(folder)
    const uit = termini.length === 0 ? [] : planHofs(omsiPath, termini, laag.wagenparkBestanden())
    aanbodCache.set(folder, uit)
    return uit
  }

  const aanbodVan = (bus: BusHofState, totaal: number): HofOffer | undefined =>
    bus.offer && {
      folder: bus.folder,
      known: bus.known,
      total: totaal,
      knownFile: bus.knownFile,
      offerFile: bus.offer.file,
      offerMatched: bus.offer.matched
    }

  const laag: Kaartlaag = {
    map(folder) {
      const cached = mapCache.get(folder)
      if (cached) return cached
      const loaded = loadMap(join(omsiPath, 'maps'), folder)
      if (!loaded) throw new Error(`Kaart "${folder}" kon niet worden geladen.`)
      mapCache.set(folder, loaded)
      return loaded
    },

    leesKaart(folder) {
      const loaded = laag.map(folder)
      const ids = new Set<string>(loaded.stops.keys())
      for (const trip of loaded.trips.values()) for (const stop of trip.stops) ids.add(stop.id)
      const { geometry, lanes } = readMapData(loaded.path, ids, omsiPath)
      // Busstops.cfg is de bron voor de namen; wat er in de tegel staat is de
      // naam van het object en heet lang niet altijd naar de halte.
      for (const stop of geometry.stops) {
        const known = loaded.stops.get(stop.id)
        if (known?.name) stop.name = known.name
      }
      geometryCache.set(folder, geometry)
      laneCache.set(folder, lanes)

      const afdruk = vingerafdruk(kaartPad(folder))
      schrijfInCache(userData, folder, 'tekening', afdruk, geometry)
      schrijfInCache(userData, folder, 'stroken', afdruk, lanes)
      return { geometry, lanes }
    },

    kaartStaatKlaar(folder) {
      if (geometryCache.has(folder) && laneCache.has(folder)) return true
      const afdruk = vingerafdruk(kaartPad(folder))
      return (
        Boolean(leesUitCache<MapGeometry>(userData, folder, 'tekening', afdruk)) &&
        Boolean(leesUitCache<Lane[]>(userData, folder, 'stroken', afdruk))
      )
    },

    geometrie(folder) {
      const cached = geometryCache.get(folder)
      if (cached) return cached
      const vanSchijf = leesUitCache<MapGeometry>(
        userData,
        folder,
        'tekening',
        vingerafdruk(kaartPad(folder))
      )
      if (vanSchijf) {
        geometryCache.set(folder, vanSchijf)
        return vanSchijf
      }
      return laag.leesKaart(folder).geometry
    },

    stroken(folder) {
      const cached = laneCache.get(folder)
      if (cached) return cached
      const vanSchijf = leesUitCache<Lane[]>(
        userData,
        folder,
        'stroken',
        vingerafdruk(kaartPad(folder))
      )
      if (vanSchijf) {
        laneCache.set(folder, vanSchijf)
        return vanSchijf
      }
      return laag.leesKaart(folder).lanes
    },

    rijstrokennet(folder) {
      const cached = laneNetworkCache.get(folder)
      if (cached) return cached
      const built = new LaneNetwork(laag.stroken(folder))
      laneNetworkCache.set(folder, built)
      return built
    },

    net(folder) {
      const cached = networkCache.get(folder)
      if (cached) return cached
      const built = buildNetwork(laag.map(folder))
      networkCache.set(folder, built)
      return built
    },

    wagenparkVanKaart(folder) {
      const cached = mapFleetCache.get(folder)
      if (cached) return cached
      const gevonden = readMapFleet(kaartPad(folder))
      mapFleetCache.set(folder, gevonden)
      return gevonden
    },

    eindbestemmingen(folder) {
      const cached = mapTerminiCache.get(folder)
      if (cached) return cached
      const gevonden = new Set<string>()
      for (const trip of laag.map(folder).trips.values()) {
        if (trip.terminus) gevonden.add(trip.terminus)
      }
      const lijst = [...gevonden]
      mapTerminiCache.set(folder, lijst)
      return lijst
    },

    remises(folder) {
      const cached = mapDepotCache.get(folder)
      if (cached) return cached
      const depot = readMapDepot(kaartPad(folder))
      mapDepotCache.set(folder, depot)
      return depot
    },

    /*
     * Het tijdvak waarin een kaart speelt. Bij voorkeur uit haar
     * situatiebestand; heeft de kaart er geen, dan draagt de mapnaam het jaartal
     * vaak zelf ("Vienna_2005_Line_24A"). Dat jaar bepaalt welk wagenpark-bestand
     * geldt, dus terugvallen op het huidige jaar zou de verkeerde
     * bestemmingscodes opleveren.
     */
    tijdvak(folder) {
      const cached = mapEraCache.get(folder)
      if (cached) return cached
      /*
       * Zonder de situaties die de app zelf schreef: die dragen de datum van de
       * vorige rit, en dan werd een zelfgekozen datum het tijdvak van de kaart.
       */
      const template = findTemplate(omsiPath, folder, { zonderEigen: true })
      const fromName = folder.match(/(19\d{2}|20[0-2]\d)/)
      const time = (template && readSituationTime(template)) || {
        year: fromName ? Number.parseInt(fromName[1], 10) : new Date().getFullYear(),
        dayOfYear: 180
      }
      mapEraCache.set(folder, time)
      return time
    },

    kalender(folder) {
      const cached = calendarCache.get(folder)
      if (cached) return cached
      // Alleen Holidays.txt; daarvoor hoeft de dienstregeling niet open.
      const built = readCalendar(kaartPad(folder))
      calendarCache.set(folder, built)
      return built
    },

    dienstDatum(folder, days) {
      const start = laag.tijdvak(folder)
      const found = dateForMask(laag.kalender(folder), start.year, start.dayOfYear, days)
      if (!found) return undefined
      return {
        year: found.year,
        dayOfYear: found.dayOfYear,
        iso: found.date.toISOString().slice(0, 10),
        kind: dayKind(laag.kalender(folder), found.date)
      }
    },

    /*
     * De busindex, en waarom hij op schijf staat.
     *
     * `buildFleetIndex` opent van elke voertuigmap de .hof-bestanden. Hier kost
     * dat een halve seconde; in het logboek van een speler met veel add-ons
     * stond alleen al het wagenparkaanbod op 14449 ms. Het antwoord verandert
     * pas als er een bus bij komt, en dat ziet de vingerafdruk van de map
     * Vehicles. Een Map overleeft JSON niet, dus hij gaat als paren heen en
     * weer.
     */
    wagenpark() {
      if (fleetIndex) return fleetIndex
      const afdruk = wagenparkAfdruk(omsiPath)
      const bewaard = leesUitCache<{ vehicles: Vehicle[]; hofs: Array<[string, Hof[]]> }>(
        userData,
        '_bussen',
        'index',
        afdruk
      )
      if (bewaard) {
        fleetIndex = { vehicles: bewaard.vehicles, hofsByFolder: new Map(bewaard.hofs) }
        return fleetIndex
      }
      fleetIndex = buildFleetIndex(omsiPath)
      schrijfInCache(userData, '_bussen', 'index', afdruk, {
        vehicles: fleetIndex.vehicles,
        hofs: [...fleetIndex.hofsByFolder]
      })
      return fleetIndex
    },

    /** Dezelfde reden als hierboven: één keer lezen, daarna van schijf. */
    wagenparkBestanden() {
      if (hofBestanden) return hofBestanden
      const afdruk = wagenparkAfdruk(omsiPath)
      const bewaard = leesUitCache<HofFile[]>(userData, '_bussen', 'hofs', afdruk)
      if (bewaard) {
        hofBestanden = bewaard
        return bewaard
      }
      hofBestanden = scanHofs(omsiPath)
      schrijfInCache(userData, '_bussen', 'hofs', afdruk, hofBestanden)
      return hofBestanden
    },

    /**
     * De kaartenlijst.
     *
     * Elke samenvatting kost het inlezen van de dienstregeling van die kaart,
     * en dat is samen ruim acht tiende seconde bij twaalf kaarten -- precies
     * bij het openen van de app. Daarom gaat ook dit naar de schijfcache, met
     * dezelfde vingerafdruk als de tekening: verandert er niets aan de kaart,
     * dan hoeft er niets opnieuw gelezen te worden.
     */
    overzicht() {
      const uit: MapSummary[] = []
      for (const folder of listMaps(omsiPath)) {
        try {
          const afdruk = vingerafdruk(kaartPad(folder))
          // 'overzicht2': het tijdvak komt sinds vrij rijden 0.4.8 niet meer uit de eigen situaties.
          const bewaard = leesUitCache<MapSummary>(userData, folder, 'overzicht2', afdruk)
          if (bewaard) {
            uit.push(bewaard)
            continue
          }
          // Alleen de naam en het aantal omlopen; de ritten blijven dicht.
          const kort = readMapOverview(join(omsiPath, 'maps'), folder)
          if (!kort) continue
          const tijd = laag.tijdvak(folder)
          const samenvatting: MapSummary = {
            folder,
            name: kort.name,
            tours: kort.tours,
            hasTemplate: Boolean(findTemplate(omsiPath, folder)),
            year: tijd.year,
            dayOfYear: tijd.dayOfYear
          }
          schrijfInCache(userData, folder, 'overzicht2', afdruk, samenvatting)
          uit.push(samenvatting)
        } catch {
          // Een kaart die niet te lezen is hoort de lijst niet te breken.
        }
      }
      return uit
    },

    voertuigen() {
      if (!voertuigenCache) voertuigenCache = listVehicles(omsiPath)
      return voertuigenCache
    },

    busvoorstel(folder) {
      return suggestFromDepot(laag.wagenpark().vehicles, laag.remises(folder))
    },

    /**
     * Wat er aan wagenparken te winnen valt op deze kaart.
     *
     * `planHofs` leest alle .hof-bestanden -- 448 op deze installatie, ruim een
     * seconde koud -- en houdt dat daarna zelf vast zolang de vingerafdruk van
     * de voertuigmappen klopt. Hier staat alleen de vertaling naar wat het
     * scherm nodig heeft.
     */
    hofAanbod(folder) {
      const termini = laag.eindbestemmingen(folder)
      return plan(folder)
        .filter((bus) => bus.offer && bus.offer.matched > bus.known)
        .map((bus) => aanbodVan(bus, termini.length))
        .filter((aanbod): aanbod is HofOffer => aanbod !== undefined)
        .sort((a, b) => (b.offerMatched ?? 0) - (a.offerMatched ?? 0))
    },

    /**
     * Hetzelfde, maar voor één bus.
     *
     * Dit hing in het hoofdproces en rekende zijn eigen plan uit -- zonder de
     * bewaarde lijst wagenparkbestanden, dus met een lezing van alle .hof van
     * schijf erbij. In het logboek van een speler stond die ene vraag op
     * 18990 ms, en zo lang stond de hele app stil: elke keer dat je in het
     * busmenu een andere bus aanwees. Nu komt het uit hetzelfde plan als de
     * lijst hierboven.
     */
    wagenparkKandidaat(termini, busmap, kaartFolder) {
      const schoon = [...new Set(termini.filter(Boolean))]
      if (schoon.length === 0) return undefined
      /*
       * De bestemmingen van de hele kaart bepalen welk bestand van déze kaart
       * is; die van de dienst bepalen daarna wat er voor jou te halen valt.
       */
      let kaartTermini: string[] = []
      try {
        if (kaartFolder) kaartTermini = laag.eindbestemmingen(kaartFolder)
      } catch {
        kaartTermini = []
      }
      return besteKandidaat(omsiPath, schoon, busmap, laag.wagenparkBestanden(), kaartTermini)
    },

    hofAanbodVoorRit(termini, busmap) {
      const schoon = [...new Set(termini.filter(Boolean))]
      if (schoon.length === 0) return undefined
      const sleutel = `rit:${[...schoon].sort().join('')}`
      let plan = aanbodCache.get(sleutel)
      if (!plan) {
        plan = planHofs(omsiPath, schoon, laag.wagenparkBestanden())
        aanbodCache.set(sleutel, plan)
      }
      const bus = plan.find((item) => item.folder === busmap)
      if (!bus?.offer || bus.offer.matched <= bus.known) return undefined
      return aanbodVan(bus, schoon.length)
    },

    hofAanbodVoor(folder, busmap) {
      const termini = laag.eindbestemmingen(folder)
      const bus = plan(folder).find((item) => item.folder === busmap)
      if (!bus?.offer || bus.offer.matched <= bus.known) return undefined
      return aanbodVan(bus, termini.length)
    },

    /**
     * Een rooster om uit te kiezen, met bij elke dienst een passende bus.
     *
     * Lukt het niet binnen het gevraagde dagdeel, dan verruimen we stapsgewijs;
     * een lege lijst is voor de speler hetzelfde als een kapotte app.
     */
    diensten(request) {
      const window = TIME_WINDOWS[request.window] ?? TIME_WINDOWS.heledag
      const loaded = laag.map(request.mapFolder)
      const net = laag.net(request.mapFolder)
      const { year } = laag.tijdvak(request.mapFolder)
      const mapFleet = laag.wagenparkVanKaart(request.mapFolder)

      let duties: ReturnType<typeof generateDuties> = []
      for (const tolerance of [undefined, 40, 75]) {
        duties = generateDuties(loaded, net, {
          targetMinutes: request.targetMinutes,
          toleranceMinutes: tolerance,
          earliestStart: request.earliestStart ?? window.from,
          latestStart: request.latestStart ?? window.to,
          lineFile: request.lineFile,
          lineFiles: request.lineFiles
        })
        if (duties.length > 0) break
      }

      // Eén geheugen voor de hele lijst: acht diensten delen hun bestemmingen.
      const busGeheugen = maakBusGeheugen()
      return duties.map((duty) => {
        const choice = pickVehicleForDuty(
          laag.wagenpark(),
          duty,
          year,
          mapFleet,
          undefined,
          laag.remises(request.mapFolder),
          busGeheugen
        )
        return {
          duty,
          date: laag.dienstDatum(request.mapFolder, duty.days | duty.period),
          vehicle: choice?.vehicle ?? null,
          yard: choice?.yard,
          fit: choice?.fit,
          fromMapFleet: choice?.fromMapFleet,
          alternatives: choice?.alternatives
        }
      })
    },

    /**
     * De route van elke rit, als lijn over de kaart. Eenmaal per rit
     * uitgerekend; het rijstrokennet wordt pas opgebouwd als een rit geen
     * bruikbare route van OMSI zelf heeft.
     */
    bustekening(busPad, kleurstelling) {
      return bouwBusTekeningMetPlaten(busPad, kleurstelling)
    },

    kleurstellingen(busPad) {
      const info = kleurstellingenVanBus(busPad)
      if (!info) return undefined
      // Een eigen lak uit de Lakstudio (§6, punt 1): aan de bestandsnaam, en in alle delen van de bus.
      const eigen = eigenKleurstellingen(busPad)
      return {
        variabele: info.variabele,
        lijst: info.lijst.map(({ index, naam, setvars }) =>
          eigen.has(omsiHoofdletters(naam)) ? { index, naam, setvars, eigen: true as const } : { index, naam, setvars }
        )
      }
    },

    kaartDag(folder, lineFiles, anker, dag) {
      const sleutel = `${folder}|${[...lineFiles].sort().join(',')}|${anker}|${dag}`
      const bewaard = kaartDagCache.get(sleutel)
      if (bewaard) return bewaard
      // Bevroren: het geheugen deelt hetzelfde object met elke vraag, en wie het
      // aanpast (deel A of B) zou de dag van alle volgende vragen veranderen.
      const uit = diepBevroren(kaartDag(laag.map(folder), laag.kalender(folder), lineFiles, anker, dag))
      kaartDagCache.set(sleutel, uit)
      // De oudste eruit: een Map houdt de volgorde van toevoegen aan.
      if (kaartDagCache.size > 64) kaartDagCache.delete(kaartDagCache.keys().next().value!)
      return uit
    },

    /*
     * Ook bewaard: dagAf en de migratie vragen hem elke keer, en een concessie
     * waarvan de lijn niet in de dienstregeling staat, krijgt nooit een week en
     * vroeg hem dus bij elke afsluiting opnieuw (7-14 ms per kaart bij Luc).
     */
    lijnWeek(folder, anker, vanDag) {
      const sleutel = `${folder}|${anker}|${vanDag}`
      const bewaard = lijnWeekCache.get(sleutel)
      if (bewaard) return bewaard
      const uit = diepBevroren(lijnWeek(laag.map(folder), laag.kalender(folder), anker, vanDag))
      lijnWeekCache.set(sleutel, uit)
      if (lijnWeekCache.size > 16) lijnWeekCache.delete(lijnWeekCache.keys().next().value!)
      return uit
    },

    /*
     * Opnieuw opgebouwd als de map maps/ veranderd is (er kwam een kaart bij,
     * bijvoorbeeld een DLC die Steam installeert terwijl de app draait), en in
     * elk geval na vijf minuten: Verkenner maakt de kaartmap aan voor TTData
     * erin gekopieerd is. De tijd van maps/ opvragen kost 0,1 ms; opbouwen
     * 15-26 ms bij Luc (14 kaarten, 312 lijnbestanden).
     */
    kaartenMetLijn(lijn) {
      let mapsTijd = 0
      try {
        mapsTijd = statSync(join(omsiPath, 'maps')).mtimeMs
      } catch {
        // Zonder maps/ geen kaarten; de lege index hieronder zegt dat al.
      }
      // Niet Date.now(): wie de klok van de pc terugzet, zou het vernieuwen uitstellen.
      const nu = performance.now()
      if (!lijnIndex || lijnIndex.mapsTijd !== mapsTijd || nu - lijnIndex.gebouwd > 5 * 60_000) {
        // Eerst helemaal opbouwen, dan pas vastleggen: een fout halverwege
        // liet anders de hele sessie een lege of halve index achter.
        const lijnen = new Map<string, LijnPlek[]>()
        for (const folder of listMaps(omsiPath)) {
          let namen: string[]
          try {
            namen = readdirSync(join(kaartPad(folder), 'TTData'))
          } catch {
            continue
          }
          /*
           * In de volgorde van readdir, niet gesorteerd: OMSI sorteert ook niet
           * maar neemt die van FindFirstFile (de lader op 0072D434), en libuv
           * vraagt dezelfde lijst aan Windows. Op NTFS is dat alfabetisch in
           * hoofdletters, op exFAT of een netwerkschijf niet per se.
           */
          const ttl = namen.filter((n) => /\.ttl$/i.test(n))
          ttl.forEach((naam, plek) => {
            const sleutel = lijnSleutel(naam)
            const al = lijnen.get(sleutel) ?? []
            // "Lead.ttl" en " Lead.ttl" op één kaart zijn voor de klok één lijn;
            // in OMSI's lijst staan ze wel allebei, dus `lijnen` telt ze allebei.
            if (!al.some((p) => p.folder === folder)) lijnen.set(sleutel, [...al, { folder, plek, lijnen: ttl.length }])
          })
        }
        lijnIndex = { lijnen, mapsTijd, gebouwd: nu }
      }
      return lijnIndex.lijnen.get(lijnSleutel(lijn)) ?? []
    },

    dienstDuty(folder, deel) {
      return dutyVanRitten(laag.map(folder), laag.net(folder), deel)
    },

    lijnplan(folder, lineFiles, anker, dag) {
      return bouwLijnplan(laag.map(folder), (legs) => laag.routes(folder, legs), lineFiles, laag.kalender(folder), anker, dag)
    },

    routes(folder, legs) {
      const loaded = laag.map(folder)
      const geometry = laag.geometrie(folder)
      const stopAt = new Map(geometry.stops.map((stop) => [stop.id, stop]))
      /*
       * Per traject één keer, ook tussen twee vragen door: een omloop rijdt de
       * hele dag dezelfde paar ritten (Wagen 3 op Krefrath: 26 ritten, 9
       * trajecten). Ritten met dezelfde sleutel krijgen hetzelfde voorwerp
       * terug, en dat gaat dan ook maar één keer over de brug naar het scherm
       * -- structured clone houdt gedeelde voorwerpen gedeeld.
       */
      return legs.map((leg) => {
        const sleutel = `${folder}|${ritSleutel(leg)}`
        const cached = routeCache.get(sleutel)
        if (cached) return cached
        const stops = leg.stopIds.map((id) => stopAt.get(id)).filter((stop) => stop !== undefined)
        /*
         * Minder dan twee haltes op de kaart: een leegrit naar de remise, of
         * een rit waarvan de haltes niet gevonden worden. Dan de `.ttr` van
         * OMSI zelf, als die er is; zonder route blijft de lijn leeg.
         */
        const route =
          stops.length < 2
            ? routeZonderHaltes(loaded.path, omsiPath, leg.tripFile, () => laag.rijstrokennet(folder))
            : routeForTrip(loaded.path, omsiPath, leg.tripFile, stops, () => laag.rijstrokennet(folder))
        routeCache.set(sleutel, route)
        return route
      })
    },

    inzetpunten(folder) {
      const bewaard = inzetCache.get(folder)
      if (bewaard) return bewaard
      const punten = leesInzetpunten(kaartPad(folder))
      inzetCache.set(folder, punten)
      return punten
    },

    ttlNamen(folder) {
      return namenIn(folder, '.ttl', ttlCache)
    },

    ttpNamen(folder) {
      return namenIn(folder, '.ttp', ttpCache)
    },

    vrijCheck(folder, wanneer) {
      /*
       * Een halve minuut bewaard: de kaartstap vraagt het bij elke keuze, en
       * START vraagt het nog eens als de plek van het scherm niet meer klopt.
       * Zonder eigen tijd schuift de klok door, dus niet langer.
       */
      const sleutel = `${folder}|${wanneer?.datum ?? ''}|${wanneer?.tijd ?? ''}`
      const bewaard = checkCache.get(sleutel)
      if (bewaard && Date.now() - bewaard.op < 30_000) return bewaard.uit
      const uit = vrijeControle(folder, wanneer)
      checkCache.set(sleutel, { op: Date.now(), uit })
      return uit
    },

    koppel(folder, keuze, datum, voorkeur) {
      return koppelOmsiKeuze(laag.map(folder), keuze, {
        kalender: laag.kalender(folder),
        ttlNamen: laag.ttlNamen(folder),
        ttpNamen: laag.ttpNamen(folder),
        datum: datum ? new Date(`${datum}T00:00:00Z`) : undefined,
        voorkeur
      })
    },

    vertrekken(folder, datum, klok, bus) {
      const iso = datum ?? laag.dienstDatum(folder, AUTOMATISCH_MASKER)?.iso
      const suggesties = komendeVertrekken(vertrekkenVan(folder, iso), { klok, bus })
      /* De halte waar de bus staat, als hij er vlak bij staat: "Vertrekken vanaf ...". */
      let halte: string | undefined
      if (bus) {
        let dichtst = HALTE_BIJ_M
        for (const stop of laag.geometrie(folder).stops) {
          const afstand = Math.hypot(stop.x - bus.x, stop.y - bus.y)
          if (afstand <= dichtst && stop.name) {
            dichtst = afstand
            halte = stop.name
          }
        }
      }
      return { suggesties, halte }
    },

    herken(folder, monsters) {
      return herkenKaart(omsiPath, folder, kaartMappen(), monsters)
    },

    elders(folder, keuze, monsters) {
      const lijn = (keuze.lineName.trim().split(/[\\/]/).pop() ?? '').replace(/\.ttl$/i, '').trim()
      if (!lijn || onbruikbaar(lijn)) return undefined
      const mappen = kaartMappen()
      const kandidaten = mappen.filter((ander) => {
        if (ander === folder) return false
        if (!existsSync(join(kaartPad(ander), 'TTData', `${lijn}.ttl`))) return false
        if (ritIndexKlopt(laag.ttpNamen(ander), keuze.trip, keuze.tripName) !== true) return false
        return herkenKaart(omsiPath, ander, mappen, monsters).oordeel !== 'anders'
      })
      return kandidaten.length === 1 ? kandidaten[0] : undefined
    },

    vrijeWagenparken(folder, vehiclePath, year) {
      const kaart = laag.map(folder)
      const termini = bestemmingenVan(kaart)
      // Niet bewaard: de app legt zelf wagenparken naast bussen (hof:install).
      const hofs = listHofs(join(omsiPath, vehiclePath))
      const suggested = hofVoorKaart(hofs, kaart, termini, year)
      return hofs
        .map((hof) => ({
          name: hof.name,
          known: matchHof(hof, termini).matched,
          total: termini.length,
          suggested: hof.name === suggested
        }))
        .sort((a, b) => b.known - a.known || a.name.localeCompare(b.name))
    }
  }

  /** De kaarten, eens per minuut opnieuw gelezen: listMaps kost zo'n 15 ms. */
  function kaartMappen(): string[] {
    if (!kaartlijst || Date.now() - kaartlijst.op > 60_000) kaartlijst = { op: Date.now(), mappen: listMaps(omsiPath) }
    return kaartlijst.mappen
  }

  /** De bestanden met deze extensie in TTData, in de volgorde van readdir. */
  function namenIn(folder: string, soort: string, cache: Map<string, string[]>): string[] {
    const bewaard = cache.get(folder)
    if (bewaard) return bewaard
    let namen: string[] = []
    try {
      namen = readdirSync(join(kaartPad(folder), 'TTData'))
        .filter((naam) => extname(naam).toLowerCase() === soort)
        .map((naam) => naam.slice(0, naam.length - soort.length))
    } catch {
      namen = []
    }
    cache.set(folder, namen)
    return namen
  }

  /** Alle vertrekken van een kaart op een datum; de zware som, dus bewaard. */
  function vertrekkenVan(folder: string, iso: string | undefined): Vertrek[] {
    const sleutel = `${folder}|${iso ?? ''}`
    const bewaard = vertrekCache.get(sleutel)
    if (bewaard) return bewaard
    let ttrBegin = ttrBeginCache.get(folder)
    if (!ttrBegin) {
      ttrBegin = new Map()
      ttrBeginCache.set(folder, ttrBegin)
    }
    const alle = vertrekkenOp(
      laag.map(folder),
      laag.geometrie(folder),
      iso ? new Date(`${iso}T00:00:00Z`) : undefined,
      laag.kalender(folder),
      omsiPath,
      ttrBegin
    )
    vertrekCache.set(sleutel, alle)
    return alle
  }

  /**
   * De controle zelf; zie `vrijCheck`. De datum is automatisch een schooldag
   * door de week in het tijdvak van de kaart (masker 287: ma-vr, schooldag),
   * de tijd de klok van de pc.
   */
  function vrijeControle(folder: string, wanneer: VrijWanneer | undefined): VrijCheckVol {
    const pad = kaartPad(folder)
    const nu = new Date()
    const klok = wanneer?.tijd ?? nu.getHours() * 60 + nu.getMinutes()
    const tijdvak = laag.tijdvak(folder)
    const automatisch = wanneer?.datum ? undefined : laag.dienstDatum(folder, AUTOMATISCH_MASKER)
    const iso =
      wanneer?.datum ??
      automatisch?.iso ??
      new Date(Date.UTC(tijdvak.year, 0, tijdvak.dayOfYear)).toISOString().slice(0, 10)
    const dag = new Date(`${iso}T00:00:00Z`)
    const moment = (minutes: number, bron: 'klok' | 'eersteVertrek'): VrijCheckVol['moment'] => ({
      iso,
      year: dag.getUTCFullYear(),
      dayOfYear: Math.round((dag.getTime() - Date.UTC(dag.getUTCFullYear(), 0, 1)) / 86_400_000) + 1,
      minutes,
      bron
    })

    const grid = readTileGrid(pad)
    if (!grid || tegelsCompleet(pad).aanwezig === 0) {
      return { ok: false, fout: 'onvolledig', moment: moment(klok, 'klok') }
    }
    let aantalOmlopen = 0
    try {
      aantalOmlopen = laag.map(folder).tours.length
    } catch {
      aantalOmlopen = 0
    }
    if (aantalOmlopen === 0) return { ok: false, fout: 'geenDienstregeling', moment: moment(klok, 'klok') }

    const vertrekken = vertrekkenVan(folder, iso)
    const punten = laag.inzetpunten(folder)
    let plek: Beginplek | undefined = kiesVertrekplek(punten, vertrekken, {
      klok,
      tijdAutomatisch: wanneer?.tijd === undefined
    })
    if (!plek && punten.length === 0) plek = plekBijHalte(folder, vertrekken, klok)
    if (!plek) return { ok: false, fout: 'geenPlek', moment: moment(klok, 'klok') }
    return { ok: true, plek, moment: moment(plek.klok, plek.klok !== klok ? 'eersteVertrek' : 'klok') }
  }

  /**
   * Een kaart zonder inzetpunten (kaarten van derden): de halte waar in het
   * venster de meeste ritten vertrekken, en de bus op de rijstrook ervoor.
   */
  function plekBijHalte(folder: string, vertrekken: Vertrek[], klok: number): Beginplek | undefined {
    const geometry = laag.geometrie(folder)
    if (geometry.stops.length === 0) return undefined
    const grid = readTileGrid(kaartPad(folder))
    if (!grid) return undefined
    for (const tot of [45, 120, 1440]) {
      const telling = new Map<string, { x: number; y: number; n: number }>()
      for (const vertrek of vertrekken) {
        const na = minutenNa(vertrek.dep, klok)
        if (na < 5 || na > tot) continue
        const sleutel = `${Math.round(vertrek.x)},${Math.round(vertrek.y)}`
        const bestaand = telling.get(sleutel)
        if (bestaand) bestaand.n++
        else telling.set(sleutel, { x: vertrek.x, y: vertrek.y, n: 1 })
      }
      const volgorde = [...telling.values()].sort((a, b) => b.n - a.n)
      for (const kandidaat of volgorde) {
        const stop = geometry.stops.find((item) => Math.hypot(item.x - kandidaat.x, item.y - kandidaat.y) < 1)
        if (!stop) continue
        const spawn = spawnAtStop(kaartPad(folder), grid, laag.rijstrokennet(folder), stop)
        if (!spawn) continue
        return {
          nr: -1,
          naam: stop.name,
          bron: 'halte',
          aantal: tot < 1440 ? kandidaat.n : 0,
          tot: tot < 1440 ? (klok + tot) % 1440 : undefined,
          klok,
          spawn: {
            tx: spawn.tx,
            ty: spawn.ty,
            x: spawn.x,
            z: spawn.z,
            height: spawn.height,
            heading: spawn.heading
          },
          wereld: { x: stop.x, y: stop.y }
        }
      }
    }
    return undefined
  }

  return laag
}

/** Schooldag, maandag tot en met vrijdag: het masker van een gewone werkdagomloop. */
const AUTOMATISCH_MASKER = 287
/** Binnen zoveel meter van een halte staat de bus "bij" die halte. */
const HALTE_BIJ_M = 40
