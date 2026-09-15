/**
 * Legt het scherm met de instellingen en de toetsen van OMSI vast.
 *
 *   npx electron scripts/screenshotGameSetup.cjs [uitvoermap]
 *
 * Er wordt gelezen uit de echte spelmap maar niets in geschreven: op opslaan
 * wordt niet gedrukt. De profielen van de gebruiker blijven onaangeroerd dankzij
 * een eigen gebruikersmap.
 */
const { app, BrowserWindow } = require('electron')
const { mkdtempSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

const args = process.argv.slice(
  process.argv.findIndex((arg) => arg.endsWith('screenshotGameSetup.cjs')) + 1
)
const outputDir = args[0] || __dirname

app.setPath('userData', mkdtempSync(join(tmpdir(), 'omsi-enhancer-cfg-')))
setTimeout(() => {
  console.error('time-out')
  app.exit(1)
}, 180000).unref()
require('../out/main/index.js')

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const js = (window, code) => window.webContents.executeJavaScript(code)

async function waitFor(window, expression, tries = 160) {
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
       const button = [...document.querySelectorAll('button')].find((b) => b.textContent.includes(${JSON.stringify(text)}))
       if (button) button.click()
       return Boolean(button)
     })()`
  )

app.whenReady().then(async () => {
  await wait(1200)
  const [main] = BrowserWindow.getAllWindows()
  main.setSize(1360, 950)

  const shoot = async (name) => {
    main.showInactive()
    main.moveTop()
    await wait(300)
    const png = (await main.capturePage()).toPNG()
    const file = join(outputDir, `cfg-${name}.png`)
    writeFileSync(file, png)
    console.log(`${name}: ${png.length} bytes -> ${file}`)
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
  await clickText(main, 'Instellingen van OMSI')
  await waitFor(main, `document.querySelector('.settings')`)
  await wait(1200)

  console.log(`instellingen in beeld: ${await js(main, `document.querySelectorAll('.setting').length`)}`)
  console.log(
    `waarschuwing dat OMSI draait: ${await js(main, `Boolean(document.querySelector('.note.warn'))`)}`
  )
  await shoot('1-instellingen')

  await clickText(main, 'Toetsen')
  await waitFor(main, `document.querySelector('.key-row')`)
  await wait(800)
  console.log(`toetsregels: ${await js(main, `document.querySelectorAll('.key-row').length`)}`)
  console.log(
    `eerste vijf: ${await js(
      main,
      `[...document.querySelectorAll('.key-row')].slice(0, 5).map((r) => r.querySelector('.key-name').textContent.trim() + ' = ' + r.querySelector('.key-combo').textContent.trim()).join(' | ')`
    )}`
  )
  await shoot('2-toetsen')

  // En het tabblad met de gamecontrollers.
  await clickText(main, 'Controllers')
  await waitFor(main, `document.querySelector('.devices')`)
  await wait(1200)
  console.log(`apparaten: ${await js(main, `document.querySelectorAll('.device').length`)}`)
  console.log(
    `namen: ${await js(main, `[...document.querySelectorAll('.device-name')].map((d) => d.textContent.trim()).join(' | ')`)}`
  )
  console.log(`assen: ${await js(main, `document.querySelectorAll('.axis-row').length`)}`)
  console.log(`knoppen: ${await js(main, `document.querySelectorAll('.key-row').length`)}`)
  await shoot('4-controllers')

  // De wizard openen en meteen weer sluiten; hij hoort niet verplicht te zijn.
  await clickText(main, 'Stap voor stap instellen')
  await waitFor(main, `document.querySelector('.wizard-card')`)
  await wait(500)
  console.log(`wizard vraagt: ${await js(main, `document.querySelector('.wizard-card h2')?.textContent`)}`)
  await shoot('5-wizard')
  await clickText(main, 'Wizard stoppen')
  await wait(400)
  console.log(`wizard weg: ${await js(main, `!document.querySelector('.wizard-card')`)}`)

  await clickText(main, 'Toetsen')
  await waitFor(main, `document.querySelector('.key-search')`)

  // Zoeken op een handeling die iedereen kent.
  await js(
    main,
    `(() => { const i = document.querySelector('.key-search'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'deur'); i.dispatchEvent(new Event('input', { bubbles: true })) })()`
  )
  await wait(600)
  console.log(`na zoeken op "deur": ${await js(main, `document.querySelectorAll('.key-row').length`)}`)
  await shoot('3-zoeken')

  app.exit(0)
})
