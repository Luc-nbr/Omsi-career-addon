import { contextBridge, ipcRenderer } from 'electron'
import type { CareerApi, DutyRequest } from '../shared/api'

/**
 * De renderer praat alleen via deze brug met het bestandssysteem; er staat geen
 * Node-toegang open in de pagina zelf.
 */
const api: CareerApi = {
  status: () => ipcRenderer.invoke('omsi:status'),
  maps: () => ipcRenderer.invoke('omsi:maps'),
  vehicles: () => ipcRenderer.invoke('omsi:vehicles'),
  pluginStatus: () => ipcRenderer.invoke('plugin:status'),
  listDuties: (request: DutyRequest) => ipcRenderer.invoke('duty:list', request),
  ibis: (duty, vehicle, year) => ipcRenderer.invoke('duty:ibis', duty, vehicle, year),
  toggleOverlay: (duty) => ipcRenderer.invoke('overlay:toggle', duty),
  beginDuty: (duty) => ipcRenderer.invoke('duty:begin', duty),
  liveConnected: () => ipcRenderer.invoke('omsi:live'),
  career: () => ipcRenderer.invoke('career:load'),
  createProfile: (name) => ipcRenderer.invoke('career:create', name),
  selectProfile: (id) => ipcRenderer.invoke('career:select', id),
  deleteProfile: (id) => ipcRenderer.invoke('career:delete', id),
  checkSession: () => ipcRenderer.invoke('duty:session'),
  completeDuty: (duty, vehicle, measured) =>
    ipcRenderer.invoke('career:complete', duty, vehicle, measured),
  renameDriver: (name) => ipcRenderer.invoke('career:rename', name)
}

contextBridge.exposeInMainWorld('career', api)

/**
 * Het overlayvenster krijgt zijn gegevens geduwd vanuit het hoofdproces; het
 * leest zelf niets van schijf.
 */
contextBridge.exposeInMainWorld('overlay', {
  onFrame: (handler: (frame: unknown) => void) =>
    ipcRenderer.on('overlay:frame', (_event, frame) => handler(frame))
})
