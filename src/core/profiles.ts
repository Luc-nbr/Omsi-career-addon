import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync
} from 'node:fs'
import { extname, join, resolve, sep } from 'node:path'
import {
  emptyCareer,
  loadCareer,
  probeerCareer,
  saveCareer,
  summarise,
  type CareerState
} from './career'
import { schrijfVeilig, tijdstempel } from './veilig'

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

/*
 * Kopieën, en wat er gebeurt als een profiel niet meer te lezen is.
 *
 * WAAROM
 * Een profiel dat niet te lezen was, werd tot nu toe stil een lege "Nieuwe
 * chauffeur", en de eerste keer opslaan schreef die over het oude heen: een
 * afgekapt bestand na een crash of een scan van Defender kostte zo een hele
 * loopbaan. Het schrijven zelf is nu ondeelbaar (veilig.ts), en daarnaast
 * blijven er kopieën staan. Is een profiel toch onleesbaar, dan gaat het kapotte
 * bestand opzij -- nooit weg -- en komt de nieuwste goede kopie ervoor in de
 * plaats, met een melding die zegt welke stand het is.
 *
 * Wanneer een kopie: het profiel wordt bij elke wijziging van een lopende dienst
 * herschreven, en tien kopieën zouden dan binnen één dienst op zijn. Daarom
 * alleen als de vorige kopie ouder is dan een kwartier, of als er sindsdien een
 * dienst of vergunning bij kwam of af ging. Er blijven er tien van de laatste
 * tijd, en daarvoor één per dag over dertig dagen.
 */
const KOPIE_DIR = 'kopieen'
const PRULLENBAK_DIR = 'prullenbak'
const KOPIE_INTERVAL_MS = 15 * 60 * 1000
const KOPIEEN_RECENT = 10
const BEWAAR_DAGEN = 30
const DAG_MS = 24 * 60 * 60 * 1000

/** Een profiel dat bij het lezen beschadigd bleek, en wat ermee gedaan is. */
export interface Herstel {
  id: string
  driver: string
  /** De stand die terugkwam, als ISO-tijd; ontbreekt als er geen kopie was. */
  tijd?: string
  diensten: number
  /** Waar het beschadigde bestand nu staat. */
  beschadigd?: string
}

const herstellingen: Herstel[] = []

/** Wat er deze sessie is teruggezet; het scherm meldt het tot de speler het gezien heeft. */
export function herstelMeldingen(): Herstel[] {
  return herstellingen.slice()
}

export function vergeetHerstel(): void {
  herstellingen.length = 0
}

interface Kopie {
  pad: string
  tijd: number
  diensten: number
  vergunningen: number
}

function kopieMap(userData: string, id: string): string {
  return join(dir(userData), KOPIE_DIR, id)
}

/** De kopieën van één chauffeur, nieuwste eerst. */
function kopieenVan(userData: string, id: string): Kopie[] {
  const map = kopieMap(userData, id)
  let namen: string[]
  try {
    namen = readdirSync(map)
  } catch {
    return []
  }
  const kopieen: Kopie[] = []
  for (const naam of namen) {
    const deel = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-(\d{3})_(\d+)_(\d+)\.json$/.exec(naam)
    if (!deel) continue
    const [, j, m, d, u, mi, s, ms, diensten, vergunningen] = deel
    kopieen.push({
      pad: join(map, naam),
      tijd: new Date(+j, +m - 1, +d, +u, +mi, +s, +ms).getTime(),
      diensten: Number(diensten),
      vergunningen: Number(vergunningen)
    })
  }
  return kopieen.sort((a, b) => b.tijd - a.tijd)
}

/** Een kopie van wat er nu op schijf staat, als dat nodig is; zie de kop hierboven. */
function maakKopie(userData: string, id: string, file: string): void {
  try {
    const huidig = probeerCareer(file)
    // Wat niet te lezen is, is geen kopie waard; het wordt zo vervangen.
    if (!huidig) return
    const kopieen = kopieenVan(userData, id)
    const nieuwste = kopieen[0]
    const nodig =
      !nieuwste ||
      Date.now() - nieuwste.tijd >= KOPIE_INTERVAL_MS ||
      nieuwste.diensten !== huidig.entries.length ||
      nieuwste.vergunningen !== huidig.licences.length
    if (!nodig) return
    const map = kopieMap(userData, id)
    mkdirSync(map, { recursive: true })
    const naam = `${tijdstempel()}_${huidig.entries.length}_${huidig.licences.length}.json`
    copyFileSync(file, join(map, naam))
    snoei(kopieenVan(userData, id))
  } catch {
    // Een kopie die niet lukt mag het opslaan zelf niet tegenhouden.
  }
}

/** Tien van de laatste tijd houden, en daarvoor de nieuwste van elke dag tot dertig dagen terug. */
function snoei(kopieen: Kopie[]): void {
  const dagen = new Set<string>()
  const grens = Date.now() - BEWAAR_DAGEN * DAG_MS
  kopieen.forEach((kopie, index) => {
    if (index < KOPIEEN_RECENT) return
    const dag = new Date(kopie.tijd).toDateString()
    if (kopie.tijd >= grens && !dagen.has(dag)) {
      dagen.add(dag)
      return
    }
    try {
      unlinkSync(kopie.pad)
    } catch {
      // Blijft hij staan, dan ruimt de volgende keer hem op.
    }
  })
}

/** De chauffeursnaam uit een kapot bestand halen, als die nog leesbaar is. */
function naamUit(file: string): string | undefined {
  try {
    const tekst = readFileSync(file, 'utf8')
    return /"driver"\s*:\s*"([^"\\]{1,60})"/.exec(tekst)?.[1]
  } catch {
    return undefined
  }
}

/**
 * Een profiel dat niet te lezen is: opzij zetten en de nieuwste goede kopie
 * terugzetten. Terugzetten gebeurt alleen hier, als het bestand zelf onleesbaar
 * is -- een leesbaar profiel wordt nooit door een oudere kopie vervangen.
 */
function herstel(userData: string, id: string, file: string): CareerState {
  const naam = naamUit(file)
  const map = kopieMap(userData, id)
  let beschadigd: string | undefined = join(map, `beschadigd-${tijdstempel()}.json`)
  try {
    mkdirSync(map, { recursive: true })
    renameSync(file, beschadigd)
  } catch {
    try {
      copyFileSync(file, beschadigd)
    } catch {
      beschadigd = undefined
    }
  }

  for (const kopie of kopieenVan(userData, id)) {
    const oud = probeerCareer(kopie.pad)
    if (!oud) continue
    const state: CareerState = { ...oud, id }
    saveCareer(file, state)
    herstellingen.push({
      id,
      driver: state.driver,
      tijd: new Date(kopie.tijd).toISOString(),
      diensten: state.entries.length,
      beschadigd
    })
    return state
  }

  const leeg: CareerState = { ...emptyCareer(naam ?? 'Nieuwe chauffeur'), id }
  saveCareer(file, leeg)
  herstellingen.push({ id, driver: leeg.driver, diensten: 0, beschadigd })
  return leeg
}

/** Een profiel lezen, en terugzetten als het beschadigd is. */
function laad(userData: string, id: string): CareerState | undefined {
  const file = fileFor(userData, id)
  if (!existsSync(file)) return undefined
  const state = probeerCareer(file)
  return state ? { ...state, id } : herstel(userData, id, file)
}

/**
 * Oude rommel weghalen: wat langer dan dertig dagen in de prullenbak ligt, en de
 * kopieën van chauffeurs die er niet meer zijn en al dertig dagen niets kregen.
 */
function ruimOp(userData: string): void {
  const grens = Date.now() - BEWAAR_DAGEN * DAG_MS
  const bak = join(dir(userData), PRULLENBAK_DIR)
  try {
    for (const naam of readdirSync(bak)) {
      const pad = join(bak, naam)
      if (statSync(pad).mtimeMs < grens) rmSync(pad, { recursive: true, force: true })
    }
  } catch {
    // Geen prullenbak, of niets op te ruimen.
  }
  const kopieen = join(dir(userData), KOPIE_DIR)
  try {
    for (const id of readdirSync(kopieen)) {
      if (existsSync(fileFor(userData, id))) continue
      const pad = join(kopieen, id)
      if (statSync(pad).mtimeMs < grens) rmSync(pad, { recursive: true, force: true })
    }
  } catch {
    // Idem.
  }
}

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
    const state = laad(userData, name.replace(/\.json$/, ''))
    if (!state) continue
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
  return laad(userData, id)
}

export function writeProfile(userData: string, state: CareerState): void {
  if (!state.id) return
  const file = fileFor(userData, state.id)
  maakKopie(userData, state.id, file)
  saveCareer(file, state)
}

/**
 * Een chauffeur weghalen, naar de prullenbak.
 *
 * Een verkeerde klik op "verwijderen" kostte tot nu toe een hele loopbaan. Nu
 * blijft het profiel dertig dagen in profiles\prullenbak staan, en zijn kopieën
 * ook zo lang; daarna ruimt de app ze op.
 */
export function deleteProfile(userData: string, id: string): void {
  const file = fileFor(userData, id)
  if (existsSync(file)) {
    const bak = join(dir(userData), PRULLENBAK_DIR)
    mkdirSync(bak, { recursive: true })
    try {
      renameSync(file, join(bak, `${id}-${tijdstempel()}.json`))
    } catch {
      unlinkSync(file)
    }
  }
  // Zijn foto gaat met hem mee; anders blijft er een gezicht in de map staan
  // waar geen chauffeur meer bij hoort.
  clearProfilePhoto(userData, id)
  if (getActive(userData) === id) {
    const first = listProfiles(userData)[0]
    if (first) setActive(userData, first.id)
    else schrijfVeilig(join(dir(userData), ACTIVE_FILE), JSON.stringify({ id: null }))
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
  schrijfVeilig(join(dir(userData), ACTIVE_FILE), JSON.stringify({ id }))
}

/**
 * Het profiel waarmee de app opstart: het laatst gebruikte, of anders het
 * eerste dat er is. Zijn er helemaal geen, dan vraagt de app om een naam.
 */
export function resolveActive(userData: string): CareerState | undefined {
  ruimOp(userData)
  const profiles = listProfiles(userData)
  if (profiles.length === 0) return undefined
  const active = getActive(userData)
  const chosen = profiles.find((profile) => profile.id === active) ?? profiles[0]
  setActive(userData, chosen.id)
  return readProfile(userData, chosen.id)
}
