import { useMemo, useState, type JSX } from 'react'
import type { Bedrijf as BedrijfStaat } from '../../core/bedrijf'
import { invulOpties, openRijen, uitzendOver, type InvulOptie, type OpenRij } from '../../core/invulling'
import type { BusKeuze, BusWie, DagPlan, DienstSleutel, InvulDoel, InvulKeuze, LopendeRit, Wie } from '../../core/planTypen'
import { ontleedDienst } from '../../core/bedrijfsplan'
import { formatTime } from '../../shared/format'
import { loose, type Language } from '../../shared/i18n'
import { Paneel, useGeld, type Handel } from './BedrijfDelen'
import { useLanguage, useT } from './language'
import './opendiensten.css'

/*
 * Het paneel "Open diensten" (ontwerp busbedrijf-planning §6.2): wat er
 * vandaag open is door uitval, met per gat de keuzes en wat ze kosten. Plots
 * eerst, in het rood. Wat de centrale al deed staat er grijs bij; wat jij
 * koos kun je ongedaan maken, en dan beslist de centrale weer. De diensten die
 * gewoon naar de onderaannemer gaan, staan ingeklapt onderaan.
 *
 * `compact` is voor het ochtendvenster: per rij alleen de voorgestelde keuze
 * en [Meer…].
 */

/*
 * Zelf rijden hoort bij deel D (`useZelfRijden` in ZelfRijden.tsx), en dat
 * bestand staat nog niet op deze tak. Bij het samenvoegen wordt dit
 * `useZelfRijden()`; tot dan staat de knop er niet.
 */
function useZelfRijdenTijdelijk(): { open(dienst?: DienstSleutel): void } | undefined {
  return undefined
}

const LOCALE: Record<Language, string> = { en: 'en-GB', de: 'de-DE', fr: 'fr-FR', nl: 'nl-NL' }

/** Uren met één decimaal, in de notatie van de taal: "7,1". */
function uren(minuten: number, taal: Language): string {
  return (minuten / 60).toLocaleString(LOCALE[taal] ?? 'en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

/** Een kloktijd, ook voor ritten voor middernacht (−15) en na (1506). */
const klok = (m: number): string => formatTime(((m % 1440) + 1440) % 1440)

type Tr = ReturnType<typeof useT>

/** Wie er nu rijdt, in woorden: "Anna Becker valt in", "Uitzendkracht", "Bus 102". */
function wieTekst(tr: Tr, b: BedrijfStaat, wie: Wie | BusWie, bus: boolean, hand: boolean): string {
  const naam = (id: number): string => (b.personeel ?? []).find((m) => m.id === id)?.naam ?? `#${id}`
  switch (wie.soort) {
    case 'eigen':
      return 'nummer' in wie ? tr('bd.inv.gekozen.eigenBus', { bus: wie.nummer }) : tr('bd.inv.gekozen.eigen', { naam: naam(wie.id) })
    case 'collega':
      return tr('bd.inv.gekozen.collega', { naam: naam(wie.id) })
    case 'uitzend':
      return tr('bd.inv.gekozen.uitzend')
    case 'huur':
      return tr('bd.inv.gekozen.huur')
    case 'onderaannemer':
      return tr('bd.inv.gekozen.onder')
    case 'liggen':
      return hand && !bus ? tr('bd.inv.gekozen.liggen') : tr('bd.inv.gekozen.uitval')
  }
}

function redenTekst(tr: Tr, rij: OpenRij): string {
  switch (rij.reden) {
    case 'ziek':
      return tr('bd.inv.reden.ziek')
    case 'telaat':
      return rij.laatMinuten !== undefined ? tr('bd.inv.reden.telaat', { min: rij.laatMinuten }) : tr('bd.inv.reden.laat')
    case 'pech':
      return tr('bd.inv.reden.pech')
    case 'werkplaats':
      return tr('bd.inv.reden.werkplaats')
    case 'afwezig':
      return tr('bd.inv.reden.afwezig')
    default:
      return ''
  }
}

/** Omloopnummer, met het deel erbij als de omloop in meer diensten geknipt is: "55103-2". */
function omloopNaam(rij: OpenRij): string {
  const d = rij.dienst
  return d && d.delen > 1 ? `${rij.omloop.tourNumber}-${d.deel}` : rij.omloop.tourNumber
}

export function OpenDiensten({
  bedrijf,
  plan,
  handel,
  lopend,
  compact
}: {
  bedrijf: BedrijfStaat
  plan: DagPlan
  handel: Handel
  lopend?: LopendeRit
  compact?: boolean
}): JSX.Element {
  const tr = useT()
  const taal = useLanguage()
  const geld = useGeld()
  const [bezig, setBezig] = useState(false)
  const [tonen, setTonen] = useState(false)
  const zelf = useZelfRijdenTijdelijk()
  const { rijen, uitbesteed, uitbesteedKosten } = useMemo(() => openRijen(bedrijf, plan), [bedrijf, plan])

  /* Eén handeling tegelijk: een dubbelklik gaf anders een fout terwijl het lukte. */
  const doe = (doel: InvulDoel, keuze: InvulKeuze | BusKeuze | null): void => {
    if (bezig) return
    setBezig(true)
    void handel(window.career.bedrijfInvullen(doel, keuze)).finally(() => setBezig(false))
  }

  const nog = rijen.filter((r) => r.bron !== 'hand').length
  const lopendeOmloop = lopend && lopend.dag === plan.dag ? ontleedDienst(lopend.dienst)?.omloop : undefined

  const inhoud = (
    <>
      {rijen.length === 0 ? (
        <p className="od-leeg">{tr('bd.inv.geenOpen')}</p>
      ) : (
        <ul className="od-lijst">
          {rijen.map((rij) => (
            <Rij
              key={`${rij.doel.soort}|${rij.doel.soort === 'omloop' ? rij.doel.omloop : rij.doel.dienst}`}
              bedrijf={bedrijf}
              plan={plan}
              rij={rij}
              compact={compact === true}
              bezig={bezig}
              vast={rij.doel.soort === 'omloop' && rij.doel.omloop === lopendeOmloop}
              doe={doe}
              zelf={zelf}
              taal={taal}
            />
          ))}
        </ul>
      )}
      {!compact && uitbesteed.length > 0 && (
        <div className="od-structureel">
          <div className="od-structureelkop">
            <span>{tr('bd.inv.structureel', { n: uitbesteed.length, geld: geld(uitbesteedKosten) })}</span>
            <button type="button" className="bd-link" onClick={() => setTonen((t) => !t)} aria-expanded={tonen}>
              {tr(tonen ? 'bd.inv.verbergen' : 'bd.inv.tonen')}
            </button>
          </div>
          {tonen && (
            <ul className="od-uitbesteed">
              {uitbesteed.map((u) => (
                <li key={u.dienst.sleutel}>
                  <span>
                    {tr('bd.inv.regel', {
                      lijn: u.omloop.lijn,
                      omloop: u.dienst.delen > 1 ? `${u.omloop.tourNumber}-${u.dienst.deel}` : u.omloop.tourNumber,
                      van: klok(u.dienst.van),
                      tot: klok(u.dienst.tot),
                      werk: uren(u.dienst.minuten, taal),
                      betaald: uren(u.dienst.rituren * 60, taal)
                    })}
                  </span>
                  <span className="od-bedrag">{geld(u.kosten)}</span>
                  {zelf && plan.vandaag && (
                    <button type="button" className="bd-knop zacht" onClick={() => zelf.open(u.dienst.sleutel)}>
                      {tr('bd.inv.zelf')}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  )

  if (compact) {
    return (
      <section className="od od-compact">
        <h3>{tr('bd.inv.kop', { n: nog })}</h3>
        {inhoud}
      </section>
    )
  }
  return (
    <Paneel titel={tr('bd.inv.kop', { n: nog })} breed>
      <div className="od">{inhoud}</div>
    </Paneel>
  )
}

function Rij({
  bedrijf,
  plan,
  rij,
  compact,
  bezig,
  vast,
  doe,
  zelf,
  taal
}: {
  bedrijf: BedrijfStaat
  plan: DagPlan
  rij: OpenRij
  compact: boolean
  bezig: boolean
  /** De bus van de omloop die je nu zelf rijdt: daar verander je niets aan. */
  vast: boolean
  doe: (doel: InvulDoel, keuze: InvulKeuze | BusKeuze | null) => void
  zelf?: { open(dienst?: DienstSleutel): void }
  taal: Language
}): JSX.Element {
  const tr = useT()
  const geld = useGeld()
  const [meer, setMeer] = useState(false)
  const opties = useMemo(() => invulOpties(bedrijf, plan, rij.doel), [bedrijf, plan, rij.doel])
  const isBus = rij.doel.soort === 'omloop'
  const g = rij.gat

  const kop = isBus
    ? [
        (rij.reden ? redenTekst(tr, rij) : tr('bd.inv.open')).toUpperCase(),
        rij.bus !== undefined
          ? tr('bd.inv.busRegel', { lijn: rij.omloop.lijn, omloop: rij.omloop.tourNumber, bus: rij.bus, van: klok(g.van), tot: klok(g.tot) })
          : tr('bd.inv.busRegelZonder', { lijn: rij.omloop.lijn, omloop: rij.omloop.tourNumber, van: klok(g.van), tot: klok(g.tot) })
      ]
    : [
        tr('bd.inv.open').toUpperCase(),
        redenTekst(tr, rij),
        tr('bd.inv.regel', {
          lijn: rij.omloop.lijn,
          omloop: omloopNaam(rij),
          van: klok(g.van),
          tot: klok(g.tot),
          werk: uren(g.minuten, taal),
          betaald: uren(g.rituren * 60, taal)
        })
      ]

  const wie = wieTekst(tr, bedrijf, rij.wie, isBus, rij.bron === 'hand')
  const geldMetToeslag = `${geld(rij.kosten)}${rij.toeslag ? ` · ${tr('bd.inv.toeslag')}` : ''}`
  const uit = !plan.vandaag || vast
  const kies = (keuze: InvulKeuze | BusKeuze): void => doe(rij.doel, keuze)
  const fout = (o: InvulOptie): string | undefined => (o.reden ? loose(taal, `bd.fout.${o.reden}`, '') : undefined)

  const collegas = opties.filter((o) => o.keuze.soort === 'collega')
  const bussen = opties.filter((o) => o.keuze.soort === 'eigen')
  const uitzend = opties.find((o) => o.keuze.soort === 'uitzend')
  const onder = opties.find((o) => o.keuze.soort === 'onderaannemer')
  const huur = opties.find((o) => o.keuze.soort === 'huur')
  const liggen = opties.find((o) => o.keuze.soort === 'liggen')
  const standaard = opties.find((o) => o.standaard)

  const liggenTekst = (o: InvulOptie): string =>
    isBus
      ? tr('bd.inv.busLiggen', { geld: geld(Math.max(0, o.kosten)) })
      : o.reputatie
        ? tr('bd.inv.liggen', { geld: geld(Math.max(0, o.kosten)), n: o.reputatie })
        : tr('bd.inv.liggenKort', { geld: geld(Math.max(0, o.kosten)) })

  /** De tekst van één keuze als knop, voor de hoofdknop in compact. */
  const knopTekst = (o: InvulOptie): string => {
    switch (o.keuze.soort) {
      case 'collega':
        return tr('bd.inv.gekozen.collega', { naam: o.wie ?? '' })
      case 'eigen':
        return tr('bd.inv.busAnderOptie', { bus: o.wie ?? o.keuze.nummer, geld: geld(o.kosten) })
      case 'uitzend':
        return tr('bd.inv.uitzend', { geld: geld(o.kosten) })
      case 'onderaannemer':
        return tr('bd.inv.onder', { geld: geld(o.kosten) })
      case 'huur':
        return tr('bd.inv.busHuur', { geld: geld(o.kosten) })
      case 'liggen':
        return liggenTekst(o)
    }
  }

  const zelfKnop = !isBus && zelf && !uit && (
    <button type="button" className="bd-knop od-zelf" disabled={bezig} onClick={() => zelf.open(rij.dienst?.sleutel)}>
      {tr('bd.inv.zelf')}
      <small>{tr('bd.inv.zelfSub', { geld: geld(rij.kosten) })}</small>
    </button>
  )

  const alle = (
    <div className="od-knoppen">
      {zelfKnop}
      {!isBus && (
        <label className="od-kies">
          <select
            value=""
            disabled={uit || bezig || collegas.length === 0}
            onChange={(e) => {
              const id = Number(e.target.value)
              if (Number.isFinite(id) && e.target.value !== '') kies({ soort: 'collega', id })
            }}
          >
            <option value="">{collegas.length === 0 ? tr('bd.inv.collegaGeen') : `${tr('bd.inv.collega')} ▾`}</option>
            {collegas.map((o) => (
              <option key={(o.keuze as { id: number }).id} value={(o.keuze as { id: number }).id}>
                {tr('bd.inv.collegaVrij', { naam: o.wie ?? '', uren: uren(o.vrijMinuten ?? 0, taal) })}
                {o.let === 'bevoegd' ? ` · ${tr('bd.inv.collegaBevoegd')}` : ''}
                {o.kosten > 0 ? ` · ${tr('bd.inv.collegaOveruren', { geld: geld(o.kosten) })}` : ''}
              </option>
            ))}
          </select>
        </label>
      )}
      {isBus && (
        <label className="od-kies">
          <select
            value=""
            disabled={uit || bezig || bussen.length === 0}
            onChange={(e) => {
              const nummer = Number(e.target.value)
              if (Number.isFinite(nummer) && e.target.value !== '') kies({ soort: 'eigen', nummer })
            }}
          >
            <option value="">{bussen.length === 0 ? tr('bd.inv.busAnderGeen') : `${tr('bd.inv.busAnder')} ▾`}</option>
            {bussen.map((o) => {
              const nummer = (o.keuze as { nummer: number }).nummer
              return (
                <option key={nummer} value={nummer}>
                  {tr('bd.inv.busAnderOptie', { bus: o.wie ?? nummer, geld: geld(o.kosten) })}
                  {o.let === 'vorm' ? ` · ${tr('bd.inv.busVorm')}` : ''}
                </option>
              )
            })}
          </select>
        </label>
      )}
      {uitzend && (
        <button
          type="button"
          className={`bd-knop ${uitzend.standaard ? 'hoofd' : ''}`}
          disabled={uit || bezig || !uitzend.beschikbaar}
          title={fout(uitzend)}
          onClick={() => kies({ soort: 'uitzend' })}
        >
          {tr('bd.inv.uitzend', { geld: geld(uitzend.kosten) })}
          <small>{tr('bd.inv.uitzendSub', { n: uitzendOver(bedrijf, plan, rij.doel) })}</small>
        </button>
      )}
      {onder && (
        <span className="od-metfout">
          <button
            type="button"
            className={`bd-knop ${onder.standaard ? 'hoofd' : ''}`}
            disabled={uit || bezig || !onder.beschikbaar}
            title={fout(onder)}
            onClick={() => kies({ soort: 'onderaannemer' })}
          >
            {tr('bd.inv.onder', { geld: geld(onder.kosten) })}
          </button>
          {onder.reden === 'kort' && <small className="od-fout">{tr('bd.fout.kort')}</small>}
        </span>
      )}
      {huur && (
        <button
          type="button"
          className={`bd-knop ${huur.standaard ? 'hoofd' : ''}`}
          disabled={uit || bezig || !huur.beschikbaar}
          title={fout(huur)}
          onClick={() => kies({ soort: 'huur' })}
        >
          {tr('bd.inv.busHuur', { geld: geld(huur.kosten) })}
        </button>
      )}
      {liggen && (
        <button
          type="button"
          className="bd-knop od-liggen"
          disabled={uit || bezig || !liggen.beschikbaar}
          title={fout(liggen) ?? tr('bd.inv.liggenSub')}
          onClick={() => kies({ soort: 'liggen' })}
        >
          {liggenTekst(liggen)}
        </button>
      )}
    </div>
  )

  return (
    <li className={`od-rij ${g.plots ? 'plots' : ''} ${rij.bron === 'hand' ? 'gekozen' : ''}`}>
      <div className="od-kop">
        {g.plots && <span className="od-plots">{tr('bd.inv.plots')}</span>}
        <b>{kop.filter(Boolean).join(' · ')}</b>
      </div>
      {rij.bron === 'hand' ? (
        <div className="od-stand">
          <span>
            {wie} · {tr('bd.inv.door.hand')} · {geld(rij.kosten)}
          </span>
          <button type="button" className="bd-link" disabled={uit || bezig} onClick={() => doe(rij.doel, null)}>
            {tr('bd.inv.ongedaan')}
          </button>
        </div>
      ) : rij.bron === 'centrale' ? (
        <div className="od-stand zacht">{tr('bd.inv.centraleDoet', { wat: wie, geld: geldMetToeslag })}</div>
      ) : (
        <div className="od-stand zacht">
          {wie} · {geld(rij.kosten)}
        </div>
      )}
      {!uit &&
        (compact && !meer ? (
          <div className="od-knoppen">
            {zelfKnop}
            {standaard && (
              <button type="button" className="bd-knop hoofd" disabled={bezig} onClick={() => kies(standaard.keuze)}>
                {knopTekst(standaard)}
              </button>
            )}
            <button type="button" className="bd-knop zacht" onClick={() => setMeer(true)}>
              {tr('bd.inv.meer')}
            </button>
          </div>
        ) : (
          alle
        ))}
    </li>
  )
}
