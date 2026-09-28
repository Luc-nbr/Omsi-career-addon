/**
 * Vrij rijden: alleen kaart en bus in de app, de omloop in OMSI, en een
 * navigatie die zelf vindt wat je daar rijdt.
 *
 *   npx electron scripts/probe-vrijrijden.cjs [uitvoermap]
 *
 * Een gebruiker (via Luc): "meine Idee wäre das die Haltestellen aussuchen
 * Option komplett weg fällt in dem Modus nur und nur noch Karte und Bus
 * ausgesucht werden müssen und das Navi es von alleine findet".
 *
 * Nagelopen in de echte app, met echte klikken, terwijl "OMSI" al draait:
 * - Vrij rijden -> Rheinhausen: de voet zegt waar de bus komt te staan en hoeveel
 *   ritten daar vertrekken; "Tijd en weer" staat dicht op automatisch; de bus
 *   staat als marker op de kaart; de balk is Kaart -> Bus, zonder beginpunt;
 * - VERDER gaat meteen naar de bus; START schrijft alleen de situatie (OMSI
 *   draait al) en niets anders; het rijscherm van vrij rijden staat;
 * - de overlay zonder omloop: hoe je er een kiest, met wat er straks vertrekt;
 * - de kaart herkennen aan de plek van de bus: een reeks plekken op Krefrath
 *   laat de navigatie naar Krefrath wisselen, en een reeks op Rheinhausen weer
 *   terug;
 * - een omloop gekozen in OMSI: gekoppeld op nummer ("koppeling index"), en de
 *   volgende rit volgt zonder opnieuw te koppelen;
 * - een andere lijn met hetzelfde omloopnummer en een rit die nergens staat:
 *   de oude ritten verdwijnen, en de overlay zegt dat het niet in de
 *   dienstregeling staat;
 * - een andere omloop: de navigatie gaat mee;
 * - "Vrij rijden stoppen": terug naar het hoofdmenu, niets geboekt;
 * - een tweede vrije rit op Hamburg109_2, omloop 66093: bij rit 6 kloppen beide
 *   volgordes (de app kiest die van het bestand, onzeker); bij rit 7 telt OMSI
 *   op vertrektijd, en dan draait het volgen de volgorde om: 109_UAL_ZAL om
 *   10:23, niet de leegrit van 12:44 die in het bestand op plek 7 staat;
 * - een actieve chrono zonder bruikbare namen: de plugin (14) geeft `line` één
 *   verder en `lines` één langer dan het aantal .ttl; dan koppelt de app niet
 *   op die plek aan een andere lijn, maar op de rit (`lines` gaat van live.json
 *   via main naar de koppeling).
 *
 * Wat hier NIET nagelopen wordt: starten terwijl OMSI dicht is. Dan zet de app
 * het startscherm van OMSI klaar en start hij het spel, en dat hoort een proef
 * niet te doen; core/vrijstart.ts loopt die takken na (probe-vrijstart.ts).
 *
 * VANGRAILS. De eerste versie van deze proef, 27-09, heeft het echte OMSI
 * gestart en een situatie in de spelmap gezet. Daarom weigert dit script,
 * voordat de app geladen wordt, elke schrijfactie onder de spelmap en elk
 * programma dat Omsi.exe start -- en drukt het pas op START als de app zelf
 * zegt dat "OMSI" draait. Eén uitzondering, en die is omgeleid: met OMSI al
 * draaiend schrijft de app `Situations\OMSI Enhancer.osn`, en dat gaat hier
 * naar een tijdelijke map in plaats van naar de spelmap.
 */
const { app, BrowserWindow, ipcMain } = require('electron')
const { spawn } = require('node:child_process')
const { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, utimesSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')

const uitvoer = process.argv.slice(2).find((a) => !a.startsWith('-') && !a.endsWith('.cjs'))
if (uitvoer) mkdirSync(uitvoer, { recursive: true })
const KAART = 'Rheinhausen'
const ANDERE = 'Krefrath'
const TWEEDE = 'Hamburg109_2'
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
inst.language = 'nl'
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

/* ---- de dienstregeling van de kaart, om omlopen te kiezen zoals OMSI ze doorgeeft ---- */
const kernPad = join(mkdtempSync(join(tmpdir(), 'omsi-vrij-kern-')), 'kern.cjs')
require('esbuild').buildSync({
  stdin: {
    contents:
      "export { loadMap } from './src/core/timetable'; export { leesInzetpunten } from './src/core/beginplek'; " +
      "export { monsterKlopt } from './src/core/kaartherkenning'; export { koppelOmsiKeuze } from './src/core/omloopvolgen'; " +
      "export { readCalendar } from './src/core/calendar'",
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
const namen = (m, soort) =>
  readdirSync(join(m.path, 'TTData'))
    .filter((n) => n.toLowerCase().endsWith(soort))
    .map((n) => n.slice(0, -soort.length))
const ttl = namen(kaart, '.ttl')
const ttp = namen(kaart, '.ttp')
/** Wat OMSI in zijn geheugen zet voor een rit van een omloop, op nummer; `lines` sinds plugin 14. */
const keuzeVan = (m, ttlNamen, ttpNamen, tour, entry) => ({
  schedActive: 1,
  line: ttlNamen.indexOf(tour.lineFile),
  lines: ttlNamen.length,
  tour: tour.index,
  tourEntry: entry.entry,
  trip: ttpNamen.findIndex((n) => n.toLowerCase() === entry.tripFile.toLowerCase()),
  lineName: tour.lineFile,
  tourName: tour.number,
  tripName: entry.tripFile
})
/* Een omloop met minstens twee ritten na zevenen, en een tweede op een andere lijn of omloop. */
const bruikbaar = kaart.tours.filter((t) => t.trips.filter((e) => e.departure > 7 * 60 && kaart.trips.has(e.tripFile.toLowerCase())).length >= 2)
const eersteOmloop = bruikbaar[0]
const eersteRit = eersteOmloop.trips.find((e) => e.departure > 7 * 60 && kaart.trips.has(e.tripFile.toLowerCase()))
const volgendeRit = eersteOmloop.trips[eersteOmloop.trips.indexOf(eersteRit) + 1]
const andereOmloop = bruikbaar.find((t) => t.lineFile !== eersteOmloop.lineFile || t.number !== eersteOmloop.number)
const andereRit = andereOmloop.trips.find((e) => e.departure > 7 * 60 && kaart.trips.has(e.tripFile.toLowerCase()))
/* Een andere lijn met een omloop op dezelfde plek: die hoort de oude niet te laten staan. */
const andereLijn = kaart.tours.find((t) => t.lineFile !== eersteOmloop.lineFile && t.index === eersteOmloop.index)
/*
 * Plekken van de bus op een andere kaart en op deze: de inzetpunten, daar zet
 * OMSI bussen neer. Alleen die op de andere kaart niet toevallig ook op de
 * grond liggen: hier gaat het om het wisselen, niet om het herkennen zelf --
 * dat loopt probe-kaartherkenning.ts na, en daar twijfelt Krefrath tegen
 * Rheinhausen terecht op een kwart van de plekken. En elke plek een eigen
 * monster: een andere tegel of 50 m verder.
 */
const plekkenOp = (folder, niet) => {
  const uit = []
  for (const p of kern.leesInzetpunten(join(inst.omsiPath, 'maps', folder))) {
    if (kern.monsterKlopt(join(inst.omsiPath, 'maps', niet), { tile: p.tile, x: p.x, y: p.y, z: p.z })) continue
    const vorige = uit[uit.length - 1]
    if (vorige && vorige.tile === p.tile && Math.hypot(vorige.x - p.x, vorige.z - p.z) < 50) continue
    uit.push({ tile: p.tile, x: p.x, y: p.y, z: p.z })
  }
  return uit
}
const plekkenAnders = plekkenOp(ANDERE, KAART)
const plekkenHier = plekkenOp(KAART, ANDERE)
const tweede = kern.loadMap(join(inst.omsiPath, 'maps'), TWEEDE)

/* ---- "OMSI draait": een eigen procesje met een eigen naam ---- */
const nepMap = mkdtempSync(join(tmpdir(), 'omsi-vrij-proces-'))
const nepExe = join(nepMap, 'OmsiNepProef.exe')
copyFileSync(join(process.env.SystemRoot || 'C:/Windows', 'System32', 'PING.EXE'), nepExe)
const nepOmsi = spawn(nepExe, ['-n', '900', '127.0.0.1'], { stdio: 'ignore', windowsHide: true })

const live = join(mkdtempSync(join(tmpdir(), 'omsi-vrij-live-')), 'OMSI Career')
mkdirSync(live, { recursive: true })
process.env.OMSI_ENHANCER_LIVEMAP = live
process.env.OMSI_ENHANCER_APPARAAT_HOST = '127.0.0.1'
process.env.OMSI_ENHANCER_PROEFPROCES = 'OmsiNepProef'
app.setPath('userData', map)

/* ---- de vangrails, voordat de app geladen wordt ---- */
const spelmap = resolve(inst.omsiPath).toLowerCase()
const situaties = join(spelmap, 'situations').toLowerCase()
const omleiding = mkdtempSync(join(tmpdir(), 'omsi-vrij-situaties-'))
const geweigerd = []
const omgeleid = []
const inSpelmap = (pad) => typeof pad === 'string' && resolve(pad).toLowerCase().startsWith(spelmap)
/* Alleen de situatie mag, en die gaat naar een tijdelijke map. */
const omleid = (pad) => {
  const vol = resolve(pad)
  return vol.toLowerCase().startsWith(situaties) ? join(omleiding, vol.slice(situaties.length)) : undefined
}
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
      const doel = String(args[plek])
      if (inSpelmap(doel)) {
        const ander = omleid(doel)
        if (ander) {
          omgeleid.push(`${naam} ${doel}`)
          args[plek] = ander
          return echt.apply(this, args)
        }
        geweigerd.push(`${naam} ${doel}`)
        throw new Error(`proef: niet schrijven in de spelmap (${naam} ${doel})`)
      }
      return echt.apply(this, args)
    }
  }
  const echtOpen = echteFs.openSync
  echteFs.openSync = function (pad, vlag, ...rest) {
    if (inSpelmap(String(pad)) && !/^r$|^rs\+?$/.test(String(vlag ?? 'r'))) {
      const ander = omleid(String(pad))
      if (ander) return echtOpen.call(this, ander, vlag, ...rest)
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

/* Niets in de spelmap: wat er voor de proef stond, staat er na de proef nog. */
const spelmapStand = () => {
  const uit = {}
  for (const naam of [
    'options.cfg',
    join('Inputs', 'keyboard.cfg'),
    join('maps', KAART, 'laststn.osn'),
    join('maps', TWEEDE, 'laststn.osn'),
    join('Situations', 'OMSI Enhancer.osn')
  ]) {
    try {
      uit[naam] = statSync(join(inst.omsiPath, naam)).mtimeMs
    } catch {
      // Niet aanwezig.
    }
  }
  return uit
}
const spelmapVoor = spelmapStand()

function stop(code) {
  try {
    nepOmsi.kill()
  } catch {
    // Al weg.
  }
  app.exit(code)
}
setTimeout(() => {
  console.log('time-out')
  stop(1)
}, 420000).unref()
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

/* ---- de plugin: een live.json die de proef zelf schrijft ---- */
let mem = {
  ok: 1, tile: 0, x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1, schedActive: 0, line: -1, lines: 0, tour: -1,
  tourEntry: -1, trip: -1, nextIndex: 0, nextDist: 0, delay: 0, lineName: '', tourName: '', tripName: '', nextStop: ''
}
let klok = 7 * 3600
let datum = { year: 2016, month: 11, day: 9 }
const schrijfLive = () =>
  writeFileSync(
    join(live, 'live.json'),
    JSON.stringify({
      alive: true, seen: 8388607, seenSys: 63, seenStr: 63, strKind: 1, plugin: 14,
      time: klok, day: datum.day, month: datum.month, year: datum.year, velocity: 0, passengers: 3,
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
const kies = (keuze, departure) => {
  klok = Math.round(departure) * 60
  mem = { ...mem, ...keuze }
  schrijfLive()
}

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
  const overlay = () =>
    BrowserWindow.getAllWindows().find((w) => w !== hoofd && !w.isDestroyed() && /overlay/.test(w.webContents.getURL()))
  const overlayTekst = async () => {
    const w = overlay()
    return w ? js(w, `document.body.innerText`) : ''
  }
  const wachtOpOverlay = async (patroon, keer = 60) => {
    for (let i = 0; i < keer; i++) {
      if (patroon.test(await overlayTekst())) return true
      await wacht(250)
    }
    return false
  }
  const beeld = async (naam) => {
    if (uitvoer) writeFileSync(join(uitvoer, naam), (await hoofd.webContents.capturePage()).toPNG())
  }
  /* De overlay heel even tonen om hem vast te leggen; daarna weer weg. */
  const overlayBeeld = async (naam) => {
    const w = overlay()
    if (!uitvoer || !w) return
    w.showInactive = BrowserWindow.prototype.showInactive
    w.showInactive()
    await wacht(700)
    writeFileSync(join(uitvoer, naam), (await w.webContents.capturePage()).toPNG())
    w.hide()
  }
  const logboek = () => readFileSync(join(map, 'logs', 'omsi-enhancer.log'), 'utf8').split(/\r?\n/)

  /* De plugin schrijft al: OMSI draait, maar er is nog geen omloop gekozen. */
  schrijfLive()
  setInterval(() => {
    const nu = new Date()
    try {
      utimesSync(join(live, 'live.json'), nu, nu)
    } catch {
      // Tussen twee keer schrijven.
    }
  }, 2000).unref()

  /* ---- 1. Naar vrij rijden, de kaart ---- */
  await wachtOp(`document.querySelectorAll('.hub-tegel').length > 0 || /Wie rijdt er vandaag|Who is driving/.test(document.body.innerText)`)
  for (let poging = 0; poging < 4; poging++) {
    const waar = await js(hoofd, `document.querySelector('.hub-tegel') ? 'hub' : /Wie rijdt er vandaag|Who is driving/.test(document.body.innerText) ? 'chauffeurs' : 'anders'`)
    if (waar === 'hub') await js(hoofd, `document.querySelector(".hub-tegel[data-modus='free']")?.click()`)
    else if (waar === 'chauffeurs') await js(hoofd, `document.querySelector('.startknop')?.click()`)
    else break
    await wacht(1200)
  }
  /* De lijst, niet de tegels: dan staat de kaart ernaast, met de bus erop. */
  await js(hoofd, `[...document.querySelectorAll('.weergavekeuze button')][0]?.click()`)
  await wacht(400)
  await wachtOp(`[...document.querySelectorAll('.dienstrij, .tegel')].some((r) => r.textContent.includes('${KAART}'))`)
  await js(hoofd, `[...document.querySelectorAll('.dienstrij, .tegel')].find((r) => r.textContent.includes('${KAART}'))?.click()`)
  const voetKaart = await wachtOp(`(() => { const v = document.querySelector('.velvoet')?.textContent ?? ''; return /staat klaar bij/.test(v) ? v : '' })()`, 120)
  await wacht(1500)
  const balkTekst = (await js(hoofd, `document.querySelector('.stappen')?.innerText ?? ''`)).toUpperCase()
  const balkGoed = /KAART/.test(balkTekst) && /BUS/.test(balkTekst) && !/\bLIJN\b|BEGINPUNT|DIENST/.test(balkTekst)
  const wanneerDicht = await js(hoofd, `(() => { const d = document.querySelector('.vrij-wanneer'); return d ? { open: d.open, samen: d.querySelector('summary')?.textContent ?? '' } : null })()`)
  const marker = await wachtOp(`Boolean(document.querySelector('.setup-kaart .bus-arrow'))`, 40)
  console.log(`kaartstap: voet "${voetKaart}"; balk ${balkTekst.replace(/\s+/g, ' ')}; tijd en weer ${JSON.stringify(wanneerDicht)}; bus op de kaart: ${Boolean(marker)}`)
  await beeld('vrij-kaart.png')
  await js(hoofd, `document.querySelector('.vrij-wanneer > summary')?.click()`)
  await wacht(600)
  const wanneerOpen = await js(hoofd, `({ datum: document.querySelector('.vrij-wanneer input[type=date]')?.value ?? '', tijd: document.querySelector('.vrij-wanneer input[type=time]')?.value ?? '', chips: [...document.querySelectorAll('.vrij-wanneer .regelaar-chips button')].map((b) => b.textContent) })`)
  console.log(`  open: datum ${wanneerOpen.datum}, tijd ${wanneerOpen.tijd}, weer ${wanneerOpen.chips.join(' | ')}`)
  await beeld('vrij-kaart-tijd-en-weer.png')
  await js(hoofd, `document.querySelector('.vrij-wanneer > summary')?.click()`)
  const [jaar, maand, dag] = wanneerOpen.datum.split('-').map(Number)
  if (jaar) datum = { year: jaar, month: maand, day: dag }
  await js(hoofd, `document.querySelector('.startknop')?.click()`)

  /* ---- 2. Meteen de bus, en START terwijl "OMSI" draait ---- */
  const busstap = await wachtOp(`document.querySelector('.stap[data-stand="nu"]')?.textContent?.match(/Bus/i) && document.querySelector('.startknop')?.textContent?.match(/START/i)`, 60)
  await wacht(500)
  if (!(await js(hoofd, `window.career.omsiRunning()`))) {
    console.log('de app ziet "OMSI" niet draaien; NIET op START gedrukt')
    stop(1)
    return
  }
  await beeld('vrij-bus.png')
  /*
   * Het wagenpark: Luc, "het moet gewoon de map herkennen en die toepassen".
   * Door naar de remisestap: steeds de aangewezen tegel aantikken (merk, type,
   * uitvoering, kleurstelling) tot het wagenpark aan de beurt is.
   */
  for (let i = 0; i < 6; i++) {
    if (await js(hoofd, `/Remise|Depot/.test(document.querySelector('h1, h2')?.textContent ?? '')`)) break
    await js(hoofd, `(document.querySelector('.tegel[aria-pressed=true]') ?? document.querySelector('.tegel'))?.click()`)
    await wacht(900)
  }
  const remise = await js(hoofd, `({ titel: document.querySelector('h1, h2')?.textContent ?? '', tegels: [...document.querySelectorAll('.tegel')].map((t) => ({ tekst: t.textContent.trim().slice(0, 40), aan: t.getAttribute('aria-pressed') === 'true' })) })`)
  const bus = await js(hoofd, `window.career.suggestVehicle('${KAART}').then((b) => b?.relativePath ?? '')`)
  const wagenparken = bus ? await js(hoofd, `window.career.vrijeYards('${KAART}', ${JSON.stringify(bus)}, 2016)`) : []
  const voorstel = wagenparken.find((optie) => optie.suggested)?.name ?? ''
  const heeftKaartHof = wagenparken.some((optie) => /rheinhausen/i.test(optie.name))
  console.log(`busstap: ${Boolean(busstap)}; remise "${remise.titel}", ${remise.tegels.length} tegels; voorstel ${voorstel || 'geen'}`)
  await js(hoofd, `document.querySelector('.startknop')?.click()`)
  const rijscherm = await wachtOp(`/Vrij rijden stoppen|Stop free play/i.test(document.body.innerText)`, 60)
  await wacht(800)
  const voetStart = await js(hoofd, `document.querySelector('.velvoet')?.textContent ?? ''`)
  const situatie = join(omleiding, 'OMSI Enhancer.osn')
  const situatieTekst = existsSync(situatie) ? readFileSync(situatie).toString('utf16le') : ''
  const regels = situatieTekst.split('\r\n')
  const at = regels.indexOf('[vehicle]')
  const quaternion = at > 0 ? regels.slice(at + 5, at + 9) : []
  const situatieGoed = situatieTekst.includes(`maps\\${KAART}\\global.cfg`) && quaternion.length === 4 && quaternion.every((v) => /^-?\d+\.\d{6}$/.test(v))
  const startRegels = logboek().filter((r) => /vrij rijden: .*beginplek|vrij rijden klaargezet/.test(r))
  console.log(`rijscherm: ${Boolean(rijscherm)}; voet "${voetStart.slice(0, 110)}"; situatie omgeleid: ${situatieGoed} (quaternion ${quaternion.join(', ')})`)
  for (const regel of startRegels.slice(-2)) console.log(`  ${regel.slice(24, 230)}`)

  /* ---- 3. De overlay, zonder omloop ---- */
  for (let i = 0; i < 20 && !overlay(); i++) await wacht(250)
  await wacht(1500)
  await js(hoofd, `window.career.telefoonAanmelden('${NUMMER}', '${PINCODE}')`)
  const metSuggesties = await wachtOpOverlay(/in OMSI:/, 80)
  const zonderOmloop = await overlayTekst()
  const zegtHoe = /dienstregelingsmenu/i.test(zonderOmloop)
  const rijschermStraks = await js(hoofd, `document.querySelectorAll('.vrij-straks li').length`)
  console.log(`overlay zonder omloop: zegt hoe ${zegtHoe}, straks vertrekken ${metSuggesties}; rijscherm ${rijschermStraks} regels`)
  console.log(`  ${zonderOmloop.split('\n').filter((r) => /in OMSI:/.test(r)).slice(0, 3).join(' || ')}`)
  await beeld('vrij-rijscherm-geen-omloop.png')
  await overlayBeeld('vrij-overlay-geen-omloop.png')

  /* ---- 4. De kaart herkennen aan de plek van de bus ---- */
  const zetPlekken = async (plekken) => {
    for (const plek of plekken.slice(0, 12)) {
      mem = { ...mem, ...plek, ok: 1 }
      schrijfLive()
      await wacht(450)
    }
  }
  await zetPlekken(plekkenAnders)
  const naarAnders = await wachtOp(`/OMSI speelt Krefrath|Krefrath/.test(document.querySelector('.velonderschrift')?.textContent ?? '') || true`, 4)
  await wacht(1500)
  const wisselHeen = logboek().some((r) => /OMSI speelt .*Krefrath/i.test(r))
  const overlayWissel = await overlayTekst()
  await overlayBeeld('vrij-overlay-kaartwissel.png')
  await zetPlekken(plekkenHier)
  await wacht(2000)
  const wisselTerug = logboek().filter((r) => /OMSI speelt /.test(r)).some((r) => /Rheinhausen/.test(r.split('OMSI speelt ')[1] ?? ''))
  console.log(`kaartwissel: naar ${ANDERE} ${wisselHeen} (overlay "${(overlayWissel.match(/OMSI speelt[^\n]*/) ?? [''])[0]}"), terug ${wisselTerug}`)
  void naarAnders
  mem = { ...mem, tile: 0, x: 0, y: 0, z: 0 }

  /* ---- 5. OMSI: een omloop gekozen ---- */
  kies(keuzeVan(kaart, ttl, ttp, eersteOmloop, eersteRit), eersteRit.departure)
  const eerste = await wachtOp(`/Je rijdt lijn/.test(document.body.innerText)`, 60)
  await wacht(1500)
  const rijenEerst = await js(hoofd, `(document.querySelector('.vrij-omloop')?.innerText ?? '').split(':').length - 1`)
  const kaartMet = overlay() ? await js(overlay(), `({ kaart: Boolean(document.querySelector('.nav-wrap canvas, .nav-wrap svg')), hint: Boolean(document.querySelector('.nav-vrij')), balk: Boolean(document.querySelector('.navbar')) })`) : {}
  const koppelRegels = () => logboek().filter((r) => /vrij rijden volgt OMSI/.test(r))
  const eersteKoppeling = koppelRegels().slice(-1)[0] ?? ''
  console.log(`omloop ${eersteOmloop.lineFile}/${eersteOmloop.number} rit #${eersteRit.entry} ${eersteRit.tripFile}: rijscherm ${Boolean(eerste)}, ${rijenEerst} tijden; kaart ${JSON.stringify(kaartMet)}`)
  console.log(`  ${eersteKoppeling.slice(24, 330)}`)
  await beeld('vrij-rijscherm-gevolgd.png')
  await overlayBeeld('vrij-overlay-gevolgd.png')

  /* De volgende rit van dezelfde omloop: readSchedule volgt op nummer, zonder opnieuw te koppelen. */
  const voorVolgende = koppelRegels().length
  kies({ tourEntry: volgendeRit.entry, tripName: volgendeRit.tripFile, trip: ttp.findIndex((n) => n.toLowerCase() === volgendeRit.tripFile.toLowerCase()) }, volgendeRit.departure)
  await wacht(3000)
  const zonderOpnieuw = koppelRegels().length === voorVolgende && !logboek().some((r) => /volgorde gecorrigeerd/.test(r))
  console.log(`volgende rit ${volgendeRit.tripFile}: niet opnieuw gekoppeld ${zonderOpnieuw}`)

  /* ---- 6. Een andere lijn, zelfde omloopnummer, een rit die nergens staat ---- */
  let verloren = true
  if (andereLijn) {
    kies({ line: ttl.indexOf(andereLijn.lineFile), lineName: andereLijn.lineFile, tour: andereLijn.index, tourName: andereLijn.number, tourEntry: 0, tripName: 'ProefRitDieNergensStaat', trip: -1 }, eersteRit.departure)
    verloren = Boolean(await wachtOp(`/staat niet in de dienstregeling/.test(document.body.innerText)`, 60))
    await wacht(1500)
    const overlayVerloren = await overlayTekst()
    const geenBalk = overlay() ? await js(overlay(), `!document.querySelector('.navbar')`) : false
    verloren = verloren && /staat niet in de dienstregeling/.test(overlayVerloren) && geenBalk && !(await js(hoofd, `Boolean(document.querySelector('.vrij-omloop'))`))
    console.log(`andere lijn ${andereLijn.lineFile} met omloopplek ${andereLijn.index} en een onbekende rit: oude ritten weg en gemeld ${verloren}`)
    await beeld('vrij-rijscherm-onbekend.png')
    await overlayBeeld('vrij-overlay-onbekend.png')
  } else console.log('geen andere lijn met dezelfde omloopplek op deze kaart; overgeslagen')

  /* ---- 7. OMSI: een andere omloop ---- */
  kies(keuzeVan(kaart, ttl, ttp, andereOmloop, andereRit), andereRit.departure)
  const tweedeOmloop = await wachtOp(`document.body.innerText.includes('omloop ${andereOmloop.number}')`, 60)
  await wacht(1200)
  const aangemeld = overlay() ? await js(overlay(), `!document.querySelector('.aanmelden') && !document.querySelector('.opdracht')`) : false
  const gevolgdRegels = koppelRegels()
  console.log(`andere omloop ${andereOmloop.lineFile}/${andereOmloop.number}: ${Boolean(tweedeOmloop)}; aangemeld ${aangemeld}; gevolgd ${gevolgdRegels.length} keer`)
  for (const regel of gevolgdRegels) console.log(`  ${regel.slice(24, 330)}`)

  /*
   * ---- 7b. Een actieve chrono, zonder bruikbare namen ----
   * OMSI zet de lijnen van een actieve chrono vooraan in zijn lijst (1380dc3):
   * `line` schuift op, en plugin 14 schrijft de lengte van die lijst (`lines`).
   * Is die langer dan het aantal .ttl, dan hoort de app niet op de plek te
   * koppelen -- main geeft `lines` door aan de koppeling. Zonder die regel
   * koppelde deze keuze op nummer aan een andere lijn (tegenlezing merge
   * 2e7794f). Het geval wordt hier uitgerekend: de eerste rit na zevenen die
   * zonder `lines` op een andere lijn uitkomt, en met `lines` op de eigen.
   */
  let chrono = true
  {
    const dag = new Date(Date.UTC(datum.year, datum.month - 1, datum.day))
    const kalender = kern.readCalendar(kaart.path)
    const koppel = (keuze) => kern.koppelOmsiKeuze(kaart, keuze, { kalender, ttlNamen: ttl, ttpNamen: ttp, datum: dag })
    const gevolgdePlek = ttl.indexOf(andereOmloop.lineFile)
    let geval
    for (const tour of kaart.tours) {
      if (geval) break
      const plek = ttl.indexOf(tour.lineFile)
      for (const entry of tour.trips) {
        if (entry.departure <= 7 * 60 || !kaart.trips.has(entry.tripFile.toLowerCase())) continue
        // Niet de plek van de omloop die de app nu volgt: dan kijkt legVolgensOmsi niet verder.
        if (plek + 1 === gevolgdePlek && tour.index === andereOmloop.index) continue
        const keuze = {
          lineName: '', tourName: '', tripName: '', line: plek + 1, tour: tour.index, tourEntry: entry.entry,
          trip: ttp.findIndex((n) => n.toLowerCase() === entry.tripFile.toLowerCase()), klok: entry.departure % 1440
        }
        const oud = koppel(keuze)
        const nieuw = koppel({ ...keuze, lines: ttl.length + 1 })
        if (oud.soort === 'index' && oud.lineFile !== tour.lineFile && nieuw.duty && nieuw.lineFile === tour.lineFile) {
          geval = { tour, entry, keuze, oud, nieuw }
          break
        }
      }
    }
    if (geval) {
      const voor = koppelRegels().length
      const { klok: _klok, ...inGeheugen } = geval.keuze
      kies({ schedActive: 1, ...inGeheugen, lines: ttl.length + 1 }, geval.entry.departure)
      let regel = ''
      for (let i = 0; i < 60 && !regel; i++) {
        await wacht(250)
        regel = koppelRegels().slice(voor)[0] ?? ''
      }
      const rit = geval.nieuw.duty.legs[0].tripFile
      chrono =
        regel.includes(`koppeling ${geval.nieuw.soort},`) &&
        regel.includes(`lijnbestand ${geval.nieuw.lineFile},`) &&
        !regel.includes(`lijnbestand ${geval.oud.lineFile},`) &&
        regel.includes(rit)
      console.log(
        `chrono vooraan: ${geval.tour.lineFile}/${geval.tour.number} rit #${geval.entry.entry} ${geval.entry.tripFile} op plek ${geval.keuze.line} van ${ttl.length + 1}; ` +
          `zonder lines ${geval.oud.soort} ${geval.oud.lineFile}, verwacht ${geval.nieuw.soort} ${geval.nieuw.lineFile}: ${chrono}`
      )
      console.log(`  ${regel.slice(24, 330)}`)
    } else console.log('geen chrono-geval op deze kaart; overgeslagen')
  }

  /* ---- 8. Stoppen ---- */
  await js(hoofd, `document.querySelector('.startknop')?.click()`)
  const hub = await wachtOp(`document.querySelectorAll('.hub-tegel').length > 0`, 40)
  await wacht(1000)
  const melding = await js(hoofd, `document.body.innerText.match(/Vrij rijden gestopt[^\\n]*/)?.[0] ?? ''`)
  console.log(`gestopt: hoofdmenu ${Boolean(hub)}, "${melding}", overlay dicht: ${!overlay()}`)

  /* ---- 9. Hamburg109_2, omloop 66093, OMSI telt op vertrektijd ---- */
  let gesorteerd = true
  if (tweede) {
    const t2 = tweede.tours.find((t) => t.number === '66093')
    const opTijd = t2 ? [...t2.trips].sort((a, b) => a.departure - b.departure) : []
    if (t2 && opTijd[7]) {
      mem = { ...mem, schedActive: 0, line: -1, tour: -1, tourEntry: -1, trip: -1, lineName: '', tourName: '', tripName: '' }
      schrijfLive()
      const uit = await js(hoofd, `window.career.startFree({ mapFolder: '${TWEEDE}', vehiclePath: ${JSON.stringify(bus)} })`)
      await wacht(2500)
      const ttl2 = namen(tweede, '.ttl')
      const ttp2 = namen(tweede, '.ttp')
      await js(hoofd, `window.career.telefoonAanmelden('${NUMMER}', '${PINCODE}')`)
      /*
       * Eerst rit 6, LEE_UAL_M om 10:19: die staat in beide volgordes op die
       * plek, met een ander vervolg -- de app kiest de volgorde van het bestand,
       * onzeker. Dan rit 7 zoals OMSI hem op vertrektijd telt: 109_UAL_ZAL om
       * 10:23, terwijl in het bestand op plek 7 de leegrit van 12:44 staat. Dan
       * hoort het volgen de volgorde om te draaien.
       */
      const voor = koppelRegels().length
      kies({ ...keuzeVan(tweede, ttl2, ttp2, t2, opTijd[6]), tourEntry: 6 }, opTijd[6].departure)
      for (let i = 0; i < 60 && koppelRegels().length === voor; i++) await wacht(250)
      const zes = koppelRegels().slice(voor)[0] ?? ''
      kies({ ...keuzeVan(tweede, ttl2, ttp2, t2, opTijd[7]), tourEntry: 7 }, opTijd[7].departure)
      let regel = ''
      for (let i = 0; i < 60 && !regel; i++) {
        await wacht(250)
        regel = koppelRegels().slice(voor + 1)[0] ?? ''
      }
      const gecorrigeerd = logboek().some((r) => /volgorde gecorrigeerd bij rit #7/.test(r))
      gesorteerd = /koppeling index, bestand, onzeker/.test(zes) && gecorrigeerd && /koppeling vertrek/.test(regel) && /rit #7 109_ual_zal 10:23/.test(regel)
      console.log(`66093 bij rit 6: ${zes.slice(24, 330)}`)
      console.log(`66093 bij rit 7 (OMSI op vertrektijd): gecorrigeerd ${gecorrigeerd}, ${gesorteerd} -- ${regel.slice(24, 330)} (start: ${JSON.stringify(uit)})`)
      await wacht(1500)
      await overlayBeeld('vrij-overlay-66093.png')
      await js(hoofd, `window.career.stopFree()`)
      await wacht(800)
    } else console.log('66093 niet gevonden; overgeslagen')
  } else console.log(`${TWEEDE} niet geïnstalleerd; overgeslagen`)

  const spelmapGelijk = JSON.stringify(spelmapStand()) === JSON.stringify(spelmapVoor) && geweigerd.length === 0
  console.log(`spelmap onaangeroerd: ${spelmapGelijk}${geweigerd.length ? `; geweigerd: ${geweigerd.join(' | ')}` : ''}; omgeleid: ${[...new Set(omgeleid.map((r) => r.split(' ')[0]))].join(', ')}`)
  const fouten = meldingen.filter((m) => !/Electron Security Warning|willReadFrequently/.test(m))
  console.log('meldingen:', fouten.length ? fouten.map((m) => m.slice(0, 140)) : 'geen')

  const startRegel = logboek().reverse().find((r) => /vrij rijden: .*beginplek/.test(r)) ?? ''
  const checks = {
    voet: /vertrekken tot/.test(voetKaart || '') || /staat klaar bij/.test(voetKaart || ''),
    balk: balkGoed,
    wanneer: Boolean(wanneerDicht) && !wanneerDicht.open && /automatisch/.test(wanneerDicht.samen) && wanneerOpen.chips.some((c) => /Zoals de kaart/.test(c)),
    marker: Boolean(marker),
    busstap: Boolean(busstap),
    remise: /Remise|Depot/.test(remise.titel) && remise.tegels.some((t) => t.aan && (!heeftKaartHof || /rheinhausen/i.test(t.tekst))),
    wagenpark: (!heeftKaartHof || /rheinhausen/i.test(voorstel)) && (!voorstel || startRegels.some((r) => r.includes(`wagenpark ${voorstel}`))),
    rijscherm: Boolean(rijscherm) && /staat klaar/.test(voetStart),
    situatie: situatieGoed && startRegels.some((r) => /klaargezet: situatie/.test(r)),
    zegtHoe,
    suggesties: metSuggesties && rijschermStraks > 0,
    kaartwissel: wisselHeen && wisselTerug,
    gekoppeld: Boolean(eerste) && rijenEerst > 0 && /koppeling index/.test(eersteKoppeling) && kaartMet.kaart && !kaartMet.hint && kaartMet.balk,
    zonderOpnieuw,
    verloren,
    andereOmloop: Boolean(tweedeOmloop) && aangemeld && gevolgdRegels.length >= 2 && gevolgdRegels.every((r) => /IBIS lijn/.test(r)),
    chrono,
    gestopt: Boolean(hub) && Boolean(melding),
    gesorteerd,
    geboekt: !profiel().activeDuty && (profiel().entries?.length ?? 0) === logboekVoor,
    spelmap: spelmapGelijk,
    meldingen: fouten.length === 0
  }
  const mis = Object.entries(checks).filter(([, goed]) => !goed).map(([naam]) => naam)
  console.log(`  bij START: ${startRegel.slice(24, 260)}`)
  console.log(mis.length === 0 ? 'vrij rijden: kaart en bus, en de navigatie vindt wat OMSI rijdt' : `VRIJ RIJDEN KLOPT NIET: ${mis.join(', ')}`)
  stop(mis.length === 0 ? 0 : 1)
})
