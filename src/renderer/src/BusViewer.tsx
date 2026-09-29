import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import type { Bus3dBrug, Bus3dLak, Bus3dMeting, Bus3dReden } from '../../shared/bus3d'
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
 * heldenbeeld (of later de foto v4) eronder; komt er geen 3D (geen WebGL2, een
 * versleuteld model, een fout), dan blijft dat plaatje staan met de uitleg.
 */

declare global {
  interface Window {
    bus3d?: Bus3dBrug
  }
}

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
}

interface Props {
  relatiefPad: string
  kleurstelling?: string
  /** Voor het label: "3D-weergave van MAN Lion's City 12C". */
  naam?: string
  /** OMSI draait: DPR 1, budget 96 MB, geen heldenbeeld (§9). */
  licht?: boolean
  onStand?: (s: ViewerStand) => void
  /** Voor de proef en het venster: de viewer zelf. */
  onHandvat?: (h: ViewerHandvat) => void
}

/** DPR = min(apparaat, 2), en nooit meer dan 1920x1080 tekenpixels (§5.8, §10). */
function tekenMaat(b: number, h: number, licht: boolean): { b: number; h: number; dpr: number } {
  let dpr = licht ? 1 : Math.min(window.devicePixelRatio || 1, 2)
  const grens = 1920 * 1080
  if (b * h * dpr * dpr > grens) dpr = Math.sqrt(grens / Math.max(1, b * h))
  return { b: Math.max(2, Math.round(b * dpr)), h: Math.max(2, Math.round(h * dpr)), dpr }
}

export function BusViewer({ relatiefPad, kleurstelling, naam, licht = false, onStand, onHandvat }: Props): JSX.Element {
  const t = useT()
  const doekRef = useRef<HTMLCanvasElement>(null)
  const kaderRef = useRef<HTMLDivElement>(null)
  const handvatRef = useRef<ViewerHandvat | undefined>(undefined)
  const [stand, zetStand] = useState<ViewerStand>({ fase: 'wacht', klaar: 0, totaal: 0 })
  const [foto, zetFoto] = useState<string>()
  const [eersteBeeld, zetEersteBeeld] = useState(false)
  const huidig = useRef<{ pad: string; kleur?: string; pakket?: string; vraag: number }>({ pad: '', vraag: 0 })
  const standRef = useRef(stand)
  const onStandRef = useRef(onStand)
  onStandRef.current = onStand

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
      opEersteBeeld: () => zetEersteBeeld(true),
      opStand: (s) => {
        meld({
          ...standRef.current,
          fase: s.fase,
          klaar: s.klaar,
          totaal: s.totaal,
          eersteBeeldMs: s.eersteBeeldMs,
          scherpMs: s.scherpMs,
          meting: s.meting ?? standRef.current.meting,
          mijlpalen: { ...standRef.current.mijlpalen, ...s.mijlpalen }
        })
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
    const ro = new ResizeObserver(() => {
      const r = kader.getBoundingClientRect()
      const m = tekenMaat(r.width, r.height, licht)
      if (doek.width !== m.b || doek.height !== m.h) {
        doek.width = m.b
        doek.height = m.h
      }
      h.maat(m.b, m.h, m.dpr)
    })
    ro.observe(kader)
    return () => {
      ro.disconnect()
      h.weg()
      handvatRef.current = undefined
    }
    // Eén keer per mount; licht en onHandvat veranderen de aanmelding niet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meld])

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
        const lak = await brug.busLak3d(cur.pakket, kleur)
        if ('reden' in lak) return laad(pad, kleur, true)
        h.lak(lak as Bus3dLak)
        return
      }
      const vraag = ++cur.vraag
      cur.pad = pad
      cur.kleur = kleur
      cur.pakket = undefined
      const t0 = klok()
      zetEersteBeeld(false)
      meld({ fase: 'bouwen', klaar: 0, totaal: 0 })
      const r = kaderRef.current?.getBoundingClientRect()
      void brug
        .busFotoAlsKlaar(pad, kleur, r && r.width / Math.max(1, r.height) >= 1.45 ? 'breed' : 'smal')
        .then((url) => {
          if (huidig.current.vraag === vraag) zetFoto(url)
        })
      const antwoord = await brug.busModel3d(pad, kleur)
      if (huidig.current.vraag !== vraag) return
      if ('reden' in antwoord) {
        meld({ fase: 'fout', klaar: 0, totaal: 0, reden: antwoord.reden, detail: antwoord.detail })
        return
      }
      cur.pakket = antwoord.manifest.pakket
      const antwoordMs = Math.round(klok() - t0)
      meld({
        mijlpalen: { antwoord: antwoordMs },
        fase: 'bouwen',
        klaar: 0,
        totaal: 0,
        pakket: antwoord.manifest.pakket,
        bron: antwoord.bron,
        versleuteld: antwoord.manifest.telling.versleuteld,
        ontbrekend: antwoord.manifest.telling.ontbrekend
      })
      h.laad(antwoord.manifest, antwoord.lak, antwoord.bron ?? 'cache', t0, licht)
    },
    [licht, meld]
  )

  useEffect(() => {
    void laad(relatiefPad, kleurstelling)
  }, [relatiefPad, kleurstelling, laad])

  // Voortgang van het bouwen (werker 'bus3d'), en een pakket dat vervangen is (§4.2).
  useEffect(() => {
    const brug = window.bus3d
    if (!brug) return
    const weg1 = brug.opBus3dVoortgang((v) => {
      if (standRef.current.fase !== 'bouwen' || v.stap !== 'lezen') return
      meld({ ...standRef.current, klaar: v.klaar, totaal: v.totaal })
    })
    const weg2 = brug.opBus3dVervangen((pakket) => {
      if (huidig.current.pakket === pakket) void laad(huidig.current.pad, huidig.current.kleur, true)
    })
    return () => {
      weg1()
      weg2()
    }
  }, [laad, meld])

  // ------------------------------------------------------------ bediening (§6)
  const invoer = (i: Parameters<ViewerHandvat['invoer']>[0]): void => handvatRef.current?.invoer(i)
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
    const doek = doekRef.current!
    const wiel = (e: WheelEvent): void => {
      e.preventDefault()
      invoer({ soort: 'zoom', factor: e.deltaY > 0 ? 1.08 : 1 / 1.08 })
    }
    doek.addEventListener('wheel', wiel, { passive: false })
    return () => doek.removeEventListener('wheel', wiel)
  }, [])

  const toets = (e: React.KeyboardEvent): void => {
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
    if (stand.fase === 'bouwen' && stand.totaal > 0) return t('bv.loading', { klaar: stand.klaar, totaal: stand.totaal })
    if (stand.fase === 'texturen' && stand.totaal > 0) return t('bv.loadingTextures', { klaar: stand.klaar, totaal: stand.totaal })
    return undefined
  })()
  const labels: string[] = []
  if (!fout && stand.versleuteld) labels.push(t('bv.partial', { n: stand.versleuteld }))
  if (!fout && licht) labels.push(t('bv.omsiRunning'))

  return (
    <div className="bv-kader" ref={kaderRef}>
      {foto && !eersteBeeld ? <img className="bv-foto" src={foto} alt="" draggable={false} /> : null}
      <canvas
        ref={doekRef}
        className={`bv-doek${eersteBeeld ? ' bv-doek-zichtbaar' : ''}`}
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
        <div className={`bv-regel${fout ? ' bv-regel-fout' : ''}`} role="status">
          {regel ? <span>{regel}</span> : null}
          {labels.map((l) => (
            <span key={l} className="bv-label">
              {l}
            </span>
          ))}
          {fout && stand.reden !== 'geen-webgl' && stand.reden !== 'versleuteld' && stand.reden !== 'geen-model' ? (
            <button type="button" className="bv-knop" onClick={() => void laad(relatiefPad, kleurstelling, true)}>
              {t('bv.retry')}
            </button>
          ) : null}
        </div>
      ) : null}
      {!fout ? (
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
