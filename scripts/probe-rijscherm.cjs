/**
 * Hoe breed is het rijscherm, en past de navigatie ernaast?
 *
 *   npx electron scripts/probe-rijscherm.cjs [uitvoermap] [--breedte 1344] [--donker]
 *
 * Het scherm dat je ziet terwijl je rijdt. Het vel stond in een smalle kolom
 * over de kaart heen -- de indeling van de keuzestappen -- en daar paste de hele
 * dienstregeling niet in. Nu is het omgekeerd: het vel krijgt de ruimte en de
 * navigatie staat ernaast als een eigen element.
 *
 * Wat er nagerekend wordt: dat het vel echt breder is dan de oude kolom, dat de
 * kaart ernaast staat en er niet overheen valt, dat ze allebei binnen het
 * venster blijven, en dat het bij een smal venster niet omslaat in twee kokers.
 *
 * OMSI wordt niet aangeraakt. De dienst is verzonnen, de kaartgegevens worden
 * niet opgehaald maar leeg teruggegeven -- de indeling hangt er niet van af.
 */
const { app, BrowserWindow, nativeTheme } = require('electron')
const { build } = require('esbuild')
const { mkdirSync, mkdtempSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { pathToFileURL } = require('node:url')

const args = process.argv.slice(process.argv.findIndex((a) => a.endsWith('probe-rijscherm.cjs')) + 1)
const donker = args.includes('--donker')
const breedteVlag = args.indexOf('--breedte')
const breedtes = breedteVlag >= 0 ? [Number(args[breedteVlag + 1])] : [1344, 1100]
const uitvoer = args.find((a) => !a.startsWith('--') && !/^\d+$/.test(a))
const work = mkdtempSync(join(tmpdir(), 'omsi-rijscherm-'))
app.setPath('userData', join(work, 'gegevens'))
if (uitvoer) mkdirSync(uitvoer, { recursive: true })

const geenLetters = {
  name: 'geen-letters',
  setup(builder) {
    builder.onResolve({ filter: /^@fontsource\// }, (f) => ({ path: f.path, namespace: 'stil' }))
    builder.onLoad({ filter: /.*/, namespace: 'stil' }, () => ({ contents: '', loader: 'css' }))
  }
}

const rit = (n, vertrek, aankomst) => ({
  tripFile: 'rit' + n,
  lineFile: '849.ttp',
  lineNumber: '849',
  terminus: 'Herrenhof, Einkaufszentrum',
  departure: vertrek,
  arrival: aankomst,
  minutes: aankomst - vertrek,
  tourNumber: '01',
  switchInOmsi: false,
  layoverBefore: n === 0 ? 0 : 10,
  /* Lange namen met opzet: daar liep de smalle kolom op stuk. */
  stops: [
    'Angelroda',
    'Hohenkirchen, Rasenweg',
    'Gesamtschule Hohenkirchen Bussteig 1',
    'Hohenkirchen, Feld am Berg',
    'Hohenkirchen, Bahnhof B2',
    'Hohenkirchen, Abzw. Nadelschaft'
  ],
  stopIds: ['a', 'b', 'c', 'd', 'e', 'f'].map((k) => n + k),
  stopTimes: [vertrek, vertrek + 3, vertrek + 4, vertrek + 6, vertrek + 11, vertrek + 16]
})

const duty = {
  mapFolder: 'Hohenkirchen',
  mapName: 'Hohenkirchen - Herrenhof',
  lineFile: '849.ttp',
  tourNumber: '01',
  depot: 'Herrenhof',
  legs: [rit(0, 455, 504), rit(1, 514, 562)],
  signOn: 445,
  start: 455,
  end: 562,
  durationMinutes: 107,
  totalStops: 12,
  lineNumbers: ['849'],
  days: 0,
  period: 0
}

const entry = `
import { createRoot } from 'react-dom/client'
import './src/renderer/src/theme.css'
import './src/renderer/src/styles.css'
import './src/renderer/src/setup.css'
import { LanguageProvider } from './src/renderer/src/language'
import { Setup } from './src/renderer/src/Setup'
import { LiveDienst } from './src/renderer/src/LiveDienst'
import { RunningDuty } from './src/renderer/src/RunningDuty'

const duty = ${JSON.stringify(duty)}

/*
 * Setup vraagt het hoofdproces om de kaartgegevens. Die zijn hier niet nodig --
 * het gaat om de indeling -- en een lege kaart tekent netjes zijn eigen "komt
 * eraan"-regel. Alleen wat Setup werkelijk aanroept staat erin.
 */
window.career = {
  geometry: async () => ({ stops: [], roads: [], rails: [], water: [], bounds: undefined }),
  routes: async () => [],
  settings: async () => ({ navDeel: window.__navDeel }),
  saveSettings: async (p) => {
    window.__bewaard = p
    return p
  },
  version: async () => '0.3.1'
}

const live = {
  legIndex: 0,
  stopIndex: 1,
  clockMinutes: 455,
  delayMinutes: 0,
  deltaSeconds: 0,
  speedKmh: 0,
  passengers: 0,
  odometerKm: 0
}

function Scherm() {
  return (
    <LanguageProvider value="nl">
      <Setup
        stap="rijden"
        stappen={['profile', 'mode', 'map', 'duty', 'bus', 'rijden']}
        titel="Je rijdt"
        onderschrift="OMSI draait op Hohenkirchen - Herrenhof. Laat dit venster naast het spel staan, of gebruik de overlay."
        rijen={[]}
        gekozen={-1}
        onKies={() => {}}
        voet=""
        duty={duty}
        onStart={() => {}}
        startTekst="Dienst afronden"
        metKaart
        rijdend
        navigatie={{ routeMode: 'active', activeLeg: 0 }}
        inhoud={
          <>
            <LiveDienst duty={duty} status={live} />
            <RunningDuty
              duty={duty}
              session={{ delayMinutes: 0 }}
              connected
              laadt={false}
              busy={false}
              overlayOpen={false}
              onToggleOverlay={() => {}}
              onCancel={() => {}}
              onFinish={() => {}}
              chauffeur={{ personeelsnummer: '481902', pincode: '7341' }}
              onHoofdmenu={() => {}}
              full={null}
            />
          </>
        }
      />
    </LanguageProvider>
  )
}

createRoot(document.getElementById('root')).render(<Scherm />)
`

const meten = `(() => {
  const doos = (kies) => {
    const el = document.querySelector(kies)
    if (!el) return undefined
    const r = el.getBoundingClientRect()
    return { links: Math.round(r.left), rechts: Math.round(r.right), breed: Math.round(r.width), hoog: Math.round(r.height) }
  }
  const vel = doos('.dienstenvel')
  const kaart = doos('.setup-kaart')
  const inhoud = doos('.velinhoud')
  /* De hoofdknop hoort binnen het vel te blijven en niet over de kaart. */
  const knop = doos('.startknop')
  const greep = doos('.navgreep')
  /* De gegevens om mee aan te melden, en het icoontje van de stap die loopt. */
  const pas = [...document.querySelectorAll('.running-pas b')].map((b) => b.textContent)
  /* De weg terug hoort tussen de knoppen te staan en niet alleen in de balk. */
  const knoppen = [...document.querySelectorAll('.actions button')].map((b) => b.textContent.trim())
  const stappen = [...document.querySelectorAll('.stap')]
  const stapNu = stappen.find((n) => n.dataset.stand === 'nu')
  /*
   * Niet op de naam vergelijken: die vertaalt mee. Wel op de plek -- rijden is
   * de laatste stap -- en op het icoontje, want dat leende hij van de bus.
   */
  const stapLaatst = stapNu === stappen[stappen.length - 1]
  const stapVorm = stapNu?.querySelector('svg path')?.getAttribute('d') ?? ''
  const busVorm =
    stappen[stappen.length - 2]?.querySelector('svg path')?.getAttribute('d') ?? 'x'
  return {
    venster: window.innerWidth,
    vel,
    kaart,
    inhoud,
    knop,
    greep,
    pas,
    knoppen,
    stapNu: stapNu?.textContent.trim(),
    stapLaatst,
    eigenVorm: stapVorm !== busVorm && stapVorm.length > 0,
    /* Staat er een schuifbalk in de inhoud, en hoeveel steekt eruit? */
    scrollt: (() => {
      const el = document.querySelector('.velinhoud')
      return el ? el.scrollHeight - el.clientHeight : undefined
    })(),
    /* De langste haltenaam: breekt die nog af? */
    haltes: [...document.querySelectorAll('.live-haltenaam')].map((n) => ({
      naam: n.textContent,
      hoog: Math.round(n.getBoundingClientRect().height)
    })).slice(0, 4)
  }
})()`

app.on('window-all-closed', () => {})
process.on('unhandledRejection', (e) => {
  console.error('mislukt: ' + e)
  app.exit(1)
})
setTimeout(() => {
  console.error('time-out')
  app.exit(1)
}, 180000).unref()

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
  let goed = true

  for (const breed of breedtes) {
    const venster = new BrowserWindow({ width: breed, height: 860, show: false })
    venster.webContents.on('console-message', (_e, niveau, tekst) => {
      if (niveau >= 2) console.error('pagina zegt: ' + tekst)
    })
    await venster.loadURL(pathToFileURL(join(work, 'proef.html')).href)
    await new Promise((r) => setTimeout(r, 900))

    const m = await venster.webContents.executeJavaScript(meten)
    console.log(`venster ${m.venster}: vel ${m.vel.breed}px, kaart ${m.kaart.breed}px`)
    console.log(`  vel loopt tot ${m.vel.rechts}, kaart begint op ${m.kaart.links}`)
    console.log(`  inhoud scrollt ${m.scrollt}px over`)
    if (m.knop) console.log(`  hoofdknop van ${m.knop.links} tot ${m.knop.rechts}`)
    console.log(
      `  stap in de balk: "${m.stapNu}" (laatste: ${m.stapLaatst}, eigen vorm: ${m.eigenVorm})` +
        `, dienstgegevens ${JSON.stringify(m.pas)}`
    )
    console.log(`  knoppen: ${JSON.stringify(m.knoppen)}`)
    for (const h of m.haltes) console.log(`  halte "${h.naam}" ${h.hoog}px hoog`)

    /* De oude kolom was hoogstens 420 breed; hieronder is er niets gewonnen. */
    const ruim = m.vel.breed > 460
    const naastElkaar = m.vel.rechts <= m.kaart.links
    const binnen = m.kaart.rechts <= m.venster && m.vel.links >= 0
    const knopVrij = !m.knop || m.knop.rechts <= m.kaart.links
    /* De greep hoort tussen de twee in te liggen en niet ergens anders. */
    /* De gegevens horen er te staan, en de balk hoort de rijstap aan te wijzen. */
    const pasErop = m.pas.join('|') === '481902|7341'
    const eigenStap = m.stapLaatst && m.eigenVorm
    /* De weg terug staat vooraan, want hij is de enige die niets met deze dienst doet. */
    const terugKnop = m.knoppen.length === 6 && /main menu|hoofdmenu/i.test(m.knoppen[0])
    const greepErtussen =
      m.greep && m.greep.links >= m.vel.rechts - 4 && m.greep.rechts <= m.kaart.links + 4
    /* En hij hoort onder de inhoud te staan, niet eroverheen. */
    const knopOnder = !m.knop || m.knop.links >= m.vel.links
    /* Een haltenaam die over twee regels valt, is 40 of meer hoog. */
    const opEenRegel = m.haltes.every((h) => h.hoog < 34)
    if (!ruim || !naastElkaar || !binnen || !opEenRegel || !knopVrij || !knopOnder || !greepErtussen || !pasErop || !eigenStap || !terugKnop) {
      goed = false
      console.log(
        `  MIS: ${!ruim ? 'vel te smal ' : ''}${!naastElkaar ? 'kaart overlapt ' : ''}` +
          `${!binnen ? 'valt buiten het venster ' : ''}${!opEenRegel ? 'haltenaam breekt af ' : ''}` +
          `${!knopVrij ? 'knop ligt over de kaart ' : ''}${!knopOnder ? 'knop staat naast het vel ' : ''}` +
          `${!greepErtussen ? 'de greep ligt niet tussen de twee ' : ''}` +
          `${!pasErop ? 'geen dienstgegevens ' : ''}${!eigenStap ? 'de balk wijst de verkeerde stap aan ' : ''}` +
          `${!terugKnop ? 'geen knop naar het hoofdmenu' : ''}`
      )
    }

    if (uitvoer) {
      /* Naar de dienstgegevens toe, anders staan ze op het plaatje onder de vouw. */
      await venster.webContents.executeJavaScript(
        `document.querySelector('.running-pas')?.scrollIntoView({ block: 'center' })`
      )
      venster.showInactive()
      await new Promise((r) => setTimeout(r, 400))
      const naam = `rijscherm-${breed}${donker ? '-donker' : ''}.png`
      writeFileSync(join(uitvoer, naam), (await venster.capturePage()).toPNG())
      console.log('  plaatje: ' + naam)
    }
    /*
     * De greep verslepen. Niet net doen alsof, maar echte muisgebeurtenissen:
     * de afhandeling hangt aan pointerdown/move/up en aan het vak van het
     * scherm, en een nagebootste aanroep bewijst daar niets over.
     */
    const gesleept = await venster.webContents.executeJavaScript(`(async () => {
      const greep = document.querySelector('.navgreep')
      if (!greep) return { fout: 'geen greep' }
      const voor = document.querySelector('.setup-kaart').getBoundingClientRect().width
      const r = greep.getBoundingClientRect()
      const gebeurtenis = (naam, x, doel) => doel.dispatchEvent(new PointerEvent(naam, {
        bubbles: true, clientX: x, clientY: r.top + 40, pointerId: 1
      }))
      gebeurtenis('pointerdown', r.left + 6, greep)
      /* Naar links slepen hoort de kaart breder te maken; hij hangt rechts. */
      gebeurtenis('pointermove', r.left - 160, window)
      gebeurtenis('pointerup', r.left - 160, window)
      await new Promise((k) => requestAnimationFrame(k))
      return {
        voor: Math.round(voor),
        na: Math.round(document.querySelector('.setup-kaart').getBoundingClientRect().width),
        bewaard: window.__bewaard
      }
    })()`)
    console.log(`  slepen: kaart ${gesleept.voor} -> ${gesleept.na}, bewaard ${JSON.stringify(gesleept.bewaard)}`)
    const sleeptEcht =
      gesleept.na > gesleept.voor + 100 && typeof gesleept.bewaard?.navDeel === 'number'
    if (!sleeptEcht) {
      goed = false
      console.log('  MIS: de greep verzet de kaart niet of bewaart niets')
    }

    venster.destroy()
  }

  console.log(goed ? 'de indeling klopt' : 'DE INDELING KLOPT NIET')
  app.exit(goed ? 0 : 1)
})
