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
  | { id: number; soort: 'diensten'; request: DutyRequest }
  | { id: number; soort: 'routes'; folder: string; legs: Array<{ tripFile: string; stopIds: string[] }> }

interface Antwoord {
  id: number
  ok: boolean
  ms: number
  uitkomst?: unknown
  fout?: string
}

const { omsiPath, userData } = workerData as { omsiPath: string; userData: string }
const laag = maakKaartlaag(omsiPath, userData)

parentPort?.on('message', (opdracht: Opdracht) => {
  const begin = Date.now()
  try {
    let uitkomst: unknown
    if (opdracht.soort === 'kaart') laag.leesKaart(opdracht.folder)
    else if (opdracht.soort === 'overzicht') uitkomst = laag.overzicht()
    else if (opdracht.soort === 'diensten') uitkomst = laag.diensten(opdracht.request)
    else uitkomst = laag.routes(opdracht.folder, opdracht.legs)

    const antwoord: Antwoord = { id: opdracht.id, ok: true, ms: Date.now() - begin, uitkomst }
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
