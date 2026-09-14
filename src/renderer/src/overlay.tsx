import { useCallback, useEffect, useRef, useState, type JSX, type PointerEvent } from 'react'
import { createRoot } from 'react-dom/client'
import type { MapGeometry } from '../../core/geo'
import type { IbisPlan } from '../../core/ibis'
import type { LiveStatus } from '../../core/live'
import type { Duty, DutyLeg } from '../../core/types'
import type { CareerApi } from '../../shared/api'
import { formatTime } from '../../shared/format'
import { DEFAULT_LANGUAGE, loose, t, type Language } from '../../shared/i18n'
import {
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

function Overlay(): JSX.Element | null {
  const [frame, setFrame] = useState<Frame>({ connected: false, editing: false })
  const [layout, setLayout] = useState<OverlayLayout>()
  const [geometry, setGeometry] = useState<MapGeometry>()
  const [language, setLanguage] = useState<Language>(DEFAULT_LANGUAGE)

  const { status, duty, editing } = frame

  useEffect(() => {
    window.overlay.onFrame(setFrame)
    void window.career.overlayLayout().then(setLayout)
    void window.career.settings().then((settings) => setLanguage(settings.language))
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
   * Een bus zonder IBIS meldt nooit een halte. Die chauffeur eindeloos naar
   * "toets de route in" laten kijken helpt hem niet; dan maar meteen de dienst.
   */
  const ibisCapable = status ? status.offersStops : true
  // Alleen schatten waar de bus is als OMSI zijn plek niet laat lezen.
  const bus =
    !frame.vehicle && status && ibisLoaded && passed !== undefined && stopOdometer.current?.key === stopKey
      ? {
          legIndex: status.legIndex,
          nextStop: passed,
          metresSinceStop: Math.max(0, (status.odometerKm - stopOdometer.current.km) * 1000)
        }
      : undefined

  return (
    <div className={editing ? 'stage editing' : 'stage'}>
      {layout.dienst.visible && (
        <Panel
          info={PANELS[0]}
          title={t(language, 'ovl.panelDuty')}
          state={layout.dienst}
          editing={editing}
          language={language}
          onChange={(patch) => move('dienst', patch)}
        >
          {readable && !scheduled && duty ? (
            <SelectPanel duty={duty} status={status} language={language} />
          ) : duty && !ibisLoaded && ibisCapable ? (
            <IbisPanel duty={duty} ibis={frame.ibis} status={status} language={language} />
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
          onChange={(patch) => move('navigatie', patch)}
        >
          {duty && geometry ? (
            <RouteMap
              duty={duty}
              geometry={geometry}
              nextStopId={leg && passed !== undefined ? leg.stopIds[Math.min(passed, leg.stopIds.length - 1)] : undefined}
              activeLeg={status?.legIndex}
              routeMode={ibisLoaded ? 'active' : 'none'}
              bus={bus}
              vehicle={frame.vehicle && status ? { ...frame.vehicle, speedKmh: status.speedKmh } : undefined}
              // Nog niets gekozen en geen bus te zien: de eerste halte van de rit in beeld.
              focusStopId={ibisLoaded || frame.vehicle ? undefined : leg?.stopIds[0]}
              texts={{
                waiting: t(language, readable ? 'ovl.mapSelect' : 'ovl.mapWaiting'),
                busNote: t(language, 'ovl.busHere'),
                centre: t(language, 'ovl.centre')
              }}
              variant="panel"
            />
          ) : (
            <div className="empty">{t(language, 'ovl.mapLoading')}</div>
          )}
        </Panel>
      )}

      {editing && (
        <EditBar
          layout={layout}
          language={language}
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
  title,
  state,
  editing,
  language,
  onChange,
  children
}: {
  info: PanelInfo
  title: string
  state: OverlayLayout['dienst']
  editing: boolean
  language: Language
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
          <span className="panel-title">{title}</span>
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

  const late = status.delayMinutes >= 1
  const passed = walkedStops(status)
  const total = leg?.stops.length ?? 0

  return (
    <>
      <div className="topline">
        <span className="clock">{formatTime(status.clockMinutes)}</span>
        {leg && <span className="line">{leg.lineNumber}</span>}
        <span className={`delay ${late ? 'late' : 'ontime'}`}>
          {late ? tr('ovl.late', { minutes: Math.round(status.delayMinutes) }) : tr('ovl.ontime')}
          {status.delayFromIbis ? '' : '*'}
        </span>
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
 * Voordat de dienst in OMSI zelf gekozen is. Tijd, haltes en vertraging hebben
 * dan nog geen betekenis; wat de chauffeur wel nodig heeft, is wat hij in het
 * dienstregelingsmenu moet aanklikken.
 */
function SelectPanel({
  duty,
  status,
  language
}: {
  duty: Duty
  status?: LiveStatus
  language: Language
}): JSX.Element {
  const first = duty.legs[0]
  const chosen = status?.schedule
  return (
    <div className="select-duty">
      <div className="topline">
        <span className="line">{duty.lineNumbers.join(' / ')}</span>
        <b>{t(language, 'ovl.selectTitle')}</b>
        <LayoutButton language={language} />
      </div>
      <div className="row">
        <span className="value">
          {t(language, 'ovl.selectHow', {
            line: duty.lineFile,
            tour: duty.tourNumber,
            time: first ? formatTime(first.departure) : '—'
          })}
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

/** De balk die alleen in de bewerkstand verschijnt. */
function EditBar({
  layout,
  language,
  onShow,
  onReset
}: {
  layout: OverlayLayout
  language: Language
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
