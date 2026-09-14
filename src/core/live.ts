import { existsSync, readFileSync } from 'node:fs'
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
}

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
    return JSON.parse(readFileSync(file, 'utf8')) as LiveData
  } catch {
    // Het bestand wordt atomair vervangen, maar een halve lezing blijft mogelijk.
    return undefined
  }
}

/** Een waarschuwing voor de chauffeur, met een reden erbij. */
export interface Advice {
  id: string
  text: string
  severity: 'info' | 'warn'
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
  /** Hoeveelste halte van deze rit, als de bus dat doorgeeft. */
  stopIndex?: number
  stopsTotal: number
  /**
   * Geeft deze bus zijn halte door? De IBIS-variabelen vullen zich pas zodra de
   * lijn en route zijn ingetoetst, en niet elk model biedt ze aan.
   */
  reportsStops: boolean
  delayMinutes: number
  delayFromIbis: boolean
  /**
   * Stemming van 0 tot 1. Alleen zinnig met passagiers aan boord: een lege bus
   * heeft niemand die ergens iets van vindt.
   */
  mood: number
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
    advice.push({ id: 'licht', text: 'Het is donker en je dimlicht staat uit.', severity: 'warn' })
  }

  if (data.velocity > 5 && (data.entryOpen > 0.5 || data.exitOpen > 0.5)) {
    advice.push({ id: 'deuren', text: 'Je rijdt met een deur open.', severity: 'warn' })
  }

  if (data.precipRate > 0.05) {
    advice.push({
      id: 'nat',
      text: 'Het regent — reken op langere remwegen.',
      severity: 'info'
    })
  }

  const brakes = data.harshBrakes - (baseline?.harshBrakes ?? 0)
  // Alleen een punt als er iemand in de bus zit om het te voelen.
  if (brakes >= 3 && data.passengers > 0) {
    advice.push({
      id: 'remmen',
      text: `${brakes} keer hard geremd; je passagiers merken dat.`,
      severity: 'warn'
    })
  }

  if (has(data, BIT.engineOn) && data.engineOn < 0.5 && data.passengers > 0) {
    advice.push({ id: 'motor', text: 'De motor staat uit met passagiers aan boord.', severity: 'info' })
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
  baseline?: { harshBrakes: number; harshAccels: number }
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
    delayMinutes,
    delayFromIbis: fromIbis !== undefined,
    mood,
    moodLabel: !hasPassengers
      ? 'leeg'
      : mood > 0.8
        ? 'tevreden'
        : mood > 0.55
          ? 'rustig'
          : mood > 0.3
            ? 'ongeduldig'
            : 'geïrriteerd',
    hasPassengers,
    harshBrakes,
    harshAccels,
    advice: buildAdvice(data, baseline),
    // Uitgereden: de eindtijd is voorbij en de bus staat stil.
    dutyComplete: Boolean(duty) && clockMinutes >= (duty as Duty).end && data.velocity < 2
  }
}
