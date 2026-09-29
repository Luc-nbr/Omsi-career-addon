import { heldenSleutel, type Bus3dLak, type Bus3dManifest, type Bus3dMeting } from '../../../shared/bus3d'
import { klok, type AfdrukVraag, type NaarWerker, type StandBericht, type VanWerker } from './berichten'
import { Camera } from './camera'
import { Tekenaar, zetLicht } from './teken'
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
}

const doel = self as unknown as {
  onmessage: ((e: MessageEvent<NaarWerker>) => void) | null
  postMessage(bericht: VanWerker, overdracht?: Transferable[]): void
  requestAnimationFrame?: (cb: (t: number) => void) => number
}
const stuur = (b: VanWerker, overdracht?: Transferable[]): void => doel.postMessage(b, overdracht)

// ------------------------------------------------------------ de ontleders (TGA en co)
function maakOntleders(aantal: number): Ontleder {
  const werkers: Worker[] = []
  const wachtend = new Map<number, { klaar: (u: { b: number; h: number; pixels: Uint8Array }) => void; fout: (e: Error) => void }>()
  let volgende = 0
  for (let i = 0; i < aantal; i++) {
    const w = new Worker(new URL('./ontleder.ts', import.meta.url), { type: 'module' })
    w.onmessage = (e: MessageEvent<{ id: number; fout?: string; b: number; h: number; pixels: ArrayBuffer }>) => {
      const v = wachtend.get(e.data.id)
      if (!v) return
      wachtend.delete(e.data.id)
      if (e.data.fout) v.fout(new Error(e.data.fout))
      else v.klaar({ b: e.data.b, h: e.data.h, pixels: new Uint8Array(e.data.pixels) })
    }
    werkers.push(w)
  }
  return {
    ontleed: (bytes) =>
      new Promise((klaar, fout) => {
        const id = ++volgende
        wachtend.set(id, { klaar, fout })
        werkers[id % werkers.length].postMessage({ id, bytes }, [bytes])
      })
  }
}

// ------------------------------------------------------------ de context
let doek: OffscreenCanvas
let gl: WebGL2RenderingContext | null = null
let tekenaar: Tekenaar | undefined
let mag: Mogelijkheden = { s3tc: false, s3tcSrgb: false, aniso: 1 }
const ontleder = maakOntleders(2)
const viewers = new Map<number, Viewer>()
let actief: Viewer | undefined
let contextWeg = false
let herstellingen = 0

function maakContext(): boolean {
  doek = new OffscreenCanvas(16, 16)
  doek.addEventListener('webglcontextlost', (e) => {
    e.preventDefault()
    contextWeg = true
    stuur({ soort: 'fout', viewer: actief?.id ?? 0, laad: laad.nr, reden: 'context-weg' })
  })
  doek.addEventListener('webglcontextrestored', () => {
    contextWeg = false
    herstellingen++
    try {
      bouwTekenaar()
      if (laad.bericht) void laadBus(laad.bericht)
    } catch (fout) {
      stuur({ soort: 'fout', viewer: actief?.id ?? 0, laad: laad.nr, reden: 'fout', detail: String(fout) })
    }
  })
  gl = doek.getContext('webgl2', {
    antialias: true,
    alpha: false,
    depth: true,
    stencil: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance'
  }) as WebGL2RenderingContext | null
  return Boolean(gl)
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
} = { nr: 0, t0: 0, laatsteStand: 0, gpuTotaal: 0, heldGedaan: new Set(), mijlpalen: {} }

/** Een kort spoor van wat de werker na het laatste 'bus'-bericht deed (voor de proef). */
const spoor: string[] = []
const zetSpoor = (w: string): void => {
  if (spoor.length < 80) spoor.push(`${Math.round(klok() - laad.t0)} ${w}`)
}

const mijlpaal = (naam: string): void => {
  laad.mijlpalen[naam] ??= Math.round(klok() - laad.t0)
}

const budget = (licht?: boolean): number => (licht ? 96 : 160) * 1024 * 1024

async function laadBus(b: Extract<NaarWerker, { soort: 'bus' }>): Promise<void> {
  const nr = b.laad
  const t = tekenaar
  const v = viewers.get(b.viewer)
  if (!t || !v) return
  const zelfdePakket = t.scene?.manifest.pakket === b.manifest.pakket
  try {
    if (!zelfdePakket) {
      const gezet = await t.laadBus(
        b.manifest,
        () => new Promise((klaar) => setTimeout(klaar, 0)),
        () => nr === laad.nr
      )
      if (!gezet || nr !== laad.nr) return
      mijlpaal('geometrie')
      zetDoos(v, b.manifest)
    }
    t.zetLak(b.lak, budget(b.licht))
    mijlpaal('lak')
    plan()
  } catch (fout) {
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
  if (!v || !t || !gl || v.b < 2 || v.h < 2 || contextWeg || afdrukBezig) return zetSpoor(`tik weg: ${v?.b}x${v?.h}`)
  if (v.inVlucht >= 2) return zetSpoor('tik weg: onderweg') // 'gezien' plant het volgende beeld
  const nu = performance.now()
  const dt = laatsteTik ? (nu - laatsteTik) / 1000 : 0
  laatsteTik = nu
  const beweegt = v.camera.stap(Math.min(dt, 0.1))
  maatDoek(v.b, v.h)
  t.teken(v.camera.beeld(v.b / v.h), v.b, v.h)
  const scene = t.scene
  const voortgang = t.texturen.voortgang()
  const scherp = Boolean(scene) && voortgang.bezig === 0 && voortgang.klaar === voortgang.totaal

  // Het heldenbeeld: één keer per bus, kleurstelling en maatklasse, zodra alles scherp staat (§9).
  const b = laad.bericht
  let held: Promise<Blob> | undefined
  let heldSleutel = ''
  if (scherp && !beweegt && scene && b && !b.licht) {
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
  stuur({ soort: 'beeld', viewer: v.id, bitmap }, [bitmap])

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
    }
  }
  // Alleen doortekenen zolang de camera beweegt; een textuur die binnenkomt plant zelf een beeld.
  if (beweegt) plan()
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
    v = { id, b: 0, h: 0, dpr: 1, camera: new Camera(), inVlucht: 0, pauze: false }
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
  } else if (m.soort === 'licht') {
    zetLicht(m.licht)
    if (tekenaar?.scene) {
      tekenaar.scene.schaduwVuil = true
      if (laad.bericht) tekenaar.zetLak(laad.bericht.lak, budget(laad.bericht.licht))
    }
    plan()
  } else if (m.soort === 'omgeving') {
    omgeving = m.omgeving
    tekenaar?.zetOmgeving(m.omgeving)
    plan()
  } else if (m.soort === 'bus') {
    const v = viewerVan(m.viewer)
    actief = v
    const nieuw = laad.bericht?.manifest.pakket !== m.manifest.pakket
    laad.nr = m.laad
    laad.bericht = m
    laad.t0 = m.t0
    laad.mijlpalen = {}
    spoor.length = 0
    mijlpaal('bericht')
    laad.eersteBeeld = undefined
    laad.scherp = undefined
    if (nieuw) beeldtijden.length = 0
    void laadBus(m)
  } else if (m.soort === 'lak') {
    const b = laad.bericht
    if (!b || !tekenaar?.scene) return
    laad.bericht = { ...b, lak: m.lak }
    laad.scherp = undefined
    laad.eersteBeeld = undefined
    laad.t0 = klok()
    tekenaar.zetLak(m.lak as Bus3dLak, budget(b.licht))
    plan()
  } else if (m.soort === 'invoer') {
    const v = viewerVan(m.viewer)
    const i = m.invoer
    if (i.soort === 'sleep') v.camera.sleep(i.dx, i.dy)
    else if (i.soort === 'zoom') v.camera.zoomStap(i.factor)
    else if (i.soort === 'stand') v.camera.stand(i.stand)
    else if (i.soort === 'draai') v.camera.draai(i.graden)
    else if (i.soort === 'kantel') v.camera.kantel(i.graden)
    plan()
  } else if (m.soort === 'gezien') {
    const v = viewers.get(m.viewer)
    if (v) {
      v.inVlucht = Math.max(0, v.inVlucht - 1)
      plan()
    }
  } else if (m.soort === 'pauze') {
    const v = viewerVan(m.viewer)
    v.pauze = m.aan
    if (m.aan && m.vrijgeven) gl?.getExtension('WEBGL_lose_context')?.loseContext()
    if (!m.aan && contextWeg) gl?.getExtension('WEBGL_lose_context')?.restoreContext()
    if (!m.aan) plan()
  } else if (m.soort === 'afdruk') {
    const v = viewerVan(m.viewer)
    if (!tekenaar) return stuur({ soort: 'antwoord', vraag: m.vraag, uitkomst: { fout: 'geen webgl' } })
    void afdruk(v, m.afdruk).then(
      (u) => stuur({ soort: 'antwoord', vraag: m.vraag, uitkomst: u }, [u.beeld, ...(u.masker ? [u.masker] : []), ...(u.id ? [u.id] : [])]),
      (fout) => stuur({ soort: 'antwoord', vraag: m.vraag, uitkomst: { fout: String(fout) } })
    )
  } else if (m.soort === 'meet') {
    const v = viewerVan(m.viewer)
    const t = tekenaar
    if (!t) return stuur({ soort: 'antwoord', vraag: m.vraag, uitkomst: { fout: 'geen webgl' } })
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
        samples: g.getParameter(g.SAMPLES),
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
