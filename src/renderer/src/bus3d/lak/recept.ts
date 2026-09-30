import type { Laag, LakRecept, Plaats, SnelleLakStand, StrookSjabloon, Zijde } from '../../../../shared/lak'
import type { Zone } from './zones'

/**
 * SNELLE LAK EN DE STARTS ALS LAGEN (lakstudio-ontwerp §2.1, §4.4, §6)
 *
 * Een recept bevat alleen wat per model klopt: kleuren (de grootste zone krijgt
 * kleur 1), een strook ten opzichte van de doos en de raamlijn, tekst en logo per
 * zijde als deel van de lengte. Dezelfde code maakt straks de huisstijl (fase 2).
 * Puur: geen GPU, geen DOM. Ook de meetkunde van een decal (hoeken, assen per
 * zijde) staat hier: het venster wijst er handvatten mee aan, de werker tekent
 * er de decal mee (lakshaders.ts `decal`), en die twee moeten hetzelfde zeggen.
 */

export type V3 = [number, number, number]

export interface Busmaat {
  /** De doos in o3d-assen. */
  min: V3
  max: V3
  /** De raamlijn per zijde (m, o3d-y), als die er is. */
  raamlijn?: { L?: number; R?: number }
}

let teller = 0
export const nieuwId = (voor: string): string => `${voor}${Date.now().toString(36)}${(teller++).toString(36)}`

function basis(naam: string, id?: string): Pick<Laag, 'id' | 'naam' | 'zichtbaar' | 'dekking' | 'detail' | 'uitRecept'> {
  return { id: id ?? nieuwId('l'), naam, zichtbaar: true, dekking: 1, detail: 1, uitRecept: true }
}

/** Een effen grondkleur: een zone die alles van de lak dekt (het masker beschermt de rest). */
export function grondkleur(kleur: string, naam = 'Grondkleur', id?: string): Laag {
  return { ...basis(naam, id), soort: 'zone', centrum: [50, 0, 0], straal: 1000, kleur }
}

/** De raamlijn ten opzichte van de onderkant van de doos (m). */
export function raamHoogte(maat: Busmaat): number {
  const raam = Math.min(maat.raamlijn?.L ?? Infinity, maat.raamlijn?.R ?? Infinity)
  return Number.isFinite(raam) ? raam - maat.min[1] : (maat.max[1] - maat.min[1]) * 0.45
}

/** Een strook volgens een sjabloon (§1: acht sjablonen), met hoogtes uit de doos en de raamlijn. */
export function strook(sjabloon: StrookSjabloon, kleur: string, maat: Busmaat, naam = 'Strook', id?: string): Laag {
  const hoogte = maat.max[1] - maat.min[1]
  const raamH = raamHoogte(maat)
  const b = (h1: number, h2: number, extra: Partial<Extract<Laag, { soort: 'strook' }>> = {}): Laag => ({
    ...basis(naam, id),
    soort: 'strook',
    sjabloon,
    h1,
    h2,
    hoek: 0,
    golf: 0,
    zijden: 'rondom',
    kleur,
    ...extra
  })
  switch (sjabloon) {
    case 'onderband':
      return b(0, Math.max(0.2, raamH * 0.35))
    case 'raamband':
      return b(raamH - 0.12, raamH + 0.02)
    case 'dakband':
      return b(hoogte - 0.35, hoogte + 0.1)
    case 'schuin':
      return b(raamH * 0.2, raamH * 0.55, { hoek: Math.atan(0.12) * (180 / Math.PI), zijden: 'zijden' })
    case 'golf':
      return b(raamH * 0.3, raamH * 0.55, { golf: 0.12, zijden: 'zijden' })
    case 'tweekleurig':
      return b(0, raamH)
    // Front- en achtervlak: het vlak zelf (waar de normaal naar voren of achteren wijst), over de hele hoogte.
    case 'frontvlak':
      return b(0, hoogte + 0.1, { zijden: 'voor' })
    case 'achtervlak':
      return b(0, hoogte + 0.1, { zijden: 'achter' })
  }
}

/** Een plek op een zijde, als deel van de lengte (0 = achter, 1 = voor) en hoogte in m boven de onderkant. */
export function plaatsOp(zijde: 'L' | 'R', deelLengte: number, hoogteBoven: number, breedteM: number, maat: Busmaat): Plaats {
  const z = maat.min[2] + (maat.max[2] - maat.min[2]) * deelLengte
  const x = zijde === 'R' ? maat.max[0] : maat.min[0]
  return { zijde, midden: [x, maat.min[1] + hoogteBoven, z], breedteM, draai: 0, spiegel: 'gekoppeld' }
}

/* ------------------------------------------------------------------ tekst en decals */

/** Het lettertype van een tekstlaag zoals het doek het vraagt (vet, 200 px; zie `tekstMaat`). */
export function tekstFont(lettertype: string): string {
  return `700 200px "${lettertype || 'Hanken Grotesk'}", "Hanken Grotesk", sans-serif`
}

/**
 * Een tekst op het doek van een decal (1024×512): 200 px per letterhoogte, en
 * het hele vak is 1,35 letterhoogte hoog (plaats voor staarten en de omlijning).
 * `breedtePx` is de gemeten breedte bij 200 px (met de letterafstand).
 */
export const TEKST_VAK = 270
export function tekstBreedteM(breedtePx: number, hoogteCm: number): number {
  return Math.max(0.01, (breedtePx / 200) * (hoogteCm / 100))
}

/** De sleutel van een decal in de array (werker) en van het beeld van een tekst (venster). */
export function decalSleutel(l: Laag): string | undefined {
  if (l.soort === 'tekst')
    return `t|${l.tekst}|${l.lettertype}|${l.kleur}|${l.omlijning?.kleur ?? ''}|${l.omlijning?.breedteCm ?? 0}|${l.letterafstand ?? 0}|${l.hoogteCm}`
  if (l.soort === 'afbeelding') return `a|${l.beeld}|${l.witDoorzichtig ? 1 : 0}`
  if (l.soort === 'vorm') return `v|${l.vorm}`
  return undefined
}

/** Breedte en hoogte (m) van een decal op de bus, zoals de werker hem tekent (`laagBlok`). */
export function decalMaat(l: Laag, beeldVerhouding?: number): { b: number; h: number } | undefined {
  if (l.soort === 'tekst') return { b: Math.max(l.plaats.breedteM, 0.01), h: (l.hoogteCm / 100) * (TEKST_VAK / 200) }
  if (l.soort === 'afbeelding') return { b: l.plaats.breedteM, h: l.plaats.breedteM * (beeldVerhouding ?? l.verhouding ?? 0.5) }
  if (l.soort === 'vorm') return { b: l.plaats.breedteM, h: l.plaats.breedteM }
  return undefined
}

/**
 * De assen van een zijde in o3d-assen, precies zoals `decal` in lakshaders.ts:
 * `u` loopt in de breedte van de decal, `v` omhoog, `n` is de projectierichting
 * naar buiten.
 */
export function zijdeAssen(zijde: Zijde): { u: V3; v: V3; n: V3 } {
  switch (zijde) {
    case 'L':
      return { u: [0, 0, -1], v: [0, 1, 0], n: [-1, 0, 0] }
    case 'R':
      return { u: [0, 0, 1], v: [0, 1, 0], n: [1, 0, 0] }
    case 'V':
      return { u: [-1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] }
    case 'A':
      return { u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, -1] }
    case 'D':
      return { u: [1, 0, 0], v: [0, 0, 1], n: [0, 1, 0] }
  }
}

/** De vier hoeken van een decal (o3d-assen): linksonder, rechtsonder, rechtsboven, linksboven. */
export function decalHoeken(p: Plaats, b: number, h: number): V3[] {
  const { u, v } = zijdeAssen(p.zijde)
  const c = Math.cos((p.draai * Math.PI) / 180)
  const s = Math.sin((p.draai * Math.PI) / 180)
  // De shader draait (u, v) met +draai naar het vak; terug is de omgekeerde draaiing.
  return [
    [-b / 2, -h / 2],
    [b / 2, -h / 2],
    [b / 2, h / 2],
    [-b / 2, h / 2]
  ].map(([a, bb]) => {
    const uu = a * c - bb * s
    const vv = a * s + bb * c
    return [0, 1, 2].map((k) => p.midden[k] + u[k] * uu + v[k] * vv) as V3
  })
}

/** De zijde bij een normaal (o3d-assen): de grootste component. */
export function zijdeVan(n: V3): Zijde {
  const a = n.map(Math.abs)
  if (a[1] >= a[0] && a[1] >= a[2]) return 'D'
  if (a[0] >= a[2]) return n[0] >= 0 ? 'R' : 'L'
  return n[2] >= 0 ? 'V' : 'A'
}

/** Een nieuwe plaats op een aangewezen punt (§2.3: een klik op de bus). */
export function plaatsBij(punt: V3, normaal: V3, breedteM: number): Plaats {
  return { zijde: zijdeVan(normaal), midden: [...punt] as V3, breedteM, draai: 0, spiegel: 'gekoppeld' }
}

/* ------------------------------------------------------------------ Snelle lak */

export interface ReceptNamen {
  grond: string
  strook: (s: StrookSjabloon) => string
  tekst: string
  logo: string
}

/** Vaste id's: een nieuwe keuze in het paneel werkt de laag bij in plaats van er een te stapelen. */
export const RECEPT_ID = { grond: 'r-grond', strook: 'r-strook', tekst: 'r-tekst', logo: 'r-logo' } as const

/**
 * Waar tekst en logo van Snelle lak komen (§2.1: "boven de band"): midden tussen
 * de bovenkant van de band en de raamlijn, en nooit zo hoog dat een decal van
 * `hoogte` m op de ramen valt (daar lakt het masker niet).
 */
export function boven(lagen: Laag[], maat: Busmaat, hoogte: number): number {
  return naamPlek(lagen, maat, hoogte).y
}

/**
 * De hoogte van de naam (of het logo) boven de onderkant, en of hij OP de band
 * staat: is er tussen de band en de raamlijn geen plaats (de speler sleepte de
 * band tot vlak onder de ramen, C2), dan midden op de band, en dan krijgt een
 * naam zonder eigen kleur de grondkleur (anders wit op een witte band).
 */
export function naamPlek(lagen: Laag[], maat: Busmaat, hoogte: number): { y: number; opBand: boolean } {
  const raam = raamHoogte(maat)
  const band = lagen.find((l) => l.id === RECEPT_ID.strook)
  const zijband = band && band.soort === 'strook' && band.zijden !== 'voor' && band.zijden !== 'achter' ? band : undefined
  const onder = zijband && zijband.h2 < raam ? zijband.h2 : raam * 0.35
  const nodig = hoogte + 0.1
  if (zijband && raam - onder < nodig && zijband.h2 - Math.max(0, zijband.h1) >= nodig) {
    return { y: (Math.max(0, zijband.h1) + Math.min(zijband.h2, raam)) / 2, opBand: true }
  }
  return { y: Math.max(hoogte / 2 + 0.05, Math.min((onder + raam) / 2, raam - hoogte / 2 - 0.08)), opBand: false }
}

/**
 * De naam en het logo van Snelle lak blijven boven de band als de speler de band
 * versleept (§2.1, 0:28), zolang hij ze zelf niet verplaatste (`vast`).
 */
export function volgBand(lagen: Laag[], maat: Busmaat, vast: ReadonlySet<string>, snel?: SnelleLakStand): Laag[] {
  return lagen.map((l) => {
    if (vast.has(l.id) || (l.id !== RECEPT_ID.tekst && l.id !== RECEPT_ID.logo) || !('plaats' in l)) return l
    const m = decalMaat(l)
    if (!m) return l
    const plek = naamPlek(lagen, maat, m.h)
    const midden: V3 = [l.plaats.midden[0], maat.min[1] + plek.y, l.plaats.midden[2]]
    const kleur = l.soort === 'tekst' && snel && !snel.kleuren[2] ? naamKleur(snel, plek.opBand) : undefined
    return { ...l, ...(kleur ? { kleur } : {}), plaats: { ...l.plaats, midden } } as Laag
  })
}

/** De kleur van de naam zonder eigen kleur 3: wit, of op de band de grondkleur. */
function naamKleur(snel: SnelleLakStand, opBand: boolean): string {
  return snel.kleuren[2] ?? (opBand ? (snel.kleuren[0] ?? '#1d3f8f') : '#ffffff')
}

/**
 * Snelle lak (§2.1) toegepast op de lagen: elke keuze wordt meteen een gewone
 * laag. Grondkleur en strook komen onderaan, tekst en logo bovenaan. Bestaat de
 * laag al, dan verandert alleen wat het paneel kiest: een band die de speler in
 * de studio hoger sleepte, blijft zo hoog zolang het sjabloon hetzelfde is.
 * `tekstBreedte` meet een tekst bij 200 px (het venster meet met het echte
 * lettertype).
 */
export function pasSnelleLak(
  lagen: Laag[],
  snel: SnelleLakStand,
  maat: Busmaat,
  namen: ReceptNamen,
  tekstBreedte: (tekst: string, lettertype: string) => number
): Laag[] {
  let uit = [...lagen]
  const vind = (id: string): number => uit.findIndex((l) => l.id === id)
  const zet = (id: string, laag: Laag | undefined, onder: number | undefined): void => {
    const i = vind(id)
    if (!laag) {
      if (i >= 0) uit.splice(i, 1)
      return
    }
    if (i >= 0) uit[i] = laag
    else if (onder !== undefined) uit.splice(Math.min(onder, uit.length), 0, laag)
    else uit.push(laag)
  }
  // Grondkleur
  const g = uit[vind(RECEPT_ID.grond)]
  zet(
    RECEPT_ID.grond,
    snel.kleuren[0] ? (g && g.soort === 'zone' ? { ...g, kleur: snel.kleuren[0] } : grondkleur(snel.kleuren[0], namen.grond, RECEPT_ID.grond)) : undefined,
    0
  )
  // Strook: zodra kleur 2 of een strook gekozen is.
  const st = uit[vind(RECEPT_ID.strook)]
  const strookKleur = snel.kleuren[1] ?? '#ffffff'
  const wilStrook = Boolean(snel.kleuren[1]) || Boolean(snel.strookGekozen)
  const nieuweStrook =
    st && st.soort === 'strook' && st.sjabloon === snel.strook
      ? ({ ...st, kleur: strookKleur } as Laag)
      : strook(snel.strook, strookKleur, maat, namen.strook(snel.strook), RECEPT_ID.strook)
  zet(RECEPT_ID.strook, wilStrook ? { ...nieuweStrook, naam: namen.strook(snel.strook) } : undefined, vind(RECEPT_ID.grond) >= 0 ? vind(RECEPT_ID.grond) + 1 : 0)
  // De naam op de bus: boven de band, 25 cm, aan beide kanten leesbaar (de spiegel).
  const te = uit[vind(RECEPT_ID.tekst)]
  if (snel.naam.trim()) {
    const lettertype = snel.lettertype ?? 'Hanken Grotesk'
    const hoogteCm = te && te.soort === 'tekst' ? te.hoogteCm : 25
    const breedte = tekstBreedteM(tekstBreedte(snel.naam, lettertype), hoogteCm)
    const plek = naamPlek(uit, maat, (hoogteCm / 100) * (TEKST_VAK / 200))
    const kleur = naamKleur(snel, te && te.soort === 'tekst' ? Math.abs(te.plaats.midden[1] - maat.min[1] - plek.y) < 0.05 && plek.opBand : plek.opBand)
    const nieuw: Laag =
      te && te.soort === 'tekst'
        ? { ...te, tekst: snel.naam, kleur, lettertype, plaats: { ...te.plaats, breedteM: breedte } }
        : {
            ...basis(namen.tekst, RECEPT_ID.tekst),
            soort: 'tekst',
            tekst: snel.naam,
            lettertype,
            hoogteCm,
            kleur,
            plaats: plaatsOp('R', 0.45, plek.y, breedte, maat)
          }
    zet(RECEPT_ID.tekst, nieuw, undefined)
  } else zet(RECEPT_ID.tekst, undefined, undefined)
  // Het logo: vooraan op beide zijden, 60 cm breed.
  const lo = uit[vind(RECEPT_ID.logo)]
  if (snel.logo) {
    const nieuw: Laag =
      lo && lo.soort === 'afbeelding'
        ? { ...lo, beeld: snel.logo, verhouding: snel.logoVerhouding ?? lo.verhouding }
        : {
            ...basis(namen.logo, RECEPT_ID.logo),
            soort: 'afbeelding',
            beeld: snel.logo,
            witDoorzichtig: true,
            verhouding: snel.logoVerhouding,
            plaats: plaatsOp('R', 0.8, boven(uit, maat, 0.6 * (snel.logoVerhouding ?? 0.5)), 0.6, maat)
          }
    zet(RECEPT_ID.logo, nieuw, undefined)
  } else zet(RECEPT_ID.logo, undefined, undefined)
  uit = uit.filter(Boolean)
  return uit
}

/**
 * Snelle lak (§2.1) in één keer, uit een recept (de huisstijl, fase 2): grondkleur,
 * een strook, de naam boven de band en een logo vooraan.
 */
export function snelleLak(recept: LakRecept, maat: Busmaat, namen: ReceptNamen, tekstBreedte: (tekst: string, lettertype: string) => number): Laag[] {
  return pasSnelleLak(
    [],
    {
      kleuren: [recept.kleuren[0], recept.kleuren[1] ?? null, recept.kleuren[2] ?? null],
      strook: recept.strook,
      strookGekozen: true,
      naam: recept.naam ?? '',
      logo: recept.logo
    },
    maat,
    namen,
    tekstBreedte
  )
}

/** De straal van een zonelaag: de helft van de afstand tot het dichtstbijzijnde andere centrum. */
export function zoneStraal(lab: V3, alle: V3[]): number {
  let d = Infinity
  for (const c of alle) {
    const x = Math.hypot(c[0] - lab[0], c[1] - lab[1], c[2] - lab[2])
    if (x > 0.5) d = Math.min(d, x)
  }
  return Number.isFinite(d) ? Math.max(4, Math.min(40, d / 2)) : 1000
}

/**
 * De straal voor Vullen (§1): een klik kleurt de hele zone. Een lak met vuil en
 * schaduw (SD77) valt in k-means uiteen in een paar tinten van dezelfde kleur;
 * die horen bij elkaar (ΔE ≤ 30), anders kwam er een vlekkerig patroon van de
 * andere tinten doorheen. De straal pakt dan de hele groep, zolang er een
 * andere zone verder weg ligt; anders de helft tot de buur (`zoneStraal`).
 */
export function vulStraal(lab: V3, alle: V3[]): number {
  const afstand = alle.map((c) => Math.hypot(c[0] - lab[0], c[1] - lab[1], c[2] - lab[2]))
  const groep = afstand.filter((x) => x > 0.5 && x <= 30)
  const ander = afstand.filter((x) => x > 30)
  const verste = Math.max(0, ...groep)
  const buur = Math.min(Infinity, ...ander)
  if (!Number.isFinite(buur)) return 1000
  if (verste > 0 && verste < buur - 4) return (verste + buur) / 2
  return zoneStraal(lab, alle)
}

/**
 * "Effen in de kleuren van deze lak" (§4.4): per lakzone een zonelaag met de
 * mediane kleur van de huidige lak op die texels. Logo's, wagennummers en
 * reclame verdwijnen, want die tekent de basis niet.
 */
export function effenInKleuren(zones: Array<Pick<Zone, 'lab' | 'lak'> & { kleur?: string }>, naam: (i: number) => string): Laag[] {
  const alle = zones.map((z) => z.lab as V3)
  return zones
    .filter((z) => z.lak && z.kleur)
    .map((z, i) => ({
      ...basis(naam(i + 1)),
      soort: 'zone' as const,
      centrum: z.lab,
      straal: zoneStraal(z.lab as V3, alle),
      kleur: z.kleur!
    }))
}

/**
 * De gespiegelde kopie van een tekst, afbeelding of vorm (§4.8): de plek
 * gespiegeld in het vlak (x → 2·vlak − x), de zijde omgedraaid. Tekst blijft
 * leesbaar (de projectie per zijde draait vanzelf mee); vormen en afbeeldingen
 * worden gespiegeld, tenzij "zelfde richting".
 */
export function spiegelPlaats(p: Plaats, vlakX = 0): { plaats: Plaats; spiegelBeeld: boolean } | undefined {
  if (p.spiegel !== 'gekoppeld' || (p.zijde !== 'L' && p.zijde !== 'R')) return undefined
  return {
    plaats: { ...p, zijde: p.zijde === 'L' ? 'R' : 'L', midden: [2 * vlakX - p.midden[0], p.midden[1], p.midden[2]] },
    spiegelBeeld: !p.zelfdeRichting
  }
}
