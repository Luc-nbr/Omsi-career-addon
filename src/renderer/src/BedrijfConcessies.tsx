import { useEffect, useMemo, useState, type JSX } from 'react'
import {
  dagresultaat,
  heeftConcessie,
  inschrijfkosten,
  lijnnaam,
  urenVanLijn,
  type Bedrijf as BedrijfStaat
} from '../../core/bedrijf'
import type { LineSummary } from '../../core/duty'
import type { MapSummary } from '../../shared/api'
import { useT } from './language'
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
