/**
 * De IBIS op de telefoon: de spiegel van het schermpje, en zijn toetsen.
 *
 *   npx electron scripts/probe-ibis.cjs
 *
 * Wat er nagerekend wordt:
 * - zolang de deuren dicht zijn staat de telefoon op de kaart;
 * - gaat er een deur open, dan springt hij naar de kaartverkoop;
 * - het kaartje dat in de bus gekozen is (`GivenTicket`) staat er al, met zijn
 *   prijs, en de app zegt erbij waar die keuze vandaan komt;
 * - tik aan waarmee de passagier betaalt en het wisselgeld staat er meteen,
 *   uitgesplitst in munten.
 *
 * Er wordt niets van de gebruiker aangeraakt: een kopie van de gebruikersmap,
 * een eigen live.json, en de server alleen op 127.0.0.1. OMSI blijft erbuiten.
 */
const { app, BrowserWindow, ipcMain } = require('electron')
const { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, utimesSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const http = require('node:http')

const map = mkdtempSync(join(tmpdir(), 'omsi-kaartjes-'))
const bron = join(process.env.APPDATA, 'omsi-enhancer')
cpSync(join(bron, 'settings.json'), join(map, 'settings.json'))
cpSync(join(bron, 'profiles'), join(map, 'profiles'), { recursive: true })
const inst = JSON.parse(readFileSync(join(map, 'settings.json'), 'utf8'))
inst.tourSeen = true
delete inst.apparaatSleutel
delete inst.apparaatPoort
writeFileSync(join(map, 'settings.json'), JSON.stringify(inst, null, 2))
for (const naam of readdirSync(join(map, 'profiles')).filter((n) => n.endsWith('.json') && n !== 'active.json')) {
  const pad = join(map, 'profiles', naam)
  const p = JSON.parse(readFileSync(pad, 'utf8'))
  p.personeelsnummer = '123456'
  p.pincode = '9876'
  writeFileSync(pad, JSON.stringify(p, null, 2))
}
const live = join(mkdtempSync(join(tmpdir(), 'omsi-kaartjes-live-')), 'OMSI Career')
mkdirSync(live, { recursive: true })
process.env.OMSI_ENHANCER_LIVEMAP = live
process.env.OMSI_ENHANCER_APPARAAT_HOST = '127.0.0.1'
process.env.OMSI_ENHANCER_PROEFPROCES = 'GeenOmsiProef'
app.setPath('userData', map)
setTimeout(() => app.exit(1), 120000).unref()
require('../out/main/index.js')
const wacht = (ms) => new Promise((r) => setTimeout(r, ms))
const js = (w, code) => w.webContents.executeJavaScript(code)
app.on('browser-window-created', (_e, w) => { w.show = () => {}; w.showInactive = () => {}; w.hide() })

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

app.whenReady().then(async () => {
  ipcMain.removeHandler('plugin:status')
  ipcMain.handle('plugin:status', () => ({ installed: true, upToDate: true, changed: false, target: '' }))
  await wacht(2500)
  const hoofd = BrowserWindow.getAllWindows()[0]
  const dienst = await js(hoofd, `window.career.career().then((p) => p.state?.activeDuty?.assignment?.duty)`)
  const rit = dienst.legs[0]
  const beeld = (deur, ticket, verkoop, ibis, extra) => ({
    alive: true, seen: 8388607, seenSys: 63, seenStr: 63, strKind: 1,
    time: 43200, day: 1, month: 7, year: 2026, velocity: deur ? 0 : 11.1, passengers: 4,
    scheduleActive: 1, targetIndex: 0, tankPercent: 0.7, km: 0, metres: 0,
    busstopIndex: 2, busstop: rit.stops[2] ?? '', line: rit.lineNumber, terminus: rit.terminus,
    matrix: '', delayMin: '', delaySec: '',
    entryRequest: deur ? 1 : 0, exitRequest: 0, ticket, entryOpen: deur ? 1 : 0, exitOpen: 0, atStation: deur ? 1 : 0,
    brightness: 0.5, streetCond: 0, precipRate: 0, precipType: 0, lightsLow: 1,
    blinkerLeft: 0, blinkerRight: 0, brakeLight: 0, engineOn: 1, maxBrake: 0, maxAccel: 0,
    topSpeed: 0, harshBrakes: 0, harshAccels: 0, battery: 0, temperature: 0,
    collisions: 0, collisionEnergy: 0, worstCollision: 0, exeVersion: '2.3.004',
    /*
     * Het geheugenblok van de plugin. Met een verkoop erin doet de app alsof er
     * iemand aan de deur staat te betalen; `ok: 1` hoort daarbij, anders leest
     * de app het blok niet.
     */
    mem: verkoop
      ? {
          ok: 1, tile: 4, x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1,
          schedActive: 0, line: 0, tour: 0, tourEntry: 0, trip: 0, nextIndex: -1,
          nextDist: 1000000, delay: 0, lineName: '', tourName: '', tripName: '', nextStop: '',
          koper: 7, ticketSoort: 0, ticketIndex: verkoop.kaartje,
          ticketPrijs: verkoop.prijs, ticketGegeven: verkoop.gegeven,
          ticketSlecht: 0, ticketKlaar: 0
        }
      : { ok: 0 },
    ibis: ibis ?? { bestemming: '', lijn: '', lawo1: '', lawo2: '', lawo3: '', lawo4: '' },
    plugin: 6,
    ...(extra ?? {})
  })
  const schrijf = (deur, ticket, verkoop, ibis, extra) =>
    writeFileSync(join(live, 'live.json'), JSON.stringify(beeld(deur, ticket, verkoop, ibis, extra)))
  schrijf(false, -1)
  setInterval(() => { const nu = new Date(); utimesSync(join(live, 'live.json'), nu, nu) }, 2000).unref()

  await js(hoofd, `window.career.setOverlay(${JSON.stringify(dienst)}, true)`)
  await wacht(1200)
  const stand = await js(hoofd, `window.career.apparaatStart()`)
  const url = stand.url
  await post(url + 'api/telefoon', { wat: 'aanmelden', nummer: '123456' })
  await post(url + 'api/telefoon', { wat: 'aanmelden', nummer: '123456', pin: '9876' })
  await post(url + 'api/telefoon', { wat: 'aanvaard' })
  await wacht(1200)

  const overlay = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('overlay'))
  await wacht(1200)

  /* Eerst zonder schermgegevens: dan tekent de app zijn eigen scherm. */
  await js(overlay, `[...document.querySelectorAll('.dock-knop')].find((b) => b.getAttribute('aria-label') === 'IBIS')?.click()`)
  await wacht(800)
  const eigen = await js(overlay, `({
    apps: document.querySelectorAll('.dock-knop').length,
    eigen: Boolean(document.querySelector('.ibis-scherm.eigen')),
    spiegel: Boolean(document.querySelector('.ibis-scherm.spiegel')),
    lijn: document.querySelector('.ibis-kop b')?.textContent ?? null,
    regels: [...document.querySelectorAll('.ibis-regel span')].map((e) => e.textContent),
    toetsen: document.querySelectorAll('.ibis-toetsen .ibis-knop').length,
    standen: document.querySelectorAll('.ibis-standen .ibis-knop').length
  })`)
  console.log('zonder schermgegevens:', JSON.stringify(eigen))

  /* En met: dan staat er letterlijk wat de bus doorgeeft. */
  schrijf(false, -1, undefined, {
    bestemming: 'Lichtentanne', lijn: '732/9',
    lawo1: '732 LICHTENTANNE', lawo2: 'L/K/R: 732/9/9', lawo3: '', lawo4: ''
  })
  await wacht(1800)
  const spiegel = await js(overlay, `({
    spiegel: Boolean(document.querySelector('.ibis-scherm.spiegel')),
    regels: [...document.querySelectorAll('.ibis-scherm.spiegel span')].map((e) => e.textContent)
  })`)
  console.log('met schermgegevens uit de bus:', JSON.stringify(spiegel))

  /*
   * En dan de bus zelf. De plugin zegt welke bus er rijdt; de app zoekt de
   * model.cfg op, leest daar de `[texttexture]`-blokken uit en vraagt precies
   * die variabelen op. Hier staat een echte bus uit de installatie, met de
   * waarden die de plugin uit het geheugen zou halen.
   */
  schrijf(false, -1, undefined, undefined, {
    bus: {
      naam: 'Setra S315 UL Euro 3',
      model: 'Model/S315UL_Euro3.cfg',
      pad: 'Vehicles/TH_Ueberlandbus/',
      bestand: ''
    },
    vars: {
      afr_display_1: 'Linie 320    Kurs 1',
      afr_display_2: '13:45      EUR 2,40',
      LAWO_display_line1: '320 OBERHOF',
      LAWO_display_line2: 'ueber Zella-Mehlis',
      afr_ticketname_0: 'Einzelfahrt',
      afr_ticketname_1: 'Kind'
    }
  })
  await wacht(1800)
  const uitDeBus = await js(overlay, `(() => {
    const vakken = [...document.querySelectorAll('.ibis-apparaat')]
    const stijl = (e) => e ? getComputedStyle(e) : undefined
    return {
      apparaten: vakken.length,
      eerste: vakken[0] ? [...vakken[0].querySelectorAll('span')].map((s) => s.textContent) : [],
      kleuren: vakken.slice(0, 2).map((v) => stijl(v).color + ' op ' + stijl(v).backgroundColor)
    }
  })()`)
  console.log('uit de bus zelf:', JSON.stringify(uitDeBus))

  const gevraagd = (() => {
    try {
      return readFileSync(join(live, 'vragen.txt'), 'utf8').split(/\r?\n/).filter(Boolean)
    } catch {
      return []
    }
  })()
  console.log('gevraagd aan de plugin:', gevraagd.length, 'variabelen, waaronder',
    JSON.stringify(gevraagd.slice(0, 4)))

  /* Een toets: die hoort als opdracht voor de plugin weggeschreven te worden. */
  await js(overlay, `[...document.querySelectorAll('.ibis-toetsen .ibis-knop')][0]?.click()`)
  await wacht(600)
  const opdracht = readFileSync(join(live, 'opdracht.txt'), 'utf8').trim()
  console.log('opdracht voor de plugin:', JSON.stringify(opdracht))

  const goed =
    eigen.apps === 7 &&
    eigen.eigen &&
    !eigen.spiegel &&
    eigen.toetsen === 12 &&
    eigen.standen === 3 &&
    spiegel.spiegel &&
    spiegel.regels[0] === '732 LICHTENTANNE' &&
    /* De bus levert minstens de LAWO en de AFR, met hun eigen kleuren. */
    uitDeBus.apparaten >= 2 &&
    uitDeBus.eerste[0] === '320 OBERHOF' &&
    uitDeBus.kleuren.some((k) => k.includes('rgb(95, 211, 188)')) &&
    gevraagd.includes('afr_display_1') &&
    gevraagd.includes('afr_ticketname_0') &&
    /^\d+ 79 4$/.test(opdracht)
  console.log(goed ? 'de IBIS klopt' : 'DE IBIS KLOPT NIET')
  app.exit(goed ? 0 : 1)
})
