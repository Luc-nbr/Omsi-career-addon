/**
 * Proef voor de busplek en de dienstregeling uit het geheugen van OMSI, zonder
 * OMSI: een nepbus op een echte rijstrook zetten zoals de plugin hem zou melden
 * (tegelnummer plus Direct3D-positie binnen de tegel), laten rijden, en kijken
 * of de app hem op dezelfde plek en in dezelfde richting terugvindt. Daarna of
 * een in het menu gekozen rit aan de juiste rit van een dienst hangt.
 *
 *   npx tsx scripts/probe-vehicle.ts [kaart]
 */
import { join } from 'node:path'
import { readMapData, readTileGrid } from '../src/core/geo'
import { findOmsiInstall } from '../src/core/install'
import { describeLive, type LiveData, type MemoryData } from '../src/core/live'
import { LaneNetwork } from '../src/core/routing'
import { loadMap } from '../src/core/timetable'
import { readTileList } from '../src/core/track'
import { VehicleTracker } from '../src/core/vehicle'
import type { Duty } from '../src/core/types'

const omsi = findOmsiInstall()
if (!omsi) throw new Error('Geen OMSI 2 gevonden.')
const folder = process.argv[2] ?? 'Grundorf'
const loaded = loadMap(join(omsi, 'maps'), folder)
if (!loaded) throw new Error(`Kaart ${folder} niet gevonden.`)
const ids = new Set<string>(loaded.stops.keys())
for (const trip of loaded.trips.values()) for (const stop of trip.stops) ids.add(stop.id)
const { lanes } = readMapData(loaded.path, ids, omsi)
const network = new LaneNetwork(lanes)
const grid = readTileGrid(loaded.path)!
const tiles = readTileList(loaded.path)

let failures = 0
const check = (ok: boolean, text: string): void => {
  if (!ok) failures++
  console.log(`${ok ? 'goed' : 'FOUT'}  ${text}`)
}

// Een lange rechte rijstrook om over te rijden.
const lane = lanes.find((l) => l.direction === 0 && l.points.length === 4 && Math.hypot(l.points[2] - l.points[0], l.points[3] - l.points[1]) > 60)!
const [ax, ay, bx, by] = lane.points
const length = Math.hypot(bx - ax, by - ay)
const heading = (Math.atan2(bx - ax, by - ay) * 180) / Math.PI
console.log(`rijstrook van ${length.toFixed(0)} m, koers ${((heading + 360) % 360).toFixed(1)}°`)

/** Zoals de plugin het zou melden: tegel en positie binnen die tegel, y omhoog. */
function memAt(x: number, y: number, degrees: number): MemoryData {
  const index = tiles.findIndex((tile) => {
    const [ox, oy] = grid.offset(tile.tx, tile.ty)
    const size = grid.size(tile.ty)
    return x >= ox && x < ox + size && y >= oy && y < oy + size
  })
  const [ox, oy] = grid.offset(tiles[index].tx, tiles[index].ty)
  const half = (degrees * Math.PI) / 360
  return {
    ok: 1, tile: index, x: x - ox, y: 33.5, z: y - oy,
    qx: 0, qy: Math.sin(half), qz: 0, qw: Math.cos(half),
    schedActive: 0, line: -1, tour: -1, tourEntry: -1, trip: -1, nextIndex: -1, nextDist: 0, delay: 0,
    lineName: '', tourName: '', tripName: '', nextStop: ''
  }
}

const tracker = new VehicleTracker(loaded.path)
let worst = 0
let last
for (let step = 0; step <= 10; step++) {
  const t = (step * 3) / length
  const x = ax + (bx - ax) * t
  const y = ay + (by - ay) * t
  last = tracker.update(memAt(x, y, heading), (px, py) => network.distanceToLane(px, py))
  if (last) worst = Math.max(worst, Math.hypot(last.x - x, last.y - y))
}
check(worst < 0.01, `positie na 30 m rijden terug op dezelfde plek (grootste afwijking ${worst.toFixed(4)} m)`)
check(Boolean(last?.headingFromMotion) && Math.abs(((last!.heading - heading + 540) % 360) - 180) < 1, `koers uit de beweging ${last?.heading.toFixed(1)}° gelijk aan de rijstrook`)

// Stilstaand, nieuwe tracker: koers uit het quaternion.
const still = new VehicleTracker(loaded.path).update(memAt(ax, ay, heading), (px, py) => network.distanceToLane(px, py))
check(Boolean(still) && Math.abs(((still!.heading - heading + 540) % 360) - 180) < 1, `stilstaand: koers uit de draaiing ${still?.heading.toFixed(1)}°`)

// Dienstregeling uit het menu aan een dienst koppelen.
const trips = [...loaded.trips.values()]
const duty = {
  mapFolder: folder, tourNumber: '1', start: 480, end: 600, durationMinutes: 120,
  legs: trips.slice(0, 2).map((trip, i) => ({ tripFile: trip.file, departure: 480 + i * 60, arrival: 530 + i * 60, stops: trip.stops.map((s) => s.id), stopIds: trip.stops.map((s) => s.id) }))
} as unknown as Duty
const live = (mem: Partial<MemoryData>): LiveData =>
  ({ alive: true, seen: 0, seenStr: 0, time: 540 * 60, velocity: 0, busstop: '', delayMin: '', delaySec: '', harshBrakes: 0, harshAccels: 0, km: 0, metres: 0, passengers: 0, entryOpen: 0, exitOpen: 0, entryRequest: 0, exitRequest: 0, brightness: 1, precipRate: 0,
     mem: { ...memAt(ax, ay, heading), ...mem } }) as unknown as LiveData

const none = describeLive(live({}), duty)
check(none.omsiReadable && !none.schedule, 'zonder keuze in het menu: leesbaar, geen dienstregeling')
const chosen = describeLive(live({ schedActive: 1, line: 0, tour: 0, trip: 3, tourName: '1', tripName: `TTData\\${duty.legs[1].tripFile}.ttp`, nextIndex: 2, nextStop: 'X' }), duty)
check(Boolean(chosen.schedule?.matchesDuty) && chosen.legIndex === 1 && chosen.stopIndex === 2, `rit 2 gekozen: past bij de dienst, rit ${chosen.legIndex + 1}, halte-index ${chosen.stopIndex}`)
const wrongTour = describeLive(live({ schedActive: 1, trip: 3, tourName: '7', tripName: duty.legs[0].tripFile }), duty)
check(!wrongTour.schedule?.matchesDuty, 'andere omloop gekozen: niet de dienst')

process.exit(failures ? 1 : 0)
