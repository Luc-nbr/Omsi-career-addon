import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * Wat de app de vorige keer in de OMSI-map zag staan.
 *
 * Kaarten en bussen zet je erbij door een map neer te zetten; er is geen
 * installatieprogramma dat het ergens meldt. De app leest die mappen bij het
 * starten en onthoudt wat er stond, zodat ze bij een volgende keer kijken kan
 * zeggen wat er nieuw is -- en niet alleen dat er nu vierentwintig kaarten zijn.
 */
export interface KnownContent {
  /** Mapnamen van de kaarten, zoals ze in `maps/` heten. */
  maps: string[]
  /** Mapnamen van de bussen, zoals ze in `Vehicles/` heten. */
  buses: string[]
}

/** Wat er bij is gekomen en wat er weg is, tussen twee keer kijken. */
export interface Difference {
  added: string[]
  removed: string[]
}

function knownPath(userDataPath: string): string {
  return join(userDataPath, 'installed.json')
}

/**
 * Wat de app eerder zag, of niets als er nog nooit gekeken is. Het verschil
 * telt: de eerste keer is alles "nieuw", en dat is geen nieuws.
 */
export function readKnown(userDataPath: string): KnownContent | undefined {
  try {
    const raw = JSON.parse(readFileSync(knownPath(userDataPath), 'utf8')) as Partial<KnownContent>
    if (!Array.isArray(raw.maps) || !Array.isArray(raw.buses)) return undefined
    return {
      maps: raw.maps.filter((item): item is string => typeof item === 'string'),
      buses: raw.buses.filter((item): item is string => typeof item === 'string')
    }
  } catch {
    return undefined
  }
}

export function writeKnown(userDataPath: string, known: KnownContent): void {
  const path = knownPath(userDataPath)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(
    path,
    `${JSON.stringify({ maps: [...known.maps].sort(), buses: [...known.buses].sort() }, undefined, 2)}\n`,
    'utf8'
  )
}

/** Wat er in `now` staat en niet in `before`, en andersom. */
export function difference(before: string[], now: string[]): Difference {
  const had = new Set(before)
  const has = new Set(now)
  return {
    added: now.filter((item) => !had.has(item)),
    removed: before.filter((item) => !has.has(item))
  }
}
