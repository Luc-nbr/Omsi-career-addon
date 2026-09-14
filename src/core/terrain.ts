import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * De hoogtes van een tegel.
 *
 * Naast elke `tile_X_Y.map` staat een `.map.terrain`: vier bytes kop en daarna
 * 61 bij 61 kommagetallen, de hoogte op een raster over de tegel. De x-as is de
 * kolom, de z-as de rij, en de afstand tussen de punten is de tegelgrootte
 * gedeeld door zestig -- op kaarten met wereldcoördinaten is een tegel geen 300
 * meter, en dan schuift het raster mee.
 *
 * Nagerekend tegen de bussen die OMSI zelf in `laststn.osn` heeft weggeschreven:
 * Thüringer Wald 6 cm ernaast, Hamburg exact, Berlin-Spandau 8 cm.
 */
const SIDE = 61
const STEPS = SIDE - 1

const cache = new Map<string, Float32Array | undefined>()

function readTile(mapPath: string, tx: number, ty: number): Float32Array | undefined {
  const key = `${mapPath}|${tx}|${ty}`
  if (cache.has(key)) return cache.get(key)

  let grid: Float32Array | undefined
  try {
    const raw = readFileSync(join(mapPath, `tile_${tx}_${ty}.map.terrain`))
    if (raw.length >= 4 + SIDE * SIDE * 4) {
      grid = new Float32Array(SIDE * SIDE)
      for (let i = 0; i < grid.length; i++) grid[i] = raw.readFloatLE(4 + i * 4)
    }
  } catch {
    grid = undefined
  }
  cache.set(key, grid)
  return grid
}

/**
 * De hoogte binnen een tegel, op de plek die OMSI zelf ook zou aanhouden.
 * `undefined` als de tegel geen hoogtebestand heeft.
 */
export function terrainHeight(
  mapPath: string,
  tx: number,
  ty: number,
  localX: number,
  localZ: number,
  tileSize: number
): number | undefined {
  const grid = readTile(mapPath, tx, ty)
  if (!grid) return undefined

  const spacing = tileSize / STEPS
  const cx = Math.min(Math.max(localX / spacing, 0), STEPS - 0.0001)
  const cz = Math.min(Math.max(localZ / spacing, 0), STEPS - 0.0001)
  const i = Math.floor(cx)
  const j = Math.floor(cz)
  const fx = cx - i
  const fz = cz - j
  const at = (x: number, z: number): number => grid[z * SIDE + x]
  return (
    at(i, j) * (1 - fx) * (1 - fz) +
    at(i + 1, j) * fx * (1 - fz) +
    at(i, j + 1) * (1 - fx) * fz +
    at(i + 1, j + 1) * fx * fz
  )
}
