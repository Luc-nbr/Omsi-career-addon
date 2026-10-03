import { useMemo, type JSX } from 'react'
import {
  REGELS,
  dagprognose,
  isInzetbaar,
  lijnnaam,
  waardeVan,
  type Bedrijf as BedrijfStaat
} from '../../core/bedrijf'
import type { DagPlan, PlanCijfers } from '../../core/planTypen'
import { useLanguage, useT } from './language'
import { Grafiek } from './BedrijfGrafiek'
import { type Focus, type Naar, type Tab, useGeld, Tegel, Paneel, Staatbalk, Boeken } from './BedrijfDelen'

/* ------------------------------------------------------------------ */
/* Dashboard                                                          */
/* ------------------------------------------------------------------ */

/**
 * Met de planning (deel A) komen de tegels uit het plan van vandaag
 * (`cijfers`, zoals de afsluiting het boekt); zonder plan uit de oude
 * `dagprognose`.
 */
export function Dashboard({
  bedrijf,
  plan,
  cijfers,
  naar
}: {
  bedrijf: BedrijfStaat
  plan?: DagPlan
  cijfers?: PlanCijfers
  naar: Naar
}): JSX.Element {
  const tr = useT()
  const geld = useGeld()
  const taal = useLanguage()
  /* Op de as kort: € 150k in plaats van € 151.678,02. */
  const kort = (centen: number): string =>
    new Intl.NumberFormat(taal === 'en' ? 'en-GB' : `${taal}-${taal.toUpperCase()}`, {
      style: 'currency',
      currency: 'EUR',
      notation: 'compact',
      maximumFractionDigits: 1
    }).format(centen / 100)
  const prognose = dagprognose(bedrijf)
  const historie = bedrijf.historie ?? []
  const gisteren = historie[historie.length - 1]
  const eergisteren = historie[historie.length - 2]
  const bussen = bedrijf.bussen ?? []
  const inkomsten = cijfers ? cijfers.vergoeding + cijfers.legacyZelf : prognose.vergoeding
  const uitgaven = cijfers ? cijfers.kosten : prognose.kosten
  const resultaat = inkomsten - uitgaven
  // Dekking en bezetting: uit het plan als dat er is.
  const dekking = plan && cijfers ? (cijfers.omlopen ? cijfers.eigenOmlopen / cijfers.omlopen : 0) : prognose.dekking
  const eigenDiensten = plan && cijfers ? cijfers.eigenDiensten + cijfers.jijDiensten : prognose.eigenDiensten + prognose.zelfDiensten
  const diensten = plan && cijfers ? cijfers.diensten : prognose.diensten
  const openDiensten = plan && cijfers ? cijfers.openDiensten : prognose.openDiensten
  const vlootwaarde = bussen.reduce((som, b) => som + waardeVan(b), 0)
  const inzetbaar = bussen.filter((b) => isInzetbaar(b, bedrijf.dag)).length

  const aandacht = useMemo(() => {
    const lijst: Array<{ soort: 'laat' | 'let'; tekst: string; tab: Tab; focus?: Focus }> = []
    if (bedrijf.kas < 0) lijst.push({ soort: 'laat', tekst: tr('bd.alert.cash'), tab: 'boeken' })
    for (const b of bussen) {
      if (b.schade >= REGELS.inzetbaarTotSchade)
        lijst.push({ soort: 'laat', tekst: tr('bd.alert.damaged', { bus: b.nummer }), tab: 'wagenpark' })
      else if (b.staat < REGELS.inzetbaarVanafStaat)
        lijst.push({ soort: 'laat', tekst: tr('bd.alert.worn', { bus: b.nummer }), tab: 'wagenpark' })
      else if (b.staat < 50 || b.schade > 0)
        lijst.push({ soort: 'let', tekst: tr('bd.alert.service', { bus: b.nummer }), tab: 'wagenpark' })
    }
    for (const c of bedrijf.concessies) {
      const over = c.tot - bedrijf.dag
      if (over <= 5)
        lijst.push({
          soort: bedrijf.reputatie < REGELS.verlengVanaf ? 'laat' : 'let',
          tekst: tr(bedrijf.reputatie < REGELS.verlengVanaf ? 'bd.alert.expiresLost' : 'bd.alert.expires', {
            line: lijnnaam(c),
            days: Math.max(0, over)
          }),
          tab: 'concessies'
        })
    }
    if (plan) {
      // Open gaten en conflicten: naar de planning, met de eerste in beeld.
      const diensten = plan.kaarten.flatMap((k) => k.omlopen.flatMap((po) => po.diensten))
      const lastig = diensten.filter(
        (pd) => pd.plots || pd.uitgevallen > 0 || pd.conflicten.some((c) => c.ernst === 'fout')
      )
      if (lastig.length > 0)
        lijst.push({
          soort: lastig.some((pd) => pd.uitgevallen > 0) ? 'laat' : 'let',
          tekst: tr('bd.plan.conflictOpen', { n: lastig.length }),
          tab: 'planning',
          focus: { dag: plan.dag, dienst: lastig[0].dienst.sleutel }
        })
      // Stilstand: een bus of chauffeur die vandaag niets doet.
      for (const nr of plan.vrij.bussen)
        lijst.push({ soort: 'let', tekst: tr('bd.plan.stilBus', { bus: nr }), tab: 'planning', focus: { dag: plan.dag, bus: nr } })
      for (const id of plan.vrij.chauffeurs) {
        const m = (bedrijf.personeel ?? []).find((x) => x.id === id)
        if (m) lijst.push({ soort: 'let', tekst: tr('bd.plan.stilChauffeur', { naam: m.naam }), tab: 'planning', focus: { dag: plan.dag, medewerker: id } })
      }
      // SLOT deel B: ...aandachtUitval(bedrijf, plan) komt hier bij de integratie.
    } else {
      if (prognose.benodigd > 0 && prognose.dekking < 1)
        lijst.push({
          soort: 'let',
          tekst: tr('bd.alert.coverage', { need: prognose.benodigd - prognose.inzetbaar }),
          tab: 'markt'
        })
      if (prognose.openDiensten > 0)
        lijst.push({
          soort: 'let',
          tekst: tr('bd.alert.openShifts', { n: prognose.openDiensten }),
          tab: 'personeel'
        })
    }
    for (const m of bedrijf.personeel ?? []) {
      if (m.ziekTot !== undefined && m.ziekTot >= bedrijf.dag)
        lijst.push({ soort: 'let', tekst: tr('bd.alert.sick', { name: m.naam, day: m.ziekTot }), tab: 'personeel' })
      else if (m.tevredenheid < REGELS.vertrekOnder + 10)
        lijst.push({ soort: 'laat', tekst: tr('bd.alert.unhappy', { name: m.naam }), tab: 'personeel' })
    }
    return lijst
  }, [bedrijf, plan])

  return (
    <div className="bd-dashboard">
      {/* SLOT deel B: <UitvalMeldingen bedrijf plan naar /> bovenaan; SLOT deel D: <ZelfRijdenTegel /> bij de tegels. */}
      <div className="bd-tegels">
        <Tegel
          titel={tr('bd.cash')}
          waarde={geld(bedrijf.kas)}
          sub={
            gisteren && eergisteren
              ? tr('bd.sinceYesterday', { money: geld(gisteren.kas - eergisteren.kas, true) })
              : undefined
          }
          toon={bedrijf.kas < 0 ? 'laat' : undefined}
        />
        <Tegel
          titel={tr('bd.today')}
          waarde={geld(resultaat, true)}
          sub={tr('bd.todaySub', { in: geld(inkomsten), out: geld(uitgaven) })}
          toon={resultaat < 0 ? 'laat' : resultaat > 0 ? 'goed' : undefined}
        />
        <Tegel titel={tr('bd.reputation')} waarde={`${bedrijf.reputatie}`} sub="/ 100">
          <span className="bd-meter">
            <i style={{ width: `${bedrijf.reputatie}%` }} />
            <b style={{ left: `${REGELS.verlengVanaf}%` }} title={tr('bd.renewLine')} />
          </span>
        </Tegel>
        <Tegel
          titel={tr('bd.concessions')}
          waarde={`${bedrijf.concessies.length}`}
          sub={
            plan
              ? tr('bd.plan.toursToday', { tours: plan.telling.omlopen, hours: Math.round(plan.telling.rituren) })
              : tr('bd.toursHours', { tours: prognose.benodigd, hours: Math.round(prognose.uren) })
          }
        />
        <Tegel
          titel={tr('bd.nav.fleet')}
          waarde={`${inzetbaar} / ${bussen.length}`}
          sub={tr('bd.fleetSub', {
            share: Math.round(dekking * 100),
            money: geld(vlootwaarde)
          })}
        >
          <span className="bd-meter">
            <i style={{ width: `${Math.round(dekking * 100)}%` }} />
          </span>
        </Tegel>
        <Tegel
          titel={tr('bd.nav.staff')}
          waarde={`${eigenDiensten} / ${diensten}`}
          sub={tr('bd.staffSub', {
            open: openDiensten,
            people: (bedrijf.personeel ?? []).length
          })}
          toon={diensten > 0 && openDiensten === 0 ? 'goed' : undefined}
        >
          <span className="bd-meter">
            <i
              style={{
                width: `${diensten ? Math.round((eigenDiensten / diensten) * 100) : 0}%`
              }}
            />
          </span>
        </Tegel>
      </div>

      <div className="bd-rij">
        <Paneel titel={tr('bd.chart.cash')} breed>
          <Grafiek
            soort="lijn"
            punten={historie.map((h) => ({ x: h.dag, y: h.kas }))}
            opmaak={(v) => geld(v)}
            asOpmaak={kort}
            xNaam={(x) => tr('bd.dayN', { day: x })}
            leeg={tr('bd.chart.empty')}
          />
        </Paneel>
        <Paneel titel={tr('bd.attention')}>
          {aandacht.length === 0 ? (
            <p className="bd-rustig">{tr('bd.allGood')}</p>
          ) : (
            <ul className="bd-aandacht">
              {aandacht.slice(0, 7).map((a, i) => (
                <li key={i}>
                  <button type="button" onClick={() => naar(a.tab, a.focus)}>
                    <i className={a.soort} aria-hidden="true" />
                    {a.tekst}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Paneel>
      </div>

      <div className="bd-rij">
        <Paneel titel={tr('bd.chart.result')} breed>
          <Grafiek
            soort="staaf"
            punten={historie.map((h) => ({ x: h.dag, y: h.resultaat ?? h.inkomsten - h.uitgaven }))}
            opmaak={(v) => geld(v, true)}
            asOpmaak={kort}
            xNaam={(x) => tr('bd.dayN', { day: x })}
            leeg={tr('bd.chart.empty')}
          />
        </Paneel>
        <Paneel titel={tr('bd.chart.reputation')}>
          <Grafiek
            soort="lijn"
            punten={historie.map((h) => ({ x: h.dag, y: h.reputatie }))}
            opmaak={(v) => `${Math.round(v)}`}
            xNaam={(x) => tr('bd.dayN', { day: x })}
            leeg={tr('bd.chart.empty')}
            bereik={[0, 100]}
            klein
          />
        </Paneel>
      </div>

      <div className="bd-rij">
        <Paneel titel={tr('bd.fleetState')} actie={{ tekst: tr('bd.nav.fleet'), doen: () => naar('wagenpark') }}>
          {bussen.length === 0 ? (
            <p className="bd-rustig">{tr('bd.noBuses')}</p>
          ) : (
            <ul className="bd-vlootstaat">
              {[...bussen]
                .sort((a, b) => a.staat - a.schade - (b.staat - b.schade))
                .slice(0, 6)
                .map((b) => (
                  <li key={b.nummer}>
                    <span className="bd-nummer">{b.nummer}</span>
                    <span className="bd-wat">
                      <b>{b.naam}</b>
                    </span>
                    <Staatbalk staat={b.staat} schade={b.schade} />
                  </li>
                ))}
            </ul>
          )}
        </Paneel>
        <Paneel titel={tr('bd.lastBooks')} actie={{ tekst: tr('bd.nav.books'), doen: () => naar('boeken') }}>
          <Boeken bedrijf={bedrijf} />
        </Paneel>
      </div>
    </div>
  )
}
