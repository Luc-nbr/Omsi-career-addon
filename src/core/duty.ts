import { tripMinutes } from './timetable'
import type { Duty, DutyLeg, OmsiMap, Tour } from './types'

/** Ritten met minder haltes zijn geen buslijn maar trein-, tram- of sleepverkeer. */
const MIN_STOPS_FOR_BUS_LINE = 3

/**
 * Staat een omloop langer dan dit stil, dan is dat in de praktijk het moment
 * waarop de chauffeur wordt afgelost. Een dienst loopt daar dus niet doorheen.
 */
const MAX_LAYOVER_MINUTES = 45

/** Aanmelden bij de remise, voor vertrek. */
export const SIGN_ON_MINUTES = 10

export interface DutyOptions {
  /** Gewenste dienstlengte in minuten. */
  targetMinutes: number
  /** Hoeveel de dienst daarvan mag afwijken. */
  toleranceMinutes?: number
  /** Vroegste en laatste vertrek, in minuten na middernacht. */
  earliestStart?: number
  latestStart?: number
  /** Beperk tot één lijnbestand, bijvoorbeeld om lijn 5 te rijden. */
  lineFile?: string
  random?: () => number
}

/** Eén mogelijke dienst: een aaneengesloten stuk uit één omloop. */
interface Candidate {
  tour: Tour
  from: number
  to: number
  start: number
  end: number
}

/** `minuten na middernacht` → `uu:mm`, ook voorbij 24:00. */
export function formatTime(minutes: number): string {
  const total = Math.round(minutes)
  const hours = Math.floor(total / 60) % 24
  return `${String(hours).padStart(2, '0')}:${String(((total % 60) + 60) % 60).padStart(2, '0')}`
}

/** `minuten` → `4u 05m`, voor dienstlengtes. */
export function formatDuration(minutes: number): string {
  const total = Math.round(minutes)
  return `${Math.floor(total / 60)}u ${String(total % 60).padStart(2, '0')}m`
}

/** Rijdt deze omloop een echte buslijn met haltes? */
function isBusTour(map: OmsiMap, tour: Tour): boolean {
  return tour.trips.some((entry) => {
    const trip = map.trips.get(entry.tripFile.toLowerCase())
    return (trip?.stops.length ?? 0) >= MIN_STOPS_FOR_BUS_LINE
  })
}

/** Ritten van een omloop op volgorde, met aankomsttijd erbij. */
function timedTrips(map: OmsiMap, tour: Tour) {
  return tour.trips
    .map((entry) => {
      const trip = map.trips.get(entry.tripFile.toLowerCase())
      const minutes = tripMinutes(trip, entry.profileIndex)
      return { entry, trip, minutes, arrival: entry.departure + minutes }
    })
    .filter((item) => item.trip !== undefined)
    .sort((a, b) => a.entry.departure - b.entry.departure)
}

/**
 * Zoekt in alle omlopen de stukken die ongeveer de gevraagde lengte hebben.
 * Een stuk wordt nooit over een lange stilstand heen getrokken.
 */
function findCandidates(map: OmsiMap, options: DutyOptions): Candidate[] {
  const tolerance = options.toleranceMinutes ?? 25
  const candidates: Candidate[] = []

  for (const tour of map.tours) {
    if (options.lineFile && tour.lineFile !== options.lineFile) continue
    if (!isBusTour(map, tour)) continue

    const trips = timedTrips(map, tour)
    if (trips.length === 0) continue

    // Knip de omloop op bij te lange stilstand: elk blok is apart berijdbaar.
    const blocks: number[][] = []
    let block: number[] = [0]
    for (let i = 1; i < trips.length; i++) {
      const gap = trips[i].entry.departure - trips[i - 1].arrival
      if (gap > MAX_LAYOVER_MINUTES) {
        blocks.push(block)
        block = []
      }
      block.push(i)
    }
    blocks.push(block)

    for (const indices of blocks) {
      for (let a = 0; a < indices.length; a++) {
        const start = trips[indices[a]].entry.departure
        if (options.earliestStart !== undefined && start < options.earliestStart) continue
        if (options.latestStart !== undefined && start > options.latestStart) continue

        for (let b = a; b < indices.length; b++) {
          const end = trips[indices[b]].arrival
          const duration = end - start
          if (duration > options.targetMinutes + tolerance) break
          if (duration >= options.targetMinutes - tolerance) {
            candidates.push({ tour, from: indices[a], to: indices[b], start, end })
          }
        }
      }
    }
  }
  return candidates
}

/** Bouwt de dienstkaart op uit een gekozen stuk omloop. */
function toDuty(map: OmsiMap, candidate: Candidate): Duty {
  const trips = timedTrips(map, candidate.tour)
  const legs: DutyLeg[] = []

  for (let i = candidate.from; i <= candidate.to; i++) {
    const { entry, trip, minutes, arrival } = trips[i]
    legs.push({
      tripFile: entry.tripFile,
      lineNumber: trip!.lineNumber || trip!.ident || candidate.tour.lineFile,
      terminus: trip!.terminus,
      departure: entry.departure,
      arrival,
      minutes,
      stops: trip!.stops.map((stop) => stop.name ?? map.stops.get(stop.id)?.name ?? `halte ${stop.id}`)
    })
  }

  const lineNumbers = [...new Set(legs.map((leg) => leg.lineNumber).filter(Boolean))]
  return {
    mapFolder: map.folder,
    mapName: map.name,
    lineFile: candidate.tour.lineFile,
    tourNumber: candidate.tour.number,
    depot: candidate.tour.depot,
    legs,
    signOn: candidate.start - SIGN_ON_MINUTES,
    start: candidate.start,
    end: candidate.end,
    durationMinutes: candidate.end - candidate.start,
    totalStops: legs.reduce((sum, leg) => sum + leg.stops.length, 0),
    lineNumbers
  }
}

/**
 * Wijst een dienst toe van ongeveer de gevraagde lengte. Geeft `undefined` als
 * de kaart niets heeft wat in de buurt komt; de aanroeper kan dan de tolerantie
 * verruimen of een andere lengte voorstellen.
 */
export function generateDuty(map: OmsiMap, options: DutyOptions): Duty | undefined {
  const candidates = findCandidates(map, options)
  if (candidates.length === 0) return undefined
  const random = options.random ?? Math.random
  return toDuty(map, candidates[Math.floor(random() * candidates.length)])
}

/** Hoeveel diensten van deze lengte de kaart te bieden heeft. */
export function countDuties(map: OmsiMap, options: DutyOptions): number {
  return findCandidates(map, options).length
}
