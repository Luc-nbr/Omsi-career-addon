/**
 * Neemt een nieuwe chauffeur de dienst van de vorige over?
 *
 *   npx electron scripts/probe-profielwissel.cjs [uitvoermap]
 *
 * Dat gebeurde: wie een dienst had lopen en daarna een nieuw profiel aanmaakte,
 * kreeg die dienst gewoon weer te zien. De dienst hangt namelijk op twee
 * plekken -- in het profiel op schijf, en in het geheugen van het hoofdproces
 * voor de overlay -- en alleen de eerste wisselde mee.
 *
 * De proef maakt een chauffeur met een aangenomen dienst, maakt dan een tweede
 * chauffeur, en kijkt of die met lege handen begint: geen dienst in het profiel,
 * niets meer op het scherm, en geen overlay die nog boven het spel hangt.
 */
const { app, BrowserWindow } = require('electron')
const { mkdtempSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

const args = process.argv.slice(
  process.argv.findIndex((arg) => arg.endsWith('probe-profielwissel.cjs')) + 1
)
const outputDir = args[0] || __dirname
app.setPath('userData', mkdtempSync(join(tmpdir(), 'omsi-wissel-')))

setTimeout(() => {
  console.error('time-out')
  app.exit(1)
}, 180000).unref()
require('../out/main/index.js')

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const js = (window, code) => window.webContents.executeJavaScript(code)

async function waitFor(window, expression, tries = 80) {
  for (let i = 0; i < tries; i++) {
    if (await js(window, `Boolean(${expression})`)) return true
    await wait(250)
  }
  return false
}

app.whenReady().then(async () => {
  await wait(1500)
  const [main] = BrowserWindow.getAllWindows()
  for (let i = 0; i < 80; i++) {
    if (await js(main, `Boolean(window.career)`)) break
    await wait(250)
  }

  // ---- chauffeur een, met een aangenomen dienst en een overlay ----
  await js(main, `window.career.createProfile('Eerste')`)
  const assignments = await js(
    main,
    `window.career.listDuties({ mapFolder: 'Grundorf', targetMinutes: 90, window: 'heledag' })`
  )
  const gekozen = assignments.find((item) => item.vehicle && item.duty.legs.length > 0)
  if (!gekozen) {
    console.error('geen dienst met een bus')
    app.exit(1)
    return
  }
  await js(main, `window.career.confirmDuty(${JSON.stringify(gekozen)}, '', 'dienst')`)
  await js(main, `window.career.setOverlay(${JSON.stringify(gekozen.duty)}, true)`)
  await wait(800)
  const een = await js(main, `window.career.career()`)
  const overlayEen = await js(main, `window.career.overlayIsOpen()`)
  console.log(
    `chauffeur 1: dienst ${een.state.activeDuty ? 'aangenomen' : 'MISLUKT'}, ` +
      `overlay ${overlayEen ? 'open' : 'dicht'}`
  )

  // ---- en dan een tweede chauffeur ----
  await js(main, `window.career.createProfile('Tweede')`)
  await wait(1200)
  const twee = await js(main, `window.career.career()`)
  const overlayTwee = await js(main, `window.career.overlayIsOpen()`)
  const opScherm = await js(
    main,
    `Boolean(document.querySelector('.duty-title, .running-cancel, .bus-panel'))`
  )
  const image = await main.capturePage()
  writeFileSync(join(outputDir, 'profielwissel.png'), image.toPNG())

  console.log(`chauffeur 2: ${twee.state.driver}, dienst ${twee.state.activeDuty ? 'ERFDE DE OUDE' : 'geen'}`)
  console.log(`   overlay ${overlayTwee ? 'HANGT ER NOG' : 'dicht'}`)
  console.log(`   op het scherm ${opScherm ? 'STAAT NOG EEN DIENST' : 'staat geen dienst'}`)
  console.log(
    !twee.state.activeDuty && !overlayTwee && !opScherm
      ? 'een verse chauffeur begint met lege handen'
      : 'MISLUKT: er is iets van de vorige chauffeur blijven staan'
  )

  app.exit(0)
})
