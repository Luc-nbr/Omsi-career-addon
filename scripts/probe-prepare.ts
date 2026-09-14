/**
 * Zet een dienst klaar en lees het terug: staat de bus waar hij hoort?
 *
 * Schrijft naar een eigen map (niet naar de spelmap) en rekent het
 * voertuigblok terug naar kaartmeters: hoe ver van de eerste halte, hoe ver van
 * een rijstrook, en of de koers met de rijstrook meeloopt.
 *
 *   npx tsx scripts/probe-prepare.ts [kaart ...]
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { dateForMask, readCalendar } from '../src/core/calendar'
import { buildNetwork, generateDuties } from '../src/core/duty'
import { readMapData, readTileGrid } from '../src/core/geo'
import { findOmsiInstall } from '../src/core/install'
import { blockTag, num, readOmsiLines, str } from '../src/core/omsiFile'
import { LaneNetwork } from '../src/core/routing'
import { findTemplate, readSituationTime, writeSituation } from '../src/core/situation'
import { spawnAtStop } from '../src/core/spawn'
import { loadMap } from '../src/core/timetable'

const omsi = findOmsiInstall()
if (!omsi) throw new Error('Geen OMSI 2 gevonden.')
const maps = join(omsi, 'maps')
const only = process.argv.slice(2)

function angleGap(a: number, b: number): number {
  const gap = Math.abs((((a - b) % 360) + 360) % 360)
  return gap > 180 ? 360 - gap : gap
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
  // Ook de haltes uit de ritten: oudere kaarten hebben een lege Busstops.cfg.
  const ids = new Set<string>(loaded.stops.keys())
  for (const trip of loaded.trips.values()) for (const stop of trip.stops) ids.add(stop.id)
  const { geometry, lanes } = readMapData(loaded.path, ids, omsi)
  const network = new LaneNetwork(lanes)
  const stop = geometry.stops.find((item) => item.id === duty.legs[0]?.stopIds[0])
  if (!grid || !stop) {
    console.log(`${folder.padEnd(22)} geen halteposities`)
    continue
  }

  const spawn = spawnAtStop(loaded.path, grid, network, stop)
  // Het tijdvak komt uit een bestaande situatie als die er is, anders uit de naam.
  const template = findTemplate(omsi, folder)
  const fromName = folder.match(/(19\d{2}|20[0-2]\d)/)
  const era = (template ? readSituationTime(template) : undefined) ?? {
    year: fromName ? Number.parseInt(fromName[1], 10) : 2015,
    dayOfYear: 180
  }
  const when = dateForMask(readCalendar(loaded.path), era.year, era.dayOfYear, duty.days | duty.period)

  // Naar een eigen map schrijven; de spelmap blijft onaangeroerd.
  const sandbox = mkdtempSync(join(tmpdir(), 'omsi-osn-'))
  const result = writeSituation(omsi, {
    mapFolder: folder,
    name: 'Proef',
    description: 'Proef',
    year: when?.year ?? era.year,
    dayOfYear: when?.dayOfYear ?? era.dayOfYear,
    minutes: duty.signOn,
    vehicle: { relativePath: 'vehicles\\proef\\proef.bus', lineNumber: '1', terminus: 'Proef' },
    spawn,
    into: sandbox
  })

  // Terugrekenen uit het geschreven bestand.
  const lines = readOmsiLines(result.file)
  const at = lines.findIndex((line) => blockTag(line) === '[vehicle]')
  const values = lines.slice(at + 1, at + 16).map((line) => str(line))
  const [dx, dy] = grid.offset(Math.round(num(values[11])), Math.round(num(values[12])))
  const x = dx + num(values[1])
  const y = dy + num(values[3])
  const qy = num(values[5])
  const qw = num(values[7])
  const heading = (Math.atan2(2 * qw * qy, 1 - 2 * qy * qy) * 180) / Math.PI

  const time = lines[lines.findIndex((line) => blockTag(line) === '[time]') + 1]
  console.log(
    `${folder.padEnd(22)} ${result.spawnPlaced ? 'geplaatst' : 'sjabloonplek'} | ` +
      `halte ${Math.hypot(x - stop.x, y - stop.y).toFixed(1)} m | ` +
      `rijstrook ${network.distanceToLane(x, y).toFixed(1)} m | ` +
      `koers ${angleGap(heading, spawn?.heading ?? 0).toFixed(1)}° afwijking | ` +
      `hoogte ${num(values[2]).toFixed(1)} | jaar ${time}`
  )
}
