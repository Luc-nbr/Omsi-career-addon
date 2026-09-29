/**
 * Bus3D F2, tweede helft: het 3D-venster en de 3D-knop op de tegels
 * (design/ontwerpen/bus3d.md §8.1, §8.2, §9, §10 "Het venster", §13, §14 F2).
 *
 *   npx electron-vite build
 *   node_modules\electron\dist\electron.exe scripts\probe-bus3d-venster.cjs [--uit <map>] [--kaart <map>]
 *
 * De echte app (out/main/index.js) met een EIGEN map voor gebruikersgegevens: een
 * kopie van settings.json, de profielen en de kaartcache uit
 * %APPDATA%\omsi-enhancer (alleen gelezen), met de schakelaar `bus3d` aan. Een
 * eigen OMSI_ENHANCER_LIVEMAP, en een eigen procesnaam voor OMSI
 * (OMSI_ENHANCER_PROEFPROCES): een OMSI dat echt draait telt hier niet, en de
 * lichte stand komt van een nepproces met die naam. Dezelfde vangrails als
 * probe-vrijrijden.cjs: niets schrijven in de spelmap (alleen de situatie van
 * START, en die gaat naar een tijdelijke map) en nooit Omsi.exe starten.
 *
 * De vensters worden getoond zonder focus en met doorzichtigheid 0: ze tekenen
 * en tellen als zichtbaar, maar staan niet in de weg.
 *
 * Wat er gebeurt, in volgorde:
 *  1. vrij rijden -> kaart -> busstap; geen 3D-knop op merk en type;
 *  2. niveau 3: de 3D-knop op elke tegel; een klik opent één venster (tijd tot
 *     zichtbaar en tot het eerste plaatje), tot alles scherp staat; afdrukken;
 *  3. een tweede 3D-klik wisselt de bus in hetzelfde venster (zelfde webContents);
 *  4. een kleurstelling in beeld zetten en [Kiezen]: de keuze komt terug als
 *     een tegelklik (remise, kruimel, gekozen tegel), het venster gaat dicht
 *     (tijd), het renderer-proces is weg en het GPU-geheugen terug;
 *  5. een keuze met een oud volgnummer en een van een ander venster tellen niet;
 *  6. dubbelklik op een tegel: één niveau verder, en het venster toont de bus van
 *     de eerste klik;
 *  7. hoofdvenster minimaliseren: pauze, en terug;
 *  8. toetsen: /, typen, Enter, Esc, pijltjes, Enter in de lijst, 2 in het beeld,
 *     Ctrl+W; smal venster; licht thema;
 *  9. plek en maat onthouden; een plek op een scherm dat weg is: het midden;
 * 10. dealerstand: titel, [Deze kleurstelling], draaiplateau, geen geld, en de
 *     keuze verandert niets aan de buskeuze;
 * 11. tien keer de NLC open en dicht: geheugen van main en GPU-proces;
 * 12. een gecrasht venster: bv.windowFailed, de tegels werken door, een nieuwe
 *     3D-klik opent een nieuw venster;
 * 13. de foto v4 op de tegels;
 * 14. OMSI draait (nepproces): lichte stand, na 60 s zonder focus pauze;
 *     START sluit het venster;
 * 15. de schakelaar uit: geen 3D-knop meer, en bus3dOpen geeft 0.
 * Uitslag: een tabel op het scherm en <uit>/uitslag-venster.json.
 */
const { app, BrowserWindow, ipcMain } = require('electron')
const { spawn, execFileSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const args = process.argv.slice(2)
const waarde = (naam, standaard) => {
  const i = args.indexOf(naam)
  return i >= 0 && args[i + 1] ? args[i + 1] : standaard
}
const UIT = path.resolve(waarde('--uit', path.join(os.tmpdir(), 'probe-bus3d-venster')))
const KAART = waarde('--kaart', 'Grundorf')
const BEELD = path.join(UIT, 'venster')
fs.mkdirSync(BEELD, { recursive: true })

const BUS_A = 'Vehicles\\ABCoach_O560\\O560_E6.bus'
// Meer dan twaalf kleurstellingen (20), dus met een zoekveld; de MB C2 GN heeft er geen.
const BUS_VEEL = 'Vehicles\\MAN_NewLionsCity\\MAN_12C_2door_Voith.bus'
const BUS_NLC = 'Vehicles\\MAN_NewLionsCity\\MAN_12C_2door_Voith.bus'
const NEP_OMSI = 'OmsiNepVenster'

/* ---- de gebruikersmap: een kopie, met de schakelaar aan ---- */
const UD = path.join(UIT, 'ud')
fs.rmSync(UD, { recursive: true, force: true })
fs.mkdirSync(UD, { recursive: true })
const bron = path.join(process.env.APPDATA, 'omsi-enhancer')
fs.cpSync(path.join(bron, 'settings.json'), path.join(UD, 'settings.json'))
fs.cpSync(path.join(bron, 'profiles'), path.join(UD, 'profiles'), { recursive: true })
if (fs.existsSync(path.join(bron, 'kaartcache'))) fs.cpSync(path.join(bron, 'kaartcache'), path.join(UD, 'kaartcache'), { recursive: true })
const instPad = path.join(UD, 'settings.json')
const leesInst = () => JSON.parse(fs.readFileSync(instPad, 'utf8'))
{
  const inst = leesInst()
  inst.tourSeen = true
  inst.language = 'nl'
  inst.theme = 'donker'
  inst.bus3d = true
  delete inst.bus3dVenster
  fs.writeFileSync(instPad, JSON.stringify(inst, null, 2))
  const actief = JSON.parse(fs.readFileSync(path.join(UD, 'profiles', 'active.json'), 'utf8')).id
  const profielPad = path.join(UD, 'profiles', `${actief}.json`)
  const p = JSON.parse(fs.readFileSync(profielPad, 'utf8'))
  delete p.activeDuty
  p.pasGezien = true
  fs.writeFileSync(profielPad, JSON.stringify(p, null, 2))
}
const OMSI_MAP = leesInst().omsiPath

const LIVE = path.join(UIT, 'live', 'OMSI Career')
fs.mkdirSync(LIVE, { recursive: true })
process.env.OMSI_ENHANCER_LIVEMAP = LIVE
process.env.OMSI_ENHANCER_APPARAAT_HOST = '127.0.0.1'
process.env.OMSI_ENHANCER_PROEFPROCES = NEP_OMSI
app.setPath('userData', UD)

/* ---- de vangrails, voordat de app geladen wordt (zoals probe-vrijrijden.cjs) ---- */
const spelmap = path.resolve(OMSI_MAP).toLowerCase()
const situaties = path.join(spelmap, 'situations').toLowerCase()
const omleiding = path.join(UIT, 'situaties')
fs.mkdirSync(omleiding, { recursive: true })
const geweigerd = []
const inSpelmap = (p) => typeof p === 'string' && path.resolve(p).toLowerCase().startsWith(spelmap)
const omleid = (p) => {
  const vol = path.resolve(p)
  return vol.toLowerCase().startsWith(situaties) ? path.join(omleiding, vol.slice(situaties.length)) : undefined
}
{
  const echteFs = require('node:fs')
  const schrijvers = {
    writeFileSync: 0, appendFileSync: 0, mkdirSync: 0, rmSync: 0, unlinkSync: 0, rmdirSync: 0,
    copyFileSync: 1, renameSync: 1, cpSync: 1, writeFile: 0, appendFile: 0, copyFile: 1, rename: 1,
    unlink: 0, mkdir: 0, rm: 0
  }
  const echtBestaat = echteFs.existsSync
  const ookDeBron = new Set(['renameSync', 'rename'])
  for (const [naam, plek] of Object.entries(schrijvers)) {
    const echt = echteFs[naam]
    if (typeof echt !== 'function') continue
    echteFs[naam] = function (...a) {
      for (const i of ookDeBron.has(naam) ? [0, plek] : [plek]) {
        const doel = String(a[i])
        if (!inSpelmap(doel)) continue
        const ander = omleid(doel)
        if (!ander) {
          geweigerd.push(`${naam} ${doel}`)
          throw new Error(`proef: niet schrijven in de spelmap (${naam} ${doel})`)
        }
        a[i] = ander
      }
      return echt.apply(this, a)
    }
  }
  for (const naam of ['readFileSync', 'existsSync', 'statSync']) {
    const echt = echteFs[naam]
    echteFs[naam] = function (p, ...rest) {
      const ander = inSpelmap(String(p)) ? omleid(String(p)) : undefined
      return echt.call(this, ander && echtBestaat(ander) ? ander : p, ...rest)
    }
  }
  const echtOpen = echteFs.openSync
  echteFs.openSync = function (p, vlag, ...rest) {
    if (inSpelmap(String(p)) && !/^r$|^rs\+?$/.test(String(vlag ?? 'r'))) {
      const ander = omleid(String(p))
      if (ander) return echtOpen.call(this, ander, vlag, ...rest)
      geweigerd.push(`openSync ${p} ${vlag}`)
      throw new Error(`proef: niet schrijven in de spelmap (openSync ${p})`)
    }
    return echtOpen.call(this, p, vlag, ...rest)
  }
  const kinderen = require('node:child_process')
  for (const naam of ['spawn', 'execFile', 'execFileSync', 'exec', 'execSync', 'spawnSync']) {
    const echt = kinderen[naam]
    kinderen[naam] = function (commando, ...a) {
      const alles = [String(commando), ...(Array.isArray(a[0]) ? a[0].map(String) : [])].join(' ').toLowerCase()
      const start = /omsi\.exe/.test(alles) && !/^tasklist/.test(String(commando).toLowerCase())
      if (start || alles.includes(spelmap)) {
        geweigerd.push(`${naam} ${alles.slice(0, 120)}`)
        throw new Error(`proef: het echte OMSI niet starten (${alles.slice(0, 80)})`)
      }
      return echt.call(this, commando, ...a)
    }
  }
}

let nepOmsi
function stop(code) {
  try {
    nepOmsi?.kill()
  } catch {
    // al weg
  }
  app.exit(code)
}
setTimeout(() => {
  console.log('time-out')
  stop(1)
}, 900000).unref()

require('../out/main/index.js')

/* De vensters tekenen en tellen als zichtbaar, maar staan niet in de weg: geen focus, doorzichtig. */
app.on('window-all-closed', () => {})
/** Wanneer elk venster voor het eerst getoond werd (voor de opentijd van het 3D-venster). */
const getoondOp = new WeakMap()
app.on('browser-window-created', (_e, w) => {
  w.setOpacity(0)
  w.show = () => {
    if (!getoondOp.has(w)) getoondOp.set(w, Date.now())
    BrowserWindow.prototype.showInactive.call(w)
  }
  w.focus = () => {}
})

// ------------------------------------------------------------ hulp
const slaap = (ms) => new Promise((k) => setTimeout(k, ms))
const uitslag = { kaart: KAART, stappen: {}, tijden: {}, geheugen: {}, fouten: [] }
const regel = (s) => console.log(s)
const js = (w, code) =>
  (w && !w.isDestroyed() ? w.webContents.executeJavaScript(code, true) : Promise.reject(new Error('venster weg'))).catch((fout) => {
    throw new Error(`${String(fout).slice(0, 80)} in: ${code.slice(0, 140)}`)
  })
async function wachtOp(w, code, ms = 15000, stap = 50) {
  const eind = Date.now() + ms
  while (Date.now() < eind) {
    if (!w || w.isDestroyed()) return undefined
    const uit = await js(w, code).catch(() => undefined)
    if (uit) return uit
    await slaap(stap)
  }
  return undefined
}
async function wachtTot(fn, ms = 15000, stap = 50) {
  const eind = Date.now() + ms
  while (Date.now() < eind) {
    const uit = await fn()
    if (uit) return uit
    await slaap(stap)
  }
  return undefined
}
/** Een nieuw 3D-venster (een ander dan `niet`). */
const nieuw3d = (niet, ms = 4000) =>
  wachtTot(
    () => {
      const w = venster3d()
      return w && w !== niet ? w : undefined
    },
    ms,
    5
  )
const venster3d = () =>
  BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && /bus3d\.html/.test(w.webContents.getURL()) && !/foto=1/.test(w.webContents.getURL()))
const fotovenster = () => BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && /foto=1/.test(w.webContents.getURL()))
/*
 * Een venster zonder focus en met doorzichtigheid 0 tekent niet vanzelf opnieuw:
 * capturePage gaf dan het vorige beeld. Zo waren "schakelaar uit" en "tegels met
 * foto v4" byte voor byte gelijk, en toonde "pauze" nog het 3D-beeld
 * (beeldbeoordeling F2). Daarom eerst laten hertekenen en twee beelden wachten;
 * is de afdruk dan nog gelijk aan de vorige van dat venster, nog één keer.
 */
const vorigeAfdruk = new Map()
async function afdruk(w, naam) {
  if (!w || w.isDestroyed()) return
  const vers = async () => {
    w.webContents.invalidate()
    await Promise.race([
      w.webContents.executeJavaScript('new Promise((k) => requestAnimationFrame(() => requestAnimationFrame(() => k(true))))'),
      slaap(600)
    ]).catch(() => undefined)
    await slaap(120)
    return (await w.webContents.capturePage()).toPNG()
  }
  try {
    let png = await vers()
    const vorige = vorigeAfdruk.get(w.webContents.id)
    if (vorige && vorige.equals(png)) {
      await slaap(400)
      png = await vers()
      if (vorige.equals(png)) uitslag.fouten.push(`afdruk ${naam}: gelijk aan de vorige afdruk van dit venster`)
    }
    vorigeAfdruk.set(w.webContents.id, png)
    fs.writeFileSync(path.join(BEELD, naam), png)
  } catch (fout) {
    uitslag.fouten.push(`afdruk ${naam}: ${String(fout).slice(0, 80)}`)
  }
}
function vramNu() {
  try {
    const mb = Number(execFileSync('nvidia-smi', ['--query-gpu=memory.used', '--format=csv,noheader,nounits'], { encoding: 'utf8', timeout: 5000 }).trim())
    return Number.isFinite(mb) ? mb : undefined
  } catch {
    return undefined
  }
}
/**
 * Het videogeheugen van ÉÉN proces (MB): de prestatiemeter "GPU Process Memory"
 * van Windows (alleen gelezen). nvidia-smi telt de hele kaart, en daar speelde
 * tijdens de proef een spel naast (29-09: HITMAN3 met 3 GB); dit is alleen het
 * GPU-proces van de app.
 */
function vramVanProces(pid) {
  if (!pid) return undefined
  try {
    const uit = execFileSync(
      'powershell',
      ['-NoProfile', '-Command', `((Get-Counter '\\GPU Process Memory(pid_${pid}_*)\\Dedicated Usage' -ErrorAction Stop).CounterSamples | Measure-Object CookedValue -Sum).Sum`],
      { encoding: 'utf8', timeout: 15000 }
    ).trim()
    const bytes = Number(uit)
    return Number.isFinite(bytes) ? Math.round(bytes / 1048576) : undefined
  } catch {
    return undefined
  }
}
const gpuPid = () => app.getAppMetrics().find((x) => x.type === 'GPU')?.pid

function metrieken() {
  const m = app.getAppMetrics()
  const mb = (x) => (x ? Math.round(x.memory.workingSetSize / 1024) : undefined)
  // Privé vastgelegd geheugen (Windows): de werkset zegt ook iets over wat het systeem nog niet terugnam.
  const prive = (x) => (x && x.memory.privateBytes !== undefined ? Math.round(x.memory.privateBytes / 1024) : undefined)
  return {
    main: mb(m.find((x) => x.type === 'Browser')),
    gpu: mb(m.find((x) => x.type === 'GPU')),
    gpuPrive: prive(m.find((x) => x.type === 'GPU')),
    renderers: m.filter((x) => x.type === 'Tab').map((x) => x.pid),
    vram: vramNu()
  }
}
const logboek = () => {
  try {
    return fs.readFileSync(path.join(UD, 'logs', 'omsi-enhancer.log'), 'utf8').split(/\r?\n/)
  } catch {
    return []
  }
}
const ok = (naam, goed, detail = '') => {
  uitslag.stappen[naam] = { goed: Boolean(goed), detail }
  regel(`${goed ? 'GOED' : 'FOUT'}  ${naam}${detail ? `: ${detail}` : ''}`)
}

/** Merk, type en uitvoering zoals App.tsx ze uit een bus haalt (`ontleedBus`). */
function ontleed(bus) {
  const delen = String(bus.type ?? '').split(' - ').map((d) => d.trim()).filter(Boolean)
  return { merk: bus.manufacturer || bus.folder, type: delen[0] || bus.folder, uitvoering: delen.slice(1).join(' · ') || bus.paint || '—' }
}

app.whenReady().then(async () => {
  ipcMain.removeHandler('plugin:status')
  ipcMain.handle('plugin:status', () => ({ installed: true, upToDate: true, changed: false, target: '' }))
  let hoofd
  for (let i = 0; i < 80 && !hoofd; i++) {
    await slaap(250)
    hoofd = BrowserWindow.getAllWindows().find((w) => /index\.html|localhost/.test(w.webContents.getURL()) || w.webContents.getURL() === '')
  }
  await slaap(2500)
  process.on('unhandledRejection', async (fout) => {
    regel(`fout in de proef: ${String(fout).slice(0, 300)}`)
    await afdruk(hoofd, 'fout-hoofd.png')
    await afdruk(venster3d(), 'fout-3d.png')
    fs.writeFileSync(path.join(UIT, 'uitslag-venster.json'), JSON.stringify(uitslag, null, 2))
    stop(1)
  })
  const H = (code, ms) => wachtOp(hoofd, code, ms)

  /*
   * `--geheugen <n>`: alleen het geheugen bij n keer de NLC open en dicht, met de
   * stand na elke keer (werkset en privé van het GPU-proces, videogeheugen). Om
   * een lek te zoeken zonder de hele ronde; `bus3d:open` vraagt geen busstap.
   */
  const geheugenRonde = Number(waarde('--geheugen', '0'))
  if (geheugenRonde > 0) {
    await H(`document.querySelectorAll('.hub-tegel').length > 0 || /Wie rijdt er vandaag|Who is driving/.test(document.body.innerText)`, 20000)
    const bussen = await js(hoofd, `window.career.vehicles()`)
    const nlc = bussen.find((b) => b.relativePath.toLowerCase() === BUS_NLC.toLowerCase())
    const reeks = [{ ...metrieken(), vramProces: vramVanProces(gpuPid()) }]
    for (let i = 0; i < geheugenRonde; i++) {
      await js(hoofd, `window.career.bus3dOpen({ doel: 'buskeuze', relatiefPad: ${JSON.stringify(nlc.relativePath)}, titel: 'NLC' })`)
      const w = await nieuw3d(undefined, 8000)
      await wachtOp(w, `document.querySelector('.bv-kader')?.dataset.fase === 'scherp'`, 30000)
      await js(w, `window.bus3d.sluit(); true`)
      await wachtTot(() => w.isDestroyed(), 3000)
      await slaap(2000)
      reeks.push({ ...metrieken(), vramProces: vramVanProces(gpuPid()) })
      regel(`${i + 1}: GPU-proces werkset ${reeks.at(-1).gpu} MB, privé ${reeks.at(-1).gpuPrive} MB, videogeheugen ${reeks.at(-1).vramProces} MB; main ${reeks.at(-1).main} MB; hele kaart ${reeks.at(-1).vram} MB`)
    }
    regel(`vóór het eerste venster: GPU-proces privé ${reeks[0].gpuPrive} MB, videogeheugen ${reeks[0].vramProces} MB`)
    fs.writeFileSync(path.join(UIT, 'uitslag-geheugen.json'), JSON.stringify(reeks, null, 2))
    return stop(0)
  }

  // ------------------------------------------------------------ 1. naar de busstap
  await H(`document.querySelectorAll('.hub-tegel').length > 0 || /Wie rijdt er vandaag|Who is driving/.test(document.body.innerText)`, 20000)
  for (let poging = 0; poging < 4; poging++) {
    const waar = await js(hoofd, `document.querySelector('.hub-tegel') ? 'hub' : /Wie rijdt er vandaag|Who is driving/.test(document.body.innerText) ? 'chauffeurs' : 'anders'`)
    if (waar === 'hub') await js(hoofd, `document.querySelector(".hub-tegel[data-modus='free']")?.click()`)
    else if (waar === 'chauffeurs') await js(hoofd, `document.querySelector('.startknop')?.click()`)
    else break
    await slaap(1200)
  }
  await js(hoofd, `[...document.querySelectorAll('.weergavekeuze button')][0]?.click()`)
  await slaap(400)
  await H(`[...document.querySelectorAll('.dienstrij, .tegel')].some((r) => r.textContent.includes(${JSON.stringify(KAART)}))`, 30000)
  await js(hoofd, `[...document.querySelectorAll('.dienstrij, .tegel')].find((r) => r.textContent.includes(${JSON.stringify(KAART)}))?.click()`)
  await H(`/staat klaar bij/.test(document.querySelector('.velvoet')?.textContent ?? '')`, 60000)
  await slaap(800)
  await js(hoofd, `document.querySelector('.startknop')?.click()`)
  const opBusstap = await H(`/Bus/i.test(document.querySelector('.stap[data-stand="nu"]')?.textContent ?? '') && document.querySelectorAll('.tegel').length > 0`, 30000)
  ok('busstap bereikt', opBusstap)
  if (!opBusstap) {
    await afdruk(hoofd, 'fout-geen-busstap.png')
    return stop(1)
  }

  const bussen = await js(hoofd, `window.career.vehicles()`)
  const zoekBus = (pad) => bussen.find((b) => b.relativePath.toLowerCase() === pad.toLowerCase())
  const busA = zoekBus(BUS_A) ?? bussen.find((b) => /\.bus$/i.test(b.relativePath))
  const A = ontleed(busA)
  regel(`bus A: ${busA.relativePath} (${A.merk} / ${A.type} / ${A.uitvoering})`)

  const drieD = (sel = '') => `[...document.querySelectorAll('.tegel${sel} .tegelactie[data-teken="3d"]')].length`
  const naarTitel = async (titel) => {
    const gevonden = await js(hoofd, `(() => { const t = [...document.querySelectorAll('.tegel')].find((x) => x.querySelector('.tegel-titel')?.textContent === ${JSON.stringify(titel)}); if (t) t.click(); return Boolean(t) })()`)
    await slaap(500)
    return gevonden
  }
  /** Terug naar niveau 3 van bus A (via de kruimel van het type), als we daar niet al zijn. */
  const naarNiveau3 = async () => {
    const al = await js(hoofd, `[...document.querySelectorAll('.tegel .tegel-titel')].some((t) => t.textContent === ${JSON.stringify(A.uitvoering)})`)
    if (al) return true
    await js(hoofd, `[...document.querySelectorAll('.kruimels button')].find((k) => k.textContent === ${JSON.stringify(A.type)})?.click(); true`)
    return H(`[...document.querySelectorAll('.tegel .tegel-titel')].some((t) => t.textContent === ${JSON.stringify(A.uitvoering)})`, 5000)
  }
  /** De busstap uit (terug naar de kaart) en weer in, tot niveau 3 van bus A. */
  const busstapOpnieuw = async () => {
    await js(hoofd, `[...document.querySelectorAll('.stap[data-stand="klaar"] .stapknop')].find((b) => /Kaart|Map/i.test(b.textContent))?.click(); true`)
    await H(`/Kaart|Map/i.test(document.querySelector('.stap[data-stand="nu"]')?.textContent ?? '')`, 5000)
    await slaap(800)
    await js(hoofd, `document.querySelector('.startknop')?.click(); true`)
    await H(`/Bus/i.test(document.querySelector('.stap[data-stand="nu"]')?.textContent ?? '') && document.querySelectorAll('.tegel').length > 0`, 20000)
    await slaap(400)
    const merkZichtbaar = await js(hoofd, `[...document.querySelectorAll('.tegel .tegel-titel')].some((t) => t.textContent === ${JSON.stringify(A.merk)})`)
    if (!merkZichtbaar) {
      await js(hoofd, `[...document.querySelectorAll('.kruimels button')][0]?.click(); true`)
      await slaap(400)
    }
    await naarTitel(A.merk)
    await naarTitel(A.type)
    return H(`[...document.querySelectorAll('.tegel .tegel-titel')].some((t) => t.textContent === ${JSON.stringify(A.uitvoering)})`, 5000)
  }

  // Niveau 1 (merk) en 2 (type): geen 3D-knop.
  const knoppenMerk = await js(hoofd, drieD())
  await naarTitel(A.merk)
  const knoppenType = await js(hoofd, drieD())
  await naarTitel(A.type)
  await H(`[...document.querySelectorAll('.tegel .tegel-titel')].some((t) => t.textContent === ${JSON.stringify(A.uitvoering)})`)
  const tegels3 = await js(hoofd, `document.querySelectorAll('.tegel').length`)
  const knoppen3 = await js(hoofd, drieD())
  ok('geen 3D-knop op merk en type', knoppenMerk === 0 && knoppenType === 0, `merk ${knoppenMerk}, type ${knoppenType}`)
  ok('3D-knop op elke tegel van niveau 3', knoppen3 === tegels3 && tegels3 > 0, `${knoppen3} van ${tegels3}`)
  await slaap(600)
  await afdruk(hoofd, 'hoofd-niveau3-3d-knop.png')

  // ------------------------------------------------------------ 2. de 3D-knop: een nieuw venster
  const voor = { ...metrieken(), vramProces: vramVanProces(gpuPid()) }
  const klik3d = (titel) =>
    js(hoofd, `(() => { const t = [...document.querySelectorAll('.tegel')].find((x) => x.querySelector('.tegel-titel')?.textContent === ${JSON.stringify(titel)}); const k = t?.querySelector('.tegelactie[data-teken="3d"]'); if (k) k.click(); return Boolean(k) })()`)
  const t0 = Date.now()
  await klik3d(A.uitvoering)
  const win = await nieuw3d(undefined)
  const wc = win?.webContents
  const ramen = win ? await wachtTot(() => getoondOp.get(win), 5000, 5) : undefined
  const zichtbaarOp = ramen ?? 0
  const getoond = win ? await wachtOp(win, `document.documentElement.dataset.getoondMs ? { wat: document.documentElement.dataset.getoond, ms: Number(document.documentElement.dataset.getoondMs), ingang: Number(document.documentElement.dataset.ingangMs), vraag: Number(document.documentElement.dataset.vraagKlaarMs), oorsprong: performance.timeOrigin, dom: performance.getEntriesByType('navigation')[0]?.domContentLoadedEventEnd ?? 0, geladen: performance.getEntriesByType('navigation')[0]?.responseEnd ?? 0 } : undefined`, 5000, 5) : undefined
  uitslag.tijden.paginaStappen = getoond
  const tZichtbaar = ramen ? zichtbaarOp - t0 : undefined
  const tPlaatje = getoond ? Math.round(getoond.oorsprong + getoond.ms - t0) : undefined
  uitslag.tijden.nieuwVensterZichtbaar = tZichtbaar
  uitslag.tijden.nieuwVensterPlaatje = tPlaatje
  uitslag.tijden.plaatjeNaLaden = getoond ? Math.round(getoond.ms - getoond.geladen) : undefined
  uitslag.tijden.plaatjeNaDom = getoond ? Math.round(getoond.ms - getoond.dom) : undefined
  ok('3D-knop opent één venster', Boolean(win) && BrowserWindow.getAllWindows().filter((w) => /bus3d\.html/.test(w.webContents.getURL()) && !/foto=1/.test(w.webContents.getURL())).length === 1,
    `zichtbaar na ${tZichtbaar} ms, eerste plaatje (${getoond?.wat}) na ${tPlaatje} ms, ${uitslag.tijden.plaatjeNaLaden} ms na het laden van de pagina`)
  const scherp = await wachtOp(win, `document.querySelector('.bv-kader')?.dataset.fase === 'scherp'`, 30000)
  const tScherp = Date.now() - t0
  uitslag.tijden.klikTotScherp = tScherp
  ok('venster: 3D scherp', scherp, `${tScherp} ms na de klik`)
  const tijdens = { ...metrieken(), vramProces: vramVanProces(gpuPid()) }
  await slaap(400)
  await afdruk(win, 'venster-o560.png')
  const paneel = await js(win, `({ titel: document.title, rijen: document.querySelectorAll('.bv-rij').length, gekozen: [...document.querySelectorAll('.bv-gekozen')].map((g) => g.closest('.bv-rij')?.querySelector('.bv-rijnaam')?.textContent), kop: document.querySelector('.bv-kop')?.innerText, feiten: [...document.querySelectorAll('.bv-blok .bv-tekst')].map((p) => p.innerText.slice(0, 80)), knop: document.querySelector('.bv-hoofdknop')?.textContent })`)
  const stalen = await wachtOp(win, `document.querySelectorAll('.bv-staal:not(.bv-staal-leeg)').length`, 15000)
  ok('zijpaneel: naam, kleurstellingen met stalen, [Kiezen]', paneel.rijen > 0 && /Kiezen/.test(paneel.knop ?? '') && Boolean(paneel.kop),
    `titel "${paneel.titel}", ${paneel.rijen} rijen, ${stalen ?? 0} stalen, vinkje bij ${JSON.stringify(paneel.gekozen)}, ${JSON.stringify(paneel.feiten)}`)
  await afdruk(win, 'venster-o560-stalen.png')

  // ------------------------------------------------------------ 3. een tweede 3D-klik: hetzelfde venster
  const idVoor = wc.id
  const ander = await js(hoofd, `[...document.querySelectorAll('.tegel')].map((t) => t.querySelector('.tegel-titel')?.textContent).filter((t) => t && t !== ${JSON.stringify(A.uitvoering)})[0] ?? null`)
  if (ander) {
    const aanvraagVoor = await js(win, `document.documentElement.dataset.aanvraag`)
    const t1 = Date.now()
    await klik3d(ander)
    const nieuwVraag = await wachtOp(win, `document.documentElement.dataset.aanvraag !== ${JSON.stringify(aanvraagVoor)} ? { ms: Number(document.documentElement.dataset.vraagMs), oorsprong: performance.timeOrigin, bus: document.documentElement.dataset.bus } : undefined`, 5000, 5)
    uitslag.tijden.openVensterNieuweBus = nieuwVraag ? Math.round(nieuwVraag.oorsprong + nieuwVraag.ms - t1) : undefined
    const aantal = BrowserWindow.getAllWindows().filter((w) => /bus3d\.html/.test(w.webContents.getURL()) && !/foto=1/.test(w.webContents.getURL())).length
    ok('tweede 3D-klik: zelfde venster', venster3d()?.webContents.id === idVoor && aantal === 1 && Boolean(nieuwVraag), `bus ${nieuwVraag?.bus}, na ${uitslag.tijden.openVensterNieuweBus} ms in het venster`)
    await wachtOp(win, `document.querySelector('.bv-kader')?.dataset.fase === 'scherp'`, 30000)
    // Terug naar bus A (zelfde venster).
    await klik3d(A.uitvoering)
    await wachtOp(win, `document.documentElement.dataset.bus === ${JSON.stringify(busA.relativePath)} && document.querySelector('.bv-kader')?.dataset.fase === 'scherp'`, 30000)
  } else ok('tweede 3D-klik: zelfde venster', true, 'maar één uitvoering op dit niveau; overgeslagen')

  // ------------------------------------------------------------ 4. kiezen
  await wachtOp(win, `document.querySelectorAll('.bv-rij').length > 1`, 15000)
  const rijNamen = await js(win, `[...document.querySelectorAll('.bv-rij .bv-rijnaam')].map((r) => r.textContent)`)
  const doelKleur = rijNamen.length > 2 ? rijNamen[2] : rijNamen[1]
  // Het label van de kruimel en de tegel voor deze keuze (Standaard heet in beide zo).
  const kleurLabel = doelKleur ?? rijNamen[0] ?? 'Standaard'
  let kleurWissel
  if (doelKleur) {
    const tw = Date.now()
    await js(win, `[...document.querySelectorAll('.bv-rij')].find((r) => r.querySelector('.bv-rijnaam')?.textContent === ${JSON.stringify(doelKleur)})?.click()`)
    await wachtOp(win, `document.querySelector('.bv-kader')?.dataset.fase !== 'scherp'`, 2000, 5)
    await wachtOp(win, `document.querySelector('.bv-kader')?.dataset.fase === 'scherp'`, 20000, 10)
    kleurWissel = Date.now() - tw
    await afdruk(win, 'venster-o560-kleur.png')
  }
  const voorKeuze = metrieken()
  const rendererPid = win.webContents.getOSProcessId()
  // Een waarnemer in het hoofdvenster: wanneer staat de kleurstelling in de kruimels?
  await js(hoofd, `window.__keuzeOp = 0; new MutationObserver(() => { if (!window.__keuzeOp && [...document.querySelectorAll('.kruimels *')].some((k) => k.textContent === ${JSON.stringify(kleurLabel)})) window.__keuzeOp = performance.timeOrigin + performance.now() }).observe(document.body, { subtree: true, childList: true, characterData: true }); true`)
  const tk = Date.now()
  await js(win, `document.querySelector('.bv-hoofdknop').click()`)
  const gesloten = await wachtTot(() => win.isDestroyed(), 5000, 5)
  const tDicht = Date.now() - tk
  const keuzeOp = await H(`window.__keuzeOp`, 5000)
  uitslag.tijden.kiezenTotTegelGekozen = keuzeOp ? Math.round(keuzeOp - tk) : undefined
  uitslag.tijden.kiezenTotVensterDicht = tDicht
  const naKeuze = await js(hoofd, `({ titel: document.querySelector('.veltitel, h1, h2')?.textContent, kruimels: [...document.querySelectorAll('.kruimels > *')].map((k) => k.textContent) })`)
  ok('[Kiezen]: keuze komt terug als een tegelklik, venster dicht', Boolean(gesloten && keuzeOp),
    `${doelKleur}: tegel gekozen na ${uitslag.tijden.kiezenTotTegelGekozen} ms, venster dicht na ${tDicht} ms; scherm "${naKeuze.titel}", kruimels ${JSON.stringify(naKeuze.kruimels)}; kleurwissel ${kleurWissel} ms`)
  await afdruk(hoofd, 'hoofd-na-keuze.png')
  // Terug naar de kleurstellingen: de gekozen tegel moet die kleurstelling zijn.
  await js(hoofd, `[...document.querySelectorAll('.kruimels button')].find((k) => k.textContent === ${JSON.stringify(kleurLabel)})?.click()`)
  await slaap(600)
  const gekozenTegel = await js(hoofd, `document.querySelector('.tegel[aria-pressed="true"] .tegel-titel')?.textContent ?? null`)
  ok('de gekozen tegel is de gekozen kleurstelling', gekozenTegel === kleurLabel, `gekozen tegel "${gekozenTegel}"`)
  // Het renderer-proces weg, en het GPU-geheugen terug.
  const weg = await wachtTot(() => !app.getAppMetrics().some((m) => m.pid === rendererPid), 4000, 20)
  const tWeg = Date.now() - tk - tDicht
  await slaap(1500)
  const na = { ...metrieken(), vramProces: vramVanProces(gpuPid()) }
  uitslag.geheugen.openDicht = { voor, tijdens, voorKeuze, na, rendererPid }
  uitslag.tijden.dichtTotProcesWeg = weg ? tWeg : undefined
  // Het GPU-geheugen hier alleen ter lezing: het fotovenster (foto v4) tekent intussen de tegels. De toets staat in stap 11.
  ok('dicht: renderer-proces weg binnen 2 s', Boolean(weg) && tWeg <= 2000,
    `proces weg na ${tWeg} ms; videogeheugen GPU-proces ${voor.vramProces} -> ${tijdens.vramProces} -> ${na.vramProces} MB; nvidia-smi ${voor.vram} -> ${tijdens.vram} -> ${na.vram} MB; GPU-proces ${voor.gpu} -> ${tijdens.gpu} -> ${na.gpu} MB (fotovenster ${fotovenster() ? 'open' : 'dicht'})`)

  // ------------------------------------------------------------ 5. een oude of vreemde keuze telt niet
  {
    const tegelsVoor = await js(hoofd, `document.querySelector('.tegel[aria-pressed="true"] .tegel-titel')?.textContent ?? null`)
    await klik3d(kleurLabel)
    const w2 = await nieuw3d(undefined)
    await wachtOp(w2, `document.documentElement.dataset.aanvraag`, 5000)
    const nu = Number(await js(w2, `document.documentElement.dataset.aanvraag`))
    await js(w2, `window.bus3d.kies({ aanvraag: ${nu - 1}, doel: 'buskeuze', relatiefPad: ${JSON.stringify(busA.relativePath)} }); true`)
    await slaap(400)
    const nogOpen = !w2.isDestroyed()
    // Van een ander venster: een nep-gebeurtenis met het hoofdvenster als afzender.
    ipcMain.emit('bus3d:kies', { sender: hoofd.webContents }, { aanvraag: nu, doel: 'buskeuze', relatiefPad: busA.relativePath })
    await slaap(300)
    const nogOpen2 = !w2.isDestroyed()
    const tegelsNa = await js(hoofd, `document.querySelector('.tegel[aria-pressed="true"] .tegel-titel')?.textContent ?? null`)
    const logRegels = logboek().filter((r) => /oud volgnummer|ander venster/.test(r)).length
    ok('oude en vreemde keuze tellen niet', nogOpen && nogOpen2 && tegelsVoor === tegelsNa && logRegels >= 2, `open ${nogOpen}/${nogOpen2}, gekozen tegel ${tegelsNa}, ${logRegels} logregels`)
    // Esc sluit zonder keuze.
    await wachtOp(w2, `document.querySelector('.bv-kader')`, 5000)
    w2.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
    w2.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
    const escDicht = await wachtTot(() => w2.isDestroyed(), 3000)
    const tegelsNaEsc = await js(hoofd, `document.querySelector('.tegel[aria-pressed="true"] .tegel-titel')?.textContent ?? null`)
    ok('Esc sluit zonder keuze', Boolean(escDicht) && tegelsNaEsc === tegelsVoor, `dicht ${Boolean(escDicht)}, gekozen tegel ${tegelsNaEsc}`)
  }

  // ------------------------------------------------------------ 6. dubbelklik op een tegel van niveau 3
  {
    await naarNiveau3()
    const plek = await js(hoofd, `(() => { const t = [...document.querySelectorAll('.tegel')].find((x) => x.querySelector('.tegel-titel')?.textContent === ${JSON.stringify(A.uitvoering)}); const r = t.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height * 0.6) } })()`)
    const kruimelsVoor = await js(hoofd, `[...document.querySelectorAll('.kruimels > *')].map((k) => k.textContent).join(' / ')`)
    const ev = (type, clickCount) => hoofd.webContents.sendInputEvent({ type, x: plek.x, y: plek.y, button: 'left', clickCount })
    ev('mouseMove', 0)
    ev('mouseDown', 1)
    ev('mouseUp', 1)
    await slaap(90)
    ev('mouseDown', 2)
    ev('mouseUp', 2)
    const w3 = await nieuw3d(undefined)
    await slaap(700)
    const kruimelsNa = await js(hoofd, `[...document.querySelectorAll('.kruimels > *')].map((k) => k.textContent).join(' / ')`)
    const titelNa = await js(hoofd, `document.querySelector('.veltitel, h1, h2')?.textContent`)
    const busIn3 = w3 ? await wachtOp(w3, `document.documentElement.dataset.bus`, 5000) : undefined
    ok('dubbelklik: één niveau verder, venster met de bus van de eerste klik', Boolean(w3) && busIn3 === busA.relativePath && titelNa === A.uitvoering,
      `voor "${kruimelsVoor}", na "${kruimelsNa}" (titel "${titelNa}"), venster ${busIn3}`)
    await afdruk(hoofd, 'hoofd-na-dubbelklik.png')
  }

  // ------------------------------------------------------------ 7. minimaliseren: pauze
  {
    const w = venster3d()
    await wachtOp(w, `document.querySelector('.bv-kader')?.dataset.fase === 'scherp'`, 30000)
    hoofd.minimize()
    const pauze = await wachtOp(w, `document.querySelector('.bv-kader')?.dataset.fase === 'pauze'`, 8000)
    const tekst = pauze ? await js(w, `document.querySelector('.bv-regel')?.innerText ?? ''`) : ''
    hoofd.restore()
    const th = Date.now()
    const terug = await wachtOp(w, `document.querySelector('.bv-kader')?.dataset.fase !== 'pauze'`, 8000)
    const weerScherp = await wachtOp(w, `document.querySelector('.bv-kader')?.dataset.fase === 'scherp' && document.querySelector('.bv-doek-zichtbaar')`, 20000)
    ok('hoofdvenster geminimaliseerd: pauze (bv.paused), daarna terug', Boolean(pauze) && Boolean(terug) && /gepauzeerd/.test(tekst),
      `"${tekst.replace(/\s+/g, ' ').slice(0, 60)}", hervat en weer 3D na ${weerScherp ? Date.now() - th : '-'} ms`)
    /*
     * Pauze kort aan en weer uit, zoals main het stuurt (aanvalsverslag F2, punt 3):
     * kwam "geen pauze" vóór het bericht dat de context weg was, dan bleef het
     * venster voorgoed op de foto. Na elke ronde moet het 3D-beeld terugkomen.
     */
    const rondes = []
    for (const gat of [2, 6, 12, 40]) {
      w.webContents.send('bus3d:stand', { pauze: true, licht: false, reden: 'verborgen' })
      await slaap(gat)
      w.webContents.send('bus3d:stand', { pauze: false, licht: false })
      const weer = await wachtOp(w, `document.querySelector('.bv-kader')?.dataset.fase === 'scherp' && Boolean(document.querySelector('.bv-doek-zichtbaar'))`, 20000, 100)
      rondes.push(`${gat} ms: ${weer ? 'terug' : 'WEG'}`)
    }
    ok('pauze kort aan en uit (2, 6, 12, 40 ms): het 3D-beeld komt elke keer terug', rondes.every((r) => r.endsWith('terug')), rondes.join(', '))
  }

  // ------------------------------------------------------------ 8. toetsen, smal, licht
  {
    const w = venster3d()
    // "2" in het beeld (zijkant): het beeld verandert.
    await js(w, `document.querySelector('.bv-doek')?.focus(); true`)
    await slaap(300)
    const b1 = (await w.webContents.capturePage()).toBitmap()
    w.webContents.sendInputEvent({ type: 'keyDown', keyCode: '2' })
    w.webContents.sendInputEvent({ type: 'char', keyCode: '2' })
    w.webContents.sendInputEvent({ type: 'keyUp', keyCode: '2' })
    await slaap(1500)
    const b2 = (await w.webContents.capturePage()).toBitmap()
    let verschil = 0
    for (let i = 0; i < Math.min(b1.length, b2.length); i += 64) if (Math.abs(b1[i] - b2[i]) > 20) verschil++
    ok('toets 2 in het beeld: zijkant', verschil > 100, `${verschil} monsters anders`)
    await afdruk(w, 'venster-zijkant.png')
    w.webContents.sendInputEvent({ type: 'keyDown', keyCode: '0' })
    w.webContents.sendInputEvent({ type: 'keyUp', keyCode: '0' })

    // Pijltjes en Enter in de lijst kiezen (hier via de API geopend, dus de keuze telt in het hoofdvenster niet).
    const heeftVeel = zoekBus(BUS_VEEL)
    if (heeftVeel) {
      const V = ontleed(heeftVeel)
      await js(hoofd, `window.career.bus3dOpen({ doel: 'buskeuze', relatiefPad: ${JSON.stringify(heeftVeel.relativePath)}, titel: ${JSON.stringify(`${V.merk} ${V.type}`)}, naam: ${JSON.stringify([V.merk, V.type, V.uitvoering])} })`)
      await wachtOp(w, `document.documentElement.dataset.bus === ${JSON.stringify(heeftVeel.relativePath)} && document.querySelectorAll('.bv-rij').length > 12`, 20000)
      const totaal = await js(w, `document.querySelectorAll('.bv-rij').length`)
      const toets = (keyCode, extra = {}) => {
        w.webContents.sendInputEvent({ type: 'keyDown', keyCode, ...extra })
        // Een teken alleen voor letters: '/' is een sneltoets en typt niets in het zoekveld.
        if (keyCode.length === 1 && keyCode !== '/') w.webContents.sendInputEvent({ type: 'char', keyCode, ...extra })
        w.webContents.sendInputEvent({ type: 'keyUp', keyCode, ...extra })
      }
      await js(w, `document.querySelector('.bv-doek').focus(); true`)
      toets('/')
      await slaap(200)
      const zoekFocus = await js(w, `document.activeElement === document.querySelector('.bv-zoek')`)
      // Een zoekterm die niet overal in staat: het eerste woord van de derde kleurstelling.
      const zoekterm = await js(w, `(document.querySelectorAll('.bv-rij .bv-rijnaam')[3]?.textContent ?? 'a').split(/\\s+/)[0].slice(0, 6).toLowerCase()`)
      // Typen via de waarde: een venster zonder focus krijgt van sendInputEvent geen tekst.
      await js(w, `(() => { const i = document.querySelector('.bv-zoek'); if (!i) return false; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(zoekterm)}); i.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
      await slaap(300)
      const gefilterd = await js(w, `document.querySelectorAll('.bv-rij').length`)
      const eerste = await js(w, `document.querySelector('.bv-rij .bv-rijnaam')?.textContent`)
      toets('Return')
      await slaap(300)
      const inBeeldNaEnter = await js(w, `document.documentElement.dataset.inBeeld`)
      toets('Escape')
      await slaap(200)
      const leeg = await js(w, `document.querySelector('.bv-zoek').value === '' && document.querySelectorAll('.bv-rij').length`)
      const nogOpen = !w.isDestroyed()
      ok('toetsen: / zoekt, typen filtert, Enter zet de eerste treffer in beeld, Esc maakt het zoekveld leeg', zoekFocus && gefilterd < totaal && inBeeldNaEnter === eerste && leeg === totaal && nogOpen,
        `${totaal} rijen, "${zoekterm}" ${gefilterd}, in beeld "${inBeeldNaEnter}", na Esc ${leeg} rijen, venster open ${nogOpen}`)
      await afdruk(w, 'venster-c2-lijst.png')
      await js(w, `document.querySelector('.bv-lijst').focus(); true`)
      const inBeeld0 = await js(w, `document.documentElement.dataset.inBeeld`)
      toets('Down')
      toets('Down')
      await slaap(60)
      const meteen = await js(w, `document.documentElement.dataset.inBeeld`)
      await slaap(350)
      const straks = await js(w, `document.documentElement.dataset.inBeeld`)
      ok('pijltjes in de lijst: in beeld na 150 ms rust', meteen === inBeeld0 && straks !== inBeeld0, `"${inBeeld0}" -> meteen "${meteen}" -> na 350 ms "${straks}"`)
      // Smal venster: beeld boven, paneel eronder.
      const oud = w.getBounds()
      w.setBounds({ ...oud, width: 820, height: 760 })
      await slaap(800)
      const smal = await js(w, `(() => { const b = document.querySelector('.bv-beeld').getBoundingClientRect(); const p = document.querySelector('.bv-paneel').getBoundingClientRect(); return p.top >= b.bottom - 1 })()`)
      ok('smal venster: het paneel onder het beeld', smal)
      await afdruk(w, 'venster-smal.png')
      w.setBounds(oud)
      // Licht thema: het paneel volgt, het beeld niet.
      await js(hoofd, `window.career.saveSettings({ theme: 'licht' })`)
      const licht = await wachtOp(w, `document.documentElement.dataset.thema === 'licht'`, 3000)
      await slaap(500)
      await afdruk(w, 'venster-licht-thema.png')
      await js(hoofd, `window.career.saveSettings({ theme: 'donker' })`)
      ok('thema volgt het hoofdvenster', licht)
      // Enter in de lijst: kiezen, en het venster gaat dicht (de keuze telt in het hoofdvenster niet: andere aanvraag).
      const pressedVoor = await js(hoofd, `document.querySelector('.tegel[aria-pressed="true"] .tegel-titel')?.textContent ?? null`)
      await js(w, `document.querySelector('.bv-lijst').focus(); true`)
      toets('Return')
      const dicht = await wachtTot(() => w.isDestroyed(), 3000)
      const pressedNa = await js(hoofd, `document.querySelector('.tegel[aria-pressed="true"] .tegel-titel')?.textContent ?? null`)
      ok('Enter in de lijst kiest (venster dicht); een keuze die het hoofdvenster niet vroeg, verandert niets', Boolean(dicht) && pressedVoor === pressedNa, `dicht ${Boolean(dicht)}`)
    } else ok('toetsen in de lijst', true, `${BUS_VEEL} niet geïnstalleerd; overgeslagen`)

    // Ctrl+W
    await naarNiveau3()
    await klik3d(A.uitvoering)
    const w4 = await nieuw3d(undefined)
    await wachtOp(w4, `document.querySelector('.bv-kader')`, 5000)
    await slaap(300)
    w4.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'W', modifiers: ['control'] })
    w4.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'W', modifiers: ['control'] })
    const cw = await wachtTot(() => w4.isDestroyed(), 3000)
    ok('Ctrl+W sluit', Boolean(cw))
  }

  // ------------------------------------------------------------ 9. plek en maat
  {
    await naarNiveau3()
    await klik3d(A.uitvoering)
    let w = await nieuw3d(undefined)
    await wachtOp(w, `document.querySelector('.bv-kader')`, 5000)
    const wa = require('electron').screen.getPrimaryDisplay().workArea
    const gezet = { x: wa.x + 60, y: wa.y + 50, width: 1000, height: 650 }
    w.setBounds(gezet)
    await slaap(300)
    await js(w, `window.bus3d.sluit(); true`)
    await wachtTot(() => w.isDestroyed(), 3000)
    const bewaard = leesInst().bus3dVenster
    await klik3d(A.uitvoering)
    w = await nieuw3d(undefined)
    await slaap(400)
    const b = w.getBounds()
    const zelfde = Math.abs(b.x - gezet.x) <= 2 && Math.abs(b.y - gezet.y) <= 2 && Math.abs(b.width - gezet.width) <= 2 && Math.abs(b.height - gezet.height) <= 2
    await js(w, `window.bus3d.sluit(); true`)
    await wachtTot(() => w.isDestroyed(), 3000)
    const inst = leesInst()
    inst.bus3dVenster = { x: -40000, y: -40000, breedte: 1000, hoogte: 650 }
    fs.writeFileSync(instPad, JSON.stringify(inst, null, 2))
    await klik3d(A.uitvoering)
    w = await nieuw3d(undefined)
    await slaap(400)
    const c = w.getBounds()
    const h = hoofd.getBounds()
    const midden = Math.abs(c.x + c.width / 2 - (h.x + h.width / 2)) < 40 || (c.x >= wa.x && c.y >= wa.y)
    ok('plek en maat onthouden; een plek buiten de schermen valt terug op het midden', zelfde && midden && Boolean(bewaard),
      `bewaard ${JSON.stringify(bewaard)}, terug ${JSON.stringify(b)}; buiten beeld -> ${JSON.stringify(c)}`)
    await js(w, `window.bus3d.sluit(); true`)
    await wachtTot(() => w.isDestroyed(), 3000)
  }

  // ------------------------------------------------------------ 10. dealerstand
  {
    await js(hoofd, `window.career.bus3dOpen({ doel: 'dealer', relatiefPad: ${JSON.stringify(busA.relativePath)}, titel: ${JSON.stringify(`${A.merk} ${A.type}`)}, naam: ${JSON.stringify([A.merk, A.type, A.uitvoering])} })`)
    const w = await nieuw3d(undefined)
    await wachtOp(w, `document.querySelector('.bv-kader')?.dataset.fase === 'scherp'`, 30000)
    const d = await js(w, `({ titel: document.title, knop: document.querySelector('.bv-hoofdknop')?.textContent, geld: /€|\\bEUR\\b|\\b[Kk]open\\b|\\b[Ll]ease\\b|\\b[Ff]inanc/.test(document.querySelector('.bv-paneel')?.innerText ?? '') })`)
    // Het draaiplateau: na 6 s zonder invoer draait de bus.
    await slaap(7000)
    const p1 = (await w.webContents.capturePage()).toBitmap()
    await slaap(1500)
    const p2 = (await w.webContents.capturePage()).toBitmap()
    let draait = 0
    for (let i = 0; i < Math.min(p1.length, p2.length); i += 64) if (Math.abs(p1[i] - p2[i]) > 20) draait++
    await afdruk(w, 'venster-dealer.png')
    const pressedVoor = await js(hoofd, `document.querySelector('.tegel[aria-pressed="true"] .tegel-titel')?.textContent ?? null`)
    await js(w, `document.querySelector('.bv-hoofdknop').click(); true`)
    const dicht = await wachtTot(() => w.isDestroyed(), 3000)
    await slaap(300)
    const pressedNa = await js(hoofd, `document.querySelector('.tegel[aria-pressed="true"] .tegel-titel')?.textContent ?? null`)
    ok('dealerstand: titel, [Deze kleurstelling], draaiplateau, geen geld, keuze raakt de buskeuze niet',
      /^Dealer · /.test(d.titel) && /Deze kleurstelling/.test(d.knop ?? '') && !d.geld && draait > 50 && Boolean(dicht) && pressedVoor === pressedNa,
      `"${d.titel}", knop "${d.knop}", geld ${d.geld}, plateau ${draait} monsters anders, dicht ${Boolean(dicht)}, buskeuze ${pressedVoor} -> ${pressedNa}`)
  }

  // ------------------------------------------------------------ 11. tien keer de NLC open en dicht
  {
    const nlc = zoekBus(BUS_NLC)
    if (nlc) {
      const N = ontleed(nlc)
      // Het fotovenster (foto v4) gaat 60 s na de laatste foto dicht; pas dan zegt het GPU-geheugen iets over dit venster.
      await wachtTot(() => !fotovenster(), 120000, 500)
      await slaap(2000)
      const begin = { ...metrieken(), vramProces: vramVanProces(gpuPid()) }
      const tijden = []
      const naElke = []
      let open1
      for (let i = 0; i < 11; i++) {
        const t = Date.now()
        await js(hoofd, `window.career.bus3dOpen({ doel: 'buskeuze', relatiefPad: ${JSON.stringify(nlc.relativePath)}, titel: ${JSON.stringify(`${N.merk} ${N.type}`)} })`)
        const w = await nieuw3d(undefined)
        await wachtOp(w, `document.querySelector('.bv-kader')?.dataset.fase === 'scherp'`, 30000)
        tijden.push(Date.now() - t)
        if (i === 0) {
          await afdruk(w, 'venster-nlc.png')
          open1 = { ...metrieken(), vramProces: vramVanProces(gpuPid()) }
        }
        await js(w, `window.bus3d.sluit(); true`)
        await wachtTot(() => w.isDestroyed(), 3000)
        await slaap(1500)
        naElke.push({ ...metrieken(), vramProces: vramVanProces(gpuPid()) })
      }
      await slaap(2500)
      const eind = { ...metrieken(), vramProces: vramVanProces(gpuPid()) }
      /*
       * De eerste keer is opwarmen: het GPU-proces houdt daarna ongeveer 350 MB
       * privé geheugen en 70-180 MB videogeheugen vast (shadercompiler, de caches
       * van ANGLE en de pools van het stuurprogramma; met --geheugen 12-16: vóór
       * het eerste venster 200 MB privé en 120 MB video, daarna 500-640 MB en
       * 140-300 MB, en vlak). De werkset van het GPU-proces groeit wel door
       * (Windows neemt pagina's lui terug) en is geen maat. De toets is dus: geen
       * groei na het opwarmen -- de laatste vijf keer niet meer dan 50 MB boven
       * de eerste vijf -- voor main, het privé geheugen en het videogeheugen van
       * het GPU-proces.
       */
      const na1 = naElke[0]
      uitslag.geheugen.tienKeerNlc = { begin, na1, naElke, eind, tijden }
      const max = (lijst, veld) => Math.max(...lijst.map((m) => m[veld]).filter((w) => typeof w === 'number'))
      const groei = (veld) => max(naElke.slice(-5), veld) - max(naElke.slice(0, 5), veld)
      const vlak = (veld) => !(groei(veld) > 50)
      ok('tien keer de NLC open en dicht: geen groei na het opwarmen (main, GPU-proces privé en video)', vlak('main') && vlak('gpuPrive') && vlak('vramProces'),
        `groei ${groei('main')} / ${groei('gpuPrive')} / ${groei('vramProces')} MB; main ${begin.main} -> ${eind.main} MB; GPU-proces privé ${begin.gpuPrive} -> ${naElke.map((m) => m.gpuPrive).join(', ')} MB; video van het GPU-proces ${begin.vramProces} -> ${open1?.vramProces} (open) -> ${naElke.map((m) => m.vramProces).join(', ')} MB (hele kaart, nvidia-smi: ${begin.vram} -> ${eind.vram}); open tot scherp ${tijden.join(', ')} ms`)
    } else ok('tien keer de NLC', true, 'NLC niet geïnstalleerd; overgeslagen')
  }

  // ------------------------------------------------------------ 12. een gecrasht venster
  {
    await naarNiveau3()
    await klik3d(A.uitvoering)
    const w = await nieuw3d(undefined)
    await wachtOp(w, `document.querySelector('.bv-kader')`, 5000)
    const id = w.webContents.id
    w.webContents.forcefullyCrashRenderer()
    const melding = await H(`/onverwacht dicht/.test(document.querySelector('.velwaarschuwing')?.textContent ?? '')`, 5000)
    await afdruk(hoofd, 'hoofd-venster-gecrasht.png')
    const nogTegels = await js(hoofd, `document.querySelectorAll('.tegel').length`)
    await klik3d(A.uitvoering)
    const w2 = await nieuw3d(w)
    ok('gecrasht venster: bv.windowFailed, tegels werken door, nieuwe klik = nieuw venster', Boolean(melding) && nogTegels > 0 && w2 && w2.webContents.id !== id,
      `melding ${Boolean(melding)}, ${nogTegels} tegels, nieuw venster ${w2?.webContents.id} (was ${id})`)
    await wachtOp(w2, `document.querySelector('.bv-kader')`, 5000)
    await js(w2, `window.bus3d.sluit(); true`)
    await wachtTot(() => w2.isDestroyed(), 3000)
  }

  // ------------------------------------------------------------ 13. de foto v4 op de tegels
  {
    await naarNiveau3()
    const v4 = await H(`[...document.querySelectorAll('.tegel img')].map((i) => i.getAttribute('src')).find((s) => /\\/v4\\//.test(s ?? ''))`, 90000)
    const map4 = path.join(UD, 'busfotos', 'v4')
    const bestanden = fs.existsSync(map4) ? fs.readdirSync(map4).filter((n) => n.endsWith('.webp')) : []
    for (const n of bestanden.slice(0, 4)) fs.copyFileSync(path.join(map4, n), path.join(BEELD, `foto-v4-${n}`))
    const regels = logboek().filter((r) => /busfoto v4/.test(r)).slice(-4)
    ok('foto v4 op de tegels (achter de schakelaar)', Boolean(v4) && bestanden.length > 0, `${bestanden.length} foto's in busfotos/v4; ${regels.map((r) => r.slice(24, 120)).join(' | ')}`)
    await afdruk(hoofd, 'hoofd-tegels-foto-v4.png')
  }

  // ------------------------------------------------------------ 15. Terug sluit het venster; de schakelaar uit
  {
    await naarNiveau3()
    await klik3d(A.uitvoering)
    const w = await nieuw3d(undefined)
    await wachtOp(w, `document.querySelector('.bv-kader')`, 5000)
    await js(hoofd, `[...document.querySelectorAll('.stap[data-stand="klaar"] .stapknop')].find((b) => /Kaart|Map/i.test(b.textContent))?.click(); true`)
    const terugDicht = await wachtTot(() => w.isDestroyed(), 5000)
    ok('de busstap verlaten (terug naar de kaart) sluit het venster', Boolean(terugDicht))
    await js(hoofd, `window.career.saveSettings({ bus3d: false })`)
    const nul = await js(hoofd, `window.career.bus3dOpen({ doel: 'buskeuze', relatiefPad: ${JSON.stringify(busA.relativePath)}, titel: 'x' })`)
    await busstapOpnieuw()
    await slaap(500)
    const knoppen = await js(hoofd, drieD())
    // Zonder schakelaar zoals vóór Bus3D: ook de tegels weer met de v3b, niet de v4 van daarnet.
    const zonderV4 = await H(`(() => { const s = [...document.querySelectorAll('.tegel img')].map((i) => i.getAttribute('src') ?? ''); return s.length > 0 && !s.some((x) => /\\/v4\\//.test(x)) ? s.length : undefined })()`, 15000)
    await afdruk(hoofd, 'hoofd-schakelaar-uit.png')
    ok('schakelaar uit: geen 3D-knop, bus3dOpen geeft 0, de tegels weer met de v3b', knoppen === 0 && nul === 0 && Boolean(zonderV4), `${knoppen} knoppen, bus3dOpen ${nul}, tegels zonder v4 ${zonderV4 ?? 'nee'}`)
    await js(hoofd, `window.career.saveSettings({ bus3d: true })`)
    await busstapOpnieuw()
    await slaap(500)
    const weer = await js(hoofd, drieD())
    ok('schakelaar weer aan: de 3D-knop terug', weer > 0, `${weer} knoppen`)
  }

  // ------------------------------------------------------------ 14. OMSI draait: lichte stand, pauze zonder focus, START
  {
    const nepMap = path.join(UIT, 'nep')
    fs.mkdirSync(nepMap, { recursive: true })
    const nepExe = path.join(nepMap, `${NEP_OMSI}.exe`)
    if (!fs.existsSync(nepExe)) fs.copyFileSync(path.join(process.env.SystemRoot || 'C:/Windows', 'System32', 'PING.EXE'), nepExe)
    nepOmsi = spawn(nepExe, ['-n', '900', '127.0.0.1'], { stdio: 'ignore', windowsHide: true })
    await slaap(1500)
    await naarNiveau3()
    await klik3d(A.uitvoering)
    const w = await nieuw3d(undefined)
    const licht = await wachtOp(w, `/lichte stand/.test(document.querySelector('.bv-regel')?.innerText ?? '')`, 10000)
    await wachtOp(w, `document.querySelector('.bv-kader')?.dataset.fase === 'scherp'`, 30000)
    await afdruk(w, 'venster-lichte-stand.png')
    const tp = Date.now()
    const pauze = await wachtOp(w, `document.querySelector('.bv-kader')?.dataset.fase === 'pauze'`, 75000, 500)
    const tPauze = Date.now() - tp
    // In pauze: de foto of het icoon, [Hervatten], geen knoppen van het beeld (§9).
    const hervat = await wachtOp(w, `[...document.querySelectorAll('.bv-regel .bv-knop')].some((b) => /Hervat|Resume|Fortsetzen|Reprendre/i.test(b.textContent)) && !document.querySelector('.bv-knoppen')`, 5000)
    await afdruk(w, 'venster-pauze.png')
    ok('OMSI draait: lichte stand, na 60 s zonder focus pauze met [Hervatten]', Boolean(licht) && Boolean(pauze) && Boolean(hervat), `pauze na ${tPauze} ms (venster zonder focus), [Hervatten] ${Boolean(hervat)}`)
    // START (OMSI "draait", dus alleen de situatie, omgeleid): het venster gaat dicht.
    const draait = await js(hoofd, `window.career.omsiRunning()`)
    if (draait) {
      await js(hoofd, `document.querySelector('.startknop')?.click(); true`)
      const dicht = await wachtTot(() => w.isDestroyed(), 15000)
      ok('START sluit het venster', Boolean(dicht), `situatie omgeleid: ${fs.existsSync(path.join(omleiding, 'OMSI Enhancer.osn'))}`)
    } else ok('START sluit het venster', false, 'de app ziet het nep-OMSI niet; niet op START gedrukt')
    try {
      nepOmsi.kill()
    } catch {
      // al weg
    }
  }

  uitslag.geweigerd = geweigerd
  uitslag.logboek = logboek().filter((r) => /bus3d venster|busfoto v4|bus3d stalen|FOUT/.test(r)).map((r) => r.slice(0, 260))
  const fout = Object.entries(uitslag.stappen).filter(([, s]) => !s.goed)
  regel('')
  regel(`Tijden (§10 "Het venster"): nieuw venster zichtbaar ${uitslag.tijden.nieuwVensterZichtbaar} ms, eerste plaatje ${uitslag.tijden.nieuwVensterPlaatje} ms (${uitslag.tijden.plaatjeNaLaden} ms na het laden); open venster, nieuwe bus ${uitslag.tijden.openVensterNieuweBus} ms; kiezen -> tegel ${uitslag.tijden.kiezenTotTegelGekozen} ms, venster dicht ${uitslag.tijden.kiezenTotVensterDicht} ms; dicht -> proces weg ${uitslag.tijden.dichtTotProcesWeg} ms`)
  regel(`vangrails: ${geweigerd.length} geweigerd${geweigerd.length ? `: ${geweigerd.slice(0, 3).join('; ')}` : ''}`)
  regel(fout.length === 0 ? 'ALLES GOED' : `${fout.length} FOUT: ${fout.map(([n]) => n).join('; ')}`)
  fs.writeFileSync(path.join(UIT, 'uitslag-venster.json'), JSON.stringify(uitslag, null, 2))
  stop(fout.length === 0 && geweigerd.length === 0 ? 0 : 1)
})
