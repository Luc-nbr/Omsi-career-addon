import { StrictMode, useEffect, useRef, useState, type JSX } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/hanken-grotesk/400.css'
import '@fontsource/hanken-grotesk/500.css'
import '@fontsource/hanken-grotesk/700.css'
import '../theme.css'
import { isLanguage, type Language } from '../../../shared/i18n'
import type { Bus3dVensterInstellingen, Bus3dVensterStand, Bus3dVensterVraag } from '../../../shared/bus3d'
import { BusViewer, type ViewerStand } from '../BusViewer'
import { LanguageProvider } from '../language'
import type { Laag, LakFamilieInfo } from '../../../shared/lak'
import type { AfdrukVraag } from './berichten'
import { Bus3dVenster } from './Bus3dVenster'
import { klok as klokNu, Verbinding, type ViewerHandvat } from './verbinding'

/**
 * HET REACT-DEEL VAN HET 3D-VENSTER (bus3d.html, bus3d-ontwerp §8.1)
 *
 * De ingang zelf (venster.tsx) is klein: die zet eerst het plaatje neer en
 * laadt dit deel daarna. Hier de twee standen met React:
 * - `startVenster`: het 3D-venster van main (main/bus3dvenster.ts). De vraag --
 *   welke bus, welk doel, taal, thema, pauze -- komt van main (`bus3d:vraag`),
 *   en een nieuwe vraag komt in hetzelfde venster;
 * - `startProef`: alleen de viewer over het hele venster (`?proef=1` of
 *   `?bus=<relatief pad>&kleur=<naam>&taal=nl`), voor
 *   scripts/probe-bus3d-beeld.cjs. Met `?proef=1` hangt er een haakje aan
 *   `window.__bv`: een bus laden en wachten tot hij scherp staat, afdrukken,
 *   meten, en de lange taken op de hoofddraad.
 *
 * Met StrictMode, net als het hoofdvenster: de viewer moet een dubbele mount
 * overleven met één context (§4.4, §14 F2).
 */

const adres = new URLSearchParams(location.search)
const taalUitAdres = adres.get('taal') ?? 'nl'
const taal: Language = isLanguage(taalUitAdres) ? taalUitAdres : 'nl'
const proef = adres.has('proef')
// Alleen bij de proef: lichtwaarden om te ijken (`?licht={"belichting":1.4}`).
if (proef && adres.get('licht')) {
  try {
    Verbinding.get().licht(JSON.parse(adres.get('licht')!) as Record<string, unknown>)
  } catch {
    // geen geldige JSON: dan de gewone waarden
  }
}

interface Proefhaak {
  laad(pad: string, kleur?: string): Promise<ViewerStand>
  /** Dezelfde bus in een andere kleurstelling (zonder opnieuw te laden): tot hij weer scherp staat. */
  kleur(kleur?: string): Promise<ViewerStand>
  afdruk(a: AfdrukVraag): Promise<{ beeld?: string; masker?: string; id?: string; idTabel?: unknown; fout?: string }>
  meet(wat: 'draaien' | 'schaduw' | 'geheugen', beelden?: number): Promise<unknown>
  stand(): ViewerStand | undefined
  langeTaken(): number[]
  wisLangeTaken(): void
  /** Wat de renderer-werker bij het starten meldde: WebGL2, kaart, MSAA-monsters, S3TC. */
  info(): Promise<unknown>
  /** Het lakdoek (Lakstudio L1), voor scripts/probe-lakstudio-beeld.cjs. Bytes gaan als base64. */
  studio: {
    start(familie: LakFamilieInfo, lagen: Laag[], spiegel?: { aan: boolean; vlakX?: number }, licht?: boolean): Promise<unknown>
    lagen(lagen: Laag[], spiegel?: { aan: boolean; vlakX?: number }): void
    masker(aan: boolean): void
    kies(x: number, y: number): Promise<unknown>
    exporteer(o?: { tegel?: number; alleen?: string[]; metRgba?: boolean }): Promise<unknown>
    meet(beelden?: number): Promise<unknown>
    beeld(id: string, png: string, mime?: string): Promise<void>
    stop(): void
    proef(o: Parameters<ViewerHandvat['studio']['proef']>[0]): Promise<unknown>
    maskers(): Promise<unknown>
    /** Busopties (§4.9, P16): de lak opnieuw met extra setvars, dan de maskers opnieuw; geeft de tijden. */
    opties(extra: Array<[string, number]>): Promise<unknown>
    /** P4: de context bewust kwijt (pauze met vrijgeven) en terug; wacht op de herstart van het lakdoek. */
    verlies(): Promise<unknown>
    /** P7: de lagen zetten en de uitslag van de geen-kopie-regel afwachten (per decal-laag). */
    analyseNa(lagen: Laag[], spiegel?: { aan: boolean; vlakX?: number }): Promise<unknown>
    /** P7: [Schuif naar een vrij stuk]. */
    schuif(id: string): Promise<unknown>
  }
}

declare global {
  interface Window {
    __bv?: Proefhaak
  }
}

/** Een ArrayBuffer als base64, voor de proef (die haalt het met executeJavaScript op). */
function base64(b: ArrayBuffer): string {
  const bytes = new Uint8Array(b)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

/** Lange taken op de hoofddraad (> 50 ms), met hun begin: alleen die na `wisLangeTaken` tellen. */
const langeTaken: Array<{ begin: number; duur: number }> = []
let langeTakenVanaf = 0
if ('PerformanceObserver' in window) {
  try {
    new PerformanceObserver((lijst) => {
      for (const e of lijst.getEntries()) langeTaken.push({ begin: e.startTime, duur: Math.round(e.duration) })
      // Ook buiten de proef af te lezen (probe-bus3d-venster.cjs): het aantal sinds het laden.
      document.documentElement.dataset.langeTaken = String(langeTaken.length)
    }).observe({ type: 'longtask', buffered: true })
  } catch {
    // geen longtask in deze Chromium: dan blijft de lijst leeg
  }
}

/** Alleen de viewer, over het hele venster: de proef van de renderer. */
function Proefviewer(): JSX.Element {
  const [bus, zetBus] = useState<{ pad: string; kleur?: string; n: number }>({
    pad: adres.get('bus') ?? '',
    kleur: adres.get('kleur') ?? undefined,
    n: 0
  })
  const handvat = useRef<ViewerHandvat | undefined>(undefined)
  const laatste = useRef<ViewerStand | undefined>(undefined)
  const wachters = useRef<Array<(s: ViewerStand) => void>>([])

  useEffect(() => {
    if (!proef) return
    window.__bv = {
      laad: (pad, kleur) =>
        new Promise((klaar) => {
          laatste.current = undefined
          wachters.current.push(klaar)
          zetBus((b) => ({ pad, kleur, n: b.n + 1 }))
        }),
      kleur: (kleur) =>
        new Promise((klaar) => {
          laatste.current = undefined
          wachters.current.push(klaar)
          zetBus((b) => ({ ...b, kleur }))
        }),
      afdruk: async (a) => {
        const h = handvat.current
        if (!h) return { fout: 'geen viewer' }
        const u = await h.afdruk(a)
        if ('fout' in u) return { fout: u.fout }
        return {
          beeld: base64(u.beeld),
          masker: u.masker ? base64(u.masker) : undefined,
          id: u.id ? base64(u.id) : undefined,
          idTabel: u.idTabel
        }
      },
      meet: async (wat, beelden) => (handvat.current ? handvat.current.meet(wat, beelden) : { fout: 'geen viewer' }),
      stand: () => laatste.current,
      info: () => Verbinding.get().gereed,
      langeTaken: () => langeTaken.filter((t) => t.begin >= langeTakenVanaf).map((t) => t.duur),
      wisLangeTaken: () => {
        langeTakenVanaf = performance.now()
      },
      studio: {
        start: async (familie, lagen, spiegel, licht) => handvat.current?.studio.start(familie, lagen, spiegel, licht) ?? { fout: 'geen viewer' },
        lagen: (lagen, spiegel) => handvat.current?.studio.lagen(lagen, spiegel),
        masker: (aan) => handvat.current?.studio.masker(aan),
        kies: async (x, y) => handvat.current?.studio.kies(x, y) ?? { fout: 'geen viewer' },
        exporteer: async (o) => {
          const u = (await handvat.current?.studio.exporteer(o)) as Array<{ doel: string; dds: Uint8Array; rgba?: Uint8Array; formaat: string; ms: unknown }> | { fout: string } | undefined
          if (!u || 'fout' in u) return u ?? { fout: 'geen viewer' }
          return u.map((x) => ({
            doel: x.doel,
            formaat: x.formaat,
            ms: x.ms,
            dds: base64(x.dds.buffer.slice(x.dds.byteOffset, x.dds.byteOffset + x.dds.byteLength) as ArrayBuffer),
            rgba: x.rgba ? base64(x.rgba.buffer.slice(x.rgba.byteOffset, x.rgba.byteOffset + x.rgba.byteLength) as ArrayBuffer) : undefined
          }))
        },
        meet: async (beelden) => handvat.current?.studio.meet(beelden) ?? { fout: 'geen viewer' },
        beeld: async (id, png, mime = 'image/png') => {
          const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0))
          const bm = await createImageBitmap(new Blob([bytes], { type: mime }), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })
          handvat.current?.studio.beeld(id, bm)
        },
        stop: () => handvat.current?.studio.stop(),
        proef: async (o) => {
          const u = (await handvat.current?.studio.proef(o)) as { px?: Uint8Array; b: number; h: number; ms?: unknown; fout?: string } | undefined
          if (!u || u.fout || !u.px) return u
          return { b: u.b, h: u.h, ms: u.ms, px: base64(u.px.buffer.slice(u.px.byteOffset, u.px.byteOffset + u.px.byteLength) as ArrayBuffer) }
        },
        maskers: async () => handvat.current?.studio.maskers(),
        verlies: () =>
          new Promise((klaar) => {
            const h = handvat.current
            if (!h) return klaar({ fout: 'geen viewer' })
            const v = Verbinding.get()
            const oud = v.opLakHerstart
            const t0 = performance.now()
            const klok = setTimeout(() => {
              v.opLakHerstart = oud
              klaar({ fout: 'geen herstart binnen 60 s' })
            }, 60000)
            v.opLakHerstart = (k) => {
              clearTimeout(klok)
              v.opLakHerstart = oud
              klaar({ klaar: k, ms: Math.round(performance.now() - t0) })
            }
            h.pauze(true, true)
            setTimeout(() => h.pauze(false), 400)
          }),
        analyseNa: (lagen, spiegel) =>
          new Promise((klaar) => {
            const h = handvat.current
            if (!h) return klaar({ fout: 'geen viewer' })
            const v = Verbinding.get()
            const oud = v.opLakAnalyse
            const ids = lagen.filter((l) => 'plaats' in l && l.zichtbaar).map((l) => l.id)
            const klok = setTimeout(() => {
              v.opLakAnalyse = oud
              klaar({ fout: 'geen analyse binnen 8 s' })
            }, 8000)
            v.opLakAnalyse = (u) => {
              if (!ids.every((id) => id in u)) return
              clearTimeout(klok)
              v.opLakAnalyse = oud
              klaar(u)
            }
            h.studio.lagen(lagen, spiegel)
          }),
        schuif: async (id) => handvat.current?.studio.schuif(id),
        opties: async (extra) => {
          const h = handvat.current
          const pakket = laatste.current?.pakket
          if (!h || !pakket) return { fout: 'geen bus' }
          const t0 = performance.now()
          const lak = await window.bus3d!.busLak3d(pakket, bus.kleur, extra)
          if ('reden' in lak) return { fout: lak.reden }
          const t1 = performance.now()
          h.lak(lak, klokNu())
          const m = (await h.studio.maskers()) as { ms: number }
          return { lakMs: Math.round(t1 - t0), maskerMs: m.ms, totaalMs: Math.round(performance.now() - t0), zichtbaar: [...lak.zichtbaar].filter((c) => c === '1').length }
        }
      }
    }
  }, [])

  const opStand = (s: ViewerStand): void => {
    laatste.current = s
    if (s.fase === 'scherp' || s.fase === 'fout') {
      const w = wachters.current
      wachters.current = []
      for (const k of w) k(s)
    }
  }

  return (
    <LanguageProvider language={taal}>
      {bus.pad ? (
        <BusViewer
          key={proef ? `${bus.pad}|${bus.n}` : bus.pad}
          relatiefPad={bus.pad}
          kleurstelling={bus.kleur}
          onStand={opStand}
          onHandvat={(h) => (handvat.current = h)}
        />
      ) : null}
    </LanguageProvider>
  )
}

/** Het thema van het hoofdvenster op de wortel: het zijpaneel volgt het, het beeld niet (§5.6). */
function zetThema(i: Bus3dVensterInstellingen): void {
  if (i.thema === 'licht' || i.thema === 'donker') document.documentElement.dataset.thema = i.thema
  else delete document.documentElement.dataset.thema
  document.documentElement.lang = i.taal
}

/** Het venster van main: de vraag, taal, thema en pauze komen van main. */
function VensterWortel({ begin }: { begin: Bus3dVensterVraag }): JSX.Element {
  const brug = window.bus3d!
  const [vraag, zetVraag] = useState(begin)
  const [instellingen, zetInstellingen] = useState<Bus3dVensterInstellingen>(
    begin.instellingen ?? { taal: 'nl', thema: 'systeem' }
  )
  const [stand, zetStand] = useState<Bus3dVensterStand>(begin.stand ?? { pauze: false, licht: false })
  useEffect(() => {
    const weg = [
      brug.opVraag((v) => {
        zetVraag(v)
        if (v.instellingen) zetInstellingen(v.instellingen)
        if (v.stand) zetStand(v.stand)
      }),
      brug.opInstellingen(zetInstellingen),
      brug.opStand(zetStand)
    ]
    // Wat er veranderde tussen de eerste vraag en nu (het React-deel laadt later): nog één keer vragen.
    void brug.vraag().then((v) => {
      if (!v) return
      if (v.stand) zetStand(v.stand)
      if (v.instellingen) zetInstellingen(v.instellingen)
    })
    return () => weg.forEach((w) => w())
  }, [brug])
  useEffect(() => zetThema(instellingen), [instellingen])
  const t: Language = isLanguage(instellingen.taal) ? instellingen.taal : 'nl'
  return (
    <LanguageProvider language={t}>
      <Bus3dVenster vraag={vraag} instellingen={instellingen} stand={stand} />
    </LanguageProvider>
  )
}

/** Alleen de viewer, voor de proef van de renderer. */
export function startProef(): void {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Proefviewer />
    </StrictMode>
  )
}

/** Het venster van main, met de vraag die de ingang al had. */
export function startVenster(v: Bus3dVensterVraag): void {
  if (v.instellingen) zetThema(v.instellingen)
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <VensterWortel begin={v} />
    </StrictMode>
  )
}
