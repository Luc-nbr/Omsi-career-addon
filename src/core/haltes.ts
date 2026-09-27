import type { OmsiMap } from './types'

/**
 * Wat er bij een halte gebeurt, volgens de dienstregeling van de kaart.
 *
 * Vrij rijden laat je een beginpunt kiezen, en Luc: "het zou fijn zijn om te
 * kunnen zien bij het beginpunt welke lijnen er zijn vanaf die halte en of het
 * een beginpunt is of een tussenstop. Dat moet gecategoriseerd worden." Een
 * beginpunt is een halte waar ritten beginnen: daar kun je in OMSI meteen een
 * omloop oppakken. Een tussenhalte ligt onderweg; wie daar begint, rijdt eerst
 * naar een beginpunt of pakt de rit halverwege op.
 */
export interface HalteInfo {
  id: string
  /** De lijnen die hier stoppen, op nummer. */
  lijnen: string[]
  /** Hoeveel ritten hier beginnen. Meer dan nul: een beginpunt. */
  begint: number
  /** Hoeveel ritten hier stoppen zonder er te beginnen. */
  stopt: number
}

/**
 * Alle eindbestemmingen van de kaart, zoals ze op de film staan: de `terminus`
 * van elke rit uit de kiesbare omlopen. Daaraan meet vrij rijden de
 * wagenparken naast een bus, want een dienst is er vooraf niet.
 */
export function bestemmingenVan(map: OmsiMap): string[] {
  const kiesbaar = map.tours.some((tour) => tour.userAllowed)
    ? map.tours.filter((tour) => tour.userAllowed)
    : map.tours
  const uit = new Set<string>()
  for (const tour of kiesbaar) {
    for (const entry of tour.trips) {
      const terminus = map.trips.get(entry.tripFile.toLowerCase())?.terminus?.trim()
      if (terminus) uit.add(terminus)
    }
  }
  return [...uit]
}

/** "4" voor "15", en "N1" na "45": op nummer, en letters erachter. */
function opNummer(a: string, b: string): number {
  return a.localeCompare(b, 'nl', { numeric: true, sensitivity: 'base' })
}

/**
 * Per halte: welke lijnen er stoppen, en hoeveel ritten er beginnen of langs
 * komen. Alleen de omlopen die de speler in het dienstregelingsmenu van OMSI kan
 * kiezen (`[userallowed]`); heeft een kaart die niet, dan alle omlopen. Een rit
 * telt zo vaak als hij in de omlopen staat -- dat is hoe vaak er werkelijk een
 * bus vertrekt.
 */
export function haltesVan(map: OmsiMap): HalteInfo[] {
  const kiesbaar = map.tours.some((tour) => tour.userAllowed)
    ? map.tours.filter((tour) => tour.userAllowed)
    : map.tours
  const perHalte = new Map<string, { lijnen: Set<string>; begint: number; stopt: number }>()
  const van = (id: string) => {
    let info = perHalte.get(id)
    if (!info) {
      info = { lijnen: new Set(), begint: 0, stopt: 0 }
      perHalte.set(id, info)
    }
    return info
  }
  for (const tour of kiesbaar) {
    for (const entry of tour.trips) {
      // De ritten staan op kleine letters; zie buildNetwork in core/network.ts.
      const trip = map.trips.get(entry.tripFile.toLowerCase())
      if (!trip || trip.stops.length === 0) continue
      // Dezelfde naam als in een dienst; zie toDuty in core/duty.ts.
      const lijn = trip.lineNumber || trip.ident || tour.lineFile
      trip.stops.forEach((stop, index) => {
        const info = van(stop.id)
        if (lijn) info.lijnen.add(lijn)
        if (index === 0) info.begint += 1
        else info.stopt += 1
      })
    }
  }
  return [...perHalte.entries()].map(([id, info]) => ({
    id,
    lijnen: [...info.lijnen].sort(opNummer),
    begint: info.begint,
    stopt: info.stopt
  }))
}
