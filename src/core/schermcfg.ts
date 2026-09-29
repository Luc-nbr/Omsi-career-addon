import { readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import iconv from 'iconv-lite'

/**
 * EEN MODEL.CFG GELEZEN ZOALS OMSI HEM LEEST
 *
 * Voor het natekenen van het scherm van een apparaat (core/schermvorm.ts) is
 * meer nodig dan core/busmodule.ts bijhoudt: per [mesh]-regel ALLE [visible]'s
 * met hun waarde, de hele keten van [animparent] en [newanim], de LOD-groep, het
 * aanzicht, en per materiaal wat er in de cfg over gezegd wordt. En het moet
 * precies zo gelezen worden als OMSI het doet, want de nummering telt: de
 * mesh-index waarmee de plugin zegt wat OMSI toont, en het nummer achter
 * `[useTextTexture]`.
 *
 * HOE OMSI LEEST (nagelezen in Omsi.exe 2.3.004, zie nakijken_letters.md)
 * - De cfg gaat door TStringList.LoadFromFile: CR, LF en CRLF breken allemaal
 *   een regel.
 * - Een kop telt alleen als de HELE regel er exact gelijk aan is: zonder trim en
 *   hoofdlettergevoelig (005EFB54 → _LStrEqual). In de installatie staan 129
 *   ingesprongen '\t[mesh]', 57 ingesprongen '\t[texttexture]' en vijf keer
 *   '[Mesh_ident]': voor OMSI is dat commentaar, en hier dus ook. Wie trimt,
 *   krijgt onderdelen die OMSI niet heeft en `[useTextTexture]`-nummers die
 *   opschuiven.
 * - Na een kop leest OMSI een vast aantal regels, wat er ook staat.
 *
 * DE MESH-INDEX
 * OMSI slaat een [mesh] over als de o3d niet bestaat (pad ten opzichte van de
 * map van de model.cfg). In de HH20 staat '[mesh]' 621 keer in model_21_main.cfg
 * en heeft OMSI er in zijn geheugen precies 608 (de ALMEX-reeks 321-412 loopt
 * gelijk met deze telling). De dertien die schelen (17_nothahn_3_aussen, 10x
 * 17_LW_heck_*, 2x wagennr_aussen_LR) staan ingesprongen als '\t[mesh]' -- en
 * hun o3d bestaat ook niet; hier vallen ze al op de exacte vergelijking af.
 * Wat na een [mesh] met een ontbrekende o3d staat ([visible], [matl]) hangen we
 * aan die regel zelf; waar OMSI het laat, is niet gemeten, maar zo komt het in
 * elk geval niet bij een ander onderdeel terecht.
 */

/** Een punt of richting in de assen van de o3d-bestanden: x breed, y hoog, z lang. */
export type Punt = [number, number, number]

/**
 * Eén `[newanim]`.
 *
 * `origin_trans` staat in de cfg in de assen van OMSI (x rechts, y vooruit, z
 * omhoog) en is hier al omgezet naar o3d-assen (x, z, y). De draaiingen blijven
 * zoals ze er staan; core/schermvorm.ts zet ze om.
 */
export interface CfgAnim {
  /** Het draaipunt in o3d-assen, of 'mesh': het draaipunt uit de 0x79-matrix van de o3d. */
  oorsprong: Punt | 'mesh'
  /** `origin_rot_x|y|z <hoek>`, in de volgorde van de cfg; hoeken in graden. */
  draaiingen: { as: 'x' | 'y' | 'z'; hoek: number }[]
  /** `anim_trans <var> <factor>`: verschuiven langs de lokale x. */
  schuif?: { variabele: string; factor: number }
  /** `anim_rot <var> <factor>`: draaien om de lokale x, in graden. */
  draai?: { variabele: string; factor: number }
  /** Regelnummer (vanaf 1) van de kop, voor de diagnose. */
  regel: number
}

/** Wat de cfg over een materiaal zegt, of over één `[matl_item]` daarvan. */
export interface CfgMateriaalstand {
  /** `[matl_alpha]`: 0 ondoorzichtig, 1 alfatest, 2 mengen. */
  alfa?: 0 | 1 | 2
  /** `[matl_freetex] <standaard> <stringvar>`. */
  freetex?: { standaard: string; variabele: string }
  /** `[matl_transmap]`: een textuurnaam, `\S:n` (scripttextuur) of '' (leeg). */
  transmap?: string
  /** `[matl_allcolor]`: 14 getallen, diffuus rgba voorop. Overschrijft de o3d-kleuren. */
  allcolor?: number[]
  /** `[matl_lightmap] <tex> [var]`. */
  lightmap?: { textuur: string; variabele?: string }
  /** `[matl_nightmap] <tex>`. */
  nightmap?: string
  /** `[matl_envmap] <tex> <sterkte>`: vastgelegd, niet getekend. */
  envmap?: string
  /**
   * De sterkte uit `[matl_envmap]` (tweede regel). OMSI: weerspiegeling =
   * diffuse alfa x sterkte, verzadigd op 1 (SD202-carrosserieën schrijven 10).
   */
  envmapSterkte?: number
  /** `[matl_envmap_mask] <tex>`: waar de weerspiegeling mag (bus3d §5.5). */
  envmapMasker?: string
  /** `[matl_bumpmap] <tex> <sterkte>`: alleen voor de weerspiegeling, later (bus3d F5). */
  bumpmap?: { textuur: string; sterkte: number }
  /** `[texcoordtransX|Y] <var>`. */
  texcoordX?: string
  texcoordY?: string
  /**
   * `[alphascale] <var>`: de doorzichtigheid van dit materiaal maal de waarde
   * van de variabele. De Faremaster van de O560 legt zo een zwarte laag over
   * zijn scherm (`SU_II_dummy.dds`, `Faremaster_Dim`) die alleen 's nachts
   * dimt; overdag is de waarde 0 en is de laag er niet.
   */
  alfaSchaal?: string
}

/** Eén `[matl]` of `[matl_change]` met alles wat er tot het volgende materiaal bij hoort. */
export interface CfgMateriaal extends CfgMateriaalstand {
  soort: 'matl' | 'matl_change'
  /** De textuurnaam uit de cfg; kiest samen met `volgnummer` het o3d-materiaal. */
  textuur: string
  /** Het hoeveelste o3d-materiaal MET DEZE NAAM (vanaf 0); zie `materiaalVan`. */
  volgnummer: number
  /** `[matl_change]`: de getalvariabele die het item kiest; leeg = geen keuze. */
  variabele?: string
  /** `[useTextTexture] k`: het k-de tekstblok van dit bestand (vanaf 0). */
  tekst?: number
  adres?: 'clamp' | 'border'
  nietSchrijven?: boolean
  /** `[matl_noZcheck]`: zonder dieptetoets getekend (bus3d §5.3). */
  nietTesten?: boolean
  /** `[useScriptTexture] k`: de k-de `[scripttexture]` van dit bestand (vanaf 0). */
  scripttextuur?: number
  /** De `[matl_item]`'s van een `[matl_change]`: item 1, 2, ... */
  items: CfgMateriaalstand[]
  regel: number
}

/** Eén `[mesh]`-regel met alles wat erbij hoort. */
export interface CfgMesh {
  /** Het pad zoals het in de cfg staat (ongetrimd, zoals OMSI het opent). */
  pad: string
  /** Het volledige pad op schijf. */
  bestand: string
  /** Of de o3d bestaat; zo niet, dan slaat OMSI de regel over. */
  bestaat: boolean
  /** De plek in de meshlijst van OMSI (alleen bestaande o3d's), of -1. */
  meshIndex: number
  /** Het volgnummer van deze [mesh]-regel in de cfg (ook de ontbrekende). */
  cfgIndex: number
  regel: number
  /** `[viewpoint]`; ontbreekt = 0. */
  aanzicht: number
  /** In welke `[LOD]`-groep (vanaf 0), of -1 als hij vóór de eerste staat. */
  lod: number
  /** Alle `[visible] <var> <waarde>`; allemaal waar = zichtbaar. */
  zicht: { variabele: string; waarde: number }[]
  /** Alle `[mouseevent]`'s van deze regel. */
  klikken: string[]
  ident?: string
  ouder?: string
  anims: CfgAnim[]
  schaduw: boolean
  materialen: CfgMateriaal[]
}

/** Eén `[texttexture]` of `[texttexture_enh]`, met de velden zoals OMSI ze leest. */
export interface CfgTekstblok {
  /** Vanaf 0, over ALLE blokken in bestandsvolgorde: dit telt `[useTextTexture]`. */
  index: number
  regel: number
  enh: boolean
  /** Veld 1: de stringvariabele (ongetrimd). */
  bron: string
  /** Veld 2: de naam van het lettertype, ongetrimd en hoofdlettergevoelig. */
  font: string
  b: number
  h: number
  /** Veld 5, als byte. */
  fc: number
  kleur: [number, number, number]
  /** Veld 9 van `_enh` (byte), anders 0. */
  orientatie: number
  /** Veld 10 van `_enh` (word), anders 1. */
  raster: number
  /** Of alle getallen te lezen waren; zo niet, dan tekent OMSI dit blok niet. */
  geldig: boolean
}

export interface ModelCfg {
  pad: string
  map: string
  meshes: CfgMesh[]
  tekst: CfgTekstblok[]
  /** De drempels van de `[LOD]`-groepen, in volgorde. */
  lods: number[]
  /** `[scripttexture] b h`, in bestandsvolgorde; `[useScriptTexture] k` telt hierin. */
  scripttexturen: { b: number; h: number; regel: number }[]
  /**
   * `[texchanges] <bestand>`: een chtex-cfg, ten opzichte van de VOERTUIGMAP
   * (niet de map van de model.cfg). Geldt voor het hele model, ook al staat hij
   * bij een mesh.
   */
  texchanges: string[]
}

/** Hoeveel regels een kop meeneemt. Alleen koppen die hier gelezen worden. */
const LENGTE: Record<string, number> = {
  '[mesh]': 1,
  '[matl]': 2,
  '[matl_change]': 3,
  '[matl_item]': 0,
  '[useTextTexture]': 1,
  '[texttexture]': 8,
  '[texttexture_enh]': 10,
  '[visible]': 2,
  '[mouseevent]': 1,
  '[mesh_ident]': 1,
  '[animparent]': 1,
  '[newanim]': 0,
  '[viewpoint]': 1,
  '[isshadow]': 0,
  '[LOD]': 1,
  '[matl_alpha]': 1,
  '[matl_freetex]': 2,
  '[matl_transmap]': 1,
  '[matl_texadress_clamp]': 0,
  '[matl_texadress_border]': 0,
  '[matl_allcolor]': 14,
  '[matl_lightmap]': 2,
  '[matl_nightmap]': 1,
  '[matl_envmap]': 2,
  '[texcoordtransX]': 1,
  '[texcoordtransY]': 1,
  '[matl_noZwrite]': 0,
  '[alphascale]': 1,
  /*
   * Erbij voor de 3D-weergave (bus3d §5.1). De aantallen regels zijn geteld over
   * de 810 model-cfg's onder Vehicles (28-09-2026): noZcheck 3402 keer 0,
   * envmap_mask 616 keer 1 (12 keer staat er nog een getal onder, dat OMSI dan
   * als commentaar leest), bumpmap 6132 keer 2, scripttexture 937 keer 2,
   * texchanges 19 keer 1. `-<DISABLED>-` staat er NIET bij: dat komt pas na een
   * meting tegen meshes.json van de plugin (bus3d §5.1, scripts/probe-meshlijst.ts).
   */
  '[matl_noZcheck]': 0,
  '[matl_envmap_mask]': 1,
  '[matl_bumpmap]': 2,
  '[scripttexture]': 2,
  '[useScriptTexture]': 1,
  '[texchanges]': 1
}

/**
 * De woorden binnen een `[newanim]`, met het aantal regels erachter.
 *
 * OMSI leest ze niet als één blok: tussen `origin_trans` en `origin_rot_x`
 * staat in 23.385 gevallen een lege regel, en 1003 keer volgt er direct een
 * kop. Ze gelden dus voor de laatste `[newanim]` van de mesh, waar ze ook staan.
 */
const ANIMWOORD: Record<string, number> = {
  origin_trans: 3,
  origin_from_mesh: 0,
  origin_rot_x: 1,
  origin_rot_y: 1,
  origin_rot_z: 1,
  anim_trans: 2,
  anim_rot: 2,
  maxspeed: 1,
  delay: 1,
  offset: 1
}

/**
 * Een geheel getal zoals Delphi's `_ValLong`: alleen spaties vooraan, een
 * teken, en dan decimaal of hexadecimaal (`$`, `x`, `X`, `0x`) tot het eind.
 * Al het andere -- ook een spatie of tab erachter, of een lege regel -- is een
 * fout, en dan NaN.
 */
export function strToInt(regel: string | undefined): number {
  if (regel === undefined) return Number.NaN
  let i = 0
  while (i < regel.length && regel[i] === ' ') i++
  let teken = 1
  if (regel[i] === '+' || regel[i] === '-') {
    if (regel[i] === '-') teken = -1
    i++
  }
  let hex = false
  if (regel[i] === '$' || regel[i] === 'x' || regel[i] === 'X') {
    hex = true
    i++
  } else if (regel[i] === '0' && (regel[i + 1] === 'x' || regel[i + 1] === 'X')) {
    hex = true
    i += 2
  }
  const rest = regel.slice(i)
  if (!rest || !(hex ? /^[0-9a-fA-F]+$/ : /^[0-9]+$/).test(rest)) return Number.NaN
  return teken * Number.parseInt(rest, hex ? 16 : 10)
}

/** Een kommagetal uit een veld; OMSI schrijft met een punt. Onleesbaar = NaN. */
function getal(regel: string | undefined): number {
  const tekst = (regel ?? '').trim()
  if (!tekst) return Number.NaN
  const waarde = Number(tekst)
  return Number.isFinite(waarde) ? waarde : Number.NaN
}

/** Een geheel getal uit een veld, met wat speling (voor [visible] en de nummers). */
function geheel(regel: string | undefined): number {
  const strikt = strToInt(regel)
  if (Number.isFinite(strikt)) return strikt
  const ruim = getal(regel)
  return Number.isInteger(ruim) ? ruim : Number.NaN
}

/**
 * De regels van een cfg, zoals TStringList ze maakt.
 *
 * Zonder BOM is het ANSI (Windows-1252), zoals core/omsiFile.ts; een
 * UTF-16-bestand kent OMSI's lader niet, maar het kost niets om het te lezen.
 */
export function cfgRegels(pad: string): string[] {
  const rauw = readFileSync(pad)
  const tekst =
    rauw.length >= 2 && rauw[0] === 0xff && rauw[1] === 0xfe
      ? rauw.subarray(2).toString('utf16le')
      : iconv.decode(rauw, 'win1252')
  return tekst.split(/\r\n|\r|\n/)
}

const geheugen = new Map<string, { sleutel: string; cfg: ModelCfg }>()

/**
 * De cfg van een model, of `undefined` als hij niet te lezen is.
 *
 * Onthouden op pad, grootte en wijzigingstijd: de schermvorm vraagt hem twee
 * keer kort na elkaar op (eerst voor de getallen, dan voor de vorm).
 */
export function leesSchermcfg(modelcfg: string): ModelCfg | undefined {
  let sleutel: string
  try {
    const st = statSync(modelcfg)
    sleutel = `${st.size}|${st.mtimeMs}`
  } catch {
    return undefined
  }
  const bekend = geheugen.get(modelcfg)
  if (bekend && bekend.sleutel === sleutel) return bekend.cfg
  let regels: string[]
  try {
    regels = cfgRegels(modelcfg)
  } catch {
    return undefined
  }
  const cfg = ontleedSchermcfg(modelcfg, regels)
  if (geheugen.size > 8) geheugen.clear()
  geheugen.set(modelcfg, { sleutel, cfg })
  return cfg
}

/** Het werk zelf, los van de schijf: ook bruikbaar voor een proef met eigen regels. */
export function ontleedSchermcfg(modelcfg: string, regels: string[]): ModelCfg {
  const map = dirname(modelcfg)
  const meshes: CfgMesh[] = []
  const tekst: CfgTekstblok[] = []
  const lods: number[] = []
  const scripttexturen: ModelCfg['scripttexturen'] = []
  const texchanges: string[] = []

  let mesh: CfgMesh | undefined
  let materiaal: CfgMateriaal | undefined
  /** Het item waar we in zitten, of de basis van het materiaal. */
  let stand: CfgMateriaalstand | undefined
  let anim: CfgAnim | undefined
  let meshIndex = 0
  let lod = -1

  const r = (i: number): string => regels[i] ?? ''

  for (let i = 0; i < regels.length; i++) {
    const kop = regels[i]
    /*
     * Alleen eigen sleutels: een regel 'constructor' of 'toString' gaf anders de
     * functie van Object.prototype als lengte, en `i += lengte` maakte er NaN van
     * -- waarna de rest van de cfg ongelezen bleef.
     */
    const lengte = Object.hasOwn(LENGTE, kop) ? LENGTE[kop] : undefined

    if (lengte === undefined) {
      /* Een woord uit een [newanim], of commentaar. */
      const woord = Object.hasOwn(ANIMWOORD, kop) ? ANIMWOORD[kop] : undefined
      if (woord === undefined || !anim) continue
      if (kop === 'origin_trans') {
        /* OMSI-assen (x rechts, y vooruit, z omhoog) naar o3d-assen (x, z, y). */
        anim.oorsprong = [getal(r(i + 1)) || 0, getal(r(i + 3)) || 0, getal(r(i + 2)) || 0]
      } else if (kop === 'origin_from_mesh') {
        anim.oorsprong = 'mesh'
      } else if (kop === 'origin_rot_x' || kop === 'origin_rot_y' || kop === 'origin_rot_z') {
        const hoek = getal(r(i + 1))
        if (Number.isFinite(hoek) && hoek !== 0) anim.draaiingen.push({ as: kop.slice(-1) as 'x' | 'y' | 'z', hoek })
      } else if (kop === 'anim_trans') {
        anim.schuif = { variabele: r(i + 1).trim(), factor: getal(r(i + 2)) || 0 }
      } else if (kop === 'anim_rot') {
        anim.draai = { variabele: r(i + 1).trim(), factor: getal(r(i + 2)) || 0 }
      }
      i += woord
      continue
    }

    const args = (n: number): string => r(i + 1 + n)

    switch (kop) {
      case '[texttexture]':
      case '[texttexture_enh]': {
        const enh = kop === '[texttexture_enh]'
        const b = strToInt(args(2))
        const h = strToInt(args(3))
        const fc = strToInt(args(4))
        const rgb = [strToInt(args(5)), strToInt(args(6)), strToInt(args(7))]
        const orientatie = enh ? strToInt(args(8)) : 0
        const raster = enh ? strToInt(args(9)) : 1
        const geldig = [b, h, fc, ...rgb, orientatie, raster].every(Number.isFinite) && b > 0 && h > 0
        tekst.push({
          index: tekst.length,
          regel: i + 1,
          enh,
          bron: args(0),
          font: args(1),
          b: Number.isFinite(b) ? b : 0,
          h: Number.isFinite(h) ? h : 0,
          fc: Number.isFinite(fc) ? fc & 0xff : 0,
          /* Zonder klem, zoals OMSI: kleur = (R<<16)|(G<<8)|B. Voor de telefoon wel binnen 0..255. */
          kleur: rgb.map((c) => (Number.isFinite(c) ? c & 0xff : 0)) as [number, number, number],
          orientatie: Number.isFinite(orientatie) ? orientatie & 0xff : 0,
          raster: Number.isFinite(raster) ? raster & 0xffff : 1,
          geldig
        })
        break
      }
      case '[scripttexture]': {
        const b = strToInt(args(0))
        const h = strToInt(args(1))
        scripttexturen.push({ b: Number.isFinite(b) ? b : 0, h: Number.isFinite(h) ? h : 0, regel: i + 1 })
        break
      }
      case '[texchanges]': {
        const bestand = args(0).trim()
        if (bestand) texchanges.push(bestand)
        break
      }
      case '[LOD]': {
        lods.push(getal(args(0)))
        lod = lods.length - 1
        mesh = undefined
        materiaal = undefined
        stand = undefined
        anim = undefined
        break
      }
      case '[mesh]': {
        const pad = args(0)
        const bestand = join(map, ...pad.split(/[\\/]+/).filter(Boolean))
        /*
         * Een BESTAND, zoals Delphi's FileExists (die zegt nee tegen een map).
         * Met existsSync telde een regel als '\' of 'Model\' mee en schoof de
         * mesh-index van alles erna op. In de vloot wijst geen enkele [mesh]
         * naar een map (nagekeken over alle model*.cfg), dus voor de bestaande
         * bussen verandert er niets.
         */
        let bestaat = false
        try {
          bestaat = pad.trim() !== '' && statSync(bestand, { throwIfNoEntry: false })?.isFile() === true
        } catch {
          bestaat = false
        }
        mesh = {
          pad,
          bestand,
          bestaat,
          meshIndex: bestaat ? meshIndex++ : -1,
          cfgIndex: meshes.length,
          regel: i + 1,
          aanzicht: 0,
          lod,
          zicht: [],
          klikken: [],
          anims: [],
          schaduw: false,
          materialen: []
        }
        meshes.push(mesh)
        materiaal = undefined
        stand = undefined
        anim = undefined
        break
      }
      default: {
        if (!mesh) break
        verwerk(kop, args, i + 1)
      }
    }
    i += lengte
  }

  /** Een kop die bij de huidige mesh hoort. */
  function verwerk(kop: string, args: (n: number) => string, regel: number): void {
    const m = mesh!
    switch (kop) {
      case '[visible]': {
        const variabele = args(0).trim()
        const waarde = geheel(args(1))
        if (variabele && Number.isFinite(waarde)) m.zicht.push({ variabele, waarde })
        return
      }
      case '[mouseevent]': {
        const actie = args(0).trim()
        if (actie) m.klikken.push(actie)
        return
      }
      case '[mesh_ident]':
        m.ident = args(0).trim()
        return
      case '[animparent]':
        m.ouder = args(0).trim()
        return
      case '[viewpoint]': {
        const waarde = geheel(args(0))
        m.aanzicht = Number.isFinite(waarde) ? waarde : 0
        return
      }
      case '[isshadow]':
        m.schaduw = true
        return
      case '[newanim]':
        anim = { oorsprong: [0, 0, 0], draaiingen: [], regel }
        m.anims.push(anim)
        return
      case '[matl]':
      case '[matl_change]': {
        const volgnummer = geheel(args(1))
        materiaal = {
          soort: kop === '[matl]' ? 'matl' : 'matl_change',
          textuur: args(0).trim(),
          volgnummer: Number.isFinite(volgnummer) ? volgnummer : 0,
          variabele: kop === '[matl_change]' ? args(2).trim() || undefined : undefined,
          items: [],
          regel
        }
        m.materialen.push(materiaal)
        stand = materiaal
        return
      }
    }
    if (!materiaal || !stand) return
    switch (kop) {
      case '[matl_item]': {
        const item: CfgMateriaalstand = {}
        materiaal.items.push(item)
        stand = item
        return
      }
      case '[useTextTexture]': {
        const k = geheel(args(0))
        if (Number.isFinite(k) && k >= 0) materiaal.tekst = k
        return
      }
      case '[matl_texadress_clamp]':
        materiaal.adres = 'clamp'
        return
      case '[matl_texadress_border]':
        materiaal.adres = 'border'
        return
      case '[matl_noZwrite]':
        materiaal.nietSchrijven = true
        return
      case '[matl_noZcheck]':
        materiaal.nietTesten = true
        return
      case '[useScriptTexture]': {
        const k = geheel(args(0))
        if (Number.isFinite(k) && k >= 0) materiaal.scripttextuur = k
        return
      }
      case '[matl_envmap_mask]':
        stand.envmapMasker = args(0).trim() || undefined
        return
      case '[matl_bumpmap]': {
        const textuur = args(0).trim()
        if (textuur) stand.bumpmap = { textuur, sterkte: getal(args(1)) || 0 }
        return
      }
      case '[matl_alpha]': {
        const a = geheel(args(0))
        stand.alfa = a === 1 ? 1 : a === 2 ? 2 : 0
        return
      }
      case '[matl_freetex]':
        stand.freetex = { standaard: args(0).trim(), variabele: args(1).trim() }
        return
      case '[matl_transmap]':
        stand.transmap = args(0).trim()
        return
      case '[matl_allcolor]': {
        const waarden: number[] = []
        for (let k = 0; k < 14; k++) waarden.push(getal(args(k)))
        if (waarden.slice(0, 4).every(Number.isFinite)) stand.allcolor = waarden
        return
      }
      case '[matl_lightmap]': {
        const variabele = args(1).trim()
        /* De tweede regel is een variabele of leeg; een kop of een getal is het niet. */
        stand.lightmap = {
          textuur: args(0).trim(),
          variabele: variabele && !variabele.startsWith('[') && !Number.isFinite(Number(variabele)) ? variabele : undefined
        }
        return
      }
      case '[matl_nightmap]':
        stand.nightmap = args(0).trim()
        return
      case '[matl_envmap]': {
        stand.envmap = args(0).trim()
        const sterkte = getal(args(1))
        if (Number.isFinite(sterkte)) stand.envmapSterkte = sterkte
        return
      }
      case '[texcoordtransX]':
        stand.texcoordX = args(0).trim()
        return
      case '[texcoordtransY]':
        stand.texcoordY = args(0).trim()
        return
      case '[alphascale]':
        stand.alfaSchaal = args(0).trim() || undefined
        return
    }
  }

  return { pad: modelcfg, map, meshes, tekst, lods, scripttexturen, texchanges }
}

/**
 * Of OMSI deze mesh in het binnenaanzicht tekent.
 *
 * `[viewpoint]` is een bitveld (de cfg's leggen het zelf uit: 0 = altijd,
 * 1 = buiten, 2 = binnen, 4 = AI-bus): leeg, 0, of bit 2 aan. En van de
 * `[LOD]`-groepen alleen die met de grootste drempel, of wat ervoor staat; bij
 * bussen is dat altijd de eerste groep. In vloot.jsonl hadden 43 leden van een
 * achtergrondset [viewpoint] 4 en 47 [viewpoint] 5: zonder dit filter kwam de
 * AI-tweeling van een onderdeel als achtergrond boven.
 */
export function binnenZichtbaar(cfg: ModelCfg, mesh: CfgMesh): boolean {
  if (mesh.aanzicht !== 0 && (mesh.aanzicht & 2) === 0) return false
  if (mesh.lod < 0 || cfg.lods.length === 0) return true
  let beste = 0
  for (let k = 1; k < cfg.lods.length; k++) {
    if ((cfg.lods[k] ?? -Infinity) > (cfg.lods[beste] ?? -Infinity)) beste = k
  }
  return mesh.lod === beste
}

/**
 * Welk o3d-materiaal een `[matl]`/`[matl_change]` bedoelt: het `volgnummer`-de
 * materiaal (vanaf 0) waarvan de textuurnaam gelijk is, hoofdletterongevoelig.
 * Geen treffer = het blok geldt voor niets (-1).
 *
 * Nagemeten: O550_Euro3.cfg `[matl] Textfeld_AFR_1.tga 0` is materiaal 2 van
 * O550_AFR200_Body.o3d, niet materiaal 0. Over alle unieke model*.cfg's klopt
 * 'per naam' 115.914 keer en 'globaal nummer' 76.421 keer.
 */
export function materiaalVan(texturen: string[], textuur: string, volgnummer: number): number {
  const naam = textuur.toLowerCase()
  let gezien = 0
  for (let k = 0; k < texturen.length; k++) {
    if (texturen[k].trim().toLowerCase() !== naam) continue
    if (gezien === volgnummer) return k
    gezien++
  }
  return -1
}

/**
 * Per o3d-materiaal wat de cfg erover zegt; `undefined` als hij er niets over
 * zegt (dan geldt het o3d-materiaal zelf, zoals bij de ALMEX-schermen).
 * Zegt de cfg twee keer iets over hetzelfde materiaal, dan gaat het laatste voor.
 */
export function materiaalcontexten(mesh: CfgMesh, texturen: string[]): (CfgMateriaal | undefined)[] {
  const uit: (CfgMateriaal | undefined)[] = texturen.map(() => undefined)
  for (const materiaal of mesh.materialen) {
    const k = materiaalVan(texturen, materiaal.textuur, materiaal.volgnummer)
    if (k < 0) continue
    const eerder = uit[k]
    uit[k] = eerder
      ? {
          ...eerder,
          ...Object.fromEntries(Object.entries(materiaal).filter(([, w]) => w !== undefined)),
          items: materiaal.items.length > 0 ? materiaal.items : eerder.items
        } as CfgMateriaal
      : materiaal
  }
  return uit
}
