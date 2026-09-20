/**
 * Hoe zwaar is een overlaybeeld?
 *
 *   npx tsx scripts/probe-framegrootte.ts "<pad naar OMSI 2>" [kaart]
 *
 * `pushFrame` zet tien keer per seconde een beeld klaar, vergelijkt het met het
 * vorige via JSON.stringify en stuurt het hele ding door de IPC naar de overlay.
 * In dat beeld zit ook de dienst -- alle ritten met al hun haltes -- en die
 * verandert tijdens het rijden niet. Dit meet wat daarvan de prijs is.
 *
 * UITKOMST: niets om aan te komen. Een dienst van vier ritten en 124 haltes is
 * 5,1 kB en het wegen kost 0,01 ms per beeld -- een tiende milliseconde per
 * seconde. Het vaste deel apart sturen zou dus niets opleveren. Deze probe staat
 * er om dat vast te houden: wie haperingen zoekt hoeft hier niet te kijken.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { loadMap } from '../src/core/timetable'
import { buildNetwork, generateDuty } from '../src/core/duty'

const omsi = process.argv[2]
if (!omsi || !existsSync(omsi)) {
  console.error('Geef het pad naar de OMSI 2-map.')
  process.exit(1)
}
const kaart = process.argv[3] ?? 'Berlin-Spandau'

const map = loadMap(join(omsi, 'maps'), kaart)
if (!map) {
  console.error('Kaart niet gevonden: ' + kaart)
  process.exit(1)
}
const net = buildNetwork(map)
const duty = generateDuty(map, net, { targetMinutes: 240 })
if (!duty) {
  console.error('Geen dienst kunnen maken op ' + kaart)
  process.exit(1)
}
const vast = JSON.stringify({ duty })
const bewegend = JSON.stringify({
  connected: true,
  status: { clockMinutes: 500, deltaSeconds: 30, legIndex: 1, stopIndex: 4, speedKmh: 42 },
  vehicle: { x: 100, z: 200, heading: 90 },
  editing: false
})

console.log(`kaart ${kaart}, ${duty.legs.length} ritten, ${duty.totalStops} haltes`)
console.log(`vast deel (alleen de dienst): ${(vast.length / 1024).toFixed(1)} kB`)
console.log(`bewegend deel:             ${(bewegend.length / 1024).toFixed(1)} kB`)

// Wat het kost om dat vaste deel tien keer per seconde opnieuw te wegen.
const heel = { duty, status: {}, vehicle: {}, connected: true, editing: false }
const t0 = performance.now()
for (let i = 0; i < 100; i++) JSON.stringify(heel)
const perBeeld = (performance.now() - t0) / 100
console.log(`JSON.stringify van een heel beeld: ${perBeeld.toFixed(2)} ms`)
console.log(`bij tien beelden per seconde: ${(perBeeld * 10).toFixed(1)} ms/s aan alleen wegen`)
