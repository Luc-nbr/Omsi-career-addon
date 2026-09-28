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
}

/** Wat de regels van het bedrijf zijn. Eén plek, zodat een balans niet over de code verspreid raakt. */
export const REGELS = {
  startkapitaal: 50_000_00,
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

export function richtBedrijfOp(naam: string, nu = new Date()): Bedrijf {
  const bedrijf: Bedrijf = {
    naam: naam.trim() || 'Mijn busbedrijf',
    opgericht: nu.toISOString(),
    dag: 1,
    kas: 0,
    reputatie: 50,
    concessies: [],
    boekingen: []
  }
  return boek(bedrijf, { soort: 'oprichting', bedrag: REGELS.startkapitaal, wat: 'Startkapitaal', gemeten: false })
}

/** Dienstregelingsuren per dag van een lijn: elk ritvertrek maal de gemiddelde rittijd. */
export function urenVanLijn(lijn: LineSummary): number {
  return Math.round(((lijn.trips * lijn.averageMinutes) / 60) * 10) / 10
}

export function inschrijfkosten(lijn: Pick<LineSummary, 'tours'>): number {
  return REGELS.inschrijvingVast + lijn.tours * REGELS.inschrijvingPerOmloop
}

/** Vergoeding per uur bij deze reputatie: van −10 % bij 0 tot +10 % bij 100. */
export function vergoedingPerUur(reputatie: number): number {
  const factor = 1 + (Math.max(0, Math.min(100, reputatie)) - 50) / 500
  return Math.round(REGELS.vergoedingPerUur * factor)
}

/** Wat een concessie per dag oplevert en kost, volgens het rekenmodel. */
export function dagresultaat(concessie: Pick<Concessie, 'urenPerDag'>, reputatie: number): { vergoeding: number; kosten: number } {
  return {
    vergoeding: Math.round(concessie.urenPerDag * vergoedingPerUur(reputatie)),
    kosten: Math.round(concessie.urenPerDag * REGELS.inhuurPerUur)
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
  const kosten = inschrijfkosten(lijn)
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
export function boekEigenDienst(bedrijf: Bedrijf, duty: Duty, staat: Rittenstaat | undefined): Bedrijf {
  if (!staat) return bedrijf
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
  return { ...geboekt, reputatie: Math.max(0, Math.min(100, geboekt.reputatie + stap)) }
}

/**
 * De dag afsluiten: per concessie de vergoeding en de kosten van de dag, en
 * concessies die vandaag aflopen verlengen of laten vervallen.
 */
export function sluitDagAf(bedrijf: Bedrijf): Bedrijf {
  let uit = bedrijf
  for (const c of bedrijf.concessies) {
    const { vergoeding, kosten } = dagresultaat(c, bedrijf.reputatie)
    const naam = `${lijnnaam(c)} · ${c.mapName}`
    uit = boek(uit, { soort: 'vergoeding', bedrag: vergoeding, wat: naam, gemeten: false })
    uit = boek(uit, { soort: 'exploitatie', bedrag: -kosten, wat: naam, gemeten: false })
  }

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
  return { ...uit, concessies: blijven, dag: uit.dag + 1 }
}
