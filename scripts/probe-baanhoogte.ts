/**
 * Twee maten in een bestand: is de hoogte van een object relatief?
 *
 *   npx tsx scripts/probe-baanhoogte.ts "<pad naar OMSI 2>" [kaart]
 *
 * Leest alleen. Uit `probe-haltehoogte.ts` bleek dat de hoogte in een
 * `[object]`-blok om de nul hangt -- mediaan 0,00, op Spandau 99% binnen een
 * halve meter, terwijl het maaiveld daar op 32 m ligt. Dat is geen wereldhoogte
 * maar een afstand tot de grond. De hoogte in een `[spline]`-blok loopt juist
 * mee met het terrein en is dus wel absoluut.
 *
 * Wij rekenen ze allebei als wereldhoogte. Daar hangt aan vast waar de bus komt
 * te staan, dus moet het hard: dit zoekt plekken waar een baan uit een object
 * aansluit op een baan uit een spline -- een kruising die op een straat uitkomt
 * -- en legt daar twee formules naast de spline, die we vertrouwen:
 *
 *   nu         de objecthoogte zoals wij hem nemen
 *   voorstel   maaiveld + objecthoogte
 *
 * Welke van de twee de spline raakt, is de goede.
 */
import { existsSync, readdirSync } from 'node:fs'
import { extname, join } from 'node:path'
import { readMapData, readTileGrid } from '../src/core/geo'
import { terrainHeight } from '../src/core/terrain'
import { loadMap } from '../src/core/timetable'

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

for (const kaart of kaarten) {
  const mapPath = join(mapsDir, kaart)
  const dienst = loadMap(mapsDir, kaart)
  if (!dienst || dienst.stops.size === 0) continue
  const grid = readTileGrid(mapPath)
  if (!grid) continue

  let data: ReturnType<typeof readMapData>
  try {
    data = readMapData(mapPath, new Set(dienst.stops.keys()), omsi)
  } catch {
    continue
  }

  /* Een baan uit een object of uit een spline: te zien aan de extensie. */
  const uitObject = (bron: string): boolean => extname(bron).toLowerCase() === '.sco'

  const splineEinden = new Map<string, number[]>()
  for (const lane of data.lanes) {
    if (uitObject(lane.source) || lane.height === undefined) continue
    for (let i = 0; i + 1 < lane.points.length; i += 2) {
      const sleutel = `${Math.round(lane.points[i])}|${Math.round(lane.points[i + 1])}`
      const lijst = splineEinden.get(sleutel)
      if (lijst) lijst.push(lane.height)
      else splineEinden.set(sleutel, [lane.height])
    }
  }

  let paren = 0
  let nuGoed = 0
  let voorstelGoed = 0
  let somNu = 0
  let somVoorstel = 0

  for (const lane of data.lanes) {
    if (!uitObject(lane.source) || lane.height === undefined) continue
    for (let i = 0; i + 1 < lane.points.length; i += 2) {
      const x = lane.points[i]
      const y = lane.points[i + 1]
      let buur: number | undefined
      for (const dx of [-1, 0, 1]) {
        for (const dy of [-1, 0, 1]) {
          const lijst = splineEinden.get(`${Math.round(x) + dx}|${Math.round(y) + dy}`)
          if (lijst && lijst.length > 0) buur = lijst[0]
        }
      }
      if (buur === undefined) continue

      const tegel = grid.at(x, y)
      const grond = terrainHeight(
        mapPath,
        tegel.tx,
        tegel.ty,
        tegel.localX,
        tegel.localZ,
        grid.size(tegel.ty)
      )
      if (grond === undefined) continue

      paren++
      const nu = Math.abs(lane.height - buur)
      const voorstel = Math.abs(grond + lane.height - buur)
      somNu += nu
      somVoorstel += voorstel
      if (nu < 1) nuGoed++
      if (voorstel < 1) voorstelGoed++
    }
  }

  if (paren === 0) {
    console.log(`${kaart.padEnd(24)} geen aansluitingen object-spline gevonden`)
    continue
  }

  console.log(
    `${kaart.padEnd(24)} ${String(paren).padStart(5)} aansluitingen` +
      `   nu ${((nuGoed / paren) * 100).toFixed(0).padStart(3)}% binnen 1 m (gem ${(somNu / paren).toFixed(1)} m mis)` +
      `   voorstel ${((voorstelGoed / paren) * 100).toFixed(0).padStart(3)}% (gem ${(somVoorstel / paren).toFixed(1)} m mis)`
  )
}
