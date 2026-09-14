import { contextBridge, ipcRenderer } from 'electron'
import type { CareerApi, DutyRequest, LaunchRequest } from '../shared/api'

/**
 * De renderer praat alleen via deze brug met het bestandssysteem; er staat geen
 * Node-toegang open in de pagina zelf.
 */
const api: CareerApi = {
  status: () => ipcRenderer.invoke('omsi:status'),
  maps: () => ipcRenderer.invoke('omsi:maps'),
  vehicles: () => ipcRenderer.invoke('omsi:vehicles'),
  generateDuty: (request: DutyRequest) => ipcRenderer.invoke('duty:generate', request),
  ibis: (duty, vehicle, year) => ipcRenderer.invoke('duty:ibis', duty, vehicle, year),
  launch: (request: LaunchRequest) => ipcRenderer.invoke('duty:launch', request),
  career: () => ipcRenderer.invoke('career:load'),
  checkSession: () => ipcRenderer.invoke('duty:session'),
  completeDuty: (duty, vehicle, measured) =>
    ipcRenderer.invoke('career:complete', duty, vehicle, measured),
  renameDriver: (name) => ipcRenderer.invoke('career:rename', name)
}

contextBridge.exposeInMainWorld('career', api)
