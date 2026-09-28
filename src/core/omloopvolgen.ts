import { runsOn, type Calendar } from './calendar'
import { isLeer, minutenNa, VERTREK_M, type Vertrek } from './beginplek'
import { toDuty } from './duty'
import { PERIOD_MASK, WEEKDAY_MASK, type TripRun } from './network'
import { tripMinutes } from './timetable'
import type { Duty, Koppelsoort, OmsiMap, Tour, TourTrip, Trip } from './types'
import type { VrijSuggestie } from '../shared/api'

/*
 * VRIJ RIJDEN: WELKE OMLOOP RIJDT OMSI?
 *
 * De plugin geeft uit het geheugen van OMSI door wat er op de bus staat: de
 * namen (`lineName`, `tourName`, `tripName`) en de nummers (`line`, `tour`,
 * `tourEntry`, `trip`). Eerst werd er op de namen en de klok gezocht
 * (`dutyFromTour`), en dat ging mis: een omloopnummer staat in meer
 * dagvarianten, een rit komt in een omloop soms twee keer voor, en een
 * leegrit stond niet in het net -- dan pakte de overlay de rit die op de klok
 * het dichtst lag, en tekende hij een andere lijn dan OMSI reed. Dat is de
 * "falsche Linien Route" uit de klacht.
 *
 * De nummers zijn wat OMSI zelf gebruikt. `line` is de plek van het `.ttl`
 * in de map (readdir), `tour` de plek van de `[newtour]` in dat bestand, en
 * `tourEntry` de plek van de rit in de omloop. Nagerekend aan het monster van
 * 21-09 (Hohenkirchen, `Freitag`, omloop 12, rit 37 = 853_ERN-HOB4 om 19:44).
 * Wat dat monster niet beslist: of OMSI de ritten op vertrektijd sorteert
 * (daar stonden ze al zo). Dus proberen we beide volgordes, en elke rit die
 * daarna komt wordt nagekeken (`readSchedule` in core/live.ts).
 *
 * Een nummer alleen is niet genoeg: elke lijn heeft een omloop 0. Daarom drie
 * controles -- de rit, de naam van de omloop en de rijdag -- en valt de
 * koppeling terug op de naam, dan op de rit alleen, en anders op niets.
 */

/**
 * Een bestandsnaam zoals twee kanten hem allebei kunnen schrijven: zonder pad
 * en extensie, zonder hoofdletters, en elk teken buiten ASCII als '?'. De
 * plugin en de app lezen namen niet altijd in dezelfde codepagina; zo botsen
 * "Straße" en "Stra?e" niet. En `copy_text` in de plugin maakt van een `\` een
 * spatie, dus "TTData 853_ERN-HOB4" is ook "853_ERN-HOB4".
 */
export function vouw(naam: string): string {
  let basis = (naam ?? '').trim().split(/[\\/]/).pop() ?? ''
  basis = basis.replace(/^ttdata\s+/i, '')
  return ascii(basis.replace(/\.(ttp|ttl)$/i, '').trim().toLowerCase())
}

/** Hetzelfde voor een omloopnaam: daar hoort geen pad bij, en een '/' mag erin. */
export function vouwNaam(naam: string): string {
  return ascii((naam ?? '').trim().toLowerCase())
}

function ascii(tekst: string): string {
  let uit = ''
  for (const teken of tekst) uit += (teken.codePointAt(0) ?? 0) > 0x7e ? '?' : teken
  return uit
}

/**
 * Een naam waar niets mee te beginnen valt: leeg, of met tekens die alleen uit
 * een kapotte omzetting komen. Dan telt hij niet mee -- niet als bewijs, en
 * ook niet als tegenbewijs.
 */
export function onbruikbaar(naam: string | undefined): boolean {
  if (!naam || !naam.trim()) return true
  for (const teken of naam) {
    const code = teken.codePointAt(0) ?? 0
    if (code === 0xfffd || code > 0xff) return true
  }
  return false
}

/**
 * Een omloopnaam van één teken ("1", "A") raakt in de plugin verminkt: er komt
 * rommel achter. Dat is herkenbaar, want het eerste teken klopt nog.
 */
export function naamGelijk(omsi: string, nummer: string): boolean {
  const a = vouwNaam(omsi)
  const b = vouwNaam(nummer)
  if (a === b) return true
  return b.length === 1 && a.startsWith(b)
}

/** Wat OMSI op de bus heeft staan; de velden van `mem` in live.json. */
export interface OmsiKeuze {
  lineName: string
  tourName: string
  tripName: string
  line: number
  tour: number
  tourEntry: number
  trip: number
  /** De klok van het spel, in minuten na middernacht. */
  klok: number
}

export interface Koppeling {
  soort: Koppelsoort
  duty?: Duty
  /** Het lijnbestand waarop gezocht is, als dat er een was. */
  lineFile?: string
  tourNumber?: string
  tourIndex?: number
  /** Het nummer van de rit in de omloop, zoals OMSI het telt. */
  entry?: number
  tripFile?: string
  departure?: number
  volgorde?: 'bestand' | 'vertrek'
  zeker: boolean
  /** Rijdt de gevonden omloop op de datum van het spel? */
  rijdt?: boolean
}

export interface KoppelOpties {
  kalender: Calendar
  /** De `.ttl`-bestanden van de kaart in de volgorde van readdir, zonder extensie. */
  ttlNamen: string[]
  /** Idem de `.ttp`-bestanden. */
  ttpNamen: string[]
  /** De datum in het spel; zonder datum wordt de rijdag niet nagekeken. */
  datum?: Date
  /**
   * Welke volgorde voorgaat als beide kloppen. Na een wissel die niet klopte
   * met de gekozen volgorde (`volgorde gecorrigeerd` in het logboek) is dat de
   * andere.
   */
  voorkeur?: 'bestand' | 'vertrek'
}

/** De ritten van een omloop in beide volgordes waarin OMSI ze kan tellen. */
function opVertrek(tour: Tour): TourTrip[] {
  // Stabiel: bij gelijke vertrektijd blijft de volgorde van het bestand staan.
  return tour.trips
    .map((entry, plek) => ({ entry, plek }))
    .sort((a, b) => a.entry.departure - b.entry.departure || a.plek - b.plek)
    .map((item) => item.entry)
}

/** Wat er vanaf een rit nog volgt, als tekst om twee volgordes te vergelijken. */
function vervolg(reeks: TourTrip[]): string {
  return reeks.map((entry) => `${vouw(entry.tripFile)}@${entry.departure}`).join(';')
}

/**
 * De drie controles op een kandidaat. `ok` als niets ertegen spreekt;
 * `bevestigd` als minstens de rit of de omloopnaam er echt voor spreekt.
 */
function controle(
  tour: Tour,
  entry: TourTrip,
  keuze: OmsiKeuze,
  opties: KoppelOpties
): { ok: boolean; bevestigd: boolean; rijdt: boolean } {
  const ritBruikbaar = !onbruikbaar(keuze.tripName)
  const naamBruikbaar = !onbruikbaar(keuze.tourName)
  const ritKlopt = !ritBruikbaar || vouw(keuze.tripName) === vouw(entry.tripFile)
  const naamKlopt = !naamBruikbaar || naamGelijk(keuze.tourName, tour.number)
  return {
    ok: ritKlopt && naamKlopt,
    bevestigd: (ritBruikbaar && ritKlopt) || (naamBruikbaar && naamKlopt),
    rijdt: !opties.datum || runsOn(tour.days, opties.datum, opties.kalender)
  }
}

/** Een dienst van een stuk omloop; een rit zonder `.ttp` valt weg, de nummers blijven. */
export function dienstVanOmloop(
  map: OmsiMap,
  tour: Tour,
  reeks: Array<{ entry: TourTrip; positie: number }>
): Duty | undefined {
  const runs: TripRun[] = []
  const posities: number[] = []
  const ritten: Trip[] = []
  for (const { entry, positie } of reeks) {
    const trip = map.trips.get(entry.tripFile.toLowerCase())
    if (!trip) continue
    const minutes = tripMinutes(trip, entry.profileIndex)
    runs.push({
      tripFile: entry.tripFile.toLowerCase(),
      trip,
      departure: entry.departure,
      arrival: entry.departure + minutes,
      minutes,
      lineFile: tour.lineFile,
      tourNumber: tour.number,
      depot: tour.depot,
      period: tour.days & PERIOD_MASK,
      profileIndex: entry.profileIndex,
      days: tour.days & WEEKDAY_MASK
    })
    posities.push(positie)
    ritten.push(trip)
  }
  if (runs.length === 0) return undefined
  const duty = toDuty(map, runs)
  duty.legs.forEach((leg, index) => {
    leg.tourEntry = posities[index]
    if (isLeer(ritten[index])) {
      /*
       * Een leegrit heeft geen lijn. `toDuty` zet dan de naam van het lijnbestand
       * als nummer neer, en die belandde zo op het rijscherm en in de IBIS.
       * De bestemming blijft: daar hoort een IBIS-code bij ("Betriebsfahrt").
       */
      leg.leer = true
      leg.lineNumber = ''
    }
  })
  duty.lineNumbers = [...new Set(duty.legs.filter((leg) => !leg.leer).map((leg) => leg.lineNumber).filter(Boolean))]
  return duty
}

/**
 * Zoekt de omloop die OMSI rijdt in de dienstregeling van de kaart.
 *
 * De volgorde van proberen: op nummer (in de volgorde van het bestand, en op
 * vertrektijd), dan op de naam van de omloop met dezelfde rit erin, dan alleen
 * de rit. Alleen een koppeling op nummer krijgt `Duty.omsi`: dan weet
 * `readSchedule` bij elke volgende rit welke het is zonder te raden.
 */
export function koppelOmsiKeuze(map: OmsiMap, keuze: OmsiKeuze, opties: KoppelOpties): Koppeling {
  /* 1. De lijn: op naam, en anders op zijn plek in de map. */
  const lijnen = [...new Set(map.tours.map((tour) => tour.lineFile))]
  let lineFile: string | undefined
  if (!onbruikbaar(keuze.lineName)) {
    const gezocht = vouw(keuze.lineName)
    lineFile = lijnen.find((lijn) => vouw(lijn) === gezocht)
  }
  if (!lineFile && keuze.line >= 0) {
    const opPlek = opties.ttlNamen[keuze.line]
    if (opPlek) lineFile = lijnen.find((lijn) => vouw(lijn) === vouw(opPlek))
  }

  const opNaam = (): Koppeling | undefined => zoekOpNaam(map, keuze, opties, lineFile)

  /* 3 en 4. Op nummer, in beide volgordes. */
  const tour = lineFile
    ? map.tours.find((item) => item.lineFile === lineFile && item.index === keuze.tour)
    : undefined
  if (tour && keuze.tourEntry >= 0) {
    const gesorteerd = opVertrek(tour)
    const inBestand = tour.trips.find((entry) => entry.entry === keuze.tourEntry)
    const opTijd = gesorteerd[keuze.tourEntry]
    const cB = inBestand ? controle(tour, inBestand, keuze, opties) : undefined
    const cV = opTijd ? controle(tour, opTijd, keuze, opties) : undefined
    const reeksB = inBestand
      ? tour.trips.filter((entry) => entry.entry >= inBestand.entry).map((entry) => ({ entry, positie: entry.entry }))
      : []
    const reeksV = opTijd
      ? gesorteerd.slice(keuze.tourEntry).map((entry, i) => ({ entry, positie: keuze.tourEntry + i }))
      : []

    let volgorde: 'bestand' | 'vertrek' | undefined
    let zeker = false
    let rijdt = true
    if (cB?.ok && cV?.ok) {
      const zelfde = vervolg(reeksB.map((item) => item.entry)) === vervolg(reeksV.map((item) => item.entry))
      volgorde = zelfde ? 'bestand' : (opties.voorkeur ?? 'bestand')
      /*
       * Kloppen beide met een ander vervolg (22 plekken op deze installatie),
       * dan is het een gok. `zeker: false` laat `readSchedule` en het volgen
       * elke volgende rit nakijken, en dan draait het om zodra het niet klopt.
       */
      zeker = zelfde && cB.bevestigd
      rijdt = volgorde === 'bestand' ? cB.rijdt : cV.rijdt
    } else if (cB?.ok) {
      volgorde = 'bestand'
      zeker = cB.bevestigd
      rijdt = cB.rijdt
    } else if (cV?.ok) {
      volgorde = 'vertrek'
      zeker = cV.bevestigd
      rijdt = cV.rijdt
    }

    if (volgorde) {
      const reeks = volgorde === 'bestand' ? reeksB : reeksV
      /*
       * De rijdag. Rijdt deze omloop vandaag niet, dan telt OMSI misschien
       * alleen de omlopen van vandaag, en is het nummer van een andere. Wint de
       * koppeling op naam met dezelfde rit in een omloop die wel rijdt, dan
       * gaat die voor.
       */
      if (!rijdt) {
        const alternatief = opNaam()
        const eigen = reeks[0]?.entry
        if (
          alternatief?.duty &&
          alternatief.rijdt &&
          eigen &&
          !(alternatief.lineFile === tour.lineFile && alternatief.tourIndex === tour.index) &&
          vouw(alternatief.tripFile ?? '') === vouw(eigen.tripFile)
        ) {
          return alternatief
        }
        zeker = false
      }
      const duty = dienstVanOmloop(map, tour, reeks)
      if (duty) {
        const soort: Koppelsoort = volgorde === 'bestand' ? 'index' : 'vertrek'
        duty.omsi = {
          lineFile: tour.lineFile,
          lineIndex: keuze.line,
          tourIndex: tour.index,
          volgorde,
          koppeling: soort,
          zeker,
          vanaf: reeks[0].positie
        }
        const eerste = reeks[0].entry
        return {
          soort,
          duty,
          lineFile: tour.lineFile,
          tourNumber: tour.number,
          tourIndex: tour.index,
          entry: reeks[0].positie,
          tripFile: eerste.tripFile,
          departure: eerste.departure,
          volgorde,
          zeker
        }
      }
    }
  }

  /* 5. Op naam. */
  const opNaamGevonden = opNaam()
  if (opNaamGevonden) return opNaamGevonden

  /* 6. Alleen de rit. */
  const rit = zoekRit(map, keuze, opties)
  if (rit) return rit

  return { soort: 'niets', lineFile, zeker: false }
}

/** Stap 5: een omloop met (bijna) dezelfde naam en dezelfde rit erin. */
function zoekOpNaam(
  map: OmsiMap,
  keuze: OmsiKeuze,
  opties: KoppelOpties,
  lineFile: string | undefined
): Koppeling | undefined {
  if (onbruikbaar(keuze.tourName) || onbruikbaar(keuze.tripName)) return undefined
  const rit = vouw(keuze.tripName)
  const zoek = (tours: Tour[]): Array<{ tour: Tour; entry: TourTrip }> =>
    tours
      .filter((tour) => naamGelijk(keuze.tourName, tour.number))
      .flatMap((tour) => tour.trips.filter((entry) => vouw(entry.tripFile) === rit).map((entry) => ({ tour, entry })))
  let kandidaten = lineFile ? zoek(map.tours.filter((tour) => tour.lineFile === lineFile)) : []
  if (kandidaten.length === 0) kandidaten = zoek(map.tours)
  if (kandidaten.length === 0) return undefined

  const rijdt = (tour: Tour): boolean => !opties.datum || runsOn(tour.days, opties.datum, opties.kalender)
  const afstand = (entry: TourTrip): number => {
    const verschil = minutenNa(entry.departure, keuze.klok)
    return Math.min(verschil, 1440 - verschil)
  }
  /*
   * Een naam die precies klopt gaat voor een die alleen met de verminking van
   * één teken klopt, en dat weegt zwaarder dan de rijdag. Stond de rijdag
   * voorop, dan koppelde OMSI "12" aan omloop "1" -- `naamGelijk` leest "12"
   * als een verminkte "1" -- zodra "1" vandaag reed en "12" niet: een andere
   * omloop dan de speler koos. Tussen dagvarianten met dezelfde naam beslist
   * de rijdag nog wel (`probe-koppelen.ts`, "exacte naam").
   */
  const precies = (tour: Tour): boolean => vouwNaam(tour.number) === vouwNaam(keuze.tourName)
  const [beste] = [...kandidaten].sort(
    (a, b) =>
      Number(precies(b.tour)) - Number(precies(a.tour)) ||
      Number(rijdt(b.tour)) - Number(rijdt(a.tour)) ||
      Number(b.tour.index === keuze.tour) - Number(a.tour.index === keuze.tour) ||
      Number(b.entry.entry === keuze.tourEntry) - Number(a.entry.entry === keuze.tourEntry) ||
      afstand(a.entry) - afstand(b.entry)
  )
  /*
   * Het vervolg zoals het bestand het noemt. Ritten met hetzelfde vertrek, of
   * een omloop die in het bestand niet op tijd staat, raakten op vertrektijd
   * door elkaar -- en dan begon de dienst met een andere rit dan OMSI rijdt.
   */
  const reeks = beste.tour.trips
    .filter((entry) => entry.entry >= beste.entry.entry)
    .map((entry) => ({ entry, positie: entry.entry }))
  const duty = dienstVanOmloop(map, beste.tour, reeks)
  if (!duty) return undefined
  return {
    soort: 'naam',
    duty,
    lineFile: beste.tour.lineFile,
    tourNumber: beste.tour.number,
    tourIndex: beste.tour.index,
    entry: beste.entry.entry,
    tripFile: beste.entry.tripFile,
    departure: beste.entry.departure,
    zeker: false,
    rijdt: rijdt(beste.tour)
  }
}

/**
 * Stap 6: de rit die OMSI noemt, als één losse rit, op het vertrek het dichtst
 * bij de klok. Op het nummer alleen als OMSI geen bruikbare naam geeft.
 */
function zoekRit(map: OmsiMap, keuze: OmsiKeuze, opties: KoppelOpties): Koppeling | undefined {
  let trip: Trip | undefined
  if (!onbruikbaar(keuze.tripName)) {
    const gezocht = vouw(keuze.tripName)
    for (const item of map.trips.values()) {
      if (vouw(item.file) === gezocht) {
        trip = item
        break
      }
    }
  }
  /*
   * Het ritnummer alleen als de naam niets zegt. Een bruikbare naam die op
   * deze kaart niet bestaat, is een rit van een andere kaart, en dan wijst het
   * nummer in de ritlijst van DEZE kaart een willekeurige andere rit aan. De
   * navigatie tekende die route onder de naam van de rit die OMSI reed, en de
   * kaartherkenning ging daarna dicht (tegenlezing 28-09: 590 van de 728
   * keuzes van een andere kaart gaven zo een andere rit).
   */
  if (!trip && onbruikbaar(keuze.tripName) && keuze.trip >= 0 && opties.ttpNamen[keuze.trip]) {
    trip = map.trips.get(opties.ttpNamen[keuze.trip].toLowerCase())
  }
  if (!trip) return undefined

  const sleutel = trip.file.toLowerCase()
  let beste: { tour: Tour; entry: TourTrip; afstand: number } | undefined
  for (const tour of map.tours) {
    for (const entry of tour.trips) {
      if (entry.tripFile.toLowerCase() !== sleutel) continue
      const verschil = minutenNa(entry.departure, keuze.klok)
      const afstand = Math.min(verschil, 1440 - verschil)
      if (!beste || afstand < beste.afstand) beste = { tour, entry, afstand }
    }
  }
  const tour: Tour = beste?.tour ?? {
    lineFile: keuze.lineName.trim(),
    userAllowed: true,
    index: keuze.tour,
    number: keuze.tourName.trim(),
    depot: '',
    days: 0b1111111111,
    trips: []
  }
  const entry: TourTrip = beste?.entry ?? {
    tripFile: trip.file,
    profileIndex: 0,
    departure: Math.round(keuze.klok),
    entry: keuze.tourEntry
  }
  const duty = dienstVanOmloop(map, tour, [{ entry, positie: entry.entry }])
  if (!duty) return undefined
  return {
    soort: 'rit',
    duty,
    lineFile: tour.lineFile,
    tourNumber: tour.number,
    tripFile: trip.file,
    departure: entry.departure,
    zeker: false
  }
}

/**
 * Past het ritnummer van OMSI bij deze rit, op deze kaart? Eerst in de volgorde
 * van readdir, dan alfabetisch. `undefined` als het niet te zeggen valt.
 */
export function ritIndexKlopt(ttpNamen: string[], index: number, naam: string): boolean | undefined {
  if (index < 0 || onbruikbaar(naam) || ttpNamen.length === 0) return undefined
  const gezocht = vouw(naam)
  if (ttpNamen[index] !== undefined && vouw(ttpNamen[index]) === gezocht) return true
  const alfabetisch = [...ttpNamen].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
  return alfabetisch[index] !== undefined && vouw(alfabetisch[index]) === gezocht
}

/** Rijsnelheid waarmee een bus een vertrek verderop nog haalt: dertig km/u. */
const HAALBAAR_M_PER_MIN = 500

/**
 * Wat er straks vertrekt, voor wie nog geen omloop koos: eerst wat binnen 300
 * meter van de bus vertrekt, dan de rest. Per omloop één regel, het eerste
 * vertrek. Een vertrek dat de bus niet meer haalt valt weg.
 */
export function komendeVertrekken(
  alle: Vertrek[],
  opties: { klok: number; bus?: { x: number; y: number }; max?: number }
): VrijSuggestie[] {
  const klok = ((opties.klok % 1440) + 1440) % 1440
  const kandidaten: Array<VrijSuggestie & { na: number }> = []
  for (const vertrek of alle) {
    const na = minutenNa(vertrek.dep, klok)
    if (na < 2 || na > 60) continue
    const meters = opties.bus ? Math.hypot(vertrek.x - opties.bus.x, vertrek.y - opties.bus.y) : undefined
    if (meters !== undefined && na < meters / HAALBAAR_M_PER_MIN) continue
    kandidaten.push({
      lineFile: vertrek.lineFile,
      tourNumber: vertrek.tourNumber,
      lineNumber: vertrek.lineNumber,
      vertrek: vertrek.dep % 1440,
      vanaf: vertrek.vanaf,
      naar: vertrek.naar,
      uitrukken: vertrek.uitrukken,
      dichtbij: meters !== undefined && meters <= VERTREK_M,
      meters: meters === undefined ? undefined : Math.round(meters),
      na
    })
  }
  kandidaten.sort((a, b) => Number(b.dichtbij) - Number(a.dichtbij) || a.na - b.na)
  const gezien = new Set<string>()
  const uit: VrijSuggestie[] = []
  for (const { na: _na, ...regel } of kandidaten) {
    const sleutel = `${regel.lineFile}\u0000${regel.tourNumber}`
    if (gezien.has(sleutel)) continue
    gezien.add(sleutel)
    uit.push(regel)
    if (uit.length >= (opties.max ?? 5)) break
  }
  return uit
}
