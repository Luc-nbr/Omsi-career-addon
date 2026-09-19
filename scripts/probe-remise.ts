/**
 * Wat staat er in de remise van een kaart, en kiest de app daaruit?
 *
 *   npx tsx scripts/probe-remise.ts "<pad naar OMSI 2>" [kaart]
 *
 * Leest alleen. Per kaart de bussen die `ailists.cfg` in zijn eigen remise zet,
 * met hoeveel wagens ervan -- dat is het antwoord op "welke bus komt hier het
 * meest voor", en het busbestand erbij is precies de uitvoering met de goede
 * kleurstelling, want de maker van de kaart heeft die zelf aangewezen.
 *
 * Met een kaartnaam erachter loot hij ook honderd keer een bus voor een echte
 * dienst, zodat te zien is dat de gewoonste bus wint zonder de rest uit te
 * sluiten.
 */
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { buildFleetIndex, pickVehicleForDuty, readMapDepot, readMapFleet } from '../src/core/fleet'
import { buildNetwork, generateDuty } from '../src/core/duty'
import { loadMap } from '../src/core/timetable'

const omsi = process.argv[2]
if (!omsi || !existsSync(omsi)) {
  console.error('Geef het pad naar de OMSI 2-map.')
  process.exit(1)
}
const only = process.argv[3]

const kaarten = join(omsi, 'maps')
for (const kaart of readdirSync(kaarten)) {
  if (only && kaart !== only) continue
  const depot = readMapDepot(join(kaarten, kaart))
  if (depot.size === 0) {
    console.log(`${kaart.padEnd(30)} geen remise in ailists.cfg`)
    continue
  }
  const opVolgorde = [...depot.entries()].sort((a, b) => b[1] - a[1])
  const totaal = opVolgorde.reduce((som, [, n]) => som + n, 0)
  console.log(`${kaart.padEnd(30)} ${depot.size} bustypen, ${totaal} wagens`)
  for (const [pad, wagens] of opVolgorde.slice(0, only ? 20 : 3)) {
    console.log(`   ${String(wagens).padStart(3)} x ${pad}`)
  }
}

if (!only) process.exit(0)

// En dan de keuze zelf: honderd keer loten voor dezelfde dienst.
const map = loadMap(kaarten, only)
if (!map) {
  console.error(`${only} kon niet gelezen worden.`)
  process.exit(1)
}
const net = buildNetwork(map)
const duty = generateDuty(map, net, { targetMinutes: 120 })
if (!duty) {
  console.error('Geen dienst kunnen samenstellen om mee te toetsen.')
  process.exit(1)
}

const index = buildFleetIndex(omsi)
const vloot = readMapFleet(join(kaarten, only))
const depot = readMapDepot(join(kaarten, only))

const tel = new Map<string, number>()
for (let i = 0; i < 100; i++) {
  const keuze = pickVehicleForDuty(index, duty, 2020, vloot, Math.random, depot)
  if (!keuze) continue
  const naam = `${keuze.vehicle.manufacturer} ${keuze.vehicle.type}`.trim()
  tel.set(naam, (tel.get(naam) ?? 0) + 1)
}

console.log(`\nDienst ${duty.lineNumbers.join('/')} met ${duty.legs.length} ritten; 100 keer geloot:`)
for (const [naam, aantal] of [...tel.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`   ${String(aantal).padStart(3)} x ${naam}`)
}
