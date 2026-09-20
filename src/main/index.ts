import { app, BrowserWindow, dialog, globalShortcut, ipcMain, screen } from 'electron'
import { cpSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { Worker } from 'node:worker_threads'
import { log, logFout, startLogboek, TRAAG_MS } from '../core/logboek'
import { maakKaartlaag, type Kaartlaag } from '../core/kaartlaag'
import {
  completeDuty,
  recordExam,
  summarise,
  type ActiveDuty,
  type CareerState,
  type GameMode
} from '../core/career'
import {
  createProfile,
  deleteProfile,
  listProfiles,
  readProfile,
  resolveActive,
  setActive,
  writeProfile
} from '../core/profiles'
import {
  examTrip,
  generateDuty,
  listLines,
  type LineSummary,
  type Network
} from '../core/duty'
import { judgeExam, type ExamMeasurement } from '../core/exam'
import { readGameSettings, writeGameSettings } from '../core/gameSettings'
import {
  readControllers,
  writeControllers,
  type ControllerConfig
} from '../core/omsiControllers'
import {
  readActionLabels,
  readKeyNames,
  readKeyboard,
  writeKeyboard,
  type KeyBinding
} from '../core/omsiKeys'
import { pickVehicleForDuty, suggestFromDepot, type FleetIndex } from '../core/fleet'
import { readTileGrid, type MapGeometry } from '../core/geo'
import { LaneNetwork, type TripRoute } from '../core/routing'
import { VehicleTracker, type VehiclePosition } from '../core/vehicle'
import { buildIbisPlan, type IbisPlan } from '../core/ibis'
import { describeLive, readLive } from '../core/live'
import { findOmsiInstall, hasMaps, isOmsiInstall, resolveOmsiFolder } from '../core/install'
import { isOmsiRunning, launchOmsi } from '../core/launch'
import { ensurePlugin, pluginSourceDir, type PluginStatus } from '../core/pluginInstall'
import { readOverlayLayout, writeOverlayLayout } from '../core/overlayLayout'
import { receiptHeightMicrons, RECEIPT_WIDTH_MICRONS } from '../core/receipt'
import { difference, readKnown, writeKnown } from '../core/installed'
import { readSettings, writeSettings, type Settings } from '../core/settings'
import { formatTime } from '../shared/format'
import { findTemplate, writeSituation } from '../core/situation'
import { presetStartup } from '../core/startup'
import { trailerOf } from '../core/trailer'
import { spawnAtStop } from '../core/spawn'
import { listMaps } from '../core/timetable'
import { listVehicles, type Vehicle } from '../core/vehicles'
import type { Duty, DutyLeg, OmsiMap } from '../core/types'
import { listHofs, matchHof, pickHof } from '../core/hof'
import { placeHof, planHofs, readPlacements, writePlacements } from '../core/hofTool'
import { readScreenMode } from '../core/schermmodus'
import {
  type Assignment,
  type KaartenStand,
  type BeginRequest,
  type FreeRequest,
  type DutyDate,
  type DutyRequest,
  type HofOffer,
  type InstalledCheck,
  type OmsiState,
  type MapSummary,
  type SessionResult,
  type YardOption
} from '../shared/api'
import { defaultLayout, OVERLAY_RATES, type OverlayLayout } from '../shared/overlay'

/*
 * Alles wat uit de OMSI-map komt, met zijn caches, staat in `core/kaartlaag.ts`.
 * Het hoofdproces houdt er één van; de werker houdt er zelf ook een, voor het
 * zware werk. Kaarten inlezen kost merkbaar tijd, dus het gebeurt één keer per
 * sessie en daarna komt het van schijf.
 */
let kaartlaag: Kaartlaag | undefined

function laag(): Kaartlaag {
  if (!kaartlaag) kaartlaag = maakKaartlaag(omsi(), userData())
  return kaartlaag
}

/**
 * Alles vergeten wat er van de OMSI-map in het geheugen staat.
 *
 * Gebeurt als de speler een andere OMSI-map aanwijst of laat nakijken of er
 * kaarten bij zijn gekomen: dan klopt geen enkele cache meer. De werker krijgt
 * dezelfde opdracht, want die heeft zijn eigen kopie.
 */
function vergeetKaarten(): void {
  kaartlaag = undefined
  if (werker) {
    werker.terminate().catch(() => undefined)
    werker = undefined
  }
}
/**
 * Nulmeting bij het begin van een dienst, gelezen uit de live gegevens van de
 * plugin. Het verschil met de stand aan het eind is wat er werkelijk gereden is.
 */
let omsiPath: string | undefined
let career: CareerState | undefined
let pluginStatus: PluginStatus | undefined

const userData = () => app.getPath('userData')

function omsi(): string {
  // De map die de speler zelf aanwees telt mee bij het zoeken; zie install.ts.
  if (!omsiPath) omsiPath = findOmsiInstall(readSettings(userData()).omsiPath)
  if (!omsiPath) throw new Error('Geen OMSI 2-installatie gevonden.')
  return omsiPath
}

/*
 * Korte namen voor de laag hieronder. Ze stonden hier ooit als eigen functies
 * met eigen caches; sinds de werker hetzelfde moet kunnen, wonen ze in
 * `core/kaartlaag.ts` en staat hier alleen nog de doorgeefluik-versie.
 */
const map = (folder: string): OmsiMap => laag().map(folder)
const mapGeometry = (folder: string): MapGeometry => laag().geometrie(folder)
const laneNetwork = (folder: string): LaneNetwork => laag().rijstrokennet(folder)
const network = (folder: string): Network => laag().net(folder)
const fleetOf = (folder: string): Set<string> => laag().wagenparkVanKaart(folder)
const terminiOf = (folder: string): string[] => laag().eindbestemmingen(folder)
const depotOf = (folder: string): Map<string, number> => laag().remises(folder)
const era = (folder: string): { year: number; dayOfYear: number } => laag().tijdvak(folder)
const dutyDate = (folder: string, days: number): DutyDate | undefined =>
  laag().dienstDatum(folder, days)
const fleet = (): FleetIndex => laag().wagenpark()

/**
 * De werker die kaarten uitleest, en de wachtrij ervoor.
 *
 * Eén werker, één opdracht tegelijk: het gaat om schijf en geheugen, niet om
 * rekenkracht, en drie kaarten tegelijk inlezen maakt het voor niemand sneller.
 * Hij wordt pas gemaakt als er echt iets te lezen valt, en hij blijft daarna
 * staan -- hem opstarten kost ongeveer dertig milliseconden.
 */
/** Wat de werker terugstuurt; `uitkomst` hangt af van de soort opdracht. */
interface WerkerAntwoord {
  id: number
  ok: boolean
  ms: number
  uitkomst?: unknown
  fout?: string
}

let werker: Worker | undefined
let volgendeOpdracht = 0
const werkerWacht = new Map<number, (antwoord: WerkerAntwoord) => void>()

function kaartWerker(): Worker {
  if (werker) return werker
  const gemaakt = new Worker(join(__dirname, 'kaartwerker.js'), {
    workerData: { omsiPath: omsi(), userData: userData() }
  })
  gemaakt.on('message', (antwoord: WerkerAntwoord) => {
    const wachtend = werkerWacht.get(antwoord.id)
    werkerWacht.delete(antwoord.id)
    wachtend?.(antwoord)
  })
  gemaakt.on('error', (fout) => {
    logFout('kaartwerker', fout)
    werker = undefined
    // Wie nog wacht krijgt een antwoord, anders blijft het scherm hangen.
    for (const [id, wachtend] of werkerWacht) {
      werkerWacht.delete(id)
      wachtend({ id, ok: false, ms: 0, fout: String(fout) })
    }
  })
  gemaakt.on('exit', () => {
    werker = undefined
  })
  // De werker mag de app niet openhouden bij het afsluiten.
  gemaakt.unref()
  werker = gemaakt
  return gemaakt
}

/**
 * Een opdracht naar de werker, en het antwoord terug.
 *
 * Mislukt hij -- geen werker, een fout onderweg -- dan gooit deze functie, en
 * de aanroeper doet het zelf. Dat is trager en dan hapert het even, maar de
 * speler krijgt wel zijn kaart. Beter een hapering dan een leeg scherm.
 */
async function werkerVraag<T>(opdracht: Record<string, unknown>): Promise<T> {
  const id = (volgendeOpdracht += 1)
  const antwoord = await new Promise<WerkerAntwoord>((klaar) => {
    werkerWacht.set(id, klaar)
    try {
      kaartWerker().postMessage({ ...opdracht, id })
    } catch (fout) {
      werkerWacht.delete(id)
      klaar({ id, ok: false, ms: 0, fout: String(fout) })
    }
  })
  if (!antwoord.ok) throw new Error(antwoord.fout ?? 'de werker gaf geen antwoord')
  if (antwoord.ms >= TRAAG_MS) log(`werker ${String(opdracht.soort)}: ${antwoord.ms} ms`)
  return antwoord.uitkomst as T
}

/**
 * Zorgt dat de kaart in de cache staat, zonder het hoofdproces stil te leggen.
 *
 * Staat hij er al (geheugen of schijf), dan gebeurt er niets. Anders leest de
 * werker hem in en schrijft hem naar schijf; daarna vindt `mapGeometry` hem
 * daar in enkele milliseconden. Lukt de werker het niet, dan valt alles terug
 * op de oude weg: het hoofdproces leest hem zelf, en dan hapert het even. Beter
 * een hapering dan geen kaart.
 */
async function zorgVoorKaart(folder: string): Promise<void> {
  if (laag().kaartStaatKlaar(folder)) return
  await werkerVraag<void>({ soort: 'kaart', folder })
}

/**
 * De kaarten alvast inlezen, op de achtergrond.
 *
 * Zonder dit betaalt de speler de rekening op het moment dat hij een kaart
 * aanklikt: tot ruim drie seconden waarin er niets gebeurt. Met dit loopt de app
 * na het opstarten één keer alle kaarten langs en zet ze op de schijf, zodat
 * elke keuze daarna in tientallen milliseconden klaar is.
 *
 * Bewust traag: één kaart tegelijk, met een adempauze ertussen. Het gaat om
 * werk dat niemand heeft gevraagd, dus het mag nooit in de weg lopen van wat
 * iemand wél vraagt. Wat al in de cache staat wordt overgeslagen, dus de tweede
 * start kost niets.
 */
let warmLoopt = false
/*
 * Hoeveel er op dit moment gevraagd wordt door het scherm.
 *
 * Het hoofdproces doet één ding tegelijk, dus terwijl het voorwerk een kaart
 * uitleest kan een vraag van de speler niet tussendoor. Gemeten: een eerste
 * start waarin het voorwerk vooropliep kostte de speler 16 seconden voor een
 * kaart die hij zelf opvroeg. Het voorwerk kijkt daarom vóór elke kaart of er
 * iemand staat te wachten, en gaat dan aan de kant.
 */
let voorgrondBezig = 0

/**
 * Hoe ver het klaarzetten is. Het scherm laat dit zien tijdens de
 * installatiestap, en vraagt het ook op als het die stap binnenkomt nadat er al
 * iets liep.
 */
let warmStand: KaartenStand = { bezig: undefined, klaar: 0, totaal: 0, resterend: 0 }

/** Hoeveel kaarten er nog ingelezen moeten worden voordat alles vlot gaat. */
function kaartenStand(): KaartenStand {
  if (warmLoopt) return warmStand
  try {
    const folders = listMaps(omsi())
    const resterend = folders.filter((folder) => !laag().kaartStaatKlaar(folder)).length
    warmStand = {
      bezig: undefined,
      klaar: folders.length - resterend,
      totaal: folders.length,
      resterend
    }
  } catch {
    // Geen OMSI, geen kaarten: dan valt er ook niets klaar te zetten.
    warmStand = { bezig: undefined, klaar: 0, totaal: 0, resterend: 0 }
  }
  return warmStand
}

async function warmKaarten(): Promise<void> {
  if (warmLoopt) return
  warmLoopt = true
  try {
    const folders = listMaps(omsi())
    const melden = (bezig: string | undefined, klaar: number): void => {
      warmStand = { bezig, klaar, totaal: folders.length, resterend: folders.length - klaar }
      for (const venster of BrowserWindow.getAllWindows()) {
        if (!venster.isDestroyed()) venster.webContents.send('kaarten:warm', warmStand)
      }
    }

    let klaar = 0
    for (const folder of folders) {
      // Wachten zolang het scherm iets vraagt; dat gaat altijd voor.
      while (voorgrondBezig > 0) await new Promise((verder) => setTimeout(verder, 300))

      // Al in het geheugen of al op de schijf: dan valt er niets in te lezen.
      if (!laag().kaartStaatKlaar(folder)) {
        melden(folder, klaar)
        try {
          /*
           * Door de werker, niet hier. Dit is het voorwerk waar niemand om
           * vroeg; dat hoort geen enkele klik in de weg te zitten. Sinds de
           * werker het doet, blijft het hoofdproces vrij en is de adempauze
           * hieronder alleen nog een rem op de schijf.
           */
          await zorgVoorKaart(folder)
        } catch {
          // Een kaart die niet te lezen is houdt de rest niet tegen.
        }
        await new Promise((verder) => setTimeout(verder, 150))
      }
      klaar += 1
      melden(undefined, klaar)
    }
    log(`kaarten klaargezet: ${folders.length}`)
  } catch (fout) {
    // Geen OMSI gevonden, of geen leesrechten: dan gewoon geen voorwerk.
    logFout('kaarten klaarzetten', fout)
  } finally {
    warmLoopt = false
  }
}

/** Waar de bus bij de eerste halte komt te staan. */
function spawnFor(folder: string, stopId: string | undefined) {
  if (!stopId) return undefined
  const stop = mapGeometry(folder).stops.find((item) => item.id === stopId)
  const path = map(folder).path
  const grid = readTileGrid(path)
  if (!stop || !grid) return undefined
  return spawnAtStop(path, grid, laneNetwork(folder), stop)
}

/**
 * In welke taal OMSI zelf staat. Zijn eigen keuze staat in options.cfg; die
 * volgen we, want de namen van de toetsen komen uit zijn bestanden en moeten
 * overeenkomen met wat er in het spel staat.
 */
function omsiLanguage(): string {
  const value = readGameSettings(omsi()).language
  return value && value.length === 3 ? value.toUpperCase() : 'ENG'
}

/**
 * De overlay hangt als doorzichtig, klikdoorlatend venster boven OMSI. Het is
 * bewust geen hook in de grafische laag: dat sloopt oude DX9-spellen. Het spel
 * draait in vensterstand, dus een venster erbovenop volstaat.
 */
let overlayWindow: BrowserWindow | null = null
let overlayTimer: NodeJS.Timeout | undefined
let overlayDuty: Duty | undefined
/** Het IBIS-plan bij die dienst; de overlay toont het tot de IBIS gevuld is. */
let overlayIbis: IbisPlan | undefined
/**
 * In de bewerkstand kun je de vensters verslepen. Dat kan niet altijd aanstaan:
 * een venster dat muisklikken aanneemt, pakt ook de aandacht af van OMSI, en
 * dan staat je stuur stil. Dus normaal laat de overlay alles door en alleen als
 * je hem aanpast niet.
 */
let overlayEditing = false
/*
 * Wordt de overlay op dit moment versleept of geschaald? Dan moet het venster
 * even het hele scherm beslaan, anders loopt de muis tegen de eigen rand aan.
 * Dit staat los van de bewerkstand: verslepen kan altijd, zonder knop.
 */
let overlayGrabbing = false
/**
 * Het vak waar de elementen van de overlay in staan, zoals de pagina het meet.
 *
 * Het venster is doorzichtig en ligt over het spel heen, en alles wat eronder
 * zit moet Windows bij elk beeld opnieuw mengen -- ook de lege hoeken. Dus maken
 * we het venster niet groter dan zijn inhoud. In de bewerkstand mag dat niet:
 * dan moet je de elementen over het hele scherm kunnen slepen.
 */
let overlayBox: { x: number; y: number; w: number; h: number } | undefined

/**
 * Nulmeting van de lopende dienst: het verschil met de stand aan het eind is wat
 * er werkelijk gereden is. Hij staat in het profiel, zodat hij een herstart van
 * de app overleeft.
 */
function baseline(): NonNullable<CareerState['activeDuty']>['baseline'] {
  return career?.activeDuty?.baseline
}

/** De lopende dienst: die van de overlay, of anders die uit het profiel (na een herstart). */
function currentDuty(): Duty | undefined {
  return overlayDuty ?? (career?.activeDuty?.assignment as Assignment | undefined)?.duty
}

/**
 * Wat er van deze dienst gereden is.
 *
 * De plugin laat bij het afsluiten een laatste stand achter met alive=false.
 * Die telt gewoon mee: wie het spel sluit voordat hij afrondt, hoort zijn
 * kilometers niet kwijt te zijn.
 */
function sessieGegevens(): SessionResult {
  captureBaseline()
  const live = readLive()
  const start = baseline()
  if (!live) return { drivenKm: 0, elapsedMinutes: 0, dutyComplete: false, finished: false }
  if (!start) return { drivenKm: 0, elapsedMinutes: 0, dutyComplete: false, finished: true }

  const elapsed = live.time / 60 - start.clockMinutes
  const duty = currentDuty()
  const status = describeLive(live, duty, start)
  /*
   * Hoe ver de dienst is: de haltes van de ritten die al achter je liggen, plus
   * hoever je in deze rit bent. Is de dienst uitgereden, dan zijn het er per
   * definitie alle -- anders zou een afronding op de laatste meter je nog een
   * halte kosten.
   */
  const stopsDone =
    duty && status.dutyComplete
      ? duty.totalStops
      : duty && status.legIndex !== undefined
        ? duty.legs.slice(0, status.legIndex).reduce((som, leg) => som + leg.stops.length, 0) +
          (status.stopIndex ?? 0)
        : undefined
  /*
   * Brandstof: wat er verbruikt is, niet wat erin zit. Tanken tijdens de dienst
   * zou een negatief verschil geven, en "min een halve tank verbruikt" is geen
   * getal om op te schrijven -- dan houden we het bij nul.
   */
  const startTank = start.fuel
  const fuelUsed =
    startTank !== undefined ? Math.max(0, startTank - live.tankPercent) : undefined

  return {
    stopsDone,
    drivenKm: gereden(live.km + live.metres / 1000 - start.odometerKm, elapsed),
    elapsedMinutes: elapsed >= 0 ? elapsed : elapsed + 1440,
    delayMinutes: status.delayMinutes,
    harshBrakes: status.harshBrakes,
    harshAccels: status.harshAccels,
    topSpeed: live.topSpeed,
    tickets: status.tickets,
    collisions: status.collisions,
    worstCollision: status.worstCollision,
    fuelUsed,
    fuel: live.tankPercent,
    battery: status.battery,
    dutyComplete: status.dutyComplete,
    finished: true
  }
}

/**
 * De lopende dienst afsluiten als de app dichtgaat.
 *
 * Een dienst die blijft hangen is verwarrend: je start de app weer op, er staat
 * een rit open, en niemand weet meer waar die was. Dus bij het afsluiten gaat
 * hij dicht -- met wat er gereden is mee naar het logboek.
 *
 * Twee gevallen gaan niet naar het logboek. Een dienst die wel is aangenomen
 * maar nooit begon heeft niets om op te schrijven. En een examenrit die je
 * afbreekt is geen gezakt examen: hij is niet gereden, en dat is iets anders.
 * Allebei vervallen ze gewoon.
 */
function sluitLopendeDienstAf(): void {
  const lopend = career?.activeDuty
  if (!career || !lopend) return

  const duty = currentDuty()
  if (!duty || !baseline() || lopend.exam) {
    career = { ...career, activeDuty: undefined }
    writeProfile(userData(), career)
    return
  }

  const bus = (lopend.assignment as Assignment | undefined)?.vehicle
  const naam = bus ? `${bus.manufacturer} ${bus.type}` : lopend.vehicleOverride
  const gemeten = sessieGegevens()
  career = completeDuty(career, duty, naam, {
    stopsDone: gemeten.stopsDone,
    drivenKm: gemeten.drivenKm,
    delayMinutes: gemeten.delayMinutes,
    harshBrakes: gemeten.harshBrakes,
    harshAccels: gemeten.harshAccels,
    tickets: gemeten.tickets,
    collisions: gemeten.collisions,
    fuelUsed: gemeten.fuelUsed
  })
  writeProfile(userData(), career)
}

/**
 * De laatst klaargezette situatie, zodat we hem opnieuw kunnen aanmelden.
 *
 * OMSI schrijft `options.cfg` bij het afsluiten opnieuw en zet `[last_map]` op
 * de kaart die het zelf speelde. Alles wat wij voor het starten hadden
 * klaargezet is daarmee weg, en de volgende keer opent het spel op de verkeerde
 * kaart. Daarom onthouden we wat er klaarstond en zetten we het terug zodra het
 * spel gesloten is.
 */
let klaargezet: { mapFolder: string; file: string } | undefined

/** Draaide OMSI de vorige keer dat we keken? */
let omsiDraaide = false

/**
 * Kijkt of OMSI net is afgesloten en zet dan de situatie opnieuw klaar.
 *
 * Alleen bij de overgang van draaien naar niet draaien: zolang het spel loopt
 * valt er niets recht te zetten, en zonder die overgang zouden we bij elke tel
 * in de spelmap schrijven.
 */
/** Wanneer we voor het laatst naar de proceslijst keken. */
let laatsteProcesKijk = 0

async function herstelStartscherm(): Promise<void> {
  /*
   * `tasklist` is een proces starten, en dat elke vijf tellen doen terwijl er
   * een spel draait levert hikjes op. Eens per halve minuut is ruim genoeg: we
   * wachten hier op iemand die OMSI afsluit, en dat duurt langer dan dat.
   */
  const nu = Date.now()
  if (nu - laatsteProcesKijk < 30000) return
  laatsteProcesKijk = nu

  const draait = await isOmsiRunning()
  const netAf = omsiDraaide && !draait
  omsiDraaide = draait
  if (!netAf || !klaargezet) return
  try {
    presetStartup(omsi(), klaargezet.mapFolder, klaargezet.file)
  } catch {
    // Geen schrijfrechten; dan kiest de speler de kaart zelf.
  }
}

/** Verse gegevens van een draaiend OMSI, of niets. */
function freshLive(): ReturnType<typeof readLive> {
  const live = readLive()
  return live && live.alive && (live.ageMs ?? 0) < 15000 ? live : undefined
}

/**
 * De gereden afstand, of niets als de teller onzin zegt.
 *
 * `kmcounter_km` is een variabele van de bus, en niet elke bus vult hem even
 * netjes. Hier staan standen van twee miljoen in het logboek naast diensten die
 * precies nul opleveren -- en beide zijn opgeschreven alsof ze klopten, ook in
 * de rang en het loon.
 *
 * Een bus rijdt hoogstens een kilometer of honderd per uur. Komt er meer uit dan
 * in de verstreken tijd te rijden valt, dan is het geen afstand maar een teller
 * die niet deugt, en dan is niets opschrijven eerlijker dan een getal dat niet
 * waar is: een dienst zonder meting telt in het overzicht gewoon niet mee.
 */
const HOOGSTE_SNELHEID_KMH = 100

function gereden(verschil: number, minuten: number): number | undefined {
  if (!Number.isFinite(verschil) || verschil < 0) return undefined
  // Een korte dienst krijgt wat lucht; anders valt een pauze van vijf minuten af.
  const plafond = Math.max(10, (Math.max(0, minuten) / 60) * HOOGSTE_SNELHEID_KMH)
  if (verschil > plafond) return undefined
  return Math.round(verschil * 100) / 100
}

/**
 * Leg de nulmeting vast zodra dat kan: bij het starten als OMSI al draait,
 * anders bij de eerste verse gegevens daarna. Een oud live-bestand van een
 * vorige keer telt niet; dat zou kilometers van toen als begin nemen.
 *
 * PAS ALS DE BUS ER STAAT
 * `alive` zegt dat de plugin schrijft, niet dat er een bus is. Tussen het
 * starten van OMSI en het inladen van de situatie schrijft hij al, met een
 * kilometerstand van nul. Werd de nulmeting daar genomen, dan was het begin nul
 * en het eind de hele kilometerstand van die bus: in dit logboek staan diensten
 * van een uur met 2.094.964 km. `mem.ok` is het signaal dat de plugin
 * werkelijk bij het voertuig kan -- dezelfde vlag waar de kaartpositie aan hangt.
 */
function captureBaseline(live = freshLive()): void {
  const active = career?.activeDuty
  if (!career || !active?.startedAt || active.baseline) return
  if (!live || live.mem?.ok !== 1) return
  persist({
    ...career,
    activeDuty: {
      ...active,
      baseline: {
        odometerKm: live.km + live.metres / 1000,
        clockMinutes: live.time / 60,
        harshBrakes: live.harshBrakes,
        harshAccels: live.harshAccels,
        tickets: live.ticket,
        collisions: live.collisions ?? 0,
        fuel: live.tankPercent
      }
    }
  })
}

/** Per kaart een tracker: hij onthoudt welke as het noorden is en hoe de bus rijdt. */
const vehicleTrackers = new Map<string, VehicleTracker>()

/** Waar de bus van de speler op de kaart van de dienst staat, als OMSI dat laat lezen. */
function vehicleOnMap(live: ReturnType<typeof readLive>, duty: Duty | undefined): VehiclePosition | undefined {
  if (!live?.alive || live.mem?.ok !== 1 || !duty) return undefined
  try {
    let tracker = vehicleTrackers.get(duty.mapFolder)
    if (!tracker) {
      tracker = new VehicleTracker(map(duty.mapFolder).path)
      vehicleTrackers.set(duty.mapFolder, tracker)
    }
    const network = laneNetwork(duty.mapFolder)
    return tracker.update(live.mem, (x, y) => network.distanceToLane(x, y))
  } catch {
    return undefined
  }
}

/**
 * Wat de overlay het laatst gekregen heeft, als tekst.
 *
 * De overlay ligt over het spel heen: elke keer dat hij zichzelf opnieuw
 * tekent, moet Windows dat beeld over OMSI heen mengen, en dat kost het spel
 * beeldjes. Staat de bus stil bij een halte, dan is er tien keer per seconde
 * niets veranderd -- en dan sturen we ook niets.
 */
let lastFrame: string | undefined

function pushFrame(): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  /*
   * Alleen verse gegevens. Een live.json van een vorige keer blijft op schijf
   * staan met alive:true, en dan bleef de overlay een dienst tonen die allang
   * uitgereden was -- inclusief een dienstregelingsmenu dat niemand meer had
   * openstaan. Eén keer lezen per beeld: de nulmeting krijgt hem doorgegeven in
   * plaats van het bestand nog eens van schijf te halen.
   */
  const live = freshLive()
  captureBaseline(live)
  const duty = currentDuty()
  const frame = {
    connected: Boolean(live?.alive),
    status: live ? describeLive(live, duty, baseline()) : undefined,
    vehicle: vehicleOnMap(live, duty),
    duty,
    ibis: overlayIbis,
    editing: overlayEditing
  }

  const signature = JSON.stringify(frame)
  if (signature === lastFrame) return
  lastFrame = signature
  overlayWindow.webContents.send('overlay:frame', frame)
}

/**
 * Waar de overlay mag komen: het hele scherm.
 *
 * Niet het werkgebied. Dat is het scherm min de taakbalk, en OMSI draait daar
 * dwars overheen -- een element dat je onderin wilt hebben kon daardoor niet
 * helemaal naar beneden. De overlay ligt over een spel heen, dus de taakbalk is
 * hier niet de baas.
 */
function overlayArea(): Electron.Rectangle {
  return screen.getPrimaryDisplay().bounds
}

/** Zet het venster om zijn inhoud heen, of over het hele scherm bij het slepen. */
function applyOverlayBounds(): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  const area = overlayArea()
  if (overlayEditing || overlayGrabbing || !overlayBox) {
    overlayWindow.setBounds(area)
    return
  }
  overlayWindow.setBounds({
    x: area.x + Math.round(overlayBox.x),
    y: area.y + Math.round(overlayBox.y),
    width: Math.max(40, Math.min(area.width, Math.round(overlayBox.w))),
    height: Math.max(40, Math.min(area.height, Math.round(overlayBox.h)))
  })
}

function setOverlayEdit(on: boolean): boolean {
  if (!overlayWindow || overlayWindow.isDestroyed()) return false
  overlayEditing = on
  passMouseThrough(!on)
  overlayWindow.setFocusable(on)
  // Slepen kan alleen als het venster het hele scherm beslaat; daarna weer krap.
  applyOverlayBounds()
  if (on) overlayWindow.focus()
  pushFrame()
  return on
}

/**
 * Klikken doorlaten naar het spel, maar de muisbewegingen wel doorgeven aan de
 * pagina. Daarmee kan de overlay zelf melden dat de muis boven een knop hangt
 * en pakken we hem alleen daar even op. Het venster blijft niet-focusbaar, dus
 * OMSI raakt de aandacht niet kwijt.
 */
function passMouseThrough(through: boolean): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  overlayWindow.setIgnoreMouseEvents(through, through ? { forward: true } : undefined)
}

/**
 * Het hoofdvenster, om het te kunnen laten weten wanneer de overlay open of
 * dicht gaat. Alleen het hoofdproces weet dat zeker: de overlay gaat ook dicht
 * vanuit zichzelf of bij het afronden van een dienst, en een knop in de app die
 * zelf bijhoudt of hij open staat, raakt dan uit de pas.
 */
let mainWindow: BrowserWindow | null = null

function overlayIsOpen(): boolean {
  return Boolean(overlayWindow && !overlayWindow.isDestroyed())
}

function announceOverlay(): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('overlay:state', overlayIsOpen())
}

function closeOverlay(): void {
  if (overlayTimer) clearInterval(overlayTimer)
  overlayTimer = undefined
  overlayEditing = false
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.destroy()
  overlayWindow = null
  announceOverlay()
}

function openOverlay(duty: Duty, ibis?: IbisPlan): void {
  overlayDuty = duty
  if (ibis) overlayIbis = ibis
  if (overlayIsOpen()) return
  // Een vers venster weet nog niets; het eerste beeld moet er hoe dan ook komen.
  lastFrame = undefined
  overlayBox = undefined

  // Het venster beslaat het hele scherm, zodat je een paneel overal neer kunt
  // zetten. Wat niet beschilderd is, is doorzichtig en laat klikken door.
  const area = overlayArea()

  overlayWindow = new BrowserWindow({
    width: area.width,
    height: area.height,
    x: area.x,
    y: area.y,
    frame: false,
    transparent: true,
    resizable: true,
    movable: true,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  // Boven een spel in vensterstand, en muisklikken gaan er dwars doorheen.
  overlayWindow.setAlwaysOnTop(true, 'screen-saver')
  passMouseThrough(true)
  overlayWindow.on('closed', () => {
    if (overlayTimer) clearInterval(overlayTimer)
    overlayTimer = undefined
    overlayWindow = null
    announceOverlay()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    overlayWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}/overlay.html`)
  } else {
    overlayWindow.loadFile(join(__dirname, '../renderer/overlay.html'))
  }

  /*
   * Hoe vaak, dat kiest de speler. Vaker ziet er vloeiender uit, maar elke
   * verversing van een doorzichtig venster over het spel kost OMSI beeldjes;
   * wie haperingen merkt, zet hem rustiger.
   */
  overlayTimer = setInterval(pushFrame, OVERLAY_RATES[readSettings(userData()).overlayRate])
  announceOverlay()
}

/**
 * Vult het kaartje aan met wie het afdrukt en wanneer. De datumnotatie volgt de
 * taal van de app, want het kaartje is het enige dat de chauffeur in handen
 * krijgt.
 */
function withDriver(payload: unknown): unknown {
  const language = readSettings(userData()).language
  const locale = { en: 'en-GB', de: 'de-DE', fr: 'fr-FR', nl: 'nl-NL' }[language]
  return {
    ...(payload as object),
    language,
    driver: career?.driver ?? '—',
    printedAt: new Date().toLocaleString(locale)
  }
}

/**
 * Rendert het dienstkaartje in een onzichtbaar venster en drukt het af.
 *
 * De pagina meldt zelf hoe hoog hij is geworden; daarmee wordt de pagina precies
 * zo lang als het kaartje. Bij een voorbeeld blijft het venster gewoon staan.
 */
function printReceipt(
  payload: unknown,
  options: { deviceName?: string; preview: boolean }
): Promise<{ ok: boolean; reason?: string }> {
  return new Promise((resolve) => {
    const window = new BrowserWindow({
      show: options.preview,
      width: 380,
      height: 780,
      title: 'Dienstkaartje',
      backgroundColor: '#ffffff',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        contextIsolation: true
      }
    })

    let settled = false
    const finish = (ok: boolean, reason?: string) => {
      if (settled) return
      settled = true
      resolve({ ok, reason })
    }

    // De pagina laat weten hoe hoog hij is; dan pas kunnen we afdrukken.
    const onReady = (_event: Electron.IpcMainEvent, heightPx: number) => {
      if (window.isDestroyed()) return
      if (options.preview) {
        finish(true)
        return
      }
      window.webContents.print(
        {
          silent: true,
          printBackground: false,
          deviceName: options.deviceName,
          margins: { marginType: 'none' },
          pageSize: {
            width: RECEIPT_WIDTH_MICRONS,
            height: receiptHeightMicrons(heightPx)
          }
        },
        (success, failureReason) => {
          finish(success, success ? undefined : failureReason)
          if (!window.isDestroyed()) window.destroy()
        }
      )
    }

    ipcMain.once('receipt:ready', onReady)

    window.webContents.once('did-finish-load', () => {
      window.webContents.send('receipt:data', payload)
    })
    window.on('closed', () => {
      ipcMain.removeListener('receipt:ready', onReady)
      finish(false, 'Het venster werd gesloten voordat er iets is afgedrukt.')
    })

    if (process.env.ELECTRON_RENDERER_URL) {
      void window.loadURL(`${process.env.ELECTRON_RENDERER_URL}/receipt.html`)
    } else {
      void window.loadFile(join(__dirname, '../renderer/receipt.html'))
    }

    // Blijft het stil, dan is er iets mis met de pagina zelf.
    setTimeout(() => {
      if (!settled) {
        finish(false, 'Het kaartje kon niet worden opgemaakt.')
        if (!window.isDestroyed() && !options.preview) window.destroy()
      }
    }, 12_000)
  })
}

function careerPayload() {
  return career
    ? { state: career, summary: summarise(career), profiles: listProfiles(userData()) }
    : { state: null, summary: null, profiles: listProfiles(userData()) }
}

function persist(next: CareerState) {
  career = next
  writeProfile(userData(), next)
  return careerPayload()
}

/**
 * Hoeveelste rit van zijn omloop deze rit is.
 *
 * OMSI telt de ritten in de volgorde waarin het lijnbestand ze opsomt, en dat
 * nummer hoort in `[settimetable]`. Alleen op bestandsnaam zoeken is niet
 * genoeg: een omloop rijdt dezelfde rit vaak meerdere keren op een dag.
 *
 * NIEMAND ROEPT DIT MEER AAN, EN DAT IS MET OPZET
 * De situatie zet de omloop niet meer vooraf: de chauffeur kiest hem zelf in
 * OMSI, en juist daarmee staat hij ook in het spel gezet. Dit blijft staan --
 * uitgevoerd staat het niet, maar wat erin zit is duur betaald werk
 * (`scripts/probe-settimetable.ts`), en wie het ooit terug wil zetten heeft het
 * dan meteen bij de hand. Exporteren houdt het meetbaar en houdt de
 * typecontrole rustig.
 */
export function tripIndexInTour(duty: Duty): number | undefined {
  const first = duty.legs[0]
  if (!first) return undefined
  const tour = map(duty.mapFolder).tours.find(
    (item) => item.lineFile === duty.lineFile && item.number === duty.tourNumber
  )
  if (!tour) return undefined
  const index = tour.trips.findIndex(
    (trip) =>
      trip.tripFile.toLowerCase() === first.tripFile.toLowerCase() &&
      trip.departure === first.departure
  )
  return index >= 0 ? index : undefined
}

/**
 * Zet de dienst klaar in OMSI: het situatiebestand met de datum, de tijd, de bus
 * bij de eerste halte en de dienstregeling, en daarna het startscherm zo dat die
 * situatie er al staat.
 */
function prepareSituation(
  duty: Duty,
  vehiclePath: string | undefined,
  date: DutyDate | undefined,
  lineNumber: string,
  terminus: string,
  yard?: string
) {
  const when = date ?? dutyDate(duty.mapFolder, duty.days | duty.period)
  if (!when) throw new Error('Geen datum gevonden waarop deze omloop rijdt.')

  const first = duty.legs[0]
  const spawn = vehiclePath ? spawnFor(duty.mapFolder, first?.stopIds[0]) : undefined

  const result = writeSituation(omsi(), {
    mapFolder: duty.mapFolder,
    name: `OMSI Enhancer — lijn ${duty.lineFile}, omloop ${duty.tourNumber}`,
    description: `Vertrek ${formatTime(duty.start)} vanaf ${first?.stops[0] ?? '?'}.`,
    year: when.year,
    dayOfYear: when.dayOfYear,
    // Aanmelden: tien minuten voor vertrek, tijd genoeg voor de IBIS.
    minutes: duty.signOn,
    vehicle: vehiclePath
      ? {
          relativePath: vehiclePath,
          lineNumber,
          terminus,
          yard,
          // Een gelede bus is twee voertuigen; zonder dit begin je met een halve.
          trailer: trailerOf(omsi(), vehiclePath)
        }
      : undefined,
    spawn
    /*
     * Geen `timetable` meer.
     *
     * Hier stond de omloop vooraf ingevuld, en dat leek winst: je hoefde het
     * dienstregelingsmenu niet meer in. Maar de app leest uit OMSI welke rit er
     * gekozen is, en daaraan herkent hij dat de dienst loopt -- een stand die we
     * er zelf in schrijven is niet dezelfde als een die het spel zelf zet. Wie
     * de omloop aanklikt bevestigt daarmee de dienst, en dan komt de navigatie
     * op gang. De dienstkaart zegt welke omloop je moet hebben.
     */
  })

  // En het startscherm van OMSI erop zetten, zodat Start genoeg is.
  const startup = presetStartup(omsi(), duty.mapFolder, result.file)
  klaargezet = { mapFolder: duty.mapFolder, file: result.file }
  // `timetableSet` blijft onwaar: de chauffeur kiest de omloop zelf in OMSI.
  return { ...result, date: when, startup, timetableSet: false }
}

/**
 * Elke vraag van het scherm langs de klok, en langs het logboek als hij misgaat.
 *
 * Het hoofdproces doet één ding tegelijk: duurt een vraag lang, dan staat in
 * die tijd de hele app stil. Daarom staat de duur in het logboek zodra hij
 * boven de {@link TRAAG_MS} komt -- ongeveer waar een klik begint aan te voelen
 * als een hapering. Zo is bij een melding ("hij hangt na elke knop") te zien
 * wélke vraag het was, in plaats van te moeten raden.
 *
 * Een fout gaat eerst het logboek in en daarna gewoon door naar het scherm, dat
 * er zijn eigen melding van maakt.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Vraag = (event: Electron.IpcMainInvokeEvent, ...args: any[]) => unknown

function handle(kanaal: string, doen: Vraag): void {
  ipcMain.handle(kanaal, async (event, ...args) => {
    const begin = Date.now()
    try {
      return await doen(event, ...args)
    } catch (fout) {
      logFout(`vraag ${kanaal}`, fout)
      throw fout
    } finally {
      const duur = Date.now() - begin
      if (duur >= TRAAG_MS) log(`TRAAG vraag ${kanaal}: ${duur} ms`)
    }
  })
}

function registerHandlers(): void {
  /*
    * Welke versie dit is. Het meldsjabloon in Discord vraagt er als eerste
    * regel om, en tot nu toe kon je hem alleen in de programmalijst van Windows
    * vinden -- dus stond er in de meeste meldingen niets.
    */
  /*
   * Het nummer komt uit package.json en wordt bij het bouwen ingebakken; zie
   * electron.vite.config.ts. Vragen aan Electron geeft buiten een gebouwde app
   * de versie van Electron zelf terug, en dat is niet wat iemand in een
   * foutmelding hoort te plakken.
   */
  handle('app:version', () => __APP_VERSION__)

  /*
   * Hoe OMSI de vorige keer draaide. Alleen interessant als het volledig scherm
   * was: de overlay ligt dan over een spel dat het scherm exclusief opeist, en
   * dat eindigt in een zwart beeld.
   */
  handle('omsi:screen', () => {
    try {
      return readScreenMode(omsi())
    } catch {
      return undefined
    }
  })

  handle('omsi:status', () => {
    const found = findOmsiInstall(readSettings(userData()).omsiPath)
    omsiPath = found
    return { found: Boolean(found), path: found }
  })

  /*
   * Wat de app van de OMSI-map weet, en of de speler dat bevestigd heeft.
   *
   * De app zoekt zelf en heeft het meestal bij het rechte eind, maar er zijn te
   * veel installaties denkbaar om erop te gokken: Steam op een tweede schijf,
   * de doosversie van Aerosoft, twee kopieën naast elkaar, een map die iemand
   * zelf ergens heeft neergezet. Daarom legt hij zijn vondst eenmaal voor.
   */
  handle('omsi:state', (): OmsiState => {
    const settings = readSettings(userData())
    const found = findOmsiInstall(settings.omsiPath)
    omsiPath = found
    return {
      path: found,
      confirmed: Boolean(settings.omsiConfirmed && found),
      zonderKaarten: found ? !hasMaps(found) : undefined
    }
  })

  /** De map vastleggen als de juiste; daarna vraagt de app er niet meer om. */
  handle('omsi:confirm', (_event, path: string): OmsiState => {
    const uit = resolveOmsiFolder(path)
    if (!uit.path) {
      const settings = readSettings(userData())
      return { path: omsiPath, confirmed: Boolean(settings.omsiConfirmed), wrong: true }
    }
    writeSettings(userData(), { omsiPath: uit.path, omsiConfirmed: true })
    if (uit.path !== omsiPath) {
      // Alles wat uit de oude map kwam is niet meer van toepassing.
      vergeetKaarten()
    }
    omsiPath = uit.path
    return { path: uit.path, confirmed: true, via: uit.via, zonderKaarten: uit.zonderKaarten }
  })

  /*
   * Een map aanwijzen. Geeft alleen terug wat eruit komt; vastleggen doet
   * `omsi:confirm`, zodat het scherm eerst kan laten zien wat het gevonden heeft.
   */
  handle('omsi:browse', async (): Promise<OmsiState> => {
    const keuze = await dialog.showOpenDialog({
      title: 'Waar staat OMSI 2?',
      properties: ['openDirectory'],
      buttonLabel: 'Deze map'
    })
    const gekozen = keuze.filePaths[0]
    if (keuze.canceled || !gekozen) return { path: omsiPath, confirmed: false }
    const uit = resolveOmsiFolder(gekozen)
    if (!uit.path) return { path: omsiPath, confirmed: false, wrong: true }
    return { path: uit.path, confirmed: false, via: uit.via, zonderKaarten: uit.zonderKaarten }
  })

  /*
   * De speler wijst zijn OMSI-map aan.
   *
   * De app zoekt zelf op alle plekken die we kennen, maar iemand kan het spel
   * ergens hebben staan waar niemand kijkt -- en dan stond de app met lege
   * handen en een foutmelding. Nu vraagt hij het gewoon.
   */
  handle('omsi:choose', async () => {
    const keuze = await dialog.showOpenDialog({
      title: 'Waar staat OMSI 2?',
      properties: ['openDirectory'],
      buttonLabel: 'Deze map'
    })
    const gekozen = keuze.filePaths[0]
    if (keuze.canceled || !gekozen) return { found: Boolean(omsiPath), path: omsiPath, chosen: false }
    if (!isOmsiInstall(gekozen)) {
      return { found: Boolean(omsiPath), path: omsiPath, chosen: true, wrong: true }
    }
    writeSettings(userData(), { omsiPath: gekozen })
    omsiPath = gekozen
    // Alles wat uit de oude map kwam is niet meer van toepassing.
    vergeetKaarten()
    return { found: true, path: gekozen, chosen: true }
  })

  /*
   * Elke kaart die er staat, maar niet ten koste van alles.
   *
   * Een map in `maps` hoeft nog geen kaart te zijn: hij kan halverwege een
   * installatie staan, of zijn dienstregeling nog missen. Zo'n map wierp een
   * fout, en omdat de hele lijst in een keer werd opgebouwd nam die fout het
   * hele scherm mee -- "Something went wrong", en geen enkele kaart meer te
   * kiezen. Een gebruiker meldde precies dat, en de kaart deed het even later
   * gewoon: de map was nog niet klaar.
   *
   * Daarom nu per kaart. Wat niet te lezen is blijft uit de lijst en staat in
   * het logboek; de rest kun je gewoon rijden.
   */
  /*
   * De kaartenlijst komt uit de werker, en daarna van schijf.
   *
   * Hij kostte 851 ms bij het openen van de app: voor elke kaart de hele
   * dienstregeling inlezen om er de naam en het aantal omlopen uit te halen.
   * Dat is nu een samenvatting in de kaartcache, met dezelfde vingerafdruk als
   * de tekening -- verandert er niets aan een kaart, dan hoeft er niets
   * opnieuw gelezen te worden.
   */
  handle('omsi:maps', async (): Promise<MapSummary[]> => {
    try {
      return await werkerVraag<MapSummary[]>({ soort: 'overzicht' })
    } catch (fout) {
      logFout('kaartenlijst via de werker', fout)
      return laag().overzicht()
    }
  })

  /*
   * De installatiestap: hoe ver staat het klaarzetten, en begin eraan.
   *
   * Het scherm toont dit meteen na het aanwijzen van de OMSI-map. Wie daar
   * wacht tot het klaar is, merkt daarna niets meer van het inlezen -- en dat
   * was de klacht: haperingen op elk scherm, juist in de eerste minuten.
   */
  handle('kaarten:stand', (): KaartenStand => kaartenStand())

  handle('kaarten:voorbereiden', (): KaartenStand => {
    void warmKaarten()
    return kaartenStand()
  })

  handle('omsi:vehicles', () => listVehicles(omsi()))

  /*
   * Welke bus de app op deze kaart zou nemen als er geen dienst is.
   *
   * Bij dienst en carriere komt de aanbeveling uit de dienst zelf: welke bus
   * kent de eindbestemmingen die je gaat rijden. Vrij rijden heeft geen dienst,
   * en daar is de vraag dus eenvoudiger -- welke bus rijdt hier het meest rond.
   * Dat weet de kaart zelf, in haar remiselijst.
   */
  handle('fleet:suggest', (_event, mapFolder: string): Vehicle | undefined =>
    suggestFromDepot(fleet().vehicles, depotOf(mapFolder))
  )

  /**
   * Opnieuw kijken wat er staat.
   *
   * Een kaart of een bus installeer je door een map in de OMSI-map te zetten;
   * er is niets dat dat aan ons meldt, en de app leest die mappen alleen bij het
   * starten. Deze knop leest ze opnieuw -- en omdat alles wat we van een kaart
   * weten in geheugen staat, gaat dat geheugen er eerst uit: een kaart die
   * bijgewerkt is, is anders nog steeds de oude.
   *
   * Wat er nieuw is, weten we doordat we bewaren wat er de vorige keer stond.
   */
  handle('omsi:check', (): InstalledCheck => {
    vergeetKaarten()
    vehicleTrackers.clear()

    const maps = listMaps(omsi()).map((folder) => {
      const loaded = map(folder)
      const time = era(folder)
      return {
        folder,
        name: loaded.name,
        tours: loaded.tours.length,
        hasTemplate: Boolean(findTemplate(omsi(), folder)),
        year: time.year,
        dayOfYear: time.dayOfYear
      }
    })
    const vehicles = listVehicles(omsi())
    // Per map kijken, niet per busbestand: een add-on is een map, en anders
    // meldt de app dertig "nieuwe bussen" voor één pakket.
    const busFolders = [...new Set(vehicles.map((item) => item.folder))].sort()

    const known = readKnown(userData())
    const mapDiff = difference(known?.maps ?? [], maps.map((item) => item.folder))
    const busDiff = difference(known?.buses ?? [], busFolders)
    writeKnown(userData(), { maps: maps.map((item) => item.folder), buses: busFolders })

    // De naam van een kaart zegt de gebruiker meer dan zijn mapnaam.
    const nameOf = (folder: string): string =>
      maps.find((item) => item.folder === folder)?.name || folder

    /*
     * De eerste keer is alles nieuw, en dat is geen nieuws: dan hebben we
     * niets om mee te vergelijken. We melden dan wat er staat en houden de
     * lijsten leeg, zodat niemand -- de interface noch een proef -- elf kaarten
     * als aanwinst leest.
     */
    if (!known) {
      return { maps, vehicles, first: true, addedMaps: [], removedMaps: [], addedBuses: [], removedBuses: [] }
    }

    return {
      maps,
      vehicles,
      first: false,
      addedMaps: mapDiff.added.map(nameOf),
      removedMaps: mapDiff.removed,
      addedBuses: busDiff.added,
      removedBuses: busDiff.removed
    }
  })

  /**
   * Halteposities van een kaart. Het doorlezen van de tegels kost een fractie
   * van een seconde tot ruim een seconde, dus eenmaal per kaart.
   */
  handle('map:geometry', async (_event, folder: string): Promise<MapGeometry> => {
    /*
     * Meetellen als voorgrondwerk: het voorwerk op de achtergrond wacht hierop.
     */
    voorgrondBezig += 1
    try {
      // Staat de kaart nog nergens, dan leest de werker hem; anders komt hij
      // zo van schijf. Het hoofdproces legt in geen van beide gevallen stil.
      await zorgVoorKaart(folder)
      return mapGeometry(folder)
    } finally {
      voorgrondBezig -= 1
    }
  })

  /**
   * De route van elke rit van een dienst, als lijn over de kaart. Eenmaal per
   * rit uitgerekend; het rijstrokennet wordt pas opgebouwd als een rit geen
   * bruikbare route van OMSI zelf heeft.
   */
  /**
   * De route van elke rit van een dienst, als lijn over de kaart.
   *
   * Ook dit gaat naar de werker: het rijstrokennet van een kaart opbouwen kost
   * tot een seconde, en dat gebeurt precies op het moment dat de speler een
   * dienst aanwijst.
   */
  handle(
    'map:routes',
    async (
      _event,
      folder: string,
      legs: Array<{ tripFile: string; stopIds: string[] }>
    ): Promise<TripRoute[]> => {
      try {
        return await werkerVraag<TripRoute[]>({ soort: 'routes', folder, legs })
      } catch (fout) {
        logFout('routes via de werker', fout)
        return laag().routes(folder, legs)
      }
    }
  )

  /*
   * De instellingen en de toetsen van OMSI zelf.
   *
   * OMSI schrijft `options.cfg` en `Inputs\\keyboard.cfg` bij het afsluiten
   * opnieuw. Draait het spel, dan is alles wat hier verandert straks weg, dus
   * dat melden we erbij in plaats van het stilletjes te laten gebeuren.
   */
  handle('game:settings', async () => ({
    values: readGameSettings(omsi()),
    omsiRunning: await isOmsiRunning()
  }))

  handle('game:settings:save', (_event, changes: Record<string, string>) => {
    writeGameSettings(omsi(), changes)
    return readGameSettings(omsi())
  })

  /** De taal van OMSI zelf bepaalt hoe de toetsen en handelingen heten. */
  handle('game:keys', async () => {
    const language = omsiLanguage()
    return {
      bindings: readKeyboard(omsi()),
      keyNames: [...readKeyNames(omsi(), language === 'DEU' ? 'DEU' : 'ENG')],
      labels: [...readActionLabels(omsi(), language)],
      omsiRunning: await isOmsiRunning()
    }
  })

  /**
   * De gamecontrollers. De namen van de handelingen zijn dezelfde als bij het
   * toetsenbord, dus die gaan mee: een knop op je stuur doet hetzelfde als een
   * toets.
   */
  handle('game:controllers', async () => ({
    controllers: readControllers(omsi()),
    labels: [...readActionLabels(omsi(), omsiLanguage())],
    omsiRunning: await isOmsiRunning()
  }))

  handle('game:controllers:save', (_event, controllers: ControllerConfig[]) => {
    writeControllers(omsi(), controllers)
    return readControllers(omsi())
  })

  handle('game:keys:save', (_event, bindings: KeyBinding[]) => {
    writeKeyboard(omsi(), bindings)
    return readKeyboard(omsi())
  })

  /** Terug naar de indeling waarmee OMSI geleverd wordt. */
  handle('game:keys:reset', () => {
    const defaults = readKeyboard(omsi(), true)
    if (defaults.length > 0) writeKeyboard(omsi(), defaults)
    return readKeyboard(omsi())
  })

  /*
   * "Draait OMSI?" betekent: geeft de plugin nu gegevens door. Een live.json van
   * een vorige sessie blijft met alive:true op schijf staan, en daarop afgaan
   * zou het opstartvenster meteen sluiten en de overlay boven een spel hangen
   * dat nog aan het laden is.
   */
  handle('omsi:live', () => Boolean(freshLive()?.alive))

  /** Draait het spel al? Los van de plugin, die zich pas meldt met een bus. */
  handle('omsi:running', () => isOmsiRunning())

  /*
   * Wat de bus op dit moment doorgeeft, voor het hoofdvenster.
   *
   * De overlay krijgt dit al als beeld toegestuurd, maar het hoofdvenster had
   * alleen de sessiecijfers -- kilometers en vertraging over de hele dienst.
   * Voor een dienstregeling die meeloopt is meer nodig: welke rit, welke halte,
   * en hoeveel je voor of achter ligt op dit punt.
   */
  handle('live:status', () => {
    const live = freshLive()
    if (!live) return { status: undefined, vehicle: undefined }
    const duty = currentDuty()
    return {
      status: describeLive(live, duty, baseline()),
      /*
       * En waar de bus op de kaart staat. De overlay krijgt dit al in zijn
       * beeld; het hoofdvenster heeft het nodig om dezelfde navigatie te kunnen
       * tekenen.
       */
      vehicle: vehicleOnMap(live, duty)
    }
  })

  /** Printers die Windows kent, met de standaardprinter vooraan. */
  handle('print:printers', async (event) => {
    const printers = await event.sender.getPrintersAsync()
    return printers
      .map((printer) => ({
        name: printer.name,
        displayName: printer.displayName || printer.name,
        isDefault: printer.isDefault
      }))
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault))
  })

  handle('print:receipt', (_event, payload, deviceName?: string) =>
    printReceipt(withDriver(payload), { deviceName, preview: false })
  )

  handle('print:preview', (_event, payload) =>
    printReceipt(withDriver(payload), { preview: true })
  )

  /**
   * De overlay werkt alleen als de plugin in OMSI staat. Het installatieprogramma
   * zet hem er neer als het Steam via het register vindt; staat OMSI elders, dan
   * gebeurt het hier alsnog.
   */
  handle('plugin:status', () => {
    if (!pluginStatus) {
      pluginStatus = ensurePlugin(
        omsi(),
        pluginSourceDir(process.resourcesPath, app.isPackaged),
        app.isPackaged ? undefined : join(process.cwd(), 'plugin')
      )
    }
    return pluginStatus
  })

  /**
   * Levert een rooster om uit te kiezen. Bij elke dienst wordt een passende bus
   * gezocht — die is een aanbeveling, want de speler laadt zijn bus zelf in OMSI.
   */
  /*
   * De dienstenlijst komt uit de werker.
   *
   * Dit was met 1989 ms de traagste vraag van het hele scherm, en zolang hij
   * liep deed de app niets: geen knop, geen venster, geen overlay. Nu rekent de
   * werker en blijft het scherm leven. Valt de werker uit, dan doet het
   * hoofdproces het alsnog zelf -- traag, maar de speler krijgt zijn diensten.
   */
  handle('duty:list', async (_event, request: DutyRequest): Promise<Assignment[]> => {
    try {
      return await werkerVraag<Assignment[]>({ soort: 'diensten', request })
    } catch (fout) {
      logFout('diensten via de werker', fout)
      return laag().diensten(request)
    }
  })

  handle('duty:ibis', (_event, duty, vehicle, year: number, yard?: string) =>
    buildIbisPlan(omsi(), vehicle.relativePath, duty, year, yard)
  )

  /*
   * De wagenparken die naast een bus liggen. Wat erin staat verschilt per stad
   * en per tijdvak, en dus ook wat de chauffeur intoetst -- daarom mag hij zelf
   * kiezen, met erbij hoeveel bestemmingen elk wagenpark van deze dienst kent.
   */
  handle(
    'duty:yards',
    (_event, duty: Duty, vehicle: { relativePath: string }, year: number): YardOption[] => {
      const termini: string[] = [
        ...new Set(duty.legs.map((leg: DutyLeg) => leg.terminus).filter(Boolean))
      ]
      const hofs = listHofs(join(omsi(), vehicle.relativePath))
      const suggested = pickHof(hofs, termini, year)?.hof.name
      return hofs
        .map((hof) => {
          const match = matchHof(hof, termini)
          return {
            name: hof.name,
            known: match.matched,
            total: termini.length,
            suggested: hof.name === suggested
          }
        })
        .sort((a, b) => b.known - a.known || a.name.localeCompare(b.name))
    }
  )

  /*
   * De wagenparken van deze kaart naar de bussen die hem niet kennen.
   *
   * Twee handelingen, en met opzet gescheiden: eerst kijken, dan pas schrijven.
   * Dit is de enige plek waar de app iets in de voertuigmappen van OMSI zet, dus
   * daar moet de chauffeur ja tegen gezegd hebben.
   */
  handle('hof:offers', (_event, mapFolder: string): HofOffer[] => {
    const termini = terminiOf(mapFolder)
    if (termini.length === 0) return []
    return planHofs(omsi(), termini)
      .filter((bus) => bus.offer && bus.offer.matched > bus.known)
      .map((bus) => ({
        folder: bus.folder,
        known: bus.known,
        total: termini.length,
        knownFile: bus.knownFile,
        offerFile: bus.offer?.file,
        offerMatched: bus.offer?.matched
      }))
      .sort((a, b) => (b.offerMatched ?? 0) - (a.offerMatched ?? 0))
  })

  handle(
    'hof:offerFor',
    (_event, mapFolder: string, folder: string): HofOffer | undefined => {
      const termini = terminiOf(mapFolder)
      if (termini.length === 0) return undefined
      const bus = planHofs(omsi(), termini).find((item) => item.folder === folder)
      if (!bus?.offer || bus.offer.matched <= bus.known) return undefined
      return {
        folder: bus.folder,
        known: bus.known,
        total: termini.length,
        knownFile: bus.knownFile,
        offerFile: bus.offer.file,
        offerMatched: bus.offer.matched
      }
    }
  )

  handle(
    'hof:place',
    (_event, mapFolder: string, folders: string[]): { placed: number; failed: string[] } => {
      const termini = terminiOf(mapFolder)
      const wanted = new Set(folders)
      const plan = planHofs(omsi(), termini).filter(
        (bus) => wanted.has(bus.folder) && bus.offer
      )

      const done = readPlacements(userData())
      const failed: string[] = []
      let placed = 0
      for (const bus of plan) {
        try {
          const result = placeHof(omsi(), bus.folder, bus.offer!.source)
          if (result) {
            done.push(result)
            placed++
          }
        } catch {
          failed.push(bus.folder)
        }
      }
      if (placed > 0) writePlacements(userData(), done)
      /*
       * Het wagenpark van een bus wordt bij het opbouwen van de vloot gelezen;
       * met een nieuw bestand ernaast klopt die lijst niet meer.
       */
      if (placed > 0) vergeetKaarten()
      return { placed, failed }
    }
  )

  /** De lijnen van een kaart, om er een route mee te kiezen of een examen op te doen. */
  handle('map:lines', (_event, mapFolder: string): LineSummary[] =>
    listLines(map(mapFolder), network(mapFolder))
  )

  /**
   * De examenrit: één rit op de gekozen lijn, met een bus erbij gezocht. Slaagt
   * de kandidaat, dan levert dat de vergunning voor deze lijn op.
   */
  handle('duty:exam', (_event, mapFolder: string, lineFile: string): Assignment | null => {
    const duty = examTrip(map(mapFolder), network(mapFolder), lineFile)
    if (!duty) return null
    const choice = pickVehicleForDuty(
      fleet(),
      duty,
      era(mapFolder).year,
      fleetOf(mapFolder),
      undefined,
      depotOf(mapFolder)
    )
    return {
      duty,
      date: dutyDate(mapFolder, duty.days | duty.period),
      vehicle: choice?.vehicle ?? null,
      yard: choice?.yard,
      fit: choice?.fit,
      fromMapFleet: choice?.fromMapFleet,
      alternatives: choice?.alternatives
    }
  })

  /**
   * Het examen afronden: de gereden rit langs de eisen leggen en het oordeel in
   * het profiel zetten. Geslaagd betekent een vergunning voor deze lijn erbij.
   */
  handle(
    'career:exam',
    (_event, duty: Duty, measured: ExamMeasurement, basic: boolean) => {
      if (!career) return careerPayload()
      const judgement = judgeExam(measured)
      return persist(
        recordExam(career, {
          id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
          takenAt: new Date().toISOString(),
          mapFolder: duty.mapFolder,
          mapName: duty.mapName,
          lineFile: duty.lineFile,
          lineNumbers: duty.lineNumbers,
          basic,
          passed: judgement.passed,
          score: judgement.score,
          criteria: judgement.criteria
        })
      )
    }
  )

  /**
   * Vrij rijden: alleen klaarzetten wat de speler zelf heeft samengesteld.
   *
   * Er komt geen dienst aan te pas en er wordt niets geboekt. Kiest hij een
   * lijn, dan zoeken we daar de omloop bij die het dichtst bij zijn tijd
   * vertrekt -- dan staat het dienstregelingsmenu ook meteen goed en heeft de
   * overlay een route om te tekenen.
   */
  handle('free:start', async (_event, request: FreeRequest) => {
    const loaded = map(request.mapFolder)
    const net = network(request.mapFolder)

    const duty = request.lineFile
      ? generateDuty(loaded, net, {
          lineFile: request.lineFile,
          targetMinutes: 90,
          earliestStart: request.minutes - 30,
          latestStart: request.minutes + 120
        })
      : undefined

    const vehiclePath = request.vehiclePath
    const spawnStop = request.stopId ?? duty?.legs[0]?.stopIds[0]
    const spawn = vehiclePath ? spawnFor(request.mapFolder, spawnStop) : undefined

    const result = writeSituation(omsi(), {
      mapFolder: request.mapFolder,
      name: 'OMSI Enhancer — vrij rijden',
      description: duty
        ? `Lijn ${duty.lineNumbers.join('/')} vanaf ${formatTime(request.minutes)}.`
        : `Vrij rijden vanaf ${formatTime(request.minutes)}.`,
      year: request.year,
      dayOfYear: request.dayOfYear,
      minutes: request.minutes,
      vehicle: vehiclePath
        ? {
            relativePath: vehiclePath,
            lineNumber: duty?.lineNumbers[0] ?? '',
            terminus: duty?.legs[0]?.terminus ?? '',
            yard: request.yard,
            // Ook bij vrij rijden: een gelede bus is twee voertuigen.
            trailer: trailerOf(omsi(), vehiclePath)
          }
        : undefined,
      spawn,
      weather: request.weather
      // Ook hier geen omloop vooraf; zie de uitleg hierboven.
    })

    const startup = presetStartup(omsi(), request.mapFolder, result.file)
    klaargezet = { mapFolder: request.mapFolder, file: result.file }
    if (duty) openOverlay(duty)

    let launched = false
    const running = await isOmsiRunning()
    if (!running) {
      try {
        // Wachten tot het echt gelukt is: de fout komt anders pas later binnen,
        // en dan is er niemand meer die hem opvangt.
        launched = (await launchOmsi(omsi(), readSettings(userData()).windowedOmsi)) === 'gestart'
      } catch {
        // Lukt starten niet, dan doet de speler het zelf.
      }
    }
    return { file: result.file, startup, launched, running, duty: duty ?? null }
  })

  /**
   * De chauffeur neemt een dienst aan. Vanaf nu staat hij in het profiel en
   * blijft hij daar tot hij is afgerond of geannuleerd. Een tweede dienst
   * aannemen terwijl er een loopt kan niet.
   */
  handle(
    'duty:confirm',
    (
      _event,
      assignment: Assignment,
      vehicleOverride: string,
      mode?: GameMode,
      exam?: ActiveDuty['exam']
    ) => {
      if (!career || career.activeDuty) return careerPayload()
      return persist({
        ...career,
        activeDuty: {
          assignment,
          vehicleOverride,
          confirmedAt: new Date().toISOString(),
          mode,
          exam
        }
      })
    }
  )

  /** De aangenomen dienst teruggeven, zonder hem in het logboek te zetten. */
  handle('duty:cancel', () => {
    closeOverlay()
    overlayDuty = undefined
    overlayIbis = undefined
    if (!career) return careerPayload()
    return persist({ ...career, activeDuty: undefined })
  })

  /**
   * De dienst begint: overlay openen, het spel starten en de kilometerstand
   * vastleggen. Het klaarzetten hoort hierbij en is geen aparte knop meer: de
   * situatie wordt geschreven en als "Last Situation" klaargezet, en pas daarna
   * gaat het spel aan. Zo hoeft de chauffeur in OMSI alleen op Start te drukken.
   */
  handle('duty:begin', async (_event, request: BeginRequest) => {
    const { duty, ibis } = request
    if (career?.activeDuty && !career.activeDuty.startedAt) {
      persist({ ...career, activeDuty: { ...career.activeDuty, startedAt: new Date().toISOString() } })
    }

    /*
     * Eerst klaarzetten, dan pas starten. Andersom heeft geen zin: OMSI leest
     * het startscherm bij het opstarten, dus wat er daarna nog geschreven wordt
     * ziet het spel deze sessie niet meer.
     */
    let prepared: ReturnType<typeof prepareSituation> | undefined
    let prepareError: string | undefined
    try {
      prepared = prepareSituation(
        duty,
        request.vehiclePath,
        request.date,
        request.lineNumber,
        request.terminus,
        request.yard
      )
    } catch (cause) {
      prepareError = cause instanceof Error ? cause.message : String(cause)
    }

    captureBaseline()
    const live = freshLive()
    /*
     * De overlay gaat pas open als het spel er is. Draait OMSI al met de plugin,
     * dan kan dat nu; anders wacht de app op het venstertje dat meldt dat het
     * spel geladen is, en opent hem daar. Een overlay die boven een leeg
     * bureaublad hangt terwijl OMSI nog aan het laden is, is alleen maar in de
     * weg.
     */
    if (live?.alive) openOverlay(duty, ibis)

    // Het spel erbij starten, tenzij het al draait.
    let launched = false
    const running = await isOmsiRunning()
    if (!running) {
      try {
        launched = (await launchOmsi(omsi(), readSettings(userData()).windowedOmsi)) === 'gestart'
      } catch {
        // Lukt starten niet, dan doet de speler het zelf; de overlay staat klaar.
      }
    }
    /*
     * Vanaf hier houden we in de gaten of het spel weer dichtgaat. Doet het dat,
     * dan heeft het onze `[last_map]` overschreven met de kaart die het speelde,
     * en zetten we de situatie opnieuw klaar.
     */
    omsiDraaide = running || launched
    return { connected: Boolean(live?.alive), launched, running, prepared, prepareError }
  })

  /**
   * Wat er sinds het begin van de dienst gereden is, volgens de plugin.
   *
   * Meteen ook het moment om te kijken of OMSI net is afgesloten. De interface
   * vraagt dit elke vijf tellen zolang een dienst loopt, en dat is precies waar
   * het startscherm rechtgezet moet worden: het spel schrijft `options.cfg` bij
   * het afsluiten opnieuw en gooit onze kaartkeuze eruit.
   */
  handle('duty:session', () => {
    void herstelStartscherm()
    return sessieGegevens()
  })

  /**
   * Open of dicht, zoals gevraagd, en niet omgekeerd: een knop die "wisselt"
   * sluit een overlay die de app voor dicht aanzag. Levert de werkelijke stand.
   */
  handle('overlay:set', (_event, duty: Duty | undefined, open: boolean, ibis?: IbisPlan) => {
    if (open && duty) openOverlay(duty, ibis)
    else if (!open) closeOverlay()
    return overlayIsOpen()
  })

  handle('overlay:isOpen', () => overlayIsOpen())

  /** De overlay sluit zichzelf, met de knop in de bewerkstand. */
  handle('overlay:close', () => closeOverlay())

  handle('overlay:edit', (_event, on?: boolean) =>
    setOverlayEdit(on === undefined ? !overlayEditing : on)
  )

  /** De pagina meldt of de muis boven een knop hangt. */
  handle('overlay:hit', (_event, on: boolean) => {
    if (overlayEditing || overlayGrabbing) return
    passMouseThrough(!on)
  })

  /*
   * Vastpakken om te slepen of te schalen.
   *
   * Zolang dat duurt beslaat het venster het hele scherm en vangt het de muis,
   * anders stopt het slepen bij de eigen rand. Daarna krimpt het weer om de
   * inhoud heen -- elke punt die het venster beslaat moet Windows immers over
   * het spel heen mengen.
   */
  handle('overlay:grab', (_event, on: boolean) => {
    if (overlayEditing) return
    overlayGrabbing = on
    passMouseThrough(!on)
    applyOverlayBounds()
  })

  handle('settings:read', () => readSettings(userData()))

  handle('settings:write', (_event, settings: Partial<Settings>) => {
    const saved = writeSettings(userData(), settings)
    // Een overlay die al openstaat hoort de nieuwe verversing meteen te volgen.
    if (overlayTimer) {
      clearInterval(overlayTimer)
      overlayTimer = setInterval(pushFrame, OVERLAY_RATES[saved.overlayRate])
    }
    return saved
  })

  handle('overlay:bounds', (_event, box?: { x: number; y: number; w: number; h: number }) => {
    overlayBox = box
    applyOverlayBounds()
  })

  handle('overlay:layout', () => readOverlayLayout(userData()))

  handle('overlay:layout:save', (_event, layout: OverlayLayout) => {
    writeOverlayLayout(userData(), layout)
    return layout
  })

  handle('overlay:layout:reset', () => {
    const layout = defaultLayout()
    writeOverlayLayout(userData(), layout)
    return layout
  })

  handle('career:load', () => careerPayload())

  /*
   * Bij het wisselen van chauffeur moet alles van de vorige los.
   *
   * De lopende dienst hangt niet alleen in het profiel maar ook hier in het
   * geheugen, voor de overlay. Bleef die staan, dan kreeg een gloednieuwe
   * chauffeur de dienst van zijn voorganger te zien -- inclusief de overlay die
   * nog over het spel hing.
   */
  const wisselVanChauffeur = (): void => {
    closeOverlay()
    overlayDuty = undefined
    overlayIbis = undefined
  }

  handle('career:create', (_event, name: string) => {
    wisselVanChauffeur()
    return persist(createProfile(userData(), name))
  })

  handle('career:select', (_event, id: string) => {
    const chosen = readProfile(userData(), id)
    if (!chosen) return careerPayload()
    wisselVanChauffeur()
    setActive(userData(), id)
    career = chosen
    return careerPayload()
  })

  handle('career:delete', (_event, id: string) => {
    wisselVanChauffeur()
    deleteProfile(userData(), id)
    career = resolveActive(userData())
    return careerPayload()
  })

  handle('career:complete', (_event, duty, vehicle: string, measured) => {
    // Een afgeronde dienst heeft geen overlay meer nodig.
    closeOverlay()
    overlayDuty = undefined
    overlayIbis = undefined
    if (!career) return careerPayload()
    return persist(completeDuty(career, duty, vehicle, measured))
  })

  handle('career:rename', (_event, name: string) => {
    if (!career) return careerPayload()
    return persist({ ...career, driver: name.trim() || career.driver })
  })
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1240,
    height: 860,
    /*
     * De ondergrens lag op 940 bij 640, en dat was ook meteen de reden dat er
     * bij een klein venster een schuifbalk onderaan verscheen: kleiner kon niet,
     * dus was er nooit reden om de opmaak te laten meegeven. Nu kan het venster
     * wel kleiner, en gaat de zijbalk onder de negenhonderd punten boven de
     * inhoud staan in plaats van ernaast.
     */
    minWidth: 720,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#11151c',
    title: 'OMSI Enhancer',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  window.on('ready-to-show', () => window.show())
  mainWindow = window

  /*
   * Wat er met het venster misgaat hoort in het logboek.
   *
   * "Hij hangt" en "hij is zomaar weg" zijn twee verschillende dingen, en
   * alleen Windows kan ze uit elkaar houden: `unresponsive` is het eerste,
   * `render-process-gone` het tweede, met de reden erbij (geheugen op,
   * vastgelopen, zelf afgesloten). Zonder deze twee regels stuurt een speler
   * een schermafdruk van een leeg venster en weten we nog niets.
   */
  window.on('unresponsive', () => log('venster reageert niet meer'))
  window.on('responsive', () => log('venster reageert weer'))
  window.webContents.on('render-process-gone', (_gebeurtenis, details) =>
    log(`FOUT  venster weg: ${details.reason}, exitcode ${details.exitCode}`)
  )
  window.webContents.on('console-message', (_gebeurtenis, niveau, bericht, regel, bron) => {
    /*
     * Alleen echte fouten (niveau 3). Op 2 staan de waarschuwingen, en die
     * vulden het logboek meteen met honderden regels van één soort -- het
     * beveiligingsbeleid dat een lettertype weigerde. Nuttig om te weten, maar
     * niet driehonderd keer.
     */
    if (niveau >= 3) log(`FOUT  in het scherm: ${bericht} (${bron}:${regel})`)
  })

  /*
   * Het hoofdvenster dicht is de app dicht. Zonder dit bleef de app draaien: het
   * overlayvenster telt ook als venster, dus 'window-all-closed' kwam nooit, en
   * de overlay bleef boven het spel hangen zonder knop of taakbalkicoon.
   */
  window.on('closed', () => {
    mainWindow = null
    app.quit()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/** Een tweede start haalt het venster dat er al is naar voren. */
function bringMainWindowForward(): void {
  // Geen hoofdvenster na het opstarten betekent dat de app al aan het afsluiten
  // is; dan hoort er ook geen nieuw venster meer bij te komen.
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

/*
 * Eén exemplaar tegelijk. Twee exemplaren delen dezelfde map in AppData: elk
 * houdt zijn eigen loopbaan in het geheugen en schrijft die bij elke wijziging
 * weg, dus de laatste schrijver wist wat de ander net vastlegde. En elk hangt
 * zijn eigen overlay boven OMSI. Dat gebeurde toen een oude draagbare versie
 * nog naast de geïnstalleerde draaide.
 *
 * Electron legt het slot op de map met gebruikersgegevens, precies de plek die
 * we willen beschermen. Wie het slot niet krijgt, opent niets en stopt.
 */
/**
 * Chauffeurs meenemen uit de tijd dat de app OMSI Career heette.
 *
 * Electron leidt de map met gebruikersgegevens af van de naam in package.json,
 * dus met de nieuwe naam kijkt de app naar een lege map en zou iedereen zijn
 * logboek kwijt zijn. Kopiëren en niet verplaatsen: wie de oude versie nog eens
 * start, vindt daar nog gewoon zijn profielen.
 */
function adoptOldProfiles(): void {
  const now = userData()
  const before = join(dirname(now), 'omsi-career')
  if (now === before || existsSync(join(now, 'profiles')) || !existsSync(join(before, 'profiles'))) {
    return
  }
  try {
    cpSync(before, now, { recursive: true })
  } catch {
    // Lukt het niet, dan begint de chauffeur met een leeg logboek; niets breekt.
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', bringMainWindowForward)

  app.whenReady().then(() => {
    /*
     * Het logboek gaat als eerste aan, nog voor er iets gelezen wordt.
     *
     * Meldingen kwamen binnen als "hij hangt" en "hij is zomaar afgesloten", en
     * daar viel niets aan na te kijken. Vanaf nu schrijft de app mee: wat er
     * traag was, welke kaart eraan te pas kwam, en waarop het ophield. De
     * speler stuurt dat bestand mee en dan staat het er gewoon.
     */
    const pad = startLogboek(
      userData(),
      `OMSI Enhancer ${__APP_VERSION__} start -- Electron ${process.versions.electron}, ` +
        `Windows ${process.getSystemVersion?.() ?? ''}, ${process.arch}`
    )
    log(`gebruikersgegevens: ${userData()}`)
    if (pad) log(`logboek: ${pad}`)

    /*
     * Wat de app onderuit haalt hoort in het logboek te staan, niet alleen in
     * een venster dat wegklikt. Afsluiten doen we er niet bij: Electron doet
     * dat zelf al waar het moet.
     */
    process.on('uncaughtException', (fout) => logFout('onafgevangen fout', fout))
    process.on('unhandledRejection', (reden) => logFout('onafgehandelde belofte', reden))
    app.on('child-process-gone', (_gebeurtenis, details) =>
      log(`FOUT  hulpproces weg: ${details.type} ${details.reason} ${details.exitCode}`)
    )

    adoptOldProfiles()
    try {
      log(`OMSI: ${omsi()}`)
    } catch (fout) {
      logFout('OMSI zoeken', fout)
    }
    career = resolveActive(userData())
    registerHandlers()
    createWindow()

    /*
     * Pas als het venster er staat. Eerst het scherm, dan het voorwerk: wie de
     * app opent wil hem zien, niet wachten tot twaalf kaarten zijn ingelezen.
     */
    setTimeout(() => void warmKaarten(), 6000)

    // Onder het rijden zit je niet met de muis in de app. Deze toets zet de
    // overlay in de bewerkstand en er weer uit; hij botst niet met OMSI, dat
    // Ctrl+Alt zelf nergens voor gebruikt.
    globalShortcut.register('Control+Alt+O', () => {
      if (overlayWindow && !overlayWindow.isDestroyed()) setOverlayEdit(!overlayEditing)
    })

    // Een stand verder in het dienstpaneel: beknopt, normaal, uitgebreid.
    globalShortcut.register('Control+Alt+V', () => {
      if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.webContents.send('overlay:cycle')
    })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('before-quit', () => {
    closeOverlay()
    sluitLopendeDienstAf()
  })

  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
