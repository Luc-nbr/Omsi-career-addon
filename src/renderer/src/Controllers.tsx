import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { AXIS_FUNCTIONS, AXIS_SLOTS, type ControllerConfig } from '../../shared/controllers'
import { loose, t, type Language } from '../../shared/i18n'
import { WIZARD_STEPS, type WizardStep } from '../../shared/controllerWizard'

/**
 * Stuur, pedalen en knoppenkastjes.
 *
 * OMSI zet dit in één scherm met acht naamloze assen en een lijst knopnummers;
 * je moet zelf weten welke as welke is. Hier beweegt de balk mee terwijl je het
 * pedaal indrukt, dus je ziet wat je doet. De wizard vraagt de belangrijkste
 * dingen in één keer na, maar niets is verplicht: overslaan mag altijd.
 */

/** Wat de browser van de aangesloten apparaten ziet, elke beeldwissel ververst. */
function useGamepads(): (Gamepad | null)[] {
  const [pads, setPads] = useState<(Gamepad | null)[]>([])
  useEffect(() => {
    let running = true
    const tick = (): void => {
      if (!running) return
      // De lijst is een momentopname; hem elke keer opnieuw opvragen hoort zo.
      setPads([...navigator.getGamepads()])
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    return () => {
      running = false
    }
  }, [])
  return pads
}

/**
 * De naam zoals je hem wilt zien.
 *
 * OMSI schrijft de naam op zoals Windows hem doorgeeft, inclusief wat er soms
 * achteraan blijft hangen: "MOZA R5 Base" eindigt op een byte 0x90 en "CH
 * FLIGHT SIM YOKE USB" op een spatie. Voor het herkennen van het apparaat telt
 * dat mee, dus dat blijft in het bestand staan -- alleen op het scherm niet.
 */
function clean(name: string): string {
  return name.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim()
}

/** De naam waaronder we een nieuw apparaat wegschrijven; zonder de vendor-code. */
function deviceName(pad: Gamepad): string {
  return pad.id.split('(')[0].trim()
}

/** Hoort deze aangesloten controller bij dit blok uit het bestand? */
function matches(pad: Gamepad | null, name: string): boolean {
  if (!pad) return false
  const a = pad.id.toLowerCase()
  const b = clean(name).toLowerCase()
  if (!b) return false
  return a.includes(b) || b.includes(a.split('(')[0].trim())
}

export function ControllersTab({ language }: { language: Language }): JSX.Element {
  const [controllers, setControllers] = useState<ControllerConfig[]>()
  const [labels, setLabels] = useState<Map<string, string>>(new Map())
  const [running, setRunning] = useState(false)
  const [chosen, setChosen] = useState(0)
  const [search, setSearch] = useState('')
  const [picking, setPicking] = useState<number>()
  const [wizard, setWizard] = useState<number>()
  const [error, setError] = useState<string>()
  const pads = useGamepads()

  useEffect(() => {
    void window.career
      .gameControllers()
      .then((payload) => {
        setControllers(payload.controllers)
        setLabels(new Map(payload.labels))
        setRunning(payload.omsiRunning)
        // Voorlopig het apparaat dat OMSI gebruikt; zodra bekend is wat er
        // werkelijk aan de computer hangt, springt de keuze daarheen.
        const first = payload.controllers.findIndex((item) => item.selected)
        setChosen(first >= 0 ? first : 0)
      })
      .catch((cause: unknown) =>
        setError(
          t(language, 'cfg.failed', { reason: cause instanceof Error ? cause.message : String(cause) })
        )
      )
  }, [language])

  /*
   * Eén keer, zodra de browser de aangesloten apparaten kent: spring naar het
   * apparaat dat er echt aan hangt. Een lijst met zes oude sturen waarvan er
   * één werkt, hoort niet op de eerste te openen.
   */
  const jumped = useRef(false)
  useEffect(() => {
    if (jumped.current || !controllers || pads.every((pad) => !pad)) return
    const live = controllers.findIndex(
      (item) => item.selected && pads.some((pad) => matches(pad, item.name))
    )
    const any = controllers.findIndex((item) => pads.some((pad) => matches(pad, item.name)))
    if (live >= 0 || any >= 0) setChosen(live >= 0 ? live : any)
    jumped.current = true
  }, [controllers, pads])

  const apply = useCallback(async (next: ControllerConfig[]) => {
    setControllers(next)
    setControllers(await window.career.saveGameControllers(next))
  }, [])

  const change = useCallback(
    (update: (controller: ControllerConfig) => ControllerConfig) => {
      if (!controllers) return
      const next = controllers.map((item, index) => (index === chosen ? update(item) : item))
      void apply(next)
    },
    [controllers, chosen, apply]
  )

  if (error) return <p className="note warn">{error}</p>
  if (!controllers) return <p className="empty">{t(language, 'app.loading')}</p>

  const controller = controllers[chosen]
  const pad = pads.find((item) => matches(item, controller?.name ?? '')) ?? null

  // Apparaten die wel aangesloten zijn maar nog niet in het bestand staan.
  const unknown = pads.filter(
    (item) => item && !controllers.some((known) => matches(item, known.name))
  )

  return (
    <>
      {running && <p className="note warn">{t(language, 'cfg.running')}</p>}
      <p className="note">{t(language, 'ctrl.intro')}</p>

      <section className="card">
        <h2 className="section-title">{t(language, 'ctrl.devices')}</h2>
        <div className="devices">
          {controllers.map((item, index) => {
            const live = pads.some((entry) => matches(entry, item.name))
            return (
              <button
                key={`${item.name}-${index}`}
                type="button"
                className={`device ${index === chosen ? 'picked' : ''}`}
                onClick={() => setChosen(index)}
              >
                <span className="device-name">{clean(item.name)}</span>
                <span className="device-meta">
                  {t(language, live ? 'ctrl.connected' : 'ctrl.offline')}
                  {item.selected ? ` · ${t(language, 'ctrl.inUse')}` : ''}
                </span>
              </button>
            )
          })}
        </div>
        {unknown.length > 0 && (
          <>
            <h3 className="section-title" style={{ marginTop: 14 }}>
              {t(language, 'ctrl.newDevices')}
            </h3>
            <div className="devices">
              {unknown.map((pad) =>
                pad ? (
                  <div className="device" key={pad.id}>
                    <span className="device-name">{deviceName(pad)}</span>
                    <span className="device-meta">
                      {t(language, 'ctrl.axes')} {pad.axes.length} ·{' '}
                      {t(language, 'ctrl.buttons')} {pad.buttons.length}
                    </span>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => {
                        const next = [
                          ...controllers,
                          {
                            name: deviceName(pad),
                            selected: true,
                            axes: Array.from({ length: AXIS_SLOTS }, () => ({ action: -1, shape: 0 })),
                            buttons: Array.from({ length: pad.buttons.length }, () => ({
                              action: '',
                              flag: 0
                            })),
                            force: ['1.000', '1.000']
                          }
                        ]
                        void apply(next)
                        setChosen(next.length - 1)
                        // Meteen door naar de wizard: daar is dit voor bedoeld.
                        setWizard(0)
                      }}
                    >
                      {t(language, 'ctrl.add')}
                    </button>
                  </div>
                ) : null
              )}
            </div>
            <p className="note">{t(language, 'ctrl.addNote')}</p>
          </>
        )}
      </section>

      {controller && (
        <>
          <section className="card">
            <h2 className="section-title">{clean(controller.name)}</h2>
            {/*
              Of OMSI dit apparaat meeneemt. Een stuur dat aan staat maar niet is
              aangesloten, is precies waarom het spel soms niet reageert.
            */}
            <div className="setting-head" style={{ marginBottom: 10 }}>
              <span className="setting-name">{t(language, 'ctrl.use')}</span>
              <button
                type="button"
                className="switch"
                role="switch"
                aria-checked={controller.selected}
                onClick={() => change((item) => ({ ...item, selected: !item.selected }))}
              >
                <span className="switch-knob" />
                <span className="switch-label">
                  {t(language, controller.selected ? 'cfg.on' : 'cfg.off')}
                </span>
              </button>
            </div>

            <h3 className="section-title">{t(language, 'ctrl.axes')}</h3>
            <p className="note">{t(language, 'ctrl.axesIntro')}</p>
            <div className="axes">
              {Array.from({ length: AXIS_SLOTS }, (_, slot) => {
                const axis = controller.axes[slot] ?? { action: -1, shape: 0 }
                const value = pad?.axes[slot]
                return (
                  <div className="axis-row" key={slot}>
                    <span className="axis-name">{t(language, 'ctrl.axis', { number: slot + 1 })}</span>
                    <select
                      value={axis.action}
                      onChange={(event) =>
                        change((item) => ({
                          ...item,
                          axes: item.axes.map((entry, index) =>
                            index === slot ? { ...entry, action: Number(event.target.value) } : entry
                          )
                        }))
                      }
                    >
                      <option value={-1}>{t(language, 'ctrl.axisNone')}</option>
                      {AXIS_FUNCTIONS.map((name, index) => (
                        <option key={name} value={index}>
                          {t(language, `ctrl.fn.${name}` as const)}
                        </option>
                      ))}
                    </select>
                    {/* De balk beweegt mee terwijl je trapt of stuurt. */}
                    <span className="axis-bar" aria-hidden="true">
                      {value !== undefined && (
                        <span
                          className="axis-fill"
                          style={{ left: `${Math.round(((value + 1) / 2) * 100)}%` }}
                        />
                      )}
                    </span>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="card">
            <h2 className="section-title">{t(language, 'ctrl.buttons')}</h2>
            <div className="actions">
              <input
                className="key-search"
                value={search}
                placeholder={t(language, 'keys.search')}
                onChange={(event) => setSearch(event.target.value)}
              />
              <button type="button" className="btn" onClick={() => setWizard(0)}>
                {t(language, 'ctrl.wizard')}
              </button>
              <button
                type="button"
                className="btn secondary"
                onClick={() =>
                  change((item) => ({
                    ...item,
                    buttons: item.buttons.map((button) => ({ ...button, action: '' }))
                  }))
                }
              >
                {t(language, 'ctrl.clearAll')}
              </button>
            </div>

            <ButtonList
              controller={controller}
              language={language}
              labels={labels}
              pad={pad}
              search={search}
              picking={picking}
              onPick={setPicking}
              onSet={(index, action) => {
                setPicking(undefined)
                change((item) => {
                  /*
                   * Het bestand kent soms minder knoppen dan het apparaat heeft:
                   * OMSI schrijft op wat het toen zag. Knoppen erbij vullen we
                   * aan met niets, anders valt een keuze op knop 30 in het niets.
                   */
                  const buttons = [...item.buttons]
                  while (buttons.length <= index) buttons.push({ action: '', flag: 0 })
                  buttons[index] = { ...buttons[index], action }
                  return { ...item, buttons }
                })
              }}
            />
          </section>
        </>
      )}

      {wizard !== undefined && controller && (
        <Wizard
          language={language}
          step={wizard}
          pad={pad}
          onSkip={() => setWizard(wizard + 1 < WIZARD_STEPS.length ? wizard + 1 : undefined)}
          onClose={() => setWizard(undefined)}
          onLearn={(step, index) => {
            change((item) => {
              if (step.kind === 'axis') {
                const axes = [...item.axes]
                while (axes.length < AXIS_SLOTS) axes.push({ action: -1, shape: 0 })
                axes[index] = { ...axes[index], action: step.axis ?? -1 }
                return { ...item, axes }
              }
              const buttons = [...item.buttons]
              while (buttons.length <= index) buttons.push({ action: '', flag: 0 })
              buttons[index] = { ...buttons[index], action: step.action ?? '' }
              return { ...item, buttons }
            })
            setWizard(wizard + 1 < WIZARD_STEPS.length ? wizard + 1 : undefined)
          }}
        />
      )}
    </>
  )
}

/** De knoppen van het apparaat, met wat ze doen. */
function ButtonList({
  controller,
  language,
  labels,
  pad,
  search,
  picking,
  onPick,
  onSet
}: {
  controller: ControllerConfig
  language: Language
  labels: Map<string, string>
  pad: Gamepad | null
  search: string
  picking?: number
  onPick(index?: number): void
  onSet(index: number, action: string): void
}): JSX.Element {
  const needle = search.trim().toLowerCase()
  // Zoveel knoppen als het bestand kent, en anders wat het apparaat meldt.
  const count = Math.max(controller.buttons.length, pad?.buttons.length ?? 0)

  const rows = Array.from({ length: count }, (_, index) => index).filter((index) => {
    if (!needle) return true
    const action = controller.buttons[index]?.action ?? ''
    const label = labels.get(action) ?? action
    return (
      label.toLowerCase().includes(needle) ||
      action.toLowerCase().includes(needle) ||
      String(index + 1) === needle
    )
  })

  return (
    <div className="keys">
      {rows.map((index) => {
        const button = controller.buttons[index] ?? { action: '', flag: 0 }
        const pressed = pad?.buttons[index]?.pressed ?? false
        return (
          <div className={`key-row ${pressed ? 'pressed' : ''}`} key={index}>
            <span className="key-name">
              {t(language, 'ctrl.button', { number: index + 1 })}
              {pressed && <span className="key-hold">{t(language, 'ctrl.pressed')}</span>}
            </span>
            {picking === index ? (
              <ActionPicker
                language={language}
                labels={labels}
                onChoose={(action) => onSet(index, action)}
                onCancel={() => onPick(undefined)}
              />
            ) : (
              <button type="button" className="key-combo" onClick={() => onPick(index)}>
                {button.action
                  ? labels.get(button.action) ?? button.action
                  : t(language, 'keys.none')}
              </button>
            )}
          </div>
        )
      })}
      {rows.length === 0 && <p className="empty">{t(language, 'ctrl.noButtons')}</p>}
    </div>
  )
}

/** Een handeling uitzoeken, met zoeken erin: het zijn er meer dan honderd. */
function ActionPicker({
  language,
  labels,
  onChoose,
  onCancel
}: {
  language: Language
  labels: Map<string, string>
  onChoose(action: string): void
  onCancel(): void
}): JSX.Element {
  const [query, setQuery] = useState('')
  const all = useMemo(() => [...labels.entries()], [labels])
  const needle = query.trim().toLowerCase()
  const found = all
    .filter(([action, label]) => !needle || label.toLowerCase().includes(needle) || action.includes(needle))
    .slice(0, 40)

  return (
    <div className="picker">
      <input
        autoFocus
        value={query}
        placeholder={t(language, 'keys.search')}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel()
        }}
      />
      <div className="picker-list">
        <button type="button" className="picker-item" onClick={() => onChoose('')}>
          {t(language, 'keys.none')}
        </button>
        {found.map(([action, label]) => (
          <button key={action} type="button" className="picker-item" onClick={() => onChoose(action)}>
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * De wizard: hij vraagt het belangrijkste na en kijkt mee welke as je beweegt
 * of welke knop je indrukt. Elke stap mag worden overgeslagen en de hele wizard
 * ook; niemand hoeft dit door.
 */
function Wizard({
  language,
  step,
  pad,
  onLearn,
  onSkip,
  onClose
}: {
  language: Language
  step: number
  pad: Gamepad | null
  onLearn(step: WizardStep, index: number): void
  onSkip(): void
  onClose(): void
}): JSX.Element {
  const current = WIZARD_STEPS[step]
  // De ruststand van de assen, om te zien welke er beweegt.
  const rest = useRef<number[]>([])
  useEffect(() => {
    rest.current = pad ? [...pad.axes] : []
  }, [step, pad?.id])

  useEffect(() => {
    if (!pad || !current) return
    if (current.kind === 'axis') {
      for (let index = 0; index < pad.axes.length; index++) {
        const from = rest.current[index] ?? 0
        if (Math.abs(pad.axes[index] - from) > 0.45) {
          onLearn(current, index)
          return
        }
      }
    } else {
      for (let index = 0; index < pad.buttons.length; index++) {
        if (pad.buttons[index]?.pressed) {
          onLearn(current, index)
          return
        }
      }
    }
  }, [pad, current, onLearn])

  if (!current) return <></>

  return (
    <div className="wizard">
      <div className="wizard-card">
        <span className="wizard-step">
          {t(language, 'ctrl.step', { number: step + 1, total: WIZARD_STEPS.length })}
        </span>
        <h2>{loose(language, `ctrl.ask.${current.id}`, current.id)}</h2>
        <p className="note">
          {pad
            ? t(language, current.kind === 'axis' ? 'ctrl.moveAxis' : 'ctrl.pressButton')
            : t(language, 'ctrl.noDevice')}
        </p>
        <div className="actions">
          <button type="button" className="btn secondary" onClick={onSkip}>
            {t(language, 'ctrl.skipStep')}
          </button>
          <button type="button" className="btn secondary" onClick={onClose}>
            {t(language, 'ctrl.skipAll')}
          </button>
        </div>
      </div>
    </div>
  )
}
