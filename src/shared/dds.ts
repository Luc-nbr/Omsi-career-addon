import { niveauBytes, type BcFormaat } from './bcn'

/**
 * DDS MET EEN KLASSIEKE DX9-KOP (lakstudio-ontwerp §5.3)
 *
 * `'DDS '` + 124 bytes, vlaggen CAPS|HEIGHT|WIDTH|PIXELFORMAT|MIPMAPCOUNT|
 * LINEARSIZE, een pixelformaat met FOURCC `DXT5` of `DXT1`, caps
 * TEXTURE|COMPLEX|MIPMAP. Geen DX10-kop en geen BC7: OMSI laadt via D3DX9, en
 * dat kent die niet (https://github.com/brokenphilip/OMSI_Errors/issues/2).
 * Puur: de studio schrijft in de werker, main controleert met `leesDdsKop`.
 */

const DDSD_CAPS = 0x1
const DDSD_HEIGHT = 0x2
const DDSD_WIDTH = 0x4
const DDSD_PIXELFORMAT = 0x1000
const DDSD_MIPMAPCOUNT = 0x20000
const DDSD_LINEARSIZE = 0x80000
const DDPF_FOURCC = 0x4
const DDSCAPS_COMPLEX = 0x8
const DDSCAPS_TEXTURE = 0x1000
const DDSCAPS_MIPMAP = 0x400000

export const DDS_KOP = 128

function zet32(b: Uint8Array, o: number, w: number): void {
  b[o] = w & 255
  b[o + 1] = (w >>> 8) & 255
  b[o + 2] = (w >>> 16) & 255
  b[o + 3] = (w >>> 24) & 255
}
function lees32(b: Uint8Array, o: number): number {
  return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0
}

/** De maten van de niveaus van een keten: max(1, ⌊maat/2⌋) zoals Direct3D. */
export function niveauMaten(b: number, h: number, aantal: number): Array<{ b: number; h: number }> {
  const uit: Array<{ b: number; h: number }> = []
  let w = b
  let hh = h
  for (let i = 0; i < aantal; i++) {
    uit.push({ b: w, h: hh })
    w = Math.max(1, w >> 1)
    hh = Math.max(1, hh >> 1)
  }
  return uit
}

/** De kop van 128 bytes. */
export function ddsKop(b: number, h: number, niveaus: number, f: BcFormaat): Uint8Array {
  const k = new Uint8Array(DDS_KOP)
  k.set([0x44, 0x44, 0x53, 0x20], 0)
  zet32(k, 4, 124)
  zet32(k, 8, DDSD_CAPS | DDSD_HEIGHT | DDSD_WIDTH | DDSD_PIXELFORMAT | DDSD_MIPMAPCOUNT | DDSD_LINEARSIZE)
  zet32(k, 12, h)
  zet32(k, 16, b)
  zet32(k, 20, niveauBytes(b, h, f))
  zet32(k, 24, 0)
  zet32(k, 28, niveaus)
  // reserved1[11]: nul. Het pixelformaat op 76.
  zet32(k, 76, 32)
  zet32(k, 80, DDPF_FOURCC)
  k.set(f === 'bc1' ? [0x44, 0x58, 0x54, 0x31] : [0x44, 0x58, 0x54, 0x35], 84)
  zet32(k, 108, DDSCAPS_TEXTURE | (niveaus > 1 ? DDSCAPS_COMPLEX | DDSCAPS_MIPMAP : 0))
  return k
}

/**
 * Een DDS uit de blokken van elk niveau (niveau 0 voorop). Geeft ook de
 * `_#low` als die gevraagd is: dezelfde blokken vanaf niveau 1, niet opnieuw
 * gecodeerd (§4.14, punt 5).
 */
export function schrijfDds(
  b: number,
  h: number,
  f: BcFormaat,
  niveaus: Uint8Array[]
): Uint8Array {
  const maten = niveauMaten(b, h, niveaus.length)
  niveaus.forEach((n, i) => {
    const nodig = niveauBytes(maten[i].b, maten[i].h, f)
    if (n.length !== nodig) throw new Error(`niveau ${i}: ${n.length} bytes, ${nodig} verwacht`)
  })
  const totaal = DDS_KOP + niveaus.reduce((s, n) => s + n.length, 0)
  const uit = new Uint8Array(totaal)
  uit.set(ddsKop(b, h, niveaus.length, f), 0)
  let o = DDS_KOP
  for (const n of niveaus) {
    uit.set(n, o)
    o += n.length
  }
  return uit
}

export interface DdsKop {
  b: number
  h: number
  niveaus: number
  formaat?: BcFormaat
  fourcc: string
  dx10: boolean
  /** Waar elk niveau begint en hoe lang het is. */
  plakken: Array<{ off: number; len: number; b: number; h: number }>
  /** Klopt de lengte van het bestand precies met de keten? */
  compleet: boolean
}

/**
 * De kop terug, voor de controle in main (§5.5, punt 7): 'DDS ', een
 * DXT1/DXT5 zonder DX10, de maat, een volle keten tot 1x1, en de lengte precies
 * die van de keten.
 */
export function leesDdsKop(bytes: Uint8Array): DdsKop | undefined {
  if (bytes.length < DDS_KOP || bytes[0] !== 0x44 || bytes[1] !== 0x44 || bytes[2] !== 0x53 || bytes[3] !== 0x20) return undefined
  if (lees32(bytes, 4) !== 124) return undefined
  const h = lees32(bytes, 12)
  const b = lees32(bytes, 16)
  const vlaggen = lees32(bytes, 8)
  const niveaus = vlaggen & DDSD_MIPMAPCOUNT ? Math.max(1, lees32(bytes, 28)) : 1
  const fourcc = String.fromCharCode(bytes[84], bytes[85], bytes[86], bytes[87])
  const formaat: BcFormaat | undefined = fourcc === 'DXT1' ? 'bc1' : fourcc === 'DXT5' ? 'bc3' : undefined
  const plakken: DdsKop['plakken'] = []
  let o = DDS_KOP
  if (formaat) {
    for (const m of niveauMaten(b, h, niveaus)) {
      const len = niveauBytes(m.b, m.h, formaat)
      plakken.push({ off: o, len, b: m.b, h: m.h })
      o += len
    }
  }
  return { b, h, niveaus, formaat, fourcc, dx10: fourcc === 'DX10', plakken, compleet: Boolean(formaat) && o === bytes.length }
}

/**
 * Is niveau 0 helemaal nul (zwart, alfa 0)? Zo ziet een export eruit die op
 * een verloren WebGL-context uitgelezen werd: `getBufferSubData` gaf niets, de
 * buffer bleef nul, en de codeerder maakte daar een formeel geldige DDS van
 * (tegenlezing L3 punt 1). Die mag nooit in OMSI komen. Een echte lak heeft
 * altijd ergens een texel met kleur of alfa.
 */
export function ddsLeeg(bytes: Uint8Array): boolean {
  const kop = leesDdsKop(bytes)
  const n0 = kop?.plakken[0]
  if (!n0) return false
  const eind = Math.min(bytes.length, n0.off + n0.len)
  for (let i = n0.off; i < eind; i++) if (bytes[i] !== 0) return false
  return true
}

/** Het aantal niveaus van een volle keten tot 1x1. */
export function volleKeten(b: number, h: number): number {
  return Math.floor(Math.log2(Math.max(1, b, h))) + 1
}

/**
 * De `_#low` uit een volle DDS: niveau 1 en verder, met een eigen kop; de
 * blokken byte voor byte dezelfde. Alleen als niveau 1 op 4 deelbaar is (een
 * DXT-textuur waarvan het begin dat niet is, weigeren Direct3D 9 en WebGL);
 * anders `undefined`.
 */
export function lowUitDds(dds: Uint8Array): Uint8Array | undefined {
  const kop = leesDdsKop(dds)
  if (!kop?.formaat || kop.niveaus < 2) return undefined
  const eerste = kop.plakken[1]
  if (eerste.b % 4 !== 0 || eerste.h % 4 !== 0) return undefined
  const uit = new Uint8Array(DDS_KOP + dds.length - eerste.off)
  uit.set(ddsKop(eerste.b, eerste.h, kop.niveaus - 1, kop.formaat), 0)
  uit.set(dds.subarray(eerste.off), DDS_KOP)
  return uit
}
