/**
 * Wijst het infoscherm dezelfde halte aan als OMSI?
 *
 * Voert de echte `live.json` van de speler door `describeLive` heen, met de
 * dienst erbij die erbij hoort, en legt naast elkaar wat OMSI zegt en wat de app
 * ervan maakt: de volgende halte, hoeveel er nog te gaan zijn, en het verschil
 * met de dienstregeling.
 *
 *   npx tsx scripts/probe-livestop.ts [pad naar live.json]
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildNetwork, generateDuties } from '../src/core/duty'
import { findOmsiInstall } from '../src/core/install'
import { describeLive, type LiveData } from '../src/core/live'
import { loadMap } from '../src/core/timetable'
import { formatTime } from '../src/shared/format'

const omsi = findOmsiInstall()
if (!omsi) throw new Error('Geen OMSI 2 gevonden.')

const file =
  process.argv[2] || join(process.env.LOCALAPPDATA ?? '', 'OMSI Career', 'live.json')
const data = JSON.parse(readFileSync(file, 'utf8')) as LiveData

const mem = data.mem
if (!mem || mem.ok !== 1) {
  console.log('Deze live.json heeft geen gegevens uit het geheugen; niets te vergelijken.')
  process.exit(0)
}

console.log(`OMSI zelf: lijn ${mem.lineName}, omloop ${mem.tourName}, rit ${mem.tripName}`)
console.log(`           volgende halte "${mem.nextStop}" (nummer ${mem.nextIndex}, ${mem.nextDist.toFixed(0)} m)`)
console.log(`           verschil ${(mem.delay / 60).toFixed(1)} min, klok ${formatTime(data.time / 60)}`)

/** De dienst waar deze rit in zit; die zoeken we op de kaart zelf op. */
function dutyFor(mapFolder: string) {
  const map = loadMap(join(omsi!, 'maps'), mapFolder)
  if (!map) return undefined
  const net = buildNetwork(map)
  const key = mem!.tripName.trim().toLowerCase()
  for (let attempt = 0; attempt < 40; attempt++) {
    for (const duty of generateDuties(map, net, { targetMinutes: 90, lineFile: mem!.lineName.trim() }, 8)) {
      /*
       * Ook de omloop moet kloppen. Een dienst kan onderweg overstappen, en een
       * dienst die dezelfde rit in een andere omloop rijdt is niet de dienst die
       * in OMSI stond -- dan herkent de app hem terecht niet.
       */
      const tour = mem!.tourName.trim()
      if (
        duty.legs.some(
          (leg) => leg.tripFile.toLowerCase() === key && (!tour || leg.tourNumber.trim() === tour)
        )
      ) {
        return duty
      }
    }
  }
  return undefined
}

// Welke kaart? De rit staat in de kaart waar hij vandaan komt; probeer ze allemaal.
let duty
for (const folder of ['Rheinhausen', 'TH_Wald', 'Berlin-Spandau', 'HamburgLi20', 'Grundorf']) {
  duty = dutyFor(folder)
  if (duty) {
    console.log(`\ndienst gevonden op ${folder}: lijn ${duty.lineFile}, omloop ${duty.tourNumber}`)
    break
  }
}
if (!duty) {
  console.log('Geen dienst gevonden met deze rit erin.')
  process.exit(1)
}

const status = describeLive(data, duty)
const leg = status.leg
console.log(
  `\nde app: rit ${status.legIndex + 1} van ${duty.legs.length} (${leg?.tripFile}), ` +
    `vertrek ${leg ? formatTime(leg.departure) : '?'}`
)
console.log(
  `        volgende halte "${status.stopIndex !== undefined && leg ? leg.stops[status.stopIndex] : '?'}" ` +
    `(nummer ${status.stopIndex}), nog ${
      status.stopIndex !== undefined ? status.stopsTotal - status.stopIndex : '?'
    } van ${status.stopsTotal}`
)
const delta = status.deltaSeconds
console.log(`        verschil ${delta === undefined ? '?' : (delta / 60).toFixed(1)} min`)

const same = leg && status.stopIndex !== undefined && leg.stops[status.stopIndex] === mem.nextStop.trim()
const sameDelta = delta !== undefined && Math.abs(delta - mem.delay) < 1
console.log(
  `\nzelfde halte als OMSI: ${same ? 'ja' : 'NEE'}` + `, zelfde verschil: ${sameDelta ? 'ja' : 'NEE'}`
)
process.exit(same && sameDelta ? 0 : 1)
