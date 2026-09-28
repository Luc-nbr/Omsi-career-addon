import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { runsOn, type Calendar } from './calendar'
import { readTileGrid, type MapGeometry, type TileGrid } from './geo'
import { readOmsiLines } from './omsiFile'
import { readTileList, readTrackLine } from './track'
import type { OmsiMap, Trip } from './types'

/*
 * WAAR DE BUS STAAT BIJ VRIJ RIJDEN
 *
 * Een gebruiker (doorgestuurd door Luc): "meine Idee wäre das die Haltestellen
 * aussuchen Option komplett weg fällt in dem Modus nur und nur noch Karte und
 * Bus ausgesucht werden müssen und das Navi es von alleine findet". De speler
 * kiest dus geen halte meer; de app zet de bus zelf neer.
 *
 * Waar? Op een inzetpunt van de kaart: de plekken die de kaartmaker in
 * `global.cfg` onder `[entrypoints]` zette, precies om er een bus neer te
 * zetten. OMSI doet dat zelf ook: in zijn eigen situaties staat de bus exact op
 * zo'n punt, met hetzelfde quaternion (tegenlezing, `quat.cjs`). Een punt heeft
 * twaalf regels: twee ids, een nul, x, hoogte, z, het quaternion (x, y, z, w),
 * de tegel en de naam. De hoogte klopt: bij alle 509 punten op de dertien
 * kaarten met tegels ligt hij binnen drie meter van het maaiveld of een
 * rijstrook (`hoogte.mts`).
 *
 * Welk punt? Niet "de eerste remise": op HamburgLi20 begint bij het
 * Betriebshof Alsterdorf geen enkele van de 252 omlopen, en tussen tien en
 * vier uur rukt er uit een remise bijna niets uit. Wel het punt waar rond de
 * starttijd binnen 300 meter de meeste ritten vertrekken. Kaartmakers zetten
 * inzetpunten juist bij eindpunten, en om 14:05 en om 08:00 heeft elke
 * speelbare kaart er een waar binnen 40 minuten iets vertrekt
 * (`vertrekpunt.mts`).
 */

/** Een inzetpunt uit `[entrypoints]`, met zijn plek op de kaart. */
export interface Inzetpunt {
  /** De plek in `[entrypoints]`. */
  nr: number
  naam: string
  /** Index in de tegellijst van global.cfg. */
  tile: number
  tx: number
  ty: number
  /** Binnen de tegel: x en z over de grond, y de hoogte. */
  x: number
  y: number
  z: number
  q: [number, number, number, number]
  /** In kaartmeters, zoals de geometrie en de routes. */
  wereld: { x: number; y: number }
}

/** Waar de bus komt te staan, en waarom daar. */
export interface Beginplek {
  /** Het inzetpunt, of -1 als de bus bij een halte staat (kaart zonder inzetpunten). */
  nr: number
  naam: string
  bron: 'vertrekken' | 'uitrukken' | 'remise' | 'eerste' | 'halte'
  /** Hoeveel ritten er binnen 300 m vertrekken in het venster tot `tot`. */
  aantal: number
  /** Einde van dat venster, in minuten na middernacht. */
  tot?: number
  /**
   * De tijd waarop de bus er staat. Meestal de gevraagde; 's nachts tien
   * minuten voor het eerste vertrek daar (bron `uitrukken`).
   */
  klok: number
  /** Bij `uitrukken`: wanneer daar de eerste omloop vertrekt. */
  eerste?: number
  spawn: {
    tx: number
    ty: number
    x: number
    z: number
    height: number
    /** Graden, noord nul, met de klok mee; afgeleid uit het quaternion. */
    heading: number
    quaternion?: [number, number, number, number]
  }
  wereld: { x: number; y: number }
}

/**
 * Wat de controle op de kaartstap vond, met alles wat er bij START nodig is.
 * Het scherm krijgt er een deel van (`FreeCheck`); het hoofdproces houdt de
 * rest vast, zodat de bus bij START staat waar de voet het zei.
 */
export interface VrijCheckVol {
  ok: boolean
  fout?: 'onvolledig' | 'geenPlek' | 'geenDienstregeling'
  plek?: Beginplek
  moment: {
    iso: string
    year: number
    dayOfYear: number
    minutes: number
    bron: 'klok' | 'eersteVertrek'
  }
}

/** Eén vertrek uit de dienstregeling, op de plek waar de rit begint. */
export interface Vertrek {
  x: number
  y: number
  /** Minuten na middernacht, zoals in de omloop; mag boven 1440. */
  dep: number
  /** De vroegste rit van zijn omloop: hier rukt een bus uit. */
  uitrukken: boolean
  lineFile: string
  tourNumber: string
  tripFile: string
  lineNumber: string
  /** Naam van de eerste halte, of leeg. */
  vanaf: string
  naar: string
  /** Een rit zonder reizigers; zie `isLeer` in core/omloopvolgen.ts. */
  leer: boolean
}

/** Binnen zoveel meter van een inzetpunt telt een vertrek als "daar". */
export const VERTREK_M = 300

const REMISE = /betriebshof|depot|remise|garage|wagenhalle|\(\s*D\s*\)/i

/** Heet deze plek naar een remise? */
export function isRemise(naam: string): boolean {
  return REMISE.test(naam)
}

/** Leegrit: weinig haltes, en geen lijn of een bestemming die zegt dat hij leeg rijdt. */
const LEER_BESTEMMING = /betriebsfahrt|leerfahrt|dienstfahrt|sonderwagen|pause|überliege|ueberliege|www\./i

export function isLeer(trip: Trip | undefined): boolean {
  if (!trip) return false
  return trip.stops.length < 3 && (!trip.lineNumber || LEER_BESTEMMING.test(trip.terminus))
}

/** Hoeveel minuten na `klok` dit vertrek valt, rond middernacht doorgeteld. */
export function minutenNa(dep: number, klok: number): number {
  return ((((dep % 1440) - klok) % 1440) + 1440) % 1440
}

/**
 * De inzetpunten van een kaart. Een punt vervalt als er iets niet klopt: een
 * getal dat geen getal is, een plek buiten zijn tegel, een tegel die global.cfg
 * niet noemt of die niet op schijf staat. Zo'n punt zou de bus in het niets
 * zetten, en dan laadt OMSI "garnix".
 */
export function leesInzetpunten(mapPath: string, grid: TileGrid | undefined = readTileGrid(mapPath)): Inzetpunt[] {
  if (!grid) return []
  let regels: string[]
  let tegels: ReturnType<typeof readTileList>
  try {
    regels = readOmsiLines(join(mapPath, 'global.cfg'))
    tegels = readTileList(mapPath)
  } catch {
    return []
  }
  const begin = regels.findIndex((regel) => regel.trim() === '[entrypoints]')
  if (begin < 0) return []
  const aantal = Number.parseInt(regels[begin + 1] ?? '', 10)
  if (!Number.isFinite(aantal) || aantal <= 0) return []

  const bestaat = new Map<string, boolean>()
  const uit: Inzetpunt[] = []
  for (let k = 0; k < aantal; k++) {
    const basis = begin + 2 + k * 12
    if (basis + 11 >= regels.length) break
    const getal = (plek: number): number => Number(regels[basis + plek]?.trim())
    const x = getal(3)
    const y = getal(4)
    const z = getal(5)
    const q: [number, number, number, number] = [getal(6), getal(7), getal(8), getal(9)]
    const tile = getal(10)
    const naam = (regels[basis + 11] ?? '').trim()
    if (![x, y, z, ...q, tile].every(Number.isFinite)) continue
    if (Math.abs(x) > 1000 || Math.abs(z) > 1000) continue
    const tegel = tegels[tile]
    if (!tegel || !Number.isFinite(tegel.tx) || !Number.isFinite(tegel.ty)) continue
    let is = bestaat.get(tegel.file)
    if (is === undefined) {
      is = existsSync(join(mapPath, tegel.file))
      bestaat.set(tegel.file, is)
    }
    if (!is) continue
    const [ox, oy] = grid.offset(tegel.tx, tegel.ty)
    uit.push({
      nr: k,
      naam: naam || `#${k}`,
      tile,
      tx: tegel.tx,
      ty: tegel.ty,
      x,
      y,
      z,
      q,
      wereld: { x: ox + x, y: oy + z }
    })
  }
  return uit
}

/**
 * Staan de tegels er? `aanwezig === 0` is een kaart die OMSI niet laadt:
 * Wenen staat hier met een dienstregeling maar zonder een enkele tegel.
 */
export function tegelsCompleet(mapPath: string): { genoemd: number; aanwezig: number } {
  let tegels: ReturnType<typeof readTileList>
  try {
    tegels = readTileList(mapPath)
  } catch {
    return { genoemd: 0, aanwezig: 0 }
  }
  let aanwezig = 0
  for (const tegel of tegels) if (tegel.file && existsSync(join(mapPath, tegel.file))) aanwezig++
  return { genoemd: tegels.length, aanwezig }
}

/** Koers in graden uit het quaternion van een inzetpunt: een draaiing om de staande as. */
export function koersVan(q: [number, number, number, number]): number {
  const graden = (2 * Math.atan2(q[1], q[3]) * 180) / Math.PI
  return ((graden % 360) + 360) % 360
}

/** Van een inzetpunt naar de plek in een situatiebestand; het quaternion gaat ongewijzigd mee. */
export function plekVanInzetpunt(
  punt: Inzetpunt,
  keuze: Omit<Beginplek, 'nr' | 'naam' | 'spawn' | 'wereld'>
): Beginplek {
  return {
    ...keuze,
    nr: punt.nr,
    naam: punt.naam,
    spawn: {
      tx: punt.tx,
      ty: punt.ty,
      x: punt.x,
      z: punt.z,
      height: punt.y,
      heading: koersVan(punt.q),
      quaternion: punt.q
    },
    wereld: punt.wereld
  }
}

/**
 * Alle vertrekken op een datum: elke rit van elke omloop die dan rijdt. De plek
 * is de eerste halte die op de kaart gevonden wordt; heeft de rit er geen --
 * een leegrit naar de remise noemt vaak geen enkele -- dan het begin van zijn
 * `.ttr`. Een rit zonder plek valt weg.
 *
 * `ttrBegin` is een geheugen voor die `.ttr`-beginpunten; het lezen raakt de
 * tegels en kost daardoor tijd, en de beller houdt het per kaart vast.
 */
export function vertrekkenOp(
  map: OmsiMap,
  geometry: MapGeometry,
  datum: Date | undefined,
  kalender: Calendar,
  omsiPath: string,
  ttrBegin: Map<string, { x: number; y: number } | null> = new Map()
): Vertrek[] {
  const stopAt = new Map(geometry.stops.map((stop) => [stop.id, stop]))
  const plekVan = (trip: Trip): { x: number; y: number; vanaf: string } | undefined => {
    for (const stop of trip.stops) {
      const gevonden = stopAt.get(stop.id)
      if (gevonden) {
        return {
          x: gevonden.x,
          y: gevonden.y,
          vanaf: stop.name ?? map.stops.get(stop.id)?.name ?? gevonden.name
        }
      }
    }
    const sleutel = trip.file.toLowerCase()
    let begin = ttrBegin.get(sleutel)
    if (begin === undefined) {
      const lijn = readTrackLine(map.path, omsiPath, trip.file)
      begin = lijn && lijn.points.length >= 2 ? { x: lijn.points[0], y: lijn.points[1] } : null
      ttrBegin.set(sleutel, begin)
    }
    return begin ? { ...begin, vanaf: '' } : undefined
  }

  const uit: Vertrek[] = []
  for (const tour of map.tours) {
    if (datum && !runsOn(tour.days, datum, kalender)) continue
    const opVolgorde = [...tour.trips].sort((a, b) => a.departure - b.departure)
    opVolgorde.forEach((entry, plek) => {
      const trip = map.trips.get(entry.tripFile.toLowerCase())
      if (!trip) return
      const waar = plekVan(trip)
      if (!waar) return
      const leer = isLeer(trip)
      /*
       * Een uitrukrit is vaak een leegrit met als bestemming "Betriebsfahrt";
       * wat de speler wil weten is waar de omloop daarna heen gaat.
       */
      let naar = trip.terminus
      if (leer) {
        const volgende = opVolgorde
          .slice(plek + 1)
          .map((item) => map.trips.get(item.tripFile.toLowerCase()))
          .find((item) => item && !isLeer(item))
        if (volgende?.terminus) naar = volgende.terminus
      }
      uit.push({
        x: waar.x,
        y: waar.y,
        dep: entry.departure,
        uitrukken: plek === 0,
        lineFile: tour.lineFile,
        tourNumber: tour.number,
        tripFile: trip.file,
        lineNumber: leer ? '' : trip.lineNumber || trip.ident,
        vanaf: waar.vanaf,
        naar,
        leer
      })
    })
  }
  return uit
}

/**
 * Per naam van een inzetpunt: welke vertrekken binnen 300 meter van een van
 * zijn plekken liggen. Een naam komt vaak meer dan eens voor -- twee sporen in
 * dezelfde remise, twee perrons van dezelfde halte -- en telt dan als één plek.
 */
function vertrekkenPerNaam(
  punten: Inzetpunt[],
  vertrekken: Vertrek[]
): Array<{ naam: string; slots: Inzetpunt[]; hier: number[] }> {
  const namen: Array<{ naam: string; slots: Inzetpunt[]; hier: number[] }> = []
  const opNaam = new Map<string, (typeof namen)[number]>()
  for (const punt of punten) {
    let groep = opNaam.get(punt.naam)
    if (!groep) {
      groep = { naam: punt.naam, slots: [], hier: [] }
      opNaam.set(punt.naam, groep)
      namen.push(groep)
    }
    groep.slots.push(punt)
  }
  for (const groep of namen) {
    vertrekken.forEach((vertrek, index) => {
      if (groep.slots.some((slot) => Math.hypot(slot.wereld.x - vertrek.x, slot.wereld.y - vertrek.y) <= VERTREK_M)) {
        groep.hier.push(index)
      }
    })
  }
  return namen
}

/**
 * Kiest het inzetpunt waar de bus komt te staan.
 *
 * 1. Per naam het aantal vertrekken binnen 300 m tussen klok+5 en klok+45.
 * 2. Gelijk? Dan het aantal tot klok+90, dan een remisenaam, dan de volgorde
 *    in het bestand.
 * 3. Nergens iets? Dan hetzelfde tot klok+120.
 * 4. Nog steeds niets en de tijd is automatisch ('s nachts): de klok gaat naar
 *    tien minuten voor het eerstvolgende vertrek bij een inzetpunt, of anders
 *    voor het eerste van de dag, en dan opnieuw.
 * 5. Anders de remise met de meeste uitrukkers, of het eerste punt.
 *
 * Binnen een naam het slot dat het dichtst ligt bij het eerstvolgende vertrek.
 */
export function kiesVertrekplek(
  punten: Inzetpunt[],
  vertrekken: Vertrek[],
  opties: { klok: number; tijdAutomatisch: boolean }
): Beginplek | undefined {
  if (punten.length === 0) return undefined
  const namen = vertrekkenPerNaam(punten, vertrekken)

  const telIn = (hier: number[], klok: number, tot: number): number[] =>
    hier.filter((index) => {
      const na = minutenNa(vertrekken[index].dep, klok)
      return na >= 5 && na <= tot
    })

  const kies = (klok: number, tot: number): Beginplek | undefined => {
    let beste:
      | { groep: (typeof namen)[number]; volgorde: number; binnen: number[]; ruim: number }
      | undefined
    namen.forEach((groep, volgorde) => {
      const binnen = telIn(groep.hier, klok, tot)
      const ruim = telIn(groep.hier, klok, Math.max(tot, 90)).length
      const beter =
        !beste ||
        binnen.length > beste.binnen.length ||
        (binnen.length === beste.binnen.length &&
          (ruim > beste.ruim ||
            (ruim === beste.ruim && isRemise(groep.naam) && !isRemise(beste.groep.naam))))
      if (beter) beste = { groep, volgorde, binnen, ruim }
    })
    if (!beste || beste.binnen.length === 0) return undefined
    const { groep, binnen } = beste
    // Het eerstvolgende vertrek, en het slot dat daar het dichtst bij ligt.
    const eerst = [...binnen].sort((a, b) => minutenNa(vertrekken[a].dep, klok) - minutenNa(vertrekken[b].dep, klok))[0]
    const v = vertrekken[eerst]
    const slot = [...groep.slots].sort(
      (a, b) => Math.hypot(a.wereld.x - v.x, a.wereld.y - v.y) - Math.hypot(b.wereld.x - v.x, b.wereld.y - v.y)
    )[0]
    return plekVanInzetpunt(slot, {
      bron: 'vertrekken',
      aantal: binnen.length,
      tot: (klok + tot) % 1440,
      klok
    })
  }

  const klok = ((Math.round(opties.klok) % 1440) + 1440) % 1440
  const gewoon = kies(klok, 45) ?? kies(klok, 120)
  if (gewoon) return gewoon

  if (opties.tijdAutomatisch) {
    /*
     * 's Nachts rijdt er niets. Dan staat de bus er tien minuten voordat bij
     * een inzetpunt de eerste bus vertrekt -- op die datum, na de klok, of
     * anders de eerste van de dag.
     */
    const bijEenPunt = [...new Set(namen.flatMap((groep) => groep.hier))].map((index) => vertrekken[index].dep % 1440)
    if (bijEenPunt.length > 0) {
      const na = bijEenPunt.filter((dep) => dep >= klok + 5).sort((a, b) => a - b)
      const eerste = na[0] ?? Math.min(...bijEenPunt)
      const nieuw = Math.max(0, eerste - 10)
      const plek = kies(nieuw, 45) ?? kies(nieuw, 120)
      if (plek) return { ...plek, bron: 'uitrukken', eerste }
    }
  }

  /* Geen vertrek in de buurt van een inzetpunt: de remise met de meeste uitrukkers. */
  let remise: { groep: (typeof namen)[number]; uit: number } | undefined
  for (const groep of namen) {
    if (!isRemise(groep.naam)) continue
    const uit = groep.hier.filter((index) => vertrekken[index].uitrukken).length
    if (!remise || uit > remise.uit) remise = { groep, uit }
  }
  if (remise) {
    return plekVanInzetpunt(remise.groep.slots[0], { bron: 'remise', aantal: 0, klok })
  }
  return plekVanInzetpunt(punten[0], { bron: 'eerste', aantal: 0, klok })
}
