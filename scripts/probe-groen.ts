/**
 * Hoeveel water en groen een kaart oplevert.
 *
 *   npx tsx scripts/probe-groen.ts [kaartmap...]
 *
 * Water is bij OMSI een spline met zijn breedte in de naam; groen bestaat niet
 * als vlak, alleen als tienduizenden losse grassprieten en boompjes. Van die
 * laatste maken we een rooster: waar ze dicht op elkaar staan, is groen.
 *
 * Beide zijn dus een benadering van iets dat de kaart niet opschrijft. De vraag
 * is niet of het tot op de meter klopt, maar of er genoeg uitkomt om te tekenen
 * -- en of het op de ene kaart net zo goed gaat als op de andere.
 */
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { findOmsiInstall } from '../src/core/install'
import { readMapData } from '../src/core/geo'
import { loadMap } from '../src/core/timetable'

const omsi = findOmsiInstall()
if (!omsi) throw new Error('Geen OMSI 2 gevonden.')

const gevraagd = process.argv.slice(2)
const kaarten = gevraagd.length > 0 ? gevraagd : readdirSync(join(omsi, 'maps'))

for (const kaart of kaarten) {
  const loaded = loadMap(join(omsi, 'maps'), kaart)
  if (!loaded) {
    console.log(`${kaart}: geen dienstregeling`)
    continue
  }
  const ids = new Set<string>(loaded.stops.keys())
  for (const trip of loaded.trips.values()) for (const stop of trip.stops) ids.add(stop.id)

  const began = Date.now()
  const { geometry } = readMapData(loaded.path, ids, omsi)
  const duur = Date.now() - began

  const km2 = (geometry.widthM * geometry.heightM) / 1e6
  const water = geometry.water ?? []
  const vakjes = (geometry.green?.cells.length ?? 0) / 2
  const cel = geometry.green?.cellM ?? 0
  const groenKm2 = (vakjes * cel * cel) / 1e6
  const deel = km2 > 0 ? (groenKm2 / km2) * 100 : 0

  console.log(
    `${kaart.padEnd(26)} ${km2.toFixed(1).padStart(6)} km2  ` +
      `wegen ${String(geometry.roads.length).padStart(6)}  ` +
      `water ${String(water.length).padStart(4)}  ` +
      `groen ${String(vakjes).padStart(6)} vakjes = ${groenKm2.toFixed(1).padStart(5)} km2 ` +
      `(${deel.toFixed(0).padStart(2)}%)  ${String(duur).padStart(5)} ms`
  )
}
