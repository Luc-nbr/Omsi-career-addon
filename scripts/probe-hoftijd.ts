/**
 * Wat kost het opzoeken van wagenparken, en wie betaalt dat?
 *
 *   npx tsx scripts/probe-hoftijd.ts "<pad naar OMSI 2>"
 *
 * scanHofs leest elke .hof van de hele installatie. In de app gebeurt dat in
 * het hoofdproces, waar niets anders kan gebeuren zolang het loopt: het venster
 * tekent niet, de overlay beweegt niet, een klik wacht. Dit meet hoe lang dat
 * duurt, koud en warm, en hoe vaak de app het achter elkaar doet.
 */
import { existsSync } from 'node:fs'
import { scanHofs, planHofs } from '../src/core/hofTool'

const omsi = process.argv[2]
if (!omsi || !existsSync(omsi)) {
  console.error('Geef het pad naar de OMSI 2-map.')
  process.exit(1)
}

for (const ronde of [1, 2, 3]) {
  const t0 = performance.now()
  const hofs = scanHofs(omsi)
  const t1 = performance.now()
  console.log(
    `ronde ${ronde}: scanHofs ${hofs.length} bestanden in ${(t1 - t0).toFixed(0)} ms`
  )
}

// En wat planHofs erbovenop doet voor een stel eindbestemmingen.
const termini = ['Hauptbahnhof', 'Rathaus', 'Betriebshof']
const t2 = performance.now()
const plan = planHofs(omsi, termini)
console.log(`planHofs: ${plan.length} bussen in ${(performance.now() - t2).toFixed(0)} ms`)
