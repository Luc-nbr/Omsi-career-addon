import { existsSync, readFileSync } from 'node:fs'
import { schrijfVeilig } from './veilig'
import type { ExamCriterion } from './exam'
import type { Duty } from './types'

/**
 * De drie manieren waarop je met de app kunt rijden.
 *
 * `career` is de loopbaan met rijbewijzen en examens: de app kiest de dienst.
 * `service` is vrij dienst rijden zonder die regels, met een zelfgekozen route
 * en lengte. `free` zet alleen klaar wat je zelf samenstelt -- lijn, bus, plek,
 * weer, tijd -- en biedt verder de overlay aan.
 */
export type GameMode = 'career' | 'service' | 'free'

/** Een lijnvergunning: hierop mag de chauffeur in de carrièremodus rijden. */
export interface Licence {
  mapFolder: string
  mapName: string
  /** Het lijnbestand, zoals OMSI de lijn in het dienstregelingsmenu noemt. */
  lineFile: string
  /** De lijnnummers die eronder vallen; alleen om te tonen. */
  lineNumbers: string[]
  earnedAt: string
  /** Cijfer van het examen waarmee hij gehaald is, 0-100. */
  score: number
  /** Of dit het rijexamen was: de eerste route, waarmee de loopbaan begint. */
  basic: boolean
}

/** Een afgelegd examen, geslaagd of niet. */
export interface ExamRecord {
  id: string
  takenAt: string
  mapFolder: string
  mapName: string
  lineFile: string
  lineNumbers: string[]
  basic: boolean
  passed: boolean
  score: number
  criteria: ExamCriterion[]
}

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
  /** Verkochte kaartjes tijdens deze dienst. */
  tickets?: number
  /** Aanrijdingen tijdens deze dienst. */
  collisions?: number
  /** Verbruikte brandstof, als deel van de tank. */
  fuelUsed?: number
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
  /** In welke modus de dienst is aangenomen; daar keert de app na een herstart naar terug. */
  mode?: GameMode
  /** Is dit een examenrit, dan staat hier waarvoor hij telt. */
  exam?: {
    lineFile: string
    lineNumbers: string[]
    /** Het rijexamen zelf, of een lijnexamen voor een extra route. */
    basic: boolean
  }
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
    /**
     * Kaartjes en aanrijdingen staan ook in de nulmeting, want de plugin telt
     * ze sinds het spel startte. Zonder dit zou wie twee diensten achter elkaar
     * rijdt de eerste nog eens meekrijgen.
     *
     * Optioneel: profielen van voor 19-09-2026 hebben ze niet, en dan is nul
     * het beste dat we kunnen doen.
     */
    tickets?: number
    collisions?: number
    /** Tankstand bij het begin, om het verbruik van deze dienst te kennen. */
    fuel?: number
  }
}

export interface CareerState {
  /** Id van het profiel; komt overeen met de bestandsnaam. */
  id?: string
  driver: string
  /**
   * De bestandsnaam van zijn profielfoto in `<userData>\profielfotos`, of niets.
   *
   * Met opzet de naam en niet het volledige pad: de map met gebruikersgegevens
   * verschilt per machine en per testexemplaar (`--user-data-dir`), en een
   * profiel dat een absoluut pad draagt wijst na een verhuizing naar niets.
   */
  photo?: string
  /**
   * Wanneer die foto gekozen is, in milliseconden.
   *
   * Dit is het moment waarop de app hem neerzette en niet de tijd van het
   * bestand: `copyFileSync` gaat op Windows via `CopyFileW`, en die neemt de
   * tijdstempel van het origineel mee. Gemeten in het proefscript kregen drie
   * foto's die minuten na elkaar gekozen werden alle drie een tijd uit dezelfde
   * milliseconde, want ze kwamen uit dezelfde map. Twee foto's uit hetzelfde
   * zipbestand zouden zo niet van elkaar te onderscheiden zijn, en daar hangt
   * de pagina haar `?v=` aan (zie `App.tsx`).
   */
  photoAt?: number
  startedAt: string
  entries: CareerEntry[]
  activeDuty?: ActiveDuty
  /** Waar de chauffeur op mag rijden in de carrièremodus. */
  licences: Licence[]
  /** Alle examens die hij heeft afgelegd, ook de gezakte. */
  exams: ExamRecord[]
}

/** Basisuurloon van een buschauffeur in de app-economie. */
const HOURLY_PAY = 18.5
/** Toeslag per aangedane halte; lange, drukke diensten leveren meer op. */
const PAY_PER_STOP = 0.35

export function emptyCareer(driver = 'Nieuwe chauffeur'): CareerState {
  return { driver, startedAt: new Date().toISOString(), entries: [], licences: [], exams: [] }
}

/**
 * Een loopbaan van schijf, of niets als het bestand er niet is of niet te lezen.
 *
 * Het verschil met `loadCareer` is precies het punt: een onleesbaar bestand is
 * geen nieuwe chauffeur. Wie dit gebruikt, kan dan een kopie terugzetten in
 * plaats van een lege loopbaan over de oude heen te schrijven. Zie profiles.ts.
 */
export function probeerCareer(file: string): CareerState | undefined {
  if (!existsSync(file)) return undefined
  try {
    return uitJson(JSON.parse(readFileSync(file, 'utf8')) as Partial<CareerState>)
  } catch {
    return undefined
  }
}

export function loadCareer(file: string): CareerState {
  // Een kapot logboek mag de app niet blokkeren; wie meer wil, gebruikt probeerCareer.
  return probeerCareer(file) ?? emptyCareer()
}

function uitJson(parsed: Partial<CareerState>): CareerState {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('geen loopbaan')
  }
  return {
    id: parsed.id,
    driver: parsed.driver ?? 'Nieuwe chauffeur',
    // Profielen van voor de profielfoto hebben deze velden niet.
    photo: typeof parsed.photo === 'string' ? parsed.photo : undefined,
    photoAt: typeof parsed.photoAt === 'number' ? parsed.photoAt : undefined,
    startedAt: parsed.startedAt ?? new Date().toISOString(),
    entries: Array.isArray(parsed.entries) ? parsed.entries : [],
    activeDuty:
      parsed.activeDuty && typeof parsed.activeDuty === 'object' && parsed.activeDuty.assignment
        ? parsed.activeDuty
        : undefined,
    // Profielen van voor de modi hebben deze lijsten nog niet.
    licences: Array.isArray(parsed.licences) ? parsed.licences : [],
    exams: Array.isArray(parsed.exams) ? parsed.exams : []
  }
}

/** Via een tijdelijke naam, zodat er nooit een half profiel ligt; zie veilig.ts. */
export function saveCareer(file: string, state: CareerState): void {
  schrijfVeilig(file, JSON.stringify(state, null, 2))
}

/** Wat een hele dienst oplevert. */
export function dutyPay(duty: Duty): number {
  return Math.round(((duty.durationMinutes / 60) * HOURLY_PAY + duty.totalStops * PAY_PER_STOP) * 100) / 100
}

/**
 * En wat een halve dienst oplevert: de helft.
 *
 * Betalen naar het aantal haltes dat je gehaald hebt. Anders levert een dienst
 * die je na één halte afbreekt evenveel op als een dienst die je uitrijdt, en
 * dat is niet alleen oneerlijk maar ook een uitnodiging.
 *
 * Weten we het niet -- het spel draaide niet, of de bus geeft geen haltes door
 * -- dan telt de dienst voor vol. Wat niet gemeten kon worden mag niet in het
 * nadeel van de chauffeur uitvallen.
 */
export function partialPay(duty: Duty, stopsDone?: number): number {
  if (stopsDone === undefined || !(duty.totalStops > 0)) return dutyPay(duty)
  const deel = Math.min(1, Math.max(0, stopsDone / duty.totalStops))
  return Math.round(dutyPay(duty) * deel * 100) / 100
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
    /** Hoeveel haltes er gehaald zijn; bepaalt wat de dienst oplevert. */
    stopsDone?: number
    tickets?: number
    collisions?: number
    /** Brandstof bij het begin en aan het eind, als deel van 0 tot 1. */
    fuelUsed?: number
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
    pay: partialPay(duty, measured?.stopsDone),
    drivenKm: measured?.drivenKm,
    delayMinutes: measured?.delayMinutes,
    harshBrakes: measured?.harshBrakes,
    harshAccels: measured?.harshAccels,
    tickets: measured?.tickets,
    collisions: measured?.collisions,
    fuelUsed: measured?.fuelUsed
  }
  // Afgerond is afgerond: de dienst laat het profiel los.
  return { ...state, entries: [entry, ...state.entries], activeDuty: undefined }
}

/** Mag deze chauffeur op deze lijn rijden? */
export function hasLicence(state: CareerState, mapFolder: string, lineFile: string): boolean {
  return state.licences.some(
    (licence) => licence.mapFolder === mapFolder && licence.lineFile === lineFile
  )
}

/**
 * Heeft de chauffeur zijn rijexamen gehaald? Zonder dat mag hij in de
 * carrièremodus nog niets: de eerste route is meteen de examenroute.
 */
export function isQualified(state: CareerState): boolean {
  return state.licences.length > 0
}

/**
 * Schrijft een examen in het profiel. Geslaagd levert een vergunning op; een
 * tweede keer slagen op dezelfde lijn laat de eerste staan, want de datum
 * waarop je hem haalde is het vermelden waard.
 */
export function recordExam(state: CareerState, exam: ExamRecord): CareerState {
  const licences = [...state.licences]
  if (exam.passed && !hasLicence(state, exam.mapFolder, exam.lineFile)) {
    licences.push({
      mapFolder: exam.mapFolder,
      mapName: exam.mapName,
      lineFile: exam.lineFile,
      lineNumbers: exam.lineNumbers,
      earnedAt: exam.takenAt,
      score: exam.score,
      basic: exam.basic
    })
  }
  return { ...state, licences, exams: [exam, ...state.exams], activeDuty: undefined }
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
  /** Hoeveel lijnen hij mag rijden; nul betekent: het rijexamen moet nog. */
  licences: number
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
    mapsDriven: new Set(state.entries.map((entry) => entry.mapFolder)).size,
    licences: state.licences.length
  }
}
