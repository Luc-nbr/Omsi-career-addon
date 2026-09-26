/**
 * EEN BUS KLAARMAKEN, VOORDAT JE ERMEE RIJDT
 *
 * Wat de app voor een bus nodig heeft om zijn apparaten in de overlay en op de
 * tablet te laten werken -- het nagebouwde scherm, en elke knop aan een toets --
 * haalde ze tot nu toe pas op als de bus reed: de speler zette in de telefoon een
 * apparaat erbij, en hing dan de knoppen aan een toets (zie busknoppenStraks in
 * core/settings.ts). Dat werkt, maar het is in het spel, en voor elke bus
 * opnieuw. De gebruiker: "de gebruiker moet via de app zelf de bus kunnen
 * toevoegen zodat de app de benodigdheden zelf bouwt voor de bus".
 *
 * Dit leest een bus uit zoals de app dat tijdens het rijden doet, maar dan van
 * schijf en zonder de plugin:
 * - welke apparaten er zijn (core/busmodule.ts), per map met ALLE varianten --
 *   een busmap heeft vaak vijf .bus-bestanden met elk een eigen model.cfg;
 * - wat voor apparaat het is: een touchscreen, een scherm met toetsen, alleen
 *   toetsen, of alleen een scherm (core/schermvorm.ts, met de startwaarden uit
 *   de scripts in plaats van de getallen van de plugin);
 * - en welke knoppen er aan een toets moeten, per variant en in de volgorde van
 *   belang. Het bijschrijven zelf gebeurt met zetBustoetsen in
 *   core/bustoetsen.ts, met de triggers van elke variant (triggersVan), zodat
 *   een toets gedeeld mag worden met een andere bus of een andere variant.
 *
 * DE SLEUTEL
 * Per busmap, net als `busmodules` in de instellingen: "vehicles/<map>" in kleine
 * letters. Dat is wat de plugin tijdens het rijden als pad doorgeeft (gemeten:
 * "vehicles/hh20_ebus2021"), dus wat hier klaargemaakt wordt, vindt de app in
 * het spel vanzelf terug.
 *
 * Geen Electron: dit draait ook in een proef (scripts/probe-busklaar.ts).
 */
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { modelVanBus } from './busmodel'
import { modulesVanModel, type Busmodule } from './busmodule'
import {
  knoppenOpApparaat,
  schermGetallenVan,
  schermVormVan,
  startwaardenVan,
  type SchermUitvoer
} from './schermvorm'
import { zoekSchermtextuur } from './schermtextuur'
import { vehicleName, type Vehicle } from './vehicles'

/** Een busmap met al zijn varianten. */
export interface Busmap {
  /** "vehicles/<map>", in kleine letters: de sleutel in de instellingen. */
  sleutel: string
  /** De map zoals hij op schijf heet. */
  map: string
  /** Een naam voor in de lijst: fabrikant en type van de eerste variant. */
  naam: string
  /** Hoeveel varianten (.bus-bestanden) er in de map staan. */
  varianten: number
  /** Het pad van de eerste variant, voor de foto. */
  voorbeeld: string
}

/**
 * Wat voor apparaat het is.
 *
 * - `touchscreen`: het getekende scherm heeft zelf aanraakvlakken (een ALMEX).
 * - `scherm`: een getekend scherm met toetsen ernaast (een AFR 200, een IBIS).
 * - `knoppen`: alleen knoppen, geen scherm (een geldlade, een wisselaar).
 * - `display`: alleen een scherm, niets om op te drukken (een klok, een
 *   binnendisplay).
 */
export type Apparaatsoort = 'touchscreen' | 'scherm' | 'knoppen' | 'display'

export interface Busapparaat {
  id: string
  naam: string
  soort: Apparaatsoort
  /** Hoeveel verschillende knoppen er aan een toets moeten. */
  knoppen: number
  /** Of het scherm na te tekenen is; zo niet, dan valt het terug op tekst. */
  getekend: boolean
  /**
   * Waarom een deel niet na te tekenen is, als dat zo is: het busscript tekent
   * het zelf (`script`), of de onderdelen zijn versleuteld (`versleuteld`).
   */
  beperking?: 'script' | 'versleuteld'
  /**
   * Of de app hem aanvinkt. Alles met een scherm EN iets om op te drukken: de
   * IBIS, de kaartautomaat, het touchscreen. Een geldlade of een klok niet --
   * die zijn te kiezen, maar vragen er niet om. En niet een scherm met één of
   * twee knopjes: het laaddisplay van de elektrische HH20 is een touchscreen
   * met één knop, en die hoort niet naast de ALMEX aangevinkt te staan.
   */
  aanbevolen: boolean
}

export interface Busanalyse {
  sleutel: string
  apparaten: Busapparaat[]
  /** Hoe lang het uitlezen duurde. */
  ms: number
}

/** Zoveel knoppen heeft een apparaat minstens voordat de app hem aanvinkt. */
const MIN_KNOPPEN_AANBEVOLEN = 4

/** "vehicles/<map>" uit een relatief pad van een .bus-bestand. */
export function sleutelVan(relativePath: string): string {
  return dirname(relativePath).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

/** De geïnstalleerde bussen, per map, op naam. */
export function busmappen(voertuigen: Vehicle[]): Busmap[] {
  const perMap = new Map<string, Vehicle[]>()
  for (const voertuig of voertuigen) {
    const sleutel = sleutelVan(voertuig.relativePath)
    perMap.set(sleutel, [...(perMap.get(sleutel) ?? []), voertuig])
  }
  return [...perMap.entries()]
    .map(([sleutel, lijst]) => ({
      sleutel,
      map: lijst[0].folder,
      naam: vehicleName(lijst[0]),
      varianten: lijst.length,
      voorbeeld: lijst[0].relativePath
    }))
    .sort((a, b) => a.naam.localeCompare(b.naam, 'nl', { sensitivity: 'base' }))
}

/** De verschillende model.cfg's van alle varianten in een map. */
export function modelcfgsVan(omsiPath: string, voertuigen: Vehicle[], sleutel: string): string[] {
  const uit = new Set<string>()
  for (const voertuig of voertuigen) {
    if (sleutelVan(voertuig.relativePath) !== sleutel) continue
    const cfg = modelVanBus(join(omsiPath, voertuig.relativePath))
    if (cfg) uit.add(cfg)
  }
  return [...uit]
}

/** De vorm van één apparaat, zoals de app hem tijdens het rijden zou bouwen. */
function vormVan(omsiPath: string, modelcfg: string, module: Busmodule): SchermUitvoer | undefined {
  try {
    return schermVormVan({
      modelcfg,
      omsiMap: omsiPath,
      module,
      /*
       * Zonder plugin: de startwaarden uit de scripts. De vorm hangt daar voor
       * de plek van sommige onderdelen van af (trans_dauer bij de ALMEX); welke
       * knoppen er zijn niet.
       */
      getallen: startwaardenVan(modelcfg, schermGetallenVan(modelcfg, module)) as Record<string, number>,
      /* Voor het uitlezen doet de letter er niet toe, alleen voor het tekenen. */
      font: (naam) => ({ naam, hoogte: 27, sep: 2, tekens: [] }),
      zoekTextuur: (naam) => zoekSchermtextuur(modelcfg, omsiPath, naam),
      bron: (pad) => ({ id: createHash('sha1').update(pad.toLowerCase()).digest('hex').slice(0, 20) })
    })
  } catch {
    return undefined
  }
}

interface Uitgelezen {
  module: Busmodule
  vorm?: SchermUitvoer
}

/** Alle apparaten van alle varianten, één keer per id (de rijkste variant wint). */
function leesMap(omsiPath: string, modelcfgs: string[]): Map<string, Uitgelezen[]> {
  const perId = new Map<string, Uitgelezen[]>()
  for (const modelcfg of modelcfgs) {
    let modules: Busmodule[]
    try {
      modules = modulesVanModel(modelcfg)
    } catch {
      continue
    }
    for (const module of modules) {
      const lijst = perId.get(module.id) ?? []
      lijst.push({ module, vorm: vormVan(omsiPath, modelcfg, module) })
      perId.set(module.id, lijst)
    }
  }
  return perId
}

function soortVan(module: Busmodule, vorm: SchermUitvoer | undefined): Apparaatsoort {
  if (vorm && vorm.knoppenOpScherm.length > 0) return 'touchscreen'
  const scherm = Boolean(vorm) || module.vakken.length > 0
  if (scherm) return module.knoppen.length > 0 ? 'scherm' : 'display'
  return 'knoppen'
}

/** Wat er in een busmap zit, voor de lijst in de app. */
export function analyseerBusmap(omsiPath: string, modelcfgs: string[], sleutel: string): Busanalyse {
  const begin = Date.now()
  const apparaten: Busapparaat[] = []
  for (const [id, lijst] of leesMap(omsiPath, modelcfgs)) {
    /* De variant met de meeste knoppen, en bij gelijkspel die met een vorm. */
    const beste = [...lijst].sort(
      (a, b) =>
        b.module.knoppen.length - a.module.knoppen.length || Number(Boolean(b.vorm)) - Number(Boolean(a.vorm))
    )[0]
    const soort = soortVan(beste.module, beste.vorm)
    const acties = new Set<string>()
    for (const { module, vorm } of lijst) {
      for (const knop of module.knoppen) acties.add(knop.actie.toLowerCase())
      for (const klik of vorm?.vorm.klikken ?? []) acties.add(klik.actie.toLowerCase())
    }
    const onvolledig = beste.vorm?.vorm.onvolledig ?? []
    apparaten.push({
      id,
      naam: beste.module.naam,
      soort,
      knoppen: acties.size,
      getekend: Boolean(beste.vorm),
      beperking: onvolledig.some((regel) => /scripttextuur|script/i.test(regel))
        ? 'script'
        : onvolledig.some((regel) => /versleuteld/i.test(regel))
          ? 'versleuteld'
          : undefined,
      aanbevolen: (soort === 'touchscreen' || soort === 'scherm') && acties.size >= MIN_KNOPPEN_AANBEVOLEN
    })
  }
  /* Eerst wat de app aanraadt, dan op naam. */
  apparaten.sort(
    (a, b) => Number(b.aanbevolen) - Number(a.aanbevolen) || a.naam.localeCompare(b.naam, 'nl')
  )
  return { sleutel, apparaten, ms: Date.now() - begin }
}

/**
 * De knoppen die aan een toets moeten, PER VARIANT (per model.cfg).
 *
 * Een variant is voor de toetsen een eigen bus. In de map van de Kajosoft-Citybus
 * heeft de ene variant een RG-kastje met 31 knoppen en de andere een RG6 met 80;
 * binnen één bus heeft elke knop een eigen toets nodig, en er zijn er maar een
 * stuk of 53. Maar twee varianten rijden nooit tegelijk, dus mogen ze toetsen
 * met elkaar delen -- zolang elke variant wordt bijgeschreven met zijn eigen
 * triggers (triggersVan). Wie de hele map als één bus behandelt, krijgt 111
 * knoppen die allemaal een eigen toets eisen.
 *
 * In de volgorde van belang: eerst wat op een scherm ligt, dan de toetsen op een
 * apparaat, en als laatste de losse knoppen van een touchscreen (de klep, de
 * grendel, het wisselgeld). Hetzelfde onderscheid als busPanelen in
 * main/index.ts tijdens het rijden.
 */
export function actiesPerVariant(
  omsiPath: string,
  modelcfgs: string[],
  ids: string[]
): Record<string, string[]> {
  const gekozen = new Set(ids)
  const uit: Record<string, string[]> = {}
  for (const modelcfg of modelcfgs) {
    let modules: Busmodule[]
    try {
      modules = modulesVanModel(modelcfg)
    } catch {
      continue
    }
    const scherm: string[] = []
    const opApparaat: string[] = []
    const los: string[] = []
    for (const module of modules) {
      if (!gekozen.has(module.id)) continue
      const vorm = vormVan(omsiPath, modelcfg, module)
      const opScherm = new Set((vorm?.knoppenOpScherm ?? []).map((actie) => actie.toLowerCase()))
      for (const klik of vorm?.vorm.klikken ?? []) scherm.push(klik.actie)
      const bijApparaat = vorm ? knoppenOpApparaat(vorm) : new Set<string>()
      const touchscreen = opScherm.size > 0
      for (const knop of module.knoppen) {
        if (opScherm.has(knop.actie.toLowerCase())) continue
        if (touchscreen && !bijApparaat.has(knop.actie.toLowerCase())) los.push(knop.actie)
        else opApparaat.push(knop.actie)
      }
    }
    /* Eén keer per naam; wie het eerst kwam, houdt zijn plek in de volgorde. */
    const gezien = new Set<string>()
    const acties = [...scherm, ...opApparaat, ...los].filter((actie) => {
      const klein = actie.toLowerCase()
      if (gezien.has(klein)) return false
      gezien.add(klein)
      return true
    })
    if (acties.length > 0) uit[modelcfg] = acties
  }
  return uit
}
