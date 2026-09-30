/**
 * DE LAKSTUDIO: TYPEN EN PURE REGELS (design/ontwerpen/lakstudio.md)
 *
 * Dit is het contract tussen de studio (renderer), main en de cloudtak (deel F,
 * het busbedrijf): het project met zijn lagen, de familie en de doelen, de naam
 * van een kleurstelling (`naamFout`), de `.cti` zelf (`ctiTekst`), en
 * `bussenInKleurstelling`. Geen `node:` en geen `Buffer`: de renderer en zijn
 * werker rekenen er ook mee, en de cloud leest het zonder Electron.
 *
 * Wat hier NIET staat: paden in de OMSI-map. Die kent alleen main
 * (core/lakfamilie.ts, core/lakstudio.ts); de studio krijgt id's.
 */

/** Versie van dit contract; de cloud leest hem mee (§6). */
export const LAK_CONTRACT = 1

/**
 * Het voorvoegsel van alles wat de studio in de OMSI-map zet (§5.1). Niet de naam
 * van de app: die wordt Omsi-Hub, en een bestandsnaam in de OMSI-map kun je later
 * niet meer hernoemen zonder de nummers van kleurstellingen te verschuiven.
 */
export const LAK_VOORVOEGSEL = 'Lakstudio'

/** `~Lakstudio_0007_stadtwerke-lucstad.cti`: het nummer en de slug terug uit een bestandsnaam. */
export const LAK_CTI = /^~Lakstudio_(\d{4})_([a-z0-9-]{1,32})\.cti$/i

/** De kop van onze .cti: aan de tweede regel herkennen we een wees (§5.8). */
export const LAK_KOP = ' Eigen kleurstelling uit de Lakstudio'

/* ------------------------------------------------------------------ OMSI-regels */

/**
 * Zoals Omsi.exe vergelijkt (0x421374): alleen a-z worden hoofdletters. Niet
 * `toUpperCase`: dat maakt van ä een Ä en van ß "SS", en OMSI niet. Staat hier
 * (en niet alleen in core/kleurstelling.ts) omdat de studio en de cloud er ook
 * mee vergelijken.
 */
export function omsiHoofdletters(tekst: string): string {
  return tekst.replace(/[a-z]+/g, (s) => s.toUpperCase())
}

/* ------------------------------------------------------------------ cp1252 */

/**
 * De tekens 0x80-0x9F van Windows-1252; 0 = bestaat niet (0x81, 0x8D, 0x8F,
 * 0x90, 0x9D). De rest is gelijk aan Latin-1 (0x00-0x7F, 0xA0-0xFF). OMSI leest
 * de .cti als ANSI (R§B2), en op de pc's van spelers is dat cp1252.
 */
const CP1252_80: readonly number[] = [
  0x20ac, 0, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0, 0x017d, 0,
  0, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0, 0x017e, 0x0178
]
const NAAR_CP1252 = new Map<number, number>(
  CP1252_80.map((u, i) => [u, 0x80 + i] as [number, number]).filter(([u]) => u !== 0)
)

/** Het byte van een teken in cp1252, of -1 als cp1252 het niet kent. */
export function cp1252Byte(teken: string): number {
  const c = teken.codePointAt(0) ?? -1
  if (c < 0) return -1
  if (c < 0x80 || (c >= 0xa0 && c <= 0xff)) return c
  return NAAR_CP1252.get(c) ?? -1
}

/** Tekst naar cp1252-bytes; gooit bij een teken dat cp1252 niet kent (dat laat `naamFout` nooit door). */
export function naarCp1252(tekst: string): Uint8Array {
  const tekens = [...tekst]
  const uit = new Uint8Array(tekens.length)
  tekens.forEach((t, i) => {
    const b = cp1252Byte(t)
    if (b < 0) throw new Error(`teken buiten cp1252: U+${(t.codePointAt(0) ?? 0).toString(16).padStart(4, '0')}`)
    uit[i] = b
  })
  return uit
}

/** cp1252-bytes terug naar tekst (voor de proef en het lezen van wezen). */
export function vanCp1252(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCodePoint(b >= 0x80 && b <= 0x9f ? CP1252_80[b - 0x80] || 0xfffd : b)
  return s
}

/** Letters die NFKD niet ontleedt maar die een gewone letter hebben (Ł in "Łódź"). */
const OMZET: Record<string, string> = {
  Ł: 'L',
  ł: 'l',
  Đ: 'D',
  đ: 'd',
  Ħ: 'H',
  ħ: 'h',
  ı: 'i',
  Ŀ: 'L',
  ŀ: 'l',
  ß: 'ss',
  Ø: 'O',
  ø: 'o'
}

/**
 * Een naam zo zetten dat OMSI hem kan lezen (§5.2, bij het invullen): staat er
 * een teken buiten cp1252 in, dan de hele naam NFKD zonder accenttekens
 * ("Łódź" → "Lodz"); wat daarna nog ontbreekt valt weg. Een naam die al past,
 * blijft zoals hij is ("Ärger" blijft "Ärger").
 */
export function cp1252Vriendelijk(naam: string): string {
  // Onzichtbare tekens die cp1252 wel kent (tegenlezing L3 punt 8): een vaste spatie wordt een gewone, een zacht afbreekstreepje valt weg.
  naam = naam.replace(/\u00a0/g, ' ').replace(/\u00ad/g, '')
  if ([...naam].every((t) => cp1252Byte(t) >= 0)) return naam
  return [...naam.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')]
    .map((t) => OMZET[t] ?? t)
    .join('')
    .split('')
    .filter((t) => cp1252Byte(t) >= 0)
    .join('')
}

/* ------------------------------------------------------------------ de naam */

export type NaamFout =
  | { fout: 'leeg' }
  | { fout: 'lang'; max: number }
  | { fout: 'teken'; teken: string }
  | { fout: 'rand' }
  | { fout: 'haak' }
  | { fout: 'gereserveerd' }
  | { fout: 'bezet'; bestaand: string }

export const NAAM_MAX = 48

/**
 * Mag dit de naam van een nieuwe kleurstelling zijn (§5.2)? `undefined` als hij
 * goed is. `bestaand`: alle namen die OMSI in de CTC-mappen van de familie kent
 * (ook die van andere bussen in dezelfde map); bij opnieuw opslaan zonder de
 * eigen naam. OMSI vergelijkt na `omsiHoofdletters` en trimt niet: een naam die
 * alleen in hoofdletters verschilt, voegt twee kleurstellingen samen (HHA12.cti,
 * "braungold"/"Braungold").
 */
export function naamFout(naam: string, bestaand: Iterable<string> = []): NaamFout | undefined {
  if (naam.length === 0) return { fout: 'leeg' }
  if ([...naam].length > NAAM_MAX) return { fout: 'lang', max: NAAM_MAX }
  for (const t of naam) {
    const c = t.codePointAt(0) ?? 0
    // Stuurtekens (ook tab en regeleinde): de .cti telt regels, een regeleinde verschuift alles erna.
    if (c < 0x20 || c === 0x7f || cp1252Byte(t) < 0) return { fout: 'teken', teken: t }
    /*
     * Onzichtbaar maar wel in cp1252 (tegenlezing L3 punt 8): een vaste spatie
     * (U+00A0) en een zacht afbreekstreepje (U+00AD). Anders bestaan er twee
     * namen die er in OMSI en in de app hetzelfde uitzien ("Stadtwerke Lucstad"
     * met een gewone en met een vaste spatie), of een naam die leeg lijkt.
     */
    if (c === 0xa0 || c === 0xad) return { fout: 'teken', teken: c === 0xa0 ? 'U+00A0' : 'U+00AD' }
  }
  if (/^[ \t]|[ \t]$/.test(naam)) return { fout: 'rand' }
  if (naam.startsWith('[')) return { fout: 'haak' }
  if (/^(standaard|standard|default)$/i.test(naam)) return { fout: 'gereserveerd' }
  const sleutel = omsiHoofdletters(naam)
  for (const b of bestaand) if (omsiHoofdletters(b) === sleutel) return { fout: 'bezet', bestaand: b }
  return undefined
}

/**
 * De slug in de bestandsnaam (§5.1): ASCII `[a-z0-9-]`, hooguit 32 tekens. Een
 * naam zonder één bruikbare letter wordt `lak`.
 */
export function lakSlug(naam: string): string {
  const s = [...naam.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')]
    .map((t) => OMZET[t] ?? t)
    .join('')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
    .replace(/-+$/, '')
  return s || 'lak'
}

/** `~Lakstudio_0007_slug.cti` */
export function ctiNaam(nnnn: number, slug: string): string {
  return `~${LAK_VOORVOEGSEL}_${String(nnnn).padStart(4, '0')}_${slug}.cti`
}

/** `Lakstudio\0007_slug`: de submap van de texturen, onder de CTC-map. */
export function lakSubmap(nnnn: number, slug: string): string {
  return `${LAK_VOORVOEGSEL}\\${String(nnnn).padStart(4, '0')}_${slug}`
}

/* ------------------------------------------------------------------ de .cti */

export interface CtiItem {
  /** De plek, in de spelling van de cfg. */
  plek: string
  /** Relatief aan de CTC-map, met backslashes. */
  pad: string
}

export interface CtiInvoer {
  naam: string
  nnnn: number
  /** De datum in de kop (dd-mm-jjjj). */
  datum: string
  items: CtiItem[]
  /** Alleen onder de setvar-regel (§5.4, punt 7); de aanroeper beslist. */
  setvars?: Array<[string, number]>
}

/** Een getal zoals StrToFloat het leest: met een punt, zonder exponent, zonder -0. */
export function ctiGetal(w: number): string {
  if (!Number.isFinite(w)) throw new Error(`geen getal: ${w}`)
  if (w === 0) return '0'
  const s = Number.isInteger(w) ? String(w) : String(Math.round(w * 1e6) / 1e6)
  if (/e/i.test(s)) throw new Error(`getal te groot of te klein voor een .cti: ${w}`)
  return s
}

/**
 * De tekst van de .cti (§5.4), met CRLF na elke regel, ook de laatste. Eerst
 * een kop met sterretjes (OMSI slaat alles over wat niet precies `[item]` of
 * `[setvar]` is), dan alle items, dan de setvars. Wat in de naam of een plek
 * niet mag (regeleinde, `[` vooraan) gooit: dat is een fout eerder in de keten.
 *
 * Naar bytes met `naarCp1252`, zonder BOM.
 */
export function ctiTekst(invoer: CtiInvoer): string {
  const fout = naamFout(invoer.naam)
  if (fout) throw new Error(`ongeldige naam voor de .cti: ${fout.fout}`)
  const regels: string[] = [
    '****************************************************************',
    `${LAK_KOP} (Omsi-Hub), nr. ${String(invoer.nnnn).padStart(4, '0')}`,
    ` Gemaakt ${invoer.datum}. Niet met de hand wijzigen.`,
    '****************************************************************',
    ''
  ]
  const schoon = (s: string, wat: string): string => {
    if (/[\r\n]/.test(s) || s.startsWith('[') || s.length === 0) throw new Error(`ongeldige ${wat} voor de .cti: ${JSON.stringify(s)}`)
    return s
  }
  for (const it of invoer.items) {
    const pad = it.pad.replace(/\//g, '\\')
    if (pad.split('\\').includes('..') || /^\\|^[a-z]:/i.test(pad)) throw new Error(`pad buiten de CTC-map: ${it.pad}`)
    regels.push('[item]', invoer.naam, schoon(it.plek, 'plek'), schoon(pad, 'pad'), '')
  }
  for (const [v, w] of invoer.setvars ?? []) regels.push('[setvar]', schoon(v, 'variabele'), ctiGetal(w), '')
  return regels.join('\r\n') + '\r\n'
}

/** De bytes van de .cti: cp1252, zonder BOM, CRLF. */
export function ctiBytes(invoer: CtiInvoer): Uint8Array {
  return naarCp1252(ctiTekst(invoer))
}

/* ------------------------------------------------------------------ het project */

export type LakStart = 'snel' | 'effenKleuren' | 'precies' | 'effen'

export type Zijde = 'L' | 'R' | 'V' | 'A' | 'D'

/** Waar een tekst, afbeelding of vorm op de bus staat (§4.5), in busruimte (o3d-assen, meter). */
export interface Plaats {
  zijde: Zijde
  midden: [number, number, number]
  breedteM: number
  /** Graden, in het vlak van de zijde. */
  draai: number
  spiegel: 'gekoppeld' | 'los'
  zelfdeRichting?: boolean
}

export type StrookSjabloon =
  | 'onderband'
  | 'raamband'
  | 'dakband'
  | 'schuin'
  | 'golf'
  | 'tweekleurig'
  | 'frontvlak'
  | 'achtervlak'

export interface Streek {
  /** Punten in busruimte, per drie (x, y, z). */
  punten: number[]
  straalCm: number
  hardheid: number
  dekking: number
  gum: boolean
  /** De camerastand van de streek (§4.8): beeldProj, 16 getallen. */
  camera: number[]
  scherm: [number, number]
}

interface LaagBasis {
  id: string
  naam: string
  zichtbaar: boolean
  /** 0..1 */
  dekking: number
  vergrendeld?: boolean
  /** "Details behouden" (§4.4), 0..1, standaard 1. */
  detail: number
  /** "Ook over rubbers en lampen": dan het masker zonder de zones (§4.4). */
  ookOverRubbers?: boolean
  /** Uit Snelle lak of een huisstijl: een nieuw recept mag deze laag vervangen. */
  uitRecept?: boolean
}

export type Laag = LaagBasis &
  (
    | {
        soort: 'zone'
        centrum: [number, number, number]
        straal: number
        kleur: string
        /**
         * 'start': een kleurvlak van de start-kleurstelling ("effen in de kleuren
         * van deze lak"), gemeten op de vage start in plaats van op de detailbron.
         */
        bron?: 'start'
      }
    | {
        soort: 'strook'
        sjabloon: StrookSjabloon
        /** Onder- en bovenkant in m boven de onderkant van de doos. */
        h1: number
        h2: number
        /** Graden; schuin en golf. */
        hoek: number
        /** Amplitude in m (golf). */
        golf: number
        /**
         * Waar de band komt: rondom, alleen de zijwanden, of alleen het voor- of
         * achtervlak (frontvlak en achtervlak als echte vlakken: waar de normaal
         * naar voren of naar achteren wijst).
         */
        zijden: 'rondom' | 'zijden' | 'voor' | 'achter'
        kleur: string
        verloop?: string
      }
    | {
        soort: 'tekst'
        tekst: string
        lettertype: string
        hoogteCm: number
        kleur: string
        omlijning?: { kleur: string; breedteCm: number }
        /** In procenten van de letterhoogte (0 = gewoon, 10 = een tiende van een letter ertussen). */
        letterafstand?: number
        plaats: Plaats
      }
    | {
        soort: 'afbeelding'
        beeld: string
        witDoorzichtig: boolean
        /** Hoogte gedeeld door breedte van het beeld (de werker rekent met zijn eigen beeld). */
        verhouding?: number
        plaats: Plaats
      }
    | { soort: 'vorm'; vorm: string; kleur: string; plaats: Plaats }
    | { soort: 'penseel'; kleur: string; streken: Streek[] }
  )

export type LaagSoort = Laag['soort']

export interface LakProject {
  versie: 1
  id: string
  /** De naam van de kleurstelling zoals hij in OMSI komt (stabiel na de eerste keer). */
  naam: string
  /** Het .bus-pad ten opzichte van de OMSI-map. */
  bus: string
  start: LakStart
  /** Bij "precies" en "effen in de kleuren van": de kleurstelling waar het mee begon. */
  startKleurstelling?: string
  lagen: Laag[]
  /** Busopties (§4.9): variabele → waarde. */
  opties: Record<string, number>
  spiegel: { aan: boolean; vlakX?: number }
  gemaakt: string
  bewaard: string
  /** Na het plaatsen: onder welk nummer en welke versie. */
  geplaatst?: { naam: string; nnnn: number; versie: number }
  bedrijf?: { naam: string; kleuren?: string[] }
  /** Wat de speler in het paneel Snelle lak koos (§2.1); de lagen `r-*` komen daaruit. */
  snel?: SnelleLakStand
}

/**
 * Het paneel Snelle lak (§2.1): wat gekozen is. Een kleur die `null` is, is nog
 * niet gekozen (het staal toont dan de kleur van de huidige lak). Elke keuze
 * wordt meteen een gewone laag (`r-grond`, `r-strook`, `r-tekst`, `r-logo`).
 */
export interface SnelleLakStand {
  kleuren: [string | null, string | null, string | null]
  strook: StrookSjabloon
  strookGekozen?: boolean
  naam: string
  logo?: string
  /** Hoogte gedeeld door breedte van het logo. */
  logoVerhouding?: number
  lettertype?: string
}

/** Het recept van Snelle lak zoals de huisstijl het bewaart (§6): alleen wat gekozen is. */
export function receptVan(s: SnelleLakStand): LakRecept | undefined {
  if (!s.kleuren[0]) return undefined
  return {
    kleuren: [s.kleuren[0], s.kleuren[1] ?? undefined, s.kleuren[2] ?? undefined],
    strook: s.strook,
    naam: s.naam || undefined,
    logo: s.logo
  }
}

/** Snelle lak en een huisstijl (§6): alleen wat per model klopt. */
export interface LakRecept {
  kleuren: [string, string?, string?]
  strook: StrookSjabloon
  naam?: string
  /** Een beeld-id (sha1). */
  logo?: string
}

export interface Huisstijl {
  naam: string
  kleuren: [string, string, string]
  logo?: string
  recept?: LakRecept
}

/* ------------------------------------------------------------------ familie en doelen (main → studio) */

/** Waarom een familielid de naam niet krijgt (§3.1, punt 7). */
export type NietOpReden = 'versleuteld' | 'geen-model' | 'doos' | 'conflict' | 'geen-lakplek'

/** Eén textuur die de studio maakt, voor één of meer lakplekken (§3.1). Zonder paden. */
export interface LakDoel {
  /** `d0`, `d1`, ...: vast binnen één `lak:doelen`. */
  id: string
  /** De bestandsnaam van de standaardtextuur (geen map): ook de stam van onze textuur. */
  naam: string
  /** De bron-id van de standaardtextuur in het Bus3D-register (`omsi3d://t/<id>`), als hij daar staat. */
  textuur?: string
  /** De maat van de standaardtextuur. */
  b: number
  h: number
  /** De maat van onze uitvoer: een veelvoud van 4, hooguit 4096 aan de lange zijde (§5.3). */
  uitB: number
  uitH: number
  /** BC3 als er ergens een alfa < 255 in de keten van de basis staat, anders BC1 (§4.14). */
  formaat: 'bc1' | 'bc3'
  /** Ook een `_#low` (lange zijde ≥ 2048, of een cfg met een `_#low`-plek). */
  low: boolean
  /** Alle plek-namen (per CTC-map, na UpperCase uniek) die deze textuur krijgen. */
  plekken: Array<{ map: number; plek: string }>
  /** Het familielid waarvan het net gebakken wordt (relatief .bus-pad). */
  bakker: string
  /** Het sjabloon van de maker (§3.3), als er een past. */
  sjabloon?: LakSjabloon
  /**
   * De bron-id van de textuur die de start-kleurstelling op deze plek legt (als
   * er een start is en hij deze plek vervangt): de basis bij "precies", en de
   * kleuren bij "effen in de kleuren". Los van wat het venster toont.
   */
  startTextuur?: string
}

/** Een .rpc-sjabloon, zonder paden: de studio haalt de beelden op id. */
export interface LakSjabloon {
  naam: string
  /** Bron-id's in het Bus3D-register: BS, AL, MA, AD, MU. */
  bs?: string
  al?: string
  ma?: string
  ad?: string
  mu?: string
  b: number
  h: number
  /** Correlatie van de randen van BS met de standaardtextuur op 1/8 (core/lakfamilie.ts, `zoekSjabloon`). */
  overeenkomst: number
}

export interface LakLid {
  /** Relatief .bus/.ovh/.sco-pad. */
  bus: string
  /** De naam uit de .bus (`[friendlyname]`), voor "Komt ook op": geen bestandsnaam. */
  naam?: string
  /** Bestuurbaar (een .bus die niet KI of geparkeerd is). */
  bestuurbaar: boolean
  /** Welke doelen dit lid draagt. */
  doelen: string[]
}

export interface LakFamilieInfo {
  bus: string
  /** Het aantal CTC-mappen van de familie; paden kent alleen main. */
  mappen: number
  leden: LakLid[]
  doelen: LakDoel[]
  nietOp: Array<{ bus: string; reden: NietOpReden }>
  conflicten: Array<{ plek: string; bussen: string[] }>
  /** Alle namen die OMSI in de mappen van de familie al kent (voor `naamFout`). */
  bestaandeNamen: string[]
  /** Kan de setvar-regel gehaald worden (§5.4, punt 7)? Zo niet: busopties uit met ls.opties. */
  optiesMogelijk: boolean
  /** Geen [CTC]: [Lak maken] staat uit met ls.geenCtc. */
  geenCtc?: boolean
}

/** Een busoptie (§4.9): een [setvar]-variabele uit de .cti's van de familie. */
export interface LakOptie {
  variabele: string
  soort: 'uiterlijk' | 'techniek'
  /** De waarden die in de .cti's voorkomen. */
  waarden: number[]
  /** De waarde die de meshes van deze variabele verbergt, als die er is. */
  verberg?: number
  /** De o3d-namen die aan deze variabele hangen (voor een naam in de studio). */
  meshes: string[]
  /**
   * Heeft een van die meshes een alfamateriaal zonder tekst- of scripttextuur?
   * Een grove voorselectie: of zo'n mesh echt OVER de lak ligt (binnen 5 cm,
   * §4.9), meet de werker aan de meetkunde (`lakLigging`).
   */
  overLak: boolean
  /**
   * De waarde die de bus zonder deze setvar toont zoals de maker het bedoelde:
   * wat de meeste kleurstellingen zetten (een kleurstelling die hem niet zet telt
   * als 0; core/busrust.ts `typischVan`). Een eigen lak schrijft die expliciet
   * (§4.9 "ook 0"): OMSI begint anders met 0, en dan had de O560 geen wielen.
   */
  typisch: number
  /** De waarde die de start-kleurstelling zet, als hij dat doet. */
  start?: number
}

/**
 * De setvars die een lak in de .cti schrijft (§4.9), en waarmee de studio de bus
 * toont, zodat het voorbeeld is wat OMSI straks laat zien (beoordeling L3 punt 3):
 * - elke UITERLIJK-variabele expliciet: wat de speler koos, anders bij "precies"
 *   de waarde van de start en verder de gewone waarde (`typisch`);
 * - TECHNIEK alleen als de speler hem koos, of bij "precies" en "effen in de
 *   kleuren" als de start hem zet.
 * Puur: main (core/lakstudio.ts `lakPlan`) en de studio rekenen hiermee.
 */
export function effectieveOpties(opties: LakOptie[], project: Pick<LakProject, 'opties' | 'start'>): Array<[string, number]> {
  const gekozen = new Map(Object.entries(project.opties ?? {}).map(([v, w]) => [omsiHoofdletters(v), w]))
  const vanStart = project.start === 'precies' || project.start === 'effenKleuren'
  const uit: Array<[string, number]> = []
  for (const o of opties) {
    const k = gekozen.get(omsiHoofdletters(o.variabele))
    const w =
      k !== undefined && Number.isFinite(k)
        ? k
        : o.soort === 'uiterlijk'
          ? project.start === 'precies'
            ? (o.start ?? o.typisch)
            : o.typisch
          : vanStart
            ? o.start
            : undefined
    if (w !== undefined) uit.push([o.variabele, w])
  }
  return uit
}

/* ------------------------------------------------------------------ opslaan (main ↔ studio) */

export type LakPlaatsFout =
  | 'naam'
  | 'bestaat'
  | 'ruimte'
  | 'conflict'
  | 'formaat'
  | 'handmatig'
  | 'bezig'
  | 'geenCtc'
  | 'fout'

export type LakPlaatsUitkomst =
  | { ok: true; index: number; nnnn: number; versie: number }
  | { klaargezet: true; nnnn: number; versie: number }
  | { fout: LakPlaatsFout; detail?: string; bestanden?: string[] }

export interface LakOverzicht {
  projectId: string
  naam: string
  bus: string
  nnnn: number
  versie: number
  geplaatst: string
  bestanden: number
  wacht?: boolean
  reden?: string
}

/** De IPC-kanalen (§8). Main bewaakt elk kanaal: studio of hoofdvenster. */
export const LAK_KANALEN = {
  projecten: 'lak:projecten',
  doelen: 'lak:doelen',
  opties: 'lak:opties',
  laad: 'lak:laad',
  bewaar: 'lak:bewaar',
  beeld: 'lak:beeld',
  beeldBytes: 'lak:beeldBytes',
  naamVrij: 'lak:naamVrij',
  plaats: 'lak:plaats',
  verwijder: 'lak:verwijder',
  gebruik: 'lak:gebruik',
  lijst: 'lak:lijst',
  wachtrij: 'lak:wachtrij',
  nietPlaatsen: 'lak:nietPlaatsen',
  wezen: 'lak:wezen',
  weesWeg: 'lak:weesWeg',
  weesOvernemen: 'lak:weesOvernemen',
  exporteer: 'lak:exporteer',
  importeer: 'lak:importeer',
  /** De bestanden van de start die een geplaatste lak noemt en die weg zijn (§5.6). */
  ontbrekend: 'lak:ontbrekend',
  /** De studio exporteert (aan) of is klaar (uit): een buswissel en de pauze wachten (§4.1). */
  bezig: 'lak:bezig',
  /** Gebeurtenis naar beide vensters: een kleurstelling kwam erbij of ging weg (§5.6, punt 8). */
  kleurstellingenVeranderd: 'bus:kleurstellingenVeranderd',
  /** Gebeurtenis: een klaargezette lak is geplaatst (§5.7). */
  geplaatst: 'lak:geplaatst'
} as const

/* ------------------------------------------------------------------ voor het busbedrijf (deel F) */

/**
 * Welke eigen bussen rijden in deze kleurstelling (§6, punt 4)? Puur en
 * structureel getypeerd: de cloud geeft zijn eigen `EigenBus`-lijst. Vergelijkt
 * de bus op pad (zonder op hoofdletters of schuine strepen te letten) en de naam
 * zoals OMSI (`omsiHoofdletters`, niet getrimd). Geeft de nummers terug.
 */
export function bussenInKleurstelling(
  bussen: ReadonlyArray<{ nummer: number; relatiefPad?: string; bus?: string; kleurstelling?: string | null }>,
  relatiefPad: string,
  naam: string
): number[] {
  const pad = (p: string): string => p.replace(/\//g, '\\').toLowerCase()
  const doelPad = pad(relatiefPad)
  const sleutel = omsiHoofdletters(naam)
  return bussen
    .filter((b) => {
      const p = b.relatiefPad ?? b.bus
      return (
        p !== undefined &&
        pad(p) === doelPad &&
        typeof b.kleurstelling === 'string' &&
        omsiHoofdletters(b.kleurstelling) === sleutel
      )
    })
    .map((b) => b.nummer)
}

/** Is dit een eigen lak? Aan de bestandsnaam van de .cti (§5.8), niet aan het register. */
export function isEigenCti(bestandsnaam: string): boolean {
  return LAK_CTI.test(bestandsnaam)
}

/* ------------------------------------------------------------------ maten */

/**
 * De maat van onze uitvoer (§5.3): de maat van de start (minstens die van de
 * standaard), omlaag afgerond op een veelvoud van 4, en een lak van 8192 (14
 * cfg's, §3.5) terug naar 4096 aan de lange zijde (met dezelfde verhouding).
 * Het ontwerp zegt op twee plekken iets anders over net-boven-4096: §5.3
 * "hooguit 4096", §3.4 "Urbanway 4170×2600 → 4168×2600, zoals de bestaande
 * repaints". Die laatste wint: tot 10% boven de kap blijft de maat staan.
 */
export function uitvoerMaat(b: number, h: number, kap = 4096): { b: number; h: number } {
  let bb = b
  let hh = h
  const lang = Math.max(bb, hh)
  if (lang > kap * 1.1) {
    bb = Math.round((bb * kap) / lang)
    hh = Math.round((hh * kap) / lang)
  }
  return { b: Math.max(4, bb - (bb % 4)), h: Math.max(4, hh - (hh % 4)) }
}

/** Het aantal mipniveaus van een volle keten tot 1x1. */
export function mipAantal(b: number, h: number): number {
  return Math.floor(Math.log2(Math.max(1, b, h))) + 1
}

/** De datum zoals in de kop van de .cti: dd-mm-jjjj. */
export function ctiDatum(d: Date): string {
  const t = (n: number): string => String(n).padStart(2, '0')
  return `${t(d.getDate())}-${t(d.getMonth() + 1)}-${d.getFullYear()}`
}
