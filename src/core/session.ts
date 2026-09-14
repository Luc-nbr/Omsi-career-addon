import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { num, readOmsiLines, str } from './omsiFile'

/**
 * Wat OMSI zelf over een sessie prijsgeeft.
 *
 * Bij het afsluiten schrijft OMSI de hele wereldtoestand naar
 * `maps/<kaart>/laststn.osn`, inclusief de variabelen van je eigen bus. Daar
 * staat de kilometerteller in, en de vertraging die de IBIS toont. Door die
 * waarden voor en na de sessie te lezen weet de app wat er werkelijk gereden is,
 * zonder plugin en zonder dat de speler iets hoeft in te voeren.
 */
export interface SessionState {
  /** Naam van de situatie, waarmee we onze eigen dienst herkennen. */
  situationName: string
  /** Kilometerstand van de bus. */
  odometerKm: number
  /** Klok in het spel, in minuten na middernacht. */
  clockMinutes: number
  year: number
  dayOfYear: number
  vehiclePath: string
  /** Vertraging volgens de IBIS, in minuten. Negatief betekent te vroeg. */
  delayMinutes?: number
}

/** Waarde van een variabele uit een `[vars]`- of `[stringvars]`-blok. */
function readNamedValue(lines: string[], tag: string, name: string): string | undefined {
  const start = lines.findIndex((line) => line.trim() === tag)
  if (start < 0) return undefined
  const count = Number.parseInt(str(lines[start + 1]), 10)
  if (!Number.isFinite(count)) return undefined
  for (let i = 0; i < count; i++) {
    const at = start + 2 + i * 2
    if (str(lines[at]) === name) return lines[at + 1]
  }
  return undefined
}

function blockValues(lines: string[], tag: string, count: number): string[] {
  const index = lines.findIndex((line) => line.trim() === tag)
  return index < 0 ? [] : lines.slice(index + 1, index + 1 + count)
}

/**
 * Leest de toestand uit een situatiebestand.
 *
 * De kilometerstand staat op twee plekken: als veld 14 van het `[vehicle]`-blok
 * en als `kmcounter_km` plus `kmcounter_m` in de variabelen. De variabelen zijn
 * nauwkeuriger, dus die gaan voor.
 */
export function readSessionState(file: string): SessionState | undefined {
  if (!existsSync(file)) return undefined
  let lines: string[]
  try {
    lines = readOmsiLines(file)
  } catch {
    return undefined
  }

  const vehicle = blockValues(lines, '[vehicle]', 15)
  if (vehicle.length === 0) return undefined

  const km = readNamedValue(lines, '[vars]', 'kmcounter_km')
  const metres = readNamedValue(lines, '[vars]', 'kmcounter_m')
  const odometerKm =
    km !== undefined ? num(km) + num(metres) / 1000 : num(vehicle[13])

  const time = blockValues(lines, '[time]', 5)
  const nameIndex = lines.findIndex((line) => line.trim() === '[name]')

  const delayRaw = readNamedValue(lines, '[stringvars]', 'IBIS_Delay_min')
  const delay = delayRaw !== undefined && str(delayRaw) !== '' ? num(delayRaw) : undefined

  return {
    situationName: nameIndex >= 0 ? str(lines[nameIndex + 1]) : '',
    odometerKm,
    clockMinutes: num(time[2]) * 60 + num(time[3]),
    year: num(time[0]),
    dayOfYear: num(time[1]),
    vehiclePath: str(vehicle[0]),
    delayMinutes: delay
  }
}

/** De toestand van de kaart zoals OMSI hem het laatst wegschreef. */
export function readMapSession(omsiPath: string, mapFolder: string): SessionState | undefined {
  return readSessionState(join(omsiPath, 'maps', mapFolder, 'laststn.osn'))
}

/** Wat er tussen twee momenten gebeurd is. */
export interface SessionResult {
  /** Werkelijk gereden afstand in kilometers. */
  drivenKm: number
  /** Hoeveel speltijd er verstreken is, in minuten. */
  elapsedMinutes: number
  delayMinutes?: number
  /**
   * Of OMSI de situatie sindsdien heeft overschreven. Zo niet, dan is het spel
   * nog niet afgesloten en zeggen de cijfers nog niets.
   */
  finished: boolean
}

/**
 * Vergelijkt de toestand van voor het starten met die van nu.
 *
 * OMSI schrijft `laststn.osn` pas bij het afsluiten. Zolang het bestand nog de
 * dienst bevat die wij erin hebben gezet, is de sessie niet afgerond.
 */
export function compareSession(
  before: SessionState,
  after: SessionState | undefined,
  writtenName: string
): SessionResult {
  if (!after) return { drivenKm: 0, elapsedMinutes: 0, finished: false }

  // Zolang de klok nog op onze aanmeldtijd staat en de naam de onze is, heeft
  // OMSI het bestand niet opnieuw weggeschreven.
  const untouched =
    after.situationName === writtenName &&
    after.clockMinutes === before.clockMinutes &&
    Math.abs(after.odometerKm - before.odometerKm) < 0.001

  const elapsed = after.clockMinutes - before.clockMinutes
  return {
    drivenKm: Math.max(0, after.odometerKm - before.odometerKm),
    // De klok kan over middernacht heen zijn gegaan.
    elapsedMinutes: elapsed >= 0 ? elapsed : elapsed + 1440,
    delayMinutes: after.delayMinutes,
    finished: !untouched
  }
}
