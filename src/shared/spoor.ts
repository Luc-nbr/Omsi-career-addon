/*
 * Een route als spoor: de lijn over de weg met de afstand langs die lijn bij
 * elk punt en bij elke halte.
 *
 * Dit stond in RouteMap.tsx, voor de ene bus van de navigatie. De vlootkaart
 * (ontwerp busbedrijf-planning §8.1) zet tientallen bussen op hun route en
 * heeft dezelfde rekensom nodig, buiten React en in een proef zonder venster;
 * daarom staat hij hier, en importeert de kaart hem.
 */

/** Een route met de afstand langs de lijn bij elk punt, en bij elke halte. */
export interface Track {
  /** Plat achter elkaar: x, y, x, y, … in kaartmeters. */
  points: number[]
  cumulative: number[]
  /** Afstand langs de route bij elke halte van de rit; leeg als die halte niet op de kaart staat. */
  stops: Array<number | undefined>
}

/** Een punt op de kaart, in meters vanaf de west- en zuidrand. */
export interface Punt {
  x: number
  y: number
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}

/**
 * Legt de haltes op de route. Een rit komt vaak twee keer door dezelfde straat,
 * dus elke halte wordt pas gezocht voorbij de vorige; anders springt de bus
 * terug naar het eerste stuk.
 */
export function trackAlong(points: number[], stops: Array<Punt | undefined>): Track {
  const cumulative = [0]
  for (let i = 2; i < points.length; i += 2) {
    cumulative.push(cumulative[cumulative.length - 1] + Math.hypot(points[i] - points[i - 2], points[i + 1] - points[i - 1]))
  }
  const found: Array<number | undefined> = []
  let from = 0
  for (const stop of stops) {
    if (!stop) {
      found.push(undefined)
      continue
    }
    let best = Infinity
    let bestAlong = from
    for (let k = 1; k < cumulative.length; k++) {
      if (cumulative[k] < from) continue
      const ax = points[(k - 1) * 2]
      const ay = points[(k - 1) * 2 + 1]
      const vx = points[k * 2] - ax
      const vy = points[k * 2 + 1] - ay
      const len2 = vx * vx + vy * vy
      const t = len2 > 0 ? clamp(((stop.x - ax) * vx + (stop.y - ay) * vy) / len2, 0, 1) : 0
      const along = cumulative[k - 1] + Math.sqrt(len2) * t
      if (along < from) continue
      const distance = Math.hypot(stop.x - (ax + vx * t), stop.y - (ay + vy * t))
      if (distance < best) {
        best = distance
        bestAlong = along
      }
    }
    found.push(bestAlong)
    from = bestAlong
  }
  return { points, cumulative, stops: found }
}

/**
 * Waar een punt in de wereld op de route valt, gezocht vanaf `from`. Die
 * ondergrens is er omdat een rit dezelfde straat vaak twee keer aandoet.
 */
export function nearestAlong(track: Track, x: number, y: number, from: number): number {
  const { points, cumulative } = track
  let best = Infinity
  let bestAlong = from
  for (let k = 1; k < cumulative.length; k++) {
    if (cumulative[k] < from) continue
    const ax = points[(k - 1) * 2]
    const ay = points[(k - 1) * 2 + 1]
    const vx = points[k * 2] - ax
    const vy = points[k * 2 + 1] - ay
    const len2 = vx * vx + vy * vy
    const t = len2 > 0 ? clamp(((x - ax) * vx + (y - ay) * vy) / len2, 0, 1) : 0
    const along = cumulative[k - 1] + Math.sqrt(len2) * t
    if (along < from) continue
    const distance = Math.hypot(x - (ax + vx * t), y - (ay + vy * t))
    if (distance < best) {
      best = distance
      bestAlong = along
    }
  }
  return bestAlong
}

/**
 * Het punt op een afstand langs de route, met de rijrichting daar. Het spoor
 * moet minstens twee punten hebben.
 */
export function pointAlong(track: Track, along: number): { x: number; y: number; dx: number; dy: number } {
  const { points, cumulative } = track
  const distance = clamp(along, 0, cumulative[cumulative.length - 1])
  let low = 1
  let high = cumulative.length - 1
  while (low < high) {
    const mid = (low + high) >> 1
    if (cumulative[mid] < distance) low = mid + 1
    else high = mid
  }
  const k = low
  const span = cumulative[k] - cumulative[k - 1]
  const t = span > 0 ? (distance - cumulative[k - 1]) / span : 0
  const ax = points[(k - 1) * 2]
  const ay = points[(k - 1) * 2 + 1]
  const dx = points[k * 2] - ax
  const dy = points[k * 2 + 1] - ay
  return { x: ax + dx * t, y: ay + dy * t, dx, dy }
}
