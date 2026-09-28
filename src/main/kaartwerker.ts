import { parentPort, workerData } from 'node:worker_threads'
import { maakKaartlaag } from '../core/kaartlaag'
import { actiesPerVariant, analyseerBusmap, busmappen, modelcfgsVan, type Busanalyse } from '../core/busklaar'
import type { DutyRequest, VrijWanneer } from '../shared/api'
import type { OmsiKeuze } from '../core/omloopvolgen'
import type { Monster } from '../core/kaartherkenning'

/**
 * Het zware werk, buiten het hoofdproces.
 *
 * WAAROM DIT BESTAAT
 * Het hoofdproces van Electron doet één ding tegelijk. Zolang het een kaart
 * uitleest, een dienstenlijst samenstelt of een route plant, beweegt er geen
 * knop, geen venster en geen overlay: de app hangt. Gemeten op deze
 * installatie, in het logboek van een gewone opzet: `map:geometry` 2767 ms,
 * `duty:list` 1989 ms, `map:routes` 810 ms. Dat is de klacht die op 19-09-2026
 * binnenkwam -- "hängt sich ständig auf nach jedem drücken eines Buttons",
 * "besonders häufig in der Dienstauswahl".
 *
 * Deze werker doet datzelfde werk in een eigen thread. Het hoofdproces stuurt
 * een opdracht en gaat door met het scherm; het antwoord komt binnen als het
 * klaar is. Beide kanten gebruiken dezelfde `core/kaartlaag.ts`, dus er is één
 * plek waar staat hoe een kaart gelezen wordt.
 *
 * Geen Electron hierbinnen: een worker_thread heeft geen app, geen vensters en
 * geen IPC van Electron. Alles wat hij nodig heeft komt binnen als pad.
 */

type Opdracht =
  | { id: number; soort: 'kaart'; folder: string }
  | { id: number; soort: 'overzicht' }
  | { id: number; soort: 'voertuigen' }
  | { id: number; soort: 'busvoorstel'; folder: string }
  | { id: number; soort: 'hofaanbod'; folder: string }
  | { id: number; soort: 'hofaanbodvoor'; folder: string; busmap: string }
  | { id: number; soort: 'hofaanbodrit'; termini: string[]; busmap: string }
  | { id: number; soort: 'hofkandidaat'; termini: string[]; busmap: string; kaart?: string }
  | { id: number; soort: 'bustekening'; busPad: string; kleurstelling?: string }
  | { id: number; soort: 'kleurstellingen'; busPad: string }
  | { id: number; soort: 'diensten'; request: DutyRequest }
  | { id: number; soort: 'routes'; folder: string; legs: Array<{ tripFile: string; stopIds: string[] }> }
  | { id: number; soort: 'busmappen' }
  | { id: number; soort: 'busanalyse'; sleutel: string }
  | { id: number; soort: 'busacties'; sleutel: string; ids: string[] }
  /*
   * Vrij rijden. Een dienstregeling en een rijstrokennet lezen kost koud tot
   * seconden (HamburgLi20 1759 ms, het net van Ahlheim 3084 ms); dat hoort
   * niet in het hoofdproces, dat intussen de overlay moet tekenen.
   */
  | { id: number; soort: 'vrijcheck'; folder: string; wanneer?: VrijWanneer }
  | {
      id: number
      soort: 'koppel'
      folder: string
      keuze: OmsiKeuze
      datum?: string
      voorkeur?: 'bestand' | 'vertrek'
    }
  | {
      id: number
      soort: 'vertrekken'
      folder: string
      datum?: string
      klok: number
      bus?: { x: number; y: number }
    }
  /*
   * Welke kaart OMSI speelt, aan de plek van de bus. De eerste keer leest dat
   * global.cfg en het terrein van alle kaarten: 62 tot 75 ms, en dat stond in
   * het hoofdproces midden in het volgen.
   */
  | { id: number; soort: 'herken'; folder: string; monsters: Monster[] }
  | {
      id: number
      soort: 'elders'
      folder: string
      keuze: { lineName: string; trip: number; tripName: string }
      monsters: Monster[]
    }
  /* De wagenparken naast een bus bij vrij rijden: koud 63 tot 348 ms. */
  | { id: number; soort: 'vrijewagenparken'; folder: string; vehiclePath: string; year: number }
  // De planning van het busbedrijf: de dienst voor OMSI en het lijnplan voor de vlootkaart.
  | { id: number; soort: 'dienstduty'; folder: string; deel: { lineFile: string; tourNumber: string; days: number; ritten: string[] } }
  | { id: number; soort: 'lijnplan'; folder: string; lineFiles: string[]; anker: string; dag: number }

interface Antwoord {
  id: number
  ok: boolean
  ms: number
  uitkomst?: unknown
  fout?: string
  /** Waar de tijd heen ging, als de opdracht dat zelf kan zeggen. */
  detail?: string
}

const { omsiPath, userData } = workerData as { omsiPath: string; userData: string }
const laag = maakKaartlaag(omsiPath, userData)

/*
 * Een bus uitlezen kost van twee seconden (de HH20) tot bijna een minuut (een
 * map met acht modellen en vijf touchscreens per model). Wat al gelezen is, blijft
 * bewaard zolang de werker leeft: de bestanden van een bus veranderen niet
 * terwijl de app open staat, en wie dezelfde bus nog eens aantikt hoort niet
 * opnieuw te wachten.
 */
const analyses = new Map<string, Busanalyse>()

parentPort?.on('message', (opdracht: Opdracht) => {
  const begin = Date.now()
  try {
    let uitkomst: unknown
    let detail: string | undefined
    if (opdracht.soort === 'kaart') laag.leesKaart(opdracht.folder)
    else if (opdracht.soort === 'overzicht') uitkomst = laag.overzicht()
    else if (opdracht.soort === 'voertuigen') uitkomst = laag.voertuigen()
    else if (opdracht.soort === 'busvoorstel') uitkomst = laag.busvoorstel(opdracht.folder)
    else if (opdracht.soort === 'hofaanbod') {
      /*
       * Uitgesplitst, want het logboek van een speler zette deze opdracht op
       * 27724 ms en daaruit valt niet af te lezen waar dat zat: de kaart die
       * zijn bestemmingen moet geven, de wagenparkbestanden van schijf, of het
       * vergelijken zelf. Hier kost het bij elkaar een tiende seconde, dus dat
       * moeten we van zijn machine horen.
       */
      const t1 = Date.now()
      const bestemmingen = laag.eindbestemmingen(opdracht.folder).length
      const t2 = Date.now()
      const bestanden = laag.wagenparkBestanden().length
      const t3 = Date.now()
      uitkomst = laag.hofAanbod(opdracht.folder)
      detail =
        `${bestemmingen} bestemmingen ${t2 - t1} ms, ` +
        `${bestanden} wagenparken ${t3 - t2} ms, vergelijken ${Date.now() - t3} ms`
    } else if (opdracht.soort === 'hofaanbodvoor')
      uitkomst = laag.hofAanbodVoor(opdracht.folder, opdracht.busmap)
    else if (opdracht.soort === 'hofaanbodrit')
      uitkomst = laag.hofAanbodVoorRit(opdracht.termini, opdracht.busmap)
    else if (opdracht.soort === 'hofkandidaat')
      uitkomst = laag.wagenparkKandidaat(opdracht.termini, opdracht.busmap, opdracht.kaart)
    else if (opdracht.soort === 'bustekening')
      uitkomst = laag.bustekening(opdracht.busPad, opdracht.kleurstelling)
    else if (opdracht.soort === 'kleurstellingen') uitkomst = laag.kleurstellingen(opdracht.busPad)
    else if (opdracht.soort === 'diensten') uitkomst = laag.diensten(opdracht.request)
    else if (opdracht.soort === 'busmappen') uitkomst = busmappen(laag.voertuigen())
    else if (opdracht.soort === 'busanalyse') {
      let analyse = analyses.get(opdracht.sleutel)
      if (!analyse) {
        const cfgs = modelcfgsVan(omsiPath, laag.voertuigen(), opdracht.sleutel)
        analyse = analyseerBusmap(omsiPath, cfgs, opdracht.sleutel)
        analyses.set(opdracht.sleutel, analyse)
        detail = `${cfgs.length} modellen, ${analyse.apparaten.length} apparaten`
      }
      uitkomst = analyse
    } else if (opdracht.soort === 'busacties') {
      const cfgs = modelcfgsVan(omsiPath, laag.voertuigen(), opdracht.sleutel)
      uitkomst = actiesPerVariant(omsiPath, cfgs, opdracht.ids)
    } else if (opdracht.soort === 'vrijcheck') uitkomst = laag.vrijCheck(opdracht.folder, opdracht.wanneer)
    else if (opdracht.soort === 'koppel')
      uitkomst = laag.koppel(opdracht.folder, opdracht.keuze, opdracht.datum, opdracht.voorkeur)
    else if (opdracht.soort === 'vertrekken')
      uitkomst = laag.vertrekken(opdracht.folder, opdracht.datum, opdracht.klok, opdracht.bus)
    else if (opdracht.soort === 'herken') uitkomst = laag.herken(opdracht.folder, opdracht.monsters)
    else if (opdracht.soort === 'elders')
      uitkomst = laag.elders(opdracht.folder, opdracht.keuze, opdracht.monsters)
    else if (opdracht.soort === 'vrijewagenparken')
      uitkomst = laag.vrijeWagenparken(opdracht.folder, opdracht.vehiclePath, opdracht.year)
    else if (opdracht.soort === 'dienstduty') uitkomst = laag.dienstDuty(opdracht.folder, opdracht.deel)
    else if (opdracht.soort === 'lijnplan')
      uitkomst = laag.lijnplan(opdracht.folder, opdracht.lineFiles, opdracht.anker, opdracht.dag)
    else if (opdracht.soort === 'routes') uitkomst = laag.routes(opdracht.folder, opdracht.legs)
    // Een opdracht die hier niet staat, is een fout en geen stille route-aanvraag.
    else throw new Error(`onbekende opdracht: ${(opdracht as { soort: string }).soort}`)

    const antwoord: Antwoord = { id: opdracht.id, ok: true, ms: Date.now() - begin, uitkomst, detail }
    parentPort?.postMessage(antwoord)
  } catch (fout) {
    const antwoord: Antwoord = {
      id: opdracht.id,
      ok: false,
      ms: Date.now() - begin,
      fout: fout instanceof Error ? fout.message : String(fout)
    }
    parentPort?.postMessage(antwoord)
  }
})
