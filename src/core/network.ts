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
        days: tour.days & WEEKDAY_MASK
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

/**
 * Alle ritten die na aankomst van `run` vanaf datzelfde eindpunt vertrekken en
 * op minstens een gemeenschappelijke dag rijden.
 *
 * Die dagtoets is geen franje: zonder haar belandt een zaterdagomloop in
 * dezelfde dienst als een doordeweekse, en die ritten bestaan op geen enkele
 * dag naast elkaar.
 */
export function continuationsOf(network: Network, run: TripRun, days: number): TripRun[] {
  const place = network.endPlace.get(run.tripFile)
  if (!place) return []
  const options = network.departingFrom.get(place)
  if (!options) return []
  return options.filter(
    (next) =>
      next.departure >= run.arrival &&
      next.departure - run.arrival <= MAX_LAYOVER_MINUTES &&
      (next.days & days) !== 0
  )
}
