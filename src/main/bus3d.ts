import { createReadStream, statSync } from 'node:fs'
import { isAbsolute, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'
import type { IpcMain, IpcMainInvokeEvent, WebContents } from 'electron'
import { Bus3dCache, type Bus3dZijspoor } from '../core/bus3dcache'
import type { Bus3dTextuurBron } from '../core/bus3d'
import { beschrijfRegistratie, omsiRegistratie } from '../core/omsiregistratie'
import {
  isBus3dId,
  textuurPlan,
  type Bus3dAntwoord,
  type Bus3dLak,
  type Bus3dManifest,
  type Bus3dReden,
  type Bus3dVoortgang
} from '../shared/bus3d'

/**
 * DE REGIE VAN BUS3D IN MAIN (bus3d-ontwerp §4)
 *
 * Main doet hier geen modelwerk. Het leest en bouwt niets zelf: dat doet de
 * werker `'bus3d'` (core/bus3d.ts via main/kaartwerker.ts), die ook het pakket
 * naar de schijfcache schrijft. Main houdt alleen:
 *
 * - het REGISTER: welk id bij welk bestand hoort. Het venster vraagt alles op id
 *   via `omsi3d://` -- `p/<id>` een pakket, `t/<id>` een textuur (of een plak
 *   ervan, met een Range-kop), `h/<id>` een heldenbeeld (F2) -- nooit op pad,
 *   zoals `omsischerm` en de apparaatserver;
 * - de REGISTRATIETOETS: vóór het tonen, en bij elk `p/`, moet elke o3d-sleutel
 *   van het pakket 0 zijn of hier geregistreerd (Lucs keuze 1, §5.1). Is een
 *   sleutel verdwenen (add-on weg), dan vergeten we de pakketten met die sleutel
 *   en geeft `p/` 403;
 * - de RIJ per kanaal (per venster, `WebContents`): één vraag bezig, hooguit één
 *   in de wacht; de nieuwste wint, een vervangen vraag krijgt `'vervangen'`. Het
 *   herbouwen van een verouderd pakket is een ACHTERGRONDBEURT: die vervangt
 *   nooit een wachtende vraag van de speler, en een vraag van de speler vervangt
 *   hem wel. 20 s zonder voortgang: de werker weg en `'tijd'`. 120 s nadat de
 *   LAATSTE werkervraag klaar is gaat de werker dicht; de klok staat stil zolang
 *   er een vraag loopt.
 *
 * Geen Electron tijdens het draaien: alleen typen. De probe
 * (scripts/probe-bus3d.ts) roept dezelfde dienst in node aan, met een eigen
 * cachemap, en haalt `p/` en `t/` op met een gewone `Request`.
 */

export interface Bus3dAfhankelijk {
  userData: () => string
  omsi: () => string
  /** Een opdracht aan de werker `'bus3d'`; `tussen` krijgt de tussenberichten. */
  werkerVraag: <T>(opdracht: Record<string, unknown>, tussen?: (bericht: unknown) => void) => Promise<T>
  /** De werker `'bus3d'` sluiten (na 120 s rust, of na 20 s zonder voortgang). */
  sluitWerker: () => void
  log: (regel: string) => void
  logFout: (wat: string, fout: unknown) => void
  /** Test: kortere wachttijden. */
  tijden?: { stil?: number; rust?: number }
}

/** Wat de werker op `bus3d:model` terugstuurt. */
export type Bus3dWerkerModel =
  | { zijspoor: Bus3dZijspoor; tijden: Record<string, number>; doostoets?: unknown }
  | { reden: Bus3dReden; detail: string; sleutels?: number[] }

export interface Bus3dDienst {
  /** `bus:model3d`: het manifest (uit de cache, of nieuw gebouwd) plus de lak. */
  model3d(relatiefPad: string, kleurstelling?: string, venster?: WebContents): Promise<Bus3dAntwoord>
  /** `bus:lak3d`: de lak van een andere kleurstelling voor een pakket dat er al is. */
  lak3d(pakket: string, kleurstelling?: string, venster?: WebContents): Promise<Bus3dLak | { reden: Bus3dReden }>
  /** Het protocol `omsi3d://`. */
  antwoord(vraag: Request): Promise<Response>
  /** De add-on-manager: pakketten van deze voertuigmappen (of alles) vergeten. */
  vergeet(mappen?: string[]): void
  /**
   * Het venster meldt dat een pakket niet te lezen is (`leesPakket` gooit): het
   * pakket vergeten, zodat de volgende `bus:model3d` opnieuw bouwt in plaats van
   * hetzelfde stuk te geven.
   */
  stuk(pakket: string): void
  /** Bij het starten: de LRU opruimen. */
  ruimOp(): void
  /** Voor de probe. */
  readonly cache: Bus3dCache
}

interface Registerpakket {
  pad: string
  sleutels: number[]
}

export function maakBus3dDienst(af: Bus3dAfhankelijk): Bus3dDienst {
  const cache = new Bus3dCache(af.userData())
  const pakketten = new Map<string, Registerpakket>()
  const texturen = new Map<string, Bus3dTextuurBron>()
  let laatsteRegistratie = ''
  let vorigeSleutels: ReadonlySet<number> | undefined
  const STIL_MS = af.tijden?.stil ?? 20_000
  const RUST_MS = af.tijden?.rust ?? 120_000

  /** De registratie, met een logregel als hij veranderde; vergeet wat er niet meer mag. */
  function registratie(): ReadonlySet<number> {
    const r = omsiRegistratie(af.omsi())
    if (r.vingerafdruk !== laatsteRegistratie) {
      const eerst = laatsteRegistratie === ''
      laatsteRegistratie = r.vingerafdruk
      af.log(`bus3d sleutels: ${beschrijfRegistratie(r)}${eerst ? '' : ' (gewijzigd)'}`)
      /*
       * Een sleutel die weg is (add-on verwijderd): de pakketten ermee vergeten,
       * ook uit het register. Wat daarna gevraagd wordt, valt op de toets bij
       * het tonen en wordt opnieuw gebouwd -- en geeft dan het icoon (§9).
       */
      const weg = [...(vorigeSleutels ?? [])].filter((s) => !r.sleutels.has(s))
      vorigeSleutels = r.sleutels
      if (weg.length > 0) {
        const aantal = cache.vergeet({ sleutels: weg })
        for (const [id, p] of pakketten) if (p.sleutels.some((s) => weg.includes(s))) pakketten.delete(id)
        af.log(`bus3d: ${aantal} pakket(ten) vergeten, sleutel(s) niet meer geregistreerd: ${weg.join(', ')}`)
      }
    }
    return r.sleutels
  }

  const magTonen = (sleutels: number[], reg: ReadonlySet<number>): boolean => sleutels.every((s) => s === 0 || reg.has(s))

  function registreer(z: Bus3dZijspoor): void {
    pakketten.set(z.pakket, { pad: cache.pakketPad(z.pakket), sleutels: z.manifest.sleutels })
    for (const t of z.textuurBronnen) texturen.set(t.id, t)
  }

  // ------------------------------------------------------------ de werker en zijn rustklok
  /*
   * De rustklok loopt alleen als er geen enkele werkervraag loopt. Voorheen werd
   * hij aan het eind van een beurt gezet en niet gestopt als de volgende begon:
   * een vraag die net vóór de 120 s begon en langer bouwde dan de resttijd, zag
   * de werker onder zich weggaan en kreeg 'fout' (aanvalsverslag F1, punt 5).
   */
  let werkerTimer: ReturnType<typeof setTimeout> | undefined
  let lopend = 0
  async function vraagWerker<T>(opdracht: Record<string, unknown>, tussen?: (b: unknown) => void): Promise<T> {
    lopend++
    if (werkerTimer) {
      clearTimeout(werkerTimer)
      werkerTimer = undefined
    }
    try {
      return await af.werkerVraag<T>(opdracht, tussen)
    } finally {
      lopend--
      if (lopend === 0) {
        werkerTimer = setTimeout(() => {
          werkerTimer = undefined
          if (lopend === 0) af.sluitWerker()
        }, RUST_MS)
        werkerTimer.unref?.()
      }
    }
  }

  // ------------------------------------------------------------ de rij
  interface Beurt<T> {
    doe: () => Promise<T>
    klaar: (uit: T | { reden: Bus3dReden }) => void
  }
  /**
   * Per kanaal: wat loopt, de vraag van de speler die wacht, en een
   * achtergrondbeurt (herbouwen na de controle) die wacht. Na een beurt gaat de
   * speler voor.
   */
  const kanalen = new Map<string, { bezig: boolean; wacht?: Beurt<unknown>; achtergrond?: Beurt<unknown> }>()
  function inDeRij<T>(kanaal: string, doe: () => Promise<T>, achtergrond = false): Promise<T | { reden: Bus3dReden }> {
    return new Promise((klaar) => {
      const k = kanalen.get(kanaal) ?? { bezig: false }
      kanalen.set(kanaal, k)
      const beurt: Beurt<unknown> = { doe, klaar: klaar as (u: unknown) => void }
      if (achtergrond) {
        /*
         * Een achtergrondbeurt vervangt nooit een vraag van de speler: wacht die
         * er al een, dan vervalt deze (het oude pakket blijft staan en wordt bij
         * de volgende vraag opnieuw gecontroleerd). Anders de nieuwste
         * achtergrondbeurt.
         */
        if (k.wacht) {
          beurt.klaar({ reden: 'vervangen' })
          return
        }
        if (!k.bezig) {
          void draai(kanaal, beurt)
          return
        }
        k.achtergrond?.klaar({ reden: 'vervangen' })
        k.achtergrond = beurt
        return
      }
      // Een vraag van de speler vervangt een wachtende achtergrondbeurt.
      k.achtergrond?.klaar({ reden: 'vervangen' })
      k.achtergrond = undefined
      if (!k.bezig) {
        void draai(kanaal, beurt)
        return
      }
      // De nieuwste wint: wie al wachtte, hoort dat hij vervangen is.
      k.wacht?.klaar({ reden: 'vervangen' })
      k.wacht = beurt
    })
  }
  async function draai(kanaal: string, beurt: Beurt<unknown>): Promise<void> {
    const k = kanalen.get(kanaal)!
    k.bezig = true
    try {
      beurt.klaar(await beurt.doe())
    } catch (fout) {
      af.logFout(`bus3d ${kanaal}`, fout)
      beurt.klaar({ reden: 'fout' })
    } finally {
      k.bezig = false
      const volgende = k.wacht ?? k.achtergrond
      if (volgende === k.wacht) k.wacht = undefined
      else k.achtergrond = undefined
      if (volgende) void draai(kanaal, volgende)
      else if (!k.wacht && !k.achtergrond) kanalen.delete(kanaal)
    }
  }

  /** Het kanaal van een venster: elk venster zijn eigen rij (3D-venster, fotovenster). */
  const kanaalVan = (soort: 'model' | 'lak', venster?: WebContents): string =>
    `${soort}:${venster && typeof venster.id === 'number' ? venster.id : 0}`

  /** Een werkervraag met de stiltewacht: 20 s zonder voortgang is 'tijd'. */
  async function metWacht<T>(opdracht: Record<string, unknown>, tussen?: (b: unknown) => void): Promise<T | { reden: 'tijd' }> {
    let stil: ReturnType<typeof setTimeout> | undefined
    let opgegeven = false
    const wek = (): void => {
      if (stil) clearTimeout(stil)
      stil = setTimeout(() => {
        opgegeven = true
        af.log(`bus3d: ${String(opdracht.soort)} gaf ${STIL_MS / 1000} s geen voortgang; de werker gaat dicht`)
        af.sluitWerker()
      }, STIL_MS)
      stil.unref?.()
    }
    wek()
    try {
      const uit = await vraagWerker<T>(opdracht, (b) => {
        wek()
        tussen?.(b)
      })
      return uit
    } catch (fout) {
      if (opgegeven) return { reden: 'tijd' }
      throw fout
    } finally {
      if (stil) clearTimeout(stil)
    }
  }

  // ------------------------------------------------------------ model en lak
  function logModel(z: Bus3dZijspoor, bron: 'cache' | 'nieuw', ms: number): void {
    const m = z.manifest
    const soorten = { dxt: 0, 'dxt-zonder-mips': 0, beeld: 0, eigen: 0 }
    for (const t of m.texturen) soorten[t.soort]++
    const plan = textuurPlan(m.texturen, 160 * 1024 * 1024)
    const carrosserie = m.texturen.find((t) => t.ctc && t.ctc === plan.carrosserie)
    const regel = carrosserie ? plan.regels[m.texturen.indexOf(carrosserie)] : undefined
    af.log(
      `bus3d ${m.bus}: ${m.telling.driehoeken} driehoeken, ${m.telling.stukken} stukken, ${m.telling.texturen} texturen ` +
        `(dxt ${soorten.dxt} / rtt ${soorten['dxt-zonder-mips']} / beeld ${soorten.beeld} / eigen ${soorten.eigen}), ` +
        `${(plan.bytes / 1048576).toFixed(0)} MB tex${plan.teZwaar ? ' (te zwaar)' : ''}` +
        (regel && carrosserie ? `, carrosserie ${carrosserie.naam} op ${regel.b}x${regel.h}` : '') +
        `, lezen ${m.ms.lezen} ms, bron ${bron} (${ms} ms)` +
        (m.telling.ontward || m.telling.versleuteld
          ? `; ontward ${m.telling.ontward}, versleuteld ${m.telling.versleuteld}` +
            (m.problemen.versleuteld.length ? ` (sleutel ${[...new Set(m.problemen.versleuteld.map((v) => v.sleutel))].join(', ')})` : '')
          : '') +
        (m.telling.ontbrekend ? `; ${m.telling.ontbrekend} texturen ontbreken` : '') +
        (m.telling.onleesbaar ? `; ${m.telling.onleesbaar} onleesbaar` : '')
    )
  }

  async function bouw(
    relatiefPad: string,
    reg: ReadonlySet<number>,
    venster?: WebContents,
    vraag = 0
  ): Promise<{ zijspoor: Bus3dZijspoor } | { reden: Bus3dReden; detail?: string }> {
    const t0 = Date.now()
    const uit = await metWacht<Bus3dWerkerModel>(
      { soort: 'bus3d:model', relatiefPad, geregistreerd: [...reg] },
      (b) => {
        /*
         * De textuurlijst komt vóór het pakket: meteen in het register, zodat
         * `t/<id>` al werkt terwijl de werker nog bouwt. De paden gaan niet mee
         * naar het venster.
         */
        const { bronnen, ...bericht } = b as Bus3dVoortgang & { bronnen?: Bus3dTextuurBron[] }
        for (const t of bronnen ?? []) texturen.set(t.id, t)
        if (venster && !venster.isDestroyed()) venster.send('bus3d:voortgang', { ...bericht, vraag } as Bus3dVoortgang)
      }
    )
    if ('reden' in uit) {
      af.log(`bus3d ${relatiefPad}: ${uit.reden}${'detail' in uit && uit.detail ? ` -- ${uit.detail}` : ''}`)
      return uit
    }
    registreer(uit.zijspoor)
    logModel(uit.zijspoor, 'nieuw', Date.now() - t0)
    return { zijspoor: uit.zijspoor }
  }

  async function lak(z: Bus3dZijspoor, kleurstelling: string | undefined): Promise<Bus3dLak | undefined> {
    if (!kleurstelling) return undefined
    const uit = await metWacht<{ lak: Bus3dLak; textuurBronnen: Bus3dTextuurBron[] } | { reden: Bus3dReden }>({
      soort: 'bus3d:lak',
      pakket: z.pakket,
      kleurstelling
    })
    if ('reden' in uit) return undefined
    for (const t of uit.textuurBronnen) texturen.set(t.id, t)
    af.log(`bus3d lak ${z.bus} ${kleurstelling}: bron ${uit.lak.bron}, ${uit.lak.ms} ms, ${uit.lak.texturen.length} texturen vervangen, onbekend [${uit.lak.onbekend.join(', ')}]`)
    return uit.lak
  }

  let volgnummer = 0

  async function model3d(relatiefPad: string, kleurstelling?: string, venster?: WebContents): Promise<Bus3dAntwoord> {
    const pad = String(relatiefPad ?? '')
    if (!/\.bus$/i.test(pad) || isAbsolute(pad) || pad.split(/[\\/]/).includes('..')) return { reden: 'geen-model', detail: 'geen .bus' }
    const vraag = ++volgnummer
    const uit = await inDeRij(kanaalVan('model', venster), async (): Promise<Bus3dAntwoord> => {
      const t0 = Date.now()
      const reg = registratie()
      let z = cache.zoek(af.omsi(), pad)
      // Een pakket met een sleutel die niet meer mag, of gebouwd bij een andere registratie: opnieuw.
      if (z && (!magTonen(z.manifest.sleutels, reg) || !zelfdeSet(z.geregistreerd, reg))) z = undefined
      let bron: 'cache' | 'nieuw' = 'cache'
      if (!z) {
        const gebouwd = await bouw(pad, reg, venster, vraag)
        if ('reden' in gebouwd) return { reden: gebouwd.reden, detail: gebouwd.detail }
        z = gebouwd.zijspoor
        bron = 'nieuw'
      } else {
        registreer(z)
        cache.raak(z.pakket)
        logModel(z, 'cache', Date.now() - t0)
      }
      const l = await lak(z, kleurstelling)
      if (bron === 'cache') void controleer(z, reg, venster)
      return { manifest: z.manifest, lak: l }
    })
    return uit
  }

  /**
   * Eerst tonen, dan controleren (§4.2): zijn de bronnen veranderd, dan opnieuw
   * bouwen, als achtergrondbeurt in de rij van het venster, en `bus3d:vervangen`.
   *
   * Mislukt dat herbouwen (het model is weg, een o3d kapot, de sleutel weg ...),
   * dan wordt het oude pakket vergeten -- het klopt aantoonbaar niet meer -- en
   * krijgt het venster ook `bus3d:vervangen`: het vraagt opnieuw en krijgt de
   * reden (het icoon). Voorheen bleef het oude pakket dan voor altijd uit de
   * cache komen (aanvalsverslag F1, punt 7). Alleen als de achtergrondbeurt
   * vervangen is door een vraag van de speler, blijft het oude pakket staan; de
   * volgende vraag naar deze bus controleert het opnieuw.
   */
  async function controleer(z: Bus3dZijspoor, reg: ReadonlySet<number>, venster?: WebContents): Promise<void> {
    try {
      const verouderd = await vraagWerker<string | undefined>({ soort: 'bus3d:controle', pakket: z.pakket })
      if (!verouderd) return
      af.log(`bus3d ${z.bus}: verouderd (${verouderd}); opnieuw`)
      const nieuw = await inDeRij(kanaalVan('model', venster), () => bouw(z.bus, reg), true)
      if ('reden' in nieuw && nieuw.reden === 'vervangen') return
      if ('zijspoor' in nieuw) {
        if (nieuw.zijspoor.pakket !== z.pakket) pakketten.delete(z.pakket)
      } else {
        cache.vergeetPakket(z.pakket, af.omsi(), z.bus)
        pakketten.delete(z.pakket)
        af.log(`bus3d ${z.bus}: het verouderde pakket is vergeten (herbouwen gaf ${nieuw.reden})`)
      }
      if (venster && !venster.isDestroyed()) venster.send('bus3d:vervangen', z.pakket)
    } catch (fout) {
      af.logFout('bus3d controle', fout)
    }
  }

  async function lak3d(pakket: string, kleurstelling?: string, venster?: WebContents): Promise<Bus3dLak | { reden: Bus3dReden }> {
    if (!isBus3dId(String(pakket))) return { reden: 'fout' }
    const z = cache.zijspoor(pakket)
    if (!z) return { reden: 'verouderd' }
    const uit = await inDeRij(kanaalVan('lak', venster), async () => (await lak(z, kleurstelling)) ?? leegLak(kleurstelling))
    return uit
  }

  function stuk(pakket: string): void {
    const id = String(pakket ?? '')
    if (!isBus3dId(id)) return
    cache.vergeetPakket(id, af.omsi())
    pakketten.delete(id)
    af.log(`bus3d: pakket ${id} stuk gemeld door het venster; vergeten, de volgende vraag bouwt opnieuw`)
  }

  // ------------------------------------------------------------ het protocol
  async function antwoord(vraag: Request): Promise<Response> {
    let url: URL
    try {
      url = new URL(vraag.url)
    } catch {
      return new Response(null, { status: 400 })
    }
    const soort = url.hostname
    const id = url.pathname.replace(/^\/+/, '')
    if (!isBus3dId(id)) return new Response(null, { status: 404 })
    if (soort === 'p') {
      const p = pakketten.get(id)
      if (!p) return new Response(null, { status: 404 })
      // Gehusselde blokken alleen als hun sleutel nu nog geregistreerd is.
      if (!magTonen(p.sleutels, registratie())) return new Response(null, { status: 403 })
      return stroom(p.pad, 'application/octet-stream', vraag)
    }
    if (soort === 't') {
      const t = texturen.get(id)
      if (!t || !veiligPad(t.pad, af.omsi())) return new Response(null, { status: 404 })
      // Klopt het bestand nog met de kop in het manifest? Anders kloppen de plakken niet: 409.
      try {
        const st = statSync(t.pad)
        if (st.size !== t.grootte || Math.round(st.mtimeMs) !== t.mtime) return new Response(null, { status: 409 })
      } catch {
        return new Response(null, { status: 409 })
      }
      return stroom(t.pad, t.mime, vraag)
    }
    return new Response(null, { status: 404 })
  }

  function vergeet(mappen?: string[]): void {
    const aantal = cache.vergeet(mappen ? { mappen } : undefined)
    pakketten.clear()
    if (aantal) af.log(`bus3d: ${aantal} pakket(ten) vergeten${mappen ? ` (${mappen.join(', ')})` : ''}`)
  }

  function ruimOp(): void {
    try {
      const r = cache.ruimOp()
      if (r.weg) af.log(`bus3d cache: ${r.weg} weg, ${(r.bytes / 1048576).toFixed(0)} MB over`)
    } catch (fout) {
      af.logFout('bus3d cache opruimen', fout)
    }
  }

  return { model3d, lak3d, antwoord, vergeet, stuk, ruimOp, cache }
}

function zelfdeSet(lijst: number[] | undefined, set: ReadonlySet<number>): boolean {
  if (!lijst) return false
  return lijst.length === set.size && lijst.every((s) => set.has(s))
}

function leegLak(kleurstelling?: string): Bus3dLak {
  return { kleurstelling, vars: [], bron: 'regels', zichtbaar: '', items: {}, alphascale: {}, texturen: [], onbekend: [], ms: 0 }
}

/** Een textuurpad moet binnen de installatie liggen en een textuurextensie hebben (zoals `veiligePlaatje`). */
function veiligPad(pad: string, omsiMap: string): boolean {
  if (!omsiMap || !isAbsolute(omsiMap) || !isAbsolute(pad)) return false
  const p = resolve(pad).toLowerCase()
  const m = resolve(omsiMap).toLowerCase()
  if (!p.startsWith(m.endsWith(sep) ? m : m + sep)) return false
  return /\.(dds|tga|bmp|jpe?g|png)$/.test(p)
}

/**
 * Een bestand als antwoord, met Range: een DXT-plak (de niveaus onder de
 * doelmaat) haalt het venster op met `Range: bytes=a-b`, en dan komt alleen dat
 * stuk van de schijf. Een stroom uit een bestand kost main vrijwel niets
 * (§4.3); geen kopie door de IPC.
 */
function stroom(pad: string, type: string, vraag: Request): Response {
  let grootte: number
  try {
    grootte = statSync(pad).size
  } catch {
    return new Response(null, { status: 404 })
  }
  const kop = {
    'Content-Type': type,
    'Cache-Control': 'private, max-age=31536000, immutable',
    'Accept-Ranges': 'bytes'
  }
  const bereik = /^bytes=(\d*)-(\d*)$/.exec(vraag.headers.get('range') ?? '')
  if (bereik && (bereik[1] || bereik[2])) {
    let van = bereik[1] ? Number(bereik[1]) : grootte - Number(bereik[2])
    let tot = bereik[1] && bereik[2] ? Number(bereik[2]) : grootte - 1
    van = Math.max(0, van)
    tot = Math.min(grootte - 1, tot)
    if (van > tot) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${grootte}` } })
    const lijf = Readable.toWeb(createReadStream(pad, { start: van, end: tot })) as unknown as ReadableStream
    return new Response(lijf, {
      status: 206,
      headers: { ...kop, 'Content-Length': String(tot - van + 1), 'Content-Range': `bytes ${van}-${tot}/${grootte}` }
    })
  }
  const lijf = Readable.toWeb(createReadStream(pad)) as unknown as ReadableStream
  return new Response(lijf, { status: 200, headers: { ...kop, 'Content-Length': String(grootte) } })
}

/** De IPC voor het 3D-venster (§11.3). De preload `bus3d` geeft ze door (F2). */
export function registreerBus3dIpc(ipcMain: IpcMain, dienst: Bus3dDienst): void {
  ipcMain.handle('bus:model3d', (event: IpcMainInvokeEvent, relatiefPad: unknown, kleurstelling: unknown) =>
    dienst.model3d(String(relatiefPad ?? ''), typeof kleurstelling === 'string' ? kleurstelling : undefined, event.sender)
  )
  ipcMain.handle('bus:lak3d', (event: IpcMainInvokeEvent, pakket: unknown, kleurstelling: unknown) =>
    dienst.lak3d(String(pakket ?? ''), typeof kleurstelling === 'string' ? kleurstelling : undefined, event.sender)
  )
  // Het venster kan een pakket niet lezen: vergeten, zodat [Opnieuw] echt opnieuw bouwt.
  ipcMain.on('bus:stuk3d', (_event, pakket: unknown) => dienst.stuk(String(pakket ?? '')))
}

export type { Bus3dManifest }
