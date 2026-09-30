import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import iconv from 'iconv-lite'
import { modelVanBus, zoekTextuurVan } from './busmodel'
import { cfgRegels } from './schermcfg'

/**
 * De kleurstellingen van een bus: wat OMSI "Appearance" noemt.
 *
 * HOE OMSI HET DOET
 * In `model.cfg` wijst `[CTC]` naar een map en noemt de variabele die de keuze
 * draagt -- bijna altijd `Colorscheme` -- en `[CTCTexture]` koppelt een naam
 * aan de textuur die daar standaard ligt, zoals `Farbschema_12C_2door` aan
 * `12C_2d_01.dds`. In de map staan `.cti`-bestanden. Elk `[item]` zegt: in
 * kleurstelling "OVPS (M-AN 9228)" komt op plek `Farbschema_12C_2door` het
 * bestand `OVPS\12C_2d_OVPS.dds`. Een `[setvar]` zet voor de kleurstelling
 * erboven een scriptvariabele, bijvoorbeeld welke spiegels de bus heeft.
 *
 * WELK NUMMER
 * De keuze staat als volgnummer in die variabele, en dat nummer telt in de
 * volgorde waarin de kleurstellingen in de bestanden verschijnen: bestanden op
 * naam zoals Windows ze geeft, en binnen een bestand van boven naar beneden, elke
 * naam één keer. Het keuzevenster van OMSI toont ze alfabetisch, maar telt niet
 * zo.
 *
 * ZES REGELS, NAGELEZEN IN OMSI.EXE (Lakstudio L0, design/ontwerpen/lakstudio.md §10)
 * De lader staat op 0x5F0C16-0x5F13FB; de cfg-kant op 0x5F02D8 ([CTC]) en
 * 0x5F0509 ([CTCTexture]).
 *  1. Een kop telt alleen als de hele regel precies `[item]`, `[setvar]`,
 *     `[CTC]` of `[CTCTexture]` is (_LStrEqual, zonder trim en
 *     hoofdlettergevoelig). In de installatie staan 115 ingesprongen
 *     '\t[item]' in 95 .cti's (vaak het voorbeeld "Name des Items" in een
 *     sjabloon) en 71 ingesprongen '\t[CTC]'/'\t[CTCTexture]' in 37 cfg's: voor
 *     OMSI commentaar. Voorheen telde de app dat voorbeeld mee, en was bij de
 *     SD80 elk nummer één te hoog: de bus reed in OMSI in de kleurstelling
 *     erboven. Na een kop leest OMSI een vast aantal regels (item 3, setvar 2,
 *     CTC 3, CTCTexture 2), wat er ook staat.
 *  2. Eerst de plek, dan de naam: een `[item]` telt alleen als zijn plek in de
 *     [CTCTexture]'s van DEZE cfg staat (0x5F0E93); pas dan wordt de naam
 *     opgezocht of aangemaakt (0x5F0EC2/0x5F0F06). Een naam die alleen op
 *     plekken van een andere bus staat, bestaat voor deze bus dus niet -- en
 *     schuift de nummers niet op. Voorheen telde elke naam; met regel 1 samen
 *     gaven 34 cfg's een ander nummer dan OMSI.
 *  3. Een `[setvar]` hoort bij het laatst AANGENOMEN item (de toestand op
 *     ebp-0x440 wordt alleen op 0x5F0EC7/0x5F0F09 gezet), ook over de grens van
 *     een bestand heen. Een setvar na een item met een vreemde plek gaat dus naar
 *     de kleurstelling daarvoor: in Zorbig_Halle.cti (Kajosoft) staat een item
 *     "Silver" op de plek "Zorbig Halle", en de 28 setvars erna zijn van
 *     "Zorbig Halle", niet van "Silver". Vóór het eerste aangenomen item is de
 *     toestand niet bepaald; die setvars laten we vallen (in de installatie: 0).
 *  4. Plek, naam en setvar-variabele worden vergeleken na UpperCase van alleen
 *     a-z (0x421374, via 0x7F633C en 0x7F6410): "braungold" en "Braungold" zijn
 *     één kleurstelling (de CG2 met HHA12.cti: 19 kleurstellingen, niet 20), en
 *     `farbschema_innenraum` vindt `Farbschema_Innenraum` (NL263 Havelbus.cti,
 *     SL_SG RVH.cti en BBG.cti). ä en Ä blijven verschillend. De eerste spelling
 *     van een naam blijft staan.
 *  5. Niets wordt getrimd: " silber" (de HH20, 3T.cti) heet zo, met spatie; 43
 *     namen in 14 .cti's hebben een spatie ervoor of erna. Een setvar-variabele als
 *     "cg_kinderwagen " (Kajosoft) bestaat in de scripts niet, en OMSI slaat hem
 *     over; voorheen maakte de app er cg_kinderwagen van en zette die wél.
 *  6. De CTC-map hangt aan de map van de .bus, niet aan dirname(dirname(cfg))
 *     (0x5F0C3A: `[eax+2Ch]` + map + '\*.cti'). De KI-C2's hebben hun cfg in
 *     `model\KI\` en noemen `Texture\Repaints\rep_GN`: die map bestaat alleen
 *     vanaf de busmap (36 van de 41 .bus/.ovh met een diepere cfg).
 * Verder:
 *  - Een cfg kan meer dan één [CTC] hebben; elke [CTCTexture] hoort bij de [CTC]
 *    erboven. Hier telt de eerste: in alle 13 cfg's met twee is dat die van de
 *    kleurstelling (MAN LC: Colorscheme en daarna cp_VDVdisplay_Brightness; de
 *    fietsers: fiets en fietser; de Urbanway-aanhanger: twee keer dezelfde).
 *    Voorheen won de laatste: de MAN LC's toonden de helderheid van hun
 *    VDV-scherm ("Monitor") als enige kleurstelling, en de Krefrath- en
 *    MVG-uitvoering krijgen nu hun 3 en 8 echte. (Die van MAN_LC_GUE heeft er
 *    geen: zijn `Texture\Werbung` is leeg.)
 *  - Een .cti leest OMSI met Readln: bytes als ANSI, een regel eindigt op LF en
 *    een losse CR valt weg (0x405AD8). Een cfg gaat door TStringList: CR, LF en
 *    CRLF breken allemaal een regel (core/schermcfg.ts).
 *  - Een setvar-waarde gaat door StrToFloat (0x5F130D), met een punt.
 *  - Niet nagebootst, want onzichtbaar voor de app: OMSI slaat een [CTC] met een
 *    variabele die de bus niet kent over, en een setvar ook. `Colorscheme` staat
 *    bij 719 van de 734 bussen niet in de varlists: OMSI kent hem zelf.
 *
 * NAGEMETEN (scripts/probe-kleurstelling.ts)
 * - Een los geschreven lezer (scripts/probe-kleurstelling.py) over alle 1198
 *   .bus/.ovh/.sco onder Vehicles: 647 met kleurstellingen, 458 cfg's per
 *   busmap, 0 verschillen in naam, nummer, variabele, map en setvars. Hij neemt
 *   de .cti's in de volgorde van de schijf; `opNaam` hieronder geeft dus
 *   dezelfde volgorde.
 * - De .osn's die OMSI zelf wegschreef (alle scriptvariabelen erin): bij Kajosoft
 *   "Berlin" (32 setvars) en "Bremen" (26) wijst het nummer de kleurstelling aan
 *   waarvan elke setvar in de .osn staat. Die voertuigen raken geen van de
 *   gevallen hierboven; de oude lezer telde ze net zo. P10 in OMSI toetst de rest.
 * - Tegen de oude lezer (8e8c27a): van de 254 lijsten (per busmap) zijn er 161
 *   anders. KI-auto's en geparkeerde wagens telden het ingesprongen voorbeeld
 *   uit een sjabloon mee ("Name des Items ..."), de KI-C2's vinden hun map nu,
 *   HHA12, de MAN LC's, en bussen waar een item op een plek die de cfg niet
 *   kent geen textuur meer meegeeft: de O530 met 3 deuren had de lak van de
 *   tweedeurs erbij, en de kleurstalen kozen daar hun plek uit.
 *
 * In deze installatie: 994 .cti's met 6379 [item]- en 21746 [setvar]-koppen;
 * 550 cfg's met een [CTC].
 */
export interface Kleurstelling {
  /** Het nummer dat OMSI in de variabele zet. */
  index: number
  /** Zoals OMSI hem kent: ongetrimd, in de spelling van het eerste item. */
  naam: string
  /** Per plek (de naam uit [CTCTexture], in de spelling van de cfg) het volledige pad van de textuur. */
  texturen: Record<string, string>
  /** Wat deze kleurstelling in de scripts zet; de variabele in de spelling van de eerste setvar. */
  setvars: Record<string, number>
}

export interface Kleurstellingen {
  /** De scriptvariabele die het nummer draagt. */
  variabele: string
  /** Waar de `.cti`-bestanden staan. */
  map: string
  /** Per plek de textuur die er standaard ligt, zoals in [CTCTexture]. */
  plekken: Record<string, string>
  /** In OMSI's eigen volgorde; zie de kop. */
  lijst: Kleurstelling[]
}

/**
 * Zoals Omsi.exe vergelijkt (0x421374): alleen a-z worden hoofdletters. Niet
 * `toUpperCase`: dat maakt van ä een Ä en van ß "SS", en OMSI niet.
 */
export function omsiHoofdletters(tekst: string): string {
  return tekst.replace(/[a-z]+/g, (s) => s.toUpperCase())
}

/**
 * Een kleurstelling op naam, zoals OMSI ze gelijk vindt: na `omsiHoofdletters`
 * en zonder te trimmen.
 *
 * De terugval: tot L0 las de app de namen getrimd, en die staan zo in de
 * profielen ("silber" voor " silber"). Vindt de naam niets, dan wordt het op
 * beide kanten getrimd nog eens geprobeerd; `terugval` zegt dat het zo ging.
 */
export function zoekKleurstelling(
  info: Kleurstellingen | undefined,
  naam: string | undefined
): (Kleurstelling & { terugval?: true }) | undefined {
  if (!info || naam === undefined) return undefined
  const sleutel = omsiHoofdletters(naam)
  const precies = info.lijst.find((k) => omsiHoofdletters(k.naam) === sleutel)
  if (precies) return precies
  const kaal = omsiHoofdletters(naam.trim())
  const oud = info.lijst.find((k) => omsiHoofdletters(k.naam.trim()) === kaal)
  return oud ? { ...oud, terugval: true } : undefined
}

/**
 * De map van de .bus bij een cfg, voor wie alleen de cfg heeft (het scherm van
 * een apparaat): de map direct onder `Vehicles` (of `Sceneryobjects`). Daar ligt
 * elke bestuurbare bus; de cfg ligt soms dieper (`model\KI\`). Van de 1200
 * .bus/.ovh/.sco bij Luc liggen er 60 zelf dieper (KI-auto's, geparkeerde
 * wagens): wie de .bus heeft, geeft dus `dirname(busPad)`. Zonder `Vehicles`
 * erboven de oude aanname, twee mappen boven de cfg.
 */
export function busmapBijCfg(modelcfg: string): string {
  let hier = dirname(modelcfg)
  for (let i = 0; i < 8; i++) {
    const boven = dirname(hier)
    if (boven === hier) break
    if (/^(vehicles|sceneryobjects)$/i.test(basename(boven))) return hier
    hier = boven
  }
  return dirname(dirname(modelcfg))
}

/** Zoals NTFS een map opsomt: op hoofdletters, teken voor teken. Gemeten: gelijk aan readdir in alle 131 CTC-mappen. */
function opNaam(a: string, b: string): number {
  const x = a.toUpperCase()
  const y = b.toUpperCase()
  return x < y ? -1 : x > y ? 1 : 0
}

/**
 * Het geheugen per `model.cfg` en busmap, met een vingerafdruk van alles waar de
 * uitkomst van afhangt: de cfg, de CTC-map (een .cti erbij of eraf) en elk
 * .cti-bestand (grootte en tijd). Klopt die niet meer, dan opnieuw lezen.
 *
 * Voorheen bleef een uitkomst voor altijd staan, per draad: een repaint die erbij
 * kwam terwijl de app open stond, zag de werker 'bus3d' niet (de lak gaf geen
 * vars en geen texturen) terwijl de controle het pakket wel verouderd noemde, en
 * main (`kleurVars`) kon een ander nummer geven dan de werker (aanvalsverslag
 * Bus3D F1, punt 9c). Nu lezen alle draden na een wijziging hetzelfde.
 *
 * De afdruk kost een `stat` van de cfg, een `readdir` van de CTC-map en een
 * `stat` per .cti: gemeten over alle 131 CTC-mappen gemiddeld 1,4 ms, hooguit
 * 8 ms (40 .cti's), tegen 3,6 s om alles opnieuw te lezen.
 *
 * Hooguit `MAX_BEWAARD` modellen; de langst niet gebruikte gaat eerst weg.
 */
interface Bewaard {
  vinger: string
  map?: string
  uitkomst: Kleurstellingen | undefined
}
const perModel = new Map<string, Bewaard>()
const MAX_BEWAARD = 32

function stempel(pad: string): string {
  try {
    const st = statSync(pad)
    return `${st.size}:${st.mtimeMs}`
  } catch {
    return '-'
  }
}

/** De .cti-bestanden van een CTC-map in de volgorde van OMSI, of `undefined` als de map er niet is. */
function ctiBestanden(map: string): string[] | undefined {
  try {
    return readdirSync(map)
      .filter((naam) => naam.toLowerCase().endsWith('.cti'))
      .sort(opNaam)
  } catch {
    return undefined
  }
}

function vingerafdruk(cfgStempel: string, map: string | undefined, bestanden: string[] | undefined): string {
  if (!map) return cfgStempel
  if (!bestanden) return `${cfgStempel}|geen map`
  return `${cfgStempel}|${bestanden.map((naam) => `${naam}=${stempel(join(map, naam))}`).join('|')}`
}

/**
 * De kleurstellingen die bij een `model.cfg` horen, of niets als hij er geen
 * heeft. `busmap` is de map van de .bus (regel 6); wie alleen de cfg heeft,
 * geeft `busmapBijCfg(modelcfg)`.
 */
export function leesKleurstellingen(modelcfg: string, busmap: string): Kleurstellingen | undefined {
  const sleutel = `${busmap.toLowerCase()}|${modelcfg.toLowerCase()}`
  const bekend = perModel.get(sleutel)
  if (bekend) {
    const nu = vingerafdruk(stempel(modelcfg), bekend.map, bekend.map ? ctiBestanden(bekend.map) : undefined)
    if (nu === bekend.vinger) {
      // Achteraan zetten: de langst niet gebruikte staat vooraan.
      perModel.delete(sleutel)
      perModel.set(sleutel, bekend)
      return bekend.uitkomst
    }
  }
  const gelezen = lees(modelcfg, busmap)
  perModel.delete(sleutel)
  perModel.set(sleutel, gelezen)
  while (perModel.size > MAX_BEWAARD) perModel.delete(perModel.keys().next().value!)
  return gelezen.uitkomst
}

/** Hetzelfde, vanaf het `.bus`-bestand. */
export function kleurstellingenVanBus(busPad: string): Kleurstellingen | undefined {
  const modelcfg = modelVanBus(busPad)
  return modelcfg ? leesKleurstellingen(modelcfg, dirname(busPad)) : undefined
}

/** Eén `[CTC]` van een cfg met de [CTCTexture]'s eronder, zoals ze er staan. */
interface CtcBlok {
  variabele: string
  map: string
  /** [plek, standaardtextuur] in de volgorde van de cfg. */
  plekken: Array<[string, string]>
}

/** De [CTC]-blokken van een cfg, zoals de lader van Omsi.exe ze opbouwt (regels 1 en 5). */
export function ctcBlokken(regels: string[]): CtcBlok[] {
  const blokken: CtcBlok[] = []
  for (let i = 0; i < regels.length; i++) {
    if (regels[i] === '[CTC]') {
      // Variabele, map, en een getal dat de lader niet gebruikt.
      blokken.push({ variabele: regels[i + 1] ?? '', map: regels[i + 2] ?? '', plekken: [] })
      i += 3
    } else if (regels[i] === '[CTCTexture]') {
      // Hoort bij de laatste [CTC]; zonder [CTC] ervoor laat OMSI hem liggen (0x5F059C).
      blokken.at(-1)?.plekken.push([regels[i + 1] ?? '', regels[i + 2] ?? ''])
      i += 2
    }
  }
  return blokken
}

/** Een .cti zoals Readln hem leest: bytes als ANSI, een regel eindigt op LF, een losse CR valt weg. */
function ctiRegels(pad: string): string[] {
  return iconv
    .decode(readFileSync(pad), 'win1252')
    .split('\n')
    .map((regel) => regel.replace(/\r/g, ''))
}

/** StrToFloat met een punt: spaties eromheen mogen, verder alleen een getal. */
function omsiGetal(tekst: string): number | undefined {
  if (!/^ *[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)? *$/.test(tekst)) return undefined
  const waarde = Number(tekst.trim())
  return Number.isFinite(waarde) ? waarde : undefined
}

/** `<OMSI>` boven een busmap: de ouder van `Vehicles`, anders twee mappen hoger. */
function omsimapBij(busmap: string): string {
  let hier = busmap
  for (let i = 0; i < 8; i++) {
    const boven = dirname(hier)
    if (boven === hier) break
    if (/^(vehicles|sceneryobjects)$/i.test(basename(hier))) return boven
    hier = boven
  }
  return dirname(dirname(busmap))
}

/**
 * Lezen, met de vingerafdruk erbij. De stempels worden genomen VÓÓR de bestanden
 * gelezen worden: verandert er tijdens het lezen iets, dan klopt de afdruk de
 * volgende keer niet en wordt er opnieuw gelezen -- nooit andersom.
 */
function lees(modelcfg: string, busmap: string): Bewaard {
  const cfgStempel = stempel(modelcfg)
  let regels: string[]
  try {
    regels = cfgRegels(modelcfg)
  } catch {
    return { vinger: vingerafdruk(cfgStempel, undefined, undefined), uitkomst: undefined }
  }

  // De eerste [CTC]; zie de kop. Een lege variabele kent geen bus.
  const ctc = ctcBlokken(regels)[0]
  if (!ctc || !ctc.variabele) return { vinger: vingerafdruk(cfgStempel, undefined, undefined), uitkomst: undefined }
  // Busmap + map + '\*.cti' (regel 6). Een lege regel is de busmap zelf, net als bij OMSI.
  const map = join(busmap, ...ctc.map.split(/[\\/]/).filter(Boolean))
  const variabele = ctc.variabele

  const plekken: Record<string, string> = {}
  /** Op OMSI-hoofdletters naar de spelling van de cfg; de eerste wint, zoals de zoeker van OMSI (0x7F633C). */
  const plekOp = new Map<string, string>()
  for (const [plek, standaard] of ctc.plekken) {
    const h = omsiHoofdletters(plek)
    if (plekOp.has(h)) continue
    plekOp.set(h, plek)
    plekken[plek] = standaard
  }

  const bestanden = ctiBestanden(map)
  const vinger = vingerafdruk(cfgStempel, map, bestanden)
  if (!bestanden) return { vinger, map, uitkomst: undefined }

  const omsimap = omsimapBij(busmap)
  const vind = (rel: string): string | undefined => {
    // OMSI opent busmap + map + '\' + regel 3; Windows laat spaties achteraan een naam weg.
    const delen = rel.replace(/ +$/, '').split(/[\\/]/).filter(Boolean)
    if (delen.length === 0) return undefined
    const direct = join(map, ...delen)
    if (existsSync(direct)) return direct
    return zoekTextuurVan(busmap, omsimap, rel.trim())
  }

  const lijst: Kleurstelling[] = []
  const opNaamGevonden = new Map<string, Kleurstelling>()
  /** Per kleurstelling: setvar-variabele op OMSI-hoofdletters naar de eerste spelling. */
  const spelling = new Map<Kleurstelling, Map<string, string>>()
  // Regel 3: de toestand loopt door over de bestanden heen.
  let huidige: Kleurstelling | undefined
  for (const bestand of bestanden) {
    let inhoud: string[]
    try {
      inhoud = ctiRegels(join(map, bestand))
    } catch {
      continue
    }
    for (let i = 0; i < inhoud.length; i++) {
      if (inhoud[i] === '[item]') {
        const naam = inhoud[i + 1] ?? ''
        const plek = plekOp.get(omsiHoofdletters(inhoud[i + 2] ?? ''))
        const rel = inhoud[i + 3] ?? ''
        i += 3
        if (plek === undefined) continue
        const h = omsiHoofdletters(naam)
        huidige = opNaamGevonden.get(h)
        if (!huidige) {
          huidige = { index: lijst.length, naam, texturen: {}, setvars: {} }
          lijst.push(huidige)
          opNaamGevonden.set(h, huidige)
        }
        // Een later item voor dezelfde plek wint, ook als zijn bestand ontbreekt: dan niet het vorige.
        const pad = vind(rel)
        if (pad) huidige.texturen[plek] = pad
        else delete huidige.texturen[plek]
      } else if (inhoud[i] === '[setvar]') {
        const naam = inhoud[i + 1] ?? ''
        const waarde = omsiGetal(inhoud[i + 2] ?? '')
        i += 2
        if (!huidige || waarde === undefined) continue
        let bekend = spelling.get(huidige)
        if (!bekend) spelling.set(huidige, (bekend = new Map()))
        const h = omsiHoofdletters(naam)
        const sleutel = bekend.get(h) ?? naam
        bekend.set(h, sleutel)
        // Dezelfde variabele twee keer: OMSI zet ze na elkaar, de laatste blijft.
        huidige.setvars[sleutel] = waarde
      }
    }
  }

  if (lijst.length === 0) return { vinger, map, uitkomst: undefined }
  return { vinger, map, uitkomst: { variabele, map, plekken, lijst } }
}

/**
 * Welke texturen er in deze kleurstelling anders zijn, als tabel voor de
 * tekenaar: de standaardnaam en wat ervoor in de plaats komt.
 *
 * De sleutel is de naam zonder map en zonder extensie, in kleine letters. Het
 * o3d-bestand en [CTCTexture] noemen dezelfde textuur weleens met een andere
 * extensie (`.bmp` tegen `.dds`); zonder extensie vinden ze elkaar toch.
 */
export function vervangingen(
  info: Kleurstellingen,
  kleurstelling: Kleurstelling
): Map<string, string> {
  const uit = new Map<string, string>()
  for (const [plek, pad] of Object.entries(kleurstelling.texturen)) {
    const standaard = info.plekken[plek]
    if (standaard) uit.set(textuurSleutel(standaard), pad)
  }
  return uit
}

/** Zie `vervangingen`: naam zonder map en extensie, in kleine letters. */
export function textuurSleutel(naam: string): string {
  const plat = (naam.split(/[\\/]/).pop() ?? naam).toLowerCase()
  const punt = plat.lastIndexOf('.')
  return punt > 0 ? plat.slice(0, punt) : plat
}
