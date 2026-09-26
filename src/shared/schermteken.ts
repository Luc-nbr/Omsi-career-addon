/**
 * DE REKENSOMMEN ACHTER HET NAGETEKENDE SCHERM
 *
 * `renderer/apparaatscherm.tsx` tekent een `Schermvorm` (shared/scherm.ts) op
 * een canvas. Alles wat daarbij te rekenen valt en geen browser nodig heeft,
 * staat hier: welke onderdelen er nu te zien zijn en in welke volgorde, welk
 * plaatje een onderdeel op dit moment draagt, welke aanraakvlakken meedoen, en
 * de affiene afbeelding van een plekje in een plaatje (u, v) naar een plek op
 * het scherm (s, t). Daardoor is het ook zonder canvas na te rekenen.
 *
 * WAAROM AFFIEN PER DRIEHOEK
 * OMSI legt een plaatje met de uv's van de hoekpunten over elke driehoek. Op een
 * plat vlak, met een loodrechte blik, is dat binnen één driehoek precies een
 * affiene afbeelding (a·u + c·v + e, b·u + d·v + f) -- dezelfde vorm die
 * `CanvasRenderingContext2D.setTransform` en `CanvasPattern.setTransform`
 * verwachten. De ALMEX van de HH20 is één vierhoek van twee driehoeken met
 * dezelfde afbeelding: u 0,0005..1,0001 over de volle breedte, v 0,12..0,88
 * (rij 122..901 van 17_almex_s_0.jpg) over de volle hoogte.
 *
 * WAAROM DRIEHOEKEN SAMENNEMEN
 * Knipt de browser twee driehoeken met een gedeelde rand elk apart af, dan
 * dekken ze die rand allebei maar half (anti-aliasing), en schijnt de
 * achtergrond als een dun lijntje door de diagonaal. Driehoeken die dezelfde
 * afbeelding hebben -- zoals de twee helften van een zuivere rechthoek -- gaan
 * daarom samen in één knippad en worden in één keer gevuld. In het spel is een
 * vierhoek vaak net geen parallellogram: bij de HH20 liggen de hoeken van het
 * scherm op s 0,99867 en 0,00327, de twee helften verschillen 2e-3, en 74 van
 * de 81 onderdelen vallen in twee groepen. Die tekent apparaatscherm.tsx
 * (tekenDeel) eerst opgeteld in een eigen laag, zodat de twee halve randen
 * samen weer heel zijn.
 */
import { isZichtbaar, rondOmsi, type Schermdeel, type Schermklik, type Schermstand, type Schermvorm } from './scherm'

/** Een punt: (u, v) in een plaatje of (s, t) op het scherm. */
export type Punt = [number, number]

/**
 * Een affiene afbeelding in de volgorde van `setTransform(a, b, c, d, e, f)`:
 * x' = a·x + c·y + e, y' = b·x + d·y + f.
 */
export type Affien = [number, number, number, number, number, number]

/**
 * De affiene afbeelding die de drie punten van `bron` op die van `doel` legt.
 *
 * `undefined` als de bron geen driehoek is: de drie uv's vallen samen of liggen
 * op één lijn. Dat komt voor -- een vlak dat al zijn hoekpunten op één
 * beeldpunt van het plaatje heeft, om zo een effen kleur uit een atlas te halen
 * -- en dan is er geen afbeelding, alleen die ene kleur (zie `Driehoekgroep.uv`).
 *
 * Voorbeeld: bron (0,0) (1,0) (0,1) naar doel (10,20) (110,20) (10,70) geeft
 * [100, 0, 0, 50, 10, 20].
 */
export function affien(bron: [Punt, Punt, Punt], doel: [Punt, Punt, Punt]): Affien | undefined {
  const [p0, p1, p2] = bron
  const [q0, q1, q2] = doel
  const ux = p1[0] - p0[0]
  const uy = p1[1] - p0[1]
  const vx = p2[0] - p0[0]
  const vy = p2[1] - p0[1]
  const det = ux * vy - vx * uy
  /*
   * Ontaard als de oppervlakte in verhouding tot de randen verwaarloosbaar is:
   * de sinus van de hoek tussen de twee randen onder 1e-6. De uv's uit een .o3d
   * zijn enkele precisie; drie punten op één lijn geven dan een sinus van rond
   * 1e-7, geen nul. Een klein maar echt driehoekje (een tiende beeldpunt breed
   * in een plaatje van 1024) haalt het ruim.
   */
  const randen = Math.hypot(ux, uy) * Math.hypot(vx, vy)
  if (!(randen > 0) || Math.abs(det) <= 1e-6 * randen) return undefined
  const px = q1[0] - q0[0]
  const py = q1[1] - q0[1]
  const qx = q2[0] - q0[0]
  const qy = q2[1] - q0[1]
  const a = (px * vy - qx * uy) / det
  const c = (qx * ux - px * vx) / det
  const b = (py * vy - qy * uy) / det
  const d = (qy * ux - py * vx) / det
  return [a, b, c, d, q0[0] - a * p0[0] - c * p0[1], q0[1] - b * p0[0] - d * p0[1]]
}

/** Een punt door een affiene afbeelding. */
export function pasToe(m: Affien, p: Punt): Punt {
  return [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]]
}

/** Eerst `binnen`, dan `buiten`: de afbeelding buiten(binnen(p)). */
export function samenstel(buiten: Affien, binnen: Affien): Affien {
  const [a, b, c, d, e, f] = buiten
  const [A, B, C, D, E, F] = binnen
  return [a * A + c * B, b * A + d * B, a * C + c * D, b * C + d * D, a * E + c * F + e, b * E + d * F + f]
}

/**
 * Van beeldpunten van een plaatje (`w` x `h`) naar beeldpunten van het canvas
 * (`breed` x `hoog`), gegeven de afbeelding `m` van uv naar (s, t).
 *
 * Een beeldpunt (X, Y) is uv (X / w, Y / h), en (s, t) is op het canvas
 * (s · breed, t · hoog); samen is dat [breed·a/w, hoog·b/w, breed·c/h, hoog·d/h,
 * breed·e, hoog·f]. Dat is wat het patroon of `drawImage` krijgt.
 */
export function naarCanvas(m: Affien, w: number, h: number, breed: number, hoog: number): Affien {
  return [(breed * m[0]) / w, (hoog * m[1]) / w, (breed * m[2]) / h, (hoog * m[3]) / h, breed * m[4], hoog * m[5]]
}

/** Driehoeken van één onderdeel die één knippad en één afbeelding delen. */
export interface Driehoekgroep {
  /** Zes getallen per driehoek: s0 t0 s1 t1 s2 t2. */
  st: number[]
  /** Van uv naar (s, t). Ontbreekt als de uv's geen driehoek vormen. */
  m?: Affien
  /** Zonder `m`: het plekje in het plaatje waar de hele groep zijn kleur vandaan haalt. */
  uv?: Punt
  /** De kleinste en grootste u en v van de groep, voor de randen bij 'clamp'. */
  uvMin: Punt
  uvMax: Punt
}

/**
 * Hoe ver een punt uit een andere driehoek van een afbeelding mag afwijken om
 * er toch bij te horen, in delen van het scherm: 2e-4 is 0,2 beeldpunt op een
 * scherm van 1000 breed -- niet te zien, en ruim boven de afronding van de uv's.
 */
const ZELFDE_AFBEELDING = 2e-4

/**
 * De driehoeken van een onderdeel (`Schermdeel.driehoeken`, twaalf getallen per
 * driehoek) in groepen met dezelfde afbeelding.
 *
 * Een driehoek hoort bij een groep als de afbeelding van die groep zijn drie
 * uv's op zijn eigen (s, t) legt, tot op `ZELFDE_AFBEELDING`. Een vierhoek van
 * twee driehoeken met doorlopende uv's wordt zo één groep: geen naad over de
 * diagonaal.
 */
export function driehoekgroepen(driehoeken: number[]): Driehoekgroep[] {
  const groepen: Driehoekgroep[] = []
  for (let i = 0; i + 11 < driehoeken.length; i += 12) {
    const st: [Punt, Punt, Punt] = [
      [driehoeken[i], driehoeken[i + 1]],
      [driehoeken[i + 4], driehoeken[i + 5]],
      [driehoeken[i + 8], driehoeken[i + 9]]
    ]
    const uv: [Punt, Punt, Punt] = [
      [driehoeken[i + 2], driehoeken[i + 3]],
      [driehoeken[i + 6], driehoeken[i + 7]],
      [driehoeken[i + 10], driehoeken[i + 11]]
    ]
    if (![...st, ...uv].every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]))) continue
    const m = affien(uv, st)
    const vlak = st.flat()
    const uvMin: Punt = [Math.min(uv[0][0], uv[1][0], uv[2][0]), Math.min(uv[0][1], uv[1][1], uv[2][1])]
    const uvMax: Punt = [Math.max(uv[0][0], uv[1][0], uv[2][0]), Math.max(uv[0][1], uv[1][1], uv[2][1])]
    const past =
      m &&
      groepen.find(
        (g) =>
          g.m &&
          uv.every((p, k) => {
            const q = pasToe(g.m!, p)
            return Math.abs(q[0] - st[k][0]) <= ZELFDE_AFBEELDING && Math.abs(q[1] - st[k][1]) <= ZELFDE_AFBEELDING
          })
      )
    if (past) {
      past.st.push(...vlak)
      past.uvMin = [Math.min(past.uvMin[0], uvMin[0]), Math.min(past.uvMin[1], uvMin[1])]
      past.uvMax = [Math.max(past.uvMax[0], uvMax[0]), Math.max(past.uvMax[1], uvMax[1])]
    } else if (m) {
      groepen.push({ st: vlak, m, uvMin, uvMax })
    } else {
      /*
       * Geen afbeelding: de kleur van het midden van de drie uv's. Driehoeken
       * met hetzelfde punt gaan ook samen -- een effen vierhoek is anders weer
       * twee driehoeken met een naad.
       */
      const midden: Punt = [(uv[0][0] + uv[1][0] + uv[2][0]) / 3, (uv[0][1] + uv[1][1] + uv[2][1]) / 3]
      const zelfde = groepen.find(
        (g) => g.uv && Math.abs(g.uv[0] - midden[0]) <= 1e-6 && Math.abs(g.uv[1] - midden[1]) <= 1e-6
      )
      if (zelfde) zelfde.st.push(...vlak)
      else groepen.push({ st: vlak, uv: midden, uvMin, uvMax })
    }
  }
  return groepen
}

/** De kleinste rechthoek om een reeks (s, t)-paren: [x, y, breedte, hoogte]. */
export function omhulsel(st: number[]): [number, number, number, number] {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (let i = 0; i + 1 < st.length; i += 2) {
    x0 = Math.min(x0, st[i])
    x1 = Math.max(x1, st[i])
    y0 = Math.min(y0, st[i + 1])
    y1 = Math.max(y1, st[i + 1])
  }
  return x0 <= x1 && y0 <= y1 ? [x0, y0, x1 - x0, y1 - y0] : [0, 0, 0, 0]
}

/**
 * De onderdelen die nu getekend worden, als plekken in `vorm.delen`, in de
 * volgorde waarin ze getekend worden.
 *
 * De volgorde is die van de vorm: `core/schermvorm.ts` heeft ze al op diepte
 * gezet, met bij gelijke diepte de volgorde uit de cfg. Hier wordt niet
 * opnieuw gesorteerd -- dat zou die tweede regel kapotmaken.
 *
 * Getekend wordt alleen wat zeker zichtbaar is (`isZichtbaar` === true). Weet
 * de telefoon het niet (een voorwaarde, en nog geen getallen van de plugin),
 * dan blijft het weg: anders stonden de 29 achtergronden van de ALMEX -- één
 * per menu -- allemaal over elkaar heen.
 */
export function tekenvolgorde(vorm: Schermvorm, stand: Schermstand): number[] {
  const uit: number[] = []
  vorm.delen.forEach((deel, index) => {
    if (isZichtbaar(stand, deel) === true) uit.push(index)
  })
  return uit
}

/**
 * Of de telefoon van elk onderdeel en elk aanraakvlak weet of het nu te zien
 * is. Niet als de plugin geen getallen en geen meshvlaggen levert (van voor
 * versie 13) terwijl de vorm voorwaarden heeft: dan kan hij niet weten welk
 * menu er openstaat, en is elk beeld een gok -- bij de ALMEX een zwart vlak met
 * alleen de teksten erop, en 66 aanraakvlakken van alle menu's door elkaar.
 * `Apparaatscherm` laat dan de terugval staan (nakijken_aflevering.md §9: "zolang
 * g ontbreekt terwijl die nodig is, het bestaande paneel-vlak").
 */
export function zichtbaarheidBekend(vorm: Schermvorm, stand: Schermstand): boolean {
  return (
    vorm.delen.every((deel) => isZichtbaar(stand, deel) !== undefined) &&
    vorm.klikken.every((klik) => isZichtbaar(stand, klik) !== undefined)
  )
}

/**
 * De aanraakvlakken die nu meedoen, als plekken in `vorm.klikken`, de voorste
 * als laatste (dat is de volgorde van de vorm).
 *
 * Anders dan bij het tekenen doet een vlak ook mee als zijn zichtbaarheid
 * onbekend is (`isZichtbaar` geeft `undefined`): liever een knop die werkt en
 * die je niet ziet, dan een scherm waar niets op reageert. Alleen wat zeker
 * verborgen is (`false`) valt af.
 */
export function zichtbareKlikken(vorm: Schermvorm, stand: Schermstand): number[] {
  const uit: number[] = []
  vorm.klikken.forEach((klik, index) => {
    if (isZichtbaar(stand, klik) !== false) uit.push(index)
  })
  return uit
}

/**
 * Of een aanraakvlak een echte rechthoek is: vier eindige getallen en een
 * breedte en hoogte boven nul. Een NaN uit de vorm komt als `null` over het
 * netwerk, en `null` telt in een vergelijking als 0 -- dan werd het een knop
 * linksboven.
 */
export function isRechthoek(klik: Schermklik): boolean {
  return [klik.x, klik.y, klik.b, klik.h].every((x) => typeof x === 'number' && Number.isFinite(x)) && klik.b > 0 && klik.h > 0
}

/**
 * Welk aanraakvlak er op (s, t) ligt: van de vlakken die meedoen het voorste,
 * dus het laatste in de volgorde van de vorm. Hetzelfde als wat de browser
 * kiest bij de knoppen van `Apparaatscherm`, die in die volgorde over elkaar
 * liggen.
 */
export function klikOp(vorm: Schermvorm, stand: Schermstand, s: number, t: number): Schermklik | undefined {
  const mee = zichtbareKlikken(vorm, stand)
  for (let k = mee.length - 1; k >= 0; k--) {
    const klik = vorm.klikken[mee[k]]
    if (!isRechthoek(klik)) continue
    if (s >= klik.x && s <= klik.x + klik.b && t >= klik.y && t <= klik.y + klik.h) return klik
  }
  return undefined
}

/**
 * Het id van het plaatje dat een `beeld` nu draagt, of `undefined` als het
 * onderdeel nu geen plaatje heeft (en dan niet getekend wordt).
 *
 * Volgorde zoals OMSI de textuur kiest (nakijken_achtergrond.md §7):
 * 1. `[matl_change]`: bij waarde k >= 1 (afgerond zoals OMSI dat doet) het
 *    plaatje van item k, dus `items[k - 1]`; `null` = dat item heeft geen
 *    plaatje. Een waarde zonder item, of 0, of een onbekende variabele: het
 *    gewone plaatje. Bij de ALMEX is dat versp_hintergrund, waar item 1
 *    (almex_versp_rot = 1) het rode vlak almex_versp_rot.jpg geeft.
 *    Een item zonder eigen plaatje krijgt van core/schermvorm.ts het gewone
 *    (`items[k - 1] === textuur`); dat houdt het gewone plaatje, en bij een
 *    `[matl_freetex]` is dat de waarde van de stringvariabele, niet de
 *    standaardnaam uit de cfg.
 * 2. `[matl_freetex]`: het plaatje bij de huidige waarde van de stringvariabele
 *    (`stand.f`), als de server er een kent.
 * 3. het plaatje uit de cfg (`textuur`).
 */
export function plaatjeVan(deel: Schermdeel, stand: Schermstand): string | undefined {
  if (deel.soort !== 'beeld') return undefined
  if (deel.keuze && stand.g && !(stand.o ?? []).includes(deel.keuze.getal)) {
    const waarde = stand.g[deel.keuze.getal]
    if (typeof waarde === 'number' && Number.isFinite(waarde)) {
      const k = rondOmsi(waarde)
      if (k >= 1 && k <= deel.keuze.items.length) {
        const item = deel.keuze.items[k - 1]
        if (item === null) return undefined
        if (item !== deel.textuur) return item
      }
    }
  }
  if (deel.freetex !== undefined) {
    const vrij = stand.f?.[deel.freetex]
    if (vrij) return vrij
  }
  return deel.textuur
}

/** Alle plaatjes die nodig zijn om de stand van nu te tekenen, zonder dubbelen. */
export function nodigePlaatjes(vorm: Schermvorm, stand: Schermstand): string[] {
  const ids = new Set<string>()
  for (const index of tekenvolgorde(vorm, stand)) {
    const id = plaatjeVan(vorm.delen[index], stand)
    if (id) ids.add(id)
  }
  return [...ids]
}

/**
 * `[matl_alpha]` toepassen op een zelfgetekende tekst (RGBA, niet
 * voorvermenigvuldigd), ter plekke:
 * - 0 (ondoorzichtig): A = 255 overal. OMSI mengt dan niet, en waar geen letter
 *   staat blijft de beginwaarde van de textuur over: zwart.
 * - 1 (alfatest): A = 255 vanaf 128, anders 0 -- dezelfde drempel als de server
 *   voor plaatjes gebruikt (ONZEKER, zie nakijken_aflevering.md §12).
 * - 2 (mengen): ongewijzigd.
 * Plaatjes van de server hebben dit al gehad; alleen tekst maakt de telefoon zelf.
 */
export function tekstAlfa(rgba: Uint8ClampedArray, alfa: 0 | 1 | 2): Uint8ClampedArray {
  if (alfa === 2) return rgba
  for (let i = 3; i < rgba.length; i += 4) {
    rgba[i] = alfa === 0 || rgba[i] >= 128 ? 255 : 0
  }
  return rgba
}

/** Een kleur uit de vorm (0..1 per kanaal) als CSS. */
export function kleurCss(kleur: [number, number, number, number] | undefined): string {
  const k = (x: number | undefined): number => Math.round(Math.min(1, Math.max(0, x ?? 0)) * 255)
  return kleur ? `rgb(${k(kleur[0])}, ${k(kleur[1])}, ${k(kleur[2])})` : '#000'
}

/**
 * Hoeveel beeldpunten het canvas krijgt: wat de browser voor het vak geeft (al
 * maal devicePixelRatio), maar niet meer dan `maxBreed` breed en `maxPunten` in
 * totaal. Een iPad weigert een canvas boven ongeveer 16,7 miljoen punten, en
 * zoveel detail zit er in een plaatje van 1024 niet.
 */
export function canvasMaat(breed: number, hoog: number, maxBreed = 4096, maxPunten = 16_000_000): [number, number] {
  let b = Math.max(1, Math.round(breed))
  let h = Math.max(1, Math.round(hoog))
  const factor = Math.min(1, maxBreed / b, Math.sqrt(maxPunten / (b * h)))
  if (factor < 1) {
    b = Math.max(1, Math.floor(b * factor))
    h = Math.max(1, Math.floor(h * factor))
  }
  return [b, h]
}
