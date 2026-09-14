/**
 * Test de meerijdende navigatie in de overlay met een nepbus, zonder OMSI en
 * zonder het echte live.json aan te raken. De bus rijdt met 40 km/u over de
 * route van de eerste rit, en de frames gaan het overlayvenster in zoals het
 * hoofdproces ze stuurt: eerst zonder gekozen dienstregeling, daarna met.
 *
 *   npx electron scripts/screenshotLive.cjs <kaartmap> [uitvoermap]
 */
const { app, BrowserWindow } = require('electron')
const { mkdtempSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

const args = process.argv.slice(process.argv.findIndex((arg) => arg.endsWith('screenshotLive.cjs')) + 1)
const mapFolder = args[0] || 'Rheinhausen'
const outputDir = args[1] || __dirname

app.setPath('userData', mkdtempSync(join(tmpdir(), 'omsi-career-live-')))
setTimeout(() => {
  console.error('time-out')
  app.exit(1)
}, 240000).unref()
require('../out/main/index.js')

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const js = (window, code) => window.webContents.executeJavaScript(code)
async function waitFor(window, expression, tries = 120) {
  for (let i = 0; i < tries; i++) {
    if (await js(window, `Boolean(${expression})`)) return true
    await wait(250)
  }
  return false
}

function status(duty, scheduled, speedKmh) {
  const leg = duty.legs[0]
  return {
    clockMinutes: leg.departure + 1, speedKmh, passengers: 3, entryRequest: false, exitRequest: false, doorsOpen: false,
    legIndex: 0, leg, nextStop: scheduled ? leg.stops[1] : '', odometerKm: 1000,
    stopIndex: scheduled ? 1 : undefined, stopsTotal: leg.stops.length, reportsStops: scheduled, offersStops: true,
    delayMinutes: 0, delayFromIbis: scheduled, mood: 0.9, moodLabel: 'happy', hasPassengers: true,
    harshBrakes: 0, harshAccels: 0, advice: [], dutyComplete: false, omsiReadable: true,
    schedule: scheduled ? { lineName: duty.lineFile, tourName: duty.tourNumber, tripName: leg.tripFile, matchesDuty: true, legIndex: 0 } : undefined
  }
}

app.whenReady().then(async () => {
  await wait(1000)
  const [main] = BrowserWindow.getAllWindows()
  if (await waitFor(main, `document.querySelector('#welcome-name')`, 40)) {
    await js(main, `[...document.querySelectorAll('.lang')].find((b) => b.textContent.includes('Nederlands'))?.click()`)
    await wait(300)
    await js(main, `(() => { const i = document.querySelector('#welcome-name'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'Test'); i.dispatchEvent(new Event('input', { bubbles: true })) })()`)
    await wait(300)
    await js(main, `document.querySelector('.welcome .actions .btn')?.click()`)
  }
  await waitFor(main, `document.querySelector('select#map option')`)
  const assignments = await js(main, `window.career.listDuties({ mapFolder: ${JSON.stringify(mapFolder)}, targetMinutes: 90, window: 'heledag' })`)
  const duty = assignments.find((item) => item.duty.legs[0]?.stopIds.length >= 4)?.duty
  if (!duty) {
    console.error('geen dienst')
    app.exit(1)
    return
  }
  const leg = duty.legs[0]
  const [route] = await js(main, `window.career.routes(${JSON.stringify(mapFolder)}, [${JSON.stringify({ tripFile: leg.tripFile, stopIds: leg.stopIds })}])`)
  console.log(`dienst lijn ${duty.lineFile} omloop ${duty.tourNumber}; route ${route.length / 2} punten`)

  const overlay = new BrowserWindow({
    width: 1280, height: 860, show: true, backgroundColor: '#0b0e13',
    webPreferences: { preload: join(__dirname, '../out/preload/index.js'), sandbox: false, contextIsolation: true }
  })
  await overlay.loadFile(join(__dirname, '../out/renderer/overlay.html'))
  await wait(800)

  // Punten om de meter over de route, om met een vaste snelheid over te rijden.
  const path = []
  for (let i = 2; i < route.length; i += 2) {
    const [ax, ay, bx, by] = [route[i - 2], route[i - 1], route[i], route[i + 1]]
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay)))
    for (let k = 0; k < n; k++) path.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n, Math.atan2(bx - ax, by - ay) * 180 / Math.PI])
  }
  const speed = 40
  let metres = 0
  const drive = async (seconds, scheduled) => {
    for (let t = 0; t < seconds * 10; t++) {
      metres += (speed / 3.6) * 0.1
      const [x, y, heading] = path[Math.min(path.length - 1, Math.floor(metres))]
      overlay.webContents.send('overlay:frame', {
        connected: true, editing: false, duty,
        status: status(duty, scheduled, speed),
        vehicle: { x, y, heading, headingFromMotion: true }
      })
      await wait(100)
    }
  }
  const shoot = async (name) => {
    const file = join(outputDir, `${mapFolder}-live-${name}.png`)
    writeFileSync(file, (await overlay.capturePage()).toPNG())
    return file
  }
  const facts = () => js(overlay, `({
    routelijnen: document.querySelectorAll('.route-line').length,
    bus: document.querySelector('.map-bus')?.getAttribute('transform') ?? null,
    kies: document.querySelector('.select-duty')?.textContent ?? '',
    melding: document.querySelector('.map-note')?.textContent ?? ''
  })`)

  await drive(3, false)
  console.log('zonder keuze:', JSON.stringify(await facts()), '->', await shoot('1-zonder-keuze'))

  // Framtijd meten terwijl de bus rijdt.
  const timing = js(overlay, `new Promise((resolve) => { const t = []; let last = performance.now(); const f = (now) => { t.push(now - last); last = now; if (t.length < 90) requestAnimationFrame(f); else { t.shift(); t.sort((a, b) => a - b); resolve({ mediaan: +t[t.length >> 1].toFixed(1), p90: +t[Math.floor(t.length * 0.9)].toFixed(1) }) } }; requestAnimationFrame(f) })`)
  await drive(4, true)
  console.log('met keuze:', JSON.stringify(await facts()), '->', await shoot('2-met-keuze'))
  console.log('framtijd tijdens rijden:', JSON.stringify(await timing))
  await drive(4, true)
  console.log('verder gereden:', JSON.stringify(await facts()), '->', await shoot('3-verder'))
  app.exit(0)
})
