import { basename } from 'node:path'
import type { Busmodule } from '../core/busmodule'
import { leesMeshlijst, type LiveData } from '../core/live'
import { leesOmsiFonts, schermfontVan, zoekFont } from '../core/oft'
import { textuurBron, zoekSchermtextuur, type Vlaggen } from '../core/schermtextuur'
import { meshlijstVan, schermGetallenVan, schermVormVan } from '../core/schermvorm'
import type { Schermfont, Schermstand, Schermvorm } from '../shared/scherm'
import { registreer, textuurBytes, vergeetBehalve } from './schermtexturen'

/**
 * HET NAGEBOUWDE SCHERM VAN EEN APPARAAT, AAN DE KANT VAN HET HOOFDPROCES
 *
 * Hier komen de delen samen (zie shared/scherm.ts voor de afspraak):
 *
 * - welke getalvariabelen de plugin moet opzoeken voordat de vorm gebouwd kan
 *   worden -- de plek van sommige onderdelen hangt aan een animatievariabele,
 *   en welk menu er aanstaat aan `almex_menu`;
 * - de VORM zelf, één keer per bus en apparaat, met zijn plaatjes in het
 *   register (main/schermtexturen.ts), op id;
 * - de STAND bij elk beeld: de teksten, de getallen, en de vlaggen waarmee
 *   OMSI zelf zegt welke onderdelen hij nu toont.
 *
 * Een vorm bouwen leest een paar honderd .o3d-bestanden en kost een paar
 * honderd milliseconden. Dat gebeurt één keer per bus; daarna is het opzoeken.
 */

/** Zo lang wachten we op de getallen van de plugin voordat de vorm toch gebouwd wordt. */
const WACHT_OP_GETALLEN_MS = 3000

interface Bouw {
  /** Wanneer de getallen voor het eerst gevraagd zijn. */
  sinds: number
  getalNamen: string[]
  vorm?: Schermvorm
  knoppenOpScherm: Set<string>
  /** Gebouwd maar er viel geen scherm van te maken: niet elk beeld opnieuw proberen. */
  geen?: boolean
}

const bouwen = new Map<string, Bouw>()
const vormen = new Map<string, Schermvorm>()
/** Bij welke bus de vormen horen; een andere bus maakt alles leeg. */
let busVanNu = ''

/** De lettertypen van OMSI, één keer per installatie gelezen. */
let fontsVan: { map: string; fonts: ReturnType<typeof leesOmsiFonts> } | undefined
const fontCache = new Map<string, Schermfont | undefined>()

function fontLezer(omsiMap: string): (naam: string, volkleur: boolean) => Schermfont | undefined {
  if (!fontsVan || fontsVan.map !== omsiMap) {
    fontsVan = { map: omsiMap, fonts: leesOmsiFonts(omsiMap) }
    fontCache.clear()
  }
  const alle = fontsVan.fonts
  return (naam, volkleur) => {
    const sleutel = `${naam}\u0000${volkleur ? 1 : 0}`
    if (fontCache.has(sleutel)) return fontCache.get(sleutel)
    const font = zoekFont(alle, naam)
    const uit = font ? schermfontVan(omsiMap, font, volkleur) : undefined
    fontCache.set(sleutel, uit)
    return uit
  }
}

/** Alles vergeten als er een andere bus onder de speler komt. */
function nieuweBus(modelcfg: string): void {
  if (busVanNu === modelcfg) return
  busVanNu = modelcfg
  bouwen.clear()
  vormen.clear()
  meshUitlijning = undefined
  vergeetBehalve([])
}

/** De getalvariabelen die deze apparaten nodig hebben; die moet de plugin opzoeken. */
export function schermGetallenVoor(modelcfg: string, modules: Busmodule[]): string[] {
  nieuweBus(modelcfg)
  const namen: string[] = []
  for (const module of modules) {
    const bouw = bouwVan(modelcfg, module)
    for (const naam of bouw.getalNamen) if (!namen.includes(naam)) namen.push(naam)
  }
  return namen
}

/** De stringvariabelen van de vormen die er al zijn: teksten en freetex-namen. */
export function schermStringsVoor(modelcfg: string, modules: Busmodule[]): string[] {
  const namen: string[] = []
  for (const module of modules) {
    const vorm = bouwen.get(sleutelVan(modelcfg, module))?.vorm
    for (const naam of vorm?.stringvars ?? []) if (!namen.includes(naam)) namen.push(naam)
  }
  return namen
}

function sleutelVan(modelcfg: string, module: Busmodule): string {
  return `${modelcfg}|${module.id}`
}

function bouwVan(modelcfg: string, module: Busmodule): Bouw {
  const sleutel = sleutelVan(modelcfg, module)
  let bouw = bouwen.get(sleutel)
  if (!bouw) {
    let getalNamen: string[] = []
    try {
      getalNamen = schermGetallenVan(modelcfg, module)
    } catch {
      getalNamen = []
    }
    bouw = { sinds: Date.now(), getalNamen, knoppenOpScherm: new Set() }
    bouwen.set(sleutel, bouw)
  }
  return bouw
}

/** De getallen zoals de plugin ze doorgeeft, alleen de echte getallen. */
function getallenVan(live: LiveData | undefined): Record<string, number> {
  const uit: Record<string, number> = {}
  for (const [naam, waarde] of Object.entries(live?.getallen ?? {})) {
    if (typeof waarde === 'number' && Number.isFinite(waarde)) uit[naam] = waarde
  }
  return uit
}

/**
 * Het scherm van dit apparaat, als het er (al) is.
 *
 * De eerste keer wordt er gewacht tot de plugin de gevraagde getallen heeft
 * doorgegeven -- hooguit drie tellen, daarna gaat het met nul -- want de plek
 * van sommige onderdelen hangt eraan. Is er eenmaal een vorm, dan blijft hij
 * voor deze bus.
 */
export function schermVoor(
  omsiMap: string,
  modelcfg: string,
  module: Busmodule,
  live: LiveData | undefined,
  log: (regel: string) => void
): { vorm: Schermvorm; knoppenOpScherm: Set<string> } | undefined {
  nieuweBus(modelcfg)
  const bouw = bouwVan(modelcfg, module)
  if (bouw.vorm) return { vorm: bouw.vorm, knoppenOpScherm: bouw.knoppenOpScherm }
  if (bouw.geen) return undefined

  const getallen = getallenVan(live)
  const onbekend = new Set((live?.getallenOnbekend ?? []).map((naam) => naam.toLowerCase()))
  const binnen = bouw.getalNamen.every(
    (naam) => naam in getallen || onbekend.has(naam.toLowerCase())
  )
  if (!binnen && Date.now() - bouw.sinds < WACHT_OP_GETALLEN_MS) return undefined

  const begin = Date.now()
  let gebouwd: ReturnType<typeof schermVormVan>
  try {
    gebouwd = schermVormVan({
      modelcfg,
      omsiMap,
      module,
      getallen,
      font: fontLezer(omsiMap),
      zoekTextuur: (naam) => zoekSchermtextuur(modelcfg, omsiMap, naam),
      bron: (pad, vlaggen) => textuurBron(pad, vlaggen as Vlaggen)
    })
  } catch (fout) {
    log(`scherm van ${module.naam}: bouwen mislukt: ${String(fout)}`)
    gebouwd = undefined
  }
  if (!gebouwd) {
    bouw.geen = true
    log(`scherm van ${module.naam}: geen scherm te maken; de nagemeten weergave blijft`)
    return undefined
  }
  for (const bron of gebouwd.texturen) registreer(bron as Parameters<typeof registreer>[0])
  bouw.vorm = gebouwd.vorm
  bouw.knoppenOpScherm = new Set(gebouwd.knoppenOpScherm)
  vormen.set(gebouwd.vorm.id, gebouwd.vorm)
  log(
    `scherm van ${module.naam}: ${gebouwd.vorm.delen.length} delen, ${gebouwd.vorm.klikken.length} ` +
      `aanraakvlakken, ${gebouwd.texturen.length} plaatjes, ${Object.keys(gebouwd.vorm.fonts).length} ` +
      `lettertypen in ${Date.now() - begin} ms` +
      (gebouwd.vorm.onvolledig.length > 0 ? `; niet na te tekenen: ${gebouwd.vorm.onvolledig.slice(0, 5).join(', ')}` : '')
  )
  return { vorm: gebouwd.vorm, knoppenOpScherm: bouw.knoppenOpScherm }
}

/*
 * HOORT DE MESHLIJST VAN DE PLUGIN BIJ DEZE CFG?
 *
 * De vlaggen van OMSI (`live.zichtbaar`) zijn een reeks van '0' en '1', één per
 * mesh, in de volgorde waarin OMSI ze geladen heeft. Die volgorde rekent de app
 * zelf na uit de cfg (`meshlijstVan`); de plugin schrijft de namen erbij in
 * meshes.json. Alleen als die twee gelijk zijn worden de vlaggen gebruikt --
 * anders zou een verschoven lijst het verkeerde menu laten zien, en dan liever
 * de getallen.
 */
let meshUitlijning: { modelcfg: string; model: string; aantal: number; klopt: boolean } | undefined

function meshesKloppen(modelcfg: string, live: LiveData): boolean {
  const aantal = live.meshAantal ?? 0
  if (!live.zichtbaar || aantal <= 0 || live.zichtbaar.length !== aantal) return false
  if (meshUitlijning && meshUitlijning.modelcfg === modelcfg && meshUitlijning.aantal === aantal) {
    return meshUitlijning.klopt
  }
  const lijst = leesMeshlijst()
  let eigen: string[] = []
  try {
    eigen = meshlijstVan(modelcfg)
  } catch {
    eigen = []
  }
  const klein = (naam: string): string => basename(naam.replace(/\\/g, '/')).toLowerCase()
  const klopt =
    Boolean(lijst) &&
    lijst!.meshes.length === aantal &&
    eigen.length === aantal &&
    eigen.every((naam, i) => klein(naam) === klein(lijst!.meshes[i][0]))
  meshUitlijning = { modelcfg, model: lijst?.model ?? '', aantal, klopt }
  return klopt
}

/** Wat er nu op het scherm staat. */
export function standVoor(
  vorm: Schermvorm,
  live: LiveData | undefined,
  omsiMap: string,
  modelcfg: string
): Schermstand {
  const vars = live?.vars ?? {}
  const stand: Schermstand = {
    vorm: vorm.id,
    /* Letterlijk: OMSI trimt niets, en een regel als '    LEE' staat zo in het vak. */
    t: vorm.stringvars.map((naam) => vars[naam] ?? '')
  }
  if (live?.getallen && (live.getalAantal ?? 0) > 0) {
    const onbekend = new Set((live.getallenOnbekend ?? []).map((naam) => naam.toLowerCase()))
    const g: (number | null)[] = []
    const o: number[] = []
    vorm.getallen.forEach((naam, i) => {
      const waarde = live.getallen![naam]
      if (onbekend.has(naam.toLowerCase())) {
        o.push(i)
        g.push(0)
      } else {
        g.push(typeof waarde === 'number' && Number.isFinite(waarde) ? waarde : null)
      }
    })
    stand.g = g
    if (o.length > 0) stand.o = o
  }
  if (live && meshesKloppen(modelcfg, live)) stand.z = live.zichtbaar

  /*
   * Een plaatje dat het script kiest ([matl_freetex]): de waarde van de
   * stringvariabele is een bestandsnaam. Die wordt hier opgezocht en in het
   * register gezet; de telefoon krijgt alleen de id.
   */
  const freetex = vorm.delen.filter((deel) => deel.freetex !== undefined)
  if (freetex.length > 0) {
    const f: (string | null)[] = vorm.stringvars.map(() => null)
    for (const deel of freetex) {
      const i = deel.freetex!
      if (f[i] !== null) continue
      const naam = (stand.t[i] ?? '').trim()
      if (!naam) continue
      const pad = zoekSchermtextuur(modelcfg, omsiMap, naam)
      if (!pad) continue
      const bron = textuurBron(pad, { alfa: deel.alfa })
      registreer(bron)
      f[i] = bron.id
    }
    stand.f = f
  }
  return stand
}

/** De vorm op id; voor de brug van de overlay en de server van de tablet. */
export function schermvormOp(id: string): Schermvorm | undefined {
  return vormen.get(id)
}

/** Een plaatje op id; alleen wat in het register staat. */
export function schermtextuurOp(id: string): { bytes: Buffer; type: string } | undefined {
  return textuurBytes(id)
}

/**
 * De acties van de aanraakvlakken op de schermen van deze bus.
 *
 * Die mogen door: ze liggen op het scherm van een apparaat dat de speler zelf
 * in de telefoon zette, ook als hun naam niet op de lijst van bekende
 * apparaatnamen staat. En ze horen bij de toetsen die de app in keyboard.cfg
 * zet, anders doen ze in het spel niets.
 */
export function schermActies(): Set<string> {
  const uit = new Set<string>()
  for (const vorm of vormen.values()) for (const klik of vorm.klikken) uit.add(klik.actie)
  return uit
}
