/**
 * Hoe vaak ligt het wegdek hoger dan het maaiveld, en hoeveel scheelt dat?
 *
 *   npx tsx scripts/probe-weghoogte.ts "<pad naar OMSI 2>" [kaart]
 *
 * Leest alleen. Voor elke halte: waar zou de bus komen te staan, en hoeveel
 * hoger is dat dan de terreinhoogte op diezelfde plek? Dat verschil is precies
 * hoe diep de bus vroeger in de grond begon, want toen namen we het terrein.
 *
 * Draai dit opnieuw als je aan `roads.ts`, `geo.ts`, `routing.ts` of `spawn.ts`
 * komt. Het getal dat telt is niet het gemiddelde maar de staart: één halte waar
 * de bus twee meter in een talud begint is in het spel een halve gelede bus.
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
const only = process.argv[3]

const kaarten = join(omsi, 'maps')
let totaal = 0
let hoger = 0
let ergste = { kaart: '', halte: '', verschil: 0 }

for (const kaart of readdirSync(kaarten)) {
  if (only && kaart !== only) continue
  const mapPath = join(kaarten, kaart)

  /*
   * Alle haltes van de kaart; `readMapData` leest alleen de tegels waar een
   * gevraagde halte op ligt, dus zonder die lijst blijft de kaart leeg.
   */
  const dienstregeling = loadMap(kaarten, kaart)
  if (!dienstregeling || dienstregeling.stops.size === 0) continue
  let data: ReturnType<typeof readMapData>
  try {
    data = readMapData(mapPath, new Set(dienstregeling.stops.keys()), omsi)
  } catch {
    continue
  }
  const grid = readTileGrid(mapPath)
  if (!grid || data.geometry.stops.length === 0) continue
  const net = new LaneNetwork(data.lanes)

  let opKaart = 0
  let hoogsteHier = 0
  let gemeten = 0

  for (const stop of data.geometry.stops) {
    const plek = spawnAtStop(mapPath, grid, net, stop)
    if (!plek) continue
    const grond = terrainHeight(mapPath, plek.tx, plek.ty, plek.x, plek.z, grid.size(plek.ty))
    if (grond === undefined) continue
    gemeten++
    totaal++
    const verschil = plek.height - grond
    if (verschil > 0.5) {
      hoger++
      opKaart++
      if (verschil > hoogsteHier) hoogsteHier = verschil
      if (verschil > ergste.verschil) {
        ergste = { kaart, halte: stop.name || stop.id, verschil }
      }
    }
  }

  console.log(
    `${kaart.padEnd(26)} ${String(gemeten).padStart(4)} haltes gemeten, ` +
      `${String(opKaart).padStart(4)} met de weg boven het maaiveld` +
      (hoogsteHier > 0 ? `, hoogste ${hoogsteHier.toFixed(2)} m` : '')
  )
}

console.log(`\n${hoger} van ${totaal} haltes lagen boven het maaiveld.`)
if (ergste.verschil > 0) {
  console.log(`Ergste: ${ergste.kaart} — ${ergste.halte}, ${ergste.verschil.toFixed(2)} m te laag.`)
}
