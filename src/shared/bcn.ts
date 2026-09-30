/**
 * EEN EIGEN BC1/BC3-ENCODER (DXT1/DXT5), PUUR (lakstudio-ontwerp §5.3, §4.14)
 *
 * Voor de Lakstudio: de lak gaat als DDS de OMSI-map in, en een TGA van 4096²
 * kost OMSI 43 MB videogeheugen tegen 11 MB als BC3 met mips. Er is geen
 * encoder in de browser, en een bibliotheek halen we niet binnen; dit is een
 * eenvoudige en voorspelbare, in de codeerwerkers van de studio (en in node, voor
 * de proef).
 *
 * KLEURBLOK: de hoofdas van de 16 kleuren (machtsiteratie op de covariantie),
 * eindpunten op de uiterste projecties met 1/16 inzet, indices op gewogen
 * afstand (2·R², 4·G², B²), daarna één keer de eindpunten met kleinste kwadraten
 * op die indices opnieuw, en het beste van de twee blijft. Altijd de
 * 4-kleurenmodus (c0 > c1); bij c0 == c1 alleen index 0 (§4.14, punt 4): nooit
 * de 3-kleurenmodus met doorzichtig zwart, ook niet in BC1.
 *
 * ALFABLOK (BC3): 8 niveaus tussen de hoogste en laagste alfa (a0 > a1), of
 * alles a0 als het blok één alfa heeft.
 *
 * De paletten rekenen we zoals de lezer van de app (shared/beeldlezers.ts):
 * 5 en 6 bits afgerond naar 8, tussenkleuren (2a + b + 1) / 3 afgekapt. Gemeten
 * op het ontwerp (K/ontw-bc3.cjs, zonder de kleinste kwadraten): HH20 2048² BC3
 * 271 ms, PSNR 35,7 dB (RGB) en 59,8 dB (alfa).
 */

const VIJF = new Uint8Array(32)
const ZES = new Uint8Array(64)
for (let i = 0; i < 32; i++) VIJF[i] = Math.round((i * 255) / 31)
for (let i = 0; i < 64; i++) ZES[i] = Math.round((i * 255) / 63)

/** 8 bits naar het dichtste 5- of 6-bitsgetal ONDER de afronding van de lezer. */
const NAAR5 = new Uint8Array(256)
const NAAR6 = new Uint8Array(256)
for (let v = 0; v < 256; v++) {
  let b5 = 0
  let b6 = 0
  for (let i = 1; i < 32; i++) if (Math.abs(VIJF[i] - v) < Math.abs(VIJF[b5] - v)) b5 = i
  for (let i = 1; i < 64; i++) if (Math.abs(ZES[i] - v) < Math.abs(ZES[b6] - v)) b6 = i
  NAAR5[v] = b5
  NAAR6[v] = b6
}

const klem8 = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v))
const naar565 = (r: number, g: number, b: number): number => (NAAR5[klem8(r)] << 11) | (NAAR6[klem8(g)] << 5) | NAAR5[klem8(b)]

export type BcFormaat = 'bc1' | 'bc3'

export const blokBytes = (f: BcFormaat): number => (f === 'bc1' ? 8 : 16)

/** De bytes van één niveau: blokken van 4x4, aan de rand opgevuld. */
export function niveauBytes(b: number, h: number, f: BcFormaat): number {
  return Math.max(1, Math.ceil(b / 4)) * Math.max(1, Math.ceil(h / 4)) * blokBytes(f)
}

// Werkgeheugen per blok, hergebruikt: een lak van 4096² is een miljoen blokken.
const pr = new Float64Array(16)
const pg = new Float64Array(16)
const pb = new Float64Array(16)
const pal = new Int32Array(12)
const idx = new Uint8Array(16)
const idx2 = new Uint8Array(16)

function palet(c0: number, c1: number): void {
  pal[0] = VIJF[(c0 >> 11) & 31]
  pal[1] = ZES[(c0 >> 5) & 63]
  pal[2] = VIJF[c0 & 31]
  pal[3] = VIJF[(c1 >> 11) & 31]
  pal[4] = ZES[(c1 >> 5) & 63]
  pal[5] = VIJF[c1 & 31]
  for (let k = 0; k < 3; k++) {
    pal[6 + k] = Math.floor((2 * pal[k] + pal[3 + k] + 1) / 3)
    pal[9 + k] = Math.floor((pal[k] + 2 * pal[3 + k] + 1) / 3)
  }
}

/** De indices bij c0/c1 (palet al gezet) in `uit`; geeft de gewogen fout. */
function kiesIndices(uit: Uint8Array, gelijk: boolean): number {
  let fout = 0
  for (let i = 0; i < 16; i++) {
    if (gelijk) {
      const dr = pr[i] - pal[0]
      const dg = pg[i] - pal[1]
      const db = pb[i] - pal[2]
      uit[i] = 0
      fout += 2 * dr * dr + 4 * dg * dg + db * db
      continue
    }
    let best = 0
    let bd = Infinity
    // Paletvolgorde van DXT: 0 = c0, 1 = c1, 2 = 2/3 c0, 3 = 1/3 c0.
    for (let j = 0; j < 4; j++) {
      const o = j === 0 ? 0 : j === 1 ? 3 : j === 2 ? 6 : 9
      const dr = pr[i] - pal[o]
      const dg = pg[i] - pal[o + 1]
      const db = pb[i] - pal[o + 2]
      const d = 2 * dr * dr + 4 * dg * dg + db * db
      if (d < bd) {
        bd = d
        best = j
      }
    }
    uit[i] = best
    fout += bd
  }
  return fout
}

/** c0 > c1 afdwingen (4-kleurenmodus); bij een wissel de indices meeruilen (0↔1, 2↔3). */
function ordenen(c0: number, c1: number, ind: Uint8Array): [number, number] {
  if (c0 > c1) return [c0, c1]
  if (c0 === c1) {
    ind.fill(0)
    return [c0, c1]
  }
  for (let i = 0; i < 16; i++) ind[i] ^= 1
  return [c1, c0]
}

/** Het kleurblok van de 16 pixels in pr/pg/pb, naar `uit` op `o` (8 bytes). */
function kleurBlok(uit: Uint8Array, o: number): void {
  let mr = 0
  let mg = 0
  let mb = 0
  let alleGelijk = true
  for (let i = 0; i < 16; i++) {
    mr += pr[i]
    mg += pg[i]
    mb += pb[i]
    if (pr[i] !== pr[0] || pg[i] !== pg[0] || pb[i] !== pb[0]) alleGelijk = false
  }
  let c0: number
  let c1: number
  if (alleGelijk) {
    // Eén kleur: de dichtste 565; een tweede eindpunt voegt dan niets toe.
    c0 = naar565(pr[0], pg[0], pb[0])
    c1 = c0
    idx.fill(0)
    schrijfKleur(uit, o, c0, c1, idx)
    return
  }
  mr /= 16
  mg /= 16
  mb /= 16
  let c00 = 0
  let c01 = 0
  let c02 = 0
  let c11 = 0
  let c12 = 0
  let c22 = 0
  for (let i = 0; i < 16; i++) {
    const r = pr[i] - mr
    const g = pg[i] - mg
    const b = pb[i] - mb
    c00 += r * r
    c01 += r * g
    c02 += r * b
    c11 += g * g
    c12 += g * b
    c22 += b * b
  }
  let vr = 1
  let vg = 1
  let vb = 1
  for (let k = 0; k < 6; k++) {
    const r = c00 * vr + c01 * vg + c02 * vb
    const g = c01 * vr + c11 * vg + c12 * vb
    const b = c02 * vr + c12 * vg + c22 * vb
    const m = Math.max(Math.abs(r), Math.abs(g), Math.abs(b))
    if (m === 0) break
    vr = r / m
    vg = g / m
    vb = b / m
  }
  let lo = Infinity
  let hi = -Infinity
  let il = 0
  let ih = 0
  for (let i = 0; i < 16; i++) {
    const t = pr[i] * vr + pg[i] * vg + pb[i] * vb
    if (t < lo) {
      lo = t
      il = i
    }
    if (t > hi) {
      hi = t
      ih = i
    }
  }
  const ar = pr[il]
  const ag = pg[il]
  const ab = pb[il]
  const br = pr[ih]
  const bg = pg[ih]
  const bb = pb[ih]
  const dr = (br - ar) / 16
  const dg = (bg - ag) / 16
  const db = (bb - ab) / 16
  c0 = naar565(br - dr, bg - dg, bb - db)
  c1 = naar565(ar + dr, ag + dg, ab + db)
  ;[c0, c1] = c0 >= c1 ? [c0, c1] : [c1, c0]
  palet(c0, c1)
  let fout = kiesIndices(idx, c0 === c1)

  // Eén ronde kleinste kwadraten: c0·w + c1·(1-w) met w per index 1, 0, 2/3, 1/3.
  if (c0 !== c1) {
    let aa = 0
    let ab2 = 0
    let bb2 = 0
    let xr = 0
    let xg = 0
    let xb = 0
    let yr = 0
    let yg = 0
    let yb = 0
    for (let i = 0; i < 16; i++) {
      const w = idx[i] === 0 ? 1 : idx[i] === 1 ? 0 : idx[i] === 2 ? 2 / 3 : 1 / 3
      const v = 1 - w
      aa += w * w
      ab2 += w * v
      bb2 += v * v
      xr += w * pr[i]
      xg += w * pg[i]
      xb += w * pb[i]
      yr += v * pr[i]
      yg += v * pg[i]
      yb += v * pb[i]
    }
    const det = aa * bb2 - ab2 * ab2
    if (Math.abs(det) > 1e-9) {
      const e0 = naar565((bb2 * xr - ab2 * yr) / det, (bb2 * xg - ab2 * yg) / det, (bb2 * xb - ab2 * yb) / det)
      const e1 = naar565((aa * yr - ab2 * xr) / det, (aa * yg - ab2 * xg) / det, (aa * yb - ab2 * xb) / det)
      const n0 = Math.max(e0, e1)
      const n1 = Math.min(e0, e1)
      palet(n0, n1)
      const fout2 = kiesIndices(idx2, n0 === n1)
      if (fout2 < fout) {
        fout = fout2
        c0 = n0
        c1 = n1
        idx.set(idx2)
      } else palet(c0, c1)
    }
  }
  const [k0, k1] = ordenen(c0, c1, idx)
  schrijfKleur(uit, o, k0, k1, idx)
}

function schrijfKleur(uit: Uint8Array, o: number, c0: number, c1: number, ind: Uint8Array): void {
  uit[o] = c0 & 255
  uit[o + 1] = c0 >> 8
  uit[o + 2] = c1 & 255
  uit[o + 3] = c1 >> 8
  let bits = 0
  for (let i = 15; i >= 0; i--) bits = ((bits << 2) | (c0 === c1 ? 0 : ind[i])) >>> 0
  uit[o + 4] = bits & 255
  uit[o + 5] = (bits >>> 8) & 255
  uit[o + 6] = (bits >>> 16) & 255
  uit[o + 7] = (bits >>> 24) & 255
}

const alfaWerk = new Uint8Array(16)
const alfaPal = new Int32Array(8)

/** Het alfablok (8 bytes) van de 16 alfa's in `alfaWerk`. */
function alfaBlok(uit: Uint8Array, o: number): void {
  let lo = 255
  let hi = 0
  for (let i = 0; i < 16; i++) {
    const a = alfaWerk[i]
    if (a < lo) lo = a
    if (a > hi) hi = a
  }
  uit[o] = hi
  uit[o + 1] = lo
  alfaPal[0] = hi
  alfaPal[1] = lo
  // Zoals de lezer: afgerond (beeldlezers.ts rekent Math.round((7-i)·a0 + i·a1) / 7).
  for (let k = 1; k <= 6; k++) alfaPal[k + 1] = hi > lo ? Math.round(((7 - k) * hi + k * lo) / 7) : hi
  // 48 bits in twee helften van 24: geen BigInt nodig.
  let laag = 0
  let hoog = 0
  for (let i = 0; i < 16; i++) {
    const a = alfaWerk[i]
    let best = 0
    let bd = 999
    if (hi > lo) {
      for (let j = 0; j < 8; j++) {
        const d = Math.abs(a - alfaPal[j])
        if (d < bd) {
          bd = d
          best = j
        }
      }
    }
    if (i < 8) laag |= best << (3 * i)
    else hoog |= best << (3 * (i - 8))
  }
  uit[o + 2] = laag & 255
  uit[o + 3] = (laag >>> 8) & 255
  uit[o + 4] = (laag >>> 16) & 255
  uit[o + 5] = hoog & 255
  uit[o + 6] = (hoog >>> 8) & 255
  uit[o + 7] = (hoog >>> 16) & 255
}

/**
 * Codeer rijen blokken `[vanRij, totRij)` van een RGBA-beeld (van boven naar
 * beneden, 4 bytes per pixel) naar BC1 of BC3. Voor de codeerwerkers: elk een
 * band van rijen, de uitvoer achter elkaar is het hele niveau.
 */
export function codeerBc(
  rgba: Uint8Array,
  b: number,
  h: number,
  f: BcFormaat,
  vanRij = 0,
  totRij = Math.max(1, Math.ceil(h / 4))
): Uint8Array {
  const bw = Math.max(1, Math.ceil(b / 4))
  const stap = blokBytes(f)
  const uit = new Uint8Array((totRij - vanRij) * bw * stap)
  for (let by = vanRij; by < totRij; by++) {
    for (let bx = 0; bx < bw; bx++) {
      for (let y = 0; y < 4; y++) {
        const sy = Math.min(h - 1, by * 4 + y)
        for (let x = 0; x < 4; x++) {
          const sx = Math.min(b - 1, bx * 4 + x)
          const s = (sy * b + sx) * 4
          const d = y * 4 + x
          pr[d] = rgba[s]
          pg[d] = rgba[s + 1]
          pb[d] = rgba[s + 2]
          alfaWerk[d] = rgba[s + 3]
        }
      }
      const o = ((by - vanRij) * bw + bx) * stap
      if (f === 'bc3') {
        alfaBlok(uit, o)
        kleurBlok(uit, o + 8)
      } else kleurBlok(uit, o)
    }
  }
  return uit
}

/** Staat er ergens een alfa onder 255? Dan BC3, anders BC1 (§4.14, punt 4). */
export function heeftAlfa(rgba: Uint8Array): boolean {
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] !== 255) return true
  return false
}

/* ------------------------------------------------------------------ de mipketen */

/** sRGB (0-255) naar lineair (0-1), als tabel. */
const LIN = new Float32Array(256)
for (let i = 0; i < 256; i++) {
  const c = i / 255
  LIN[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
/** Lineair naar sRGB-byte, via een fijne tabel (4096 stappen) en afronding. */
const SRGB = new Uint8Array(4097)
for (let i = 0; i <= 4096; i++) {
  const c = i / 4096
  const s = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055
  SRGB[i] = Math.round(Math.min(1, Math.max(0, s)) * 255)
}

/**
 * Eén mipniveau omlaag, in lineair licht (§5.3: "lineair gefilterd"; OMSI zou
 * met een boxfilter in sRGB aanvullen): 2x2 gemiddeld, de nieuwe maat is
 * max(1, ⌊maat/2⌋) zoals Direct3D. Bij een oneven maat valt de laatste rij of
 * kolom weg; alfa gemiddeld zoals hij is.
 */
export function mipOmlaag(rgba: Uint8Array, b: number, h: number): { rgba: Uint8Array; b: number; h: number } {
  const nb = Math.max(1, b >> 1)
  const nh = Math.max(1, h >> 1)
  const uit = new Uint8Array(nb * nh * 4)
  const sx = b > 1 ? 2 : 1
  const sy = h > 1 ? 2 : 1
  const n = sx * sy
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nb; x++) {
      let r = 0
      let g = 0
      let bl = 0
      let a = 0
      for (let dy = 0; dy < sy; dy++) {
        for (let dx = 0; dx < sx; dx++) {
          const s = ((y * sy + dy) * b + (x * sx + dx)) * 4
          r += LIN[rgba[s]]
          g += LIN[rgba[s + 1]]
          bl += LIN[rgba[s + 2]]
          a += rgba[s + 3]
        }
      }
      const d = (y * nb + x) * 4
      uit[d] = SRGB[Math.round((r / n) * 4096)]
      uit[d + 1] = SRGB[Math.round((g / n) * 4096)]
      uit[d + 2] = SRGB[Math.round((bl / n) * 4096)]
      uit[d + 3] = Math.round(a / n)
    }
  }
  return { rgba: uit, b: nb, h: nh }
}

/** De hele keten tot 1x1, niveau 0 voorop (dat is `rgba` zelf). */
export function mipKeten(rgba: Uint8Array, b: number, h: number): Array<{ rgba: Uint8Array; b: number; h: number }> {
  const keten = [{ rgba, b, h }]
  while (keten[keten.length - 1].b > 1 || keten[keten.length - 1].h > 1) {
    const v = keten[keten.length - 1]
    keten.push(mipOmlaag(v.rgba, v.b, v.h))
  }
  return keten
}
