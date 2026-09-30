import { createHash } from 'node:crypto'
import { closeSync, existsSync, openSync, readdirSync, readFileSync, readSync, statSync } from 'node:fs'
import { open } from 'node:fs/promises'
import { basename, dirname, join, relative } from 'node:path'
import { readOmsiLines } from './omsiFile'
import { leesSchermcfg, materiaalcontexten, type CfgMateriaal, type CfgMateriaalstand, type CfgMesh } from './schermcfg'
import { ontleedO3d, type O3dModel } from './o3d'
import { leesKleurstellingen, textuurSleutel, zoekKleurstelling, type Kleurstellingen } from './kleurstelling'
import { trailerOf } from './trailer'
import { busLijsten, busRust, type RustInvoerDeel } from './busrust'
import { KOP_BYTES, textuurKop, type TextuurKop } from '../shared/beeldlezers'
import { magOntwarren, ontwar } from '../shared/o3dhussel'
import { PakStaart } from '../shared/bus3dpak'
import type {
  Bus3dLak,
  Bus3dManifest,
  Bus3dMateriaal,
  Bus3dMateriaalstand,
  Bus3dPakKop,
  Bus3dReden,
  Bus3dStuk,
  Bus3dTextuur,
  Bus3dVermelding,
  V3
} from '../shared/bus3d'

/**
 * EEN BUS LEZEN ZOALS OMSI HEM TEKENT, VOOR DE 3D-WEERGAVE ("BUS3D")
 *
 * Dit draait in de werker `'bus3d'` (main/kaartwerker.ts) en bouwt per bus een
 * PAKKET (bus3d-ontwerp §4.1, §5.1): de geometrie per (deel, o3d), de
 * vermeldingen uit de model.cfg met hun `[visible]`-voorwaarden en materialen,
 * en de textuurlijst met alleen de KOPPEN van de bestanden. De pixels van de
 * texturen komen hier niet langs: die stromen later rechtstreeks uit de
 * OMSI-map naar de renderer-werker (`omsi3d://t/<id>`).
 *
 * WAT ER GELEZEN WORDT, EN WAAR HET VANDAAN KOMT
 * - De .bus: `[model]`, `[friendlyname]`, `[description]`, `[boundingbox]`,
 *   `[couple_back]`, `[coupling_back]`/`[coupling_front]`, `[add_camera_driver]`.
 *   Een kop telt alleen als de hele regel er gelijk aan is, zoals OMSI leest.
 * - De model.cfg met de lezer die met het spel geijkt is (core/schermcfg.ts):
 *   geen vierde cfg-lezer.
 * - De o3d's met core/o3d.ts, ook de gehusselde (optie `gehusseld`).
 * - De kleurstellingen met core/kleurstelling.ts.
 *
 * WAT IN BEELD KOMT (§5.1)
 * - Viewpoint 0 of bit 1 (buiten). Viewpoint 2 (alleen binnen) gaat mee, met een
 *   vlag, voor Instappen (F5). Viewpoint 4 (alleen AI) valt weg.
 * - Bij `[LOD]` alleen de groep met de hoogste waarde, plus wat ervoor staat.
 * - Dubbele vermeldingen blijven vermeldingen; hun geometrie wordt gedeeld.
 *
 * VERSLEUTELDE MODELLEN (Lucs keuze 1, 28-09-2026; §5.1)
 * - Sleutel 0 en elke sleutel die in OMSI geregistreerd en bevestigd is
 *   (core/omsiregistratie.ts) worden getoond; een andere sleutel laten we weg,
 *   zoals OMSI hem weigert. Meer dan 10% van de unieke buiten-o3d's weggelaten:
 *   `'versleuteld'` (het icoon met uitleg).
 * - Het pakket bewaart het hoekpuntblok van ELKE o3d byte voor byte zoals in het
 *   bronbestand, ook een gehusseld blok. Ontwarren gebeurt hier alleen in het
 *   geheugen, voor de doostoets en de oppervlakken; alleen die GETALLEN gaan het
 *   pakket in. Ontwarde meetkunde komt nooit op schijf.
 *
 * TEXTUREN ZOEKEN ZOALS OMSI (§5.1)
 * Per map eerst de exacte naam, dan dezelfde naam met dds, bmp, tga, jpg en png;
 * pas daarna de volgende map. De mappen: `<bus>\Texture`, `<model>\Texture`,
 * `<model>`, de Texture-map naast de modelmap, `OMSI\Texture`. Niet door de hele
 * voertuigmap zoeken: daar staan duizenden repaint-texturen in submappen. De
 * texturen van een kleurstelling komen uit de .cti (`bus3dLak`).
 *
 * Er zit geen Electron in dit bestand: het draait in een worker_thread, en de
 * probe (scripts/probe-bus3d.ts) roept het rechtstreeks aan.
 */

/** Wat de .bus zegt, in de assen van OMSI waar het om maten gaat. */
export interface BusBestand {
  model?: string
  naam: [string, string, string]
  beschrijving?: string
  /** `[boundingbox]`: grootte x, y (vooruit), z (omhoog), dan het midden. */
  doos?: { grootte: V3; midden: V3 }
  aanhanger?: string
  koppelAchter?: V3
  koppelVoor?: V3
  bestuurder?: V3
}

const getal = (s: string | undefined): number => {
  const t = (s ?? '').trim()
  return t === '' ? Number.NaN : Number(t)
}

/** De .bus lezen; alleen de koppen die de 3D-weergave nodig heeft. */
export function leesBusBestand(busPad: string): BusBestand | undefined {
  let regels: string[]
  try {
    regels = readOmsiLines(busPad)
  } catch {
    return undefined
  }
  const uit: BusBestand = { naam: ['', '', ''] }
  const drie = (i: number): V3 | undefined => {
    const w = [getal(regels[i + 1]), getal(regels[i + 2]), getal(regels[i + 3])]
    return w.every(Number.isFinite) ? (w as V3) : undefined
  }
  for (let i = 0; i < regels.length; i++) {
    const kop = regels[i]
    if (kop === '[model]') uit.model = (regels[i + 1] ?? '').trim() || undefined
    else if (kop === '[friendlyname]') {
      uit.naam = [(regels[i + 1] ?? '').trim(), (regels[i + 2] ?? '').trim(), (regels[i + 3] ?? '').trim()]
    } else if (kop === '[description]') {
      const tekst: string[] = []
      for (let k = i + 1; k < regels.length && regels[k] !== '[end]'; k++) tekst.push(regels[k])
      const samen = tekst.join('\n').trim()
      if (samen) uit.beschrijving = samen
    } else if (kop === '[boundingbox]') {
      const w = [1, 2, 3, 4, 5, 6].map((k) => getal(regels[i + k]))
      if (w.every(Number.isFinite) && w[0] > 0 && w[1] > 0 && w[2] > 0) {
        uit.doos = { grootte: [w[0], w[1], w[2]], midden: [w[3], w[4], w[5]] }
      }
    } else if (kop === '[couple_back]') uit.aanhanger = (regels[i + 1] ?? '').trim() || undefined
    else if (kop === '[coupling_back]') uit.koppelAchter = drie(i)
    else if (kop === '[coupling_front]') uit.koppelVoor = drie(i)
    else if (kop === '[add_camera_driver]' && !uit.bestuurder) uit.bestuurder = drie(i)
  }
  return uit
}

/** OMSI-assen (x rechts, y vooruit, z omhoog) naar o3d-assen (x, y omhoog, z vooruit). */
const naarO3d = (p: V3): V3 => [p[0], p[2], p[1]]

/**
 * De beschrijvingen uit de `.dsc`-bestanden naast de .bus: `<stam>_ENG.dsc`,
 * `_DEU.dsc`, `_FRA.dsc` ... De Duitse tekst staat vaak in de .bus zelf.
 * `opBestand` hoort elk .dsc dat gelezen wordt (voor de bronnen van het pakket).
 */
export function leesBeschrijvingen(busPad: string, opBestand?: (pad: string) => void): Record<string, string> {
  const uit: Record<string, string> = {}
  const map = dirname(busPad)
  const stam = basename(busPad).replace(/\.[^.]+$/, '').toLowerCase()
  let namen: string[]
  try {
    namen = readdirSync(map)
  } catch {
    return uit
  }
  for (const naam of namen) {
    const m = /^(.*)_([a-z]{3})\.dsc$/i.exec(naam)
    if (!m || m[1].toLowerCase() !== stam) continue
    opBestand?.(join(map, naam))
    let regels: string[]
    try {
      regels = readOmsiLines(join(map, naam))
    } catch {
      continue
    }
    const i = regels.indexOf('[description]')
    if (i < 0) continue
    const tekst: string[] = []
    for (let k = i + 1; k < regels.length && regels[k] !== '[end]'; k++) tekst.push(regels[k])
    const samen = tekst.join('\n').trim()
    if (samen) uit[m[2].toUpperCase()] = samen
  }
  return uit
}

// ------------------------------------------------------------ texturen zoeken

const UITBREIDINGEN = ['dds', 'bmp', 'tga', 'jpg', 'png']

/**
 * Bestanden zoeken zoals Windows en OMSI: zonder hoofdlettergevoel, met een
 * geheugen per map (één `readdir` per map in plaats van vijf `stat`s per naam
 * per map).
 */
export class TextuurZoeker {
  private mappen = new Map<string, Map<string, string> | null>()

  private inhoud(map: string): Map<string, string> | null {
    const sleutel = map.toLowerCase()
    const bekend = this.mappen.get(sleutel)
    if (bekend !== undefined) return bekend
    let lijst: Map<string, string> | null = null
    try {
      lijst = new Map()
      for (const naam of readdirSync(map)) lijst.set(naam.toLowerCase(), naam)
    } catch {
      lijst = null
    }
    this.mappen.set(sleutel, lijst)
    return lijst
  }

  /** Eén pad ten opzichte van een map, als het een bestand is. */
  private bestand(map: string, rel: string): string | undefined {
    const delen = rel.split(/[\\/]+/).filter(Boolean)
    if (delen.length === 0) return undefined
    let hier = map
    for (let i = 0; i < delen.length; i++) {
      const lijst = this.inhoud(hier)
      // Windows: een laatste punt of spatie telt niet mee.
      const naam = delen[i].replace(/[. ]+$/, '').toLowerCase()
      const echt = lijst?.get(naam)
      if (!echt) return undefined
      hier = join(hier, echt)
    }
    return hier
  }

  /** De textuur `naam` in de eerste map die hem heeft; per map eerst exact, dan de andere extensies. */
  vind(naam: string, mappen: string[]): string | undefined {
    const schoon = naam.trim()
    if (!schoon) return undefined
    const punt = schoon.lastIndexOf('.')
    const stam = punt > 0 && !/[\\/]/.test(schoon.slice(punt)) ? schoon.slice(0, punt) : schoon
    for (const map of mappen) {
      const exact = this.bestand(map, schoon)
      if (exact) return exact
      for (const ext of UITBREIDINGEN) {
        const ander = this.bestand(map, `${stam}.${ext}`)
        if (ander) return ander
      }
    }
    return undefined
  }

  /** Voor de bronnenlijst: de mappen die we bekeken (hun wijzigingstijd zegt of er iets bij kwam). */
  bekekenMappen(): string[] {
    return [...this.mappen.keys()]
  }
}

/** De zoekmappen voor de texturen van één deel (§5.1). */
export function textuurMappen(omsiMap: string, busPad: string, modelcfg: string): string[] {
  const modelmap = dirname(modelcfg)
  const kandidaten = [
    join(dirname(busPad), 'Texture'),
    join(modelmap, 'Texture'),
    modelmap,
    join(dirname(modelmap), 'Texture'),
    join(omsiMap, 'Texture')
  ]
  const gezien = new Set<string>()
  return kandidaten.filter((m) => {
    const k = m.toLowerCase()
    if (gezien.has(k)) return false
    gezien.add(k)
    return true
  })
}

// ------------------------------------------------------------ textuurkoppen

/** Wat main nodig heeft om `t/<id>` te geven: het pad blijft in main, nooit in het venster. */
export interface Bus3dTextuurBron {
  id: string
  pad: string
  grootte: number
  mtime: number
  mime: string
}

/** Het id van een textuurbestand: hangt aan pad, grootte en tijd, dus een gewijzigd bestand krijgt een nieuw id. */
export function textuurId(pad: string, grootte: number, mtime: number): string {
  return createHash('sha1').update(`t|${pad.toLowerCase()}|${grootte}|${Math.round(mtime)}`).digest('hex')
}

/** Het begin van een bestand (hooguit `KOP_BYTES`), of het hele bestand bij een JPEG die meer nodig heeft. */
function leesBegin(pad: string, grootte: number): Uint8Array {
  const n = Math.min(grootte, KOP_BYTES)
  const buf = Buffer.alloc(n)
  const fd = openSync(pad, 'r')
  try {
    readSync(fd, buf, 0, n, 0)
  } finally {
    closeSync(fd)
  }
  return buf
}

export type TextuurKopUitkomst =
  | { kop: TextuurKop; grootte: number; mtime: number }
  | { klacht: string; detail: string }

/** De kop van één textuurbestand, met zijn grootte en tijd. */
export function leesTextuurKop(pad: string): TextuurKopUitkomst {
  let grootte: number
  let mtime: number
  try {
    const st = statSync(pad)
    grootte = st.size
    mtime = st.mtimeMs
  } catch (fout) {
    return { klacht: 'onleesbaar', detail: (fout as Error).message }
  }
  try {
    let begin = leesBegin(pad, grootte)
    let kop = textuurKop(begin, grootte)
    // Een JPEG met een grote EXIF-kop: dan het hele bestand.
    if ('klacht' in kop && kop.klacht === 'afgekapt' && grootte > begin.length && begin[0] === 0xff) {
      begin = readFileSync(pad)
      kop = textuurKop(begin, grootte)
    }
    if ('klacht' in kop) return { klacht: kop.klacht, detail: kop.detail }
    return { kop, grootte, mtime }
  } catch (fout) {
    return { klacht: 'onleesbaar', detail: (fout as Error).message }
  }
}

function mimeVan(kop: TextuurKop): string {
  if (kop.mime) return kop.mime
  return 'application/octet-stream'
}

// ------------------------------------------------------------ het pakket bouwen

export interface Bus3dBouwInvoer {
  omsiMap: string
  /** Het .bus-pad ten opzichte van de OMSI-map. */
  relatiefPad: string
  /** Bevestigde o3d-sleutels (zonder 0; die mag altijd), uit core/omsiregistratie.ts. */
  geregistreerd: ReadonlySet<number>
  /**
   * Zodra de textuurlijst er is (§4.1: het tussenbericht `lijst`), met de paden
   * voor het register van main: zo kan het venster de texturen al ophalen terwijl
   * de rest nog gebouwd wordt.
   */
  opLijst?: (texturen: Bus3dTextuur[], bronnen: Bus3dTextuurBron[]) => void
  /** Hoe ver het lezen is: elke ≤ 250 ms. */
  opVoortgang?: (klaar: number, totaal: number) => void
  /** Alleen voor de diagnose (probe): het pakket ook als de doostoets van §16 faalt. */
  zonderDoostoets?: boolean
}

/** Een bronbestand van het pakket, met wat er bij het bouwen van bekend was. */
export interface Bus3dBron {
  pad: string
  grootte: number
  mtime: number
}

export interface Bus3dBouw {
  manifest: Bus3dManifest
  kop: Bus3dPakKop
  staart: PakStaart
  /** Alles waar het pakket van afhangt: bij een verschil is het pakket verouderd. */
  bronnen: Bus3dBron[]
  textuurBronnen: Bus3dTextuurBron[]
  /** De doostoets van §16, in hoekpunten. */
  doostoets?: { gehusseld: number; gehusseldBuiten: number; open: number; openBuiten: number }
  /** Waar de tijd heen ging, in ms. */
  tijden: Record<string, number>
}

export type Bus3dBouwUitkomst =
  | { bouw: Bus3dBouw }
  | { reden: Bus3dReden; detail: string; sleutels?: number[]; bouw?: undefined }

/** Grens voor 'te-zwaar' (§9). */
export const MAX_DRIEHOEKEN = 3_000_000

/** Een gelezen o3d, gedeeld door alle vermeldingen ervan. */
interface GelezenStuk {
  stuk: number
  model: O3dModel
  /** De bytes van het hoekpuntblok, zoals in het bestand (voor het pakket). */
  rauw: Uint8Array
  /** Ontward in het geheugen, 8 floats per hoekpunt: alleen voor oppervlak en doos. */
  floats: Float32Array
  gehusseld: boolean
  /** Per o3d-materiaal: de textuur (index in de lijst) of -1. */
  textuurPerMateriaal: number[]
  gebruiktBuiten: boolean
}

/** Hoeveel bestanden tegelijk gelezen worden (§10: de tijden voor "nieuw"). */
const TEGELIJK = 8

/**
 * Bestanden parallel lezen. Eén voor één kost het openen op Windows ongeveer
 * 0,75 ms per bestand, ook warm: de 706 o3d's van de NLC 12C 530 ms. Met acht
 * tegelijk (de libuv-draden doen het werk) 150 ms (gemeten 29-09-2026).
 */
async function leesParallel<T>(paden: string[], lees: (pad: string) => Promise<T>): Promise<Array<T | Error>> {
  const uit: Array<T | Error> = new Array(paden.length)
  let volgende = 0
  await Promise.all(
    Array.from({ length: Math.min(TEGELIJK, paden.length) }, async () => {
      while (volgende < paden.length) {
        const i = volgende++
        try {
          uit[i] = await lees(paden[i])
        } catch (fout) {
          uit[i] = fout instanceof Error ? fout : new Error(String(fout))
        }
      }
    })
  )
  return uit
}

/** De kop van een textuur, asynchroon: stat en het begin in één geopend bestand. */
async function leesTextuurKopAsync(pad: string): Promise<TextuurKopUitkomst> {
  let handvat: Awaited<ReturnType<typeof open>> | undefined
  try {
    handvat = await open(pad, 'r')
    const st = await handvat.stat()
    const n = Math.min(st.size, KOP_BYTES)
    const begin = Buffer.alloc(n)
    await handvat.read(begin, 0, n, 0)
    let kop = textuurKop(begin, st.size)
    if ('klacht' in kop && kop.klacht === 'afgekapt' && st.size > n && begin[0] === 0xff) {
      const alles = Buffer.alloc(st.size)
      await handvat.read(alles, 0, st.size, 0)
      kop = textuurKop(alles, st.size)
    }
    if ('klacht' in kop) return { klacht: kop.klacht, detail: kop.detail }
    return { kop, grootte: st.size, mtime: st.mtimeMs }
  } catch (fout) {
    return { klacht: 'onleesbaar', detail: (fout as Error).message }
  } finally {
    await handvat?.close().catch(() => undefined)
  }
}

/**
 * Het pakket van één bus bouwen. Gooit niet: wat niet lukt wordt een reden.
 *
 * In fasen, zodat het wachten op de schijf parallel gaat: (1) welke meshes, en
 * hun o3d's tegelijk lezen; (2) de o3d's ontleden en de textuurnamen zoeken;
 * (3) de textuurkoppen tegelijk lezen -- dan staat de lijst er (`opLijst`);
 * (4) de vermeldingen met hun materialen; (5) oppervlakken, doos, id.
 */
export async function bouwBus3d(invoer: Bus3dBouwInvoer): Promise<Bus3dBouwUitkomst> {
  const t0 = performance.now()
  const tijden: Record<string, number> = {}
  const { omsiMap, relatiefPad, geregistreerd } = invoer
  const busPad = join(omsiMap, relatiefPad)
  const bus = leesBusBestand(busPad)
  if (!bus?.model) return { reden: 'geen-model', detail: bus ? 'geen [model] in de .bus' : 'de .bus is niet te lezen' }

  // ---------------------------------------------------------- delen
  interface Deel {
    busPad: string
    rel: string
    bus: BusBestand
    verschuiving: V3
    modelcfg: string
  }
  const delen: Deel[] = [
    { busPad, rel: relatiefPad, bus, verschuiving: [0, 0, 0], modelcfg: join(dirname(busPad), ...bus.model.split(/[\\/]+/)) }
  ]
  /*
   * De aanhanger(s): de plek volgt uit de twee koppelpunten, als vector (OMSI:
   * x, y vooruit, z omhoog). Geen koppelpunten, dan de afstand van trailerOf.
   */
  for (let k = 0; k < 3; k++) {
    const voor = delen[delen.length - 1]
    const aanhanger = trailerOf(omsiMap, voor.rel)
    if (!aanhanger) break
    const pad = join(omsiMap, aanhanger.relativePath)
    const achterBus = leesBusBestand(pad)
    if (!achterBus?.model) break
    let verschuiving: V3
    if (voor.bus.koppelAchter && achterBus.koppelVoor) {
      const d = naarO3d([
        voor.bus.koppelAchter[0] - achterBus.koppelVoor[0],
        voor.bus.koppelAchter[1] - achterBus.koppelVoor[1],
        voor.bus.koppelAchter[2] - achterBus.koppelVoor[2]
      ])
      verschuiving = [voor.verschuiving[0] + d[0], voor.verschuiving[1] + d[1], voor.verschuiving[2] + d[2]]
    } else {
      verschuiving = [voor.verschuiving[0], voor.verschuiving[1], voor.verschuiving[2] - aanhanger.distance]
    }
    delen.push({
      busPad: pad,
      rel: aanhanger.relativePath,
      bus: achterBus,
      verschuiving,
      modelcfg: join(dirname(pad), ...achterBus.model.split(/[\\/]+/))
    })
  }

  const zoeker = new TextuurZoeker()
  const bronnen = new Map<string, Bus3dBron>()
  const stempel = (pad: string, grootte?: number): void => {
    const k = pad.toLowerCase()
    if (bronnen.has(k)) return
    try {
      const st = statSync(pad)
      bronnen.set(k, { pad, grootte: grootte ?? st.size, mtime: Math.round(st.mtimeMs) })
    } catch {
      bronnen.set(k, { pad, grootte: -1, mtime: -1 })
    }
  }

  const cfgs = delen.map((d) => leesSchermcfg(d.modelcfg))
  if (!cfgs[0]) return { reden: 'geen-model', detail: `model.cfg niet te lezen: ${relative(omsiMap, delen[0].modelcfg)}` }
  tijden.cfg = Math.round(performance.now() - t0)

  // ---------------------------------------------------------- fase 1: welke meshes, o3d's lezen
  interface Keus {
    d: number
    mesh: CfgMesh
    buiten: boolean
    binnen: boolean
    /** Telt voor de 10%-regel en de oppervlakken: buiten en geen schaduw. */
    telt: boolean
  }
  const keuzes: Keus[] = []
  const mappenPerDeel: string[][] = []
  const ctcPerDeel: Array<Map<string, string>> = []
  let totaal = 0
  /** Buitenmeshes volgens de cfg, en hoeveel daarvan hun o3d mist (voor bv.incomplete). */
  let buitenMeshes = 0
  let buitenMeshesWeg = 0
  for (let d = 0; d < delen.length; d++) {
    const deel = delen[d]
    const cfg = cfgs[d]
    mappenPerDeel.push(textuurMappen(omsiMap, deel.busPad, deel.modelcfg))
    const ctc = new Map<string, string>()
    const kleuren = leesKleurstellingen(deel.modelcfg, dirname(deel.busPad))
    if (kleuren) for (const [plek, standaard] of Object.entries(kleuren.plekken)) ctc.set(textuurSleutel(standaard), plek)
    ctcPerDeel.push(ctc)
    if (!cfg) continue
    stempel(deel.busPad)
    stempel(deel.modelcfg)
    if (kleuren) stempel(kleuren.map)
    let hoogsteLod = -1
    if (cfg.lods.length > 0) {
      let beste = -Infinity
      cfg.lods.forEach((w, i) => {
        if (w > beste) {
          beste = w
          hoogsteLod = i
        }
      })
    }
    /*
     * De mappen van ALLE [mesh]-regels als bron, ook van o3d's die er (nog) niet
     * zijn of niet in beeld komen: verschijnt of verdwijnt er een, dan verandert
     * de tijd van zijn map, en dan zijn de stukken en de mesh-nummers van het
     * pakket niet meer goed. Een ontbrekende o3d was geen bron (aanvalsverslag
     * F1, punt 9a), en bleef dan voor altijd weg.
     */
    for (const mesh of cfg.meshes) if (mesh.pad.trim()) stempel(dirname(mesh.bestand))
    for (const mesh of cfg.meshes) {
      if (hoogsteLod >= 0 && mesh.lod >= 0 && mesh.lod !== hoogsteLod) continue
      const vp = mesh.aanzicht
      if (mesh.pad.trim() && (vp === 0 || (vp & 1) !== 0)) {
        buitenMeshes++
        if (!mesh.bestaat) buitenMeshesWeg++
      }
      if (!mesh.bestaat) continue
      const buiten = vp === 0 || (vp & 1) !== 0
      const binnen = !buiten && (vp & 2) !== 0
      if (!buiten && !binnen) continue
      keuzes.push({ d, mesh, buiten, binnen, telt: buiten && !mesh.schaduw })
    }
  }
  const o3dSleutel = (k: Keus): string => `${k.d}|${k.mesh.bestand.toLowerCase()}`
  const o3dPaden: string[] = []
  const o3dPlek = new Map<string, number>()
  for (const k of keuzes) {
    const pad = k.mesh.bestand.toLowerCase()
    if (o3dPlek.has(pad)) continue
    o3dPlek.set(pad, o3dPaden.length)
    o3dPaden.push(k.mesh.bestand)
  }
  totaal = o3dPaden.length
  let gelezenAantal = 0
  let laatsteMelding = performance.now()
  const tLezen = performance.now()
  const o3dBytes = await leesParallel(o3dPaden, async (pad) => {
    // Openen, grootte en tijd, en lezen in één keer: een losse `stat` per o3d kost weer 0,2 ms.
    const handvat = await open(pad, 'r')
    let b: Buffer
    try {
      const st = await handvat.stat()
      b = Buffer.alloc(st.size)
      let gelezen = 0
      while (gelezen < st.size) {
        const { bytesRead } = await handvat.read(b, gelezen, st.size - gelezen, gelezen)
        if (bytesRead === 0) break
        gelezen += bytesRead
      }
      bronnen.set(pad.toLowerCase(), { pad, grootte: st.size, mtime: Math.round(st.mtimeMs) })
    } finally {
      await handvat.close()
    }
    gelezenAantal++
    if (invoer.opVoortgang && performance.now() - laatsteMelding > 250) {
      laatsteMelding = performance.now()
      invoer.opVoortgang(gelezenAantal, totaal)
    }
    return b
  })
  tijden.o3dLezen = Math.round(performance.now() - tLezen)

  // ---------------------------------------------------------- fase 2: o3d's ontleden, namen zoeken
  const tOntleed = performance.now()
  const staart = new PakStaart()
  const stukken: Bus3dStuk[] = []
  const gelezen: GelezenStuk[] = []
  const stukOpSleutel = new Map<string, GelezenStuk | 'versleuteld' | 'kapot'>()
  const sleutels = new Set<number>()
  const versleuteldeO3d: Array<{ o3d: string; sleutel: number }> = []
  let ontward = 0
  const buitenO3d = new Set<string>()
  const buitenWeg = new Set<string>()

  /** Textuurpaden in volgorde van eerste gebruik, met hun CTC-plek. */
  const padLijst: Array<{ pad: string; ctc?: string }> = []
  const padPlek = new Map<string, number>()
  const ontbrekend = new Set<string>()
  const padVoorNaam = (naam: string | undefined, d: number, ctc?: string): number | undefined => {
    const schoon = (naam ?? '').trim()
    if (!schoon) return undefined
    const pad = zoeker.vind(schoon, mappenPerDeel[d])
    if (!pad) {
      ontbrekend.add(schoon)
      return undefined
    }
    const k = pad.toLowerCase()
    let i = padPlek.get(k)
    if (i === undefined) {
      i = padLijst.length
      padPlek.set(k, i)
      padLijst.push({ pad, ctc })
    } else if (ctc && !padLijst[i].ctc) padLijst[i].ctc = ctc
    return i
  }

  const stukVoor = (k: Keus): GelezenStuk | 'versleuteld' | 'kapot' => {
    const sleutel = o3dSleutel(k)
    const bekend = stukOpSleutel.get(sleutel)
    if (bekend) return bekend
    const bytes = o3dBytes[o3dPlek.get(k.mesh.bestand.toLowerCase()) ?? -1]
    if (!bytes || bytes instanceof Error) {
      stukOpSleutel.set(sleutel, 'kapot')
      return 'kapot'
    }
    const model = ontleedO3d(bytes, { gehusseld: true }).model
    if (!model || model.hoekpuntBegin === undefined || model.triangles.length === 0) {
      stukOpSleutel.set(sleutel, 'kapot')
      return 'kapot'
    }
    if (model.hussel && !magOntwarren(model.hussel.sleutel, geregistreerd)) {
      versleuteldeO3d.push({ o3d: basename(k.mesh.bestand), sleutel: model.hussel.sleutel >>> 0 })
      stukOpSleutel.set(sleutel, 'versleuteld')
      return 'versleuteld'
    }
    const n = model.vertices.length / 3
    const rauw = bytes.subarray(model.hoekpuntBegin, model.hoekpuntBegin + n * 32)
    // Een eigen, uitgelijnde kopie om mee te rekenen; die gaat NIET naar het pakket.
    const floats = new Float32Array(new Uint8Array(rauw).buffer, 0, n * 8)
    if (model.hussel) {
      ontwar(floats, model.hussel)
      sleutels.add(model.hussel.sleutel >>> 0)
      ontward++
    }

    // Driehoeken op materiaal sorteren (tellend sorteren). Ook materiaalnummers
    // buiten de lijst (195 bestanden) krijgen een groep; zie o3d.ts.
    let maxMat = Math.max(model.materialen.length, 1)
    for (let t = 0; t < model.materiaalPerDriehoek.length; t++) {
      if (model.materiaalPerDriehoek[t] + 1 > maxMat) maxMat = model.materiaalPerDriehoek[t] + 1
    }
    const perMat = new Uint32Array(maxMat)
    for (let t = 0; t < model.materiaalPerDriehoek.length; t++) perMat[model.materiaalPerDriehoek[t]]++
    const begin = new Uint32Array(maxMat)
    for (let m = 1; m < maxMat; m++) begin[m] = begin[m - 1] + perMat[m - 1] * 3
    const breed: 2 | 4 = n <= 0xffff ? 2 : 4
    const indices = breed === 2 ? new Uint16Array(model.triangles.length) : new Uint32Array(model.triangles.length)
    const plek = begin.slice()
    for (let t = 0; t < model.materiaalPerDriehoek.length; t++) {
      const m = model.materiaalPerDriehoek[t]
      const o = plek[m]
      indices[o] = model.triangles[t * 3]
      indices[o + 1] = model.triangles[t * 3 + 1]
      indices[o + 2] = model.triangles[t * 3 + 2]
      plek[m] = o + 3
    }
    const groepen: Bus3dStuk['groepen'] = []
    for (let m = 0; m < maxMat; m++) if (perMat[m] > 0) groepen.push({ materiaal: m, begin: begin[m], aantal: perMat[m] * 3 })

    const stuk: Bus3dStuk = {
      deel: k.d,
      o3d: basename(k.mesh.bestand),
      n,
      hoekpunten: staart.voegToe(rauw),
      hussel: model.hussel
        ? { versie: model.hussel.versie, vlag: model.hussel.vlag, sleutel: model.hussel.sleutel >>> 0 }
        : undefined,
      indices: { ...staart.voegToe(new Uint8Array(indices.buffer, 0, indices.byteLength)), breed },
      groepen,
      materiaalnamen: model.materialen.map((m) => m.textuur)
    }
    stukken.push(stuk)
    const g: GelezenStuk = {
      stuk: stukken.length - 1,
      model,
      rauw,
      floats,
      gehusseld: Boolean(model.hussel),
      // Voorlopig een plek in `padLijst`; na fase 3 een plek in de textuurlijst.
      textuurPerMateriaal: model.materialen.map(
        (mat) => padVoorNaam(mat.textuur, k.d, ctcPerDeel[k.d].get(textuurSleutel(mat.textuur))) ?? -1
      ),
      gebruiktBuiten: false
    }
    gelezen.push(g)
    stukOpSleutel.set(sleutel, g)
    return g
  }

  const gekozen: Array<{ k: Keus; g: GelezenStuk }> = []
  for (const k of keuzes) {
    if (k.telt) buitenO3d.add(o3dSleutel(k))
    const s = stukVoor(k)
    if (s === 'versleuteld') {
      if (k.telt) buitenWeg.add(o3dSleutel(k))
      continue
    }
    if (s === 'kapot') continue
    if (k.telt) s.gebruiktBuiten = true
    gekozen.push({ k, g: s })
    /*
     * De texturen die de cfg zelf noemt (transmap, masker, bump, light- en
     * nightmap, freetex), MET hun CTC-plek: ook die vervangt een kleurstelling
     * (de `_trans` van de NLC bij "Rheinhausen", SD80_trans, de maskers van de
     * MAN SG ...). Zonder plek kreeg zo'n kleurstelling in 3D het doorzicht van de
     * standaard: 318 vervangingen in 66 bussen (aanvalsverslag F1, punt 4).
     */
    const metPlek = (naam: string | undefined): void => {
      if (naam) padVoorNaam(naam, k.d, ctcPerDeel[k.d].get(textuurSleutel(naam)))
    }
    for (const mat of k.mesh.materialen) {
      for (const stand of [mat, ...mat.items]) {
        if (stand.transmap && !/^\\S:/i.test(stand.transmap)) metPlek(stand.transmap)
        if (stand.envmapMasker) metPlek(stand.envmapMasker)
        if (stand.bumpmap) metPlek(stand.bumpmap.textuur)
        if (stand.lightmap) metPlek(stand.lightmap.textuur)
        if (stand.nightmap) metPlek(stand.nightmap)
        if (stand.freetex) metPlek(stand.freetex.standaard)
      }
    }
  }
  tijden.ontleden = Math.round(performance.now() - tOntleed)

  // ---------------------------------------------------------- de 10%-regel (§5.1)
  if (buitenO3d.size > 0 && buitenWeg.size / buitenO3d.size > 0.1) {
    const onbekend = [...new Set(versleuteldeO3d.map((v) => v.sleutel))].sort((a, b) => a - b)
    return {
      reden: 'versleuteld',
      detail: `${buitenWeg.size} van ${buitenO3d.size} buiten-o3d's met een sleutel die hier niet geregistreerd is (${onbekend.join(', ')})`,
      sleutels: onbekend
    }
  }
  if (stukken.length === 0) return { reden: 'geen-model', detail: 'geen enkele o3d te lezen' }

  let driehoeken = 0
  for (const g of gelezen) driehoeken += g.model.triangles.length / 3
  if (driehoeken > MAX_DRIEHOEKEN) return { reden: 'te-zwaar', detail: `${driehoeken} driehoeken` }

  // ---------------------------------------------------------- fase 3: textuurkoppen
  const tKoppen = performance.now()
  const koppen = await leesParallel(padLijst.map((p) => p.pad), leesTextuurKopAsync)
  const texturen: Bus3dTextuur[] = []
  const textuurBronnen: Bus3dTextuurBron[] = []
  const onleesbaar = new Map<string, string>()
  /** Van plek in `padLijst` naar plek in `texturen`, of -1. */
  const naarLijst = new Int32Array(padLijst.length).fill(-1)
  padLijst.forEach(({ pad, ctc }, i) => {
    const uit = koppen[i]
    if (uit instanceof Error || 'klacht' in uit) {
      onleesbaar.set(basename(pad), uit instanceof Error ? uit.message : `${uit.klacht}: ${uit.detail}`)
      return
    }
    const id = textuurId(pad, uit.grootte, uit.mtime)
    naarLijst[i] = texturen.length
    texturen.push({
      id,
      soort: uit.kop.route,
      formaat: uit.kop.formaat,
      srgb: true,
      b: uit.kop.b,
      h: uit.kop.h,
      mips: uit.kop.mips,
      niveaus: uit.kop.niveaus,
      mime: uit.kop.mime,
      vorm: uit.kop.vorm,
      bytes: uit.grootte,
      oppervlak: 0,
      uv: 0,
      ctc,
      naam: basename(pad)
    })
    textuurBronnen.push({ id, pad, grootte: uit.grootte, mtime: Math.round(uit.mtime), mime: mimeVan(uit.kop) })
    bronnen.set(pad.toLowerCase(), { pad, grootte: uit.grootte, mtime: Math.round(uit.mtime) })
  })
  for (const g of gelezen) g.textuurPerMateriaal = g.textuurPerMateriaal.map((p) => (p >= 0 ? naarLijst[p] : -1))
  tijden.koppen = Math.round(performance.now() - tKoppen)
  invoer.opLijst?.(texturen, textuurBronnen)

  // ---------------------------------------------------------- fase 4: vermeldingen
  const vermeldingen: Bus3dVermelding[] = []
  for (const { k, g } of gekozen) {
    const zoek = (naam: string): number | undefined => {
      const p = padVoorNaam(naam, k.d, ctcPerDeel[k.d].get(textuurSleutel(naam)))
      const i = p === undefined ? -1 : naarLijst[p]
      return i >= 0 ? i : undefined
    }
    vermeldingen.push({
      stuk: g.stuk,
      mesh: k.mesh.meshIndex,
      cfg: k.mesh.cfgIndex,
      aanzicht: k.mesh.aanzicht,
      buiten: k.buiten,
      binnen: k.binnen,
      schaduw: k.mesh.schaduw,
      zicht: k.mesh.zicht.map((z) => [z.variabele, z.waarde] as [string, number]),
      ident: k.mesh.ident,
      ouder: k.mesh.ouder,
      materialen: materialenVan(g, k.mesh, zoek),
      anims: k.mesh.anims.length
    })
  }

  // ---------------------------------------------------------- oppervlakken per textuur
  /*
   * Per (stuk, o3d-materiaal) het buitenoppervlak A (m²) en het UV-oppervlak U;
   * dat gaat naar de textuur van dat materiaal, en ook naar de texturen die de
   * cfg er via dat materiaal bij noemt (transmap, envmap-masker, light- en
   * nightmap, bump, freetex): anders krijgen die A = 0 en laadt het textuurplan
   * ze niet, en dan is het glas dicht.
   */
  const tOpp = performance.now()
  const oppPerStuk = new Map<number, { a: Float64Array; u: Float64Array }>()
  /*
   * De SCHIL (Lakstudio, lakstudio-ontwerp §3.2): het deel van het oppervlak dat
   * de buitenkant van de bus is -- de zijwanden en het dak, met hun normaal naar
   * buiten. Alleen op oppervlak kiest de studio anders het interieur: bij de O560
   * hebben de stoelen (73 m²) meer oppervlak dan de wagenkast (70 m²), want het
   * interieur staat ook in de buitenweergave. De rand van de bus: het 98e
   * percentiel van |x| en het 99e van y over de buitenhoekpunten (een
   * steekproef), en dan binnen 25 cm, met de gemiddelde hoekpuntnormaal naar
   * buiten (> 0,3).
   */
  const randen: [number[], number[]] = [[], []]
  for (const g of gelezen) {
    if (!g.gebruiktBuiten) continue
    for (let o = 0; o < g.floats.length; o += 8 * 16) {
      randen[0].push(Math.abs(g.floats[o]))
      randen[1].push(g.floats[o + 1])
    }
  }
  for (const r of randen) r.sort((x, y) => x - y)
  const kwant = (r: number[], q: number): number => (r.length ? r[Math.min(r.length - 1, Math.floor((r.length - 1) * q))] : Infinity)
  const xRand = kwant(randen[0], 0.98) - 0.25
  const yRand = kwant(randen[1], 0.99) - 0.25
  const schilPerTextuur = new Float64Array(texturen.length)
  for (const g of gelezen) {
    if (!g.gebruiktBuiten) continue
    const f = g.floats
    const tri = g.model.triangles
    const mat = g.model.materiaalPerDriehoek
    const aantal = Math.max(1, g.textuurPerMateriaal.length)
    const perA = new Float64Array(aantal)
    const perU = new Float64Array(aantal)
    const perS = new Float64Array(aantal)
    for (let t = 0; t < mat.length; t++) {
      const k = mat[t]
      if (k >= aantal) continue
      const a = tri[t * 3] * 8
      const b = tri[t * 3 + 1] * 8
      const c = tri[t * 3 + 2] * 8
      const ux = f[b] - f[a]
      const uy = f[b + 1] - f[a + 1]
      const uz = f[b + 2] - f[a + 2]
      const vx = f[c] - f[a]
      const vy = f[c + 1] - f[a + 1]
      const vz = f[c + 2] - f[a + 2]
      const cx = uy * vz - uz * vy
      const cy = uz * vx - ux * vz
      const cz = ux * vy - uy * vx
      const opp = 0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz)
      const su = f[b + 6] - f[a + 6]
      const sv = f[b + 7] - f[a + 7]
      const tu = f[c + 6] - f[a + 6]
      const tv = f[c + 7] - f[a + 7]
      const uv = 0.5 * Math.abs(su * tv - sv * tu)
      if (Number.isFinite(opp) && Number.isFinite(uv)) {
        perA[k] += opp
        perU[k] += uv
        const mx = (f[a] + f[b] + f[c]) / 3
        const my = (f[a + 1] + f[b + 1] + f[c + 1]) / 3
        const nx = (f[a + 3] + f[b + 3] + f[c + 3]) / 3
        const ny = (f[a + 4] + f[b + 4] + f[c + 4]) / 3
        if ((Math.abs(mx) >= xRand && nx * Math.sign(mx) > 0.3) || (my >= yRand && ny > 0.3)) perS[k] += opp
      }
    }
    oppPerStuk.set(g.stuk, { a: perA, u: perU })
    for (let k = 0; k < g.textuurPerMateriaal.length; k++) {
      const ti = g.textuurPerMateriaal[k]
      if (ti < 0) continue
      texturen[ti].oppervlak += perA[k]
      texturen[ti].uv += perU[k]
      schilPerTextuur[ti] += perS[k]
    }
  }
  texturen.forEach((t, i) => {
    if (schilPerTextuur[i] > 0) t.schil = Math.round(schilPerTextuur[i] * 1e4) / 1e4
  })
  const alGeteld = new Set<string>()
  for (const v of vermeldingen) {
    if (!v.buiten || v.schaduw) continue
    const opp = oppPerStuk.get(v.stuk)
    if (!opp) continue
    v.materialen.forEach((m, k) => {
      if (!m) return
      for (const ti of extraTexturen(m)) {
        const sleutel = `${v.stuk}|${k}|${ti}`
        if (alGeteld.has(sleutel) || ti === m.textuur) continue
        alGeteld.add(sleutel)
        texturen[ti].oppervlak += opp.a[k] ?? 0
        texturen[ti].uv += opp.u[k] ?? 0
      }
    })
  }
  for (const t of texturen) {
    t.oppervlak = Math.round(t.oppervlak * 1e4) / 1e4
    t.uv = Math.round(t.uv * 1e6) / 1e6
  }
  tijden.oppervlak = Math.round(performance.now() - tOpp)

  // ---------------------------------------------------------- de doos, en de doostoets (§16)
  let doos: { min: V3; max: V3 } | undefined
  for (const deel of delen) {
    const bd = deel.bus.doos
    if (!bd) continue
    const g = naarO3d(bd.grootte)
    const m = naarO3d(bd.midden)
    const lo: V3 = [m[0] - g[0] / 2 + deel.verschuiving[0], m[1] - g[1] / 2 + deel.verschuiving[1], m[2] - g[2] / 2 + deel.verschuiving[2]]
    const hi: V3 = [m[0] + g[0] / 2 + deel.verschuiving[0], m[1] + g[1] / 2 + deel.verschuiving[1], m[2] + g[2] / 2 + deel.verschuiving[2]]
    doos = doos
      ? {
          min: [Math.min(doos.min[0], lo[0]), Math.min(doos.min[1], lo[1]), Math.min(doos.min[2], lo[2])],
          max: [Math.max(doos.max[0], hi[0]), Math.max(doos.max[1], hi[1]), Math.max(doos.max[2], hi[2])]
        }
      : { min: lo, max: hi }
  }
  /*
   * De gemeten doos van de buitenhoekpunten: het 1e tot het 99e percentiel per
   * as, uit een steekproef (elk achtste hoekpunt). Niet de uitersten: in veel
   * bussen staan hulpstukken ergens ver weg geparkeerd (zie busbeeld.ts).
   */
  const gemeten = (alleenOpen: boolean): { min: V3; max: V3 } | undefined => {
    const as: [number[], number[], number[]] = [[], [], []]
    for (const g of gelezen) {
      if (!g.gebruiktBuiten || (alleenOpen && g.gehusseld)) continue
      const v = delen[stukken[g.stuk].deel].verschuiving
      for (let o = 0; o < g.floats.length; o += 64) for (let k = 0; k < 3; k++) as[k].push(g.floats[o + k] + v[k])
    }
    if (as[0].length < 64) return undefined
    const grens = (w: number[], deel: number): number =>
      w[Math.min(w.length - 1, Math.max(0, Math.floor((w.length - 1) * deel)))]
    for (const w of as) w.sort((x, y) => x - y)
    return { min: as.map((w) => grens(w, 0.01)) as V3, max: as.map((w) => grens(w, 0.99)) as V3 }
  }

  let doostoets: Bus3dBouw['doostoets']
  if (gelezen.some((g) => g.gehusseld && g.gebruiktBuiten)) {
    /*
     * DE DOOSTOETS (§16): klopt het ontwarren voor deze bus? Mislukt ontwarren
     * geeft een waaier: de lengte (tot ±6 m) belandt dan ook in de breedte en
     * de hoogte. Dus: valt meer dan 1% van de ontwarde hoekpunten in breedte of
     * hoogte buiten de doos + 0,5 m, dan het icoon in plaats van een waaier.
     *
     * De doos is [boundingbox] (van de hele trein) samen met de gemeten doos van
     * de open hoekpunten. Alleen [boundingbox] was te streng: de Volvo 7900 18 m
     * heeft een doos die vóór de cabine ophoudt (de ALMEX en de schermen staan
     * erbuiten), en de gelede Hamburger van 1992 een doos van 1 tot 3 m hoog,
     * zonder wielen. De lengte toetsen we niet: die zegt niets over een waaier,
     * en juist daar zijn de dozen van de makers het slordigst.
     */
    const open = gemeten(true)
    const ref =
      doos && open
        ? {
            min: doos.min.map((w, k) => Math.min(w, open.min[k])) as V3,
            max: doos.max.map((w, k) => Math.max(w, open.max[k])) as V3
          }
        : (doos ?? open)
    if (ref) {
      const r = { gehusseld: 0, gehusseldBuiten: 0, open: 0, openBuiten: 0 }
      const lo = ref.min.map((w) => w - 0.5)
      const hi = ref.max.map((w) => w + 0.5)
      for (const g of gelezen) {
        if (!g.gebruiktBuiten) continue
        const v = delen[stukken[g.stuk].deel].verschuiving
        const f = g.floats
        let buiten = 0
        for (let o = 0; o < f.length; o += 8) {
          const x = f[o] + v[0]
          const y = f[o + 1] + v[1]
          if (x < lo[0] || x > hi[0] || y < lo[1] || y > hi[1]) buiten++
        }
        const n = f.length / 8
        if (g.gehusseld) {
          r.gehusseld += n
          r.gehusseldBuiten += buiten
        } else {
          r.open += n
          r.openBuiten += buiten
        }
      }
      doostoets = r
      if (!invoer.zonderDoostoets && r.gehusseld > 0 && r.gehusseldBuiten / r.gehusseld > 0.01) {
        return {
          reden: 'versleuteld',
          detail: `doostoets: ${r.gehusseldBuiten} van ${r.gehusseld} ontwarde hoekpunten in breedte of hoogte buiten de doos + 0,5 m`,
          sleutels: [...sleutels]
        }
      }
    }
  }
  if (!doos) {
    // Geen [boundingbox] (1 van de 395): de gemeten doos van alle buitenhoekpunten.
    doos = gemeten(false) ?? { min: [-1.25, 0, -6], max: [1.25, 3, 6] }
  }

  // ---------------------------------------------------------- bronnen en id
  /*
   * De beschrijvingen: elk gelezen .dsc is een bron, en de map van de .bus ook
   * (daar komt een nieuwe `_ENG.dsc` bij). Zonder dat bleef een nieuwe tekst weg
   * tot het pakket om een andere reden opnieuw gebouwd werd (punt 9a).
   */
  const beschrijvingen = leesBeschrijvingen(busPad, (pad) => stempel(pad))
  stempel(dirname(busPad))
  for (const map of zoeker.bekekenMappen()) stempel(map)
  const bronLijst = [...bronnen.values()].sort((a, b) => (a.pad.toLowerCase() < b.pad.toLowerCase() ? -1 : 1))
  const h = createHash('sha1')
  // 3: de schil per textuur erbij (Lakstudio L1/L2); oude pakketten hebben hem niet.
  h.update(`bus3d-pakket-3|${relatiefPad.toLowerCase()}|${[...geregistreerd].sort((a, b) => a - b).join(',')}`)
  for (const b of bronLijst) h.update(`|${b.pad.toLowerCase()}|${b.grootte}|${b.mtime}`)
  const pakket = h.digest('hex')

  const manifest: Bus3dManifest = {
    versie: 1,
    pakket,
    bus: relatiefPad,
    naam: bus.naam,
    beschrijving: bus.beschrijving,
    beschrijvingen: Object.keys(beschrijvingen).length ? beschrijvingen : undefined,
    doos,
    delen: delen.map((dl) => ({ bus: dl.rel, verschuiving: dl.verschuiving })),
    bestuurder: bus.bestuurder ? { plek: naarO3d(bus.bestuurder) } : undefined,
    texturen,
    sleutels: [...sleutels].sort((a, b) => a - b),
    telling: {
      driehoeken,
      stukken: stukken.length,
      vermeldingen: vermeldingen.length,
      texturen: texturen.length,
      versleuteld: versleuteldeO3d.length,
      ontward,
      ontbrekend: ontbrekend.size,
      onleesbaar: onleesbaar.size,
      meshes: buitenMeshes,
      meshesWeg: buitenMeshesWeg
    },
    problemen: {
      ontbrekend: [...ontbrekend].sort(),
      onleesbaar: [...onleesbaar].map(([naam, reden]) => ({ naam, reden })),
      versleuteld: versleuteldeO3d
    },
    bytes: { geometrie: staart.grootte },
    ms: { lezen: Math.round(performance.now() - t0), schrijven: 0 }
  }
  const kop: Bus3dPakKop = { versie: 1, pakket, stukken, vermeldingen }
  tijden.totaal = Math.round(performance.now() - t0)
  return { bouw: { manifest, kop, staart, bronnen: bronLijst, textuurBronnen, doostoets, tijden } }
}

/** De texturen die de cfg bij een materiaal noemt, naast zijn eigen: voor het oppervlak. */
function extraTexturen(m: Bus3dMateriaal): number[] {
  const uit: number[] = []
  for (const stand of [m, ...(m.wissel?.items ?? [])]) {
    if (stand.textuur !== undefined && stand !== m) uit.push(stand.textuur)
    if (stand.transmap?.textuur !== undefined) uit.push(stand.transmap.textuur)
    if (stand.envmap?.masker !== undefined) uit.push(stand.envmap.masker)
    if (stand.bumpmap?.textuur !== undefined) uit.push(stand.bumpmap.textuur)
    if (stand.lightmap?.textuur !== undefined) uit.push(stand.lightmap.textuur)
    if (stand.nightmap !== undefined) uit.push(stand.nightmap)
    if (stand.freetex?.standaard !== undefined) uit.push(stand.freetex.standaard)
  }
  return uit
}

/** Een `[matl]`-stand (basis of `[matl_item]`) naar het pakket, met de kleuren van de o3d. */
function standVan(
  o3d: O3dModel,
  k: number,
  basisTextuur: number | undefined,
  cfg: CfgMateriaalstand | undefined,
  zoek: (naam: string) => number | undefined
): Bus3dMateriaalstand {
  const m = o3d.materialen[k]
  const kleur = cfg?.allcolor
  /*
   * `[matl_allcolor]`: 14 getallen, diffuus rgba, ambient rgb, specular rgb,
   * emissie rgb, macht; ze vervangen de kleuren uit de o3d.
   */
  const stand: Bus3dMateriaalstand = kleur
    ? {
        diffuus: [kleur[0], kleur[1], kleur[2], kleur[3]],
        specular: [kleur[7] || 0, kleur[8] || 0, kleur[9] || 0],
        emissie: [kleur[10] || 0, kleur[11] || 0, kleur[12] || 0],
        macht: kleur[13] || 0,
        alfa: 0
      }
    : {
        diffuus: m ? [...m.diffuus] : [0.8, 0.8, 0.8, 1],
        specular: m ? [...m.specular] : [0, 0, 0],
        emissie: m ? [...m.emissie] : [0, 0, 0],
        macht: m?.macht ?? 0,
        alfa: 0
      }
  if (basisTextuur !== undefined && basisTextuur >= 0) stand.textuur = basisTextuur
  if (!cfg) return stand
  if (cfg.alfa !== undefined) stand.alfa = cfg.alfa
  if (cfg.transmap !== undefined) {
    const script = /^\\S:(\d+)$/i.exec(cfg.transmap)
    stand.transmap = script ? { script: Number(script[1]) } : cfg.transmap ? { textuur: zoek(cfg.transmap) } : {}
  }
  if (cfg.envmap !== undefined) {
    stand.envmap = {
      sterkte: cfg.envmapSterkte ?? 1,
      masker: cfg.envmapMasker ? zoek(cfg.envmapMasker) : undefined
    }
  }
  if (cfg.bumpmap) stand.bumpmap = { textuur: zoek(cfg.bumpmap.textuur), sterkte: cfg.bumpmap.sterkte }
  if (cfg.lightmap) stand.lightmap = { textuur: zoek(cfg.lightmap.textuur), variabele: cfg.lightmap.variabele }
  if (cfg.nightmap) stand.nightmap = zoek(cfg.nightmap)
  if (cfg.freetex) stand.freetex = { standaard: zoek(cfg.freetex.standaard), variabele: cfg.freetex.variabele }
  if (cfg.alfaSchaal) stand.alfaSchaal = cfg.alfaSchaal
  if (cfg.texcoordX) stand.texcoordX = cfg.texcoordX
  if (cfg.texcoordY) stand.texcoordY = cfg.texcoordY
  return stand
}

/** Per o3d-materiaal wat er getekend wordt: o3d-kleuren plus alles wat de cfg zegt. */
function materialenVan(g: GelezenStuk, mesh: CfgMesh, zoek: (naam: string) => number | undefined): Array<Bus3dMateriaal | null> {
  const namen = g.model.materialen.map((m) => m.textuur)
  if (namen.length === 0) return []
  const cfgPer: (CfgMateriaal | undefined)[] = materiaalcontexten(mesh, namen)
  return namen.map((_, k) => {
    const cfg = cfgPer[k]
    const basis = standVan(g.model, k, g.textuurPerMateriaal[k], cfg, zoek) as Bus3dMateriaal
    if (!cfg) return basis
    if (cfg.nietSchrijven) basis.nietSchrijven = true
    if (cfg.nietTesten) basis.nietTesten = true
    if (cfg.adres) basis.adres = cfg.adres
    if (cfg.tekst !== undefined) basis.tekst = cfg.tekst
    if (cfg.scripttextuur !== undefined) basis.scripttextuur = cfg.scripttextuur
    if (cfg.soort === 'matl_change' && cfg.variabele) {
      basis.wissel = {
        variabele: cfg.variabele,
        items: cfg.items.map((item) => standVan(g.model, k, g.textuurPerMateriaal[k], { ...cfg, ...item }, zoek))
      }
    }
    return basis
  })
}

// ------------------------------------------------------------ de kleurstelling

/**
 * Precies het `[vars]`-blok dat de app in de situatie schrijft (`kleurVars` in
 * main/index.ts): de CTC-variabele met het nummer, plus de setvars. Zo is wat je
 * ziet gelijk aan wat je rijdt (§5.2).
 */
export function kleurVarsVan(info: Kleurstellingen, naam: string): Array<[string, number]> | undefined {
  const gekozen = zoekKleurstelling(info, naam)
  if (!gekozen) return undefined
  return [[info.variabele, gekozen.index], ...Object.entries(gekozen.setvars)]
}

/**
 * De lak van een kleurstelling: de texturen die ze vervangt (als plekken in
 * `manifest.texturen`), de vars, en met de kop van het pakket erbij ook de
 * ruststand -- zichtbaar, items, alphascale -- volgens de regels van §5.2
 * (core/busrust.ts). Ook bij "Standaard" (`undefined`): dan zet de app niets,
 * maar de meshes moeten nog steeds gekozen worden.
 */
export function bus3dLak(
  omsiMap: string,
  manifest: Bus3dManifest,
  kleurstelling: string | undefined,
  kop?: Bus3dPakKop,
  /** Busopties van de Lakstudio (§4.9): extra setvars na die van de kleurstelling. */
  extra: Array<[string, number]> = [],
  /** Wat niemand zet is 0 (of de startwaarde van het script), zoals in OMSI met een eigen lak; zie `busRust`. */
  alleenGeschreven = false
): { lak: Bus3dLak; textuurBronnen: Bus3dTextuurBron[] } {
  const t0 = performance.now()
  const lak: Bus3dLak = {
    kleurstelling,
    vars: [],
    bron: 'regels',
    zichtbaar: '',
    items: {},
    alphascale: {},
    texturen: [],
    onbekend: [],
    ms: 0
  }
  const textuurBronnen: Bus3dTextuurBron[] = []
  if (kop) {
    const delen: RustInvoerDeel[] = []
    for (const deel of manifest.delen) {
      const busPad = join(omsiMap, deel.bus)
      const bus = leesBusBestand(busPad)
      delen.push({ busPad, modelcfg: bus?.model ? join(dirname(busPad), ...bus.model.split(/[\\/]+/)) : '' })
    }
    const rust = busRust(kop, delen, kleurstelling, extra, alleenGeschreven)
    lak.zichtbaar = rust.zichtbaar
    lak.items = rust.items
    lak.alphascale = rust.alphascale
    lak.onbekend = rust.onbekend
    lak.vars = rust.vars
    lak.bron = rust.bron
  }
  if (!kleurstelling) {
    lak.ms = Math.round(performance.now() - t0)
    return { lak, textuurBronnen }
  }
  for (let d = 0; d < manifest.delen.length; d++) {
    const busPad = join(omsiMap, manifest.delen[d].bus)
    const bus = leesBusBestand(busPad)
    if (!bus?.model) continue
    const modelcfg = join(dirname(busPad), ...bus.model.split(/[\\/]+/))
    const info = leesKleurstellingen(modelcfg, dirname(busPad))
    if (!info) continue
    const gekozen = zoekKleurstelling(info, kleurstelling)
    if (!gekozen) continue
    if (d === 0) lak.vars = [...(kleurVarsVan(info, kleurstelling) ?? []), ...extra]
    for (const [plek, pad] of Object.entries(gekozen.texturen)) {
      const standaard = info.plekken[plek]
      if (!standaard || !existsSync(pad)) continue
      const sleutel = textuurSleutel(standaard)
      const uit = leesTextuurKop(pad)
      if ('klacht' in uit) continue
      const id = textuurId(pad, uit.grootte, uit.mtime)
      manifest.texturen.forEach((t, i) => {
        if (t.ctc !== plek || textuurSleutel(t.naam) !== sleutel) return
        lak.texturen.push({
          plek: i,
          textuur: {
            ...t,
            id,
            soort: uit.kop.route,
            formaat: uit.kop.formaat,
            b: uit.kop.b,
            h: uit.kop.h,
            mips: uit.kop.mips,
            niveaus: uit.kop.niveaus,
            mime: uit.kop.mime,
            vorm: uit.kop.vorm,
            bytes: uit.grootte,
            naam: basename(pad)
          }
        })
        if (!textuurBronnen.some((b) => b.id === id)) {
          textuurBronnen.push({ id, pad, grootte: uit.grootte, mtime: Math.round(uit.mtime), mime: mimeVan(uit.kop) })
        }
      })
    }
  }
  lak.ms = Math.round(performance.now() - t0)
  return { lak, textuurBronnen }
}

/**
 * De vingerafdruk van alles waar de lak van een kleurstelling van afhangt en wat
 * niet al in het pakket-id zit: per deel de .bus, zijn scripts en constfiles, en
 * de texturen die de kleurstelling vervangt, en de .cti's (ook bij Standaard:
 * de gewone uitvoering komt uit alle kleurstellingen, `typischVan`). Grootte en
 * tijd, geen inhoud: een handvol `stat`s. Voor de schijfcache `s/` (§4.2).
 *
 * `lak-2`: de rekenmachine van de ruststand (core/oscrust.ts, tegenlezing F2)
 * geeft andere standen dan de regels van F2; de oude mogen niet meer uit de cache komen.
 * `lak-3`: kleurstelling.ts leest zoals Omsi.exe (Lakstudio L0). Bij dezelfde
 * .cti's kan het nummer, een setvar of een textuur nu anders zijn (HHA12,
 * " silber", de MAN LC), en de stempels van de bestanden zien dat niet.
 */
export function lakStempel(
  omsiMap: string,
  manifest: Bus3dManifest,
  kleurstelling: string | undefined,
  extra: Array<[string, number]> = [],
  alleenGeschreven = false
): string {
  const h = createHash('sha1').update(`lak-3|${kleurstelling ?? ''}${extra.length ? `|${JSON.stringify(extra)}` : ''}${alleenGeschreven ? '|alleen' : ''}`)
  const stempel = (pad: string): void => {
    try {
      const st = statSync(pad)
      h.update(`|${pad.toLowerCase()}|${st.size}|${Math.round(st.mtimeMs)}`)
    } catch {
      h.update(`|${pad.toLowerCase()}|-`)
    }
  }
  for (const deel of manifest.delen) {
    const busPad = join(omsiMap, deel.bus)
    stempel(busPad)
    const { scripts, constfiles } = busLijsten(busPad)
    for (const p of [...scripts, ...constfiles]) stempel(p)
    const bus = leesBusBestand(busPad)
    if (!bus?.model) continue
    const info = leesKleurstellingen(join(dirname(busPad), ...bus.model.split(/[\\/]+/)), dirname(busPad))
    const gekozen = kleurstelling ? zoekKleurstelling(info, kleurstelling) : undefined
    for (const p of Object.values(gekozen?.texturen ?? {})) stempel(p)
    // De .cti's zelf: een setvar die erbij komt verandert de lak, niet de texturen.
    if (info?.map) {
      stempel(info.map)
      try {
        for (const naam of readdirSync(info.map).sort()) if (/\.cti$/i.test(naam)) stempel(join(info.map, naam))
      } catch {
        // geen map: de stempel van de map zelf zegt het al
      }
    }
  }
  return h.digest('hex').slice(0, 24)
}

/** Kloppen de bronnen van een pakket nog? Geeft het eerste verschil, of niets. */
export function pakketVerouderd(bronnen: Bus3dBron[]): string | undefined {
  for (const b of bronnen) {
    let grootte = -1
    let mtime = -1
    try {
      const st = statSync(b.pad)
      grootte = st.isDirectory() ? b.grootte : st.size
      mtime = Math.round(st.mtimeMs)
    } catch {
      // weg
    }
    if (grootte !== b.grootte || mtime !== b.mtime) return b.pad
  }
  return undefined
}
