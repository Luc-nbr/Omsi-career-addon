/**
 * Draagt een spline een hoogteverloop, en welk veld is dat?
 *
 *   npx tsx scripts/probe-hoogteverloop.ts "<pad naar OMSI 2>" [kaart]
 *
 * Leest alleen. Wij nemen van een spline één hoogte: die van het beginpunt. Een
 * weg die klimt klopt dan alleen aan het begin, en een halte halverwege krijgt
 * een bus die in het wegdek staat of erboven zweeft. Dat is precies de klacht
 * die na de vorige reparatie overbleef.
 *
 * De toets is een ketting. Splines liggen kop aan staart: het eindpunt van de
 * ene is het beginpunt van de volgende. Klopt "beginhoogte + verloop" van de
 * ene met de beginhoogte van de volgende, dan is het gevonden veld werkelijk
 * het hoogteverschil over die spline. Klopt het niet, dan hebben we het
 * verkeerde veld te pakken -- en dan zegt deze probe dat, in plaats van dat we
 * het gaan geloven.
 *
 * Er wordt ook geteld wat het waard is: hoeveel meter een spline gemiddeld en
 * uiterst stijgt of daalt. Is dat overal nul, dan valt er niets te repareren.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { splinePoints } from '../src/core/roads'

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

interface Stuk {
  x: number
  y: number
  hoogte: number
  verloop: number
  eindX: number
  eindY: number
}

for (const kaart of kaarten) {
  const mapPath = join(mapsDir, kaart)
  const stukken: Stuk[] = []

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
      const tag = lines[i].trim().toLowerCase()
      if (tag !== '[spline]' && tag !== '[spline_h]') continue

      /*
       * Dezelfde twee lay-outs die parseSpline aanhoudt: bij de ene begint het
       * zestal een veld eerder dan bij de andere. We nemen de lezing waarbij de
       * lengte niet negatief is en de coordinaten decimalen hebben.
       */
      for (const start of [i + 6, i + 5]) {
        const x = num(lines[start])
        const hoogte = num(lines[start + 1])
        const y = num(lines[start + 2])
        const rot = num(lines[start + 3])
        const lengte = num(lines[start + 4])
        const straal = num(lines[start + 5])
        // Acht velden verder staat het getal dat op het hoogteverschil lijkt.
        const verloop = num(lines[start + 8])
        if (![x, hoogte, y, rot, lengte, straal].every(Number.isFinite)) continue
        if (lengte <= 0) continue

        const punten = splinePoints(x, y, rot, lengte, straal)
        // Tegelcoordinaten naar iets dat over tegels heen vergelijkbaar is.
        const basisX = tx * 300
        const basisY = ty * 300
        stukken.push({
          x: basisX + x,
          y: basisY + y,
          hoogte,
          verloop: Number.isFinite(verloop) ? verloop : 0,
          eindX: basisX + punten[punten.length - 2],
          eindY: basisY + punten[punten.length - 1]
        })
        break
      }
    }
  }

  if (stukken.length === 0) {
    console.log(`${kaart.padEnd(24)} geen splines gelezen`)
    continue
  }

  /*
   * De ketting nalopen: welk stuk begint waar dit stuk eindigt? Een raster van
   * hele meters is genoeg om buren te vinden zonder alles met alles te
   * vergelijken.
   */
  const raster = new Map<string, Stuk[]>()
  for (const s of stukken) {
    const sleutel = `${Math.round(s.x)}|${Math.round(s.y)}`
    const lijst = raster.get(sleutel)
    if (lijst) lijst.push(s)
    else raster.set(sleutel, [s])
  }

  let paren = 0
  let klopt = 0
  let kloptZonder = 0
  let somFout = 0

  for (const s of stukken) {
    for (const dx of [-1, 0, 1]) {
      for (const dy of [-1, 0, 1]) {
        const buren = raster.get(`${Math.round(s.eindX) + dx}|${Math.round(s.eindY) + dy}`)
        if (!buren) continue
        for (const b of buren) {
          if (b === s) continue
          if (Math.hypot(b.x - s.eindX, b.y - s.eindY) > 0.5) continue
          paren++
          // Met het verloop meegerekend, en zonder: welke van de twee klopt?
          if (Math.abs(s.hoogte + s.verloop - b.hoogte) < 0.05) klopt++
          if (Math.abs(s.hoogte - b.hoogte) < 0.05) kloptZonder++
          somFout += Math.abs(s.hoogte + s.verloop - b.hoogte)
        }
      }
    }
  }

  const verlopen = stukken.map((s) => Math.abs(s.verloop)).sort((a, b) => a - b)
  const grootste = verlopen[verlopen.length - 1] ?? 0
  const meerDanHalf = verlopen.filter((v) => v > 0.5).length

  console.log(
    `${kaart.padEnd(24)} ${String(stukken.length).padStart(5)} splines` +
      `  ${String(paren).padStart(5)} aansluitingen` +
      `  met verloop ${paren > 0 ? ((klopt / paren) * 100).toFixed(0).padStart(3) : ' --'}%` +
      `  zonder ${paren > 0 ? ((kloptZonder / paren) * 100).toFixed(0).padStart(3) : ' --'}%` +
      `  verloop >0,5 m: ${String(meerDanHalf).padStart(4)}` +
      `  grootste ${grootste.toFixed(1)} m`
  )
}
