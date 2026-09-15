import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { emptyCareer, loadCareer, saveCareer, summarise, type CareerState } from './career'

/**
 * Elke chauffeur is een eigen profiel met een eigen logboek, lokaal opgeslagen
 * in de gegevensmap van de app. Meerdere profielen naast elkaar mag: een
 * doordeweekse chauffeur in Spandau en een weekendrijder in Hamburg hoeven
 * elkaars kilometers niet te delen.
 */
export interface ProfileSummary {
  id: string
  driver: string
  startedAt: string
  duties: number
  minutes: number
  /** Staat er nog een dienst open? Dan wacht die op deze chauffeur. */
  onDuty: boolean
  /** Hoeveel lijnen hij mag rijden in de carrieremodus. */
  licences: number
}

const PROFILE_DIR = 'profiles'
const ACTIVE_FILE = 'active.json'

function dir(userData: string): string {
  const path = join(userData, PROFILE_DIR)
  mkdirSync(path, { recursive: true })
  return path
}

function fileFor(userData: string, id: string): string {
  return join(dir(userData), `${id}.json`)
}

/** Id's blijven bestandsnaamvriendelijk; de weergavenaam mag alles zijn. */
function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

/**
 * Haalt een oud `career.json` binnen als eerste profiel. De app kende eerder
 * maar één chauffeur; dat logboek hoort niet verloren te gaan.
 */
function migrateLegacy(userData: string): void {
  const legacy = join(userData, 'career.json')
  if (!existsSync(legacy)) return
  if (readdirSync(dir(userData)).some((entry) => entry.endsWith('.json'))) return

  const state = loadCareer(legacy)
  const id = newId()
  saveCareer(fileFor(userData, id), { ...state, id })
  setActive(userData, id)
  try {
    renameSync(legacy, `${legacy}.overgenomen`)
  } catch {
    // Blijft het oude bestand staan, dan is dat hooguit rommel.
  }
}

export function listProfiles(userData: string): ProfileSummary[] {
  migrateLegacy(userData)
  const entries: ProfileSummary[] = []
  for (const name of readdirSync(dir(userData))) {
    if (!name.endsWith('.json') || name === ACTIVE_FILE) continue
    const state = loadCareer(join(dir(userData), name))
    const summary = summarise(state)
    entries.push({
      id: name.replace(/\.json$/, ''),
      driver: state.driver,
      startedAt: state.startedAt,
      duties: summary.duties,
      minutes: summary.minutes,
      onDuty: Boolean(state.activeDuty),
      licences: state.licences.length
    })
  }
  return entries.sort((a, b) => a.startedAt.localeCompare(b.startedAt))
}

export function createProfile(userData: string, driver: string): CareerState {
  const id = newId()
  const state: CareerState = { ...emptyCareer(driver.trim() || 'Nieuwe chauffeur'), id }
  saveCareer(fileFor(userData, id), state)
  setActive(userData, id)
  return state
}

export function readProfile(userData: string, id: string): CareerState | undefined {
  const file = fileFor(userData, id)
  return existsSync(file) ? { ...loadCareer(file), id } : undefined
}

export function writeProfile(userData: string, state: CareerState): void {
  if (!state.id) return
  saveCareer(fileFor(userData, state.id), state)
}

export function deleteProfile(userData: string, id: string): void {
  const file = fileFor(userData, id)
  if (existsSync(file)) unlinkSync(file)
  if (getActive(userData) === id) {
    const first = listProfiles(userData)[0]
    if (first) setActive(userData, first.id)
    else writeFileSync(join(dir(userData), ACTIVE_FILE), JSON.stringify({ id: null }), 'utf8')
  }
}

export function getActive(userData: string): string | undefined {
  const file = join(dir(userData), ACTIVE_FILE)
  if (!existsSync(file)) return undefined
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { id?: string | null }
    return parsed.id ?? undefined
  } catch {
    return undefined
  }
}

export function setActive(userData: string, id: string): void {
  writeFileSync(join(dir(userData), ACTIVE_FILE), JSON.stringify({ id }), 'utf8')
}

/**
 * Het profiel waarmee de app opstart: het laatst gebruikte, of anders het
 * eerste dat er is. Zijn er helemaal geen, dan vraagt de app om een naam.
 */
export function resolveActive(userData: string): CareerState | undefined {
  const profiles = listProfiles(userData)
  if (profiles.length === 0) return undefined
  const active = getActive(userData)
  const chosen = profiles.find((profile) => profile.id === active) ?? profiles[0]
  setActive(userData, chosen.id)
  return readProfile(userData, chosen.id)
}
