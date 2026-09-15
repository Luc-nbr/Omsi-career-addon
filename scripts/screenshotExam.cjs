/**
 * Loopt het rijexamen door: route kiezen, examen aannemen, en kijken of de
 * dienstkaart erna om het inleveren vraagt in plaats van om afronden.
 *
 *   npx electron scripts/screenshotExam.cjs [uitvoermap]
 *
 * Eigen gebruikersmap, en er wordt niet op starten gedrukt: de spelmap blijft
 * onaangeroerd.
 */
const { app, BrowserWindow } = require('electron')
const { mkdtempSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

const args = process.argv.slice(process.argv.findIndex((arg) => arg.endsWith('screenshotExam.cjs')) + 1)
const outputDir = args[0] || __dirname

app.setPath('userData', mkdtempSync(join(tmpdir(), 'omsi-career-exam-')))
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
    const file = join(outputDir, `exam-${name}.png`)
    writeFileSync(file, png)
    console.log(`${name}: ${png.length} bytes -> ${file}`)
  }

  if (await waitFor(main, `document.querySelector('#welcome-name')`, 60)) {
    await clickText(main, 'Nederlands')
    await wait(400)
    await js(
      main,
      `(() => { const i = document.querySelector('#welcome-name'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'Kandidaat'); i.dispatchEvent(new Event('input', { bubbles: true })) })()`
    )
    await wait(300)
    await js(main, `document.querySelector('.welcome .actions .btn')?.click()`)
  }

  await waitFor(main, `document.querySelector('.mode-grid')`)
  await clickText(main, 'Carrière')
  await waitFor(main, `document.querySelector('.rules')`)

  // Een kleine kaart laadt sneller en heeft genoeg lijnen voor een examen.
  await js(
    main,
    `(() => {
       const select = document.querySelector('#map')
       const option = [...select.options].find((o) => o.textContent.includes('Grundorf'))
       Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, option.value)
       select.dispatchEvent(new Event('change', { bubbles: true }))
     })()`
  )
  await wait(3000)
  console.log(`examenroutes: ${await js(main, `document.querySelectorAll('#line option').length`)}`)
  await shoot('1-keuze')

  await clickText(main, 'Examen afleggen')
  await waitFor(main, `document.querySelector('.duty-head')`)
  await wait(2500)

  console.log(`ritten in de dienst: ${await js(main, `document.querySelectorAll('.leg').length`)}`)
  console.log(
    `knoppen: ${await js(main, `[...document.querySelectorAll('.actions .btn')].map((b) => b.textContent.trim()).join(' | ')`)}`
  )
  await shoot('2-examenrit')

  app.exit(0)
})
