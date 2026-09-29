import { spawn } from 'node:child_process'
import { app, BrowserWindow, dialog, globalShortcut, ipcMain, nativeTheme, net, protocol, screen, shell } from 'electron'
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { basename, dirname, join, resolve, sep } from 'node:path'
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
import { apparatenVanBus, modelcfgVanBus, type Busapparaat } from '../core/busscherm'
import { panelenVan, profielVanBus, type Busprofiel, type Paneel } from '../core/busprofiel'
import { modulesVanBus, paneelVanModule, type Busmodule } from '../core/busmodule'
import {
  aantalVerbodenToetsen,
  bruikbareToetsen,
  verbodenToets,
  verlegVerbodenToetsen,
  zetBustoetsen
} from '../core/bustoetsen'
import {
  aanrijdingenGezien,
  describeLive,
  GETALLEN_MAX,
  getallenlijst,
  legVolgensOmsi,
  leesSchermen,
  VRAGEN_MAX,
  liveMap,
  pluginLogboek,
  readLive,
  schrijfGetallen,
  schrijfVragen,
  stelLiveMappenIn,
  voertuiggetallenVan,
  type LiveData
} from '../core/live'
import { MEET_EXTRA, Meetsessie, meetGetallenVoor, varlistVanBus } from '../core/meetstand'
import { isMeetStap, type MetingBeeld } from '../shared/meetstand'
import { findOmsiInstall, hasMaps, isOmsiInstall, resolveOmsiFolder } from '../core/install'
import { isOmsiRunning, launchOmsi, type LaunchResult } from '../core/launch'
import { ensurePlugin, pluginSourceDir, type PluginStatus } from '../core/pluginInstall'
import { readOverlayLayout, writeOverlayLayout } from '../core/overlayLayout'
import { receiptHeightMicrons, RECEIPT_WIDTH_MICRONS } from '../core/receipt'
import { difference, readKnown, writeKnown } from '../core/installed'
import { readSettings, writeSettings, type Settings } from '../core/settings'
import {
  LEGE_TELEFOON,
  OMSI_TOETSEN,
  aanmeldSleutelVan,
  dienstSleutelVan,
  dutyKeyOf,
  type AanmeldUitslag,
  type OmsiToets,
  type TelefoonStand,
  type WisselAanbod
} from '../shared/telefoon'
import { runsOn } from '../core/calendar'
import {
  boekEigenDienst,
  geefOpslag,
  stuurOpBijscholing,
  volgOpleiding,
  zelfOnderhoud,
  zelfRepareren,
  type OpleidingId,
  koopNieuw,
  neemAan,
  ontsla,
  koopTweedehands,
  naarWerkplaats,
  richtBedrijfOp,
  schrijfIn,
  sluitDagAf,
  tweedehandsAanbod,
  verkoop,
  vormVanNaam,
  zegOp,
  leesPost,
  ritVoorBedrijf,
  type BedrijfRit,
  type MarktBus
} from '../core/bedrijf'
import { ankerVoor } from '../core/bedrijfsplan'
import { beginDag, migreer } from '../core/bedrijfsdag'
import { zetInvulling } from '../core/invulling'
import { afrekening, dagplan, pasRoosterToe, PLAN_ACTIEF } from '../core/rooster'
import type {
  BusKeuze,
  Dagrooster,
  InvulDoel,
  InvulFout,
  InvulKeuze,
  LijnPlan,
  LijnWeek,
  RoosterActie,
  RoosterFout
} from '../core/planTypen'
import type { BedrijfKlokStand } from '../shared/bedrijfApi'
import { bedrijfsklok } from '../core/bedrijfsklok'
import {
  bouwRittenstaat,
  leesSpoor,
  volgSpoor,
  type MeetStand,
  type Rittenstaat,
  type SpoorRegel
} from '../core/rittenstaat'
import {
  InstallatieFout,
  installeerStappen,
  leesRegister,
  openBron,
  planStappen,
  registreer,
  reserveMap,
  ruimteVoor,
  schrijfRegister,
  verwijderStappen,
  type Plan
} from '../core/addon'
import { controleerBus, controleerKaart, type Controle } from '../core/addoncheck'
import { ZipFout } from '../core/zip'
import type { AddonOverzicht, AddonPlan } from '../shared/api'
import { alleenBekijken, bewaakVersie, meldStartFout, stempel } from './versiewacht'
import {
  FLITS,
  controleAanBoord,
  flitsControle,
  flitspalen,
  gebeurtenisVoor,
  onderwegVan,
  type Flits,
  type Flitspaal,
  type Gebeurtenis,
  type OnderwegBeeld
} from '../core/onderweg'
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
  schermActies,
  schermGetallenVoor,
  schermStringsVoor,
  schermtextuurOp,
  schermVoor,
  schermvormOp,
  standVoor
} from './scherm'
import { triggersVan } from '../core/schermvorm'
import type { Busanalyse, Busmap } from '../core/busklaar'
import {
  bestaandeBusfoto,
  busfotoAdres,
  busfotoAfgehandeld,
  busfotoMap,
  maakBusfoto,
  ruimOudeFotosOp,
  sluitBusfotoVenster
} from './busfoto'
import { busfoto4Map, maakBusfoto4, type Busfoto4 } from './busfoto4'
import { maakBus3dVenster, type Bus3dVenster } from './bus3dvenster'
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
import { leesInzetpunten, plekVanInzetpunt, type Beginplek, type VrijCheckVol } from '../core/beginplek'
import { MIN_MONSTERS, neemMonster, type Herkenning, type Monster } from '../core/kaartherkenning'
import { onbruikbaar, vouw, vouwNaam, type Koppeling, type OmsiKeuze } from '../core/omloopvolgen'
import { startVrijeRit } from '../core/vrijstart'
import { readTileList } from '../core/track'
import { t } from '../shared/i18n'
import { presetStartup } from '../core/startup'
import { inBekijkstand, zetKopieMap } from '../core/veilig'
import { trailerOf } from '../core/trailer'
import { maakBus3dDienst, registreerBus3dIpc, type Bus3dDienst } from './bus3d'
import { spawnAtStop } from '../core/spawn'
import { listMaps, readMapName } from '../core/timetable'
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
  type BeginResult,
  type FreeCheck,
  type FreeRequest,
  type FreeResult,
  type Klaargezet,
  type VrijBeeld,
  type VrijStaat,
  type VrijSuggestie,
  type VrijWanneer,
  type Busklaaruitslag,
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
import { ritSleutel, uniekeRitten } from '../shared/traject'

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
 *
 * De routes die het hoofdproces onthoudt (`routesVoor`) gaan mee, en de
 * vensters horen het ook: die onthouden ze per venster (renderer/src/
 * trajecten.ts). Anders bleef na een add-on die een `.ttr` bijwerkt de oude
 * weg op de kaart staan tot de app opnieuw startte.
 */
function vergeetKaarten(): void {
  kaartlaag = undefined
  for (const [soort, staand] of werkers) {
    werkers.delete(soort)
    staand.terminate().catch(() => undefined)
  }
  routeGeneratie += 1
  routeGeheugen.clear()
  routeOnderweg.clear()
  for (const venster of BrowserWindow.getAllWindows()) {
    if (!venster.isDestroyed()) venster.webContents.send('kaarten:vergeten')
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
/*
 * 'bussen': een bus uitlezen om hem klaar te maken duurt tot een minuut. Op de
 * voorgrondwerker zou dat de kaarten en de dienstenlijst zo lang ophouden.
 */
/*
 * 'bus3d': het 3D-pakket van een bus (main/bus3d.ts). Eigen werker, zodat een
 * vraag van het 3D-venster nooit achter een fotoronde of een busanalyse wacht.
 */
type Werksoort = 'voorgrond' | 'achtergrond' | 'fotos' | 'bussen' | 'bus3d'

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
const werkerWacht = new Map<
  number,
  { werker: Worker; klaar: (antwoord: WerkerAntwoord) => void; tussen?: (bericht: unknown) => void }
>()

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
    /*
     * `alleenIn`: in alleen-bekijken (main/versiewacht.ts) zet de werker het
     * slot van het hoofdproces ook op zijn eigen `fs` -- een worker_thread heeft
     * er een eigen. `userData()` is dan al de kopie.
     */
    workerData: { omsiPath: omsi(), userData: userData(), alleenIn: inBekijkstand() ? [userData()] : undefined }
  })
  gemaakt.on('message', (antwoord: WerkerAntwoord & { tussen?: unknown }) => {
    // Een tussenbericht (bus3d: voortgang, de textuurlijst): de vraag blijft open.
    if (antwoord.tussen !== undefined) {
      werkerWacht.get(antwoord.id)?.tussen?.(antwoord.tussen)
      return
    }
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

/**
 * Bus3D: de regie in main/bus3d.ts; hier alleen de aansluiting op de werker
 * `'bus3d'`, het logboek en de mappen. Pas gemaakt als er iets gevraagd wordt.
 */
let bus3dDienst: Bus3dDienst | undefined
function bus3d(): Bus3dDienst {
  bus3dDienst ??= maakBus3dDienst({
    userData,
    omsi,
    werkerVraag: (opdracht, tussen) => werkerVraag(opdracht, 'bus3d', tussen),
    sluitWerker: () => sluitAchtergrondwerker('bus3d'),
    log,
    logFout,
    // Zolang OMSI draait geen heldenbeeld wegschrijven (§9); `omsiDraaide` wordt elke halve minuut bijgewerkt.
    omsiDraait: () => omsiDraaide,
    // Tot F3 staat alles van het 3D-venster achter de schakelaar `bus3d` (standaard uit).
    aan: () => readSettings(userData()).bus3d === true,
    // Geen heldenbeeld: de foto die de tegel al heeft, zonder te tekenen (§9).
    fotoTerugval: (relatiefPad, kleurstelling) => bestaandeFoto(relatiefPad, kleurstelling)
  })
  return bus3dDienst
}

/**
 * De foto die de tegel al heeft, als adres: met de schakelaar eerst de v4, anders
 * de v3b. Zonder te tekenen; voor het 3D-venster, dat nooit op een foto wacht.
 */
function bestaandeFoto(relatiefPad: string, kleurstelling?: string): string | undefined {
  if (readSettings(userData()).bus3d === true) {
    const v4 = busfoto4?.bestaand(relatiefPad, kleurstelling)
    if (v4) return busfoto4Adres(v4)
  }
  const v3 = bestaandeBusfoto(userData(), relatiefPad, kleurstelling)
  return v3 ? busfotoAdres(v3) : undefined
}

/** `omsibus://foto/v4/<naam>.webp`: de foto uit de 3D-renderer (main/busfoto4.ts). */
function busfoto4Adres(bestand: string): string {
  return `omsibus://foto/v4/${bestand.split(/[\\/]/).pop()}`
}

/*
 * Het 3D-venster (main/bus3dvenster.ts) en het verborgen fotovenster van de
 * foto v4 (main/busfoto4.ts). Gemaakt in registerHandlers, want ze hangen hun
 * eigen IPC op.
 */
let bus3dVenster: Bus3dVenster | undefined
let busfoto4: Busfoto4 | undefined

/** De pagina `bus3d.html`, in dev van de server en anders uit de gebouwde map. */
function bus3dPagina(): { url?: string; bestand?: string } {
  return process.env.ELECTRON_RENDERER_URL
    ? { url: `${process.env.ELECTRON_RENDERER_URL}/bus3d.html` }
    : { bestand: join(__dirname, '../renderer/bus3d.html') }
}

/** De lijst uit "Appearance" van een bus; het lezen van de .cti-bestanden gaat naar de werker. */
async function kleurstellingenVan(relatiefPad: string): Promise<BusKleurstellingen | undefined> {
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

/** Het thema van de app als donker of licht, voor de achtergrond van een nieuw venster. */
function isDonker(): boolean {
  const thema = readSettings(userData()).theme ?? 'systeem'
  return thema === 'donker' || (thema === 'systeem' && nativeTheme.shouldUseDarkColors)
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
  soort: Werksoort = 'voorgrond',
  tussen?: (bericht: unknown) => void
): Promise<T> {
  const id = (volgendeOpdracht += 1)
  const antwoord = await new Promise<WerkerAntwoord>((klaar) => {
    try {
      const werker = kaartWerker(soort)
      werkerWacht.set(id, { werker, klaar, tussen })
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
 * Welk proces OMSI is. Altijd Omsi, behalve in een proef: die zet een eigen
 * programma neer dat vastloopt, zodat er nooit aan het echte spel van de
 * speler gekomen wordt.
 *
 * ELKE VRAAG "DRAAIT OMSI?" GEBRUIKT DIT. Tot 27-09 keek alleen de wacht
 * ernaar; de vraag op de busstap en de controle vlak voor het klaarzetten
 * zochten vast naar Omsi.exe. Een proef met een eigen "OMSI" kreeg dan geen
 * vraag "OMSI draait al", zette de situatie klaar in de echte spelmap en
 * startte het echte spel -- zo gebeurd bij scripts/probe-vrijrijden.cjs.
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
        start: proces.start,
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

/**
 * De nulmeting met het aantal verkochte kaartjes erbij.
 *
 * De teller loopt per dienst: stap je in een andere dienst, dan begint hij
 * opnieuw. Zie `telVerkoop` voor waarom het aantal hier vandaan komt en niet
 * uit OMSI zelf.
 */
let verkochtBij = ''

/** Een andere dienst dan bij de vorige verkoop: de teller begint opnieuw. */
function kassaVoorDienst(): void {
  const sleutel = dutyKeyOf(currentDuty())
  if (sleutel !== verkochtBij) {
    verkochtBij = sleutel
    verkochtGeteld = 0
    vorigeKoper = -1
  }
}

function nulmeting(): Parameters<typeof describeLive>[2] {
  kassaVoorDienst()
  const basis = baseline()
  return basis ? { ...basis, verkocht: verkochtGeteld } : basis
}

/** De lopende dienst: die van de overlay, of anders die uit het profiel (na een herstart). */
function currentDuty(): Duty | undefined {
  return overlayDuty ?? (career?.activeDuty?.assignment as Assignment | undefined)?.duty
}

/*
 * VRIJ RIJDEN: DE NAVIGATIE VINDT ZELF WAT JE IN OMSI RIJDT
 *
 * Een gebruiker (via Luc): "meine Idee wäre das die Haltestellen aussuchen
 * Option komplett weg fällt in dem Modus nur und nur noch Karte und Bus
 * ausgesucht werden müssen und das Navi es von alleine findet". De speler
 * kiest dus alleen een kaart en een bus; de app zet de bus op een inzetpunt
 * waar straks iets vertrekt (core/beginplek.ts), en wat de speler daarna in
 * OMSI kiest, vindt de navigatie zelf terug.
 *
 * Een vrije rit (`vrijeRit`) staat niet in het profiel. `volgOmloopInOmsi`
 * kijkt bij elk beeld, en elke seconde ook met de overlay dicht, wat er aan de
 * hand is, en zet dat in `vrijStaat`: wachten op OMSI, geen bus, een andere
 * kaart, nog geen omloop (met wat er straks vertrekt), de gevolgde omloop, een
 * losse rit, of iets wat niet in de dienstregeling staat. Het rijscherm, de
 * overlay en de telefoon tonen dezelfde staat (renderer/vrijstaat.ts).
 *
 * Het zware werk -- de dienstregeling lezen, de koppeling, wat er vertrekt --
 * gebeurt in de werker. Het hoofdproces tekent intussen de overlay; hier bleef
 * het eerder seconden stil (tegenlezing B3).
 */
let vrijeRit:
  | {
      mapFolder: string
      mapName: string
      vehiclePath?: string
      yard?: string
      /** Het begin van de rit; een uitkomst van een oudere rit telt niet. */
      sinds: string
      /** Waar de bus neergezet is. */
      plek?: string
      klaargezet: Klaargezet
      /** Draaide OMSI al bij START? Dan heeft de speler het zelf in de hand. */
      startMet: 'draaiend' | 'dicht'
      startTijd: number
      /** De datum van de situatie, voor als de plugin er (nog) geen geeft. */
      datum?: string
    }
  | undefined

let vrijStaat: VrijStaat | undefined

/** Wat het volgen onthoudt tussen twee beelden. */
const volg = {
  /** De laatste keuze van OMSI die gekoppeld is, en wanneer. */
  sleutel: '',
  sinds: 0,
  /** Sinds wanneer er geen dienstregeling actief is. */
  zonderSinds: 0,
  /** Sinds wanneer de plugin de bus niet kan lezen. */
  geenMemSinds: 0,
  /** Er loopt een vraag aan de werker; dan niet nog een. */
  bezig: false,
  suggesties: [] as VrijSuggestie[],
  halte: undefined as string | undefined,
  suggestiesOp: 0,
  suggestiesBij: undefined as { x: number; y: number } | undefined,
  /** De omloop in OMSI is losgelaten; de eerste regel zegt dat. */
  losgelaten: false,
  /** Op welke kaart een koppeling lukte; dan beslist de kaartherkenning niet meer. */
  gekoppeldOp: '',
  /** De gevolgde omloop: lijnbestand en plek in dat bestand, zoals de koppeling hem vond. */
  omloop: undefined as { lineFile?: string; tourIndex?: number } | undefined,
  gewisseldVan: undefined as string | undefined,
  gewisseldOp: 0,
  /** Welke rit de bus al bereikt heeft; dan geen aanrijlijn meer. */
  aanrijBereikt: '',
  onbekendGelogd: new Set<string>()
}

/** Plekken van de bus, voor de kaartherkenning; zie core/kaartherkenning.ts. */
let monsters: Monster[] = []
/** Telt elke nieuwe lijst monsters; zo weet de herkenning dat er iets te vragen valt. */
let monsterVersie = 0

/*
 * De kaartherkenning, in de werker (`herken`). De eerste keer leest die
 * global.cfg en het terrein van alle kaarten: 62 tot 75 ms, en dat stond
 * eerst hier, midden in het volgen. Het volgen wacht er ook niet op: bij een
 * nieuw monster gaat er een vraag weg, en tot het antwoord er is geldt het
 * vorige oordeel over deze kaart -- of geen, en dan gebeurt er niets. Een
 * werker die net een kaart van drie seconden inleest, houdt het volgen zo
 * niet op.
 */
const herkenning = {
  sleutel: '',
  bezig: false,
  uitkomst: undefined as (Herkenning & { sinds: string; folder: string }) | undefined
}

function vergeetVolgen(): void {
  vrijStaat = undefined
  monsters = []
  herkenning.sleutel = ''
  herkenning.uitkomst = undefined
  Object.assign(volg, {
    sleutel: '',
    sinds: 0,
    zonderSinds: 0,
    geenMemSinds: 0,
    suggesties: [],
    halte: undefined,
    suggestiesOp: 0,
    suggestiesBij: undefined,
    losgelaten: false,
    gekoppeldOp: '',
    omloop: undefined,
    gewisseldVan: undefined,
    gewisseldOp: 0,
    aanrijBereikt: ''
  })
  volg.onbekendGelogd.clear()
}

const kaartPad = (folder: string): string => join(omsi(), 'maps', folder)

/**
 * Het laatste oordeel van de werker over de kaart van deze rit, en een nieuwe
 * vraag als er sinds de vorige een monster bij kwam. Wacht nergens op.
 */
function herkenningVoor(rit: NonNullable<typeof vrijeRit>): Herkenning | undefined {
  const sleutel = `${rit.sinds}|${rit.mapFolder}|${monsterVersie}`
  if (sleutel !== herkenning.sleutel && !herkenning.bezig) {
    herkenning.sleutel = sleutel
    herkenning.bezig = true
    const folder = rit.mapFolder
    werkerVraag<Herkenning>({ soort: 'herken', folder, monsters })
      .then((uit) => {
        // Intussen gekoppeld, gewisseld of gestopt: dan is dit antwoord van gisteren.
        if (vrijeRit === rit && rit.mapFolder === folder && herkenning.sleutel === sleutel) {
          herkenning.uitkomst = { ...uit, sinds: rit.sinds, folder }
        }
      })
      .catch((fout) => logFout('vrij rijden: de kaartherkenning', fout))
      .finally(() => {
        herkenning.bezig = false
      })
  }
  const uit = herkenning.uitkomst
  return uit && uit.sinds === rit.sinds && uit.folder === rit.mapFolder ? uit : undefined
}

/** Waar de bus staat in kaartmeters, uit de tegel en de plek erbinnen; zonder rijstrokennet. */
const tegelsVoorBus = new Map<string, { lijst: ReturnType<typeof readTileList>; grid: ReturnType<typeof readTileGrid> }>()
function busOpKaart(folder: string, mem: LiveData['mem']): { x: number; y: number } | undefined {
  if (!mem || mem.ok !== 1) return undefined
  let tegels = tegelsVoorBus.get(folder)
  if (!tegels) {
    let lijst: ReturnType<typeof readTileList> = []
    try {
      lijst = readTileList(kaartPad(folder))
    } catch {
      lijst = []
    }
    tegels = { lijst, grid: readTileGrid(kaartPad(folder)) }
    tegelsVoorBus.set(folder, tegels)
  }
  const tegel = tegels.lijst[mem.tile]
  if (!tegel || !tegels.grid) return undefined
  const [ox, oy] = tegels.grid.offset(tegel.tx, tegel.ty)
  return { x: ox + mem.x, y: oy + mem.z }
}

/** De datum in het spel als jjjj-mm-dd, of die van de situatie. */
function speldatum(live: LiveData, rit: NonNullable<typeof vrijeRit>): string | undefined {
  if (live.year > 1900 && live.month >= 1 && live.day >= 1) {
    return `${live.year}-${String(live.month).padStart(2, '0')}-${String(live.day).padStart(2, '0')}`
  }
  return rit.datum
}

/**
 * Een nieuwe staat, en alleen als hij anders is dan de vorige -- of als de
 * dienst veranderde. Het rijscherm krijgt hem met de dienst en de IBIS-codes;
 * de overlay en de telefoon in het volgende beeld.
 */
function zetVrijeStaat(staat: VrijStaat, dienstGewijzigd = false): void {
  if (!dienstGewijzigd && JSON.stringify(staat) === JSON.stringify(vrijStaat)) return
  vrijStaat = staat
  lastFrame = undefined
  if (mainWindow && !mainWindow.isDestroyed() && vrijeRit) {
    mainWindow.webContents.send('vrij:staat', {
      staat,
      duty: overlayDuty,
      ibis: overlayIbis,
      kaart: vrijeRit.mapName,
      mapFolder: vrijeRit.mapFolder
    })
  }
}

/** De gevolgde omloop loslaten: OMSI rijdt hem niet meer. */
function wisGevolgd(): void {
  overlayDuty = undefined
  overlayIbis = undefined
  volg.sleutel = ''
  /*
   * Zonder gevolgde omloop mag de kaartherkenning weer beslissen. Bleef de
   * koppeling van daarnet gelden, dan merkte de app een andere kaart die de
   * speler daarna in OMSI laadde de hele rit niet meer op.
   */
  volg.gekoppeldOp = ''
  volg.omloop = undefined
  lastFrame = undefined
}

/**
 * De kaart wisselen naar die van OMSI. De speler koos er in de app een, maar
 * laadde in OMSI een andere; dan volgt de navigatie OMSI.
 */
async function wisselKaart(rit: NonNullable<typeof vrijeRit>, folder: string, waarom: string): Promise<void> {
  try {
    await zorgVoorKaart(folder)
  } catch (fout) {
    logFout(`kaart ${folder} klaarzetten`, fout)
  }
  if (vrijeRit !== rit) return
  const oud = rit.mapName
  rit.mapFolder = folder
  rit.mapName = readMapName(kaartPad(folder)) || folder
  wisGevolgd()
  volg.gekoppeldOp = ''
  // Het oordeel over de oude kaart geldt niet voor de nieuwe; ook niet als de rit er ooit terugkomt.
  herkenning.uitkomst = undefined
  volg.suggesties = []
  volg.halte = undefined
  volg.suggestiesOp = 0
  /*
   * De volgende staat gaat hoe dan ook naar het rijscherm: die draagt de nieuwe
   * kaart mee. Was hij gelijk aan de vorige (geen omloop, niets dat vertrekt),
   * dan hield het rijscherm de naam en het net van de oude kaart.
   */
  vrijStaat = undefined
  volg.gewisseldVan = oud
  volg.gewisseldOp = Date.now()
  log(`vrij rijden: OMSI speelt ${rit.mapName}, niet ${oud} (${waarom}); de navigatie volgt die kaart`)
}

/**
 * Een andere kaart waar deze keuze van OMSI wel past: het lijnbestand bestaat
 * er, het ritnummer wijst daar dezelfde rit aan, en de plek van de bus spreekt
 * het niet tegen. Alleen als er precies een is. In de werker (`elders` in
 * core/kaartlaag.ts): dat leest de ritnamen en het terrein van andere kaarten.
 */
async function andereKaartVoor(
  rit: NonNullable<typeof vrijeRit>,
  mem: NonNullable<LiveData['mem']>
): Promise<string | undefined> {
  try {
    return await werkerVraag<string | undefined>({
      soort: 'elders',
      folder: rit.mapFolder,
      keuze: { lineName: mem.lineName, trip: mem.trip, tripName: mem.tripName },
      monsters
    })
  } catch (fout) {
    logFout('vrij rijden: een andere kaart zoeken', fout)
    return undefined
  }
}

/** Wat er straks vertrekt, uit de werker; hooguit om de 30 s, of na 250 m rijden. */
async function geenOmloop(rit: NonNullable<typeof vrijeRit>, live: LiveData): Promise<void> {
  const bus = busOpKaart(rit.mapFolder, live.mem)
  const nu = Date.now()
  const verplaatst =
    bus && volg.suggestiesBij ? Math.hypot(bus.x - volg.suggestiesBij.x, bus.y - volg.suggestiesBij.y) > 250 : false
  if (nu - volg.suggestiesOp >= 30_000 || verplaatst) {
    volg.suggestiesOp = nu
    volg.suggestiesBij = bus
    try {
      const uit = await werkerVraag<{ suggesties: VrijSuggestie[]; halte?: string }>({
        soort: 'vertrekken',
        folder: rit.mapFolder,
        datum: speldatum(live, rit),
        klok: live.time / 60,
        bus
      })
      if (vrijeRit !== rit) return
      volg.suggesties = uit.suggesties
      volg.halte = uit.halte
    } catch (fout) {
      logFout('vrij rijden: wat er vertrekt', fout)
    }
  }
  zetVrijeStaat({
    soort: 'geenOmloop',
    suggesties: volg.suggesties,
    halte: volg.halte,
    losgelaten: volg.losgelaten || undefined
  })
}

/** Een gevonden omloop overnemen: de dienst, de IBIS-codes, en de staat. */
function pasKoppelingToe(
  rit: NonNullable<typeof vrijeRit>,
  koppeling: Koppeling,
  live: LiveData,
  keuze: OmsiKeuze
): void {
  const nieuw = koppeling.duty
  if (!nieuw) return
  /*
   * De IBIS-codes. Het wagenpark ligt naast de bus die je rijdt -- de bus die
   * OMSI noemt, of anders die van de start -- en de codes verschillen per
   * tijdvak, dus telt het jaar van het spel.
   */
  const busPad = live.bus?.pad ? join(live.bus.pad, 'bus.bus') : rit.vehiclePath
  /*
   * Het wagenpark dat de chauffeur bij het starten koos -- alleen als hij nog in
   * dezelfde busmap rijdt; een wagenpark van een ander model bestaat daar niet,
   * en dan kiest buildIbisPlan zelf.
   */
  const zelfdeMap =
    rit.vehiclePath &&
    busPad &&
    dirname(busPad).toLowerCase().replace(/\\/g, '/') === dirname(rit.vehiclePath).toLowerCase().replace(/\\/g, '/')
  let ibis: IbisPlan | undefined
  if (busPad) {
    try {
      ibis = buildIbisPlan(omsi(), busPad, nieuw, live.year || new Date().getFullYear(), zelfdeMap ? rit.yard : undefined)
    } catch (fout) {
      logFout('IBIS-codes van de gevolgde omloop', fout)
    }
  }
  overlayDuty = nieuw
  overlayIbis = ibis
  /* Er valt niets te aanvaarden: de chauffeur koos deze omloop zelf. */
  telefoon.aanvaard = true
  lastFrame = undefined
  volg.gekoppeldOp = rit.mapFolder
  volg.omloop = { lineFile: koppeling.lineFile, tourIndex: koppeling.tourIndex }
  /*
   * Gekoppeld: de kaartherkenning rust. Een oordeel van vóór de koppeling hoort
   * niet te blijven liggen tot ze weer loslaat, en dan meteen te wisselen op
   * plekken van lang geleden. Bij het loslaten gaat er meteen een nieuwe vraag.
   */
  herkenning.uitkomst = undefined
  herkenning.sleutel = ''
  volg.losgelaten = false
  volg.aanrijBereikt = ''
  const eerste = nieuw.legs[0]
  log(
    `vrij rijden volgt OMSI: lijn ${nieuw.lineNumbers.join('/') || koppeling.lineFile || keuze.lineName}, ` +
      `omloop ${nieuw.tourNumber}, ${nieuw.legs.length} ${nieuw.legs.length === 1 ? 'rit' : 'ritten'} vanaf ${formatTime(nieuw.start)}` +
      `${ibis ? `, IBIS lijn ${ibis.line} uit wagenpark ${ibis.yard ?? '?'}` : ''} ` +
      `(koppeling ${koppeling.soort}, ${koppeling.volgorde ?? '-'}, ${koppeling.zeker ? 'zeker' : 'onzeker'}, ` +
      `lijnbestand ${koppeling.lineFile ?? '?'}, omloop #${koppeling.tourIndex ?? '?'} "${koppeling.tourNumber ?? ''}", ` +
      `vanaf rit #${koppeling.entry ?? '?'} ${eerste?.tripFile ?? ''} ${eerste ? formatTime(eerste.departure) : ''})`
  )
  zetVrijeStaat(
    koppeling.soort === 'rit'
      ? { soort: 'alleenRit', line: keuze.lineName.trim(), tour: keuze.tourName.trim(), trip: keuze.tripName.trim() }
      : {
          soort: 'gevolgd',
          koppeling: koppeling.soort,
          line: nieuw.lineNumbers.join('/') || nieuw.lineFile,
          tour: nieuw.tourNumber
        },
    true
  )
}

/**
 * Wat OMSI nu rijdt, en wat de navigatie daarmee doet. Zie VRIJ RIJDEN
 * hierboven. Eén tegelijk: een tweede aanroep terwijl de werker nog rekent,
 * doet niets.
 */
async function volgOmloopInOmsi(live: LiveData | undefined): Promise<void> {
  const rit = vrijeRit
  if (!rit || career?.activeDuty || volg.bezig) return
  volg.bezig = true
  try {
    await volgStap(rit, live)
  } catch (fout) {
    logFout('vrij rijden volgen', fout)
  } finally {
    volg.bezig = false
  }
}

async function volgStap(rit: NonNullable<typeof vrijeRit>, live: LiveData | undefined): Promise<void> {
  const nu = Date.now()

  /* Nog niets van OMSI. Draaide het al bij START en blijft het stil, dan zegt de tekst meer. */
  if (!live?.alive) {
    const lang = rit.startMet === 'draaiend' && nu - rit.startTijd > 60_000
    zetVrijeStaat(lang ? { soort: 'wacht', lang: true } : { soort: 'wacht' })
    return
  }

  /* De plugin kan de bus niet lezen: nog geen bus neergezet, of een andere OMSI-versie. */
  const mem = live.mem
  if (!mem || mem.ok !== 1) {
    if (!volg.geenMemSinds) volg.geenMemSinds = nu
    if (nu - volg.geenMemSinds >= 10_000) {
      zetVrijeStaat(
        live.exeVersion === '2.3.004' ? { soort: 'geenBus', klaargezet: rit.klaargezet } : { soort: 'geenGeheugen' }
      )
    } else if (!vrijStaat) zetVrijeStaat({ soort: 'wacht' })
    return
  }
  volg.geenMemSinds = 0

  /* Rijdt OMSI een dienstregeling, of is er nog niets gekozen (of losgelaten)? */
  const actief = mem.schedActive > 0.5 && !(mem.tripName.trim() === '' && mem.tourEntry < 0)

  /*
   * Staat de bus op deze kaart? Dit is de enige kaartherkenning in het volgen.
   * Na een mislukte koppeling stond er even een tweede, met dezelfde vraag over
   * dezelfde monsters en dezelfde kaart (en `gekoppeldOp` verandert daartussen
   * niet): die wisselde alleen waar deze het in hetzelfde beeld al gedaan had,
   * en dan was het volgen hier al gestopt. Wat een mislukte koppeling wel
   * toevoegt, is de dienstregeling van de andere kaarten (andereKaartVoor).
   */
  const nieuw = neemMonster(monsters, mem)
  if (nieuw !== monsters) {
    monsters = nieuw
    monsterVersie++
  }
  if (volg.gekoppeldOp !== rit.mapFolder && monsters.length >= MIN_MONSTERS) {
    const herkend = herkenningVoor(rit)
    if (herkend?.oordeel === 'anders') {
      if (herkend.wisselNaar) {
        await wisselKaart(rit, herkend.wisselNaar, 'de plek van de bus')
        return
      }
      /*
       * Geen of meer kaarten met dit terrein -- HafenCityHamburg, Hamburg109,
       * Hamburg109_2 en HamburgLi20 delen het hunne -- of een tweede kaart die
       * er half bij past. Rijdt OMSI een omloop, dan beslist die: het koppelen
       * hieronder zoekt ook op de andere kaarten (andereKaartVoor). Stond hier
       * een `return`, dan bleef de navigatie op "niet op deze kaart" staan, ook
       * nadat de speler een omloop koos.
       */
      if (!actief) {
        zetVrijeStaat({ soort: 'andereKaart' })
        return
      }
    }
  }

  /* Geen dienstregeling actief: nog niets gekozen, of losgelaten. */
  if (!actief) {
    if (!volg.zonderSinds) volg.zonderSinds = nu
    if (overlayDuty) {
      /*
       * Een halve minuut geduld: `schedActive` kan even wegvallen, bij een
       * eindpunt of een leegrit, en dan hoort de route niet bij elke keerhalte
       * te verdwijnen.
       */
      if (nu - volg.zonderSinds < 30_000) return
      wisGevolgd()
      volg.losgelaten = true
      log('vrij rijden: omloop in OMSI losgelaten')
    }
    await geenOmloop(rit, live)
    return
  }
  volg.zonderSinds = 0

  const keuze: OmsiKeuze = {
    lineName: mem.lineName,
    tourName: mem.tourName,
    tripName: mem.tripName,
    line: mem.line,
    lines: mem.lines,
    tour: mem.tour,
    tourEntry: mem.tourEntry,
    trip: mem.trip,
    klok: live.time / 60
  }

  /* Eens per keuze, en na een halve minuut nog eens: een mislukte koppeling blijft niet stil. */
  const sleutel = `${rit.sinds}|${rit.mapFolder}|${mem.line}|${vouw(mem.lineName)}|${mem.tour}|${mem.tourEntry}|${vouw(mem.tripName)}`
  const alGeprobeerd = sleutel === volg.sleutel && nu - volg.sinds < 30_000

  /* Volgt de overlay dit al? Dan valt er niets te doen. */
  let voorkeur: 'bestand' | 'vertrek' | undefined
  const nuGevolgd = overlayDuty
  if (nuGevolgd?.omsi) {
    const leg = legVolgensOmsi(mem, nuGevolgd)
    if (leg !== undefined && leg !== null) return
    if (leg === null && !alGeprobeerd) {
      /*
       * Lijn en omloop kloppen, de rit niet: de volgorde van de koppeling was
       * fout (OMSI telt op vertrektijd, of juist niet). Opnieuw, met de andere
       * voorop. Gelogd wordt pas na het koppelen, en alleen als er iets
       * verandert (hieronder).
       */
      voorkeur = nuGevolgd.omsi.volgorde === 'bestand' ? 'vertrek' : 'bestand'
    }
  } else if (nuGevolgd) {
    const ritNu = vouw(mem.tripName)
    /*
     * Een losse rit (`alleenRit`) hoort bij geen omloop met de naam die OMSI
     * noemt -- daarom was het een losse rit -- dus telt dan alleen de rit.
     * Verder moet de naam precies kloppen. Hier stond `naamGelijk`, en die leest
     * "10" als een verminkte "1": koos de speler omloop "10" terwijl de overlay
     * "1" volgde, en rijdt "10" een rit die ook in "1" staat (38 van de 40 zulke
     * paren), dan bleef de overlay "1" volgen (tegenlezing 28-09). Een echt
     * verminkte naam ("1" met rommel erachter) koppelt nu opnieuw, en daar
     * beslist `zoekOpNaam` met de dienstregeling erbij; komt dezelfde omloop
     * terug, dan verandert er niets (hieronder).
     */
    const alleenRit = vrijStaat?.soort === 'alleenRit'
    const zelfde = nuGevolgd.legs.some(
      (leg) =>
        vouw(leg.tripFile) === ritNu &&
        (alleenRit || onbruikbaar(mem.tourName) || vouwNaam(mem.tourName) === vouwNaam(leg.tourNumber))
    )
    if (zelfde) return
  }

  if (!voorkeur && alGeprobeerd) return
  volg.sleutel = sleutel
  volg.sinds = nu

  const datum = speldatum(live, rit)
  let koppeling: Koppeling
  try {
    koppeling = await werkerVraag<Koppeling>({ soort: 'koppel', folder: rit.mapFolder, keuze, datum, voorkeur })
  } catch (fout) {
    logFout('vrij rijden koppelen', fout)
    return
  }
  if (vrijeRit !== rit || volg.sleutel !== sleutel) return
  if (koppeling.soort === 'index' || koppeling.soort === 'vertrek' || koppeling.soort === 'naam') {
    /*
     * Op naam dezelfde omloop als die de overlay al volgt, en de rit staat erin:
     * een verminkte naam van één teken, die hierboven niet precies klopte. Dan
     * niets opnieuw: anders stond hier elke halve minuut "volgt OMSI" in het
     * logboek, met nieuwe IBIS-codes.
     */
    if (
      !voorkeur &&
      koppeling.soort === 'naam' &&
      nuGevolgd &&
      !nuGevolgd.omsi &&
      overlayDuty === nuGevolgd &&
      volg.omloop !== undefined &&
      volg.omloop.lineFile === koppeling.lineFile &&
      volg.omloop.tourIndex === koppeling.tourIndex &&
      nuGevolgd.legs.some((leg) => vouw(leg.tripFile) === vouw(mem.tripName))
    ) {
      return
    }
    const was = voorkeur ? overlayDuty?.omsi : undefined
    if (was) {
      /*
       * Een poging om de volgorde recht te zetten. Klopt maar één volgorde,
       * dan komt er elke halve minuut precies dezelfde koppeling terug als die
       * er al ligt -- en dan stond hier elke 30 s "volgorde gecorrigeerd" in
       * het logboek, met "volgt OMSI" en nieuwe IBIS-codes erachter. Dezelfde
       * koppeling: niets opnieuw, niets gelogd. Een andere: dan pas de regel.
       */
      const nu = koppeling.duty?.omsi
      const zelfde =
        nu !== undefined &&
        nu.lineFile === was.lineFile &&
        nu.tourIndex === was.tourIndex &&
        nu.volgorde === was.volgorde &&
        nu.vanaf === was.vanaf &&
        nu.koppeling === was.koppeling
      if (zelfde) return
      if (koppeling.volgorde !== was.volgorde) {
        log(
          `vrij rijden: volgorde gecorrigeerd bij rit #${mem.tourEntry} ${mem.tripName.trim()} ` +
            `(was ${was.volgorde}, nu ${koppeling.volgorde ?? `koppeling ${koppeling.soort}`})`
        )
      }
    }
    pasKoppelingToe(rit, koppeling, live, keuze)
    return
  }

  /* Niet in deze dienstregeling. Past het op precies één andere kaart, dan rijdt OMSI daar. */
  const elders = await andereKaartVoor(rit, mem)
  if (vrijeRit !== rit || volg.sleutel !== sleutel) return
  if (elders) {
    try {
      const daar = await werkerVraag<Koppeling>({ soort: 'koppel', folder: elders, keuze, datum })
      if (vrijeRit !== rit) return
      if (daar.soort === 'index' || daar.soort === 'vertrek' || daar.soort === 'naam') {
        await wisselKaart(rit, elders, `lijn ${keuze.lineName.trim()} staat daar`)
        if (vrijeRit !== rit) return
        volg.sleutel = sleutel
        pasKoppelingToe(rit, daar, live, keuze)
        return
      }
    } catch (fout) {
      logFout('vrij rijden koppelen op een andere kaart', fout)
    }
  }
  if (koppeling.soort === 'rit' && koppeling.duty) {
    pasKoppelingToe(rit, koppeling, live, keuze)
    return
  }

  /* Nergens te vinden: de oude dienst hoort dan niet te blijven staan alsof hij klopt. */
  wisGevolgd()
  volg.sleutel = sleutel
  zetVrijeStaat({ soort: 'onbekend', line: mem.lineName.trim(), tour: mem.tourName.trim(), trip: mem.tripName.trim() }, true)
  if (!volg.onbekendGelogd.has(sleutel)) {
    volg.onbekendGelogd.add(sleutel)
    log(
      `vrij rijden: lijn ${mem.lineName.trim()} (#${mem.line}), omloop ${mem.tourName.trim()} (#${mem.tour}), ` +
        `rit ${mem.tripName.trim()} (#${mem.tourEntry}) staat niet in de dienstregeling van ${rit.mapName}`
    )
  }
}

/**
 * Wat een beeld van de overlay over vrij rijden meekrijgt, met de aanrijlijn:
 * staat de bus meer dan 150 m van de eerste halte van een rit die nog niet
 * begonnen is, dan een rechte lijn erheen met de afstand (fase 1: geen
 * route). Weg zodra de bus binnen 60 m is.
 */
function vrijBeeld(
  duty: Duty | undefined,
  status: ReturnType<typeof describeLive> | undefined,
  vehicle: VehiclePosition | undefined
): VrijBeeld | undefined {
  const rit = vrijeRit
  if (!rit || career?.activeDuty) return undefined
  const beeld: VrijBeeld = { kaart: rit.mapName, mapFolder: rit.mapFolder, staat: vrijStaat }
  if (volg.gewisseldVan && Date.now() - volg.gewisseldOp < 30_000) beeld.gewisseldVan = volg.gewisseldVan
  if (duty && vehicle && status && vrijStaat?.soort === 'gevolgd') {
    const leg = duty.legs[status.legIndex ?? 0]
    const legSleutel = leg ? `${leg.tripFile}@${leg.departure}` : ''
    if (leg && !leg.leer && (status.stopIndex ?? 0) === 0 && volg.aanrijBereikt !== legSleutel) {
      try {
        if (laag().kaartStaatKlaar(rit.mapFolder)) {
          const stops = mapGeometry(rit.mapFolder).stops
          const doel = leg.stopIds.map((id) => stops.find((stop) => stop.id === id)).find((stop) => stop !== undefined)
          if (doel) {
            const meters = Math.hypot(doel.x - vehicle.x, doel.y - vehicle.y)
            if (meters <= 60) volg.aanrijBereikt = legSleutel
            else if (meters > 150) {
              beeld.aanrij = {
                naar: doel.name,
                meters: Math.round(meters),
                punten: [vehicle.x, vehicle.y, doel.x, doel.y],
                gok: true
              }
            }
          }
        }
      } catch {
        // Zonder tekening geen aanrijlijn; de rest van de navigatie werkt gewoon.
      }
    }
  }
  return beeld
}

/**
 * De laatste controle per kaart, met alles erop en eraan. START krijgt van het
 * scherm alleen het nummer van het inzetpunt; zo staat de bus waar de voet het
 * zei, met de reden erbij voor het logboek (tegenlezing M6).
 */
const laatsteControle = new Map<string, VrijCheckVol>()

async function vrijeControle(folder: string, wanneer?: VrijWanneer): Promise<VrijCheckVol> {
  const uit = await werkerVraag<VrijCheckVol>({ soort: 'vrijcheck', folder, wanneer })
  laatsteControle.set(folder, uit)
  return uit
}

/**
 * Het wagenpark waarmee START de bus neerzet. Het scherm stuurt het voorstel
 * mee zodra de wagenparken van deze bus binnen zijn, maar die vraag staat in
 * de rij van de werker achter het busvoorstel en de controle (koud HamburgLi20
 * 1759 ms): wie binnen twee tellen na VERDER op START drukte, kreeg geen
 * wagenpark, en OMSI koos er zelf een -- met misschien de codes van een ander
 * `.hof` (tegenlezing 28-09). Hoort het genoemde wagenpark niet bij deze bus
 * (het scherm had nog die van de vorige), dan telt het ook niet. Dan hier het
 * voorstel van deze kaart, zoals `free:yards` het geeft.
 */
async function wagenparkVoorStart(folder: string, vehiclePath: string, gevraagd?: string): Promise<string | undefined> {
  try {
    const opties = await werkerVraag<YardOption[]>({
      soort: 'vrijewagenparken',
      folder,
      vehiclePath: String(vehiclePath),
      year: era(folder).year
    })
    if (gevraagd && opties.some((optie) => optie.name === gevraagd)) return gevraagd
    return opties.find((optie) => optie.suggested)?.name
  } catch (fout) {
    logFout('vrij rijden: het wagenpark bij START', fout)
    return gevraagd
  }
}

/** Het inzetpunt dat het scherm noemde, als het nog bestaat. Een halte (nummer -1) alleen uit de controle. */
function inzetpuntVoorStart(folder: string, nr: number): Beginplek | undefined {
  const bekend = laatsteControle.get(folder)?.plek
  if (bekend && bekend.nr === nr) return bekend
  if (nr < 0) return undefined
  const punt = leesInzetpunten(kaartPad(folder)).find((item) => item.nr === nr)
  return punt ? plekVanInzetpunt(punt, { bron: 'eerste', aantal: 0, klok: 0 }) : undefined
}

/** Een vrije rit afsluiten: de overlay dicht, en wat hij volgde weg. */
function stopVrijeRit(): void {
  if (!vrijeRit) return
  log(`vrij rijden gestopt: ${vrijeRit.mapName}`)
  vrijeRit = undefined
  vergeetVolgen()
  overlayDuty = undefined
  overlayIbis = undefined
  closeOverlay()
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
  const status = describeLive(live, duty, { ...start, verkocht: verkochtGeteld }, busApparaten(live))
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
  /*
   * De speeltijd van deze dienst. `elapsed` wordt negatief zodra de klok van
   * OMSI over middernacht springt -- om half een bij een start om half twaalf
   * is het -1380 -- en `gereden()` maakte van zo'n dienst een plafond van tien
   * kilometer. Eerst omrekenen, dan pas gebruiken.
   */
  const minuten = elapsed >= 0 ? elapsed : elapsed + 1440
  const ditDeel = gereden(live.km + live.metres / 1000 - start.odometerKm, minuten)
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
  const staat = rittenstaatVanDienst(duty)
  const busPad = lopend.vehicleOverride || bus?.relativePath
  const bedrijf = career.bedrijf
    ? boekEigenDienst(career.bedrijf, duty, staat, busPad, gemeten.stopsDone)
    : undefined
  career = completeDuty({ ...career, bedrijf }, duty, naam, {
    stopsDone: gemeten.stopsDone,
    drivenKm: gemeten.drivenKm,
    delayMinutes: gemeten.delayMinutes,
    harshBrakes: gemeten.harshBrakes,
    harshAccels: gemeten.harshAccels,
    tickets: gemeten.tickets,
    collisions: gemeten.collisions,
    fuelUsed: gemeten.fuelUsed
  }, staat, onderwegVanDienst(staat, gemeten))
  writeProfile(userData(), career)
}

/*
 * DE MEETLUS
 *
 * Elke seconde, zolang er een dienst rijdt, wat de plugin doorgeeft vastleggen
 * voor de rittenstaat (zie core/rittenstaat.ts). Los van `pushFrame`: die
 * draait alleen als de overlay open is of een toestel meekijkt, en een dienst
 * zonder overlay hoort net zo goed gemeten te worden. Om dezelfde reden valt
 * hier ook de nulmeting, die anders op het volgende beeld van de overlay wachtte.
 *
 * Het spoor gaat regel voor regel naar een bestand per dienst, zodat een crash
 * van de app niets weggooit; de stand tussen twee metingen staat alleen in het
 * geheugen, en na een herstart begint die gewoon opnieuw.
 */
let spoor: { sleutel: string; stand?: MeetStand } | undefined
let spoorFoutGemeld = false

/** Hoeveel sporen er bewaard blijven; genoeg om een proefrit na te lezen. */
const SPOREN_BEWAARD = 20

/** Het spoor van de dienst die loopt: per profiel en per keer aannemen. */
function spoorSleutel(): string | undefined {
  const actief = career?.activeDuty
  if (!career || !actief?.startedAt) return undefined
  return `${career.id ?? 'profiel'}-${actief.confirmedAt}`.replace(/[^\w-]/g, '-')
}

function spoorPad(sleutel: string): string {
  return join(userData(), 'ritten', `${sleutel}.jsonl`)
}

/**
 * De klok van het spel over middernacht doorgeteld, zoals de dienst hem kent:
 * een rit die om 01:10 aankomt staat als 1510 in de dienstregeling.
 */
function klokVoorDienst(klok: number, duty: Duty): number {
  const laatste = duty.legs[duty.legs.length - 1]?.arrival ?? 0
  return laatste > 1440 && klok + 1440 <= laatste + 60 ? klok + 1440 : klok
}

function meet(): void {
  const sleutel = spoorSleutel()
  const duty = (career?.activeDuty?.assignment as Assignment | undefined)?.duty
  if (!sleutel || !duty) {
    spoor = undefined
    return
  }
  const live = freshLive()
  if (!live) return
  captureBaseline(live)
  if (spoor?.sleutel !== sleutel) spoor = { sleutel }

  const status = describeLive(live, duty)
  const uitMenu = status.fromTimetable && status.halteOpNaam !== undefined
  const { stand, regels } = volgSpoor(spoor.stand, {
    klok: klokVoorDienst(status.clockMinutes, duty),
    rit: Math.max(0, status.legIndex),
    halte: uitMenu ? status.halteOpNaam : undefined,
    uitMenu,
    snelheid: live.velocity,
    reizigers: live.passengers,
    remmen: live.harshBrakes,
    optrekken: live.harshAccels,
    klappen: aanrijdingenGezien(live) ? live.collisions : undefined,
    wisselgeld: wisselgeldFouten,
    // Alle deuren (B3), als de plugin de deurgetallen gaf; zie `werkGetallenBij`.
    deuren: voertuiggetallenVan(live).deuren
  })
  const nieuw: SpoorRegel[] = spoor.stand
    ? regels
    : [{ t: 'begin', k: klokVoorDienst(status.clockMinutes, duty), dienst: dutyKeyOf(duty) }, ...regels]
  spoor.stand = stand
  // Langs een flitspaal gekomen? Dat hoort in hetzelfde spoor, bij de halte waar je heen reed.
  const flits = meetFlits(live, duty)
  if (flits) {
    nieuw.push({
      t: 'flits',
      k: klokVoorDienst(status.clockMinutes, duty),
      rit: Math.max(0, status.legIndex),
      halte: uitMenu ? status.halteOpNaam : undefined,
      ...flits
    })
    laatsteFlits = { ...flits, om: Date.now() }
    log(`Geflitst: ${flits.kmh} km/u waar ${flits.limiet} mag, boete ${flits.boete} euro`)
  }
  aanBoord = controleAanBoord(gebeurtenisVanDienst(), Math.max(0, status.legIndex), uitMenu ? status.halteOpNaam : undefined)
  if (nieuw.length === 0) return
  try {
    const pad = spoorPad(sleutel)
    mkdirSync(dirname(pad), { recursive: true })
    appendFileSync(pad, nieuw.map((regel) => JSON.stringify(regel)).join('\n') + '\n')
    /*
     * Er is iets gebeurd (een halte, een vertrek, een flits): de telling voor
     * de telefoon bijwerken. Alleen dan, want het spoor lezen is een bestand
     * lezen.
     */
    lopendeStaat = { sleutel, staat: rittenstaatVanDienst(duty, false) }
  } catch (fout) {
    // Eén keer melden: een volle schijf hoort niet elke seconde in het logboek.
    if (!spoorFoutGemeld) logFout('spoor van de dienst', fout)
    spoorFoutGemeld = true
  }
}

/**
 * De rittenstaat van de dienst die nu afgerond wordt, uit zijn spoor.
 *
 * Alleen als het spoor bij deze dienst hoort: na een wissel via de telefoon is
 * er een nieuw spoor, en de ritten van de oude dienst horen daar niet in.
 */
function rittenstaatVanDienst(duty: Duty, opruimen = true): Rittenstaat | undefined {
  const sleutel = spoorSleutel()
  if (!sleutel) return undefined
  try {
    const pad = spoorPad(sleutel)
    if (!existsSync(pad)) return undefined
    const regels = leesSpoor(readFileSync(pad, 'utf8'))
    const begin = regels.find((regel) => regel.t === 'begin')
    if (begin && begin.t === 'begin' && begin.dienst !== dutyKeyOf(duty)) return undefined
    return bouwRittenstaat(duty, regels)
  } catch (fout) {
    logFout('rittenstaat', fout)
    return undefined
  } finally {
    if (opruimen) ruimSporenOp()
  }
}

/** De rittenstaat van de lopende dienst tot nu toe, voor de telling op de telefoon. */
let lopendeStaat: { sleutel: string; staat?: Rittenstaat } | undefined

/*
 * ONDERWEG: FLITSPALEN EN GEBEURTENISSEN
 *
 * De regels staan in core/onderweg.ts; hier de toestand die erbij hoort. De
 * gebeurtenis van een dienst komt uit een zaad van profiel en aannametijd,
 * dus dezelfde dienst houdt dezelfde gebeurtenis, ook na een herstart.
 */
let gebeurtenisVan: { zaad: string; gebeurtenis?: Gebeurtenis } | undefined
function gebeurtenisVanDienst(): Gebeurtenis | undefined {
  const lopend = career?.activeDuty
  const duty = (lopend?.assignment as Assignment | undefined)?.duty
  if (!career || !lopend || !duty) return undefined
  const zaad = `${career.id ?? 'profiel'}|${lopend.confirmedAt}|${dutyKeyOf(duty)}`
  if (gebeurtenisVan?.zaad !== zaad) {
    gebeurtenisVan = { zaad, gebeurtenis: gebeurtenisVoor(duty, zaad, Boolean(lopend.exam)) }
  }
  return gebeurtenisVan.gebeurtenis
}

/** Zitten de controleurs nu in de bus; bijgehouden door de meetlus. */
let aanBoord = false

/**
 * De flitspalen van de kaart waarop gereden wordt. De kaart lezen gaat via de
 * werker en kan even duren; tot hij er is, flitst er niets.
 */
let flitsKaart: { sleutel: string; palen?: Flitspaal[] } | undefined
function palenVoor(duty: Duty): Flitspaal[] | undefined {
  const dichtheid = gebeurtenisVanDienst()?.soort === 'flitsactie' ? FLITS.dichtheidActie : FLITS.dichtheid
  const sleutel = `${duty.mapFolder}|${dichtheid}`
  if (flitsKaart?.sleutel !== sleutel) {
    const hier = { sleutel } as { sleutel: string; palen?: Flitspaal[] }
    flitsKaart = hier
    void geometrieVoor(duty.mapFolder)
      .then((kaart) => {
        hier.palen = flitspalen(kaart.limits, duty.mapFolder, dichtheid)
        log(`Flitspalen op ${duty.mapFolder}: ${hier.palen.length} van ${kaart.limits?.length ?? 0} borden`)
      })
      .catch((fout) => logFout('flitspalen', fout))
  }
  return flitsKaart.palen
}

let vorigePlek: { x: number; y: number } | undefined
const vlakGeflitst = new Set<number>()
/** De laatste flits, voor de melding op de telefoon. */
let laatsteFlits: (Flits & { om: number }) | undefined

function meetFlits(live: NonNullable<ReturnType<typeof freshLive>>, duty: Duty): Flits | undefined {
  const palen = palenVoor(duty)
  const plek = vehicleOnMap(live, duty)
  const van = vorigePlek
  vorigePlek = plek ? { x: plek.x, y: plek.y } : undefined
  if (!palen?.length || !plek || !van) return undefined
  return flitsControle(palen, van, plek, live.velocity, vlakGeflitst)
}

/** Wat onderweg gebeurde, voor het logboek. */
function onderwegVanDienst(staat: Rittenstaat | undefined, sessie: { harshBrakes?: number; harshAccels?: number; collisions?: number } | undefined) {
  return onderwegVan(gebeurtenisVanDienst(), staat, sessie ?? {})
}

/**
 * Wat de telefoon van onderweg ziet. De controleurs alleen zolang ze aan boord
 * zijn -- ze worden niet aangekondigd -- en een flits een halve minuut lang.
 */
function onderwegVoorTelefoon(): OnderwegBeeld | undefined {
  const g = gebeurtenisVanDienst()
  const flits = laatsteFlits && Date.now() - laatsteFlits.om < 30_000 ? laatsteFlits : undefined
  const gebeurtenis = g && (g.soort !== 'controle' || aanBoord) ? g : undefined
  if (!gebeurtenis && !flits) return undefined
  const staat = lopendeStaat?.sleutel === spoorSleutel() ? lopendeStaat?.staat : undefined
  const duty = (career?.activeDuty?.assignment as Assignment | undefined)?.duty
  return {
    gebeurtenis,
    uitstapHalte: gebeurtenis?.soort === 'controle' ? duty?.legs[gebeurtenis.rit ?? 0]?.stops[gebeurtenis.tot ?? 0] : undefined,
    stiptheid: staat ? { goed: staat.vastGemeten - staat.teVroeg - staat.teLaat, vroeg: staat.teVroeg, laat: staat.teLaat } : undefined,
    flitsen: staat?.flitsen?.length ?? 0,
    flits: flits ? { kmh: flits.kmh, limiet: flits.limiet, boete: flits.boete, om: flits.om } : undefined
  }
}

/** De oudste sporen weg; de laatste blijven staan om een proefrit na te lezen. */
function ruimSporenOp(): void {
  try {
    const map = join(userData(), 'ritten')
    const sporen = readdirSync(map)
      .filter((naam) => naam.endsWith('.jsonl'))
      .map((naam) => ({ naam, tijd: statSync(join(map, naam)).mtimeMs }))
      .sort((a, b) => a.tijd - b.tijd)
      .map(({ naam }) => naam)
    for (const naam of sporen.slice(0, Math.max(0, sporen.length - SPOREN_BEWAARD))) {
      rmSync(join(map, naam), { force: true })
    }
  } catch {
    // Opruimen is geen zaak om een dienst voor te laten mislukken.
  }
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

  const draait = await isOmsiRunning(`${OMSI_PROCES}.exe`)
  const netAf = omsiDraaide && !draait
  omsiDraaide = draait
  // Het 3D-venster gaat in de lichte stand zolang OMSI draait (bus3d-ontwerp §9).
  bus3dVenster?.omsiGewijzigd(draait)
  if (netAf) meldPluginLogboek('OMSI is net afgesloten')
  if (!netAf || !klaargezet) return
  try {
    const startup = presetStartup(omsi(), klaargezet.mapFolder, klaargezet.file)
    if (startup.weerFout) log(`startscherm hersteld, maar het weer niet: ${startup.weerFout}`)
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

/**
 * Waar de bus van de speler op de kaart staat, als OMSI dat laat lezen. De kaart
 * is die van de dienst, of bij een vrije rit zonder omloop die van de rit: de
 * navigatie hoort dan al te werken, alleen nog zonder opgelichte route.
 */
function vehicleOnMap(live: ReturnType<typeof readLive>, duty: Duty | undefined): VehiclePosition | undefined {
  const kaart = duty?.mapFolder ?? (career?.activeDuty ? undefined : vrijeRit?.mapFolder)
  if (!live?.alive || live.mem?.ok !== 1 || !kaart) return undefined
  try {
    let tracker = vehicleTrackers.get(kaart)
    if (!tracker) {
      // Het pad, niet map(kaart): dat laadt de hele dienstregeling in het hoofdproces.
      tracker = new VehicleTracker(join(omsi(), 'maps', kaart))
      vehicleTrackers.set(kaart, tracker)
    }
    const network = laneNetwork(kaart)
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
  if (!duty && !vrijeRit) return ''
  /*
   * Vrij rijden volgt de omloop die je in OMSI kiest; dan verandert de dienst
   * onderweg, en hoort de aanmelding te blijven staan. Hij hangt dan aan de
   * vrije rit zelf.
   */
  if (vrijeRit && !career?.activeDuty) return `vrij${vrijeRitten}`
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
    pinLengte: career?.pincode?.length ?? 0,
    wisselbaar: wisselbareDienst() !== undefined
  }
}

/** Wat er op de telefoon gebeurt, hoort meteen in de overlay en op het toestel te staan. */
function telefoonGewijzigd(): void {
  bewaarTelefoon()
  lastFrame = undefined
  pushFrame()
}

/**
 * Het laatste aanbod aan andere diensten, zoals de telefoon het te zien kreeg.
 *
 * De telefoon kiest er met een volgnummer uit en stuurt geen dienst terug: een
 * tablet op het netwerk kan zo niets anders laten aannemen dan wat hier stond.
 */
let wisselAanbod: { sleutel: string; diensten: Assignment[] } | undefined

/** Hoeveel diensten de telefoon aanbiedt; meer past niet op het scherm zonder zoeken. */
const WISSEL_AANTAL = 6

/**
 * De aangenomen dienst, als de chauffeur die hier mag ruilen. Niet bij een
 * examen -- dat hoort bij één lijn -- en niet als de overlay iets anders rijdt
 * dan wat er aangenomen is: dan is er niets om tegen te ruilen.
 */
function wisselbareDienst(): Assignment | undefined {
  const actief = career?.activeDuty
  if (!actief || actief.exam) return undefined
  const aangenomen = actief.assignment as Assignment | undefined
  if (!aangenomen?.duty) return undefined
  const lopend = currentDuty()
  if (lopend && aanmeldSleutelVan(lopend) !== aanmeldSleutelVan(aangenomen.duty)) return undefined
  return aangenomen
}

/**
 * Andere diensten die nu nog te rijden zijn, terwijl OMSI al draait.
 *
 * WAAROM DIT ER IS
 * Een gebruiker: "wenn man eine Fahrt ändern möchte, wäre es praktisch, wenn
 * man direkt im Menü eine andere Tour auswählen bzw. annehmen könnte, ohne
 * dafür jedes Mal OMSI beenden und neu starten zu müssen." Het kon al --
 * annuleren, een nieuwe kiezen, "meerijden" -- maar dat liep over drie
 * schermen van de app, terwijl je in de bus zit met de telefoon voor je neus.
 *
 * WAT HET AANBOD BEPAALT
 * Het spel loopt al, dus de klok en de datum liggen vast. Een omloop die
 * vandaag niet rijdt staat niet in het dienstregelingsmenu van OMSI, en een
 * dienst die al vertrokken is, is geen keuze meer. Vandaar: vertrek vanaf de
 * klok van het spel tot twee uur later, op de dag die OMSI nu speelt, op
 * dezelfde kaart en ongeveer even lang als de dienst die er nu staat. In de
 * carrière alleen op lijnen met een vergunning, net als in het keuzescherm.
 */
async function dienstAanbod(): Promise<WisselAanbod> {
  const aangenomen = wisselbareDienst()
  if (!aangenomen) return { diensten: [], reden: 'niet' }
  const oud = aangenomen.duty
  const folder = oud.mapFolder

  const live = freshLive()
  const speelt = live?.alive === true && live.year > 0 && live.month > 0 && live.day > 0
  const klok = speelt ? Math.floor(live.time / 60) : undefined
  const datum = speelt
    ? new Date(Date.UTC(live.year, live.month - 1, live.day))
    : aangenomen.date?.iso
      ? new Date(`${aangenomen.date.iso}T00:00:00Z`)
      : undefined

  const request: DutyRequest = {
    mapFolder: folder,
    targetMinutes: Math.max(30, oud.end - oud.start),
    window: 'heledag',
    // Zonder klok van het spel: rond de dienst die er stond.
    earliestStart: klok ?? oud.start - 60,
    latestStart: (klok ?? oud.start) + 120,
    lineFiles:
      career?.activeDuty?.mode === 'career'
        ? (career.licences ?? [])
            .filter((vergunning) => vergunning.mapFolder === folder)
            .map((vergunning) => vergunning.lineFile)
        : undefined
  }

  let gevonden: Assignment[]
  try {
    gevonden = await werkerVraag<Assignment[]>({ soort: 'diensten', request })
  } catch (fout) {
    logFout('andere diensten via de werker', fout)
    gevonden = laag().diensten(request)
  }

  const kalender = laag().kalender(folder)
  const huidig = dienstSleutelVan(oud)
  const diensten = gevonden
    .filter(({ duty }) => dienstSleutelVan(duty) !== huidig)
    .filter(({ duty }) => !datum || runsOn(duty.days | duty.period, datum, kalender))
    .sort((a, b) => a.duty.start - b.duty.start)
    .slice(0, WISSEL_AANTAL)

  wisselAanbod = { sleutel: aanmeldSleutelVan(oud), diensten }
  log(
    `andere diensten voor ${folder}: ${diensten.length} van ${gevonden.length}` +
      (klok !== undefined ? ` vanaf ${formatTime(klok)}` : ' (geen klok van OMSI)')
  )
  return {
    diensten: diensten.map(({ duty }, nr) => ({
      nr,
      lijnen: duty.lineNumbers.join(' / ') || duty.legs[0]?.lineNumber || '',
      omloop: duty.tourNumber,
      start: duty.start,
      eind: duty.end,
      ritten: duty.legs.length,
      vanaf: duty.legs[0]?.stops[0] ?? ''
    })),
    reden: diensten.length === 0 ? 'geen' : undefined
  }
}

/**
 * Een dienst uit het aanbod aannemen in plaats van de huidige.
 *
 * Het is geannuleerd en opnieuw aangenomen in één handeling, met "meerijden"
 * erachter: OMSI draait al, dus er wordt niets klaargezet, en de chauffeur
 * kiest de omloop zelf in het dienstregelingsmenu -- de telefoon zegt welke.
 * Wat er van de oude dienst gereden is, wordt niet geboekt, net als bij
 * annuleren. De bus blijft dezelfde: daar zit je in.
 *
 * Aangemeld blijf je, want je bent dezelfde chauffeur in dezelfde bus. Tekenen
 * moet opnieuw: het is een andere opdracht.
 */
function wisselDienst(nr: number): boolean {
  const aangenomen = wisselbareDienst()
  const actief = career?.activeDuty
  if (!career || !actief || !aangenomen) return false
  if (!wisselAanbod || wisselAanbod.sleutel !== aanmeldSleutelVan(aangenomen.duty)) return false
  const nieuw = Number.isInteger(nr) ? wisselAanbod.diensten[nr] : undefined
  if (!nieuw) return false

  const busPad =
    actief.vehicleOverride || aangenomen.vehicle?.relativePath || nieuw.vehicle?.relativePath || ''
  let ibis: IbisPlan | undefined
  if (busPad) {
    try {
      ibis = buildIbisPlan(omsi(), busPad, nieuw.duty, era(nieuw.duty.mapFolder).year, overlayIbis?.yard)
    } catch (fout) {
      logFout('IBIS-codes voor de andere dienst', fout)
    }
  }

  const nu = new Date().toISOString()
  persist({
    ...career,
    activeDuty: {
      assignment: nieuw,
      vehicleOverride: busPad,
      confirmedAt: nu,
      mode: actief.mode,
      // Er wordt al gereden; de nulmeting komt bij de volgende verse stand.
      startedAt: actief.startedAt ? nu : undefined
    }
  })
  captureBaseline()

  overlayDuty = nieuw.duty
  overlayIbis = ibis
  wisselAanbod = undefined
  // Zoals bij meerijden: wat er voor de oude dienst klaarstond, geldt niet meer.
  klaargezet = undefined

  const aangemeld = telefoon.aangemeld
  telefoon = telefoonVoor(telefoonSleutel())
  telefoon.aangemeld = aangemeld
  telefoonGewijzigd()

  log(
    `Andere dienst via de telefoon: omloop ${aangenomen.duty.tourNumber} ` +
      `(${formatTime(aangenomen.duty.start)}) wordt ${nieuw.duty.tourNumber} ` +
      `(${formatTime(nieuw.duty.start)}) op ${nieuw.duty.mapFolder}`
  )
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('dienst:gewisseld', careerPayload())
  }
  return true
}

/**
 * Nummer en pincode nakijken.
 *
 * Zonder pincode gaat het alleen om het nummer; dat is de eerste stap op het
 * cijferblok. Tien misslagen in een minuut en het antwoord blijft even "fout":
 * een pincode van vier cijfers is over het netwerk anders zo geraden, en dit
 * kost een chauffeur die zich vertikt niets.
 */
/*
 * Een toets van OMSI laten indrukken.
 *
 * Het kaartje geven en het wisselgeld teruggeven zijn dingen van het spel, en
 * het spel doet ze op een toets. De app kan die toets niet zelf afgeven -- dan
 * komt hij in het venster dat vooraan staat, en dat hoeft OMSI niet te zijn --
 * maar de plugin draait ín OMSI en mag dat wel. Dus schrijft de app een regel
 * in `opdracht.txt` naast live.json: een volgnummer, de scancode en de
 * modifiers zoals ze in `Inputs\keyboard.cfg` staan. Heeft de speler de toets
 * zelf veranderd, dan gaat die verandering vanzelf mee.
 */
let opdrachtNr = 0

function omsiToets(actie: string): boolean {
  /*
   * De naam waar het busscript op luistert. De telefoon stuurt hem zoals hij in
   * het model van de bus staat (`IBIS_7`, `ticketprinter_button_enter`); de
   * oude namen uit `OMSI_TOETSEN` blijven werken voor de vaste knoppen van de
   * app zelf. Wat deze bus niet heeft, gebeurt niet -- zie `toegestaneActies`.
   */
  const naam = (OMSI_TOETSEN as Record<string, string>)[actie] ?? actie
  if (!naam || (!toegestaneActies.has(naam.toLowerCase()) && !schermActies().has(naam))) {
    log(`toets ${naam || actie} hoort niet bij deze bus; niet ingedrukt`)
    return false
  }
  let scancode = 0
  let modifiers = 0
  try {
    const binding = readKeyboard(omsi()).find((item) => item.action === naam)
    if (!binding) {
      log(`toets ${naam} staat niet in keyboard.cfg`)
      return false
    }
    scancode = binding.scancode
    modifiers = binding.modifiers
  } catch (fout) {
    logFout('keyboard.cfg lezen', fout)
    return false
  }
  /*
   * F10 en Shift+` pakt Windows (of Discord) zelf op, en dan staat OMSI stil
   * tot je klikt; zie verbodenToets in core/bustoetsen.ts. Liever een knop die
   * niets doet: zodra OMSI dicht is verhuist de app hem naar een andere toets.
   */
  if (verbodenToets(scancode, modifiers)) {
    log(`toets ${naam} staat op ${scancode}/${modifiers}, een toets van Windows; niet ingedrukt`)
    return false
  }
  opdrachtNr += 1
  try {
    writeFileSync(join(liveMap(), 'opdracht.txt'), `${opdrachtNr} ${scancode} ${modifiers}\n`)
    return true
  } catch (fout) {
    logFout('opdracht schrijven', fout)
    return false
  }
}

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

/*
 * EEN SPOOR VAN DE KAARTVERKOOP
 *
 * De verkoop en het schermpje van de bus komen uit het geheugen van OMSI, en of
 * dat op een andere pc net zo ligt, blijkt pas in het spel. Daarom schrijft de
 * app op wat de plugin doorgeeft zodra het verandert: welke plugin, wie er aan
 * de balie staat, welk kaartje, wat het kost en wat er gegeven is. Eén regel per
 * verandering, zodat het logboek niet volloopt.
 */
let vorigSpoor = ''

/*
 * HOEVEEL KAARTJES ER VERKOCHT ZIJN
 *
 * OMSI telt dat nergens. Wat het spel doorgeeft is `GivenTicket`: de plek van
 * het kaartsoort dat op dat moment gekozen staat, of -1 als er niets staat. De
 * app las dat als een teller, en schreef dus aan het eind van een dienst het
 * NUMMER van het laatst gekozen kaartje op als "kaartjes verkocht".
 *
 * Hier wordt het echt geteld: elke keer dat er iemand aan de deur afrekent en
 * het spel die verkoop afrondt, telt er een kaartje bij. De teller loopt per
 * dienst; `kassaVoorDienst` zet hem terug als er een nieuwe dienst begint.
 *
 * ZONDER DAT IEMAND MEEKIJKT (B6)
 * Dit telde eerst in `pushFrame`, en dat beeld wordt alleen gemaakt als de
 * overlay openstaat of een telefoon of tablet meekijkt. Wie met de overlay
 * dicht reed, verkocht voor de app niets: nul kaartjes in het logboek, geen
 * wisselgeldfouten voor de controleurs. Nu telt `snelleLus`, vier keer per
 * seconde, wat er ook openstaat (scripts/probe-verkoopzonderoverlay.cjs). Een
 * verkoop duurt tellen, dus een kwart seconde mist er geen.
 */
let verkochtGeteld = 0
let vorigeKoper = -1
/**
 * Verkopen met te weinig wisselgeld, opgeteld over de hele sessie. Een teller
 * die alleen oploopt, zoals remmen en optrekken: de meetlus schrijft het
 * verschil in het spoor, en de controleurs tellen het (core/onderweg.ts).
 */
let wisselgeldFouten = 0
let slechtBijDezeKoper = false

function telVerkoop(live: ReturnType<typeof readLive>): void {
  const mem = live?.mem
  if (!mem || mem.ok !== 1) return
  const koper = mem.koper ?? -1
  /*
   * Een verkoop is afgelopen als de persoon bij de deur weggaat terwijl er een
   * prijs stond. Op `klaar` wachten kan niet: dat vlaggetje staat er maar een
   * paar beelden, en bij een kaartje dat niet betaald hoeft te worden helemaal
   * niet.
   */
  if (vorigeKoper >= 0 && koper !== vorigeKoper && (mem.ticketPrijs ?? 0) >= 0) {
    verkochtGeteld += 1
    if (slechtBijDezeKoper) wisselgeldFouten += 1
  }
  /*
   * Het vlaggetje voor slecht wisselgeld staat er maar even; onthouden of het
   * tijdens deze verkoop ooit aan stond.
   */
  if (koper !== vorigeKoper) slechtBijDezeKoper = false
  if ((mem.ticketSlecht ?? 0) > 0) slechtBijDezeKoper = true
  vorigeKoper = koper
}

function spoorVanDeVerkoop(live: ReturnType<typeof readLive>): void {
  const mem = live?.mem
  if (!mem) return
  const spoor = [
    `plugin=${live?.plugin ?? '?'}`,
    `koper=${mem.koper ?? '?'}`,
    `kaartje=${mem.ticketIndex ?? '?'}`,
    `prijs=${mem.ticketPrijs ?? '?'}`,
    `gegeven=${mem.ticketGegeven ?? '?'}`,
    `klaar=${mem.ticketKlaar ?? '?'}`,
    `opdracht=${mem.opdracht ?? '?'}/${mem.opdrachtFout ?? '?'}`,
    `afr="${(live?.ibis?.afr1 ?? '').slice(0, 40)}"`,
    `lawo="${(live?.ibis?.lawo1 ?? '').slice(0, 40)}"`
  ].join(' ')
  if (spoor === vorigSpoor) return
  vorigSpoor = spoor
  log(`verkoop: ${spoor}`)
}

/*
 * DE SCHERMPJES VAN DE BUS DIE RIJDT
 *
 * De plugin zegt welke bus er onder je zit; in zijn `model.cfg` staat welke
 * schermpjes erin zitten en welke stringvariabele elk van ze vult (zie
 * core/busscherm.ts). Die indeling wordt een keer per bus van schijf gelezen --
 * hij verandert niet zolang je in dezelfde bus zit -- en de namen eruit gaan
 * naar de plugin, die ze in het geheugen opzoekt en terugstuurt in `vars`.
 *
 * Zo hoeft er voor een nieuwe bus niets in de app bij, en hoeft OMSI ook niet
 * opnieuw op: de oude weg langs de .opl kon alleen namen lezen die al bij het
 * starten van het spel bekend waren.
 */
const schermenPerBus = new Map<string, Busapparaat[]>()
let vorigeVragen = ''

/*
 * Een lege uitkomst mag niet blijven hangen.
 *
 * `[]` is waar in JavaScript, dus een bus die één keer geen model.cfg opleverde
 * -- een half gevuld pad tijdens het laden, of Defender die het bestand een tel
 * vasthoudt -- bleef de hele sessie zonder schermpjes en zonder apparaten. Nu
 * wordt zo'n lezing na tien tellen nog eens geprobeerd.
 */
const LEEG_OPNIEUW_MS = 10000
/** En hoe vaak; een bus die werkelijk niets heeft hoeft niet eeuwig herlezen. */
const LEEG_POGINGEN = 3
const leegSinds = new Map<string, { sinds: number; pogingen: number }>()

/** Waar of de vorige lezing leeg was en het lang genoeg geleden is. */
function nogEensProberen(sleutel: string, aantal: number): boolean {
  const nu = Date.now()
  if (aantal > 0) {
    leegSinds.delete(sleutel)
    return false
  }
  const stand = leegSinds.get(sleutel)
  if (stand === undefined) {
    leegSinds.set(sleutel, { sinds: nu, pogingen: 0 })
    return false
  }
  if (stand.pogingen >= LEEG_POGINGEN || nu - stand.sinds < LEEG_OPNIEUW_MS) return false
  leegSinds.set(sleutel, { sinds: nu, pogingen: stand.pogingen + 1 })
  return true
}

function busApparaten(live: LiveData | undefined): Busapparaat[] | undefined {
  const bus = live?.bus
  if (!bus || (!bus.pad && !bus.model && !bus.bestand)) return undefined
  let omsiMap: string
  try {
    omsiMap = omsi()
  } catch {
    /* Geen installatie gevonden: dan valt er ook geen model.cfg te lezen. */
    return undefined
  }
  const sleutel = `${bus.pad}|${bus.model}|${bus.bestand}`
  let apparaten = schermenPerBus.get(sleutel)
  if (!apparaten || nogEensProberen(`schermen:${sleutel}`, apparaten.length)) {
    apparaten = apparatenVanBus(omsiMap, bus)
    schermenPerBus.set(sleutel, apparaten)
    log(
      `bus: ${bus.naam || '?'} (${bus.model || bus.bestand || bus.pad}) -- ${apparaten.length} schermpjes: ` +
        apparaten.map((a) => `${a.naam}x${a.variabelen.length}`).join(', ')
    )
  }

  /*
   * En zeggen wat we willen zien. De schermpjes eerst, daarna de namen die de
   * kaartautomaat op zijn knoppen heeft -- die hangen niet aan een textuur en
   * staan dus niet in de model.cfg, maar wel in de lijst die de plugin van de
   * bus doorgeeft (schermen.json).
   */
  /*
   * WAT DE PLUGIN MOET OPZOEKEN, IN DEZE VOLGORDE
   *
   * De plugin neemt er `VRAGEN_MAX` aan; wat verder in de lijst staat valt
   * eraf, zonder klacht. Dus komt vooraan waar de speler naar kijkt: de
   * apparaten die hij zelf in de telefoon gezet heeft. Stond dat achteraan, dan
   * viel bij een volle bus juist het apparaat weg waar het om ging en bleef zijn
   * scherm leeg.
   */
  const namen: string[] = []
  const erbij = (naam: string): void => {
    if (naam && !namen.includes(naam)) namen.push(naam)
  }
  const gekozen = new Set(gekozenModules(bus))
  const modules = busModules(live)
  const modelcfg = modelcfgVanBus(omsiMap, bus)
  const gekozenModulesNu = modules.filter((module) => gekozen.has(module.id))
  /*
   * De nagebouwde schermen eerst: hun teksten en de namen van de plaatjes die
   * het script kiest (shared/scherm.ts), en daarnaast de getalvariabelen die
   * zeggen welk menu er aanstaat en waar een onderdeel ligt. Die laatste gaan
   * in een eigen bestand naar de plugin (plugin 13 en hoger).
   */
  if (modelcfg) {
    for (const naam of schermStringsVoor(modelcfg, gekozenModulesNu)) erbij(naam)
    schermGetallenNu = { bus: busGetalSleutel(bus), namen: schermGetallenVoor(modelcfg, gekozenModulesNu) }
  }
  werkGetallenBij(live)
  for (const module of gekozenModulesNu) {
    for (const naam of module.variabelen) erbij(naam)
  }
  for (const apparaat of apparaten) for (const naam of apparaat.variabelen) erbij(naam)
  /*
   * De namen op de knoppen van de kaartautomaat hangen aan geen enkele textuur
   * -- ze staan niet in de model.cfg -- maar ze zijn er wel, en de kaartverkoop
   * wil ze tonen. Welke er te verwachten zijn, hangt af van welke automaat er
   * in deze bus zit; zie `kaartnamenVan` in core/live.ts.
   */
  const soorten = apparaten.map((apparaat) => apparaat.naam.toLowerCase())
  if (soorten.some((naam) => naam.startsWith('afr'))) {
    for (let i = 0; i < 10; i++) erbij(`afr_ticketname_${i}`)
  }
  if (soorten.some((naam) => naam.startsWith('atron'))) {
    for (let i = 1; i <= 8; i++) erbij(`atron_ticket${i}`)
  }

  /*
   * En de schermpjes van de apparaten die de app uit het model samenstelt
   * (core/busmodule.ts). Zonder deze vroeg de app die namen nooit op, en bleef
   * een toegevoegd apparaat -- de ALMEX van een Hamburgse bus -- zwart: hij
   * stond er wel, maar er kwam geen tekst in.
   */
  for (const module of modules) for (const naam of module.variabelen) erbij(naam)

  const alles = leesSchermen()
  for (const naam of Object.keys(alles?.vars ?? {})) {
    if (/ticketname|_ticket\d|zifferneingabe|eingabe/i.test(naam)) erbij(naam)
  }
  /*
   * Het wisselsignaal moet over dezelfde lijst gaan als wat er weggeschreven
   * wordt. Keek dit naar de eerste vierenzestig, dan werd een verandering in de
   * staart -- en daar staan juist de namen die er later bijkomen -- nooit
   * doorgegeven.
   */
  const vraag = namen.slice(0, VRAGEN_MAX).join('\n')
  if (vraag !== vorigeVragen) {
    vorigeVragen = vraag
    schrijfVragen(namen)
  }
  return apparaten
}

/*
 * DE GETALLEN DIE DE PLUGIN MOET DOORGEVEN (getallen.txt)
 *
 * Drie bronnen, in deze volgorde (`getallenlijst` in core/live.ts): de
 * systeemgetallen van elk voertuig -- alle deuren, binnentemperatuur, vuil,
 * grondsnelheid, vering; B3 --, de getallen van de nagebouwde schermen die de
 * speler in de telefoon zette, en in de meetstand de ruime set uit de varlists
 * van de bus. De plugin neemt er 512; wat erbuiten valt staat in
 * `getallenAfgevallen` en in het logboek. De 37 vooraan verdringen geen
 * scherm: nagemeten op 29-09 is de grootste schermlijst van alle geïnstalleerde
 * bussen 227 (alle apparaten van een o530 samen), dus 264 met de deuren erbij.
 *
 * Eerst schreef alleen `busApparaten` dit bestand, en die loopt alleen als de
 * overlay, een toestel of het rijscherm kijkt. De deuren horen ook in het
 * ritspoor van een dienst zonder overlay; daarom loopt dit ook elke seconde in
 * de meetlus. `schrijfGetallen` schrijft alleen als de lijst verandert.
 */
/** De getallen van de schermen, per bus (dezelfde sleutel als `schermenPerBus`). */
let schermGetallenNu: { bus: string; namen: string[] } | undefined
let getallenAfgevallen: string[] = []
let afgevallenGemeld = ''

function busGetalSleutel(bus: NonNullable<LiveData['bus']>): string {
  return `${bus.pad}|${bus.model}|${bus.bestand}`
}

function werkGetallenBij(live: LiveData | undefined): void {
  const sleutel = live?.bus ? busGetalSleutel(live.bus) : ''
  const scherm = schermGetallenNu && schermGetallenNu.bus === sleutel ? schermGetallenNu.namen : []
  const meet = meetstandAan ? meetNamenVoor(live).namen : []
  const { namen, afgevallen } = getallenlijst({ scherm, meet })
  getallenAfgevallen = afgevallen
  const melding = afgevallen.join('|')
  if (melding !== afgevallenGemeld) {
    afgevallenGemeld = melding
    if (afgevallen.length > 0) {
      log(`getallen: ${afgevallen.length} vielen buiten de ${GETALLEN_MAX}, o.a. ${afgevallen.slice(0, 8).join(', ')}`)
    }
  }
  schrijfGetallen(namen)
}

/*
 * DE MEETSTAND (ronde 0 van de voorvallen; core/meetstand.ts)
 *
 * Een instelling voor de ontwikkelaar, standaard uit. Aan: de plugin krijgt de
 * scriptnamen van de bus te vragen, en `snelleLus` schrijft tijdens een dienst
 * of vrije rit elke 250 ms een regel naar `metingen/` in de gebruikersmap. De
 * afvinklijst staat op de telefoon; "Meting opslaan" maakt er één zip van.
 */
let meetstandAan = false
/** Of er op dit moment geschreven wordt; voor het beeld op de telefoon. */
let meetLooptNu = false
let meetsessie: Meetsessie | undefined
/** Eén keer melden: vier keer per seconde dezelfde fout hoort niet in het logboek. */
let meetFoutGemeld = false
const varlistPerBus = new Map<string, { namen: string[]; bestanden: string[] }>()

function meetsessieNu(): Meetsessie {
  meetsessie ??= new Meetsessie(join(userData(), 'metingen'), () => join(liveMap(), 'getallen.json'), Date.now, log)
  return meetsessie
}

/** Wat de meting bovenop de systeemgetallen vraagt: de vering en de scriptnamen van deze bus. */
function meetNamenVoor(live: LiveData | undefined): { namen: string[]; varlists: string[] } {
  const bus = live?.bus
  if (!bus || (!bus.pad && !bus.bestand)) return { namen: [...MEET_EXTRA], varlists: [] }
  const sleutel = busGetalSleutel(bus)
  let lijst = varlistPerBus.get(sleutel)
  if (!lijst) {
    try {
      lijst = varlistVanBus(omsi(), bus)
    } catch (fout) {
      logFout('meetstand: varlists lezen', fout)
      lijst = { namen: [], bestanden: [] }
    }
    varlistPerBus.set(sleutel, lijst)
    log(`meetstand: ${bus.naam || bus.pad}: ${lijst.namen.length} namen uit ${lijst.bestanden.length} varlists`)
  }
  return { namen: meetGetallenVoor(lijst.namen), varlists: lijst.bestanden }
}

/** Het beeld voor de telefoon en het instellingenscherm; niets als de meetstand uit staat. */
function metingBeeld(): MetingBeeld | undefined {
  return meetstandAan ? meetsessieNu().beeld(meetLooptNu) : undefined
}

/** Eén regel van de meting, als er gemeten wordt. */
function meetstandRegel(live: LiveData | undefined): void {
  const rijdt = Boolean(career?.activeDuty?.startedAt) || Boolean(vrijeRit)
  meetLooptNu = meetstandAan && rijdt && Boolean(live?.alive)
  if (!meetLooptNu || !live) return
  const duty = currentDuty()
  const status = describeLive(live, duty, nulmeting())
  const { namen, varlists } = meetNamenVoor(live)
  try {
    meetsessieNu().schrijf(
      { live, status, verkocht: verkochtGeteld },
      {
        modus: career?.activeDuty?.startedAt ? 'dienst' : 'vrij',
        kaart: duty?.mapFolder ?? vrijeRit?.mapFolder,
        appVersie: __APP_VERSION__,
        gevraagd: namen,
        afgevallen: getallenAfgevallen,
        varlists
      }
    )
  } catch (fout) {
    if (!meetFoutGemeld) logFout('meetstand', fout)
    meetFoutGemeld = true
  }
}

/**
 * "Meting opslaan": de zip, met de ritsporen erbij van de diensten die tijdens
 * de meting reden (ronde 0 wil ook zien hoe de rittenstaat de haltes telde).
 * Onder een eigen naam: de naam op schijf draagt de id van het profiel.
 */
function slaMetingOp(): string | undefined {
  const extra: Array<{ naam: string; pad: string }> = []
  const sinds = meetsessieNu().begonnenOp
  const lopend = spoorSleutel()
  try {
    const map = join(userData(), 'ritten')
    const sporen = existsSync(map)
      ? readdirSync(map)
          .filter((naam) => naam.endsWith('.jsonl'))
          .map((naam) => ({ pad: join(map, naam), tijd: statSync(join(map, naam)).mtimeMs }))
          .filter(({ pad, tijd }) => (sinds !== undefined && tijd >= sinds) || (lopend !== undefined && pad === spoorPad(lopend)))
          .sort((a, b) => a.tijd - b.tijd)
      : []
    sporen.forEach(({ pad }, i) => extra.push({ naam: `spoor-dienst-${i + 1}.jsonl`, pad }))
  } catch (fout) {
    logFout('meting opslaan: sporen', fout)
  }
  try {
    return meetsessieNu().opslaan(extra)
  } catch (fout) {
    logFout('meting opslaan', fout)
    return undefined
  }
}

/*
 * DE SNELLE LUS
 *
 * Vier keer per seconde, wat er ook openstaat: de kaartverkoop tellen (B6) en,
 * in de meetstand, een regel meten. Eén lezing van live.json voor allebei.
 */
function snelleLus(): void {
  const live = freshLive()
  kassaVoorDienst()
  spoorVanDeVerkoop(live)
  telVerkoop(live)
  if (meetstandAan) meetstandRegel(live)
  else meetLooptNu = false
}

/*
 * Welke knoppen van de apparaten in de bus aan een toets hangen.
 *
 * Eens per vijf tellen nagekeken: het verandert alleen als iemand keyboard.cfg
 * aanpast, en dat is meestal de app zelf.
 */
let knoppenStand: { beschikbaar: string[]; straks?: number } | undefined
let knoppenGekeken = 0

function busknoppen(): { beschikbaar: string[]; straks?: number } {
  const nu = Date.now()
  if (knoppenStand && nu - knoppenGekeken < 5000) return knoppenStand
  knoppenGekeken = nu
  let acties: string[] = []
  try {
    /*
     * Alles wat de telefoon kan indrukken en werkelijk in keyboard.cfg staat --
     * de cijfers van de IBIS staan er van huis uit in, dus die horen niet grijs.
     * Zie `bruikbareToetsen`: een knop op een onbewezen toetscombinatie telt
     * niet mee.
     */
    acties = actiesVoorBusknoppen()
    knoppenStand = { beschikbaar: bruikbareToetsen(omsi(), acties) }
  } catch {
    knoppenStand = { beschikbaar: [] }
  }
  /* Staan de knoppen van deze bus klaar om bijgeschreven te worden, dan hoort de telefoon dat. */
  const straks = straksVanDezeBus(acties, knoppenStand.beschikbaar)
  if (straks > 0) knoppenStand.straks = straks
  return knoppenStand
}

/**
 * Hoeveel knoppen van de bus die nu rijdt al klaarstaan om bijgeschreven te
 * worden -- maar alleen als dat ALLE knoppen zijn die nog geen toets hebben.
 * Anders nul, en dan staat de knop om ze aan een toets te hangen er weer.
 *
 * Tot 26-09 telde dit de hele wachtrij, van alle bussen samen. Stonden er nog
 * knoppen van een Kajosoft klaar, dan zei de telefoon bij de volgende bus (een
 * Iveco met een kaartjesprinter) ook "Genoteerd" en was de knop weg -- terwijl
 * er voor die bus niets genoteerd was.
 */
function straksVanDezeBus(acties: string[], beschikbaar: string[]): number {
  const heeft = new Set(beschikbaar.map((actie) => actie.toLowerCase()))
  const zonder = [...new Set(acties.map((actie) => actie.toLowerCase()))].filter(
    (actie) => !heeft.has(actie)
  )
  if (zonder.length === 0) return 0
  const modelcfg = modelcfgNu().toLowerCase()
  if (!modelcfg) return 0
  const klaar = new Set(
    Object.entries(readSettings(userData()).busknoppenStraks ?? {})
      .filter(([cfg]) => cfg.toLowerCase() === modelcfg)
      .flatMap(([, lijst]) => lijst.map((actie) => actie.toLowerCase()))
  )
  return zonder.every((actie) => klaar.has(actie)) ? zonder.length : 0
}

let vorigeKnoppenregel = ''

/**
 * De knoppen van de apparaten die nu in de telefoon staan. Dat is per bus anders
 * -- bij de ene een AFR 200, bij de andere een ALMEX met een aanraakscherm -- en
 * het zijn er hooguit een paar tientallen.
 */
function actiesVoorBusknoppen(): string[] {
  const panelen = busPanelen(freshLive()) ?? []
  /*
   * IN DEZE VOLGORDE, WANT ER ZIJN ER NIET GENOEG VOOR ALLES
   *
   * Er zijn hooguit 87 toetscombinaties die OMSI doorgeeft, gedeeld door alle
   * apparaten van alle bussen die je ooit erbij zette. Bij de eerste ALMEX in een
   * keyboard.cfg die al 32 knoppen van een AFR droeg, kregen er 4 van de 48 geen
   * toets -- en omdat de aanraakvlakken ACHTERAAN deze lijst stonden, waren dat
   * juist knoppen van het scherm. Nu eerst wat je op het scherm aantikt, dan de
   * toetsen op het apparaat, en als laatste de losse knoppen (de klep, de
   * grendel, het wisselgeld) -- die zijn het minst erg om te missen.
   */
  const scherm = [...schermActies()]
  const opApparaat = panelen.flatMap((paneel) => paneel.rijen.flat().map((knop) => knop.actie))
  const los = panelen.flatMap((paneel) => (paneel.losseRijen ?? []).flat().map((knop) => knop.actie))
  /* Alleen als het verandert: dit loopt elke vijf tellen, en het logboek liep er vol mee. */
  const regel = `busknoppen: ${scherm.length} van het scherm, ${opApparaat.length} op het apparaat, ${los.length} los`
  if (regel !== vorigeKnoppenregel) log(regel)
  vorigeKnoppenregel = regel
  return [...scherm, ...opApparaat, ...los]
}

/** Hoeveel knoppen er in totaal in de wachtrij staan, over alle bussen. */
function inDeWachtrij(): number {
  return Object.values(readSettings(userData()).busknoppenStraks ?? {}).reduce(
    (som, lijst) => som + lijst.length,
    0
  )
}

/** De model.cfg van de bus die nu rijdt; leeg als die niet te vinden is. */
function modelcfgNu(): string {
  const bus = freshLive()?.bus
  if (!bus) return ''
  try {
    return modelcfgVanBus(omsi(), bus) ?? ''
  } catch {
    return ''
  }
}

/**
 * Knoppen bijschrijven voor één bus. Met de triggers van die bus mag een toets
 * gedeeld worden met knoppen van andere bussen; zie zetBustoetsen.
 */
function schrijfBusknoppen(
  modelcfg: string,
  acties: string[]
): { toegevoegd: number; gedeeld: number; geenPlek: number } | undefined {
  try {
    let triggers: Set<string> | undefined
    if (modelcfg) {
      try {
        triggers = triggersVan(modelcfg)
      } catch (fout) {
        logFout('triggers van de bus lezen', fout)
      }
    }
    const uitslag = zetBustoetsen(omsi(), acties.length > 0 ? acties : undefined, { triggers })
    knoppenStand = undefined
    return uitslag
  } catch (fout) {
    logFout('busknoppen bijschrijven', fout)
    return undefined
  }
}

async function zetBusknoppenAan(): Promise<
  | { toegevoegd: number; gedeeld: number; geenPlek: number; omsiDraait?: boolean; onthouden?: number; fout?: 'bekijken' }
  | undefined
> {
  /*
   * Alleen bekijken (main/versiewacht.ts): keyboard.cfg is van OMSI, en
   * `fs` weigert het toch. Tot de tegenlezing van 29-09 ging dit verzoek
   * gewoon in de wachtrij terwijl OMSI draaide, en zodra het dicht was
   * probeerde `wachtOpOmsiDicht` het elke vijf tellen opnieuw -- met
   * PowerShell en een schrijffout in het logboek, tot de app dicht ging.
   */
  if (inBekijkstand()) {
    log('busknoppen niet bijgeschreven: alleen bekijken')
    return { toegevoegd: 0, gedeeld: 0, geenPlek: 0, fout: 'bekijken' }
  }
  /* Nu uitrekenen: terwijl OMSI draait weet de app welke bus en welke apparaten het zijn. */
  const acties = actiesVoorBusknoppen()
  const modelcfg = modelcfgNu()
  /*
   * NIET TERWIJL OMSI DRAAIT -- MAAR WEL ONTHOUDEN
   *
   * Het spel leest `keyboard.cfg` bij het starten en schrijft hem bij het
   * afsluiten terug uit wat het zelf in geheugen heeft. Wat wij er tussendoor
   * bij zetten is dan bij het afsluiten weer weg -- en erger: het lijkt te
   * werken tot je OMSI de volgende keer opstart.
   *
   * Tot 26-09 bleef het daarbij: "niet bijgeschreven", en klaar. Maar deze knop
   * staat in de overlay en op de tablet, en die gebruik je terwijl OMSI draait.
   * Het lukte dus nooit; het logboek toont acht pogingen in een minuut, en in
   * keyboard.cfg stond daarna geen enkele ALMEX-toets. Nu wordt het verzoek
   * bewaard -- per bus, want bij het bijschrijven zijn de scripts van die bus
   * nodig -- en doet de app het zelf zodra het kan: zie `schrijfStraks`.
   */
  const draait = await leesOmsiProces(OMSI_PROCES)
  if (draait) {
    const wachtrij = { ...(readSettings(userData()).busknoppenStraks ?? {}) }
    wachtrij[modelcfg] = [...new Set([...(wachtrij[modelcfg] ?? []), ...acties])]
    writeSettings(userData(), { busknoppenStraks: wachtrij })
    knoppenStand = undefined
    log(`busknoppen onthouden (${acties.length} knoppen): bijgeschreven zodra OMSI dicht is`)
    wachtOpOmsiDicht()
    return { toegevoegd: 0, gedeeld: 0, geenPlek: 0, omsiDraait: true, onthouden: inDeWachtrij() }
  }
  /* OMSI is dicht: eerst wat er nog klaarstond, dan deze bus. */
  await schrijfStraks('samen met een nieuw verzoek')
  return schrijfBusknoppen(modelcfg, acties)
}

/**
 * De onthouden knoppen bijschrijven, als dat kan. Alleen met OMSI dicht; zie
 * `zetBusknoppenAan`. Aangeroepen zodra OMSI dicht is, bij het starten van de
 * app, en vlak voordat de app OMSI zelf opstart.
 */
async function schrijfStraks(waarom: string): Promise<void> {
  /* Niet in alleen-bekijken; de wachtrij blijft staan voor de exe die wel mag schrijven. */
  if (inBekijkstand()) return
  const wachtrij = readSettings(userData()).busknoppenStraks ?? {}
  const verkeerd = aantalVerbodenToetsen(omsi())
  if (Object.keys(wachtrij).length === 0 && verkeerd === 0) return
  if (await leesOmsiProces(OMSI_PROCES)) return
  /*
   * Knoppen die een eerdere versie op F10 of Shift+` zette, eerst weg van die
   * toets: daar stond OMSI van stil. Zie verlegVerbodenToetsen.
   */
  if (verkeerd > 0) {
    /*
     * In een eigen `try`: dit wordt ook aangeroepen vanuit de wacht op een
     * dicht OMSI, zonder iemand die een fout opvangt, en een keyboard.cfg die
     * vastzit werd daar een onafgehandelde belofte (tegenlezing 29-09).
     */
    try {
      verlegVerbodenToetsen(omsi())
    } catch (fout) {
      logFout('knoppen van F10 en Shift+` halen', fout)
    }
    knoppenStand = undefined
  }
  if (Object.keys(wachtrij).length === 0) return
  let toegevoegd = 0
  let gedeeld = 0
  let geenPlek = 0
  for (const [modelcfg, acties] of Object.entries(wachtrij)) {
    const uitslag = schrijfBusknoppen(modelcfg, acties)
    if (!uitslag) return
    toegevoegd += uitslag.toegevoegd
    gedeeld += uitslag.gedeeld
    geenPlek += uitslag.geenPlek
  }
  writeSettings(userData(), { busknoppenStraks: {} })
  log(
    `onthouden busknoppen bijgeschreven (${waarom}): ${toegevoegd} erbij, waarvan ${gedeeld} gedeeld ` +
      `met een andere bus, ${geenPlek} zonder vrije toets`
  )
}

/**
 * Een bus klaarmaken: de gekozen apparaten bewaren, en hun knoppen per variant
 * aan een toets hangen -- nu, of zodra OMSI dicht is.
 *
 * Per variant (per model.cfg), met de triggers van die variant: twee varianten
 * rijden nooit tegelijk en mogen toetsen delen. Zie actiesPerVariant in
 * core/busklaar.ts.
 */
async function busKlaarmaken(sleutel: string, ids: string[]): Promise<Busklaaruitslag> {
  /*
   * Alleen bekijken: niets bewaren en niets in de wachtrij (zie
   * zetBusknoppenAan). Eerst kwam het verzoek in de wachtrij terwijl OMSI
   * draaide, en anders meldde het scherm "alle knoppen stonden er al" over
   * knoppen die `fs` net geweigerd had.
   */
  if (inBekijkstand()) {
    log(`bus niet klaargemaakt: alleen bekijken (${sleutel})`)
    return { knoppen: 0, bijgeschreven: 0, gedeeld: 0, geenPlek: 0, fout: 'bekijken' }
  }
  const alles = { ...(readSettings(userData()).busmodules ?? {}) }
  if (ids.length > 0) alles[sleutel] = ids
  else delete alles[sleutel]
  writeSettings(userData(), { busmodules: alles })
  gekozenOnthouden = alles
  gekozenGelezen = Date.now()
  log(`bus klaargemaakt: ${sleutel} met ${ids.join(', ') || 'niets'}`)
  const leeg: Busklaaruitslag = { knoppen: 0, bijgeschreven: 0, gedeeld: 0, geenPlek: 0 }
  if (ids.length === 0) return leeg

  const perVariant = await werkerVraag<Record<string, string[]>>(
    { soort: 'busacties', sleutel, ids },
    'bussen'
  )
  const knoppen = new Set(Object.values(perVariant).flat().map((actie) => actie.toLowerCase())).size

  if (await leesOmsiProces(OMSI_PROCES)) {
    const wachtrij = { ...(readSettings(userData()).busknoppenStraks ?? {}) }
    for (const [modelcfg, acties] of Object.entries(perVariant)) {
      wachtrij[modelcfg] = [...new Set([...(wachtrij[modelcfg] ?? []), ...acties])]
    }
    writeSettings(userData(), { busknoppenStraks: wachtrij })
    knoppenStand = undefined
    wachtOpOmsiDicht()
    log(`${sleutel}: ${knoppen} knoppen onthouden, bijgeschreven zodra OMSI dicht is`)
    return { ...leeg, knoppen, onthouden: true }
  }

  await schrijfStraks('samen met een bus klaarmaken')
  const uitslag = { ...leeg, knoppen }
  for (const [modelcfg, acties] of Object.entries(perVariant)) {
    const deel = schrijfBusknoppen(modelcfg, acties)
    if (!deel) continue
    uitslag.bijgeschreven += deel.toegevoegd
    uitslag.gedeeld += deel.gedeeld
    uitslag.geenPlek = Math.max(uitslag.geenPlek, deel.geenPlek)
  }
  return uitslag
}

/*
 * Wachten tot OMSI dicht is, alleen zolang er iets klaarstaat. Twee keer achter
 * elkaar "dicht" voordat er geschreven wordt: het spel schrijft keyboard.cfg
 * tijdens het afsluiten, en wie te vroeg is wordt alsnog overschreven.
 */
let straksWacht: ReturnType<typeof setInterval> | undefined
function wachtOpOmsiDicht(): void {
  // In alleen-bekijken valt er niets bij te schrijven; zie zetBusknoppenAan.
  if (straksWacht || inBekijkstand()) return
  let dicht = 0
  straksWacht = setInterval(() => {
    void (async () => {
      if (inDeWachtrij() === 0) {
        clearInterval(straksWacht)
        straksWacht = undefined
        return
      }
      dicht = (await leesOmsiProces(OMSI_PROCES)) ? 0 : dicht + 1
      if (dicht >= 2) await schrijfStraks('OMSI is dicht')
    })()
  }, 5000)
  straksWacht.unref?.()
}

/*
 * De apparaten van deze bus, nagebouwd zoals ze in de cabine zitten.
 *
 * Alleen voor bussen die de app van binnen kent (core/busprofiel.ts); de rest
 * krijgt de generieke weergave uit de model.cfg. Welk profiel het is verandert
 * alleen als je in een andere bus stapt, dus dat wordt onthouden -- de tekst
 * erop komt bij elk beeld vers uit `vars`.
 */
const profielPerBus = new Map<string, Busprofiel | null>()
/*
 * En de apparaten die de app zelf uit het model samenstelt (core/busmodule.ts).
 * Dat leest een cfg van schijf, dus het gebeurt een keer per bus.
 */
const modulesPerBus = new Map<string, Busmodule[]>()
/*
 * Welke knoppen de telefoon van deze bus mag indrukken. Een toestel op het
 * netwerk mag niet zomaar elke toets van het spel afgeven; wat de bus zelf aan
 * knoppen heeft is de grens, plus de vaste lijst uit shared/telefoon.ts.
 */
let toegestaneActies = new Set<string>(Object.values(OMSI_TOETSEN).map((naam) => naam.toLowerCase()))

/** Waaronder we onthouden welke apparaten de speler bij deze bus wil zien. */
function busSleutel(bus: LiveData['bus']): string {
  return (bus?.pad || bus?.model || '').toLowerCase().replace(/[\\/]+$/, '')
}

function busModules(live: LiveData | undefined): Busmodule[] {
  const bus = live?.bus
  if (!bus) return []
  let omsiMap: string
  try {
    omsiMap = omsi()
  } catch {
    return []
  }
  const sleutel = `${bus.pad}|${bus.model}|${bus.bestand}`
  let modules = modulesPerBus.get(sleutel)
  if (!modules || nogEensProberen(`modules:${sleutel}`, modules.length)) {
    modules = modulesVanBus(omsiMap, bus)
    modulesPerBus.set(sleutel, modules)
    log(
      `apparaten in ${bus.naam || bus.pad}: ` +
        (modules.map((m) => `${m.naam} (${m.vakken.length} schermpjes, ${m.knoppen.length} knoppen)`).join(', ') ||
          'geen')
    )
    const namen = new Set(Object.values(OMSI_TOETSEN).map((naam) => naam.toLowerCase()))
    for (const module of modules) for (const knop of module.knoppen) namen.add(knop.actie.toLowerCase())
    toegestaneActies = namen
  }
  return modules
}

/**
 * Welke apparaten de speler erbij gezet heeft; onthouden in de instellingen.
 *
 * Even bewaard, want dit wordt bij elk beeld gevraagd -- tien keer per seconde
 * het instellingenbestand van schijf lezen is zonde, en het verandert alleen
 * als iemand op een knop drukt.
 */
let gekozenOnthouden: Record<string, string[]> | undefined
let gekozenGelezen = 0

function gekozenModules(bus: LiveData['bus']): string[] {
  const sleutel = busSleutel(bus)
  if (!sleutel) return []
  const nu = Date.now()
  if (!gekozenOnthouden || nu - gekozenGelezen > 2000) {
    gekozenGelezen = nu
    gekozenOnthouden = readSettings(userData()).busmodules ?? {}
  }
  return gekozenOnthouden[sleutel] ?? []
}

function busPanelen(live: LiveData | undefined): Paneel[] | undefined {
  const bus = live?.bus
  if (!bus) return undefined
  let omsiMap: string
  try {
    omsiMap = omsi()
  } catch {
    return undefined
  }

  /*
   * EERST DE APPARATEN DIE DE SPELER ZELF ERBIJ GEZET HEEFT
   *
   * Die hangen aan niets: de app stelt ze samen uit de model.cfg op schijf, en
   * of er op dit moment tekst in staat doet niet mee. Ze stonden hieronder, na
   * twee poorten -- geen `vars` en geen schermen.json -- en die gaan tijdens het
   * laden, in het menu en tussen twee diensten allebei dicht. Dan verdween het
   * apparaat uit beeld in plaats van dat het zijn laatste tekst vasthield.
   */
  const gekozen = gekozenModules(bus)
  const modelcfg = modelcfgVanBus(omsiMap, bus)
  const zelf = busModules(live)
    .filter((module) => gekozen.includes(module.id))
    .map((module) => {
      const paneel = paneelVanModule(module, live.vars ?? {})
      /*
       * Het scherm zoals OMSI het tekent, als dat voor dit apparaat te maken is.
       * De knoppen die als aanraakvlak OP dat scherm liggen gaan uit de rijen
       * eronder; wat overblijft zijn de echte toetsen naast het scherm.
       */
      const scherm = modelcfg ? schermVoor(omsiMap, modelcfg, module, live, log) : undefined
      if (!scherm) return paneel
      paneel.scherm = standVoor(scherm.vorm, live, omsiMap, modelcfg!)
      paneel.rijen = paneel.rijen
        .map((rij) => rij.filter((knop) => !scherm.knoppenOpScherm.has(knop.actie)))
        .filter((rij) => rij.length > 0)
      /*
       * Een touchscreen -- het scherm heeft zelf aanraakvlakken -- is alleen dat
       * scherm. Wat er aan knoppen overblijft en niet op het apparaat zelf zit
       * (de klep, de grendel, het wisselgeld bij een ALMEX) gaat naar een groep
       * die de telefoon dichtgeklapt toont; de toetsen op het apparaat (het
       * cijferblok van een RG-kastje) blijven staan. Zie LOS_VAN_HET_SCHERM_MM in core/schermvorm.ts.
       */
      if (scherm.knoppenOpScherm.size > 0) {
        const opApparaat = (knop: { actie: string }): boolean =>
          scherm.opApparaat.has(knop.actie.toLowerCase())
        const los = paneel.rijen
          .map((rij) => rij.filter((knop) => !opApparaat(knop)))
          .filter((rij) => rij.length > 0)
        if (los.length > 0) {
          paneel.losseRijen = los
          paneel.rijen = paneel.rijen
            .map((rij) => rij.filter(opApparaat))
            .filter((rij) => rij.length > 0)
        }
      }
      /*
       * Het nagemeten vlak gaat alleen mee zolang de telefoon niet kan weten welk
       * menu er aanstaat (een plugin van voor versie 13); anders is het elke
       * tiende seconde een paar kilobyte voor niets.
       */
      if (paneel.scherm.z || paneel.scherm.g) {
        delete paneel.vlak
        paneel.regels = []
      }
      return paneel
    })

  const sleutel = `${bus.pad}|${bus.model}|${bus.bestand}`
  let profiel = profielPerBus.get(sleutel)
  if (profiel === undefined) {
    /*
     * Welke variabelen deze bus heeft staat in schermen.json, de volle lijst van
     * de plugin. Is die er nog niet, dan wachten we -- een profiel afwijzen op
     * een lijst die nog leeg is zou het de hele rit weghouden.
     */
    const namen = new Set(
      Object.keys(leesSchermen()?.vars ?? {}).map((naam) => naam.toLowerCase())
    )
    if (namen.size === 0) return zelf.length > 0 ? zelf : undefined
    profiel = profielVanBus(omsiMap, bus, namen)?.profiel ?? null
    profielPerBus.set(sleutel, profiel)
    log(
      profiel
        ? `busprofiel: ${profiel.naam} -- ${profiel.apparaten.map((apparaat) => `${apparaat.naam} (${apparaat.rijen.flat().length} knoppen)`).join(', ')}`
        : `busprofiel: geen voor ${bus.naam || bus.pad}; de generieke weergave blijft`
    )
  }
  const uitProfiel = profiel ? panelenVan(profiel, live.vars ?? {}) : []
  /* Een apparaat dat het profiel al uitgewerkt toont komt er niet nog eens bij. */
  const alGetoond = new Set(uitProfiel.map((paneel) => paneel.id))
  const alles = [...uitProfiel, ...zelf.filter((paneel) => !alGetoond.has(paneel.id))]
  return alles.length > 0 ? alles : undefined
}

/** Wat de telefoon in het lijstje "Voeg IBIS-scherm toe" te zien krijgt. */
function busmoduleLijst(live: LiveData | undefined): {
  id: string
  naam: string
  schermen: number
  knoppen: number
  erbij: boolean
}[] {
  const modules = busModules(live)
  if (modules.length === 0) return []
  const gekozen = gekozenModules(live?.bus)
  const paneelIds = new Set((busPanelen(live) ?? []).map((paneel) => paneel.id))
  return modules.map((module) => ({
    id: module.id,
    naam: module.naam,
    schermen: module.vakken.length,
    knoppen: module.knoppen.length,
    erbij: gekozen.includes(module.id) || paneelIds.has(module.id)
  }))
}

/** Een apparaat erbij zetten of weghalen; blijft bewaard per bus. */
function zetBusmodule(live: LiveData | undefined, id: string, aan: boolean): void {
  const sleutel = busSleutel(live?.bus)
  if (!sleutel || !id) return
  const instellingen = readSettings(userData())
  const alles = { ...(instellingen.busmodules ?? {}) }
  const nu = new Set(alles[sleutel] ?? [])
  if (aan) nu.add(id)
  else nu.delete(id)
  if (nu.size > 0) alles[sleutel] = [...nu]
  else delete alles[sleutel]
  writeSettings(userData(), { busmodules: alles })
  gekozenOnthouden = alles
  gekozenGelezen = Date.now()
  log(`apparaat ${aan ? 'erbij' : 'weg'}: ${id} bij ${sleutel}`)
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
  // De kaartverkoop telt niet meer hier maar in `snelleLus`: ook zonder overlay (B6).
  captureBaseline(live)
  void volgOmloopInOmsi(live)
  const duty = currentDuty()
  const status = live ? describeLive(live, duty, nulmeting(), busApparaten(live)) : undefined
  const vehicle = vehicleOnMap(live, duty)
  const frame = {
    connected: Boolean(live?.alive),
    laadt: laadtOmsi(Boolean(live?.alive)),
    status,
    vehicle,
    duty,
    ibis: overlayIbis,
    /*
     * Een vrije rit: de staat die het volgen uitrekende (wachten, geen omloop
     * met wat er straks vertrekt, de gevolgde omloop, ...) en de aanrijlijn.
     */
    vrij: vrijBeeld(duty, status, vehicle),
    /*
     * De kaartjes van deze kaart gaan mee in het beeld. Ze veranderen niet
     * tijdens een dienst, maar de overlay heeft geen eigen brug naar het
     * hoofdproces -- hij krijgt alleen beelden toegestuurd. Het kost niets: het
     * beeld wordt pas verstuurd als er iets aan verandert, en een kaartset is
     * een handvol regels.
     */
    kaartjes: kaartsetVoorOverlay(duty?.mapFolder ?? vrijeRit?.mapFolder),
    knoppen: busknoppen(),
    panelen: busPanelen(live),
    busmodules: busmoduleLijst(live),
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
    // Rijd je voor je eigen bedrijf, dan staat dat op de telefoon; zie `ritVoorBedrijf`.
    bedrijf: bedrijfVoorTelefoon(),
    // Flitsen en gebeurtenissen; zie core/onderweg.ts.
    onderweg: onderwegVoorTelefoon(),
    // De afvinklijst van de meetstand, alleen als die aanstaat; zie `metingBeeld`.
    meting: metingBeeld(),
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
  knoppen?: unknown
  panelen?: unknown
  busmodules?: unknown
  vrij?: unknown
  telefoon: TelefoonStand
  bedrijf?: BedrijfRit
  onderweg?: OnderwegBeeld
  meting?: MetingBeeld
}): unknown {
  return {
    connected: frame.connected,
    laadt: frame.laadt,
    status: frame.status,
    vehicle: frame.vehicle,
    duty: frame.duty,
    ibis: frame.ibis,
    vrij: frame.vrij,
    kaartjes: frame.kaartjes,
    /*
     * De apparaten van deze bus en welke knoppen er aan een toets hangen. Die
     * moeten hier met name genoemd worden -- dit beeld wordt veld voor veld
     * opgebouwd zodat er niets van de chauffeur meelekt -- en dat was vergeten:
     * op de pc stond het nagebouwde paneel en op de tablet de algemene
     * weergave, terwijl het dezelfde app is.
     */
    knoppen: frame.knoppen,
    panelen: frame.panelen,
    busmodules: frame.busmodules,
    telefoon: frame.telefoon,
    // Het bedrijf mag mee: een lijn en een telling uit een spel, niets van de chauffeur zelf.
    bedrijf: frame.bedrijf,
    onderweg: frame.onderweg,
    // De meetstand: een bus, tellers en een bestandsnaam zonder map; niets van de chauffeur.
    meting: frame.meting
  }
}

/**
 * Wat de telefoon van het bedrijf ziet: alleen tijdens een dienst op een lijn
 * van het eigen bedrijf, zie `ritVoorBedrijf`. Opnieuw gerekend als het
 * bedrijf, de dienst of de telling een ander object is; het beeld gaat een
 * paar keer per tel uit.
 */
let ritBeeldVan:
  | { bron: object; duty: Duty; staat?: Rittenstaat; beeld?: BedrijfRit }
  | undefined
function bedrijfVoorTelefoon(): BedrijfRit | undefined {
  const bedrijf = career?.bedrijf
  const lopend = career?.activeDuty
  const assignment = lopend?.assignment as Assignment | undefined
  const duty = assignment?.duty
  if (!bedrijf || !lopend || !duty) return undefined
  const sleutel = spoorSleutel()
  /*
   * Eén keer inlezen als er nog geen telling voor dit spoor is -- na een
   * herstart midden in een dienst stond er anders nul tot de volgende halte.
   */
  if (sleutel && lopendeStaat?.sleutel !== sleutel) {
    lopendeStaat = { sleutel, staat: rittenstaatVanDienst(duty, false) }
  }
  const staat = lopendeStaat && lopendeStaat.sleutel === sleutel ? lopendeStaat.staat : undefined
  if (ritBeeldVan?.bron !== bedrijf || ritBeeldVan.duty !== duty || ritBeeldVan.staat !== staat) {
    const busPad = lopend.vehicleOverride || assignment?.vehicle?.relativePath
    ritBeeldVan = { bron: bedrijf, duty, staat, beeld: ritVoorBedrijf(bedrijf, duty, busPad, staat) }
  }
  return ritBeeldVan.beeld
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

function openOverlay(duty: Duty | undefined, ibis?: IbisPlan): void {
  /*
   * Zonder dienst alleen bij een vrije rit: dan houdt de overlay wat hij al
   * volgde, en anders toont hij hoe je in OMSI een omloop kiest.
   */
  if (duty) overlayDuty = duty
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
  if (startup.weerFout) log(`dienst klaargezet, maar het weer naast laststn.osn niet: ${startup.weerFout}`)
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
  /*
   * Elk traject één keer: een omloop van 26 ritten heeft er vaak maar een
   * handvol verschillende (shared/traject.ts). Wat de werker al uitrekende,
   * staat hier; wat hij nog uitrekent, wordt niet opnieuw gevraagd. Zo wacht
   * de overlay of de telefoon niet in de rij achter een dienstenlijst van twee
   * seconden voor een route die het hoofdvenster net binnenkreeg, en gaat
   * elke route één keer over de brug.
   */
  const { uniek, plek } = uniekeRitten(legs)
  const sleutels = uniek.map((leg) => `${folder}|${ritSleutel(leg)}`)
  const nodig = uniek.filter((_leg, i) => !routeGeheugen.has(sleutels[i]) && !routeOnderweg.has(sleutels[i]))
  if (nodig.length > 0) {
    /*
     * Wat een werker van vóór `vergeetKaarten()` nog terugstuurt, rekende met
     * de oude kaart: dat gaat wel terug naar wie erom vroeg, maar niet meer in
     * het geheugen.
     */
    const generatie = routeGeneratie
    const vraag = (async (): Promise<TripRoute[]> => {
      try {
        return await werkerVraag<TripRoute[]>({ soort: 'routes', folder, legs: nodig })
      } catch (fout) {
        logFout('routes via de werker', fout)
        return laag().routes(folder, nodig)
      }
    })()
    nodig.forEach((leg, i) => {
      const sleutel = `${folder}|${ritSleutel(leg)}`
      const deze: Promise<TripRoute> = vraag
        .then((routes) => {
          if (routes[i] && generatie === routeGeneratie) bewaarRoute(sleutel, routes[i])
          return routes[i]
        })
        .finally(() => {
          // Alleen de eigen vraag weg: na `vergeetKaarten()` kan er al een nieuwe staan.
          if (routeOnderweg.get(sleutel) === deze) routeOnderweg.delete(sleutel)
        })
      routeOnderweg.set(sleutel, deze)
    })
  }
  const routes = await Promise.all(sleutels.map((sleutel) => routeGeheugen.get(sleutel) ?? routeOnderweg.get(sleutel)))
  return plek.map((i) => routes[i] ?? { points: [], guessed: [] })
}

/**
 * Routes per kaart en rit, zoals de werker ze gaf; de oudste gaat eruit. Zie
 * `routesVoor`. `vergeetKaarten()` leegt ze en hoogt `routeGeneratie` op: een
 * bijgewerkte `.ttr` of een andere OMSI-map met een kaart van dezelfde naam
 * heeft dezelfde sleutel, maar een andere weg.
 */
const routeGeheugen = new Map<string, TripRoute>()
const routeOnderweg = new Map<string, Promise<TripRoute>>()
let routeGeneratie = 0
const ROUTEGEHEUGEN_MAX = 2000
function bewaarRoute(sleutel: string, route: TripRoute): void {
  routeGeheugen.delete(sleutel)
  routeGeheugen.set(sleutel, route)
  while (routeGeheugen.size > ROUTEGEHEUGEN_MAX) routeGeheugen.delete(routeGeheugen.keys().next().value as string)
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
      // Bij een vrije rit zonder omloop de kaart van de rit: de navigatie werkt dan al.
      const kaart = currentDuty()?.mapFolder ?? (career?.activeDuty ? undefined : vrijeRit?.mapFolder)
      return kaart ? geometrieVoor(kaart) : undefined
    },
    schermvorm: (id) => schermvormOp(id),
    textuur: (id) => schermtextuurOp(id),
    /*
     * Elk traject één keer, met zijn sleutel: JSON kent geen gedeelde
     * voorwerpen, en per rit ging Wagen 3 op Krefrath met 859 kB over de wifi
     * in plaats van een derde daarvan. De pagina zoekt per rit op sleutel.
     */
    routes: async () => {
      const dienst = currentDuty()
      if (!dienst) return undefined
      const { uniek } = uniekeRitten(dienst.legs.map(({ tripFile, stopIds }) => ({ tripFile, stopIds })))
      const routes = await routesVoor(dienst.mapFolder, uniek)
      return { routes: uniek.map((leg, i) => ({ sleutel: ritSleutel(leg), route: routes[i] })) }
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
        case 'aanbod':
          return dienstAanbod()
        case 'wissel':
          return { ok: wisselDienst(Number(opdracht.nr)) }
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
        case 'busknoppen': {
          zetBusknoppenAan()
          break
        }
        case 'module': {
          zetBusmodule(freshLive(), String(opdracht.module ?? ''), opdracht.aan !== false)
          break
        }
        case 'meting': {
          /* De afvinklijst van de meetstand: alleen de vaste stappen, en alleen als hij aanstaat. */
          if (!meetstandAan) return { ok: false }
          if (opdracht.opslaan) {
            const zip = slaMetingOp()
            return { ok: Boolean(zip), bestand: zip ? basename(zip) : undefined }
          }
          if (!isMeetStap(opdracht.stap)) return { ok: false }
          return { ok: meetsessieNu().vink(opdracht.stap, opdracht.aan !== false) }
        }
        case 'toets': {
          /*
           * Dezelfde weg als de overlay: `omsiToets` laat alleen door wat bij een
           * apparaat van deze bus hoort, en dat is de grens voor wie over het
           * netwerk komt. Hier stond `naam in OMSI_TOETSEN`, en dat kijkt naar
           * de SLEUTELS van die lijst (kaartje, ibis7) en niet naar de namen die
           * de telefoon stuurt (IBIS_7, almex_clickU1). Vanaf de tablet kwam
           * daardoor geen enkele knop van een apparaat in OMSI aan -- ook niet
           * als hij wel aan een toets hing.
           */
          const naam = String(opdracht.toets ?? '').slice(0, 120)
          return { ok: naam ? omsiToets(naam as OmsiToets) : false }
        }
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
  registreerBus3dIpc(ipcMain, bus3d())
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
  /* De bouwstempel bij dat nummer, en of deze exe alleen kijkt; zie main/versiewacht.ts. */
  handle('app:bouw', () => ({ stempel: stempel(), alleenBekijken: alleenBekijken() }))

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
      /*
       * Met de schakelaar `bus3d` de foto v4 uit de 3D-renderer (bus3d-ontwerp
       * §9); lukt die niet door een fout of de tijd, dan toch de v3b, zodat de
       * tegel zijn foto niet kwijtraakt. Zonder schakelaar alleen de v3b.
       */
      if (readSettings(userData()).bus3d === true && busfoto4) {
        const v4 = await busfoto4.foto(relatiefPad, kleurstelling || undefined)
        // Ging de schakelaar intussen uit, dan hoort de tegel de v3b te krijgen.
        if (v4 && readSettings(userData()).bus3d === true) return busfoto4Adres(v4)
      }
      const bestand = await maakBusfoto(
        busfotoOpdracht(relatiefPad, 'voorgrond', kleurstelling || undefined)
      )
      return bestand ? busfotoAdres(bestand) : undefined
    }
  )

  /* De lijst uit "Appearance"; het lezen van de .cti-bestanden gaat naar de werker. */
  handle(
    'bus:kleurstellingen',
    async (_event, relatiefPad: string): Promise<BusKleurstellingen | undefined> => kleurstellingenVan(relatiefPad)
  )

  /*
   * Het 3D-venster (bus3d-ontwerp §8.1) en de foto v4 (§9), met hun eigen IPC.
   * Alles achter de schakelaar `bus3d`: zonder schakelaar opent `bus3d:open`
   * niets en vraagt `bus:foto` de v3b.
   */
  bus3dVenster = maakBus3dVenster(ipcMain, {
    hoofd: () => mainWindow,
    aan: () => readSettings(userData()).bus3d === true,
    preload: join(__dirname, '../preload/bus3d.js'),
    pagina: bus3dPagina(),
    instellingen: () => {
      const s = readSettings(userData())
      return { taal: s.language, thema: s.theme ?? 'systeem', rustig: s.animaties === 'uit' }
    },
    achtergrond: () => (isDonker() ? '#141a26' : '#f7f8f8'),
    leesPlek: () => readSettings(userData()).bus3dVenster,
    bewaarPlek: (plek) => {
      try {
        writeSettings(userData(), { bus3dVenster: plek })
      } catch (fout) {
        logFout('plek van het 3D-venster bewaren', fout)
      }
    },
    peilOmsi: () => isOmsiRunning(`${OMSI_PROCES}.exe`),
    fotoAlsKlaar: (relatiefPad, kleurstelling) => bus3d().fotoAlsKlaar(relatiefPad, kleurstelling, 'breed'),
    kleurstellingen: (relatiefPad) => kleurstellingenVan(relatiefPad),
    kleurstalen: (relatiefPad, tussen) => bus3d().kleurstalen(relatiefPad, tussen),
    log
  })
  busfoto4 = maakBusfoto4(ipcMain, {
    userData,
    preload: join(__dirname, '../preload/bus3d.js'),
    pagina: bus3dPagina(),
    omsiDraait: () => omsiDraaide,
    log,
    registratie: () => bus3d().registratieStempel()
  })

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
  handle('telefoon:toets', (_event, actie: OmsiToets) => omsiToets(actie))
  handle('telefoon:aanbod', () => dienstAanbod())
  handle('telefoon:wissel', (_event, nr: number) => wisselDienst(Number(nr)))
  handle('telefoon:knoppen', () => zetBusknoppenAan())

  /*
   * BUSSEN KLAARMAKEN, VANUIT DE APP
   *
   * Wat hierboven in het spel gebeurt -- een apparaat erbij zetten en de knoppen
   * aan een toets hangen -- kan ook vooraf, vanuit de app, voor elke bus die er
   * staat. De gebruiker: "de gebruiker moet via de app zelf de bus kunnen
   * toevoegen zodat de app de benodigdheden zelf bouwt voor de bus". Het
   * uitlezen gebeurt in de werker (core/busklaar.ts) en kan een minuut duren;
   * het bewaren gebeurt onder dezelfde sleutel die de plugin tijdens het rijden
   * doorgeeft, dus in het spel staat het apparaat er gewoon.
   */
  handle('bussen:lijst', async () => {
    const mappen = await werkerVraag<Busmap[]>({ soort: 'busmappen' }, 'bussen')
    const gekozen = readSettings(userData()).busmodules ?? {}
    return mappen.map((map) => ({
      ...map,
      klaar: (gekozen[map.sleutel] ?? []).length > 0,
      apparaten: gekozen[map.sleutel] ?? []
    }))
  })
  handle('bussen:analyse', async (_event, sleutel: string) => {
    const analyse = await werkerVraag<Busanalyse>(
      { soort: 'busanalyse', sleutel: String(sleutel) },
      'bussen'
    )
    return { ...analyse, gekozen: readSettings(userData()).busmodules?.[String(sleutel)] }
  })
  handle('bussen:klaar', (_event, sleutel: string, ids: string[]) =>
    busKlaarmaken(String(sleutel), Array.isArray(ids) ? ids.map(String) : [])
  )
  /*
   * De meetstand (core/meetstand.ts): het beeld voor het instellingenscherm,
   * een stap afvinken, opslaan, en de map openen. Afvinken en opslaan ook
   * vanaf de telefoon (`TelefoonOpdracht` 'meting'); de map openen alleen hier,
   * want Verkenner boven OMSI steelt de focus van het spel.
   */
  handle('meting:stand', () => metingBeeld() ?? null)
  handle('meting:vink', (_event, stap: unknown, aan: boolean) =>
    meetstandAan && isMeetStap(stap) ? meetsessieNu().vink(stap, aan !== false) : false
  )
  handle('meting:opslaan', () => {
    if (!meetstandAan) return null
    const zip = slaMetingOp()
    return zip ? basename(zip) : null
  })
  handle('meting:map', async () => {
    const map = join(userData(), 'metingen')
    mkdirSync(map, { recursive: true })
    const zip = meetsessie?.beeld(false).opgeslagen
    if (zip && existsSync(join(map, zip))) shell.showItemInFolder(join(map, zip))
    else await shell.openPath(map)
  })

  handle('telefoon:module', (_event, id: string, aan: boolean) => {
    zetBusmodule(freshLive(), String(id), Boolean(aan))
  })
  handle('scherm:vorm', (_event, id: string) => schermvormOp(String(id)) ?? null)

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

  /*
   * Alleen op verzoek van de speler, met het pid uit de melding over de
   * vastloper -- en alleen als onder dat pid nog hetzelfde OMSI draait (naam
   * en starttijd; zie `sluitOmsi`).
   */
  handle('omsi:sluiten', async (_event, pid: number): Promise<'gesloten' | 'al-dicht' | 'mislukt'> => {
    if (!omsiMelding || omsiMelding.soort !== 'vast' || omsiMelding.pid !== pid) return 'al-dicht'
    const uit = await sluitOmsi(pid, omsiMelding.start, OMSI_PROCES)
    log(`vastgelopen OMSI (pid ${pid}) afsluiten op verzoek van de speler: ${uit}`)
    if (uit === 'gesloten') omsiWacht.doorOnsGesloten = true
    return uit
  })

  handle('game:settings', async () => ({
    values: readGameSettings(omsi()),
    omsiRunning: await isOmsiRunning(`${OMSI_PROCES}.exe`)
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
      omsiRunning: await isOmsiRunning(`${OMSI_PROCES}.exe`)
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
    omsiRunning: await isOmsiRunning(`${OMSI_PROCES}.exe`)
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
  handle('omsi:running', () => isOmsiRunning(`${OMSI_PROCES}.exe`))

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
      status: describeLive(live, duty, nulmeting(), busApparaten(live)),
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
    /*
     * Een mislukte poging wordt niet onthouden.
     *
     * Wie de app start terwijl OMSI draait, kan de plugin niet vervangen -- het
     * spel houdt het bestand vast. Dat antwoord bleef hangen tot de app opnieuw
     * startte, en intussen reed de speler met een oude plugin terwijl de nieuwe
     * al klaarstond. Nu probeert elke volgende vraag het opnieuw, en zodra OMSI
     * dicht is staat hij er.
     */
    if (!pluginStatus || pluginStatus.error || !pluginStatus.upToDate) {
      pluginStatus = ensurePlugin(
        omsi(),
        pluginSourceDir(process.resourcesPath, app.isPackaged),
        app.isPackaged ? undefined : join(process.cwd(), 'plugin'),
        await isOmsiRunning(`${OMSI_PROCES}.exe`).catch(() => undefined)
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
   * Vrij rijden: kan de bus op deze kaart neer, en waar? De voet van de
   * kaartstap, en wat START straks gebruikt. In de werker: de dienstregeling
   * en de tekening van de kaart horen niet in het hoofdproces.
   */
  handle('free:check', async (_event, folder: string, wanneer?: VrijWanneer): Promise<FreeCheck> => {
    const uit = await vrijeControle(String(folder), wanneer)
    return {
      ok: uit.ok,
      fout: uit.fout,
      plek: uit.plek && {
        nr: uit.plek.nr,
        naam: uit.plek.naam,
        bron: uit.plek.bron,
        aantal: uit.plek.aantal,
        tot: uit.plek.tot,
        eerste: uit.plek.eerste,
        x: uit.plek.wereld.x,
        y: uit.plek.wereld.y,
        heading: uit.plek.spawn.heading
      },
      moment: { iso: uit.moment.iso, minutes: uit.moment.minutes, bron: uit.moment.bron }
    }
  })

  /**
   * Vrij rijden: de bus neerzetten, klaarzetten, OMSI starten. Geen dienst,
   * niets in het profiel, niets geboekt; welke omloop je rijdt kies je daarna in
   * OMSI, en de navigatie vindt hem (volgOmloopInOmsi).
   *
   * De volgorde staat in core/vrijstart.ts; hier alleen wat Electron nodig
   * heeft. De vrije rit bestaat pas als er geschreven is -- een weigering laat
   * niets achter -- en de overlay gaat alleen open als OMSI al draait: anders
   * hing hij over het bureaublad terwijl de speler OMSI nog moest starten. Het
   * startvenster op het rijscherm opent hem zodra OMSI er is.
   */
  handle('free:start', async (_event, request: FreeRequest): Promise<FreeResult> => {
    const folder = String(request.mapFolder)
    /*
     * Alleen bekijken (main/versiewacht.ts): START weigert meteen, met een
     * eigen reden. Zonder dit hield `fs` het schrijven van de situatie wel
     * tegen, maar kwam de speler op "schrijven mislukt: Alleen bekijken: niet
     * geschreven naar ...\Situations" uit -- en draaide OMSI al, dan begon er
     * een vrije rit zonder dat er iets klaarstond.
     */
    if (inBekijkstand()) {
      log(`vrij rijden geweigerd: alleen bekijken (${folder})`)
      return { running: false, launched: false, klaargezet: 'niets', fout: 'bekijken' }
    }
    const instellingen = readSettings(userData())
    const yard = request.vehiclePath ? await wagenparkVoorStart(folder, request.vehiclePath, request.yard) : undefined
    const vehicle = request.vehiclePath
      ? {
          relativePath: request.vehiclePath,
          lineNumber: '',
          terminus: '',
          yard,
          vars: kleurVars(request.vehiclePath, request.kleurstelling),
          // Een gelede bus is twee voertuigen; zonder dit begin je met een halve.
          trailer: aanhangerVan(request.vehiclePath, request.kleurstelling)
        }
      : undefined
    const uitkomst = await startVrijeRit(
      {
        isRunning: () => isOmsiRunning(`${OMSI_PROCES}.exe`),
        check: (kaart, wanneer) => vrijeControle(kaart, wanneer),
        inzetpunt: (kaart, nr) => inzetpuntVoorStart(kaart, nr),
        writeSituation: (situatie) => writeSituation(omsi(), situatie),
        presetStartup: (kaart, file) => presetStartup(omsi(), kaart, file),
        schrijfStraks: () => schrijfStraks('voor het starten van OMSI'),
        launchOmsi: () => launchOmsi(omsi(), instellingen.windowedOmsi),
        log
      },
      {
        mapFolder: folder,
        vehicle,
        wanneer: request.wanneer,
        weather: request.weather,
        plek: request.plek,
        moment: request.moment,
        naam: `OMSI Enhancer — ${t(instellingen.language, 'mode.free')}`,
        beschrijving: `${t(instellingen.language, 'mode.free')}.`
      }
    )
    const { running } = uitkomst
    if (uitkomst.fout) {
      log(`vrij rijden geweigerd: ${uitkomst.fout}${uitkomst.foutTekst ? ` (${uitkomst.foutTekst})` : ''}`)
      return { running, launched: false, klaargezet: 'niets', fout: uitkomst.fout, foutTekst: uitkomst.foutTekst }
    }

    stopVrijeRit()
    vrijeRitten += 1
    const mapName = readMapName(kaartPad(folder)) || folder
    const moment = uitkomst.moment
    const iso = moment
      ? new Date(Date.UTC(moment.year, 0, moment.dayOfYear)).toISOString().slice(0, 10)
      : undefined
    vrijeRit = {
      mapFolder: folder,
      mapName,
      vehiclePath: request.vehiclePath,
      yard,
      sinds: new Date().toISOString(),
      plek: uitkomst.plek?.naam,
      klaargezet: uitkomst.klaargezet,
      startMet: running ? 'draaiend' : 'dicht',
      startTijd: Date.now(),
      datum: iso
    }

    const plek = uitkomst.plek
    const weerVan = uitkomst.situatie?.weerVan
    const weer = request.weather ?? (weerVan ? `van de kaart (${weerVan})` : 'standaard')
    const tijd = moment ? formatTime(moment.minutes) : '?'
    log(
      `vrij rijden: ${mapName}, bus ${request.vehiclePath ?? '?'}, ` +
        (plek
          ? `beginplek "${plek.naam}" (${plek.bron}, ${plek.aantal} ${plek.aantal === 1 ? 'vertrek' : 'vertrekken'}${plek.tot !== undefined ? ` tot ${formatTime(plek.tot)}` : ''}), `
          : 'geen beginplek, ') +
        `wagenpark ${yard ?? 'door OMSI gekozen'}${yard && yard !== request.yard ? ' (voorstel bij START)' : ''}, ${iso ?? '?'} ${tijd} ` +
        `(${request.wanneer?.tijd !== undefined || request.wanneer?.datum ? 'gekozen' : 'automatisch'}), weer ${weer}` +
        (running ? ' -- OMSI draait al' : '')
    )
    log(
      `vrij rijden klaargezet: ${uitkomst.klaargezet} (laatste situatie ${uitkomst.startup?.lastSituation ? 'ja' : 'nee'}, ` +
        `last_map ${uitkomst.startup?.lastMap ? 'ja' : 'nee'}` +
        `${uitkomst.startup?.weerFout ? `, weer niet: ${uitkomst.startup.weerFout}` : ''})`
    )
    /* Alleen wat werkelijk als startscherm klaarstaat, wordt na het afsluiten van OMSI opnieuw klaargezet. */
    if (uitkomst.startup?.lastSituation && uitkomst.situatie) {
      klaargezet = { mapFolder: folder, file: uitkomst.situatie.file }
    } else {
      /*
       * En wat een eerdere rit in deze sessie klaarzette, geldt dan niet meer
       * (net als bij meerijden). Bleef het staan, dan zette herstelStartscherm
       * bij het afsluiten van OMSI die oude dienst of rit weer in het startscherm.
       */
      klaargezet = undefined
    }
    if (!running) {
      log(
        `vrij rijden: OMSI starten ${uitkomst.start === 'mislukt' ? `mislukt: ${uitkomst.foutTekst ?? 'onbekend'}` : (uitkomst.start ?? '?')}`
      )
    }
    if (running) openOverlay(undefined)
    /* De kaart alvast klaarzetten voor de navigatie, in de werker. */
    void zorgVoorKaart(folder).catch(() => undefined)
    return {
      running,
      launched: uitkomst.launched,
      start: uitkomst.start,
      klaargezet: uitkomst.klaargezet,
      plek: plek?.naam,
      foutTekst: uitkomst.foutTekst
    }
  })

  handle('free:stop', () => {
    stopVrijeRit()
  })

  /*
   * De wagenparken naast een bus, bij vrij rijden.
   *
   * Luc: "in de vrije modus werkt de hof file selection niet". `duty:yards`
   * meet elk wagenpark aan de eindbestemmingen van de dienst, en bij vrij
   * rijden is er vooraf geen dienst: de remisestap bleef leeg. Hier wordt
   * gemeten aan alle eindbestemmingen van de kaart (bestemmingenVan) -- dan
   * zegt het getal welk wagenpark het best bij deze kaart past.
   *
   * En het voorstel is het wagenpark van deze kaart: Luc, "het moet gewoon de
   * map herkennen en die toepassen". Heet een wagenpark naar de kaart
   * (Krefrath.hof bij Krefrath, Grundorf.hof bij Region Grundorf), dan is dat
   * het; anders het wagenpark dat de meeste bestemmingen kent. Wie niets kiest,
   * krijgt dat voorstel bij START (startVrij in App.tsx).
   *
   * In de werker (`vrijeWagenparken` in core/kaartlaag.ts): hier kostte het
   * koud 63 tot 348 ms (de dienstregeling van de kaart) en ook warm nog 30 ms
   * (22 wagenparken naast de MAN SG van schijf) -- bij elke buskeuze.
   */
  handle(
    'free:yards',
    (_event, folder: string, vehiclePath: string, year: number): Promise<YardOption[]> =>
      werkerVraag<YardOption[]>({
        soort: 'vrijewagenparken',
        folder: String(folder),
        vehiclePath: String(vehiclePath),
        year
      })
  )

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
      stopVrijeRit()
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
  handle('duty:begin', async (_event, request: BeginRequest): Promise<BeginResult> => {
    const { duty, ibis } = request
    /*
     * Alleen bekijken (main/versiewacht.ts): er begint niets, vóór de
     * begintijd in het profiel komt. `fs` hield het klaarzetten wel tegen en
     * launchOmsi weigerde, maar dan stond er een begonnen dienst in de kopie,
     * met "klaarzetten mislukt" in de voet -- en draaide OMSI al, dan liep die
     * dienst gewoon, met een overlay en een telling die nergens heen gingen.
     * Een dienst aannemen (en een examen) mag wel: dat is rondkijken, in de
     * kopie.
     */
    if (inBekijkstand()) {
      log(`dienst niet begonnen: alleen bekijken (${duty?.mapFolder ?? '?'}, omloop ${duty?.tourNumber ?? '?'})`)
      return { connected: false, launched: false, running: false, fout: 'bekijken' }
    }
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
    const running = await isOmsiRunning(`${OMSI_PROCES}.exe`)
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

    /*
     * Het spel erbij starten, tenzij het al draait (zie `running` hierboven).
     * Zoals bij vrij rijden (core/vrijstart.ts): de wachtende knoppen in een
     * eigen `try`. Stonden ze in dezelfde als het starten, dan sloeg een fout
     * in keyboard.cfg het starten van OMSI over -- met de dienst klaargezet en
     * de speler die wachtte op een spel dat niet kwam. Hoe het starten afliep
     * gaat mee terug, zodat de voet de reden kan noemen.
     */
    let launched = false
    let start: LaunchResult | undefined
    let startFout: string | undefined
    if (!running) {
      try {
        /* Knoppen die nog aan een toets moesten: nu kan het, OMSI is nog dicht. */
        await schrijfStraks('voor het starten van OMSI')
      } catch (fout) {
        log(`dienst: knoppen bijschrijven mislukt (${fout instanceof Error ? fout.message : String(fout)}); OMSI start toch`)
      }
      try {
        start = await launchOmsi(omsi(), readSettings(userData()).windowedOmsi)
      } catch (fout) {
        // Lukt starten niet, dan doet de speler het zelf; de overlay staat klaar.
        start = 'mislukt'
        startFout = fout instanceof Error ? fout.message : String(fout)
      }
      launched = start === 'gestart'
      log(`dienst: OMSI starten ${start}${startFout ? `: ${startFout}` : ''}`)
    }
    /*
     * Vanaf hier houden we in de gaten of het spel weer dichtgaat. Doet het dat,
     * dan heeft het onze `[last_map]` overschreven met de kaart die het speelde,
     * en zetten we de situatie opnieuw klaar.
     */
    omsiDraaide = running || launched
    bus3dVenster?.omsiGewijzigd(omsiDraaide)
    return {
      connected: Boolean(live?.alive),
      launched,
      running,
      start,
      startFout,
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
    /*
     * Alleen bekijken (main/versiewacht.ts): geen overlay. START weigert daar
     * al, maar een dienst die in het profiel al liep (de nieuwere exe ging
     * midden in een dienst dicht) kon via "hervatten" gewoon verder, met een
     * overlay en een telling die in de kopie terechtkwamen en bij het
     * afsluiten weg waren (tegenlezing 29-09). Het scherm zegt waarom.
     */
    if (open && inBekijkstand()) {
      log('overlay niet geopend: alleen bekijken')
      return overlayIsOpen()
    }
    if (open && (duty || vrijeRit)) openOverlay(duty ?? undefined, ibis)
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
    const voor = readSettings(userData())
    const saved = writeSettings(userData(), settings)
    /*
     * Het 3D-venster: de schakelaar uit is het venster dicht (en geen knop meer
     * op de tegels); taal, thema en beweging volgen meteen (bus3d-ontwerp §8.1).
     */
    if (voor.bus3d && !saved.bus3d) {
      bus3dVenster?.sluitAlles('de schakelaar bus3d ging uit')
      // Ook het verborgen fotovenster (met zijn WebGL-context): een lopende foto v4 komt dan niet meer op de tegel (aanvalsverslag F2, punt 9).
      busfoto4?.sluit()
    }
    if (voor.language !== saved.language || voor.theme !== saved.theme || voor.animaties !== saved.animaties) {
      bus3dVenster?.instellingenGewijzigd()
    }
    // De meetstand volgt meteen: aan vraagt de plugin meer getallen, uit stopt het schrijven.
    meetstandAan = saved.meetstand === true
    if (voor.meetstand !== saved.meetstand) log(`meetstand ${meetstandAan ? 'aan' : 'uit'}`)
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
    /*
     * Eén dienst wordt één keer geboekt. De knop "afronden" en de automatische
     * afronding (elke vijf tellen) kunnen allebei komen; de tweede vond hier
     * geen dienst meer, maar boekte hem toch -- twee logboekregels, en in het
     * busbedrijf twee keer invaluren.
     */
    if (!career.activeDuty) return careerPayload()
    const staat = rittenstaatVanDienst(duty)
    // Een dienst op een lijn van je eigen bedrijf telt ook daar; zie core/bedrijf.ts.
    const lopend = career.activeDuty
    const busPad =
      lopend?.vehicleOverride || (lopend?.assignment as Assignment | undefined)?.vehicle?.relativePath
    const bedrijf = career.bedrijf
      ? boekEigenDienst(career.bedrijf, duty, staat, busPad, measured?.stopsDone)
      : undefined
    return persist(completeDuty({ ...career, bedrijf }, duty, vehicle, measured, staat, onderwegVanDienst(staat, measured)))
  })

  /*
   * Het slot voor alles wat `career.bedrijf` schrijft (ontwerp §3.2): de
   * volgende schrijfactie wacht tot de vorige klaar is, ook als die faalde.
   */
  let bedrijfSlot: Promise<unknown> = Promise.resolve()
  function inSlot<T>(doen: () => Promise<T>): Promise<T> {
    const v = bedrijfSlot.then(doen, doen)
    bedrijfSlot = v.catch(() => undefined)
    return v
  }
  const alleVoertuigen = async (): Promise<Vehicle[]> => {
    try {
      return await werkerVraag<Vehicle[]>({ soort: 'voertuigen' })
    } catch {
      return laag().voertuigen()
    }
  }
  /*
   * De dagroosters van dag `van` tot en met `tot` voor alle kaarten met een
   * concessie. `weken`: waar vraagt ze voor elke kaart, onwaar nooit, en
   * zonder alleen voor kaarten met een concessie die nog geen week heeft. Warm kost een kaartdag een paar ms, dus in main; na elke kaart
   * even ruimte voor de rest. Een kaart die niet te lezen is (weg, kapot),
   * krijgt `fout: 'kaart'` en haalt de andere niet onderuit.
   */
  async function dagroostersVoor(
    b: NonNullable<CareerState['bedrijf']>,
    van: number,
    tot: number,
    opties: { weken?: boolean } = {}
  ): Promise<{ dagen: Dagrooster[]; ankers: Record<string, string>; weken: Record<string, Record<string, LijnWeek>> }> {
    const eerste = Math.max(1, van)
    const dagen: Dagrooster[] = []
    for (let dag = eerste; dag <= tot; dag++) dagen.push({ dag, kaarten: [] })
    const ankers: Record<string, string> = {}
    const weken: Record<string, Record<string, LijnWeek>> = {}
    const kaarten = [...new Set(b.concessies.map((c) => c.mapFolder))]
    for (const folder of kaarten) {
      const lineFiles = b.concessies.filter((c) => c.mapFolder === folder).map((c) => c.lineFile)
      try {
        const anker = b.ankers?.[folder] ?? ankerVoor(era(folder))
        // Eerst alle dagen lezen, dan pas iets toevoegen: een kaart die niet te
        // lezen is, krijgt geen anker. Anders legde het profiel het jaar van de
        // pc vast (era valt daarop terug), en rekende de kaart daar voorgoed mee.
        const gelezen = dagen.map((d) => laag().kaartDag(folder, lineFiles, anker, d.dag))
        const zonderWeek = b.concessies.some((c) => c.mapFolder === folder && !c.week)
        const week = (opties.weken ?? zonderWeek) ? laag().lijnWeek(folder, anker, b.dag) : undefined
        dagen.forEach((d, i) => d.kaarten.push(gelezen[i]))
        ankers[folder] = anker
        if (week) weken[folder] = week
      } catch (fout) {
        logFout(`dagrooster van ${folder}`, fout)
        for (const d of dagen)
          d.kaarten.push({
            mapFolder: folder,
            mapName: folder,
            lineFiles,
            dag: d.dag,
            datum: '',
            weekdag: 0,
            soort: 'school',
            omlopen: [],
            fout: 'kaart'
          })
      }
      await new Promise((klaar) => setImmediate(klaar))
    }
    return { dagen, ankers, weken }
  }
  /* De ankers vastleggen en concessies zonder week er een geven; verder niets. */
  function metAnkersEnWeken(
    b: NonNullable<CareerState['bedrijf']>,
    ankers: Record<string, string>,
    weken: Record<string, Record<string, LijnWeek>>
  ): NonNullable<CareerState['bedrijf']> {
    const nieuwAnker = Object.entries(ankers).some(([k, v]) => b.ankers?.[k] !== v)
    const zonderWeek = b.concessies.some((c) => !c.week && weken[c.mapFolder]?.[c.lineFile])
    if (!nieuwAnker && !zonderWeek) return b
    return {
      ...b,
      ankers: { ...b.ankers, ...ankers },
      concessies: b.concessies.map((c) => {
        const w = c.week ? undefined : weken[c.mapFolder]?.[c.lineFile]
        return w
          ? {
              ...c,
              week: {
                gemRituren: w.gemRituren,
                gemWerkuren: w.gemWerkuren,
                gemDiensten: w.gemDiensten,
                gemOmlopen: w.gemOmlopen,
                piekOmlopen: w.piekOmlopen,
                berekendOp: b.dag
              }
            }
          : c
      })
    }
  }

  /*
   * Het busbedrijf; de regels staan in core/bedrijf.ts. Een lijn komt hier
   * niet als object uit het venster maar wordt opnieuw uit de kaart gelezen:
   * wat je betaalt en wat de concessie waard is, rekent het hoofdproces.
   */
  handle('bedrijf:oprichten', (_event, naam: string) => {
    if (!career || career.bedrijf) return careerPayload()
    log(`Busbedrijf opgericht: ${String(naam).slice(0, 60)}`)
    return persist({ ...career, bedrijf: richtBedrijfOp(String(naam ?? '').slice(0, 60)) })
  })
  handle('bedrijf:inschrijven', (_event, mapFolder: string, lineFile: string) =>
    inSlot(async () => {
      if (!career?.bedrijf) return { payload: careerPayload(), fout: 'geen' }
      const kaart = map(mapFolder)
      const lijn = listLines(kaart, network(mapFolder)).find((l) => l.lineFile === lineFile)
      if (!lijn) return { payload: careerPayload(), fout: 'lijn' }
      /*
       * De week van de lijn uit de dienstregeling, en het anker van de kaart
       * vastgelegd. Zolang de planning uit staat, rekent de inschrijving nog
       * zoals voorheen: de week gaat dan niet mee.
       */
      const anker = career.bedrijf.ankers?.[kaart.folder] ?? ankerVoor(era(kaart.folder))
      let week: LijnWeek | undefined
      if (PLAN_ACTIEF) {
        try {
          week = laag().lijnWeek(kaart.folder, anker, career.bedrijf.dag)[lijn.lineFile]
        } catch (fout) {
          logFout(`week van ${kaart.folder}/${lijn.lineFile}`, fout)
        }
      }
      const uit = schrijfIn(career.bedrijf, { folder: kaart.folder, name: kaart.name }, lijn, week)
      if ('fout' in uit) return { payload: careerPayload(), fout: uit.fout }
      const bedrijf = PLAN_ACTIEF ? { ...uit.bedrijf, ankers: { ...uit.bedrijf.ankers, [kaart.folder]: anker } } : uit.bedrijf
      return { payload: persist({ ...career, bedrijf }) }
    })
  )
  handle('bedrijf:opzeggen', (_event, mapFolder: string, lineFile: string) => {
    if (!career?.bedrijf) return careerPayload()
    return persist({ ...career, bedrijf: zegOp(career.bedrijf, mapFolder, lineFile) })
  })
  /*
   * De busmarkt: nieuw is elke bus die geïnstalleerd is en die je zelf kunt
   * rijden, tweedehands een handvol daarvan per bedrijfsdag. Kopen gaat op pad
   * of op aanbodnummer; de prijs rekent het hoofdproces opnieuw uit.
   */
  const marktbussen = async (): Promise<MarktBus[]> => {
    let lijst: Vehicle[]
    try {
      lijst = await werkerVraag<Vehicle[]>({ soort: 'voertuigen' })
    } catch {
      lijst = laag().voertuigen()
    }
    const gezien = new Set<string>()
    return lijst
      .map((v) => {
        const naam = [v.manufacturer, v.type].filter(Boolean).join(' ') || v.folder
        return { relativePath: v.relativePath, naam, vorm: vormVanNaam(`${naam} ${v.relativePath}`) }
      })
      .filter((b) => (gezien.has(b.naam) ? false : (gezien.add(b.naam), true)))
      .sort((a, b) => a.naam.localeCompare(b.naam))
  }
  handle('bedrijf:markt', async () => {
    const nieuw = await marktbussen()
    return { nieuw, tweedehands: career?.bedrijf ? tweedehandsAanbod(career.bedrijf, nieuw) : [] }
  })
  handle('bedrijf:koop', (_event, soort: 'nieuw' | 'tweedehands', wat: string | number) => inSlot(async () => {
    if (!career?.bedrijf) return { payload: careerPayload(), fout: 'geen' }
    const markt = await marktbussen()
    const uit =
      soort === 'nieuw'
        ? (() => {
            const bus = markt.find((b) => b.relativePath === wat)
            return bus ? koopNieuw(career!.bedrijf!, bus) : ({ fout: 'weg' } as const)
          })()
        : (() => {
            const aanbod = tweedehandsAanbod(career!.bedrijf!, markt).find((a) => a.nr === Number(wat))
            return aanbod ? koopTweedehands(career!.bedrijf!, aanbod) : ({ fout: 'weg' } as const)
          })()
    if ('fout' in uit) return { payload: careerPayload(), fout: uit.fout }
    return { payload: persist({ ...career, bedrijf: uit.bedrijf }) }
  }))
  handle('bedrijf:verkoop', (_event, nummer: number) => {
    if (!career?.bedrijf) return careerPayload()
    return persist({ ...career, bedrijf: verkoop(career.bedrijf, Number(nummer)) })
  })
  handle('bedrijf:werkplaats', (_event, nummer: number, wat: 'onderhoud' | 'reparatie') => {
    if (!career?.bedrijf) return { payload: careerPayload(), fout: 'geen' }
    const uit = naarWerkplaats(career.bedrijf, Number(nummer), wat === 'reparatie' ? 'reparatie' : 'onderhoud')
    if ('fout' in uit) return { payload: careerPayload(), fout: uit.fout }
    return { payload: persist({ ...career, bedrijf: uit.bedrijf }) }
  })
  /* Personeel: de sollicitanten van vandaag rekent core/bedrijf.ts, hier en in het venster hetzelfde. */
  handle('bedrijf:aannemen', (_event, nr: number) => {
    if (!career?.bedrijf) return { payload: careerPayload(), fout: 'geen' }
    const uit = neemAan(career.bedrijf, Number(nr))
    if ('fout' in uit) return { payload: careerPayload(), fout: uit.fout }
    return { payload: persist({ ...career, bedrijf: uit.bedrijf }) }
  })
  handle('bedrijf:ontslaan', (_event, id: number) => {
    if (!career?.bedrijf) return careerPayload()
    return persist({ ...career, bedrijf: ontsla(career.bedrijf, Number(id)) })
  })
  handle('bedrijf:opslag', (_event, id: number) => {
    if (!career?.bedrijf) return careerPayload()
    return persist({ ...career, bedrijf: geefOpslag(career.bedrijf, Number(id)) })
  })
  /*
   * Opleidingen en de werkplaats zelf. De score van een minigame komt uit het
   * venster; core/bedrijf.ts begrenst hem op 0 tot 1. Het is je eigen spel:
   * wie hem vervalst, bedriegt alleen zichzelf.
   */
  const metUitslag = (
    uit: { bedrijf: NonNullable<CareerState['bedrijf']> } | { fout: string }
  ): { payload: ReturnType<typeof careerPayload>; fout?: string } =>
    'fout' in uit || !career ? { payload: careerPayload(), fout: 'fout' in uit ? uit.fout : 'geen' } : { payload: persist({ ...career, bedrijf: uit.bedrijf }) }
  handle('bedrijf:opleiding', (_event, id: OpleidingId) =>
    career?.bedrijf ? metUitslag(volgOpleiding(career.bedrijf, id)) : { payload: careerPayload(), fout: 'geen' }
  )
  handle('bedrijf:bijscholing', (_event, id: number) =>
    career?.bedrijf ? metUitslag(stuurOpBijscholing(career.bedrijf, Number(id))) : { payload: careerPayload(), fout: 'geen' }
  )
  handle('bedrijf:zelf', (_event, nummer: number, wat: 'onderhoud' | 'reparatie', score: number) => {
    if (!career?.bedrijf) return { payload: careerPayload(), fout: 'geen' }
    const doen = wat === 'reparatie' ? zelfRepareren : zelfOnderhoud
    return metUitslag(doen(career.bedrijf, Number(nummer), Number(score)))
  })
  /* Het postvak: een bericht gelezen, of zonder id alles. */
  handle('bedrijf:post', (_event, id?: number) => {
    if (!career?.bedrijf) return careerPayload()
    const nr = id === undefined || id === null ? undefined : Number(id)
    // Een nummer dat geen nummer is, is geen "alles": dan gebeurt er niets.
    if (nr !== undefined && !Number.isFinite(nr)) return careerPayload()
    const bedrijf = leesPost(career.bedrijf, nr)
    return bedrijf === career.bedrijf ? careerPayload() : persist({ ...career, bedrijf })
  })
  /*
   * Een dag afsluiten. Zolang de planning uit staat (PLAN_ACTIEF in
   * core/rooster.ts), rekent de dag zoals voorheen en wordt er niets
   * gemigreerd. Daarna: de dagroosters lezen, het profiel opnieuw bekijken
   * (er kan intussen iets veranderd zijn), en vanaf daar zonder await door.
   */
  handle('bedrijf:dagAf', () =>
    inSlot(async () => {
      if (!career?.bedrijf) return careerPayload()
      if (career.activeDuty?.bedrijf) return { payload: careerPayload(), fout: 'rit' }
      if (!PLAN_ACTIEF) return persist({ ...career, bedrijf: sluitDagAf(career.bedrijf) })
      const d0 = career.bedrijf.dag
      const { dagen, ankers, weken } = await dagroostersVoor(career.bedrijf, d0 - 1, d0 + 8, { weken: true })
      const voertuigen = await alleVoertuigen()
      // ---- vanaf hier geen await meer ----
      if (!career?.bedrijf) return careerPayload()
      if (career.activeDuty?.bedrijf) return { payload: careerPayload(), fout: 'rit' }
      let b = metAnkersEnWeken(career.bedrijf, ankers, weken)
      if (!b.rooster) b = migreer(b, dagen, weken, voertuigen).bedrijf
      const cijfers = afrekening(b, dagplan(b, dagen, b.dag))
      const na = beginDag(sluitDagAf(b, cijfers), dagen, weken, voertuigen)
      return persist({ ...career, bedrijf: na })
    })
  )

  /*
   * DE PLANNING VAN HET BUSBEDRIJF (ontwerp busbedrijf-planning §3.2). Het
   * venster vraagt, main leest de dienstregeling en rekent. Alles wat
   * `career.bedrijf` schrijft, gaat door één slot: tussen het lezen van de
   * kaarten (await) en het wegschrijven mag geen andere schrijfactie vallen,
   * anders gaat een van de twee stil verloren.
   */
  handle('bedrijf:dagen', async (_event, van: number, tot: number) => {
    if (!career?.bedrijf) return []
    const a = Math.max(1, Math.floor(Number(van) || 1))
    const z = Math.min(a + 9, Math.max(a, Math.floor(Number(tot) || a)))
    // Alleen lezen: geen weken, die gaan niet mee terug naar het venster.
    return (await dagroostersVoor(career.bedrijf, a, z, { weken: false })).dagen
  })
  handle('bedrijf:rooster', (_event, actie: RoosterActie) =>
    inSlot(async () => {
      if (!career?.bedrijf) return { payload: careerPayload(), fout: 'geen' as RoosterFout }
      const dag = actie.soort === 'vulAan' || actie.soort === 'busOpLijn' ? actie.dag : career.bedrijf.dag
      const week = actie.soort === 'vulAan' && actie.bereik === 'week'
      const eerste = PLAN_ACTIEF && actie.soort === 'vulAan' && actie.eerste === true && !career.bedrijf.rooster
      const { dagen, ankers, weken } = await dagroostersVoor(career.bedrijf, dag - 1, dag + (week ? 7 : 1), {
        weken: eerste
      })
      const voertuigen = eerste ? await alleVoertuigen() : []
      if (!career?.bedrijf) return { payload: careerPayload(), fout: 'geen' as RoosterFout }
      const b = metAnkersEnWeken(career.bedrijf, ankers, weken)
      if (eerste && !b.rooster) {
        const uit = migreer(b, dagen, weken, voertuigen)
        return { payload: persist({ ...career, bedrijf: uit.bedrijf }), melding: uit.melding }
      }
      const uit = pasRoosterToe(b, dagen, actie, career.activeDuty?.bedrijf)
      if ('fout' in uit) return { payload: careerPayload(), fout: uit.fout }
      return { payload: persist({ ...career, bedrijf: uit.bedrijf }), ...(uit.melding ? { melding: uit.melding } : {}) }
    })
  )
  handle('bedrijf:invullen', (_event, doel: InvulDoel, keuze: InvulKeuze | BusKeuze | null) =>
    inSlot(async () => {
      if (!career?.bedrijf) return { payload: careerPayload(), fout: 'geen' as InvulFout }
      const d0 = career.bedrijf.dag
      const { dagen, ankers } = await dagroostersVoor(career.bedrijf, d0 - 1, d0 + 1)
      if (!career?.bedrijf) return { payload: careerPayload(), fout: 'geen' as InvulFout }
      const lopend = career.activeDuty?.bedrijf
      const b = metAnkersEnWeken(career.bedrijf, ankers, {})
      const uit = zetInvulling(b, dagplan(b, dagen, b.dag, lopend), doel, keuze ?? null, lopend)
      if ('fout' in uit) return { payload: careerPayload(), fout: uit.fout }
      return { payload: persist({ ...career, bedrijf: uit.bedrijf }) }
    })
  )
  // Zelf een dienst rijden komt in deel C; tot dan gebeurt er niets (en geen fout).
  handle('bedrijf:rit', () => ({ payload: careerPayload() }))
  handle('bedrijf:ritBus', () => ({ payload: careerPayload() }))
  handle('bedrijf:kaart', async (_event, mapFolder: string, dag?: number) => {
    const b = career?.bedrijf
    if (!b) return { fout: 'geen' as const }
    const folder = String(mapFolder ?? '')
    const lineFiles = b.concessies.filter((c) => c.mapFolder === folder).map((c) => c.lineFile)
    if (lineFiles.length === 0) return { fout: 'geen' as const }
    const d = Math.max(1, Math.floor(Number(dag) || b.dag))
    try {
      const anker = b.ankers?.[folder] ?? ankerVoor(era(folder))
      try {
        return await werkerVraag<LijnPlan>({ soort: 'lijnplan', folder, lineFiles, anker, dag: d })
      } catch {
        return laag().lijnplan(folder, lineFiles, anker, d)
      }
    } catch (fout) {
      logFout(`lijnplan van ${folder}`, fout)
      return { fout: 'kaart' as const }
    }
  })
  /*
   * De klok voor de vlootkaart. Alleen die van OMSI, en alleen als OMSI deze
   * kaart rijdt: de laatst geladen kaart (readLastMap) is pas bekend als OMSI
   * dicht is en zegt dus niets over nu.
   */
  let lijnIndexFoutGemeld = false
  handle('bedrijf:klok', (_event, mapFolder: string): BedrijfKlokStand => {
    const dienst = (career?.activeDuty?.assignment as Assignment | undefined)?.duty
    return bedrijfsklok(freshLive(), String(mapFolder ?? ''), dienst?.mapFolder ?? vrijeRit?.mapFolder, (lijn) => {
      try {
        const plekken = laag().kaartenMetLijn(lijn)
        // Lukt het weer, dan mag een volgende fout ook weer gemeld worden.
        lijnIndexFoutGemeld = false
        return plekken
      } catch (fout) {
        // Eén keer melden: de vlootkaart vraagt elke twee tellen.
        if (!lijnIndexFoutGemeld) logFout('lijnindex', fout)
        lijnIndexFoutGemeld = true
        return []
      }
    })
  })
  handle('bedrijf:lijnWeek', (_event, mapFolder: string) => {
    const folder = String(mapFolder ?? '')
    try {
      const anker = career?.bedrijf?.ankers?.[folder] ?? ankerVoor(era(folder))
      return laag().lijnWeek(folder, anker, career?.bedrijf?.dag ?? 1)
    } catch (fout) {
      logFout(`week van ${folder}`, fout)
      return { fout: 'kaart' as const }
    }
  })

  /*
   * DE ADD-ON-MANAGER (stap 7); de regels staan in core/addon.ts en
   * core/addoncheck.ts. Eén klus tegelijk, en in stukjes met een pauze
   * ertussen: een kaart van duizenden bestanden mag het venster niet
   * stilzetten. Hoe ver hij is, gaat als `addon:voortgang` naar het venster.
   */
  let addonBezig = false
  let addonPlan: { pad: string; plan: Plan } | undefined
  const inStukjes = async <T>(
    stappen: Generator<number, T>,
    afzender: Electron.WebContents,
    fase: string
  ): Promise<T> => {
    let sinds = Date.now()
    for (;;) {
      const stap = stappen.next()
      if (stap.done) return stap.value
      if (Date.now() - sinds > 25) {
        if (!afzender.isDestroyed()) afzender.send('addon:voortgang', { fase, n: stap.value })
        await new Promise((klaar) => setImmediate(klaar))
        sinds = Date.now()
      }
    }
  }
  const eenTegelijk = async <T>(klus: () => Promise<T>): Promise<T | { fout: string }> => {
    if (addonBezig) return { fout: 'bezig' }
    addonBezig = true
    try {
      return await klus()
    } catch (fout) {
      logFout('add-on-manager', fout)
      // Een volle schijf is geen raadsel maar een melding: `ruimte`, en de installatie is teruggedraaid.
      const soort = fout instanceof ZipFout ? fout.soort : fout instanceof InstallatieFout && fout.soort === 'ruimte' ? 'ruimte' : 'fout'
      return { fout: soort, melding: fout instanceof Error ? fout.message : String(fout) } as {
        fout: string
      }
    } finally {
      addonBezig = false
    }
  }
  /** Wat het venster van een plan te zien krijgt: tellingen en de eerste regels, niet twintigduizend. */
  const planVoorVenster = (plan: Plan): AddonPlan => ({
    naam: plan.naam,
    nieuw: plan.regels.filter((r) => r.staat === 'nieuw').length,
    gelijk: plan.regels.filter((r) => r.staat === 'gelijk').length,
    anders: plan.regels.filter((r) => r.staat === 'anders').slice(0, 200).map((r) => ({ doel: r.doel, van: r.van })),
    andersAantal: plan.regels.filter((r) => r.staat === 'anders').length,
    overig: plan.overig.slice(0, 100),
    overigAantal: plan.overig.length,
    geweigerd: plan.geweigerd.slice(0, 100),
    geweigerdAantal: plan.geweigerd.length,
    dubbel: plan.dubbel.slice(0, 100),
    dubbelAantal: plan.dubbel.length,
    teLang: plan.teLang.slice(0, 100),
    teLangAantal: plan.teLang.length,
    rommel: plan.rommel,
    code: plan.code.slice(0, 50).map((r) => ({ doel: r.doel, staat: r.staat })),
    nooit: plan.nooit.slice(0, 50),
    plekken: plan.plekken.slice(0, 60),
    bussen: plan.bussen,
    kaarten: plan.kaarten,
    bytes: plan.regels.reduce((som, r) => som + r.grootte, 0),
    ruimte: ruimteVoor(plan, omsi(), userData(), false),
    ruimteMetCode: ruimteVoor(plan, omsi(), userData(), true)
  })

  handle('addon:kies', async (_event, soort: 'zip' | 'map') => {
    const keuze = await dialog.showOpenDialog({
      title: soort === 'zip' ? 'Kies een add-on (zip)' : 'Kies een uitgepakte add-on',
      properties: soort === 'zip' ? ['openFile'] : ['openDirectory'],
      filters: soort === 'zip' ? [{ name: 'Zip', extensions: ['zip'] }] : undefined
    })
    return keuze.canceled ? undefined : keuze.filePaths[0]
  })
  handle('addon:plan', (event, pad: string) =>
    eenTegelijk(async () => {
      const bron = openBron(String(pad))
      try {
        const plan = await inStukjes(planStappen(bron, omsi(), leesRegister(userData())), event.sender, 'plan')
        addonPlan = { pad: String(pad), plan }
        return { plan: planVoorVenster(plan) }
      } finally {
        bron.sluit()
      }
    })
  )
  handle('addon:installeer', (event, pad: string, naam?: string, metCode?: boolean) =>
    eenTegelijk(async () => {
      // Bestanden overschrijven die OMSI open heeft, gaat mis of half.
      if (await isOmsiRunning()) return { fout: 'omsi' }
      if (addonPlan?.pad !== String(pad)) return { fout: 'plan' }
      const plan = { ...addonPlan.plan, naam: String(naam ?? '').trim().slice(0, 80) || addonPlan.plan.naam }
      // Het venster zette de knop al uit; hier nog eens, want de schijf kan intussen voller zijn.
      if (!ruimteVoor(plan, omsi(), userData(), metCode === true).past) return { fout: 'ruimte' }
      const bron = openBron(String(pad))
      try {
        const uit = await inStukjes(
          installeerStappen(bron, plan, omsi(), userData(), new Date(), { metCode: metCode === true }),
          event.sender,
          'installeer'
        )
        // Lukt het register niet, dan gaat de installatie terug (`registreer`).
        registreer(userData(), omsi(), uit)
        log(
          `Add-on geïnstalleerd: ${uit.addon.naam} (${uit.geschreven} bestanden, ${uit.overschreven} overschreven, ` +
            `${uit.code} plugin, ${plan.geweigerd.length} geweigerd, ${plan.nooit.length} programma's niet)`
        )
        addonPlan = undefined
        // Er kunnen bussen en kaarten bij zijn: de lijsten opnieuw lezen.
        vergeetKaarten()
        bus3d().vergeet(uit.addon.bussen)
        vehicleTrackers.clear()
        return { id: uit.addon.id, geschreven: uit.geschreven, overschreven: uit.overschreven, code: uit.code }
      } finally {
        bron.sluit()
      }
    })
  )
  handle('addon:lijst', (): AddonOverzicht[] =>
    leesRegister(userData())
      .addons.map((a) => ({
        id: a.id,
        naam: a.naam,
        geinstalleerd: a.geinstalleerd,
        bestanden: a.bestanden.length,
        overschreven: a.bestanden.filter((b) => b.was === 'overschreven').length,
        bussen: a.bussen,
        kaarten: a.kaarten
      }))
      .reverse()
  )
  handle('addon:verwijder', (event, id: string) =>
    eenTegelijk(async () => {
      if (await isOmsiRunning()) return { fout: 'omsi' }
      const register = leesRegister(userData())
      const addon = register.addons.find((a) => a.id === String(id))
      if (!addon) return { fout: 'weg' }
      const uit = await inStukjes(verwijderStappen(addon, register, omsi(), userData()), event.sender, 'verwijder')
      schrijfRegister(userData(), { addons: register.addons.filter((a) => a.id !== addon.id) })
      rmSync(reserveMap(userData(), addon.id), { recursive: true, force: true })
      log(`Add-on verwijderd: ${addon.naam} (${uit.verwijderd} weg, ${uit.teruggezet} terug, ${uit.gewijzigd.length} aangepast en blijven staan)`)
      vergeetKaarten()
      bus3d().vergeet(addon.bussen)
      vehicleTrackers.clear()
      return { verwijderd: uit.verwijderd, teruggezet: uit.teruggezet, gebleven: uit.gebleven, gewijzigd: uit.gewijzigd.slice(0, 50) }
    })
  )
  /** Welke bussen en kaarten er staan, voor de foutcontrole. */
  handle('addon:inhoud', () => {
    const mappen = (sub: string, test: (map: string) => boolean): string[] => {
      try {
        const basis = join(omsi(), sub)
        return readdirSync(basis, { withFileTypes: true })
          .filter((d) => d.isDirectory() && test(join(basis, d.name)))
          .map((d) => d.name)
          .sort((a, b) => a.localeCompare(b))
      } catch {
        return []
      }
    }
    return {
      bussen: mappen('Vehicles', (m) => {
        try {
          return readdirSync(m).some((n) => /\.(bus|ovh)$/i.test(n))
        } catch {
          return false
        }
      }),
      kaarten: mappen('maps', (m) => existsSync(join(m, 'global.cfg')))
    }
  })
  handle('addon:controleer', (event, soort: 'bus' | 'kaart', naam: string): Promise<Controle | { fout: string }> =>
    eenTegelijk(() =>
      inStukjes(
        soort === 'kaart' ? controleerKaart(omsi(), String(naam)) : controleerBus(omsi(), String(naam)),
        event.sender,
        'controle'
      )
    )
  )

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
  { scheme: 'omsifoto', privileges: { standard: true, secure: true, supportFetchAPI: true } },
  /*
   * De plaatjes van een nagebouwd apparaatscherm, voor de overlay: alleen op id
   * uit het register van de huidige bus (main/schermtexturen.ts), nooit op pad.
   */
  { scheme: 'omsischerm', privileges: { standard: true, secure: true, supportFetchAPI: true } },
  /*
   * Bus3D: pakketten, texturen en heldenbeelden op id (main/bus3d.ts). Zonder
   * corsEnabled en zonder ACAO-kop: gemeten dat fetch zo werkt, vanuit de pagina
   * en vanuit een module-werker (bus3d-ontwerp bijlage B).
   */
  { scheme: 'omsi3d', privileges: { standard: true, secure: true, supportFetchAPI: true } }
])

/**
 * Een plaatje van een nagebouwd apparaatscherm: `omsischerm://t/<id>`. Alleen
 * twintig hextekens, en alleen wat in het register van de huidige bus staat.
 */
function schermplaatje(request: Request): Promise<Response> {
  const id = /^\/([0-9a-f]{20})$/.exec(new URL(request.url).pathname)?.[1]
  const plaatje = id ? schermtextuurOp(id) : undefined
  if (!plaatje) return Promise.resolve(new Response(null, { status: 404 }))
  return Promise.resolve(
    new Response(new Uint8Array(plaatje.bytes), {
      headers: { 'Content-Type': plaatje.type, 'Cache-Control': 'private, max-age=31536000, immutable' }
    })
  )
}

/**
 * Een getekende bus. Zelfde afspraak als bij de kaartplaatjes: één map, en de
 * naam komt uit het pad -- nooit iets anders van de schijf.
 */
function busplaatje(request: Request): Promise<Response> {
  const leeg = (): Promise<Response> => Promise.resolve(new Response(null, { status: 404 }))
  const map = busfotoMap(userData())
  const naam = decodeURIComponent(new URL(request.url).pathname).replace(/^\/+/, '')
  // De foto v4 uit de 3D-renderer (main/busfoto4.ts): eigen map, zelfde regel.
  const v4 = /^v4\/([a-f0-9]{16}(-[a-f0-9]{8})?\.webp)$/i.exec(naam)?.[1]
  if (v4) {
    const map4 = busfoto4Map(userData())
    const bestand4 = resolve(map4, v4)
    if (!bestand4.startsWith(resolve(map4) + sep) || !existsSync(bestand4)) return leeg()
    return net.fetch(pathToFileURL(bestand4).toString())
  }
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
     * Nog vóór het logboek: is deze exe ouder dan de versie die de
     * gebruikersmap het laatst bijwerkte, dan eerst vragen -- alleen bekijken
     * zet de app op een kopie van die map (main/versiewacht.ts).
     */
    if (bewaakVersie(__APP_VERSION__) === 'afsluiten') {
      app.quit()
      return
    }
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
      `OMSI Enhancer ${__APP_VERSION__} (${stempel()}) start -- Electron ${process.versions.electron}, ` +
        `Windows ${process.getSystemVersion?.() ?? ''}, ${process.arch}`
    )
    log(`gebruikersgegevens: ${userData()}`)
    const bekijken = alleenBekijken()
    if (bekijken) log(`alleen bekijken: de map werd bijgewerkt door ${bekijken.versie} (${bekijken.bouw ?? '?'}); er wordt niets opgeslagen`)
    /*
     * Knoppen die nog aan een toets moesten. De app kan dicht zijn geweest toen
     * OMSI afsloot; dan gebeurt het nu, of anders zodra OMSI dicht is. En
     * knoppen die nog op F10 of Shift+` staan: die verhuizen op hetzelfde moment.
     */
    let verkeerd = 0
    try {
      verkeerd = aantalVerbodenToetsen(omsi())
    } catch {
      // Nog geen OMSI gekozen; dan is er ook niets bijgeschreven.
    }
    /*
     * Niet in alleen-bekijken: keyboard.cfg is van OMSI, en `fs` weigert het
     * toch -- als onafgehandelde belofte in het logboek, en met een wachtrij
     * elke vijf tellen opnieuw zodra OMSI dicht was. De wachtrij blijft staan
     * voor de exe die wel mag schrijven.
     */
    if (!inBekijkstand() && (inDeWachtrij() > 0 || verkeerd > 0)) {
      void schrijfStraks('bij het starten van de app').then(() => {
        if (inDeWachtrij() > 0) wachtOpOmsiDicht()
      })
    }
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
    protocol.handle('omsischerm', schermplaatje)
    protocol.handle('omsi3d', (vraag) => bus3d().antwoord(vraag))
    bus3d().ruimOp()
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
    // De meetlus voor de rittenstaat; zie `meet`. En de getallen voor de plugin, ook zonder overlay.
    setInterval(() => {
      try {
        meet()
        const live = freshLive()
        if (live) werkGetallenBij(live)
      } catch (fout) {
        if (!spoorFoutGemeld) logFout('meetlus', fout)
        spoorFoutGemeld = true
      }
    }, 1000).unref?.()
    // De kaartverkoop (B6) en de meetstand, vier keer per seconde; zie `snelleLus`.
    meetstandAan = readSettings(userData()).meetstand === true
    let snelFoutGemeld = false
    setInterval(() => {
      try {
        snelleLus()
      } catch (fout) {
        // Eén keer: vier keer per seconde dezelfde fout hoort niet in het logboek.
        if (!snelFoutGemeld) logFout('snelle lus', fout)
        snelFoutGemeld = true
      }
    }, 250).unref?.()
    /*
     * Vrij rijden volgt ook met de overlay dicht: dan loopt `pushFrame` niet,
     * en het rijscherm hoort toch te weten wat OMSI rijdt. Kijkt de overlay of
     * een toestel, dan doet `pushFrame` het al.
     */
    setInterval(() => {
      try {
        if (vrijeRit && !overlayIsOpen() && !apparaatKijkt()) void volgOmloopInOmsi(freshLive())
      } catch (fout) {
        logFout('vrij rijden volgen', fout)
      }
    }, 1000).unref?.()
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
    // Een fout hierboven mag nooit een app zonder venster achterlaten; zie `meldStartFout`.
  }).catch((fout) => meldStartFout(fout, Boolean(mainWindow && !mainWindow.isDestroyed())))

  app.on('before-quit', () => {
    stopApparaat()
    if (apparaatTimer) clearInterval(apparaatTimer)
    apparaatTimer = undefined
    sluitBusfotoVenster()
    busfoto4?.sluit()
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
