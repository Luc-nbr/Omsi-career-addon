/**
 * DE BEELDLEZERS: DDS, TGA EN BMP UITGEPAKT TOT RGBA, ZONDER NODE
 *
 * Verhuisd uit core/textuur.ts (bus3d-ontwerp §11.2), zodat dezelfde code in
 * node (de werkers, de busfoto, de schermtexturen) en in de renderer-werker van
 * het 3D-venster draait: daar is geen `Buffer` en geen `node:fs`. Alles werkt op
 * een `Uint8Array`. De uitleg over wat er op schijf staat en hoe het nagemeten
 * is, staat bovenaan core/textuur.ts; die roept deze lezers aan.
 *
 * Hier gooit niets: wat niet lukt komt terug als klacht of `undefined`.
 */

/** Getallen uit de bytes, met de kleinste byte voorop (zoals Buffer.readUInt16LE en co). */
function u16(b: Uint8Array, o: number): number {
  return b[o] | (b[o + 1] << 8)
}
function u32(b: Uint8Array, o: number): number {
  return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0
}
function i32(b: Uint8Array, o: number): number {
  return b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)
}
function latin1(b: Uint8Array, van: number, tot: number): string {
  let s = ''
  for (let i = van; i < Math.min(tot, b.length); i++) s += String.fromCharCode(b[i])
  return s
}

/** Een uitgepakte textuur: RGBA, vier bytes per pixel, van boven naar beneden. */
export interface Textuur {
  breedte: number
  hoogte: number
  /** `breedte * hoogte * 4` bytes, in de volgorde r, g, b, a. */
  pixels: Uint8Array
}

/** Het soort bestand, herkend aan de eerste bytes en niet aan de naam. */
export type TextuurSoort = 'dds' | 'tga' | 'bmp' | 'png' | 'jpg'

/** Waarom er geen pixels uitkwamen. */
export type TextuurKlacht =
  /** Niet te openen: weg, vergrendeld, geen rechten. */
  | 'onleesbaar'
  /** Nul bytes lang, of te kort voor een kop. */
  | 'leeg'
  /**
   * Een formaat dat de browser zelf aankan (`.bmp`, `.png`, `.jpg`). Met opzet
   * niet uitgepakt: die bytes gaan ongewijzigd naar Chromium.
   */
  | 'chromium-kan-dit'
  /** De eerste bytes horen bij geen enkel formaat dat we kennen. */
  | 'onbekend-formaat'
  /** Het formaat is herkend, maar deze variant pakken we niet uit. */
  | 'niet-ondersteund'
  /** De kop belooft meer bytes dan het bestand heeft. */
  | 'afgekapt'
  /** Nul pixels breed, of zo groot dat het geheugen kost dat er niet is. */
  | 'onzinnige-maat'

/**
 * Het antwoord van de lezer.
 *
 * `soort` en `vorm` zijn ook gevuld als het misging -- dat is precies wat je
 * wilt weten bij een bestand dat niet uitkomt, en `vorm` is de tekst die de
 * probe optelt.
 */
export interface TextuurLezing {
  textuur?: Textuur
  soort?: TextuurSoort
  /** Wat er precies in stond: `DXT1`, `BGRA32`, `TGA-RLE-32` ... */
  vorm?: string
  klacht?: TextuurKlacht
  /** Waar het misging, voor in een logregel. */
  detail?: string
}

/**
 * De grootste zijde die we accepteren.
 *
 * Een verminkte kop levert zo een klacht op in plaats van een poging om vier
 * gigabyte te reserveren. 16.384 is ruim: de grootste textuur hier is 8192 en
 * dat is al 32 MB op schijf.
 */
const MAX_ZIJDE = 16384

/**
 * En een grens op het aantal pixels samen: 8192 x 8192. Een kop die 16.384 bij
 * 16.384 beweert komt op een gigabyte RGBA uit; dat is geen textuur meer maar
 * een leesfout.
 */
const MAX_PIXELS = 8192 * 8192

/**
 * Ontleedt bytes die al in het geheugen staan.
 *
 * Staat er apart naast om dezelfde reden als `ontleedO3d`: het lezen van schijf
 * en het uitpakken gebeuren niet altijd op dezelfde plek, en een probe wil
 * dezelfde bytes twee keer uitpakken zonder de leeskop er twee keer bij te
 * halen.
 */
export function ontleedTextuur(bytes: Uint8Array): TextuurLezing {
  const buf = bytes

  if (buf.length === 0) return { klacht: 'leeg', detail: 'nul bytes' }
  if (buf.length < 18) return { klacht: 'leeg', detail: `${buf.length} bytes, te kort voor een kop` }

  if (buf[0] === 0x44 && buf[1] === 0x44 && buf[2] === 0x53 && buf[3] === 0x20) return ontleedDds(buf)
  if (buf[0] === 0x42 && buf[1] === 0x4d) {
    return { soort: 'bmp', vorm: 'BMP', klacht: 'chromium-kan-dit', detail: 'bitmap' }
  }
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { soort: 'png', vorm: 'PNG', klacht: 'chromium-kan-dit', detail: 'png' }
  }
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { soort: 'jpg', vorm: 'JPEG', klacht: 'chromium-kan-dit', detail: 'jpeg' }
  }

  /*
   * Wat overblijft proberen we als TGA. Dat moet wel, want een TGA heeft geen
   * herkenningsbytes vooraan: de kop begint meteen met de velden. Sinds versie
   * 2 staat er wel een staart (`TRUEVISION-XFILE`), maar lang niet elk bestand
   * draagt die, dus daar valt niet op te bouwen. De veldcontrole in
   * `ontleedTga` doet het werk: een bestand dat geen TGA is, valt daar om.
   */
  return ontleedTga(buf)
}

// ---------------------------------------------------------------------- DDS

/** De vlaggen uit het `DDS_PIXELFORMAT`-blok die hier voorkomen. */
const PF_ALPHAPIXELS = 0x1
const PF_ALPHA = 0x2
const PF_FOURCC = 0x4
const PF_RGB = 0x40
const PF_LUMINANCE = 0x20000

function ontleedDds(buf: Uint8Array): TextuurLezing {
  if (buf.length < 128) return { soort: 'dds', klacht: 'leeg', detail: `${buf.length} bytes` }

  const hoogte = u32(buf, 12)
  const breedte = u32(buf, 16)
  const pfVlaggen = u32(buf, 80)
  const fourcc = latin1(buf, 84, 88)
  const bits = u32(buf, 88)
  const maskR = u32(buf, 92)
  const maskG = u32(buf, 96)
  const maskB = u32(buf, 100)
  const maskA = u32(buf, 104)

  const maat = keurMaat(breedte, hoogte)
  if (maat) return { soort: 'dds', klacht: maat[0], detail: maat[1] }

  if (pfVlaggen & PF_FOURCC) {
    /*
     * Alles wat hier niet met naam genoemd wordt -- `DXT2`, `DXT4`, `ATI2`, en
     * `DX10`, dat een tweede kop van twintig bytes achter de eerste zet --
     * komt er als "niet-ondersteund" uit, mét de vier letters erbij. Er staat
     * geen enkel zo'n bestand in deze installatie; het gaat erom dat er geen
     * DXT1-uitpakker overheen gaat als iemand er ooit een meelevert.
     */
    if (fourcc === 'DXT1') return pakDxt(buf, 128, breedte, hoogte, 1)
    if (fourcc === 'DXT3') return pakDxt(buf, 128, breedte, hoogte, 3)
    if (fourcc === 'DXT5') return pakDxt(buf, 128, breedte, hoogte, 5)
    const naam = fourcc.replace(/[^\x20-\x7e]/g, '.')
    return { soort: 'dds', vorm: naam, klacht: 'niet-ondersteund', detail: `fourcc "${naam}"` }
  }

  if (pfVlaggen & (PF_RGB | PF_ALPHA | PF_LUMINANCE)) {
    /*
     * Een ongecomprimeerde DDS mag achter elke rij opvulling zetten; hoeveel
     * staat in `pitch`, en dat veld telt alleen als vlag 0x8 aan staat. Geen
     * van de 6686 ongecomprimeerde DDS'en van deze installatie doet dat (pitch
     * is overal precies breedte maal bytes), maar het kost drie regels om er
     * niet op te hoeven vertrouwen.
     */
    const vlaggen = u32(buf, 8)
    const pitch = vlaggen & 0x8 ? u32(buf, 20) : 0
    return pakDdsKanalen(buf, 128, breedte, hoogte, bits, maskR, maskG, maskB, maskA, pfVlaggen, pitch)
  }

  return {
    soort: 'dds',
    klacht: 'niet-ondersteund',
    detail: `pixelformaatvlaggen 0x${pfVlaggen.toString(16)}`
  }
}

/**
 * Van vijf en zes bits naar acht, afgerond.
 *
 * De voor de hand liggende weg is de hoogste bits onderaan herhalen
 * (`(v << 3) | (v >> 2)`), en dat is ook wat veel uitpakkers doen. Alleen kapt
 * die weg af waar afronden hoort. Naast de DDS-lezer van Windows gelegd zakte
 * het aantal afgetaste pixels dat er één stap naast lag op `18C_main.dds` van
 * 24 op 1024 naar 4; op `A20_ext.dds` van 65 naar 16. Een tabel van 32 en één
 * van 64 bytes kost niets en wordt per blok twee keer geraadpleegd.
 */
const VIJF = new Uint8Array(32)
const ZES = new Uint8Array(64)
for (let i = 0; i < 32; i++) VIJF[i] = Math.round((i * 255) / 31)
for (let i = 0; i < 64; i++) ZES[i] = Math.round((i * 255) / 63)

/**
 * De drie DXT-vormen, in één lus.
 *
 * Ze verschillen alleen in wat er vóór het kleurblok staat: DXT1 niets, DXT3
 * acht bytes met vier bits alfa per pixel, DXT5 twee ijkwaarden plus drie bits
 * per pixel. Het kleurblok is bij alle drie hetzelfde: twee kleuren in 565 en
 * zestien keer twee bits.
 *
 * Eén verschil dat je zo over het hoofd ziet: alleen bij DXT1 betekent
 * `c0 <= c1` iets -- dan zijn er drie kleuren en is de vierde doorzichtig. Bij
 * DXT3 en DXT5 staat de alfa al ergens anders en zijn het altijd vier kleuren.
 * Die vergissing kost je zwarte vlekken in elke ruit.
 */
function pakDxt(
  buf: Uint8Array,
  begin: number,
  breedte: number,
  hoogte: number,
  soort: 1 | 3 | 5
): TextuurLezing {
  const stap = soort === 1 ? 8 : 16
  const blokkenX = Math.ceil(breedte / 4)
  const blokkenY = Math.ceil(hoogte / 4)
  const nodig = blokkenX * blokkenY * stap
  const vorm = `DXT${soort}`
  if (begin + nodig > buf.length) {
    return {
      soort: 'dds',
      vorm,
      klacht: 'afgekapt',
      detail: `${nodig} bytes nodig, ${buf.length - begin} over`
    }
  }

  const pixels = new Uint8Array(breedte * hoogte * 4)
  /*
   * De vier kleuren en de acht alfawaarden van het huidige blok, hergebruikt.
   * Een 8192 x 4096-textuur is twee miljoen blokken; wie daar per blok een
   * array voor maakt, laat de vuilnisman het werk doen.
   */
  const r = new Uint8Array(4)
  const g = new Uint8Array(4)
  const b = new Uint8Array(4)
  const a = new Uint8Array(4)
  const alfa = new Uint8Array(8)

  for (let by = 0; by < blokkenY; by++) {
    for (let bx = 0; bx < blokkenX; bx++) {
      const p = begin + (by * blokkenX + bx) * stap

      if (soort === 5) {
        const a0 = buf[p]
        const a1 = buf[p + 1]
        alfa[0] = a0
        alfa[1] = a1
        if (a0 > a1) {
          for (let i = 1; i < 7; i++) alfa[i + 1] = Math.round(((7 - i) * a0 + i * a1) / 7)
        } else {
          for (let i = 1; i < 5; i++) alfa[i + 1] = Math.round(((5 - i) * a0 + i * a1) / 5)
          alfa[6] = 0
          alfa[7] = 255
        }
      }

      const kleurBegin = soort === 1 ? p : p + 8
      const c0 = u16(buf, kleurBegin)
      const c1 = u16(buf, kleurBegin + 2)
      r[0] = VIJF[(c0 >> 11) & 31]
      g[0] = ZES[(c0 >> 5) & 63]
      b[0] = VIJF[c0 & 31]
      r[1] = VIJF[(c1 >> 11) & 31]
      g[1] = ZES[(c1 >> 5) & 63]
      b[1] = VIJF[c1 & 31]
      a[0] = 255
      a[1] = 255
      if (soort !== 1 || c0 > c1) {
        /*
         * De twee tussenkleuren, op een derde en op twee derde. De `+ 1` is
         * afronden in plaats van afkappen -- een toekenning aan een
         * `Uint8Array` kapt af. Het scheelde op `18C_main.dds` negen van de
         * 1024 afgetaste pixels ten opzichte van de lezer van Windows.
         */
        r[2] = (2 * r[0] + r[1] + 1) / 3
        g[2] = (2 * g[0] + g[1] + 1) / 3
        b[2] = (2 * b[0] + b[1] + 1) / 3
        r[3] = (r[0] + 2 * r[1] + 1) / 3
        g[3] = (g[0] + 2 * g[1] + 1) / 3
        b[3] = (b[0] + 2 * b[1] + 1) / 3
        a[2] = 255
        a[3] = 255
      } else {
        r[2] = (r[0] + r[1] + 1) / 2
        g[2] = (g[0] + g[1] + 1) / 2
        b[2] = (b[0] + b[1] + 1) / 2
        r[3] = 0
        g[3] = 0
        b[3] = 0
        a[2] = 255
        a[3] = 0
      }

      const index = u32(buf, kleurBegin + 4)
      const tot = Math.min(4, hoogte - by * 4)
      const totX = Math.min(4, breedte - bx * 4)
      for (let ry = 0; ry < tot; ry++) {
        const y = by * 4 + ry
        for (let rx = 0; rx < totX; rx++) {
          const nummer = ry * 4 + rx
          const k = (index >>> (2 * nummer)) & 3
          const uit = (y * breedte + bx * 4 + rx) * 4
          pixels[uit] = r[k]
          pixels[uit + 1] = g[k]
          pixels[uit + 2] = b[k]
          if (soort === 1) {
            pixels[uit + 3] = a[k]
          } else if (soort === 3) {
            // Vier bits per pixel, twee pixels per byte, het lage nibble eerst.
            const byte = buf[p + (nummer >> 1)]
            pixels[uit + 3] = (nummer & 1 ? byte >> 4 : byte & 15) * 17
          } else {
            /*
             * Drie bits per pixel in zes bytes: één reeks van 48 bits met de
             * laagste byte voorop. In twee helften van 24 bits lezen houdt het
             * binnen wat een gewoon getal exact aankan, en geen enkele waarde
             * ligt over de naad heen -- pixel 8 begint precies op bit 24.
             */
            const bit = nummer * 3
            const waar = bit < 24 ? p + 2 : p + 5
            const schuif = bit < 24 ? bit : bit - 24
            const drie = (buf[waar] | (buf[waar + 1] << 8) | (buf[waar + 2] << 16)) >>> schuif
            pixels[uit + 3] = alfa[drie & 7]
          }
        }
      }
    }
  }

  return { soort: 'dds', vorm, textuur: { breedte, hoogte, pixels } }
}

/**
 * De ongecomprimeerde DDS-vormen, via hun bitmaskers.
 *
 * Er wordt niet op een vast formaat gegokt maar op de maskers gelezen, en dat
 * is nodig: 109 bestanden hebben rood op `0x00ff0000` (in bytes dus b, g, r, a,
 * het gebruikelijke), maar twee -- `MAN_NewLionsCity\Texture\
 * nlc_int_driver_cabin.dds` en zijn buurman -- hebben rood op `0x000000ff` en
 * staan andersom in het geheugen. Op het oog merk je dat pas als het blauw van
 * een dashboard rood wordt.
 *
 * De veertien A8-bestanden hebben helemaal geen kleurmasker; dat is geen fout
 * maar het formaat (`D3DFMT_A8`, in de kaarten 6506 keer gebruikt als
 * overvloeimasker tussen twee terreintexturen). Die komen er zwart uit met een
 * alfakanaal, want dat is ook wat Direct3D bij het aftasten teruggeeft.
 */
function pakDdsKanalen(
  buf: Uint8Array,
  begin: number,
  breedte: number,
  hoogte: number,
  bits: number,
  maskR: number,
  maskG: number,
  maskB: number,
  maskA: number,
  pfVlaggen: number,
  pitch: number
): TextuurLezing {
  if (bits !== 8 && bits !== 16 && bits !== 24 && bits !== 32) {
    return { soort: 'dds', klacht: 'niet-ondersteund', detail: `${bits} bits per pixel` }
  }
  const bytesPerPixel = bits / 8
  const rij = Math.max(pitch, breedte * bytesPerPixel)
  const nodig = rij * hoogte
  const vorm = beschrijfKanalen(bits, maskR, maskG, maskB, maskA, pfVlaggen)
  if (begin + nodig > buf.length) {
    return {
      soort: 'dds',
      vorm,
      klacht: 'afgekapt',
      detail: `${nodig} bytes nodig, ${buf.length - begin} over`
    }
  }

  const kanaalR = kanaal(maskR)
  const kanaalG = kanaal(maskG)
  const kanaalB = kanaal(maskB)
  const heeftAlfa = maskA !== 0 && (pfVlaggen & (PF_ALPHAPIXELS | PF_ALPHA)) !== 0
  const kanaalA = heeftAlfa ? kanaal(maskA) : undefined
  /*
   * Grijswaarden: één masker voor alle drie de kanalen. Komt in deze
   * installatie niet voor, maar het onderscheid kost één regel en zonder die
   * regel wordt een grijstextuur felrood.
   */
  const grijs = (pfVlaggen & PF_LUMINANCE) !== 0

  const pixels = new Uint8Array(breedte * hoogte * 4)
  for (let y = 0; y < hoogte; y++) {
    for (let x = 0; x < breedte; x++) {
      const p = begin + y * rij + x * bytesPerPixel
      let rauw: number
      if (bytesPerPixel === 1) rauw = buf[p]
      else if (bytesPerPixel === 2) rauw = buf[p] | (buf[p + 1] << 8)
      else if (bytesPerPixel === 3) rauw = buf[p] | (buf[p + 1] << 8) | (buf[p + 2] << 16)
      else rauw = u32(buf, p)
      const uit = (y * breedte + x) * 4
      const rood = kanaalR ? kanaalR(rauw) : 0
      pixels[uit] = rood
      pixels[uit + 1] = grijs ? rood : kanaalG ? kanaalG(rauw) : 0
      pixels[uit + 2] = grijs ? rood : kanaalB ? kanaalB(rauw) : 0
      pixels[uit + 3] = kanaalA ? kanaalA(rauw) : 255
    }
  }

  return { soort: 'dds', vorm, textuur: { breedte, hoogte, pixels } }
}

/**
 * Van een bitmasker naar een functie die er een waarde van 0 tot 255 uit haalt.
 *
 * De schaling is `waarde * 255 / max` en niet een bitverschuiving, want bij vijf
 * bits levert verschuiven hoogstens 248 op en dan wordt wit vuilwit.
 */
function kanaal(masker: number): ((rauw: number) => number) | undefined {
  if (!masker) return undefined
  let schuif = 0
  let rest = masker >>> 0
  while ((rest & 1) === 0) {
    rest >>>= 1
    schuif++
  }
  const max = rest
  if (max === 255) return (rauw: number): number => (rauw >>> schuif) & 255
  return (rauw: number): number => Math.round((((rauw >>> schuif) & max) * 255) / max)
}

/** Een leesbare naam voor de vorm, voor in de telling van de probe. */
function beschrijfKanalen(
  bits: number,
  maskR: number,
  maskG: number,
  maskB: number,
  maskA: number,
  pfVlaggen: number
): string {
  if (pfVlaggen & PF_ALPHA && !maskR && !maskG && !maskB) return `A${bits}`
  if (pfVlaggen & PF_LUMINANCE) return maskA ? `LA${bits}` : `L${bits}`
  const volgorde = maskR > maskB ? 'BGR' : 'RGB'
  return `${volgorde}${maskA ? 'A' : 'X'}${bits}`
}

// ---------------------------------------------------------------------- TGA

function ontleedTga(buf: Uint8Array): TextuurLezing {
  const idLengte = buf[0]
  const kleurkaartSoort = buf[1]
  const soort = buf[2]
  const kaartEersteIndex = u16(buf, 3)
  const kaartLengte = u16(buf, 5)
  const kaartBits = buf[7]
  const breedte = u16(buf, 12)
  const hoogte = u16(buf, 14)
  const bits = buf[16]
  const beschrijver = buf[17]

  const bekend = soort === 1 || soort === 2 || soort === 3 || soort === 9 || soort === 10 || soort === 11
  if (!bekend || kleurkaartSoort > 1) {
    /*
     * Hier vallen de bestanden om die helemaal geen TGA zijn en die ook niet aan
     * hun eerste bytes te herkennen waren. Het eerste veld van een TGA is geen
     * merkteken, dus dit ís de herkenning.
     */
    const kop = [...buf.subarray(0, 4)].map((x) => x.toString(16).padStart(2, '0')).join(' ')
    return { klacht: 'onbekend-formaat', detail: `begint met ${kop}` }
  }

  const maat = keurMaat(breedte, hoogte)
  if (maat) return { soort: 'tga', klacht: maat[0], detail: maat[1] }

  const metKleurkaart = soort === 1 || soort === 9
  const grijs = soort === 3 || soort === 11
  const gecomprimeerd = soort >= 9
  const wat = metKleurkaart ? 'kaart' : grijs ? 'grijs' : ''
  const vorm = `TGA${gecomprimeerd ? '-RLE' : ''}-${wat}${bits}`

  if (bits !== 8 && bits !== 16 && bits !== 24 && bits !== 32) {
    return { soort: 'tga', vorm, klacht: 'niet-ondersteund', detail: `${bits} bits per pixel` }
  }

  let p = 18 + idLengte
  /*
   * De kleurkaart staat tussen de kop en de pixels. Hij is er ook als het
   * bestand hem niet gebruikt, dus hij wordt altijd overgeslagen en alleen
   * ingelezen als de pixels er werkelijk naar wijzen.
   */
  let kaart: Uint8Array | undefined
  if (kleurkaartSoort === 1 && kaartLengte > 0) {
    const kaartBytes = Math.ceil(kaartBits / 8)
    if (p + kaartLengte * kaartBytes > buf.length) {
      return { soort: 'tga', vorm, klacht: 'afgekapt', detail: 'kleurkaart' }
    }
    if (metKleurkaart) {
      if (kaartBits !== 15 && kaartBits !== 16 && kaartBits !== 24 && kaartBits !== 32) {
        return {
          soort: 'tga',
          vorm,
          klacht: 'niet-ondersteund',
          detail: `kleurkaart van ${kaartBits} bits`
        }
      }
      kaart = new Uint8Array((kaartEersteIndex + kaartLengte) * 4)
      for (let i = 0; i < kaartLengte; i++) {
        zetKleur(kaart, (kaartEersteIndex + i) * 4, buf, p + i * kaartBytes, kaartBits)
      }
    }
    p += kaartLengte * kaartBytes
  }
  if (metKleurkaart && !kaart) {
    return { soort: 'tga', vorm, klacht: 'niet-ondersteund', detail: 'kleurkaart ontbreekt' }
  }

  const bytesPerPixel = bits / 8
  const n = breedte * hoogte
  const pixels = new Uint8Array(n * 4)

  /*
   * Eén pixel uit het bestand op plek `uit` in het beeld. De keuze staat buiten
   * de lus zodat er per pixel niet opnieuw op het soort getoetst wordt: de
   * zwaarste TGA hier is 4096 x 4096, en dat zijn zestien miljoen keuzes.
   */
  const tabel = kaart
  const schrijf = tabel
    ? (uit: number, bron: Uint8Array, q: number): void => {
        const index = bits === 8 ? bron[q] : bron[q] | (bron[q + 1] << 8)
        const k = index * 4
        if (k + 3 < tabel.length) {
          pixels[uit] = tabel[k]
          pixels[uit + 1] = tabel[k + 1]
          pixels[uit + 2] = tabel[k + 2]
          pixels[uit + 3] = tabel[k + 3]
        }
      }
    : grijs
      ? (uit: number, bron: Uint8Array, q: number): void => {
          pixels[uit] = bron[q]
          pixels[uit + 1] = bron[q]
          pixels[uit + 2] = bron[q]
          pixels[uit + 3] = 255
        }
      : bits === 32
        ? (uit: number, bron: Uint8Array, q: number): void => {
            pixels[uit] = bron[q + 2]
            pixels[uit + 1] = bron[q + 1]
            pixels[uit + 2] = bron[q]
            pixels[uit + 3] = bron[q + 3]
          }
        : bits === 24
          ? (uit: number, bron: Uint8Array, q: number): void => {
              pixels[uit] = bron[q + 2]
              pixels[uit + 1] = bron[q + 1]
              pixels[uit + 2] = bron[q]
              pixels[uit + 3] = 255
            }
          : (uit: number, bron: Uint8Array, q: number): void => zetKleur(pixels, uit, bron, q, bits)

  if (!gecomprimeerd) {
    if (p + n * bytesPerPixel > buf.length) {
      return {
        soort: 'tga',
        vorm,
        klacht: 'afgekapt',
        detail: `${n * bytesPerPixel} bytes nodig, ${buf.length - p} over`
      }
    }
    for (let i = 0; i < n; i++) schrijf(i * 4, buf, p + i * bytesPerPixel)
  } else {
    /*
     * RLE: een kopbyte, dan óf één pixel die zich herhaalt (hoogste bit aan) óf
     * een rijtje losse pixels. De telling staat er altijd één te laag in. De
     * norm zegt dat een pakket niet over het einde van een rij heen mag lopen,
     * maar er zijn schrijvers die dat toch doen, dus er wordt doorgeteld en pas
     * op het aantal pixels gestopt.
     */
    let i = 0
    while (i < n) {
      if (p >= buf.length) {
        return { soort: 'tga', vorm, klacht: 'afgekapt', detail: `${i} van ${n} pixels uitgepakt` }
      }
      const kop = buf[p]
      p++
      const aantal = (kop & 0x7f) + 1
      if (kop & 0x80) {
        if (p + bytesPerPixel > buf.length) {
          return { soort: 'tga', vorm, klacht: 'afgekapt', detail: `herhaling bij pixel ${i}` }
        }
        for (let k = 0; k < aantal && i < n; k++, i++) schrijf(i * 4, buf, p)
        p += bytesPerPixel
      } else {
        if (p + aantal * bytesPerPixel > buf.length) {
          return { soort: 'tga', vorm, klacht: 'afgekapt', detail: `rijtje bij pixel ${i}` }
        }
        for (let k = 0; k < aantal && i < n; k++, i++) schrijf(i * 4, buf, p + k * bytesPerPixel)
        p += aantal * bytesPerPixel
      }
    }
  }

  /*
   * En dan de volgorde. Een TGA bewaart zijn rijen van onder naar boven, tenzij
   * bit 5 van de beschrijver aan staat; bit 4 doet hetzelfde voor links en
   * rechts. Van de 3023 TGA's onder `Vehicles` staat bit 5 bij geen enkele aan
   * -- ze moeten dus állemaal omgekeerd worden, en wie dat vergeet ziet een bus
   * op zijn kop zonder dat er iets kapot lijkt. Omkeren gebeurt achteraf en per
   * rij, niet per pixel tijdens het uitpakken: dat scheelt een deling en een
   * aftrekking op elk van de zestien miljoen pixels van de zwaarste textuur.
   */
  if ((beschrijver & 0x20) === 0) keerRijenOm(pixels, breedte, hoogte)
  if ((beschrijver & 0x10) !== 0) keerKolommenOm(pixels, breedte, hoogte)

  return { soort: 'tga', vorm, textuur: { breedte, hoogte, pixels } }
}

/** Onderste rij naar boven: de gewone volgorde van een TGA. */
function keerRijenOm(pixels: Uint8Array, breedte: number, hoogte: number): void {
  const rij = breedte * 4
  const hulp = new Uint8Array(rij)
  for (let y = 0; y < hoogte >> 1; y++) {
    const boven = y * rij
    const onder = (hoogte - 1 - y) * rij
    hulp.set(pixels.subarray(boven, boven + rij))
    pixels.copyWithin(boven, onder, onder + rij)
    pixels.set(hulp, onder)
  }
}

/** Hetzelfde voor links en rechts; komt hier bij geen enkel bestand voor. */
function keerKolommenOm(pixels: Uint8Array, breedte: number, hoogte: number): void {
  for (let y = 0; y < hoogte; y++) {
    const rij = y * breedte * 4
    for (let x = 0; x < breedte >> 1; x++) {
      const links = rij + x * 4
      const rechts = rij + (breedte - 1 - x) * 4
      for (let k = 0; k < 4; k++) {
        const hulp = pixels[links + k]
        pixels[links + k] = pixels[rechts + k]
        pixels[rechts + k] = hulp
      }
    }
  }
}

/**
 * Eén pixel uit een TGA of uit een kleurkaart, naar RGBA.
 *
 * TGA bewaart kleur als blauw, groen, rood -- de volgorde van het geheugen van
 * een pc uit 1984 en nog steeds die van het formaat. Bij 32 bits wordt de
 * vierde byte altijd als alfa gelezen, ook als de beschrijverbyte nul
 * attribuutbits belooft: van de 1172 ongecomprimeerde 32-bits TGA's onder
 * `Vehicles` zeggen er 341 "geen alfa" terwijl hun vierde byte wel degelijk
 * varieert, en dat zijn juist de ruiten en de schaduwen. Zes bestanden hebben
 * alfa overal nul en zijn daarmee onzichtbaar; dat is dan zo, OMSI ziet
 * hetzelfde.
 */
function zetKleur(doel: Uint8Array, uit: number, bron: Uint8Array, q: number, bits: number): void {
  if (bits === 32) {
    doel[uit] = bron[q + 2]
    doel[uit + 1] = bron[q + 1]
    doel[uit + 2] = bron[q]
    doel[uit + 3] = bron[q + 3]
    return
  }
  if (bits === 24) {
    doel[uit] = bron[q + 2]
    doel[uit + 1] = bron[q + 1]
    doel[uit + 2] = bron[q]
    doel[uit + 3] = 255
    return
  }
  if (bits === 16 || bits === 15) {
    /*
     * Vijf bits per kanaal met één bit over. Die ene bit is in de norm de alfa,
     * maar in de praktijk laten schrijvers hem op nul staan bij een dekkend
     * beeld -- en dan zou alles onzichtbaar worden. Hij wordt hier dus niet
     * gebruikt; de dertien 16-bits bestanden in deze installatie komen dekkend
     * binnen.
     */
    const waarde = bron[q] | (bron[q + 1] << 8)
    doel[uit] = Math.round((((waarde >> 10) & 31) * 255) / 31)
    doel[uit + 1] = Math.round((((waarde >> 5) & 31) * 255) / 31)
    doel[uit + 2] = Math.round(((waarde & 31) * 255) / 31)
    doel[uit + 3] = 255
    return
  }
  // Acht bits in een kleurkaart: een grijswaarde.
  doel[uit] = bron[q]
  doel[uit + 1] = bron[q]
  doel[uit + 2] = bron[q]
  doel[uit + 3] = 255
}

// -------------------------------------------------------------------- samen

/** Is dit een maat waar we geheugen voor willen reserveren? */
function keurMaat(breedte: number, hoogte: number): [TextuurKlacht, string] | undefined {
  if (breedte <= 0 || hoogte <= 0) return ['onzinnige-maat', `${breedte} x ${hoogte}`]
  if (breedte > MAX_ZIJDE || hoogte > MAX_ZIJDE || breedte * hoogte > MAX_PIXELS) {
    return ['onzinnige-maat', `${breedte} x ${hoogte}`]
  }
  return undefined
}

// ---------------------------------------------------------------------- BMP

/*
 * Een BMP pakken we hierboven met opzet níet uit: Chromium leest hem zelf, en de
 * busfoto rekent op die klacht 'chromium-kan-dit'. Voor het scherm van een
 * apparaat moet het soms toch, en dat staat daarom hieronder los:
 *
 * - de BMP is een 32-bits beeld, en dan moet vaststaan wat er met de vierde
 *   byte gebeurt (zie `pakBmpUit`);
 * - het materiaal wil een transmap, een uitsnede of een verkleining, en daar
 *   zijn de pixels voor nodig.
 *
 * Wat er onder `Vehicles` staat (14.480 plaatjes, op de eerste bytes geteld,
 * ook de BMP's die `.dds` of `.tga` heten): kop van 40 bytes met 24 bits 2017
 * keer, 32 bits 745, 8 bits met palet 225, 4 bits 9; kop van 108 of 124 bytes
 * met 24 bits 10, met 32 bits en bitmaskers 5; en één 4-bits RLE. Alles staat
 * van onder naar boven. In `Fonts`: 556 x 24 bits, 4 x 32, 3 x 24 met een kop
 * van 108 en 1 x 8 bits.
 */

/** Compressievelden die we kennen: gewoon, met bitmaskers, en met alfamasker. */
const BI_RGB = 0
const BI_BITFIELDS = 3
const BI_ALPHABITFIELDS = 6

/**
 * Een BMP uitpakken tot RGBA; `undefined` voor wat we niet kennen (RLE, een
 * ingebedde JPEG of PNG, de oude OS/2-kop van twaalf bytes, een verminkte
 * kop). Dan gaan de bytes ongewijzigd naar de browser, die dat wel kan.
 *
 * DE VIERDE BYTE VAN EEN 32-BITS BMP
 * De norm zegt dat die bij `BI_RGB` niets betekent. In deze installatie is dat
 * anders: van de 745 32-bits BMP's onder `Vehicles` hebben er 721 een vierde
 * byte die per pixel verschilt, 24 hebben overal 255 en géén enkele overal 0.
 * De makers schrijven er dus een alfakanaal in. Bij `Opel_Manta_B` is dat
 * zichtbaar waarvoor: `manta_b.dds` (een BMP) heeft bij 86 % van de pixels een
 * alfa onder 32, en het materiaal zet er `[matl_envmap]` op en haalt de
 * doorzichtigheid uit een `[matl_transmap]` -- de alfa is daar het masker van
 * de weerspiegeling, en dat werkt alleen als OMSI hem inleest. Dus: de vierde
 * byte is alfa (ONZEKER: niet in het spel nagemeten wat D3DX ermee doet).
 * Staat hij overal op 0, dan heeft de schrijver de byte leeg gelaten en wordt
 * het beeld dekkend -- zo doet Chromium het ook. Of de alfa bij het tekenen
 * meetelt (`[matl_alpha]`), beslist niet dit bestand maar wie de textuur levert
 * (`core/schermtextuur.ts`); bij `[matl_alpha]` 0 wordt hij daar 255.
 */
export function pakBmpUit(bytes: Uint8Array): Textuur | undefined {
  const buf = bytes
  if (buf.length < 54 || buf[0] !== 0x42 || buf[1] !== 0x4d) return undefined

  const begin = u32(buf, 10)
  const kop = u32(buf, 14)
  if (kop < 40 || 14 + kop > buf.length) return undefined
  const breedte = i32(buf, 18)
  const hoogteRauw = i32(buf, 22)
  const bits = u16(buf, 28)
  const compressie = u32(buf, 30)
  const kleurenGebruikt = u32(buf, 46)

  // Een negatieve hoogte betekent: van boven naar beneden opgeslagen.
  const vanOnder = hoogteRauw > 0
  const hoogte = Math.abs(hoogteRauw)
  if (keurMaat(breedte, hoogte)) return undefined
  if (compressie !== BI_RGB && compressie !== BI_BITFIELDS && compressie !== BI_ALPHABITFIELDS) {
    return undefined
  }
  if (![1, 4, 8, 16, 24, 32].includes(bits)) return undefined
  if (compressie !== BI_RGB && bits !== 16 && bits !== 32) return undefined

  // Rijen zijn aangevuld tot een veelvoud van vier bytes.
  const rij = Math.ceil((breedte * bits) / 32) * 4
  /*
   * Van de laatste rij wordt alleen gevraagd wat er werkelijk aan pixels in
   * staat: er zijn schrijvers die de opvulling achter de laatste rij weglaten.
   */
  if (begin + rij * (hoogte - 1) + Math.ceil((breedte * bits) / 8) > buf.length) return undefined

  const pixels = new Uint8Array(breedte * hoogte * 4)

  if (bits <= 8) {
    // Het palet staat direct achter de kop: blauw, groen, rood en een lege byte.
    const aantal = kleurenGebruikt > 0 && kleurenGebruikt <= 1 << bits ? kleurenGebruikt : 1 << bits
    const palet = 14 + kop
    if (palet + aantal * 4 > begin) return undefined
    const masker = (1 << bits) - 1
    for (let y = 0; y < hoogte; y++) {
      const bron = begin + (vanOnder ? hoogte - 1 - y : y) * rij
      for (let x = 0; x < breedte; x++) {
        const bit = x * bits
        const index = (buf[bron + (bit >> 3)] >> (8 - bits - (bit & 7))) & masker
        const uit = (y * breedte + x) * 4
        if (index < aantal) {
          const p = palet + index * 4
          pixels[uit] = buf[p + 2]
          pixels[uit + 1] = buf[p + 1]
          pixels[uit + 2] = buf[p]
        }
        pixels[uit + 3] = 255
      }
    }
    return { breedte, hoogte, pixels }
  }

  if (bits === 24) {
    for (let y = 0; y < hoogte; y++) {
      const bron = begin + (vanOnder ? hoogte - 1 - y : y) * rij
      for (let x = 0; x < breedte; x++) {
        const p = bron + x * 3
        const uit = (y * breedte + x) * 4
        pixels[uit] = buf[p + 2]
        pixels[uit + 1] = buf[p + 1]
        pixels[uit + 2] = buf[p]
        pixels[uit + 3] = 255
      }
    }
    return { breedte, hoogte, pixels }
  }

  /*
   * 16 en 32 bits, via maskers. Zonder `BI_BITFIELDS` zijn dat de vaste: 5-5-5
   * bij 16 bits, en blauw, groen, rood, alfa bij 32. Met bitmaskers staan ze
   * direct achter de eerste veertig bytes van de kop -- bij een kop van 40
   * bytes erachter, bij een langere erin, maar op dezelfde plek (54). Het
   * alfamasker (66) telt alleen bij een kop van 56 bytes of meer, of bij
   * `BI_ALPHABITFIELDS`.
   */
  let maskR: number
  let maskG: number
  let maskB: number
  let maskA: number
  if (compressie === BI_RGB) {
    maskR = bits === 16 ? 0x7c00 : 0x00ff0000
    maskG = bits === 16 ? 0x03e0 : 0x0000ff00
    maskB = bits === 16 ? 0x001f : 0x000000ff
    maskA = bits === 16 ? 0 : 0xff000000
  } else {
    if (buf.length < 66) return undefined
    maskR = u32(buf, 54)
    maskG = u32(buf, 58)
    maskB = u32(buf, 62)
    const metAlfa = kop >= 56 || compressie === BI_ALPHABITFIELDS
    maskA = metAlfa && buf.length >= 70 ? u32(buf, 66) : 0
  }
  const kanaalR = kanaal(maskR)
  const kanaalG = kanaal(maskG)
  const kanaalB = kanaal(maskB)
  const kanaalA = kanaal(maskA)
  const bytesPerPixel = bits / 8
  let alfaOoitAan = false
  for (let y = 0; y < hoogte; y++) {
    const bron = begin + (vanOnder ? hoogte - 1 - y : y) * rij
    for (let x = 0; x < breedte; x++) {
      const p = bron + x * bytesPerPixel
      const rauw = bytesPerPixel === 2 ? buf[p] | (buf[p + 1] << 8) : u32(buf, p)
      const uit = (y * breedte + x) * 4
      pixels[uit] = kanaalR ? kanaalR(rauw) : 0
      pixels[uit + 1] = kanaalG ? kanaalG(rauw) : 0
      pixels[uit + 2] = kanaalB ? kanaalB(rauw) : 0
      const a = kanaalA ? kanaalA(rauw) : 255
      pixels[uit + 3] = a
      if (a !== 0) alfaOoitAan = true
    }
  }
  // Overal alfa 0: een lege byte, geen onzichtbaar beeld. Zie hierboven.
  if (kanaalA && !alfaOoitAan) for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255
  return { breedte, hoogte, pixels }
}

// ---------------------------------------------------------------- verkleinen

/**
 * Een textuur terugbrengen tot hooguit `grens` in de langste richting, met het
 * gemiddelde over het hele gebied dat een nieuwe pixel beslaat.
 *
 * WAAROM NIET `verkleinTextuur` UIT `busbeeld.ts`
 * Die neemt per nieuwe pixel één oude, en voor een foto van een bus van 512
 * breed ziet niemand dat. Een schermtextuur draagt tekst en lijntjes van één
 * pixel breed: bij halvering valt dan de helft van de lijntjes weg, of juist
 * niet, afhankelijk van waar ze toevallig liggen. Middelen over het gebied
 * (een "box"-filter, ook bij een factor die geen geheel getal is) houdt elke
 * lijn als een lichtere lijn.
 *
 * De kleur wordt gewogen naar de alfa: een doorzichtige pixel draagt geen
 * kleur bij. Anders krijgt een wit teken op een doorzichtige, zwarte grond een
 * donkere rand zodra het verkleind wordt. Is een gebied helemaal doorzichtig,
 * dan telt het gewone gemiddelde, zodat de kleur daar niet willekeurig wordt.
 *
 * Geeft dezelfde textuur terug als hij al klein genoeg is.
 */
export function verkleinGemiddeld(textuur: Textuur, grens: number): Textuur {
  const { breedte, hoogte, pixels } = textuur
  const langste = Math.max(breedte, hoogte)
  if (langste <= grens || grens < 1) return textuur
  const schaal = grens / langste
  const nb = Math.max(1, Math.min(grens, Math.round(breedte * schaal)))
  const nh = Math.max(1, Math.min(grens, Math.round(hoogte * schaal)))

  /*
   * Per nieuwe kolom: welke oude kolommen, met welk deel van hun breedte. Eén
   * keer uitgerekend in plaats van per rij opnieuw; bij 8192 breed naar 2048
   * zijn dat vier oude kolommen per nieuwe.
   */
  const bronX: number[][] = []
  const gewichtX: number[][] = []
  const fx = breedte / nb
  for (let x = 0; x < nb; x++) {
    const van = x * fx
    const tot = (x + 1) * fx
    const kolommen: number[] = []
    const gewichten: number[] = []
    for (let i = Math.floor(van); i < Math.min(breedte, Math.ceil(tot)); i++) {
      const deel = Math.min(i + 1, tot) - Math.max(i, van)
      if (deel > 1e-9) {
        kolommen.push(i)
        gewichten.push(deel)
      }
    }
    bronX.push(kolommen)
    gewichtX.push(gewichten)
  }

  const uit = new Uint8Array(nb * nh * 4)
  // Per nieuwe pixel: r·a, g·a, b·a, a, dan r, g, b zonder weging, en het gewicht.
  const som = new Float64Array(nb * 8)
  const fy = hoogte / nh
  for (let y = 0; y < nh; y++) {
    som.fill(0)
    const van = y * fy
    const tot = (y + 1) * fy
    for (let j = Math.floor(van); j < Math.min(hoogte, Math.ceil(tot)); j++) {
      const wy = Math.min(j + 1, tot) - Math.max(j, van)
      if (wy <= 1e-9) continue
      const rijBegin = j * breedte * 4
      for (let x = 0; x < nb; x++) {
        const kolommen = bronX[x]
        const gewichten = gewichtX[x]
        const s = x * 8
        for (let k = 0; k < kolommen.length; k++) {
          const w = wy * gewichten[k]
          const p = rijBegin + kolommen[k] * 4
          const wa = w * pixels[p + 3]
          som[s] += pixels[p] * wa
          som[s + 1] += pixels[p + 1] * wa
          som[s + 2] += pixels[p + 2] * wa
          som[s + 3] += wa
          som[s + 4] += pixels[p] * w
          som[s + 5] += pixels[p + 1] * w
          som[s + 6] += pixels[p + 2] * w
          som[s + 7] += w
        }
      }
    }
    for (let x = 0; x < nb; x++) {
      const s = x * 8
      const o = (y * nb + x) * 4
      const totaal = som[s + 7]
      if (totaal <= 0) continue
      if (som[s + 3] > 0) {
        uit[o] = Math.round(som[s] / som[s + 3])
        uit[o + 1] = Math.round(som[s + 1] / som[s + 3])
        uit[o + 2] = Math.round(som[s + 2] / som[s + 3])
      } else {
        uit[o] = Math.round(som[s + 4] / totaal)
        uit[o + 1] = Math.round(som[s + 5] / totaal)
        uit[o + 2] = Math.round(som[s + 6] / totaal)
      }
      uit[o + 3] = Math.round(som[s + 3] / totaal)
    }
  }
  return { breedte: nb, hoogte: nh, pixels: uit }
}

// ------------------------------------------------------------ alleen de kop

/**
 * Wat de kop van een textuur zegt, zonder de pixels: voor het 3D-pakket
 * (bus3d-ontwerp §4.1 en §5.7). De werker leest van elk bestand alleen het begin
 * (DDS 128 bytes, de rest hooguit 64 kB); de pixels gaan later rechtstreeks uit
 * de OMSI-map naar de renderer-werker.
 *
 * `route`:
 * - `dxt`: DXT1/3/5 met een mipketen en zijden deelbaar door 4 -- gecomprimeerd
 *   naar de GPU, rechtstreeks uit de stroom, niveau voor niveau (`niveaus`);
 * - `dxt-zonder-mips`: DXT zonder keten, of een zijde niet deelbaar door 4 -- de
 *   GPU zet hem om;
 * - `beeld`: PNG, JPEG en een gewone BMP (1, 4, 8 of 24 bits, of RLE) -- dat
 *   decodeert Chromium (`createImageBitmap`), op de inhoud en niet op de naam;
 * - `eigen`: TGA, BMP van 16 of 32 bits of met bitmaskers, en een DDS die geen
 *   DXT is -- de eigen lezers hierboven.
 */
export interface TextuurKop {
  soort: TextuurSoort
  route: 'dxt' | 'dxt-zonder-mips' | 'beeld' | 'eigen'
  vorm: string
  b: number
  h: number
  mips: number
  formaat?: 'bc1' | 'bc2' | 'bc3'
  /** DXT: waar elk niveau in het bestand staat. */
  niveaus?: Array<{ off: number; len: number }>
  mime?: string
}

/** Hoeveel bytes het begin moet zijn voor `textuurKop`: genoeg voor alles behalve een JPEG met grote EXIF. */
export const KOP_BYTES = 64 * 1024

/**
 * De plek van elk DXT-niveau in het bestand, vanaf byte 128. Niveaus die niet
 * meer in het bestand passen vallen af: een keten die meer belooft dan er staat,
 * wordt korter, nooit langer.
 */
export function ddsPlakken(
  b: number,
  h: number,
  formaat: 'bc1' | 'bc2' | 'bc3',
  mips: number,
  bestandsgrootte: number
): Array<{ off: number; len: number }> {
  const blok = formaat === 'bc1' ? 8 : 16
  const uit: Array<{ off: number; len: number }> = []
  let off = 128
  let bb = b
  let hh = h
  for (let i = 0; i < Math.max(1, mips); i++) {
    const len = Math.max(1, Math.ceil(bb / 4)) * Math.max(1, Math.ceil(hh / 4)) * blok
    if (off + len > bestandsgrootte) break
    uit.push({ off, len })
    off += len
    if (bb === 1 && hh === 1) break
    bb = Math.max(1, bb >> 1)
    hh = Math.max(1, hh >> 1)
  }
  return uit
}

/**
 * De kop van een textuur, op de inhoud herkend. `begin` is het begin van het
 * bestand (liefst `KOP_BYTES`), `grootte` de hele lengte. Geeft een klacht als
 * het niet te lezen is -- dan is de textuur 'onleesbaar' en niet 'ontbrekend'.
 */
export function textuurKop(begin: Uint8Array, grootte: number): TextuurKop | { klacht: TextuurKlacht; detail: string } {
  const buf = begin
  if (grootte === 0) return { klacht: 'leeg', detail: 'nul bytes' }
  if (buf.length < 18) return { klacht: 'leeg', detail: `${buf.length} bytes, te kort voor een kop` }

  if (buf[0] === 0x44 && buf[1] === 0x44 && buf[2] === 0x53 && buf[3] === 0x20) {
    if (buf.length < 128) return { klacht: 'afgekapt', detail: 'DDS-kop korter dan 128 bytes' }
    const h = u32(buf, 12)
    const b = u32(buf, 16)
    const maat = keurMaat(b, h)
    if (maat) return { klacht: maat[0], detail: maat[1] }
    const pf = u32(buf, 80)
    const fourcc = latin1(buf, 84, 88)
    const opgegeven = u32(buf, 28)
    if (pf & PF_FOURCC) {
      const formaat = fourcc === 'DXT1' ? 'bc1' : fourcc === 'DXT3' ? 'bc2' : fourcc === 'DXT5' ? 'bc3' : undefined
      if (!formaat) return { klacht: 'niet-ondersteund', detail: `fourcc "${fourcc.replace(/[^\x20-\x7e]/g, '.')}"` }
      /*
       * Het aantal niveaus: het veld telt ook als de vlag (0x20000) ontbreekt --
       * niet elke schrijver zet hem -- maar nooit meer dan er in het bestand past.
       */
      const niveaus = ddsPlakken(b, h, formaat, opgegeven > 1 ? opgegeven : 1, grootte)
      if (niveaus.length === 0) return { klacht: 'afgekapt', detail: `niveau 0 past niet in ${grootte} bytes` }
      const mips = niveaus.length
      const deelbaar = b % 4 === 0 && h % 4 === 0
      return {
        soort: 'dds',
        route: mips > 1 && deelbaar ? 'dxt' : 'dxt-zonder-mips',
        vorm: fourcc,
        b,
        h,
        mips,
        formaat,
        niveaus
      }
    }
    if (pf & (PF_RGB | PF_ALPHA | PF_LUMINANCE)) {
      const bits = u32(buf, 88)
      const vorm = beschrijfKanalen(bits, u32(buf, 92), u32(buf, 96), u32(buf, 100), u32(buf, 104), pf)
      if (bits !== 8 && bits !== 16 && bits !== 24 && bits !== 32) {
        return { klacht: 'niet-ondersteund', detail: `${bits} bits per pixel` }
      }
      const vlaggen = u32(buf, 8)
      const pitch = vlaggen & 0x8 ? u32(buf, 20) : 0
      const nodig = Math.max(pitch, (b * bits) / 8) * h
      if (128 + nodig > grootte) return { klacht: 'afgekapt', detail: `${nodig} bytes nodig, ${grootte - 128} over` }
      return { soort: 'dds', route: 'eigen', vorm, b, h, mips: 1 }
    }
    return { klacht: 'niet-ondersteund', detail: `pixelformaatvlaggen 0x${pf.toString(16)}` }
  }

  if (buf[0] === 0x42 && buf[1] === 0x4d) {
    if (buf.length < 26) return { klacht: 'afgekapt', detail: 'BMP-kop' }
    const kop = u32(buf, 14)
    if (kop === 12) {
      // De oude OS/2-kop: maat in twee bytes. `pakBmpUit` kent hem niet, Chromium wel.
      const b = u16(buf, 18)
      const h = u16(buf, 20)
      const maat = keurMaat(b, h)
      if (maat) return { klacht: maat[0], detail: maat[1] }
      return { soort: 'bmp', route: 'beeld', vorm: `BMP${u16(buf, 24)}-OS2`, b, h, mips: 1, mime: 'image/bmp' }
    }
    if (buf.length < 54) return { klacht: 'afgekapt', detail: 'BMP-kop' }
    const b = i32(buf, 18)
    const h = Math.abs(i32(buf, 22))
    const bits = u16(buf, 28)
    const compressie = u32(buf, 30)
    const maat = keurMaat(b, h)
    if (maat) return { klacht: maat[0], detail: maat[1] }
    if (kop < 40) return { klacht: 'niet-ondersteund', detail: `BMP-kop van ${kop} bytes` }
    const gewoon = compressie === 0 && (bits === 1 || bits === 4 || bits === 8 || bits === 24)
    const rle = (compressie === 1 && bits === 8) || (compressie === 2 && bits === 4)
    const naam =
      compressie === 0 ? '' : compressie === 3 || compressie === 6 ? '-maskers' : compressie <= 2 ? '-RLE' : `-c${compressie}`
    const vorm = `BMP${bits}${naam}`
    if (gewoon || rle) return { soort: 'bmp', route: 'beeld', vorm, b, h, mips: 1, mime: 'image/bmp' }
    if ((bits === 16 || bits === 32) && (compressie === 0 || compressie === 3 || compressie === 6)) {
      return { soort: 'bmp', route: 'eigen', vorm, b, h, mips: 1 }
    }
    return { klacht: 'niet-ondersteund', detail: vorm }
  }

  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    if (buf.length < 24) return { klacht: 'afgekapt', detail: 'PNG-kop' }
    const b = ((buf[16] << 24) | (buf[17] << 16) | (buf[18] << 8) | buf[19]) >>> 0
    const h = ((buf[20] << 24) | (buf[21] << 16) | (buf[22] << 8) | buf[23]) >>> 0
    const maat = keurMaat(b, h)
    if (maat) return { klacht: maat[0], detail: maat[1] }
    return { soort: 'png', route: 'beeld', vorm: 'PNG', b, h, mips: 1, mime: 'image/png' }
  }

  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    // De maat staat in het eerste SOF-blok (C0-CF, behalve C4, C8 en CC).
    let p = 2
    while (p + 9 < buf.length) {
      if (buf[p] !== 0xff) {
        p++
        continue
      }
      const merk = buf[p + 1]
      if (merk === 0xff) {
        p++
        continue
      }
      if (merk === 0xd8 || merk === 0x01 || (merk >= 0xd0 && merk <= 0xd7)) {
        p += 2
        continue
      }
      const lengte = (buf[p + 2] << 8) | buf[p + 3]
      if (merk >= 0xc0 && merk <= 0xcf && merk !== 0xc4 && merk !== 0xc8 && merk !== 0xcc) {
        const h = (buf[p + 5] << 8) | buf[p + 6]
        const b = (buf[p + 7] << 8) | buf[p + 8]
        const maat = keurMaat(b, h)
        if (maat) return { klacht: maat[0], detail: maat[1] }
        return { soort: 'jpg', route: 'beeld', vorm: merk === 0xc2 ? 'JPEG-progressief' : 'JPEG', b, h, mips: 1, mime: 'image/jpeg' }
      }
      if (merk === 0xda || lengte < 2) break
      p += 2 + lengte
    }
    return { klacht: 'afgekapt', detail: `geen SOF in de eerste ${buf.length} bytes` }
  }

  // Wat overblijft is een TGA, of niets: de velden moeten kloppen (zie ontleedTga).
  const kaartSoort = buf[1]
  const soort = buf[2]
  const bekend = soort === 1 || soort === 2 || soort === 3 || soort === 9 || soort === 10 || soort === 11
  if (!bekend || kaartSoort > 1) {
    const kop = [...buf.subarray(0, 4)].map((x) => x.toString(16).padStart(2, '0')).join(' ')
    return { klacht: 'onbekend-formaat', detail: `begint met ${kop}` }
  }
  const b = u16(buf, 12)
  const h = u16(buf, 14)
  const bits = buf[16]
  const maat = keurMaat(b, h)
  if (maat) return { klacht: maat[0], detail: maat[1] }
  if (bits !== 8 && bits !== 16 && bits !== 24 && bits !== 32) return { klacht: 'niet-ondersteund', detail: `TGA van ${bits} bits` }
  const wat = soort === 1 || soort === 9 ? 'kaart' : soort === 3 || soort === 11 ? 'grijs' : ''
  return { soort: 'tga', route: 'eigen', vorm: `TGA${soort >= 9 ? '-RLE' : ''}-${wat}${bits}`, b, h, mips: 1 }
}
