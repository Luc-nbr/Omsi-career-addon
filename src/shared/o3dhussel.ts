/**
 * GEHUSSELDE O3D-HOEKPUNTEN TERUGZETTEN, ZOALS OMSI DAT ZELF DOET
 *
 * Vanaf o3d-versie 4 staat op byte 4-7 van het bestand een woord. `ffffffff`
 * betekent open; elk ander woord betekent dat per hoekpunt de drie coördinaten,
 * de normaal en de uv door elkaar gezet zijn. Driehoeken, materialen, matrix en
 * beenderen staan gewoon open (core/o3d.ts).
 *
 * HET WOORD IS HET ARTIKELNUMMER VAN HET ADD-ON
 * Geen geheim en geen licentiecode: 0x31b6 is 12726 (OMSI 2 - Hamburg), 0x3d29
 * is 15657 (Linie 20), enzovoort; 0 staat in de standaardinhoud (MAN NL/NG).
 * OMSI toont een gehusseld bestand alleen als het woord 0 is, of als het add-on
 * met dat artikelnummer op deze pc geregistreerd en bevestigd is
 * (core/omsiregistratie.ts). Wij doen precies hetzelfde: `magOntwarren`. Een
 * sleutel die hier niet geregistreerd is, ontwarren we niet, ook al zou de
 * rekenregel het toelaten (Lucs keuze 1, 28-09-2026; bus3d-ontwerp §5.1).
 *
 * DE REKENREGEL
 * Eigen code. Het idee komt uit openOMSI v0.1.7 (MIT; crates/omsi-o3d/src/lib.rs
 * en docs/FORMATS.md, "o3d"), en is nagelezen in Omsi.exe 2.3.004 zelf:
 * - de begintoestand: 0x56C9AE-0x56CA46 (woord + versie - 4, plus 0x17D als bit
 *   1 van de vlagbyte aan staat, modulo 0xFDE8);
 * - per hoekpunt: 0x56D123-0x56D147 (bij woord 0 eerst terug naar 0x130 of 0),
 *   0x56AF38 (toestand = (toestand * n + n * b) mod 8000, met `mul` en `div`
 *   zonder teken; bij een overloop boven 2^31 gooit OMSI een fout, dat komt bij
 *   de geregistreerde sleutels niet voor), 0x56D15C-0x56D206 (b uit de NOG
 *   GEHUSSELDE positie, in x87), 0x56D209-0x56D3F7 (wisselen, omkeren en de uv
 *   verschuiven; de constanten 600, 10000 en 2500 staan op 0x56DFFC-0x56E004).
 *
 * Nagemeten (bus3d-ontwerp, bijlage B, en scratchpad/bus3d/sleutels):
 * `21_aussen_weich3.o3d` (15657, versie 7, vlag 2) tegen zijn open tweeling
 * `21_aussen_weich3_#low.o3d`: alle 582 posities en normalen bit-gelijk; over
 * 3027 tweelingparen (1,97 miljoen hoekpunten) 0 afwijkingen.
 *
 * WAT HIER NIET IN KOMT
 * - Geen `Buffer` en geen `node:`: dit draait ook in de renderer-werker van het
 *   3D-venster, direct na de fetch en vóór het uploaden.
 * - Geen lijst met sleutels van buiten. Alleen wat in het bestand zelf staat:
 *   versie, vlagbyte, het woord en het aantal hoekpunten.
 * - Ontwarde hoekpunten gaan nooit naar schijf (Lucs regel): het pakket bewaart
 *   het blok zoals in het bronbestand, en ontwarren gebeurt pas in het geheugen.
 */

/** Wat uit de kop van de o3d nodig is. `sleutel` is het woord op byte 4-7. */
export interface HusselKop {
  versie: number
  vlag: number
  sleutel: number
  /** Het aantal hoekpunten in het blok. */
  n: number
}

/** Open: geen hussel (versie < 4, of het woord ffffffff). */
export function isGehusseld(versie: number, sleutel: number): boolean {
  return versie >= 4 && sleutel >>> 0 !== 0xffffffff
}

/**
 * Mogen we dit bestand ontwarren? Sleutel 0 altijd, een andere sleutel alleen
 * als hij geregistreerd is -- zoals OMSI (0x56CAA6-0x56CABB en de lus daarna).
 */
export function magOntwarren(sleutel: number, geregistreerd: ReadonlySet<number>): boolean {
  const s = sleutel >>> 0
  return s === 0 || geregistreerd.has(s)
}

/*
 * Het mengbyte in x87-precisie, voor het zeldzame geval dat gewone doubles het
 * niet zeker weten. Een waarde als m·2^e met m een geheel getal (BigInt).
 */
interface Exact {
  m: bigint
  e: number
}

const hulp = new DataView(new ArrayBuffer(8))

function exact(x: number): Exact {
  const a = Math.abs(x)
  if (a === 0) return { m: 0n, e: 0 }
  hulp.setFloat64(0, a)
  const hoog = hulp.getUint32(0)
  const laag = hulp.getUint32(4)
  const macht = (hoog >>> 20) & 0x7ff
  let m = (BigInt(hoog & 0xfffff) << 32n) | BigInt(laag)
  if (macht === 0) return { m, e: -1074 }
  m |= 1n << 52n
  return { m, e: macht - 1075 }
}

function bitlengte(m: bigint): number {
  return m === 0n ? 0 : m.toString(2).length
}

/** Afronden op 64 bits mantisse, naar het dichtstbijzijnde even getal (x87, PC=64). */
function rond64(a: Exact): Exact {
  const bits = bitlengte(a.m)
  if (bits <= 64) return a
  const s = bits - 64
  let q = a.m >> BigInt(s)
  const rest = a.m & ((1n << BigInt(s)) - 1n)
  const half = 1n << BigInt(s - 1)
  if (rest > half || (rest === half && (q & 1n) === 1n)) q += 1n
  let e = a.e + s
  if (bitlengte(q) > 64) {
    q >>= 1n
    e += 1
  }
  return { m: q, e }
}

function maal(a: Exact, b: Exact): Exact {
  return rond64({ m: a.m * b.m, e: a.e + b.e })
}

function naarBeneden(a: Exact): bigint {
  return a.e >= 0 ? a.m << BigInt(a.e) : a.m >> BigInt(-a.e)
}

const ZESHONDERD = exact(600)

/**
 * Het mengbyte uit de nog gehusselde positie: trunc(|frac x · frac y · frac z| · 600) mod 256.
 *
 * In doubles, en alleen als de uitkomst binnen 1e-9 van een geheel getal ligt in
 * x87-precisie nagerekend. Over 8,4 miljoen hoekpunten scheelde dat nooit iets
 * (206 gevallen lagen zo dicht bij een geheel getal), maar het kost niets.
 */
function mengbyte(x: number, y: number, z: number): number {
  const fx = x - Math.trunc(x)
  const fy = y - Math.trunc(y)
  const fz = z - Math.trunc(z)
  const w = Math.abs(fy * fx * fz) * 600
  const dichtbij = Math.abs(w - Math.round(w)) < 1e-9 * Math.max(1, w)
  if (!dichtbij) return Math.trunc(w) % 256
  // x87: frac(y)·frac(x) is exact; daarna afronden op 64 bits bij ·frac(z) en ·600.
  const t = maal(maal(exact(fz), maal(exact(fy), exact(fx))), ZESHONDERD)
  return Number(naarBeneden(t) % 256n)
}

/**
 * Zet gehusselde hoekpunten ter plekke terug: 8 floats per hoekpunt (positie,
 * normaal, uv), in bestandsvolgorde en over het HELE blok -- de toestand loopt
 * van hoekpunt naar hoekpunt door. Doet niets bij een open bestand.
 *
 * Alleen aanroepen na `magOntwarren`; deze functie weet niets van registratie.
 */
export function ontwar(blok: Float32Array, kop: HusselKop): void {
  ontwarStuk(blok, kop, undefined, Number.POSITIVE_INFINITY)
}

/** Waar `ontwarStuk` gebleven is. */
export interface OntwarStand {
  /** Het eerste hoekpunt dat nog moet. */
  i: number
  toestand: number
  meng: number
}

/**
 * Hetzelfde in stukken, voor de renderer-werker: na elk stuk van hooguit
 * `perStuk` hoekpunten kan de aanroeper even iets anders doen (een beeld
 * tekenen), en daarna met de teruggegeven stand verder. `undefined` = klaar.
 */
export function ontwarStuk(
  blok: Float32Array,
  kop: HusselKop,
  stand: OntwarStand | undefined,
  perStuk: number
): OntwarStand | undefined {
  if (!isGehusseld(kop.versie, kop.sleutel)) return undefined
  const sleutel = kop.sleutel >>> 0
  const zijspoor = (kop.vlag & 2) !== 0
  const n = Math.min(kop.n, Math.floor(blok.length / 8))
  const m = kop.n % 0xfde8
  const begin = stand?.i ?? 0
  const eind = Math.min(n, begin + Math.max(1, perStuk))
  let toestand = stand ? stand.toestand : (sleutel + (kop.versie - 4) + (zijspoor ? 0x17d : 0)) % 0xfde8
  let meng = stand ? stand.meng : 0
  for (let i = begin; i < eind; i++) {
    if (sleutel === 0) toestand = zijspoor ? 0x130 : 0
    toestand = (toestand * m + m * meng) % 8000
    // Het mengbyte komt uit de nog gehusselde positie en telt pas bij het volgende hoekpunt.
    meng = zetTerug(blok, i * 8, toestand)
  }
  return eind >= n ? undefined : { i: eind, toestand, meng }
}

/** Eén hoekpunt terugzetten met toestand `s`; geeft het mengbyte voor het volgende. */
function zetTerug(blok: Float32Array, o: number, s: number): number {
  const x = blok[o]
  const y = blok[o + 1]
  const z = blok[o + 2]
  const meng = mengbyte(x, y, z)
  if (s < 1000) {
    blok[o] = y
    blok[o + 1] = x
  } else if (s < 3000) {
    blok[o] = z
    blok[o + 2] = x
  } else if (s > 7000) {
    blok[o + 1] = z
    blok[o + 2] = y
  }
  let nx = blok[o + 3]
  let ny = blok[o + 4]
  let nz = blok[o + 5]
  if (s % 4 === 0) nx = -nx
  if (s % 6 === 0) ny = -ny
  if (s % 7 === 0) nz = -nz
  let t: number
  if (s < 600) {
    t = ny
    ny = nz
    nz = t
  } else if (s > 4500) {
    t = nx
    nx = ny
    ny = t
  }
  blok[o + 3] = nx
  blok[o + 4] = ny
  blok[o + 5] = nz
  if (s % 5 === 0) {
    const a = s % 100
    blok[o + 6] = Math.fround(blok[o + 6] - Math.fround((a * a) / 10000))
  }
  if (s % 3 === 0) {
    const a = s % 50
    blok[o + 7] = Math.fround(blok[o + 7] - Math.fround((a * a) / 2500))
  }
  return meng
}
