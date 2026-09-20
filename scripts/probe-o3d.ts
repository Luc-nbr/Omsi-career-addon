/**
 * Kan de lezer alle 3D-modellen van deze installatie aan, en wat kost dat?
 *
 *   npx tsx scripts/probe-o3d.ts ["<pad naar OMSI 2>"]
 *
 * OMSI tekent zijn bussen in het keuzescherm live uit de .o3d-bestanden. Wil de
 * app tegels met bussen tonen, dan moet `core/o3d.ts` die bestanden aankunnen --
 * allemaal, ook de addons van derden, en zonder om te vallen op het ene kapotte
 * bestand dat er altijd tussen zit. Deze probe loopt de hele installatie langs,
 * telt wat er lukt en wat niet met de reden erbij, en meet hoe lang een bus
 * kost.
 *
 * De proef op de som zit erbij: een lezer die netjes op de laatste byte uitkomt
 * kan nog steeds onzin teruggeven. Daarom wordt ook geteld of elke driehoek naar
 * een hoekpunt wijst dat bestaat en of elke normaal lengte één heeft -- dat
 * laatste is de controle op de veldindeling van een hoekpunt, want zou de uv
 * ergens anders staan dan klopt die lengte niet.
 *
 * Er wordt alleen gelezen. In de spelmap wordt niets geschreven.
 */
import { readdirSync, readFileSync, statSync, type Dirent } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { findOmsiInstall } from '../src/core/install'
import { ontleedO3d, type O3dKlacht } from '../src/core/o3d'

const omsi = findOmsiInstall(process.argv[2])
if (!omsi) {
  console.error('Geen OMSI 2-installatie gevonden. Geef het pad als argument mee.')
  process.exit(1)
}
const wortel: string = omsi
console.log(`OMSI: ${wortel}`)

/** Alle .o3d onder een map. */
function* loop(map: string): Generator<string> {
  let inhoud: Dirent[]
  try {
    inhoud = readdirSync(map, { withFileTypes: true })
  } catch {
    // Een map waar we niet in mogen kijken hoort de meting niet te stoppen.
    return
  }
  for (const item of inhoud) {
    const pad = join(map, item.name)
    if (item.isDirectory()) yield* loop(pad)
    else if (item.name.toLowerCase().endsWith('.o3d')) yield pad
  }
}

interface Uitslag {
  pad: string
  bytes: number
  versie?: number
  hoekpunten: number
  driehoeken: number
  klacht?: O3dKlacht
  detail?: string
}

const bestanden = [...loop(wortel)]
console.log(`${bestanden.length} .o3d-bestanden gevonden\n`)

const uitslagen: Uitslag[] = []
const perVersie = new Map<number, number>()
const texturen = new Map<string, number>()
let zonderTextuur = 0
let losseIndex = 0
let materiaalBuitenBereik = 0
let normaalGoed = 0
let normaalTotaal = 0
let beenderenBestanden = 0
let bytesTotaal = 0
let ontleedMs = 0

for (const pad of bestanden) {
  let bytes: Buffer
  try {
    bytes = readFileSync(pad)
  } catch (fout) {
    uitslagen.push({
      pad,
      bytes: 0,
      hoekpunten: 0,
      driehoeken: 0,
      klacht: 'onleesbaar',
      detail: (fout as Error).message
    })
    continue
  }
  bytesTotaal += bytes.length

  const t0 = performance.now()
  const lezing = ontleedO3d(bytes)
  ontleedMs += performance.now() - t0

  const model = lezing.model
  uitslagen.push({
    pad,
    bytes: bytes.length,
    versie: model?.versie,
    hoekpunten: model ? model.vertices.length / 3 : 0,
    driehoeken: model ? model.triangles.length / 3 : 0,
    klacht: lezing.klacht,
    detail: lezing.detail
  })
  if (!model) continue

  if (!lezing.klacht) perVersie.set(model.versie, (perVersie.get(model.versie) ?? 0) + 1)
  if (model.beenderen) beenderenBestanden++

  const n = model.vertices.length / 3
  for (const i of model.triangles) if (i >= n) losseIndex++
  for (const m of model.materiaalPerDriehoek) if (m >= model.materialen.length) materiaalBuitenBereik++
  for (let i = 0; i < n; i++) {
    const lengte = Math.hypot(model.normals[i * 3], model.normals[i * 3 + 1], model.normals[i * 3 + 2])
    normaalTotaal++
    if (Math.abs(lengte - 1) < 0.01) normaalGoed++
  }
  for (const materiaal of model.materialen) {
    if (!materiaal.textuur) {
      zonderTextuur++
      continue
    }
    const punt = materiaal.textuur.lastIndexOf('.')
    const ext = punt < 0 ? '(zonder extensie)' : materiaal.textuur.slice(punt).toLowerCase()
    texturen.set(ext, (texturen.get(ext) ?? 0) + 1)
  }
}

// ---------------------------------------------------------------- de uitkomst

const volledig = uitslagen.filter((u) => !u.klacht)
const halfweg = uitslagen.filter((u) => u.klacht && u.driehoeken > 0)
const niets = uitslagen.filter((u) => u.klacht && u.driehoeken === 0)
const percentage = (aantal: number): string => ((100 * aantal) / uitslagen.length).toFixed(3) + '%'

console.log('UITKOMST')
console.log(`  helemaal gelezen  : ${volledig.length} (${percentage(volledig.length)})`)
console.log(`  meetkunde gered   : ${halfweg.length} (${percentage(halfweg.length)})`)
console.log(`  niets uit gekregen: ${niets.length} (${percentage(niets.length)})`)
console.log(
  `  bruikbaar model   : ${volledig.length + halfweg.length}` +
    ` (${percentage(volledig.length + halfweg.length)})`
)

console.log('\nVERSIES (van de bestanden die helemaal uitkomen)')
for (const [versie, aantal] of [...perVersie.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  versie ${versie}: ${aantal}`)
}
console.log(`  met beenderenblok: ${beenderenBestanden}`)

// ---------------------------------------------------------------- wat mislukt

const perKlacht = new Map<O3dKlacht, Uitslag[]>()
for (const u of uitslagen) {
  if (!u.klacht) continue
  const lijst = perKlacht.get(u.klacht) ?? []
  lijst.push(u)
  perKlacht.set(u.klacht, lijst)
}
console.log('\nWAT NIET LUKT')
if (perKlacht.size === 0) console.log('  niets')
for (const [klacht, lijst] of [...perKlacht.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${klacht}: ${lijst.length}`)
  for (const u of lijst.slice(0, 8)) {
    const gered = u.driehoeken > 0 ? ` [meetkunde gered: ${u.driehoeken} driehoeken]` : ''
    console.log(`     ${relative(wortel, u.pad)} (${u.bytes} bytes) — ${u.detail}${gered}`)
  }
  if (lijst.length > 8) console.log(`     ... en nog ${lijst.length - 8}`)
}

// ---------------------------------------------------------------- de proef

console.log('\nPROEF OP DE SOM')
console.log(`  driehoeken die naar een hoekpunt wijzen dat er niet is: ${losseIndex}`)
console.log(
  `  normalen met lengte 1: ${normaalGoed.toLocaleString('nl-NL')} van` +
    ` ${normaalTotaal.toLocaleString('nl-NL')} (${((100 * normaalGoed) / normaalTotaal).toFixed(2)}%)`
)
console.log(`  driehoeken met een materiaalnummer dat er niet is: ${materiaalBuitenBereik}`)
console.log(`  materialen zonder textuur: ${zonderTextuur}`)
for (const [ext, aantal] of [...texturen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
  console.log(`  textuur ${ext}: ${aantal}`)
}

// ---------------------------------------------------------------- de tijd

console.log('\nTIJD')
console.log(
  `  ontleden van alles: ${(ontleedMs / 1000).toFixed(2)} s voor` +
    ` ${(bytesTotaal / 1024 / 1024).toFixed(0)} MB` +
    ` (${(bytesTotaal / 1024 / 1024 / (ontleedMs / 1000)).toFixed(0)} MB/s)`
)

/** Hoeveel kost één bus? Alles onder `Vehicles\<map>` bij elkaar. */
function busTijd(map: string): void {
  const pad = join(wortel, 'Vehicles', map)
  try {
    if (!statSync(pad).isDirectory()) return
  } catch {
    return
  }
  const paden = [...loop(pad)]
  const bytes = paden.map((p) => readFileSync(p))
  // Eerst een ronde voor de opwarming; we meten het ontleden, niet de leeskop.
  for (const b of bytes) ontleedO3d(b)

  const t0 = performance.now()
  let driehoeken = 0
  for (const b of bytes) {
    const model = ontleedO3d(b).model
    if (model) driehoeken += model.triangles.length / 3
  }
  const ms = performance.now() - t0
  const mb = bytes.reduce((som, b) => som + b.length, 0) / 1024 / 1024
  console.log(
    `  Vehicles\\${map}: ${paden.length} bestanden, ${mb.toFixed(1)} MB,` +
      ` ${driehoeken.toLocaleString('nl-NL')} driehoeken in ${ms.toFixed(0)} ms`
  )
}
for (const bus of ['MAN_SD200', 'MAN_NL_NG_263', 'HC_C2_parked']) busTijd(bus)

// ---------------------------------------------------------------- de zwaarste

console.log('\nDE ZWAARSTE MODELLEN')
for (const u of [...volledig].sort((a, b) => b.driehoeken - a.driehoeken).slice(0, 10)) {
  console.log(
    `  ${u.driehoeken.toLocaleString('nl-NL').padStart(9)} driehoeken` +
      ` ${u.hoekpunten.toLocaleString('nl-NL').padStart(9)} hoekpunten` +
      ` ${(u.bytes / 1024 / 1024).toFixed(1).padStart(5)} MB  ${relative(wortel, u.pad)}`
  )
}

// ---------------------------------------------------------------- de maat

/*
 * De maat van een bus. Als x de breedte is, y de hoogte en z de lengte, dan moet
 * de carrosserie hier als een bus uitkomen en niet als een doos van elf meter
 * hoog. Dit is de enige controle die we op de asvolgorde hebben.
 *
 * Het moet wel de romp zijn en niet de hele voertuigmap: losse onderdelen --
 * spiegels, ruitenwissers, wijzerplaten -- staan in hun eigen nulpunt en worden
 * door `model.cfg` op hun plek gezet, dus over de hele map heen zegt een
 * omhullende doos niets. Over `MAN_SD200` als geheel komt er 7,14 bij 6,91 bij
 * 11,63 m uit; over de romp eronder een bus.
 */
function busMaat(map: string): void {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  let delen = 0
  for (const bestand of loop(join(wortel, map))) {
    let model
    try {
      model = ontleedO3d(readFileSync(bestand)).model
    } catch {
      continue
    }
    if (!model) continue
    delen++
    for (let i = 0; i < model.vertices.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        const waarde = model.vertices[i + k]
        if (waarde < min[k]) min[k] = waarde
        if (waarde > max[k]) max[k] = waarde
      }
    }
  }
  if (!delen) return
  const maat = (k: number): string => (max[k] - min[k]).toFixed(2)
  console.log(`  ${map}: breed ${maat(0)} m, hoog ${maat(1)} m, lang ${maat(2)} m (${delen} delen)`)
}
console.log('\nDE MAAT VAN EEN BUS (x breed, y hoog, z lang)')
for (const bus of ['MAN_SD200', 'MAN_NL_NG_263']) busMaat(bus)

// ---------------------------------------------------------------- waar ze staan

const perTak = new Map<string, number>()
for (const u of uitslagen) {
  const tak = relative(wortel, u.pad).split(sep)[0]
  perTak.set(tak, (perTak.get(tak) ?? 0) + 1)
}
console.log('\nWAAR DE MODELLEN STAAN')
for (const [tak, aantal] of [...perTak.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${tak}: ${aantal}`)
}
