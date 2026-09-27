/**
 * Vrij rijden: kaart, beginpunt en bus in de app, de omloop in OMSI, en een
 * overlay die volgt wat je daar kiest.
 *
 *   npx electron scripts/probe-vrijrijden.cjs [uitvoermap]
 *
 * Luc: "Vrij rijden modus moet helemaal geen dienst genereren, de speler kiest
 * in omsi een omloop en de overlay detecteert dat, in vrije modus kiest de
 * speler enkel een kaart, beginpunt en bus."
 *
 * Nagelopen in de echte app, met echte klikken, terwijl "OMSI" al draait:
 * - Vrij rijden -> Rheinhausen -> de stap erna is het beginpunt (haltes), geen
 *   lijnen en geen diensten; de balk heeft geen lijnstap;
 * - een halte kiezen -> bus -> START: er komt niets in het profiel, er wordt
 *   niets klaargezet (OMSI draait al), en het rijscherm van vrij rijden staat;
 * - de overlay gaat open en zegt, zolang er geen omloop is, hoe je die in OMSI
 *   kiest;
 * - OMSI zegt dat er een omloop gekozen is: de overlay en het rijscherm krijgen
 *   die omloop, vanaf de gekozen rit, met IBIS-codes; aanmelden blijft staan en
 *   er valt niets te aanvaarden;
 * - OMSI zegt dat er een ANDERE omloop gekozen is: alles gaat mee;
 * - "Vrij rijden stoppen": terug naar het hoofdmenu, overlay dicht, niets
 *   geboekt.
 *
 * Wat hier NIET nagelopen wordt: starten terwijl OMSI dicht is. Dan schrijft de
 * app een situatie in de spelmap en start hij het spel, en dat hoort een proef
 * niet te doen (zie hieronder).
 *
 * VANGRAILS. De eerste versie van deze proef, 27-09, heeft het echte OMSI
 * gestart en een situatie in de spelmap gezet: de app zocht bij "draait OMSI?"
 * op de busstap nog vast naar Omsi.exe in plaats van naar het procesje van de
 * proef. Dat is in de app rechtgezet (OMSI_PROCES in main/index.ts), maar een
 * proef die de echte spelmap leest mag daar nooit op hoeven vertrouwen. Daarom
 * weigert dit script, voordat de app geladen wordt, elke schrijfactie onder de
 * spelmap en elk programma dat Omsi.exe start -- en drukt het pas op START als
 * de app zelf zegt dat "OMSI" draait.
 */
const { app, BrowserWindow, ipcMain } = require('electron')
const { spawn } = require('node:child_process')
const { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, utimesSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')

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

/* ---- de dienstregeling van de kaart, om omlopen te kunnen kiezen zoals OMSI ---- */
const kernPad = join(mkdtempSync(join(tmpdir(), 'omsi-vrij-kern-')), 'kern.cjs')
require('esbuild').buildSync({
  stdin: {
    contents: "export { loadMap } from './src/core/timetable'; export { buildNetwork } from './src/core/duty'",
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
const ritten = [...kern.buildNetwork(kaart).departingFrom.values()]
  .flat()
  .sort((a, b) => a.departure - b.departure)
const eersteOmloop = ritten.find((run) => run.departure > 7 * 60)
const andereOmloop = ritten.find(
  (run) =>
    run.departure > 9 * 60 &&
    (run.tourNumber !== eersteOmloop.tourNumber || run.lineFile !== eersteOmloop.lineFile)
)

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

/* Niets in de spelmap: wat er voor de proef stond, staat er na de proef nog. */
const spelmapStand = () => {
  const uit = {}
  for (const naam of ['options.cfg', join('Inputs', 'keyboard.cfg'), join('maps', KAART, 'laststn.osn')]) {
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

/* ---- de plugin: een live.json die de proef zelf schrijft ---- */
let mem = {
  ok: 1, tile: 0, x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1, schedActive: 0, line: 0, tour: 0,
  tourEntry: 0, trip: 0, nextIndex: 0, nextDist: 0, delay: 0, lineName: '', tourName: '', tripName: '', nextStop: ''
}
let klok = 7 * 3600
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
const kies = (run) => {
  klok = run.departure * 60
  mem = { ...mem, schedActive: 1, lineName: run.lineFile, tourName: run.tourNumber, tripName: `TTData\\${run.tripFile}.ttp` }
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
  const beeld = async (naam) => {
    if (uitvoer) writeFileSync(join(uitvoer, naam), (await hoofd.webContents.capturePage()).toPNG())
  }

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
  await wachtOp(`[...document.querySelectorAll('.dienstrij, .tegel')].some((r) => r.textContent.includes('${KAART}'))`)
  await js(hoofd, `[...document.querySelectorAll('.dienstrij, .tegel')].find((r) => r.textContent.includes('${KAART}'))?.click()`)
  await wacht(400)
  await js(hoofd, `document.querySelector('.startknop')?.click()`)

  /* ---- 2. Het beginpunt ---- */
  const haltes = await wachtOp(`(() => { const r = [...document.querySelectorAll('.dienstrij')]; return /Beginpunt|Starting point/.test(document.body.innerText) && r.length > 5 ? r.length : 0 })()`, 80)
  const geenDiensten = await js(hoofd, `document.querySelectorAll('.regelaar').length === 0`)
  /* De stappenbalk zelf: de uitleg op het vel noemt de lijn wel, de balk niet. */
  const balkTekst = (await js(hoofd, `document.querySelector('.stappen')?.innerText ?? ''`)).toUpperCase()
  const zonderLijnstap = !/\bLIJN\b/.test(balkTekst) && /BEGINPUNT/.test(balkTekst)
  await js(hoofd, `(() => { const r = [...document.querySelectorAll('.dienstrij')]; (r.find((x) => /Hauptbahnhof|Markt|Rathaus/.test(x.textContent)) ?? r[3]).click(); return true })()`)
  await wacht(300)
  const gekozenHalte = await js(hoofd, `document.querySelector('.dienstrij[aria-pressed=true] .dienstnaam')?.textContent ?? ''`)
  console.log(`beginpunt: ${haltes} haltes, gekozen "${gekozenHalte}"; geen dienstregelaars: ${geenDiensten}; balk zonder lijnstap: ${zonderLijnstap}`)
  await wacht(1500)
  await beeld('vrij-beginpunt.png')
  await js(hoofd, `document.querySelector('.startknop')?.click()`)

  /* ---- 3. De bus, en START terwijl "OMSI" draait ---- */
  await wachtOp(`document.querySelector('.startknop')?.textContent?.match(/START/i)`, 60)
  await wacht(500)
  if (!(await js(hoofd, `window.career.omsiRunning()`))) {
    console.log('de app ziet "OMSI" niet draaien; NIET op START gedrukt')
    stop(1)
    return
  }
  await js(hoofd, `document.querySelector('.startknop')?.click()`)
  /* innerText volgt text-transform: de startknop staat in hoofdletters. */
  const rijscherm = await wachtOp(`/Vrij rijden stoppen|Stop free play/i.test(document.body.innerText)`, 60)
  await wacht(500)
  const voetStart = await js(hoofd, `document.querySelector('.velvoet')?.textContent ?? ''`)
  const geenDienstInProfiel = !profiel().activeDuty
  console.log(`rijscherm van vrij rijden: ${Boolean(rijscherm)}; voet "${voetStart.slice(0, 90)}"; niets in het profiel: ${geenDienstInProfiel}`)

  /* ---- 4. De overlay, zonder omloop ---- */
  for (let i = 0; i < 20 && !overlay(); i++) await wacht(250)
  await wacht(1500)
  /* Aanmelden, zoals op de telefoon; daarvoor staat het cijferblok voor alles. */
  await js(hoofd, `window.career.telefoonAanmelden('${NUMMER}', '${PINCODE}')`)
  await wacht(1500)
  const zonderOmloop = await overlayTekst()
  const zegtHoe = /dienstregelingsmenu|timetable menu/i.test(zonderOmloop)
  console.log(`overlay open: ${Boolean(overlay())}; zegt hoe je een omloop kiest: ${zegtHoe}`)
  await beeld('vrij-zonder-omloop.png')

  /* ---- 5. OMSI: een omloop gekozen ---- */
  kies(eersteOmloop)
  const eerste = await wachtOp(`/Je rijdt lijn|You drive line/.test(document.body.innerText)`, 40)
  await wacht(1200)
  /* Het aantal tijden in het overzicht: elke rit heeft er een, met een dubbele punt. */
  const rijenEerst = await js(hoofd, `(document.querySelector('.vrij-omloop')?.innerText ?? '').split(':').length - 1`)
  const aangemeld1 = overlay() ? await js(overlay(), `!document.querySelector('.aanmelden') && !document.querySelector('.opdracht')`) : false
  console.log(
    `omloop ${eersteOmloop.lineFile}/${eersteOmloop.tourNumber} vanaf ${eersteOmloop.tripFile}: ` +
      `rijscherm ${Boolean(eerste)}, ${rijenEerst} tijden in het overzicht; aangemeld zonder opdracht: ${aangemeld1}`
  )
  await beeld('vrij-omloop.png')

  /* ---- 6. OMSI: een andere omloop ---- */
  kies(andereOmloop)
  const tweede = await wachtOp(`document.body.innerText.includes('omloop ${andereOmloop.tourNumber}')`, 40)
  await wacht(1200)
  const aangemeld2 = overlay() ? await js(overlay(), `!document.querySelector('.aanmelden') && !document.querySelector('.opdracht')`) : false
  const log = readFileSync(join(map, 'logs', 'omsi-enhancer.log'), 'utf8')
  const gevolgdRegels = log.split(/\r?\n/).filter((r) => /vrij rijden volgt OMSI/.test(r))
  console.log(`andere omloop ${andereOmloop.lineFile}/${andereOmloop.tourNumber}: rijscherm ${Boolean(tweede)}; aangemeld: ${aangemeld2}; gevolgd ${gevolgdRegels.length} keer`)
  for (const regel of gevolgdRegels) console.log(`  ${regel.slice(24, 200)}`)

  /* ---- 7. Stoppen ---- */
  await js(hoofd, `document.querySelector('.startknop')?.click()`)
  const hub = await wachtOp(`document.querySelectorAll('.hub-tegel').length > 0`, 40)
  await wacht(1000)
  const melding = await js(hoofd, `document.body.innerText.match(/Vrij rijden gestopt[^\\n]*|Free play stopped[^\\n]*/)?.[0] ?? ''`)
  console.log(`gestopt: hoofdmenu ${Boolean(hub)}, "${melding}", overlay dicht: ${!overlay()}`)

  const spelmapGelijk = JSON.stringify(spelmapStand()) === JSON.stringify(spelmapVoor) && geweigerd.length === 0
  console.log(`spelmap onaangeroerd: ${spelmapGelijk}${geweigerd.length ? `; geweigerd: ${geweigerd.join(' | ')}` : ''}`)
  const fouten = meldingen.filter((m) => !/Electron Security Warning|willReadFrequently/.test(m))
  console.log('meldingen:', fouten.length ? fouten.map((m) => m.slice(0, 140)) : 'geen')

  const goed =
    haltes > 5 &&
    Boolean(gekozenHalte) &&
    geenDiensten &&
    zonderLijnstap &&
    Boolean(rijscherm) &&
    geenDienstInProfiel &&
    zegtHoe &&
    Boolean(eerste) &&
    rijenEerst > 0 &&
    aangemeld1 &&
    Boolean(tweede) &&
    aangemeld2 &&
    gevolgdRegels.length === 2 &&
    gevolgdRegels.every((r) => /IBIS lijn/.test(r)) &&
    Boolean(hub) &&
    Boolean(melding) &&
    !overlay() &&
    !profiel().activeDuty &&
    (profiel().entries?.length ?? 0) === logboekVoor &&
    spelmapGelijk &&
    fouten.length === 0
  console.log(goed ? 'vrij rijden: kaart, beginpunt en bus, en de overlay volgt OMSI' : 'VRIJ RIJDEN KLOPT NIET')
  stop(goed ? 0 : 1)
})
