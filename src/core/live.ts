import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Duty, DutyLeg } from './types'

/**
 * Wat de plugin elke tiende seconde wegschrijft. De namen komen uit OMSI's eigen
 * variabelentabellen; `time` is seconden na middernacht, zoals de busscripts
 * laten zien met `(L.S.Time) 3600 /` voor uren.
 */
export interface LiveData {
  alive: boolean
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
  /** Alleen gevuld op bussen met een IBIS; anders leeg. */
  busstop: string
  delayMin: string
  delaySec: string
  line: string
  terminus: string
  matrix: string
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

export interface LiveStatus {
  /** Klok in het spel, minuten na middernacht. */
  clockMinutes: number
  speedKmh: number
  passengers: number
  /** Iemand wil in- of uitstappen. */
  entryRequest: boolean
  exitRequest: boolean
  /** De rit waar je volgens de dienstkaart nu mee bezig bent. */
  legIndex: number
  leg?: DutyLeg
  /** Eerstvolgende halte volgens de IBIS; leeg op bussen zonder IBIS. */
  nextStop: string
  /** Vertraging in minuten. Negatief is voor op schema. */
  delayMinutes: number
  /** Of de vertraging van de IBIS komt of door ons is uitgerekend. */
  delayFromIbis: boolean
  /** Stemming van 0 (slecht) tot 1 (goed), afgeleid uit vertraging en rijstijl. */
  mood: number
  moodLabel: string
}

/** Vertaalt de vertragingstekst van de IBIS naar minuten. */
function ibisDelay(data: LiveData): number | undefined {
  const minutes = Number.parseFloat(data.delayMin.trim())
  if (!Number.isFinite(minutes)) return undefined
  const seconds = Number.parseFloat(data.delaySec.trim())
  return minutes + (Number.isFinite(seconds) ? seconds / 60 : 0)
}

/**
 * Legt de live gegevens naast de dienstkaart.
 *
 * De vertraging komt van de IBIS als de bus er een heeft — dat is OMSI's eigen
 * getal. Heeft de bus geen IBIS, dan rekenen we hem zelf uit tegen de
 * dienstregeling, want de klok en de geplande tijden kennen we allebei.
 */
export function describeLive(data: LiveData, duty?: Duty): LiveStatus {
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
    // Voor vertrek staat de eerste rit al klaar.
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
    // Te laat zodra de klok voorbij de geplande aankomst is.
    delayMinutes = clockMinutes > leg.arrival ? clockMinutes - leg.arrival : 0
  }

  /**
   * OMSI geeft geen passagiersstemming aan plugins door; die bestaat alleen in
   * de beoordelingen die na afloop in het chauffeursbestand belanden. Dit is dus
   * een afgeleide: vertraging weegt het zwaarst, hard rijden telt mee.
   */
  const punctuality = Math.max(0, 1 - Math.max(0, delayMinutes) / 8)
  const smoothness = data.velocity > 70 ? 0.6 : 1
  const mood = Math.max(0, Math.min(1, punctuality * smoothness))

  return {
    clockMinutes,
    speedKmh: data.velocity,
    passengers: Math.round(data.passengers),
    entryRequest: data.entryRequest > 0.5,
    exitRequest: data.exitRequest > 0.5,
    legIndex,
    leg,
    nextStop: data.busstop.trim(),
    delayMinutes,
    delayFromIbis: fromIbis !== undefined,
    mood,
    moodLabel:
      mood > 0.8 ? 'tevreden' : mood > 0.55 ? 'rustig' : mood > 0.3 ? 'ongeduldig' : 'geïrriteerd'
  }
}
