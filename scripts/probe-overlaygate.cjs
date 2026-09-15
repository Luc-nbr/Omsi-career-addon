/**
 * Vult het infoscherm zich pas als OMSI zegt dat de dienst loopt?
 *
 *   npx electron scripts/probe-overlaygate.cjs [kaartmap]
 *
 * Voedt een eigen overlayvenster met nepframes: eerst zonder gekozen
 * dienstregeling, dan met. Raakt `live.json` niet aan en schrijft niets in de
 * spelmap.
 */
const { app, BrowserWindow } = require('electron')
const { mkdtempSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

const args = process.argv.slice(
  process.argv.findIndex((arg) => arg.endsWith('probe-overlaygate.cjs')) + 1
)
const mapFolder = args[0] || 'Rheinhausen'

app.setPath('userData', mkdtempSync(join(tmpdir(), 'omsi-enhancer-gate-')))
setTimeout(() => {
  console.error('time-out')
  app.exit(1)
}, 180000).unref()
require('../out/main/index.js')

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const js = (window, code) => window.webContents.executeJavaScript(code)

async function waitFor(window, expression, tries = 200) {
  for (let i = 0; i < tries; i++) {
    if (await js(window, `Boolean(${expression})`)) return true
    await wait(250)
  }
  return false
}

/** Een stand zoals de plugin hem doorgeeft. */
function status(duty, { readable, matches, reportsStops, offersStops = true }) {
  const leg = duty.legs[0]
  return {
    clockMinutes: leg.departure - 7,
    speedKmh: 0,
    passengers: 0,
    entryRequest: false,
    exitRequest: false,
    doorsOpen: false,
    legIndex: 0,
    leg,
    nextStop: reportsStops ? leg.stops[1] : '',
    odometerKm: 1000,
    stopIndex: reportsStops ? 1 : undefined,
    stopsTotal: leg.stops.length,
    reportsStops,
    offersStops,
    delayMinutes: 0,
    delayFromIbis: false,
    deltaSeconds: -420,
    mood: 0.9,
    moodLabel: 'happy',
    hasPassengers: false,
    harshBrakes: 0,
    harshAccels: 0,
    advice: [],
    dutyComplete: false,
    omsiReadable: readable,
    schedule: readable
      ? { lineName: duty.lineFile, tourName: duty.tourNumber, tripName: leg.tripFile, matchesDuty: matches, legIndex: matches ? 0 : undefined }
      : undefined
  }
}

app.whenReady().then(async () => {
  await wait(1000)
  const [main] = BrowserWindow.getAllWindows()
  if (await waitFor(main, `document.querySelector('#welcome-name')`, 40)) {
    await js(
      main,
      `[...document.querySelectorAll('.lang')].find((b) => b.textContent.includes('Nederlands'))?.click()`
    )
    await wait(300)
    await js(
      main,
      `(() => { const i = document.querySelector('#welcome-name'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'Test'); i.dispatchEvent(new Event('input', { bubbles: true })) })()`
    )
    await wait(300)
    await js(main, `document.querySelector('.welcome .actions .btn')?.click()`)
  }
  await waitFor(main, `document.querySelector('select#map option')`)

  const assignments = await js(
    main,
    `window.career.listDuties({ mapFolder: ${JSON.stringify(mapFolder)}, targetMinutes: 90, window: 'heledag' })`
  )
  const duty = assignments.find((item) => item.duty.legs[0]?.stops.length >= 4)?.duty
  if (!duty) {
    console.error('geen dienst')
    app.exit(1)
    return
  }

  const overlay = new BrowserWindow({
    width: 900,
    height: 700,
    show: false,
    webPreferences: { preload: join(__dirname, '../out/preload/index.js'), sandbox: false, contextIsolation: true }
  })
  await overlay.loadFile(join(__dirname, '../out/renderer/overlay.html'))
  await wait(800)

  const send = (state) => {
    for (let i = 0; i < 4; i++) {
      overlay.webContents.send('overlay:frame', { connected: true, editing: false, duty, status: status(duty, state) })
    }
  }
  const shown = () =>
    js(
      overlay,
      `(() => {
         if (document.querySelector('.select-duty')) return 'kies in OMSI'
         if (document.querySelector('.ibis-entry')) return 'toets de IBIS in'
         if (document.querySelector('.topline .clock')) return 'dienst ingevuld'
         return '(leeg)'
       })()`
    )
  const mapMode = () =>
    js(overlay, `document.querySelectorAll('.route-line').length > 0 ? 'route' : 'geen route'`)

  // Per geval: mag het scherm de dienst laten zien?
  const cases = [
    ['OMSI leesbaar, niets gekozen', { readable: true, matches: false, reportsStops: false }, false],
    ['OMSI leesbaar, dienst gekozen', { readable: true, matches: true, reportsStops: true }, true],
    ['niet leesbaar, IBIS leeg, bus met IBIS', { readable: false, matches: false, reportsStops: false }, false],
    ['niet leesbaar, IBIS leeg, bus zonder IBIS', { readable: false, matches: false, reportsStops: false, offersStops: false }, false],
    ['niet leesbaar, IBIS ingetoetst', { readable: false, matches: false, reportsStops: true }, true]
  ]

  let ok = true
  for (const [name, state, wantsDuty] of cases) {
    send(state)
    await wait(1200)
    const panel = await shown()
    const route = await mapMode()
    console.log(`${name.padEnd(38)} -> ${panel.padEnd(18)} | kaart: ${route}`)
    if (wantsDuty !== (panel === 'dienst ingevuld')) ok = false
  }

  console.log(ok ? '\nhet scherm wacht op OMSI' : '\nKLOPT NIET')
  app.exit(ok ? 0 : 1)
})
