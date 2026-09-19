/**
 * Zetten wij de bus op de goede hoogte neer?
 *
 *   npx tsx scripts/probe-spawnhoogte.ts "<pad naar OMSI 2>"
 *
 * Leest alleen. OMSI noteert in zijn eigen `laststn.osn` waar de bus stond --
 * tegel, plek op die tegel en hoogte. Die plek voeren we aan onze eigen
 * `terrainHeight` en we leggen de uitkomsten naast elkaar.
 *
 * Waarom dit ertoe doet: een bus die te hoog begint valt, en een gelede bus die
 * valt kan zijn aanhanger verliezen -- dan zie je een halve bus. Een bus die te
 * laag begint staat in de grond. Beide zien er precies zo uit als wat de
 * gebruiker meldde, dus deze meting sluit het uit of wijst het aan.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { terrainHeight } from '../src/core/terrain'
import { readTileGrid } from '../src/core/geo'

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

function blok(regels: string[], naam: string, hoeveel: number): string[] | undefined {
  const i = regels.findIndex((r) => r.trim().toLowerCase() === naam.toLowerCase())
  if (i < 0) return undefined
  return Array.from({ length: hoeveel }, (_, n) => (regels[i + 1 + n] ?? '').trim())
}

const kaarten = join(omsi, 'maps')
let gemeten = 0
let mis = 0

for (const kaart of readdirSync(kaarten)) {
  const mapPath = join(kaarten, kaart)
  // Alleen wat OMSI zelf heeft achtergelaten; ons eigen bestand bewijst niets.
  for (const naam of ['laststn.osn.voor-omsi-enhancer', 'laststn.osn.voor-omsi-career']) {
    const pad = join(mapPath, naam)
    if (!existsSync(pad)) continue
    const regels = lees(pad)
    const v = blok(regels, '[vehicle]', 14)
    if (!v || !v[0]) {
      console.log(`${kaart.padEnd(26)} geen voertuig in het bestand`)
      continue
    }
    const x = Number(v[1])
    const hOmsi = Number(v[2])
    const z = Number(v[3])
    const tx = Number(v[11])
    const ty = Number(v[12])
    if (![x, hOmsi, z, tx, ty].every(Number.isFinite)) continue

    let tegelmaat = 300
    try {
      const grid = readTileGrid(mapPath)
      if (grid) tegelmaat = grid.size(ty)
    } catch {
      // Zonder raster de gewone maat van 300 m.
    }

    const hOns = terrainHeight(mapPath, tx, ty, x, z, tegelmaat)
    gemeten++
    if (hOns === undefined) {
      mis++
      console.log(`${kaart.padEnd(26)} OMSI ${hOmsi.toFixed(3)}   wij: geen tegel gelezen`)
      continue
    }
    const verschil = hOns - hOmsi
    if (Math.abs(verschil) > 0.5) mis++
    console.log(
      `${kaart.padEnd(26)} tegel ${String(tx).padStart(5)},${String(ty).padStart(6)}  ` +
        `OMSI ${hOmsi.toFixed(3).padStart(9)}   wij ${hOns.toFixed(3).padStart(9)}   ` +
        `verschil ${verschil >= 0 ? '+' : ''}${verschil.toFixed(3)} m` +
        (Math.abs(verschil) > 0.5 ? '   <-- MIS' : '')
    )
  }
}

console.log(`\n${gemeten} gemeten, ${mis} met een verschil van meer dan een halve meter.`)
