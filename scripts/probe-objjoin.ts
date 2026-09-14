/**
 * Sluiten de rijbanen uit scenery-objecten aan op de splines ernaast?
 *
 * Een kruising ligt tussen straten in: de uiteinden van haar rijbanen moeten op
 * de rijstroken van de splines vallen. Welke draairichting daarbij hoort was niet
 * zeker, dus meet deze proef alle vier de combinaties en laat de getallen kiezen.
 * De uitkomst staat in placeObjectPath(): object en baan draaien allebei met de
 * klok mee. Daarmee sluiten de meeste uiteinden aan; draait het object de
 * andere kant op, dan nog geen tiende daarvan. (Honderd procent haalt geen enkele
 * combinatie: binnen een kruising sluiten rijbanen op elkaar aan, niet op een spline.)
 *
 *   npx tsx scripts/probe-objjoin.ts <kaart> [kaart ...]
 */
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { readTileGrid } from '../src/core/geo'
import { findOmsiInstall } from '../src/core/install'
import { blockTag, num, readOmsiLines, str } from '../src/core/omsiFile'
import { objectPaths, parseSpline, PATH_ROAD, splineInfo, splineLane, splinePoints } from '../src/core/roads'

const omsi = findOmsiInstall()
if (!omsi) throw new Error('Geen OMSI 2 gevonden.')

for (const folder of process.argv.slice(2)) {
  const dir = join(omsi, 'maps', folder)
  const grid = readTileGrid(dir)
  if (!grid) continue
  const laneEnds: number[] = []
  const objects: Array<{ x: number; y: number; rot: number; file: string }> = []

  for (const entry of readdirSync(dir)) {
    const m = /^tile_(-?\d+)_(-?\d+)\.map$/i.exec(entry)
    if (!m) continue
    const [ox, oy] = grid.offset(Number(m[1]), Number(m[2]))
    const lines = readOmsiLines(join(dir, entry))
    for (let i = 0; i < lines.length; i++) {
      const tag = blockTag(lines[i])
      if (tag === '[spline]' || tag === '[spline_h]') {
        const info = splineInfo(omsi, str(lines[i + 2]))
        if (info.kind !== 'road') continue
        const s = parseSpline(lines, i)
        if (!s) continue
        for (const path of info.paths) {
          if (path.type !== PATH_ROAD) continue
          const p = splinePoints(s.x, s.y, s.rotationDeg, s.length, s.radius, splineLane(s, path).offset)
          laneEnds.push(ox + p[0], oy + p[1], ox + p[p.length - 2], oy + p[p.length - 1])
        }
      } else if (tag === '[object]') {
        const file = str(lines[i + 2])
        if (!objectPaths(omsi, file).some((path) => path.type === PATH_ROAD)) continue
        objects.push({ x: ox + num(lines[i + 4]), y: oy + num(lines[i + 5]), rot: num(lines[i + 7]), file })
      }
    }
  }

  // Raster op 10 m zodat het zoeken naar het dichtstbijzijnde uiteinde snel gaat.
  const cells = new Map<string, number[]>()
  for (let i = 0; i < laneEnds.length; i += 2) {
    const key = `${Math.floor(laneEnds[i] / 10)},${Math.floor(laneEnds[i + 1] / 10)}`
    const cell = cells.get(key)
    if (cell) cell.push(laneEnds[i], laneEnds[i + 1])
    else cells.set(key, [laneEnds[i], laneEnds[i + 1]])
  }
  const onLane = (x: number, y: number): boolean => {
    const gx = Math.floor(x / 10)
    const gy = Math.floor(y / 10)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const cell = cells.get(`${gx + dx},${gy + dy}`) ?? []
        for (let i = 0; i < cell.length; i += 2) if (Math.hypot(cell[i] - x, cell[i + 1] - y) < 0.5) return true
      }
    }
    return false
  }

  console.log(`\n== ${folder}: ${laneEnds.length / 4} rijstroken op splines, ${objects.length} objecten met rijbanen`)
  for (const objectSign of [1, -1]) {
    for (const pathSign of [1, -1]) {
      let hits = 0
      let total = 0
      for (const object of objects) {
        const t = (objectSign * object.rot * Math.PI) / 180
        const cos = Math.cos(t)
        const sin = Math.sin(t)
        for (const path of objectPaths(omsi, object.file)) {
          if (path.type !== PATH_ROAD || !(path.length > 0)) continue
          const p = splinePoints(
            object.x + path.x * cos + path.y * sin,
            object.y - path.x * sin + path.y * cos,
            objectSign * object.rot + pathSign * path.rotationDeg,
            path.length,
            path.radius
          )
          total += 2
          if (onLane(p[0], p[1])) hits++
          if (onLane(p[p.length - 2], p[p.length - 1])) hits++
        }
      }
      const label = `object ${objectSign > 0 ? '+' : '-'}  rijbaan ${pathSign > 0 ? '+' : '-'}`
      console.log(`  ${label}: ${hits} van ${total} uiteinden op een rijstrook (${((hits / total) * 100).toFixed(1)}%)`)
    }
  }
}
