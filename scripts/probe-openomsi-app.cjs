/**
 * De spelmotor in de echte app (ontwerp openomsi-koppeling §7, §10 stap 1-3).
 *
 *   npx electron-vite build
 *   npx electron scripts/probe-openomsi-app.cjs        (PROEF_MAP=<map> voor een eigen werkmap)
 *
 * Laadt out/main/index.js met een eigen gebruikersmap, een eigen map voor
 * live.json, een eigen ~/.openomsi en een nagebouwde OMSI 2-map. Het "OMSI"
 * en het "openOMSI" van deze proef zijn nepexe's met eigen namen
 * (OMSI_ENHANCER_PROEFPROCES): de app ziet het echte spel van Luc niet en kan
 * het ook niet starten. De vangrails (proefvangrails.cjs) weigeren elke
 * schrijfactie in de echte OMSI-map, in Lucs gebruikersmap en in zijn
 * ~/.openomsi.
 *
 *  0. De spelkeuze van Luc: openOMSI staat er en de speler koos nog niet.
 *     START vraagt het eerst (`kiesSpel`, met een voorstel) en er start niets
 *     -- geen Omsi.exe, geen openOMSI. Draait openOMSI, dan is dat het voorstel
 *     ("draait nu"), maar ook dan start er niets voordat er gekozen is.
 *  A. Met een nep-openOMSI-spel weigert de app OMSI 2 te starten: een dienst
 *     en een vrije rit krijgen `anderSpel`, en het nep-Omsi.exe start niet.
 *  B. Een dienst in openOMSI: START gaat via `--cli launch` met de Duty, de
 *     overlay blijft dicht, afronden stopt het spel via `--cli stop` en rekent
 *     af uit het sessiebestand (te vroeg/te laat komen in het logboek). In de
 *     OMSI 2-map verandert niets buiten openOMSI\.
 *     Kaartje en wisselgeld via de app: geweigerd als motoractie (in openOMSI
 *     staan ze er niet).
 *  C. Het spel valt hard weg (geen sessiebestand): na de zoektijd (20 s) en de
 *     wachttijd (30 s) zegt de app "onvolledig", zonder te crashen, en de dienst
 *     is gewoon af te ronden.
 *  D. openOMSI gekozen, maar het is weg (de exe hernoemd): START begint niets
 *     (`spelNietGevonden`) en start ook niet stil OMSI 2.
 */
const { app, BrowserWindow } = require('electron')
const { execFileSync, spawn, spawnSync } = require('node:child_process')
const { createHash } = require('node:crypto')
const fs = require('node:fs')
const { tmpdir } = require('node:os')
const { join, relative } = require('node:path')

const NEPEXE_MAP = join(__dirname, 'nepexe')
const basis = process.env.PROEF_MAP || tmpdir()
const werk = join(basis, 'openomsi-app')
fs.rmSync(werk, { recursive: true, force: true })
fs.mkdirSync(werk, { recursive: true })

/* ---- nepexe bouwen (MSVC) ---- */
const bouwMap = join(basis, 'nepexe-bouw')
const nepexe = join(bouwMap, 'nepexe.exe')
if (!fs.existsSync(nepexe)) {
  fs.mkdirSync(bouwMap, { recursive: true })
  spawnSync('cmd.exe', ['/d', '/s', '/c', `""${join(NEPEXE_MAP, 'bouw.cmd')}" "${bouwMap}""`], { windowsVerbatimArguments: true })
}
const node = execFileSync('node', ['-p', 'process.execPath'], { encoding: 'utf8' }).trim()

/* ---- de nagebouwde OMSI 2-map ---- */
const PROEF = 'OmsiNepApp'
const o2 = join(werk, 'OMSI 2')
const schrijf = (pad, inhoud) => {
  fs.mkdirSync(join(pad, '..'), { recursive: true })
  fs.writeFileSync(pad, inhoud)
}
const nep = (doel, script) => {
  fs.copyFileSync(nepexe, doel)
  fs.copyFileSync(join(NEPEXE_MAP, script), doel.replace(/\.exe$/i, '.cjs'))
}
fs.mkdirSync(o2, { recursive: true })
schrijf(join(o2, 'options.cfg'), '[last_map]\r\nmaps\\TH_Wald\r\n\r\n')
schrijf(join(o2, 'maps', 'TH_Wald', 'global.cfg'), '[name]\r\nThueringer Wald\r\n')
schrijf(join(o2, 'maps', 'TH_Wald', 'laststn.osn'), 'van OMSI 2\r\n')
schrijf(join(o2, 'Inputs', 'keyboard.cfg'), '[vehicles]\r\n')
fs.mkdirSync(join(o2, 'plugins'), { recursive: true })
fs.mkdirSync(join(o2, 'Situations'), { recursive: true })
fs.mkdirSync(join(o2, 'Vehicles'), { recursive: true })
// Het "Omsi.exe" van deze proef: start het, dan staat er een merkteken.
const merk = join(werk, 'merk')
fs.mkdirSync(merk, { recursive: true })
fs.copyFileSync(nepexe, join(o2, 'Omsi.exe'))
fs.writeFileSync(join(o2, 'Omsi.cjs'), `require('node:fs').writeFileSync(${JSON.stringify(join(merk, 'omsi-gestart'))}, 'ja')\n`)
nep(join(o2, `${PROEF}Open.exe`), 'nepspel.cjs')
nep(join(o2, `${PROEF}OpenLauncher.exe`), 'neplauncher.cjs')

const thuis = join(werk, 'thuis')
fs.mkdirSync(join(thuis, 'instances'), { recursive: true })
fs.writeFileSync(join(thuis, 'launcher.json'), JSON.stringify({ root: o2.replace(/\\/g, '/'), game: '', profile: 'OMSI-Fan' }))
const verslag = join(werk, 'verslag.jsonl')

const gegevens = join(werk, 'gegevens')
fs.mkdirSync(gegevens, { recursive: true })
fs.writeFileSync(
  join(gegevens, 'settings.json'),
  JSON.stringify({ language: 'nl', languageChosen: true, tourSeen: true, busPhotosOffered: true, omsiPath: o2, omsiConfirmed: true })
)
const live = join(werk, 'live', 'OMSI Career')
fs.mkdirSync(live, { recursive: true })

Object.assign(process.env, {
  OMSI_ENHANCER_PROEFPROCES: PROEF,
  OMSI_ENHANCER_OPENOMSI_MAP: thuis,
  OMSI_ENHANCER_LIVEMAP: live,
  OMSI_ENHANCER_APPARAAT_HOST: '127.0.0.1',
  NEPEXE_NODE: node,
  NEPLAUNCHER_THUIS: thuis,
  NEPLAUNCHER_VERSLAG: verslag,
  NEPLAUNCHER_SPEL: join(o2, `${PROEF}Open.exe`),
  NEPSPEL_ACHTER: '1',
  NEPSPEL_MERK: merk
})
app.setPath('userData', gegevens)

/* ---- de vangrails: niets van Luc ---- */
const { vangrails } = require('./proefvangrails.cjs')
const geweigerd = vangrails({
  spelmap: 'C:/Program Files (x86)/Steam/steamapps/common/OMSI 2',
  verboden: [join(process.env.USERPROFILE || '', '.openomsi')]
})
require('../out/main/index.js')

let fouten = 0
const klopt = (wat, ja) => {
  console.log(`${ja ? 'ok  ' : 'FOUT'} ${wat}`)
  if (!ja) fouten++
}
const wacht = (ms) => new Promise((r) => setTimeout(r, ms))
const leeft = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
function momentopname() {
  const uit = new Map()
  const loop = (m) => {
    for (const e of fs.readdirSync(m, { withFileTypes: true })) {
      const p = join(m, e.name)
      if (e.isDirectory()) loop(p)
      else uit.set(relative(o2, p).replace(/\\/g, '/'), createHash('sha256').update(fs.readFileSync(p)).digest('hex'))
    }
  }
  loop(o2)
  return uit
}
const verschil = (a, b) => [...new Set([...a.keys(), ...b.keys()])].filter((p) => a.get(p) !== b.get(p))
const mag = (p) => /^openomsi\//i.test(p) || /^plugins\/omsihub\//i.test(p) || /^situations\/omsi enhancer\./i.test(p)

const DUTY = {
  mapFolder: 'TH_Wald',
  mapName: 'Thüringer Wald',
  lineFile: 'Omnibusverkehr Rennsteig',
  tourNumber: '302 - 725302',
  depot: 'Ilmenau',
  legs: [
    {
      tripFile: '731_LBS_ZOBB',
      lineFile: 'Omnibusverkehr Rennsteig',
      lineNumber: '302',
      terminus: 'Ilmenau',
      departure: 550,
      arrival: 600,
      minutes: 50,
      tourNumber: '302 - 725302',
      layoverBefore: 0,
      stops: ['A', 'B', 'C', 'D', 'E', 'F'],
      stopIds: ['1', '2', '3', '4', '5', '6'],
      stopTimes: [550, 560, 570, 580, 590, 600]
    }
  ],
  signOn: 540,
  start: 550,
  end: 600,
  durationMinutes: 60,
  totalStops: 6,
  lineNumbers: ['302'],
  days: 127,
  period: 0
}
const BUS = 'Vehicles\\MAN_NewLionsCity\\MAN_12C_2door_ZF.bus'
const ASSIGNMENT = {
  duty: DUTY,
  date: { year: 1989, dayOfYear: 150, iso: '1989-05-30', kind: 'school' },
  vehicle: { relativePath: BUS, manufacturer: 'MAN', type: "Lion's City", folder: 'MAN_NewLionsCity' },
  yard: 'Thueringer Wald 2005'
}
const VERZOEK = {
  duty: DUTY,
  vehiclePath: BUS,
  date: ASSIGNMENT.date,
  lineNumber: '302',
  terminus: 'Ilmenau',
  yard: 'Thueringer Wald 2005'
}

app.on('window-all-closed', () => {})
setTimeout(() => {
  console.error('time-out')
  app.exit(1)
}, 400000).unref()

app.whenReady().then(async () => {
  const eigen = []
  try {
    await wacht(1500)
    const [venster] = BrowserWindow.getAllWindows()
    if (venster.webContents.isLoading()) await new Promise((r) => venster.webContents.once('did-finish-load', r))
    const js = (code) => venster.webContents.executeJavaScript(code)
    const api = (naam, ...args) => js(`window.career.${naam}(...${JSON.stringify(args)})`)
    await api('createProfile', 'Proef')

    /* ---- 0. nog niet gekozen: START vraagt het eerst ---- */
    const stand0 = await api('spelStand')
    klopt(
      `openOMSI gevonden, niet gekozen: kiezen ${stand0.kiezen}, voorstel ${stand0.voorstel?.motor} (${stand0.voorstel?.reden})`,
      stand0.kiezen === true && !stand0.keuze && stand0.voorstel?.reden === 'standaard' && Boolean(stand0.openomsi)
    )
    await api('confirmDuty', ASSIGNMENT, '', 'dienst')
    const begin0 = await api('beginDuty', VERZOEK)
    klopt(`START zonder keuze: ${begin0.fout} (voorstel ${begin0.voorstel?.motor}), niets gestart`, begin0.fout === 'kiesSpel' && !begin0.launched && Boolean(begin0.voorstel))
    const vrij0 = await api('startFree', { mapFolder: 'TH_Wald', vehiclePath: BUS })
    klopt(`vrij rijden zonder keuze: ${vrij0.fout}`, vrij0.fout === 'kiesSpel' && !vrij0.launched)
    await wacht(1000)
    klopt('geen Omsi.exe en geen openOMSI gestart', !fs.existsSync(join(merk, 'omsi-gestart')) && !fs.existsSync(verslag))
    klopt('de dienst begon niet', !(await api('career')).state.activeDuty?.startedAt)

    /* ---- A. een nep-openOMSI-spel: OMSI 2 start niet ---- */
    const spel = spawn(join(o2, `${PROEF}Open.exe`), ['--root', o2, '--no-menu', '--map', 'maps/TH_Wald/global.cfg'], {
      stdio: 'ignore',
      windowsHide: true,
      env: process.env
    })
    eigen.push(spel.pid)
    await wacht(1500)
    const standVoor = await api('spelStand')
    klopt(
      `nog niet gekozen, openOMSI draait: voorstel ${standVoor.voorstel?.motor} (${standVoor.voorstel?.reden}), toch eerst de vraag`,
      standVoor.kiezen === true && standVoor.voorstel?.motor === 'openomsi' && standVoor.voorstel?.reden === 'draait'
    )
    const beginVoor = await api('beginDuty', VERZOEK)
    klopt(`START: ${beginVoor.fout}, niet stil meegereden in openOMSI`, beginVoor.fout === 'kiesSpel' && !beginVoor.running && !beginVoor.launched)
    await api('saveSettings', { spelmotor: 'omsi' })
    const standA = await api('spelStand')
    klopt(
      `de app ziet het nep-openOMSI (draait ${standA.draait}, keuze ${standA.keuze}, anderSpel ${standA.anderSpel})`,
      standA.draait === 'openomsi' && standA.anderSpel === 'openomsi' && standA.motor === 'omsi'
    )
    klopt('"draait er een spel?" zegt ja', (await api('omsiRunning')) === true)
    await api('confirmDuty', ASSIGNMENT, '', 'dienst')
    const beginA = await api('beginDuty', VERZOEK)
    klopt(`START met OMSI 2 gekozen: geweigerd (${beginA.fout}, ${beginA.anderSpel})`, beginA.fout === 'anderSpel' && !beginA.launched)
    const vrijA = await api('startFree', { mapFolder: 'TH_Wald', vehiclePath: BUS })
    klopt(`vrij rijden met OMSI 2 gekozen: geweigerd (${vrijA.fout})`, vrijA.fout === 'anderSpel' && !vrijA.launched)
    await wacht(1000)
    klopt('het nep-Omsi.exe is niet gestart', !fs.existsSync(join(merk, 'omsi-gestart')))
    const na = await api('career')
    klopt('de dienst begon niet (geen begintijd)', !na.state.activeDuty?.startedAt)
    spawnSync('taskkill', ['/F', '/FI', `PID eq ${spel.pid}`, '/FI', `IMAGENAME eq ${PROEF}Open.exe`], { windowsHide: true })
    await wacht(2500)

    /* ---- B. een dienst in openOMSI, netjes afgerond ---- */
    await api('saveSettings', { spelmotor: 'openomsi' })
    const standB = await api('spelStand')
    klopt(
      `keuze openOMSI: START begint in openOMSI (gevonden: ${standB.openomsi ? 'ja' : 'nee'}, launcher ${standB.openomsi?.launcher})`,
      standB.motor === 'openomsi' && standB.openomsi?.launcher === true && !standB.anderSpel && standB.kan.overlay === false
    )
    const voor = momentopname()
    const beginB = await api('beginDuty', VERZOEK)
    klopt(`START: openOMSI gestart via de launcher (${beginB.motor}, ${beginB.start})`, beginB.motor === 'openomsi' && beginB.launched && beginB.start === 'gestart')
    const gestuurd = JSON.parse(fs.readFileSync(verslag, 'utf8').trim().split('\n').at(-1))
    const duty = JSON.parse(gestuurd.arg)
    klopt(
      `de Duty: ${gestuurd.arg}`,
      gestuurd.opdracht === 'launch' &&
        duty.map === 'maps/TH_Wald/global.cfg' &&
        duty.bus === 'Vehicles/MAN_NewLionsCity/MAN_12C_2door_ZF.bus' &&
        duty.hof === 'Thueringer Wald 2005' &&
        duty.line === 'Omnibusverkehr Rennsteig' &&
        duty.tour === '302 - 725302' &&
        duty.time === '09:00' &&
        duty.date === '1989-05-30' &&
        duty.entry === -1
    )
    const loopt = await api('career')
    const keten = loopt.state.activeDuty?.spel?.keten ?? []
    klopt(`de dienst loopt in openOMSI, keten ${keten.map((l) => l.pid).join(',')}`, loopt.state.activeDuty?.spel?.motor === 'openomsi' && keten.length === 1 && Boolean(loopt.state.activeDuty.startedAt))
    eigen.push(...keten.map((l) => l.pid))
    const sessie = await api('checkSession')
    klopt(`tijdens het rijden: ${sessie.spel?.stand}, niets gemeten`, sessie.spel?.stand === 'loopt' && !sessie.finished && sessie.drivenKm === undefined)
    klopt('de overlay gaat niet open boven openOMSI', (await api('setOverlay', DUTY, true)) === false)
    klopt('kaartje via de app: niet ingedrukt', (await api('telefoonToets', 'ticket_give')) === false)
    klopt('wisselgeld via de app: niet ingedrukt', (await api('telefoonToets', 'wisselgeld')) === false)
    klopt('een IBIS-knop via de app: ook niet (scripttriggers komen in 0.8.0)', (await api('telefoonToets', 'ibis7')) === false)
    const eind = await api('stopSpel')
    klopt(`afronden: gestopt en afgerekend (${eind.spel?.stand}, ${eind.drivenKm} km, ${eind.stopsDone} haltes)`, eind.spel?.stand === 'klaar' && eind.drivenKm === 2.5 && eind.stopsDone === 3)
    klopt(`te vroeg ${eind.spel?.teVroeg}, te laat ${eind.spel?.teLaat}, aanrijdingen ${eind.collisions}, schokken ${eind.harshBrakes}`, eind.spel?.teLaat === 1 && eind.collisions === 1 && eind.harshBrakes === 4)
    klopt('het spel is weg', keten.every((l) => !leeft(l.pid)))
    klopt('de launcher kreeg --cli stop', fs.readFileSync(verslag, 'utf8').includes('"opdracht":"stop"'))
    const geboekt = await api('completeDuty', DUTY, "MAN Lion's City", {
      stopsDone: eind.stopsDone,
      drivenKm: eind.drivenKm,
      harshBrakes: eind.harshBrakes,
      tickets: eind.tickets,
      collisions: eind.collisions,
      teVroeg: eind.spel.teVroeg,
      teLaat: eind.spel.teLaat,
      bron: 'openomsi'
    })
    const regel = geboekt.state.entries[0]
    klopt(`in het logboek: ${regel.drivenKm} km, te laat ${regel.teLaat}, bron ${regel.bron}`, regel.drivenKm === 2.5 && regel.teLaat === 1 && regel.bron === 'openomsi' && !geboekt.state.activeDuty)
    const nb = verschil(voor, momentopname())
    klopt(`in de OMSI 2-map veranderde ${nb.join(', ') || 'niets'}`, nb.every(mag))

    /* ---- C. het spel valt hard weg: onvolledig, geen crash ---- */
    await api('confirmDuty', ASSIGNMENT, '', 'dienst')
    const beginC = await api('beginDuty', VERZOEK)
    const ketenC = (await api('career')).state.activeDuty?.spel?.keten ?? []
    eigen.push(...ketenC.map((l) => l.pid))
    klopt(`tweede dienst gestart (${beginC.start}, pid ${ketenC[0]?.pid})`, beginC.launched && ketenC.length === 1)
    await wacht(1500)
    spawnSync('taskkill', ['/F', '/FI', `PID eq ${ketenC[0].pid}`, '/FI', `IMAGENAME eq ${PROEF}Open.exe`], { windowsHide: true })
    const t0 = Date.now()
    const standen = []
    let laatste
    while (Date.now() - t0 < 120000) {
      laatste = await api('checkSession')
      const s = laatste.spel?.stand
      if (standen.at(-1) !== s) standen.push(`${s}@${Math.round((Date.now() - t0) / 1000)}s`)
      if (s === 'onvolledig') break
      await wacht(2000)
    }
    klopt(`hard weg: ${standen.join(' > ')}`, laatste?.spel?.stand === 'onvolledig' && laatste.finished === true && laatste.drivenKm === undefined)
    klopt('de app leeft nog', !venster.isDestroyed() && (await js('1 + 1')) === 2)
    const geboektC = await api('completeDuty', DUTY, 'MAN', { stopsDone: laatste.stopsDone, drivenKm: laatste.drivenKm, bron: 'openomsi' })
    klopt('de dienst is af te ronden, zonder metingen', !geboektC.state.activeDuty && geboektC.state.entries[0].drivenKm === undefined)

    /* ---- D. openOMSI gekozen, maar weg ---- */
    const exe = join(o2, `${PROEF}Open.exe`)
    fs.renameSync(exe, `${exe}.weg`)
    try {
      await wacht(2500)
      const standD = await api('spelStand')
      klopt(`openOMSI gekozen maar weg: nietGevonden ${standD.nietGevonden}`, standD.nietGevonden === true && standD.motor === 'openomsi' && standD.keuze === 'openomsi')
      await api('confirmDuty', ASSIGNMENT, '', 'dienst')
      const beginD = await api('beginDuty', VERZOEK)
      klopt(`START: ${beginD.fout}, niets gestart`, beginD.fout === 'spelNietGevonden' && !beginD.launched)
      const vrijD = await api('startFree', { mapFolder: 'TH_Wald', vehiclePath: BUS })
      klopt(`vrij rijden: ${vrijD.fout}`, vrijD.fout === 'spelNietGevonden' && !vrijD.launched)
      await wacht(1000)
      klopt('en niet stil OMSI 2 gestart', !fs.existsSync(join(merk, 'omsi-gestart')))
      await api('cancelDuty')
    } finally {
      fs.renameSync(`${exe}.weg`, exe)
    }

    klopt(`de vangrails weigerden niets (${geweigerd.length})`, geweigerd.length === 0)
    if (geweigerd.length) console.log(geweigerd.join('\n'))
    const logboek = join(gegevens, 'logs', 'omsi-enhancer.log')
    if (fs.existsSync(logboek)) {
      const alle = fs.readFileSync(logboek, 'utf8')
      klopt('het logboek noemt de geweigerde motoractie', /toets ticket_give: een motoractie/.test(alle) && /toets change_give: een motoractie/.test(alle))
      const regels = alle.split(/\r?\n/).filter((r) => /openOMSI|dienst niet begonnen|vrij rijden geweigerd|overlay niet|toets /i.test(r))
      console.log('\n--- uit het logboek van de app ---\n' + regels.slice(-24).join('\n'))
    }
  } catch (fout) {
    console.error(fout)
    fouten++
  } finally {
    for (const pid of eigen) {
      if (pid && leeft(pid)) spawnSync('taskkill', ['/F', '/FI', `PID eq ${pid}`, '/FI', `IMAGENAME eq ${PROEF}Open.exe`], { windowsHide: true })
    }
    console.log(fouten ? `\n${fouten} fout(en)` : '\nalles klopt')
    app.exit(fouten ? 1 : 0)
  }
})
