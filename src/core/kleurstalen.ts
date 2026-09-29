import { closeSync, openSync, readSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pakBmpUit, textuurKop, ontleedTextuur, KOP_BYTES, type Textuur } from '../shared/beeldlezers'
import type { Bus3dStalen } from '../shared/bus3d'
import { leesBusBestand } from './bus3d'
import { leesKleurstellingen } from './kleurstelling'
import { leesPng } from './png'

/**
 * DE KLEURSTALEN VAN DE KLEURSTELLINGEN (bus3d-ontwerp §7, idee uit deel G)
 *
 * Per kleurstelling drie kleuren, zodat je in een lijst van 76 (de MB C2) niet
 * alleen op namen hoeft te zoeken. Ze komen uit de textuur die de kleurstelling
 * op de plek van de LAK legt: de plek die de meeste kleurstellingen vervangen
 * (daarna het grootste buitenoppervlak volgens het pakket, dan het grootste
 * bestand), en per kleurstelling de beste plek die zij zelf vervangt
 * (`rangschikPlekken`).
 *
 * Klein gelezen: van een DXT met mips alleen het niveau van ongeveer 64 pixels
 * (een paar honderd bytes van de schijf); TGA, BMP en PNG helemaal, en dan om de
 * zoveel pixels geteld. JPEG leest node niet: dan geen staal (de naam staat er
 * dan alleen). De kleuren: op 4 bits per kanaal geteld, de drukste eerst, en de
 * volgende pas als hij genoeg van de vorige verschilt.
 */

interface Bewaard {
  stempel: string
  kleuren: [string, string, string] | null
}
/** Per textuurbestand; een kleurstelling die een ander bestand krijgt, krijgt een andere staal. */
const geheugen = new Map<string, Bewaard>()

export async function kleurstalen(
  omsiMap: string,
  relatiefPad: string,
  oppervlak: Record<string, number> | undefined,
  tussen?: (stalen: Bus3dStalen) => void
): Promise<Bus3dStalen> {
  const busPad = join(omsiMap, relatiefPad)
  const bus = leesBusBestand(busPad)
  if (!bus?.model) return {}
  const modelcfg = join(dirname(busPad), ...bus.model.split(/[\\/]+/))
  const info = leesKleurstellingen(modelcfg)
  if (!info || info.lijst.length === 0) return {}

  const plekken = rangschikPlekken(info.lijst, oppervlak)
  const uit: Bus3dStalen = {}
  if (plekken.length === 0) return uit
  let laatsteMelding = Date.now()
  for (let i = 0; i < info.lijst.length; i++) {
    const k = info.lijst[i]
    // De beste plek die DEZE kleurstelling vervangt: "Postbus" van de O560 vervangt alleen de lak.
    const plek = plekken.find((p) => k.texturen[p])
    const pad = plek ? k.texturen[plek] : undefined
    if (pad) {
      const kleuren = staalVan(pad)
      if (kleuren) uit[k.naam] = kleuren
    }
    // Tussendoor: het venster krijgt zijn stalen terwijl de rest nog gelezen wordt (§7).
    if (tussen && Date.now() - laatsteMelding > 120) {
      laatsteMelding = Date.now()
      tussen({ ...uit })
      await new Promise((klaar) => setImmediate(klaar))
    }
  }
  return uit
}

/**
 * De plekken in de volgorde waarin ze voor een staal deugen: eerst die de meeste
 * kleurstellingen vervangen (dat is de lak: bij de O560 farbschema_tex1, 4 van
 * de 4), dan het grootste buitenoppervlak volgens het pakket, dan het grootste
 * bestand. Nooit het glas.
 *
 * Eerst koos het pakket ÉÉN plek: de CTC-plek met het grootste buitenoppervlak
 * die geen glas is. Bij de O560 is dat het interieur (farbschema_tex3), dat
 * maar twee van de vier kleurstellingen vervangen: die kregen een grijs staal
 * en "Postbus" en "Stadtbus Haren" geen (beeldbeoordeling en aanvalsverslag F2).
 */
function rangschikPlekken(lijst: Array<{ texturen: Record<string, string> }>, oppervlak?: Record<string, number>): string[] {
  const tel = new Map<string, { n: number; bytes: number }>()
  // Het glas niet: dat is vaak het grootste bestand, en dan wordt een beige bus wit en zwart.
  const glas = /glas|glass|scheibe|fenster|window|szyb|trans/i
  for (const k of lijst) {
    for (const [plek, pad] of Object.entries(k.texturen)) {
      if (glas.test(plek) || glas.test(pad.split(/[\\/]/).pop() ?? '')) continue
      const t = tel.get(plek) ?? { n: 0, bytes: 0 }
      t.n++
      if (t.bytes === 0) {
        try {
          t.bytes = statSync(pad).size
        } catch {
          // Weg: telt dan niet mee in de maat.
        }
      }
      tel.set(plek, t)
    }
  }
  const opp = (plek: string): number => oppervlak?.[plek] ?? 0
  return [...tel]
    .sort(([pa, a], [pb, b]) => b.n - a.n || opp(pb) - opp(pa) || b.bytes - a.bytes)
    .map(([plek]) => plek)
}

function staalVan(pad: string): [string, string, string] | undefined {
  let stempel: string
  try {
    const st = statSync(pad)
    stempel = `${st.size}|${Math.round(st.mtimeMs)}`
  } catch {
    return undefined
  }
  const bekend = geheugen.get(pad)
  if (bekend && bekend.stempel === stempel) return bekend.kleuren ?? undefined
  let kleuren: [string, string, string] | null = null
  try {
    const t = leesKlein(pad)
    if (t) kleuren = drieKleuren(t)
  } catch {
    kleuren = null
  }
  if (geheugen.size > 4000) geheugen.clear()
  geheugen.set(pad, { stempel, kleuren })
  return kleuren ?? undefined
}

/** Lees `lengte` bytes vanaf `plek`. */
function leesStuk(fd: number, plek: number, lengte: number): Uint8Array {
  const b = new Uint8Array(lengte)
  let gelezen = 0
  while (gelezen < lengte) {
    const n = readSync(fd, b, gelezen, lengte - gelezen, plek + gelezen)
    if (n <= 0) break
    gelezen += n
  }
  return gelezen === lengte ? b : b.subarray(0, gelezen)
}

/** De textuur, zo klein als het kan: van een DXT met mips alleen het niveau rond 64 pixels. */
function leesKlein(pad: string): Textuur | undefined {
  const fd = openSync(pad, 'r')
  try {
    const grootte = statSync(pad).size
    const begin = leesStuk(fd, 0, Math.min(grootte, KOP_BYTES))
    const kop = textuurKop(begin, grootte)
    if ('klacht' in kop) return undefined
    if (kop.soort === 'dds' && kop.formaat && kop.niveaus && kop.niveaus.length > 0) {
      // Het eerste niveau met hooguit 64 pixels in de lengte; anders het kleinste dat er is.
      let n = 0
      while (n < kop.niveaus.length - 1 && Math.max(kop.b >> n, kop.h >> n) > 64) n++
      const b = Math.max(1, kop.b >> n)
      const h = Math.max(1, kop.h >> n)
      const plak = kop.niveaus[n]
      const dds = new Uint8Array(128 + plak.len)
      dds.set(begin.subarray(0, 128), 0)
      const dv = new DataView(dds.buffer)
      dv.setUint32(12, h, true)
      dv.setUint32(16, b, true)
      dv.setUint32(28, 1, true)
      dds.set(leesStuk(fd, plak.off, plak.len), 128)
      return ontleedTextuur(dds).textuur
    }
    const alles = leesStuk(fd, 0, grootte)
    if (kop.soort === 'bmp') return pakBmpUit(alles)
    if (kop.soort === 'png') return leesPng(alles)
    if (kop.soort === 'jpg') return undefined
    return ontleedTextuur(alles).textuur
  } finally {
    closeSync(fd)
  }
}

/** Drie kleuren: de drukste emmers (4 bits per kanaal), elk genoeg verschillend van de vorige. */
function drieKleuren(t: Textuur): [string, string, string] | null {
  const n = t.breedte * t.hoogte
  if (n === 0) return null
  const stap = Math.max(1, Math.floor(n / 8192))
  const emmers = new Map<number, { n: number; r: number; g: number; b: number }>()
  for (let p = 0; p < n; p += stap) {
    const i = p * 4
    const r = t.pixels[i]
    const g = t.pixels[i + 1]
    const b = t.pixels[i + 2]
    const sleutel = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
    const e = emmers.get(sleutel)
    if (e) {
      e.n++
      e.r += r
      e.g += g
      e.b += b
    } else emmers.set(sleutel, { n: 1, r, g, b })
  }
  /*
   * Zuiver zwart achteraan: de ongebruikte vakken van een textuuratlas zijn
   * zwart, en dan begon elke staal van de NLC met zwart. Een lak die echt zwart
   * is, komt zo nog steeds in de staal, alleen niet voorop.
   */
  const zwart = (e: { n: number; r: number; g: number; b: number }): boolean => Math.max(e.r, e.g, e.b) / e.n < 16
  const lijst = [...emmers.values()]
    .sort((a, b) => Number(zwart(a)) - Number(zwart(b)) || b.n - a.n)
    .map((e) => [e.r / e.n, e.g / e.n, e.b / e.n] as const)
  const gekozen: Array<readonly [number, number, number]> = []
  for (const k of lijst) {
    if (gekozen.every((g) => Math.hypot(g[0] - k[0], g[1] - k[1], g[2] - k[2]) > 48)) gekozen.push(k)
    if (gekozen.length === 3) break
  }
  if (gekozen.length === 0) return null
  while (gekozen.length < 3) gekozen.push(gekozen[gekozen.length - 1])
  const hex = (k: readonly [number, number, number]): string =>
    `#${k.map((w) => Math.round(Math.min(255, Math.max(0, w))).toString(16).padStart(2, '0')).join('')}`
  return [hex(gekozen[0]), hex(gekozen[1]), hex(gekozen[2])]
}
