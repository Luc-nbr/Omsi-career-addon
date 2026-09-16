import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type PointerEvent as ReactPointerEvent
} from 'react'
import type { MapGeometry, StopPoint } from '../../core/geo'
import type { TripRoute } from '../../core/routing'
import type { Duty } from '../../core/types'
import { useT } from './language'
import { RoadLayer } from './roadLayer'
import './routemap.css'

/** Een halte zoals hij op de route voorkomt, met zijn plek in de volgorde. */
export interface RouteStop extends StopPoint {
  /** Hoeveelste halte van de hele dienst, over de ritten heen. */
  order: number
  /** Hoeveelste halte binnen de rit, zoals de dienst hem opsomt. */
  at: number
  legIndex: number
  /** Eerste halte van de dienst: hier zet je de bus neer. */
  isStart: boolean
  /** Laatste halte van de dienst. */
  isEnd: boolean
}

interface View {
  /** Middelpunt van het beeld, in meters op de kaart. */
  cx: number
  cy: number
  /** Meters per beeldpunt: groter is verder weg. */
  mpp: number
  /** Koers die boven in beeld staat, in graden. Nul is noord boven; meerijdend de rijrichting. */
  rot: number
}

/** De bus zoals OMSI hem plaatst, uit het geheugen van het spel. */
export interface LiveVehicle {
  x: number
  y: number
  heading: number
  speedKmh: number
}

interface Props {
  duty: Duty
  geometry: MapGeometry
  /** Halte waar de bus nu heen rijdt; alles daarvoor vergrijst. */
  nextStopId?: string
  /** In het venster is meer ruimte, dus meer namen en grotere borden. */
  variant?: 'panel' | 'full'
  /** Halte die de gebruiker elders aanwees; die springt in beeld. */
  focusStopId?: string
  /**
   * Het stuk weg waar de bus nu op rijdt: van de vorige halte naar de volgende.
   * Staat dit aan, dan houdt de kaart dat stuk in beeld in plaats van de hele
   * dienst -- ingezoomd genoeg om de straat te kunnen volgen.
   */
  follow?: { fromId?: string; toId?: string }
  /**
   * De rit waar het nu om gaat. Een dienst rijdt heen en terug over dezelfde
   * straat, langs de haltepalen aan weerskanten; alle ritten even fel tekenen
   * levert een dubbele lijn met pijlen die elkaar tegenspreken. Deze rit komt
   * naar voren, de rest blijft als flauwe lijn staan.
   */
  activeLeg?: number
  /**
   * Alleen de rit `activeLeg` als route tekenen, en de rest niet. In de overlay
   * verschijnt de route pas als de IBIS is ingetoetst: daarvoor weet niemand
   * welke rit er gereden wordt, en is elke lijn een gok.
   */
  routeMode?: 'all' | 'active' | 'none'
  /**
   * Waar de bus is, voor zover we dat weten. OMSI geeft geen positie door, maar
   * wel de volgende halte (uit de IBIS) en de kilometerteller. Vanaf de vorige
   * halte schuift de bus zoveel meter over de route op, en nooit voorbij de
   * volgende. De kaart rijdt dan met hem mee.
   */
  bus?: { legIndex: number; nextStop: number; metresSinceStop?: number }
  /**
   * De echte plek van de bus. Is die er, dan rijdt de kaart mee zoals een
   * navigatiesysteem: rijrichting boven, soepel, en verder uitgezoomd naarmate de
   * bus harder gaat. Hij gaat voor op de schatting in `bus`.
   */
  vehicle?: LiveVehicle
  /** Teksten van de overlay, die zijn eigen taalkeuze heeft. */
  texts?: { waiting?: string; busNote?: string; centre?: string }
  /**
   * Vergroting van het venster waar de kaart in hangt. Het wegennet staat op een
   * canvas; zonder deze factor wordt dat bij vergroten uitgerekt en dus wazig.
   */
  pixelScale?: number
}

const MIN_MPP = 0.2
const MAX_MPP = 60

/**
 * Grenzen voor het meerijdende beeld. Onder de ondergrens kijk je naar losse
 * stoeptegels, boven de bovengrens is de straat niet meer te volgen.
 */
const FOLLOW_MIN_MPP = 0.35
const FOLLOW_MAX_MPP = 2.2
/** Lucht om het stuk weg heen, zodat je ziet wat eraan komt. */
const FOLLOW_PAD_M = 130

/** Namen van andere haltes verschijnen pas als je dicht genoeg bent. */
const OTHER_LABEL_MPP = 2.5
const ROUTE_LABEL_MPP = 14

/** Zoveel meter voorbij een halte telt hij pas als gehad. */
const STOP_PASSED_M = 12

/** Wie de kaart zelf versleept of zoomt, krijgt zoveel rust voordat hij terugveert naar de bus. */
const MANUAL_MS = 6000

/** Zoomstand als de kaart met de bus meerijdt: straten en zijstraten zijn nog te lezen. */
const BUS_MPP = 0.9

/**
 * Meerijden als een navigatiesysteem: langzaam rijden zoomt in, harder rijden
 * zoomt uit, zodat je de volgende kruising ruim ziet aankomen. De bus staat
 * onder het midden, want wat voor je ligt telt zwaarder dan wat achter je ligt.
 */
const LIVE_MAX_MPP = 2
const LIVE_AHEAD = 0.22

/**
 * Stapvoets hoort de kaart op vijfentwintig meter te staan.
 *
 * Dat is de stand waarin je de halte, de inrit en de stoeprand nog uit elkaar
 * houdt -- precies wat je nodig hebt als je langzaam rijdt, want dan ben je aan
 * het aanrijden, keren of invoegen. De schaalbalk van de navigatie mikt op
 * negentig punten breed, dus vijfentwintig meter valt op 25/90 meter per punt.
 */
const SLOW_KMH = 30
const SLOW_MPP = 25 / 90

/** En bij deze snelheid is hij helemaal uitgezoomd. */
const FAST_KMH = 80

/** Hoeveel meter per punt erbij komt boven stapvoets. */
const LIVE_MPP_PER_KMH = (LIVE_MAX_MPP - SLOW_MPP) / (FAST_KMH - SLOW_KMH)

/**
 * De zoomstand die bij een snelheid hoort. Onder de stapvoetsgrens vast op
 * vijfentwintig meter, daarboven vloeiend verder open -- zonder sprong op de
 * grens zelf, want een kaart die bij precies dertig ineens wegspringt leest als
 * een storing.
 */
export function liveZoom(speedKmh: number): number {
  if (!(speedKmh > SLOW_KMH)) return SLOW_MPP
  return Math.min(LIVE_MAX_MPP, SLOW_MPP + (speedKmh - SLOW_KMH) * LIVE_MPP_PER_KMH)
}
/** Hoe snel de getoonde bus de gemeten plek volgt, in seconden; kleiner is strakker. */
const LIVE_SMOOTH_S = 0.18
/** Zo ver rekent de kaart vooruit op de snelheid, tussen twee metingen in. */
const LIVE_PREDICT_S = 0.3
const LIVE_FRAME_MS = 33

export function RouteMap({
  duty,
  geometry,
  nextStopId,
  variant = 'panel',
  focusStopId,
  follow,
  activeLeg,
  routeMode = 'all',
  bus,
  vehicle,
  texts,
  pixelScale = 1
}: Props): JSX.Element {
  const tr = useT()
  const boxRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ w: 640, h: 320 })
  const [view, setView] = useState<View>({ cx: 0, cy: 0, mpp: 8, rot: 0 })
  const [hovered, setHovered] = useState<string>()
  const dragRef = useRef<{ x: number; y: number; cx: number; cy: number } | undefined>(undefined)

  const byId = useMemo(() => new Map(geometry.stops.map((stop) => [stop.id, stop])), [geometry])

  /** De haltes van de dienst op volgorde, zonder de herhalingen eruit te gooien. */
  const legs = useMemo(() => {
    let order = 0
    return duty.legs.map((leg, legIndex) =>
      leg.stopIds
        .map((id, at) => {
          const point = byId.get(id)
          if (!point) return undefined
          const stop: RouteStop = {
            ...point,
            name: leg.stops[at] || point.name,
            order: order++,
            at,
            legIndex,
            isStart: legIndex === 0 && at === 0,
            isEnd: legIndex === duty.legs.length - 1 && at === leg.stopIds.length - 1
          }
          return stop
        })
        .filter((stop): stop is RouteStop => Boolean(stop))
    )
  }, [duty, byId])

  /** Elke halte een keer, voor de borden. De eerste vermelding telt. */
  const routeStops = useMemo(() => {
    const seen = new Map<string, RouteStop>()
    for (const leg of legs) {
      for (const stop of leg) {
        const known = seen.get(stop.id)
        if (!known) seen.set(stop.id, stop)
        else if (stop.isEnd) seen.set(stop.id, { ...known, isEnd: true })
      }
    }
    return [...seen.values()]
  }, [legs])

  const start = routeStops.find((stop) => stop.isStart)

  /*
   * De weg die elke rit rijdt, uitgerekend in het hoofdproces. Zolang die er niet
   * is, lopen de lijnen recht van halte naar halte. De sleutel is een tekst en
   * geen object: de overlay krijgt elke tel een nieuwe kopie van dezelfde dienst.
   */
  const routeKey = `${duty.mapFolder}|${duty.legs.map((leg) => `${leg.tripFile}:${leg.stopIds.join(',')}`).join(';')}`
  const [routes, setRoutes] = useState<TripRoute[]>()
  useEffect(() => {
    let current = true
    setRoutes(undefined)
    const request = duty.legs.map(({ tripFile, stopIds }) => ({ tripFile, stopIds }))
    window.career
      .routes(duty.mapFolder, request)
      .then((found) => {
        if (current) setRoutes(found)
      })
      .catch(() => undefined)
    return () => {
      current = false
    }
  }, [routeKey])

  /** Waar de route ligt, met wat lucht eromheen. */
  const bounds = useMemo(() => {
    const points = routeStops.length > 0 ? routeStops : geometry.stops
    if (points.length === 0) return { minX: 0, minY: 0, maxX: 1, maxY: 1 }
    return {
      minX: Math.min(...points.map((p) => p.x)),
      maxX: Math.max(...points.map((p) => p.x)),
      minY: Math.min(...points.map((p) => p.y)),
      maxY: Math.max(...points.map((p) => p.y))
    }
  }, [routeStops, geometry])

  useLayoutEffect(() => {
    const element = boxRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      setSize({
        w: Math.max(160, Math.round(entry.contentRect.width)),
        h: Math.max(140, Math.round(entry.contentRect.height))
      })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const following = Boolean(follow?.toId) || Boolean(bus) || Boolean(vehicle)

  const fitted = useRef<string>('')
  useEffect(() => {
    // Rijdt de kaart mee, dan bepaalt het stuk weg het beeld en niet de dienst.
    // Een aangewezen halte gaat ook voor; die zet het effect hieronder in beeld.
    if (following || (focusStopId && byId.has(focusStopId))) return
    const key = `${duty.tourNumber}|${bounds.minX}|${bounds.minY}|${size.w}x${size.h}`
    if (fitted.current === key) return
    fitted.current = key
    const pad = 80
    const spanX = Math.max(60, bounds.maxX - bounds.minX)
    const spanY = Math.max(60, bounds.maxY - bounds.minY)
    setView({
      cx: (bounds.minX + bounds.maxX) / 2,
      cy: (bounds.minY + bounds.maxY) / 2,
      mpp: clamp(
        Math.max(spanX / Math.max(1, size.w - pad), spanY / Math.max(1, size.h - pad)),
        MIN_MPP,
        MAX_MPP
      ),
      rot: 0
    })
  }, [duty.tourNumber, bounds, size, following, focusStopId, byId])

  /*
   * Meerijden: het stuk van de vorige naar de volgende halte vult het beeld.
   * Een eigen positie geeft OMSI niet door -- de plugin-API kent er geen
   * variabele voor -- maar het weggedeelte tussen twee haltes is precies waar
   * je op zit, en dat is wat je wilt zien.
   */
  useEffect(() => {
    if (!follow?.toId) return
    const to = byId.get(follow.toId)
    if (!to) return
    const from = follow.fromId ? byId.get(follow.fromId) : undefined
    const xs = from ? [from.x, to.x] : [to.x]
    const ys = from ? [from.y, to.y] : [to.y]
    const spanX = Math.max(...xs) - Math.min(...xs) + FOLLOW_PAD_M * 2
    const spanY = Math.max(...ys) - Math.min(...ys) + FOLLOW_PAD_M * 2
    setView({
      cx: (Math.max(...xs) + Math.min(...xs)) / 2,
      cy: (Math.max(...ys) + Math.min(...ys)) / 2,
      mpp: clamp(
        Math.max(spanX / Math.max(1, size.w), spanY / Math.max(1, size.h)),
        FOLLOW_MIN_MPP,
        FOLLOW_MAX_MPP
      ),
      rot: 0
    })
  }, [follow?.fromId, follow?.toId, byId, size])

  // Een halte die elders is aangewezen halen we in beeld.
  useEffect(() => {
    if (!focusStopId) return
    const stop = byId.get(focusStopId)
    if (stop) setView((old) => ({ ...old, cx: stop.x, cy: stop.y, mpp: Math.min(old.mpp, 1.6) }))
  }, [focusStopId, byId])

  /** Per rit de lijn over de weg, met de afstand langs die lijn bij elke halte. */
  const legTracks = useMemo(
    () =>
      duty.legs.map((leg, legIndex) => {
        const route = routes?.[legIndex]?.points
        if (!route || route.length < 4) return undefined
        return trackAlong(
          route,
          leg.stopIds.map((id) => byId.get(id))
        )
      }),
    // routeKey en niet duty: de overlay krijgt elke tel een nieuwe kopie van dezelfde dienst.
    [routeKey, routes, byId]
  )

  const busPoint = useMemo(() => {
    if (!bus) return undefined
    const track = legTracks[bus.legIndex]
    const leg = duty.legs[bus.legIndex]
    if (!track || !leg || leg.stopIds.length === 0) return undefined
    const next = Math.min(Math.max(bus.nextStop, 0), leg.stopIds.length - 1)
    const previous = next > 0 ? track.stops[next - 1] : undefined
    const upcoming = track.stops[next]
    let along: number
    if (previous === undefined) {
      // Nog voor de eerste halte, of de vorige staat niet op de kaart: bij de volgende.
      along = upcoming ?? 0
    } else {
      along = previous + Math.max(0, bus.metresSinceStop ?? 0)
      if (upcoming !== undefined && upcoming >= previous) along = Math.min(along, upcoming)
    }
    return pointAlong(track, along)
  }, [bus, legTracks, duty])

  /*
   * Meerijden met de bus. Wie zelf sleept of zoomt krijgt MANUAL_MS rust, daarna
   * veert de kaart terug. Zoomen mag blijven staan, tenzij het zo ver uit is dat
   * je de straat niet meer kunt volgen.
   */
  const manualUntil = useRef(0)
  const busRef = useRef(busPoint)
  busRef.current = busPoint
  const centreOnBus = useCallback((force: boolean) => {
    if (force) manualUntil.current = 0
    const point = busRef.current
    if (!point) return
    if (!force && Date.now() < manualUntil.current) return
    setView((old) => {
      const mpp = old.mpp <= FOLLOW_MAX_MPP * 2 ? old.mpp : BUS_MPP
      if (Math.abs(old.cx - point.x) < 0.05 && Math.abs(old.cy - point.y) < 0.05 && mpp === old.mpp) return old
      return { cx: point.x, cy: point.y, mpp, rot: 0 }
    })
  }, [])
  useEffect(() => centreOnBus(false), [busPoint, centreOnBus])
  const hasBus = Boolean(busPoint)
  useEffect(() => {
    if (!hasBus) return
    const timer = window.setInterval(() => centreOnBus(false), 500)
    return () => window.clearInterval(timer)
  }, [hasBus, centreOnBus])
  const markManual = (): void => {
    if (bus || vehicle) manualUntil.current = Date.now() + MANUAL_MS
  }

  /*
   * Meerijden met de echte bus. De plugin meet tien keer per seconde; daartussen
   * glijdt de getoonde bus naar de laatste meting en rekent hij een fractie van een
   * seconde vooruit op de snelheid, zodat de kaart niet schokt maar schuift. De
   * kaart draait met de rijrichting mee en zoomt uit naarmate de bus harder gaat.
   */
  const vehicleRef = useRef<{ data: LiveVehicle; at: number } | undefined>(undefined)
  useEffect(() => {
    vehicleRef.current = vehicle ? { data: vehicle, at: performance.now() } : undefined
  }, [vehicle?.x, vehicle?.y, vehicle?.heading, vehicle?.speedKmh])
  const sizeRef = useRef(size)
  sizeRef.current = size
  const [liveBus, setLiveBus] = useState<{ x: number; y: number; heading: number }>()

  /**
   * Hoeveel meter de bus over de route van deze rit is.
   *
   * Uit de kilometerteller volgt dat rechtstreeks. Leest de app de plek uit het
   * geheugen van OMSI, dan is er alleen een punt in de wereld; dat wordt op de
   * route gelegd, en pas vanaf de vorige halte gezocht -- een rit komt vaak twee
   * keer door dezelfde straat, en zonder die ondergrens springt de streep terug.
   */
  const progressAlong = useMemo(() => {
    if (activeLeg === undefined) return undefined
    const track = legTracks[activeLeg]
    if (!track) return undefined

    if (liveBus) {
      const leg = duty.legs[activeLeg]
      const next = bus ? Math.min(Math.max(bus.nextStop, 0), (leg?.stopIds.length ?? 1) - 1) : 0
      const from = next > 0 ? (track.stops[next - 1] ?? 0) : 0
      return nearestAlong(track, liveBus.x, liveBus.y, from)
    }

    if (!bus || bus.legIndex !== activeLeg) return undefined
    const leg = duty.legs[activeLeg]
    if (!leg || leg.stopIds.length === 0) return undefined
    const next = Math.min(Math.max(bus.nextStop, 0), leg.stopIds.length - 1)
    const previous = next > 0 ? track.stops[next - 1] : undefined
    const upcoming = track.stops[next]
    if (previous === undefined) return upcoming ?? 0
    const along = previous + Math.max(0, bus.metresSinceStop ?? 0)
    return upcoming !== undefined && upcoming >= previous ? Math.min(along, upcoming) : along
  }, [activeLeg, legTracks, liveBus, bus, duty])
  const hasVehicle = Boolean(vehicle)
  useEffect(() => {
    if (!hasVehicle) {
      setLiveBus(undefined)
      return
    }
    let frame = 0
    let last = performance.now()
    let shown: { x: number; y: number; heading: number; mpp: number } | undefined
    const tick = (now: number): void => {
      frame = requestAnimationFrame(tick)
      if (now - last < LIVE_FRAME_MS) return
      const dt = Math.min(0.25, (now - last) / 1000)
      last = now
      const target = vehicleRef.current
      if (!target) return
      const age = Math.min(LIVE_PREDICT_S, (now - target.at) / 1000)
      const radians = (target.data.heading * Math.PI) / 180
      const metres = (target.data.speedKmh / 3.6) * age
      const tx = target.data.x + Math.sin(radians) * metres
      const ty = target.data.y + Math.cos(radians) * metres
      if (!shown || Math.hypot(tx - shown.x, ty - shown.y) > 80) {
        // Eerste meting, of de bus is verzet: meteen erheen, niet eroverheen glijden.
        shown = { x: tx, y: ty, heading: target.data.heading, mpp: shown?.mpp ?? BUS_MPP }
      } else {
        const step = 1 - Math.exp(-dt / LIVE_SMOOTH_S)
        shown.x += (tx - shown.x) * step
        shown.y += (ty - shown.y) * step
        shown.heading = (shown.heading + turn(shown.heading, target.data.heading) * step + 360) % 360
      }
      const wanted = liveZoom(target.data.speedKmh)
      shown.mpp += (wanted - shown.mpp) * (1 - Math.exp(-dt / 1.2))
      /*
       * Een glijdende beweging komt er nooit helemaal: hij blijft op een kruimel
       * na hangen. Dat is onzichtbaar op de kaart, maar niet op de schaalbalk --
       * die staat op vijfentwintig meter en springt van een honderdste te veel
       * naar vijftig. Dus dicht genoeg is aangekomen.
       */
      if (Math.abs(wanted - shown.mpp) < wanted * 0.01) shown.mpp = wanted
      setLiveBus({ x: shown.x, y: shown.y, heading: shown.heading })
      if (Date.now() < manualUntil.current) return
      const ahead = sizeRef.current.h * LIVE_AHEAD * shown.mpp
      const facing = (shown.heading * Math.PI) / 180
      setView({
        cx: shown.x + Math.sin(facing) * ahead,
        cy: shown.y + Math.cos(facing) * ahead,
        mpp: shown.mpp,
        rot: shown.heading
      })
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [hasVehicle])

  // React luistert standaard passief naar het wieltje, dus zelf aanhaken —
  // anders scrollt de pagina mee terwijl je inzoomt.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault()
      if (bus || vehicle) manualUntil.current = Date.now() + MANUAL_MS
      const rect = svg.getBoundingClientRect()
      const px = event.clientX - rect.left - size.w / 2
      const py = size.h / 2 - (event.clientY - rect.top)
      setView((old) => {
        const next = clamp(old.mpp * Math.exp(event.deltaY * 0.0012), MIN_MPP, MAX_MPP)
        // Het punt onder de muis blijft staan waar het staat, ook met een gedraaide kaart.
        const [ox, oy] = unrotate(px * old.mpp, py * old.mpp, old.rot)
        const [nx, ny] = unrotate(px * next, py * next, old.rot)
        return { ...old, mpp: next, cx: old.cx + ox - nx, cy: old.cy + oy - ny }
      })
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [size, bus, vehicle])

  /** Van kaartmeters naar schermpunten; de rijrichting staat boven als de kaart meedraait. */
  const toScreen = useCallback(
    (x: number, y: number): [number, number] => {
      const r = (view.rot * Math.PI) / 180
      const dx = x - view.cx
      const dy = y - view.cy
      return [
        size.w / 2 + (dx * Math.cos(r) - dy * Math.sin(r)) / view.mpp,
        size.h / 2 - (dx * Math.sin(r) + dy * Math.cos(r)) / view.mpp
      ]
    },
    [size, view]
  )

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>): void => {
    ;(event.target as Element).setPointerCapture?.(event.pointerId)
    markManual()
    dragRef.current = { x: event.clientX, y: event.clientY, cx: view.cx, cy: view.cy }
  }

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>): void => {
    const drag = dragRef.current
    if (!drag) return
    markManual()
    setView((old) => {
      const [dx, dy] = unrotate((event.clientX - drag.x) * old.mpp, -(event.clientY - drag.y) * old.mpp, old.rot)
      return { ...old, cx: drag.cx - dx, cy: drag.cy - dy }
    })
  }

  const endDrag = (): void => {
    dragRef.current = undefined
  }

  const zoomBy = (factor: number): void => {
    markManual()
    setView((old) => ({ ...old, mpp: clamp(old.mpp * factor, MIN_MPP, MAX_MPP) }))
  }

  const refit = (): void => {
    fitted.current = ''
    setSize((old) => ({ ...old }))
  }

  /* Het wegennet gaat op een canvas onder de SVG; zie roadLayer.ts waarom. */
  const roads = useMemo(() => new RoadLayer(geometry), [geometry])
  const drawnMpp = useRef(0)
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    // Het venster kan vergroot staan; dan moet het canvas evenveel fijner.
    const dpr = (window.devicePixelRatio || 1) * pixelScale
    const width = Math.round(size.w * dpr)
    const height = Math.round(size.h * dpr)
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
    const roadView = { ...view, rotation: view.rot, w: size.w, h: size.h, dpr }
    // Tijdens het zoomen de oude tekening schalen, en pas als het wieltje stil
    // is scherp opnieuw tekenen: uitgezoomd kost dat een tiende seconde.
    const zooming = drawnMpp.current !== 0 && drawnMpp.current !== view.mpp
    const frame = requestAnimationFrame(() => roads.draw(ctx, roadView, !zooming))
    const settle = zooming
      ? window.setTimeout(() => {
          drawnMpp.current = view.mpp
          roads.draw(ctx, roadView, true)
        }, 160)
      : undefined
    if (!zooming) drawnMpp.current = view.mpp
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(settle)
    }
  }, [roads, view, size, pixelScale])

  /** Hoever de dienst gevorderd is, als volgnummer van de eerstvolgende halte. */
  const passedBefore = useMemo(() => {
    if (!nextStopId) return -1
    for (const leg of legs) for (const stop of leg) if (stop.id === nextStopId) return stop.order
    return -1
  }, [legs, nextStopId])

  /**
   * Welke haltes je gehad hebt.
   *
   * Dat volgt uit waar de bus op de route staat en niet uit de halteteller van
   * de IBIS: die twee liepen uit de pas, waardoor haltes vóór de bus al
   * vergrijsden. Nu kleuren de lijn en de borden op dezelfde bron.
   *
   * Een halte die verderop nog een keer langskomt blijft groen; een rit doet
   * dezelfde straat vaak twee keer aan.
   */
  const passedStops = useMemo(() => {
    const state = new Map<string, boolean>()
    const track = activeLeg !== undefined ? legTracks[activeLeg] : undefined
    for (const leg of legs) {
      for (const stop of leg) {
        let done = false
        if (activeLeg === undefined) done = false
        else if (stop.legIndex < activeLeg) done = true
        else if (stop.legIndex > activeLeg) done = false
        else if (track && progressAlong !== undefined) {
          const along = track.stops[stop.at]
          // Een paar meter speling: op de halte zelf ben je er nog niet voorbij.
          done = along !== undefined && along < progressAlong - STOP_PASSED_M
        } else {
          done = passedBefore >= 0 && stop.order < passedBefore
        }
        if (!done) state.set(stop.id, false)
        else if (!state.has(stop.id)) state.set(stop.id, true)
      }
    }
    return state
  }, [legs, legTracks, activeLeg, progressAlong, passedBefore])

  const big = variant === 'full'
  /*
   * De borden krimpen naarmate je verder uitzoomt. Op ware grootte kruipen ze
   * anders over elkaar heen zodra twee haltes dicht bij elkaar liggen, en dan
   * is er van de route niets meer te zien.
   */
  const signR = (big ? 10 : 8) * clamp((14 - view.mpp) / 10, 0.34, 1)
  const showLetter = signR >= 5.5
  const showRouteNames = view.mpp < ROUTE_LABEL_MPP
  const showOtherNames = view.mpp < OTHER_LABEL_MPP

  /** Achtergrondhaltes: alleen wat in beeld valt, en niet te veel. */
  const otherStops = useMemo(() => {
    if (view.mpp > 8) return []
    const onRoute = new Set(routeStops.map((stop) => stop.id))
    const radius = view.rot !== 0 ? (Math.hypot(size.w, size.h) / 2) * view.mpp + 100 : 0
    const marginX = radius || (size.w / 2) * view.mpp + 100
    const marginY = radius || (size.h / 2) * view.mpp + 100
    const found: StopPoint[] = []
    for (const stop of geometry.stops) {
      if (onRoute.has(stop.id)) continue
      if (Math.abs(stop.x - view.cx) > marginX || Math.abs(stop.y - view.cy) > marginY) continue
      found.push(stop)
      if (found.length >= 300) break
    }
    return found
  }, [geometry, routeStops, view, size])

  const labels = useMemo(() => {
    const placed: Array<{ x: number; y: number; w: number; h: number }> = []
    const result: Array<{ key: string; x: number; y: number; text: string; strong: boolean }> = []
    const consider = (stop: StopPoint, strong: boolean): void => {
      if (!stop.name) return
      const [sx, sy] = toScreen(stop.x, stop.y)
      if (sx < -50 || sy < -20 || sx > size.w + 50 || sy > size.h + 20) return
      const x = sx + signR + 5
      const y = sy + 4
      const box = { x, y: y - 11, w: stop.name.length * 5.7 + 6, h: 14 }
      if (placed.some((other) => overlaps(box, other))) return
      placed.push(box)
      result.push({ key: stop.id, x, y, text: stop.name, strong })
    }
    // Belangrijke namen eerst, zodat die het pleit winnen bij verdringing.
    if (start) consider(start, true)
    if (showRouteNames) for (const stop of routeStops) consider(stop, true)
    if (showOtherNames) for (const stop of otherStops) consider(stop, false)
    return result
  }, [start, routeStops, otherStops, showRouteNames, showOtherNames, toScreen, size, signR])

  /** Elke rit als lijn op het scherm: over de weg als de route er is, anders recht. */
  const legLines = useMemo(
    () =>
      legs.map((leg, legIndex) => {
        const route = routes?.[legIndex]?.points
        const points: Array<[number, number]> = []
        if (routeMode === 'none' || (routeMode === 'active' && legIndex !== activeLeg)) return points
        if (route && route.length >= 4) {
          for (let i = 0; i < route.length; i += 2) points.push(toScreen(route[i], route[i + 1]))
        } else {
          for (const stop of leg) points.push(toScreen(stop.x, stop.y))
        }
        return points
      }),
    [legs, routes, toScreen, routeMode, activeLeg]
  )

  /**
   * De stukken waar de planner geen weg vond. Daar staat een rechte lijn van
   * halte naar halte, en die snijdt dwars door het landschap; als gewone route
   * getekend lijkt het alsof de bus daar langs moet. Gestreept en gedempt leest
   * het als wat het is: onbekend.
   */
  const pieces = useMemo(() => {
    const solid: Array<{ key: string; line: Array<[number, number]> }> = []
    const guessed: Array<{ key: string; line: Array<[number, number]> }> = []
    legs.forEach((_leg, legIndex) => {
      const line = legLines[legIndex]
      if (line.length < 2) return
      const flags = routes?.[legIndex]?.guessed
      if (!flags || flags.length === 0) {
        solid.push({ key: `${legIndex}-heel`, line })
        return
      }
      // In stukken hakken op de overgang tussen gevonden en geraden.
      let from = 0
      for (let i = 1; i <= line.length - 1; i++) {
        const done = i === line.length - 1
        if (!done && Boolean(flags[i]) === Boolean(flags[from])) continue
        const piece = line.slice(from, done ? line.length : i + 1)
        if (piece.length > 1) {
          ;(flags[from] ? guessed : solid).push({ key: `${legIndex}-${from}`, line: piece })
        }
        from = i
      }
    })
    return { solid, guessed }
  }, [legs, legLines, routes])

  /**
   * De route van de huidige rit gesneden op de plek van de bus: wat gereden is
   * en wat nog komt. Zo verdwijnt de lijn achter de bus, net als in een
   * navigatiesysteem.
   */
  const trail = useMemo(() => {
    if (activeLeg === undefined || progressAlong === undefined) return undefined
    const track = legTracks[activeLeg]
    if (!track || track.cumulative.length < 2) return undefined
    const { points, cumulative } = track
    const at = clamp(progressAlong, 0, cumulative[cumulative.length - 1])

    let k = 1
    while (k < cumulative.length - 1 && cumulative[k] < at) k++
    const cut = pointAlong(track, at)

    const done: Array<[number, number]> = []
    for (let i = 0; i < k; i++) done.push(toScreen(points[i * 2], points[i * 2 + 1]))
    done.push(toScreen(cut.x, cut.y))

    const ahead: Array<[number, number]> = [toScreen(cut.x, cut.y)]
    for (let i = k; i < cumulative.length; i++) ahead.push(toScreen(points[i * 2], points[i * 2 + 1]))

    return { done, ahead, at }
  }, [activeLeg, progressAlong, legTracks, toScreen])

/*
 * Hier stonden pijltjes langs de lijn die de rijrichting aangaven. Ze zijn eruit:
 * op een kaart die met je meedraait wijst de bus zelf al vooruit, en de lijn
 * achter je verdwijnt, dus de richting stond er twee keer te veel bij.
 */

  const hoveredStop = hovered ? byId.get(hovered) : undefined
  const scaleBar = niceScale(view.mpp, big ? 140 : 90)

  return (
    <div className={`route-map ${big ? 'route-map-full' : ''}`} ref={boxRef}>
      <canvas ref={canvasRef} className="route-roads" aria-hidden="true" />
      <svg
        ref={svgRef}
        className="route-canvas"
        data-hit
        viewBox={`0 0 ${size.w} ${size.h}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        role="img"
        aria-label={`Kaart van de route, vertrek bij ${start?.name ?? 'onbekend'}`}
      >
        {/*
          * Eerst de ritten die nu niet aan de beurt zijn en daarna de huidige:
          * in SVG bepaalt de volgorde in de DOM wat bovenop ligt.
          */}
        {legs
          .map((leg, index) => ({ leg, index }))
          .filter(({ index }) => legLines[index].length >= 2)
          .sort((a, b) => rank(a.index, activeLeg) - rank(b.index, activeLeg))
          .map(({ leg, index }) => {
            const other = activeLeg !== undefined && index !== activeLeg
            const done = passedBefore >= 0 && leg[leg.length - 1].order < passedBefore
            // De rit waar je op zit: het gereden stuk grijs, de rest in kleur.
            if (!other && trail && index === activeLeg) {
              return (
                <g key={index}>
                  <g className="route-done">
                    <polyline className="route-casing" points={asPoints(trail.done)} />
                    <polyline className="route-line" points={asPoints(trail.done)} />
                  </g>
                  <polyline className="route-casing" points={asPoints(trail.ahead)} />
                  <polyline className="route-line" points={asPoints(trail.ahead)} />
                </g>
              )
            }
            return (
              <g key={index} className={other ? 'route-other' : done ? 'route-done' : undefined}>
                {pieces.solid
                  .filter((piece) => piece.key.startsWith(`${index}-`))
                  .map((piece) => (
                    <g key={piece.key}>
                      <polyline className="route-casing" points={asPoints(piece.line)} />
                      <polyline className="route-line" points={asPoints(piece.line)} />
                    </g>
                  ))}
              </g>
            )
          })}

        {/* De stukken zonder gevonden weg: gestreept, zodat ze niet als route lezen. */}
        {pieces.guessed.map((piece) => (
          <polyline key={`gok-${piece.key}`} className="route-guess" points={asPoints(piece.line)} />
        ))}

        {otherStops.map((stop) => {
          const [x, y] = toScreen(stop.x, stop.y)
          return (
            <circle
              key={stop.id}
              className="map-other"
              cx={x}
              cy={y}
              r={2.4}
              onPointerEnter={() => setHovered(stop.id)}
              onPointerLeave={() => setHovered(undefined)}
            />
          )
        })}

        {routeStops.map((stop) => {
          const [x, y] = toScreen(stop.x, stop.y)
          if (x < -40 || y < -40 || x > size.w + 40 || y > size.h + 40) return null
          const dim = passedStops.get(stop.id) === true
          const next = stop.id === nextStopId
          return (
            <StopSign
              key={stop.id}
              x={x}
              y={y}
              r={stop.isStart ? Math.max(signR, 6) + 2 : signR}
              dim={dim}
              ahead={!dim}
              next={next}
              letter={showLetter}
              onEnter={() => setHovered(stop.id)}
              onLeave={() => setHovered(undefined)}
            />
          )
        })}

        {start &&
          !busPoint &&
          !liveBus &&
          (() => {
            const [x, y] = toScreen(start.x, start.y)
            return <circle className="map-start-halo" cx={x} cy={y} r={Math.max(signR, 6) + 11} />
          })()}

        {(liveBus ?? busPoint) &&
          (() => {
            const point = liveBus
              ? { x: liveBus.x, y: liveBus.y, heading: liveBus.heading }
              : { x: busPoint!.x, y: busPoint!.y, heading: (Math.atan2(busPoint!.dx, busPoint!.dy) * 180) / Math.PI }
            const [x, y] = toScreen(point.x, point.y)
            // Op het scherm telt de koers min de draaiing van de kaart.
            const angle = point.heading - view.rot
            return (
              <g className="map-bus" transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
                <circle className="bus-halo" r={15} />
                <path className="bus-arrow" d="M0 -10 L7.5 7.5 L0 3.5 L-7.5 7.5 Z" transform={`rotate(${angle.toFixed(1)})`} />
              </g>
            )
          })()}

        {labels.map((label) => (
          <text
            key={label.key}
            className={label.strong ? 'map-label map-label-strong' : 'map-label'}
            x={label.x}
            y={label.y}
          >
            {label.text}
          </text>
        ))}

        {hoveredStop && !labels.some((label) => label.key === hoveredStop.id) && (
          <text
            className="map-label map-label-strong"
            x={toScreen(hoveredStop.x, hoveredStop.y)[0] + signR + 5}
            y={toScreen(hoveredStop.x, hoveredStop.y)[1] + 4}
          >
            {hoveredStop.name}
          </text>
        )}

        <g className="map-scale" transform={`translate(12 ${size.h - 14})`}>
          <line x1={0} y1={0} x2={scaleBar.px} y2={0} />
          <line x1={0} y1={-4} x2={0} y2={4} />
          <line x1={scaleBar.px} y1={-4} x2={scaleBar.px} y2={4} />
          <text x={scaleBar.px + 6} y={4}>
            {scaleBar.label}
          </text>
        </g>
      </svg>

      {/* data-hit: in de overlay laten alleen zulke plekken de muis niet door naar het spel. */}
      <div className="map-tools" data-hit>
        <button type="button" onClick={() => zoomBy(1 / 1.6)} aria-label={tr('map.zoomIn')}>
          +
        </button>
        <button type="button" onClick={() => zoomBy(1.6)} aria-label={tr('map.zoomOut')}>
          −
        </button>
        {bus || vehicle ? (
          <button
            type="button"
            onClick={() => centreOnBus(true)}
            aria-label={texts?.centre}
            title={texts?.centre}
          >
            ◎
          </button>
        ) : (
          <button type="button" onClick={refit} aria-label={tr('map.fit')}>
            ⤢
          </button>
        )}
      </div>

      {routeMode === 'none' && texts?.waiting && <div className="map-note">{texts.waiting}</div>}
      {busPoint && !liveBus && texts?.busNote && <div className="map-note map-note-quiet">{texts.busNote}</div>}
    </div>
  )
}

/** Een route met de afstand langs de lijn bij elk punt, en bij elke halte. */
interface Track {
  points: number[]
  cumulative: number[]
  /** Afstand langs de route bij elke halte van de rit; leeg als die halte niet op de kaart staat. */
  stops: Array<number | undefined>
}

/**
 * Legt de haltes op de route. Een rit komt vaak twee keer door dezelfde straat,
 * dus elke halte wordt pas gezocht voorbij de vorige; anders springt de bus
 * terug naar het eerste stuk.
 */
function trackAlong(points: number[], stops: Array<StopPoint | undefined>): Track {
  const cumulative = [0]
  for (let i = 2; i < points.length; i += 2) {
    cumulative.push(cumulative[cumulative.length - 1] + Math.hypot(points[i] - points[i - 2], points[i + 1] - points[i - 1]))
  }
  const found: Array<number | undefined> = []
  let from = 0
  for (const stop of stops) {
    if (!stop) {
      found.push(undefined)
      continue
    }
    let best = Infinity
    let bestAlong = from
    for (let k = 1; k < cumulative.length; k++) {
      if (cumulative[k] < from) continue
      const ax = points[(k - 1) * 2]
      const ay = points[(k - 1) * 2 + 1]
      const vx = points[k * 2] - ax
      const vy = points[k * 2 + 1] - ay
      const len2 = vx * vx + vy * vy
      const t = len2 > 0 ? clamp(((stop.x - ax) * vx + (stop.y - ay) * vy) / len2, 0, 1) : 0
      const along = cumulative[k - 1] + Math.sqrt(len2) * t
      if (along < from) continue
      const distance = Math.hypot(stop.x - (ax + vx * t), stop.y - (ay + vy * t))
      if (distance < best) {
        best = distance
        bestAlong = along
      }
    }
    found.push(bestAlong)
    from = bestAlong
  }
  return { points, cumulative, stops: found }
}

/**
 * Waar een punt in de wereld op de route valt, gezocht vanaf `from`. Die
 * ondergrens is er omdat een rit dezelfde straat vaak twee keer aandoet.
 */
function nearestAlong(track: Track, x: number, y: number, from: number): number {
  const { points, cumulative } = track
  let best = Infinity
  let bestAlong = from
  for (let k = 1; k < cumulative.length; k++) {
    if (cumulative[k] < from) continue
    const ax = points[(k - 1) * 2]
    const ay = points[(k - 1) * 2 + 1]
    const vx = points[k * 2] - ax
    const vy = points[k * 2 + 1] - ay
    const len2 = vx * vx + vy * vy
    const t = len2 > 0 ? clamp(((x - ax) * vx + (y - ay) * vy) / len2, 0, 1) : 0
    const along = cumulative[k - 1] + Math.sqrt(len2) * t
    if (along < from) continue
    const distance = Math.hypot(x - (ax + vx * t), y - (ay + vy * t))
    if (distance < best) {
      best = distance
      bestAlong = along
    }
  }
  return bestAlong
}

/** Schermpunten als `points`-tekenreeks voor een polyline. */
function asPoints(line: Array<[number, number]>): string {
  return line.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
}

/** Het punt op een afstand langs de route, met de rijrichting daar. */
function pointAlong(track: Track, along: number): { x: number; y: number; dx: number; dy: number } {
  const { points, cumulative } = track
  const distance = clamp(along, 0, cumulative[cumulative.length - 1])
  let low = 1
  let high = cumulative.length - 1
  while (low < high) {
    const mid = (low + high) >> 1
    if (cumulative[mid] < distance) low = mid + 1
    else high = mid
  }
  const k = low
  const span = cumulative[k] - cumulative[k - 1]
  const t = span > 0 ? (distance - cumulative[k - 1]) / span : 0
  const ax = points[(k - 1) * 2]
  const ay = points[(k - 1) * 2 + 1]
  const dx = points[k * 2] - ax
  const dy = points[k * 2 + 1] - ay
  return { x: ax + dx * t, y: ay + dy * t, dx, dy }
}

/**
 * Het Duitse haltebord: een geel rond bord met een groene H. Precies wat er in
 * het spel langs de weg staat, dus je herkent waar je moet zijn.
 */
function StopSign({
  x,
  y,
  r,
  dim,
  ahead,
  next,
  letter,
  onEnter,
  onLeave
}: {
  x: number
  y: number
  r: number
  /** Al voorbij: grijs. */
  dim: boolean
  /** Komt nog: groen, zodat je in een oogopslag ziet wat er nog ligt. */
  ahead: boolean
  next: boolean
  letter: boolean
  onEnter(): void
  onLeave(): void
}): JSX.Element {
  return (
    <g
      className={`stop-sign ${dim ? 'stop-done' : ''} ${ahead ? 'stop-ahead' : ''} ${next ? 'stop-next' : ''}`}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
    >
      {/* De gloed hoort achter het bord; groen voor wat nog komt. */}
      {ahead && <circle className="sign-glow" cx={x} cy={y} r={r + 3.5} strokeWidth={r * 0.55} />}
      {next && <circle className="sign-next-ring" cx={x} cy={y} r={r + 5} />}
      <circle className="sign-face" cx={x} cy={y} r={r} />
      <circle className="sign-ring" cx={x} cy={y} r={r - 1.2} />
      {letter && (
        <text className="sign-h" x={x} y={y} fontSize={r * 1.3}>
          H
        </text>
      )}
    </g>
  )
}

/** De rit die aan de beurt is komt als laatste, dus bovenop. */
function rank(index: number, active?: number): number {
  return active !== undefined && index === active ? 1 : 0
}

/** Een verschuiving op het (gedraaide) scherm terug naar kaartrichtingen; x rechts, y omhoog. */
function unrotate(sx: number, sy: number, rotation: number): [number, number] {
  const r = (rotation * Math.PI) / 180
  return [sx * Math.cos(r) + sy * Math.sin(r), -sx * Math.sin(r) + sy * Math.cos(r)]
}

/** Kortste draai van koers `from` naar `to`, in graden tussen -180 en 180. */
function turn(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}

function overlaps(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number }
): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

/** Een ronde maat voor de schaalbalk: 25 m, 50 m, 100 m, 250 m, 500 m, 1 km, … */
export function niceScale(mpp: number, aim: number): { px: number; label: string } {
  const target = mpp * aim
  const steps = [25, 50, 100, 250, 500, 1000, 2000, 5000]
  // Een half procent speling: anders kost een rekenkruimel een hele maat.
  const metres = steps.find((step) => step >= target * 0.995) ?? steps[steps.length - 1]
  return {
    px: metres / mpp,
    label: metres >= 1000 ? `${metres / 1000} km` : `${metres} m`
  }
}
