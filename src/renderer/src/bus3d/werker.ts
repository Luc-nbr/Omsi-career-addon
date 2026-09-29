import { heldenSleutel, type Bus3dLak, type Bus3dManifest, type Bus3dMeting } from '../../../shared/bus3d'
import { klok, type AfdrukVraag, type NaarWerker, type StandBericht, type VanWerker } from './berichten'
import { Camera } from './camera'
import { LICHT, Tekenaar, zetLicht } from './teken'
import type { Mogelijkheden, Ontleder } from './texturen'

/**
 * DE RENDERER-WERKER VAN HET 3D-VENSTER (bus3d-ontwerp §4.4)
 *
 * Eén per venster, met een eigen OffscreenCanvas en één WebGL2-context die blijft
 * zolang het venster leeft. Elke viewer in het venster heeft een gewoon
 * `<canvas>` met een `bitmaprenderer`: de werker tekent op de maat van die
 * viewer, doet `transferToImageBitmap()` en stuurt het beeld. Zo bindt geen
 * enkel doek de context (`transferControlToOffscreen` kan maar één keer, en React
 * StrictMode mount twee keer), en is wisselen van bus of doel in hetzelfde venster
 * alleen aan- en afmelden.
 *
 * Er wordt alleen getekend als er iets verandert (camera, een textuur erbij, een
 * andere maat of lak), en hooguit twee beelden onderweg: wat het venster nog niet
 * liet zien, wordt niet ingehaald maar vervangen.
 */

interface Viewer {
  id: number
  b: number
  h: number
  dpr: number
  camera: Camera
  inVlucht: number
  pauze: boolean
  /** Het draaiplateau van de dealerstand (§6), en wanneer er voor het laatst invoer was. */
  plateau: boolean
  laatsteInvoer: number
}

const doel = self as unknown as {
  onmessage: ((e: MessageEvent<NaarWerker>) => void) | null
  postMessage(bericht: VanWerker, overdracht?: Transferable[]): void
  requestAnimationFrame?: (cb: (t: number) => void) => number
}
const stuur = (b: VanWerker, overdracht?: Transferable[]): void => doel.postMessage(b, overdracht)

// ------------------------------------------------------------ de ontleders (TGA en co)
/**
 * De ontleders: een paar werkers voor TGA en co (één 2048² TGA kost 25-40 ms).
 * Op Lucs pc (16 draden) vijf; een klus gaat naar de werker met de minste in
 * de wacht. De O560 heeft er 16, de NLC 18C 19: met twee werkers was dat het
 * langste pad naar "alles scherp".
 */
function maakOntleders(): Ontleder {
  const aantal = Math.max(2, Math.min(5, Math.floor((navigator.hardwareConcurrency || 4) / 3)))
  const werkers: Array<{ w: Worker; bezig: number }> = []
  const wachtend = new Map<number, { klaar: (u: { b: number; h: number; pixels: Uint8Array }) => void; fout: (e: Error) => void; wie: number }>()
  let volgende = 0
  for (let i = 0; i < aantal; i++) {
    const w = new Worker(new URL('./ontleder.ts', import.meta.url), { type: 'module' })
    w.onmessage = (e: MessageEvent<{ id: number; fout?: string; b: number; h: number; pixels: ArrayBuffer }>) => {
      const v = wachtend.get(e.data.id)
      if (!v) return
      wachtend.delete(e.data.id)
      werkers[v.wie].bezig--
      if (e.data.fout) v.fout(new Error(e.data.fout))
      else v.klaar({ b: e.data.b, h: e.data.h, pixels: new Uint8Array(e.data.pixels) })
    }
    werkers.push({ w, bezig: 0 })
  }
  return {
    ontleed: (bytes) =>
      new Promise((klaar, fout) => {
        const id = ++volgende
        let wie = 0
        for (let i = 1; i < werkers.length; i++) if (werkers[i].bezig < werkers[wie].bezig) wie = i
        werkers[wie].bezig++
        wachtend.set(id, { klaar, fout, wie })
        werkers[wie].w.postMessage({ id, bytes }, [bytes])
      })
  }
}

// ------------------------------------------------------------ de context
let doek: OffscreenCanvas
let gl: WebGL2RenderingContext | null = null
let tekenaar: Tekenaar | undefined
let mag: Mogelijkheden = { s3tc: false, s3tcSrgb: false, aniso: 1 }
const ontleder = maakOntleders()
const viewers = new Map<number, Viewer>()
let actief: Viewer | undefined
let contextWeg = false
/** De context is weg omdat het venster pauzeerde (§9): dat is geen fout, en hervatten brengt hem terug. */
let bewustWeg = false
/** Vooraf opgehaald: op een verloren context geeft getExtension niets meer. */
let verlies: WEBGL_lose_context | null = null
let herstellingen = 0
/** Zolang de geometrie van een bus binnenkomt: dan eerst die, de texturen wachten. */
let geometrieBezig = false

/**
 * Een context die onverwacht wegging (§9): de eerste keer stil herstellen, de
 * tweede keer de foto met [Opnieuw]. Dan herstelt de werker niet vanzelf; een
 * nieuwe bus ([Opnieuw]) maakt een verse context als de oude niet terugkwam.
 */
let wachtOpOpnieuw = false

/** Laadtijden en stand opnieuw: na een hersteld beeld begint de bus weer van voren (aanvalsverslag F2, punt 4). */
function laadOpnieuwBegonnen(): void {
  laad.eersteBeeld = undefined
  laad.scherp = undefined
  laad.schaduwNaScherp = false
  laad.laatsteStand = 0
  laad.mijlpalen = {}
  laad.t0 = klok()
}

function maakContext(): boolean {
  doek = new OffscreenCanvas(16, 16)
  const dit = doek
  doek.addEventListener('webglcontextlost', (e) => {
    e.preventDefault()
    if (dit !== doek) return
    contextWeg = true
    if (bewustWeg) {
      /*
       * Het venster was al weer terug voordat dit bericht kwam (pauze kort aan en
       * uit): nu pas kan de context terug. Eerst werd dan niets hersteld, en bleef
       * het venster voorgoed op de foto (aanvalsverslag F2, punt 3).
       */
      // Pas NA dit bericht: Chromium staat herstellen pas toe als de handler met preventDefault klaar is.
      if (actief && !actief.pauze) setTimeout(herstel, 0)
      return
    }
    herstellingen++
    if (herstellingen >= 2) {
      wachtOpOpnieuw = true
      stuur({ soort: 'fout', viewer: actief?.id ?? 0, laad: laad.nr, reden: 'context-weg' })
    }
  })
  doek.addEventListener('webglcontextrestored', () => {
    if (dit !== doek) return
    contextWeg = false
    const bewust = bewustWeg
    bewustWeg = false
    // Intussen weer gepauzeerd: meteen weer vrijgeven in plaats van de bus te laden.
    if (actief?.pauze && bewust) {
      bewustWeg = true
      contextWeg = true
      verlies?.loseContext()
      return
    }
    try {
      bouwTekenaar()
      laadOpnieuwBegonnen()
      if (laad.bericht && !wachtOpOpnieuw) void laadBus(laad.bericht)
    } catch (fout) {
      stuur({ soort: 'fout', viewer: actief?.id ?? 0, laad: laad.nr, reden: 'fout', detail: String(fout) })
    }
  })
  // Geen MSAA en geen diepte op het doek zelf: de tekenaar heeft een eigen MSAA-framebuffer (zie teken.ts).
  gl = doek.getContext('webgl2', {
    antialias: false,
    alpha: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance'
  }) as WebGL2RenderingContext | null
  verlies = gl?.getExtension('WEBGL_lose_context') ?? null
  return Boolean(gl)
}

/** Een bewust opgegeven context terughalen; lukt het nog niet (het lost-bericht kwam nog niet), dan doet dat bericht het. */
function herstel(): void {
  if (!verlies || !gl?.isContextLost() || actief?.pauze) return
  try {
    verlies.restoreContext()
  } catch {
    // Nog niet toegestaan: de lost-handler herstelt zodra zijn bericht er is.
  }
}

/** [Opnieuw] na een tweede verlies: de oude context terug als hij er is, anders een verse. */
function naVerliesOpnieuw(): void {
  wachtOpOpnieuw = false
  herstellingen = 0
  if (!contextWeg && gl && !gl.isContextLost()) return
  if (maakContext()) bouwTekenaar()
  else stuur({ soort: 'fout', viewer: actief?.id ?? 0, laad: laad.nr, reden: 'geen-webgl' })
}

function bouwTekenaar(): void {
  if (!gl) return
  const s3tc = gl.getExtension('WEBGL_compressed_texture_s3tc')
  const srgb = gl.getExtension('WEBGL_compressed_texture_s3tc_srgb')
  const aniso = gl.getExtension('EXT_texture_filter_anisotropic')
  gl.getExtension('KHR_parallel_shader_compile')
  mag = {
    s3tc: Boolean(s3tc),
    s3tcSrgb: Boolean(s3tc && srgb),
    aniso: aniso ? (gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number) : 1,
    anisoExt: aniso ?? undefined
  }
  tekenaar = new Tekenaar(gl, mag, ontleder, () => plan())
  if (omgeving) tekenaar.zetOmgeving(omgeving)
}

let omgeving: Parameters<Tekenaar['zetOmgeving']>[0] | undefined

// ------------------------------------------------------------ laden
const laad: {
  nr: number
  bericht?: Extract<NaarWerker, { soort: 'bus' }>
  t0: number
  eersteBeeld?: number
  scherp?: number
  laatsteStand: number
  gpuTotaal: number
  heldGedaan: Set<string>
  /** Waar de tijd heen ging (ms na t0), voor de proef en het logboek. */
  mijlpalen: Record<string, number>
  schaduwNaScherp?: boolean
} = { nr: 0, t0: 0, laatsteStand: 0, gpuTotaal: 0, heldGedaan: new Set(), mijlpalen: {} }

/** Een kort spoor van wat de werker na het laatste 'bus'-bericht deed (voor de proef). */
const spoor: string[] = []
const zetSpoor = (w: string): void => {
  if (spoor.length < 80 && !w.startsWith('tik via')) spoor.push(`${Math.round(klok() - laad.t0)} ${w}`)
}

const mijlpaal = (naam: string): void => {
  laad.mijlpalen[naam] ??= Math.round(klok() - laad.t0)
}

/**
 * Het textuurbudget van de bus (§5.7): 160 MB per viewer (96 zolang OMSI draait),
 * min wat hemel en wolken al kosten -- en nooit zoveel dat het venster samen
 * met de geometrie en de doelen (schaduwkaart, MSAA, doek) boven 300 MB komt
 * (§10). Bij de NLC 18C (48 MB geometrie) scheelt dat een paar MB.
 */
function budget(b: Extract<NaarWerker, { soort: 'bus' }>): number {
  const MB = 1024 * 1024
  const los = tekenaar?.texturen.losBytes() ?? 0
  const v = viewers.get(b.viewer)
  const vast = tekenaar?.gpuBytes(v?.b || 1920, v?.h || 1080)
  const doelen = vast?.doelen ?? 100 * MB
  // De geometrie op de GPU: gemeten als de bus er staat; anders geschat (32-bits indices en de samengevoegde erbij).
  const scene = tekenaar?.scene?.manifest.pakket === b.manifest.pakket ? tekenaar.scene : undefined
  // (de samengevoegde indices komen er pas bij het bouwen van de lijsten bij: dan zo groot als alle indices gerekend)
  const geometrie = scene && vast ? vast.geometrie + (scene.bytes.samen ? 0 : scene.bytes.indices) : b.manifest.bytes.geometrie * 1.5
  const eigen = (LICHT.textuurBudgetMB > 0 ? LICHT.textuurBudgetMB : b.licht ? 96 : 160) * MB - los
  const venster = 300 * MB - geometrie - doelen - los
  return Math.max(16 * MB, Math.min(eigen, LICHT.textuurBudgetMB > 0 ? eigen : venster))
}

async function laadBus(b: Extract<NaarWerker, { soort: 'bus' }>): Promise<void> {
  const nr = b.laad
  const t = tekenaar
  const v = viewers.get(b.viewer)
  if (!t || !v) return
  const zelfdePakket = t.scene?.manifest.pakket === b.manifest.pakket
  /*
   * De lak die NU gevraagd is: een kleurstelling die tijdens het laden werd
   * aangeklikt komt als 'lak' en staat dan in laad.bericht, niet in b
   * (aanvalsverslag F2, punt 1: de lijst zei Alheim, de bus bleef wit).
   */
  const nuLak = (): Bus3dLak | undefined => (nr === laad.nr && laad.bericht ? laad.bericht.lak : b.lak)
  try {
    if (!zelfdePakket) {
      geometrieBezig = true
      const gezet = await t.laadBus(
        b.manifest,
        () => new Promise((klaar) => setTimeout(klaar, 0)),
        () => nr === laad.nr,
        // De kop is binnen: de texturen al laden terwijl de hoekpunten nog komen.
        (kop) => {
          if (nr !== laad.nr) return
          mijlpaal('kop')
          t.voorlopigPlan(kop, b.manifest, nuLak(), budget(b))
        }
      )
      geometrieBezig = false
      if (!gezet || nr !== laad.nr) return
      mijlpaal('geometrie')
      zetDoos(v, b.manifest)
    }
    t.zetLak(nuLak(), budget(b))
    mijlpaal('lak')
    plan()
  } catch (fout) {
    geometrieBezig = false
    if (nr !== laad.nr) return
    const tekst = fout instanceof Error ? fout.message : String(fout)
    const stuk = /B3D1|afgekapt|pakketversie|JSON|hoort niet/i.test(tekst)
    stuur({ soort: 'fout', viewer: b.viewer, laad: nr, reden: stuk ? 'pakket-stuk' : 'fout', detail: tekst, pakket: b.manifest.pakket })
  }
}

function zetDoos(v: Viewer, m: Bus3dManifest): void {
  const d = m.doos
  v.camera.zetDoos([-d.max[0], d.min[1], d.min[2]], [-d.min[0], d.max[1], d.max[2]])
  v.camera.herbegin()
}

// ------------------------------------------------------------ tekenen
let gepland = false
let laatsteTik = 0
const beeldtijden: number[] = []

function plan(): void {
  if (gepland || !actief || actief.pauze || contextWeg) return
  gepland = true
  let gedaan = false
  const doe = (bron: string): void => {
    if (gedaan) return
    gedaan = true
    gepland = false
    zetSpoor(`tik via ${bron}`)
    tik()
  }
  // requestAnimationFrame volgt het scherm; een verborgen venster geeft er soms geen, dan na 16 ms.
  if (doel.requestAnimationFrame) doel.requestAnimationFrame(() => doe('raf'))
  setTimeout(() => doe('klok'), 16)
}

function maatDoek(b: number, h: number): void {
  if (doek.width !== b || doek.height !== h) {
    doek.width = b
    doek.height = h
  }
}

function tik(): void {
  const v = actief
  const t = tekenaar
  // Ook een al gepland beeld niet op een verloren context: dat gaf bij elke pauze "ImageBitmap construction failed".
  if (!v || !t || !gl || v.b < 2 || v.h < 2 || contextWeg || v.pauze || gl.isContextLost() || afdrukBezig) {
    return zetSpoor(`tik weg: ${v?.b}x${v?.h}`)
  }
  if (v.inVlucht >= 2) return zetSpoor('tik weg: onderweg') // 'gezien' plant het volgende beeld
  /*
   * Een andere bus gevraagd en zijn geometrie is er nog niet: de vorige niet
   * meer tekenen. Zijn texturen zijn dan al uit het plan, en hij stond als
   * kleimodel onder het zijpaneel van de nieuwe bus (beeldbeoordeling F2). De
   * viewer houdt intussen de foto van de nieuwe bus in beeld.
   */
  if (laad.bericht && t.scene && t.scene.manifest.pakket !== laad.bericht.manifest.pakket) return zetSpoor('tik weg: vorige bus')
  const nu = performance.now()
  const dt = laatsteTik ? (nu - laatsteTik) / 1000 : 0
  laatsteTik = nu
  const beweegt = v.camera.stap(Math.min(dt, 0.1))
  maatDoek(v.b, v.h)
  /*
   * Zodra alles scherp staat de schaduwkaart één keer opnieuw: roosters en gaas
   * (alfatest) wierpen zolang hun textuur laadde een dichte schaduw. Vóór het
   * tekenen, zodat ook het heldenbeeld de goede schaduw heeft.
   */
  const bijna = t.texturen.voortgang()
  if (t.scene && !laad.schaduwNaScherp && bijna.bezig === 0 && bijna.klaar === bijna.totaal) {
    laad.schaduwNaScherp = true
    t.scene.schaduwVuil = true
  }
  t.teken(v.camera.beeld(v.b / v.h), v.b, v.h)
  const scene = t.scene
  const voortgang = t.texturen.voortgang()
  const scherp = Boolean(scene) && voortgang.bezig === 0 && voortgang.klaar === voortgang.totaal

  // Het heldenbeeld: één keer per bus, kleurstelling en maatklasse, zodra alles scherp staat (§9).
  const b = laad.bericht
  let held: Promise<Blob> | undefined
  let heldSleutel = ''
  if (scherp && !beweegt && scene && b && !b.licht && !b.foto) {
    heldSleutel = heldenSleutel(v.b / v.h, v.dpr)
    const k = `${scene.manifest.pakket}|${b.lak?.kleurstelling ?? ''}|${heldSleutel}`
    if (!laad.heldGedaan.has(k)) {
      laad.heldGedaan.add(k)
      held = doek.convertToBlob({ type: 'image/webp', quality: 0.9 })
    }
  }
  const bitmap = doek.transferToImageBitmap()
  beeldtijden.push(performance.now() - nu)
  if (beeldtijden.length > 120) beeldtijden.shift()
  v.inVlucht++
  stuur({ soort: 'beeld', viewer: v.id, bitmap, laad: laad.nr }, [bitmap])

  if (held && scene && b) {
    const pakket = scene.manifest.pakket
    const kleurstelling = b.lak?.kleurstelling
    void held.then(
      async (blob) => {
        const webp = await blob.arrayBuffer()
        stuur({ soort: 'held', viewer: v.id, pakket, kleurstelling, sleutel: heldSleutel, webp }, [webp])
      },
      () => undefined
    )
  }

  // De stand: eerste beeld, voortgang van de texturen, scherp.
  if (scene && b && scene.manifest.pakket === b.manifest.pakket) {
    if (laad.eersteBeeld === undefined) {
      laad.eersteBeeld = klok() - laad.t0
      mijlpaal('eersteTik')
      laad.mijlpalen.eersteTikMs = Math.round(performance.now() - nu)
      meldStand(v, 'geometrie', voortgang)
    }
    if (scherp && laad.scherp === undefined) {
      laad.scherp = klok() - laad.t0
      meldStand(v, 'scherp', voortgang)
    } else if (!scherp && nu - laad.laatsteStand > 250) {
      laad.laatsteStand = nu
      meldStand(v, 'texturen', voortgang)
      zetSpoor(`open: ${t.texturen.openDoelen().slice(-8).join(', ')}`)
    }
  }
  // Na het beeld: tijd om texturen te uploaden (niet zolang de geometrie nog binnenkomt).
  if (!geometrieBezig) t.texturen.geefTijd(6)
  // Het draaiplateau: 6°/s zodra er 6 s geen invoer was (§6); nooit in de lichte stand.
  const draait = v.plateau && !b?.licht && performance.now() - v.laatsteInvoer > PLATEAU_WACHT
  if (draait) v.camera.draai(6 * Math.min(dt, 0.1))
  // Doortekenen zolang de camera beweegt of er texturen klaarliggen; anders plant een nieuwe textuur zelf een beeld.
  if (beweegt || draait || t.texturen.wachtendeUploads() > 0) plan()
}

const PLATEAU_WACHT = 6000
let plateauKlok: ReturnType<typeof setTimeout> | undefined
/** Na invoer: het plateau pas weer na 6 s rust laten draaien (het beeld wordt dan vanzelf gepland). */
function wekPlateau(v: Viewer): void {
  v.laatsteInvoer = performance.now()
  if (plateauKlok) clearTimeout(plateauKlok)
  plateauKlok = undefined
  if (v.plateau) plateauKlok = setTimeout(() => plan(), PLATEAU_WACHT + 50)
}

function kwantiel(lijst: number[], q: number): number {
  if (lijst.length === 0) return 0
  const s = [...lijst].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))]
}

function meldStand(v: Viewer, fase: StandBericht['fase'], voortgang: { klaar: number; totaal: number }): void {
  const t = tekenaar!
  const b = laad.bericht!
  const bytes = t.gpuBytes(v.b, v.h)
  let meting: Bus3dMeting | undefined
  if (fase === 'scherp') {
    meting = {
      pakket: b.manifest.pakket,
      bron: b.bron,
      eersteBeeldMs: Math.round(laad.eersteBeeld ?? 0),
      scherpMs: Math.round(laad.scherp ?? 0),
      p50: kwantiel(beeldtijden, 0.5),
      p95: kwantiel(beeldtijden, 0.95),
      gpuBytes: bytes.totaal,
      dpr: v.dpr,
      driehoeken: t.telling().zichtbaar,
      texturenMB: Math.round(bytes.texturen / 1048576)
    }
  }
  stuur({
    soort: 'stand',
    viewer: v.id,
    laad: b.laad,
    fase,
    klaar: voortgang.klaar,
    totaal: voortgang.totaal,
    eersteBeeldMs: laad.eersteBeeld !== undefined ? Math.round(laad.eersteBeeld) : undefined,
    scherpMs: laad.scherp !== undefined ? Math.round(laad.scherp) : undefined,
    meting,
    mijlpalen: { ...laad.mijlpalen }
  })
}

// ------------------------------------------------------------ afdrukken en meten (de proef, het heldenbeeld)
let afdrukBezig = false

async function afdruk(v: Viewer, a: AfdrukVraag): Promise<{ beeld: ArrayBuffer; masker?: ArrayBuffer; id?: ArrayBuffer; idTabel?: unknown }> {
  const t = tekenaar!
  const vorige = { b: doek.width, h: doek.height }
  // Geen gewone beelden tussendoor: die zetten het doek terug op de maat van de viewer.
  afdrukBezig = true
  try {
    return await afdrukZelf(v, a, t, vorige)
  } finally {
    afdrukBezig = false
    plan()
  }
}

async function afdrukZelf(
  v: Viewer,
  a: AfdrukVraag,
  t: Tekenaar,
  vorige: { b: number; h: number }
): Promise<{ beeld: ArrayBuffer; masker?: ArrayBuffer; id?: ArrayBuffer; idTabel?: unknown }> {
  if (a.foto) return { beeld: await fotoV4(v, a, t) }
  maatDoek(a.b, a.h)
  const cam = v.camera.beeld(a.b / a.h, { stand: a.stand, doel: a.doel, afstand: a.afstand })
  t.teken(cam, a.b, a.h)
  const beeld = await (await doek.convertToBlob({ type: a.formaat === 'webp' ? 'image/webp' : 'image/png', quality: 0.92 })).arrayBuffer()
  let masker: ArrayBuffer | undefined
  if (a.masker) {
    maatDoek(a.b, a.h)
    t.teken(cam, a.b, a.h, { vlak: true })
    masker = await (await doek.convertToBlob({ type: 'image/png' })).arrayBuffer()
  }
  let id: ArrayBuffer | undefined
  let idTabel: unknown
  if (a.id) {
    maatDoek(a.b, a.h)
    t.teken(cam, a.b, a.h, { id: true })
    idTabel = t.idTabel
    id = await (await doek.convertToBlob({ type: 'image/png' })).arrayBuffer()
  }
  // Wat er nog in het doek stond, niet laten zien: het volgende gewone beeld overschrijft het.
  doek.transferToImageBitmap().close()
  maatDoek(vorige.b, vorige.h)
  return { beeld, masker, id, idTabel }
}

/**
 * De foto v4 (§9): doorzichtig, 215°/8°, strak op 88% van de breedte. De
 * tekenaar geeft voorvermenigvuldigde pixels van onder naar boven (zie
 * `leesFoto`); hier omgedraaid en teruggedeeld, dan via een 2D-doek naar WebP.
 * Het gewone doek is dicht (`alpha:false`) en kan geen doorzichtig beeld maken.
 */
async function fotoV4(v: Viewer, a: AfdrukVraag, t: Tekenaar): Promise<ArrayBuffer> {
  const cam = v.camera.fotoBeeld(a.b / a.h, 0.88)
  const px = t.leesFoto(cam, a.b, a.h)
  const uit = new Uint8ClampedArray(a.b * a.h * 4)
  const rij = a.b * 4
  for (let y = 0; y < a.h; y++) {
    const van = (a.h - 1 - y) * rij
    const naar = y * rij
    for (let x = 0; x < rij; x += 4) {
      const alfa = px[van + x + 3]
      if (alfa === 0) continue
      const f = 255 / alfa
      uit[naar + x] = px[van + x] * f
      uit[naar + x + 1] = px[van + x + 1] * f
      uit[naar + x + 2] = px[van + x + 2] * f
      uit[naar + x + 3] = alfa
    }
  }
  const plat = new OffscreenCanvas(a.b, a.h)
  const ctx = plat.getContext('2d')!
  ctx.putImageData(new ImageData(uit, a.b, a.h), 0, 0)
  return (await plat.convertToBlob({ type: 'image/webp', quality: 0.9 })).arrayBuffer()
}

function meetDraaien(v: Viewer, beelden: number): { p50: number; p95: number; max: number; beelden: number } {
  const t = tekenaar!
  const g = gl!
  const tijden: number[] = []
  const px = new Uint8Array(4)
  maatDoek(v.b, v.h)
  const begin = { ...v.camera.nu }
  for (let i = 0; i < beelden; i++) {
    const t0 = performance.now()
    const stand = { ...begin, draai: begin.draai + (i * 360) / beelden }
    t.teken(v.camera.beeld(v.b / v.h, { stand }), v.b, v.h)
    // Wachten tot de GPU klaar is: dan telt het tekenen zelf mee, niet alleen het versturen.
    g.readPixels(0, 0, 1, 1, g.RGBA, g.UNSIGNED_BYTE, px)
    tijden.push(performance.now() - t0)
  }
  doek.transferToImageBitmap().close()
  plan()
  return { p50: kwantiel(tijden, 0.5), p95: kwantiel(tijden, 0.95), max: Math.max(...tijden), beelden }
}

// ------------------------------------------------------------ berichten
function viewerVan(id: number): Viewer {
  let v = viewers.get(id)
  if (!v) {
    v = { id, b: 0, h: 0, dpr: 1, camera: new Camera(), inVlucht: 0, pauze: false, plateau: false, laatsteInvoer: 0 }
    viewers.set(id, v)
  }
  return v
}

doel.onmessage = (e) => {
  const m = e.data
  if (m.soort === 'viewer') {
    const v = viewerVan(m.viewer)
    v.b = Math.max(0, Math.round(m.b))
    v.h = Math.max(0, Math.round(m.h))
    v.dpr = m.dpr
    actief ??= v
    plan()
  } else if (m.soort === 'weg') {
    viewers.delete(m.viewer)
    if (actief?.id === m.viewer) actief = [...viewers.values()][0]
  } else if (m.soort === 'voorhaal') {
    tekenaar?.texturen.voorhaal(m.lijst)
  } else if (m.soort === 'licht') {
    zetLicht(m.licht)
    if (tekenaar?.scene) {
      tekenaar.scene.schaduwVuil = true
      if (laad.bericht) tekenaar.zetLak(laad.bericht.lak, budget(laad.bericht))
    }
    plan()
  } else if (m.soort === 'omgeving') {
    omgeving = m.omgeving
    tekenaar?.zetOmgeving(m.omgeving)
    plan()
  } else if (m.soort === 'bus') {
    const v = viewerVan(m.viewer)
    actief = v
    // Na een tweede verlies is dit [Opnieuw]: de context terug, of een verse.
    if (wachtOpOpnieuw) naVerliesOpnieuw()
    const nieuw = laad.bericht?.manifest.pakket !== m.manifest.pakket
    laad.nr = m.laad
    laad.bericht = m
    laad.t0 = m.t0
    laad.mijlpalen = {}
    spoor.length = 0
    mijlpaal('bericht')
    laad.eersteBeeld = undefined
    laad.scherp = undefined
    laad.schaduwNaScherp = false
    if (nieuw) beeldtijden.length = 0
    void laadBus(m)
  } else if (m.soort === 'lak') {
    const b = laad.bericht
    if (!b) return
    /*
     * Altijd onthouden, ook als de bus nog laadt: laadBus neemt na de geometrie
     * de lak uit laad.bericht. Eerst viel een lak zonder scene weg, en kwam een
     * lak tijdens het laden van een tweede bus op de scene van de VORIGE bus
     * terecht (aanvalsverslag F2, punt 1).
     */
    laad.bericht = { ...b, lak: m.lak }
    if (tekenaar?.scene?.manifest.pakket !== b.manifest.pakket) return
    laad.scherp = undefined
    laad.eersteBeeld = undefined
    laad.schaduwNaScherp = false
    laad.laatsteStand = 0
    laad.t0 = m.t0
    laad.mijlpalen = {}
    spoor.length = 0
    mijlpaal('bericht')
    tekenaar.zetLak(m.lak as Bus3dLak, budget(b))
    plan()
  } else if (m.soort === 'invoer') {
    const v = viewerVan(m.viewer)
    const i = m.invoer
    if (i.soort === 'sleep') v.camera.sleep(i.dx, i.dy)
    else if (i.soort === 'zoom') v.camera.zoomStap(i.factor)
    else if (i.soort === 'stand') v.camera.stand(i.stand)
    else if (i.soort === 'draai') v.camera.draai(i.graden)
    else if (i.soort === 'kantel') v.camera.kantel(i.graden)
    wekPlateau(v)
    plan()
  } else if (m.soort === 'gezien') {
    const v = viewers.get(m.viewer)
    if (v) {
      v.inVlucht = Math.max(0, v.inVlucht - 1)
      plan()
    }
  } else if (m.soort === 'plateau') {
    const v = viewerVan(m.viewer)
    v.plateau = m.aan
    wekPlateau(v)
  } else if (m.soort === 'pauze') {
    const v = viewerVan(m.viewer)
    v.pauze = m.aan
    /*
     * Pauze met vrijgeven (§9): de context weg, en daarmee alle texturen en
     * buffers op de GPU. Bij hervatten komt hij terug en laadt de werker de bus
     * opnieuw (de bestanden staan dan in de cache van Chromium).
     *
     * `contextWeg` meteen: het lost-bericht komt pas later. Kwam "geen pauze"
     * daarvóór, dan werd er niet hersteld en bleef het venster dood
     * (aanvalsverslag F2, punt 3); nu herstelt hervatten, of anders het
     * lost-bericht zelf.
     */
    if (m.aan && m.vrijgeven && !contextWeg && verlies) {
      bewustWeg = true
      contextWeg = true
      verlies.loseContext()
    }
    if (!m.aan && bewustWeg) herstel()
    if (!m.aan) plan()
  } else if (m.soort === 'afdruk') {
    const v = viewerVan(m.viewer)
    if (!tekenaar || contextWeg || gl?.isContextLost()) return stuur({ soort: 'antwoord', vraag: m.vraag, uitkomst: { fout: 'geen webgl' } })
    void afdruk(v, m.afdruk).then(
      (u) => stuur({ soort: 'antwoord', vraag: m.vraag, uitkomst: u }, [u.beeld, ...(u.masker ? [u.masker] : []), ...(u.id ? [u.id] : [])]),
      (fout) => stuur({ soort: 'antwoord', vraag: m.vraag, uitkomst: { fout: String(fout) } })
    )
  } else if (m.soort === 'meet') {
    const v = viewerVan(m.viewer)
    const t = tekenaar
    if (!t || contextWeg || gl?.isContextLost()) return stuur({ soort: 'antwoord', vraag: m.vraag, uitkomst: { fout: 'geen webgl' } })
    let uitkomst: unknown
    if (m.wat === 'draaien') uitkomst = meetDraaien(v, m.beelden ?? 90)
    else if (m.wat === 'schaduw') {
      uitkomst = t.meetSchaduw()
      doek.transferToImageBitmap().close()
      plan()
    } else {
      uitkomst = {
        ...t.gpuBytes(v.b, v.h),
        telling: t.telling(),
        plan: t.texturen.laatstePlan ? { bytes: t.texturen.laatstePlan.bytes, teZwaar: t.texturen.laatstePlan.teZwaar } : undefined,
        fouten: t.texturen.fouten.slice(0, 20),
        mag: { s3tc: mag.s3tc, s3tcSrgb: mag.s3tcSrgb, aniso: mag.aniso },
        doos: t.scene?.doos,
        textuurStats: t.texturen.stats,
        tijdlijn: t.texturen.tijdlijn,
        spoor: [...spoor],
        herstellingen
      }
    }
    stuur({ soort: 'antwoord', vraag: m.vraag, uitkomst })
  }
}

// ------------------------------------------------------------ opstarten
if (maakContext()) {
  try {
    bouwTekenaar()
    const g = gl!
    const dbg = g.getExtension('WEBGL_debug_renderer_info')
    stuur({
      soort: 'gereed',
      webgl: true,
      info: {
        renderer: dbg ? g.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER),
        // De monsters van de eigen MSAA-framebuffer (het doek zelf heeft er geen).
        samples: Math.min(4, g.getParameter(g.MAX_SAMPLES) as number),
        s3tc: mag.s3tc,
        s3tcSrgb: mag.s3tcSrgb,
        aniso: mag.aniso
      }
    })
  } catch (fout) {
    stuur({ soort: 'gereed', webgl: false, detail: fout instanceof Error ? fout.message : String(fout) })
  }
} else {
  stuur({ soort: 'gereed', webgl: false, detail: 'geen WebGL2-context' })
}
