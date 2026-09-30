import type { Bus3dLak, Bus3dManifest, Bus3dOmgeving } from '../../../shared/bus3d'
import type { Laag, LakFamilieInfo } from '../../../shared/lak'
import { klok, type AfdrukVraag, type Invoer, type NaarWerker, type StandBericht, type VanWerker } from './berichten'

/**
 * DE VERBINDING VAN EEN VENSTER MET ZIJN RENDERER-WERKER (bus3d-ontwerp §4.4)
 *
 * Eén per venster (singleton): de eerste viewer start de werker, en die blijft
 * met zijn context en texturen zolang het venster leeft. Een viewer meldt zich
 * aan met een `<canvas>` waarop hij een `bitmaprenderer` heeft, en krijgt de
 * beelden van de werker daarop (`transferFromImageBitmap`). Mounten en
 * unmounten -- ook de dubbele mount van React StrictMode -- is alleen aan- en
 * afmelden: de context blijft er één.
 */

export interface ViewerLuisteraar {
  opStand?(s: StandBericht): void
  opFout?(f: Extract<VanWerker, { soort: 'fout' }>): void
  opHeld?(h: Extract<VanWerker, { soort: 'held' }>): void
  opEersteBeeld?(): void
}

export interface ViewerHandvat {
  readonly id: number
  maat(b: number, h: number, dpr: number): void
  laad(manifest: Bus3dManifest, lak: Bus3dLak | undefined, bron: 'cache' | 'nieuw', t0: number, licht?: boolean, foto?: boolean): number
  lak(lak: Bus3dLak, t0: number): void
  invoer(i: Invoer): void
  /** Pauze (§9); met `vrijgeven` gaat de context weg, en bij hervatten komt hij terug met de bus. */
  pauze(aan: boolean, vrijgeven?: boolean): void
  plateau(aan: boolean): void
  afdruk(a: AfdrukVraag): Promise<{ beeld: ArrayBuffer; masker?: ArrayBuffer; id?: ArrayBuffer; idTabel?: unknown } | { fout: string }>
  meet(wat: 'draaien' | 'schaduw' | 'geheugen', beelden?: number): Promise<unknown>
  weg(): void
  /** De Lakstudio (lakstudio-ontwerp §4.1): het lakdoek in de werker van deze viewer. */
  studio: {
    start(familie: LakFamilieInfo, lagen: Laag[], spiegel?: { aan: boolean; vlakX?: number }, licht?: boolean): Promise<unknown>
    lagen(lagen: Laag[], spiegel?: { aan: boolean; vlakX?: number }): void
    beeld(id: string, beeld: ImageBitmap): void
    masker(aan: boolean): void
    kies(x: number, y: number): Promise<unknown>
    streek(laag: number, streek: Extract<NaarWerker, { soort: 'lakStreek' }>['streek']): void
    exporteer(opties?: { tegel?: number; alleen?: string[]; metRgba?: boolean }): Promise<unknown>
    meet(beelden?: number): Promise<unknown>
    stop(): void
    /** Voor de proef (P3-P6): zie `Lakdoek.proef`. */
    proef(o: Omit<Extract<NaarWerker, { soort: 'lakProef' }>, 'soort' | 'vraag'>): Promise<unknown>
    /** De maskers opnieuw na andere busopties (§4.9). */
    maskers(): Promise<unknown>
    /** Deze viewer is de tweede viewport (de andere kant, §4.8). */
    tweede(aan: boolean): void
  }
}

interface Aangemeld {
  doek: HTMLCanvasElement
  ctx: ImageBitmapRenderingContext | null
  luister: ViewerLuisteraar
  beelden: number
  /** Het nummer van de laatste bus die deze viewer vroeg; oudere beelden tellen niet. */
  laad: number
}

export class Verbinding {
  private static enige?: Verbinding
  private werker: Worker
  private viewers = new Map<number, Aangemeld>()
  private vragen = new Map<number, (u: unknown) => void>()
  private volgendeViewer = 0
  private volgendeVraag = 0
  private volgendeLaad = 0
  private omgevingGestuurd = false
  /** De voortgang van een lak-export (§2.1: "Lak maken … In OMSI zetten …"). */
  opLakVoortgang?: (v: { doel: string; stap: string; deel: number }) => void
  /** Het lakdoek herstartte na een contextverlies, licht (P4). */
  opLakHerstart?: (klaar: unknown) => void
  /** Wat de werker bij het starten meldde: WebGL2 of niet, en wat voor kaart. */
  gereed: Promise<Extract<VanWerker, { soort: 'gereed' }>>

  static get(): Verbinding {
    Verbinding.enige ??= new Verbinding()
    return Verbinding.enige
  }

  private constructor() {
    this.werker = new Worker(new URL('./werker.ts', import.meta.url), { type: 'module' })
    let gereed: (g: Extract<VanWerker, { soort: 'gereed' }>) => void = () => undefined
    this.gereed = new Promise((k) => (gereed = k))
    this.werker.onerror = (e) => gereed({ soort: 'gereed', webgl: false, detail: e.message })
    this.werker.onmessage = (e: MessageEvent<VanWerker>) => {
      const m = e.data
      if (m.soort === 'gereed') gereed(m)
      else if (m.soort === 'beeld') {
        const v = this.viewers.get(m.viewer)
        /*
         * Een beeld van de VORIGE bus dat nog onderweg was toen de volgende
         * gevraagd werd: niet laten zien en niet als eerste beeld tellen. Anders
         * stond de O560 in beeld onder het zijpaneel van de NLC (tegenlezing F2).
         */
        if (v && m.laad < v.laad) {
          m.bitmap.close()
        } else if (v?.ctx) {
          v.ctx.transferFromImageBitmap(m.bitmap)
          v.beelden++
          if (v.beelden === 1) v.luister.opEersteBeeld?.()
        } else m.bitmap.close()
        this.stuur({ soort: 'gezien', viewer: m.viewer })
      } else if (m.soort === 'stand') this.viewers.get(m.viewer)?.luister.opStand?.(m)
      else if (m.soort === 'fout') this.viewers.get(m.viewer)?.luister.opFout?.(m)
      else if (m.soort === 'held') this.viewers.get(m.viewer)?.luister.opHeld?.(m)
      else if (m.soort === 'lakVoortgang') this.opLakVoortgang?.({ doel: m.doel, stap: m.stap, deel: m.deel })
      else if (m.soort === 'lakHerstart') this.opLakHerstart?.(m.klaar)
      else if (m.soort === 'antwoord') {
        const k = this.vragen.get(m.vraag)
        this.vragen.delete(m.vraag)
        k?.(m.uitkomst)
      }
    }
  }

  private stuur(m: NaarWerker, overdracht?: Transferable[]): void {
    this.werker.postMessage(m, overdracht ?? [])
  }

  private vraag(m: (vraag: number) => NaarWerker): Promise<unknown> {
    const vraag = ++this.volgendeVraag
    return new Promise((k) => {
      this.vragen.set(vraag, k)
      this.stuur(m(vraag))
    })
  }

  /** De textuurlijst van een pakket in aanbouw: de werker haalt de bestanden alvast op. */
  voorhaal(lijst: Array<{ id: string; bytes: number }>): void {
    this.stuur({ soort: 'voorhaal', lijst })
  }

  /** Alleen voor het ijken (de proef): lichtwaarden overschrijven. */
  licht(l: Record<string, unknown>): void {
    this.stuur({ soort: 'licht', licht: l })
  }

  /** Hemel en wolken: één keer per venster. */
  omgeving(o: Bus3dOmgeving): void {
    if (this.omgevingGestuurd) return
    this.omgevingGestuurd = true
    this.stuur({ soort: 'omgeving', omgeving: o })
  }

  meld(doek: HTMLCanvasElement, luister: ViewerLuisteraar): ViewerHandvat {
    const id = ++this.volgendeViewer
    const ctx = doek.getContext('bitmaprenderer')
    this.viewers.set(id, { doek, ctx, luister, beelden: 0, laad: 0 })
    const zelf = this
    return {
      id,
      maat: (b, h, dpr) => zelf.stuur({ soort: 'viewer', viewer: id, b, h, dpr }),
      laad: (manifest, lak, bron, t0, licht, foto) => {
        const laad = ++zelf.volgendeLaad
        const v = zelf.viewers.get(id)
        if (v) {
          v.beelden = 0
          v.laad = laad
        }
        zelf.stuur({ soort: 'bus', viewer: id, laad, manifest, lak, bron, t0, licht, foto })
        return laad
      },
      lak: (lak, t0) => zelf.stuur({ soort: 'lak', viewer: id, lak, t0 }),
      invoer: (i) => zelf.stuur({ soort: 'invoer', viewer: id, invoer: i }),
      pauze: (aan, vrijgeven) => {
        const v = zelf.viewers.get(id)
        // Na hervatten komt de bus opnieuw binnen: het eerste beeld telt dan weer als eerste.
        if (v && !aan) v.beelden = 0
        zelf.stuur({ soort: 'pauze', viewer: id, aan, vrijgeven })
      },
      plateau: (aan) => zelf.stuur({ soort: 'plateau', viewer: id, aan }),
      afdruk: (a) => zelf.vraag((vraag) => ({ soort: 'afdruk', vraag, viewer: id, afdruk: a })) as ReturnType<ViewerHandvat['afdruk']>,
      meet: (wat, beelden) => zelf.vraag((vraag) => ({ soort: 'meet', vraag, viewer: id, wat, beelden })),
      studio: {
        start: (familie, lagen, spiegel, licht) => zelf.vraag((vraag) => ({ soort: 'lakStart', vraag, viewer: id, familie, lagen, spiegel, licht })),
        lagen: (lagen, spiegel) => zelf.stuur({ soort: 'lakLagen', lagen, spiegel }),
        beeld: (beeldId, beeld) => zelf.stuur({ soort: 'lakBeeld', id: beeldId, beeld }, [beeld]),
        masker: (aan) => zelf.stuur({ soort: 'lakMasker', aan }),
        kies: (x, y) => zelf.vraag((vraag) => ({ soort: 'lakKies', vraag, viewer: id, x, y })),
        streek: (laag, streek) => zelf.stuur({ soort: 'lakStreek', laag, streek }),
        exporteer: (o) => zelf.vraag((vraag) => ({ soort: 'lakExport', vraag, tegel: o?.tegel, alleen: o?.alleen, metRgba: o?.metRgba })),
        meet: (beelden) => zelf.vraag((vraag) => ({ soort: 'lakMeet', vraag, viewer: id, beelden })),
        stop: () => zelf.stuur({ soort: 'lakStop' }),
        maskers: () => zelf.vraag((vraag) => ({ soort: 'lakMaskers', vraag })),
        proef: (o) => zelf.vraag((vraag) => ({ soort: 'lakProef', vraag, ...o })),
        tweede: (aan) => zelf.stuur({ soort: 'tweede', viewer: id, aan })
      },
      weg: () => {
        // Het laatste beeld meteen loslaten, niet pas als de vuilnisman langskomt (8 MB videogeheugen per doek).
        const v = zelf.viewers.get(id)
        try {
          v?.ctx?.transferFromImageBitmap(null)
        } catch {
          // al weg
        }
        zelf.viewers.delete(id)
        zelf.stuur({ soort: 'weg', viewer: id })
      }
    }
  }
}

export { klok }
