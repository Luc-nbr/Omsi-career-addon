/**
 * Telt de app een kaartverkoop ook als niemand meekijkt? (B6 uit
 * design/ontwerpen/voorvallen-en-controleurs.md)
 *
 *   npx electron scripts/probe-verkoopzonderoverlay.cjs [pad/naar/main/index.js]
 *
 * WAAROM
 * `telVerkoop` telde alleen in `pushFrame`, en dat beeld wordt pas gemaakt als
 * de overlay openstaat of een telefoon of tablet meekijkt. Wie met de overlay
 * dicht reed, verkocht voor de app nul kaartjes -- in het logboek, in het loon
 * en straks in de uitdaging "Foutloze kassa" (U9) en de zwartrijders (§4.2).
 *
 * HOE
 * Het echte hoofdproces, met een eigen gebruikersmap en een eigen map voor
 * live.json (OMSI_ENHANCER_LIVEMAP). Een aangenomen dienst op Grundorf, begonnen
 * met de hand (START zou OMSI starten). Dan twee verkopen aan de deur in de
 * nep-live.json -- de tweede met te weinig wisselgeld -- terwijl de overlay
 * dicht blijft en er geen toestel meekijkt. `checkSession` (dezelfde weg als
 * "Dienst afronden") moet er twee zien, en het spoor één wisselgeldfout.
 *
 * Met een ander pad naar main/index.js draait dezelfde proef op een oudere
 * bouw; op de code van vóór B6 zegt hij "0 verkocht" en faalt hij.
 *
 * Er wordt niets in OMSI, in Lucs gebruikersmap of in de map van de echte
 * plugin geschreven: zie proefvangrails.cjs.
 */
const { app, BrowserWindow } = require('electron')
const { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const { vangrails, nieuweGebruikersmap, nepLive, begonnenDienst } = require('./proefvangrails.cjs')

const mainPad = resolve(
  process.argv.slice(2).find((a) => a.endsWith('index.js')) ?? join(__dirname, '..', 'out', 'main', 'index.js')
)
const { map, omsiPath } = nieuweGebruikersmap('omsi-verkoop-')
const live = join(mkdtempSync(join(tmpdir(), 'omsi-verkoop-live-')), 'OMSI Career')
mkdirSync(live, { recursive: true })
process.env.OMSI_ENHANCER_LIVEMAP = live
process.env.OMSI_ENHANCER_PROEFPROCES = 'OmsiBestaatNietProef'
app.setPath('userData', map)
const geweigerd = vangrails({ spelmap: omsiPath })

setTimeout(() => {
  console.log('time-out')
  app.exit(1)
}, 240000).unref()
require(mainPad)

const wacht = (ms) => new Promise((r) => setTimeout(r, ms))
app.on('window-all-closed', () => {})

let klok = 8 * 3600
let mem = {}
const schrijf = () => writeFileSync(join(live, 'live.json'), JSON.stringify(nepLive({ time: klok, mem })))
/* Zoals de plugin: tien keer per seconde. De klok loopt mee. */
const hartslag = setInterval(() => {
  klok += 0.1
  schrijf()
}, 100)

app.whenReady().then(async () => {
  schrijf()
  await wacht(1500)
  const [venster] = BrowserWindow.getAllWindows()
  const js = (code) => venster.webContents.executeJavaScript(code)
  for (let i = 0; i < 80 && !(await js('Boolean(window.career)')); i++) await wacht(250)

  const dienst = await begonnenDienst(venster, map, 'Grundorf')
  if (!dienst) {
    console.log('geen dienst met een bus op Grundorf; proef overgeslagen')
    app.exit(0)
    return
  }
  console.log(`dienst: omloop ${dienst.duty.tourNumber}, ${dienst.duty.legs.length} ritten`)
  /* De nulmeting en het spoor krijgen een paar tellen. */
  await wacht(2500)

  const verkoop = async (koper, slecht) => {
    mem = { koper, ticketSoort: 0, ticketIndex: 0, ticketPrijs: 2.7, ticketGegeven: 0, ticketSlecht: 0 }
    await wacht(1500)
    mem = { ...mem, ticketGegeven: 5, ticketSlecht: slecht ? 1 : 0 }
    await wacht(1500)
    mem = { koper: -1 }
    await wacht(2000)
  }
  await verkoop(4, false)
  await verkoop(7, true)

  const open = await js('window.career.overlayIsOpen()')
  const sessie = await js('window.career.checkSession()')
  clearInterval(hartslag)
  const spoorMap = join(map, 'ritten')
  const spoor = existsSync(spoorMap)
    ? readdirSync(spoorMap)
        .filter((n) => n.endsWith('.jsonl'))
        .flatMap((n) => readFileSync(join(spoorMap, n), 'utf8').split('\n').filter(Boolean).map((r) => JSON.parse(r)))
    : []
  const wisselgeld = spoor.filter((r) => r.t === 'wisselgeld').reduce((s, r) => s + r.n, 0)

  const uitkomsten = [
    ['overlay dicht, geen toestel', open === false],
    [`verkocht volgens de sessie: ${sessie?.tickets} (verwacht 2)`, sessie?.tickets === 2],
    [`wisselgeldfouten in het spoor: ${wisselgeld} (verwacht 1)`, wisselgeld === 1],
    [`niets geschreven waar het niet mocht${geweigerd.length ? ': ' + geweigerd.join('; ') : ''}`, geweigerd.length === 0]
  ]
  for (const [wat, goed] of uitkomsten) console.log(`${goed ? 'ok  ' : 'FOUT'} ${wat}`)
  const fout = uitkomsten.filter(([, goed]) => !goed).length
  console.log(fout ? `\n${fout} fout(en)` : '\nalles klopt')
  app.exit(fout ? 1 : 0)
})
