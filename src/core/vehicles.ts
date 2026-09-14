import { existsSync, readdirSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
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
 * AI-verkeer staat in dezelfde mappen en gebruikt dezelfde .bus-extensie. Het
 * onderscheid zit in de secties: alleen een voertuig dat je zelf kunt rijden
 * heeft een cabine met dienstregelingaanzicht.
 */
const DRIVABLE_MARKERS = ['[view_schedule]', '[passengercabin]']

function readVehicle(omsiPath: string, file: string): Vehicle | undefined {
  let lines: string[]
  try {
    lines = readOmsiLines(file)
  } catch {
    return undefined
  }

  const tags = new Set(lines.map((line) => line.trim()))
  if (!DRIVABLE_MARKERS.some((marker) => tags.has(marker))) return undefined

  const index = lines.findIndex((line) => line.trim() === '[friendlyname]')
  if (index < 0) return undefined

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
