import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Duty } from './types'

/** Een gereden dienst in het logboek. */
export interface CareerEntry {
  id: string
  /** Wanneer de dienst is afgerond, in echte tijd. */
  completedAt: string
  mapFolder: string
  mapName: string
  lineNumbers: string[]
  tourNumber: string
  depot: string
  durationMinutes: number
  legCount: number
  stopCount: number
  vehicle: string
  pay: number
  /** Werkelijk gereden kilometers, gelezen uit de situatie na afloop. */
  drivenKm?: number
  /** Vertraging volgens de IBIS aan het eind van de dienst, in minuten. */
  delayMinutes?: number
  /** Gemeten rijstijl: hoe vaak er hard geremd of opgetrokken is. */
  harshBrakes?: number
  harshAccels?: number
}

/**
 * De dienst die de chauffeur heeft aangenomen en nog niet heeft afgerond.
 *
 * Hij staat in het profiel en niet alleen in het scherm: wie de app sluit of
 * herstart, heeft zijn dienst daarna nog. Alleen afronden of annuleren haalt
 * hem weg.
 */
export interface ActiveDuty {
  /** De dienst zoals hij is toegewezen, met de bus die er toen bij gezocht is. */
  assignment: unknown
  /** Pad van de bus waarmee hij gereden wordt, als de chauffeur een andere koos. */
  vehicleOverride: string
  confirmedAt: string
  /** Wanneer op "Dienst starten" is gedrukt; daarvoor is hij bevestigd maar niet begonnen. */
  startedAt?: string
  /**
   * Stand van kilometerteller en klok bij het begin. Vastgelegd zodra de plugin
   * na het starten verse gegevens geeft; draaide OMSI nog niet, dan iets later.
   */
  baseline?: {
    odometerKm: number
    clockMinutes: number
    harshBrakes: number
    harshAccels: number
  }
}

export interface CareerState {
  /** Id van het profiel; komt overeen met de bestandsnaam. */
  id?: string
  driver: string
  startedAt: string
  entries: CareerEntry[]
  activeDuty?: ActiveDuty
}

/** Basisuurloon van een buschauffeur in de app-economie. */
const HOURLY_PAY = 18.5
/** Toeslag per aangedane halte; lange, drukke diensten leveren meer op. */
const PAY_PER_STOP = 0.35

export function emptyCareer(driver = 'Nieuwe chauffeur'): CareerState {
  return { driver, startedAt: new Date().toISOString(), entries: [] }
}

export function loadCareer(file: string): CareerState {
  if (!existsSync(file)) return emptyCareer()
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<CareerState>
    return {
      id: parsed.id,
      driver: parsed.driver ?? 'Nieuwe chauffeur',
      startedAt: parsed.startedAt ?? new Date().toISOString(),
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
      activeDuty:
        parsed.activeDuty && typeof parsed.activeDuty === 'object' && parsed.activeDuty.assignment
          ? parsed.activeDuty
          : undefined
    }
  } catch {
    // Een kapot logboek mag de app niet blokkeren; we beginnen dan opnieuw.
    return emptyCareer()
  }
}

export function saveCareer(file: string, state: CareerState): void {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(state, null, 2), 'utf8')
}

/** Wat een dienst oplevert. */
export function dutyPay(duty: Duty): number {
  return Math.round(((duty.durationMinutes / 60) * HOURLY_PAY + duty.totalStops * PAY_PER_STOP) * 100) / 100
}

/** Schrijft een gereden dienst in het logboek. */
export function completeDuty(
  state: CareerState,
  duty: Duty,
  vehicle: string,
  measured?: {
    drivenKm?: number
    delayMinutes?: number
    harshBrakes?: number
    harshAccels?: number
  }
): CareerState {
  const entry: CareerEntry = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    completedAt: new Date().toISOString(),
    mapFolder: duty.mapFolder,
    mapName: duty.mapName,
    lineNumbers: duty.lineNumbers,
    tourNumber: duty.tourNumber,
    depot: duty.depot,
    durationMinutes: duty.durationMinutes,
    legCount: duty.legs.length,
    stopCount: duty.totalStops,
    vehicle,
    pay: dutyPay(duty),
    drivenKm: measured?.drivenKm,
    delayMinutes: measured?.delayMinutes,
    harshBrakes: measured?.harshBrakes,
    harshAccels: measured?.harshAccels
  }
  // Afgerond is afgerond: de dienst laat het profiel los.
  return { ...state, entries: [entry, ...state.entries], activeDuty: undefined }
}

export interface CareerSummary {
  duties: number
  minutes: number
  stops: number
  /** Gereden kilometers, voor zover gemeten. */
  km: number
  earnings: number
  /** Sleutel van de rang; de naam komt uit de vertaling ("rank.<sleutel>"). */
  rank: string
  /** Voortgang naar de volgende rang, 0 tot 1. */
  progress: number
  nextRank?: string
  mapsDriven: number
}

/** Rangen op gereden uren; de eerste stap gaat snel, daarna wordt het rustiger. */
const RANKS: Array<{ name: string; hours: number }> = [
  { name: 'leerling', hours: 0 },
  { name: 'chauffeur', hours: 5 },
  { name: 'ervaren', hours: 20 },
  { name: 'instructeur', hours: 50 },
  { name: 'chef', hours: 100 }
]

export function summarise(state: CareerState): CareerSummary {
  const minutes = state.entries.reduce((sum, entry) => sum + entry.durationMinutes, 0)
  const hours = minutes / 60
  let index = 0
  for (let i = 0; i < RANKS.length; i++) {
    if (hours >= RANKS[i].hours) index = i
  }
  const next = RANKS[index + 1]
  const floor = RANKS[index].hours
  return {
    duties: state.entries.length,
    minutes,
    stops: state.entries.reduce((sum, entry) => sum + entry.stopCount, 0),
    km: Math.round(state.entries.reduce((sum, entry) => sum + (entry.drivenKm ?? 0), 0) * 10) / 10,
    earnings: Math.round(state.entries.reduce((sum, entry) => sum + entry.pay, 0) * 100) / 100,
    rank: RANKS[index].name,
    nextRank: next?.name,
    progress: next ? Math.min(1, (hours - floor) / (next.hours - floor)) : 1,
    mapsDriven: new Set(state.entries.map((entry) => entry.mapFolder)).size
  }
}
