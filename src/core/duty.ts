import { buildNetwork, continuationsOf, WEEKDAY_MASK, type Network, type TripRun } from './network'
import { formatDuration, formatTime } from '../shared/format'
import type { Duty, DutyLeg, OmsiMap } from './types'

export { formatDuration, formatTime }
export { buildNetwork } from './network'
export type { Network } from './network'

/** Aanmelden bij de remise, voor vertrek. */
export const SIGN_ON_MINUTES = 10

/** Korter dan dit is geen dienst meer maar één rondje. */
export const MIN_DUTY_MINUTES = 30

/** Een dienst bestaat uit meerdere ritten; één rit heen is geen dienst. */
export const MIN_LEGS = 2

export interface DutyOptions {
  /** Gewenste dienstlengte in minuten. */
  targetMinutes: number
  /** Hoeveel de dienst daarvan mag afwijken. */
  toleranceMinutes?: number
  /** Vroegste en laatste vertrek, in minuten na middernacht. */
  earliestStart?: number
  latestStart?: number
  random?: () => number
  /** Hoe vaak een doodgelopen wandeling opnieuw geprobeerd wordt. */
  attempts?: number
}

function pick<T>(items: T[], random: () => number): T {
  return items[Math.floor(random() * items.length)]
}

/**
 * Loopt vanaf een beginrit door het net tot de gevraagde lengte gehaald is. Op
 * elk eindpunt wordt willekeurig gekozen uit wat daar vertrekt: terug waar je
 * vandaan kwam, of een andere lijn die daar ook begint. Dezelfde vraag levert
 * daardoor twee keer achter elkaar een andere dienst op.
 */
function walk(
  network: Network,
  start: TripRun,
  target: number,
  tolerance: number,
  random: () => number
): TripRun[] {
  const legs = [start]
  let last = start
  // Doorsnede van de dagen waarop alle gekozen ritten rijden.
  let days = start.days

  for (;;) {
    const enough = legs.length >= MIN_LEGS && last.arrival - start.departure >= target - tolerance
    if (enough) break

    // Alleen vervolgen die de dienst niet over de bovengrens heen tillen.
    const options = continuationsOf(network, last, days).filter(
      (next) => next.arrival - start.departure <= target + tolerance
    )
    if (options.length === 0) break

    last = pick(options, random)
    days &= last.days
    legs.push(last)
  }
  return legs
}

function toDuty(map: OmsiMap, legs: TripRun[]): Duty {
  const start = legs[0]
  const end = legs[legs.length - 1]

  const dutyLegs: DutyLeg[] = legs.map((run, index) => ({
    tripFile: run.tripFile,
    lineNumber: run.trip.lineNumber || run.trip.ident || run.lineFile,
    terminus: run.trip.terminus,
    departure: run.departure,
    arrival: run.arrival,
    minutes: run.minutes,
    tourNumber: run.tourNumber,
    layoverBefore: index === 0 ? 0 : run.departure - legs[index - 1].arrival,
    stops: run.trip.stops.map(
      (stop) => stop.name ?? map.stops.get(stop.id)?.name ?? `halte ${stop.id}`
    )
  }))

  return {
    mapFolder: map.folder,
    mapName: map.name,
    lineFile: start.lineFile,
    tourNumber: start.tourNumber,
    depot: start.depot,
    legs: dutyLegs,
    signOn: start.departure - SIGN_ON_MINUTES,
    start: start.departure,
    end: end.arrival,
    durationMinutes: end.arrival - start.departure,
    totalStops: dutyLegs.reduce((sum, leg) => sum + leg.stops.length, 0),
    lineNumbers: [...new Set(dutyLegs.map((leg) => leg.lineNumber).filter(Boolean))],
    days: legs.reduce((mask, run) => mask & run.days, legs[0].days)
  }
}

/**
 * Wijst een dienst toe van ongeveer de gevraagde lengte.
 *
 * De ritten sluiten op elkaar aan omdat ze uit het net van de kaart komen: waar
 * de vorige rit eindigt, begint de volgende. De speler hoeft in OMSI dus nooit
 * te verplaatsen.
 */
export function generateDuty(
  map: OmsiMap,
  network: Network,
  options: DutyOptions
): Duty | undefined {
  const random = options.random ?? Math.random
  const target = Math.max(MIN_DUTY_MINUTES, options.targetMinutes)
  // Bij korte diensten moet de speling ruimer: twee ritten passen zelden precies
  // in een half uur, en dan zou er helemaal niets uitkomen.
  const tolerance = options.toleranceMinutes ?? Math.max(12, Math.round(target * 0.2))

  const starts: TripRun[] = []
  for (const list of network.departingFrom.values()) {
    for (const run of list) {
      if (options.earliestStart !== undefined && run.departure < options.earliestStart) continue
      if (options.latestStart !== undefined && run.departure > options.latestStart) continue
      // Een omloop die alleen op feestdagen rijdt past op geen enkele gewone datum.
      if ((run.days & WEEKDAY_MASK) === 0) continue
      starts.push(run)
    }
  }
  if (starts.length === 0) return undefined

  const attempts = options.attempts ?? 60
  const floor = Math.max(MIN_DUTY_MINUTES, target - tolerance)
  let best: TripRun[] | undefined

  for (let attempt = 0; attempt < attempts; attempt++) {
    const legs = walk(network, pick(starts, random), target, tolerance, random)
    const duration = legs[legs.length - 1].arrival - legs[0].departure
    if (legs.length >= MIN_LEGS && duration >= floor) return toDuty(map, legs)
    // Anders de langste poging bewaren, zodat er iets bruikbaars overblijft.
    if (legs.length < MIN_LEGS) continue
    if (!best || duration > best[best.length - 1].arrival - best[0].departure) best = legs
  }

  if (
    best &&
    best.length >= MIN_LEGS &&
    best[best.length - 1].arrival - best[0].departure >= MIN_DUTY_MINUTES
  ) {
    return toDuty(map, best)
  }
  return undefined
}

/** Gemiddeld aantal vervolgritten op een eindpunt: maat voor de keuzevrijheid. */
export function branchingFactor(map: OmsiMap, network?: Network): number {
  const net = network ?? buildNetwork(map)
  const seen = new Set<string>()
  let total = 0
  let counted = 0
  for (const list of net.departingFrom.values()) {
    for (const run of list) {
      if (seen.has(run.tripFile)) continue
      seen.add(run.tripFile)
      const place = net.endPlace.get(run.tripFile)
      const options = place ? net.departingFrom.get(place) ?? [] : []
      total += new Set(options.map((option) => option.tripFile)).size
      counted++
    }
  }
  return counted === 0 ? 0 : total / counted
}
