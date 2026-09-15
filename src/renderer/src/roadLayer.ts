import type { MapGeometry } from '../../core/geo'

/**
 * Het wegennet op een canvas in plaats van in de SVG.
 *
 * Sinds de kruisingen per rijstrook meekomen heeft een stad als HamburgLi20
 * twintigduizend lijnen. Als één SVG-pad in een groep met een transform tekent
 * Chromium die bij elke muisbeweging helemaal opnieuw: 350 ms per beeld. Hier
 * gaat het in twee stappen omlaag:
 *
 * - Ingezoomd: het net is in vakken van 300 m verdeeld en alleen de vakken in
 *   beeld worden getekend. Meerijden kost zo 5 ms per beeld.
 * - Uitgezoomd liggen bijna alle vakken in beeld. Past de hele kaart dan in een
 *   plaatje, dan wordt dat eenmaal per zoomstand getekend en bij slepen alleen
 *   verschoven.
 */

/** Maat van een vak; gelijk aan een OMSI-tegel. */
const CELL_M = 300

/** Grootste buffer die we aandurven; GPU's houden ergens bij 8 à 16 duizend op. */
const CACHE_MAX_PX = 4096

/** Lucht rond de kaart in de buffer, zodat de stoeprand aan de rand niet wegvalt. */
const CACHE_PAD_M = 40

/*
 * De wegen. Het verschil tussen omranding en wegdek doet het werk: daardoor
 * springt een doorgaande weg eruit tussen de zijstraten, zoals op elke
 * navigatiekaart.
 */
const CASING = '#212833'
/*
 * Drie breedtes, en de brede iets lichter dan de smalle. Dat laatste doet meer
 * dan het lijkt: een doorgaande weg valt dan op tussen de zijstraten zonder dat
 * er ook maar iets bij staat geschreven.
 */
const ROAD = ['#333b47', '#3c4552', '#495261']
const RAIL = '#2b323c'

/** Ondergrens per klasse, zodat een straat uitgezoomd niet wegvalt. */
const MIN_PX = [4, 6, 8.5]

/**
 * Welke van de drie een baan is, naar zijn breedte in meters.
 *
 * Een rijstrook van drie meter is een woonstraat, drieënhalf is de gewone maat,
 * en wat breder is hoort bij een weg waar je doorheen rijdt. Zegt het
 * splinebestand niets, dan is het de gewone maat.
 */
export function roadClass(width: number | undefined): number {
  if (!width || !(width > 0)) return 1
  if (width <= 3.1) return 0
  if (width <= 4.2) return 1
  return 2
}

interface Chunk {
  minX: number
  minY: number
  maxX: number
  maxY: number
  /** Eén pad per breedteklasse; ze worden apart gestreken. */
  road?: (Path2D | undefined)[]
  rail?: Path2D
}

export interface RoadView {
  /** Middelpunt in meters. */
  cx: number
  cy: number
  /** Meters per CSS-pixel. */
  mpp: number
  /** Afmeting in CSS-pixels. */
  w: number
  h: number
  /** Beeldpunten per CSS-pixel. */
  dpr: number
  /** Koers die boven in beeld staat, in graden; nul is noord boven. */
  rotation?: number
}

/**
 * Van kaartmeters naar beeldpunten, met de draaiing erin:
 * scherm = midden + R(-koers) · (punt - middelpunt) / mpp, y omlaag.
 */
function worldMatrix(view: RoadView): [number, number, number, number, number, number] {
  const k = view.dpr / view.mpp
  const r = ((view.rotation ?? 0) * Math.PI) / 180
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  const a = k * cos
  const b = -k * sin
  const c = -k * sin
  const d = -k * cos
  const e = (view.dpr * view.w) / 2 - k * (view.cx * cos - view.cy * sin)
  const f = (view.dpr * view.h) / 2 + k * (view.cx * sin + view.cy * cos)
  return [a, b, c, d, e, f]
}

export class RoadLayer {
  private readonly chunks: Chunk[]
  private readonly bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  private cache?: { canvas: HTMLCanvasElement; pxPerM: number }

  constructor(geometry: MapGeometry) {
    const cells = new Map<string, Chunk>()
    for (const line of geometry.roads) {
      const p = line.points
      if (p.length < 4) continue
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      for (let i = 0; i < p.length; i += 2) {
        if (p[i] < minX) minX = p[i]
        if (p[i] > maxX) maxX = p[i]
        if (p[i + 1] < minY) minY = p[i + 1]
        if (p[i + 1] > maxY) maxY = p[i + 1]
      }
      // Een lijn hoort bij het vak van zijn midden; het vak groeit mee met wat
      // er uitsteekt, dus wegknippen gebeurt nooit te vroeg.
      const key = `${Math.floor((minX + maxX) / 2 / CELL_M)},${Math.floor((minY + maxY) / 2 / CELL_M)}`
      let chunk = cells.get(key)
      if (!chunk) {
        chunk = { minX, minY, maxX, maxY }
        cells.set(key, chunk)
      }
      chunk.minX = Math.min(chunk.minX, minX)
      chunk.minY = Math.min(chunk.minY, minY)
      chunk.maxX = Math.max(chunk.maxX, maxX)
      chunk.maxY = Math.max(chunk.maxY, maxY)

      let path: Path2D
      if (line.kind === 'rail') {
        path = chunk.rail ??= new Path2D()
      } else {
        const klasse = roadClass(line.w)
        const wegen = (chunk.road ??= [])
        path = wegen[klasse] ??= new Path2D()
      }
      path.moveTo(p[0], p[1])
      for (let i = 2; i < p.length; i += 2) path.lineTo(p[i], p[i + 1])

      this.bounds.minX = Math.min(this.bounds.minX, minX)
      this.bounds.minY = Math.min(this.bounds.minY, minY)
      this.bounds.maxX = Math.max(this.bounds.maxX, maxX)
      this.bounds.maxY = Math.max(this.bounds.maxY, maxY)
    }
    this.chunks = [...cells.values()]
  }

  /**
   * Tekent het net zoals het in beeld hoort.
   *
   * Met `exact` uit mag een buffer van een andere zoomstand geschaald worden
   * gebruikt; dat is wazig maar direct, en bedoeld voor tijdens het zoomen.
   */
  draw(ctx: CanvasRenderingContext2D, view: RoadView, exact: boolean): void {
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
    if (this.chunks.length === 0) return

    const pxPerM = view.dpr / view.mpp
    const { minX, minY, maxX, maxY } = this.bounds
    const fullW = (maxX - minX + CACHE_PAD_M * 2) * pxPerM
    const fullH = (maxY - minY + CACHE_PAD_M * 2) * pxPerM

    if (fullW <= CACHE_MAX_PX && fullH <= CACHE_MAX_PX) {
      if (!this.cache || (exact && this.cache.pxPerM !== pxPerM)) {
        this.cache = this.render(pxPerM, view.mpp, fullW, fullH)
      }
      this.blit(ctx, view)
      return
    }

    // Te groot voor een buffer: dan is er genoeg ingezoomd om per vak te tekenen.
    ctx.setTransform(...worldMatrix(view))
    // Gedraaid valt een hoek van het beeld verder weg; dan de halve diagonaal als rand.
    const rotated = (view.rotation ?? 0) % 360 !== 0
    const radius = (Math.hypot(view.w, view.h) / 2) * view.mpp + 30
    const marginX = rotated ? radius : (view.w / 2) * view.mpp + 30
    const marginY = rotated ? radius : (view.h / 2) * view.mpp + 30
    const visible = this.chunks.filter(
      (chunk) =>
        chunk.maxX > view.cx - marginX &&
        chunk.minX < view.cx + marginX &&
        chunk.maxY > view.cy - marginY &&
        chunk.minY < view.cy + marginY
    )
    stroke(ctx, visible, view.mpp)
  }

  private render(pxPerM: number, mpp: number, width: number, height: number): { canvas: HTMLCanvasElement; pxPerM: number } {
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(width)
    canvas.height = Math.ceil(height)
    const ctx = canvas.getContext('2d')
    if (ctx) {
      const left = this.bounds.minX - CACHE_PAD_M
      const top = this.bounds.maxY + CACHE_PAD_M
      ctx.setTransform(pxPerM, 0, 0, -pxPerM, -left * pxPerM, top * pxPerM)
      stroke(ctx, this.chunks, mpp)
    }
    return { canvas, pxPerM }
  }

  private blit(ctx: CanvasRenderingContext2D, view: RoadView): void {
    const cache = this.cache
    if (!cache) return
    const left = this.bounds.minX - CACHE_PAD_M
    const top = this.bounds.maxY + CACHE_PAD_M
    ctx.imageSmoothingEnabled = true
    // Een beeldpunt (u, v) van de buffer is kaartpunt (left + u/p, top - v/p).
    const [a, b, c, d, e, f] = worldMatrix(view)
    const p = cache.pxPerM
    ctx.setTransform(a / p, b / p, -c / p, -d / p, a * left + c * top + e, b * left + d * top + f)
    ctx.drawImage(cache.canvas, 0, 0)
  }
}

/**
 * Spoor onderop, dan alle stoepranden, dan alle wegdekken.
 *
 * Die volgorde is het hele trucje: alle omrandingen eerst, daarna alle dekken
 * eroverheen. Zo loopt een kruising door in plaats van dat er een randje dwars
 * over de straat ligt. Binnen elke ronde het breedst eerst, zodat een zijstraat
 * netjes op een doorgaande weg uitkomt.
 */
function stroke(ctx: CanvasRenderingContext2D, chunks: Chunk[], mpp: number): void {
  const railWidth = Math.max(3, mpp * 0.7)
  // De baan is in meters bekend; een strook van 3,5 m hoort 3,5 m breed te zijn.
  const breedte = (klasse: number): number => Math.max(MIN_PX[klasse], (3 + klasse) / mpp)

  ctx.lineCap = 'butt'
  ctx.lineJoin = 'miter'
  ctx.setLineDash([7, 6])
  ctx.strokeStyle = RAIL
  ctx.lineWidth = railWidth
  for (const chunk of chunks) if (chunk.rail) ctx.stroke(chunk.rail)
  ctx.setLineDash([])

  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = CASING
  for (let klasse = 2; klasse >= 0; klasse--) {
    ctx.lineWidth = breedte(klasse) + 2.5
    for (const chunk of chunks) {
      const path = chunk.road?.[klasse]
      if (path) ctx.stroke(path)
    }
  }
  for (let klasse = 2; klasse >= 0; klasse--) {
    ctx.strokeStyle = ROAD[klasse]
    ctx.lineWidth = breedte(klasse)
    for (const chunk of chunks) {
      const path = chunk.road?.[klasse]
      if (path) ctx.stroke(path)
    }
  }
}
