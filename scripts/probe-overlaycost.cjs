/**
 * Hoeveel werk kost de overlay, en waar zit dat werk?
 *
 *   npx electron scripts/probe-overlaycost.cjs [kaartmap] [seconden]
 *
 * De overlay krijgt tien keer per seconde een beeld toegestuurd, net als tijdens
 * het rijden, met een bus die beweegt. Dat gebeurt twee keer: één keer in het
 * venster zoals de app het opzet -- schermvullend, doorzichtig, altijd bovenop --
 * en één keer in een klein venster van dezelfde inhoud. Ondertussen wordt
 * gemeten hoeveel processortijd de tekenprocessen gebruiken en hoe vaak de
 * pagina aan tekenen toekomt.
 *
 * Waarom dat verschil telt: een doorzichtig venster over het hele scherm moet
 * Windows bij elk spelbeeld opnieuw over het spel heen mengen. Kost de kleine
 * versie merkbaar minder, dan zit de hapering in het spel in het venster en niet
 * in onze rekenkunde.
 *
 * Er wordt niets geschreven en OMSI wordt niet aangeraakt: de standen zijn
 * verzonnen, alleen de dienst en de kaart zijn echt. Het schermvullende venster
 * staat een paar tellen in beeld en laat klikken door.
 */
const { app, BrowserWindow, screen } = require('electron')
const { build } = require('esbuild')
const { mkdtempSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

const args = process.argv.slice(
  process.argv.findIndex((arg) => arg.endsWith('probe-overlaycost.cjs')) + 1
)
const mapFolder = args[0] || 'Rheinhausen'
const seconds = Number(args[1] || 8)
const work = mkdtempSync(join(tmpdir(), 'omsi-kosten-'))
app.setPath('userData', join(work, 'gegevens'))

// Het hoofdproces erbij, anders heeft de overlay niemand om de kaart aan te
// vragen en meten we een overlay zonder navigatie -- juist het dure stuk.
require('../out/main/index.js')

const nodeEntry = `
import { buildNetwork, generateDuty } from './src/core/duty'
import { findOmsiInstall } from './src/core/install'
import { loadMap } from './src/core/timetable'

export function gegevens(folder) {
  const omsi = findOmsiInstall()
  if (!omsi) throw new Error('Geen OMSI 2 gevonden.')
  const map = loadMap(omsi + '/maps', folder)
  if (!map) throw new Error('Kaart ' + folder + ' niet gevonden.')
  const duty = generateDuty(map, buildNetwork(map), { targetMinutes: 90 })
  if (!duty) throw new Error('Geen dienst gevonden.')
  return { duty }
}
`

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Een stand zoals de app hem doorgeeft, met de bus een stukje verder. */
function frame(duty, step) {
  const leg = duty.legs[0]
  const at = Math.min(leg.stops.length - 1, 1 + Math.floor(step / 20))
  return {
    connected: true,
    editing: false,
    duty,
    status: {
      clockMinutes: leg.departure + step / 600,
      speedKmh: 34 + (step % 7),
      passengers: 12,
      entryRequest: false,
      exitRequest: false,
      doorsOpen: false,
      legIndex: 0,
      leg,
      nextStop: leg.stops[at],
      odometerKm: 1000 + step / 1000,
      stopIndex: at,
      stopsTotal: leg.stops.length,
      reportsStops: true,
      offersStops: true,
      delayMinutes: 1,
      delayFromIbis: false,
      deltaSeconds: 60,
      mood: 0.9,
      moodLabel: 'happy',
      hasPassengers: true,
      harshBrakes: 0,
      harshAccels: 0,
      advice: [],
      dutyComplete: false,
      omsiReadable: true,
      schedule: {
        lineName: duty.lineFile,
        tourName: duty.tourNumber,
        tripName: leg.tripFile,
        matchesDuty: true,
        legIndex: 0
      }
    }
  }
}

/** Processortijd per soort proces, opgeteld. */
function cpu() {
  const som = {}
  for (const item of app.getAppMetrics()) {
    som[item.type] = (som[item.type] ?? 0) + (item.cpu?.percentCPUUsage ?? 0)
  }
  return som
}

/** Eén meting: venster openen, beelden sturen, kijken wat het kost. */
async function meet(naam, opties, duty) {
  const overlay = new BrowserWindow({
    ...opties,
    show: true,
    webPreferences: {
      preload: join(__dirname, '../out/preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })
  if (opties.alwaysOnTop) {
    overlay.setAlwaysOnTop(true, 'screen-saver')
    overlay.setIgnoreMouseEvents(true, { forward: true })
  }
  await overlay.loadFile(join(__dirname, '../out/renderer/overlay.html'))
  await wait(2500)

  const js = (code) => overlay.webContents.executeJavaScript(code)
  await js(`
    window.meting = { beelden: 0, langste: 0, bezig: 0 }
    const rond = () => {
      window.meting.beelden++
      requestAnimationFrame(rond)
    }
    requestAnimationFrame(rond)
    new PerformanceObserver((lijst) => {
      for (const item of lijst.getEntries()) {
        window.meting.bezig += item.duration
        window.meting.langste = Math.max(window.meting.langste, item.duration)
      }
    }).observe({ entryTypes: ['longtask'] })
    true
  `)

  // De kaart moet er staan, anders meten we een overlay zonder navigatie. De
  // route komt pas in beeld als de chauffeur de IBIS heeft afgemeld, dus die
  // knop drukken we hier zelf in.
  let step = 0
  for (let i = 0; i < 5; i++) overlay.webContents.send('overlay:frame', frame(duty, step++))
  await wait(1500)
  await js('document.querySelector(".ovl-btn")?.click(); true')
  await wait(6000)
  const kaart = await js('document.querySelectorAll("svg polyline, svg path, svg circle").length')
  console.log(
    '   ' + naam + ': ' + kaart + ' vormen, ' +
      (await js('document.querySelectorAll(".route-line").length')) + ' routelijnen, ' +
      (await js('document.querySelectorAll(".stop-dot, .stop-label").length')) + ' haltes'
  )

  await js('window.meting.beelden = 0; window.meting.bezig = 0; window.meting.langste = 0; true')
  cpu()
  const begin = Date.now()
  const timer = setInterval(() => {
    overlay.webContents.send('overlay:frame', frame(duty, step++))
  }, 100)
  await wait(seconds * 1000)
  clearInterval(timer)
  const verbruik = cpu()

  const meting = await js('window.meting')
  const duur = (Date.now() - begin) / 1000
  overlay.destroy()
  await wait(500)

  return {
    naam,
    kaart,
    fps: meting.beelden / duur,
    bezig: (meting.bezig / (duur * 1000)) * 100,
    langste: meting.langste,
    gpu: verbruik.GPU ?? 0,
    tekenen: verbruik.Tab ?? 0,
    hoofd: verbruik.Browser ?? 0
  }
}

app.whenReady().then(async () => {
  const out = join(work, 'gegevens.cjs')
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
    outfile: out,
    logLevel: 'warning'
  })
  const { duty } = require(out).gegevens(mapFolder)
  const area = screen.getPrimaryDisplay().workArea

  const zoalsDeApp = {
    width: area.width,
    height: area.height,
    x: area.x,
    y: area.y,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    alwaysOnTop: true
  }
  const klein = { ...zoalsDeApp, width: 620, height: 520, x: area.x + 40, y: area.y + 40 }

  const uitkomst = []
  uitkomst.push(await meet('schermvullend (zoals nu)', zoalsDeApp, duty))
  uitkomst.push(await meet('klein venster', klein, duty))

  console.log(`\nkaart ${mapFolder}, dienst ${duty.lineFile}/${duty.tourNumber}, ${duty.legs.length} ritten`)
  console.log(`venster ${area.width}x${area.height}, ${seconds} seconden per meting, tien beelden per seconde\n`)
  console.log('                            kaart   beeld/s  draad%  langste  GPU%   teken%  hoofd%')
  for (const r of uitkomst) {
    console.log(
      r.naam.padEnd(27) +
        String(r.kaart).padStart(5) +
        r.fps.toFixed(0).padStart(10) +
        r.bezig.toFixed(1).padStart(8) +
        (Math.round(r.langste) + ' ms').padStart(9) +
        r.gpu.toFixed(1).padStart(7) +
        r.tekenen.toFixed(1).padStart(8) +
        r.hoofd.toFixed(1).padStart(8)
    )
  }

  const vol = uitkomst[0]
  const kleinR = uitkomst[1]
  const winst = vol.gpu + vol.tekenen - (kleinR.gpu + kleinR.tekenen)
  console.log(
    `\nhet kleine venster scheelt ${winst.toFixed(1)} procentpunt aan eigen teken- en GPU-tijd.`
  )
  /*
   * Wat hier niet in staat: wat het spel betaalt. Het mengen van een doorzichtig
   * venster over OMSI heen gebeurt in dwm.exe, en dat proces valt hiervandaan
   * niet te meten -- daar is een draaiend OMSI met een beeldenteller voor nodig.
   * Deze proef zegt dus alleen of wij het zelf zwaar maken.
   */
  console.log(
    'let op: dit is alleen ons eigen verbruik. Wat Windows kwijt is aan het over'
  )
  console.log('het spel heen mengen van een doorzichtig venster, meet je alleen in OMSI zelf.')
  app.exit(0)
})
