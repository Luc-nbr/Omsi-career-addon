/**
 * Wat kost een kaart openen bij de eerste start, en wat bij de tweede?
 *
 *   npx electron scripts/probe-warmstart.cjs <gegevensmap> [kaartmap]
 *
 * Twee keer met dezelfde gegevensmap draaien laat zien wat de schijfcache doet
 * in de echte app, en niet alleen in een losse meting: de eerste keer moet hij
 * de tegels uitlezen, de tweede keer hoort hij ze terug te lezen.
 */
const { app, BrowserWindow } = require('electron')
const { existsSync, mkdirSync, readdirSync, statSync } = require('node:fs')
const { join } = require('node:path')

const args = process.argv.slice(
  process.argv.findIndex((arg) => arg.endsWith('probe-warmstart.cjs')) + 1
)
const gegevens = args[0]
const kaart = args[1] || 'TH_Wald'
if (!gegevens) {
  console.error('geef een gegevensmap op')
  process.exit(1)
}

mkdirSync(gegevens, { recursive: true })
app.setPath('userData', gegevens)
setTimeout(() => {
  console.error('time-out')
  app.exit(1)
}, 180000).unref()
require('../out/main/index.js')

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const js = (window, code) => window.webContents.executeJavaScript(code)

const cacheBytes = () => {
  const map = join(gegevens, 'kaartcache')
  if (!existsSync(map)) return 0
  return readdirSync(map)
    .map((naam) => statSync(join(map, naam)).size)
    .reduce((a, b) => a + b, 0)
}

app.whenReady().then(async () => {
  await wait(1500)
  const [main] = BrowserWindow.getAllWindows()

  const voor = cacheBytes()
  const t0 = Date.now()
  const geo = await js(main, `window.career.geometry(${JSON.stringify(kaart)})`)
  const duur = Date.now() - t0

  console.log(
    `${kaart}: ${duur} ms, ${geo ? geo.stops.length : 0} haltes, ` +
      `cache vooraf ${(voor / 1024 / 1024).toFixed(1)} MB, nu ${(cacheBytes() / 1024 / 1024).toFixed(1)} MB`
  )
  app.exit(0)
})
