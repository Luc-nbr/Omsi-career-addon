/**
 * Wat staat er in de overlay als er (nog) geen dienstregeling rijdt?
 *
 *   npx electron scripts/probe-instructions.cjs [kaartmap] [uitvoermap]
 *
 * Vier standen met nepframes: niets gekozen, het venster Set Time Table open
 * (OMSI kent de rit al maar hij rijdt niet), de dienst rijdt, en de rit is klaar
 * terwijl er nog een volgt. Raakt live.json en de spelmap niet aan.
 */
const { app, BrowserWindow } = require('electron')
const { mkdtempSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

const args = process.argv.slice(
  process.argv.findIndex((arg) => arg.endsWith('probe-instructions.cjs')) + 1
)
const mapFolder = args[0] || 'Rheinhausen'
const outputDir = args[1]

app.setPath('userData', mkdtempSync(join(tmpdir(), 'omsi-enhancer-instr-')))
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
function status(duty, { legIndex, running, clock, delta }) {
  const leg = duty.legs[legIndex]
  return {
    clockMinutes: clock,
    speedKmh: 0,
    passengers: 0,
    entryRequest: false,
    exitRequest: false,
    doorsOpen: false,
    legIndex,
    leg,
    nextStop: running ? leg.stops[1] : '',
    odometerKm: 1000,
    stopIndex: running ? 1 : undefined,
    stopsTotal: leg.stops.length,
    reportsStops: running,
    offersStops: true,
    delayMinutes: 0,
    delayFromIbis: false,
    deltaSeconds: delta,
    mood: 0.9,
    moodLabel: 'happy',
    hasPassengers: false,
    harshBrakes: 0,
    harshAccels: 0,
    advice: [],
    dutyComplete: false,
    omsiReadable: true,
    schedule: running
      ? {
          lineName: leg.lineFile,
          tourName: leg.tourNumber,
          tripName: leg.tripFile,
          matchesDuty: true,
          legIndex
        }
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
    `window.career.listDuties({ mapFolder: ${JSON.stringify(mapFolder)}, targetMinutes: 120, window: 'heledag' })`
  )
  const found = assignments.find((item) => item.duty.legs.length >= 2)
  if (!found) {
    console.error('geen dienst met twee ritten')
    app.exit(1)
    return
  }
  const duty = found.duty
  const ibis = await js(
    main,
    `window.career.ibis(${JSON.stringify(duty)}, ${JSON.stringify(found.vehicle)}, 2016)`
  )
  console.log(
    `dienst: lijn ${duty.lineFile}, omloop ${duty.tourNumber}, ${duty.legs.length} ritten; ` +
      `IBIS lijn ${ibis.line}, routes ${ibis.legs.map((l) => l.route ?? '-').join('/')}`
  )

  const overlay = new BrowserWindow({
    width: 460,
    height: 760,
    show: false,
    webPreferences: { preload: join(__dirname, '../out/preload/index.js'), sandbox: false, contextIsolation: true }
  })
  await overlay.loadFile(join(__dirname, '../out/renderer/overlay.html'))
  await wait(800)

  const send = (state) => {
    for (let i = 0; i < 4; i++) {
      overlay.webContents.send('overlay:frame', {
        connected: true,
        editing: false,
        duty,
        ibis,
        status: status(duty, state)
      })
    }
  }
  const read = () =>
    js(
      overlay,
      `(() => {
         const panel = document.querySelector('.select-duty')
         if (panel) {
           const title = panel.querySelector('.topline b')?.textContent.trim()
           const cells = [...panel.querySelectorAll('.grid div')].map((d) => d.querySelector('b').textContent.trim() + '=' + d.querySelector('span').textContent.trim())
           const button = panel.querySelector('.ovl-btn')?.textContent.trim()
           return title + ': ' + cells.join(', ') + (button ? ' [knop: ' + button + ']' : '')
         }
         const next = document.querySelector('.next-trip')
         const delta = document.querySelector('.delay')?.textContent.trim()
         return 'dienst ingevuld, verschil ' + (delta ?? '?') + (next ? ' | ' + next.textContent.trim() : '')
       })()`
    )
  const routeLines = () => js(overlay, `document.querySelectorAll('.route-line').length`)
  const pressIbis = () =>
    js(overlay, `(() => { const b = document.querySelector('.ovl-btn'); if (b) b.click(); return Boolean(b) })()`)
  const shoot = async (name) => {
    if (!outputDir) return
    overlay.showInactive()
    overlay.moveTop()
    await wait(250)
    writeFileSync(join(outputDir, `instr-${name}.png`), (await overlay.capturePage()).toPNG())
  }

  const first = duty.legs[0]
  const second = duty.legs[1]

  send({ legIndex: 0, running: false, clock: first.departure - 12, delta: undefined })
  await wait(1200)
  console.log(`\nniets gekozen:      ${await read()}`)
  await shoot('1-niets-gekozen')

  // De tweede rit is aan de beurt maar er is nog niets gekozen.
  send({ legIndex: 1, running: false, clock: second.departure - 5, delta: undefined })
  await wait(1200)
  console.log(`tweede rit wacht:   ${await read()}`)
  await shoot('2-tweede-rit')

  send({ legIndex: 0, running: true, clock: first.departure + 5, delta: -180 })
  await wait(1200)
  console.log(`in OMSI gekozen:    ${await read()}`)
  console.log(`   route op de kaart: ${await routeLines()} lijnen`)
  await shoot('3-ibis-stap')

  await pressIbis()
  await wait(1200)
  console.log(`IBIS afgemeld:      ${await read()}`)
  console.log(`   route op de kaart: ${await routeLines()} lijnen`)
  await shoot('4-rijdt')

  send({ legIndex: 0, running: true, clock: first.arrival + 2, delta: 60 })
  await wait(1200)
  console.log(`rit klaar:          ${await read()}`)
  await shoot('5-rit-klaar')

  app.exit(0)
})
