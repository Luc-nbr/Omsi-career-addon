/**
 * Telt OMSI de haltes van een rit hetzelfde als wij?
 *
 * De plugin leest uit het spel welke halte de volgende is: een nummer én een
 * naam. Staat die naam bij ons op een ander nummer, dan wijst het infoscherm de
 * verkeerde halte aan -- en dat is precies wat er gebeurde: OMSI zei halte 6
 * "Rothhauser Strasse", bij ons was 6 "Plankenhof".
 *
 *   npx tsx scripts/probe-nextstop.ts <kaart> <ritbestand> [naam]
 */
import { join } from 'node:path'
import { findOmsiInstall } from '../src/core/install'
import { loadMap } from '../src/core/timetable'

const omsi = findOmsiInstall()
if (!omsi) throw new Error('Geen OMSI 2 gevonden.')

const folder = process.argv[2] || 'Rheinhausen'
const wanted = (process.argv[3] || '').toLowerCase()
const lookFor = (process.argv[4] || '').toLowerCase()

const map = loadMap(join(omsi, 'maps'), folder)
if (!map) throw new Error(`Kaart ${folder} niet gevonden.`)

for (const [file, trip] of map.trips) {
  if (wanted && !file.includes(wanted)) continue
  console.log(`\n== ${file} (${trip.stops.length} haltes, lijn ${trip.lineNumber}, naar ${trip.terminus})`)
  trip.stops.forEach((stop, index) => {
    const name = stop.name ?? map.stops.get(stop.id)?.name ?? `halte ${stop.id}`
    const mark = lookFor && name.toLowerCase().includes(lookFor) ? '  <<<' : ''
    console.log(`   ${String(index).padStart(2)}  ${name}${mark}`)
  })
}
