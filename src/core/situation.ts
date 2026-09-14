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
    /** Wagenpark waar de bestemmingscodes uit komen; staat achter in het blok. */
    yard?: string
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





/** Een draaiing om de staande as, zoals OMSI hem noteert: x, y, z, w. */
function yawQuaternion(headingDegrees: number): [string, string, string, string] {
  const half = ((headingDegrees * Math.PI) / 180) / 2
  return ['0.000000', Math.sin(half).toFixed(6), '0.000000', Math.cos(half).toFixed(6)]
}

/**
 * Bouwt het situatiebestand zelf op.
 *
 * Een situatie heeft veertien blokken en verder niets: naam, kaart, tijd,
 * camera, het eigen voertuig en twee lijsten met de stand van zijn
 * scriptvariabelen. Die lijsten zijn geteld -- eerst het aantal paren, dan de
 * paren -- en mogen dus ook leeg zijn. Dat is precies wat je wilt voor een
 * dienst die begint: de bus start met wat zijn eigen scripts als beginwaarde
 * hebben, motor uit en deuren dicht, in plaats van met de stand van een
 * willekeurige vorige rit in een andere bus.
 *
 * Daardoor is er geen sjabloon meer nodig en werkt het ook op een kaart die je
 * nooit eerder hebt gespeeld.
 */
function buildSituation(request: SituationRequest): string[] {
  const dayOverflow = Math.floor(request.minutes / 1440)
  const minuteOfDay = ((request.minutes % 1440) + 1440) % 1440
  const spawn = request.spawn
  const vehicle = request.vehicle

  const lines: string[] = [
    '[name]',
    request.name,
    '[description]',
    request.description,
    '[end]',
    '',
    '[map]',
    `maps\\${request.mapFolder}\\global.cfg`,
    '',
    '[time]',
    String(request.year),
    String(request.dayOfYear + dayOverflow),
    String(Math.floor(minuteOfDay / 60)),
    String(minuteOfDay % 60),
    '0',
    ''
  ]

  if (spawn) {
    lines.push(
      '[centerkachel]',
      String(spawn.tx),
      String(spawn.ty),
      '',
      // De kaartcamera kijkt waar de bus staat; de drie hoeken erna zijn een
      // schuine blik van bovenaf, zoals OMSI er zelf een wegschrijft.
      '[mapcam]',
      spawn.x.toFixed(6),
      (spawn.height + 3).toFixed(6),
      spawn.z.toFixed(6),
      '0',
      '-25',
      '30',
      ''
    )
  }

  // Waar de chauffeur zit ten opzichte van de bus; OMSI schrijft hier dezelfde
  // waarden weg, ongeacht het voertuig.
  lines.push('[egopos]', '10', '0', '10', '0', '0', '')

  if (vehicle && spawn) {
    const q = yawQuaternion(spawn.heading)
    lines.push(
      '----------------------------------------------',
      '',
      'Fahrzeug Nr. 0:',
      '',
      '[vehicle]',
      vehicle.relativePath,
      spawn.x.toFixed(3),
      spawn.height.toFixed(3),
      spawn.z.toFixed(3),
      q[0],
      q[1],
      q[2],
      q[3],
      // Stilstaand beginnen.
      '0.000',
      '0.000',
      '0.000',
      String(spawn.tx),
      String(spawn.ty),
      // Kilometerstand; die telt in de app niet mee, we meten het verschil.
      '0.000',
      vehicle.yard ?? '',
      '',
      '[ismyVehicle]',
      '',
      // Leeg: de bus begint met zijn eigen beginwaarden.
      '[vars]',
      '0',
      '',
      '[stringvars]',
      '3',
      'SetLineTo',
      ` ${vehicle.lineNumber} `,
      'Matrix_Nr',
      ` ${vehicle.lineNumber} `,
      'IBIS_cabindisplay',
      vehicle.terminus,
      '',
      '----------------------------------------------',
      '',
      '[myvehicle]',
      '0',
      ''
    )
  }

  lines.push('[view]', '3', '')
  return lines
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
  const lines = buildSituation(request)
  const folder = request.into ?? join(omsiPath, 'Situations')
  mkdirSync(folder, { recursive: true })
  const file = join(folder, 'OMSI Career.osn')
  writeFileSync(file, Buffer.concat([BOM, Buffer.from(lines.join('\r\n'), 'utf16le')]))

  /*
   * Het weer hoort bij de situatie. Zonder bestand valt OMSI terug op zijn
   * standaard; een bestaande situatie van deze kaart levert iets dat bij de
   * streek past, dus die nemen we over als hij er is.
   */
  const template = findTemplate(omsiPath, request.mapFolder)
  if (template && existsSync(`${template}.owt`)) {
    try {
      copyFileSync(`${template}.owt`, `${file}.owt`)
    } catch {
      // Weer is bijzaak; de dienst werkt ook zonder.
    }
  }

  return {
    file,
    vehiclePlaced: Boolean(request.vehicle && request.spawn),
    spawnPlaced: Boolean(request.spawn),
    template: template ? basename(template) : undefined
  }
}
