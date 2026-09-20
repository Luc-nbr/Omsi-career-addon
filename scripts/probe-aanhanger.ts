/**
 * Hangt de aanhanger van een gelede bus er ook echt achter?
 *
 *   npx tsx scripts/probe-aanhanger.ts "<pad naar OMSI 2>"
 *
 * Leest alleen uit de spelmap. Twee dingen:
 *
 * 1. Welke bussen dragen een `[couple_back]`, en op welke afstand komt de
 *    aanhanger dan te staan? Die afstand is de som van de twee koppelpunten.
 * 2. Klopt onze rekensom met wat OMSI zelf noteerde? In `Nur für
 *    Fortgeschrittene.osn` staat de GN92 met zijn aanhanger erachter, en het
 *    verschil tussen die twee posities hoort onze afstand te zijn.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { listVehicles } from '../src/core/vehicles'
import { trailerOf } from '../src/core/trailer'
import { buildSituation } from '../src/core/situation'

const omsi = process.argv[2]
if (!omsi || !existsSync(omsi)) {
  console.error('Geef het pad naar de OMSI 2-map.')
  process.exit(1)
}

const voertuigen = listVehicles(omsi)
const metAanhanger = voertuigen
  .map((v) => ({ v, trailer: trailerOf(omsi, v.relativePath) }))
  .filter((item) => item.trailer)

console.log(`${metAanhanger.length} van ${voertuigen.length} bussen hebben een aanhanger\n`)
for (const { v, trailer } of metAanhanger.slice(0, 12)) {
  console.log(
    `   ${trailer!.distance.toFixed(2).padStart(6)} m  ${v.manufacturer} ${v.type}`.padEnd(70) +
      trailer!.relativePath
  )
}
if (metAanhanger.length > 12) console.log(`   ... en nog ${metAanhanger.length - 12}`)

/* En de proef op de som: wat OMSI zelf noteerde. */
const eigen = join(omsi, 'Situations', 'Nur für Fortgeschrittene.osn')
if (!existsSync(eigen)) {
  console.log('\nDe situatie van OMSI zelf staat er niet; niets om tegen af te zetten.')
  process.exit(0)
}

const ruw = readFileSync(eigen)
const tekst = ruw[0] === 0xff && ruw[1] === 0xfe ? ruw.toString('utf16le') : ruw.toString('latin1')
const regels = tekst.split('\n').map((r) => r.replace(/\r$/, ''))
const plekken = regels
  .map((r, i) => (r.trim().toLowerCase() === '[vehicle]' ? i : -1))
  .filter((i) => i >= 0)

if (plekken.length < 2) {
  console.log('\nGeen twee voertuigen in dat bestand.')
  process.exit(0)
}

const lees = (at: number): { pad: string; x: number; z: number } => ({
  pad: regels[at + 1].trim(),
  x: Number(regels[at + 2]),
  z: Number(regels[at + 4])
})
const voor = lees(plekken[0])
const achter = lees(plekken[1])
const gemeten = Math.hypot(achter.x - voor.x, achter.z - voor.z)

const hoofd = voertuigen.find(
  (v) => v.relativePath.toLowerCase().replace(/\\/g, '/') === voor.pad.toLowerCase().replace(/\\/g, '/')
)
const onze = hoofd ? trailerOf(omsi, hoofd.relativePath) : undefined

console.log(`\nOMSI zette ${voor.pad}`)
console.log(`         en ${achter.pad}`)
console.log(`   op ${gemeten.toFixed(2)} m van elkaar.`)
if (!onze) {
  console.log('   Wij vinden voor die bus geen aanhanger -- dat klopt dus niet.')
} else {
  const verschil = onze.distance - gemeten
  console.log(`   Wij rekenen ${onze.distance.toFixed(2)} m; verschil ${verschil >= 0 ? '+' : ''}${verschil.toFixed(2)} m.`)
  console.log(Math.abs(verschil) < 0.15 ? '   Dat klopt.' : '   DAT KLOPT NIET.')
}

/*
 * En wat wij er zelf van maken: bouwt de schrijver werkelijk twee voertuigen?
 * Alleen in het geheugen; er wordt niets weggeschreven.
 */
const geleed = metAanhanger[0]
if (geleed) {
  const regels = buildSituation({
    mapFolder: 'Grundorf',
    name: 'proef',
    description: 'proef',
    year: 2020,
    dayOfYear: 100,
    minutes: 600,
    vehicle: {
      relativePath: geleed.v.relativePath,
      lineNumber: '76',
      terminus: 'Bauernhof',
      yard: 'Grundorf',
      trailer: geleed.trailer
    },
    spawn: { tx: 0, ty: 0, x: 150, z: 150, height: 10, heading: 0 }
  })
  const aantal = regels.filter((r) => r.trim() === '[vehicle]').length
  const gekoppeld = regels.some((r) => r.trim() === '[coupledwith]')
  console.log(`\nOnze situatie voor ${geleed.v.manufacturer} ${geleed.v.type}:`)
  console.log(`   ${aantal} voertuigen, [coupledwith] ${gekoppeld ? 'aanwezig' : 'ONTBREEKT'}`)
  console.log(aantal === 2 && gekoppeld ? '   Dat klopt.' : '   DAT KLOPT NIET.')
}
