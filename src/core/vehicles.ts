import { existsSync, readdirSync, statSync } from 'node:fs'
import { basename, extname, join, relative } from 'node:path'
import { readOmsiLines, str } from './omsiFile'

/** Een bestuurbaar voertuig zoals OMSI het kent. */
export interface Vehicle {
  /** Pad ten opzichte van de OMSI-map, zoals het in een .osn moet staan. */
  relativePath: string
  manufacturer: string
  type: string
  /** Standaardkleurstelling; OMSI noemt dit de "Anstrich". */
  paint: string
  folder: string
}

/** Volledige naam voor in de lijst. */
export function vehicleName(vehicle: Vehicle): string {
  return [vehicle.manufacturer, vehicle.type].filter(Boolean).join(' ') || vehicle.folder
}

/**
 * Welke voertuigen je zelf kunt rijden.
 *
 * AI-verkeer en aanhangers staan in dezelfde mappen en gebruiken dezelfde
 * `.bus`-extensie; het onderscheid zit in de secties van het bestand.
 *
 * `[view_schedule]` is het aanzicht op de dienstregeling naast het stuur. Dat
 * heeft alleen een voertuig waar een chauffeur in zit, en het is de scherpste
 * grens die er in het bestandsformaat te vinden is: van de 483 voertuigen in
 * deze installatie hebben er 364 zo'n aanzicht, en geen enkel voertuig heeft er
 * een zonder passagiersruimte.
 *
 * Wat afvalt is precies wat moest afvallen. 118 aanhangers -- de achterbak van
 * een gelede bus, met passagiers erin maar zonder stuur, die OMSI zelf aan de
 * voorkant koppelt -- en één voertuig met `[ai_veh_type]`, de sectie die een
 * voertuig als verkeer bestempelt. Eerst stond hier "dienstregelingaanzicht
 * óf passagiersruimte", en door die óf kreeg een chauffeur een aanhanger of een
 * uitgeklede AI-versie toegewezen.
 */
const DRIVABLE = '[view_schedule]'
const AI_ONLY = '[ai_veh_type]'

/**
 * De AI-varianten die nergens in het bestand als zodanig gemarkeerd staan.
 *
 * Een hoop pakketten leveren naast de bestuurbare bus een uitgeklede versie voor
 * het verkeer: de bekende KI-Citaro's, de AI-MAN's, de AI-Hamburgers. Die zijn
 * van de echte bus afgeleid en dragen dus gewoon een dienstregelingaanzicht --
 * aan het formaat is er niets aan te zien. De makers zetten het in de naam: KI
 * of AI als los woord in de bestandsnaam, of achteraan de naam van de bus. Op
 * een naam afgaan is een laatste redmiddel, maar hier is het de enige
 * aanwijzing die er is, en het gaat om 39 van de 366 voertuigen.
 *
 * KI staat voor kuenstliche Intelligenz; als los woord komt het in geen enkele
 * echte busnaam voor. Dat het een los woord moet zijn is de hele truc --
 * "Kirchheim" en "Airport" blijven zo buiten schot.
 */
const AI_IN_FILE = /(^|[_\- ])(ai|ki)([_\-. ]|$)/i
const AI_IN_NAME = /\bKI[ -]?Version\b|nicht\s+.bernehmen|[ -](KI|AI)$/i

/**
 * Een sectie zoals hij bedoeld is, ook als er een haakje te veel staat.
 *
 * De Hamburgse stadsbus uit 1996 begint met `[[friendlyname]`. OMSI leest daar
 * overheen en de bus rijdt gewoon; wij sloegen hem over, en dan mist er een bus
 * in de lijst die in het spel wel bestaat.
 */
function tag(line: string): string {
  return line.trim().replace(/^\[+/, '[')
}

function readVehicle(omsiPath: string, file: string): Vehicle | undefined {
  let lines: string[]
  try {
    lines = readOmsiLines(file)
  } catch {
    return undefined
  }

  const tags = new Set(lines.map(tag))
  if (!tags.has(DRIVABLE) || tags.has(AI_ONLY)) return undefined

  const index = lines.findIndex((line) => tag(line) === '[friendlyname]')
  if (index < 0) return undefined

  /* Een naam of bestandsnaam die zelf zegt dat het verkeer is; zie hierboven. */
  const naam = `${str(lines[index + 1])} ${str(lines[index + 2])}`
  if (AI_IN_NAME.test(naam) || AI_IN_FILE.test(basename(file, extname(file)))) return undefined

  const folder = relative(join(omsiPath, 'Vehicles'), file).split(/[\\/]/)[0]
  return {
    relativePath: relative(omsiPath, file),
    manufacturer: str(lines[index + 1]),
    type: str(lines[index + 2]),
    paint: str(lines[index + 3]),
    folder
  }
}

/** Alle bestuurbare voertuigen in de installatie, op naam gesorteerd. */
export function listVehicles(omsiPath: string): Vehicle[] {
  const root = join(omsiPath, 'Vehicles')
  if (!existsSync(root)) return []

  const vehicles: Vehicle[] = []
  for (const entry of readdirSync(root)) {
    const folder = join(root, entry)
    let contents: string[]
    try {
      if (!statSync(folder).isDirectory()) continue
      contents = readdirSync(folder)
    } catch {
      continue
    }
    for (const name of contents) {
      if (extname(name).toLowerCase() !== '.bus') continue
      const vehicle = readVehicle(omsiPath, join(folder, name))
      if (vehicle) vehicles.push(vehicle)
    }
  }
  return vehicles.sort((a, b) => vehicleName(a).localeCompare(vehicleName(b)))
}
