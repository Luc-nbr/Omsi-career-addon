/**
 * Hoeveel water een kaart oplevert.
 *
 *   npx tsx scripts/probe-water.ts [kaartmap...]
 *
 * Water is bij OMSI een spline met zijn breedte in de naam: `wasser_50m.sli` is
 * vijftig meter breed. De vraag is niet of het tot op de meter klopt, maar of
 * er genoeg uitkomt om te tekenen, en of het op de ene kaart net zo goed gaat
 * als op de andere.
 *
 * Hier stond ook een telling van gras en bomen, om er groene vlakken van te
 * maken. Dat werkte, maar het zag eruit als blokjes en niet als een park; het
 * is er weer uit.
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

  console.log(
    `${kaart.padEnd(26)} ${km2.toFixed(1).padStart(6)} km2  ` +
      `wegen ${String(geometry.roads.length).padStart(6)}  ` +
      `water ${String(water.length).padStart(4)} lijnen, ` +
      `${water.length > 0 ? Math.round(water.reduce((n, w) => n + (w.w ?? 0), 0) / water.length) : 0} m breed ` +
      `gemiddeld  ${String(duur).padStart(5)} ms`
  )
}
