import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { blockTag, num, readOmsiLines, str } from './omsiFile'
import {
  isBusStopObject,
  objectPaths,
  PATH_RAIL,
  PATH_ROAD,
  parseSpline,
  placeObjectPath,
  splineInfo,
  splineLane,
  splinePoints,
  type SplineKind
} from './roads'

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

/** Zoals hij tijdens het inlezen bekend is: met of het echt een haltepaal is. */
interface FoundStop extends StopPoint {
  real: boolean
}

/**
 * Groen op de kaart, als een rooster.
 *
 * Een kaart heeft geen parken, alleen tienduizenden losse grasjes en boompjes:
 * Hohenkirchen zet er vijfennegentigduizend neer. Die een voor een tekenen is
 * zinloos en traag. Maar waar ze dicht op elkaar staan, is groen -- dus tellen
 * we ze per vakje en onthouden we welke vakjes vol zitten. Dat is precies wat
 * een navigatiekaart laat zien: geen grassprieten, maar een groen vlak.
 */
export interface GreenGrid {
  /** Ribbe van een vakje in meters. */
  cellM: number
  /** Afwisselend x en y van de linkeronderhoek van elk vol vakje. */
  cells: number[]
}

/** Een stuk weg of spoor, als aaneengesloten punten in meters. */
export interface RoadLine {
  kind: SplineKind
  /** Afwisselend x en y, om het geheel klein te houden. */
  points: number[]
  /**
   * Breedte van deze baan in meters, zoals het splinebestand hem opgeeft.
   *
   * Daarmee tekent de kaart een doorgaande weg breder dan een woonstraat, zoals
   * elke navigatiekaart doet. Ontbreekt hij, dan is drieënhalve meter een
   * gewone rijstrook.
   */
  w?: number
}

export interface MapGeometry {
  widthM: number
  heightM: number
  stops: StopPoint[]
  roads: RoadLine[]
  /** Rivieren en kanalen; `w` is hun breedte in meters. */
  water?: RoadLine[]
  green?: GreenGrid
}

/**
 * Een rijstrook voor de routeplanner: waar hij ligt en welke kant hij op mag.
 * Blijft in het hoofdproces; de interface heeft er niets aan.
 */
export interface Lane {
  /** Afwisselend x en y in kaartmeters, in tekenrichting. */
  points: number[]
  /** 0 in tekenrichting, 1 ertegenin, 2 beide kanten op. */
  direction: number
  /** Het spline- of objectbestand, om een haperend net te kunnen nazoeken. */
  source: string
}

/** Een gewone OMSI-tegel is 300 meter in het vierkant. */
const TILE_M = 300

const TILE_NAME = /^tile_(-?\d+)_(-?\d+)\.map$/i

/**
 * Tegels met echte wereldcoördinaten volgen het Mercator-raster van
 * OpenStreetMap op 65.536 tegels rond de aarde; hun maat hangt af van de
 * breedtegraad. Berlin-Spandau is zo gebouwd: op 52,5° is een tegel 371,7 m, en
 * wie 300 aanhoudt ziet de wegen op elke tegelgrens 71,7 m verspringen.
 * Formules: forum.omnibussimulator.de, "How do I calculate RWC tile position and size".
 */
const WORLD_TILES = 65536
const EQUATOR_M = 6378137 * Math.PI * 2

function worldTileSize(ty: number): number {
  const latitude = Math.atan(Math.sinh((Math.PI * 2 * ty) / WORLD_TILES))
  return (EQUATOR_M / WORLD_TILES) * Math.cos(latitude)
}

/**
 * Waar een tegel op de kaart ligt. Kaartcoördinaten tellen vanaf de hoek van de
 * tegel linksonder; wie iets anders dan de geometrie op de kaart wil leggen,
 * zoals een route, moet hetzelfde raster gebruiken.
 */
export interface TileGrid {
  origin: { tx: number; ty: number }
  /** Meters van de kaarthoek tot de hoek linksonder van deze tegel. */
  offset(tx: number, ty: number): [number, number]
  /** Breedte en hoogte van een tegel in deze rij. */
  size(ty: number): number
  /** De omgekeerde weg: van kaartmeters naar tegel en plek binnen die tegel. */
  at(x: number, y: number): { tx: number; ty: number; localX: number; localZ: number }
}

export function readTileGrid(mapPath: string): TileGrid | undefined {
  let tx0 = Infinity
  let ty0 = Infinity
  try {
    for (const entry of readdirSync(mapPath)) {
      const match = TILE_NAME.exec(entry)
      if (!match) continue
      tx0 = Math.min(tx0, Number.parseInt(match[1], 10))
      ty0 = Math.min(ty0, Number.parseInt(match[2], 10))
    }
  } catch {
    return undefined
  }
  if (!Number.isFinite(tx0)) return undefined
  const origin = { tx: tx0, ty: ty0 }

  let world = false
  try {
    world = readOmsiLines(join(mapPath, 'global.cfg')).some((line) => blockTag(line) === '[worldcoordinates]')
  } catch {
    // Zonder global.cfg is het geen kaart die OMSI laadt; dan maar gewone tegels.
  }
  if (!world) {
    return {
      origin,
      offset: (tx, ty) => [(tx - tx0) * TILE_M, (ty - ty0) * TILE_M],
      size: () => TILE_M,
      at: (x, y) => {
        const tx = tx0 + Math.floor(x / TILE_M)
        const ty = ty0 + Math.floor(y / TILE_M)
        return { tx, ty, localX: x - (tx - tx0) * TILE_M, localZ: y - (ty - ty0) * TILE_M }
      }
    }
  }

  // Oost-west is een tegel zo breed als op zijn eigen breedtegraad; noord-zuid
  // tellen de rijhoogtes op, want die worden naar het noorden steeds kleiner.
  const rows: number[] = [0]
  const rowOffset = (ty: number): number => {
    for (let k = rows.length; k <= ty - ty0; k++) rows[k] = rows[k - 1] + worldTileSize(ty0 + k - 1)
    return rows[ty - ty0] ?? 0
  }
  return {
    origin,
    offset: (tx, ty) => [(tx - tx0) * worldTileSize(ty), rowOffset(ty)],
    size: worldTileSize,
    at: (x, y) => {
      // De rijen worden naar het noorden smaller, dus tellend zoeken.
      let ty = ty0
      while (rowOffset(ty + 1) <= y && ty - ty0 < 4096) ty++
      const width = worldTileSize(ty)
      const tx = tx0 + Math.floor(x / width)
      return { tx, ty, localX: x - (tx - tx0) * width, localZ: y - rowOffset(ty) }
    }
  }
}

const EMPTY: MapGeometry = { widthM: 0, heightM: 0, stops: [], roads: [] }

/*
 * Water is bij OMSI een spline als elke andere, alleen zonder rijbaan erop -- en
 * zijn breedte staat in zijn naam: `wasser_50m.sli` is vijftig meter breed. Een
 * kaartmaker die zich daar niet aan houdt krijgt de standaardbreedte.
 */
const WATER = /wasser|water|fluss|bach|kanal|teich/i
const WATER_BREEDTE = /[_-](\d+)\s*m/i
const WATER_STANDAARD = 20

/** Wat als groen telt: gras, struiken, bomen, hagen. */
const GROEN = /gras|wiese|busch|hecke|baum|baeume|tree|strauch|wald/i
/** Ribbe van een vakje, en hoeveel er in moeten staan voordat het groen heet. */
const GROEN_CEL = 25
const GROEN_DREMPEL = 3

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
  return readMapData(mapPath, wantedIds, omsiPath).geometry
}

/** Als readMapGeometry, en daarbij de rijstroken met hun rijrichting. */
export function readMapData(
  mapPath: string,
  wantedIds: Set<string>,
  omsiPath: string
): { geometry: MapGeometry; lanes: Lane[] } {
  const grid = readTileGrid(mapPath)
  if (wantedIds.size === 0 || !grid) return { geometry: EMPTY, lanes: [] }

  const stops: FoundStop[] = []
  const roads: RoadLine[] = []
  const water: RoadLine[] = []
  const groen = new Map<number, number>()
  const lanes: Lane[] = []
  let widthM = 0
  let heightM = 0

  for (const entry of readdirSync(mapPath)) {
    const match = TILE_NAME.exec(entry)
    if (!match) continue
    const tx = Number.parseInt(match[1], 10)
    const ty = Number.parseInt(match[2], 10)
    const [dx, dy] = grid.offset(tx, ty)
    widthM = Math.max(widthM, dx + grid.size(ty))
    heightM = Math.max(heightM, dy + grid.size(ty))
    const shift = (points: number[]): number[] => {
      for (let i = 0; i < points.length; i += 2) {
        points[i] += dx
        points[i + 1] += dy
      }
      return points
    }

    let lines: string[]
    try {
      lines = readOmsiLines(join(mapPath, entry))
    } catch {
      continue
    }

    for (let i = 0; i < lines.length; i++) {
      const tag = blockTag(lines[i])
      if (tag === '[object]') {
        // velden: vlag, bestandspad, id, x, y, hoogte, rotatie, ...
        const id = str(lines[i + 3])
        const source = str(lines[i + 2])
        if (!wantedIds.has(id)) {
          /*
           * Vegetatie draagt geen rijbaan en valt hieronder weg, dus eerst
           * tellen. Alleen waar het vakje vol staat wordt er straks iets
           * getekend.
           */
          if (GROEN.test(source)) {
            const gx = Math.floor((dx + num(lines[i + 4])) / GROEN_CEL)
            const gy = Math.floor((dy + num(lines[i + 5])) / GROEN_CEL)
            const key = gx * 100000 + gy
            groen.set(key, (groen.get(key) ?? 0) + 1)
          }

          // Geen halte, maar misschien wel een kruising of een stuk straat.
          const paths = objectPaths(omsiPath, source)
          if (paths.length === 0) continue
          const ox = num(lines[i + 4])
          const oy = num(lines[i + 5])
          const rot = num(lines[i + 7])
          for (const path of paths) {
            const kind = path.type === PATH_ROAD ? 'road' : path.type === PATH_RAIL ? 'rail' : undefined
            if (!kind || !(path.length > 0)) continue
            const points = placeObjectPath(ox, oy, rot, path)
            if (points.length < 4) continue
            shift(points)
            roads.push({ kind, points, w: path.width > 0 ? path.width : undefined })
            if (kind === 'road') lanes.push({ points, direction: path.direction, source })
          }
          continue
        }
        // De naam staat achter de getallen; pak de eerste regel die geen getal is.
        let name = ''
        for (let k = i + 10; k < i + 14 && k < lines.length; k++) {
          const candidate = str(lines[k])
          if (candidate && !/^-?\d+([.,]\d+)?$/.test(candidate)) {
            name = candidate
            break
          }
        }
        /*
         * Meerdere objecten kunnen hetzelfde id dragen -- kaarten zijn met de
         * hand gebouwd. De haltepaal telt; een struik met datzelfde nummer niet,
         * want die staat acht kilometer verderop en trekt de route dwars over de
         * kaart. Kent de kaart voor dit id geen paal, dan houden we wat er is.
         */
        stops.push({
          id,
          x: dx + num(lines[i + 4]),
          y: dy + num(lines[i + 5]),
          name,
          real: isBusStopObject(omsiPath, source)
        })
        continue
      }

      // `[spline_h]` is een spline met een hoogteverloop, verder hetzelfde
      // blok; Berlin-Spandau heeft er bijna vijfhonderd.
      if (tag !== '[spline]' && tag !== '[spline_h]') continue
      const source = str(lines[i + 2])
      const info = splineInfo(omsiPath, source)
      const isWater = info.kind !== 'road' && info.kind !== 'rail' && WATER.test(source)
      if (info.kind !== 'road' && info.kind !== 'rail' && !isWater) continue
      const shape = parseSpline(lines, i)
      if (!shape) continue
      if (isWater) {
        const maat = WATER_BREEDTE.exec(source)
        water.push({
          kind: 'other',
          points: shift(splinePoints(shape.x, shape.y, shape.rotationDeg, shape.length, shape.radius, 0)),
          w: maat ? Number.parseInt(maat[1], 10) : WATER_STANDAARD
        })
        continue
      }
      const place = (offset: number): number[] =>
        shift(splinePoints(shape.x, shape.y, shape.rotationDeg, shape.length, shape.radius, offset))

      if (info.kind === 'rail') {
        for (const offset of info.offsets) roads.push({ kind: 'rail', points: place(shape.mirror ? -offset : offset) })
        continue
      }

      /*
       * Per rijstrook tekenen en niet de middenlijn. Kruisingen komen per
       * rijstrook uit hun object; met alleen een middenlijn is een straat
       * smaller dan de kruising waar hij op uitkomt, en hangen er blokken aan
       * de weg. Een vierbaansweg wordt zo vanzelf ook breder dan een landweg.
       * Twee rijrichtingen op dezelfde strook worden één lijn.
       */
      const drawn = new Map<string, number[]>()
      for (const path of info.paths) {
        if (path.type !== PATH_ROAD) continue
        const lane = splineLane(shape, path)
        const key = lane.offset.toFixed(1)
        let points = drawn.get(key)
        if (!points) {
          points = place(lane.offset)
          drawn.set(key, points)
          roads.push({ kind: 'road', points, w: path.width > 0 ? path.width : undefined })
        }
        lanes.push({ points, direction: lane.direction, source })
      }
    }
  }

  if (stops.length === 0) return { geometry: EMPTY, lanes: [] }

  /*
   * Eén plek per id, en bij voorkeur die van de haltepaal. Kaarten worden met de
   * hand gebouwd en hetzelfde nummer komt daarbij soms twee keer voor: op
   * Thüringer Wald delen negen haltes hun id met een plukje struikgewas ergens
   * anders op de kaart. Namen ze de verkeerde, dan liep de route kaarsrecht
   * dwars over de kaart naar een struik.
   */
  const best = new Map<string, FoundStop>()
  for (const stop of stops) {
    const known = best.get(stop.id)
    if (!known || (stop.real && !known.real)) best.set(stop.id, stop)
  }

  return {
    geometry: {
      widthM,
      heightM,
      stops: [...best.values()].map(({ real: _real, ...stop }) => stop),
      roads,
      water,
      /*
       * Alleen de vakjes die vol genoeg staan. Een enkele boom langs de weg is
       * geen park, en zou de kaart vol spikkels zetten.
       */
      green: {
        cellM: GROEN_CEL,
        cells: [...groen]
          .filter(([, aantal]) => aantal >= GROEN_DREMPEL)
          .flatMap(([sleutel]) => [
            Math.floor(sleutel / 100000) * GROEN_CEL,
            (sleutel % 100000) * GROEN_CEL
          ])
      }
    },
    lanes
  }
}
