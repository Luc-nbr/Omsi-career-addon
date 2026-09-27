/**
 * HET SCHERM VAN EEN APPARAAT, ZOALS OMSI HET TEKENT
 *
 * Dit is de afspraak tussen de vier delen die samen een ALMEX, een IBIS of een
 * kaartautomaat natekenen op de telefoon en de tablet:
 *
 *   core/schermvorm.ts   leest model.cfg + .o3d en maakt er een `Schermvorm` van:
 *                        welke plaatjes, welke tekstvakken en welke aanraakvlakken
 *                        er op het scherm liggen, en onder welke voorwaarde;
 *   core/oft.ts          leest de lettertypen van OMSI (`Fonts/*.oft` + bitmaps)
 *                        tot `Schermfont`;
 *   core/schermtextuur.ts + main/schermtexturen.ts
 *                        zoekt de plaatjes op, zet ze om naar iets wat een browser
 *                        kan tonen, en levert ze op een id -- nooit op een pad;
 *   renderer/apparaatscherm.tsx
 *                        tekent een vorm met de `Schermstand` van dit moment.
 *
 * De VORM verandert niet zolang je in dezelfde bus zit en wordt één keer
 * opgehaald (op id). De STAND gaat tien keer per seconde mee: de teksten, de
 * getallen en welke onderdelen OMSI op dit moment toont.
 *
 * COÖRDINATEN
 * - Het scherm is een rechthoek met `verhouding` = breedte/hoogte in het echt
 *   (de ALMEX: 185 x 134 mm = 1,381). `s` loopt van 0 (links) tot 1 (rechts),
 *   `t` van 0 (boven) tot 1 (onder), gezien van de kant van de bestuurder.
 * - `u` en `v` wijzen in een plaatje: u = 0 links, u = 1 rechts; v = 0 boven,
 *   v = 1 onder, al omgerekend van de conventie van OMSI/Direct3D. Buiten 0..1
 *   herhaalt het plaatje (adres 'wrap') of niet ('clamp'/'border').
 * - Een tekstvak heeft geen plaatje maar een tekstcanvas van `b` x `h`
 *   beeldpunten; daar is u = x / b en v = y / h.
 *
 * Alles is platte JSON: de vorm gaat over het netwerk naar de tablet.
 */

/**
 * Een voorwaarde uit `[visible] <variabele> <waarde>`.
 *
 * `getal` is de plek in `Schermvorm.getallen`. Zichtbaar als de waarde van die
 * getalvariabele, afgerond zoals Delphi dat doet (naar het dichtstbijzijnde
 * gehele getal, bij .5 naar even), gelijk is aan `waarde`. Kent de bus de
 * variabele niet, dan is het onderdeel altijd zichtbaar (zo doet OMSI het);
 * is de waarde geen getal (NaN), dan nooit.
 */
export interface Zicht {
  getal: number
  waarde: number
}

/** Hoe een plaatje zich gedraagt buiten 0..1. */
export type Adres = 'wrap' | 'clamp' | 'border'

/**
 * Wat een onderdeel tekent.
 *
 * - `beeld`: een plaatje uit de bus (achtergrond, een laag erboven).
 * - `kleur`: een vlak zonder (vindbaar) plaatje, in zijn materiaalkleur.
 * - `tekst`: een `[texttexture]`, met de tekst van een stringvariabele in een
 *   lettertype van OMSI.
 * - `script`: een `[scripttexture]` (`\S:n`), die het busscript zelf beschildert.
 *   Niet na te tekenen; wordt als leeg vlak getekend en staat in `onvolledig`.
 */
export type Deelsoort = 'beeld' | 'kleur' | 'tekst' | 'script'

/** De opmaak van één `[texttexture]` of `[texttexture_enh]`. */
export interface Teksttextuur {
  /** Plek in `Schermvorm.stringvars`: waar de tekst vandaan komt. */
  variabele: number
  /** De maat van de textuur waar OMSI de tekst in tekent, in beeldpunten. */
  b: number
  h: number
  /** Sleutel in `Schermvorm.fonts`; ontbreekt het font, dan blijft de textuur leeg. */
  font: string
  /** Veld 5 van het blok, als bitveld: bit 0 = kleur uit de bitmap, (fc & 3) == 2 = alleen dekkende pixels. */
  fc: number
  /** De letterkleur uit de cfg, 0..255. */
  kleur: [number, number, number]
  /** Veld 9 van `_enh` (0 bij een gewone `[texttexture]`): 0 midden, 1 links, 2 rechts, 3/4/5 op een tussenruimte. */
  orientatie: number
  /** Veld 10 van `_enh` (1 bij een gewone): x wordt naar beneden afgerond op een veelvoud hiervan. */
  raster: number
}

/** Eén onderdeel van het scherm: een [mesh] met één materiaal. */
export interface Schermdeel {
  soort: Deelsoort
  /**
   * De plek van dit onderdeel in de meshlijst van OMSI (de [mesh]-regels van de
   * cfg waarvan de .o3d bestaat, in volgorde), of -1. Daarmee leest de telefoon
   * uit `Schermstand.z` of OMSI het onderdeel op dit moment toont.
   */
  mesh: number
  /** Alle `[visible]` van de mesh; allemaal waar = zichtbaar. Leeg = altijd. */
  zicht: Zicht[]
  /**
   * De driehoeken, twaalf getallen per driehoek: s0 t0 u0 v0 s1 t1 u1 v1 s2 t2 u2 v2.
   * Alleen driehoeken die naar de bestuurder kijken en een oppervlakte hebben.
   */
  driehoeken: number[]
  /** Hoe ver naar voren, in mm; tekenen van klein naar groot. */
  diepte: number
  /** `[matl_alpha]`: 0 ondoorzichtig, 1 alfatest, 2 mengen. */
  alfa: 0 | 1 | 2
  adres: Adres
  /** `beeld`: id van het plaatje (zie `main/schermtexturen.ts`). */
  textuur?: string
  /**
   * `beeld` met `[matl_freetex]`: plek in `Schermvorm.stringvars` waarvan de
   * WAARDE een bestandsnaam is. De server zet die naam om in een id in
   * `Schermstand.f`; is die er niet, dan geldt `textuur`.
   */
  freetex?: number
  /**
   * `beeld` met `[matl_change] <tex> <n> <variabele>`: bij waarde 0 het gewone
   * plaatje, bij waarde k het plaatje van item k (een id, of null = geen).
   */
  keuze?: { getal: number; items: (string | null)[] }
  /**
   * `[alphascale] <variabele>`: plek in `Schermvorm.getallen`; de dekking van
   * dit deel maal die waarde (0..1). Zie `dekkingVan` in apparaatscherm.tsx.
   */
  alfaschaal?: number
  /** `kleur`, en bij `alfa` 2 de doorzichtigheid (a) van een `beeld`: 0..1. */
  kleur?: [number, number, number, number]
  /** `tekst`. */
  tekst?: Teksttextuur
}

/** Een aanraakvlak: een [mesh] met een [mouseevent] dat op het scherm ligt. */
export interface Schermklik {
  /** De naam waar het busscript op luistert, zoals in keyboard.cfg. */
  actie: string
  /** Voor schermlezers en de lijst van toetsen; niet getekend. */
  opschrift: string
  mesh: number
  zicht: Zicht[]
  /** Rechthoek in delen van het scherm. */
  x: number
  y: number
  b: number
  h: number
  /** Hoe ver naar voren, in mm: bij overlap wint de voorste. */
  diepte: number
}

/** Eén teken van een lettertype, in de volgorde van het .oft-bestand. */
export interface Schermteken {
  /** Eén UTF-16-eenheid. */
  teken: string
  /** x2 - x1; mag negatief zijn (dan schuift de pen terug en wordt er niets getekend). */
  breedte: number
  /**
   * De dekking, `max(0, breedte)` x `hoogte` bytes rij voor rij, base64. Uit
   * de ALFAbitmap, byte 0 van elke drie (bij 24 bit het blauwe kanaal).
   * Ontbreekt als het teken niet uit de bitmap te lezen was.
   */
  alfa?: string
  /** Bij een lettertype met kleur uit de bitmap: r g b per beeldpunt, base64. */
  rgb?: string
}

/** Een lettertype van OMSI, zoals `core/oft.ts` het leest. */
export interface Schermfont {
  naam: string
  hoogte: number
  /** De ruimte tussen twee tekens. */
  sep: number
  /** In bestandsvolgorde, dubbelen inbegrepen; teken 0 is de terugval. */
  tekens: Schermteken[]
}

/** Alles wat er op het scherm van één apparaat kan staan. */
export interface Schermvorm {
  versie: 1
  /** Verandert als er iets aan de vorm verandert; de telefoon onthoudt op id. */
  id: string
  /** Het apparaat (Busmodule.id) waar dit het scherm van is. */
  module: string
  /** Breedte / hoogte, in het echt. */
  verhouding: number
  /** De kleur waar het scherm mee begint (achter alles). */
  leeg: string
  /** Op tekenvolgorde. */
  delen: Schermdeel[]
  /** De voorste als laatste. */
  klikken: Schermklik[]
  fonts: Record<string, Schermfont>
  /** De stringvariabelen die de stand meestuurt (tekst en freetex). */
  stringvars: string[]
  /** De getalvariabelen waar de voorwaarden naar verwijzen. */
  getallen: string[]
  /** Wat niet na te tekenen was, voor het logboek en de diagnose. */
  onvolledig: string[]
}

/** Wat er nu op het scherm staat; gaat met elk beeld mee. */
export interface Schermstand {
  /** Het id van de vorm waar deze stand bij hoort. */
  vorm: string
  /** De tekst per `Schermvorm.stringvars`, letterlijk (niet getrimd). */
  t: string[]
  /**
   * De waarden per `Schermvorm.getallen`. `null` = de bus kent de variabele
   * wel, maar de waarde is geen getal. Ontbreekt als de plugin geen getallen
   * levert (versie < 13).
   */
  g?: (number | null)[]
  /** Plekken in `Schermvorm.getallen` die de bus niet kent: altijd zichtbaar. */
  o?: number[]
  /**
   * Per mesh van OMSI '1' als het spel hem nu toont, anders '0' -- rechtstreeks
   * uit het geheugen. Gaat voor `zicht` als hij er is en bij deze bus hoort.
   */
  z?: string
  /** Per `Schermvorm.stringvars`: het plaatje-id bij een freetex-waarde, of null. */
  f?: (string | null)[]
}

/** Afronden zoals Delphi's Round: naar het dichtstbijzijnde gehele getal, bij .5 naar even. */
export function rondOmsi(x: number): number {
  const f = Math.fround(x)
  const onder = Math.floor(f)
  const rest = f - onder
  if (rest > 0.5) return onder + 1
  if (rest < 0.5) return onder
  return onder % 2 === 0 ? onder : onder + 1
}

/**
 * Of een onderdeel nu zichtbaar is.
 *
 * Eerst wat OMSI zelf zegt (`z`), dan de voorwaarden op de getallen; weet de
 * telefoon geen van beide, dan `undefined` -- en tekent hij het onderdeel niet
 * als het een voorwaarde heeft.
 */
export function isZichtbaar(
  stand: Schermstand,
  deel: { mesh: number; zicht: Zicht[] }
): boolean | undefined {
  if (stand.z && deel.mesh >= 0 && deel.mesh < stand.z.length) return stand.z[deel.mesh] === '1'
  if (deel.zicht.length === 0) return true
  if (!stand.g) return undefined
  const onbekend = new Set(stand.o ?? [])
  return deel.zicht.every((voorwaarde) => {
    if (onbekend.has(voorwaarde.getal)) return true
    const waarde = stand.g![voorwaarde.getal]
    if (waarde === null || waarde === undefined || !Number.isFinite(waarde)) return false
    return rondOmsi(waarde) === voorwaarde.waarde
  })
}
