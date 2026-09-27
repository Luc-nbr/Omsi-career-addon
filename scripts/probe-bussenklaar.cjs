/**
 * "Bussen klaarmaken" in de app, van het hoofdmenu tot keyboard.cfg.
 *
 *   npx electron scripts/probe-bussenklaar.cjs [uitvoermap]
 *
 * De gebruiker: "de gebruiker moet via de app zelf de bus kunnen toevoegen zodat
 * de app de benodigdheden zelf bouwt voor de bus". Wat hier nagelopen wordt, in
 * de echte app en met echte klikken:
 * - op het hoofdmenu staat "Bussen klaarmaken", en daarachter de bussen als
 *   tegels;
 * - de HH20 aantikken: de app leest hem uit (in de werker), en de ALMEX staat er
 *   als touchscreen, aangevinkt; de geldlade en de displays niet;
 * - "Klaarmaken" met OMSI dicht: de ALMEX staat daarna in de instellingen onder
 *   dezelfde sleutel die de plugin tijdens het rijden doorgeeft
 *   ("vehicles/hh20_ebus2021"), zijn knoppen staan in keyboard.cfg, en de app
 *   zegt dat het klaar is;
 * - terug naar de lijst: de HH20 staat er als klaar;
 * - nog een keer klaarmaken schrijft niets bij: alles stond er al.
 *
 * NIETS IN DE SPELMAP. Net als scripts/probe-knoppenstraks.cjs: een nagemaakte
 * OMSI-map met een eigen kopie van Inputs, en junctions naar Vehicles, Fonts en
 * Texture die alleen gelezen worden (zonder maps: dan zou de app eerst alle
 * kaarten inlezen, en de openstaande dienst op Grundorf mag gerust mislukken) en aan het eind met rmdir zonder /s worden
 * losgehaald. Deze map wordt nooit recursief verwijderd.
 */
const { app, BrowserWindow, ipcMain } = require('electron')
const { execFileSync } = require('node:child_process')
const { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmdirSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

const uitvoer = process.argv.slice(2).find((a) => !a.startsWith('-') && !a.endsWith('.cjs'))
if (uitvoer) mkdirSync(uitvoer, { recursive: true })

/* ---- de gebruikersmap: een kopie ---- */
const map = mkdtempSync(join(tmpdir(), 'omsi-bussenklaar-'))
const bron = join(process.env.APPDATA, 'omsi-enhancer')
cpSync(join(bron, 'settings.json'), join(map, 'settings.json'))
cpSync(join(bron, 'profiles'), join(map, 'profiles'), { recursive: true })
const inst = JSON.parse(readFileSync(join(map, 'settings.json'), 'utf8'))

/* ---- de nagemaakte OMSI-map ---- */
const echt = [inst.omsiPath, 'C:/Program Files (x86)/Steam/steamapps/common/OMSI 2'].find(
  (pad) => pad && existsSync(join(pad, 'Omsi.exe'))
)
if (!echt) {
  console.log('geen OMSI gevonden om uit te lezen; proef overgeslagen')
  process.exit(0)
}
const nep = mkdtempSync(join(tmpdir(), 'omsi-nep-'))
writeFileSync(join(nep, 'Omsi.exe'), '')
cpSync(join(echt, 'Inputs'), join(nep, 'Inputs'), { recursive: true })
const junctions = ['Vehicles', 'Fonts', 'Texture'].map((naam) => join(nep, naam))
for (const doel of junctions) {
  execFileSync('cmd.exe', ['/c', 'mklink', '/J', doel, join(echt, doel.split(/[\\/]/).pop())], { stdio: 'ignore' })
}
function haalJunctionsLos() {
  for (const doel of junctions) {
    try {
      rmdirSync(doel) // NIET recursief: alleen de verwijzing gaat weg
    } catch {
      // Al weg.
    }
  }
}
const keyboard = join(nep, 'Inputs', 'keyboard.cfg')
const almexIn = () => (readFileSync(keyboard, 'utf8').match(/almex/gi) ?? []).length
/*
 * In de KOPIE de knoppen van de ALMEX en de geldlade weghalen, anders stonden
 * ze er al (de speler heeft de HH20 al gereden) en valt er niets bij te
 * schrijven. Een [entry] is "[entry]", de actie, de scancode en de modifiers.
 */
{
  const tekst = readFileSync(keyboard, 'latin1')
  const nl = tekst.includes('\r\n') ? '\r\n' : '\n'
  const blokken = tekst.split(`${nl}[entry]${nl}`)
  const over = blokken.filter((blok, i) => i === 0 || !/^(almex_|cashdesk_)/i.test(blok))
  writeFileSync(keyboard, over.join(`${nl}[entry]${nl}`), 'latin1')
  console.log(`kopie van keyboard.cfg zonder ALMEX: ${blokken.length - over.length} knoppen weggehaald`)
}

inst.tourSeen = true
inst.omsiPath = nep
inst.omsiConfirmed = true
delete inst.busmodules
delete inst.busknoppenStraks
writeFileSync(join(map, 'settings.json'), JSON.stringify(inst, null, 2))
const instellingen = () => JSON.parse(readFileSync(join(map, 'settings.json'), 'utf8'))

process.env.OMSI_ENHANCER_LIVEMAP = join(mkdtempSync(join(tmpdir(), 'omsi-bussenklaar-live-')), 'OMSI Career')
mkdirSync(process.env.OMSI_ENHANCER_LIVEMAP, { recursive: true })
process.env.OMSI_ENHANCER_PROEFPROCES = 'GeenOmsiProef'
app.setPath('userData', map)

function stop(code) {
  haalJunctionsLos()
  app.exit(code)
}
setTimeout(() => {
  console.log('time-out')
  stop(1)
}, 240000).unref()
require('../out/main/index.js')
const wacht = (ms) => new Promise((r) => setTimeout(r, ms))
const js = (w, code) => w.webContents.executeJavaScript(code)
app.on('window-all-closed', () => {})

app.whenReady().then(async () => {
  ipcMain.removeHandler('plugin:status')
  ipcMain.handle('plugin:status', () => ({ installed: true, upToDate: true, changed: false, target: '' }))
  await wacht(3500)
  const hoofd = BrowserWindow.getAllWindows()[0]
  const meldingen = []
  hoofd.webContents.on('console-message', (_e, niveau, tekst) => {
    if (niveau >= 2) meldingen.push(tekst)
  })
  /*
   * Wachten tot het hoofdmenu er staat, en een venstertje dat daarna opengaat
   * (dienstpas, een dienst die nog openstaat) wegklikken.
   */
  /*
   * Zonder openstaande dienst begint de app bij de chauffeurs; dan eerst Verder.
   * Met een dienst begint hij in het hoofdmenu, met de vraag of je verder wilt.
   */
  for (let i = 0; i < 40; i++) {
    await wacht(250)
    if (await js(hoofd, `document.querySelectorAll('.hub-knop').length > 0`)) break
    if (await js(hoofd, `/Wie rijdt er vandaag|Who is driving/.test(document.body.innerText)`)) {
      await js(hoofd, `document.querySelector('.startknop')?.click()`)
      await wacht(800)
    }
  }
  await wacht(1500)
  await js(hoofd, `document.querySelector('.dialog .btn.ghost, .dialog .btn')?.click()`)
  await wacht(500)

  /* ---- 1. Het hoofdmenu ---- */
  const knop = await js(hoofd, `(() => {
    const k = [...document.querySelectorAll('.hub-knop')].find((b) => /Bussen klaarmaken|Prepare buses|Busse vorbereiten|Préparer les bus/.test(b.textContent))
    k?.click()
    return Boolean(k)
  })()`)
  console.log('knop op het hoofdmenu:', knop)
  let tegels = []
  for (let i = 0; i < 40 && tegels.length === 0; i++) {
    await wacht(250)
    tegels = await js(hoofd, `[...document.querySelectorAll('.tegel')].map((t) => t.textContent.trim().slice(0, 50))`)
  }
  console.log(`bussen in de lijst: ${tegels.length}; bijvoorbeeld ${tegels.slice(0, 3).join(' | ')}`)
  /* De foto's: in een verse gebruikersmap worden ze eerst getekend. */
  let fotos = 0
  for (let i = 0; i < 160 && fotos < 8; i++) {
    await wacht(250)
    fotos = await js(hoofd, `document.querySelectorAll('.tegel img').length`)
  }
  console.log(`tegels met een foto: ${fotos}`)
  if (uitvoer) {
    hoofd.showInactive()
    await wacht(1200)
    writeFileSync(join(uitvoer, 'bussen-lijst.png'), (await hoofd.webContents.capturePage()).toPNG())
  }

  /* ---- 2. De HH20 aantikken en wachten op het uitlezen ---- */
  await js(hoofd, `[...document.querySelectorAll('.tegel')].find((t) => /HHA 2021|HH20|Elektro-Gelenkbus/.test(t.textContent))?.click()`)
  const begin = Date.now()
  let apparaten = []
  for (let i = 0; i < 240 && apparaten.length === 0; i++) {
    await wacht(250)
    apparaten = await js(hoofd, `[...document.querySelectorAll('.tegel')].map((t) => ({
      tekst: t.textContent.trim(),
      aan: t.getAttribute('aria-pressed') === 'true' || t.classList.contains('gekozen') || t.dataset.gekozen === 'ja'
    })).filter((t) => /ALMEX|ZAHLTISCH|LCD/.test(t.tekst))`)
  }
  console.log(`uitgelezen in ${((Date.now() - begin) / 1000).toFixed(1)} s:`)
  for (const x of apparaten) console.log(`    ${x.aan ? '[x]' : '[ ]'} ${x.tekst.slice(0, 70)}`)
  const almex = apparaten.find((x) => /ALMEX/.test(x.tekst))
  if (uitvoer) {
    writeFileSync(join(uitvoer, 'bussen-hh20.png'), (await hoofd.webContents.capturePage()).toPNG())
  }

  /* ---- 3. Klaarmaken ---- */
  const voor = almexIn()
  await js(hoofd, `document.querySelector('.startknop')?.click()`)
  let voet = ''
  for (let i = 0; i < 120; i++) {
    await wacht(250)
    voet = await js(hoofd, `document.querySelector('.velvoet')?.textContent?.trim() ?? ''`)
    if (/Klaar|Ready|Fertig|Prêt/.test(voet)) break
  }
  const bewaard = instellingen().busmodules ?? {}
  console.log(`na klaarmaken: "${voet.slice(0, 120)}"`)
  console.log(`  instellingen: ${JSON.stringify(bewaard)}`)
  console.log(`  almex in keyboard.cfg: ${voor} -> ${almexIn()}`)
  if (uitvoer) {
    writeFileSync(join(uitvoer, 'bussen-klaar.png'), (await hoofd.webContents.capturePage()).toPNG())
  }

  /* ---- 4. Nog een keer: alles stond er al ---- */
  await js(hoofd, `document.querySelector('.startknop')?.click()`)
  let voet2 = ''
  for (let i = 0; i < 120; i++) {
    await wacht(250)
    voet2 = await js(hoofd, `document.querySelector('.velvoet')?.textContent?.trim() ?? ''`)
    if (voet2 !== voet && /Klaar|Ready|Fertig|Prêt/.test(voet2)) break
    if (voet2 === voet && i > 12) break
  }
  console.log(`nog een keer: "${voet2.slice(0, 100)}"`)

  /* ---- 5. Terug naar de lijst: de HH20 staat er als klaar ---- */
  await js(hoofd, `document.querySelector('.kruimel button')?.click()`)
  await wacht(1500)
  const inLijst = await js(hoofd, `[...document.querySelectorAll('.tegel')].map((t) => t.textContent.trim()).find((t) => /HHA 2021|Elektro-Gelenkbus/.test(t)) ?? ''`)
  console.log(`in de lijst: "${inLijst.slice(0, 80)}"`)

  const fouten = meldingen.filter((m) => !/Electron Security Warning|willReadFrequently/.test(m))
  console.log('meldingen:', fouten.length ? fouten.map((m) => m.slice(0, 140)) : 'geen')

  const goed =
    knop &&
    tegels.length > 10 &&
    almex?.aan === true &&
    /touchscreen/i.test(almex?.tekst ?? '') &&
    !apparaten.find((x) => /ZAHLTISCH/.test(x.tekst))?.aan &&
    JSON.stringify(bewaard['vehicles/hh20_ebus2021']) === JSON.stringify(['/almex']) &&
    almexIn() > voor &&
    /Klaar|Ready|Fertig|Prêt/.test(voet) &&
    /al een toets|already had|schon eingerichtet|déjà/.test(voet2) &&
    /Klaar|Ready|Bereit|Prêt/.test(inLijst) &&
    fouten.length === 0
  console.log(goed ? 'een bus klaarmaken werkt vanuit de app' : 'BUSSEN KLAARMAKEN WERKT NIET')
  stop(goed ? 0 : 1)
})
