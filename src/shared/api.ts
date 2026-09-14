import type { CareerState, CareerSummary } from '../core/career'
import type { ProfileSummary } from '../core/profiles'
import type { IbisPlan } from '../core/ibis'
import type { PluginStatus } from '../core/pluginInstall'
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

/** Een toegewezen dienst met de bus die erbij gezocht is. */
export interface Assignment {
  duty: Duty
  /** Null als geen enkele geinstalleerde bus bij deze dienst past. */
  vehicle: Vehicle | null
  yard?: string
  /** Aandeel van de eindbestemmingen dat de bus kan tonen, 0 tot 1. */
  fit?: number
  /** Of de bus in het wagenpark van de kaart zelf staat. */
  fromMapFleet?: boolean
  alternatives?: number
}

/** Wat er van een dienst terecht is gekomen, gemeten via de plugin. */
export interface SessionResult {
  drivenKm: number
  elapsedMinutes: number
  delayMinutes?: number
  /** Gemeten rijstijl over deze dienst. */
  harshBrakes?: number
  harshAccels?: number
  topSpeed?: number
  /** De eindtijd is voorbij en de bus staat stil. */
  dutyComplete: boolean
  /** Onwaar zolang OMSI niet draait; dan valt er niets te meten. */
  finished: boolean
}

/**
 * De carrière zoals de interface hem krijgt. `state` is null zolang er nog geen
 * profiel bestaat; dan vraagt de app eerst om een naam.
 */
export interface CareerPayload {
  state: CareerState | null
  summary: CareerSummary | null
  profiles: ProfileSummary[]
}

/** Wat de renderer via `window.career` kan aanroepen. */
export interface CareerApi {
  status(): Promise<OmsiStatus>
  maps(): Promise<MapSummary[]>
  vehicles(): Promise<Vehicle[]>
  /** Zet de overlay-plugin klaar in OMSI en meldt de stand. */
  pluginStatus(): Promise<PluginStatus>
  /** Een rooster om uit te kiezen. */
  listDuties(request: DutyRequest): Promise<Assignment[]>
  ibis(duty: Duty, vehicle: Vehicle, year: number): Promise<IbisPlan>
  /** Opent of sluit de overlay boven het spel. Geeft terug of hij nu open is. */
  toggleOverlay(duty: Duty): Promise<boolean>
  /** Start de dienst: overlay openen en de kilometerstand vastleggen. */
  beginDuty(duty: Duty): Promise<{ connected: boolean; launched: boolean; running: boolean }>
  /** Geeft de plugin gegevens door? Zo ja, dan draait OMSI en is de kaart geladen. */
  liveConnected(): Promise<boolean>
  career(): Promise<CareerPayload>
  /** Maakt een nieuw chauffeursprofiel aan en maakt het meteen actief. */
  createProfile(name: string): Promise<CareerPayload>
  selectProfile(id: string): Promise<CareerPayload>
  deleteProfile(id: string): Promise<CareerPayload>
  /** Leest uit OMSI's eigen situatiebestand wat er van de dienst terechtkwam. */
  checkSession(): Promise<SessionResult>
  completeDuty(
    duty: Duty,
    vehicle: string,
    measured?: {
      drivenKm?: number
      delayMinutes?: number
      harshBrakes?: number
      harshAccels?: number
    }
  ): Promise<CareerPayload>
  renameDriver(name: string): Promise<CareerPayload>
}

/** Vertaalt het gekozen dagdeel naar vroegste en laatste vertrektijd in minuten. */
export const TIME_WINDOWS: Record<DutyRequest['window'], { label: string; from?: number; to?: number }> = {
  heledag: { label: 'Hele dag' },
  ochtend: { label: 'Ochtend', from: 4 * 60, to: 11 * 60 },
  middag: { label: 'Middag', from: 11 * 60, to: 16 * 60 },
  avond: { label: 'Avond', from: 16 * 60, to: 22 * 60 },
  nacht: { label: 'Nacht', from: 22 * 60, to: 30 * 60 }
}
