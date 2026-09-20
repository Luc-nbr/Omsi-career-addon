import { existsSync, readdirSync, type Dirent } from 'node:fs'
import { dirname, join } from 'node:path'
import { readOmsiLines } from './omsiFile'

/**
 * Wat een bus uit elkaar houdt: zijn onderdelen en de texturen erop.
 *
 * WAAROM DIT BESTAAT
 * Een repaint van een bus is in OMSI geen instelling maar een eigen
 * `.bus`-bestand met eigen texturen: de 85 bestanden in `MB_C2_EN_BVG` zijn
 * dezelfde bus in 85 uitvoeringen. In de buskeuze van de app staan ze als 85
 * regels met bijna dezelfde naam, en dan kies je op goed geluk. Wie de bus ziet,
 * kiest wat hij wil rijden.
 *
 * Dit bestand leest de weg daarheen: van een `.bus` naar zijn model, en van dat
 * model naar de onderdelen (`.o3d`) met de textuur die erop hoort. Het tekenen
 * zelf gebeurt elders; hier staat alleen wat er te tekenen valt.
 *
 * HOE OMSI HET OPSCHRIJFT
 * Een `.bus` noemt in `[model]` het pad naar een `model.cfg`, en dat bestand is
 * een lijst die je van boven naar beneden leest: `[mesh]` begint een onderdeel,
 * en alles wat erna komt hoort daarbij tot het volgende `[mesh]`. `[matl]` geeft
 * de textuur, met daaronder het nummer van de materiaalgroep binnen dat
 * onderdeel -- dezelfde nummers als de vierde waarde bij elke driehoek in het
 * o3d-bestand.
 */

/** Een materiaal zoals het model het opschrijft: een textuur op een groep. */
export interface BusMateriaal {
  /** Bestandsnaam van de textuur, zoals in de cfg. */
  textuur: string
  /** Volledig pad, als het bestand er werkelijk ligt. */
  pad?: string
  /** Welke groep driehoeken binnen het onderdeel; komt uit het o3d-bestand. */
  groep: number
}

/** Een onderdeel van de bus. */
export interface BusOnderdeel {
  /** Het o3d-bestand, zoals in de cfg. */
  bestand: string
  /** Volledig pad, als het er ligt. */
  pad?: string
  materialen: BusMateriaal[]
  /**
   * Het aanzicht waar dit onderdeel bij hoort.
   *
   * OMSI gebruikt dat om binnen- en buitenkant te scheiden. Voor een plaatje
   * van de bus wil je de buitenkant; de stoelen en het dashboard zitten er
   * anders doorheen.
   */
  aanzicht?: number
  /** Zit dit onderdeel in de binnenruimte? Dan laat een buitenaanzicht het weg. */
  binnen: boolean
}

export interface BusModel {
  /** Het `.bus`-bestand waar dit uit komt. */
  bus: string
  /** De `model.cfg` die erbij hoort. */
  modelcfg: string
  /** De map waar de o3d-bestanden onder staan. */
  modelmap: string
  onderdelen: BusOnderdeel[]
}

/** Het pad uit `[model]`, als de bus er een noemt. */
export function modelVanBus(busPad: string): string | undefined {
  let regels: string[]
  try {
    regels = readOmsiLines(busPad)
  } catch {
    return undefined
  }
  for (let i = 0; i < regels.length; i++) {
    if (regels[i].trim().toLowerCase() !== '[model]') continue
    const rel = (regels[i + 1] ?? '').trim()
    if (!rel) return undefined
    const pad = join(dirname(busPad), ...rel.split(/[\/]/))
    return existsSync(pad) ? pad : undefined
  }
  return undefined
}

/**
 * Alle bestanden onder een voertuigmap, op kleine letters, één keer geteld.
 *
 * WAAROM EEN INDEX EN NIET PER KEER ZOEKEN
 * De cfg noemt een textuur zonder map -- `SD77_Panel.bmp` -- en waar dat
 * bestand ligt verschilt per add-on: meestal in `Texture\`, maar repaints staan
 * vaak in een submap daarvan (`Texture\Repaints\...`). Hier stond eerst een
 * zoektocht in drie vaste mappen, en die vond 10.722 tga-, 1073 bmp- en 268
 * dds-verwijzingen niet -- precies de bestanden die de kleurstelling dragen.
 *
 * Windows trekt zich niets aan van hoofdletters en de cfg's ook niet, dus de
 * sleutel is kleingeschreven. Ligt dezelfde naam twee keer, dan wint de
 * ondiepste: `Textureus.dds` gaat voor `Texture\oudus.dds`.
 */
const indexPerMap = new Map<string, Map<string, string>>()

function bestandenIn(map: string): Map<string, string> {
  const bekend = indexPerMap.get(map)
  if (bekend) return bekend

  const index = new Map<string, string>()
  const diepte = new Map<string, number>()
  const loop = (hier: string, niveau: number): void => {
    if (niveau > 4) return
    let inhoud: Dirent[]
    try {
      inhoud = readdirSync(hier, { withFileTypes: true })
    } catch {
      return
    }
    for (const item of inhoud) {
      const vol = join(hier, item.name)
      if (item.isDirectory()) {
        loop(vol, niveau + 1)
        continue
      }
      const sleutel = item.name.toLowerCase()
      const eerder = diepte.get(sleutel)
      if (eerder === undefined || niveau < eerder) {
        index.set(sleutel, vol)
        diepte.set(sleutel, niveau)
      }
    }
  }
  loop(map, 0)
  indexPerMap.set(map, index)
  return index
}

/**
 * Een textuurnaam terugvinden; de map ervoor telt niet mee, alleen de naam.
 *
 * Eerst in de map van de bus, dan in de gedeelde texturenmap van OMSI zelf --
 * een handvol bussen leunt op wat daar ligt. Gemeten op eenentwintig bussen:
 * zonder die tweede plek bleven 647 van de 8549 verwijzingen liggen.
 */
function zoekTextuur(voertuigmap: string, omsimap: string, naam: string): string | undefined {
  const plat = naam.split(/[\/]/).pop()?.toLowerCase()
  if (!plat) return undefined
  return bestandenIn(voertuigmap).get(plat) ?? bestandenIn(join(omsimap, 'Texture')).get(plat)
}

/**
 * Het model van een bus: welke onderdelen, met welke texturen.
 *
 * Leest alleen; wat niet gevonden wordt blijft leeg in plaats van dat het gooit.
 * Een bus met een half model is nog steeds een bus in de lijst.
 */
export function leesBusModel(busPad: string): BusModel | undefined {
  const modelcfg = modelVanBus(busPad)
  if (!modelcfg) return undefined

  let regels: string[]
  try {
    regels = readOmsiLines(modelcfg)
  } catch {
    return undefined
  }

  const modelmap = dirname(modelcfg)
  const voertuigmap = dirname(modelmap)
  /* `<OMSI 2>\Vehicles\<bus>` -- twee mappen omhoog staat de installatie zelf. */
  const omsimap = dirname(dirname(voertuigmap))


  const onderdelen: BusOnderdeel[] = []
  let huidig: BusOnderdeel | undefined
  for (let i = 0; i < regels.length; i++) {
    const kop = regels[i].trim().toLowerCase()
    if (kop === '[mesh]') {
      const bestand = (regels[i + 1] ?? '').trim()
      if (!bestand) continue
      const pad = join(modelmap, ...bestand.split(/[\/]/))
      huidig = {
        bestand,
        pad: existsSync(pad) ? pad : undefined,
        materialen: [],
        binnen: false
      }
      onderdelen.push(huidig)
      continue
    }
    if (!huidig) continue
    if (kop === '[matl]') {
      const textuur = (regels[i + 1] ?? '').trim()
      const groep = Number((regels[i + 2] ?? '').trim())
      if (!textuur) continue
      huidig.materialen.push({
        textuur,
        pad: zoekTextuur(voertuigmap, omsimap, textuur),
        groep: Number.isFinite(groep) ? groep : 0
      })
      continue
    }
    if (kop === '[viewpoint]') {
      const nummer = Number((regels[i + 1] ?? '').trim())
      if (Number.isFinite(nummer)) huidig.aanzicht = nummer
      continue
    }
    /*
     * Wat binnen hoort. OMSI markeert de binnenruimte op twee manieren, en
     * allebei komen ze voor in dezelfde installatie.
     */
    if (kop === '[interior]' || kop === '[illumination_interior]') huidig.binnen = true
  }

  return { bus: busPad, modelcfg, modelmap, onderdelen }
}
