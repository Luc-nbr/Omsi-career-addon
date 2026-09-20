/**
 * Doet "opnieuw kijken" nog wat het deed, en blijft het hoofdproces vrij?
 *
 *   npx electron-vite build && npx electron scripts/probe-check.cjs
 *
 * `omsi:check` las vroeger elke dienstregeling van elke kaart in het
 * hoofdproces in. Deze proef vraagt het twee keer achter elkaar, kijkt of de
 * lijsten hetzelfde blijven -- en of de tweede keer geen kaarten als nieuw
 * meldt -- en tikt intussen elke 20 ms om te zien hoe lang het hoofdproces
 * stilstaat. Draait met een eigen gebruikersmap en schrijft niets in de
 * spelmap.
 */
const { app, BrowserWindow } = require('electron')
const { mkdtempSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

app.setPath('userData', mkdtempSync(join(tmpdir(), 'omsi-check-')))
setTimeout(() => { console.error('time-out'); app.exit(1) }, 180000).unref()
require('../out/main/index.js')

const wacht = (ms) => new Promise((r) => setTimeout(r, ms))

app.whenReady().then(async () => {
  await wacht(4000)
  const win = BrowserWindow.getAllWindows()[0]

  // Hapert het hoofdproces tijdens de vraag? Elke 20 ms een tik.
  let ergste = 0
  let vorige = Date.now()
  const tik = setInterval(() => {
    const nu = Date.now()
    ergste = Math.max(ergste, nu - vorige - 20)
    vorige = nu
  }, 20)

  const uit = await win.webContents.executeJavaScript(`(async () => {
    const begin = Date.now()
    const eerste = await window.career.checkInstalled()
    const na = Date.now() - begin
    const tweede = await window.career.checkInstalled()
    return { na, tweedeMs: Date.now() - begin - na,
             kaarten: eerste.maps.length, bussen: eerste.vehicles.length,
             eerst: eerste.first, erbij: eerste.addedMaps.length,
             tweedeKaarten: tweede.maps.length, tweedeErbij: tweede.addedMaps.length,
             namen: eerste.maps.slice(0, 3).map((m) => m.name + ' (' + m.tours + ')') }
  })()`)
  clearInterval(tik)

  console.log(`eerste keer (koud): ${uit.na} ms, tweede keer: ${uit.tweedeMs} ms`)
  console.log(`kaarten: ${uit.kaarten}, bussen: ${uit.bussen}, eerste keer kijken: ${uit.eerst}`)
  console.log(`erbij gekomen: ${uit.erbij} / bij de tweede keer: ${uit.tweedeErbij} (hoort 0 te zijn)`)
  console.log(`voorbeelden: ${uit.namen.join(', ')}`)
  console.log(`langste stilstand van het hoofdproces: ${ergste} ms`)
  app.exit(0)
})
