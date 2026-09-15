/**
 * Hoeveel verschillende lijnen rijdt een chauffeur in één dienst?
 *
 * Een dienst wordt door de dienstregeling gelopen: waar de ene rit eindigt,
 * begint de volgende. Op een knooppunt staan daar vaak ritten van meerdere
 * lijnen klaar, en dan is overstappen leuker dan drie uur dezelfde lus. Deze
 * proef telt wat eruit komt.
 *
 *   npx tsx scripts/probe-variety.ts [kaart ...]
 */
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { buildNetwork, generateDuty } from '../src/core/duty'
import { findOmsiInstall } from '../src/core/install'
import { loadMap } from '../src/core/timetable'

const omsi = findOmsiInstall()
if (!omsi) throw new Error('Geen OMSI 2 gevonden.')
const maps = join(omsi, 'maps')
const only = process.argv.slice(2).filter((arg) => !/^\d+$/.test(arg))
/** Dienstlengte om mee te meten; korte diensten hebben minder overgangen. */
const minutes = Number(process.argv.slice(2).find((arg) => /^\d+$/.test(arg)) ?? 120)

for (const folder of readdirSync(maps)) {
  if (only.length > 0 && !only.includes(folder)) continue
  const map = loadMap(maps, folder)
  if (!map) continue
  const net = buildNetwork(map)

  const counts = new Map<number, number>()
  let duties = 0
  let legs = 0
  let switches = 0
  let reselect = 0

  for (let i = 0; i < 120; i++) {
    const duty = generateDuty(map, net, { targetMinutes: minutes })
    if (!duty) continue
    duties++
    legs += duty.legs.length
    counts.set(duty.lineNumbers.length, (counts.get(duty.lineNumbers.length) ?? 0) + 1)
    for (let k = 1; k < duty.legs.length; k++) {
      if (duty.legs[k].lineNumber !== duty.legs[k - 1].lineNumber) switches++
      if (duty.legs[k].switchInOmsi) reselect++
    }
  }
  if (duties === 0) continue

  const spread = [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([lines, count]) => `${lines} lijn${lines === 1 ? '' : 'en'}: ${count}`)
    .join(', ')
  console.log(
    `${folder.padEnd(22)} ${duties} diensten van ~${minutes} min, gemiddeld ${(legs / duties).toFixed(1)} ritten, ` +
      `${((switches / Math.max(1, legs - duties)) * 100).toFixed(0)}% van de overgangen is een andere lijn\n` +
      `${' '.repeat(23)}${spread}`
  )
}
