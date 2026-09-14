/**
 * Controleert de kaartgegevens: hoeveel weg er uit de tegels komt, hoe lang het
 * duurt, en of het eindpunt van een spline op het beginpunt van de volgende valt.
 * Dat laatste is de eigenlijke proef op de som voor de meetkunde.
 */
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { blockTag, readOmsiLines, str } from '../src/core/omsiFile'
import { findOmsiInstall } from '../src/core/install'
import { readMapGeometry, readTileGrid } from '../src/core/geo'
import { loadMap } from '../src/core/timetable'
import { parseSpline, splinePoints } from '../src/core/roads'

const omsi = findOmsiInstall()
if (!omsi) throw new Error('Geen OMSI 2 gevonden.')
const maps = join(omsi, 'maps')

function lengthOf(points: number[]): number {
  let total = 0
  for (let i = 2; i < points.length; i += 2) {
    total += Math.hypot(points[i] - points[i - 2], points[i + 1] - points[i - 1])
  }
  return total
}

/**
 * Leest alle splines met hun koppelingen, om de aansluiting na te rekenen.
 *
 * Niet alleen de mediaan: die stond in Berlin-Spandau op 0,000 m terwijl een op
 * de vier koppelingen 72 m verkeerd lag, omdat de tegels daar geen 300 m zijn.
 */
function continuity(mapPath: string): { median: number; count: number; broken: number } {
  type Node = { tx: number; ty: number; shape: ReturnType<typeof parseSpline>; next: number }
  const all = new Map<number, Node>()
  const grid = readTileGrid(mapPath)
  if (!grid) return { median: NaN, count: 0, broken: 0 }
  for (const entry of readdirSync(mapPath)) {
    if (!/^tile_(-?\d+)_(-?\d+)\.map$/i.test(entry)) continue
    const match = /^tile_(-?\d+)_(-?\d+)\.map$/i.exec(entry)!
    const tx = Number.parseInt(match[1], 10)
    const ty = Number.parseInt(match[2], 10)
    let lines: string[]
    try {
      lines = readOmsiLines(join(mapPath, entry))
    } catch {
      continue
    }
    for (let i = 0; i < lines.length; i++) {
      const tag = blockTag(lines[i])
      if (tag !== '[spline]' && tag !== '[spline_h]') continue
      const id = Number.parseInt(str(lines[i + 3]), 10)
      // Het volgende-veld bestaat alleen in de lay-out met twee koppelvelden.
      const fifth = str(lines[i + 5])
      const next = /^-?\d+$/.test(fifth) ? Number.parseInt(fifth, 10) : 0
      const shape = parseSpline(lines, i)
      if (Number.isFinite(id) && shape) all.set(id, { tx, ty, shape, next })
    }
  }

  const errors: number[] = []
  for (const node of all.values()) {
    const next = all.get(node.next)
    if (!next || !node.shape || !next.shape) continue
    const points = splinePoints(
      node.shape.x,
      node.shape.y,
      node.shape.rotationDeg,
      node.shape.length,
      node.shape.radius
    )
    const [nodeX, nodeY] = grid.offset(node.tx, node.ty)
    const [nextX, nextY] = grid.offset(next.tx, next.ty)
    const endX = nodeX + points[points.length - 2]
    const endY = nodeY + points[points.length - 1]
    const startX = nextX + next.shape.x
    const startY = nextY + next.shape.y
    errors.push(Math.hypot(endX - startX, endY - startY))
  }
  errors.sort((a, b) => a - b)
  return {
    median: errors[Math.floor(errors.length / 2)] ?? NaN,
    count: errors.length,
    broken: errors.filter((error) => error > 1).length
  }
}

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

  const began = Date.now()
  const geometry = readMapGeometry(loaded.path, ids, omsi)
  const took = Date.now() - began

  const roads = geometry.roads.filter((line) => line.kind === 'road')
  const km = roads.reduce((sum, line) => sum + lengthOf(line.points), 0) / 1000
  const points = geometry.roads.reduce((sum, line) => sum + line.points.length / 2, 0)
  const fit = continuity(loaded.path)

  console.log(
    `${folder.padEnd(22)} ${String(geometry.stops.length).padStart(4)}/${String(ids.size).padEnd(4)} haltes  ` +
      `${String(roads.length).padStart(5)} wegen ${km.toFixed(1).padStart(7)} km  ` +
      `${String(points).padStart(6)} punten  ${String(took).padStart(5)} ms  ` +
      `aansluiting ${fit.median.toFixed(3)} m over ${fit.count}, ${fit.broken} verder dan 1 m`
  )
}
