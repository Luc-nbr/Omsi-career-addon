/**
 * "Voeg IBIS-scherm toe": komt het apparaat in beeld, en BLIJFT het staan?
 *
 *   npx electron scripts/probe-apparaat.cjs
 *
 * Wat er nagerekend wordt, met de ALMEX van de Hamburgse stadsbus:
 * - de app stelt het apparaat zelf samen uit de model.cfg van de bus;
 * - het staat in de lijst onder "Voeg IBIS-scherm toe", met zijn aantal
 *   schermpjes en knoppen erbij;
 * - tikken zet het erbij, en het schermpje toont de tekst die de bus doorgeeft;
 * - het blijft staan. Dat was de fout die Luc zag: `writeSettings` schreef
 *   `busmodules` niet weg, dus las de app na twee tellen een lege lijst terug en
 *   verdween het apparaat weer uit beeld;
 * - en het staat ook na een herstart van de app nog in de instellingen.
 *
 * Er wordt niets van de gebruiker aangeraakt: een kopie van de gebruikersmap,
 * een eigen live.json, en de server alleen op 127.0.0.1. OMSI blijft erbuiten.
 */
const { app, BrowserWindow, ipcMain } = require('electron')
const { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, utimesSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const http = require('node:http')

const NUMMER = '123456'
const PINCODE = '9876'

/** Een POST naar de eigen server van de app, zoals de telefoon hem doet. */
function post(url, lijf) {
  return new Promise((klaar) => {
    const v = http.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } }, (a) => {
      let t = ''
      a.on('data', (d) => (t += d))
      a.on('end', () => klaar(t))
    })
    v.on('error', () => klaar(''))
    v.write(JSON.stringify(lijf))
    v.end()
  })
}

/** De bus waar de proef mee rekent, en waar zijn ALMEX op reageert. */
const BUS = {
  naam: 'Stadtbus 2017',
  model: 'Model/model_17_solo.cfg',
  pad: 'Vehicles/HH_Stadtbus2017/',
  bestand: ''
}
const VARS = {
  almex_s_uhrzeit: '13:45',
  almex_s_ziel: '  5 WEDEL',
  almex_s_hst1: 'ALTONA',
  almex_s_hst2: 'BAHRENFELD',
  almex_s_bubble1: 'EINZEL 2,40',
  almex_s_bubble2: 'KURZ  1,70'
}

const map = mkdtempSync(join(tmpdir(), 'omsi-apparaat-'))
const bron = join(process.env.APPDATA, 'omsi-enhancer')
cpSync(join(bron, 'settings.json'), join(map, 'settings.json'))
cpSync(join(bron, 'profiles'), join(map, 'profiles'), { recursive: true })
const inst = JSON.parse(readFileSync(join(map, 'settings.json'), 'utf8'))
inst.tourSeen = true
delete inst.busmodules
delete inst.apparaatSleutel
delete inst.apparaatPoort
writeFileSync(join(map, 'settings.json'), JSON.stringify(inst, null, 2))
for (const naam of readdirSync(join(map, 'profiles')).filter((n) => n.endsWith('.json') && n !== 'active.json')) {
  const pad = join(map, 'profiles', naam)
  const p = JSON.parse(readFileSync(pad, 'utf8'))
  p.personeelsnummer = NUMMER
  p.pincode = PINCODE
  writeFileSync(pad, JSON.stringify(p, null, 2))
}
const live = join(mkdtempSync(join(tmpdir(), 'omsi-apparaat-live-')), 'OMSI Career')
mkdirSync(live, { recursive: true })
process.env.OMSI_ENHANCER_LIVEMAP = live
process.env.OMSI_ENHANCER_APPARAAT_HOST = '127.0.0.1'
process.env.OMSI_ENHANCER_PROEFPROCES = 'GeenOmsiProef'
app.setPath('userData', map)
setTimeout(() => app.exit(1), 120000).unref()
require('../out/main/index.js')
const wacht = (ms) => new Promise((r) => setTimeout(r, ms))
const js = (w, code) => w.webContents.executeJavaScript(code)
app.on('window-all-closed', () => {})
app.on('browser-window-created', (_e, w) => {
  if (w.webContents.isOffscreen()) return
  w.show = () => {}
  w.showInactive = () => {}
  w.hide()
})

app.whenReady().then(async () => {
  ipcMain.removeHandler('plugin:status')
  ipcMain.handle('plugin:status', () => ({ installed: true, upToDate: true, changed: false, target: '' }))
  await wacht(2500)
  const hoofd = BrowserWindow.getAllWindows()[0]
  const dienst = (await js(hoofd, `window.career.career().then((p) => p.state?.activeDuty?.assignment?.duty)`)) ?? {
    mapFolder: 'Hamburg', mapName: 'Hamburg', lineFile: '5.ttp', tourNumber: '3', depot: '',
    legs: [{
      tripFile: 'a', lineFile: '5.ttp', lineNumber: '5', terminus: 'Wedel', departure: 480,
      arrival: 520, minutes: 40, tourNumber: '3', switchInOmsi: false, layoverBefore: 0,
      stops: ['Altona', 'Bahrenfeld', 'Wedel'], stopIds: ['1', '2', '3'], stopTimes: [480, 500, 520]
    }],
    signOn: 470, start: 480, end: 640, durationMinutes: 160, totalStops: 3,
    lineNumbers: ['5'], days: 0, period: 0
  }
  const rit = dienst.legs[0]
  writeFileSync(join(live, 'live.json'), JSON.stringify({
    alive: true, seen: 8388607, seenSys: 63, seenStr: 63, strKind: 1, plugin: 12,
    time: 49500, day: 1, month: 7, year: 2026, velocity: 0, passengers: 6,
    scheduleActive: 1, targetIndex: 0, tankPercent: 0.7, km: 0, metres: 0,
    busstopIndex: 2, busstop: rit.stops[2] ?? '', line: rit.lineNumber, terminus: rit.terminus,
    matrix: '', delayMin: '', delaySec: '', entryRequest: 0, exitRequest: 0, ticket: -1,
    entryOpen: 0, exitOpen: 0, atStation: 0, brightness: 0.5, streetCond: 0, precipRate: 0,
    precipType: 0, lightsLow: 1, blinkerLeft: 0, blinkerRight: 0, brakeLight: 0, engineOn: 1,
    maxBrake: 0, maxAccel: 0, topSpeed: 0, harshBrakes: 0, harshAccels: 0, battery: 0,
    temperature: 0, collisions: 0, collisionEnergy: 0, worstCollision: 0, exeVersion: '2.3.004',
    bus: BUS, vars: VARS,
    ibis: { bestemming: '', lijn: '', lawo1: '', lawo2: '', lawo3: '', lawo4: '', afr1: '', afr2: '' },
    mem: { ok: 0 }
  }))
  writeFileSync(join(live, 'schermen.json'), JSON.stringify({
    bus: BUS.naam, model: BUS.model, pad: BUS.pad, bestand: '', aantal: Object.keys(VARS).length, vars: VARS
  }))
  setInterval(() => { const nu = new Date(); utimesSync(join(live, 'live.json'), nu, nu) }, 2000).unref()

  await js(hoofd, `window.career.setOverlay(${JSON.stringify(dienst)}, true)`)
  await wacht(1500)
  /* Aanmelden en de dienst aannemen; anders staat de telefoon op het aanmeldscherm. */
  const stand = await js(hoofd, `window.career.apparaatStart()`)
  await post(stand.url + 'api/telefoon', { wat: 'aanmelden', nummer: NUMMER })
  await post(stand.url + 'api/telefoon', { wat: 'aanmelden', nummer: NUMMER, pin: PINCODE })
  await post(stand.url + 'api/telefoon', { wat: 'aanvaard' })
  await wacht(1200)
  const overlay = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('overlay'))
  if (!overlay) {
    console.log('geen overlay')
    app.exit(1)
    return
  }
  await js(overlay, `[...document.querySelectorAll('.dock-knop')].find((b) => b.getAttribute('aria-label') === 'IBIS')?.click()`)
  await wacht(1000)

  console.log('voor het openen:', JSON.stringify(await js(overlay, `({
    app: document.querySelector('.dock-knop[aria-pressed="true"]')?.getAttribute('aria-label'),
    ibis: Boolean(document.querySelector('.ibis')),
    kiezer: Boolean(document.querySelector('.module-knop')),
    knoptekst: document.querySelector('.module-knop')?.textContent
  })`)))

  /* De lijst openklappen: daar hoort de ALMEX in te staan. */
  await js(overlay, `document.querySelector('.module-knop')?.click()`)
  await wacht(500)
  const lijst = await js(overlay, `[...document.querySelectorAll('.module-lijst button')].map((b) => ({
    naam: b.querySelector('b')?.textContent ?? '', maat: b.querySelector('small')?.textContent ?? '', aan: b.classList.contains('aan')
  }))`)
  console.log('in de lijst:', JSON.stringify(lijst))

  /* De ALMEX erbij. */
  await js(overlay, `[...document.querySelectorAll('.module-lijst button')].find((b) => (b.querySelector('b')?.textContent ?? '').includes('ALMEX'))?.click()`)
  await wacht(1500)
  const erbij = await js(overlay, `({
    vlak: Boolean(document.querySelector('.paneel-vlak')),
    velden: [...document.querySelectorAll('.vlak-veld')].map((e) => e.textContent),
    rijen: document.querySelectorAll('.paneel-rij').length,
    cijfers: [...document.querySelectorAll('.paneel-knop')].map((b) => b.textContent)
  })`)
  console.log('na het toevoegen:', JSON.stringify(erbij))

  /*
   * En nu blijven staan. De keuze wordt uit de instellingen teruggelezen, met
   * een geheugen van twee tellen ertussen; vier tellen wachten dekt dat ruim.
   */
  await wacht(4000)
  const nog = await js(overlay, `({
    vlak: Boolean(document.querySelector('.paneel-vlak')),
    velden: document.querySelectorAll('.vlak-veld').length
  })`)
  console.log('vier tellen later:', JSON.stringify(nog))

  const bewaard = existsSync(join(map, 'settings.json'))
    ? JSON.parse(readFileSync(join(map, 'settings.json'), 'utf8')).busmodules
    : undefined
  console.log('in settings.json:', JSON.stringify(bewaard))

  const goed =
    lijst.some((rij) => rij.naam.includes('ALMEX')) &&
    erbij.vlak &&
    erbij.velden.includes('ALTONA') &&
    erbij.velden.includes('13:45') &&
    erbij.cijfers.includes('7') &&
    nog.vlak &&
    nog.velden > 0 &&
    Boolean(bewaard) &&
    Object.values(bewaard ?? {}).some((lijstje) => lijstje.some((id) => id.includes('almex')))
  console.log(goed ? 'het apparaat komt erbij en blijft staan' : 'HET APPARAAT BLIJFT NIET STAAN')
  app.exit(goed ? 0 : 1)
})
