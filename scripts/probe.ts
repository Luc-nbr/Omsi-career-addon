import { countDuties, formatDuration, formatTime, generateDuty } from '../src/core/duty'
import { findOmsiInstall } from '../src/core/install'
import { listMaps, loadMap } from '../src/core/timetable'
import { join } from 'node:path'

const omsi = findOmsiInstall()
if (!omsi) {
  console.error('Geen OMSI 2-installatie gevonden.')
  process.exit(1)
}
console.log(`OMSI gevonden: ${omsi}\n`)

const mapsPath = join(omsi, 'maps')
const folders = listMaps(omsi)
const lengths = [120, 240, 360, 480]

console.log('kaart                        omlopen  ritten  haltes   ' + lengths.map((l) => `${l / 60}u`.padStart(6)).join(''))
console.log('-'.repeat(84))

const loaded = []
for (const folder of folders) {
  const map = loadMap(mapsPath, folder)
  if (!map) continue
  loaded.push(map)
  const counts = lengths.map((targetMinutes) =>
    String(countDuties(map, { targetMinutes })).padStart(6)
  )
  console.log(
    `${map.name.slice(0, 26).padEnd(28)}${String(map.tours.length).padStart(7)}` +
      `${String(map.trips.size).padStart(8)}${String(map.stops.size).padStart(8)}   ${counts.join('')}`
  )
}

const map = loaded.find((m) => m.folder === 'Berlin-Spandau') ?? loaded[0]
const duty = generateDuty(map, { targetMinutes: 240, random: () => 0.42 })

if (!duty) {
  console.error('\nGeen dienst gevonden.')
  process.exit(1)
}

console.log(`\n${'='.repeat(64)}`)
console.log(`DIENSTKAART  ${duty.mapName}`)
console.log(`${'='.repeat(64)}`)
console.log(`Omloop ${duty.tourNumber} (${duty.lineFile})   remise ${duty.depot || 'onbekend'}`)
console.log(`Lijn ${duty.lineNumbers.join(', ')}   ${duty.legs.length} ritten   ${duty.totalStops} haltes`)
console.log(
  `Aanmelden ${formatTime(duty.signOn)}   dienst ${formatTime(duty.start)} - ${formatTime(duty.end)}   ` +
    `${formatDuration(duty.durationMinutes)}\n`
)
for (const leg of duty.legs) {
  console.log(
    `  ${formatTime(leg.departure)} - ${formatTime(leg.arrival)}  lijn ${leg.lineNumber.padEnd(5)}` +
      ` naar ${leg.terminus.padEnd(24)} ${String(leg.stops.length).padStart(2)} haltes`
  )
  console.log(`      ${leg.stops.slice(0, 4).join(' - ')}${leg.stops.length > 4 ? ' - …' : ''}`)
}
