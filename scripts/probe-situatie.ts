/**
 * Wat schrijven wij in een situatiebestand, en wat schrijft OMSI zelf?
 *
 *   npx tsx scripts/probe-situatie.ts "<pad naar OMSI 2>" [kaart]
 *
 * Leest alleen uit de spelmap en schrijft zijn eigen situatie naar een tijdelijke
 * map. Legt de blokken van ons bestand naast die van het `laststn.osn` dat OMSI
 * zelf heeft achtergelaten: wat wij missen of te veel hebben, is de eerste plek
 * om te kijken als een situatie niet goed inlaadt.
 *
 * Kijkt ook het wagenpark na op voertuigen die geen chauffeur horen te krijgen:
 * aanhangers van gelede bussen en uitgeklede AI-versies. Een halve gelede bus in
 * het spel betekent dat er een aanhanger als bestuurbaar voertuig is doorgelaten.
 */
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, extname, join } from 'node:path'
import { listVehicles } from '../src/core/vehicles'
import { readOmsiLines } from '../src/core/omsiFile'

const omsi = process.argv[2]
if (!omsi || !existsSync(omsi)) {
  console.error('Geef het pad naar de OMSI 2-map.')
  process.exit(1)
}

function lees(pad: string): string[] {
  const ruw = readFileSync(pad)
  const tekst =
    ruw[0] === 0xff && ruw[1] === 0xfe ? ruw.toString('utf16le') : ruw.toString('latin1')
  return tekst.split('\n').map((r) => r.replace(/\r$/, ''))
}

function blokken(regels: string[]): string[] {
  const uit: string[] = []
  for (const regel of regels) {
    const kaal = regel.trim()
    if (kaal.startsWith('[') && kaal.endsWith(']') && !uit.includes(kaal)) uit.push(kaal)
  }
  return uit
}

console.log('=== wat OMSI zelf achterlaat ===')
const kaarten = join(omsi, 'maps')
const vanOmsi = new Map<string, string[]>()
for (const kaart of readdirSync(kaarten)) {
  const pad = join(kaarten, kaart, 'laststn.osn')
  if (!existsSync(pad)) continue
  const b = blokken(lees(pad))
  vanOmsi.set(kaart, b)
  console.log(`${kaart.padEnd(26)} ${b.join(' ')}`)
}

/*
 * Voertuigen die geen chauffeur horen te krijgen.
 *
 * Een aanhanger draagt geen dienstregelingaanzicht, dus die hoort al af te
 * vallen -- maar niet elke maker houdt zich daaraan, en dan krijg je een halve
 * gelede bus. Hetzelfde voor AI-versies: uitgeklede bussen zonder cockpit.
 */
console.log('\n=== verdachte voertuigen in de lijst ===')
const VERDACHT = [
  { naam: 'aanhanger', test: (f: string) => /(^|[_\- ])(trail|trailer|anhaenger|anhanger|nachlaeufer)([_\-. ]|$)/i.test(f) },
  { naam: 'AI-versie', test: (f: string) => /(^|[_\- ])(ai|ki)([_\-. ]|$)/i.test(f) },
  { naam: 'geparkeerd', test: (f: string) => /(^|[_\- ])parked([_\-. ]|$)/i.test(f) }
]

const voertuigen = listVehicles(omsi)
console.log(`${voertuigen.length} bestuurbare voertuigen`)
let gevonden = 0
for (const v of voertuigen) {
  const bestand = basename(v.relativePath, extname(v.relativePath))
  for (const soort of VERDACHT) {
    if (!soort.test(bestand)) continue
    gevonden++
    console.log(`   ${soort.naam.padEnd(11)} ${v.relativePath}   "${v.manufacturer} ${v.type}"`)
    break
  }
}
if (gevonden === 0) console.log('   geen')

/*
 * En de bussen die een aanhanger nodig hebben: draagt hun bestand een
 * koppeling? Zo ja, dan hoort OMSI die er zelf bij te zetten -- staat het er
 * niet, dan rijdt de bus als halve geleding rond.
 */
console.log('\n=== gelede bussen: koppeling in het bestand? ===')
let metKoppeling = 0
let zonder = 0
for (const v of voertuigen) {
  const bestand = basename(v.relativePath, extname(v.relativePath))
  const lijktGeleed = /(^|[_\- ])(gn|sg|g|gelenk|artic)([_\-. ]|$)/i.test(bestand) || /gelenk/i.test(v.type)
  if (!lijktGeleed) continue
  let regels: string[]
  try {
    regels = readOmsiLines(join(omsi, v.relativePath))
  } catch {
    continue
  }
  const koppel = regels.findIndex((r) => /^\[(trailer|hasTrailer|anhaenger)\]/i.test(r.trim()))
  if (koppel >= 0) {
    metKoppeling++
    if (metKoppeling <= 5) {
      console.log(`   koppeling  ${v.relativePath} -> ${regels[koppel + 1]?.trim()}`)
    }
  } else {
    zonder++
    if (zonder <= 8) console.log(`   GEEN       ${v.relativePath}   "${v.manufacturer} ${v.type}"`)
  }
}
console.log(`   ${metKoppeling} met koppeling, ${zonder} zonder`)

const tmp = mkdtempSync(join(tmpdir(), 'omsi-situatie-'))
console.log(`\n(tijdelijke map: ${tmp})`)
