/**
 * Hoe lang duurt het inlezen van een kaart, en hoe groot is het resultaat?
 *
 *   npx tsx scripts/probe-kaarttijd.ts [kaartmap...]
 *
 * De app leest de tegels van een kaart bij elke start opnieuw; alleen binnen een
 * sessie wordt het onthouden. De gebruiker merkt dat als traagheid. Voordat we
 * dat naar de schijf gaan schrijven is de vraag wat het werkelijk kost: hoeveel
 * tijd per kaart, en hoeveel bytes er bewaard zouden moeten worden.
 */
import { join } from 'node:path'
import { readMapData } from '../src/core/geo'
import { findOmsiInstall } from '../src/core/install'
import { loadMap, listMaps } from '../src/core/timetable'

const omsi = findOmsiInstall()
if (!omsi) throw new Error('Geen OMSI 2 gevonden.')

const gevraagd = process.argv.slice(2)
const kaarten =
  gevraagd.length > 0 ? gevraagd : listMaps(omsi)

console.log(
  'kaart'.padEnd(26) +
    'inlezen'.padStart(9) +
    'tek MB'.padStart(8) +
    'str MB'.padStart(8) +
    'terug'.padStart(9) +
    'terug'.padStart(9)
)
let totaal = 0
let totaalBytes = 0

for (const folder of kaarten) {
  const t0 = Date.now()
  const loaded = loadMap(join(omsi, 'maps'), folder)
  const tDienst = Date.now() - t0
  if (!loaded) {
    console.log(`${folder.padEnd(30)}${'geen dienstregeling'.padStart(15)}`)
    continue
  }

  const ids = new Set<string>(loaded.stops.keys())
  for (const trip of loaded.trips.values()) for (const stop of trip.stops) ids.add(stop.id)

  const t1 = Date.now()
  const { geometry, lanes } = readMapData(loaded.path, ids, omsi)
  const tTegels = Date.now() - t1

  /*
   * Wat er bewaard zou moeten worden, en wat het kost om het terug te lezen.
   * De tekening en de rijstroken staan los van elkaar: het scherm heeft alleen
   * de tekening nodig, de rijstroken pas als de bus ergens neergezet wordt.
   */
  const tekening = JSON.stringify(geometry)
  const stroken = JSON.stringify(lanes)

  const t2 = Date.now()
  JSON.parse(tekening)
  const tLezenTekening = Date.now() - t2

  const t3 = Date.now()
  JSON.parse(stroken)
  const tLezenStroken = Date.now() - t3

  totaal += tDienst + tTegels
  totaalBytes += tekening.length + stroken.length

  console.log(
    folder.padEnd(26) +
      `${tDienst + tTegels} ms`.padStart(9) +
      `${(tekening.length / 1024 / 1024).toFixed(1)}`.padStart(8) +
      `${(stroken.length / 1024 / 1024).toFixed(1)}`.padStart(8) +
      `${tLezenTekening} ms`.padStart(9) +
      `${tLezenStroken} ms`.padStart(9)
  )
}

console.log('')
console.log(`alles bij elkaar: ${(totaal / 1000).toFixed(1)} s, ${(totaalBytes / 1024 / 1024).toFixed(1)} MB`)
