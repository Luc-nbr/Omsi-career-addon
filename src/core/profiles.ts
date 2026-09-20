import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { extname, join, resolve, sep } from 'node:path'
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
  /** De bestandsnaam van zijn profielfoto, of niets als hij er geen heeft. */
  photo?: string
  /**
   * Wanneer die foto gekozen is, in milliseconden.
   *
   * Dit staat erbij omdat een vervangen foto dezelfde bestandsnaam houdt
   * (`<id>.<ext>`) en dus dezelfde URL, en Chromium dan helemaal niet opnieuw
   * ophaalt: gemeten met het proefscript bleef na een vervanging van 24x24 door
   * 96x64 de oude `naturalWidth` van 24 staan. De pagina hangt dit getal achter
   * de URL, en dan is het een andere URL.
   */
  photoAt?: number
}

const PROFILE_DIR = 'profiles'
const ACTIVE_FILE = 'active.json'
const PHOTO_DIR = 'profielfotos'

/**
 * De vormen die een profielfoto mag hebben.
 *
 * Dit is tegelijk het filter van het bestandsvenster en de zeef hier: wat er
 * niet in staat komt de map niet in. Chromium tekent deze drie zonder hulp;
 * een .bmp of een .tga uit een OMSI-map zou als gebroken plaatje eindigen.
 */
export const PHOTO_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'] as const

/*
 * De foto's staan naast de profielen, niet erin.
 *
 * Een profiel is een JSON-bestand dat elke dienst opnieuw geschreven wordt; een
 * foto van een paar honderd kilobyte als gegevens-URL daarin zou dat bestand
 * bij elke rit meeslepen. Daarom een eigen map, en in het profiel alleen de
 * bestandsnaam -- dezelfde afspraak als bij de kaartafbeeldingen, waar het pad
 * ook nooit door de brug gaat.
 */
function photoDir(userData: string): string {
  const path = join(userData, PHOTO_DIR)
  mkdirSync(path, { recursive: true })
  return path
}

/**
 * Een id dat uit de interface komt is geen bestandsnaam tot het bewezen is.
 *
 * `newId()` levert alleen letters, cijfers en een streepje op. Wie daarbuiten
 * valt krijgt niets: een id met `..` of een schuine streep erin zou anders via
 * `join` buiten de fotomap uitkomen.
 */
function veiligId(id: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(id)
}

/** Alle foto's die bij dit profiel horen; bij een vervanging mag de oude weg. */
function photoFiles(userData: string, id: string): string[] {
  if (!veiligId(id)) return []
  return readdirSync(photoDir(userData))
    .filter((name) => name.slice(0, name.length - extname(name).length) === id)
    .map((name) => join(photoDir(userData), name))
}

/**
 * Zet een gekozen afbeelding neer als de foto van deze chauffeur en geeft de
 * bestandsnaam terug.
 *
 * De foto wordt **gekopieerd**. Verwijzen naar de plek waar de speler hem
 * vandaan haalde is vragen om een lege tegel: dat is vaak een download, een
 * usb-stick of een map die hij daarna opruimt.
 */
export function setProfilePhoto(userData: string, id: string, source: string): string | undefined {
  if (!veiligId(id) || !existsSync(source)) return undefined
  const ext = extname(source).replace(/^\./, '').toLowerCase()
  if (!(PHOTO_EXTENSIONS as readonly string[]).includes(ext)) return undefined

  // Eerst het oude weg, ook als het een andere vorm had: anders blijft er een
  // .jpg naast de nieuwe .png liggen en is niet te zien welke telt.
  clearProfilePhoto(userData, id)
  const naam = `${id}.${ext}`
  copyFileSync(source, join(photoDir(userData), naam))
  return naam
}

/** Haalt de foto van deze chauffeur weg; blijft stil als er geen was. */
export function clearProfilePhoto(userData: string, id: string): void {
  for (const file of photoFiles(userData, id)) {
    try {
      unlinkSync(file)
    } catch {
      // Houdt Windows hem vast, dan blijft er hooguit een verweesd bestand.
    }
  }
}

/**
 * Het pad achter een bestandsnaam uit de fotomap, of niets.
 *
 * Hier hangt het eigen schema aan: alleen wat binnen deze map ligt mag door.
 * Een naam met `..` erin komt na `resolve` buiten de map uit en valt af, net
 * als bij de kaartafbeeldingen.
 */
export function profilePhotoPath(userData: string, name: string): string | undefined {
  if (!name) return undefined
  const map = photoDir(userData)
  const bestand = resolve(map, name)
  if (!bestand.startsWith(resolve(map) + sep)) return undefined
  if (!existsSync(bestand) || !statSync(bestand).isFile()) return undefined
  return bestand
}

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
    /*
     * Alleen doorgeven wat er werkelijk ligt. Staat de naam nog in het profiel
     * terwijl het bestand weg is -- handmatig opgeruimd, een teruggezette
     * back-up -- dan is een leeg vak beter dan een gebroken plaatje, en valt de
     * tegel terug op het monogram.
     */
    const foto = state.photo ? profilePhotoPath(userData, state.photo) : undefined
    entries.push({
      id: name.replace(/\.json$/, ''),
      driver: state.driver,
      startedAt: state.startedAt,
      duties: summary.duties,
      minutes: summary.minutes,
      onDuty: Boolean(state.activeDuty),
      licences: state.licences.length,
      photo: foto ? state.photo : undefined,
      photoAt: foto ? state.photoAt : undefined
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
  // Zijn foto gaat met hem mee; anders blijft er een gezicht in de map staan
  // waar geen chauffeur meer bij hoort.
  clearProfilePhoto(userData, id)
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
