import { useEffect, useMemo, useState, type JSX } from 'react'
import type { Bedrijf as BedrijfStaat, EigenBus, Medewerker } from '../../core/bedrijf'
import { ontleedDienst, ontleedOmloop } from '../../core/planSleutel'
import type { MapGeometry } from '../../core/geo'
import type {
  DagPlan,
  DienstSleutel,
  KaartOmloop,
  KaartRit,
  LijnPlan,
  LopendeRit,
  OmloopSleutel,
  PlanDienst,
  PlanOmloop
} from '../../core/planTypen'
import type { RitOpties } from '../../shared/bedrijfApi'
import { useZelfRijden } from './ZelfRijden'
import { formatDate, formatTime } from '../../shared/format'
import { loose, type Language, type TextKey } from '../../shared/i18n'
import { maakSporen, plekOpKlok, vertragingVan, type Track, type VlootPlek } from '../../shared/vloot'
import type { Naar } from './BedrijfDelen'
import { useLanguage, useT } from './language'
import { RouteMap, type VlootBus } from './RouteMap'
import { useBedrijfsklok, type Bedrijfsklok, type Snelheid } from './useBedrijfsklok'
import './vlootkaart.css'

/*
 * DE VLOOTKAART (tab "Kaart")
 *
 * Wens 4 van Luc: zien waar je bussen rijden, en er een aanklikken. De kaart
 * is de echte OMSI-kaart van de concessie (het wegennet uit `geometry`), met
 * daarop de lijnen van het bedrijf en elke omloop van de dag als pijl op de
 * plek waar hij volgens de dienstregeling is, met wat vertraging naar de
 * ervaring van de chauffeur en de staat van de bus. Alleen jouw eigen bus, als
 * je zelf rijdt, komt live uit OMSI.
 *
 * Klik op een bus: een kaartje zweeft erboven en rijdt mee, en de kaart volgt
 * de bus (noord boven) tot je zelf sleept of zoomt; zes tellen later volgt hij
 * weer. Het kaartje zegt wie er rijdt en wat er nog komt, en heeft de knoppen
 * naar de planning en naar zelf rijden.
 *
 * Ontwerp: design/ontwerpen/busbedrijf-planning.md §8.2. De rekensom zit in
 * shared/vloot.ts, de klok in useBedrijfsklok.ts, de kaart in RouteMap.tsx
 * (de `vloot`-laag).
 */

interface Props {
  bedrijf: BedrijfStaat
  /** Het plan van de dag (useDagplan); zonder plan is alles uitbesteed. */
  plan?: DagPlan
  /** De bedrijfsrit die nu loopt: die bus is "jij". */
  lopend?: LopendeRit
  naar: Naar
  /**
   * Zelf rijden openen (deel D) met de eerste rit na de klok. Zonder deze prop
   * staat de knop er niet; zie de eindmelding van deel E voor het contract.
   */
  onZelfRijden?: (dienst: DienstSleutel, opties: RitOpties) => void
}

type Toon = VlootBus['toon']

/** Alles wat de kaart, de lijst en het kaartje over één omloop weten op de klok. */
interface Rij {
  omloop: KaartOmloop
  po?: PlanOmloop
  pd?: PlanDienst
  plek: VlootPlek
  rit?: KaartRit
  toon: Toon
  spook: boolean
  label: string
  vertraging: number
  jij: boolean
  bus?: EigenBus
  chauffeur?: Medewerker
  reden?: string
  /** Te laat en niet ingevuld: zoveel minuten wacht de bus op de chauffeur. */
  wachtMin?: number
}

interface Live {
  x: number
  y: number
  koers: number
  kmh: number
  vertraging?: number
}

const SNELHEDEN: Snelheid[] = [1, 10, 60]

export function Vlootkaart({ bedrijf, plan, lopend, naar, onZelfRijden: eigen }: Props): JSX.Element {
  // Zonder eigen handler: het keuzevenster van Zelf rijden (deel D), als er een provider om de app staat.
  const zr = useZelfRijden()
  const onZelfRijden = eigen ?? ((dienst: DienstSleutel, opties: RitOpties) => zr.open(dienst, opties))
  const tr = useT()
  const taal = useLanguage()

  /** Elke kaart waar het bedrijf een concessie heeft, één keer. */
  const kaarten = useMemo(() => {
    const gezien = new Map<string, string>()
    for (const c of bedrijf.concessies) if (!gezien.has(c.mapFolder)) gezien.set(c.mapFolder, c.mapName || c.mapFolder)
    return [...gezien.entries()].map(([folder, naam]) => ({ folder, naam }))
  }, [bedrijf.concessies])
  const [kaartKeuze, setKaartKeuze] = useState<string>()
  const kaart = kaarten.find((k) => k.folder === kaartKeuze)?.folder ?? kaarten[0]?.folder
  const kaartNaam = kaarten.find((k) => k.folder === kaart)?.naam ?? kaart ?? ''
  const dag = plan?.dag ?? bedrijf.dag

  /*
   * Het wegennet, één keer per kaart: koud 2,5 s, daarna uit de schijfcache
   * (§8.6). Het gaat nooit mee in de peiling.
   */
  const [geo, setGeo] = useState<{ folder: string; geo?: MapGeometry; fout?: boolean }>()
  useEffect(() => {
    if (!kaart) return
    let weg = false
    setGeo((oud) => (oud?.folder === kaart ? oud : undefined))
    window.career
      .geometry(kaart)
      .then((g) => {
        if (!weg) setGeo({ folder: kaart, geo: g })
      })
      .catch(() => {
        if (!weg) setGeo({ folder: kaart, fout: true })
      })
    return () => {
      weg = true
    }
  }, [kaart])

  /** Het lijnplan, één keer per kaart en per dag (de werker maakt het, §8.6). */
  const lijnSleutel = `${kaart ?? ''}|${dag}|${bedrijf.concessies.map((c) => `${c.mapFolder}/${c.lineFile}`).join(',')}`
  const [lijnplan, setLijnplan] = useState<{ sleutel: string; plan?: LijnPlan; fout?: 'kaart' | 'geen' }>()
  useEffect(() => {
    if (!kaart) return
    let weg = false
    const sleutel = lijnSleutel
    window.career
      .bedrijfKaart(kaart, dag)
      .then((uit) => {
        if (weg) return
        setLijnplan('fout' in uit ? { sleutel, fout: uit.fout } : { sleutel, plan: uit })
      })
      .catch(() => {
        if (!weg) setLijnplan({ sleutel, fout: 'kaart' })
      })
    return () => {
      weg = true
    }
  }, [lijnSleutel]) // eslint-disable-line react-hooks/exhaustive-deps
  const lp = lijnplan?.sleutel === lijnSleutel ? lijnplan.plan : undefined
  const geometrie = geo?.folder === kaart ? geo.geo : undefined

  const klok = useBedrijfsklok(kaart, lp ? { van: lp.van, tot: lp.tot, datum: lp.datum } : undefined)
  const minuten = klok.minuten

  const stops = useMemo(() => new Map((geometrie?.stops ?? []).map((s) => [s.id, s])), [geometrie])
  const sporen = useMemo(() => (lp ? maakSporen(lp, stops) : new Map()), [lp, stops])

  /*
   * De lijnen en haltes van de concessies: alleen van ritten die tellen. De
   * LEE-ritten naar de remise rijden de bussen wel, maar als lijn op de kaart
   * lezen ze als een route die er niet is.
   */
  const { lijnen, haltes } = useMemo(() => {
    if (!lp) return { lijnen: undefined, haltes: undefined }
    const routes = new Map<string, KaartRit>()
    for (const o of lp.omlopen) for (const r of o.ritten) if (!r.leeg && !routes.has(r.route)) routes.set(r.route, r)
    const lijst: number[][] = []
    const ids = new Set<string>()
    for (const [route, rit] of routes) {
      for (const id of rit.stopIds) ids.add(id)
      const punten = lp.routes[route]
      if (punten && punten.length >= 4) lijst.push(punten)
      else {
        const recht = rit.stopIds.map((id) => stops.get(id)).filter((p) => p !== undefined)
        if (recht.length >= 2) lijst.push(recht.flatMap((p) => [p.x, p.y]))
      }
    }
    return { lijnen: lijst, haltes: [...ids] }
  }, [lp, stops])

  /** Het plan van deze kaart, per omloop. */
  const planOmlopen = useMemo(() => {
    const uit = new Map<OmloopSleutel, PlanOmloop>()
    const k = plan?.kaarten.find((x) => x.kaart.mapFolder.toLowerCase() === (kaart ?? '').toLowerCase())
    for (const po of k?.omlopen ?? []) uit.set(po.omloop.sleutel, po)
    return uit
  }, [plan, kaart])

  /*
   * JIJ, LIVE
   * Rijd je zelf een dienst van deze kaart en speelt OMSI deze kaart, dan komt
   * jouw bus uit OMSI (1×/s) in plaats van uit de dienstregeling.
   */
  const jijOmloop = lopend ? ontleedDienst(lopend.dienst)?.omloop : undefined
  const jijHier = Boolean(jijOmloop && ontleedOmloop(jijOmloop)?.mapFolder.toLowerCase() === (kaart ?? '').toLowerCase())
  const liveMag = jijHier && klok.bron === 'omsi' && klok.kaartKlopt === true
  const [live, setLive] = useState<Live>()
  useEffect(() => {
    if (!liveMag) {
      setLive(undefined)
      return
    }
    let weg = false
    const vraag = async (): Promise<void> => {
      try {
        const { status, vehicle } = await window.career.liveStatus()
        if (weg) return
        if (!status || !vehicle) {
          setLive(undefined)
          return
        }
        const gepland = status.stopIndex !== undefined ? status.leg?.stopTimes?.[status.stopIndex] : undefined
        const achter = gepland !== undefined ? status.clockMinutes - gepland : undefined
        setLive({
          x: vehicle.x,
          y: vehicle.y,
          koers: vehicle.heading,
          kmh: Math.max(0, Math.round(status.speedKmh)),
          vertraging: achter !== undefined && Number.isFinite(achter) && achter > -60 && achter < 180 ? Math.max(0, Math.round(achter)) : undefined
        })
      } catch {
        if (!weg) setLive(undefined)
      }
    }
    void vraag()
    const timer = window.setInterval(() => void vraag(), 1000)
    return () => {
      weg = true
      window.clearInterval(timer)
    }
  }, [liveMag])

  /** Elke omloop op de klok. Goedkoop genoeg voor elk beeld (§8.6). */
  const rijen = useMemo<Rij[]>(() => {
    if (!lp) return []
    return lp.omlopen.map((omloop) => rijVan(omloop, planOmlopen.get(omloop.sleutel), minuten, dag, bedrijf, lopend, sporen, stops, jijOmloop === omloop.sleutel ? live : undefined))
  }, [lp, planOmlopen, minuten, dag, bedrijf, lopend, sporen, stops, jijOmloop, live])

  const [gekozen, setGekozen] = useState<OmloopSleutel>()
  const [volg, setVolg] = useState(true)
  const kies = (id: string | undefined): void => {
    setGekozen(id)
    if (id) setVolg(true)
  }
  const gekozenRij = rijen.find((r) => r.omloop.sleutel === gekozen)

  const bussen = useMemo<VlootBus[]>(
    () =>
      rijen
        .filter((r) => Number.isFinite(r.plek.x) && Number.isFinite(r.plek.y))
        .map((r) => ({ id: r.omloop.sleutel, x: r.plek.x, y: r.plek.y, koers: r.plek.koers, toon: r.toon, label: r.label, spook: r.spook })),
    [rijen]
  )

  const uit = rijen.filter((r) => r.toon === 'uit')
  const onderweg = rijen.filter((r) => r.toon !== 'uit' && (r.plek.staat === 'rit' || r.plek.staat === 'leeg' || r.plek.staat === 'pauze'))
  const remise = rijen.filter((r) => r.toon !== 'uit' && !onderweg.includes(r))

  if (kaarten.length === 0) {
    return (
      <section className="bd-paneel vk-leeg">
        <p className="bd-rustig">{tr('bd.kaart.geen')}</p>
      </section>
    )
  }

  const fout = (geo?.folder === kaart && geo.fout) || (lijnplan?.sleutel === lijnSleutel && lijnplan.fout === 'kaart')
  // Main kent (nog) geen concessie op deze kaart: dan rijdt er niets, en valt er niets te laden.
  const niets = lijnplan?.sleutel === lijnSleutel && lijnplan.fout === 'geen'
  const laden = !fout && !niets && (!geometrie || !lp)

  return (
    <div className="vk">
      <header className="vk-balk">
        {kaarten.length > 1 && (
          <div className="vk-chips" role="group" aria-label={tr('bd.kaart.kaarten')}>
            {kaarten.map((k) => (
              <button
                key={k.folder}
                type="button"
                className={`bd-knop ${k.folder === kaart ? 'actief' : ''}`}
                aria-pressed={k.folder === kaart}
                onClick={() => {
                  setKaartKeuze(k.folder)
                  setGekozen(undefined)
                }}
              >
                {k.naam}
              </button>
            ))}
          </div>
        )}
        <KlokBalk klok={klok} />
        <p className="vk-regel">{tr('bd.kaart.gepland')}</p>
        {klok.kaartKlopt === false && <p className="vk-melding">{tr('bd.kaart.andereKaart')}</p>}
        {klok.kaartKlopt === true && klok.datumKlopt === false && klok.omsiDatum && lp && (
          <p className="vk-melding">
            {tr('bd.kaart.andereDatum', { datum: formatDate(klok.omsiDatum, taal), dag: lp.dag, bdatum: formatDate(lp.datum, taal) })}
          </p>
        )}
      </header>

      <div className="vk-werk">
        <div className="vk-kaart">
          {fout ? (
            <p className="vk-staat">{tr('bd.kaart.weg', { kaart: kaartNaam })}</p>
          ) : niets ? (
            <p className="vk-staat">{tr('bd.kaart.geen')}</p>
          ) : laden || !geometrie ? (
            <p className="vk-staat" role="status">
              {tr('bd.kaart.laden')}
            </p>
          ) : (
            <RouteMap
              geometry={geometrie}
              variant="full"
              vloot={{
                bussen,
                gekozen,
                onKies: kies,
                volg,
                lijnen,
                haltes,
                zweef: gekozenRij ? (
                  <BusKaartje
                    rij={gekozenRij}
                    klok={minuten}
                    dag={dag}
                    stops={stops}
                    live={gekozenRij.jij ? live : undefined}
                    volg={volg}
                    onVolg={() => setVolg((v) => !v)}
                    onSluit={() => setGekozen(undefined)}
                    naar={naar}
                    onZelfRijden={onZelfRijden}
                  />
                ) : undefined
              }}
            />
          )}
          {lp && lp.omlopen.length === 0 && !fout && <p className="vk-noot">{tr('bd.kaart.geenRitten')}</p>}
        </div>

        <aside className="vk-paneel">
          <Lijst titel={tr('bd.kaart.onderweg', { n: onderweg.length })} rijen={onderweg} gekozen={gekozen} onKies={kies} stops={stops} />
          <Lijst titel={tr('bd.kaart.remise', { n: remise.length })} rijen={remise} gekozen={gekozen} onKies={kies} stops={stops} />
          <Lijst titel={tr('bd.kaart.uit', { n: uit.length })} rijen={uit} gekozen={gekozen} onKies={kies} stops={stops} />
          <ul className="vk-legenda">
            {(['eigen', 'jij', 'uitzend', 'onder', 'uit'] as const).map((t) => (
              <li key={t}>
                <i className={`vk-stip toon-${t}`} aria-hidden="true" />
                {tr(`bd.kaart.legenda.${t}` as TextKey)}
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* De rekensom per omloop                                             */
/* ------------------------------------------------------------------ */

/** De dienst die op de klok rijdt, of anders de eerstvolgende, of de laatste. */
function dienstOpKlok(po: PlanOmloop | undefined, klok: number): PlanDienst | undefined {
  if (!po || po.diensten.length === 0) return undefined
  return (
    po.diensten.find((d) => klok >= d.dienst.van && klok <= d.dienst.tot) ??
    po.diensten.find((d) => d.dienst.van > klok) ??
    po.diensten[po.diensten.length - 1]
  )
}

function rijVan(
  omloop: KaartOmloop,
  po: PlanOmloop | undefined,
  klok: number,
  dag: number,
  bedrijf: BedrijfStaat,
  lopend: LopendeRit | undefined,
  sporen: Map<string, Track>,
  stops: Map<string, { x: number; y: number }>,
  live: Live | undefined
): Rij {
  const pd = dienstOpKlok(po, klok)
  const busWie = po?.bus.wie
  const bus = busWie?.soort === 'eigen' ? bedrijf.bussen?.find((b) => b.nummer === busWie.nummer) : undefined
  const wie = pd?.stand.wie
  const chauffeur = wie && (wie.soort === 'eigen' || wie.soort === 'collega') ? bedrijf.personeel?.find((m) => m.id === wie.id) : undefined

  const lopendHier = lopend && ontleedDienst(lopend.dienst)?.omloop === omloop.sleutel && klok >= lopend.van && klok <= lopend.tot
  const jij = Boolean(pd?.jij?.nu || lopendHier || live)

  // Te laat en niemand die het eerste stuk rijdt: de bus wacht.
  const stuk = pd?.stuk
  const wacht = !jij && stuk && stuk.stand.wie.soort === 'liggen' && klok >= stuk.van && klok < stuk.tot ? stuk : undefined

  const busLigt = busWie?.soort === 'liggen'
  const chauffeurLigt = wie?.soort === 'liggen'
  const valtUit = !jij && (busLigt || chauffeurLigt)
  const reden = valtUit ? (chauffeurLigt ? (pd?.stand.reden ?? 'open') : (po?.bus.reden ?? 'open')) : undefined

  let toon: Toon
  if (jij) toon = 'jij'
  else if (valtUit) toon = 'uit'
  else if (wie?.soort === 'uitzend' || busWie?.soort === 'huur') toon = 'uitzend'
  else if (wie?.soort === 'eigen' || wie?.soort === 'collega' || busWie?.soort === 'eigen') toon = 'eigen'
  else toon = 'onder'

  const label = busWie?.soort === 'eigen' ? String(busWie.nummer) : busWie?.soort === 'huur' ? 'H' : omloop.tourNumber

  let plek: VlootPlek
  let vertraging = 0
  if (valtUit && busLigt && po?.bus.reden === 'pech') {
    // Pech zonder vervanging: rood in de remise, niet op de lijn.
    plek = plekOpKlok(omloop, sporen, stops, (omloop.ritten[0]?.vertrek ?? 0) - 1)
  } else if (valtUit || wacht) {
    // Een spook op de geplande plek, of een bus die wacht: geen vertraging erbij.
    plek = plekOpKlok(omloop, sporen, stops, klok, 0, wacht ? wacht.tot : undefined)
  } else {
    const eerst = plekOpKlok(omloop, sporen, stops, klok)
    vertraging = vertragingVan(dag, omloop.sleutel, eerst.ritIndex, chauffeur?.ervaring, bus?.staat)
    plek = plekOpKlok(omloop, sporen, stops, klok, vertraging)
  }
  if (live) {
    plek = { ...plek, x: live.x, y: live.y, koers: live.koers }
    vertraging = live.vertraging ?? 0
  }

  return {
    omloop,
    po,
    pd,
    plek,
    rit: omloop.ritten[plek.ritIndex],
    toon,
    spook: valtUit && !(busLigt && po?.bus.reden === 'pech'),
    label,
    vertraging,
    jij,
    bus,
    chauffeur,
    reden,
    wachtMin: wacht ? Math.round(wacht.minuten) : undefined
  }
}

/** "Anna Becker" → "Anna B." */
function kortNaam(naam: string): string {
  const delen = naam.trim().split(/\s+/)
  return delen.length > 1 ? `${delen[0]} ${delen[delen.length - 1].slice(0, 1)}.` : naam
}

function useVertragingTekst(): (minuten: number | undefined) => string {
  const tr = useT()
  return (minuten) =>
    minuten === undefined || minuten === 0
      ? tr('bd.kaart.opTijd')
      : `${minuten > 0 ? '+' : '−'}${tr('bd.kaart.minuten', { n: Math.abs(minuten) })}`
}

/* ------------------------------------------------------------------ */
/* Klok                                                               */
/* ------------------------------------------------------------------ */

function KlokBalk({ klok }: { klok: Bedrijfsklok }): JSX.Element {
  const tr = useT()
  const tijd = formatTime(Math.floor(klok.minuten))
  return (
    <div className="vk-klok">
      <span className={`vk-tijd ${klok.bron}`}>
        {klok.bron === 'omsi' && <i className="vk-live" aria-hidden="true" />}
        {klok.bron === 'omsi' ? tr('bd.kaart.omsi', { tijd }) : tr('bd.kaart.eigen', { tijd })}
      </span>
      {/* Loopt de klok (ook met OMSI), dan pauzeren; pauzeren laat OMSI los tot [Nu]. */}
      <button type="button" className="bd-knop" onClick={() => (klok.loopt ? klok.pauze() : klok.speel())}>
        {klok.loopt ? `⏸ ${tr('bd.kaart.pauze')}` : `▶ ${tr('bd.kaart.speel')}`}
      </button>
      {SNELHEDEN.map((s) => (
        <button
          key={s}
          type="button"
          className={`bd-knop vk-snel ${klok.loopt && klok.snelheid === s ? 'actief' : ''}`}
          aria-pressed={klok.loopt && klok.snelheid === s}
          onClick={() => klok.snel(s)}
        >
          {tr('bd.kaart.snelheid', { n: s })}
        </button>
      ))}
      <input
        className="vk-schuif"
        type="range"
        min={Math.floor(klok.van)}
        max={Math.ceil(klok.tot)}
        step={1}
        value={Math.round(Math.min(klok.tot, Math.max(klok.van, klok.minuten)))}
        aria-label={tr('bd.kaart.klok')}
        aria-valuetext={tijd}
        onChange={(e) => klok.zet(Number(e.target.value))}
      />
      <button type="button" className="bd-knop" onClick={klok.nu}>
        {tr('bd.kaart.nu')}
      </button>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Lijsten                                                            */
/* ------------------------------------------------------------------ */

function Lijst({
  titel,
  rijen,
  gekozen,
  onKies,
  stops
}: {
  titel: string
  rijen: Rij[]
  gekozen?: string
  onKies(id: string): void
  stops: Map<string, { name?: string }>
}): JSX.Element {
  const tr = useT()
  const taal = useLanguage()
  const vertragingTekst = useVertragingTekst()
  return (
    <section className="vk-lijst">
      <h2>{titel}</h2>
      {rijen.length === 0 ? (
        <p className="bd-rustig">{tr('bd.kaart.leeg')}</p>
      ) : (
        <ul>
          {rijen.map((r) => {
            const eind = r.rit?.naar || (r.rit ? stops.get(r.rit.stopIds[r.rit.stopIds.length - 1])?.name : undefined) || ''
            const wie = r.jij
              ? tr('bd.kaart.legenda.jij')
              : r.chauffeur
                ? kortNaam(r.chauffeur.naam)
                : r.pd?.stand.wie.soort === 'uitzend'
                  ? tr('bd.kaart.uitzend')
                  : undefined
            const extra =
              r.toon === 'uit'
                ? tr('bd.kaart.valtUit', { reden: redenTekst(r.reden, taal, tr) })
                : r.wachtMin !== undefined
                  ? tr('bd.kaart.wachtLaat', { min: r.wachtMin })
                  : r.plek.staat === 'rit' || r.plek.staat === 'leeg'
                    ? vertragingTekst(r.vertraging)
                    : r.plek.volgendeTijd !== undefined
                      ? formatTime(r.plek.volgendeTijd)
                      : undefined
            return (
              <li key={r.omloop.sleutel}>
                <button
                  type="button"
                  className={`vk-rij ${r.omloop.sleutel === gekozen ? 'actief' : ''}`}
                  aria-pressed={r.omloop.sleutel === gekozen}
                  onClick={() => onKies(r.omloop.sleutel)}
                >
                  <b className={`vk-nummer toon-${r.toon}`}>{r.label}</b>
                  <span>
                    {r.rit ? tr('bd.kaart.naar', { lijn: r.rit.lijn, eind }) : ''}
                    {' · '}
                    {tr('bd.kaart.omloop', { omloop: r.omloop.tourNumber })}
                    {wie ? ` · ${wie}` : ''}
                    {extra ? ` · ${extra}` : ''}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function redenTekst(reden: string | undefined, taal: Language, tr: ReturnType<typeof useT>): string {
  return loose(taal, `bd.kaart.reden.${reden ?? 'open'}`, tr('bd.kaart.reden.open'))
}

/* ------------------------------------------------------------------ */
/* Het zwevende kaartje                                               */
/* ------------------------------------------------------------------ */

function BusKaartje({
  rij,
  klok,
  dag,
  stops,
  live,
  volg,
  onVolg,
  onSluit,
  naar,
  onZelfRijden
}: {
  rij: Rij
  klok: number
  dag: number
  stops: Map<string, { name?: string }>
  live?: Live
  volg: boolean
  onVolg(): void
  onSluit(): void
  naar: Naar
  onZelfRijden?: (dienst: DienstSleutel, opties: RitOpties) => void
}): JSX.Element {
  const tr = useT()
  const taal = useLanguage()
  const vertragingTekst = useVertragingTekst()
  const { omloop, pd, bus, chauffeur, plek, rit } = rij
  const busWie = rij.po?.bus.wie
  const wie = pd?.stand.wie

  const kop = bus
    ? tr('bd.kaart.bus', { nummer: bus.nummer, naam: bus.naam })
    : busWie?.soort === 'huur'
      ? tr('bd.kaart.huur')
      : tr('bd.kaart.omloop', { omloop: omloop.tourNumber })
  const eind = rit?.naar || (rit ? stops.get(rit.stopIds[rit.stopIds.length - 1])?.name : undefined) || ''
  const halte = plek.volgendeHalte ? (stops.get(plek.volgendeHalte)?.name ?? plek.volgendeHalte) : undefined

  // Overnemen vanaf de eerstvolgende rit die telt (ontwerp §8.2).
  const vanRit = pd?.dienst.ritten.find((r) => r.telt && r.vertrek >= klok)?.sleutel
  const zelf = onZelfRijden && pd && !rij.jij && vanRit !== undefined

  return (
    <div className={`vk-kaartje toon-${rij.toon}`} role="dialog" aria-label={kop}>
      <div className="vk-kaartje-kop">
        <b>{kop}</b>
        <button type="button" className="vk-sluit" onClick={onSluit} aria-label={tr('bd.kaart.sluit')}>
          ×
        </button>
      </div>
      {rit && <p>{tr('bd.kaart.naar', { lijn: rit.lijn, eind })}</p>}
      {pd && (
        <p>
          {tr('bd.kaart.omloopDienst', {
            omloop: omloop.tourNumber,
            deel: pd.dienst.deel,
            delen: pd.dienst.delen,
            van: formatTime(pd.dienst.van),
            tot: formatTime(pd.dienst.tot)
          })}
        </p>
      )}
      {rij.jij ? (
        <p className="vk-jij">
          {live
            ? tr('bd.kaart.jij', { kmh: live.kmh, vertraging: vertragingTekst(live.vertraging) })
            : tr('bd.kaart.jijGepland')}
        </p>
      ) : chauffeur ? (
        <p>{tr('bd.kaart.chauffeur', { naam: chauffeur.naam, n: Math.round(chauffeur.ervaring) })}</p>
      ) : wie?.soort === 'uitzend' ? (
        <p>{tr('bd.kaart.uitzend')}</p>
      ) : rij.toon === 'onder' ? (
        <p>{tr('bd.kaart.onder')}</p>
      ) : null}
      {rij.toon === 'uit' && <p className="laat">{tr('bd.kaart.valtUit', { reden: redenTekst(rij.reden, taal, tr) })}</p>}
      {rij.wachtMin !== undefined && <p className="let">{tr('bd.kaart.wachtLaat', { min: rij.wachtMin })}</p>}
      {halte && plek.volgendeTijd !== undefined && plek.staat !== 'klaar' && rij.toon !== 'uit' && (
        <p>
          {tr('bd.kaart.volgende', {
            halte,
            tijd: formatTime(plek.volgendeTijd),
            vertraging: vertragingTekst(rij.vertraging)
          })}
        </p>
      )}
      {bus && <p className="vk-zacht">{tr('bd.kaart.busStaat', { staat: Math.round(bus.staat), schade: Math.round(bus.schade) })}</p>}
      <div className="vk-knoppen">
        <button type="button" className={`bd-knop ${volg ? 'actief' : ''}`} aria-pressed={volg} onClick={onVolg}>
          {tr('bd.kaart.volgen')}
        </button>
        <button
          type="button"
          className="bd-knop"
          onClick={() => naar('planning', { dag, omloop: omloop.sleutel, dienst: pd?.dienst.sleutel })}
        >
          {tr('bd.kaart.inPlanning')}
        </button>
        {rij.toon === 'uit' && (
          <button
            type="button"
            className="bd-knop hoofd"
            onClick={() => naar('planning', { dag, omloop: omloop.sleutel, dienst: pd?.dienst.sleutel })}
          >
            {tr('bd.kaart.invullen')}
          </button>
        )}
        {zelf && (
          <button type="button" className="bd-knop zelf" onClick={() => onZelfRijden(pd.dienst.sleutel, { vanRit })}>
            {tr('bd.kaart.zelfRijden')}
          </button>
        )}
      </div>
    </div>
  )
}
