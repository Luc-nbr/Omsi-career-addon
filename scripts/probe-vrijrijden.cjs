/**
 * Vrij rijden: zelf een dienst samenstellen, en een overlay die meegaat als je
 * in OMSI een andere omloop kiest.
 *
 *   npx electron scripts/probe-vrijrijden.cjs [uitvoermap]
 *
 * Luc: "In die modus moeten spelers zelf een dienst kunnen samenstellen. Ze
 * kiezen een map, daarna kiezen de lijnen die ze willen rijden, daarna volgt de
 * gebruikelijke setup. Wat erbij moet komen is dat de overlay ook tijdens het
 * rijden andere omlopen accepteert."
 *
 * Nagelopen in de echte app, met echte klikken:
 * - Vrij rijden -> Rheinhausen -> twee lijnen aanvinken (vinkjes, geen bolletjes);
 * - de dienststap heeft diensten, een weerkeuze, en elke dienst rijdt alleen
 *   over de aangevinkte lijnen;
 * - START terwijl "OMSI" draait -> Meerijden: de dienst staat in het profiel als
 *   vrije dienst en er wordt niets in de spelmap geschreven;
 * - OMSI zegt dat de voorgestelde omloop gekozen is: er verandert niets;
 * - OMSI zegt dat er een ANDERE omloop gekozen is: de dienst in het profiel, in
 *   de overlay en op het rijscherm wordt die omloop, vanaf de gekozen rit, met
 *   IBIS-codes -- en de aanmelding blijft staan;
 * - afronden boekt niets in het logboek.
 *
 * "OMSI draait" is een eigen procesje met een eigen naam (zie
 * probe-knoppenstraks.cjs), en de plugin is een live.json die deze proef zelf
 * schrijft. De OMSI-map wordt alleen gelezen; meerijden schrijft er niets in.
 *
 * VANGRAILS. De eerste versie van deze proef, 27-09, heeft het echte OMSI
 * gestart en een situatie in de spelmap gezet: de app zocht bij "draait OMSI?"
 * op de busstap nog vast naar Omsi.exe in plaats van naar het procesje van de
 * proef, vroeg dus niet "meerijden?", en zette klaar. Dat is in de app
 * rechtgezet (OMSI_PROCES in main/index.ts), maar een proef die de echte
 * spelmap leest mag daar nooit op hoeven vertrouwen. Daarom weigert dit script,
 * voordat de app geladen wordt, elke schrijfactie onder de spelmap en elk
 * programma dat Omsi.exe start -- en drukt het pas op START als de app zelf zegt
 * dat "OMSI" draait.
 */
const { app, BrowserWindow, ipcMain } = require('electron')
const { spawn } = require('node:child_process')
const { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, utimesSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

const uitvoer = process.argv.slice(2).find((a) => !a.startsWith('-') && !a.endsWith('.cjs'))
if (uitvoer) mkdirSync(uitvoer, { recursive: true })
const KAART = 'Rheinhausen'
const NUMMER = '123456'
const PINCODE = '9876'

/* ---- de gebruikersmap: een kopie, zonder openstaande dienst ---- */
const map = mkdtempSync(join(tmpdir(), 'omsi-vrij-'))
const bron = join(process.env.APPDATA, 'omsi-enhancer')
cpSync(join(bron, 'settings.json'), join(map, 'settings.json'))
cpSync(join(bron, 'profiles'), join(map, 'profiles'), { recursive: true })
/* De kaartcache mee, anders leest de app eerst alle kaarten opnieuw in. */
if (existsSync(join(bron, 'kaartcache'))) cpSync(join(bron, 'kaartcache'), join(map, 'kaartcache'), { recursive: true })
const inst = JSON.parse(readFileSync(join(map, 'settings.json'), 'utf8'))
inst.tourSeen = true
writeFileSync(join(map, 'settings.json'), JSON.stringify(inst, null, 2))
const actiefId = JSON.parse(readFileSync(join(map, 'profiles', 'active.json'), 'utf8')).id
const profielPad = join(map, 'profiles', `${actiefId}.json`)
{
  const p = JSON.parse(readFileSync(profielPad, 'utf8'))
  delete p.activeDuty
  p.personeelsnummer = NUMMER
  p.pincode = PINCODE
  p.pasGezien = true
  writeFileSync(profielPad, JSON.stringify(p, null, 2))
}
const profiel = () => JSON.parse(readFileSync(profielPad, 'utf8'))
const logboekVoor = profiel().entries?.length ?? 0

/* ---- de dienstregeling van de kaart, om een andere omloop te kunnen kiezen ---- */
const kernPad = join(mkdtempSync(join(tmpdir(), 'omsi-vrij-kern-')), 'kern.cjs')
require('esbuild').buildSync({
  stdin: {
    contents:
      "export { loadMap } from './src/core/timetable'; export { buildNetwork, listLines } from './src/core/duty'",
    resolveDir: join(__dirname, '..'),
    loader: 'ts'
  },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron'],
  outfile: kernPad,
  logLevel: 'error'
})
const kern = require(kernPad)
const kaart = kern.loadMap(join(inst.omsiPath, 'maps'), KAART)
if (!kaart) {
  console.log(`${KAART} niet gevonden; proef overgeslagen`)
  process.exit(0)
}
const net = kern.buildNetwork(kaart)
const ritten = [...net.departingFrom.values()].flat()
/* Wat de lijnstap toont, en welk lijnbestand erachter zit. */
const lijnVanNaam = new Map(kern.listLines(kaart, net).map((l) => [l.lineNumbers.join(', ') || l.lineFile, l.lineFile]))

/* ---- "OMSI draait": een eigen procesje met een eigen naam ---- */
const nepMap = mkdtempSync(join(tmpdir(), 'omsi-vrij-proces-'))
const nepExe = join(nepMap, 'OmsiNepProef.exe')
copyFileSync(join(process.env.SystemRoot || 'C:/Windows', 'System32', 'PING.EXE'), nepExe)
let nepOmsi = spawn(nepExe, ['-n', '900', '127.0.0.1'], { stdio: 'ignore', windowsHide: true })

const live = join(mkdtempSync(join(tmpdir(), 'omsi-vrij-live-')), 'OMSI Career')
mkdirSync(live, { recursive: true })
process.env.OMSI_ENHANCER_LIVEMAP = live
process.env.OMSI_ENHANCER_APPARAAT_HOST = '127.0.0.1'
process.env.OMSI_ENHANCER_PROEFPROCES = 'OmsiNepProef'

const { resolve } = require('node:path')
const spelmap = resolve(inst.omsiPath).toLowerCase()
const geweigerd = []
const inSpelmap = (pad) => typeof pad === 'string' && resolve(pad).toLowerCase().startsWith(spelmap)
{
  const echteFs = require('node:fs')
  /* Welk argument het doel is: bij kopiëren en hernoemen het tweede. */
  const schrijvers = {
    writeFileSync: 0, appendFileSync: 0, mkdirSync: 0, rmSync: 0, unlinkSync: 0, rmdirSync: 0,
    copyFileSync: 1, renameSync: 1, cpSync: 1, writeFile: 0, appendFile: 0, copyFile: 1, rename: 1,
    unlink: 0, mkdir: 0, rm: 0
  }
  for (const [naam, plek] of Object.entries(schrijvers)) {
    const echt = echteFs[naam]
    if (typeof echt !== 'function') continue
    echteFs[naam] = function (...args) {
      if (inSpelmap(String(args[plek]))) {
        geweigerd.push(`${naam} ${args[plek]}`)
        throw new Error(`proef: niet schrijven in de spelmap (${naam} ${args[plek]})`)
      }
      return echt.apply(this, args)
    }
  }
  const echtOpen = echteFs.openSync
  echteFs.openSync = function (pad, vlag, ...rest) {
    if (inSpelmap(String(pad)) && !/^r$|^rs\+?$/.test(String(vlag ?? 'r'))) {
      geweigerd.push(`openSync ${pad} ${vlag}`)
      throw new Error(`proef: niet schrijven in de spelmap (openSync ${pad})`)
    }
    return echtOpen.call(this, pad, vlag, ...rest)
  }
  const kinderen = require('node:child_process')
  for (const naam of ['spawn', 'execFile', 'execFileSync', 'exec', 'execSync', 'spawnSync']) {
    const echt = kinderen[naam]
    kinderen[naam] = function (commando, ...args) {
      const alles = [String(commando), ...(Array.isArray(args[0]) ? args[0].map(String) : [])].join(' ').toLowerCase()
      /* tasklist met "IMAGENAME eq Omsi.exe" leest alleen; starten niet. */
      const start = /omsi\.exe/.test(alles) && !/^tasklist/.test(String(commando).toLowerCase())
      if (start || alles.includes(spelmap)) {
        geweigerd.push(`${naam} ${alles.slice(0, 120)}`)
        throw new Error(`proef: het echte OMSI niet starten (${alles.slice(0, 80)})`)
      }
      return echt.call(this, commando, ...args)
    }
  }
}
app.setPath('userData', map)

/* Niets in de spelmap: wat er voor de proef stond, staat er na de proef nog. */
const spelmapVoor = (() => {
  const uit = {}
  for (const naam of ['options.cfg', join('Inputs', 'keyboard.cfg')]) {
    try {
      uit[naam] = statSync(join(inst.omsiPath, naam)).mtimeMs
    } catch {
      // Niet aanwezig.
    }
  }
  return uit
})()

function stop(code) {
  try {
    nepOmsi?.kill()
  } catch {
    // Al weg.
  }
  app.exit(code)
}
setTimeout(() => {
  console.log('time-out')
  stop(1)
}, 240000).unref()
require('../out/main/index.js')
const wacht = (ms) => new Promise((r) => setTimeout(r, ms))
const js = (w, code) =>
  w.webContents.executeJavaScript(code).catch((fout) => {
    throw new Error(`${String(fout).slice(0, 60)} in: ${code.slice(0, 120)}`)
  })
app.on('window-all-closed', () => {})
app.on('browser-window-created', (_e, w) => {
  if (w.webContents.isOffscreen()) return
  if (BrowserWindow.getAllWindows().length > 1) {
    w.show = () => {}
    w.showInactive = () => {}
  }
})

let mem = { ok: 0 }
let klok = 8 * 3600
const schrijfLive = () =>
  writeFileSync(
    join(live, 'live.json'),
    JSON.stringify({
      alive: true, seen: 8388607, seenSys: 63, seenStr: 63, strKind: 1, plugin: 13,
      time: klok, day: 1, month: 7, year: 2026, velocity: 0, passengers: 3,
      scheduleActive: 1, targetIndex: 0, tankPercent: 0.7, km: 0, metres: 0,
      busstopIndex: 0, busstop: '', line: '', terminus: '',
      matrix: '', delayMin: '', delaySec: '', entryRequest: 0, exitRequest: 0, ticket: -1,
      entryOpen: 0, exitOpen: 0, atStation: 0, brightness: 0.5, streetCond: 0, precipRate: 0,
      precipType: 0, lightsLow: 1, blinkerLeft: 0, blinkerRight: 0, brakeLight: 0, engineOn: 1,
      maxBrake: 0, maxAccel: 0, topSpeed: 0, harshBrakes: 0, harshAccels: 0,
      collisions: 0, collisionEnergy: 0, worstCollision: 0, exeVersion: '2.3.004',
      ibis: { bestemming: '', lijn: '', lawo1: '', lawo2: '', lawo3: '', lawo4: '', afr1: '', afr2: '' },
      mem
    })
  )
const memVoor = (run) => ({
  ok: 1, tile: 0, x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1,
  schedActive: 1, line: 0, tour: 0, tourEntry: 0, trip: 0, nextIndex: 0, nextDist: 0, delay: 0,
  lineName: run.lineFile, tourName: run.tourNumber, tripName: `TTData\\${run.tripFile}.ttp`, nextStop: ''
})

app.whenReady().then(async () => {
  ipcMain.removeHandler('plugin:status')
  ipcMain.handle('plugin:status', () => ({ installed: true, upToDate: true, changed: false, target: '' }))
  let hoofd
  for (let i = 0; i < 40 && !hoofd; i++) {
    await wacht(250)
    hoofd = BrowserWindow.getAllWindows()[0]
  }
  await wacht(2000)
  process.on('unhandledRejection', async (fout) => {
    console.log('fout in de proef:', String(fout).slice(0, 200))
    if (uitvoer) {
      try {
        writeFileSync(join(uitvoer, 'vrij-fout.png'), (await hoofd.webContents.capturePage()).toPNG())
      } catch {
        // Dan zonder beeld.
      }
    }
    stop(1)
  })
  const meldingen = []
  hoofd.webContents.on('console-message', (_e, niveau, tekst) => {
    if (niveau >= 2) meldingen.push(tekst)
  })
  const wachtOp = async (code, keer = 60) => {
    for (let i = 0; i < keer; i++) {
      const uit = await js(hoofd, code)
      if (uit) return uit
      await wacht(250)
    }
    return undefined
  }
  const klikTekst = (re) =>
    js(hoofd, `(() => { const b = [...document.querySelectorAll('button')].find((k) => ${re}.test(k.textContent)); b?.click(); return Boolean(b) })()`)

  await wachtOp(`document.querySelectorAll('.hub-tegel').length > 0`)
  await klikTekst(/Overslaan|Skip/)
  await wacht(800)

  /* ---- 1. Vrij rijden, de kaart ---- */
  /*
   * Naar vrij rijden. Soms staat de app eerst op de chauffeurs (hij begint
   * daar als het profiel net geladen wordt); dan eerst Verder, naar het
   * hoofdmenu, en dan de tegel.
   */
  for (let poging = 0; poging < 4; poging++) {
    const waar = await js(hoofd, `document.querySelector('.hub-tegel') ? 'hub' : /Wie rijdt er vandaag|Who is driving/.test(document.body.innerText) ? 'chauffeurs' : 'anders'`)
    if (waar === 'hub') await js(hoofd, `document.querySelector(".hub-tegel[data-modus='free']")?.click()`)
    else if (waar === 'chauffeurs') await js(hoofd, `document.querySelector('.startknop')?.click()`)
    else break
    await wacht(1200)
  }
  await wachtOp(`[...document.querySelectorAll('.dienstrij, .tegel')].some((r) => /${KAART}/.test(r.textContent))`)
  await js(hoofd, `[...document.querySelectorAll('.dienstrij, .tegel')].find((r) => /^\\s*${KAART}\\b/.test(r.textContent) || r.textContent.includes('${KAART}'))?.click()`)
  await wacht(400)
  await js(hoofd, `document.querySelector('.startknop')?.click()`)

  /* ---- 2. De lijnen: twee aanvinken ---- */
  const lijnen = await wachtOp(`(() => { const r = [...document.querySelectorAll('.dienstrij')]; return r.length > 1 && r[0].querySelector('.dienstbol.vink') ? r.length : 0 })()`)
  await js(hoofd, `[...document.querySelectorAll('.dienstrij')][0].click()`)
  await wacht(200)
  await js(hoofd, `[...document.querySelectorAll('.dienstrij')][1].click()`)
  await wacht(300)
  const vinkjes = await js(hoofd, `[...document.querySelectorAll('.dienstrij')].map((r) => r.getAttribute('aria-pressed'))`)
  const gekozenLijnen = await js(hoofd, `[...document.querySelectorAll('.dienstrij')].filter((r) => r.getAttribute('aria-pressed') === 'true').map((r) => r.querySelector('.dienstnaam')?.textContent)`)
  console.log(`lijnen: ${lijnen}, aangevinkt: ${gekozenLijnen.join(' + ')} (${vinkjes.filter((v) => v === 'true').length})`)
  if (uitvoer) writeFileSync(join(uitvoer, 'vrij-lijnen.png'), (await hoofd.webContents.capturePage()).toPNG())
  await js(hoofd, `document.querySelector('.startknop')?.click()`)

  /* ---- 3. De dienststap ---- */
  /* Op de dienststap: rijen zonder vinkje, en de knoppen voor lengte, dagdeel en weer. */
  const diensten = await wachtOp(`(() => { const r = [...document.querySelectorAll('.dienstrij')]; return r.length > 0 && !r[0].querySelector('.dienstbol.vink') && document.querySelectorAll('.regelaar').length > 0 ? r.length : 0 })()`, 160)
  await wacht(500)
  const weer = await js(hoofd, `[...document.querySelectorAll('.regelaar-chips button')].map((b) => b.textContent)`)
  await klikTekst(/^(Regen|Rain|Pluie)$/)
  console.log(`diensten: ${diensten}; weer: ${weer.join(', ')}`)
  if (uitvoer) writeFileSync(join(uitvoer, 'vrij-diensten.png'), (await hoofd.webContents.capturePage()).toPNG())
  await js(hoofd, `document.querySelector('.startknop')?.click()`)

  /* ---- 4. De bus, en START terwijl "OMSI" draait ---- */
  await wachtOp(`document.querySelector('.startknop')?.textContent?.match(/START/i)`, 60)
  await wacht(500)
  const draaitVolgensApp = await js(hoofd, `window.career.omsiRunning()`)
  if (!draaitVolgensApp) {
    console.log('de app ziet "OMSI" niet draaien; NIET op START gedrukt')
    stop(1)
    return
  }
  await js(hoofd, `document.querySelector('.startknop')?.click()`)
  const vraag = await wachtOp(`[...document.querySelectorAll('.dialog button')].some((b) => /Meerijden|Ride along/.test(b.textContent))`, 40)
  console.log(`vraag "OMSI draait al": ${Boolean(vraag)}`)
  await klikTekst(/^(Meerijden|Ride along)$/)
  const dienstIn = await (async () => {
    for (let i = 0; i < 60; i++) {
      const d = profiel().activeDuty
      if (d?.startedAt) return d
      await wacht(250)
    }
    return undefined
  })()
  const voorgesteld = dienstIn?.assignment?.duty
  const lijnbestanden = new Set(voorgesteld?.legs.map((leg) => leg.lineFile))
  const aangevinkt = new Set(gekozenLijnen.map((naam) => lijnVanNaam.get(naam)))
  const alleenGekozen = [...lijnbestanden].every((lijn) => aangevinkt.has(lijn))
  console.log(
    `in het profiel: modus ${dienstIn?.mode}, lijn ${voorgesteld?.lineNumbers.join('/')}, omloop ${voorgesteld?.tourNumber}, ` +
      `${voorgesteld?.legs.length} ritten over ${[...lijnbestanden].join(', ')}; alleen aangevinkte lijnen: ${alleenGekozen}`
  )

  /* ---- 5. OMSI: de voorgestelde omloop. De overlay gaat open; er verandert niets. ---- */
  const eerste = voorgesteld.legs[0]
  klok = eerste.departure * 60
  mem = memVoor({ lineFile: eerste.lineFile, tourNumber: eerste.tourNumber, tripFile: eerste.tripFile })
  schrijfLive()
  setInterval(() => {
    const nu = new Date()
    try {
      utimesSync(join(live, 'live.json'), nu, nu)
    } catch {
      // Tussen twee keer schrijven.
    }
  }, 2000).unref()
  await js(hoofd, `window.career.setOverlay(null, true)`).catch(() => undefined)
  await wacht(3000)
  /* Aanmelden, zoals op de telefoon. */
  await js(hoofd, `window.career.telefoonAanmelden('${NUMMER}', '${PINCODE}')`)
  await js(hoofd, `window.career.telefoonAanvaard()`)
  await wacht(1500)
  const naVoorstel = profiel().activeDuty?.assignment?.duty
  console.log(`zelfde omloop in OMSI: dienst ongewijzigd ${naVoorstel?.tourNumber === voorgesteld.tourNumber && naVoorstel?.start === voorgesteld.start}`)

  /* ---- 6. OMSI: een andere omloop ---- */
  const ander = ritten
    .filter((run) => run.tourNumber !== voorgesteld.tourNumber || run.lineFile !== voorgesteld.lineFile)
    .sort((a, b) => a.departure - b.departure)
    .find((run) => run.departure > 6 * 60 && run.departure < 20 * 60)
  klok = ander.departure * 60
  mem = memVoor(ander)
  schrijfLive()
  const gevolgd = await (async () => {
    for (let i = 0; i < 40; i++) {
      const d = profiel().activeDuty?.assignment?.duty
      if (d && d.tourNumber === ander.tourNumber && d.legs[0]?.tripFile === ander.tripFile) return d
      await wacht(250)
    }
    return undefined
  })()
  await wacht(1500)
  const voet = await js(hoofd, `document.querySelector('.velvoet')?.textContent ?? ''`)
  const overlay = BrowserWindow.getAllWindows().find((w) => w !== hoofd && /overlay/.test(w.webContents.getURL()))
  const inOverlay = overlay ? await js(overlay, `document.body.innerText`) : ''
  const log = readFileSync(join(map, 'logs', 'omsi-enhancer.log'), 'utf8')
  const ibisRegel = log.split(/\r?\n/).reverse().find((r) => /vrij rijden volgt OMSI/.test(r)) ?? ''
  console.log(`andere omloop in OMSI: lijn ${ander.lineFile}, omloop ${ander.tourNumber}, rit ${ander.tripFile} ${ander.departure}`)
  console.log(`  profiel: ${gevolgd ? `gevolgd, ${gevolgd.legs.length} ritten, begint ${gevolgd.legs[0].tripFile}` : 'NIET GEVOLGD'}`)
  console.log(`  logboek: ${ibisRegel.slice(24, 200)}`)
  console.log(`  rijscherm: "${voet.slice(0, 110)}"`)
  const telefoon = JSON.parse(readFileSync(join(map, 'telefoon.json'), 'utf8'))
  const cijferblok = overlay ? await js(overlay, `Boolean(document.querySelector('.aanmelden'))`) : true
  const nuAangemeld = telefoon.sleutel.includes('|vrij|') && telefoon.aangemeld && telefoon.aanvaard && !cijferblok
  console.log(`  aanmelding blijft staan: ${nuAangemeld}`)
  console.log(`  overlay open: ${Boolean(overlay)}; toont lijn: ${gevolgd ? inOverlay.includes(gevolgd.lineNumbers[0] ?? '§') : false}`)
  if (uitvoer) writeFileSync(join(uitvoer, 'vrij-gevolgd.png'), (await hoofd.webContents.capturePage()).toPNG())

  /* ---- 7. Niets in de spelmap, en afronden boekt niets ---- */
  const spelmapNa = {}
  for (const naam of Object.keys(spelmapVoor)) {
    try {
      spelmapNa[naam] = statSync(join(inst.omsiPath, naam)).mtimeMs
    } catch {
      // Niet aanwezig.
    }
  }
  const spelmapGelijk = JSON.stringify(spelmapNa) === JSON.stringify(spelmapVoor) && geweigerd.length === 0
  console.log(`spelmap onaangeroerd: ${spelmapGelijk}${geweigerd.length ? `; geweigerd: ${geweigerd.join(' | ')}` : ''}`)

  const fouten = meldingen.filter((m) => !/Electron Security Warning|willReadFrequently/.test(m))
  console.log('meldingen:', fouten.length ? fouten.map((m) => m.slice(0, 140)) : 'geen')

  const goed =
    lijnen > 1 &&
    gekozenLijnen.length === 2 &&
    diensten > 0 &&
    weer.length >= 4 &&
    Boolean(vraag) &&
    dienstIn?.mode === 'free' &&
    [...lijnbestanden].length > 0 &&
    alleenGekozen &&
    naVoorstel?.tourNumber === voorgesteld.tourNumber &&
    Boolean(gevolgd) &&
    /IBIS lijn/.test(ibisRegel) &&
    /omloop/i.test(voet) &&
    nuAangemeld &&
    spelmapGelijk &&
    (profiel().entries?.length ?? 0) === logboekVoor &&
    fouten.length === 0
  console.log(goed ? 'vrij rijden: zelf samengesteld, en de overlay gaat mee' : 'VRIJ RIJDEN KLOPT NIET')
  stop(goed ? 0 : 1)
})
