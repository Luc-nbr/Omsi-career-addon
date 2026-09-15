/**
 * Hoe ziet een examenrit eruit?
 *
 * Het rijexamen is één rit op een gekozen lijn. Deze proef laat per kaart zien
 * wat `examTrip` uitzoekt: hoe lang de rit duurt en hoeveel haltes hij aandoet.
 * Te korte ritten zeggen niets -- een lijn heeft vaak staartritten van een paar
 * minuten naar de remise.
 *
 *   npx tsx scripts/probe-exam.ts [kaart ...]
 */
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { buildNetwork, examTrip, listLines } from '../src/core/duty'
import { findOmsiInstall } from '../src/core/install'
import { loadMap } from '../src/core/timetable'
import { formatTime } from '../src/shared/format'

const omsi = findOmsiInstall()
if (!omsi) throw new Error('Geen OMSI 2 gevonden.')
const maps = join(omsi, 'maps')
const only = process.argv.slice(2)

for (const folder of readdirSync(maps)) {
  if (only.length > 0 && !only.includes(folder)) continue
  const map = loadMap(maps, folder)
  if (!map) continue
  const net = buildNetwork(map)
  const lines = listLines(map, net)
  if (lines.length === 0) continue

  console.log(`\n== ${folder} (${lines.length} lijnen)`)
  for (const line of lines) {
    const duty = examTrip(map, net, line.lineFile)
    const leg = duty?.legs[0]
    console.log(
      `   ${line.lineFile.padEnd(26)} ${
        leg
          ? `${formatTime(leg.departure)}-${formatTime(leg.arrival)}, ${Math.round(leg.minutes)} min, ${leg.stops.length} haltes`
          : 'geen geschikte rit'
      }`
    )
  }
}
