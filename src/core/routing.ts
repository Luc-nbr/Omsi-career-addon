import type { Lane, StopPoint } from './geo'
import { readTrackLine } from './track'

/** Verder dan dit van de route uit de .ttr ligt een halte niet, als die route klopt. */
const TRACK_STOP_M = 15

/**
 * De route van een rit over de kaart.
 *
 * Eerst de route die OMSI zelf in de `.ttr` heeft staan: dat is precies de weg
 * die de kaartmaker bedoelde. Maar alleen als hij heel is. Een `.ttr` wordt niet
 * bijgewerkt als de kaart later verandert, en dan ontbreken er banen of liggen
 * er gaten in; en een halte die er ver naast ligt, hoort bij een andere weg.
 * Anders plant de routeplanner van halte naar halte.
 */
export function routeForTrip(
  mapPath: string,
  omsiPath: string,
  tripFile: string,
  stops: StopPoint[],
  network: () => LaneNetwork
): number[] {
  const track = readTrackLine(mapPath, omsiPath, tripFile)
  if (track && track.missing === 0 && track.gaps.every((gap) => gap <= 1)) {
    const p = track.points
    const onTrack = stops.every((stop) => {
      for (let i = 2; i < p.length; i += 2) {
        if (distanceToSegment(stop.x, stop.y, p[i - 2], p[i - 1], p[i], p[i + 1]) <= TRACK_STOP_M) return true
      }
      return false
    })
    if (onTrack) return p
  }
  return network().routeStops(stops)
}

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax
  const vy = by - ay
  const len2 = vx * vx + vy * vy
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / len2)) : 0
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t))
}

/**
 * De weg van halte naar halte over de rijstroken, voor ritten zonder route.
 *
 * Het rijstrokennet is een gerichte graaf: de uiteinden van rijstroken zijn
 * knopen, een rijstrook is een pijl in de richting waarin hij bereden mag
 * worden. Welke richting dat is staat in de `.sli` en `.sco` zelf (0 mee, 1
 * tegen, 2 beide), gespiegelde splines omgedraaid; nagemeten tegen de routes die
 * OMSI zelf in zijn `.ttr`-bestanden rijdt, met `scripts/probe-tracks.ts`.
 *
 * Een halte staat naast de weg, rechts van de rijrichting. Hij hangt aan de
 * dichtstbijzijnde rijstrook waarvoor dat klopt; zo komt de bus aan de goede
 * kant van de straat binnen en rijdt hij geen stuk tegen het verkeer in.
 *
 * Alles hier volgt uit de bestandsformaten van OMSI, niet uit een bepaalde
 * kaart: wat voor de meegeleverde kaarten werkt, werkt zo ook voor een kaart die
 * iemand er later bij installeert.
 */

/** Uiteinden dichter bij elkaar dan dit zijn dezelfde knoop. */
const SNAP_M = 0.6

/** Maat van het zoekraster voor rijstroken. */
const GRID_M = 40

/** Verder dan dit van een halte ligt zijn rijstrook niet. */
const STOP_REACH_M = 30

/** Strafmeters voor een halte aan de verkeerde kant van de rijstrook. */
const WRONG_SIDE_M = 20

/** Zoveel kandidaten per halte; de goede rijstrook is niet altijd de dichtste. */
const ANCHORS = 4

/**
 * Een los uiteinde van een rijstrook sluit aan op de dichtstbijzijnde rijstrook
 * binnen deze afstand die dezelfde kant op rijdt, aan zijn uiteinde of
 * halverwege. Kaartmakers leggen niet alles precies op elkaar: een smal
 * wegprofiel dat zonder kruising overgaat in een breed, of een aftakking die
 * naast een straat begint in plaats van op een uiteinde. OMSI laat de bussen
 * daar doorrijden.
 *
 * Gemeten met `scripts/probe-routing.ts`: zonder dit vindt de planner in
 * Berlin-Spandau 978 van de 1474 haltestukken in plaats van 1392, in Thüringer
 * Wald 878 van de 1047 in plaats van 969.
 */
const LINK_M = 12

/** Dichterbij dan dit is het dezelfde plek; geen verbindingsstuk nodig. */
const JOIN_M = 1.5

/** Wat als "dezelfde kant op" telt. */
const SAME_WAY_COS = Math.cos((40 * Math.PI) / 180)

interface Anchor {
  lane: number
  /** Afstand langs de rijstrook, vanaf zijn begin in tekenrichting. */
  along: number
  forward: boolean
  penalty: number
}

interface Edge {
  /** -1 voor een verbindingsstuk tussen twee rijstroken die elkaar net missen. */
  lane: number
  to: number
  /** Van en tot waar langs de rijstrook; `from > to` is tegen de tekenrichting in. */
  from: number
  until: number
  length: number
}

/** Een knoop op een rijstrook: aan een uiteinde, of waar iets aftakt. */
interface Cut {
  along: number
  node: number
}

export class LaneNetwork {
  private readonly lanes: Lane[]
  /** Per rijstrook de afstand langs de lijn bij elk punt. */
  private readonly cumulative: Float64Array[]
  /** Per rijstrook de knopen erop, van begin naar eind. */
  private readonly cuts: Cut[][] = []
  private readonly nodeX: number[] = []
  private readonly nodeY: number[] = []
  private readonly edges: Edge[][] = []
  private readonly segments = new Map<string, number[]>()
  private readonly nodeGrid = new Map<string, number[]>()

  constructor(lanes: Lane[]) {
    this.lanes = lanes
    this.cumulative = lanes.map((lane) => {
      const p = lane.points
      const cum = new Float64Array(p.length / 2)
      for (let i = 1; i < cum.length; i++) {
        cum[i] = cum[i - 1] + Math.hypot(p[i * 2] - p[i * 2 - 2], p[i * 2 + 1] - p[i * 2 - 1])
      }
      return cum
    })

    // Knopen aan de uiteinden, en het zoekraster voor de lijnstukken.
    // Per knoop welke lijnen er komen; twee rijrichtingen op één strook delen
    // hun punten, en tellen samen als één.
    const touching = new Map<number, Set<number[]>>()
    const touch = (node: number, points: number[]): void => {
      const set = touching.get(node)
      if (set) set.add(points)
      else touching.set(node, new Set([points]))
    }
    lanes.forEach((lane, index) => {
      const p = lane.points
      const start = this.nodeAt(p[0], p[1])
      const end = this.nodeAt(p[p.length - 2], p[p.length - 1])
      touch(start, p)
      touch(end, p)
      this.cuts.push([
        { along: 0, node: start },
        { along: this.laneLength(index), node: end }
      ])
      for (let i = 2; i < p.length; i += 2) {
        const key = `${Math.floor((p[i - 2] + p[i]) / 2 / GRID_M)},${Math.floor((p[i - 1] + p[i + 1]) / 2 / GRID_M)}`
        const cell = this.segments.get(key)
        if (cell) cell.push(index, i / 2 - 1)
        else this.segments.set(key, [index, i / 2 - 1])
      }
    })

    const extra = new Map<number, Cut[]>()
    const connectors = this.joinLooseEnds(touching, extra)
    for (const [lane, cuts] of extra) {
      this.cuts[lane] = [...this.cuts[lane], ...cuts].sort((a, b) => a.along - b.along)
    }

    // Pijlen tussen opeenvolgende knopen op elke rijstrook.
    lanes.forEach((lane, index) => {
      const cuts = this.cuts[index]
      for (let k = 1; k < cuts.length; k++) {
        const a = cuts[k - 1]
        const b = cuts[k]
        const length = b.along - a.along
        if (length <= 0 || a.node === b.node) continue
        if (lane.direction !== 1) this.edges[a.node].push({ lane: index, to: b.node, from: a.along, until: b.along, length })
        if (lane.direction !== 0) this.edges[b.node].push({ lane: index, to: a.node, from: b.along, until: a.along, length })
      }
    })

    for (const [from, to] of connectors) {
      if (from === to) continue
      const length = Math.hypot(this.nodeX[to] - this.nodeX[from], this.nodeY[to] - this.nodeY[from])
      this.edges[from].push({ lane: -1, to, from: 0, until: 0, length })
    }
  }

  /**
   * De route langs een reeks haltes, als één lijn. Waar geen weg te vinden is,
   * loopt de lijn recht naar de volgende halte; dan is er op zijn minst iets.
   */
  routeStops(stops: StopPoint[]): number[] {
    const points: number[] = []
    for (let i = 1; i < stops.length; i++) {
      const a = stops[i - 1]
      const b = stops[i]
      if (Math.hypot(a.x - b.x, a.y - b.y) < 1) continue
      append(points, this.route(a, b) ?? [a.x, a.y, b.x, b.y])
    }
    return points
  }

  /** Afstand tot de dichtstbijzijnde rijstrook binnen 40 m, anders Infinity. */
  distanceToLane(x: number, y: number): number {
    let best = Infinity
    const gx = Math.floor(x / GRID_M)
    const gy = Math.floor(y / GRID_M)
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        const cell = this.segments.get(`${gx + ox},${gy + oy}`)
        if (!cell) continue
        for (let k = 0; k < cell.length; k += 2) {
          best = Math.min(best, this.project(cell[k], cell[k + 1], x, y).distance)
        }
      }
    }
    return best
  }

  /** De kortste weg van de ene halte naar de volgende, of niets. */
  route(from: StopPoint, to: StopPoint): number[] | undefined {
    const sources = this.anchors(from)
    const targets = this.anchors(to)
    if (sources.length === 0 || targets.length === 0) return undefined

    const straight = Math.hypot(from.x - to.x, from.y - to.y)
    const limit = straight * 5 + 1500
    const TARGET = this.nodeX.length

    const cost = new Float64Array(TARGET + 1).fill(Infinity)
    const via = new Array<{ from: number; edge?: Edge; source?: Anchor; exit?: Cut; target?: Anchor; entry?: Cut } | undefined>(
      TARGET + 1
    )
    const heap = new MinHeap()
    const estimate = (node: number): number =>
      Math.max(0, Math.hypot(this.nodeX[node] - to.x, this.nodeY[node] - to.y) - STOP_REACH_M)

    // Halte en volgende halte op dezelfde rijstrook, zonder knoop ertussen.
    let best = Infinity
    let direct: { source: Anchor; target: Anchor } | undefined
    for (const source of sources) {
      for (const target of targets) {
        if (target.lane !== source.lane || target.forward !== source.forward) continue
        const ahead = source.forward ? target.along - source.along : source.along - target.along
        const total = ahead + source.penalty + target.penalty
        if (ahead >= 0 && total < best) {
          best = total
          direct = { source, target }
        }
      }
      // De eerste knoop voorbij de halte, in rijrichting.
      const cuts = this.cuts[source.lane]
      const exit = source.forward
        ? cuts.find((cut) => cut.along > source.along)
        : [...cuts].reverse().find((cut) => cut.along < source.along)
      if (!exit) continue
      const g = Math.abs(exit.along - source.along) + source.penalty
      if (g < cost[exit.node]) {
        cost[exit.node] = g
        via[exit.node] = { from: -1, source, exit }
        heap.push(exit.node, g + estimate(exit.node))
      }
    }

    // Per knoop: welke doelhaltes je vandaar bereikt, en wat het laatste stuk kost.
    const entries = new Map<number, Array<{ target: Anchor; entry: Cut; cost: number }>>()
    for (const target of targets) {
      const cuts = this.cuts[target.lane]
      const entry = target.forward
        ? [...cuts].reverse().find((cut) => cut.along <= target.along)
        : cuts.find((cut) => cut.along >= target.along)
      if (!entry) continue
      const list = entries.get(entry.node) ?? []
      list.push({ target, entry, cost: Math.abs(target.along - entry.along) + target.penalty })
      entries.set(entry.node, list)
    }

    while (heap.size > 0) {
      const node = heap.pop()
      if (node === TARGET) break
      const g = cost[node]
      if (g >= best || g > limit) break
      for (const item of entries.get(node) ?? []) {
        const total = g + item.cost
        if (total < cost[TARGET]) {
          cost[TARGET] = total
          via[TARGET] = { from: node, target: item.target, entry: item.entry }
          heap.push(TARGET, total)
        }
      }
      for (const edge of this.edges[node]) {
        const next = g + edge.length
        if (next < cost[edge.to]) {
          cost[edge.to] = next
          via[edge.to] = { from: node, edge }
          heap.push(edge.to, next + estimate(edge.to))
        }
      }
    }

    if (direct && best <= cost[TARGET]) {
      return this.slice(direct.source.lane, direct.source.along, direct.target.along)
    }
    if (!Number.isFinite(cost[TARGET])) return undefined

    // Terug van het doel naar het begin, en dan in rijrichting aan elkaar.
    const pieces: number[][] = []
    const last = via[TARGET]!
    pieces.push(this.slice(last.target!.lane, last.entry!.along, last.target!.along))
    let node = last.from
    for (;;) {
      const step = via[node]!
      if (step.source) {
        pieces.push(this.slice(step.source.lane, step.source.along, step.exit!.along))
        break
      }
      const edge = step.edge!
      pieces.push(
        edge.lane < 0
          ? [this.nodeX[step.from], this.nodeY[step.from], this.nodeX[node], this.nodeY[node]]
          : this.slice(edge.lane, edge.from, edge.until)
      )
      node = step.from
    }
    pieces.reverse()
    const points: number[] = []
    for (const piece of pieces) append(points, piece)
    return points
  }

  private nodeAt(x: number, y: number): number {
    const gx = Math.floor(x / SNAP_M)
    const gy = Math.floor(y / SNAP_M)
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        for (const node of this.nodeGrid.get(`${gx + ox},${gy + oy}`) ?? []) {
          if (Math.hypot(this.nodeX[node] - x, this.nodeY[node] - y) <= SNAP_M) return node
        }
      }
    }
    const node = this.nodeX.length
    this.nodeX.push(x)
    this.nodeY.push(y)
    this.edges.push([])
    const key = `${gx},${gy}`
    const cell = this.nodeGrid.get(key)
    if (cell) cell.push(node)
    else this.nodeGrid.set(key, [node])
    return node
  }

  /**
   * Losse uiteinden aansluiten (zie LINK_M). Een uiteinde is los als er alleen
   * zijn eigen strook komt. Wie er in rijrichting uitkomt zoekt een strook om op
   * verder te rijden; wie er begint zoekt een strook om vanaf te komen. Die
   * strook krijgt op het aansluitpunt een knoop, en ertussen komt een
   * verbindingsstuk. Levert de verbindingsstukken als [van, naar].
   */
  private joinLooseEnds(
    touching: Map<number, Set<number[]>>,
    extra: Map<number, Cut[]>
  ): Array<[number, number]> {
    const connectors: Array<[number, number]> = []

    this.lanes.forEach((lane, index) => {
      const p = lane.points
      if (p.length < 4 || this.laneLength(index) <= 0) return
      const n = p.length
      for (const atStart of [true, false]) {
        const node = atStart ? this.cuts[index][0].node : this.cuts[index][1].node
        if ((touching.get(node)?.size ?? 0) !== 1) continue
        // Koers in tekenrichting, aan dit uiteinde.
        const [hx, hy] = atStart ? unit(p[2] - p[0], p[3] - p[1]) : unit(p[n - 2] - p[n - 4], p[n - 1] - p[n - 3])
        // Rijdt het verkeer hier de strook uit, of erin?
        const leaving = atStart ? lane.direction !== 0 : lane.direction !== 1
        const entering = atStart ? lane.direction !== 1 : lane.direction !== 0
        for (const outward of [true, false]) {
          if ((outward && !leaving) || (!outward && !entering)) continue
          // De koers waarin het verkeer hier rijdt.
          const sign = atStart === outward ? -1 : 1
          const tx = hx * sign
          const ty = hy * sign
          const hit = this.nearestLane(this.nodeX[node], this.nodeY[node], lane.points, tx, ty, outward)
          if (!hit) continue
          let other: number
          const cuts = this.cuts[hit.lane]
          const near = [cuts[0], cuts[cuts.length - 1]].find((cut) => Math.abs(cut.along - hit.along) < 1)
          if (near) other = near.node
          else if (hit.distance < JOIN_M) other = node
          else other = this.nodeAt(hit.x, hit.y)
          if (!near) {
            const list = extra.get(hit.lane) ?? []
            list.push({ along: hit.along, node: other })
            extra.set(hit.lane, list)
          }
          if (other !== node) connectors.push(outward ? [node, other] : [other, node])
        }
      }
    })
    return connectors
  }

  /** Het punt op een rijstrook op een afstand langs de lijn. */
  private pointAt(lane: number, distance: number): [number, number] {
    const p = this.lanes[lane].points
    const cum = this.cumulative[lane]
    let i = 1
    while (i < cum.length - 1 && cum[i] < distance) i++
    const span = cum[i] - cum[i - 1]
    const t = span > 0 ? (distance - cum[i - 1]) / span : 0
    return [
      p[(i - 1) * 2] + (p[i * 2] - p[(i - 1) * 2]) * t,
      p[(i - 1) * 2 + 1] + (p[i * 2 + 1] - p[(i - 1) * 2 + 1]) * t
    ]
  }

  /**
   * De dichtstbijzijnde strook binnen LINK_M waarop verkeer in koers (tx, ty)
   * rijdt. Voor wie een strook uitrijdt moet het aansluitpunt niet achter hem
   * liggen; voor wie er een inrijdt niet voor hem.
   */
  private nearestLane(
    x: number,
    y: number,
    ownPoints: number[],
    tx: number,
    ty: number,
    outward: boolean
  ): { lane: number; along: number; distance: number; x: number; y: number } | undefined {
    let best: { lane: number; along: number; distance: number; x: number; y: number } | undefined
    const gx = Math.floor(x / GRID_M)
    const gy = Math.floor(y / GRID_M)
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        const cell = this.segments.get(`${gx + ox},${gy + oy}`)
        if (!cell) continue
        for (let k = 0; k < cell.length; k += 2) {
          const lane = cell[k]
          // De eigen strook, of zijn tegenrichting op dezelfde punten, telt niet.
          if (this.lanes[lane].points === ownPoints) continue
          const hit = this.project(lane, cell[k + 1], x, y)
          if (hit.distance > LINK_M || (best && hit.distance >= best.distance)) continue
          const cos = hit.dx * tx + hit.dy * ty
          const direction = this.lanes[lane].direction
          const allowed = cos >= SAME_WAY_COS ? direction !== 1 : cos <= -SAME_WAY_COS ? direction !== 0 : false
          if (!allowed) continue
          const px = hit.x - x
          const py = hit.y - y
          const ahead = px * tx + py * ty
          if (outward ? ahead < -1 : ahead > 1) continue
          best = { lane, along: hit.along, distance: hit.distance, x: hit.x, y: hit.y }
        }
      }
    }
    return best
  }

  /** Waar een punt op een lijnstuk van een rijstrook neerkomt. */
  private project(
    lane: number,
    seg: number,
    x: number,
    y: number
  ): { along: number; distance: number; dx: number; dy: number; left: boolean; x: number; y: number } {
    const p = this.lanes[lane].points
    const ax = p[seg * 2]
    const ay = p[seg * 2 + 1]
    const vx = p[seg * 2 + 2] - ax
    const vy = p[seg * 2 + 3] - ay
    const len2 = vx * vx + vy * vy
    const len = Math.sqrt(len2)
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / len2)) : 0
    return {
      along: this.cumulative[lane][seg] + len * t,
      distance: Math.hypot(x - (ax + vx * t), y - (ay + vy * t)),
      x: ax + vx * t,
      y: ay + vy * t,
      dx: len > 0 ? vx / len : 0,
      dy: len > 0 ? vy / len : 0,
      // Positief kruisproduct: het punt ligt links van de tekenrichting.
      left: vx * (y - ay) - vy * (x - ax) > 0
    }
  }

  private laneLength(lane: number): number {
    const cum = this.cumulative[lane]
    return cum[cum.length - 1]
  }

  /** Rijstroken bij een halte, beste eerst. */
  private anchors(stop: StopPoint): Anchor[] {
    const found = new Map<string, Anchor>()
    const gx = Math.floor(stop.x / GRID_M)
    const gy = Math.floor(stop.y / GRID_M)
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        const cell = this.segments.get(`${gx + ox},${gy + oy}`)
        if (!cell) continue
        for (let k = 0; k < cell.length; k += 2) {
          const lane = cell[k]
          const hit = this.project(lane, cell[k + 1], stop.x, stop.y)
          if (hit.distance > STOP_REACH_M) continue
          const direction = this.lanes[lane].direction
          for (const forward of [true, false]) {
            if ((forward && direction === 1) || (!forward && direction === 0)) continue
            const rightSide = forward ? !hit.left : hit.left
            const penalty = hit.distance + (rightSide ? 0 : WRONG_SIDE_M)
            const key = `${lane}|${forward}`
            const known = found.get(key)
            if (!known || penalty < known.penalty) found.set(key, { lane, along: hit.along, forward, penalty })
          }
        }
      }
    }
    return [...found.values()].sort((a, b) => a.penalty - b.penalty).slice(0, ANCHORS)
  }

  /** Het stuk rijstrook tussen twee afstanden, in de volgorde van `from` naar `to`. */
  private slice(lane: number, from: number, to: number): number[] {
    const p = this.lanes[lane].points
    const cum = this.cumulative[lane]
    const low = Math.min(from, to)
    const high = Math.max(from, to)
    const out: number[] = [...this.pointAt(lane, low)]
    for (let i = 1; i < cum.length - 1; i++) {
      if (cum[i] > low && cum[i] < high) out.push(p[i * 2], p[i * 2 + 1])
    }
    out.push(...this.pointAt(lane, high))
    if (from <= to) return out
    const reversed: number[] = []
    for (let i = out.length - 2; i >= 0; i -= 2) reversed.push(out[i], out[i + 1])
    return reversed
  }
}

/** Plakt een stuk aan een lijn, zonder het gedeelde punt dubbel op te nemen. */
function append(points: number[], piece: number[]): void {
  const skip =
    points.length > 0 &&
    piece.length >= 2 &&
    Math.hypot(points[points.length - 2] - piece[0], points[points.length - 1] - piece[1]) < 0.01
  for (let i = skip ? 2 : 0; i < piece.length; i++) points.push(piece[i])
}

function unit(x: number, y: number): [number, number] {
  const length = Math.hypot(x, y)
  return length > 0 ? [x / length, y / length] : [0, 0]
}

/** Een eenvoudige binaire hoop; dubbele vermeldingen worden bij het uitlezen overgeslagen. */
class MinHeap {
  private readonly nodes: number[] = []
  private readonly keys: number[] = []

  get size(): number {
    return this.nodes.length
  }

  push(node: number, key: number): void {
    this.nodes.push(node)
    this.keys.push(key)
    let i = this.nodes.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (this.keys[parent] <= this.keys[i]) break
      this.swap(i, parent)
      i = parent
    }
  }

  pop(): number {
    const top = this.nodes[0]
    const lastNode = this.nodes.pop()!
    const lastKey = this.keys.pop()!
    if (this.nodes.length > 0) {
      this.nodes[0] = lastNode
      this.keys[0] = lastKey
      let i = 0
      for (;;) {
        const left = i * 2 + 1
        const right = left + 1
        let smallest = i
        if (left < this.keys.length && this.keys[left] < this.keys[smallest]) smallest = left
        if (right < this.keys.length && this.keys[right] < this.keys[smallest]) smallest = right
        if (smallest === i) break
        this.swap(i, smallest)
        i = smallest
      }
    }
    return top
  }

  private swap(a: number, b: number): void {
    ;[this.nodes[a], this.nodes[b]] = [this.nodes[b], this.nodes[a]]
    ;[this.keys[a], this.keys[b]] = [this.keys[b], this.keys[a]]
  }
}
