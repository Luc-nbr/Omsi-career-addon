import { codeerBc, heeftAlfa, mipKeten, type BcFormaat } from '../../../../shared/bcn'
import { schrijfDds } from '../../../../shared/dds'
import { itemSleutel } from '../../../../shared/bus3d'
import type { Laag, LakDoel, LakFamilieInfo, Plaats } from '../../../../shared/lak'
import type { Beurt, BusScene, Tekenaar } from '../teken'
import { maakProgramma, type GpuTextuur, type Ontleder } from '../texturen'
import { eenheid, kijkNaar, orthografisch, projecteer, vermenigvuldig, type Mat4, type Vec3 } from '../wiskunde'
import {
  DEKKING_FS,
  DIEPTE_FS,
  DIEPTE_VS,
  GEDEELD_FS,
  JFA_SPRONG_FS,
  JFA_ZAAD_FS,
  KLEIN_FS,
  KOPIE_FS,
  LAKNET_VS,
  MASKER_FS,
  MASKER_SAMEN_FS,
  MAX_LAGEN,
  PENSEEL_FS,
  PICK_FS,
  PICK_VS,
  PLEK_FS,
  EFFECT_FS,
  TEKEN_FS,
  SAMENSTEL_FS,
  SCHERM_VS,
  TOON_MASKER_FS,
  VUL_FS
} from './lakshaders'
import { spiegelPlaats } from './recept'
import { raamlijn, zonesVan, type Zone } from './zones'

/**
 * HET LAKDOEK (lakstudio-ontwerp §4.3-§4.8, §4.13, §4.14)
 *
 * In de renderer-werker van het 3D-venster, in dezelfde WebGL2-context als de
 * viewer. Per DOEL (één textuur die de studio maakt, shared/lak.ts):
 *
 * - het LAKNET: alle driehoeken van de bus die NU in beeld zijn (de ruststand
 *   met de busopties) en waarvan het geldende materiaal de doeltextuur als
 *   hoofdtextuur heeft, ook op de aanhanger; UV per driehoek teruggeschoven met
 *   floor(zwaartepunt), en een kopie met ±1 over een tegelgrens; haarlijnen op de
 *   buitenranden van de uv-eilanden (eigen vao). De hoekpunten komen uit de
 *   hoekpuntbuffer van de tekenaar (`getBufferSubData`, één keer): al ontward,
 *   met de verschuiving van de aanhanger. Nooit op schijf (bus3d.md:74).
 * - het MASKER (RGBA8, halve maat; licht een kwart): R buiten (26 richtingen,
 *   twee dieptekaarten per richting, 1 cm voor dichte en 5 cm voor doorzichtige
 *   meshes; een stencil slaat al gevonden texels over), G glas (alleen glas, geen
 *   driehoek zonder glas), B gedeeld (MIN- en MAX-gang van de plek), A gedekt.
 * - de ZONES (k-means in Lab op 1/8, zones.ts) en de RAAMLIJN.
 * - het ZAAD van het uitvloeien (JFA, RG16UI, één keer per doel).
 * - het RESULTAAT (SRGB8_ALPHA8 met mips): de override van de plek in de
 *   tekenaar (`Texturen.zetVervanging`), meteen in beeld.
 *
 * Samenstellen (§4.5): pad 1 is één UV-gang over het laknet met alle lagen per
 * fragment (gedeelde texels overgeslagen), pad 2 (alleen bij ≥ 1% gedeeld) per 4
 * lagen de hoogste dekking over alle plekken van een texel (MAX), dan
 * schermvullend op de gedeelde texels. Daarna uitvloeien en `generateMipmap`.
 *
 * De EXPORT (§4.14) rekent op volle maat in tegels van 2048², met een zaad op
 * volle maat en per tegel dezelfde omzetting als het hele doel (verschoven
 * viewport of schaar; dan is tegel en in één keer byte-gelijk, P6), leest per tegel uit
 * met een PBO, maakt de mipketen op de processor (lineair licht, shared/bcn.ts) en
 * codeert in 1-4 codeerwerkers (codeer.ts) naar een DX9-DDS (shared/dds.ts).
 */

/* ------------------------------------------------------------------ typen */

interface Laknet {
  vao: WebGLVertexArrayObject
  /**
   * De randen in een EIGEN vao (zelfde hoekpunten, met de indexbuffer). In één vao
   * met de driehoeken gaf ANGLE (D3D11) na drawArrays + drawElements(LINES) per
   * texel een tweede fragment met plek (0,0,0): 88% "gedeeld" op de SD77.
   */
  lijnVao: WebGLVertexArrayObject
  vb: WebGLBuffer
  lijnen: WebGLBuffer
  n: number
  nLijnen: number
  driehoeken: number
  /** UV-oppervlak en wereldoppervlak: de texeldichtheid (§2.2). */
  uvOpp: number
  wereldOpp: number
  bytes: number
}

interface Doek {
  doel: LakDoel
  /** De plek in de textuurlijst van de bus die deze textuur draagt (voor de override). */
  plek: number
  net: Laknet
  editB: number
  editH: number
  basis: WebGLTexture
  basisHeeftAlfa: boolean
  sjabloon?: { bs: WebGLTexture; ma: WebGLTexture; ad: WebGLTexture; mu: WebGLTexture }
  masker: WebGLTexture
  maskerBytes?: Uint8Array
  zaad: WebGLTexture
  ruw: WebGLTexture
  ruwFb: WebGLFramebuffer
  resultaat: WebGLTexture
  resultaatFb: WebGLFramebuffer
  penseel: Array<{ tex: WebGLTexture; fb: WebGLFramebuffer; sleutel: string }>
  dekking?: { tex: WebGLTexture; lagen: number; b: number; h: number }
  zones: Zone[]
  gedeeld: number
  gedekt: number
  ms: Record<string, number>
}

export interface LakKlaarInfo {
  doelen: Array<{
    id: string
    naam: string
    b: number
    h: number
    editB: number
    editH: number
    texelsPerM: number
    gedeeld: number
    gedekt: number
    driehoeken: number
    zones: Array<{ deel: number; lak: boolean; kleur: string }>
    sjabloon: boolean
    ms: Record<string, number>
  }>
  raamlijn: { L?: number; R?: number }
  /** De lichte stand (gevraagd, of vanzelf boven 500 MB, §4.13). */
  licht: boolean
  /** De doos in o3d-assen (busruimte, zoals de lagen). */
  doos: { min: Vec3; max: Vec3 }
  ms: number
  gpuBytes: number
}

export interface LakKeuze {
  doel?: string
  uv?: [number, number]
  plek?: Vec3
  normaal?: Vec3
  glas: boolean
  gedeeld: boolean
  onderdeel: boolean
  deur: boolean
  lak: boolean
}

/* ------------------------------------------------------------------ hulp */

const RICHTINGEN: Vec3[] = (() => {
  const uit: Vec3[] = []
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) if (x || y || z) uit.push(eenheid([x, y, z]))
  return uit
})()

/** '#rrggbb' → lineaire rgb. */
export function kleurLin(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  const v = m ? parseInt(m[1], 16) : 0x808080
  const lin = (c: number): number => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return [lin((v >> 16) & 255), lin((v >> 8) & 255), lin(v & 255)]
}

function hex(c: [number, number, number]): string {
  return `#${c.map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')}`
}

/**
 * Wielen krijgen nooit lak (vlag 8, beschermd zoals glas): op de HH20 is de
 * zwarte band de grootste zone en zijn de banden net zo zwart, dus hielpen de
 * zones daar niet. Herkend aan de naam van de o3d (Rad_VR, 21_wheel_HL, Reifen,
 * Felge, Tyre), niet aan lenkrad of radio.
 */
const WIEL = /(^|[_\-\s.])(rad|raeder|räder|wheels?|reifen|tyres?|tires?|felgen?|rims?)(?=[_\-\s.\d]|$)/i

/** Een decal-beeld in de array (1024×512 per laag; een tekst of logo wordt uitgerekt, de shader rekt terug). */
const DECAL_B = 1024
const DECAL_H = 512

/* ------------------------------------------------------------------ het lakdoek */

export class Lakdoek {
  private progs!: Record<string, { prog: WebGLProgram; u: Record<string, WebGLUniformLocation | null> }>
  private doeken: Doek[] = []
  private info?: LakFamilieInfo
  private lagen: Laag[] = []
  private spiegel = { aan: true, vlakX: 0 }
  private vuil = false
  private diepte?: { dicht: WebGLTexture; door: WebGLTexture; fbDicht: WebGLFramebuffer; fbDoor: WebGLFramebuffer; maat: number }
  private leegVao!: WebGLVertexArrayObject
  private decals?: { tex: WebGLTexture; lagen: number; sleutels: string[] }
  private beelden = new Map<string, ImageBitmap>()
  private leeg!: WebGLTexture
  private leegArray!: WebGLTexture
  private raam: { L?: number; R?: number } = {}
  /** De hoekpunten van de bus (ontward), voor een nieuw laknet na andere busopties. */
  private hoekpunten?: Float32Array
  private toonMasker = false
  /** Tijdens een meting (lakMeet): na het samenstellen op de GPU wachten, zodat de tijd klopt. */
  meten = false
  /** De laatste tijden (P3). */
  metingen: { samenstellen: number[]; laatste?: Record<string, number> } = { samenstellen: [] }
  licht = false

  constructor(
    readonly gl: WebGL2RenderingContext,
    readonly tekenaar: Tekenaar,
    readonly ontleder: Ontleder
  ) {
    this.maakProgrammas()
  }

  private maakProgrammas(): void {
    const gl = this.gl
    const p = (vs: string, fs: string, namen: string[]): { prog: WebGLProgram; u: Record<string, WebGLUniformLocation | null> } => {
      const prog = maakProgramma(gl, vs, fs)
      const u: Record<string, WebGLUniformLocation | null> = {}
      for (const n of namen) u[n] = gl.getUniformLocation(prog, n)
      return { prog, u }
    }
    const lagenNamen = [
      'uLagen', 'uAantal', 'uBasis', 'uDetail', 'uAlfaBron', 'uMasker', 'uSjabloonMA', 'uSjabloonAD', 'uSjabloonMU', 'uDecals',
      'uPenseel0', 'uPenseel1', 'uDekking', 'uSjabloon', 'uZones', 'uZoneAantal', 'uDoosMin', 'uDoosMax', 'uTegel', 'uMaat'
    ]
    this.progs = {
      masker: p(LAKNET_VS, MASKER_FS, ['uTegel', 'uDicht', 'uDoor', 'uRichting', 'uKijk', 'uDiepte', 'uTexelM', 'uLijn', 'uRichtingGang']),
      plek: p(LAKNET_VS, PLEK_FS, ['uTegel', 'uDoosMin', 'uDoosMaat']),
      maskerSamen: p(SCHERM_VS, MASKER_SAMEN_FS, ['uRuw', 'uMin', 'uMax', 'uBegin']),
      diepte: p(DIEPTE_VS, DIEPTE_FS, ['uMat', 'uTex', 'uAlfatest']),
      zaad: p(SCHERM_VS, JFA_ZAAD_FS, ['uMasker', 'uSchaal']),
      sprong: p(SCHERM_VS, JFA_SPRONG_FS, ['uVorig', 'uStap']),
      vul: p(SCHERM_VS, VUL_FS, ['uRuw', 'uZaad', 'uAlfa', 'uBegin']),
      samenstel: p(LAKNET_VS, SAMENSTEL_FS, [...lagenNamen, 'uGedeeldApart']),
      dekking: p(LAKNET_VS, DEKKING_FS, [...lagenNamen, 'uEerste']),
      gedeeld: p(SCHERM_VS, GEDEELD_FS, [...lagenNamen, 'uBegin']),
      kopie: p(SCHERM_VS, KOPIE_FS, ['uBron', 'uMaat']),
      penseel: p(LAKNET_VS, PENSEEL_FS, ['uTegel', 'uCameraDiepte', 'uCamera', 'uStippen', 'uStipAantal', 'uKleur', 'uHardheid', 'uGum']),
      pick: p(PICK_VS, PICK_FS, ['uMat', 'uLaknet', 'uDoel']),
      klein: p(SCHERM_VS, KLEIN_FS, ['uBron', 'uMasker', 'uMaat']),
      toon: p(SCHERM_VS, TOON_MASKER_FS, ['uMasker', 'uMaat']),
      effect: p(SCHERM_VS, EFFECT_FS, lagenNamen),
      teken: p(LAKNET_VS, TEKEN_FS, ['uTegel', 'uKeuze'])
    }
    this.leegVao = gl.createVertexArray()!
    this.leeg = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, this.leeg)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]))
    this.leegArray = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.leegArray)
    gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA8, 1, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4))
  }

  get actief(): boolean {
    return this.doeken.length > 0
  }

  /** De familie waarmee het lakdoek startte (voor de export van andere leden). */
  get familie(): LakFamilieInfo | undefined {
    return this.info
  }

  /* ------------------------------------------------------------------ starten */

  /**
   * Het lakdoek voor de bus die nu in de tekenaar staat: per doel waarvan de
   * textuur in deze bus zit het laknet, de basis, het sjabloon, het masker, de
   * zones en het zaad. Doelen van een ander familielid komen bij de export (die
   * laadt dat lid).
   */
  async start(info: LakFamilieInfo, opties: { licht?: boolean; vlakX?: number } = {}): Promise<LakKlaarInfo> {
    const t0 = performance.now()
    this.stop()
    this.info = info
    this.licht = Boolean(opties.licht)
    const s = this.tekenaar.scene
    if (!s) throw new Error('geen bus in beeld')
    this.spiegel.vlakX = opties.vlakX ?? (s.manifest.doos.min[0] + s.manifest.doos.max[0]) / 2
    const vertices = this.leesHoekpunten(s)
    this.hoekpunten = vertices
    this.raam = this.meetRaamlijn(s, vertices)
    // §4.13: zou de volle stand boven 500 MB komen (masker, zaad, ruw, resultaat met mips en de basis per doel), dan vanzelf licht.
    if (!this.licht) {
      let schatting = 0
      for (const d of info.doelen) {
        if (!s.manifest.texturen.some((t) => t.id === d.textuur)) continue
        const e = (d.uitB * d.uitH) / 4
        schatting += e * 12 + (e * 16) / 3 + d.uitB * d.uitH * 4
      }
      if (schatting > 500 * 1048576) this.licht = true
    }
    for (const d of info.doelen) {
      const plek = s.manifest.texturen.findIndex((t) => t.id === d.textuur)
      if (plek < 0) continue
      const doek = await this.maakDoek(d, plek, s, vertices)
      if (doek) this.doeken.push(doek)
    }
    this.vuil = true
    this.werk()
    const gpu = this.gpuBytes()
    return {
      doelen: this.doeken.map((k) => ({
        id: k.doel.id,
        naam: k.doel.naam,
        b: k.doel.uitB,
        h: k.doel.uitH,
        editB: k.editB,
        editH: k.editH,
        texelsPerM: Math.round(Math.sqrt((k.net.uvOpp * k.doel.uitB * k.doel.uitH) / Math.max(k.net.wereldOpp, 1e-6))),
        gedeeld: Math.round(k.gedeeld * 1000) / 10,
        gedekt: Math.round(k.gedekt * 1000) / 10,
        driehoeken: k.net.driehoeken,
        zones: k.zones.map((z) => ({ deel: Math.round(z.deel * 1000) / 1000, lak: z.lak, kleur: hex(z.kleur) })),
        sjabloon: Boolean(k.sjabloon),
        ms: k.ms
      })),
      raamlijn: this.raam,
      licht: this.licht,
      doos: { min: [...s.manifest.doos.min] as Vec3, max: [...s.manifest.doos.max] as Vec3 },
      ms: Math.round(performance.now() - t0),
      gpuBytes: gpu
    }
  }

  /** Alle hoekpunten van de bus in de tekenaar, één keer van de GPU (al ontward, met de verschuiving van de delen). */
  private leesHoekpunten(s: BusScene): Float32Array {
    const gl = this.gl
    const n = s.bytes.hoekpunten / 4
    const uit = new Float32Array(n)
    gl.bindBuffer(gl.ARRAY_BUFFER, s.vb)
    gl.getBufferSubData(gl.ARRAY_BUFFER, 0, uit)
    gl.bindBuffer(gl.ARRAY_BUFFER, null)
    return uit
  }

  /** De raamlijn (§4.3): glas zonder animatie, de meest voorkomende onderkant per zijde. */
  private meetRaamlijn(s: BusScene, f: Float32Array): { L?: number; R?: number } {
    const glas: Array<{ y: number; x: number; opp: number }> = []
    s.kop.vermeldingen.forEach((v) => {
      if (!v.buiten || v.anims > 0) return
      const stuk = s.kop.stukken[v.stuk]
      const basis = s.stukBasis[v.stuk]
      if (!stuk || !basis) return
      for (const g of stuk.groepen) {
        const m = v.materialen[g.materiaal]
        if (!m || m.alfa !== 2 || !m.envmap) continue
        for (let i = 0; i < g.aantal; i += 3) {
          const a = s.alleIndices[basis.index + g.begin + i] * 8
          const b = s.alleIndices[basis.index + g.begin + i + 1] * 8
          const c = s.alleIndices[basis.index + g.begin + i + 2] * 8
          const y = Math.min(f[a + 1], f[b + 1], f[c + 1])
          const ux = f[b] - f[a]
          const uy = f[b + 1] - f[a + 1]
          const uz = f[b + 2] - f[a + 2]
          const vx = f[c] - f[a]
          const vy = f[c + 1] - f[a + 1]
          const vz = f[c + 2] - f[a + 2]
          const opp = 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx)
          // Alleen zijruiten: de normaal (hoekpunt a) wijst opzij.
          if (Math.abs(f[a + 3]) < 0.6) continue
          glas.push({ y, x: (f[a] + f[b] + f[c]) / 3, opp })
        }
      }
    })
    return raamlijn(glas)
  }

  /** Het laknet van één doel: de driehoeken met deze textuur als hoofdtextuur, ontward in een eigen VBO. */
  private bouwLaknet(s: BusScene, f: Float32Array, plek: number): Laknet | undefined {
    const gl = this.gl
    const tri: number[] = []
    const vlaggen: number[] = []
    const tekens: number[] = []
    const gezien = new Set<string>()
    // Alleen wat nu in beeld is (§4.9: het masker volgt de busopties), met het [matl_change]-item dat nu geldt.
    const zicht = s.lak?.zichtbaar ?? ''
    const items = s.lak?.items ?? {}
    s.kop.vermeldingen.forEach((v, vi) => {
      if (!v.buiten || v.schaduw) return
      if (zicht.length === s.kop.vermeldingen.length && zicht[vi] === '0') return
      const stuk = s.kop.stukken[v.stuk]
      const basis = s.stukBasis[v.stuk]
      if (!stuk || !basis) return
      for (const g of stuk.groepen) {
        const m = v.materialen[g.materiaal]
        if (!m) continue
        const item = items[itemSleutel(vi, g.materiaal)] ?? 0
        const hier = item >= 1 && m.wissel?.items[item - 1] ? m.wissel.items[item - 1] : m
        if ((hier.textuur ?? hier.freetex?.standaard) !== plek) continue
        const sleutel = `${v.stuk}|${g.materiaal}`
        if (gezien.has(sleutel)) continue
        gezien.add(sleutel)
        const vlag = (hier.alfa === 2 ? 1 : 0) | (v.anims > 0 ? 2 : 0) | (v.zicht.length > 0 ? 4 : 0) | (WIEL.test(stuk.o3d) ? 8 : 0)
        for (let i = 0; i < g.aantal; i += 3) {
          tri.push(s.alleIndices[basis.index + g.begin + i], s.alleIndices[basis.index + g.begin + i + 1], s.alleIndices[basis.index + g.begin + i + 2])
          vlaggen.push(vlag)
          tekens.push(vi)
        }
      }
    })
    if (tri.length === 0) return undefined
    // Ontwarren, met UV teruggeschoven per driehoek, en een kopie over elke tegelgrens die hij raakt (hooguit 4).
    const uit: number[] = []
    let uvOpp = 0
    let wereldOpp = 0
    let n = 0
    for (let t = 0; t < tri.length / 3; t++) {
      const idx = [tri[t * 3] * 8, tri[t * 3 + 1] * 8, tri[t * 3 + 2] * 8]
      const us = idx.map((o) => f[o + 6])
      const vs = idx.map((o) => f[o + 7])
      if (![...us, ...vs].every(Number.isFinite)) continue
      const fu = Math.floor((us[0] + us[1] + us[2]) / 3)
      const fv = Math.floor((vs[0] + vs[1] + vs[2]) / 3)
      const u = us.map((x) => x - fu)
      const w = vs.map((x) => x - fv)
      const [u0, u1] = [Math.min(...u), Math.max(...u)]
      const [w0, w1] = [Math.min(...w), Math.max(...w)]
      const a = idx[0]
      const b = idx[1]
      const c = idx[2]
      const ex = [f[b] - f[a], f[b + 1] - f[a + 1], f[b + 2] - f[a + 2]]
      const ey = [f[c] - f[a], f[c + 1] - f[a + 1], f[c + 2] - f[a + 2]]
      wereldOpp += 0.5 * Math.hypot(ex[1] * ey[2] - ex[2] * ey[1], ex[2] * ey[0] - ex[0] * ey[2], ex[0] * ey[1] - ex[1] * ey[0])
      uvOpp += 0.5 * Math.abs((u[1] - u[0]) * (w[2] - w[0]) - (w[1] - w[0]) * (u[2] - u[0]))
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (u1 + dx < 0 || u0 + dx > 1 || w1 + dy < 0 || w0 + dy > 1) continue
          for (let k = 0; k < 3; k++) {
            const o = idx[k]
            uit.push(f[o], f[o + 1], f[o + 2], f[o + 3], f[o + 4], f[o + 5], u[k] + dx, w[k] + dy, vlaggen[t], tekens[t])
            n++
          }
        }
      }
    }
    const data = new Float32Array(uit)
    const vb = gl.createBuffer()!
    const vao = gl.createVertexArray()!
    gl.bindVertexArray(vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, vb)
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW)
    const stap = 40
    const wijs = (): void => {
      gl.bindBuffer(gl.ARRAY_BUFFER, vb)
      gl.enableVertexAttribArray(0)
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stap, 0)
      gl.enableVertexAttribArray(1)
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stap, 12)
      gl.enableVertexAttribArray(2)
      gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stap, 24)
      gl.enableVertexAttribArray(3)
      gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stap, 32)
    }
    wijs()
    gl.bindVertexArray(null)
    /*
     * De randen als lijnen (§4.7: WebGL2 kent geen conservatieve rasterisatie;
     * haarlijnen), maar alleen de BUITENRANDEN van de uv-eilanden: een rand die
     * twee driehoeken met dezelfde uv delen, is al gedekt. Alle randen kostten
     * een derde extra in het samenstellen (C2: 4,1 in plaats van 3 ms bij 4096²).
     */
    // Eerst elke uv een nummer, op de bits van de twee floats (een getal als sleutel; bij een botsing in de
    // afgekapte bits een tekenreeks), dan randen als getal. Met tekenreeksen voor alles kostte dit 60 ms extra.
    const bits = new Uint32Array(data.buffer, data.byteOffset, data.length)
    const uvNr = new Uint32Array(n)
    const opGetal = new Map<number, number>()
    const vVan: number[] = []
    const uVan: number[] = []
    const opTekst = new Map<string, number>()
    let nummers = 0
    for (let i = 0; i < n; i++) {
      const ub = bits[i * 10 + 6]
      const vb = bits[i * 10 + 7]
      const k = ub * 2097152 + (vb >>> 11)
      let nr = opGetal.get(k)
      if (nr === undefined) {
        nr = nummers++
        opGetal.set(k, nr)
        uVan[nr] = ub
        vVan[nr] = vb
      } else if (vVan[nr] !== vb || uVan[nr] !== ub) {
        const t = `${ub}|${vb}`
        nr = opTekst.get(t)
        if (nr === undefined) {
          nr = nummers++
          opTekst.set(t, nr)
        }
      }
      uvNr[i] = nr
    }
    const randSleutel = (a: number, b: number): number => {
      const x = uvNr[a]
      const y = uvNr[b]
      return x < y ? x * 4194304 + y : y * 4194304 + x
    }
    const telling = new Map<number, number>()
    for (let t = 0; t < n / 3; t++)
      for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
        const k = randSleutel(t * 3 + a, t * 3 + b)
        telling.set(k, (telling.get(k) ?? 0) + 1)
      }
    const lijnLijst: number[] = []
    for (let t = 0; t < n / 3; t++)
      for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) if (telling.get(randSleutel(t * 3 + a, t * 3 + b)) === 1) lijnLijst.push(t * 3 + a, t * 3 + b)
    const lijnIdx = new Uint32Array(lijnLijst)
    const lijnVao = gl.createVertexArray()!
    gl.bindVertexArray(lijnVao)
    wijs()
    const lijnen = gl.createBuffer()!
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lijnen)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, lijnIdx, gl.STATIC_DRAW)
    gl.bindVertexArray(null)
    return { vao, lijnVao, vb, lijnen, n, nLijnen: lijnIdx.length, driehoeken: tri.length / 3, uvOpp, wereldOpp, bytes: data.byteLength + lijnIdx.byteLength }
  }

  /** Een doel opbouwen: laknet, basis, sjabloon, masker, zones, zaad, resultaat. */
  private async maakDoek(d: LakDoel, plek: number, s: BusScene, f: Float32Array): Promise<Doek | undefined> {
    const ms: Record<string, number> = {}
    let t = performance.now()
    const net = this.bouwLaknet(s, f, plek)
    ms.laknet = Math.round(performance.now() - t)
    if (!net) return undefined
    const deel = this.licht ? 4 : 2
    const editB = Math.max(256, Math.round(d.uitB / deel))
    const editH = Math.max(256, Math.round(d.uitH / deel))
    t = performance.now()
    const basis = await this.laadBasis(d.textuur!)
    const sjabloon = d.sjabloon ? await this.laadSjabloon(d) : undefined
    ms.basis = Math.round(performance.now() - t)
    const gl = this.gl
    const doek: Doek = {
      doel: d,
      plek,
      net,
      editB,
      editH,
      basis: basis.tex,
      basisHeeftAlfa: basis.alfa,
      sjabloon,
      masker: this.maakTex(gl.RGBA8, editB, editH),
      zaad: this.maakTex(gl.RG16UI, editB, editH),
      ruw: this.maakTex(gl.SRGB8_ALPHA8, editB, editH),
      ruwFb: gl.createFramebuffer()!,
      resultaat: this.maakTex(gl.SRGB8_ALPHA8, editB, editH, true),
      resultaatFb: gl.createFramebuffer()!,
      penseel: [],
      zones: [],
      gedeeld: 0,
      gedekt: 0,
      ms
    }
    this.hang(doek.ruwFb, doek.ruw)
    this.hang(doek.resultaatFb, doek.resultaat)
    t = performance.now()
    this.rekenMasker(doek, doek.masker, editB, editH, [[0, 0, editB, editH]])
    this.wachtGpu()
    ms.masker = Math.round(performance.now() - t)
    t = performance.now()
    this.telMasker(doek)
    ms.tellen = Math.round(performance.now() - t)
    t = performance.now()
    doek.zones = this.rekenZones(doek)
    ms.zones = Math.round(performance.now() - t)
    t = performance.now()
    this.rekenZaad(doek.masker, editB, editH, doek.zaad, editB, editH)
    this.wachtGpu()
    ms.jfa = Math.round(performance.now() - t)
    // De override: vanaf nu tekent de bus deze lak.
    const gpu: GpuTextuur = { tex: doek.resultaat, bytes: Math.round((editB * editH * 16) / 3), b: editB, h: editH, lineariseer: false, heeftAlfa: true, staat: 'vol' }
    this.tekenaar.texturen.zetVervanging(plek, gpu)
    return doek
  }

  /**
   * Wachten tot de GPU klaar is, voor de tijden (P3): één texel uitlezen. In
   * Chromium wacht gl.finish() niet altijd op de GPU zelf; readPixels wel (de
   * opdrachten lopen op volgorde).
   */
  private wachtFb?: WebGLFramebuffer
  private wachtGpu(): void {
    const gl = this.gl
    if (!this.wachtFb) {
      this.wachtFb = gl.createFramebuffer()!
      const t = this.maakTex(gl.RGBA8, 1, 1)
      this.hang(this.wachtFb, t)
    }
    const oud = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.wachtFb)
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4))
    gl.bindFramebuffer(gl.FRAMEBUFFER, oud)
  }

  private maakTex(formaat: number, b: number, h: number, mips = false): WebGLTexture {
    const gl = this.gl
    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    const niveaus = mips ? Math.floor(Math.log2(Math.max(b, h))) + 1 : 1
    gl.texStorage2D(gl.TEXTURE_2D, niveaus, formaat, b, h)
    const heel = formaat === gl.RG16UI || formaat === gl.DEPTH_COMPONENT32F
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, heel ? gl.NEAREST : mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, heel ? gl.NEAREST : gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return tex
  }

  private hang(fb: WebGLFramebuffer, tex: WebGLTexture, niveau = 0): void {
    const gl = this.gl
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, niveau)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  /** Een bestand op id uit `omsi3d://t/`, als RGBA in een SRGB8_ALPHA8-textuur met mips (de basis, §4.13). */
  private async laadBasis(id: string, srgb = true): Promise<{ tex: WebGLTexture; b: number; h: number; alfa: boolean }> {
    const r = await fetch(`omsi3d://t/${id}`)
    if (!r.ok) throw new Error(`basis: omsi3d ${r.status}`)
    const bytes = await r.arrayBuffer()
    const kop = new Uint8Array(bytes, 0, Math.min(4, bytes.byteLength))
    const isBeeld = (kop[0] === 0x42 && kop[1] === 0x4d) || (kop[0] === 0x89 && kop[1] === 0x50) || (kop[0] === 0xff && kop[1] === 0xd8)
    let b: number
    let h: number
    let bron: TexImageSource | Uint8Array
    let alfa = true
    if (isBeeld && !(kop[0] === 0x42 && kop[1] === 0x4d && new Uint8Array(bytes)[28] === 32)) {
      const mime = kop[0] === 0x42 ? 'image/bmp' : kop[0] === 0x89 ? 'image/png' : 'image/jpeg'
      const bm = await createImageBitmap(new Blob([bytes], { type: mime }), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })
      b = bm.width
      h = bm.height
      bron = bm
      alfa = kop[0] === 0x89
    } else {
      const u = await this.ontleder.ontleed(bytes)
      b = u.b
      h = u.h
      bron = u.pixels
      alfa = false
      for (let i = 3; i < u.pixels.length; i += 4 * 97) if (u.pixels[i] !== 255) {
        alfa = true
        break
      }
    }
    const gl = this.gl
    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texStorage2D(gl.TEXTURE_2D, Math.floor(Math.log2(Math.max(b, h))) + 1, srgb ? gl.SRGB8_ALPHA8 : gl.RGBA8, b, h)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE)
    if (bron instanceof Uint8Array) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, b, h, gl.RGBA, gl.UNSIGNED_BYTE, bron)
    else {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, bron)
      ;(bron as ImageBitmap).close?.()
    }
    gl.generateMipmap(gl.TEXTURE_2D)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return { tex, b, h, alfa }
  }

  private async laadSjabloon(d: LakDoel): Promise<Doek['sjabloon']> {
    const s = d.sjabloon
    if (!s?.bs || !s.ma) return undefined
    try {
      const bs = await this.laadBasis(s.bs, true)
      const ma = await this.laadBasis(s.ma, false)
      const ad = s.ad ? await this.laadBasis(s.ad, false) : undefined
      const mu = s.mu ? await this.laadBasis(s.mu, false) : undefined
      const zwart = this.leeg
      const wit = this.eenKleur([255, 255, 255, 255])
      return { bs: bs.tex, ma: ma.tex, ad: ad?.tex ?? zwart, mu: mu?.tex ?? wit }
    } catch {
      return undefined
    }
  }

  private eenKleur(c: [number, number, number, number]): WebGLTexture {
    const gl = this.gl
    const t = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, t)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(c))
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    return t
  }

  /* ------------------------------------------------------------------ het masker (§4.3) */

  /** De twee dieptekaarten (1024², DEPTH32F), één keer gemaakt en hergebruikt (8 MB). */
  private dieptekaarten(): NonNullable<Lakdoek['diepte']> {
    if (this.diepte) return this.diepte
    const gl = this.gl
    const maat = 1024
    const maak = (): { tex: WebGLTexture; fb: WebGLFramebuffer } => {
      const tex = this.maakTex(gl.DEPTH_COMPONENT32F, maat, maat)
      const fb = gl.createFramebuffer()!
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, tex, 0)
      gl.drawBuffers([gl.NONE])
      gl.readBuffer(gl.NONE)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      return { tex, fb }
    }
    const a = maak()
    const b = maak()
    this.diepte = { dicht: a.tex, fbDicht: a.fb, door: b.tex, fbDoor: b.fb, maat }
    return this.diepte
  }

  /** Een dieptekaart van de bus uit één richting: de dichte stukken, of de doorzichtige (alfatest en mengen, ook glas). */
  private tekenDiepte(s: BusScene, mat: Mat4, doorzichtig: boolean): void {
    const gl = this.gl
    const pr = this.progs.diepte
    gl.useProgram(pr.prog)
    gl.uniformMatrix4fv(pr.u.uMat, false, mat)
    gl.uniform1i(pr.u.uTex, 0)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindSampler(0, null)
    // Nooit de dieptekaart zelf op eenheid 0 laten staan (van de vorige richting): dat is een terugkoppeling en de tekenbeurt vervalt.
    gl.bindTexture(gl.TEXTURE_2D, this.leeg)
    gl.bindVertexArray(s.vao)
    const teken = (lijst: Beurt[], ib: WebGLBuffer, alfatest: boolean): void => {
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib)
      gl.uniform1i(pr.u.uAlfatest, alfatest ? 1 : 0)
      for (const b of lijst) {
        if (alfatest) {
          const t = b.mat.tex !== undefined ? this.tekenaar.texturen.voorPlek(b.mat.tex) : undefined
          gl.bindTexture(gl.TEXTURE_2D, t?.tex ?? this.leeg)
          gl.bindSampler(0, this.tekenaar.texturen.sampler(b.mat.klem))
        }
        gl.drawElements(gl.TRIANGLES, b.aantal, gl.UNSIGNED_INT, b.begin * 4)
      }
      gl.bindSampler(0, null)
    }
    if (!doorzichtig) teken(s.dicht, s.ibSamen, false)
    else {
      teken(s.test, s.ibSamen, true)
      teken(s.meng.flat(), s.ibAlle, false)
    }
    gl.bindVertexArray(null)
  }

  /** Het ortho-aanzicht van de bus uit een richting (kijkrichting `d`), met de diepte in meters. */
  private richtingMat(s: BusScene, d: Vec3): { mat: Mat4; diepte: number; texelM: number } {
    const lo = s.doos.min
    const hi = s.doos.max
    const midden: Vec3 = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2]
    const r = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2])
    const omhoog: Vec3 = Math.abs(d[1]) > 0.9 ? [0, 0, 1] : [0, 1, 0]
    const zicht = kijkNaar([midden[0] - d[0] * r, midden[1] - d[1] * r, midden[2] - d[2] * r], midden, omhoog)
    let x0 = Infinity
    let x1 = -Infinity
    let y0 = Infinity
    let y1 = -Infinity
    let z0 = Infinity
    let z1 = -Infinity
    for (const x of [lo[0], hi[0]])
      for (const y of [lo[1], hi[1]])
        for (const z of [lo[2], hi[2]]) {
          const p = projecteer(zicht, [x, y, z])
          x0 = Math.min(x0, p[0])
          x1 = Math.max(x1, p[0])
          y0 = Math.min(y0, p[1])
          y1 = Math.max(y1, p[1])
          z0 = Math.min(z0, p[2])
          z1 = Math.max(z1, p[2])
        }
    const m = 0.3
    const dichtbij = -z1 - m
    const ver = -z0 + m
    const proj = orthografisch(x0 - m, x1 + m, y0 - m, y1 + m, dichtbij, ver)
    return { mat: vermenigvuldig(proj, zicht), diepte: ver - dichtbij, texelM: Math.max(x1 - x0, y1 - y0) / 1024 }
  }

  /**
   * Het masker van een doel op volle doelmaat b×h, per tegel ([x, y, w, h] in
   * texels): 26 richtingen met MAX, dan MIN/MAX van de plek, samengevoegd in
   * `doelTex`. De hulpdoelen zijn zo groot als een tegel (bij de export 2048²).
   */
  rekenMasker(
    doek: Doek,
    doelTex: WebGLTexture,
    b: number,
    h: number,
    tegels: Array<[number, number, number, number]>,
    /** Voor de proef: de MIN- en MAX-plek van de (enige) tegel uitlezen. */
    plekUit?: { min?: Uint8Array; max?: Uint8Array }
  ): void {
    const gl = this.gl
    this.staatSchoon()
    const s = this.tekenaar.scene!
    const dk = this.dieptekaarten()
    const tw = Math.max(...tegels.map((t) => t[2]))
    const th = Math.max(...tegels.map((t) => t[3]))
    const ruw = this.maakTex(gl.RGBA8, tw, th)
    const min = this.maakTex(gl.RGBA8, tw, th)
    const max = this.maakTex(gl.RGBA8, tw, th)
    const fbRuw = gl.createFramebuffer()!
    const fbMin = gl.createFramebuffer()!
    const fbMax = gl.createFramebuffer()!
    this.hang(fbRuw, ruw)
    // Een stencil bij `ruw`: een texel die in een richting "buiten" bleek, slaan de volgende richtingen over.
    const stencil = gl.createRenderbuffer()!
    gl.bindRenderbuffer(gl.RENDERBUFFER, stencil)
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.STENCIL_INDEX8, tw, th)
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbRuw)
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.STENCIL_ATTACHMENT, gl.RENDERBUFFER, stencil)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    this.hang(fbMin, min)
    this.hang(fbMax, max)
    const fbDoel = gl.createFramebuffer()!
    this.hang(fbDoel, doelTex)
    const richtingen = RICHTINGEN.map((d) => ({ d, ...this.richtingMat(s, d) }))
    const doosMin = s.manifest.doos.min
    // Alle assen gedeeld door de grootste maat (§4.3: ≈ 5 cm per stap van UNORM8). Per as apart was 1 cm per stap in
    // de breedte, en dan telde elke binnenhuid met dezelfde uv 3-5 cm achter de buitenhuid als "gedeeld" (SD77: 89%).
    const grootste = Math.max(1e-3, ...[0, 1, 2].map((k) => s.manifest.doos.max[k] - s.manifest.doos.min[k]))
    const doosMaat = [grootste, grootste, grootste]
    for (const [x, y, w, hh] of tegels) {
      // Een tegel rekent met DEZELFDE omzetting als het hele doel (uTegel 0,0,1,1 en een viewport van b×h),
      // alleen verschoven met (-x, -y): zo zijn de gedekte texels en hun waarden precies die van één keer
      // (P6). Met een eigen schaal per tegel verschilden randtexels door afronding (47 bytes op de HH20).
      const tegelU = [0, 0, 1, 1]
      gl.disable(gl.CULL_FACE)
      gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE)
      gl.disable(gl.POLYGON_OFFSET_FILL)
      gl.colorMask(true, true, true, true)
      for (const [fb, c] of [[fbRuw, 0], [fbMin, 1], [fbMax, 0]] as Array<[WebGLFramebuffer, number]>) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
        gl.viewport(0, 0, tw, th)
        gl.clearColor(c, c, c, 0)
        gl.clearStencil(0)
        gl.clear(gl.COLOR_BUFFER_BIT | (fb === fbRuw ? gl.STENCIL_BUFFER_BIT : 0))
      }
      const pr = this.progs.masker
      // Eerst G (glas), B (driehoek zonder glas) en A (gedekt): die hangen niet van de richting af.
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbRuw)
      gl.viewport(-x, -y, b, h)
      gl.enable(gl.BLEND)
      gl.blendEquation(gl.MAX)
      gl.useProgram(pr.prog)
      gl.uniform4fv(pr.u.uTegel, tegelU)
      gl.uniform1i(pr.u.uRichtingGang, 0)
      gl.uniform1i(pr.u.uLijn, 0)
      this.bindTex(0, this.leeg, pr.u.uDicht)
      this.bindTex(1, this.leeg, pr.u.uDoor)
      this.tekenNet(doek.net, true, () => gl.uniform1i(pr.u.uLijn, 1))
      for (const r of richtingen) {
        // De twee dieptekaarten (bij meer tegels telkens opnieuw: 8 MB in plaats van 52 kaarten tegelijk).
        gl.disable(gl.BLEND)
        gl.enable(gl.DEPTH_TEST)
        gl.depthFunc(gl.LESS)
        gl.depthMask(true)
        gl.viewport(0, 0, dk.maat, dk.maat)
        for (const [fb, door] of [[dk.fbDicht, false], [dk.fbDoor, true]] as Array<[WebGLFramebuffer, boolean]>) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
          gl.clearDepth(1)
          gl.clear(gl.DEPTH_BUFFER_BIT)
          this.tekenDiepte(s, r.mat, door)
        }
        gl.disable(gl.DEPTH_TEST)
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbRuw)
        gl.viewport(-x, -y, b, h)
        // Alleen R, en alleen waar de stencil nog 0 is; een texel die buiten blijkt, krijgt stencil 1.
        gl.disable(gl.BLEND)
        gl.colorMask(true, false, false, false)
        gl.enable(gl.STENCIL_TEST)
        gl.stencilFunc(gl.NOTEQUAL, 1, 0xff)
        gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE)
        gl.stencilMask(0xff)
        gl.useProgram(pr.prog)
        gl.uniform4fv(pr.u.uTegel, tegelU)
        gl.uniform1i(pr.u.uRichtingGang, 1)
        gl.uniformMatrix4fv(pr.u.uRichting, false, r.mat)
        gl.uniform3fv(pr.u.uKijk, [r.d[0], r.d[1], r.d[2]])
        gl.uniform1f(pr.u.uDiepte, r.diepte)
        gl.uniform1f(pr.u.uTexelM, r.texelM)
        this.bindTex(0, dk.dicht, pr.u.uDicht)
        this.bindTex(1, dk.door, pr.u.uDoor)
        this.tekenNet(doek.net)
        gl.disable(gl.STENCIL_TEST)
        gl.colorMask(true, true, true, true)
      }
      const pp = this.progs.plek
      gl.useProgram(pp.prog)
      gl.uniform4fv(pp.u.uTegel, tegelU)
      gl.uniform3fv(pp.u.uDoosMin, doosMin)
      gl.uniform3fv(pp.u.uDoosMaat, doosMaat)
      gl.enable(gl.BLEND)
      for (const [fb, eq] of [[fbMin, gl.MIN], [fbMax, gl.MAX]] as Array<[WebGLFramebuffer, number]>) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
        gl.viewport(-x, -y, b, h)
        gl.blendEquation(eq)
        this.tekenNet(doek.net)
      }
      gl.blendEquation(gl.FUNC_ADD)
      gl.disable(gl.BLEND)
      if (plekUit) {
        plekUit.min = new Uint8Array(w * hh * 4)
        plekUit.max = new Uint8Array(w * hh * 4)
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbMin)
        gl.readPixels(0, 0, w, hh, gl.RGBA, gl.UNSIGNED_BYTE, plekUit.min)
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbMax)
        gl.readPixels(0, 0, w, hh, gl.RGBA, gl.UNSIGNED_BYTE, plekUit.max)
      }
      // Samenvoegen in het masker, op de plek van de tegel.
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbDoel)
      gl.viewport(x, y, w, hh)
      const ps = this.progs.maskerSamen
      gl.useProgram(ps.prog)
      this.bindTex(0, ruw, ps.u.uRuw)
      this.bindTex(1, min, ps.u.uMin)
      this.bindTex(2, max, ps.u.uMax)
      gl.uniform2i(ps.u.uBegin, x, y)
      gl.bindVertexArray(this.leegVao)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      gl.bindVertexArray(null)
    }
    for (const t of [ruw, min, max]) gl.deleteTexture(t)
    for (const f of [fbRuw, fbMin, fbMax, fbDoel]) gl.deleteFramebuffer(f)
    gl.deleteRenderbuffer(stencil)
    this.herstelStaat()
  }

  private tekenNet(net: Laknet, lijnen = true, voorLijnen?: () => void): void {
    const gl = this.gl
    gl.bindVertexArray(net.vao)
    gl.drawArrays(gl.TRIANGLES, 0, net.n)
    if (lijnen) {
      voorLijnen?.()
      gl.bindVertexArray(net.lijnVao)
      gl.drawElements(gl.LINES, net.nLijnen, gl.UNSIGNED_INT, 0)
    }
    gl.bindVertexArray(null)
  }

  private bindTex(eenheid: number, tex: WebGLTexture, loc: WebGLUniformLocation | null, soort?: number): void {
    const gl = this.gl
    gl.activeTexture(gl.TEXTURE0 + eenheid)
    gl.bindSampler(eenheid, null)
    gl.bindTexture(soort ?? gl.TEXTURE_2D, tex)
    gl.uniform1i(loc, eenheid)
  }

  /**
   * Vóór elke eigen gang: de staat die de tekenaar na een beeld laat staan
   * (CULL_FACE aan met frontFace CW, DEPTH_TEST aan, ...) uit. Zonder dit viel
   * de schermvullende driehoek van het uitvloeien weg zodra er tussen twee
   * tegels een beeld getekend was (tijdens het wachten op de PBO), en kreeg elke
   * tegel de inhoud van de eerste.
   */
  private staatSchoon(): void {
    const gl = this.gl
    gl.disable(gl.BLEND)
    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.CULL_FACE)
    gl.disable(gl.SCISSOR_TEST)
    gl.disable(gl.STENCIL_TEST)
    gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE)
    gl.disable(gl.POLYGON_OFFSET_FILL)
    gl.frontFace(gl.CCW)
    gl.colorMask(true, true, true, true)
    gl.depthMask(true)
    gl.blendEquation(gl.FUNC_ADD)
    gl.blendFunc(gl.ONE, gl.ZERO)
  }

  /** Na elke eigen gang: niets achterlaten dat de tekenaar niet zelf zet. */
  private herstelStaat(): void {
    const gl = this.gl
    gl.disable(gl.SCISSOR_TEST)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.disable(gl.BLEND)
    gl.blendEquation(gl.FUNC_ADD)
    gl.blendFunc(gl.ONE, gl.ZERO)
    gl.bindVertexArray(null)
    gl.activeTexture(gl.TEXTURE0)
    for (let i = 0; i < 12; i++) gl.bindSampler(i, null)
  }

  /** Gedekt en gedeeld tellen (één keer uitlezen, het masker blijft op de processor voor het aanwijzen). */
  private telMasker(doek: Doek): void {
    const gl = this.gl
    const fb = gl.createFramebuffer()!
    this.hang(fb, doek.masker)
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
    const px = new Uint8Array(doek.editB * doek.editH * 4)
    gl.readPixels(0, 0, doek.editB, doek.editH, gl.RGBA, gl.UNSIGNED_BYTE, px)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.deleteFramebuffer(fb)
    let gedekt = 0
    let gedeeld = 0
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] > 127) {
        gedekt++
        if (px[i + 2] > 127) gedeeld++
      }
    }
    doek.maskerBytes = px
    doek.gedekt = gedekt / (px.length / 4)
    doek.gedeeld = gedekt ? gedeeld / gedekt : 0
  }

  /** De kleurzones uit de detailbron op 1/8, alleen texels die gelakt mogen worden (§4.3). */
  private rekenZones(doek: Doek): Zone[] {
    const gl = this.gl
    this.staatSchoon()
    const b = Math.max(16, Math.round(doek.doel.uitB / 8))
    const h = Math.max(16, Math.round(doek.doel.uitH / 8))
    const tex = this.maakTex(gl.RGBA8, b, h)
    const fb = gl.createFramebuffer()!
    this.hang(fb, tex)
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
    gl.viewport(0, 0, b, h)
    const pr = this.progs.klein
    gl.useProgram(pr.prog)
    this.bindTex(0, doek.basis, pr.u.uBron)
    this.bindTex(1, doek.masker, pr.u.uMasker)
    gl.uniform2f(pr.u.uMaat, b, h)
    gl.bindVertexArray(this.leegVao)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    const px = new Uint8Array(b * h * 4)
    gl.readPixels(0, 0, b, h, gl.RGBA, gl.UNSIGNED_BYTE, px)
    gl.deleteFramebuffer(fb)
    gl.deleteTexture(tex)
    this.herstelStaat()
    const uit = zonesVan(px)
    doek.ms.kmeans = Math.round(uit.ms)
    return uit.zones
  }

  /** Het zaad van het uitvloeien (JFA) voor een masker; de uitvoer mag groter zijn dan het masker. */
  private rekenZaad(masker: WebGLTexture, mb: number, mh: number, doel: WebGLTexture, b: number, h: number): void {
    const gl = this.gl
    this.staatSchoon()
    const a = this.maakTex(gl.RG16UI, b, h)
    const fbA = gl.createFramebuffer()!
    const fbD = gl.createFramebuffer()!
    this.hang(fbA, a)
    this.hang(fbD, doel)
    gl.disable(gl.BLEND)
    gl.viewport(0, 0, b, h)
    gl.bindVertexArray(this.leegVao)
    // Zaad in `doel`, dan heen en weer.
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbD)
    const pz = this.progs.zaad
    gl.useProgram(pz.prog)
    this.bindTex(0, masker, pz.u.uMasker)
    gl.uniform2f(pz.u.uSchaal, mb / b, mh / h)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    const ps = this.progs.sprong
    gl.useProgram(ps.prog)
    let stap = 1 << Math.ceil(Math.log2(Math.max(b, h)))
    let vanD = true
    while ((stap >>= 1) >= 1) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, vanD ? fbA : fbD)
      this.bindTex(0, vanD ? doel : a, ps.u.uVorig)
      gl.uniform1i(ps.u.uStap, stap)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      vanD = !vanD
    }
    if (!vanD) {
      // Het laatste staat in `a`: terug naar `doel`.
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbD)
      this.bindTex(0, a, ps.u.uVorig)
      gl.uniform1i(ps.u.uStap, 1)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }
    gl.deleteFramebuffer(fbA)
    gl.deleteFramebuffer(fbD)
    gl.deleteTexture(a)
    this.herstelStaat()
  }

  /**
   * Andere busopties (§4.9): de tekenaar heeft een nieuwe ruststand, dus andere
   * meshes in beeld; het masker (buiten, gedeeld) en het zaad opnieuw. De zones
   * hangen alleen van de basis af en blijven. Geeft de tijd (P16: ≤ 300 ms met de
   * nieuwe ruststand erbij).
   */
  maskersOpnieuw(): { ms: number; laknet: number } {
    const t0 = performance.now()
    const s = this.tekenaar.scene
    let laknet = 0
    for (const d of this.doeken) {
      // Andere meshes in beeld: een nieuw laknet (alleen wat nu zichtbaar is).
      const tl = performance.now()
      const net = s && this.hoekpunten ? this.bouwLaknet(s, this.hoekpunten, d.plek) : undefined
      laknet += performance.now() - tl
      if (net) {
        this.gl.deleteVertexArray(d.net.vao)
        this.gl.deleteVertexArray(d.net.lijnVao)
        this.gl.deleteBuffer(d.net.vb)
        this.gl.deleteBuffer(d.net.lijnen)
        d.net = net
      }
      this.rekenMasker(d, d.masker, d.editB, d.editH, [[0, 0, d.editB, d.editH]])
      this.telMasker(d)
      this.rekenZaad(d.masker, d.editB, d.editH, d.zaad, d.editB, d.editH)
    }
    this.wachtGpu()
    this.vuil = true
    return { ms: Math.round(performance.now() - t0), laknet: Math.round(laknet) }
  }

  /* ------------------------------------------------------------------ de lagen */

  /** De lagenstapel (`lakLagen`): alleen onthouden; samengesteld bij het volgende beeld (`werk`). */
  zetLagen(lagen: Laag[], spiegel?: { aan: boolean; vlakX?: number }): void {
    this.lagen = lagen
    if (spiegel) this.spiegel = { aan: spiegel.aan, vlakX: spiegel.vlakX ?? this.spiegel.vlakX }
    this.vuil = true
  }

  zetBeeld(id: string, beeld: ImageBitmap): void {
    this.beelden.get(id)?.close()
    this.beelden.set(id, beeld)
    this.decals = undefined
    this.vuil = true
  }

  /** Voor de meting van het slepen (P3): de lagen iets verschuiven, zodat alles opnieuw moet. */
  duw(): void {
    this.lagen = this.lagen.map((l) => (l.soort === 'strook' ? { ...l, h2: l.h2 + (Math.random() - 0.5) * 0.01 } : l.soort === 'tekst' || l.soort === 'afbeelding' || l.soort === 'vorm' ? { ...l, plaats: { ...l.plaats, midden: [l.plaats.midden[0], l.plaats.midden[1], l.plaats.midden[2] + (Math.random() - 0.5) * 0.02] as [number, number, number] } } : l))
    this.vuil = true
  }

  toonMaskerAan(aan: boolean): void {
    this.toonMasker = aan
    this.vuil = true
  }

  /** De lagen met hun spiegelkopieën, zoals de shader ze krijgt (§4.8). */
  private uitgeschreven(): Array<Laag & { spiegelBeeld?: boolean }> {
    const uit: Array<Laag & { spiegelBeeld?: boolean }> = []
    for (const l of this.lagen) {
      if (!l.zichtbaar) continue
      uit.push(l)
      if (!this.spiegel.aan || !('plaats' in l)) continue
      const s = spiegelPlaats((l as { plaats: Plaats }).plaats, this.spiegel.vlakX)
      if (!s) continue
      uit.push({ ...l, id: `${l.id}'`, plaats: s.plaats, spiegelBeeld: l.soort === 'tekst' ? false : s.spiegelBeeld } as Laag & { spiegelBeeld?: boolean })
    }
    return uit.slice(0, MAX_LAGEN)
  }

  /** De decal-array: één laag van 1024×512 per tekst, afbeelding of vorm; alleen opnieuw als er een andere bij kwam. */
  private decalArray(lagen: Laag[]): Map<string, number> {
    const gl = this.gl
    const sleutel = (l: Laag): string | undefined =>
      l.soort === 'tekst'
        ? `t|${l.tekst}|${l.lettertype}|${l.kleur}|${l.omlijning?.kleur ?? ''}|${l.omlijning?.breedteCm ?? 0}|${l.letterafstand ?? 0}`
        : l.soort === 'afbeelding'
          ? `a|${l.beeld}|${l.witDoorzichtig ? 1 : 0}`
          : l.soort === 'vorm'
            ? `v|${l.vorm}`
            : undefined
    const sleutels = [...new Set(lagen.map(sleutel).filter((s): s is string => Boolean(s)))]
    const plek = new Map(sleutels.map((s, i) => [s, i]))
    if (this.decals && this.decals.sleutels.join('\n') === sleutels.join('\n')) return plek
    if (this.decals) gl.deleteTexture(this.decals.tex)
    this.decals = undefined
    if (sleutels.length === 0) return plek
    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex)
    // SRGB8_ALPHA8: de GPU maakt de kleur van een afbeelding lineair (de shader hoeft geen pow per laag).
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.SRGB8_ALPHA8, DECAL_B, DECAL_H, sleutels.length)
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    const doek = new OffscreenCanvas(DECAL_B, DECAL_H)
    const ctx = doek.getContext('2d', { willReadFrequently: true })!
    for (const [i, s] of sleutels.entries()) {
      ctx.clearRect(0, 0, DECAL_B, DECAL_H)
      const l = lagen.find((x) => sleutel(x) === s)!
      tekenDecal(ctx, l, this.beelden)
      const data = ctx.getImageData(0, 0, DECAL_B, DECAL_H)
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, DECAL_B, DECAL_H, 1, gl.RGBA, gl.UNSIGNED_BYTE, data.data)
    }
    this.decals = { tex, lagen: sleutels.length, sleutels }
    return plek
  }

  /** De uniforms van de lagen (zie lakshaders.ts): vier vec4 per laag. */
  private laagBlok(doek: Doek): { blok: Float32Array; aantal: number } {
    const lagen = this.uitgeschreven()
    const decal = this.decalArray(lagen)
    const blok = new Float32Array(MAX_LAGEN * 16)
    const s = this.tekenaar.scene!
    const zmid = (s.manifest.doos.min[2] + s.manifest.doos.max[2]) / 2
    let penseel = 0
    lagen.forEach((l, i) => {
      const o = i * 16
      const vlag = (l.ookOverRubbers ? 1 : 0) | (l.soort === 'strook' && l.zijden === 'zijden' ? 2 : 0) | (l.spiegelBeeld ? 4 : 0)
      const soort = l.soort === 'zone' ? 1 : l.soort === 'strook' ? 2 : l.soort === 'penseel' ? 4 : 3
      blok.set([soort, l.dekking, l.detail, vlag], o)
      if (l.soort === 'zone') {
        blok.set([...kleurLin(l.kleur), l.straal], o + 4)
        blok.set([...l.centrum, 0], o + 8)
      } else if (l.soort === 'strook') {
        blok.set([...kleurLin(l.kleur), 0], o + 4)
        blok.set([l.h1, l.h2, Math.tan((l.hoek * Math.PI) / 180), l.golf], o + 8)
        blok.set([Math.max(0.5, (s.manifest.doos.max[2] - s.manifest.doos.min[2]) / 2), zmid, 0, 0], o + 12)
      } else if (l.soort === 'penseel') {
        blok.set([...kleurLin(l.kleur), Math.min(1, penseel++)], o + 4)
      } else {
        const p = l.plaats
        const kleur = l.soort === 'afbeelding' ? [-1, -1, -1] : kleurLin(l.kleur)
        const zijde = { L: 0, R: 1, V: 2, A: 3, D: 4 }[p.zijde]
        const hoek = (p.draai * Math.PI) / 180
        const k = decal.get(
          l.soort === 'tekst'
            ? `t|${l.tekst}|${l.lettertype}|${l.kleur}|${l.omlijning?.kleur ?? ''}|${l.omlijning?.breedteCm ?? 0}|${l.letterafstand ?? 0}`
            : l.soort === 'afbeelding'
              ? `a|${l.beeld}|${l.witDoorzichtig ? 1 : 0}`
              : `v|${l.vorm}`
        ) ?? 0
        const hoogte = l.soort === 'tekst' ? (l.hoogteCm / 100) * 1.35 : p.breedteM * (DECAL_H / DECAL_B)
        const breedte = l.soort === 'tekst' ? Math.max(p.breedteM, 0.01) : p.breedteM
        blok.set([...kleur, k], o + 4)
        blok.set([...p.midden, breedte], o + 8)
        blok.set([zijde, Math.cos(hoek), Math.sin(hoek), hoogte], o + 12)
      }
    })
    void doek
    return { blok, aantal: lagen.length }
  }

  /** Alle uniforms en texturen van het samenstellen op een programma. */
  private zetSamenstel(pr: { prog: WebGLProgram; u: Record<string, WebGLUniformLocation | null> }, doek: Doek, blok: Float32Array, aantal: number, tegel: [number, number, number, number], maat: [number, number]): void {
    const gl = this.gl
    const s = this.tekenaar.scene!
    gl.useProgram(pr.prog)
    gl.uniform4fv(pr.u.uLagen, blok)
    gl.uniform1i(pr.u.uAantal, aantal)
    gl.uniform4fv(pr.u.uTegel, [tegel[0], tegel[1], 1 / tegel[2], 1 / tegel[3]])
    gl.uniform2f(pr.u.uMaat, maat[0], maat[1])
    gl.uniform3fv(pr.u.uDoosMin, s.manifest.doos.min)
    gl.uniform3fv(pr.u.uDoosMax, s.manifest.doos.max)
    const z = new Float32Array(32)
    doek.zones.slice(0, 8).forEach((zone, i) => z.set([...zone.lab, zone.lak ? 1 : 0], i * 4))
    gl.uniform4fv(pr.u.uZones, z)
    gl.uniform1i(pr.u.uZoneAantal, Math.min(8, doek.zones.length))
    gl.uniform1i(pr.u.uSjabloon, doek.sjabloon ? 1 : 0)
    this.bindTex(0, doek.sjabloon?.bs ?? doek.basis, pr.u.uBasis)
    this.bindTex(1, doek.basis, pr.u.uDetail)
    this.bindTex(2, doek.basis, pr.u.uAlfaBron)
    this.bindTex(3, doek.masker, pr.u.uMasker)
    this.bindTex(4, doek.sjabloon?.ma ?? this.leeg, pr.u.uSjabloonMA)
    this.bindTex(5, doek.sjabloon?.ad ?? this.leeg, pr.u.uSjabloonAD)
    this.bindTex(6, doek.sjabloon?.mu ?? this.leeg, pr.u.uSjabloonMU)
    this.bindTex(7, this.decals?.tex ?? this.leegArray, pr.u.uDecals, gl.TEXTURE_2D_ARRAY)
    this.bindTex(8, doek.penseel[0]?.tex ?? this.leeg, pr.u.uPenseel0)
    this.bindTex(9, doek.penseel[1]?.tex ?? this.leeg, pr.u.uPenseel1)
    this.bindTex(10, doek.dekking?.tex ?? this.leegArray, pr.u.uDekking, gl.TEXTURE_2D_ARRAY)
  }

  /**
   * Eén doel samenstellen in `ruwFb` (een doel van de hele maat `maat`), per
   * tegel [x, y, w, h] als viewport: gl_FragCoord telt dan vanaf het doel, en
   * elke texel wordt precies zo gerekend als in één keer (P6). Met beide paden;
   * uitvloeien komt daarna.
   */
  private stelSamen(doek: Doek, ruwFb: WebGLFramebuffer, maat: [number, number], tegels: Array<[number, number, number, number]>): void {
    const gl = this.gl
    this.staatSchoon()
    const { blok, aantal } = this.laagBlok(doek)
    const apart = doek.gedeeld >= 0.01 && aantal > 0
    const groepen = Math.ceil(aantal / 4)
    const tw = Math.max(...tegels.map((t) => t[2]))
    const th = Math.max(...tegels.map((t) => t[3]))
    if (apart && (!doek.dekking || doek.dekking.lagen < groepen || doek.dekking.b !== tw || doek.dekking.h !== th)) {
      if (doek.dekking) gl.deleteTexture(doek.dekking.tex)
      const tex = gl.createTexture()!
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex)
      gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, tw, th, groepen)
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
      doek.dekking = { tex, lagen: groepen, b: tw, h: th }
    }
    for (const [x, y, w, h] of tegels) {
      const tegel: [number, number, number, number] = [0, 0, 1, 1]
      gl.bindFramebuffer(gl.FRAMEBUFFER, ruwFb)
      gl.viewport(0, 0, maat[0], maat[1])
      gl.enable(gl.SCISSOR_TEST)
      gl.scissor(x, y, w, h)
      gl.disable(gl.BLEND)
      gl.disable(gl.DEPTH_TEST)
      gl.disable(gl.CULL_FACE)
      gl.colorMask(true, true, true, true)
      // De basis overal (voor wat geen driehoek heeft), dan de lagen over het laknet.
      const pk = this.progs.kopie
      gl.useProgram(pk.prog)
      this.bindTex(0, this.testAchtergrond ?? doek.sjabloon?.bs ?? doek.basis, pk.u.uBron)
      gl.uniform2f(pk.u.uMaat, maat[0], maat[1])
      gl.bindVertexArray(this.leegVao)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      const ps = this.progs.samenstel
      this.zetSamenstel(ps, doek, blok, aantal, tegel, maat)
      gl.uniform1i(ps.u.uGedeeldApart, apart ? 1 : 0)
      this.tekenNet(doek.net)
      if (!apart || !doek.dekking) continue
      // Pad 2: de dekkingen per 4 lagen met MAX (tegelgroot), dan schermvullend op de gedeelde texels.
      const fb = gl.createFramebuffer()!
      const pd = this.progs.dekking
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
      // De dekkingen zijn tegelgroot: dezelfde omzetting als het hele doel, verschoven (dan precies dezelfde texels).
      gl.disable(gl.SCISSOR_TEST)
      for (let g = 0; g < groepen; g++) {
        gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, doek.dekking.tex, 0, g)
        gl.viewport(-x, -y, maat[0], maat[1])
        gl.clearColor(0, 0, 0, 0)
        gl.clear(gl.COLOR_BUFFER_BIT)
        gl.enable(gl.BLEND)
        gl.blendEquation(gl.MAX)
        this.zetSamenstel(pd, doek, blok, aantal, tegel, maat)
        gl.uniform1i(pd.u.uEerste, g * 4)
        this.tekenNet(doek.net, false)
      }
      gl.disable(gl.BLEND)
      gl.blendEquation(gl.FUNC_ADD)
      gl.deleteFramebuffer(fb)
      gl.bindFramebuffer(gl.FRAMEBUFFER, ruwFb)
      gl.viewport(x, y, w, h)
      gl.enable(gl.SCISSOR_TEST)
      const pg = this.progs.gedeeld
      this.zetSamenstel(pg, doek, blok, aantal, tegel, maat)
      gl.uniform2i(pg.u.uBegin, x, y)
      gl.bindVertexArray(this.leegVao)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }
    this.herstelStaat()
  }

  /** Uitvloeien (§4.7): `ruw` en het zaad op volle maat, het doel een tegel die op `begin` begint. */
  private vul(ruw: WebGLTexture, zaad: WebGLTexture, doelFb: WebGLFramebuffer, b: number, h: number, begin: [number, number], alfa: WebGLTexture): void {
    const gl = this.gl
    this.staatSchoon()
    gl.bindFramebuffer(gl.FRAMEBUFFER, doelFb)
    gl.viewport(0, 0, b, h)
    const pv = this.progs.vul
    gl.useProgram(pv.prog)
    this.bindTex(0, ruw, pv.u.uRuw)
    this.bindTex(1, zaad, pv.u.uZaad)
    this.bindTex(2, alfa, pv.u.uAlfa)
    gl.uniform2i(pv.u.uBegin, begin[0], begin[1])
    gl.bindVertexArray(this.leegVao)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    this.herstelStaat()
  }

  /**
   * Het werk vóór een beeld: is er iets veranderd, dan elk doel opnieuw
   * samenstellen, uitvloeien en mips. Geeft true als er iets gebeurde.
   */
  werk(): boolean {
    if (!this.vuil || this.doeken.length === 0) return false
    this.vuil = false
    const gl = this.gl
    const t0 = performance.now()
    for (const d of this.doeken) {
      if (this.toonMasker) {
        this.staatSchoon()
        gl.bindFramebuffer(gl.FRAMEBUFFER, d.resultaatFb)
        gl.viewport(0, 0, d.editB, d.editH)
        const pt = this.progs.toon
        gl.useProgram(pt.prog)
        this.bindTex(0, d.masker, pt.u.uMasker)
        gl.uniform2f(pt.u.uMaat, d.editB, d.editH)
        gl.bindVertexArray(this.leegVao)
        gl.drawArrays(gl.TRIANGLES, 0, 3)
        this.herstelStaat()
      } else {
        this.stelSamen(d, d.ruwFb, [d.editB, d.editH], [[0, 0, d.editB, d.editH]])
        this.vul(d.ruw, d.zaad, d.resultaatFb, d.editB, d.editH, [0, 0], d.basis)
      }
      gl.bindTexture(gl.TEXTURE_2D, d.resultaat)
      gl.generateMipmap(gl.TEXTURE_2D)
    }
    // Wachten tot de GPU klaar is alleen tijdens een meting (P3): anders geen stilstand per beeld.
    if (this.meten) this.wachtGpu()
    const ms = performance.now() - t0
    this.metingen.samenstellen.push(ms)
    if (this.metingen.samenstellen.length > 120) this.metingen.samenstellen.shift()
    return true
  }

  /* ------------------------------------------------------------------ penseel (§4.8) */

  /**
   * Een streek op een penseellaag: dieptebeeld van de camera (de dieptetoets:
   * niets door de bus heen), dan per 64 stippen één UV-gang over het laknet.
   */
  streek(laagIndex: number, streek: { punten: number[]; straalCm: number; hardheid: number; dekking: number; gum: boolean; camera: number[]; kleur: string }): void {
    const gl = this.gl
    this.staatSchoon()
    const s = this.tekenaar.scene
    if (!s) return
    const cam = new Float32Array(streek.camera)
    const maat = 1024
    const diepte = this.maakTex(gl.DEPTH_COMPONENT32F, maat, maat)
    const fbD = gl.createFramebuffer()!
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbD)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, diepte, 0)
    gl.drawBuffers([gl.NONE])
    gl.viewport(0, 0, maat, maat)
    gl.enable(gl.DEPTH_TEST)
    gl.depthFunc(gl.LESS)
    gl.depthMask(true)
    gl.clearDepth(1)
    gl.clear(gl.DEPTH_BUFFER_BIT)
    this.tekenDiepte(s, cam, false)
    this.tekenDiepte(s, cam, true)
    gl.disable(gl.DEPTH_TEST)
    for (const d of this.doeken) {
      while (d.penseel.length <= laagIndex) {
        const tex = this.maakTex(gl.RGBA8, d.editB, d.editH)
        const fb = gl.createFramebuffer()!
        this.hang(fb, tex)
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
        gl.clearColor(0, 0, 0, 0)
        gl.clear(gl.COLOR_BUFFER_BIT)
        d.penseel.push({ tex, fb, sleutel: '' })
      }
      const p = d.penseel[laagIndex]
      gl.bindFramebuffer(gl.FRAMEBUFFER, p.fb)
      gl.viewport(0, 0, d.editB, d.editH)
      gl.enable(gl.BLEND)
      if (streek.gum) gl.blendFuncSeparate(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE_MINUS_SRC_ALPHA)
      else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
      const pr = this.progs.penseel
      gl.useProgram(pr.prog)
      gl.uniform4fv(pr.u.uTegel, [0, 0, 1, 1])
      gl.uniformMatrix4fv(pr.u.uCamera, false, cam)
      this.bindTex(0, diepte, pr.u.uCameraDiepte)
      const k = kleurLin(streek.kleur).map((c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055))
      gl.uniform4f(pr.u.uKleur, k[0], k[1], k[2], streek.dekking)
      gl.uniform1f(pr.u.uHardheid, Math.min(0.99, streek.hardheid))
      gl.uniform1i(pr.u.uGum, streek.gum ? 1 : 0)
      const n = streek.punten.length / 3
      for (let i = 0; i < n; i += 64) {
        const stippen = new Float32Array(64 * 4)
        const m = Math.min(64, n - i)
        for (let j = 0; j < m; j++) stippen.set([streek.punten[(i + j) * 3], streek.punten[(i + j) * 3 + 1], streek.punten[(i + j) * 3 + 2], streek.straalCm / 100], j * 4)
        gl.uniform4fv(pr.u.uStippen, stippen)
        gl.uniform1i(pr.u.uStipAantal, m)
        this.tekenNet(d.net, false)
      }
    }
    gl.deleteFramebuffer(fbD)
    gl.deleteTexture(diepte)
    this.herstelStaat()
    this.vuil = true
  }

  /* ------------------------------------------------------------------ aanwijzen (§4.2) */

  private pick?: { fb: WebGLFramebuffer; a: WebGLTexture; b: WebGLTexture; d: WebGLRenderbuffer }

  /** Wat er onder de cursor ligt (NDC x, y in de camera `beeldProj`). */
  kies(beeldProj: Mat4, x: number, y: number, b: number, h: number): LakKeuze {
    const gl = this.gl
    this.staatSchoon()
    const s = this.tekenaar.scene
    if (!s) return { glas: false, gedeeld: false, onderdeel: false, deur: false, lak: false }
    if (!this.pick) {
      const maak = (): WebGLTexture => {
        const t = gl.createTexture()!
        gl.bindTexture(gl.TEXTURE_2D, t)
        gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32UI, 1, 1)
        return t
      }
      const a = maak()
      const bt = maak()
      const d = gl.createRenderbuffer()!
      gl.bindRenderbuffer(gl.RENDERBUFFER, d)
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, 1, 1)
      const fb = gl.createFramebuffer()!
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, a, 0)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, bt, 0)
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, d)
      this.pick = { fb, a, b: bt, d }
    }
    // Een smalle projectie rond de cursor: die ene pixel wordt het hele doel.
    const smal = new Float32Array(16)
    smal[0] = b
    smal[5] = h
    smal[10] = 1
    smal[15] = 1
    smal[12] = -x * b
    smal[13] = -y * h
    const mat = vermenigvuldig(smal, beeldProj)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.pick.fb)
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1])
    gl.viewport(0, 0, 1, 1)
    gl.clearBufferuiv(gl.COLOR, 0, [0, 0, 0xffffffff, 0xffffffff])
    gl.clearBufferuiv(gl.COLOR, 1, [0, 0, 0, 0])
    gl.clearDepth(1)
    gl.clear(gl.DEPTH_BUFFER_BIT)
    gl.enable(gl.DEPTH_TEST)
    gl.depthFunc(gl.LEQUAL)
    gl.depthMask(true)
    gl.disable(gl.BLEND)
    gl.disable(gl.CULL_FACE)
    const pr = this.progs.pick
    gl.useProgram(pr.prog)
    gl.uniformMatrix4fv(pr.u.uMat, false, mat)
    gl.uniform1i(pr.u.uLaknet, 0)
    gl.bindVertexArray(s.vao)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, s.ibSamen)
    for (const bt of [...s.dicht, ...s.test]) gl.drawElements(gl.TRIANGLES, bt.aantal, gl.UNSIGNED_INT, bt.begin * 4)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, s.ibAlle)
    for (const bt of s.meng.flat()) gl.drawElements(gl.TRIANGLES, bt.aantal, gl.UNSIGNED_INT, bt.begin * 4)
    gl.uniform1i(pr.u.uLaknet, 1)
    for (const [i, d] of this.doeken.entries()) {
      gl.uniform1i(pr.u.uDoel, i)
      gl.bindVertexArray(d.net.vao)
      gl.drawArrays(gl.TRIANGLES, 0, d.net.n)
    }
    const a = new Uint32Array(4)
    const c = new Uint32Array(4)
    gl.readBuffer(gl.COLOR_ATTACHMENT0)
    gl.readPixels(0, 0, 1, 1, gl.RGBA_INTEGER, gl.UNSIGNED_INT, a)
    gl.readBuffer(gl.COLOR_ATTACHMENT1)
    gl.readPixels(0, 0, 1, 1, gl.RGBA_INTEGER, gl.UNSIGNED_INT, c)
    gl.readBuffer(gl.COLOR_ATTACHMENT0)
    gl.disable(gl.DEPTH_TEST)
    this.herstelStaat()
    const f = new Float32Array(c.buffer)
    const plek: Vec3 = [f[0], f[1], f[2]]
    const on = [(c[3] >>> 16) / 65535 * 2 - 1, (c[3] & 0xffff) / 65535 * 2 - 1]
    let n: Vec3 = [on[0], on[1], 1 - Math.abs(on[0]) - Math.abs(on[1])]
    if (n[2] < 0) n = [(1 - Math.abs(on[1])) * Math.sign(on[0]), (1 - Math.abs(on[0])) * Math.sign(on[1]), n[2]]
    n = eenheid(n)
    const doelNr = (a[0] & 255) - 1
    const vlag = (a[0] >>> 8) & 15
    if (doelNr < 0 || a[2] === 0xffffffff) {
      const iets = c[0] !== 0 || c[1] !== 0 || c[2] !== 0
      return { glas: false, gedeeld: false, onderdeel: false, deur: false, lak: false, plek: iets ? plek : undefined }
    }
    const d = this.doeken[doelNr]
    const uv: [number, number] = [new Float32Array(new Uint32Array([a[2]]).buffer)[0], new Float32Array(new Uint32Array([a[3]]).buffer)[0]]
    let gedeeld = false
    if (d.maskerBytes) {
      const px = Math.min(d.editB - 1, Math.max(0, Math.floor(uv[0] * d.editB)))
      const py = Math.min(d.editH - 1, Math.max(0, Math.floor(uv[1] * d.editH)))
      gedeeld = d.maskerBytes[(py * d.editB + px) * 4 + 2] > 127
    }
    return { doel: d.doel.id, uv, plek, normaal: n, glas: (vlag & 1) !== 0, deur: (vlag & 2) !== 0, onderdeel: (vlag & 4) !== 0, gedeeld, lak: true }
  }

  /* ------------------------------------------------------------------ export (§4.14) */

  private codeerders?: Worker[]
  private codeerWacht = new Map<number, { klaar: (b: Uint8Array) => void; fout: (e: Error) => void }>()
  private codeerVolgende = 0

  private werkers(): Worker[] {
    if (this.codeerders) return this.codeerders
    const n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 2))
    this.codeerders = Array.from({ length: n }, () => {
      const w = new Worker(new URL('./codeer.ts', import.meta.url), { type: 'module' })
      w.onmessage = (e: MessageEvent<{ id: number; blokken?: ArrayBuffer; fout?: string }>) => {
        const k = this.codeerWacht.get(e.data.id)
        if (!k) return
        this.codeerWacht.delete(e.data.id)
        if (e.data.blokken) k.klaar(new Uint8Array(e.data.blokken))
        else k.fout(new Error(e.data.fout ?? 'codeer'))
      }
      return w
    })
    return this.codeerders
  }

  /** Eén niveau coderen: banden van 64 blokrijen over de werkers, elk alleen zijn eigen rijen. */
  private async codeerNiveau(rgba: Uint8Array, b: number, h: number, f: BcFormaat): Promise<Uint8Array> {
    const rijen = Math.max(1, Math.ceil(h / 4))
    if (b * h < 256 * 256) return codeerBc(rgba, b, h, f)
    const werkers = this.werkers()
    const banden: Array<Promise<Uint8Array>> = []
    let w = 0
    for (let van = 0; van < rijen; van += 64) {
      const tot = Math.min(rijen, van + 64)
      const y0 = van * 4
      const y1 = Math.min(h, tot * 4)
      const stuk = rgba.slice(y0 * b * 4, y1 * b * 4)
      const id = ++this.codeerVolgende
      const werker = werkers[w++ % werkers.length]
      banden.push(
        new Promise((klaar, fout) => {
          this.codeerWacht.set(id, { klaar, fout })
          werker.postMessage({ id, rgba: stuk.buffer, b, h: y1 - y0, formaat: f, vanRij: 0, totRij: tot - van }, [stuk.buffer])
        })
      )
    }
    const delen = await Promise.all(banden)
    const uit = new Uint8Array(delen.reduce((s, d) => s + d.length, 0))
    let o = 0
    for (const d of delen) {
      uit.set(d, o)
      o += d.length
    }
    return uit
  }

  /** Uitlezen met een PBO (§4.14 punt 3): readPixels in een buffer, wachten op een fence, dan kopiëren. */
  private async leesPbo(fb: WebGLFramebuffer, b: number, h: number): Promise<Uint8Array> {
    const gl = this.gl
    const pbo = gl.createBuffer()!
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo)
    gl.bufferData(gl.PIXEL_PACK_BUFFER, b * h * 4, gl.STREAM_READ)
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
    gl.readPixels(0, 0, b, h, gl.RGBA, gl.UNSIGNED_BYTE, 0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    // Losmaken tijdens het wachten: tekent de werker intussen een beeld, dan mag er geen PBO hangen.
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null)
    const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)!
    gl.flush()
    for (let i = 0; i < 2000; i++) {
      const s = gl.clientWaitSync(fence, 0, 0)
      if (s === gl.ALREADY_SIGNALED || s === gl.CONDITION_SATISFIED) break
      await new Promise((k) => setTimeout(k, 2))
    }
    gl.deleteSync(fence)
    const uit = new Uint8Array(b * h * 4)
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo)
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, uit)
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null)
    gl.deleteBuffer(pbo)
    return uit
  }

  /**
   * De export van de doelen van deze bus (§4.14): het zaad op volle maat (JFA
   * over de dekking van het hele doel), het masker op volle maat in tegels, de
   * samenstelling in tegels (viewports), per tegel uitvloeien en uitlezen met een
   * PBO; mips op de processor; BC in de codeerwerkers. `tegel = 0` rekent in één
   * keer (voor P6: dan byte-gelijk op niveau 0).
   */
  async exporteer(
    opties: { tegel?: number; alleen?: string[]; voortgang?: (v: { doel: string; stap: string; deel: number }) => void; metRgba?: boolean } = {}
  ): Promise<Array<{ doel: string; dds: Uint8Array; formaat: BcFormaat; ms: Record<string, number>; rgba?: Uint8Array }>> {
    const gl = this.gl
    const uit: Array<{ doel: string; dds: Uint8Array; formaat: BcFormaat; ms: Record<string, number>; rgba?: Uint8Array }> = []
    const tegelMaat = opties.tegel ?? 2048
    for (const d of this.doeken) {
      if (opties.alleen && !opties.alleen.includes(d.doel.id)) continue
      const ms: Record<string, number> = {}
      let t = performance.now()
      const B = d.doel.uitB
      const H = d.doel.uitH
      const tegels: Array<[number, number, number, number]> = []
      const tm = tegelMaat > 0 ? tegelMaat : Math.max(B, H)
      for (let y = 0; y < H; y += tm) for (let x = 0; x < B; x += tm) tegels.push([x, y, Math.min(tm, B - x), Math.min(tm, H - y)])
      // Het masker op volle maat, per tegel.
      const masker = this.maakTex(gl.RGBA8, B, H)
      this.rekenMasker(d, masker, B, H, tegels)
      ms.masker = Math.round(performance.now() - t)
      t = performance.now()
      const zaad = this.maakTex(gl.RG16UI, B, H)
      this.rekenZaad(masker, B, H, zaad, B, H)
      ms.zaad = Math.round(performance.now() - t)
      opties.voortgang?.({ doel: d.doel.id, stap: 'samenstellen', deel: 0 })
      t = performance.now()
      // Het masker van het bewerken tijdelijk vervangen door dat op volle maat.
      const bewerkMasker = d.masker
      d.masker = masker
      const ruw = this.maakTex(gl.SRGB8_ALPHA8, B, H)
      const fbR = gl.createFramebuffer()!
      this.hang(fbR, ruw)
      this.stelSamen(d, fbR, [B, H], tegels)
      d.masker = bewerkMasker
      const rgba = new Uint8Array(B * H * 4)
      const tw = Math.max(...tegels.map((x) => x[2]))
      const th = Math.max(...tegels.map((x) => x[3]))
      const res = this.maakTex(gl.SRGB8_ALPHA8, tw, th)
      const fbU = gl.createFramebuffer()!
      this.hang(fbU, res)
      for (const [x, y, w, hh] of tegels) {
        this.vul(ruw, zaad, fbU, w, hh, [x, y], d.basis)
        const px = await this.leesPbo(fbU, w, hh)
        for (let r = 0; r < hh; r++) rgba.set(px.subarray(r * w * 4, (r + 1) * w * 4), ((y + r) * B + x) * 4)
      }
      for (const f of [fbR, fbU]) gl.deleteFramebuffer(f)
      for (const x of [ruw, res, masker, zaad]) gl.deleteTexture(x)
      ms.samenstellen = Math.round(performance.now() - t)
      // Mips en coderen: BC3 als de basis ergens alfa < 255 heeft, anders BC1 (§4.14 punt 4).
      t = performance.now()
      const formaat: BcFormaat = heeftAlfa(rgba) ? 'bc3' : 'bc1'
      const keten = mipKeten(rgba, B, H)
      ms.mips = Math.round(performance.now() - t)
      opties.voortgang?.({ doel: d.doel.id, stap: 'coderen', deel: 0.5 })
      t = performance.now()
      const niveaus: Uint8Array[] = []
      for (const n of keten) niveaus.push(await this.codeerNiveau(n.rgba, n.b, n.h, formaat))
      ms.coderen = Math.round(performance.now() - t)
      const dds = schrijfDds(B, H, formaat, niveaus)
      uit.push({ doel: d.doel.id, dds, formaat, ms, rgba: opties.metRgba ? rgba : undefined })
      opties.voortgang?.({ doel: d.doel.id, stap: 'klaar', deel: 1 })
    }
    this.herstelStaat()
    return uit
  }

  /* ------------------------------------------------------------------ voor de proef (P3-P6) */

  /**
   * P6: een felle testkleur als ACHTERGROND, d.w.z. waar geen driehoek ligt
   * (de voorvulling van het samenstellen). Na het uitvloeien mag die nergens
   * meer te zien zijn; undefined zet het terug.
   */
  private testAchtergrond?: WebGLTexture
  testBasis(kleur?: [number, number, number]): void {
    if (this.testAchtergrond) this.gl.deleteTexture(this.testAchtergrond)
    this.testAchtergrond = kleur ? this.eenKleur([kleur[0], kleur[1], kleur[2], 255]) : undefined
    this.vuil = true
  }

  private leesDoel(tex: WebGLTexture, b: number, h: number): Uint8Array {
    const gl = this.gl
    const fb = gl.createFramebuffer()!
    this.hang(fb, tex)
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
    const px = new Uint8Array(b * h * 4)
    gl.readPixels(0, 0, b, h, gl.RGBA, gl.UNSIGNED_BYTE, px)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.deleteFramebuffer(fb)
    return px
  }

  /**
   * Wat de proef op volle maat wil zien: het masker (`masker`), M en MA
   * (`effect`), de texels van gekozen tekenbeurten (`teken`, P5 NL202: de
   * stoelen), of de tijd van het samenstellen op volle maat (`tijd`, P3).
   */
  proef(o: { wat: 'masker' | 'effect' | 'teken' | 'tijd' | 'plek'; doel: string; ids?: number[]; keer?: number }): { b: number; h: number; px?: Uint8Array; ms?: Record<string, number> } | undefined {
    const gl = this.gl
    this.staatSchoon()
    const d = this.doeken.find((x) => x.doel.id === o.doel)
    if (!d) return undefined
    const B = d.doel.uitB
    const H = d.doel.uitH
    if (o.wat === 'plek') {
      // De MIN- en MAX-plek op de bewerkmaat, achter elkaar (voor het nagaan van 'gedeeld').
      const m = this.maakTex(gl.RGBA8, d.editB, d.editH)
      const uit: { min?: Uint8Array; max?: Uint8Array } = {}
      this.rekenMasker(d, m, d.editB, d.editH, [[0, 0, d.editB, d.editH]], uit)
      gl.deleteTexture(m)
      const px = new Uint8Array(d.editB * d.editH * 8)
      px.set(uit.min!, 0)
      px.set(uit.max!, d.editB * d.editH * 4)
      return { b: d.editB, h: d.editH * 2, px }
    }
    const tegels: Array<[number, number, number, number]> = []
    for (let y = 0; y < H; y += 2048) for (let x = 0; x < B; x += 2048) tegels.push([x, y, Math.min(2048, B - x), Math.min(2048, H - y)])
    if (o.wat === 'teken') {
      const s = this.tekenaar.scene!
      const keuze = new Uint8Array(Math.max(1, s.kop.vermeldingen.length))
      for (const i of o.ids ?? []) if (i >= 0 && i < keuze.length) keuze[i] = 255
      const kt = gl.createTexture()!
      gl.bindTexture(gl.TEXTURE_2D, kt)
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, keuze.length, 1, 0, gl.RED, gl.UNSIGNED_BYTE, keuze)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
      const doel = this.maakTex(gl.RGBA8, B, H)
      const fb = gl.createFramebuffer()!
      this.hang(fb, doel)
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
      gl.viewport(0, 0, B, H)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.enable(gl.BLEND)
      gl.blendEquation(gl.MAX)
      const pr = this.progs.teken
      gl.useProgram(pr.prog)
      gl.uniform4fv(pr.u.uTegel, [0, 0, 1, 1])
      this.bindTex(0, kt, pr.u.uKeuze)
      this.tekenNet(d.net, false)
      this.herstelStaat()
      const px = this.leesDoel(doel, B, H)
      gl.deleteFramebuffer(fb)
      gl.deleteTexture(doel)
      gl.deleteTexture(kt)
      return { b: B, h: H, px }
    }
    const masker = this.maakTex(gl.RGBA8, B, H)
    const t0 = performance.now()
    this.rekenMasker(d, masker, B, H, tegels)
    this.wachtGpu()
    const maskerMs = performance.now() - t0
    if (o.wat === 'masker') {
      const px = this.leesDoel(masker, B, H)
      gl.deleteTexture(masker)
      return { b: B, h: H, px, ms: { masker: Math.round(maskerMs) } }
    }
    const bewerk = d.masker
    d.masker = masker
    let uit: { b: number; h: number; px?: Uint8Array; ms?: Record<string, number> }
    if (o.wat === 'effect') {
      const doel = this.maakTex(gl.RGBA8, B, H)
      const fb = gl.createFramebuffer()!
      this.hang(fb, doel)
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
      gl.viewport(0, 0, B, H)
      const { blok, aantal } = this.laagBlok(d)
      this.zetSamenstel(this.progs.effect, d, blok, aantal, [0, 0, 1, 1], [B, H])
      gl.bindVertexArray(this.leegVao)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      this.herstelStaat()
      uit = { b: B, h: H, px: this.leesDoel(doel, B, H) }
      gl.deleteFramebuffer(fb)
      gl.deleteTexture(doel)
    } else {
      // De tijd van het samenstellen op volle maat: pad 1 alleen, en met pad 2 als dat er is.
      const ruw = this.maakTex(gl.SRGB8_ALPHA8, B, H)
      const fb = gl.createFramebuffer()!
      this.hang(fb, ruw)
      const tijden: number[] = []
      const gedeeld = d.gedeeld
      // Eerst warmdraaien: de eerste keer per programma en doel vertaalt ANGLE de shader en legt het buffers aan.
      for (const g of [0, Math.max(gedeeld, 0.02)]) {
        d.gedeeld = g
        for (let i = 0; i < 5; i++) this.stelSamen(d, fb, [B, H], [[0, 0, B, H]])
      }
      this.wachtGpu()
      /*
       * Per meting 10 keer achter elkaar en dan één keer wachten, gedeeld door 10:
       * zo blijft de GPU bezig (zoals bij slepen) en telt het wachten niet mee. Los
       * gemeten (wachten na elke keer) klokte een haast lege GPU terug en sprong de
       * tijd tussen 1 en 6 ms voor hetzelfde doel.
       */
      const reeks = (g: number): number => {
        d.gedeeld = g
        this.wachtGpu()
        const t = performance.now()
        for (let i = 0; i < 10; i++) this.stelSamen(d, fb, [B, H], [[0, 0, B, H]])
        this.wachtGpu()
        return (performance.now() - t) / 10
      }
      for (let i = 0; i < (o.keer ?? 5); i++) tijden.push(reeks(0))
      const metGedeeld: number[] = []
      for (let i = 0; i < (o.keer ?? 5); i++) metGedeeld.push(reeks(Math.max(gedeeld, 0.02)))
      d.gedeeld = gedeeld
      const kw = (l: number[]): number => [...l].sort((a, b) => a - b)[Math.floor(l.length / 2)]
      const kleinste = (l: number[]): number => Math.min(...l)
      uit = {
        b: B,
        h: H,
        ms: {
          masker: Math.round(maskerMs),
          pad1: +kw(tijden).toFixed(2),
          pad1En2: +kw(metGedeeld).toFixed(2),
          pad1Min: +kleinste(tijden).toFixed(2),
          pad1En2Min: +kleinste(metGedeeld).toFixed(2),
          lagen: this.uitgeschreven().length
        }
      }
      gl.deleteFramebuffer(fb)
      gl.deleteTexture(ruw)
    }
    d.masker = bewerk
    gl.deleteTexture(masker)
    return uit
  }

  /* ------------------------------------------------------------------ opruimen en meten */

  gpuBytes(): number {
    let som = 0
    for (const d of this.doeken) {
      const e = d.editB * d.editH
      // masker 4, zaad 4, ruw 4, resultaat 4/3·4, penseel 4 per laag, dekking 4 per groep, laknet
      som += e * 4 * 3 + (e * 16) / 3 + d.penseel.length * e * 4 + (d.dekking ? d.dekking.lagen * e * 4 : 0) + d.net.bytes
    }
    if (this.diepte) som += this.diepte.maat * this.diepte.maat * 8
    if (this.decals) som += this.decals.lagen * DECAL_B * DECAL_H * 4
    return Math.round(som)
  }

  stop(): void {
    const gl = this.gl
    for (const d of this.doeken) {
      this.tekenaar.texturen.zetVervanging(d.plek, undefined)
      gl.deleteVertexArray(d.net.vao)
      gl.deleteVertexArray(d.net.lijnVao)
      gl.deleteBuffer(d.net.vb)
      gl.deleteBuffer(d.net.lijnen)
      for (const t of [d.basis, d.masker, d.zaad, d.ruw, d.resultaat]) gl.deleteTexture(t)
      if (d.sjabloon) for (const t of Object.values(d.sjabloon)) gl.deleteTexture(t)
      for (const p of d.penseel) {
        gl.deleteTexture(p.tex)
        gl.deleteFramebuffer(p.fb)
      }
      if (d.dekking) gl.deleteTexture(d.dekking.tex)
      gl.deleteFramebuffer(d.ruwFb)
      gl.deleteFramebuffer(d.resultaatFb)
    }
    this.doeken = []
    if (this.decals) gl.deleteTexture(this.decals.tex)
    this.decals = undefined
  }
}


/* ------------------------------------------------------------------ decals tekenen (§4.6) */

/** Een tekst, afbeelding of vorm in een laag van de decal-array (wit met alfa; de kleur komt van de laag). */
function tekenDecal(ctx: OffscreenCanvasRenderingContext2D, l: Laag, beelden: Map<string, ImageBitmap>): void {
  const B = DECAL_B
  const H = DECAL_H
  if (l.soort === 'tekst') {
    const letter = l.lettertype || 'Arial'
    ctx.font = `bold 200px "${letter}", "D-DIN", Arial, sans-serif`
    const maat = ctx.measureText(l.tekst)
    const breed = Math.max(1, maat.width + (l.letterafstand ?? 0) * l.tekst.length * 20)
    const hoog = 270
    ctx.save()
    ctx.scale(B / breed, H / hoog)
    ctx.textBaseline = 'middle'
    if (l.omlijning && l.omlijning.breedteCm > 0) {
      ctx.lineWidth = (l.omlijning.breedteCm / l.hoogteCm) * 200
      ctx.strokeStyle = 'white'
      ctx.strokeText(l.tekst, 0, hoog / 2)
    }
    ctx.fillStyle = 'white'
    ctx.fillText(l.tekst, 0, hoog / 2)
    ctx.restore()
  } else if (l.soort === 'afbeelding') {
    const beeld = beelden.get(l.beeld)
    if (!beeld) return
    ctx.drawImage(beeld, 0, 0, B, H)
    if (l.witDoorzichtig) {
      const d = ctx.getImageData(0, 0, B, H)
      for (let i = 0; i < d.data.length; i += 4) {
        const wit = Math.min(d.data[i], d.data[i + 1], d.data[i + 2])
        if (wit > 235) d.data[i + 3] = Math.round(d.data[i + 3] * (1 - (wit - 235) / 20))
      }
      ctx.putImageData(d, 0, 0)
    }
  } else if (l.soort === 'vorm') {
    ctx.save()
    ctx.scale(B / 100, H / 100)
    ctx.fillStyle = 'white'
    ctx.fill(new Path2D(VORMEN[l.vorm] ?? VORMEN.cirkel))
    ctx.restore()
  }
}

/** De ingebouwde vormen (§1): paden in een vak van 100×100. */
export const VORMEN: Record<string, string> = {
  cirkel: 'M50 5 A45 45 0 1 1 49.9 5 Z',
  streep: 'M0 40 H100 V60 H0 Z',
  pijl: 'M5 40 H65 V20 L95 50 L65 80 V60 H5 Z',
  ster: 'M50 5 L61 38 H95 L67 58 L78 92 L50 72 L22 92 L33 58 L5 38 H39 Z',
  golf: 'M0 60 Q25 30 50 60 T100 60 V80 Q75 50 50 80 T0 80 Z'
}

export type { Zone }
