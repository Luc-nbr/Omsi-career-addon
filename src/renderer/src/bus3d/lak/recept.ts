import type { Laag, LakRecept, Plaats, StrookSjabloon } from '../../../../shared/lak'
import type { Zone } from './zones'

/**
 * SNELLE LAK EN DE STARTS ALS LAGEN (lakstudio-ontwerp §2.1, §4.4, §6)
 *
 * Een recept bevat alleen wat per model klopt: kleuren (de grootste zone krijgt
 * kleur 1), een strook ten opzichte van de doos en de raamlijn, tekst en logo per
 * zijde als deel van de lengte. Dezelfde code maakt straks de huisstijl (fase 2).
 * Puur: geen GPU, geen DOM.
 */

export interface Busmaat {
  /** De doos in o3d-assen. */
  min: [number, number, number]
  max: [number, number, number]
  /** De raamlijn per zijde (m, o3d-y), als die er is. */
  raamlijn?: { L?: number; R?: number }
}

let teller = 0
const nieuwId = (voor: string): string => `${voor}${Date.now().toString(36)}${(teller++).toString(36)}`

function basis(naam: string): Pick<Laag, 'id' | 'naam' | 'zichtbaar' | 'dekking' | 'detail' | 'uitRecept'> {
  return { id: nieuwId('l'), naam, zichtbaar: true, dekking: 1, detail: 1, uitRecept: true }
}

/** Een effen grondkleur: een zone die alles van de lak dekt (het masker beschermt de rest). */
export function grondkleur(kleur: string): Laag {
  return { ...basis('Grondkleur'), soort: 'zone', centrum: [50, 0, 0], straal: 1000, kleur }
}

/** Een strook volgens een sjabloon (§1: acht sjablonen), met hoogtes uit de doos en de raamlijn. */
export function strook(sjabloon: StrookSjabloon, kleur: string, maat: Busmaat): Laag {
  const hoogte = maat.max[1] - maat.min[1]
  const raam = Math.min(maat.raamlijn?.L ?? Infinity, maat.raamlijn?.R ?? Infinity)
  const raamH = Number.isFinite(raam) ? raam - maat.min[1] : hoogte * 0.45
  const b = (h1: number, h2: number, extra: Partial<Extract<Laag, { soort: 'strook' }>> = {}): Laag => ({
    ...basis('Strook'),
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
    // Front- en achtervlak: in L1 een band over de hele hoogte; de grens in de lengte komt met de handvatten (L3).
    case 'frontvlak':
    case 'achtervlak':
      return b(0, hoogte + 0.1)
  }
}

/** Een plek op een zijde, als deel van de lengte (0 = achter, 1 = voor) en hoogte in m boven de onderkant. */
export function plaatsOp(zijde: 'L' | 'R', deelLengte: number, hoogteBoven: number, breedteM: number, maat: Busmaat): Plaats {
  const z = maat.min[2] + (maat.max[2] - maat.min[2]) * deelLengte
  const x = zijde === 'R' ? maat.max[0] : maat.min[0]
  return { zijde, midden: [x, maat.min[1] + hoogteBoven, z], breedteM, draai: 0, spiegel: 'gekoppeld' }
}

/**
 * Snelle lak (§2.1): grondkleur, een strook, de naam boven de band (25 cm, wit
 * D-DIN, aan beide kanten leesbaar) en een logo vooraan (60 cm). Elke keuze wordt
 * een gewone laag.
 */
export function snelleLak(recept: LakRecept, maat: Busmaat): Laag[] {
  const lagen: Laag[] = [grondkleur(recept.kleuren[0])]
  const band = strook(recept.strook, recept.kleuren[1] ?? '#ffffff', maat)
  lagen.push(band)
  if (recept.naam) {
    const h2 = band.soort === 'strook' ? band.h2 : 0.8
    lagen.push({
      ...basis('Tekst'),
      soort: 'tekst',
      tekst: recept.naam,
      lettertype: 'D-DIN',
      hoogteCm: 25,
      kleur: recept.kleuren[2] ?? '#ffffff',
      plaats: plaatsOp('R', 0.45, h2 + 0.25, Math.max(1, recept.naam.length * 0.16), maat)
    })
  }
  if (recept.logo) {
    lagen.push({ ...basis('Logo'), soort: 'afbeelding', beeld: recept.logo, witDoorzichtig: true, plaats: plaatsOp('R', 0.82, 1.3, 0.6, maat) })
  }
  return lagen
}

/** "Effen in de kleuren van deze lak" (§4.4): per lakzone een zonelaag met de mediane kleur van de huidige lak. */
export function effenInKleuren(zones: Zone[], huidig: Array<[number, number, number]>): Laag[] {
  return zones
    .map((z, i) => ({ z, kleur: huidig[i] }))
    .filter(({ z, kleur }) => z.lak && kleur)
    .map(({ z, kleur }, i) => ({
      ...basis(`Zone ${i + 1}`),
      soort: 'zone' as const,
      centrum: z.lab,
      straal: 12,
      kleur: `#${kleur.map((c) => c.toString(16).padStart(2, '0')).join('')}`
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
