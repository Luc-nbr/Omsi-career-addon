/**
 * Welke kaartjes horen bij welke kaart, en klopt het wisselgeld?
 *
 *   npx tsx scripts/probe-kaartjes.ts "<pad naar OMSI 2>"
 *
 * Leest alleen. Twee dingen worden nagerekend.
 *
 * Ten eerste: van elke geïnstalleerde kaart of er een kaartset bij hoort, en wat
 * daar dan in zit. Een kaart die er geen aanwijst is niet stuk -- daar wordt geen
 * kaartje verkocht -- maar het verschil tussen "geen set" en "set niet te lezen"
 * moet wel te zien zijn.
 *
 * Ten tweede het wisselgeld. Dat lijkt te simpel om na te rekenen tot je het met
 * kommagetallen doet: 0,1 + 0,2 is in drijvende komma 0,30000000000000004, en
 * dan komt er een cent te veel of te weinig uit. Daarom centen, en daarom deze
 * proef over elk bedrag tot twintig euro.
 */
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { alleKaartsets, kaartjesVoor, leesKaartset } from '../src/core/kaartjes'
import { wisselgeld, type Muntje } from '../src/shared/kaartjes'

const omsi = process.argv[2]
if (!omsi || !existsSync(omsi)) {
  console.error('Geef het pad naar de OMSI 2-map.')
  process.exit(1)
}

const euro = (cent: number): string => (cent / 100).toFixed(2)

console.log('=== per kaart ===')
const mapsDir = join(omsi, 'maps')
for (const kaart of readdirSync(mapsDir)) {
  if (!existsSync(join(mapsDir, kaart, 'global.cfg'))) continue
  const set = kaartjesVoor(omsi, kaart)
  if (!set) {
    console.log(`${kaart.padEnd(26)} geen kaartset`)
    continue
  }
  const prijzen = set.kaartjes.map((k) => k.prijs)
  console.log(
    `${kaart.padEnd(26)} ${set.naam.padEnd(18)} ${String(set.kaartjes.length).padStart(2)} kaartjes` +
      `  ${Math.min(...prijzen).toFixed(2)} tot ${Math.max(...prijzen).toFixed(2)}` +
      (set.koopkans !== undefined ? `  koopkans ${(set.koopkans * 100).toFixed(0)}%` : '')
  )
}

console.log('\n=== alle sets die er staan ===')
for (const bestand of alleKaartsets(omsi)) {
  const set = leesKaartset(bestand)
  if (!set) {
    console.log(`${bestand}  NIET TE LEZEN`)
    continue
  }
  console.log(`${set.naam} (${set.kaartjes.length})`)
  for (const k of set.kaartjes) {
    console.log(
      `   ${k.prijs.toFixed(2).padStart(6)}  ${k.naam.padEnd(34)}` +
        `  ${k.maxHaltes > 0 ? `max ${k.maxHaltes} haltes` : 'onbeperkt'}` +
        `  ${k.leeftijdVan}-${k.leeftijdTot} jaar` +
        (k.dagkaart ? '  dagkaart' : '')
    )
  }
}

console.log('\n=== wisselgeld ===')
let fout = 0
for (let cent = 0; cent <= 2000; cent++) {
  const munten = wisselgeld(cent)
  const som = munten.reduce((t: number, m: Muntje) => t + m.cent * m.aantal, 0)
  if (som !== cent) {
    fout++
    if (fout <= 3) console.log(`  ${euro(cent)} -> telt op tot ${euro(som)}`)
  }
}
console.log(fout === 0 ? '  elk bedrag tot 20,00 telt precies op' : `  ${fout} bedragen kloppen niet`)

/* En een paar voorbeelden zoals ze op het scherm komen te staan. */
console.log('\n=== hoe het eruitziet ===')
for (const [prijs, gegeven] of [
  [270, 500],
  [170, 200],
  [900, 2000],
  [120, 1000]
]) {
  const munten = wisselgeld(gegeven - prijs)
  console.log(
    `  kaartje ${euro(prijs)}, krijgt ${euro(gegeven)} -> terug ${euro(gegeven - prijs)}: ` +
      munten.map((m: Muntje) => `${m.aantal}x ${euro(m.cent)}`).join(', ')
  )
}

process.exit(fout === 0 ? 0 : 1)
