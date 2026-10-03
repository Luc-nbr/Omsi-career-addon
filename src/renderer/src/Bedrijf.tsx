import { useCallback, useState, type JSX } from 'react'
import { REGELS, ongelezen, type Bedrijf as BedrijfStaat } from '../../core/bedrijf'
import type { ActiveDuty } from '../../core/career'
import { PLAN_ACTIEF } from '../../core/rooster'
import type { CareerPayload } from '../../shared/api'
import { formatMoney } from '../../shared/format'
import { loose, type TextKey } from '../../shared/i18n'
import { Icoon, type Icoonnaam } from './Icoon'
import { useLanguage, useT } from './language'
import { Opleidingen, niveauVoortgang } from './BedrijfOpleiding'
import { Boeken, KasChip, type Focus, type Handel, type Naar, type Tab } from './BedrijfDelen'
import { Dashboard } from './BedrijfDashboard'
import { Concessies } from './BedrijfConcessies'
import { Markt, Wagenpark } from './BedrijfWagenpark'
import { Personeel } from './BedrijfPersoneel'
import { useDagplan } from './useDagplan'
import { Postvak } from './BedrijfPost'
import { Planning } from './Planning'
import { Vlootkaart } from './Vlootkaart'
import { DagAfsluitKnop } from './DagAfsluiten'
import { Ochtendvenster } from './Ochtendvenster'
import { BedrijfsritBanner, ZelfRijdenKnop, ZelfRijdenProvider } from './ZelfRijden'
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

const TABS: Array<{ tab: Tab; icoon: Icoonnaam; tekst: TextKey }> = [
  { tab: 'dashboard', icoon: 'record', tekst: 'bd.nav.dashboard' },
  { tab: 'post', icoon: 'post', tekst: 'bd.nav.mail' },
  { tab: 'planning', icoon: 'duty', tekst: 'bd.nav.planning' },
  { tab: 'kaart', icoon: 'map', tekst: 'bd.nav.map' },
  { tab: 'concessies', icoon: 'line', tekst: 'bd.nav.concessions' },
  { tab: 'wagenpark', icoon: 'bus', tekst: 'bd.nav.fleet' },
  { tab: 'markt', icoon: 'kaartje', tekst: 'bd.nav.market' },
  { tab: 'personeel', icoon: 'profile', tekst: 'bd.nav.staff' },
  { tab: 'opleidingen', icoon: 'licence', tekst: 'bd.nav.training' },
  { tab: 'boeken', icoon: 'logboek', tekst: 'bd.nav.books' }
]

/*
 * Planning en Kaart staan pas in de zijbalk als de planning aan staat
 * (PLAN_ACTIEF, core/rooster.ts); tot dan zijn het lege tabs.
 */
const ZICHTBAAR = TABS.filter((t) => PLAN_ACTIEF || (t.tab !== 'planning' && t.tab !== 'kaart'))

interface Props {
  bedrijf?: BedrijfStaat
  /** De dienst die nu loopt; bij een bedrijfsrit staat daar `bedrijf` in. */
  activeDuty?: ActiveDuty
  /*
   * De tab en de melding wonen in App, zodat ze een rit naar OMSI en terug
   * overleven (ontwerp §3.2).
   */
  tab: Tab
  onTab: (tab: Tab) => void
  melding?: string
  onMelding: (melding: string | undefined) => void
  onCareer: (payload: CareerPayload) => void
  onTerug: () => void
  /** Zelf een dienst rijden (deel D); `later` zet hem klaar zonder te starten. */
  onRijden?: (payload: CareerPayload, later?: boolean) => void
  /** Naar het scherm van de lopende rit (deel D). */
  onNaarRit?: () => void
}

export function BedrijfApp({
  bedrijf,
  activeDuty,
  tab,
  onTab,
  melding,
  onMelding,
  onCareer,
  onTerug,
  onRijden,
  onNaarRit
}: Props): JSX.Element {
  const tr = useT()
  const taal = useLanguage()
  const lopend = activeDuty?.bedrijf
  // Eén keer per scherm; de tabs krijgen het plan door (deel A en verder).
  const { plan, cijfers } = useDagplan(bedrijf, bedrijf?.dag, lopend, onCareer)
  /*
   * Waar een tab op opent (een omloop, dienst, bus of vorm). Woont hier en niet
   * in App: na een rit naar OMSI en terug opent de tab gewoon bovenaan.
   */
  const [focus, setFocus] = useState<Focus>()
  // Het ochtendvenster na Dag afsluiten (deel B).
  const [ochtend, setOchtend] = useState(false)
  const setTab: Naar = useCallback(
    (t, f) => {
      setFocus(f)
      onTab(t)
    },
    [onTab]
  )
  const setMelding = onMelding

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

  const handel: Handel = async (doen) => {
    const uit = await doen
    if ('payload' in uit) {
      onCareer(uit.payload)
      setMelding(
        uit.fout === 'kas'
          ? tr('bd.tooExpensive')
          : uit.fout
            ? loose(taal, `bd.fout.${uit.fout}`, tr('bd.failed'))
            : undefined
      )
    } else {
      onCareer(uit)
      setMelding(undefined)
    }
  }

  return (
    <ZelfRijdenProvider
      bedrijf={bedrijf}
      plan={plan}
      lopend={lopend}
      handel={handel}
      onRijden={onRijden ?? (() => undefined)}
    >
      <div className="hub bd-app">
        <aside className="bd-zij">
          <div className="bd-merk">
            <span className="bd-logo" aria-hidden="true">
              {bedrijf.naam.slice(0, 1).toUpperCase()}
            </span>
            <span>
              <b>{bedrijf.naam}</b>
              <small>
                {tr('bd.levelN', { n: niveauVoortgang(bedrijf).niveau })} · {tr('bd.dayN', { day: bedrijf.dag })}
              </small>
              <span className="bd-meter dun" title={tr('bd.nav.training')}>
                <i style={{ width: `${Math.round(niveauVoortgang(bedrijf).deel * 100)}%` }} />
              </span>
            </span>
          </div>
          <nav>
            {ZICHTBAAR.map((t) => (
              <button
                key={t.tab}
                type="button"
                className={tab === t.tab ? 'actief' : ''}
                aria-current={tab === t.tab ? 'page' : undefined}
                onClick={() => setTab(t.tab)}
              >
                <Icoon naam={t.icoon} />
                {tr(t.tekst)}
                {t.tab === 'post' && ongelezen(bedrijf) > 0 && <i className="bd-teller">{ongelezen(bedrijf)}</i>}
              </button>
            ))}
          </nav>
          <div className="bd-zij-onder">
            <DagAfsluitKnop
              bedrijf={bedrijf}
              plan={plan}
              lopend={lopend}
              handel={handel}
              naar={setTab}
              onGesloten={() => setOchtend(true)}
            />
            {PLAN_ACTIEF && onRijden && <ZelfRijdenKnop />}
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
          <BedrijfsritBanner
            bedrijf={bedrijf}
            lopend={lopend}
            gestart={Boolean(activeDuty?.startedAt)}
            onNaarRit={onNaarRit ?? (() => undefined)}
          />
          {melding && (
            <p className="bd-melding" role="status">
              {melding}
            </p>
          )}
          {tab === 'dashboard' && <Dashboard bedrijf={bedrijf} plan={plan} cijfers={cijfers} naar={setTab} />}
          {tab === 'post' && <Postvak bedrijf={bedrijf} onCareer={onCareer} />}
          {tab === 'planning' && (
            <Planning
              bedrijf={bedrijf}
              plan={plan}
              cijfers={cijfers}
              lopend={lopend}
              handel={handel}
              naar={setTab}
              focus={focus}
              onCareer={onCareer}
            />
          )}
          {tab === 'kaart' && <Vlootkaart bedrijf={bedrijf} plan={plan} lopend={lopend} naar={setTab} />}
          {tab === 'concessies' && <Concessies bedrijf={bedrijf} handel={handel} />}
          {tab === 'wagenpark' && <Wagenpark bedrijf={bedrijf} handel={handel} />}
          {tab === 'markt' && <Markt bedrijf={bedrijf} handel={handel} focus={focus} />}
          {tab === 'personeel' && <Personeel bedrijf={bedrijf} handel={handel} plan={plan} naar={setTab} />}
          {tab === 'opleidingen' && <Opleidingen bedrijf={bedrijf} handel={handel} />}
          {tab === 'boeken' && <Boeken bedrijf={bedrijf} alle />}
        </main>
        {ochtend && (
          <Ochtendvenster bedrijf={bedrijf} plan={plan} handel={handel} naar={setTab} onSluit={() => setOchtend(false)} />
        )}
      </div>
    </ZelfRijdenProvider>
  )
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
