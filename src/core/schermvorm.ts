import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, extname, isAbsolute, join, resolve, sep } from 'node:path'
import type { Busmodule } from './busmodule'
import { leesKleurstellingen, textuurSleutel, vervangingen } from './kleurstelling'
import { ontleedO3d, type O3dMateriaal, type O3dModel } from './o3d'
import {
  binnenZichtbaar,
  cfgRegels,
  leesSchermcfg,
  materiaalcontexten,
  type CfgAnim,
  type CfgMateriaal,
  type CfgMesh,
  type CfgTekstblok,
  type ModelCfg,
  type Punt
} from './schermcfg'
import type {
  Adres,
  Deelsoort,
  Schermdeel,
  Schermfont,
  Schermklik,
  Schermvorm,
  Teksttextuur,
  Zicht
} from '../shared/scherm'

/**
 * HET SCHERM VAN EEN APPARAAT, UIT MODEL.CFG EN .O3D
 *
 * Dit maakt de `Schermvorm` van shared/scherm.ts: welke plaatjes, tekstvakken en
 * aanraakvlakken er op het scherm van een apparaat liggen, waar precies, en
 * onder welke voorwaarde OMSI ze toont. Geen Electron: dit draait ook in een
 * werker en in de probe (scripts/probe-schermvorm.ts).
 *
 * DE WEG, IN HET KORT (de volledige regels en hun bewijs staan in
 * nakijken_achtergrond.md, 'GECORRIGEERDE SPECIFICATIE')
 *
 * 1. Elke [mesh]-regel door zijn keten van [animparent] en [newanim], met de
 *    live waarden van de variabelen. Zonder die keten liggen de zes regels van
 *    ALMEX-menu 26 (17_almex_click_sonderansg_1..6, zonder anim) 1,3 m naast
 *    het scherm (17_almex_screen_0, met drie keer anim_trans trans_dauer); met
 *    trans_dauer = 1 liggen ze er 0,4-0,7 mm boven. De 0x79-matrix van
 *    sonderansg_1 draagt precies die verschuiving (-0,026; -0,057; 1,349).
 * 2. De ANKERS van het apparaat -- zijn tekstmaterialen en klikvlakken, zoals
 *    core/busmodule.ts ze groepeert -- stemmen op het oppervlak dat onder hen
 *    ligt: eerst alleen de tekstvakken, de klikvlakken pas als die nergens op
 *    liggen. Kandidaten komen uit ALLE meshes van de cfg. Het vaakst gekozen
 *    oppervlak is de achtergrond (bij de ALMEX: 29 schermquads op dezelfde plek,
 *    één per menu), en daarvan alleen het vlakke, samenhangende STUK onder de
 *    ankers: de AFR 200 heeft zijn display, zijn toetsen en zijn behuizing op één
 *    textuur van 2517 driehoeken, en alleen 5 daarvan zijn het display
 *    (uv-px 76..830 x 1863..2010 van AFR200.dds).
 * 3. Dat stuk is het vlak. Alles wordt in (s, t) op dat vlak uitgedrukt, met de
 *    fysieke verhouding (ALMEX 185 x 134 mm = 1,38; de uitsnede uit het plaatje
 *    is 1024 x 778 px = 1,32 -- de beeldpunten zijn niet vierkant).
 * 4. Wat getekend wordt kijkt naar de bestuurder (windingnormaal (B-A)x(C-A),
 *    nooit de hoekpuntnormalen). De klikvlakken van de ALMEX kijken de andere
 *    kant op en zijn in het spel dan ook onzichtbaar; ze blijven wel klikbaar.
 * 5. Knoppen die op het vlak liggen worden aanraakvlakken; wat er verder vanaf
 *    ligt (de kaartuitgifte, de grendel, het wisselgeld: 63-186 mm) blijft een
 *    gewone toets in de rijen van het paneel.
 *
 * ASSEN
 * Alles in de assen van de o3d-bestanden: x breed, y hoog, z lang. Dat is een
 * gespiegeld stelsel ten opzichte van de bus in het echt (OMSI: x rechts, y
 * vooruit, z omhoog), en daarom is 'rechts, gezien van de voorkant' hier n x
 * omhoog in plaats van omhoog x n. Nagemeten aan de ALMEX: met n x omhoog komt
 * de lege blauwe kolom van 17_almex_s_0.jpg links, zoals op Lucs schermafdruk.
 */

/* ------------------------------------------------------------------ rekenen */

type Mat = number[] // 3x3, rijgewijs

interface Affien {
  m: Mat
  t: Punt
}

const EENHEID: Mat = [1, 0, 0, 0, 1, 0, 0, 0, 1]

const min = (a: Punt, b: Punt): Punt => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const plus = (a: Punt, b: Punt): Punt => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const maal = (a: Punt, f: number): Punt => [a[0] * f, a[1] * f, a[2] * f]
const punt = (a: Punt, b: Punt): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const kruis = (a: Punt, b: Punt): Punt => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
]
const lengte = (a: Punt): number => Math.hypot(a[0], a[1], a[2])
const eenheid = (a: Punt): Punt => {
  const l = lengte(a)
  return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0]
}

function matMaal(a: Mat, b: Mat): Mat {
  const c: Mat = new Array(9).fill(0)
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) c[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]
  return c
}
function matPunt(a: Mat, p: Punt): Punt {
  return [
    a[0] * p[0] + a[1] * p[1] + a[2] * p[2],
    a[3] * p[0] + a[4] * p[1] + a[5] * p[2],
    a[6] * p[0] + a[7] * p[1] + a[8] * p[2]
  ]
}
function transponeer(a: Mat): Mat {
  return [a[0], a[3], a[6], a[1], a[4], a[7], a[2], a[5], a[8]]
}
/** Rechtshandig draaien om een o3d-as over `graden`. */
function draai(as: 0 | 1 | 2, graden: number): Mat {
  const h = (graden * Math.PI) / 180
  const c = Math.cos(h)
  const s = Math.sin(h)
  if (as === 0) return [1, 0, 0, 0, c, -s, 0, s, c]
  if (as === 1) return [c, 0, s, 0, 1, 0, -s, 0, c]
  return [c, -s, 0, s, c, 0, 0, 0, 1]
}
/** Eerst `b`, dan `a`. */
function na(a: Affien, b: Affien): Affien {
  return { m: matMaal(a.m, b.m), t: plus(matPunt(a.m, b.t), a.t) }
}
function pas(a: Affien, p: Punt): Punt {
  return plus(matPunt(a.m, p), a.t)
}

/* ------------------------------------------------------------ o3d-bestanden */

/**
 * Wat er van een o3d nodig is om te weten OF hij ertoe doet: de doos van de
 * ruwe hoekpunten, het draaipunt, de materialen. Klein genoeg om van elke mesh
 * van de bus te onthouden; de meetkunde zelf komt pas uit `modelVan` als de
 * mesh bij het apparaat in de buurt ligt. De MAN NLC heeft 206 MB aan o3d's.
 */
interface O3dInfo {
  bestand: string
  sleutel: string
  /** Te ontleden (met hoekpunten en driehoeken). */
  geldig: boolean
  versleuteld: boolean
  lo: Punt
  hi: Punt
  transform?: number[]
  materialen: O3dMateriaal[]
  /** Wanneer grootte en wijzigingstijd voor het laatst nagekeken zijn (Date.now()). */
  gezien: number
}

const samenvattingen = new Map<string, O3dInfo>()
/**
 * Zo lang geldt een samenvatting zonder opnieuw `stat`. Een analyse loopt ALLE
 * meshes van de bus langs, en per apparaat zijn het er twee (eerst de getallen,
 * dan de vorm). Gemeten bij de Citybus 530 (twaalf apparaten, o3d's al in het
 * geheugen): 2,9 van de 5,4 s ging op aan `stat`. Een o3d die tijdens het rijden
 * verandert, is er zo hooguit tien tellen later -- en de vorm wordt toch één
 * keer per bus gebouwd.
 */
const VERS_MS = 10_000
/** De laatst gebruikte modellen, hooguit ~48 MB aan hoekpunten en driehoeken. */
const modellen = new Map<string, { sleutel: string; model: O3dModel; bytes: number }>()
let modelBytes = 0
const MODEL_BUDGET = 48 * 1024 * 1024

/**
 * Een o3d, ook als hij versleuteld is.
 *
 * Vanaf versie 4 staat op plek 4 een sleutel; is die niet ffffffff, dan zijn de
 * coördinaten per hoekpunt door elkaar gezet (core/o3d.ts, 'versleuteld'). Met
 * ffffffff op die plek laat het bestand zich gewoon ontleden: de driehoeken en
 * materialen kloppen, de posities moeten nog ontward worden en de uv's zijn niet
 * te vertrouwen (HH109 almex_bubble1_s1: v -0,57..+0,07, een open tekstmesh
 * -0,5725..-0,4666).
 */
function ontleed(bestand: string): { model?: O3dModel; versleuteld: boolean } {
  try {
    /* readFileSync geeft een eigen buffer; die mag hier beschreven worden. */
    const bytes = readFileSync(bestand)
    const versleuteld = bytes.length >= 8 && bytes[2] >= 4 && bytes.readUInt32LE(4) !== 0xffffffff
    if (versleuteld) bytes.writeUInt32LE(0xffffffff, 4)
    return { model: ontleedO3d(bytes).model, versleuteld }
  } catch {
    return { versleuteld: false }
  }
}

function onthoudModel(bestand: string, sleutel: string, model: O3dModel): void {
  const bytes =
    model.vertices.byteLength + model.normals.byteLength + model.uvs.byteLength + model.triangles.byteLength +
    model.materiaalPerDriehoek.byteLength
  const eerder = modellen.get(bestand)
  if (eerder) {
    modelBytes -= eerder.bytes
    modellen.delete(bestand)
  }
  modellen.set(bestand, { sleutel, model, bytes })
  modelBytes += bytes
  for (const [naam, oud] of modellen) {
    if (modelBytes <= MODEL_BUDGET || naam === bestand) break
    modellen.delete(naam)
    modelBytes -= oud.bytes
  }
}

function laadO3d(bestand: string): O3dInfo {
  const nu = Date.now()
  const bekend = samenvattingen.get(bestand)
  if (bekend && nu - bekend.gezien < VERS_MS) return bekend
  let sleutel = ''
  try {
    const st = statSync(bestand)
    sleutel = `${st.size}|${st.mtimeMs}`
  } catch {
    return { bestand, sleutel, geldig: false, versleuteld: false, lo: [0, 0, 0], hi: [0, 0, 0], materialen: [], gezien: nu }
  }
  if (bekend && bekend.sleutel === sleutel) {
    bekend.gezien = nu
    return bekend
  }
  const { model, versleuteld } = ontleed(bestand)
  const lo: Punt = [Infinity, Infinity, Infinity]
  const hi: Punt = [-Infinity, -Infinity, -Infinity]
  const v = model?.vertices ?? new Float32Array(0)
  for (let i = 0; i + 2 < v.length; i += 3)
    for (let j = 0; j < 3; j++) {
      if (v[i + j] < lo[j]) lo[j] = v[i + j]
      if (v[i + j] > hi[j]) hi[j] = v[i + j]
    }
  const info: O3dInfo = {
    bestand,
    sleutel,
    geldig: !!model && v.length >= 3 && model.triangles.length >= 3,
    versleuteld,
    lo,
    hi,
    transform: model?.transform,
    materialen: model?.materialen ?? [],
    gezien: nu
  }
  if (samenvattingen.size > 20000) samenvattingen.clear()
  samenvattingen.set(bestand, info)
  if (model) onthoudModel(bestand, sleutel, model)
  return info
}

/** De meetkunde van een o3d; uit het geheugen als hij er nog is. */
function modelVan(info: O3dInfo): O3dModel | undefined {
  if (!info.geldig) return undefined
  const bekend = modellen.get(info.bestand)
  if (bekend && bekend.sleutel === info.sleutel) {
    /* Achteraan zetten: net gebruikt. */
    modellen.delete(info.bestand)
    modellen.set(info.bestand, bekend)
    return bekend.model
  }
  const { model } = ontleed(info.bestand)
  if (model) onthoudModel(info.bestand, info.sleutel, model)
  return model
}

/* ------------------------------------------------------------------ ketens */

/**
 * De verplaatsing van één [newanim], in o3d-assen.
 *
 * GEMETEN (HH20, nakijken_achtergrond.md §2): anim_trans schuift langs de
 * lokale x NA de origin_rot's. `origin_rot_y 90` maakt van x de richting
 * omhoog (o3d +y), `origin_rot_z 90` maakt er o3d -z van. In o3d-assen is dat
 * gewoon rechtshandig draaien over +hoek, met rot_x om o3d-x, rot_y om o3d-z
 * (OMSI-y is vooruit) en rot_z om o3d-y (OMSI-z is omhoog).
 *
 * anim_rot draait om DIEZELFDE lokale x. Niet gemeten aan een scherm, wel te
 * zien aan de bus zelf: een wiel draait zonder origin_rot (om de breedte-as),
 * de deur van de HH20 met `origin_rot_y -90` en de bestuurdersdeur met
 * `origin_rot_y 90` om de hoogte-as, en het dashboard (`anim_rot vdv_move_x`,
 * zonder draaiing) kantelt om de breedte-as. De draairichting zelf is een
 * aanname (dezelfde als bij origin_rot); zolang een onderdeel en zijn
 * achtergrond dezelfde keten hebben -- het gewone geval -- valt hij weg.
 *
 * `origin_from_mesh` neemt alleen het PUNT uit de 0x79-matrix, niet zijn
 * draaiing: clickN1 van de ALMEX heeft een matrix met draaiing en schaal 0,86
 * en ligt met dezelfde drie anims als het scherm toch op zijn cijfer.
 */
function animAffien(anim: CfgAnim, transform: number[] | undefined, waarde: (naam: string) => number): Affien {
  const o: Punt =
    anim.oorsprong === 'mesh'
      ? transform
        ? [transform[12], transform[13], transform[14]]
        : [0, 0, 0]
      : anim.oorsprong
  let r: Mat = EENHEID
  for (const d of anim.draaiingen) r = matMaal(r, draai(d.as === 'x' ? 0 : d.as === 'y' ? 2 : 1, d.hoek))
  let uit: Affien = { m: EENHEID, t: [0, 0, 0] }
  if (anim.draai && anim.draai.factor !== 0) {
    const hoek = anim.draai.factor * waarde(anim.draai.variabele)
    if (hoek !== 0) {
      const m = matMaal(matMaal(r, draai(0, hoek)), transponeer(r))
      uit = { m, t: min(o, matPunt(m, o)) }
    }
  }
  if (anim.schuif && anim.schuif.factor !== 0) {
    const stap = anim.schuif.factor * waarde(anim.schuif.variabele)
    if (stap !== 0) uit = { m: uit.m, t: plus(uit.t, maal(matPunt(r, [1, 0, 0]), stap)) }
  }
  return uit
}

/* ------------------------------------------------------------- driehoeken */

interface Drie {
  /** Hoekpuntnummers in de o3d. */
  i: [number, number, number]
  a: Punt
  b: Punt
  c: Punt
  /** Eenheidsnormaal uit de winding: (B-A)x(C-A). */
  n: Punt
  opp: number
  mat: number
  /* Voor de barycentrische toets. */
  e0: Punt
  e1: Punt
  d00: number
  d01: number
  d11: number
  inv: number
}

function maakDrie(i: [number, number, number], a: Punt, b: Punt, c: Punt, mat: number): Drie | undefined {
  const e0 = min(b, a)
  const e1 = min(c, a)
  const k = kruis(e0, e1)
  const l = lengte(k)
  const opp = l / 2
  /* Oppervlakte kleiner dan 1e-8 m²: overal negeren (ankers, dozen, uv's). */
  if (!(opp >= 1e-8)) return undefined
  const d00 = punt(e0, e0)
  const d01 = punt(e0, e1)
  const d11 = punt(e1, e1)
  const den = d00 * d11 - d01 * d01
  if (!(Math.abs(den) > 1e-30)) return undefined
  return { i, a, b, c, n: [k[0] / l, k[1] / l, k[2] / l], opp, mat, e0, e1, d00, d01, d11, inv: 1 / den }
}

/**
 * Een rooster over driehoeken, zodat `raak` niet elke keer alle driehoeken van
 * de hele binnenruimte hoeft af te lopen. Cellen van 2 cm; een driehoek die
 * over te veel cellen gaat, staat in een aparte lijst.
 */
class Rooster {
  private kaart = new Map<number, number[]>()
  private groot: number[] = []
  /**
   * `gebied`: alleen driehoeken (en cellen) binnen deze doos. Bij het stemmen is
   * dat de doos om de ankers: de binnenkant van een bus heeft driehoeken van een
   * halve meter die anders in duizenden cellen terechtkomen.
   */
  constructor(
    readonly drie: Drie[],
    marge: number,
    gebied?: { lo: Punt; hi: Punt },
    private cel = 0.02
  ) {
    const halfDiag = cel * 0.8661
    const g0 = gebied ? gebied.lo.map((x) => Math.floor(x / cel)) : undefined
    const g1 = gebied ? gebied.hi.map((x) => Math.floor(x / cel)) : undefined
    drie.forEach((d, k) => {
      const lo = [0, 1, 2].map((j) => Math.floor((Math.min(d.a[j], d.b[j], d.c[j]) - marge) / cel))
      const hi = [0, 1, 2].map((j) => Math.floor((Math.max(d.a[j], d.b[j], d.c[j]) + marge) / cel))
      if (g0 && g1) {
        for (let j = 0; j < 3; j++) {
          lo[j] = Math.max(lo[j], g0[j])
          hi[j] = Math.min(hi[j], g1[j])
          if (lo[j] > hi[j]) return
        }
      }
      const aantal = (hi[0] - lo[0] + 1) * (hi[1] - lo[1] + 1) * (hi[2] - lo[2] + 1)
      if (aantal > 20000) {
        this.groot.push(k)
        return
      }
      for (let x = lo[0]; x <= hi[0]; x++)
        for (let y = lo[1]; y <= hi[1]; y++)
          for (let z = lo[2]; z <= hi[2]; z++) {
            /* Een grote schuine driehoek: alleen de cellen die zijn vlak raken. */
            if (aantal > 8) {
              const m: Punt = [(x + 0.5) * cel - d.a[0], (y + 0.5) * cel - d.a[1], (z + 0.5) * cel - d.a[2]]
              if (Math.abs(punt(m, d.n)) > marge + halfDiag) continue
            }
            const sleutel = celSleutel(x, y, z)
            const lijst = this.kaart.get(sleutel)
            if (lijst) lijst.push(k)
            else this.kaart.set(sleutel, [k])
          }
    })
  }
  bij(q: Punt): number[] {
    const lijst = this.kaart.get(celSleutel(Math.floor(q[0] / this.cel), Math.floor(q[1] / this.cel), Math.floor(q[2] / this.cel)))
    return lijst ? (this.groot.length ? lijst.concat(this.groot) : lijst) : this.groot
  }
}

/** Eén getal per cel; een bus past ruim in 10.000 cellen van 2 cm per as. */
function celSleutel(x: number, y: number, z: number): number {
  return ((x + 5000) * 10001 + (y + 5000)) * 10001 + (z + 5000)
}

/** Hetzelfde als `raak`, zonder rooster: voor een handvol driehoeken. */
function raakLos(drie: Drie[], q: Punt, dmax: number): Raak | undefined {
  return raak({ drie, bij: () => alleIndexen(drie.length) } as unknown as Rooster, q, dmax)
}
const indexen: number[] = []
function alleIndexen(n: number): number[] {
  while (indexen.length < n) indexen.push(indexen.length)
  return n === indexen.length ? indexen : indexen.slice(0, n)
}

interface Raak {
  /** Getekend: positief = aan de voorkant (de kant van de windingnormaal). */
  d: number
  drie: number
}

/**
 * De driehoek recht onder (of boven) `q`: de kleinste |d|, met de projectie
 * binnen de driehoek (barycentrisch >= -0,03), en |d| <= `dmax`.
 */
function raak(rooster: Rooster, q: Punt, dmax: number): Raak | undefined {
  let beste: Raak | undefined
  for (const k of rooster.bij(q)) {
    const t = rooster.drie[k]
    const w = min(q, t.a)
    const d = punt(w, t.n)
    if (Math.abs(d) > dmax) continue
    if (beste && Math.abs(d) >= Math.abs(beste.d)) continue
    const v2 = min(w, maal(t.n, d))
    const d20 = punt(v2, t.e0)
    const d21 = punt(v2, t.e1)
    const b1 = (t.d11 * d20 - t.d01 * d21) * t.inv
    const b2 = (t.d00 * d21 - t.d01 * d20) * t.inv
    if (b1 < -0.03 || b2 < -0.03 || 1 - b1 - b2 < -0.03) continue
    beste = { d, drie: k }
  }
  return beste
}

/* ------------------------------------------------------------------ meshes */

interface Geo {
  mesh: CfgMesh
  info: O3dInfo
  wereld: Affien
  /** De [newanim]'s van de hele keten, ouder eerst. */
  keten: CfgAnim[]
  /** Hoekpunten in de bus, na de keten; pas uitgerekend als ze nodig zijn (zie `wereldPos`). */
  pos?: Punt[]
  /** De doos om de mesh, na de keten (ruim: de doos van de o3d, meegedraaid). */
  lo: Punt
  hi: Punt
  contexten: (CfgMateriaal | undefined)[]
  /** Per materiaal de driehoeken; pas gemaakt als ze nodig zijn. */
  perMat?: Map<number, Drie[]>
}

function dozeVan(punten: Punt[]): { lo: Punt; hi: Punt } {
  const lo: Punt = [Infinity, Infinity, Infinity]
  const hi: Punt = [-Infinity, -Infinity, -Infinity]
  for (const p of punten)
    for (let j = 0; j < 3; j++) {
      if (p[j] < lo[j]) lo[j] = p[j]
      if (p[j] > hi[j]) hi[j] = p[j]
    }
  return { lo, hi }
}

function binnenDoos(g: { lo: Punt; hi: Punt }, q: Punt, marge: number): boolean {
  for (let j = 0; j < 3; j++) if (q[j] < g.lo[j] - marge || q[j] > g.hi[j] + marge) return false
  return true
}

/** De hoekpunten na de keten; leeg bij een versleutelde mesh (die moet eerst ontward). */
function wereldPos(g: Geo): Punt[] {
  if (g.pos) return g.pos
  const pos: Punt[] = []
  const model = g.info.versleuteld ? undefined : modelVan(g.info)
  if (model) {
    const v = model.vertices
    for (let i = 0; i < v.length / 3; i++) pos.push(pas(g.wereld, [v[i * 3], v[i * 3 + 1], v[i * 3 + 2]]))
  }
  g.pos = pos
  return pos
}

function drieVan(g: Geo, mat: number, eigenPos?: (Punt | undefined)[]): Drie[] {
  if (!eigenPos && g.perMat?.has(mat)) return g.perMat.get(mat)!
  const pos = eigenPos ?? wereldPos(g)
  const m = modelVan(g.info)
  const uit: Drie[] = []
  if (m) {
    for (let t = 0; t < m.materiaalPerDriehoek.length; t++) {
      if (mat >= 0 && m.materiaalPerDriehoek[t] !== mat) continue
      const i: [number, number, number] = [m.triangles[t * 3], m.triangles[t * 3 + 1], m.triangles[t * 3 + 2]]
      const a = pos[i[0]]
      const b = pos[i[1]]
      const c = pos[i[2]]
      if (!a || !b || !c) continue
      const d = maakDrie(i, a, b, c, m.materiaalPerDriehoek[t])
      if (d) uit.push(d)
    }
  }
  if (!eigenPos) {
    g.perMat ??= new Map()
    g.perMat.set(mat, uit)
  }
  return uit
}

/* --------------------------------------------------------------- invoer */

export interface SchermInvoer {
  modelcfg: string
  /** De installatie; een textuur uit de kleurstelling moet daarbinnen liggen. */
  omsiMap: string
  module: Busmodule
  /**
   * Live waarden. Ontbreekt een animatievariabele, dan geldt de startwaarde uit
   * de scripts van de bus (`startwaardenVan`), en anders 0 -- gemarkeerd waar
   * het de plek raakt.
   */
  getallen: Record<string, number>
  /**
   * Optioneel: de namen waarvan de plugin zegt dat de bus ze niet kent
   * (`live.getallenOnbekend`). Die krijgen geen startwaarde uit een script (dat
   * kan het script van een andere variant in dezelfde map zijn), maar 0.
   */
  onbekend?: string[]
  font: (naam: string, volkleur: boolean) => Schermfont | undefined
  /** Absoluut pad van een textuurnaam, of undefined. */
  zoekTextuur: (naam: string) => string | undefined
  bron: (
    pad: string,
    vlaggen: { alfa: 0 | 1 | 2; trans?: string; uit?: [number, number, number, number] }
  ) => { id: string }
}

export interface SchermUitvoer {
  vorm: Schermvorm
  texturen: { id: string; pad: string; vlaggen: object }[]
  knoppenOpScherm: string[]
  /** De klikbare onderdelen van het apparaat die NIET op het scherm liggen. */
  losseKnoppen: LosseKnop[]
}

/**
 * Een knop van het apparaat die geen aanraakvlak werd, met hoe ver hij van het
 * scherm ligt: loodrecht op het vlak (`vlakMm`) en ernaast, in het vlak, tot de
 * rand van het scherm (`randMm`, 0 als hij binnen de rand valt).
 *
 * Een knop die verder dan een meter van het apparaat ligt, staat er niet bij:
 * die is al eerder afgevallen en hoort er zeker niet bij.
 */
export interface LosseKnop {
  acties: string[]
  vlakMm: number
  randMm: number
}

/**
 * Tot hoe ver van het scherm een knop nog OP het apparaat zit.
 *
 * Bij een touchscreen horen de knoppen die geen aanraakvlak werden bij één van
 * twee soorten: toetsen op de voorkant van het apparaat, of iets wat er los van
 * zit maar in dezelfde groep viel. Gemeten over de hele vloot, als afstand tot
 * de rand van het scherm (loodrecht op het vlak en ernaast samen):
 *
 * - het cijferblok van de RG-kastjes van de Kajosoft-Citybussen: 21 tot 91 mm
 *   (een deel ligt 6 cm onder het scherm, schuin) -- die horen erbij;
 * - bij de ALMEX: TICKET TOGGLE 124 mm, de RIEGEL 274 mm, het wisselgeld rond
 *   330 mm -- die zitten er los van.
 *
 * Tussen 91 en 124 zit niets, dus 100. Wat verder ligt, of waarvan de plek niet
 * te meten is (verder dan een meter, versleuteld), hoort er niet bij.
 */
export const LOS_VAN_HET_SCHERM_MM = 100

/** De acties (kleine letters) van de knoppen die niet op het scherm maar wel OP het apparaat liggen. */
export function knoppenOpApparaat(uit: SchermUitvoer): Set<string> {
  return new Set(
    uit.losseKnoppen
      .filter((knop) => Math.hypot(knop.vlakMm, knop.randMm) <= LOS_VAN_HET_SCHERM_MM)
      .flatMap((knop) => knop.acties.map((actie) => actie.toLowerCase()))
  )
}

/* ------------------------------------------------------------- de analyse */

const ONZICHTBAAR = /^(invisible|unsichtbar|transparent)/i
const PERMS: [number, number, number][] = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0]
]

/** Een oppervlak dat achtergrond of laag kan zijn: één materiaal van één [mesh]-regel. */
interface Kandidaat {
  geo: Geo
  mat: number
  ctx?: CfgMateriaal
  naam: string
  drie: Drie[]
  lo: Punt
  hi: Punt
  rooster?: Rooster
}

interface Anker {
  geo: Geo
  soort: 'tekst' | 'klik'
  /** Het materiaal bij een tekst; -1 bij een klik (alle materialen). */
  mat: number
  punten: Punt[]
  midden: Punt
}

/** Het vlak van het scherm. */
interface Vlak {
  o: Punt
  n: Punt
  rechts: Punt
  omhoog: Punt
  s0: number
  s1: number
  t0: number
  t1: number
}

interface Analyse {
  cfg: ModelCfg
  geos: Geo[]
  /** Achtergronden, basis voorop, dan cfg-volgorde; met hun driehoeken. */
  achtergronden: { k: Kandidaat; drie: Drie[] }[]
  lagen: { k: Kandidaat; drie: Drie[] }[]
  teksten: { geo: Geo; mat: number; ctx: CfgMateriaal; drie: Drie[]; benaderd: boolean }[]
  klikken: { geo: Geo; punten: Punt[] }[]
  /** Klikmeshes met een plek die NIET op het scherm liggen; zie `LosseKnop`. */
  los: LosseKnop[]
  vlak?: Vlak
  basis?: Geo
  onvolledig: string[]
  /** Getalvariabelen waarvan de waarde ontbrak en die de plek bepaalden. */
  ontbrekend: Set<string>
}

/** Hoofdletterongevoelig opzoeken in de live getallen. */
function waardenVan(getallen: Record<string, number>): { waarde: (naam: string) => number; heeft: (naam: string) => boolean } {
  const klein = new Map<string, number>()
  for (const [naam, w] of Object.entries(getallen)) {
    if (!klein.has(naam.toLowerCase())) klein.set(naam.toLowerCase(), w)
  }
  /* Alleen eigen sleutels: `'constructor' in {}` is waar. */
  const zoek = (naam: string): number | undefined =>
    Object.hasOwn(getallen, naam) ? getallen[naam] : klein.get(naam.toLowerCase())
  return {
    waarde: (naam) => {
      const w = zoek(naam)
      return typeof w === 'number' && Number.isFinite(w) ? w : 0
    },
    heeft: (naam) => typeof zoek(naam) === 'number'
  }
}

const normPad = (pad: string): string => pad.trim().replace(/[\\/]+/g, '/').toLowerCase()

function analyseer(
  invoer: Pick<SchermInvoer, 'modelcfg' | 'module' | 'getallen' | 'onbekend'> & {
    gevonden: (naam: string, ctx?: CfgMateriaal) => boolean
  }
): Analyse | undefined {
  const cfg = leesSchermcfg(invoer.modelcfg)
  if (!cfg) return undefined
  const live = waardenVan(invoer.getallen)
  /*
   * De plek van een onderdeel hangt aan zijn animatievariabelen. Levert de
   * plugin er een niet (een oudere plugin, of nog niet gevraagd), dan de
   * startwaarde uit de scripts: zonder trans_dauer = 1 (21_cockpit_C2.osc:1497)
   * liggen de zes regels van ALMEX-menu 26 1,3 m naast het scherm en vallen ze
   * als aanraakvlak weg. Pas als ook het script niets zegt: 0, en 'plek onzeker'.
   */
  const onbekend = new Set((invoer.onbekend ?? []).map((naam) => naam.toLowerCase()))
  const animNamen = new Set<string>()
  for (const m of cfg.meshes)
    for (const anim of m.anims)
      for (const naam of [anim.schuif?.variabele, anim.draai?.variabele])
        if (naam && !live.heeft(naam) && !onbekend.has(naam.toLowerCase())) animNamen.add(naam)
  const script = waardenVan(animNamen.size > 0 ? startwaardenVan(invoer.modelcfg, [...animNamen]) : {})
  const waarde = (naam: string): number =>
    live.heeft(naam) ? live.waarde(naam) : script.heeft(naam) ? script.waarde(naam) : 0
  const onvolledig: string[] = []
  const ontbrekend = new Set<string>()

  /* ---- 1. Elke bestaande mesh door zijn keten ---- */
  const geos: (Geo | undefined)[] = cfg.meshes.map(() => undefined)
  const perIdent = new Map<string, number>()
  cfg.meshes.forEach((m, k) => {
    if (m.bestaat && m.ident && !perIdent.has(m.ident.toLowerCase())) perIdent.set(m.ident.toLowerCase(), k)
  })
  const bezig = new Set<number>()
  const geoVan = (k: number): Geo | undefined => {
    if (geos[k]) return geos[k]
    const mesh = cfg.meshes[k]
    if (!mesh.bestaat || bezig.has(k)) return undefined
    bezig.add(k)
    const info = laadO3d(mesh.bestand)
    let wereld: Affien = { m: EENHEID, t: [0, 0, 0] }
    let keten: CfgAnim[] = []
    const ouder = mesh.ouder ? perIdent.get(mesh.ouder.toLowerCase()) : undefined
    if (ouder !== undefined && ouder !== k) {
      const og = geoVan(ouder)
      if (og) {
        wereld = og.wereld
        keten = [...og.keten]
      }
    }
    for (const anim of mesh.anims) {
      wereld = na(wereld, animAffien(anim, info.transform, waarde))
      keten.push(anim)
    }
    /*
     * De doos zonder elk hoekpunt om te rekenen: de acht hoeken van de doos van de
     * o3d door de keten. Iets ruimer bij een draaiing, maar het scheelt bij een
     * bus van 600 meshes honderdduizenden kleine rijtjes.
     */
    const hoeken: Punt[] = []
    if (info.geldig && !info.versleuteld) {
      const [a, b] = [info.lo, info.hi]
      for (const x of [a[0], b[0]]) for (const y of [a[1], b[1]]) for (const z of [a[2], b[2]]) hoeken.push(pas(wereld, [x, y, z]))
    }
    const { lo, hi } = dozeVan(hoeken)
    const geo: Geo = {
      mesh,
      info,
      wereld,
      keten,
      lo,
      hi,
      contexten: info.geldig ? materiaalcontexten(mesh, info.materialen.map((x) => x.textuur)) : []
    }
    geos[k] = geo
    bezig.delete(k)
    return geo
  }
  const alle: Geo[] = []
  cfg.meshes.forEach((m, k) => {
    if (!m.bestaat || !binnenZichtbaar(cfg, m)) return
    const g = geoVan(k)
    if (g?.info.geldig) alle.push(g)
  })

  /* ---- 2. De ankers van het apparaat ---- */
  const module = invoer.module
  const eigen = new Set([...module.vakken.map((v) => normPad(v.onderdeel)), ...module.knoppen.map((k) => normPad(k.onderdeel))])
  const acties = new Set(module.knoppen.map((k) => k.actie.toLowerCase()))
  const ankers: Anker[] = []
  const versleuteldeAnkers: Geo[] = []
  for (const g of alle) {
    if (!eigen.has(normPad(g.mesh.pad))) continue
    const klik = g.mesh.klikken.some((a) => acties.has(a.toLowerCase()))
    const tekstMats = g.contexten.map((c, k) => (c?.tekst !== undefined ? k : -1)).filter((k) => k >= 0)
    if (!klik && tekstMats.length === 0) continue
    if (g.info.versleuteld) {
      versleuteldeAnkers.push(g)
      continue
    }
    for (const mat of tekstMats) {
      const punten = drieVan(g, mat).flatMap((d) => [d.a, d.b, d.c])
      if (punten.length) ankers.push({ geo: g, soort: 'tekst', mat, punten, midden: middenVan(punten) })
    }
    if (klik) {
      const punten = drieVan(g, -1).flatMap((d) => [d.a, d.b, d.c])
      if (punten.length) ankers.push({ geo: g, soort: 'klik', mat: -1, punten, midden: middenVan(punten) })
    }
  }

  /* ---- 3. Kandidaten en de stemming ---- */
  const kandidaten = new Map<string, Kandidaat | null>()
  const kandidaat = (g: Geo, mat: number): Kandidaat | undefined => {
    const sleutel = `${g.mesh.cfgIndex}:${mat}`
    const bekend = kandidaten.get(sleutel)
    if (bekend !== undefined) return bekend ?? undefined
    const k = maakKandidaat(g, mat, invoer.gevonden)
    kandidaten.set(sleutel, k ?? null)
    return k
  }
  /** Kandidaten waarvan de doos (+2 cm) het punt bevat. */
  const kandidatenBij = (q: Punt, marge = 0.02): Kandidaat[] => {
    const uit: Kandidaat[] = []
    for (const g of alle) {
      if (g.info.versleuteld || g.mesh.schaduw || !binnenDoos(g, q, marge)) continue
      const aantal = g.info.materialen.length
      for (let mat = 0; mat < aantal; mat++) {
        const k = kandidaat(g, mat)
        if (k && binnenDoos(k, q, marge)) uit.push(k)
      }
    }
    return uit
  }
  /* De doos om alle ankers, met 3 cm speling: daarbuiten hoeft niets geraakt te worden. */
  const ankerDoos = ankers.length ? dozeVan(ankers.flatMap((a) => a.punten)) : undefined
  const gebied = ankerDoos
    ? { lo: min(ankerDoos.lo, [0.03, 0.03, 0.03]), hi: plus(ankerDoos.hi, [0.03, 0.03, 0.03]) }
    : undefined
  const roosterVan = (k: Kandidaat): Rooster => (k.rooster ??= new Rooster(k.drie, 0.016, gebied))

  /*
   * Eerst stemmen alleen de tekstvakken: die maken het scherm. De toetsen van
   * een AFR 200 liggen op dezelfde textuur als zijn display, maar op een ander
   * vlak, en met vijfentwintig toetsen tegen vijf tekstvakken won anders het
   * toetsenbord. Pas als geen enkel tekstvak ergens op ligt -- de Atron van de
   * MB C2 heeft alleen een scripttextuur en knoppen -- stemmen de klikvlakken.
   */
  const stemmen = new Map<Kandidaat, { tel: number; zaad: Map<number, number> }>()
  /*
   * Een klikvlak (elke mesh met een [mouseevent]) is nooit de achtergrond van
   * een ander anker. De knoppen van de Atron zijn zelf getextureerde tegels, per
   * menu op dezelfde plek; zonder deze regel stemden ze op elkaar in plaats van
   * op atron_background eronder. Alleen als er dan niets overblijft (een scherm
   * dat zelf aanklikbaar is) mogen ze.
   */
  const klikGeos = new Set(alle.filter((g) => g.mesh.klikken.length > 0))
  let zonderKlikvlakken = true
  const stemrondes: Anker[][] = [ankers.filter((a) => a.soort === 'tekst'), ankers.filter((a) => a.soort === 'klik')]
  for (const ronde of stemrondes) {
    for (const vrij of [false, true]) {
      if (stemmen.size > 0) break
      zonderKlikvlakken = !vrij
      for (const a of ronde) stemVoor(a)
    }
  }
  function stemVoor(a: Anker): void {
    const onder: { k: Kandidaat; d: number; zaad: Set<number> }[] = []
    for (const k of kandidatenBij(a.midden)) {
      if (a.soort === 'klik' && k.geo === a.geo) continue
      if (zonderKlikvlakken && klikGeos.has(k.geo)) continue
      if (a.soort === 'tekst' && k.geo === a.geo && k.mat === a.mat) continue
      const rooster = roosterVan(k)
      const zaad = new Set<number>()
      const ds: number[] = []
      for (const p of a.punten) {
        const r = raak(rooster, p, 0.015)
        if (r && r.d >= -0.0005) {
          ds.push(r.d)
          zaad.add(r.drie)
        }
      }
      const m = raak(rooster, a.midden, 0.015)
      const middenRaak = m && m.d >= -0.0005
      if (middenRaak) zaad.add(m.drie)
      if (!middenRaak && ds.length < a.punten.length * 0.5) continue
      const d = middenRaak ? m.d : ds.reduce((x, y) => x + y, 0) / ds.length
      onder.push({ k, d, zaad })
    }
    if (onder.length === 0) return
    const dmin = Math.min(...onder.map((o) => o.d))
    for (const o of onder) {
      if (o.d > dmin + 0.0005) continue
      const s = stemmen.get(o.k) ?? { tel: 0, zaad: new Map<number, number>() }
      s.tel++
      /* Per driehoek hoeveel ankers erop liggen: daarmee kiest `stukVan` zijn vlak. */
      for (const z of o.zaad) s.zaad.set(z, (s.zaad.get(z) ?? 0) + 1)
      stemmen.set(o.k, s)
    }
  }

  let K: Kandidaat | undefined
  let zaad = new Map<number, number>()
  for (const [k, s] of stemmen) {
    if (
      !K ||
      s.tel > stemmen.get(K)!.tel ||
      (s.tel === stemmen.get(K)!.tel &&
        (k.geo.mesh.cfgIndex < K.geo.mesh.cfgIndex || (k.geo === K.geo && k.mat < K.mat)))
    ) {
      K = k
      zaad = s.zaad
    }
  }

  const analyse: Analyse = {
    cfg,
    geos: alle,
    achtergronden: [],
    lagen: [],
    teksten: [],
    klikken: [],
    los: [],
    onvolledig,
    ontbrekend
  }

  /* ---- 4. Het stuk, het vlak en de achtergrondset ---- */
  let vlak: Vlak | undefined
  let stuk: Drie[] = []
  if (K) {
    stuk = stukVan(K.drie, zaad)
    vlak = vlakVan(stuk)
  }
  if (!vlak) {
    /*
     * Geen achtergrond: dan het vlak van de tekstvakken zelf, zoals bij een
     * tekst-lcd zonder plaatje eronder.
     */
    const tekstDrie = ankers
      .filter((a) => a.soort === 'tekst')
      .flatMap((a) => drieVan(a.geo, a.mat))
    vlak = tekstDrie.length ? vlakVan(tekstDrie) : undefined
    if (vlak) onvolledig.push('geen achtergrond: het vlak komt uit de tekstvakken')
  }
  if (!vlak) return analyse
  analyse.vlak = vlak
  const V = vlak
  const afstand = (p: Punt): number => punt(min(p, V.o), V.n)
  const st = (p: Punt): [number, number] => {
    const w = min(p, V.o)
    return [punt(w, V.rechts), punt(w, V.omhoog)]
  }
  const binnenZicht = (p: Punt, speling: number): boolean => {
    const [s, t] = st(p)
    const bs = (V.s1 - V.s0) * speling
    const bt = (V.t1 - V.t0) * speling
    return s >= V.s0 - bs && s <= V.s1 + bs && t >= V.t0 - bt && t <= V.t1 + bt
  }
  const voor = (d: Drie): boolean => punt(d.n, V.n) > 0

  if (K) {
    analyse.basis = K.geo
    const stukRooster = new Rooster(stuk, 0.016)
    const stukPunten = stuk.flatMap((d) => [d.a, d.b, d.c])
    const { lo: sLo, hi: sHi } = dozeVan(stukPunten)
    const leden: { k: Kandidaat; drie: Drie[] }[] = [{ k: K, drie: stuk.filter(voor) }]
    const lagen: { k: Kandidaat; drie: Drie[] }[] = []
    const kNaam = K.naam.toLowerCase()
    for (const g of alle) {
      if (g.info.versleuteld || g.mesh.schaduw) continue
      if (!overlapt(g, sLo, sHi, 0.02)) continue
      const aantal = g.info.materialen.length
      for (let mat = 0; mat < aantal; mat++) {
        if (g === K.geo && mat === K.mat) continue
        const k = kandidaat(g, mat)
        if (!k) continue
        /* Dezelfde voetafdruk, over en weer binnen 1 mm: een ander menu van hetzelfde scherm. */
        const zelfde =
          k.drie.every((d) => [d.a, d.b, d.c].every((p) => Math.abs(raak(stukRooster, p, 0.001)?.d ?? 1) < 0.001)) &&
          stukPunten.every((p) => Math.abs(raakLos(k.drie, p, 0.001)?.d ?? 1) < 0.001)
        if (zelfde) {
          leden.push({ k, drie: k.drie.filter(voor) })
          continue
        }
        /* Zelfde textuur in hetzelfde vlak (de LAWO: Body_01 en Body_02). */
        if (k.naam.toLowerCase() === kNaam) {
          const vlakke = k.drie.filter(
            (d) =>
              punt(d.n, V.n) > Math.cos((3 * Math.PI) / 180) &&
              [d.a, d.b, d.c].every((p) => Math.abs(afstand(p)) < 0.001) &&
              binnenZicht(middenVan([d.a, d.b, d.c]), 0)
          )
          if (vlakke.length > 0) {
            leden.push({ k, drie: vlakke })
            continue
          }
        }
        /* Een laag: alle hoekpunten op het stuk, van 0,5 mm erachter tot 15 mm ervoor. */
        const laag = k.drie.every((d) =>
          [d.a, d.b, d.c].every((p) => {
            const r = raak(stukRooster, p, 0.015)
            return r !== undefined && r.d >= -0.0005
          })
        )
        if (laag) {
          const drie = k.drie.filter(voor)
          if (drie.length) lagen.push({ k, drie })
        }
      }
    }
    /* Ook textuurloze vlakken en scriptlagen, die geen kandidaat kunnen zijn. */
    for (const g of alle) {
      if (g.info.versleuteld || g.mesh.schaduw || !overlapt(g, sLo, sHi, 0.02)) continue
      const aantal = g.info.materialen.length
      for (let mat = 0; mat < aantal; mat++) {
        if (kandidaat(g, mat)) continue
        const soort = bijsoortVan(g, mat, invoer.gevonden)
        if (!soort) continue
        const drie = drieVan(g, mat)
        if (!drie.length) continue
        const laag = drie.every((d) =>
          [d.a, d.b, d.c].every((p) => {
            const r = raak(stukRooster, p, 0.015)
            return r !== undefined && r.d >= -0.0005
          })
        )
        const voorkant = drie.filter(voor)
        if (!laag || !voorkant.length) continue
        if (soort.soort === 'weg') {
          onvolledig.push(`textuur ontbreekt: ${soort.naam} (laag ${g.mesh.pad})`)
          continue
        }
        lagen.push({ k: { geo: g, mat, ctx: g.contexten[mat], naam: soort.naam, drie, ...dozeVan([]) }, drie: voorkant })
      }
    }
    /*
     * Wat met dezelfde voetafdruk duidelijk VOOR het stuk ligt, is een laag en
     * geen achtergrond: het glas van het NLC-display (Dash_Display_Glas, 0,7 mm
     * ervoor, zonder [visible]) werd anders de basis en als eerste getekend,
     * onder de displaybeelden in plaats van erover.
     */
    for (const l of [...leden]) {
      if (l.k === K || l.drie.length === 0) continue
      const d = l.drie.flatMap((x) => [x.a, x.b, x.c]).reduce((som, p) => som + afstand(p), 0) / (l.drie.length * 3)
      if (d > 0.0002) {
        leden.splice(leden.indexOf(l), 1)
        lagen.push(l)
      }
    }
    /* De basis: het lid zonder [visible], anders het eerste in de cfg. */
    leden.sort((a, b) => a.k.geo.mesh.cfgIndex - b.k.geo.mesh.cfgIndex || a.k.mat - b.k.mat)
    const zonder = leden.find((l) => l.k.geo.mesh.zicht.length === 0)
    if (zonder) leden.splice(leden.indexOf(zonder), 1), leden.unshift(zonder)
    analyse.basis = leden[0].k.geo
    analyse.achtergronden = leden.filter((l) => l.drie.length > 0)
    analyse.lagen = lagen
  }

  /* ---- 5. Ontwarren: versleutelde tekst- en klikmeshes op het vlak leggen ---- */
  const achtergrondRooster = K
    ? new Rooster(analyse.achtergronden.flatMap((l) => l.drie).concat(stuk), 0.006)
    : undefined
  const ontwarren = (g: Geo): (Punt | undefined)[] | undefined => {
    const model = modelVan(g.info)
    if (!model) return undefined
    const aantal = model.vertices.length / 3
    const pos: (Punt | undefined)[] = []
    let raakt = 0
    const draaipunt: Punt | undefined = model.transform
      ? [model.transform[12], model.transform[13], model.transform[14]]
      : undefined
    const draaipuntBruikbaar =
      draaipunt !== undefined &&
      lengte(draaipunt) > 0.001 &&
      lengte(min(draaipunt, [0, 0.1, 0])) > 0.001
    for (let i = 0; i < aantal; i++) {
      const v: Punt = [model.vertices[i * 3], model.vertices[i * 3 + 1], model.vertices[i * 3 + 2]]
      let beste: { p: Punt; d: number } | undefined
      if (achtergrondRooster) {
        for (const perm of PERMS) {
          const q = pas(g.wereld, [v[perm[0]], v[perm[1]], v[perm[2]]])
          const r = raak(achtergrondRooster, q, 0.005)
          if (r && (!beste || Math.abs(r.d) < beste.d)) beste = { p: q, d: Math.abs(r.d) }
        }
      } else {
        /* Geen leesbaar vlak: zonder stuk gaat het met het vlak zelf. */
        for (const perm of PERMS) {
          const q = pas(g.wereld, [v[perm[0]], v[perm[1]], v[perm[2]]])
          const d = Math.abs(afstand(q))
          if (d <= 0.005 && binnenZicht(q, 0.02) && (!beste || d < beste.d)) beste = { p: q, d }
        }
      }
      if (!beste && draaipuntBruikbaar) {
        const ds = PERMS.map((perm) => ({
          perm,
          d: lengte(min([v[perm[0]], v[perm[1]], v[perm[2]]], draaipunt!))
        })).sort((a, b) => a.d - b.d)
        if (ds[1].d - ds[0].d > 0.05) {
          const perm = ds[0].perm
          beste = { p: pas(g.wereld, [v[perm[0]], v[perm[1]], v[perm[2]]]), d: 0 }
        }
      }
      pos.push(beste?.p)
      if (beste) raakt++
    }
    /* Een mesh die voor minder dan driekwart op het vlak valt, hoort er niet bij. */
    return raakt >= aantal * 0.75 ? pos : undefined
  }

  /* ---- 6. Teksten: elk tekstmateriaal van de cfg dat op het vlak ligt ---- */
  const bijVlak = (p: Punt): boolean => {
    const d = afstand(p)
    return d >= -0.001 && d <= 0.015
  }
  const ontward = new Map<Geo, (Punt | undefined)[] | null>()
  const posVan = (g: Geo): (Punt | undefined)[] | undefined => {
    if (!g.info.versleuteld) return wereldPos(g)
    if (!ontward.has(g)) ontward.set(g, ontwarren(g) ?? null)
    return ontward.get(g) ?? undefined
  }
  const eigenAnker = (g: Geo): boolean => eigen.has(normPad(g.mesh.pad))
  for (const g of alle) {
    const tekstMats = g.contexten.map((c, k) => (c?.tekst !== undefined ? k : -1)).filter((k) => k >= 0)
    if (tekstMats.length === 0) continue
    if (!g.info.versleuteld && !binnenDoos(g, V.o, 1.0)) continue
    const pos = posVan(g)
    if (!pos) {
      if (g.info.versleuteld && eigenAnker(g)) onvolledig.push(`versleuteld, niet op het vlak te leggen: ${g.mesh.pad}`)
      continue
    }
    for (const mat of tekstMats) {
      const alle3 = drieVan(g, mat, pos)
      if (!alle3.length) continue
      const punten = alle3.flatMap((d) => [d.a, d.b, d.c])
      const m = middenVan(punten)
      if (!punten.every(bijVlak) || !binnenZicht(m, 0.02)) {
        if (eigenAnker(g) && !g.info.versleuteld) {
          onvolledig.push(`tekstvak naast het vlak: ${g.mesh.pad} (${(afstand(m) * 1000).toFixed(1)} mm)`)
        }
        continue
      }
      const drie = alle3.filter(voor)
      if (!drie.length && !g.info.versleuteld) continue
      analyse.teksten.push({
        geo: g,
        mat,
        ctx: g.contexten[mat]!,
        /* Bij een versleutelde mesh zegt de winding niets: alles telt. */
        drie: g.info.versleuteld ? alle3 : drie,
        benaderd: g.info.versleuteld
      })
    }
  }

  /* ---- 7. Klikken: elke [mouseevent]-regel op het vlak, hoe hij ook kijkt ---- */
  for (const g of alle) {
    if (g.mesh.klikken.length === 0) continue
    if (!g.info.versleuteld && !binnenDoos(g, V.o, 1.0)) continue
    const pos = posVan(g)
    if (!pos) {
      if (g.info.versleuteld && eigenAnker(g)) onvolledig.push(`versleuteld, niet op het vlak te leggen: ${g.mesh.pad}`)
      continue
    }
    const punten = drieVan(g, -1, pos).flatMap((d) => [d.a, d.b, d.c])
    if (!punten.length) continue
    const ds = punten.map(afstand)
    const gemiddeld = ds.reduce((a, b) => a + b, 0) / ds.length
    const ver = ds.reduce((m, d) => Math.max(m, Math.abs(d)), 0)
    if (Math.abs(gemiddeld) > 0.005 || ver > 0.01 || !binnenZicht(middenVan(punten), 0.02)) {
      /*
       * Niet op het scherm, maar wel met een plek: onthouden hoe ver ervan af.
       * Daarmee kan het paneel onderscheiden tussen een toets NAAST het scherm
       * (het cijferblok van een RG-kastje) en iets dat er los van zit (de
       * grendel en het wisselgeld die bij de ALMEX in de groep vallen).
       */
      const [s, t] = st(middenVan(punten))
      const buitenS = Math.max(V.s0 - s, 0, s - V.s1)
      const buitenT = Math.max(V.t0 - t, 0, t - V.t1)
      analyse.los.push({
        acties: [...new Set(g.mesh.klikken)],
        vlakMm: Math.round(Math.abs(gemiddeld) * 1000),
        randMm: Math.round(Math.hypot(buitenS, buitenT) * 1000)
      })
      continue
    }
    analyse.klikken.push({ geo: g, punten })
  }
  const ontwardeKlikken = analyse.klikken.filter((k) => k.geo.info.versleuteld).map((k) => k.geo.mesh.pad.trim())
  if (ontwardeKlikken.length) {
    onvolledig.push(
      `versleuteld, ontward op het vlak: ${ontwardeKlikken.length} klikvlakken (${ontwardeKlikken.slice(0, 3).join(', ')}${ontwardeKlikken.length > 3 ? ', ...' : ''})`
    )
  }

  /*
   * ---- 8. Waar een ontbrekende waarde de plek bepaalde ----
   * Alleen de animaties die NIET gedeeld worden met de achtergrond tellen; wat
   * alles samen verschuift (de bestuurdersdeur waar de ALMEX aan hangt) valt weg.
   * Bij wat op het scherm ligt tellen beide kanten; bij een anker dat er niet op
   * ligt alleen wat de achtergrond verschuift -- zo lagen de zes regels van menu
   * 26 zonder trans_dauer 1,3 m naast het scherm.
   */
  const basisKeten = analyse.basis?.keten ?? []
  const perVar = new Map<string, Set<string>>()
  const uitScript = new Map<string, Set<string>>()
  const noteer = (anims: Iterable<CfgAnim>, g: Geo): void => {
    for (const anim of anims) {
      for (const naam of [anim.schuif?.variabele, anim.draai?.variabele]) {
        if (!naam || live.heeft(naam)) continue
        const tabel = script.heeft(naam) ? uitScript : perVar
        const lijst = tabel.get(naam) ?? new Set<string>()
        lijst.add(g.mesh.pad.trim())
        tabel.set(naam, lijst)
      }
    }
  }
  const eigenKeten = (g: Geo): CfgAnim[] => ketenVerschil(g.keten, basisKeten)
  const basisAlleen = (g: Geo): CfgAnim[] => ketenVerschil(basisKeten, g.keten)
  const geplaatst = new Set<Geo>([
    ...analyse.teksten.map((t) => t.geo),
    ...analyse.klikken.map((k) => k.geo),
    ...analyse.lagen.map((l) => l.k.geo)
  ])
  for (const g of geplaatst) {
    noteer(eigenKeten(g), g)
    noteer(basisAlleen(g), g)
  }
  for (const g of [...ankers.map((a) => a.geo), ...versleuteldeAnkers]) {
    if (!geplaatst.has(g)) noteer(basisAlleen(g), g)
  }
  const opsomming = (meshes: Set<string>): string => {
    const lijst = [...meshes]
    return `${lijst.slice(0, 3).join(', ')}${lijst.length > 3 ? ` en ${lijst.length - 3} meer` : ''}`
  }
  for (const [naam, meshes] of perVar) {
    ontbrekend.add(naam)
    onvolledig.push(`plek onzeker, ${naam} ontbreekt (als 0 gerekend): ${opsomming(meshes)}`)
  }
  for (const [naam, meshes] of uitScript) {
    onvolledig.push(`plek volgens de startwaarde uit het script, ${naam} = ${script.waarde(naam)}: ${opsomming(meshes)}`)
  }

  return analyse
}

/**
 * Wat in keten `a` zit en niet in keten `b`. Op inhoud, niet op object: elk
 * ALMEX-onderdeel heeft zijn eigen drie [newanim]'s met trans_dauer, en die zijn
 * voor het scherm en een tekstvak gelijk.
 */
function ketenVerschil(a: CfgAnim[], b: CfgAnim[]): CfgAnim[] {
  const teken = (x: CfgAnim): string =>
    JSON.stringify([x.draai ? x.oorsprong : 0, x.draaiingen, x.schuif ?? 0, x.draai ?? 0])
  const over = new Map<string, number>()
  for (const x of b) over.set(teken(x), (over.get(teken(x)) ?? 0) + 1)
  return a.filter((x) => {
    const n = over.get(teken(x)) ?? 0
    if (n === 0) return true
    over.set(teken(x), n - 1)
    return false
  })
}

/** Het zwaartepunt van een rij punten. */
function middenVan(punten: Punt[]): Punt {
  const s: Punt = [0, 0, 0]
  for (const p of punten) {
    s[0] += p[0]
    s[1] += p[1]
    s[2] += p[2]
  }
  const n = Math.max(1, punten.length)
  return [s[0] / n, s[1] / n, s[2] / n]
}

function overlapt(g: Geo, lo: Punt, hi: Punt, marge: number): boolean {
  for (let j = 0; j < 3; j++) if (g.hi[j] < lo[j] - marge || g.lo[j] > hi[j] + marge) return false
  return true
}

/**
 * De naam van de textuur die een materiaal toont zonder live waarden: de
 * standaard van [matl_freetex], anders de naam uit de o3d.
 */
function textuurnaamVan(g: Geo, mat: number): string {
  const ctx = g.contexten[mat]
  return ctx?.freetex?.standaard || g.info.materialen[mat]?.textuur.trim() || ''
}

/** De diffuse kleur: uit [matl_allcolor] als die er is, anders uit de o3d. */
function kleurVan(g: Geo, mat: number): [number, number, number, number] {
  const ctx = g.contexten[mat]
  if (ctx?.allcolor) return [ctx.allcolor[0], ctx.allcolor[1], ctx.allcolor[2], ctx.allcolor[3]]
  const d = g.info.materialen[mat]?.diffuus ?? [1, 1, 1, 1]
  return [d[0], d[1], d[2], d[3]]
}

/**
 * Of een materiaal achtergrond of laag kan zijn (§3 en §4 van de specificatie,
 * zonder de culling en zonder [visible]).
 */
function maakKandidaat(
  g: Geo,
  mat: number,
  gevonden: (naam: string, ctx?: CfgMateriaal) => boolean
): Kandidaat | undefined {
  if (!g.info.geldig || g.info.versleuteld || g.mesh.schaduw) return undefined
  const ctx = g.contexten[mat]
  if (ctx?.tekst !== undefined) return undefined
  if (ctx?.transmap?.startsWith('\\S:')) return undefined
  const naam = textuurnaamVan(g, mat)
  if (!naam || ONZICHTBAAR.test(naam) || naam.startsWith('\\S:')) return undefined
  /* De alfaregel, alleen bij [matl_alpha] >= 1: de NLC-knoppen hebben diffuus-alfa 0. */
  if ((ctx?.alfa ?? 0) >= 1 && kleurVan(g, mat)[3] <= 0.01) return undefined
  if (!ctx?.freetex && !gevonden(naam, ctx)) return undefined
  const drie = drieVan(g, mat)
  if (!drie.length) return undefined
  return { geo: g, mat, ctx, naam, drie, ...dozeVan(drie.flatMap((d) => [d.a, d.b, d.c])) }
}

/**
 * Wat geen kandidaat is maar wel op het scherm getekend wordt: een vlak zonder
 * textuur (in zijn kleur) en een scripttextuur (niet na te tekenen).
 */
function bijsoortVan(
  g: Geo,
  mat: number,
  gevonden: (naam: string, ctx?: CfgMateriaal) => boolean
): { soort: 'kleur' | 'script' | 'weg'; naam: string } | undefined {
  if (!g.info.geldig || g.info.versleuteld) return undefined
  const ctx = g.contexten[mat]
  if (ctx?.tekst !== undefined) return undefined
  const naam = textuurnaamVan(g, mat)
  if (ctx?.transmap?.startsWith('\\S:') || naam.startsWith('\\S:')) {
    return { soort: 'script', naam: ctx?.transmap?.startsWith('\\S:') ? ctx.transmap : naam }
  }
  if ((ctx?.alfa ?? 0) >= 1 && kleurVan(g, mat)[3] <= 0.01) return undefined
  if (ONZICHTBAAR.test(naam)) return undefined
  if (!naam) return { soort: 'kleur', naam: '' }
  /* Een textuur die nergens te vinden is: niet tekenen, wel melden. */
  if (!ctx?.freetex && !gevonden(naam, ctx)) return { soort: 'weg', naam }
  return undefined
}

/**
 * Het vlakke, samenhangende stuk van een oppervlak rond de geraakte driehoeken:
 * over gedeelde hoekpunten, met de normaal binnen 3 graden en elk hoekpunt
 * binnen 1 mm van het vlak van het zaad. AFR 200: 5 van de 2517 driehoeken.
 */
function stukVan(drie: Drie[], gewichten: Map<number, number>): Drie[] {
  if (gewichten.size === 0) return []
  const cos3 = Math.cos((3 * Math.PI) / 180)
  const samenVlak = (a: Drie, b: Drie): boolean =>
    punt(a.n, b.n) >= cos3 && [b.a, b.b, b.c].every((p) => Math.abs(punt(min(p, a.a), a.n)) < 0.001)
  /*
   * De ankers kunnen op meer dan één vlak van hetzelfde materiaal liggen: van
   * de vijf tekstvakken van de AFR 200 ligt er één op een ander stuk van de
   * textuur. Het vlak met de meeste ankers wint, en alleen daarvandaan wordt
   * er gevuld.
   */
  let beste = -1
  let besteGewicht = -1
  for (const [k] of gewichten) {
    let som = 0
    for (const [k2, w] of gewichten) if (samenVlak(drie[k], drie[k2])) som += w
    if (som > besteGewicht) {
      beste = k
      besteGewicht = som
    }
  }
  const zaad = [...gewichten.keys()].filter((k) => samenVlak(drie[beste], drie[k]))
  let nz: Punt = [0, 0, 0]
  for (const k of zaad) nz = plus(nz, maal(drie[k].n, drie[k].opp))
  const N = eenheid(nz)
  const A0 = drie[beste].a
  const sleutel = (p: Punt): string => `${Math.round(p[0] * 2000)},${Math.round(p[1] * 2000)},${Math.round(p[2] * 2000)}`
  const perPunt = new Map<string, number[]>()
  drie.forEach((d, k) => {
    for (const p of [d.a, d.b, d.c]) {
      const s = sleutel(p)
      const lijst = perPunt.get(s)
      if (lijst) lijst.push(k)
      else perPunt.set(s, [k])
    }
  })
  const past = (d: Drie): boolean =>
    punt(d.n, N) >= cos3 && [d.a, d.b, d.c].every((p) => Math.abs(punt(min(p, A0), N)) < 0.001)
  const in_ = new Set<number>(zaad.filter((k) => past(drie[k])))
  const rij = [...in_]
  while (rij.length) {
    const k = rij.pop()!
    for (const p of [drie[k].a, drie[k].b, drie[k].c]) {
      for (const k2 of perPunt.get(sleutel(p)) ?? []) {
        if (in_.has(k2) || !past(drie[k2])) continue
        in_.add(k2)
        rij.push(k2)
      }
    }
  }
  return [...in_].sort((a, b) => a - b).map((k) => drie[k])
}

/**
 * Het vlak van een stuk: de oppervlaktegewogen windingnormaal, 'omhoog' = o3d +y
 * op het vlak geprojecteerd (bij een plat vlak o3d +z, vooruit), 'rechts' gezien
 * van de voorkant, en de rechthoek eromheen.
 */
function vlakVan(drie: Drie[]): Vlak | undefined {
  if (drie.length === 0) return undefined
  let nz: Punt = [0, 0, 0]
  let o: Punt = [0, 0, 0]
  let opp = 0
  for (const d of drie) {
    nz = plus(nz, maal(d.n, d.opp))
    o = plus(o, maal(middenVan([d.a, d.b, d.c]), d.opp))
    opp += d.opp
  }
  const n = eenheid(nz)
  if (lengte(n) < 0.5 || opp <= 0) return undefined
  o = maal(o, 1 / opp)
  let omhoog = min([0, 1, 0], maal(n, n[1]))
  if (lengte(omhoog) < 0.3) omhoog = min([0, 0, 1], maal(n, n[2]))
  omhoog = eenheid(omhoog)
  const rechts = eenheid(kruis(n, omhoog))
  let s0 = Infinity
  let s1 = -Infinity
  let t0 = Infinity
  let t1 = -Infinity
  for (const d of drie)
    for (const p of [d.a, d.b, d.c]) {
      const w = min(p, o)
      const s = punt(w, rechts)
      const t = punt(w, omhoog)
      s0 = Math.min(s0, s)
      s1 = Math.max(s1, s)
      t0 = Math.min(t0, t)
      t1 = Math.max(t1, t)
    }
  if (!(s1 - s0 > 1e-4) || !(t1 - t0 > 1e-4)) return undefined
  return { o, n, rechts, omhoog, s0, s1, t0, t1 }
}

/* ------------------------------------------------------------ de uitgangen */

const scriptGeheugen = new Map<string, Map<string, number>>()

/**
 * Startwaarden van getalvariabelen zoals de scripts van de bus ze zetten -- een
 * TERUGVAL voor als de plugin een animatievariabele (nog) niet levert; de live
 * waarde gaat altijd voor.
 *
 * OMSI-scripts zetten een waarde met `<getal> (S.L.<naam>)`, en ketenen dat:
 * `1 (S.L.cp_lenkrad_visible) (S.L.mt_ruhezeit) (S.L.trans_dauer)` in
 * {macro:cockpit_init} van de HH20 (21_cockpit_C2.osc:1497), die {init} van
 * C2E_Main.osc aanroept. Zonder trans_dauer = 1 liggen de zes regels van
 * ALMEX-menu 26 naast het scherm.
 *
 * ALLEEN WAT BIJ HET STARTEN GEBEURT
 * Eerst stond hier 'de eerste toekenning ergens in een .osc'. Dat gaf bij de
 * HH20 vdv_move_x = -1 en vdv_move_y = -1: de grens in {trigger:vdv_move}
 * (21_cockpit_C2.osc:557), terwijl cockpit_init -0,22 en 0,40 zet (regel 1498)
 * -- 7 in plaats van 1,5 graad kanteling voor het dashboard waar in de HH20 53
 * tekst- en klikmeshes aan hangen. Nu wordt het uitgevoerd zoals OMSI het doet:
 * de {init}-blokken van de scripts van de bus, in de volgorde van [script] in
 * het .bus-bestand, met elke (M.L.macro) die ze aanroepen. Daarna {frame}: wat
 * daar ONvoorwaardelijk gezet wordt, staat er vanaf het eerste beeld.
 *
 * Voorrang: onvoorwaardelijk in {frame} (de laatste), dan onvoorwaardelijk in
 * {init} (de laatste), dan binnen een {if} in {init} (de eerste). Triggers
 * (knoppen, muis) tellen niet: die gebeuren pas als de speler iets doet.
 */
export function startwaardenVan(modelcfg: string, namen: string[]): Record<string, number> {
  const sleutel = resolve(modelcfg).toLowerCase()
  let alle = scriptGeheugen.get(sleutel)
  if (!alle) {
    alle = leesStartwaarden(scriptsVan(modelcfg))
    if (scriptGeheugen.size >= 64) scriptGeheugen.clear()
    scriptGeheugen.set(sleutel, alle)
  }
  const uit: Record<string, number> = {}
  for (const naam of namen) {
    const w = alle.get(naam.toLowerCase())
    if (w !== undefined) uit[naam] = w
  }
  return uit
}

/** Zoals NTFS een map opsomt: op hoofdletters. */
const opNaam = (a: string, b: string): number => {
  const x = a.toUpperCase()
  const y = b.toUpperCase()
  return x < y ? -1 : x > y ? 1 : 0
}

/**
 * De scripts van de bus bij deze model.cfg: de [script]-lijst van het eerste
 * .bus-bestand in de voertuigmap waarvan [model] naar deze cfg wijst. De HH20
 * (HHEBus2021_main.bus) heeft er 25, te beginnen met C2E_Main.osc; in dezelfde
 * map staan ook de scripts van de drie-deurs (3T_cockpit_C2.osc) en van de
 * AI-bus, en die horen er niet bij. Geen .bus gevonden: alle .osc onder
 * `Script\`, op naam.
 */
/**
 * Naar welke namen de scripts van deze bus luisteren: elk `{trigger:naam}`, in
 * kleine letters.
 *
 * Nodig om een toets te mogen DELEN met een knop van een andere bus (zie
 * zetBustoetsen in core/bustoetsen.ts): dat mag alleen als deze bus niet naar
 * die andere naam luistert, anders gaan er bij één druk twee dingen af.
 */
export function triggersVan(modelcfg: string): Set<string> {
  const uit = new Set<string>()
  for (const pad of scriptsVan(modelcfg)) {
    let tekst: string
    try {
      tekst = readFileSync(pad, 'latin1')
    } catch {
      continue
    }
    for (const m of tekst.matchAll(/\{trigger:([^}\r\n]+)\}/gi)) uit.add(m[1].trim().toLowerCase())
  }
  return uit
}

function scriptsVan(modelcfg: string): string[] {
  const map = voertuigmapVan(modelcfg)
  const doel = resolve(modelcfg).toLowerCase()
  const pad = (rel: string): string => join(map, ...rel.split(/[\\/]+/).filter(Boolean))
  let bussen: string[] = []
  try {
    bussen = readdirSync(map).filter((naam) => /\.bus$/i.test(naam)).sort(opNaam)
  } catch {
    bussen = []
  }
  for (const bus of bussen) {
    let regels: string[]
    try {
      regels = cfgRegels(join(map, bus))
    } catch {
      continue
    }
    const model = regels.indexOf('[model]')
    if (model < 0 || resolve(pad((regels[model + 1] ?? '').trim())).toLowerCase() !== doel) continue
    const uit: string[] = []
    regels.forEach((regel, i) => {
      if (regel !== '[script]') return
      const aantal = Number.parseInt((regels[i + 1] ?? '').trim(), 10)
      for (let k = 0; k < (Number.isFinite(aantal) ? Math.min(aantal, 1000) : 0); k++) {
        const rel = (regels[i + 2 + k] ?? '').trim()
        if (rel) uit.push(pad(rel))
      }
    })
    if (uit.length > 0) return uit
  }
  const uit: string[] = []
  const loop = (hier: string, diepte: number): void => {
    if (diepte > 3) return
    let inhoud: string[]
    try {
      inhoud = readdirSync(hier).sort(opNaam)
    } catch {
      return
    }
    for (const naam of inhoud) {
      const vol = join(hier, naam)
      if (/\.osc$/i.test(naam)) uit.push(vol)
      else if (!/\.[a-z0-9]{1,4}$/i.test(naam)) loop(vol, diepte + 1)
    }
  }
  loop(join(map, 'Script'), 0)
  return uit
}

/** Een blok uit een .osc: {init}, {frame}, {macro:naam} of iets anders, met zijn woorden. */
interface Scriptblok {
  soort: 'init' | 'frame' | 'macro' | 'anders'
  naam: string
  woorden: string[]
}

function scriptblokken(bestand: string): Scriptblok[] {
  let regels: string[]
  try {
    regels = cfgRegels(bestand)
  } catch {
    return []
  }
  const uit: Scriptblok[] = []
  let blok: Scriptblok | undefined
  for (const regel of regels) {
    /* Commentaar begint met een apostrof; een tekst als $"..." met een ' erin is voor getallen niet van belang. */
    const woorden = regel.replace(/'.*$/, '').trim().split(/\s+/).filter(Boolean)
    if (woorden.length === 0) continue
    const eerste = woorden[0].toLowerCase()
    if (eerste === '{end}') {
      blok = undefined
      continue
    }
    const kop = /^\{(init|frame|macro:([^}]*)|[^}]*)\}$/.exec(eerste)
    if (kop && eerste !== '{if}' && eerste !== '{else}' && eerste !== '{endif}') {
      const soort = kop[1] === 'init' ? 'init' : kop[1] === 'frame' ? 'frame' : kop[2] !== undefined ? 'macro' : 'anders'
      blok = { soort, naam: (kop[2] ?? '').trim(), woorden: woorden.slice(1) }
      uit.push(blok)
      continue
    }
    blok?.woorden.push(...woorden)
  }
  return uit
}

/**
 * Zie `startwaardenVan`: de scripts uitvoeren voor zover het letterlijke getallen zijn.
 *
 * Een macro wordt één keer doorgelopen en daarna als samenvatting toegepast
 * (per variabele de laatste onvoorwaardelijke en de eerste voorwaardelijke
 * waarde). Elke aanroep opnieuw doorlopen liep bij de MB C2 uit de hand: de
 * macro's van de Atron roepen elkaar zo vaak aan dat het 6 s duurde; zo is het
 * een fractie daarvan.
 */
function leesStartwaarden(scripts: string[]): Map<string, number> {
  const blokken = scripts.flatMap(scriptblokken)
  const macros = new Map<string, string[]>()
  for (const b of blokken) if (b.soort === 'macro' && !macros.has(b.naam)) macros.set(b.naam, b.woorden)

  interface Effect {
    /** Buiten elke {if}: de laatste waarde telt. */
    vast: Map<string, number>
    /** Binnen een {if}: de eerste waarde telt. */
    voorwaardelijk: Map<string, number>
  }
  const samenvattingen = new Map<string, Effect>()
  const bezig = new Set<string>()
  const effectVan = (woorden: string[]): Effect => {
    const vast = new Map<string, number>()
    const voorwaardelijk = new Map<string, number>()
    const alsVoorwaarde = (naam: string, w: number): void => {
      if (!voorwaardelijk.has(naam)) voorwaardelijk.set(naam, w)
    }
    let diepte = 0
    let waarde: number | undefined
    for (const woord of woorden) {
      const klein = woord.toLowerCase()
      if (/^[-+]?(\d+\.?\d*|\.\d+)$/.test(woord)) {
        waarde = Number(woord)
        continue
      }
      const opslaan = /^\(s\.l\.([^)]+)\)$/.exec(klein)
      if (opslaan) {
        /* `1 (S.L.a) (S.L.b)`: opslaan laat het getal op de stapel staan. */
        if (waarde === undefined) continue
        if (diepte === 0) vast.set(opslaan[1], waarde)
        else alsVoorwaarde(opslaan[1], waarde)
        continue
      }
      waarde = undefined
      if (klein === '{if}') diepte++
      else if (klein === '{endif}') diepte = Math.max(0, diepte - 1)
      else {
        const macro = /^\(m\.l\.([^)]+)\)$/.exec(klein)
        const effect = macro ? macroEffect(macro[1]) : undefined
        if (!effect) continue
        if (diepte === 0) {
          for (const [naam, w] of effect.vast) vast.set(naam, w)
          for (const [naam, w] of effect.voorwaardelijk) alsVoorwaarde(naam, w)
        } else {
          for (const [naam, w] of effect.vast) alsVoorwaarde(naam, w)
          for (const [naam, w] of effect.voorwaardelijk) alsVoorwaarde(naam, w)
        }
      }
    }
    return { vast, voorwaardelijk }
  }
  const macroEffect = (naam: string): Effect | undefined => {
    const bekend = samenvattingen.get(naam)
    if (bekend) return bekend
    const woorden = macros.get(naam)
    /* Een macro die zichzelf (via een omweg) aanroept: die tweede keer telt niet. */
    if (!woorden || bezig.has(naam)) return undefined
    bezig.add(naam)
    const effect = effectVan(woorden)
    bezig.delete(naam)
    samenvattingen.set(naam, effect)
    return effect
  }

  const init = new Map<string, number>()
  const initVoorwaardelijk = new Map<string, number>()
  const frame = new Map<string, number>()
  for (const b of blokken) {
    if (b.soort !== 'init') continue
    const effect = effectVan(b.woorden)
    for (const [naam, w] of effect.vast) init.set(naam, w)
    for (const [naam, w] of effect.voorwaardelijk) if (!initVoorwaardelijk.has(naam)) initVoorwaardelijk.set(naam, w)
  }
  for (const b of blokken) {
    if (b.soort !== 'frame') continue
    for (const [naam, w] of effectVan(b.woorden).vast) frame.set(naam, w)
  }

  const uit = new Map(initVoorwaardelijk)
  for (const [naam, w] of init) uit.set(naam, w)
  for (const [naam, w] of frame) uit.set(naam, w)
  return uit
}

/**
 * Of een pad uit de kleurstelling mag: een plaatje binnen de installatie.
 *
 * Alles wat naar `bron` gaat, belandt in het register en is op id op te vragen
 * door de telefoon en de tablet. De zoeker van main sluit zijn vondsten op in de
 * voertuigmap en OMSI\Texture; de paden van core/kleurstelling.ts komen uit een
 * .cti (`join(ctc-map, rel)`, waar een '..' in `rel` gewoon doorheen gaat) en
 * gingen tot nu toe ongecontroleerd door. Zonder volledig pad van de installatie
 * geen kleurstelling.
 */
function veiligePlaatje(pad: string, omsiMap: string): boolean {
  if (!omsiMap || !isAbsolute(omsiMap) || !isAbsolute(pad)) return false
  const p = resolve(pad).toLowerCase()
  const m = resolve(omsiMap).toLowerCase()
  if (!p.startsWith(m.endsWith(sep) ? m : m + sep)) return false
  return ['.dds', '.tga', '.bmp', '.jpg', '.jpeg', '.png'].includes(extname(p))
}

/** `<OMSI>\Vehicles\<bus>` bij een model.cfg, waar die ook onder staat. */
function voertuigmapVan(modelcfg: string): string {
  let hier = dirname(modelcfg)
  for (let i = 0; i < 6; i++) {
    const boven = dirname(hier)
    if (basename(boven).toLowerCase() === 'vehicles') return hier
    if (boven === hier) break
    hier = boven
  }
  return dirname(dirname(modelcfg))
}


/**
 * De [mesh]-regels waarvan de o3d bestaat, als bestandsnaam, in de volgorde van
 * OMSI. Plek k is mesh k in de vlaggen van de plugin (`Schermstand.z`).
 */
export function meshlijstVan(modelcfg: string): string[] {
  const cfg = leesSchermcfg(modelcfg)
  if (!cfg) return []
  return cfg.meshes.filter((m) => m.bestaat).map((m) => m.pad.trim().split(/[\\/]+/).pop() ?? m.pad.trim())
}

/**
 * Eén schrijfwijze per getalvariabele: de eerste in de cfg.
 *
 * OMSI zoekt variabelen hoofdletterongevoelig op, maar de plugin geeft ze terug
 * onder de naam ZOALS GEVRAAGD, en main zoekt ze in de stand letterlijk op. In 24
 * cfg's van de vloot staat dezelfde variabele in twee schrijfwijzen
 * (HOH_Iveco-Urbanway-18: `Actia_DISPLAY_ICO_BremseHalte` en `..._bremsehalte`;
 * de MAN NLC: `vis_Matrix` en `vis_matrix`). Namen `schermGetallenVan` en de vorm
 * elk de eerste die zíj tegenkwamen, dan vroeg main de ene schrijfwijze en zocht
 * de stand de andere -- en bleef dat onderdeel onzichtbaar.
 */
const schrijfwijzen = new WeakMap<ModelCfg, Map<string, string>>()
function schrijfwijzeVan(cfg: ModelCfg): (naam: string) => string {
  let kaart = schrijfwijzen.get(cfg)
  if (!kaart) {
    const nieuw = new Map<string, string>()
    const zet = (naam: string | undefined): void => {
      if (naam && !nieuw.has(naam.toLowerCase())) nieuw.set(naam.toLowerCase(), naam)
    }
    for (const m of cfg.meshes) {
      for (const z of m.zicht) zet(z.variabele)
      for (const mat of m.materialen) {
        zet(mat.variabele)
        for (const s of [mat, ...mat.items]) {
          zet(s.lightmap?.variabele)
          zet(s.texcoordX)
          zet(s.texcoordY)
        }
      }
      for (const anim of m.anims) {
        zet(anim.schuif?.variabele)
        zet(anim.draai?.variabele)
      }
    }
    schrijfwijzen.set(cfg, nieuw)
    kaart = nieuw
  }
  const vast = kaart
  return (naam) => vast.get(naam.toLowerCase()) ?? naam
}

/**
 * Alle getalvariabelen die de vorm nodig heeft; die vraagt main eerst aan de
 * plugin, en pas daarna wordt de vorm gebouwd.
 *
 * De [visible]'s, [matl_change]'s, [matl_lightmap]'s en [texcoordtrans]'s van
 * alles wat op het scherm kan liggen, de animatievariabelen van hun ketens
 * (trans_dauer bij de ALMEX), en de variabele van de kleurstelling. De analyse
 * draait hier met alle animaties op 0 en zonder texturen te zoeken; dat geeft
 * eerder te veel dan te weinig. Wat de vorm later toch nog mist, staat in
 * `onvolledig` en komt bij het volgende bouwen mee.
 */
export function schermGetallenVan(modelcfg: string, module: Busmodule): string[] {
  const analyse = analyseer({ modelcfg, module, getallen: {}, gevonden: () => true })
  if (!analyse) return []
  const kanon = schrijfwijzeVan(analyse.cfg)
  const namen: string[] = []
  const zet = (naam: string | undefined): void => {
    if (!naam) return
    const vast = kanon(naam)
    if (!namen.some((n) => n.toLowerCase() === vast.toLowerCase())) namen.push(vast)
  }
  const meshes = new Set<Geo>()
  const eigen = new Set([...module.vakken.map((v) => normPad(v.onderdeel)), ...module.knoppen.map((k) => normPad(k.onderdeel))])
  for (const g of analyse.geos) if (eigen.has(normPad(g.mesh.pad))) meshes.add(g)
  for (const a of analyse.achtergronden) meshes.add(a.k.geo)
  for (const l of analyse.lagen) meshes.add(l.k.geo)
  for (const t of analyse.teksten) meshes.add(t.geo)
  for (const k of analyse.klikken) meshes.add(k.geo)
  for (const g of meshes) {
    for (const z of g.mesh.zicht) zet(z.variabele)
    for (const m of g.mesh.materialen) {
      zet(m.variabele)
      for (const s of [m, ...m.items]) {
        zet(s.lightmap?.variabele)
        zet(s.texcoordX)
        zet(s.texcoordY)
      }
    }
    for (const anim of g.keten) {
      zet(anim.schuif?.variabele)
      zet(anim.draai?.variabele)
    }
  }
  zet(leesKleurstellingen(modelcfg)?.variabele)
  return namen
}

/**
 * De vorm van het scherm van één apparaat; zie de kop van dit bestand.
 * `undefined` als er geen scherm te maken is: dan blijft de oude weergave.
 */
export function schermVormVan(invoer: SchermInvoer): SchermUitvoer | undefined {
  /* ---- Texturen: kleurstelling, dan zoeken, dan het register ---- */
  const { waarde, heeft } = waardenVan(invoer.getallen)
  const kleuren = leesKleurstellingen(invoer.modelcfg)
  let ctc: Map<string, string> | undefined
  if (kleuren && heeft(kleuren.variabele)) {
    const keuze = kleuren.lijst[Math.round(waarde(kleuren.variabele))]
    if (keuze) ctc = vervangingen(kleuren, keuze)
  }
  const gezocht = new Map<string, string | undefined>()
  const kleurFouten: string[] = []
  /** Het pad van een textuurnaam: eerst de kleurstelling, dan de zoeker van main. */
  const padVan = (naam: string): string | undefined => {
    if (!naam || naam.startsWith('\\S:')) return undefined
    const sleutel = naam.toLowerCase()
    if (gezocht.has(sleutel)) return gezocht.get(sleutel)
    let pad = ctc?.get(textuurSleutel(naam))
    if (pad && !veiligePlaatje(pad, invoer.omsiMap)) {
      kleurFouten.push(`kleurstelling wijst buiten de installatie, genegeerd: ${naam}`)
      pad = undefined
    }
    pad ??= invoer.zoekTextuur(naam)
    gezocht.set(sleutel, pad)
    return pad
  }

  const analyse = analyseer({
    modelcfg: invoer.modelcfg,
    module: invoer.module,
    getallen: invoer.getallen,
    onbekend: invoer.onbekend,
    gevonden: (naam) => padVan(naam) !== undefined
  })
  if (!analyse?.vlak) return undefined
  const { vlak: V, cfg } = analyse
  if (analyse.achtergronden.length === 0 && analyse.teksten.length === 0) return undefined

  const onvolledig = [...analyse.onvolledig, ...kleurFouten]
  const getallen: string[] = []
  const stringvars: string[] = []
  const kanon = schrijfwijzeVan(cfg)
  const getalIndex = (naam: string): number => {
    const vast = kanon(naam)
    const k = getallen.findIndex((n) => n.toLowerCase() === vast.toLowerCase())
    if (k >= 0) return k
    getallen.push(vast)
    return getallen.length - 1
  }
  const stringIndex = (naam: string): number => {
    const k = stringvars.indexOf(naam)
    if (k >= 0) return k
    stringvars.push(naam)
    return stringvars.length - 1
  }
  const zichtVan = (mesh: CfgMesh): Zicht[] =>
    mesh.zicht.map((z) => ({ getal: getalIndex(z.variabele), waarde: z.waarde }))

  const texturen = new Map<string, { id: string; pad: string; vlaggen: object }>()
  const registreer = (pad: string, vlaggen: { alfa: 0 | 1 | 2; trans?: string }): string => {
    const { id } = invoer.bron(pad, vlaggen)
    if (!texturen.has(id)) texturen.set(id, { id, pad, vlaggen })
    return id
  }

  /* ---- Coördinaten ---- */
  const breedte = V.s1 - V.s0
  const hoogte = V.t1 - V.t0
  const naarST = (p: Punt): [number, number] => {
    const w = min(p, V.o)
    return [(punt(w, V.rechts) - V.s0) / breedte, (V.t1 - punt(w, V.omhoog)) / hoogte]
  }
  const dieptemm = (punten: Punt[]): number => {
    const ds = punten.map((p) => punt(min(p, V.o), V.n))
    return (ds.reduce((a, b) => a + b, 0) / Math.max(1, ds.length)) * 1000
  }
  const rond = (x: number): number => Math.round(x * 1e5) / 1e5

  /**
   * De driehoeken als s t u v per hoekpunt. u en v volgens Direct3D: v = 0 is
   * boven; per onderdeel u' = u - floor(u_midden) en v' = v - floor(v_midden),
   * zodat het ALMEX-scherm (v -0,88..-0,12) op rij 122,9..901,2 van zijn plaatje
   * uitkomt, zoals op Lucs schermafdruk.
   */
  const driehoekenVan = (drie: Drie[], uvs: Float32Array | undefined): number[] => {
    let u0 = Infinity
    let u1 = -Infinity
    let v0 = Infinity
    let v1 = -Infinity
    if (uvs) {
      for (const d of drie)
        for (const i of d.i) {
          u0 = Math.min(u0, uvs[i * 2])
          u1 = Math.max(u1, uvs[i * 2])
          v0 = Math.min(v0, uvs[i * 2 + 1])
          v1 = Math.max(v1, uvs[i * 2 + 1])
        }
    }
    const du = uvs ? Math.floor((u0 + u1) / 2) : 0
    const dv = uvs ? Math.floor((v0 + v1) / 2) : 0
    const uit: number[] = []
    for (const d of drie) {
      const hoeken: [Punt, number][] = [
        [d.a, d.i[0]],
        [d.b, d.i[1]],
        [d.c, d.i[2]]
      ]
      for (const [p, i] of hoeken) {
        const [s, t] = naarST(p)
        uit.push(rond(s), rond(t), uvs ? rond(uvs[i * 2] - du) : 0, uvs ? rond(uvs[i * 2 + 1] - dv) : 0)
      }
    }
    return uit
  }

  /* ---- Een beeld- of kleurdeel ---- */
  const beeldDeel = (
    g: Geo,
    mat: number,
    drie: Drie[],
    rol: string
  ): Schermdeel | undefined => {
    const ctx = g.contexten[mat]
    const model = modelVan(g.info)
    if (!model) return undefined
    const alfa = (ctx?.alfa ?? 0) as 0 | 1 | 2
    const adres: Adres = ctx?.adres ?? 'wrap'
    const naam = textuurnaamVan(g, mat)
    const kleur = kleurVan(g, mat)
    const basis = {
      mesh: g.mesh.meshIndex,
      zicht: zichtVan(g.mesh),
      driehoeken: driehoekenVan(drie, model.uvs),
      diepte: rond(dieptemm(drie.flatMap((d) => [d.a, d.b, d.c]))),
      alfa,
      adres
    }
    if (ctx?.transmap?.startsWith('\\S:') || naam.startsWith('\\S:')) {
      onvolledig.push(`scripttextuur, niet natekenbaar: ${ctx?.transmap || naam} op ${g.mesh.pad}`)
      return { soort: 'script', ...basis }
    }
    if (!naam) {
      return { soort: 'kleur', ...basis, kleur }
    }
    if (ctx?.texcoordX || ctx?.texcoordY) {
      onvolledig.push(`texcoordtrans niet nagetekend: ${g.mesh.pad}`)
    }
    let trans: string | undefined
    if (ctx?.transmap) {
      trans = padVan(ctx.transmap)
      if (!trans) onvolledig.push(`transmap ontbreekt: ${ctx.transmap} (${g.mesh.pad})`)
    }
    const vlaggen = trans ? { alfa, trans } : { alfa }
    const pad = padVan(naam)
    const deel: Schermdeel = { soort: 'beeld' as Deelsoort, ...basis }
    if (pad) deel.textuur = registreer(pad, vlaggen)
    if (alfa === 2) deel.kleur = kleur
    if (ctx?.freetex?.variabele) deel.freetex = stringIndex(ctx.freetex.variabele)
    if (!pad && deel.freetex === undefined) {
      onvolledig.push(`textuur ontbreekt: ${naam} (${rol} ${g.mesh.pad})`)
      return undefined
    }
    /*
     * [matl_change] <tex> <n> <var>: bij waarde k het plaatje van item k. Een item
     * met een [matl_nightmap] toont die (het rode vertragingsvak van de ALMEX:
     * almex_versp_rot.jpg); een item zonder eigen plaatje houdt het gewone.
     * items[k-1] hoort bij waarde k.
     */
    if (ctx?.soort === 'matl_change' && ctx.variabele && ctx.items.length > 0) {
      const items = ctx.items.map((item) => {
        const itemNaam = item.freetex?.standaard || item.nightmap || ''
        const itemPad = itemNaam ? padVan(itemNaam) : undefined
        if (itemNaam && !itemPad) onvolledig.push(`textuur ontbreekt: ${itemNaam} (item van ${g.mesh.pad})`)
        return itemPad ? registreer(itemPad, { alfa: (item.alfa ?? alfa) as 0 | 1 | 2 }) : (deel.textuur ?? null)
      })
      deel.keuze = { getal: getalIndex(ctx.variabele), items }
    }
    return deel
  }

  /* ---- Tekstdelen ---- */
  const fontsNodig = new Map<string, boolean>()
  const tekstDeel = (t: Analyse['teksten'][number]): Schermdeel | undefined => {
    const blok: CfgTekstblok | undefined = cfg.tekst[t.ctx.tekst!]
    if (!blok) {
      onvolledig.push(`[useTextTexture] ${t.ctx.tekst} bestaat niet: ${t.geo.mesh.pad}`)
      return undefined
    }
    if (!blok.geldig) {
      onvolledig.push(`tekstblok op regel ${blok.regel} is niet te lezen`)
      return undefined
    }
    const volkleur = (blok.fc & 1) === 1
    fontsNodig.set(blok.font, (fontsNodig.get(blok.font) ?? false) || volkleur)
    const tekst: Teksttextuur = {
      variabele: stringIndex(blok.bron),
      b: blok.b,
      h: blok.h,
      font: blok.font,
      fc: blok.fc,
      kleur: blok.kleur,
      orientatie: blok.orientatie,
      raster: blok.raster
    }
    const model = modelVan(t.geo.info)
    if (!model) return undefined
    let driehoeken: number[]
    if (t.benaderd) {
      /*
       * Versleuteld: de uv's zijn niet te vertrouwen. Eén regel van het font,
       * verticaal in het midden en over de volle breedte -- zo zet OMSI een
       * tekst van één regel neer (y0 = (H - hoogte) / 2).
       */
      const punten = t.drie.flatMap((d) => [d.a, d.b, d.c]).map(naarST)
      const s0 = Math.min(...punten.map((p) => p[0]))
      const s1 = Math.max(...punten.map((p) => p[0]))
      const t0 = Math.min(...punten.map((p) => p[1]))
      const t1 = Math.max(...punten.map((p) => p[1]))
      const fh = invoer.font(blok.font, volkleur)?.hoogte ?? blok.h
      const y0 = Math.trunc((blok.h - fh) / 2)
      const vb = y0 / blok.h
      const vo = (y0 + fh) / blok.h
      driehoeken = [s0, t0, 0, vb, s1, t0, 1, vb, s1, t1, 1, vo, s0, t0, 0, vb, s1, t1, 1, vo, s0, t1, 0, vo].map(rond)
      onvolledig.push(`benaderd (versleuteld): ${t.geo.mesh.pad}`)
    } else {
      driehoeken = driehoekenVan(t.drie, model.uvs)
    }
    return {
      soort: 'tekst',
      mesh: t.geo.mesh.meshIndex,
      zicht: zichtVan(t.geo.mesh),
      driehoeken,
      diepte: rond(dieptemm(t.drie.flatMap((d) => [d.a, d.b, d.c]))),
      alfa: (t.ctx.alfa ?? 0) as 0 | 1 | 2,
      adres: t.ctx.adres ?? 'wrap',
      tekst
    }
  }

  /* ---- In tekenvolgorde ---- */
  const delen: Schermdeel[] = []
  for (const a of analyse.achtergronden) {
    const deel = beeldDeel(a.k.geo, a.k.mat, a.drie, 'achtergrond')
    if (deel) delen.push(deel)
  }
  if (delen.length === 0 && analyse.achtergronden.length > 0) {
    onvolledig.push('geen enkele achtergrond te tonen')
  }
  const boven: { deel: Schermdeel; soort: number; volg: number }[] = []
  for (const l of analyse.lagen) {
    const deel = beeldDeel(l.k.geo, l.k.mat, l.drie, 'laag')
    if (deel) boven.push({ deel, soort: 0, volg: l.k.geo.mesh.cfgIndex * 1000 + l.k.mat })
  }
  for (const t of analyse.teksten) {
    const deel = tekstDeel(t)
    if (deel) boven.push({ deel, soort: 1, volg: t.geo.mesh.cfgIndex * 1000 + t.mat })
  }
  /*
   * Lagen en teksten op diepte; wat binnen 0,2 mm van elkaar ligt geldt als even
   * diep, en dan eerst de lagen en daarna de teksten, elk in cfg-volgorde. In
   * de HH109 liggen teksten en lagen op d = 0,0 in het vlak; het glas van het
   * NLC-display (0,7 mm) ligt echt boven zijn tekst en komt dus als laatste.
   */
  boven.sort((a, b) => a.deel.diepte - b.deel.diepte)
  const groepen: (typeof boven)[] = []
  for (const x of boven) {
    const groep = groepen[groepen.length - 1]
    if (groep && x.deel.diepte - groep[0].deel.diepte < 0.2) groep.push(x)
    else groepen.push([x])
  }
  for (const groep of groepen) {
    groep.sort((a, b) => a.soort - b.soort || a.volg - b.volg)
    for (const x of groep) delen.push(x.deel)
  }

  /* ---- Aanraakvlakken ---- */
  const opschriften = new Map(invoer.module.knoppen.map((k) => [k.actie.toLowerCase(), k.opschrift]))
  const klikken: (Schermklik & { opp: number })[] = []
  for (const k of analyse.klikken) {
    const st = k.punten.map(naarST)
    let x0 = Infinity
    let x1 = -Infinity
    let y0 = Infinity
    let y1 = -Infinity
    for (const [s, t] of st) {
      x0 = Math.min(x0, s)
      x1 = Math.max(x1, s)
      y0 = Math.min(y0, t)
      y1 = Math.max(y1, t)
    }
    /*
     * Eén klik per actie. In de vloot hebben 84 [mesh]-regels meer dan één
     * [mouseevent], vaak twee keer dezelfde (MAN NLC Fahrerfenster_griff_knopf:
     * twee keer cp_fahrerfenster_opn); die gaven twee gelijke knoppen. Twee
     * verschillende acties op één mesh blijven allebei, de laatste bovenop.
     */
    for (const actie of new Set(k.geo.mesh.klikken)) {
      klikken.push({
        actie,
        opschrift: opschriften.get(actie.toLowerCase()) ?? actie,
        mesh: k.geo.mesh.meshIndex,
        zicht: zichtVan(k.geo.mesh),
        x: rond(x0),
        y: rond(y0),
        b: rond(x1 - x0),
        h: rond(y1 - y0),
        diepte: rond(dieptemm(k.punten)),
        opp: (x1 - x0) * (y1 - y0)
      })
    }
  }
  /*
   * De voorste als laatste; wat binnen 0,2 mm even diep ligt, met het kleinste
   * vlak bovenop (onzeker: OMSI kiest waarschijnlijk de eerste treffer langs de
   * muisstraal, en dat is niet nagemeten).
   */
  klikken.sort((a, b) => a.diepte - b.diepte)
  const klikgroepen: (typeof klikken)[] = []
  for (const k of klikken) {
    const groep = klikgroepen[klikgroepen.length - 1]
    if (groep && k.diepte - groep[0].diepte < 0.2) groep.push(k)
    else klikgroepen.push([k])
  }
  klikken.splice(0, klikken.length, ...klikgroepen.flatMap((groep) => groep.sort((a, b) => b.opp - a.opp)))

  /* ---- Lettertypen ---- */
  const fonts: Record<string, Schermfont> = {}
  for (const [naam, volkleur] of fontsNodig) {
    const font = invoer.font(naam, volkleur)
    if (font) fonts[naam] = font
    else onvolledig.push(`font ontbreekt: ${naam}`)
  }

  /*
   * Een plaatje zonder tekst en zonder één aanraakvlak is geen scherm: dan zijn
   * het toetsen in de ruimte (de muntjes van een wisselautomaat) en toevallig
   * een oppervlak eronder. Dan blijft de oude weergave.
   */
  if (!delen.some((d) => d.soort === 'tekst') && klikken.length === 0) return undefined
  if (!delen.some((d) => d.soort === 'beeld' || d.soort === 'tekst')) return undefined

  const zonderId: Omit<Schermvorm, 'id'> = {
    versie: 1,
    module: invoer.module.id,
    verhouding: rond(breedte / hoogte),
    leeg: '#000',
    delen,
    klikken: klikken.map(({ opp: _opp, ...rest }) => rest),
    fonts,
    stringvars,
    getallen,
    onvolledig: [...new Set(onvolledig)]
  }
  /* Het id volgt uit de inhoud: dezelfde vorm, hetzelfde id; iets anders, een ander. */
  const id = createHash('sha1').update(JSON.stringify(zonderId)).digest('hex').slice(0, 20)
  const vorm: Schermvorm = { ...zonderId, id }

  const opScherm = [...new Set(vorm.klikken.map((k) => k.actie))]
  return {
    vorm,
    texturen: [...texturen.values()],
    knoppenOpScherm: opScherm,
    losseKnoppen: analyse.los
  }
}
