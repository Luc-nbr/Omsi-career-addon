/*
 * HET CONTRACT VAN DE VOORVALLEN
 *
 * B7 uit design/ontwerpen/voorvallen-en-controleurs.md (§3.11). Een voorval is
 * iets dat midden in de rit gebeurt -- een rolstoel bij de volgende halte, een
 * reiziger die onwel wordt, een aanrijding -- met een opdracht, een tijdvenster
 * en een meting.
 *
 * WAAROM HIER, EN PUUR
 * Een voorval gebeurt lokaal: de meetlus in het hoofdproces volgt het, en de
 * uitslag gaat mee in het logboek (`Onderweg.voorvallen` in core/onderweg.ts).
 * Maar het busbedrijf in de cloudtak boekt diezelfde uitslag in de kas, de
 * reputatie en de ervaring (B10), en geeft de AI-chauffeurs straks ook
 * voorvallen. Beide takken moeten dus precies hetzelfde verstaan onder een
 * uitslag. Daarom staan de typen hier: geen Node, geen Electron, geen
 * bestanden, en niet de motor. Alleen wat vastligt, plus drie pure hulpjes:
 * een uitslag nakijken die uit een bestand komt, uitslagen optellen, en de
 * catalogus.
 *
 * De motor zelf -- `voorvallenVoor(duty, zaad, instelling, profiel)` en
 * `volgVoorval(stand, meting)` -- komt in ronde 2 in core/onderweg.ts, en
 * gebruikt deze typen. Wie hier iets verandert, verandert het contract: hoog
 * dan `VOORVAL_CONTRACT` op en licht de cloudtak in.
 *
 * Bedragen zijn euro's, zoals het loon in career.ts en `Onderweg.bedrag`. Het
 * bedrijf rekent in hele centen: `Math.round(bedrag * 100)`, één keer, bij het
 * boeken.
 */

/** De versie van dit contract. Omhoog bij elke wijziging die de cloud raakt. */
export const VOORVAL_CONTRACT = 1

/** Per categorie aan of uit te zetten (§3.3). */
export type VoorvalCategorie = 'reizigers' | 'verkeer' | 'techniek' | 'weer' | 'dienst'

/**
 * Hoe een voorval komt (§3.12): het overkomt je (V), het is een verzoek dat je
 * kunt weigeren (Z), het is het gevolg van iets wat je deed of meemaakte (R),
 * of het ligt vast bij de start (S).
 */
export type VoorvalAard = 'overkomt' | 'verzoek' | 'reactief' | 'start'

/** De voorvallen uit de catalogus (§3.12); V8 en V24 zijn vervallen. */
export type VoorvalSoort =
  | 'rolstoel'
  | 'kinderwagen'
  | 'onwel'
  | 'ruzie'
  | 'gevallen'
  | 'laatkomer'
  | 'eregast'
  | 'voorinstappen'
  | 'kaartcontrole'
  | 'uitstappers'
  | 'vollehalte'
  | 'aansluiting'
  | 'gevaar'
  | 'zone30'
  | 'schoolzone'
  | 'inlopen'
  | 'vanRoute'
  | 'omleiding'
  | 'mobieleFlitser'
  | 'aanrijding'
  | 'storing'
  | 'lamp'
  | 'tank'
  | 'accu'
  | 'vuil'
  | 'hitte'
  | 'winter'
  | 'zicht'
  | 'keertijd'
  | 'remise'

/**
 * Per soort het nummer in het ontwerp, de categorie en de aard. Het nummer is
 * er om een uitslag in een logboek terug te vinden in §3.12, niet om op te
 * rekenen.
 */
export const VOORVAL_CATALOGUS: Readonly<
  Record<VoorvalSoort, { nr: string; categorie: VoorvalCategorie; aard: VoorvalAard }>
> = {
  rolstoel: { nr: 'V1', categorie: 'reizigers', aard: 'overkomt' },
  kinderwagen: { nr: 'V2', categorie: 'reizigers', aard: 'overkomt' },
  onwel: { nr: 'V3', categorie: 'reizigers', aard: 'overkomt' },
  ruzie: { nr: 'V4', categorie: 'reizigers', aard: 'overkomt' },
  gevallen: { nr: 'V5', categorie: 'reizigers', aard: 'reactief' },
  laatkomer: { nr: 'V6', categorie: 'reizigers', aard: 'reactief' },
  eregast: { nr: 'V7', categorie: 'reizigers', aard: 'verzoek' },
  voorinstappen: { nr: 'V9', categorie: 'reizigers', aard: 'start' },
  kaartcontrole: { nr: 'V10', categorie: 'reizigers', aard: 'overkomt' },
  uitstappers: { nr: 'V11', categorie: 'reizigers', aard: 'verzoek' },
  vollehalte: { nr: 'V12', categorie: 'reizigers', aard: 'overkomt' },
  aansluiting: { nr: 'V13', categorie: 'verkeer', aard: 'verzoek' },
  gevaar: { nr: 'V14', categorie: 'verkeer', aard: 'overkomt' },
  zone30: { nr: 'V15', categorie: 'verkeer', aard: 'overkomt' },
  schoolzone: { nr: 'V16', categorie: 'verkeer', aard: 'start' },
  inlopen: { nr: 'V17', categorie: 'verkeer', aard: 'reactief' },
  vanRoute: { nr: 'V18', categorie: 'verkeer', aard: 'reactief' },
  omleiding: { nr: 'V19', categorie: 'verkeer', aard: 'start' },
  mobieleFlitser: { nr: 'V20', categorie: 'verkeer', aard: 'overkomt' },
  aanrijding: { nr: 'V21', categorie: 'techniek', aard: 'reactief' },
  storing: { nr: 'V22', categorie: 'techniek', aard: 'reactief' },
  lamp: { nr: 'V23', categorie: 'techniek', aard: 'reactief' },
  tank: { nr: 'V25', categorie: 'techniek', aard: 'start' },
  accu: { nr: 'V26', categorie: 'techniek', aard: 'start' },
  vuil: { nr: 'V27', categorie: 'techniek', aard: 'start' },
  hitte: { nr: 'V28', categorie: 'weer', aard: 'start' },
  winter: { nr: 'V29', categorie: 'weer', aard: 'start' },
  zicht: { nr: 'V30', categorie: 'weer', aard: 'start' },
  keertijd: { nr: 'V31', categorie: 'dienst', aard: 'overkomt' },
  remise: { nr: 'V32', categorie: 'dienst', aard: 'overkomt' }
}

export const VOORVAL_SOORTEN = Object.keys(VOORVAL_CATALOGUS) as VoorvalSoort[]

export function isVoorvalSoort(waarde: unknown): waarde is VoorvalSoort {
  return typeof waarde === 'string' && Object.hasOwn(VOORVAL_CATALOGUS, waarde)
}

/**
 * Hoe de tijd die een voorval kost verschoond wordt (§3.5): de gemeten
 * stilstand binnen het venster, of de verloren tijd door langzaam rijden
 * (afstand in de zone maal 1/v_eis - 1/v_ref). Allebei hoogstens het plafond.
 */
export type VerschoonWijze = 'stilstand' | 'verloren'

/**
 * Eén meetbare stap van een voorval: stilstaan, een deur open, knielen, de
 * oprijplaat, alarmlichten. Een stap die deze bus niet kan meten, valt weg en
 * telt niet (§3.8); dan is `meetbaar` onwaar en krijgt de uitslag `null`.
 */
export interface VoorvalStap {
  /** Uniek binnen het voorval, bijvoorbeeld 'stil', 'deur', 'knielen'. */
  id: string
  meetbaar: boolean
  /** Bij de moeilijkheid Rustig mag deze stap ontbreken (knielen, oprijplaat). */
  optioneel?: boolean
}

/** Waar een voorval speelt. Rit en halte tellen zoals in de rittenstaat. */
export type VoorvalPlek =
  | { soort: 'halte'; rit: number; halte: number }
  | { soort: 'rit'; rit: number; van?: number; tot?: number }
  /** Een stuk weg: kaartcoördinaten zoals `VehiclePosition` ze kent, in meters. */
  | { soort: 'zone'; x: number; y: number; straalM: number }
  | { soort: 'dienst' }

/** De knoppen op de voorvalkaart (§3.4). */
export type VoorvalKnop = '112' | 'politie' | 'melden' | 'ja' | 'nee'

/** Een voorval zoals de motor het plant of laat overkomen. */
export interface Voorval {
  /** Uniek binnen de dienst; uit het zaad, dus na een herstart dezelfde. */
  id: string
  soort: VoorvalSoort
  /** De klok van het spel in minuten, over middernacht doorgeteld (`Meting.klok`). */
  start: number
  stappen: VoorvalStap[]
  /** Hoe lang de chauffeur heeft, in seconden van de klok van OMSI. */
  vensterS: number
  /** Hoogstens zoveel seconden verschoning, en op welke manier. */
  verschoonMaxS: number
  verschoonWijze: VerschoonWijze
  plek: VoorvalPlek
  /** Hoeveel haltes van tevoren het gemeld wordt; 0 alleen bij een echt signaal in de bus. */
  aankondiging?: number
  /** Welke knoppen de kaart toont; bij een verzoek (Z) altijd ja en nee. */
  knoppen?: VoorvalKnop[]
}

/** Gehaald, niet gehaald, of niet gemeten. Niet gemeten telt niet: niet voor en niet tegen. */
export type StapUitkomst = boolean | null

/**
 * Hoe een voorval afliep. DIT IS HET CONTRACT MET DE CLOUD: het logboek bewaart
 * het (`Onderweg.voorvallen`), en het bedrijf boekt het (kas, reputatie, XP).
 */
export interface VoorvalUitslag {
  id: string
  soort: VoorvalSoort
  /** Wanneer het begon, zoals `Voorval.start`. */
  start: number
  /** Alleen de stappen die er waren; een stap die deze bus niet meet staat er met `null`. */
  stappen: Array<{ id: string; gehaald: StapUitkomst }>
  /**
   * - `goed`: alle gemeten stappen gehaald;
   * - `deels`: een deel, het bedrag naar het deel dat gehaald is (§3.6);
   * - `mis`: niet gereageerd, niets gehaald;
   * - `geweigerd`: een verzoek (Z) met nee beantwoord; kost niets;
   * - `niet-gemeten`: er viel niets te meten, en dan telt het niet.
   */
  afloop: 'goed' | 'deels' | 'mis' | 'geweigerd' | 'niet-gemeten'
  /** Seconden die van de vertraging af gaan in het oordeel van de rittenstaat (§3.5). */
  verschoondS: number
  /** Euro's bij het loon (negatief: eraf). */
  bedrag: number
  /** Voor het bedrijf (§3.6); de loopbaan kijkt er niet naar. */
  reputatie: number
  xp: number
  /** Doorgereden na een aanrijding, gereden met open deur bij een rolstoel: een aantekening. */
  veiligheidsfout?: boolean
  /** Geoefend in vrij rijden: geen geld, geen badges (§3.14). */
  oefenen?: boolean
}

/**
 * Wat de telefoon van een lopend voorval ziet: de kaart bovenaan de rit-app
 * (§3.4). Alleen de stappen die deze bus kan meten.
 */
export interface VoorvalBeeld {
  id: string
  soort: VoorvalSoort
  /** Waar het speelt, als naam: een halte, of niets bij een zone (die staat op de kaart). */
  waar?: string
  /** Hoeveel seconden er nog zijn; leeg als er geen venster loopt. */
  restS?: number
  stappen: Array<{ id: string; stand: 'open' | 'gehaald' | 'mis' }>
  knoppen?: VoorvalKnop[]
  /** De echte toets van de speler per stap, als die er is (core/omsiKeys.ts). */
  toetsen?: Record<string, string>
}

/**
 * Een regel in het ritspoor (core/rittenstaat.ts), zoals `t: 'flits'`: zo loopt
 * een voorval na een herstart van de app verder waar het was.
 */
export interface VoorvalSpoorRegel {
  t: 'voorval'
  /** De klok van het spel in minuten, zoals elke spoorregel. */
  k: number
  id: string
  wat: 'begin' | 'stap' | 'knop' | 'einde'
  stap?: string
  gehaald?: boolean
  knop?: VoorvalKnop
  verschoondS?: number
}

/** Hoe vaak (§3.3). Reactieve voorvallen over veiligheid (V21, V22) tellen niet mee voor het maximum. */
export type VoorvalFrequentie = 'uit' | 'rustig' | 'normaal' | 'druk'
export type VoorvalMoeilijkheid = 'rustig' | 'normaal' | 'pittig'

export const VOORVAL_FREQUENTIE: Readonly<
  Record<VoorvalFrequentie, { gemiddeldMin?: number; maxPerDienst: number }>
> = {
  uit: { maxPerDienst: 0 },
  rustig: { gemiddeldMin: 90, maxPerDienst: 1 },
  normaal: { gemiddeldMin: 40, maxPerDienst: 3 },
  druk: { gemiddeldMin: 20, maxPerDienst: 6 }
}

/** Vensters ×1,5, ×1 of ×0,75, en de aankondiging in haltes (§3.8). */
export const VOORVAL_MOEILIJKHEID: Readonly<
  Record<VoorvalMoeilijkheid, { venster: number; aankondiging: number }>
> = {
  rustig: { venster: 1.5, aankondiging: 2 },
  normaal: { venster: 1, aankondiging: 1 },
  pittig: { venster: 0.75, aankondiging: 0 }
}

export interface VoorvalInstelling {
  frequentie: VoorvalFrequentie
  moeilijkheid: VoorvalMoeilijkheid
  categorieen: Record<VoorvalCategorie, boolean>
  /** Gong en een korte zin; standaard uit (§3.9). */
  geluid: boolean
}

/** Normaal en Normaal, alles aan, geluid uit (§8). */
export const STANDAARD_VOORVALINSTELLING: VoorvalInstelling = {
  frequentie: 'normaal',
  moeilijkheid: 'normaal',
  categorieen: { reizigers: true, verkeer: true, techniek: true, weer: true, dienst: true },
  geluid: false
}

/* ---- hulpjes, zonder toestand ---- */

const AFLOPEN = new Set<VoorvalUitslag['afloop']>(['goed', 'deels', 'mis', 'geweigerd', 'niet-gemeten'])

function eindig(waarde: unknown): number | undefined {
  return typeof waarde === 'number' && Number.isFinite(waarde) ? waarde : undefined
}

/**
 * Een uitslag zoals hij uit een bestand komt (een profiel, een bericht van de
 * cloud), nagekeken: een onbekende soort, een kapot getal of een stap zonder id
 * maakt hem ongeldig, want een half gelezen uitslag zou geld verkeerd boeken.
 * Wat er verder in staat, valt weg.
 */
export function geldigeVoorvalUitslag(ruw: unknown): VoorvalUitslag | undefined {
  if (!ruw || typeof ruw !== 'object' || Array.isArray(ruw)) return undefined
  const r = ruw as Record<string, unknown>
  if (typeof r.id !== 'string' || !r.id || !isVoorvalSoort(r.soort)) return undefined
  if (typeof r.afloop !== 'string' || !AFLOPEN.has(r.afloop as VoorvalUitslag['afloop'])) return undefined
  const start = eindig(r.start)
  const verschoondS = eindig(r.verschoondS)
  const bedrag = eindig(r.bedrag)
  const reputatie = eindig(r.reputatie)
  const xp = eindig(r.xp)
  if (start === undefined || verschoondS === undefined || bedrag === undefined || reputatie === undefined || xp === undefined) {
    return undefined
  }
  if (verschoondS < 0 || !Array.isArray(r.stappen)) return undefined
  const stappen: VoorvalUitslag['stappen'] = []
  for (const stap of r.stappen) {
    if (!stap || typeof stap !== 'object') return undefined
    const { id, gehaald } = stap as Record<string, unknown>
    if (typeof id !== 'string' || !id) return undefined
    if (gehaald !== true && gehaald !== false && gehaald !== null) return undefined
    stappen.push({ id, gehaald })
  }
  return {
    id: r.id,
    soort: r.soort,
    start,
    stappen,
    afloop: r.afloop as VoorvalUitslag['afloop'],
    verschoondS,
    bedrag,
    reputatie,
    xp,
    ...(r.veiligheidsfout === true ? { veiligheidsfout: true } : {}),
    ...(r.oefenen === true ? { oefenen: true } : {})
  }
}

/**
 * Alle uitslagen van een dienst bij elkaar, zoals het logboek en het bedrijf
 * ze tellen. Geoefende voorvallen tellen niet voor geld, reputatie of ervaring
 * (§3.14); de verschoning wel, want die hoort bij de rit die gereden is.
 * Het bedrag in hele centen afgerond, zoals `onderwegVan` het loon afrondt.
 */
export function somVanVoorvallen(uitslagen: readonly VoorvalUitslag[]): {
  aantal: number
  goed: number
  bedrag: number
  reputatie: number
  xp: number
  verschoondS: number
  veiligheidsfouten: number
} {
  let bedrag = 0
  let reputatie = 0
  let xp = 0
  let verschoondS = 0
  let goed = 0
  let veiligheidsfouten = 0
  for (const u of uitslagen) {
    verschoondS += u.verschoondS
    if (u.veiligheidsfout) veiligheidsfouten += 1
    if (u.oefenen) continue
    if (u.afloop === 'goed') goed += 1
    bedrag += u.bedrag
    reputatie += u.reputatie
    xp += u.xp
  }
  return {
    aantal: uitslagen.length,
    goed,
    bedrag: Math.round(bedrag * 100) / 100,
    reputatie,
    xp,
    verschoondS,
    veiligheidsfouten
  }
}
