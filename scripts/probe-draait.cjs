/**
 * De twee vragen die de app stelt in plaats van te raden.
 *
 *   npx electron scripts/probe-draait.cjs [uitvoermap] [--donker]
 *
 * "OMSI draait al" komt als je op START drukt terwijl het spel al open staat:
 * klaarzetten heeft dan geen zin, want OMSI leest zijn startscherm alleen bij
 * het opstarten. "Je had nog een dienst openstaan" komt bij het openen van de
 * app. Allebei hebben ze knoppen die ergens toe leiden, en dit drukt ze in en
 * kijkt of de goede afhandeling loopt.
 *
 * OMSI wordt niet aangeraakt en er wordt niets geschreven buiten de tijdelijke
 * map.
 */
const { app, BrowserWindow, nativeTheme } = require('electron')
const { build } = require('esbuild')
const { mkdirSync, mkdtempSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { pathToFileURL } = require('node:url')

const args = process.argv.slice(process.argv.findIndex((a) => a.endsWith('probe-draait.cjs')) + 1)
const donker = args.includes('--donker')
const uitvoer = args.find((a) => !a.startsWith('--'))
const work = mkdtempSync(join(tmpdir(), 'omsi-draait-'))
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
import { DraaitDialog } from './src/renderer/src/DraaitDialog'
import { HervatDialog } from './src/renderer/src/HervatDialog'

/* Wat er ingedrukt is, zodat de proef het kan nalezen. */
window.__gedrukt = []
const noteer = (wat) => () => window.__gedrukt.push(wat)

function Scherm() {
  return (
    <LanguageProvider value="nl">
      <div className="setup" style={{ position: 'relative', minHeight: '560px' }}>
        <DraaitDialog
          kaart="Hohenkirchen - Herrenhof"
          bezig={false}
          onMeerijden={noteer('meerijden')}
          onKlaarzetten={noteer('klaarzetten')}
          onTerug={noteer('terug')}
        />
      </div>
      <div className="hub" style={{ position: 'relative', minHeight: '340px' }}>
        <HervatDialog
          lijn="849"
          kaart="Hohenkirchen - Herrenhof"
          onHervatten={noteer('hervatten')}
          onVerlaten={noteer('verlaten')}
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
  const venster = new BrowserWindow({ width: 980, height: 960, show: false })
  venster.webContents.on('console-message', (_e, niveau, tekst) => {
    if (niveau >= 2) console.error('pagina zegt: ' + tekst)
  })
  await venster.loadURL(pathToFileURL(join(work, 'proef.html')).href)
  await new Promise((r) => setTimeout(r, 900))

  const staat = await venster.webContents.executeJavaScript(`({
    draaitKnoppen: [...document.querySelectorAll('.dialog.draait .dialog-actions button')]
      .map((b) => b.textContent.trim()),
    /* De twee wegen verder staan uitgeschreven; anders kies je blind. */
    keuzes: [...document.querySelectorAll('.draait-keuzes li')].map((n) => ({
      naam: n.querySelector('b')?.textContent,
      uitleg: (n.querySelector('span')?.textContent ?? '').slice(0, 40)
    })),
    hervatKnoppen: [...document.querySelectorAll('.hub .dialog .dialog-actions button')]
      .map((b) => b.textContent.trim())
  })`)
  console.log('draait: ' + JSON.stringify(staat.draaitKnoppen))
  for (const k of staat.keuzes) console.log(`  ${k.naam}: ${k.uitleg}...`)
  console.log('hervat: ' + JSON.stringify(staat.hervatKnoppen))

  if (uitvoer) {
    venster.showInactive()
    /*
     * Een voor een. Allebei zijn het vaste vlakken over het hele scherm, dus op
     * een plaatje liggen ze over elkaar heen -- in de app komt er nooit meer dan
     * een tegelijk.
     */
    for (const [welke, verberg] of [
      ['draait', '.hub'],
      ['hervat', '.setup']
    ]) {
      await venster.webContents.executeJavaScript(
        `document.querySelectorAll('.setup, .hub').forEach((n) => {
           n.style.display = n.matches('${verberg}') ? 'none' : ''
         })`
      )
      await new Promise((r) => setTimeout(r, 350))
      const naam = `${welke}${donker ? '-donker' : ''}.png`
      writeFileSync(join(uitvoer, naam), (await venster.capturePage()).toPNG())
      console.log('plaatje: ' + naam)
    }
    await venster.webContents.executeJavaScript(
      `document.querySelectorAll('.setup, .hub').forEach((n) => { n.style.display = '' })`
    )
  }

  /* Alles indrukken, in volgorde, en kijken wat er loopt. */
  const gedrukt = await venster.webContents.executeJavaScript(`(() => {
    for (const b of document.querySelectorAll('.dialog-actions button')) b.click()
    return window.__gedrukt
  })()`)
  console.log('ingedrukt: ' + JSON.stringify(gedrukt))

  const goed =
    staat.draaitKnoppen.length === 3 &&
    staat.keuzes.length === 2 &&
    staat.hervatKnoppen.length === 2 &&
    gedrukt.join('|') === 'terug|klaarzetten|meerijden|verlaten|hervatten'
  console.log(goed ? 'de vragen kloppen' : 'DE VRAGEN KLOPPEN NIET')
  app.exit(goed ? 0 : 1)
})
