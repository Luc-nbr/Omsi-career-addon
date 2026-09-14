import type { CareerState, CareerSummary } from '../core/career'
import type { IbisPlan } from '../core/ibis'
import type { Duty } from '../core/types'
import type { Vehicle } from '../core/vehicles'

/** Kaart zoals de UI hem toont. */
export interface MapSummary {
  folder: string
  name: string
  tours: number
  /** Heeft deze kaart een situatiebestand om de bus mee klaar te zetten? */
  hasTemplate: boolean
  /** Tijdvak waarin deze kaart speelt, overgenomen uit het sjabloon. */
  year: number
  dayOfYear: number
}

export interface OmsiStatus {
  found: boolean
  path?: string
}

export interface DutyRequest {
  mapFolder: string
  targetMinutes: number
  /** Dagdeel waarin de dienst moet beginnen. */
  window: 'heledag' | 'ochtend' | 'middag' | 'avond' | 'nacht'
}

export interface LaunchRequest {
  duty: Duty
  vehicle: Vehicle
  year: number
  dayOfYear: number
  windowed: boolean
  /** Wagenpark waarvan de bestemmingscodes gelden. */
  yard?: string
}

export interface LaunchResult {
  files: string[]
  vehiclePlaced: boolean
  /** Of het OMSI-startscherm de dienst met zijn bovenste keuze laadt. */
  startsFromMenu: boolean
  template?: string
}

/** Wat de renderer via `window.career` kan aanroepen. */
export interface CareerApi {
  status(): Promise<OmsiStatus>
  maps(): Promise<MapSummary[]>
  vehicles(): Promise<Vehicle[]>
  generateDuty(request: DutyRequest): Promise<Duty | null>
  ibis(duty: Duty, vehicle: Vehicle, year: number): Promise<IbisPlan>
  launch(request: LaunchRequest): Promise<LaunchResult>
  career(): Promise<{ state: CareerState; summary: CareerSummary }>
  completeDuty(duty: Duty, vehicle: string): Promise<{ state: CareerState; summary: CareerSummary }>
  renameDriver(name: string): Promise<{ state: CareerState; summary: CareerSummary }>
}

/** Vertaalt het gekozen dagdeel naar vroegste en laatste vertrektijd in minuten. */
export const TIME_WINDOWS: Record<DutyRequest['window'], { label: string; from?: number; to?: number }> = {
  heledag: { label: 'Hele dag' },
  ochtend: { label: 'Ochtend', from: 4 * 60, to: 11 * 60 },
  middag: { label: 'Middag', from: 11 * 60, to: 16 * 60 },
  avond: { label: 'Avond', from: 16 * 60, to: 22 * 60 },
  nacht: { label: 'Nacht', from: 22 * 60, to: 30 * 60 }
}
