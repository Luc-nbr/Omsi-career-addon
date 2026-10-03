import {
  bedrijfsfactoren,
  heeftConcessie,
  isInzetbaar,
  lijnnaam,
  opleidingKlaar,
  type Bedrijf,
  type Busvorm,
  type Medewerker
} from './bedrijf'
import { kiesAutomatisch, type CentraleContext, type Gat } from './invulling'
import { bevoegd, blokVan, overlapt, PLAN, toets, type Blok } from './planregels'
import {
  boete,
  busKosten,
  chauffeurKosten,
  overurenKosten,
  reputatieVerlies,
  TARIEF,
  terugvalVanConcessie,
  uitzendMax,
  vergoeding
} from './plantarief'
import type {
  ConcessieCijfers,
  Conflict,
  ConflictSoort,
  Dagrooster,
  DagPlan,
  KaartDag,
  DienstSleutel,
  DienstVanDag,
  InvulDoel,
  LopendeRit,
  OmloopSleutel,
  OmloopVanDag,
  PlanCijfers,
  PlanDienst,
  PlanOmloop,
  RoosterActie,
  RoosterFout,
  Stand,
  Telling,
  Vandaag,
  VastRooster,
  Werkdag
} from './planTypen'

/*
 * Het rooster: welke bus en chauffeur wat rijden, en wat de dag kost
 * (ontwerp busbedrijf-planning §4.2).
 *
 * Het VASTE rooster (`Bedrijf.rooster`) zegt per omloop welke eigen bus hem
 * rijdt en per dienst welke eigen chauffeur; het geldt per dagmasker, dus een
 * indeling op dinsdag geldt voor alle dagen ma–vr. Het PLAN van een dag
 * (`dagplan`) legt daar de dag zelf overheen: wie er ziek is of te laat komt,
 * welke bus niet start, wat de speler met de hand invulde, wat hij zelf reed,
 * en wat de centrale regelt voor de gaten die overblijven. Wat leeg blijft,
 * besteedt het bedrijf uit aan de onderaannemer.
 *
 * `afrekening` maakt van het plan de cijfers die `sluitDagAf` boekt. Wat de
 * speler in de Planning ziet, is dus precies wat er afgerekend wordt.
 *
 * Alles hier is puur en deterministisch: dezelfde invoer geeft hetzelfde plan,
 * in het venster en in main.
 */

/*
 * OMWEG: de sleutelhulpjes hieronder staan ook in bedrijfsplan.ts, maar dat
 * bestand trekt calendar.ts mee (node:path en fs), en dit bestand draait ook
 * in het venster (useDagplan, Planning). Tot de integratie de pure hulpjes
 * van bedrijfsplan.ts in een eigen bestand zet, staan ze hier nog een keer,
 * letterlijk gelijk.
 */
export function ontleedOmloop(s: string): { mapFolder: string; lineFile: string; days: number; tourNumber: string } | undefined {
  const a = s.indexOf('|')
  const b = a < 0 ? -1 : s.indexOf('|', a + 1)
  const c = b < 0 ? -1 : s.indexOf('|', b + 1)
  if (c < 0) return undefined
  const days = Number(s.slice(b + 1, c))
  if (!Number.isInteger(days)) return undefined
  return { mapFolder: s.slice(0, a), lineFile: s.slice(a + 1, b), days, tourNumber: s.slice(c + 1) }
}

export function ontleedDienst(s: string): { omloop: OmloopSleutel; deel: number } | undefined {
  const at = s.lastIndexOf('|')
  if (at < 0) return undefined
  const deel = Number(s.slice(at + 1))
  const omloop = s.slice(0, at)
  if (!Number.isInteger(deel) || deel < 1 || !ontleedOmloop(omloop)) return undefined
  return { omloop, deel }
}

function zoekOmloop(r: Dagrooster, s: OmloopSleutel): { kaart: KaartDag; omloop: OmloopVanDag } | undefined {
  for (const kaart of r.kaarten) {
    const omloop = kaart.omlopen.find((o) => o.sleutel === s)
    if (omloop) return { kaart, omloop }
  }
  return undefined
}

function zoekDienst(r: Dagrooster, s: DienstSleutel): { kaart: KaartDag; omloop: OmloopVanDag; dienst: DienstVanDag } | undefined {
  const o = ontleedDienst(s)
  const z = o && zoekOmloop(r, o.omloop)
  const dienst = z?.omloop.diensten.find((d) => d.sleutel === s)
  return z && dienst ? { ...z, dienst } : undefined
}

const DAGNAMEN = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'] as const

/** Waarvoor een dagmasker geldt (gelijk aan `maskerDagen` in bedrijfsplan.ts). */
export function maskerDagen(days: number): {
  dagen: Array<(typeof DAGNAMEN)[number]>
  feestdag: boolean
  periode?: 'school' | 'break'
} {
  const school = (days & (1 << 8)) !== 0
  const vakantie = (days & (1 << 9)) !== 0
  return {
    dagen: DAGNAMEN.filter((_, i) => (days & (1 << i)) !== 0),
    feestdag: (days & (1 << 7)) !== 0,
    ...(school && !vakantie ? { periode: 'school' as const } : vakantie && !school ? { periode: 'break' as const } : {})
  }
}

/** De planning staat aan: main rekent af op het plan en migreert oude bedrijven (deel A). */
export const PLAN_ACTIEF = true

const LEGE_TELLING: Telling = {
  omlopen: 0,
  eigenBus: 0,
  huurbus: 0,
  diensten: 0,
  eigen: 0,
  collega: 0,
  jij: 0,
  uitzend: 0,
  uitbesteed: 0,
  open: 0,
  uitgevallen: 0,
  rituren: 0,
  uitgevallenRituren: 0,
  werkuren: 0
}

const leegRooster = (b: Bedrijf): VastRooster => ({ bussen: {}, chauffeurs: {}, gemaakt: b.dag })
const leegVandaag = (dag: number): Vandaag => ({
  dag,
  uitval: [],
  invulling: {},
  stukInvulling: {},
  busInvulling: {},
  gereden: {}
})

const opVolgorde = <T extends { van: number; sleutel: string }>(a: T, b: T): number =>
  a.van - b.van || (a.sleutel < b.sleutel ? -1 : a.sleutel > b.sleutel ? 1 : 0)

/** Is deze medewerker er op deze dag: niet ziek en niet op cursus. */
export function aanwezig(m: Medewerker, dag: number): boolean {
  return (m.ziekTot === undefined || m.ziekTot < dag) && (m.cursusTot === undefined || m.cursusTot < dag)
}

/** De omlopen van een dag die bij een concessie horen, op (van, sleutel). Kaarten met een fout tellen niet. */
export function omlopenVanPlan(b: Bedrijf, r: Dagrooster | undefined): OmloopVanDag[] {
  return (r?.kaarten ?? [])
    .filter((k) => !k.fout)
    .flatMap((k) => k.omlopen)
    .filter((o) => heeftConcessie(b, o.mapFolder, o.lineFile))
    .sort(opVolgorde)
}

/** Rituren van de telbare ritten die in [van, tot) vertrekken. */
function rituurIn(d: DienstVanDag, van: number, tot: number): number {
  return d.ritten
    .filter((r) => r.telt && r.vertrek >= van && r.vertrek < tot)
    .reduce((s, r) => s + (r.aankomst - r.vertrek) / 60, 0)
}

/** Aantal telbare ritten dat in [van, tot) vertrekt. */
function rittenIn(d: DienstVanDag, van: number, tot: number): number {
  return d.ritten.filter((r) => r.telt && r.vertrek >= van && r.vertrek < tot).length
}

/** Een deel van een dienst: het te-laat-stuk of de rest, met wat jij reed er al af. */
export interface DienstDeel {
  soort: 'stuk' | 'hoofd'
  stand: Stand
  van: number
  tot: number
  /** Wat er na jouw rit nog over is om te betalen of te laten liggen. */
  minuten: number
  rituren: number
  /** Wat jij in dit deel reed. */
  jij: { minuten: number; rituren: number }
}

/**
 * De delen van een dienst. Wat jij reed gaat eerst van het stuk af als je
 * venster erin valt, anders van de dienst (ontwerp §4.2, stap 5). Een eigen
 * chauffeur of collega blijft gewoon in dienst als jij een stuk rijdt: daar
 * gaat niets af, dus ook geen besparing (en geen minder overuren).
 */
export function delenVan(pd: PlanDienst): DienstDeel[] {
  const d = pd.dienst
  const ger = pd.jij?.gereden
  let restMin = ger?.werkMinuten ?? 0
  let restRit = ger?.rituren ?? 0
  const blijft = (s: Stand): boolean => s.wie.soort === 'eigen' || s.wie.soort === 'collega'
  const uit: DienstDeel[] = []
  if (pd.stuk) {
    const s = pd.stuk
    const inStuk = ger !== undefined && ger.van < s.tot
    const afMin = inStuk ? Math.min(s.minuten, restMin) : 0
    const afRit = inStuk ? Math.min(s.rituren, restRit) : 0
    restMin -= afMin
    restRit -= afRit
    uit.push({
      soort: 'stuk',
      stand: s.stand,
      van: s.van,
      tot: s.tot,
      minuten: blijft(s.stand) ? s.minuten : Math.max(0, s.minuten - afMin),
      rituren: blijft(s.stand) ? s.rituren : Math.max(0, s.rituren - afRit),
      jij: { minuten: afMin, rituren: afRit }
    })
  }
  const van = pd.stuk ? pd.stuk.tot : d.van
  const min = d.tot - van
  const rit = pd.stuk ? d.rituren - pd.stuk.rituren : d.rituren
  const afMin = Math.min(min, restMin)
  const afRit = Math.min(rit, restRit)
  uit.push({
    soort: 'hoofd',
    stand: pd.stand,
    van,
    tot: d.tot,
    minuten: blijft(pd.stand) ? min : Math.max(0, min - afMin),
    rituren: blijft(pd.stand) ? Math.max(0, rit) : Math.max(0, rit - afRit),
    jij: { minuten: afMin, rituren: afRit }
  })
  return uit
}

const omloopBlok = (o: OmloopVanDag): Blok => ({ sleutel: o.sleutel, van: o.van, tot: o.tot, vanHalte: '', totHalte: '' })
const zonderStuk = (s: string): string => s.replace(/#stuk$/, '')

/* ------------------------------------------------------------------ */
/* Het plan van een dag                                               */
/* ------------------------------------------------------------------ */

/** Werk van een stuk van een dienst: de hele dienst, of het deel na (of het stuk voor) een te-laat-melding. */
interface Deel {
  van: number
  tot: number
  minuten: number
  rituren: number
}

interface Gaatje {
  doel: InvulDoel
  van: number
  tot: number
  minuten: number
  rituren: number
  vorm?: Busvorm
  /** Waar de uitkomst heen moet. */
  zet: (stand: Stand) => void
  blok: Blok
}

export function dagplan(b: Bedrijf, dagen: Dagrooster[], dag: number, lopend?: LopendeRit): DagPlan {
  const f = bedrijfsfactoren(b)
  const isVandaag = dag === b.dag
  const v = isVandaag && b.vandaag?.dag === dag ? b.vandaag : leegVandaag(dag)
  const rooster = b.rooster ?? leegRooster(b)
  const uitval = isVandaag ? v.uitval : []
  const dagrooster = dagen.find((d) => d.dag === dag)
  const bussen = new Map((b.bussen ?? []).map((x) => [x.nummer, x]))
  const mensen = new Map((b.personeel ?? []).map((m) => [m.id, m]))
  const pech = new Set(uitval.filter((u) => u.soort === 'pech' && u.bus !== undefined).map((u) => u.bus!))
  const telaat = new Map(
    uitval.filter((u) => u.soort === 'telaat' && u.medewerker !== undefined).map((u) => [u.medewerker!, u.minuten ?? 0])
  )
  const ziekVandaag = (m: Medewerker): boolean =>
    isVandaag && (m.ziekSinds === dag || uitval.some((u) => u.soort === 'ziek' && u.medewerker === m.id))

  /* ---- de omlopen van vandaag, per kaart ---- */
  const kaarten: DagPlan['kaarten'] = []
  const alle: PlanOmloop[] = []
  for (const kaart of dagrooster?.kaarten ?? []) {
    if (kaart.fout) continue
    const omlopen: PlanOmloop[] = kaart.omlopen
      .filter((o) => heeftConcessie(b, o.mapFolder, o.lineFile))
      .sort(opVolgorde)
      .map((omloop) => ({
        omloop,
        bus: { wie: { soort: 'onderaannemer' }, bron: 'standaard', kosten: 0 },
        ...(rooster.bussen[omloop.sleutel] !== undefined ? { roosterBus: rooster.bussen[omloop.sleutel] } : {}),
        diensten: [],
        conflicten: []
      }))
    kaarten.push({ kaart, omlopen })
    alle.push(...omlopen)
  }
  const terugval: DagPlan['terugval'] = []
  for (const c of b.concessies) {
    const kaart = dagrooster?.kaarten.find((k) => k.mapFolder === c.mapFolder)
    // Een lijn zonder omlopen vandaag (bijvoorbeeld alleen doordeweeks) is geen terugval: die levert vandaag niets op.
    if (!kaart || kaart.fout) terugval.push({ mapFolder: c.mapFolder, lineFile: c.lineFile })
  }
  const opTijd = [...alle].sort((a, c) => opVolgorde(a.omloop, c.omloop))

  /* ---- 1. de bus per omloop ---- */
  const busBlokken = new Map<number, Blok[]>()
  const busVrij = (nr: number, o: OmloopVanDag): string | undefined =>
    (busBlokken.get(nr) ?? []).find((x) => overlapt(x, o, PLAN.busMarge))?.sleutel
  const zetBus = (nr: number, o: OmloopVanDag): void => {
    busBlokken.set(nr, [...(busBlokken.get(nr) ?? []), omloopBlok(o)])
  }
  const busGaten: PlanOmloop[] = []
  for (const po of opTijd) {
    const o = po.omloop
    const hand = v.busInvulling[o.sleutel]
    let klaar = false
    if (hand) {
      if (hand.soort === 'eigen') {
        const bus = bussen.get(hand.nummer)
        const dubbel = bus ? busVrij(bus.nummer, o) : undefined
        const soort: ConflictSoort | undefined = !bus
          ? 'bus-weg'
          : !isInzetbaar(bus, dag) || pech.has(bus.nummer)
            ? 'bus-werkplaats'
            : dubbel
              ? 'bus-dubbel'
              : undefined
        if (soort) {
          po.conflicten.push({
            soort,
            ernst: soort === 'bus-werkplaats' ? 'let' : 'fout',
            omloop: o.sleutel,
            bus: hand.nummer,
            ...(dubbel ? { andere: dubbel } : {})
          })
        } else {
          po.bus = { wie: { soort: 'eigen', nummer: hand.nummer }, bron: 'hand', kosten: 0 }
          zetBus(hand.nummer, o)
          klaar = true
        }
      } else {
        po.bus = { wie: { soort: hand.soort }, bron: 'hand', kosten: 0 }
        klaar = true
      }
    }
    if (!klaar && po.roosterBus !== undefined) {
      const nr = po.roosterBus
      const bus = bussen.get(nr)
      const dubbel = bus ? busVrij(nr, o) : undefined
      if (!bus) {
        po.conflicten.push({ soort: 'bus-weg', ernst: 'fout', omloop: o.sleutel, bus: nr })
        po.bus = { wie: { soort: 'onderaannemer' }, bron: 'standaard', reden: 'weg', kosten: 0 }
      } else if (pech.has(nr)) {
        // Een plots gat: de centrale regelt een andere bus (hieronder).
        po.bus = { wie: { soort: 'liggen' }, bron: 'rooster', reden: 'pech', kosten: 0 }
        busGaten.push(po)
      } else if (!isInzetbaar(bus, dag)) {
        po.conflicten.push({ soort: 'bus-werkplaats', ernst: 'let', omloop: o.sleutel, bus: nr })
        po.bus = { wie: { soort: 'onderaannemer' }, bron: 'standaard', reden: 'werkplaats', kosten: 0 }
      } else if (dubbel) {
        po.conflicten.push({ soort: 'bus-dubbel', ernst: 'fout', omloop: o.sleutel, bus: nr, andere: dubbel })
        po.bus = { wie: { soort: 'onderaannemer' }, bron: 'standaard', reden: 'dubbel', kosten: 0 }
      } else {
        po.bus = { wie: { soort: 'eigen', nummer: nr }, bron: 'rooster', kosten: 0 }
        zetBus(nr, o)
        if (o.vorm && o.vorm !== bus.vorm) {
          po.conflicten.push({ soort: 'bus-vorm', ernst: 'let', omloop: o.sleutel, bus: nr })
        }
      }
      klaar = true
    }
    if (!klaar) po.bus = { wie: { soort: 'onderaannemer' }, bron: 'standaard', kosten: 0 }
  }

  /* ---- de centrale voor de bussen (alleen vandaag) ---- */
  const vrijeBussen = (b.bussen ?? []).filter((x) => isInzetbaar(x, dag) && !pech.has(x.nummer)).map((x) => x.nummer)
  const uitzendGebruik = { gebruikt: 0, max: uitzendMax(b) }
  // Handmatige uitzendkrachten tellen eerst mee.
  if (isVandaag) {
    for (const k of [...Object.values(v.invulling), ...Object.values(v.stukInvulling)]) {
      if (k.soort === 'uitzend') uitzendGebruik.gebruikt += 1
    }
  }
  const context = (werk: Map<number, Blok[]>, chauffeurs: number[]): CentraleContext => ({
    vrijeChauffeurs: chauffeurs,
    vrijeBussen,
    werk: Object.fromEntries(werk),
    busBezet: Object.fromEntries(busBlokken),
    uitzend: { ...uitzendGebruik }
  })
  for (const po of busGaten) {
    const o = po.omloop
    if (!isVandaag) {
      po.bus = { ...po.bus, wie: { soort: 'onderaannemer' }, bron: 'standaard' }
      continue
    }
    const gat: Gat = {
      doel: { soort: 'omloop', omloop: o.sleutel },
      van: o.van,
      tot: o.tot,
      minuten: o.minuten,
      rituren: o.rituren,
      plots: true,
      ...(o.vorm ? { vorm: o.vorm } : {})
    }
    const keuze = kiesAutomatisch(b, context(new Map(), []), gat)
    const k = keuze.keuze
    if (k.soort === 'eigen' && vrijeBussen.includes(k.nummer) && !busVrij(k.nummer, o)) {
      po.bus = { wie: { soort: 'eigen', nummer: k.nummer }, bron: 'centrale', reden: 'pech', kosten: 0 }
      zetBus(k.nummer, o)
    } else if (k.soort === 'liggen') {
      po.bus = { wie: { soort: 'liggen' }, bron: 'centrale', reden: 'pech', kosten: 0 }
    } else {
      // Een huurbus; ook als de centrale iets teruggaf dat geen bus is.
      po.bus = { wie: { soort: 'huur' }, bron: 'centrale', reden: 'pech', toeslag: keuze.toeslag, kosten: 0 }
    }
  }

  /* ---- 2. de chauffeur per dienst ---- */
  const werk = new Map<number, Blok[]>()
  const voegWerk = (id: number, blok: Blok): void => {
    werk.set(id, [...(werk.get(id) ?? []), blok])
  }
  // Wat elke chauffeur volgens het rooster de dag ervoor en erna rijdt, voor de nachtrust.
  const buurBlokken = (d: number): Map<number, Blok[]> => {
    const uit = new Map<number, Blok[]>()
    for (const o of omlopenVanPlan(b, dagen.find((x) => x.dag === d))) {
      for (const dd of o.diensten) {
        const id = rooster.chauffeurs[dd.sleutel]
        if (id !== undefined) uit.set(id, [...(uit.get(id) ?? []), blokVan(dd)])
      }
    }
    return uit
  }
  const gisteren = buurBlokken(dag - 1)
  const morgen = buurBlokken(dag + 1)
  const buren = (id: number): { vorigeTot?: number; volgendeVan?: number } => {
    const g = gisteren.get(id) ?? []
    const m = morgen.get(id) ?? []
    return {
      ...(g.length ? { vorigeTot: Math.max(...g.map((x) => x.tot)) } : {}),
      ...(m.length ? { volgendeVan: Math.min(...m.map((x) => x.van)) } : {})
    }
  }
  /** Overlapt dit blok met wat deze chauffeur gisteren reed (een nachtdienst over middernacht)? */
  const gisterenDubbel = (id: number, blok: Blok): string | undefined =>
    (gisteren.get(id) ?? []).find((x) => overlapt({ van: x.van - 1440, tot: x.tot - 1440 }, blok))?.sleutel

  const vorm = (po: PlanOmloop): Busvorm | undefined =>
    po.bus.wie.soort === 'eigen' ? bussen.get(po.bus.wie.nummer)?.vorm ?? po.omloop.vorm : po.omloop.vorm

  const gaten: Gaatje[] = []
  const telaatGehad = new Set<number>()

  /** Een collega die een dienst (of stuk) overneemt: mag dat? Anders de conflictsoort. */
  const collegaFout = (id: number, blok: Blok): ConflictSoort | undefined => {
    const m = mensen.get(id)
    if (!m) return 'chauffeur-weg'
    if (m.rol !== 'chauffeur') return 'monteur'
    if (!aanwezig(m, dag) || ziekVandaag(m)) return 'chauffeur-afwezig'
    const t = toets(werk.get(id) ?? [], blok)
    if (t.dubbel || gisterenDubbel(id, blok)) return 'chauffeur-dubbel'
    if (t.teLang) return 'te-lang'
    return undefined
  }

  const alleDiensten: Array<{ po: PlanOmloop; pd: PlanDienst }> = []
  for (const po of alle) {
    for (const dienst of po.omloop.diensten) {
      const id = rooster.chauffeurs[dienst.sleutel]
      const pd: PlanDienst = {
        dienst,
        ...(id !== undefined ? { roosterId: id } : {}),
        stand: { wie: { soort: 'onderaannemer' }, bron: 'standaard', kosten: 0 },
        plots: false,
        uitgevallen: 0,
        conflicten: []
      }
      po.diensten.push(pd)
      alleDiensten.push({ po, pd })
    }
  }
  alleDiensten.sort((a, c) => opVolgorde(a.pd.dienst, c.pd.dienst))

  for (const { po, pd } of alleDiensten) {
    const d = pd.dienst
    const blok = blokVan(d)
    const conflict = (c: Omit<Conflict, 'dienst'>): void => {
      pd.conflicten.push({ ...c, dienst: d.sleutel })
    }
    if (po.bus.wie.soort === 'liggen') {
      // Zonder bus rijdt er ook geen chauffeur.
      pd.stand = { wie: { soort: 'liggen' }, bron: po.bus.bron, kosten: 0 }
      continue
    }
    const hand = v.invulling[d.sleutel]
    if (hand) {
      if (hand.soort === 'collega') {
        const fout = collegaFout(hand.id, blok)
        if (fout) {
          conflict({ soort: fout, ernst: fout === 'chauffeur-afwezig' ? 'let' : 'fout', medewerker: hand.id })
        } else {
          pd.stand = { wie: { soort: 'collega', id: hand.id }, bron: 'hand', kosten: 0 }
          voegWerk(hand.id, blok)
          continue
        }
      } else {
        pd.stand = { wie: { soort: hand.soort }, bron: 'hand', kosten: 0 }
        continue
      }
    }
    const id = pd.roosterId
    if (id === undefined) {
      pd.stand = { wie: { soort: 'onderaannemer' }, bron: 'standaard', kosten: 0 }
      continue
    }
    const m = mensen.get(id)
    const standaard = (reden?: Stand['reden']): void => {
      pd.stand = { wie: { soort: 'onderaannemer' }, bron: 'standaard', ...(reden ? { reden } : {}), kosten: 0 }
    }
    if (!m) {
      conflict({ soort: 'chauffeur-weg', ernst: 'fout', medewerker: id })
      standaard('weg')
      continue
    }
    if (m.rol !== 'chauffeur') {
      conflict({ soort: 'monteur', ernst: 'fout', medewerker: id })
      standaard('monteur')
      continue
    }
    if (ziekVandaag(m)) {
      pd.plots = true
      pd.stand = { wie: { soort: 'liggen' }, bron: 'rooster', reden: 'ziek', kosten: 0 }
      gaten.push({
        doel: { soort: 'dienst', dienst: d.sleutel },
        van: d.van,
        tot: d.tot,
        minuten: d.minuten,
        rituren: d.rituren,
        ...(vorm(po) ? { vorm: vorm(po) } : {}),
        blok,
        zet: (s) => (pd.stand = { ...s, reden: 'ziek' })
      })
      continue
    }
    if (!aanwezig(m, dag)) {
      conflict({ soort: 'chauffeur-afwezig', ernst: 'let', medewerker: id })
      standaard('afwezig')
      continue
    }
    const t = toets(werk.get(id) ?? [], blok, buren(id))
    const nacht = gisterenDubbel(id, blok)
    if (t.dubbel || nacht) {
      conflict({ soort: 'chauffeur-dubbel', ernst: 'fout', medewerker: id, andere: zonderStuk(t.dubbel ?? nacht!) })
      standaard('dubbel')
      continue
    }
    if (t.teLang) {
      conflict({ soort: 'te-lang', ernst: 'fout', medewerker: id, minuten: (werk.get(id) ?? []).reduce((s, x) => s + x.tot - x.van, 0) + d.minuten })
      standaard()
      continue
    }

    // Eigen chauffeur. Eerst: komt hij vandaag te laat, en is dit zijn eerste dienst?
    let eigenBlok = blok
    const laat = telaat.get(id)
    if (laat !== undefined && !telaatGehad.has(id) && isVandaag) {
      telaatGehad.add(id)
      const hervat = d.ritten.find((r) => r.vertrek >= d.van + laat)
      if (!hervat || hervat.vertrek >= d.tot) {
        // Het hele stuk valt in zijn vertraging: de hele dienst is een plots gat.
        pd.plots = true
        pd.stand = { wie: { soort: 'liggen' }, bron: 'rooster', reden: 'telaat', kosten: 0 }
        gaten.push({
          doel: { soort: 'dienst', dienst: d.sleutel },
          van: d.van,
          tot: d.tot,
          minuten: d.minuten,
          rituren: d.rituren,
          ...(vorm(po) ? { vorm: vorm(po) } : {}),
          blok,
          zet: (s) => (pd.stand = { ...s, reden: 'telaat' })
        })
        continue
      }
      const stuk: Deel = {
        van: d.van,
        tot: hervat.vertrek,
        minuten: hervat.vertrek - d.van,
        rituren: rituurIn(d, d.van, hervat.vertrek)
      }
      const stukBlok: Blok = { ...blokVan(d, { van: stuk.van, tot: stuk.tot }), sleutel: `${d.sleutel}#stuk` }
      eigenBlok = blokVan(d, { van: stuk.tot, tot: d.tot })
      pd.plots = true
      pd.stuk = { ...stuk, stand: { wie: { soort: 'liggen' }, bron: 'rooster', reden: 'telaat', kosten: 0 } }
      const stukHand = v.stukInvulling[d.sleutel]
      let stukKlaar = false
      if (stukHand) {
        if (stukHand.soort === 'collega') {
          const fout = collegaFout(stukHand.id, stukBlok)
          if (fout) conflict({ soort: fout, ernst: fout === 'chauffeur-afwezig' ? 'let' : 'fout', medewerker: stukHand.id })
          else {
            pd.stuk.stand = { wie: { soort: 'collega', id: stukHand.id }, bron: 'hand', reden: 'telaat', kosten: 0 }
            voegWerk(stukHand.id, stukBlok)
            stukKlaar = true
          }
        } else {
          pd.stuk.stand = { wie: { soort: stukHand.soort }, bron: 'hand', reden: 'telaat', kosten: 0 }
          stukKlaar = true
        }
      }
      if (!stukKlaar) {
        const ref = pd.stuk
        gaten.push({
          doel: { soort: 'stuk', dienst: d.sleutel },
          van: stuk.van,
          tot: stuk.tot,
          minuten: stuk.minuten,
          rituren: stuk.rituren,
          ...(vorm(po) ? { vorm: vorm(po) } : {}),
          blok: stukBlok,
          zet: (s) => (ref.stand = { ...s, reden: 'telaat' })
        })
      }
    }

    pd.stand = { wie: { soort: 'eigen', id }, bron: 'rooster', kosten: 0 }
    // Waarschuwingen: rust, overstap, nachtrust en ervaring. Overuren komen per persoon, hieronder.
    const t2 = toets(werk.get(id) ?? [], eigenBlok, buren(id))
    if (t2.rust !== undefined && t2.rust < PLAN.rust) conflict({ soort: 'chauffeur-rust', ernst: 'let', medewerker: id, minuten: t2.rust })
    else if (t2.overstap !== undefined) {
      const buur = (werk.get(id) ?? []).find(
        (x) => eigenBlok.van - x.tot === t2.overstap || x.van - eigenBlok.tot === t2.overstap
      )
      conflict({
        soort: 'chauffeur-overstap',
        ernst: 'let',
        medewerker: id,
        minuten: t2.overstap,
        ...(buur ? { andere: zonderStuk(buur.sleutel) } : {})
      })
    }
    if (t2.nachtrust !== undefined && t2.nachtrust < PLAN.nachtrust) {
      conflict({ soort: 'chauffeur-nachtrust', ernst: 'let', medewerker: id, minuten: t2.nachtrust })
    }
    if (!bevoegd(m.ervaring, vorm(po))) conflict({ soort: 'bevoegd', ernst: 'let', medewerker: id })
    voegWerk(id, eigenBlok)
  }

  /* ---- 3 en 4. de centrale voor de chauffeurs (alleen vandaag) ---- */
  const vrijeChauffeurs = (b.personeel ?? [])
    .filter((m) => m.rol === 'chauffeur' && aanwezig(m, dag) && !ziekVandaag(m) && !telaat.has(m.id))
    .map((m) => m.id)
  gaten.sort((a, c) => a.van - c.van || (a.blok.sleutel < c.blok.sleutel ? -1 : a.blok.sleutel > c.blok.sleutel ? 1 : 0))
  for (const g of gaten) {
    if (!isVandaag) {
      g.zet({ wie: { soort: 'onderaannemer' }, bron: 'standaard', kosten: 0 })
      continue
    }
    const gat: Gat = {
      doel: g.doel,
      van: g.van,
      tot: g.tot,
      minuten: g.minuten,
      rituren: g.rituren,
      plots: true,
      ...(g.vorm ? { vorm: g.vorm } : {})
    }
    const keuze = kiesAutomatisch(b, context(werk, vrijeChauffeurs), gat)
    const k = keuze.keuze
    const uitzend = (): void => {
      if (uitzendGebruik.gebruikt < uitzendGebruik.max) {
        uitzendGebruik.gebruikt += 1
        g.zet({ wie: { soort: 'uitzend' }, bron: 'centrale', toeslag: keuze.toeslag, kosten: 0 })
      } else g.zet({ wie: { soort: 'liggen' }, bron: 'centrale', kosten: 0 })
    }
    if (k.soort === 'collega' && vrijeChauffeurs.includes(k.id) && !collegaFout(k.id, g.blok)) {
      g.zet({ wie: { soort: 'collega', id: k.id }, bron: 'centrale', kosten: 0 })
      voegWerk(k.id, g.blok)
    } else if (k.soort === 'onderaannemer') {
      g.zet({ wie: { soort: 'onderaannemer' }, bron: 'centrale', kosten: 0 })
    } else if (k.soort === 'liggen') {
      g.zet({ wie: { soort: 'liggen' }, bron: 'centrale', kosten: 0 })
    } else uitzend()
  }

  /* ---- 3. jij, en 5. de kosten ---- */
  const telling: Telling = { ...LEGE_TELLING }
  const werkdag = new Map<number, Werkdag>()
  const telWerk = (wie: Stand['wie'], sleutel: DienstSleutel, minuten: number, rituren: number): void => {
    if (wie.soort !== 'eigen' && wie.soort !== 'collega') return
    const w = werkdag.get(wie.id) ?? { minuten: 0, rituren: 0, diensten: [] }
    werkdag.set(wie.id, {
      minuten: w.minuten + minuten,
      rituren: w.rituren + rituren,
      diensten: w.diensten.includes(sleutel) ? w.diensten : [...w.diensten, sleutel]
    })
  }
  for (const po of alle) {
    const o = po.omloop
    telling.omlopen += 1
    telling.rituren += o.rituren
    if (po.bus.wie.soort === 'eigen') telling.eigenBus += 1
    if (po.bus.wie.soort === 'huur') telling.huurbus += 1
    let uitgevallen = 0
    for (const pd of po.diensten) {
      const d = pd.dienst
      const ger = v.gereden[d.sleutel]
      const nu = lopend?.dienst === d.sleutel && lopend.dag === dag
      if (ger || nu) {
        pd.jij = {
          van: ger?.van ?? lopend!.van,
          tot: ger?.tot ?? lopend!.tot,
          nu: Boolean(nu),
          ...(ger ? { gereden: ger } : {})
        }
      }
      for (const deel of delenVan(pd)) {
        const stand = { ...deel.stand, kosten: chauffeurKosten(deel.stand.wie.soort, deel.minuten, f, deel.stand.toeslag) }
        if (deel.soort === 'stuk') pd.stuk = { ...pd.stuk!, stand }
        else pd.stand = stand
        if (stand.wie.soort === 'liggen') pd.uitgevallen += deel.rituren
        telWerk(stand.wie, d.sleutel, deel.minuten, deel.rituren)
      }
      uitgevallen += pd.uitgevallen

      telling.diensten += 1
      telling.werkuren += d.minuten / 60
      if (pd.jij) telling.jij += 1
      const wie = pd.stand.wie.soort
      if (wie === 'eigen') telling.eigen += 1
      else if (wie === 'collega') telling.collega += 1
      else if (wie === 'uitzend') telling.uitzend += 1
      else if (wie === 'onderaannemer') telling.uitbesteed += 1
      // Open: een plots gat dat niemand met de hand invulde; de centrale regelt het (of het valt uit).
      if (pd.plots && (pd.stand.bron === 'centrale' || pd.stuk?.stand.bron === 'centrale')) telling.open += 1
      if (pd.uitgevallen > 0) telling.uitgevallen += 1
      telling.uitgevallenRituren += pd.uitgevallen
    }
    po.bus = { ...po.bus, kosten: busKosten(po.bus.wie.soort, Math.max(0, o.rituren - uitgevallen), f, po.bus.toeslag) }
  }

  // Overuren: per persoon boven de dagdoelstelling, bij zijn laatste dienst.
  for (const [id, w] of werkdag) {
    if (w.minuten <= PLAN.dagDoel) continue
    const laatste = w.diensten[w.diensten.length - 1]
    const pd = alleDiensten.find((x) => x.pd.dienst.sleutel === laatste)?.pd
    pd?.conflicten.push({ soort: 'overuren', ernst: 'let', dienst: laatste, medewerker: id, minuten: w.minuten - PLAN.dagDoel })
  }

  const metWerk = new Set([...werkdag.entries()].filter(([, w]) => w.diensten.length > 0).map(([id]) => id))
  const busMetWerk = new Set(alle.flatMap((po) => (po.bus.wie.soort === 'eigen' ? [po.bus.wie.nummer] : [])))
  const conflicten = alle.flatMap((po) => [...po.conflicten, ...po.diensten.flatMap((pd) => pd.conflicten)])
  return {
    dag,
    ...(dagrooster?.kaarten[0]?.datum ? { datum: dagrooster.kaarten[0].datum } : {}),
    vandaag: isVandaag,
    kaarten,
    terugval,
    vrij: {
      chauffeurs: (b.personeel ?? [])
        .filter((m) => m.rol === 'chauffeur' && aanwezig(m, dag) && !ziekVandaag(m) && !metWerk.has(m.id))
        .map((m) => m.id),
      bussen: (b.bussen ?? [])
        .filter((x) => isInzetbaar(x, dag) && !pech.has(x.nummer) && !busMetWerk.has(x.nummer))
        .map((x) => x.nummer)
    },
    werk: Object.fromEntries(werkdag),
    uitzend: uitzendGebruik,
    conflicten,
    telling
  }
}

/* ------------------------------------------------------------------ */
/* De afrekening                                                      */
/* ------------------------------------------------------------------ */

export function afrekening(b: Bedrijf, plan: DagPlan): PlanCijfers {
  const f = bedrijfsfactoren(b)
  const perConcessie: ConcessieCijfers[] = []
  const mensen = new Map((b.personeel ?? []).map((m) => [m.id, m]))
  let gereden = 0
  let eigenBus = 0
  let eigenOmlopen = 0
  const uitzend = { diensten: 0, kosten: 0 }
  const huurbus = { omlopen: 0, kosten: 0 }
  const uitgevallen = { rituren: 0, ritten: 0, boete: 0, reputatie: 0 }
  let uitbesteedRituren = 0
  let eigenRituren = 0
  let jijDiensten = 0
  let eigenDiensten = 0
  const busUren: Record<number, number> = {}

  for (const { kaart, omlopen } of plan.kaarten) {
    for (const po of omlopen) {
      const o = po.omloop
      const conc = b.concessies.find(
        (c) => c.mapFolder === o.mapFolder && c.lineFile.toLowerCase() === o.lineFile.toLowerCase()
      )
      let c = perConcessie.find((x) => x.mapFolder === o.mapFolder && x.lineFile.toLowerCase() === o.lineFile.toLowerCase())
      if (!c) {
        c = {
          mapFolder: o.mapFolder,
          lineFile: conc?.lineFile ?? o.lineFile,
          naam: `${lijnnaam(conc ?? { lineNumbers: [], lineFile: o.lineFile })} · ${kaart.mapName}`,
          bron: 'plan',
          rituren: 0,
          uitgevallen: 0,
          vergoeding: 0,
          onderaannemer: 0
        }
        perConcessie.push(c)
      }
      const weg = po.diensten.reduce((s, pd) => s + pd.uitgevallen, 0)
      const rit = Math.max(0, o.rituren - weg)
      c.rituren += rit
      c.uitgevallen += weg
      gereden += rit

      // De bus van de omloop.
      const bus = po.bus
      if (bus.wie.soort === 'onderaannemer') c.onderaannemer += bus.kosten
      else if (bus.wie.soort === 'eigen') {
        eigenBus += bus.kosten
        eigenOmlopen += 1
        busUren[bus.wie.nummer] = (busUren[bus.wie.nummer] ?? 0) + rit
      } else if (bus.wie.soort === 'huur') {
        huurbus.omlopen += 1
        huurbus.kosten += bus.kosten
      }

      for (const pd of po.diensten) {
        const d = pd.dienst
        for (const deel of delenVan(pd)) {
          const wie = deel.stand.wie.soort
          if (wie === 'onderaannemer') {
            c.onderaannemer += deel.stand.kosten
            uitbesteedRituren += deel.rituren
          } else if (wie === 'uitzend') {
            uitzend.diensten += 1
            uitzend.kosten += deel.stand.kosten
          } else if (wie === 'eigen' || wie === 'collega') {
            eigenRituren += deel.rituren
          }
          // Wat jij reed telt als eigen werk, behalve waar een eigen chauffeur toch al reed.
          if (wie !== 'eigen' && wie !== 'collega') eigenRituren += deel.jij.rituren
          if (wie === 'liggen') {
            // Wat jij in dit stuk reed, is niet uitgevallen.
            const ger = pd.jij?.gereden
            const alle = rittenIn(d, deel.van, deel.tot)
            const zelf = ger ? rittenIn(d, Math.max(deel.van, ger.van), Math.min(deel.tot, ger.tot)) : 0
            uitgevallen.ritten += Math.max(0, alle - zelf)
          }
        }
        if (pd.stand.wie.soort === 'eigen') eigenDiensten += 1
        if (pd.jij) jijDiensten += 1
        if (pd.uitgevallen > 0) {
          uitgevallen.rituren += pd.uitgevallen
          uitgevallen.boete += boete(pd.uitgevallen)
        }
      }
    }
  }
  for (const c of perConcessie) c.vergoeding = vergoeding(c.rituren, b.reputatie, f)
  for (const t of plan.terugval) {
    const conc = b.concessies.find((c) => c.mapFolder === t.mapFolder && c.lineFile === t.lineFile)
    if (!conc) continue
    const tv = terugvalVanConcessie(conc, b.reputatie, f)
    perConcessie.push({
      mapFolder: t.mapFolder,
      lineFile: t.lineFile,
      naam: `${lijnnaam(conc)} · ${conc.mapName}`,
      bron: 'terugval',
      rituren: tv.rituren,
      uitgevallen: 0,
      vergoeding: tv.vergoeding,
      onderaannemer: tv.onderaannemer
    })
    gereden += tv.rituren
  }
  uitgevallen.reputatie = reputatieVerlies(uitgevallen.rituren)

  // Overuren per medewerker, op zijn eigen loon.
  const overuren = { minuten: 0, kosten: 0 }
  const werkend: number[] = []
  const overwerkt: number[] = []
  for (const [sleutel, w] of Object.entries(plan.werk)) {
    const id = Number(sleutel)
    if (w.minuten > 0) werkend.push(id)
    const boven = w.minuten - PLAN.dagDoel
    if (boven > 0) {
      overwerkt.push(id)
      overuren.minuten += boven
      overuren.kosten += overurenKosten(mensen.get(id)?.loon ?? 0, boven)
    }
  }
  werkend.sort((a, c) => a - c)
  overwerkt.sort((a, c) => a - c)

  const lonen = (b.personeel ?? []).reduce((s, m) => s + m.loon, 0)
  const legacyZelf = Math.round(
    Math.min(b.zelfUren ?? 0, uitbesteedRituren) * TARIEF.onderChauffeurPerWerkuur * f.inhuur
  )
  const onderaannemer = perConcessie.reduce((s, c) => s + c.onderaannemer, 0)
  const kosten =
    onderaannemer + eigenBus + uitzend.kosten + huurbus.kosten + overuren.kosten + lonen + uitgevallen.boete
  return {
    perConcessie,
    vergoeding: perConcessie.reduce((s, c) => s + c.vergoeding, 0),
    onderaannemer,
    eigenBus,
    uitzend,
    huurbus,
    overuren,
    lonen,
    uitgevallen,
    legacyZelf,
    kosten,
    gereden,
    werkend,
    overwerkt,
    eigenAandeel: gereden > 0 ? Math.min(1, eigenRituren / gereden) : 0,
    busUren,
    omlopen: plan.telling.omlopen,
    eigenOmlopen,
    diensten: plan.telling.diensten,
    eigenDiensten,
    jijDiensten,
    openDiensten: plan.telling.open,
    uitbesteed: plan.telling.uitbesteed
  }
}

/* ------------------------------------------------------------------ */
/* Aanvullen                                                          */
/* ------------------------------------------------------------------ */

/** De blokken van wat deze bus of chauffeur volgens het rooster op een dag rijdt. */
function roosterBlokken(
  b: Bedrijf,
  rooster: VastRooster,
  r: Dagrooster | undefined,
  wat: { bus: number } | { id: number },
  zonder?: string
): Blok[] {
  const uit: Blok[] = []
  for (const o of omlopenVanPlan(b, r)) {
    if ('bus' in wat) {
      if (rooster.bussen[o.sleutel] === wat.bus && o.sleutel !== zonder) uit.push(omloopBlok(o))
    } else {
      for (const d of o.diensten) if (rooster.chauffeurs[d.sleutel] === wat.id && d.sleutel !== zonder) uit.push(blokVan(d))
    }
  }
  return uit
}

/** Burendagen voor de nachtrust van een chauffeur volgens het rooster. */
function burenVan(
  b: Bedrijf,
  rooster: VastRooster,
  dagen: Dagrooster[],
  dag: number,
  id: number
): { vorigeTot?: number; volgendeVan?: number } {
  const g = roosterBlokken(b, rooster, dagen.find((x) => x.dag === dag - 1), { id })
  const m = roosterBlokken(b, rooster, dagen.find((x) => x.dag === dag + 1), { id })
  return {
    ...(g.length ? { vorigeTot: Math.max(...g.map((x) => x.tot)) } : {}),
    ...(m.length ? { volgendeVan: Math.min(...m.map((x) => x.van)) } : {})
  }
}

/** De zwaarste set omlopen zonder overlap (gewogen intervalplanning), op tijd gesorteerd. */
function zwaarsteSet(kandidaten: OmloopVanDag[], gewicht: (o: OmloopVanDag) => number): OmloopVanDag[] {
  const k = [...kandidaten].sort((a, c) => a.tot - c.tot || (a.sleutel < c.sleutel ? -1 : a.sleutel > c.sleutel ? 1 : 0))
  const n = k.length
  const voor: number[] = k.map((o, j) => {
    for (let i = j - 1; i >= 0; i--) if (k[i].tot + PLAN.busMarge <= o.van) return i
    return -1
  })
  const best: number[] = new Array(n + 1).fill(0)
  for (let j = 1; j <= n; j++) {
    const met = gewicht(k[j - 1]) + best[voor[j - 1] + 1]
    best[j] = met > best[j - 1] + 1e-9 ? met : best[j - 1]
  }
  const uit: OmloopVanDag[] = []
  for (let j = n; j >= 1; ) {
    const met = gewicht(k[j - 1]) + best[voor[j - 1] + 1]
    if (met > best[j - 1] + 1e-9) {
      uit.push(k[j - 1])
      j = voor[j - 1] + 1
    } else j -= 1
  }
  return uit.reverse()
}

/**
 * Het rooster aanvullen, dag voor dag in het bereik, zonder iets te
 * overschrijven. Eerst de bussen (elke bus de zwaarste set omlopen die past),
 * dan de chauffeurs (de langste diensten eerst, de best passende chauffeur
 * zonder overuren). Overuren laat het aanvullen liggen: die kosten meer dan
 * de onderaannemer.
 */
export function vulAan(
  b: Bedrijf,
  dagen: Dagrooster[],
  dag: number,
  bereik: 'dag' | 'week'
): { bedrijf: Bedrijf; bussen: number; diensten: number } {
  const oud = b.rooster ?? leegRooster(b)
  const rooster: VastRooster = { ...oud, bussen: { ...oud.bussen }, chauffeurs: { ...oud.chauffeurs } }
  const reeks = bereik === 'dag' ? [dag] : [0, 1, 2, 3, 4, 5, 6].map((i) => dag + i)
  const inBereik = reeks.map((d) => dagen.find((x) => x.dag === d)).filter((x): x is Dagrooster => Boolean(x))
  const bussen = new Map((b.bussen ?? []).map((x) => [x.nummer, x]))
  let nBus = 0
  let nDienst = 0

  /** Past deze bus op deze omloop op elke dag in het bereik waarop de omloop rijdt? */
  const busPast = (nr: number, o: OmloopVanDag): boolean =>
    inBereik.every((r) => {
      const z = zoekOmloop(r, o.sleutel)
      return !z || !roosterBlokken(b, rooster, r, { bus: nr }).some((x) => overlapt(x, z.omloop, PLAN.busMarge))
    })

  /** Past deze chauffeur zonder waarschuwing op deze dienst, op elke dag waarop hij rijdt? */
  const chauffeurPast = (id: number, d: DienstVanDag): boolean =>
    inBereik.every((r) => {
      const z = zoekDienst(r, d.sleutel)
      if (!z) return true
      const t = toets(roosterBlokken(b, rooster, r, { id }), blokVan(z.dienst), burenVan(b, rooster, dagen, r.dag, id))
      return (
        !t.dubbel &&
        !t.teLang &&
        (t.rust === undefined || t.rust >= PLAN.rust) &&
        t.overuren === 0 &&
        (t.nachtrust === undefined || t.nachtrust >= PLAN.nachtrust)
      )
    })

  for (const r of inBereik) {
    const omlopen = omlopenVanPlan(b, r)

    // Bussen: de beste staat eerst, elk de zwaarste set die past.
    const inzet = (b.bussen ?? [])
      .filter((x) => isInzetbaar(x, r.dag))
      .sort((a, c) => c.staat - a.staat || a.nummer - c.nummer)
    for (const bus of inzet) {
      const kandidaten = omlopen.filter((o) => rooster.bussen[o.sleutel] === undefined && busPast(bus.nummer, o))
      for (const o of zwaarsteSet(kandidaten, (x) => x.rituren * (!x.vorm || x.vorm === bus.vorm ? 1 : 0.9))) {
        rooster.bussen[o.sleutel] = bus.nummer
        nBus += 1
      }
    }

    // Chauffeurs: de langste open diensten eerst.
    const open = omlopen
      .flatMap((o) => o.diensten.map((d) => ({ o, d })))
      .filter(({ d }) => rooster.chauffeurs[d.sleutel] === undefined)
      .sort((a, c) => c.d.minuten - a.d.minuten || (a.d.sleutel < c.d.sleutel ? -1 : a.d.sleutel > c.d.sleutel ? 1 : 0))
    for (const { o, d } of open) {
      const busNr = rooster.bussen[o.sleutel]
      const vorm = (busNr !== undefined ? bussen.get(busNr)?.vorm : undefined) ?? o.vorm
      const kandidaten = (b.personeel ?? [])
        .filter((m) => m.rol === 'chauffeur' && aanwezig(m, r.dag) && chauffeurPast(m.id, d))
        .map((m) => ({
          m,
          bevoegd: bevoegd(m.ervaring, vorm),
          minuten: roosterBlokken(b, rooster, r, { id: m.id }).reduce((s, x) => s + x.tot - x.van, 0)
        }))
        .sort(
          (a, c) =>
            Number(c.bevoegd) - Number(a.bevoegd) ||
            c.minuten - a.minuten ||
            c.m.ervaring - a.m.ervaring ||
            a.m.id - c.m.id
        )
      const keuze = kandidaten[0]
      if (keuze) {
        rooster.chauffeurs[d.sleutel] = keuze.m.id
        nDienst += 1
      }
    }
  }
  return { bedrijf: { ...b, rooster }, bussen: nBus, diensten: nDienst }
}

/* ------------------------------------------------------------------ */
/* Het rooster aanpassen                                              */
/* ------------------------------------------------------------------ */

/** Sleutels van verkochte bussen en vertrokken mensen eruit (ontwerp §4.5). */
function opgeruimd(b: Bedrijf, rooster: VastRooster): VastRooster {
  const bussen = new Set((b.bussen ?? []).map((x) => x.nummer))
  const mensen = new Set((b.personeel ?? []).map((m) => m.id))
  return {
    ...rooster,
    bussen: Object.fromEntries(Object.entries(rooster.bussen).filter(([, nr]) => bussen.has(nr))),
    chauffeurs: Object.fromEntries(Object.entries(rooster.chauffeurs).filter(([, id]) => mensen.has(id)))
  }
}

/** De omlopen van een masker van een lijn, uit de eerste dag in `dagen` waarop dat masker rijdt. */
function omlopenVanMasker(b: Bedrijf, dagen: Dagrooster[], mapFolder: string, lineFile: string, days: number): OmloopVanDag[] {
  for (const r of [...dagen].sort((a, c) => a.dag - c.dag)) {
    const o = omlopenVanPlan(b, r).filter(
      (x) => x.mapFolder === mapFolder && x.lineFile.toLowerCase() === lineFile.toLowerCase() && x.days === days
    )
    if (o.length > 0) return o
  }
  return []
}

/**
 * Het rooster van één masker overnemen naar een ander, voor één lijn: eerst
 * per gelijk omloopnummer, de rest op volgorde van vertrek. Er wordt niets
 * overschreven, en een chauffeur die op de doeldag te lang zou werken of
 * dubbel zou staan, gaat niet mee.
 */
export function kopieerRooster(
  b: Bedrijf,
  dagen: Dagrooster[],
  mapFolder: string,
  lineFile: string,
  van: number,
  naar: number
): { rooster: VastRooster; bussen: number; diensten: number } | { fout: RoosterFout } {
  const bron = omlopenVanMasker(b, dagen, mapFolder, lineFile, van)
  const doel = omlopenVanMasker(b, dagen, mapFolder, lineFile, naar)
  if (bron.length === 0 || doel.length === 0) return { fout: 'dag' }
  const oud = b.rooster ?? leegRooster(b)
  const rooster: VastRooster = { ...oud, bussen: { ...oud.bussen }, chauffeurs: { ...oud.chauffeurs } }
  const paren: Array<[OmloopVanDag, OmloopVanDag]> = []
  const restBron = [...bron]
  const restDoel: OmloopVanDag[] = []
  for (const t of doel) {
    const i = restBron.findIndex((s) => s.tourNumber === t.tourNumber)
    if (i >= 0) paren.push([restBron.splice(i, 1)[0], t])
    else restDoel.push(t)
  }
  restDoel.forEach((t, i) => {
    if (restBron[i]) paren.push([restBron[i], t])
  })
  const doeldag = [...dagen]
    .sort((a, c) => a.dag - c.dag)
    .find((r) => doel.some((t) => zoekOmloop(r, t.sleutel)))
  let nBus = 0
  let nDienst = 0
  for (const [s, t] of paren) {
    const nr = rooster.bussen[s.sleutel]
    if (nr !== undefined && rooster.bussen[t.sleutel] === undefined) {
      const bezet = roosterBlokken(b, rooster, doeldag, { bus: nr })
      if (!bezet.some((x) => overlapt(x, t, PLAN.busMarge))) {
        rooster.bussen[t.sleutel] = nr
        nBus += 1
      }
    }
    for (const td of t.diensten) {
      const sd = s.diensten.find((x) => x.deel === td.deel)
      const id = sd ? rooster.chauffeurs[sd.sleutel] : undefined
      if (id === undefined || rooster.chauffeurs[td.sleutel] !== undefined) continue
      const toetsing = toets(roosterBlokken(b, rooster, doeldag, { id }), blokVan(td))
      if (toetsing.dubbel || toetsing.teLang) continue
      rooster.chauffeurs[td.sleutel] = id
      nDienst += 1
    }
  }
  return { rooster, bussen: nBus, diensten: nDienst }
}

export function pasRoosterToe(
  b: Bedrijf,
  dagen: Dagrooster[],
  actie: RoosterActie,
  _lopend?: LopendeRit
): { bedrijf: Bedrijf; melding?: { bussen: number; diensten: number } } | { fout: RoosterFout } {
  const oud = b.rooster ?? leegRooster(b)
  const rooster: VastRooster = { ...oud, bussen: { ...oud.bussen }, chauffeurs: { ...oud.chauffeurs } }
  const klaar = (r: VastRooster, melding?: { bussen: number; diensten: number }) => ({
    bedrijf: { ...b, rooster: opgeruimd(b, r) },
    ...(melding ? { melding } : {})
  })
  switch (actie.soort) {
    case 'bus': {
      if (!ontleedOmloop(actie.omloop)) return { fout: 'weg' }
      if (actie.nummer === null) {
        delete rooster.bussen[actie.omloop]
        return klaar(rooster)
      }
      const nummer = actie.nummer
      if (!(b.bussen ?? []).some((x) => x.nummer === nummer)) return { fout: 'weg' }
      // Dubbel, de vorm of een bus in de werkplaats mag: dat wordt een conflict in het plan.
      rooster.bussen[actie.omloop] = nummer
      return klaar(rooster)
    }
    case 'chauffeur': {
      if (!ontleedDienst(actie.dienst)) return { fout: 'weg' }
      if (actie.id === null) {
        delete rooster.chauffeurs[actie.dienst]
        return klaar(rooster)
      }
      const id = actie.id
      if (!(b.personeel ?? []).some((m) => m.id === id)) return { fout: 'weg' }
      /*
       * Meer dan tien uur op een dag mag niet; de rest (dubbel, overuren,
       * nachtrust, ervaring) mag en wordt een conflict. Getoetst op elke dag
       * in `dagen` waarop deze dienst rijdt; een dienst van een dag die main
       * niet meegaf, toetst het venster vooraf.
       */
      for (const r of dagen) {
        const z = zoekDienst(r, actie.dienst)
        if (!z || !heeftConcessie(b, z.omloop.mapFolder, z.omloop.lineFile)) continue
        const t = toets(roosterBlokken(b, rooster, r, { id }, actie.dienst), blokVan(z.dienst))
        if (t.teLang) return { fout: 'te-lang' }
      }
      rooster.chauffeurs[actie.dienst] = id
      return klaar(rooster)
    }
    case 'busOpLijn': {
      const bus = (b.bussen ?? []).find((x) => x.nummer === actie.nummer)
      if (!bus) return { fout: 'weg' }
      const r = dagen.find((x) => x.dag === actie.dag)
      if (!r) return { fout: 'dag' }
      const kaart = r.kaarten.find((k) => k.mapFolder === actie.mapFolder)
      if (!kaart || kaart.fout) return { fout: 'kaart' }
      const bezet = roosterBlokken(b, rooster, r, { bus: bus.nummer })
      const kandidaten = kaart.omlopen
        .filter(
          (o) =>
            o.lineFile.toLowerCase() === actie.lineFile.toLowerCase() &&
            rooster.bussen[o.sleutel] === undefined &&
            !bezet.some((x) => overlapt(x, o, PLAN.busMarge))
        )
        .sort(
          (a, c) =>
            Number(!c.vorm || c.vorm === bus.vorm) - Number(!a.vorm || a.vorm === bus.vorm) ||
            c.rituren - a.rituren ||
            opVolgorde(a, c)
        )
      const keuze = kandidaten[0]
      if (!keuze) return { fout: 'geenPlek' }
      rooster.bussen[keuze.sleutel] = bus.nummer
      return klaar(rooster, { bussen: 1, diensten: 0 })
    }
    case 'vulAan': {
      const uit = vulAan({ ...b, rooster }, dagen, actie.dag, actie.bereik)
      return klaar(uit.bedrijf.rooster ?? rooster, { bussen: uit.bussen, diensten: uit.diensten })
    }
    case 'wis': {
      if (actie.wat === 'alles') {
        return klaar({ ...rooster, bussen: {}, chauffeurs: {} })
      }
      const hoort = (s: string): boolean => {
        const o = ontleedOmloop(s)
        return Boolean(
          o && o.mapFolder === actie.mapFolder && o.lineFile.toLowerCase() === actie.lineFile.toLowerCase() && o.days === actie.days
        )
      }
      return klaar({
        ...rooster,
        bussen: Object.fromEntries(Object.entries(rooster.bussen).filter(([s]) => !hoort(s))),
        chauffeurs: Object.fromEntries(
          Object.entries(rooster.chauffeurs).filter(([s]) => !hoort(ontleedDienst(s)?.omloop ?? s))
        )
      })
    }
    case 'kopieer': {
      const uit = kopieerRooster({ ...b, rooster }, dagen, actie.mapFolder, actie.lineFile, actie.van, actie.naar)
      if ('fout' in uit) return uit
      return klaar(uit.rooster, { bussen: uit.bussen, diensten: uit.diensten })
    }
    case 'herstel': {
      const r = actie.rooster
      if (!r || typeof r !== 'object') return { fout: 'weg' }
      return klaar({
        ...r,
        bussen: { ...(r.bussen ?? {}) },
        chauffeurs: { ...(r.chauffeurs ?? {}) }
      })
    }
    case 'auto': {
      if (actie.aan && !opleidingKlaar(b, 'planner')) return { fout: 'planner' }
      return klaar({ ...rooster, autoAanvullen: actie.aan })
    }
  }
  return { fout: 'weg' }
}

/* ------------------------------------------------------------------ */
/* Voor het scherm                                                    */
/* ------------------------------------------------------------------ */

/** Hoeveel minuten deze medewerker vandaag werkt volgens het plan. */
export function minutenVan(plan: DagPlan, id: number): number {
  return plan.werk[id]?.minuten ?? 0
}

/** De blokken die deze chauffeur in het plan rijdt (eigen dienst, collega, of een stuk). */
export function blokkenVan(plan: DagPlan, id: number): Blok[] {
  const uit: Blok[] = []
  for (const { omlopen } of plan.kaarten) {
    for (const po of omlopen) {
      for (const pd of po.diensten) {
        const w = pd.stand.wie
        if ((w.soort === 'eigen' || w.soort === 'collega') && w.id === id) {
          uit.push(pd.stuk ? blokVan(pd.dienst, { van: pd.stuk.tot, tot: pd.dienst.tot }) : blokVan(pd.dienst))
        }
        const s = pd.stuk?.stand.wie
        if (s && (s.soort === 'eigen' || s.soort === 'collega') && s.id === id) {
          uit.push({ ...blokVan(pd.dienst, { van: pd.stuk!.van, tot: pd.stuk!.tot }), sleutel: `${pd.dienst.sleutel}#stuk` })
        }
      }
    }
  }
  return uit
}

/** Zoek een dienst in het plan. */
export function zoekPlanDienst(plan: DagPlan, s: DienstSleutel): { po: PlanOmloop; pd: PlanDienst } | undefined {
  for (const { omlopen } of plan.kaarten) {
    for (const po of omlopen) {
      const pd = po.diensten.find((x) => x.dienst.sleutel === s)
      if (pd) return { po, pd }
    }
  }
  return undefined
}

/** Zoek een omloop in het plan. */
export function zoekPlanOmloop(plan: DagPlan, s: OmloopSleutel): PlanOmloop | undefined {
  for (const { omlopen } of plan.kaarten) {
    const po = omlopen.find((x) => x.omloop.sleutel === s)
    if (po) return po
  }
  return undefined
}

/**
 * Past deze chauffeur op deze dienst, gezien wat hij in het plan al rijdt?
 * `past` is zonder harde fout (dubbel of te lang); `schoon` ook zonder overuren.
 */
export function pastChauffeur(plan: DagPlan, id: number, dienst: DienstSleutel): { past: boolean; schoon: boolean } {
  const z = zoekPlanDienst(plan, dienst)
  if (!z) return { past: false, schoon: false }
  const eigen = blokkenVan(plan, id).filter((x) => zonderStuk(x.sleutel) !== dienst)
  const t = toets(eigen, blokVan(z.pd.dienst))
  const past = !t.dubbel && !t.teLang
  return { past, schoon: past && t.overuren === 0 && (t.rust === undefined || t.rust >= PLAN.rust) }
}

/** Past deze bus op deze omloop, gezien wat hij in het plan al rijdt? */
export function pastBus(plan: DagPlan, nummer: number, omloop: OmloopSleutel): boolean {
  const o = zoekPlanOmloop(plan, omloop)
  if (!o) return false
  for (const { omlopen } of plan.kaarten) {
    for (const po of omlopen) {
      if (po.omloop.sleutel === omloop) continue
      if (po.bus.wie.soort === 'eigen' && po.bus.wie.nummer === nummer && overlapt(po.omloop, o.omloop, PLAN.busMarge)) {
        return false
      }
    }
  }
  return true
}

/** Wat een dienst vandaag kost, alles bij elkaar (de chauffeur; het stuk erbij). */
export function dienstKosten(pd: PlanDienst): number {
  return pd.stand.kosten + (pd.stuk?.stand.kosten ?? 0)
}

