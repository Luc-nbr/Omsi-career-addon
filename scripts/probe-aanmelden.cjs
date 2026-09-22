/**
 * Komt de aanmelding op de telefoon, en laat hij pas daarna de dienst zien?
 *
 *   npx electron scripts/probe-aanmelden.cjs <uitvoermap>
 *
 * Laadt alleen de overlaypagina en voedt hem een verzonnen beeld. OMSI wordt niet
 * aangeraakt en er wordt niets geschreven behalve het plaatje.
 *
 * Wat er nagerekend wordt: dat het cijferblok in de telefoon staat en niet in
 * het dienstpaneel, dat de balk met apps er zolang niet is, dat een verkeerd
 * nummer wordt afgewezen, dat het goede nummer naar de pincode gaat, en dat je
 * daarna de dienstopdracht krijgt en niet meteen de IBIS-codes.
 */
const { app, BrowserWindow } = require('electron')
const { writeFileSync, mkdirSync, mkdtempSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { pathToFileURL } = require('node:url')

/*
 * De overlaypagina vraagt het hoofdproces om zijn instellingen en zijn plek op
 * het scherm; zonder die handlers tekent hij zijn panelen niet. Dus laden we het
 * hoofdproces mee -- met een eigen gebruikersmap, zodat het profiel van de
 * gebruiker onaangeroerd blijft.
 */
app.setPath('userData', mkdtempSync(join(tmpdir(), 'omsi-aanmelden-')))
require('../out/main/index.js')

const outputDir = process.argv[process.argv.length - 1]
const schrijft = outputDir && !outputDir.endsWith('.cjs')
if (schrijft) mkdirSync(outputDir, { recursive: true })

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const js = (w, code) => w.webContents.executeJavaScript(code)

app.on('window-all-closed', () => {})
process.on('unhandledRejection', (e) => {
  console.error('mislukt: ' + e)
  app.exit(1)
})
setTimeout(() => {
  console.error('time-out')
  app.exit(1)
}, 60000).unref()

const beeld = {
  connected: true,
  editing: false,
  chauffeur: { naam: 'Luc', personeelsnummer: '481902', pincode: '7341' },
  duty: {
    mapFolder: 'Berlin-Spandau',
    mapName: 'Berlin-Spandau',
    lineFile: '5.ttp',
    tourNumber: '12',
    depot: '',
    legs: [
      { tripFile: 'a', lineFile: '5.ttp', lineNumber: '5', terminus: 'Rathaus Spandau', departure: 480, arrival: 520, minutes: 40, tourNumber: '12', switchInOmsi: false, layoverBefore: 0, stops: ['A', 'B'], stopIds: ['1', '2'], stopTimes: [480, 520] }
    ],
    signOn: 470,
    start: 480,
    end: 640,
    durationMinutes: 160,
    totalStops: 2,
    lineNumbers: ['5'],
    days: 0,
    period: 0
  }
}

app.whenReady().then(async () => {
  const venster = new BrowserWindow({
    width: 460,
    height: 820,
    show: false,
    webPreferences: { preload: join(__dirname, '..', 'out', 'preload', 'index.js') }
  })
  venster.webContents.on('render-process-gone', (_e, d) => console.error('pagina weg: ' + JSON.stringify(d)))
  venster.webContents.on('console-message', (_e, niveau, tekst) => {
    if (niveau >= 2) console.error('pagina zegt: ' + tekst)
  })

  await venster.loadURL(pathToFileURL(join(__dirname, '..', 'out', 'renderer', 'overlay.html')).href)
  await wait(1500)
  venster.webContents.send('overlay:frame', beeld)
  await wait(1000)

  const eerst = await js(venster, `({
    cijferblok: document.querySelectorAll('.cijferblok button').length,
    // Waar hij staat is het hele punt: in de telefoon, niet in het dienstpaneel.
    inTelefoon: document.querySelectorAll('.panel-navigatie .cijferblok button').length,
    inDienst: document.querySelectorAll('.panel-dienst .cijferblok button').length,
    // Een telefoon waarop je nog niet aangemeld bent, heeft ook geen appbalk.
    balk: document.querySelectorAll('.panel-navigatie .dock button').length,
    /*
     * Vangt het cijferblok de muis? Het venster laat klikken door naar OMSI,
     * behalve waar data-hit staat. Zonder dat was dit een plaatje: je zag de
     * toetsen wel, maar de klik ging dwars door de bus in.
     */
    toetsenVangen: [...document.querySelectorAll('.cijferblok button')].every((b) =>
      b.closest('[data-hit]')
    ),
    kaart: Boolean(document.querySelector('.panel-navigatie .route-map')),
    // En het dienstpaneel verwijst alleen maar naar de telefoon.
    dienstpaneel: document.querySelector('.panel-dienst .panel-body')?.textContent.trim(),
    vakjes: document.querySelectorAll('.aanmeld-vakjes span').length,
    uitleg: document.querySelector('.aanmeld-uitleg')?.textContent.trim(),
    opdracht: Boolean(document.querySelector('.opdracht')),
    ibis: Boolean(document.querySelector('.ibis, .ibisstap'))
  })`)
  console.log('bij binnenkomst: ' + JSON.stringify(eerst))

  if (schrijft) {
    venster.showInactive()
    await wait(400)
    writeFileSync(join(outputDir, 'aanmelden.png'), (await venster.capturePage()).toPNG())
  }

  const tik = (reeks) => js(venster, `(() => {
    for (const c of ${JSON.stringify(reeks)}.split('')) {
      const knop = [...document.querySelectorAll('.cijferblok button')].find((b) => b.textContent.trim() === c)
      if (knop) knop.click()
    }
  })()`)

  // Eerst een verkeerd nummer.
  await tik('999999')
  await wait(500)
  const naFout = await js(venster, `({
    fout: Boolean(document.querySelector('.aanmeld-fout')),
    uitleg: document.querySelector('.aanmeld-uitleg')?.textContent.trim()
  })`)
  console.log('na een verkeerd nummer: ' + JSON.stringify(naFout))

  // En dan het goede, plus de pincode.
  await tik('481902')
  await wait(500)
  const naNummer = await js(venster, `document.querySelector('.aanmeld-uitleg')?.textContent.trim()`)
  console.log('na het goede nummer: ' + naNummer)

  await tik('7341')
  await wait(700)
  const naPin = await js(venster, `({
    opdracht: Boolean(document.querySelector('.panel-navigatie .opdracht')),
    tekenVangt: Boolean(document.querySelector('.opdracht-teken')?.closest('[data-hit]')),
    regels: [...document.querySelectorAll('.opdracht-lijst dd')].map((d) => d.textContent.trim()),
    knop: document.querySelector('.opdracht-teken')?.textContent.trim(),
    cijferblok: document.querySelectorAll('.cijferblok button').length
  })`)
  console.log('na de pincode: ' + JSON.stringify(naPin))

  if (schrijft) {
    venster.showInactive()
    await wait(400)
    writeFileSync(join(outputDir, 'opdracht.png'), (await venster.capturePage()).toPNG())
    console.log('plaatje: opdracht.png')
  }

  // En na het tekenen hoort de telefoon zijn balk en zijn apps terug te krijgen.
  await js(venster, `document.querySelector('.opdracht-teken')?.click()`)
  await wait(700)
  const naTekenen = await js(venster, `({
    balk: document.querySelectorAll('.panel-navigatie .dock button').length,
    opdracht: Boolean(document.querySelector('.opdracht')),
    dienstpaneel: document.querySelector('.panel-dienst .panel-body')?.textContent.trim().slice(0, 60)
  })`)
  console.log('na het tekenen: ' + JSON.stringify(naTekenen))

  const goed =
    eerst.inTelefoon === 12 &&
    eerst.toetsenVangen &&
    naPin.tekenVangt &&
    eerst.inDienst === 0 &&
    eerst.balk === 0 &&
    !eerst.kaart &&
    naFout.fout &&
    naPin.opdracht &&
    naTekenen.balk > 0 &&
    !naTekenen.opdracht
  console.log(goed ? 'de volgorde klopt' : 'DE VOLGORDE KLOPT NIET')
  app.exit(goed ? 0 : 1)
})
