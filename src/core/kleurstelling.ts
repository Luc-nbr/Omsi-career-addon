import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { modelVanBus, zoekTextuurVan } from './busmodel'
import { readOmsiLines } from './omsiFile'

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
 * zo. Nagemeten aan de laststn.osn die OMSI zelf wegschreef: op Thüringer Wald
 * stond `Colorscheme` op 0, en in deze telling is dat "OVR neutral" met alle 20
 * [setvar]-waarden gelijk aan wat OMSI opsloeg; alfabetisch zou het "OVR Moebel
 * Schuetze" zijn, en daarvan klopt er één niet.
 *
 * In deze installatie: 1038 `.cti`-bestanden, 6427 `[item]`- en 22701
 * `[setvar]`-regels, en geen andere koppen.
 */
export interface Kleurstelling {
  /** Het nummer dat OMSI in de variabele zet. */
  index: number
  naam: string
  /** Per plek (de naam uit [CTCTexture]) het volledige pad van de textuur. */
  texturen: Record<string, string>
  /** Wat deze kleurstelling in de scripts zet. */
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

/** Zoals NTFS een map opsomt: op hoofdletters, teken voor teken. */
function opNaam(a: string, b: string): number {
  const x = a.toUpperCase()
  const y = b.toUpperCase()
  return x < y ? -1 : x > y ? 1 : 0
}

/**
 * Het geheugen per `model.cfg`, met een vingerafdruk van alles waar de uitkomst
 * van afhangt: de cfg, de CTC-map (een .cti erbij of eraf) en elk .cti-bestand
 * (grootte en tijd). Klopt die niet meer, dan opnieuw lezen.
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

/** De kleurstellingen die bij een `model.cfg` horen, of niets als hij er geen heeft. */
export function leesKleurstellingen(modelcfg: string): Kleurstellingen | undefined {
  const bekend = perModel.get(modelcfg)
  if (bekend) {
    const nu = vingerafdruk(stempel(modelcfg), bekend.map, bekend.map ? ctiBestanden(bekend.map) : undefined)
    if (nu === bekend.vinger) {
      // Achteraan zetten: de langst niet gebruikte staat vooraan.
      perModel.delete(modelcfg)
      perModel.set(modelcfg, bekend)
      return bekend.uitkomst
    }
  }
  const gelezen = lees(modelcfg)
  perModel.delete(modelcfg)
  perModel.set(modelcfg, gelezen)
  while (perModel.size > MAX_BEWAARD) perModel.delete(perModel.keys().next().value!)
  return gelezen.uitkomst
}

/** Hetzelfde, vanaf het `.bus`-bestand. */
export function kleurstellingenVanBus(busPad: string): Kleurstellingen | undefined {
  const modelcfg = modelVanBus(busPad)
  return modelcfg ? leesKleurstellingen(modelcfg) : undefined
}

/**
 * Lezen, met de vingerafdruk erbij. De stempels worden genomen VÓÓR de bestanden
 * gelezen worden: verandert er tijdens het lezen iets, dan klopt de afdruk de
 * volgende keer niet en wordt er opnieuw gelezen -- nooit andersom.
 */
function lees(modelcfg: string): Bewaard {
  const cfgStempel = stempel(modelcfg)
  let regels: string[]
  try {
    regels = readOmsiLines(modelcfg)
  } catch {
    return { vinger: vingerafdruk(cfgStempel, undefined, undefined), uitkomst: undefined }
  }

  const modelmap = dirname(modelcfg)
  const voertuigmap = dirname(modelmap)
  const omsimap = dirname(dirname(voertuigmap))

  let variabele: string | undefined
  let map: string | undefined
  const plekken: Record<string, string> = {}
  for (let i = 0; i < regels.length; i++) {
    const kop = regels[i].trim().toLowerCase()
    if (kop === '[ctc]') {
      variabele = (regels[i + 1] ?? '').trim()
      const rel = (regels[i + 2] ?? '').trim()
      if (rel) map = join(voertuigmap, ...rel.split(/[\\/]/).filter(Boolean))
    } else if (kop === '[ctctexture]') {
      const plek = (regels[i + 1] ?? '').trim()
      const standaard = (regels[i + 2] ?? '').trim()
      if (plek && standaard) plekken[plek] = standaard
    }
  }
  if (!variabele || !map) return { vinger: vingerafdruk(cfgStempel, undefined, undefined), uitkomst: undefined }
  const bestanden = ctiBestanden(map)
  const vinger = vingerafdruk(cfgStempel, map, bestanden)
  if (!bestanden) return { vinger, map, uitkomst: undefined }

  const lijst: Kleurstelling[] = []
  const opNaamGevonden = new Map<string, Kleurstelling>()
  const ctcMap = map
  const vind = (rel: string): string | undefined => {
    const direct = join(ctcMap, ...rel.split(/[\\/]/).filter(Boolean))
    if (existsSync(direct)) return direct
    return zoekTextuurVan(voertuigmap, omsimap, rel)
  }

  for (const bestand of bestanden) {
    let inhoud: string[]
    try {
      inhoud = readOmsiLines(join(map, bestand))
    } catch {
      continue
    }
    let huidige: Kleurstelling | undefined
    for (let i = 0; i < inhoud.length; i++) {
      const kop = inhoud[i].trim().toLowerCase()
      if (kop === '[item]') {
        const naam = (inhoud[i + 1] ?? '').trim()
        const plek = (inhoud[i + 2] ?? '').trim()
        const rel = (inhoud[i + 3] ?? '').trim()
        if (!naam) continue
        huidige = opNaamGevonden.get(naam)
        if (!huidige) {
          huidige = { index: lijst.length, naam, texturen: {}, setvars: {} }
          lijst.push(huidige)
          opNaamGevonden.set(naam, huidige)
        }
        if (plek && rel) {
          const pad = vind(rel)
          if (pad) huidige.texturen[plek] = pad
        }
      } else if (kop === '[setvar]' && huidige) {
        const naam = (inhoud[i + 1] ?? '').trim()
        const waarde = Number((inhoud[i + 2] ?? '').trim())
        if (naam && Number.isFinite(waarde)) huidige.setvars[naam] = waarde
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
