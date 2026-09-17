/**
 * Wat ziet iemand die OMSI niet heeft staan waar wij kijken?
 *
 *   npx electron scripts/probe-geenomsi.cjs [uitvoermap]
 *
 * Op deze machine staat OMSI er wel, dus het scherm is alleen te zien door de
 * app te laten denken van niet: we onderscheppen het antwoord op de vraag "waar
 * staat OMSI" en zeggen nergens. Daarna hoort er geen foutmelding te staan maar
 * een vraag, met een knop om de map aan te wijzen.
 */
const { app, BrowserWindow } = require('electron')
const { mkdtempSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

const args = process.argv.slice(
  process.argv.findIndex((arg) => arg.endsWith('probe-geenomsi.cjs')) + 1
)
const outputDir = args[0] || __dirname
app.setPath('userData', mkdtempSync(join(tmpdir(), 'omsi-geen-')))

setTimeout(() => {
  console.error('time-out')
  app.exit(1)
}, 90000).unref()
require('../out/main/index.js')

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const js = (window, code) => window.webContents.executeJavaScript(code)

app.whenReady().then(async () => {
  await wait(600)
  const [main] = BrowserWindow.getAllWindows()

  /*
   * In het hoofdproces, niet in het scherm: daar staat de vraag vast voordat de
   * app hem stelt. Het antwoord op "waar staat OMSI" wordt vervangen door
   * "nergens".
   */
  const { ipcMain } = require('electron')
  ipcMain.removeHandler('omsi:status')
  ipcMain.handle('omsi:status', () => ({ found: false }))
  main.reload()
  await wait(3500)

  const tekst = await js(main, `document.body.innerText.slice(0, 200)`)
  const knop = await js(
    main,
    `Boolean([...document.querySelectorAll('button')].find((b) => b.textContent.includes('OMSI')))`
  )
  const fout = await js(main, `document.body.innerText.includes('Something went wrong')`)
  const image = await main.capturePage()
  writeFileSync(join(outputDir, 'geen-omsi.png'), image.toPNG())

  console.log(`scherm: ${JSON.stringify(tekst.split('\n').filter(Boolean).slice(0, 3))}`)
  console.log(`knop om de map te kiezen: ${knop ? 'ja' : 'NEE'}`)
  console.log(`nog een foutmelding: ${fout ? 'JA' : 'nee'}`)
  console.log(knop && !fout ? 'de app vraagt het in plaats van te klagen' : 'MISLUKT')

  app.exit(0)
})
