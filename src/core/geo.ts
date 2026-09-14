import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { blockTag, num, readOmsiLines, str } from './omsiFile'
import { parseSpline, splineKind, splinePoints, type SplineKind } from './roads'

/**
 * Waar de haltes van een kaart liggen.
 *
 * OMSI legt zijn wereld vast in tegels van 300 bij 300 meter: `tile_2402_11279.map`
 * is de tegel op die coördinaten, en daarin staat elk object met zijn plaats
 * binnen die tegel. Een halte is zo'n object, en het derde veld is precies het
 * id dat de dienstregeling gebruikt — daarmee is elke halte uit een dienst op de
 * kaart terug te vinden.
 */
export interface StopPoint {
  id: string
  /** Meters vanaf de westrand van de kaart. */
  x: number
  /** Meters vanaf de zuidrand. */
  y: number
  name: string
}

/** Een stuk weg of spoor, als aaneengesloten punten in meters. */
export interface RoadLine {
  kind: SplineKind
  /** Afwisselend x en y, om het geheel klein te houden. */
  points: number[]
}

export interface MapGeometry {
  widthM: number
  heightM: number
  stops: StopPoint[]
  roads: RoadLine[]
}

/** Een OMSI-tegel is 300 meter in het vierkant. */
const TILE_M = 300

const TILE_NAME = /^tile_(-?\d+)_(-?\d+)\.map$/i

/** Alleen deze twee zijn de moeite van het tekenen waard. */
const DRAWN: SplineKind[] = ['road', 'rail']

const EMPTY: MapGeometry = { widthM: 0, heightM: 0, stops: [], roads: [] }

/**
 * Leest de haltes en het wegennet van een kaart uit de tegels.
 *
 * Filteren op het bestandspad van het object zou ook kunnen, maar elke kaart
 * gebruikt andere halteobjecten. Filteren op de id's die de dienstregeling
 * noemt is zuiverder: dan komen er geen lantaarnpalen tussen, en wat je vindt is
 * per definitie een halte die gereden wordt.
 */
export function readMapGeometry(
  mapPath: string,
  wantedIds: Set<string>,
  omsiPath: string
): MapGeometry {
  if (wantedIds.size === 0) return EMPTY

  type RawStop = { id: string; tx: number; ty: number; x: number; y: number; name: string }
  type RawRoad = { kind: SplineKind; tx: number; ty: number; points: number[] }
  const rawStops: RawStop[] = []
  const rawRoads: RawRoad[] = []
  let minTx = Infinity
  let maxTx = -Infinity
  let minTy = Infinity
  let maxTy = -Infinity

  let entries: string[]
  try {
    entries = readdirSync(mapPath)
  } catch {
    return EMPTY
  }

  for (const entry of entries) {
    const match = TILE_NAME.exec(entry)
    if (!match) continue
    const tx = Number.parseInt(match[1], 10)
    const ty = Number.parseInt(match[2], 10)

    let lines: string[]
    try {
      lines = readOmsiLines(join(mapPath, entry))
    } catch {
      continue
    }

    minTx = Math.min(minTx, tx)
    maxTx = Math.max(maxTx, tx)
    minTy = Math.min(minTy, ty)
    maxTy = Math.max(maxTy, ty)

    for (let i = 0; i < lines.length; i++) {
      const tag = blockTag(lines[i])
      if (tag === '[object]') {
        // velden: vlag, bestandspad, id, x, y, hoogte, rotatie, ...
        const id = str(lines[i + 3])
        if (!wantedIds.has(id)) continue
        // De naam staat achter de getallen; pak de eerste regel die geen getal is.
        let name = ''
        for (let k = i + 10; k < i + 14 && k < lines.length; k++) {
          const candidate = str(lines[k])
          if (candidate && !/^-?\d+([.,]\d+)?$/.test(candidate)) {
            name = candidate
            break
          }
        }
        rawStops.push({ id, tx, ty, x: num(lines[i + 4]), y: num(lines[i + 5]), name })
        continue
      }

      if (tag !== '[spline]') continue
      const kind = splineKind(omsiPath, str(lines[i + 2]))
      if (!DRAWN.includes(kind)) continue
      const shape = parseSpline(lines, i)
      if (!shape) continue
      const points = splinePoints(shape.x, shape.y, shape.rotationDeg, shape.length, shape.radius)
      if (points.length >= 4) rawRoads.push({ kind, tx, ty, points })
    }
  }

  if (rawStops.length === 0 || !Number.isFinite(minTx)) return EMPTY

  const stops = rawStops.map((item) => ({
    id: item.id,
    x: (item.tx - minTx) * TILE_M + item.x,
    y: (item.ty - minTy) * TILE_M + item.y,
    name: item.name
  }))

  const roads = rawRoads.map((item) => {
    const offsetX = (item.tx - minTx) * TILE_M
    const offsetY = (item.ty - minTy) * TILE_M
    const points = new Array<number>(item.points.length)
    for (let i = 0; i < item.points.length; i += 2) {
      points[i] = offsetX + item.points[i]
      points[i + 1] = offsetY + item.points[i + 1]
    }
    return { kind: item.kind, points }
  })

  return {
    widthM: (maxTx - minTx + 1) * TILE_M,
    heightM: (maxTy - minTy + 1) * TILE_M,
    stops,
    roads
  }
}
