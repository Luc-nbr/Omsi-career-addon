/**
 * Laat de drie standen van het dienstpaneel zien, zonder OMSI en zonder het
 * echte live.json aan te raken: een dienst laten toewijzen, de overlay openen en
 * er frames in duwen alsof de plugin ze stuurt.
 *
 *   npx electron scripts/screenshotIbis.cjs <kaartmap> [uitvoermap] [vergroting]
 *
 * Het overlayvenster is doorzichtig; een opname daarvan is leeg. Vandaar een
 * achtergrondkleur voor de duur van de opname.
 */
const { app, BrowserWindow } = require('electron')
const { mkdtempSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

const args = process.argv.slice(
  process.argv.findIndex((arg) => arg.endsWith('screenshotIbis.cjs')) + 1
)
const mapFolder = args[0] || 'Grundorf'
const outputDir = args[1] || __dirname
const scale = Number(args[2]) || 1

app.setPath('userData', mkdtempSync(join(tmpdir(), 'omsi-career-ibis-')))
setTimeout(() => {
  console.error('time-out')
  app.exit(1)
}, 180000).unref()
require('../out/main/index.js')

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const js = (window, code) => window.webContents.executeJavaScript(code)

async function waitFor(window, expression, tries = 120) {
  for (let i = 0; i < tries; i++) {
    if (await js(window, expression)) return true
    await wait(500)
  }
  return false
}

app.whenReady().then(async () => {
  await wait(1500)
  const [main] = BrowserWindow.getAllWindows()
  await waitFor(main, `Boolean(document.querySelector('#welcome-name') || document.querySelector('select#map'))`)

  if (await js(main, `Boolean(document.querySelector('#welcome-name'))`)) {
    await js(
      main,
      `(() => {
        const input = document.querySelector('#welcome-name')
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
        setter.call(input, 'Proefrijder')
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })()`
    )
    await wait(400)
    await js(main, `document.querySelector('.welcome .btn').click()`)
    await waitFor(main, `Boolean(document.querySelector('select#map'))`)
  }

  const duty = await js(
    main,
    `window.career
      .listDuties({ mapFolder: ${JSON.stringify(mapFolder)}, targetMinutes: 60, window: 'heledag' })
      .then((found) => found[0].duty)`
  )
  const leg = duty.legs[0]
  console.log(`dienst ${duty.lineFile} omloop ${duty.tourNumber}, rit 1 naar ${leg.terminus}`)

  // De overlay openen langs de gewone weg, met een IBIS-plan erbij.
  const ibis = {
    yard: 'proef',
    line: leg.lineNumber,
    tour: duty.tourNumber,
    legs: duty.legs.map((item, index) => ({
      departure: item.departure,
      lineNumber: item.lineNumber,
      terminus: item.terminus,
      route: `${item.lineNumber}0${index + 1}`
    })),
    resolved: duty.legs.length,
    total: duty.legs.length,
    hasRoutes: true
  }
  if (scale !== 1) {
    // De overlay leest zijn indeling bij het openen, dus eerst zetten.
    const layout = await js(main, `window.career.overlayLayout()`)
    layout.dienst.scale = scale
    layout.navigatie.scale = scale
    await js(main, `window.career.saveOverlayLayout(${'${JSON.stringify(layout)}'})`.replace('${JSON.stringify(layout)}', JSON.stringify(layout)))
  }
  await js(main, `window.career.setOverlay(${JSON.stringify(duty)}, true, ${JSON.stringify(ibis)})`)
  await wait(2500)

  const overlay = BrowserWindow.getAllWindows().find((w) => w !== main)
  if (!overlay) throw new Error('geen overlayvenster')
  overlay.setBackgroundColor('#2b3442')

  const base = {
    clockMinutes: leg.departure + 2,
    speedKmh: 0,
    passengers: 0,
    entryRequest: false,
    exitRequest: false,
    doorsOpen: false,
    legIndex: 0,
    leg,
    nextStop: '',
    odometerKm: 1200,
    stopsTotal: leg.stops.length,
    offersStops: true,
    delayMinutes: 0,
    delayFromIbis: false,
    mood: 0.7,
    moodLabel: 'calm',
    hasPassengers: false,
    harshBrakes: 0,
    harshAccels: 0,
    advice: [],
    dutyComplete: false
  }

  // Het hoofdproces duwt elke 100 ms zijn eigen frame; wacht tot het onze staat.
  const steps = [
    ['1-ibis-leeg', { ...base, reportsStops: false, stopIndex: undefined }, '.ibis-entry'],
    [
      '2-ibis-gevuld',
      {
        ...base,
        clockMinutes: leg.departure + 9,
        speedKmh: 38,
        passengers: 11,
        hasPassengers: true,
        moodLabel: 'happy',
        mood: 0.82,
        reportsStops: true,
        stopIndex: 2,
        nextStop: leg.stops[2] ?? '',
        harshBrakes: 1
      },
      '.topline .clock'
    ]
  ]

  for (const [name, status, marker] of steps) {
    // Blijven duwen: het hoofdproces stuurt elke 100 ms zijn eigen frame.
    const pump = setInterval(
      () => overlay.webContents.send('overlay:frame', { connected: true, editing: false, duty, ibis, status }),
      50
    )
    await wait(600)
    if (!(await waitFor(overlay, `Boolean(document.querySelector(${JSON.stringify(marker)}))`, 20))) {
      console.log(`${name}: ${marker} bleef weg`)
    }
    const panel = await js(
      overlay,
      `document.querySelector('.panel-dienst .panel-body')?.innerText.replace(/\\n/g, ' / ')`
    )
    const buttons = await js(overlay, `document.querySelectorAll('.layout-button').length`)
    const file = join(outputDir, `${mapFolder}-ibis-${name}.png`)
    writeFileSync(file, (await overlay.capturePage()).toPNG())
    clearInterval(pump)
    console.log(`${name}: layoutknoppen ${buttons} | ${panel}`)
    console.log(`   -> ${file}`)
  }

  // Tot slot de bewerkstand, waar de knoppen voor vergroten staan.
  await js(main, `window.career.editOverlay(true)`)
  await wait(1500)
  const editFile = join(outputDir, `${mapFolder}-ibis-3-bewerken.png`)
  overlay.showInactive()
  overlay.moveTop()
  await wait(250)
  writeFileSync(editFile, (await overlay.capturePage()).toPNG())
  console.log(`3-bewerken: vergroting ${await js(overlay, `document.querySelector('.panel-percent')?.textContent`)}`)
  console.log(`   -> ${editFile}`)

  app.quit()
})
