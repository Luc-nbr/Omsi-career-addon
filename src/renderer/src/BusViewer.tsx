import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import type { Bus3dBrug, Bus3dLak, Bus3dManifest, Bus3dMeting, Bus3dReden } from '../../shared/bus3d'
import { useT } from './language'
import { klok } from './bus3d/berichten'
import type { Stand } from './bus3d/camera'
import { Verbinding, type ViewerHandvat } from './bus3d/verbinding'
import './busviewer.css'

/**
 * DE VIEWER VAN HET 3D-VENSTER (bus3d-ontwerp §6, §8.1, §9)
 *
 * Een `<canvas>` met een `bitmaprenderer`: de beelden komen van de
 * renderer-werker van dit venster (bus3d/verbinding.ts). De viewer vraagt de
 * bus aan main (`window.bus3d.busModel3d`), geeft het manifest door, en stuurt
 * de muis, het wiel en de toetsen door naar de camera in de werker.
 *
 * Nooit een leeg kader (§0.9): zolang er geen 3D-beeld is, staat het
 * heldenbeeld of de foto van de tegel eronder, en is die er ook niet, het
 * busicoon. Komt er geen 3D (geen WebGL2, een versleuteld model, een fout), dan
 * blijft dat plaatje staan met de uitleg. In pauze (§9) gaat de context weg en
 * staat de foto er weer, met [Hervatten].
 */

declare global {
  interface Window {
    bus3d?: Bus3dBrug
  }
}

export type Busvorm = 'solo' | 'geleed' | 'dubbel' | 'midi'

export interface ViewerStand {
  fase: 'wacht' | 'bouwen' | 'geometrie' | 'texturen' | 'scherp' | 'fout'
  klaar: number
  totaal: number
  eersteBeeldMs?: number
  scherpMs?: number
  meting?: Bus3dMeting
  /** Waar de tijd heen ging (ms na het vragen); `antwoord` = het manifest van main binnen. */
  mijlpalen?: Record<string, number>
  reden?: Bus3dReden | 'geen-webgl' | 'context-weg' | 'pakket-stuk'
  detail?: string
  pakket?: string
  bron?: 'cache' | 'nieuw'
  /** Onderdelen die niet getoond worden omdat hun sleutel hier niet geregistreerd is (§9, bv.partial). */
  versleuteld?: number
  ontbrekend?: number
  /** Texturen in het manifest (voor bv.incomplete: meer dan 25% ontbrekend). */
  texturen?: number
  /** Buitenmeshes volgens de cfg en hoeveel hun o3d missen (bv.incompleteModel: meer dan 25%). */
  meshes?: number
  meshesWeg?: number
}

interface Props {
  relatiefPad: string
  kleurstelling?: string
  /** Voor het label: "3D-weergave van MAN Lion's City 12C". */
  naam?: string
  /** Het heldenbeeld of de foto die main al opzocht (de vraag van het venster): meteen in beeld. */
  foto?: string
  /** De vorm van het icoon als er geen foto en geen 3D is. */
  vorm?: Busvorm
  /** OMSI draait: DPR 1, budget 96 MB, geen heldenbeeld (§9). */
  licht?: boolean
  /** Verborgen, geminimaliseerd, of OMSI zonder focus (§9): context weg, foto plus [Hervatten]. */
  pauze?: boolean
  /** Het draaiplateau van de dealerstand (§6). */
  plateau?: boolean
  onStand?: (s: ViewerStand) => void
  /** Het manifest is binnen: naam, beschrijving en maat voor het zijpaneel. */
  onManifest?: (m: Bus3dManifest) => void
  /** Het eerste plaatje staat (foto, icoon of 3D): het venster mag zichtbaar worden. */
  onGetoond?: (wat: 'foto' | 'icoon' | '3d') => void
  /** [Hervatten] in pauze. */
  onHervat?: () => void
  /** Enter in het beeld: kiezen (§8.1). */
  onKies?: () => void
  /** Voor de proef en het venster: de viewer zelf. */
  onHandvat?: (h: ViewerHandvat) => void
  /** Het beeld begint met focus, zodat de pijltjes meteen werken (§8.1). */
  autoFocus?: boolean
}

/** DPR = min(apparaat, 2), en nooit meer dan 1920x1080 tekenpixels (§5.8, §10). */
function tekenMaat(b: number, h: number, licht: boolean): { b: number; h: number; dpr: number } {
  let dpr = licht ? 1 : Math.min(window.devicePixelRatio || 1, 2)
  const grens = 1920 * 1080
  if (b * h * dpr * dpr > grens) dpr = Math.sqrt(grens / Math.max(1, b * h))
  return { b: Math.max(2, Math.round(b * dpr)), h: Math.max(2, Math.round(h * dpr)), dpr }
}

/** De vorm van een bus, getekend (dezelfde vormen als het busicoon op de tegels). */
function Busicoon({ vorm }: { vorm: Busvorm }): JSX.Element {
  return (
    <svg className="bv-icoon" viewBox="0 0 96 40" aria-hidden="true">
      {vorm === 'geleed' ? (
        <>
          <rect x="2" y="8" width="44" height="22" rx="4" />
          <rect x="48" y="10" width="6" height="18" rx="2" opacity="0.5" />
          <rect x="56" y="8" width="38" height="22" rx="4" />
          <circle cx="14" cy="32" r="4" />
          <circle cx="40" cy="32" r="4" />
          <circle cx="82" cy="32" r="4" />
        </>
      ) : vorm === 'dubbel' ? (
        <>
          <rect x="6" y="2" width="72" height="28" rx="4" />
          <circle cx="20" cy="32" r="4" />
          <circle cx="66" cy="32" r="4" />
        </>
      ) : vorm === 'midi' ? (
        <>
          <rect x="16" y="10" width="52" height="20" rx="4" />
          <circle cx="28" cy="32" r="4" />
          <circle cx="58" cy="32" r="4" />
        </>
      ) : (
        <>
          <rect x="6" y="8" width="78" height="22" rx="4" />
          <circle cx="20" cy="32" r="4" />
          <circle cx="70" cy="32" r="4" />
        </>
      )}
    </svg>
  )
}

export function BusViewer({
  relatiefPad,
  kleurstelling,
  naam,
  foto: fotoVooraf,
  vorm = 'solo',
  licht = false,
  pauze = false,
  plateau = false,
  onStand,
  onManifest,
  onGetoond,
  onHervat,
  onKies,
  onHandvat,
  autoFocus
}: Props): JSX.Element {
  const t = useT()
  const doekRef = useRef<HTMLCanvasElement>(null)
  const kaderRef = useRef<HTMLDivElement>(null)
  const handvatRef = useRef<ViewerHandvat | undefined>(undefined)
  const [stand, zetStand] = useState<ViewerStand>({ fase: 'wacht', klaar: 0, totaal: 0 })
  /** De foto hoort bij één bus: van een andere bus tonen we hem niet. */
  const [foto, zetFoto] = useState<{ pad: string; url: string } | undefined>(
    fotoVooraf ? { pad: relatiefPad, url: fotoVooraf } : undefined
  )
  /** Welke foto er geladen is: een vlag voor 'een foto' bleef staan als de volgende bus een andere foto kreeg. */
  const [geladenFoto, zetGeladenFoto] = useState<string | undefined>()
  const [eersteBeeld, zetEersteBeeld] = useState(false)
  /**
   * Staat er een foto of heldenbeeld, dan neemt het 3D-beeld pas over als het
   * scherp is, na 1,5 s, of zodra je iets doet: anders zag je eerst een wit
   * kleimodel over een mooie foto (beeldbeoordeling F2). Zonder foto meteen.
   */
  const [overnemen, zetOvernemen] = useState(false)
  const overneemKlok = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const wachtOpOvernemen = useCallback((aan: boolean) => {
    if (overneemKlok.current) clearTimeout(overneemKlok.current)
    overneemKlok.current = undefined
    zetOvernemen(false)
    if (aan) overneemKlok.current = setTimeout(() => zetOvernemen(true), 1500)
  }, [])
  useEffect(() => () => {
    if (overneemKlok.current) clearTimeout(overneemKlok.current)
  }, [])
  const huidig = useRef<{ pad: string; kleur?: string; pakket?: string; vraag: number; manifest?: Bus3dManifest; lak?: Bus3dLak }>({
    pad: '',
    vraag: 0
  })
  const standRef = useRef(stand)
  const onStandRef = useRef(onStand)
  onStandRef.current = onStand
  const onManifestRef = useRef(onManifest)
  onManifestRef.current = onManifest
  const onGetoondRef = useRef(onGetoond)
  onGetoondRef.current = onGetoond
  const getoondGemeld = useRef(false)
  const lichtRef = useRef(licht)
  lichtRef.current = licht
  const pauzeRef = useRef(pauze)
  pauzeRef.current = pauze

  const getoond = useCallback((wat: 'foto' | 'icoon' | '3d') => {
    if (getoondGemeld.current) return
    getoondGemeld.current = true
    // Af te lezen voor de proef (probe-bus3d-venster.cjs): wat er als eerste stond, en wanneer.
    // Het voorlopige plaatje van de ingang (venster.tsx) was er misschien al eerder: dat telt.
    if (!document.documentElement.dataset.getoondMs) {
      document.documentElement.dataset.getoond = wat
      document.documentElement.dataset.getoondMs = String(Math.round(performance.now()))
    }
    onGetoondRef.current?.(wat)
  }, [])

  const meld = useCallback((s: ViewerStand) => {
    standRef.current = s
    zetStand(s)
    onStandRef.current?.(s)
  }, [])

  // Aanmelden bij de werker; StrictMode meldt twee keer aan en één keer af: de context blijft één.
  useEffect(() => {
    const doek = doekRef.current!
    const verbinding = Verbinding.get()
    const h: ViewerHandvat = verbinding.meld(doek, {
      opEersteBeeld: () => {
        if (pauzeRef.current) return
        zetEersteBeeld(true)
        wachtOpOvernemen(true)
        getoond('3d')
      },
      opStand: (s) => {
        meld({
          ...standRef.current,
          // Een fout van eerder (context weg, hersteld) geldt niet meer zodra er weer een stand komt (aanvalsverslag F2, punt 4).
          reden: undefined,
          detail: undefined,
          fase: s.fase,
          klaar: s.klaar,
          totaal: s.totaal,
          eersteBeeldMs: s.eersteBeeldMs,
          scherpMs: s.scherpMs,
          meting: s.meting ?? standRef.current.meting,
          mijlpalen: { ...standRef.current.mijlpalen, ...s.mijlpalen }
        })
        // Scherp NA het eerste beeld van deze lading: dan mag het 3D-beeld de foto vervangen
        // (niet op een 'scherp' van vóór een pauze, dat bleef in de stand staan).
        if (s.fase === 'scherp') zetOvernemen(true)
        if (s.meting) window.bus3d?.bus3dMeld(s.meting)
      },
      opFout: (f) => {
        if (f.reden === 'pakket-stuk' && f.pakket) window.bus3d?.bus3dStuk(f.pakket)
        meld({ ...standRef.current, fase: 'fout', reden: f.reden, detail: f.detail })
      },
      opHeld: (hb) => {
        void window.bus3d?.busHeldenbeeld(hb.pakket, hb.kleurstelling, hb.sleutel, hb.webp)
      }
    })
    handvatRef.current = h
    onHandvat?.(h)
    void verbinding.gereed.then((g) => {
      if (!g.webgl) meld({ ...standRef.current, fase: 'fout', reden: 'geen-webgl', detail: g.detail })
    })
    void window.bus3d?.busOmgeving3d().then((o) => verbinding.omgeving(o), () => undefined)
    const kader = kaderRef.current!
    const zetMaat = (): void => {
      const r = kader.getBoundingClientRect()
      const m = tekenMaat(r.width, r.height, lichtRef.current)
      if (doek.width !== m.b || doek.height !== m.h) {
        doek.width = m.b
        doek.height = m.h
      }
      h.maat(m.b, m.h, m.dpr)
    }
    // Meteen de maat, niet pas bij de eerste melding van de ResizeObserver (een beeld later).
    zetMaat()
    const ro = new ResizeObserver(zetMaat)
    ro.observe(kader)
    /*
     * Een andere DPR (het venster naar een ander scherm, G8.3): opnieuw de maat,
     * en daarna luisteren op de NIEUWE DPR. Een vaste vraag op de DPR van het
     * begin vuurde alleen bij de eerste wissel; een tweede (1,25 -> 1,5 zonder
     * andere maat) liet het doek wazig (aanvalsverslag F2, punt 10).
     */
    let dprLuister: MediaQueryList | undefined
    const opDpr = (): void => {
      zetMaat()
      luisterDpr()
    }
    const luisterDpr = (): void => {
      dprLuister?.removeEventListener('change', opDpr)
      dprLuister = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
      dprLuister.addEventListener('change', opDpr)
    }
    luisterDpr()
    return () => {
      ro.disconnect()
      dprLuister?.removeEventListener('change', opDpr)
      h.weg()
      handvatRef.current = undefined
    }
    // Eén keer per mount; onHandvat verandert de aanmelding niet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meld, getoond, wachtOpOvernemen])

  // Een bus laden (nieuw pad), of alleen de lak wisselen (zelfde bus, andere kleurstelling).
  const laad = useCallback(
    async (pad: string, kleur: string | undefined, geforceerd = false): Promise<void> => {
      const brug = window.bus3d
      const h = handvatRef.current
      if (!brug || !h) return
      const cur = huidig.current
      if (!geforceerd && cur.pad === pad && cur.pakket) {
        if (cur.kleur === kleur) return
        cur.kleur = kleur
        const t0 = klok()
        const lak = await brug.busLak3d(cur.pakket, kleur)
        if (huidig.current.kleur !== kleur) return
        if ('reden' in lak) return laad(pad, kleur, true)
        cur.lak = lak as Bus3dLak
        meld({ ...standRef.current, fase: 'texturen', mijlpalen: { antwoord: Math.round(klok() - t0) } })
        h.lak(lak as Bus3dLak, t0)
        return
      }
      const vraag = ++cur.vraag
      const nieuweBus = cur.pad !== pad
      cur.pad = pad
      cur.kleur = kleur
      cur.pakket = undefined
      const t0 = klok()
      if (nieuweBus) {
        zetEersteBeeld(false)
        wachtOpOvernemen(false)
      }
      meld({ fase: 'bouwen', klaar: 0, totaal: 0 })
      const r = kaderRef.current?.getBoundingClientRect()
      void brug
        .busFotoAlsKlaar(pad, kleur, r && r.width / Math.max(1, r.height) >= 1.45 ? 'breed' : 'smal')
        .then((url) => {
          if (huidig.current.vraag !== vraag || !url) return
          zetFoto((oud) => (oud?.url === url ? oud : { pad, url }))
        })
      const antwoord = await brug.busModel3d(pad, kleur)
      if (huidig.current.vraag !== vraag) return
      if ('reden' in antwoord) {
        meld({ fase: 'fout', klaar: 0, totaal: 0, reden: antwoord.reden, detail: antwoord.detail })
        return
      }
      cur.pakket = antwoord.manifest.pakket
      cur.manifest = antwoord.manifest
      cur.lak = antwoord.lak
      onManifestRef.current?.(antwoord.manifest)
      const antwoordMs = Math.round(klok() - t0)
      meld({
        mijlpalen: { antwoord: antwoordMs },
        fase: 'bouwen',
        klaar: 0,
        totaal: 0,
        pakket: antwoord.manifest.pakket,
        bron: antwoord.bron,
        versleuteld: antwoord.manifest.telling.versleuteld,
        ontbrekend: antwoord.manifest.telling.ontbrekend,
        texturen: antwoord.manifest.telling.texturen,
        meshes: antwoord.manifest.telling.meshes,
        meshesWeg: antwoord.manifest.telling.meshesWeg
      })
      // In pauze niet laden: dat gebeurt bij hervatten (de context is dan weg).
      if (pauzeRef.current) return
      h.laad(antwoord.manifest, antwoord.lak, antwoord.bron ?? 'cache', t0, lichtRef.current)
    },
    [meld]
  )

  useEffect(() => {
    void laad(relatiefPad, kleurstelling)
  }, [relatiefPad, kleurstelling, laad])

  // Een nieuwe foto van main (een andere bus in hetzelfde venster).
  useEffect(() => {
    if (fotoVooraf) zetFoto({ pad: relatiefPad, url: fotoVooraf })
  }, [fotoVooraf, relatiefPad])

  // Zonder foto meteen het icoon: dat is dan het eerste plaatje (§0.9).
  useEffect(() => {
    if (!fotoVooraf) getoond('icoon')
    // Alleen bij de eerste mount: daarna telt het al.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // De lichte stand (OMSI begon of stopte): andere DPR en een ander budget.
  const eersteLicht = useRef(true)
  useEffect(() => {
    if (eersteLicht.current) {
      eersteLicht.current = false
      return
    }
    const h = handvatRef.current
    const kader = kaderRef.current
    const doek = doekRef.current
    if (!h || !kader || !doek) return
    const r = kader.getBoundingClientRect()
    const m = tekenMaat(r.width, r.height, licht)
    doek.width = m.b
    doek.height = m.h
    h.maat(m.b, m.h, m.dpr)
    const cur = huidig.current
    if (cur.manifest && !pauzeRef.current) h.laad(cur.manifest, cur.lak, 'cache', klok(), licht)
  }, [licht])

  // Pauze (§9): de context weg en de foto terug; hervatten brengt de context en de bus terug.
  const eerstePauze = useRef(true)
  useEffect(() => {
    const h = handvatRef.current
    if (eerstePauze.current) {
      eerstePauze.current = false
      if (!pauze) return
    }
    if (!h) return
    if (pauze) {
      h.pauze(true, true)
      zetEersteBeeld(false)
      wachtOpOvernemen(false)
      try {
        doekRef.current?.getContext('bitmaprenderer')?.transferFromImageBitmap(null)
      } catch {
        // Al leeg.
      }
      // Inmiddels is er misschien een heldenbeeld: dat liever dan de foto van de tegel.
      const cur = huidig.current
      void window.bus3d?.busFotoAlsKlaar(cur.pad, cur.kleur, 'breed').then((url) => {
        if (url && huidig.current.pad === cur.pad) zetFoto({ pad: cur.pad, url })
      })
    } else {
      h.pauze(false)
      const cur = huidig.current
      // Pauze kwam vóór het manifest: nu pas laden.
      if (cur.manifest && standRef.current.fase === 'bouwen') h.laad(cur.manifest, cur.lak, 'cache', klok(), lichtRef.current)
    }
  }, [pauze])

  // Het draaiplateau (dealerstand), niet in de lichte stand.
  useEffect(() => {
    handvatRef.current?.plateau(plateau && !licht)
  }, [plateau, licht])

  // Voortgang van het bouwen (werker 'bus3d'), en een pakket dat vervangen is (§4.2).
  useEffect(() => {
    const brug = window.bus3d
    if (!brug) return
    const weg1 = brug.opBus3dVoortgang((v) => {
      if (standRef.current.fase !== 'bouwen') return
      // De textuurlijst staat er al terwijl de o3d's nog gelezen worden: alvast ophalen (§4.1).
      if (v.stap === 'lijst' && v.lijst) Verbinding.get().voorhaal(v.lijst.map((t) => ({ id: t.id, bytes: t.bytes })))
      if (v.stap === 'lezen') meld({ ...standRef.current, klaar: v.klaar, totaal: v.totaal })
    })
    const weg2 = brug.opBus3dVervangen((pakket) => {
      if (huidig.current.pakket === pakket) void laad(huidig.current.pad, huidig.current.kleur, true)
    })
    return () => {
      weg1()
      weg2()
    }
  }, [laad, meld])

  useEffect(() => {
    if (autoFocus) doekRef.current?.focus()
  }, [autoFocus])

  // ------------------------------------------------------------ bediening (§6)
  const invoer = (i: Parameters<ViewerHandvat['invoer']>[0]): void => {
    // Wie draait of zoomt, wil het 3D-beeld, ook als het nog niet scherp is.
    zetOvernemen(true)
    handvatRef.current?.invoer(i)
  }
  const aanwijzers = useRef(new Map<number, { x: number; y: number }>())
  const knijp = useRef(0)

  const omlaag = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    e.currentTarget.setPointerCapture(e.pointerId)
    aanwijzers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (aanwijzers.current.size === 2) {
      const [a, b] = [...aanwijzers.current.values()]
      knijp.current = Math.hypot(a.x - b.x, a.y - b.y)
    }
  }
  const beweeg = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const vorig = aanwijzers.current.get(e.pointerId)
    if (!vorig) return
    const nu = { x: e.clientX, y: e.clientY }
    aanwijzers.current.set(e.pointerId, nu)
    if (aanwijzers.current.size === 2) {
      const [a, b] = [...aanwijzers.current.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      if (knijp.current > 0 && d > 0) invoer({ soort: 'zoom', factor: knijp.current / d })
      knijp.current = d
      return
    }
    invoer({ soort: 'sleep', dx: nu.x - vorig.x, dy: nu.y - vorig.y })
  }
  const omhoog = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    aanwijzers.current.delete(e.pointerId)
    if (aanwijzers.current.size < 2) knijp.current = 0
  }

  // Het wiel zoomt altijd boven het beeld (§6); niet passief, anders scrolt de pagina mee.
  useEffect(() => {
    const kader = kaderRef.current!
    const wiel = (e: WheelEvent): void => {
      e.preventDefault()
      invoer({ soort: 'zoom', factor: e.deltaY > 0 ? 1.08 : 1 / 1.08 })
    }
    kader.addEventListener('wheel', wiel, { passive: false })
    return () => kader.removeEventListener('wheel', wiel)
  }, [])

  const onKiesRef = useRef(onKies)
  onKiesRef.current = onKies
  const toets = (e: React.KeyboardEvent): void => {
    if (e.ctrlKey || e.altKey || e.metaKey) return
    const stand = (s: Stand): void => invoer({ soort: 'stand', stand: s })
    const k = e.key
    if (k === 'ArrowLeft') invoer({ soort: 'draai', graden: 15 })
    else if (k === 'ArrowRight') invoer({ soort: 'draai', graden: -15 })
    else if (k === 'ArrowUp') invoer({ soort: 'kantel', graden: 5 })
    else if (k === 'ArrowDown') invoer({ soort: 'kantel', graden: -5 })
    else if (k === '+' || k === '=') invoer({ soort: 'zoom', factor: 1 / 1.08 })
    else if (k === '-' || k === '_') invoer({ soort: 'zoom', factor: 1.08 })
    else if (k === '1') stand('voor')
    else if (k === '2') stand('zijkant')
    else if (k === '3') stand('achter')
    else if (k === '4') stand('schuin')
    else if (k === '0' || k === 'Home') stand('terug')
    else if (k === 'Enter' && onKiesRef.current) onKiesRef.current()
    else return
    e.preventDefault()
  }

  const fout = stand.fase === 'fout'
  const regel = ((): string | undefined => {
    if (fout) {
      if (stand.reden === 'geen-webgl') return t('bv.noWebgl')
      if (stand.reden === 'context-weg') return t('bv.lost')
      if (stand.reden === 'versleuteld') return t('bv.encrypted', { sleutel: stand.detail?.match(/\(([\d, ]+)\)/)?.[1] ?? '?' })
      if (stand.reden === 'geen-model') return t('bv.noModel')
      if (stand.reden === 'te-zwaar') return t('bv.tooHeavy')
      return t('bv.failed')
    }
    if (pauze) return t('bv.paused')
    if (stand.fase === 'bouwen' && stand.totaal > 0) return t('bv.loading', { klaar: stand.klaar, totaal: stand.totaal })
    if (stand.fase === 'texturen' && stand.totaal > 0) return t('bv.loadingTextures', { klaar: stand.klaar, totaal: stand.totaal })
    return undefined
  })()
  const labels: string[] = []
  if (!fout && stand.versleuteld) labels.push(t('bv.partial', { n: stand.versleuteld }))
  if (!fout && stand.ontbrekend && stand.texturen && stand.ontbrekend / (stand.ontbrekend + stand.texturen) > 0.25) {
    labels.push(t('bv.incomplete', { n: stand.ontbrekend }))
  }
  // Meer dan een kwart van de buitenmeshes zonder o3d op deze pc: zeggen waarom de bus half leeg is (proefdraaier F2).
  if (!fout && stand.meshesWeg && stand.meshes && stand.meshesWeg / stand.meshes > 0.25) {
    labels.push(t('bv.incompleteModel', { n: stand.meshesWeg, totaal: stand.meshes }))
  }
  if (!fout && licht) labels.push(t('bv.omsiRunning'))

  const fotoHier = foto && foto.pad === relatiefPad ? foto.url : undefined
  const fotoGeladen = Boolean(fotoHier) && geladenFoto === fotoHier
  const fotoStaat = Boolean(fotoHier && fotoGeladen)
  const toon3d = eersteBeeld && !pauze && !fout && (!fotoStaat || overnemen)
  const toonIcoon = !toon3d && (!fotoHier || !fotoGeladen)
  const herstelbaar = fout && stand.reden !== 'geen-webgl' && stand.reden !== 'versleuteld' && stand.reden !== 'geen-model'

  return (
    <div className="bv-kader" ref={kaderRef} data-fase={pauze ? 'pauze' : stand.fase} data-reden={stand.reden}>
      {toonIcoon ? (
        <div className="bv-icoonvlak" aria-hidden="true">
          <Busicoon vorm={vorm} />
        </div>
      ) : null}
      {fotoHier && !toon3d ? (
        <img
          className="bv-foto"
          src={fotoHier}
          alt=""
          draggable={false}
          onLoad={() => {
            zetGeladenFoto(fotoHier)
            document.documentElement.dataset.fotoMs = String(Math.round(performance.now()))
            getoond('foto')
          }}
          onError={() => {
            zetGeladenFoto(undefined)
            getoond('icoon')
          }}
        />
      ) : null}
      <canvas
        ref={doekRef}
        className={`bv-doek${toon3d ? ' bv-doek-zichtbaar' : ''}`}
        tabIndex={0}
        role="img"
        aria-label={t('bv.viewerLabel', { naam: naam ?? relatiefPad })}
        onPointerDown={omlaag}
        onPointerMove={beweeg}
        onPointerUp={omhoog}
        onPointerCancel={omhoog}
        onDoubleClick={() => invoer({ soort: 'stand', stand: 'terug' })}
        onKeyDown={toets}
      />
      {regel || labels.length ? (
        <div className={`bv-regel${fout || pauze ? ' bv-regel-fout' : ''}`} role="status">
          {regel ? <span>{regel}</span> : null}
          {labels.map((l) => (
            <span key={l} className="bv-label">
              {l}
            </span>
          ))}
          {herstelbaar ? (
            <button type="button" className="bv-knop" onClick={() => void laad(relatiefPad, kleurstelling, true)}>
              {t('bv.retry')}
            </button>
          ) : null}
          {pauze && !fout ? (
            <button type="button" className="bv-knop" onClick={() => onHervat?.()}>
              {t('bv.resume')}
            </button>
          ) : null}
        </div>
      ) : null}
      {!fout && !pauze ? (
        <div className="bv-knoppen">
          <button type="button" className="bv-knop" onClick={() => invoer({ soort: 'stand', stand: 'voor' })}>
            {t('bv.viewFront')}
          </button>
          <button type="button" className="bv-knop" onClick={() => invoer({ soort: 'stand', stand: 'zijkant' })}>
            {t('bv.viewSide')}
          </button>
          <button type="button" className="bv-knop" onClick={() => invoer({ soort: 'stand', stand: 'achter' })}>
            {t('bv.viewRear')}
          </button>
          <button type="button" className="bv-knop" onClick={() => invoer({ soort: 'stand', stand: 'schuin' })}>
            {t('bv.viewAngle')}
          </button>
          <button type="button" className="bv-knop" onClick={() => invoer({ soort: 'stand', stand: 'terug' })}>
            {t('bv.viewReset')}
          </button>
          <button type="button" className="bv-knop" aria-label={t('bv.zoomIn')} onClick={() => invoer({ soort: 'zoom', factor: 1 / 1.08 })}>
            +
          </button>
          <button type="button" className="bv-knop" aria-label={t('bv.zoomOut')} onClick={() => invoer({ soort: 'zoom', factor: 1.08 })}>
            −
          </button>
        </div>
      ) : null}
    </div>
  )
}
