import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { Duty, DutyLeg } from './types'

/**
 * Wat de plugin elke tiende seconde wegschrijft. De namen komen uit OMSI's eigen
 * variabelentabellen; `time` is seconden na middernacht, zoals de busscripts
 * laten zien met `(L.S.Time) 3600 /` voor uren, en `velocity` is km/h, want die
 * scripts delen hem door 3.6 voor hun natuurkunde.
 */
export interface LiveData {
  alive: boolean
  /** Bitmasker van de variabelen die OMSI werkelijk heeft doorgegeven. */
  seen: number
  /** Idem voor de stringvariabelen. */
  seenStr: number
  /** Hoe de tekst binnenkwam: 0 niets, 1 als bytes, 2 als twee bytes per teken. */
  strKind: number
  time: number
  day: number
  month: number
  year: number
  velocity: number
  passengers: number
  scheduleActive: number
  targetIndex: number
  tankPercent: number
  km: number
  metres: number
  entryRequest: number
  exitRequest: number
  ticket: number
  entryOpen: number
  exitOpen: number
  atStation: number
  brightness: number
  streetCond: number
  precipRate: number
  precipType: number
  lightsLow: number
  blinkerLeft: number
  blinkerRight: number
  brakeLight: number
  engineOn: number
  busstopIndex: number
  /** Rijstijl, opgeteld sinds het spel startte. */
  maxBrake: number
  maxAccel: number
  topSpeed: number
  harshBrakes: number
  harshAccels: number
  /** Alleen gevuld op bussen met een IBIS; anders leeg. */
  busstop: string
  delayMin: string
  delaySec: string
  line: string
  terminus: string
  matrix: string
  /** Hoe oud het bestand is, in milliseconden. Zet de app zelf, niet de plugin. */
  ageMs?: number
  /** Welke OMSI draait, zoals de plugin die in het programma zelf las. */
  exeVersion?: string
  /** Rechtstreeks uit het geheugen van OMSI; alleen op 2.3.004, zie omsicareer.c. */
  mem?: MemoryData
}

export interface MemoryData {
  /** 1 als het voertuig van de speler gevonden en de positie aannemelijk is. */
  ok: number
  /** Index in de tegellijst van global.cfg. */
  tile: number
  /** Positie binnen de tegel, zoals Direct3D hem kent. */
  x: number
  y: number
  z: number
  qx: number
  qy: number
  qz: number
  qw: number
  /** Wat het dienstregelingsmenu van OMSI op de bus zette. */
  schedActive: number
  line: number
  tour: number
  tourEntry: number
  trip: number
  nextIndex: number
  nextDist: number
  delay: number
  lineName: string
  tourName: string
  tripName: string
  nextStop: string
}

/**
 * Ouder dan dit is een live-bestand geen live meer. De plugin schrijft tien keer
 * per seconde; wie OMSI hard afsluit laat een bestand achter dat "alive" zegt.
 */
const LIVE_STALE_MS = 15000

/** Zoveel moet er sinds het starten gereden zijn voordat een dienst vanzelf af kan zijn. */
const MIN_DRIVEN_KM = 1

/**
 * Bitposities in `seen`, gelijk aan de volgorde in OMSICareer.opl. Alles vanaf
 * `lightsLow` komt uit de scripts van het busmodel en ontbreekt op bussen die
 * het niet kent — dan mag de app er geen conclusie aan verbinden.
 */
const BIT = {
  lightsLow: 17,
  blinkerLeft: 18,
  blinkerRight: 19,
  brakeLight: 20,
  engineOn: 21,
  busstopIndex: 22
} as const

function has(data: LiveData, bit: number): boolean {
  return ((data.seen >>> bit) & 1) === 1
}

/**
 * Waar de plugin zijn gegevens neerzet.
 *
 * De map heet nog naar de oude naam van de app. Dat pad zit ingebakken in de
 * DLL die in OMSI draait; meeveranderen betekent de plugin opnieuw bouwen en
 * bij iedereen vervangen, en daar wint niemand iets mee.
 */
export function livePath(): string {
  return join(process.env.LOCALAPPDATA ?? '', 'OMSI Career', 'live.json')
}

/** Leest de laatste stand. Geeft `undefined` als OMSI niet draait. */
export function readLive(): LiveData | undefined {
  const file = livePath()
  if (!existsSync(file)) return undefined
  try {
    const data = JSON.parse(readFileSync(file, 'utf8')) as LiveData
    data.ageMs = Date.now() - statSync(file).mtimeMs
    return data
  } catch {
    // Het bestand wordt atomair vervangen, maar een halve lezing blijft mogelijk.
    return undefined
  }
}

/** Een waarschuwing voor de chauffeur, met een reden erbij. */
export interface Advice {
  /** Sleutel van de melding; de tekst komt uit de vertaling ("advice.<id>"). */
  id: string
  severity: 'info' | 'warn'
  /** Getal in de melding, als er een in voorkomt. */
  count?: number
}

export interface LiveStatus {
  /** Klok in het spel, minuten na middernacht. */
  clockMinutes: number
  speedKmh: number
  passengers: number
  entryRequest: boolean
  exitRequest: boolean
  doorsOpen: boolean
  /** De rit waar je volgens de dienstkaart nu mee bezig bent. */
  legIndex: number
  leg?: DutyLeg
  /** Eerstvolgende halte volgens de IBIS; leeg op bussen zonder IBIS. */
  nextStop: string
  /** Kilometerstand van de bus; hiermee schatten we hoe ver hij gevorderd is. */
  odometerKm: number
  /** Hoeveelste halte van deze rit, als de bus dat doorgeeft. */
  stopIndex?: number
  stopsTotal: number
  /**
   * Geeft deze bus zijn halte door? De IBIS-variabelen vullen zich pas zodra de
   * lijn en route zijn ingetoetst, en niet elk model biedt ze aan.
   */
  reportsStops: boolean
  /** Biedt deze bus halte-informatie uberhaupt aan? */
  offersStops: boolean
  delayMinutes: number
  delayFromIbis: boolean
  /**
   * Hoeveel seconden je voor of achter ligt op de dienstregeling, gerekend
   * tegen de tijd die bij de eerstvolgende halte hoort. Positief is te laat.
   * Niets als er geen halte bekend is om tegen af te zetten.
   */
  deltaSeconds?: number
  /**
   * Stemming van 0 tot 1. Alleen zinnig met passagiers aan boord: een lege bus
   * heeft niemand die ergens iets van vindt.
   */
  mood: number
  /** Sleutel van de stemming; de tekst komt uit de vertaling ("mood.<sleutel>"). */
  moodLabel: string
  hasPassengers: boolean
  harshBrakes: number
  harshAccels: number
  advice: Advice[]
  /** De dienst is uitgereden: eindtijd voorbij en de bus staat stil. */
  dutyComplete: boolean
  /**
   * Kan de app in OMSI kijken? Dan weet hij waar de bus staat en welke
   * dienstregeling in het menu gekozen is. Zo niet (een andere OMSI-versie),
   * dan valt hij terug op wat de IBIS meldt.
   */
  omsiReadable: boolean
  /** Wat de speler in OMSI's dienstregelingsmenu koos, als dat bekend is. */
  schedule?: OmsiSchedule
}

export interface OmsiSchedule {
  lineName: string
  tourName: string
  tripName: string
  /** Hoort de gekozen rit bij de dienst die in de app is bevestigd? */
  matchesDuty: boolean
  /** Welke rit van de dienst dat is. */
  legIndex?: number
}

/** "TTData\\92 Fd-Sg.ttp" en "92 fd-sg" zijn dezelfde rit. */
function tripKey(name: string): string {
  const base = name.trim().split(/[\\/]/).pop() ?? ''
  return base.replace(/\.ttp$/i, '').trim().toLowerCase()
}

/**
 * Welke dienstregeling staat er op de bus, en past die bij de dienst? Een rit
 * komt in een dienst soms twee keer voor (heen en terug heten anders, maar een
 * omloop kan dezelfde rit later nog eens rijden): dan de rit die op de klok het
 * dichtst bij ligt.
 */
function readSchedule(data: LiveData, duty: Duty | undefined, clockMinutes: number): OmsiSchedule | undefined {
  const mem = data.mem
  if (!mem || mem.ok !== 1 || !mem.tripName.trim()) return undefined
  /*
   * Alleen een dienstregeling die daadwerkelijk rijdt. Terwijl het venster Set
   * Time Table openstaat houdt OMSI de rit die je aan het bekijken bent al in
   * het geheugen; daarop afgaan vult de overlay met een dienst die de chauffeur
   * nog niet gekozen heeft.
   */
  if (!(mem.schedActive > 0.5)) return undefined
  const key = tripKey(mem.tripName)
  let legIndex: number | undefined
  if (duty) {
    let best = Infinity
    duty.legs.forEach((leg, index) => {
      if (tripKey(leg.tripFile) !== key) return
      const distance = Math.abs(leg.departure - clockMinutes)
      if (distance < best) {
        best = distance
        legIndex = index
      }
    })
  }
  /*
   * De omloop van de rit die erbij hoort, niet die van de hele dienst: een
   * dienst kan onderweg overstappen, en dan staat er in OMSI een andere omloop
   * dan waarmee hij begon.
   */
  const leg = duty && legIndex !== undefined ? duty.legs[legIndex] : undefined
  const tourMatches = !leg || !mem.tourName.trim() || mem.tourName.trim() === leg.tourNumber.trim()
  return {
    lineName: mem.lineName.trim(),
    tourName: mem.tourName.trim(),
    tripName: mem.tripName.trim(),
    matchesDuty: legIndex !== undefined && tourMatches,
    legIndex
  }
}

/**
 * Welke halte van de rit OMSI bedoelt met de naam die hij doorgeeft.
 *
 * Het nummer dat OMSI erbij levert is niet ons nummer: het telt in zijn eigen
 * lijst en die loopt anders. Gemeten op Rheinhausen, rit 35_DIAK_BREIT: OMSI
 * meldde halte 6 "Rothhauser Strasse", terwijl dat bij ons halte 1 is en halte
 * 6 "Plankenhof" heet. Op het nummer afgaan wijst dus de verkeerde halte aan,
 * en rekent ook het verschil met de dienstregeling tegen de verkeerde tijd af.
 *
 * De naam is wel dezelfde -- beide komen uit de dienstregeling van de kaart.
 * Komt een halte twee keer voor in dezelfde rit, dan wint die waarvan de
 * geplande tijd het dichtst ligt bij waar we volgens de klok zouden moeten zijn.
 */
function stopIndexByName(
  leg: DutyLeg | undefined,
  name: string,
  clockMinutes: number,
  delayMinutes: number
): number | undefined {
  const wanted = name.trim().toLowerCase()
  if (!leg || !wanted) return undefined
  const onSchedule = clockMinutes - delayMinutes
  let best: number | undefined
  let closest = Infinity
  leg.stops.forEach((stop, index) => {
    if (stop.trim().toLowerCase() !== wanted) return
    const when = leg.stopTimes[index]
    const gap = when === undefined ? 0 : Math.abs(when - onSchedule)
    if (gap < closest) {
      closest = gap
      best = index
    }
  })
  return best
}

/**
 * Welke halte aan de beurt is volgens de klok.
 *
 * Terugval voor als OMSI een naam meldt die niet in deze rit voorkomt. Zijn
 * nummer overnemen kan niet -- dat telt in zijn eigen lijst -- en dan zou de
 * halteteller ineens tien plaatsen verspringen. De klok weet het ook: de eerste
 * halte waarvan de geplande tijd nog voor ons ligt.
 */
function stopIndexByTime(
  leg: DutyLeg | undefined,
  clockMinutes: number,
  delayMinutes: number
): number | undefined {
  if (!leg || leg.stopTimes.length === 0) return undefined
  const onSchedule = clockMinutes - delayMinutes
  const at = leg.stopTimes.findIndex((when) => when >= onSchedule)
  return at >= 0 ? at : Math.max(0, leg.stops.length - 1)
}

/**
 * Het verschil met de dienstregeling, op de seconde.
 *
 * De klok van het spel en de tijd die bij de eerstvolgende halte hoort staan
 * allebei in minuten; het verschil daartussen is wat de chauffeur wil weten.
 * Rond middernacht loopt de een door en de ander niet, dus een verschil van
 * meer dan een paar uur is een dagovergang en geen vertraging.
 */
function scheduleDelta(
  leg: DutyLeg | undefined,
  stopIndex: number | undefined,
  clockMinutes: number
): number | undefined {
  if (!leg || stopIndex === undefined || leg.stopTimes.length === 0) return undefined
  const scheduled = leg.stopTimes[Math.min(Math.max(stopIndex, 0), leg.stopTimes.length - 1)]
  if (scheduled === undefined) return undefined
  let difference = clockMinutes - scheduled
  if (difference > 720) difference -= 1440
  if (difference < -720) difference += 1440
  if (Math.abs(difference) > 180) return undefined
  return Math.round(difference * 60)
}

/**
 * Groter dan dit is geen vertraging maar rommel uit een geheugenplek die nog
 * niet in gebruik is. Drie uur te laat haalt geen enkele dienstregeling.
 */
const MAX_SENSIBLE_DELAY_S = 3 * 3600

/** Vertaalt de vertragingstekst van de IBIS naar minuten. */
function ibisDelay(data: LiveData): number | undefined {
  const minutes = Number.parseFloat(data.delayMin.trim())
  if (!Number.isFinite(minutes)) return undefined
  const seconds = Number.parseFloat(data.delaySec.trim())
  return minutes + (Number.isFinite(seconds) ? seconds / 60 : 0)
}

/**
 * Waarschuwingen op grond van wat de bus werkelijk doorgeeft.
 *
 * Alleen variabelen die OMSI heeft aangeroepen tellen mee. Een bus die zijn
 * lichten niet als variabele aanbiedt staat niet "met het licht uit" — we weten
 * het simpelweg niet, en daar hoort geen waarschuwing bij.
 */
function buildAdvice(data: LiveData, baseline?: { harshBrakes: number; harshAccels: number }): Advice[] {
  const advice: Advice[] = []

  if (has(data, BIT.lightsLow) && data.brightness < 0.35 && data.lightsLow < 0.5) {
    advice.push({ id: 'licht', severity: 'warn' })
  }

  if (data.velocity > 5 && (data.entryOpen > 0.5 || data.exitOpen > 0.5)) {
    advice.push({ id: 'deuren', severity: 'warn' })
  }

  /*
   * Het wegdek, niet de lucht. `precipRate` staat ook bij droog weer op een
   * waarde -- in een sessie zonder een druppel regen stond hij op 0,125 terwijl
   * `streetCond` netjes nul aangaf. Dat laatste is bovendien waar het om gaat:
   * een natte weg remt slechter, of het nu regent of net opgehouden is.
   */
  if (data.streetCond > 0.1) {
    advice.push({ id: 'nat', severity: 'info' })
  }

  const brakes = data.harshBrakes - (baseline?.harshBrakes ?? 0)
  // Alleen een punt als er iemand in de bus zit om het te voelen.
  if (brakes >= 3 && data.passengers > 0) {
    advice.push({ id: 'remmen', severity: 'warn', count: brakes })
  }

  if (has(data, BIT.engineOn) && data.engineOn < 0.5 && data.passengers > 0) {
    advice.push({ id: 'motor', severity: 'info' })
  }

  return advice
}

/**
 * Legt de live gegevens naast de dienstkaart.
 *
 * De vertraging komt van de IBIS als de bus er een heeft — dat is OMSI's eigen
 * getal. Heeft de bus geen IBIS, dan rekenen we hem zelf uit tegen de
 * dienstregeling, want de klok en de geplande tijden kennen we allebei.
 */
export function describeLive(
  data: LiveData,
  duty?: Duty,
  baseline?: { harshBrakes: number; harshAccels: number; odometerKm?: number; clockMinutes?: number }
): LiveStatus {
  const clockMinutes = data.time / 60

  /*
   * Welke rit aan de beurt is volgens de klok: de eerste die nog niet is
   * aangekomen. Dat is de rit die nu rijdt, of -- als de bus op het eindpunt
   * staat te wachten -- de rit die zo vertrekt.
   *
   * Hier stond eerst de laatste rit die al vertrokken was, en die bleef staan
   * nadat hij was aangekomen. Dan lag de gereden route nog op de kaart terwijl
   * de chauffeur al aan de volgende begon, met de instructies van een rit van
   * een half uur geleden erbij.
   */
  let legIndex = -1
  let leg: DutyLeg | undefined
  if (duty && duty.legs.length > 0) {
    const ahead = duty.legs.findIndex((item) => item.arrival > clockMinutes)
    legIndex = ahead >= 0 ? ahead : duty.legs.length - 1
    leg = duty.legs[legIndex]
  }

  // Wat in OMSI zelf gekozen is, gaat voor de klok: dat is de rit die gereden wordt.
  const omsiReadable = data.mem?.ok === 1
  const schedule = omsiReadable ? readSchedule(data, duty, clockMinutes) : undefined
  const fromMenu = Boolean(schedule?.matchesDuty && schedule.legIndex !== undefined && duty)
  if (fromMenu && duty && schedule?.legIndex !== undefined) {
    legIndex = schedule.legIndex
    leg = duty.legs[legIndex]
  }

  const fromIbis = ibisDelay(data)
  let delayMinutes = 0
  if (fromMenu && data.mem && Math.abs(data.mem.delay) <= MAX_SENSIBLE_DELAY_S) {
    // OMSI houdt de vertraging van een rijdende dienstregeling in seconden bij.
    delayMinutes = data.mem.delay / 60
  } else if (fromIbis !== undefined) {
    delayMinutes = fromIbis
  } else if (leg) {
    delayMinutes = clockMinutes > leg.arrival ? clockMinutes - leg.arrival : 0
  }

  const harshBrakes = Math.max(0, data.harshBrakes - (baseline?.harshBrakes ?? 0))
  const harshAccels = Math.max(0, data.harshAccels - (baseline?.harshAccels ?? 0))

  /**
   * Stemming uit gemeten gedrag: vertraging weegt het zwaarst, daarna hard
   * remmen en optrekken. OMSI geeft geen passagiersstemming door — die bestaat
   * alleen in de beoordelingen die na afloop in het chauffeursbestand belanden —
   * maar dit is wel op echte metingen gebaseerd in plaats van op een gok.
   */
  const punctuality = Math.max(0, 1 - Math.max(0, delayMinutes) / 8)
  const smoothness = Math.max(0, 1 - (harshBrakes * 0.08 + harshAccels * 0.05))
  const mood = Math.max(0, Math.min(1, punctuality * 0.6 + smoothness * 0.4))
  const hasPassengers = data.passengers >= 1

  /*
   * Alleen een voortgang tonen als de bus werkelijk iets meldt. Een index van
   * nul zonder haltenaam betekent dat de IBIS nog niet is ingetoetst, en dan
   * is "0 van 9 gehad" een bewering die nergens op slaat. Met een dienstregeling
   * uit het menu weet OMSI zelf welke halte de volgende is.
   */
  /*
   * De naam gaat voor het nummer: dat van OMSI telt in zijn eigen lijst en komt
   * niet overeen met de onze. Zonder naam blijft het nummer over, en zonder
   * dienstregeling in het menu de teller van de IBIS.
   */
  const byName = fromMenu && data.mem ? stopIndexByName(leg, data.mem.nextStop, clockMinutes, delayMinutes) : undefined
  const stopIndex = fromMenu
    ? byName ?? stopIndexByTime(leg, clockMinutes, delayMinutes)
    : has(data, BIT.busstopIndex) && data.busstop.trim() !== ''
      ? Math.max(0, Math.round(data.busstopIndex))
      : undefined

  return {
    clockMinutes,
    speedKmh: data.velocity,
    passengers: Math.round(data.passengers),
    entryRequest: data.entryRequest > 0.5,
    exitRequest: data.exitRequest > 0.5,
    doorsOpen: data.entryOpen > 0.5 || data.exitOpen > 0.5,
    legIndex,
    leg,
    nextStop: fromMenu && data.mem ? data.mem.nextStop.trim() : data.busstop.trim(),
    odometerKm: data.km + data.metres / 1000,
    stopIndex,
    stopsTotal: leg?.stops.length ?? 0,
    reportsStops: fromMenu || data.busstop.trim() !== '',
    offersStops: fromMenu || ((data.seenStr >>> 0) & 1) === 1,
    delayMinutes,
    delayFromIbis: fromMenu || fromIbis !== undefined,
    /*
     * Rijdt er een dienstregeling in OMSI, dan houdt het spel het verschil zelf
     * op de seconde bij; dat is hetzelfde getal dat de chauffeur in het spel
     * ziet. Alleen zonder die dienstregeling rekenen we het zelf uit, tegen de
     * tijd die bij de eerstvolgende halte hoort.
     */
    /*
     * Eén bron tegelijk. Rijdt er een dienstregeling in OMSI, dan is dat het
     * getal van OMSI en niets anders: onze eigen som meet tegen de aankomsttijd
     * van de volgende halte en komt daardoor een paar minuten anders uit. Door
     * tussen die twee te wisselen sprong het verschil heen en weer zonder dat er
     * iets gebeurd was. Slaat het getal van OMSI nergens op, dan tonen we liever
     * niets dan een ander soort getal.
     */
    deltaSeconds: fromMenu
      ? data.mem && Math.abs(data.mem.delay) <= MAX_SENSIBLE_DELAY_S
        ? Math.round(data.mem.delay)
        : undefined
      : scheduleDelta(leg, stopIndex, clockMinutes),
    mood,
    moodLabel: !hasPassengers
      ? 'empty'
      : mood > 0.8
        ? 'happy'
        : mood > 0.55
          ? 'calm'
          : mood > 0.3
            ? 'impatient'
            : 'annoyed',
    hasPassengers,
    harshBrakes,
    harshAccels,
    advice: buildAdvice(data, baseline),
    dutyComplete: duty ? isDutyComplete(data, duty, baseline) : false,
    omsiReadable,
    schedule
  }
}

/**
 * Is de dienst werkelijk uitgereden?
 *
 * Alleen "eindtijd voorbij en de bus staat stil" was te weinig: stond de klok in
 * het spel toevallig later dan de dienst, of lag er nog een live-bestand van een
 * vorige keer, dan was een net gestarte dienst na vijf seconden al "af" en boekte
 * de app hem weg. Nu moet er ook echt gereden zijn: OMSI draait, de gegevens zijn
 * vers, er is sinds het starten minstens een kilometer afgelegd en minstens de
 * helft van de dienstduur verstreken.
 */
function isDutyComplete(
  data: LiveData,
  duty: Duty,
  baseline?: { odometerKm?: number; clockMinutes?: number }
): boolean {
  if (!data.alive || (data.ageMs !== undefined && data.ageMs > LIVE_STALE_MS)) return false
  if (baseline?.odometerKm === undefined || baseline.clockMinutes === undefined) return false

  const driven = data.km + data.metres / 1000 - baseline.odometerKm
  if (driven < MIN_DRIVEN_KM) return false

  const clock = data.time / 60
  let elapsed = clock - baseline.clockMinutes
  if (elapsed < 0) elapsed += 1440
  if (elapsed < duty.durationMinutes / 2) return false

  // Diensten na middernacht hebben eindtijden boven 24:00; de klok springt terug.
  const clockOnDutyDay = duty.end >= 1440 && clock < duty.start - 60 ? clock + 1440 : clock
  return clockOnDutyDay >= duty.end && data.velocity < 2
}
