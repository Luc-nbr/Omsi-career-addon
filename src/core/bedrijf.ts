import type { LineSummary } from './duty'
import type { Rittenstaat } from './rittenstaat'
import type { Duty } from './types'

/*
 * Het busbedrijf: je eigen vervoerder bovenop de loopbaan.
 *
 * WAAROM DIT ER IS
 * Luc wil een busbedrijf zoals in City Bus Manager en de Bus Company Simulator:
 * concessies, bussen, personeel, onderhoud, opleidingen, en zelf rijden. De
 * lijnen en omlopen zijn die van de kaart -- vrij tekenen kan in OMSI niet --
 * en het bedrijf wint concessies op lijnen die er al zijn. Wat OMSI niet kent
 * (geld, personeel, onderhoud) rekent de app zelf, en dat staat er ook zo bij:
 * elke boeking is "gemeten" (uit je eigen rit) of "gerekend" (uit dit model).
 *
 * WAT HIER STAAT
 * Alleen rekenen, zonder schijf en zonder Electron: het hoofdproces bewaart het
 * bedrijf in het profiel, de interface toont het, en beide gebruiken dezelfde
 * regels. Bedragen staan overal in hele centen, zodat er nooit een halve cent
 * wegloopt in een optelling van honderd dagen.
 *
 * DE BEDRIJFSDAG
 * OMSI loopt één op één; een dag van een heel bedrijf naspelen kan niet. Een
 * bedrijfsdag is daarom een stap die je zelf zet ("dag afsluiten"): de omlopen
 * van je concessies worden die dag gereden -- in OMSI door de KI, hier in het
 * rekenmodel -- en wat je zelf reed telt met zijn gemeten rittenstaat mee.
 *
 * VAN DE MUNT
 * Elke kaart heeft een eigen tijdvak en soms een eigen munt (DM, euro). Het
 * bedrijf rekent in één munt, getoond als euro; geld van twee kaarten wordt
 * dus bij elkaar geteld. Dat is een vereenvoudiging die later per kaart kan.
 */

/** Een concessie: het recht om een lijn te rijden, voor een aantal bedrijfsdagen. */
export interface Concessie {
  mapFolder: string
  mapName: string
  lineFile: string
  lineNumbers: string[]
  /** Hoeveel omlopen en ritvertrekken de lijn per dag heeft, uit de dienstregeling. */
  omlopen: number
  ritten: number
  /** Dienstregelingsuren per dag: ritten × gemiddelde rittijd. Gerekend. */
  urenPerDag: number
  /** Bedrijfsdag van de gunning en de laatste dag waarop hij loopt. */
  vanaf: number
  tot: number
}

export type BoekingSoort =
  | 'oprichting'
  | 'inschrijving'
  | 'vergoeding'
  | 'exploitatie'
  | 'eigen-dienst'
  | 'verlenging'
  | 'vervallen'
  | 'bus-koop'
  | 'bus-verkoop'
  | 'onderhoud'
  | 'reparatie'
  | 'eigen-materieel'
  | 'eigen-personeel'
  | 'loon'
  | 'ontslag'
  | 'vertrek'
  | 'opleiding'
  | 'bijscholing'
  | 'niveau'

/** Eén regel in de boeken. */
export interface Boeking {
  dag: number
  soort: BoekingSoort
  /** Positief is inkomsten, negatief uitgaven, in centen. */
  bedrag: number
  /** Vrije omschrijving; lijnnummers en kaart, niet vertaald. */
  wat: string
  /** Uit je eigen gemeten rit (true) of uit het rekenmodel (false). */
  gemeten: boolean
}

/** De vorm van een bus, uit zijn naam; bepaalt de prijs. */
export type Busvorm = 'midi' | 'solo' | 'geleed' | 'dubbel'

/** Een bus zoals hij te koop staat: een geïnstalleerde bus uit de Vehicles-map. */
export interface MarktBus {
  relativePath: string
  naam: string
  vorm: Busvorm
}

/** Een bus van het eigen wagenpark. */
export interface EigenBus {
  /** Uniek binnen het bedrijf; ook het wagennummer op het scherm. */
  nummer: number
  relativePath: string
  naam: string
  vorm: Busvorm
  /** Wat ervoor betaald is, en op welke bedrijfsdag. */
  aankoop: number
  gekochtOp: number
  km: number
  /** Onderhoudsstaat, 100 is net uit de werkplaats. */
  staat: number
  /** Schade uit aanrijdingen, 0 is geen. */
  schade: number
  /** Tot en met deze bedrijfsdag in de werkplaats. */
  werkplaatsTot?: number
}

/** Een tweedehands aanbieding op de markt van vandaag. */
export interface Aanbod {
  nr: number
  bus: MarktBus
  km: number
  staat: number
  prijs: number
}

export type Rol = 'chauffeur' | 'monteur'

/** Iemand in dienst van het bedrijf. */
export interface Medewerker {
  id: number
  naam: string
  rol: Rol
  /** 0 tot 100; groeit met elke gewerkte dag. */
  ervaring: number
  /** Dagloon in centen. */
  loon: number
  /** 0 tot 100. Onder 25 kan hij vertrekken. */
  tevredenheid: number
  /** Bedrijfsdag van indiensttreding. */
  sinds: number
  /** Ziek tot en met deze bedrijfsdag. */
  ziekTot?: number
  /** Op bijscholing tot en met deze bedrijfsdag; dan werkt hij niet. */
  cursusTot?: number
}

/** Iemand die vandaag solliciteert. */
export interface Sollicitant {
  nr: number
  naam: string
  rol: Rol
  ervaring: number
  loon: number
}

/** Hoe een dag afliep; voor de grafieken op het dashboard. */
export interface DagStaat {
  dag: number
  kas: number
  inkomsten: number
  uitgaven: number
  /**
   * Het exploitatieresultaat: inkomsten min uitgaven zonder investeringen
   * (startkapitaal, bussen kopen en verkopen). Een busaankoop is geen slechte
   * dag; wie dat in één staafje stopt, ziet alleen de aankopen.
   */
  resultaat?: number
  reputatie: number
  bussen: number
  inzetbaar: number
  /** Aandeel van de benodigde omlopen dat met eigen bussen gereden werd, 0 tot 1. */
  dekking: number
  /** Mensen in dienst, en diensten die ingehuurd moesten worden. */
  personeel?: number
  openDiensten?: number
}

export interface Bedrijf {
  naam: string
  opgericht: string
  /** De bedrijfsdag die nu loopt; begint bij 1. */
  dag: number
  /** Kas in centen. */
  kas: number
  /** 0 tot 100. Bepaalt de vergoeding (±10 %) en of een concessie verlengd wordt. */
  reputatie: number
  concessies: Concessie[]
  /** De laatste boekingen, nieuwste eerst. */
  boekingen: Boeking[]
  /** Het eigen wagenpark. Ontbreekt bij een bedrijf van voor de bussen. */
  bussen?: EigenBus[]
  /** Welke tweedehands aanbiedingen van vandaag al verkocht zijn. */
  aanbodWeg?: number[]
  /** Per afgesloten dag de stand; de oudste valt eraf na een jaar. */
  historie?: DagStaat[]
  /** Het personeel. Ontbreekt bij een bedrijf van voor stap 3. */
  personeel?: Medewerker[]
  /** Welke sollicitanten van vandaag al aangenomen zijn. */
  sollicitantWeg?: number[]
  /** Uren die je vandaag zelf op een concessielijn reed; dekken open diensten. */
  zelfUren?: number
  /** Ervaringspunten van het bedrijf; bepalen het niveau. */
  xp?: number
  /** De opleidingen die de eigenaar volgt of volgde. */
  opleidingen?: Array<{ id: OpleidingId; klaarOp: number; gemeld?: boolean }>
}

/* ---- niveaus en opleidingen ---- */

/**
 * Wat een niveau oplevert. Het bedrijf groeit door te rijden en te verdienen;
 * elk niveau maakt het een beetje makkelijker, zoals in de Bus Company
 * Simulator ("level up and unlock new benefits").
 */
export type Voordeel =
  | 'extraSollicitant'
  | 'extraTweedehands'
  | 'goedkoperInschrijven'
  | 'hogereVergoeding'
  | 'goedkoperOnderhoud'
  | 'nogHogereVergoeding'

export const NIVEAUS: Array<{ xp: number; voordeel?: Voordeel }> = [
  { xp: 0 },
  { xp: 300, voordeel: 'extraSollicitant' },
  { xp: 800, voordeel: 'extraTweedehands' },
  { xp: 1600, voordeel: 'goedkoperInschrijven' },
  { xp: 3000, voordeel: 'hogereVergoeding' },
  { xp: 5000, voordeel: 'goedkoperOnderhoud' },
  { xp: 8000, voordeel: 'nogHogereVergoeding' }
]

export function niveauVan(bedrijf: Pick<Bedrijf, 'xp'>): number {
  const xp = bedrijf.xp ?? 0
  let niveau = 1
  NIVEAUS.forEach((n, i) => {
    if (xp >= n.xp) niveau = i + 1
  })
  return niveau
}

export function heeftVoordeel(bedrijf: Pick<Bedrijf, 'xp'>, voordeel: Voordeel): boolean {
  const i = NIVEAUS.findIndex((n) => n.voordeel === voordeel)
  return i >= 0 && niveauVan(bedrijf) >= i + 1
}

/**
 * De opleidingen van de eigenaar. Elk kost geld en een paar bedrijfsdagen, en
 * geeft een taak of een voordeel. Werkplaats en schadeherstel laten je zelf
 * aan de bussen werken, met een minigame -- wie het goed doet, betaalt alleen
 * de onderdelen.
 */
export type OpleidingId = 'werkplaats' | 'schadeherstel' | 'planner' | 'instructeur' | 'onderhandelen'

export const OPLEIDINGEN: Record<OpleidingId, { kosten: number; dagen: number; niveau: number }> = {
  werkplaats: { kosten: 4_000_00, dagen: 3, niveau: 1 },
  schadeherstel: { kosten: 6_000_00, dagen: 4, niveau: 2 },
  planner: { kosten: 8_000_00, dagen: 5, niveau: 3 },
  instructeur: { kosten: 10_000_00, dagen: 5, niveau: 4 },
  onderhandelen: { kosten: 15_000_00, dagen: 6, niveau: 5 }
}

export function opleidingKlaar(bedrijf: Pick<Bedrijf, 'opleidingen' | 'dag'>, id: OpleidingId): boolean {
  return (bedrijf.opleidingen ?? []).some((o) => o.id === id && o.klaarOp <= bedrijf.dag)
}

export function opleidingBezig(bedrijf: Pick<Bedrijf, 'opleidingen' | 'dag'>, id: OpleidingId): number | undefined {
  return (bedrijf.opleidingen ?? []).find((o) => o.id === id && o.klaarOp > bedrijf.dag)?.klaarOp
}

/** Alles wat niveau en opleidingen samen aan de rekenregels veranderen. */
export function bedrijfsfactoren(bedrijf: Bedrijf): {
  vergoeding: number
  inhuur: number
  inschrijving: number
  onderhoud: number
  ervaring: number
  sollicitanten: number
  tweedehands: number
} {
  return {
    vergoeding:
      1 +
      (heeftVoordeel(bedrijf, 'hogereVergoeding') ? 0.03 : 0) +
      (heeftVoordeel(bedrijf, 'nogHogereVergoeding') ? 0.03 : 0) +
      (opleidingKlaar(bedrijf, 'onderhandelen') ? 0.02 : 0),
    inhuur: opleidingKlaar(bedrijf, 'planner') ? 0.97 : 1,
    inschrijving: heeftVoordeel(bedrijf, 'goedkoperInschrijven') ? 0.9 : 1,
    onderhoud: heeftVoordeel(bedrijf, 'goedkoperOnderhoud') ? 0.9 : 1,
    ervaring: opleidingKlaar(bedrijf, 'instructeur') ? 1.5 : 1,
    sollicitanten: REGELS.sollicitantenPerDag + (heeftVoordeel(bedrijf, 'extraSollicitant') ? 1 : 0),
    tweedehands: REGELS.tweedehandsPerDag + (heeftVoordeel(bedrijf, 'extraTweedehands') ? 2 : 0)
  }
}



/** Wat de regels van het bedrijf zijn. Eén plek, zodat een balans niet over de code verspreid raakt. */
export const REGELS = {
  startkapitaal: 150_000_00,
  /** Inschrijven op een concessie: vast bedrag plus per omloop. */
  inschrijvingVast: 2_000_00,
  inschrijvingPerOmloop: 500_00,
  /** Wat de opdrachtgever per dienstregelingsuur betaalt, bij reputatie 50. */
  vergoedingPerUur: 95_00,
  /**
   * Wat een uur kost zolang je geen eigen bussen en personeel hebt: de ritten
   * worden bij een onderaannemer ingekocht. Eigen materieel en eigen mensen
   * maken het later goedkoper; dat is de reden om ze aan te schaffen.
   */
  inhuurPerUur: 86_00,
  /**
   * Hoe die inhuur is opgebouwd. Met een eigen bus betaal je het materieel niet
   * meer aan de onderaannemer maar alleen je eigen brandstof en verzekering; de
   * chauffeur blijft ingehuurd tot er eigen personeel is (stap 3).
   */
  inhuurMaterieelPerUur: 48_00,
  /** Het deel van de inhuur dat de chauffeur is; een eigen chauffeur bespaart dit. */
  inhuurChauffeurPerUur: 38_00,
  /** Een chauffeursdienst: zoveel dienstregelingsuren rijdt één chauffeur per dag. */
  urenPerDienst: 8,
  /** Dagloon: een basis plus per ervaringspunt. */
  loon: {
    chauffeur: { basis: 190_00, perPunt: 80 },
    monteur: { basis: 210_00, perPunt: 90 }
  } as Record<Rol, { basis: number; perPunt: number }>,
  sollicitantenPerDag: 3,
  /** Ontslag kost zoveel dagen loon, en de collega's worden er niet vrolijker van. */
  ontslagDagen: 5,
  ontslagTevredenheid: 3,
  opslagFactor: 1.1,
  ziekteKans: 0.02,
  /** Kans per dag dat iemand onder 25 tevredenheid vertrekt. */
  vertrekKans: 0.1,
  vertrekOnder: 25,
  /** Per monteur: zoveel goedkoper onderhoud en trager slijten, tot het plafond. */
  monteurOnderhoud: 0.15,
  monteurOnderhoudMax: 0.45,
  monteurSlijtage: 0.1,
  monteurSlijtageMax: 0.4,
  /** Bijscholing voor een medewerker. */
  bijscholingKosten: 500_00,
  bijscholingErvaring: 12,
  /** Zelf in de werkplaats: je betaalt alleen dit deel, de onderdelen. */
  zelfOnderdelen: 0.3,
  /** Ervaringspunten van het bedrijf. */
  xpPerTweeUur: 1,
  xpWinstdag: 10,
  xpEigenDienst: 5,
  xpPerHalteOpTijd: 1,
  xpOpleiding: 100,
  eigenBusPerUur: 10_00,
  /** Hoeveel km een bus per dienstregelingsuur rijdt, en hoeveel staat dat kost. */
  kmPerUur: 22,
  slijtagePerUur: 0.4,
  nieuwprijs: { midi: 45_000_00, solo: 60_000_00, geleed: 85_000_00, dubbel: 95_000_00 } as Record<Busvorm, number>,
  /** Na zoveel km is een bus nog maar zijn restwaarde waard. */
  afschrijvingKm: 900_000,
  restwaarde: 0.15,
  /** Wat een handelaar biedt, als deel van de waarde. */
  verkoopFactor: 0.85,
  /** Onder deze staat, of boven deze schade, rijdt een bus niet meer uit. */
  inzetbaarVanafStaat: 25,
  inzetbaarTotSchade: 50,
  onderhoudVast: 600_00,
  onderhoudPerPunt: 25_00,
  reparatiePerPunt: 120_00,
  /** Schade per aanrijding in een dienst die je zelf met een eigen bus reed. */
  schadePerKlap: 12,
  /** Aanbiedingen op de tweedehandsmarkt per dag. */
  tweedehandsPerDag: 4,
  historieBewaard: 365,
  looptijdDagen: 28,
  /** Onder deze reputatie wordt een concessie aan het eind niet verlengd. */
  verlengVanaf: 45,
  /** Voor je eigen rit, per tijdhalte. */
  bonusOpTijd: 2_00,
  malusTeVroeg: 5_00,
  malusTeLaat: 3_00,
  /** Hoeveel boekingen er bewaard blijven. */
  boekingenBewaard: 200
} as const

function boek(bedrijf: Bedrijf, boeking: Omit<Boeking, 'dag'>): Bedrijf {
  return {
    ...bedrijf,
    kas: bedrijf.kas + boeking.bedrag,
    boekingen: [{ ...boeking, dag: bedrijf.dag }, ...bedrijf.boekingen].slice(0, REGELS.boekingenBewaard)
  }
}

/** De vorm van een bus uit zijn naam; OMSI zegt het nergens anders. */
export function vormVanNaam(tekst: string): Busvorm {
  const laag = tekst.toLowerCase()
  if (/gelenk|artic|18c|19c|\bg\b/.test(laag)) return 'geleed'
  if (/doppeldeck|double ?deck|\bdd\b/.test(laag)) return 'dubbel'
  if (/midi|10c|o530k|kurz/.test(laag)) return 'midi'
  return 'solo'
}

/** Wat een bus nu waard is: nieuwprijs, afgeschreven op km, met staat en schade erbij. */
export function waardeVan(bus: Pick<EigenBus, 'vorm' | 'km' | 'staat' | 'schade'>): number {
  const km = Math.max(REGELS.restwaarde, 1 - bus.km / REGELS.afschrijvingKm)
  const staat = 0.6 + 0.4 * (bus.staat / 100)
  const schade = 1 - bus.schade / 200
  return Math.round(REGELS.nieuwprijs[bus.vorm] * km * staat * schade)
}

export function isInzetbaar(bus: EigenBus, dag: number): boolean {
  return (
    (bus.werkplaatsTot === undefined || bus.werkplaatsTot < dag) &&
    bus.staat >= REGELS.inzetbaarVanafStaat &&
    bus.schade < REGELS.inzetbaarTotSchade
  )
}

export function onderhoudskosten(bus: EigenBus, monteurs = 0, bedrijf?: Bedrijf): number {
  const korting = Math.min(REGELS.monteurOnderhoudMax, monteurs * REGELS.monteurOnderhoud)
  const niveau = bedrijf ? bedrijfsfactoren(bedrijf).onderhoud : 1
  return Math.round((REGELS.onderhoudVast + (100 - bus.staat) * REGELS.onderhoudPerPunt) * (1 - korting) * niveau)
}

export function reparatiekosten(bus: EigenBus): number {
  return Math.round(bus.schade * REGELS.reparatiePerPunt)
}

/** Een voorspelbare toevalsreeks: dezelfde dag geeft dezelfde markt, ook na een herstart. */
function reeks(zaad: number): () => number {
  let a = zaad >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * De tweedehandsmarkt van vandaag, uit de bussen die geïnstalleerd zijn.
 *
 * Per bedrijfsdag een paar aanbiedingen, steeds dezelfde voor dezelfde dag --
 * wie de app herstart, krijgt niet ineens een betere markt. Wat vandaag
 * verkocht is, staat in `aanbodWeg`.
 */
export function tweedehandsAanbod(bedrijf: Bedrijf, markt: MarktBus[]): Aanbod[] {
  if (markt.length === 0) return []
  const kans = reeks(bedrijf.dag * 7919 + bedrijf.naam.length)
  const weg = new Set(bedrijf.aanbodWeg ?? [])
  const uit: Aanbod[] = []
  for (let nr = 0; nr < bedrijfsfactoren(bedrijf).tweedehands; nr++) {
    const bus = markt[Math.floor(kans() * markt.length)]
    const km = Math.round((120_000 + kans() * 560_000) / 1000) * 1000
    const staat = Math.round(40 + kans() * 50)
    const prijs = Math.round((waardeVan({ vorm: bus.vorm, km, staat, schade: 0 }) * 1.05) / 100_00) * 100_00
    if (!weg.has(nr)) uit.push({ nr, bus, km, staat, prijs })
  }
  return uit
}

function volgendNummer(bedrijf: Bedrijf): number {
  return Math.max(100, ...(bedrijf.bussen ?? []).map((b) => b.nummer)) + 1
}

export type Kooputslag = { bedrijf: Bedrijf } | { fout: 'kas' | 'weg' }

export function koopNieuw(bedrijf: Bedrijf, bus: MarktBus): Kooputslag {
  const prijs = REGELS.nieuwprijs[bus.vorm]
  if (bedrijf.kas < prijs) return { fout: 'kas' }
  const eigen: EigenBus = {
    nummer: volgendNummer(bedrijf),
    relativePath: bus.relativePath,
    naam: bus.naam,
    vorm: bus.vorm,
    aankoop: prijs,
    gekochtOp: bedrijf.dag,
    km: 0,
    staat: 100,
    schade: 0
  }
  const met = { ...bedrijf, bussen: [...(bedrijf.bussen ?? []), eigen] }
  return { bedrijf: boek(met, { soort: 'bus-koop', bedrag: -prijs, wat: `${eigen.nummer} · ${bus.naam} (nieuw)`, gemeten: false }) }
}

export function koopTweedehands(bedrijf: Bedrijf, aanbod: Aanbod): Kooputslag {
  if ((bedrijf.aanbodWeg ?? []).includes(aanbod.nr)) return { fout: 'weg' }
  if (bedrijf.kas < aanbod.prijs) return { fout: 'kas' }
  const eigen: EigenBus = {
    nummer: volgendNummer(bedrijf),
    relativePath: aanbod.bus.relativePath,
    naam: aanbod.bus.naam,
    vorm: aanbod.bus.vorm,
    aankoop: aanbod.prijs,
    gekochtOp: bedrijf.dag,
    km: aanbod.km,
    staat: aanbod.staat,
    schade: 0
  }
  const met = {
    ...bedrijf,
    bussen: [...(bedrijf.bussen ?? []), eigen],
    aanbodWeg: [...(bedrijf.aanbodWeg ?? []), aanbod.nr]
  }
  return {
    bedrijf: boek(met, {
      soort: 'bus-koop',
      bedrag: -aanbod.prijs,
      wat: `${eigen.nummer} · ${aanbod.bus.naam} (${Math.round(aanbod.km / 1000)}k km)`,
      gemeten: false
    })
  }
}

export function verkoop(bedrijf: Bedrijf, nummer: number): Bedrijf {
  const bus = (bedrijf.bussen ?? []).find((b) => b.nummer === nummer)
  if (!bus) return bedrijf
  const opbrengst = Math.round(waardeVan(bus) * REGELS.verkoopFactor)
  const zonder = { ...bedrijf, bussen: (bedrijf.bussen ?? []).filter((b) => b.nummer !== nummer) }
  return boek(zonder, { soort: 'bus-verkoop', bedrag: opbrengst, wat: `${bus.nummer} · ${bus.naam}`, gemeten: false })
}

/**
 * Naar de werkplaats: onderhoud zet de staat terug op 100, reparatie haalt de
 * schade weg. Allebei een dag: de bus rijdt vandaag niet mee.
 */
export function naarWerkplaats(bedrijf: Bedrijf, nummer: number, wat: 'onderhoud' | 'reparatie'): Kooputslag {
  const bus = (bedrijf.bussen ?? []).find((b) => b.nummer === nummer)
  if (!bus) return { fout: 'weg' }
  const kosten =
    wat === 'onderhoud' ? onderhoudskosten(bus, aanHetWerk(bedrijf, 'monteur').length, bedrijf) : reparatiekosten(bus)
  if (bedrijf.kas < kosten) return { fout: 'kas' }
  const klaar: EigenBus = {
    ...bus,
    staat: wat === 'onderhoud' ? 100 : bus.staat,
    schade: wat === 'reparatie' ? 0 : bus.schade,
    werkplaatsTot: bedrijf.dag
  }
  const met = { ...bedrijf, bussen: (bedrijf.bussen ?? []).map((b) => (b.nummer === nummer ? klaar : b)) }
  return { bedrijf: boek(met, { soort: wat, bedrag: -kosten, wat: `${bus.nummer} · ${bus.naam}`, gemeten: false }) }
}

/** Wat een dag oplevert en kost, en hoe hij gereden wordt. */
export interface Prognose {
  vergoeding: number
  /** Alle kosten van de dag, netto: inhuur min wat eigen bussen en mensen besparen, plus de lonen. */
  kosten: number
  /** Dienstregelingsuren van alle concessies samen. */
  uren: number
  /** Omlopen die tegelijk rijden, en hoeveel eigen bussen er inzetbaar zijn. */
  benodigd: number
  inzetbaar: number
  /** Deel van de uren met eigen bussen, 0 tot 1. */
  dekking: number
  /** Chauffeursdiensten die de dag vraagt, en wie ze rijdt. */
  diensten: number
  eigenDiensten: number
  zelfDiensten: number
  openDiensten: number
  /** Uren met eigen chauffeurs (en jijzelf). */
  chauffeurUren: number
  /** Wat van jouw invaluren vandaag echt een open stuk dekte. */
  zelfUren: number
  materieelBesparing: number
  personeelBesparing: number
  lonen: number
}

/** Wie er vandaag werkt: in dienst en niet ziek. */
export function aanHetWerk(bedrijf: Bedrijf, rol: Rol): Medewerker[] {
  return (bedrijf.personeel ?? []).filter(
    (m) =>
      m.rol === rol &&
      (m.ziekTot === undefined || m.ziekTot < bedrijf.dag) &&
      (m.cursusTot === undefined || m.cursusTot < bedrijf.dag)
  )
}

/**
 * Wat een dag zou opleveren met het wagenpark en het personeel van nu. Het
 * rooster is automatisch: de uren van alle concessies worden in diensten van
 * acht uur geknipt, eigen chauffeurs rijden er zoveel als er werken, jijzelf
 * dekt wat je vandaag reed, en de rest is open en wordt ingehuurd.
 *
 * Het wagenpark is één poel voor alle concessies: een bus rijdt waar hij nodig
 * is. Welke bus welke omloop rijdt (geleed of solo) telt nog niet mee.
 */
export function dagprognose(bedrijf: Bedrijf): Prognose {
  const benodigd = bedrijf.concessies.reduce((som, c) => som + c.omlopen, 0)
  const inzetbaar = (bedrijf.bussen ?? []).filter((b) => isInzetbaar(b, bedrijf.dag)).length
  const dekking = benodigd === 0 ? 0 : Math.min(1, inzetbaar / benodigd)
  /*
   * Op een tiende uur, zoals elke concessie: 8,8 + 11,9 + 3,3 is in drijvende
   * komma 24,000000000000004, en dat werd een vierde dienst die nooit te
   * vullen was -- met "onderbezet" en dalende tevredenheid als gevolg.
   */
  const uren = Math.round(bedrijf.concessies.reduce((som, c) => som + c.urenPerDag, 0) * 10) / 10
  const f = bedrijfsfactoren(bedrijf)
  const vergoeding = bedrijf.concessies.reduce((som, c) => som + dagresultaat(c, bedrijf.reputatie, f).vergoeding, 0)

  /*
   * Het rooster in uren: eerst de eigen chauffeurs, dan wat jij zelf reed, en
   * wat overblijft is open. Andersom -- jouw uren eerst, als hele diensten --
   * zette een half uur invallen een betaalde chauffeur thuis en werd de rest
   * van zijn dienst stil ingehuurd, terwijl het rooster "0 open" liet zien.
   */
  const chauffeurs = aanHetWerk(bedrijf, 'chauffeur').length
  const diensten = Math.ceil(uren / REGELS.urenPerDienst)
  const eigenDiensten = Math.min(diensten, chauffeurs)
  const eigenUren = Math.min(uren, eigenDiensten * REGELS.urenPerDienst)
  const zelfUren = Math.min(uren - eigenUren, bedrijf.zelfUren ?? 0)
  const chauffeurUren = Math.round((eigenUren + zelfUren) * 10) / 10
  const openDiensten = Math.ceil(Math.round((uren - chauffeurUren) * 10) / 10 / REGELS.urenPerDienst)
  const zelfDiensten = Math.max(0, diensten - eigenDiensten - openDiensten)

  const materieelBesparing = Math.round(uren * dekking * (REGELS.inhuurMaterieelPerUur * f.inhuur - REGELS.eigenBusPerUur))
  const personeelBesparing = Math.round(chauffeurUren * REGELS.inhuurChauffeurPerUur * f.inhuur)
  const lonen = (bedrijf.personeel ?? []).reduce((som, m) => som + m.loon, 0)
  const inhuur = bedrijf.concessies.reduce((som, c) => som + dagresultaat(c, bedrijf.reputatie, f).kosten, 0)
  const kosten = inhuur - materieelBesparing - personeelBesparing + lonen
  return {
    vergoeding,
    kosten,
    uren,
    benodigd,
    inzetbaar,
    dekking,
    diensten,
    eigenDiensten,
    zelfDiensten,
    openDiensten,
    chauffeurUren,
    zelfUren,
    materieelBesparing,
    personeelBesparing,
    lonen
  }
}

/* ---- personeel ---- */

const VOORNAMEN = [
  'Anna', 'Ben', 'Carla', 'Dennis', 'Elif', 'Frank', 'Greta', 'Hakan', 'Ines', 'Jan', 'Klaus', 'Lena',
  'Mehmet', 'Nina', 'Olaf', 'Petra', 'Rainer', 'Sanne', 'Tobias', 'Ute', 'Volker', 'Wiebke', 'Yusuf', 'Zoë',
  'Bram', 'Daan', 'Emma', 'Fleur', 'Joost', 'Marieke', 'Pieter', 'Sophie'
]
const ACHTERNAMEN = [
  'Becker', 'de Vries', 'Fischer', 'Hoffmann', 'Jansen', 'Kaya', 'Krüger', 'Meijer', 'Müller', 'Peters',
  'Richter', 'Schmidt', 'Schulz', 'van Dijk', 'Vogel', 'Wagner', 'Weber', 'Wolf', 'Yilmaz', 'Zimmermann',
  'Bakker', 'Visser', 'Smit', 'Mulder'
]

/** Wat de markt voor deze rol en ervaring betaalt, per dag. */
export function marktloon(rol: Rol, ervaring: number): number {
  const l = REGELS.loon[rol]
  return Math.round(l.basis + ervaring * l.perPunt)
}

/**
 * De sollicitanten van vandaag: een paar per bedrijfsdag, steeds dezelfde voor
 * dezelfde dag. Meer beginners dan ervaren krachten, zoals op de echte markt.
 */
export function sollicitanten(bedrijf: Bedrijf): Sollicitant[] {
  const kans = reeks(bedrijf.dag * 104_729 + bedrijf.naam.length * 31 + 7)
  const weg = new Set(bedrijf.sollicitantWeg ?? [])
  const uit: Sollicitant[] = []
  for (let nr = 0; nr < bedrijfsfactoren(bedrijf).sollicitanten; nr++) {
    const naam = `${VOORNAMEN[Math.floor(kans() * VOORNAMEN.length)]} ${ACHTERNAMEN[Math.floor(kans() * ACHTERNAMEN.length)]}`
    const rol: Rol = kans() < 0.7 ? 'chauffeur' : 'monteur'
    const ervaring = Math.round(Math.pow(kans(), 1.5) * 90) + 5
    const loon = Math.round((marktloon(rol, ervaring) * (0.92 + kans() * 0.2)) / 100) * 100
    if (!weg.has(nr)) uit.push({ nr, naam, rol, ervaring, loon })
  }
  return uit
}

export function neemAan(bedrijf: Bedrijf, nr: number): { bedrijf: Bedrijf } | { fout: 'weg' } {
  const s = sollicitanten(bedrijf).find((x) => x.nr === nr)
  if (!s) return { fout: 'weg' }
  const id = Math.max(0, ...(bedrijf.personeel ?? []).map((m) => m.id)) + 1
  const nieuw: Medewerker = {
    id,
    naam: s.naam,
    rol: s.rol,
    ervaring: s.ervaring,
    loon: s.loon,
    // Wie meer krijgt dan de markt biedt, begint wat blijer.
    tevredenheid: doelTevredenheid(s.loon, marktloon(s.rol, s.ervaring), false),
    sinds: bedrijf.dag
  }
  return {
    bedrijf: {
      ...bedrijf,
      personeel: [...(bedrijf.personeel ?? []), nieuw],
      sollicitantWeg: [...(bedrijf.sollicitantWeg ?? []), nr]
    }
  }
}

/** Ontslaan kost een paar dagen loon, en de rest van het personeel voelt het. */
export function ontsla(bedrijf: Bedrijf, id: number): Bedrijf {
  const m = (bedrijf.personeel ?? []).find((x) => x.id === id)
  if (!m) return bedrijf
  const rest = (bedrijf.personeel ?? [])
    .filter((x) => x.id !== id)
    .map((x) => ({ ...x, tevredenheid: Math.max(0, x.tevredenheid - REGELS.ontslagTevredenheid) }))
  return boek(
    { ...bedrijf, personeel: rest },
    { soort: 'ontslag', bedrag: -m.loon * REGELS.ontslagDagen, wat: m.naam, gemeten: false }
  )
}

/** Tien procent opslag, op hele euro's; het maakt meteen wat goed. */
export function geefOpslag(bedrijf: Bedrijf, id: number): Bedrijf {
  return {
    ...bedrijf,
    personeel: (bedrijf.personeel ?? []).map((m) =>
      m.id === id
        ? {
            ...m,
            loon: Math.round((m.loon * REGELS.opslagFactor) / 100) * 100,
            tevredenheid: Math.min(100, m.tevredenheid + 8)
          }
        : m
    )
  }
}

/** Een opleiding beginnen: betalen, en na een paar bedrijfsdagen is hij klaar. */
export function volgOpleiding(
  bedrijf: Bedrijf,
  id: OpleidingId
): { bedrijf: Bedrijf } | { fout: 'kas' | 'niveau' | 'al' } {
  const o = OPLEIDINGEN[id]
  if (!o) return { fout: 'al' }
  if ((bedrijf.opleidingen ?? []).some((x) => x.id === id)) return { fout: 'al' }
  if (niveauVan(bedrijf) < o.niveau) return { fout: 'niveau' }
  if (bedrijf.kas < o.kosten) return { fout: 'kas' }
  const met = { ...bedrijf, opleidingen: [...(bedrijf.opleidingen ?? []), { id, klaarOp: bedrijf.dag + o.dagen }] }
  return { bedrijf: boek(met, { soort: 'opleiding', bedrag: -o.kosten, wat: id, gemeten: false }) }
}

/**
 * Bijscholing voor een medewerker: een dag weg, en daarna meer ervaring. Wie
 * op cursus is, telt vandaag niet mee in het rooster of de werkplaats.
 */
export function stuurOpBijscholing(bedrijf: Bedrijf, id: number): { bedrijf: Bedrijf } | { fout: 'kas' | 'weg' } {
  const m = (bedrijf.personeel ?? []).find((x) => x.id === id)
  if (!m || (m.cursusTot !== undefined && m.cursusTot >= bedrijf.dag) || m.ervaring >= 100) return { fout: 'weg' }
  if (bedrijf.kas < REGELS.bijscholingKosten) return { fout: 'kas' }
  const met = {
    ...bedrijf,
    personeel: (bedrijf.personeel ?? []).map((x) =>
      x.id === id
        ? {
            ...x,
            cursusTot: bedrijf.dag,
            ervaring: Math.min(100, x.ervaring + REGELS.bijscholingErvaring),
            tevredenheid: Math.min(100, x.tevredenheid + 3)
          }
        : x
    )
  }
  return { bedrijf: boek(met, { soort: 'bijscholing', bedrag: -REGELS.bijscholingKosten, wat: m.naam, gemeten: false }) }
}

/**
 * Zelf onderhoud doen, na de werkplaatsopleiding. De minigame geeft een score
 * van 0 tot 1: helemaal goed is de bus weer als nieuw, half goed brengt hem
 * een eind op weg. Je betaalt alleen de onderdelen, en de bus staat een dag.
 */
export function zelfOnderhoud(bedrijf: Bedrijf, nummer: number, score: number): Kooputslag {
  if (!opleidingKlaar(bedrijf, 'werkplaats')) return { fout: 'weg' }
  const bus = (bedrijf.bussen ?? []).find((b) => b.nummer === nummer)
  if (!bus || (bus.werkplaatsTot !== undefined && bus.werkplaatsTot >= bedrijf.dag)) return { fout: 'weg' }
  const s = Math.max(0, Math.min(1, Number.isFinite(score) ? score : 0))
  const kosten = Math.round(onderhoudskosten(bus, 0, bedrijf) * REGELS.zelfOnderdelen)
  if (bedrijf.kas < kosten) return { fout: 'kas' }
  const staat = Math.max(bus.staat, Math.round(bus.staat + (100 - bus.staat) * (0.4 + 0.6 * s)))
  const met = {
    ...bedrijf,
    bussen: (bedrijf.bussen ?? []).map((b) => (b.nummer === nummer ? { ...b, staat, werkplaatsTot: bedrijf.dag } : b))
  }
  return {
    bedrijf: boek(met, { soort: 'onderhoud', bedrag: -kosten, wat: `${bus.nummer} · zelf (${Math.round(s * 100)}%)`, gemeten: false })
  }
}

/** Zelf schade herstellen, na de opleiding schadeherstel; zoals `zelfOnderhoud`. */
export function zelfRepareren(bedrijf: Bedrijf, nummer: number, score: number): Kooputslag {
  if (!opleidingKlaar(bedrijf, 'schadeherstel')) return { fout: 'weg' }
  const bus = (bedrijf.bussen ?? []).find((b) => b.nummer === nummer)
  if (!bus || bus.schade <= 0 || (bus.werkplaatsTot !== undefined && bus.werkplaatsTot >= bedrijf.dag)) return { fout: 'weg' }
  const s = Math.max(0, Math.min(1, Number.isFinite(score) ? score : 0))
  const kosten = Math.round(reparatiekosten(bus) * REGELS.zelfOnderdelen)
  if (bedrijf.kas < kosten) return { fout: 'kas' }
  const schade = Math.round(bus.schade * (1 - (0.3 + 0.7 * s)))
  const met = {
    ...bedrijf,
    bussen: (bedrijf.bussen ?? []).map((b) => (b.nummer === nummer ? { ...b, schade, werkplaatsTot: bedrijf.dag } : b))
  }
  return {
    bedrijf: boek(met, { soort: 'reparatie', bedrag: -kosten, wat: `${bus.nummer} · zelf (${Math.round(s * 100)}%)`, gemeten: false })
  }
}

/**
 * Waar de tevredenheid naartoe beweegt: 60 bij marktloon, hoger bij meer
 * betalen, lager als chauffeurs het werk niet rond krijgen (open diensten).
 */
function doelTevredenheid(loon: number, markt: number, onderbezet: boolean): number {
  const doel = 60 + 150 * (loon / markt - 1) - (onderbezet ? 8 : 0)
  return Math.round(Math.max(0, Math.min(100, doel)))
}

/**
 * Het personeel na een werkdag: ervaring erbij voor wie werkte, tevredenheid
 * die naar zijn doel beweegt, ziekte, en wie te ontevreden is kan vertrekken.
 * Steeds dezelfde uitkomst voor dezelfde dag, ook na een herstart.
 */
function personeelNaDag(bedrijf: Bedrijf, prognose: Prognose): { personeel: Medewerker[]; vertrokken: Medewerker[]; reputatie: number } {
  const dag = bedrijf.dag
  const werkend = new Set(
    aanHetWerk(bedrijf, 'chauffeur')
      .slice(0, prognose.eigenDiensten)
      .map((m) => m.id)
  )
  for (const m of aanHetWerk(bedrijf, 'monteur')) werkend.add(m.id)
  const onderbezet = prognose.openDiensten > 0

  const personeel: Medewerker[] = []
  const vertrokken: Medewerker[] = []
  for (const m of bedrijf.personeel ?? []) {
    const kans = reeks(dag * 7907 + m.id * 131)
    let volgende: Medewerker = { ...m }
    const groei = (m.rol === 'chauffeur' ? 0.4 : 0.3) * bedrijfsfactoren(bedrijf).ervaring
    if (werkend.has(m.id)) volgende.ervaring = Math.min(100, Math.round((m.ervaring + groei) * 10) / 10)
    const doel = doelTevredenheid(m.loon, marktloon(m.rol, m.ervaring), onderbezet && m.rol === 'chauffeur')
    volgende.tevredenheid = Math.round((m.tevredenheid + (doel - m.tevredenheid) * 0.15) * 10) / 10
    const ziek = m.ziekTot !== undefined && m.ziekTot >= dag
    if (!ziek && kans() < REGELS.ziekteKans) volgende.ziekTot = dag + 1 + Math.floor(kans() * 3)
    else if (m.ziekTot !== undefined && m.ziekTot <= dag) volgende = { ...volgende, ziekTot: undefined }
    if (volgende.tevredenheid < REGELS.vertrekOnder && kans() < REGELS.vertrekKans) vertrokken.push(volgende)
    else personeel.push(volgende)
  }

  /*
   * Ervaren chauffeurs maken je naam, beginners kosten hem een beetje -- naar
   * rato van hoeveel van de uren je eigen mensen reden. Eén punt tegelijk, met
   * een kans, zodat de reputatie niet elke dag vanzelf oploopt.
   */
  let reputatie = bedrijf.reputatie
  const rijders = (bedrijf.personeel ?? []).filter((m) => werkend.has(m.id) && m.rol === 'chauffeur')
  if (rijders.length > 0 && prognose.uren > 0) {
    const gemiddeld = rijders.reduce((som, m) => som + m.ervaring, 0) / rijders.length
    const aandeel = Math.min(1, (rijders.length * REGELS.urenPerDienst) / prognose.uren)
    const x = ((gemiddeld - 50) / 50) * aandeel
    if (reeks(dag * 613 + 17)() < Math.abs(x) * 0.3) reputatie = Math.max(0, Math.min(100, reputatie + Math.sign(x)))
  }
  return { personeel, vertrokken, reputatie }
}

export function richtBedrijfOp(naam: string, nu = new Date()): Bedrijf {
  const bedrijf: Bedrijf = {
    naam: naam.trim() || 'Mijn busbedrijf',
    opgericht: nu.toISOString(),
    dag: 1,
    kas: 0,
    reputatie: 50,
    concessies: [],
    boekingen: [],
    bussen: [],
    aanbodWeg: [],
    historie: [],
    personeel: [],
    sollicitantWeg: [],
    zelfUren: 0
  }
  return boek(bedrijf, { soort: 'oprichting', bedrag: REGELS.startkapitaal, wat: 'Startkapitaal', gemeten: false })
}

/** Dienstregelingsuren per dag van een lijn: elk ritvertrek maal de gemiddelde rittijd. */
export function urenVanLijn(lijn: LineSummary): number {
  return Math.round(((lijn.trips * lijn.averageMinutes) / 60) * 10) / 10
}

export function inschrijfkosten(lijn: Pick<LineSummary, 'tours'>, bedrijf?: Bedrijf): number {
  const factor = bedrijf ? bedrijfsfactoren(bedrijf).inschrijving : 1
  return Math.round((REGELS.inschrijvingVast + lijn.tours * REGELS.inschrijvingPerOmloop) * factor)
}

/** Vergoeding per uur bij deze reputatie: van −10 % bij 0 tot +10 % bij 100. */
export function vergoedingPerUur(reputatie: number): number {
  const factor = 1 + (Math.max(0, Math.min(100, reputatie)) - 50) / 500
  return Math.round(REGELS.vergoedingPerUur * factor)
}

/** Wat een concessie per dag oplevert en kost, volgens het rekenmodel. */
export function dagresultaat(
  concessie: Pick<Concessie, 'urenPerDag'>,
  reputatie: number,
  /** Niveau en opleidingen; zie `bedrijfsfactoren`. Zonder: de gewone regels. */
  factoren: { vergoeding: number; inhuur: number } = { vergoeding: 1, inhuur: 1 }
): { vergoeding: number; kosten: number } {
  return {
    vergoeding: Math.round(concessie.urenPerDag * vergoedingPerUur(reputatie) * factoren.vergoeding),
    kosten: Math.round(concessie.urenPerDag * REGELS.inhuurPerUur * factoren.inhuur)
  }
}

export function heeftConcessie(bedrijf: Bedrijf | undefined, mapFolder: string, lineFile: string): boolean {
  return Boolean(
    bedrijf?.concessies.some(
      (c) => c.mapFolder === mapFolder && c.lineFile.toLowerCase() === lineFile.toLowerCase()
    )
  )
}

export type Inschrijfuitslag = { bedrijf: Bedrijf } | { fout: 'kas' | 'al' }

/** Inschrijven op een lijn: betalen, en de concessie loopt vanaf vandaag. */
export function schrijfIn(
  bedrijf: Bedrijf,
  kaart: { folder: string; name: string },
  lijn: LineSummary
): Inschrijfuitslag {
  if (heeftConcessie(bedrijf, kaart.folder, lijn.lineFile)) return { fout: 'al' }
  const kosten = inschrijfkosten(lijn, bedrijf)
  if (bedrijf.kas < kosten) return { fout: 'kas' }
  const concessie: Concessie = {
    mapFolder: kaart.folder,
    mapName: kaart.name,
    lineFile: lijn.lineFile,
    lineNumbers: lijn.lineNumbers,
    omlopen: lijn.tours,
    ritten: lijn.trips,
    urenPerDag: urenVanLijn(lijn),
    vanaf: bedrijf.dag,
    tot: bedrijf.dag + REGELS.looptijdDagen - 1
  }
  const met = { ...bedrijf, concessies: [...bedrijf.concessies, concessie] }
  return {
    bedrijf: boek(met, {
      soort: 'inschrijving',
      bedrag: -kosten,
      wat: `${lijnnaam(concessie)} · ${concessie.mapName}`,
      gemeten: false
    })
  }
}

/** Een concessie teruggeven. Geen geld terug: de inschrijving is betaald. */
export function zegOp(bedrijf: Bedrijf, mapFolder: string, lineFile: string): Bedrijf {
  return {
    ...bedrijf,
    concessies: bedrijf.concessies.filter((c) => !(c.mapFolder === mapFolder && c.lineFile === lineFile))
  }
}

export function lijnnaam(c: Pick<Concessie, 'lineNumbers' | 'lineFile'>): string {
  return c.lineNumbers.length > 0 ? c.lineNumbers.join('/') : c.lineFile
}

/**
 * Een zelf gereden dienst in de boeken.
 *
 * Telt alleen voor de ritten op lijnen waar het bedrijf een concessie heeft.
 * Zonder rittenstaat (geen dienstregeling uit het menu, of een andere OMSI-
 * versie) is er niets gemeten, en dan boekt de dienst niets: de omlopen worden
 * aan het eind van de dag toch al gerekend.
 *
 * De reputatie beweegt met het aandeel tijdhaltes op tijd: helemaal goed geeft
 * +2, helemaal fout −4. Klein per dienst, want één rit maakt geen naam.
 */
export function boekEigenDienst(
  bedrijf: Bedrijf,
  duty: Duty,
  staat: Rittenstaat | undefined,
  /** De bus waarmee gereden is; is dat een eigen bus, dan krijgt die de schade. */
  busPad?: string,
  /** Hoeveel haltes er gehaald zijn, zoals het loon het telt (`partialPay`). */
  stopsDone?: number
): Bedrijf {
  /*
   * Invallen: wat je zelf op een concessielijn reed, dekt vandaag een open
   * dienst -- ook zonder rittenstaat, want gereden is gereden. Alleen het
   * oordeel over stiptheid vraagt een meting.
   *
   * Naar rato van de gehaalde haltes, net als het loon: een dienst starten en
   * meteen afronden dekte eerst acht uur, en zo waren alle open diensten
   * gratis te vullen. Zonder telling (oudere plugin) telt hij voor vol.
   */
  const deel =
    stopsDone === undefined || !(duty.totalStops > 0) ? 1 : Math.min(1, Math.max(0, stopsDone / duty.totalStops))
  const zelf =
    duty.legs
      .filter((leg) => heeftConcessie(bedrijf, duty.mapFolder, leg.lineFile))
      .reduce((som, leg) => som + leg.minutes / 60, 0) * deel
  if (zelf > 0) bedrijf = { ...bedrijf, zelfUren: Math.round(((bedrijf.zelfUren ?? 0) + zelf) * 10) / 10 }
  if (!staat) return bedrijf
  bedrijf = schadeVanDienst(bedrijf, staat, busPad)
  let opTijd = 0
  let vroeg = 0
  let laat = 0
  let telt = false
  duty.legs.forEach((leg, index) => {
    if (!heeftConcessie(bedrijf, duty.mapFolder, leg.lineFile)) return
    telt = true
    for (const halte of staat.ritten[index]?.haltes ?? []) {
      if (halte.oordeel === 'goed') opTijd++
      else if (halte.oordeel === 'vroeg') vroeg++
      else if (halte.oordeel === 'laat') laat++
    }
  })
  const beoordeeld = opTijd + vroeg + laat
  if (!telt || beoordeeld === 0) return bedrijf

  const bedrag = opTijd * REGELS.bonusOpTijd - vroeg * REGELS.malusTeVroeg - laat * REGELS.malusTeLaat
  const aandeel = opTijd / beoordeeld
  const stap = aandeel >= 0.9 ? 2 : aandeel >= 0.7 ? 1 : aandeel >= 0.5 ? 0 : aandeel >= 0.3 ? -2 : -4
  const lijnen = [...new Set(duty.legs.filter((l) => heeftConcessie(bedrijf, duty.mapFolder, l.lineFile)).map((l) => l.lineNumber))]
  const geboekt = boek(bedrijf, {
    soort: 'eigen-dienst',
    bedrag,
    wat: `${lijnen.join('/')} · ${opTijd} op tijd, ${vroeg} te vroeg, ${laat} te laat`,
    gemeten: true
  })
  return {
    ...geboekt,
    reputatie: Math.max(0, Math.min(100, geboekt.reputatie + stap)),
    xp: (geboekt.xp ?? 0) + REGELS.xpEigenDienst + opTijd * REGELS.xpPerHalteOpTijd
  }
}

/**
 * Aanrijdingen in een dienst die je zelf reed, op de eigen bus waarmee je reed.
 * Staan er meer bussen van hetzelfde type, dan de eerste die inzetbaar is.
 */
function schadeVanDienst(bedrijf: Bedrijf, staat: Rittenstaat, busPad?: string): Bedrijf {
  if (!busPad || !bedrijf.bussen?.length) return bedrijf
  const klappen = staat.ritten.reduce(
    (som, rit) => som + rit.haltes.reduce((s, h) => s + (h.klappen ?? 0), 0),
    0
  )
  if (klappen === 0) return bedrijf
  const pad = busPad.toLowerCase()
  const bus =
    bedrijf.bussen.find((b) => b.relativePath.toLowerCase() === pad && isInzetbaar(b, bedrijf.dag)) ??
    bedrijf.bussen.find((b) => b.relativePath.toLowerCase() === pad)
  if (!bus) return bedrijf
  return {
    ...bedrijf,
    bussen: bedrijf.bussen.map((b) =>
      b.nummer === bus.nummer ? { ...b, schade: Math.min(100, b.schade + klappen * REGELS.schadePerKlap) } : b
    )
  }
}

/**
 * De dag afsluiten: per concessie de vergoeding, de kosten van de ritten --
 * met eigen bussen goedkoper dan ingehuurd -- de slijtage van het wagenpark,
 * en concessies die vandaag aflopen verlengen of laten vervallen.
 */
export function sluitDagAf(bedrijf: Bedrijf): Bedrijf {
  const prognose = dagprognose(bedrijf)
  let uit = bedrijf
  const factoren = bedrijfsfactoren(bedrijf)
  for (const c of bedrijf.concessies) {
    const { vergoeding, kosten } = dagresultaat(c, bedrijf.reputatie, factoren)
    const naam = `${lijnnaam(c)} · ${c.mapName}`
    uit = boek(uit, { soort: 'vergoeding', bedrag: vergoeding, wat: naam, gemeten: false })
    uit = boek(uit, { soort: 'exploitatie', bedrag: -kosten, wat: naam, gemeten: false })
  }
  // Wat eigen bussen besparen op de inhuur, en wat ze zelf kosten.
  const eigenUren = prognose.uren * prognose.dekking
  if (prognose.materieelBesparing > 0) {
    uit = boek(uit, {
      soort: 'eigen-materieel',
      bedrag: prognose.materieelBesparing,
      wat: `${prognose.inzetbaar} bussen · ${Math.round(eigenUren)} u`,
      gemeten: false
    })
  }
  // Wat eigen chauffeurs (en jij) besparen, en wat het personeel kost.
  if (prognose.personeelBesparing > 0) {
    uit = boek(uit, {
      soort: 'eigen-personeel',
      bedrag: prognose.personeelBesparing,
      wat: `${prognose.eigenDiensten + prognose.zelfDiensten} diensten · ${Math.round(prognose.chauffeurUren)} u`,
      gemeten: false
    })
  }
  if (prognose.lonen > 0) {
    uit = boek(uit, {
      soort: 'loon',
      bedrag: -prognose.lonen,
      wat: `${(uit.personeel ?? []).length} medewerkers`,
      gemeten: false
    })
  }
  const naDag = personeelNaDag(uit, prognose)
  for (const m of naDag.vertrokken) {
    uit = boek(uit, { soort: 'vertrek', bedrag: 0, wat: m.naam, gemeten: false })
  }
  uit = { ...uit, personeel: naDag.personeel, reputatie: naDag.reputatie }

  // Slijtage: de inzetbare bussen delen de uren die ze reden; monteurs remmen het af.
  const inzet = (uit.bussen ?? []).filter((b) => isInzetbaar(b, uit.dag))
  const urenPerBus = inzet.length > 0 ? Math.min(eigenUren / inzet.length, 20) : 0
  const remming = Math.min(REGELS.monteurSlijtageMax, aanHetWerk(bedrijf, 'monteur').length * REGELS.monteurSlijtage)
  const bussen = (uit.bussen ?? []).map((b) =>
    inzet.includes(b)
      ? {
          ...b,
          km: b.km + Math.round(urenPerBus * REGELS.kmPerUur),
          staat: Math.max(0, Math.round((b.staat - urenPerBus * REGELS.slijtagePerUur * (1 - remming)) * 10) / 10)
        }
      : b
  )
  uit = { ...uit, bussen }

  const blijven: Concessie[] = []
  for (const c of uit.concessies) {
    if (c.tot > uit.dag) {
      blijven.push(c)
    } else if (uit.reputatie >= REGELS.verlengVanaf) {
      blijven.push({ ...c, tot: c.tot + REGELS.looptijdDagen })
      uit = boek(uit, { soort: 'verlenging', bedrag: 0, wat: `${lijnnaam(c)} · ${c.mapName}`, gemeten: false })
    } else {
      uit = boek(uit, { soort: 'vervallen', bedrag: 0, wat: `${lijnnaam(c)} · ${c.mapName}`, gemeten: false })
    }
  }
  const inkomsten = uit.boekingen
    .filter((b) => b.dag === bedrijf.dag && b.bedrag > 0)
    .reduce((som, b) => som + b.bedrag, 0)
  const uitgaven = uit.boekingen
    .filter((b) => b.dag === bedrijf.dag && b.bedrag < 0)
    .reduce((som, b) => som - b.bedrag, 0)
  const investering = new Set<BoekingSoort>(['oprichting', 'bus-koop', 'bus-verkoop'])
  const resultaat = uit.boekingen
    .filter((b) => b.dag === bedrijf.dag && !investering.has(b.soort))
    .reduce((som, b) => som + b.bedrag, 0)
  const dagstaat: DagStaat = {
    dag: bedrijf.dag,
    kas: uit.kas,
    inkomsten,
    uitgaven,
    resultaat,
    reputatie: uit.reputatie,
    bussen: bussen.length,
    inzetbaar: prognose.inzetbaar,
    dekking: prognose.dekking,
    personeel: naDag.personeel.length,
    openDiensten: prognose.openDiensten
  }
  /*
   * Ervaringspunten voor de dag: voor elke twee dienstregelingsuren één, en
   * tien extra voor een dag met winst. Opleidingen die morgen klaar zijn,
   * worden gemeld en geven hun punten; een nieuw niveau komt in de boeken.
   */
  const niveauVoor = niveauVan(uit)
  let xp = (uit.xp ?? 0) + Math.floor(prognose.uren / 2) * REGELS.xpPerTweeUur + (resultaat > 0 ? REGELS.xpWinstdag : 0)
  const opleidingen = (uit.opleidingen ?? []).map((o) => {
    if (o.gemeld || o.klaarOp > uit.dag + 1) return o
    xp += REGELS.xpOpleiding
    uit = boek(uit, { soort: 'opleiding', bedrag: 0, wat: `${o.id} ✓`, gemeten: false })
    return { ...o, gemeld: true }
  })
  const niveauNa = niveauVan({ xp })
  if (niveauNa > niveauVoor) uit = boek(uit, { soort: 'niveau', bedrag: 0, wat: `${niveauNa}`, gemeten: false })
  const personeelNa = (uit.personeel ?? []).map((m) =>
    m.cursusTot !== undefined && m.cursusTot <= uit.dag ? { ...m, cursusTot: undefined } : m
  )

  return {
    ...uit,
    xp,
    opleidingen,
    personeel: personeelNa,
    concessies: blijven,
    dag: uit.dag + 1,
    aanbodWeg: [],
    sollicitantWeg: [],
    zelfUren: 0,
    historie: [...(uit.historie ?? []), dagstaat].slice(-REGELS.historieBewaard)
  }
}
