/**
 * Schuift de app mee naar de volgende rit zodra de vorige is aangekomen?
 *
 *   npx tsx scripts/probe-legswitch.ts [kaart]
 *
 * Een dienst bestaat uit ritten achter elkaar. Is de eerste uitgereden en staat
 * de bus op het eindpunt te wachten op de volgende, dan hoort de app de rit te
 * tonen die nu aan de beurt is -- niet die van een half uur geleden. Anders
 * staat er een route op de kaart die al gereden is, en instructies voor een rit
 * die niet meer bestaat.
 *
 * Vier standen, want het gaat om de volgorde waarin de app zijn bronnen
 * gelooft: wat OMSI zegt gaat voor, en pas als dat niets oplevert telt de klok.
 */
import { join } from 'node:path'
import { buildNetwork, generateDuty } from '../src/core/duty'
import { findOmsiInstall } from '../src/core/install'
import { describeLive, type LiveData } from '../src/core/live'
import { loadMap } from '../src/core/timetable'
import { formatTime } from '../src/shared/format'

const omsi = findOmsiInstall()
if (!omsi) throw new Error('Geen OMSI 2 gevonden.')

const folder = process.argv[2] || 'Rheinhausen'
const map = loadMap(join(omsi, 'maps'), folder)
if (!map) throw new Error(`Kaart ${folder} niet gevonden.`)

const network = buildNetwork(map)
let duty = generateDuty(map, network, { targetMinutes: 120 })
for (let attempt = 0; attempt < 40 && (!duty || duty.legs.length < 2); attempt++) {
  duty = generateDuty(map, network, { targetMinutes: 120 })
}
if (!duty || duty.legs.length < 2) throw new Error('Geen dienst met twee ritten gevonden.')

console.log(`${folder}: lijn ${duty.lineFile}, omloop ${duty.tourNumber}, ${duty.legs.length} ritten`)
duty.legs.forEach((leg, index) => {
  console.log(
    `   rit ${index}: ${formatTime(leg.departure)} - ${formatTime(leg.arrival)}  ${leg.tripFile}`
  )
})

/** Een stand van de plugin; `trip` leeg betekent: OMSI laat niets lezen. */
function sample(clockMinutes: number, trip?: string, tour?: string): LiveData {
  return {
    alive: true,
    seen: 0x3fffff,
    seenStr: 8,
    strKind: 1,
    time: clockMinutes * 60,
    day: 1,
    month: 1,
    year: 2016,
    velocity: 0,
    passengers: 0,
    scheduleActive: trip ? 1 : 0,
    targetIndex: 0,
    tankPercent: 0.8,
    km: 1000,
    metres: 0,
    entryRequest: 0,
    exitRequest: 0,
    ticket: -1,
    entryOpen: 0,
    exitOpen: 0,
    atStation: 0,
    brightness: 0.8,
    streetCond: 0,
    precipRate: 0,
    precipType: 0,
    lightsLow: 1,
    blinkerLeft: 0,
    blinkerRight: 0,
    brakeLight: 0,
    engineOn: 1,
    busstopIndex: 0,
    maxBrake: 0,
    maxAccel: 0,
    topSpeed: 50,
    harshBrakes: 0,
    harshAccels: 0,
    busstop: '',
    delayMin: '',
    delaySec: '',
    line: '',
    terminus: '',
    matrix: '',
    exeVersion: '2.3.004',
    ageMs: 0,
    mem: {
      ok: trip ? 1 : 0,
      tile: 1,
      x: 0,
      y: 0,
      z: 0,
      qx: 0,
      qy: 0,
      qz: 0,
      qw: 1,
      schedActive: trip ? 1 : 0,
      line: 0,
      tour: 0,
      tourEntry: 0,
      trip: 0,
      nextIndex: 0,
      nextDist: 80,
      delay: 0,
      lineName: duty!.lineFile,
      tourName: tour ?? duty!.legs[0].tourNumber,
      tripName: trip ?? '',
      nextStop: ''
    }
  } as unknown as LiveData
}

const first = duty.legs[0]
const second = duty.legs[1]
/* Tussen aankomst en het volgende vertrek: de bus staat op het eindpunt. */
const between = (first.arrival + second.departure) / 2
const during = (first.departure + first.arrival) / 2

let ok = true
const eis = (naam: string, got: number | undefined, want: number): void => {
  const goed = got === want
  if (!goed) ok = false
  console.log(`   ${goed ? 'ja ' : 'NEE'} ${naam.padEnd(52)} rit ${got} (hoort ${want})`)
}

console.log('\nwelke rit wijst de app aan:')
eis('tijdens de eerste rit', describeLive(sample(during), duty).legIndex, 0)
eis(
  'na aankomst, wachtend op de tweede',
  describeLive(sample(between), duty).legIndex,
  1
)
eis(
  'OMSI rijdt nog de eerste, de klok is al verder',
  describeLive(sample(between, first.tripFile), duty).legIndex,
  0
)
eis(
  'OMSI rijdt iets dat niet in de dienst zit',
  describeLive(sample(between, 'een rit die hier niet bestaat'), duty).legIndex,
  1
)
eis(
  'OMSI is aan de tweede begonnen',
  describeLive(sample(between, second.tripFile, second.tourNumber), duty).legIndex,
  1
)

// En na de laatste rit blijft hij op de laatste staan; de dienst is dan uit.
const last = duty.legs[duty.legs.length - 1]
eis(
  'na de laatste rit',
  describeLive(sample(last.arrival + 20), duty).legIndex,
  duty.legs.length - 1
)

console.log(ok ? '\nde app schuift mee met de dienst' : '\nKLOPT NIET')
process.exit(ok ? 0 : 1)
