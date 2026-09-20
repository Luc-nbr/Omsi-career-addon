/**
 * Hapert de app terwijl hij de kaarten inleest?
 *
 *   npx electron scripts/probe-haperen.cjs [seconden]
 *
 * Meet wat de speler merkt. Het scherm stelt elke 50 ms de goedkoopste vraag
 * die er is (`app:version`) en klokt hoe lang het antwoord duurt. Zolang het
 * hoofdproces vrij is, is dat een paar milliseconden; ligt het stil omdat het
 * een kaart uitleest, dan wacht die vraag net zo lang als de speler op zijn
 * knop wacht. De grootste uitschieter is dus precies de hapering uit de melding
 * van 19-09-2026 ("hängt sich ständig auf nach jedem drücken eines Buttons").
 *
 * Draait met een verse gebruikersmap, dus de kaartcache is leeg en het voorwerk
 * gaat echt aan het werk. De profielen van de speler blijven onaangeroerd.
 */
const { app, BrowserWindow } = require('electron')
const { mkdtempSync, readFileSync, existsSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

const args = process.argv.slice(
  process.argv.findIndex((arg) => arg.endsWith('probe-haperen.cjs')) + 1
)
const seconden = Number(args[0] || 75)

const gebruikersmap = mkdtempSync(join(tmpdir(), 'omsi-haperen-'))
app.setPath('userData', gebruikersmap)
setTimeout(() => {
  console.error('time-out')
  app.exit(1)
}, (seconden + 60) * 1000).unref()
require('../out/main/index.js')

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

app.whenReady().then(async () => {
  await wait(1500)
  const [main] = BrowserWindow.getAllWindows()

  console.log(`meten gedurende ${seconden} s, verse gebruikersmap ${gebruikersmap}`)
  const metingen = await main.webContents.executeJavaScript(`
    (async () => {
      const duren = []
      const einde = Date.now() + ${seconden * 1000}
      while (Date.now() < einde) {
        const begin = performance.now()
        await window.career.version()
        duren.push(performance.now() - begin)
        await new Promise((r) => setTimeout(r, 50))
      }
      return duren
    })()
  `)

  metingen.sort((a, b) => a - b)
  const bij = (deel) => metingen[Math.min(metingen.length - 1, Math.floor(metingen.length * deel))]
  const boven = (grens) => metingen.filter((d) => d >= grens).length
  console.log(`vragen: ${metingen.length}`)
  console.log(`midden: ${bij(0.5).toFixed(0)} ms, 95%: ${bij(0.95).toFixed(0)} ms`)
  console.log(`langste: ${metingen[metingen.length - 1].toFixed(0)} ms`)
  console.log(`boven 150 ms: ${boven(150)}, boven 500 ms: ${boven(500)}, boven 1 s: ${boven(1000)}`)

  const logboek = join(gebruikersmap, 'logs', 'omsi-enhancer.log')
  if (existsSync(logboek)) {
    console.log(`\nlogboek (${logboek}):`)
    console.log(readFileSync(logboek, 'utf8').trim())
  } else {
    console.log('\ngeen logboek gevonden')
  }

  app.exit(0)
})
