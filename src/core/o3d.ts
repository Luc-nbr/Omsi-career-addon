import { readFileSync } from 'node:fs'

/**
 * OMSI's eigen 3D-modelformaat (.o3d).
 *
 * WAAROM DIT BESTAAT
 * Van de 166 voertuigmappen in deze installatie heeft er geen één een
 * voorbeeldplaatje; OMSI tekent de bus in zijn eigen keuzescherm live uit deze
 * bestanden. Wie tegels met bussen wil -- zoals de kaartkeuze die al foto's
 * heeft -- moet het model dus zelf kunnen lezen.
 *
 * WAT ERIN STAAT, ZOALS HIER GEMETEN
 * Nagelopen over alle 55.041 .o3d-bestanden van deze installatie
 * (`scripts/probe-o3d.ts`). Geen enkele aanname komt uit een handleiding; wat
 * hieronder staat is geteld.
 *
 * Kop: de bytes 0x84 0x19, dan een versiebyte. Voorkomende versies: 1 (35.137
 * bestanden), 7 (7757), 4 (7062), 5 (5060) en 3 (3). Versie 1 begint meteen
 * daarna met blokken; vanaf versie 3 volgt eerst een vlagbyte, en vanaf versie 4
 * nog vier bytes erachter. Die vier zijn per addon gelijk (0x31b6, 0x32cd,
 * 0xffffffff ...) en zeggen ons niets; wat ze betekenen is niet nagemeten en ook
 * niet nodig.
 *
 * Elk blok begint met een kenbyte:
 *
 * - `0x17` hoekpunten: een aantal, dan per hoekpunt 8 floats -- positie xyz,
 *   normaal xyz, uv -- samen 32 bytes.
 * - `0x49` driehoeken: een aantal, dan per driehoek drie hoekpuntnummers en een
 *   materiaalnummer.
 * - `0x26` materialen: **altijd** een uint16 aantal (ook in versie 7), dan per
 *   materiaal 11 floats (diffuus rgba, specular rgb, emissie rgb, macht) en de
 *   textuurnaam als lengtebyte plus latin-1 tekens.
 * - `0x79` een 4x4-matrix van floats: de plaatsing van dit deel in het
 *   voertuig. Rijgewijs, met de verschuiving in de laatste rij (elementen 12,
 *   13, 14) -- af te lezen aan `Woman01.o3d`, waar alleen 13 en 14 van nul
 *   afwijken. 18.453 modellen dragen de eenheidsmatrix, 36.552 iets anders.
 * - `0x54` beenderen: alleen bij mensen en bij harmonicabalgen (197 bestanden).
 *
 * De blokken komen in één volgorde voor: 17-49-26-79 (54.808 bestanden),
 * dezelfde met 54 erachter (197), en één bestand zonder matrix. Elk blok komt
 * hoogstens één keer voor; een .o3d is één mesh, geen scène. Het blok `0x53`
 * waar in de wandelgangen over gesproken wordt komt hier niet voor.
 *
 * DE TELLERS ZIJN NIET OVERAL EVEN BREED
 * Bij versie 1 zijn de aantallen van hoekpunten en driehoeken uint16, vanaf
 * versie 3 uint32. Het aantal materialen blijft uint16 in álle versies -- dat
 * is geen gok: met een uint32 schuift alles twee bytes op en komt geen enkel
 * bestand meer precies op zijn laatste byte uit.
 *
 * LANGE DRIEHOEKSINDICES
 * Bit 0 van de vlagbyte zegt dat de drie hoekpuntnummers uint32 zijn in plaats
 * van uint16 (14 bytes per driehoek in plaats van 8). Negen bestanden gebruiken
 * dat: `monsterball.o3d` met 245.760 hoekpunten, en acht stoelenmodellen van de
 * MAN NL/NG 263 die ruim onder de 65.536 blijven -- de vlag staat dus niet
 * vanzelf aan bij grote modellen, hij moet gelezen worden. Bit 1 komt in 3500
 * bestanden voor en hangt met niets samen wat wij lezen (matrix, beenderen,
 * aantal materialen); wat het betekent is niet nagemeten.
 *
 * COÖRDINATEN
 * x is de breedte, y de hoogte, z de lengte, in meters. Gemeten aan de
 * MAN SD200: alle delen samen lopen van -1,41 tot 1,41 breed, van -0,02 tot
 * 2,58 hoog en van -5,75 tot 5,83 lang -- een bus van 2,82 bij 11,6 m.
 *
 * WAT ER NOOIT GEBEURT
 * Dit bestand gooit niet. Een model dat niet te lezen is levert `undefined` of
 * een half gevulde `O3dLezing` op. Reden: dit draait in de werker die de
 * kaarten inleest, en één addon met een kapot bestand -- en die zijn er, zie
 * hieronder -- mag niet de hele buslijst omvertrekken. Dezelfde keuze als in
 * `listHofs`, waar een onleesbaar wagenpark de busselectie niet blokkeert.
 */

/** Eén materiaal: de kleuren en de textuur die erbij hoort. */
export interface O3dMateriaal {
  /** Diffuse kleur met doorzichtigheid: r, g, b, a. */
  diffuus: [number, number, number, number]
  specular: [number, number, number]
  emissie: [number, number, number]
  /** De scherpte van de glans. Loopt in deze installatie van 0 tot 1000. */
  macht: number
  /**
   * De bestandsnaam van de textuur, zonder pad; die ligt in `texture\` naast
   * het model. Kan leeg zijn -- dan is het materiaal een kale kleur.
   */
  textuur: string
}

/**
 * Eén been uit het skelet, met de hoekpunten die eraan vastzitten.
 *
 * Alleen mensen en harmonicabalgen hebben die: 197 bestanden, met namen als
 * `Hip`, `Head` en `OA_R`. De gewichten staan als paren (hoekpunt, gewicht) en
 * het hoogste hoekpuntnummer is in elk van die 197 bestanden precies het aantal
 * hoekpunten min één -- zo weten we dat we ze goed lezen. Let op: dezelfde
 * hoekpunten komen binnen één been meerdere keren voor (1,45 van de 2,21
 * miljoen paren) en de gewichten per hoekpunt tellen lang niet altijd op tot
 * één (84.975 van de 429.507). Wat OMSI daarmee doet is hier niet gemeten; dit
 * is de ruwe inhoud.
 */
export interface O3dBeen {
  naam: string
  hoekpunten: Uint16Array
  gewichten: Float32Array
}

/**
 * Een ingelezen model. De drie hoekpuntlijsten lopen gelijk op: hoekpunt `i`
 * staat op `vertices[3i..3i+2]`, `normals[3i..3i+2]` en `uvs[2i..2i+1]`.
 */
export interface O3dModel {
  /** De versiebyte uit de kop; handig bij het uitzoeken van vreemde bestanden. */
  versie: number
  vertices: Float32Array
  normals: Float32Array
  uvs: Float32Array
  /** Drie hoekpuntnummers per driehoek. */
  triangles: Uint32Array
  /**
   * Het materiaalnummer per driehoek. **Niet blind gebruiken als index**: 195
   * bestanden (11.692 driehoeken) wijzen naar een materiaal dat er niet is,
   * meestal omdat ze helemaal geen materialen hebben.
   */
  materiaalPerDriehoek: Uint16Array
  materialen: O3dMateriaal[]
  /** De 4x4-matrix uit blok 0x79, rijgewijs. Ontbreekt als het blok er niet is. */
  transform?: number[]
  /** Alleen gevuld als het bestand een beenderenblok heeft. */
  beenderen?: O3dBeen[]
}

/** Waarom een bestand niet (helemaal) gelezen kon worden. */
export type O3dKlacht =
  /** Niet te openen: weg, vergrendeld, geen rechten. */
  | 'onleesbaar'
  /** Nul bytes lang. */
  | 'leeg'
  /** Begint niet met 0x84 0x19; versleuteld of stuk. */
  | 'geen-kop'
  /** Een blok belooft meer bytes dan het bestand nog heeft. */
  | 'afgekapt'
  /** Een kenbyte die we niet kennen, midden in het bestand. */
  | 'onbekend-blok'

/**
 * Het antwoord van de lezer. `model` en `klacht` kunnen allebei gevuld zijn:
 * dan is de meetkunde binnen maar liep het daarna vast. Die helft is bruikbaar
 * -- van alle 55.006 bestanden die hier helemaal uitkomen wijst geen enkele
 * driehoek naar een hoekpunt dat niet bestaat -- dus weggooien zou zonde zijn.
 */
export interface O3dLezing {
  model?: O3dModel
  klacht?: O3dKlacht
  /** Waar het misging, voor in een logregel. */
  detail?: string
}

const BLOK_HOEKPUNTEN = 0x17
const BLOK_DRIEHOEKEN = 0x49
const BLOK_MATERIALEN = 0x26
const BLOK_MATRIX = 0x79
const BLOK_BEENDEREN = 0x54

/**
 * Textuurnamen eindigen hierop. Alleen nodig voor de noodgreep hieronder; bij
 * een gaaf bestand wordt er niet naar gekeken.
 */
const TEXTUUR_EINDES = ['.dds', '.bmp', '.tga', '.png', '.jpg', '.jpeg', '.dxt', '.gif', '.tif']

/**
 * Draait deze machine met de kleinste byte voorop? Zo ja, dan mag een blok
 * floats in één keer overgezet worden in plaats van float voor float.
 */
const KLEIN_EINDIG = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1

/**
 * Leest een .o3d van schijf. Geeft `undefined` bij alles wat niet lukt.
 *
 * Dit is de vorm voor wie gewoon een model wil. Wie wil weten *waarom* het niet
 * lukte -- de probe, en straks het logboek -- neemt `leesO3dLezing`.
 */
export function leesO3d(pad: string): O3dModel | undefined {
  return leesO3dLezing(pad).model
}

/** Hetzelfde, maar met de reden erbij. */
export function leesO3dLezing(pad: string): O3dLezing {
  let bytes: Buffer
  try {
    bytes = readFileSync(pad)
  } catch (fout) {
    return { klacht: 'onleesbaar', detail: (fout as Error).message }
  }
  return ontleedO3d(bytes)
}

/**
 * Ontleedt bytes die al in het geheugen staan.
 *
 * Deze vorm staat er apart naast omdat het lezen van schijf en het ontleden
 * niet altijd op dezelfde plek gebeuren: de werker die de kaarten inleest kan
 * een bestand al in handen hebben, en een probe wil dezelfde bytes twee keer
 * ontleden zonder de schijf er twee keer bij te halen. Alles wat hier binnenkomt
 * is `node:fs`-materiaal; er zit geen Electron in dit bestand, zodat het ook in
 * een worker_thread laadt.
 */
export function ontleedO3d(bytes: Uint8Array): O3dLezing {
  const buf = Buffer.isBuffer(bytes)
    ? bytes
    : Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  if (buf.length === 0) return { klacht: 'leeg', detail: 'nul bytes' }
  if (buf.length < 4 || buf[0] !== 0x84 || buf[1] !== 0x19) {
    return { klacht: 'geen-kop', detail: `begint met ${toon(buf, 4)}` }
  }

  /*
   * Twee lezingen. De strenge houdt zich aan de lengtebyte van de textuurnaam;
   * de soepele knipt de naam af op zijn extensie. Dat laatste redt tien
   * bestanden waarin die byte met de hand verminkt is (`KW.dds` staat er met
   * lengte 19, `OVR_Betriebshof_Zaun.dds` met lengte 21 terwijl de naam er 24
   * telt), maar het mag geen gewoonte worden: twee bestanden van ADDON_
   * SimpleStreets en Ahlheim4 hebben texturen die écht `str_asphdrk.bmp.003`
   * heten, en die zou de noodgreep afknippen. Vandaar: soepel alleen als streng
   * er niet uitkomt.
   */
  const streng = ontleed(buf, false)
  if (!streng.klacht) return streng
  const soepel = ontleed(buf, true)
  return soepel.klacht ? streng : soepel
}

/** De eerste bytes als hex, voor in een foutmelding. */
function toon(buf: Buffer, hoeveel: number): string {
  return [...buf.subarray(0, hoeveel)].map((b) => b.toString(16).padStart(2, '0')).join(' ')
}

function ontleed(buf: Buffer, soepel: boolean): O3dLezing {
  const versie = buf[2]
  /*
   * Versie 1 begint meteen met blokken, versie 3 heeft er een vlagbyte bij en
   * versie 4 en hoger nog vier bytes daarachter. Onbekende versies worden als
   * de nieuwste gelezen; dat is de beste gok, en als hij misgaat komt het
   * bestand niet uit en zegt de lezer dat gewoon.
   */
  let p = versie >= 4 ? 8 : versie >= 3 ? 4 : 3
  const telBreed = versie >= 3 ? 4 : 2
  const langeIndex = versie >= 3 && (buf[3] & 1) === 1
  const driehoekStap = langeIndex ? 14 : 8

  const model: O3dModel = {
    versie,
    vertices: new Float32Array(0),
    normals: new Float32Array(0),
    uvs: new Float32Array(0),
    triangles: new Uint32Array(0),
    materiaalPerDriehoek: new Uint16Array(0),
    materialen: []
  }
  const af = (klacht: O3dKlacht, detail: string): O3dLezing => ({ model, klacht, detail })

  while (p < buf.length) {
    const tag = buf[p]
    const blokBegin = p
    p++

    if (tag === BLOK_HOEKPUNTEN) {
      if (p + telBreed > buf.length) return af('afgekapt', `hoekpunttelling op ${blokBegin}`)
      const aantal = telBreed === 4 ? buf.readUInt32LE(p) : buf.readUInt16LE(p)
      p += telBreed
      if (p + aantal * 32 > buf.length) {
        return af('afgekapt', `${aantal} hoekpunten beloofd, ${buf.length - p} bytes over`)
      }
      vulHoekpunten(model, buf, p, aantal)
      p += aantal * 32
      continue
    }

    if (tag === BLOK_DRIEHOEKEN) {
      if (p + telBreed > buf.length) return af('afgekapt', `driehoektelling op ${blokBegin}`)
      const aantal = telBreed === 4 ? buf.readUInt32LE(p) : buf.readUInt16LE(p)
      p += telBreed
      if (p + aantal * driehoekStap > buf.length) {
        return af('afgekapt', `${aantal} driehoeken beloofd, ${buf.length - p} bytes over`)
      }
      const driehoeken = new Uint32Array(aantal * 3)
      const perDriehoek = new Uint16Array(aantal)
      for (let i = 0; i < aantal; i++) {
        const o = p + i * driehoekStap
        if (langeIndex) {
          driehoeken[i * 3] = buf.readUInt32LE(o)
          driehoeken[i * 3 + 1] = buf.readUInt32LE(o + 4)
          driehoeken[i * 3 + 2] = buf.readUInt32LE(o + 8)
          perDriehoek[i] = buf.readUInt16LE(o + 12)
        } else {
          driehoeken[i * 3] = buf.readUInt16LE(o)
          driehoeken[i * 3 + 1] = buf.readUInt16LE(o + 2)
          driehoeken[i * 3 + 2] = buf.readUInt16LE(o + 4)
          perDriehoek[i] = buf.readUInt16LE(o + 6)
        }
      }
      model.triangles = driehoeken
      model.materiaalPerDriehoek = perDriehoek
      p += aantal * driehoekStap
      continue
    }

    if (tag === BLOK_MATERIALEN) {
      if (p + 2 > buf.length) return af('afgekapt', `materiaaltelling op ${blokBegin}`)
      const aantal = buf.readUInt16LE(p)
      p += 2
      for (let k = 0; k < aantal; k++) {
        if (p + 45 > buf.length) return af('afgekapt', `materiaal ${k} van ${aantal}`)
        const f = (j: number): number => buf.readFloatLE(p + j * 4)
        const materiaal: O3dMateriaal = {
          diffuus: [f(0), f(1), f(2), f(3)],
          specular: [f(4), f(5), f(6)],
          emissie: [f(7), f(8), f(9)],
          macht: f(10),
          textuur: ''
        }
        p += 44
        const lengte = buf[p]
        p++
        const echteLengte = soepel ? naamLengte(buf, p, lengte) : lengte
        if (p + echteLengte > buf.length) return af('afgekapt', `textuurnaam van materiaal ${k}`)
        materiaal.textuur = buf.subarray(p, p + echteLengte).toString('latin1')
        p += echteLengte
        model.materialen.push(materiaal)
      }
      continue
    }

    if (tag === BLOK_MATRIX) {
      if (p + 64 > buf.length) return af('afgekapt', `matrix op ${blokBegin}`)
      const matrix: number[] = []
      for (let j = 0; j < 16; j++) matrix.push(buf.readFloatLE(p + j * 4))
      model.transform = matrix
      p += 64
      continue
    }

    if (tag === BLOK_BEENDEREN) {
      if (p + 2 > buf.length) return af('afgekapt', `beenderentelling op ${blokBegin}`)
      const aantal = buf.readUInt16LE(p)
      p += 2
      const beenderen: O3dBeen[] = []
      for (let k = 0; k < aantal; k++) {
        if (p >= buf.length) return af('afgekapt', `been ${k} van ${aantal}`)
        const lengte = buf[p]
        p++
        if (p + lengte + 2 > buf.length) return af('afgekapt', `naam van been ${k}`)
        const naam = buf.subarray(p, p + lengte).toString('latin1')
        p += lengte
        const gewichten = buf.readUInt16LE(p)
        p += 2
        if (p + gewichten * 6 > buf.length) return af('afgekapt', `gewichten van been ${naam}`)
        const hoekpunten = new Uint16Array(gewichten)
        const waarden = new Float32Array(gewichten)
        for (let j = 0; j < gewichten; j++) {
          hoekpunten[j] = buf.readUInt16LE(p + j * 6)
          waarden[j] = buf.readFloatLE(p + j * 6 + 2)
        }
        p += gewichten * 6
        beenderen.push({ naam, hoekpunten, gewichten: waarden })
      }
      model.beenderen = beenderen
      continue
    }

    return af('onbekend-blok', `0x${tag.toString(16)} op ${blokBegin}, ${buf.length - blokBegin} bytes over`)
  }

  /*
   * Hier is p precies gelijk aan de lengte: elk blok kijkt vooruit voordat het
   * verder stapt, dus een bestand dat te ver zou lopen is al afgevangen. Komt
   * er achteraan nog iets dat geen blok is, dan viel dat hierboven als
   * "onbekend blok" op.
   */
  return { model }
}

/**
 * Zet het hoekpuntenblok om in drie lijsten.
 *
 * De omweg via één blok floats is er voor de snelheid: het blok ligt niet op
 * een veelvoud van vier in het bestand (bij versie 1 begint het op byte 6, bij
 * versie 7 op byte 13), dus er kan geen `Float32Array` rechtstreeks overheen
 * gelegd worden. Kopiëren naar een verse buffer -- die begint wél op nul -- en
 * daar één keer overheen lopen scheelt fors: over de 34.417 hoekpuntblokken van
 * `Vehicles` samen, 31,1 miljoen hoekpunten, 0,55 s tegen 3,50 s met acht losse
 * `readFloatLE` per hoekpunt. Beide wegen leveren tot op de bit dezelfde floats.
 */
function vulHoekpunten(model: O3dModel, buf: Buffer, begin: number, aantal: number): void {
  const rauw = Buffer.alloc(aantal * 32)
  buf.copy(rauw, 0, begin, begin + aantal * 32)
  // Alleen nodig op een machine die andersom telt; Windows op x86 doet dat niet.
  if (!KLEIN_EINDIG) rauw.swap32()
  const f = new Float32Array(rauw.buffer, rauw.byteOffset, aantal * 8)

  const vertices = new Float32Array(aantal * 3)
  const normals = new Float32Array(aantal * 3)
  const uvs = new Float32Array(aantal * 2)
  for (let i = 0; i < aantal; i++) {
    const o = i * 8
    vertices[i * 3] = f[o]
    vertices[i * 3 + 1] = f[o + 1]
    vertices[i * 3 + 2] = f[o + 2]
    normals[i * 3] = f[o + 3]
    normals[i * 3 + 1] = f[o + 4]
    normals[i * 3 + 2] = f[o + 5]
    uvs[i * 2] = f[o + 6]
    uvs[i * 2 + 1] = f[o + 7]
  }
  model.vertices = vertices
  model.normals = normals
  model.uvs = uvs
}

/**
 * De noodgreep voor een verminkte lengtebyte: knip de naam af op de extensie.
 *
 * Er wordt een eindje verder gekeken dan de byte belooft, want het gaat beide
 * kanten op -- `Schild_Stadtwerke.dds` staat er met lengte 27 (zes te veel),
 * `OVR_Betriebshof_Zaun.dds` met lengte 21 (drie te weinig). Alles vóór de
 * extensie moet leesbare tekst zijn; is het dat niet, dan is de extensie toeval
 * en houden we de lengtebyte aan.
 */
function naamLengte(buf: Buffer, begin: number, beloofd: number): number {
  const tot = Math.min(buf.length, begin + beloofd + 24)
  const stuk = buf.subarray(begin, tot).toString('latin1').toLowerCase()
  let einde = -1
  for (const ext of TEXTUUR_EINDES) {
    const i = stuk.indexOf(ext)
    if (i >= 0 && (einde < 0 || i + ext.length < einde)) einde = i + ext.length
  }
  if (einde < 0) return beloofd
  for (let i = 0; i < einde; i++) {
    const c = buf[begin + i]
    if (c < 0x20 || c > 0x7e) return beloofd
  }
  return einde
}
