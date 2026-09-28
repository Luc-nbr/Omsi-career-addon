import { useEffect, useMemo, useState, type JSX } from 'react'
import {
  REGELS,
  dagresultaat,
  heeftConcessie,
  inschrijfkosten,
  lijnnaam,
  urenVanLijn,
  type Bedrijf as BedrijfStaat
} from '../../core/bedrijf'
import type { LineSummary } from '../../core/duty'
import type { CareerPayload, MapSummary } from '../../shared/api'
import { formatMoney } from '../../shared/format'
import { loose } from '../../shared/i18n'
import { useLanguage, useT } from './language'
import './profiel.css'
import './bedrijf.css'

interface Props {
  bedrijf?: BedrijfStaat
  /** Het hoofdproces geeft na elke handeling het hele profiel terug. */
  onCareer: (payload: CareerPayload) => void
}

/**
 * Het eigen busbedrijf: kas, concessies, aanbestedingen en de boeken.
 *
 * Dezelfde vorm als de staat van dienst -- vakken op het vel -- want het is
 * dezelfde soort pagina: cijfers en lijsten, geen keuzestap. Wat hier staat is
 * voor het grootste deel gerekend (zie core/bedrijf.ts); dat staat erbij, en
 * elke boeking zegt of hij gemeten of gerekend is.
 */
export function Bedrijf({ bedrijf, onCareer }: Props): JSX.Element {
  const tr = useT()
  const taal = useLanguage()
  const geld = (centen: number): string => formatMoney(centen / 100, taal)

  if (!bedrijf) return <Oprichten onCareer={onCareer} />

  const perDag = bedrijf.concessies.reduce(
    (som, c) => {
      const r = dagresultaat(c, bedrijf.reputatie)
      return som + r.vergoeding - r.kosten
    },
    0
  )

  return (
    <div className="profiel bedrijf">
      <section className="profiel-vak bd-kop">
        <div>
          <h3>{bedrijf.naam}</h3>
          <div className="bd-cijfers">
            <span>
              <small>{tr('bd.cash')}</small>
              <b className={bedrijf.kas < 0 ? 'laat' : ''}>{geld(bedrijf.kas)}</b>
            </span>
            <span>
              <small>{tr('bd.day')}</small>
              <b>{bedrijf.dag}</b>
            </span>
            <span>
              <small>{tr('bd.reputation')}</small>
              <b>{bedrijf.reputatie}</b>
            </span>
            <span>
              <small>{tr('bd.perDay')}</small>
              <b className={perDag < 0 ? 'laat' : perDag > 0 ? 'optijd' : ''}>
                {perDag > 0 ? '+' : ''}
                {geld(perDag)}
              </b>
            </span>
          </div>
        </div>
        <button
          type="button"
          className="bd-knop hoofd"
          onClick={() => void window.career.bedrijfDagAf().then(onCareer)}
        >
          {tr('bd.closeDay')}
        </button>
      </section>

      <section className="profiel-vak">
        <h4>{tr('bd.concessions')}</h4>
        {bedrijf.concessies.length === 0 ? (
          <p className="bd-leeg">{tr('bd.noConcessions')}</p>
        ) : (
          <ul className="bd-lijst">
            {bedrijf.concessies.map((c) => {
              const r = dagresultaat(c, bedrijf.reputatie)
              return (
                <li key={`${c.mapFolder}|${c.lineFile}`}>
                  <span className="bd-lijn">{lijnnaam(c)}</span>
                  <span className="bd-wat">
                    <b>{c.mapName}</b>
                    <small>{tr('bd.lineTours', { tours: c.omlopen, hours: c.urenPerDag })}</small>
                  </span>
                  <span className="bd-bedrag optijd">+{geld(r.vergoeding - r.kosten)}</span>
                  <span className="bd-tot">{tr('bd.until', { day: c.tot })}</span>
                  <button
                    type="button"
                    className="bd-knop"
                    onClick={() => {
                      if (!window.confirm(tr('bd.cancelAsk'))) return
                      void window.career.bedrijfOpzeggen(c.mapFolder, c.lineFile).then(onCareer)
                    }}
                  >
                    {tr('bd.cancel')}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <Aanbestedingen bedrijf={bedrijf} onCareer={onCareer} />

      <section className="profiel-vak">
        <h4>{tr('bd.books')}</h4>
        <ul className="bd-boeken">
          {bedrijf.boekingen.slice(0, 20).map((b, i) => (
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
                {b.bedrag === 0 ? '' : `${b.bedrag > 0 ? '+' : ''}${geld(b.bedrag)}`}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function Oprichten({ onCareer }: { onCareer: (payload: CareerPayload) => void }): JSX.Element {
  const tr = useT()
  const taal = useLanguage()
  const [naam, setNaam] = useState('')
  return (
    <div className="profiel bedrijf">
      <section className="profiel-vak bd-oprichten">
        <h3>{tr('bd.foundTitle')}</h3>
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
          />
          <button type="submit" className="bd-knop hoofd">
            {tr('bd.found')}
          </button>
        </form>
      </section>
    </div>
  )
}

/** Een kaart kiezen en inschrijven op een van zijn lijnen. */
function Aanbestedingen({
  bedrijf,
  onCareer
}: {
  bedrijf: BedrijfStaat
  onCareer: (payload: CareerPayload) => void
}): JSX.Element {
  const tr = useT()
  const taal = useLanguage()
  const geld = (centen: number): string => formatMoney(centen / 100, taal)
  const [kaarten, setKaarten] = useState<MapSummary[]>([])
  const [kaart, setKaart] = useState('')
  const [lijnen, setLijnen] = useState<LineSummary[]>()
  const [bezig, setBezig] = useState(false)

  useEffect(() => {
    void window.career.maps().then((lijst) => {
      setKaarten(lijst)
      // De kaart van je eerste concessie, anders de eerste in de lijst.
      setKaart((huidig) => huidig || bedrijf.concessies[0]?.mapFolder || lijst[0]?.folder || '')
    })
  }, [])

  useEffect(() => {
    if (!kaart) return
    let geldig = true
    setLijnen(undefined)
    void window.career
      .lines(kaart)
      .then((uit) => {
        if (geldig) setLijnen(uit)
      })
      .catch(() => {
        if (geldig) setLijnen([])
      })
    return () => {
      geldig = false
    }
  }, [kaart])

  const gesorteerd = useMemo(
    () => [...(lijnen ?? [])].sort((a, b) => b.tours - a.tours),
    [lijnen]
  )

  return (
    <section className="profiel-vak">
      <div className="bd-vakkop">
        <h4>{tr('bd.market')}</h4>
        <select value={kaart} onChange={(e) => setKaart(e.target.value)} aria-label={tr('bd.chooseMap')}>
          {kaarten.map((k) => (
            <option key={k.folder} value={k.folder}>
              {k.name}
            </option>
          ))}
        </select>
      </div>
      {!lijnen ? (
        <p className="bd-leeg">{tr('bd.loading')}</p>
      ) : (
        <ul className="bd-lijst">
          {gesorteerd.map((lijn) => {
            const kosten = inschrijfkosten(lijn)
            const eigen = heeftConcessie(bedrijf, kaart, lijn.lineFile)
            const uren = urenVanLijn(lijn)
            const dag = dagresultaat({ urenPerDag: uren }, bedrijf.reputatie)
            return (
              <li key={lijn.lineFile}>
                <span className="bd-lijn">{lijnnaam(lijn)}</span>
                <span className="bd-wat">
                  <b>{lijn.lineFile}</b>
                  <small>{tr('bd.lineTours', { tours: lijn.tours, hours: uren })}</small>
                </span>
                <span className="bd-bedrag optijd">
                  +{geld(dag.vergoeding - dag.kosten)}
                </span>
                <span />
                {eigen ? (
                  <span className="bd-eigen">{tr('bd.owned')}</span>
                ) : (
                  <button
                    type="button"
                    className="bd-knop"
                    disabled={bezig || bedrijf.kas < kosten}
                    title={bedrijf.kas < kosten ? tr('bd.tooExpensive') : undefined}
                    onClick={() => {
                      setBezig(true)
                      void window.career
                        .bedrijfInschrijven(kaart, lijn.lineFile)
                        .then((uit) => onCareer(uit.payload))
                        .finally(() => setBezig(false))
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
