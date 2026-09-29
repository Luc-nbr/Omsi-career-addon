import { ontleedTextuur, pakBmpUit, type Textuur } from '../../../shared/beeldlezers'

/**
 * DE ONTLEDER: TEXTUREN DIE DE BROWSER NIET ZELF KAN LEZEN (bus3d-ontwerp §5.7)
 *
 * TGA, BMP van 16 of 32 bits of met bitmaskers, een DDS die geen DXT is, en DXT
 * die de GPU niet rechtstreeks aanneemt (een zijde niet deelbaar door 4, of
 * geen S3TC op deze pc): die pakken onze eigen lezers uit (shared/beeldlezers.ts,
 * dezelfde code als in node). Dat gebeurt hier, in een werker van de
 * renderer-werker, zodat een textuur van 2048x2048 (25 ms) het tekenen tijdens
 * het laden niet laat haperen (§16: "een tweede werker als ontleder").
 *
 * Verkleinen doet de GPU (mipmaps); hier alleen uitpakken, zonder premultiplicatie:
 * bij OMSI is de alfa van een carrosserietextuur het spiegelmasker, en een
 * voorvermenigvuldigde kleur zou de lak onder een laag masker zwart maken.
 */

interface Vraag {
  id: number
  bytes: ArrayBuffer
}

const doel = self as unknown as {
  onmessage: ((e: MessageEvent<Vraag>) => void) | null
  postMessage(bericht: unknown, overdracht?: Transferable[]): void
}

doel.onmessage = (e) => {
  const { id, bytes } = e.data
  try {
    const b = new Uint8Array(bytes)
    let t: Textuur | undefined
    let klacht = ''
    // Een BMP (van 16 of 32 bits, of met maskers) kent alleen pakBmpUit; de rest ontleedTextuur.
    if (b[0] === 0x42 && b[1] === 0x4d) {
      t = pakBmpUit(b)
      if (!t) klacht = 'BMP niet te lezen'
    } else {
      const lezing = ontleedTextuur(b)
      t = lezing.textuur
      if (!t) klacht = `${lezing.klacht ?? 'onleesbaar'}: ${lezing.detail ?? ''}`
    }
    if (!t) {
      doel.postMessage({ id, fout: klacht })
      return
    }
    // Een eigen buffer, precies zo groot als de pixels, om hem zonder kopie terug te geven.
    const pixels =
      t.pixels.byteOffset === 0 && t.pixels.byteLength === t.pixels.buffer.byteLength ? t.pixels : t.pixels.slice()
    doel.postMessage({ id, b: t.breedte, h: t.hoogte, pixels: pixels.buffer }, [pixels.buffer])
  } catch (fout) {
    doel.postMessage({ id, fout: fout instanceof Error ? fout.message : String(fout) })
  }
}
