/**
 * De spelkeuze van Luc (01-10) zoals de speler hem ziet.
 *
 *   npx electron scripts/probe-spelkeuze.cjs [uitvoermap] [--donker]
 *
 * "Spel: OMSI 2 | openOMSI" naast START, en de vraag bij de eerste START als
 * openOMSI er staat en de speler nog niet koos (renderer/src/SpelKeuze.tsx).
 * Getekend zoals in de app (dezelfde stijlen), zonder hoofdproces: wat er
 * ingedrukt wordt, komt in een lijstje dat de proef naleest.
 *
 *  1. De vraag: twee antwoorden, het voorstel bovenaan met de reden ("draait
 *     nu"), en Terug. Er is geen derde ("automatisch").
 *  2. De schakelaar, nog niet gekozen: geen van beide aan, het voorstel draagt
 *     een stip; een klik kiest.
 *  3. Gekozen OMSI 2: die staat aan; een klik op openOMSI kiest openOMSI, een
 *     klik op wat al aan staat doet niets.
 *  4. Een dienst die al in openOMSI loopt: openOMSI staat aan en er valt niets
 *     te wisselen.
 *  5. De weigering: draait het andere spel, of is het gekozen spel weg, dan
 *     zegt START dat -- in vier talen ingevuld, zonder {spel} erin.
 *
 * Er wordt niets geschreven buiten de tijdelijke map, en er start geen spel.
 */
const { app, BrowserWindow, nativeTheme } = require('electron')
const { build } = require('esbuild')
const { mkdirSync, mkdtempSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { pathToFileURL } = require('node:url')

const args = process.argv.slice(process.argv.findIndex((a) => a.endsWith('probe-spelkeuze.cjs')) + 1)
const donker = args.includes('--donker')
const uitvoer = args.find((a) => !a.startsWith('--'))
const work = mkdtempSync(join(tmpdir(), 'omsi-spelkeuze-'))
app.setPath('userData', join(work, 'gegevens'))
if (uitvoer) mkdirSync(uitvoer, { recursive: true })

const geenLetters = {
  name: 'geen-letters',
  setup(builder) {
    builder.onResolve({ filter: /^@fontsource\// }, (f) => ({ path: f.path, namespace: 'stil' }))
    builder.onLoad({ filter: /.*/, namespace: 'stil' }, () => ({ contents: '', loader: 'css' }))
  }
}

const entry = `
import { createRoot } from 'react-dom/client'
import './src/renderer/src/theme.css'
import './src/renderer/src/styles.css'
import './src/renderer/src/setup.css'
import { LanguageProvider } from './src/renderer/src/language'
import { SpelDialog, SpelSchakelaar, spelWeigering, spelTeKiezen } from './src/renderer/src/SpelKeuze'
import { t } from './src/shared/i18n'

window.__gedrukt = []
const noteer = (wat) => (motor) => window.__gedrukt.push(motor ? wat + ':' + motor : wat)

const basis = {
  motor: 'openomsi', kiezen: false, voorstel: { motor: 'openomsi', reden: 'draait' }, nietGevonden: false,
  vanDienst: false, waarschuwingen: [], kan: { overlay: false, dienstLive: false, motorKnoppen: 'nee', afrekeningAchteraf: true },
  dienst: 'omsi', openomsi: { versie: '0.1.307', map: 'C:/OMSI 2', inOmsiMap: true, launcher: true, uitTemp: false }
}
const nogNiet = { ...basis, keuze: undefined, kiezen: true }
const omsi = { ...basis, keuze: 'omsi', motor: 'omsi' }
const lopend = { ...basis, keuze: 'omsi', motor: 'openomsi', vanDienst: true, dienst: 'openomsi' }

window.__weigering = ['nl', 'en', 'de', 'fr'].map((taal) => [
  spelWeigering((k, v) => t(taal, k, v), { anderSpel: 'openomsi' }),
  spelWeigering((k, v) => t(taal, k, v), { nietGevonden: true }),
  spelWeigering((k, v) => t(taal, k, v), {}) ?? ''
])
window.__teKiezen = [spelTeKiezen(basis), spelTeKiezen({ ...basis, openomsi: undefined, keuze: 'omsi' }), spelTeKiezen({ ...basis, openomsi: undefined, keuze: 'openomsi' })]

function Scherm() {
  return (
    <LanguageProvider language="nl">
      <div className="setup vraag" style={{ position: 'relative', minHeight: '520px' }}>
        <SpelDialog voorstel={{ motor: 'openomsi', reden: 'draait' }} bezig={false} onKies={noteer('vraag')} onTerug={() => noteer('terug')()} />
      </div>
      <div className="setup rij" style={{ position: 'relative', minHeight: '200px', padding: 20, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
        <div className="nog-niet"><SpelSchakelaar stand={nogNiet} onKies={noteer('nogNiet')} /></div>
        <div className="omsi"><SpelSchakelaar stand={omsi} onKies={noteer('omsi')} /></div>
        <div className="lopend"><SpelSchakelaar stand={lopend} onKies={noteer('lopend')} /></div>
      </div>
    </LanguageProvider>
  )
}

createRoot(document.getElementById('root')).render(<Scherm />)
`

app.on('window-all-closed', () => {})
process.on('unhandledRejection', (e) => {
  console.error('mislukt: ' + e)
  app.exit(1)
})
setTimeout(() => {
  console.error('time-out')
  app.exit(1)
}, 120000).unref()

let fouten = 0
const klopt = (wat, ja) => {
  console.log(`${ja ? 'ok  ' : 'FOUT'} ${wat}`)
  if (!ja) fouten++
}

app.whenReady().then(async () => {
  await build({
    stdin: { contents: entry, resolveDir: process.cwd(), loader: 'tsx', sourcefile: 'proef.tsx' },
    bundle: true,
    outfile: join(work, 'proef.js'),
    format: 'iife',
    jsx: 'automatic',
    platform: 'browser',
    plugins: [geenLetters],
    loader: { '.png': 'dataurl', '.svg': 'dataurl', '.webp': 'empty', '.woff': 'empty', '.woff2': 'empty' }
  })
  writeFileSync(
    join(work, 'proef.html'),
    `<!doctype html><html><head><meta charset="utf-8">
     <link rel="stylesheet" href="proef.css"></head>
     <body style="margin:0"><div id="root"></div><script src="proef.js"></script></body></html>`
  )

  nativeTheme.themeSource = donker ? 'dark' : 'light'
  const venster = new BrowserWindow({ width: 980, height: 800, show: false })
  venster.webContents.on('console-message', (_e, niveau, tekst) => {
    if (niveau >= 2) console.error('pagina zegt: ' + tekst)
  })
  await venster.loadURL(pathToFileURL(join(work, 'proef.html')).href)
  await new Promise((r) => setTimeout(r, 900))
  const js = (code) => venster.webContents.executeJavaScript(code)

  /* 1. de vraag */
  const vraag = await js(`({
    titel: document.querySelector('.dialog.spelkeuze h2')?.textContent,
    keuzes: [...document.querySelectorAll('.spelkeuze-keuzes button')].map((b) => ({
      motor: b.dataset.motor, aan: b.getAttribute('aria-checked'), tekst: b.textContent
    })),
    acties: [...document.querySelectorAll('.dialog.spelkeuze .dialog-actions button')].map((b) => b.textContent.trim())
  })`)
  console.log(`   vraag: "${vraag.titel}" -> ${vraag.keuzes.map((k) => k.tekst.slice(0, 40)).join(' | ')} | ${vraag.acties.join()}`)
  klopt('de vraag heeft precies twee spellen en Terug, geen "automatisch"', vraag.keuzes.length === 2 && vraag.acties.join() === 'Terug' && !/automatisch/i.test(JSON.stringify(vraag)))
  klopt('het voorstel (openOMSI, draait nu) staat bovenaan en is gemarkeerd', vraag.keuzes[0].motor === 'openomsi' && vraag.keuzes[0].aan === 'true' && /voorgesteld, draait nu/.test(vraag.keuzes[0].tekst) && vraag.keuzes[1].aan === 'false')

  /* 2-4. de schakelaar */
  const schakelaar = await js(`(['nog-niet', 'omsi', 'lopend']).map((k) => ({
    k,
    knoppen: [...document.querySelectorAll('.' + k + ' .spelschakelaar button')].map((b) => ({
      motor: b.dataset.motor, aan: b.getAttribute('aria-checked'), stip: b.dataset.voorstel ?? '', uit: b.disabled
    })),
    kop: document.querySelector('.' + k + ' .spelschakelaar-kop')?.textContent,
    titel: document.querySelector('.' + k + ' .spelschakelaar')?.getAttribute('title') ?? ''
  }))`)
  const [nogNiet, gekozen, lopend] = schakelaar
  klopt(`"${nogNiet.kop}: OMSI 2 | openOMSI" naast START`, nogNiet.kop === 'Spel' && nogNiet.knoppen.map((b) => b.motor).join() === 'omsi,openomsi')
  klopt(`nog niet gekozen: geen van beide aan, stip bij het voorstel ("${nogNiet.titel}")`, nogNiet.knoppen.every((b) => b.aan === 'false') && nogNiet.knoppen[1].stip === 'ja' && /Nog niet gekozen/.test(nogNiet.titel))
  klopt('gekozen OMSI 2: die staat aan', gekozen.knoppen[0].aan === 'true' && gekozen.knoppen[1].aan === 'false' && gekozen.knoppen.every((b) => !b.uit))
  klopt(`een lopende dienst in openOMSI: openOMSI aan, niets te wisselen ("${lopend.titel}")`, lopend.knoppen[1].aan === 'true' && lopend.knoppen.every((b) => b.uit) && /openOMSI/.test(lopend.titel))

  if (uitvoer) {
    venster.showInactive()
    await new Promise((r) => setTimeout(r, 350))
    const naam = `spelkeuze${donker ? '-donker' : ''}.png`
    writeFileSync(join(uitvoer, naam), (await venster.capturePage()).toPNG())
    console.log('plaatje: ' + naam)
  }

  /* Alles indrukken, in volgorde. */
  const gedrukt = await js(`(() => {
    for (const b of document.querySelectorAll('.spelkeuze-keuzes button, .dialog.spelkeuze .dialog-actions button')) b.click()
    for (const k of ['nog-niet', 'omsi', 'lopend']) for (const b of document.querySelectorAll('.' + k + ' .spelschakelaar button')) b.click()
    return window.__gedrukt
  })()`)
  console.log('   ingedrukt: ' + JSON.stringify(gedrukt))
  klopt(
    'de vraag kiest wat je aanklikt; de schakelaar kiest bij een klik, niet op wat al aan staat, en niet tijdens een dienst',
    gedrukt.join('|') === 'vraag:openomsi|vraag:omsi|terug|nogNiet:omsi|nogNiet:openomsi|omsi:openomsi'
  )

  /* 5. de weigering */
  const weigering = await js('window.__weigering')
  klopt(
    `de weigering in vier talen, ingevuld: "${weigering[0][0]}" / "${weigering[0][1].slice(0, 60)}…"`,
    weigering.every(([ander, weg, niets]) => ander.includes('openOMSI') && !ander.includes('{') && weg.length > 20 && !weg.includes('{') && niets === '')
  )
  const teKiezen = await js('window.__teKiezen')
  klopt('de schakelaar staat er alleen als openOMSI gevonden of gekozen is', JSON.stringify(teKiezen) === '[true,false,true]')

  console.log(fouten ? `\n${fouten} fout(en)` : '\nalles klopt')
  app.exit(fouten ? 1 : 0)
})
