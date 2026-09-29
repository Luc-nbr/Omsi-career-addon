import { StrictMode, useEffect, useRef, useState, type JSX } from 'react'
import { createRoot } from 'react-dom/client'
import { isLanguage, type Language } from '../../../shared/i18n'
import { BusViewer, type ViewerStand } from '../BusViewer'
import { LanguageProvider } from '../language'
import type { AfdrukVraag } from './berichten'
import { Verbinding, type ViewerHandvat } from './verbinding'

/**
 * DE INGANG VAN HET 3D-VENSTER (bus3d.html, bus3d-ontwerp §8.1)
 *
 * Met StrictMode, net als het hoofdvenster: de viewer moet een dubbele mount
 * overleven met één context (§4.4, §14 F2).
 *
 * Dit is de eerste helft van F2: alleen de viewer, over het hele venster. Welke
 * bus erin staat komt nu uit het adres (`?bus=<relatief pad>&kleur=<naam>&taal=nl`);
 * het venster eromheen -- de vraag van main, het zijpaneel met de
 * kleurstellingen, [Kiezen] -- komt met main/bus3dvenster.ts.
 *
 * Met `?proef=1` hangt er een haakje voor de proef (scripts/probe-bus3d-beeld.cjs)
 * aan `window.__bv`: een bus laden en wachten tot hij scherp staat, afdrukken,
 * meten, en de lange taken op de hoofddraad.
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
  afdruk(a: AfdrukVraag): Promise<{ beeld?: string; masker?: string; id?: string; idTabel?: unknown; fout?: string }>
  meet(wat: 'draaien' | 'schaduw' | 'geheugen', beelden?: number): Promise<unknown>
  stand(): ViewerStand | undefined
  langeTaken(): number[]
  wisLangeTaken(): void
  /** Wat de renderer-werker bij het starten meldde: WebGL2, kaart, MSAA-monsters, S3TC. */
  info(): Promise<unknown>
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
if (proef && 'PerformanceObserver' in window) {
  try {
    new PerformanceObserver((lijst) => {
      for (const e of lijst.getEntries()) langeTaken.push({ begin: e.startTime, duur: Math.round(e.duration) })
    }).observe({ type: 'longtask', buffered: true })
  } catch {
    // geen longtask in deze Chromium: dan blijft de lijst leeg
  }
}

function Venster(): JSX.Element {
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Venster />
  </StrictMode>
)
