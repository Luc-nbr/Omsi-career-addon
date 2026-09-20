/**
 * Wat kost het om een bus te kunnen tekenen?
 *
 *   npx tsx scripts/probe-busmodel.ts ["<pad naar OMSI 2>"]
 *
 * Leest van elke bestuurbare bus het model: hoeveel onderdelen, hoeveel
 * driehoeken, welke texturen en in welke formaten. Dat laatste bepaalt wat een
 * tekenaar moet kunnen: een .dds moet je zelf uitpakken, een .png geeft
 * Chromium je zo. Leest alleen.
 */
import { extname, join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { leesBusModel } from '../src/core/busmodel'
import { findOmsiInstall } from '../src/core/install'
import { leesO3d } from '../src/core/o3d'
import { listVehicles } from '../src/core/vehicles'

const omsi = process.argv[2] ?? findOmsiInstall()
if (!omsi) throw new Error('Geen OMSI 2 gevonden.')

const bussen = listVehicles(omsi)
console.log(`${bussen.length} bestuurbare bussen\n`)

const formaten = new Map<string, number>()
let metModel = 0
let zonderModel = 0
const zwaar: Array<{ naam: string; onderdelen: number; driehoeken: number; ms: number }> = []

for (const bus of bussen) {
  const pad = join(omsi, bus.relativePath)
  const begin = performance.now()
  const model = leesBusModel(pad)
  if (!model) {
    zonderModel++
    continue
  }
  metModel++
  let driehoeken = 0
  let gelezen = 0
  for (const deel of model.onderdelen) {
    if (!deel.pad) continue
    const mesh = leesO3d(deel.pad)
    if (!mesh) continue
    gelezen++
    driehoeken += mesh.triangles.length / 3
    for (const materiaal of deel.materialen) {
      const soort = extname(materiaal.textuur).toLowerCase() || '(geen)'
      formaten.set(soort, (formaten.get(soort) ?? 0) + 1)
    }
  }
  const ms = performance.now() - begin
  zwaar.push({ naam: bus.relativePath, onderdelen: gelezen, driehoeken, ms })
}

console.log(`bus met een model: ${metModel}, zonder: ${zonderModel}`)

zwaar.sort((a, b) => b.driehoeken - a.driehoeken)
const som = zwaar.reduce((a, b) => a + b.driehoeken, 0)
const tijd = zwaar.reduce((a, b) => a + b.ms, 0)
console.log(
  `gemiddeld ${Math.round(som / Math.max(1, zwaar.length)).toLocaleString('nl-NL')} driehoeken per bus, ` +
    `inlezen ${Math.round(tijd / Math.max(1, zwaar.length))} ms per bus\n`
)

console.log('DE ZWAARSTE BUSSEN')
for (const b of zwaar.slice(0, 5)) {
  console.log(
    `   ${b.driehoeken.toLocaleString('nl-NL').padStart(9)} driehoeken  ` +
      `${String(b.onderdelen).padStart(4)} onderdelen  ${b.ms.toFixed(0).padStart(5)} ms  ${b.naam}`
  )
}
console.log('\nDE LICHTSTE')
for (const b of zwaar.slice(-3)) {
  console.log(
    `   ${b.driehoeken.toLocaleString('nl-NL').padStart(9)} driehoeken  ` +
      `${String(b.onderdelen).padStart(4)} onderdelen  ${b.ms.toFixed(0).padStart(5)} ms  ${b.naam}`
  )
}

console.log('\nTEXTUREN, PER FORMAAT')
for (const [soort, aantal] of [...formaten].sort((a, b) => b[1] - a[1])) {
  console.log(`   ${soort.padEnd(8)} ${aantal}`)
}
