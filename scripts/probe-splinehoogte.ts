/**
 * Is de hoogte van een spline absoluut, of ten opzichte van het maaiveld?
 *
 *   npx tsx scripts/probe-splinehoogte.ts "<pad naar OMSI 2>" [kaart]
 *
 * Leest alleen. Hier hangt de hele reparatie van "de bus staat in de grond" aan
 * op. Wij nemen `max(wegdek, maaiveld)`, en dat klopt alleen als de hoogte in
 * het bestand een wereldhoogte is. Staat er een hoogte ten opzichte van het
 * terrein, dan hoort het `maaiveld + wegdek` te zijn -- en dan namen wij bij
 * elke gewone weg (hoogte nul) het maaiveld, precies de oude fout terug.
 *
 * De verdeling zegt het: wereldhoogtes lopen mee met het terrein en zijn dus
 * overal anders, relatieve hoogtes hangen om de nul. En het gemiddelde verschil
 * met het maaiveld op dezelfde plek is bij wereldhoogtes klein en bij relatieve
 * hoogtes precies zo groot als het terrein hoog is.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { readTileGrid } from '../src/core/geo'
import { terrainHeight } from '../src/core/terrain'
import { parseSpline } from '../src/core/roads'

const omsi = process.argv[2]
if (!omsi || !existsSync(omsi)) {
  console.error('Geef het pad naar de OMSI 2-map.')
  process.exit(1)
}
const alleen = process.argv[3]

const mapsDir = join(omsi, 'maps')
const kaarten = readdirSync(mapsDir).filter(
  (naam) => existsSync(join(mapsDir, naam, 'global.cfg')) && (!alleen || naam === alleen)
)

const TEGEL = /^tile_(-?\d+)_(-?\d+)\.map$/i

function lees(pad: string): string[] {
  const ruw = readFileSync(pad)
  const tekst =
    ruw[0] === 0xff && ruw[1] === 0xfe ? ruw.toString('utf16le') : ruw.toString('latin1')
  return tekst.split('\n').map((r) => r.replace(/\r$/, ''))
}

for (const kaart of kaarten) {
  const mapPath = join(mapsDir, kaart)
  const grid = readTileGrid(mapPath)
  if (!grid) continue

  const hoogtes: number[] = []
  let gemeten = 0
  let somAfstandTotMaaiveld = 0
  let somMaaiveld = 0

  for (const naam of readdirSync(mapPath)) {
    const match = TEGEL.exec(naam)
    if (!match) continue
    const tx = Number.parseInt(match[1], 10)
    const ty = Number.parseInt(match[2], 10)
    let lines: string[]
    try {
      lines = lees(join(mapPath, naam))
    } catch {
      continue
    }
    for (let i = 0; i < lines.length; i++) {
      const tag = lines[i].trim().toLowerCase()
      if (tag !== '[spline]' && tag !== '[spline_h]') continue
      const shape = parseSpline(lines, i)
      if (!shape || !Number.isFinite(shape.height)) continue
      hoogtes.push(shape.height)

      const grond = terrainHeight(mapPath, tx, ty, shape.x, shape.y, grid.size(ty))
      if (grond === undefined) continue
      gemeten++
      somAfstandTotMaaiveld += Math.abs(shape.height - grond)
      somMaaiveld += Math.abs(grond)
    }
  }

  if (hoogtes.length === 0) {
    console.log(`${kaart.padEnd(26)} geen splines gelezen`)
    continue
  }

  hoogtes.sort((a, b) => a - b)
  const mediaan = hoogtes[Math.floor(hoogtes.length / 2)]
  const bijNul = hoogtes.filter((h) => Math.abs(h) < 0.5).length
  console.log(
    `${kaart.padEnd(24)} ${String(hoogtes.length).padStart(5)} splines` +
      `  mediaan ${mediaan.toFixed(1).padStart(7)}` +
      `  [${hoogtes[0].toFixed(0)} .. ${hoogtes[hoogtes.length - 1].toFixed(0)}]`.padEnd(18) +
      `  bij nul ${((bijNul / hoogtes.length) * 100).toFixed(0).padStart(3)}%` +
      (gemeten > 0
        ? `  maaiveld gem. ${(somMaaiveld / gemeten).toFixed(1)}` +
          `  afstand ertoe ${(somAfstandTotMaaiveld / gemeten).toFixed(1)}`
        : '')
  )
}
