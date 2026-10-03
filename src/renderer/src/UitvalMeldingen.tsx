import { useMemo, useState, type JSX } from 'react'
import type { Bedrijf } from '../../core/bedrijf'
import { invulOpties } from '../../core/invulling'
import type { DagPlan } from '../../core/planTypen'
import { doelVan, gevolgenVan, type UitvalGevolg, type UitvalPlek } from '../../core/uitval'
import { useGeld, type Handel, type Naar } from './BedrijfDelen'
import { useLanguage, useT } from './language'
import { focusVan, keuzeTekst, standZin, uitvalZin } from './uitvalAandacht'
import './uitval.css'

/*
 * De meldingen van vanochtend, bovenaan het dashboard en de planning
 * (ontwerp busbedrijf-planning §5.2): wie ziek is, wie te laat komt, welke
 * bus niet start, wat daardoor open staat, en wat de centrale doet als jij
 * niets doet. [Invullen] brengt je naar die dienst in de planning.
 *
 * Zolang het plan er nog niet is (of van een andere dag is), staat er alleen
 * wie of wat er uitvalt; de dienst komt erbij zodra het plan geladen is.
 */
export function UitvalMeldingen({
  bedrijf,
  plan,
  naar
}: {
  bedrijf: Bedrijf
  plan?: DagPlan
  naar: Naar
}): JSX.Element | null {
  const tr = useT()
  const gevolgen = useMemo(() => gevolgenVan(bedrijf, plan), [bedrijf, plan])
  if (gevolgen.length === 0) return null
  return (
    <section className="bd-paneel breed bd-uitval" aria-live="polite">
      <div className="bd-paneelkop">
        <h2>{tr('bd.uitval.kop')}</h2>
      </div>
      <UitvalLijst bedrijf={bedrijf} plan={plan} gevolgen={gevolgen} naar={naar} />
    </section>
  )
}

/**
 * De regels zelf; ook in het ochtendvenster. Met `handel` krijgt elke open
 * regel er een knop bij voor de goedkoopste redelijke keuze (de `standaard`
 * uit `invulOpties` van deel C), zodat je met één klik verder kunt.
 */
export function UitvalLijst({
  bedrijf,
  plan,
  gevolgen,
  naar,
  handel
}: {
  bedrijf: Bedrijf
  plan?: DagPlan
  gevolgen: UitvalGevolg[]
  naar?: Naar
  handel?: Handel
}): JSX.Element {
  return (
    <ul className="bd-uitval-lijst">
      {gevolgen.flatMap((g) =>
        g.plekken.length === 0
          ? [<UitvalRegel key={g.uitval.id} bedrijf={bedrijf} plan={plan} gevolg={g} naar={naar} handel={handel} />]
          : g.plekken.map((p, i) => (
              <UitvalRegel
                key={`${g.uitval.id}|${i}`}
                bedrijf={bedrijf}
                plan={plan}
                gevolg={g}
                plek={p}
                naar={naar}
                handel={handel}
              />
            ))
      )}
    </ul>
  )
}

function UitvalRegel({
  bedrijf,
  plan,
  gevolg,
  plek,
  naar,
  handel
}: {
  bedrijf: Bedrijf
  plan?: DagPlan
  gevolg: UitvalGevolg
  plek?: UitvalPlek
  naar?: Naar
  handel?: Handel
}): JSX.Element {
  const tr = useT()
  const taal = useLanguage()
  const geld = useGeld()
  const [bezig, setBezig] = useState(false)
  const stand = plek ? standZin(taal, bedrijf, plek) : undefined
  const open = plek !== undefined && plek.stand.bron !== 'hand'
  const toon = !plek ? 'rustig' : stand?.toon ?? (gevolg.uitval.soort === 'pech' ? 'laat' : 'let')
  // De goedkoopste redelijke keuze, alleen als er een snelle knop gevraagd is.
  const snel = useMemo(() => {
    if (!handel || !plan || !plek || !open) return undefined
    return invulOpties(bedrijf, plan, doelVan(plek)).find((o) => o.standaard && o.beschikbaar)
  }, [handel, plan, plek, open, bedrijf])

  return (
    <li className={`bd-uitval-regel ${toon}`}>
      <i aria-hidden="true" />
      <span className="bd-uitval-tekst">
        <span>{uitvalZin(taal, bedrijf, gevolg, plek, Boolean(plan?.vandaag && plan.dag === bedrijf.dag))}</span>
        {stand && <small className={stand.toon}>{stand.tekst}</small>}
      </span>
      {plek && (
        <span className="bd-uitval-knoppen">
          {snel && handel && (
            <button
              type="button"
              className="bd-knop hoofd"
              disabled={bezig}
              onClick={() => {
                setBezig(true)
                void handel(window.career.bedrijfInvullen(doelVan(plek), snel.keuze)).finally(() => setBezig(false))
              }}
            >
              {keuzeTekst(taal, bedrijf, snel.keuze)} · {geld(snel.kosten)}
            </button>
          )}
          {naar && (
            <button type="button" className="bd-knop" onClick={() => naar('planning', focusVan(bedrijf, plek))}>
              {tr('bd.uitval.invullen')}
            </button>
          )}
        </span>
      )}
    </li>
  )
}
