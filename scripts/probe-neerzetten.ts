/**
 * Hoe vaak kan de bus niet neergezet worden?
 *
 *   npx tsx scripts/probe-neerzetten.ts [kaartmap...]
 *
 * Als de app de bus niet kan plaatsen, start OMSI zonder bus en moet de speler
 * alles alsnog zelf kiezen -- precies wat een gebruiker meldde. Er zijn twee
 * manieren om te stranden: de halte ligt niet bij een rijstrook die we kennen,
 * of de hoogte van het terrein is daar niet te lezen.
 *
 * Deze proef loopt alle haltes af die als eerste halte van een rit dienstdoen,
 * en telt welke van de twee het is. Zonder die telling is het gissen welke van
 * de twee je moet repareren.
 */
import { join } from 'node:path'
import { findOmsiInstall } from '../src/core/install'
import { readMapData, readTileGrid } from '../src/core/geo'
import { LaneNetwork } from '../src/core/routing'
import { spawnAtStop } from '../src/core/spawn'
import { terrainHeight } from '../src/core/terrain'
import { loadMap } from '../src/core/timetable'

const omsi = findOmsiInstall()
if (!omsi) throw new Error('Geen OMSI 2 gevonden.')
const kaarten = process.argv.slice(2)
const lijst = kaarten.length > 0 ? kaarten : ['Hohenkirchen - Herrenhof', 'Grundorf', 'Rheinhausen']

for (const kaart of lijst) {
  const loaded = loadMap(join(omsi, 'maps'), kaart)
  if (!loaded) {
    console.log(`${kaart}: geen dienstregeling`)
    continue
  }
  const ids = new Set<string>(loaded.stops.keys())
  for (const trip of loaded.trips.values()) for (const stop of trip.stops) ids.add(stop.id)
  const { geometry, lanes } = readMapData(loaded.path, ids, omsi)
  const grid = readTileGrid(loaded.path)
  if (!grid) {
    console.log(`${kaart}: geen tegels`)
    continue
  }
  const netwerk = new LaneNetwork(lanes)

  // Elke halte waar een rit begint: dat is waar de bus neergezet wordt.
  const eersten = new Set<string>()
  for (const trip of loaded.trips.values()) {
    const eerste = trip.stops[0]
    if (eerste) eersten.add(eerste.id)
  }

  let gelukt = 0
  const geenStrook: string[] = []
  const geenHoogte: string[] = []
  const onbekend: string[] = []

  for (const id of eersten) {
    const stop = geometry.stops.find((punt) => punt.id === id)
    if (!stop) {
      onbekend.push(id)
      continue
    }
    if (spawnAtStop(loaded.path, grid, netwerk, stop)) {
      gelukt += 1
      continue
    }
    // Welke van de twee was het?
    const plek = netwerk.spawnAt(stop)
    if (!plek) {
      /*
       * Hoe ver ligt de dichtstbijzijnde rijstrook dan wel? Dat is het verschil
       * tussen "de grens staat te krap" en "hier ligt gewoon geen weg".
       */
      let dichtst = Infinity
      for (const baan of lanes) {
        const punten = baan.points
        for (let i = 0; i < punten.length; i += 2) {
          const d = Math.hypot(punten[i] - stop.x, punten[i + 1] - stop.y)
          if (d < dichtst) dichtst = d
        }
      }
      geenStrook.push(`${stop.name || stop.id} (dichtstbijzijnde strook op ${dichtst.toFixed(0)} m)`)
      continue
    }
    const tegel = grid.at(plek.x, plek.y)
    const hoogte = terrainHeight(
      loaded.path,
      tegel.tx,
      tegel.ty,
      tegel.localX,
      tegel.localZ,
      grid.size(tegel.ty)
    )
    if (hoogte === undefined) geenHoogte.push(stop.name || stop.id)
  }

  const totaal = eersten.size
  console.log(
    `${kaart.padEnd(26)} ${String(gelukt).padStart(4)}/${String(totaal).padEnd(4)} haltes bruikbaar  ` +
      `geen rijstrook ${geenStrook.length}, geen hoogte ${geenHoogte.length}, niet op de kaart ${onbekend.length}`
  )
  for (const naam of geenStrook.slice(0, 5)) console.log(`      geen rijstrook: ${naam}`)
  for (const naam of geenHoogte.slice(0, 5)) console.log(`      geen hoogte:    ${naam}`)
}
