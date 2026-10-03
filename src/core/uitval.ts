import {
  aanHetWerk,
  bedrijfsfactoren,
  boekRegel,
  isInzetbaar,
  meldBericht,
  reeks,
  type Bedrijf,
  type EigenBus
} from './bedrijf'
import { boete, reputatieVerlies, vergoeding } from './plantarief'
import type {
  BusStand,
  Dagrooster,
  DagPlan,
  DienstVanDag,
  InvulDoel,
  OmloopVanDag,
  PlanDienst,
  PlanOmloop,
  Stand,
  Uitval,
  Vandaag
} from './planTypen'
import { dagplan } from './rooster'

/*
 * Uitval: wie er vanochtend ziek is, wie te laat komt, en welke bus niet start
 * (ontwerp busbedrijf-planning §5.1).
 *
 * WAAROM LOS VAN DE INDELING
 * De trekking gaat per beschikbare chauffeur en per inzetbare bus, niet per
 * ingedeelde dienst. Wie 's avonds een leeg rooster achterlaat, ontloopt de
 * pech daar dus niet mee, en een rooster dat je later vult, verandert niets
 * aan wie er vanochtend te laat is. Het plan (`dagplan`) legt de gevolgen
 * daarna op wat die chauffeur of bus vandaag rijdt.
 *
 * WAAROM EEN VASTE REEKS
 * Alles komt uit `reeks(zaad)` met de dag en het nummer erin, nooit uit de
 * toevalsgenerator van JavaScript: dezelfde dag geeft dezelfde uitval, ook na
 * een herstart. De uitkomst staat bovendien in `vandaag.uitval`, zodat een
 * tweede aanroep op dezelfde dag niets opnieuw trekt (en een pech niet twee
 * keer boekt).
 */

export const UITVAL = {
  /** Kans per chauffeur per dag dat hij te laat komt, en wat er bij komt onder tevredenheid 50. */
  telaatKans: 0.03,
  telaatExtraOnder50: 0.02,
  telaatMinuten: [20, 60],
  /** Pech: de basiskans, wat er bij komt naarmate de staat onder 70 zakt, en wat het kost. */
  pechBasis: 0.01,
  pechSlijtage: 0.06,
  pechOnder: 70,
  pechKosten: [200_00, 600_00],
  /** Elke monteur remt de pech af, tot een grens; dezelfde getallen als bij de slijtage. */
  pechRemmingPerMonteur: 0.1,
  pechRemmingMax: 0.4
} as const

/** Een lege `vandaag` voor deze dag. */
export function legeVandaag(dag: number): Vandaag {
  return { dag, uitval: [], invulling: {}, stukInvulling: {}, busInvulling: {}, gereden: {} }
}

/** De kans dat deze bus vanochtend niet start. */
export function pechKans(bus: EigenBus, monteurs: number): number {
  const slijtage = (Math.max(0, UITVAL.pechOnder - bus.staat) / UITVAL.pechOnder) * UITVAL.pechSlijtage
  const remming = Math.min(UITVAL.pechRemmingMax, Math.max(0, monteurs) * UITVAL.pechRemmingPerMonteur)
  return (UITVAL.pechBasis + slijtage) * (1 - remming)
}

/** De kans dat deze chauffeur vanochtend te laat komt. */
export function telaatKans(tevredenheid: number): number {
  return UITVAL.telaatKans + (tevredenheid < 50 ? UITVAL.telaatExtraOnder50 : 0)
}

/**
 * De uitval van vanochtend, getrokken bij het begin van de dag.
 *
 * - Ziek: elke chauffeur wiens ziekte vandaag begint (`ziekSinds`, gezet bij
 *   het afsluiten van gisteren). Vanaf de tweede dag is het vooraf bekend en
 *   geen uitval meer: dan besteedt het plan gewoon uit.
 * - Te laat: elke chauffeur die er is (niet ziek, niet op cursus).
 * - Pech: elke inzetbare bus. Hij gaat vandaag de werkplaats in (zonder
 *   schade), en de sleepdienst en de onderdelen worden meteen geboekt.
 */
export function uitvalVoorDag(b: Bedrijf, _dagen: Dagrooster[]): Bedrijf {
  const dag = b.dag
  const basis = b.vandaag?.dag === dag ? b.vandaag : legeVandaag(dag)
  // Al getrokken vandaag: niets opnieuw (een pech zou anders twee keer geboekt worden).
  if (basis.uitval.length > 0) return basis === b.vandaag ? b : { ...b, vandaag: basis }

  const uitval: Uitval[] = []
  for (const m of b.personeel ?? []) {
    if (m.rol === 'chauffeur' && m.ziekSinds === dag && (m.ziekTot === undefined || m.ziekTot >= dag)) {
      uitval.push({ id: `${dag}|ziek|${m.id}`, soort: 'ziek', medewerker: m.id })
    }
  }
  for (const m of aanHetWerk(b, 'chauffeur')) {
    const k = reeks(dag * 7121 + m.id * 97 + 3)
    if (k() < telaatKans(m.tevredenheid)) {
      const minuten = UITVAL.telaatMinuten[0] + Math.floor(k() * 5) * 10
      uitval.push({ id: `${dag}|telaat|${m.id}`, soort: 'telaat', medewerker: m.id, minuten })
    }
  }

  const monteurs = aanHetWerk(b, 'monteur').length
  const f = bedrijfsfactoren(b)
  const pech: Array<{ nummer: number; kosten: number }> = []
  const bussen = (b.bussen ?? []).map((bus) => {
    if (!isInzetbaar(bus, dag)) return bus
    const k = reeks(dag * 3571 + bus.nummer * 131 + 11)
    if (k() >= pechKans(bus, monteurs)) return bus
    // 200 tot 600 euro in stappen van een euro, met de korting van het niveau.
    const kosten = Math.round((UITVAL.pechKosten[0] + Math.floor(k() * 401) * 100) * f.onderhoud)
    pech.push({ nummer: bus.nummer, kosten })
    uitval.push({ id: `${dag}|pech|${bus.nummer}`, soort: 'pech', bus: bus.nummer, kosten })
    // Vandaag de werkplaats in; het bestaande bericht 'werkplaats' meldt vanavond dat hij morgen weer rijdt.
    return { ...bus, werkplaatsTot: dag }
  })

  let uit: Bedrijf = { ...b, ...(b.bussen ? { bussen } : {}), vandaag: { ...basis, uitval } }
  for (const p of pech) {
    uit = boekRegel(uit, { soort: 'pech', bedrag: -p.kosten, wat: `Bus ${p.nummer}`, gemeten: false })
  }
  return uit
}

/** De uitval van vandaag; leeg als `vandaag` van een andere dag is. */
export function uitvalVan(b: Bedrijf): Uitval[] {
  return b.vandaag?.dag === b.dag ? b.vandaag.uitval : []
}

/* ------------------------------------------------------------------ */
/* De gevolgen in het plan                                            */
/* ------------------------------------------------------------------ */

/**
 * Een plek in het plan die door uitval geraakt is, of die de centrale vult:
 * een hele dienst, het te-laat-stuk van een dienst, of een omloop zonder bus.
 */
export type UitvalPlek =
  | { soort: 'dienst' | 'stuk'; omloop: PlanOmloop; dienst: PlanDienst; van: number; tot: number; rituren: number; stand: Stand }
  | { soort: 'omloop'; omloop: PlanOmloop; van: number; tot: number; rituren: number; stand: BusStand }

/** Eén uitval met wat hij vandaag raakt; leeg als hij niet ingedeeld stond. */
export interface UitvalGevolg {
  uitval: Uitval
  plekken: UitvalPlek[]
}

/** Het nummer van een dienst zoals de speler hem kent: "55103-1". */
export function dienstNaam(omloop: Pick<OmloopVanDag, 'tourNumber'>, dienst: Pick<DienstVanDag, 'deel'>): string {
  return `${omloop.tourNumber}-${dienst.deel}`
}

/** Het doel voor `bedrijfInvullen` bij deze plek. */
export function doelVan(plek: UitvalPlek): InvulDoel {
  return plek.soort === 'omloop'
    ? { soort: 'omloop', omloop: plek.omloop.omloop.sleutel }
    : { soort: plek.soort, dienst: plek.dienst.dienst.sleutel }
}

/**
 * Het stuk dat open valt als iemand `minuten` te laat komt: van het begin van
 * de dienst tot het vertrek van de eerste rit die hij nog haalt. Dezelfde regel
 * als in `dagplan` (§4.2); hier alleen voor de weergave als het plan geen stuk
 * kent.
 */
export function telaatStuk(d: DienstVanDag, minuten: number): { van: number; tot: number } {
  const haalt = d.ritten.find((r) => r.vertrek >= d.van + minuten)
  return { van: d.van, tot: haalt ? haalt.vertrek : d.tot }
}

function alleDiensten(plan: DagPlan): Array<{ omloop: PlanOmloop; dienst: PlanDienst }> {
  const uit: Array<{ omloop: PlanOmloop; dienst: PlanDienst }> = []
  for (const k of plan.kaarten) for (const o of k.omlopen) for (const d of o.diensten) uit.push({ omloop: o, dienst: d })
  return uit.sort((a, b) => a.dienst.dienst.van - b.dienst.dienst.van || a.dienst.dienst.sleutel.localeCompare(b.dienst.dienst.sleutel))
}

function alleOmlopen(plan: DagPlan): PlanOmloop[] {
  return plan.kaarten
    .flatMap((k) => k.omlopen)
    .sort((a, b) => a.omloop.van - b.omloop.van || a.omloop.sleutel.localeCompare(b.omloop.sleutel))
}

/** Wie volgens het rooster deze dienst rijdt: uit het plan, anders uit het rooster zelf. */
function roosterChauffeur(b: Bedrijf, d: PlanDienst): number | undefined {
  return d.roosterId ?? b.rooster?.chauffeurs[d.dienst.sleutel]
}

function roosterBus(b: Bedrijf, o: PlanOmloop): number | undefined {
  return o.roosterBus ?? b.rooster?.bussen[o.omloop.sleutel]
}

function dienstPlek(omloop: PlanOmloop, dienst: PlanDienst): UitvalPlek {
  const d = dienst.dienst
  return { soort: 'dienst', omloop, dienst, van: d.van, tot: d.tot, rituren: d.rituren, stand: dienst.stand }
}

function omloopPlek(omloop: PlanOmloop): UitvalPlek {
  const o = omloop.omloop
  return { soort: 'omloop', omloop, van: o.van, tot: o.tot, rituren: o.rituren, stand: omloop.bus }
}

/**
 * Per uitval van vandaag wat hij in het plan raakt. Ziek: al zijn diensten.
 * Te laat: het begin van zijn eerste dienst. Pech: de omlopen van die bus.
 */
export function gevolgenVan(b: Bedrijf, plan: DagPlan | undefined): UitvalGevolg[] {
  const lijst = uitvalVan(b)
  if (!plan || !plan.vandaag || plan.dag !== b.dag) return lijst.map((uitval) => ({ uitval, plekken: [] }))
  const diensten = alleDiensten(plan)
  const omlopen = alleOmlopen(plan)
  return lijst.map((uitval): UitvalGevolg => {
    if (uitval.soort === 'pech') {
      return { uitval, plekken: omlopen.filter((o) => roosterBus(b, o) === uitval.bus).map(omloopPlek) }
    }
    const zijn = diensten.filter((x) => roosterChauffeur(b, x.dienst) === uitval.medewerker)
    if (uitval.soort === 'ziek') return { uitval, plekken: zijn.map((x) => dienstPlek(x.omloop, x.dienst)) }
    const eerste = zijn[0]
    if (!eerste) return { uitval, plekken: [] }
    const { omloop, dienst } = eerste
    if (dienst.stuk) {
      const s = dienst.stuk
      return {
        uitval,
        plekken: [{ soort: 'stuk', omloop, dienst, van: s.van, tot: s.tot, rituren: s.rituren, stand: s.stand }]
      }
    }
    // Geen stuk in het plan: dan valt de hele dienst (te laat voor alles), of het plan kent nog geen te laat.
    if (dienst.stand.reden === 'telaat') return { uitval, plekken: [dienstPlek(omloop, dienst)] }
    const stuk = telaatStuk(dienst.dienst, uitval.minuten ?? UITVAL.telaatMinuten[0])
    return {
      uitval,
      plekken: [{ soort: 'stuk', omloop, dienst, van: stuk.van, tot: stuk.tot, rituren: 0, stand: dienst.stand }]
    }
  })
}

/**
 * Alle plekken die de centrale vandaag vult (of laat vallen omdat er niemand
 * meer is), op volgorde van begintijd.
 */
export function centraleGaten(plan: DagPlan | undefined): UitvalPlek[] {
  if (!plan || !plan.vandaag) return []
  const uit: UitvalPlek[] = []
  for (const o of alleOmlopen(plan)) {
    if (o.bus.bron === 'centrale') uit.push(omloopPlek(o))
    for (const d of o.diensten) {
      if (d.stand.bron === 'centrale') uit.push(dienstPlek(o, d))
      if (d.stuk && d.stuk.stand.bron === 'centrale') {
        uit.push({ soort: 'stuk', omloop: o, dienst: d, van: d.stuk.van, tot: d.stuk.tot, rituren: d.stuk.rituren, stand: d.stuk.stand })
      }
    }
  }
  return uit.sort((a, b) => a.van - b.van)
}

/** Wat de centrale vandaag doet en wat er uitvalt: voor de afsluitvraag en de ochtendmelding. */
export interface CentraleSom {
  /** Dienst- en stukgaten die de centrale vult, en omlopen waar hij een bus voor regelt. */
  diensten: number
  omlopen: number
  uitzend: { n: number; kosten: number }
  huur: { n: number; kosten: number }
  collega: number
  eigenBus: number
  /** Of er spoedtoeslag in zit (vervalt na de opleiding Planner). */
  toeslag: boolean
  /** Wat de centrale samen betaalt. */
  kosten: number
  /** Alles wat vandaag uitvalt, ook wat je zelf liet liggen. */
  liggen: { diensten: number; rituren: number; verlies: number; reputatie: number }
}

export function centraleSom(b: Bedrijf, plan: DagPlan | undefined): CentraleSom {
  const som: CentraleSom = {
    diensten: 0,
    omlopen: 0,
    uitzend: { n: 0, kosten: 0 },
    huur: { n: 0, kosten: 0 },
    collega: 0,
    eigenBus: 0,
    toeslag: false,
    kosten: 0,
    liggen: { diensten: 0, rituren: 0, verlies: 0, reputatie: 0 }
  }
  if (!plan || !plan.vandaag) return som
  for (const p of centraleGaten(plan)) {
    const wie = p.stand.wie.soort
    if (wie === 'liggen') continue
    if (p.soort === 'omloop') som.omlopen += 1
    else som.diensten += 1
    if (p.stand.toeslag) som.toeslag = true
    if (wie === 'uitzend') {
      som.uitzend.n += 1
      som.uitzend.kosten += p.stand.kosten
    } else if (wie === 'huur') {
      som.huur.n += 1
      som.huur.kosten += p.stand.kosten
    } else if (wie === 'collega') som.collega += 1
    else if (wie === 'eigen' && p.soort === 'omloop') som.eigenBus += 1
    som.kosten += p.stand.kosten
  }
  const rituren = alleDiensten(plan).reduce((s, x) => s + x.dienst.uitgevallen, 0)
  if (rituren > 0) {
    som.liggen = {
      diensten: alleDiensten(plan).filter((x) => x.dienst.uitgevallen > 0).length,
      rituren,
      verlies: verliesVan(b, rituren),
      reputatie: reputatieVerlies(rituren)
    }
  }
  return som
}

/** Wat uitgevallen rituren kosten: de gemiste vergoeding plus de boete, in centen. */
export function verliesVan(b: Bedrijf, rituren: number): number {
  return vergoeding(rituren, b.reputatie, bedrijfsfactoren(b)) + boete(rituren)
}

/** Eigen chauffeurs en bussen die er vandaag zijn, maar niets te doen hebben. */
export function stilVan(b: Bedrijf, plan: DagPlan | undefined): { chauffeurs: number[]; bussen: number[] } {
  if (!plan) return { chauffeurs: [], bussen: [] }
  const er = new Set(aanHetWerk(b, 'chauffeur').map((m) => m.id))
  const inzet = new Set((b.bussen ?? []).filter((x) => isInzetbaar(x, plan.dag)).map((x) => x.nummer))
  return {
    chauffeurs: plan.vrij.chauffeurs.filter((id) => er.has(id)),
    bussen: plan.vrij.bussen.filter((n) => inzet.has(n))
  }
}

/* ------------------------------------------------------------------ */
/* De post van vanochtend                                             */
/* ------------------------------------------------------------------ */

/**
 * De berichten van vanochtend: per te laat en per pech een bericht, en als
 * laatste (dus bovenaan het postvak) de ochtendmelding met wat er open staat
 * en wat de centrale ervoor rekent. De ziekmelding kwam al bij het afsluiten
 * van gisteren ('ziek').
 *
 * Wie te laat is maar vandaag geen dienst heeft, krijgt geen bericht: dan
 * gebeurt er niets.
 */
export function meldUitval(b: Bedrijf, dagen: Dagrooster[]): Bedrijf {
  // Al gemeld vandaag: niet nog eens (wie niets meldde, meldt bij een tweede keer ook niets).
  const soorten = new Set(['telaat', 'pech', 'ochtend'])
  if ((b.post ?? []).some((x) => x.dag === b.dag && soorten.has(x.soort))) return b
  const lijst = uitvalVan(b)
  const plan = dagplan(b, dagen, b.dag)
  const gevolgen = gevolgenVan(b, plan)
  let uit = b
  for (const g of gevolgen) {
    const u = g.uitval
    if (u.soort === 'telaat') {
      const plek = g.plekken[0]
      const m = (b.personeel ?? []).find((x) => x.id === u.medewerker)
      if (!plek || plek.soort === 'omloop' || !m) continue
      uit = meldBericht(uit, 'telaat', {
        naam: m.naam,
        minuten: u.minuten ?? UITVAL.telaatMinuten[0],
        dienst: dienstNaam(plek.omloop.omloop, plek.dienst.dienst)
      })
    } else if (u.soort === 'pech' && u.bus !== undefined) {
      const omloop = g.plekken[0]?.omloop.omloop.tourNumber
      uit = meldBericht(uit, 'pech', { nummer: u.bus, kosten: u.kosten ?? 0, ...(omloop ? { omloop } : {}) })
    }
  }

  const gaten = centraleGaten(plan)
  const som = centraleSom(b, plan)
  const stil = stilVan(b, plan)
  const open = gaten.filter((p) => p.soort !== 'omloop').length
  const omlopen = gaten.filter((p) => p.soort === 'omloop').length
  const stilN = stil.chauffeurs.length + stil.bussen.length
  // Een melding als er iets te melden is; een dag zonder uitval en zonder stilstand is gewoon een dag.
  if (lijst.length > 0 || open + omlopen + stilN > 0) {
    uit = meldBericht(uit, 'ochtend', { dag: b.dag, open, omlopen, stil: stilN, kosten: som.kosten })
  }
  return uit
}
