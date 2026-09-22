/**
 * Hoe ziet de dienstpas eruit, en staan de cijfers er leesbaar op?
 *
 *   npx electron scripts/probe-dienstpas.cjs <uitvoermap> [--donker]
 *
 * Het venstertje dat bij binnenkomst je personeelsnummer en je pincode laat
 * zien. Het hangt in de starthub, want dat is het eerste scherm na het kiezen
 * van een profiel -- en daar hangen ook zijn kleuren aan.
 *
 * Er wordt niets gelezen of geschreven buiten de tijdelijke map; de chauffeur en
 * de cijfers zijn verzonnen.
 */
const { app, BrowserWindow, nativeTheme } = require('electron')
const { build } = require('esbuild')
const { mkdirSync, mkdtempSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { pathToFileURL } = require('node:url')

const args = process.argv.slice(process.argv.findIndex((a) => a.endsWith('probe-dienstpas.cjs')) + 1)
const donker = args.includes('--donker')
const uitvoer = args.find((a) => !a.startsWith('--'))
const work = mkdtempSync(join(tmpdir(), 'omsi-dienstpas-'))
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
import { Dienstpas } from './src/renderer/src/Dienstpas'

function Scherm() {
  return (
    <LanguageProvider value="nl">
      <div className="hub" style={{ minHeight: '100vh' }}>
        <Dienstpas
          chauffeur="Luc"
          personeelsnummer="481902"
          pincode="7341"
          onGezien={() => {}}
          onStaatVanDienst={() => {}}
        />
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

app.whenReady().then(async () => {
  await build({
    stdin: { contents: entry, resolveDir: process.cwd(), loader: 'tsx', sourcefile: 'proef.tsx' },
    bundle: true,
    outfile: join(work, 'proef.js'),
    format: 'iife',
    jsx: 'automatic',
    platform: 'browser',
    plugins: [geenLetters],
    loader: { '.png': 'dataurl', '.svg': 'dataurl', '.woff': 'empty', '.woff2': 'empty' }
  })

  writeFileSync(
    join(work, 'proef.html'),
    `<!doctype html><html><head><meta charset="utf-8">
     <link rel="stylesheet" href="proef.css"></head>
     <body style="margin:0"><div id="root"></div><script src="proef.js"></script></body></html>`
  )

  nativeTheme.themeSource = donker ? 'dark' : 'light'
  const venster = new BrowserWindow({ width: 900, height: 620, show: false })
  venster.webContents.on('console-message', (_e, niveau, tekst) => {
    if (niveau >= 2) console.error('pagina zegt: ' + tekst)
  })
  await venster.loadURL(pathToFileURL(join(work, 'proef.html')).href)
  await new Promise((r) => setTimeout(r, 900))

  const staat = await venster.webContents.executeJavaScript(`({
    cijfers: [...document.querySelectorAll('.pas-cijfers b')].map((b) => b.textContent),
    kop: document.querySelector('.dialog h2')?.textContent,
    knoppen: [...document.querySelectorAll('.dialog-actions button')].map((b) => b.textContent.trim()),
    /* Een venster dat zijn eigen grond mist, staat inkt op waas. */
    grond: getComputedStyle(document.querySelector('.dialog')).backgroundColor,
    inkt: getComputedStyle(document.querySelector('.dialog h2')).color
  })`)
  console.log((donker ? 'donker' : 'licht') + ': ' + JSON.stringify(staat))

  if (uitvoer) {
    venster.showInactive()
    await new Promise((r) => setTimeout(r, 400))
    const naam = donker ? 'pas-donker.png' : 'pas-licht.png'
    writeFileSync(join(uitvoer, naam), (await venster.capturePage()).toPNG())
    console.log('plaatje: ' + naam)
  }

  const goed =
    staat.cijfers.join('|') === '481902|7341' &&
    staat.knoppen.length === 2 &&
    !staat.grond.startsWith('rgba(0, 0, 0, 0')
  console.log(goed ? 'de pas klopt' : 'DE PAS KLOPT NIET')
  app.exit(goed ? 0 : 1)
})
