/**
 * Schuiven de haltes netjes op terwijl de bus de rit afwerkt?
 *
 * We spelen een rit na: voor elke halte krijgt `describeLive` de naam door die
 * OMSI zou melden, met een verschil dat niet verandert. Wat eruit moet komen is
 * een halteteller die precies één ophoogt en een verschil dat blijft staan --
 * springt daar iets, dan springt het in het spel ook.
 *
 * Het nummer dat OMSI erbij levert zetten we met opzet verkeerd: dat telt in
 * zijn eigen lijst, en de app hoort erop te vertrouwen dat de naam klopt.
 *
 *   npx tsx scripts/probe-progress.ts [kaart]
 */
import { join } from 'node:path'
import { buildNetwork, generateDuty } from '../src/core/duty'
import { findOmsiInstall } from '../src/core/install'
import { describeLive, type LiveData } from '../src/core/live'
import { loadMap } from '../src/core/timetable'
import { formatTime } from '../src/shared/format'

const omsi = findOmsiInstall()
if (!omsi) throw new Error('Geen OMSI 2 gevonden.')

const folder = process.argv[2] || 'TH_Wald'
const map = loadMap(join(omsi, 'maps'), folder)
if (!map) throw new Error(`Kaart ${folder} niet gevonden.`)

const duty = generateDuty(map, buildNetwork(map), { targetMinutes: 90 })
if (!duty) throw new Error('Geen dienst gevonden.')
const leg = duty.legs[0]
console.log(
  `${folder}: lijn ${duty.lineFile}, omloop ${duty.tourNumber}, rit ${leg.tripFile} ` +
    `(${leg.stops.length} haltes, ${formatTime(leg.departure)} - ${formatTime(leg.arrival)})`
)

/** Een stand van de plugin met alles erop en eraan. */
function sample(nextStop: string, nextIndex: number, clockMinutes: number, delaySec: number): LiveData {
  return {
    alive: true,
    seen: 0x3fffff,
    seenStr: 8,
    strKind: 1,
    time: clockMinutes * 60,
    day: 1,
    month: 1,
    year: 2016,
    velocity: 30,
    passengers: 8,
    scheduleActive: 1,
    targetIndex: nextIndex,
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
      ok: 1,
      tile: 1,
      x: 0,
      y: 0,
      z: 0,
      qx: 0,
      qy: 0,
      qz: 0,
      qw: 1,
      schedActive: 1,
      line: 0,
      tour: 0,
      tourEntry: 0,
      trip: 0,
      // Met opzet het nummer uit OMSI's eigen lijst: dat past niet op de onze.
      nextIndex: nextIndex + 5,
      nextDist: 80,
      delay: delaySec,
      lineName: leg.lineFile,
      tourName: leg.tourNumber,
      tripName: leg.tripFile,
      nextStop
    }
  } as unknown as LiveData
}

const DELAY = 200
let previous = -1
let jumps = 0
let deltas = new Set<number>()

for (let index = 0; index < leg.stops.length; index++) {
  const when = (leg.stopTimes[index] ?? leg.departure) + DELAY / 60 - 0.2
  const status = describeLive(sample(leg.stops[index], index, when, DELAY), duty)
  const got = status.stopIndex
  const step = got === undefined ? '?' : got - previous
  if (got !== index) jumps++
  if (status.deltaSeconds !== undefined) deltas.add(status.deltaSeconds)
  console.log(
    `   ${String(index).padStart(2)} ${leg.stops[index].padEnd(30)} -> ` +
      `app zegt ${String(got).padStart(2)} (stap ${step}), verschil ${status.deltaSeconds}s`
  )
  previous = got ?? previous
}

console.log(
  `\nhaltes die niet kloppen: ${jumps} van ${leg.stops.length}; ` +
    `verschillende waarden voor het verschil: ${[...deltas].join(', ')}`
)

/*
 * En dan het vervelende geval: OMSI meldt een naam die in deze rit niet
 * voorkomt. Zijn nummer overnemen zou de teller laten verspringen -- dat telt in
 * zijn eigen lijst -- dus de klok hoort het over te nemen, dicht bij waar we
 * waren.
 */
console.log('\nals OMSI een onbekende halte meldt:')
let wild = 0
for (const index of [2, Math.floor(leg.stops.length / 2), leg.stops.length - 2]) {
  const when = (leg.stopTimes[index] ?? leg.departure) + DELAY / 60 - 0.2
  const status = describeLive(sample('Een halte die hier niet bestaat', index, when, DELAY), duty)
  const got = status.stopIndex ?? -1
  const off = Math.abs(got - index)
  if (off > 1) wild++
  console.log(
    `   bij halte ${index} (${formatTime(when)}) zegt de app ${got}` +
      `${off > 1 ? '  <-- te ver weg' : ''}`
  )
}

process.exit(jumps === 0 && deltas.size <= 1 && wild === 0 ? 0 : 1)
