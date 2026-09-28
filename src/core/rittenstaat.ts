import type { Flits } from './onderweg'
import type { Duty } from './types'

/*
 * De rittenstaat: per halte gepland tegenover werkelijk vertrek.
 *
 * WAAROM DIT ER IS
 * Tot nu toe telde voor stiptheid alleen de vertraging aan het eind van de
 * dienst. Wie de hele rit te vroeg reed en bij de laatste halte even wachtte,
 * was "op tijd" -- terwijl te vroeg vertrekken in het echt de fout is: de
 * reiziger die op tijd aan de halte staat, ziet je bus nog net wegrijden. Nu
 * wordt elke halte gemeten, en telt te vroeg weg net zo goed als te laat.
 *
 * HOE ER GEMETEN WORDT
 * Het hoofdproces kijkt elke seconde naar de plugin (`volgSpoor`) en schrijft
 * op wat er gebeurt: de volgende halte die verspringt, stilstaan, wegrijden,
 * hard remmen, een aanrijding. Dat gaat regel voor regel naar een bestand, zodat
 * een crash van de app niets weggooit. Na de dienst wordt uit die regels de
 * staat opgebouwd (`bouwRittenstaat`).
 *
 * Een vertrek is het moment dat de bus bij een halte wegrijdt. Wanneer OMSI de
 * volgende halte laat verspringen -- bij aankomst, bij het sluiten van de
 * deuren of pas bij het wegrijden -- is in het spel nog niet nagekeken. Daarom
 * leunt het vertrek niet op die sprong alleen, maar op het wegrijden eromheen:
 * - stond de bus al stil en reed hij weg vóór de sprong, dan is dat wegrijden
 *   het vertrek;
 * - stond hij op het moment van de sprong nog stil, dan is het eerste
 *   wegrijden daarna het vertrek;
 * - stond hij sinds de vorige halte nergens stil, dan is hij doorgereden en
 *   telt de sprong zelf.
 * Zo klopt het vertrek hoe OMSI het ook doet. Tot dat in het spel bevestigd is,
 * heet de hele staat "voorlopig".
 *
 * WAT ER NIET GEMETEN WORDT
 * Alleen met een dienstregeling die in het menu van OMSI gekozen is en bij de
 * dienst hoort: dan weet OMSI zelf welke halte de volgende is. De IBIS-teller
 * telt in een eigen lijst en wees op Rheinhausen halte 6 aan waar de dienst
 * halte 1 had; daar wordt niets op gebouwd. Dat betekent ook: alleen op OMSI
 * 2.3.004, waar de plugin het geheugen kan lezen. Geen meting is "niet gemeten",
 * nooit een nul.
 *
 * Geoordeeld wordt alleen bij haltes met een vaste tijd in de dienstregeling
 * (`DutyLeg.stopVast`). Op de andere is de geplande tijd een verdeling naar
 * rijtijd -- een schatting -- en een schatting mag nooit als fout tellen.
 */

/** Wat de meetlus elke seconde doorgeeft. */
export interface Meting {
  /** Klok van het spel in minuten, over middernacht doorgeteld. */
  klok: number
  /** Welke rit van de dienst, en welke halte daarin de volgende is. */
  rit: number
  halte?: number
  /** Komt de halte uit het dienstregelingsmenu van OMSI? Anders wordt niets geteld. */
  uitMenu: boolean
  snelheid: number
  reizigers: number
  remmen: number
  optrekken: number
  /** Ontbreekt als OMSI geen aanrijdingen doorgeeft; dan telt er ook niets. */
  klappen?: number
  /** Verkopen met te weinig wisselgeld, opgeteld; zie `telVerkoop` in main. */
  wisselgeld?: number
}

/** Eén regel in het spoor. `k` is de klok van het spel in minuten. */
export type SpoorRegel =
  | { t: 'begin'; k: number; dienst: string }
  | { t: 'halte'; k: number; rit: number; van: number; naar: number; naarRit: number; reizigers: number }
  | { t: 'stil'; k: number }
  | { t: 'weg'; k: number }
  | { t: 'rem' | 'optrek' | 'klap' | 'wisselgeld'; k: number; rit: number; halte?: number; n: number }
  /** Geflitst; zie core/onderweg.ts. De boete staat erbij, want die geldt zoals hij toen was. */
  | { t: 'flits'; k: number; rit: number; halte?: number; paal: number; kmh: number; limiet: number; boete: number }

/** Wat de meetlus tussen twee metingen onthoudt. */
export interface MeetStand {
  rit: number
  halte?: number
  uitMenu: boolean
  stil: boolean
  remmen: number
  optrekken: number
  klappen?: number
  wisselgeld?: number
}

/** Onder deze snelheid staat de bus stil, boven de tweede rijdt hij weer. */
const STIL_KMH = 2
const WEG_KMH = 5

/**
 * Eén stap van de meetlus: wat is er sinds de vorige meting gebeurd?
 *
 * Een teller die terugloopt -- OMSI is opnieuw gestart en de plugin begint weer
 * bij nul -- is een nieuw beginpunt en geen gebeurtenis.
 */
export function volgSpoor(
  vorige: MeetStand | undefined,
  nu: Meting
): { stand: MeetStand; regels: SpoorRegel[] } {
  const stil = vorige?.stil
    ? nu.snelheid < WEG_KMH
    : nu.snelheid < STIL_KMH
  const stand: MeetStand = {
    rit: nu.rit,
    halte: nu.halte,
    uitMenu: nu.uitMenu,
    stil,
    remmen: nu.remmen,
    optrekken: nu.optrekken,
    klappen: nu.klappen,
    wisselgeld: nu.wisselgeld
  }
  if (!vorige) return { stand, regels: [] }

  const regels: SpoorRegel[] = []
  const k = nu.klok
  if (stil && !vorige.stil) regels.push({ t: 'stil', k })
  if (!stil && vorige.stil) regels.push({ t: 'weg', k })

  /*
   * De volgende halte versprong. Alleen als beide metingen uit het menu kwamen:
   * een sprong tussen de IBIS-teller en het menu is geen halte die gereden is.
   */
  if (
    vorige.uitMenu &&
    nu.uitMenu &&
    vorige.halte !== undefined &&
    nu.halte !== undefined &&
    (vorige.rit !== nu.rit || vorige.halte !== nu.halte) &&
    // Terug in dezelfde rit is OMSI dat zich bedenkt, geen gereden halte.
    !(vorige.rit === nu.rit && nu.halte < vorige.halte)
  ) {
    regels.push({
      t: 'halte',
      k,
      rit: vorige.rit,
      van: vorige.halte,
      naar: nu.halte,
      naarRit: nu.rit,
      reizigers: Math.round(nu.reizigers)
    })
  }

  const erbij = (soort: 'rem' | 'optrek' | 'klap' | 'wisselgeld', oud: number | undefined, nieuw: number | undefined): void => {
    if (oud === undefined || nieuw === undefined) return
    const n = Math.round(nieuw - oud)
    if (n > 0) regels.push({ t: soort, k, rit: nu.rit, halte: nu.uitMenu ? nu.halte : undefined, n })
  }
  erbij('rem', vorige.remmen, nu.remmen)
  erbij('optrek', vorige.optrekken, nu.optrekken)
  erbij('klap', vorige.klappen, nu.klappen)
  erbij('wisselgeld', vorige.wisselgeld, nu.wisselgeld)
  return { stand, regels }
}

/** Een halte in de rittenstaat. Tijden in minuten na middernacht. */
export interface HalteStaat {
  naam: string
  /** Het vaste vertrek, of anders de verdeelde (geschatte) tijd. */
  gepland: number
  /** Ligt `gepland` vast in de dienstregeling? Alleen dan wordt er geoordeeld. */
  vast: boolean
  /** Wanneer de bus hier wegreed; leeg als het niet gemeten is. */
  vertrek?: number
  /** Stond hij hier niet stil? */
  doorgereden?: boolean
  /** Werkelijk min gepland, in seconden. */
  verschilS?: number
  /** Te vroeg of te laat volgens de norm; alleen bij een vaste tijd. */
  oordeel?: 'vroeg' | 'laat' | 'goed'
  reizigers?: number
  /** Op weg naar deze halte. */
  remmen?: number
  optrekken?: number
  klappen?: number
  /** Verkopen met te weinig wisselgeld, en flitsen, op weg naar deze halte. */
  wisselgeld?: number
  flitsen?: Flits[]
}

export interface RitStaat {
  lijn: string
  naar: string
  vertrek: number
  haltes: HalteStaat[]
}

export interface Rittenstaat {
  /** Hoe OMSI de volgende halte laat verspringen is nog niet in het spel nagekeken. */
  voorlopig: boolean
  norm: { vroegS: number; laatS: number }
  ritten: RitStaat[]
  /** Haltes met een gemeten vertrek, en daarvan met een vaste tijd. */
  gemeten: number
  vastGemeten: number
  teVroeg: number
  teLaat: number
  /** Alle flitsen van de dienst, ook waar de halte niet bekend was. */
  flitsen?: Flits[]
}

/**
 * Wat als te vroeg en te laat telt. Voorlopig: een halve minuut te vroeg is al
 * te vroeg, want dan staat een reiziger die op tijd komt voor niets te wachten;
 * drie minuten te laat is nog binnen wat een stad accepteert. Luc kiest de
 * definitieve grens.
 */
export const NORM = { vroegS: 30, laatS: 180 }

/**
 * De rittenstaat uit het spoor.
 *
 * De laatste halte van een rit is een aankomst en geen vertrek; die krijgt geen
 * vertrek en geen oordeel.
 */
export function bouwRittenstaat(duty: Duty, regels: SpoorRegel[], norm = NORM): Rittenstaat {
  const ritten: RitStaat[] = duty.legs.map((leg) => ({
    lijn: leg.lineNumber,
    naar: leg.terminus,
    vertrek: leg.departure,
    haltes: leg.stops.map((naam, index) => {
      const vast = leg.stopVast ? leg.stopVast[index] ?? null : index === 0 ? leg.departure : null
      return {
        naam,
        gepland: vast ?? leg.stopTimes[index] ?? leg.departure,
        vast: vast !== null
      }
    })
  }))

  const halteVan = (rit: number, halte: number | undefined): HalteStaat | undefined =>
    halte === undefined ? undefined : ritten[rit]?.haltes[halte]

  // Stilstaan en wegrijden sinds de vorige sprong.
  let laatsteStil: number | undefined
  let wegNaStil: number | undefined
  /** Een sprong waarbij de bus nog stilstond: het vertrek komt bij het eerstvolgende wegrijden. */
  let wachtOpWeg: HalteStaat | undefined
  const flitsen: Flits[] = []

  for (const regel of regels) {
    switch (regel.t) {
      case 'stil':
        laatsteStil = regel.k
        wegNaStil = undefined
        break
      case 'weg':
        if (wachtOpWeg) {
          wachtOpWeg.vertrek = regel.k
          wachtOpWeg = undefined
          laatsteStil = undefined
        } else if (laatsteStil !== undefined) {
          wegNaStil = regel.k
        }
        break
      case 'halte': {
        const halte = halteVan(regel.rit, regel.van)
        const laatste = ritten[regel.rit] && regel.van === ritten[regel.rit].haltes.length - 1
        // Een vertrek dat nog op wegrijden wachtte en een nieuwe sprong ziet: dan telt de sprong.
        if (wachtOpWeg) {
          wachtOpWeg.vertrek = regel.k
          wachtOpWeg = undefined
        }
        if (halte && !laatste) {
          halte.reizigers = regel.reizigers
          if (laatsteStil === undefined) {
            halte.vertrek = regel.k
            halte.doorgereden = true
          } else if (wegNaStil !== undefined) {
            halte.vertrek = wegNaStil
          } else {
            wachtOpWeg = halte
          }
        }
        laatsteStil = undefined
        wegNaStil = undefined
        break
      }
      case 'rem':
      case 'optrek':
      case 'klap':
      case 'wisselgeld': {
        const halte = halteVan(regel.rit, regel.halte)
        if (!halte) break
        const veld =
          regel.t === 'rem' ? 'remmen' : regel.t === 'optrek' ? 'optrekken' : regel.t === 'klap' ? 'klappen' : 'wisselgeld'
        halte[veld] = (halte[veld] ?? 0) + regel.n
        break
      }
      case 'flits': {
        const flits: Flits = { paal: regel.paal, kmh: regel.kmh, limiet: regel.limiet, boete: regel.boete }
        flitsen.push(flits)
        const halte = halteVan(regel.rit, regel.halte)
        if (halte) halte.flitsen = [...(halte.flitsen ?? []), flits]
        break
      }
    }
  }

  let gemeten = 0
  let vastGemeten = 0
  let teVroeg = 0
  let teLaat = 0
  for (const rit of ritten) {
    for (const halte of rit.haltes) {
      if (halte.vertrek === undefined) continue
      gemeten += 1
      halte.verschilS = Math.round((halte.vertrek - halte.gepland) * 60)
      if (!halte.vast) continue
      vastGemeten += 1
      if (halte.verschilS < -norm.vroegS) {
        halte.oordeel = 'vroeg'
        teVroeg += 1
      } else if (halte.verschilS > norm.laatS) {
        halte.oordeel = 'laat'
        teLaat += 1
      } else {
        halte.oordeel = 'goed'
      }
    }
  }

  return {
    voorlopig: true,
    norm,
    ritten,
    gemeten,
    vastGemeten,
    teVroeg,
    teLaat,
    ...(flitsen.length > 0 ? { flitsen } : {})
  }
}

/** Een spoorbestand terug in regels; een halve laatste regel na een crash valt weg. */
export function leesSpoor(tekst: string): SpoorRegel[] {
  const regels: SpoorRegel[] = []
  for (const lijn of tekst.split('\n')) {
    if (!lijn.trim()) continue
    try {
      regels.push(JSON.parse(lijn) as SpoorRegel)
    } catch {
      // Half geschreven; de rest is bruikbaar.
    }
  }
  return regels
}
