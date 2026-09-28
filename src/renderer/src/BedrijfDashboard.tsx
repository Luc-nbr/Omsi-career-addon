import { useMemo, type JSX } from 'react'
import {
  REGELS,
  dagprognose,
  isInzetbaar,
  lijnnaam,
  waardeVan,
  type Bedrijf as BedrijfStaat
} from '../../core/bedrijf'
import { useLanguage, useT } from './language'
import { Grafiek } from './BedrijfGrafiek'
import { type Tab, useGeld, Tegel, Paneel, Staatbalk, Boeken } from './BedrijfDelen'

/* ------------------------------------------------------------------ */
/* Dashboard                                                          */
/* ------------------------------------------------------------------ */

export function Dashboard({ bedrijf, naar }: { bedrijf: BedrijfStaat; naar: (tab: Tab) => void }): JSX.Element {
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
  const resultaat = prognose.vergoeding - prognose.kosten
  const vlootwaarde = bussen.reduce((som, b) => som + waardeVan(b), 0)
  const inzetbaar = bussen.filter((b) => isInzetbaar(b, bedrijf.dag)).length

  const aandacht = useMemo(() => {
    const lijst: Array<{ soort: 'laat' | 'let'; tekst: string; tab: Tab }> = []
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
    for (const m of bedrijf.personeel ?? []) {
      if (m.ziekTot !== undefined && m.ziekTot >= bedrijf.dag)
        lijst.push({ soort: 'let', tekst: tr('bd.alert.sick', { name: m.naam, day: m.ziekTot }), tab: 'personeel' })
      else if (m.tevredenheid < REGELS.vertrekOnder + 10)
        lijst.push({ soort: 'laat', tekst: tr('bd.alert.unhappy', { name: m.naam }), tab: 'personeel' })
    }
    return lijst
  }, [bedrijf])

  return (
    <div className="bd-dashboard">
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
          sub={tr('bd.todaySub', { in: geld(prognose.vergoeding), out: geld(prognose.kosten) })}
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
          sub={tr('bd.toursHours', { tours: prognose.benodigd, hours: Math.round(prognose.uren) })}
        />
        <Tegel
          titel={tr('bd.nav.fleet')}
          waarde={`${inzetbaar} / ${bussen.length}`}
          sub={tr('bd.fleetSub', {
            share: prognose.benodigd ? Math.round(prognose.dekking * 100) : 0,
            money: geld(vlootwaarde)
          })}
        >
          <span className="bd-meter">
            <i style={{ width: `${Math.round(prognose.dekking * 100)}%` }} />
          </span>
        </Tegel>
        <Tegel
          titel={tr('bd.nav.staff')}
          waarde={`${prognose.eigenDiensten + prognose.zelfDiensten} / ${prognose.diensten}`}
          sub={tr('bd.staffSub', {
            open: prognose.openDiensten,
            people: (bedrijf.personeel ?? []).length
          })}
          toon={prognose.diensten > 0 && prognose.openDiensten === 0 ? 'goed' : undefined}
        >
          <span className="bd-meter">
            <i
              style={{
                width: `${prognose.diensten ? Math.round(((prognose.eigenDiensten + prognose.zelfDiensten) / prognose.diensten) * 100) : 0}%`
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
                  <button type="button" onClick={() => naar(a.tab)}>
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
