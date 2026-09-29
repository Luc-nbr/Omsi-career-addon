/**
 * Elke lijn en elke halte één keer op de kaart: tellen en meten.
 *
 *   npx electron scripts/probe-lijneneenmaal.cjs [uitvoermap] [--uit=out-voor] [--naam=voor]
 *
 * Luc, over 0.4.8: "in vrij rijden gaat hij in de app alle lijnen tekenen dat
 * voor extreem veel lag zorgt, elke lijn wordt maximaal 1 keer getekend". Zijn
 * geval: Krefrath, lijn 51/52/53/E, omloop "Wagen 3" -- 26 ritten over een
 * handvol trajecten, en de kaart tekende ze alle 26 over elkaar.
 *
 * Deze proef zet precies dat geval neer, in de echte app met een eigen
 * gebruikersmap, terwijl "OMSI" draait (een eigen procesje) en de plugin een
 * live.json schrijft die de proef zelf maakt:
 * - vrij rijden op Krefrath, START (alleen de situatie, en die gaat naar een
 *   tijdelijke map), en in "OMSI" omloop Wagen 3 van Stadtzentrum.ttl om 11:50;
 * - op het rijscherm: hoeveel lijnen en punten er in de kaart staan, hoeveel
 *   haltebordjes en op hoeveel plekken, hoe lang `map:routes` duurde en hoe
 *   groot het antwoord was, en de beeldtijden bij het eerste tekenen, bij
 *   slepen en bij zoomen (echte muisinvoer via sendInputEvent);
 * - in de overlay: wat de navigatie tekent en welke routes hij vraagt, met de
 *   bus van "OMSI" op de route van de rit;
 * - de telefoon: hoe groot `api/routes` is, en wat de tablet tekent;
 * - `kaarten:vergeten`: het rijscherm vraagt zijn routes opnieuw en tekent
 *   daarna hetzelfde;
 * - en een dienst uit de dienstmodus, de langste die de lijst op Krefrath
 *   geeft, op dezelfde manier. Het toeval in de dienstenlijst ligt vast: de
 *   werkers krijgen een vaste reeks voor Math.random, zodat voor en na
 *   dezelfde dienst uitkomt.
 *
 * `--uit=<map>` laadt een andere bouw (bijvoorbeeld een kopie van `out` van
 * vóór een wijziging), `--naam` zet een voorvoegsel voor de plaatjes.
 *
 * VANGRAILS, zoals in probe-vrijrijden.cjs: niets schrijven onder de spelmap
 * (ook niet vanuit de werkers), het echte OMSI niet starten, en de situatie
 * die de app bij START schrijft gaat naar een tijdelijke map.
 */
const { app, BrowserWindow, ipcMain } = require('electron')
const { spawn } = require('node:child_process')
const { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, utimesSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const v8 = require('node:v8')
const http = require('node:http')

const argv = process.argv.slice(2)
const optie = (naam) => argv.find((a) => a.startsWith(`--${naam}=`))?.slice(naam.length + 3)
const uitvoer = argv.find((a) => !a.startsWith('-') && !a.endsWith('.cjs'))
if (uitvoer) mkdirSync(uitvoer, { recursive: true })
const bouw = resolve(__dirname, '..', optie('uit') ?? 'out')
const naam = optie('naam') ?? 'proef'
const KAART = 'Krefrath'
const LIJN = 'Stadtzentrum'
const OMLOOP = 'Wagen 3'
const VERTREK = 11 * 60 + 50
const NUMMER = '123456'
const PINCODE = '9876'
const POORT = 47931

/* Geen achtergrondremmen: de beeldtijden moeten van het tekenen komen, niet van Windows. */
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-background-timer-throttling')

/* ---- de gebruikersmap: een kopie, zonder openstaande dienst ---- */
const map = mkdtempSync(join(tmpdir(), 'omsi-lijnen-'))
const bron = join(process.env.APPDATA, 'omsi-enhancer')
cpSync(join(bron, 'settings.json'), join(map, 'settings.json'))
cpSync(join(bron, 'profiles'), join(map, 'profiles'), { recursive: true })
if (existsSync(join(bron, 'kaartcache'))) cpSync(join(bron, 'kaartcache'), join(map, 'kaartcache'), { recursive: true })
const inst = JSON.parse(readFileSync(join(map, 'settings.json'), 'utf8'))
inst.tourSeen = true
inst.language = 'nl'
inst.apparaatPoort = POORT
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

/* ---- de dienstregeling, om de omloop te kiezen zoals OMSI hem doorgeeft ---- */
const kernPad = join(mkdtempSync(join(tmpdir(), 'omsi-lijnen-kern-')), 'kern.cjs')
require('esbuild').buildSync({
  stdin: {
    contents:
      "export { loadMap } from './src/core/timetable'\nexport { readTileGrid } from './src/core/geo'\nexport { readTileList } from './src/core/track'",
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
const namen = (soort) =>
  readdirSync(join(kaart.path, 'TTData'))
    .filter((n) => n.toLowerCase().endsWith(soort))
    .map((n) => n.slice(0, -soort.length))
const ttl = namen('.ttl')
const ttp = namen('.ttp')
const omloop = kaart.tours.find((t) => t.lineFile === LIJN && t.number === OMLOOP)
const rit = omloop?.trips.find((e) => Math.round(e.departure) === VERTREK)
if (!omloop || !rit) {
  console.log(`omloop ${LIJN}/${OMLOOP} om ${VERTREK} niet gevonden; proef overgeslagen`)
  process.exit(0)
}
/* Het tegelraster, om de bus van "OMSI" op de route te zetten (tegel + plek op de tegel). */
const raster = kern.readTileGrid(kaart.path)
const tegels = kern.readTileList(kaart.path)

/* ---- "OMSI draait": een eigen procesje met een eigen naam ---- */
const nepMap = mkdtempSync(join(tmpdir(), 'omsi-lijnen-proces-'))
const nepExe = join(nepMap, 'OmsiNepProef.exe')
copyFileSync(join(process.env.SystemRoot || 'C:/Windows', 'System32', 'PING.EXE'), nepExe)
const nepOmsi = spawn(nepExe, ['-n', '900', '127.0.0.1'], { stdio: 'ignore', windowsHide: true })

const live = join(mkdtempSync(join(tmpdir(), 'omsi-lijnen-live-')), 'OMSI Career')
mkdirSync(live, { recursive: true })
process.env.OMSI_ENHANCER_LIVEMAP = live
process.env.OMSI_ENHANCER_APPARAAT_HOST = '127.0.0.1'
process.env.OMSI_ENHANCER_PROEFPROCES = 'OmsiNepProef'
app.setPath('userData', map)

/* ---- de vangrails, voordat de app geladen wordt ---- */
const spelmap = resolve(inst.omsiPath).toLowerCase()
const situaties = join(spelmap, 'situations').toLowerCase()
const omleiding = mkdtempSync(join(tmpdir(), 'omsi-lijnen-situaties-'))
const geweigerd = []
const inSpelmap = (pad) => typeof pad === 'string' && resolve(pad).toLowerCase().startsWith(spelmap)
const omleid = (pad) => {
  const vol = resolve(pad)
  return vol.toLowerCase().startsWith(situaties) ? join(omleiding, vol.slice(situaties.length)) : undefined
}
const SCHRIJVERS = {
  writeFileSync: 0, appendFileSync: 0, mkdirSync: 0, rmSync: 0, unlinkSync: 0, rmdirSync: 0,
  copyFileSync: 1, renameSync: 1, cpSync: 1, writeFile: 0, appendFile: 0, copyFile: 1, rename: 1,
  unlink: 0, mkdir: 0, rm: 0
}
{
  const echteFs = require('node:fs')
  const echtBestaat = echteFs.existsSync
  const ookDeBron = new Set(['renameSync', 'rename'])
  for (const [functie, plek] of Object.entries(SCHRIJVERS)) {
    const echt = echteFs[functie]
    if (typeof echt !== 'function') continue
    echteFs[functie] = function (...args) {
      for (const i of ookDeBron.has(functie) ? [0, plek] : [plek]) {
        const doel = String(args[i])
        if (!inSpelmap(doel)) continue
        const ander = omleid(doel)
        if (!ander) {
          geweigerd.push(`${functie} ${doel}`)
          throw new Error(`proef: niet schrijven in de spelmap (${functie} ${doel})`)
        }
        args[i] = ander
      }
      return echt.apply(this, args)
    }
  }
  for (const functie of ['readFileSync', 'existsSync', 'statSync']) {
    const echt = echteFs[functie]
    echteFs[functie] = function (pad, ...rest) {
      const ander = inSpelmap(String(pad)) ? omleid(String(pad)) : undefined
      return echt.call(this, ander && echtBestaat(ander) ? ander : pad, ...rest)
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
  for (const functie of ['spawn', 'execFile', 'execFileSync', 'exec', 'execSync', 'spawnSync']) {
    const echt = kinderen[functie]
    kinderen[functie] = function (commando, ...args) {
      const alles = [String(commando), ...(Array.isArray(args[0]) ? args[0].map(String) : [])].join(' ').toLowerCase()
      const start = /omsi\.exe/.test(alles) && !/^tasklist/.test(String(commando).toLowerCase())
      if (start || alles.includes(spelmap)) {
        geweigerd.push(`${functie} ${alles.slice(0, 120)}`)
        throw new Error(`proef: het echte OMSI niet starten (${alles.slice(0, 80)})`)
      }
      return echt.call(this, commando, ...args)
    }
  }
}

/*
 * De werkers: dezelfde vangrail op hun eigen `fs` (een worker_thread heeft er
 * een eigen), en een vaste reeks voor Math.random -- de dienstenlijst is een
 * toevallige wandeling door de dienstregeling, en voor en na horen dezelfde
 * dienst te meten.
 */
{
  const wt = require('node:worker_threads')
  const EchteWerker = wt.Worker
  wt.Worker = class extends EchteWerker {
    constructor(bestand, opties = {}) {
      const code = `
        let s = 20260929
        Math.random = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
        const fs = require('node:fs')
        const { resolve } = require('node:path')
        const spelmap = ${JSON.stringify(spelmap)}
        const binnen = (p) => typeof p === 'string' && resolve(p).toLowerCase().startsWith(spelmap)
        for (const [f, plek] of Object.entries(${JSON.stringify(SCHRIJVERS)})) {
          const echt = fs[f]
          if (typeof echt !== 'function') continue
          fs[f] = function (...a) { if (binnen(String(a[plek]))) throw new Error('proef: werker schrijft niet in de spelmap (' + f + ')'); return echt.apply(this, a) }
        }
        require(${JSON.stringify(String(bestand))})
      `
      super(code, { ...opties, eval: true })
    }
  }
}

/* ---- map:routes meten, voordat de app zijn vragen aanmeldt ---- */
const routeVragen = []
{
  const echtHandle = ipcMain.handle.bind(ipcMain)
  ipcMain.handle = (kanaal, doen) =>
    echtHandle(
      kanaal,
      kanaal !== 'map:routes'
        ? doen
        : async (event, ...args) => {
            const begin = performance.now()
            const uit = await doen(event, ...args)
            const ms = performance.now() - begin
            routeVragen.push({ ms, van: /overlay/.test(event.sender.getURL()) ? 'overlay' : 'hoofd', legs: args[1] ?? [], uit })
            return uit
          }
    )
}

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
}, 600000).unref()
require(join(bouw, 'main', 'index.js'))
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

/* ---- de plugin ---- */
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

/* ---- rekenhulp ---- */
const pct = (lijst, p) => {
  if (lijst.length === 0) return 0
  const s = [...lijst].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]
}
const r1 = (x) => Math.round(x * 10) / 10
/** Een vingerafdruk van een route: de getallen zelf, op een decimeter. */
const afdruk = (route) => {
  let h = 2166136261
  const punten = route?.points ?? []
  for (let i = 0; i < punten.length; i++) {
    h ^= Math.round(punten[i] * 10)
    h = Math.imul(h, 16777619)
  }
  return `${punten.length}:${(h >>> 0).toString(16)}:${(route?.guessed ?? []).map((g) => (g ? 1 : 0)).join('')}`
}
/** Wat een vraag om routes kostte en opleverde. */
const vatSamen = (vraag) => {
  const sleutels = vraag.legs.map((l) => `${l.tripFile}|${l.stopIds.join(',')}`)
  return {
    van: vraag.van,
    ms: Math.round(vraag.ms),
    ritten: vraag.legs.length,
    ritsleutels: new Set(sleutels).size,
    trajecten: new Set(vraag.uit.map(afdruk)).size,
    punten: vraag.uit.reduce((s, r) => s + (r?.points?.length ?? 0) / 2, 0),
    kb: Math.round(v8.serialize(vraag.uit).length / 1024),
    jsonKb: Math.round(JSON.stringify(vraag.uit).length / 1024)
  }
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
  hoofd.setSize(1800, 960)
  hoofd.center()
  process.on('unhandledRejection', async (fout) => {
    console.log('fout in de proef:', String(fout).slice(0, 300))
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
  const beeld = async (bestand) => {
    if (!uitvoer) return
    hoofd.showInactive()
    await wacht(300)
    writeFileSync(join(uitvoer, bestand), (await hoofd.webContents.capturePage()).toPNG())
  }

  /* Wat er in een kaart staat: lijnen, punten, bordjes en de plekken van die bordjes. */
  const telKaart = (w, kies) =>
    js(
      w,
      `(() => {
        const svg = document.querySelector(${JSON.stringify(kies)})
        if (!svg) return null
        const lijnen = [...svg.querySelectorAll('polyline, path.route-line, path.route-casing, path.route-guess')]
        // Een polyline telt zijn punten, een pad zijn M- en L-opdrachten.
        const punten = lijnen.reduce((s, p) => s + (p.points ? p.points.numberOfItems : ((p.getAttribute('d') || '').match(/[ML]/g) || []).length), 0)
        const borden = [...svg.querySelectorAll('.stop-sign')]
        const plek = (b) => { const c = b.querySelector('.sign-face'); return Math.round(c.cx.baseVal.value) + ',' + Math.round(c.cy.baseVal.value) }
        return {
          lijnen: lijnen.length,
          routelijnen: svg.querySelectorAll('.route-line').length,
          omranding: svg.querySelectorAll('.route-casing').length,
          gok: svg.querySelectorAll('.route-guess').length,
          flauw: svg.querySelectorAll('.route-other .route-line').length,
          punten,
          borden: borden.length,
          bordplekken: new Set(borden.map(plek)).size,
          elementen: svg.querySelectorAll('*').length
        }
      })()`
    )

  /* Beeldtijden: de tijd tussen twee beelden, en de lange taken ernaast. */
  const startBeelden = (w) =>
    js(
      w,
      `(() => {
        const b = (window.__beelden = { lijst: [], lang: [], loopt: true })
        try {
          b.po = new PerformanceObserver((l) => { for (const e of l.getEntries()) b.lang.push(e.duration) })
          b.po.observe({ type: 'longtask' })
        } catch {}
        let vorig
        const tel = (nu) => { if (vorig !== undefined) b.lijst.push(nu - vorig); vorig = nu; if (b.loopt) requestAnimationFrame(tel) }
        requestAnimationFrame(tel)
        return true
      })()`
    )
  const stopBeelden = async (w) => {
    const uit = await js(
      w,
      `(() => { const b = window.__beelden; b.loopt = false; b.po?.disconnect(); return { lijst: b.lijst, lang: b.lang } })()`
    )
    const l = uit.lijst.slice(1)
    return {
      beelden: l.length,
      p50: r1(pct(l, 50)),
      p95: r1(pct(l, 95)),
      max: r1(Math.max(0, ...l)),
      boven16: l.filter((d) => d > 16.7).length,
      lang: uit.lang.length,
      langSom: Math.round(uit.lang.reduce((a, b) => a + b, 0))
    }
  }

  /* Slepen en zoomen met echte muisinvoer, midden op de kaart. */
  const schuifEnZoom = async (kies) => {
    const r = await js(hoofd, `(() => { const r = document.querySelector(${JSON.stringify(kies)}).getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } })()`)
    const invoer = (e) => hoofd.webContents.sendInputEvent(e)
    await startBeelden(hoofd)
    await wacht(600)
    const stil = await stopBeelden(hoofd)
    await startBeelden(hoofd)
    invoer({ type: 'mouseMove', x: r.x, y: r.y })
    invoer({ type: 'mouseDown', x: r.x, y: r.y, button: 'left', clickCount: 1 })
    for (let i = 1; i <= 150; i++) {
      invoer({ type: 'mouseMove', x: Math.round(r.x + Math.sin(i / 9) * 220), y: Math.round(r.y + Math.cos(i / 13) * 120), button: 'left', modifiers: ['leftButtonDown'] })
      await wacht(8)
    }
    invoer({ type: 'mouseUp', x: r.x, y: r.y, button: 'left', clickCount: 1 })
    await wacht(100)
    const slepen = await stopBeelden(hoofd)
    await wacht(400)
    await startBeelden(hoofd)
    for (let i = 0; i < 40; i++) {
      invoer({ type: 'mouseWheel', x: r.x, y: r.y, deltaX: 0, deltaY: i < 20 ? -60 : 60, canScroll: true })
      await wacht(20)
    }
    await wacht(400)
    const zoomen = await stopBeelden(hoofd)
    return { stil, slepen, zoomen }
  }

  /* Wachten tot de kaart niet meer verandert: dezelfde telling een seconde lang. */
  const wachtOpRust = async (w, kies, keer = 40) => {
    let vorige = ''
    let gelijk = 0
    for (let i = 0; i < keer; i++) {
      const nu = JSON.stringify(await telKaart(w, kies))
      if (nu === vorige && nu !== 'null') gelijk++
      else gelijk = 0
      if (gelijk >= 4) return JSON.parse(nu)
      vorige = nu
      await wacht(250)
    }
    return JSON.parse(vorige || 'null')
  }

  schrijfLive()
  setInterval(() => {
    const nu = new Date()
    try {
      utimesSync(join(live, 'live.json'), nu, nu)
    } catch {
      // Tussen twee keer schrijven.
    }
  }, 2000).unref()

  /* ---- 1. Vrij rijden, Krefrath, START ---- */
  await wachtOp(`document.querySelectorAll('.hub-tegel').length > 0 || /Wie rijdt er vandaag|Who is driving/.test(document.body.innerText)`)
  for (let poging = 0; poging < 4; poging++) {
    const waar = await js(hoofd, `document.querySelector('.hub-tegel') ? 'hub' : /Wie rijdt er vandaag|Who is driving/.test(document.body.innerText) ? 'chauffeurs' : 'anders'`)
    if (waar === 'hub') await js(hoofd, `document.querySelector(".hub-tegel[data-modus='free']")?.click()`)
    else if (waar === 'chauffeurs') await js(hoofd, `document.querySelector('.startknop')?.click()`)
    else break
    await wacht(1200)
  }
  await js(hoofd, `[...document.querySelectorAll('.weergavekeuze button')][0]?.click()`)
  await wacht(400)
  await wachtOp(`[...document.querySelectorAll('.dienstrij, .tegel')].some((r) => r.textContent.includes('${KAART}'))`)
  await js(hoofd, `[...document.querySelectorAll('.dienstrij, .tegel')].find((r) => r.textContent.includes('${KAART}'))?.click()`)
  await wachtOp(`/staat klaar bij/.test(document.querySelector('.velvoet')?.textContent ?? '')`, 120)
  await js(hoofd, `document.querySelector('.vrij-wanneer > summary')?.click()`)
  await wacht(500)
  const iso = await js(hoofd, `document.querySelector('.vrij-wanneer input[type=date]')?.value ?? ''`)
  await js(hoofd, `document.querySelector('.vrij-wanneer > summary')?.click()`)
  const [jaar, maand, dag] = iso.split('-').map(Number)
  if (jaar) datum = { year: jaar, month: maand, day: dag }
  await js(hoofd, `document.querySelector('.startknop')?.click()`)
  await wachtOp(`document.querySelector('.stap[data-stand="nu"]')?.textContent?.match(/Bus/i) && document.querySelector('.startknop')?.textContent?.match(/START/i)`, 60)
  await wacht(500)
  if (!(await js(hoofd, `window.career.omsiRunning()`))) {
    console.log('de app ziet "OMSI" niet draaien; NIET op START gedrukt')
    stop(1)
    return
  }
  for (let i = 0; i < 6; i++) {
    if (await js(hoofd, `/Remise|Depot/.test(document.querySelector('h1, h2')?.textContent ?? '')`)) break
    await js(hoofd, `(document.querySelector('.tegel[aria-pressed=true]') ?? document.querySelector('.tegel'))?.click()`)
    await wacht(900)
  }
  await js(hoofd, `document.querySelector('.startknop')?.click()`)
  if (!(await wachtOp(`/Vrij rijden stoppen|Stop free play/i.test(document.body.innerText)`, 60))) {
    console.log('geen rijscherm van vrij rijden')
    stop(1)
    return
  }
  for (let i = 0; i < 20 && !overlay(); i++) await wacht(250)
  await wacht(1500)
  await js(hoofd, `window.career.telefoonAanmelden('${NUMMER}', '${PINCODE}')`)
  await wacht(1500)

  /* ---- 2. In "OMSI": Wagen 3 om 11:50 ---- */
  const KIES = '.setup-kaart .route-canvas'
  const vragenVoor = routeVragen.length
  await startBeelden(hoofd)
  klok = VERTREK * 60
  mem = {
    ...mem,
    schedActive: 1,
    line: ttl.indexOf(omloop.lineFile),
    lines: ttl.length,
    tour: omloop.index,
    tourEntry: rit.entry,
    trip: ttp.findIndex((n) => n.toLowerCase() === rit.tripFile.toLowerCase()),
    lineName: omloop.lineFile,
    tourName: omloop.number,
    tripName: rit.tripFile
  }
  schrijfLive()
  const gevolgd = await wachtOp(`/Je rijdt lijn/.test(document.body.innerText) && Boolean(document.querySelector('.vrij-omloop'))`, 80)
  for (let i = 0; i < 80 && !routeVragen.slice(vragenVoor).some((v) => v.van === 'hoofd'); i++) await wacht(100)
  const kaartTelling = await wachtOpRust(hoofd, KIES)
  await wacht(1200)
  const eersteTekening = await stopBeelden(hoofd)
  const kop = await js(hoofd, `document.querySelector('.vrij-omloop .dienstuitleg-kop')?.textContent ?? ''`)
  const rittenLinks = await js(hoofd, `document.querySelectorAll('.vrij-omloop .dienstuitleg-ritten > li').length`)
  await beeld(`${naam}.png`)
  const vrijBeelden = await schuifEnZoom(KIES)

  /*
   * Ontleden (PROEF_ONTLEED=1): hetzelfde slepen met telkens één laag van de
   * kaart verborgen, om te zien waar de beeldtijd zit.
   */
  const ontleed = {}
  if (process.env.PROEF_ONTLEED) {
    for (const [laag, css] of Object.entries({
      zonderBorden: '.setup-kaart .stop-sign { display: none }',
      zonderRoutes: '.setup-kaart .route-casing, .setup-kaart .route-line, .setup-kaart .route-guess { display: none }',
      zonderNamen: '.setup-kaart .map-label { display: none }',
      zonderWegen: '.setup-kaart .route-roads { display: none }'
    })) {
      await js(hoofd, `(() => { const s = document.createElement('style'); s.id = 'proefverberg'; s.textContent = ${JSON.stringify(css)}; document.head.appendChild(s) })()`)
      await wacht(300)
      ontleed[laag] = (await schuifEnZoom(KIES)).slepen
      await js(hoofd, `document.getElementById('proefverberg')?.remove()`)
    }
  }

  const hoofdVragen = routeVragen.slice(vragenVoor).filter((v) => v.van === 'hoofd').map(vatSamen)
  const overlayVragen = routeVragen.slice(vragenVoor).filter((v) => v.van === 'overlay').map(vatSamen)

  /*
   * De bus op de route van de rit die "OMSI" rijdt, een paar stappen van 12 m
   * op een derde van de rit. Stond hij op tegel 0, dan volgde de navigatie in
   * de overlay en op de tablet een bus ver buiten de route, en telde de nieuwe
   * bouw daar 0 punten (alles buiten beeld weggeknipt) tegen 2.090 van de oude
   * -- dat zei niets over wat je bij het rijden ziet.
   */
  let busOpRoute = false
  {
    let route
    for (const v of routeVragen) {
      v.legs.forEach((leg, i) => {
        if (!route && leg.tripFile.toLowerCase() === rit.tripFile.toLowerCase() && v.uit[i]?.points?.length >= 8) route = v.uit[i]
      })
    }
    if (route && raster) {
      const p = route.points
      const tot = [0]
      for (let i = 2; i < p.length; i += 2) tot.push(tot[tot.length - 1] + Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]))
      const opAfstand = (a) => {
        let k = 1
        while (k < tot.length - 1 && tot[k] < a) k++
        const t = tot[k] > tot[k - 1] ? (a - tot[k - 1]) / (tot[k] - tot[k - 1]) : 0
        return { x: p[(k - 1) * 2] + (p[k * 2] - p[(k - 1) * 2]) * t, y: p[(k - 1) * 2 + 1] + (p[k * 2 + 1] - p[(k - 1) * 2 + 1]) * t }
      }
      const tegelNr = new Map(tegels.map((t, i) => [`${t.tx},${t.ty}`, i]))
      const begin = tot[tot.length - 1] / 3
      for (let stap = 0; stap < 8; stap++) {
        const { x, y } = opAfstand(begin + stap * 12)
        const plek = raster.at(x, y)
        const tile = tegelNr.get(`${plek.tx},${plek.ty}`)
        if (tile === undefined) break
        const verder = opAfstand(begin + stap * 12 + 5)
        const richting = Math.atan2(verder.x - x, verder.y - y)
        mem = { ...mem, tile, x: plek.localX, y: 0, z: plek.localZ, qx: 0, qy: Math.sin(richting / 2), qz: 0, qw: Math.cos(richting / 2) }
        klok += 2
        schrijfLive()
        busOpRoute = true
        await wacht(500)
      }
      await wacht(2500)
    }
  }
  const overlayTelling = overlay() ? await telKaart(overlay(), '.nav-wrap .route-canvas') : null

  /* De telefoon: wat `api/routes` over het netwerk stuurt. */
  let telefoon = null
  let tabletKaart = null
  try {
    const stand = await js(hoofd, `window.career.apparaatStart()`)
    await wacht(800)
    /*
     * De pagina zelf, zoals een tablet hem opent: die zet de routes per rit
     * terug uit wat de server stuurt (apparaat.tsx). Zichtbaar achter de rest,
     * zie probe-overlayscherm.cjs waarom.
     */
    if (stand?.url) {
      const tablet = new BrowserWindow({ width: 1194, height: 834, show: false, webPreferences: { backgroundThrottling: false } })
      tablet.showInactive = BrowserWindow.prototype.showInactive
      tablet.showInactive()
      await tablet.loadURL(stand.url)
      for (let i = 0; i < 40; i++) {
        await wacht(250)
        tabletKaart = await telKaart(tablet, '.route-canvas')
        if (tabletKaart?.routelijnen > 0) break
      }
      await wacht(800)
      tabletKaart = await telKaart(tablet, '.route-canvas')
      tablet.destroy()
    }
    const instNu = JSON.parse(readFileSync(join(map, 'settings.json'), 'utf8'))
    const pad = `/n/${instNu.apparaatSleutel}/api/routes`
    const lees = () =>
      new Promise((klaar, fout) => {
        const begin = performance.now()
        http
          .get({ host: '127.0.0.1', port: instNu.apparaatPoort, path: pad }, (antwoord) => {
            const stukken = []
            antwoord.on('data', (s) => stukken.push(s))
            antwoord.on('end', () => klaar({ ms: Math.round(performance.now() - begin), tekst: Buffer.concat(stukken).toString('utf8') }))
          })
          .on('error', fout)
      })
    const { ms, tekst } = await lees()
    const json = JSON.parse(tekst)
    // Voor: een rij routes per rit. Na: elk traject één keer, met zijn sleutel.
    const lijst = Array.isArray(json) ? json : (json?.routes ?? []).map((r) => r.route)
    telefoon = { ms, kb: Math.round(tekst.length / 1024), routes: lijst.length, trajecten: new Set(lijst.map(afdruk)).size }
    await js(hoofd, `window.career.apparaatStop()`)
  } catch (fout) {
    telefoon = { fout: String(fout).slice(0, 120) }
  }

  console.log(`\n== VRIJ RIJDEN, ${KAART} ${LIJN}/${OMLOOP} om 11:50 ==`)
  console.log(`gevolgd: ${Boolean(gevolgd)}; kop links "${kop}"; ${rittenLinks} ritten in de lijst links`)
  console.log(`kaart: ${JSON.stringify(kaartTelling)}`)
  for (const v of hoofdVragen) console.log(`routes (hoofdvenster): ${JSON.stringify(v)}`)
  for (const v of overlayVragen) console.log(`routes (overlay): ${JSON.stringify(v)}`)
  console.log(`bus op de route: ${busOpRoute}`)
  console.log(`overlay-kaart: ${JSON.stringify(overlayTelling)}`)
  console.log(`telefoon api/routes: ${JSON.stringify(telefoon)}`)
  console.log(`tablet-kaart: ${JSON.stringify(tabletKaart)}`)
  console.log(`eerste tekening: ${JSON.stringify(eersteTekening)}`)
  console.log(`stil: ${JSON.stringify(vrijBeelden.stil)}`)
  console.log(`slepen: ${JSON.stringify(vrijBeelden.slepen)}`)
  console.log(`zoomen: ${JSON.stringify(vrijBeelden.zoomen)}`)
  for (const [laag, uit] of Object.entries(ontleed)) console.log(`slepen ${laag}: ${JSON.stringify(uit)}`)

  /*
   * Het hoofdproces vergat de kaarten (andere OMSI-map, nakijken, add-on): het
   * venster hoort `kaarten:vergeten`, leegt zijn routes (trajecten.ts) en vraagt
   * ze opnieuw. Daarna hoort dezelfde kaart er weer te staan.
   */
  const voorVergeten = await wachtOpRust(hoofd, KIES)
  const vragenVoorVergeten = routeVragen.length
  hoofd.webContents.send('kaarten:vergeten')
  for (let i = 0; i < 40 && !routeVragen.slice(vragenVoorVergeten).some((v) => v.van === 'hoofd'); i++) await wacht(100)
  const naVergeten = await wachtOpRust(hoofd, KIES)
  const opnieuwGevraagd = routeVragen.slice(vragenVoorVergeten).filter((v) => v.van === 'hoofd')
  console.log(
    `kaarten:vergeten: ${opnieuwGevraagd.length} nieuwe vraag van het hoofdvenster (${opnieuwGevraagd.reduce((s, v) => s + v.legs.length, 0)} ritten); ` +
      `kaart daarna gelijk: ${JSON.stringify(naVergeten) === JSON.stringify(voorVergeten)} ${JSON.stringify(naVergeten)}`
  )

  /* ---- 3. Stoppen, en een dienst uit de dienstmodus ---- */
  /*
   * De bus weer naar tegel 0: staat de bus van OMSI op de kaart, dan past de
   * dienstkaart zich niet opnieuw in, en dan meet de dienst hieronder een ander
   * beeld dan de vorige bouw (dat gedrag is ouder dan deze proef).
   */
  mem = { ...mem, tile: 0, x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 }
  schrijfLive()
  await wacht(1500)
  await js(hoofd, `document.querySelector('.startknop')?.click()`)
  await wachtOp(`document.querySelectorAll('.hub-tegel').length > 0`, 40)
  await wacht(800)
  await js(hoofd, `document.querySelector(".hub-tegel[data-modus='service']")?.click()`)
  await wacht(1200)
  await js(hoofd, `[...document.querySelectorAll('.weergavekeuze button')][0]?.click()`)
  await wacht(400)
  await wachtOp(`[...document.querySelectorAll('.dienstrij, .tegel')].some((r) => r.textContent.includes('${KAART}'))`)
  await js(hoofd, `[...document.querySelectorAll('.dienstrij, .tegel')].find((r) => r.textContent.includes('${KAART}'))?.click()`)
  await wacht(800)
  await js(hoofd, `document.querySelector('.startknop')?.click()`)
  await wachtOp(`Boolean(document.querySelector('#dienstlengte'))`, 80)
  await js(
    hoofd,
    `(() => { const i = document.querySelector('#dienstlengte')
       Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, i.max)
       i.dispatchEvent(new Event('input', { bubbles: true })) })()`
  )
  await wacht(300)
  await js(hoofd, `document.querySelectorAll('.regelaar-chips button')[0]?.click()`)
  await wacht(2500)
  await wachtOp(`document.querySelectorAll('.dienstrij').length > 0`, 120)
  await wacht(1500)
  const rijen = await js(hoofd, `document.querySelectorAll('.dienstrij').length`)
  let beste = { index: -1, ritten: 0, kop: '' }
  for (let i = 0; i < rijen; i++) {
    await js(hoofd, `document.querySelectorAll('.dienstrij')[${i}]?.click()`)
    await wacht(350)
    const kopDienst = await js(hoofd, `document.querySelector('.dienstuitleg-kop')?.textContent ?? ''`)
    const ritten = Number((kopDienst.match(/^(\d+)/) ?? [])[1] ?? 0)
    if (ritten > beste.ritten) beste = { index: i, ritten, kop: kopDienst }
  }
  let dienst = null
  if (beste.index >= 0) {
    /* Eerst een andere regel, zodat de gekozen dienst vers op de kaart komt. */
    await js(hoofd, `document.querySelectorAll('.dienstrij')[${beste.index === 0 ? 1 : 0}]?.click()`)
    await wacht(1500)
    const voor = routeVragen.length
    await startBeelden(hoofd)
    await js(hoofd, `document.querySelectorAll('.dienstrij')[${beste.index}]?.click()`)
    for (let i = 0; i < 80 && routeVragen.length === voor; i++) await wacht(100)
    const telling = await wachtOpRust(hoofd, KIES)
    await wacht(1200)
    const eerste = await stopBeelden(hoofd)
    const tijden = await js(hoofd, `[...document.querySelectorAll('.dienstrij')][${beste.index}]?.textContent ?? ''`)
    await beeld(`${naam}-dienst.png`)
    const beelden = await schuifEnZoom(KIES)
    dienst = { tijden, kop: beste.kop, telling, vragen: routeVragen.slice(voor).map(vatSamen), eerste, ...beelden }
  }
  console.log(`\n== DIENST, ${KAART}, de langste van ${rijen} ==`)
  if (dienst) {
    console.log(`dienst "${dienst.tijden}"; kop "${dienst.kop}"`)
    console.log(`kaart: ${JSON.stringify(dienst.telling)}`)
    for (const v of dienst.vragen) console.log(`routes: ${JSON.stringify(v)}`)
    console.log(`eerste tekening: ${JSON.stringify(dienst.eerste)}`)
    console.log(`slepen: ${JSON.stringify(dienst.slepen)}`)
    console.log(`zoomen: ${JSON.stringify(dienst.zoomen)}`)
  } else console.log('geen dienst gevonden')

  const fouten = meldingen.filter((m) => !/Electron Security Warning|willReadFrequently/.test(m))
  console.log(`\nspelmap: ${geweigerd.length ? `GEWEIGERD ${geweigerd.join(' | ')}` : 'niets geweigerd'}`)
  console.log('meldingen:', fouten.length ? fouten.map((m) => m.slice(0, 160)) : 'geen')
  stop(0)
})
