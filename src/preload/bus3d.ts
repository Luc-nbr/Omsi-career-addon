import { contextBridge, ipcRenderer } from 'electron'
import type { Bus3dBrug, Bus3dMeting, Bus3dVoortgang } from '../shared/bus3d'

/**
 * De brug van het 3D-venster (bus3d-ontwerp §8.1, §11.3).
 *
 * Een eigen, smalle brug en niet die van de app: dit venster ziet geen
 * profielen, geen OMSI-map en geen instellingen, net als het fotovenster. Het
 * vraagt een bus op zijn relatieve pad, krijgt het manifest en haalt de rest op
 * id via `omsi3d://`.
 *
 * Wat hier staat hoort bij de viewer (F2, eerste helft). Het venster eromheen --
 * de vraag bij het openen, kiezen, sluiten, taal en thema -- komt erbij met
 * main/bus3dvenster.ts.
 */
const brug: Bus3dBrug = {
  busModel3d: (relatiefPad, kleurstelling) => ipcRenderer.invoke('bus:model3d', relatiefPad, kleurstelling),
  busLak3d: (pakket, kleurstelling) => ipcRenderer.invoke('bus:lak3d', pakket, kleurstelling),
  busOmgeving3d: () => ipcRenderer.invoke('bus:omgeving3d'),
  busHeldenbeeld: (pakket, kleurstelling, sleutel, webp) =>
    ipcRenderer.invoke('bus:heldenbeeld', pakket, kleurstelling, sleutel, new Uint8Array(webp)),
  busFotoAlsKlaar: (relatiefPad, kleurstelling, verhouding) =>
    ipcRenderer.invoke('bus:fotoAlsKlaar', relatiefPad, kleurstelling, verhouding),
  bus3dMeld: (meting: Bus3dMeting) => ipcRenderer.send('bus:meld3d', meting),
  bus3dStuk: (pakket: string) => ipcRenderer.send('bus:stuk3d', pakket),
  opBus3dVoortgang: (luister) => {
    const doe = (_e: unknown, v: Bus3dVoortgang): void => luister(v)
    ipcRenderer.on('bus3d:voortgang', doe)
    return () => {
      ipcRenderer.removeListener('bus3d:voortgang', doe)
    }
  },
  opBus3dVervangen: (luister) => {
    const doe = (_e: unknown, pakket: string): void => luister(pakket)
    ipcRenderer.on('bus3d:vervangen', doe)
    return () => {
      ipcRenderer.removeListener('bus3d:vervangen', doe)
    }
  }
}

contextBridge.exposeInMainWorld('bus3d', brug)
