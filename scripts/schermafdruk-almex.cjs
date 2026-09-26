/**
 * De ALMEX van Lucs bus, zoals de telefoon hem natekent -- naast het plaatje uit het spel.
 *
 *   npx electron scripts/schermafdruk-almex.cjs [menu]
 *
 * Doet alsof OMSI draait met de elektrische gelenkbus van de HHA
 * (HH20_EBus2021, model_21_main.cfg) en de ALMEX in het gegeven menu (standaard 0,
 * het HOCHBAHN-startscherm). Een nep-plugin leest vragen.txt en getallen.txt zoals
 * de echte, en antwoordt in live.json met de teksten van Lucs schermafdruk
 * ('    LEE', 'LEER', '--:--', '04:13:07') en de getallen almex_menu, almex_ein
 * en trans_dauer. Daarna gaan er afdrukken naar `scripts/afdruk/` van de telefoon
 * en de tablet, en van het plaatje 17_almex_s_<menu>.jpg zelf, om naast elkaar te
 * leggen.
 *
 * Er wordt niets van de gebruiker aangeraakt: een kopie van de gebruikersmap,
 * een eigen map voor live.json, en de server alleen op 127.0.0.1.
 */
const { app, BrowserWindow, ipcMain } = require('electron')
const { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, copyFileSync } = require('node:fs')
const http = require('node:http')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

const WT = join(__dirname, '..')
const OMSI = 'C:/Program Files (x86)/Steam/steamapps/common/OMSI 2'
const MENU = Number(process.argv.find((a) => /^-?\d+$/.test(a)) ?? 0)
const NUMMER = '123456'
const PINCODE = '9876'
const BUS = { naam: 'Elektro-Gelenkbus - HHA 2021', model: 'Model/model_21_main.cfg', pad: 'Vehicles/HH20_EBus2021/', bestand: '' }

const map = mkdtempSync(join(tmpdir(), 'omsi-almex21-'))
const bron = join(process.env.APPDATA, 'omsi-enhancer')
cpSync(join(bron, 'settings.json'), join(map, 'settings.json'))
cpSync(join(bron, 'profiles'), join(map, 'profiles'), { recursive: true })
const inst = JSON.parse(readFileSync(join(map, 'settings.json'), 'utf8'))
inst.tourSeen = true
delete inst.apparaatSleutel
delete inst.apparaatPoort
inst.busmodules = { 'vehicles/hh20_ebus2021': ['/almex'] }
writeFileSync(join(map, 'settings.json'), JSON.stringify(inst, null, 2))
for (const naam of readdirSync(join(map, 'profiles')).filter((n) => n.endsWith('.json') && n !== 'active.json')) {
  const pad = join(map, 'profiles', naam)
  const p = JSON.parse(readFileSync(pad, 'utf8'))
  p.personeelsnummer = NUMMER
  p.pincode = PINCODE
  writeFileSync(pad, JSON.stringify(p, null, 2))
}
const live = join(mkdtempSync(join(tmpdir(), 'omsi-almex21-live-')), 'OMSI Career')
mkdirSync(live, { recursive: true })
process.env.OMSI_ENHANCER_LIVEMAP = live
process.env.OMSI_ENHANCER_APPARAAT_HOST = '127.0.0.1'
process.env.OMSI_ENHANCER_PROEFPROCES = 'GeenOmsiProef'
app.setPath('userData', map)
setTimeout(() => app.exit(1), 240000).unref()
require(join(WT, 'out/main/index.js'))
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

/** Wat de ALMEX in Lucs schermafdruk toonde. */
const TEKSTEN = {
  almex_s_ziel: '    LEE',
  almex_s_matrix1: 'LEER',
  almex_s_matrix2: '',
  almex_s_versp: '--:--',
  almex_s_uhrzeit: '04:13:07'
}
/** De getallen; alles wat niet genoemd is, is 0 -- zo begint OMSI ook. */
const GETALLEN = { almex_menu: MENU, almex_ein: 1, trans_dauer: 1 }

function regels(bestand) {
  try {
    return readFileSync(join(live, bestand), 'utf8').split(/\r?\n/).filter(Boolean)
  } catch {
    return []
  }
}

let meldingen = 0
function nepPlugin(rit) {
  const vars = {}
  for (const naam of regels('vragen.txt')) vars[naam] = TEKSTEN[naam] ?? ''
  const getallen = {}
  for (const naam of regels('getallen.txt')) getallen[naam] = GETALLEN[naam] ?? 0
  if (meldingen++ === 20) {
    console.log(`nep-plugin: ${Object.keys(vars).length} teksten en ${Object.keys(getallen).length} getallen gevraagd`)
  }
  writeFileSync(
    join(live, 'live.json'),
    JSON.stringify({
      alive: true, seen: 8388607, seenSys: 63, seenStr: 63, strKind: 1, plugin: 13,
      time: 14787, day: 1, month: 2, year: 2026, velocity: 0, passengers: 0,
      scheduleActive: 1, targetIndex: 0, tankPercent: 0.7, km: 0, metres: 0,
      busstopIndex: 0, busstop: rit.stops[0] ?? '', line: rit.lineNumber, terminus: rit.terminus,
      matrix: '', delayMin: '', delaySec: '', entryRequest: 0, exitRequest: 0, ticket: -1,
      entryOpen: 0, exitOpen: 0, atStation: 1, brightness: 0.5, streetCond: 0, precipRate: 0,
      precipType: 0, lightsLow: 1, blinkerLeft: 0, blinkerRight: 0, brakeLight: 0, engineOn: 1,
      maxBrake: 0, maxAccel: 0, topSpeed: 0, harshBrakes: 0, harshAccels: 0, battery: 0,
      temperature: 0, collisions: 0, collisionEnergy: 0, worstCollision: 0, exeVersion: '2.3.004',
      bus: BUS, vars, varsAfgekapt: false,
      getallen, getallenOnbekend: [], getallenAfgekapt: false, getalAantal: 1699,
      meshAantal: 0, zichtbaar: '',
      ibis: { bestemming: '', lijn: '', lawo1: '', lawo2: '', lawo3: '', lawo4: '', afr1: '', afr2: '' },
      mem: { ok: 0 }
    })
  )
}

app.whenReady().then(async () => {
  ipcMain.removeHandler('plugin:status')
  ipcMain.handle('plugin:status', () => ({ installed: true, upToDate: true, changed: false, target: '' }))
  await wacht(2500)
  const hoofd = BrowserWindow.getAllWindows()[0]
  const dienst = (await js(hoofd, `window.career.career().then((p) => p.state?.activeDuty?.assignment?.duty)`)) ?? {
    mapFolder: 'Hamburg', mapName: 'Hamburg', lineFile: '76.ttp', tourNumber: '1', depot: '',
    legs: [{ tripFile: 'a', lineFile: '76.ttp', lineNumber: '76', terminus: 'Leer', departure: 240, arrival: 280, minutes: 40, tourNumber: '1', switchInOmsi: false, layoverBefore: 0, stops: ['Nordspitze', 'Krankenhaus', 'Leer'], stopIds: ['1', '2', '3'], stopTimes: [240, 260, 280] }],
    signOn: 230, start: 240, end: 400, durationMinutes: 160, totalStops: 3, lineNumbers: ['76'], days: 0, period: 0
  }
  const rit = dienst.legs[0]
  writeFileSync(join(live, 'schermen.json'), JSON.stringify({ bus: BUS.naam, model: BUS.model, pad: BUS.pad, bestand: '', aantal: 81, vars: TEKSTEN }))
  const klok = setInterval(() => nepPlugin(rit), 150)
  klok.unref()
  nepPlugin(rit)

  await js(hoofd, `window.career.setOverlay(${JSON.stringify(dienst)}, true)`)
  await wacht(1500)
  const stand = await js(hoofd, `window.career.apparaatStart()`)
  const url = stand.url
  await post(url + 'api/telefoon', { wat: 'aanmelden', nummer: NUMMER })
  await post(url + 'api/telefoon', { wat: 'aanmelden', nummer: NUMMER, pin: PINCODE })
  await post(url + 'api/telefoon', { wat: 'aanvaard' })
  /* De vorm bouwt pas als de getallen binnen zijn; ruim wachten. */
  await wacht(6000)

  const uit = join(WT, 'scripts/afdruk')
  mkdirSync(uit, { recursive: true })
  const plaatje = join(OMSI, 'Vehicles/HH20_EBus2021/Texture', `17_almex_s_${MENU}.jpg`)
  if (existsSync(plaatje)) copyFileSync(plaatje, join(uit, `almex21-spel-menu${MENU}.jpg`))

  for (const [naam, breed, hoog] of [['telefoon', 390, 844], ['ipad', 1194, 834]]) {
    const venster = new BrowserWindow({ width: breed, height: hoog, show: false, webPreferences: { offscreen: true } })
    let laatste
    venster.webContents.on('paint', (_e, _v, b) => (laatste = b))
    venster.webContents.setFrameRate(10)
    await venster.loadURL(url)
    await wacht(2500)
    await js(venster, `[...document.querySelectorAll('.dock-knop')].find((b) => b.getAttribute('aria-label') === 'IBIS')?.click()`)
    await wacht(4000)
    venster.webContents.invalidate()
    await wacht(900)
    const meting = await js(venster, `(() => {
      const c = document.querySelector('.apparaatscherm canvas, canvas.apparaatscherm, .apparaatscherm')
      const r = c && c.getBoundingClientRect()
      return {
        scherm: Boolean(c),
        maat: r ? Math.round(r.width) + 'x' + Math.round(r.height) : null,
        klikken: document.querySelectorAll('.apparaatscherm button, .scherm-klik').length,
        vlak: Boolean(document.querySelector('.paneel-vlak')),
        rijen: document.querySelectorAll('.paneel-rij').length
      }
    })()`)
    console.log(naam + ':', JSON.stringify(meting))
    if (laatste && !laatste.isEmpty()) writeFileSync(join(uit, `almex21-${naam}-menu${MENU}.png`), laatste.toPNG())
    venster.destroy()
  }
  app.exit(0)
})
