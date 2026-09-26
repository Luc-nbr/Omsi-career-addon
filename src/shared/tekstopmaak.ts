import type { Schermfont, Teksttextuur } from './scherm'

/**
 * TEKST IN EEN TEKSTTEXTUUR, PIXEL VOOR PIXEL ZOALS OMSI
 *
 * Een [texttexture] of [texttexture_enh] is voor OMSI een lege textuur van
 * b x h beeldpunten waar hij de tekst van een stringvariabele in zet, met een
 * bitmapfont (`core/oft.ts`). Die textuur gaat daarna via de uv's van de mesh
 * op het apparaat; de lettergrootte die je ziet volgt pas uit die stap. Dit
 * bestand doet alleen de eerste stap, en dat precies zoals Omsi.exe 2.3.004:
 * de maat, de plek en de beeldpunten, zodat de telefoon hetzelfde plaatje
 * heeft als het spel.
 *
 * Het is puur: geen node, geen DOM. Het draait in de renderer (canvas met
 * `putImageData`) en in node (de probe en eventueel een plaatje voor de
 * diagnose).
 *
 * DE REGELS, MET HUN ADRES IN OMSI.EXE
 * - '@' begint een nieuwe regel (005FC03F bij het meten, 005FC302 bij het
 *   tekenen). Voor een '@' komt geen tussenruimte; een '@' aan het eind geeft
 *   een lege regel, en die telt mee bij het verticaal centreren.
 * - Een regel is Σ breedte + sep * (tekens - 1) breed: de ruimte na het laatste
 *   teken telt niet mee (005FC1F2). Een leeg vak heeft breedte 0.
 * - Verticaal: y0 = (h - regels * hoogte) div 2, naar nul afgekapt en niet
 *   geklemd; hij mag negatief zijn (005FC264). De puntenlaag van de AFR
 *   (893 x 62, font 78 hoog) begint zo op -8.
 * - Horizontaal per regel (geneste functie 005FB84C), ook naar nul afgekapt:
 *   0 en >= 6 midden: max(0, (b - lw) div 2); 1 links: 0; 2 rechts: b - lw,
 *   en is dat negatief dan gooit OMSI een ERangeError; 3/4/5 zetten een
 *   TUSSENRUIMTE in het midden, niet de tekst (zie `xVanRegel`).
 * - Raster (veld 10 van _enh) >= 2: x naar beneden op een veelvoud (005FBBC0).
 * - Een teken dat het font niet kent wordt eerst als hoofdletter gezocht (alleen
 *   a-z), en anders wordt teken 0 van het font getekend (GetCharIndex
 *   005D6754). In TH_AFR-Font is dat een 'A'; 62 gebruikte fonts hebben geen
 *   kleine letters en tonen dus hoofdletters.
 * - Elk beeldpunt van het tekenvak wordt OVERSCHREVEN met (letterkleur, dekking),
 *   ook bij dekking 0; er wordt niet gemengd (DrawChar 005D6BB3-005D6C37). Alleen
 *   bij (fc & 3) == 2 blijven beeldpunten zonder dekking staan (005D69FC).
 *   Waar tekens overlappen (negatieve breedte, 81 tekens) wint dus het laatste.
 * - Kleur: bij fc & 1 uit de kleurbitmap van het font, anders uit de cfg.
 * - De textuur begint helemaal doorzichtig zwart: (0, 0, 0, 0).
 *
 * Rekenvoorbeelden (HH20_HHAschedule_font, 27 hoog, sep 2), nagerekend in
 * `scripts/probe-letters.ts`: de ALMEX-klok '04:13:07' op 256 x 256 is 91
 * breed en komt op x 82, y 114; '    LEE' op 282 op x 97; 'LEER' op 330 op
 * x 135; '--:--' op 282 op x 119. De AFR-regel 'Tacho          0' in TH_AFR-Font
 * (16 x 55 + 15) is 895 breed, meer dan de 885 van het vak, en begint dus op 0.
 *
 * WANNEER OMSI VASTLOOPT
 * Rechts uitlijnen van een te brede regel, of een teken dat niet uit de bitmap
 * te lezen is (zie `core/oft.ts`), laat OMSI midden in het bijwerken een
 * exceptie gooien. Wat het spel dan laat zien is niet nagemeten; hier blijft
 * het vak dan leeg. Omdat OMSI de oude tekst al als 'getekend' heeft
 * onthouden, blijft dat zo tot de tekst verandert (005FBD72 slaat hem op vóór
 * het tekenen); dat doet de renderer vanzelf, want die tekent alleen opnieuw
 * bij een andere tekst.
 *
 * NAGEREKEND
 * `scripts/probe-letters.ts` legt `tekenTekst` naast een tweede nabouw die
 * regel voor regel uit de machinecode is overgenomen en de bitmaps zelf leest:
 * 6218 teksten, waarvan 1748 op de 437 verschillende echte blokken uit de
 * cfg's, geven op 3 na hetzelfde beeld tot op de byte. Die 3 zijn het verschil
 * dat in `core/oft.ts` staat (teken deels buiten de bitmap, in een vak dat
 * lager is dan het font).
 */

/** Eén teken, uitgepakt. */
export interface DecodedTeken {
  teken: string
  breedte: number
  /** max(0, breedte) x hoogte bytes; ontbreekt als het teken niet te lezen was. */
  alfa?: Uint8Array
  /** Driemaal zoveel bytes, r g b; alleen bij een font met kleur uit de bitmap. */
  rgb?: Uint8Array
}

/** Een `Schermfont` met de base64 één keer uitgepakt, klaar om vaak mee te tekenen. */
export interface DecodedFont {
  naam: string
  hoogte: number
  sep: number
  /** In bestandsvolgorde, dubbelen inbegrepen; teken 0 is de terugval. */
  tekens: DecodedTeken[]
  /** Per teken de EERSTE plek in `tekens`: OMSI zoekt lineair en de eerste wint. */
  eerste: Map<string, number>
}

/** De plek van één regel in de textuur. */
export interface Regelplek {
  tekst: string
  /** Σ breedte + sep * (tekens - 1). */
  breedte: number
  /** Waar de pen begint; `undefined` als OMSI hier een ERangeError gooit. */
  x: number | undefined
}

/** Waar de tekst komt te staan, zonder te tekenen. */
export interface Opmaak {
  /** De bovenkant van de eerste regel; mag negatief zijn. */
  y0: number
  regels: Regelplek[]
}

/** base64 naar bytes, met `atob` waar die er is (browser, node >= 16) en anders Buffer. */
function vanBase64(tekst: string): Uint8Array | undefined {
  try {
    if (typeof atob === 'function') {
      const bin = atob(tekst)
      const uit = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) uit[i] = bin.charCodeAt(i)
      return uit
    }
    const buffer = (globalThis as { Buffer?: { from(s: string, codering: string): Uint8Array } }).Buffer
    if (buffer) {
      const b = buffer.from(tekst, 'base64')
      return new Uint8Array(b.buffer, b.byteOffset, b.byteLength)
    }
  } catch {
    // Kapotte base64: dan is het teken niet te lezen, net als een teken buiten de bitmap.
  }
  return undefined
}

/**
 * Pakt de base64 van een font één keer uit. Een teken waarvan de bytes niet de
 * afgesproken lengte hebben telt als onleesbaar.
 */
export function decodeerFont(font: Schermfont): DecodedFont {
  const hoogte = Math.max(0, font.hoogte)
  const eerste = new Map<string, number>()
  const tekens = font.tekens.map((t, i): DecodedTeken => {
    if (!eerste.has(t.teken)) eerste.set(t.teken, i)
    const uit: DecodedTeken = { teken: t.teken, breedte: t.breedte }
    const vlak = Math.max(0, t.breedte) * hoogte
    if (t.alfa !== undefined) {
      const alfa = vanBase64(t.alfa)
      if (alfa && alfa.length === vlak) uit.alfa = alfa
    }
    if (t.rgb !== undefined) {
      const rgb = vanBase64(t.rgb)
      if (rgb && rgb.length === vlak * 3) uit.rgb = rgb
    }
    return uit
  })
  return { naam: font.naam, hoogte: font.hoogte, sep: font.sep, tekens, eerste }
}

/**
 * Welk teken OMSI tekent voor `c` (één UTF-16-eenheid): het eerste met die
 * waarde; anders bij a-z het eerste met de hoofdletter (and 0FFDFh); anders
 * teken 0.
 */
export function tekenIndex(font: DecodedFont, c: string): number {
  const plek = font.eerste.get(c)
  if (plek !== undefined) return plek
  const code = c.charCodeAt(0)
  if (code >= 0x61 && code <= 0x7a) {
    const hoofdletter = font.eerste.get(String.fromCharCode(code & 0xffdf))
    if (hoofdletter !== undefined) return hoofdletter
  }
  return 0
}

/**
 * De breedte van één regel zoals OMSI hem centreert: Σ breedte + sep tussen de
 * tekens, niet erna. Een '@' is hier een gewoon teken; splits zelf. Dit is ook
 * STGetTextWidth van de scripttexturen (005D6CB0).
 */
export function tekstBreedte(font: DecodedFont, regel: string): number {
  if (!regel.length || !font.tekens.length) return 0
  let breedte = font.sep * (regel.length - 1)
  for (let i = 0; i < regel.length; i++) breedte += font.tekens[tekenIndex(font, regel[i])].breedte
  return breedte
}

/** Delphi 'div 2': naar nul afgekapt (sar + adc), zonder -0. */
function half(a: number): number {
  return (a - (a % 2)) / 2
}

/** Een maat uit de cfg als geheel getal >= 0; NaN en oneindig worden 0 (dan is er geen textuur). */
function maat(a: number): number {
  return Number.isFinite(a) ? Math.max(0, Math.trunc(a)) : 0
}

/**
 * Meer beeldpunten kan OMSI niet vullen: DrawChar schrijft op y * b + x en
 * gooit boven 0x1000000 (005D6B9B). De grootste teksttextuur in deze
 * installatie is 2048 x 512; 4096 x 4096 past er precies in.
 */
const MAX_BEELDPUNTEN = 0x1000001

/**
 * De x van één regel (geneste functie 005FB84C). Bij oriëntatie 3, 4 en 5
 * loopt OMSI de tekens af tot de helft van de regel binnen bereik is en zet
 * dan de TUSSENRUIMTE daar in het midden van het vak: `na` is het midden van
 * de ruimte na het teken waar hij stopte, `voor` die ervoor. 4 kiest `na`, 5
 * `voor`, 3 de dichtstbijzijnde (bij gelijk `voor`). Vindt hij niets, dan
 * blijft het midden (oriëntatie 0).
 */
function xVanRegel(font: DecodedFont, tt: Teksttextuur, b: number, regel: string, lw: number): number | undefined {
  // Het midden rekent OMSI altijd eerst uit, met bereikcontrole, ook als de oriëntatie het daarna vervangt.
  let x = Math.max(0, half(b - lw))
  if (x > 0xffff) return undefined
  const orientatie = tt.orientatie
  if (orientatie === 1) x = 0
  else if (orientatie === 2) {
    x = b - lw
    if (x < 0 || x > 0xffff) return undefined
  } else if (orientatie >= 3 && orientatie <= 5 && regel.length > 0 && font.tekens.length > 0) {
    const doel = half(lw)
    const halveSep = half(font.sep)
    let som = 0
    for (let k = 0; k < regel.length; k++) {
      const w = font.tekens[tekenIndex(font, regel[k])].breedte
      som += w
      if (doel <= som + halveSep) {
        const na = som + halveSep
        const voor = na - font.sep - w
        const gekozen =
          orientatie === 4 ? na : orientatie === 5 ? voor : Math.abs(na - doel) < Math.abs(voor - doel) ? na : voor
        x = Math.max(0, half(b) - gekozen)
        break
      }
      if (k < regel.length - 1) som += font.sep
    }
  }
  if (x > 0xffff) return undefined
  if (tt.raster >= 2) x = Math.floor(x / tt.raster) * tt.raster
  return x
}

/** Waar elke regel van `tekst` in het vak komt (005FBC7C, zonder te tekenen). */
export function maakOp(font: DecodedFont, tt: Teksttextuur, tekst: string): Opmaak {
  const b = maat(tt.b)
  const regels = tekst.split('@').map((regel): Regelplek => {
    const breedte = tekstBreedte(font, regel)
    return { tekst: regel, breedte, x: xVanRegel(font, tt, b, regel, breedte) }
  })
  return { y0: half(maat(tt.h) - regels.length * font.hoogte), regels }
}

/**
 * De textuur van één tekstvak: RGBA, `tt.b` x `tt.h`, rij voor rij van boven,
 * zoals D3D hem van OMSI krijgt (A8R8G8B8, hier omgezet naar r g b a). Klaar
 * voor `new ImageData(pixels, tt.b, tt.h)`. Zonder font (OMSI vindt het niet)
 * blijft hij leeg, net als in het spel (005FBEC6).
 *
 * Elke aanroep maakt een nieuwe array van b x h x 4: teken alleen opnieuw als
 * de tekst verandert. Een vak van meer dan 0x1000001 beeldpunten (meer dan
 * OMSI kan vullen) of met een maat die geen getal is, geeft een LEGE array
 * (lengte 0) in plaats van honderden megabytes nullen.
 */
export function tekenTekst(font: DecodedFont | undefined, tt: Teksttextuur, tekst: string): Uint8ClampedArray {
  const W = maat(tt.b)
  const H = maat(tt.h)
  if (W * H > MAX_BEELDPUNTEN) return new Uint8ClampedArray(0)
  const leeg = (): Uint8ClampedArray => new Uint8ClampedArray(W * H * 4)
  if (!font || !font.tekens.length || W === 0 || H === 0) return leeg()

  const opmaak = maakOp(font, tt, tekst)
  if (opmaak.regels.some((regel) => regel.x === undefined)) return leeg()

  const pixels = leeg()
  const volkleur = (tt.fc & 1) === 1
  const alleenDekkend = (tt.fc & 3) === 2
  const kleur = ((tt.kleur[0] << 16) | (tt.kleur[1] << 8) | tt.kleur[2]) & 0xffffff
  const rood = kleur >> 16
  const groen = (kleur >> 8) & 0xff
  const blauw = kleur & 0xff

  let regel = 0
  let penX = opmaak.regels[0].x as number
  let penY = opmaak.y0
  for (let k = 0; k < tekst.length; k++) {
    const c = tekst[k]
    if (c === '@') {
      regel++
      penX = opmaak.regels[regel].x as number
      penY += font.hoogte
      continue
    }
    const teken = font.tekens[tekenIndex(font, c)]
    // DrawChar (005D686C) haalt een rij van de bitmap voor elke rij boven de onderrand van het vak,
    // ook als het teken maar één kolom breed is of links buiten het vak valt: daar loopt OMSI vast.
    const rijen = Math.min(H - penY, font.hoogte)
    if (rijen > 0) {
      if (!teken.alfa || (volkleur && !teken.rgb)) return leeg()
      const b = Math.max(0, teken.breedte)
      const kolommen = Math.min(teken.breedte, W - penX)
      for (let i = 0; i < rijen; i++) {
        const ty = penY + i
        if (ty < 0) continue
        for (let j = 0; j < kolommen; j++) {
          const tx = penX + j
          if (tx < 0) continue
          const bron = i * b + j
          const dekking = teken.alfa[bron]
          if (alleenDekkend && dekking === 0) continue
          const doel = (ty * W + tx) * 4
          if (volkleur) {
            const rgb = teken.rgb as Uint8Array
            pixels[doel] = rgb[bron * 3]
            pixels[doel + 1] = rgb[bron * 3 + 1]
            pixels[doel + 2] = rgb[bron * 3 + 2]
          } else {
            pixels[doel] = rood
            pixels[doel + 1] = groen
            pixels[doel + 2] = blauw
          }
          pixels[doel + 3] = dekking
        }
      }
    }
    penX += teken.breedte + font.sep
  }
  return pixels
}
