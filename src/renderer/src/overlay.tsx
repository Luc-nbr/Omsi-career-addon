import { useCallback, useEffect, useRef, useState, type JSX, type PointerEvent } from 'react'
import { createRoot } from 'react-dom/client'
import type { MapGeometry } from '../../core/geo'
import type { LiveStatus } from '../../core/live'
import type { Duty, DutyLeg } from '../../core/types'
import type { CareerApi } from '../../shared/api'
import { formatTime } from '../../shared/format'
import {
  DETAIL_NAMES,
  PANELS,
  nextDetail,
  type DetailLevel,
  type OverlayLayout,
  type PanelId,
  type PanelInfo
} from '../../shared/overlay'
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
    overlay: {
      onFrame(handler: (frame: Frame) => void): void
      /** De sneltoets klapt het paneel een stand verder. */
      onCycle(handler: () => void): void
    }
    career: CareerApi
  }
}

function Overlay(): JSX.Element | null {
  const [frame, setFrame] = useState<Frame>({ connected: false, editing: false })
  const [layout, setLayout] = useState<OverlayLayout>()
  const [geometry, setGeometry] = useState<MapGeometry>()

  const { status, duty, editing } = frame

  useEffect(() => {
    window.overlay.onFrame(setFrame)
    void window.career.overlayLayout().then(setLayout)
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

  if (!layout) return null

  const leg = status?.leg
  const passed = walkedStops(status)
  const toId = leg && passed !== undefined ? leg.stopIds[Math.min(passed, leg.stopIds.length - 1)] : undefined
  const fromId = leg && passed !== undefined && passed > 0 ? leg.stopIds[passed - 1] : undefined
  // Alleen meerijden als de bus werkelijk vertelt waar hij is.
  const follow = toId ? { fromId, toId } : undefined

  return (
    <div className={editing ? 'stage editing' : 'stage'}>
      {layout.dienst.visible && (
        <Panel
          info={PANELS[0]}
          state={layout.dienst}
          editing={editing}
          onChange={(patch) => move('dienst', patch)}
        >
          <DutyPanel frame={frame} detail={layout.detail} onCycle={cycle} />
        </Panel>
      )}

      {layout.navigatie.visible && (
        <Panel
          info={PANELS[1]}
          state={layout.navigatie}
          editing={editing}
          onChange={(patch) => move('navigatie', patch)}
        >
          {duty && geometry ? (
            <RouteMap
              duty={duty}
              geometry={geometry}
              nextStopId={toId}
              follow={follow}
              variant="panel"
            />
          ) : (
            <div className="empty">kaart wordt geladen…</div>
          )}
        </Panel>
      )}

      {editing && (
        <EditBar
          layout={layout}
          onShow={(id) => move(id, { visible: true })}
          onReset={() => void window.career.resetOverlayLayout().then(setLayout)}
        />
      )}
    </div>
  )
}

/** Een verplaatsbaar element. Slepen en verschalen kan in de bewerkstand. */
function Panel({
  info,
  state,
  editing,
  onChange,
  children
}: {
  info: PanelInfo
  state: OverlayLayout['dienst']
  editing: boolean
  onChange(patch: Partial<OverlayLayout['dienst']>): void
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

  const onMove = (event: PointerEvent<HTMLElement>): void => {
    if (drag.current) {
      const { x, y, ox, oy } = drag.current
      onChange({
        x: clamp(ox + event.clientX - x, 0, window.innerWidth - 80),
        y: clamp(oy + event.clientY - y, 0, window.innerHeight - 40)
      })
    } else if (size.current) {
      const { x, y, w, h } = size.current
      onChange({
        w: Math.max(info.minW, w + event.clientX - x),
        h: info.autoHeight ? state.h : Math.max(info.minH, h + event.clientY - y)
      })
    }
  }

  const stop = (): void => {
    drag.current = undefined
    size.current = undefined
  }

  return (
    <section
      className={`panel panel-${info.id}`}
      style={{ left: state.x, top: state.y, width: state.w, height: info.autoHeight ? undefined : state.h }}
      onPointerMove={onMove}
      onPointerUp={stop}
      onPointerCancel={stop}
    >
      {editing && (
        <header className="panel-bar" data-hit onPointerDown={startDrag}>
          <span className="panel-title">{info.title}</span>
          <button type="button" className="panel-hide" title="Uitzetten" onClick={() => onChange({ visible: false })}>
            ✕
          </button>
        </header>
      )}

      <div className="panel-body">{children}</div>

      {editing && (
        <span
          className="panel-grip"
          data-hit
          title={info.autoHeight ? 'Breder of smaller' : 'Groter of kleiner'}
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
  onCycle
}: {
  frame: Frame
  detail: DetailLevel
  onCycle(): void
}): JSX.Element {
  const { status, duty, connected } = frame
  const leg = status?.leg

  if (!status) {
    return (
      <div className="waiting">
        <span className="dot" /> {connected ? 'Geen gegevens' : 'Wacht op OMSI…'}
      </div>
    )
  }

  const late = status.delayMinutes >= 1
  const passed = walkedStops(status)
  const total = leg?.stops.length ?? 0

  return (
    <>
      <div className="topline">
        <span className="clock">{formatTime(status.clockMinutes)}</span>
        {leg && <span className="line">{leg.lineNumber}</span>}
        <span className={`delay ${late ? 'late' : 'ontime'}`}>
          {late ? `+${Math.round(status.delayMinutes)} min` : 'op tijd'}
          {status.delayFromIbis ? '' : '*'}
        </span>
        <button
          type="button"
          className="expand"
          data-hit
          title={`${DETAIL_NAMES[detail]} — uitklappen (Ctrl+Alt+V)`}
          onClick={onCycle}
        >
          <span className={`pips pips-${detail}`}>
            <i />
            <i />
            <i />
          </span>
        </button>
      </div>

      {status.dutyComplete ? (
        <div className="line-done">Dienst uitgereden — rond hem af in de app</div>
      ) : (
        <>
          {/* Beknopt: bestemming en volgende halte op een regel. */}
          {detail === 0 && leg && (
            <div className="tight">
              <span className="tight-stop">{stopName(leg, passed) ?? leg.terminus}</span>
              <span className="tight-rest">
                {status.passengers}p · {Math.round(status.speedKmh)} km/u
                {total > 0 && passed !== undefined ? ` · nog ${Math.max(0, total - passed)}` : ''}
              </span>
            </div>
          )}

          {detail > 0 && leg && (
            <div className="row">
              <span className="label">Naar</span>
              <span className="value">{leg.terminus}</span>
              <span className="sub">
                aankomst {formatTime(leg.arrival)}
                {duty ? ` · rit ${status.legIndex + 1} van ${duty.legs.length}` : ''}
              </span>
            </div>
          )}

          {detail === 1 && leg && (
            <div className="row">
              <span className="label">Volgende halte</span>
              <span className="value">{stopName(leg, passed) ?? '—'}</span>
              {passed !== undefined && total > 0 && (
                <span className="sub">nog {Math.max(0, total - passed)} van {total}</span>
              )}
            </div>
          )}

          {detail === 2 && leg && <NextStops leg={leg} status={status} />}

          {detail > 0 && (
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
          )}

          {detail === 2 && (status.harshBrakes > 0 || status.harshAccels > 0) && (
            <div className="counters">
              {status.harshBrakes > 0 && <span>{status.harshBrakes}× hard geremd</span>}
              {status.harshAccels > 0 && <span>{status.harshAccels}× hard opgetrokken</span>}
            </div>
          )}
        </>
      )}

      {(status.entryRequest || status.exitRequest) && (
        <div className="request">
          {status.entryRequest ? 'Iemand wil instappen' : 'Iemand wil uitstappen'}
        </div>
      )}

      {/* Waarschuwingen horen er altijd te staan; alleen de rest klapt weg. */}
      {status.advice
        .filter((item) => detail === 2 || item.severity === 'warn')
        .map((item) => (
          <div key={item.id} className={`advice ${item.severity}`}>
            {item.text}
          </div>
        ))}
    </>
  )
}

/** De balk die alleen in de bewerkstand verschijnt. */
function EditBar({
  layout,
  onShow,
  onReset
}: {
  layout: OverlayLayout
  onShow(id: PanelId): void
  onReset(): void
}): JSX.Element {
  const hidden = PANELS.filter((info) => !layout[info.id].visible)
  return (
    <div className="editbar" data-hit>
      <b>Overlay aanpassen</b>
      <span className="editbar-hint">
        sleep aan de balk, trek aan de hoek — Ctrl+Alt+O sluit dit
      </span>

      {hidden.length > 0 && (
        <div className="editbar-add">
          <span>Uitgezet:</span>
          {hidden.map((info) => (
            <button key={info.id} type="button" onClick={() => onShow(info.id)}>
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

/**
 * De haltes die nog komen, als een lijndiagram.
 *
 * Waar je bent komt uit de IBIS; die vult zich pas als de lijn en route zijn
 * ingetoetst. Zolang dat niet is gebeurd staat de hele rit er gewoon, vanaf het
 * begin — dan weet je tenminste wat er aankomt.
 */
function NextStops({ leg, status }: { leg: DutyLeg; status: LiveStatus }): JSX.Element {
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
        <span className="label">Halte</span>{' '}
        {passed !== undefined ? (
          <span className="sub">
            nog {Math.max(0, total - at)} van {total}
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
              {index2 === total - 1 && <span className="tag">eindpunt</span>}
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
