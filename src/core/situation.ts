import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { readOmsiLines, str } from './omsiFile'

/**
 * Situatiebestanden (.osn) leggen vast waar het spel begint: kaart, datum,
 * tijd en welk voertuig van jou is, met zijn plek op de kaart.
 *
 * De app leest ze om het tijdvak van een kaart te bepalen -- dat bepaalt welk
 * wagenpark-bestand geldt, Johannesstift is in 1988 code 221 en in 1994 code
 * 161 -- en schrijft er één, zodat de speler in OMSI alleen nog op Start hoeft
 * te drukken.
 *
 * Het formaat is nagerekend aan de bestanden die OMSI zelf wegschrijft. Een
 * voertuigblok is: pad, x, hoogte, z, vier getallen van het quaternion, drie
 * voor de snelheid, de tegel als x en y uit de bestandsnaam, de kilometerstand
 * en het wagenpark. De twee grondcoördinaten zijn het eerste en het derde
 * getal; dat is te zien aan de bussen die OMSI parkeerde: gelezen als x en z
 * staan ze op 1 tot 5 meter van een rijstrook, gelezen als x en y op 50.
 */

const BOM = Buffer.from([0xff, 0xfe])

/** Wat er klaargezet moet worden. */
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
    /** Pad vanaf de OMSI-map, zoals `vehicles\\...\\bus.bus`. */
    relativePath: string
    lineNumber: string
    terminus: string
  }
  /** Waar het bestand heen gaat; standaard de Situations-map van OMSI. */
  into?: string
  /** Waar de bus komt te staan, in de tegelmaat van OMSI zelf. */
  spawn?: {
    tx: number
    ty: number
    x: number
    z: number
    height: number
    /** Koers in graden, noord nul, met de klok mee. */
    heading: number
  }
}

export interface SituationResult {
  file: string
  /** Of de bus ook werkelijk neergezet kon worden. */
  vehiclePlaced: boolean
  /** Of hij op de gevraagde plek staat, of op die uit het sjabloon. */
  spawnPlaced: boolean
  template?: string
}

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
  const endIndex = indexOfTag(lines, '[end]')
  if (nameIndex < 0 || endIndex < 0 || endIndex < nameIndex) return
  lines.splice(nameIndex + 1, endIndex - nameIndex - 1, name, '[description]', description)
}

/**
 * Zet een stringvariabele van het eigen voertuig. `[stringvars]` bevat eerst het
 * aantal, daarna afwisselend naam en waarde. `SetLineTo` en `Matrix_Nr` bepalen
 * de lijn, `IBIS_cabindisplay` de bestemming op het display.
 */
function setStringVar(lines: string[], from: number, name: string, value: string): void {
  const start = lines.indexOf('[stringvars]', from)
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

/** Een draaiing om de staande as, zoals OMSI hem noteert: x, y, z, w. */
function yawQuaternion(headingDegrees: number): [string, string, string, string] {
  const half = ((headingDegrees * Math.PI) / 180) / 2
  return ['0.000000', Math.sin(half).toFixed(6), '0.000000', Math.cos(half).toFixed(6)]
}

/**
 * Schrijft de situatie waarmee OMSI opstart.
 *
 * Er is een sjabloon voor nodig: het voertuigblok bevat meer dan wij weten -- de
 * stand van honderden scriptvariabelen van dat busmodel -- en dat is niet te
 * verzinnen. OMSI bewaart na elke sessie `laststn.osn` per kaart, dus wie een
 * kaart één keer heeft gereden heeft er vanaf dan een.
 */
export function writeSituation(omsiPath: string, request: SituationRequest): SituationResult {
  const template = findTemplate(omsiPath, request.mapFolder)
  if (!template) {
    throw new Error(
      `Geen situatiebestand gevonden voor de kaart "${request.mapFolder}". ` +
        'Start die kaart \u00e9\u00e9n keer in OMSI; daarna kan de dienst automatisch klaargezet worden.'
    )
  }

  const lines = readOmsiLines(template)
  const vehicleAt = indexOfTag(lines, '[vehicle]')
  const placeVehicle = Boolean(request.vehicle) && vehicleAt >= 0 && indexOfTag(lines, '[ismyVehicle]') >= 0

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

  let spawnPlaced = false
  if (placeVehicle && request.vehicle) {
    lines[vehicleAt + 1] = request.vehicle.relativePath
    if (request.spawn) {
      const { tx, ty, x, z, height, heading } = request.spawn
      lines[vehicleAt + 2] = x.toFixed(3)
      lines[vehicleAt + 3] = height.toFixed(3)
      lines[vehicleAt + 4] = z.toFixed(3)
      const q = yawQuaternion(heading)
      for (let i = 0; i < 4; i++) lines[vehicleAt + 5 + i] = q[i]
      // Stilstaand beginnen; de drie getallen erna zijn de snelheid.
      for (let i = 0; i < 3; i++) lines[vehicleAt + 9 + i] = '0.000'
      lines[vehicleAt + 12] = String(tx)
      lines[vehicleAt + 13] = String(ty)
      // De camera kijkt waar de bus staat, anders begin je elders op de kaart.
      setBlock(lines, '[centerkachel]', [String(tx), String(ty)])
      setBlock(lines, '[mapcam]', [x.toFixed(6), (height + 2).toFixed(6), z.toFixed(6)])
      spawnPlaced = true
    }
    setStringVar(lines, vehicleAt, 'SetLineTo', ` ${request.vehicle.lineNumber} `)
    setStringVar(lines, vehicleAt, 'Matrix_Nr', ` ${request.vehicle.lineNumber} `)
    setStringVar(lines, vehicleAt, 'IBIS_cabindisplay', request.vehicle.terminus)
  }

  const folder = request.into ?? join(omsiPath, 'Situations')
  mkdirSync(folder, { recursive: true })
  const file = join(folder, 'OMSI Career.osn')
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

  return { file, vehiclePlaced: placeVehicle, spawnPlaced, template: basename(template) }
}
