import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { readOmsiLines, str } from './omsiFile'

/**
 * Situatiebestanden (.osn) worden alleen gelezen, nooit geschreven.
 *
 * De app zet niets meer klaar in de spelmap: de speler laadt zijn kaart en bus
 * zelf in OMSI en kiest daarna een dienst. Wat we hier nog uit een situatie
 * halen is het tijdvak van een kaart, en dat bepaalt welk wagenpark-bestand
 * geldt — Johannesstift is in 1988 code 221 en in 1994 code 161.
 */

/** Geeft de index van de regel met deze tag, of -1. */
function indexOfTag(lines: string[], tag: string): number {
  return lines.findIndex((line) => line.trim() === tag)
}

/** Wijst de kaart aan waar een situatiebestand over gaat. */
function situationMap(file: string): string {
  try {
    const lines = readOmsiLines(file)
    const index = indexOfTag(lines, '[map]')
    if (index < 0) return ''
    const match = str(lines[index + 1]).match(/maps[\\/]([^\\/]+)[\\/]/i)
    return match ? match[1] : ''
  } catch {
    return ''
  }
}

/** Heeft dit bestand een eigen voertuig? Dan is het een echt gespeelde situatie. */
function hasOwnVehicle(file: string): boolean {
  try {
    return indexOfTag(readOmsiLines(file), '[ismyVehicle]') >= 0
  } catch {
    return false
  }
}

/**
 * Zoekt een situatie die bij deze kaart hoort. OMSI bewaart na elke sessie
 * `laststn.osn` per kaart, en in `Situations/` staan de meegeleverde scenario's.
 */
export function findTemplate(omsiPath: string, mapFolder: string): string | undefined {
  const candidates: string[] = []
  const lastSituation = join(omsiPath, 'maps', mapFolder, 'laststn.osn')
  if (existsSync(lastSituation)) candidates.push(lastSituation)

  const situations = join(omsiPath, 'Situations')
  if (existsSync(situations)) {
    for (const entry of readdirSync(situations)) {
      if (entry.toLowerCase().endsWith('.osn')) candidates.push(join(situations, entry))
    }
  }

  const forThisMap = candidates.filter((file) => situationMap(file) === mapFolder)
  return forThisMap.find(hasOwnVehicle) ?? forThisMap[0]
}

/**
 * Het jaar en de dag waarin een kaart speelt. Kaarten met een Chrono-map horen
 * bij een tijdvak: Berlin-Spandau staat op 1988, HafenCity op 2016.
 */
export function readSituationTime(file: string): { year: number; dayOfYear: number } | undefined {
  try {
    const lines = readOmsiLines(file)
    const index = indexOfTag(lines, '[time]')
    if (index < 0) return undefined
    const year = Number.parseInt(str(lines[index + 1]), 10)
    const dayOfYear = Number.parseInt(str(lines[index + 2]), 10)
    if (!Number.isFinite(year) || !Number.isFinite(dayOfYear)) return undefined
    return { year, dayOfYear }
  } catch {
    return undefined
  }
}
