/**
 * Waarom staat de bus nog steeds in de grond?
 *
 *   npx tsx scripts/probe-wegdek.ts "<pad naar OMSI 2>" [kaart]
 *
 * Leest alleen. Voor elke halte van elke kaart: vindt `spawnAtStop` een plek,
 * kent die plek een wegdekhoogte, en wat komt er uiteindelijk uit ten opzichte
 * van het maaiveld? De vorige meting telde alleen hoe vaak het wegdek hoger lag;
 * ze vertelde niet hoe vaak we die hoogte helemaal niet hebben en dus terugvallen
 * op het terrein. Dat is precies het verschil tussen "gerepareerd" en "soms
 * gerepareerd".
 *
 * De staart telt, niet het gemiddelde: een halte waar de bus twee meter in een
 * talud begint is in het spel een halve gelede bus.
 */
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { readMapData, readTileGrid } from '../src/core/geo'
import { loadMap } from '../src/core/timetable'
import { LaneNetwork } from '../src/core/routing'
import { spawnAtStop } from '../src/core/spawn'
import { terrainHeight } from '../src/core/terrain'

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

let totaalHaltes = 0
let totaalZonderPlek = 0
let totaalZonderWeg = 0
let totaalInDeGrond = 0

for (const folder of kaarten) {
  const mapPath = join(mapsDir, folder)
  const map = loadMap(mapsDir, folder)
  if (!map) continue

  if (map.stops.size === 0) continue
  let data: ReturnType<typeof readMapData>
  try {
    data = readMapData(mapPath, new Set(map.stops.keys()), omsi)
  } catch {
    continue
  }
  const grid = readTileGrid(mapPath)
  if (!grid || data.geometry.stops.length === 0) continue
  const network = new LaneNetwork(data.lanes)

  let haltes = 0
  let zonderPlek = 0
  /* De drie redenen waarom spawnAtStop op het maaiveld uitkomt. */
  let geenHoogte = 0
  let onderMaaiveld = 0
  let bovenDeGrens = 0
  let somOnder = 0
  let diepsteOnder = 0
  let diepsteNaam = ''

  for (const stop of data.geometry.stops) {
    haltes++
    const plek = spawnAtStop(mapPath, grid, network, stop)
    if (!plek) {
      zonderPlek++
      continue
    }
    const grond = terrainHeight(
      mapPath,
      plek.tx,
      plek.ty,
      plek.x,
      plek.z,
      grid.size(plek.ty)
    )
    if (grond === undefined) continue

    const baan = network.spawnAt(stop) ?? network.spawnAt(stop, 60)
    const weg = baan?.height
    if (weg === undefined || !Number.isFinite(weg)) {
      geenHoogte++
      continue
    }
    if (weg - grond > 8) {
      bovenDeGrens++
      continue
    }
    if (weg <= grond) {
      onderMaaiveld++
      const diep = grond - weg
      somOnder += diep
      if (diep > diepsteOnder) {
        diepsteOnder = diep
        diepsteNaam = stop.name || stop.id
      }
    }
  }

  totaalZonderWeg += geenHoogte
  totaalInDeGrond += onderMaaiveld

  console.log(
    `${folder.padEnd(24)} ${String(haltes).padStart(4)} haltes` +
      `  geen plek ${String(zonderPlek).padStart(3)}` +
      `  strook zonder hoogte ${String(geenHoogte).padStart(4)}` +
      `  weg onder maaiveld ${String(onderMaaiveld).padStart(4)}` +
      `  boven de grens ${String(bovenDeGrens).padStart(3)}` +
      (onderMaaiveld > 0
        ? `  gem ${(somOnder / onderMaaiveld).toFixed(2)} m, diepste ${diepsteOnder.toFixed(2)} (${diepsteNaam})`
        : '')
  )

  totaalHaltes += haltes
  totaalZonderPlek += zonderPlek
}

console.log(
  `\n${totaalHaltes} haltes: ${totaalZonderPlek} zonder plek, ` +
    `${totaalZonderWeg} op maaiveldhoogte, ${totaalInDeGrond} onder het wegdek.`
)
