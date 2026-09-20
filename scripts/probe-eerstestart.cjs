/**
 * Wat ziet iemand die de app voor het eerst opent?
 *
 *   npx electron scripts/probe-eerstestart.cjs [uitvoerbestand] [--licht]
 *
 * Een verse gegevensmap, dus geen chauffeur en geen taalkeuze. Vroeger stond
 * daar een apart welkomstscherm; nu is het stap een van dezelfde opzet, met de
 * uitleg erbij en het invulveld al open.
 */
const { app, BrowserWindow } = require('electron')
const { mkdtempSync, mkdirSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { dirname, join } = require('node:path')

const args = process.argv.slice(
  process.argv.findIndex((arg) => arg.endsWith('probe-eerstestart.cjs')) + 1
)
const licht = args.includes('--licht')
const uit =
  args.find((arg) => !arg.startsWith('--')) ||
  join(__dirname, '..', '.impeccable', 'review', 'eerste-start.png')

app.setPath('userData', mkdtempSync(join(tmpdir(), 'omsi-eerste-')))
setTimeout(() => {
  console.error('time-out')
  app.exit(1)
}, 90000).unref()
require('../out/main/index.js')

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const js = (window, code) => window.webContents.executeJavaScript(code)

app.whenReady().then(async () => {
  await wait(2500)
  const [main] = BrowserWindow.getAllWindows()
  main.setContentSize(1344, 752)
  await wait(600)
  if (licht) await js(main, `document.documentElement.dataset.thema = 'licht'`)
  await wait(400)

  /*
   * Met --instellingen eerst een chauffeur aanmaken, doorklikken naar de modus
   * en daar de knop naar de OMSI-instellingen indrukken.
   */
  if (args.includes('--instellingen')) {
    await js(
      main,
      `(() => { const i = document.querySelector('.setup .invoerveld'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'Test'); i.dispatchEvent(new Event('input', { bubbles: true })) })()`
    )
    await wait(300)
    await js(main, `document.querySelector('.setup .invoerknop')?.click()`)
    await wait(1500)
    await js(main, `document.querySelector('.setup .tweedeknop')?.click()`)
    await wait(2500)
  }

  const titel = await js(main, `document.querySelector('.veltitel')?.textContent ?? ''`)
  const veld = await js(main, `Boolean(document.querySelector('.setup .invoerveld'))`)
  const oud = await js(main, `Boolean(document.querySelector('.welcome'))`)

  mkdirSync(dirname(uit), { recursive: true })
  writeFileSync(uit, (await main.capturePage()).toPNG())

  console.log(`kop: ${titel}`)
  console.log(`invulveld staat open: ${veld ? 'ja' : 'NEE'}`)
  console.log(`oud welkomstscherm: ${oud ? 'STAAT ER NOG' : 'weg'}`)
  console.log(`afdruk: ${uit}`)
  app.exit(veld && !oud ? 0 : 1)
})
