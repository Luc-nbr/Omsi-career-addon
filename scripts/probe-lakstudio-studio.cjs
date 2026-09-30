/**
 * De Lakstudio L3: de studio voor spelers in het echte 3D-venster
 * (design/ontwerpen/lakstudio.md §2.1, §9 P11, P14, P16).
 *
 *   npx electron-vite build
 *   node_modules\electron\dist\electron.exe scripts\probe-lakstudio-studio.cjs --uit <afdrukmap> --proef <proefmap> [--bus o560,sd77,c2]
 *
 * Speelt de eerste 60 seconden na (§2.1) op drie bussen: de studio openen zoals
 * [Lak maken] dat doet, Snelle lak (kleur 1, kleur 2 met de onderband, de naam
 * op de bus, een logo dat op het paneel valt), [Verder in de studio], de
 * bovenrand van de band naar de raamlijn slepen en de tekst iets naar achteren,
 * [Voor/na], en [Opslaan in OMSI]. Daarna [Terug naar de kleurstellingen]: het
 * 3D-venster toont de bus in de nieuwe lak, gelezen uit de .cti en de DDS die
 * net geschreven zijn. Plus P14 (de starts "Effen in de kleuren van deze lak" en
 * "Effen", op afdrukken voor Luc) en P16 (een busoptie wisselen, ≤ 300 ms).
 *
 * NOOIT in de echte OMSI-map: alles draait op een NAGEBOOTSTE OMSI-map met
 * kopieën van de drie busmappen (zonder geluid; de repaints van de gelede C2
 * alleen als kop), plus envir.cfg, de hemel en de wolken. Die staat in
 * `<proefmap>/l3/omsi/OMSI 2`, met een korte ingang `%TEMP%\lk3` (een junction;
 * paden boven 259 tekens weigert het plan terecht). Een eigen map voor
 * gebruikersgegevens en een eigen LIVEMAP. De echte OMSI-map wordt alleen gelezen
 * (om de kopie te maken), en de proef kijkt na dat daar geen ~Lakstudio_-bestand
 * bij kwam.
 *
 * Main is hier main/bus3d.ts, main/bus3dvenster.ts en main/lakstudio.ts (via tsx),
 * met een verborgen "hoofdvenster" dat alleen de brug van de app laadt om
 * `bus3dOpen` te vragen. De vensters worden zonder focus en doorzichtig getoond.
 */
const { app, BrowserWindow, ipcMain, protocol } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { Worker } = require('node:worker_threads')

const wortel = path.join(__dirname, '..')
const args = process.argv.slice(2)
const waarde = (naam, standaard) => {
  const i = args.indexOf(naam)
  return i >= 0 && args[i + 1] ? args[i + 1] : standaard
}
const UIT = path.resolve(waarde('--uit', path.join(os.tmpdir(), 'probe-lakstudio-studio')))
const PROEF = path.resolve(waarde('--proef', path.join(os.tmpdir(), 'proef')))
const ALLEEN = waarde('--bus', '').split(',').filter(Boolean)
const ECHT = process.env.OMSI_ECHT || 'C:/Program Files (x86)/Steam/steamapps/common/OMSI 2'
fs.mkdirSync(UIT, { recursive: true })

/* ------------------------------------------------------------------ de nagebootste OMSI-map */
const LANG = path.join(PROEF, 'l3', 'omsi')
const KORT = path.join(process.env.TEMP || os.tmpdir(), 'lk3')
fs.mkdirSync(LANG, { recursive: true })
if (!fs.existsSync(KORT)) execFileSync('cmd', ['/c', 'mklink', '/J', KORT, LANG], { stdio: 'ignore' })
if (fs.realpathSync(KORT).toLowerCase() !== fs.realpathSync(LANG).toLowerCase()) {
  console.error(`${KORT} wijst niet naar ${LANG}`)
  process.exit(2)
}
const NEP = path.join(KORT, 'OMSI 2')
const BUSMAPPEN = ['ABCoach_O560', 'MAN_SD200', 'MB_C2_EN_BVG']
/** De repaints van de gelede C2 (1,9 GB): die zijn voor deze proef niet nodig, alleen hun kop. */
const ALLEEN_KOP = /[\\/]Texture[\\/]Repaints[\\/](rep_BVG_GN|rep_GN|rep_GN_4T|rep_UE_GN)([\\/]|$)/i
const BEELD = /\.(dds|tga|bmp|png|jpg|jpeg)$/i

function kopieer(van, naar, telling) {
  fs.mkdirSync(naar, { recursive: true })
  for (const d of fs.readdirSync(van, { withFileTypes: true })) {
    const a = path.join(van, d.name)
    const b = path.join(naar, d.name)
    if (d.isDirectory()) {
      if (/^sound/i.test(d.name)) continue
      fs.mkdirSync(b, { recursive: true })
      kopieer(a, b, telling)
    } else if (ALLEEN_KOP.test(a) && BEELD.test(d.name)) {
      const fd = fs.openSync(a, 'r')
      const buf = Buffer.alloc(4096)
      const len = fs.readSync(fd, buf, 0, 4096, 0)
      fs.closeSync(fd)
      fs.writeFileSync(b, buf.subarray(0, len))
      telling.kop++
    } else {
      fs.copyFileSync(a, b)
      telling.heel++
      telling.bytes += fs.statSync(b).size
    }
  }
}

function maakNep() {
  const merk = path.join(NEP, '.nagebootst')
  if (fs.existsSync(merk)) return fs.readFileSync(merk, 'utf8')
  if (path.resolve(fs.realpathSync(KORT)).toLowerCase().startsWith(path.resolve(ECHT).toLowerCase())) throw new Error('de proefmap ligt in de echte OMSI-map')
  fs.rmSync(NEP, { recursive: true, force: true })
  const telling = { heel: 0, kop: 0, bytes: 0 }
  const t0 = Date.now()
  for (const m of BUSMAPPEN) kopieer(path.join(ECHT, 'Vehicles', m), path.join(NEP, 'Vehicles', m), telling)
  kopieer(path.join(ECHT, 'SDK', 'RepaintTool', 'MAN SD'), path.join(NEP, 'SDK', 'RepaintTool', 'MAN SD'), telling)
  for (const m of ['Texture', 'Weather', 'maps', 'Sceneryobjects', 'Splines', 'plugins', 'Fonts']) fs.mkdirSync(path.join(NEP, m), { recursive: true })
  fs.copyFileSync(path.join(ECHT, 'envir.cfg'), path.join(NEP, 'envir.cfg'))
  fs.copyFileSync(path.join(ECHT, 'Weather', 'clouds.cfg'), path.join(NEP, 'Weather', 'clouds.cfg'))
  for (const t of ['himmel01.bmp', 'himmel04.bmp', 'himmel05.bmp', 'Cumulus_1.tga']) {
    const a = path.join(ECHT, 'Texture', t)
    if (fs.existsSync(a)) fs.copyFileSync(a, path.join(NEP, 'Texture', t))
  }
  fs.writeFileSync(path.join(NEP, 'Omsi.exe'), '')
  const tekst = `nagebootst ${new Date().toISOString()}: ${telling.heel} bestanden (${(telling.bytes / 1e9).toFixed(2)} GB), ${telling.kop} alleen de kop, ${Math.round((Date.now() - t0) / 1000)} s`
  fs.writeFileSync(merk, tekst)
  return tekst
}

/** Geen ~Lakstudio_-.cti in de echte OMSI-map (de CTC-mappen van de drie bussen). */
function echteLakken() {
  const uit = []
  const loop = (m, diepte) => {
    let items
    try {
      items = fs.readdirSync(m, { withFileTypes: true })
    } catch {
      return
    }
    for (const d of items) {
      if (d.isDirectory() && diepte < 4) loop(path.join(m, d.name), diepte + 1)
      else if (/^~Lakstudio_/i.test(d.name)) uit.push(path.join(m, d.name))
    }
  }
  for (const b of BUSMAPPEN) loop(path.join(ECHT, 'Vehicles', b, 'Texture'), 0)
  return uit
}

const nepTekst = maakNep()

/**
 * Wat een vorige ronde in de NAGEBOOTSTE map zette (de gebruikersmap is elke
 * ronde nieuw, dus die lakken zijn hier wezen): weg, zodat de naam weer vrij is.
 * Alleen onder de nagebootste map.
 */
function ruimNepOp() {
  const echt = fs.realpathSync(NEP).toLowerCase()
  let weg = 0
  const loop = (m, diepte) => {
    for (const d of fs.readdirSync(m, { withFileTypes: true })) {
      const p = path.join(m, d.name)
      if (!fs.realpathSync(p).toLowerCase().startsWith(echt)) continue
      if (d.isDirectory() && d.name === 'Lakstudio') {
        fs.rmSync(p, { recursive: true, force: true })
        weg++
      } else if (d.isDirectory() && diepte < 5) loop(p, diepte + 1)
      else if (/^~Lakstudio_.*\.cti$/i.test(d.name)) {
        fs.rmSync(p, { force: true })
        weg++
      }
    }
  }
  for (const b of BUSMAPPEN) loop(path.join(NEP, 'Vehicles', b, 'Texture'), 0)
  return weg
}
const opgeruimd = ruimNepOp()
if (path.resolve(fs.realpathSync(NEP)).toLowerCase() === path.resolve(ECHT).toLowerCase()) {
  console.error('De nagebootste map is de echte OMSI-map: gestopt.')
  process.exit(2)
}
const echtVoor = echteLakken()

/* ------------------------------------------------------------------ Electron */
const UD = path.join(UIT, 'ud')
const LIVE = path.join(UIT, 'live')
fs.rmSync(UD, { recursive: true, force: true })
fs.mkdirSync(UD, { recursive: true })
fs.mkdirSync(LIVE, { recursive: true })
process.env.OMSI_ENHANCER_LIVEMAP = LIVE
app.setPath('userData', UD)
protocol.registerSchemesAsPrivileged([{ scheme: 'omsi3d', privileges: { standard: true, secure: true, supportFetchAPI: true } }])

const tsx = require('tsx/cjs/api')
const { maakBus3dDienst, registreerBus3dIpc } = tsx.require('../src/main/bus3d.ts', __filename)
const { maakBus3dVenster } = tsx.require('../src/main/bus3dvenster.ts', __filename)
const { maakLakstudio } = tsx.require('../src/main/lakstudio.ts', __filename)
const { maakGrendel } = tsx.require('../src/main/grendel.ts', __filename)
const { kleurstellingenVanBus, eigenKleurstellingen, zoekKleurstelling } = tsx.require('../src/core/kleurstelling.ts', __filename)
const { omsiHoofdletters } = tsx.require('../src/shared/lak.ts', __filename)
const { leesDdsKop } = tsx.require('../src/shared/dds.ts', __filename)

const logregels = []
const log = (r) => logregels.push(`${new Date().toISOString().slice(11, 23)} ${r}`)

let werker
let volgende = 0
const wacht = new Map()
function maakWerker() {
  werker = new Worker(path.join(wortel, 'out', 'main', 'kaartwerker.js'), { workerData: { omsiPath: NEP, userData: UD } })
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
  omsi: () => NEP,
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

/* ------------------------------------------------------------------ hulp */
const slaap = (ms) => new Promise((k) => setTimeout(k, ms))
let fouten = 0
const regels = []
const uitslag = { nep: nepTekst, opgeruimd, bussen: {} }
function meld(wat) {
  const r = `info ${wat}`
  console.log(r)
  regels.push(r)
}
function klopt(wat, ja) {
  const r = `${ja ? 'ok  ' : 'FOUT'} ${wat}`
  console.log(r)
  regels.push(r)
  if (!ja) fouten++
}
const js = (w, code, ms = 120000) =>
  Promise.race([w.webContents.executeJavaScript(code, true), slaap(ms).then(() => ({ __tijd: true }))]).catch((f) => ({ __fout: String(f) }))
async function wachtOp(w, code, ms = 60000, stap = 100) {
  const eind = Date.now() + ms
  while (Date.now() < eind) {
    if (!w || w.isDestroyed()) return undefined
    const u = await js(w, code, 5000)
    if (u && !u.__fout && !u.__tijd) return u
    await slaap(stap)
  }
  return undefined
}
const venster3d = () => BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && /bus3d\.html/.test(w.webContents.getURL()))
async function afdruk(w, naam, rect) {
  if (!w || w.isDestroyed()) return
  w.webContents.invalidate()
  await Promise.race([js(w, 'new Promise((k) => requestAnimationFrame(() => requestAnimationFrame(() => k(true))))', 3000), slaap(800)])
  await slaap(250)
  const beeld = await w.webContents.capturePage(rect)
  const bestand = path.join(UIT, `${naam}.png`)
  fs.writeFileSync(bestand, beeld.toPNG())
  meld(`afdruk ${bestand}`)
  return bestand
}
/** Een waarde zetten zoals een speler dat doet: de setter van het element, dan input (en change). */
const zetWaarde = (selector, waarde, change = true) => `(() => {
  const el = document.querySelector(${JSON.stringify(selector)})
  if (!el) return false
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  setter.call(el, ${JSON.stringify(waarde)})
  el.dispatchEvent(new Event('input', { bubbles: true }))
  ${change ? "el.dispatchEvent(new Event('change', { bubbles: true }))" : ''}
  return true
})()`
const klik = (selector) => `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el || el.disabled) return false; el.click(); return true })()`
const midden = (selector) =>
  `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } })()`
/** Slepen met de muis over het beeld (echte invoer: pointerdown, -move, -up op het doek). */
async function sleepMuis(w, van, naar, stappen = 12) {
  const wc = w.webContents
  wc.sendInputEvent({ type: 'mouseMove', x: van.x, y: van.y })
  wc.sendInputEvent({ type: 'mouseDown', x: van.x, y: van.y, button: 'left', clickCount: 1 })
  for (let i = 1; i <= stappen; i++) {
    await slaap(35)
    const x = Math.round(van.x + ((naar.x - van.x) * i) / stappen)
    const y = Math.round(van.y + ((naar.y - van.y) * i) / stappen)
    wc.sendInputEvent({ type: 'mouseMove', x, y, button: 'left', modifiers: ['leftButtonDown'] })
  }
  await slaap(250)
  wc.sendInputEvent({ type: 'mouseUp', x: naar.x, y: naar.y, button: 'left', clickCount: 1 })
  await slaap(200)
}
const stand = (w) => js(w, '({ s: document.documentElement.dataset.lakstudio, lagen: document.documentElement.dataset.lakLagen, zones: document.documentElement.dataset.lakZones, uit: document.documentElement.dataset.lakUitkomst, naam: document.documentElement.dataset.lakNaam, klaarMs: document.documentElement.dataset.lakKlaarMs })')

/** Een logo zoals een speler het heeft: PNG, geen doorzichtigheid, witte rand. */
const LOGO = `(async () => {
  const c = new OffscreenCanvas(480, 240)
  const x = c.getContext('2d')
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 480, 240)
  x.fillStyle = '#d42a2a'; x.beginPath(); x.arc(120, 120, 90, 0, Math.PI * 2); x.fill()
  x.fillStyle = '#ffffff'; x.font = 'bold 110px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('L', 120, 128)
  x.fillStyle = '#1b2f6b'; x.font = 'bold 70px Arial'; x.textAlign = 'left'; x.fillText('LUC', 230, 128)
  const blob = await c.convertToBlob({ type: 'image/png' })
  const f = new File([blob], 'logo.png', { type: 'image/png' })
  const dt = new DataTransfer(); dt.items.add(f)
  const vak = document.querySelector('[data-vak="logo"]')
  if (!vak) return false
  vak.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }))
  vak.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }))
  return true
})()`

/* ------------------------------------------------------------------ de bussen */
const BUSSEN = [
  { kort: 'o560', rel: 'Vehicles\\ABCoach_O560\\O560_E6.bus', titel: 'Mercedes-Benz O560 Intouro E6', naam: 'Stadtwerke Lucstad', kleur1: '#1d3f8f', kleur2: '#ffffff' },
  { kort: 'sd77', rel: 'Vehicles\\MAN_SD200\\MAN_SD77.bus', titel: 'MAN SD200 · SD77', naam: 'Stadtwerke Lucstad', kleur1: '#0f5a36', kleur2: '#f2c200' },
  { kort: 'c2', rel: 'Vehicles\\MB_C2_EN_BVG\\MB_C2_E6_Solo.bus', titel: 'Mercedes-Benz Citaro C2 E6', naam: 'Stadtwerke Lucstad', kleur1: '#7a1020', kleur2: '#ffffff' }
].filter((b) => ALLEEN.length === 0 || ALLEEN.includes(b.kort))

function startKleur(rel) {
  const k = kleurstellingenVanBus(path.join(NEP, rel))
  const namen = (k?.lijst ?? []).map((x) => x.naam)
  return namen.find((n) => /bvg/i.test(n)) ?? namen[0]
}

let hoofd
/** OMSI "draait" (P15 in de studio): een nagebootste stand, geen echt proces. */
let omsiNep = false
let venster
let lakstudio
async function open(vraag) {
  const n = await hoofd.webContents.executeJavaScript(`window.career.bus3dOpen(${JSON.stringify(vraag)})`, true)
  return n
}

async function zestigSeconden(b) {
  const u = { bus: b.rel }
  uitslag.bussen[b.kort] = u
  const kleurstelling = startKleur(b.rel)
  u.start = kleurstelling
  meld(`${b.kort}: ${b.rel}, in "${kleurstelling ?? 'Standaard'}"`)
  const t0 = Date.now()
  const handelingen = []
  const doe = (wat) => handelingen.push({ ms: Date.now() - t0, wat })

  // 0:00 [Lak maken] op de tegel.
  const aanvraag = await open({ doel: 'lakstudio', relatiefPad: b.rel, kleurstelling, titel: b.titel, naam: ['', b.titel, ''], vorm: 'solo' })
  doe('Lak maken')
  klopt(`${b.kort}: het 3D-venster opent in de studio (volgnummer ${aanvraag})`, aanvraag > 0)
  let w
  for (let i = 0; i < 100 && !w; i++) {
    w = venster3d()
    if (!w) await slaap(50)
  }
  if (!w) return klopt(`${b.kort}: 3D-venster`, false)
  const klaar = await wachtOp(w, "document.documentElement.dataset.lakstudio === 'klaar' && document.documentElement.dataset.doel === undefined ? true : document.documentElement.dataset.lakstudio === 'klaar'", 120000)
  u.studioKlaarMs = Date.now() - t0
  klopt(`${b.kort}: de studio staat klaar (${u.studioKlaarMs} ms; lakdoek ${(await stand(w)).klaarMs} ms)`, Boolean(klaar))
  const s0 = await stand(w)
  u.zones = Number(s0.zones)
  klopt(`${b.kort}: P14 hooguit 8 kleurzones (${s0.zones})`, Number(s0.zones) <= 8)
  klopt(`${b.kort}: een nieuw project zonder lagen (de bus staat nog in zijn eigen lak)`, s0.lagen === '0')
  klopt(`${b.kort}: het paneel Snelle lak staat open`, Boolean(await js(w, "Boolean(document.querySelector('[data-paneel=\"snel\"]'))")))
  await afdruk(w, `${b.kort}-1-studio-open`)

  // 0:05 kleur 1, 0:10 kleur 2 (de onderband staat al gekozen).
  await js(w, zetWaarde('[data-staal="0"] input', b.kleur1))
  doe('kleur 1')
  await slaap(600)
  await afdruk(w, `${b.kort}-2-kleur1`)
  await js(w, zetWaarde('[data-staal="1"] input', b.kleur2))
  doe('kleur 2')
  await slaap(300)
  // 0:15 de naam op de bus.
  await js(w, zetWaarde('input[name="snelNaam"]', b.naam, false))
  doe('naam')
  await slaap(500)
  // 0:22 het logo uit de Verkenner op het paneel.
  klopt(`${b.kort}: het logo valt op het paneel`, Boolean(await js(w, LOGO)))
  doe('logo')
  const lagen = await wachtOp(w, "Number(document.documentElement.dataset.lakLagen) >= 4 ? document.documentElement.dataset.lakLagen : false", 20000)
  klopt(`${b.kort}: Snelle lak gaf grondkleur, band, tekst en logo als lagen (${lagen})`, Number(lagen) === 4)
  const namen = await js(w, "[...document.querySelectorAll('.ls-laagnaam')].map((e) => e.textContent)")
  meld(`${b.kort}: lagen ${JSON.stringify(namen)}`)
  const naamVeld = await js(w, "document.querySelector('input[name=\"lakNaam\"]').value")
  klopt(`${b.kort}: het naamveld volgt de naam op de bus ("${naamVeld}")`, naamVeld === b.naam)
  await slaap(1200)
  // Naam en logo op een vrij stuk, aan beide kanten (beoordeling L3 punt 1 en 2): de werker meet op het zijbeeld.
  const analyse = await wachtOp(
    w,
    `(() => { const a = JSON.parse(document.documentElement.dataset.lakAnalyse || '{}'); return a['r-tekst'] && a['r-logo'] && a['r-tekst'].vrij !== undefined && a['r-logo'].vrij !== undefined ? a : false })()`,
    8000
  )
  u.snelPlek = analyse
  for (const id of ['r-tekst', 'r-logo']) {
    const a = analyse?.[id]
    klopt(
      `${b.kort}: ${id === 'r-tekst' ? 'de naam' : 'het logo'} van Snelle lak op vrije lak aan beide kanten (eigen kant ${a?.vrij}, kopie ${a?.kopie ? a.vrijKopie : 'geen'}; ≥ 0,98 en een kopie)`,
      Boolean(a && a.kopie && a.vrij >= 0.98 && a.vrijKopie >= 0.98)
    )
  }
  await afdruk(w, `${b.kort}-3-snellelak`)

  // 0:28 [Verder in de studio]: de band is gekozen; de bovenrand omhoog naar de raamlijn.
  await js(w, klik('[data-knop="verder"]'))
  doe('Verder in de studio')
  await slaap(500)
  const rand = await wachtOp(w, midden('[data-rand="h2"] rect'), 5000)
  klopt(`${b.kort}: de bovenrand van de band heeft een handvat`, Boolean(rand))
  if (rand) {
    const voor = await js(w, `(() => { const l = document.querySelector('[data-rand="h2"] line'); return l ? Number(l.getAttribute('y1')) : null })()`)
    // Een stukje omhoog, niet tot de raamlijn: dan blijft de witte naam op de grondkleur leesbaar.
    await sleepMuis(w, rand, { x: rand.x, y: rand.y - 22 })
    doe('band slepen')
    const na = await js(w, `(() => { const l = document.querySelector('[data-rand="h2"] line'); return l ? Number(l.getAttribute('y1')) : null })()`)
    klopt(`${b.kort}: de rand ging omhoog (${voor} → ${na} px)`, voor !== null && na !== null && na < voor - 5)
  }
  // De tekst iets naar achteren slepen: eerst de tekstlaag kiezen, dan zijn kader.
  await js(w, `(() => { const r = [...document.querySelectorAll('.ls-laagnaam')].find((e) => e.textContent === 'Tekst'); r?.click(); return Boolean(r) })()`)
  await slaap(400)
  const tekstKader = await wachtOp(
    w,
    `(() => { const p = document.querySelector('.ls-kader:not(.ls-kopie)'); if (!p) return null; const r = p.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), b: r.width } })()`,
    5000
  )
  if (tekstKader) {
    await sleepMuis(w, tekstKader, { x: tekstKader.x - Math.round(Math.min(120, tekstKader.b / 3)), y: tekstKader.y })
    doe('tekst slepen')
  }
  klopt(`${b.kort}: de tekst heeft een kader om te slepen`, Boolean(tekstKader))
  await slaap(800)
  await afdruk(w, `${b.kort}-4-verder`)

  // 0:42 [Voor/na] ingedrukt: het origineel.
  const vn = await js(w, midden('[data-knop="voorna"]'))
  if (vn) {
    w.webContents.sendInputEvent({ type: 'mouseDown', x: vn.x, y: vn.y, button: 'left', clickCount: 1 })
    await slaap(700)
    await afdruk(w, `${b.kort}-5-voorna`)
    w.webContents.sendInputEvent({ type: 'mouseUp', x: vn.x, y: vn.y, button: 'left', clickCount: 1 })
    doe('Voor/na')
  }
  await slaap(300)

  // 0:48 [Opslaan in OMSI].
  const tOpslaan = Date.now()
  klopt(`${b.kort}: [Opslaan in OMSI] is te klikken`, Boolean(await js(w, klik('[data-knop="opslaan"]'))))
  doe('Opslaan in OMSI')
  const eind = await wachtOp(w, "['ok', 'klaargezet', 'fout'].includes(document.documentElement.dataset.lakstudio) ? document.documentElement.dataset.lakstudio : false", 180000)
  u.opslaanMs = Date.now() - tOpslaan
  const s1 = await stand(w)
  u.uitkomst = s1.uit
  klopt(`${b.kort}: opgeslagen in ${u.opslaanMs} ms (${s1.uit})`, eind === 'ok')
  u.totaalMs = Date.now() - t0
  u.handelingen = handelingen
  await afdruk(w, `${b.kort}-6-opgeslagen`)

  // In de nagebootste map: een ~Lakstudio_-.cti en DDS'en; de naam in de lijst, als eigen lak.
  const lijst = kleurstellingenVanBus(path.join(NEP, b.rel))
  const eigen = eigenKleurstellingen(path.join(NEP, b.rel))
  const gevonden = zoekKleurstelling(lijst, b.naam)
  u.index = gevonden?.index
  klopt(`${b.kort}: kleurstelling.ts ziet '${b.naam}' (nummer ${gevonden?.index})`, Boolean(gevonden))
  klopt(`${b.kort}: als eigen lak (aan de bestandsnaam)`, eigen.has(omsiHoofdletters(b.naam)))
  const ctc = path.dirname(path.join(NEP, b.rel))
  const ctis = []
  const zoek = (m, d) => {
    for (const e of fs.readdirSync(m, { withFileTypes: true })) {
      if (e.isDirectory() && d < 5) zoek(path.join(m, e.name), d + 1)
      else if (/^~Lakstudio_.*\.cti$/i.test(e.name)) ctis.push(path.join(m, e.name))
    }
  }
  zoek(ctc, 0)
  u.cti = ctis.map((c) => path.relative(NEP, c))
  const dds = []
  for (const c of ctis) {
    const map = path.dirname(c)
    const tekst = fs.readFileSync(c, 'latin1')
    for (const r of tekst.split('\r\n')) if (/\.dds$/i.test(r)) dds.push(path.join(map, r))
  }
  const koppen = dds.map((d) => (fs.existsSync(d) ? leesDdsKop(new Uint8Array(fs.readFileSync(d))) : undefined))
  klopt(`${b.kort}: ${ctis.length} .cti en ${dds.length} DDS, allemaal met een DX9-kop en een volle keten`, ctis.length >= 1 && dds.length >= 1 && koppen.every((k) => k && k.compleet && !k.dx10))

  // [Terug naar de kleurstellingen]: de bus in de nieuwe lak, uit de .cti en de DDS van net.
  await js(w, klik('[data-knop="terug"]'))
  const terug = await wachtOp(
    w,
    `document.documentElement.dataset.doel === 'buskeuze' && document.documentElement.dataset.bus === ${JSON.stringify(b.rel)} && document.documentElement.dataset.inBeeld === ${JSON.stringify(b.naam)}`,
    20000
  )
  klopt(`${b.kort}: terug bij de kleurstellingen, met de nieuwe lak in beeld`, Boolean(terug))
  const rij = await wachtOp(w, `(() => { const r = [...document.querySelectorAll('.bv-rij')].find((x) => x.textContent.includes(${JSON.stringify(b.naam)})); return r ? r.textContent : false })()`, 20000)
  klopt(`${b.kort}: de lijst noemt de lak, met het label Eigen ("${rij}")`, typeof rij === 'string' && /Eigen/.test(rij))
  await wachtOp(w, "document.querySelector('.bv-kader')?.dataset.fase === 'scherp'", 60000)
  await slaap(1500)
  await afdruk(w, `${b.kort}-7-nieuwe-lak`)
  const beeld = await js(w, `(() => { const r = document.querySelector('.bv-beeld').getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) } })()`)
  if (beeld && !beeld.__fout) await afdruk(w, `${b.kort}-7b-bus-in-nieuwe-lak`, beeld)
  return w
}

/** P14 en P16 op een nieuw project: de starts, en een busoptie wisselen. */
async function startsEnOpties(b) {
  const u = uitslag.bussen[b.kort] ?? (uitslag.bussen[b.kort] = {})
  const kleurstelling = startKleur(b.rel)
  await open({ doel: 'lakstudio', relatiefPad: b.rel, kleurstelling, titel: b.titel, naam: ['', b.titel, ''], vorm: 'solo' })
  const w = venster3d()
  await slaap(300)
  const klaar = await wachtOp(w, "document.documentElement.dataset.lakstudio === 'klaar'", 120000)
  klopt(`${b.kort}: tweede keer de studio (nieuw project)`, Boolean(klaar))
  await js(w, klik('[data-start="effenKleuren"]'))
  const lagen = await wachtOp(w, "Number(document.documentElement.dataset.lakLagen) > 0 ? document.documentElement.dataset.lakLagen : false", 20000)
  u.effenKleurenLagen = Number(lagen)
  klopt(`${b.kort}: P14 "Effen in de kleuren van deze lak" geeft zonelagen (${lagen})`, Number(lagen) >= 1 && Number(lagen) <= 8)
  await slaap(1500)
  await afdruk(w, `${b.kort}-8-effen-in-de-kleuren`)
  // Start wisselen → Effen: geen lagen, de basis zonder logo's.
  await js(w, klik('[data-knop="meer"]'))
  await js(w, `(() => { const k = [...document.querySelectorAll('.ls-menu button')][2]; k?.click(); return Boolean(k) })()`)
  await slaap(200)
  await js(w, `(() => { const r = [...document.querySelectorAll('input[name="start"]')][3]; r?.click(); return Boolean(r) })()`)
  const leeg = await wachtOp(w, "document.documentElement.dataset.lakLagen === '0'", 10000)
  klopt(`${b.kort}: P14 "Effen": geen lagen`, Boolean(leeg))
  // Effen met één grondkleur: rubbers en lampen blijven staan (op de afdruk voor Luc).
  await js(w, klik('[data-gereedschap="vullen"]'))
  await slaap(300)
  // Een punt op de carrosserie onder de ramen (zijaanzicht rechts, de deurkant).
  await js(w, klik('[data-zicht="rechts"]'))
  await slaap(900)
  // Een paar punten tot er een op de lak valt (een ruit, een wiel of een deur geeft een tip en geen laag).
  let gevuld
  for (const [fx, fy] of [[0.62, 0.57], [0.4, 0.55], [0.55, 0.6], [0.72, 0.55], [0.3, 0.52], [0.5, 0.5]]) {
    const bus = await js(w, `(() => { const r = document.querySelector('.ls-midden').getBoundingClientRect(); return { x: Math.round(r.left + r.width * ${fx}), y: Math.round(r.top + r.height * ${fy}) } })()`)
    w.webContents.sendInputEvent({ type: 'mouseDown', x: bus.x, y: bus.y, button: 'left', clickCount: 1 })
    w.webContents.sendInputEvent({ type: 'mouseUp', x: bus.x, y: bus.y, button: 'left', clickCount: 1 })
    gevuld = await wachtOp(w, "Number(document.documentElement.dataset.lakLagen) >= 1", 2500)
    if (gevuld) break
    meld(`${b.kort}: Vullen op ${fx}, ${fy}: ${await js(w, "document.querySelector('.ls-tip')?.dataset.tip ?? 'geen tip'")}`)
  }
  klopt(`${b.kort}: Vullen: een klik op de bus kleurt een zone`, Boolean(gevuld))
  await slaap(1500)
  await afdruk(w, `${b.kort}-9-effen-gevuld`)
  // P16: een busoptie wisselen (uiterlijk, als de bus er een heeft).
  await js(w, klik('[data-knop="meer"]'))
  await js(w, `(() => { const k = [...document.querySelectorAll('.ls-menu button')][0]; k?.click(); return Boolean(k) })()`)
  await slaap(300)
  const optie = await js(w, `(() => { const o = document.querySelector('.ls-optie input[type="checkbox"]:not(:disabled)'); if (!o) return null; o.click(); return o.closest('.ls-optie').dataset.optie })()`)
  if (optie) {
    const ms = await wachtOp(w, 'document.documentElement.dataset.lakOptiesMs', 10000)
    u.optie = { variabele: optie, ms: Number(ms) }
    klopt(`${b.kort}: P16 busoptie ${optie} wisselen met het nieuwe masker in ${ms} ms (≤ 300)`, Number(ms) > 0 && Number(ms) <= 300)
    await slaap(1200)
    await afdruk(w, `${b.kort}-10-busoptie`)
  } else meld(`${b.kort}: geen busoptie om te wisselen (of de setvar-regel wordt niet gehaald)`)

  // De andere gereedschappen (§1, §2.3), in het zijaanzicht rechts.
  await js(w, klik('[data-zicht="rechts"]'))
  await slaap(800)
  const telLagen = async () => Number(await js(w, 'document.documentElement.dataset.lakLagen'))
  const punten = [[0.62, 0.57], [0.4, 0.55], [0.55, 0.6], [0.72, 0.55], [0.3, 0.52]]
  const opBus = async (fx, fy) =>
    js(w, `(() => { const r = document.querySelector('.ls-midden').getBoundingClientRect(); return { x: Math.round(r.left + r.width * ${fx}), y: Math.round(r.top + r.height * ${fy}) } })()`)
  // Tekst: een klik op de bus zet een tekst en zet de cursor in het tekstveld.
  await js(w, klik('[data-gereedschap="tekst"]'))
  await slaap(200)
  // Wit, anders is de tekst blauw op de blauwe zone van net.
  await js(w, zetWaarde('.ls-rechts input[type="color"]', '#ffffff'))
  let voor = await telLagen()
  let tekstGezet = false
  for (const [fx, fy] of punten) {
    const p = await opBus(fx, fy)
    w.webContents.sendInputEvent({ type: 'mouseDown', x: p.x, y: p.y, button: 'left', clickCount: 1 })
    w.webContents.sendInputEvent({ type: 'mouseUp', x: p.x, y: p.y, button: 'left', clickCount: 1 })
    if (await wachtOp(w, `Number(document.documentElement.dataset.lakLagen) > ${voor}`, 2500)) {
      tekstGezet = true
      break
    }
  }
  klopt(`${b.kort}: Tekst: een klik op de bus zet een tekst (${await js(w, "document.activeElement?.name ?? ''")} heeft de cursor)`, tekstGezet)
  // Afbeelding en vormen: de rolstoel uit de eigen bibliotheek.
  await js(w, klik('[data-gereedschap="afbeelding"]'))
  await slaap(200)
  await js(w, zetWaarde('.ls-rechts input[type="color"]', '#f2c200'))
  voor = await telLagen()
  await js(w, klik('[data-vorm="rolstoel"]'))
  klopt(`${b.kort}: Afbeelding: een vorm uit de bibliotheek komt op de bus`, Boolean(await wachtOp(w, `Number(document.documentElement.dataset.lakLagen) > ${voor}`, 3000)))
  // Penseel: een streek over de carrosserie; ongedaan maken haalt hem weg, opnieuw zet hem terug.
  await js(w, klik('[data-gereedschap="penseel"]'))
  await slaap(200)
  await js(w, zetWaarde('.ls-rechts input[type="color"]', '#e02020'))
  const a = await opBus(0.35, 0.56)
  const z = await opBus(0.6, 0.56)
  await sleepMuis(w, a, z, 16)
  const streek = await wachtOp(w, "document.documentElement.dataset.lakStreken === '1'", 5000)
  klopt(`${b.kort}: Penseel: een streek op een eigen penseellaag (${await js(w, 'document.documentElement.dataset.lakSoorten')})`, Boolean(streek))
  await slaap(600)
  await afdruk(w, `${b.kort}-11-gereedschap`)
  const toets = async (key, mod) => {
    w.webContents.sendInputEvent({ type: 'keyDown', keyCode: key, modifiers: mod })
    w.webContents.sendInputEvent({ type: 'char', keyCode: key, modifiers: mod })
    w.webContents.sendInputEvent({ type: 'keyUp', keyCode: key, modifiers: mod })
    await slaap(300)
  }
  await js(w, '(document.activeElement && document.activeElement.blur && document.activeElement.blur(), true)')
  await toets('z', ['control'])
  const terugGedaan = await wachtOp(w, "document.documentElement.dataset.lakStreken === '0'", 3000)
  await toets('y', ['control'])
  const opnieuwGedaan = await wachtOp(w, "document.documentElement.dataset.lakStreken === '1'", 3000)
  klopt(`${b.kort}: Ctrl+Z haalt de streek weg (de werker speelt de laag opnieuw af), Ctrl+Y zet hem terug`, Boolean(terugGedaan) && Boolean(opnieuwGedaan))
  return w
}

/**
 * Een doel van een ander familielid (§3.1, §4.14): de gelede C2 GN heeft drie
 * doelen, en de achterwagen van de Hybrid zit niet in de bus die open staat. Bij
 * [Opslaan in OMSI] laadt het venster dat lid, bakt die textuur op zijn net, en
 * komt terug. De .cti heeft dan alle plekken, en de Hybrid krijgt de naam.
 */
async function gelede() {
  const rel = 'Vehicles\\MB_C2_EN_BVG\\MB_C2_E6_Gn_main.bus'
  const hybrid = 'Vehicles\\MB_C2_EN_BVG\\MB_C2_E6_Gn_Hybrid_main.bus'
  const u = (uitslag.bussen.c2gn = {})
  const t0 = Date.now()
  await open({ doel: 'lakstudio', relatiefPad: rel, titel: 'Mercedes-Benz Citaro C2 G E6', naam: ['', 'Citaro C2 G E6', ''], vorm: 'geleed' })
  let w
  for (let i = 0; i < 100 && !w; i++) {
    w = venster3d()
    if (!w) await slaap(50)
  }
  const klaar = await wachtOp(w, "document.documentElement.dataset.lakstudio === 'klaar'", 180000)
  klopt(`c2gn: de studio staat klaar (${Date.now() - t0} ms)`, Boolean(klaar))
  await js(w, zetWaarde('input[name="lakNaam"]', 'Lakstudio Geleed', false))
  await js(w, zetWaarde('[data-staal="0"] input', '#1f6f3a'))
  await js(w, zetWaarde('[data-staal="1"] input', '#ffffff'))
  await wachtOp(w, "Number(document.documentElement.dataset.lakLagen) >= 2", 10000)
  await wachtOp(w, `!document.querySelector('[data-knop="opslaan"]').disabled`, 10000)
  const t1 = Date.now()
  await js(w, klik('[data-knop="opslaan"]'))
  // Terwijl hij bakt: de melding "Lak maken voor ..." (het andere lid staat even in beeld).
  const bakken = await wachtOp(w, `(() => { const b = document.querySelector('[data-bezig]')?.dataset.bezig ?? ''; return /voor/.test(b) ? b : false })()`, 60000, 50)
  const eind = await wachtOp(w, "['ok', 'klaargezet', 'fout'].includes(document.documentElement.dataset.lakstudio) ? document.documentElement.dataset.lakstudio : false", 300000)
  u.opslaanMs = Date.now() - t1
  u.uitkomst = (await stand(w)).uit
  klopt(`c2gn: opgeslagen in ${u.opslaanMs} ms, met "${bakken}" voor het doel van een ander lid (${u.uitkomst})`, eind === 'ok' && Boolean(bakken))
  const eigenGewoon = eigenKleurstellingen(path.join(NEP, rel))
  const eigenHybrid = eigenKleurstellingen(path.join(NEP, hybrid))
  klopt(`c2gn: de gelede C2 en de Hybrid hebben de naam als eigen lak`, eigenGewoon.has(omsiHoofdletters('Lakstudio Geleed')) && eigenHybrid.has(omsiHoofdletters('Lakstudio Geleed')))
  await afdruk(w, 'c2gn-opgeslagen')
}

/**
 * P15 in de studio (§5.7): OMSI "draait" (een nagebootste stand): de knop heet
 * [Klaarzetten voor OMSI], opslaan zet de lak in de wachtrij en schrijft niets in
 * de OMSI-map; na "OMSI dicht" plaatst main hem. En "+ Eigen lak" in de lijst
 * opent de studio met dezelfde bus (§4.1).
 */
async function klaarzettenInDeStudio(b) {
  const u = uitslag.bussen[b.kort]
  const w = venster3d()
  // Eerst de lijst van kleurstellingen van deze bus, dan "+ Eigen lak".
  const lijst = await open({ doel: 'buskeuze', relatiefPad: b.rel, titel: b.titel, naam: ['', b.titel, ''], vorm: 'solo' })
  const eigenLak = await wachtOp(w, `document.querySelector('[data-knop="eigenLak"]') && !document.querySelector('[data-knop="eigenLak"]').disabled`, 20000)
  klopt(`${b.kort}: de lijst heeft de tegel "+ Eigen lak" (volgnummer ${lijst})`, Boolean(eigenLak))
  await js(w, klik('[data-knop="eigenLak"]'))
  const studio = await wachtOp(w, "document.documentElement.dataset.lakstudio === 'klaar'", 60000)
  klopt(`${b.kort}: "+ Eigen lak" wisselt het venster naar de studio`, Boolean(studio))
  // OMSI draait: de lichte stand en [Klaarzetten voor OMSI]. Het venster "heeft focus" (de proef geeft het
  // venster nooit echte focus), anders pauzeert main het na 60 s zonder focus (§9) en is er geen lakdoek.
  const focus = setInterval(() => !w.isDestroyed() && w.emit('focus'), 3000)
  w.emit('focus')
  omsiNep = true
  venster.omsiGewijzigd(true)
  const knop = await wachtOp(w, `(() => { const k = document.querySelector('[data-knop="opslaan"]'); return k && /Klaarzetten/.test(k.textContent) ? k.textContent : false })()`, 20000)
  klopt(`${b.kort}: met OMSI open heet de knop "${knop}"`, Boolean(knop))
  await wachtOp(w, "document.documentElement.dataset.lakstudio === 'klaar'", 60000)
  await js(w, zetWaarde('input[name="lakNaam"]', 'Lakstudio Klaargezet', false))
  await js(w, zetWaarde('[data-staal="0"] input', '#2a6f97'))
  await slaap(800)
  const ctiVoor = fs.existsSync(path.join(UD, 'lakstudio', 'wachtrij.json')) ? JSON.parse(fs.readFileSync(path.join(UD, 'lakstudio', 'wachtrij.json'), 'utf8')).lakken.length : 0
  await wachtOp(w, `!document.querySelector('[data-knop="opslaan"]').disabled`, 10000)
  await js(w, klik('[data-knop="opslaan"]'))
  const eind = await wachtOp(w, "['ok', 'klaargezet', 'fout'].includes(document.documentElement.dataset.lakstudio) ? document.documentElement.dataset.lakstudio : false", 120000)
  const wachtrij = JSON.parse(fs.readFileSync(path.join(UD, 'lakstudio', 'wachtrij.json'), 'utf8')).lakken
  const inNep = zoekKleurstelling(kleurstellingenVanBus(path.join(NEP, b.rel)), 'Lakstudio Klaargezet')
  klopt(`${b.kort}: P15 klaargezet (${eind}), ${wachtrij.length - ctiVoor} lak erbij in de wachtrij, niets in de OMSI-map`, eind === 'klaargezet' && wachtrij.length === ctiVoor + 1 && !inNep)
  await afdruk(w, `${b.kort}-12-klaargezet`)
  // OMSI dicht: main plaatst de lak (dezelfde weg als de wacht in index.ts).
  omsiNep = false
  venster.omsiGewijzigd(false)
  await lakstudio.omsiDicht('proef: OMSI dicht')
  const geplaatst = zoekKleurstelling(kleurstellingenVanBus(path.join(NEP, b.rel)), 'Lakstudio Klaargezet')
  const tip = await wachtOp(w, "document.querySelector('.ls-tip')?.dataset.tip", 5000)
  klopt(`${b.kort}: P15 na "OMSI dicht" geplaatst (nummer ${geplaatst?.index}), melding "${tip}"`, Boolean(geplaatst) && /staat nu in OMSI/.test(String(tip)))
  if (u) u.klaarzetten = { eind, geplaatst: geplaatst?.index }
  clearInterval(focus)
}

app.on('window-all-closed', () => {})
app.on('browser-window-created', (_e, w) => {
  w.setOpacity(0)
  w.show = () => BrowserWindow.prototype.showInactive.call(w)
  w.focus = () => {}
  // Een vaste maat voor de afdrukken, ook als de studio het venster maximaliseert.
  w.maximize = () => w.setBounds({ x: 40, y: 40, width: 1600, height: 960 })
})

app.whenReady().then(async () => {
  const stopKlok = setTimeout(() => {
    console.log('time-out')
    fs.writeFileSync(path.join(UIT, 'uitslag.json'), JSON.stringify({ ...uitslag, fouten: 'time-out', regels }, null, 2))
    app.exit(1)
  }, 1500000)
  try {
    protocol.handle('omsi3d', (vraag) => dienst.antwoord(vraag))
    registreerBus3dIpc(ipcMain, dienst)
    const grendel = maakGrendel()
    const html = path.join(UIT, 'hoofd.html')
    fs.writeFileSync(html, '<!doctype html><meta charset="utf-8"><title>hoofd</title>')
    hoofd = new BrowserWindow({ show: false, webPreferences: { preload: path.join(wortel, 'out', 'preload', 'index.js'), contextIsolation: true, sandbox: false } })
    await hoofd.loadFile(html)
    venster = maakBus3dVenster(ipcMain, {
      hoofd: () => hoofd,
      aan: () => true,
      preload: path.join(wortel, 'out', 'preload', 'bus3d.js'),
      pagina: { bestand: path.join(wortel, 'out', 'renderer', 'bus3d.html') },
      instellingen: () => ({ taal: 'nl', thema: 'licht' }),
      achtergrond: () => '#f7f8f8',
      leesPlek: () => undefined,
      bewaarPlek: () => undefined,
      peilOmsi: async () => omsiNep,
      fotoAlsKlaar: (rel, k) => dienst.fotoAlsKlaar(rel, k, 'breed'),
      kleurstellingen: async (rel) => {
        const k = kleurstellingenVanBus(path.join(NEP, rel))
        if (!k) return undefined
        const eigen = eigenKleurstellingen(path.join(NEP, rel))
        return { variabele: k.variabele, lijst: k.lijst.map((x) => (eigen.has(omsiHoofdletters(x.naam)) ? { ...x, eigen: true } : x)) }
      },
      kleurstalen: (rel, tussen) => dienst.kleurstalen(rel, tussen),
      log,
      lakBezig: () => lakstudio?.bezig() ?? false
    })
    lakstudio = maakLakstudio(ipcMain, {
      omsi: () => NEP,
      userData: () => UD,
      log,
      logFout: (wat, fout) => log(`FOUT ${wat}: ${fout instanceof Error ? fout.stack : String(fout)}`),
      aan: () => true,
      omsiDraait: async () => omsiNep,
      bus3d: () => dienst,
      venster: () => venster,
      grendel,
      naarHoofd: (kanaal, ...a) => hoofd.webContents.send(kanaal, ...a)
    })
    for (const b of BUSSEN) {
      try {
        await zestigSeconden(b)
        await startsEnOpties(b)
        if (b.kort === BUSSEN[BUSSEN.length - 1].kort) await klaarzettenInDeStudio(b)
      } catch (fout) {
        klopt(`${b.kort}: ${fout instanceof Error ? fout.stack : String(fout)}`, false)
      }
      const w = venster3d()
      if (w) {
        const fouten3d = await js(w, 'document.documentElement.dataset.langeTaken')
        meld(`${b.kort}: lange taken op de hoofddraad: ${fouten3d}`)
        w.destroy()
        await slaap(500)
      }
    }
    if (ALLEEN.length === 0 || ALLEEN.includes('c2gn')) {
      try {
        await gelede()
      } catch (fout) {
        klopt(`c2gn: ${fout instanceof Error ? fout.stack : String(fout)}`, false)
      }
      venster3d()?.destroy()
    }
    const echtNa = echteLakken()
    klopt(`niets geschreven in de echte OMSI-map (~Lakstudio_: ${echtVoor.length} → ${echtNa.length})`, echtNa.length === echtVoor.length)
  } catch (fout) {
    klopt(`proef: ${fout instanceof Error ? fout.stack : String(fout)}`, false)
  }
  clearTimeout(stopKlok)
  fs.writeFileSync(path.join(UIT, 'uitslag.json'), JSON.stringify({ ...uitslag, regels, fouten }, null, 2))
  fs.writeFileSync(path.join(UIT, 'log.txt'), logregels.join('\n'))
  console.log(fouten ? `\n${fouten} fout(en)` : '\nalles klopt')
  void werker?.terminate()
  app.exit(fouten ? 1 : 0)
})
