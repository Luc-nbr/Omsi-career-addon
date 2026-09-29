/**
 * De meetstand (ronde 0 van de voorvallen) in de echte app, met een nagebootste
 * plugin.
 *
 *   npx electron scripts/probe-meetstand.cjs [uitvoermap voor meting-telefoon.png]
 *
 * Het hoofdproces met een eigen gebruikersmap (meetstand aan) en een eigen map
 * voor live.json (OMSI_ENHANCER_LIVEMAP). Een aangenomen dienst op Grundorf,
 * met de hand begonnen (START zou OMSI starten). De "plugin" is dit script:
 * het leest getallen.txt zoals de DLL dat doet, geeft voor elke gevraagde naam
 * een getal terug (twee als onbekend), en schrijft eens per twee tellen een
 * getallen.json met de hele bus erin. De bus is de MAN NL (Vehicles/MAN_NL_NG);
 * zijn varlists worden alleen gelezen.
 *
 * Nagekeken:
 * - getallen.txt: de 37 systeemgetallen vooraan (B3), dan de vering van de
 *   andere assen en scriptnamen uit de varlists (knielen, stopverzoek,
 *   alarmlicht, ...), en niet meer dan 512;
 * - het meetbestand in `metingen/`: een kop met de 32 deurnamen, en regels met
 *   tijd, klok, halte (index en naam), nextDist, snelheid, alle 32 deurgetallen
 *   en de scriptgetallen; ongeveer vier per seconde (de middelste tussentijd);
 *   deur 1 open staat erin;
 * - een andere bus (met even geen bus ertussen, zoals OMSI laadt): een tweede
 *   bestand in dezelfde meting, en geen los bestand zonder bus;
 * - de afvinklijst op de telefoon (overlay.html in een verborgen venster): acht
 *   stappen, en een klik op "Knielen" komt als vink in het bestand, met een
 *   afdruk van getallen.json die NA de vink geschreven is (daarin geknield);
 * - het ritspoor van de dienst kreeg een regel `deuren` (B3 in het spoor);
 * - "Meting opslaan": één zip met het meetbestand, de afdrukken, meting.json en
 *   het spoor, zonder de naam van de chauffeur, zijn profiel-id, nummer of
 *   pincode, of een pad van deze pc;
 * - meetstand uit: er komen geen regels meer bij;
 * - niets geschreven in OMSI, in Lucs gebruikersmap of in de map van de echte
 *   plugin (proefvangrails.cjs).
 */
const { app, BrowserWindow } = require('electron')
const { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { pathToFileURL } = require('node:url')
const { vangrails, nieuweGebruikersmap, nepLive, begonnenDienst } = require('./proefvangrails.cjs')

/* Met een map erachter komt er een plaatje van de afvinklijst in: meting-telefoon.png. */
const uitvoer = process.argv.slice(2).find((a) => !a.startsWith('-') && !a.endsWith('.cjs'))
if (uitvoer) mkdirSync(uitvoer, { recursive: true })
const CHAUFFEUR = 'Wessel Proefrijder-Q7'
const { map, omsiPath } = nieuweGebruikersmap('omsi-meetstand-', { meetstand: true })
const live = join(mkdtempSync(join(tmpdir(), 'omsi-meetstand-live-')), 'OMSI Career')
mkdirSync(live, { recursive: true })
process.env.OMSI_ENHANCER_LIVEMAP = live
process.env.OMSI_ENHANCER_PROEFPROCES = 'OmsiBestaatNietProef'
app.setPath('userData', map)
const geweigerd = vangrails({ spelmap: omsiPath })

/* openZip uit core/zip.ts, om de zip terug te lezen zoals de app hem leest. */
const kernPad = join(mkdtempSync(join(tmpdir(), 'omsi-meetstand-kern-')), 'kern.cjs')
require('esbuild').buildSync({
  stdin: {
    contents: "export { openZip } from './src/core/zip'; export { VOERTUIG_GETALLEN, DEUR_GETALLEN } from './src/core/live'",
    resolveDir: join(__dirname, '..'),
    loader: 'ts'
  },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron'],
  outfile: kernPad,
  logLevel: 'error'
})
const kern = require(kernPad)

setTimeout(() => {
  console.log('time-out')
  app.exit(1)
}, 300000).unref()
require('../out/main/index.js')

const wacht = (ms) => new Promise((r) => setTimeout(r, ms))
app.on('window-all-closed', () => {})

/* ---- de nagebootste plugin ---- */
let BUS = { naam: 'MAN NL 202 meetbus', model: 'model\\model_NL202.cfg', pad: 'vehicles/MAN_NL_NG', bestand: '' }
const ONBEKEND = new Set(['axle_suspension_2_l', 'axle_suspension_2_r'])
const waarden = { Cabinair_Temp: 21.2, Dirt_Norm: 0.1, Axle_Suspension_0_L: -0.1, Axle_Suspension_0_R: -0.1 }
let klok = 8 * 3600
let snelheid = 30
let mem = {}
let gevraagd = []
const schrijfLive = () => {
  try {
    gevraagd = readFileSync(join(live, 'getallen.txt'), 'utf8').split(/\r?\n/).filter(Boolean)
  } catch {
    gevraagd = []
  }
  const getallen = {}
  const getallenOnbekend = []
  for (const naam of gevraagd.slice(0, 512)) {
    if (ONBEKEND.has(naam.toLowerCase())) getallenOnbekend.push(naam)
    else getallen[naam] = waarden[naam] ?? 0
  }
  /* Zoals de plugin: via een tijdelijk bestand, zodat de app nooit een half bestand leest. */
  writeFileSync(
    join(live, 'live.tmp'),
    JSON.stringify(
      nepLive({
        time: klok,
        velocity: snelheid,
        bus: BUS,
        getallen,
        getallenOnbekend,
        getalAantal: 792,
        getallenAfgekapt: false,
        mem
      })
    )
  )
  renameSync(join(live, 'live.tmp'), join(live, 'live.json'))
}
/* Eens per twee tellen, zoals de plugin: de hele bus, met de gevraagde en een paar andere namen. */
const schrijfAfdruk = () => {
  writeFileSync(
    join(live, 'getallen.tmp'),
    JSON.stringify({ bus: BUS?.naam ?? '', aantal: 792, getallen: { Velocity: snelheid, ...waarden, onbekend_elders: 3 }, afgekapt: false })
  )
  renameSync(join(live, 'getallen.tmp'), join(live, 'getallen.json'))
}
const hartslag = setInterval(() => {
  klok += 0.1
  if (mem.nextDist !== undefined && snelheid > 0) mem = { ...mem, nextDist: Math.max(0, mem.nextDist - snelheid / 36) }
  schrijfLive()
}, 100)
const afdrukklok = setInterval(schrijfAfdruk, 2000)

/** Alle regels van alle meetbestanden in de meetmap(pen). */
function meetregels() {
  const basis = join(map, 'metingen')
  if (!existsSync(basis)) return []
  const uit = []
  for (const m of readdirSync(basis)) {
    const vol = join(basis, m)
    if (!statSync(vol).isDirectory()) continue
    for (const n of readdirSync(vol).filter((x) => x.endsWith('.jsonl'))) {
      for (const r of readFileSync(join(vol, n), 'utf8').split('\n').filter(Boolean)) uit.push({ map: m, bestand: n, ...JSON.parse(r) })
    }
  }
  return uit
}

app.whenReady().then(async () => {
  schrijfLive()
  schrijfAfdruk()
  await wacht(1500)
  const [venster] = BrowserWindow.getAllWindows()
  const js = (code) => venster.webContents.executeJavaScript(code)
  for (let i = 0; i < 80 && !(await js('Boolean(window.career)')); i++) await wacht(250)

  const dienst = await begonnenDienst(venster, map, 'Grundorf', CHAUFFEUR)
  if (!dienst) {
    console.log('geen dienst met een bus op Grundorf; proef overgeslagen')
    app.exit(0)
    return
  }
  const rit = dienst.duty.legs[0]
  /* Een halte die maar één keer in de rit voorkomt, niet de eerste. */
  const halte = rit.stops.findIndex((naam, i) => i > 0 && rit.stops.indexOf(naam) === i && rit.stops.lastIndexOf(naam) === i)
  /* OMSI rijdt de eerste rit uit het menu: dan kent de app de halte bij naam. */
  klok = Math.round(rit.stopTimes?.[halte] ?? rit.departure) * 60 - 20
  mem = {
    schedActive: 1,
    tripName: rit.tripFile,
    tourName: rit.tourNumber,
    lineName: rit.lineFile,
    nextStop: rit.stops[halte],
    nextIndex: halte + 3,
    nextDist: 320,
    delay: 12
  }
  console.log(`dienst: omloop ${dienst.duty.tourNumber}, eerste rit naar ${rit.terminus}, halte ${halte} ${rit.stops[halte]}`)

  /* Rijden, dan stilstaan met deur 1 open. */
  await wacht(3500)
  snelheid = 0
  waarden.PAX_Entry1_Open = 1
  waarden.PAX_Exit1_Open = 1
  await wacht(2500)

  /* De afvinklijst op de telefoon, zoals de overlay hem toont. */
  const telefoon = new BrowserWindow({
    width: 460,
    height: 900,
    show: false,
    webPreferences: { preload: join(__dirname, '..', 'out', 'preload', 'index.js') }
  })
  await telefoon.loadURL(pathToFileURL(join(__dirname, '..', 'out', 'renderer', 'overlay.html')).href)
  await wacht(1200)
  const beeld = await js('window.career.metingStand()')
  const status = (await js('window.career.liveStatus()'))?.status
  telefoon.webContents.send('overlay:frame', {
    connected: true,
    editing: false,
    status,
    telefoon: { aangemeld: true, aanvaard: true, nummerLengte: 6, pinLengte: 4 },
    meting: beeld
  })
  await wacht(900)
  const tjs = (code) => telefoon.webContents.executeJavaScript(code)
  const dockGevonden = await tjs(`(() => {
    const knop = [...document.querySelectorAll('.dock-knop')].find((b) => (b.getAttribute('aria-label') || '') === 'Meting')
    if (knop) knop.click()
    return Boolean(knop)
  })()`)
  await wacht(600)
  const stappen = await tjs(`[...document.querySelectorAll('.meet-stap')].map((b) => b.dataset.stap)`)
  if (uitvoer) {
    const vak = await tjs(`(() => {
      document.documentElement.style.background = '#1b1f24'
      const r = document.querySelector('.app-meting')?.closest('.app-scherm')?.parentElement?.getBoundingClientRect()
      return r ? { x: Math.floor(r.x), y: Math.floor(r.y), width: Math.ceil(r.width), height: Math.ceil(r.height) } : undefined
    })()`)
    telefoon.showInactive()
    await wacht(500)
    writeFileSync(join(uitvoer, 'meting-telefoon.png'), (await telefoon.capturePage(vak)).toPNG())
    telefoon.hide()
    console.log(`plaatje: ${join(uitvoer, 'meting-telefoon.png')}`)
  }
  /* Knielen: de bus zakt, en DAN vinken (zoals de handleiding zegt). */
  waarden.cp_kneeling_sw = 1
  waarden.bremse_kneeling = 1
  waarden.Axle_Suspension_0_R = -0.19
  await wacht(400)
  const geklikt = await tjs(`(() => {
    const knop = document.querySelector('.meet-stap[data-stap="knielen"]')
    if (knop) knop.click()
    return Boolean(knop)
  })()`)
  await wacht(4500)
  waarden.cp_kneeling_sw = 0
  waarden.bremse_kneeling = 0
  waarden.Axle_Suspension_0_R = -0.1

  /* Deuren dicht, verder rijden. */
  waarden.PAX_Entry1_Open = 0
  waarden.PAX_Exit1_Open = 0
  snelheid = 25
  await wacht(2500)

  /* Wat de plugin voor de MAN gevraagd kreeg, voordat een andere bus zijn eigen lijst krijgt. */
  const txt = [...gevraagd]
  /* OMSI laadt een andere bus: even geen bus in live.json, dan de C2. */
  const eerdereBus = BUS
  BUS = undefined
  await wacht(1000)
  BUS = { naam: 'MB C2 meetbus', model: 'model/model_C2.cfg', pad: 'vehicles/MB_C2_EN_BVG', bestand: '' }
  await wacht(2500)
  BUS = eerdereBus

  const voorOpslaan = meetregels()
  const naam = await js('window.career.metingOpslaan()')
  await wacht(300)

  /* Meetstand uit: er komt niets meer bij. */
  await js('window.career.saveSettings({ meetstand: false })')
  await wacht(600)
  const telUit = meetregels().length
  await wacht(1500)
  const naUit = meetregels().length
  clearInterval(hartslag)
  clearInterval(afdrukklok)

  /* ---- nakijken ---- */
  const kop = voorOpslaan.find((r) => r.t === 'kop')
  const metingen = voorOpslaan.filter((r) => r.t === 'm')
  const vink = voorOpslaan.find((r) => r.t === 'vink' && r.stap === 'knielen')
  const eerste = metingen[0]
  /*
   * De tussentijd: de middelste, niet het gemiddelde. Het hoofdproces doet één
   * ding tegelijk, en de eerste keer dat de meetlus de rijstroken van de kaart
   * opbouwt (voor de flitspalen) valt er een gat van een paar tellen; dat is
   * geen meting die trager loopt.
   */
  const tussen = metingen.slice(1).map((r, i) => r.tijd - metingen[i].tijd).sort((a, b) => a - b)
  const middel = tussen.length ? tussen[Math.floor(tussen.length / 2)] : 0
  const grootste = tussen.length ? tussen[tussen.length - 1] : 0
  const deurOpen = metingen.some((r) => r.deuren?.[1] === 1 && r.deuren?.[9] === 1)
  const kniel = metingen.some((r) => r.getallen && r.getallen.cp_kneeling_sw === 1)
  const vol = metingen.find((r) => r.vol)
  const onbekend = voorOpslaan.find((r) => r.t === 'onbekend')
  const metMenu = metingen.find((r) => r.halte?.uitMenu)

  const spoorMap = join(map, 'ritten')
  const spoor = existsSync(spoorMap)
    ? readdirSync(spoorMap).flatMap((n) => readFileSync(join(spoorMap, n), 'utf8').split('\n').filter(Boolean).map((r) => JSON.parse(r)))
    : []
  const deurRegels = spoor.filter((r) => r.t === 'deuren')

  let zipInhoud = []
  let zipTekst = ''
  let afdrukKniel = false
  const zipPad = naam ? join(map, 'metingen', naam) : undefined
  if (zipPad && existsSync(zipPad)) {
    const zip = kern.openZip(zipPad)
    for (const b of zip.bestanden) {
      const inhoud = zip.lees(b).toString('utf8')
      zipInhoud.push(b.naam)
      zipTekst += inhoud
      if (/^dump-1-knielen\.json$/.test(b.naam)) afdrukKniel = JSON.parse(inhoud).getallen.cp_kneeling_sw === 1
    }
    zip.sluit()
  }
  const profiel = JSON.parse(readFileSync(join(map, 'profiles', `${dienst.id}.json`), 'utf8'))
  const geheim = [CHAUFFEUR, profiel.id, profiel.personeelsnummer, profiel.pincode, map, process.env.USERNAME, process.env.USERPROFILE].filter(
    (w) => typeof w === 'string' && w.length >= 3
  )
  const lekt = geheim.filter((w) => zipTekst.toLowerCase().includes(String(w).toLowerCase()) || zipTekst.includes(String(w).replace(/\\/g, '\\\\')))

  const uitkomsten = [
    [`getallen.txt: de 37 systeemgetallen vooraan`, kern.VOERTUIG_GETALLEN.every((n, i) => txt[i] === n)],
    [`getallen.txt: ${txt.length} namen, hooguit 512`, txt.length > 37 && txt.length <= 512],
    [
      'getallen.txt: vering van de andere assen en scriptnamen (knielen, stopverzoek, alarmlicht)',
      ['Axle_Suspension_1_L', 'cp_kneeling_sw', 'haltewunsch', 'lights_sw_warnblinker'].every((n) => txt.includes(n))
    ],
    [`meetbestand: kop met 32 deurnamen (${kop?.bestand ?? 'geen'})`, kop?.deurNamen?.length === 32 && kop.deurNamen[0] === 'PAX_Entry0_Open'],
    [
      'meetbestand: regel met tijd, klok, halte (index, naam), nextDist, snelheid, 32 deuren, getallen',
      Boolean(
        eerste &&
          typeof eerste.tijd === 'number' &&
          typeof eerste.klok === 'number' &&
          eerste.halte && 'index' in eerste.halte && typeof eerste.halte.naam === 'string' &&
          typeof eerste.nextDist === 'number' &&
          typeof eerste.snelheid === 'number' &&
          Array.isArray(eerste.deuren) && eerste.deuren.length === 32 &&
          eerste.getallen && typeof eerste.getallen === 'object'
      )
    ],
    [`meetbestand: halte uit het menu (${metMenu ? `${metMenu.halte.index} ${metMenu.halte.naam}` : 'geen'})`, Boolean(metMenu && metMenu.halte.index === halte && metMenu.halte.naam === rit.stops[halte] && metMenu.halte.omsiIndex === halte + 3)],
    [`meetbestand: ${metingen.length} regels, middelste tussentijd ${middel} ms (verwacht ~250; grootste ${grootste} ms)`, middel >= 240 && middel <= 300],
    ['meetbestand: deur 1 open (PAX_Entry1_Open en PAX_Exit1_Open)', deurOpen],
    [`meetbestand: een volle regel met scriptgetallen (${vol ? Object.keys(vol.getallen).length : 0})`, Boolean(vol && 'haltewunsch' in vol.getallen && 'Axle_Suspension_1_R' in vol.getallen)],
    ['meetbestand: wat de bus niet kent staat erin', Boolean(onbekend && onbekend.namen.includes('Axle_Suspension_2_L'))],
    [`telefoon: knop Meting in het balkje`, dockGevonden],
    [`telefoon: acht stappen (${stappen.join(', ')})`, stappen.length === 8 && stappen[2] === 'knielen'],
    ['telefoon: klik op Knielen komt als vink in het bestand', geklikt && Boolean(vink && vink.aan === true && vink.dump === 'dump-1-knielen.json')],
    ['meetbestand: knielen gemeten (cp_kneeling_sw 1)', kniel],
    [`spoor van de dienst: ${deurRegels.length} regels 'deuren'`, deurRegels.length >= 2 && deurRegels.some((r) => (r.open & 0x202) === 0x202)],
    [`opslaan: ${naam ?? 'niets'}`, Boolean(naam && zipPad && existsSync(zipPad))],
    [
      `zip: ${zipInhoud.join(', ')}`,
      ['meting.json', 'dump-1-begin.json', 'dump-1-knielen.json', 'spoor-dienst-1.jsonl'].every((n) => zipInhoud.includes(n)) &&
        zipInhoud.some((n) => /^meting-1-.+\.jsonl$/.test(n))
    ],
    ['zip: afdruk bij de vink is van NA de vink (geknield)', afdrukKniel],
    [
      `een andere bus: een tweede bestand in dezelfde meting, geen los bestand zonder bus (${[...new Set(voorOpslaan.map((r) => r.bestand))].join(', ')})`,
      new Set(voorOpslaan.map((r) => r.bestand)).size === 2 && zipInhoud.some((n) => /^meting-2-MB_C2_meetbus\.jsonl$/.test(n))
    ],
    [`zip: geen naam, nummer, pincode of pad van deze pc${lekt.length ? ': ' + lekt.join(', ') : ''}`, lekt.length === 0],
    [`meetstand uit: geen regels meer (${telUit} -> ${naUit})`, naUit === telUit],
    [`niets geschreven waar het niet mocht${geweigerd.length ? ': ' + geweigerd.join('; ') : ''}`, geweigerd.length === 0]
  ]
  for (const [wat, goed] of uitkomsten) console.log(`${goed ? 'ok  ' : 'FOUT'} ${wat}`)
  const fout = uitkomsten.filter(([, goed]) => !goed).length
  console.log(fout ? `\n${fout} fout(en)` : '\nalles klopt')
  app.exit(fout ? 1 : 0)
})
