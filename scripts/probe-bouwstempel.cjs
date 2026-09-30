/**
 * De bouwstempel: staat hij bij het versienummer en in de eerste regel van het
 * logboek?
 *
 *   npx electron-vite build
 *   npx electron scripts/probe-bouwstempel.cjs      (PROEF_MAP=<map> voor een eigen werkmap)
 *
 * De gebouwde app (out/) met een eigen gebruikersmap en een nagebouwde
 * OMSI-map, zodat er niets van de gebruiker geraakt wordt. Verwacht:
 * `bouw <korte hash> · <jjjj-mm-dd uu:mm> · dev` -- dev, want dit is geen
 * ingepakte exe -- met de hash van de broncode waaruit out/ gebouwd is.
 * Maakt een schermafdruk `bouwstempel.png` in de werkmap.
 *
 * Op de oude code (vóór 28-09) faalt dit: daar stond alleen het nummer.
 */
const { app, BrowserWindow } = require('electron')
const { execFileSync } = require('node:child_process')
const { mkdirSync, readFileSync, rmSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

const werk = join(process.env.PROEF_MAP || tmpdir(), 'bouwstempel')
rmSync(werk, { recursive: true, force: true })
const omsi = join(werk, 'OMSI 2')
const data = join(werk, 'userdata')
mkdirSync(omsi, { recursive: true })
mkdirSync(data, { recursive: true })
writeFileSync(join(omsi, 'Omsi.exe'), '')
writeFileSync(join(data, 'settings.json'), JSON.stringify({ language: 'nl', omsiPath: omsi, omsiConfirmed: true }))
// Nooit het echte OMSI: de vraag "draait OMSI?" gaat naar een naam die niet bestaat.
process.env.OMSI_ENHANCER_PROEFPROCES = 'GeenOmsiProefBouw'

app.setPath('userData', data)
setTimeout(() => {
  console.error('time-out')
  app.exit(1)
}, 90000).unref()
// Een eigen map voor live.json: zo schrijft de app in deze proef nooit in de map van de echte plugin, ook niet als OMSI draait (tegenlezing 30-09).
process.env.OMSI_ENHANCER_LIVEMAP ??= require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'omsi-proef-live-'))
require('../out/main/index.js')

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let fouten = 0
const klopt = (wat, ja) => {
  console.log(`${ja ? 'ok  ' : 'FOUT'} ${wat}`)
  if (!ja) fouten++
}

app.whenReady().then(async () => {
  await wait(3500)
  const [main] = BrowserWindow.getAllWindows()
  const versie = await main.webContents.executeJavaScript(
    `[...document.querySelectorAll('.versie, .welkom-versie, .hub-versie')].map((e) => e.textContent).join(' | ')`
  )
  let hash = '?'
  try {
    hash = execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { cwd: join(__dirname, '..'), encoding: 'utf8' }).trim()
  } catch {
    // Zonder git alleen de vorm.
  }
  const vorm = /bouw ([0-9a-f]{7})\+? · \d{4}-\d{2}-\d{2} \d{2}:\d{2} · dev/
  const opScherm = vorm.exec(versie)
  klopt(`bij het versienummer: "${versie}"`, Boolean(opScherm))
  klopt(`de hash is die van de broncode (${opScherm?.[1]} = ${hash})`, opScherm?.[1] === hash)

  const logboek = readFileSync(join(data, 'logs', 'omsi-enhancer.log'), 'utf8').split(/\r?\n/)
  const eerste = logboek.find((regel) => regel.includes('=== OMSI Enhancer')) ?? ''
  klopt(`eerste regel van het logboek: "${eerste.replace(/^\S+ \S+\s+/, '')}"`, vorm.test(eerste))

  writeFileSync(join(werk, 'bouwstempel.png'), (await main.capturePage()).toPNG())
  console.log(`afdruk: ${join(werk, 'bouwstempel.png')}`)
  console.log(fouten ? `\n${fouten} fout(en)` : '\nalles klopt')
  app.exit(fouten ? 1 : 0)
})
