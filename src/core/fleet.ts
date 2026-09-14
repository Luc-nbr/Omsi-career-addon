import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { listHofs, pickHof, type Hof } from './hof'
import { readOmsiLines } from './omsiFile'
import type { Duty } from './types'
import { listVehicles, vehicleName, type Vehicle } from './vehicles'

/** Pad vergelijkbaar maken: OMSI schrijft door elkaar heen slashes en hoofdletters. */
function normalisePath(value: string): string {
  return value.trim().toLowerCase().replace(/\\/g, '/')
}

/**
 * De voertuigen die een kaart zelf gebruikt, uit `ailists.cfg`.
 *
 * Dit is het wagenpark van de kaart: Berlin-Spandau noemt daar de MAN SD200 en
 * SD202, precies de Berlijnse bussen van dat tijdvak. Zonder die lijst is elke
 * bus met een toevallig passend wagenparkbestand even goed, en dan belandt er
 * een Hamburgse gelede bus uit 2017 op een dienst in 1986.
 */
export function readMapFleet(mapPath: string): Set<string> {
  const fleet = new Set<string>()
  const file = join(mapPath, 'ailists.cfg')
  if (!existsSync(file)) return fleet
  try {
    for (const line of readOmsiLines(file)) {
      // Regels zien eruit als `vehicles\MAN_SD200\MAN_SD84.bus` met soms een
      // tab en een gewicht erachter.
      const match = line.match(/vehicles[\\/][^\t]*?\.(bus|ovh)\b/i)
      if (match) fleet.add(normalisePath(match[0]))
    }
  } catch {
    // Zonder lijst valt de keuze terug op alleen het wagenparkbestand.
  }
  return fleet
}

/**
 * Welke bus hoort bij deze dienst?
 *
 * Het antwoord staat in de wagenpark-bestanden (.hof) naast elk busmodel. Een
 * bus die de eindbestemmingen van de kaart kent, hoort daar; een bus die ze niet
 * kent zou met lege bestemmingsfilms rondrijden. Omdat die bestanden ook een
 * ingangsjaar dragen, sluit dezelfde toets meteen het verkeerde tijdvak uit: een
 * lagevloerbus uit 2019 heeft geen wagenpark voor Spandau 1988.
 */
export interface FleetIndex {
  vehicles: Vehicle[]
  /** Wagenparken per voertuigmap; 162 bussen kunnen dezelfde .hof-set delen. */
  hofsByFolder: Map<string, Hof[]>
}

export function buildFleetIndex(omsiPath: string): FleetIndex {
  const vehicles = listVehicles(omsiPath)
  const hofsByFolder = new Map<string, Hof[]>()
  for (const vehicle of vehicles) {
    if (hofsByFolder.has(vehicle.folder)) continue
    hofsByFolder.set(vehicle.folder, listHofs(join(omsiPath, vehicle.relativePath)))
  }
  return { vehicles, hofsByFolder }
}

export interface VehicleChoice {
  vehicle: Vehicle
  /** Wagenpark waarmee deze bus de dienst kan rijden. */
  yard: string
  /** Aandeel van de eindbestemmingen dat de bus kent, 0 tot 1. */
  fit: number
  /** Of de bus in het wagenpark van de kaart zelf staat. */
  fromMapFleet: boolean
  /** Hoeveel bussen even goed pasten; maat voor de variatie. */
  alternatives: number
}

/**
 * Kiest een passende bus.
 *
 * Twee eisen, in volgorde. De bus moet in het wagenpark van de kaart staan — dat
 * regelt het tijdvak en de stad. En hij moet een wagenparkbestand hebben dat de
 * eindbestemmingen van deze dienst kent, anders rijdt hij met lege
 * bestemmingsfilms rond. Onder de overblijvers wordt willekeurig gekozen, zodat
 * dezelfde lijn niet elke keer dezelfde bus oplevert.
 */
export function pickVehicleForDuty(
  index: FleetIndex,
  duty: Duty,
  year: number,
  mapFleet: Set<string>,
  random: () => number = Math.random
): VehicleChoice | undefined {
  const termini = [...new Set(duty.legs.map((leg) => leg.terminus).filter(Boolean))]
  if (termini.length === 0) return undefined

  type Scored = { vehicle: Vehicle; yard: string; fit: number; fromMapFleet: boolean }
  const scored: Scored[] = []

  for (const vehicle of index.vehicles) {
    const hofs = index.hofsByFolder.get(vehicle.folder)
    if (!hofs || hofs.length === 0) continue
    const match = pickHof(hofs, termini, year)
    if (!match || match.matched === 0) continue
    scored.push({
      vehicle,
      yard: match.hof.name,
      fit: match.matched / termini.length,
      fromMapFleet: mapFleet.has(normalisePath(vehicle.relativePath))
    })
  }
  if (scored.length === 0) return undefined

  // Bussen van de kaart gaan voor; alleen als die er niet zijn, kijken we breder.
  const preferred = scored.filter((entry) => entry.fromMapFleet)
  const pool = preferred.length > 0 ? preferred : scored

  const bestFit = Math.max(...pool.map((entry) => entry.fit))
  const candidates = pool.filter((entry) => entry.fit >= bestFit - 1e-9)
  const chosen = candidates[Math.floor(random() * candidates.length)]

  return {
    vehicle: chosen.vehicle,
    yard: chosen.yard,
    fit: chosen.fit,
    fromMapFleet: chosen.fromMapFleet,
    alternatives: candidates.length
  }
}

/** Leesbare omschrijving, voor in de interface en het logboek. */
export function describeChoice(choice: VehicleChoice): string {
  return `${vehicleName(choice.vehicle)} · ${choice.yard}`
}
