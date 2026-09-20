import { existsSync, readdirSync, statSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { num, parseOmsiFile, readOmsiLines, str } from './omsiFile'
import type { BusStop, OmsiMap, Tour, Trip, TripProfile } from './types'

/**
 * Veldaantallen per blok, afgeleid uit de bestanden zelf. De ongebruikte velden
 * staan er expliciet in omdat het aantal bepaalt waar het volgende blok begint.
 */
const BUSSTOP_SCHEMA = { '[busstop]': 6 }
const LINE_SCHEMA = { '[newtour]': 3, '[addtrip]': 3, '[userallowed]': 0 }

/**
 * Ritten kennen twee haltevormen. `[station_typ2]` is de nieuwe, met alleen een
 * id dat in Busstops.cfg staat. `[station]` is de oude uit OMSI 2.00: zes velden
 * met de naam er middenin. Hamburg Tag & Nacht en Thüringer Wald gebruiken die
 * nog en hebben een lege Busstops.cfg — zonder deze tag houden ze nul haltes over.
 */
/*
 * Een `[station]` heeft acht velden: id, groep, naam, iets, de afstand van het
 * vorige punt in kilometers, de rijtijd tot hier opgeteld in seconden, de
 * halteertijd, en een minimale wachttijd. De zesde is waar het om gaat: die
 * verdeelt de rittijd over de haltes.
 *
 * `[profile_man_arr_time]` en `[profile_man_dep_time]` noemen per halte-index
 * een vaste aankomst- of vertrektijd in minuten na het begin van de rit.
 */
const TRIP_SCHEMA = {
  '[trip]': 3,
  '[station_typ2]': 1,
  '[station]': 8,
  '[profile]': 2,
  '[profile_man_arr_time]': 2,
  '[profile_man_dep_time]': 2
}

/** Masker waarin elke dag aanstaat; gebruikt als een omloop er geen opgeeft. */
const ALL_DAYS = 0b1111111111

/** Haltes van een kaart: id → naam. Meerdere haltes kunnen dezelfde naam hebben. */
export function readBusStops(ttDataPath: string): Map<string, BusStop> {
  const stops = new Map<string, BusStop>()
  const file = join(ttDataPath, 'Busstops.cfg')
  if (!existsSync(file)) return stops
  for (const block of parseOmsiFile(file, BUSSTOP_SCHEMA)) {
    // velden: naam, groep, id, halteertijd, 2x ongebruikt
    const name = str(block.values[0])
    const id = str(block.values[2])
    if (id) stops.set(id, { id, name })
  }
  return stops
}

/** Leest één ritbestand (.ttp). */
export function readTrip(path: string): Trip {
  const blocks = parseOmsiFile(path, TRIP_SCHEMA)
  const trip: Trip = {
    file: basename(path, extname(path)),
    ident: '',
    terminus: '',
    lineNumber: '',
    stops: [],
    profiles: []
  }
  for (const block of blocks) {
    if (block.tag === '[trip]') {
      // Positioneel: ident, eindbestemming, lijnnummer. Bij bussen is ident leeg.
      trip.ident = str(block.values[0])
      trip.terminus = str(block.values[1])
      trip.lineNumber = str(block.values[2])
    } else if (block.tag === '[station_typ2]') {
      const id = str(block.values[0])
      if (id) trip.stops.push({ id })
    } else if (block.tag === '[station]') {
      const id = str(block.values[0])
      if (id) {
        trip.stops.push({
          id,
          name: str(block.values[2]) || undefined,
          cumulative: num(block.values[5])
        })
      }
    } else if (block.tag === '[profile]') {
      const profile: TripProfile = { name: str(block.values[0]), minutes: num(block.values[1]) }
      trip.profiles.push(profile)
    } else if (block.tag === '[profile_man_arr_time]' || block.tag === '[profile_man_dep_time]') {
      // Deze blokken horen bij het profiel waar ze onder staan.
      const profile = trip.profiles[trip.profiles.length - 1]
      if (!profile) continue
      const index = Math.round(num(block.values[0]))
      const minutes = num(block.values[1])
      if (block.tag === '[profile_man_arr_time]') {
        profile.arrivals ??= new Map()
        profile.arrivals.set(index, minutes)
      } else {
        profile.departures ??= new Map()
        profile.departures.set(index, minutes)
      }
    }
  }
  return trip
}

/** Leest één lijnbestand (.ttl) en levert de omlopen die erin staan. */
export function readTours(path: string): Tour[] {
  const lineFile = basename(path, extname(path))
  const tours: Tour[] = []
  let current: Tour | undefined
  /*
   * De vlag staat boven de omlopen, dus hij is bekend voordat de eerste
   * langskomt; toch pas achteraf toekennen, voor het geval een kaart hem
   * onderaan zet.
   */
  let userAllowed = false
  for (const block of parseOmsiFile(path, LINE_SCHEMA)) {
    if (block.tag === '[userallowed]') {
      userAllowed = true
    } else if (block.tag === '[newtour]') {
      current = {
        lineFile,
        userAllowed,
        number: str(block.values[0]),
        depot: str(block.values[1]),
        // Alle dagen als het veld ontbreekt; dan sluit niets onnodig af.
        days: Math.round(num(block.values[2], ALL_DAYS)) || ALL_DAYS,
        trips: []
      }
      tours.push(current)
    } else if (block.tag === '[addtrip]' && current) {
      // velden: ritbestand, profiel-index, vertrek in minuten na middernacht
      const tripFile = str(block.values[0])
      if (!tripFile) continue
      current.trips.push({
        tripFile,
        profileIndex: Math.max(0, Math.round(num(block.values[1]))),
        departure: num(block.values[2])
      })
    }
  }
  for (const tour of tours) tour.userAllowed = userAllowed
  return tours
}

/**
 * Wanneer je bij elke halte hoort te zijn, in minuten na het begin van de rit.
 *
 * De dienstregeling geeft vaste tijden voor een deel van de haltes -- op de ene
 * kaart voor allemaal, op de andere voor bijna geen. Daartussen verdelen we naar
 * rijtijd: de opgetelde seconden uit het ritbestand, en ontbreken die ook, dan
 * gelijkmatig over de haltes. De aankomsttijd telt, want daar gaat het om als je
 * wilt weten of je te vroeg bent.
 */
export function stopOffsets(trip: Trip | undefined, profileIndex: number): number[] {
  if (!trip || trip.stops.length === 0) return []
  const profile = trip.profiles[profileIndex] ?? trip.profiles[0]
  const total = profile?.minutes ?? 0
  const count = trip.stops.length

  // Maatstaf om tussen vaste punten te verdelen.
  const basis = trip.stops.map((stop, index) =>
    stop.cumulative !== undefined && stop.cumulative > 0 ? stop.cumulative : index
  )
  const last = basis[count - 1] || count - 1 || 1

  const fixed = new Array<number | undefined>(count)
  for (let i = 0; i < count; i++) {
    const arrival = profile?.arrivals?.get(i)
    const departure = profile?.departures?.get(i)
    const value = arrival ?? departure
    if (value !== undefined && Number.isFinite(value)) fixed[i] = value
  }
  // Het begin en het eind liggen vast, ook zonder opgave.
  fixed[0] ??= 0
  fixed[count - 1] ??= total

  const times = new Array<number>(count)
  let anchor = 0
  for (let i = 0; i < count; i++) {
    if (fixed[i] === undefined) continue
    times[i] = fixed[i] as number
    // Alles tussen het vorige vaste punt en dit, naar rato van de rijtijd.
    const span = basis[i] - basis[anchor]
    for (let k = anchor + 1; k < i; k++) {
      const part = span > 0 ? (basis[k] - basis[anchor]) / span : (k - anchor) / (i - anchor)
      times[k] = times[anchor] + (times[i] - times[anchor]) * part
    }
    anchor = i
  }
  // Mocht er na het laatste vaste punt nog iets komen: naar rato van het geheel.
  for (let k = anchor + 1; k < count; k++) {
    times[k] = total * (basis[k] / last)
  }
  return times
}

/** Rijtijd van een rit volgens het profiel dat de dienst voorschrijft. */
export function tripMinutes(trip: Trip | undefined, profileIndex: number): number {
  if (!trip || trip.profiles.length === 0) return 0
  const profile = trip.profiles[profileIndex] ?? trip.profiles[0]
  return profile.minutes
}

/** Laadt kaart met alles wat voor dienstplanning nodig is. */
export function loadMap(mapsPath: string, folder: string): OmsiMap | undefined {
  const path = join(mapsPath, folder)
  const ttData = join(path, 'TTData')
  if (!existsSync(join(path, 'global.cfg')) || !existsSync(ttData)) return undefined

  const trips = new Map<string, Trip>()
  const tours: Tour[] = []
  for (const entry of readdirSync(ttData)) {
    const ext = extname(entry).toLowerCase()
    const full = join(ttData, entry)
    try {
      if (ext === '.ttp') {
        const trip = readTrip(full)
        trips.set(trip.file.toLowerCase(), trip)
      } else if (ext === '.ttl') {
        tours.push(...readTours(full))
      }
    } catch {
      // Eén kapot bestand in een addon mag de hele kaart niet onbruikbaar maken.
    }
  }

  /*
   * Alleen lijnen die de speler in het dienstregelingsmenu kan aanklikken. De
   * rest is verkeer: stadsbanen, S-Bahnen, goederentreinen, en op sommige
   * kaarten een vliegtuig. Die leverden diensten op die je in het spel niet
   * kon kiezen en die over een spoor- of vliegroute liepen.
   *
   * Markeert een kaart geen enkele lijn -- oudere kaarten kennen de vlag niet
   * -- dan houden we ze allemaal; niets tonen is daar erger dan te veel.
   */
  const usable = tours.filter((tour) => tour.trips.length > 0)
  const allowed = usable.filter((tour) => tour.userAllowed)

  return {
    folder,
    name: readMapName(path) || folder,
    path,
    stops: readBusStops(ttData),
    trips,
    tours: allowed.length > 0 ? allowed : usable
  }
}

/**
 * Alleen wat de kaartenlijst nodig heeft: de naam en het aantal omlopen.
 *
 * `loadMap` leest ook elke rit (.ttp) en alle haltes, en dat is het dure deel:
 * in het logboek van een speler met 46 kaarten kostte de kaartenlijst 29,5
 * seconden. Omlopen staan in de .ttl-bestanden, en of een omloop meetelt --
 * heeft hij ritten, mag de speler hem rijden -- staat daar ook in. Dus hoeft er
 * voor dit lijstje geen enkele .ttp open.
 */
export function readMapOverview(
  mapsPath: string,
  folder: string
): { name: string; tours: number } | undefined {
  const path = join(mapsPath, folder)
  const ttData = join(path, 'TTData')
  if (!existsSync(join(path, 'global.cfg')) || !existsSync(ttData)) return undefined

  const tours: Tour[] = []
  for (const entry of readdirSync(ttData)) {
    if (extname(entry).toLowerCase() !== '.ttl') continue
    try {
      tours.push(...readTours(join(ttData, entry)))
    } catch {
      // Eén kapot bestand in een addon mag de hele kaart niet onbruikbaar maken.
    }
  }

  // Dezelfde keuze als in loadMap: rijdbare omlopen, en anders alles wat er is.
  const usable = tours.filter((tour) => tour.trips.length > 0)
  const allowed = usable.filter((tour) => tour.userAllowed)
  return { name: readMapName(path) || folder, tours: (allowed.length > 0 ? allowed : usable).length }
}

/** De leesbare kaartnaam staat als `[name]`-blok in global.cfg. */
function readMapName(mapPath: string): string {
  try {
    const lines = readOmsiLines(join(mapPath, 'global.cfg'))
    const index = lines.findIndex((line) => line.trim() === '[name]')
    return index >= 0 ? str(lines[index + 1]) : ''
  } catch {
    return ''
  }
}

/** Alle kaarten die een dienstregeling hebben. */
export function listMaps(omsiPath: string): string[] {
  const mapsPath = join(omsiPath, 'maps')
  if (!existsSync(mapsPath)) return []
  return readdirSync(mapsPath)
    .filter((entry) => {
      const full = join(mapsPath, entry)
      return statSync(full).isDirectory() && existsSync(join(full, 'TTData'))
    })
    .sort((a, b) => a.localeCompare(b))
}
