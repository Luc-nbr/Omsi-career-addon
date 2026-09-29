import { somVanVoorvallen, type VoorvalBeeld, type VoorvalUitslag } from '../shared/voorval'
import type { SpeedSign } from './geo'
import type { Rittenstaat } from './rittenstaat'
import type { Duty } from './types'

/*
 * Onderweg: flitspalen, controleurs en wat er op een dienst gebeurt.
 *
 * WAAROM DIT ER IS
 * De Bus Company Simulator heeft flitsers, kaartcontroleurs en willekeurige
 * gebeurtenissen; Luc wil ze allemaal (stap 6). OMSI kent er niets van, en de
 * app kan in OMSI niets neerzetten of laten gebeuren -- de plugin leest alleen.
 * Dus bestaat alles hier uit wat wél gemeten wordt: waar de bus rijdt en hoe
 * hard, de rittenstaat per halte (vertrek, hard remmen, aanrijdingen), en de
 * kaartverkoop aan de deur. Een gebeurtenis is daarom een opdracht met een
 * meetbare voorwaarde, en een flitspaal is een camera bij een bord dat echt
 * op de kaart staat.
 *
 * WAT NIET KAN, EN WAT ER DAN STAAT
 * Echte kaartcontrole -- zwartrijders betrappen -- vraagt dat OMSI per reiziger
 * weet of hij een kaartje heeft, en dat weet het niet. De controleurs hier
 * controleren daarom de chauffeur, zoals een meerijder van de opdrachtgever:
 * te vroeg vertrekken, hard remmen of optrekken, flitsen, aanrijdingen en
 * fout wisselgeld zolang ze aan boord zijn.
 *
 * Alles is in euro's, zoals het loon in career.ts (niet in centen zoals het
 * bedrijf), en alles is herhaalbaar: dezelfde dienst geeft na een herstart
 * dezelfde flitspalen en dezelfde gebeurtenis.
 */

/* ---- toeval dat vastligt ---- */

/** Een getal uit een tekst, altijd hetzelfde voor dezelfde tekst (FNV-1a). */
export function hashVan(tekst: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < tekst.length; i++) {
    h ^= tekst.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Een reeks van 0 tot 1 uit een zaad (mulberry32), zoals in bedrijf.ts. */
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

/* ---- flitspalen ---- */

export const FLITS = {
  /** Deel van de snelheidsborden met een camera erbij; bij een flitsactie meer. */
  dichtheid: 0.15,
  dichtheidActie: 0.45,
  /** Zo dicht moet de bus langs het bord komen, in meters. */
  bereikM: 14,
  /** Wat de camera er afhaalt voordat hij oordeelt, zoals in Nederland. */
  correctieKmh: 3,
  /** De boete: een vast deel plus per km/u te hard, in euro's. */
  boeteVast: 20,
  boetePerKmh: 6,
  /** Pas na zoveel meter weer flitsen bij dezelfde paal. */
  herhaalM: 80
} as const

export interface Flitspaal {
  id: number
  x: number
  y: number
  kmh: number
}

/**
 * Welke borden een camera hebben. Een vaste keuze per kaart: dezelfde palen
 * bij elke rit, zodat je ze leert kennen, zoals echte flitspalen. Bij een
 * flitsactie komen er palen bij, en de vaste blijven staan.
 */
export function flitspalen(borden: SpeedSign[] | undefined, mapFolder: string, dichtheid: number = FLITS.dichtheid): Flitspaal[] {
  const palen: Flitspaal[] = []
  for (const bord of borden ?? []) {
    const h = hashVan(`${mapFolder}|${Math.round(bord.x)}|${Math.round(bord.y)}|${bord.kmh}`)
    if ((h % 1000) / 1000 < dichtheid) palen.push({ id: h, x: bord.x, y: bord.y, kmh: bord.kmh })
  }
  return palen
}

/** De boete bij deze snelheid; nul als het na de correctie niet te hard was. */
export function boeteVoor(kmh: number, limiet: number): number {
  const teHard = Math.floor(kmh - FLITS.correctieKmh - limiet)
  return teHard < 1 ? 0 : FLITS.boeteVast + FLITS.boetePerKmh * teHard
}

export interface Flits {
  paal: number
  kmh: number
  limiet: number
  boete: number
}

/**
 * Kwam de bus tussen twee metingen langs een flitspaal, en reed hij te hard?
 *
 * De paal staat bij een bord, en een bord geldt voor de rijrichting waarin het
 * rechts van de weg staat -- dezelfde regel als de snelheid in de navigatie
 * (`signsAlong` in RouteMap). Wie de andere kant op rijdt, komt er ook langs,
 * maar voor hem geldt dat bord niet.
 *
 * `vlak` houdt bij welke palen net geflitst hebben: een bus die bij de paal
 * stilvalt en weer optrekt, wordt niet twee keer beboet.
 */
export function flitsControle(
  palen: Flitspaal[],
  van: { x: number; y: number },
  naar: { x: number; y: number },
  kmh: number,
  vlak: Set<number>
): Flits | undefined {
  const vx = naar.x - van.x
  const vy = naar.y - van.y
  const len2 = vx * vx + vy * vy
  for (const paal of palen) {
    const d = Math.hypot(paal.x - naar.x, paal.y - naar.y)
    if (vlak.has(paal.id)) {
      if (d > FLITS.herhaalM) vlak.delete(paal.id)
      continue
    }
    // Stilstaan of een sprong (OMSI laadt een andere tegel): niets te meten.
    if (len2 < 1 || len2 > 60 * 60) continue
    const t = Math.max(0, Math.min(1, ((paal.x - van.x) * vx + (paal.y - van.y) * vy) / len2))
    const afstand = Math.hypot(paal.x - (van.x + vx * t), paal.y - (van.y + vy * t))
    if (afstand > FLITS.bereikM) continue
    const kant = Math.sign(vx * (paal.y - van.y) - vy * (paal.x - van.x))
    if (kant >= 0) continue
    vlak.add(paal.id)
    const boete = boeteVoor(kmh, paal.kmh)
    if (boete > 0) return { paal: paal.id, kmh: Math.round(kmh), limiet: paal.kmh, boete }
  }
  return undefined
}

/* ---- gebeurtenissen ---- */

export type GebeurtenisSoort = 'stiptheid' | 'comfort' | 'schadevrij' | 'flitsactie' | 'controle'

/**
 * Wat er op deze dienst speelt. De eerste vier worden bij het tekenen
 * aangekondigd; de controleurs niet -- die stappen gewoon ergens in.
 */
export interface Gebeurtenis {
  soort: GebeurtenisSoort
  /** Alleen bij controle: in welke rit, en van welke halte tot welke. */
  rit?: number
  van?: number
  tot?: number
}

export const GEBEURTENIS = {
  /** Kans dat een dienst iets heeft. */
  kans: 0.6,
  /** Stiptheidsactie: per tijdhalte op tijd erbij, te vroeg of te laat eraf. */
  stiptheidPerHalte: 1,
  /** Comfortcontrole: zoveel keer hard remmen of optrekken mag, dan de premie. */
  comfortMax: 2,
  comfortPremie: 15,
  schadevrijPremie: 10,
  /** Controle aan boord: het rapport naar het aantal fouten. */
  controleGoed: 20,
  controleRedelijk: 5,
  controleSlecht: -15
} as const

/**
 * De gebeurtenis van een dienst, uit een zaad dat bij die dienst hoort. Geen
 * bij een examen: dat is al een beoordeling, en een extra opdracht erbij zou
 * het examen anders maken voor de een dan voor de ander.
 */
export function gebeurtenisVoor(duty: Duty, zaad: string, examen = false): Gebeurtenis | undefined {
  if (examen || duty.legs.length === 0) return undefined
  const kans = reeks(hashVan(zaad))
  if (kans() >= GEBEURTENIS.kans) return undefined
  const soorten: GebeurtenisSoort[] = ['stiptheid', 'comfort', 'schadevrij', 'flitsactie', 'controle', 'controle']
  const soort = soorten[Math.floor(kans() * soorten.length)]
  if (soort !== 'controle') return { soort }
  // Controleurs op een rit met genoeg haltes: ze stappen niet bij de eerste in en rijden drie tot zes haltes mee.
  const ritten = duty.legs.map((leg, index) => ({ index, n: leg.stops.length })).filter((r) => r.n >= 5)
  if (ritten.length === 0) return { soort: 'comfort' }
  const rit = ritten[Math.floor(kans() * ritten.length)]
  const van = 1 + Math.floor(kans() * (rit.n - 4))
  const tot = Math.min(rit.n - 1, van + 3 + Math.floor(kans() * 4))
  return { soort, rit: rit.index, van, tot }
}

/** Zitten de controleurs nu in de bus? `halte` is de volgende halte, zoals de meetlus hem kent. */
export function controleAanBoord(g: Gebeurtenis | undefined, rit: number, halte: number | undefined): boolean {
  return (
    g?.soort === 'controle' &&
    halte !== undefined &&
    rit === g.rit &&
    halte > (g.van ?? 0) &&
    halte <= (g.tot ?? 0)
  )
}

/** Wat de controleurs zagen. */
export interface Controlerapport {
  vroeg: number
  remmen: number
  klappen: number
  flitsen: number
  wisselgeld: number
  fouten: number
}

export interface Uitslag {
  soort: GebeurtenisSoort
  /** Leeg als er niets te meten viel; dan telt de gebeurtenis niet. */
  gehaald?: boolean
  /** Wat het oplevert (of kost), in euro's. */
  bedrag: number
  rapport?: Controlerapport
}

/** Wat er van een dienst gemeten is buiten de rittenstaat; zie `measured` in career.ts. */
export interface Sessie {
  harshBrakes?: number
  harshAccels?: number
  collisions?: number
}

/**
 * Hoe de gebeurtenis afliep. Alleen uit metingen: wat niet gemeten is, telt
 * niet -- niet voor en niet tegen de chauffeur.
 */
export function beoordeel(g: Gebeurtenis, staat: Rittenstaat | undefined, sessie: Sessie): Uitslag {
  switch (g.soort) {
    case 'stiptheid': {
      if (!staat || staat.vastGemeten === 0) return { soort: g.soort, bedrag: 0 }
      const goed = staat.vastGemeten - staat.teVroeg - staat.teLaat
      const bedrag = (goed - staat.teVroeg - staat.teLaat) * GEBEURTENIS.stiptheidPerHalte
      return { soort: g.soort, gehaald: bedrag > 0, bedrag }
    }
    case 'comfort': {
      if (sessie.harshBrakes === undefined && sessie.harshAccels === undefined) return { soort: g.soort, bedrag: 0 }
      const hard = (sessie.harshBrakes ?? 0) + (sessie.harshAccels ?? 0)
      const gehaald = hard <= GEBEURTENIS.comfortMax
      return { soort: g.soort, gehaald, bedrag: gehaald ? GEBEURTENIS.comfortPremie : 0 }
    }
    case 'schadevrij': {
      if (sessie.collisions === undefined) return { soort: g.soort, bedrag: 0 }
      const gehaald = sessie.collisions === 0
      return { soort: g.soort, gehaald, bedrag: gehaald ? GEBEURTENIS.schadevrijPremie : 0 }
    }
    case 'flitsactie': {
      // Geen premie: de actie is dat er meer palen staan. Gehaald is niet geflitst.
      return { soort: g.soort, gehaald: (staat?.flitsen ?? []).length === 0, bedrag: 0 }
    }
    case 'controle': {
      const haltes = staat?.ritten[g.rit ?? -1]?.haltes.slice(g.van, (g.tot ?? 0) + 1) ?? []
      // Geen enkel vertrek gemeten waar ze aan boord waren: dan weten we niet of ze er waren.
      if (!haltes.some((h) => h.vertrek !== undefined)) return { soort: g.soort, bedrag: 0 }
      /*
       * Wat onderweg gebeurt, staat bij de halte waar je heen reed: van de
       * halte na het instappen tot die van het uitstappen, net als
       * `controleAanBoord`. Het vertrek bij de laatste halte zien ze niet meer,
       * daar stappen ze uit. Verkopen gebeuren aan de halte zelf, dus daar
       * tellen instap- en uitstaphalte allebei mee.
       */
      const rijdend = haltes.slice(1)
      const som = (lijst: typeof haltes, veld: 'remmen' | 'optrekken' | 'klappen' | 'wisselgeld'): number =>
        lijst.reduce((s, h) => s + (h[veld] ?? 0), 0)
      const rapport: Controlerapport = {
        vroeg: haltes.slice(0, -1).filter((h) => h.oordeel === 'vroeg').length,
        remmen: som(rijdend, 'remmen') + som(rijdend, 'optrekken'),
        klappen: som(rijdend, 'klappen'),
        flitsen: rijdend.reduce((s, h) => s + (h.flitsen?.length ?? 0), 0),
        wisselgeld: som(haltes, 'wisselgeld'),
        fouten: 0
      }
      rapport.fouten = rapport.vroeg + rapport.remmen + rapport.wisselgeld + 2 * (rapport.klappen + rapport.flitsen)
      const bedrag =
        rapport.fouten === 0
          ? GEBEURTENIS.controleGoed
          : rapport.fouten <= 2
            ? GEBEURTENIS.controleRedelijk
            : rapport.fouten <= 4
              ? 0
              : GEBEURTENIS.controleSlecht
      return { soort: g.soort, gehaald: rapport.fouten <= 2, bedrag, rapport }
    }
  }
}

/** Wat onderweg gebeurde, zoals het in het logboek komt. */
export interface Onderweg {
  flitsen: Flits[]
  /** Alle boetes samen, in euro's. */
  boetes: number
  gebeurtenis?: Uitslag
  /**
   * Hoe de voorvallen van de dienst afliepen (B7, shared/voorval.ts). Dit is
   * het contract met de cloud: het bedrijf boekt hieruit kas, reputatie en XP.
   * Ontbreekt in logboeken van voor de voorvallen, en zolang de motor er niet
   * is (ronde 2).
   */
  voorvallen?: VoorvalUitslag[]
  /** Wat er netto bij het loon komt (negatief: eraf). */
  bedrag: number
}

/**
 * Wat er onderweg bij het loon komt: de gebeurtenis, min de boetes, plus de
 * voorvallen (geoefende tellen niet; zie `somVanVoorvallen`).
 */
export function onderwegVan(
  g: Gebeurtenis | undefined,
  staat: Rittenstaat | undefined,
  sessie: Sessie,
  voorvallen: readonly VoorvalUitslag[] = []
): Onderweg | undefined {
  const flitsen = staat?.flitsen ?? []
  const boetes = flitsen.reduce((som, f) => som + f.boete, 0)
  const gebeurtenis = g ? beoordeel(g, staat, sessie) : undefined
  if (!gebeurtenis && flitsen.length === 0 && voorvallen.length === 0) return undefined
  const uitVoorvallen = somVanVoorvallen(voorvallen).bedrag
  return {
    flitsen,
    boetes,
    gebeurtenis,
    ...(voorvallen.length > 0 ? { voorvallen: [...voorvallen] } : {}),
    bedrag: Math.round(((gebeurtenis?.bedrag ?? 0) - boetes + uitVoorvallen) * 100) / 100
  }
}

/** Wat de telefoon tijdens de dienst van onderweg ziet; zie `onderwegVoorTelefoon` in main. */
export interface OnderwegBeeld {
  /** De gebeurtenis; de controleurs alleen zolang ze aan boord zijn. */
  gebeurtenis?: Gebeurtenis
  /** Bij controle: waar de controleurs uitstappen. */
  uitstapHalte?: string
  /** De tijdhaltes tot nu toe, uit de rittenstaat. */
  stiptheid?: { goed: number; vroeg: number; laat: number }
  /** Hoe vaak er deze dienst geflitst is. */
  flitsen: number
  /** De laatste flits, een halve minuut lang; `om` in ms. */
  flits?: { kmh: number; limiet: number; boete: number; om: number }
  /** Het voorval dat nu loopt (B7; de motor komt in ronde 2). */
  voorval?: VoorvalBeeld
}
