import { contextBridge, ipcRenderer } from 'electron'

/**
 * De brug voor het venster dat busfoto's maakt.
 *
 * Een eigen brug en niet die van de app: dit venster hoort niets te kunnen
 * behalve een tekening ontvangen en een plaatje terugsturen. Het ziet geen
 * profielen, geen OMSI-map en geen bestanden.
 */
contextBridge.exposeInMainWorld('busfoto', {
  opTekening: (doen: (plan: unknown) => void): void => {
    ipcRenderer.on('busfoto:teken', (_gebeurtenis, plan) => doen(plan))
  },
  klaar: (png: string, tijden?: unknown): void => {
    ipcRenderer.send('busfoto:klaar', png, tijden)
  },
  mislukt: (reden: string): void => {
    ipcRenderer.send('busfoto:mislukt', reden)
  }
})
