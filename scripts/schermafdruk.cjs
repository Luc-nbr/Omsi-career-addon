/**
 * Een HTML-bestand als plaatje.
 *
 *   npx electron scripts/schermafdruk.cjs <bestand.html> <plaatje.png> [breedte] [hoogte]
 *
 * Het voorbeeldpaneel legt geen lokale bestanden vast, en van iets dat getekend
 * wordt -- een icoontje, een staafje -- is de code geen bewijs. Dit opent het
 * bestand in een venster en schrijft weg wat er staat.
 *
 * Raakt de spelmap niet aan en schrijft alleen het plaatje dat je vraagt.
 */
const { app, BrowserWindow } = require('electron')
const { pathToFileURL } = require('node:url')
const { writeFileSync } = require('node:fs')
const { resolve } = require('node:path')

const args = process.argv.slice(process.argv.findIndex((a) => a.endsWith('schermafdruk.cjs')) + 1)
const bron = args[0]
const doel = args[1]
const breedte = Number(args[2]) || 1280
const hoogte = Number(args[3]) || 1600

if (!bron || !doel) {
  console.error('Geef een HTML-bestand en een plaatjesnaam.')
  process.exit(1)
}

app.on('window-all-closed', () => {})

app.whenReady().then(async () => {
  const venster = new BrowserWindow({
    show: false,
    width: breedte,
    height: hoogte,
    /* Hoger dan het scherm mag: we leggen de pagina vast, niet het beeldscherm. */
    webPreferences: { offscreen: false }
  })
  await venster.loadURL(pathToFileURL(resolve(bron)).href)
  // Even wachten tot de letters geladen zijn; anders staat er een vervanger.
  await new Promise((r) => setTimeout(r, 900))
  writeFileSync(doel, (await venster.capturePage()).toPNG())
  console.log(`geschreven: ${doel}`)
  app.exit(0)
})
