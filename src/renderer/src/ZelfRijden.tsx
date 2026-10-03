import { createContext, useCallback, useContext, useEffect, useMemo, useState, type JSX, type ReactNode } from 'react'
import type { Bedrijf as BedrijfStaat } from '../../core/bedrijf'
import { besparingVanRit, dienstNaam, restVan, rijvenster, voorstellen, zoekInPlan, type RitVoorstel } from '../../core/bedrijfsrit'
import type { DagPlan, DienstSleutel, LopendeRit, RitFout, Stand } from '../../core/planTypen'
import type { CareerPayload } from '../../shared/api'
import { formatTime } from '../../shared/format'
import { loose, type Language } from '../../shared/i18n'
import { useGeld, type Handel } from './BedrijfDelen'
import { useLanguage, useT } from './language'
import './zelfrijden.css'

/*
 * ZELF RIJDEN VANUIT HET BEDRIJF (ontwerp busbedrijf-planning §7).
 *
 * Eén keuzevenster voor alle ingangen: de knop in de zijbalk, de tegel op het
 * dashboard, de popover van een dienst in de Planning, Open diensten en het
 * kaartje op de kaart. Allemaal roepen ze `useZelfRijden().open(dienst?)`
 * aan; de provider houdt het venster en praat met main (`bedrijfRit`).
 *
 * Wat het venster belooft, rekent het uit de kern (`besparingVanRit`): wat
 * jouw stuk het bedrijf scheelt, en wie de rest rijdt voor hoeveel. Er wordt
 * niets in de invulling geschreven; annuleren laat dus niets achter.
 */

interface Context {
  bedrijf?: BedrijfStaat
  plan?: DagPlan
  lopend?: LopendeRit
  handel: Handel
  open(dienst?: DienstSleutel, o?: { vanRit?: string }): void
}

const ZelfRijdenContext = createContext<Context | undefined>(undefined)

/** Een kloktijd van een bedrijfsdag; ook vóór middernacht (−15) en erna (1506). */
export function klok(minuten: number): string {
  return formatTime((((Math.round(minuten) % 1440) + 1440) % 1440))
}

const LOCALE: Record<Language, string> = { en: 'en-GB', de: 'de-DE', fr: 'fr-FR', nl: 'nl-NL' }

/** Uren met één decimaal, in de schrijfwijze van de taal (4,1 of 4.1). */
function uren(waarde: number, taal: Language): string {
  return new Intl.NumberFormat(LOCALE[taal] ?? 'en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(
    Math.max(0, waarde)
  )
}

export function ZelfRijdenProvider(props: {
  bedrijf?: BedrijfStaat
  plan?: DagPlan
  lopend?: LopendeRit
  handel: Handel
  onRijden(p: CareerPayload, later?: boolean): void
  children: ReactNode
}): JSX.Element {
  const { bedrijf, plan, lopend, handel, onRijden, children } = props
  const [keuze, setKeuze] = useState<{ dienst?: DienstSleutel; vanRit?: string; nr: number }>()
  const open = useCallback(
    (dienst?: DienstSleutel, o?: { vanRit?: string }) =>
      setKeuze((oud) => ({ dienst, vanRit: o?.vanRit, nr: (oud?.nr ?? 0) + 1 })),
    []
  )
  const waarde = useMemo(() => ({ bedrijf, plan, lopend, handel, open }), [bedrijf, plan, lopend, handel, open])
  return (
    <ZelfRijdenContext.Provider value={waarde}>
      {children}
      {keuze && bedrijf && (
        <ZelfRijdenKeuze
          key={keuze.nr}
          bedrijf={bedrijf}
          plan={plan}
          beginDienst={keuze.dienst}
          beginVanRit={keuze.vanRit}
          handel={handel}
          onRijden={(p, later) => {
            setKeuze(undefined)
            onRijden(p, later)
          }}
          onSluit={() => setKeuze(undefined)}
        />
      )}
    </ZelfRijdenContext.Provider>
  )
}

export function useZelfRijden(): { open(dienst?: DienstSleutel, o?: { vanRit?: string }): void } {
  const ctx = useContext(ZelfRijdenContext)
  return { open: ctx?.open ?? (() => undefined) }
}

/** De vaste knop "Zelf rijden" in de zijbalk, onder Dag afsluiten. */
export function ZelfRijdenKnop(): JSX.Element {
  const tr = useT()
  const ctx = useContext(ZelfRijdenContext)
  return (
    <button
      type="button"
      className="bd-knop breed zr-knop"
      disabled={!ctx?.bedrijf || Boolean(ctx.lopend)}
      onClick={() => ctx?.open()}
    >
      {tr('bd.rit.knop')}
    </button>
  )
}

/** De tegel op het dashboard: twee à drie voorstellen, en de weg naar het venster. */
export function ZelfRijdenTegel(props: { plan?: DagPlan }): JSX.Element {
  const tr = useT()
  const ctx = useContext(ZelfRijdenContext)
  const plan = props.plan ?? ctx?.plan
  const b = ctx?.bedrijf
  const lijst = useMemo(() => (b && plan ? voorstellen(b, plan, 3) : []), [b, plan])
  return (
    <section className="bd-paneel zr-tegel">
      <div className="bd-paneelkop">
        <h2>{tr('bd.rit.tegel')}</h2>
        <button type="button" className="bd-link" disabled={!b || Boolean(ctx?.lopend)} onClick={() => ctx?.open()}>
          {tr('bd.rit.knop')} →
        </button>
      </div>
      <VoorstelLijst lijst={lijst} uit={Boolean(ctx?.lopend)} onKies={(d) => ctx?.open(d)} />
    </section>
  )
}

function VoorstelLijst({
  lijst,
  uit,
  onKies
}: {
  lijst: RitVoorstel[]
  uit?: boolean
  onKies(d: DienstSleutel): void
}): JSX.Element {
  const tr = useT()
  const taal = useLanguage()
  const geld = useGeld()
  if (lijst.length === 0) return <p className="zr-leeg">{tr('bd.rit.voorstel.geen')}</p>
  return (
    <ul className="zr-voorstellen">
      {lijst.map((v) => {
        const vars = { lijn: v.lijn, van: klok(v.van), tot: klok(v.tot), geld: geld(v.bespaart) }
        const tekst =
          v.reden === 'open'
            ? tr('bd.rit.voorstel.open', { ...vars, reden: v.waarom ? loose(taal, `bd.rit.reden.${v.waarom}`, v.waarom) : '—' })
            : v.reden === 'stuk'
              ? tr('bd.rit.voorstel.stuk', vars)
              : tr('bd.rit.voorstel.uitbesteed', vars)
        return (
          <li key={`${v.dienst}|${v.reden}`}>
            <button type="button" className={`zr-voorstel ${v.reden}`} disabled={uit} onClick={() => onKies(v.dienst)}>
              <b>{v.omloop}</b>
              <span>{tekst}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/** "bus 101 (MAN SG292)" of "een bus van de onderaannemer". */
function busTekst(tr: ReturnType<typeof useT>, b: BedrijfStaat | undefined, nummer?: number, naam?: string): string {
  if (nummer === undefined) return tr('bd.rit.busOnder')
  const bus = b?.bussen?.find((x) => x.nummer === nummer)
  return tr('bd.rit.busEigen', { nummer, naam: naam ?? bus?.naam ?? '' })
}

/**
 * De banner op alle tabs zolang er een bedrijfsrit aangenomen is: klaar om te
 * rijden (verder naar de bus, of teruggeven), of onderweg (naar het rijscherm).
 * `gestart` en `handel` zijn optioneel; zonder `handel` komt hij uit de provider.
 */
export function BedrijfsritBanner(props: {
  bedrijf?: BedrijfStaat
  lopend?: LopendeRit
  onNaarRit(): void
  /** Is de rit al gestart (activeDuty.startedAt)? */
  gestart?: boolean
  handel?: Handel
}): JSX.Element | null {
  const tr = useT()
  const ctx = useContext(ZelfRijdenContext)
  const [bezig, setBezig] = useState(false)
  const { bedrijf, lopend, onNaarRit, gestart } = props
  const handel = props.handel ?? ctx?.handel
  if (!lopend) return null
  if (gestart) {
    return (
      <div className="zr-banner rijdt" role="status">
        <span>{tr('bd.rit.banner.rijdt', { omloop: lopend.omloopNr, bedrijf: bedrijf?.naam ?? '' })}</span>
        <button type="button" className="bd-knop hoofd" onClick={onNaarRit}>
          {tr('bd.rit.banner.naarRijscherm')}
        </button>
      </div>
    )
  }
  return (
    <div className="zr-banner" role="status">
      <span>
        {tr('bd.rit.banner.klaar', {
          lijn: lopend.lijn,
          omloop: lopend.omloopNr,
          van: klok(lopend.van),
          tot: klok(lopend.tot),
          bus: busTekst(tr, bedrijf, lopend.busnummer)
        })}
      </span>
      <span className="zr-knoppen">
        <button
          type="button"
          className="bd-knop"
          disabled={bezig || !handel}
          onClick={() => {
            if (!handel) return
            setBezig(true)
            void handel(window.career.cancelDuty()).finally(() => setBezig(false))
          }}
        >
          {tr('bd.rit.banner.terug')}
        </button>
        <button type="button" className="bd-knop hoofd" onClick={onNaarRit}>
          {tr('bd.rit.banner.verder')}
        </button>
      </span>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Het keuzevenster                                                    */
/* ------------------------------------------------------------------ */

/** De naam van wie de rest rijdt, zoals in de zin "De rest rijdt …". */
function wieTekst(tr: ReturnType<typeof useT>, b: BedrijfStaat, s: Stand): string {
  const w = s.wie
  if (w.soort === 'eigen' || w.soort === 'collega')
    return b.personeel?.find((m) => m.id === w.id)?.naam ?? tr('bd.rit.wie.collega')
  if (w.soort === 'uitzend') return tr('bd.rit.wie.uitzend')
  if (w.soort === 'liggen') return tr('bd.rit.wie.liggen')
  return tr('bd.rit.wie.onderaannemer')
}

type Weigering = { fout: RitFout; bus?: { nummer: number; naam: string }; anderGestart?: boolean; payload: CareerPayload }

function ZelfRijdenKeuze({
  bedrijf,
  plan,
  beginDienst,
  beginVanRit,
  handel,
  onRijden,
  onSluit
}: {
  bedrijf: BedrijfStaat
  plan?: DagPlan
  beginDienst?: DienstSleutel
  beginVanRit?: string
  handel: Handel
  onRijden(p: CareerPayload, later?: boolean): void
  onSluit(): void
}): JSX.Element {
  const tr = useT()
  const taal = useLanguage()
  const geld = useGeld()
  const [dienst, setDienst] = useState<DienstSleutel | undefined>(beginDienst)
  const [vanRit, setVanRit] = useState<string | undefined>(beginVanRit)
  const [totRit, setTotRit] = useState<string>()
  const [bezig, setBezig] = useState(false)
  const [weigering, setWeigering] = useState<Weigering>()

  // Escape sluit het venster, zoals elk venster in de app.
  useEffect(() => {
    const toets = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !bezig) onSluit()
    }
    window.addEventListener('keydown', toets)
    return () => window.removeEventListener('keydown', toets)
  }, [bezig, onSluit])

  const lijst = useMemo(() => (plan ? voorstellen(bedrijf, plan, 6) : []), [bedrijf, plan])
  const gevonden = plan && dienst ? zoekInPlan(plan, dienst) : undefined
  const tellend = gevonden ? gevonden.pd.dienst.ritten.filter((r) => r.telt) : []
  // Een eerste rit na de laatste: dan schuift de laatste mee.
  const iVan = Math.max(0, tellend.findIndex((r) => r.sleutel === vanRit))
  const iTotGekozen = tellend.findIndex((r) => r.sleutel === totRit)
  const iTot = iTotGekozen < 0 || iTotGekozen < iVan ? tellend.length - 1 : iTotGekozen
  const venster =
    gevonden && tellend.length > 0 ? rijvenster(gevonden.pd.dienst, tellend[iVan]?.sleutel, tellend[iTot]?.sleutel) : undefined
  const besparing = plan && gevonden && venster ? besparingVanRit(bedrijf, plan, gevonden.pd.dienst.sleutel, venster) : undefined

  const rijden = async (later: boolean, extra: { voorgesteldeBus?: boolean } = {}): Promise<void> => {
    if (!dienst || !venster || bezig) return
    setBezig(true)
    setWeigering(undefined)
    try {
      const uit = await window.career.bedrijfRit(dienst, {
        vanRit: venster.telt[0],
        totRit: venster.telt[venster.telt.length - 1],
        ...extra
      })
      if (!uit.fout) {
        onRijden(uit.payload, later)
        return
      }
      // Het profiel kan intussen veranderd zijn; zonder melding bijwerken, de reden staat hier.
      await handel(Promise.resolve({ payload: uit.payload }))
      setWeigering({
        fout: uit.fout,
        bus: uit.bus,
        anderGestart: Boolean(uit.payload.state?.activeDuty?.startedAt),
        payload: uit.payload
      })
    } finally {
      setBezig(false)
    }
  }

  /** De andere aangenomen dienst teruggeven en deze rijden. */
  const anderTeruggeven = async (): Promise<void> => {
    setBezig(true)
    try {
      await handel(window.career.cancelDuty())
    } finally {
      setBezig(false)
    }
    await rijden(false)
  }

  const kop = gevonden
    ? tr('bd.rit.kies.kop', { dienst: dienstNaam(gevonden.po.omloop.tourNumber, gevonden.pd.dienst.deel) })
    : tr('bd.rit.knop')

  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && !bezig && onSluit()}>
      <section className="dialog zr-keuze" role="dialog" aria-modal="true" aria-label={kop}>
        <h2>{kop}</h2>

        {!plan && <p>{tr('bd.rit.kies.geenPlan')}</p>}

        {plan && !gevonden && (
          <>
            <h3 className="zr-sub">{tr('bd.rit.voorstellen')}</h3>
            <VoorstelLijst
              lijst={lijst}
              onKies={(d) => {
                setDienst(d)
                setVanRit(undefined)
                setTotRit(undefined)
                setWeigering(undefined)
              }}
            />
            {dienst && <p className="zr-fout">{loose(taal, 'bd.fout.dienst', tr('bd.failed'))}</p>}
          </>
        )}

        {plan && gevonden && venster && (
          <>
            <p className="zr-lijn">
              {gevonden.po.omloop.lijn} · {klok(gevonden.pd.dienst.van)}–{klok(gevonden.pd.dienst.tot)}
            </p>
            <div className="zr-ritten">
              <label>
                <span>{tr('bd.rit.kies.van')}</span>
                <select
                  value={tellend[iVan]?.sleutel}
                  disabled={bezig}
                  onChange={(e) => {
                    setVanRit(e.target.value)
                    setWeigering(undefined)
                  }}
                >
                  {tellend.map((r) => (
                    <option key={r.sleutel} value={r.sleutel}>
                      {klok(r.vertrek)} {r.van} → {r.naar}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{tr('bd.rit.kies.tot')}</span>
                <select
                  value={tellend[iTot]?.sleutel}
                  disabled={bezig}
                  onChange={(e) => {
                    setTotRit(e.target.value)
                    setWeigering(undefined)
                  }}
                >
                  {tellend.map((r, i) => (
                    <option key={r.sleutel} value={r.sleutel} disabled={i < iVan}>
                      {klok(r.aankomst)} {r.naar}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <ul className="zr-uitleg">
              <li>
                {tr('bd.rit.kies.jij', {
                  van: klok(venster.van),
                  tot: klok(venster.tot),
                  werk: uren((venster.tot - venster.van) / 60, taal),
                  betaald: uren(
                    venster.ritten.filter((r) => r.telt).reduce((s, r) => s + (r.aankomst - r.vertrek) / 60, 0),
                    taal
                  )
                })}
              </li>
              <li>
                {(() => {
                  const stukken = restVan(gevonden.pd.dienst, venster)
                  if (stukken.length === 0 || !besparing?.rest) return tr('bd.rit.kies.restGeen')
                  const laatste = stukken[stukken.length - 1]
                  const eerder = stukken
                    .slice(0, -1)
                    .map((s) => `${klok(s.van)}–${klok(s.tot)}, `)
                    .join('')
                  return tr('bd.rit.kies.rest', {
                    van: `${eerder}${klok(laatste.van)}`,
                    tot: klok(laatste.tot),
                    wie: wieTekst(tr, bedrijf, besparing.rest),
                    geld: geld(besparing.restKosten)
                  })
                })()}
              </li>
              <li className={besparing && besparing.bespaart > 0 ? 'optijd' : undefined}>
                {besparing && besparing.bespaart > 0
                  ? tr('bd.rit.kies.bespaart', { geld: geld(besparing.bespaart) })
                  : gevonden.pd.stand.wie.soort === 'eigen' || gevonden.pd.stand.wie.soort === 'collega'
                    ? tr('bd.rit.kies.bespaartNiets', { naam: wieTekst(tr, bedrijf, gevonden.pd.stand) })
                    : tr('bd.rit.kies.bespaart', { geld: geld(0) })}
              </li>
              {(() => {
                const n = plan.telling.open - (gevonden.pd.plots ? 1 : 0)
                return n > 0 ? <li className="let">{tr('bd.rit.kies.andereOpen', { n })}</li> : null
              })()}
            </ul>
          </>
        )}

        {weigering && (
          <div className="zr-fout" role="alert">
            <p>
              {weigering.fout === 'bus' && weigering.bus
                ? tr('bd.rit.busNiet', { bus: busTekst(tr, bedrijf, weigering.bus.nummer, weigering.bus.naam) })
                : loose(taal, `bd.fout.${weigering.fout}`, tr('bd.failed'))}
            </p>
            {weigering.fout === 'bus' && (
              <button type="button" className="bd-knop" disabled={bezig} onClick={() => void rijden(false, { voorgesteldeBus: true })}>
                {tr('bd.rit.voorgesteld')}
              </button>
            )}
            {weigering.fout === 'ritBezig' && !weigering.anderGestart && (
              <button type="button" className="bd-knop" disabled={bezig} onClick={() => void anderTeruggeven()}>
                {tr('bd.rit.anderTeruggeven')}
              </button>
            )}
            {weigering.fout === 'ritBezig' && weigering.anderGestart && (
              <button
                type="button"
                className="bd-knop"
                // Naar de dienst die al loopt: dezelfde weg als na het aannemen.
                onClick={() => onRijden(weigering.payload, false)}
              >
                {tr('bd.rit.naarDienst')}
              </button>
            )}
          </div>
        )}

        <div className="dialog-actions zr-acties">
          {gevonden && !beginDienst && (
            <button
              type="button"
              className="bd-knop zacht"
              disabled={bezig}
              onClick={() => {
                setDienst(undefined)
                setWeigering(undefined)
              }}
            >
              ← {tr('bd.rit.kies.terug')}
            </button>
          )}
          <span className="zr-vul" />
          <button type="button" className="bd-knop" disabled={bezig} onClick={onSluit}>
            {tr('bd.rit.kies.annuleren')}
          </button>
          {gevonden && venster && (
            <>
              <button type="button" className="bd-knop" disabled={bezig} onClick={() => void rijden(true)}>
                {tr('bd.rit.kies.later')}
              </button>
              <button type="button" className="bd-knop hoofd" disabled={bezig} onClick={() => void rijden(false)}>
                {tr('bd.rit.kies.nuRijden')}
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  )
}
