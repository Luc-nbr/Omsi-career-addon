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
  geometry: (mapFolder) => ipcRenderer.invoke('map:geometry', mapFolder),
  pluginStatus: () => ipcRenderer.invoke('plugin:status'),
  listDuties: (request: DutyRequest) => ipcRenderer.invoke('duty:list', request),
  ibis: (duty, vehicle, year) => ipcRenderer.invoke('duty:ibis', duty, vehicle, year),
  toggleOverlay: (duty) => ipcRenderer.invoke('overlay:toggle', duty),
  beginDuty: (duty) => ipcRenderer.invoke('duty:begin', duty),
  liveConnected: () => ipcRenderer.invoke('omsi:live'),
  printers: () => ipcRenderer.invoke('print:printers'),
  printReceipt: (payload, deviceName) => ipcRenderer.invoke('print:receipt', payload, deviceName),
  previewReceipt: (payload) => ipcRenderer.invoke('print:preview', payload),
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
/** Het dienstkaartje krijgt zijn gegevens geduwd en meldt terug hoe hoog het werd. */
contextBridge.exposeInMainWorld('receipt', {
  onData: (handler: (data: unknown) => void) =>
    ipcRenderer.on('receipt:data', (_event, data) => handler(data)),
  ready: (heightPx: number) => ipcRenderer.send('receipt:ready', heightPx)
})

contextBridge.exposeInMainWorld('overlay', {
  onFrame: (handler: (frame: unknown) => void) =>
    ipcRenderer.on('overlay:frame', (_event, frame) => handler(frame))
})
