/**
 * Tekent het ingelezen wegennet per kaart als SVG, in de kleuren van RouteMap.
 *
 * Een meetlat zegt of haltes bij een weg liggen; alleen een plaatje zegt of het
 * wegennet er ook netjes uitziet. Per kaart twee uitsneden: rond de drukste
 * halte, en de hele kaart.
 *
 *   npx tsx scripts/render-roads.ts <uitvoermap> [kaart ...]
 *   npx electron scripts/rasterize.cjs <uitvoermap>
 */
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { readMapGeometry, type MapGeometry } from '../src/core/geo'
import { findOmsiInstall } from '../src/core/install'
import { loadMap } from '../src/core/timetable'

const omsi = findOmsiInstall()
if (!omsi) throw new Error('Geen OMSI 2 gevonden.')
const [outDir, ...only] = process.argv.slice(2)
if (!outDir) throw new Error('Geef een uitvoermap op.')
mkdirSync(outDir, { recursive: true })
const maps = join(omsi, 'maps')

function svg(geometry: MapGeometry, cx: number, cy: number, spanM: number, px: number): string {
  const mpp = spanM / px
  const roadWidth = Math.max(7, mpp * 1.1)
  const railWidth = Math.max(3, mpp * 0.7)
  const minX = cx - spanM / 2
  const maxX = cx + spanM / 2
  const minY = cy - spanM / 2
  const maxY = cy + spanM / 2
  const parts: Record<string, string[]> = { road: [], rail: [] }
  for (const line of geometry.roads) {
    const bucket = parts[line.kind]
    if (!bucket) continue
    let inside = false
    for (let i = 0; i < line.points.length && !inside; i += 2) {
      const x = line.points[i]
      const y = line.points[i + 1]
      inside = x > minX - 300 && x < maxX + 300 && y > minY - 300 && y < maxY + 300
    }
    if (!inside) continue
    let d = `M${line.points[0].toFixed(1)} ${line.points[1].toFixed(1)}`
    for (let i = 2; i < line.points.length; i += 2) {
      d += `L${line.points[i].toFixed(1)} ${line.points[i + 1].toFixed(1)}`
    }
    bucket.push(d)
  }
  const stops = geometry.stops
    .filter((s) => s.x > minX && s.x < maxX && s.y > minY && s.y < maxY)
    .map((s) => `<circle cx="${s.x.toFixed(1)}" cy="${s.y.toFixed(1)}" r="${(5 * mpp).toFixed(1)}" fill="#f2c14e"/>`)
    .join('')
  // Noord boven: y spiegelen, net als RouteMap.
  const transform = `translate(${px / 2 - cx / mpp} ${px / 2 + cy / mpp}) scale(${1 / mpp} ${-1 / mpp})`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${px} ${px}">
<rect width="100%" height="100%" fill="#111820"/>
<g transform="${transform}">
<path d="${parts.rail.join('')}" fill="none" stroke="#2d3540" stroke-width="${railWidth}" stroke-dasharray="7 6"/>
<path d="${parts.road.join('')}" fill="none" stroke="#202834" stroke-width="${roadWidth + 2.5 * mpp}" stroke-linecap="round" stroke-linejoin="round"/>
<path d="${parts.road.join('')}" fill="none" stroke="#3b4554" stroke-width="${roadWidth}" stroke-linecap="round" stroke-linejoin="round"/>
${stops}
</g></svg>`
}

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
  const geometry = readMapGeometry(loaded.path, ids, omsi)
  const ms = performance.now() - started
  if (geometry.stops.length === 0) continue
  const bytes = JSON.stringify(geometry).length

  // De halte met de meeste buren binnen 500 m: daar is de stad.
  let best = geometry.stops[0]
  let bestCount = -1
  for (const a of geometry.stops) {
    const count = geometry.stops.filter((b) => Math.hypot(a.x - b.x, a.y - b.y) < 500).length
    if (count > bestCount) {
      best = a
      bestCount = count
    }
  }

  writeFileSync(join(outDir, `${folder}-stad.svg`), svg(geometry, best.x, best.y, 1200, 900))
  const span = Math.max(geometry.widthM, geometry.heightM)
  writeFileSync(
    join(outDir, `${folder}-geheel.svg`),
    svg(geometry, geometry.widthM / 2, geometry.heightM / 2, span, 1400)
  )
  console.log(
    `${folder.padEnd(20)} ${String(geometry.roads.length).padStart(6)} lijnen  ` +
      `${(bytes / 1024 / 1024).toFixed(1)} MB  ${ms.toFixed(0)} ms`
  )
}
