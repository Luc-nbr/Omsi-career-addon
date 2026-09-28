import { useEffect, useMemo, useState, type JSX, type ReactNode } from 'react'
import {
  REGELS,
  dagprognose,
  dagresultaat,
  heeftConcessie,
  inschrijfkosten,
  isInzetbaar,
  lijnnaam,
  onderhoudskosten,
  reparatiekosten,
  urenVanLijn,
  waardeVan,
  type Aanbod,
  type Bedrijf as BedrijfStaat,
  type EigenBus,
  type MarktBus
} from '../../core/bedrijf'
import type { LineSummary } from '../../core/duty'
import type { CareerPayload, MapSummary } from '../../shared/api'
import { formatMoney } from '../../shared/format'
import { loose, type TextKey } from '../../shared/i18n'
import { Icoon, type Icoonnaam } from './Icoon'
import { useLanguage, useT } from './language'
import { Grafiek } from './BedrijfGrafiek'
import './bedrijf.css'

/*
 * Het busbedrijf als eigen app.
 *
 * WAAROM EEN EIGEN SCHERM
 * Luc: "het busbedrijf moet zijn eigen UI krijgen en een uitgebreid
 * dashboard". Het stond eerst als vrije inhoud op het vel van de opzetstappen,
 * met de stappenbalk erboven -- maar een bedrijf is geen stap op weg naar een
 * dienst, het is een plek waar je terugkomt. Dus een eigen venstervullend
 * scherm met een zijbalk, zoals een beheerprogramma, en het dashboard voorop.
 *
 * De kleuren komen van `.hub` (theme.css): dezelfde laag als het hoofdmenu, dus
 * donker en licht volgen vanzelf.
 */

type Tab = 'dashboard' | 'concessies' | 'wagenpark' | 'markt' | 'boeken'

const TABS: Array<{ tab: Tab; icoon: Icoonnaam; tekst: TextKey }> = [
  { tab: 'dashboard', icoon: 'record', tekst: 'bd.nav.dashboard' },
  { tab: 'concessies', icoon: 'line', tekst: 'bd.nav.concessions' },
  { tab: 'wagenpark', icoon: 'bus', tekst: 'bd.nav.fleet' },
  { tab: 'markt', icoon: 'kaartje', tekst: 'bd.nav.market' },
  { tab: 'boeken', icoon: 'logboek', tekst: 'bd.nav.books' }
]

interface Props {
  bedrijf?: BedrijfStaat
  onCareer: (payload: CareerPayload) => void
  onTerug: () => void
}

export function BedrijfApp({ bedrijf, onCareer, onTerug }: Props): JSX.Element {
  const tr = useT()
  const [tab, setTab] = useState<Tab>('dashboard')
  const [melding, setMelding] = useState<string>()

  if (!bedrijf) {
    return (
      <div className="hub bd-app bd-leeg-app">
        <button type="button" className="bd-terug los" onClick={onTerug}>
          ← {tr('setup.back')}
        </button>
        <Oprichten onCareer={onCareer} />
      </div>
    )
  }

  const handel = async (
    doen: Promise<{ payload: CareerPayload; fout?: string } | CareerPayload>
  ): Promise<void> => {
    const uit = await doen
    if ('payload' in uit) {
      onCareer(uit.payload)
      setMelding(uit.fout === 'kas' ? tr('bd.tooExpensive') : uit.fout ? tr('bd.failed') : undefined)
    } else {
      onCareer(uit)
      setMelding(undefined)
    }
  }

  return (
    <div className="hub bd-app">
      <aside className="bd-zij">
        <div className="bd-merk">
          <span className="bd-logo" aria-hidden="true">
            {bedrijf.naam.slice(0, 1).toUpperCase()}
          </span>
          <span>
            <b>{bedrijf.naam}</b>
            <small>{tr('bd.dayN', { day: bedrijf.dag })}</small>
          </span>
        </div>
        <nav>
          {TABS.map((t) => (
            <button
              key={t.tab}
              type="button"
              className={tab === t.tab ? 'actief' : ''}
              aria-current={tab === t.tab ? 'page' : undefined}
              onClick={() => setTab(t.tab)}
            >
              <Icoon naam={t.icoon} />
              {tr(t.tekst)}
            </button>
          ))}
        </nav>
        <div className="bd-zij-onder">
          <button
            type="button"
            className="bd-knop hoofd breed"
            onClick={() => void handel(window.career.bedrijfDagAf())}
          >
            {tr('bd.closeDay')}
          </button>
          <button type="button" className="bd-terug" onClick={onTerug}>
            ← {tr('bd.toMenu')}
          </button>
        </div>
      </aside>

      <main className="bd-hoofd">
        <header className="bd-balk">
          <h1>{tr(TABS.find((t) => t.tab === tab)!.tekst)}</h1>
          <KasChip bedrijf={bedrijf} />
        </header>
        {melding && (
          <p className="bd-melding" role="status">
            {melding}
          </p>
        )}
        {tab === 'dashboard' && <Dashboard bedrijf={bedrijf} naar={setTab} />}
        {tab === 'concessies' && <Concessies bedrijf={bedrijf} handel={handel} />}
        {tab === 'wagenpark' && <Wagenpark bedrijf={bedrijf} handel={handel} />}
        {tab === 'markt' && <Markt bedrijf={bedrijf} handel={handel} />}
        {tab === 'boeken' && <Boeken bedrijf={bedrijf} alle />}
      </main>
    </div>
  )
}

type Handel = (doen: Promise<{ payload: CareerPayload; fout?: string } | CareerPayload>) => Promise<void>

function useGeld(): (centen: number, teken?: boolean) => string {
  const taal = useLanguage()
  return (centen, teken) => `${teken && centen > 0 ? '+' : ''}${formatMoney(centen / 100, taal)}`
}

function KasChip({ bedrijf }: { bedrijf: BedrijfStaat }): JSX.Element {
  const tr = useT()
  const geld = useGeld()
  return (
    <span className={`bd-kaschip ${bedrijf.kas < 0 ? 'laat' : ''}`}>
      <small>{tr('bd.cash')}</small>
      {geld(bedrijf.kas)}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                          */
/* ------------------------------------------------------------------ */

function Dashboard({ bedrijf, naar }: { bedrijf: BedrijfStaat; naar: (tab: Tab) => void }): JSX.Element {
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
          sub={tr('bd.fleetValue', { money: geld(vlootwaarde) })}
        />
        <Tegel
          titel={tr('bd.coverage')}
          waarde={prognose.benodigd ? `${Math.round(prognose.dekking * 100)}%` : '—'}
          sub={tr('bd.coverageSub')}
        >
          <span className="bd-meter">
            <i style={{ width: `${Math.round(prognose.dekking * 100)}%` }} />
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

function Tegel({
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

function Paneel({
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
function Staatbalk({ staat, schade }: { staat: number; schade: number }): JSX.Element {
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

/* ------------------------------------------------------------------ */
/* Concessies en aanbestedingen                                       */
/* ------------------------------------------------------------------ */

function Concessies({ bedrijf, handel }: { bedrijf: BedrijfStaat; handel: Handel }): JSX.Element {
  const tr = useT()
  const geld = useGeld()
  return (
    <div className="bd-kolom">
      <Paneel titel={tr('bd.concessions')}>
        {bedrijf.concessies.length === 0 ? (
          <p className="bd-rustig">{tr('bd.noConcessions')}</p>
        ) : (
          <ul className="bd-lijst">
            {bedrijf.concessies.map((c) => {
              const r = dagresultaat(c, bedrijf.reputatie)
              const over = c.tot - bedrijf.dag
              return (
                <li key={`${c.mapFolder}|${c.lineFile}`}>
                  <span className="bd-lijn">{lijnnaam(c)}</span>
                  <span className="bd-wat">
                    <b>{c.mapName}</b>
                    <small>{tr('bd.lineTours', { tours: c.omlopen, hours: c.urenPerDag })}</small>
                  </span>
                  <span className="bd-bedrag optijd">{geld(r.vergoeding, true)}</span>
                  <span className={`bd-tot ${over <= 5 ? 'let' : ''}`}>{tr('bd.until', { day: c.tot })}</span>
                  <button
                    type="button"
                    className="bd-knop"
                    onClick={() => {
                      if (!window.confirm(tr('bd.cancelAsk'))) return
                      void handel(window.career.bedrijfOpzeggen(c.mapFolder, c.lineFile))
                    }}
                  >
                    {tr('bd.cancel')}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Paneel>
      <Aanbestedingen bedrijf={bedrijf} handel={handel} />
    </div>
  )
}

function Aanbestedingen({ bedrijf, handel }: { bedrijf: BedrijfStaat; handel: Handel }): JSX.Element {
  const tr = useT()
  const geld = useGeld()
  const [kaarten, setKaarten] = useState<MapSummary[]>([])
  const [kaart, setKaart] = useState('')
  const [lijnen, setLijnen] = useState<LineSummary[]>()
  const [bezig, setBezig] = useState(false)

  useEffect(() => {
    void window.career.maps().then((lijst) => {
      setKaarten(lijst)
      setKaart((huidig) => huidig || bedrijf.concessies[0]?.mapFolder || lijst[0]?.folder || '')
    })
  }, [])

  useEffect(() => {
    if (!kaart) return
    let geldig = true
    setLijnen(undefined)
    void window.career
      .lines(kaart)
      .then((uit) => geldig && setLijnen(uit))
      .catch(() => geldig && setLijnen([]))
    return () => {
      geldig = false
    }
  }, [kaart])

  const gesorteerd = useMemo(() => [...(lijnen ?? [])].sort((a, b) => b.tours - a.tours), [lijnen])

  return (
    <section className="bd-paneel">
      <div className="bd-paneelkop">
        <h2>{tr('bd.market')}</h2>
        <select value={kaart} onChange={(e) => setKaart(e.target.value)} aria-label={tr('bd.chooseMap')}>
          {kaarten.map((k) => (
            <option key={k.folder} value={k.folder}>
              {k.name}
            </option>
          ))}
        </select>
      </div>
      {!lijnen ? (
        <p className="bd-rustig">{tr('bd.loading')}</p>
      ) : (
        <ul className="bd-lijst">
          {gesorteerd.map((lijn) => {
            const kosten = inschrijfkosten(lijn)
            const uren = urenVanLijn(lijn)
            const dag = dagresultaat({ urenPerDag: uren }, bedrijf.reputatie)
            return (
              <li key={lijn.lineFile}>
                <span className="bd-lijn">{lijnnaam(lijn)}</span>
                <span className="bd-wat">
                  <b>{lijn.lineFile}</b>
                  <small>{tr('bd.lineTours', { tours: lijn.tours, hours: uren })}</small>
                </span>
                <span className="bd-bedrag optijd">{geld(dag.vergoeding, true)}</span>
                <span />
                {heeftConcessie(bedrijf, kaart, lijn.lineFile) ? (
                  <span className="bd-eigen">{tr('bd.owned')}</span>
                ) : (
                  <button
                    type="button"
                    className="bd-knop"
                    disabled={bezig || bedrijf.kas < kosten}
                    title={bedrijf.kas < kosten ? tr('bd.tooExpensive') : undefined}
                    onClick={() => {
                      setBezig(true)
                      void handel(window.career.bedrijfInschrijven(kaart, lijn.lineFile)).finally(() =>
                        setBezig(false)
                      )
                    }}
                  >
                    {tr('bd.bid', { money: geld(kosten) })}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Wagenpark en werkplaats                                            */
/* ------------------------------------------------------------------ */

function Wagenpark({ bedrijf, handel }: { bedrijf: BedrijfStaat; handel: Handel }): JSX.Element {
  const tr = useT()
  const geld = useGeld()
  const bussen = bedrijf.bussen ?? []
  if (bussen.length === 0) {
    return (
      <Paneel titel={tr('bd.nav.fleet')}>
        <p className="bd-rustig">{tr('bd.noBuses')}</p>
      </Paneel>
    )
  }
  return (
    <Paneel titel={tr('bd.fleetCount', { n: bussen.length })}>
      <ul className="bd-vloot">
        {bussen.map((b) => (
          <BusRij key={b.nummer} bus={b} dag={bedrijf.dag} geld={geld} handel={handel} kas={bedrijf.kas} tr={tr} />
        ))}
      </ul>
    </Paneel>
  )
}

function BusRij({
  bus,
  dag,
  kas,
  geld,
  handel,
  tr
}: {
  bus: EigenBus
  dag: number
  kas: number
  geld: (c: number, t?: boolean) => string
  handel: Handel
  tr: ReturnType<typeof useT>
}): JSX.Element {
  const taal = useLanguage()
  const werkplaats = bus.werkplaatsTot !== undefined && bus.werkplaatsTot >= dag
  const inzet = isInzetbaar(bus, dag)
  const onderhoud = onderhoudskosten(bus)
  const reparatie = reparatiekosten(bus)
  return (
    <li>
      <span className="bd-nummer groot">{bus.nummer}</span>
      <span className="bd-wat">
        <b>{bus.naam}</b>
        <small>
          {loose(taal, `bd.shape.${bus.vorm}`, bus.vorm)} · {Math.round(bus.km / 1000)}k km ·{' '}
          {tr('bd.value', { money: geld(waardeVan(bus)) })}
        </small>
      </span>
      <Staatbalk staat={bus.staat} schade={bus.schade} />
      <span className={`bd-status ${werkplaats ? 'let' : inzet ? 'optijd' : 'laat'}`}>
        {tr(werkplaats ? 'bd.status.workshop' : inzet ? 'bd.status.active' : 'bd.status.parked')}
      </span>
      <span className="bd-acties">
        <button
          type="button"
          className="bd-knop"
          disabled={werkplaats || bus.staat >= 99 || kas < onderhoud}
          onClick={() => void handel(window.career.bedrijfWerkplaats(bus.nummer, 'onderhoud'))}
        >
          {tr('bd.service', { money: geld(onderhoud) })}
        </button>
        {bus.schade > 0 && (
          <button
            type="button"
            className="bd-knop"
            disabled={werkplaats || kas < reparatie}
            onClick={() => void handel(window.career.bedrijfWerkplaats(bus.nummer, 'reparatie'))}
          >
            {tr('bd.repair', { money: geld(reparatie) })}
          </button>
        )}
        <button
          type="button"
          className="bd-knop zacht"
          onClick={() => {
            if (!window.confirm(tr('bd.sellAsk', { money: geld(Math.round(waardeVan(bus) * REGELS.verkoopFactor)) })))
              return
            void handel(window.career.bedrijfVerkoop(bus.nummer))
          }}
        >
          {tr('bd.sell')}
        </button>
      </span>
    </li>
  )
}

/* ------------------------------------------------------------------ */
/* Busmarkt                                                           */
/* ------------------------------------------------------------------ */

function Markt({ bedrijf, handel }: { bedrijf: BedrijfStaat; handel: Handel }): JSX.Element {
  const tr = useT()
  const geld = useGeld()
  const taal = useLanguage()
  const [markt, setMarkt] = useState<{ nieuw: MarktBus[]; tweedehands: Aanbod[] }>()
  const [zoek, setZoek] = useState('')
  const [bezig, setBezig] = useState(false)

  useEffect(() => {
    void window.career.bedrijfMarkt().then(setMarkt)
  }, [bedrijf.dag, bedrijf.aanbodWeg?.length])

  const koop = (soort: 'nieuw' | 'tweedehands', wat: string | number): void => {
    setBezig(true)
    void handel(window.career.bedrijfKoop(soort, wat)).finally(() => setBezig(false))
  }

  const nieuw = (markt?.nieuw ?? []).filter((b) => b.naam.toLowerCase().includes(zoek.trim().toLowerCase()))

  return (
    <div className="bd-kolom">
      <Paneel titel={tr('bd.usedToday', { day: bedrijf.dag })}>
        {!markt ? (
          <p className="bd-rustig">{tr('bd.loading')}</p>
        ) : markt.tweedehands.length === 0 ? (
          <p className="bd-rustig">{tr('bd.usedSoldOut')}</p>
        ) : (
          <div className="bd-aanbod">
            {markt.tweedehands.map((a) => (
              <article key={a.nr} className="bd-kaart">
                <span className="bd-vorm">{loose(taal, `bd.shape.${a.bus.vorm}`, a.bus.vorm)}</span>
                <b>{a.bus.naam}</b>
                <small>{Math.round(a.km / 1000)}k km</small>
                <Staatbalk staat={a.staat} schade={0} />
                <span className="bd-prijs">{geld(a.prijs)}</span>
                <button
                  type="button"
                  className="bd-knop hoofd"
                  disabled={bezig || bedrijf.kas < a.prijs}
                  onClick={() => koop('tweedehands', a.nr)}
                >
                  {tr('bd.buy')}
                </button>
              </article>
            ))}
          </div>
        )}
      </Paneel>
      <section className="bd-paneel">
        <div className="bd-paneelkop">
          <h2>{tr('bd.newBuses')}</h2>
          <input
            className="bd-zoek"
            value={zoek}
            placeholder={tr('bd.search')}
            onChange={(e) => setZoek(e.target.value)}
          />
        </div>
        <ul className="bd-lijst nieuw">
          {nieuw.slice(0, 60).map((b) => {
            const prijs = REGELS.nieuwprijs[b.vorm]
            return (
              <li key={b.relativePath}>
                <span className="bd-vorm">{loose(taal, `bd.shape.${b.vorm}`, b.vorm)}</span>
                <span className="bd-wat">
                  <b>{b.naam}</b>
                  <small>{b.relativePath}</small>
                </span>
                <span className="bd-bedrag">{geld(prijs)}</span>
                <button
                  type="button"
                  className="bd-knop"
                  disabled={bezig || bedrijf.kas < prijs}
                  onClick={() => koop('nieuw', b.relativePath)}
                >
                  {tr('bd.buy')}
                </button>
              </li>
            )
          })}
        </ul>
        {nieuw.length > 60 && <p className="bd-rustig">{tr('bd.moreBuses', { n: nieuw.length - 60 })}</p>}
      </section>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Boekingen                                                          */
/* ------------------------------------------------------------------ */

function Boeken({ bedrijf, alle }: { bedrijf: BedrijfStaat; alle?: boolean }): JSX.Element {
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

/* ------------------------------------------------------------------ */
/* Oprichten                                                          */
/* ------------------------------------------------------------------ */

function Oprichten({ onCareer }: { onCareer: (payload: CareerPayload) => void }): JSX.Element {
  const tr = useT()
  const taal = useLanguage()
  const [naam, setNaam] = useState('')
  return (
    <section className="bd-paneel bd-oprichten">
      <span className="bd-logo groot" aria-hidden="true">
        {(naam.trim() || '?').slice(0, 1).toUpperCase()}
      </span>
      <h1>{tr('bd.foundTitle')}</h1>
      <p>{tr('bd.foundText', { money: formatMoney(REGELS.startkapitaal / 100, taal) })}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void window.career.bedrijfOprichten(naam).then(onCareer)
        }}
      >
        <input
          value={naam}
          maxLength={60}
          placeholder={tr('bd.namePlaceholder')}
          onChange={(e) => setNaam(e.target.value)}
          autoFocus
        />
        <button type="submit" className="bd-knop hoofd">
          {tr('bd.found')}
        </button>
      </form>
    </section>
  )
}
