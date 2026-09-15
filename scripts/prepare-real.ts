/**
 * Zet één echte dienst klaar in de spelmap, precies zoals de app het doet.
 *
 * Bedoeld om in OMSI zelf na te kijken of het startscherm klopt: opent het spel
 * op de goede kaart, staat de situatie er al, en is de lijn in het
 * dienstregelingsmenu gekozen? Dit schrijft dus wél in de spelmap.
 *
 *   npx tsx scripts/prepare-real.ts [kaart] [minuten]
 */
import { join } from 'node:path'
import { dateForMask, readCalendar } from '../src/core/calendar'
import { buildNetwork, generateDuties } from '../src/core/duty'
import { buildFleetIndex, pickVehicleForDuty, readMapFleet } from '../src/core/fleet'
import { readMapData, readTileGrid } from '../src/core/geo'
import { buildIbisPlan } from '../src/core/ibis'
import { findOmsiInstall } from '../src/core/install'
import { LaneNetwork } from '../src/core/routing'
import { findTemplate, readSituationTime, writeSituation } from '../src/core/situation'
import { spawnAtStop } from '../src/core/spawn'
import { presetStartup, readLastMap } from '../src/core/startup'
import { loadMap } from '../src/core/timetable'
import { formatTime } from '../src/shared/format'

const omsi = findOmsiInstall()
if (!omsi) throw new Error('Geen OMSI 2 gevonden.')

const folder = process.argv[2] || 'Grundorf'
const minutes = Number(process.argv[3] || 60)

const loaded = loadMap(join(omsi, 'maps'), folder)
if (!loaded) throw new Error(`Kaart ${folder} niet gevonden.`)

const net = buildNetwork(loaded)
const duty = generateDuties(loaded, net, { targetMinutes: minutes }, 1)[0]
if (!duty) throw new Error('Geen dienst gevonden.')

const template = findTemplate(omsi, folder)
const era = (template && readSituationTime(template)) || { year: 2016, dayOfYear: 180 }
const when = dateForMask(readCalendar(loaded.path), era.year, era.dayOfYear, duty.days | duty.period)
if (!when) throw new Error('Geen datum gevonden waarop deze omloop rijdt.')

const choice = pickVehicleForDuty(buildFleetIndex(omsi), duty, era.year, readMapFleet(loaded.path))
if (!choice) throw new Error('Geen bus gevonden.')
const ibis = buildIbisPlan(omsi, choice.vehicle.relativePath, duty, era.year)

const ids = new Set<string>(loaded.stops.keys())
for (const trip of loaded.trips.values()) for (const stop of trip.stops) ids.add(stop.id)
const { geometry, lanes } = readMapData(loaded.path, ids, omsi)
const grid = readTileGrid(loaded.path)
const stop = geometry.stops.find((item) => item.id === duty.legs[0]?.stopIds[0])
const spawn = grid && stop ? spawnAtStop(loaded.path, grid, new LaneNetwork(lanes), stop) : undefined

const tour = loaded.tours.find(
  (item) => item.lineFile === duty.lineFile && item.number === duty.tourNumber
)
const trip = tour?.trips.findIndex(
  (item) =>
    item.tripFile.toLowerCase() === duty.legs[0].tripFile.toLowerCase() &&
    item.departure === duty.legs[0].departure
)

const result = writeSituation(omsi, {
  mapFolder: folder,
  name: `OMSI Career — lijn ${duty.lineFile}, omloop ${duty.tourNumber}`,
  description: `Vertrek ${formatTime(duty.start)} vanaf ${duty.legs[0]?.stops[0] ?? '?'}.`,
  year: when.year,
  dayOfYear: when.dayOfYear,
  minutes: duty.signOn,
  vehicle: {
    relativePath: choice.vehicle.relativePath,
    lineNumber: ibis.line || duty.legs[0].lineNumber,
    terminus: duty.legs[0].terminus,
    yard: ibis.yard
  },
  spawn,
  timetable:
    trip !== undefined && trip >= 0
      ? { lineFile: duty.lineFile, tour: duty.tourNumber, trip }
      : undefined
})

const startup = presetStartup(omsi, folder, result.file)

console.log(`kaart      ${folder} (${loaded.name})`)
console.log(`dienst     lijn ${duty.lineFile}, omloop ${duty.tourNumber}, rit ${trip}`)
console.log(`vertrek    ${formatTime(duty.start)}, aanmelden ${formatTime(duty.signOn)}`)
console.log(`datum      ${when.year}, dag ${when.dayOfYear}`)
console.log(`bus        ${choice.vehicle.manufacturer} ${choice.vehicle.type}`)
console.log(`IBIS       lijn ${ibis.line}, route ${ibis.legs[0]?.route ?? '?'}`)
console.log(`bestand    ${result.file}`)
console.log(`laststn    ${startup.lastSituation}${startup.backup ? ` (kopie: ${startup.backup})` : ''}`)
console.log(`last_map   ${readLastMap(omsi)}`)
