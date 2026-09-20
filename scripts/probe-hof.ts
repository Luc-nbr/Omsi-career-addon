/**
 * Wat levert het overzetten van wagenparken op, op een echte installatie?
 *
 *   npx tsx scripts/probe-hof.ts "<pad naar OMSI 2>" [kaart]
 *
 * Leest alleen. Per kaart: hoeveel bussen kennen de eindbestemmingen van de
 * dienstregeling nu, hoeveel zouden er na het overzetten bijkomen, en voor
 * hoeveel is er niets te vinden dat bij hun veldindeling past.
 *
 * Draai dit opnieuw als je aan `schemaFits` of `planHofs` komt: het getal dat
 * ertoe doet is niet "hoeveel bussen krijgen een bestand" maar "hoeveel bussen
 * kunnen daarna werkelijk rijden".
 */
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { planHofs, scanHofs, readSchema } from '../src/core/hofTool'
import { loadMap } from '../src/core/timetable'

const omsi = process.argv[2]
if (!omsi || !existsSync(omsi)) {
  console.error('Geef het pad naar de OMSI 2-map.')
  process.exit(1)
}

const only = process.argv[3]

const hofs = scanHofs(omsi)
const indelingen = new Map<string, number>()
for (const entry of hofs) {
  const sleutel = `${entry.schema.count}|${entry.schema.fields.join('|')}`
  indelingen.set(sleutel, (indelingen.get(sleutel) ?? 0) + 1)
}
console.log(`${hofs.length} wagenparken in ${new Set(hofs.map((h) => h.owner)).size} voertuigmappen`)
console.log(`${indelingen.size} verschillende veldindelingen\n`)

const kaarten = join(omsi, 'maps')
for (const kaart of readdirSync(kaarten)) {
  if (only && kaart !== only) continue
  let termini: string[]
  try {
    const map = loadMap(kaarten, kaart)
    if (!map) continue
    termini = [...new Set([...map.trips.values()].map((trip) => trip.terminus))].filter(Boolean)
  } catch {
    continue
  }
  if (termini.length === 0) {
    console.log(`${kaart.padEnd(30)} geen dienstregeling`)
    continue
  }

  const plan = planHofs(omsi, termini, hofs)
  /*
   * "Kent de kaart" is geen ja of nee. Een wagenpark van een andere stad deelt
   * zo een haltenaam met deze kaart; een bus die daarop een 1 scoort kent er
   * niets van. Wat telt is welk deel van de eindbestemmingen hij herkent.
   */
  const deel = (n: number): number => n / termini.length
  const goed = plan.filter((bus) => deel(bus.known) >= 0.5).length
  const wordtGoed = plan.filter(
    (bus) => deel(bus.known) < 0.5 && bus.offer && deel(bus.offer.matched) >= 0.5
  ).length
  const blijft = plan.length - goed - wordtGoed

  console.log(
    `${kaart.padEnd(30)} bestemmingen=${String(termini.length).padEnd(4)} ` +
      `kent>=50%: ${String(goed).padEnd(3)} wordt: ${String(wordtGoed).padEnd(3)} ` +
      `blijft niets: ${blijft}`
  )

  if (only) {
    for (const bus of plan) {
      const indeling = bus.schemas.map((s) => s.count).join('/') || 'onbekend'
      console.log(
        `   ${bus.folder.padEnd(36)} ${indeling.padEnd(12)} ` +
          `heeft=${String(bus.known).padEnd(3)} ${(bus.knownFile ?? '-').padEnd(28)}` +
          (bus.offer ? `   -> ${bus.offer.file} (${bus.offer.matched})` : '')
      )
    }
  }
}

if (only) {
  // Steekproef: klopt de indeling die we van een bestand lezen met wat erin staat?
  const voorbeeld = hofs[0]
  if (voorbeeld) {
    const schema = readSchema(voorbeeld.path)
    console.log(`\nSteekproef ${voorbeeld.owner}/${voorbeeld.file}: ${schema.count} velden`)
    schema.fields.forEach((veld, i) => console.log(`   ${i}: ${veld}`))
  }
}
