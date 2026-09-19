/**
 * Klopt het ingekorte routenummer?
 *
 *   npx tsx scripts/probe-routecode.ts "<pad naar OMSI 2>" [kaart]
 *
 * Leest alleen. Stelt een dienst samen, bouwt er het IBIS-plan bij en zet per
 * rit het lijnnummer, de volle routecode en de ingekorte naast elkaar. Lijn 135
 * met route 13502 hoort 02 te worden; een route die niet met het lijnnummer
 * begint hoort te blijven staan zoals hij is.
 */
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { buildNetwork, generateDuty } from '../src/core/duty'
import { buildFleetIndex, pickVehicleForDuty, readMapDepot, readMapFleet } from '../src/core/fleet'
import { buildIbisPlan } from '../src/core/ibis'
import { loadMap } from '../src/core/timetable'

const omsi = process.argv[2]
if (!omsi || !existsSync(omsi)) {
  console.error('Geef het pad naar de OMSI 2-map.')
  process.exit(1)
}

const kaarten = join(omsi, 'maps')
const index = buildFleetIndex(omsi)
const only = process.argv[3]

let gekort = 0
let gelijk = 0

for (const kaart of readdirSync(kaarten)) {
  if (only && kaart !== only) continue
  const map = loadMap(kaarten, kaart)
  if (!map) continue
  let duty
  try {
    duty = generateDuty(map, buildNetwork(map), { targetMinutes: 120 })
  } catch {
    continue
  }
  if (!duty) continue

  const keuze = pickVehicleForDuty(
    index,
    duty,
    2020,
    readMapFleet(join(kaarten, kaart)),
    Math.random,
    readMapDepot(join(kaarten, kaart))
  )
  if (!keuze) {
    console.log(`${kaart.padEnd(26)} geen bus die deze dienst kent`)
    continue
  }

  const plan = buildIbisPlan(omsi, keuze.vehicle.relativePath, duty, 2020, keuze.yard)
  const metRoute = plan.legs.filter((leg) => leg.route)
  if (metRoute.length === 0) {
    console.log(`${kaart.padEnd(26)} wagenpark ${plan.yard ?? '-'} kent geen routes`)
    continue
  }

  console.log(`${kaart}  (lijn ${plan.line}, wagenpark ${plan.yard ?? '-'})`)
  for (const leg of metRoute.slice(0, 5)) {
    const korter = leg.routeShort !== leg.route
    if (korter) gekort++
    else gelijk++
    console.log(
      `   lijn ${String(leg.lineNumber).padEnd(6)} route ${String(leg.route).padEnd(8)} ` +
        `-> ${String(leg.routeShort).padEnd(8)} ${korter ? 'ingekort' : 'onveranderd'}`
    )
  }
}

console.log(`\n${gekort} ingekort, ${gelijk} onveranderd gelaten.`)
