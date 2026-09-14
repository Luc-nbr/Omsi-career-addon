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

/** Waar de plugin zijn gegevens neerzet. */
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
}

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

  if (data.precipRate > 0.05) {
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

  let legIndex = -1
  let leg: DutyLeg | undefined
  if (duty) {
    for (let i = 0; i < duty.legs.length; i++) {
      if (duty.legs[i].departure <= clockMinutes) {
        legIndex = i
        leg = duty.legs[i]
      }
    }
    if (legIndex < 0 && duty.legs.length > 0) {
      legIndex = 0
      leg = duty.legs[0]
    }
  }

  const fromIbis = ibisDelay(data)
  let delayMinutes = 0
  if (fromIbis !== undefined) {
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

  return {
    clockMinutes,
    speedKmh: data.velocity,
    passengers: Math.round(data.passengers),
    entryRequest: data.entryRequest > 0.5,
    exitRequest: data.exitRequest > 0.5,
    doorsOpen: data.entryOpen > 0.5 || data.exitOpen > 0.5,
    legIndex,
    leg,
    nextStop: data.busstop.trim(),
    odometerKm: data.km + data.metres / 1000,
    /*
     * Alleen een voortgang tonen als de bus werkelijk iets meldt. Een index van
     * nul zonder haltenaam betekent dat de IBIS nog niet is ingetoetst, en dan
     * is "0 van 9 gehad" een bewering die nergens op slaat.
     */
    stopIndex:
      has(data, BIT.busstopIndex) && data.busstop.trim() !== ''
        ? Math.max(0, Math.round(data.busstopIndex))
        : undefined,
    stopsTotal: leg?.stops.length ?? 0,
    reportsStops: data.busstop.trim() !== '',
    offersStops: ((data.seenStr >>> 0) & 1) === 1,
    delayMinutes,
    delayFromIbis: fromIbis !== undefined,
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
    dutyComplete: duty ? isDutyComplete(data, duty, baseline) : false
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
