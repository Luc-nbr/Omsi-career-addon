import type { JSX, ReactNode } from 'react'
import { REGELS, type Bedrijf as BedrijfStaat, type Busvorm } from '../../core/bedrijf'
import type { DienstSleutel, OmloopSleutel } from '../../core/planTypen'
import type { CareerPayload } from '../../shared/api'
import { formatMoney } from '../../shared/format'
import { loose } from '../../shared/i18n'
import { useLanguage, useT } from './language'

/*
 * De bouwstenen van de bedrijfsapp die meer dan één tab gebruikt: tegels,
 * panelen, meters, het geld, en de typen waarmee een tab naar een andere wijst.
 * Ze stonden in Bedrijf.tsx; met de planning erbij werd dat te groot om nog
 * te overzien (ontwerp busbedrijf-planning §3.2).
 */

export type Tab =
  | 'dashboard'
  | 'post'
  | 'planning'
  | 'kaart'
  | 'concessies'
  | 'wagenpark'
  | 'markt'
  | 'personeel'
  | 'opleidingen'
  | 'boeken'

/** Waar een tab op moet openen: een omloop, een dienst, een dag, iemand of een bus. */
export interface Focus {
  dag?: number
  omloop?: OmloopSleutel
  dienst?: DienstSleutel
  medewerker?: number
  bus?: number
  /** Voor de markt en het wagenpark: bussen van deze vorm (ontwerp wagenpark §F11). */
  vorm?: Busvorm
}

/** Naar een andere tab, zo nodig met iets in beeld. */
export type Naar = (tab: Tab, focus?: Focus) => void

export type Handel = (doen: Promise<{ payload: CareerPayload; fout?: string } | CareerPayload>) => Promise<void>

export function useGeld(): (centen: number, teken?: boolean) => string {
  const taal = useLanguage()
  return (centen, teken) => `${teken && centen > 0 ? '+' : ''}${formatMoney(centen / 100, taal)}`
}

export function KasChip({ bedrijf }: { bedrijf: BedrijfStaat }): JSX.Element {
  const tr = useT()
  const geld = useGeld()
  return (
    <span className={`bd-kaschip ${bedrijf.kas < 0 ? 'laat' : ''}`}>
      <small>{tr('bd.cash')}</small>
      {geld(bedrijf.kas)}
    </span>
  )
}

export function Tegel({
  titel,
  waarde,
  sub,
  toon,
  children
}: {
  titel: string
  waarde: string
  sub?: string
  toon?: 'goed' | 'laat'
  children?: ReactNode
}): JSX.Element {
  return (
    <section className="bd-tegel">
      <small>{titel}</small>
      <b className={toon === 'goed' ? 'optijd' : toon ?? ''}>{waarde}</b>
      {children}
      {sub && <span className="bd-sub">{sub}</span>}
    </section>
  )
}

export function Paneel({
  titel,
  breed,
  actie,
  children
}: {
  titel: string
  breed?: boolean
  actie?: { tekst: string; doen: () => void }
  children: ReactNode
}): JSX.Element {
  return (
    <section className={`bd-paneel ${breed ? 'breed' : ''}`}>
      <div className="bd-paneelkop">
        <h2>{titel}</h2>
        {actie && (
          <button type="button" className="bd-link" onClick={actie.doen}>
            {actie.tekst} →
          </button>
        )}
      </div>
      {children}
    </section>
  )
}

/** Staat (hoe ver van onderhoud) en schade in één balk; de tekst zegt het ook. */
export function Staatbalk({ staat, schade }: { staat: number; schade: number }): JSX.Element {
  const tr = useT()
  const toon = staat < REGELS.inzetbaarVanafStaat || schade >= REGELS.inzetbaarTotSchade ? 'laat' : staat < 50 ? 'let' : 'goed'
  return (
    <span className="bd-staat">
      <span className={`bd-meter ${toon}`}>
        <i style={{ width: `${Math.max(0, Math.min(100, staat))}%` }} />
      </span>
      <small>
        {tr('bd.condition', { n: Math.round(staat) })}
        {schade > 0 ? ` · ${tr('bd.damage', { n: Math.round(schade) })}` : ''}
      </small>
    </span>
  )
}

export function Meter({ waarde, tekst, toon }: { waarde: number; tekst: string; toon?: 'goed' | 'let' | 'laat' }): JSX.Element {
  return (
    <span className="bd-staat">
      <span className={`bd-meter ${toon ?? ''}`}>
        <i style={{ width: `${Math.max(0, Math.min(100, waarde))}%` }} />
      </span>
      <small>{tekst}</small>
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Boekingen                                                          */
/* ------------------------------------------------------------------ */

export function Boeken({ bedrijf, alle }: { bedrijf: BedrijfStaat; alle?: boolean }): JSX.Element {
  const tr = useT()
  const taal = useLanguage()
  const geld = useGeld()
  const lijst = (
    <ul className="bd-boeken">
      {bedrijf.boekingen.slice(0, alle ? 200 : 6).map((b, i) => (
        <li key={i}>
          <span className="bd-dag">{b.dag}</span>
          <span className="bd-wat">
            <b>{loose(taal, `bd.kind.${b.soort}`, b.soort)}</b>
            <small>{b.wat}</small>
          </span>
          <span className={`bd-bron ${b.gemeten ? 'gemeten' : ''}`}>
            {tr(b.gemeten ? 'bd.measured' : 'bd.calculated')}
          </span>
          <span className={`bd-bedrag ${b.bedrag < 0 ? 'laat' : b.bedrag > 0 ? 'optijd' : ''}`}>
            {b.bedrag === 0 ? '' : geld(b.bedrag, true)}
          </span>
        </li>
      ))}
    </ul>
  )
  return alle ? <Paneel titel={tr('bd.books')}>{lijst}</Paneel> : lijst
}
