/**
 * Wat betekenen de getallen in `[settimetable]`?
 *
 * OMSI zet dat blok in een situatiebestand als de speler in het
 * dienstregelingsmenu een lijn en een omloop heeft gekozen. De eerste twee
 * velden zijn duidelijk (het lijnbestand en de naam van de omloop), de vier
 * getallen erna niet. Deze proef legt ze naast de dienstregeling zelf: klopt
 * het derde veld als ritnummer binnen de omloop, dan hoort de vertrektijd van
 * die rit bij de klok in het bestand.
 */
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { findOmsiInstall } from '../src/core/install'
import { blockTag, readOmsiLines, str } from '../src/core/omsiFile'
import { readTours } from '../src/core/timetable'
import { formatTime } from '../src/shared/format'

const omsi = findOmsiInstall()
if (!omsi) throw new Error('Geen OMSI 2 gevonden.')

/** Alle situatiebestanden die er op deze machine zijn. */
function situations(): string[] {
  const files: string[] = []
  const folder = join(omsi!, 'Situations')
  for (const entry of readdirSync(folder)) {
    if (entry.toLowerCase().endsWith('.osn')) files.push(join(folder, entry))
  }
  for (const folderName of readdirSync(join(omsi!, 'maps'))) {
    const last = join(omsi!, 'maps', folderName, 'laststn.osn')
    try {
      readOmsiLines(last)
      files.push(last)
    } catch {
      // Niet elke kaart is ooit gespeeld.
    }
  }
  return files
}

/**
 * Zoekt een lijnbestand ergens onder de kaartmap. Kaarten met tijdvakken zetten
 * hun dienstregeling in `Chrono\<jaar>\TTData`, niet in de gewone map.
 */
function findLineFile(mapFolder: string, lineFile: string): string | undefined {
  const wanted = `${lineFile.toLowerCase()}.ttl`
  const stack = [join(omsi!, 'maps', mapFolder)]
  while (stack.length > 0) {
    const folder = stack.pop()!
    for (const entry of readdirSync(folder)) {
      const path = join(folder, entry)
      if (entry.toLowerCase() === wanted) return path
      try {
        if (statSync(path).isDirectory()) stack.push(path)
      } catch {
        // Onleesbare map; overslaan.
      }
    }
  }
  return undefined
}

for (const file of situations()) {
  const lines = readOmsiLines(file)
  const at = lines.findIndex((line) => blockTag(line) === '[settimetable]')
  if (at < 0) continue

  const values = lines.slice(at + 1, at + 7).map(str)
  const mapLine = lines[lines.findIndex((line) => blockTag(line) === '[map]') + 1]
  const mapFolder = str(mapLine).match(/maps[\\/]([^\\/]+)[\\/]/i)?.[1] ?? ''
  const timeAt = lines.findIndex((line) => blockTag(line) === '[time]')
  const hour = Number(str(lines[timeAt + 3]))
  const minute = Number(str(lines[timeAt + 4]))
  const clock = hour * 60 + minute

  const [lineFile, tourName, third, fourth, fifth, sixth] = values
  const path = findLineFile(mapFolder, lineFile)
  const tours = path ? readTours(path) : []
  const tour = tours.find((item) => item.number === tourName)

  console.log(`\n== ${file.replace(omsi, '')}`)
  console.log(`   kaart ${mapFolder}, klok ${formatTime(clock)}`)
  console.log(`   lijn "${lineFile}", omloop "${tourName}", velden ${third} ${fourth} ${fifth} ${sixth}`)
  if (!tour) {
    console.log('   omloop niet gevonden')
    continue
  }
  console.log(`   de omloop heeft ${tour.trips.length} ritten`)
  const index = Number(third)
  for (const offset of [-1, 0, 1]) {
    const trip = tour.trips[index + offset]
    if (!trip) continue
    const diff = clock - trip.departure
    console.log(
      `   rit ${index + offset}: ${trip.tripFile} vertrekt ${formatTime(trip.departure)}` +
        ` -- klok staat ${Math.round(diff)} min later (${Math.round(diff * 60)} s)`
    )
  }
  console.log(`   zesde veld als seconden: ${Math.round(Number(sixth) / 60)} min`)
}
