/**
 * Test de navigatie in de overlay met nepgegevens, zonder OMSI en zonder het
 * echte live.json aan te raken: een dienst laten toewijzen, een eigen
 * overlayvenster openen en daar frames in duwen alsof de plugin ze stuurt.
 *
 *   npx electron scripts/screenshotNav.cjs <kaartmap> [uitvoermap]
 *
 * Stappen: IBIS nog leeg (geen route), IBIS ingetoetst bij halte 1, 150 m en
 * 400 m verder, en de volgende halte. Bij elke stap een plaatje en de plek van de
 * bus op het scherm, zodat te zien is dat hij over de route opschuift.
 *
 * Tussen de eerste en de tweede stap wordt de IBIS-stap weggeklikt, want dat is
 * wat de chauffeur ook doet: de app laat de route pas zien als hij gemeld heeft
 * dat lijn en route op de IBIS staan.
 */
const { app, BrowserWindow } = require('electron')
const { mkdtempSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

const args = process.argv.slice(process.argv.findIndex((arg) => arg.endsWith('screenshotNav.cjs')) + 1)
const mapFolder = args[0] || 'Grundorf'
const outputDir = args[1] || __dirname

app.setPath('userData', mkdtempSync(join(tmpdir(), 'omsi-career-nav-')))
setTimeout(() => {
  console.error('time-out')
  app.exit(1)
}, 180000).unref()
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

function status(duty, legIndex, { ibis, stopIndex, odometerKm, speedKmh = 32 }) {
  const leg = duty.legs[legIndex]
  return {
    clockMinutes: leg.departure + 2,
    speedKmh,
    passengers: 7,
    entryRequest: false,
    exitRequest: false,
    doorsOpen: false,
    legIndex,
    leg,
    nextStop: ibis ? leg.stops[stopIndex] : '',
    odometerKm,
    stopIndex: ibis ? stopIndex : undefined,
    stopsTotal: leg.stops.length,
    reportsStops: ibis,
    offersStops: true,
    delayMinutes: 0,
    delayFromIbis: ibis,
    mood: 0.9,
    moodLabel: 'happy',
    hasPassengers: true,
    harshBrakes: 0,
    harshAccels: 0,
    advice: [],
    dutyComplete: false
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
  const duty = assignments.find((item) => item.duty.legs.length > 0 && item.duty.legs[0].stopIds.length >= 4)?.duty
  if (!duty) {
    console.error('geen dienst')
    app.exit(1)
    return
  }
  const leg = duty.legs[0]
  console.log(`dienst ${duty.lineNumbers.join('/')} omloop ${duty.tourNumber}, rit 1: ${leg.stops[0]} -> ${leg.terminus}, ${leg.stops.length} haltes`)

  const overlay = new BrowserWindow({
    width: 1280,
    height: 860,
    show: true,
    backgroundColor: '#0b0e13',
    webPreferences: { preload: join(__dirname, '../out/preload/index.js'), sandbox: false, contextIsolation: true }
  })
  await overlay.loadFile(join(__dirname, '../out/renderer/overlay.html'))
  await wait(800)

  const send = (frame) => overlay.webContents.send('overlay:frame', { connected: true, editing: false, duty, ...frame })
  const busOnScreen = () =>
    js(overlay, `(() => { const g = document.querySelector('.map-bus'); return g ? g.getAttribute('transform') : null })()`)
  const routeLines = () => js(overlay, `document.querySelectorAll('.route-line').length`)
  /*
   * De kaart centreert op de bus, dus die staat stil op het scherm en het is de
   * route die eronderdoor schuift. De plek van de bus zegt daardoor niets meer;
   * de plek van de route wel.
   */
  const scale = () => js(overlay, `document.querySelector('.map-scale')?.textContent ?? ''`)
  const routeAt = () =>
    js(
      overlay,
      `(() => { const p = document.querySelector('.route-line'); if (!p) return null; const b = p.getBBox(); return b.x.toFixed(0) + ',' + b.y.toFixed(0) })()`
    )
  const note = () => js(overlay, `document.querySelector('.map-note')?.textContent ?? ''`)
  const shoot = async (name) => {
    // Een venster dat niet vooraan staat, levert op Windows een lege opname.
    overlay.showInactive()
    overlay.moveTop()
    await wait(250)
    const image = await overlay.capturePage()
    const file = join(outputDir, `${mapFolder}-nav-${name}.png`)
    const png = image.toPNG()
    if (png.length === 0) console.log(`  (lege opname, venster ${image.getSize().width}x${image.getSize().height})`)
    writeFileSync(file, png)
    return file
  }

  const km = 152207.5
  const steps = [
    { name: '1-ibis-leeg', frame: { ibis: false, stopIndex: 0, odometerKm: km } },
    { name: '2-halte1', frame: { ibis: true, stopIndex: 1, odometerKm: km } },
    { name: '3-150m', frame: { ibis: true, stopIndex: 1, odometerKm: km + 0.15 } },
    { name: '4-400m', frame: { ibis: true, stopIndex: 1, odometerKm: km + 0.4 } },
    { name: '5-halte2', frame: { ibis: true, stopIndex: 2, odometerKm: km + 0.45 } },
    /*
     * En dan met een positie uit OMSI erbij, want dat is een ander pad door de
     * kaart: dan volgt hij de bus echt, en hoort de schaal zich naar de snelheid
     * te voegen -- stapvoets op vijfentwintig meter.
     */
    { name: '6-langzaam', frame: { ibis: true, stopIndex: 1, odometerKm: km + 0.15, speedKmh: 18 }, live: true },
    { name: '7-hard', frame: { ibis: true, stopIndex: 1, odometerKm: km + 0.15, speedKmh: 60 }, live: true }
  ]
  /*
   * De knop van de IBIS-stap. Zonder die klik blijft routeMode op 'none' staan
   * en tekent de kaart niets -- dat is geen fout van de kaart maar de poort
   * ervoor.
   */
  const meldIbisAf = async () => {
    const klaar = await js(
      overlay,
      `(() => { const b = document.querySelector('.ibis-step .ovl-btn'); if (!b) return false; b.click(); return true })()`
    )
    console.log(klaar ? 'IBIS afgemeld' : 'geen IBIS-stap gevonden')
    await wait(400)
  }

  // Waar de haltes liggen, om een positie uit OMSI na te doen.
  const geo = await js(main, `window.career.geometry(${JSON.stringify(mapFolder)})`)
  const puntVan = (id) => geo.stops.find((stop) => stop.id === id)

  for (const step of steps) {
    const punt = step.live ? puntVan(leg.stopIds[step.frame.stopIndex]) : undefined
    if (step.live && !punt) {
      console.log(`${step.name}: halte niet in de kaartgegevens, overgeslagen`)
      continue
    }
    // Een paar frames achter elkaar, zoals de plugin elke 200 ms doet.
    for (let i = 0; i < 6; i++) {
      send({
        status: status(duty, 0, step.frame),
        vehicle: punt ? { x: punt.x, y: punt.y, heading: 0 } : undefined
      })
      await wait(250)
    }
    await wait(1200)
    // De zoom glijdt met ruim een seconde tijdconstante naar zijn stand; te vroeg
    // kijken meet de reis en niet de bestemming.
    if (step.live) await wait(6000)
    if (step.frame.ibis) await meldIbisAf()
    const file = await shoot(step.name)
    console.log(
      `${step.name}: routelijnen ${await routeLines()}, route op ${await routeAt()}, ` +
        `bus ${await busOnScreen()}, schaal ${await scale()}, melding "${await note()}" -> ${file}`
    )
  }

  app.exit(0)
})
