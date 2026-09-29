import { textuurPlan, type Bus3dTextuur, type TextuurPlan } from '../../../shared/bus3d'
import { OMZET_FS, SCHERM_VS } from './shaders'

/**
 * TEXTUREN NAAR DE GPU (bus3d-ontwerp §5.7)
 *
 * Er is geen textuurcache: elk bestand komt rechtstreeks uit de OMSI-map
 * (`omsi3d://t/<id>`, op id, met een Range-kop voor een plak), en de GPU doet
 * het zware werk. Per soort (de route staat in het manifest):
 * - `dxt`: gecomprimeerd uploaden, niveau voor niveau uit de stroom, in sRGB.
 *   Eerst de staart (de niveaus tot 128 px, een paar kB) zodat de bus meteen
 *   kleur heeft, daarna de grote niveaus; niveaus boven de doelmaat komen niet
 *   eens van de schijf.
 * - `dxt-zonder-mips` (zijden deelbaar door 4): tijdelijk gecomprimeerd
 *   uploaden, in één tekenstap naar SRGB8_ALPHA8 op de doelmaat, mips door de
 *   GPU, de tijdelijke weg. Niet deelbaar door 4: de ontleder.
 * - `beeld` (PNG, JPEG, gewone BMP): `createImageBitmap` zonder
 *   premultiplicatie en zonder kleurbeheer, dan SRGB8_ALPHA8 en `generateMipmap`.
 * - `eigen` (TGA, BMP32, DDS zonder DXT): de ontleder (ontleder.ts), dan idem.
 * Verkleinen (het textuurplan slaat niveaus over) doet de GPU: volle maat
 * tijdelijk, mips, en niveau k eruit kopiëren. Nooit op de processor en nooit
 * voorvermenigvuldigd: de alfa is bij OMSI vaak het spiegelmasker.
 *
 * Het BUDGET (160 MB, 96 MB zolang OMSI draait) komt uit `textuurPlan`
 * (shared/bus3d.ts). Texturen van een vorige kleurstelling blijven in een LRU van
 * hooguit 64 MB boven het budget (§7), zodat terugwisselen alleen binden is.
 */

const S3TC = {
  RGBA_DXT1: 0x83f1,
  RGBA_DXT3: 0x83f2,
  RGBA_DXT5: 0x83f3,
  SRGB_ALPHA_DXT1: 0x8c4d,
  SRGB_ALPHA_DXT3: 0x8c4e,
  SRGB_ALPHA_DXT5: 0x8c4f
}

export interface Mogelijkheden {
  s3tc: boolean
  s3tcSrgb: boolean
  aniso: number
  anisoExt?: { TEXTURE_MAX_ANISOTROPY_EXT: number }
}

export interface GpuTextuur {
  tex: WebGLTexture
  bytes: number
  b: number
  h: number
  /** S3TC zonder sRGB-uitbreiding: de shader moet nog lineair maken. */
  lineariseer: boolean
  /** Heeft het bestand een alfakanaal (voor een transmap: anders telt de helderheid). */
  heeftAlfa: boolean
  staat: 'staart' | 'vol'
}

interface Ingang {
  sleutel: string
  id: string
  k: number
  gpu?: GpuTextuur
  bezig: boolean
  fout?: string
  gebruikt: number
}

interface Taak {
  prio: number
  doe: () => Promise<void>
}

/** Het uitpakken van TGA en co, in een eigen werker (ontleder.ts). */
export interface Ontleder {
  ontleed(bytes: ArrayBuffer): Promise<{ b: number; h: number; pixels: Uint8Array }>
}

/** Heeft deze textuur een alfakanaal? Op het formaat, niet op de pixels. */
function alfaKanaal(t: Bus3dTextuur, bytes?: Uint8Array): boolean {
  if (t.formaat) return true // DXT1 heeft 1 bit alfa, DXT3/5 een kanaal
  const vorm = t.vorm.toUpperCase()
  if (vorm.startsWith('PNG') && bytes && bytes.length > 26) {
    const soort = bytes[25]
    if (soort === 4 || soort === 6) return true
    // Palet of grijs met een tRNS-blok vóór de beelddata.
    for (let p = 8; p + 8 < Math.min(bytes.length, 1 << 20); ) {
      const len = (bytes[p] << 24) | (bytes[p + 1] << 16) | (bytes[p + 2] << 8) | bytes[p + 3]
      const naam = String.fromCharCode(bytes[p + 4], bytes[p + 5], bytes[p + 6], bytes[p + 7])
      if (naam === 'tRNS') return true
      if (naam === 'IDAT' || len < 0) break
      p += 12 + len
    }
    return false
  }
  if (vorm.startsWith('JPEG')) return false
  return /32|A8|ARGB|RGBA|BGRA|MASKERS/.test(vorm)
}

export class Texturen {
  private ingangen = new Map<string, Ingang>()
  /** Per plek (index in de lijst van de bus, of 'hemel'/'wolken'): welke textuur op welke maat. */
  private doelen = new Map<number | string, { t: Bus3dTextuur; k: number }>()
  private rij: Taak[] = []
  private lopend = 0
  private readonly TEGELIJK = 10
  private samplers: { herhaal: WebGLSampler; klem: WebGLSampler; hemel: WebGLSampler }
  private omzet?: { prog: WebGLProgram; stap: WebGLUniformLocation | null; lin: WebGLUniformLocation | null; bron: WebGLUniformLocation | null }
  private bereikWerkt: boolean | undefined
  private geheleBestanden = new Map<string, Promise<ArrayBuffer>>()
  /** Oplopend bij elk nieuw plan: taken van een oud plan stoppen. */
  private generatie = 0
  laatstePlan?: TextuurPlan
  fouten: string[] = []
  /**
   * Hoeveel texturen van een vorige kleurstelling of bus er hooguit blijven
   * staan: 64 MB (§7), maar nooit zoveel dat het 3D-venster boven 300 MB komt
   * (§10); de tekenaar zet het na elk plan.
   */
  lruMax = 64 * 1024 * 1024
  /**
   * Waar de tijd heen gaat, per route: aantal, wachten (ophalen en uitpakken,
   * buiten deze draad) en het synchrone deel op deze draad (uploaden, mips) --
   * dat laatste houdt het tekenen op.
   */
  stats: Record<string, { n: number; wachtMs: number; syncMs: number; maxSyncMs: number }> = {}
  /** Per textuur wanneer hij klaar was (ms na het eerste plan), voor de proef. */
  tijdlijn: string[] = []
  private planBegin = 0
  private telStat(route: string, wacht: number, sync: number): void {
    if (this.tijdlijn.length < 200) {
      this.tijdlijn.push(`${Math.round(performance.now() - this.planBegin)} ${route} w${Math.round(wacht)} s${Math.round(sync)}`)
    }
    const s = (this.stats[route] ??= { n: 0, wachtMs: 0, syncMs: 0, maxSyncMs: 0 })
    s.n++
    s.wachtMs += wacht
    s.syncMs += sync
    s.maxSyncMs = Math.max(s.maxSyncMs, sync)
  }

  constructor(
    private gl: WebGL2RenderingContext,
    private mag: Mogelijkheden,
    private ontleder: Ontleder,
    /** Er is iets bij gekomen: opnieuw tekenen. */
    private opVerandering: () => void
  ) {
    this.samplers = {
      herhaal: this.maakSampler(gl.REPEAT, true),
      klem: this.maakSampler(gl.CLAMP_TO_EDGE, true),
      hemel: this.maakSampler(gl.REPEAT, false)
    }
  }

  private maakSampler(omslag: number, aniso: boolean): WebGLSampler {
    const gl = this.gl
    const s = gl.createSampler()!
    gl.samplerParameteri(s, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.samplerParameteri(s, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.samplerParameteri(s, gl.TEXTURE_WRAP_S, omslag)
    gl.samplerParameteri(s, gl.TEXTURE_WRAP_T, omslag)
    if (aniso && this.mag.anisoExt && this.mag.aniso > 1) {
      gl.samplerParameterf(s, this.mag.anisoExt.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, this.mag.aniso))
    }
    return s
  }

  sampler(klem: boolean): WebGLSampler {
    return klem ? this.samplers.klem : this.samplers.herhaal
  }

  hemelSampler(): WebGLSampler {
    return this.samplers.hemel
  }

  /** De textuur die nu op deze plek hoort, of een andere maat van dezelfde zolang die nog laadt. */
  voorPlek(plek: number | string): GpuTextuur | undefined {
    const doel = this.doelen.get(plek)
    if (!doel) return undefined
    const ingang = this.ingangen.get(`${doel.t.id}@${doel.k}`)
    if (ingang?.gpu) {
      ingang.gebruikt = performance.now()
      return ingang.gpu
    }
    for (const i of this.ingangen.values()) if (i.id === doel.t.id && i.gpu) return i.gpu
    return undefined
  }

  /**
   * Het plan voor een bus: per plek de textuur (na de lak), welke plekken nu
   * echt getekend worden, het budget, en de voorrang (de carrosserie eerst).
   */
  zetPlan(texturen: Bus3dTextuur[], benodigd: Set<number>, budget: number): TextuurPlan {
    this.generatie++
    const gen = this.generatie
    if (!this.planBegin || this.tijdlijn.length === 0) this.planBegin = performance.now()
    // Wat niet getekend wordt laden we niet; wat wel getekend wordt maar buiten geen oppervlak heeft
    // ([isshadow], alleen in een aanhanger ...) krijgt een klein oppervlak, zodat het plan hem meeneemt.
    const lijst = texturen.map((t, i) =>
      benodigd.has(i) ? { ...t, oppervlak: Math.max(t.oppervlak, 0.05), uv: Math.max(t.uv, 0.05) } : { ...t, oppervlak: 0 }
    )
    // Zonder S3TC pakt deze werker DXT uit naar RGBA: dan rekent het plan ook zo (aanvalsverslag F2, punt 6).
    const plan = textuurPlan(lijst, budget, { s3tc: this.mag.s3tc })
    this.laatstePlan = plan
    for (const sleutel of [...this.doelen.keys()]) if (typeof sleutel === 'number') this.doelen.delete(sleutel)
    const carrosserie = plan.carrosserie
    texturen.forEach((t, i) => {
      const r = plan.regels[i]
      if (!r.laden) return
      this.doelen.set(i, { t, k: r.overslaan })
      /*
       * Voorrang: de carrosserie eerst (§5.7), daarna de duurste eerst -- wie het
       * langst bezig is (een TGA van 2048² in de ontleder, 12 MB) bepaalt wanneer
       * alles scherp staat. Op oppervlak alleen kwam e-main.tga van de O560 als
       * laatste aan de beurt en hield "scherp" 240 ms op. De staart van een DXT
       * gaat hoe dan ook voor (zie `vraag`).
       */
      const factor = t.soort === 'eigen' ? 3 : t.soort === 'beeld' ? 2 : t.soort === 'dxt-zonder-mips' ? 1 : 0.5
      const kosten = (t.bytes / 1e5) * factor
      const prio = (carrosserie && t.ctc === carrosserie ? 1e6 : 0) + kosten + lijst[i].oppervlak * 0.01
      this.vraag(t, r.overslaan, prio, gen)
    })
    this.ruimOp()
    return plan
  }

  /** Wat de losse texturen (hemel, wolken) op de GPU kosten: dat gaat van het budget van de bus af (§5.7: 160 MB per viewer). */
  private losPerNaam = new Map<string, number>()
  losBytes(): number {
    let s = 0
    for (const b of this.losPerNaam.values()) s += b
    return s
  }

  /** Een losse textuur: de hemel en de wolken (hooguit 2048). */
  zetLos(naam: string, t: Bus3dTextuur): void {
    let k = 0
    while (Math.max(t.b >> k, t.h >> k) > 2048) k++
    if (t.soort === 'dxt') k = Math.min(k, Math.max(0, t.mips - 1))
    this.losPerNaam.set(naam, Math.round((Math.max(1, t.b >> k) * Math.max(1, t.h >> k) * 4 * 4) / 3))
    this.doelen.set(naam, { t, k })
    this.vraag(t, k, 2e6, this.generatie, true)
  }

  /** Hoeveel van de plekken van de bus er helemaal (niet alleen de staart) staan. */
  voortgang(): { klaar: number; totaal: number; bezig: number } {
    let klaar = 0
    let totaal = 0
    for (const [plek, doel] of this.doelen) {
      if (typeof plek !== 'number') continue
      totaal++
      const i = this.ingangen.get(`${doel.t.id}@${doel.k}`)
      if (i?.gpu?.staat === 'vol' || i?.fout) klaar++
    }
    return { klaar, totaal, bezig: this.lopend + this.rij.length }
  }

  /** Voor de proef: welke plekken nog niet helemaal staan, en waarom. */
  openDoelen(): string[] {
    const uit: string[] = []
    for (const [plek, doel] of this.doelen) {
      if (typeof plek !== 'number') continue
      const i = this.ingangen.get(`${doel.t.id}@${doel.k}`)
      if (i?.gpu?.staat === 'vol' || i?.fout) continue
      uit.push(`${doel.t.naam}@${doel.k}:${i ? (i.bezig ? 'bezig' : i.gpu ? i.gpu.staat : 'leeg') : 'geen'}`)
    }
    return uit.concat([`rij ${this.rij.length}`, `lopend ${this.lopend}`, `upload ${this.uploadWacht.length}${this.uploadBezig ? '+' : ''}`])
  }

  gpuBytes(): number {
    let s = 0
    for (const i of this.ingangen.values()) s += i.gpu?.bytes ?? 0
    return s
  }

  /** Alles weg (een nieuwe context, of het venster gaat dicht). */
  vergeetAlles(): void {
    for (const i of this.ingangen.values()) if (i.gpu) this.gl.deleteTexture(i.gpu.tex)
    this.ingangen.clear()
    this.doelen.clear()
    this.rij = []
    this.generatie++
  }

  /**
   * De grens van de LRU, en meteen opruimen: `zetPlan` ruimde nog op met de
   * grens van het VORIGE plan, en zo kwam het venster na een tweede grote bus
   * boven 300 MB (aanvalsverslag F2, punt 7).
   */
  zetLruGrens(bytes: number): void {
    this.lruMax = Math.max(0, bytes)
    this.ruimOp()
  }

  /** Wat geen doel meer is naar de LRU; boven 64 MB aan LRU gaat het oudste weg. */
  private ruimOp(): void {
    const inGebruik = new Set<string>()
    for (const d of this.doelen.values()) inGebruik.add(`${d.t.id}@${d.k}`)
    const los = [...this.ingangen.values()].filter((i) => !inGebruik.has(i.sleutel) && !i.bezig)
    los.sort((a, b) => a.gebruikt - b.gebruikt)
    let bytes = los.reduce((s, i) => s + (i.gpu?.bytes ?? 0), 0)
    for (const i of los) {
      if (bytes <= this.lruMax && !i.fout) break
      if (i.gpu) this.gl.deleteTexture(i.gpu.tex)
      bytes -= i.gpu?.bytes ?? 0
      this.ingangen.delete(i.sleutel)
    }
  }

  // ------------------------------------------------------------ de rij
  private vraag(t: Bus3dTextuur, k: number, prio: number, gen: number, los = false): void {
    const sleutel = `${t.id}@${k}`
    const bekend = this.ingangen.get(sleutel)
    if (bekend && (bekend.gpu?.staat === 'vol' || bekend.bezig || bekend.fout)) return
    const ingang: Ingang = bekend ?? { sleutel, id: t.id, k, bezig: false, gebruikt: performance.now() }
    this.ingangen.set(sleutel, ingang)
    ingang.bezig = true
    const nogNodig = (): boolean => los || gen === this.generatie || this.isDoel(sleutel)
    const klaar = (): void => {
      ingang.bezig = false
      this.opVerandering()
    }
    const mislukt = (fout: unknown): void => {
      ingang.bezig = false
      ingang.fout = fout instanceof Error ? fout.message : String(fout)
      this.fouten.push(`${t.naam}: ${ingang.fout}`)
      this.opVerandering()
    }
    if (t.soort === 'dxt' && this.mag.s3tc && t.niveaus && t.niveaus.length > k) {
      const staart = this.staartBegin(t, k)
      if (staart > k) {
        // Eerst de staart (voorrang boven alles wat groot is), dan de rest.
        this.zet({
          prio: 1e7 + prio,
          doe: async () => {
            if (!nogNodig()) return klaar()
            try {
              await this.laadDxt(t, k, ingang, staart, 'staart')
            } catch (fout) {
              return mislukt(fout)
            }
            this.opVerandering()
            this.zet({
              prio,
              doe: async () => {
                if (!nogNodig()) return klaar()
                await this.laadDxt(t, k, ingang, staart, 'vol').then(klaar, mislukt)
              }
            })
          }
        })
        return
      }
      this.zet({ prio: 1e7 + prio, doe: () => this.laadDxt(t, k, ingang, k, 'vol').then(klaar, mislukt) })
      return
    }
    this.zet({
      prio,
      doe: async () => {
        if (!nogNodig()) return klaar()
        await this.laadRgba(t, k, ingang).then(klaar, mislukt)
      }
    })
  }

  private isDoel(sleutel: string): boolean {
    for (const d of this.doelen.values()) if (`${d.t.id}@${d.k}` === sleutel) return true
    return false
  }

  private zet(taak: Taak): void {
    this.rij.push(taak)
    this.pomp()
  }

  private pomp(): void {
    while (this.lopend < this.TEGELIJK && this.rij.length > 0) {
      let beste = 0
      for (let i = 1; i < this.rij.length; i++) if (this.rij[i].prio > this.rij[beste].prio) beste = i
      const [taak] = this.rij.splice(beste, 1)
      this.lopend++
      void taak
        .doe()
        .catch((fout) => this.fouten.push(String(fout)))
        .finally(() => {
          this.lopend--
          this.pomp()
        })
    }
  }

  // ------------------------------------------------------------ ophalen
  /** Een bestand of een plak ervan. Werkt Range niet, dan eenmaal het hele bestand. */
  // ------------------------------------------------------------ uploaden in beurten
  /*
   * Ophalen en uitpakken gebeurt buiten deze draad (stroom, createImageBitmap,
   * de ontleders), maar het uploaden en de mips niet, en wat de GPU daarvoor
   * moet doen komt vóór het volgende beeld. Daarom mag er alleen geüpload
   * worden in de tijd die de werker na een beeld geeft (`geefTijd`): zo komt
   * het eerste beeld van een bus niet achter veertig texturen aan, en hapert
   * slepen tijdens het laden niet (§5.7, "in stukken van ≤ 16 ms").
   */
  private uploadWacht: Array<() => void> = []
  private uploadTot = 0
  private uploadBezig = false

  /** De werker, na een beeld: zoveel ms mag er nu geüpload worden. */
  geefTijd(ms: number): void {
    this.uploadTot = performance.now() + ms
    this.volgendeUpload()
  }

  /** Hoeveel texturen er klaarliggen om geüpload te worden. */
  wachtendeUploads(): number {
    return this.uploadWacht.length
  }

  private volgendeUpload(): void {
    if (this.uploadBezig || this.uploadWacht.length === 0) return
    if (performance.now() >= this.uploadTot) {
      // De tijd is op: een volgend beeld geeft nieuwe tijd.
      this.opVerandering()
      return
    }
    this.uploadBezig = true
    this.uploadWacht.shift()!()
  }

  private uploadBeurt(): Promise<void> {
    return new Promise((k) => {
      this.uploadWacht.push(k)
      this.volgendeUpload()
    })
  }

  private uploadKlaar(): void {
    this.uploadBezig = false
    this.volgendeUpload()
  }

  // ------------------------------------------------------------ vooruit ophalen (§4.1: `lijst`)
  /**
   * Zolang de werker 'bus3d' nog o3d's leest, staat de textuurlijst er al: de
   * bestanden kunnen dan al van de schijf komen, terwijl het plan (dat de
   * oppervlakken nodig heeft) nog moet wachten. Alleen ophalen, niet uitpakken;
   * hooguit 192 MB, en wat na 20 s niet gebruikt is gaat weg.
   */
  private voorraad = new Map<string, Promise<ArrayBuffer>>()
  voorhaal(lijst: Array<{ id: string; bytes: number }>): void {
    let totaal = 0
    const rij = [...lijst].sort((a, b) => a.bytes - b.bytes)
    let volgende = 0
    const werk = async (): Promise<void> => {
      while (volgende < rij.length) {
        const t = rij[volgende++]
        if (this.voorraad.has(t.id) || totaal + t.bytes > 192 * 1024 * 1024) continue
        totaal += t.bytes
        const belofte = fetch(`omsi3d://t/${t.id}`).then((r) => {
          if (!r.ok) throw new Error(`omsi3d ${r.status}`)
          return r.arrayBuffer()
        })
        this.voorraad.set(t.id, belofte)
        setTimeout(() => this.voorraad.delete(t.id), 20000)
        await belofte.catch(() => this.voorraad.delete(t.id))
      }
    }
    for (let i = 0; i < 4; i++) void werk()
  }

  private async haal(id: string, van?: number, tot?: number): Promise<ArrayBuffer> {
    const url = `omsi3d://t/${id}`
    const vooraf = this.voorraad.get(id)
    if (vooraf) {
      try {
        const alles = await vooraf
        return van !== undefined && tot !== undefined ? alles.slice(van, tot + 1) : alles.slice(0)
      } catch {
        this.voorraad.delete(id)
      }
    }
    if (van !== undefined && tot !== undefined && this.bereikWerkt !== false) {
      const r = await fetch(url, { headers: { Range: `bytes=${van}-${tot}` } })
      if (r.status === 206) {
        this.bereikWerkt = true
        return r.arrayBuffer()
      }
      if (r.status === 409) throw new Error('409: het bestand is veranderd')
      if (r.ok) {
        this.bereikWerkt = false
        const alles = await r.arrayBuffer()
        return alles.slice(van, tot + 1)
      }
      throw new Error(`omsi3d ${r.status}`)
    }
    if (van !== undefined && tot !== undefined) {
      // Zonder Range: één keer het hele bestand, gedeeld door de plakken.
      let alles = this.geheleBestanden.get(id)
      if (!alles) {
        alles = this.haal(id)
        this.geheleBestanden.set(id, alles)
        void alles.finally(() => setTimeout(() => this.geheleBestanden.delete(id), 2000))
      }
      return (await alles).slice(van, tot + 1)
    }
    const r = await fetch(url)
    if (!r.ok) throw new Error(`omsi3d ${r.status}`)
    return r.arrayBuffer()
  }

  // ------------------------------------------------------------ DXT
  private dxtFormaat(t: Bus3dTextuur): { fmt: number; lineariseer: boolean } {
    const f = t.formaat ?? 'bc1'
    if (this.mag.s3tcSrgb) {
      return { fmt: f === 'bc1' ? S3TC.SRGB_ALPHA_DXT1 : f === 'bc2' ? S3TC.SRGB_ALPHA_DXT3 : S3TC.SRGB_ALPHA_DXT5, lineariseer: false }
    }
    return { fmt: f === 'bc1' ? S3TC.RGBA_DXT1 : f === 'bc2' ? S3TC.RGBA_DXT3 : S3TC.RGBA_DXT5, lineariseer: true }
  }

  /** Het eerste niveau van de staart: de niveaus van hooguit 128 px, samen een paar kB. */
  private staartBegin(t: Bus3dTextuur, k: number): number {
    const n = t.niveaus?.length ?? 1
    for (let j = k; j < n; j++) if (Math.max(t.b >> j, t.h >> j) <= 128) return j
    return n - 1
  }

  private async laadDxt(t: Bus3dTextuur, k: number, ingang: Ingang, staart: number, deel: 'staart' | 'vol'): Promise<void> {
    const niveaus = t.niveaus!
    const n = niveaus.length
    const van = deel === 'staart' ? staart : k
    const tot = deel === 'staart' ? n - 1 : Math.max(k, staart - 1)
    const eind = deel === 'staart' || staart <= k ? n - 1 : tot
    const t0 = performance.now()
    const bytes = await this.haal(t.id, niveaus[van].off, niveaus[eind].off + niveaus[eind].len - 1)
    await this.uploadBeurt()
    try {
      this.dxtUpload(t, k, ingang, staart, deel, bytes, t0)
    } finally {
      this.uploadKlaar()
    }
  }

  private dxtUpload(t: Bus3dTextuur, k: number, ingang: Ingang, staart: number, deel: 'staart' | 'vol', bytes: ArrayBuffer, t0: number): void {
    const gl = this.gl
    const niveaus = t.niveaus!
    const n = niveaus.length
    const van = deel === 'staart' ? staart : k
    const tot = deel === 'staart' ? n - 1 : Math.max(k, staart - 1)
    const eind = deel === 'staart' || staart <= k ? n - 1 : tot
    const t1 = performance.now()
    const { fmt, lineariseer } = this.dxtFormaat(t)
    let gpu = ingang.gpu
    if (!gpu) {
      const tex = gl.createTexture()!
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.texStorage2D(gl.TEXTURE_2D, n - k, fmt, Math.max(1, t.b >> k), Math.max(1, t.h >> k))
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, n - k - 1)
      let b = 0
      for (let j = k; j < n; j++) b += niveaus[j].len
      gpu = { tex, bytes: b, b: t.b >> k, h: t.h >> k, lineariseer, heeftAlfa: true, staat: 'staart' }
    }
    gl.bindTexture(gl.TEXTURE_2D, gpu.tex)
    const basis = niveaus[van].off
    for (let j = van; j <= eind; j++) {
      const w = Math.max(1, t.b >> j)
      const h = Math.max(1, t.h >> j)
      gl.compressedTexSubImage2D(gl.TEXTURE_2D, j - k, 0, 0, w, h, fmt, new Uint8Array(bytes, niveaus[j].off - basis, niveaus[j].len))
    }
    const alles = deel === 'vol' || staart <= k
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_BASE_LEVEL, alles ? 0 : staart - k)
    gpu.staat = alles ? 'vol' : 'staart'
    ingang.gpu = gpu
    this.telStat(`dxt-${deel}`, t1 - t0, performance.now() - t1)
  }

  // ------------------------------------------------------------ RGBA (beeld, eigen, DXT via de GPU of de ontleder)
  private async laadRgba(t: Bus3dTextuur, k: number, ingang: Ingang): Promise<void> {
    const gl = this.gl
    const t0 = performance.now()
    // DXT zonder mips, zijden deelbaar door 4: gecomprimeerd erin, op doelmaat eruit.
    if ((t.soort === 'dxt-zonder-mips' || t.soort === 'dxt') && this.mag.s3tc && t.b % 4 === 0 && t.h % 4 === 0 && t.niveaus?.length) {
      const n0 = t.niveaus[0]
      const bytes = await this.haal(t.id, n0.off, n0.off + n0.len - 1)
      await this.uploadBeurt()
      try {
        const t1 = performance.now()
        const { fmt, lineariseer } = this.dxtFormaat(t)
        const bron = gl.createTexture()!
        gl.bindTexture(gl.TEXTURE_2D, bron)
        gl.compressedTexImage2D(gl.TEXTURE_2D, 0, fmt, t.b, t.h, 0, new Uint8Array(bytes))
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, 0)
        const kk = Math.min(k, 4)
        const gpu = this.omzetten(bron, t.b, t.h, kk, lineariseer)
        gl.deleteTexture(bron)
        ingang.gpu = { ...gpu, heeftAlfa: true }
        this.telStat('rtt', t1 - t0, performance.now() - t1)
      } finally {
        this.uploadKlaar()
      }
      return
    }
    const tBegin = performance.now()
    const bestand = await this.haal(t.id)
    const tGehaald = performance.now()
    let bron: TexImageSource | { pixels: Uint8Array; b: number; h: number }
    let heeftAlfa: boolean
    if (t.soort === 'beeld' && t.mime) {
      const kop = new Uint8Array(bestand, 0, Math.min(bestand.byteLength, 1 << 20))
      heeftAlfa = alfaKanaal(t, kop)
      bron = await createImageBitmap(new Blob([bestand], { type: t.mime }), {
        premultiplyAlpha: 'none',
        colorSpaceConversion: 'none'
      })
    } else {
      heeftAlfa = alfaKanaal(t)
      bron = await this.ontleder.ontleed(bestand)
    }
    const b = 'pixels' in bron ? bron.b : (bron as ImageBitmap).width
    const h = 'pixels' in bron ? bron.h : (bron as ImageBitmap).height
    const tUitgepakt = performance.now()
    await this.uploadBeurt()
    if (this.tijdlijn.length < 200) {
      this.tijdlijn.push(
        `${t.naam}: begin ${Math.round(tBegin - this.planBegin)} halen ${Math.round(tGehaald - tBegin)} uitpakken ${Math.round(tUitgepakt - tGehaald)} beurt ${Math.round(performance.now() - tUitgepakt)}`
      )
    }
    try {
      const t1 = performance.now()
      const gpu = this.uploadRgba(bron, b, h, k)
      ingang.gpu = { ...gpu, heeftAlfa }
      this.telStat(t.soort === 'beeld' ? 'beeld' : 'eigen', t1 - t0, performance.now() - t1)
    } finally {
      if ('close' in bron && typeof bron.close === 'function') bron.close()
      this.uploadKlaar()
    }
  }

  private niveausVoor(b: number, h: number): number {
    return Math.floor(Math.log2(Math.max(b, h, 1))) + 1
  }

  private zetUpload(): void {
    const gl = this.gl
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE)
  }

  private schrijf(bron: TexImageSource | { pixels: Uint8Array; b: number; h: number }, b: number, h: number): void {
    const gl = this.gl
    if ('pixels' in bron) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, b, h, gl.RGBA, gl.UNSIGNED_BYTE, bron.pixels)
    else gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, bron)
  }

  /** RGBA naar SRGB8_ALPHA8 met mips; bij k > 0 eerst op volle maat, dan niveau k eruit. */
  private uploadRgba(
    bron: TexImageSource | { pixels: Uint8Array; b: number; h: number },
    b: number,
    h: number,
    k: number
  ): Omit<GpuTextuur, 'heeftAlfa'> {
    const gl = this.gl
    this.zetUpload()
    const kk = Math.min(k, this.niveausVoor(b, h) - 1)
    const w = Math.max(1, b >> kk)
    const hh = Math.max(1, h >> kk)
    const tex = gl.createTexture()!
    if (kk === 0) {
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.texStorage2D(gl.TEXTURE_2D, this.niveausVoor(b, h), gl.SRGB8_ALPHA8, b, h)
      this.schrijf(bron, b, h)
      gl.generateMipmap(gl.TEXTURE_2D)
    } else {
      const tijdelijk = gl.createTexture()!
      gl.bindTexture(gl.TEXTURE_2D, tijdelijk)
      gl.texStorage2D(gl.TEXTURE_2D, this.niveausVoor(b, h), gl.SRGB8_ALPHA8, b, h)
      this.schrijf(bron, b, h)
      gl.generateMipmap(gl.TEXTURE_2D)
      const fb = gl.createFramebuffer()
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fb)
      gl.framebufferTexture2D(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tijdelijk, kk)
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.texStorage2D(gl.TEXTURE_2D, this.niveausVoor(w, hh), gl.SRGB8_ALPHA8, w, hh)
      gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, w, hh)
      gl.generateMipmap(gl.TEXTURE_2D)
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null)
      gl.deleteFramebuffer(fb)
      gl.deleteTexture(tijdelijk)
    }
    return { tex, bytes: Math.round((w * hh * 4 * 4) / 3), b: w, h: hh, lineariseer: false, staat: 'vol' }
  }

  /** Een (gecomprimeerde) bron in één tekenstap naar SRGB8_ALPHA8 op de doelmaat, met mips. */
  private omzetten(bron: WebGLTexture, b: number, h: number, k: number, lineariseer: boolean): Omit<GpuTextuur, 'heeftAlfa'> {
    const gl = this.gl
    if (!this.omzet) {
      const prog = maakProgramma(gl, SCHERM_VS, OMZET_FS)
      this.omzet = {
        prog,
        stap: gl.getUniformLocation(prog, 'uStap'),
        lin: gl.getUniformLocation(prog, 'uLineariseer'),
        bron: gl.getUniformLocation(prog, 'uBron')
      }
    }
    const w = Math.max(1, b >> k)
    const hh = Math.max(1, h >> k)
    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texStorage2D(gl.TEXTURE_2D, this.niveausVoor(w, hh), gl.SRGB8_ALPHA8, w, hh)
    const fb = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
    gl.viewport(0, 0, w, hh)
    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.BLEND)
    gl.disable(gl.CULL_FACE)
    gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE)
    gl.useProgram(this.omzet.prog)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, bron)
    gl.bindSampler(0, null)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.uniform1i(this.omzet.bron, 0)
    gl.uniform1i(this.omzet.stap, 1 << k)
    gl.uniform1i(this.omzet.lin, lineariseer ? 1 : 0)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.deleteFramebuffer(fb)
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.generateMipmap(gl.TEXTURE_2D)
    return { tex, bytes: Math.round((w * hh * 4 * 4) / 3), b: w, h: hh, lineariseer: false, staat: 'vol' }
  }
}

export function maakProgramma(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const maak = (soort: number, bron: string): WebGLShader => {
    const s = gl.createShader(soort)!
    gl.shaderSource(s, bron)
    gl.compileShader(s)
    return s
  }
  const prog = gl.createProgram()!
  const v = maak(gl.VERTEX_SHADER, vs)
  const f = maak(gl.FRAGMENT_SHADER, fs)
  gl.attachShader(prog, v)
  gl.attachShader(prog, f)
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = `${gl.getShaderInfoLog(v) ?? ''}\n${gl.getShaderInfoLog(f) ?? ''}\n${gl.getProgramInfoLog(prog) ?? ''}`
    throw new Error(`shader: ${log.trim()}`)
  }
  return prog
}
