/**
 * Draagt een haltepaal zijn eigen hoogte, en is die beter dan wat wij nu doen?
 *
 *   npx tsx scripts/probe-haltehoogte.ts "<pad naar OMSI 2>" [kaart]
 *
 * Leest alleen. Een `[object]`-blok noemt na het id zijn x, zijn y en zijn
 * hoogte. Wij lezen er twee van de drie: de hoogte gooiden we weg, en zochten
 * hem daarna terug bij de dichtstbijzijnde spline -- die er één heeft voor zijn
 * hele lengte, en die van zijn beginpunt.
 *
 * Een haltepaal staat naast de weg waar hij bij hoort, neergezet door de maker
 * van de kaart. Dat is het antwoord op "hoe hoog ligt de weg hier", zonder
 * gissen en zonder grens van acht meter om viaducten buiten te houden: een paal
 * onder een viaduct staat gewoon laag, een paal op een dijk staat hoog.
 *
 * Deze probe legt drie antwoorden naast elkaar -- de paal, het maaiveld en de
 * spline die wij nu nemen -- zodat te zien is of de paal werkelijk beter is
 * voordat er iets aan de app verandert.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { readTileGrid } from '../src/core/geo'
import { terrainHeight } from '../src/core/terrain'
import { isBusStopObject } from '../src/core/roads'

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

const num = (s: string | undefined): number => {
  const w = Number.parseFloat((s ?? '').trim().replace(',', '.'))
  return Number.isFinite(w) ? w : NaN
}
const str = (s: string | undefined): string => (s ?? '').trim()

for (const kaart of kaarten) {
  const mapPath = join(mapsDir, kaart)
  const grid = readTileGrid(mapPath)
  if (!grid) continue

  let palen = 0
  let metHoogte = 0
  let bovenMaaiveld = 0
  let somBoven = 0
  let hoogste = 0
  let hoogsteNaam = ''
  let onderMaaiveld = 0
  /* De opgeschreven getallen zelf: hangen ze om de nul, dan zijn ze relatief. */
  const rauw: number[] = []

  for (const naam of readdirSync(mapPath)) {
    const m = TEGEL.exec(naam)
    if (!m) continue
    const tx = Number.parseInt(m[1], 10)
    const ty = Number.parseInt(m[2], 10)
    let lines: string[]
    try {
      lines = lees(join(mapPath, naam))
    } catch {
      continue
    }

    for (let i = 0; i < lines.length; i++) {
      if (str(lines[i]).toLowerCase() !== '[object]') continue
      const source = str(lines[i + 2])
      if (!source || !isBusStopObject(omsi, source)) continue

      const x = num(lines[i + 4])
      const y = num(lines[i + 5])
      const hoogte = num(lines[i + 6])
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue
      palen++
      if (!Number.isFinite(hoogte)) continue
      metHoogte++

      rauw.push(hoogte)
      const grond = terrainHeight(mapPath, tx, ty, x, y, grid.size(ty))
      if (grond === undefined) continue
      const verschil = hoogte - grond
      if (verschil > 0.5) {
        bovenMaaiveld++
        somBoven += verschil
        if (verschil > hoogste) {
          hoogste = verschil
          hoogsteNaam = str(lines[i + 3])
        }
      } else if (verschil < -0.5) {
        onderMaaiveld++
      }
    }
  }

  if (palen === 0) {
    console.log(`${kaart.padEnd(24)} geen haltepalen gevonden`)
    continue
  }

  rauw.sort((a, b) => a - b)
  const mediaan = rauw[Math.floor(rauw.length / 2)] ?? 0
  const bijNul = rauw.filter((h) => Math.abs(h) < 0.5).length

  console.log(
    `${kaart.padEnd(24)} ${String(palen).padStart(4)} palen` +
      `  opgeschreven: mediaan ${mediaan.toFixed(2).padStart(7)}` +
      `  [${(rauw[0] ?? 0).toFixed(0)} .. ${(rauw[rauw.length - 1] ?? 0).toFixed(0)}]`.padEnd(16) +
      `  bij nul ${((bijNul / Math.max(1, rauw.length)) * 100).toFixed(0).padStart(3)}%` +
      `  boven maaiveld ${String(bovenMaaiveld).padStart(4)}` +
      `  eronder ${String(onderMaaiveld).padStart(4)}` +
      (bovenMaaiveld > 0 ? `  hoogste ${hoogste.toFixed(1)} (id ${hoogsteNaam})` : '')
  )
}
