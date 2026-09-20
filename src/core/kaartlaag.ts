import { join } from 'node:path'
import { dateForMask, dayKind, readCalendar, type Calendar } from './calendar'
import { generateDuties, buildNetwork, type Network } from './duty'
import {
  buildFleetIndex,
  maakBusGeheugen,
  pickVehicleForDuty,
  readMapDepot,
  readMapFleet,
  suggestFromDepot,
  type FleetIndex
} from './fleet'
import { readMapData, type Lane, type MapGeometry } from './geo'
import { leesUitCache, schrijfInCache, vingerafdruk } from './kaartcache'
import { LaneNetwork, routeForTrip, type TripRoute } from './routing'
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
import type { Hof } from './hof'
import type { OmsiMap } from './types'
import {
  TIME_WINDOWS,
  type Assignment,
  type DutyDate,
  type DutyRequest,
  type HofOffer,
  type MapSummary
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
    busmap: string
  ): { path: string; file: string; matched: number; known: number; total: number } | undefined
  /** Alle .hof-bestanden die er liggen; komt van schijf zolang Vehicles niet wijzigt. */
  wagenparkBestanden(): HofFile[]
  diensten(request: DutyRequest): Assignment[]
  routes(folder: string, legs: Array<{ tripFile: string; stopIds: string[] }>): TripRoute[]
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
  let fleetIndex: FleetIndex | undefined
  let voertuigenCache: Vehicle[] | undefined
  let hofBestanden: HofFile[] | undefined

  const aanbodCache = new Map<string, BusHofState[]>()

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
      const template = findTemplate(omsiPath, folder)
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
      const built = readCalendar(laag.map(folder).path)
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
          const bewaard = leesUitCache<MapSummary>(userData, folder, 'overzicht', afdruk)
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
          schrijfInCache(userData, folder, 'overzicht', afdruk, samenvatting)
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
    wagenparkKandidaat(termini, busmap) {
      const schoon = [...new Set(termini.filter(Boolean))]
      if (schoon.length === 0) return undefined
      return besteKandidaat(omsiPath, schoon, busmap, laag.wagenparkBestanden())
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
          earliestStart: window.from,
          latestStart: window.to,
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
    routes(folder, legs) {
      const loaded = laag.map(folder)
      const geometry = laag.geometrie(folder)
      const stopAt = new Map(geometry.stops.map((stop) => [stop.id, stop]))
      return legs.map((leg) => {
        const sleutel = `${folder}|${leg.tripFile}|${leg.stopIds.join(',')}`
        const cached = routeCache.get(sleutel)
        if (cached) return cached
        const stops = leg.stopIds.map((id) => stopAt.get(id)).filter((stop) => stop !== undefined)
        if (stops.length < 2) return { points: [], guessed: [] }
        const route = routeForTrip(loaded.path, omsiPath, leg.tripFile, stops, () =>
          laag.rijstrokennet(folder)
        )
        routeCache.set(sleutel, route)
        return route
      })
    }
  }

  return laag
}
