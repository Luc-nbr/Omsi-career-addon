import { useEffect, useState, type JSX } from 'react'
import {
  REGELS,
  aanHetWerk,
  bedrijfsfactoren,
  opleidingKlaar,
  isInzetbaar,
  onderhoudskosten,
  reparatiekosten,
  waardeVan,
  type Aanbod,
  type Bedrijf as BedrijfStaat,
  type EigenBus,
  type Busvorm,
  type MarktBus
} from '../../core/bedrijf'
import { besparingBus } from '../../core/plantarief'
import { PLAN_ACTIEF } from '../../core/rooster'
import { loose } from '../../shared/i18n'
import { useLanguage, useT } from './language'
import { WerkplaatsSpel } from './BedrijfOpleiding'
import { type Focus, type Handel, useGeld, Paneel, Staatbalk } from './BedrijfDelen'
import { eenDecimaal, gemiddelden, pechkans } from './Planning'

/* ------------------------------------------------------------------ */
/* Wagenpark en werkplaats                                            */
/* ------------------------------------------------------------------ */

export function Wagenpark({ bedrijf, handel }: { bedrijf: BedrijfStaat; handel: Handel }): JSX.Element {
  const tr = useT()
  const geld = useGeld()
  const bussen = bedrijf.bussen ?? []
  /** De minigame die openstaat: zelf onderhoud of zelf repareren, aan welke bus. */
  const [spel, setSpel] = useState<{ bus: EigenBus; soort: 'onderhoud' | 'reparatie' }>()
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
          <BusRij
            key={b.nummer}
            bus={b}
            dag={bedrijf.dag}
            geld={geld}
            handel={handel}
            kas={bedrijf.kas}
            monteurs={aanHetWerk(bedrijf, 'monteur').length}
            bedrijf={bedrijf}
            onSpel={(soort) => setSpel({ bus: b, soort })}
            tr={tr}
          />
        ))}
      </ul>
      {spel && (
        <WerkplaatsSpel
          soort={spel.soort}
          busNummer={spel.bus.nummer}
          staat={spel.bus.staat}
          onAnnuleer={() => setSpel(undefined)}
          onKlaar={(score) => {
            const wat = spel
            setSpel(undefined)
            void handel(window.career.bedrijfZelf(wat.bus.nummer, wat.soort, score))
          }}
        />
      )}
    </Paneel>
  )
}

function BusRij({
  bus,
  dag,
  kas,
  monteurs,
  bedrijf,
  onSpel,
  geld,
  handel,
  tr
}: {
  bus: EigenBus
  dag: number
  monteurs: number
  bedrijf: BedrijfStaat
  /** Zelf aan de slag, na de opleiding: opent de minigame. */
  onSpel: (soort: 'onderhoud' | 'reparatie') => void
  kas: number
  geld: (c: number, t?: boolean) => string
  handel: Handel
  tr: ReturnType<typeof useT>
}): JSX.Element {
  const taal = useLanguage()
  const werkplaats = bus.werkplaatsTot !== undefined && bus.werkplaatsTot >= dag
  const inzet = isInzetbaar(bus, dag)
  const onderhoud = onderhoudskosten(bus, monteurs, bedrijf)
  const reparatie = reparatiekosten(bus)
  const zelfOnderhoud = Math.round(onderhoudskosten(bus, 0, bedrijf) * REGELS.zelfOnderdelen)
  const zelfReparatie = Math.round(reparatie * REGELS.zelfOnderdelen)
  return (
    <li>
      <span className="bd-nummer groot">{bus.nummer}</span>
      <span className="bd-wat">
        <b>{bus.naam}</b>
        <small>
          {loose(taal, `bd.shape.${bus.vorm}`, bus.vorm)} · {Math.round(bus.km / 1000)}k km ·{' '}
          {tr('bd.value', { money: geld(waardeVan(bus)) })}
          {PLAN_ACTIEF && inzet
            ? ` · ${tr('bd.plan.busStaat', { staat: Math.round(bus.staat), kans: eenDecimaal(pechkans(bus, monteurs) * 100, taal) })}`
            : ''}
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
        {opleidingKlaar(bedrijf, 'werkplaats') && (
          <button
            type="button"
            className="bd-knop zelf"
            disabled={werkplaats || bus.staat >= 99 || kas < zelfOnderhoud}
            onClick={() => onSpel('onderhoud')}
          >
            {tr('bd.selfService', { money: geld(zelfOnderhoud) })}
          </button>
        )}
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
        {bus.schade > 0 && opleidingKlaar(bedrijf, 'schadeherstel') && (
          <button
            type="button"
            className="bd-knop zelf"
            disabled={werkplaats || kas < zelfReparatie}
            onClick={() => onSpel('reparatie')}
          >
            {tr('bd.selfRepair', { money: geld(zelfReparatie) })}
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

export function Markt({
  bedrijf,
  handel,
  focus
}: {
  bedrijf: BedrijfStaat
  handel: Handel
  /** Uit de planning: alleen bussen van deze vorm (het lege busvak van een gelede omloop). */
  focus?: Focus
}): JSX.Element {
  const tr = useT()
  const geld = useGeld()
  const taal = useLanguage()
  const [markt, setMarkt] = useState<{ nieuw: MarktBus[]; tweedehands: Aanbod[] }>()
  const [zoek, setZoek] = useState('')
  const [bezig, setBezig] = useState(false)
  const [vorm, setVorm] = useState<Busvorm | undefined>(focus?.vorm)
  useEffect(() => setVorm(focus?.vorm), [focus])
  /*
   * Wat een bus op een gemiddelde omloop bespaart, en in hoeveel dagen hij
   * zich terugverdient (ontwerp §4.1). Pas als de concessies een week hebben.
   */
  const gemOmloop = gemiddelden(bedrijf).omloopRituren
  const bespaart = gemOmloop !== undefined ? besparingBus(gemOmloop, bedrijfsfactoren(bedrijf)) : 0
  const loont = (prijs: number): JSX.Element | null =>
    PLAN_ACTIEF && gemOmloop !== undefined && bespaart > 0 ? (
      <small className="bd-rustig">
        {tr('bd.plan.busLoont', {
          uren: eenDecimaal(gemOmloop, taal),
          bespaart: geld(bespaart),
          dagen: Math.ceil(prijs / bespaart)
        })}
      </small>
    ) : null

  useEffect(() => {
    void window.career.bedrijfMarkt().then(setMarkt)
  }, [bedrijf.dag, bedrijf.aanbodWeg?.length])

  const koop = (soort: 'nieuw' | 'tweedehands', wat: string | number): void => {
    setBezig(true)
    void handel(window.career.bedrijfKoop(soort, wat)).finally(() => setBezig(false))
  }

  const nieuw = (markt?.nieuw ?? []).filter(
    (b) => b.naam.toLowerCase().includes(zoek.trim().toLowerCase()) && (!vorm || b.vorm === vorm)
  )

  return (
    <div className="bd-kolom">
      <Paneel titel={tr('bd.usedToday', { day: bedrijf.dag })}>
        {!markt ? (
          <p className="bd-rustig">{tr('bd.loading')}</p>
        ) : markt.tweedehands.length === 0 ? (
          <p className="bd-rustig">{tr('bd.usedSoldOut')}</p>
        ) : (
          <div className="bd-aanbod">
            {markt.tweedehands.filter((a) => !vorm || a.bus.vorm === vorm).map((a) => (
              <article key={a.nr} className="bd-kaart">
                <span className="bd-vorm">{loose(taal, `bd.shape.${a.bus.vorm}`, a.bus.vorm)}</span>
                <b>{a.bus.naam}</b>
                <small>{Math.round(a.km / 1000)}k km</small>
                <Staatbalk staat={a.staat} schade={0} />
                <span className="bd-prijs">{geld(a.prijs)}</span>
                {loont(a.prijs)}
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
          {vorm && (
            <button type="button" className="bd-knop" onClick={() => setVorm(undefined)} title={tr('bd.plan.toonAlles')}>
              {loose(taal, `bd.shape.${vorm}`, vorm)} ✕
            </button>
          )}
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
                  {loont(prijs)}
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
