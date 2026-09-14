import { join } from 'node:path'
import { branchingFactor, buildNetwork, generateDuty, MIN_DUTY_MINUTES } from '../src/core/duty'
import { buildFleetIndex, describeChoice, pickVehicleForDuty, readMapFleet } from '../src/core/fleet'
import { findOmsiInstall } from '../src/core/install'
import { findTemplate, readSituationTime } from '../src/core/situation'
import { listMaps, loadMap } from '../src/core/timetable'
import { formatDuration, formatTime } from '../src/shared/format'

const omsi = findOmsiInstall()
if (!omsi) {
  console.error('Geen OMSI 2-installatie gevonden.')
  process.exit(1)
}
const mapsPath = join(omsi, 'maps')

const lengths = [30, 60, 120, 240, 480]
console.log('kaart                      ritten  vertakking  ' + lengths.map((l) => `${l}m`.padStart(6)).join(''))
console.log('-'.repeat(76))

const loaded = []
for (const folder of listMaps(omsi)) {
  const map = loadMap(mapsPath, folder)
  if (!map) continue
  const network = buildNetwork(map)
  loaded.push({ map, network })

  // Per lengte: hoe vaak levert tien pogingen een bruikbare dienst op?
  const hits = lengths.map((targetMinutes) => {
    let ok = 0
    for (let i = 0; i < 10; i++) if (generateDuty(map, network, { targetMinutes })) ok++
    return `${ok}/10`.padStart(6)
  })
  console.log(
    `${map.name.slice(0, 24).padEnd(25)}${String(map.trips.size).padStart(7)}` +
      `${branchingFactor(map, network).toFixed(2).padStart(12)}  ${hits.join('')}`
  )
}

// --- onvoorspelbaarheid ---
const { map, network } = loaded.find((entry) => entry.map.folder === 'Berlin-Spandau') ?? loaded[0]
console.log(`\nVijf keer dezelfde vraag op ${map.name} (2 uur, hele dag):`)
for (let i = 0; i < 5; i++) {
  const duty = generateDuty(map, network, { targetMinutes: 120 })
  if (!duty) {
    console.log('  geen dienst')
    continue
  }
  console.log(
    `  ${formatTime(duty.start)}-${formatTime(duty.end)}  ${formatDuration(duty.durationMinutes).padEnd(8)}` +
      ` lijn ${duty.lineNumbers.join('/').padEnd(9)} ${String(duty.legs.length).padStart(2)} ritten  ` +
      `omlopen ${[...new Set(duty.legs.map((l) => l.tourNumber))].join(',')}`
  )
}

// --- korte dienst + automatische bus ---
console.log(`\nKortste dienst (${MIN_DUTY_MINUTES} min):`)
const short = generateDuty(map, network, { targetMinutes: MIN_DUTY_MINUTES })
if (short) {
  console.log(`  ${formatTime(short.start)}-${formatTime(short.end)} ${formatDuration(short.durationMinutes)}, ${short.legs.length} ritten`)
  for (const leg of short.legs) {
    console.log(
      `    ${formatTime(leg.departure)}-${formatTime(leg.arrival)} lijn ${leg.lineNumber.padEnd(5)}` +
        ` naar ${leg.terminus.padEnd(22)} ${leg.layoverBefore > 0 ? `(${leg.layoverBefore} min wachten)` : ''}`
    )
  }
}

console.log('\nWagenpark inlezen…')
const started = Date.now()
const fleet = buildFleetIndex(omsi)
console.log(`  ${fleet.vehicles.length} voertuigen, ${fleet.hofsByFolder.size} mappen, ${Date.now() - started} ms`)

const template = findTemplate(omsi, map.folder)
const year: number = (template ? readSituationTime(template)?.year : undefined) ?? 2000
const mapFleet = readMapFleet(join(mapsPath, map.folder))
console.log(
  `\nAutomatische buskeuze op ${map.name} (${year}); wagenpark van de kaart: ${mapFleet.size} voertuigen`
)
for (let i = 0; i < 4; i++) {
  const duty = generateDuty(map, network, { targetMinutes: 120 })
  if (!duty) continue
  const choice = pickVehicleForDuty(fleet, duty, year, mapFleet)
  console.log(
    `  lijn ${duty.lineNumbers.join('/').padEnd(9)} -> ` +
      (choice
        ? `${describeChoice(choice)}  (past ${Math.round(choice.fit * 100)}%, ${choice.alternatives} kandidaten${choice.fromMapFleet ? ', van de kaart' : ', BUITEN het wagenpark'})`
        : 'GEEN PASSENDE BUS')
  )
}
