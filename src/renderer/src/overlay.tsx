import { useCallback, useEffect, useRef, useState, type JSX, type PointerEvent } from 'react'
import { createRoot } from 'react-dom/client'
import type { MapGeometry } from '../../core/geo'
import type { LiveStatus } from '../../core/live'
import type { Duty, DutyLeg } from '../../core/types'
import type { CareerApi } from '../../shared/api'
import { formatTime } from '../../shared/format'
import { WIDGETS, type OverlayLayout, type WidgetId, type WidgetInfo } from '../../shared/overlay'
import { RouteMap } from './RouteMap'
import './overlay.css'

interface Frame {
  status?: LiveStatus
  duty?: Duty
  /** Draait OMSI met onze plugin? */
  connected: boolean
  /** In de bewerkstand neemt de overlay muisklikken aan. */
  editing: boolean
}

declare global {
  interface Window {
    overlay: { onFrame(handler: (frame: Frame) => void): void }
    career: CareerApi
  }
}

function Overlay(): JSX.Element | null {
  const [frame, setFrame] = useState<Frame>({ connected: false, editing: false })
  const [layout, setLayout] = useState<OverlayLayout>()
  const [geometry, setGeometry] = useState<MapGeometry>()

  useEffect(() => {
    window.overlay.onFrame(setFrame)
    void window.career.overlayLayout().then(setLayout)
  }, [])

  const { status, duty, editing } = frame

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
  const change = useCallback((id: WidgetId, patch: Partial<OverlayLayout[WidgetId]>) => {
    setLayout((old) => {
      if (!old) return old
      const next = { ...old, [id]: { ...old[id], ...patch } }
      clearTimeout(timer.current)
      timer.current = setTimeout(() => void window.career.saveOverlayLayout(next), 400)
      return next
    })
  }, [])

  if (!layout) return null

  const nextStopId = upcomingStopId(status)

  return (
    <div className={editing ? 'stage editing' : 'stage'}>
      {WIDGETS.map((info) => {
        const state = layout[info.id]
        if (!state.visible) return null
        if (!editing && isEmpty(info.id, frame)) return null
        return (
          <Widget
            key={info.id}
            info={info}
            state={state}
            editing={editing}
            onChange={(patch) => change(info.id, patch)}
          >
            <Content id={info.id} frame={frame} geometry={geometry} nextStopId={nextStopId} />
          </Widget>
        )
      })}

      {editing && (
        <EditBar
          layout={layout}
          onShow={(id) => change(id, { visible: true, collapsed: false })}
          onReset={() => void window.career.resetOverlayLayout().then(setLayout)}
        />
      )}
    </div>
  )
}

/**
 * Een venster in de overlay: te verslepen, groter te maken en dicht te klappen.
 *
 * Buiten de bewerkstand heeft het geen randversiering; dan is het gewoon de
 * inhoud, want tijdens het rijden wil je geen titelbalken zien.
 */
function Widget({
  info,
  state,
  editing,
  onChange,
  children
}: {
  info: WidgetInfo
  state: OverlayLayout[WidgetId]
  editing: boolean
  onChange(patch: Partial<OverlayLayout[WidgetId]>): void
  children: JSX.Element | null
}): JSX.Element {
  const drag = useRef<{ x: number; y: number; ox: number; oy: number }>(undefined)
  const size = useRef<{ x: number; y: number; w: number; h: number }>(undefined)

  const startDrag = (event: PointerEvent<HTMLElement>): void => {
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { x: event.clientX, y: event.clientY, ox: state.x, oy: state.y }
  }

  const startSize = (event: PointerEvent<HTMLElement>): void => {
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    size.current = { x: event.clientX, y: event.clientY, w: state.w, h: state.h }
  }

  const move = (event: PointerEvent<HTMLElement>): void => {
    if (drag.current) {
      const { x, y, ox, oy } = drag.current
      onChange({
        x: clamp(ox + event.clientX - x, 0, window.innerWidth - 60),
        y: clamp(oy + event.clientY - y, 0, window.innerHeight - 40)
      })
    } else if (size.current) {
      const { x, y, w, h } = size.current
      onChange({
        w: Math.max(info.minW, w + event.clientX - x),
        h: info.fixedHeight ? state.h : Math.max(info.minH, h + event.clientY - y)
      })
    }
  }

  const stop = (): void => {
    drag.current = undefined
    size.current = undefined
  }

  return (
    <section
      className={`widget widget-${info.id} ${state.collapsed ? 'shut' : ''}`}
      style={{
        left: state.x,
        top: state.y,
        width: state.w,
        height: state.collapsed || info.fixedHeight ? undefined : state.h
      }}
      onPointerMove={move}
      onPointerUp={stop}
      onPointerCancel={stop}
    >
      {(editing || state.collapsed) && (
        <header className="widget-bar" onPointerDown={editing ? startDrag : undefined}>
          <button
            type="button"
            className="widget-shut"
            title={state.collapsed ? 'Openklappen' : 'Dichtklappen'}
            onClick={() => onChange({ collapsed: !state.collapsed })}
          >
            {state.collapsed ? '▸' : '▾'}
          </button>
          <span className="widget-title">{info.title}</span>
          {editing && (
            <button
              type="button"
              className="widget-hide"
              title="Uitzetten"
              onClick={() => onChange({ visible: false })}
            >
              ✕
            </button>
          )}
        </header>
      )}

      {!state.collapsed && <div className="widget-body">{children}</div>}

      {editing && !state.collapsed && (
        <span
          className="widget-grip"
          title={info.fixedHeight ? 'Breder of smaller' : 'Groter of kleiner'}
          onPointerDown={startSize}
        />
      )}
    </section>
  )
}

/** De balk die alleen in de bewerkstand verschijnt. */
function EditBar({
  layout,
  onShow,
  onReset
}: {
  layout: OverlayLayout
  onShow(id: WidgetId): void
  onReset(): void
}): JSX.Element {
  const hidden = WIDGETS.filter((info) => !layout[info.id].visible)
  return (
    <div className="editbar">
      <b>Overlay aanpassen</b>
      <span className="editbar-hint">
        sleep aan de balk, trek aan de hoek, ▾ klapt dicht — Ctrl+Alt+O sluit dit
      </span>

      {hidden.length > 0 && (
        <div className="editbar-add">
          <span>Uitgezet:</span>
          {hidden.map((info) => (
            <button key={info.id} type="button" title={info.hint} onClick={() => onShow(info.id)}>
              + {info.title}
            </button>
          ))}
        </div>
      )}

      <div className="editbar-buttons">
        <button type="button" onClick={onReset}>
          Standaard herstellen
        </button>
        <button type="button" className="done" onClick={() => void window.career.editOverlay(false)}>
          Klaar
        </button>
      </div>
    </div>
  )
}

/** Wat er in elk venster staat. */
function Content({
  id,
  frame,
  geometry,
  nextStopId
}: {
  id: WidgetId
  frame: Frame
  geometry?: MapGeometry
  nextStopId?: string
}): JSX.Element | null {
  const { status, duty, connected } = frame
  const leg = status?.leg

  if (id === 'klok') {
    if (!status) {
      return (
        <div className="waiting">
          <span className="dot" /> {connected ? 'Geen gegevens' : 'Wacht op OMSI…'}
        </div>
      )
    }
    const late = status.delayMinutes >= 1
    return (
      <div className="clockrow">
        <span className="clock">{formatTime(status.clockMinutes)}</span>
        {leg && <span className="line">{leg.lineNumber}</span>}
        <span className={`delay ${late ? 'late' : 'ontime'}`}>
          {late ? `+${Math.round(status.delayMinutes)} min` : 'op tijd'}
          {status.delayFromIbis ? '' : '*'}
        </span>
      </div>
    )
  }

  if (id === 'rit') {
    if (status?.dutyComplete) {
      return (
        <div className="row">
          <span className="value">Dienst uitgereden</span>
          <span className="sub">rond hem af in de app</span>
        </div>
      )
    }
    if (!leg) return <div className="row empty">geen rit voor dit tijdstip</div>
    return (
      <div className="row">
        <span className="label">Naar</span>
        <span className="value">{leg.terminus}</span>
        <span className="sub">
          aankomst {formatTime(leg.arrival)}
          {duty && status ? ` · rit ${status.legIndex + 1} van ${duty.legs.length}` : ''}
        </span>
      </div>
    )
  }

  if (id === 'navigatie') {
    if (!leg || !status) return <div className="row empty">nog geen rit</div>
    return <NextStops leg={leg} status={status} />
  }

  if (id === 'kaart') {
    if (!duty || !geometry) return <div className="row empty">kaart wordt geladen…</div>
    return (
      <RouteMap
        duty={duty}
        geometry={geometry}
        nextStopId={nextStopId}
        focusStopId={nextStopId}
      />
    )
  }

  if (id === 'meters') {
    if (!status) return <div className="row empty">—</div>
    return (
      <div className="grid">
        <div>
          <b>{status.passengers}</b>
          <span>aan boord</span>
        </div>
        <div>
          <b>{Math.round(status.speedKmh)}</b>
          <span>km/u</span>
        </div>
        <div className={status.hasPassengers ? `mood mood-${Math.round(status.mood * 4)}` : 'mood'}>
          <b>{status.moodLabel}</b>
          <span>stemming</span>
        </div>
      </div>
    )
  }

  if (id === 'rijstijl') {
    if (!status) return <div className="row empty">—</div>
    if (status.harshBrakes === 0 && status.harshAccels === 0) {
      return <div className="counters">geen ruwe bewegingen</div>
    }
    return (
      <div className="counters">
        {status.harshBrakes > 0 && <span>{status.harshBrakes}× hard geremd</span>}
        {status.harshAccels > 0 && <span>{status.harshAccels}× hard opgetrokken</span>}
      </div>
    )
  }

  // advies
  if (!status) return <div className="row empty">—</div>
  return (
    <>
      {(status.entryRequest || status.exitRequest) && (
        <div className="request">
          {status.entryRequest ? 'Iemand wil instappen' : 'Iemand wil uitstappen'}
        </div>
      )}
      {status.advice.map((item) => (
        <div key={item.id} className={`advice ${item.severity}`}>
          {item.text}
        </div>
      ))}
      {status.advice.length === 0 && !status.entryRequest && !status.exitRequest && (
        <div className="row empty">niets te melden</div>
      )}
    </>
  )
}

/**
 * De haltes die nog komen, als een lijndiagram.
 *
 * Waar je bent komt uit de IBIS; die vult zich pas als de lijn en route zijn
 * ingetoetst. Zolang dat niet is gebeurd staat de hele rit er gewoon, vanaf het
 * begin — dan weet je tenminste wat er aankomt.
 */
function NextStops({ leg, status }: { leg: DutyLeg; status: LiveStatus }): JSX.Element {
  const total = leg.stops.length
  const known = status.reportsStops && status.stopIndex !== undefined
  const passed = known ? Math.min(Math.max(status.stopIndex ?? 0, 0), total) : 0

  // Eentje terug geeft richting; verder vooruit past niet in de cabine.
  const from = Math.max(0, passed - 1)
  const shown = leg.stops.slice(from, from + 6)
  const left = total - (from + shown.length)

  return (
    <div className="nav">
      <div className="nav-head">
        <span className="label">Halte</span>{' '}
        {known ? (
          <span className="sub">
            nog {Math.max(0, total - passed)} van {total}
          </span>
        ) : (
          <span className="sub">
            {status.offersStops
              ? 'toets lijn en route in op de IBIS, dan volgt de kaart mee'
              : 'deze bus geeft geen halte door — dit is de hele rit'}
          </span>
        )}
      </div>

      <ol className="strip">
        {shown.map((name, index) => {
          const at = from + index
          const state = !known ? 'ahead' : at < passed ? 'done' : at === passed ? 'now' : 'ahead'
          return (
            <li key={`${at}-${name}`} className={`stop ${state}`}>
              <span className="pin" />
              <span className="name">{name}</span>
              {at === total - 1 && <span className="tag">eindpunt</span>}
            </li>
          )
        })}
      </ol>

      {left > 0 && (
        <div className="nav-rest">
          en nog {left} verder naar {leg.terminus}
        </div>
      )}
    </div>
  )
}

/** Het id van de halte waar de bus nu heen rijdt, als de IBIS dat prijsgeeft. */
function upcomingStopId(status?: LiveStatus): string | undefined {
  if (!status?.leg || !status.reportsStops || status.stopIndex === undefined) return undefined
  return status.leg.stopIds[Math.min(Math.max(status.stopIndex, 0), status.leg.stopIds.length - 1)]
}

/**
 * Vensters die niets te vertellen hebben, blijven onder het rijden weg. In de
 * bewerkstand staan ze er wel, anders kun je ze niet neerzetten.
 */
function isEmpty(id: WidgetId, frame: Frame): boolean {
  const { status } = frame
  if (!status) return id !== 'klok'
  if (id === 'advies') {
    return status.advice.length === 0 && !status.entryRequest && !status.exitRequest
  }
  if (id === 'rijstijl') return status.harshBrakes === 0 && status.harshAccels === 0
  return false
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}

createRoot(document.getElementById('root')!).render(<Overlay />)
