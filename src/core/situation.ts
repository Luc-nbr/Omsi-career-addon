import { copyFileSync, existsSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { readOmsiLines, str } from './omsiFile'

/**
 * Een situatiebestand (.osn) legt vast waar het spel begint: kaart, datum, tijd
 * en welk voertuig van jou is. OMSI schrijft ze in UTF-16LE met BOM en CRLF.
 */
export interface SituationRequest {
  mapFolder: string
  name: string
  description: string
  year: number
  /** Dag van het jaar, 1-366. */
  dayOfYear: number
  /** Tijd in minuten na middernacht; boven 1440 rolt de datum door. */
  minutes: number
  vehicle?: {
    relativePath: string
    lineNumber: string
    terminus: string
  }
}

export interface SituationResult {
  file: string
  /**
   * Of de bus daadwerkelijk klaargezet kon worden. Dat lukt alleen als er voor
   * deze kaart een situatie bestaat om de positie uit over te nemen.
   */
  vehiclePlaced: boolean
  template?: string
}

const BOM = Buffer.from([0xff, 0xfe])

/** Geeft de index van de regel met deze tag, of -1. */
function indexOfTag(lines: string[], tag: string): number {
  return lines.findIndex((line) => line.trim() === tag)
}

/** Vervangt de vaste waarderegels direct na een tag. */
function setBlock(lines: string[], tag: string, values: string[]): boolean {
  const index = indexOfTag(lines, tag)
  if (index < 0) return false
  values.forEach((value, offset) => {
    lines[index + 1 + offset] = value
  })
  return true
}

/** Naam en omschrijving staan vooraan en lopen door tot `[end]`. */
function setHeading(lines: string[], name: string, description: string): void {
  const nameIndex = indexOfTag(lines, '[name]')
  const descriptionIndex = indexOfTag(lines, '[description]')
  const endIndex = indexOfTag(lines, '[end]')
  if (nameIndex < 0 || descriptionIndex < 0 || endIndex < 0) return
  lines.splice(nameIndex + 1, endIndex - nameIndex - 1, name, '[description]', description)
}

/**
 * Zet een stringvariabele van het eigen voertuig. `[stringvars]` bevat eerst het
 * aantal, daarna afwisselend naam en waarde. `SetLineTo` en `Matrix_Nr` bepalen
 * de lijn, `IBIS_cabindisplay` de bestemming op het display.
 */
function setStringVar(lines: string[], name: string, value: string): void {
  const start = indexOfTag(lines, '[stringvars]')
  if (start < 0) return
  const count = Number.parseInt(str(lines[start + 1]), 10)
  if (!Number.isFinite(count)) return
  for (let i = 0; i < count; i++) {
    const nameIndex = start + 2 + i * 2
    if (str(lines[nameIndex]) === name) {
      lines[nameIndex + 1] = value
      return
    }
  }
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

/** Heeft dit bestand een eigen voertuig, en dus een bruikbare startpositie? */
function hasOwnVehicle(file: string): boolean {
  try {
    return indexOfTag(readOmsiLines(file), '[ismyVehicle]') >= 0
  } catch {
    return false
  }
}

/**
 * Zoekt een situatie om als sjabloon te gebruiken. De positie van de bus staat
 * in het bestand en is niet te verzinnen: die hangt aan de tegels van de kaart.
 * Een sjabloon mét voertuig levert dus een compleet klaargezette dienst; zonder
 * sjabloon zetten we alleen kaart en tijd goed en kiest de speler zelf een bus.
 *
 * OMSI bewaart na elke sessie `laststn.osn` per kaart. Wie een kaart één keer
 * heeft gereden, heeft er vanaf dan automatisch een sjabloon voor.
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
 * Het jaar en de dag die OMSI voor deze kaart gebruikte. Kaarten met een Chrono-
 * map spelen in een bepaald tijdvak: Berlin-Spandau staat op 1986 en zou met een
 * modern jaartal de verkeerde tijdlaag laden. Het sjabloon weet wat klopt.
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

/** Schrijft de situatie en levert het pad op. */
export function writeSituation(omsiPath: string, request: SituationRequest): SituationResult {
  const template = findTemplate(omsiPath, request.mapFolder)
  if (!template) {
    throw new Error(
      `Geen situatiebestand gevonden voor de kaart "${request.mapFolder}". ` +
        'Start die kaart één keer in OMSI; daarna kan de dienst automatisch klaargezet worden.'
    )
  }

  const lines = readOmsiLines(template)
  const placeVehicle = Boolean(request.vehicle) && indexOfTag(lines, '[ismyVehicle]') >= 0

  const dayOverflow = Math.floor(request.minutes / 1440)
  const minuteOfDay = ((request.minutes % 1440) + 1440) % 1440

  setHeading(lines, request.name, request.description)
  setBlock(lines, '[map]', [`maps\\${request.mapFolder}\\global.cfg`])
  setBlock(lines, '[time]', [
    String(request.year),
    String(request.dayOfYear + dayOverflow),
    String(Math.floor(minuteOfDay / 60)),
    String(minuteOfDay % 60),
    '0'
  ])

  if (placeVehicle && request.vehicle) {
    // Alleen het voertuigpad wijzigen; de coördinaten eronder blijven staan.
    const index = indexOfTag(lines, '[vehicle]')
    if (index >= 0) lines[index + 1] = request.vehicle.relativePath
    setStringVar(lines, 'SetLineTo', ` ${request.vehicle.lineNumber} `)
    setStringVar(lines, 'Matrix_Nr', ` ${request.vehicle.lineNumber} `)
    setStringVar(lines, 'IBIS_cabindisplay', request.vehicle.terminus)
  }

  const file = join(omsiPath, 'Situations', 'OMSI Career.osn')
  writeFileSync(file, Buffer.concat([BOM, Buffer.from(lines.join('\r\n'), 'utf16le')]))

  // Het weerbestand hoort bij de situatie; zonder valt OMSI terug op standaard.
  const templateWeather = `${template}.owt`
  if (existsSync(templateWeather)) {
    try {
      copyFileSync(templateWeather, `${file}.owt`)
    } catch {
      // Weer is bijzaak; de dienst werkt ook zonder.
    }
  }

  return { file, vehiclePlaced: placeVehicle, template: basename(template) }
}
