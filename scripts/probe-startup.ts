/**
 * Staat de dienst klaar zodra OMSI opstart?
 *
 * Deze proef zet een dienst klaar in een nagebouwde spelmap -- een kopie van
 * `options.cfg` en lege kaartmappen -- en leest terug wat er geschreven is:
 * het dienstregelingsblok in de situatie, de situatie als "Last Situation" van
 * zijn kaart, en de kaart in `options.cfg`. De echte installatie blijft
 * onaangeroerd.
 *
 *   npx tsx scripts/probe-startup.ts [kaart ...]
 */
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { dateForMask, readCalendar } from '../src/core/calendar'
import { buildNetwork, generateDuties } from '../src/core/duty'
import { readMapData, readTileGrid } from '../src/core/geo'
import { findOmsiInstall } from '../src/core/install'
import { blockTag, readOmsiLines, str } from '../src/core/omsiFile'
import { LaneNetwork } from '../src/core/routing'
import { findTemplate, readSituationTime, writeSituation } from '../src/core/situation'
import { spawnAtStop } from '../src/core/spawn'
import { presetStartup, readLastMap } from '../src/core/startup'
import { loadMap } from '../src/core/timetable'
import { formatTime } from '../src/shared/format'

const omsi = findOmsiInstall()
if (!omsi) throw new Error('Geen OMSI 2 gevonden.')
const maps = join(omsi, 'maps')
const only = process.argv.slice(2)

/** Een nagebouwde spelmap: alleen wat het klaarzetten aanraakt. */
function fakeInstall(folder: string): string {
  const root = mkdtempSync(join(tmpdir(), 'omsi-startup-'))
  mkdirSync(join(root, 'maps', folder), { recursive: true })
  mkdirSync(join(root, 'Situations'), { recursive: true })
  copyFileSync(join(omsi!, 'options.cfg'), join(root, 'options.cfg'))
  return root
}

/** De velden van een blok, tot de volgende tag. */
function fieldsOf(lines: string[], tag: string): string[] | undefined {
  const at = lines.findIndex((line) => blockTag(line) === tag)
  if (at < 0) return undefined
  const values: string[] = []
  for (let i = at + 1; i < lines.length && !blockTag(lines[i]); i++) values.push(str(lines[i]))
  return values
}

for (const folder of readdirSync(maps)) {
  if (only.length > 0 && !only.includes(folder)) continue
  const loaded = loadMap(maps, folder)
  if (!loaded) continue

  const duties = generateDuties(loaded, buildNetwork(loaded), { targetMinutes: 60 }, 1)
  const duty = duties[0]
  if (!duty) {
    console.log(`${folder.padEnd(22)} geen dienst`)
    continue
  }

  const grid = readTileGrid(loaded.path)
  const ids = new Set<string>(loaded.stops.keys())
  for (const trip of loaded.trips.values()) for (const stop of trip.stops) ids.add(stop.id)
  const { geometry, lanes } = readMapData(loaded.path, ids, omsi)
  const stop = geometry.stops.find((item) => item.id === duty.legs[0]?.stopIds[0])
  const spawn = grid && stop ? spawnAtStop(loaded.path, grid, new LaneNetwork(lanes), stop) : undefined

  const template = findTemplate(omsi, folder)
  const era = (template && readSituationTime(template)) || { year: 2016, dayOfYear: 180 }
  const when = dateForMask(readCalendar(loaded.path), era.year, era.dayOfYear, duty.days | duty.period)

  // Het ritnummer binnen de omloop, zoals `[settimetable]` het wil.
  const tour = loaded.tours.find(
    (item) => item.lineFile === duty.lineFile && item.number === duty.tourNumber
  )
  const trip = tour?.trips.findIndex(
    (item) =>
      item.tripFile.toLowerCase() === duty.legs[0].tripFile.toLowerCase() &&
      item.departure === duty.legs[0].departure
  )

  const root = fakeInstall(folder)
  const result = writeSituation(root, {
    mapFolder: folder,
    name: `OMSI Career - lijn ${duty.lineFile}, omloop ${duty.tourNumber}`,
    description: `Vertrek ${formatTime(duty.start)}`,
    year: when?.year ?? era.year,
    dayOfYear: when?.dayOfYear ?? era.dayOfYear,
    minutes: duty.signOn,
    vehicle: { relativePath: 'vehicles\\test\\test.bus', lineNumber: duty.lineNumbers[0], terminus: duty.legs[0].terminus },
    spawn,
    timetable:
      trip !== undefined && trip >= 0
        ? { lineFile: duty.lineFile, tour: duty.tourNumber, trip }
        : undefined
  })

  const startup = presetStartup(root, folder, result.file)
  const written = readOmsiLines(result.file)
  const last = readOmsiLines(join(root, 'maps', folder, 'laststn.osn'))

  console.log(`\n== ${folder}`)
  console.log(`   dienst lijn ${duty.lineFile}, omloop ${duty.tourNumber}, rit ${trip}`)
  console.log(`   TT_active in situatie: ${written.some((line) => blockTag(line) === '[TT_active]')}`)
  console.log(`   settimetable: ${JSON.stringify(fieldsOf(written, '[settimetable]'))}`)
  console.log(`   laststn geschreven: ${startup.lastSituation}, zelfde inhoud: ${last.length === written.length}`)
  console.log(`   last_map: ${readLastMap(root)} (gezet: ${startup.lastMap})`)
  console.log(`   options.cfg regels: ${readFileSync(join(root, 'options.cfg'), 'latin1').split('\r\n').length}`)
}
