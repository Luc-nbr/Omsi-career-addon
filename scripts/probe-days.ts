/**
 * Welke omlopen rijden op welke dag?
 *
 * OMSI toont in het dienstregelingsmenu alleen de omlopen die op de ingestelde
 * datum rijden. Kiest de app er een van een andere dag, dan staat hij niet in
 * de lijst en kun je hem niet aanklikken.
 */

import { join } from 'node:path'
import { findOmsiInstall } from '../src/core/install'
import { loadMap } from '../src/core/timetable'
import { describeDays } from '../src/shared/format'

const omsi = findOmsiInstall()
if (!omsi) throw new Error('Geen OMSI 2 gevonden.')
const maps = join(omsi, 'maps')
const folder = process.argv[2] ?? 'TH_Wald'
const wanted = process.argv[3]

const loaded = loadMap(maps, folder)
if (!loaded) throw new Error(`Kaart ${folder} kon niet worden geladen.`)

const DAYS = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo']

for (const line of [...new Set(loaded.tours.map((tour) => tour.lineFile))]) {
  if (wanted && line !== wanted) continue
  console.log(`\nlijn ${line}`)
  for (const tour of loaded.tours.filter((item) => item.lineFile === line)) {
    const bits = tour.days & 0b1111111
    const on = DAYS.filter((_, index) => (bits >> index) & 1).join(' ')
    console.log(
      `  omloop ${tour.number.padEnd(16)} masker ${String(tour.days).padStart(4)} ` +
        `(${bits.toString(2).padStart(7, '0')})  ${on.padEnd(22)} ${describeDays(tour.days, 'nl')}` +
        `  ${tour.trips.length} ritten`
    )
  }
}
