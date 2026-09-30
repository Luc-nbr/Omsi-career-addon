import { closeSync, existsSync, openSync, readdirSync, readFileSync, readSync, statSync, type Dirent } from 'node:fs'
import { basename, dirname, join, relative, sep } from 'node:path'
import iconv from 'iconv-lite'
import type { Bus3dManifest, Bus3dPakKop, V3 } from '../shared/bus3d'
import {
  LAK_CTI,
  omsiHoofdletters,
  uitvoerMaat,
  type LakDoel,
  type LakFamilieInfo,
  type LakOptie,
  type LakSjabloon,
  type NietOpReden
} from '../shared/lak'
import { TextuurZoeker, textuurMappen } from './bus3d'
import { modelVanBus, zoekTextuurVan } from './busmodel'
import { busLijsten } from './busrust'
import { ctcBlokken, leesKleurstellingen, textuurSleutel, type Kleurstellingen } from './kleurstelling'
import { leesPng } from './png'
import { cfgRegels, leesSchermcfg } from './schermcfg'
import { ontleedTextuur, pakBmpUit, verkleinGemiddeld, type Textuur } from './textuur'
import { trailerOf } from './trailer'

/**
 * DE FAMILIE VAN EEN KLEURSTELLING (lakstudio-ontwerp §3)
 *
 * Een `.cti` geldt voor ELKE bus die de CTC-map leest, niet alleen voor de bus
 * die de speler opende (kritiek punt 1). Dit bestand zoekt die familie en wat
 * er per lid gelakt moet worden, alleen lezend:
 *
 * 1. De CTC-mappen van de geopende bus: per deel (voorwagen, aanhangers via
 *    `trailerOf`) `.bus` → `[model]` → cfg → de EERSTE `[CTC]`, met de map van
 *    de .bus als basis (L0, regel 6).
 * 2. De familie: elke .bus/.ovh/.sco onder Vehicles waarvan de cfg naar een van
 *    die mappen wijst, met dezelfde regel. rep_GN: 12 .bus, waarvan 6 KI.
 * 3. Per lid de lakplekken (§3.2): het grootste buitenoppervlak (uit het
 *    Bus3D-pakket; zonder pakket het grootste beeld), dan de meeste
 *    kleurstellingen; ruiten (plekken alleen in gemengde materialen) nooit; een
 *    tweede plek erbij als de werker mat dat die ≥ 10% van het silhouet draagt
 *    (het dak van de SD77; `extra`).
 * 4. Groeperen op de standaardtextuur (het opgeloste pad): elke textuur is één
 *    DOEL. Plekken van andere leden met dezelfde textuur liften mee, en een
 *    `<lak>_#low`-plek (HH20 tex7/tex8) krijgt de `_#low` van dat doel.
 * 5. Per doel één bakker: bij voorkeur een bestuurbare bus.
 * 6. Een lid dat niet te bakken is (versleuteld, geen meshes, een doos die meer
 *    dan 5 cm afwijkt) krijgt de naam niet: zijn plekken vallen voor de hele map
 *    weg, en daarmee (via de setvar-regel) ook de setvars.
 * 7. Plekconflicten (§3.5): dezelfde plek-naam met een andere standaardtextuur
 *    in dezelfde map, op een van onze doelen.
 *
 * Paden blijven hier (main); de studio krijgt `LakFamilieInfo` met id's.
 * Alles neemt de OMSI-map als parameter, zodat de proeven een kopie kunnen
 * gebruiken (§9).
 */

export interface LidPlek {
  plek: string
  standaard: string
  /** De opgeloste standaardtextuur, als die er is. */
  pad?: string
}

export interface FamilieLid {
  /** Ten opzichte van de OMSI-map, met backslashes (zoals in een .osn). */
  rel: string
  pad: string
  busmap: string
  cfg: string
  /** Index in `Familie.mappen`. */
  map: number
  variabele: string
  plekken: LidPlek[]
  bestuurbaar: boolean
  kleuren?: Kleurstellingen
}

export interface FamilieDoel {
  id: string
  /** Groepeersleutel: het opgeloste pad (klein), anders `naam:<naam>`. */
  sleutel: string
  standaard?: string
  naam: string
  /** De naam zonder extensie: de stam van onze textuur. */
  stam: string
  b: number
  h: number
  uitB: number
  uitH: number
  formaat: 'bc1' | 'bc3'
  low: boolean
  plekken: Array<{ map: number; plek: string }>
  /** `<lak>_#low`-plekken (HH20): die krijgen onze `_#low`. */
  lowPlekken: Array<{ map: number; plek: string }>
  bakker: string
  sjabloon?: FamilieSjabloon
}

export interface FamilieSjabloon {
  rpc: string
  naam: string
  bs?: string
  al?: string
  ma?: string
  ad?: string
  mu?: string
  b: number
  h: number
  /** Correlatie van de randen met de standaardtextuur op 1/8 (zie `zoekSjabloon`). */
  overeenkomst: number
}

export interface Familie {
  omsi: string
  /** De geopende bus en zijn delen (voorwagen voorop). */
  bus: string
  delen: string[]
  /** De CTC-mappen (absoluut). */
  mappen: string[]
  leden: FamilieLid[]
  doelen: FamilieDoel[]
  nietOp: Array<{ bus: string; reden: NietOpReden }>
  /** Plekken (OMSI-hoofdletters) per map die vervallen omdat een lid niet te bakken is. */
  weg: Array<Set<string>>
  conflicten: Array<{ map: number; plek: string; bussen: string[] }>
  bestaandeNamen: string[]
  /** Het hoogste nnnn van een ~Lakstudio_*.cti in de mappen (§5.8). */
  hoogsteNnnn: number
  optiesMogelijk: boolean
  geenCtc?: boolean
  /** Glasplekken per lid (OMSI-hoofdletters), als het pakket er was. */
  glas: Map<string, Set<string>>
}

/** Wat het Bus3D-pakket over een lid weet (main vult het in; de proef ook). */
export interface LakInfo {
  /** Buitenoppervlak per textuur (`textuurSleutel`), m². */
  oppervlak: Map<string, number>
  /** Het deel daarvan dat de schil van de bus is (zijwanden en dak, core/bus3d.ts), m²; niet in een oud pakket. */
  schil?: Map<string, number>
  /** Texturen die alleen in gemengde materialen voorkomen (ruiten, hun doorzicht). */
  glas: Set<string>
  /** Texturen die ergens de hoofdtextuur van een dicht of alfatest-materiaal zijn: alleen die kunnen lak dragen. */
  hoofd?: Set<string>
  doos?: { min: V3; max: V3 }
  /** Hoeveel delen het pakket heeft (voorwagen plus aanhangers). */
  delen?: number
  bakbaar: true | NietOpReden
}

/* ------------------------------------------------------------------ hulp */

const naarRel = (omsi: string, pad: string): string => relative(omsi, pad).split(sep).join('\\')
const sleutelVan = (p: string): string => p.toLowerCase()

/** Een bestuurbare bus: een .bus die geen KI-uitvoering of geparkeerde wagen is. */
export function isBestuurbaar(rel: string): boolean {
  if (!/\.bus$/i.test(rel)) return false
  return !/(^|[\\/_ .-])(KI|AI)([\\/_ .-]|$)/i.test(rel) && !/parked|geparkt/i.test(rel)
}

/** De maat van een beeld uit zijn eerste bytes; ook een afgekapte kopie (de proef) is genoeg. */
export function beeldMaat(bytes: Uint8Array): { b: number; h: number; alfa: 'ja' | 'nee' | 'misschien' } | undefined {
  const u16 = (o: number): number => bytes[o] | (bytes[o + 1] << 8)
  const u32 = (o: number): number => (bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16) | (bytes[o + 3] << 24)) >>> 0
  if (bytes.length < 26) return undefined
  if (bytes[0] === 0x44 && bytes[1] === 0x44 && bytes[2] === 0x53 && bytes[3] === 0x20 && bytes.length >= 128) {
    const vlag = u32(80)
    const fourcc = String.fromCharCode(bytes[84], bytes[85], bytes[86], bytes[87])
    const alfa = vlag & 4 ? (fourcc === 'DXT1' ? 'misschien' : 'ja') : vlag & 1 ? 'ja' : 'nee'
    return { b: u32(16), h: u32(12), alfa }
  }
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) {
    const bits = u16(28)
    return { b: Math.abs(u32(18) | 0), h: Math.abs(u32(22) | 0), alfa: bits === 32 ? 'misschien' : 'nee' }
  }
  if (bytes[0] === 0x89 && bytes[1] === 0x50) {
    const be = (o: number): number => ((bytes[o] << 24) | (bytes[o + 1] << 16) | (bytes[o + 2] << 8) | bytes[o + 3]) >>> 0
    return { b: be(16), h: be(20), alfa: bytes[25] === 4 || bytes[25] === 6 ? 'ja' : 'misschien' }
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    for (let o = 2; o + 9 < bytes.length; ) {
      if (bytes[o] !== 0xff) break
      const m = bytes[o + 1]
      const len = (bytes[o + 2] << 8) | bytes[o + 3]
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return { b: (bytes[o + 7] << 8) | bytes[o + 8], h: (bytes[o + 5] << 8) | bytes[o + 6], alfa: 'nee' }
      }
      o += 2 + len
    }
    return undefined
  }
  // TGA: geen herkenningsbytes; type 2/3/10/11 en een redelijke maat.
  const type = bytes[2]
  if ([2, 3, 10, 11].includes(type)) {
    const b = u16(12)
    const h = u16(14)
    const bits = bytes[16]
    if (b > 0 && h > 0 && [8, 16, 24, 32].includes(bits)) return { b, h, alfa: bits === 32 ? 'misschien' : 'nee' }
  }
  return undefined
}

/** Alleen het begin van een bestand: een sjabloon van 4096² is 48 MB, de maat staat in de eerste bytes. */
function kopVan(pad: string): Uint8Array | undefined {
  let fd: number | undefined
  try {
    fd = openSync(pad, 'r')
    const b = Buffer.alloc(64 * 1024)
    const n = readSync(fd, b, 0, b.length, 0)
    return b.subarray(0, n)
  } catch {
    return undefined
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}

/** Een beeld helemaal uitpakken (DDS, TGA, BMP, PNG), voor de sjablonen en de alfa. */
export function decodeer(pad: string): Textuur | undefined {
  let bytes: Buffer
  try {
    bytes = readFileSync(pad)
  } catch {
    return undefined
  }
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return pakBmpUit(bytes)
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return leesPng(bytes)
  return ontleedTextuur(bytes).textuur
}

/* ------------------------------------------------------------------ alle voertuigen met een [CTC] */

interface VoertuigCtc {
  pad: string
  cfg: string
  map: string
  variabele: string
  plekken: Array<[string, string]>
}

/** Per cfg (met grootte en tijd) de eerste [CTC]; een cfg zonder `[CTC]` wordt niet in regels geknipt. */
const ctcGeheugen = new Map<string, { stempel: string; ctc?: { variabele: string; map: string; plekken: Array<[string, string]> } }>()
const CTC_A = Buffer.from('[CTC]', 'latin1')
const CTC_W = Buffer.from('[CTC]', 'utf16le')

function eersteCtc(cfg: string): { variabele: string; map: string; plekken: Array<[string, string]> } | undefined {
  let stempel: string
  try {
    const st = statSync(cfg)
    stempel = `${st.size}:${st.mtimeMs}`
  } catch {
    return undefined
  }
  const bekend = ctcGeheugen.get(cfg.toLowerCase())
  if (bekend?.stempel === stempel) return bekend.ctc
  let ctc: ReturnType<typeof eersteCtc>
  try {
    const bytes = readFileSync(cfg)
    if (bytes.indexOf(CTC_A) >= 0 || bytes.indexOf(CTC_W) >= 0) {
      const blok = ctcBlokken(cfgRegels(cfg))[0]
      if (blok && blok.variabele) {
        // Eerste spelling per plek, zoals de lader (kleurstelling.ts).
        const gezien = new Set<string>()
        const plekken: Array<[string, string]> = []
        for (const [plek, standaard] of blok.plekken) {
          const h = omsiHoofdletters(plek)
          if (gezien.has(h)) continue
          gezien.add(h)
          plekken.push([plek, standaard])
        }
        ctc = { variabele: blok.variabele, map: blok.map, plekken }
      }
    }
  } catch {
    ctc = undefined
  }
  ctcGeheugen.set(cfg.toLowerCase(), { stempel, ctc })
  return ctc
}

/**
 * `[model]` van een .bus, onthouden op grootte en tijd: de familie leest alle
 * 1200 voertuigen, en dan kostte elke keer de .bus lezen 1-2 s.
 */
const busGeheugen = new Map<string, { stempel: string; cfg?: string }>()
function cfgVanBus(pad: string): string | undefined {
  let stempel: string
  try {
    const st = statSync(pad)
    stempel = `${st.size}:${st.mtimeMs}`
  } catch {
    return undefined
  }
  const bekend = busGeheugen.get(pad.toLowerCase())
  if (bekend?.stempel === stempel && (!bekend.cfg || existsSync(bekend.cfg))) return bekend.cfg
  const cfg = modelVanBus(pad)
  busGeheugen.set(pad.toLowerCase(), { stempel, cfg })
  return cfg
}

/** Alle .bus/.ovh/.sco onder Vehicles (tot drie mappen diep), met hun eerste [CTC]. */
export function voertuigenMetCtc(omsi: string): VoertuigCtc[] {
  const uit: VoertuigCtc[] = []
  const loop = (map: string, diepte: number): void => {
    let inhoud: Dirent[]
    try {
      inhoud = readdirSync(map, { withFileTypes: true })
    } catch {
      return
    }
    for (const d of inhoud) {
      const vol = join(map, d.name)
      if (d.isDirectory()) {
        if (diepte < 3) loop(vol, diepte + 1)
        continue
      }
      if (!/\.(bus|ovh|sco)$/i.test(d.name)) continue
      const cfg = cfgVanBus(vol)
      if (!cfg) continue
      const ctc = eersteCtc(cfg)
      if (!ctc) continue
      uit.push({ pad: vol, cfg, map: join(dirname(vol), ...ctc.map.split(/[\\/]/).filter(Boolean)), variabele: ctc.variabele, plekken: ctc.plekken })
    }
  }
  loop(join(omsi, 'Vehicles'), 0)
  return uit
}

/* ------------------------------------------------------------------ .cti's lezen */

/** De regels van een .cti zoals Readln (L0): cp1252, een regel eindigt op LF, een losse CR valt weg. */
function ctiRegels(pad: string): string[] {
  try {
    return iconv
      .decode(readFileSync(pad), 'win1252')
      .split('\n')
      .map((r) => r.replace(/\r/g, ''))
  } catch {
    return []
  }
}

/** De .cti's van een map, in de volgorde van OMSI. */
export function ctisIn(map: string): string[] {
  try {
    return readdirSync(map)
      .filter((n) => n.toLowerCase().endsWith('.cti'))
      .sort((a, b) => {
        const x = a.toUpperCase()
        const y = b.toUpperCase()
        return x < y ? -1 : x > y ? 1 : 0
      })
  } catch {
    return []
  }
}

/** Alle [item]-namen in de .cti's van een map (ook van plekken die geen cfg kent: strenger is veilig). */
function namenIn(map: string, zonder?: string): { namen: string[]; hoogste: number } {
  const namen: string[] = []
  let hoogste = 0
  for (const bestand of ctisIn(map)) {
    const m = LAK_CTI.exec(bestand)
    if (m) hoogste = Math.max(hoogste, Number(m[1]))
    if (zonder && bestand.toLowerCase() === zonder.toLowerCase()) continue
    const r = ctiRegels(join(map, bestand))
    for (let i = 0; i < r.length; i++) {
      if (r[i] === '[item]') {
        namen.push(r[i + 1] ?? '')
        i += 3
      } else if (r[i] === '[setvar]') i += 2
    }
  }
  return { namen, hoogste }
}

/** De items van één kleurstelling zoals ze in de .cti's staan (plek, pad t.o.v. de map); een later item per plek wint. */
export function itemsVan(map: string, naam: string): Array<{ plek: string; rel: string }> {
  const sleutel = omsiHoofdletters(naam)
  const perPlek = new Map<string, { plek: string; rel: string }>()
  for (const bestand of ctisIn(map)) {
    const r = ctiRegels(join(map, bestand))
    for (let i = 0; i < r.length; i++) {
      if (r[i] === '[item]') {
        if (omsiHoofdletters(r[i + 1] ?? '') === sleutel) {
          const plek = r[i + 2] ?? ''
          perPlek.set(omsiHoofdletters(plek), { plek, rel: r[i + 3] ?? '' })
        }
        i += 3
      } else if (r[i] === '[setvar]') i += 2
    }
  }
  return [...perPlek.values()]
}

/** Alle setvars in de .cti's van een map: variabele (eerste spelling) → waarden. */
function setvarsIn(map: string): Map<string, { naam: string; waarden: Set<number> }> {
  const uit = new Map<string, { naam: string; waarden: Set<number> }>()
  for (const bestand of ctisIn(map)) {
    const r = ctiRegels(join(map, bestand))
    for (let i = 0; i < r.length; i++) {
      if (r[i] === '[item]') i += 3
      else if (r[i] === '[setvar]') {
        const naam = r[i + 1] ?? ''
        const w = Number((r[i + 2] ?? '').trim())
        i += 2
        if (!naam || !Number.isFinite(w)) continue
        const h = omsiHoofdletters(naam)
        const v = uit.get(h) ?? { naam, waarden: new Set<number>() }
        v.waarden.add(w)
        uit.set(h, v)
      }
    }
  }
  return uit
}

/* ------------------------------------------------------------------ uit het pakket */

/**
 * Wat een Bus3D-pakket over de lakplekken zegt: het buitenoppervlak per
 * textuur, de ruiten (een textuur die alleen in gemengde materialen staat, ook
 * als doorzicht) en de doos. Op de naam van de textuur (`textuurSleutel`: zonder
 * map en extensie, klein), niet op de CTC-plek: een bus zonder kleurstellingen
 * (de C2 E5 GN, lege map) heeft in het pakket geen plekken, en een pakket van een
 * voorwagen draagt ook de texturen van zijn aanhanger. Puur; main en de proef
 * halen manifest en kop uit de cache.
 */
export function lakInfoUitPakket(manifest: Bus3dManifest, kop: Bus3dPakKop): Omit<LakInfo, 'bakbaar'> {
  const oppervlak = new Map<string, number>()
  const schil = new Map<string, number>()
  for (const t of manifest.texturen) {
    const h = textuurSleutel(t.naam)
    oppervlak.set(h, (oppervlak.get(h) ?? 0) + t.oppervlak)
    if (t.schil) schil.set(h, (schil.get(h) ?? 0) + t.schil)
  }
  const meng = new Set<number>()
  const dicht = new Set<number>()
  for (const v of kop.vermeldingen) {
    if (!v.buiten || v.schaduw) continue
    for (const m of v.materialen) {
      if (!m) continue
      for (const s of [m, ...(m.wissel?.items ?? [])]) {
        const t = s.textuur ?? s.freetex?.standaard
        if (t !== undefined) (s.alfa === 2 ? meng : dicht).add(t)
        // Het doorzicht van een ruit (farbschema_trans): ook een glasplek, die geen item krijgt (§3.2).
        if (s.alfa === 2 && s.transmap?.textuur !== undefined) meng.add(s.transmap.textuur)
      }
    }
  }
  const glas = new Set<string>()
  const hoofd = new Set<string>()
  manifest.texturen.forEach((t, i) => {
    const h = textuurSleutel(t.naam)
    if (meng.has(i) && !dicht.has(i)) glas.add(h)
    if (dicht.has(i)) hoofd.add(h)
  })
  return { oppervlak, schil: manifest.texturen.some((t) => t.schil !== undefined) ? schil : undefined, glas, hoofd, doos: manifest.doos, delen: manifest.delen.length }
}

/**
 * Het hele `LakInfo` uit een pakket: te bakken, tenzij er meer dan een kwart van
 * de buitenmeshes ontbreekt (zoals bv.incompleteModel). De KI-C2 E6 GN mist er
 * 188 van de 303 (gemeten 30-09): die doos en die oppervlakken zeggen niets.
 */
export function lakInfoVan(manifest: Bus3dManifest, kop: Bus3dPakKop): LakInfo {
  const t = manifest.telling
  const onvolledig = (t.meshes ?? 0) > 0 && (t.meshesWeg ?? 0) / (t.meshes ?? 1) > 0.25
  return { ...lakInfoUitPakket(manifest, kop), bakbaar: onvolledig ? 'geen-model' : true }
}

/* ------------------------------------------------------------------ de familie */

export interface FamilieOpties {
  /** Wat het pakket van een lid weet; zonder: alleen tellen en bestandsgrootte, iedereen te bakken. */
  info?: (rel: string) => LakInfo | undefined
  /** Bij "precies" en "effen in de kleuren van": de start; dan telt ook zijn maat (§5.3). */
  start?: string
  /** De sjablonen zoeken (§3.3). Standaard aan. */
  sjablonen?: boolean
  /** Bij opnieuw opslaan: onze eigen .cti telt niet mee voor de bestaande namen. */
  eigenCti?: string
  /**
   * Plekken van een lid die de werker als tweede lakplek mat: een CTC-plek die
   * ≥ 10% van het silhouet in een aanzicht draagt (§3.2). Alleen plekken die dit
   * lid echt heeft en die geen ruit zijn, tellen.
   */
  extra?: (rel: string) => string[]
}

/** Hoe groot een textuur is: de maat uit de kop (ook voor de afgekapte kopie van de proef). */
function maatVan(pad: string | undefined): { b: number; h: number; alfa: 'ja' | 'nee' | 'misschien' } | undefined {
  if (!pad) return undefined
  const kop = kopVan(pad)
  return kop ? beeldMaat(kop) : undefined
}

export function familieVan(omsi: string, rel: string, opties: FamilieOpties = {}): Familie {
  const zoeker = new TextuurZoeker()
  // De delen van de geopende bus: voorwagen en aanhangers.
  const delen = [rel]
  for (let k = 0; k < 3; k++) {
    const a = trailerOf(omsi, delen[delen.length - 1])
    if (!a || delen.some((d) => d.toLowerCase() === a.relativePath.toLowerCase())) break
    delen.push(a.relativePath)
  }
  const leeg = (geenCtc: boolean): Familie => ({
    omsi,
    bus: rel,
    delen,
    mappen: [],
    leden: [],
    doelen: [],
    nietOp: [],
    weg: [],
    conflicten: [],
    bestaandeNamen: [],
    hoogsteNnnn: 0,
    optiesMogelijk: false,
    geenCtc,
    glas: new Map()
  })

  // De mappen van de delen.
  const mappen: string[] = []
  const mapIndex = (m: string): number => {
    const i = mappen.findIndex((x) => sleutelVan(x) === sleutelVan(m))
    if (i >= 0) return i
    mappen.push(m)
    return mappen.length - 1
  }
  for (const d of delen) {
    const pad = join(omsi, d)
    const cfg = modelVanBus(pad)
    const ctc = cfg ? eersteCtc(cfg) : undefined
    if (ctc) mapIndex(join(dirname(pad), ...ctc.map.split(/[\\/]/).filter(Boolean)))
  }
  if (mappen.length === 0) return leeg(true)

  // De leden: elk voertuig waarvan de [CTC] naar een van die mappen wijst.
  const leden: FamilieLid[] = []
  for (const v of voertuigenMetCtc(omsi)) {
    const m = mappen.findIndex((x) => sleutelVan(x) === sleutelVan(v.map))
    if (m < 0) continue
    const busmap = dirname(v.pad)
    const zoekIn = textuurMappen(omsi, v.pad, v.cfg)
    leden.push({
      rel: naarRel(omsi, v.pad),
      pad: v.pad,
      busmap,
      cfg: v.cfg,
      map: m,
      variabele: v.variabele,
      plekken: v.plekken.map(([plek, standaard]) => ({ plek, standaard, pad: zoeker.vind(standaard, zoekIn) })),
      bestuurbaar: isBestuurbaar(naarRel(omsi, v.pad)),
      kleuren: leesKleurstellingen(v.cfg, busmap)
    })
  }
  // De geopende bus voorop, dan bestuurbaar, dan op naam: zo is de keuze van de bakker voorspelbaar.
  const eerst = new Set(delen.map((d) => d.toLowerCase()))
  leden.sort(
    (a, b) =>
      Number(eerst.has(b.rel.toLowerCase())) - Number(eerst.has(a.rel.toLowerCase())) ||
      Number(b.bestuurbaar) - Number(a.bestuurbaar) ||
      a.rel.localeCompare(b.rel)
  )

  const infos = new Map<string, LakInfo | undefined>()
  const infoVan = (lid: FamilieLid): LakInfo | undefined => {
    if (!infos.has(lid.rel)) infos.set(lid.rel, opties.info?.(lid.rel))
    return infos.get(lid.rel)
  }
  const glas = new Map<string, Set<string>>()
  const keyVan = (p: LidPlek): string => (p.pad ? sleutelVan(p.pad) : `naam:${p.standaard.toLowerCase()}`)
  const isLow = (p: LidPlek): boolean => /_#low$/i.test(stamVan(p.standaard))

  // Per lid de lakplekken (§3.2); alleen van bestuurbare leden: de KI-bussen liften mee (§3.1, punt 4).
  const lakKeys = new Map<string, { lid: FamilieLid; plek: LidPlek }>()
  const kiezers = leden.some((l) => l.bestuurbaar) ? leden.filter((l) => l.bestuurbaar) : leden
  const stam = (p: LidPlek): string => textuurSleutel(p.pad ?? p.standaard)
  // De glasplekken per lid, op plek-naam (voor startItems): een plek waarvan de standaardtextuur een ruit is.
  for (const lid of leden) {
    const g = infoVan(lid)?.glas ?? new Set<string>()
    glas.set(lid.rel, new Set(lid.plekken.filter((p) => g.has(stam(p))).map((p) => omsiHoofdletters(p.plek))))
  }
  for (const lid of kiezers) {
    const info = infoVan(lid)
    const g = info?.glas ?? new Set<string>()
    const kandidaten = lid.plekken.filter((p) => !g.has(stam(p)) && !isLow(p))
    if (kandidaten.length === 0) continue
    const telling = (p: LidPlek): number => lid.kleuren?.lijst.filter((k) => k.texturen[p.plek] !== undefined).length ?? 0
    const opp = (p: LidPlek): number => info?.oppervlak.get(stam(p)) ?? 0
    const grootte = (p: LidPlek): number => {
      const m = maatVan(p.pad)
      return m ? m.b * m.h : 0
    }
    /*
     * De rangorde. Het ontwerp zette "de meeste kleurstellingen" voorop, maar dat
     * gaat mis: bij de achterwagen van de C2 GN vervangen 73 van de 76
     * kleurstellingen de stoelen, de stangen en de klimaat-kap, en maar 38 de
     * wagenkast (gemeten 30-09, model_MB_C2_E6_Gn_trail.cfg). En alleen op
     * oppervlak gaat het ook mis: de banden van de C2 (32 m², geen kleurstelling
     * vervangt ze) en het interieur van de HH20 (21_innen_1, 187 m²). Daarom:
     * - kandidaten: hoofdtextuur van een dicht materiaal (geen ruit, geen
     *   transmap) met buitenoppervlak (uit het pakket);
     * - "gelakt" is een plek die minstens 10% van de kleurstellingen vervangt (of
     *   alle kandidaten als geen enkele dat haalt);
     * - de eerste lakplek: het grootste buitenoppervlak onder de gelakte;
     * - meer lakplekken: gelakte met ≥ 25% van dat oppervlak (SD77: tex1 25 en
     *   tex2 4 kleurstellingen, 113 en 166 m², allebei carrosserie), en wat de
     *   werker als silhouet mat (`extra`).
     * "Oppervlak" is de SCHIL uit het pakket (zijwanden en dak met de normaal
     * naar buiten, core/bus3d.ts): bij de O560 hebben de stoelen (73 m²) meer
     * oppervlak dan de wagenkast (70 m²). Een ouder pakket zonder schil: het
     * buitenoppervlak. Zonder pakket het grootste beeld.
     */
    const totaal = lid.kleuren?.lijst.length ?? 0
    const buiten = info ? kandidaten.filter((p) => opp(p) > 0 && (!info.hoofd || info.hoofd.has(stam(p)))) : kandidaten
    if (buiten.length === 0) continue
    const maat = (p: LidPlek): number => (info?.schil ? (info.schil.get(stam(p)) ?? 0) : info ? opp(p) : grootte(p))
    const gelakt = buiten.filter((p) => totaal > 0 && telling(p) >= Math.max(1, 0.1 * totaal))
    const pool0 = gelakt.length > 0 ? gelakt : buiten
    // Met een schil: alleen wat er iets van draagt (anders valt het terug op alle kandidaten).
    const pool = info?.schil && pool0.some((p) => maat(p) > 0) ? pool0.filter((p) => maat(p) > 0) : pool0
    const rang = [...pool].sort((a, b) => maat(b) - maat(a) || telling(b) - telling(a) || grootte(b) - grootte(a))
    const gekozen = [rang[0]]
    const extra = new Set((opties.extra?.(lid.rel) ?? []).map((x) => omsiHoofdletters(x)))
    for (const p of [...rang.slice(1), ...buiten.filter((x) => !pool.includes(x))]) {
      if (keyVan(p) === keyVan(rang[0]) || gekozen.includes(p)) continue
      // Groot op de bus én als beeld: de banden van de C2 E5 (04.jpg, 350²) hebben 25% van het oppervlak van de wagenkast (4096²).
      const groot = pool.includes(p) && maat(p) >= 0.25 * maat(rang[0]) && grootte(p) >= 0.25 * grootte(rang[0])
      if (groot || extra.has(omsiHoofdletters(p.plek))) gekozen.push(p)
    }
    for (const p of gekozen) if (!lakKeys.has(keyVan(p))) lakKeys.set(keyVan(p), { lid, plek: p })
  }

  // Doelen: per standaardtextuur, met alle plekken (van alle leden) die hem hebben.
  const doelen: FamilieDoel[] = []
  for (const [sleutel, { lid, plek }] of lakKeys) {
    const maat = maatVan(plek.pad)
    const naam = plek.pad ? basename(plek.pad) : basename(plek.standaard.replace(/\\/g, '/'))
    doelen.push({
      id: `d${doelen.length}`,
      sleutel,
      standaard: plek.pad,
      naam,
      stam: stamVan(naam),
      b: maat?.b ?? 0,
      h: maat?.h ?? 0,
      uitB: 0,
      uitH: 0,
      formaat: maat?.alfa === 'nee' ? 'bc1' : 'bc3',
      low: false,
      plekken: [],
      lowPlekken: [],
      bakker: lid.rel
    })
  }
  const doelOpKey = new Map(doelen.map((d) => [d.sleutel, d]))
  for (const lid of leden) {
    for (const p of lid.plekken) {
      const d = doelOpKey.get(keyVan(p))
      const h = omsiHoofdletters(p.plek)
      if (d) {
        if (!d.plekken.some((x) => x.map === lid.map && omsiHoofdletters(x.plek) === h)) d.plekken.push({ map: lid.map, plek: p.plek })
        continue
      }
      if (!isLow(p)) continue
      // `<lak>_#low`: het doel met dezelfde stam in dezelfde map (of dezelfde naam als hij niet op te lossen is).
      const stam = stamVan(p.pad ? basename(p.pad) : p.standaard).replace(/_#low$/i, '').toLowerCase()
      const dl = doelen.find((x) => x.stam.toLowerCase() === stam)
      if (dl && !dl.lowPlekken.some((x) => x.map === lid.map && omsiHoofdletters(x.plek) === h)) dl.lowPlekken.push({ map: lid.map, plek: p.plek })
    }
  }

  /*
   * Niet te bakken (§3.1, punt 6 en 7). Nagemeten 30-09: de Bus3D-pakketten van
   * vijf van de zes KI-C2's zijn niet te bouwen (hun cfg noemt meshes die er zo
   * niet staan), en een pakket van een voorwagen is de hele trein. Daarom:
   * - alleen de BAKKER van een doel moet te bakken zijn. Kan hij het niet, dan
   *   neemt een ander lid met dezelfde textuur het over (bestuurbaar eerst);
   *   is er geen, dan valt het doel weg en krijgt elk lid met die textuur de naam
   *   niet;
   * - een lid dat meelift (dezelfde standaardtextuur, dus dezelfde UV-indeling)
   *   hoeft niet gebakken te worden: de KI-bussen liften mee (§3.1, punt 4);
   * - de doos (binnen 5 cm) toetsen we alleen tussen pakketten met evenveel
   *   delen: een voorwagen met aanhanger is een andere doos dan een losse
   *   aanhanger, zonder dat de carrosserie anders is.
   * Een uitgesloten lid laat al zijn plekken voor de hele map vervallen.
   */
  const nietOp: Familie['nietOp'] = []
  const uitgesloten = new Set<string>()
  const draagt = (lid: FamilieLid, d: FamilieDoel): boolean => lid.plekken.some((p) => keyVan(p) === d.sleutel)
  const bakbaar = (lid: FamilieLid): true | NietOpReden => infoVan(lid)?.bakbaar ?? true
  const sluitUit = (lid: FamilieLid, reden: NietOpReden): void => {
    if (uitgesloten.has(lid.rel)) return
    uitgesloten.add(lid.rel)
    nietOp.push({ bus: lid.rel, reden })
  }
  for (const d of [...doelen]) {
    const bakker = leden.find((l) => l.rel === d.bakker)
    const kan = bakker ? bakbaar(bakker) : 'geen-model'
    if (kan === true) continue
    const ander = leden.find((l) => draagt(l, d) && bakbaar(l) === true)
    if (ander) {
      d.bakker = ander.rel
      continue
    }
    doelen.splice(doelen.indexOf(d), 1)
    for (const l of leden) if (draagt(l, d)) sluitUit(l, kan)
  }
  for (const lid of leden) {
    const info = infoVan(lid)
    if (uitgesloten.has(lid.rel) || !info?.doos || info.bakbaar !== true) continue
    for (const d of doelen) {
      if (!draagt(lid, d) || d.bakker === lid.rel) continue
      const bakker = leden.find((l) => l.rel === d.bakker)
      const bi = bakker ? infoVan(bakker) : undefined
      if (bi?.doos && bi.delen === info.delen && !dozenGelijk(bi.doos, info.doos, 0.05)) sluitUit(lid, 'doos')
    }
  }
  const weg = mappen.map(() => new Set<string>())
  for (const lid of leden) if (uitgesloten.has(lid.rel)) for (const p of lid.plekken) weg[lid.map].add(omsiHoofdletters(p.plek))
  for (const d of doelen) {
    d.plekken = d.plekken.filter((p) => !weg[p.map].has(omsiHoofdletters(p.plek)))
    d.lowPlekken = d.lowPlekken.filter((p) => !weg[p.map].has(omsiHoofdletters(p.plek)))
  }
  // De id's opnieuw op volgorde (na het wegvallen van een doel).
  doelen.forEach((d, i) => (d.id = `d${i}`))

  // Conflicten (§3.5): dezelfde plek met een andere standaardtextuur in dezelfde map, op een doel.
  const doelKeys = new Set(doelen.map((d) => d.sleutel))
  const conflicten: Familie['conflicten'] = []
  for (let m = 0; m < mappen.length; m++) {
    const perPlek = new Map<string, Map<string, string[]>>()
    for (const lid of leden) {
      if (lid.map !== m) continue
      for (const p of lid.plekken) {
        const h = omsiHoofdletters(p.plek)
        const t = perPlek.get(h) ?? new Map<string, string[]>()
        const k = keyVan(p)
        t.set(k, [...(t.get(k) ?? []), lid.rel])
        perPlek.set(h, t)
      }
    }
    for (const [h, t] of perPlek) {
      if (t.size < 2 || ![...t.keys()].some((k) => doelKeys.has(k))) continue
      if (weg[m].has(h)) continue
      conflicten.push({ map: m, plek: h, bussen: [...new Set([...t.values()].flat())] })
    }
  }

  // Maat van de uitvoer: de standaard, of de start als die groter is (§5.3).
  const deelLeden = leden.filter((l) => eerst.has(l.rel.toLowerCase()))
  for (const d of doelen) {
    let b = d.b
    let h = d.h
    if (opties.start) {
      for (const lid of deelLeden) {
        const k = lid.kleuren?.lijst.find((x) => omsiHoofdletters(x.naam) === omsiHoofdletters(opties.start!))
        for (const p of d.plekken) {
          const pad = k?.texturen[p.plek]
          const m = pad ? maatVan(pad) : undefined
          if (m && m.b * m.h > b * h) {
            b = m.b
            h = m.h
          }
        }
      }
    }
    const u = uitvoerMaat(b, h)
    d.uitB = u.b
    d.uitH = u.h
    d.low = Math.max(u.b, u.h) >= 2048 || d.lowPlekken.length > 0
  }

  // Namen en nummers in de mappen.
  const bestaandeNamen: string[] = []
  let hoogsteNnnn = 0
  for (const m of mappen) {
    const n = namenIn(m, opties.eigenCti)
    bestaandeNamen.push(...n.namen)
    hoogsteNnnn = Math.max(hoogsteNnnn, n.hoogste)
  }

  // De setvar-regel (§5.4, punt 7): elke cfg die een map leest, neemt minstens één van onze items aan.
  const itemKeys = mappen.map(() => new Set<string>())
  for (const d of doelen) {
    for (const p of d.plekken) itemKeys[p.map].add(omsiHoofdletters(p.plek))
    for (const p of d.lowPlekken) itemKeys[p.map].add(omsiHoofdletters(p.plek))
  }
  const optiesMogelijk =
    doelen.length > 0 && leden.every((lid) => lid.plekken.some((p) => itemKeys[lid.map].has(omsiHoofdletters(p.plek))))

  const familie: Familie = {
    omsi,
    bus: rel,
    delen,
    mappen,
    leden,
    doelen,
    nietOp,
    weg,
    conflicten,
    bestaandeNamen: [...new Set(bestaandeNamen)],
    hoogsteNnnn,
    optiesMogelijk,
    glas
  }
  if (opties.sjablonen !== false) for (const d of doelen) d.sjabloon = zoekSjabloon(familie, d)
  return familie
}

function stamVan(naam: string): string {
  const plat = naam.split(/[\\/]/).pop() ?? naam
  const punt = plat.lastIndexOf('.')
  return punt > 0 ? plat.slice(0, punt) : plat
}

function dozenGelijk(a: { min: V3; max: V3 }, b: { min: V3; max: V3 }, marge: number): boolean {
  for (let i = 0; i < 3; i++) if (Math.abs(a.min[i] - b.min[i]) > marge || Math.abs(a.max[i] - b.max[i]) > marge) return false
  return true
}

/* ------------------------------------------------------------------ start-items */

/**
 * De items van de start die NIET op een doel liggen (interieur, stoelen, velgen;
 * §5.4 punt 5c), per map, met hun eigen relatieve pad. Geen ruiten en geen
 * plekken die vervallen. Een pad dat buiten de map zou uitkomen, valt weg.
 * `afhankelijk`: de bestanden, ten opzichte van de OMSI-map.
 */
export function startItems(
  familie: Familie,
  start: string
): { perMap: Array<Array<{ plek: string; pad: string }>>; afhankelijk: string[] } {
  const doelPlekken = familie.mappen.map(() => new Set<string>())
  for (const d of familie.doelen) {
    for (const p of [...d.plekken, ...d.lowPlekken]) doelPlekken[p.map].add(omsiHoofdletters(p.plek))
  }
  const glasPerMap = familie.mappen.map(() => new Set<string>())
  for (const lid of familie.leden) for (const g of familie.glas.get(lid.rel) ?? []) glasPerMap[lid.map].add(g)
  const afhankelijk = new Set<string>()
  const perMap = familie.mappen.map((map, m) =>
    itemsVan(map, start)
      .filter((it) => {
        const h = omsiHoofdletters(it.plek)
        if (doelPlekken[m].has(h) || glasPerMap[m].has(h) || familie.weg[m].has(h)) return false
        const delen = it.rel.replace(/ +$/, '').split(/[\\/]/).filter(Boolean)
        if (delen.length === 0 || delen.includes('..')) return false
        // Zoals L0 (kleurstelling.ts): eerst naast de map, dan waar de bus zijn texturen zoekt.
        const direct = join(map, ...delen)
        const lid = familie.leden.find((l) => l.map === m)
        const vol = existsSync(direct) ? direct : lid ? zoekTextuurVan(lid.busmap, familie.omsi, it.rel.trim()) : undefined
        if (!vol) return false
        afhankelijk.add(relative(familie.omsi, vol).split(sep).join('/'))
        return true
      })
      .map((it) => ({ plek: it.plek, pad: it.rel.replace(/\//g, '\\') }))
  )
  return { perMap, afhankelijk: [...afhankelijk] }
}

/* ------------------------------------------------------------------ sjablonen (§3.3) */

const decodeGeheugen = new Map<string, Textuur | undefined>()
function klein(pad: string, grens: number): Textuur | undefined {
  const k = `${pad.toLowerCase()}|${grens}`
  if (!decodeGeheugen.has(k)) {
    const t = decodeer(pad)
    decodeGeheugen.set(k, t ? verkleinGemiddeld(t, grens) : undefined)
    while (decodeGeheugen.size > 24) decodeGeheugen.delete(decodeGeheugen.keys().next().value as string)
  }
  return decodeGeheugen.get(k)
}

/** PSNR van RGB tussen twee beelden van dezelfde maat. */
export function psnrRgb(a: Textuur, b: Textuur): number {
  if (a.breedte !== b.breedte || a.hoogte !== b.hoogte) return 0
  let se = 0
  for (let i = 0; i < a.pixels.length; i += 4) {
    for (let k = 0; k < 3; k++) {
      const d = a.pixels[i + k] - b.pixels[i + k]
      se += d * d
    }
  }
  const mse = se / ((a.pixels.length / 4) * 3)
  return mse === 0 ? 99 : 10 * Math.log10((255 * 255) / mse)
}

/** Een .rpc lezen: de eerste vijf regels, relatief aan de .rpc (BS, AL, MA, AD, MU). */
export function leesRpc(rpc: string): { bs?: string; al?: string; ma?: string; ad?: string; mu?: string } {
  let regels: string[]
  try {
    regels = iconv.decode(readFileSync(rpc), 'win1252').split(/\r?\n/)
  } catch {
    return {}
  }
  const vol = (i: number): string | undefined => {
    const r = (regels[i] ?? '').trim()
    if (!r || r.includes('..')) return undefined
    const p = join(dirname(rpc), ...r.split(/[\\/]/).filter(Boolean))
    return existsSync(p) ? p : undefined
  }
  return { bs: vol(0), al: vol(1), ma: vol(2), ad: vol(3), mu: vol(4) }
}

/** Alle .rpc's in de SDK en in de voertuigmappen van de familie. */
function rpcKandidaten(familie: Familie): string[] {
  const uit: string[] = []
  const loop = (map: string, diepte: number): void => {
    let inhoud: Dirent[]
    try {
      inhoud = readdirSync(map, { withFileTypes: true })
    } catch {
      return
    }
    for (const d of inhoud) {
      const vol = join(map, d.name)
      if (d.isDirectory()) {
        if (diepte < 5) loop(vol, diepte + 1)
      } else if (/\.rpc$/i.test(d.name)) uit.push(vol)
    }
  }
  loop(join(familie.omsi, 'SDK', 'RepaintTool'), 0)
  const voertuigmappen = new Set<string>()
  const vehicles = join(familie.omsi, 'Vehicles')
  for (const l of familie.leden) {
    const r = relative(vehicles, l.busmap).split(sep)[0]
    if (r && r !== '..') voertuigmappen.add(join(vehicles, r))
  }
  for (const m of voertuigmappen) loop(m, 0)
  return uit
}

const VARIANT = /_(üfenster|ufenster|full|pop|trans|nl|neu|b|pre)\.rpc$/i

/** De helderheid van een beeld, per pixel. */
function helderheid(t: Textuur): Float64Array {
  const u = new Float64Array(t.breedte * t.hoogte)
  for (let i = 0; i < u.length; i++) u[i] = 0.2126 * t.pixels[i * 4] + 0.7152 * t.pixels[i * 4 + 1] + 0.0722 * t.pixels[i * 4 + 2]
  return u
}

/** De sterkte van de randen (centrale verschillen). */
function randen(l: Float64Array, b: number, h: number): Float64Array {
  const u = new Float64Array(b * h)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < b - 1; x++) {
      u[y * b + x] = Math.hypot(l[y * b + x + 1] - l[y * b + x - 1], l[(y + 1) * b + x] - l[(y - 1) * b + x])
    }
  }
  return u
}

/** Genormaliseerde kruiscorrelatie, -1..1. */
function ncc(a: Float64Array, b: Float64Array): number {
  let ma = 0
  let mb = 0
  for (let i = 0; i < a.length; i++) {
    ma += a[i]
    mb += b[i]
  }
  ma /= a.length
  mb /= b.length
  let s = 0
  let sa = 0
  let sb = 0
  for (let i = 0; i < a.length; i++) {
    const x = a[i] - ma
    const y = b[i] - mb
    s += x * y
    sa += x * x
    sb += y * y
  }
  return sa > 0 && sb > 0 ? s / Math.sqrt(sa * sb) : 0
}

/** Hoe goed twee beelden van dezelfde maat op elkaar lijken: correlatie van helderheid en van randen. */
export function overeenkomst(a: Textuur, b: Textuur): { lum: number; randen: number } {
  if (a.breedte !== b.breedte || a.hoogte !== b.hoogte) return { lum: 0, randen: 0 }
  const la = helderheid(a)
  const lb = helderheid(b)
  return { lum: ncc(la, lb), randen: ncc(randen(la, a.breedte, a.hoogte), randen(lb, b.breedte, b.hoogte)) }
}

/**
 * Het sjabloon van de maker dat bij dit doel past (§3.3).
 *
 * Nagemeten 30-09 (alleen gelezen), en anders dan het ontwerp aannam ("op 1/8
 * is BS vrijwel gelijk aan de standaard, PSNR ≥ 30 dB"): BS is de textuur zonder
 * lak én vaak van een andere versie. SD77_01_BS tegen SD77_01.tga: 23,0 dB,
 * buiten het masker 25,9; newC2EG_BS (4096²) tegen newC2EG.tga (2048²): 11,7
 * dB, buiten het masker 22,6; EN92_1: 26,7 en 30,8. Op inhoud alleen gaat het
 * ook niet: de sjablonen van de SD80 en SD81 lijken net zo op SD77_01 (correlatie
 * van de helderheid 0,944 en 0,931 tegen 0,950).
 *
 * Daarom zo:
 * 1. BS draagt de naam van de textuur: `<stam>_BS` (SD77_01_BS bij SD77_01.tga,
 *    newC2EG_BS bij newC2EG.tga, EN92_1_BS bij EN92_1.tga; de .rpc zelf heet
 *    anders, C2_21_Standard). Dan moet de verhouding kloppen (BS mag een
 *    veelvoud zijn: de HH20 heeft 4096² bij 2048²) en de randen moeten ermee
 *    samenvallen: correlatie ≥ 0,4 (HH20 0,55; het sjabloon van de achterwagen
 *    tegen de voorwagen 0,24).
 * 2. Anders op inhoud: correlatie van de helderheid ≥ 0,9 en van de randen
 *    ≥ 0,8, de hoogste wint.
 * De gewone variant wint van _üFenster, _full, _POP: die openen de ruiten voor
 * beplakking (fase 3). Hooguit twaalf keer uitpakken; onthouden per textuur.
 */
export function zoekSjabloon(familie: Familie, d: FamilieDoel): FamilieSjabloon | undefined {
  if (!d.standaard || !d.b || !d.h) return undefined
  let st = '-'
  try {
    const x = statSync(d.standaard)
    st = `${x.size}:${x.mtimeMs}`
  } catch {
    // dan zonder stempel
  }
  const sleutel = `${d.standaard.toLowerCase()}|${st}`
  if (sjabloonGeheugen.has(sleutel)) return sjabloonGeheugen.get(sleutel)
  const stam = d.stam.toLowerCase()
  const opNaam = (bs: string): boolean => basename(bs).toLowerCase().replace(/\.[^.]+$/, '') === `${stam}_bs`
  const lijst = rpcKandidaten(familie)
    .map((rpc) => ({ rpc, s: leesRpc(rpc) }))
    .filter((k) => k.s.bs && k.s.ma)
    .sort((a, b) => Number(opNaam(b.s.bs!)) - Number(opNaam(a.s.bs!)) || Number(VARIANT.test(a.rpc)) - Number(VARIANT.test(b.rpc)))
  const kandidaten: Array<FamilieSjabloon & { naamRaak: boolean }> = []
  let uitgepakt = 0
  for (const { rpc, s } of lijst) {
    const m = maatVan(s.bs)
    if (!m || m.b * d.h !== m.h * d.b || m.b < d.b || m.b % d.b !== 0) continue
    if (uitgepakt >= 12) break
    uitgepakt++
    const grens = Math.max(8, Math.round(Math.max(d.b, d.h) / 8))
    const a = klein(s.bs!, grens)
    const b = klein(d.standaard, grens)
    if (!a || !b) continue
    const o = overeenkomst(a, b)
    const naamRaak = opNaam(s.bs!)
    if (naamRaak ? o.randen < 0.4 : o.lum < 0.9 || o.randen < 0.8) continue
    kandidaten.push({
      rpc,
      naam: basename(rpc).replace(/\.rpc$/i, ''),
      ...s,
      b: m.b,
      h: m.h,
      overeenkomst: Math.round(o.randen * 1000) / 1000,
      naamRaak
    })
    if (naamRaak && !VARIANT.test(rpc)) break
  }
  kandidaten.sort(
    (x, y) =>
      Number(y.naamRaak) - Number(x.naamRaak) ||
      Number(VARIANT.test(x.rpc)) - Number(VARIANT.test(y.rpc)) ||
      y.overeenkomst - x.overeenkomst
  )
  const gekozen = kandidaten[0] ? (({ naamRaak: _n, ...rest }) => rest)(kandidaten[0]) : undefined
  sjabloonGeheugen.set(sleutel, gekozen)
  while (sjabloonGeheugen.size > 64) sjabloonGeheugen.delete(sjabloonGeheugen.keys().next().value as string)
  return gekozen
}
const sjabloonGeheugen = new Map<string, FamilieSjabloon | undefined>()

/* ------------------------------------------------------------------ busopties (§4.9) */

/**
 * De busopties van de familie: elke [setvar]-variabele uit de .cti's van de
 * mappen. Techniek als een script van een lid hem noemt, uiterlijk als alleen
 * `[visible]` of `[matl_change]` van een cfg hem gebruikt; wat nergens gebruikt
 * wordt, telt als techniek (voorzichtig). Een vuistregel; P16 kijkt de bekende
 * gevallen na.
 */
export function lakOpties(familie: Familie): LakOptie[] {
  const vars = new Map<string, { naam: string; waarden: Set<number> }>()
  for (const m of familie.mappen) {
    for (const [h, v] of setvarsIn(m)) {
      const bekend = vars.get(h)
      if (bekend) for (const w of v.waarden) bekend.waarden.add(w)
      else vars.set(h, { naam: v.naam, waarden: new Set(v.waarden) })
    }
  }
  if (vars.size === 0) return []
  // De scripts van alle leden, één keer gelezen, in kleine letters.
  const scripts: string[] = []
  const gelezen = new Set<string>()
  for (const lid of familie.leden) {
    for (const s of busLijsten(lid.pad).scripts) {
      if (gelezen.has(s.toLowerCase())) continue
      gelezen.add(s.toLowerCase())
      try {
        scripts.push(readFileSync(s, 'latin1').toLowerCase())
      } catch {
        // een script dat er niet is, noemt niets
      }
    }
  }
  // De meshes per variabele, uit de cfg's van de leden.
  const perVar = new Map<string, Array<{ o3d: string; waarde: number; alfa: boolean }>>()
  const wissel = new Set<string>()
  const cfgs = new Set<string>()
  for (const lid of familie.leden) {
    if (cfgs.has(lid.cfg.toLowerCase())) continue
    cfgs.add(lid.cfg.toLowerCase())
    const cfg = leesSchermcfg(lid.cfg)
    if (!cfg) continue
    for (const mesh of cfg.meshes) {
      const alfa = mesh.materialen.some((m) => (m.alfa ?? 0) >= 1)
      for (const z of mesh.zicht) {
        const h = omsiHoofdletters(z.variabele)
        const lijst = perVar.get(h) ?? []
        lijst.push({ o3d: basename(mesh.pad.trim()), waarde: z.waarde, alfa })
        perVar.set(h, lijst)
      }
      for (const m of mesh.materialen) if (m.variabele) wissel.add(omsiHoofdletters(m.variabele))
    }
  }
  const uit: LakOptie[] = []
  for (const [h, v] of vars) {
    const klein = v.naam.toLowerCase()
    const inScript = scripts.some((s) => s.includes(`.l.${klein})`) || s.includes(`.l.${klein} `))
    const meshes = perVar.get(h) ?? []
    const soort: LakOptie['soort'] = !inScript && (meshes.length > 0 || wissel.has(h)) ? 'uiterlijk' : 'techniek'
    const waarden = [...v.waarden].sort((a, b) => a - b)
    let verberg: number | undefined
    if (meshes.length > 0) {
      for (const w of [...waarden, 0, 1]) {
        if (meshes.every((m) => Math.abs(w - m.waarde) >= 0.5)) {
          verberg = w
          break
        }
      }
    }
    uit.push({
      variabele: v.naam,
      soort,
      waarden,
      verberg,
      meshes: [...new Set(meshes.map((m) => m.o3d))].slice(0, 12),
      overLak: meshes.some((m) => m.alfa)
    })
  }
  return uit.sort((a, b) => a.variabele.localeCompare(b.variabele))
}

/* ------------------------------------------------------------------ naar de studio */

/**
 * Wat de studio van de familie ziet (`lak:doelen`): zonder paden. `idVan` geeft
 * het id van een bestand in het Bus3D-register (main registreert ze).
 */
export function familieInfo(familie: Familie, idVan: (pad: string) => string | undefined): LakFamilieInfo {
  const sjabloon = (s: FamilieSjabloon | undefined): LakSjabloon | undefined =>
    s
      ? {
          naam: s.naam,
          bs: s.bs ? idVan(s.bs) : undefined,
          al: s.al ? idVan(s.al) : undefined,
          ma: s.ma ? idVan(s.ma) : undefined,
          ad: s.ad ? idVan(s.ad) : undefined,
          mu: s.mu ? idVan(s.mu) : undefined,
          b: s.b,
          h: s.h,
          overeenkomst: s.overeenkomst
        }
      : undefined
  const doelen: LakDoel[] = familie.doelen.map((d) => ({
    id: d.id,
    naam: d.naam,
    textuur: d.standaard ? idVan(d.standaard) : undefined,
    b: d.b,
    h: d.h,
    uitB: d.uitB,
    uitH: d.uitH,
    formaat: d.formaat,
    low: d.low,
    plekken: d.plekken,
    bakker: d.bakker,
    sjabloon: sjabloon(d.sjabloon)
  }))
  const uitgesloten = new Set(familie.nietOp.map((n) => n.bus))
  return {
    bus: familie.bus,
    mappen: familie.mappen.length,
    leden: familie.leden.map((l) => ({
      bus: l.rel,
      bestuurbaar: l.bestuurbaar,
      doelen: uitgesloten.has(l.rel)
        ? []
        : familie.doelen.filter((d) => l.plekken.some((p) => d.plekken.some((x) => x.map === l.map && omsiHoofdletters(x.plek) === omsiHoofdletters(p.plek)))).map((d) => d.id)
    })),
    doelen,
    nietOp: familie.nietOp,
    conflicten: familie.conflicten.map((c) => ({ plek: c.plek, bussen: c.bussen })),
    bestaandeNamen: familie.bestaandeNamen,
    optiesMogelijk: familie.optiesMogelijk,
    geenCtc: familie.geenCtc
  }
}

/** De cfg's die een map lezen (voor het nummer per cfg na het plaatsen). */
export function cfgsVanMap(familie: Familie, m: number): FamilieLid[] {
  return familie.leden.filter((l) => l.map === m)
}

