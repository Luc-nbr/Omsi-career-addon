import type { StopPoint, TileGrid } from './geo'
import type { LaneNetwork } from './routing'
import { terrainHeight } from './terrain'

/** Waar de bus komt te staan, in de maat die een situatiebestand gebruikt. */
export interface Spawn {
  tx: number
  ty: number
  x: number
  z: number
  height: number
  /** Koers in graden, noord nul, met de klok mee. */
  heading: number
  /** Hoe ver van de halte de bus terechtkomt; boven een meter of tien is het raak. */
  offsetM: number
}

/**
 * De plek bij een halte waar de bus neergezet wordt: op de rijstrook waar een
 * bus daar zou stoppen, met de neus in de rijrichting, en op de hoogte van het
 * terrein -- anders zakt hij erdoorheen of zweeft hij erboven.
 */
export function spawnAtStop(
  mapPath: string,
  grid: TileGrid,
  network: LaneNetwork,
  stop: StopPoint
): Spawn | undefined {
  const place = network.spawnAt(stop)
  if (!place) return undefined

  const tile = grid.at(place.x, place.y)
  const height = terrainHeight(
    mapPath,
    tile.tx,
    tile.ty,
    tile.localX,
    tile.localZ,
    grid.size(tile.ty)
  )
  if (height === undefined) return undefined

  return {
    tx: tile.tx,
    ty: tile.ty,
    x: tile.localX,
    z: tile.localZ,
    height,
    heading: place.heading,
    offsetM: Math.hypot(place.x - stop.x, place.y - stop.y)
  }
}
