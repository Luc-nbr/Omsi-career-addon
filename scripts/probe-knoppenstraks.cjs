/**
 * Knoppen aan een toets hangen terwijl OMSI draait -- en komt een tik daarna aan?
 *
 *   npx electron scripts/probe-knoppenstraks.cjs
 *
 * DE MELDING
 * "display werkt, maar als ik het via mijn ipad of de overlay wil gebruiken
 * werken de knoppen niet." Het logboek liet twee dingen zien:
 * - de knop "Knoppen aan een toets hangen" werd acht keer ingedrukt terwijl OMSI
 *   draaide, en elke keer weigerde de app (keyboard.cfg schrijven mag alleen met
 *   OMSI dicht). In keyboard.cfg stond daarna geen enkele ALMEX-toets, dus deed
 *   een tik op het scherm niets;
 * - en vanaf de tablet kon een tik sowieso niet aankomen: die route keek of de
 *   naam een SLEUTEL van OMSI_TOETSEN was (kaartje, ibis7), en de telefoon stuurt
 *   de naam van de handeling (IBIS_7, almex_clickU1).
 *
 * WAT HIER NAGEBOOTST WORDT
 * - "OMSI draait": een eigen onschuldig procesje (een kopie van ping.exe onder
 *   een eigen naam). De app herkent OMSI aan de procesnaam, en die mag een proef
 *   vervangen (OMSI_ENHANCER_PROEFPROCES).
 * - De knop indrukken: het verzoek hoort bewaard te worden, keyboard.cfg blijft
 *   onaangeroerd, en de telefoon zegt "genoteerd".
 * - "OMSI sluit af": het procesje stoppen. Binnen een paar tellen horen de
 *   ALMEX-knoppen in keyboard.cfg te staan en de aanraakvlakken bruikbaar te
 *   worden.
 * - Tikken, in de overlay en vanaf de tablet: er hoort een opdracht voor de
 *   plugin te komen (opdracht.txt). En een naam die niet bij de bus hoort, hoort
 *   geweigerd te worden -- dat blijft de grens voor wie over het netwerk komt.
 *
 * NIETS IN DE SPELMAP
 * Bijschrijven gebeurt in <OMSI>\Inputs\keyboard.cfg, en een proef schrijft
 * nooit in de installatie van de gebruiker. Daarom een nagemaakte OMSI-map in
 * %TEMP%: een lege Omsi.exe (de app kijkt alleen of hij er is), een eigen KOPIE
 * van Inputs, en voor Vehicles, Fonts en Texture een junction naar de echte
 * mappen -- die worden alleen gelezen. Aan het eind worden die junctions
 * losgehaald met rmdir zonder /s: dat verwijdert de verwijzing en niet wat erachter
 * staat. Deze map wordt NOOIT recursief verwijderd; recursief door een junction
 * gaan kan de echte busmappen leegmaken.
 */
const { app, BrowserWindow, ipcMain } = require('electron')
const { execFileSync, spawn } = require('node:child_process')
const {
  copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmdirSync,
  utimesSync, writeFileSync
} = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const http = require('node:http')

const NUMMER = '123456'
const PINCODE = '9876'

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

const BUS = { naam: 'Stadtbus 2017', model: 'Model/model_17_solo.cfg', pad: 'Vehicles/HH_Stadtbus2017/', bestand: '' }
let GETALLEN = { almex_menu: 0, trans_dauer: 1 }
const VARS = { almex_s_uhrzeit: '13:45', almex_s_ziel: '  5 WEDEL', almex_s_hst1: 'ALTONA', almex_s_hst2: 'BAHRENFELD' }

/* ---- de gebruikersmap: een kopie ---- */
const map = mkdtempSync(join(tmpdir(), 'omsi-knoppen-'))
const bron = join(process.env.APPDATA, 'omsi-enhancer')
cpSync(join(bron, 'settings.json'), join(map, 'settings.json'))
cpSync(join(bron, 'profiles'), join(map, 'profiles'), { recursive: true })
const inst = JSON.parse(readFileSync(join(map, 'settings.json'), 'utf8'))

/* ---- de nagemaakte OMSI-map ---- */
const echt = [inst.omsiPath, 'C:/Program Files (x86)/Steam/steamapps/common/OMSI 2'].find(
  (pad) => pad && existsSync(join(pad, 'Omsi.exe'))
)
if (!echt) {
  console.log('geen OMSI gevonden om uit te lezen; proef overgeslagen')
  process.exit(0)
}
const nep = mkdtempSync(join(tmpdir(), 'omsi-nep-'))
writeFileSync(join(nep, 'Omsi.exe'), '')
cpSync(join(echt, 'Inputs'), join(nep, 'Inputs'), { recursive: true })
const junctions = ['Vehicles', 'Fonts', 'Texture'].map((naam) => join(nep, naam))
for (const doel of junctions) {
  const van = join(echt, doel.split(/[\\/]/).pop())
  execFileSync('cmd.exe', ['/c', 'mklink', '/J', doel, van], { stdio: 'ignore' })
}
function haalJunctionsLos() {
  for (const doel of junctions) {
    try {
      rmdirSync(doel) // NIET recursief: alleen de verwijzing gaat weg
    } catch {
      // Al weg.
    }
  }
}
const keyboard = join(nep, 'Inputs', 'keyboard.cfg')
const almexIn = () => (readFileSync(keyboard, 'utf8').match(/almex/gi) ?? []).length
/*
 * In de KOPIE de knoppen van de ALMEX en de geldlade weghalen: heeft de speler
 * de HH20 al klaargemaakt, dan stonden ze er al en valt er niets na te lopen.
 * Een [entry] is "[entry]", de actie, de scancode en de modifiers.
 */
{
  const tekst = readFileSync(keyboard, 'latin1')
  const nl = tekst.includes('\r\n') ? '\r\n' : '\n'
  const blokken = tekst.split(`${nl}[entry]${nl}`)
  const over = blokken.filter((blok, i) => i === 0 || !/^(almex_|cashdesk_)/i.test(blok))
  writeFileSync(keyboard, over.join(`${nl}[entry]${nl}`), 'latin1')
}

inst.tourSeen = true
inst.omsiPath = nep
inst.omsiConfirmed = true
delete inst.busmodules
delete inst.busknoppenStraks
delete inst.apparaatSleutel
delete inst.apparaatPoort
/*
 * Er staat al iets klaar van een ANDERE bus -- zoals bij de speler op 26-09: de
 * Kajosoft, genoteerd terwijl OMSI draaide. Dat mocht de knop bij de volgende
 * bus niet wegnemen, en deed het wel: de telefoon telde de hele wachtrij.
 */
const andereBus = join(nep, 'Vehicles', 'Citybus 628c 628g LF by Kajosoft', 'model', 'model_Conecto_LF_e5.cfg')
const metAndereBus = existsSync(andereBus)
if (metAndereBus) inst.busknoppenStraks = { [andereBus]: ['tablet_reset_toggle'] }
writeFileSync(join(map, 'settings.json'), JSON.stringify(inst, null, 2))
/* De wachtrij staat per bus (de model.cfg); hier telt alleen wat erin staat. */
const straks = () => Object.values(JSON.parse(readFileSync(join(map, 'settings.json'), 'utf8')).busknoppenStraks ?? {}).flat()
for (const naam of readdirSync(join(map, 'profiles')).filter((n) => n.endsWith('.json') && n !== 'active.json')) {
  const pad = join(map, 'profiles', naam)
  const p = JSON.parse(readFileSync(pad, 'utf8'))
  p.personeelsnummer = NUMMER
  p.pincode = PINCODE
  writeFileSync(pad, JSON.stringify(p, null, 2))
}

/* ---- "OMSI draait": een eigen procesje met een eigen naam ---- */
const nepExe = join(nep, 'OmsiNepProef.exe')
copyFileSync(join(process.env.SystemRoot || 'C:/Windows', 'System32', 'PING.EXE'), nepExe)
let nepOmsi = spawn(nepExe, ['-n', '900', '127.0.0.1'], { stdio: 'ignore', windowsHide: true })

const live = join(mkdtempSync(join(tmpdir(), 'omsi-knoppen-live-')), 'OMSI Career')
mkdirSync(live, { recursive: true })
process.env.OMSI_ENHANCER_LIVEMAP = live
process.env.OMSI_ENHANCER_APPARAAT_HOST = '127.0.0.1'
process.env.OMSI_ENHANCER_PROEFPROCES = 'OmsiNepProef'
app.setPath('userData', map)

function stop(code) {
  try {
    nepOmsi?.kill()
  } catch {
    // Al weg.
  }
  haalJunctionsLos()
  app.exit(code)
}
setTimeout(() => {
  console.log('time-out')
  stop(1)
}, 180000).unref()
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
  const dienst = {
    mapFolder: 'Hamburg', mapName: 'Hamburg', lineFile: '5.ttp', tourNumber: '3', depot: '',
    legs: [{
      tripFile: 'a', lineFile: '5.ttp', lineNumber: '5', terminus: 'Wedel', departure: 480,
      arrival: 520, minutes: 40, tourNumber: '3', switchInOmsi: false, layoverBefore: 0,
      stops: ['Altona', 'Bahrenfeld', 'Wedel'], stopIds: ['1', '2', '3'], stopTimes: [480, 500, 520]
    }],
    signOn: 470, start: 480, end: 640, durationMinutes: 160, totalStops: 3,
    lineNumbers: ['5'], days: 0, period: 0
  }
  const schrijfLive = () => writeFileSync(join(live, 'live.json'), JSON.stringify({
    alive: true, seen: 8388607, seenSys: 63, seenStr: 63, strKind: 1, plugin: 13,
    time: 49500, day: 1, month: 7, year: 2026, velocity: 0, passengers: 6,
    scheduleActive: 1, targetIndex: 0, tankPercent: 0.7, km: 0, metres: 0,
    busstopIndex: 2, busstop: 'Wedel', line: '5', terminus: 'Wedel',
    matrix: '', delayMin: '', delaySec: '', entryRequest: 0, exitRequest: 0, ticket: -1,
    entryOpen: 0, exitOpen: 0, atStation: 0, brightness: 0.5, streetCond: 0, precipRate: 0,
    precipType: 0, lightsLow: 1, blinkerLeft: 0, blinkerRight: 0, brakeLight: 0, engineOn: 1,
    maxBrake: 0, maxAccel: 0, topSpeed: 0, harshBrakes: 0, harshAccels: 0, battery: 0,
    temperature: 0, collisions: 0, collisionEnergy: 0, worstCollision: 0, exeVersion: '2.3.004',
    bus: BUS, vars: VARS, getallen: GETALLEN, getalAantal: Object.keys(GETALLEN).length,
    ibis: { bestemming: '', lijn: '', lawo1: '', lawo2: '', lawo3: '', lawo4: '', afr1: '', afr2: '' },
    mem: { ok: 0 }
  }))
  schrijfLive()
  writeFileSync(join(live, 'schermen.json'), JSON.stringify({
    bus: BUS.naam, model: BUS.model, pad: BUS.pad, bestand: '', aantal: Object.keys(VARS).length, vars: VARS
  }))
  setInterval(() => { const nu = new Date(); utimesSync(join(live, 'live.json'), nu, nu) }, 2000).unref()

  await js(hoofd, `window.career.setOverlay(${JSON.stringify(dienst)}, true)`)
  await wacht(1500)
  const stand = await js(hoofd, `window.career.apparaatStart()`)
  await post(stand.url + 'api/telefoon', { wat: 'aanmelden', nummer: NUMMER })
  await post(stand.url + 'api/telefoon', { wat: 'aanmelden', nummer: NUMMER, pin: PINCODE })
  await post(stand.url + 'api/telefoon', { wat: 'aanvaard' })
  await wacht(1200)
  const overlay = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('overlay'))
  if (!overlay) {
    console.log('geen overlay')
    stop(1)
    return
  }
  await js(overlay, `[...document.querySelectorAll('.dock-knop')].find((b) => b.getAttribute('aria-label') === 'IBIS')?.click()`)
  await wacht(800)
  await js(overlay, `document.querySelector('.module-knop')?.click()`)
  await wacht(400)
  await js(overlay, `[...document.querySelectorAll('.module-lijst button')].find((b) => (b.querySelector('b')?.textContent ?? '').includes('ALMEX'))?.click()`)

  /* Zoals de plugin: elk gevraagd getal beantwoorden, met de ALMEX aan. */
  let gevraagd = []
  for (let i = 0; i < 40 && gevraagd.length === 0; i++) {
    await wacht(150)
    try {
      gevraagd = readFileSync(join(live, 'getallen.txt'), 'utf8').split(/\r?\n/).filter(Boolean)
    } catch {
      // Nog niet geschreven.
    }
  }
  GETALLEN = { ...Object.fromEntries(gevraagd.map((n) => [n, 0])), almex_ein: 1, almex_riegel: 1, trans_dauer: 1, almex_menu: 0 }
  schrijfLive()
  await wacht(300)
  await js(overlay, `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Klaar' || b.textContent.trim() === 'Done')?.click()`)

  const kijk = () => js(overlay, `({
    beeld: document.querySelector('.apparaatscherm')?.dataset.beeld,
    klikken: document.querySelectorAll('.scherm-klik').length,
    uit: document.querySelectorAll('.scherm-klik:disabled').length,
    melding: document.querySelector('.afr-aanzetten')?.textContent ?? '',
    zonderToets: document.querySelector('.afr-aanzetten')?.dataset.zonderToets ?? '',
    knop: Boolean(document.querySelector('.afr-aanzetten button'))
  })`)
  let voor = await kijk()
  for (let i = 0; i < 40 && voor.beeld !== 'ja'; i++) {
    await wacht(250)
    voor = await kijk()
  }
  const keyboardVoor = readFileSync(keyboard, 'utf8')
  console.log('voor:', JSON.stringify({ ...voor, melding: voor.melding.slice(0, 60) }), `almex in keyboard.cfg: ${almexIn()}`, `andere bus in de wachtrij: ${metAndereBus}`)

  /* ---- 1. De knop indrukken terwijl "OMSI" draait ---- */
  await js(overlay, `document.querySelector('.afr-aanzetten button')?.click()`)
  let bewaard = []
  for (let i = 0; i < 30 && !bewaard.some((a) => /almex/i.test(a)); i++) {
    await wacht(300)
    bewaard = straks()
  }
  await wacht(6000) // de telefoon kijkt eens per vijf tellen naar de knoppen
  const genoteerd = await kijk()
  const onaangeroerd = readFileSync(keyboard, 'utf8') === keyboardVoor
  console.log(
    'OMSI open, knop ingedrukt:',
    JSON.stringify({ bewaard: bewaard.length, voorbeeld: bewaard.filter((a) => /almex/i.test(a)).slice(0, 3), keyboardOnaangeroerd: onaangeroerd, knopNogErOnder: genoteerd.knop }),
  )
  console.log('  melding:', genoteerd.melding.slice(0, 110))

  /* ---- 2. "OMSI sluit af" ---- */
  nepOmsi.kill()
  nepOmsi = undefined
  let klaar = false
  for (let i = 0; i < 40 && !klaar; i++) {
    await wacht(1000)
    klaar = straks().length === 0 && almexIn() > 0
  }
  await wacht(6000)
  const na = await kijk()
  /*
   * Welke knoppen kregen geen toets? Er zijn er maar 87, en er staan er van
   * eerder al een paar tientallen. Wat overblijft hoort het minst belangrijke te
   * zijn: de losse knoppen, niet het scherm.
   */
  const kbNa = readFileSync(keyboard, 'utf8').toLowerCase()
  const zonderToets = bewaard.filter((actie) => !kbNa.includes(actie.toLowerCase()))
  console.log('zonder vrije toets:', JSON.stringify(zonderToets))
  console.log('OMSI dicht:', JSON.stringify({ wachtrijLeeg: straks().length === 0, almexInKeyboard: almexIn(), aanraakvlakken: na.klikken, nogUit: na.uit, melding: na.melding.slice(0, 40), telefoonZietZonderToets: na.zonderToets }))

  /* ---- 3. Tikken ---- */
  const opdracht = () => {
    try {
      return readFileSync(join(live, 'opdracht.txt'), 'utf8').trim()
    } catch {
      return ''
    }
  }
  const eersteKlik = await js(overlay, `document.querySelector('.scherm-klik:not(:disabled)')?.dataset.actie ?? ''`)
  await js(overlay, `document.querySelector('.scherm-klik:not(:disabled)')?.click()`)
  await wacht(600)
  const naOverlay = opdracht()
  console.log(`tik in de overlay op ${eersteKlik}: opdracht.txt = "${naOverlay}"`)

  const tabletAntwoord = await post(stand.url + 'api/telefoon', { wat: 'toets', toets: 'almex_clickU2' })
  await wacht(300)
  const naTablet = opdracht()
  console.log(`tik vanaf de tablet op almex_clickU2: antwoord ${tabletAntwoord}, opdracht.txt = "${naTablet}"`)

  const vreemd = await post(stand.url + 'api/telefoon', { wat: 'toets', toets: 'format_c' })
  console.log(`een naam die niet bij de bus hoort: antwoord ${vreemd}`)

  const goed =
    voor.beeld === 'ja' &&
    voor.uit > 0 &&
    /* Wat er van een andere bus klaarstaat, zegt niets over deze. */
    voor.knop &&
    !/genoteerd|noted|notiert|noté/i.test(voor.melding) &&
    bewaard.some((a) => /almex_click/i.test(a)) &&
    onaangeroerd &&
    !genoteerd.knop &&
    /genoteerd|noted|notiert|noté/i.test(genoteerd.melding) &&
    straks().length === 0 &&
    almexIn() > 0 &&
    na.klikken > 0 &&
    na.uit === 0 &&
    /* Geen knop van het scherm zonder toets meer, en dus ook geen melding. */
    na.zonderToets === '' &&
    !na.melding &&
    /^\d+ \d+ \d+$/.test(naOverlay) &&
    /"ok":true/.test(tabletAntwoord) &&
    naTablet !== naOverlay &&
    /"ok":false/.test(vreemd)
  console.log(goed ? 'onthouden, bijgeschreven, en de tik komt aan' : 'DE KNOPPEN WERKEN NOG NIET')
  stop(goed ? 0 : 1)
})
