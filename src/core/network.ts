import { tripMinutes } from './timetable'
import type { OmsiMap, Trip } from './types'

/** Ritten met minder haltes zijn geen buslijn maar trein-, tram- of sleepverkeer. */
export const MIN_STOPS_FOR_BUS_LINE = 3

/**
 * Staat een voertuig langer dan dit stil, dan is dat in de praktijk een
 * aflossing en geen aansluiting: de dienst loopt daar niet doorheen.
 */
export const MAX_LAYOVER_MINUTES = 45

/**
 * Alleen de echte weekdagen tellen mee bij het koppelen. De bits daarboven zijn
 * feestdagcategorieen, en daar overlappen een zaterdag- en een zondagomloop
 * elkaar: zonder deze afkapping komen die in dezelfde dienst terecht. De app
 * schrijft een concrete kalenderdatum weg, dus de dienst moet op een gewone
 * weekdag kloppen.
 */
export const WEEKDAY_MASK = 0b1111111

/**
 * De bits daarboven: feestdag, schooldag, schoolvakantie. Ze zeggen in welke
 * periode een omloop geldt en niet op welke weekdag, dus ze horen niet in de
 * koppeling thuis -- maar wel op de dienst, want zonder komt de omloop niet in
 * het dienstregelingsmenu voor. Zie calendar.ts.
 */
export const PERIOD_MASK = 0b1110000000

/** Eén geplande rit: een rit op een concreet tijdstip, zoals hij in een omloop staat. */
export interface TripRun {
  tripFile: string
  trip: Trip
  departure: number
  arrival: number
  minutes: number
  lineFile: string
  tourNumber: string
  depot: string
  /** Periode waarin de omloop geldt: feestdag, schooldag, schoolvakantie. */
  period: number
  /** Welk rijtijdprofiel de omloop voor deze rit voorschrijft. */
  profileIndex: number
  /** Dagen waarop deze rit rijdt; zie Tour.days. */
  days: number
}

/**
 * Het berijdbare net van een kaart: welke ritten er vanaf welk eindpunt vertrekken.
 *
 * De aansluitingen komen uitsluitend uit de omlopen. Wat één voertuig achter
 * elkaar rijdt, sluit gegarandeerd aan; haltenamen of -id's vergelijken zou dat
 * niet doen, want op Thüringer Wald klopt de halte-id maar in 19% van de gevallen
 * en zelfs de naam maar in 78%.
 */
export interface Network {
  /** Plaats waar een rit eindigt, als groeps-id. */
  endPlace: Map<string, string>
  /** Geplande ritten per beginplaats, oplopend op vertrektijd. */
  departingFrom: Map<string, TripRun[]>
  /** Aantal onderscheiden plaatsen; maat voor hoe fijnmazig het net is. */
  placeCount: number
}

/** Vereniging van plaatsen, met padcompressie. */
class Places {
  private parent = new Map<string, string>()

  find(node: string): string {
    const up = this.parent.get(node)
    if (up === undefined) {
      this.parent.set(node, node)
      return node
    }
    if (up === node) return node
    const root = this.find(up)
    this.parent.set(node, root)
    return root
  }

  union(a: string, b: string): void {
    const rootA = this.find(a)
    const rootB = this.find(b)
    if (rootA !== rootB) this.parent.set(rootA, rootB)
  }
}

function isBusTrip(trip: Trip | undefined): trip is Trip {
  return Boolean(trip) && trip!.stops.length >= MIN_STOPS_FOR_BUS_LINE
}

/**
 * Bouwt het net van een kaart.
 *
 * De truc zit in het samenvoegen van plaatsen: volgt rit B ergens op rit A, en
 * volgt B ook op rit C, dan eindigen A en C op dezelfde plek. Alles wat op A mag
 * volgen mag dan ook op C volgen. Dat verdubbelt tot verviervoudigt het aantal
 * keuzes op een eindpunt zonder ook maar één aansluiting te verzinnen.
 */
export function buildNetwork(map: OmsiMap): Network {
  const places = new Places()
  const runs: TripRun[] = []

  for (const tour of map.tours) {
    const entries = [...tour.trips].sort((a, b) => a.departure - b.departure)
    let previous: TripRun | undefined

    for (const entry of entries) {
      const trip = map.trips.get(entry.tripFile.toLowerCase())
      if (!isBusTrip(trip)) {
        previous = undefined
        continue
      }
      const minutes = tripMinutes(trip, entry.profileIndex)
      const run: TripRun = {
        tripFile: entry.tripFile.toLowerCase(),
        trip,
        departure: entry.departure,
        arrival: entry.departure + minutes,
        minutes,
        lineFile: tour.lineFile,
        tourNumber: tour.number,
        depot: tour.depot,
        days: tour.days & WEEKDAY_MASK,
        period: tour.days & PERIOD_MASK,
        profileIndex: entry.profileIndex
      }
      runs.push(run)

      if (previous) {
        const gap = run.departure - previous.arrival
        if (gap >= 0 && gap <= MAX_LAYOVER_MINUTES) {
          places.union(`end:${previous.tripFile}`, `start:${run.tripFile}`)
        }
      }
      previous = run
    }
  }

  /*
   * En dan nog de knooppunten. Wat hierboven is samengevoegd komt uit de
   * omlopen: wat één voertuig achter elkaar rijdt, staat op dezelfde plek. Dat
   * is waterdicht, maar het ziet een station niet als de lijnen daar van
   * verschillende voertuigen zijn -- en juist daar wil een chauffeur overstappen.
   *
   * Eindigt een rit bij dezelfde haltepaal als waar een andere begint, dan staat
   * de bus er al. Het id is dat van het object in de tegel, dus twee ritten met
   * hetzelfde id staan werkelijk bij dezelfde paal; namen vergelijken zou dat
   * niet doen (op Thüringer Wald klopt de naam maar in 78% van de gevallen).
   */
  const endsAt = new Map<string, string[]>()
  const startsAt = new Map<string, string[]>()
  for (const run of runs) {
    const stops = run.trip.stops
    if (stops.length < 2) continue
    const first = stops[0].id
    const last = stops[stops.length - 1].id
    if (last) endsAt.set(last, [...(endsAt.get(last) ?? []), `end:${run.tripFile}`])
    if (first) startsAt.set(first, [...(startsAt.get(first) ?? []), `start:${run.tripFile}`])
  }
  for (const [stop, ends] of endsAt) {
    const starts = startsAt.get(stop)
    if (!starts) continue
    for (const end of ends) for (const start of starts) places.union(end, start)
  }

  const endPlace = new Map<string, string>()
  const departingFrom = new Map<string, TripRun[]>()

  for (const run of runs) {
    if (!endPlace.has(run.tripFile)) endPlace.set(run.tripFile, places.find(`end:${run.tripFile}`))
    const start = places.find(`start:${run.tripFile}`)
    const list = departingFrom.get(start) ?? []
    list.push(run)
    departingFrom.set(start, list)
  }

  for (const list of departingFrom.values()) {
    list.sort((a, b) => a.departure - b.departure)
  }

  return {
    endPlace,
    departingFrom,
    placeCount: new Set([...endPlace.values()]).size
  }
}

/** Lijnbestand plus omloopnummer: precies wat OMSI's menu als Line en Tour toont. */
export function tourKey(run: TripRun): string {
  return `${run.lineFile}\u0000${run.tourNumber}`
}

/**
 * Zoveel minuten moet er tussen zitten om in OMSI een andere omloop te kiezen.
 *
 * Binnen dezelfde omloop rijdt de bus gewoon door; stap je over naar een andere,
 * dan moet je Set Time Table opnieuw in. Dat kost geen kwartier, maar met een
 * minuut ben je te laat weg.
 */
const SWITCH_LAYOVER_MINUTES = 4

/**
 * Alle ritten die na aankomst van `run` kunnen volgen.
 *
 * In de eerste plaats de rest van dezelfde omloop: dat is wat één voertuig
 * achter elkaar rijdt, en in OMSI staat het al klaar. Maar een chauffeur die op
 * een knooppunt eindigt waar een andere lijn vertrekt, stapt in het echt ook
 * over -- en dat is leuker dan drie uur dezelfde lus. Zulke vervolgen staan er
 * dus ook bij, mits er tijd tussen zit om het in OMSI opnieuw te kiezen.
 *
 * De dagtoets is geen franje: zonder haar zou een zaterdagomloop naast een
 * doordeweekse belanden, en die ritten bestaan op geen enkele dag samen.
 */
export function continuationsOf(network: Network, run: TripRun, days: number): TripRun[] {
  const place = network.endPlace.get(run.tripFile)
  if (!place) return []
  const options = network.departingFrom.get(place)
  if (!options) return []
  const key = tourKey(run)
  return options.filter((next) => {
    if (next.departure < run.arrival) return false
    if (next.departure - run.arrival > MAX_LAYOVER_MINUTES) return false
    if ((next.days & days) === 0) return false
    if (tourKey(next) === key) return true
    // Een andere omloop: alleen met tijd om over te stappen, en niet halverwege
    // de rit van een ander voertuig instappen.
    return next.departure - run.arrival >= SWITCH_LAYOVER_MINUTES
  })
}
