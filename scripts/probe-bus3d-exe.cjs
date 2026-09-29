/**
 * Bus3D in de gebouwde exe (design/ontwerpen/bus3d.md §13, F0): VOORBEREID.
 *
 *   node scripts/probe-bus3d-exe.cjs "<pad naar OMSI Enhancer ... draagbaar.exe>"
 *   node scripts/probe-bus3d-exe.cjs --dev        (dezelfde proef op out/ met de Electron van node_modules)
 *
 * Waarom een aparte proef: in dev laadt alles van `http://localhost` of van
 * `out/`, in de exe uit `app.asar`. Of een module-werker, het schema `omsi3d://`
 * en straks het 3D-venster (`bus3d.html`, preload `bus3d`) uit `app.asar` werken,
 * is niet te zien zonder de exe zelf (§4.4, "nog te meten in F0").
 *
 * Hoe: de exe start met een EIGEN `--user-data-dir` (Lucs app en profielen
 * blijven onaangeroerd, CLAUDE.md), met een nagebootste OMSI-map in die map
 * (settings.json wijst ernaar; de echte OMSI-map wordt niet aangeraakt, ook
 * niet gelezen), met `OMSI_ENHANCER_LIVEMAP` op een lege map (de plugin-map van
 * Luc blijft buiten schot), en met `--remote-debugging-port`. Via het
 * DevTools-protocol (CDP, WebSocket) wordt in de pagina's gerekend.
 *
 * Wat nu al kan (F1):
 * - het schema `omsi3d://` is geregistreerd en geeft 404 op een onbekend id
 *   (vanuit het hoofdvenster, met Page.setBypassCSP: index.html laat
 *   `connect-src omsi3d:` bewust niet toe, §11.3);
 * - een module-werker uit de pagina start (uit app.asar in de exe).
 * Wat komt met F2 (overgeslagen zolang `window.career.bus3dOpen` er niet is):
 * - het 3D-venster openen: de tijd van de klik tot een zichtbaar venster, koud
 *   en warm (≤ 400 ms nieuw, ≤ 100 ms als het al open is, §10);
 * - in dat venster `window.bus3d.busModel3d` op de nagebootste bus, dan `p/`,
 *   een DXT-plak van `t/` met Range, en 409 nadat het bestand verandert.
 *
 * Er wordt niets in de echte OMSI-map geschreven en OMSI start niet.
 */
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const wortel = path.join(__dirname, '..')
const args = process.argv.slice(2)
const dev = args.includes('--dev')
const exe = dev ? path.join(wortel, 'node_modules', 'electron', 'dist', 'electron.exe') : args.find((a) => !a.startsWith('--'))
if (!exe || !fs.existsSync(exe)) {
  console.error('Geef het pad naar de gebouwde exe, of --dev.')
  process.exit(2)
}

const tijdelijk = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-bus3d-exe-'))
const ud = path.join(tijdelijk, 'ud')
const nep = path.join(tijdelijk, 'steam', 'steamapps', 'common', 'OMSI 2')
const live = path.join(tijdelijk, 'live')
for (const m of [ud, live, path.join(nep, 'Vehicles', 'Proef', 'Model'), path.join(nep, 'Vehicles', 'Proef', 'Texture'), path.join(nep, 'maps'), path.join(nep, 'Texture')]) {
  fs.mkdirSync(m, { recursive: true })
}
// Een OMSI-map die als installatie herkend wordt, zonder iets van de echte.
fs.writeFileSync(path.join(nep, 'Omsi.exe'), '')
fs.writeFileSync(
  path.join(ud, 'settings.json'),
  JSON.stringify({ language: 'nl', languageChosen: true, omsiPath: nep, omsiConfirmed: true, tourSeen: true, busPhotosOffered: true })
)

let fouten = 0
const toets = (naam, goed, detail = '') => {
  if (!goed) fouten++
  console.log(`${goed ? 'GOED' : 'FOUT'}  ${naam}${detail ? `: ${detail}` : ''}`)
}
const wacht = (ms) => new Promise((k) => setTimeout(k, ms))

async function cdpDoel(poort, filter, ms = 20000) {
  const tot = Date.now() + ms
  while (Date.now() < tot) {
    try {
      const lijst = await (await fetch(`http://127.0.0.1:${poort}/json/list`)).json()
      const doel = lijst.find(filter)
      if (doel) return doel
    } catch {
      // nog niet op
    }
    await wacht(200)
  }
  return undefined
}

function verbind(wsUrl) {
  return new Promise((klaar, fout) => {
    const ws = new WebSocket(wsUrl)
    let volgende = 0
    const wachtend = new Map()
    ws.onmessage = (e) => {
      const b = JSON.parse(String(e.data))
      if (b.id && wachtend.has(b.id)) {
        wachtend.get(b.id)(b)
        wachtend.delete(b.id)
      }
    }
    ws.onerror = fout
    ws.onopen = () =>
      klaar({
        stuur: (method, params = {}) =>
          new Promise((k) => {
            const id = ++volgende
            wachtend.set(id, k)
            ws.send(JSON.stringify({ id, method, params }))
          }),
        sluit: () => ws.close()
      })
  })
}

async function reken(cdp, expressie) {
  const r = await cdp.stuur('Runtime.evaluate', { expression: expressie, awaitPromise: true, returnByValue: true })
  if (r.result?.exceptionDetails) return { fout: r.result.exceptionDetails.exception?.description ?? 'fout' }
  return r.result?.result?.value
}

async function main() {
  const poort = 9300 + Math.floor(Math.random() * 500)
  const argv = dev ? [wortel] : []
  argv.push(`--user-data-dir=${ud}`, `--remote-debugging-port=${poort}`)
  const begin = Date.now()
  const kind = spawn(exe, argv, {
    env: { ...process.env, OMSI_ENHANCER_LIVEMAP: live, ELECTRON_RENABLE_LOGGING: '' },
    stdio: 'ignore'
  })
  try {
    const hoofd = await cdpDoel(poort, (d) => d.type === 'page' && /index\.html|localhost/.test(d.url))
    toets('hoofdvenster in de CDP-lijst', Boolean(hoofd), hoofd ? `${Date.now() - begin} ms, ${hoofd.url}` : '')
    if (!hoofd) return
    const cdp = await verbind(hoofd.webSocketDebuggerUrl)
    await cdp.stuur('Page.enable')
    await cdp.stuur('Page.setBypassCSP', { enabled: true })
    await cdp.stuur('Page.reload')
    await wacht(2500)

    const onbekend = await reken(cdp, `fetch('omsi3d://t/${'0'.repeat(40)}').then((r) => r.status, (e) => 'fout: ' + e)`)
    toets('omsi3d:// geregistreerd: een onbekend id geeft 404', onbekend === 404, String(onbekend))
    const pad = await reken(cdp, `fetch('omsi3d://t/..%5C..%5Cwindows%5Cwin.ini').then((r) => r.status, (e) => 'fout: ' + e)`)
    toets('omsi3d:// geeft niets op een pad', pad === 404, String(pad))
    const werker = await reken(
      cdp,
      `new Promise((k) => { const w = new Worker(URL.createObjectURL(new Blob(['postMessage(1)'], { type: 'text/javascript' })), { type: 'module' }); w.onmessage = () => k('draait'); w.onerror = (e) => k('fout: ' + e.message); setTimeout(() => k('stil'), 3000) })`
    )
    toets('een module-werker start in de pagina (blob)', werker === 'draait', String(werker))

    const heeftVenster = await reken(cdp, `typeof window.career?.bus3dOpen === 'function'`)
    if (!heeftVenster) {
      console.log('OVERGESLAGEN  het 3D-venster (bus3d.html, preload bus3d): komt in F2')
    } else {
      // F2: de opentijd van het venster, koud en warm; dan het model, p/, t/ met Range en 409.
      for (const ronde of ['koud', 'warm']) {
        const t0 = Date.now()
        await reken(cdp, `window.career.bus3dOpen({ relatiefPad: 'Vehicles\\\\Proef\\\\Proef.bus', doel: 'buskeuze', titel: 'Proef' })`)
        const venster = await cdpDoel(poort, (d) => d.type === 'page' && /bus3d\.html/.test(d.url), 5000)
        toets(`3D-venster zichtbaar (${ronde})`, Boolean(venster), `${Date.now() - t0} ms`)
      }
    }
    cdp.sluit()
  } finally {
    kind.kill()
    await wacht(500)
    fs.rmSync(tijdelijk, { recursive: true, force: true })
    console.log(`\n${fouten === 0 ? 'ALLES GOED' : `${fouten} FOUT(EN)`}`)
    process.exitCode = fouten === 0 ? 0 : 1
  }
}

main().catch((fout) => {
  console.error(fout)
  process.exitCode = 1
})
