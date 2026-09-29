/**
 * Wat rekenwerk voor het 3D-venster: 4x4-matrices in kolomvolgorde, zoals
 * WebGL ze wil, en drietallen. Klein en zonder afhankelijkheden.
 *
 * ASSEN VAN DE WERELD
 * De o3d-bestanden zijn linkshandig (DirectX): x naar rechts (de deurkant), y
 * omhoog, z vooruit. De wereld van de renderer is rechtshandig: X = -x, Y = y,
 * Z = z. De spiegeling gebeurt in de hoekpuntshader; daardoor draait de
 * windingsrichting om en is een voorvlak hier met de klok mee (`frontFace(CW)`,
 * zoals in de busfoto gemeten).
 */

export type Vec3 = [number, number, number]
export type Mat4 = Float32Array

export const graden = (g: number): number => (g * Math.PI) / 180

export function plus(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}
export function min(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}
export function maal(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s]
}
export function punt(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}
export function kruis(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}
export function lengte(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2])
}
export function eenheid(a: Vec3): Vec3 {
  const l = lengte(a) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}

export function eenheidsmatrix(): Mat4 {
  const m = new Float32Array(16)
  m[0] = m[5] = m[10] = m[15] = 1
  return m
}

/** a * b (eerst b, dan a). */
export function vermenigvuldig(a: Mat4, b: Mat4): Mat4 {
  const uit = new Float32Array(16)
  for (let k = 0; k < 4; k++) {
    for (let r = 0; r < 4; r++) {
      let s = 0
      for (let i = 0; i < 4; i++) s += a[i * 4 + r] * b[k * 4 + i]
      uit[k * 4 + r] = s
    }
  }
  return uit
}

/** Perspectief met een verticale kijkhoek (radialen); diepte -1..1. */
export function perspectief(kijkhoek: number, verhouding: number, dichtbij: number, ver: number): Mat4 {
  const f = 1 / Math.tan(kijkhoek / 2)
  const m = new Float32Array(16)
  m[0] = f / verhouding
  m[5] = f
  m[10] = (ver + dichtbij) / (dichtbij - ver)
  m[11] = -1
  m[14] = (2 * ver * dichtbij) / (dichtbij - ver)
  return m
}

/** Orthografisch; diepte -1..1. */
export function orthografisch(l: number, r: number, o: number, b: number, dichtbij: number, ver: number): Mat4 {
  const m = new Float32Array(16)
  m[0] = 2 / (r - l)
  m[5] = 2 / (b - o)
  m[10] = -2 / (ver - dichtbij)
  m[12] = -(r + l) / (r - l)
  m[13] = -(b + o) / (b - o)
  m[14] = -(ver + dichtbij) / (ver - dichtbij)
  m[15] = 1
  return m
}

/** Kijken van `oog` naar `doel`, rechtshandig. */
export function kijkNaar(oog: Vec3, doel: Vec3, omhoog: Vec3 = [0, 1, 0]): Mat4 {
  const f = eenheid(min(doel, oog))
  let s = kruis(f, omhoog)
  if (lengte(s) < 1e-6) s = kruis(f, [0, 0, 1])
  s = eenheid(s)
  const u = kruis(s, f)
  const m = new Float32Array(16)
  m[0] = s[0]
  m[4] = s[1]
  m[8] = s[2]
  m[1] = u[0]
  m[5] = u[1]
  m[9] = u[2]
  m[2] = -f[0]
  m[6] = -f[1]
  m[10] = -f[2]
  m[12] = -punt(s, oog)
  m[13] = -punt(u, oog)
  m[14] = punt(f, oog)
  m[15] = 1
  return m
}

/** Een punt door een matrix, met de deling door w. */
export function projecteer(m: Mat4, p: Vec3): [number, number, number, number] {
  const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]
  const y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]
  const z = m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]
  const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15]
  return [x / w, y / w, z / w, w]
}

/** De inverse van een 4x4-matrix (voor de hemel: van scherm naar kijkrichting). */
export function inverse(m: Mat4): Mat4 {
  const a = m
  const uit = new Float32Array(16)
  const b00 = a[0] * a[5] - a[1] * a[4]
  const b01 = a[0] * a[6] - a[2] * a[4]
  const b02 = a[0] * a[7] - a[3] * a[4]
  const b03 = a[1] * a[6] - a[2] * a[5]
  const b04 = a[1] * a[7] - a[3] * a[5]
  const b05 = a[2] * a[7] - a[3] * a[6]
  const b06 = a[8] * a[13] - a[9] * a[12]
  const b07 = a[8] * a[14] - a[10] * a[12]
  const b08 = a[8] * a[15] - a[11] * a[12]
  const b09 = a[9] * a[14] - a[10] * a[13]
  const b10 = a[9] * a[15] - a[11] * a[13]
  const b11 = a[10] * a[15] - a[11] * a[14]
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06
  if (!det) return eenheidsmatrix()
  det = 1 / det
  uit[0] = (a[5] * b11 - a[6] * b10 + a[7] * b09) * det
  uit[1] = (a[2] * b10 - a[1] * b11 - a[3] * b09) * det
  uit[2] = (a[13] * b05 - a[14] * b04 + a[15] * b03) * det
  uit[3] = (a[10] * b04 - a[9] * b05 - a[11] * b03) * det
  uit[4] = (a[6] * b08 - a[4] * b11 - a[7] * b07) * det
  uit[5] = (a[0] * b11 - a[2] * b08 + a[3] * b07) * det
  uit[6] = (a[14] * b02 - a[12] * b05 - a[15] * b01) * det
  uit[7] = (a[8] * b05 - a[10] * b02 + a[11] * b01) * det
  uit[8] = (a[4] * b10 - a[5] * b08 + a[7] * b06) * det
  uit[9] = (a[1] * b08 - a[0] * b10 - a[3] * b06) * det
  uit[10] = (a[12] * b04 - a[13] * b02 + a[15] * b00) * det
  uit[11] = (a[9] * b02 - a[8] * b04 - a[11] * b00) * det
  uit[12] = (a[5] * b07 - a[4] * b09 - a[6] * b06) * det
  uit[13] = (a[0] * b09 - a[1] * b07 + a[2] * b06) * det
  uit[14] = (a[13] * b01 - a[12] * b03 - a[14] * b00) * det
  uit[15] = (a[8] * b03 - a[9] * b01 + a[10] * b00) * det
  return uit
}

/** o3d-assen (linkshandig) naar de wereld (rechtshandig). */
export const naarWereld = (p: Vec3): Vec3 => [-p[0], p[1], p[2]]
