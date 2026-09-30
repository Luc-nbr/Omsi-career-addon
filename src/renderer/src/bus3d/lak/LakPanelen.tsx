import { useEffect, useRef, useState, type DragEvent, type JSX, type ReactNode } from 'react'
import type { Laag, LakOptie, LakStart, SnelleLakStand, StrookSjabloon } from '../../../../shared/lak'
import type { TextKey } from '../../../../shared/i18n'
import { TEKST_LAKSTUDIO } from '../../../../shared/tekst/lakstudio'
import { useT } from '../../language'
import type { DecalAnalyse } from './lakdoek'
import { OFL_LETTERTYPEN } from './lettertypen'
import { VORMEN, VORM_NAMEN } from './vormen'

/**
 * DE PANELEN VAN DE LAKSTUDIO (lakstudio-ontwerp §2.2): rechts Snelle lak en
 * het paneel van het gereedschap met de gekozen laag, links de lagenlijst. Hier
 * alleen tonen en doorgeven; wat een keuze met het project doet, staat in
 * Lakstudio.tsx. Een schuif of kleur geeft eerst `vast = false` (voorlopig, geen
 * stap in de geschiedenis) en bij het loslaten `vast = true` (één stap).
 */

export type Zetter<T> = (waarde: T, vast: boolean) => void

export const STROKEN: StrookSjabloon[] = ['onderband', 'raamband', 'dakband', 'schuin', 'golf', 'tweekleurig', 'frontvlak', 'achtervlak']

/* ------------------------------------------------------------------ kleine bouwstenen */

/** Een kleur die tijdens het kiezen al op de bus staat, en pas bij het sluiten van de kiezer één stap wordt. */
export function KleurVeld({ waarde, onZet, label, id }: { waarde: string; onZet: Zetter<string>; label: string; id?: string }): JSX.Element {
  const ref = useRef<HTMLInputElement>(null)
  const zet = useRef(onZet)
  zet.current = onZet
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const klaar = (): void => zet.current(el.value, true)
    el.addEventListener('change', klaar)
    return () => el.removeEventListener('change', klaar)
  }, [])
  return (
    <input
      ref={ref}
      id={id}
      className="ls-kleur"
      type="color"
      value={waarde}
      aria-label={label}
      title={label}
      onInput={(e) => onZet((e.target as HTMLInputElement).value, false)}
      onChange={() => undefined}
    />
  )
}

/** Een schuif met zijn getal: voorlopig tijdens het slepen, één stap bij het loslaten. */
export function Schuif({
  label,
  waarde,
  min,
  max,
  stap = 1,
  onZet,
  eenheid,
  naam
}: {
  label: string
  waarde: number
  min: number
  max: number
  stap?: number
  onZet: Zetter<number>
  eenheid?: string
  naam?: string
}): JSX.Element {
  const laatste = useRef(waarde)
  return (
    <label className="ls-veld ls-schuif">
      <span>{label}</span>
      <input
        type="range"
        name={naam}
        min={min}
        max={max}
        step={stap}
        value={waarde}
        onChange={(e) => {
          laatste.current = Number(e.target.value)
          onZet(laatste.current, false)
        }}
        onPointerUp={() => onZet(laatste.current, true)}
        onKeyUp={() => onZet(laatste.current, true)}
      />
      <output>
        {Math.round(waarde * 100) / 100}
        {eenheid ?? ''}
      </output>
    </label>
  )
}

/** Een getal in een veld; elke bevestigde waarde is één stap. */
export function Getal({ label, waarde, min, max, stap = 1, onZet, naam }: { label: string; waarde: number; min: number; max: number; stap?: number; onZet: (w: number) => void; naam?: string }): JSX.Element {
  const [tekst, zetTekst] = useState(String(waarde))
  useEffect(() => zetTekst(String(Math.round(waarde * 100) / 100)), [waarde])
  const klaar = (): void => {
    const w = Number(tekst.replace(',', '.'))
    if (Number.isFinite(w)) onZet(Math.min(max, Math.max(min, w)))
    else zetTekst(String(waarde))
  }
  return (
    <label className="ls-veld">
      <span>{label}</span>
      <input
        type="number"
        name={naam}
        inputMode="decimal"
        min={min}
        max={max}
        step={stap}
        value={tekst}
        onChange={(e) => zetTekst(e.target.value)}
        onBlur={klaar}
        onKeyDown={(e) => e.key === 'Enter' && klaar()}
      />
    </label>
  )
}

export function Blok({ titel, children, className }: { titel?: string; children: ReactNode; className?: string }): JSX.Element {
  return (
    <section className={`ls-blok${className ? ` ${className}` : ''}`}>
      {titel ? <h2 className="ls-blokkop">{titel}</h2> : null}
      {children}
    </section>
  )
}

/** Een busje van opzij met de band van een strooksjabloon (de plaatjes in Snelle lak en Strook). */
export function StrookPlaatje({ sjabloon }: { sjabloon: StrookSjabloon }): JSX.Element {
  const band = ((): JSX.Element => {
    switch (sjabloon) {
      case 'onderband':
        return <rect x="3" y="17" width="58" height="5" />
      case 'raamband':
        return <rect x="3" y="9" width="58" height="3" />
      case 'dakband':
        return <rect x="3" y="3" width="58" height="3" />
      case 'schuin':
        return <path d="M3 21 L61 13 V17 L3 25 Z" />
      case 'golf':
        return <path d="M3 17 Q17 12 32 17 T61 17 V21 Q47 16 32 21 T3 21 Z" />
      case 'tweekleurig':
        return <rect x="3" y="12" width="58" height="11" />
      case 'frontvlak':
        return <rect x="55" y="3" width="6" height="20" />
      case 'achtervlak':
        return <rect x="3" y="3" width="6" height="20" />
    }
  })()
  return (
    <svg className="ls-strookplaatje" viewBox="0 0 64 30" aria-hidden="true">
      <rect className="ls-plaatje-bus" x="3" y="3" width="58" height="20" rx="3" />
      <g className="ls-plaatje-band">{band}</g>
      <rect className="ls-plaatje-raam" x="12" y="6" width="40" height="5" rx="1" />
      <circle className="ls-plaatje-wiel" cx="15" cy="24" r="4" />
      <circle className="ls-plaatje-wiel" cx="49" cy="24" r="4" />
    </svg>
  )
}

export function VormPlaatje({ naam }: { naam: string }): JSX.Element {
  return (
    <svg className="ls-vormplaatje" viewBox="-4 -4 108 108" aria-hidden="true">
      {(VORMEN[naam] ?? []).map((s, i) =>
        s.dik ? (
          <path key={i} d={s.d} fill="none" stroke="currentColor" strokeWidth={s.dik} strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path key={i} d={s.d} fill="currentColor" fillRule={s.regel ?? 'nonzero'} />
        )
      )}
    </svg>
  )
}

/** Een vak waar je een beeld op laat vallen, met een knop om er een te kiezen. */
export function BeeldVak({ tekst, onBestand, naam }: { tekst: string; onBestand: (f: File) => void; naam: string }): JSX.Element {
  const t = useT()
  const [boven, zetBoven] = useState(false)
  const kies = useRef<HTMLInputElement>(null)
  const val = (e: DragEvent): void => {
    e.preventDefault()
    zetBoven(false)
    const f = e.dataTransfer.files[0]
    if (f) onBestand(f)
  }
  return (
    <div
      className={`ls-beeldvak${boven ? ' ls-boven' : ''}`}
      data-vak={naam}
      onDragOver={(e) => {
        e.preventDefault()
        zetBoven(true)
      }}
      onDragLeave={() => zetBoven(false)}
      onDrop={val}
    >
      <span>{tekst}</span>
      <button type="button" className="ls-knop" onClick={() => kies.current?.click()}>
        {t('ls.snel.kies')}
      </button>
      <input
        ref={kies}
        type="file"
        hidden
        accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onBestand(f)
          e.target.value = ''
        }}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ Snelle lak (§2.1) */

export function SnelleLakPaneel({
  snel,
  voorvulling,
  logo,
  onKleur,
  onStrook,
  onNaam,
  onLogo,
  onLogoWeg,
  onStart,
  onVerder
}: {
  snel: SnelleLakStand
  /** De kleuren van de lak die nu op de bus staat: daarmee staan de stalen vooringevuld. */
  voorvulling: [string, string, string]
  logo?: string
  onKleur: (i: 0 | 1 | 2, kleur: string, vast: boolean) => void
  onStrook: (s: StrookSjabloon) => void
  onNaam: (n: string) => void
  onLogo: (f: File) => void
  onLogoWeg: () => void
  onStart: (s: LakStart) => void
  onVerder: () => void
}): JSX.Element {
  const t = useT()
  const labels: TextKey[] = ['ls.snel.kleur1', 'ls.snel.kleur2', 'ls.snel.kleur3']
  return (
    <div className="ls-snel" data-paneel="snel">
      <Blok titel={t('ls.snel.kleuren')}>
        <div className="ls-stalen">
          {([0, 1, 2] as const).map((i) => (
            <label key={i} className={`ls-staal${snel.kleuren[i] ? ' ls-gekozen' : ''}`} data-staal={i}>
              <KleurVeld waarde={snel.kleuren[i] ?? voorvulling[i]} label={t(labels[i])} onZet={(k, vast) => onKleur(i, k, vast)} />
              <small>{t(labels[i])}</small>
            </label>
          ))}
        </div>
      </Blok>
      <Blok titel={t('ls.snel.strook')}>
        <div className="ls-strookkeuze" role="radiogroup" aria-label={t('ls.snel.strook')}>
          {STROKEN.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={snel.strook === s}
              className={`ls-strookknop${snel.strook === s ? ' ls-aan' : ''}`}
              data-strook={s}
              title={t(`ls.strook.${s}` as TextKey)}
              onClick={() => onStrook(s)}
            >
              <StrookPlaatje sjabloon={s} />
              <small>{t(`ls.strook.${s}` as TextKey)}</small>
            </button>
          ))}
        </div>
      </Blok>
      <Blok titel={t('ls.snel.naam')}>
        <input className="ls-invoer" name="snelNaam" value={snel.naam} maxLength={60} onChange={(e) => onNaam(e.target.value)} />
      </Blok>
      <Blok titel={t('ls.snel.logo')}>
        {logo ? (
          <div className="ls-logo">
            <img src={logo} alt="" />
            <button type="button" className="ls-knop" onClick={onLogoWeg}>
              {t('ls.snel.logoWeg')}
            </button>
          </div>
        ) : null}
        <BeeldVak naam="logo" tekst={t('ls.snel.sleep')} onBestand={onLogo} />
        <p className="ls-zacht">{t('ls.logo')}</p>
      </Blok>
      <Blok>
        <p className="ls-zacht">
          {t('ls.snel.of')}{' '}
          {(['effenKleuren', 'precies', 'effen'] as const).map((s, i) => (
            <span key={s}>
              {i > 0 ? ' · ' : ''}
              <button type="button" className="ls-link" data-start={s} onClick={() => onStart(s)}>
                {t(`ls.start.${s}` as TextKey)}
              </button>
            </span>
          ))}
        </p>
        <button type="button" className="ls-knop ls-verder" data-knop="verder" onClick={onVerder}>
          {t('ls.verder')}
        </button>
      </Blok>
    </div>
  )
}

/* ------------------------------------------------------------------ de lagenlijst (§2.2) */

export function LagenLijst({
  lagen,
  gekozen,
  basis,
  onKies,
  onZichtbaar,
  onVerplaats
}: {
  lagen: Laag[]
  gekozen?: string
  basis: string
  onKies: (id: string) => void
  onZichtbaar: (id: string, aan: boolean) => void
  onVerplaats: (id: string, naar: number) => void
}): JSX.Element {
  const t = useT()
  const [sleep, zetSleep] = useState<string>()
  // Bovenaan staat de bovenste laag.
  const rijen = [...lagen].reverse()
  return (
    <nav className="ls-lagen" aria-label={t('ls.lagen')}>
      <h2 className="ls-blokkop">{t('ls.lagen')}</h2>
      {rijen.length === 0 ? <p className="ls-zacht">{t('ls.lagen.leeg')}</p> : null}
      <ul>
        {rijen.map((l) => (
          <li
            key={l.id}
            data-laag={l.id}
            className={`ls-laagrij${l.id === gekozen ? ' ls-aan' : ''}${l.zichtbaar ? '' : ' ls-verborgen'}`}
            draggable
            onDragStart={() => zetSleep(l.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              if (sleep && sleep !== l.id) onVerplaats(sleep, lagen.findIndex((x) => x.id === l.id))
              zetSleep(undefined)
            }}
          >
            <button
              type="button"
              className="ls-oog"
              aria-pressed={l.zichtbaar}
              aria-label={`${t('ls.laag.zichtbaar')}: ${l.naam}`}
              title={t('ls.laag.zichtbaar')}
              onClick={() => onZichtbaar(l.id, !l.zichtbaar)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                {l.zichtbaar ? (
                  <path d="M12 5C6.5 5 2.7 9.4 1.5 12c1.2 2.6 5 7 10.5 7s9.3-4.4 10.5-7C21.3 9.4 17.5 5 12 5Zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8Z" />
                ) : (
                  <path d="M3 4.4 4.4 3l16.6 16.6-1.4 1.4-3.1-3.1A11 11 0 0 1 12 19c-5.5 0-9.3-4.4-10.5-7a13 13 0 0 1 4-4.9L3 4.4Zm9 .6c5.5 0 9.3 4.4 10.5 7a13 13 0 0 1-2.9 3.9L8.7 5.6A11 11 0 0 1 12 5Z" />
                )}
              </svg>
            </button>
            <button type="button" className="ls-laagnaam" onClick={() => onKies(l.id)}>
              {l.vergrendeld ? (
                <svg className="ls-slot" viewBox="0 0 24 24" aria-label={t('ls.laag.vergrendel')}>
                  <path d="M7 10V8a5 5 0 0 1 10 0v2h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h1Zm2 0h6V8a3 3 0 0 0-6 0v2Z" />
                </svg>
              ) : null}
              {l.naam}
            </button>
          </li>
        ))}
      </ul>
      <p className="ls-zacht ls-basis">{basis}</p>
    </nav>
  )
}

/* ------------------------------------------------------------------ de gekozen laag */

/**
 * De meldingen bij de gekozen decal, BOVEN in het paneel (eerst stonden ze
 * helemaal onderaan, onder de knoppen; beoordeling L3): spiegelschrift met
 * [Schuif naar een vrij stuk], de kopie op een deur of ruit, en letters die op
 * een deur, ruit of wielkast vallen.
 */
export function LaagMeldingen({ laag, spiegelAan, analyse, onSchuif }: { laag: Laag; spiegelAan: boolean; analyse?: DecalAnalyse; onSchuif: () => void }): JSX.Element | null {
  const t = useT()
  const plaats = 'plaats' in laag ? laag.plaats : undefined
  if (!analyse || !plaats) return null
  const opDeur = Math.min(analyse.vrij ?? 1, analyse.kopie ? (analyse.vrijKopie ?? 1) : 1) < 0.9
  return (
    <>
      {plaats.spiegel === 'gekoppeld' && spiegelAan && !analyse.kopie ? (
        <p className="ls-melding" data-melding="spiegelschrift">
          {t('ls.spiegelschrift')}{' '}
          <button type="button" className="ls-link" data-knop="schuif" onClick={onSchuif}>
            {t('ls.schuif')}
          </button>
        </p>
      ) : null}
      {analyse.kopie && (analyse.kopieDeur ?? 0) >= 0.1 ? (
        <p className="ls-melding" data-melding="kopieDeur">
          {t('ls.kopieDeur')}
        </p>
      ) : null}
      {opDeur ? (
        <p className="ls-melding" data-melding="opDeur">
          {t('ls.opDeur')}
        </p>
      ) : null}
    </>
  )
}

export function LaagPaneel({
  laag,
  spiegelAan,
  onWijzig,
  onWeg,
  onDupliceer,
  onStap
}: {
  laag: Laag
  spiegelAan: boolean
  onWijzig: (deel: Partial<Laag>, vast: boolean) => void
  onWeg: () => void
  onDupliceer: () => void
  onStap: (richting: 1 | -1) => void
}): JSX.Element {
  const t = useT()
  const plaats = 'plaats' in laag ? laag.plaats : undefined
  const zijkant = plaats && (plaats.zijde === 'L' || plaats.zijde === 'R')
  return (
    <Blok titel={laag.naam} className="ls-laagpaneel">
      <label className="ls-veld">
        <span>{t('ls.laag.naam')}</span>
        <input className="ls-invoer" value={laag.naam} maxLength={60} onChange={(e) => onWijzig({ naam: e.target.value }, true)} />
      </label>
      <Schuif label={t('ls.laag.dekking')} waarde={Math.round(laag.dekking * 100)} min={0} max={100} eenheid="%" onZet={(w, vast) => onWijzig({ dekking: w / 100 }, vast)} />
      {laag.soort !== 'afbeelding' ? (
        <Schuif label={t('ls.laag.detail')} waarde={Math.round(laag.detail * 100)} min={0} max={100} eenheid="%" onZet={(w, vast) => onWijzig({ detail: w / 100 }, vast)} />
      ) : null}
      {plaats ? (
        <Schuif
          label={t('ls.laag.draai')}
          waarde={plaats.draai}
          min={-180}
          max={180}
          onZet={(w, vast) => onWijzig({ plaats: { ...plaats, draai: w } } as Partial<Laag>, vast)}
        />
      ) : null}
      <label className="ls-vink">
        <input type="checkbox" checked={Boolean(laag.ookOverRubbers)} onChange={(e) => onWijzig({ ookOverRubbers: e.target.checked }, true)} />
        {t('ls.laag.rubbers')}
      </label>
      {plaats && zijkant && spiegelAan ? (
        <label className="ls-vink">
          <input
            type="checkbox"
            checked={plaats.spiegel === 'gekoppeld'}
            onChange={(e) => onWijzig({ plaats: { ...plaats, spiegel: e.target.checked ? 'gekoppeld' : 'los' } } as Partial<Laag>, true)}
          />
          {t('ls.laag.spiegel')}
        </label>
      ) : null}
      {plaats && zijkant && spiegelAan && laag.soort !== 'tekst' && plaats.spiegel === 'gekoppeld' ? (
        <label className="ls-vink">
          <input
            type="checkbox"
            checked={Boolean(plaats.zelfdeRichting)}
            onChange={(e) => onWijzig({ plaats: { ...plaats, zelfdeRichting: e.target.checked } } as Partial<Laag>, true)}
          />
          {t('ls.laag.richting')}
        </label>
      ) : null}
      <div className="ls-rij">
        <label className="ls-vink">
          <input type="checkbox" checked={Boolean(laag.vergrendeld)} onChange={(e) => onWijzig({ vergrendeld: e.target.checked }, true)} />
          {t('ls.laag.vergrendel')}
        </label>
      </div>
      <div className="ls-rij">
        <button type="button" className="ls-knop" onClick={() => onStap(1)}>
          {t('ls.laag.omhoog')}
        </button>
        <button type="button" className="ls-knop" onClick={() => onStap(-1)}>
          {t('ls.laag.omlaag')}
        </button>
        <button type="button" className="ls-knop" onClick={onDupliceer}>
          {t('ls.laag.dupliceer')}
        </button>
        <button type="button" className="ls-knop ls-gevaar" disabled={laag.vergrendeld} onClick={onWeg}>
          {t('ls.laag.weg')}
        </button>
      </div>
    </Blok>
  )
}

/* ------------------------------------------------------------------ het gereedschap */

export function VulPaneel({
  kleur,
  onKleur,
  zones
}: {
  kleur: string
  onKleur: (k: string) => void
  zones: Array<{ kleur: string; lak: boolean }>
}): JSX.Element {
  const t = useT()
  return (
    <Blok titel={t('ls.tool.vullen')}>
      <p className="ls-zacht">{t('ls.vul.uitleg')}</p>
      <label className="ls-veld">
        <span>{t('ls.laag.kleur')}</span>
        <KleurVeld waarde={kleur} label={t('ls.laag.kleur')} onZet={(k) => onKleur(k)} />
      </label>
      {zones.length ? (
        <>
          <h3 className="ls-kleinkop">{t('ls.vul.zones')}</h3>
          <div className="ls-zones">
            {zones.map((z, i) => (
              <span key={i} className={`ls-zone${z.lak ? '' : ' ls-zone-vrij'}`} style={{ background: z.kleur }} title={z.kleur} />
            ))}
          </div>
        </>
      ) : null}
    </Blok>
  )
}

export function StrookPaneel({
  laag,
  kleur,
  onKleur,
  onNieuw,
  onWijzig
}: {
  laag?: Extract<Laag, { soort: 'strook' }>
  kleur: string
  onKleur: (k: string, vast: boolean) => void
  onNieuw: (s: StrookSjabloon) => void
  onWijzig: (deel: Partial<Laag>, vast: boolean) => void
}): JSX.Element {
  const t = useT()
  return (
    <Blok titel={t('ls.tool.strook')}>
      <p className="ls-zacht">{t('ls.strook.uitleg')}</p>
      <label className="ls-veld">
        <span>{t('ls.laag.kleur')}</span>
        <KleurVeld waarde={laag?.kleur ?? kleur} label={t('ls.laag.kleur')} onZet={onKleur} />
      </label>
      <h3 className="ls-kleinkop">{t('ls.strook.nieuw')}</h3>
      <div className="ls-strookkeuze">
        {STROKEN.map((s) => (
          <button key={s} type="button" className="ls-strookknop" data-nieuwestrook={s} title={t(`ls.strook.${s}` as TextKey)} onClick={() => onNieuw(s)}>
            <StrookPlaatje sjabloon={s} />
            <small>{t(`ls.strook.${s}` as TextKey)}</small>
          </button>
        ))}
      </div>
      {laag ? (
        <>
          <Getal label={t('ls.strook.onder')} waarde={Math.round(laag.h1 * 100)} min={-50} max={600} onZet={(w) => onWijzig({ h1: w / 100 }, true)} />
          <Getal label={t('ls.strook.boven')} waarde={Math.round(laag.h2 * 100)} min={-50} max={600} onZet={(w) => onWijzig({ h2: w / 100 }, true)} />
          {laag.zijden === 'rondom' || laag.zijden === 'zijden' ? (
            <div className="ls-rij" role="radiogroup">
              {(['rondom', 'zijden'] as const).map((z) => (
                <label key={z} className="ls-vink">
                  <input type="radio" checked={laag.zijden === z} onChange={() => onWijzig({ zijden: z }, true)} />
                  {t(`ls.strook.${z}` as TextKey)}
                </label>
              ))}
            </div>
          ) : null}
          <Schuif label={t('ls.strook.hoek')} waarde={Math.round(laag.hoek * 10) / 10} min={-20} max={20} stap={0.5} onZet={(w, vast) => onWijzig({ hoek: w }, vast)} />
          <Schuif label={t('ls.strook.golfHoogte')} waarde={Math.round(laag.golf * 100)} min={0} max={40} onZet={(w, vast) => onWijzig({ golf: w / 100 }, vast)} />
        </>
      ) : null}
    </Blok>
  )
}

export function TekstPaneel({
  laag,
  lettertypen,
  kleur,
  klein,
  vervangen,
  tekstRef,
  onMeer,
  onWijzig,
  onKleur
}: {
  laag?: Extract<Laag, { soort: 'tekst' }>
  lettertypen: string[]
  kleur: string
  /** ls.klein: onder 10 texels letterhoogte. */
  klein: boolean
  /** ls.lettertype: het lettertype van deze laag ontbreekt hier. */
  vervangen?: { naam: string; vervanger: string }
  tekstRef: React.RefObject<HTMLInputElement | null>
  onMeer: () => void
  onWijzig: (deel: Partial<Laag>, vast: boolean) => void
  onKleur: (k: string, vast: boolean) => void
}): JSX.Element {
  const t = useT()
  return (
    <Blok titel={t('ls.tool.tekst')}>
      <p className="ls-zacht">{t('ls.tekst.uitleg')}</p>
      {laag ? (
        <>
          <input ref={tekstRef} className="ls-invoer ls-tekstinvoer" name="tekst" value={laag.tekst} maxLength={80} onChange={(e) => onWijzig({ tekst: e.target.value }, true)} />
          <label className="ls-veld">
            <span>{t('ls.tekst.lettertype')}</span>
            <select
              value={laag.lettertype}
              onChange={(e) => (e.target.value === '__meer' ? onMeer() : onWijzig({ lettertype: e.target.value }, true))}
            >
              <optgroup label={t('ls.tekst.ofl')}>
                {OFL_LETTERTYPEN.map((f) => (
                  <option key={f} value={f} style={{ fontFamily: f }}>
                    {f}
                  </option>
                ))}
              </optgroup>
              <optgroup label={t('ls.tekst.windows')}>
                {lettertypen.map((f) => (
                  <option key={f} value={f} style={{ fontFamily: f }}>
                    {f}
                  </option>
                ))}
                <option value="__meer">{t('ls.tekst.meer')}</option>
              </optgroup>
            </select>
          </label>
          {vervangen ? <p className="ls-melding">{t('ls.lettertype', vervangen)}</p> : null}
          <Getal label={t('ls.tekst.hoogte')} waarde={laag.hoogteCm} min={2} max={150} onZet={(w) => onWijzig({ hoogteCm: w }, true)} naam="hoogteCm" />
          {klein ? <p className="ls-melding" data-melding="klein">{t('ls.klein')}</p> : null}
          <label className="ls-veld">
            <span>{t('ls.laag.kleur')}</span>
            <KleurVeld waarde={laag.kleur} label={t('ls.laag.kleur')} onZet={onKleur} />
          </label>
          <label className="ls-vink">
            <input
              type="checkbox"
              checked={Boolean(laag.omlijning)}
              onChange={(e) => onWijzig({ omlijning: e.target.checked ? { kleur: '#000000', breedteCm: 1 } : undefined }, true)}
            />
            {t('ls.tekst.omlijning')}
          </label>
          {laag.omlijning ? (
            <div className="ls-rij">
              <KleurVeld
                waarde={laag.omlijning.kleur}
                label={t('ls.tekst.omlijning')}
                onZet={(k, vast) => onWijzig({ omlijning: { ...laag.omlijning!, kleur: k } }, vast)}
              />
              <Getal label={t('ls.tekst.omlijningDik')} waarde={laag.omlijning.breedteCm} min={0.2} max={10} stap={0.1} onZet={(w) => onWijzig({ omlijning: { ...laag.omlijning!, breedteCm: w } }, true)} />
            </div>
          ) : null}
          <Schuif label={t('ls.tekst.afstand')} waarde={laag.letterafstand ?? 0} min={-10} max={60} onZet={(w, vast) => onWijzig({ letterafstand: w }, vast)} />
        </>
      ) : (
        <label className="ls-veld">
          <span>{t('ls.laag.kleur')}</span>
          <KleurVeld waarde={kleur} label={t('ls.laag.kleur')} onZet={onKleur} />
        </label>
      )}
    </Blok>
  )
}

export function AfbeeldingPaneel({
  laag,
  kleur,
  fout,
  onBestand,
  onVorm,
  onWijzig,
  onKleur
}: {
  laag?: Extract<Laag, { soort: 'afbeelding' | 'vorm' }>
  kleur: string
  fout?: string
  onBestand: (f: File) => void
  onVorm: (naam: string) => void
  onWijzig: (deel: Partial<Laag>, vast: boolean) => void
  onKleur: (k: string, vast: boolean) => void
}): JSX.Element {
  const t = useT()
  return (
    <Blok titel={t('ls.tool.afbeelding')}>
      <p className="ls-zacht">{t('ls.afb.uitleg')}</p>
      <BeeldVak naam="afbeelding" tekst={t('ls.snel.sleep')} onBestand={onBestand} />
      {fout ? <p className="ls-melding">{fout}</p> : null}
      <p className="ls-zacht">{t('ls.logo')}</p>
      <h3 className="ls-kleinkop">{t('ls.afb.vormen')}</h3>
      <div className="ls-vormen">
        {VORM_NAMEN.map((v) => (
          <button key={v} type="button" className="ls-vormknop" data-vorm={v} title={t(`ls.vorm.${v}` as TextKey)} aria-label={t(`ls.vorm.${v}` as TextKey)} onClick={() => onVorm(v)}>
            <VormPlaatje naam={v} />
          </button>
        ))}
      </div>
      <label className="ls-veld">
        <span>{t('ls.laag.kleur')}</span>
        <KleurVeld waarde={laag?.soort === 'vorm' ? laag.kleur : kleur} label={t('ls.laag.kleur')} onZet={onKleur} />
      </label>
      {laag ? (
        <>
          <Getal
            label={t('ls.afb.breedte')}
            waarde={Math.round(laag.plaats.breedteM * 100)}
            min={5}
            max={1200}
            onZet={(w) => onWijzig({ plaats: { ...laag.plaats, breedteM: w / 100 } } as Partial<Laag>, true)}
          />
          {laag.soort === 'afbeelding' ? (
            <label className="ls-vink">
              <input type="checkbox" checked={laag.witDoorzichtig} onChange={(e) => onWijzig({ witDoorzichtig: e.target.checked } as Partial<Laag>, true)} />
              {t('ls.afb.wit')}
            </label>
          ) : null}
        </>
      ) : null}
    </Blok>
  )
}

export interface PenseelStand {
  straalCm: number
  hardheid: number
  dekking: number
  gum: boolean
}

export function PenseelPaneel({
  stand,
  kleur,
  vol,
  onZet,
  onKleur
}: {
  stand: PenseelStand
  kleur: string
  vol: boolean
  onZet: (s: PenseelStand) => void
  onKleur: (k: string, vast: boolean) => void
}): JSX.Element {
  const t = useT()
  return (
    <Blok titel={t('ls.tool.penseel')}>
      <p className="ls-zacht">{t('ls.penseel.uitleg')}</p>
      <label className="ls-veld">
        <span>{t('ls.laag.kleur')}</span>
        <KleurVeld waarde={kleur} label={t('ls.laag.kleur')} onZet={onKleur} />
      </label>
      <Schuif label={t('ls.penseel.maat')} waarde={stand.straalCm * 2} min={1} max={200} onZet={(w) => onZet({ ...stand, straalCm: w / 2 })} />
      <Schuif label={t('ls.penseel.hardheid')} waarde={Math.round(stand.hardheid * 100)} min={0} max={100} eenheid="%" onZet={(w) => onZet({ ...stand, hardheid: w / 100 })} />
      <Schuif label={t('ls.penseel.dekking')} waarde={Math.round(stand.dekking * 100)} min={5} max={100} eenheid="%" onZet={(w) => onZet({ ...stand, dekking: w / 100 })} />
      <label className="ls-vink">
        <input type="checkbox" checked={stand.gum} onChange={(e) => onZet({ ...stand, gum: e.target.checked })} />
        {t('ls.penseel.gum')}
      </label>
      {vol ? <p className="ls-melding">{t('ls.penseel.vol')}</p> : null}
    </Blok>
  )
}

/* ------------------------------------------------------------------ onder [Meer▾] */

/**
 * Een leesbare naam voor een busoptie (beoordeling L3 punt 10): een bekende
 * variabele in de taal van de speler (`ls.optie.*`), anders de variabele zelf
 * zonder vis_/hide_/CTI en zonder liggende streepjes ("vis_rear_doors" → "Rear
 * doors"). Eerst was het de naam van de eerste mesh ("e wheel fr1").
 */
function optieNaam(o: LakOptie, t: ReturnType<typeof useT>): string {
  const sleutel = `ls.optie.${o.variabele.toLowerCase()}`
  if (sleutel in TEKST_LAKSTUDIO) return t(sleutel as TextKey)
  const kaal = o.variabele
    .replace(/^(vis|hide|show|decal)_/i, '')
    .replace(/^(cti|sv)_/i, '')
    .replace(/_(vis|visible)$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
  return kaal ? kaal.charAt(0).toUpperCase() + kaal.slice(1) : o.variabele
}

export function OptiesPaneel({
  opties,
  waarden,
  mogelijk,
  nietOp,
  ms,
  onZet
}: {
  opties: LakOptie[]
  waarden: Record<string, number>
  mogelijk: boolean
  nietOp?: string
  ms?: number
  onZet: (variabele: string, waarde: number) => void
}): JSX.Element {
  const t = useT()
  const uiterlijk = opties.filter((o) => o.soort === 'uiterlijk')
  const techniek = opties.filter((o) => o.soort === 'techniek')
  const rij = (o: LakOptie): JSX.Element => {
    const w = waarden[o.variabele] ?? 0
    const tweewaardig = o.waarden.every((x) => x === 0 || x === 1)
    return (
      <div key={o.variabele} className="ls-optie" data-optie={o.variabele} title={o.variabele}>
        {tweewaardig ? (
          <label className="ls-vink">
            <input
              type="checkbox"
              disabled={!mogelijk}
              // Aangevinkt = het onderdeel is te zien: niet de waarde die het verbergt.
              checked={o.verberg === undefined ? w === 1 : w !== o.verberg}
              onChange={(e) => onZet(o.variabele, o.verberg === undefined ? (e.target.checked ? 1 : 0) : e.target.checked ? 1 - o.verberg : o.verberg)}
            />
            {optieNaam(o, t)}
          </label>
        ) : (
          <label className="ls-veld">
            <span>{optieNaam(o, t)}</span>
            <select disabled={!mogelijk} value={w} onChange={(e) => onZet(o.variabele, Number(e.target.value))}>
              {[...new Set([0, ...o.waarden])].map((x) => (
                <option key={x} value={x}>
                  {t('ls.opties.waarde')} {x}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    )
  }
  return (
    <Blok titel={t('ls.meer.opties')} className="ls-opties">
      {!mogelijk && nietOp ? <p className="ls-melding">{t('ls.opties', { bus: nietOp })}</p> : null}
      {opties.length === 0 ? <p className="ls-zacht">{t('ls.opties.geen')}</p> : <p className="ls-zacht">{t('ls.opties.uitleg')}</p>}
      {uiterlijk.map(rij)}
      {techniek.length ? (
        <>
          <h3 className="ls-kleinkop">{t('ls.opties.techniek')}</h3>
          <p className="ls-zacht">{t('ls.opties.techniekUitleg')}</p>
          {techniek.map(rij)}
        </>
      ) : null}
      {/* De meettijd (P16) alleen voor de proef, niet in beeld (beoordeling L3 punt 10). */}
      {ms !== undefined ? <span hidden data-optiesms={ms} /> : null}
    </Blok>
  )
}

export function StartPaneel({ start, onStart }: { start: LakStart; onStart: (s: LakStart) => void }): JSX.Element {
  const t = useT()
  return (
    <Blok titel={t('ls.meer.start')}>
      {(['snel', 'effenKleuren', 'precies', 'effen'] as const).map((s) => (
        <label key={s} className="ls-vink">
          <input type="radio" name="start" checked={start === s} onChange={() => onStart(s)} />
          {t(`ls.start.${s}` as TextKey)}
        </label>
      ))}
    </Blok>
  )
}

export function VlakPaneel({ schuifCm, onZet }: { schuifCm: number; onZet: Zetter<number> }): JSX.Element {
  const t = useT()
  return (
    <Blok titel={t('ls.meer.vlak')}>
      <p className="ls-zacht">{t('ls.vlak.uitleg')}</p>
      <Schuif label={t('ls.vlak.schuif')} waarde={schuifCm} min={-30} max={30} onZet={onZet} />
    </Blok>
  )
}
