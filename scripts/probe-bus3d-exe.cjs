/**
 * Bus3D in de gebouwde exe (design/ontwerpen/bus3d.md §13, F0 en F2).
 *
 *   node scripts/probe-bus3d-exe.cjs "<pad naar OMSI Enhancer ... draagbaar.exe>"
 *   node scripts/probe-bus3d-exe.cjs --dev        (dezelfde proef op out/ met de Electron van node_modules)
 *
 * Waarom een aparte proef: in dev laadt alles van `http://localhost` of van
 * `out/`, in de exe uit `app.asar`. Of een module-werker, het schema `omsi3d://`
 * en het 3D-venster (`bus3d.html`, preload `bus3d`, de renderer-werker en zijn
 * ontleders) uit `app.asar` werken, is niet te zien zonder de exe zelf (§4.4).
 *
 * Hoe: de exe start met een EIGEN `--user-data-dir` (Lucs app en profielen
 * blijven onaangeroerd, CLAUDE.md), met een nagebootste OMSI-map in de tijdelijke
 * map (settings.json wijst ernaar, met de schakelaar `bus3d` aan), met
 * `OMSI_ENHANCER_LIVEMAP` op een lege map (de plugin-map van Luc blijft buiten
 * schot), en met `--remote-debugging-port`. Via het DevTools-protocol (CDP,
 * WebSocket) wordt in de pagina's gerekend. Uit de echte OMSI-map worden alleen
 * twee bestanden GELEZEN (gekopieerd): een open o3d en een kleine DXT1 met mips.
 *
 * Wat hij nagaat:
 * - het schema `omsi3d://` is geregistreerd en geeft 404 op een onbekend id en
 *   op een pad (vanuit het hoofdvenster, met Page.setBypassCSP: index.html laat
 *   `connect-src omsi3d:` bewust niet toe, §11.3);
 * - een module-werker uit de pagina start;
 * - het 3D-venster: van de klik tot het venster ZICHTBAAR is
 *   (`document.visibilityState` in dat venster; het wordt pas getoond als zijn
 *   eerste plaatje staat), nieuw en na sluiten opnieuw nieuw (≤ 400 ms, §10),
 *   en een tweede bus in het open venster (zelfde venster, ≤ 100 ms);
 * - in dat venster: `busModel3d` geeft een pakket, `p/` stroomt het, `t/`
 *   geeft met een Range-kop precies één mipniveau (206), en na een gewijzigd
 *   bestand 409; en het 3D-beeld komt scherp.
 * Eerst gaf deze proef "zichtbaar" al als het CDP-doel bestond, zette hij de
 * schakelaar niet aan, en vond "warm" het venster dat nog open stond (proefdraaier F2).
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
/*
 * Een OMSI-map die als installatie herkend wordt, met twee bussen op één open
 * o3d en een DXT1 met mips. Die twee bestanden worden uit de echte map GELEZEN
 * (gekopieerd); daar wordt niets geschreven.
 */
const ECHT = process.env.OMSI_MAP || 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\OMSI 2'
const busmap = path.join(nep, 'Vehicles', 'Proef')
fs.writeFileSync(path.join(nep, 'Omsi.exe'), '')
fs.writeFileSync(path.join(nep, 'addons.ini'), '')
fs.copyFileSync(path.join(ECHT, 'Vehicles', 'HH20_EBus2021', 'Model', '21_aussen_weich3_#low.o3d'), path.join(busmap, 'Model', 'open.o3d'))
// De o3d noemt newC2EG_#low.tga; OMSI zoekt in dezelfde map ook .dds: dan is dit de textuur.
const DDS = path.join(busmap, 'Texture', 'newC2EG_#low.dds')
fs.copyFileSync(path.join(ECHT, 'Texture', 'ADDON_Rheinhausen', 'erde_feld01.dds'), DDS)
fs.writeFileSync(path.join(busmap, 'Model', 'model.cfg'), ['[mesh]', 'open.o3d', ''].join('\r\n'))
const busTekst = (naam) => ['[friendlyname]', 'Proef', naam, 'Wit', '', '[model]', 'Model\\model.cfg', '', '[boundingbox]', '3', '14', '4', '0', '0', '2', ''].join('\r\n')
fs.writeFileSync(path.join(busmap, 'Proef.bus'), busTekst('Proef'))
fs.writeFileSync(path.join(busmap, 'Tweede.bus'), busTekst('Tweede'))
fs.writeFileSync(
  path.join(ud, 'settings.json'),
  JSON.stringify({ language: 'nl', languageChosen: true, omsiPath: nep, omsiConfirmed: true, tourSeen: true, busPhotosOffered: true, bus3d: true })
)

let fouten = 0
const toets = (naam, goed, detail = '') => {
  if (!goed) fouten++
  console.log(`${goed ? 'GOED' : 'FOUT'}  ${naam}${detail ? `: ${detail}` : ''}`)
}
const wacht = (ms) => new Promise((k) => setTimeout(k, ms))

async function cdpDoel(poort, filter, ms = 20000, stap = 200) {
  const tot = Date.now() + ms
  while (Date.now() < tot) {
    try {
      const lijst = await (await fetch(`http://127.0.0.1:${poort}/json/list`)).json()
      const doel = lijst.find(filter)
      if (doel) return doel
    } catch {
      // nog niet op
    }
    await wacht(stap)
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

/** Rekenen in een pagina; een pagina die intussen dichtgaat antwoordt nooit: dan na 20 s 'geen antwoord'. */
async function reken(cdp, expressie, ms = 20000) {
  const r = await Promise.race([
    cdp.stuur('Runtime.evaluate', { expression: expressie, awaitPromise: true, returnByValue: true }),
    wacht(ms).then(() => ({ result: { result: { value: 'geen antwoord' } } }))
  ])
  if (r.result?.exceptionDetails) return { fout: r.result.exceptionDetails.exception?.description ?? 'fout' }
  return r.result?.result?.value
}

/** Het 3D-venster: openen tot zichtbaar, het pakket, p/, t/ met Range en 409, het 3D-beeld, sluiten en opnieuw. */
async function hetVenster(poort, cdp) {
  const open = (bus) => reken(cdp, `window.career.bus3dOpen({ relatiefPad: 'Vehicles\\\\Proef\\\\${bus}.bus', doel: 'buskeuze', titel: 'Proef' })`)
  const vensterDoel = () => cdpDoel(poort, (d) => d.type === 'page' && /bus3d\.html/.test(d.url) && !/foto=1/.test(d.url), 5000, 15)
  /** Tot het venster zichtbaar is (het wordt pas getoond als zijn eerste plaatje staat). */
  async function totZichtbaar(t0) {
    const doel = await vensterDoel()
    if (!doel) return { ms: undefined }
    const w = await verbind(doel.webSocketDebuggerUrl)
    let zicht = ''
    while (Date.now() - t0 < 8000) {
      zicht = await reken(w, 'document.visibilityState')
      if (zicht === 'visible') break
      await wacht(10)
    }
    return { ms: zicht === 'visible' ? Date.now() - t0 : undefined, w, id: doel.id }
  }

  for (const ronde of ['nieuw', 'opnieuw na sluiten']) {
    const t0 = Date.now()
    const aanvraag = await open('Proef')
    const { ms, w, id } = await totZichtbaar(t0)
    toets(`3D-venster zichtbaar (${ronde}), <= 400 ms`, typeof aanvraag === 'number' && ms !== undefined && ms <= 400, `aanvraag ${aanvraag}, ${ms ?? '-'} ms`)
    if (!w) return
    if (ronde === 'nieuw') {
      // Het pakket, p/ en t/ vanuit het venster zelf (zijn CSP laat omsi3d: toe).
      const u = await reken(
        w,
        `(async () => {
          const a = await window.bus3d.busModel3d('Vehicles\\\\Proef\\\\Proef.bus')
          if (!a || !a.manifest) return { fout: JSON.stringify(a) }
          const p = await fetch('omsi3d://p/' + a.manifest.pakket)
          const pBytes = (await p.arrayBuffer()).byteLength
          const t = a.manifest.texturen.find((x) => x.soort === 'dxt' && x.niveaus && x.niveaus.length > 2)
          if (!t) return { fout: 'geen dxt in de lijst: ' + a.manifest.texturen.map((x) => x.naam + ':' + x.soort).join(', ') }
          const n = t.niveaus[2]
          const r = await fetch('omsi3d://t/' + t.id, { headers: { Range: 'bytes=' + n.off + '-' + (n.off + n.len - 1) } })
          const rBytes = (await r.arrayBuffer()).byteLength
          return { p: p.status, pLengte: Number(p.headers.get('content-length')), pBytes, t: r.status, tBytes: rBytes, verwacht: n.len, id: t.id }
        })()`
      )
      toets('in het venster: busModel3d geeft een pakket, p/ stroomt het', Boolean(u && u.p === 200 && u.pBytes === u.pLengte && u.pBytes > 0), JSON.stringify(u))
      toets('in het venster: t/ met Range geeft precies een mipniveau (206)', Boolean(u && u.t === 206 && u.tBytes === u.verwacht), JSON.stringify(u))
      // Het 3D-beeld zelf: werker, ontleders en shaders uit app.asar.
      let fase = ''
      const tot = Date.now() + 15000
      while (Date.now() < tot) {
        fase = await reken(w, "document.querySelector('.bv-kader')?.dataset.fase ?? ''")
        if (fase === 'scherp' || fase === 'fout') break
        await wacht(100)
      }
      toets('het 3D-beeld komt scherp in het venster (renderer-werker uit de exe)', fase === 'scherp', String(fase))
      // Een tweede bus in het open venster: zelfde venster, <= 100 ms tot de nieuwe vraag er is.
      const t1 = Date.now()
      const aanvraag2 = await open('Tweede')
      let nu = ''
      while (Date.now() - t1 < 3000) {
        nu = await reken(w, 'document.documentElement.dataset.bus ?? ""')
        if (/Tweede/.test(nu)) break
        await wacht(5)
      }
      const duur = Date.now() - t1
      const zelfde = (await vensterDoel())?.id === id
      toets('al open: een tweede bus in hetzelfde venster, <= 100 ms', /Tweede/.test(nu) && zelfde && duur <= 100, `${duur} ms, aanvraag ${aanvraag2}, zelfde venster ${zelfde}`)
      // Het textuurbestand verandert: t/ geeft 409 (de plakken kloppen niet meer).
      fs.appendFileSync(DDS, Buffer.alloc(16))
      const na = await reken(w, `fetch('omsi3d://t/${u && u.id}', { headers: { Range: 'bytes=0-127' } }).then((r) => r.status, (e) => 'fout: ' + e)`)
      toets('t/ geeft 409 nadat het textuurbestand veranderde', na === 409, String(na))
    }
    // Sluiten zoals [Sluiten]: het venster moet uit de lijst verdwijnen.
    // Niet op het antwoord wachten: het venster gaat dicht en antwoordt dan niet meer.
    void w.stuur('Runtime.evaluate', { expression: 'window.bus3d.sluit()' })
    w.sluit()
    const tot = Date.now() + 3000
    let weg = false
    while (Date.now() < tot) {
      weg = !(await cdpDoel(poort, (d) => d.id === id, 200))
      if (weg) break
    }
    toets(`3D-venster dicht na [Sluiten] (${ronde})`, weg)
  }
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
    toets('het hoofdvenster kent bus3dOpen (preload)', heeftVenster === true, String(heeftVenster))
    if (heeftVenster === true) await hetVenster(poort, cdp)
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
