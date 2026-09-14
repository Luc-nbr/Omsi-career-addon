import { readTileGrid, type TileGrid } from './geo'
import type { MemoryData } from './live'
import { readTileList } from './track'

/**
 * Waar de bus van de speler op de kaart staat, uit wat de plugin in het geheugen
 * van OMSI las: een tegelnummer en een positie binnen die tegel.
 *
 * Het tegelnummer is de volgorde in global.cfg, dezelfde als in de .ttr-routes.
 * De positie is een Direct3D-vector. Welke van zijn assen naar het noorden wijst
 * staat nergens beschreven; Direct3D heeft normaal y omhoog en dan is z het
 * noorden. Om er niet op te hoeven gokken kijkt de tracker bij elke meting welke
 * lezing op een rijstrook valt, en houdt die aan zodra een van beide duidelijk
 * wint. Een bus staat vrijwel altijd op de weg.
 */
export interface VehiclePosition {
  x: number
  y: number
  /** Koers in graden, noord nul, met de klok mee. */
  heading: number
  /** Of de koers uit de beweging komt (betrouwbaar) of uit de stand van de bus. */
  headingFromMotion: boolean
}

/** Zoveel keer moet een as duidelijk winnen voordat hij vastligt. */
const AXIS_VOTES = 5
/** Pas vanaf deze verplaatsing telt de beweging als koers. */
const MOTION_M = 1.5

export class VehicleTracker {
  private readonly tiles: Array<{ tx: number; ty: number }>
  private readonly grid: TileGrid | undefined
  private axis: 'z' | 'y' | undefined
  private readonly votes = { z: 0, y: 0 }
  private last?: { x: number; y: number }
  private heading = 0
  private headingFromMotion = false
  /** Welk teken van de draaiing klopt; vastgesteld aan de hand van de beweging. */
  private quaternionSign = 1

  constructor(mapPath: string) {
    this.grid = readTileGrid(mapPath)
    let tiles: Array<{ tx: number; ty: number }> = []
    try {
      tiles = readTileList(mapPath)
    } catch {
      // Zonder tegellijst geen positie; de rest van de overlay werkt gewoon.
    }
    this.tiles = tiles
  }

  update(mem: MemoryData | undefined, distanceToLane: (x: number, y: number) => number): VehiclePosition | undefined {
    if (!mem || mem.ok !== 1 || !this.grid) return undefined
    const tile = this.tiles[mem.tile]
    if (!tile) return undefined
    const [dx, dy] = this.grid.offset(tile.tx, tile.ty)
    const viaZ = { x: dx + mem.x, y: dy + mem.z }
    const viaY = { x: dx + mem.x, y: dy + mem.y }

    if (!this.axis) {
      const dz = distanceToLane(viaZ.x, viaZ.y)
      const dyDist = distanceToLane(viaY.x, viaY.y)
      if (dz < 8 && dyDist > 20) this.votes.z++
      else if (dyDist < 8 && dz > 20) this.votes.y++
      if (this.votes.z >= AXIS_VOTES) this.axis = 'z'
      else if (this.votes.y >= AXIS_VOTES) this.axis = 'y'
    }
    // Zolang het niet vastligt: Direct3D-gewoonte, y omhoog en z naar het noorden.
    const point = this.axis === 'y' ? viaY : viaZ

    const quaternionHeading = this.fromQuaternion(mem)
    if (this.last) {
      const mx = point.x - this.last.x
      const my = point.y - this.last.y
      const moved = Math.hypot(mx, my)
      if (moved >= MOTION_M && moved < 60) {
        this.heading = (Math.atan2(mx, my) * 180) / Math.PI
        this.headingFromMotion = true
        // Het teken van de draaiing ijken aan de beweging: welk van beide klopt?
        const plain = angleGap(quaternionHeading, this.heading)
        const flipped = angleGap(-quaternionHeading, this.heading)
        this.quaternionSign = flipped + 20 < plain ? -1 : plain + 20 < flipped ? 1 : this.quaternionSign
        this.last = point
      } else if (moved >= 60) {
        // Verzet of een andere tegel geladen: geen beweging, opnieuw beginnen.
        this.last = point
        this.headingFromMotion = false
      }
    } else {
      this.last = point
    }
    if (!this.headingFromMotion) this.heading = quaternionHeading * this.quaternionSign

    return { x: point.x, y: point.y, heading: normalize(this.heading), headingFromMotion: this.headingFromMotion }
  }

  /**
   * Koers uit de draaiing van de bus: de voorwaartse as (0, 0, 1) gedraaid met
   * het quaternion, bij y omhoog. Het teken wordt geijkt zodra de bus rijdt.
   */
  private fromQuaternion(mem: MemoryData): number {
    const { qx, qy, qz, qw } = mem
    const fx = 2 * (qx * qz + qw * qy)
    const fz = 1 - 2 * (qx * qx + qy * qy)
    return (Math.atan2(fx, fz) * 180) / Math.PI
  }
}

function normalize(degrees: number): number {
  return ((degrees % 360) + 360) % 360
}

function angleGap(a: number, b: number): number {
  const gap = Math.abs(normalize(a) - normalize(b))
  return gap > 180 ? 360 - gap : gap
}
