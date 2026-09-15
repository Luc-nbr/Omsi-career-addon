import { buildNetwork, continuationsOf, WEEKDAY_MASK, type Network, type TripRun } from './network'
import { stopOffsets } from './timetable'
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
  /**
   * Alleen ritten van dit lijnbestand. In de carrièremodus rijdt de chauffeur
   * alleen waar hij een vergunning voor heeft, en in dienstmodus kiest hij zijn
   * route zelf; zonder filter mag alles wat de kaart te bieden heeft.
   */
  lineFile?: string
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
  random: () => number,
  lineFile?: string
): TripRun[] {
  const legs = [start]
  let last = start
  // Doorsnede van de dagen waarop alle gekozen ritten rijden.
  let days = start.days
  /*
   * En van de perioden. Een schoolomloop en een vakantieomloop staan nooit
   * samen in het menu, dus ze horen ook niet in dezelfde dienst.
   */
  let period = start.period

  for (;;) {
    const enough = legs.length >= MIN_LEGS && last.arrival - start.departure >= target - tolerance
    if (enough) break

    // Alleen vervolgen die de dienst niet over de bovengrens heen tillen.
    const options = continuationsOf(network, last, days).filter(
      (next) =>
        next.arrival - start.departure <= target + tolerance &&
        (period === 0 || next.period === 0 || (period & next.period) !== 0) &&
        (lineFile === undefined || next.lineFile === lineFile)
    )
    if (options.length === 0) break

    last = pick(options, random)
    days &= last.days
    period = period === 0 || last.period === 0 ? period | last.period : period & last.period
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
    ),
    stopIds: run.trip.stops.map((stop) => stop.id),
    // Vanaf het vertrek van deze rit: de tijden uit het rijtijdprofiel.
    stopTimes: stopOffsets(run.trip, run.profileIndex).map((offset) => run.departure + offset)
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
    days: legs.reduce((mask, run) => mask & run.days, legs[0].days),
    period: legs.reduce(
      (mask, run) => (mask === 0 || run.period === 0 ? mask | run.period : mask & run.period),
      legs[0].period
    )
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
      if (options.lineFile !== undefined && run.lineFile !== options.lineFile) continue
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
    const legs = walk(network, pick(starts, random), target, tolerance, random, options.lineFile)
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

/**
 * Stelt een rooster samen: meerdere verschillende diensten om uit te kiezen.
 *
 * Twee diensten gelden als gelijk zodra ze met dezelfde rit op hetzelfde tijdstip
 * beginnen. Er wordt ruimer gezocht dan `count`, want de wandeling loopt soms
 * dood en dezelfde beginrit komt vaker boven.
 */
export function generateDuties(
  map: OmsiMap,
  network: Network,
  options: DutyOptions,
  count = 8
): Duty[] {
  const found = new Map<string, Duty>()
  for (let attempt = 0; attempt < count * 12 && found.size < count; attempt++) {
    const duty = generateDuty(map, network, options)
    if (!duty) continue
    const key = `${duty.legs[0].tripFile}@${duty.start}`
    if (!found.has(key)) found.set(key, duty)
  }
  return [...found.values()].sort((a, b) => a.start - b.start)
}

/** Een lijn van een kaart, zoals het dienstregelingsmenu van OMSI hem toont. */
export interface LineSummary {
  /** Naam van het lijnbestand; hiermee kiest OMSI de lijn. */
  lineFile: string
  /** De lijnnummers die eronder vallen, voor het tonen. */
  lineNumbers: string[]
  tours: number
  trips: number
  /** Vroegste en laatste vertrek van de dag. */
  first: number
  last: number
  /** Hoe lang een gemiddelde rit duurt; dat is ook de lengte van een examen. */
  averageMinutes: number
}

/**
 * De lijnen waarop gereden kan worden.
 *
 * Alleen wat OMSI zelf vrijgeeft: `loadMap` laat de lijnen zonder
 * `[userallowed]` al weg, dus hier staat geen U-Bahn of vliegtuig tussen.
 */
export function listLines(map: OmsiMap, network?: Network): LineSummary[] {
  const net = network ?? buildNetwork(map)
  const byLine = new Map<string, TripRun[]>()
  for (const list of net.departingFrom.values()) {
    for (const run of list) {
      const runs = byLine.get(run.lineFile) ?? []
      runs.push(run)
      byLine.set(run.lineFile, runs)
    }
  }

  const lines: LineSummary[] = []
  for (const [lineFile, runs] of byLine) {
    // Dezelfde rit staat in het net per vertrektijd; tel ze één keer per lijn.
    const seen = new Set(runs.map((run) => `${run.tripFile}@${run.departure}`))
    lines.push({
      lineFile,
      lineNumbers: [
        ...new Set(runs.map((run) => run.trip.lineNumber || run.trip.ident).filter(Boolean))
      ],
      tours: new Set(runs.map((run) => run.tourNumber)).size,
      trips: seen.size,
      first: Math.min(...runs.map((run) => run.departure)),
      last: Math.max(...runs.map((run) => run.departure)),
      averageMinutes: Math.round(runs.reduce((sum, run) => sum + run.minutes, 0) / runs.length)
    })
  }
  return lines.sort((a, b) => a.lineFile.localeCompare(b.lineFile, undefined, { numeric: true }))
}

/**
 * Eén rit op een gekozen lijn: de examenrit.
 *
 * Voor een examen telt geen dienstlengte en geen aansluiting -- het is één keer
 * van begin tot eind, en daar wordt op afgerekend. Bij voorkeur een rit van
 * normale lengte overdag; die geeft het eerlijkste beeld van de route.
 */
export function examTrip(
  map: OmsiMap,
  network: Network,
  lineFile: string,
  random: () => number = Math.random
): Duty | undefined {
  const candidates: TripRun[] = []
  const seen = new Set<string>()
  for (const list of network.departingFrom.values()) {
    for (const run of list) {
      if (run.lineFile !== lineFile) continue
      if ((run.days & WEEKDAY_MASK) === 0) continue
      // Spitsritten en nachtritten laten we liggen: overdag is het examen eerlijk.
      if (run.departure < 8 * 60 || run.departure > 18 * 60) continue
      if (run.trip.stops.length < 3) continue
      const key = `${run.tripFile}@${run.departure}`
      if (seen.has(key)) continue
      seen.add(key)
      candidates.push(run)
    }
  }
  if (candidates.length === 0) return undefined

  /*
   * Van de ritten die overblijven de langste nemen. Een lijn heeft vaak korte
   * staartritten van zeven minuten naar de remise, en daar valt niets aan af te
   * rijden; het examen hoort over de route te gaan.
   */
  const longest = [...candidates].sort((a, b) => b.minutes - a.minutes)
  return toDuty(map, [pick(longest.slice(0, Math.max(3, Math.ceil(longest.length / 4))), random)])
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
