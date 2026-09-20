/**
 * De haltes waar twee wegen boven elkaar liggen: komt de bus op de goede?
 *
 *   npx tsx scripts/probe-viaduct.ts "<pad naar OMSI 2>" [kaart]
 *
 * Leest alleen. Dit zijn de enige haltes waar de app werkelijk moet kiezen. De
 * dichtstbijzijnde rijstrook ligt meer dan acht meter boven het maaiveld, en
 * dan is er maar een van twee dingen aan de hand:
 *
 *   de halte staat beneden en er loopt een viaduct overheen  -> maaiveld
 *   de halte ligt zelf op de hoogbaan                        -> die weg
 *
 * Het verschil is niet aan de hoogte te zien maar aan wat er verder ligt: is er
 * bij die halte ook een weg beneden, dan hoort de halte daar. Deze probe toont
 * per halte wat er ligt en waar de bus terechtkomt, zodat de keuze na te lopen
 * is in plaats van te geloven.
 */
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { readMapData, readTileGrid } from '../src/core/geo'
import { LaneNetwork } from '../src/core/routing'
import { spawnAtStop } from '../src/core/spawn'
import { terrainHeight } from '../src/core/terrain'
import { loadMap } from '../src/core/timetable'

const omsi = process.argv[2]
if (!omsi || !existsSync(omsi)) {
  console.error('Geef het pad naar de OMSI 2-map.')
  process.exit(1)
}
const alleen = process.argv[3]

const mapsDir = join(omsi, 'maps')
const kaarten = readdirSync(mapsDir).filter(
  (naam) => existsSync(join(mapsDir, naam, 'global.cfg')) && (!alleen || naam === alleen)
)

let opDeWeg = 0
let opDeGrond = 0

for (const kaart of kaarten) {
  const mapPath = join(mapsDir, kaart)
  const dienst = loadMap(mapsDir, kaart)
  if (!dienst || dienst.stops.size === 0) continue
  const grid = readTileGrid(mapPath)
  if (!grid) continue

  let data: ReturnType<typeof readMapData>
  try {
    data = readMapData(mapPath, new Set(dienst.stops.keys()), omsi)
  } catch {
    continue
  }
  const net = new LaneNetwork(data.lanes)

  const regels: string[] = []
  for (const stop of data.geometry.stops) {
    const plek = spawnAtStop(mapPath, grid, net, stop)
    if (!plek) continue
    const grond = terrainHeight(mapPath, plek.tx, plek.ty, plek.x, plek.z, grid.size(plek.ty))
    if (grond === undefined) continue

    const baan = (net.spawnAt(stop) ?? net.spawnAt(stop, 60))?.height
    if (baan === undefined || baan - grond <= 8) continue

    const omheen = net.heightsNear(stop)
    const beneden = omheen.filter((h) => h - grond <= 8).length
    const keuze = Math.abs(plek.height - baan) < 0.5 ? 'de weg' : 'de grond'
    if (keuze === 'de weg') opDeWeg++
    else opDeGrond++

    regels.push(
      `  ${(stop.name || stop.id).padEnd(34)}` +
        ` weg ${baan.toFixed(1).padStart(6)}` +
        `  maaiveld ${grond.toFixed(1).padStart(6)}` +
        `  stroken eromheen ${String(omheen.length).padStart(3)}, beneden ${String(beneden).padStart(3)}` +
        `  ->  ${keuze} (${plek.height.toFixed(1)})`
    )
  }

  if (regels.length === 0) continue
  console.log(`${kaart}  (${regels.length} haltes met een weg boven zich)`)
  for (const r of regels) console.log(r)
  console.log()
}

console.log(`${opDeWeg} haltes komen op de hoge weg, ${opDeGrond} op de grond eronder.`)
