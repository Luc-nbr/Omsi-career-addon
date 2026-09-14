import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { readTileGrid } from './geo'
import { blockTag, num, parseOmsiFile, readOmsiLines, str } from './omsiFile'
import {
  objectPaths,
  parseSpline,
  placeObjectPath,
  splineInfo,
  splineLane,
  splinePoints,
  type SplineShape
} from './roads'

/**
 * De route van een rit, zoals OMSI hem zelf rijdt.
 *
 * Een `.ttp` noemt alleen haltes, maar naast veel ritten ligt een `.ttr` met
 * dezelfde naam: het spoor dat de editor heeft uitgelegd, baan voor baan. Niet
 * alleen voor treinen: Grundorf, Thüringer Wald en de Hamburgse kaarten hebben
 * er voor hun busritten ook een.
 *
 * Een `[track_entry]` heeft zes velden: het id van de spline of het object in
 * de tegel, het volgnummer van de baan daarin, het volgnummer van de tegel in
 * global.cfg, het volgnummer van de baan in de hele tegel, de lengte, en een
 * veld dat overal nul is.
 */
export interface TrackEntry {
  id: string
  path: number
  tile: number
  length: number
}

export interface TrackLine {
  /** Afwisselend x en y in kaartmeters, in rijrichting. */
  points: number[]
  /** Banen die niet op de kaart terug te vinden waren. */
  missing: number
  /** Afstand tussen het eind van elke baan en het begin van de volgende. */
  gaps: number[]
  /** Per baan: welke kant hij op mag, en of de route hem tegen zijn tekenrichting in rijdt. */
  driven: Array<{ direction: number; reversed: boolean; file: string }>
}

export function readTrack(path: string): TrackEntry[] {
  return parseOmsiFile(path, { '[track_entry]': 6 }).map((block) => ({
    id: str(block.values[0]),
    path: Number.parseInt(block.values[1] ?? '', 10),
    tile: Number.parseInt(block.values[2] ?? '', 10),
    length: num(block.values[4])
  }))
}

/** De tegels in de volgorde van global.cfg; daarnaar verwijst een route. */
export function readTileList(mapPath: string): Array<{ tx: number; ty: number; file: string }> {
  return parseOmsiFile(join(mapPath, 'global.cfg'), { '[map]': 3 }).map((block) => ({
    tx: Number.parseInt(block.values[0] ?? '', 10),
    ty: Number.parseInt(block.values[1] ?? '', 10),
    file: str(block.values[2])
  }))
}

type Element =
  | { kind: 'spline'; file: string; shape: SplineShape }
  | { kind: 'object'; file: string; x: number; y: number; rotationDeg: number }

/**
 * Per tegel de splines en objecten op id. Alleen wat een route nodig heeft,
 * geen regels: een stad heeft honderden tegels van elk een paar honderd kB.
 */
const tileCache = new Map<string, Map<string, Element>>()

function tileElements(path: string): Map<string, Element> {
  const known = tileCache.get(path)
  if (known) return known
  const elements = new Map<string, Element>()
  try {
    const lines = readOmsiLines(path)
    for (let i = 0; i < lines.length; i++) {
      const tag = blockTag(lines[i])
      if (tag === '[spline]' || tag === '[spline_h]') {
        const shape = parseSpline(lines, i)
        if (shape) elements.set(str(lines[i + 3]), { kind: 'spline', file: str(lines[i + 2]), shape })
      } else if (tag === '[object]') {
        elements.set(str(lines[i + 3]), {
          kind: 'object',
          file: str(lines[i + 2]),
          x: num(lines[i + 4]),
          y: num(lines[i + 5]),
          rotationDeg: num(lines[i + 7])
        })
      }
    }
  } catch {
    // Een tegel die niet te lezen is, levert gewoon geen banen.
  }
  tileCache.set(path, elements)
  return elements
}

/** Waar een baan uit een route ligt, binnen zijn tegel, en welke kant hij op mag. */
function entryPoints(
  omsiPath: string,
  element: Element,
  index: number
): { points: number[]; direction: number } | undefined {
  if (element.kind === 'spline') {
    const path = splineInfo(omsiPath, element.file).paths[index]
    if (!path) return undefined
    const { x, y, rotationDeg, length, radius } = element.shape
    const lane = splineLane(element.shape, path)
    return { points: splinePoints(x, y, rotationDeg, length, radius, lane.offset), direction: lane.direction }
  }
  const path = objectPaths(omsiPath, element.file)[index]
  if (!path) return undefined
  return { points: placeObjectPath(element.x, element.y, element.rotationDeg, path), direction: path.direction }
}

/**
 * Legt de route van een rit op de kaart, in dezelfde meters als de geometrie.
 *
 * In welke richting een baan gereden wordt staat niet in de route; dat volgt uit
 * de aansluiting. Elke baan wordt zo gedraaid dat hij begint waar de vorige
 * ophield, en de eerste zo dat hij eindigt waar de tweede begint.
 */
export function readTrackLine(
  mapPath: string,
  omsiPath: string,
  tripFile: string
): TrackLine | undefined {
  const file = join(mapPath, 'TTData', `${tripFile}.ttr`)
  if (!existsSync(file)) return undefined
  const grid = readTileGrid(mapPath)
  if (!grid) return undefined

  let entries: TrackEntry[]
  let tiles: ReturnType<typeof readTileList>
  try {
    entries = readTrack(file)
    tiles = readTileList(mapPath)
  } catch {
    return undefined
  }

  const pieces: Array<{ points: number[]; direction: number; file: string }> = []
  let missing = 0
  for (const entry of entries) {
    const tile = tiles[entry.tile]
    const element = tile ? tileElements(join(mapPath, tile.file)).get(entry.id) : undefined
    const local = element ? entryPoints(omsiPath, element, entry.path) : undefined
    if (!tile || !local || local.points.length < 4) {
      missing++
      continue
    }
    const [dx, dy] = grid.offset(tile.tx, tile.ty)
    const points = local.points.map((value, i) => value + (i % 2 === 0 ? dx : dy))
    pieces.push({ points, direction: local.direction, file: element?.file ?? '' })
  }
  if (pieces.length === 0) return undefined

  const points: number[] = []
  const gaps: number[] = []
  const driven: TrackLine['driven'] = []
  for (let i = 0; i < pieces.length; i++) {
    let piece = pieces[i].points
    let reversed = false
    if (i === 0) {
      // Geen voorganger: kijk welk uiteinde het dichtst bij de volgende baan ligt.
      const next = pieces[1]?.points
      reversed = Boolean(next && nearestEnd(piece, next) === 'start')
    } else {
      const lastX = points[points.length - 2]
      const lastY = points[points.length - 1]
      const toStart = Math.hypot(piece[0] - lastX, piece[1] - lastY)
      const toEnd = Math.hypot(piece[piece.length - 2] - lastX, piece[piece.length - 1] - lastY)
      reversed = toEnd < toStart
      gaps.push(Math.min(toStart, toEnd))
    }
    if (reversed) piece = reverse(piece)
    driven.push({ direction: pieces[i].direction, reversed, file: pieces[i].file })
    // Het eerste punt valt samen met het vorige eindpunt; niet dubbel opnemen.
    points.push(...(i === 0 ? piece : piece.slice(2)))
  }

  return { points, missing, gaps, driven }
}

/** Welk uiteinde van `piece` het dichtst bij een van beide uiteinden van `other` ligt. */
function nearestEnd(piece: number[], other: number[]): 'start' | 'end' {
  const ends = [
    [other[0], other[1]],
    [other[other.length - 2], other[other.length - 1]]
  ]
  const distance = (x: number, y: number): number =>
    Math.min(...ends.map(([ex, ey]) => Math.hypot(ex - x, ey - y)))
  return distance(piece[0], piece[1]) < distance(piece[piece.length - 2], piece[piece.length - 1])
    ? 'start'
    : 'end'
}

function reverse(points: number[]): number[] {
  const out = new Array<number>(points.length)
  for (let i = 0; i < points.length; i += 2) {
    out[points.length - 2 - i] = points[i]
    out[points.length - 1 - i] = points[i + 1]
  }
  return out
}
