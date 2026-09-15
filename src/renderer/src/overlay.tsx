import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type JSX,
  type PointerEvent
} from 'react'
import { createRoot } from 'react-dom/client'
import type { MapGeometry } from '../../core/geo'
import type { IbisPlan } from '../../core/ibis'
import type { LiveStatus } from '../../core/live'
import type { Duty, DutyLeg } from '../../core/types'
import type { CareerApi } from '../../shared/api'
import { formatTime } from '../../shared/format'
import { punctuality } from '../../shared/status'
import { DEFAULT_LANGUAGE, loose, t, type Language } from '../../shared/i18n'
import {
  OPACITY_MIN,
  OVERLAY_RATES,
  PANELS,
  SCALE_MAX,
  SCALE_MIN,
  SCALE_STEP,
  nextDetail,
  type DetailLevel,
  type OverlayLayout,
  type OverlayRate,
  type PanelId,
  type PanelInfo
} from '../../shared/overlay'
import { RouteMap } from './RouteMap'
import '@fontsource/manrope/400.css'
import '@fontsource/manrope/500.css'
import '@fontsource/manrope/600.css'
import '@fontsource/manrope/700.css'
import '@fontsource/manrope/800.css'
import './overlay.css'

/**
 * Hoe groot het scherm is, in dezelfde punten als de indeling.
 *
 * Niet `window.innerWidth`: buiten de sleepstand is het venster niet groter dan
 * zijn inhoud, en dan zou een element zichzelf naar de linkerbovenhoek klemmen.
 * Het scherm blijft even groot, wat het venster ook doet.
 */
function screenSize(): { w: number; h: number } {
  return { w: window.screen.width, h: window.screen.height }
}

/** Een vak in schermpunten: waar iets staat en hoe groot het is. */
interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** Het kleinste vak waar alles in past, met wat lucht voor de schaduwranden. */
function union(parts: Box[]): Box | undefined {
  if (parts.length === 0) return undefined
  const LUCHT = 12
  const minX = Math.min(...parts.map((part) => part.x))
  const minY = Math.min(...parts.map((part) => part.y))
  const maxX = Math.max(...parts.map((part) => part.x + part.w))
  const maxY = Math.max(...parts.map((part) => part.y + part.h))
  return {
    x: Math.max(0, Math.floor(minX - LUCHT)),
    y: Math.max(0, Math.floor(minY - LUCHT)),
    w: Math.ceil(maxX - minX) + LUCHT * 2,
    h: Math.ceil(maxY - minY) + LUCHT * 2
  }
}

/** Een punt verschil is geen verschil; anders blijft het venster trillen. */
function same(a: Box | undefined, b: Box | undefined): boolean {
  if (!a || !b) return a === b
  return (
    Math.abs(a.x - b.x) < 2 &&
    Math.abs(a.y - b.y) < 2 &&
    Math.abs(a.w - b.w) < 2 &&
    Math.abs(a.h - b.h) < 2
  )
}

interface Frame {
  status?: LiveStatus
  duty?: Duty
  /** Lijn en routes die in de IBIS moeten; de overlay toont ze tot ze erin staan. */
  ibis?: IbisPlan
  /** De bus op de kaart van de dienst, uit het geheugen van OMSI. */
  vehicle?: { x: number; y: number; heading: number; headingFromMotion: boolean }
  /** Draait OMSI met onze plugin? */
  connected: boolean
  /** In de bewerkstand neemt de overlay muisklikken aan. */
  editing: boolean
}

declare global {
  interface Window {
    overlay: {
      onFrame(handler: (frame: Frame) => void): void
      /** De sneltoets klapt het paneel een stand verder. */
      onCycle(handler: () => void): void
    }
    career: CareerApi
  }
}

/**
 * Dezelfde inhoud, hetzelfde voorwerp.
 *
 * Elk beeld komt door de brug als een verse kopie. Voor React is dat elke tel
 * een andere dienst, en dan rekent de kaart alles opnieuw uit: alle haltes, alle
 * borden, alle lijnen, tien keer per seconde, terwijl er niets veranderd is. Dat
 * werk ging ten koste van het spel eronder. Zolang de sleutel gelijk blijft
 * houden we de eerste kopie vast, en laat de kaart zijn rekenwerk staan.
 */
function useStable<T>(value: T | undefined, key: string): T | undefined {
  const held = useRef<{ key: string; value: T } | undefined>(undefined)
  if (value === undefined) {
    held.current = undefined
    return undefined
  }
  if (held.current?.key !== key) held.current = { key, value }
  return held.current.value
}

/** Waaraan je een dienst herkent: welke ritten, in welke volgorde. */
function dutyKeyOf(duty: Duty | undefined): string {
  if (!duty) return ''
  return `${duty.mapFolder}|${duty.legs.map((leg) => `${leg.tripFile}@${leg.departure}`).join(';')}`
}

function Overlay(): JSX.Element | null {
  const [frame, setFrame] = useState<Frame>({ connected: false, editing: false })
  const [layout, setLayout] = useState<OverlayLayout>()
  /*
   * Welke rit de chauffeur zelf heeft afgemeld met "IBIS ingevoerd". Per rit,
   * want elke rit heeft zijn eigen route: bij de volgende hoort de vraag opnieuw
   * gesteld te worden. Deze haak staat hier en niet verderop: onder de vroege
   * return zou React hem bij het eerste beeld overslaan en daarna verwachten.
   */
  const [ibisReady, setIbisReady] = useState<string>()
  const [geometry, setGeometry] = useState<MapGeometry>()
  const [language, setLanguage] = useState<Language>(DEFAULT_LANGUAGE)
  /** Hoe vaak de overlay wordt bijgewerkt; in de sleepbalk te kiezen. */
  const [rate, setRate] = useState<OverlayRate>('rustig')
  /** De elementen zelf, om hun hoogte te kunnen meten. */
  const panelRefs = useRef<Partial<Record<PanelId, HTMLElement | null>>>({})
  /** Het vak waar ze samen in passen; het venster wordt precies zo groot. */
  const [box, setBox] = useState<Box>()

  const { status, editing } = frame
  /*
   * De dienst en de codes veranderen zelden; ze komen alleen elke tel opnieuw
   * door de brug. Vasthouden scheelt de kaart een hoop nutteloos rekenwerk.
   */
  const duty = useStable(frame.duty, dutyKeyOf(frame.duty))
  const ibis = useStable(frame.ibis, frame.ibis ? `${frame.ibis.line}|${frame.ibis.tour}` : '')

  useEffect(() => {
    window.overlay.onFrame(setFrame)
    void window.career.overlayLayout().then(setLayout)
    void window.career.settings().then((settings) => {
      setLanguage(settings.language)
      setRate(settings.overlayRate)
    })
  }, [])

  useEffect(() => {
    if (!duty?.mapFolder) return
    let current = true
    void window.career.geometry(duty.mapFolder).then((found) => {
      if (current) setGeometry(found)
    })
    return () => {
      current = false
    }
  }, [duty?.mapFolder])

  // Slepen levert een stroom wijzigingen op; pas als de muis stilligt naar schijf.
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const store = useCallback((next: OverlayLayout) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => void window.career.saveOverlayLayout(next), 400)
    return next
  }, [])

  const move = useCallback(
    (id: PanelId, patch: Partial<OverlayLayout['dienst']>) => {
      setLayout((old) => (old ? store({ ...old, [id]: { ...old[id], ...patch } }) : old))
    },
    [store]
  )

  const cycle = useCallback(() => {
    setLayout((old) => (old ? store({ ...old, detail: nextDetail(old.detail) }) : old))
  }, [store])

  useEffect(() => window.overlay.onCycle(cycle), [cycle])

  /*
   * De kilometerstand op het moment dat de IBIS een halte verder springt. Wat de
   * bus daarna rijdt, legt hij af over de route vanaf die halte; zo rijdt de kaart
   * mee zonder dat OMSI een positie hoeft door te geven.
   */
  const stopOdometer = useRef<{ key: string; km: number }>(undefined)
  const passedNow = walkedStops(status)
  const stopKey = status && passedNow !== undefined ? `${status.legIndex}|${passedNow}` : ''
  if (status && stopKey && stopOdometer.current?.key !== stopKey) {
    stopOdometer.current = { key: stopKey, km: status.odometerKm }
  }

  /*
   * Buiten de bewerkstand laat het venster muisklikken door naar het spel. Dat
   * moet ook: een venster dat klikken opvangt, vangt ze overal op. Alleen waar
   * echt een knop zit vragen we de muis even op, zodat het uitklappen werkt
   * zonder dat OMSI de aandacht kwijtraakt.
   */
  useEffect(() => {
    if (editing) return
    let over = false
    const onMove = (event: MouseEvent): void => {
      const hit = Boolean((event.target as Element | null)?.closest?.('[data-hit]'))
      if (hit === over) return
      over = hit
      void window.career.overlayHit(hit)
    }
    window.addEventListener('mousemove', onMove)
    return () => {
      window.removeEventListener('mousemove', onMove)
      if (over) void window.career.overlayHit(false)
    }
  }, [editing])

  /*
   * Hoe groot moet het venster zijn?
   *
   * Het venster is doorzichtig en ligt over OMSI heen; elke punt die het beslaat
   * moet Windows bij elk spelbeeld opnieuw over het spel heen mengen, ook de
   * lege hoeken. Daarom meten we het vak waar de elementen in staan en geven we
   * dat door -- het venster wordt niet groter dan zijn inhoud.
   *
   * Meten gaat op de eigen maat van de elementen (breedte uit de indeling,
   * hoogte uit de inhoud), niet op hun plek in beeld: die verschuift mee met het
   * venster, en dan zou de ene meting de volgende uitlokken.
   */
  useLayoutEffect(() => {
    if (!layout) return
    const meet = (): void => {
      const delen: Box[] = []
      for (const info of PANELS) {
        const state = layout[info.id]
        const element = panelRefs.current[info.id]
        if (!state.visible || !element) continue
        delen.push({
          x: state.x,
          y: state.y,
          w: element.offsetWidth * state.scale,
          h: element.offsetHeight * state.scale
        })
      }
      setBox((old) => {
        const next = union(delen)
        return same(old, next) ? old : next
      })

      /*
       * En wat er al buiten beeld stond, halen we terug. De overlay gebruikte
       * eerst het werkgebied in plaats van het hele scherm; een element dat
       * daardoor half over de rand hing, hoort weer helemaal zichtbaar te zijn.
       */
      const room = screenSize()
      for (const info of PANELS) {
        const state = layout[info.id]
        const element = panelRefs.current[info.id]
        if (!state.visible || !element) continue
        const x = clamp(state.x, 0, Math.max(0, room.w - element.offsetWidth * state.scale))
        const y = clamp(state.y, 0, Math.max(0, room.h - element.offsetHeight * state.scale))
        if (Math.abs(x - state.x) > 1 || Math.abs(y - state.y) > 1) move(info.id, { x, y })
      }
    }
    meet()

    // De inhoud groeit en krimpt vanzelf: een waarschuwing erbij, een stand
    // verder. Een waarnemer hoort dat, een lijst met afhankelijkheden niet.
    const watcher = new ResizeObserver(meet)
    for (const info of PANELS) {
      const element = panelRefs.current[info.id]
      if (element) watcher.observe(element)
    }
    return () => watcher.disconnect()
  }, [layout])

  /*
   * In de bewerkstand beslaat het venster het hele scherm, anders kun je een
   * element nergens heen slepen. Daarbuiten krimpt het naar zijn inhoud.
   */
  const boxKey = box ? `${box.x}|${box.y}|${box.w}|${box.h}` : ''
  useEffect(() => {
    void window.career.overlayBounds(editing ? undefined : box)
  }, [boxKey, editing])

  if (!layout) return null

  const leg = status?.leg
  const passed = passedNow
  /*
   * Kan de app in OMSI kijken, dan telt wat daar in het dienstregelingsmenu is
   * gekozen: pas dan is duidelijk welke rit gereden wordt. Anders valt hij terug
   * op de IBIS, die zich vult zodra lijn en route zijn ingetoetst.
   */
  const readable = Boolean(status?.omsiReadable)
  const scheduled = Boolean(status?.schedule?.matchesDuty)
  const ibisLoaded = readable ? scheduled : Boolean(status?.reportsStops) && passed !== undefined
  /*
   * Een bus zonder IBIS meldt nooit een halte; die chauffeur heeft niets aan
   * "toets de route in". Hij krijgt de vraag om zijn dienst in OMSI te kiezen,
   * want daar komt het antwoord dan vandaan.
   */
  const ibisCapable = status ? status.offersStops : true

  /*
   * De rit waar de instructies over gaan. Dat rekent `describeLive` uit: wat in
   * OMSI gekozen is gaat voor, en anders de eerste rit die nog niet is
   * aangekomen. Hier stond diezelfde som nog eens; twee plekken met dezelfde
   * regel lopen uit elkaar zodra er een verandert.
   */
  const upcomingIndex = status?.legIndex ?? 0
  const upcoming = duty?.legs[upcomingIndex]
  /*
   * Elke rit zijn eigen afmelding. De sleutel bevat het ritbestand, zodat een
   * dienst die dezelfde rit later nog eens rijdt opnieuw om de IBIS vraagt.
   */
  const tripKey = upcoming ? `${upcomingIndex}|${upcoming.tripFile}` : ''
  /** De rit loopt pas als de chauffeur de IBIS heeft afgemeld. */
  const started = ibisLoaded && (!ibisCapable || ibisReady === tripKey)
  // Alleen schatten waar de bus is als OMSI zijn plek niet laat lezen.
  const bus =
    !frame.vehicle && status && ibisLoaded && passed !== undefined && stopOdometer.current?.key === stopKey
      ? {
          legIndex: status.legIndex,
          nextStop: passed,
          metresSinceStop: Math.max(0, (status.odometerKm - stopOdometer.current.km) * 1000)
        }
      : undefined

  /*
   * De elementen staan op hun plek op het scherm, maar het venster begint niet
   * meer linksboven: het ligt om de inhoud heen. Dus schuiven we alles op met de
   * hoek van dat vak, en blijft alles staan waar de chauffeur het heeft neergezet.
   */
  const origin = editing || !box ? { x: 0, y: 0 } : box

  return (
    <div
      className={editing ? 'stage editing' : 'stage'}
      style={origin.x || origin.y ? { transform: `translate(${-origin.x}px, ${-origin.y}px)` } : undefined}
    >
      {layout.dienst.visible && (
        <Panel
          info={PANELS[0]}
          title={t(language, 'ovl.panelDuty')}
          state={layout.dienst}
          editing={editing}
          language={language}
          innerRef={(element) => {
            panelRefs.current.dienst = element
          }}
          onChange={(patch) => move('dienst', patch)}
        >
          {/*
            Het scherm vult zich pas als het spel zegt dat de dienst loopt: de
            dienstregeling gekozen in OMSI, of anders een IBIS die haltes meldt.
            Tot die tijd staat er wat er te doen valt. Een dienst die al ingevuld
            lijkt terwijl OMSI nog niets weet, geeft cijfers die nergens op slaan
            -- de bus stond gisteren nog stil en de klok loopt gewoon door.
          */}
          {duty && !ibisLoaded ? (
            ibisCapable && !readable ? (
              <IbisPanel duty={duty} ibis={ibis} status={status} language={language} />
            ) : (
              <SelectPanel
                duty={duty}
                ibis={ibis}
                leg={upcoming}
                legIndex={upcomingIndex}
                status={status}
                language={language}
              />
            )
          ) : duty && ibisCapable && ibisReady !== tripKey ? (
            <IbisStep
              leg={upcoming}
              ibis={ibis}
              legIndex={upcomingIndex}
              language={language}
              onDone={() => setIbisReady(tripKey)}
            />
          ) : (
            <DutyPanel frame={frame} detail={layout.detail} language={language} onCycle={cycle} />
          )}
        </Panel>
      )}

      {layout.navigatie.visible && (
        <Panel
          info={PANELS[1]}
          title={t(language, 'ovl.panelNav')}
          state={layout.navigatie}
          editing={editing}
          language={language}
          innerRef={(element) => {
            panelRefs.current.navigatie = element
          }}
          onChange={(patch) => move('navigatie', patch)}
        >
          {duty && geometry ? (
            <div className="nav-wrap">
              <NavBar status={status} leg={leg} passed={passed} language={language} />
              <RouteMap
              duty={duty}
              geometry={geometry}
              nextStopId={leg && passed !== undefined ? leg.stopIds[Math.min(passed, leg.stopIds.length - 1)] : undefined}
              activeLeg={status?.legIndex}
              pixelScale={layout.navigatie.scale}
              routeMode={ibisLoaded && started ? 'active' : 'none'}
              bus={bus}
              vehicle={frame.vehicle && status ? { ...frame.vehicle, speedKmh: status.speedKmh } : undefined}
              // Nog niets gekozen en geen bus te zien: de eerste halte van de rit in beeld.
              focusStopId={started || frame.vehicle ? undefined : upcoming?.stopIds[0]}
              texts={{
                /*
                  Waar de kaart op wacht verschilt per stap: eerst de dienst in
                  OMSI, daarna de IBIS. "Kies je dienst" blijven zeggen terwijl
                  die al gekozen is, stuurt de chauffeur het verkeerde menu in.
                */
                waiting: t(
                  language,
                  ibisLoaded ? 'ovl.mapIbis' : readable ? 'ovl.mapSelect' : 'ovl.mapWaiting'
                ),
                busNote: t(language, 'ovl.busHere'),
                centre: t(language, 'ovl.centre')
              }}
                variant="panel"
              />
              <NavFoot leg={leg} passed={passed} language={language} />
            </div>
          ) : (
            <div className="empty">{t(language, 'ovl.mapLoading')}</div>
          )}
        </Panel>
      )}

      {editing && (
        <EditBar
          layout={layout}
          language={language}
          rate={rate}
          onRate={(next) => {
            setRate(next)
            void window.career.saveSettings({ overlayRate: next })
          }}
          onShow={(id) => move(id, { visible: true })}
          onReset={() => void window.career.resetOverlayLayout().then(setLayout)}
        />
      )}
    </div>
  )
}

/**
 * De manoeuvrebalk boven de kaart.
 *
 * Wat een chauffeur op dat moment wil weten, in de volgorde waarin hij het wil
 * weten: hoeveel meter nog, naar welke halte, en hoe laat hij daar hoort te
 * zijn. Die tijd draagt de kleur van het verschil met de dienstregeling -- de
 * enige kleur op dit paneel die iets betekent.
 *
 * De afstand komt uit het geheugen van OMSI. Laat het spel zich niet lezen, dan
 * staat er geen meterstand; een verzonnen getal is erger dan geen getal.
 */
function NavBar({
  status,
  leg,
  passed,
  language
}: {
  status?: LiveStatus
  leg?: DutyLeg
  passed?: number
  language: Language
}): JSX.Element | null {
  if (!status || !leg || passed === undefined) return null
  const at = Math.min(passed, leg.stops.length - 1)
  const naam = leg.stops[at]
  if (!naam) return null

  const meters = status.metresToStop
  const afstand =
    meters === undefined
      ? undefined
      : meters >= 1000
        ? `${(meters / 1000).toFixed(1).replace('.', ',')} km`
        : `${meters} m`

  const stand = punctuality(status.deltaSeconds)
  const klasse = stand === 'laat' ? 'late' : stand === 'vroeg' ? 'early' : 'ontime'
  const wanneer = leg.stopTimes[at]

  return (
    <div className="navbar">
      <svg className="navbar-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 21V9" />
        <path d="M12 9c0-2.6 2.1-4.7 4.7-4.7H19" />
        <path d="M16.5 1.6 19.3 4.4 16.5 7.2" />
      </svg>
      <div className="navbar-what">
        {afstand && <b>{afstand}</b>}
        <span>{naam}</span>
      </div>
      <div className="navbar-when">
        {wanneer !== undefined && <b className={klasse}>{formatTime(wanneer)}</b>}
        <span>
          {t(language, 'ovl.stopOf', { at: at + 1, total: leg.stops.length })}
        </span>
      </div>
    </div>
  )
}

/** En wat er daarna komt; één regel, want verder kijkt niemand tijdens het rijden. */
function NavFoot({
  leg,
  passed,
  language
}: {
  leg?: DutyLeg
  passed?: number
  language: Language
}): JSX.Element | null {
  if (!leg || passed === undefined) return null
  const next = Math.min(passed + 1, leg.stops.length - 1)
  if (next <= passed || !leg.stops[next]) return null
  return (
    <div className="navfoot">
      <span className="navfoot-dot" />
      <span className="navfoot-name">
        {t(language, 'ovl.thenStop', { stop: leg.stops[next] })}
      </span>
      <span className="navfoot-time">{formatTime(leg.stopTimes[next] ?? leg.arrival)}</span>
    </div>
  )
}

/** Een verplaatsbaar element. Slepen en verschalen kan in de bewerkstand. */
function Panel({
  info,
  title,
  state,
  editing,
  language,
  innerRef,
  onChange,
  children
}: {
  info: PanelInfo
  title: string
  state: OverlayLayout['dienst']
  editing: boolean
  language: Language
  /** Het element zelf, zodat de overlay kan meten hoe hoog het geworden is. */
  innerRef?(element: HTMLElement | null): void
  onChange(patch: Partial<OverlayLayout['dienst']>): void
  children: JSX.Element | null
}): JSX.Element {
  const drag = useRef<{ x: number; y: number; ox: number; oy: number }>(undefined)
  const size = useRef<{ x: number; y: number; w: number; h: number }>(undefined)
  /** Het element zelf: de overlay meet er de hoogte aan, het slepen de grens. */
  const self = useRef<HTMLElement | null>(null)
  const hold = (element: HTMLElement | null): void => {
    self.current = element
    innerRef?.(element)
  }

  const startDrag = (event: PointerEvent<HTMLElement>): void => {
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { x: event.clientX, y: event.clientY, ox: state.x, oy: state.y }
  }

  const startSize = (event: PointerEvent<HTMLElement>): void => {
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    size.current = { x: event.clientX, y: event.clientY, w: state.w, h: state.h }
  }

  /** Een stap groter of kleiner, inhoud en al. */
  const rescale = (step: number): void =>
    onChange({
      scale: Math.round(Math.min(SCALE_MAX, Math.max(SCALE_MIN, state.scale + step)) * 100) / 100
    })

  const onMove = (event: PointerEvent<HTMLElement>): void => {
    if (drag.current) {
      const { x, y, ox, oy } = drag.current
      /*
       * Helemaal in beeld blijven. Op zijn plek houden gaat over wat je ziet,
       * dus over de vergrote maat -- en dan over het hele element, niet alleen
       * over zijn linkerbovenhoek: een navigatie die voor driekwart buiten beeld
       * hangt, valt niet meer af te lezen.
       */
      const room = screenSize()
      const wide = (self.current?.offsetWidth ?? state.w) * state.scale
      const tall = (self.current?.offsetHeight ?? state.h) * state.scale
      onChange({
        x: clamp(ox + event.clientX - x, 0, Math.max(0, room.w - wide)),
        y: clamp(oy + event.clientY - y, 0, Math.max(0, room.h - tall))
      })
    } else if (size.current) {
      const { x, y, w, h } = size.current
      // Het element is vergroot, dus een muisstap van tien punten is er minder.
      onChange({
        w: Math.max(info.minW, w + (event.clientX - x) / state.scale),
        h: info.autoHeight ? state.h : Math.max(info.minH, h + (event.clientY - y) / state.scale)
      })
    }
  }

  const stop = (): void => {
    drag.current = undefined
    size.current = undefined
  }

  return (
    <section
      ref={hold}
      className={`panel panel-${info.id}`}
      style={
        {
          left: state.x,
          top: state.y,
          width: state.w,
          height: info.autoHeight ? undefined : state.h,
          // Schalen bij de linkerbovenhoek: dan blijft het element staan waar je
          // het hebt neergezet en groeit het naar rechtsonder weg.
          transform: state.scale === 1 ? undefined : `scale(${state.scale})`,
          transformOrigin: 'top left',
          // Eigen eigenschap: de stylesheet rekent er de dichtheid van de
          // achtergrond, de randen en de inhoud mee uit.
          '--fade': state.opacity
        } as CSSProperties
      }
      onPointerMove={onMove}
      onPointerUp={stop}
      onPointerCancel={stop}
    >
      {editing && (
        <header className="panel-bar" data-hit onPointerDown={startDrag}>
          <span className="panel-title">{title}</span>
          <button
            type="button"
            className="panel-scale"
            title={t(language, 'ovl.smaller')}
            aria-label={t(language, 'ovl.smaller')}
            onClick={() => rescale(-SCALE_STEP)}
          >
            −
          </button>
          <span className="panel-percent">{Math.round(state.scale * 100)}%</span>
          <button
            type="button"
            className="panel-scale"
            title={t(language, 'ovl.bigger')}
            aria-label={t(language, 'ovl.bigger')}
            onClick={() => rescale(SCALE_STEP)}
          >
            +
          </button>
          {/*
            De schuif zit in de balk waaraan je sleept, dus een sleep erop zou
            het hele element meenemen; stopPropagation houdt hem bij de schuif.
          */}
          <input
            type="range"
            className="panel-fade"
            min={Math.round(OPACITY_MIN * 100)}
            max={100}
            step={5}
            value={Math.round(state.opacity * 100)}
            title={`${t(language, 'ovl.opacity')} ${Math.round(state.opacity * 100)}%`}
            aria-label={t(language, 'ovl.opacity')}
            onPointerDown={(event) => event.stopPropagation()}
            onChange={(event) => onChange({ opacity: Number(event.target.value) / 100 })}
          />
          <button
            type="button"
            className="panel-hide"
            title={t(language, 'ovl.hide')}
            onClick={() => onChange({ visible: false })}
          >
            ✕
          </button>
        </header>
      )}

      <div className="panel-body">{children}</div>

      {editing && (
        <span
          className="panel-grip"
          data-hit
          title={t(language, info.autoHeight ? 'ovl.resizeW' : 'ovl.resizeWH')}
          onPointerDown={startSize}
        />
      )}
    </section>
  )
}

/**
 * De gegevens van de dienst in drie standen. Uitklappen zet hem een stand
 * verder en weer terug naar beknopt; wat er bij komt staat eronder, zodat de
 * bovenste regel altijd op dezelfde plek blijft.
 */
function DutyPanel({
  frame,
  detail,
  language,
  onCycle
}: {
  frame: Frame
  detail: DetailLevel
  language: Language
  onCycle(): void
}): JSX.Element {
  const tr = (key: Parameters<typeof t>[1], vars?: Record<string, string | number>): string =>
    t(language, key, vars)
  const { status, duty, connected } = frame
  const leg = status?.leg

  if (!status) {
    return (
      <div className="waiting">
        <span className="dot" /> {tr(connected ? 'ovl.noData' : 'ovl.waiting')}
      </div>
    )
  }

  const passed = walkedStops(status)
  const total = leg?.stops.length ?? 0

  /*
   * De rit is voorbij maar de dienst nog niet: dan moet de chauffeur in OMSI de
   * volgende rit kiezen, en op de IBIS de route ervan intoetsen. Dat staat hier,
   * want anders zit hij aan het eindpunt te wachten op een overlay die niets
   * meer te melden heeft.
   */
  const next = duty && status.legIndex >= 0 ? duty.legs[status.legIndex + 1] : undefined
  const legDone = Boolean(leg && status.clockMinutes >= leg.arrival)
  const nextRoute = duty && frame.ibis ? frame.ibis.legs[status.legIndex + 1]?.route : undefined

  return (
    <>
      <div className="topline">
        <span className="clock">{formatTime(status.clockMinutes)}</span>
        {leg && <span className="line">{leg.lineNumber}</span>}
        <Delta status={status} tr={tr} />
        <button
          type="button"
          className="expand"
          data-hit
          title={tr('ovl.detail', { level: tr(`ovl.detail${detail}` as const) })}
          onClick={onCycle}
        >
          <span className={`pips pips-${detail}`}>
            <i />
            <i />
            <i />
          </span>
        </button>
        <LayoutButton language={language} />
      </div>

      {legDone && next && !status.dutyComplete && (
        <div className="advice next-trip">
          {nextRoute
            ? tr('ovl.nextTrip', { time: formatTime(next.departure), route: nextRoute })
            : tr('ovl.nextTripPlain', { time: formatTime(next.departure) })}
        </div>
      )}

      {status.dutyComplete ? (
        <div className="line-done">{tr('ovl.done')}</div>
      ) : (
        <>
          {/* Beknopt: bestemming en volgende halte op een regel. */}
          {detail === 0 && leg && (
            <div className="tight">
              <span className="tight-stop">{stopName(leg, passed) ?? leg.terminus}</span>
              <span className="tight-rest">
                {tr('ovl.tight', {
                  passengers: status.passengers,
                  speed: Math.round(status.speedKmh)
                })}
                {total > 0 && passed !== undefined
                  ? tr('ovl.tightLeft', { left: Math.max(0, total - passed) })
                  : ''}
              </span>
            </div>
          )}

          {detail > 0 && leg && (
            <div className="row">
              <span className="label">{tr('ovl.to')}</span>
              <span className="value">{leg.terminus}</span>
              <span className="sub">
                {duty
                  ? tr('ovl.arrival', {
                      time: formatTime(leg.arrival),
                      index: status.legIndex + 1,
                      total: duty.legs.length
                    })
                  : tr('ovl.arrivalShort', { time: formatTime(leg.arrival) })}
              </span>
            </div>
          )}

          {detail === 1 && leg && (
            <div className="row">
              <span className="label">{tr('ovl.nextStop')}</span>
              <span className="value">{stopName(leg, passed) ?? '—'}</span>
              {passed !== undefined && total > 0 && (
                <span className="sub">
                  {tr('ovl.remaining', { left: Math.max(0, total - passed), total })}
                </span>
              )}
            </div>
          )}

          {detail === 2 && leg && <NextStops leg={leg} status={status} language={language} />}

          {detail > 0 && (
            <div className="grid">
              <div>
                <b>{status.passengers}</b>
                <span>{tr('ovl.onboard')}</span>
              </div>
              <div>
                <b>{Math.round(status.speedKmh)}</b>
                <span>{tr('ovl.speed')}</span>
              </div>
              <div className={status.hasPassengers ? `mood mood-${Math.round(status.mood * 4)}` : 'mood'}>
                <b>{loose(language, `mood.${status.moodLabel}`, status.moodLabel)}</b>
                <span>{tr('ovl.mood')}</span>
              </div>
            </div>
          )}

          {detail === 2 && (status.harshBrakes > 0 || status.harshAccels > 0) && (
            <div className="counters">
              {status.harshBrakes > 0 && (
                <span>{tr('ovl.harshBrakes', { count: status.harshBrakes })}</span>
              )}
              {status.harshAccels > 0 && (
                <span>{tr('ovl.harshAccels', { count: status.harshAccels })}</span>
              )}
            </div>
          )}
        </>
      )}

      {(status.entryRequest || status.exitRequest) && (
        <div className="request">
          {tr(status.entryRequest ? 'ovl.wantsIn' : 'ovl.wantsOut')}
        </div>
      )}

      {/* Waarschuwingen horen er altijd te staan; alleen de rest klapt weg. */}
      {status.advice
        .filter((item) => detail === 2 || item.severity === 'warn')
        .map((item) => (
          <div key={item.id} className={`advice ${item.severity}`}>
            {loose(language, `advice.${item.id}`, item.id, { count: item.count ?? 0 })}
          </div>
        ))}
    </>
  )
}

/**
 * Voor of achter op de dienstregeling, op de seconde.
 *
 * Het verschil komt uit de tijd die bij de eerstvolgende halte hoort; is die er
 * niet -- geen IBIS, geen dienstregeling in het menu -- dan valt hij terug op de
 * vertraging in hele minuten die de bus zelf meldt.
 */
function Delta({
  status,
  tr
}: {
  status: LiveStatus
  tr: (key: Parameters<typeof t>[1], vars?: Record<string, string | number>) => string
}): JSX.Element {
  const delta = status.deltaSeconds
  if (delta === undefined) {
    const late = status.delayMinutes >= 1
    return (
      <span className={`delay ${late ? 'late' : 'ontime'}`}>
        {late ? tr('ovl.late', { minutes: Math.round(status.delayMinutes) }) : tr('ovl.ontime')}
        {status.delayFromIbis ? '' : '*'}
      </span>
    )
  }

  /*
   * Waar de grens ligt tussen op tijd, te laat en te vroeg staat op één plek:
   * `punctuality`. Het venster van de app rekent met dezelfde grens, anders
   * staat er op het ene scherm groen en op het andere rood.
   */
  const size = Math.abs(delta)
  const clock = `${Math.floor(size / 60)}:${String(size % 60).padStart(2, '0')}`
  const state = punctuality(delta)
  const klasse = state === 'laat' ? 'late' : state === 'vroeg' ? 'early' : 'ontime'
  return (
    <span className={`delay ${klasse}`} title={tr('ovl.onTheDot')}>
      {state === 'optijd' ? tr('ovl.ontime') : `${delta > 0 ? '+' : '\u2212'}${clock}`}
    </span>
  )
}

/**
 * Naar de bewerkstand, vanuit de overlay zelf.
 *
 * Hij draagt `data-hit`, want buiten de bewerkstand laat het venster klikken
 * door naar het spel; alleen boven zo'n knop pakt het de muis even op.
 */
function LayoutButton({ language }: { language: Language }): JSX.Element {
  return (
    <button
      type="button"
      className="layout-button"
      data-hit
      title={t(language, 'ovl.layout')}
      aria-label={t(language, 'ovl.layout')}
      onClick={() => void window.career.editOverlay(true)}
    >
      {/* Twee panelen naast elkaar: dat is waar de knop over gaat. */}
      <svg viewBox="0 0 16 14" aria-hidden="true">
        <rect x="0.75" y="0.75" width="6" height="12.5" rx="1.5" />
        <rect x="9.25" y="0.75" width="6" height="7" rx="1.5" />
      </svg>
    </button>
  )
}

/**
 * De dienst is gekozen, maar de IBIS weet nog van niets.
 *
 * Dit is het moment waarop de chauffeur iets moet intoetsen, dus staat er wat
 * hij moet intoetsen -- en verder niets. Haltes en vertraging hebben pas
 * betekenis zodra de IBIS antwoord geeft.
 */
function IbisPanel({
  duty,
  ibis,
  status,
  language
}: {
  duty: Duty
  ibis?: IbisPlan
  status?: LiveStatus
  language: Language
}): JSX.Element {
  const legIndex = status?.legIndex ?? 0
  const leg = duty.legs[legIndex] ?? duty.legs[0]
  // De route van de rit die nu aan de beurt is; anders de eerste die er een heeft.
  const route = ibis?.legs[legIndex]?.route ?? ibis?.legs.find((item) => item.route)?.route
  const line = ibis?.line || leg?.lineNumber || '—'

  return (
    <div className="ibis-entry">
      <div className="topline">
        <b>{t(language, 'ovl.ibisTitle')}</b>
        <LayoutButton language={language} />
      </div>
      <div className="grid">
        <div>
          <b>{line}</b>
          <span>{t(language, 'ibis.line')}</span>
        </div>
        <div>
          <b>{route ?? '—'}</b>
          <span>{t(language, 'ibis.routeAtStart')}</span>
        </div>
      </div>
      <div className="row">
        <span className="sub">
          {route ? t(language, 'ovl.ibisWaiting') : t(language, 'ibis.noTable')}
        </span>
      </div>
    </div>
  )
}

/**
 * Voordat de dienst in OMSI zelf gekozen is.
 *
 * Tijd, haltes en vertraging hebben dan nog geen betekenis; wat de chauffeur
 * nodig heeft is wat hij moet aanklikken en intoetsen. Dat staat hier allebei:
 * de lijn, de omloop en de rit voor Set Time Table, en de lijn en de route voor
 * de IBIS. En het gaat over de rit die nu aan de beurt is, niet over de eerste
 * van de dienst -- na een voltooide rit hoort hier de volgende te staan.
 */
function SelectPanel({
  duty,
  ibis,
  leg,
  legIndex,
  status,
  language
}: {
  duty: Duty
  ibis?: IbisPlan
  leg?: DutyLeg
  legIndex: number
  status?: LiveStatus
  language: Language
}): JSX.Element {
  const chosen = status?.schedule
  const route = ibis?.legs[legIndex]?.route
  const line = ibis?.line || leg?.lineNumber || duty.lineNumbers[0] || '—'
  return (
    <div className="select-duty">
      <div className="topline">
        <span className="line">{leg?.lineNumber ?? duty.lineNumbers.join(' / ')}</span>
        <b>{t(language, 'ovl.selectTitle')}</b>
        <LayoutButton language={language} />
      </div>

      <span className="step-title">{t(language, 'ovl.menu')}</span>
      <div className="grid">
        <div>
          <b>{leg?.lineFile ?? duty.lineFile}</b>
          <span>Line</span>
        </div>
        <div>
          <b>{leg?.tourNumber ?? duty.tourNumber}</b>
          <span>Tour</span>
        </div>
        <div>
          <b>{leg ? formatTime(leg.departure) : '—'}</b>
          <span>{t(language, 'ovl.menuTrip')}</span>
        </div>
      </div>

      <span className="step-title">{t(language, 'ovl.onTheIbis')}</span>
      <div className="grid">
        <div>
          <b>{line}</b>
          <span>{t(language, 'ibis.line')}</span>
        </div>
        <div>
          <b>{route ?? '—'}</b>
          <span>{t(language, 'ibis.routeAtStart')}</span>
        </div>
        <div className="wide">
          <b>{leg?.stops[0] ?? '—'}</b>
          <span>{t(language, 'ovl.menuFirst')}</span>
        </div>
      </div>

      <div className="row">
        <span className="sub">
          {t(language, 'ovl.selectSteps', { time: leg ? formatTime(leg.departure) : '—' })}
        </span>
      </div>

      {chosen && !chosen.matchesDuty && (
        <div className="advice warn">
          {t(language, 'ovl.selectWrong', { line: chosen.lineName || '—', tour: chosen.tourName || '—' })}
        </div>
      )}
    </div>
  )
}

/**
 * De stap tussen kiezen en rijden: de IBIS.
 *
 * OMSI weet dan al welke dienst je rijdt, maar de bus nog niet: lijn en route
 * moeten met de hand op het toetsenblok. De route zegt ook de richting -- heen
 * is een andere dan terug -- en dat is precies waar het misgaat als je gokt.
 *
 * Er zit een knop onder in plaats van dat we het zelf afleiden. De plugin kan
 * niet zien of de chauffeur klaar is met tikken, en een infoscherm dat halverwege
 * het intoetsen aanspringt leidt alleen maar af.
 */
function IbisStep({
  leg,
  ibis,
  legIndex,
  language,
  onDone
}: {
  leg?: DutyLeg
  ibis?: IbisPlan
  legIndex: number
  language: Language
  onDone(): void
}): JSX.Element {
  const route = ibis?.legs[legIndex]?.route
  const line = ibis?.line || leg?.lineNumber || '—'
  return (
    // Een eigen naam naast die van het keuzescherm: ze lijken op elkaar, en een
    // proef moet kunnen zien welke van de twee er staat.
    <div className="select-duty ibis-step">
      <div className="topline">
        <span className="line">{leg?.lineNumber ?? '—'}</span>
        <b>{t(language, 'ovl.ibisStepTitle')}</b>
        <LayoutButton language={language} />
      </div>
      <div className="grid">
        <div>
          <b>{line}</b>
          <span>{t(language, 'ibis.line')}</span>
        </div>
        <div>
          <b>{route ?? '—'}</b>
          <span>{t(language, 'ibis.routeAtStart')}</span>
        </div>
        <div>
          <b>{leg?.terminus ?? '—'}</b>
          <span>{t(language, 'ovl.to')}</span>
        </div>
      </div>
      <div className="row">
        <span className="sub">
          {t(language, 'ovl.ibisStepHow', { line, route: route ?? '—' })}
        </span>
      </div>
      <button type="button" className="ovl-btn" data-hit onClick={onDone}>
        {t(language, 'ovl.ibisDone')}
      </button>
    </div>
  )
}

/** De balk die alleen in de bewerkstand verschijnt. */
function EditBar({
  layout,
  language,
  rate,
  onRate,
  onShow,
  onReset
}: {
  layout: OverlayLayout
  language: Language
  rate: OverlayRate
  onRate(next: OverlayRate): void
  onShow(id: PanelId): void
  onReset(): void
}): JSX.Element {
  const hidden = PANELS.filter((info) => !layout[info.id].visible)
  const name = (id: PanelId): string =>
    t(language, id === 'dienst' ? 'ovl.panelDuty' : 'ovl.panelNav')
  return (
    <div className="editbar" data-hit>
      <b>{t(language, 'ovl.editTitle')}</b>
      <span className="editbar-hint">{t(language, 'ovl.editHint')}</span>

      {hidden.length > 0 && (
        <div className="editbar-add">
          <span>{t(language, 'ovl.hidden')}</span>
          {hidden.map((info) => (
            <button key={info.id} type="button" onClick={() => onShow(info.id)}>
              + {name(info.id)}
            </button>
          ))}
        </div>
      )}

      {/*
        Hoe vaak de overlay zichzelf opnieuw tekent. Hij ligt doorzichtig over
        OMSI heen, en elke verversing moet Windows over het spel heen mengen --
        dat kost beeldjes. Wie haperingen merkt, zet hem hier rustiger; de
        cijfers lopen net zo goed mee, de bus op de kaart schuift alleen met
        grotere stappen op.
      */}
      <div className="editbar-rate">
        <span>{t(language, 'ovl.rate')}</span>
        {(Object.keys(OVERLAY_RATES) as OverlayRate[]).map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={rate === key}
            className={rate === key ? 'on' : undefined}
            onClick={() => onRate(key)}
          >
            {t(language, `ovl.rate.${key}` as const)}
          </button>
        ))}
        <span className="editbar-hint">{t(language, 'ovl.rateHint')}</span>
      </div>

      <div className="editbar-buttons">
        <button type="button" onClick={onReset}>
          {t(language, 'ovl.reset')}
        </button>
        {/* Zonder deze knop kreeg je de overlay alleen via de app dicht. */}
        <button type="button" onClick={() => void window.career.closeOverlay()}>
          {t(language, 'ovl.close')}
        </button>
        <button type="button" className="done" onClick={() => void window.career.editOverlay(false)}>
          {t(language, 'ovl.ready')}
        </button>
      </div>
    </div>
  )
}

/**
 * De haltes die nog komen, als een lijndiagram.
 *
 * Waar je bent komt uit de IBIS; die vult zich pas als de lijn en route zijn
 * ingetoetst. Zolang dat niet is gebeurd staat de hele rit er gewoon, vanaf het
 * begin — dan weet je tenminste wat er aankomt.
 */
function NextStops({
  leg,
  status,
  language
}: {
  leg: DutyLeg
  status: LiveStatus
  language: Language
}): JSX.Element {
  const tr = (key: Parameters<typeof t>[1], vars?: Record<string, string | number>): string =>
    t(language, key, vars)
  const total = leg.stops.length
  const passed = walkedStops(status)
  const at = passed ?? 0

  // Eentje terug geeft richting; verder vooruit past niet in de cabine.
  const from = Math.max(0, at - 1)
  const shown = leg.stops.slice(from, from + 6)
  const left = total - (from + shown.length)

  return (
    <div className="nav">
      <div className="nav-head">
        <span className="label">{tr('ovl.stop')}</span>{' '}
        {passed !== undefined ? (
          <span className="sub">{tr('ovl.remaining', { left: Math.max(0, total - at), total })}</span>
        ) : (
          <span className="sub">
            {tr(status.offersStops ? 'ovl.ibisHint' : 'ovl.noStopInfo')}
          </span>
        )}
      </div>

      <ol className="strip">
        {shown.map((name, index) => {
          const index2 = from + index
          const state =
            passed === undefined
              ? 'ahead'
              : index2 < at
                ? 'done'
                : index2 === at
                  ? 'now'
                  : 'ahead'
          return (
            <li key={`${index2}-${name}`} className={`stop ${state}`}>
              <span className="pin" />
              <span className="name">{name}</span>
              {leg.stopTimes[index2] !== undefined && (
                <span className="stop-time">{formatTime(leg.stopTimes[index2])}</span>
              )}
              {index2 === total - 1 && <span className="tag">{tr('ovl.endpoint')}</span>}
            </li>
          )
        })}
      </ol>

      {left > 0 && (
        <div className="nav-rest">{tr('ovl.andMore', { count: left, terminus: leg.terminus })}</div>
      )}
    </div>
  )
}

/** Hoeveel haltes de bus gehad heeft, of niets als hij het niet doorgeeft. */
function walkedStops(status?: LiveStatus): number | undefined {
  if (!status?.leg || !status.reportsStops || status.stopIndex === undefined) return undefined
  return Math.min(Math.max(status.stopIndex, 0), status.leg.stops.length)
}

function stopName(leg: DutyLeg, at?: number): string | undefined {
  if (at === undefined) return undefined
  return leg.stops[Math.min(at, leg.stops.length - 1)]
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}

createRoot(document.getElementById('root')!).render(<Overlay />)
