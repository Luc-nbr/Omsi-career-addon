/**
 * Loopt de nieuwe schermen langs en legt ze vast: chauffeur kiezen, modus
 * kiezen, en de drie modi zelf.
 *
 *   npx electron scripts/screenshotModes.cjs [uitvoermap]
 *
 * Draait met een eigen gebruikersmap, dus de profielen van de gebruiker blijven
 * onaangeroerd. Er wordt niets in de spelmap geschreven: op "klaarzetten en
 * starten" wordt niet gedrukt.
 */
const { app, BrowserWindow } = require('electron')
const { mkdtempSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

const args = process.argv.slice(process.argv.findIndex((arg) => arg.endsWith('screenshotModes.cjs')) + 1)
const outputDir = args[0] || __dirname

app.setPath('userData', mkdtempSync(join(tmpdir(), 'omsi-career-modes-')))
setTimeout(() => {
  console.error('time-out')
  app.exit(1)
}, 240000).unref()
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

/** Klikt de knop waarvan de tekst dit bevat. */
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
  main.setSize(1360, 900)

  const shoot = async (name) => {
    main.showInactive()
    main.moveTop()
    await wait(300)
    const png = (await main.capturePage()).toPNG()
    const file = join(outputDir, `modes-${name}.png`)
    writeFileSync(file, png)
    console.log(`${name}: ${png.length} bytes -> ${file}`)
  }

  // Verse gebruikersmap, dus eerst het welkomsscherm.
  if (await waitFor(main, `document.querySelector('#welcome-name')`, 60)) {
    await clickText(main, 'Nederlands')
    await wait(400)
    await js(
      main,
      `(() => { const i = document.querySelector('#welcome-name'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'Testchauffeur'); i.dispatchEvent(new Event('input', { bubbles: true })) })()`
    )
    await wait(300)
    await js(main, `document.querySelector('.welcome .actions .btn')?.click()`)
  }

  // Na het aanmaken staat de modussenkeuze er.
  await waitFor(main, `document.querySelector('.mode-grid')`)
  await wait(600)
  await shoot('1-modi')

  // En na herladen begint de app bij de chauffeur.
  await js(main, `location.reload()`)
  await waitFor(main, `document.querySelector('.driver-grid')`)
  await wait(800)
  await shoot('2-chauffeur')

  await js(main, `document.querySelector('.driver-pick')?.click()`)
  await waitFor(main, `document.querySelector('.mode-grid')`)
  await wait(400)

  for (const [name, label] of [
    ['3-carriere', 'Carrière'],
    ['4-dienst', 'Dienst'],
    ['5-vrij', 'Vrij rijden']
  ]) {
    await clickText(main, label)
    await waitFor(main, `document.querySelector('.mode-bar')`)
    // De lijnen van de kaart worden erbij gezocht; even laten landen.
    await wait(2500)
    console.log(
      `${name}: kaart "${await js(main, `document.querySelector('#map')?.value ?? ''`)}", ` +
        `lijnen ${await js(main, `document.querySelectorAll('#line option').length`)}`
    )
    await shoot(name)
    await clickText(main, 'Andere modus')
    await waitFor(main, `document.querySelector('.mode-grid')`)
    await wait(300)
  }

  app.exit(0)
})
