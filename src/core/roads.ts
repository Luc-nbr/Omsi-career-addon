import { join } from 'node:path'
import { blockTag, num, readOmsiLines } from './omsiFile'

/**
 * Wat voor spline dit is, volgens het spline-bestand zelf.
 *
 * Elke `.sli` beschrijft zijn dwarsprofiel en daarbij nul of meer `[path]`-
 * blokken: de banen waarop verkeer zich beweegt. Het eerste veld van zo'n blok
 * is het soort verkeer, en OMSI documenteert dat in zijn eigen bestanden:
 * 0 is AI-wegverkeer, 1 voetgangers, 2 spoor.
 *
 * Dat is de enige betrouwbare maatstaf. Op de naam afgaan werkt niet: alleen
 * Thüringer Wald gebruikt al achthonderd verschillende splinebestanden, met
 * namen als "Zubringer_5m_KS_DDR_Rinne" en "Kopfstein08_5m_p".
 */
export type SplineKind = 'road' | 'rail' | 'foot' | 'other'

/** Een punt per vijf graden bocht; fijner is op deze schaal niet te zien. */
const ARC_STEP = (5 * Math.PI) / 180

/** Bochten met een straal hierboven lopen praktisch recht. */
const STRAIGHT_RADIUS = 5000

/** Soort verkeer op een baan, zoals OMSI het nummert. */
export const PATH_ROAD = 0
export const PATH_FOOT = 1
export const PATH_RAIL = 2

/** Een baan in een splinebestand. */
export interface SplinePath {
  type: number
  /** Zijwaartse afstand tot de spline, rechts positief. */
  offset: number
  /** 0 met de spline mee, 1 ertegenin, 2 beide kanten op. */
  direction: number
}

/** Wat een splinebestand is, en waar zijn rijstroken of sporen dwars op de spline liggen. */
export interface SplineInfo {
  kind: SplineKind
  /** Zijwaartse afstand van elke te tekenen rijstrook of elk spoor, zonder dubbelingen. */
  offsets: number[]
  /**
   * Alle banen in de volgorde van het bestand, stoepen incluis: een route in een
   * `.ttr` wijst een baan aan met zijn volgnummer, en dat telt ze allemaal.
   */
  paths: SplinePath[]
}

const infoCache = new Map<string, SplineInfo>()

/**
 * Zoekt op of er een rijbaan op deze spline ligt. Kaarten gebruiken hetzelfde
 * splinebestand honderden keren, dus het antwoord wordt onthouden.
 */
export function splineInfo(omsiPath: string, relative: string): SplineInfo {
  const key = relative.toLowerCase()
  const known = infoCache.get(key)
  if (known) return known

  let info: SplineInfo = { kind: 'other', offsets: [], paths: [] }
  try {
    const lines = readOmsiLines(join(omsiPath, relative))
    const road: number[] = []
    const rail: number[] = []
    const paths: SplinePath[] = []
    for (let i = 0; i < lines.length; i++) {
      // blockTag en geen trim: in rail_concrete_01.sli staat de uitleg
      // ingesprongen, met "[path]" en al, en die moet niet als blok meetellen.
      // `[path_2]` is dezelfde baan met één veld extra; de DDR-straten van
      // Berlin-Spandau gebruiken alleen die, en vielen daardoor weg.
      const tag = blockTag(lines[i])
      if (tag !== '[path]' && tag !== '[path_2]') continue
      // velden: soort verkeer, zijwaartse afstand, hoogte, breedte, richting
      const type = Number.parseInt(lines[i + 1] ?? '', 10)
      const offset = num(lines[i + 2])
      paths.push({ type, offset, direction: Number.parseInt(lines[i + 5] ?? '', 10) })
      if (type === PATH_ROAD) road.push(offset)
      else if (type === PATH_RAIL) rail.push(offset)
    }
    if (road.length > 0) info = { kind: 'road', offsets: distinct(road), paths }
    else if (rail.length > 0) info = { kind: 'rail', offsets: distinct(rail), paths }
    else if (paths.some((path) => path.type === PATH_FOOT)) info = { kind: 'foot', offsets: [], paths }
  } catch {
    // Een splinebestand dat ontbreekt tekent ook in het spel niets.
  }

  infoCache.set(key, info)
  return info
}

export function splineKind(omsiPath: string, relative: string): SplineKind {
  return splineInfo(omsiPath, relative).kind
}

/** Twee rijrichtingen op dezelfde strook hoeven niet twee keer getekend. */
function distinct(offsets: number[]): number[] {
  const seen = new Set<string>()
  return offsets.filter((offset) => {
    const key = offset.toFixed(1)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Een baan die in een scenery-object ligt, in de maten van dat object. */
export interface ObjectPath {
  type: number
  /** 0 met de baan mee, 1 ertegenin, 2 beide kanten op. */
  direction: number
  x: number
  y: number
  rotationDeg: number
  length: number
  radius: number
}

const objectPathCache = new Map<string, ObjectPath[]>()

/**
 * De rijbanen in een scenery-object.
 *
 * Lang niet elke straat is een spline. Kruisingen, rotondes en keerlussen zijn
 * objecten, en Hamburg109 bouwt zijn hele binnenstad zo: `K_reeperbahn_holstenstr.sco`
 * draagt 207 rijbanen. Wie alleen splines leest ziet de straten op elke kruising
 * ophouden. Omni Navigation leest ze om die reden ook.
 *
 * Een `[path]` in een `.sco` is anders ingedeeld dan in een `.sli`: x, y, hoogte,
 * richting, straal, lengte, twee hellingen, en dan pas het soort verkeer.
 *
 * Alle banen komen mee, in volgorde, want een `.ttr` telt ze allemaal; wie
 * tekent kiest er zelf de rijbanen en sporen uit.
 */
/**
 * Draagt dit object een halte?
 *
 * Een haltepaal heeft een blok `[busstop]` in zijn `.sco`; struiken, bomen en
 * bushokjes hebben dat niet. Daarmee is een echte halte te onderscheiden van een
 * willekeurig object dat toevallig hetzelfde id draagt -- en dat komt voor: op
 * Thüringer Wald delen negen haltes hun id met een plukje struikgewas ergens
 * anders op de kaart.
 */
const busStopCache = new Map<string, boolean>()

export function isBusStopObject(omsiPath: string, relative: string): boolean {
  const key = relative.toLowerCase()
  const known = busStopCache.get(key)
  if (known !== undefined) return known

  let found = false
  if (key.endsWith('.sco')) {
    try {
      found = readOmsiLines(join(omsiPath, relative)).some((line) => blockTag(line) === '[busstop]')
    } catch {
      // Een object dat niet geïnstalleerd is, staat ook niet op de kaart.
    }
  }
  busStopCache.set(key, found)
  return found
}

export function objectPaths(omsiPath: string, relative: string): ObjectPath[] {
  const key = relative.toLowerCase()
  const known = objectPathCache.get(key)
  if (known) return known

  const paths: ObjectPath[] = []
  // Alleen objecten; een spline heeft zijn banen in een ander formaat.
  if (key.endsWith('.sco')) {
    try {
      const lines = readOmsiLines(join(omsiPath, relative))
      for (let i = 0; i < lines.length; i++) {
        if (blockTag(lines[i]) !== '[path]') continue
        paths.push({
          type: Number.parseInt(lines[i + 9] ?? '', 10),
          // Na de breedte; daarna volgt nog het knipperlicht.
          direction: Number.parseInt(lines[i + 11] ?? '', 10),
          x: num(lines[i + 1]),
          y: num(lines[i + 2]),
          rotationDeg: num(lines[i + 4]),
          radius: num(lines[i + 5]),
          length: num(lines[i + 6])
        })
      }
    } catch {
      // Een object dat niet geïnstalleerd is, tekent ook in het spel niets.
    }
  }

  objectPathCache.set(key, paths)
  return paths
}

/**
 * Legt een rijbaan uit een object op de plek waar het object staat.
 *
 * Een object draait zoals een spline: graden, noord op nul, met de klok mee, en
 * de richting van de baan telt op bij die van het object. Nagemeten met
 * `scripts/probe-objjoin.ts`: zo vallen de uiteinden van de rijbanen op de
 * rijstroken van de aansluitende splines, in elke andere combinatie niet.
 */
export function placeObjectPath(
  objectX: number,
  objectY: number,
  objectRotationDeg: number,
  path: ObjectPath
): number[] {
  const rot = (objectRotationDeg * Math.PI) / 180
  const cos = Math.cos(rot)
  const sin = Math.sin(rot)
  return splinePoints(
    objectX + path.x * cos + path.y * sin,
    objectY - path.x * sin + path.y * cos,
    objectRotationDeg + path.rotationDeg,
    path.length,
    path.radius
  )
}

/** De maten van een spline, losgepeuterd uit een blok in een tegel. */
export interface SplineShape {
  x: number
  y: number
  rotationDeg: number
  length: number
  radius: number
  /**
   * Het dwarsprofiel ligt gespiegeld: wat rechts hoort ligt links, en rijdt de
   * andere kant op. OMSI zet daarvoor een losse regel `mirror` in het blok.
   */
  mirror: boolean
}

/** Waar een baan van een spline ligt en welke kant hij op mag, spiegeling meegerekend. */
export function splineLane(shape: SplineShape, path: SplinePath): { offset: number; direction: number } {
  if (!shape.mirror) return { offset: path.offset, direction: path.direction }
  const direction = path.direction === 0 ? 1 : path.direction === 1 ? 0 : path.direction
  return { offset: -path.offset, direction }
}

/**
 * Haalt de maten uit een `[spline]`-blok.
 *
 * Er bestaan twee lay-outs naast elkaar, ook binnen dezelfde tegelversie: de
 * meeste blokken noemen na het id zowel de vorige als de volgende spline, maar
 * een deel noemt alleen de vorige en schuift daarmee alles een veld op. In
 * Rheinhausen staan ze door elkaar heen.
 *
 * Op de versie afgaan werkt dus niet; op de inhoud wel. Een koppelveld is een
 * heel getal, een coördinaat heeft decimalen, en een lengte is nooit negatief.
 * De lay-out die daaraan voldoet is de juiste.
 *
 * `mirror` staat als tekstregel achteraan, op een plek die per lay-out
 * verschilt; daarom wordt het blok tot de lege regel doorzocht. Nagemeten met
 * `scripts/probe-tracks.ts`: in Thüringer Wald rijden de routes van OMSI zelf
 * zonder deze vlag een op de zeven rijstroken tegen hun richting in.
 */
export function parseSpline(lines: string[], index: number): SplineShape | undefined {
  let mirror = false
  for (let k = index + 1; k < lines.length && k < index + 30 && lines[k].trim() !== ''; k++) {
    if (lines[k].trim().toLowerCase() === 'mirror') mirror = true
  }
  const shapes = [readAt(lines, index + 6, mirror), readAt(lines, index + 5, mirror)]
  let best: SplineShape | undefined
  let bestScore = 0
  for (const shape of shapes) {
    if (!shape) continue
    const score = plausible(shape)
    if (score > bestScore) {
      best = shape
      bestScore = score
    }
  }
  return bestScore >= 3 ? best : undefined
}

function readAt(lines: string[], at: number, mirror: boolean): SplineShape | undefined {
  const values = lines.slice(at, at + 6).map((line) => num(line))
  if (values.length < 6 || values.some((value) => !Number.isFinite(value))) return undefined
  // x, hoogte, y, richting, lengte, straal: bij een spline staat de hoogte
  // tussen de twee grondcoordinaten in, anders dan bij een object.
  return {
    x: values[0],
    y: values[2],
    rotationDeg: values[3],
    length: values[4],
    radius: values[5],
    mirror
  }
}

/** Hoeveel van de vier verwachtingen deze lezing waarmaakt. */
function plausible(shape: SplineShape): number {
  let score = 0
  if (shape.length > 0 && shape.length <= 1000) score++
  if (shape.x >= -200 && shape.x <= 600) score++
  if (shape.y >= -200 && shape.y <= 600) score++
  if (Math.abs(shape.rotationDeg) <= 1080) score++
  return score
}

/**
 * Rekent een spline om naar een lijnstuk in meters.
 *
 * OMSI legt een spline vast als beginpunt, richting, lengte en straal. De
 * richting is in graden met noord op nul en met de klok mee; een positieve
 * straal buigt naar rechts. Met die aanname klopt het eindpunt van een spline
 * tot op de millimeter met het beginpunt van de volgende — nagerekend over
 * zevenduizend koppelingen in Berlin-Spandau en Thüringer Wald.
 */
export function splinePoints(
  x: number,
  y: number,
  rotationDeg: number,
  length: number,
  radius: number,
  offset = 0
): number[] {
  const rot = (rotationDeg * Math.PI) / 180
  const sin = Math.sin(rot)
  const cos = Math.cos(rot)

  if (radius === 0 || Math.abs(radius) > STRAIGHT_RADIUS) {
    // Rechts van de rijrichting ligt (cos, -sin).
    const ox = x + offset * cos
    const oy = y - offset * sin
    return [ox, oy, ox + sin * length, oy + cos * length]
  }

  const sweep = length / radius
  const steps = Math.min(64, Math.max(2, Math.ceil(Math.abs(sweep) / ARC_STEP)))
  const points: number[] = []
  for (let i = 0; i <= steps; i++) {
    const t = (sweep * i) / steps
    // In het assenstelsel van de spline wijst vooruit naar +y en ligt het
    // middelpunt van de bocht op (straal, 0). Onderweg is de richting t verder
    // gedraaid, en een rijstrook ligt haaks op die richting.
    const localX = radius * (1 - Math.cos(t)) + offset * Math.cos(t)
    const localY = radius * Math.sin(t) - offset * Math.sin(t)
    points.push(x + localX * cos + localY * sin, y - localX * sin + localY * cos)
  }
  return points
}
