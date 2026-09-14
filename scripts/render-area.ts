/**
 * Tekent een uitsnede van het rijstrokennet, om een haperende plek na te zien:
 * rijstroken in grijs met een pijltje in rijrichting, haltes in geel, en
 * eventueel de berekende route tussen twee haltes in blauw.
 *
 *   npx tsx scripts/render-area.ts <kaart> <x> <y> <breedte m> <uit.svg> [halte-id halte-id]
 *   npx electron scripts/rasterize.cjs <map met svg's>
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { readMapData } from '../src/core/geo'
import { findOmsiInstall } from '../src/core/install'
import { LaneNetwork } from '../src/core/routing'
import { loadMap } from '../src/core/timetable'

const omsi = findOmsiInstall()
if (!omsi) throw new Error('Geen OMSI 2 gevonden.')
const [folder, xs, ys, spans, out, fromId, toId] = process.argv.slice(2)
const cx = Number(xs)
const cy = Number(ys)
const span = Number(spans)
const loaded = loadMap(join(omsi, 'maps'), folder)
if (!loaded) throw new Error(`Kaart ${folder} niet gevonden.`)
const ids = new Set<string>(loaded.stops.keys())
for (const trip of loaded.trips.values()) for (const stop of trip.stops) ids.add(stop.id)
const { geometry, lanes } = readMapData(loaded.path, ids, omsi)

const size = 1000
const mpp = span / size
const sx = (x: number): string => ((x - cx) / mpp + size / 2).toFixed(1)
const sy = (y: number): string => (size / 2 - (y - cy) / mpp).toFixed(1)
const inside = (x: number, y: number): boolean => Math.abs(x - cx) < span * 0.6 && Math.abs(y - cy) < span * 0.6

const parts: string[] = []
for (const lane of lanes) {
  const p = lane.points
  let any = false
  for (let i = 0; i < p.length && !any; i += 2) any = inside(p[i], p[i + 1])
  if (!any) continue
  let d = `M${sx(p[0])} ${sy(p[1])}`
  for (let i = 2; i < p.length; i += 2) d += `L${sx(p[i])} ${sy(p[i + 1])}`
  const color = lane.source.toLowerCase().endsWith('.sco') ? '#8a7fbf' : '#7f8a99'
  parts.push(`<path d="${d}" stroke="${color}" stroke-width="1.2" fill="none"/>`)
  // Pijltje halverwege in rijrichting (bij beide richtingen geen pijl).
  if (lane.direction === 0 || lane.direction === 1) {
    const mid = Math.floor(p.length / 4) * 2
    const a = Math.max(0, mid - 2)
    let hx = p[a + 2] - p[a]
    let hy = p[a + 3] - p[a + 1]
    if (lane.direction === 1) [hx, hy] = [-hx, -hy]
    const angle = (Math.atan2(-hy, hx) * 180) / Math.PI
    parts.push(`<path d="M-4 -3 L4 0 L-4 3" stroke="${color}" fill="none" transform="translate(${sx((p[a] + p[a + 2]) / 2)} ${sy((p[a + 1] + p[a + 3]) / 2)}) rotate(${angle.toFixed(0)})"/>`)
  }
}

if (fromId && toId) {
  const network = new LaneNetwork(lanes)
  const from = geometry.stops.find((stop) => stop.id === fromId)
  const to = geometry.stops.find((stop) => stop.id === toId)
  const route = from && to ? network.route(from, to) : undefined
  if (route) {
    let d = `M${sx(route[0])} ${sy(route[1])}`
    for (let i = 2; i < route.length; i += 2) d += `L${sx(route[i])} ${sy(route[i + 1])}`
    parts.push(`<path d="${d}" stroke="#4c9aff" stroke-width="4" fill="none" opacity="0.8"/>`)
  }
  console.log(route ? `route: ${route.length / 2} punten` : 'geen route')
}

for (const stop of geometry.stops) {
  if (!inside(stop.x, stop.y)) continue
  parts.push(`<circle cx="${sx(stop.x)}" cy="${sy(stop.y)}" r="5" fill="#f2c14e"/>`)
  parts.push(`<text x="${Number(sx(stop.x)) + 8}" y="${sy(stop.y)}" fill="#e8edf4" font-size="11" font-family="Segoe UI">${stop.id} ${loaded.stops.get(stop.id)?.name ?? ''}</text>`)
}

writeFileSync(
  out,
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="100%" height="100%" fill="#111820"/>${parts.join('')}</svg>`
)
console.log(`geschreven: ${out}`)
