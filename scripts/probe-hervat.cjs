/**
 * De vraag bij het openen: een dienst die nog openstond verder rijden of
 * verwijderen, in de echte app.
 *
 *   npx electron scripts/probe-hervat.cjs [uitvoermap]
 *
 * Luc: "dit moet worden, verder rijden of verwijderen". Nagelopen:
 * - de vraag komt, met twee knoppen: Verwijderen (rood) en Verder rijden;
 * - Verwijderen haalt de dienst uit het profiel, zonder tweede vraag, en het
 *   hoofdmenu zegt welke dienst weg is;
 * - bij een tweede start komt de vraag niet meer terug.
 *
 * Op een kopie van de gebruikersmap; het echte profiel wordt niet aangeraakt.
 */
const { app, BrowserWindow, ipcMain } = require('electron')
const { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

const uitvoer = process.argv.slice(2).find((a) => !a.startsWith('-') && !a.endsWith('.cjs'))
if (uitvoer) mkdirSync(uitvoer, { recursive: true })

const map = mkdtempSync(join(tmpdir(), 'omsi-hervat-'))
const bron = join(process.env.APPDATA, 'omsi-enhancer')
cpSync(join(bron, 'settings.json'), join(map, 'settings.json'))
cpSync(join(bron, 'profiles'), join(map, 'profiles'), { recursive: true })
const inst = JSON.parse(readFileSync(join(map, 'settings.json'), 'utf8'))
inst.tourSeen = true
writeFileSync(join(map, 'settings.json'), JSON.stringify(inst, null, 2))

/* Het actieve profiel, en of daar een dienst openstaat. */
const profielen = readdirSync(join(map, 'profiles')).filter((n) => n.endsWith('.json') && n !== 'active.json')
const actief = (() => {
  try {
    const id = JSON.parse(readFileSync(join(map, 'profiles', 'active.json'), 'utf8')).id
    return profielen.find((n) => n === `${id}.json`) ?? profielen[0]
  } catch {
    return profielen[0]
  }
})()
const openDienst = () => JSON.parse(readFileSync(join(map, 'profiles', actief), 'utf8')).career?.activeDuty ??
  JSON.parse(readFileSync(join(map, 'profiles', actief), 'utf8')).activeDuty
if (!openDienst()?.startedAt) {
  console.log('in het profiel staat geen gestarte dienst open; proef overgeslagen')
  process.exit(0)
}

process.env.OMSI_ENHANCER_LIVEMAP = join(mkdtempSync(join(tmpdir(), 'omsi-hervat-live-')), 'OMSI Career')
mkdirSync(process.env.OMSI_ENHANCER_LIVEMAP, { recursive: true })
process.env.OMSI_ENHANCER_PROEFPROCES = 'GeenOmsiProef'
app.setPath('userData', map)
setTimeout(() => {
  console.log('time-out')
  app.exit(1)
}, 150000).unref()
require('../out/main/index.js')
const wacht = (ms) => new Promise((r) => setTimeout(r, ms))
const js = (w, code) => w.webContents.executeJavaScript(code)
app.on('window-all-closed', () => {})

app.whenReady().then(async () => {
  ipcMain.removeHandler('plugin:status')
  ipcMain.handle('plugin:status', () => ({ installed: true, upToDate: true, changed: false, target: '' }))
  await wacht(2500)
  const hoofd = BrowserWindow.getAllWindows()[0]
  const vraag = () => js(hoofd, `(() => {
    const d = document.querySelector('.hub .dialog')
    if (!d) return null
    return {
      titel: d.querySelector('h2')?.textContent ?? '',
      tekst: d.querySelector('p')?.textContent ?? '',
      knoppen: [...d.querySelectorAll('.dialog-actions button')].map((b) => ({
        tekst: b.textContent.trim(),
        rood: b.classList.contains('danger'),
        achtergrond: getComputedStyle(b).backgroundColor
      }))
    }
  })()`)
  /* Een verse gebruikersmap leest eerst de kaarten in; dat mag je overslaan. */
  const overslaan = () => js(hoofd, `[...document.querySelectorAll('button')].find((b) => /Overslaan|Skip|Überspringen|Passer/.test(b.textContent))?.click()`)
  let eerst = null
  for (let i = 0; i < 60 && !eerst; i++) {
    await wacht(250)
    await overslaan()
    eerst = await vraag()
  }
  console.log('de vraag:', JSON.stringify(eerst))
  if (uitvoer) {
    hoofd.showInactive()
    await wacht(1000)
    writeFileSync(join(uitvoer, 'hervat-vraag.png'), (await hoofd.webContents.capturePage()).toPNG())
  }

  /* Geen tweede vraag erachter: window.confirm zou de proef laten hangen, dus tellen we hem. */
  await js(hoofd, `window.__bevestigd = 0; window.confirm = () => { window.__bevestigd++; return true }; true`)
  await js(hoofd, `document.querySelector('.hub .dialog .btn.danger')?.click()`)
  console.log('verwijderen ingedrukt')
  let weg = false
  for (let i = 0; i < 40 && !weg; i++) {
    await wacht(250)
    weg = !openDienst()
  }
  await wacht(800)
  const na = await js(hoofd, `({
    vraag: Boolean(document.querySelector('.hub .dialog')),
    bevestigd: window.__bevestigd,
    melding: document.querySelector('.hub')?.innerText.match(/[^\\n]*(verwijderd|deleted|gelöscht|supprimé)[^\\n]*/i)?.[0] ?? '',
    scherm: document.querySelector('.hub') ? 'hub' : 'anders'
  })`)
  console.log('na verwijderen:', JSON.stringify({ dienstWeg: weg, ...na }))
  if (uitvoer) writeFileSync(join(uitvoer, 'hervat-na.png'), (await hoofd.webContents.capturePage()).toPNG())

  /* Een tweede start: de pagina opnieuw laden, zoals de app bij het openen. */
  hoofd.webContents.reload()
  let opnieuw = null
  for (let i = 0; i < 24 && !opnieuw; i++) {
    await wacht(250)
    await overslaan()
    opnieuw = await vraag()
  }
  console.log('na opnieuw laden:', JSON.stringify(opnieuw))

  const rood = eerst?.knoppen.find((k) => k.rood)
  const goed =
    eerst &&
    eerst.knoppen.length === 2 &&
    /Verwijderen|Delete|Löschen|Supprimer/.test(rood?.tekst ?? '') &&
    /rgb\(198, 47, 37\)/.test(rood?.achtergrond ?? '') &&
    /Verder rijden|Carry on|Weiterfahren|Reprendre/.test(eerst.knoppen[1].tekst) &&
    weg &&
    !na.vraag &&
    na.bevestigd === 0 &&
    na.melding !== '' &&
    na.scherm === 'hub' &&
    !opnieuw
  console.log(goed ? 'verder rijden of verwijderen, en verwijderen werkt' : 'DE VRAAG KLOPT NIET')
  app.exit(goed ? 0 : 1)
})
