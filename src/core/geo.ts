import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { blockTag, num, readOmsiLines, str } from './omsiFile'

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

export interface MapGeometry {
  widthM: number
  heightM: number
  stops: StopPoint[]
}

/** Een OMSI-tegel is 300 meter in het vierkant. */
const TILE_M = 300

const TILE_NAME = /^tile_(-?\d+)_(-?\d+)\.map$/i

/**
 * Leest de posities van de haltes waarvan we het id kennen.
 *
 * Filteren op het bestandspad van het object zou ook kunnen, maar elke kaart
 * gebruikt andere halteobjecten. Filteren op de id's die de dienstregeling
 * noemt is zuiverder: dan komen er geen lantaarnpalen tussen, en wat je vindt is
 * per definitie een halte die gereden wordt.
 */
export function readMapGeometry(mapPath: string, wantedIds: Set<string>): MapGeometry {
  if (wantedIds.size === 0) return { widthM: 0, heightM: 0, stops: [] }

  type Raw = { id: string; tx: number; ty: number; x: number; y: number; name: string }
  const raw: Raw[] = []
  let minTx = Infinity
  let maxTx = -Infinity
  let minTy = Infinity
  let maxTy = -Infinity

  let entries: string[]
  try {
    entries = readdirSync(mapPath)
  } catch {
    return { widthM: 0, heightM: 0, stops: [] }
  }

  for (const entry of entries) {
    const match = TILE_NAME.exec(entry)
    if (!match) continue
    const tx = Number.parseInt(match[1], 10)
    const ty = Number.parseInt(match[2], 10)

    let lines: string[]
    try {
      lines = readOmsiLines(join(mapPath, entry))
    } catch {
      continue
    }

    minTx = Math.min(minTx, tx)
    maxTx = Math.max(maxTx, tx)
    minTy = Math.min(minTy, ty)
    maxTy = Math.max(maxTy, ty)

    for (let i = 0; i < lines.length; i++) {
      if (blockTag(lines[i]) !== '[object]') continue
      // velden: vlag, bestandspad, id, x, y, z, rotatie, ...
      const id = str(lines[i + 3])
      if (!wantedIds.has(id)) continue
      // De naam staat achter de getallen; pak de eerste regel die geen getal is.
      let name = ''
      for (let k = i + 10; k < i + 14 && k < lines.length; k++) {
        const candidate = str(lines[k])
        if (candidate && !/^-?\d+([.,]\d+)?$/.test(candidate)) {
          name = candidate
          break
        }
      }
      raw.push({ id, tx, ty, x: num(lines[i + 4]), y: num(lines[i + 5]), name })
    }
  }

  if (raw.length === 0 || !Number.isFinite(minTx)) return { widthM: 0, heightM: 0, stops: [] }

  const stops = raw.map((item) => ({
    id: item.id,
    x: (item.tx - minTx) * TILE_M + item.x,
    y: (item.ty - minTy) * TILE_M + item.y,
    name: item.name
  }))

  return {
    widthM: (maxTx - minTx + 1) * TILE_M,
    heightM: (maxTy - minTy + 1) * TILE_M,
    stops
  }
}
