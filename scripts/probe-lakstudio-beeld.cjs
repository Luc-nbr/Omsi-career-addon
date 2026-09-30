/**
 * De Lakstudio L1 (en de export van L2) op de GPU: het lakdoek in de echte
 * renderer-werker (design/ontwerpen/lakstudio.md §4, §9 P3-P7, P16).
 *
 *   npx electron-vite build
 *   node_modules\electron\dist\electron.exe scripts\probe-lakstudio-beeld.cjs --uit <map> [--bus sd77,c2gn,licht] [--snel]
 *
 * Een eigen Electron-hoofdproces zoals probe-bus3d-beeld.cjs: EIGEN map voor
 * gebruikersgegevens (in de uitvoermap), een eigen LIVEMAP, de gebouwde werker
 * 'bus3d', main/bus3d.ts via tsx, en de gebouwde pagina bus3d.html?proef=1. De
 * echte OMSI-map wordt alleen GELEZEN. Plaatsen gaat naar de NAGEBOOTSTE
 * OMSI-map van scripts/probe-lakstudio.ts (via de korte ingang %TEMP%\lkp),
 * nooit naar de echte.
 *
 * Per bus: laden tot scherp, de familie (core/lakfamilie.ts met de pakketten),
 * het lakdoek starten (tijden van laknet, masker, zones, zaad), 32 lagen en de
 * tijd van het samenstellen op volle maat (pad 1, en met pad 2), slepen, GPU-
 * geheugen, de export (DDS per doel), plaatsen in de nagebootste map, nagaan dat
 * kleurstelling.ts de naam ziet, verwijderen (sha1-boom gelijk). SD77, NL202 en
 * HH20: het automatische masker tegen MA; C2 Solo: het glas; alle bussen: de alfa;
 * NL202: de stoelen; HH20: busopties en tegels = één keer; NLC: licht en
 * contextverlies.
 */
const { app, BrowserWindow, ipcMain, protocol } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { Worker } = require('node:worker_threads')

const wortel = path.join(__dirname, '..')
const args = process.argv.slice(2)
const waarde = (naam, standaard) => {
  const i = args.indexOf(naam)
  return i >= 0 && args[i + 1] ? args[i + 1] : standaard
}
const UIT = path.resolve(waarde('--uit', path.join(os.tmpdir(), 'probe-lakstudio-beeld')))
const ALLEEN = waarde('--bus', '').split(',').filter(Boolean)
const SNEL = args.includes('--snel')
const OMSI = process.env.OMSI_ECHT || 'C:/Program Files (x86)/Steam/steamapps/common/OMSI 2'
const KORT = path.join(process.env.TEMP || os.tmpdir(), 'lkp')
const NEP = path.join(KORT, 'OMSI 2')
if (!fs.existsSync(path.join(NEP, '.nagebootst'))) {
  console.error(`Geen nagebootste OMSI-map in ${NEP}: eerst scripts/probe-lakstudio.ts draaien.`)
  process.exit(2)
}
if (path.resolve(fs.realpathSync(NEP)).toLowerCase() === path.resolve(OMSI).toLowerCase()) {
  console.error('De nagebootste map is de echte OMSI-map: gestopt.')
  process.exit(2)
}

const UD = path.join(UIT, 'ud')
const LIVE = path.join(UIT, 'live')
const BEELD = path.join(UIT, 'beeld')
fs.mkdirSync(BEELD, { recursive: true })
fs.rmSync(UD, { recursive: true, force: true })
fs.mkdirSync(UD, { recursive: true })
fs.mkdirSync(LIVE, { recursive: true })
process.env.OMSI_ENHANCER_LIVEMAP = LIVE
app.setPath('userData', UD)
app.commandLine.appendSwitch('enable-precise-memory-info')
protocol.registerSchemesAsPrivileged([{ scheme: 'omsi3d', privileges: { standard: true, secure: true, supportFetchAPI: true } }])

const tsx = require('tsx/cjs/api')
const { maakBus3dDienst, registreerBus3dIpc } = tsx.require('../src/main/bus3d.ts', __filename)
const lf = tsx.require('../src/core/lakfamilie.ts', __filename)
const ls = tsx.require('../src/core/lakstudio.ts', __filename)
const { leesDdsKop } = tsx.require('../src/shared/dds.ts', __filename)
const { kleurstellingenVanBus, zoekKleurstelling } = tsx.require('../src/core/kleurstelling.ts', __filename)
const { leesBusBestand } = tsx.require('../src/core/bus3d.ts', __filename)
const { pngVan } = tsx.require('../src/core/png.ts', __filename)
const { leesPakket } = tsx.require('../src/shared/bus3dpak.ts', __filename)
const { ontwarStuk } = tsx.require('../src/shared/o3dhussel.ts', __filename)

const logregels = []
const log = (r) => logregels.push(`${new Date().toISOString().slice(11, 23)} ${r}`)

// ------------------------------------------------------------ de werker 'bus3d' (de gebouwde), alleen lezend
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
let fouten = 0
const regels = []
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
async function reken(win, code, ms = 240000) {
  return Promise.race([win.webContents.executeJavaScript(code, true), slaap(ms).then(() => ({ fout: `tijd (${ms} ms): ${code.slice(0, 80)}` }))])
}
async function versePagina(win) {
  await win.loadFile(path.join(wortel, 'out', 'renderer', 'bus3d.html'), { query: { proef: '1', taal: 'nl' } })
  for (let i = 0; i < 100; i++) {
    if (await reken(win, 'Boolean(window.__bv)')) return
    await slaap(50)
  }
  throw new Error('window.__bv kwam niet')
}
const b64 = (s) => Buffer.from(s, 'base64')
const J = (x) => JSON.stringify(x)

/** De familie zoals main hem voor de studio maakt (main/lakstudio.ts familieMet): pakketten van alle leden. */
async function infosVoor(rel) {
  const kaal = lf.familieVan(OMSI, rel, { sjablonen: false })
  const infos = new Map()
  const koppen = new Map()
  for (const l of kaal.leden) {
    const p = await dienst.lakPakket(l.rel)
    if (p.reden) infos.set(l.rel, { oppervlak: new Map(), glas: new Set(), bakbaar: p.reden === 'versleuteld' ? 'versleuteld' : 'geen-model' })
    else {
      infos.set(l.rel, lf.lakInfoVan(p.manifest, p.kop))
      koppen.set(l.rel, p)
    }
  }
  return { infos, koppen }
}
function naarStudio(f) {
  const paden = []
  for (const d of f.doelen) {
    if (d.standaard) paden.push(d.standaard)
    const s = d.sjabloon
    if (s) for (const p of [s.bs, s.al, s.ma, s.ad, s.mu]) if (p) paden.push(p)
  }
  const ids = dienst.registreerLos(paden)
  return lf.familieInfo(f, (p) => ids.get(p))
}

/** Een lagenstapel om mee te meten: grondkleur, band, tekst (gespiegeld), vorm; `veel` = 32 lagen. */
function lagenVoor(doos, veel) {
  const min = doos.min
  const max = doos.max
  const lengte = max[2] - min[2]
  const basis = (id, naam) => ({ id, naam, zichtbaar: true, dekking: 1, detail: 1 })
  const lagen = [
    { ...basis('g', 'Grond'), soort: 'zone', centrum: [50, 0, 0], straal: 1000, kleur: '#1d3f8f' },
    { ...basis('b', 'Band'), soort: 'strook', sjabloon: 'onderband', h1: 0.4, h2: 1.0, hoek: 0, golf: 0, zijden: 'rondom', kleur: '#ffffff' },
    {
      ...basis('t', 'Tekst'),
      soort: 'tekst',
      tekst: 'Lakstudio Proef',
      lettertype: 'Arial',
      hoogteCm: 30,
      kleur: '#f5c400',
      plaats: { zijde: 'R', midden: [max[0], min[1] + 1.9, min[2] + lengte * 0.45], breedteM: 3.2, draai: 0, spiegel: 'gekoppeld' }
    },
    {
      ...basis('v', 'Pijl'),
      soort: 'vorm',
      vorm: 'pijl',
      kleur: '#e03030',
      plaats: { zijde: 'R', midden: [max[0], min[1] + 2.3, min[2] + lengte * 0.8], breedteM: 0.8, draai: 0, spiegel: 'gekoppeld' }
    }
  ]
  if (veel) {
    for (let i = 0; lagen.length < 32; i++) {
      lagen.push(
        i % 2
          ? { ...basis(`x${i}`, `Extra ${i}`), soort: 'strook', sjabloon: 'golf', h1: 0.2 + (i % 5) * 0.2, h2: 0.3 + (i % 5) * 0.2, hoek: 3, golf: 0.05, zijden: 'zijden', kleur: '#20a060' }
          : {
              ...basis(`x${i}`, `Extra ${i}`),
              soort: 'vorm',
              vorm: ['cirkel', 'ster', 'streep'][i % 3],
              kleur: '#ffffff',
              plaats: { zijde: i % 4 ? 'R' : 'L', midden: [i % 4 ? max[0] : min[0], min[1] + 1 + (i % 3) * 0.3, min[2] + (lengte * ((i % 11) + 0.5)) / 11], breedteM: 0.5, draai: i * 7, spiegel: 'los' }
            }
      )
    }
  }
  return lagen
}

/** De doos (o3d-assen) van de meshes die een [visible]-variabele aan/uit zet (HH20: de HOCHBAHN-letters). */
function lettersDoos(p, variabele) {
  const pad = path.join(UD, 'bus3d', 'v1', 'p', `${p.manifest.pakket}.b3d`)
  if (!fs.existsSync(pad)) return undefined
  const pak = leesPakket(new Uint8Array(fs.readFileSync(pad)))
  const dozen = []
  pak.kop.vermeldingen.forEach((v) => {
    if (!v.zicht.some(([n]) => n.toLowerCase() === variabele)) return
    const min = [Infinity, Infinity, Infinity]
    const max = [-Infinity, -Infinity, -Infinity]
    const stuk = pak.kop.stukken[v.stuk]
    const bytes = pak.staart.subarray(stuk.hoekpunten.off, stuk.hoekpunten.off + stuk.hoekpunten.len)
    const f = new Float32Array(bytes.slice().buffer, 0, stuk.n * 8)
    if (stuk.hussel) {
      let st
      do st = ontwarStuk(f, { ...stuk.hussel, n: stuk.n }, st, 1e9)
      while (st)
    }
    const sch = p.manifest.delen[stuk.deel]?.verschuiving ?? [0, 0, 0]
    for (let o = 0; o < f.length; o += 8)
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], f[o + k] + sch[k])
        max[k] = Math.max(max[k], f[o + k] + sch[k])
      }
    if (Number.isFinite(min[0])) dozen.push({ o3d: stuk.o3d, min, max })
  })
  return dozen.length ? dozen : undefined
}

/** sha1 van elk bestand onder een map (P8b). */
function boom(map) {
  const uit = new Map()
  const loop = (m) => {
    for (const e of fs.readdirSync(m, { withFileTypes: true })) {
      const p = path.join(m, e.name)
      if (e.isDirectory()) loop(p)
      else uit.set(path.relative(map, p).toLowerCase(), createHash('sha1').update(fs.readFileSync(p)).digest('hex'))
    }
  }
  loop(map)
  return uit
}
function boomVerschil(a, b) {
  const v = []
  for (const [k, h] of a) if (b.get(k) !== h) v.push(k)
  for (const k of b.keys()) if (!a.has(k)) v.push(`+${k}`)
  return v
}

// ------------------------------------------------------------ de bussen
const BUSSEN = [
  { kort: 'sd77', naam: 'SD77', pad: 'Vehicles\\MAN_SD200\\MAN_SD77.bus', sjabloon: true, export: true },
  { kort: 'c2solo', naam: 'C2 E6 Solo', pad: 'Vehicles\\MB_C2_EN_BVG\\MB_C2_E6_Solo.bus', glas: true },
  { kort: 'c2gn', naam: 'C2 E6 GN', pad: 'Vehicles\\MB_C2_EN_BVG\\MB_C2_E6_Gn_main.bus', export: true },
  { kort: 'o530', naam: 'MB O530', pad: 'Vehicles\\MB_O530\\MB_O530.bus' },
  { kort: 'o560', naam: 'O560 E6', pad: 'Vehicles\\ABCoach_O560\\O560_E6.bus' },
  { kort: 'nlc', naam: 'NLC 12C', pad: 'Vehicles\\MAN_NewLionsCity\\MAN_12C_2door_Voith.bus' },
  { kort: 'hh20', naam: 'HH20', pad: 'Vehicles\\HH20_EBus2021\\HHEBus2021_main.bus', sjabloon: true, opties: true, tegels: true },
  { kort: 'nl202', naam: 'NL202', pad: 'Vehicles\\MAN_NL_NG\\MAN_EN92_main.bus', sjabloon: true, stoelen: true },
  { kort: 'urbanway', naam: 'Urbanway 18', pad: 'Vehicles\\HOH_Iveco-Urbanway-18\\Urbanway_18_main.bus' },
  { kort: 'kajosoft', naam: 'Kajosoft O530', pad: 'Vehicles\\Citybus 530 by Kajosoft\\01a_o530_e2_2.bus' },
  { kort: 'o550', naam: 'TH O550', pad: 'Vehicles\\TH_Ueberlandbus\\O550_Euro2.bus' }
]

/**
 * De export van de hele familie: de doelen van deze bus, dan die van andere
 * bakkers (de Hybrid-achterwagen): die bus laden, het lakdoek daar starten en
 * alleen zijn doelen exporteren. Zo doet het venster het straks ook (L3).
 */
async function exporteerAlles(win, rel, f, familie, lagen) {
  const uit = []
  const t0 = Date.now()
  const hier = await reken(win, `window.__bv.studio.exporteer({ metRgba: true })`)
  if (!Array.isArray(hier)) return { fout: hier }
  uit.push(...hier)
  const hierMs = Date.now() - t0
  const gedaan = new Set(uit.map((x) => x.doel))
  const bakkers = [...new Set(f.doelen.filter((d) => !gedaan.has(d.id)).map((d) => d.bakker))]
  for (const b of bakkers) {
    const st = await reken(win, `window.__bv.laad(${J(b)})`)
    if (st?.fase !== 'scherp') {
      log(`bakker ${b} niet scherp: ${J(st).slice(0, 200)}`)
      continue
    }
    await reken(win, `window.__bv.studio.start(${J(familie)}, ${J(lagen)}, { aan: true })`)
    const ids = f.doelen.filter((d) => d.bakker === b && !gedaan.has(d.id)).map((d) => d.id)
    const daar = await reken(win, `window.__bv.studio.exporteer({ alleen: ${J(ids)}, metRgba: true })`)
    if (Array.isArray(daar))
      for (const x of daar) {
        uit.push(x)
        gedaan.add(x.doel)
      }
  }
  if (bakkers.length) {
    await reken(win, `window.__bv.laad(${J(rel)})`)
    await reken(win, `window.__bv.studio.start(${J(familie)}, ${J(lagen)}, { aan: true })`)
  }
  return { uit, ms: Date.now() - t0, hierMs, bakkers }
}

async function ronde() {
  protocol.handle('omsi3d', (vraag) => dienst.antwoord(vraag))
  registreerBus3dIpc(ipcMain, dienst)
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 720,
    useContentSize: true,
    webPreferences: { preload: path.join(wortel, 'out', 'preload', 'bus3d.js'), sandbox: false, contextIsolation: true, backgroundThrottling: false }
  })
  win.webContents.on('console-message', (_e, niveau, bericht) => {
    if (niveau >= 2) log(`pagina: ${bericht}`)
  })
  win.webContents.on('render-process-gone', (_e, d) => log(`FOUT pagina weg: ${d.reason}`))
  await versePagina(win)
  const webgl = await reken(win, 'window.__bv.info()')
  console.log(`WebGL: ${J(webgl)}`)
  const uitslag = { omsi: OMSI, nep: NEP, gestart: new Date().toISOString(), webgl, bussen: [] }
  const omgeving = { omsi: NEP, userData: path.join(UIT, 'ud-plaats'), log }
  fs.rmSync(omgeving.userData, { recursive: true, force: true })

  for (const bus of BUSSEN.filter((b) => !ALLEEN.length || ALLEEN.includes(b.kort))) {
    const r = { bus: bus.naam }
    console.log(`\n== ${bus.naam}`)
    try {
      await versePagina(win)
      const st = await reken(win, `window.__bv.laad(${J(bus.pad)})`)
      if (st?.fase !== 'scherp') throw new Error(`niet scherp: ${J(st).slice(0, 200)}`)
      const t0 = Date.now()
      const { infos, koppen } = await infosVoor(bus.pad)
      const f = lf.familieVan(OMSI, bus.pad, { info: (x) => infos.get(x) })
      r.familieMs = Date.now() - t0
      const familie = naarStudio(f)
      r.doelen = f.doelen.map((d) => `${d.id} ${d.naam} ${d.uitB}x${d.uitH} ${d.formaat}${d.sjabloon ? ` sjabloon ${d.sjabloon.naam}` : ''} bakker ${d.bakker.split('\\').pop()}`)
      const eigen = koppen.get(bus.pad)
      const doos = eigen.manifest.doos
      const lagen = lagenVoor(doos, false)

      // 1. P3: het lakdoek starten (maskers plus zaad per doel op de bewerkmaat, zones).
      const klaar = await reken(win, `window.__bv.studio.start(${J(familie)}, ${J(lagen)}, { aan: true })`)
      if (!klaar || klaar.fout) throw new Error(`start: ${J(klaar)}`)
      r.klaar = klaar
      // Warm: de maskers nog eens (laknet, masker, tellen, zaad; zoals na andere busopties). De eerste keer
      // vertaalt ANGLE de shaders voor dit doel en maakt het de dieptekaarten; dat telt maar één keer per sessie.
      let warm
      for (let i = 0; i < 2; i++) warm = await reken(win, `window.__bv.studio.maskers()`)
      // Masker plus zaad (en tellen); het laknet opnieuw opbouwen (processor) staat er apart bij.
      const warmPerDoel = Math.round(((warm?.ms ?? 999) - (warm?.laknet ?? 0)) / Math.max(1, klaar.doelen.length))
      r.maskerWarm = warm?.ms
      for (const d of klaar.doelen) {
        const mj = (d.ms.masker ?? 0) + (d.ms.jfa ?? 0)
        klopt(
          `P3 ${bus.naam} ${d.naam}: masker + zaad op ${d.editB}x${d.editH}: warm ${warmPerDoel} ms (met tellen; ≤ 150; laknet opnieuw ${warm?.laknet} ms voor ${klaar.doelen.length} doel(en)), koud (eerste keer) ${mj} ms; zones ${d.ms.zones} ms (≤ 50), ${d.zones.length} zones; laknet ${d.ms.laknet} ms, basis ${d.ms.basis} ms; ${d.texelsPerM} texels/m, gedeeld ${d.gedeeld}%, gedekt ${d.gedekt}%`,
          warmPerDoel <= 150 && d.ms.zones <= 50
        )
      }
      // Het masker per doel als beeld (R buiten, G glas, B gedeeld; zwart = niet gedekt).
      for (const d of klaar.doelen) {
        const m = await reken(win, `window.__bv.studio.proef({ wat: 'masker', doel: ${J(d.id)} })`)
        if (!m?.px) continue
        const px = b64(m.px)
        for (let i = 0; i < px.length; i += 4) {
          if (px[i + 3] < 128) px[i] = px[i + 1] = px[i + 2] = 0
          px[i + 3] = 255
        }
        fs.writeFileSync(path.join(BEELD, `${bus.kort}-masker-${d.naam.replace(/[^A-Za-z0-9_]/g, '_')}.png`), pngVan(m.b, m.h, px, 1))
      }
      // P7: het spiegelvlak = midden van [boundingbox]; de doos van elk lid binnen 5 cm van die van de bakker.
      const bb = leesBusBestand(path.join(OMSI, bus.pad))?.doos
      const vlak = (klaar.doos.min[0] + klaar.doos.max[0]) / 2
      klopt(`P7 ${bus.naam}: spiegelvlak x = ${vlak.toFixed(3)} m, midden van [boundingbox] ${bb ? bb.midden[0].toFixed(3) : '-'} m (≤ 2 cm)`, !bb || Math.abs(vlak - bb.midden[0]) <= 0.02)
      const dozen = []
      for (const [rel, p] of koppen) {
        if (rel === bus.pad) continue
        if ((p.manifest.delen?.length ?? 1) !== (eigen.manifest.delen?.length ?? 1)) continue
        const a = p.manifest.doos
        const afw = Math.max(...[0, 1, 2].flatMap((k) => [Math.abs(a.min[k] - doos.min[k]), Math.abs(a.max[k] - doos.max[k])]))
        dozen.push({ lid: rel, cm: Math.round(afw * 1000) / 10 })
      }
      // Een lid met een andere doos mag de lak alleen dragen als het geen bakker is (lakfamilie sluit dragers met een afwijkende doos uit).
      const bakkers = new Set(f.doelen.map((d) => d.bakker))
      const slechteDozen = dozen.filter((d) => d.cm > 5)
      r.dozen = dozen
      klopt(
        `P7 ${bus.naam}: ${dozen.length} familieleden met evenveel delen, ${dozen.length - slechteDozen.length} met de doos binnen 5 cm${slechteDozen.length ? ` (anders: ${slechteDozen.map((d) => `${d.lid.split('\\').pop()} ${d.cm} cm${f.nietOp.some((n) => n.bus === d.lid) ? ' — niet op' : ''}`).join(', ')})` : ''}`,
        slechteDozen.every((d) => !bakkers.has(d.lid))
      )
      // P7 (§4.8): een tekst op gedeelde texels krijgt geen kopie (ls.spiegelschrift), en [Schuif naar een vrij stuk]
      // brengt hem naar hooguit 2% gedeeld, met een kopie aan de andere kant.
      if (bus.kort === 'hh20') {
        const min = doos.min
        const max = doos.max
        let proef = 0
        let gevonden
        const tekstOp = (id, y, zf) => ({
          id,
          naam: 'P7',
          zichtbaar: true,
          dekking: 1,
          detail: 1,
          soort: 'tekst',
          tekst: 'Lakstudio',
          lettertype: 'Arial',
          hoogteCm: 30,
          kleur: '#ffffff',
          plaats: { zijde: 'R', midden: [max[0], min[1] + y, min[2] + (max[2] - min[2]) * zf], breedteM: 1.4, draai: 0, spiegel: 'gekoppeld' }
        })
        zoeken: for (const y of [0.6, 0.9, 1.2, 0.4, 2.3]) {
          for (let zf = 0.08; zf < 0.95; zf += 0.07) {
            const id = `p7-${proef++}`
            const u = await reken(win, `window.__bv.studio.analyseNa(${J([...lagen, tekstOp(id, y, zf)])}, { aan: true })`)
            if (u && u[id] && !u[id].kopie) {
              gevonden = { id, y, zf, analyse: u[id] }
              break zoeken
            }
          }
        }
        r.p7 = { proeven: proef, gevonden }
        klopt(`P7 HH20: een tekst op gedeelde texels (${gevonden ? `${(gevonden.analyse.gedeeld * 100).toFixed(1)}% gedeeld, na ${proef} plekken` : 'geen plek gevonden'}) krijgt geen kopie (ls.spiegelschrift)`, Boolean(gevonden))
        if (gevonden) {
          const plaats = await reken(win, `window.__bv.studio.schuif(${J(gevonden.id)})`)
          const id = `p7-${proef++}`
          const nieuw = { ...tekstOp(id, gevonden.y, gevonden.zf), plaats }
          const u = plaats ? await reken(win, `window.__bv.studio.analyseNa(${J([...lagen, nieuw])}, { aan: true })`) : undefined
          const a = u?.[id]
          r.p7.geschoven = { plaats, analyse: a }
          klopt(
            `P7 HH20: [Schuif naar een vrij stuk] schoof ${plaats ? `${((plaats.midden[2] - (min[2] + (max[2] - min[2]) * gevonden.zf)) * 100).toFixed(0)} cm` : 'niet'}: ${a ? `${(a.gedeeld * 100).toFixed(1)}% gedeeld, kopie ${a.kopie}` : '-'} (≤ 2%, met kopie)`,
            Boolean(a && a.gedeeld <= 0.02 && a.kopie)
          )
          if (plaats) {
            await reken(win, `window.__bv.studio.lagen(${J([...lagen, nieuw])}, { aan: true })`)
            for (const [hoek, stand] of Object.entries({ rechts: { draai: 270, kantel: 3, zoom: 1 }, links: { draai: 90, kantel: 3, zoom: 1 } })) {
              const af = await reken(win, `window.__bv.afdruk(${J({ stand, b: 1280, h: 720, formaat: 'png' })})`)
              if (af?.beeld) fs.writeFileSync(path.join(BEELD, `${bus.kort}-p7-geschoven-${hoek}.png`), b64(af.beeld))
            }
          }
        }
        await reken(win, `window.__bv.studio.lagen(${J(lagen)}, { aan: true })`)
      }
      // Afdrukken met de lak (P6: op 20 m zonder zichtbare naden; P7: tekst links en de spiegel rechts).
      for (const [hoek, stand] of Object.entries({
        schuin: { draai: 215, kantel: 8, zoom: 1 },
        rechts: { draai: 270, kantel: 3, zoom: 1 },
        links: { draai: 90, kantel: 3, zoom: 1 },
        ver: { draai: 215, kantel: 6, zoom: 2.2 }
      })) {
        const a = await reken(win, `window.__bv.afdruk(${J({ stand, b: 1280, h: 720, formaat: 'png' })})`)
        if (a?.beeld) fs.writeFileSync(path.join(BEELD, `${bus.kort}-${hoek}.png`), b64(a.beeld))
        else log(`afdruk ${bus.kort}-${hoek}: ${J(a).slice(0, 200)}`)
      }

      // 2. P3: 32 lagen, samenstellen op volle maat (pad 1, en met pad 2), en slepen.
      const veel = lagenVoor(doos, true)
      await reken(win, `window.__bv.studio.lagen(${J(veel)}, { aan: true })`)
      r.tijd = []
      for (const d of klaar.doelen) {
        const tijd = await reken(win, `window.__bv.studio.proef({ wat: 'tijd', doel: ${J(d.id)}, keer: 7 })`)
        r.tijd.push({ doel: d.naam, b: d.b, h: d.h, ...tijd?.ms })
        // De eis staat bij 4096²; kleinere doelen moeten hem op hun eigen maat halen (strenger).
        klopt(
          `P3 ${bus.naam} ${d.naam} ${d.b}x${d.h}, ${tijd?.ms?.lagen} lagen (per keer, over 7 reeksen van 10: mediaan, kleinste): pad 1 ${tijd?.ms?.pad1} ms, ${tijd?.ms?.pad1Min} (≤ 4); pad 1+2 ${tijd?.ms?.pad1En2}, ${tijd?.ms?.pad1En2Min} ms${bus.kort === 'hh20' ? ' (≤ 6)' : ''}`,
          (tijd?.ms?.pad1 ?? 99) <= 4 && (bus.kort !== 'hh20' || (tijd?.ms?.pad1En2 ?? 99) <= 6)
        )
      }
      const sleep = await reken(win, `window.__bv.studio.meet(90)`)
      r.slepen = sleep
      klopt(
        `P3 ${bus.naam}: slepen p50 ${sleep?.beeld?.p50?.toFixed?.(1)} / p95 ${sleep?.beeld?.p95?.toFixed?.(1)} ms per beeld met 32 lagen (≥ 50 fps = p95 ≤ 20 ms), samenstellen p95 ${sleep?.samenstellen?.p95?.toFixed?.(2)} ms`,
        (sleep?.beeld?.p95 ?? 99) <= 20
      )
      // 3. P4: geheugen boven de viewer (volle stand).
      const lakMB = (sleep?.gpuLak ?? 0) / 1048576
      const grensMB = bus.kort === 'nlc' ? 300 : 500
      r.geheugen = { lakMB: Math.round(lakMB), viewerMB: Math.round((sleep?.gpu?.totaal ?? 0) / 1048576) }
      klopt(`P4 ${bus.naam}: lakdoek ${Math.round(lakMB)} MB boven de viewer (${r.geheugen.viewerMB} MB) (≤ ${grensMB})`, lakMB <= grensMB)
      await reken(win, `window.__bv.studio.lagen(${J(lagen)}, { aan: true })`)

      // 4. De export (P3 C2 GN/SD77), P5 alfa en glas, plaatsen in de NAGEBOOTSTE map.
      const exp = bus.export || !SNEL ? await exporteerAlles(win, bus.pad, f, familie, lagen) : undefined
      if (exp && !exp.fout) {
        r.export = { ms: exp.ms, hierMs: exp.hierMs, bakkers: exp.bakkers, doelen: exp.uit.map((x) => ({ doel: x.doel, formaat: x.formaat, ms: x.ms })) }
        const som = exp.uit.reduce((s, x) => s + Object.values(x.ms).reduce((a, b) => a + b, 0), 0)
        if (bus.kort === 'c2gn')
          klopt(
            `P3 C2 GN: export van ${exp.uit.length} doelen (${exp.uit.map((x) => `${x.formaat} ${J(x.ms)}`).join('; ')}): lakdoek samen ${Math.round(som)} ms (≤ 4000); met het laden van de Hybrid-achterwagen ${exp.ms} ms`,
            som <= 4000
          )
        if (bus.kort === 'sd77') klopt(`P3 SD77: export ${exp.hierMs} ms (≤ 1000): ${exp.uit.map((x) => `${x.formaat} ${J(x.ms)}`).join('; ')}`, exp.hierMs <= 1000)
        for (const x of exp.uit) {
          const d = f.doelen.find((y) => y.id === x.doel)
          const rgba = b64(x.rgba)
          const kop = leesDdsKop(b64(x.dds))
          const basis = d.standaard ? lf.decodeer(d.standaard) : undefined
          let alfaAnders = -1
          if (basis && basis.breedte === d.uitB && basis.hoogte === d.uitH) {
            alfaAnders = 0
            for (let i = 3; i < rgba.length; i += 4) if (rgba[i] !== basis.pixels[i]) alfaAnders++
          }
          klopt(
            `P5 ${bus.naam} ${d.naam}: alfa van de uitvoer = alfa van de basis (${alfaAnders < 0 ? `uitvoer ${d.uitB}x${d.uitH} tegen basis ${basis?.breedte}x${basis?.hoogte}: niet texel voor texel` : `${alfaAnders} texels anders`}); ${x.formaat}, ${kop?.niveaus} niveaus, volledig ${kop?.compleet}`,
            alfaAnders <= 0 && Boolean(kop?.compleet)
          )
          if (bus.glas && basis && d.bakker === bus.pad) {
            const m = await reken(win, `window.__bv.studio.proef({ wat: 'masker', doel: ${J(d.id)} })`)
            const mpx = b64(m.px)
            let glas = 0
            let veranderd = 0
            for (let i = 0; i < mpx.length; i += 4) {
              if (mpx[i + 1] < 128 || mpx[i + 3] < 128) continue
              glas++
              if (rgba[i] !== basis.pixels[i] || rgba[i + 1] !== basis.pixels[i + 1] || rgba[i + 2] !== basis.pixels[i + 2] || rgba[i + 3] !== basis.pixels[i + 3]) veranderd++
            }
            r.glas = { ...(r.glas ?? {}), [d.naam]: { glas, veranderd } }
            klopt(`P5 ${bus.naam} ${d.naam}: ${veranderd} van ${glas} glastexels in dit doel veranderd (RGB en A) (= 0)`, veranderd === 0)
          }
        }
        // Plaatsen in de NAGEBOOTSTE OMSI-map (doelen op naam gekoppeld), nagaan met kleurstelling.ts, verwijderen.
        const nepF = lf.familieVan(NEP, bus.pad, { info: (x) => infos.get(x) })
        const texturen = []
        for (const x of exp.uit) {
          const d = f.doelen.find((y) => y.id === x.doel)
          const n = nepF.doelen.find((y) => y.naam.toLowerCase() === d.naam.toLowerCase())
          if (n) texturen.push({ doel: n.id, dds: new Uint8Array(b64(x.dds)) })
        }
        const mappen = [...new Set([path.join(NEP, path.dirname(bus.pad)), ...nepF.mappen.map((m) => path.dirname(m))])].filter((m) => fs.existsSync(m))
        const voor = new Map(mappen.map((m) => [m, boom(m)]))
        const naam = `Lakstudio GPU ${bus.naam.replace(/[^A-Za-z0-9 ]/g, '')}`
        const nu = new Date().toISOString()
        const project = ls.bewaarProject(omgeving.userData, { versie: 1, id: ls.nieuwProjectId(), naam, bus: bus.pad, start: 'effen', lagen, opties: {}, spiegel: { aan: true }, gemaakt: nu, bewaard: nu })
        const tp = Date.now()
        const plaats = ls.plaatsLak(omgeving, { familie: nepF, project, naam, texturen })
        const plaatsMs = Date.now() - tp
        if (plaats.ok) {
          const lijst = kleurstellingenVanBus(path.join(NEP, bus.pad))
          const k = zoekKleurstelling(lijst, naam)
          const verwacht = plaats.plan.index[bus.pad]
          const texOk = plaats.plan.bestanden.filter((b) => /\.dds$/i.test(b.rel)).every((b) => leesDdsKop(fs.readFileSync(path.join(NEP, ...b.rel.split('/'))))?.compleet)
          klopt(
            `L2 ${bus.naam}: GPU-lak geplaatst in ${plaatsMs} ms (≤ 2000), ${plaats.plan.bestanden.length} bestanden; kleurstelling.ts ziet "${naam}" als nr. ${k?.index} (verwacht ${verwacht}), met ${k ? Object.keys(k.texturen).length : 0} texturen; DDS'en volledig: ${texOk}`,
            Boolean(k) && k.index === verwacht && texOk && plaatsMs <= 2000
          )
          const v = ls.verwijderLak(omgeving, project.id)
          const verschil = mappen.flatMap((m) => boomVerschil(voor.get(m), boom(m)))
          const weg = !zoekKleurstelling(kleurstellingenVanBus(path.join(NEP, bus.pad)), naam)
          klopt(`L2 ${bus.naam}: verwijderen zet alles terug (sha1-boom van ${mappen.length} map(pen) gelijk${verschil.length ? `; anders: ${verschil.slice(0, 4).join(', ')}` : ''})`, Boolean(v.ok) && weg && verschil.length === 0)
        } else klopt(`L2 ${bus.naam}: plaatsen ${J(plaats).slice(0, 300)}`, false)
      } else if (exp?.fout) klopt(`${bus.naam}: export ${J(exp.fout).slice(0, 300)}`, false)

      // P5: het automatische masker (zonder sjabloon berekend) tegen MA (≥ 97% op texels waar MA 0 of 1 is).
      if (bus.sjabloon) {
        for (const d of f.doelen.filter((x) => x.sjabloon && x.bakker === bus.pad)) {
          const e = await reken(win, `window.__bv.studio.proef({ wat: 'effect', doel: ${J(d.id)} })`)
          if (!e?.px) {
            klopt(`P5 ${bus.naam} ${d.naam}: geen effect (${J(e).slice(0, 100)})`, false)
            continue
          }
          const px = b64(e.px)
          {
            // Het beeld: R = automatisch masker, G = MA, B = glas; zwart = niet gedekt.
            const beeld = new Uint8Array(px)
            for (let i = 0; i < beeld.length; i += 4) {
              if (beeld[i + 3] < 128) beeld[i] = beeld[i + 1] = beeld[i + 2] = 0
              beeld[i + 3] = 255
            }
            fs.writeFileSync(path.join(BEELD, `${bus.kort}-ma-${d.naam.replace(/[^A-Za-z0-9_]/g, '_')}.png`), pngVan(e.b, e.h, beeld, 1))
          }
          let n = 0
          let eens = 0
          let teVeel = 0
          let teWeinig = 0
          for (let i = 0; i < px.length; i += 4) {
            if (px[i + 3] < 128) continue
            const ma = px[i + 1]
            if (ma > 16 && ma < 239) continue
            n++
            const auto = px[i] > 127
            if (auto === ma >= 128) eens++
            else if (auto) teVeel++
            else teWeinig++
          }
          let alVerschil
          if (d.sjabloon.al && d.standaard) {
            const al = lf.decodeer(d.sjabloon.al)
            const b = lf.decodeer(d.standaard)
            if (al && b) {
              let v = 0
              const s2 = al.breedte / b.breedte
              for (let y = 0; y < b.hoogte; y++)
                for (let x = 0; x < b.breedte; x++) if (Math.abs(al.pixels[(Math.floor(y * s2) * al.breedte + Math.floor(x * s2)) * 4] - b.pixels[(y * b.breedte + x) * 4 + 3]) > 8) v++
              alVerschil = v / (b.breedte * b.hoogte)
              if (alVerschil > 0) log(`P5 ${bus.naam} ${d.naam}: AL van ${d.sjabloon.naam} wijkt op ${(alVerschil * 100).toFixed(2)}% van de texels af van de alfa van de basis`)
            }
          }
          r.sjabloon = { ...(r.sjabloon ?? {}), [d.naam]: { overeen: n ? eens / n : 0, n, teVeel, teWeinig, alVerschil } }
          klopt(
            `P5 ${bus.naam} ${d.naam}: automatisch masker = MA van ${d.sjabloon.naam} op ${(n ? (100 * eens) / n : 0).toFixed(1)}% van ${n} texels (≥ 97%; auto lakt ${teVeel} texels die MA beschermt, laat ${teWeinig} liggen die MA lakt); AL tegen de alfa van de basis: ${alVerschil === undefined ? '-' : `${(alVerschil * 100).toFixed(2)}% verschilt (logboek)`}`,
            n > 0 && eens / n >= 0.97
          )
        }
      }
      // P5 NL202: een band van 0,4-1,6 m rondom verandert 0 texels die alleen stoelmeshes gebruiken.
      if (bus.stoelen) {
        const ids = []
        eigen.kop.vermeldingen.forEach((v, i) => {
          const o3d = eigen.kop.stukken[v.stuk]?.o3d ?? ''
          if (/seat|sitz|bank/i.test(o3d) && !/fahrer/i.test(o3d)) ids.push(i)
        })
        const d = f.doelen.find((x) => x.bakker === bus.pad)
        const t = await reken(win, `window.__bv.studio.proef({ wat: 'teken', doel: ${J(d.id)}, ids: ${J(ids)} })`)
        const band = [{ id: 'b', naam: 'Band', zichtbaar: true, dekking: 1, detail: 1, soort: 'strook', sjabloon: 'onderband', h1: 0.4, h2: 1.6, hoek: 0, golf: 0, zijden: 'rondom', kleur: '#ff00ff' }]
        await reken(win, `window.__bv.studio.lagen(${J(band)}, { aan: true })`)
        const ex = await reken(win, `window.__bv.studio.exporteer({ alleen: [${J(d.id)}], metRgba: true })`)
        const basis = lf.decodeer(d.standaard)
        let stoel = 0
        let veranderd = 0
        let bandTexels = 0
        if (Array.isArray(ex) && t?.px && basis) {
          const tp = b64(t.px)
          const rgba = b64(ex[0].rgba)
          for (let i = 0; i < tp.length; i += 4) {
            const anders = rgba[i] !== basis.pixels[i] || rgba[i + 1] !== basis.pixels[i + 1] || rgba[i + 2] !== basis.pixels[i + 2]
            if (anders) bandTexels++
            if (tp[i] < 128 || tp[i + 1] >= 128) continue
            stoel++
            if (anders) veranderd++
          }
        }
        r.stoelen = { vermeldingen: ids.length, stoel, veranderd, bandTexels }
        klopt(`P5 NL202: band 0,4-1,6 m rondom (${bandTexels} texels veranderd): ${veranderd} van ${stoel} texels die alleen stoelmeshes (${ids.length} vermeldingen) gebruiken veranderd (= 0)`, stoel > 0 && veranderd === 0 && bandTexels > 0)
        await reken(win, `window.__bv.studio.lagen(${J(lagen)}, { aan: true })`)
      }
      // P16 en P5 HH20: busopties wisselen (≤ 300 ms met een nieuw masker); onder het opschrift geen oude lak.
      if (bus.opties) {
        const d = f.doelen.find((x) => x.bakker === bus.pad)
        // De texels van de carrosserie onder de HOCHBAHN-letters: hun plek (MIN/MAX op de bewerkmaat) in de doos van de lettermeshes.
        const letters = lettersDoos(eigen, 'hide_hochbahn_ext')
        const plek = await reken(win, `window.__bv.studio.proef({ wat: 'plek', doel: ${J(d.id)} })`)
        const mk = await reken(win, `window.__bv.studio.proef({ wat: 'masker', doel: ${J(d.id)} })`)
        const mkPx = mk?.px ? b64(mk.px) : undefined
        const onder = []
        // Per texel de eerste lettermesh in wiens doos hij valt: waar blijft de oude lak staan?
        const welke = new Map()
        if (letters && plek?.px && mkPx) {
          const px = b64(plek.px)
          const eb = plek.b
          const eh = plek.h / 2
          const n = eb * eh * 4
          const g = Math.max(...[0, 1, 2].map((k) => doos.max[k] - doos.min[k]))
          for (let i = 0; i < n; i += 4) {
            if (px[n + i + 3] === 0) continue
            const w = [0, 1, 2].map((k) => doos.min[k] + ((px[i + k] + px[n + i + k]) / 2 / 255) * g)
            const l0 = letters.find((l) => [0, 1, 2].every((k) => w[k] >= l.min[k] - 0.06 && w[k] <= l.max[k] + 0.06))
            // Alleen wat buiten ligt en geen glas is (de rest lakt geen enkele laag).
            const t = i / 4
            const j = (Math.floor(t / eb) * 2 * mk.b + (t % eb) * 2) * 4
            if (l0 && mkPx[j] > 127 && mkPx[j + 1] < 128) {
              onder.push(t)
              welke.set(t, l0.o3d)
            }
          }
        }
        const basisHH = lf.decodeer(d.standaard)
        const nietGelakt = new Map()
        const nietPerMesh = new Map()
        const telOnder = (e) => {
          if (!e?.px) return -1
          const px = b64(e.px)
          const eb = plek.b
          let gelakt = 0
          nietGelakt.clear()
          nietPerMesh.clear()
          for (const t of onder) {
            const x = (t % eb) * 2
            const y = Math.floor(t / eb) * 2
            if (px[(y * e.b + x) * 4] > 127) {
              gelakt++
              continue
            }
            nietPerMesh.set(welke.get(t), (nietPerMesh.get(welke.get(t)) ?? 0) + 1)
            if (basisHH) {
              // De kleur van de basis daar, grof (per 32 in elk kanaal), om te zien welke zone het is.
              const i = (y * basisHH.breedte + x) * 4
              const k = `#${[0, 1, 2].map((c) => ((basisHH.pixels[i + c] >> 5) << 5).toString(16).padStart(2, '0')).join('')}`
              nietGelakt.set(k, (nietGelakt.get(k) ?? 0) + 1)
            }
          }
          return gelakt
        }
        const voor = await reken(win, `window.__bv.studio.proef({ wat: 'effect', doel: ${J(d.id)} })`)
        const o1 = await reken(win, `window.__bv.studio.opties([['hide_hochbahn_ext', 1], ['decal_ebus_rear', 0]])`)
        const na = await reken(win, `window.__bv.studio.proef({ wat: 'effect', doel: ${J(d.id)} })`)
        let erbij = 0
        let eraf = 0
        if (voor?.px && na?.px) {
          const a = b64(voor.px)
          const b = b64(na.px)
          for (let i = 0; i < a.length; i += 4) {
            if (a[i] < 128 && b[i] >= 128) erbij++
            if (a[i] >= 128 && b[i] < 128) eraf++
          }
        }
        const onderVoor = telOnder(voor)
        const onderNa = telOnder(na)
        r.opties = { o1, erbij, eraf, letters, onder: onder.length, onderVoor, onderNa }
        klopt(`P16 HH20: busopties wisselen ${o1?.totaalMs} ms (lak ${o1?.lakMs}, masker ${o1?.maskerMs}) (≤ 300), ${o1?.zichtbaar} vermeldingen zichtbaar`, (o1?.totaalMs ?? 999) <= 300)
        klopt(
          `P5 HH20 hide_hochbahn_ext = 1: ${onderNa} van de ${onder.length} carrosserietexels (buiten, geen glas) in de rechthoek van het opschrift (${letters?.length ?? 0} meshes: ${(letters ?? []).map((l) => l.o3d).join(', ')}) gelakt; vóór het verbergen ${onderVoor} (de letters liggen binnen de 5 cm en dekken niet af); het masker wint ${erbij} en verliest ${eraf} texels; niet gelakt (kleur van de basis): ${[...nietGelakt.entries()].sort((p, q) => q[1] - p[1]).slice(0, 4).map(([k, n]) => `${k} ${n}`).join(', ')}; per doos: ${[...nietPerMesh.entries()].sort((p, q) => q[1] - p[1]).map(([k, n]) => `${k} ${n}`).join(', ')}`,
          onder.length > 0 && onderNa >= 0.97 * onder.length && eraf === 0
        )
        const a = await reken(win, `window.__bv.afdruk(${J({ stand: { draai: 270, kantel: 3, zoom: 1 }, b: 1280, h: 720, formaat: 'png' })})`)
        if (a?.beeld) fs.writeFileSync(path.join(BEELD, `${bus.kort}-opties.png`), b64(a.beeld))
        // Het reclamesjabloon (Werbung/C2_21_Standard): alleen het reclamevlak; daar moet het automatische masker lakken.
        const maPad = path.join(OMSI, 'Vehicles', 'HH20_EBus2021', 'Texture', 'Werbung', 'templates', 'newC2EG_MA.bmp')
        const ma = fs.existsSync(maPad) ? lf.decodeer(maPad) : undefined
        if (ma && na?.px) {
          const px = b64(na.px)
          const s2 = ma.breedte / na.b
          let wit = 0
          let gelakt = 0
          for (let y = 0; y < na.h; y++)
            for (let x = 0; x < na.b; x++) {
              const i = (y * na.b + x) * 4
              if (px[i + 3] < 128) continue
              if (ma.pixels[(Math.floor(y * s2) * ma.breedte + Math.floor(x * s2)) * 4] < 239) continue
              wit++
              if (px[i] > 127) gelakt++
            }
          r.reclame = { wit, gelakt }
          meld(`P5 HH20: het sjabloon C2_21_Standard is een reclamesjabloon (map Werbung, niet gebruikt): zijn MA is het reclamevlak, geen lakmasker, dus de eis "≥ 97% gelijk aan MA" is hier niet toe te passen; het automatische masker lakt ${(wit ? (100 * gelakt) / wit : 0).toFixed(1)}% van de ${wit} texels van dat vlak (de donkere onderrand is een eigen zone < 10%)`)
        }
      }
      // P6: tegels en in één keer byte-gelijk op niveau 0 (HH20, 2048²); een felle testkleur als basis bloedt niet in de mips.
      if (bus.tegels) {
        const d = f.doelen.find((x) => x.bakker === bus.pad)
        const a1 = await reken(win, `window.__bv.studio.exporteer({ alleen: [${J(d.id)}], tegel: 1024, metRgba: true })`)
        const a2 = await reken(win, `window.__bv.studio.exporteer({ alleen: [${J(d.id)}], tegel: 0, metRgba: true })`)
        let verschil = -1
        if (Array.isArray(a1) && Array.isArray(a2)) {
          const x = b64(a1[0].rgba)
          const y = b64(a2[0].rgba)
          verschil = 0
          const waar = []
          for (let i = 0; i < x.length; i++)
            if (x[i] !== y[i]) {
              verschil++
              if (waar.length < 8) waar.push(`${(i >> 2) % d.uitB},${Math.floor((i >> 2) / d.uitB)}:${x[i]}/${y[i]}`)
            }
          if (waar.length) log(`P6 verschillen (x,y:tegels/één keer): ${waar.join(' ')}`)
        }
        klopt(`P6 HH20 ${d.naam} ${d.uitB}x${d.uitH}: export in tegels van 1024² en in één keer byte-gelijk op niveau 0 (${verschil} bytes anders)`, verschil === 0)
        // Een felle testkleur als ACHTERGROND (waar geen driehoek ligt): na het uitvloeien mag er niets van over zijn.
        await reken(win, `window.__bv.studio.proef({ wat: 'testBasis', kleur: [255, 0, 255] })`)
        const a3 = await reken(win, `window.__bv.studio.exporteer({ alleen: [${J(d.id)}], tegel: 0, metRgba: true })`)
        await reken(win, `window.__bv.studio.proef({ wat: 'testBasis' })`)
        if (Array.isArray(a3) && Array.isArray(a2)) {
          const x = b64(a3[0].rgba)
          const y = b64(a2[0].rgba)
          const B = d.uitB
          const H = d.uitH
          let anders = 0
          for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) anders++
          // Mip 3: per 8x8-blok het gemiddelde met en zonder testkleur (lineair licht).
          const lin = (c) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4)
          let slecht = 0
          let blokken = 0
          for (let by = 0; by < H / 8; by++)
            for (let bx = 0; bx < B / 8; bx++) {
              const m1 = [0, 0, 0]
              const m2 = [0, 0, 0]
              for (let yy = by * 8; yy < by * 8 + 8; yy++)
                for (let xx = bx * 8; xx < bx * 8 + 8; xx++) {
                  const i = (yy * B + xx) * 4
                  for (let k = 0; k < 3; k++) {
                    m1[k] += lin(x[i + k]) / 64
                    m2[k] += lin(y[i + k]) / 64
                  }
                }
              blokken++
              if (Math.max(...[0, 1, 2].map((k) => Math.abs(m1[k] - m2[k]))) > 0.02) slecht++
            }
          r.mips = { anders, blokken, slecht }
          klopt(`P6 HH20: felle testkleur als achtergrond: ${anders} bytes anders dan zonder, ${slecht} van ${blokken} texels op mip 3 met > 2% bijmenging (= 0)`, slecht === 0 && anders === 0)
        }
      }
    } catch (fout) {
      r.fout = String(fout?.stack ?? fout)
      klopt(`${bus.naam}: ${r.fout.slice(0, 300)}`, false)
    }
    uitslag.bussen.push(r)
    fs.writeFileSync(path.join(UIT, 'uitslag.json'), J({ ...uitslag, regels }, null, 2))
  }

  // P4: de lichte stand (NLC en C2 GN), en een geforceerd contextverlies: de studio herstart licht, met de lagen.
  if (!ALLEEN.length || ALLEEN.includes('licht')) {
    for (const pad of ['Vehicles\\MAN_NewLionsCity\\MAN_12C_2door_Voith.bus', 'Vehicles\\MB_C2_EN_BVG\\MB_C2_E6_Gn_main.bus']) {
      try {
        await versePagina(win)
        await reken(win, `window.__bv.laad(${J(pad)})`)
        const { infos, koppen } = await infosVoor(pad)
        const f = lf.familieVan(OMSI, pad, { info: (x) => infos.get(x) })
        const familie = naarStudio(f)
        const lagen = lagenVoor(koppen.get(pad).manifest.doos, false)
        const k = await reken(win, `window.__bv.studio.start(${J(familie)}, ${J(lagen)}, { aan: true }, true)`)
        const m = await reken(win, `window.__bv.studio.meet(10)`)
        const lichtMB = (m?.gpuLak ?? 0) / 1048576
        klopt(`P4 ${pad.split('\\').pop()} lichte stand: lakdoek ${Math.round(lichtMB)} MB (≤ 160), bewerkmaat ${k?.doelen?.map((d) => `${d.editB}x${d.editH}`).join(', ')}`, lichtMB <= 160)
        uitslag.licht = { ...(uitslag.licht ?? {}), [pad]: Math.round(lichtMB) }
        if (pad.includes('NewLionsCity')) {
          // Eerst de volle stand, dan het verlies: herstart licht, met dezelfde lagen.
          await reken(win, `window.__bv.studio.start(${J(familie)}, ${J(lagen)}, { aan: true }, false)`)
          const v = await reken(win, `window.__bv.studio.verlies()`, 90000)
          const na = await reken(win, `window.__bv.studio.meet(10)`)
          const e = await reken(win, `window.__bv.studio.exporteer({ alleen: [${J(familie.doelen[0].id)}], metRgba: true })`)
          const herstartMB = (na?.gpuLak ?? 0) / 1048576
          const licht = v?.klaar?.doelen?.[0] && v.klaar.doelen[0].editB * 2 <= familie.doelen[0].uitB
          uitslag.verlies = { ms: v?.ms, MB: Math.round(herstartMB), export: Array.isArray(e) }
          klopt(
            `P4 NLC: na een geforceerd contextverlies herstart het lakdoek in ${v?.ms} ms, licht (${Math.round(herstartMB)} MB, bewerkmaat ${v?.klaar?.doelen?.map((d) => `${d.editB}x${d.editH}`).join(', ')}), met de lagen (export daarna: ${Array.isArray(e) ? 'ok' : J(e).slice(0, 80)})`,
            Boolean(v?.klaar?.doelen) && herstartMB <= 160 && Boolean(licht) && Array.isArray(e)
          )
          // Tegenlezing L3 punt 1: de context valt weg TIJDENS de export: een fout, geen zwarte, doorzichtige DDS.
          const mv = await reken(win, `window.__bv.studio.exportMetVerlies(40)`, 120000)
          uitslag.exportMetVerlies = mv
          klopt(
            `herstel 1: de context valt weg tijdens de export: ${typeof mv?.uitkomst === 'object' ? `fout "${mv.uitkomst.fout}"` : `${mv?.uitkomst} ${J(mv?.dds)}`} (geen DDS); daarna herstart het lakdoek (${mv?.herstart})`,
            Boolean(mv && typeof mv.uitkomst === 'object' && mv.uitkomst.fout) && Boolean(mv.herstart)
          )
        }
      } catch (fout) {
        klopt(`P4 lichte stand ${pad}: ${String(fout).slice(0, 200)}`, false)
      }
    }
  }
  uitslag.klaar = new Date().toISOString()
  uitslag.regels = regels
  fs.writeFileSync(path.join(UIT, 'uitslag.json'), J(uitslag, null, 2))
  win.destroy()
  console.log(fouten ? `\n${fouten} fout(en)` : '\nalles klopt')
}

app.whenReady().then(async () => {
  try {
    await ronde()
  } catch (fout) {
    console.error(fout)
    fouten++
  } finally {
    fs.writeFileSync(path.join(UIT, 'log.txt'), logregels.join('\n'))
    await werker?.terminate()
    // app.exit en niet process.exitCode + app.quit: Electron negeert exitCode, en dan gaf "1 fout(en)" toch 0 (proefdraaier punt 5).
    app.exit(fouten ? 1 : 0)
  }
})
app.on('window-all-closed', () => undefined)
