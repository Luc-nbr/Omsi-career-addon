/**
 * EEN EIGEN BEELD INLEZEN (lakstudio-ontwerp §1 "Afbeeldingen en vormen", §4.6)
 *
 * PNG, JPG, WebP of SVG, gesleept of gekozen; hooguit 20 MB en 4096 px aan de
 * lange zijde (groter wordt verkleind). PNG, JPG en WebP via
 * `createImageBitmap` zonder voorvermenigvuldiging; een SVG via `<img>` (in
 * beeldmodus draait er geen script en haalt hij niets van buiten, en de CSP van
 * het venster staat alleen blob: en data: toe) en dan op een doek.
 *
 * "Wit wordt doorzichtig" staat vanzelf aan als het beeld nergens doorzichtig
 * is en minstens 90% van de randpixels bijna wit is: een logo op een witte
 * achtergrond.
 */

export const BEELD_MAX_BYTES = 20 * 1024 * 1024
export const BEELD_MAX_PX = 4096

export type BeeldFout = 'soort' | 'groot' | 'stuk'

export interface IngelezenBeeld {
  bytes: Uint8Array
  bitmap: ImageBitmap
  b: number
  h: number
  /** Stelt de app "Wit wordt doorzichtig" vanzelf in? */
  witDoorzichtig: boolean
}

function soortVan(bytes: Uint8Array, naam: string): 'png' | 'jpg' | 'webp' | 'svg' | undefined {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'png'
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpg'
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57) return 'webp'
  if (/^\s*(<\?xml|<svg)/i.test(new TextDecoder().decode(bytes.subarray(0, 256))) || /\.svg$/i.test(naam)) return 'svg'
  return undefined
}

async function svgNaarBitmap(bytes: Uint8Array): Promise<ImageBitmap> {
  const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    img.decoding = 'async'
    await new Promise<void>((klaar, fout) => {
      img.onload = () => klaar()
      img.onerror = () => fout(new Error('svg'))
      img.src = url
    })
    // Een SVG zonder maat krijgt 1024 breed; een grote wordt verkleind tot 4096 aan de lange zijde.
    // Vector: tekenen op 1024 tot 4096 aan de lange zijde (een klein pictogram wordt zo niet wazig).
    let b = img.naturalWidth || 1024
    let h = img.naturalHeight || Math.round(b * 0.5)
    const lang = Math.max(b, h)
    const schaal = Math.min(BEELD_MAX_PX, Math.max(1024, lang)) / lang
    b = Math.max(1, Math.round(b * schaal))
    h = Math.max(1, Math.round(h * schaal))
    const doek = new OffscreenCanvas(b, h)
    doek.getContext('2d')!.drawImage(img, 0, 0, b, h)
    return doek.transferToImageBitmap()
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Zit er ergens doorzichtigheid in, en is de rand bijna wit? */
function meetWit(bitmap: ImageBitmap): boolean {
  const b = Math.min(256, bitmap.width)
  const h = Math.max(1, Math.round((bitmap.height * b) / bitmap.width))
  const doek = new OffscreenCanvas(b, h)
  const ctx = doek.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bitmap, 0, 0, b, h)
  const px = ctx.getImageData(0, 0, b, h).data
  for (let i = 3; i < px.length; i += 4) if (px[i] < 250) return false
  let rand = 0
  let wit = 0
  const telt = (x: number, y: number): void => {
    const o = (y * b + x) * 4
    rand++
    if (Math.min(px[o], px[o + 1], px[o + 2]) > 235) wit++
  }
  for (let x = 0; x < b; x++) {
    telt(x, 0)
    telt(x, h - 1)
  }
  for (let y = 1; y < h - 1; y++) {
    telt(0, y)
    telt(b - 1, y)
  }
  return rand > 0 && wit / rand >= 0.9
}

/** Een bestand inlezen; de bytes gaan daarna één keer naar main (`lak:beeld`). */
export async function leesBeeld(bestand: Blob & { name?: string }): Promise<IngelezenBeeld | { fout: BeeldFout }> {
  if (bestand.size > BEELD_MAX_BYTES) return { fout: 'groot' }
  const bytes = new Uint8Array(await bestand.arrayBuffer())
  const soort = soortVan(bytes, bestand.name ?? '')
  if (!soort) return { fout: 'soort' }
  try {
    let bitmap = soort === 'svg' ? await svgNaarBitmap(bytes) : await beeldVanBytes(bytes, soort)
    if (Math.max(bitmap.width, bitmap.height) > BEELD_MAX_PX) {
      const f = BEELD_MAX_PX / Math.max(bitmap.width, bitmap.height)
      const klein = await createImageBitmap(bitmap, {
        resizeWidth: Math.round(bitmap.width * f),
        resizeHeight: Math.round(bitmap.height * f),
        resizeQuality: 'high',
        premultiplyAlpha: 'none'
      })
      bitmap.close()
      bitmap = klein
    }
    return { bytes, bitmap, b: bitmap.width, h: bitmap.height, witDoorzichtig: meetWit(bitmap) }
  } catch {
    return { fout: 'stuk' }
  }
}

/** Bytes die main bewaarde (`lak:beeldBytes`) weer als beeld, bij het openen van een project. */
export async function beeldVanBytes(bytes: Uint8Array, soort?: string): Promise<ImageBitmap> {
  const s = soort ?? soortVan(bytes, '')
  if (s === 'svg') return svgNaarBitmap(bytes)
  const mime = s === 'png' ? 'image/png' : s === 'webp' ? 'image/webp' : 'image/jpeg'
  return createImageBitmap(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime }), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })
}
