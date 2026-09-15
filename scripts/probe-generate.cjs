/**
 * De dienstgenerator: komt er één dienst in een eigen venster, kun je opnieuw
 * genereren, en blijft het opstartvenster staan tot OMSI er is?
 *
 *   npx electron scripts/probe-generate.cjs [kaartmap] [uitvoermap]
 *
 * Eigen gebruikersmap. Op "dienst starten" wordt niet gedrukt, dus er gaat niets
 * naar de spelmap en OMSI blijft dicht.
 */
const { app, BrowserWindow } = require('electron')
const { mkdtempSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

const args = process.argv.slice(
  process.argv.findIndex((arg) => arg.endsWith('probe-generate.cjs')) + 1
)
const mapFolder = args[0] || 'Grundorf'
const outputDir = args[1]

app.setPath('userData', mkdtempSync(join(tmpdir(), 'omsi-enhancer-gen-')))
setTimeout(() => {
  console.error('time-out')
  app.exit(1)
}, 240000).unref()
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

const clickText = (window, text) =>
  js(
    window,
    `(() => {
       const button = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(text)})
       if (button) button.click()
       return Boolean(button)
     })()`
  )

app.whenReady().then(async () => {
  await wait(1200)
  const [main] = BrowserWindow.getAllWindows()
  main.setSize(1360, 950)

  const shoot = async (name) => {
    if (!outputDir) return
    main.showInactive()
    main.moveTop()
    await wait(300)
    writeFileSync(join(outputDir, `gen-${name}.png`), (await main.capturePage()).toPNG())
    console.log(`geschreven: gen-${name}.png`)
  }

  if (await waitFor(main, `document.querySelector('#welcome-name')`, 60)) {
    await clickText(main, 'Nederlands')
    await wait(400)
    await js(
      main,
      `(() => { const i = document.querySelector('#welcome-name'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'Test'); i.dispatchEvent(new Event('input', { bubbles: true })) })()`
    )
    await wait(300)
    await js(main, `document.querySelector('.welcome .actions .btn')?.click()`)
  }

  await waitFor(main, `document.querySelector('.mode-grid')`)
  await js(
    main,
    `[...document.querySelectorAll('.mode-card')].find((c) => c.textContent.includes('Dienst'))?.click()`
  )
  await waitFor(main, `document.querySelector('select#map option')`)
  await js(
    main,
    `(() => {
       const select = document.querySelector('select#map')
       Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, ${JSON.stringify(mapFolder)})
       select.dispatchEvent(new Event('change', { bubbles: true }))
     })()`
  )
  await wait(2500)

  let ok = true
  console.log(`voorstelvenster voor het genereren: ${await js(main, `Boolean(document.querySelector('.proposal'))`)}`)

  await clickText(main, 'Genereer dienst')
  if (!(await waitFor(main, `document.querySelector('.proposal .duty-head')`, 200))) {
    console.error('geen voorstel')
    app.exit(1)
    return
  }
  await wait(1200)
  const first = await js(main, `document.querySelector('.proposal .duty-times b')?.textContent.trim()`)
  console.log(`voorstel 1: ${first}`)
  await shoot('1-voorstel')

  // Opnieuw genereren hoort een andere dienst te geven.
  let second = first
  for (let attempt = 0; attempt < 6 && second === first; attempt++) {
    await clickText(main, 'Opnieuw genereren')
    await wait(2500)
    second = await js(main, `document.querySelector('.proposal .duty-times b')?.textContent.trim()`)
  }
  console.log(`voorstel 2: ${second}`)
  if (second === first) {
    console.log('   (zelfde tijden; kan toeval zijn op een kleine kaart)')
  }

  // Een dienst met een lijnwissel erin, als de kaart die kan leveren.
  for (let attempt = 0; attempt < 10; attempt++) {
    if (await js(main, `Boolean(document.querySelector('.leg-switch'))`)) {
      console.log(
        `lijnwissel: ${await js(main, `document.querySelector('.leg-switch')?.textContent.trim().slice(0, 120)`)}`
      )
      await shoot('3-lijnwissel')
      break
    }
    await clickText(main, 'Opnieuw genereren')
    await wait(2200)
  }

  // Aannemen: het venster blijft staan en biedt starten aan.
  await clickText(main, 'Dienst bevestigen')
  await wait(1500)
  const stillOpen = await js(main, `Boolean(document.querySelector('.proposal'))`)
  const buttons = await js(
    main,
    `[...document.querySelectorAll('.proposal .actions .btn')].map((b) => b.textContent.trim()).join(' | ')`
  )
  console.log(`na aannemen open: ${stillOpen}, knoppen: ${buttons}`)
  if (!stillOpen || !buttons.includes('Dienst starten')) ok = false
  await shoot('2-aangenomen')

  // Sluiten laat de kaart op het scherm achter.
  await clickText(main, 'Sluiten')
  await wait(800)
  const onPage = await js(main, `Boolean(document.querySelector('.main .duty-head'))`)
  console.log(`na sluiten staat de kaart op het scherm: ${onPage}`)
  if (!onPage) ok = false

  console.log(ok ? '\nde generator werkt' : '\nKLOPT NIET')
  app.exit(ok ? 0 : 1)
})
