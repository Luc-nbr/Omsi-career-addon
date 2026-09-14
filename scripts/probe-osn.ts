/**
 * Hoe staat een voertuig in een situatiebestand?
 *
 * Het `[vehicle]`-blok noemt een positie, een quaternion en twee getallen die
 * naar een tegel wijzen. Of dat de tegelnaam is of het volgnummer uit
 * global.cfg valt niet uit het bestand af te lezen -- wel uit de uitkomst: een
 * bus staat op de weg, dus de juiste lezing ligt vlak bij een rijstrook.
 *
 *   npx tsx scripts/probe-osn.ts [kaart ...]
 */
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { readMapData, readTileGrid } from '../src/core/geo'
import { findOmsiInstall } from '../src/core/install'
import { blockTag, num, readOmsiLines, str } from '../src/core/omsiFile'
import { LaneNetwork } from '../src/core/routing'
import { loadMap } from '../src/core/timetable'
import { readTileList } from '../src/core/track'

const omsi = findOmsiInstall()
if (!omsi) throw new Error('Geen OMSI 2 gevonden.')
const maps = join(omsi, 'maps')
const only = process.argv.slice(2)

for (const folder of readdirSync(maps)) {
  if (only.length > 0 && !only.includes(folder)) continue
  const situation = join(maps, folder, 'laststn.osn')
  if (!existsSync(situation)) continue

  const loaded = loadMap(maps, folder)
  if (!loaded) continue
  const grid = readTileGrid(loaded.path)
  if (!grid) continue
  const { lanes } = readMapData(loaded.path, new Set(loaded.stops.keys()), omsi)
  const network = new LaneNetwork(lanes)
  const tiles = readTileList(loaded.path)

  const lines = readOmsiLines(situation)
  const at = lines.findIndex((line) => blockTag(line) === '[vehicle]')
  if (at < 0) {
    console.log(`${folder}: geen voertuig in laststn.osn`)
    continue
  }

  const values = lines.slice(at + 1, at + 16).map((line) => str(line))
  const px = num(values[1])
  const py = num(values[2])
  const pz = num(values[3])
  const a = Math.round(num(values[11]))
  const b = Math.round(num(values[12]))

  const byName = grid.offset(a, b)
  const listed = tiles[a]
  const byList = listed ? grid.offset(listed.tx, listed.ty) : undefined

  const readings: Array<[string, number, number]> = [
    ['tegelnaam + x,z', byName[0] + px, byName[1] + pz],
    ['tegelnaam + x,y', byName[0] + px, byName[1] + py]
  ]
  if (byList) {
    readings.push(['global.cfg + x,z', byList[0] + px, byList[1] + pz])
    readings.push(['global.cfg + x,y', byList[0] + px, byList[1] + py])
  }

  console.log(`${folder}: voertuig ${values[0]}`)
  console.log(`   velden: pos ${px.toFixed(1)} ${py.toFixed(1)} ${pz.toFixed(1)}  tegel ${a},${b}`)
  for (const [name, x, y] of readings) {
    console.log(`   ${name.padEnd(18)} -> ${x.toFixed(0)},${y.toFixed(0)}  ${network.distanceToLane(x, y).toFixed(1)} m van een rijstrook`)
  }
}
