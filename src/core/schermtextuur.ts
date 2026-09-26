import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { dirname, extname, join, posix, resolve, sep, win32 } from 'node:path'
import { zoekTextuurVan } from './busmodel'
import { log } from './logboek'
import { leesPng, pngKop, pngVan } from './png'
import { ontleedTextuur, pakBmpUit, verkleinGemiddeld, type Textuur } from './textuur'

/**
 * De plaatjes van het scherm van een apparaat: opzoeken in de OMSI-map en
 * omzetten naar iets wat een browser toont.
 *
 * WAAROM DIT BESTAAT
 * De telefoon tekent het scherm van de ALMEX (of een IBIS, een kaartautomaat)
 * na met de plaatjes van de bus zelf: `17_almex_s_0.jpg` als achtergrond, de
 * rode vakjes uit `almex_versp_rot.jpg` erop. Die plaatjes staan op de pc, de
 * telefoon krijgt ze over het netwerk. Twee dingen moeten daarvoor kloppen.
 *
 * 1. NOOIT EEN PAD NAAR BUITEN
 *    Een textuurnaam komt uit de cfg van een add-on, of -- bij `[matl_freetex]`
 *    -- uit een stringvariabele die het busscript op elk moment kan vullen. Wie
 *    daar `..\..\..\Users\...` in zet, mag niets buiten de bus of de gedeelde
 *    texturenmap van OMSI te lezen krijgen. `zoekSchermtextuur` weigert daarom
 *    elke naam die de map uit kan (absoluut, `..`, een stationsletter of een
 *    `:`-stroom, een apparaatnaam als `CON`) en elke extensie die geen plaatje
 *    is, en controleert het gevonden pad nog eens tegen de map. Naar buiten
 *    gaat alleen een id (`textuurBron`), en `main/schermtexturen.ts` levert
 *    alleen ids die de server zelf heeft vastgelegd.
 *
 * 2. ZOALS OMSI HET TEKENT
 *    OMSI zoekt een textuur in `<map van de model.cfg>\..\Texture\<naam>` --
 *    met de submap als die in de naam staat (freetex-waarden als
 *    `AFR4_Displays_neue_Software\atron_ST1.png`) -- en neemt een ander
 *    formaat met dezelfde stam als de naam niet bestaat: de cfg van de
 *    `TH_Ueberlandbus` noemt `AFR200.tga`, op schijf staat alleen
 *    `Texture\AFR200.dds`. Daarna de gedeelde map `<OMSI>\Texture`. Pas als
 *    laatste de index van de hele voertuigmap uit `busmodel.ts`: die vindt ook
 *    reservekopieën en repaint-submappen die OMSI zelf niet gebruikt, dus dat
 *    gaat in het logboek.
 *
 *    En wat de materiaalregels met het beeld doen, doet de server vóór het
 *    versturen, want de browser weet niets van `[matl_alpha]`:
 *    - alfa 0: OMSI tekent dekkend, ook als het bestand alfa draagt (DXT3/5,
 *      32-bits TGA). Chromium zou de alfa toepassen; wij zetten hem op 255.
 *    - alfa 1: alfatest, doorzichtig of niet. Drempel 128 (ONZEKER, niet in
 *      het spel nagemeten).
 *    - alfa 2: mengen; de alfa blijft zoals hij is.
 *    - transmap: de alfa komt uit een tweede textuur (zie `zetTransmap`).
 *    - uitsnede: een atlas van 2048 x 2048 voor een strookje van 754 x 147
 *      (`AFR200.dds`) versturen is zonde; de server snijdt bij.
 *    - maat: hooguit 2048 in de langste richting, verkleind met het gemiddelde
 *      (`verkleinGemiddeld`), zodat tekst in het plaatje leesbaar blijft.
 *
 *    Een JPEG, PNG of BMP waar niets aan hoeft gaat ONGEWIJZIGD de deur uit:
 *    de browser leest ze zelf, en een foto als `17_almex_s_0.jpg` (355 kB)
 *    opnieuw inpakken maakt hem alleen groter. Het soort komt uit de eerste
 *    bytes, niet uit de extensie (zie de kop van `textuur.ts`: 724 van de
 *    `.dds`'en onder `Vehicles` zijn een BMP).
 *
 * Geen Electron in dit bestand: het kan in een worker_thread draaien. Het
 * gooit niet; wat niet lukt is `undefined`.
 */

/** Wat het materiaal met het plaatje doet, voor zover de server het moet toepassen. */
export interface Vlaggen {
  /** `[matl_alpha]`: 0 dekkend, 1 alfatest, 2 mengen. */
  alfa: 0 | 1 | 2
  /** Absoluut pad van de `[matl_transmap]`, al gevonden met `zoekSchermtextuur`. */
  trans?: string
  /**
   * Bijsnijden tot x, y, breedte, hoogte in beeldpunten van het ORIGINELE
   * plaatje (vóór verkleinen). Wie dit zet, rekent zelf de uv's om: u = 0 is
   * daarna de linkerrand van de uitsnede.
   */
  uit?: [number, number, number, number]
}

/** Een plaatje zoals het in het register staat: id, pad en wat ermee moet. */
export interface TextuurBron {
  id: string
  pad: string
  vlaggen: Vlaggen
}

/** Wat de browser krijgt. */
export interface Geleverd {
  bytes: Buffer
  type: 'image/png' | 'image/jpeg' | 'image/bmp'
  /**
   * Gezet als niet alles toegepast kon worden -- een JPEG met een transmap of
   * uitsnede (JPEG pakken we niet uit), een BMP in RLE -- en het bestand dus
   * ongewijzigd of zonder transmap gaat. Voor het logboek.
   */
  melding?: string
}

/** De langste zijde die naar de telefoon gaat. */
export const TEXTUURGRENS = 2048

/**
 * De extensies die een plaatje mogen zijn. De inhoud telt bij het omzetten,
 * maar alleen bestanden met zo'n naam worden überhaupt gelezen.
 */
const PLAATJES = new Set(['.jpg', '.jpeg', '.png', '.bmp', '.dds', '.tga'])

/**
 * Welke andere extensies geprobeerd worden als de naam uit de cfg niet bestaat.
 * DDS eerst, want dat is wat add-ons doen als ze een textuur omzetten
 * (`AFR200.tga` -> `AFR200.dds` bij de `TH_Ueberlandbus`, `Sitze_2.tga` ->
 * `Sitze_2.dds` in `busmodel.ts`). Of OMSI .dds ook voorrang geeft als beide
 * bestaan, is niet nagemeten; dan wint hier het bestand met de naam uit de cfg.
 */
const ANDERE_EXTENSIES = ['.dds', '.tga', '.bmp', '.jpg', '.png', '.jpeg']

/**
 * Namen die Windows als apparaat opvat, met of zonder extensie (`CON.jpg` is op
 * Windows 10 de console, en wie die leest wacht eeuwig).
 */
const APPARAATNAAM = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³]|conin\$|conout\$|clock\$)$/i

/**
 * Een textuurnaam als lijst van mapnamen plus bestandsnaam, of `undefined` als
 * de naam niet veilig is.
 *
 * Geweigerd: leeg of te lang; stuurtekens en de tekens die Windows niet in een
 * naam toelaat (`<>"|?*`); elke `:` (stationsletter, of een NTFS-stroom als
 * `x.jpg:geheim`); een absoluut pad (`C:\x`, `\x`, `\\server\x`, `/x`); een deel
 * dat alleen uit punten en spaties bestaat (`..`, maar ook `...` en `.. `,
 * die Windows tot `..` inkort); een apparaatnaam; een extensie die geen
 * plaatje is. Een los `.` en dubbele scheidingstekens vallen weg.
 *
 * Nagekeken in de scripts van de vloot (spec 'nakijken_aflevering'): de enige
 * `..`-waarde is een Krüger-palet en geen scherm, en er staat geen absoluut pad
 * in -- er valt dus niets echts af.
 */
export function naamDelen(naam: string): string[] | undefined {
  const schoon = naam.trim()
  if (!schoon || schoon.length > 260) return undefined
  if (/[\x00-\x1f:<>"|?*]/.test(schoon)) return undefined
  if (win32.isAbsolute(schoon) || posix.isAbsolute(schoon)) return undefined
  const delen: string[] = []
  for (const deel of schoon.split(/[\\/]+/)) {
    if (deel === '' || deel === '.') continue
    if (deel.replace(/[. ]+$/, '') === '') return undefined
    if (APPARAATNAAM.test(deel.split('.')[0].trim())) return undefined
    delen.push(deel)
  }
  if (delen.length === 0) return undefined
  if (!PLAATJES.has(extname(delen[delen.length - 1]).toLowerCase())) return undefined
  return delen
}

/** Ligt `pad` binnen `map`? Hoofdletterongevoelig, en `map` zelf telt niet. */
function binnen(pad: string, map: string): boolean {
  const p = resolve(pad).toLowerCase()
  const m = resolve(map).toLowerCase()
  return p.startsWith(m.endsWith(sep) ? m : m + sep)
}

function isBestand(pad: string): boolean {
  try {
    return statSync(pad).isFile()
  } catch {
    return false
  }
}

/**
 * Het bestand in `map` onder deze naam, of met dezelfde stam en een ander
 * plaatjesformaat.
 */
function zoekIn(map: string, delen: string[]): string | undefined {
  const exact = join(map, ...delen)
  if (!binnen(exact, map)) return undefined
  if (isBestand(exact)) return exact
  const ext = extname(exact)
  const stam = exact.slice(0, exact.length - ext.length)
  for (const andere of ANDERE_EXTENSIES) {
    if (andere === ext.toLowerCase()) continue
    if (isBestand(stam + andere)) return stam + andere
  }
  return undefined
}

/** Welke terugvallen al in het logboek staan; één regel per naam is genoeg. */
const alGemeld = new Set<string>()

/**
 * Het absolute pad van een textuur zoals OMSI hem bij deze bus vindt, of
 * `undefined` (niet veilig, of nergens te vinden).
 *
 * `modelcfg` is de `model.cfg` van de bus (`...\Vehicles\HH20_EBus2021\Model\
 * model_21_main.cfg`), `omsiMap` de installatie. De volgorde:
 *
 * 1. `<map van modelcfg>\..\Texture\<naam, met submap>`;
 * 2. daar dezelfde stam als .dds, .tga, .bmp, .jpg, .png;
 * 3. `<omsiMap>\Texture\<naam>`, en daar hetzelfde met de andere extensies;
 * 4. de index van de hele voertuigmap (`zoekTextuurVan`), op de bestandsnaam
 *    alleen -- met een regel in het logboek.
 *
 * Wat eruit komt ligt altijd binnen de voertuigmap (de map boven `Model`) of
 * binnen `<omsiMap>\Texture`; wat de index daarbuiten zou vinden, wordt
 * weggegooid. Beide paden moeten volledig zijn; anders `undefined`.
 */
export function zoekSchermtextuur(modelcfg: string, omsiMap: string, naam: string): string | undefined {
  const sleutel = `${modelcfg}|${omsiMap}|${naam}`.toLowerCase()
  const nu = Date.now()
  const bekend = onlangs.get(sleutel)
  if (bekend && bekend.tot > nu) return bekend.pad
  const pad = zoekZonderGeheugen(modelcfg, omsiMap, naam)
  if (onlangs.size >= ONTHOUD_MAX) onlangs.clear()
  onlangs.set(sleutel, { pad, tot: nu + ONTHOUD_MS })
  return pad
}

/**
 * Wat er de laatste seconden gezocht is. Een freetex-waarde komt met elk beeld
 * mee, tien keer per seconde, en een naam die niet bestaat kost tot veertien
 * keer `stat` plus de index (gemeten: 20 ms de eerste keer). Vijf seconden
 * onthouden maakt dat verwaarloosbaar, en een bestand dat erbij komt is er na
 * vijf seconden alsnog.
 */
const onlangs = new Map<string, { pad: string | undefined; tot: number }>()
const ONTHOUD_MS = 5000
const ONTHOUD_MAX = 1024

function zoekZonderGeheugen(modelcfg: string, omsiMap: string, naam: string): string | undefined {
  const delen = naamDelen(naam)
  if (!delen) return undefined
  /*
   * Zonder twee volledige paden valt er niets op te sluiten: `resolve('')` is
   * de werkmap van de app, en de index hieronder liep dan vier mappen diep door
   * de map daarboven (nagemeten: een lege modelcfg vond zo `build\icon.png`
   * van de app zelf).
   */
  if (!modelcfg || !omsiMap || !win32.isAbsolute(modelcfg) || !win32.isAbsolute(omsiMap)) return undefined

  const voertuigmap = dirname(dirname(resolve(modelcfg)))
  const eigen = join(voertuigmap, 'Texture')
  const gedeeld = resolve(omsiMap, 'Texture')

  const gevonden = zoekIn(eigen, delen) ?? zoekIn(gedeeld, delen)
  if (gevonden) return gevonden

  /*
   * De index kijkt vier mappen diep onder de voertuigmap. Alleen als die een
   * map binnen de installatie is: ligt de model.cfg niet in een eigen busmap
   * (maar bijvoorbeeld direct in `Vehicles`), dan zou dat de hele vloot zijn,
   * en buiten de installatie heeft de index niets te zoeken.
   */
  const breed = [resolve(omsiMap), resolve(omsiMap, 'Vehicles')].map((m) => m.toLowerCase())
  if (breed.includes(voertuigmap.toLowerCase()) || !binnen(voertuigmap, omsiMap)) return undefined
  const index = zoekTextuurVan(voertuigmap, omsiMap, delen[delen.length - 1])
  if (!index || !(binnen(index, voertuigmap) || binnen(index, gedeeld)) || !isBestand(index)) return undefined
  const sleutel = `${modelcfg.toLowerCase()}|${naam.toLowerCase()}`
  if (!alGemeld.has(sleutel)) {
    alGemeld.add(sleutel)
    log(`schermtextuur: "${naam}" niet waar OMSI zoekt, wel in de voertuigmap: ${index}`)
  }
  return index
}

/** Grootte en wijzigingstijd, of een teken dat het bestand er niet is. */
function stempel(pad: string): string {
  try {
    const s = statSync(pad)
    return `${s.size}|${s.mtimeMs}`
  } catch {
    return '-1|0'
  }
}

/** De vlaggen in een vaste vorm, zodat dezelfde bedoeling hetzelfde id geeft. */
function schoneVlaggen(vlaggen: Vlaggen): Vlaggen {
  const alfa: 0 | 1 | 2 = vlaggen.alfa === 0 || vlaggen.alfa === 1 ? vlaggen.alfa : 2
  const schoon: Vlaggen = { alfa }
  // Bij alfa 0 tekent OMSI dekkend; een transmap doet dan niets en telt niet mee.
  if (vlaggen.trans && alfa !== 0) schoon.trans = vlaggen.trans
  const u = vlaggen.uit
  if (u && u.length === 4 && u.every(Number.isFinite)) {
    const [x, y, b, h] = u.map(Math.round)
    if (b > 0 && h > 0) schoon.uit = [x, y, b, h]
  }
  return schoon
}

/**
 * Een plaatje met zijn vlaggen, en het id waaronder het naar buiten gaat.
 *
 * Het id is `sha1(pad | grootte | wijzigingstijd | vlaggen | v1)`, de eerste
 * twintig hextekens. Het hangt dus aan de INHOUD: verandert het bestand, dan
 * verandert het id, en daarom mag de browser het voor altijd bewaren
 * (`immutable`). Hetzelfde bestand met andere vlaggen (dekkend of niet, een
 * andere uitsnede) is een ander plaatje en krijgt een ander id. Bij een
 * transmap tellen ook diens grootte en tijd mee. `v1` gaat omhoog als de
 * omzetting zelf verandert, zodat oude kopieën in de browser niet blijven
 * hangen.
 */
export function textuurBron(pad: string, vlaggen: Vlaggen): TextuurBron {
  const schoon = schoneVlaggen(vlaggen)
  const voorHash = {
    alfa: schoon.alfa,
    trans: schoon.trans?.toLowerCase(),
    transStempel: schoon.trans ? stempel(schoon.trans) : undefined,
    uit: schoon.uit
  }
  const sleutel = `${pad.toLowerCase()}|${stempel(pad)}|${JSON.stringify(voorHash)}|v1`
  const id = createHash('sha1').update(sleutel).digest('hex').slice(0, 20)
  return { id, pad, vlaggen: schoon }
}

// ------------------------------------------------------------------ omzetten

/** De maat uit de kop van een JPEG (het eerste SOF-blok), zonder uit te pakken. */
function jpegMaat(b: Buffer): { breedte: number; hoogte: number } | undefined {
  let p = 2
  while (p + 4 <= b.length) {
    if (b[p] !== 0xff) return undefined
    const merk = b[p + 1]
    if (merk === 0xff) {
      p++
      continue
    }
    if (merk === 0xd8 || merk === 0x01 || (merk >= 0xd0 && merk <= 0xd7)) {
      p += 2
      continue
    }
    if (merk === 0xd9 || merk === 0xda) return undefined
    const lengte = b.readUInt16BE(p + 2)
    // SOF0..SOF15, behalve DHT (c4), JPG (c8) en DAC (cc), die in dezelfde reeks liggen.
    if (merk >= 0xc0 && merk <= 0xcf && merk !== 0xc4 && merk !== 0xc8 && merk !== 0xcc) {
      if (p + 9 > b.length) return undefined
      return { hoogte: b.readUInt16BE(p + 5), breedte: b.readUInt16BE(p + 7) }
    }
    p += 2 + lengte
  }
  return undefined
}

/**
 * Heeft deze BMP van 16 bits een alfamasker? Alleen met bitmaskers
 * (`BI_BITFIELDS`, 3, met een kop van 56 bytes of meer; of
 * `BI_ALPHABITFIELDS`, 6), en dan staat het masker op byte 66.
 */
function bmpMetAlfamasker(bytes: Buffer): boolean {
  if (bytes.length < 70 || bytes.readUInt16LE(28) !== 16) return false
  const kop = bytes.readUInt32LE(14)
  const compressie = bytes.readUInt32LE(30)
  if (!((compressie === 3 && kop >= 56) || compressie === 6)) return false
  return bytes.readUInt32LE(66) !== 0
}

/** Beslaat de uitsnede het hele plaatje? Dan hoeft er niets bijgesneden. */
function heelBeeld(uit: [number, number, number, number], breedte: number, hoogte: number): boolean {
  const [x, y, b, h] = uit
  return x <= 0 && y <= 0 && x + b >= breedte && y + h >= hoogte
}

/** Moet er aan een plaatje dat de browser zelf kan lezen toch iets gebeuren? */
function moetIets(v: Vlaggen, breedte: number, hoogte: number, heeftAlfa: boolean, grens: number): boolean {
  if (v.trans) return true
  if (v.uit && !heelBeeld(v.uit, breedte, hoogte)) return true
  if (v.alfa !== 2 && heeftAlfa) return true
  return Math.max(breedte, hoogte) > grens
}

/**
 * Een plaatje lezen voor de browser.
 *
 * `grens` is de langste zijde van wat eruit komt (standaard 2048). Het
 * resultaat is een PNG, of -- als er niets aan hoefde -- het bestand zelf.
 * `undefined` als het niet te lezen is (weg, geen plaatje, verminkt).
 *
 * Wat NIET kan, en dan met een `melding`: een JPEG uitpakken. Een JPEG met een
 * transmap of uitsnede gaat dus ongewijzigd (JPEG heeft nooit alfa, dus bij
 * alfa 0 en 1 hoeft er niets). Onder de bussen is dat nog niet voorgekomen;
 * mocht het nodig worden, dan kan de telefoon de uitsnede ook zelf maken.
 *
 * Wat ook blijft zoals het is: een kleurprofiel in een JPEG of PNG. Chromium
 * rekent de kleuren daarmee om, Direct3D niet. Nageteld onder `Vehicles` en
 * `Texture`: 436 JPEG's en 54 PNG's dragen een sRGB-profiel (dan verandert er
 * niets), en zeven een Adobe RGB-profiel: een vliegtuig, drie keer een
 * akker, stof, en `20.jpg` van interieur en dashboard van de `MB_O530` --
 * geen scherm. Er staan geen JPEG's met een gedraaide EXIF-stand tussen (605
 * keer stand 1, geen andere).
 */
export function beeldVoorBrowser(bron: TextuurBron, grens = TEXTUURGRENS): Geleverd | undefined {
  if (!PLAATJES.has(extname(bron.pad).toLowerCase())) return undefined
  let bytes: Buffer
  try {
    bytes = readFileSync(bron.pad)
  } catch {
    return undefined
  }
  const v = schoneVlaggen(bron.vlaggen)
  const lezing = ontleedTextuur(bytes)

  if (lezing.soort === 'jpg') {
    const maat = jpegMaat(bytes)
    const niet: string[] = []
    if (v.trans) niet.push('transmap')
    if (v.uit && !(maat && heelBeeld(v.uit, maat.breedte, maat.hoogte))) niet.push('uitsnede')
    if (maat && Math.max(maat.breedte, maat.hoogte) > grens) niet.push('verkleinen')
    return {
      bytes,
      type: 'image/jpeg',
      melding: niet.length ? `JPEG niet uit te pakken; ${niet.join(', ')} niet toegepast` : undefined
    }
  }

  if (lezing.soort === 'png') {
    const kop = pngKop(bytes)
    if (kop && !moetIets(v, kop.breedte, kop.hoogte, kop.alfa, grens)) return { bytes, type: 'image/png' }
    const textuur = leesPng(bytes)
    if (!textuur) return { bytes, type: 'image/png', melding: 'PNG niet uit te pakken; ongewijzigd geleverd' }
    return bewerk(textuur, v, grens)
  }

  if (lezing.soort === 'bmp') {
    /*
     * Een BMP zonder alfa gaat ongewijzigd, als er verder niets aan hoeft. Een
     * van 32 bits gaat altijd door `pakBmpUit`, want wat de vierde byte is moet
     * hier vaststaan en niet in Chromium; net zo een van 16 bits met een
     * alfamasker in de kop (A1R5G5B5, kop van 56 bytes of meer): die zou
     * Chromium doorzichtig tekenen waar OMSI bij `[matl_alpha]` 0 dekkend
     * tekent. (Onder `Vehicles` en `Texture` hebben de dertien 16-bits BMP's
     * met zo'n kop allemaal een alfamasker 0; het gaat om de volgende.)
     */
    const bits = bytes.length >= 34 ? bytes.readUInt16LE(28) : 0
    const breedte = bytes.length >= 26 ? bytes.readInt32LE(18) : 0
    const hoogte = bytes.length >= 26 ? Math.abs(bytes.readInt32LE(22)) : 0
    if (bits > 0 && bits <= 24 && !bmpMetAlfamasker(bytes) && !moetIets(v, breedte, hoogte, false, grens)) {
      return { bytes, type: 'image/bmp' }
    }
    const textuur = pakBmpUit(bytes)
    if (!textuur) {
      return { bytes, type: 'image/bmp', melding: 'BMP-variant niet uit te pakken; ongewijzigd geleverd' }
    }
    return bewerk(textuur, v, grens)
  }

  // DDS en TGA: de browser kan ze niet, dus altijd uitgepakt.
  if (!lezing.textuur) return undefined
  return bewerk(lezing.textuur, v, grens)
}

/**
 * De vlaggen toepassen op uitgepakte pixels en er een PNG van maken.
 *
 * DE VOLGORDE TELT
 * 1. de transmap, op de volle maat van de textuur (dezelfde uv's);
 * 2. bijsnijden, zodat de rest over zo min mogelijk pixels gaat;
 * 3. dekkend maken (alfa 0) VÓÓR het verkleinen, anders weegt het gemiddelde
 *    de kleur nog naar een alfa die OMSI niet gebruikt;
 * 4. verkleinen;
 * 5. de alfatest (alfa 1) NÁ het verkleinen, zoals Direct3D de drempel legt op
 *    wat het uit de textuur bemonstert. Andersom maakt het gemiddelde van de
 *    randen weer halfdoorzichtig wat alleen 0 of 255 mag zijn: een textuur van
 *    4096 breed met om en om alfa 0 en 255 kwam zo overal op 128 uit, en de
 *    browser mengt dan waar OMSI knipt (scratchpad `bouw-plaatjes-tegen`).
 */
function bewerk(textuur: Textuur, v: Vlaggen, grens: number): Geleverd | undefined {
  let melding: string | undefined
  let t = textuur
  if (v.trans && !zetTransmap(t, v.trans)) melding = 'transmap niet te lezen; eigen alfa gebruikt'

  if (v.uit && !heelBeeld(v.uit, t.breedte, t.hoogte)) {
    const gesneden = snij(t, v.uit)
    // Een uitsnede naast het plaatje: liever niets dan een verschoven beeld.
    if (!gesneden) return undefined
    t = gesneden
  }

  if (v.alfa === 0) {
    const px = t.pixels
    for (let i = 3; i < px.length; i += 4) px[i] = 255
  }
  t = verkleinGemiddeld(t, grens)
  if (v.alfa === 1) {
    const px = t.pixels
    for (let i = 3; i < px.length; i += 4) px[i] = px[i] >= 128 ? 255 : 0
  }
  return { bytes: pngVan(t.breedte, t.hoogte, t.pixels), type: 'image/png', melding }
}

/**
 * De alfa van `textuur` vervangen door die van de transmap.
 *
 * WELK KANAAL
 * De alfa van de transmap, niet het rood. Nagemeten over alle transmaps met
 * een bestandsnaam die er werkelijk liggen: onder `Vehicles` 81, waarvan 48
 * met een rood dat overal gelijk is en een alfa die verschilt (bv.
 * `Opel_Manta_B\Texture\manta_b_t.tga`: grijs 255, alfa in 78 waarden), 25
 * waarin beide verschillen, en géén enkele met een verschillend rood en een
 * alfa die overal 255 is. Onder `Sceneryobjects` en `Splines` 11, alle elf met
 * rood vast en alfa verschillend -- en één daarvan is een A8-DDS
 * (`park_6B_trans.dds`), die helemaal geen kleur heeft. Wie het rood zou nemen,
 * maakt van die ramen een egaal vlak. (Zeven bij `MAN_SL_SG` hebben overal alfa
 * 0; dat zijn kleurstellingstexturen die het spel eerst vervangt.)
 *
 * Een transmap zonder alfakanaal (24-bits BMP, JPEG, DXT1 zonder
 * doorzichtige blokken) geeft zo overal 255: dekkend, net als in Direct3D.
 * Een JPEG hoeft daarvoor niet eens uitgepakt te worden. Heeft de transmap
 * een andere maat, dan wordt hij naar de maat van de textuur bemonsterd
 * (dichtstbijzijnde pixel), zoals Direct3D dat met dezelfde uv's zou doen.
 */
function zetTransmap(textuur: Textuur, pad: string): boolean {
  if (!PLAATJES.has(extname(pad).toLowerCase())) return false
  let bytes: Buffer
  try {
    bytes = readFileSync(pad)
  } catch {
    return false
  }
  const lezing = ontleedTextuur(bytes)
  const px = textuur.pixels
  if (lezing.soort === 'jpg') {
    for (let i = 3; i < px.length; i += 4) px[i] = 255
    return true
  }
  const kaart =
    lezing.textuur ??
    (lezing.soort === 'bmp' ? pakBmpUit(bytes) : lezing.soort === 'png' ? leesPng(bytes) : undefined)
  if (!kaart) return false

  const { breedte, hoogte } = textuur
  if (kaart.breedte === breedte && kaart.hoogte === hoogte) {
    for (let i = 3; i < px.length; i += 4) px[i] = kaart.pixels[i]
    return true
  }
  const kolom = new Uint32Array(breedte)
  for (let x = 0; x < breedte; x++) kolom[x] = Math.min(kaart.breedte - 1, Math.floor(((x + 0.5) * kaart.breedte) / breedte))
  for (let y = 0; y < hoogte; y++) {
    const rij = Math.min(kaart.hoogte - 1, Math.floor(((y + 0.5) * kaart.hoogte) / hoogte)) * kaart.breedte
    for (let x = 0; x < breedte; x++) px[(y * breedte + x) * 4 + 3] = kaart.pixels[(rij + kolom[x]) * 4 + 3]
  }
  return true
}

/** Bijsnijden, begrensd tot het plaatje; `undefined` als er niets overblijft. */
function snij(t: Textuur, uit: [number, number, number, number]): Textuur | undefined {
  const x0 = Math.max(0, uit[0])
  const y0 = Math.max(0, uit[1])
  const x1 = Math.min(t.breedte, uit[0] + uit[2])
  const y1 = Math.min(t.hoogte, uit[1] + uit[3])
  if (x1 <= x0 || y1 <= y0) return undefined
  const breedte = x1 - x0
  const hoogte = y1 - y0
  const pixels = new Uint8Array(breedte * hoogte * 4)
  for (let y = 0; y < hoogte; y++) {
    const van = ((y0 + y) * t.breedte + x0) * 4
    pixels.set(t.pixels.subarray(van, van + breedte * 4), y * breedte * 4)
  }
  return { breedte, hoogte, pixels }
}
