/**
 * Is alles in de lichte stand ook echt te lezen?
 *
 *   npx electron scripts/probe-leesbaar.cjs [uitvoermap] [--donker]
 *
 * De gebruiker zag het rijscherm in de lichte stand bijna wegvallen: witte
 * letters op een wit vel. Dit meet het in plaats van het te bekijken. De echte
 * onderdelen worden gebouwd met de echte stijlbladen, in een venster dat op
 * licht staat, en daarna loopt er een teller over elk stuk tekst: welke kleur
 * heeft de letter, welke kleur ligt eronder, en hoeveel contrast is dat.
 *
 * De grens is die van WCAG: 4.5 voor gewone tekst, 3.0 voor tekst vanaf 24
 * pixels (of 18.66 vetgedrukt). Alles daaronder komt in de lijst.
 *
 * Beide standen worden nagerekend, en beide met een dienst die loopt: dan pas
 * kleuren het vertragingsvak en de rit waar je in zit, en die kleuren -- rood,
 * groen, blauw -- zijn juist de plekken waar het mis kan gaan.
 *
 * De venstertjes staan er apart bij, want die liggen niet op het vel maar op een
 * donker waas over het hele scherm. Dat is een andere ondergrond en dus een
 * andere som -- en precies waar het een keer misging.
 *
 * OMSI wordt niet aangeraakt: de dienst is verzonnen en er wordt niets gelezen
 * of geschreven buiten de tijdelijke map.
 */
const { app, BrowserWindow, nativeTheme } = require('electron')
const { build } = require('esbuild')
const { mkdirSync, mkdtempSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { pathToFileURL } = require('node:url')

const args = process.argv.slice(process.argv.findIndex((a) => a.endsWith('probe-leesbaar.cjs')) + 1)
const donker = args.includes('--donker')
const uitvoer = args.find((a) => !a.startsWith('--'))
const work = mkdtempSync(join(tmpdir(), 'omsi-leesbaar-'))
app.setPath('userData', join(work, 'gegevens'))
if (uitvoer) mkdirSync(uitvoer, { recursive: true })

/* Lettertypen slepen woff-bestanden mee die hier niets toevoegen. */
const geenLetters = {
  name: 'geen-letters',
  setup(builder) {
    builder.onResolve({ filter: /^@fontsource\// }, (f) => ({ path: f.path, namespace: 'stil' }))
    builder.onLoad({ filter: /.*/, namespace: 'stil' }, () => ({ contents: '', loader: 'css' }))
  }
}

/*
 * Een verzonnen dienst. Alleen de velden die deze twee schermen aanraken; wat
 * er niet in staat wordt niet getekend en hoeft dus ook niet te kloppen.
 */
const rit = (n, vertrek, aankomst, lijn, naar) => ({
  tripFile: `rit${n}`,
  lineFile: '15.ttp',
  lineNumber: lijn,
  terminus: naar,
  departure: vertrek,
  arrival: aankomst,
  minutes: aankomst - vertrek,
  tourNumber: '02',
  switchInOmsi: false,
  layoverBefore: n === 0 ? 0 : 5,
  stops: ['Nordbahnhof', 'Markt', 'Rheinaue'],
  stopIds: [`${n}a`, `${n}b`, `${n}c`],
  stopTimes: [vertrek, vertrek + 8, aankomst]
})

const duty = {
  mapFolder: 'Rheinhausen',
  mapName: 'Rheinhausen',
  lineFile: '15.ttp',
  tourNumber: '02',
  depot: 'Rheinhausen',
  legs: [rit(0, 790, 810, '15', 'Rheinaue'), rit(1, 815, 835, '15', 'Nordbahnhof')],
  signOn: 780,
  start: 790,
  end: 835,
  durationMinutes: 45,
  totalStops: 6,
  lineNumbers: ['15'],
  days: 0,
  period: 0
}

/*
 * Drie standen van de klok, want elk heeft zijn eigen kleur: rood te laat,
 * groen op tijd, blauw te vroeg. Ze worden alle drie getekend, want een
 * kleurvlak dat alleen in een van de drie misgaat is net zo stuk.
 */
const standen = [3.5, 0, -2.5]

const entry = `
import { createRoot } from 'react-dom/client'
import './src/renderer/src/theme.css'
import './src/renderer/src/styles.css'
import './src/renderer/src/setup.css'
import './src/renderer/src/profiel.css'
import { LanguageProvider } from './src/renderer/src/language'
import { LiveDienst } from './src/renderer/src/LiveDienst'
import { RunningDuty } from './src/renderer/src/RunningDuty'
import { Dienstpas } from './src/renderer/src/Dienstpas'
import { HofDialog } from './src/renderer/src/HofDialog'

const duty = ${JSON.stringify(duty)}

/*
 * Het vel waar deze schermen in hangen. In de app komt dat van Setup.tsx; hier
 * zetten we alleen de klasse, want daar hangen de kleuren aan.
 */
function Scherm() {
  return (
    <LanguageProvider value="nl">
      <div className="setup">
        <div className="vel">
          {[undefined, ...${JSON.stringify([1, 2, 3])}.map((_, i) => i)].map((n) => {
            const vertraging = n === undefined ? undefined : ${JSON.stringify([3.5, 0, -2.5])}[n]
            const live =
              vertraging === undefined
                ? undefined
                : {
                    legIndex: 0,
                    stopIndex: 1,
                    /* Zonder klok staat er NaN op de tegel; dat is de proef, niet de app. */
                    clockMinutes: 798,
                    delayMinutes: vertraging,
                    deltaSeconds: vertraging * 60,
                    speedKmh: 38,
                    passengers: 21,
                    odometerKm: 1204.6
                  }
            return (
              <div key={String(n)}>
                <LiveDienst duty={duty} status={live} />
                <RunningDuty
                  duty={duty}
                  session={live && { delayMinutes: vertraging }}
                  connected={live !== undefined}
                  laadt={false}
                  busy={false}
                  overlayOpen={false}
                  onToggleOverlay={() => {}}
                  onCancel={() => {}}
                  onFinish={() => {}}
                  full={null}
                />
              </div>
            )
          })}
        </div>
      </div>

      {/*
        De venstertjes. Ze liggen binnen de hub en het opzetvel, want daar hangen
        hun kleuren aan; naast die elementen vallen ze terug op de oude
        glaswereld. Het waas is doorzichtig, dus ze staan onder elkaar in plaats
        van op elkaar -- anders meet de teller het ene venster door het andere
        heen.

        (Let op: dit hele blok staat in een template-literal. Een accent grave
        hierin sluit die string, en dan klapt de proef eruit met een foutmelding
        die nergens naar de oorzaak wijst.)
      */}
      <div className="hub" style={{ position: 'relative', height: '380px' }}>
        <Dienstpas
          chauffeur="Luc"
          personeelsnummer="481902"
          pincode="7341"
          onGezien={() => {}}
          onStaatVanDienst={() => {}}
        />
      </div>
      <div className="setup" style={{ position: 'relative', height: '380px' }}>
        <HofDialog
          bus="Mercedes-Benz Citaro"
          aanbod={{ known: 0, total: 87, offerFile: 'Rheinhausen.hof', offerMatched: 84 }}
          bezig={false}
          onJa={() => {}}
          onNee={() => {}}
        />
      </div>
    </LanguageProvider>
  )
}

createRoot(document.getElementById('root')).render(<Scherm />)
`

/* De teller zelf. Draait in de pagina, want alleen daar staan de echte kleuren. */
const meten = `(() => {
  const ontleed = (kleur) => {
    const m = kleur.match(/[\\d.]+/g)
    if (!m) return null
    return { r: +m[0], g: +m[1], b: +m[2], a: m.length > 3 ? +m[3] : 1 }
  }
  const opElkaar = (voor, achter) => ({
    r: voor.r * voor.a + achter.r * (1 - voor.a),
    g: voor.g * voor.a + achter.g * (1 - voor.a),
    b: voor.b * voor.a + achter.b * (1 - voor.a),
    a: 1
  })
  const helderheid = ({ r, g, b }) => {
    const k = (v) => {
      const s = v / 255
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
    }
    return 0.2126 * k(r) + 0.7152 * k(g) + 0.0722 * k(b)
  }
  const contrast = (a, b) => {
    const [x, y] = [helderheid(a), helderheid(b)].sort((p, q) => q - p)
    return (x + 0.05) / (y + 0.05)
  }

  /* Wat er werkelijk onder een element ligt: alle lagen op elkaar tot het dekt. */
  const onder = (el) => {
    const lagen = []
    for (let n = el; n; n = n.parentElement) {
      const kleur = ontleed(getComputedStyle(n).backgroundColor)
      if (kleur && kleur.a > 0) lagen.push(kleur)
      if (kleur && kleur.a === 1) break
    }
    lagen.push({ r: 255, g: 255, b: 255, a: 1 })
    let grond = lagen.pop()
    while (lagen.length) grond = opElkaar(lagen.pop(), grond)
    return grond
  }

  const uit = []
  for (const el of document.querySelectorAll('*')) {
    const eigen = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
    if (!eigen) continue
    const stijl = getComputedStyle(el)
    if (stijl.visibility === 'hidden' || stijl.display === 'none') continue
    const letter = ontleed(stijl.color)
    if (!letter) continue
    const grond = onder(el)
    const c = contrast(opElkaar(letter, grond), grond)
    const maat = parseFloat(stijl.fontSize)
    const vet = parseInt(stijl.fontWeight, 10) >= 700
    const grens = maat >= 24 || (vet && maat >= 18.66) ? 3 : 4.5
    if (c >= grens) continue
    uit.push({
      klasse: el.className || el.tagName.toLowerCase(),
      tekst: el.textContent.trim().slice(0, 34),
      kleur: stijl.color,
      grond: 'rgb(' + [grond.r, grond.g, grond.b].map(Math.round).join(', ') + ')',
      maat: Math.round(maat * 10) / 10,
      contrast: Math.round(c * 100) / 100,
      grens
    })
  }
  return uit.sort((a, b) => a.contrast - b.contrast)
})()`

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
     <body><div id="root"></div><script src="proef.js"></script></body></html>`
  )

  /* De stand wordt gedwongen; wat Windows toevallig aanstaat heeft doet er niet toe. */
  nativeTheme.themeSource = donker ? 'dark' : 'light'

  const venster = new BrowserWindow({ width: 1100, height: 1400, show: false })
  venster.webContents.on('console-message', (_e, niveau, tekst) => {
    if (niveau >= 2) console.error('pagina zegt: ' + tekst)
  })
  await venster.loadURL(pathToFileURL(join(work, 'proef.html')).href)
  await new Promise((r) => setTimeout(r, 1200))

  const gevonden = await venster.webContents.executeJavaScript(meten)
  console.log(`${donker ? 'donker' : 'licht'} -- te weinig contrast: ${gevonden.length}`)
  for (const r of gevonden) {
    console.log(
      `  ${String(r.contrast).padStart(5)} (grens ${r.grens})  ${r.klasse}` +
        `  ${r.kleur} op ${r.grond}  ${r.maat}px  "${r.tekst}"`
    )
  }

  if (uitvoer) {
    venster.showInactive()
    await new Promise((r) => setTimeout(r, 400))
    const naam = donker ? 'donker.png' : 'licht.png'
    writeFileSync(join(uitvoer, naam), (await venster.capturePage()).toPNG())
    console.log('plaatje: ' + naam)
  }

  console.log(gevonden.length === 0 ? 'alles leesbaar' : 'NIET ALLES IS LEESBAAR')
  app.exit(gevonden.length === 0 ? 0 : 1)
})
