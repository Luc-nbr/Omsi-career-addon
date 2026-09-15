/**
 * Waar kan een chauffeur overstappen op een andere lijn?
 *
 * Een dienst wordt door de dienstregeling gelopen: waar de ene rit eindigt,
 * begint de volgende. Staan daar ritten van meerdere lijnen klaar, dan valt er
 * wat te kiezen. Deze proef laat per kaart zien waar dat zo is -- en dus ook
 * waar het niet kan, hoe graag je ook zou willen.
 *
 *   npx tsx scripts/probe-junctions.ts [kaart ...]
 */
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { buildNetwork } from '../src/core/duty'
import { findOmsiInstall } from '../src/core/install'
import { loadMap } from '../src/core/timetable'

const omsi = findOmsiInstall()
if (!omsi) throw new Error('Geen OMSI 2 gevonden.')
const maps = join(omsi, 'maps')
const only = process.argv.slice(2)

for (const folder of readdirSync(maps)) {
  if (only.length > 0 && !only.includes(folder)) continue
  const map = loadMap(maps, folder)
  if (!map) continue
  const net = buildNetwork(map)

  /** Per plaats de lijnen die er vertrekken, en de naam van de eerste halte. */
  const rows: Array<{ where: string; lines: string[]; departures: number }> = []
  for (const runs of net.departingFrom.values()) {
    const lines = [...new Set(runs.map((run) => run.trip.lineNumber || run.lineFile))].sort()
    const first = runs[0]?.trip.stops[0]
    const where = first ? first.name ?? map.stops.get(first.id)?.name ?? `halte ${first.id}` : '?'
    rows.push({ where, lines, departures: runs.length })
  }

  const junctions = rows.filter((row) => row.lines.length > 1)
  console.log(
    `\n== ${folder}: ${rows.length} plaatsen, ${junctions.length} waar meer dan één lijn vertrekt`
  )
  for (const row of junctions.sort((a, b) => b.lines.length - a.lines.length).slice(0, 10)) {
    console.log(`   ${row.where.padEnd(34)} ${row.lines.join(', ')} (${row.departures} vertrekken)`)
  }
  if (junctions.length === 0) {
    const most = rows.sort((a, b) => b.departures - a.departures)[0]
    if (most) console.log(`   drukste plek: ${most.where} met alleen lijn ${most.lines.join(', ')}`)
  }
}
