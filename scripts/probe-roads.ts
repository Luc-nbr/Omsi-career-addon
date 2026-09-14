/**
 * Ligt het wegennet waar de haltes liggen?
 *
 * Een halte staat aan de weg. Is de afstand van een halte tot de dichtstbijzijnde
 * weg groot, dan staan de wegen op de verkeerde plek -- en dan klopt de kaart niet.
 */
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { readMapGeometry } from '../src/core/geo'
import { findOmsiInstall } from '../src/core/install'
import { loadMap } from '../src/core/timetable'

const omsi = findOmsiInstall()
if (!omsi) throw new Error('Geen OMSI 2 gevonden.')
const maps = join(omsi, 'maps')

for (const folder of readdirSync(maps)) {
  let loaded
  try {
    loaded = loadMap(maps, folder)
  } catch {
    continue
  }
  if (!loaded) continue

  const ids = new Set<string>(loaded.stops.keys())
  for (const trip of loaded.trips.values()) for (const stop of trip.stops) ids.add(stop.id)
  const geometry = readMapGeometry(loaded.path, ids, omsi)
  if (geometry.stops.length === 0) continue

  const roads = geometry.roads.filter((line) => line.kind === 'road')
  if (roads.length === 0) {
    console.log(`${folder.padEnd(22)} geen wegen`)
    continue
  }

  /*
   * Naar het lijnstuk meten en niet naar de hoekpunten: een rechte spline van
   * driehonderd meter heeft er maar twee, en dan lijkt een halte er middenop
   * honderdvijftig meter vandaan te liggen.
   */
  const toSegment = (px: number, py: number, ax: number, ay: number, bx: number, by: number): number => {
    const vx = bx - ax
    const vy = by - ay
    const len = vx * vx + vy * vy
    const part = len > 0 ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / len)) : 0
    return Math.hypot(px - (ax + vx * part), py - (ay + vy * part))
  }

  const distances = geometry.stops.map((stop) => {
    let best = Infinity
    for (const line of roads) {
      for (let i = 2; i < line.points.length; i += 2) {
        const d = toSegment(
          stop.x,
          stop.y,
          line.points[i - 2],
          line.points[i - 1],
          line.points[i],
          line.points[i + 1]
        )
        if (d < best) best = d
      }
    }
    return best
  })

  distances.sort((a, b) => a - b)
  const median = distances[Math.floor(distances.length / 2)]
  const p90 = distances[Math.floor(distances.length * 0.9)]
  const near = distances.filter((d) => d <= 25).length
  console.log(
    `${folder.padEnd(22)} ${String(roads.length).padStart(5)} wegen | ` +
      `mediaan ${median.toFixed(1).padStart(7)} m  p90 ${p90.toFixed(1).padStart(8)} m  ` +
      `binnen 25 m: ${((near / distances.length) * 100).toFixed(0)}%`
  )
}
