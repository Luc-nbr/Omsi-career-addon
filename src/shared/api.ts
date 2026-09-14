import type { CareerState, CareerSummary } from '../core/career'
import type { ProfileSummary } from '../core/profiles'
import type { MapGeometry } from '../core/geo'
import type { IbisPlan } from '../core/ibis'
import type { PluginStatus } from '../core/pluginInstall'
import type { Duty } from '../core/types'
import type { Vehicle } from '../core/vehicles'
import type { Settings } from '../core/settings'
import type { OverlayLayout } from './overlay'

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

export interface PrinterInfo {
  name: string
  displayName: string
  isDefault: boolean
}

export interface ReceiptPayload {
  duty: Duty
  ibis?: IbisPlan
  vehicle?: string
}

export interface PrintResult {
  ok: boolean
  reason?: string
}

/** Wat de renderer via `window.career` kan aanroepen. */
export interface CareerApi {
  status(): Promise<OmsiStatus>
  maps(): Promise<MapSummary[]>
  vehicles(): Promise<Vehicle[]>
  /** Halteposities van een kaart, om te tonen waar je de bus neerzet. */
  geometry(mapFolder: string): Promise<MapGeometry>
  /**
   * De route van elke rit als lijn over de kaart, afwisselend x en y in meters.
   * Een lege lijn als de haltes van die rit niet op de kaart staan.
   */
  routes(mapFolder: string, legs: Array<{ tripFile: string; stopIds: string[] }>): Promise<number[][]>
  settings(): Promise<Settings>
  saveSettings(settings: Settings): Promise<Settings>
  /** Zet de overlay in of uit de bewerkstand; geeft terug of hij nu aan staat. */
  editOverlay(on?: boolean): Promise<boolean>
  /** Meldt of de muis boven een knop van de overlay hangt. */
  overlayHit(on: boolean): Promise<void>
  overlayLayout(): Promise<OverlayLayout>
  saveOverlayLayout(layout: OverlayLayout): Promise<OverlayLayout>
  resetOverlayLayout(): Promise<OverlayLayout>
  /** Zet de overlay-plugin klaar in OMSI en meldt de stand. */
  pluginStatus(): Promise<PluginStatus>
  /** Een rooster om uit te kiezen. */
  listDuties(request: DutyRequest): Promise<Assignment[]>
  ibis(duty: Duty, vehicle: Vehicle, year: number): Promise<IbisPlan>
  /** Zet de overlay boven het spel open of dicht. Geeft terug of hij nu open is. */
  setOverlay(duty: Duty | undefined, open: boolean): Promise<boolean>
  overlayIsOpen(): Promise<boolean>
  /** Meldt elke keer dat de overlay open of dicht gaat, van waar ook. Geeft een afmelder terug. */
  onOverlayState(handler: (open: boolean) => void): () => void
  /** Voor de overlay zelf: sluit hem. */
  closeOverlay(): Promise<void>
  /**
   * Neemt een dienst aan. Hij staat daarna in het profiel en blijft vast tot hij
   * is afgerond of geannuleerd; zolang kan er geen andere worden aangenomen.
   */
  confirmDuty(assignment: Assignment, vehicleOverride: string): Promise<CareerPayload>
  /** Geeft de aangenomen dienst terug zonder hem te boeken. */
  cancelDuty(): Promise<CareerPayload>
  /** Start de dienst: overlay openen en de kilometerstand vastleggen. */
  beginDuty(duty: Duty): Promise<{ connected: boolean; launched: boolean; running: boolean }>
  /** Geeft de plugin gegevens door? Zo ja, dan draait OMSI en is de kaart geladen. */
  liveConnected(): Promise<boolean>
  /** Printers die Windows kent, standaardprinter vooraan. */
  printers(): Promise<PrinterInfo[]>
  /** Drukt het dienstkaartje af op een bonprinter van 80 mm. */
  printReceipt(payload: ReceiptPayload, deviceName?: string): Promise<PrintResult>
  /** Toont het kaartje in een venster zonder af te drukken. */
  previewReceipt(payload: ReceiptPayload): Promise<PrintResult>
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
