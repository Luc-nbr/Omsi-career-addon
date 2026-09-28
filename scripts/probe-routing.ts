/**
 * Rijdt de routeplanner dezelfde weg als OMSI?
 *
 * Op kaarten met .ttr-bestanden ligt de echte route er al. Voor elke rit met een
 * schone route (alles gevonden, naadloos) plannen we zelf van halte naar halte en
 * meten: welk deel van onze lijn binnen 5 m van de echte ligt, en hoe de lengtes
 * zich verhouden. Kaarten zonder .ttr krijgen alleen het aandeel gevonden stukken.
 *
 *   npx tsx scripts/probe-routing.ts [kaart ...]
 *   npx tsx scripts/probe-routing.ts --naden [kaart ...]
 *
 * Met `--naden` de meetpoort voor de ".ttr met naden" (NADEN in
 * core/routing.ts): per kaart hoeveel ritten de route van OMSI krijgen zonder
 * en met naden, en of een rit die daardoor van de planner naar de genaaide
 * `.ttr` gaat, verder van OMSI's eigen banen af komt te liggen dan de planner.
 * De poort is open als er meer ritten de route van OMSI krijgen en geen enkele
 * slechter wordt; de afsluitcode zegt het.
 */
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { readMapData } from '../src/core/geo'
import { findOmsiInstall } from '../src/core/install'
import { haltesOp, isHeel, LaneNetwork, metNaden } from '../src/core/routing'
import { loadMap } from '../src/core/timetable'
import { readTrackLine } from '../src/core/track'

const omsi = findOmsiInstall()
if (!omsi) throw new Error('Geen OMSI 2 gevonden.')
const maps = join(omsi, 'maps')
const naden = process.argv.includes('--naden')
const only = process.argv.slice(2).filter((arg) => !arg.startsWith('--'))

function lengthOf(p: number[]): number {
  let total = 0
  for (let i = 2; i < p.length; i += 2) total += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1])
  return total
}

/** Punten om de meter langs een lijn, om twee lijnen eerlijk te vergelijken. */
function sample(p: number[], step = 2): Array<[number, number]> {
  const out: Array<[number, number]> = []
  for (let i = 2; i < p.length; i += 2) {
    const len = Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1])
    const n = Math.max(1, Math.ceil(len / step))
    for (let k = 0; k < n; k++) out.push([p[i - 2] + ((p[i] - p[i - 2]) * k) / n, p[i - 1] + ((p[i + 1] - p[i - 1]) * k) / n])
  }
  return out
}

function nearFraction(line: number[], reference: number[], within: number): number {
  const grid = new Map<string, Array<[number, number]>>()
  for (const [x, y] of sample(reference, 1)) {
    const key = `${Math.floor(x / within)},${Math.floor(y / within)}`
    const cell = grid.get(key)
    if (cell) cell.push([x, y])
    else grid.set(key, [[x, y]])
  }
  const points = sample(line)
  let near = 0
  for (const [x, y] of points) {
    const gx = Math.floor(x / within)
    const gy = Math.floor(y / within)
    let hit = false
    for (let ox = -1; ox <= 1 && !hit; ox++)
      for (let oy = -1; oy <= 1 && !hit; oy++)
        for (const [rx, ry] of grid.get(`${gx + ox},${gy + oy}`) ?? []) {
          if (Math.hypot(rx - x, ry - y) <= within) {
            hit = true
            break
          }
        }
    if (hit) near++
  }
  return points.length ? near / points.length : 0
}

const poort = { heel: 0, genaaid: 0, veranderd: 0, slechter: 0, zonderHaltes: 0, zonderHaltesGenaaid: 0 }
for (const folder of readdirSync(maps)) {
  if (only.length > 0 && !only.includes(folder)) continue
  let loaded
  try {
    loaded = loadMap(maps, folder)
  } catch {
    continue
  }
  if (!loaded) continue
  const ids = new Set<string>(loaded.stops.keys())
  for (const trip of loaded.trips.values()) for (const stop of trip.stops) ids.add(stop.id)

  const started = performance.now()
  const { geometry, lanes } = readMapData(loaded.path, ids, omsi)
  const network = new LaneNetwork(lanes)
  const buildMs = performance.now() - started
  const stopAt = new Map(geometry.stops.map((stop) => [stop.id, stop]))

  let trips = 0
  let pairs = 0
  let routed = 0
  let compared = 0
  const fractions: number[] = []
  const ratios: number[] = []
  let routeMs = 0
  for (const trip of loaded.trips.values()) {
    const stops = trip.stops.map((stop) => stopAt.get(stop.id)).filter((stop) => stop !== undefined)
    if (stops.length < 2) continue
    trips++
    const t0 = performance.now()
    const pieces: number[] = []
    for (let i = 1; i < stops.length; i++) {
      if (Math.hypot(stops[i].x - stops[i - 1].x, stops[i].y - stops[i - 1].y) < 1) continue
      pairs++
      const piece = network.route(stops[i - 1], stops[i])
      if (piece) {
        routed++
        pieces.push(...piece)
      }
    }
    routeMs += performance.now() - t0

    const track = readTrackLine(loaded.path, omsi, trip.file)
    if (!track || track.missing > 0 || track.gaps.some((gap) => gap > 1)) continue
    const ours = network.routeStops(stops)
    if (ours.length < 4) continue
    compared++
    fractions.push(nearFraction(ours, track.points, 5))
    ratios.push(lengthOf(ours) / Math.max(1, lengthOf(track.points)))
  }
  if (naden) {
    /*
     * De meetpoort. De maat is dezelfde als hierboven: welk deel van een lijn
     * binnen 5 m van de banen uit de `.ttr` ligt. Een rit die van de planner
     * naar de genaaide `.ttr` gaat, mag daar niet op achteruitgaan.
     */
    let heel = 0
    let genaaid = 0
    let veranderd = 0
    let slechter = 0
    let zonderHaltes = 0
    let zonderHaltesGenaaid = 0
    let slechtste = 0
    const voorbeelden: string[] = []
    for (const trip of loaded.trips.values()) {
      const track = readTrackLine(loaded.path, omsi, trip.file)
      if (!track) continue
      const stops = trip.stops.map((stop) => stopAt.get(stop.id)).filter((stop) => stop !== undefined)
      if (stops.length < 2) {
        if (isHeel(track)) zonderHaltes++
        else if (metNaden(track, [], () => network)) zonderHaltesGenaaid++
        continue
      }
      if (isHeel(track) && haltesOp(track.points, stops)) {
        heel++
        continue
      }
      const gedicht = metNaden(track, stops, () => network)
      if (!gedicht) continue
      genaaid++
      veranderd++
      const oud = network.routeStops(stops)
      const oudDeel = nearFraction(oud, track.points, 5)
      const nieuwDeel = nearFraction(gedicht.points, track.points, 5)
      if (nieuwDeel + 0.01 < oudDeel) {
        slechter++
        slechtste = Math.max(slechtste, oudDeel - nieuwDeel)
        if (voorbeelden.length < 3) voorbeelden.push(`${trip.file} ${oudDeel.toFixed(3)} -> ${nieuwDeel.toFixed(3)}`)
      }
    }
    poort.heel += heel
    poort.genaaid += genaaid
    poort.veranderd += veranderd
    poort.slechter += slechter
    poort.zonderHaltes += zonderHaltes
    poort.zonderHaltesGenaaid += zonderHaltesGenaaid
    console.log(
      `${folder.padEnd(26)} route van OMSI: heel ${heel}, met naden ${heel + genaaid} (+${genaaid}); ` +
        `leegritten zonder haltes: ${zonderHaltes} heel, +${zonderHaltesGenaaid} met naden; ` +
        `slechter dan de planner ${slechter}${slechter ? ` (tot ${slechtste.toFixed(3)}: ${voorbeelden.join(', ')})` : ''}`
    )
    continue
  }
  fractions.sort((a, b) => a - b)
  ratios.sort((a, b) => a - b)
  const median = (list: number[]): string => (list.length ? list[list.length >> 1].toFixed(3) : '-')
  console.log(
    `${folder.padEnd(22)} net ${lanes.length} stroken in ${buildMs.toFixed(0)} ms | ` +
      `${routed}/${pairs} haltestukken gevonden, ${(routeMs / Math.max(1, trips)).toFixed(1)} ms per rit` +
      (compared
        ? ` | tegen OMSI (${compared} ritten): binnen 5 m mediaan ${median(fractions)}, ` +
          `slechtste tiende ${fractions[Math.floor(fractions.length * 0.1)].toFixed(3)}, lengteverhouding ${median(ratios)}`
        : '')
  )
}

if (naden) {
  const open = poort.genaaid + poort.zonderHaltesGenaaid > 0 && poort.slechter === 0
  console.log(
    `poort: ${poort.heel} ritten heel, ${poort.heel + poort.genaaid} met naden; ` +
      `${poort.veranderd} veranderd, ${poort.slechter} slechter; ` +
      `leegritten ${poort.zonderHaltes} -> ${poort.zonderHaltes + poort.zonderHaltesGenaaid}`
  )
  console.log(open ? 'naden: poort open' : 'NADEN: POORT DICHT')
  process.exit(open ? 0 : 1)
}
