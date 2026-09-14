import { join } from 'node:path'
import { formatDuration, formatTime, generateDuty, SIGN_ON_MINUTES } from '../src/core/duty'
import { findOmsiInstall } from '../src/core/install'
import { readOmsiLines } from '../src/core/omsiFile'
import { findTemplate, writeSituation } from '../src/core/situation'
import { listMaps, loadMap } from '../src/core/timetable'
import { listVehicles, vehicleName } from '../src/core/vehicles'

const omsi = findOmsiInstall()!
console.log('=== sjabloon per kaart ===')
for (const folder of listMaps(omsi)) {
  const template = findTemplate(omsi, folder)
  console.log(`  ${folder.padEnd(22)} ${template ? template.split(/[\\/]/).slice(-2).join('/') : 'GEEN'}`)
}

const map = loadMap(join(omsi, 'maps'), 'Berlin-Spandau')!
const duty = generateDuty(map, { targetMinutes: 240, random: () => 0.42 })!
const bus = listVehicles(omsi).find((v) => v.relativePath.includes('MAN_SD200'))!

console.log(`\nDienst: lijn ${duty.lineNumbers.join(',')} ${formatTime(duty.start)}-${formatTime(duty.end)} (${formatDuration(duty.durationMinutes)})`)
console.log(`Bus:    ${vehicleName(bus)} — ${bus.relativePath}`)

const result = writeSituation(omsi, {
  mapFolder: duty.mapFolder,
  name: `Dienst ${duty.tourNumber} — lijn ${duty.lineNumbers.join('/')}`,
  description: `Omloop ${duty.tourNumber} vanaf ${duty.depot}. Aanmelden ${formatTime(duty.signOn)}, ${duty.legs.length} ritten tot ${formatTime(duty.end)}.`,
  year: 1986,
  dayOfYear: 250,
  minutes: duty.start - SIGN_ON_MINUTES,
  vehicle: { relativePath: bus.relativePath, lineNumber: duty.lineNumbers[0], terminus: duty.legs[0].terminus }
})

console.log(`\nGeschreven: ${result.file}`)
console.log(`Sjabloon:   ${result.template}   bus klaargezet: ${result.vehiclePlaced ? 'ja' : 'nee'}`)

// teruglezen en de gezette velden controleren
const lines = readOmsiLines(result.file)
const show = (tag: string, count: number) => {
  const i = lines.findIndex((l) => l.trim() === tag)
  console.log(`  ${tag.padEnd(20)} ${i < 0 ? 'ONTBREEKT' : JSON.stringify(lines.slice(i + 1, i + 1 + count))}`)
}
console.log('\n=== controle ===')
show('[name]', 1)
show('[map]', 1)
show('[time]', 5)
show('[vehicle]', 1)
for (const name of ['SetLineTo', 'Matrix_Nr', 'IBIS_cabindisplay']) {
  const i = lines.findIndex((l) => l.trim() === name)
  console.log(`  ${name.padEnd(20)} ${i < 0 ? 'ONTBREEKT' : JSON.stringify(lines[i + 1])}`)
}
