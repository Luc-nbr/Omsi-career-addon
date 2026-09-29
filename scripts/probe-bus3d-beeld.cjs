/**
 * Bus3D F2: de renderer op de proefset (design/ontwerpen/bus3d.md §10, §13, §14 F2).
 *
 *   npx electron-vite build
 *   node_modules\electron\dist\electron.exe scripts\probe-bus3d-beeld.cjs [--uit <map>] [--bus <nr,nr>] [--snel]
 *
 * Een eigen Electron-hoofdproces, met een EIGEN map voor gebruikersgegevens (in
 * de uitvoermap; Lucs %APPDATA%\omsi-enhancer blijft onaangeroerd) en een lege
 * OMSI_ENHANCER_LIVEMAP. De echte OMSI-map wordt alleen gelezen; OMSI start niet.
 *
 * Wat er draait is de echte keten: de gebouwde werker (out/main/kaartwerker.js,
 * werksoort 'bus3d') bouwt de pakketten, main/bus3d.ts (via tsx) geeft ze met het
 * protocol omsi3d://, en de gebouwde pagina out/renderer/bus3d.html met de preload
 * out/preload/bus3d.js tekent ze in zijn renderer-werker. Het venster staat
 * verborgen (1280x720, DPR 1,5 zoals §10), met `?proef=1` voor het haakje
 * `window.__bv`.
 *
 * Per bus van scripts/bus3d-proefset.json:
 * - KOUD: de cache leeg en de eerste keer dat deze ronde de bestanden leest (dat
 *   kan van de schijf komen; §10 zet daar geen grens op);
 * - NIEUW (§10): opnieuw de cache leeg, nu met de bronnen in de OS-cache, een
 *   verse pagina, laden tot alles scherp staat: de tijd tot het eerste 3D-beeld
 *   en tot scherp, en de lange taken (> 50 ms) op de hoofddraad van de pagina;
 * - WARM: een verse pagina (nieuwe werker en context), het pakket in de cache;
 * - afdrukken: voor, zijkant, achter, schuin, en een close-up van een zijruit
 *   (PNG in <uit>/beeld/<bus>-<hoek>.png), elk met een masker van de bus;
 * - de beeldtijd bij draaien (120 beelden rond, elk tot de GPU klaar is: p50/p95),
 *   het GPU-geheugen (eigen boekhouding, plus het werkgeheugen van het GPU-proces),
 *   de schaduw (vloer onder de bus tegen 3 m ernaast), en het zwarte deel van de
 *   buspixels binnen het masker: max(r,g,b) <= 20 (bijna zwart; zo komt de foto v3
 *   van de O560 op 40%, het "39%" van het ontwerp) en <= 35.
 * Ook de belasting van de GPU door andere programma's (nvidia-smi, als dat er is):
 * draait er een spel, dan zeggen de tijden weinig.
 * Uitkomst: een tabel op het scherm en <uit>/uitslag.json.
 */
const { app, BrowserWindow, ipcMain, protocol } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { Worker } = require('node:worker_threads')
const { execFileSync } = require('node:child_process')

/** Hoe druk de GPU is voordat wij beginnen (nvidia-smi; alleen lezen). */
function gpuBelasting() {
  try {
    return execFileSync('nvidia-smi', ['--query-gpu=utilization.gpu,memory.used', '--format=csv,noheader'], { encoding: 'utf8', timeout: 5000 }).trim()
  } catch {
    return undefined
  }
}

const wortel = path.join(__dirname, '..')
const args = process.argv.slice(2)
const waarde = (naam, standaard) => {
  const i = args.indexOf(naam)
  return i >= 0 && args[i + 1] ? args[i + 1] : standaard
}
const UIT = path.resolve(waarde('--uit', path.join(os.tmpdir(), 'probe-bus3d-beeld')))
const ALLEEN = waarde('--bus', '')
  .split(',')
  .map((s) => Number(s))
  .filter((n) => n > 0)
const SNEL = args.includes('--snel')

const UD = path.join(UIT, 'ud')
const LIVE = path.join(UIT, 'live')
fs.mkdirSync(path.join(UIT, 'beeld'), { recursive: true })
fs.rmSync(UD, { recursive: true, force: true })
fs.mkdirSync(UD, { recursive: true })
fs.mkdirSync(LIVE, { recursive: true })
process.env.OMSI_ENHANCER_LIVEMAP = LIVE

app.setPath('userData', UD)
app.commandLine.appendSwitch('force-device-scale-factor', '1.5')
app.commandLine.appendSwitch('enable-precise-memory-info')
protocol.registerSchemesAsPrivileged([{ scheme: 'omsi3d', privileges: { standard: true, secure: true, supportFetchAPI: true } }])

const tsx = require('tsx/cjs/api')
const { maakBus3dDienst, registreerBus3dIpc } = tsx.require('../src/main/bus3d.ts', __filename)
const { findOmsiInstall } = tsx.require('../src/core/install.ts', __filename)
const { leesPng } = tsx.require('../src/core/png.ts', __filename)

const OMSI = findOmsiInstall()
if (!OMSI) {
  console.error('Geen OMSI 2-installatie gevonden.')
  process.exit(2)
}
const set = JSON.parse(fs.readFileSync(path.join(__dirname, 'bus3d-proefset.json'), 'utf8'))
const logregels = []
const log = (r) => logregels.push(`${new Date().toISOString().slice(11, 23)} ${r}`)

// ------------------------------------------------------------ de werker 'bus3d' (de gebouwde)
let werker
let volgende = 0
const wacht = new Map()
function maakWerker() {
  werker = new Worker(path.join(wortel, 'out', 'main', 'kaartwerker.js'), { workerData: { omsiPath: OMSI, userData: UD } })
  werker.on('message', (a) => {
    const w = wacht.get(a.id)
    if (!w) return
    if (a.tussen !== undefined) return w.tussen?.(a.tussen)
    wacht.delete(a.id)
    if (a.ok) w.klaar(a.uitkomst)
    else w.fout(new Error(a.fout ?? 'werker'))
  })
  werker.on('error', (e) => log(`werker fout: ${e.message}`))
}
function werkerVraag(opdracht, tussen) {
  if (!werker) maakWerker()
  const id = ++volgende
  return new Promise((klaar, fout) => {
    wacht.set(id, { klaar, fout, tussen })
    werker.postMessage({ ...opdracht, id })
  })
}
const dienst = maakBus3dDienst({
  userData: () => UD,
  omsi: () => OMSI,
  werkerVraag,
  sluitWerker: () => {
    void werker?.terminate()
    werker = undefined
  },
  log,
  logFout: (wat, fout) => log(`FOUT ${wat}: ${fout instanceof Error ? fout.message : String(fout)}`),
  omsiDraait: () => false,
  aan: () => true
})

// ------------------------------------------------------------ hulp
const slaap = (ms) => new Promise((k) => setTimeout(k, ms))
const slak = (s) =>
  s
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/\+.*$/, '')
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

async function reken(win, code, ms = 90000) {
  return Promise.race([
    win.webContents.executeJavaScript(code, true),
    slaap(ms).then(() => ({ fout: `tijd (${ms} ms): ${code.slice(0, 60)}` }))
  ])
}

async function versePagina(win) {
  await win.loadFile(path.join(wortel, 'out', 'renderer', 'bus3d.html'), { query: { proef: '1', taal: 'nl' } })
  for (let i = 0; i < 100; i++) {
    if (await reken(win, 'Boolean(window.__bv)')) return
    await slaap(50)
  }
  throw new Error('window.__bv kwam niet')
}

function gpuProces() {
  const g = app.getAppMetrics().find((m) => m.type === 'GPU')
  return g ? Math.round(g.memory.workingSetSize / 1024) : undefined
}

/** Het zwarte deel van de buspixels: max(r,g,b) <= 20 (en <= 35) binnen het masker. */
function zwartDeel(beeldPng, maskerPng) {
  const b = leesPng(beeldPng)
  const m = leesPng(maskerPng)
  if (!b || !m || b.breedte !== m.breedte || b.hoogte !== m.hoogte) return undefined
  let bus = 0
  let zwart = 0
  let bijnaZwart = 0
  let links = b.breedte
  let rechts = -1
  for (let i = 0, p = 0; i < b.pixels.length; i += 4, p++) {
    if (m.pixels[i] < 128) continue
    bus++
    const x = p % b.breedte
    if (x < links) links = x
    if (x > rechts) rechts = x
    const mx = Math.max(b.pixels[i], b.pixels[i + 1], b.pixels[i + 2])
    if (mx <= 20) zwart++
    if (mx <= 35) bijnaZwart++
  }
  return {
    bus,
    zwart: bus ? zwart / bus : 0,
    zwart35: bus ? bijnaZwart / bus : 0,
    breedte: bus ? (rechts - links + 1) / b.breedte : 0
  }
}

/** Blauw in het midden van een close-up (de blauwe stoelen van de O560 achter het glas). */
function blauwDeel(beeldPng, maskerPng) {
  const b = leesPng(beeldPng)
  const m = leesPng(maskerPng)
  if (!b || !m) return undefined
  let bus = 0
  let blauw = 0
  for (let y = Math.floor(b.hoogte * 0.25); y < b.hoogte * 0.75; y++)
    for (let x = Math.floor(b.breedte * 0.25); x < b.breedte * 0.75; x++) {
      const i = (y * b.breedte + x) * 4
      if (m.pixels[i] < 128) continue
      bus++
      const [r, g, bl] = [b.pixels[i], b.pixels[i + 1], b.pixels[i + 2]]
      if (bl > r + 25 && bl > g + 10) blauw++
    }
  return bus ? blauw / bus : 0
}

const kwantiel = (l, q) => {
  if (!l.length) return undefined
  const s = [...l].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))]
}

// ------------------------------------------------------------ de ronde
async function ronde() {
  protocol.handle('omsi3d', (vraag) => dienst.antwoord(vraag))
  registreerBus3dIpc(ipcMain, dienst)
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 720,
    useContentSize: true,
    webPreferences: {
      preload: path.join(wortel, 'out', 'preload', 'bus3d.js'),
      sandbox: false,
      contextIsolation: true,
      backgroundThrottling: false
    }
  })
  win.webContents.on('console-message', (_e, niveau, bericht) => {
    if (niveau >= 2) log(`pagina: ${bericht}`)
  })
  win.webContents.on('render-process-gone', (_e, d) => log(`FOUT pagina weg: ${d.reason}`))

  const gpuAnderen = gpuBelasting()
  await versePagina(win)
  const leeg = { gpuProces: gpuProces(), webgl: await reken(win, 'window.__bv.info()') }
  console.log(`WebGL: ${JSON.stringify(leeg.webgl)}`)
  const uitslag = { omsi: OMSI, uit: UIT, gestart: new Date().toISOString(), gpuAnderen, leeg, bussen: [] }
  console.log(`GPU vóór de ronde (belasting, geheugen): ${gpuAnderen ?? 'onbekend'}`)
  const bussen = set.bussen.filter((b) => !ALLEEN.length || ALLEEN.includes(b.nr))
  for (const b of bussen) {
    const naam = slak(b.naam)
    const r = { nr: b.nr, naam: b.naam, slak: naam, pad: b.pad }
    console.log(`\n== ${b.nr} ${b.naam}`)
    try {
      // KOUD: de eerste lezing in deze ronde.
      dienst.vergeet()
      await versePagina(win)
      r.koud = await reken(win, `window.__bv.laad(${JSON.stringify(b.pad)})`)
      if (r.koud?.fase === 'fout') {
        r.reden = r.koud.reden
        r.detail = r.koud.detail
        console.log(`   ${r.koud.reden}: ${r.koud.detail ?? ''}`)
        uitslag.bussen.push(r)
        continue
      }
      // NIEUW: niets in de cache, de bronnen in de OS-cache.
      dienst.vergeet()
      await versePagina(win)
      await reken(win, 'window.__bv.wisLangeTaken()')
      const nieuw = await reken(win, `window.__bv.laad(${JSON.stringify(b.pad)})`)
      r.nieuw = nieuw
      r.langNieuw = await reken(win, 'window.__bv.langeTaken()')
      if (nieuw?.fase === 'fout') {
        r.reden = nieuw.reden
        r.detail = nieuw.detail
        console.log(`   ${nieuw.reden}: ${nieuw.detail ?? ''}`)
        uitslag.bussen.push(r)
        continue
      }
      // WARM: een verse pagina (nieuwe werker en context), het pakket in de cache.
      await versePagina(win)
      await reken(win, 'window.__bv.wisLangeTaken()')
      const warm = await reken(win, `window.__bv.laad(${JSON.stringify(b.pad)})`)
      r.warm = warm
      r.langWarm = await reken(win, 'window.__bv.langeTaken()')
      await slaap(300)

      // Afdrukken.
      const W = 1440
      const H = 810
      const hoeken = {
        voor: { draai: 180, kantel: 6, zoom: 1 },
        zijkant: { draai: 270, kantel: 5, zoom: 1 },
        achter: { draai: 0, kantel: 6, zoom: 1 },
        schuin: { draai: 215, kantel: 8, zoom: 1 }
      }
      r.beeld = {}
      for (const [hoek, stand] of Object.entries(hoeken)) {
        const a = await reken(win, `window.__bv.afdruk(${JSON.stringify({ stand, b: W, h: H, masker: true, formaat: 'png' })})`)
        if (!a?.beeld) {
          r.beeld[hoek] = { fout: a?.fout ?? 'geen beeld' }
          continue
        }
        const png = Buffer.from(a.beeld, 'base64')
        const masker = Buffer.from(a.masker, 'base64')
        fs.writeFileSync(path.join(UIT, 'beeld', `${naam}-${hoek}.png`), png)
        if (hoek === 'schuin') fs.writeFileSync(path.join(UIT, 'beeld', `${naam}-${hoek}-masker.png`), masker)
        r.beeld[hoek] = zwartDeel(png, masker)
      }
      r.geheugen = await reken(win, `window.__bv.meet('geheugen')`)
      uitslag.bussen.push(r)
      r.ruit = await closeUp(win, naam, W, H, r.geheugen?.doos)

      if (!SNEL) {
        r.draaien = await reken(win, `window.__bv.meet('draaien', 120)`)
        r.schaduw = await reken(win, `window.__bv.meet('schaduw')`)
      }
      r.gpuProces = gpuProces()
      // Het heldenbeeld dat het venster wegschreef toen de bus scherp stond (§9): bewaren naast de afdrukken.
      const hMap = path.join(UD, 'bus3d', 'v1', 'h')
      const helden = fs.existsSync(hMap) ? fs.readdirSync(hMap).filter((n) => n.startsWith(`${warm?.pakket}-`)) : []
      r.heldenbeelden = helden.length
      if (helden[0]) fs.copyFileSync(path.join(hMap, helden[0]), path.join(UIT, 'beeld', `${naam}-held.webp`))
      console.log(
        `   nieuw: eerste beeld ${nieuw?.eersteBeeldMs} ms, scherp ${nieuw?.scherpMs} ms; warm: ${warm?.eersteBeeldMs} / ${warm?.scherpMs} ms; ` +
          `lange taken ${JSON.stringify(r.langNieuw)} / ${JSON.stringify(r.langWarm)}`
      )
      console.log(
        `   zwart (<=20) schuin ${pct(r.beeld.schuin?.zwart)}, zijkant ${pct(r.beeld.zijkant?.zwart)} (<=35: ${pct(r.beeld.schuin?.zwart35)}); breedte zijkant ${pct(r.beeld.zijkant?.breedte)}; blauw ruit ${pct(r.ruit?.blauw)}; ` +
          `draaien p95 ${r.draaien?.p95?.toFixed?.(1)} ms; schaduw ${pct(r.schaduw?.donkerder)} donkerder; GPU ${mb(r.geheugen?.totaal)} MB (tex ${mb(r.geheugen?.texturen)}), GPU-proces ${r.gpuProces} MB`
      )
    } catch (fout) {
      r.fout = String(fout?.stack ?? fout)
      console.log(`   FOUT ${r.fout}`)
      uitslag.bussen.push(r)
    }
  }
  uitslag.klaar = new Date().toISOString()
  fs.writeFileSync(path.join(UIT, 'uitslag.json'), JSON.stringify(uitslag, null, 2))
  fs.writeFileSync(path.join(UIT, 'log.txt'), logregels.join('\n'))
  tabel(uitslag)
  win.destroy()
}

/**
 * De close-up van een zijruit: de camera op de deurkant (rechts, in de wereld
 * -X), dichtbij, in de achterste helft van de voorwagen, op ruithoogte.
 */
async function closeUp(win, naam, W, H, d) {
  if (!d) return undefined
  const lengte = d.max[2] - d.min[2]
  const hoogte = d.max[1] - d.min[1]
  const doel = [d.min[0], d.min[1] + hoogte * 0.6, (d.min[2] + d.max[2]) / 2 - lengte * 0.18]
  const a = await reken(
    win,
    `window.__bv.afdruk(${JSON.stringify({ stand: { draai: 262, kantel: 4, zoom: 1 }, doel, afstand: 4.2, b: W, h: H, masker: true, formaat: 'png' })})`
  )
  if (!a?.beeld) return { fout: a?.fout }
  const png = Buffer.from(a.beeld, 'base64')
  const masker = Buffer.from(a.masker, 'base64')
  fs.writeFileSync(path.join(UIT, 'beeld', `${naam}-ruit.png`), png)
  return { blauw: blauwDeel(png, masker), ...zwartDeel(png, masker) }
}

const pct = (x) => (typeof x === 'number' ? `${(x * 100).toFixed(1)}%` : '-')
const mb = (x) => (typeof x === 'number' ? (x / 1048576).toFixed(0) : '-')

function tabel(u) {
  console.log(`\nGPU van anderen: ${u.gpuAnderen ?? '?'}`)
  console.log('\nbus                         koud 1e/scherp  nieuw 1e/scherp  warm 1e/scherp   p95 draai  GPU MB  GPU-pr  zwart20 zwart35 schaduw  lang>50ms')
  for (const r of u.bussen) {
    if (r.reden || r.fout) {
      console.log(`${String(r.nr).padStart(2)} ${r.naam.slice(0, 24).padEnd(24)}  ${r.reden ?? 'FOUT'}`)
      continue
    }
    const lang = [...(r.langNieuw ?? []), ...(r.langWarm ?? [])]
    const paar = (x) => `${String(x?.eersteBeeldMs).padStart(6)}/${String(x?.scherpMs).padEnd(6)}`
    console.log(
      `${String(r.nr).padStart(2)} ${r.naam.slice(0, 24).padEnd(24)}  ${paar(r.koud)}  ${paar(r.nieuw)}   ${paar(r.warm)}   ` +
        `${(r.draaien?.p95 ?? 0).toFixed(1).padStart(6)}   ${mb(r.geheugen?.totaal).padStart(5)}  ${String(r.gpuProces).padStart(6)}  ` +
        `${pct(r.beeld?.schuin?.zwart).padStart(6)}  ${pct(r.beeld?.schuin?.zwart35).padStart(6)}  ${pct(r.schaduw?.donkerder).padStart(6)}  ${lang.filter((x) => x > 50).length}`
    )
  }
}

app.whenReady().then(async () => {
  try {
    await ronde()
  } catch (fout) {
    console.error(fout)
    process.exitCode = 1
  } finally {
    await werker?.terminate()
    app.quit()
  }
})
app.on('window-all-closed', () => undefined)
