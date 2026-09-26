/**
 * Hoe een nagebouwd apparaat eruitziet op de telefoon en op de tablet.
 *
 *   npx electron scripts/schermafdruk-apparaat.cjs
 *
 * Neemt de ALMEX van de Hamburgse stadsbus, vult zijn schermvakken met wat er in
 * het spel op zou staan, en zet er twee afdrukken van weg in `scripts/afdruk/`.
 * Zo is te zien of het apparaat er nog uitziet zoals het in de bus zit -- de
 * haltelijst onder elkaar, de verkooptegels in twee kolommen, het cijferblok met
 * de 1 boven.
 *
 * Er wordt niets van de gebruiker aangeraakt: een kopie van de gebruikersmap,
 * een eigen live.json, en de server alleen op 127.0.0.1. OMSI blijft erbuiten.
 */
const { app, BrowserWindow, ipcMain } = require('electron')
const { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, utimesSync, writeFileSync } = require('node:fs')
const http = require('node:http')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

const WT = 'C:/OMSI Career/.claude/worktrees/ecstatic-noether-296800'
const NUMMER = '123456'
const PINCODE = '9876'
const BUS = { naam: 'Stadtbus 2017', model: 'Model/model_17_solo.cfg', pad: 'Vehicles/HH_Stadtbus2017/', bestand: '' }

const map = mkdtempSync(join(tmpdir(), 'omsi-almex-'))
const bron = join(process.env.APPDATA, 'omsi-enhancer')
cpSync(join(bron, 'settings.json'), join(map, 'settings.json'))
cpSync(join(bron, 'profiles'), join(map, 'profiles'), { recursive: true })
const inst = JSON.parse(readFileSync(join(map, 'settings.json'), 'utf8'))
inst.tourSeen = true
delete inst.apparaatSleutel
delete inst.apparaatPoort
/* De ALMEX staat al aan: dat is wat "Voeg IBIS-scherm toe" bewaart. */
inst.busmodules = { 'vehicles/hh_stadtbus2017': ['/almex'] }
writeFileSync(join(map, 'settings.json'), JSON.stringify(inst, null, 2))
for (const naam of readdirSync(join(map, 'profiles')).filter((n) => n.endsWith('.json') && n !== 'active.json')) {
  const pad = join(map, 'profiles', naam)
  const p = JSON.parse(readFileSync(pad, 'utf8'))
  p.personeelsnummer = NUMMER
  p.pincode = PINCODE
  writeFileSync(pad, JSON.stringify(p, null, 2))
}
const live = join(mkdtempSync(join(tmpdir(), 'omsi-almex-live-')), 'OMSI Career')
mkdirSync(live, { recursive: true })
process.env.OMSI_ENHANCER_LIVEMAP = live
process.env.OMSI_ENHANCER_APPARAAT_HOST = '127.0.0.1'
process.env.OMSI_ENHANCER_PROEFPROCES = 'GeenOmsiProef'
app.setPath('userData', map)
setTimeout(() => app.exit(1), 180000).unref()
require(WT + '/out/main/index.js')
const wacht = (ms) => new Promise((r) => setTimeout(r, ms))
const js = (w, code) => w.webContents.executeJavaScript(code)
app.on('window-all-closed', () => {})
app.on('browser-window-created', (_e, w) => {
  if (w.webContents.isOffscreen()) return
  w.show = () => {}
  w.showInactive = () => {}
  w.hide()
})

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

/* Wat er op een ALMEX staat als je in menu 9 -- de verkoop -- zit. */
const VARS = {
  almex_s_uhrzeit: '13:45',
  almex_s_ziel: '  5 WEDEL',
  almex_s_versp: '+2',
  almex_s_matrix1: 'S-BAHN',
  almex_s_matrix2: 'WEDEL',
  almex_s_input: '',
  almex_s_bubble1: 'EINZEL 2,40',
  almex_s_bubble2: 'KURZ  1,70',
  almex_s_bubble3: 'KIND  0,90',
  almex_s_bubble4: 'TAGES 6,40',
  almex_s_bubble5: 'GRUPP 12,00',
  almex_s_bubble6: 'FAHRR 2,40',
  almex_s_bubble7: '9UHR  4,80',
  almex_s_bubble8: 'ZONE  3,60',
  almex_s_hst1: 'ALTONA',
  almex_s_hst2: 'BAHRENFELD',
  almex_s_hst3: 'OTHMARSCHEN',
  almex_s_hst4: 'KLEIN FLOTTB',
  almex_s_hst5: 'BLANKENESE',
  almex_s_hst6: 'SCHENEFELD',
  almex_s_hst7: 'WEDEL'
}

app.whenReady().then(async () => {
  ipcMain.removeHandler('plugin:status')
  ipcMain.handle('plugin:status', () => ({ installed: true, upToDate: true, changed: false, target: '' }))
  await wacht(2500)
  const hoofd = BrowserWindow.getAllWindows()[0]
  const dienst = (await js(hoofd, `window.career.career().then((p) => p.state?.activeDuty?.assignment?.duty)`)) ?? {
    mapFolder: 'Hamburg', mapName: 'Hamburg', lineFile: '5.ttp', tourNumber: '3', depot: '',
    legs: [{ tripFile: 'a', lineFile: '5.ttp', lineNumber: '5', terminus: 'Wedel', departure: 480, arrival: 520, minutes: 40, tourNumber: '3', switchInOmsi: false, layoverBefore: 0, stops: ['Altona', 'Bahrenfeld', 'Wedel'], stopIds: ['1', '2', '3'], stopTimes: [480, 500, 520] }],
    signOn: 470, start: 480, end: 640, durationMinutes: 160, totalStops: 3, lineNumbers: ['5'], days: 0, period: 0
  }
  const rit = dienst.legs[0]
  const beeld = () => ({
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
  })
  writeFileSync(join(live, 'live.json'), JSON.stringify(beeld()))
  writeFileSync(join(live, 'schermen.json'), JSON.stringify({
    bus: BUS.naam, model: BUS.model, pad: BUS.pad, bestand: '', aantal: Object.keys(VARS).length, vars: VARS
  }))
  setInterval(() => { const nu = new Date(); utimesSync(join(live, 'live.json'), nu, nu) }, 2000).unref()

  await js(hoofd, `window.career.setOverlay(${JSON.stringify(dienst)}, true)`)
  await wacht(1500)
  const stand = await js(hoofd, `window.career.apparaatStart()`)
  const url = stand.url
  await post(url + 'api/telefoon', { wat: 'aanmelden', nummer: NUMMER })
  await post(url + 'api/telefoon', { wat: 'aanmelden', nummer: NUMMER, pin: PINCODE })
  await post(url + 'api/telefoon', { wat: 'aanvaard' })
  await wacht(1200)

  const overlay = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('overlay'))
  await js(overlay, `[...document.querySelectorAll('.dock-knop')].find((b) => b.getAttribute('aria-label') === 'IBIS')?.click()`)
  await wacht(1200)
  console.log('overlay:', JSON.stringify(await js(overlay, `({
    keuzes: [...document.querySelectorAll('.ibis-keuze button')].map((b) => b.textContent),
    vlak: Boolean(document.querySelector('.paneel-vlak')),
    velden: document.querySelectorAll('.vlak-veld').length,
    knoppen: document.querySelectorAll('.vlak-knop').length,
    rijen: document.querySelectorAll('.paneel-rij').length,
    teksten: [...document.querySelectorAll('.vlak-veld')].map((e) => e.textContent).slice(0, 6),
    maten: [...document.querySelectorAll('.vlak-veld')].slice(0, 4).map((e) => { const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return { t: e.textContent, f: s.fontSize, w: Math.round(r.width), h: Math.round(r.height), c: s.color, b: s.backgroundColor } }),
    knopmaten: [...document.querySelectorAll('.vlak-knop')].slice(0, 3).map((e) => { const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return { t: e.textContent, f: s.fontSize, w: Math.round(r.width), h: Math.round(r.height) } }),
    modules: [...document.querySelectorAll('.module-lijst button')].map((b) => b.textContent)
  })`)))

  const uit = join(WT, 'scripts/afdruk')
  mkdirSync(uit, { recursive: true })
  for (const [naam, breed, hoog] of [['telefoon', 390, 844], ['ipad', 1194, 834]]) {
    const venster = new BrowserWindow({ width: breed, height: hoog, show: false, webPreferences: { offscreen: true } })
    let laatste
    venster.webContents.on('paint', (_e, _v, b) => (laatste = b))
    venster.webContents.setFrameRate(10)
    await venster.loadURL(url)
    await wacht(2500)
    await js(venster, `[...document.querySelectorAll('.dock-knop')].find((b) => b.getAttribute('aria-label') === 'IBIS')?.click()`)
    await wacht(1500)
    venster.webContents.invalidate()
    await wacht(900)
    if (!laatste || laatste.isEmpty()) { console.log(naam + ': geen beeld'); venster.destroy(); continue }
    writeFileSync(join(uit, `almex-${naam}.png`), laatste.toPNG())
    console.log(naam + ':', JSON.stringify(await js(venster, `(() => {
      const v = document.querySelector('.paneel-vlak')
      const r = v && v.getBoundingClientRect()
      return { vlak: r ? Math.round(r.width) + 'x' + Math.round(r.height) : null, velden: document.querySelectorAll('.vlak-veld').length, knoppen: document.querySelectorAll('.vlak-knop').length }
    })()`)))
    venster.destroy()
  }
  app.exit(0)
})
