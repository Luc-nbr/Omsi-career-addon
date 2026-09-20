import { parentPort, workerData } from 'node:worker_threads'
import { maakKaartlaag } from '../core/kaartlaag'
import type { DutyRequest } from '../shared/api'

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
  | { id: number; soort: 'bustekening'; busPad: string }
  | { id: number; soort: 'diensten'; request: DutyRequest }
  | { id: number; soort: 'routes'; folder: string; legs: Array<{ tripFile: string; stopIds: string[] }> }

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
    else if (opdracht.soort === 'bustekening') uitkomst = laag.bustekening(opdracht.busPad)
    else if (opdracht.soort === 'diensten') uitkomst = laag.diensten(opdracht.request)
    else uitkomst = laag.routes(opdracht.folder, opdracht.legs)

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
