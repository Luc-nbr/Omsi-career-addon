import { bedrijfsfactoren, geredenVanRit, type Bedrijf } from './bedrijf'
import { boete, chauffeurKosten, vergoeding } from './plantarief'
import type { DagPlan, DienstSleutel, DienstVanDag, Gereden, LopendeRit, PlanDienst, PlanOmloop, PlanRit, Stand } from './planTypen'
import type { Duty } from './types'

/*
 * Zelf rijden vanuit het bedrijf: een dienst uit het plan aannemen en rijden
 * (ontwerp busbedrijf-planning §7).
 *
 * WAT ZELF RIJDEN BETEKENT
 * Je neemt een stuk van een dienst over: van een eerste tot een laatste rit.
 * Er wordt niets in de invulling geschreven. Wat je rijdt komt bij het
 * afronden in `vandaag.gereden`; de rest van de dienst valt terug op wat hij
 * zonder jou was, en een roosterchauffeur blijft gewoon staan. Daarom rekent
 * deze module alleen uit wat dat stuk het bedrijf scheelt: de rest rijdt
 * dezelfde uitzendkracht of onderaannemer, maar korter.
 */

export interface RitVoorstel {
  dienst: DienstSleutel
  reden: 'open' | 'stuk' | 'uitbesteed'
  bespaart: number
  van: number
  tot: number
  lijn: string
  omloop: string
  /** Waarom de dienst open is (alleen bij 'open'): wat de roosterchauffeur heeft. */
  waarom?: string
}

/** Factoren en reputatie: alles wat een bedrag van een stand nodig heeft. */
interface Rekenbasis {
  f: { vergoeding: number; inhuur: number }
  reputatie: number
}

/**
 * Wat een stuk dienst het bedrijf kost bij deze bezetting: een uitzendkracht
 * of onderaannemer per werkuur, laten liggen de gemiste vergoeding plus de
 * boete. Een eigen chauffeur of collega kost niets extra (zijn loon loopt
 * toch). Hetzelfde voor "nu" en "na jou", zodat het verschil eerlijk is.
 */
function kostVan(wie: Stand['wie']['soort'], minuten: number, rituren: number, toeslag: boolean | undefined, r: Rekenbasis): number {
  if (minuten <= 0 && rituren <= 0) return 0
  if (wie === 'liggen') return vergoeding(rituren, r.reputatie, r.f) + boete(rituren)
  return chauffeurKosten(wie, Math.max(0, minuten), r.f, toeslag)
}

/** Een aaneengesloten stuk van een dienst met één bezetting. */
interface Stuk {
  van: number
  tot: number
  minuten: number
  rituren: number
  stand: Stand
}

/**
 * De stukken van een geplande dienst: bij te laat eerst het te-laat-stuk, dan
 * de rest met de gewone stand; anders de hele dienst in één stuk.
 */
function stukkenVan(pd: PlanDienst): Stuk[] {
  const d = pd.dienst
  if (!pd.stuk) return [{ van: d.van, tot: d.tot, minuten: d.minuten, rituren: d.rituren, stand: pd.stand }]
  return [
    { van: pd.stuk.van, tot: pd.stuk.tot, minuten: pd.stuk.minuten, rituren: pd.stuk.rituren, stand: pd.stuk.stand },
    {
      van: pd.stuk.tot,
      tot: d.tot,
      minuten: Math.max(0, d.minuten - pd.stuk.minuten),
      rituren: Math.max(0, d.rituren - pd.stuk.rituren),
      stand: pd.stand
    }
  ]
}

/** De rituren van de ritten die tellen en in [van, tot) vertrekken. */
function rituurIn(ritten: PlanRit[], van: number, tot: number): number {
  return ritten
    .filter((r) => r.telt && r.vertrek >= van && r.vertrek < tot)
    .reduce((s, r) => s + (r.aankomst - r.vertrek) / 60, 0)
}

/** Een dienst in het plan terugvinden, met zijn omloop. */
export function zoekInPlan(plan: DagPlan, dienst: DienstSleutel): { po: PlanOmloop; pd: PlanDienst } | undefined {
  for (const k of plan.kaarten) {
    for (const po of k.omlopen) {
      const pd = po.diensten.find((x) => x.dienst.sleutel === dienst)
      if (pd) return { po, pd }
    }
  }
  return undefined
}

/** De naam van een dienst zoals de speler hem ziet: omloop-deel, bijvoorbeeld 55103-1. */
export function dienstNaam(omloopNr: string, deel: number): string {
  return `${omloopNr}-${deel}`
}

/**
 * Het werk dat bij jouw venster hoort: het venster zelf, plus de korte ritten
 * (LEE, Überliegeplatz) aan het begin of eind van de dienst als jouw venster
 * daar begint of eindigt. Die rijd je mee: niemand huurt een chauffeur voor
 * tien minuten leeg naar de remise.
 */
function werkVan(alle: PlanRit[], venster: { van: number; tot: number; ritten: PlanRit[] }): { van: number; tot: number; a: number; z: number } {
  let a = alle.findIndex((r) => r.sleutel === venster.ritten[0]?.sleutel)
  let z = alle.findIndex((r) => r.sleutel === venster.ritten[venster.ritten.length - 1]?.sleutel)
  if (a < 0 || z < a) return { van: venster.van, tot: venster.tot, a: -1, z: -1 }
  if (alle.slice(0, a).every((r) => !r.telt)) a = 0
  if (alle.slice(z + 1).every((r) => !r.telt)) z = alle.length - 1
  const stuk = alle.slice(a, z + 1)
  return { van: stuk[0].vertrek, tot: Math.max(...stuk.map((r) => r.aankomst)), a, z }
}

/**
 * Wat er van de dienst overblijft als jij dit venster rijdt, als aaneengesloten
 * stukken (bijvoorbeeld 05:00–05:30 en 09:12–14:30). Leeg als je alle ritten
 * rijdt die tellen; korte ritten aan de randen rijd je mee (`werkVan`).
 */
export function restVan(d: DienstVanDag, venster: { van: number; tot: number; ritten: PlanRit[] }): Array<{ van: number; tot: number }> {
  const w = werkVan(d.ritten, venster)
  const binnen = new Set(venster.ritten.map((r) => r.sleutel))
  const stukken: Array<{ van: number; tot: number }> = []
  let huidig: { van: number; tot: number } | undefined
  d.ritten.forEach((r, i) => {
    const mijn = w.a >= 0 ? i >= w.a && i <= w.z : binnen.has(r.sleutel)
    if (mijn) {
      if (huidig) stukken.push(huidig)
      huidig = undefined
      return
    }
    huidig = huidig ? { van: huidig.van, tot: Math.max(huidig.tot, r.aankomst) } : { van: r.vertrek, tot: r.aankomst }
  })
  if (huidig) stukken.push(huidig)
  return stukken
}

/**
 * Wat het bedrijf scheelt als jij dit venster van de dienst rijdt, en wie de
 * rest rijdt voor hoeveel.
 *
 * Per stuk (het te-laat-stuk en de rest, of de hele dienst): wat het nu kost,
 * min wat het kost als de bezetting alleen nog rijdt wat buiten jouw werk
 * valt. Een venster binnen het te-laat-stuk telt zo tegen het stuk. Is de
 * bezetting een eigen chauffeur of collega, dan scheelt het niets.
 */
export function besparingVanRit(
  b: Bedrijf,
  plan: DagPlan,
  dienst: DienstSleutel,
  venster: { van: number; tot: number; ritten: PlanRit[] }
): { bespaart: number; rest?: Stand; restKosten: number } {
  const z = zoekInPlan(plan, dienst)
  if (!z) return { bespaart: 0, restKosten: 0 }
  const r: Rekenbasis = { f: bedrijfsfactoren(b), reputatie: b.reputatie }
  const werk = werkVan(z.pd.dienst.ritten, venster)
  // Rijd je alles wat telt, dan blijft er niets over om iemand voor te betalen.
  const heel = restVan(z.pd.dienst, venster).length === 0
  let bespaart = 0
  let restKosten = 0
  let rest: { stand: Stand; minuten: number } | undefined
  for (const s of stukkenVan(z.pd)) {
    const overlap = heel ? s.tot - s.van : Math.max(0, Math.min(s.tot, werk.tot) - Math.max(s.van, werk.van))
    const span = s.tot - s.van
    // De werktijd van het stuk naar rato van de overlap; de rituren uit de ritten zelf.
    const mijnMinuten = span > 0 ? (s.minuten * overlap) / span : 0
    const mijnRituren = Math.min(s.rituren, rituurIn(venster.ritten, s.van, s.tot))
    const restMinuten = heel ? 0 : Math.max(0, s.minuten - mijnMinuten)
    const restRituren = heel ? 0 : Math.max(0, s.rituren - mijnRituren)
    const nu = kostVan(s.stand.wie.soort, s.minuten, s.rituren, s.stand.toeslag, r)
    const na = kostVan(s.stand.wie.soort, restMinuten, restRituren, s.stand.toeslag, r)
    bespaart += Math.max(0, nu - na)
    restKosten += na
    // De rest die het meest werk is, is wat de speler te zien krijgt.
    if (restMinuten > 0.5 && (!rest || restMinuten > rest.minuten)) {
      rest = { stand: { ...s.stand, kosten: na }, minuten: restMinuten }
    }
  }
  if (heel) rest = undefined
  return { bespaart: Math.round(bespaart), ...(rest ? { rest: rest.stand } : {}), restKosten: Math.round(restKosten) }
}

/**
 * Wat er vandaag te rijden valt dat geld bespaart, beste eerst: plots open
 * diensten, dan korte te-laat-stukken ("kort klusje"), dan uitbestede diensten
 * op besparing. Overgeslagen: wat je al reed of nu rijdt, en een omloop
 * zonder bus (die moet eerst een bus krijgen).
 */
export function voorstellen(b: Bedrijf, plan: DagPlan, max = 3): RitVoorstel[] {
  if (!plan.vandaag) return []
  const gereden = b.vandaag?.dag === b.dag ? b.vandaag.gereden : {}
  const uit: RitVoorstel[] = []
  for (const k of plan.kaarten) {
    for (const po of k.omlopen) {
      if (po.bus.wie.soort === 'liggen') continue
      for (const pd of po.diensten) {
        const d = pd.dienst
        if (pd.jij || gereden[d.sleutel]) continue
        const basis = { dienst: d.sleutel, lijn: po.omloop.lijn, omloop: po.omloop.tourNumber }
        const heel = rijvenster(d)
        if (!heel) continue
        if (pd.stuk && !rijdtZelf(pd.stuk.stand)) {
          // Alleen de ritten in het te-laat-stuk: dat is het korte klusje.
          const inStuk = d.ritten.filter((x) => x.telt && x.vertrek >= pd.stuk!.van && x.vertrek < pd.stuk!.tot)
          const v = inStuk.length ? rijvenster(d, inStuk[0].sleutel, inStuk[inStuk.length - 1].sleutel) : undefined
          const bespaart = v ? besparingVanRit(b, plan, d.sleutel, v).bespaart : 0
          if (v && bespaart > 0) uit.push({ ...basis, reden: 'stuk', bespaart, van: v.van, tot: v.tot })
          continue
        }
        if (rijdtZelf(pd.stand)) continue
        const bespaart = besparingVanRit(b, plan, d.sleutel, heel).bespaart
        if (bespaart <= 0) continue
        uit.push({
          ...basis,
          reden: pd.plots ? 'open' : 'uitbesteed',
          bespaart,
          van: heel.van,
          tot: heel.tot,
          ...(pd.plots && pd.stand.reden ? { waarom: pd.stand.reden } : {})
        })
      }
    }
  }
  const volgorde = { open: 0, stuk: 1, uitbesteed: 2 } as const
  return uit
    .sort((a, c) =>
      volgorde[a.reden] - volgorde[c.reden] ||
      (a.reden === 'stuk' ? a.tot - a.van - (c.tot - c.van) : 0) ||
      c.bespaart - a.bespaart ||
      a.van - c.van
    )
    .slice(0, Math.max(0, max))
}

/** Rijdt er al een eigen chauffeur of collega? Dan scheelt zelf rijden niets. */
function rijdtZelf(s: Stand): boolean {
  return s.wie.soort === 'eigen' || s.wie.soort === 'collega'
}

/**
 * Het stuk van een dienst dat je rijdt: van de eerste tot de laatste gekozen
 * rit (standaard de hele dienst). De korte ritten ertussen horen erbij --
 * die rijd je ook -- maar alleen de ritten die tellen gaan naar OMSI
 * (`telt`, de sleutels die `dutyVanRitten` zoekt). Leeg als de keuze niet klopt.
 */
export function rijvenster(
  d: DienstVanDag,
  vanRit?: string,
  totRit?: string
): { van: number; tot: number; ritten: PlanRit[]; telt: string[] } | undefined {
  const tellend = d.ritten.filter((r) => r.telt)
  const eerste = vanRit ?? tellend[0]?.sleutel
  const laatste = totRit ?? tellend[tellend.length - 1]?.sleutel
  const a = d.ritten.findIndex((r) => r.sleutel === eerste && r.telt)
  const z = d.ritten.findIndex((r) => r.sleutel === laatste && r.telt)
  if (a < 0 || z < 0 || z < a) return undefined
  const ritten = d.ritten.slice(a, z + 1)
  return {
    van: ritten[0].vertrek,
    tot: Math.max(...ritten.map((r) => r.aankomst)),
    ritten,
    telt: ritten.filter((r) => r.telt).map((r) => r.sleutel)
  }
}

/**
 * Wat je van een bedrijfsrit gereden hebt, naar rato van de gehaalde haltes
 * (zoals het loon): zonder telling telt hij voor vol. De rituren komen alleen
 * uit de ritten op lijnen van het bedrijf (`telt`).
 */
export function geredenVan(
  duty: Duty,
  rit: LopendeRit,
  stopsDone: number | undefined,
  telt: (lineFile: string) => boolean
): Gereden {
  // De rekensom staat in bedrijf.ts (`geredenVanRit`), want boekEigenDienst gebruikt hem en mag dit bestand niet laden.
  return geredenVanRit(duty, rit, stopsDone, telt)
}
