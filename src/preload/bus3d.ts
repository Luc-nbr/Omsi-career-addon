import { contextBridge, ipcRenderer } from 'electron'
import type {
  Bus3dBrug,
  Bus3dFotoVraag,
  Bus3dMeting,
  Bus3dStalen,
  Bus3dVensterInstellingen,
  Bus3dVensterStand,
  Bus3dVensterVraag,
  Bus3dVoortgang
} from '../shared/bus3d'

/**
 * De brug van het 3D-venster (bus3d-ontwerp §8.1, §11.3).
 *
 * Een eigen, smalle brug en niet die van de app: dit venster ziet geen
 * profielen, geen OMSI-map en geen instellingen, net als het fotovenster. Het
 * vraagt een bus op zijn relatieve pad, krijgt het manifest en haalt de rest op
 * id via `omsi3d://`. Daarbij het venster zelf: de vraag waarmee het opende,
 * taal en thema, pauze en lichte stand, de kleurstellingen met hun stalen, en
 * kiezen en sluiten. Main toetst bij elk kanaal of het van dit venster komt
 * (main/bus3dvenster.ts); het verborgen fotovenster (foto v4) laadt dezelfde
 * pagina en brug, en krijgt alleen de fotovragen.
 */

/** Een luisteraar op een kanaal, met een opzegfunctie. */
function luister<T extends unknown[]>(kanaal: string, doe: (...args: T) => void): () => void {
  const heen = (_e: unknown, ...args: unknown[]): void => doe(...(args as T))
  ipcRenderer.on(kanaal, heen)
  return () => {
    ipcRenderer.removeListener(kanaal, heen)
  }
}

const brug: Bus3dBrug = {
  busModel3d: (relatiefPad, kleurstelling) => ipcRenderer.invoke('bus:model3d', relatiefPad, kleurstelling),
  busLak3d: (pakket, kleurstelling, extra) => ipcRenderer.invoke('bus:lak3d', pakket, kleurstelling, extra),
  busOmgeving3d: () => ipcRenderer.invoke('bus:omgeving3d'),
  busHeldenbeeld: (pakket, kleurstelling, sleutel, webp) =>
    ipcRenderer.invoke('bus:heldenbeeld', pakket, kleurstelling, sleutel, new Uint8Array(webp)),
  busFotoAlsKlaar: (relatiefPad, kleurstelling, verhouding) =>
    ipcRenderer.invoke('bus:fotoAlsKlaar', relatiefPad, kleurstelling, verhouding),
  bus3dMeld: (meting: Bus3dMeting) => ipcRenderer.send('bus:meld3d', meting),
  bus3dStuk: (pakket: string) => ipcRenderer.send('bus:stuk3d', pakket),
  opBus3dVoortgang: (l) => luister<[Bus3dVoortgang]>('bus3d:voortgang', l),
  opBus3dVervangen: (l) => luister<[string]>('bus3d:vervangen', l),

  vraag: () => ipcRenderer.invoke('bus3d:vraag'),
  opVraag: (l) => luister<[Bus3dVensterVraag]>('bus3d:vraag', l),
  opInstellingen: (l) => luister<[Bus3dVensterInstellingen]>('bus3d:instellingen', l),
  opStand: (l) => luister<[Bus3dVensterStand]>('bus3d:stand', l),
  kies: (keuze) => ipcRenderer.send('bus3d:kies', keuze),
  sluit: () => ipcRenderer.send('bus3d:sluitVenster'),
  getoond: () => ipcRenderer.send('bus3d:getoond'),
  busKleurstellingen: (relatiefPad) => ipcRenderer.invoke('bus3d:kleurstellingen', relatiefPad),
  busKleurstalen: (relatiefPad) => ipcRenderer.invoke('bus3d:kleurstalen', relatiefPad),
  opKleurstalen: (l) => luister<[string, Bus3dStalen]>('bus3d:stalen', l),

  naarStudio: (lak) => ipcRenderer.invoke('bus3d:naarStudio', lak),
  lakProjecten: (rel) => ipcRenderer.invoke('lak:projecten', rel),
  lakDoelen: (rel, start, extra) => ipcRenderer.invoke('lak:doelen', rel, start, extra),
  lakOpties: (rel) => ipcRenderer.invoke('lak:opties', rel),
  lakLaad: (id) => ipcRenderer.invoke('lak:laad', id),
  lakBewaar: (project) => ipcRenderer.invoke('lak:bewaar', project),
  lakBeeld: (id, bytes) => ipcRenderer.invoke('lak:beeld', id, new Uint8Array(bytes)),
  lakBeeldBytes: (id, beeld) => ipcRenderer.invoke('lak:beeldBytes', id, beeld),
  lakNaamVrij: (rel, naam, id) => ipcRenderer.invoke('lak:naamVrij', rel, naam, id),
  lakPlaats: (id, naam, texturen, keuze) =>
    ipcRenderer.invoke(
      'lak:plaats',
      id,
      naam,
      texturen.map((t) => ({ doel: t.doel, dds: new Uint8Array(t.dds) })),
      keuze
    ),
  lakVerwijder: (id, ookOntwerp, keuze) => ipcRenderer.invoke('lak:verwijder', id, ookOntwerp, keuze),
  lakGebruik: (rel, naam) => ipcRenderer.invoke('lak:gebruik', rel, naam),
  opKleurstellingenVeranderd: (l) => luister<[string[]]>('bus:kleurstellingenVeranderd', l),
  opLakGeplaatst: (l) => luister<[{ naam: string }]>('lak:geplaatst', l),

  opFotoVraag: (l) => luister<[Bus3dFotoVraag]>('bus3d:fotoVraag', l),
  fotoGereed: () => ipcRenderer.send('bus3d:fotoGereed'),
  fotoKlaar: (id, uitkomst) =>
    ipcRenderer.send('bus3d:fotoKlaar', id, 'webp' in uitkomst ? { webp: new Uint8Array(uitkomst.webp) } : uitkomst)
}

contextBridge.exposeInMainWorld('bus3d', brug)
