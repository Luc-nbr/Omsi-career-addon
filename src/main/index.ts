import { spawn } from 'node:child_process'
import { app, BrowserWindow, dialog, globalShortcut, ipcMain, net, protocol, screen, shell } from 'electron'
import { cpSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Worker } from 'node:worker_threads'
import { log, logboekPad, logFout, startLogboek, TRAAG_MS } from '../core/logboek'
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
  clearProfilePhoto,
  createProfile,
  deleteProfile,
  listProfiles,
  profilePhotoPath,
  readProfile,
  resolveActive,
  setActive,
  setProfilePhoto,
  writeProfile,
  zorgVoorDienstgegevens,
  PHOTO_EXTENSIONS
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
import { pickVehicleForDuty, type FleetIndex } from '../core/fleet'
import { readTileGrid, type MapGeometry } from '../core/geo'
import { LaneNetwork, type TripRoute } from '../core/routing'
import { VehicleTracker, type VehiclePosition } from '../core/vehicle'
import { buildIbisPlan, type IbisPlan } from '../core/ibis'
import { describeLive, liveMap, pluginLogboek, readLive, stelLiveMappenIn } from '../core/live'
import { findOmsiInstall, hasMaps, isOmsiInstall, resolveOmsiFolder } from '../core/install'
import { isOmsiRunning, launchOmsi } from '../core/launch'
import { ensurePlugin, pluginSourceDir, type PluginStatus } from '../core/pluginInstall'
import { readOverlayLayout, writeOverlayLayout } from '../core/overlayLayout'
import { receiptHeightMicrons, RECEIPT_WIDTH_MICRONS } from '../core/receipt'
import { difference, readKnown, writeKnown } from '../core/installed'
import { readSettings, writeSettings, type Settings } from '../core/settings'
import {
  LEGE_TELEFOON,
  aanmeldSleutelVan,
  type AanmeldUitslag,
  type TelefoonStand
} from '../shared/telefoon'
import {
  apparaatBeeld,
  apparaatKijkt,
  apparaatStand,
  nieuweSleutel,
  startApparaat,
  stopApparaat,
  type ApparaatBronnen,
  type TelefoonOpdracht
} from './apparaat'
import { formatTime } from '../shared/format'
import {
  busfotoAdres,
  busfotoAfgehandeld,
  busfotoMap,
  maakBusfoto,
  ruimOudeFotosOp,
  sluitBusfotoVenster
} from './busfoto'
import type { BusTekeningMetPlaten } from '../core/busbeeld'
import { kleurstellingenVanBus } from '../core/kleurstelling'
import {
  herkenOverlays,
  leesLogfileStaart,
  leesOmsiProces,
  sluitOmsi,
  type OverlayInOmsi
} from '../core/omsiProces'
import { kaartjesVoor, type Kaartset } from '../core/kaartjes'
import { leesKnoppen, zetKnop, type Schakelbaar, type Uitkomst as OverlayUitkomst, type OverlayKnoppen } from '../core/overlayknop'
import { writeSituation } from '../core/situation'
import { presetStartup } from '../core/startup'
import { zetKopieMap } from '../core/veilig'
import { trailerOf } from '../core/trailer'
import { spawnAtStop } from '../core/spawn'
import { listMaps } from '../core/timetable'
import type { Vehicle } from '../core/vehicles'
import type { Duty, DutyLeg, OmsiMap } from '../core/types'
import { listHofs, matchHof, pickHof } from '../core/hof'
import { placeHof, planHofs, readPlacements, writePlacements } from '../core/hofTool'
import { readScreenMode } from '../core/schermmodus'
import {
  type Assignment,
  type KaartenStand,
  type BusfotoStand,
  type BusKleurstellingen,
  type OmsiMelding,
  type OmsiOverlays,
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
  for (const [soort, staand] of werkers) {
    werkers.delete(soort)
    staand.terminate().catch(() => undefined)
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
  /** Waar de tijd heen ging, als de opdracht dat zelf bijhoudt. */
  detail?: string
}

/*
 * Twee werkers, met een reden.
 *
 * Alles door één werker leek genoeg, tot de meting: het voorwerk las een kaart
 * van twee seconden en een klik van de speler stond zolang in dezelfde rij te
 * wachten -- `hof:offers` kwam zo op 3408 ms uit. Daarom een werker voor wat de
 * speler vraagt en een werker voor het voorwerk. De tweede sluit zichzelf zodra
 * de kaarten klaarstaan; zijn caches zijn dan niets meer waard en het geheugen
 * is beter elders op zijn plek.
 */
/*
 * En een derde voor de busfoto's. Die stonden eerst bij het voorwerk van de
 * kaarten, en wie het klaarzetten van de kaarten oversloeg en meteen de foto's
 * liet maken, kreeg ze om beurten met een kaart van twee seconden: 6 seconden
 * per foto in plaats van 0,85, "nog 37 minuten" in plaats van 6. Een eigen
 * werker kost een eigen kopie van de caches, maar hij sluit zodra de ronde
 * klaar is.
 */
type Werksoort = 'voorgrond' | 'achtergrond' | 'fotos'

const werkers = new Map<Werksoort, Worker>()
let volgendeOpdracht = 0
/*
 * Wie op antwoord wacht, en van wie.
 *
 * De soort staat erbij omdat een werker kan verdwijnen terwijl er nog vragen
 * openstaan -- `vergeetKaarten()` sluit ze allebei, en de werker van het
 * voorwerk sluit zichzelf. Wie dan blijft wachten, wacht voor altijd: het
 * scherm houdt zijn wachtdraaitje aan en voor de speler is de app vastgelopen.
 * Daarom krijgt iedereen van die werker meteen een antwoord, ook al is het
 * "niet gelukt" -- daar staat een terugval op.
 */
const werkerWacht = new Map<number, { werker: Worker; klaar: (antwoord: WerkerAntwoord) => void }>()

/**
 * Iedereen die op déze werker wacht een antwoord geven, met reden.
 *
 * Op de werker zelf, niet op zijn soort: een gesloten werker wordt meteen
 * vervangen door een nieuwe van dezelfde soort, en zijn afscheidsbericht komt
 * pas daarna binnen. Op soort vergelijken gooide zo de vragen weg die net bij
 * de nieuwe waren neergelegd -- die vielen dan terug op het hoofdproces, en dat
 * stond 608 ms stil waar het 14 ms hoorde te zijn (`probe-stilstand.cjs`).
 */
function stuurWachtendenWeg(werker: Worker, reden: string): void {
  for (const [id, wachtend] of werkerWacht) {
    if (wachtend.werker !== werker) continue
    werkerWacht.delete(id)
    wachtend.klaar({ id, ok: false, ms: 0, fout: reden })
  }
}

function kaartWerker(soort: Werksoort): Worker {
  const staand = werkers.get(soort)
  if (staand) return staand

  const gemaakt = new Worker(join(__dirname, 'kaartwerker.js'), {
    workerData: { omsiPath: omsi(), userData: userData() }
  })
  gemaakt.on('message', (antwoord: WerkerAntwoord) => {
    const wachtend = werkerWacht.get(antwoord.id)
    werkerWacht.delete(antwoord.id)
    wachtend?.klaar(antwoord)
  })
  gemaakt.on('error', (fout) => {
    logFout(`kaartwerker ${soort}`, fout)
    werkers.delete(soort)
    stuurWachtendenWeg(gemaakt, String(fout))
  })
  gemaakt.on('exit', (code) => {
    if (werkers.get(soort) === gemaakt) werkers.delete(soort)
    stuurWachtendenWeg(gemaakt, `werker ${soort} is gestopt (${code})`)
  })
  // De werker mag de app niet openhouden bij het afsluiten.
  gemaakt.unref()
  werkers.set(soort, gemaakt)
  return gemaakt
}

/** De werker van het voorwerk wegsturen; het hoofdproces houdt niets van hem. */
function sluitAchtergrondwerker(soort: Werksoort = 'achtergrond'): void {
  const staand = werkers.get(soort)
  if (!staand) return
  werkers.delete(soort)
  staand.terminate().catch(() => undefined)
}

async function werkerVraag<T>(
  opdracht: Record<string, unknown>,
  soort: Werksoort = 'voorgrond'
): Promise<T> {
  const id = (volgendeOpdracht += 1)
  const antwoord = await new Promise<WerkerAntwoord>((klaar) => {
    try {
      const werker = kaartWerker(soort)
      werkerWacht.set(id, { werker, klaar })
      werker.postMessage({ ...opdracht, id })
    } catch (fout) {
      werkerWacht.delete(id)
      klaar({ id, ok: false, ms: 0, fout: String(fout) })
    }
  })
  if (!antwoord.ok) throw new Error(antwoord.fout ?? 'de werker gaf geen antwoord')
  if (antwoord.ms >= TRAAG_MS)
    log(
      `werker ${String(opdracht.soort)}: ${antwoord.ms} ms` +
        (antwoord.detail ? ` (${antwoord.detail})` : '')
    )
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
async function zorgVoorKaart(folder: string, wie: Werksoort = 'voorgrond'): Promise<void> {
  if (laag().kaartStaatKlaar(folder)) return
  await werkerVraag<void>({ soort: 'kaart', folder }, wie)
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
    /*
     * Wat er echt nog ingelezen moet worden, en niet wat er nog langs moet.
     *
     * Hier stond `folders.length - klaar`: bij elke start liep de teller van 12
     * naar 0 terwijl alle kaarten al klaarstonden. Het scherm toont het
     * klaarzetten zolang er iets resteert, en dus flitste het bij elke start een
     * paar milliseconden in beeld -- en bouwde het wat eronder stond opnieuw op.
     * Luc zag het als een tabblad in de instellingen dat terugsprong en een
     * lijst die opnieuw laadde, 2,3 s na het starten (probe-remount.cjs).
     */
    const teLezen = new Set(folders.filter((folder) => !laag().kaartStaatKlaar(folder)))
    const melden = (bezig: string | undefined, klaar: number): void => {
      warmStand = { bezig, klaar, totaal: folders.length, resterend: teLezen.size }
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
          await zorgVoorKaart(folder, 'achtergrond')
        } catch {
          // Een kaart die niet te lezen is houdt de rest niet tegen.
        }
        await new Promise((verder) => setTimeout(verder, 150))
      }
      teLezen.delete(folder)
      klaar += 1
      melden(undefined, klaar)
    }
    log(`kaarten klaargezet: ${folders.length}`)
    sluitAchtergrondwerker()

    /*
     * En meteen de buslijst erbij, in de werker die straks de vragen krijgt.
     * Het doorlezen van Vehicles kost ruim anderhalve seconde koud; nu staat
     * die lijst er al voordat iemand bij de busstap komt. Dat gebeurt pas hier,
     * na het voorwerk, want anders zou hij in de rij staan voor de kaartenlijst
     * die het scherm bij het openen opvraagt.
     */
    void werkerVraag({ soort: 'voertuigen' }).catch(() => undefined)
  } catch (fout) {
    // Geen OMSI gevonden, of geen leesrechten: dan gewoon geen voorwerk.
    logFout('kaarten klaarzetten', fout)
  } finally {
    warmLoopt = false
  }
}

/**
 * Een opdracht voor één busfoto.
 *
 * Het lezen van het model gaat naar een werker; hier blijft alleen het tekenen
 * over. Welke werker hangt af van wie erom vraagt. Een tegel die in beeld komt
 * gaat voor, en valt als het moet terug op het hoofdproces -- beter een
 * hapering dan geen plaatje. De ronde die alles maakt krijgt een eigen werker,
 * zodat een klik van de speler er niet achter hoeft te wachten, en valt nooit
 * terug op het hoofdproces. Driehonderd bussen
 * lang een hapering is geen terugval meer maar een vastgelopen app.
 */
function busfotoOpdracht(
  relatiefPad: string,
  wie: Werksoort,
  kleurstelling?: string
): Parameters<typeof maakBusfoto>[0] {
  return {
    kleurstelling,
    tekenen: async (busPad, kleur) => {
      if (wie !== 'voorgrond') {
        try {
          return await werkerVraag<BusTekeningMetPlaten | undefined>(
            { soort: 'bustekening', busPad, kleurstelling: kleur },
            wie
          )
        } catch {
          /*
           * Nog één keer, bij een verse werker. De werker kan verdwijnen
           * terwijl hij leest -- het nakijken van de OMSI-map sluit ze
           * allemaal -- en dan komt er meteen een nieuwe voor in de plaats. Gaat het
           * dan weer mis, dan gooit dit, en krijgt de bus geen merkteken.
           */
          return await werkerVraag<BusTekeningMetPlaten | undefined>(
            { soort: 'bustekening', busPad, kleurstelling: kleur },
            wie
          )
        }
      }
      try {
        return await werkerVraag<BusTekeningMetPlaten | undefined>({
          soort: 'bustekening',
          busPad,
          kleurstelling: kleur
        })
      } catch (fout) {
        logFout('bustekening via de werker', fout)
        return laag().bustekening(busPad, kleur)
      }
    },
    busPad: join(omsi(), relatiefPad),
    omsiPad: omsi(),
    relatiefPad,
    userData: userData(),
    preload: join(__dirname, '../preload/busfoto.js'),
    pagina: process.env.ELECTRON_RENDERER_URL
      ? { url: `${process.env.ELECTRON_RENDERER_URL}/busfoto.html` }
      : { bestand: join(__dirname, '../renderer/busfoto.html') }
  }
}

/**
 * De ronde die van elke bus een foto maakt.
 *
 * WAAROM
 * Een foto kost de eerste keer 0,8 tot 1,4 seconde, en tot nu toe werd hij pas
 * gemaakt als de tegel in beeld kwam. Bij een merk met twintig uitvoeringen
 * stond je dan een halve minuut naar iconen te kijken die één voor één
 * veranderden. Luc: "een wizard met het laden van alle busplaatjes in één
 * keer", en een knop voor de bussen die later komen. Dit is die ene keer.
 *
 * Eén bus tegelijk, via dezelfde rij als de tegels: vraagt het scherm er
 * tussendoor een, dan wacht die op hooguit de bus die nu getekend wordt.
 */
let fotoRonde: { stoppen: boolean; begin: number } | undefined
let fotoStand: BusfotoStand = {
  loopt: false,
  klaar: 0,
  totaal: 0,
  resterend: 0,
  zonder: 0,
  gemaakt: 0,
  duur: 0,
  verwerkt: 0
}

function meldFotoStand(stand: BusfotoStand): void {
  fotoStand = stand
  for (const venster of BrowserWindow.getAllWindows()) {
    if (!venster.isDestroyed()) venster.webContents.send('busfotos:voortgang', stand)
  }
}

/**
 * Welke bussen er zijn, en hoe ver elk ervan is.
 *
 * De lijst komt van de werker van de foto's, niet van die van het scherm.
 * De vraag komt bij het opstarten, en het doorlezen van Vehicles kost koud ruim
 * anderhalve seconde: in de werker van het scherm stond hij dan in de rij voor
 * de kaartenlijst -- precies wat `warmKaarten` vermijdt door hem pas achteraf te
 * vragen. En een verse werker leest de map opnieuw, dus een bus die er net bij
 * kwam telt meteen mee.
 */
async function fotoTelling(): Promise<{ bussen: Vehicle[]; open: Vehicle[]; zonder: number }> {
  const vraag = (): Promise<Vehicle[]> => werkerVraag<Vehicle[]>({ soort: 'voertuigen' }, 'fotos')
  // Twee keer, om dezelfde reden als bij het tekenen: de werker kan net sluiten.
  const bussen = await vraag()
    .catch(vraag)
    .catch((fout) => {
      logFout('voertuigen voor de busfoto\'s', fout)
      return [] as Vehicle[]
    })
  const open: Vehicle[] = []
  let zonder = 0
  for (const bus of bussen) {
    const stand = busfotoAfgehandeld(userData(), bus.relativePath)
    if (stand === 'geen') zonder += 1
    else if (!stand) open.push(bus)
  }
  return { bussen, open, zonder }
}

async function busfotosStand(): Promise<BusfotoStand> {
  if (fotoRonde) return fotoStand
  try {
    const { bussen, open, zonder } = await fotoTelling()
    // Alleen geteld, niet getekend: dan hoeft de werker niet te blijven.
    if (!fotoRonde) sluitAchtergrondwerker('fotos')
    fotoStand = {
      loopt: false,
      klaar: bussen.length - open.length,
      totaal: bussen.length,
      resterend: open.length,
      zonder,
      gemaakt: 0,
      duur: 0,
      verwerkt: 0
    }
  } catch {
    // Geen OMSI: dan valt er ook niets te tekenen.
    fotoStand = {
      loopt: false,
      klaar: 0,
      totaal: 0,
      resterend: 0,
      zonder: 0,
      gemaakt: 0,
      duur: 0,
      verwerkt: 0
    }
  }
  return fotoStand
}

/** Hoe een bus heet in de balk: merk, type en kleurstelling. */
function fotoNaam(bus: Vehicle): string {
  return [bus.manufacturer, bus.type, bus.paint].filter(Boolean).join(' ') || bus.folder
}

async function maakAlleBusfotos(): Promise<void> {
  if (fotoRonde) return
  const ronde = { stoppen: false, begin: Date.now() }
  fotoRonde = ronde
  let gemaakt = 0
  let mislukt = 0
  let laatste: BusfotoStand['laatste']
  /* De telling van deze ronde; aan het eind is dat meteen de nieuwe stand. */
  let totaal = 0
  let klaar = 0
  let zonder = 0
  let alZonder = 0
  const stand = (loopt: boolean, bezig?: string): BusfotoStand => ({
    loopt,
    bezig,
    klaar,
    totaal,
    resterend: totaal - klaar,
    zonder,
    gemaakt,
    duur: Date.now() - ronde.begin,
    verwerkt: gemaakt + mislukt + zonder - alZonder,
    laatste
  })
  try {
    const telling = await fotoTelling()
    const open = telling.open
    totaal = telling.bussen.length
    klaar = totaal - open.length
    zonder = telling.zonder
    alZonder = telling.zonder
    const melden = (bezig: string | undefined): void => meldFotoStand(stand(true, bezig))
    melden(open[0] ? fotoNaam(open[0]) : undefined)

    for (const [nummer, bus] of open.entries()) {
      if (ronde.stoppen) break
      // Wat het scherm vraagt gaat voor; zie `voorgrondBezig`.
      while (voorgrondBezig > 0 && !ronde.stoppen) {
        await new Promise((verder) => setTimeout(verder, 300))
      }
      if (ronde.stoppen) break

      const bestand = await maakBusfoto(busfotoOpdracht(bus.relativePath, 'fotos')).catch(
        () => undefined
      )
      if (bestand) {
        gemaakt += 1
        klaar += 1
        laatste = { relativePath: bus.relativePath, adres: busfotoAdres(bestand), naam: fotoNaam(bus) }
      } else if (busfotoAfgehandeld(userData(), bus.relativePath) === 'geen') {
        zonder += 1
        klaar += 1
      } else {
        // Pech in de werker of het venster: telt niet als klaar; de volgende ronde probeert hem weer.
        mislukt += 1
      }
      /*
       * Meteen de naam van de volgende erbij. Eerst stond hier een lege
       * melding en pas bij het begin van de volgende bus zijn naam; dan
       * flitste het scherm bij elke bus even "bijna klaar".
       */
      const volgende = open[nummer + 1]
      melden(volgende && !ronde.stoppen ? fotoNaam(volgende) : undefined)
    }
    log(
      `busfoto's: ${gemaakt} gemaakt, ${zonder} zonder model, ${mislukt} mislukt, ` +
        `${totaal - klaar} nog open, ${Date.now() - ronde.begin} ms` +
        (ronde.stoppen ? ' (gestopt)' : '')
    )
  } catch (fout) {
    logFout('busfoto\'s maken', fout)
  } finally {
    fotoRonde = undefined
    // De werker houdt nu tweehonderd texturen vast; weg ermee.
    sluitAchtergrondwerker('fotos')
    meldFotoStand(stand(false))
  }
}

/**
 * De wacht over OMSI tijdens een lopende dienst.
 *
 * Luc: "laat de app detecteren wanneer omsi crasht zodat je direct opnieuw kan
 * launchen vanuit de dienst die je speelt". Elke tien tellen kijkt de app of
 * Omsi.exe er nog is (tasklist, goedkoop). Is het weg zonder dat logfile.txt op
 * "OMSI is closing..." eindigt, dan is het gecrasht. Is het er nog maar schrijft
 * de plugin niet meer terwijl hij dat eerder wel deed, dan vraagt de app aan
 * Windows of het venster nog reageert (core/omsiProces.ts, anderhalve seconde);
 * drie keer achter elkaar niet, dan is het vastgelopen. Tijdens het laden van
 * de kaart reageert OMSI soms ook minuten niet; daarom telt het pas als de
 * plugin al eens verse gegevens gaf.
 *
 * logfile.txt is tijdens het spelen niet te lezen -- OMSI houdt het dicht --
 * dus "Direct3D-Device lost!" zien we pas achteraf.
 */
let omsiMelding: OmsiMelding | undefined
/*
 * Welk proces de wacht bewaakt. Altijd Omsi, behalve in een proef: die zet een
 * eigen programma neer dat vastloopt, zodat er nooit aan het echte spel van de
 * speler gekomen wordt.
 */
const OMSI_PROCES = process.env.OMSI_ENHANCER_PROEFPROCES || 'Omsi'
const omsiWacht = {
  bezig: false,
  draaide: false,
  /** Sinds wanneer de app dit proces ziet; een ouder logboek hoort bij een vorige sessie. */
  gezienSinds: 0,
  /** Heeft de app het vastgelopen spel zelf afgesloten? Dan is het nooit "netjes". */
  doorOnsGesloten: false,
  versGezien: false,
  nietReagerend: 0,
  laatsteScan: 0,
  overlaysGemeld: false,
  vastGemeld: false,
  overlays: [] as OverlayInOmsi[]
}

function meldOverOmsi(melding: OmsiMelding): void {
  omsiMelding = melding
  log(
    `OMSI ${melding.soort === 'crash' ? 'gecrasht' : melding.soort === 'vast' ? 'vastgelopen' : 'overlays'}: ` +
      (melding.overlays.map((item) => item.soort).join(', ') || 'geen overlays bekend')
  )
  for (const venster of BrowserWindow.getAllWindows()) {
    if (!venster.isDestroyed()) venster.webContents.send('omsi:melding', melding)
  }
}

/** LosslessScaling en dergelijke: die haken niet in OMSI maar pakken het beeld van buitenaf. */
async function externeBeeldprogrammas(): Promise<string[]> {
  return new Promise((klaar) => {
    const kijk = spawn('tasklist', ['/FO', 'CSV', '/NH'], { windowsHide: true })
    let uit = ''
    kijk.stdout.on('data', (stuk) => {
      uit += String(stuk)
    })
    kijk.on('close', () => klaar(/"LosslessScaling\.exe"/i.test(uit) ? ['LosslessScaling'] : []))
    kijk.on('error', () => klaar([]))
  })
}

async function bewaakOmsi(): Promise<void> {
  if (omsiWacht.bezig) return
  const dienst = career?.activeDuty
  if (!dienst?.startedAt) {
    omsiWacht.draaide = false
    return
  }
  omsiWacht.bezig = true
  try {
    const draait = await isOmsiRunning(`${OMSI_PROCES}.exe`)
    if (!draait) {
      if (omsiWacht.draaide) {
        omsiWacht.draaide = false
        /*
         * Netjes afgesloten staat als "OMSI is closing..." achteraan logfile.txt.
         * Maar alleen als dat logboek van dit spel is: een ouder bestand hoort bij
         * een vorige keer. En wat de app zelf afsloot omdat het vastzat, was nooit
         * netjes.
         */
        const staart = leesLogfileStaart(omsi())
        const netjes =
          !omsiWacht.doorOnsGesloten &&
          staart?.netjesDicht === true &&
          staart.gewijzigd >= omsiWacht.gezienSinds - 5000
        if (netjes) log('OMSI tijdens de dienst netjes afgesloten')
        else meldOverOmsi({ soort: 'crash', tijd: new Date().toISOString(), overlays: omsiWacht.overlays })
      }
      return
    }
    if (!omsiWacht.draaide) {
      // Een nieuw OMSI: alles van de vorige keer vergeten.
      Object.assign(omsiWacht, {
        draaide: true,
        gezienSinds: Date.now(),
        doorOnsGesloten: false,
        versGezien: false,
        nietReagerend: 0,
        laatsteScan: 0,
        overlaysGemeld: false,
        vastGemeld: false,
        overlays: []
      })
    }

    const live = readLive()
    const vers = Boolean(live?.alive && (live.ageMs ?? Infinity) < 15000)
    if (vers) omsiWacht.versGezien = true
    const stilGevallen = omsiWacht.versGezien && !vers
    const eersteScan = vers && omsiWacht.laatsteScan === 0
    const hoogTijd = omsiWacht.versGezien && Date.now() - omsiWacht.laatsteScan > 90000
    if (!stilGevallen && !eersteScan && !hoogTijd) {
      omsiWacht.nietReagerend = 0
      return
    }

    const proces = await leesOmsiProces(OMSI_PROCES)
    omsiWacht.laatsteScan = Date.now()
    if (!proces) return
    omsiWacht.overlays = herkenOverlays(proces.modules, omsi())

    if (!omsiWacht.overlaysGemeld) {
      omsiWacht.overlaysGemeld = true
      log(`in OMSI: ${omsiWacht.overlays.map((item) => item.soort).join(', ') || 'geen overlays'}`)
      const keuze = readSettings(userData()).overlayWaarschuwing ?? {}
      const standaard: Record<string, boolean> = { discord: true, nvidia: true, rtss: true, obs: true }
      const ongewenst = omsiWacht.overlays.filter(
        (item) => (keuze as Record<string, boolean | undefined>)[item.soort] ?? standaard[item.soort] ?? false
      )
      if (ongewenst.length > 0) {
        meldOverOmsi({ soort: 'overlays', tijd: new Date().toISOString(), overlays: ongewenst })
      }
    }

    if (proces.reageert || !stilGevallen) {
      omsiWacht.nietReagerend = 0
      return
    }
    omsiWacht.nietReagerend += 1
    if (omsiWacht.nietReagerend >= 3 && !omsiWacht.vastGemeld) {
      omsiWacht.vastGemeld = true
      meldOverOmsi({
        soort: 'vast',
        tijd: new Date().toISOString(),
        pid: proces.pid,
        overlays: omsiWacht.overlays
      })
    }
  } catch (fout) {
    logFout('OMSI bewaken', fout)
  } finally {
    omsiWacht.bezig = false
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
/*
 * De klok voor wie op een telefoon of tablet meekijkt. De overlay heeft zijn
 * eigen klok die met het venster komt en gaat; deze loopt zolang er gedeeld
 * wordt, zodat het toestel ook werkt met de overlay dicht.
 */
let apparaatTimer: NodeJS.Timeout | undefined
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
  if (!start) {
    // Net na een herstart, voor de nieuwe nulmeting: dan telt alleen wat er al was.
    const eerder = career?.activeDuty?.eerder
    return {
      drivenKm: eerder?.km ?? 0,
      elapsedMinutes: eerder?.minuten ?? 0,
      harshBrakes: eerder?.harshBrakes,
      harshAccels: eerder?.harshAccels,
      collisions: eerder?.collisions,
      dutyComplete: false,
      finished: true
    }
  }

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

  /*
   * Wat er voor een herstart van OMSI al gereden was, telt mee; zie
   * `ActiveDuty.eerder`. Zonder herstart is dat alles nul.
   */
  const eerder = career?.activeDuty?.eerder
  const ditDeel = gereden(live.km + live.metres / 1000 - start.odometerKm, elapsed)
  const minuten = elapsed >= 0 ? elapsed : elapsed + 1440
  return {
    stopsDone,
    drivenKm: eerder
      ? Math.round(((ditDeel ?? 0) + eerder.km) * 100) / 100
      : ditDeel,
    elapsedMinutes: minuten + (eerder?.minuten ?? 0),
    delayMinutes: status.delayMinutes,
    harshBrakes:
      status.harshBrakes !== undefined ? status.harshBrakes + (eerder?.harshBrakes ?? 0) : undefined,
    harshAccels:
      status.harshAccels !== undefined ? status.harshAccels + (eerder?.harshAccels ?? 0) : undefined,
    topSpeed: live.topSpeed,
    tickets: status.tickets,
    collisions:
      status.collisions !== undefined ? status.collisions + (eerder?.collisions ?? 0) : eerder?.collisions,
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

/**
 * Het logboek van de plugin overnemen in dat van de app.
 *
 * Wie een probleem meldt, stuurt het logboek van de app. Wat de plugin in OMSI
 * zag -- geladen, gestart, gegevens, schrijffouten -- stond tot nu toe nergens,
 * en daardoor viel op 21-09 niet meer na te gaan waarom live.json bleef staan.
 * Eén keer per versie van het bestand, zodat het niet bij elke start herhaald
 * wordt.
 */
let pluginLogGemeld = 0

function meldPluginLogboek(aanleiding: string): void {
  const boek = pluginLogboek()
  if (!boek || boek.tijd === pluginLogGemeld) return
  pluginLogGemeld = boek.tijd
  log(`plugin-logboek (${aanleiding}), ${new Date(boek.tijd).toLocaleString('nl-NL')}:`)
  for (const regel of boek.regels) log(`  plugin ${regel}`)
}

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
  if (netAf) meldPluginLogboek('OMSI is net afgesloten')
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

/**
 * Draait OMSI al, ook al geeft de plugin nog niets door?
 *
 * De plugin schrijft pas als OMSI hem de eerste waarden geeft, en dat is als
 * de kaart geladen is. Op 21-09 laadde OMSI de plugin om 21:33:20 en kwam het
 * eerste live.json om 21:36:48: drie en een halve minuut waarin de overlay
 * "Wacht op OMSI" zei terwijl OMSI al lang openstond -- en dat las als "de app
 * ziet OMSI niet". In die tijd zegt de overlay nu dat de kaart laadt.
 *
 * Het kijken is `tasklist` (89 ms), dus niet bij elk beeld: hooguit om de vijf
 * seconden, en alleen zolang er geen verse gegevens zijn.
 */
let omsiLaadt = false
let omsiLaadtGekeken = 0

function laadtOmsi(verbonden: boolean): boolean {
  if (verbonden) {
    omsiLaadt = false
    return false
  }
  const nu = Date.now()
  if (nu - omsiLaadtGekeken >= 5000) {
    omsiLaadtGekeken = nu
    void isOmsiRunning(`${OMSI_PROCES}.exe`).then((draait) => {
      omsiLaadt = draait
    })
  }
  return omsiLaadt
}

/**
 * De kaartset van een kaart, eenmaal gelezen.
 *
 * `pushFrame` loopt tien keer per seconde; een bestand openen hoort daar niet
 * bij. De set verandert niet zolang je op dezelfde kaart rijdt.
 */
const kaartsetCache = new Map<string, ReturnType<typeof kaartjesVoor>>()
function kaartsetVoorOverlay(mapFolder: string | undefined): Kaartset | undefined {
  if (!mapFolder) return undefined
  if (!kaartsetCache.has(mapFolder)) {
    let gevonden: Kaartset | undefined
    try {
      gevonden = kaartjesVoor(omsi(), mapFolder)
    } catch {
      // Een kaart zonder kaartverkoop is geen fout; dan blijft de app leeg.
    }
    kaartsetCache.set(mapFolder, gevonden)
  }
  return kaartsetCache.get(mapFolder)
}

/*
 * DE STAND VAN DE TELEFOON
 *
 * Aanmelden, tekenen, pauze en "IBIS ingevoerd" stonden in het overlayvenster.
 * Dat kan niet meer: dezelfde telefoon staat nu ook op een echte telefoon of
 * tablet, en wie zich daar aanmeldt hoort in de overlay aangemeld te zijn. Dus
 * staat de stand hier, gaat hij mee in elk beeld, en veranderen de vensters hem
 * via het hoofdproces.
 *
 * Het nakijken van nummer en pincode gebeurt ook hier. Daardoor hoeft de
 * pincode niet mee in het beeld dat een toestel op het netwerk krijgt -- alleen
 * hoeveel cijfers hij telt, zodat het cijferblok zijn vakjes kan tekenen.
 */
let telefoon: TelefoonStand & { sleutel: string } = { ...LEGE_TELEFOON, sleutel: '' }
/*
 * Hoeveel vrije ritten er deze sessie gestart zijn.
 *
 * Een vrije rit wordt niet in het profiel vastgelegd, dus er is niets dat de
 * ene van de andere onderscheidt: dezelfde kaart, dezelfde omloop, dezelfde
 * vertrektijd. Zonder deze teller kwam een tweede vrije rit op dezelfde lijn al
 * aangemeld op, omdat hij op de vorige leek.
 */
let vrijeRitten = 0
/** Verkeerde pogingen achter elkaar, en sinds wanneer; zie `telefoonAanmelden`. */
let misTellen = 0
let misSinds = 0

function telefoonPad(): string {
  return join(userData(), 'telefoon.json')
}

/**
 * Voor welke dienst de aanmelding geldt.
 *
 * Bij een aangenomen dienst: de chauffeur, de dienst en het moment waarop hij
 * is aangenomen -- wie dezelfde omloop een dag later opnieuw aanneemt, begint
 * weer met aanmelden. Bij vrij rijden telt de teller mee, zodat elke vrije rit
 * zijn eigen aanmelding heeft.
 */
function telefoonSleutel(): string {
  const duty = currentDuty()
  if (!duty) return ''
  const aangenomen = (career?.activeDuty?.assignment as Assignment | undefined)?.duty
  const zelfde = aangenomen && aanmeldSleutelVan(aangenomen) === aanmeldSleutelVan(duty)
  return zelfde
    ? `${career?.id ?? ''}|${aanmeldSleutelVan(duty)}|${career?.activeDuty?.confirmedAt ?? ''}`
    : `vrij${vrijeRitten}|${aanmeldSleutelVan(duty)}`
}

/*
 * De stand die bij deze dienst hoort. Een aangenomen dienst haalt hem van
 * schijf: de app kan midden in een dienst herstarten, en dan hoor je niet
 * opnieuw te moeten tekenen. Een vrije rit staat nergens vast.
 */
function telefoonVoor(sleutel: string): TelefoonStand & { sleutel: string } {
  const leeg = { ...LEGE_TELEFOON, sleutel }
  if (!sleutel || sleutel.startsWith('vrij')) return leeg
  try {
    const bewaard = JSON.parse(readFileSync(telefoonPad(), 'utf8')) as {
      sleutel?: string
      aangemeld?: boolean
      aanvaard?: boolean
    }
    if (bewaard?.sleutel !== sleutel) return leeg
    return { ...leeg, aangemeld: bewaard.aangemeld === true, aanvaard: bewaard.aanvaard === true }
  } catch {
    return leeg
  }
}

function bewaarTelefoon(): void {
  if (!telefoon.sleutel || telefoon.sleutel.startsWith('vrij')) return
  try {
    writeFileSync(
      telefoonPad(),
      JSON.stringify({
        sleutel: telefoon.sleutel,
        aangemeld: telefoon.aangemeld,
        aanvaard: telefoon.aanvaard
      })
    )
  } catch {
    // Lukt bewaren niet, dan meld je je na een herstart opnieuw aan.
  }
}

/** De stand voor in het beeld; een andere dienst begint met een lege stand. */
function telefoonBeeld(): TelefoonStand {
  const sleutel = telefoonSleutel()
  if (sleutel !== telefoon.sleutel) telefoon = telefoonVoor(sleutel)
  return {
    aangemeld: telefoon.aangemeld,
    aanvaard: telefoon.aanvaard,
    pauzeVanaf: telefoon.pauzeVanaf,
    ibisReady: telefoon.ibisReady,
    nummerLengte: career?.personeelsnummer?.length ?? 0,
    pinLengte: career?.pincode?.length ?? 0
  }
}

/** Wat er op de telefoon gebeurt, hoort meteen in de overlay en op het toestel te staan. */
function telefoonGewijzigd(): void {
  bewaarTelefoon()
  lastFrame = undefined
  pushFrame()
}

/**
 * Nummer en pincode nakijken.
 *
 * Zonder pincode gaat het alleen om het nummer; dat is de eerste stap op het
 * cijferblok. Tien misslagen in een minuut en het antwoord blijft even "fout":
 * een pincode van vier cijfers is over het netwerk anders zo geraden, en dit
 * kost een chauffeur die zich vertikt niets.
 */
function telefoonAanmelden(nummer: string, pin?: string): AanmeldUitslag {
  telefoonBeeld()
  const nu = Date.now()
  if (nu - misSinds > 60000) {
    misSinds = nu
    misTellen = 0
  }
  if (misTellen >= 10) return 'fout'
  if (!career?.personeelsnummer || nummer !== career.personeelsnummer) {
    misTellen += 1
    return 'fout'
  }
  if (pin === undefined) return 'nummer'
  if (!career.pincode || pin !== career.pincode) {
    misTellen += 1
    return 'fout'
  }
  misTellen = 0
  telefoon.aangemeld = true
  telefoonGewijzigd()
  return 'aangemeld'
}

function pushFrame(): void {
  /*
   * Beelden maken heeft zin zolang er iemand kijkt. Dat is de overlay, maar ook
   * een telefoon of tablet: wie de overlay dichtdoet en alleen zijn iPad
   * gebruikt, hoort daar geen stilstaande kaart te krijgen.
   */
  const overlayOpen = Boolean(overlayWindow && !overlayWindow.isDestroyed())
  if (!overlayOpen && !apparaatKijkt()) return
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
    laadt: laadtOmsi(Boolean(live?.alive)),
    status: live ? describeLive(live, duty, baseline()) : undefined,
    vehicle: vehicleOnMap(live, duty),
    duty,
    ibis: overlayIbis,
    /*
     * De kaartjes van deze kaart gaan mee in het beeld. Ze veranderen niet
     * tijdens een dienst, maar de overlay heeft geen eigen brug naar het
     * hoofdproces -- hij krijgt alleen beelden toegestuurd. Het kost niets: het
     * beeld wordt pas verstuurd als er iets aan verandert, en een kaartset is
     * een handvol regels.
     */
    kaartjes: kaartsetVoorOverlay(duty?.mapFolder),
    /*
     * Wie er rijdt, met zijn personeelsnummer en pincode. Die gaan mee zodat de
     * telefoon de aanmelding zelf kan nakijken zonder het hoofdproces erbij te
     * halen; er valt hier niets af te schermen, zie core/career.ts.
     */
    chauffeur: career
      ? {
          naam: career.driver,
          personeelsnummer: career.personeelsnummer,
          pincode: career.pincode
        }
      : undefined,
    // Aanmelden, tekenen, pauze en IBIS; zie "DE STAND VAN DE TELEFOON".
    telefoon: telefoonBeeld(),
    editing: overlayEditing
  }

  const signature = JSON.stringify(frame)
  if (signature === lastFrame) return
  lastFrame = signature
  if (overlayOpen) overlayWindow?.webContents.send('overlay:frame', frame)
  apparaatBeeld(frameVoorApparaat(frame))
}

/**
 * Wat een telefoon of tablet van het beeld krijgt: alleen wat de navigatie
 * nodig heeft.
 *
 * Niet het personeelsnummer en de pincode. Die staan in het beeld voor de
 * overlay, die op deze pc draait; de webpagina is te openen door iedereen die
 * het adres heeft, en dat adres is een QR-code die op een scherm heeft gestaan.
 */
function frameVoorApparaat(frame: {
  connected: boolean
  laadt: boolean
  status?: unknown
  vehicle?: unknown
  duty?: unknown
  ibis?: unknown
  kaartjes?: unknown
  telefoon: TelefoonStand
}): unknown {
  return {
    connected: frame.connected,
    laadt: frame.laadt,
    status: frame.status,
    vehicle: frame.vehicle,
    duty: frame.duty,
    ibis: frame.ibis,
    kaartjes: frame.kaartjes,
    telefoon: frame.telefoon
  }
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
  // Zonder overlay komen er geen beelden meer; de telefoon toont dan geen oude dienst.
  apparaatBeeld({ connected: false })
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
/**
 * De scriptvariabelen voor een gekozen kleurstelling: het nummer en de
 * [setvar]-waarden, zoals OMSI's eigen keuzevenster ze zet. Op naam gezocht,
 * zodat een aanhanger zijn eigen nummer voor dezelfde kleurstelling krijgt; kent
 * hij de naam niet, dan blijft hij in zijn eigen kleuren. Leest alleen de
 * .cti-bestanden van deze ene bus -- een kwestie van milliseconden.
 */
function kleurVars(
  relatiefPad: string,
  kleurstelling: string | undefined
): Array<[string, number]> | undefined {
  if (!kleurstelling) return undefined
  try {
    const info = kleurstellingenVanBus(join(omsi(), relatiefPad))
    const gekozen = info?.lijst.find((item) => item.naam === kleurstelling)
    if (!info || !gekozen) {
      log(`kleurstelling "${kleurstelling}" niet gevonden bij ${relatiefPad}`)
      return undefined
    }
    log(`kleurstelling "${kleurstelling}" = ${info.variabele} ${gekozen.index} bij ${relatiefPad}`)
    return [[info.variabele, gekozen.index], ...Object.entries(gekozen.setvars)]
  } catch (fout) {
    logFout('kleurstelling lezen', fout)
    return undefined
  }
}

/** De aanhanger van een gelede bus, in dezelfde kleurstelling. */
function aanhangerVan(
  vehiclePath: string,
  kleurstelling: string | undefined
): (NonNullable<ReturnType<typeof trailerOf>> & { vars?: Array<[string, number]> }) | undefined {
  const aanhanger = trailerOf(omsi(), vehiclePath)
  return aanhanger ? { ...aanhanger, vars: kleurVars(aanhanger.relativePath, kleurstelling) } : aanhanger
}

function prepareSituation(
  duty: Duty,
  vehiclePath: string | undefined,
  date: DutyDate | undefined,
  lineNumber: string,
  terminus: string,
  yard?: string,
  kleurstelling?: string
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
          vars: kleurVars(vehiclePath, kleurstelling),
          // Een gelede bus is twee voertuigen; zonder dit begin je met een halve.
          trailer: aanhangerVan(vehiclePath, kleurstelling)
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

/**
 * Halteposities van een kaart. Het doorlezen van de tegels kost een fractie
 * van een seconde tot ruim een seconde, dus eenmaal per kaart.
 */
async function geometrieVoor(folder: string): Promise<MapGeometry> {
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
}

/**
 * De route van elke rit van een dienst, als lijn over de kaart.
 *
 * Dit gaat naar de werker: het rijstrokennet van een kaart opbouwen kost tot
 * een seconde, en dat gebeurt precies op het moment dat de speler een dienst
 * aanwijst.
 */
async function routesVoor(
  folder: string,
  legs: Array<{ tripFile: string; stopIds: string[] }>
): Promise<TripRoute[]> {
  try {
    return await werkerVraag<TripRoute[]>({ soort: 'routes', folder, legs })
  } catch (fout) {
    logFout('routes via de werker', fout)
    return laag().routes(folder, legs)
  }
}

/**
 * Wat de webserver voor telefoon en tablet van de app mag weten.
 *
 * De kaart en de routes zijn altijd die van de dienst in de overlay. De
 * telefoon vraagt er niet om met een naam of een pad, zodat niemand op het
 * netwerk de server een ander bestand kan laten lezen.
 */
function apparaatBronnen(): ApparaatBronnen {
  const paginas = join(__dirname, '../renderer')
  return {
    paginas,
    icoon: zoekApparaatIcoon(paginas),
    start: () => {
      const instellingen = readSettings(userData())
      return { taal: instellingen.language, animaties: instellingen.animaties, versie: __APP_VERSION__ }
    },
    geometrie: async () => {
      const kaart = currentDuty()?.mapFolder
      return kaart ? geometrieVoor(kaart) : undefined
    },
    routes: async () => {
      const dienst = currentDuty()
      if (!dienst) return undefined
      return routesVoor(
        dienst.mapFolder,
        dienst.legs.map(({ tripFile, stopIds }) => ({ tripFile, stopIds }))
      )
    },
    /*
     * Wat er op de telefoon van het toestel gebeurt. Dezelfde wegen als de
     * overlay gebruikt; het toestel krijgt er niets bij dat de overlay niet ook
     * mag, en het nakijken van nummer en pincode gebeurt hier.
     */
    telefoon: (opdracht: TelefoonOpdracht) => {
      telefoonBeeld()
      switch (opdracht.wat) {
        case 'aanmelden':
          return {
            uitslag: telefoonAanmelden(
              String(opdracht.nummer ?? ''),
              opdracht.pin === undefined ? undefined : String(opdracht.pin)
            )
          }
        case 'overslaan':
          if (career?.personeelsnummer && career?.pincode) return { ok: false }
          telefoon.aangemeld = true
          telefoonGewijzigd()
          return { ok: true }
        case 'aanvaard':
          telefoon.aanvaard = true
          telefoonGewijzigd()
          return { ok: true }
        case 'pauze':
          telefoon.pauzeVanaf =
            typeof opdracht.vanaf === 'number' && Number.isFinite(opdracht.vanaf)
              ? opdracht.vanaf
              : undefined
          telefoonGewijzigd()
          return { ok: true }
        case 'ibis':
          telefoon.ibisReady = String(opdracht.tripKey ?? '')
          telefoonGewijzigd()
          return { ok: true }
      }
    },
    log
  }
}

/** Het icoon dat vite bij het bouwen een naam met een vingerafdruk gaf. */
function zoekApparaatIcoon(paginas: string): string | undefined {
  try {
    const naam = readdirSync(join(paginas, 'assets')).find((bestand) =>
      /^apparaat-icoon-[\w-]+\.png$/.test(bestand)
    )
    return naam ? join(paginas, 'assets', naam) : undefined
  } catch {
    return undefined
  }
}

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
  /*
   * Het logboek in de verkenner tonen.
   *
   * Zonder deze knop staat het bestand er wel, maar weet niemand waar: bij een
   * melding is "stuur het logboek mee" dan een zoektocht door AppData. Nu opent
   * de map met het bestand aangewezen.
   */
  /*
   * De pagina mag ook iets in het logboek zetten.
   *
   * Waarom: het haperen van de kaart is hier niet na te maken -- op deze
   * machine haalt hij 144 beelden per seconde, ook op de zwaarste kaart. Wat
   * traag is, is de machine van de speler, en die spreekt alleen via zijn
   * logboek. Dus meet de tekening zichzelf en meldt het hier, één keer per
   * kaart, en alleen als het werkelijk hapert.
   */
  /*
   * Een foto van een bus. De eerste keer wordt hij getekend -- lezen en tekenen
   * kostte gemeten 266 tot 1092 ms per bus -- daarna komt hij van schijf.
   */
  handle(
    'bus:foto',
    async (_event, relatiefPad: string, kleurstelling?: string): Promise<string | undefined> => {
      const bestand = await maakBusfoto(
        busfotoOpdracht(relatiefPad, 'voorgrond', kleurstelling || undefined)
      )
      return bestand ? busfotoAdres(bestand) : undefined
    }
  )

  /* De lijst uit "Appearance"; het lezen van de .cti-bestanden gaat naar de werker. */
  handle(
    'bus:kleurstellingen',
    async (_event, relatiefPad: string): Promise<BusKleurstellingen | undefined> => {
      try {
        return await werkerVraag<BusKleurstellingen | undefined>({
          soort: 'kleurstellingen',
          busPad: join(omsi(), relatiefPad)
        })
      } catch (fout) {
        logFout('kleurstellingen via de werker', fout)
        return laag().kleurstellingen(join(omsi(), relatiefPad))
      }
    }
  )

  handle('busfotos:stand', (): Promise<BusfotoStand> => busfotosStand())

  handle('busfotos:maken', async (): Promise<BusfotoStand> => {
    if (!fotoRonde) {
      void maakAlleBusfotos()
      // De eerste melding van de ronde komt na het tellen; die wachten we niet af.
    }
    return { ...fotoStand, loopt: true }
  })

  handle('busfotos:stoppen', (): BusfotoStand => {
    if (fotoRonde) fotoRonde.stoppen = true
    return fotoStand
  })

  handle('logboek:melden', (_event, regel: string) => {
    log(`pagina: ${String(regel).slice(0, 300)}`)
  })

  handle('logboek:openen', (): string | undefined => {
    const bestand = logboekPad()
    if (bestand) shell.showItemInFolder(bestand)
    return bestand
  })

  handle('kaarten:stand', (): KaartenStand => kaartenStand())

  handle('kaarten:voorbereiden', (): KaartenStand => {
    void warmKaarten()
    return kaartenStand()
  })

  /* Het doorlezen van Vehicles kostte 199 ms in het hoofdproces; nu in de werker. */
  handle('omsi:vehicles', async (): Promise<Vehicle[]> => {
    try {
      return await werkerVraag<Vehicle[]>({ soort: 'voertuigen' })
    } catch (fout) {
      logFout('voertuigen via de werker', fout)
      return laag().voertuigen()
    }
  })

  /*
   * Welke bus de app op deze kaart zou nemen als er geen dienst is.
   *
   * Bij dienst en carriere komt de aanbeveling uit de dienst zelf: welke bus
   * kent de eindbestemmingen die je gaat rijden. Vrij rijden heeft geen dienst,
   * en daar is de vraag dus eenvoudiger -- welke bus rijdt hier het meest rond.
   * Dat weet de kaart zelf, in haar remiselijst.
   */
  handle('fleet:suggest', async (_event, mapFolder: string): Promise<Vehicle | undefined> => {
    // De eerste keer bouwt dit het hele wagenpark op; dat hoort niet hier.
    try {
      return await werkerVraag<Vehicle | undefined>({ soort: 'busvoorstel', folder: mapFolder })
    } catch (fout) {
      logFout('busvoorstel via de werker', fout)
      return laag().busvoorstel(mapFolder)
    }
  })

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
  handle('omsi:check', async (): Promise<InstalledCheck> => {
    vergeetKaarten()
    vehicleTrackers.clear()

    /*
     * Ook dit hoort bij de werker. Het hoofdproces las hier van elke kaart de
     * hele dienstregeling in -- voor een naam en een aantal omlopen -- en lag
     * ondertussen stil; bij een speler met zesenveertig kaarten op een tweede
     * schijf duurde dat een halve minuut. `vergeetKaarten()` hierboven sluit de
     * werkers, dus wat hierna komt is opnieuw gelezen: dat is de hele bedoeling
     * van deze knop.
     */
    const [maps, vehicles] = await Promise.all([
      werkerVraag<MapSummary[]>({ soort: 'overzicht' }).catch((fout) => {
        logFout('kaartenlijst via de werker', fout)
        return laag().overzicht()
      }),
      werkerVraag<Vehicle[]>({ soort: 'voertuigen' }).catch((fout) => {
        logFout('voertuigen via de werker', fout)
        return laag().voertuigen()
      })
    ])
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
  handle('map:geometry', (_event, folder: string): Promise<MapGeometry> => geometrieVoor(folder))

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
    (_event, folder: string, legs: Array<{ tripFile: string; stopIds: string[] }>): Promise<TripRoute[]> =>
      routesVoor(folder, legs)
  )

  /*
   * De navigatie op een telefoon of tablet; zie main/apparaat.ts.
   *
   * De sleutel en de poort worden bewaard, zodat een bladwijzer of een icoon op
   * het beginscherm van de telefoon na een herstart van de app nog werkt.
   */
  handle('telefoon:aanmelden', (_event, nummer: string, pin?: string) =>
    telefoonAanmelden(String(nummer ?? ''), pin === undefined ? undefined : String(pin))
  )
  /* Alleen zinnig als er geen nummer en pincode zijn; anders meld je je gewoon aan. */
  handle('telefoon:overslaan', () => {
    telefoonBeeld()
    if (career?.personeelsnummer && career?.pincode) return
    telefoon.aangemeld = true
    telefoonGewijzigd()
  })
  handle('telefoon:aanvaard', () => {
    telefoonBeeld()
    telefoon.aanvaard = true
    telefoonGewijzigd()
  })
  handle('telefoon:pauze', (_event, vanaf?: number) => {
    telefoonBeeld()
    telefoon.pauzeVanaf = typeof vanaf === 'number' && Number.isFinite(vanaf) ? vanaf : undefined
    telefoonGewijzigd()
  })
  handle('telefoon:ibis', (_event, tripKey: string) => {
    telefoonBeeld()
    telefoon.ibisReady = String(tripKey ?? '')
    telefoonGewijzigd()
  })

  handle('apparaat:start', async () => {
    const nu = readSettings(userData())
    const sleutel = nu.apparaatSleutel ?? nieuweSleutel()
    const { poort, ...stand } = await startApparaat({ sleutel, poort: nu.apparaatPoort }, apparaatBronnen())
    if (stand.aan && (sleutel !== nu.apparaatSleutel || poort !== nu.apparaatPoort)) {
      writeSettings(userData(), { apparaatSleutel: sleutel, apparaatPoort: poort })
    }
    if (stand.fout) log(`apparaat: starten mislukt: ${stand.fout}`)
    if (stand.aan && !apparaatTimer) {
      apparaatTimer = setInterval(pushFrame, OVERLAY_RATES[readSettings(userData()).overlayRate])
    }
    // Meteen een beeld, anders ziet een telefoon die nu scant pas iets als er iets verandert.
    lastFrame = undefined
    pushFrame()
    return stand
  })
  handle('apparaat:stop', () => {
    stopApparaat()
    if (apparaatTimer) clearInterval(apparaatTimer)
    apparaatTimer = undefined
    return apparaatStand()
  })
  handle('apparaat:stand', () => apparaatStand())
  handle('apparaat:nieuw', async () => {
    writeSettings(userData(), { apparaatSleutel: nieuweSleutel() })
    stopApparaat()
    const nu = readSettings(userData())
    const { poort: _poort, ...stand } = await startApparaat(
      { sleutel: nu.apparaatSleutel ?? nieuweSleutel(), poort: nu.apparaatPoort },
      apparaatBronnen()
    )
    lastFrame = undefined
    pushFrame()
    return stand
  })

  /*
   * De instellingen en de toetsen van OMSI zelf.
   *
   * OMSI schrijft `options.cfg` en `Inputs\\keyboard.cfg` bij het afsluiten
   * opnieuw. Draait het spel, dan is alles wat hier verandert straks weg, dus
   * dat melden we erbij in plaats van het stilletjes te laten gebeuren.
   */
  /*
   * De twee overlays die de app zelf kan omzetten.
   *
   * Dit schrijft in bestanden van andere programma's -- Steams localconfig.vdf
   * en het register -- en dat doet de app verder nergens. Daarom zit alles wat
   * daarover te zeggen valt in core/overlayknop.ts, inclusief waarom het bij
   * deze twee blijft.
   */
  handle('overlay:knoppen', (): OverlayKnoppen => leesKnoppen())
  handle(
    'overlay:zet',
    (_gebeurtenis, welke: Schakelbaar, aan: boolean): OverlayUitkomst => zetKnop(welke, aan)
  )

  /* Wat er nu in OMSI hangt; voor het tabblad Overlays in de instellingen. */
  handle('omsi:overlays', async (): Promise<OmsiOverlays> => {
    const proces = await leesOmsiProces(OMSI_PROCES)
    const extern = (await externeBeeldprogrammas()).filter(Boolean)
    if (!proces) return { draait: false, overlays: [], extern }
    return {
      draait: true,
      reageert: proces.reageert,
      overlays: herkenOverlays(proces.modules, omsi()),
      extern
    }
  })

  handle('omsi:melding', (): OmsiMelding | undefined => omsiMelding)
  handle('omsi:melding:weg', () => {
    omsiMelding = undefined
  })

  /* Alleen op verzoek van de speler, met het pid uit de melding over de vastloper. */
  handle('omsi:sluiten', async (_event, pid: number): Promise<boolean> => {
    if (!omsiMelding || omsiMelding.soort !== 'vast' || omsiMelding.pid !== pid) return false
    log(`vastgelopen OMSI (pid ${pid}) afgesloten op verzoek van de speler`)
    omsiWacht.doorOnsGesloten = true
    return sluitOmsi(pid)
  })

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
  handle('plugin:status', async () => {
    if (!pluginStatus) {
      pluginStatus = ensurePlugin(
        omsi(),
        pluginSourceDir(process.resourcesPath, app.isPackaged),
        app.isPackaged ? undefined : join(process.cwd(), 'plugin'),
        await isOmsiRunning().catch(() => undefined)
      )
      if (pluginStatus.error) log(`plugin installeren: ${pluginStatus.error}`)
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
  /*
   * De wagenparkvraag kostte 581 ms in het hoofdproces, bij het openen van de
   * busstap. Het lezen van 448 .hof-bestanden hoort niet in de weg te lopen.
   */
  handle('hof:offers', async (_event, mapFolder: string): Promise<HofOffer[]> => {
    try {
      return await werkerVraag<HofOffer[]>({ soort: 'hofaanbod', folder: mapFolder })
    } catch (fout) {
      logFout('wagenparkaanbod via de werker', fout)
      return laag().hofAanbod(mapFolder)
    }
  })


  /*
   * Deze vraag komt bij elke bus die je in het busmenu aanwijst. Hij stond in
   * het hoofdproces en rekende zijn eigen plan uit zonder de bewaarde lijst
   * wagenparkbestanden, dus las hij elke keer alle .hof van schijf: in het
   * logboek van een speler 18990 ms, en zolang stond de hele app stil. Nu doet
   * de werker het, uit hetzelfde plan als de lijst.
   */
  handle(
    'hof:offerFor',
    async (_event, mapFolder: string, folder: string): Promise<HofOffer | undefined> => {
      try {
        return await werkerVraag<HofOffer | undefined>({
          soort: 'hofaanbodvoor',
          folder: mapFolder,
          busmap: folder
        })
      } catch (fout) {
        logFout('wagenparkaanbod via de werker', fout)
        return laag().hofAanbodVoor(mapFolder, folder)
      }
    }
  )

  /*
   * Valt er voor déze dienst iets te halen bij deze bus?
   *
   * `hof:offerFor` kijkt naar alle bestemmingen van de kaart, en dat is een
   * andere vraag: een bus kan veertig van de honderdnegenenvijftig
   * bestemmingen van Ahlheim kennen en geen van de twee die op jouw dienst
   * staan. Op het remisescherm gaat het over die twee, en daar hoorde de tegel
   * "wagenpark erbij halen" dus ook bij te horen -- hij bleef weg terwijl er
   * "0 van 2 bestemmingen" stond.
   */
  handle(
    'hof:offerForDuty',
    async (_event, duty: Duty, folder: string): Promise<HofOffer | undefined> => {
      const termini = [...new Set(duty.legs.map((leg: DutyLeg) => leg.terminus).filter(Boolean))]
      if (termini.length === 0) return undefined
      try {
        return await werkerVraag<HofOffer | undefined>({
          soort: 'hofaanbodrit',
          termini,
          busmap: folder
        })
      } catch (fout) {
        logFout('wagenpark voor deze dienst via de werker', fout)
        return laag().hofAanbodVoorRit(termini, folder)
      }
    }
  )

  /*
   * Het beste wagenpark voor deze dienst, ook als het niet beter is dan wat de
   * bus al heeft -- en het neerleggen ervan.
   *
   * Twee handelingen, en met opzet gescheiden: eerst kijken, dan pas schrijven.
   * Dit is de enige plek waar de app iets in de voertuigmappen van OMSI zet.
   *
   * Waarom naast `hof:offerForDuty`: dat antwoordt alleen als er iets te winnen
   * valt, en op het remisescherm hoort de knop er altijd te staan. Luc stond
   * daar met dertien wagenparken die allemaal "0 van 2 bestemmingen" zeiden en
   * geen enkele manier om er een bij te leggen.
   */
  const kandidaatVoor = async (
    duty: Duty,
    folder: string
  ): Promise<
    | {
        path: string
        file: string
        matched: number
        known: number
        total: number
        past: boolean
        alAanwezig?: boolean
      }
    | undefined
  > => {
    const termini = [...new Set(duty.legs.map((leg: DutyLeg) => leg.terminus).filter(Boolean))]
    if (termini.length === 0) return undefined
    try {
      return await werkerVraag({ soort: 'hofkandidaat', termini, busmap: folder })
    } catch (fout) {
      logFout('wagenparkkandidaat via de werker', fout)
      return laag().wagenparkKandidaat(termini, folder, duty.mapFolder)
    }
  }

  handle('hof:candidate', (_event, duty: Duty, folder: string) => kandidaatVoor(duty, folder))

  handle(
    'hof:placeCandidate',
    async (_event, duty: Duty, folder: string): Promise<{ placed: number; file?: string }> => {
      const kandidaat = await kandidaatVoor(duty, folder)
      if (!kandidaat) return { placed: 0 }
      try {
        const gedaan = placeHof(omsi(), folder, kandidaat.path)
        if (!gedaan) return { placed: 0, file: kandidaat.file }
        const lijst = readPlacements(userData())
        lijst.push(gedaan)
        writePlacements(userData(), lijst)
        // Er ligt een bestand bij: alles wat we van de bussen wisten klopt niet meer.
        vergeetKaarten()
        return { placed: 1, file: kandidaat.file }
      } catch (fout) {
        logFout('wagenpark neerleggen', fout)
        return { placed: 0, file: kandidaat.file }
      }
    }
  )

  handle(
    'hof:place',
    (_event, mapFolder: string, folders: string[]): { placed: number; failed: string[] } => {
      const termini = terminiOf(mapFolder)
      const wanted = new Set(folders)
      const plan = planHofs(omsi(), termini, laag().wagenparkBestanden()).filter(
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
            vars: kleurVars(vehiclePath, request.kleurstelling),
            // Ook bij vrij rijden: een gelede bus is twee voertuigen.
            trailer: aanhangerVan(vehiclePath, request.kleurstelling)
          }
        : undefined,
      spawn,
      weather: request.weather
      // Ook hier geen omloop vooraf; zie de uitleg hierboven.
    })

    const startup = presetStartup(omsi(), request.mapFolder, result.file)
    klaargezet = { mapFolder: request.mapFolder, file: result.file }
    // Elke vrije rit begint met aanmelden, ook als hij op de vorige lijkt.
    vrijeRitten += 1
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
     * Opnieuw starten na een crash of vastloper: wat er tot nu toe gereden is,
     * gaat bij de dienst, en de nulmeting gaat weg zodat er bij de herstart een
     * nieuwe komt. De laatste stand van de plugin staat nog in live.json.
     */
    if (request.herstart && career?.activeDuty?.startedAt) {
      const deel = sessieGegevens()
      const oud = career.activeDuty.eerder
      // `sessieGegevens` telt de eerdere delen al mee: dit is het totaal tot nu.
      const eerder = {
        km: deel.drivenKm ?? oud?.km ?? 0,
        minuten: deel.elapsedMinutes,
        harshBrakes: deel.harshBrakes ?? oud?.harshBrakes ?? 0,
        harshAccels: deel.harshAccels ?? oud?.harshAccels ?? 0,
        collisions: deel.collisions ?? oud?.collisions ?? 0,
        herstarts: (oud?.herstarts ?? 0) + 1
      }
      log(
        `OMSI opnieuw gestart binnen de dienst: tot nu ${eerder.km} km, ` +
          `${Math.round(eerder.minuten)} min, ${eerder.herstarts}e herstart`
      )
      persist({ ...career, activeDuty: { ...career.activeDuty, eerder, baseline: undefined } })
      omsiMelding = undefined
    }

    /*
     * Eerst klaarzetten, dan pas starten. Andersom heeft geen zin: OMSI leest
     * het startscherm bij het opstarten, dus wat er daarna nog geschreven wordt
     * ziet het spel deze sessie niet meer.
     *
     * En precies daarom slaan we het over als de speler meerijdt in een OMSI dat
     * al draait: dan zou het schrijven niets opleveren voor deze sessie en wel
     * het startscherm van de volgende keer overschrijven met een dienst die dan
     * misschien allang afgerond is. Wat er in plaats daarvan gebeurt staat in de
     * overlay: die vertelt welke kaart, welke omloop en welke codes je zelf moet
     * kiezen.
     */
    let prepared: ReturnType<typeof prepareSituation> | undefined
    let prepareError: string | undefined
    /*
     * Meerijden alleen als OMSI nu nog draait. Het scherm weet dat van een
     * peiling van vijf tellen terug, en de vraag "meerijden of opnieuw?" blijft
     * staan zolang de speler nadenkt; valt OMSI intussen om (Direct3D-Device
     * lost), dan startte de app het spel hieronder zonder dat er iets
     * klaarstond, op het startscherm van de vorige keer.
     */
    const running = await isOmsiRunning()
    const meerijden = request.meerijden === true && running
    if (meerijden) {
      log(`Meerijden in een draaiend OMSI: niets klaargezet voor ${duty.mapName}`)
      /*
       * En wat een eerdere dienst in deze sessie klaarzette, geldt dan ook niet
       * meer. Bleef het staan, dan zette `herstelStartscherm` die afgeronde
       * dienst bij het afsluiten van OMSI alsnog in het startscherm -- precies
       * wat meerijden hierboven belooft niet te doen.
       */
      klaargezet = undefined
    } else {
      if (request.meerijden) {
        log(`Meerijden gevraagd, maar OMSI draait niet meer: ${duty.mapName} wordt gewoon klaargezet`)
      }
      try {
        prepared = prepareSituation(
          duty,
          request.vehiclePath,
          request.date,
          request.lineNumber,
          request.terminus,
          request.yard,
          request.kleurstelling
        )
      } catch (cause) {
        prepareError = cause instanceof Error ? cause.message : String(cause)
      }
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

    // Het spel erbij starten, tenzij het al draait (zie `running` hierboven).
    let launched = false
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
    return {
      connected: Boolean(live?.alive),
      launched,
      running,
      meegereden: meerijden,
      prepared,
      prepareError
    }
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

  /*
   * De overlay luistert nu; stuur hem het beeld dat er is, ook als het niet
   * veranderd is. Het beeld dat bij het openen al verstuurd was kwam aan
   * voordat er iemand luisterde -- zie de preload.
   */
  ipcMain.on('overlay:luistert', (event) => {
    if (!overlayWindow || overlayWindow.isDestroyed()) return
    if (event.sender !== overlayWindow.webContents) return
    lastFrame = undefined
    pushFrame()
  })

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
    /*
     * Ook hier een personeelsnummer voor een chauffeur van voor die versie, niet
     * alleen bij het opstarten (`resolveActive`). Anders bleef een tweede
     * chauffeur op deze pc tot de volgende herstart zonder nummer en pincode: geen
     * dienstpas, en de telefoon in de overlay zei dat hij geen nummer had.
     */
    career = zorgVoorDienstgegevens(userData(), chosen)
    return careerPayload()
  })

  handle('career:delete', (_event, id: string) => {
    wisselVanChauffeur()
    deleteProfile(userData(), id)
    career = resolveActive(userData())
    return careerPayload()
  })

  /*
   * De foto hoort bij een profiel en niet bij de lopende sessie.
   *
   * Je kunt hem op elke tegel zetten, ook op die van een chauffeur die nu niet
   * rijdt, dus `persist()` kan hier niet: dat schrijft altijd het actieve
   * profiel. Dit leest het profiel waar het om gaat, zet er de bestandsnaam bij
   * en schrijft het terug -- en houdt `career` gelijk als het toevallig wel de
   * actieve is, want anders staat de naam in het bestand en de oude in het
   * geheugen.
   */
  const bewaarFoto = (id: string, naam: string | undefined) => {
    const profiel = readProfile(userData(), id)
    if (!profiel) return careerPayload()
    const bijgewerkt: CareerState = { ...profiel, photo: naam, photoAt: naam ? Date.now() : undefined }
    writeProfile(userData(), bijgewerkt)
    if (career?.id === id) career = bijgewerkt
    return careerPayload()
  }

  /*
   * Een foto kiezen. Het venster staat in het hoofdproces, net als bij het
   * aanwijzen van de OMSI-map: de pagina zelf mag niet bij het bestandssysteem.
   * Wat eruit komt wordt gekopieerd naar de eigen map -- de oorspronkelijke
   * plek is vaak een download of een usb-stick en kan morgen weg zijn.
   */
  handle('career:photo', async (_event, id: string) => {
    const keuze = await dialog.showOpenDialog({
      title: 'Kies een profielfoto',
      properties: ['openFile'],
      filters: [{ name: 'Afbeeldingen', extensions: [...PHOTO_EXTENSIONS] }],
      buttonLabel: 'Deze foto'
    })
    const gekozen = keuze.filePaths[0]
    if (keuze.canceled || !gekozen) return careerPayload()
    const naam = setProfilePhoto(userData(), id, gekozen)
    if (!naam) return careerPayload()
    return bewaarFoto(id, naam)
  })

  /*
   * De dienstgegevens zijn gezien. Eenmalig, en daarna nooit meer uit zichzelf.
   *
   * Dit gaat door het profiel heen en niet door de instellingen: het nummer
   * hoort bij de chauffeur en niet bij de installatie, dus een tweede chauffeur
   * op dezelfde pc krijgt zijn eigen pas ook een keer te zien.
   */
  handle('career:pas:gezien', () => {
    if (!career || career.pasGezien) return careerPayload()
    career = { ...career, pasGezien: true }
    writeProfile(userData(), career)
    return careerPayload()
  })

  handle('career:photo:clear', (_event, id: string) => {
    clearProfilePhoto(userData(), id)
    return bewaarFoto(id, undefined)
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

/*
 * De afbeelding die OMSI zelf bij elke kaart heeft staan.
 *
 * In elke kaartmap ligt een `picture.jpg` van 370 bij 280 -- precies het
 * plaatje uit de kaartkeuze van het spel. De tegelweergave laat die zien, en
 * dat is de reden dat hier een eigen schema staat: een pagina mag geen
 * `file://` inladen, en dezelfde elf plaatjes als gegevens-URL door de IPC
 * duwen is 1,3 MB kopieerwerk voor iets dat de schijf al heeft.
 *
 * Wat er door mag is één bestand: `maps\<kaart>\picture.jpg` binnen de
 * OMSI-map. De naam komt uit het pad en niet uit de hostnaam, want die maakt
 * Windows-mapnamen als "Ahlheim 5" en "Hohenkirchen - Herrenhof" kapot.
 */
protocol.registerSchemesAsPrivileged([
  { scheme: 'omsikaart', privileges: { standard: true, secure: true, supportFetchAPI: true } },
  { scheme: 'omsifoto', privileges: { standard: true, secure: true, supportFetchAPI: true } }
])

/**
 * Een getekende bus. Zelfde afspraak als bij de kaartplaatjes: één map, en de
 * naam komt uit het pad -- nooit iets anders van de schijf.
 */
function busplaatje(request: Request): Promise<Response> {
  const leeg = (): Promise<Response> => Promise.resolve(new Response(null, { status: 404 }))
  const map = busfotoMap(userData())
  const naam = decodeURIComponent(new URL(request.url).pathname).replace(/^\/+/, '')
  if (!naam || !/^[a-f0-9]{8,40}\.png$/i.test(naam)) return leeg()
  const bestand = resolve(map, naam)
  if (!bestand.startsWith(resolve(map) + sep)) return leeg()
  if (!existsSync(bestand)) return leeg()
  return net.fetch(pathToFileURL(bestand).toString())
}

function kaartplaatje(request: Request): Promise<Response> {
  const leeg = (): Promise<Response> => Promise.resolve(new Response(null, { status: 404 }))
  let kaarten: string
  try {
    kaarten = join(omsi(), 'maps')
  } catch {
    return leeg()
  }
  const naam = decodeURIComponent(new URL(request.url).pathname).replace(/^\/+/, '')
  if (!naam) return leeg()

  /*
   * Alleen dit ene bestand, en alleen binnen de kaartenmap. Een naam met `..`
   * erin komt na `resolve` buiten die map uit en valt hier af.
   */
  const bestand = resolve(kaarten, naam, 'picture.jpg')
  if (!bestand.startsWith(resolve(kaarten) + sep)) return leeg()
  if (!existsSync(bestand)) return leeg()
  return net.fetch(pathToFileURL(bestand).toString())
}

/*
 * De profielfoto van een chauffeur, langs dezelfde weg als de kaartplaatjes.
 *
 * Wat er doorheen mag is één map: `<gebruikersgegevens>\profielfotos`. Nooit
 * een willekeurig pad van de schijf -- de pagina vraagt om een bestandsnaam en
 * `profilePhotoPath` zegt of die naam binnen die map uitkomt. De naam staat in
 * het pad en niet in de hostnaam, want die maakt van een hoofdletter een kleine
 * letter en dan vindt Windows het bestand nog wel, maar Linux-builds niet.
 */
function profielfoto(request: Request): Promise<Response> {
  /*
   * Alleen het pad telt. Wat er achter het vraagteken hangt is het tijdstip
   * waarop de foto er kwam: dat staat er zodat een vervangen foto -- die
   * dezelfde bestandsnaam houdt -- een andere URL krijgt en Chromium hem
   * werkelijk opnieuw ophaalt. Zie de tegelbouwer in `App.tsx`.
   */
  const naam = decodeURIComponent(new URL(request.url).pathname).replace(/^\/+/, '')
  const bestand = profilePhotoPath(userData(), naam)
  if (!bestand) return Promise.resolve(new Response(null, { status: 404 }))
  return net.fetch(pathToFileURL(bestand).toString())
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
     * Waar `bewaarKopie` zijn kopieën zet voordat de app in een bestand van een
     * ander programma schrijft. Dit stond nergens, en dan maakt `bewaarKopie`
     * stil geen kopie: de overlayknop herschreef Steams localconfig.vdf -- per
     * account de hele bibliotheek, speeltijd en opties per spel -- zonder dat
     * er iets was om terug te zetten.
     */
    zetKopieMap(join(userData(), 'kopieen', 'andere-programmas'))
    /*
     * Waar de plugin schrijft, niet alleen volgens %LOCALAPPDATA%: in Lucs app
     * stond die niet goed, en dan kwam er nooit verbinding. De lokale AppData
     * staat naast AppData\Roaming, en die haalt Electron bij Windows zelf op.
     * Zie `liveMap`; het eerste gebruik schrijft de keuze in het logboek.
     */
    stelLiveMappenIn([
      join(dirname(app.getPath('appData')), 'Local'),
      join(app.getPath('home'), 'AppData', 'Local')
    ])
    liveMap()

    /*
     * Wat de app onderuit haalt hoort in het logboek te staan, niet alleen in
     * een venster dat wegklikt. Netjes afsluiten staat er sinds 20-09-2026 ook
     * bij, en dat is niet voor de sier: in het logboek van een speler die zei
     * dat de app crashte stond een herstart zonder één foutregel ervoor. Daar
     * viel niet aan te zien of hij was omgevallen of gewoon afgesloten. Staat
     * er nu geen "afsluiten" voor een start, dan is hij omgevallen.
     */
    process.on('uncaughtException', (fout) => logFout('onafgevangen fout', fout))
    process.on('unhandledRejection', (reden) => logFout('onafgehandelde belofte', reden))
    app.on('child-process-gone', (_gebeurtenis, details) =>
      log(`FOUT  hulpproces weg: ${details.type} ${details.reason} ${details.exitCode}`)
    )

    protocol.handle('omsikaart', kaartplaatje)
    protocol.handle('omsibus', busplaatje)
    // Foto's van een oudere tekenaar horen niet meer getoond te worden.
    ruimOudeFotosOp(userData())
    protocol.handle('omsifoto', profielfoto)

    adoptOldProfiles()
    try {
      log(`OMSI: ${omsi()}`)
    } catch (fout) {
      logFout('OMSI zoeken', fout)
    }
    meldPluginLogboek('de vorige keer dat OMSI draaide')
    // De wacht over OMSI tijdens een dienst; zie `bewaakOmsi`.
    setInterval(() => void bewaakOmsi(), 10000).unref?.()
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
    stopApparaat()
    if (apparaatTimer) clearInterval(apparaatTimer)
    apparaatTimer = undefined
    sluitBusfotoVenster()
    closeOverlay()
    sluitLopendeDienstAf()
  })

  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
    log('afsluiten')
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
