/**
 * Een oudere exe dan de versie die de gebruikersmap het laatst bijwerkte:
 * kiest de speler "alleen bekijken", schrijft de app dan echt nergens?
 *
 *   npx electron-vite build
 *   npx electron scripts/probe-alleenbekijken.cjs   (PROEF_MAP=<map> voor een eigen werkmap)
 *
 * Een eigen gebruikersmap waarin `laatst-geschreven.json` zegt dat versie
 * 9.9.9 er het laatst schreef, en een nagebouwde OMSI-map. De vraag wordt
 * beantwoord met `OMSI_ENHANCER_PROEFKEUZE=bekijken` (geen venster). Daarna:
 * - de app draait op een kopie, en zegt "alleen bekijken" bij het nummer en
 *   in de titel;
 * - een chauffeur aanmaken en een instelling veranderen lukt, maar komt in de
 *   kopie terecht;
 * - toetsen opslaan in OMSI wordt geweigerd (EROFS), en schrijven vanuit het
 *   hoofdproces naar de OMSI-map ook;
 * - de echte gebruikersmap (behalve wat Chromium zelf bijhoudt) en de OMSI-map
 *   zijn byte voor byte wat ze waren, de notitie van 9.9.9 incluis;
 * - (29-09) de knop voor de Game Bar weigert met "bekijken" en vraagt geen
 *   `reg add`. Daarvoor vervangt de proef `execFileSync` door iets dat alleen
 *   opschrijft: faalt de wacht, dan raakt hij het echte register nog niet.
 *
 * Op de oude code (vóór 28-09) faalt dit: geen vraag, en alles werd in de
 * echte map geschreven. Het deel over de Game Bar faalt op d9eeeda.
 */
const { app, BrowserWindow } = require('electron')
const { createHash } = require('node:crypto')
const fs = require('node:fs')
const { tmpdir } = require('node:os')
const { join, relative, sep } = require('node:path')

const werk = join(process.env.PROEF_MAP || tmpdir(), 'alleenbekijken')
fs.rmSync(werk, { recursive: true, force: true })
const omsi = join(werk, 'OMSI 2')
const data = join(werk, 'userdata')
fs.mkdirSync(join(omsi, 'Inputs'), { recursive: true })
fs.mkdirSync(data, { recursive: true })
fs.writeFileSync(join(omsi, 'Omsi.exe'), '')
fs.writeFileSync(join(omsi, 'options.cfg'), '[max_fps]\r\n60\r\n\r\n')
fs.writeFileSync(
  join(omsi, 'Inputs', 'keyboard.cfg'),
  '\r\n[game]\r\n\r\n[entry]\r\nPause\r\n25\r\n0\r\n\r\n[vehicles]\r\n\r\n[entry]\r\nThrottle\r\n200\r\n1\r\n\r\n'
)
fs.writeFileSync(join(data, 'settings.json'), JSON.stringify({ language: 'nl', omsiPath: omsi, omsiConfirmed: true }))
const nieuwer = { versie: '9.9.9', bouw: 'bouw fffffff · 2030-01-01 00:00 · setup', tijd: '2030-01-01T00:00:00.000Z' }
fs.writeFileSync(join(data, 'laatst-geschreven.json'), JSON.stringify({ hoogste: nieuwer, laatst: nieuwer }))
process.env.OMSI_ENHANCER_PROEFKEUZE = 'bekijken'
process.env.OMSI_ENHANCER_PROEFPROCES = 'GeenOmsiProefBekijken'

// Wat Chromium zelf in de gebruikersmap zet; dat is geen gegevens van de app.
const CHROMIUM = /^(Cache|Code Cache|GPUCache|DawnGraphiteCache|DawnWebGPUCache|blob_storage|Network|Shared Dictionary|Session Storage|Local Storage|SharedStorage.*|Local State|Preferences|lockfile)(\/|$)/
function afdruk(map, zonder) {
  const regels = []
  const loop = (hier) => {
    for (const naam of fs.readdirSync(hier).sort()) {
      const vol = join(hier, naam)
      const rel = relative(map, vol).split(sep).join('/')
      if (zonder && zonder.test(rel)) continue
      if (fs.statSync(vol).isDirectory()) {
        regels.push(`${rel}/`)
        loop(vol)
      } else regels.push(`${rel} ${createHash('sha1').update(fs.readFileSync(vol)).digest('hex')}`)
    }
  }
  loop(map)
  return regels.join('\n')
}
const dataVoor = afdruk(data, CHROMIUM)
const omsiVoor = afdruk(omsi)
// De schermafdruk moet naar de werkmap, en daar mag de app straks niet meer schrijven.
// Via `original-fs` van Electron: in alleen-bekijken weigert zelfs `fs.writeFileSync`
// buiten de kopie, want Node opent het bestand daarbinnen met het bewaakte `fs.openSync`.
const echtSchrijven = require('original-fs').writeFileSync

app.setPath('userData', data)
setTimeout(() => {
  console.error('time-out')
  app.exit(1)
}, 90000).unref()
require('../out/main/index.js')

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let fouten = 0
const klopt = (wat, ja) => {
  console.log(`${ja ? 'ok  ' : 'FOUT'} ${wat}`)
  if (!ja) fouten++
}

app.whenReady().then(async () => {
  await wait(3500)
  const [main] = BrowserWindow.getAllWindows()
  const js = (code) => main.webContents.executeJavaScript(code)
  const kopie = app.getPath('userData')
  klopt(`de app draait op een kopie (${kopie})`, kopie.toLowerCase() !== data.toLowerCase() && fs.existsSync(join(kopie, 'settings.json')))

  const versie = await js(`[...document.querySelectorAll('.versie, .welkom-versie, .hub-versie')].map((e) => e.textContent).join(' | ')`)
  // Het scherm staat in de taal van de taalkeuze, de titel in die van settings.json (nl).
  klopt(`bij het nummer: "${versie}"`, /alleen bekijken|view only|nur ansehen|consultation/.test(versie))
  console.log(`     vensters: ${BrowserWindow.getAllWindows().map((w) => JSON.stringify(w.getTitle())).join(', ')}`)
  klopt(`in de titel: "${main.getTitle()}"`, main.getTitle().includes('alleen bekijken'))

  const profiel = await js(`window.career.createProfile('Proef bekijken').then(() => 'gelukt', (f) => 'fout: ' + f.message)`)
  const inKopie = fs.existsSync(join(kopie, 'profiles')) && fs.readdirSync(join(kopie, 'profiles')).some((n) => n.endsWith('.json'))
  klopt(`een chauffeur aanmaken: ${profiel}, en hij staat in de kopie`, profiel === 'gelukt' && inKopie)
  const taal = await js(`window.career.saveSettings({ language: 'de' }).then(() => 'gelukt', (f) => 'fout: ' + f.message)`)
  klopt(`een instelling veranderen: ${taal}, in de kopie`, taal === 'gelukt' && JSON.parse(fs.readFileSync(join(kopie, 'settings.json'), 'utf8')).language === 'de')

  const toetsen = await js(
    `window.career.gameKeys().then((k) => window.career.saveGameKeys(k.bindings.map((b) => ({ ...b, scancode: b.scancode + 1 })))).then(() => 'geschreven', (f) => 'geweigerd: ' + f.message)`
  )
  klopt(`toetsen opslaan in OMSI: ${toetsen.slice(0, 140)}`, toetsen.startsWith('geweigerd') && toetsen.includes('Alleen bekijken'))
  let direct = 'geschreven'
  try {
    fs.writeFileSync(join(omsi, 'Situations.txt'), 'x')
  } catch (fout) {
    direct = `geweigerd (${fout.code})`
  }
  klopt(`schrijven vanuit het hoofdproces naar de OMSI-map: ${direct}`, direct === 'geweigerd (EROFS)')

  // De Game Bar gaat met `reg add` het register in, buiten `fs` om.
  const cp = require('node:child_process')
  const echtExec = cp.execFileSync
  const gevraagd = []
  cp.execFileSync = (bestand, args = [], ...rest) => {
    gevraagd.push(`${bestand} ${args.join(' ')}`)
    if (bestand === 'reg' && args[0] !== 'query') return ''
    // "Steam draait": zo komt ook een falende wacht niet aan Steams bestanden.
    if (bestand === 'tasklist') return 'steam.exe 1234 Console 1 10.000 K'
    return echtExec(bestand, args, ...rest)
  }
  let knop
  try {
    knop = await js(`window.career.zetOverlayKnop('gamebar', true).then((u) => JSON.stringify(u), (f) => 'fout: ' + f.message)`)
  } finally {
    cp.execFileSync = echtExec
  }
  const regAdd = gevraagd.filter((g) => /^reg (add|delete)/.test(g))
  klopt(`de Game Bar-knop weigert (${knop}), zonder reg add (${regAdd.length})`, /"reden":"bekijken"/.test(knop) && regAdd.length === 0)

  echtSchrijven(join(werk, 'alleenbekijken.png'), (await main.capturePage()).toPNG())
  console.log(`afdruk: ${join(werk, 'alleenbekijken.png')}`)

  const dataNa = afdruk(data, CHROMIUM)
  klopt('de echte gebruikersmap is byte voor byte wat hij was', dataNa === dataVoor)
  if (dataNa !== dataVoor) {
    const a = new Set(dataVoor.split('\n'))
    console.log(`     nieuw of anders: ${dataNa.split('\n').filter((r) => !a.has(r)).join(' | ')}`)
  }
  klopt('de notitie zegt nog steeds 9.9.9', JSON.parse(fs.readFileSync(join(data, 'laatst-geschreven.json'), 'utf8')).hoogste.versie === '9.9.9')
  klopt('de OMSI-map is byte voor byte wat hij was', afdruk(omsi) === omsiVoor)

  // `app.exit` slaat het opruimen bij afsluiten over; de kopie mag weg (het logboek staat er nog open).
  try {
    if (kopie.toLowerCase() !== data.toLowerCase()) require('original-fs').rmSync(kopie, { recursive: true, force: true, maxRetries: 3 })
  } catch (fout) {
    console.log(`     (kopie niet helemaal opgeruimd: ${fout.code})`)
  }
  console.log(fouten ? `\n${fouten} fout(en)` : '\nalles klopt')
  app.exit(fouten ? 1 : 0)
})
