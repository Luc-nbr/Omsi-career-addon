import { join } from 'node:path'
import { num, readOmsiLines } from './omsiFile'

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

const kindCache = new Map<string, SplineKind>()

/**
 * Zoekt op of er een rijbaan op deze spline ligt. Kaarten gebruiken hetzelfde
 * splinebestand honderden keren, dus het antwoord wordt onthouden.
 */
export function splineKind(omsiPath: string, relative: string): SplineKind {
  const key = relative.toLowerCase()
  const known = kindCache.get(key)
  if (known) return known

  let kind: SplineKind = 'other'
  try {
    const lines = readOmsiLines(join(omsiPath, relative))
    let road = false
    let rail = false
    let foot = false
    for (let i = 0; i < lines.length; i++) {
      // Geen trim: in rail_concrete_01.sli staat de uitleg ingesprongen, met
      // "[path]" en al, en die moet niet als blok meetellen.
      if (lines[i] !== '[path]') continue
      const type = Number.parseInt(lines[i + 1] ?? '', 10)
      if (type === 0) road = true
      else if (type === 1) foot = true
      else if (type === 2) rail = true
    }
    kind = road ? 'road' : rail ? 'rail' : foot ? 'foot' : 'other'
  } catch {
    kind = 'other'
  }

  kindCache.set(key, kind)
  return kind
}

/** De maten van een spline, losgepeuterd uit een blok in een tegel. */
export interface SplineShape {
  x: number
  y: number
  rotationDeg: number
  length: number
  radius: number
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
 */
export function parseSpline(lines: string[], index: number): SplineShape | undefined {
  const shapes = [readAt(lines, index + 6), readAt(lines, index + 5)]
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

function readAt(lines: string[], at: number): SplineShape | undefined {
  const values = lines.slice(at, at + 6).map((line) => num(line))
  if (values.length < 6 || values.some((value) => !Number.isFinite(value))) return undefined
  // x, hoogte, y, richting, lengte, straal: bij een spline staat de hoogte
  // tussen de twee grondcoordinaten in, anders dan bij een object.
  return {
    x: values[0],
    y: values[2],
    rotationDeg: values[3],
    length: values[4],
    radius: values[5]
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
  radius: number
): number[] {
  const rot = (rotationDeg * Math.PI) / 180
  const sin = Math.sin(rot)
  const cos = Math.cos(rot)

  if (radius === 0 || Math.abs(radius) > STRAIGHT_RADIUS) {
    return [x, y, x + sin * length, y + cos * length]
  }

  const sweep = length / radius
  const steps = Math.min(64, Math.max(2, Math.ceil(Math.abs(sweep) / ARC_STEP)))
  const points: number[] = []
  for (let i = 0; i <= steps; i++) {
    const t = (sweep * i) / steps
    // In het assenstelsel van de spline wijst vooruit naar +y en ligt het
    // middelpunt van de bocht op (straal, 0).
    const localX = radius * (1 - Math.cos(t))
    const localY = radius * Math.sin(t)
    points.push(x + localX * cos + localY * sin, y - localX * sin + localY * cos)
  }
  return points
}
