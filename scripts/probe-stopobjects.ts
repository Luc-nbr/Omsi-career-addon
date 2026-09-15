/**
 * Staat elke halte op de plek van een halte?
 *
 * Een rit noemt zijn haltes bij het id van het object in de tegel. Vindt de app
 * meerdere objecten met datzelfde id, dan kan hij de verkeerde pakken -- en dan
 * ligt de halte ineens in een struik acht kilometer verderop, met een kaarsrechte
 * lijn op de kaart als gevolg.
 *
 * Deze proef telt hoe vaak elk halte-id in de tegels voorkomt en waar die
 * objecten vandaan komen.
 *
 *   npx tsx scripts/probe-stopobjects.ts [kaart ...]
 */
import { readdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import { findOmsiInstall } from '../src/core/install'
import { blockTag, num, readOmsiLines, str } from '../src/core/omsiFile'
import { loadMap } from '../src/core/timetable'

const omsi = findOmsiInstall()
if (!omsi) throw new Error('Geen OMSI 2 gevonden.')
const maps = join(omsi, 'maps')
const only = process.argv.slice(2)

for (const folder of readdirSync(maps)) {
  if (only.length > 0 && !only.includes(folder)) continue
  const map = loadMap(maps, folder)
  if (!map) continue

  const wanted = new Set<string>(map.stops.keys())
  for (const trip of map.trips.values()) for (const stop of trip.stops) wanted.add(stop.id)
  if (wanted.size === 0) continue

  /** Per halte-id de objecten die dat id dragen. */
  const found = new Map<string, Array<{ source: string; tile: string; x: number; y: number }>>()

  for (const entry of readdirSync(map.path)) {
    if (!/^tile_.*\.map$/i.test(entry)) continue
    let lines: string[]
    try {
      lines = readOmsiLines(join(map.path, entry))
    } catch {
      continue
    }
    for (let i = 0; i < lines.length; i++) {
      if (blockTag(lines[i]) !== '[object]') continue
      const id = str(lines[i + 3])
      if (!wanted.has(id)) continue
      const list = found.get(id) ?? []
      list.push({
        source: basename(str(lines[i + 2])),
        tile: entry,
        x: num(lines[i + 4]),
        y: num(lines[i + 5])
      })
      found.set(id, list)
    }
  }

  let once = 0
  let several = 0
  let none = 0
  const kinds = new Map<string, number>()
  const examples: string[] = []

  for (const id of wanted) {
    const list = found.get(id)
    if (!list || list.length === 0) {
      none++
      continue
    }
    if (list.length === 1) once++
    else several++
    for (const item of list) kinds.set(item.source, (kinds.get(item.source) ?? 0) + 1)
    if (list.length > 1 && examples.length < 6) {
      const where = list
        .map((item) => `${item.source} in ${item.tile.replace('tile_', '').replace('.map', '')}`)
        .join(' + ')
      examples.push(`id ${id} (${map.stops.get(id)?.name ?? '?'}): ${list.length}x -- ${where}`)
    }
  }

  const top = [...kinds.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
  console.log(
    `\n== ${folder}: ${wanted.size} halte-ids | ${once} eenmaal gevonden, ` +
      `${several} meer dan eens, ${none} niet in de tegels`
  )
  console.log(`   objecten die zo'n id dragen: ${top.map(([name, count]) => `${name} ${count}`).join(', ')}`)
  for (const line of examples) console.log(`   ${line}`)
}
