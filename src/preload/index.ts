import { contextBridge, ipcRenderer } from 'electron'
import type { CareerApi, DutyRequest, KaartenStand } from '../shared/api'

/**
 * De renderer praat alleen via deze brug met het bestandssysteem; er staat geen
 * Node-toegang open in de pagina zelf.
 */
const api: CareerApi = {
  status: () => ipcRenderer.invoke('omsi:status'),
  chooseOmsi: () => ipcRenderer.invoke('omsi:choose'),
  version: () => ipcRenderer.invoke('app:version'),
  logboekOpenen: () => ipcRenderer.invoke('logboek:openen'),
  logboekMelden: (regel) => ipcRenderer.invoke('logboek:melden', regel),
  busFoto: (relatiefPad) => ipcRenderer.invoke('bus:foto', relatiefPad),
  kaartenStand: () => ipcRenderer.invoke('kaarten:stand'),
  kaartenVoorbereiden: () => ipcRenderer.invoke('kaarten:voorbereiden'),
  /** Meeluisteren met het klaarzetten; geeft een opzegfunctie terug. */
  opKaartenWarm: (luisteraar: (stand: KaartenStand) => void) => {
    const heen = (_gebeurtenis: unknown, stand: KaartenStand): void => luisteraar(stand)
    ipcRenderer.on('kaarten:warm', heen)
    return () => ipcRenderer.removeListener('kaarten:warm', heen)
  },
  screenMode: () => ipcRenderer.invoke('omsi:screen'),
  maps: () => ipcRenderer.invoke('omsi:maps'),
  checkInstalled: () => ipcRenderer.invoke('omsi:check'),
  vehicles: () => ipcRenderer.invoke('omsi:vehicles'),
  suggestVehicle: (mapFolder) => ipcRenderer.invoke('fleet:suggest', mapFolder),
  geometry: (mapFolder) => ipcRenderer.invoke('map:geometry', mapFolder),
  routes: (mapFolder, legs) => ipcRenderer.invoke('map:routes', mapFolder, legs),
  pluginStatus: () => ipcRenderer.invoke('plugin:status'),
  settings: () => ipcRenderer.invoke('settings:read'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:write', settings),
  listDuties: (request: DutyRequest) => ipcRenderer.invoke('duty:list', request),
  lines: (mapFolder) => ipcRenderer.invoke('map:lines', mapFolder),
  examDuty: (mapFolder, lineFile) => ipcRenderer.invoke('duty:exam', mapFolder, lineFile),
  finishExam: (duty, measured, basic) => ipcRenderer.invoke('career:exam', duty, measured, basic),
  startFree: (request) => ipcRenderer.invoke('free:start', request),
  ibis: (duty, vehicle, year, yard) => ipcRenderer.invoke('duty:ibis', duty, vehicle, year, yard),
  yards: (duty, vehicle, year) => ipcRenderer.invoke('duty:yards', duty, vehicle, year),
  setOverlay: (duty, open, ibis) => ipcRenderer.invoke('overlay:set', duty, open, ibis),
  overlayIsOpen: () => ipcRenderer.invoke('overlay:isOpen'),
  onOverlayState: (handler) => {
    const listener = (_event: unknown, open: boolean): void => handler(open)
    ipcRenderer.on('overlay:state', listener)
    return () => ipcRenderer.removeListener('overlay:state', listener)
  },
  closeOverlay: () => ipcRenderer.invoke('overlay:close'),
  editOverlay: (on) => ipcRenderer.invoke('overlay:edit', on),
  overlayHit: (on) => ipcRenderer.invoke('overlay:hit', on),
  overlayGrab: (on) => ipcRenderer.invoke('overlay:grab', on),
  overlayBounds: (box) => ipcRenderer.invoke('overlay:bounds', box),
  overlayLayout: () => ipcRenderer.invoke('overlay:layout'),
  saveOverlayLayout: (layout) => ipcRenderer.invoke('overlay:layout:save', layout),
  resetOverlayLayout: () => ipcRenderer.invoke('overlay:layout:reset'),
  confirmDuty: (assignment, vehicleOverride, mode, exam) =>
    ipcRenderer.invoke('duty:confirm', assignment, vehicleOverride, mode, exam),
  cancelDuty: () => ipcRenderer.invoke('duty:cancel'),
  beginDuty: (request) => ipcRenderer.invoke('duty:begin', request),
  liveConnected: () => ipcRenderer.invoke('omsi:live'),
  liveStatus: () => ipcRenderer.invoke('live:status'),
  omsiRunning: () => ipcRenderer.invoke('omsi:running'),
  gameSettings: () => ipcRenderer.invoke('game:settings'),
  saveGameSettings: (changes) => ipcRenderer.invoke('game:settings:save', changes),
  gameKeys: () => ipcRenderer.invoke('game:keys'),
  gameControllers: () => ipcRenderer.invoke('game:controllers'),
  saveGameControllers: (controllers) => ipcRenderer.invoke('game:controllers:save', controllers),
  saveGameKeys: (bindings) => ipcRenderer.invoke('game:keys:save', bindings),
  resetGameKeys: () => ipcRenderer.invoke('game:keys:reset'),
  printers: () => ipcRenderer.invoke('print:printers'),
  printReceipt: (payload, deviceName) => ipcRenderer.invoke('print:receipt', payload, deviceName),
  previewReceipt: (payload) => ipcRenderer.invoke('print:preview', payload),
  career: () => ipcRenderer.invoke('career:load'),
  createProfile: (name) => ipcRenderer.invoke('career:create', name),
  selectProfile: (id) => ipcRenderer.invoke('career:select', id),
  deleteProfile: (id) => ipcRenderer.invoke('career:delete', id),
  chooseProfilePhoto: (id) => ipcRenderer.invoke('career:photo', id),
  clearProfilePhoto: (id) => ipcRenderer.invoke('career:photo:clear', id),
  checkSession: () => ipcRenderer.invoke('duty:session'),
  completeDuty: (duty, vehicle, measured) =>
    ipcRenderer.invoke('career:complete', duty, vehicle, measured),
  renameDriver: (name) => ipcRenderer.invoke('career:rename', name),
  omsiState: () => ipcRenderer.invoke('omsi:state'),
  confirmOmsi: (path) => ipcRenderer.invoke('omsi:confirm', path),
  browseOmsi: () => ipcRenderer.invoke('omsi:browse'),
  hofOffers: (mapFolder) => ipcRenderer.invoke('hof:offers', mapFolder),
  hofOfferFor: (mapFolder, folder) => ipcRenderer.invoke('hof:offerFor', mapFolder, folder),
  hofOfferForDuty: (duty, folder) => ipcRenderer.invoke('hof:offerForDuty', duty, folder),
  hofCandidate: (duty, folder) => ipcRenderer.invoke('hof:candidate', duty, folder),
  placeHofCandidate: (duty, folder) => ipcRenderer.invoke('hof:placeCandidate', duty, folder),
  placeHofs: (mapFolder, folders) => ipcRenderer.invoke('hof:place', mapFolder, folders)
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
    ipcRenderer.on('overlay:frame', (_event, frame) => handler(frame)),
  onCycle: (handler: () => void) => ipcRenderer.on('overlay:cycle', () => handler())
})
