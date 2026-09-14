/**
 * Klopt de route uit de .ttr-bestanden?
 *
 * Twee proeven per kaart. Sluiten de banen op elkaar aan (eind van de een op
 * begin van de volgende), en liggen de haltes van de rit op de route? Een
 * verkeerd gelezen padnummer of een verkeerde tegel valt in allebei direct op.
 *
 *   npx tsx scripts/probe-tracks.ts [kaart ...]
 */
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { readMapGeometry } from '../src/core/geo'
import { findOmsiInstall } from '../src/core/install'
import { loadMap } from '../src/core/timetable'
import { readTrackLine } from '../src/core/track'

const omsi = findOmsiInstall()
if (!omsi) throw new Error('Geen OMSI 2 gevonden.')
const maps = join(omsi, 'maps')
const only = process.argv.slice(2)

const toSegment = (px: number, py: number, ax: number, ay: number, bx: number, by: number): number => {
  const vx = bx - ax
  const vy = by - ay
  const len = vx * vx + vy * vy
  const t = len > 0 ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / len)) : 0
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t))
}

const pct = (part: number, whole: number): string => `${whole ? ((part / whole) * 100).toFixed(1) : '0'}%`

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
  const geometry = readMapGeometry(loaded.path, ids, omsi)
  const stopAt = new Map(geometry.stops.map((stop) => [stop.id, stop]))

  // Rijrichting per richtingsveld: [met de baan mee, ertegenin].
  const byDirection = new Map<number, [number, number]>()
  // Per bestand: [volgens het richtingsveld, ertegenin].
  const byFile = new Map<string, [number, number]>()
  let trips = 0
  let withTrack = 0
  let entriesMissing = 0
  const gaps: number[] = []
  const stopDistances: number[] = []
  for (const trip of loaded.trips.values()) {
    trips++
    const line = readTrackLine(loaded.path, omsi, trip.file)
    if (!line) continue
    withTrack++
    entriesMissing += line.missing
    gaps.push(...line.gaps)
    for (let i = 1; i < line.driven.length - 1; i++) {
      // Alleen banen die aan beide kanten naadloos aansluiten: naast een gat
      // is de rijrichting uit de aansluiting geraden, niet gemeten.
      if (line.gaps[i - 1] > 0.5 || line.gaps[i] > 0.5) continue
      const piece = line.driven[i]
      if (piece.direction === 0 || piece.direction === 1) {
        const wrong = (piece.direction === 1) !== piece.reversed
        const perFile = byFile.get(piece.file) ?? [0, 0]
        perFile[wrong ? 1 : 0]++
        byFile.set(piece.file, perFile)
      }
      const count = byDirection.get(piece.direction) ?? [0, 0]
      count[piece.reversed ? 1 : 0]++
      byDirection.set(piece.direction, count)
    }
    for (const stop of trip.stops) {
      const point = stopAt.get(stop.id)
      if (!point) continue
      let best = Infinity
      const p = line.points
      for (let i = 2; i < p.length; i += 2) {
        best = Math.min(best, toSegment(point.x, point.y, p[i - 2], p[i - 1], p[i], p[i + 1]))
      }
      stopDistances.push(best)
    }
  }
  if (withTrack === 0) {
    console.log(`${folder.padEnd(22)} ${trips} ritten, geen route`)
    continue
  }
  gaps.sort((a, b) => a - b)
  stopDistances.sort((a, b) => a - b)
  console.log(
    `${folder.padEnd(22)} ${withTrack}/${trips} ritten | ontbrekend ${entriesMissing} | ` +
      `aansluiting < 0,5 m: ${pct(gaps.filter((g) => g < 0.5).length, gaps.length)} ` +
      `(mediaan ${(gaps[gaps.length >> 1] ?? 0).toFixed(2)} m) | ` +
      `halte < 10 m van route: ${pct(stopDistances.filter((d) => d < 10).length, stopDistances.length)} ` +
      `(mediaan ${(stopDistances[stopDistances.length >> 1] ?? 0).toFixed(1)} m)`
  )
  console.log(
    '    rijrichting: ' +
      [...byDirection]
        .sort((a, b) => a[0] - b[0])
        .map(([direction, [along, against]]) => `veld ${direction}: ${along} mee, ${against} tegen`)
        .join(' | ')
  )
  const suspicious = [...byFile].filter(([, [, wrong]]) => wrong > 0).sort((a, b) => b[1][1] - a[1][1])
  for (const [file, [right, wrong]] of suspicious.slice(0, 6)) {
    console.log(`    ${String(wrong).padStart(5)} tegen, ${String(right).padStart(5)} mee: ${file}`)
  }
}
