import type { Bus3dLak, Bus3dManifest, Bus3dOmgeving } from '../../../shared/bus3d'
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
  laad(manifest: Bus3dManifest, lak: Bus3dLak | undefined, bron: 'cache' | 'nieuw', t0: number, licht?: boolean): number
  lak(lak: Bus3dLak): void
  invoer(i: Invoer): void
  pauze(aan: boolean, vrijgeven?: boolean): void
  afdruk(a: AfdrukVraag): Promise<{ beeld: ArrayBuffer; masker?: ArrayBuffer; id?: ArrayBuffer; idTabel?: unknown } | { fout: string }>
  meet(wat: 'draaien' | 'schaduw' | 'geheugen', beelden?: number): Promise<unknown>
  weg(): void
}

interface Aangemeld {
  doek: HTMLCanvasElement
  ctx: ImageBitmapRenderingContext | null
  luister: ViewerLuisteraar
  beelden: number
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
        if (v?.ctx) {
          v.ctx.transferFromImageBitmap(m.bitmap)
          v.beelden++
          if (v.beelden === 1) v.luister.opEersteBeeld?.()
        } else m.bitmap.close()
        this.stuur({ soort: 'gezien', viewer: m.viewer })
      } else if (m.soort === 'stand') this.viewers.get(m.viewer)?.luister.opStand?.(m)
      else if (m.soort === 'fout') this.viewers.get(m.viewer)?.luister.opFout?.(m)
      else if (m.soort === 'held') this.viewers.get(m.viewer)?.luister.opHeld?.(m)
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
    this.viewers.set(id, { doek, ctx, luister, beelden: 0 })
    const zelf = this
    return {
      id,
      maat: (b, h, dpr) => zelf.stuur({ soort: 'viewer', viewer: id, b, h, dpr }),
      laad: (manifest, lak, bron, t0, licht) => {
        const laad = ++zelf.volgendeLaad
        const v = zelf.viewers.get(id)
        if (v) v.beelden = 0
        zelf.stuur({ soort: 'bus', viewer: id, laad, manifest, lak, bron, t0, licht })
        return laad
      },
      lak: (lak) => zelf.stuur({ soort: 'lak', viewer: id, lak }),
      invoer: (i) => zelf.stuur({ soort: 'invoer', viewer: id, invoer: i }),
      pauze: (aan, vrijgeven) => zelf.stuur({ soort: 'pauze', viewer: id, aan, vrijgeven }),
      afdruk: (a) => zelf.vraag((vraag) => ({ soort: 'afdruk', vraag, viewer: id, afdruk: a })) as ReturnType<ViewerHandvat['afdruk']>,
      meet: (wat, beelden) => zelf.vraag((vraag) => ({ soort: 'meet', vraag, viewer: id, wat, beelden })),
      weg: () => {
        zelf.viewers.delete(id)
        zelf.stuur({ soort: 'weg', viewer: id })
      }
    }
  }
}

export { klok }
