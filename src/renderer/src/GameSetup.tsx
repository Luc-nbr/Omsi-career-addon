import { useCallback, useEffect, useMemo, useState, type CSSProperties, type JSX } from 'react'
import type { KeyBinding } from '../../core/omsiKeys'
import { loose, t, type Language } from '../../shared/i18n'
import {
  PRESETS,
  PRESET_NAMES,
  SETTINGS,
  SETTING_GROUPS,
  settingKey,
  type SettingSpec
} from '../../shared/omsiSettings'
import type { OmsiOverlays } from '../../shared/api'
import { MODIFIER_CODES, SCANCODES } from '../../shared/scancodes'
import { ControllersTab } from './Controllers'

interface Props {
  language: Language
  onBack(): void
  /** Met welk tabblad het scherm opent; de melding over overlays opent "Overlays". */
  beginTab?: 'settings' | 'keys' | 'controllers' | 'overlays'
}

/** Shift en Ctrl zitten in het derde veld van een binding; de rest laten we staan. */
const MOD_SHIFT = 2
const MOD_CTRL = 4

/**
 * De instellingen en de toetsen van OMSI zelf.
 *
 * Het spel heeft daar een eigen menu voor, maar dat is een Delphi-scherm uit
 * 2013 waarin je per instelling moet raden wat hij doet. Hier staat wat elke
 * knop betekent, in je eigen taal, met de grenzen die OMSI verwacht.
 *
 * Er wordt niets geschreven tot je op opslaan drukt, en alleen wat je zelf hebt
 * aangeraakt gaat het bestand in.
 */
export function GameSetup({ language, onBack, beginTab }: Props): JSX.Element {
  const [tab, setTab] = useState<'settings' | 'keys' | 'controllers' | 'overlays'>(beginTab ?? 'settings')
  return (
    <div className="app solo">
      <main className="main">
        <div className="mode-bar">
          <span className="mode-tag">{t(language, 'cfg.title')}</span>
          <button type="button" className="link-button" onClick={onBack}>
            {t(language, 'cfg.back')}
          </button>
        </div>

        <h1>{t(language, 'cfg.title')}</h1>
        <p className="subtitle">{t(language, 'cfg.intro')}</p>

        <div className="chips" style={{ marginBottom: 16 }}>
          <button
            type="button"
            className="chip"
            aria-pressed={tab === 'settings'}
            onClick={() => setTab('settings')}
          >
            {t(language, 'cfg.tabSettings')}
          </button>
          <button
            type="button"
            className="chip"
            aria-pressed={tab === 'keys'}
            onClick={() => setTab('keys')}
          >
            {t(language, 'cfg.tabKeys')}
          </button>
          <button
            type="button"
            className="chip"
            aria-pressed={tab === 'controllers'}
            onClick={() => setTab('controllers')}
          >
            {t(language, 'cfg.tabControllers')}
          </button>
          <button
            type="button"
            className="chip"
            aria-pressed={tab === 'overlays'}
            onClick={() => setTab('overlays')}
          >
            {t(language, 'cfg.tabOverlays')}
          </button>
        </div>

        {tab === 'settings' && <SettingsTab language={language} />}
        {tab === 'keys' && <KeysTab language={language} />}
        {tab === 'controllers' && <ControllersTab language={language} />}
        {tab === 'overlays' && <OverlaysTab language={language} />}
      </main>
    </div>
  )
}

/** De overlays waar de app naar kijkt, in de volgorde waarin ze het vaakst voorkomen. */
const OVERLAYS = ['steam', 'discord', 'nvidia', 'rtss', 'obs', 'd3d9', 'opentrack'] as const
type Overlay = (typeof OVERLAYS)[number]
/** Standaard: waarschuwen voor wat je zelf kunt uitzetten; Steam kan dat niet, zie de uitleg. */
const STANDAARD_WAARSCHUWEN: Partial<Record<Overlay, boolean>> = {
  discord: true,
  nvidia: true,
  rtss: true,
  obs: true
}

/**
 * Welke overlays er in OMSI zitten, en waar je ze uitzet.
 *
 * WAAROM
 * OMSI liep op Lucs pc herhaaldelijk vast op "Direct3D-Device lost!", en in het
 * hangende spel zaten telkens de overlays van Steam, Discord en NVIDIA. De app
 * kan ze niet uitzetten: Discord en NVIDIA bewaren hun keuze versleuteld in hun
 * eigen programma, en Steam zet zijn bestand bij elke start terug (gemeten op
 * 19-09 en 21-09; zie core/omsiProces.ts). Wat de app wel kan: in het spel
 * kijken wat erin zit, zeggen waar de schakelaar staat, en waarschuwen als een
 * overlay die je weg wilt er toch weer in zit.
 */
function OverlaysTab({ language }: { language: Language }): JSX.Element {
  const [stand, setStand] = useState<OmsiOverlays>()
  const [kijkt, setKijkt] = useState(false)
  const [keuze, setKeuze] = useState<Partial<Record<Overlay, boolean>>>({})

  useEffect(() => {
    void window.career.settings().then((instellingen) => setKeuze(instellingen.overlayWaarschuwing ?? {}))
  }, [])

  const kijk = useCallback(async () => {
    setKijkt(true)
    try {
      setStand(await window.career.omsiOverlays())
    } finally {
      setKijkt(false)
    }
  }, [])
  useEffect(() => {
    void kijk()
  }, [kijk])

  const zetKeuze = (soort: Overlay, aan: boolean): void => {
    const nieuw = { ...keuze, [soort]: aan }
    setKeuze(nieuw)
    void window.career.saveSettings({ overlayWaarschuwing: nieuw })
  }

  const gevonden = new Set(stand?.overlays.map((item) => item.soort) ?? [])

  return (
    <>
      <p className="subtitle">{t(language, 'ovl.intro')}</p>

      <div className="actions" style={{ marginTop: 0, marginBottom: 16, alignItems: 'center' }}>
        <button type="button" className="btn secondary" disabled={kijkt} onClick={() => void kijk()}>
          {t(language, kijkt ? 'ovl.kijkt' : 'ovl.kijk')}
        </button>
        <span className="note">
          {!stand
            ? ''
            : !stand.draait
              ? t(language, 'ovl.omsiUit')
              : stand.reageert === false
                ? t(language, 'ovl.omsiVast')
                : t(language, 'ovl.omsiDraait')}
        </span>
      </div>
      {stand && stand.extern.length > 0 && (
        <p className="note warn">{t(language, 'ovl.extern', { namen: stand.extern.join(', ') })}</p>
      )}

      {OVERLAYS.map((soort) => {
        const zit = gevonden.has(soort)
        return (
          <section className="card" key={soort}>
            <h2 className="section-title">{t(language, `ovl.naam.${soort}` as const)}</h2>
            <p className={zit && soort !== 'opentrack' ? 'note warn' : 'note'}>
              {!stand || !stand.draait
                ? t(language, 'ovl.onbekend')
                : zit
                  ? t(language, 'ovl.inOmsi')
                  : t(language, 'ovl.nietInOmsi')}
            </p>
            <p className="note" style={{ marginTop: 8 }}>
              {t(language, `ovl.uitleg.${soort}` as const)}
            </p>
            {soort !== 'opentrack' && (
              <label className="note" style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
                <input
                  type="checkbox"
                  checked={keuze[soort] ?? STANDAARD_WAARSCHUWEN[soort] ?? false}
                  onChange={(event) => zetKeuze(soort, event.target.checked)}
                />
                {t(language, 'ovl.waarschuw')}
              </label>
            )}
          </section>
        )
      })}
    </>
  )
}

/** De schuiven en vinkjes uit options.cfg. */
function SettingsTab({ language }: { language: Language }): JSX.Element {
  const [saved, setSaved] = useState<Record<string, string>>()
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [running, setRunning] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string>()
  const [error, setError] = useState<string>()

  const load = useCallback(() => {
    void window.career
      .gameSettings()
      .then((payload) => {
        setSaved(payload.values)
        setDraft(payload.values)
        setRunning(payload.omsiRunning)
      })
      .catch((cause: unknown) =>
        setError(
          t(language, 'cfg.failed', { reason: cause instanceof Error ? cause.message : String(cause) })
        )
      )
  }, [language])

  useEffect(load, [load])

  const changed = useMemo(() => {
    if (!saved) return []
    return Object.keys(draft).filter((key) => draft[key] !== saved[key])
  }, [draft, saved])

  const save = async (): Promise<void> => {
    if (changed.length === 0) return
    setBusy(true)
    setNote(undefined)
    try {
      const changes: Record<string, string> = {}
      for (const key of changed) changes[key] = draft[key]
      const values = await window.career.saveGameSettings(changes)
      setSaved(values)
      setDraft(values)
      setNote(t(language, 'cfg.saved'))
    } catch (cause) {
      setError(
        t(language, 'cfg.failed', { reason: cause instanceof Error ? cause.message : String(cause) })
      )
    } finally {
      setBusy(false)
    }
  }

  if (error) return <p className="note warn">{error}</p>
  if (!saved) return <p className="empty">{t(language, 'app.loading')}</p>

  return (
    <>
      {running && <p className="note warn">{t(language, 'cfg.running')}</p>}

      {SETTING_GROUPS.map((group) => (
        <section className="card" key={group}>
          <h2 className="section-title">{t(language, `cfg.group.${group}` as const)}</h2>
          {/*
            Drie startpunten voor wie niet weet waar hij moet beginnen. Ze zetten
            alleen de schuiven; opslaan doe je daarna zelf.
          */}
          {group === 'graphics' && (
            <div className="chips" style={{ marginBottom: 14 }}>
              <span className="note" style={{ marginRight: 4 }}>
                {t(language, 'cfg.preset')}
              </span>
              {PRESET_NAMES.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className="chip"
                  onClick={() => setDraft((old) => ({ ...old, ...PRESETS[preset] }))}
                >
                  {t(language, `cfg.preset.${preset}` as const)}
                </button>
              ))}
            </div>
          )}
          <div className="settings">
            {SETTINGS.filter((spec) => spec.group === group).map((spec) => (
              <SettingRow
                key={settingKey(spec)}
                spec={spec}
                language={language}
                value={draft[settingKey(spec)] ?? ''}
                dirty={draft[settingKey(spec)] !== saved[settingKey(spec)]}
                onChange={(raw) => setDraft((old) => ({ ...old, [settingKey(spec)]: raw }))}
              />
            ))}
          </div>
        </section>
      ))}

      <div className="actions sticky-actions">
        <button type="button" className="btn" disabled={busy || changed.length === 0} onClick={() => void save()}>
          {t(language, busy ? 'cfg.saving' : 'cfg.save')}
        </button>
        {changed.length > 0 && (
          <button type="button" className="btn secondary" onClick={() => setDraft(saved)}>
            {t(language, 'cfg.revert')}
          </button>
        )}
        <span className="note">
          {changed.length > 0 ? t(language, 'cfg.changed', { count: changed.length }) : note ?? ''}
        </span>
      </div>
    </>
  )
}

/** Eén instelling: een schuif, een schakelaar of een keuzelijst. */
function SettingRow({
  spec,
  language,
  value,
  dirty,
  onChange
}: {
  spec: SettingSpec
  language: Language
  value: string
  dirty: boolean
  onChange(raw: string): void
}): JSX.Element {
  const key = settingKey(spec)
  // De sleutels komen uit het schema en niet uit de code, dus met een terugval.
  const label = loose(language, `set.${key}`, spec.tag)
  const hint = spec.hint ? loose(language, `set.${key}.hint`, '') : undefined

  if (spec.kind === 'toggle') {
    const on = value === spec.on
    return (
      <div className={`setting ${dirty ? 'dirty' : ''}`}>
        <div className="setting-head">
          <span className="setting-name">{label}</span>
          <button
            type="button"
            className="switch"
            role="switch"
            aria-checked={on}
            onClick={() => onChange(on ? spec.off ?? '' : spec.on ?? '1')}
          >
            <span className="switch-knob" />
            <span className="switch-label">{t(language, on ? 'cfg.on' : 'cfg.off')}</span>
          </button>
        </div>
        {hint && <p className="setting-hint">{hint}</p>}
      </div>
    )
  }

  if (spec.kind === 'choice') {
    return (
      <div className={`setting ${dirty ? 'dirty' : ''}`}>
        <div className="setting-head">
          <span className="setting-name">{label}</span>
          <select value={value} onChange={(event) => onChange(event.target.value)}>
            {(spec.choices ?? []).map((choice) => (
              <option key={choice} value={choice}>
                {loose(language, `set.${key}.${choice}`, choice)}
              </option>
            ))}
          </select>
        </div>
        {hint && <p className="setting-hint">{hint}</p>}
      </div>
    )
  }

  const number = Number.parseFloat(value)
  const current = Number.isFinite(number) ? number : spec.min ?? 0
  const write = (next: number): void => {
    const clamped = Math.min(spec.max ?? next, Math.max(spec.min ?? next, next))
    onChange(spec.decimals !== undefined ? clamped.toFixed(spec.decimals) : String(Math.round(clamped)))
  }

  return (
    <div className={`setting ${dirty ? 'dirty' : ''}`}>
      <div className="setting-head">
        <span className="setting-name">{label}</span>
        <span className="setting-value">
          {spec.decimals === 2 && (spec.max ?? 1) <= 1
            ? `${Math.round(current * 100)}%`
            : Math.round(current * 100) / 100}
        </span>
      </div>
      <input
        type="range"
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={current}
        // Hoe ver de lijn gevuld is; zie `.velinhoud input[type='range']` in setup.css.
        style={
          {
            '--deel': `${Math.min(
              100,
              Math.max(
                0,
                ((current - (spec.min ?? 0)) / Math.max(1e-9, (spec.max ?? 1) - (spec.min ?? 0))) * 100
              )
            )}%`
          } as CSSProperties
        }
        onChange={(event) => write(Number(event.target.value))}
      />
      {hint && <p className="setting-hint">{hint}</p>}
    </div>
  )
}

/** De toetsindeling uit Inputs\keyboard.cfg. */
function KeysTab({ language }: { language: Language }): JSX.Element {
  const [bindings, setBindings] = useState<KeyBinding[]>()
  const [names, setNames] = useState<Map<number, string>>(new Map())
  const [labels, setLabels] = useState<Map<string, string>>(new Map())
  const [running, setRunning] = useState(false)
  const [search, setSearch] = useState('')
  const [capturing, setCapturing] = useState<string>()
  const [note, setNote] = useState<string>()
  const [error, setError] = useState<string>()

  const load = useCallback(() => {
    void window.career
      .gameKeys()
      .then((payload) => {
        setBindings(payload.bindings)
        setNames(new Map(payload.keyNames))
        setLabels(new Map(payload.labels))
        setRunning(payload.omsiRunning)
      })
      .catch((cause: unknown) =>
        setError(
          t(language, 'cfg.failed', { reason: cause instanceof Error ? cause.message : String(cause) })
        )
      )
  }, [language])

  useEffect(load, [load])

  /** Een binding opslaan gaat meteen: een half aangepaste toetsindeling helpt niemand. */
  const apply = useCallback(
    async (next: KeyBinding[]) => {
      setBindings(next)
      setBindings(await window.career.saveGameKeys(next))
      setNote(t(language, 'keys.saved'))
    },
    [language]
  )

  // Tijdens het opnemen luistert het hele venster mee, zodat ook F-toetsen en
  // pijltjes binnenkomen in plaats van de knop te bedienen.
  useEffect(() => {
    if (!capturing || !bindings) return
    const onKey = (event: KeyboardEvent): void => {
      event.preventDefault()
      event.stopPropagation()
      if (event.code === 'Escape') {
        setCapturing(undefined)
        return
      }
      if (MODIFIER_CODES.has(event.code)) return

      const scancode = event.code === 'Backspace' ? 0 : SCANCODES[event.code]
      if (scancode === undefined) {
        setNote(t(language, 'keys.unknown'))
        return
      }

      const next = bindings.map((binding) => {
        if (binding.action !== capturing) return binding
        // De vlag voor "ingedrukt houden" zit in hetzelfde getal en blijft staan.
        const rest = binding.modifiers & ~(MOD_SHIFT | MOD_CTRL)
        const modifiers =
          scancode === 0 ? rest : rest | (event.shiftKey ? MOD_SHIFT : 0) | (event.ctrlKey ? MOD_CTRL : 0)
        return { ...binding, scancode, modifiers }
      })
      setCapturing(undefined)
      void apply(next)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [capturing, bindings, apply, language])

  const reset = async (): Promise<void> => {
    if (!window.confirm(t(language, 'keys.resetAsk'))) return
    setBindings(await window.career.resetGameKeys())
    setNote(t(language, 'keys.saved'))
  }

  const combo = useCallback(
    (binding: KeyBinding): string => {
      if (!binding.scancode) return t(language, 'keys.none')
      return [
        binding.modifiers & MOD_CTRL ? 'Ctrl' : '',
        binding.modifiers & MOD_SHIFT ? 'Shift' : '',
        names.get(binding.scancode) ?? `#${binding.scancode}`
      ]
        .filter(Boolean)
        .join(' + ')
    },
    [names, language]
  )

  if (error) return <p className="note warn">{error}</p>
  if (!bindings) return <p className="empty">{t(language, 'app.loading')}</p>

  const needle = search.trim().toLowerCase()
  const sections = [...new Set(bindings.map((binding) => binding.section))]

  return (
    <>
      {running && <p className="note warn">{t(language, 'cfg.running')}</p>}
      <p className="note">{t(language, 'keys.intro')}</p>

      <div className="actions">
        <input
          className="key-search"
          value={search}
          placeholder={t(language, 'keys.search')}
          onChange={(event) => setSearch(event.target.value)}
        />
        <button type="button" className="btn secondary" onClick={() => void reset()}>
          {t(language, 'keys.reset')}
        </button>
        {note && <span className="note">{note}</span>}
      </div>

      {sections.map((section) => {
        const rows = bindings.filter((binding) => {
          if (binding.section !== section) return false
          if (!needle) return true
          const label = labels.get(binding.action) ?? binding.action
          return label.toLowerCase().includes(needle) || binding.action.toLowerCase().includes(needle)
        })
        // Geen regels in deze sectie: alleen melden als er gezocht is.
        if (rows.length === 0) return null
        return (
          <section className="card" key={section}>
            <h2 className="section-title">
              {section === 'vehicles'
                ? t(language, 'keys.section.vehicles')
                : t(language, 'keys.section.game')}
            </h2>
            <div className="keys">
              {rows.map((binding) => {
                // Dezelfde toets bij twee handelingen is in OMSI toegestaan, maar
                // je wilt het wel weten voordat je hem weggeeft.
                const clash = bindings.find(
                  (other) =>
                    other !== binding &&
                    other.scancode === binding.scancode &&
                    (other.modifiers & (MOD_SHIFT | MOD_CTRL)) ===
                      (binding.modifiers & (MOD_SHIFT | MOD_CTRL)) &&
                    other.section === binding.section &&
                    binding.scancode !== 0
                )
                return (
                  <div className="key-row" key={`${binding.section}-${binding.action}`}>
                    <span className="key-name">
                      {labels.get(binding.action) ?? binding.action}
                      {clash && (
                        <span className="key-clash">
                          {t(language, 'keys.taken', {
                            action: labels.get(clash.action) ?? clash.action
                          })}
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      className={`key-combo ${capturing === binding.action ? 'capturing' : ''}`}
                      onClick={() => setCapturing(binding.action)}
                    >
                      {capturing === binding.action ? t(language, 'keys.press') : combo(binding)}
                    </button>
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}

      {needle && bindings.every((binding) => {
        const label = labels.get(binding.action) ?? binding.action
        return !label.toLowerCase().includes(needle) && !binding.action.toLowerCase().includes(needle)
      }) && <p className="empty">{t(language, 'keys.noMatch', { text: search.trim() })}</p>}

      {capturing && <p className="note">{t(language, 'keys.escape')}</p>}
    </>
  )
}
