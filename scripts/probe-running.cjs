/**
 * Staat er tijdens het rijden alleen de kern van de eerste rit op het scherm?
 *
 *   npx electron scripts/probe-running.cjs [kaartmap]
 *
 * Het compacte scherm wordt uit de bron gebouwd en met een echte dienst
 * getoond, zonder OMSI aan te raken of een situatie te schrijven. Wat erop
 * hoort te staan: de lijn, de route, het vertrek, de halte waar je begint en de
 * richting -- en de knoppen. Wat er niet op hoort: de hele dienstkaart en de
 * routekaart, die zitten achter een knop. Daarna worden die knoppen ook
 * ingedrukt, want een knop die niets opent is net zo erg als geen knop.
 */
const { app, BrowserWindow } = require('electron')
const { build } = require('esbuild')
const { mkdtempSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

const args = process.argv.slice(
  process.argv.findIndex((arg) => arg.endsWith('probe-running.cjs')) + 1
)
const mapFolder = args[0] || 'Rheinhausen'
const work = mkdtempSync(join(tmpdir(), 'omsi-running-'))
app.setPath('userData', join(work, 'gegevens'))

/** Stylesheets doen hier niets; die laten we leeg. */
const stubCss = {
  name: 'css-leeg',
  setup(builder) {
    builder.onResolve({ filter: /\.css$/ }, (found) => ({ path: found.path, namespace: 'leeg' }))
    builder.onLoad({ filter: /.*/, namespace: 'leeg' }, () => ({ contents: '', loader: 'js' }))
  }
}

/** De gegevenskant: een echte dienst en de posities van de kaart. */
const nodeEntry = `
import { buildNetwork, generateDuty } from './src/core/duty'
import { readMapData } from './src/core/geo'
import { findOmsiInstall } from './src/core/install'
import { loadMap } from './src/core/timetable'

export function gegevens(folder) {
  const omsi = findOmsiInstall()
  if (!omsi) throw new Error('Geen OMSI 2 gevonden.')
  const map = loadMap(omsi + '/maps', folder)
  if (!map) throw new Error('Kaart ' + folder + ' niet gevonden.')
  const duty = generateDuty(map, buildNetwork(map), { targetMinutes: 90 })
  if (!duty) throw new Error('Geen dienst gevonden.')

  const ids = new Set(map.stops.keys())
  for (const trip of map.trips.values()) for (const stop of trip.stops) ids.add(stop.id)
  const { geometry } = readMapData(map.path, ids, omsi)
  for (const stop of geometry.stops) {
    const known = map.stops.get(stop.id)
    if (known && known.name) stop.name = known.name
  }
  return { duty, geometry }
}
`

/** De schermkant: het compacte scherm in een leeg venster. */
const webEntry = `
import { createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { LanguageProvider } from './src/renderer/src/language'
import { RunningDuty } from './src/renderer/src/RunningDuty'

let root
window.toon = (props) => {
  if (!root) root = createRoot(document.getElementById('root'))
  root.render(
    h(
      LanguageProvider,
      { language: 'nl' },
      h(RunningDuty, {
        ...props,
        onToggleOverlay() {},
        onCancel() {},
        onFinish() {},
        // Een herkenbaar blokje in plaats van de echte dienstkaart.
        full: h('div', { id: 'hele-dienstkaart' }, 'de hele dienst')
      })
    )
  )
}
`

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function bouw() {
  const nodeOut = join(work, 'gegevens.cjs')
  await build({
    stdin: {
      contents: nodeEntry,
      resolveDir: join(__dirname, '..'),
      loader: 'tsx',
      sourcefile: 'gegevens.tsx'
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: nodeOut,
    plugins: [stubCss],
    logLevel: 'warning'
  })
  await build({
    stdin: {
      contents: webEntry,
      resolveDir: join(__dirname, '..'),
      loader: 'tsx',
      sourcefile: 'scherm.tsx'
    },
    bundle: true,
    platform: 'browser',
    format: 'iife',
    outfile: join(work, 'scherm.js'),
    jsx: 'automatic',
    plugins: [stubCss],
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'warning'
  })
  writeFileSync(
    join(work, 'scherm.html'),
    '<!doctype html><meta charset="utf-8"><div id="root"></div><script src="scherm.js"></script>',
    'utf8'
  )
  return nodeOut
}

app.whenReady().then(async () => {
  const nodeOut = await bouw()
  const { duty, geometry } = require(nodeOut).gegevens(mapFolder)
  const leg = duty.legs[0]

  // De IBIS-codes doen we na: welke route bij welke rit hoort is hier niet de vraag.
  const ibis = {
    line: leg.lineNumber,
    tour: duty.tourNumber,
    legs: duty.legs.map((trip, index) => ({
      route: index % 2 === 0 ? '1' : '2',
      lineNumber: trip.lineNumber,
      terminus: trip.terminus
    })),
    resolved: duty.legs.length,
    total: duty.legs.length,
    hasRoutes: true
  }

  const page = new BrowserWindow({ width: 1100, height: 800, show: false })
  await page.loadFile(join(work, 'scherm.html'))

  const js = (code) => page.webContents.executeJavaScript(code)
  // De kaartposities komen normaal uit het hoofdproces; hier zetten we ze klaar.
  // De routes laten we leeg: dan lopen de lijnen recht van halte naar halte,
  // en daar gaat deze proef niet over.
  await js(
    'window.career = { geometry: async () => (' +
      JSON.stringify(geometry) +
      '), routes: async () => [] }; true'
  )

  const props = {
    duty,
    ibis,
    connected: true,
    busy: false,
    exam: false,
    overlayOpen: true,
    session: {
      drivenKm: 12.4,
      elapsedMinutes: 30,
      delayMinutes: 2,
      dutyComplete: false,
      finished: true
    }
  }
  await js('window.toon(' + JSON.stringify(props) + '); true')
  await wait(500)

  const tekst = () => js('document.body.innerText.replace(/\\s+/g, " ")')
  const er = (kies) => js('Boolean(document.querySelector(' + JSON.stringify(kies) + '))')
  const klik = (label) =>
    js(
      '(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === ' +
        JSON.stringify(label) +
        '); if (!b) return false; b.click(); return true })()'
    )

  let ok = true
  const eis = (naam, goed) => {
    if (!goed) ok = false
    console.log('   ' + (goed ? 'ja ' : 'NEE') + ' ' + naam)
  }

  const op = await tekst()
  console.log('op het scherm: ' + op.trim().slice(0, 260) + '\n')

  console.log('de kern van de eerste rit:')
  eis('lijn ' + leg.lineNumber, op.includes(leg.lineNumber))
  // Zonder stijlblad plakt het bijschrift tegen de waarde aan; vandaar de DOM.
  const velden = await js('[...document.querySelectorAll(".running-grid .ibis-field b")].map((b) => b.textContent)')
  eis('route 1', velden.includes('1'))
  eis('vertrek vanaf ' + leg.stops[0], op.includes(leg.stops[0]))
  eis('richting ' + leg.terminus, op.includes(leg.terminus))
  eis('hoe je ervoor staat', op.includes('12.4 km gereden') && op.includes('te laat'))

  /*
   * En de regel waar het om draait: kleur zegt alleen iets over de tijd. Rood te
   * laat, groen op tijd, blauw te vroeg. De klasse op het vak zegt welke het is;
   * die wordt in één plek bepaald (`src/shared/status.ts`), dus als hij hier
   * klopt klopt hij in de overlay ook.
   */
  console.log('\nde tijd in kleur:')
  const standen = [
    ['ruim te laat', 2, 'is-laat'],
    ['ruim te vroeg', -3, 'is-vroeg'],
    ['binnen de minuut', 0.4, 'is-optijd'],
    ['precies op tijd', 0, 'is-optijd']
  ]
  for (const [naam, minuten, klasse] of standen) {
    await js(
      'window.toon(' +
        JSON.stringify({
          ...props,
          session: { drivenKm: 12.4, elapsedMinutes: 30, delayMinutes: minuten, dutyComplete: false, finished: true }
        }) +
        '); true'
    )
    await wait(250)
    const gevonden = await js('document.querySelector(".running-delta")?.className ?? ""')
    eis(`${naam} -> ${klasse}`, gevonden.includes(klasse), `stond op "${gevonden.trim()}"`)
  }

  // En zonder verbinding met OMSI valt er niets af te lezen; dan hoort er geen
  // kleur te staan, want een cijfer zou nergens op slaan.
  await js('window.toon(' + JSON.stringify({ ...props, connected: false, session: undefined }) + '); true')
  await wait(250)
  const zonder = await js('document.querySelector(".running-delta")?.className ?? ""')
  eis('zonder OMSI geen kleur', !/is-(laat|optijd|vroeg)/.test(zonder), `stond op "${zonder.trim()}"`)
  await js('window.toon(' + JSON.stringify(props) + '); true')
  await wait(250)

  console.log('\nwat erachter hoort te zitten:')
  eis('dienstkaart niet in beeld', !(await er('#hele-dienstkaart')))
  eis('routekaart niet in beeld', !(await er('.map-window')))

  console.log('\nde knoppen:')
  let gedrukt = await klik('Bekijk volledige dienst')
  await wait(300)
  eis('"Bekijk volledige dienst" opent de kaart', gedrukt && (await er('#hele-dienstkaart')))
  gedrukt = await klik('Sluiten')
  await wait(300)
  eis('"Sluiten" doet hem weer dicht', gedrukt && !(await er('#hele-dienstkaart')))

  gedrukt = await klik('Bekijk route')
  await wait(1500)
  eis('"Bekijk route" opent de routekaart', gedrukt && (await er('.map-window')))
  eis('de route staat erop', (await js('document.querySelectorAll("svg path, svg polyline").length')) > 0)
  gedrukt = await klik('Sluiten')
  await wait(400)
  eis('"Sluiten" doet hem weer dicht', gedrukt && !(await er('.map-window')))

  console.log('\nen zolang OMSI er nog niet is:')
  await js('window.toon(' + JSON.stringify({ ...props, connected: false, session: undefined }) + '); true')
  await wait(400)
  eis('het scherm zegt dat het wacht', (await tekst()).includes('Wacht op OMSI'))

  console.log(ok ? '\nhet compacte scherm klopt' : '\nKLOPT NIET')
  app.exit(ok ? 0 : 1)
})
