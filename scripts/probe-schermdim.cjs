/**
 * Het scherm van de Faremaster in de O560: het plaatje dat het script kiest,
 * en de dimlaag erover, in de echte overlay.
 *
 *   npx electron scripts/probe-schermdim.cjs [uitvoermap]
 *
 * Luc, 27-09: "Probleempje met het schermpje in de coach o560, dit scherm komt
 * niet goed terug in de overlay" -- in het spel een turquoise touchscreen met
 * een wit meldingsvak, in de overlay alleen de klok op zwart. Het scherm heeft
 * geen vast plaatje: het busscript zet de bestandsnaam in
 * Faremaster_Maintexture ([matl_freetex]). Daarover ligt SU_II_dummy.dds, een
 * zwart vlak met [alphascale] Faremaster_Dim: 's nachts dimt het, overdag is
 * de waarde 0 en is het er niet. De app kende [alphascale] niet en tekende
 * het vlak altijd dekkend.
 *
 * Nagelopen, met een eigen live.json zoals de plugin hem schrijft:
 * - Dim 0: het plaatje van het script staat er (veel kleuren, licht);
 * - Dim 0,6: hetzelfde plaatje, maar donkerder -- niet zwart;
 * - Dim 1: nagenoeg zwart, zoals OMSI het tekent.
 * Leest de OMSI-map alleen; er wordt geen dienst gestart.
 */
const { app, BrowserWindow, ipcMain } = require('electron')
const { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, utimesSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

const uitvoer = process.argv.slice(2).find((a) => !a.startsWith('-') && !a.endsWith('.cjs'))
if (uitvoer) mkdirSync(uitvoer, { recursive: true })

/* De coach en zijn Faremaster, zoals de plugin ze doorgeeft. */
const BUS = { naam: 'Euro VI M - Automatic', model: 'Model/O560_E6_M.cfg', pad: 'Vehicles/ABCoach_O560/', bestand: '' }
const VARS = {
  Faremaster_Maintexture: 'Faremaster\\Main.dds',
  Faremaster_Header: ' --:--',
  Faremaster_Keypad_V: '',
  Faremaster_Stop1: '',
  Faremaster_terminus_name: ''
}
let GETALLEN = {}

const map = mkdtempSync(join(tmpdir(), 'omsi-schermdim-'))
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
  delete p.activeDuty
  p.personeelsnummer = '123456'
  p.pincode = '9876'
  writeFileSync(pad, JSON.stringify(p, null, 2))
}
const live = join(mkdtempSync(join(tmpdir(), 'omsi-schermdim-live-')), 'OMSI Career')
mkdirSync(live, { recursive: true })
process.env.OMSI_ENHANCER_LIVEMAP = live
process.env.OMSI_ENHANCER_APPARAAT_HOST = '127.0.0.1'
process.env.OMSI_ENHANCER_PROEFPROCES = 'GeenOmsiProef'
app.setPath('userData', map)
setTimeout(() => {
  console.log('time-out')
  app.exit(1)
}, 150000).unref()
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

const schrijfLive = () =>
  writeFileSync(
    join(live, 'live.json'),
    JSON.stringify({
      alive: true, seen: 8388607, seenSys: 63, seenStr: 63, strKind: 1, plugin: 13,
      time: 39600, day: 1, month: 7, year: 2026, velocity: 0, passengers: 0,
      scheduleActive: 0, targetIndex: 0, tankPercent: 0.7, km: 0, metres: 0,
      busstopIndex: 0, busstop: '', line: '', terminus: '',
      matrix: '', delayMin: '', delaySec: '', entryRequest: 0, exitRequest: 0, ticket: -1,
      entryOpen: 0, exitOpen: 0, atStation: 0, brightness: 0.5, streetCond: 0, precipRate: 0,
      precipType: 0, lightsLow: 1, blinkerLeft: 0, blinkerRight: 0, brakeLight: 0, engineOn: 1,
      maxBrake: 0, maxAccel: 0, topSpeed: 0, harshBrakes: 0, harshAccels: 0,
      collisions: 0, collisionEnergy: 0, worstCollision: 0, exeVersion: '2.3.004',
      bus: BUS, vars: VARS, getallen: GETALLEN, getalAantal: Object.keys(GETALLEN).length,
      ibis: { bestemming: '', lijn: '', lawo1: '', lawo2: '', lawo3: '', lawo4: '', afr1: '', afr2: '' },
      mem: { ok: 0 }
    })
  )

app.whenReady().then(async () => {
  ipcMain.removeHandler('plugin:status')
  ipcMain.handle('plugin:status', () => ({ installed: true, upToDate: true, changed: false, target: '' }))
  await wacht(2500)
  const hoofd = BrowserWindow.getAllWindows()[0]
  schrijfLive()
  writeFileSync(join(live, 'schermen.json'), JSON.stringify({ bus: BUS.naam, model: BUS.model, pad: BUS.pad, bestand: '', aantal: Object.keys(VARS).length, vars: VARS }))
  setInterval(() => {
    const nu = new Date()
    try {
      utimesSync(join(live, 'live.json'), nu, nu)
    } catch {
      // Tussen twee keer schrijven.
    }
  }, 2000).unref()

  /* Een dienst om de overlay mee te openen; welke doet er hier niet toe. */
  const dienst = {
    mapFolder: 'Krefrath', mapName: 'Krefrath', lineFile: 'x', tourNumber: '1', depot: '',
    legs: [{ tripFile: 'a', lineFile: 'x', lineNumber: '1', terminus: 'A', departure: 600, arrival: 620, minutes: 20, tourNumber: '1', layoverBefore: 0, stops: ['A', 'B'], stopIds: ['1', '2'], stopTimes: [600, 620] }],
    signOn: 590, start: 600, end: 620, durationMinutes: 20, totalStops: 2, lineNumbers: ['1'], days: 0, period: 0
  }
  await js(hoofd, `window.career.setOverlay(${JSON.stringify(dienst)}, true)`)
  let overlay
  for (let i = 0; i < 40 && !overlay; i++) {
    await wacht(250)
    overlay = BrowserWindow.getAllWindows().find((w) => w !== hoofd && /overlay/.test(w.webContents.getURL()))
  }
  await wacht(2500)
  /* Aanmelden en tekenen, anders staat het cijferblok ervoor. */
  await js(hoofd, `window.career.telefoonAanmelden('123456', '9876')`)
  await js(hoofd, `window.career.telefoonAanvaard()`).catch(() => undefined)
  await wacht(800)
  const meldingen = []
  overlay.webContents.on('console-message', (_e, niveau, tekst) => {
    if (niveau >= 2) meldingen.push(tekst)
  })
  await js(overlay, `[...document.querySelectorAll('.dock-knop')].find((b) => b.getAttribute('aria-label') === 'IBIS')?.click()`)
  await wacht(800)
  await js(overlay, `document.querySelector('.module-knop')?.click()`)
  await wacht(500)
  const lijst = await js(overlay, `[...document.querySelectorAll('.module-lijst button')].map((b) => b.querySelector('b')?.textContent ?? '')`)
  await js(overlay, `[...document.querySelectorAll('.module-lijst button')].find((b) => /O560/.test(b.querySelector('b')?.textContent ?? ''))?.click()`)
  console.log('apparaten in de lijst:', lijst.join(', '))

  /* Doen wat de plugin doet: alle gevraagde getallen beantwoorden. */
  let gevraagd = []
  for (let i = 0; i < 40 && !gevraagd.includes('Faremaster_Dim'); i++) {
    await wacht(200)
    try {
      gevraagd = readFileSync(join(live, 'getallen.txt'), 'utf8').split(/\r?\n/).filter(Boolean)
    } catch {
      // Nog niet geschreven.
    }
  }
  console.log(`de app vraagt ${gevraagd.length} getallen; Faremaster_Dim erbij: ${gevraagd.includes('Faremaster_Dim')}`)
  const zet = (dim) => {
    GETALLEN = { ...Object.fromEntries(gevraagd.map((naam) => [naam, 0])), CTI_RBL: 1, Faremaster_Dim: dim }
    schrijfLive()
  }
  zet(0)
  await wacht(300)
  await js(overlay, `[...document.querySelectorAll('button')].find((b) => /^(Klaar|Done)$/.test(b.textContent.trim()))?.click()`)

  /* Hoe licht en hoe bont het scherm is. */
  const meet = () =>
    js(overlay, `(() => {
      const doek = document.querySelector('.apparaatscherm canvas')
      if (!doek || doek.width === 0) return { beeld: document.querySelector('.apparaatscherm')?.dataset.beeld, licht: 0, kleuren: 0 }
      const d = doek.getContext('2d').getImageData(0, 0, doek.width, doek.height).data
      let som = 0, n = 0
      const gezien = new Set()
      for (let i = 0; i < d.length; i += 4 * 13) {
        som += d[i] + d[i + 1] + d[i + 2]
        n++
        gezien.add((d[i] >> 3) << 10 | (d[i + 1] >> 3) << 5 | (d[i + 2] >> 3))
      }
      return { beeld: document.querySelector('.apparaatscherm')?.dataset.beeld, licht: Math.round(som / n / 3), kleuren: gezien.size }
    })()`)
  let dag = await meet()
  for (let i = 0; i < 60 && (dag.beeld !== 'ja' || dag.kleuren < 30); i++) {
    await wacht(250)
    dag = await meet()
  }
  console.log('Dim 0:', JSON.stringify(dag))
  if (uitvoer) {
    overlay.showInactive = BrowserWindow.prototype.showInactive
    overlay.showInactive()
    await wacht(800)
    writeFileSync(join(uitvoer, 'o560-dim0.png'), (await overlay.webContents.capturePage()).toPNG())
  }

  zet(0.6)
  await wacht(2500)
  const schemer = await meet()
  console.log('Dim 0,6:', JSON.stringify(schemer))
  if (uitvoer) writeFileSync(join(uitvoer, 'o560-dim06.png'), (await overlay.webContents.capturePage()).toPNG())

  zet(1)
  await wacht(2500)
  const nacht = await meet()
  console.log('Dim 1:', JSON.stringify(nacht))

  const fouten = meldingen.filter((m) => !/Electron Security Warning|willReadFrequently/.test(m))
  console.log('meldingen:', fouten.length ? fouten.map((m) => m.slice(0, 140)) : 'geen')
  const goed =
    gevraagd.includes('Faremaster_Dim') &&
    dag.beeld === 'ja' &&
    dag.kleuren > 50 &&
    dag.licht > 60 &&
    schemer.licht < dag.licht * 0.7 &&
    schemer.licht > dag.licht * 0.2 &&
    nacht.licht < dag.licht * 0.15 &&
    fouten.length === 0
  console.log(goed ? 'het scherm van de O560 staat er, en dimt zoals in het spel' : 'HET SCHERM VAN DE O560 KLOPT NIET')
  app.exit(goed ? 0 : 1)
})
