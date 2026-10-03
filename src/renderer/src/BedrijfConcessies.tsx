import { useEffect, useMemo, useState, type JSX } from 'react'
import {
  REGELS,
  bedrijfsfactoren,
  dagresultaat,
  heeftConcessie,
  inschrijfkosten,
  lijnnaam,
  urenVanLijn,
  type Bedrijf as BedrijfStaat,
  type Concessie
} from '../../core/bedrijf'
import type { LineSummary } from '../../core/duty'
import type { LijnWeek } from '../../core/planTypen'
import { terugvalVanConcessie } from '../../core/plantarief'
import { PLAN_ACTIEF } from '../../core/rooster'
import type { MapSummary } from '../../shared/api'
import { useLanguage, useT } from './language'
import { eenDecimaal } from './Planning'
import { type Handel, useGeld, Paneel } from './BedrijfDelen'

/* ------------------------------------------------------------------ */
/* Concessies en aanbestedingen                                       */
/* ------------------------------------------------------------------ */

export function Concessies({ bedrijf, handel }: { bedrijf: BedrijfStaat; handel: Handel }): JSX.Element {
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
                    <small>
                      {c.week ? (
                        <WeekRegel bedrijf={bedrijf} week={c.week} />
                      ) : (
                        tr('bd.lineTours', { tours: c.omlopen, hours: c.urenPerDag })
                      )}
                    </small>
                  </span>
                  <span className="bd-bedrag optijd">
                    {geld(c.week ? terugvalVanConcessie(c, bedrijf.reputatie, bedrijfsfactoren(bedrijf)).vergoeding : r.vergoeding, true)}
                  </span>
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
  const [weken, setWeken] = useState<Record<string, LijnWeek>>()
  const [bezig, setBezig] = useState(false)
  const f = bedrijfsfactoren(bedrijf)

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
    /*
     * De week van elke lijn uit de dienstregeling: het weekgemiddelde aan
     * rituren en de piek aan omlopen. Daarop rekent de inschrijving (ontwerp
     * §0.9); zonder (kaart onleesbaar) de oude telling.
     */
    setWeken(undefined)
    if (PLAN_ACTIEF) {
      void window.career
        .bedrijfLijnWeek(kaart)
        .then((uit) => geldig && setWeken('fout' in uit ? {} : (uit as Record<string, LijnWeek>)))
        .catch(() => geldig && setWeken({}))
    }
    return () => {
      geldig = false
    }
  }, [kaart])
  const weekVan = (lineFile: string): LijnWeek | undefined =>
    weken ? Object.entries(weken).find(([k]) => k.toLowerCase() === lineFile.toLowerCase())?.[1] : undefined

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
      {PLAN_ACTIEF && (
        <p className="bd-rustig bd-klein">
          {tr('bd.plan.inschrijfUitleg', {
            vast: geld(Math.round(REGELS.inschrijvingVast * f.inschrijving)),
            per: geld(Math.round(REGELS.inschrijvingPerOmloop * f.inschrijving))
          })}
        </p>
      )}
      {!lijnen ? (
        <p className="bd-rustig">{tr('bd.loading')}</p>
      ) : (
        <ul className="bd-lijst">
          {gesorteerd.map((lijn) => {
            const week = weekVan(lijn.lineFile)
            // Zoals schrijfIn het rekent: de omlopen op de drukste dag, met de factoren van het bedrijf.
            const kosten = inschrijfkosten({ tours: week?.piekOmlopen ?? lijn.tours }, bedrijf)
            const uren = urenVanLijn(lijn)
            const dag = week
              ? terugvalVanConcessie(weekConcessie(week, lijn.lineFile), bedrijf.reputatie, f)
              : dagresultaat({ urenPerDag: uren }, bedrijf.reputatie)
            return (
              <li key={lijn.lineFile}>
                <span className="bd-lijn">{lijnnaam(lijn)}</span>
                <span className="bd-wat">
                  <b>{lijn.lineFile}</b>
                  <small>
                    {week ? <WeekRegel bedrijf={bedrijf} week={week} /> : tr('bd.lineTours', { tours: lijn.tours, hours: uren })}
                  </small>
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

/** Een concessie die alleen uit een week bestaat, om er met de terugval mee te rekenen. */
function weekConcessie(week: Pick<LijnWeek, 'gemRituren' | 'gemWerkuren' | 'gemDiensten' | 'gemOmlopen' | 'piekOmlopen'>, lineFile: string): Concessie {
  return {
    mapFolder: '',
    mapName: '',
    lineFile,
    lineNumbers: [],
    omlopen: week.piekOmlopen,
    ritten: 0,
    urenPerDag: week.gemRituren,
    vanaf: 0,
    tot: 0,
    week: { ...week, berekendOp: 0 }
  }
}

/** "136,8 u per dag gemiddeld · 22 omlopen op drukke dagen · ± € 1.080 per dag uitbesteed" */
function WeekRegel({
  bedrijf,
  week
}: {
  bedrijf: BedrijfStaat
  week: Pick<LijnWeek, 'gemRituren' | 'gemWerkuren' | 'gemDiensten' | 'gemOmlopen' | 'piekOmlopen'>
}): JSX.Element {
  const tr = useT()
  const taal = useLanguage()
  const geld = useGeld()
  const r = terugvalVanConcessie(weekConcessie(week, ''), bedrijf.reputatie, bedrijfsfactoren(bedrijf))
  return (
    <>
      {tr('bd.plan.weekCijfers', { rituren: eenDecimaal(week.gemRituren, taal), omlopen: week.piekOmlopen })} ·{' '}
      {tr('bd.plan.concessieDag', { geld: geld(r.vergoeding - r.onderaannemer, true) })}
    </>
  )
}
