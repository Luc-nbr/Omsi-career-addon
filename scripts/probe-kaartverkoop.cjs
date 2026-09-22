/**
 * Hoe ziet de kaartjes-app eruit, en rekent hij goed?
 *
 *   npx electron scripts/probe-kaartverkoop.cjs <uitvoermap>
 *
 * Opent alleen het overlayvenster en voert het een verzonnen beeld met een echte
 * kaartset erin. OMSI wordt niet aangeraakt en er wordt niets geschreven.
 *
 * Nagerekend: dat de kaartjes met hun prijzen op het scherm komen, dat een
 * kaartje aanklikken de coupureknoppen geeft, en dat twee tikken op twee euro
 * bij een kaartje van 2,70 als wisselgeld 1,30 oplevert.
 */
const { app, BrowserWindow } = require('electron')
const { writeFileSync, mkdirSync } = require('node:fs')
const { join } = require('node:path')
const { pathToFileURL } = require('node:url')

const outputDir = process.argv[process.argv.length - 1]
if (outputDir && !outputDir.endsWith('.cjs')) mkdirSync(outputDir, { recursive: true })

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const js = (w, code) => w.webContents.executeJavaScript(code)

app.on('window-all-closed', () => {})

/* Een kaartset zoals core/kaartjes.ts hem uit Berlin_1.otp leest. */
const kaartjes = {
  naam: 'Berlin_1',
  bestand: 'TicketPacks/Berlin_1/Berlin_1.otp',
  koopkans: 0.2,
  kaartjes: [
    { naam: 'Fahrschein', naamEngels: 'Full rate', prijs: 2.7, maxHaltes: 0, leeftijdVan: 14, leeftijdTot: 200, schermtekst: 'Fahrschein Nor' },
    { naam: 'Kurzstrecke', naamEngels: 'Short haul', prijs: 1.7, maxHaltes: 6, leeftijdVan: 14, leeftijdTot: 200, schermtekst: 'Kurzstr Norm' },
    { naam: 'Tageskarte', naamEngels: 'Day ticket', prijs: 9, maxHaltes: 0, leeftijdVan: 14, leeftijdTot: 200, schermtekst: 'Tageskarte Nor', dagkaart: true }
  ]
}

app.whenReady().then(async () => {
  const venster = new BrowserWindow({
    width: 460,
    height: 760,
    show: false,
    webPreferences: { preload: join(__dirname, '..', 'out', 'preload', 'index.js') }
  })
  await venster.loadURL(pathToFileURL(join(__dirname, '..', 'out', 'renderer', 'overlay.html')).href)
  await wait(1200)

  venster.webContents.send('overlay:frame', {
    connected: true,
    editing: false,
    kaartjes,
    status: { clockMinutes: 500, deltaSeconds: 0, delayMinutes: 0, legIndex: 0, stopIndex: 0 }
  })
  await wait(900)

  const gevonden = await js(venster, `(() => {
    const knop = [...document.querySelectorAll('.dock-knop')].find((b) => /kaartje|ticket|fahrschein|billet/i.test(b.getAttribute('aria-label') || ''))
    if (knop) knop.click()
    return Boolean(knop)
  })()`)
  console.log('knop in de balk: ' + gevonden)
  await wait(600)

  const lijst = await js(venster, `[...document.querySelectorAll('.kaartlijst button')].map((b) => b.textContent.trim())`)
  console.log('kaartjes: ' + JSON.stringify(lijst))

  await js(venster, `[...document.querySelectorAll('.kaartlijst button')][0].click()`)
  await wait(400)
  const coupures = await js(venster, `[...document.querySelectorAll('.coupures button')].map((b) => b.textContent.trim())`)
  console.log('coupures: ' + coupures.join(' '))

  await js(venster, `(() => {
    const knop = [...document.querySelectorAll('.coupures button')].find((b) => b.textContent.trim() === '2.00')
    knop.click(); knop.click()
  })()`)
  await wait(500)

  const uit = await js(venster, `(() => ({
    gegeven: document.querySelector('.kaartsom b')?.textContent.trim(),
    terug: document.querySelector('.kaartterugbedrag b')?.textContent.trim(),
    munten: [...document.querySelectorAll('.kaartmunten span')].map((s) => s.textContent.replace(/\s+/g, ' ').trim())
  }))()`)

  console.log('kaartje 2.70, twee keer 2.00: gegeven ' + uit.gegeven + ', terug ' + uit.terug)
  console.log('munten: ' + uit.munten.join(', '))
  const klopt = uit.gegeven === '4.00' && uit.terug === '1.30'
  console.log(klopt ? 'klopt' : 'KLOPT NIET (verwacht 4.00 en 1.30)')

  if (outputDir && !outputDir.endsWith('.cjs')) {
    venster.showInactive()
    await wait(500)
    writeFileSync(join(outputDir, 'kaartapp.png'), (await venster.capturePage()).toPNG())
    console.log('plaatje: kaartapp.png')
  }
  app.exit(klopt ? 0 : 1)
})
