import { createHash } from 'node:crypto'
import { closeSync, createReadStream, openSync, readSync, statSync } from 'node:fs'
import { basename, isAbsolute, resolve, sep } from 'node:path'
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
  type Bus3dMeting,
  type Bus3dOmgeving,
  type Bus3dPakKop,
  type Bus3dReden,
  type Bus3dStalen,
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
 *   ervan, met een Range-kop), `h/<id>` een heldenbeeld -- nooit op pad,
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
  /**
   * Draait OMSI? Dan schrijven we geen heldenbeeld weg (§9): de schijf en de
   * GPU zijn dan van het spel.
   */
  omsiDraait?: () => boolean
  /** Staat de schakelaar `bus3d` aan (instellingen, tot F3 standaard uit)? Zonder deze functie: aan. */
  aan?: () => boolean
  /**
   * Geen heldenbeeld: de foto die de tegel al heeft (v4, anders v3b), als die op
   * schijf staat. Zonder te tekenen: het 3D-venster wacht er nooit op (§9).
   */
  fotoTerugval?: (relatiefPad: string, kleurstelling?: string) => string | undefined
}

/** Wat de werker op `bus3d:model` terugstuurt. */
export type Bus3dWerkerModel =
  | { zijspoor: Bus3dZijspoor; tijden: Record<string, number>; doostoets?: unknown }
  | { reden: Bus3dReden; detail: string; sleutels?: number[] }

export interface Bus3dDienst {
  /** `bus:model3d`: het manifest (uit de cache, of nieuw gebouwd) plus de lak. */
  model3d(relatiefPad: string, kleurstelling?: string, venster?: WebContents): Promise<Bus3dAntwoord>
  /**
   * `bus:lak3d`: de lak van een andere kleurstelling voor een pakket dat er al
   * is; `extra` zijn de busopties van de Lakstudio (§4.9).
   */
  lak3d(pakket: string, kleurstelling?: string, venster?: WebContents, extra?: Array<[string, number]>): Promise<Bus3dLak | { reden: Bus3dReden }>
  /** `bus:omgeving3d`: hemel en wolken van "Buiten" (§5.6), met hun texturen in het register. */
  omgeving3d(): Promise<Bus3dOmgeving>
  /** `bus:heldenbeeld`: het beeld dat het venster maakte toen de bus scherp stond (§9). */
  heldenbeeld(pakket: string, kleurstelling: string | undefined, sleutel: string, webp: Uint8Array): boolean
  /**
   * `bus:fotoAlsKlaar`: het heldenbeeld van deze bus en kleurstelling als
   * `omsi3d://h/<id>`, zonder te wachten en zonder te tekenen; anders niets
   * (de foto v4 komt er later bij).
   */
  fotoAlsKlaar(relatiefPad: string, kleurstelling?: string, verhouding?: 'breed' | 'smal'): string | undefined
  /**
   * `bus3d:kleurstalen`: drie kleuren per kleurstelling (§7), uit de werker;
   * `tussen` krijgt wat al klaar is. Onthouden per bus zolang de app draait.
   */
  kleurstalen(relatiefPad: string, tussen?: (stalen: Bus3dStalen) => void): Promise<Bus3dStalen>
  /**
   * Een korte vingerafdruk van de bevestigde sleutels (8 hextekens). De foto v4 en zijn
   * `.geen` dragen hem in hun naam: zo geldt een foto die met een sleutel
   * gemaakt is niet meer als die sleutel weg is, en krijgt een bus die eerst
   * `versleuteld` was een nieuwe kans als zijn add-on geregistreerd wordt
   * (aanvalsverslag F2, punt 2).
   */
  registratieStempel(): string
  /** `bus:meld3d`: een meting van het venster, voor het logboek (§11.3). */
  meld(meting: Bus3dMeting): void
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
  /**
   * Lakstudio (lakstudio-ontwerp §4.1): losse bestanden in het register zetten
   * (de standaardtextuur van een doel, de .rpc-sjablonen), zodat de studio ze
   * op id ophaalt; het venster krijgt nooit een pad. Geeft pad → id.
   */
  registreerLos(paden: string[]): Map<string, string>
  /**
   * Lakstudio: het pakket van een familielid (manifest en kop), uit de cache of
   * nieuw gebouwd, zonder lak. Een eigen rij, zodat het de viewer niet vervangt.
   */
  lakPakket(relatiefPad: string): Promise<{ manifest: Bus3dManifest; kop: Bus3dPakKop } | { reden: Bus3dReden }>
  /** Lakstudio: een kleurstelling kwam erbij of ging weg; de stalen van deze bussen opnieuw. */
  kleurstellingenVeranderd(paden: string[], naam?: string): void
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
      /*
       * Ook bij de eerste lezing van deze sessie: een pakket uit een vorige
       * sessie met een sleutel die nu niet (meer) geregistreerd is. Eerst begon
       * `vorigeSleutels` leeg, en bleef zo'n pakket na een herstart met zijn
       * heldenbeeld staan (aanvalsverslag F2, punt 2).
       */
      const aantal = cache.vergeet({ toegestaan: r.sleutels })
      for (const [id, p] of pakketten) if (!magTonen(p.sleutels, r.sleutels)) pakketten.delete(id)
      if (aantal > 0 || weg.length > 0) {
        af.log(`bus3d: ${aantal} pakket(ten) vergeten, sleutel(s) niet (meer) geregistreerd${weg.length ? `: ${weg.join(', ')}` : ''}`)
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

  /*
   * Ook bij "Standaard" (geen kleurstelling): de app zet dan niets, maar de
   * ruststand -- welke meshes, welk materiaal -- moet nog steeds uitgerekend
   * worden (§5.2).
   */
  async function lak(z: Bus3dZijspoor, kleurstelling: string | undefined, extra?: Array<[string, number]>): Promise<Bus3dLak | undefined> {
    const uit = await metWacht<{ lak: Bus3dLak; textuurBronnen: Bus3dTextuurBron[] } | { reden: Bus3dReden }>({
      soort: 'bus3d:lak',
      pakket: z.pakket,
      kleurstelling,
      extra: extra?.length ? extra : undefined
    })
    if ('reden' in uit) return undefined
    for (const t of uit.textuurBronnen) texturen.set(t.id, t)
    const zichtbaar = [...uit.lak.zichtbaar].filter((c) => c === '1').length
    af.log(
      `bus3d lak ${z.bus} ${kleurstelling ?? '(standaard)'}: bron ${uit.lak.bron}, ${uit.lak.ms} ms, ` +
        `${uit.lak.texturen.length} texturen vervangen, ${zichtbaar} van ${uit.lak.zichtbaar.length} vermeldingen zichtbaar, ` +
        `onbekend [${uit.lak.onbekend.slice(0, 12).join(', ')}${uit.lak.onbekend.length > 12 ? ` ... (${uit.lak.onbekend.length})` : ''}]`
    )
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
      return { manifest: z.manifest, lak: l, bron }
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

  async function lak3d(
    pakket: string,
    kleurstelling?: string,
    venster?: WebContents,
    extra?: Array<[string, number]>
  ): Promise<Bus3dLak | { reden: Bus3dReden }> {
    if (!isBus3dId(String(pakket))) return { reden: 'fout' }
    const z = cache.zijspoor(pakket)
    if (!z) return { reden: 'verouderd' }
    const uit = await inDeRij(kanaalVan('lak', venster), async () => (await lak(z, kleurstelling, extra)) ?? leegLak(kleurstelling))
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
    if (soort === 'h') {
      const pad = helden.get(id)
      if (!pad) return new Response(null, { status: 404 })
      return stroom(pad, 'image/webp', vraag)
    }
    return new Response(null, { status: 404 })
  }

  // ------------------------------------------------------------ omgeving
  let omgeving: { waarde: Bus3dOmgeving; bronnen: Bus3dTextuurBron[] } | undefined
  async function omgeving3d(): Promise<Bus3dOmgeving> {
    // Eén keer gelezen; is een bestand veranderd, dan opnieuw (anders gaf t/ 409).
    const geldig = omgeving?.bronnen.every((b) => {
      try {
        const st = statSync(b.pad)
        return st.size === b.grootte && Math.round(st.mtimeMs) === b.mtime
      } catch {
        return false
      }
    })
    if (!omgeving || !geldig) {
      const uit = await vraagWerker<{ omgeving: Bus3dOmgeving; textuurBronnen: Bus3dTextuurBron[] }>({ soort: 'bus3d:omgeving' })
      omgeving = { waarde: uit.omgeving, bronnen: uit.textuurBronnen }
      af.log(`bus3d omgeving: hemel ${uit.omgeving.hemel?.naam ?? 'geen (eigen verloop)'}, wolken ${uit.omgeving.wolken?.naam ?? 'geen'}`)
    }
    for (const t of omgeving.bronnen) texturen.set(t.id, t)
    return omgeving.waarde
  }

  // ------------------------------------------------------------ heldenbeelden (§9)
  /** `h/<id>` -> het bestand; het id is een sha1 van de bestandsnaam, nooit een pad. */
  const helden = new Map<string, string>()
  const heldId = (pad: string): string => createHash('sha1').update(`h|${basename(pad).toLowerCase()}`).digest('hex')
  const HELD_SLEUTEL = /^(breed|smal)-d(1|15|2)-buiten-vast$/

  function heldenbeeld(pakket: string, kleurstelling: string | undefined, sleutel: string, webp: Uint8Array): boolean {
    if (!isBus3dId(pakket) || !HELD_SLEUTEL.test(sleutel) || !pakketten.has(pakket)) return false
    if (af.aan && !af.aan()) return false
    if (af.omsiDraait?.()) return false
    // Alleen een echte WebP van redelijke maat: RIFF....WEBP, hooguit 4 MB.
    const b = webp
    const riff = b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
    const isWebp = riff && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
    if (!isWebp || b.length > 4 * 1024 * 1024) return false
    try {
      const pad = cache.schrijfHeld(pakket, kleurstelling, sleutel, b)
      helden.set(heldId(pad), pad)
      af.log(`bus3d heldenbeeld: ${pakket.slice(0, 8)} ${kleurstelling ?? '(standaard)'} ${sleutel}, ${(b.length / 1024).toFixed(0)} kB`)
      return true
    } catch (fout) {
      af.logFout('bus3d heldenbeeld', fout)
      return false
    }
  }

  function fotoAlsKlaar(relatiefPad: string, kleurstelling?: string, verhouding?: 'breed' | 'smal'): string | undefined {
    const pad = String(relatiefPad ?? '')
    if (!/\.bus$/i.test(pad) || isAbsolute(pad) || pad.split(/[\\/]/).includes('..')) return undefined
    // Eerst de registratie: die vergeet wat niet meer mag, ook het heldenbeeld.
    const reg = registratie()
    const z = cache.zoek(af.omsi(), pad)
    if (z && !magTonen(z.manifest.sleutels, reg)) {
      cache.vergeetPakket(z.pakket, af.omsi(), z.bus)
      pakketten.delete(z.pakket)
      af.log(`bus3d ${pad}: pakket en heldenbeeld vergeten, een sleutel is niet (meer) geregistreerd`)
      return af.fotoTerugval?.(pad, kleurstelling)
    }
    if (!z) return af.fotoTerugval?.(pad, kleurstelling)
    const klassen = verhouding === 'smal' ? ['smal', 'breed'] : ['breed', 'smal']
    const sleutels = klassen.flatMap((k) => ['d2', 'd15', 'd1'].map((d) => `${k}-${d}-buiten-vast`))
    const gevonden = cache.zoekHeld(z.pakket, kleurstelling, sleutels)
    if (!gevonden) return af.fotoTerugval?.(pad, kleurstelling)
    const id = heldId(gevonden)
    helden.set(id, gevonden)
    return `omsi3d://h/${id}`
  }

  // ------------------------------------------------------------ kleurstalen (§7)
  const stalen = new Map<string, Bus3dStalen>()
  async function kleurstalen(relatiefPad: string, tussen?: (s: Bus3dStalen) => void): Promise<Bus3dStalen> {
    const pad = String(relatiefPad ?? '')
    if (!/\.bus$/i.test(pad) || isAbsolute(pad) || pad.split(/[\\/]/).includes('..')) return {}
    const sleutel = pad.toLowerCase()
    const bekend = stalen.get(sleutel)
    if (bekend) return bekend
    const t0 = Date.now()
    let uit: Bus3dStalen | { reden: 'tijd' }
    try {
      uit = await metWacht<Bus3dStalen>({ soort: 'bus3d:stalen', relatiefPad: pad }, (b) => {
        const deel = (b as { stalen?: Bus3dStalen }).stalen
        if (deel) tussen?.(deel)
      })
    } catch (fout) {
      af.logFout('bus3d kleurstalen', fout)
      return {}
    }
    if ('reden' in uit && typeof uit.reden === 'string' && Object.keys(uit).length === 1) return {}
    const klaar = uit as Bus3dStalen
    if (stalen.size >= 64) stalen.delete(stalen.keys().next().value as string)
    stalen.set(sleutel, klaar)
    af.log(`bus3d stalen ${pad}: ${Object.keys(klaar).length} kleurstellingen, ${Date.now() - t0} ms`)
    return klaar
  }

  function meld(meting: Bus3dMeting): void {
    const m = meting as Partial<Bus3dMeting>
    const n = (w: unknown): string => (typeof w === 'number' && Number.isFinite(w) ? String(Math.round(w)) : '?')
    const d = (w: unknown): string => (typeof w === 'number' && Number.isFinite(w) ? w.toFixed(1) : '?')
    if (!isBus3dId(String(m.pakket ?? ''))) return
    af.log(
      `bus3d beeld ${String(m.pakket).slice(0, 8)}: bron ${m.bron === 'nieuw' ? 'nieuw' : 'cache'}, eerste beeld ${n(m.eersteBeeldMs)} ms, ` +
        `scherp ${n(m.scherpMs)} ms, beeldtijd p50 ${d(m.p50)} / p95 ${d(m.p95)} ms, ` +
        `GPU ${n(typeof m.gpuBytes === 'number' ? m.gpuBytes / 1048576 : undefined)} MB (texturen ${n(m.texturenMB)} MB), DPR ${d(m.dpr)}, ${n(m.driehoeken)} driehoeken`
    )
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

  let stempel = { tijd: 0, waarde: '' }
  function registratieStempel(): string {
    // Hooguit eens per 2 s de ini's lezen: elke tegel vraagt zijn foto.
    // Uit de bevestigde sleutels, niet uit de vingerafdruk van de bestanden: een update van Steam verandert het manifest, niet de sleutels.
    if (Date.now() - stempel.tijd > 2000) {
      const sleutels = [...registratie()].sort((a, b) => a - b).join(',')
      stempel = { tijd: Date.now(), waarde: createHash('sha1').update(sleutels).digest('hex').slice(0, 8) }
    }
    return stempel.waarde
  }

  // ------------------------------------------------------------ de Lakstudio
  function registreerLos(paden: string[]): Map<string, string> {
    const uit = new Map<string, string>()
    for (const pad of paden) {
      try {
        const st = statSync(pad)
        // Dezelfde regel als textuurId in core/bus3d.ts (die niet in main hoeft).
        const id = createHash('sha1').update(`t|${pad.toLowerCase()}|${st.size}|${Math.round(st.mtimeMs)}`).digest('hex')
        const kop = Buffer.alloc(4)
        try {
          const fd = openSync(pad, 'r')
          readSync(fd, kop, 0, 4, 0)
          closeSync(fd)
        } catch {
          // dan zonder soort
        }
        const mime =
          kop[0] === 0x42 && kop[1] === 0x4d
            ? 'image/bmp'
            : kop[0] === 0x89 && kop[1] === 0x50
              ? 'image/png'
              : kop[0] === 0xff && kop[1] === 0xd8
                ? 'image/jpeg'
                : 'application/octet-stream'
        texturen.set(id, { id, pad, grootte: st.size, mtime: Math.round(st.mtimeMs), mime })
        uit.set(pad, id)
      } catch {
        // een bestand dat er niet is, krijgt geen id
      }
    }
    return uit
  }

  async function lakPakket(relatiefPad: string): Promise<{ manifest: Bus3dManifest; kop: Bus3dPakKop } | { reden: Bus3dReden }> {
    const pad = String(relatiefPad ?? '')
    if (!/\.(bus|ovh|sco)$/i.test(pad) || isAbsolute(pad) || pad.split(/[\/]/).includes('..')) return { reden: 'geen-model' }
    const uit = await inDeRij(`lak-pakket:${pad.toLowerCase()}`, async () => {
      const reg = registratie()
      let z = cache.zoek(af.omsi(), pad)
      if (z && (!magTonen(z.manifest.sleutels, reg) || !zelfdeSet(z.geregistreerd, reg))) z = undefined
      if (!z) {
        const gebouwd = await bouw(pad, reg)
        if ('reden' in gebouwd) return { reden: gebouwd.reden }
        z = gebouwd.zijspoor
      } else registreer(z)
      const kop = cache.kop(z.pakket)
      return kop ? { manifest: z.manifest, kop } : { reden: 'fout' as Bus3dReden }
    })
    return uit
  }

  function kleurstellingenVeranderd(paden: string[], naam?: string): void {
    for (const p of paden) {
      stalen.delete(p.toLowerCase())
      const z = cache.zoek(af.omsi(), p)
      if (z && naam !== undefined) cache.vergeetHelden(z.pakket, naam)
    }
  }

  return {
    model3d,
    lak3d,
    omgeving3d,
    heldenbeeld,
    fotoAlsKlaar,
    registratieStempel,
    kleurstalen,
    meld,
    antwoord,
    vergeet,
    stuk,
    ruimOp,
    cache,
    registreerLos,
    lakPakket,
    kleurstellingenVeranderd
  }
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
/*
 * Stukken van 1 MB in plaats van de standaard 64 kB: elk stuk is een bericht naar
 * de netwerkdienst van Chromium, en met tien texturen tegelijk kwam een TGA van
 * 12 MB er pas na 276 ms door (O560, e-main.tga), het langste pad naar "scherp".
 */
const BLOK = 1024 * 1024

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
    const lijf = Readable.toWeb(createReadStream(pad, { start: van, end: tot, highWaterMark: BLOK })) as unknown as ReadableStream
    return new Response(lijf, {
      status: 206,
      headers: { ...kop, 'Content-Length': String(tot - van + 1), 'Content-Range': `bytes ${van}-${tot}/${grootte}` }
    })
  }
  const lijf = Readable.toWeb(createReadStream(pad, { highWaterMark: BLOK })) as unknown as ReadableStream
  return new Response(lijf, { status: 200, headers: { ...kop, 'Content-Length': String(grootte) } })
}

/** Busopties uit het venster (Lakstudio §4.9): alleen [naam, getal]-paren, hooguit 64, namen zonder rare tekens. */
function extraVars(x: unknown): Array<[string, number]> | undefined {
  if (!Array.isArray(x)) return undefined
  const uit = x
    .filter((p): p is [string, number] => Array.isArray(p) && typeof p[0] === 'string' && /^[\w .-]{1,64}$/.test(p[0]) && typeof p[1] === 'number' && Number.isFinite(p[1]))
    .slice(0, 64)
  return uit.length ? uit : undefined
}

/** De IPC voor het 3D-venster (§11.3). De preload `bus3d` geeft ze door (F2). */
export function registreerBus3dIpc(ipcMain: IpcMain, dienst: Bus3dDienst): void {
  ipcMain.handle('bus:model3d', (event: IpcMainInvokeEvent, relatiefPad: unknown, kleurstelling: unknown) =>
    dienst.model3d(String(relatiefPad ?? ''), typeof kleurstelling === 'string' ? kleurstelling : undefined, event.sender)
  )
  ipcMain.handle('bus:lak3d', (event: IpcMainInvokeEvent, pakket: unknown, kleurstelling: unknown, extra: unknown) =>
    dienst.lak3d(String(pakket ?? ''), typeof kleurstelling === 'string' ? kleurstelling : undefined, event.sender, extraVars(extra))
  )
  // Het venster kan een pakket niet lezen: vergeten, zodat [Opnieuw] echt opnieuw bouwt.
  ipcMain.on('bus:stuk3d', (_event, pakket: unknown) => dienst.stuk(String(pakket ?? '')))
  ipcMain.handle('bus:omgeving3d', () => dienst.omgeving3d())
  ipcMain.handle('bus:heldenbeeld', (_event, pakket: unknown, kleurstelling: unknown, sleutel: unknown, webp: unknown) =>
    webp instanceof Uint8Array || webp instanceof ArrayBuffer
      ? dienst.heldenbeeld(
          String(pakket ?? ''),
          typeof kleurstelling === 'string' ? kleurstelling : undefined,
          String(sleutel ?? ''),
          webp instanceof Uint8Array ? webp : new Uint8Array(webp)
        )
      : false
  )
  ipcMain.handle('bus:fotoAlsKlaar', (_event, relatiefPad: unknown, kleurstelling: unknown, verhouding: unknown) =>
    dienst.fotoAlsKlaar(
      String(relatiefPad ?? ''),
      typeof kleurstelling === 'string' ? kleurstelling : undefined,
      verhouding === 'smal' ? 'smal' : 'breed'
    )
  )
  ipcMain.on('bus:meld3d', (_event, meting: unknown) => {
    if (meting && typeof meting === 'object') dienst.meld(meting as Bus3dMeting)
  })
}

export type { Bus3dManifest }
