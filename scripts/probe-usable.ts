/**
 * Wat houdt een kaart over nadat de AI-lijnen eruit zijn, en waar rijden die
 * diensten overheen? Een dienst die over spoor loopt hoort er niet te zijn.
 */
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { buildNetwork, generateDuties } from '../src/core/duty'
import { findOmsiInstall } from '../src/core/install'
import { loadMap } from '../src/core/timetable'

const omsi = findOmsiInstall()
if (!omsi) throw new Error('Geen OMSI 2 gevonden.')
const maps = join(omsi, 'maps')

for (const folder of readdirSync(maps)) {
  let loaded
  try {
    loaded = loadMap(maps, folder)
  } catch {
    continue
  }
  if (!loaded) continue

  const lines = [...new Set(loaded.tours.map((tour) => tour.lineFile))].sort()
  let duties: ReturnType<typeof generateDuties> = []
  try {
    duties = generateDuties(loaded, buildNetwork(loaded), { targetMinutes: 60 }, 40)
  } catch {
    // Een kaart zonder bruikbare ketens levert gewoon niets op.
  }
  const offered = [...new Set(duties.map((duty) => duty.lineFile))].sort()

  console.log(
    `${folder.padEnd(22)} ${String(loaded.tours.length).padStart(4)} omlopen op ${lines.length} lijnen` +
      `  | ${duties.length} diensten op: ${offered.join(', ') || '(geen)'}`
  )
}
