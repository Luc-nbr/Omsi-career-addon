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
 * Het wagenpark van de kaart zelf: welke bus, en hoeveel ervan.
 *
 * `ailists.cfg` draagt naast het overige verkeer ook de remise van de kaart. Een
 * `[aigroup_depot_typgroup_2]` noemt een busbestand en daaronder staat per wagen
 * een regel -- wagennummer, kenteken, vervoerder:
 *
 *     [aigroup_depot_typgroup_2]
 *     vehicles\MB_C2_EN_BVG\MB_C2_E6_Solo.bus
 *     801 AL-VG 801   AVG Ahlheim (801)
 *     802 AL-VG 802   AVG Ahlheim (802)
 *     [end]
 *
 * Het aantal regels is dus hoeveel van die bus er op deze kaart rondrijdt, en
 * het busbestand is precies de uitvoering met de goede kleurstelling -- de maker
 * van de kaart heeft die zelf aangewezen. Dat is beter bewijs voor "welke bus
 * hoort hier" dan wat wij ervan kunnen afleiden.
 */
export function readMapDepot(mapPath: string): Map<string, number> {
  const depot = new Map<string, number>()
  const file = join(mapPath, 'ailists.cfg')
  if (!existsSync(file)) return depot
  try {
    const lines = readOmsiLines(file)
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].trim().toLowerCase().startsWith('[aigroup_depot_typgroup')) continue
      const pad = lines[i + 1]?.match(/vehicles[\\/][^\t]*?\.(bus|ovh)\b/i)
      if (!pad) continue
      // Alles tot [end] is een wagen; lege regels tellen niet mee.
      let wagens = 0
      let j = i + 2
      for (; j < lines.length; j++) {
        const regel = lines[j].trim()
        if (regel.toLowerCase() === '[end]') break
        if (regel.startsWith('[')) break
        if (regel) wagens++
      }
      const sleutel = normalisePath(pad[0])
      depot.set(sleutel, (depot.get(sleutel) ?? 0) + Math.max(1, wagens))
      i = j
    }
  } catch {
    // Zonder remiselijst blijft de keuze op het wagenpark-bestand staan.
  }
  return depot
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

/**
 * De bus die op deze kaart het gewoonst is, zonder dat er een dienst aan te pas
 * komt.
 *
 * `pickVehicleForDuty` redeneert vanuit de eindbestemmingen van een dienst: hij
 * zoekt een bus die de kaart kent, want anders rijd je met een lege
 * bestemmingsfilm. Bij vrij rijden is er geen dienst en dus geen eindbestemming
 * -- je rijdt wat je wilt -- en blijft er een eenvoudiger vraag over, die de
 * kaart zelf beantwoordt: welke bus rijdt hier het meest rond? Dat staat in de
 * remiselijst, door de maker van de kaart aangewezen.
 *
 * Geen keuze opdringen: dit is wat de app voorstelt, en elke andere bus blijft
 * te kiezen.
 */
export function suggestFromDepot(
  vehicles: Vehicle[],
  depot: Map<string, number>
): Vehicle | undefined {
  let beste: Vehicle | undefined
  let meeste = 0
  for (const vehicle of vehicles) {
    const wagens = depot.get(normalisePath(vehicle.relativePath)) ?? 0
    if (wagens > meeste) {
      meeste = wagens
      beste = vehicle
    }
  }
  return beste
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
  random: () => number = Math.random,
  /**
   * Hoeveel wagens de kaart van elke bus rondrijdt, uit de remiselijst.
   *
   * Zonder deze lijst blijft alles werken zoals het werkte; met de lijst wint
   * de bus die op deze kaart het gewoonst is.
   */
  depot?: Map<string, number>
): VehicleChoice | undefined {
  const termini = [...new Set(duty.legs.map((leg) => leg.terminus).filter(Boolean))]
  if (termini.length === 0) return undefined

  type Scored = {
    vehicle: Vehicle
    yard: string
    fit: number
    fromMapFleet: boolean
    /** Hoeveel wagens de kaart hiervan rondrijdt; 0 als hij er niet in staat. */
    wagens: number
  }
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
      fromMapFleet: mapFleet.has(normalisePath(vehicle.relativePath)),
      wagens: depot?.get(normalisePath(vehicle.relativePath)) ?? 0
    })
  }
  if (scored.length === 0) return undefined

  // Bussen van de kaart gaan voor; alleen als die er niet zijn, kijken we breder.
  const preferred = scored.filter((entry) => entry.fromMapFleet)
  const pool = preferred.length > 0 ? preferred : scored

  const bestFit = Math.max(...pool.map((entry) => entry.fit))
  const candidates = pool.filter((entry) => entry.fit >= bestFit - 1e-9)

  /*
   * En dan de bus die op deze kaart het gewoonst is.
   *
   * De maker van de kaart zet in `ailists.cfg` zijn eigen remise neer: welk
   * busbestand -- dus welke uitvoering en welke kleurstelling -- en hoeveel
   * wagens ervan. Dat is beter bewijs voor "welke bus hoort hier" dan wat wij
   * eruit kunnen afleiden, dus weegt het mee.
   *
   * Het blijft wegen en geen regel: elke bus die even goed bij de dienst past
   * kan nog steeds voorkomen, hij komt alleen minder vaak boven. Anders zie je
   * op een kaart met twintig bussen altijd dezelfde.
   */
  const gewichten = candidates.map((entry) => 1 + entry.wagens)
  let lot = random() * gewichten.reduce((som, gewicht) => som + gewicht, 0)
  let chosen = candidates[candidates.length - 1]
  for (let i = 0; i < candidates.length; i++) {
    lot -= gewichten[i]
    if (lot <= 0) {
      chosen = candidates[i]
      break
    }
  }

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
