import {
  itemSleutel,
  type Bus3dLak,
  type Bus3dManifest,
  type Bus3dMateriaal,
  type Bus3dMateriaalstand,
  type Bus3dOmgeving,
  type Bus3dTextuur
} from '../../../shared/bus3d'
import { leesPakket, type GelezenPakket } from '../../../shared/bus3dpak'
import { ontwarStuk, type OntwarStand } from '../../../shared/o3dhussel'
import type { CameraBeeld } from './camera'
import {
  BUS_FS,
  BUS_VS,
  CONTACT_FS,
  CONTACT_VS,
  HEMEL_FS,
  SCHADUW_FS,
  SCHADUW_VS,
  SCHERM_VS,
  VAAG_FS,
  VLOER_FS,
  VLOER_VS
} from './shaders'
import { maakProgramma, Texturen, type GpuTextuur, type Mogelijkheden, type Ontleder } from './texturen'
import { eenheid, graden, inverse, kijkNaar, orthografisch, projecteer, vermenigvuldig, type Mat4, type Vec3 } from './wiskunde'

/**
 * HET TEKENEN (bus3d-ontwerp §5.3-§5.6, §5.8)
 *
 * Eén WebGL2-context in de renderer-werker. Per beeld:
 *  1. (alleen als het model, de zichtbaarheid of het licht veranderde) de
 *     schaduwkaart van 2048² in DEPTH32F, en één keer per model de
 *     contactschaduw van onderen (256², twee keer vervaagd);
 *  2. de hemel van OMSI met wolken, en de matte grijze vloer die naar de horizon
 *     in de hemel overgaat;
 *  3. de bus in drie gangen: dekkend, alfatest (alpha-to-coverage), en mengen
 *     in cfg-volgorde (per deel van achter naar voren, `[isshadow]` voorop),
 *     zonder diepte te schrijven waar de cfg `noZwrite` zegt.
 *
 * GEOMETRIE
 * Het pakket komt als één buffer binnen; de hoekpuntblokken staan erin zoals in
 * de o3d, ook de gehusselde. Die worden hier in het geheugen ontward (in stukken
 * van hooguit 16 ms), de verschuiving van het deel (aanhanger) wordt erbij
 * opgeteld, en dan gaat alles in één hoekpuntbuffer naar de GPU. Er komt niets
 * op schijf (Lucs regel, §5.1).
 *
 * Dichte stukken (dekkend en alfatest) worden per materiaal samengevoegd tot
 * één tekenbeurt: bij elke andere zichtbaarheid worden hun indices opnieuw
 * achter elkaar gezet (tientallen ms, alleen bij een lakwissel). Mengen gaat per
 * vermelding, in de volgorde van de cfg, zoals OMSI.
 */

/** De vaste middagzon van Buiten (§5.5): 38° hoog, rechtsvoor-boven gezien vanuit de beginstand. */
export const ZON = { hoogte: 38, draai: 228 }
/**
 * Lichtsterktes (lineair), geijkt op de witte O560 en de beige SD77 (§5.5), met
 * scripts/probe-bus3d-beeld.cjs: de beginwaarden van het ontwerp (hemel 0,45,
 * omgeving 0,15) lieten de O560 met 18% (bijna) zwarte buspixels achter: het
 * interieur achter het glas ligt in de schaduw van het dak. Met iets meer
 * strooilicht, 80% hemellicht in de schaduw en belichting 1,4 is dat 7,8%, en
 * loopt de witte lak nog niet dicht (Khronos Neutral).
 */
export const LICHT = {
  zon: [1.0, 0.97, 0.9] as Vec3,
  hemel: [0.41, 0.45, 0.52] as Vec3,
  omgeving: [0.22, 0.22, 0.24] as Vec3,
  belichting: 1.4,
  lakglans: 0.35,
  vloer: [0.12, 0.12, 0.12] as Vec3,
  vloerStraal: 400,
  /** Hoeveel hemellicht er in de schaduw overblijft (openOMSI: 0,6). */
  schaduwHemel: 0.8,
  /** De kleinste weerspiegeling op glas (zie `matVoor`). */
  glasMin: 0.6
}

/** Voor het ijken (de proef): lichtwaarden overschrijven. */
export function zetLicht(nieuw: Partial<Record<keyof typeof LICHT, unknown>>): void {
  for (const [k, w] of Object.entries(nieuw)) {
    if (!(k in LICHT)) continue
    const oud = (LICHT as Record<string, unknown>)[k]
    if (Array.isArray(oud) && Array.isArray(w) && w.length === 3 && w.every((x) => typeof x === 'number')) {
      ;(LICHT as Record<string, unknown>)[k] = w
    } else if (typeof oud === 'number' && typeof w === 'number' && Number.isFinite(w)) {
      ;(LICHT as Record<string, unknown>)[k] = w
    }
  }
}
const SCHADUW_MAAT = 2048
const CONTACT_MAAT = 256

/** Een materiaal zoals de shader het wil. */
interface Mat {
  sleutel: string
  modus: 0 | 1 | 2 | 3
  tex?: number
  trans?: number
  /** 0 eigen alfa, 3 niets (scripttextuur); 1/2 volgen uit de transmap zelf. */
  transLeeg: boolean
  transNul: boolean
  masker?: number
  env: number
  glas: boolean
  diffuus: [number, number, number, number]
  spec: [number, number, number, number]
  emissie: [number, number, number]
  klem: boolean
  nietSchrijven: boolean
  nietTesten: boolean
  alfaSchaal: number
}

interface Beurt {
  mat: Mat
  begin: number
  aantal: number
}

interface BusScene {
  manifest: Bus3dManifest
  pak: GelezenPakket
  vao: WebGLVertexArrayObject
  vb: WebGLBuffer
  ibAlle: WebGLBuffer
  ibSamen: WebGLBuffer
  alleIndices: Uint32Array
  stukBasis: Array<{ hoekpunt: number; index: number }>
  /** De doos in de wereld (X gespiegeld). */
  doos: { min: Vec3; max: Vec3 }
  deelMidden: Vec3[]
  dicht: Beurt[]
  test: Beurt[]
  schaduwMeshes: Beurt[]
  meng: Beurt[][]
  benodigd: Set<number>
  lak?: Bus3dLak
  texturen: Bus3dTextuur[]
  schaduwVuil: boolean
  contactVuil: boolean
  bytes: { hoekpunten: number; indices: number; samen: number }
  driehoeken: number
  zichtbareDriehoeken: number
}

type Loc = WebGLUniformLocation | null

interface BusProg {
  prog: WebGLProgram
  u: Record<
    | 'uTex'
    | 'uTrans'
    | 'uMasker'
    | 'uHemelTex'
    | 'uWolkTex'
    | 'uSchaduwKaart'
    | 'uDiffuus'
    | 'uSpec'
    | 'uEmissie'
    | 'uModus'
    | 'uTexModus'
    | 'uTransModus'
    | 'uMaskerModus'
    | 'uGlas'
    | 'uVlak'
    | 'uId'
    | 'uEnv'
    | 'uAlfaSchaal',
    Loc
  >
}

/** Het uniform-blok `Beeld` (std140): 3 matrices en 9 vectoren. */
const BLOK_FLOATS = 16 * 3 + 4 * 10

export class Tekenaar {
  readonly texturen: Texturen
  private bus?: BusProg
  private schaduwProg!: { prog: WebGLProgram; tex: Loc; alfatest: Loc }
  private contactProg!: { prog: WebGLProgram; mat: Loc }
  private vaagProg!: { prog: WebGLProgram; bron: Loc; stap: Loc }
  private hemelProg!: { prog: WebGLProgram; hemel: Loc; wolk: Loc }
  private vloerProg!: { prog: WebGLProgram; hemel: Loc; wolk: Loc; schaduw: Loc; contact: Loc }
  private ubo!: WebGLBuffer
  private blok = new Float32Array(BLOK_FLOATS)
  private leegVao!: WebGLVertexArrayObject
  private vloerVao!: WebGLVertexArrayObject
  private schaduwKaart!: { tex: WebGLTexture; fb: WebGLFramebuffer }
  private contact!: { tex: [WebGLTexture, WebGLTexture]; fb: [WebGLFramebuffer, WebGLFramebuffer]; diepte: WebGLRenderbuffer }
  private leeg!: WebGLTexture
  private omgeving?: Bus3dOmgeving
  scene?: BusScene
  private zonRicht: Vec3
  private zonAzimut: number
  private schaduwMat: Mat4 = new Float32Array(16)
  private contactGebied = { minX: -8, minZ: -8, grootteX: 16, grootteZ: 16 }
  /** Mag de ontwarlus een beeld tussendoor laten tekenen? */
  private ruisZaad = 0

  constructor(
    readonly gl: WebGL2RenderingContext,
    readonly mag: Mogelijkheden,
    ontleder: Ontleder,
    opVerandering: () => void
  ) {
    this.texturen = new Texturen(gl, mag, ontleder, opVerandering)
    const z = graden(ZON.hoogte)
    const d = graden(ZON.draai)
    this.zonRicht = eenheid([Math.cos(z) * Math.sin(d), Math.sin(z), -Math.cos(z) * Math.cos(d)])
    this.zonAzimut = Math.atan2(this.zonRicht[0], -this.zonRicht[2])
    this.maakAlles()
  }

  /** Programma's, buffers en doelen; opnieuw na een verloren context. */
  maakAlles(): void {
    const gl = this.gl
    const blokNaar = (prog: WebGLProgram): void => {
      const i = gl.getUniformBlockIndex(prog, 'Beeld')
      if (i !== gl.INVALID_INDEX) gl.uniformBlockBinding(prog, i, 0)
    }
    const busProg = maakProgramma(gl, BUS_VS, BUS_FS)
    blokNaar(busProg)
    const namen = [
      'uTex', 'uTrans', 'uMasker', 'uHemelTex', 'uWolkTex', 'uSchaduwKaart', 'uDiffuus', 'uSpec', 'uEmissie',
      'uModus', 'uTexModus', 'uTransModus', 'uMaskerModus', 'uGlas', 'uVlak', 'uId', 'uEnv', 'uAlfaSchaal'
    ] as const
    const u = {} as BusProg['u']
    for (const n of namen) u[n] = gl.getUniformLocation(busProg, n)
    this.bus = { prog: busProg, u }
    gl.useProgram(busProg)
    gl.uniform1i(u.uTex, 0)
    gl.uniform1i(u.uTrans, 1)
    gl.uniform1i(u.uMasker, 2)
    gl.uniform1i(u.uSchaduwKaart, 3)
    gl.uniform1i(u.uHemelTex, 4)
    gl.uniform1i(u.uWolkTex, 5)

    const sp = maakProgramma(gl, SCHADUW_VS, SCHADUW_FS)
    blokNaar(sp)
    this.schaduwProg = { prog: sp, tex: gl.getUniformLocation(sp, 'uTex'), alfatest: gl.getUniformLocation(sp, 'uAlfatest') }
    const cp = maakProgramma(gl, CONTACT_VS, CONTACT_FS)
    this.contactProg = { prog: cp, mat: gl.getUniformLocation(cp, 'uContactMat') }
    const vp = maakProgramma(gl, SCHERM_VS, VAAG_FS)
    this.vaagProg = { prog: vp, bron: gl.getUniformLocation(vp, 'uBron'), stap: gl.getUniformLocation(vp, 'uStap') }
    const hp = maakProgramma(gl, SCHERM_VS, HEMEL_FS)
    blokNaar(hp)
    this.hemelProg = { prog: hp, hemel: gl.getUniformLocation(hp, 'uHemelTex'), wolk: gl.getUniformLocation(hp, 'uWolkTex') }
    const lp = maakProgramma(gl, VLOER_VS, VLOER_FS)
    blokNaar(lp)
    this.vloerProg = {
      prog: lp,
      hemel: gl.getUniformLocation(lp, 'uHemelTex'),
      wolk: gl.getUniformLocation(lp, 'uWolkTex'),
      schaduw: gl.getUniformLocation(lp, 'uSchaduwKaart'),
      contact: gl.getUniformLocation(lp, 'uContactTex')
    }
    gl.useProgram(hp)
    gl.uniform1i(this.hemelProg.hemel, 4)
    gl.uniform1i(this.hemelProg.wolk, 5)
    gl.useProgram(lp)
    gl.uniform1i(this.vloerProg.schaduw, 3)
    gl.uniform1i(this.vloerProg.hemel, 4)
    gl.uniform1i(this.vloerProg.wolk, 5)
    gl.uniform1i(this.vloerProg.contact, 6)

    this.ubo = gl.createBuffer()!
    gl.bindBuffer(gl.UNIFORM_BUFFER, this.ubo)
    gl.bufferData(gl.UNIFORM_BUFFER, this.blok.byteLength, gl.DYNAMIC_DRAW)
    gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, this.ubo)

    this.leegVao = gl.createVertexArray()!
    this.vloerVao = gl.createVertexArray()!
    gl.bindVertexArray(this.vloerVao)
    const vloer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, vloer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    gl.bindVertexArray(null)

    // Een lege textuur van 1x1 voor eenheden die niets hebben (de shader kijkt er niet naar).
    this.leeg = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, this.leeg)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]))

    // De schaduwkaart: 2048² DEPTH32F met vergelijking (sampler2DShadow), 16 MB.
    const st = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, st)
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT32F, SCHADUW_MAAT, SCHADUW_MAAT)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL)
    const sf = gl.createFramebuffer()!
    gl.bindFramebuffer(gl.FRAMEBUFFER, sf)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, st, 0)
    this.schaduwKaart = { tex: st, fb: sf }

    // De contactschaduw: twee R8-doelen om te vervagen, en een diepte om de laagste te houden.
    const ct: WebGLTexture[] = []
    const cf: WebGLFramebuffer[] = []
    const diepte = gl.createRenderbuffer()!
    gl.bindRenderbuffer(gl.RENDERBUFFER, diepte)
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, CONTACT_MAAT, CONTACT_MAAT)
    for (let i = 0; i < 2; i++) {
      const t = gl.createTexture()!
      gl.bindTexture(gl.TEXTURE_2D, t)
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R8, CONTACT_MAAT, CONTACT_MAAT)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      const f = gl.createFramebuffer()!
      gl.bindFramebuffer(gl.FRAMEBUFFER, f)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0)
      if (i === 0) gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, diepte)
      ct.push(t)
      cf.push(f)
    }
    this.contact = { tex: [ct[0], ct[1]], fb: [cf[0], cf[1]], diepte }
    // Zonder bus: geen contactschaduw.
    gl.bindFramebuffer(gl.FRAMEBUFFER, cf[0])
    gl.clearColor(0, 0, 0, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  zetOmgeving(o: Bus3dOmgeving): void {
    this.omgeving = o
    if (o.hemel) this.texturen.zetLos('hemel', o.hemel)
    if (o.wolken) this.texturen.zetLos('wolken', o.wolken)
  }

  // ------------------------------------------------------------ een bus laden
  /**
   * Het pakket ophalen, ontwarren (in stukken, `tussendoor` na elke 16 ms) en
   * naar de GPU. Gooit bij een pakket dat niet te lezen is.
   */
  async laadBus(manifest: Bus3dManifest, tussendoor: () => Promise<void>, geldig: () => boolean = () => true): Promise<boolean> {
    const r = await fetch(`omsi3d://p/${manifest.pakket}`)
    if (!r.ok) throw new Error(`pakket: omsi3d ${r.status}`)
    const buf = new Uint8Array(await r.arrayBuffer())
    const pak = leesPakket(buf)
    if (pak.kop.pakket !== manifest.pakket) throw new Error('pakket hoort niet bij het manifest')
    const gl = this.gl

    const stukken = pak.kop.stukken
    let hoekpunten = 0
    let indices = 0
    const stukBasis = stukken.map((s) => {
      const b = { hoekpunt: hoekpunten, index: indices }
      hoekpunten += s.n
      indices += s.indices.len / s.indices.breed
      return b
    })
    const vb = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, vb)
    gl.bufferData(gl.ARRAY_BUFFER, hoekpunten * 32, gl.STATIC_DRAW)
    const alleIndices = new Uint32Array(indices)
    const deelMin: Vec3[] = manifest.delen.map(() => [Infinity, Infinity, Infinity])
    const deelMax: Vec3[] = manifest.delen.map(() => [-Infinity, -Infinity, -Infinity])
    let driehoeken = 0
    let tijd = performance.now()
    for (let s = 0; s < stukken.length; s++) {
      const stuk = stukken[s]
      const staart = pak.staart
      const bytes = staart.subarray(stuk.hoekpunten.off, stuk.hoekpunten.off + stuk.hoekpunten.len)
      // Het pakket is van ons (net opgehaald): ontwarren en verschuiven gebeurt ter plekke.
      const f =
        (bytes.byteOffset & 3) === 0
          ? new Float32Array(bytes.buffer, bytes.byteOffset, stuk.n * 8)
          : new Float32Array(bytes.slice().buffer, 0, stuk.n * 8)
      if (stuk.hussel) {
        let stand: OntwarStand | undefined
        do {
          stand = ontwarStuk(f, { ...stuk.hussel, n: stuk.n }, stand, 20000)
          if (performance.now() - tijd > 16) {
            await tussendoor()
            tijd = performance.now()
          }
        } while (stand)
      }
      const v = manifest.delen[stuk.deel]?.verschuiving ?? [0, 0, 0]
      const lo = deelMin[stuk.deel] ?? deelMin[0]
      const hi = deelMax[stuk.deel] ?? deelMax[0]
      for (let o = 0; o < f.length; o += 8) {
        f[o] += v[0]
        f[o + 1] += v[1]
        f[o + 2] += v[2]
        if ((o & 63) === 0) {
          // Een steekproef voor het midden van het deel (voor de mengvolgorde).
          const x = -f[o]
          if (x < lo[0]) lo[0] = x
          if (x > hi[0]) hi[0] = x
          if (f[o + 1] < lo[1]) lo[1] = f[o + 1]
          if (f[o + 1] > hi[1]) hi[1] = f[o + 1]
          if (f[o + 2] < lo[2]) lo[2] = f[o + 2]
          if (f[o + 2] > hi[2]) hi[2] = f[o + 2]
        }
      }
      // Opnieuw binden: tussendoor kan er een beeld getekend zijn.
      gl.bindBuffer(gl.ARRAY_BUFFER, vb)
      gl.bufferSubData(gl.ARRAY_BUFFER, stukBasis[s].hoekpunt * 32, f)
      const ib = staart.subarray(stuk.indices.off, stuk.indices.off + stuk.indices.len)
      const bron =
        stuk.indices.breed === 2
          ? new Uint16Array(ib.byteOffset & 1 ? ib.slice().buffer : ib.buffer, ib.byteOffset & 1 ? 0 : ib.byteOffset, stuk.indices.len >> 1)
          : new Uint32Array((ib.byteOffset & 3) === 0 ? ib.buffer : ib.slice().buffer, (ib.byteOffset & 3) === 0 ? ib.byteOffset : 0, stuk.indices.len >> 2)
      const basis = stukBasis[s].hoekpunt
      const doel = stukBasis[s].index
      for (let i = 0; i < bron.length; i++) alleIndices[doel + i] = bron[i] + basis
      driehoeken += bron.length / 3
      if (performance.now() - tijd > 16) {
        await tussendoor()
        tijd = performance.now()
      }
    }
    const vao = gl.createVertexArray()!
    gl.bindVertexArray(vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, vb)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0)
    gl.enableVertexAttribArray(1)
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 12)
    gl.enableVertexAttribArray(2)
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 32, 24)
    const ibAlle = gl.createBuffer()!
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibAlle)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, alleIndices, gl.STATIC_DRAW)
    const ibSamen = gl.createBuffer()!
    gl.bindVertexArray(null)
    // Intussen een andere bus gevraagd: deze niet neerzetten.
    if (!geldig()) {
      gl.deleteVertexArray(vao)
      gl.deleteBuffer(vb)
      gl.deleteBuffer(ibAlle)
      gl.deleteBuffer(ibSamen)
      return false
    }

    const d = manifest.doos
    const doos = { min: [-d.max[0], d.min[1], d.min[2]] as Vec3, max: [-d.min[0], d.max[1], d.max[2]] as Vec3 }
    const deelMidden = manifest.delen.map((_, i): Vec3 =>
      Number.isFinite(deelMin[i][0])
        ? [(deelMin[i][0] + deelMax[i][0]) / 2, (deelMin[i][1] + deelMax[i][1]) / 2, (deelMin[i][2] + deelMax[i][2]) / 2]
        : [0, 0, 0]
    )
    // De vorige bus blijft staan tot deze klaar is: tijdens het ontwarren geen leeg beeld.
    this.vergeetBus()
    this.scene = {
      manifest,
      pak,
      vao,
      vb,
      ibAlle,
      ibSamen,
      alleIndices,
      stukBasis,
      doos,
      deelMidden,
      dicht: [],
      test: [],
      schaduwMeshes: [],
      meng: manifest.delen.map(() => []),
      benodigd: new Set(),
      texturen: manifest.texturen,
      schaduwVuil: true,
      contactVuil: true,
      bytes: { hoekpunten: hoekpunten * 32, indices: indices * 4, samen: 0 },
      driehoeken,
      zichtbareDriehoeken: 0
    }
    this.zetGebieden()
    return true
  }

  vergeetBus(): void {
    const s = this.scene
    if (!s) return
    const gl = this.gl
    gl.deleteVertexArray(s.vao)
    gl.deleteBuffer(s.vb)
    gl.deleteBuffer(s.ibAlle)
    gl.deleteBuffer(s.ibSamen)
    this.scene = undefined
  }

  /** De schaduwkaart en de contactkaart op de doos van deze bus. */
  private zetGebieden(): void {
    const s = this.scene
    if (!s) return
    const lo: Vec3 = [s.doos.min[0] - 1, Math.min(s.doos.min[1], 0) - 0.2, s.doos.min[2] - 1]
    const hi: Vec3 = [s.doos.max[0] + 1, s.doos.max[1] + 1, s.doos.max[2] + 1]
    const midden: Vec3 = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2]
    const L = this.zonRicht
    const zicht = kijkNaar([midden[0] + L[0] * 100, midden[1] + L[1] * 100, midden[2] + L[2] * 100], midden)
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
    // Ver genoeg achter de bus dat ook de vloer in zijn schaduw erin valt.
    const proj = orthografisch(x0, x1, y0, y1, -z1 - 1, -z0 + 60)
    this.schaduwMat = vermenigvuldig(proj, zicht)
    this.schaduwBereik = { breedte: Math.max(x1 - x0, y1 - y0), diepte: -z0 + 60 - (-z1 - 1) }
    this.contactGebied = { minX: lo[0], minZ: lo[2], grootteX: hi[0] - lo[0], grootteZ: hi[2] - lo[2] }
  }
  private schaduwBereik = { breedte: 16, diepte: 80 }

  // ------------------------------------------------------------ de lak: zichtbaarheid en tekenlijsten
  zetLak(lak: Bus3dLak | undefined, budget: number): void {
    const s = this.scene
    if (!s) return
    s.lak = lak
    // De texturen na de lak: een kleurstelling vervangt plekken.
    const vervangen = new Map<number, Bus3dTextuur>()
    for (const v of lak?.texturen ?? []) vervangen.set(v.plek, v.textuur)
    s.texturen = s.manifest.texturen.map((t, i) => vervangen.get(i) ?? t)
    this.bouwLijsten()
    this.texturen.zetPlan(s.texturen, s.benodigd, budget)
    s.schaduwVuil = true
    s.contactVuil = true
  }

  private matVoor(m: Bus3dMateriaal | null | undefined, item: number, alfaSchaal: Record<string, number>): Mat | null {
    const basis: Bus3dMateriaal = m ?? { diffuus: [0.8, 0.8, 0.8, 1], specular: [0, 0, 0], emissie: [0, 0, 0], macht: 0, alfa: 0 }
    // Tekst- en scripttexturen hebben zonder inhoud niets te tonen: doorzichtig, geen "Textfield" (§5.3).
    if (basis.tekst !== undefined || basis.scripttextuur !== undefined) return null
    let stand: Bus3dMateriaalstand = basis
    if (basis.wissel && item >= 1 && basis.wissel.items[item - 1]) stand = basis.wissel.items[item - 1]
    if (stand.transmap?.script !== undefined) return null
    const a = stand.alfaSchaal ?? basis.alfaSchaal
    const schaal = a ? (alfaSchaal[a] ?? 1) : 1
    if (stand.alfa >= 1 && schaal <= 0) return null
    const tex = stand.textuur ?? stand.freetex?.standaard
    const glas = stand.alfa === 2 && Boolean(stand.envmap)
    /*
     * De sterkte van de weerspiegeling, verzadigd op 1 zoals een D3D-factor (de
     * SD202 schrijft 10 voor "vol"). Glas houdt minstens `glasMin` (0,6): getint
     * glas met 0,25-0,34 (O560) werd anders een zwarte plaat, waar een echte ruit
     * onder deze hoek de hemel laat zien (idee uit openOMSI, shader.wgsl:1066-1090;
     * daar 0,25 x 0,65, bij ons geijkt op de O560).
     */
    const env = stand.envmap ? (glas ? Math.max(Math.min(stand.envmap.sterkte, 1), LICHT.glasMin) : Math.max(0, stand.envmap.sterkte)) : 0
    const mat: Mat = {
      sleutel: '',
      modus: stand.alfa,
      tex,
      trans: stand.transmap?.textuur,
      transLeeg: !stand.transmap || stand.transmap.textuur === undefined,
      transNul: false,
      masker: stand.envmap?.masker,
      env,
      glas,
      diffuus: [stand.diffuus[0], stand.diffuus[1], stand.diffuus[2], stand.diffuus[3] ?? 1],
      spec: [stand.specular[0], stand.specular[1], stand.specular[2], stand.macht],
      emissie: [stand.emissie[0], stand.emissie[1], stand.emissie[2]],
      klem: basis.adres === 'clamp' || basis.adres === 'border',
      nietSchrijven: Boolean(basis.nietSchrijven),
      nietTesten: Boolean(basis.nietTesten),
      alfaSchaal: stand.alfa >= 1 ? schaal : 1
    }
    mat.sleutel = JSON.stringify([
      mat.modus, mat.tex, mat.trans, mat.masker, mat.env, mat.diffuus, mat.spec, mat.emissie, mat.klem,
      mat.nietSchrijven, mat.nietTesten, mat.alfaSchaal
    ])
    return mat
  }

  /** De tekenlijsten voor de huidige zichtbaarheid, en de dichte indices achter elkaar per materiaal. */
  private bouwLijsten(): void {
    const s = this.scene
    if (!s) return
    const gl = this.gl
    const kop = s.pak.kop
    const zicht = s.lak?.zichtbaar ?? ''
    const items = s.lak?.items ?? {}
    const alfaSchaal = s.lak?.alphascale ?? {}
    const groepen = new Map<string, { mat: Mat; stukken: Array<[number, number]> }>()
    const gezien = new Set<string>()
    const schaduwMeshes: Beurt[] = []
    const meng: Beurt[][] = s.manifest.delen.map(() => [])
    const benodigd = new Set<number>()
    let zichtbaar = 0
    kop.vermeldingen.forEach((v, i) => {
      if (!v.buiten) return
      if (zicht.length === kop.vermeldingen.length && zicht[i] === '0') return
      const stuk = kop.stukken[v.stuk]
      if (!stuk) return
      const basis = s.stukBasis[v.stuk]
      for (const g of stuk.groepen) {
        const m = v.materialen[g.materiaal]
        const mat = this.matVoor(m, items[itemSleutel(i, g.materiaal)] ?? 0, alfaSchaal)
        if (!mat) continue
        if (v.schaduw) mat.modus = 3
        for (const t of [mat.tex, mat.trans, mat.masker]) if (t !== undefined) benodigd.add(t)
        const begin = basis.index + g.begin
        zichtbaar += g.aantal / 3
        if (mat.modus === 3) schaduwMeshes.push({ mat, begin, aantal: g.aantal })
        else if (mat.modus === 2) (meng[stuk.deel] ?? meng[0]).push({ mat, begin, aantal: g.aantal })
        else {
          // Dezelfde geometrie met hetzelfde materiaal hoeft maar één keer (dubbele vermeldingen).
          const dubbel = `${v.stuk}|${g.materiaal}|${mat.sleutel}`
          if (gezien.has(dubbel)) continue
          gezien.add(dubbel)
          let groep = groepen.get(mat.sleutel)
          if (!groep) {
            groep = { mat, stukken: [] }
            groepen.set(mat.sleutel, groep)
          }
          groep.stukken.push([begin, g.aantal])
        }
      }
    })
    // De dichte stukken per materiaal achter elkaar: één tekenbeurt per materiaal.
    let totaal = 0
    for (const g of groepen.values()) for (const [, n] of g.stukken) totaal += n
    const samen = new Uint32Array(totaal)
    const dicht: Beurt[] = []
    const test: Beurt[] = []
    let plek = 0
    for (const g of groepen.values()) {
      const begin = plek
      for (const [b, n] of g.stukken) {
        samen.set(s.alleIndices.subarray(b, b + n), plek)
        plek += n
      }
      ;(g.mat.modus === 1 ? test : dicht).push({ mat: g.mat, begin, aantal: plek - begin })
    }
    gl.bindVertexArray(null)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, s.ibSamen)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, samen, gl.STATIC_DRAW)
    s.bytes.samen = samen.byteLength
    s.dicht = dicht
    s.test = test
    s.schaduwMeshes = schaduwMeshes
    s.meng = meng
    s.benodigd = benodigd
    s.zichtbareDriehoeken = zichtbaar
  }

  // ------------------------------------------------------------ tekenen
  private vulBlok(c: CameraBeeld): void {
    const b = this.blok
    b.set(c.beeldProj, 0)
    b.set(this.schaduwMat, 16)
    b.set(inverse(c.beeldProj), 32)
    b.set([c.oog[0], c.oog[1], c.oog[2], LICHT.belichting], 48)
    b.set([this.zonRicht[0], this.zonRicht[1], this.zonRicht[2], this.zonAzimut], 52)
    // De schaduwstraal: ongeveer 6 cm in de wereld (een zachte rand), als deel van de kaart.
    b.set([LICHT.zon[0], LICHT.zon[1], LICHT.zon[2], 0.06 / this.schaduwBereik.breedte], 56)
    b.set([LICHT.hemel[0], LICHT.hemel[1], LICHT.hemel[2], LICHT.lakglans], 60)
    b.set([LICHT.omgeving[0], LICHT.omgeving[1], LICHT.omgeving[2], this.omgeving?.wolkMaat ?? 2000], 64)
    b.set([LICHT.vloer[0], LICHT.vloer[1], LICHT.vloer[2], LICHT.vloerStraal], 68)
    const cg = this.contactGebied
    b.set([cg.minX, cg.minZ, 1 / cg.grootteX, 1 / cg.grootteZ], 72)
    const hemel = this.texturen.voorPlek('hemel')
    const wolken = this.texturen.voorPlek('wolken')
    b.set([hemel ? 1 : 0, wolken ? 1 : 0, 0.02, 0.004 / this.schaduwBereik.diepte], 76)
    this.ruisZaad = (this.ruisZaad + 0.61803) % 1
    b.set([this.ruisZaad * 100, this.scene ? 1 : 0, 0.52, LICHT.schaduwHemel], 80)
    const gl = this.gl
    gl.bindBuffer(gl.UNIFORM_BUFFER, this.ubo)
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, b)
    gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, this.ubo)
  }

  private bindOmgeving(): void {
    const gl = this.gl
    const hemel = this.texturen.voorPlek('hemel')
    const wolken = this.texturen.voorPlek('wolken')
    gl.activeTexture(gl.TEXTURE3)
    gl.bindTexture(gl.TEXTURE_2D, this.schaduwKaart.tex)
    gl.bindSampler(3, null)
    gl.activeTexture(gl.TEXTURE4)
    gl.bindTexture(gl.TEXTURE_2D, hemel?.tex ?? this.leeg)
    gl.bindSampler(4, this.texturen.hemelSampler())
    gl.activeTexture(gl.TEXTURE5)
    gl.bindTexture(gl.TEXTURE_2D, wolken?.tex ?? this.leeg)
    gl.bindSampler(5, this.texturen.hemelSampler())
    gl.activeTexture(gl.TEXTURE6)
    gl.bindTexture(gl.TEXTURE_2D, this.contact.tex[0])
    gl.bindSampler(6, null)
  }

  /** De schaduwkaart opnieuw (alleen als er iets veranderde). */
  private tekenSchaduwKaart(): void {
    const s = this.scene
    if (!s) return
    const gl = this.gl
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.schaduwKaart.fb)
    gl.viewport(0, 0, SCHADUW_MAAT, SCHADUW_MAAT)
    gl.disable(gl.BLEND)
    gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE)
    gl.disable(gl.CULL_FACE)
    gl.enable(gl.DEPTH_TEST)
    gl.depthFunc(gl.LEQUAL)
    gl.depthMask(true)
    gl.clearDepth(1)
    gl.clear(gl.DEPTH_BUFFER_BIT)
    gl.enable(gl.POLYGON_OFFSET_FILL)
    gl.polygonOffset(1.5, 3)
    gl.useProgram(this.schaduwProg.prog)
    gl.uniform1i(this.schaduwProg.tex, 0)
    gl.bindVertexArray(s.vao)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, s.ibSamen)
    gl.uniform1i(this.schaduwProg.alfatest, 0)
    for (const b of s.dicht) gl.drawElements(gl.TRIANGLES, b.aantal, gl.UNSIGNED_INT, b.begin * 4)
    gl.uniform1i(this.schaduwProg.alfatest, 1)
    gl.activeTexture(gl.TEXTURE0)
    for (const b of s.test) {
      const t = b.mat.tex !== undefined ? this.texturen.voorPlek(b.mat.tex) : undefined
      gl.bindTexture(gl.TEXTURE_2D, t?.tex ?? this.leeg)
      gl.bindSampler(0, this.texturen.sampler(b.mat.klem))
      gl.drawElements(gl.TRIANGLES, b.aantal, gl.UNSIGNED_INT, b.begin * 4)
    }
    gl.disable(gl.POLYGON_OFFSET_FILL)
    gl.bindVertexArray(null)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    s.schaduwVuil = false
  }

  /** De contactschaduw: van onderen, wat er tot 0,6 m boven de vloer zit; twee keer vervaagd. */
  private tekenContact(): void {
    const s = this.scene
    if (!s) return
    const gl = this.gl
    const cg = this.contactGebied
    const m = new Float32Array(16)
    m[0] = 2 / cg.grootteX
    m[12] = -1 - (2 * cg.minX) / cg.grootteX
    m[9] = 2 / cg.grootteZ
    m[13] = -1 - (2 * cg.minZ) / cg.grootteZ
    m[6] = 2 / 0.6
    m[14] = -1
    m[15] = 1
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.contact.fb[0])
    gl.viewport(0, 0, CONTACT_MAAT, CONTACT_MAAT)
    gl.disable(gl.BLEND)
    gl.disable(gl.CULL_FACE)
    gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE)
    gl.enable(gl.DEPTH_TEST)
    gl.depthFunc(gl.LESS)
    gl.depthMask(true)
    gl.clearColor(0, 0, 0, 1)
    gl.clearDepth(1)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    gl.useProgram(this.contactProg.prog)
    gl.uniformMatrix4fv(this.contactProg.mat, false, m)
    gl.bindVertexArray(s.vao)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, s.ibSamen)
    for (const b of [...s.dicht, ...s.test]) gl.drawElements(gl.TRIANGLES, b.aantal, gl.UNSIGNED_INT, b.begin * 4)
    gl.bindVertexArray(this.leegVao)
    gl.disable(gl.DEPTH_TEST)
    gl.useProgram(this.vaagProg.prog)
    gl.uniform1i(this.vaagProg.bron, 0)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindSampler(0, null)
    for (let ronde = 0; ronde < 2; ronde++) {
      for (const [van, naar, stap] of [
        [0, 1, [1 / CONTACT_MAAT, 0]],
        [1, 0, [0, 1 / CONTACT_MAAT]]
      ] as Array<[0 | 1, 0 | 1, [number, number]]>) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.contact.fb[naar])
        gl.bindTexture(gl.TEXTURE_2D, this.contact.tex[van])
        gl.uniform2f(this.vaagProg.stap, stap[0] * 1.6, stap[1] * 1.6)
        gl.drawArrays(gl.TRIANGLES, 0, 3)
      }
    }
    gl.bindVertexArray(null)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    s.contactVuil = false
  }

  /**
   * Eén beeld in het doek (het standaard-framebuffer, 4x MSAA). `vlak`: alleen
   * de bus in wit op zwart (het masker van de proef). `zonderBus`: alleen hemel
   * en vloer, met de schaduwen (de schaduwmeting).
   */
  /** Na een beeld met `id`: per kleurnummer (r + 256 g, vanaf 1) de tekenbeurt, voor de diagnose. */
  idTabel: Array<Record<string, unknown>> = []

  teken(c: CameraBeeld, b: number, h: number, opties: { vlak?: boolean; zonderBus?: boolean; id?: boolean } = {}): void {
    const gl = this.gl
    const s = this.scene
    this.vulBlok(c)
    if (s?.schaduwVuil) this.tekenSchaduwKaart()
    if (s?.contactVuil) this.tekenContact()
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, b, h)
    gl.colorMask(true, true, true, true)
    gl.depthMask(true)
    gl.clearColor(0, 0, 0, 1)
    gl.clearDepth(1)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    gl.disable(gl.BLEND)
    gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE)
    gl.disable(gl.POLYGON_OFFSET_FILL)
    this.bindOmgeving()

    if (!opties.vlak && !opties.id) {
      // De hemel, zonder diepte.
      gl.disable(gl.DEPTH_TEST)
      gl.disable(gl.CULL_FACE)
      gl.useProgram(this.hemelProg.prog)
      gl.bindVertexArray(this.leegVao)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      // De vloer.
      gl.enable(gl.DEPTH_TEST)
      gl.depthFunc(gl.LEQUAL)
      gl.useProgram(this.vloerProg.prog)
      gl.bindVertexArray(this.vloerVao)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }
    if (!s || opties.zonderBus) {
      gl.bindVertexArray(null)
      return
    }

    const bus = this.bus!
    const u = bus.u
    gl.useProgram(bus.prog)
    gl.uniform1i(u.uVlak, opties.id ? 2 : opties.vlak ? 1 : 0)
    this.idTabel = []
    const zetId = (lijst: string, beurt: Beurt): void => {
      if (!opties.id) return
      const i = this.idTabel.length + 1
      const naam = (p?: number): string | undefined => (p !== undefined ? s.texturen[p]?.naam : undefined)
      this.idTabel.push({ lijst, tex: naam(beurt.mat.tex), trans: naam(beurt.mat.trans), modus: beurt.mat.modus, glas: beurt.mat.glas, env: beurt.mat.env, aantal: beurt.aantal })
      gl.uniform3f(u.uId, (i & 255) / 255, ((i >> 8) & 255) / 255, 0.5)
    }
    gl.bindVertexArray(s.vao)
    gl.enable(gl.DEPTH_TEST)
    gl.depthFunc(gl.LEQUAL)
    gl.enable(gl.CULL_FACE)
    gl.cullFace(gl.BACK)
    gl.frontFace(gl.CW)

    // 1. Dekkend, 2. alfatest: de samengevoegde stukken.
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, s.ibSamen)
    let vorige: Mat | undefined
    for (const beurt of s.dicht) {
      if (this.zetMat(beurt.mat, vorige)) vorige = beurt.mat
      else continue
      zetId('dicht', beurt)
      gl.drawElements(gl.TRIANGLES, beurt.aantal, gl.UNSIGNED_INT, beurt.begin * 4)
    }
    if (!opties.vlak && !opties.id) gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE)
    vorige = undefined
    for (const beurt of s.test) {
      if (this.zetMat(beurt.mat, vorige)) vorige = beurt.mat
      else continue
      zetId('test', beurt)
      gl.drawElements(gl.TRIANGLES, beurt.aantal, gl.UNSIGNED_INT, beurt.begin * 4)
    }
    gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE)

    // 3. Mengen: [isshadow] voorop, dan per deel van achter naar voren, in cfg-volgorde.
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, s.ibAlle)
    if (!opties.id) gl.enable(gl.BLEND)
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    const volgorde = s.meng
      .map((lijst, d) => ({ lijst, afstand: afstandKwadraat(s.deelMidden[d] ?? [0, 0, 0], c.oog) }))
      .sort((a, b) => b.afstand - a.afstand)
    const lijsten = opties.vlak ? volgorde.map((v) => v.lijst) : [s.schaduwMeshes, ...volgorde.map((v) => v.lijst)]
    vorige = undefined
    for (const lijst of lijsten) {
      for (const beurt of lijst) {
        if (this.zetMat(beurt.mat, vorige)) vorige = beurt.mat
        else continue
        zetId(beurt.mat.modus === 3 ? 'schaduw' : 'meng', beurt)
        if (opties.id) gl.depthMask(true)
        gl.drawElements(gl.TRIANGLES, beurt.aantal, gl.UNSIGNED_INT, beurt.begin * 4)
      }
    }
    gl.disable(gl.BLEND)
    gl.disable(gl.POLYGON_OFFSET_FILL)
    gl.depthMask(true)
    gl.bindVertexArray(null)
  }

  /** Het materiaal in de shader; `false` = nu niet tekenen (een transmap die nog laadt). */
  private zetMat(m: Mat, vorige: Mat | undefined): boolean {
    const gl = this.gl
    const u = this.bus!.u
    const tex = m.tex !== undefined ? this.texturen.voorPlek(m.tex) : undefined
    let transModus = 0
    let trans: GpuTextuur | undefined
    if (m.modus >= 1 && m.modus <= 3 && !m.transLeeg && m.trans !== undefined) {
      trans = this.texturen.voorPlek(m.trans)
      if (!trans) return false
      transModus = trans.heeftAlfa ? 1 : 2
    }
    // Zolang de textuur van glas of een rooster laadt, liever niets dan een dicht vlak.
    if (m.modus >= 1 && m.tex !== undefined && !tex && transModus === 0) return false
    let maskerModus = 0
    let masker: GpuTextuur | undefined
    let env = m.env
    if (env > 0 && m.masker !== undefined) {
      masker = this.texturen.voorPlek(m.masker)
      if (masker) maskerModus = masker.heeftAlfa ? 1 : 2
      else env = 0
    }
    if (env > 0 && maskerModus === 0 && !tex) env = 0
    gl.uniform4fv(u.uDiffuus, m.diffuus)
    gl.uniform4fv(u.uSpec, m.spec)
    gl.uniform3fv(u.uEmissie, m.emissie)
    gl.uniform1i(u.uModus, m.modus)
    gl.uniform1i(u.uTexModus, tex ? (tex.lineariseer ? 2 : 1) : 0)
    gl.uniform1i(u.uTransModus, transModus)
    gl.uniform1i(u.uMaskerModus, maskerModus)
    gl.uniform1i(u.uGlas, m.glas ? 1 : 0)
    gl.uniform1f(u.uEnv, env)
    gl.uniform1f(u.uAlfaSchaal, m.alfaSchaal)
    const sampler = this.texturen.sampler(m.klem)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, tex?.tex ?? this.leeg)
    gl.bindSampler(0, sampler)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, trans?.tex ?? this.leeg)
    gl.bindSampler(1, sampler)
    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D, masker?.tex ?? this.leeg)
    gl.bindSampler(2, sampler)
    if (!vorige || vorige.nietSchrijven !== m.nietSchrijven || vorige.modus !== m.modus) {
      gl.depthMask(!(m.modus >= 2 && m.nietSchrijven) && m.modus !== 3)
    }
    if (m.nietTesten || m.modus === 3) {
      // noZcheck: geen uitgeschakelde dieptetoets maar een verschuiving (openOMSI lib.rs:635-636).
      gl.enable(gl.POLYGON_OFFSET_FILL)
      gl.polygonOffset(-2, -8)
    } else {
      gl.disable(gl.POLYGON_OFFSET_FILL)
    }
    return true
  }

  // ------------------------------------------------------------ metingen
  /** Wat er nu op de GPU staat (eigen boekhouding), in bytes. */
  gpuBytes(b: number, h: number): { totaal: number; texturen: number; geometrie: number; doelen: number } {
    const s = this.scene
    const geometrie = s ? s.bytes.hoekpunten + s.bytes.indices + s.bytes.samen : 0
    const texturen = this.texturen.gpuBytes()
    // Schaduwkaart 16 MB, contact 2x R8 + diepte, en het doek: 4x MSAA kleur en diepte plus de uitkomst.
    const doelen = SCHADUW_MAAT * SCHADUW_MAAT * 4 + CONTACT_MAAT * CONTACT_MAAT * 4 + b * h * (4 * 4 + 4 * 4 + 4)
    return { totaal: geometrie + texturen + doelen, texturen, geometrie, doelen }
  }

  /**
   * De schaduwmaat van de proef (§13): de vloer recht onder de bus en 3 m naast
   * de bus aan de zonkant, van bovenaf, zonder de bus zelf in beeld.
   */
  meetSchaduw(): { onder: number; naast: number; donkerder: number } | undefined {
    const s = this.scene
    if (!s) return undefined
    const gl = this.gl
    const midden: Vec3 = [(s.doos.min[0] + s.doos.max[0]) / 2, 0, (s.doos.min[2] + s.doos.max[2]) / 2]
    // Een camera recht van boven, 40 m hoog, klein beeld.
    const zicht = kijkNaar([midden[0], 40, midden[2] + 0.001], midden, [0, 0, -1])
    const breed = s.doos.max[0] - s.doos.min[0] + 12
    const proj = orthografisch(-breed / 2, breed / 2, -breed / 2, breed / 2, 1, 80)
    const beeldProj = vermenigvuldig(proj, zicht)
    const c: CameraBeeld = { beeld: zicht, proj, beeldProj, oog: [midden[0], 40, midden[2]], doel: midden, dichtbij: 1, ver: 80 }
    const maat = 256
    this.teken(c, maat, maat, { zonderBus: true })
    const lees = (p: Vec3): number => {
      const q = projecteer(beeldProj, p)
      const x = Math.round((q[0] * 0.5 + 0.5) * maat)
      const y = Math.round((q[1] * 0.5 + 0.5) * maat)
      const px = new Uint8Array(4)
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)
      return (px[0] + px[1] + px[2]) / 3
    }
    // Onder de bus: het midden. Naast: 3 m van de zijkant, aan de kant van de zon.
    const onder = lees(midden)
    const kant = this.zonRicht[0] < 0 ? s.doos.min[0] - 3 : s.doos.max[0] + 3
    const naast = lees([kant, 0, midden[2]])
    return { onder, naast, donkerder: naast > 0 ? 1 - onder / naast : 0 }
  }

  /** Telling voor het logboek en de proef. */
  telling(): { driehoeken: number; zichtbaar: number; tekenbeurten: number } {
    const s = this.scene
    if (!s) return { driehoeken: 0, zichtbaar: 0, tekenbeurten: 0 }
    const beurten = s.dicht.length + s.test.length + s.schaduwMeshes.length + s.meng.reduce((n, l) => n + l.length, 0)
    return { driehoeken: s.driehoeken, zichtbaar: s.zichtbareDriehoeken, tekenbeurten: beurten }
  }
}

function afstandKwadraat(a: Vec3, b: Vec3): number {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
}
