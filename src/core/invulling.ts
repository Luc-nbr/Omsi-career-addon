import { aanHetWerk, bedrijfsfactoren, isInzetbaar, type Bedrijf, type Busvorm, type EigenBus } from './bedrijf'
import { ontleedDienst, ontleedOmloop } from './bedrijfsplan'
import { PLAN, bevoegd, blokVan, overlapt, toets, werkMinuten, type Blok } from './planregels'
import { boete, busKosten, chauffeurKosten, overurenKosten, reputatieVerlies, toeslagGeldt, vergoeding } from './plantarief'
import type {
  Bron,
  BusKeuze,
  BusStand,
  BusWie,
  DagPlan,
  DienstSleutel,
  DienstVanDag,
  InvulDoel,
  InvulFout,
  InvulKeuze,
  LopendeRit,
  OmloopSleutel,
  OmloopVanDag,
  PlanDienst,
  PlanOmloop,
  Stand,
  Vandaag,
  Wie
} from './planTypen'

/*
 * Open diensten vullen, en de centrale die het doet als jij het niet doet
 * (ontwerp busbedrijf-planning §6.1).
 *
 * Een gat is een dienst (of het te-laat-stuk ervan) zonder chauffeur, of een
 * omloop zonder bus. Jij kiest per gat: een collega, een uitzendkracht, de
 * onderaannemer (niet bij plotse uitval: dan heeft die niemand meer) of de
 * ritten laten liggen. Voor een bus: een andere eigen bus, een huurbus of de
 * omloop laten uitvallen. Wat je kiest komt in `vandaag`; `dagplan` (deel A)
 * leest het daar terug. Kies je niets, dan vult de centrale een plots gat zelf:
 * een vrije collega, anders een uitzendkracht met spoedtoeslag, anders valt
 * het uit.
 *
 * De bedragen komen uit dezelfde plantarief-functies en dezelfde rest-regels
 * als `dagplan`, zodat wat je hier ziet het verschil is dat de afrekening van
 * de dag maakt. Alles in hele centen.
 */

export interface InvulOptie {
  keuze: InvulKeuze | BusKeuze
  /** Wat de dag kost met deze keuze, tegenover een gat dat niets kost. */
  kosten: number
  beschikbaar: boolean
  reden?: InvulFout
  /** Reputatie die je verliest (positief getal), bij laten liggen. */
  reputatie?: number
  /** De goedkoopste beschikbare keuze die niet "laten liggen" is. */
  standaard?: boolean
  /** Naam van de collega of de bus. */
  wie?: string
  /** Laten liggen: de vergoeding die je misloopt en de boete (zitten in `kosten`). */
  gemist?: number
  boete?: number
  /** Collega: hoeveel minuten hij vandaag nog werkt tot zijn dagdoel, vóór dit gat. */
  vrijMinuten?: number
  /** Een waarschuwing, geen verbod: weinig ervaring op deze bus, een bus van een andere vorm, overuren. */
  let?: 'bevoegd' | 'vorm' | 'overuren'
}

/** Een gat in het plan: een dienst, een te-laat-stuk of een omloop zonder bus. */
export interface Gat {
  doel: InvulDoel
  van: number
  tot: number
  minuten: number
  rituren: number
  plots: boolean
  vorm?: Busvorm
}

/**
 * Wat de centrale weet als hij een gat vult. De aanroeper (dagplan) werkt dit
 * na elke keuze bij: het werk van de gekozen collega, de bezetting van de
 * gekozen bus en het aantal uitzendkrachten. `kiesAutomatisch` zelf is puur.
 */
export interface CentraleContext {
  vrijeChauffeurs: number[]
  vrijeBussen: number[]
  werk: Record<number, Blok[]>
  busBezet: Record<number, Blok[]>
  uitzend: { gebruikt: number; max: number }
}

/** Een rij in "Open diensten": een gat dat er vandaag is, ingevuld of niet. */
export interface OpenRij {
  doel: InvulDoel
  gat: Gat
  omloop: OmloopVanDag
  dienst?: DienstVanDag
  /** Waarom het open is; de bus: pech of werkplaats. */
  reden?: 'ziek' | 'telaat' | 'afwezig' | 'pech' | 'werkplaats'
  /** Te laat: zoveel minuten. */
  laatMinuten?: number
  /** Wie er nu rijdt en wie dat besliste. */
  wie: Wie | BusWie
  bron: Bron
  toeslag?: boolean
  /** Wat het gat nu kost, met laten liggen als gemiste vergoeding plus boete. */
  kosten: number
  /** De roosterbus van een busrij. */
  bus?: number
}

/* ------------------------------------------------------------------ */
/* Zoeken in het plan                                                  */
/* ------------------------------------------------------------------ */

interface DienstPlek {
  po: PlanOmloop
  pd: PlanDienst
}

function zoekPlanDienst(plan: DagPlan, sleutel: DienstSleutel): DienstPlek | undefined {
  const omloop = ontleedDienst(sleutel)?.omloop
  if (!omloop) return undefined
  const po = zoekPlanOmloop(plan, omloop)
  const pd = po?.diensten.find((d) => d.dienst.sleutel === sleutel)
  return po && pd ? { po, pd } : undefined
}

function zoekPlanOmloop(plan: DagPlan, sleutel: OmloopSleutel): PlanOmloop | undefined {
  for (const k of plan.kaarten) {
    const po = k.omlopen.find((o) => o.omloop.sleutel === sleutel)
    if (po) return po
  }
  return undefined
}

/** Niet in het plan: staat de kaart op de terugval, dan is dat de reden. */
function nietGevonden(plan: DagPlan, sleutel: string): InvulFout {
  const map = ontleedOmloop(sleutel)?.mapFolder
  return map !== undefined && plan.terugval.some((t) => t.mapFolder === map) ? 'kaart' : 'weg'
}

/** De sleutel van het te-laat-stuk als blok, naast dat van de rest van de dienst. */
const stukSleutel = (d: DienstSleutel): string => `${d}#stuk`

function leegVandaag(dag: number): Vandaag {
  return { dag, uitval: [], invulling: {}, stukInvulling: {}, busInvulling: {}, gereden: {} }
}

function vandaagVan(b: Bedrijf): Vandaag {
  return b.vandaag?.dag === b.dag ? b.vandaag : leegVandaag(b.dag)
}

/* ------------------------------------------------------------------ */
/* Het gat zelf: welk stuk, hoe lang, hoeveel rituren                  */
/* ------------------------------------------------------------------ */

/**
 * Het deel van een dienst waar het om gaat, na aftrek van wat jij er al reed:
 * dat gaat eerst van het stuk af als je venster erin valt, anders van de
 * dienst (dezelfde regel als `dagplan`, §4.2 punt 5).
 */
function deelVan(
  pd: PlanDienst,
  soort: 'dienst' | 'stuk'
): { van: number; tot: number; minuten: number; rituren: number } | undefined {
  const d = pd.dienst
  const g = pd.jij?.gereden
  const s = pd.stuk
  const inStuk = !!(g && s && g.van >= s.van && g.tot <= s.tot)
  if (soort === 'stuk') {
    if (!s) return undefined
    return {
      van: s.van,
      tot: s.tot,
      minuten: Math.max(0, s.minuten - (inStuk && g ? g.werkMinuten : 0)),
      rituren: Math.max(0, s.rituren - (inStuk && g ? g.rituren : 0))
    }
  }
  const af = g && !inStuk ? g : undefined
  return {
    van: s ? s.tot : d.van,
    tot: d.tot,
    minuten: Math.max(0, d.minuten - (s?.minuten ?? 0) - (af?.werkMinuten ?? 0)),
    rituren: Math.max(0, d.rituren - (s?.rituren ?? 0) - (af?.rituren ?? 0))
  }
}

/** De vorm van de bus die de omloop vandaag rijdt; zonder eigen bus die van de omloop. */
function vormVanRit(b: Bedrijf, po: PlanOmloop): Busvorm | undefined {
  const w = po.bus.wie
  if (w.soort === 'eigen') return (b.bussen ?? []).find((x) => x.nummer === w.nummer)?.vorm ?? po.omloop.vorm
  return po.omloop.vorm
}

/** De rituren die de bus van deze omloop rijdt: zonder de diensten die zelf uitvallen. */
function busRituren(po: PlanOmloop): number {
  if (po.bus.wie.soort === 'liggen') return po.omloop.rituren
  return Math.max(0, po.omloop.rituren - po.diensten.reduce((s, d) => s + d.uitgevallen, 0))
}

/** Het gat van een doel, of niets als het doel niet (meer) in het plan staat. */
export function gatVan(b: Bedrijf, plan: DagPlan, doel: InvulDoel): Gat | undefined {
  if (doel.soort === 'omloop') {
    const po = zoekPlanOmloop(plan, doel.omloop)
    if (!po) return undefined
    const o = po.omloop
    return { doel, van: o.van, tot: o.tot, minuten: o.minuten, rituren: busRituren(po), plots: po.bus.reden === 'pech', vorm: o.vorm }
  }
  const plek = zoekPlanDienst(plan, doel.dienst)
  if (!plek) return undefined
  const deel = deelVan(plek.pd, doel.soort)
  if (!deel) return undefined
  return { doel, ...deel, plots: doel.soort === 'stuk' ? true : plek.pd.plots, vorm: vormVanRit(b, plek.po) }
}

function blokVoor(plek: DienstPlek, soort: 'dienst' | 'stuk'): Blok {
  const d = plek.pd.dienst
  const s = plek.pd.stuk
  if (soort === 'stuk' && s) return { ...blokVan(d, { van: s.van, tot: s.tot }), sleutel: stukSleutel(d.sleutel) }
  return blokVan(d, s ? { van: s.tot, tot: d.tot } : undefined)
}

/* ------------------------------------------------------------------ */
/* Wie wat rijdt in het plan                                           */
/* ------------------------------------------------------------------ */

const isMens = (w: Wie): w is { soort: 'eigen' | 'collega'; id: number } => w.soort === 'eigen' || w.soort === 'collega'

/** Het werk van elke eigen chauffeur volgens het plan, als blokken (stuk en rest apart). */
export function werkVanPlan(plan: DagPlan): Record<number, Blok[]> {
  const werk: Record<number, Blok[]> = {}
  const voeg = (id: number, blok: Blok): void => {
    ;(werk[id] ??= []).push(blok)
  }
  for (const k of plan.kaarten) {
    for (const po of k.omlopen) {
      for (const pd of po.diensten) {
        const plek = { po, pd }
        if (isMens(pd.stand.wie)) voeg(pd.stand.wie.id, blokVoor(plek, 'dienst'))
        if (pd.stuk && isMens(pd.stuk.stand.wie)) voeg(pd.stuk.stand.wie.id, blokVoor(plek, 'stuk'))
      }
    }
  }
  return werk
}

/** Welke omlopen elke eigen bus volgens het plan rijdt. */
export function busBezetVanPlan(plan: DagPlan): Record<number, Blok[]> {
  const bezet: Record<number, Blok[]> = {}
  for (const k of plan.kaarten) {
    for (const po of k.omlopen) {
      const w = po.bus.wie
      if (w.soort !== 'eigen') continue
      const o = po.omloop
      ;(bezet[w.nummer] ??= []).push({ sleutel: o.sleutel, van: o.van, tot: o.tot, vanHalte: '', totHalte: '' })
    }
  }
  return bezet
}

/** Een bus waarvoor vanochtend pech gemeld is, start vandaag niet. */
function heeftPech(b: Bedrijf, nummer: number): boolean {
  return vandaagVan(b).uitval.some((u) => u.soort === 'pech' && u.bus === nummer)
}

function busInzetbaar(b: Bedrijf, bus: EigenBus): boolean {
  return isInzetbaar(bus, b.dag) && !heeftPech(b, bus.nummer)
}

/** Vanaf wanneer een chauffeur die te laat is er is (op de dag van het plan). */
function aanwezigVanaf(b: Bedrijf, plan: DagPlan, id: number): number | undefined {
  const laat = vandaagVan(b).uitval.find((u) => u.soort === 'telaat' && u.medewerker === id)
  if (!laat) return undefined
  let eerste: number | undefined
  for (const k of plan.kaarten) {
    for (const po of k.omlopen) {
      for (const pd of po.diensten) {
        if (pd.roosterId === id) eerste = eerste === undefined ? pd.dienst.van : Math.min(eerste, pd.dienst.van)
      }
    }
  }
  return eerste === undefined ? undefined : eerste + (laat.minuten ?? 0)
}

/** Past dit blok bij wat deze collega al rijdt? Overlap, een te lange dag of nog niet binnen: nee. */
function collegaPast(b: Bedrijf, plan: DagPlan, werk: Record<number, Blok[]>, id: number, blok: Blok): boolean {
  const t = toets(werk[id] ?? [], blok)
  if (t.dubbel || t.teLang) return false
  const vanaf = aanwezigVanaf(b, plan, id)
  return vanaf === undefined || blok.van >= vanaf
}

/* ------------------------------------------------------------------ */
/* Wat een keuze kost                                                  */
/* ------------------------------------------------------------------ */

type Factoren = ReturnType<typeof bedrijfsfactoren>

interface Reken {
  b: Bedrijf
  plan: DagPlan
  f: Factoren
  gat: Gat
  po: PlanOmloop
  pd?: PlanDienst
  werk: Record<number, Blok[]>
}

/** De gereden rituren van een concessie volgens het plan. */
function concessieRituren(plan: DagPlan, mapFolder: string, lineFile: string): number {
  let som = 0
  for (const k of plan.kaarten) {
    for (const po of k.omlopen) {
      const o = po.omloop
      if (o.mapFolder !== mapFolder || o.lineFile.toLowerCase() !== lineFile.toLowerCase()) continue
      som += o.rituren - po.diensten.reduce((s, d) => s + d.uitgevallen, 0)
    }
  }
  return som
}

function uitgevallenVandaag(plan: DagPlan): number {
  let som = 0
  for (const k of plan.kaarten) for (const po of k.omlopen) for (const pd of po.diensten) som += pd.uitgevallen
  return som
}

/** Hoeveel rituren van dit gat nu al uitvallen (omdat het nu op liggen staat). */
function nuUitgevallen(r: Reken): number {
  const { gat, po, pd } = r
  if (gat.doel.soort === 'omloop') return po.bus.wie.soort === 'liggen' ? po.diensten.reduce((s, d) => s + d.uitgevallen, 0) : 0
  const stand = gat.doel.soort === 'stuk' ? pd?.stuk?.stand : pd?.stand
  return stand?.wie.soort === 'liggen' || po.bus.wie.soort === 'liggen' ? gat.rituren : 0
}

/**
 * Wat de bus van de omloop minder kost als `rituren` daarvan niet gereden
 * worden. Alleen als het plan de bus op de gereden rituren rekent: klopt het
 * bedrag in het plan niet met die som, dan rekent `dagplan` anders en telt de
 * bus hier niet mee.
 */
function busBesparing(r: Reken, rituren: number): number {
  const { po, f } = r
  const w = po.bus.wie.soort
  if (w === 'liggen' || rituren <= 0) return 0
  const nu = busRituren(po)
  if (busKosten(w, nu, f, po.bus.toeslag) !== po.bus.kosten) return 0
  const vrij = nu + nuUitgevallen(r)
  return busKosten(w, vrij, f, po.bus.toeslag) - busKosten(w, Math.max(0, vrij - rituren), f, po.bus.toeslag)
}

/** Laten liggen: de vergoeding die wegvalt, de boete, en de reputatie. */
function liggen(r: Reken, rituren: number): { gemist: number; boete: number; reputatie: number } {
  const o = r.po.omloop
  const vrij = concessieRituren(r.plan, o.mapFolder, o.lineFile) + nuUitgevallen(r)
  const gemist =
    vergoeding(vrij, r.b.reputatie, r.f) - vergoeding(Math.max(0, vrij - rituren), r.b.reputatie, r.f)
  const basis = Math.max(0, uitgevallenVandaag(r.plan) - nuUitgevallen(r))
  return {
    gemist,
    boete: boete(rituren),
    reputatie: reputatieVerlies(basis + rituren) - reputatieVerlies(basis)
  }
}

/** Overuren die er voor deze collega bij komen als hij `blok` ook rijdt. */
function overurenErbij(r: Reken, id: number, blok: Blok): { kosten: number; voor: number } {
  const m = (r.b.personeel ?? []).find((x) => x.id === id)
  const voor = werkMinuten((r.werk[id] ?? []).filter((x) => x.sleutel !== blok.sleutel))
  if (!m) return { kosten: 0, voor }
  const na = voor + r.gat.minuten
  return {
    kosten: overurenKosten(m.loon, na - PLAN.dagDoel) - overurenKosten(m.loon, voor - PLAN.dagDoel),
    voor
  }
}

function kostenChauffeur(
  r: Reken,
  keuze: InvulKeuze,
  toeslag: boolean,
  blok?: Blok
): Pick<InvulOptie, 'kosten' | 'gemist' | 'boete' | 'reputatie'> {
  switch (keuze.soort) {
    case 'collega':
      return { kosten: blok ? overurenErbij(r, keuze.id, blok).kosten : 0 }
    case 'uitzend':
      return { kosten: chauffeurKosten('uitzend', r.gat.minuten, r.f, toeslag) }
    case 'onderaannemer':
      return { kosten: chauffeurKosten('onderaannemer', r.gat.minuten, r.f) }
    case 'liggen': {
      const l = liggen(r, r.gat.rituren)
      return {
        kosten: l.gemist + l.boete - busBesparing(r, r.gat.rituren),
        gemist: l.gemist,
        boete: l.boete,
        reputatie: l.reputatie
      }
    }
  }
}

/** De chauffeurs van een omloop kosten niets meer als de omloop uitvalt. */
function chauffeursVanOmloop(po: PlanOmloop): number {
  return po.diensten.reduce((s, d) => s + d.stand.kosten + (d.stuk?.stand.kosten ?? 0), 0)
}

function kostenBus(r: Reken, keuze: BusKeuze, toeslag: boolean): Pick<InvulOptie, 'kosten' | 'gemist' | 'boete' | 'reputatie'> {
  switch (keuze.soort) {
    case 'eigen':
      return { kosten: busKosten('eigen', r.gat.rituren, r.f) }
    case 'huur':
      return { kosten: busKosten('huur', r.gat.rituren, r.f, toeslag) }
    case 'liggen': {
      const l = liggen(r, r.gat.rituren)
      return {
        kosten: l.gemist + l.boete - chauffeursVanOmloop(r.po),
        gemist: l.gemist,
        boete: l.boete,
        reputatie: l.reputatie
      }
    }
  }
}

function reken(b: Bedrijf, plan: DagPlan, doel: InvulDoel): Reken | undefined {
  const gat = gatVan(b, plan, doel)
  if (!gat) return undefined
  const f = bedrijfsfactoren(b)
  const werk = werkVanPlan(plan)
  if (doel.soort === 'omloop') {
    const po = zoekPlanOmloop(plan, doel.omloop)
    return po && { b, plan, f, gat, po, werk }
  }
  const plek = zoekPlanDienst(plan, doel.dienst)
  return plek && { b, plan, f, gat, po: plek.po, pd: plek.pd, werk }
}

/** De stand van een doel in het plan: wie er nu rijdt en wie dat koos. */
export function standVan(plan: DagPlan, doel: InvulDoel): Stand | BusStand | undefined {
  if (doel.soort === 'omloop') return zoekPlanOmloop(plan, doel.omloop)?.bus
  const plek = zoekPlanDienst(plan, doel.dienst)
  return doel.soort === 'stuk' ? plek?.pd.stuk?.stand : plek?.pd.stand
}

/**
 * Wat het gat nu kost, met dezelfde regels als de opties: voor laten liggen de
 * gemiste vergoeding en de boete. Dat bespaar je als je het zelf rijdt.
 */
export function huidigeKosten(b: Bedrijf, plan: DagPlan, doel: InvulDoel): number {
  const r = reken(b, plan, doel)
  const stand = standVan(plan, doel)
  if (!r || !stand) return 0
  const w = stand.wie
  if (doel.soort === 'omloop') {
    if (w.soort === 'onderaannemer') return busKosten('onderaannemer', r.gat.rituren, r.f)
    return kostenBus(r, w as BusKeuze, stand.toeslag === true).kosten
  }
  const mens = w as Wie
  const keuze: InvulKeuze = mens.soort === 'eigen' ? { soort: 'collega', id: mens.id } : (mens as InvulKeuze)
  const blok = r.pd && keuze.soort === 'collega' ? blokVoor({ po: r.po, pd: r.pd }, doel.soort === 'stuk' ? 'stuk' : 'dienst') : undefined
  return kostenChauffeur(r, keuze, stand.toeslag === true, blok).kosten
}

/* ------------------------------------------------------------------ */
/* Uitzendkrachten                                                     */
/* ------------------------------------------------------------------ */

const zelfdeDoel = (doel: InvulDoel, soort: 'dienst' | 'stuk', sleutel: string): boolean =>
  doel.soort === soort && doel.dienst === sleutel

/**
 * Hoeveel uitzendkrachten er vandaag al zijn, dit gat niet meegeteld: de
 * handmatige uit `vandaag` en alles wat het plan al telt (ook de centrale).
 */
function uitzendBezet(b: Bedrijf, plan: DagPlan, doel: InvulDoel): number {
  const v = vandaagVan(b)
  let hand = 0
  for (const [d, k] of Object.entries(v.invulling)) if (k.soort === 'uitzend' && !zelfdeDoel(doel, 'dienst', d)) hand++
  for (const [d, k] of Object.entries(v.stukInvulling)) if (k.soort === 'uitzend' && !zelfdeDoel(doel, 'stuk', d)) hand++
  const stand = standVan(plan, doel)
  const inPlan = plan.uitzend.gebruikt - (stand?.wie.soort === 'uitzend' ? 1 : 0)
  return Math.max(hand, inPlan)
}

/** Nog zoveel uitzendkrachten vandaag (voor de tekst bij de knop). */
export function uitzendOver(b: Bedrijf, plan: DagPlan, doel: InvulDoel): number {
  return Math.max(0, plan.uitzend.max - uitzendBezet(b, plan, doel))
}

/* ------------------------------------------------------------------ */
/* De opties                                                           */
/* ------------------------------------------------------------------ */

export function invulOpties(b: Bedrijf, plan: DagPlan, doel: InvulDoel): InvulOptie[] {
  const r = reken(b, plan, doel)
  if (!r) return []
  const opties: InvulOptie[] = []
  const v = vandaagVan(b)

  if (doel.soort === 'omloop') {
    const bezet = busBezetVanPlan(plan)
    const eigen = (b.bussen ?? [])
      .filter((bus) => busInzetbaar(b, bus))
      .filter((bus) =>
        (bezet[bus.nummer] ?? []).every((x) => x.sleutel === doel.omloop || !overlapt(x, r.gat, PLAN.busMarge))
      )
      .sort(
        (x, y) =>
          Number(y.vorm === r.gat.vorm) - Number(x.vorm === r.gat.vorm) || y.staat - x.staat || x.nummer - y.nummer
      )
    for (const bus of eigen) {
      const keuze: BusKeuze = { soort: 'eigen', nummer: bus.nummer }
      opties.push({
        keuze,
        ...kostenBus(r, keuze, false),
        beschikbaar: true,
        wie: `${bus.nummer} · ${bus.naam}`,
        ...(r.gat.vorm && bus.vorm !== r.gat.vorm ? { let: 'vorm' as const } : {})
      })
    }
    opties.push({ keuze: { soort: 'huur' }, ...kostenBus(r, { soort: 'huur' }, false), beschikbaar: true })
    opties.push({ keuze: { soort: 'liggen' }, ...kostenBus(r, { soort: 'liggen' }, false), beschikbaar: true })
  } else {
    const plek = { po: r.po, pd: r.pd! }
    const blok = blokVoor(plek, doel.soort)
    const huidig = (standVan(plan, doel) as Stand | undefined)?.wie
    const kandidaten = aanHetWerk(b, 'chauffeur')
      .filter((m) => collegaPast(b, plan, r.werk, m.id, blok))
      .map((m) => {
        const keuze: InvulKeuze = { soort: 'collega', id: m.id }
        const extra = overurenErbij(r, m.id, blok)
        const magBus = bevoegd(m.ervaring, r.gat.vorm)
        return {
          optie: {
            keuze,
            kosten: extra.kosten,
            beschikbaar: true,
            wie: m.naam,
            vrijMinuten: Math.max(0, PLAN.dagDoel - extra.voor),
            ...(!magBus ? { let: 'bevoegd' as const } : extra.kosten > 0 ? { let: 'overuren' as const } : {})
          } satisfies InvulOptie,
          magBus,
          voor: extra.voor,
          id: m.id
        }
      })
      // De roosterchauffeur zelf rijdt al (dat is geen invulling), tenzij hij hier al als collega staat.
      .filter((k) => !(huidig?.soort === 'eigen' && huidig.id === k.id))
      .sort(
        (x, y) =>
          Number(y.magBus) - Number(x.magBus) || x.optie.kosten - y.optie.kosten || x.voor - y.voor || x.id - y.id
      )
    for (const k of kandidaten) opties.push(k.optie)

    const over = uitzendBezet(b, plan, doel) < plan.uitzend.max
    opties.push({
      keuze: { soort: 'uitzend' },
      ...kostenChauffeur(r, { soort: 'uitzend' }, false),
      beschikbaar: over,
      ...(over ? {} : { reden: 'vol' as const })
    })
    opties.push({
      keuze: { soort: 'onderaannemer' },
      ...kostenChauffeur(r, { soort: 'onderaannemer' }, false),
      beschikbaar: !r.gat.plots,
      ...(r.gat.plots ? { reden: 'kort' as const } : {})
    })
    opties.push({ keuze: { soort: 'liggen' }, ...kostenChauffeur(r, { soort: 'liggen' }, false), beschikbaar: true })

    // Wat je nu rijdt of al reed, vul je niet meer in.
    const blokkeer: InvulFout | undefined = r.pd?.jij?.nu ? 'bezig' : v.gereden[doel.dienst] ? 'gereden' : undefined
    if (blokkeer) for (const o of opties) Object.assign(o, { beschikbaar: false, reden: blokkeer })
  }

  if (!plan.vandaag || plan.dag !== b.dag) for (const o of opties) Object.assign(o, { beschikbaar: false, reden: 'dag' })

  const standaard = opties
    .filter((o) => o.beschikbaar && o.keuze.soort !== 'liggen')
    .reduce<InvulOptie | undefined>((best, o) => (best === undefined || o.kosten < best.kosten ? o : best), undefined)
  if (standaard) standaard.standaard = true
  return opties
}

/* ------------------------------------------------------------------ */
/* Invullen                                                            */
/* ------------------------------------------------------------------ */

const IS_INVUL = new Set(['collega', 'uitzend', 'onderaannemer', 'liggen'])
const IS_BUS = new Set(['eigen', 'huur', 'liggen'])

export function zetInvulling(
  b: Bedrijf,
  plan: DagPlan,
  doel: InvulDoel,
  keuze: InvulKeuze | BusKeuze | null,
  lopend?: LopendeRit
): { bedrijf: Bedrijf } | { fout: InvulFout } {
  if (!plan.vandaag || plan.dag !== b.dag) return { fout: 'dag' }
  const v = vandaagVan(b)
  const bijLopend = lopend && lopend.dag === plan.dag ? lopend : undefined

  if (doel.soort === 'omloop') {
    const po = zoekPlanOmloop(plan, doel.omloop)
    if (!po) return { fout: nietGevonden(plan, doel.omloop) }
    // De bus van de omloop die je nu rijdt, laat je staan.
    if (bijLopend && ontleedDienst(bijLopend.dienst)?.omloop === doel.omloop) return { fout: 'bezig' }
    const busInvulling = { ...v.busInvulling }
    if (keuze === null) {
      delete busInvulling[doel.omloop]
    } else {
      if (!IS_BUS.has(keuze.soort)) return { fout: 'weg' }
      const k = keuze as BusKeuze
      if (k.soort === 'eigen') {
        const bus = (b.bussen ?? []).find((x) => x.nummer === k.nummer)
        if (!bus || !busInzetbaar(b, bus)) return { fout: 'weg' }
        const o = po.omloop
        const andere = (busBezetVanPlan(plan)[k.nummer] ?? []).filter((x) => x.sleutel !== doel.omloop)
        if (andere.some((x) => overlapt(x, o, PLAN.busMarge))) return { fout: 'bezet' }
        busInvulling[doel.omloop] = { soort: 'eigen', nummer: k.nummer }
      } else {
        busInvulling[doel.omloop] = { soort: k.soort }
      }
    }
    return { bedrijf: { ...b, vandaag: { ...v, busInvulling } } }
  }

  const plek = zoekPlanDienst(plan, doel.dienst)
  if (!plek) return { fout: nietGevonden(plan, doel.dienst) }
  if (doel.soort === 'stuk' && !plek.pd.stuk) return { fout: 'weg' }
  if (bijLopend?.dienst === doel.dienst) return { fout: 'bezig' }
  const veld = doel.soort === 'stuk' ? 'stukInvulling' : 'invulling'
  const lijst = { ...v[veld] }
  if (keuze === null) {
    delete lijst[doel.dienst]
    return { bedrijf: { ...b, vandaag: { ...v, [veld]: lijst } } }
  }
  if (v.gereden[doel.dienst]) return { fout: 'gereden' }
  if (!IS_INVUL.has(keuze.soort)) return { fout: 'weg' }
  const k = keuze as InvulKeuze
  const gat = gatVan(b, plan, doel)
  if (!gat) return { fout: 'weg' }
  switch (k.soort) {
    case 'collega': {
      if (!aanHetWerk(b, 'chauffeur').some((m) => m.id === k.id)) return { fout: 'weg' }
      if (!collegaPast(b, plan, werkVanPlan(plan), k.id, blokVoor(plek, doel.soort))) return { fout: 'bezet' }
      lijst[doel.dienst] = { soort: 'collega', id: k.id }
      break
    }
    case 'uitzend':
      if (uitzendBezet(b, plan, doel) >= plan.uitzend.max) return { fout: 'vol' }
      lijst[doel.dienst] = { soort: 'uitzend' }
      break
    case 'onderaannemer':
      if (gat.plots) return { fout: 'kort' }
      lijst[doel.dienst] = { soort: 'onderaannemer' }
      break
    case 'liggen':
      lijst[doel.dienst] = { soort: 'liggen' }
      break
  }
  return { bedrijf: { ...b, vandaag: { ...v, [veld]: lijst } } }
}

/* ------------------------------------------------------------------ */
/* De centrale                                                         */
/* ------------------------------------------------------------------ */

/**
 * Wat de centrale met een gat doet dat jij niet invulde. Deterministisch: dezelfde
 * invoer geeft dezelfde keuze.
 *
 * - Chauffeur: een vrije collega die past (eerst wie de bus mag rijden, dan wie
 *   het minst werkt, dan het laagste nummer); anders een uitzendkracht met
 *   spoedtoeslag (tenzij Planner af is) zolang er plek is; anders liggen.
 * - Bus: een vrije eigen bus die inzetbaar is en niet overlapt (eerst de goede
 *   vorm, dan de beste staat, dan het laagste nummer); anders een huurbus met
 *   toeslag.
 * - Een gat dat niet plots is (vooraf bekend), gaat naar de onderaannemer:
 *   die heeft tijd genoeg. Bij plotse uitval nooit.
 */
export function kiesAutomatisch(
  b: Bedrijf,
  ctx: CentraleContext,
  gat: Gat
): { keuze: InvulKeuze | BusKeuze; toeslag: boolean } {
  const doel = gat.doel
  const blok: Blok = {
    sleutel: doel.soort === 'omloop' ? doel.omloop : doel.soort === 'stuk' ? stukSleutel(doel.dienst) : doel.dienst,
    van: gat.van,
    tot: gat.tot,
    vanHalte: '',
    totHalte: ''
  }
  if (!gat.plots) return { keuze: { soort: 'onderaannemer' }, toeslag: false }

  if (doel.soort === 'omloop') {
    const bussen = (b.bussen ?? [])
      .filter((x) => ctx.vrijeBussen.includes(x.nummer) && busInzetbaar(b, x))
      .filter((x) => (ctx.busBezet[x.nummer] ?? []).every((y) => y.sleutel === blok.sleutel || !overlapt(y, blok, PLAN.busMarge)))
      .sort(
        (x, y) => Number(y.vorm === gat.vorm) - Number(x.vorm === gat.vorm) || y.staat - x.staat || x.nummer - y.nummer
      )
    if (bussen[0]) return { keuze: { soort: 'eigen', nummer: bussen[0].nummer }, toeslag: false }
    return { keuze: { soort: 'huur' }, toeslag: toeslagGeldt(b) }
  }

  const mensen = (b.personeel ?? [])
    .filter((m) => m.rol === 'chauffeur' && ctx.vrijeChauffeurs.includes(m.id))
    .filter((m) => {
      const t = toets(ctx.werk[m.id] ?? [], blok)
      return !t.dubbel && !t.teLang
    })
    .map((m) => ({ m, mag: bevoegd(m.ervaring, gat.vorm), minuten: werkMinuten(ctx.werk[m.id] ?? []) }))
    .sort((x, y) => Number(y.mag) - Number(x.mag) || x.minuten - y.minuten || x.m.id - y.m.id)
  if (mensen[0]) return { keuze: { soort: 'collega', id: mensen[0].m.id }, toeslag: false }
  if (ctx.uitzend.gebruikt < ctx.uitzend.max) return { keuze: { soort: 'uitzend' }, toeslag: toeslagGeldt(b) }
  return { keuze: { soort: 'liggen' }, toeslag: false }
}

/* ------------------------------------------------------------------ */
/* De rijen van het paneel                                             */
/* ------------------------------------------------------------------ */

const DIENST_REDEN = new Set(['ziek', 'telaat', 'afwezig'])
const BUS_REDEN = new Set(['pech', 'werkplaats'])

/**
 * De open diensten van vandaag: plotse uitval, wat vooraf bekend afwezig is,
 * en alles wat jij of de centrale al invulde. Plots eerst, dan op tijd. Wat
 * je nu zelf rijdt of al helemaal reed, staat er niet in.
 *
 * `uitbesteed` is de rest: diensten zonder eigen chauffeur die gewoon naar de
 * onderaannemer gaan (het paneel toont ze ingeklapt).
 */
export function openRijen(
  b: Bedrijf,
  plan: DagPlan
): { rijen: OpenRij[]; uitbesteed: Array<{ omloop: OmloopVanDag; dienst: DienstVanDag; kosten: number }>; uitbesteedKosten: number } {
  const rijen: OpenRij[] = []
  const uitbesteed: Array<{ omloop: OmloopVanDag; dienst: DienstVanDag; kosten: number }> = []
  const uitval = vandaagVan(b).uitval
  for (const k of plan.kaarten) {
    for (const po of k.omlopen) {
      const bus = po.bus
      if ((bus.reden && BUS_REDEN.has(bus.reden)) || bus.bron === 'hand' || bus.bron === 'centrale') {
        const doel: InvulDoel = { soort: 'omloop', omloop: po.omloop.sleutel }
        const gat = gatVan(b, plan, doel)
        if (gat) {
          rijen.push({
            doel,
            gat,
            omloop: po.omloop,
            reden: bus.reden === 'pech' || bus.reden === 'werkplaats' ? bus.reden : undefined,
            wie: bus.wie,
            bron: bus.bron,
            toeslag: bus.toeslag,
            kosten: huidigeKosten(b, plan, doel),
            bus: po.roosterBus
          })
        }
      }
      for (const pd of po.diensten) {
        // Wat je nu zelf rijdt, en de diensten van een omloop die zonder bus uitvalt (dat is de busrij).
        if (pd.jij?.nu || bus.wie.soort === 'liggen') continue
        const d = pd.dienst
        const laat = uitval.find((u) => u.soort === 'telaat' && u.medewerker === pd.roosterId)
        if (pd.stuk) {
          const doel: InvulDoel = { soort: 'stuk', dienst: d.sleutel }
          const gat = gatVan(b, plan, doel)
          if (gat && (gat.minuten > 0 || gat.rituren > 0)) {
            rijen.push({
              doel,
              gat,
              omloop: po.omloop,
              dienst: d,
              reden: 'telaat',
              laatMinuten: laat?.minuten,
              wie: pd.stuk.stand.wie,
              bron: pd.stuk.stand.bron,
              toeslag: pd.stuk.stand.toeslag,
              kosten: huidigeKosten(b, plan, doel)
            })
          }
        }
        const s = pd.stand
        const reden = s.reden && DIENST_REDEN.has(s.reden) ? (s.reden as OpenRij['reden']) : undefined
        const open = pd.plots || reden !== undefined || s.bron === 'hand' || s.bron === 'centrale'
        const doel: InvulDoel = { soort: 'dienst', dienst: d.sleutel }
        if (open) {
          const gat = gatVan(b, plan, doel)
          if (gat && (gat.minuten > 0 || gat.rituren > 0)) {
            rijen.push({
              doel,
              gat,
              omloop: po.omloop,
              dienst: d,
              reden,
              ...(reden === 'telaat' ? { laatMinuten: laat?.minuten } : {}),
              wie: s.wie,
              bron: s.bron,
              toeslag: s.toeslag,
              kosten: huidigeKosten(b, plan, doel)
            })
          }
        } else if (s.wie.soort === 'onderaannemer' && !pd.jij) {
          uitbesteed.push({ omloop: po.omloop, dienst: d, kosten: s.kosten })
        }
      }
    }
  }
  rijen.sort(
    (x, y) =>
      Number(y.gat.plots) - Number(x.gat.plots) ||
      x.gat.van - y.gat.van ||
      sleutelVan(x.doel).localeCompare(sleutelVan(y.doel))
  )
  return { rijen, uitbesteed, uitbesteedKosten: uitbesteed.reduce((s, u) => s + u.kosten, 0) }
}

function sleutelVan(doel: InvulDoel): string {
  return doel.soort === 'omloop' ? `${doel.omloop}#bus` : doel.soort === 'stuk' ? stukSleutel(doel.dienst) : doel.dienst
}
