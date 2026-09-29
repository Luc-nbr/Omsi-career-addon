import type { Bus3dPakKop } from './bus3d'

/**
 * HET PAKKETFORMAAT `.b3d` (bus3d-ontwerp §11.2)
 *
 *   'B3D1'  u32 koplengte  JSON-kop (UTF-8)  opvulling tot 4  binaire staart
 *
 * Alle offsets in de kop tellen vanaf het begin van de binaire staart, en elk
 * blok daarin begint op een veelvoud van 4, zodat de renderer-werker er een
 * `Float32Array` of `Uint16Array` overheen kan leggen zonder te kopiëren.
 *
 * Wat erin staat is geometrie zoals in de bronbestanden: het hoekpuntblok van
 * elke o3d byte voor byte, ook een gehusseld blok (dan met zijn kop in
 * `stukken[i].hussel`). Ontwarde hoekpunten komen hier nooit in (Lucs regel,
 * §5.1); `core/bus3d.ts` schrijft, en de probe controleert het.
 *
 * Geen `node:` en geen `Buffer`: de renderer-werker leest hiermee ook.
 */

const MAGIE = [0x42, 0x33, 0x44, 0x31] // 'B3D1'

const rond4 = (n: number): number => (n + 3) & ~3

/** Een binaire staart opbouwen: blokken toevoegen en hun plek terugkrijgen. */
export class PakStaart {
  private delen: Uint8Array[] = []
  private lengte = 0

  /** Voegt een blok toe (op 4 uitgelijnd) en geeft de plek in de staart. */
  voegToe(bytes: Uint8Array): { off: number; len: number } {
    const off = this.lengte
    this.delen.push(bytes)
    this.lengte += bytes.byteLength
    const vul = rond4(this.lengte) - this.lengte
    if (vul) {
      this.delen.push(new Uint8Array(vul))
      this.lengte += vul
    }
    return { off, len: bytes.byteLength }
  }

  get grootte(): number {
    return this.lengte
  }

  blokken(): Uint8Array[] {
    return this.delen
  }
}

/** De delen van een `.b3d`, in volgorde; samen het bestand (om zonder kopie weg te schrijven). */
export function schrijfPakket(kop: Bus3dPakKop, staart: PakStaart): Uint8Array[] {
  const json = new TextEncoder().encode(JSON.stringify(kop))
  const kopLengte = rond4(json.byteLength)
  const begin = new Uint8Array(8 + kopLengte)
  begin.set(MAGIE, 0)
  new DataView(begin.buffer).setUint32(4, kopLengte, true)
  begin.set(json, 8)
  // De opvulling na de JSON: spaties, zodat JSON.parse over de hele kop kan.
  for (let i = 8 + json.byteLength; i < begin.byteLength; i++) begin[i] = 0x20
  return [begin, ...staart.blokken()]
}

export interface GelezenPakket {
  kop: Bus3dPakKop
  /** De binaire staart, zonder kopie. */
  staart: Uint8Array
}

/** Leest een `.b3d`; gooit bij iets wat geen pakket is. */
export function leesPakket(bytes: Uint8Array): GelezenPakket {
  if (bytes.byteLength < 8 || MAGIE.some((b, i) => bytes[i] !== b)) throw new Error('geen B3D1-pakket')
  const kopLengte = new DataView(bytes.buffer, bytes.byteOffset, 8).getUint32(4, true)
  if (8 + kopLengte > bytes.byteLength) throw new Error('pakket afgekapt')
  const kop = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + kopLengte))) as Bus3dPakKop
  if (kop.versie !== 1) throw new Error(`pakketversie ${String(kop.versie)}`)
  return { kop, staart: bytes.subarray(8 + kopLengte) }
}

/** Het hoekpuntblok van een stuk als floats (8 per hoekpunt), zonder kopie als de uitlijning het toelaat. */
export function hoekpuntenVan(pak: GelezenPakket, stuk: number): Float32Array {
  const s = pak.kop.stukken[stuk]
  const bytes = pak.staart.subarray(s.hoekpunten.off, s.hoekpunten.off + s.hoekpunten.len)
  if ((bytes.byteOffset & 3) === 0) return new Float32Array(bytes.buffer, bytes.byteOffset, s.hoekpunten.len >> 2)
  return new Float32Array(bytes.slice().buffer)
}

/** De indices van een stuk. */
export function indicesVan(pak: GelezenPakket, stuk: number): Uint16Array | Uint32Array {
  const s = pak.kop.stukken[stuk]
  const bytes = pak.staart.subarray(s.indices.off, s.indices.off + s.indices.len)
  const uitgelijnd = (bytes.byteOffset & 3) === 0
  const bron = uitgelijnd ? bytes : bytes.slice()
  return s.indices.breed === 2
    ? new Uint16Array(bron.buffer, bron.byteOffset, s.indices.len >> 1)
    : new Uint32Array(bron.buffer, bron.byteOffset, s.indices.len >> 2)
}
