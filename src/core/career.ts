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
}

export interface CareerState {
  driver: string
  startedAt: string
  entries: CareerEntry[]
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
      driver: parsed.driver ?? 'Nieuwe chauffeur',
      startedAt: parsed.startedAt ?? new Date().toISOString(),
      entries: Array.isArray(parsed.entries) ? parsed.entries : []
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
  measured?: { drivenKm?: number; delayMinutes?: number }
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
    delayMinutes: measured?.delayMinutes
  }
  return { ...state, entries: [entry, ...state.entries] }
}

export interface CareerSummary {
  duties: number
  minutes: number
  stops: number
  /** Gereden kilometers, voor zover gemeten. */
  km: number
  earnings: number
  rank: string
  /** Voortgang naar de volgende rang, 0 tot 1. */
  progress: number
  nextRank?: string
  mapsDriven: number
}

/** Rangen op gereden uren; de eerste stap gaat snel, daarna wordt het rustiger. */
const RANKS: Array<{ name: string; hours: number }> = [
  { name: 'Leerling', hours: 0 },
  { name: 'Chauffeur', hours: 5 },
  { name: 'Ervaren chauffeur', hours: 20 },
  { name: 'Lijninstructeur', hours: 50 },
  { name: 'Wagenparkchef', hours: 100 }
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
