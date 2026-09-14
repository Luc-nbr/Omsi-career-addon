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
import type { Duty } from '../../core/types'
import { useT } from './language'
import './routemap.css'

/** Een halte zoals hij op de route voorkomt, met zijn plek in de volgorde. */
export interface RouteStop extends StopPoint {
  /** Hoeveelste halte van de hele dienst, over de ritten heen. */
  order: number
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

export function RouteMap({
  duty,
  geometry,
  nextStopId,
  variant = 'panel',
  focusStopId,
  follow,
  activeLeg
}: Props): JSX.Element {
  const tr = useT()
  const boxRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ w: 640, h: 320 })
  const [view, setView] = useState<View>({ cx: 0, cy: 0, mpp: 8 })
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

  const following = Boolean(follow?.toId)

  const fitted = useRef<string>('')
  useEffect(() => {
    // Rijdt de kaart mee, dan bepaalt het stuk weg het beeld en niet de dienst.
    if (following) return
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
      )
    })
  }, [duty.tourNumber, bounds, size, following])

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
      )
    })
  }, [follow?.fromId, follow?.toId, byId, size])

  // Een halte die elders is aangewezen halen we in beeld.
  useEffect(() => {
    if (!focusStopId) return
    const stop = byId.get(focusStopId)
    if (stop) setView((old) => ({ cx: stop.x, cy: stop.y, mpp: Math.min(old.mpp, 1.6) }))
  }, [focusStopId, byId])

  // React luistert standaard passief naar het wieltje, dus zelf aanhaken —
  // anders scrollt de pagina mee terwijl je inzoomt.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault()
      const rect = svg.getBoundingClientRect()
      const px = event.clientX - rect.left
      const py = event.clientY - rect.top
      setView((old) => {
        const next = clamp(old.mpp * Math.exp(event.deltaY * 0.0012), MIN_MPP, MAX_MPP)
        // Het punt onder de muis blijft staan waar het staat.
        const wx = old.cx + (px - size.w / 2) * old.mpp
        const wy = old.cy - (py - size.h / 2) * old.mpp
        return {
          mpp: next,
          cx: wx - (px - size.w / 2) * next,
          cy: wy + (py - size.h / 2) * next
        }
      })
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [size])

  const toScreen = useCallback(
    (x: number, y: number): [number, number] => [
      size.w / 2 + (x - view.cx) / view.mpp,
      size.h / 2 - (y - view.cy) / view.mpp
    ],
    [size, view]
  )

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>): void => {
    ;(event.target as Element).setPointerCapture?.(event.pointerId)
    dragRef.current = { x: event.clientX, y: event.clientY, cx: view.cx, cy: view.cy }
  }

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>): void => {
    const drag = dragRef.current
    if (!drag) return
    setView((old) => ({
      ...old,
      cx: drag.cx - (event.clientX - drag.x) * old.mpp,
      cy: drag.cy + (event.clientY - drag.y) * old.mpp
    }))
  }

  const endDrag = (): void => {
    dragRef.current = undefined
  }

  const zoomBy = (factor: number): void =>
    setView((old) => ({ ...old, mpp: clamp(old.mpp * factor, MIN_MPP, MAX_MPP) }))

  const refit = (): void => {
    fitted.current = ''
    setSize((old) => ({ ...old }))
  }

  /* Het wegennet staat in wereldcoördinaten in een groep die geschaald wordt;
   * dan hoeft er bij het slepen geen enkel pad opnieuw gerekend te worden. */
  const roadPaths = useMemo(() => {
    const parts: Record<string, string[]> = { road: [], rail: [] }
    for (const line of geometry.roads) {
      const bucket = parts[line.kind]
      if (!bucket) continue
      let d = `M${line.points[0].toFixed(1)} ${line.points[1].toFixed(1)}`
      for (let i = 2; i < line.points.length; i += 2) {
        d += `L${line.points[i].toFixed(1)} ${line.points[i + 1].toFixed(1)}`
      }
      bucket.push(d)
    }
    return { road: parts.road.join(''), rail: parts.rail.join('') }
  }, [geometry])

  const k = 1 / view.mpp
  const worldTransform = `translate(${size.w / 2 - view.cx * k} ${size.h / 2 + view.cy * k}) scale(${k} ${-k})`
  // Wegbreedte in meters, maar nooit zo dun dat de lijn verdwijnt.
  const roadWidth = Math.max(7, view.mpp * 1.1)
  const railWidth = Math.max(3, view.mpp * 0.7)

  /** Hoever de dienst gevorderd is, als volgnummer van de eerstvolgende halte. */
  const passedBefore = useMemo(() => {
    if (!nextStopId) return -1
    for (const leg of legs) for (const stop of leg) if (stop.id === nextStopId) return stop.order
    return -1
  }, [legs, nextStopId])

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
    const marginX = (size.w / 2) * view.mpp + 100
    const marginY = (size.h / 2) * view.mpp + 100
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

  /** Pijltjes die laten zien welke kant je op rijdt, alleen op de huidige rit. */
  const arrows = useMemo(() => {
    const found: Array<{ key: string; x: number; y: number; angle: number }> = []
    legs.forEach((leg, legIndex) => {
      if (activeLeg !== undefined && legIndex !== activeLeg) return
      for (let i = 1; i < leg.length; i++) {
        const [ax, ay] = toScreen(leg[i - 1].x, leg[i - 1].y)
        const [bx, by] = toScreen(leg[i].x, leg[i].y)
        const span = Math.hypot(bx - ax, by - ay)
        if (span < 64) continue
        const steps = Math.min(3, Math.floor(span / 90))
        for (let s = 1; s <= steps; s++) {
          const t = s / (steps + 1)
          found.push({
            key: `${legIndex}-${i}-${s}`,
            x: ax + (bx - ax) * t,
            y: ay + (by - ay) * t,
            angle: (Math.atan2(by - ay, bx - ax) * 180) / Math.PI
          })
        }
      }
    })
    return found
  }, [legs, toScreen, activeLeg])

  const hoveredStop = hovered ? byId.get(hovered) : undefined
  const scaleBar = niceScale(view.mpp, big ? 140 : 90)

  return (
    <div className={`route-map ${big ? 'route-map-full' : ''}`} ref={boxRef}>
      <svg
        ref={svgRef}
        className="route-canvas"
        viewBox={`0 0 ${size.w} ${size.h}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        role="img"
        aria-label={`Kaart van de route, vertrek bij ${start?.name ?? 'onbekend'}`}
      >
        <g transform={worldTransform}>
          <path className="map-rail" d={roadPaths.rail} strokeWidth={railWidth} />
          <path className="map-road-casing" d={roadPaths.road} strokeWidth={roadWidth + 2.5} />
          <path className="map-road" d={roadPaths.road} strokeWidth={roadWidth} />
        </g>

        {/*
          * Eerst de ritten die nu niet aan de beurt zijn en daarna de huidige:
          * in SVG bepaalt de volgorde in de DOM wat bovenop ligt.
          */}
        {legs
          .map((leg, index) => ({ leg, index }))
          .filter(({ leg }) => leg.length >= 2)
          .sort((a, b) => rank(a.index, activeLeg) - rank(b.index, activeLeg))
          .map(({ leg, index }) => {
            const points = leg.map((stop) => toScreen(stop.x, stop.y).join(',')).join(' ')
            const other = activeLeg !== undefined && index !== activeLeg
            const done = passedBefore >= 0 && leg[leg.length - 1].order < passedBefore
            return (
              <g key={index} className={other ? 'route-other' : done ? 'route-done' : undefined}>
                <polyline className="route-casing" points={points} />
                <polyline className="route-line" points={points} />
              </g>
            )
          })}

        {arrows.map((arrow) => (
          <path
            key={arrow.key}
            className="route-arrow"
            d="M-3.5 -3.6 L4.5 0 L-3.5 3.6 Z"
            transform={`translate(${arrow.x.toFixed(1)} ${arrow.y.toFixed(1)}) rotate(${arrow.angle.toFixed(1)})`}
          />
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
          const dim = passedBefore >= 0 && stop.order < passedBefore
          const next = stop.id === nextStopId
          return (
            <StopSign
              key={stop.id}
              x={x}
              y={y}
              r={stop.isStart ? Math.max(signR, 6) + 2 : signR}
              dim={dim}
              next={next}
              letter={showLetter}
              onEnter={() => setHovered(stop.id)}
              onLeave={() => setHovered(undefined)}
            />
          )
        })}

        {start &&
          (() => {
            const [x, y] = toScreen(start.x, start.y)
            return <circle className="map-start-halo" cx={x} cy={y} r={Math.max(signR, 6) + 11} />
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

      <div className="map-tools">
        <button type="button" onClick={() => zoomBy(1 / 1.6)} aria-label={tr('map.zoomIn')}>
          +
        </button>
        <button type="button" onClick={() => zoomBy(1.6)} aria-label={tr('map.zoomOut')}>
          −
        </button>
        <button type="button" onClick={refit} aria-label={tr('map.fit')}>
          ⤢
        </button>
      </div>
    </div>
  )
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
  next,
  letter,
  onEnter,
  onLeave
}: {
  x: number
  y: number
  r: number
  dim: boolean
  next: boolean
  letter: boolean
  onEnter(): void
  onLeave(): void
}): JSX.Element {
  return (
    <g
      className={`stop-sign ${dim ? 'stop-done' : ''} ${next ? 'stop-next' : ''}`}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
    >
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

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}

function overlaps(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number }
): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

/** Een ronde maat voor de schaalbalk: 50 m, 100 m, 250 m, 500 m, 1 km, … */
function niceScale(mpp: number, aim: number): { px: number; label: string } {
  const target = mpp * aim
  const steps = [25, 50, 100, 250, 500, 1000, 2000, 5000]
  const metres = steps.find((step) => step >= target) ?? steps[steps.length - 1]
  return {
    px: metres / mpp,
    label: metres >= 1000 ? `${metres / 1000} km` : `${metres} m`
  }
}
