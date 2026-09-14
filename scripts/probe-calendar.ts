/**
 * Klopt de kalender? Voor elke omloop de eerste datum waarop hij rijdt, en een
 * tegenproef: rijdt hij dan ook echt niet op een dag van de andere soort?
 */
import { join } from 'node:path'
import { dateForMask, dayKind, readCalendar, runsOn } from '../src/core/calendar'
import { findOmsiInstall } from '../src/core/install'
import { loadMap } from '../src/core/timetable'

const omsi = findOmsiInstall()
if (!omsi) throw new Error('Geen OMSI 2 gevonden.')
const folder = process.argv[2] ?? 'TH_Wald'
const line = process.argv[3]

const loaded = loadMap(join(omsi, 'maps'), folder)
if (!loaded) throw new Error(`Kaart ${folder} kon niet worden geladen.`)
const calendar = readCalendar(loaded.path)
console.log(
  `${folder}: ${calendar.holidays.size} feestdagen, ${calendar.breaks.length} schoolvakanties`
)

const year = 2015
const NAMES = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo']
const seen = new Set<string>()

for (const tour of loaded.tours) {
  if (line && tour.lineFile !== line) continue
  const key = `${tour.lineFile}|${tour.number}|${tour.days}`
  if (seen.has(key)) continue
  seen.add(key)

  const found = dateForMask(calendar, year, 1, tour.days)
  if (!found) {
    console.log(`  omloop ${tour.number.padEnd(16)} masker ${tour.days}: geen enkele dag in ${year}`)
    continue
  }
  const { date } = found
  const label = `${String(date.getUTCDate()).padStart(2, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
  // Tegenproef: hoeveel dagen van het jaar zou deze omloop rijden?
  let count = 0
  for (let d = 1; d <= 365; d++) {
    if (runsOn(tour.days, new Date(Date.UTC(year, 0, d)), calendar)) count++
  }
  console.log(
    `  omloop ${tour.number.padEnd(16)} masker ${String(tour.days).padStart(4)} -> ` +
      `${label} (${NAMES[(date.getUTCDay() + 6) % 7]}, ${dayKind(calendar, date)}), ` +
      `${count} dagen per jaar`
  )
}
