/**
 * Biedt de app alleen bussen aan die je echt kunt rijden?
 *
 *   npx tsx scripts/probe-bussen.ts
 *
 * In de mappen van OMSI staat van alles met de extensie `.bus`: bussen, maar
 * ook aanhangers -- de achterbak van een gelede bus, met passagiers erin en
 * zonder stuur -- en voertuigen die alleen als verkeer bedoeld zijn. Wie er zo
 * eentje toegewezen krijgt, staat in het spel in iets wat niet rijdt.
 *
 * Deze proef kijkt wat de app aanbiedt en houdt het tegen het licht: geen
 * aanhangers, geen AI-voertuigen, en de bekende bussen moeten er nog in zitten.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { findOmsiInstall } from '../src/core/install'
import { listVehicles, vehicleName } from '../src/core/vehicles'

const omsi = findOmsiInstall()
if (!omsi) throw new Error('Geen OMSI 2 gevonden.')

const aangeboden = listVehicles(omsi)
const paden = new Set(aangeboden.map((v) => v.relativePath.toLowerCase()))

/** Alles wat er aan `.bus`-bestanden ligt, aangeboden of niet. */
const alle: string[] = []
const root = join(omsi, 'Vehicles')
for (const entry of readdirSync(root)) {
  const folder = join(root, entry)
  try {
    if (!statSync(folder).isDirectory()) continue
    for (const name of readdirSync(folder)) {
      if (name.toLowerCase().endsWith('.bus')) alle.push(join('Vehicles', entry, name))
    }
  } catch {
    // Een map die niet te lezen is, staat ook niet in het spel.
  }
}

const tekst = (pad: string): string => {
  try {
    return readFileSync(join(omsi, pad), 'latin1')
  } catch {
    return ''
  }
}

/*
 * Dezelfde regels als in `src/core/vehicles.ts`, hier nog een keer opgeschreven.
 * Dat is met opzet: een proef die de code zelf aanroept meet alleen of de code
 * met zichzelf overeenstemt.
 */
const AI_IN_FILE = /(^|[_\- ])(ai|ki)([_\-. ]|$)/i
const AI_IN_NAME = /\bKI[ -]?Version\b|nicht\s+.bernehmen|[ -](KI|AI)$/i

/** De bestandsnaam zonder map en zonder extensie. */
const stam = (pad: string): string => (pad.split(/[\\/]/).pop() ?? '').replace(/\.bus$/i, '')

/** Mag dit voertuig aan een chauffeur worden toegewezen? */
const bestuurbaar = (pad: string, naam: string): boolean => {
  const t = tekst(pad)
  if (!t.includes('[view_schedule]') || t.includes('[ai_veh_type]')) return false
  return !AI_IN_NAME.test(naam) && !AI_IN_FILE.test(stam(pad))
}

let ok = true
const eis = (naam: string, goed: boolean, erbij = ''): void => {
  if (!goed) ok = false
  console.log(`   ${goed ? 'ja ' : 'NEE'} ${naam.padEnd(46)} ${erbij}`)
}

console.log(`${alle.length} .bus-bestanden in de installatie, ${aangeboden.length} aangeboden\n`)

/* Geen enkel aangeboden voertuig mag een aanhanger of AI-verkeer zijn. */
const foute = aangeboden.filter((v) => !bestuurbaar(v.relativePath, vehicleName(v)))
eis('geen aanhangers of AI-voertuigen', foute.length === 0, `${foute.length} gevonden`)
for (const v of foute.slice(0, 5)) console.log(`        ${vehicleName(v)} (${v.relativePath})`)

/* En andersom: alles met een dienstregelingaanzicht hoort erbij te staan. */
const gemist = alle.filter((pad) => {
  if (paden.has(pad.toLowerCase())) return false
  const t = tekst(pad)
  if (!t.includes('[view_schedule]') || t.includes('[ai_veh_type]')) return false
  // De naam uit het bestand zelf, want de app heeft hem niet aangeboden.
  const regels = t.split(/\r?\n/).map((r) => r.trim().replace(/^\[+/, '['))
  const i = regels.indexOf('[friendlyname]')
  const naam = i >= 0 ? `${regels[i + 1] ?? ''} ${regels[i + 2] ?? ''}` : ''
  return bestuurbaar(pad, naam)
})
eis('niets bruikbaars overgeslagen', gemist.length === 0, `${gemist.length} gemist`)
for (const pad of gemist.slice(0, 5)) console.log(`        ${pad}`)

/*
 * En het geval waar het om begonnen is: een bus die in zijn naam al zegt dat hij
 * niet bedoeld is om te rijden, hoort er niet tussen te staan.
 */
const verdachteNamen = aangeboden.filter(
  (v) =>
    /(trailer|aanhanger)/i.test(vehicleName(v)) ||
    AI_IN_NAME.test(vehicleName(v)) ||
    AI_IN_FILE.test(stam(v.relativePath))
)
eis('geen namen die om AI of aanhanger schreeuwen', verdachteNamen.length === 0, `${verdachteNamen.length} gevonden`)
for (const v of verdachteNamen.slice(0, 5)) console.log(`        ${vehicleName(v)}`)

/* Er moet natuurlijk wel wat overblijven. */
const mappen = new Set(aangeboden.map((v) => v.folder))
eis('er blijven genoeg bussen over', aangeboden.length > 100, `${aangeboden.length} uit ${mappen.size} mappen`)

console.log(ok ? '\nalleen bussen die je kunt rijden' : '\nKLOPT NIET')
process.exit(ok ? 0 : 1)
