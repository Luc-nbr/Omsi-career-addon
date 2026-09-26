import { deflateSync, inflateSync } from 'node:zlib'
import type { Textuur } from './textuur'

/**
 * PNG schrijven en lezen, zonder Electron.
 *
 * WAAROM DIT BESTAAT
 * Het scherm van een apparaat (de ALMEX, een IBIS) wordt op de telefoon
 * nagetekend met de plaatjes van de bus zelf. Een browser kan DDS en TGA niet
 * lezen, en dat zijn de twee formaten die OMSI het meest gebruikt; die gaan
 * dus als PNG de deur uit. `nativeImage` van Electron kan dat ook, maar geeft
 * BGRA met voorvermenigvuldigde alfa -- waar de alfa nul is, is de kleur dan
 * weg -- en draait niet in een worker_thread. Dit bestand gebruikt alleen
 * `node:zlib` en past overal.
 *
 * SCHRIJVEN
 * Altijd 8 bits RGBA (kleurtype 6), elke rij met filter 0 ("geen"). Een slimmere
 * filterkeuze scheelt bij foto's een kwart in bytes, maar kost per rij vijf
 * proefrondes; een schermtextuur wordt één keer omgezet en daarna uit het
 * geheugen geleverd, en de proef op `almex_s_0.dds` (512 x 512, DXT3) gaf op
 * niveau 6 78.449 bytes in 12,6 ms -- klein genoeg.
 *
 * LEZEN
 * Nodig voor precies één geval: een PNG met alfa op een materiaal dat OMSI
 * zonder alfa tekent (`[matl_alpha]` 0), of een PNG die bijgesneden of met een
 * transmap samengesteld moet worden. Chromium zou de alfa gewoon toepassen, en
 * dan wordt een scherm doorzichtig dat in de bus dekkend is. Wat er op schijf
 * staat, geteld over `Vehicles` (1210 PNG's): kleurtype 6 met 8 bits 687 keer
 * (één daarvan interlaced), kleurtype 2 386, palet met 8 bits 116, palet met 4
 * bits 13, palet met 1 bit 2, grijs met 1 bit 6. De lezer kan alle kleurtypen,
 * alle bitdiepten en Adam7, want dat kost weinig en een "halve" lezer valt pas
 * om bij de bus van iemand anders.
 *
 * Net als `textuur.ts` gooit het lezen nooit: wat niet lukt komt terug als
 * `undefined`, en dan gaat het bestand ongewijzigd naar de browser.
 */

/** De acht bytes waar elk PNG-bestand mee begint. */
const HANDTEKENING = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** De CRC-32 van PNG (en zip), per byte in een tabel. */
const CRC = new Uint32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  CRC[n] = c >>> 0
}

function crc32(delen: Uint8Array[]): number {
  let c = 0xffffffff
  for (const deel of delen) {
    for (let i = 0; i < deel.length; i++) c = CRC[(c ^ deel[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

/** Eén blok: lengte, soort, inhoud en de CRC over soort plus inhoud. */
function blok(soort: string, inhoud: Uint8Array): Buffer {
  const kop = Buffer.alloc(8)
  kop.writeUInt32BE(inhoud.length, 0)
  kop.write(soort, 4, 'latin1')
  const staart = Buffer.alloc(4)
  staart.writeUInt32BE(crc32([kop.subarray(4), inhoud]), 0)
  return Buffer.concat([kop, inhoud, staart])
}

/**
 * RGBA-pixels (rij voor rij, van boven naar beneden) als PNG-bestand.
 *
 * `niveau` is het deflate-niveau, 0 tot 9. Gooit alleen bij een fout van de
 * aanroeper -- een maat die niet bij het aantal bytes past -- want dat is geen
 * verminkte textuur maar een programmeerfout, en die moet opvallen.
 */
export function pngVan(breedte: number, hoogte: number, rgba: Uint8Array, niveau = 6): Buffer {
  if (!Number.isInteger(breedte) || !Number.isInteger(hoogte) || breedte <= 0 || hoogte <= 0) {
    throw new RangeError(`pngVan: maat ${breedte} x ${hoogte}`)
  }
  const rij = breedte * 4
  if (rgba.length < rij * hoogte) {
    throw new RangeError(`pngVan: ${rgba.length} bytes voor ${breedte} x ${hoogte}`)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(breedte, 0)
  ihdr.writeUInt32BE(hoogte, 4)
  ihdr[8] = 8 // bits per kanaal
  ihdr[9] = 6 // kleurtype: RGBA
  // [10] compressie, [11] filtermethode en [12] interlace blijven 0.

  // Elke rij krijgt vooraan één byte: het filter, hier altijd 0.
  const rauw = Buffer.alloc((rij + 1) * hoogte)
  for (let y = 0; y < hoogte; y++) rauw.set(rgba.subarray(y * rij, (y + 1) * rij), y * (rij + 1) + 1)

  return Buffer.concat([
    HANDTEKENING,
    blok('IHDR', ihdr),
    blok('IDAT', deflateSync(rauw, { level: niveau })),
    blok('IEND', new Uint8Array(0))
  ])
}

/** Wat er in de kop van een PNG staat, zonder de pixels uit te pakken. */
export interface PngKop {
  breedte: number
  hoogte: number
  /** 0 grijs, 2 RGB, 3 palet, 4 grijs + alfa, 6 RGBA. */
  kleurtype: number
  bits: number
  interlace: boolean
  /**
   * Of het beeld doorzichtige pixels kán hebben: kleurtype 4 of 6, of een
   * `tRNS`-blok. Zonder alfa is de PNG al dekkend en hoeft er niets aan.
   */
  alfa: boolean
}

/**
 * De kop van een PNG: maat, kleurtype en of er alfa in zit.
 *
 * Loopt de blokken af tot het eerste `IDAT`, want `tRNS` staat altijd daarvoor
 * (zo schrijft de norm het voor). Kost dus een paar honderd bytes lezen.
 */
export function pngKop(bytes: Uint8Array): PngKop | undefined {
  const buf = alsBuffer(bytes)
  if (buf.length < 33 || !buf.subarray(0, 8).equals(HANDTEKENING)) return undefined
  if (buf.toString('latin1', 12, 16) !== 'IHDR') return undefined
  const kop: PngKop = {
    breedte: buf.readUInt32BE(16),
    hoogte: buf.readUInt32BE(20),
    bits: buf[24],
    kleurtype: buf[25],
    interlace: buf[28] === 1,
    alfa: buf[25] === 4 || buf[25] === 6
  }
  let p = 8
  while (p + 8 <= buf.length) {
    const lengte = buf.readUInt32BE(p)
    const soort = buf.toString('latin1', p + 4, p + 8)
    if (soort === 'tRNS') kop.alfa = true
    if (soort === 'IDAT' || soort === 'IEND') break
    p += 12 + lengte
  }
  return kop
}

/** Dezelfde grenzen als `textuur.ts`: een verminkte kop mag geen gigabyte kosten. */
const MAX_ZIJDE = 16384
const MAX_PIXELS = 8192 * 8192

/** Kanalen per kleurtype, en welke bitdiepten de norm daarbij toestaat. */
const KANALEN: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }
const DIEPTEN: Record<number, number[]> = {
  0: [1, 2, 4, 8, 16],
  2: [8, 16],
  3: [1, 2, 4, 8],
  4: [8, 16],
  6: [8, 16]
}

/**
 * De zeven doorgangen van Adam7: begin en stap in x en y. Doorgang 1 neemt
 * elke achtste pixel in beide richtingen, doorgang 7 elke oneven rij.
 */
const ADAM7: [number, number, number, number][] = [
  [0, 0, 8, 8],
  [4, 0, 8, 8],
  [0, 4, 4, 8],
  [2, 0, 4, 4],
  [0, 2, 2, 4],
  [1, 0, 2, 2],
  [0, 1, 1, 2]
]

/**
 * Een PNG uitpakken tot RGBA, 8 bits per kanaal.
 *
 * Zestien bits wordt de hoogste byte, zoals libpng en Chromium dat doen. Een
 * doorzichtige kleur uit `tRNS` wordt vergeleken op de volle waarde, vóór het
 * inkorten -- anders worden twee kleuren die alleen in de lage byte verschillen
 * allebei doorzichtig. De CRC's worden niet nagerekend: een bestand dat OMSI
 * inleest, lezen wij ook in.
 */
export function leesPng(bytes: Uint8Array): Textuur | undefined {
  try {
    return pakPngUit(alsBuffer(bytes))
  } catch {
    // inflate van een kapotte stroom gooit; zie de kop van dit bestand.
    return undefined
  }
}

function pakPngUit(buf: Buffer): Textuur | undefined {
  const kop = pngKop(buf)
  if (!kop) return undefined
  const { breedte, hoogte, kleurtype, bits } = kop
  if (breedte <= 0 || hoogte <= 0 || breedte > MAX_ZIJDE || hoogte > MAX_ZIJDE) return undefined
  if (breedte * hoogte > MAX_PIXELS) return undefined
  const kanalen = KANALEN[kleurtype]
  if (!kanalen || !DIEPTEN[kleurtype].includes(bits)) return undefined
  if (buf[26] !== 0 || buf[27] !== 0 || buf[28] > 1) return undefined

  let palet: Uint8Array | undefined
  let trns: Buffer | undefined
  const idat: Buffer[] = []
  let p = 8
  while (p + 8 <= buf.length) {
    const lengte = buf.readUInt32BE(p)
    const soort = buf.toString('latin1', p + 4, p + 8)
    const begin = p + 8
    /*
     * Een blok dat niet af is: stoppen met wat er al is. Was het een blok ná de
     * beelddata (een afgekapte `tEXt`, een ontbrekende `IEND`), dan is het beeld
     * heel en toont Chromium het ook; was het de beelddata zelf, dan valt de
     * inflate hieronder om en is de PNG onleesbaar.
     */
    if (begin + lengte > buf.length) break
    const inhoud = buf.subarray(begin, begin + lengte)
    if (soort === 'PLTE') palet = inhoud
    else if (soort === 'tRNS') trns = inhoud
    else if (soort === 'IDAT') idat.push(inhoud)
    else if (soort === 'IEND') break
    p = begin + lengte + 4
  }
  if (idat.length === 0) return undefined
  if (kleurtype === 3 && !palet) return undefined

  const bitsPerPixel = kanalen * bits
  /** Hoeveel bytes filter 1 tot 4 terugkijkt: één hele pixel, minstens één byte. */
  const stapBytes = Math.max(1, bitsPerPixel >> 3)
  const doorgangen = kop.interlace
    ? ADAM7.map(([x0, y0, dx, dy]) => ({
        x0,
        y0,
        dx,
        dy,
        b: Math.ceil((breedte - x0) / dx),
        h: Math.ceil((hoogte - y0) / dy)
      })).filter((d) => d.b > 0 && d.h > 0)
    : [{ x0: 0, y0: 0, dx: 1, dy: 1, b: breedte, h: hoogte }]

  let verwacht = 0
  for (const d of doorgangen) verwacht += d.h * (1 + Math.ceil((d.b * bitsPerPixel) / 8))
  /*
   * De grens op de uitvoer is ook de bescherming tegen een "zipbom": een paar
   * kilobyte die tot gigabytes uitpakken. Wat méér oplevert dan de kop belooft,
   * laat zlib vallen met een fout, en dat is dan een onleesbare PNG.
   */
  const rauw = inflateSync(Buffer.concat(idat), { maxOutputLength: verwacht + 1024 })
  if (rauw.length < verwacht) return undefined

  const pixels = new Uint8Array(breedte * hoogte * 4)
  const kleurNaarByte = bits < 8 ? 255 / ((1 << bits) - 1) : 1
  // De doorzichtige grijswaarde of RGB-kleur uit tRNS, op volle diepte.
  const doorzichtigGrijs = trns && kleurtype === 0 && trns.length >= 2 ? trns.readUInt16BE(0) : -1
  const doorzichtigRgb =
    trns && kleurtype === 2 && trns.length >= 6
      ? [trns.readUInt16BE(0), trns.readUInt16BE(2), trns.readUInt16BE(4)]
      : undefined

  let q = 0
  for (const d of doorgangen) {
    const rijBytes = Math.ceil((d.b * bitsPerPixel) / 8)
    let vorige = new Uint8Array(rijBytes)
    for (let y = 0; y < d.h; y++) {
      const filter = rauw[q]
      /*
       * Ter plekke in de uitgepakte bytes: die zijn van ons, en de vorige rij
       * blijft zo vanzelf staan voor het filter van deze. Geen kopie per rij.
       */
      const rij = rauw.subarray(q + 1, q + 1 + rijBytes)
      q += 1 + rijBytes
      if (!ontfilter(filter, rij, vorige, stapBytes)) return undefined
      vorige = rij

      const doelY = d.y0 + y * d.dy
      if (bits === 8) {
        const eerste = (doelY * breedte + d.x0) * 4
        zetRij8(kleurtype, rij, pixels, eerste, d.dx * 4, d.b, palet, trns, doorzichtigGrijs, doorzichtigRgb)
        continue
      }

      /** Monster `k` (in eenheden van `bits`) uit deze rij, op volle diepte. */
      const monster = (k: number): number => {
        if (bits === 8) return rij[k]
        if (bits === 16) return (rij[2 * k] << 8) | rij[2 * k + 1]
        const bit = k * bits
        return (rij[bit >> 3] >> (8 - bits - (bit & 7))) & ((1 << bits) - 1)
      }
      const naarByte = (v: number): number => (bits === 16 ? v >> 8 : Math.round(v * kleurNaarByte))

      for (let x = 0; x < d.b; x++) {
        const uit = (doelY * breedte + d.x0 + x * d.dx) * 4
        const k = x * kanalen
        if (kleurtype === 3) {
          const index = monster(k)
          const plek = index * 3
          if (palet && plek + 2 < palet.length) {
            pixels[uit] = palet[plek]
            pixels[uit + 1] = palet[plek + 1]
            pixels[uit + 2] = palet[plek + 2]
          }
          pixels[uit + 3] = trns && index < trns.length ? trns[index] : 255
        } else if (kleurtype === 0 || kleurtype === 4) {
          const grijs = monster(k)
          const waarde = naarByte(grijs)
          pixels[uit] = waarde
          pixels[uit + 1] = waarde
          pixels[uit + 2] = waarde
          pixels[uit + 3] = kleurtype === 4 ? naarByte(monster(k + 1)) : grijs === doorzichtigGrijs ? 0 : 255
        } else {
          const r = monster(k)
          const g = monster(k + 1)
          const b = monster(k + 2)
          pixels[uit] = naarByte(r)
          pixels[uit + 1] = naarByte(g)
          pixels[uit + 2] = naarByte(b)
          if (kleurtype === 6) pixels[uit + 3] = naarByte(monster(k + 3))
          else {
            const weg =
              doorzichtigRgb && r === doorzichtigRgb[0] && g === doorzichtigRgb[1] && b === doorzichtigRgb[2]
            pixels[uit + 3] = weg ? 0 : 255
          }
        }
      }
    }
  }
  return { breedte, hoogte, pixels }
}

/**
 * Eén rij met 8 bits per monster naar RGBA: de snelle weg voor wat er op schijf
 * staat (1189 van de 1210 PNG's onder `Vehicles`). Samen met het ontfilteren
 * ter plekke gaat het lezen van RGBA van 34,7 naar 12,7 ms per miljoen pixels
 * en `DAF_XF_105\...\Heck.png` (RGB, 936 x 1077) van 46 naar 15 ms. De
 * uitkomst is dezelfde als met `monster`: nagerekend op alle 1210 met een sha1
 * van de pixels (scratchpad `bouw-plaatjes-tegen/pngvloot.mts`).
 *
 * `uit` is de plek van de eerste pixel in `pixels`, `stap` de afstand tot de
 * volgende in bytes (4, of meer bij een doorgang van Adam7).
 */
function zetRij8(
  kleurtype: number,
  rij: Uint8Array,
  pixels: Uint8Array,
  uit: number,
  stap: number,
  aantal: number,
  palet: Uint8Array | undefined,
  trns: Uint8Array | undefined,
  doorzichtigGrijs: number,
  doorzichtigRgb: number[] | undefined
): void {
  if (kleurtype === 6) {
    if (stap === 4) {
      pixels.set(rij.subarray(0, aantal * 4), uit)
      return
    }
    for (let x = 0, k = 0; x < aantal; x++, k += 4, uit += stap) {
      pixels[uit] = rij[k]
      pixels[uit + 1] = rij[k + 1]
      pixels[uit + 2] = rij[k + 2]
      pixels[uit + 3] = rij[k + 3]
    }
    return
  }
  if (kleurtype === 2) {
    const [tr, tg, tb] = doorzichtigRgb ?? [-1, -1, -1]
    for (let x = 0, k = 0; x < aantal; x++, k += 3, uit += stap) {
      const r = rij[k]
      const g = rij[k + 1]
      const b = rij[k + 2]
      pixels[uit] = r
      pixels[uit + 1] = g
      pixels[uit + 2] = b
      pixels[uit + 3] = r === tr && g === tg && b === tb ? 0 : 255
    }
    return
  }
  if (kleurtype === 3) {
    const lengte = palet ? palet.length : 0
    for (let x = 0; x < aantal; x++, uit += stap) {
      const index = rij[x]
      const plek = index * 3
      if (palet && plek + 2 < lengte) {
        pixels[uit] = palet[plek]
        pixels[uit + 1] = palet[plek + 1]
        pixels[uit + 2] = palet[plek + 2]
      }
      pixels[uit + 3] = trns && index < trns.length ? trns[index] : 255
    }
    return
  }
  // Grijs (0) en grijs met alfa (4).
  const kanalen = kleurtype === 4 ? 2 : 1
  for (let x = 0, k = 0; x < aantal; x++, k += kanalen, uit += stap) {
    const grijs = rij[k]
    pixels[uit] = grijs
    pixels[uit + 1] = grijs
    pixels[uit + 2] = grijs
    pixels[uit + 3] = kleurtype === 4 ? rij[k + 1] : grijs === doorzichtigGrijs ? 0 : 255
  }
}

/**
 * De vijf filters van PNG terugdraaien, ter plekke in `rij`.
 *
 * Filter 4 (Paeth) kiest per byte de buur -- links, boven of linksboven -- die
 * het dichtst bij links + boven - linksboven ligt, en bij gelijke afstand in
 * die volgorde. Een andere volgorde bij gelijkspel geeft een beeld dat bijna
 * klopt, met strepen die pas bij een vergroting opvallen.
 */
function ontfilter(filter: number, rij: Uint8Array, vorige: Uint8Array, stap: number): boolean {
  const n = rij.length
  switch (filter) {
    case 0:
      return true
    case 1:
      for (let i = stap; i < n; i++) rij[i] = (rij[i] + rij[i - stap]) & 255
      return true
    case 2:
      for (let i = 0; i < n; i++) rij[i] = (rij[i] + vorige[i]) & 255
      return true
    case 3:
      for (let i = 0; i < n; i++) {
        const links = i >= stap ? rij[i - stap] : 0
        rij[i] = (rij[i] + ((links + vorige[i]) >> 1)) & 255
      }
      return true
    case 4:
      for (let i = 0; i < n; i++) {
        const a = i >= stap ? rij[i - stap] : 0
        const b = vorige[i]
        const c = i >= stap ? vorige[i - stap] : 0
        const schat = a + b - c
        const pa = Math.abs(schat - a)
        const pb = Math.abs(schat - b)
        const pc = Math.abs(schat - c)
        const voorspelling = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
        rij[i] = (rij[i] + voorspelling) & 255
      }
      return true
    default:
      return false
  }
}

function alsBuffer(bytes: Uint8Array): Buffer {
  return Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}
