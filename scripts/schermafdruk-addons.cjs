/**
 * Het plan van de add-on-manager in beeld: geweigerde bestanden, het blok
 * "Programmacode" met het vinkje, de rommel en de ruimte op de schijf.
 *
 *   npx electron-vite build
 *   npx electron scripts/schermafdruk-addons.cjs    (PROEF_MAP=<map> voor een eigen werkmap)
 *
 * Eigen gebruikersmap en een nagebouwde OMSI-map. De knop "Zip kiezen" krijgt
 * een zip met rare namen, een plugin en een .exe, in plaats van een venster.
 * Er wordt niet op Installeren gedrukt. Maakt `addons-plan.png` en
 * `addons-plan-vinkje.png` in de werkmap. Sinds 29-09 ook twee bestanden voor
 * dezelfde plek, een pad dat te lang is voor OMSI en een snelkoppeling, en
 * "1 bestand" in plaats van "1 bestanden".
 */
const { app, BrowserWindow, ipcMain } = require('electron')
const { mkdirSync, rmSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { deflateRawSync } = require('node:zlib')

const werk = join(process.env.PROEF_MAP || tmpdir(), 'schermafdruk-addons')
rmSync(werk, { recursive: true, force: true })
const omsi = join(werk, 'OMSI 2')
const data = join(werk, 'userdata')
for (const m of ['Vehicles', 'maps', 'plugins', 'Sceneryobjects']) mkdirSync(join(omsi, m), { recursive: true })
mkdirSync(data, { recursive: true })
writeFileSync(join(omsi, 'Omsi.exe'), '')
writeFileSync(join(data, 'settings.json'), JSON.stringify({ language: 'nl', languageChosen: true, omsiPath: omsi, omsiConfirmed: true }))
process.env.OMSI_ENHANCER_PROEFPROCES = 'GeenOmsiProefAddons'

// Een zip met namen precies zoals opgegeven (zie ook scripts/proefhulp.ts).
function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) {
    c ^= b
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  return (c ^ 0xffffffff) >>> 0
}
function maakZip(pad, bestanden) {
  const lokaal = []
  const centraal = []
  let at = 0
  for (const [naamTekst, tekst] of bestanden) {
    const inhoud = Buffer.from(tekst)
    const gepakt = deflateRawSync(inhoud)
    const naam = Buffer.from(naamTekst, 'latin1')
    const kop = Buffer.alloc(30)
    kop.writeUInt32LE(0x04034b50, 0)
    kop.writeUInt16LE(20, 4)
    kop.writeUInt16LE(8, 8)
    kop.writeUInt32LE(crc32(inhoud), 14)
    kop.writeUInt32LE(gepakt.length, 18)
    kop.writeUInt32LE(inhoud.length, 22)
    kop.writeUInt16LE(naam.length, 26)
    const c = Buffer.alloc(46)
    c.writeUInt32LE(0x02014b50, 0)
    c.writeUInt16LE(20, 4)
    c.writeUInt16LE(20, 6)
    c.writeUInt16LE(8, 10)
    c.writeUInt32LE(crc32(inhoud), 16)
    c.writeUInt32LE(gepakt.length, 20)
    c.writeUInt32LE(inhoud.length, 24)
    c.writeUInt16LE(naam.length, 28)
    c.writeUInt32LE(at, 42)
    lokaal.push(kop, naam, gepakt)
    centraal.push(c, naam)
    at += 30 + naam.length + gepakt.length
  }
  const cd = Buffer.concat(centraal)
  const eind = Buffer.alloc(22)
  eind.writeUInt32LE(0x06054b50, 0)
  eind.writeUInt16LE(bestanden.length, 8)
  eind.writeUInt16LE(bestanden.length, 10)
  eind.writeUInt32LE(cd.length, 12)
  eind.writeUInt32LE(at, 16)
  writeFileSync(pad, Buffer.concat([...lokaal, cd, eind]))
}
const zip = join(werk, 'Stadtbus mit Plugin.zip')
maakZip(zip, [
  ['Stadtbus/Stadtbus.bus', '[friendlyname]\nStadtbus\n'],
  ['Stadtbus/model/model.cfg', '[mesh]\nbody.o3d\n'],
  ['Stadtbus/setup.exe', 'MZ'],
  ['Stadtbus/Thumbs.db', 'x'],
  ['__MACOSX/Stadtbus/._Stadtbus.bus', 'x'],
  ['Deko/bank.sco', '[mesh]\nbank.o3d\n'],
  ['Wetter/Nebel.owt', 'owt'],
  ['Winter/Nebel.owt', 'ander weer, zelfde naam'],
  ['Stadtbus/snelkoppeling.url', '[InternetShortcut]\nURL=https://example.org/\n'],
  [`Stadtbus/${Array.from({ length: 9 }, (_, i) => `map${i}_${'x'.repeat(20)}`).join('/')}/lak.bmp`, 'bmp'],
  ['BusPlugin/BusPlugin.dll', 'MZ'],
  ['BusPlugin/BusPlugin.opl', '[dll]\nBusPlugin.dll\n'],
  ['Vehicles/../../BUITEN.txt', 'x'],
  ['C:/Windows/win.ini', 'x'],
  ['Stadtbus/CON', 'x'],
  ['Liesmich.txt', 'lies mich']
])

app.setPath('userData', data)
setTimeout(() => {
  console.error('time-out')
  app.exit(1)
}, 90000).unref()
require('../out/main/index.js')

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
app.whenReady().then(async () => {
  await wait(2500)
  const [main] = BrowserWindow.getAllWindows()
  main.setContentSize(1280, 900)
  main.webContents.on('console-message', (_e, niveau, bericht) => {
    if (niveau >= 2) console.log(`[scherm] ${bericht}`)
  })
  const js = (code) =>
    Promise.race([main.webContents.executeJavaScript(code), wait(8000).then(() => `(geen antwoord op ${code.slice(0, 60)})`)])
  await js(`window.career.createProfile('Proef')`)
  main.reload()
  await wait(3000)
  ipcMain.removeHandler('addon:kies')
  ipcMain.handle('addon:kies', () => zip)
  // Wie rijdt er: de enige chauffeur, en verder naar het hoofdmenu.
  await js(`[...document.querySelectorAll('button')].find((b) => /^verder/i.test(b.textContent.trim()))?.click()`)
  await wait(1500)
  console.log(`hoofdmenu: ${String(await js(`document.body.innerText.slice(0, 160)`)).replace(/\s+/g, ' ')}`)
  await js(`[...document.querySelectorAll('button')].find((b) => b.textContent.includes('Add-ons'))?.click()`)
  await wait(1200)
  console.log(`na Add-ons: ${String(await js(`document.body.innerText.slice(0, 200)`)).replace(/\s+/g, ' ')}`)
  await js(`[...document.querySelectorAll('button')].find((b) => b.textContent.includes('Zip kiezen'))?.click()`)
  await wait(2500)
  const tekst = await js(`document.querySelector('.bd-hoofd')?.innerText ?? document.body.innerText`)
  writeFileSync(join(werk, 'addons-plan.png'), (await main.capturePage()).toPNG())
  writeFileSync(join(werk, 'addons-plan.txt'), tekst)
  const knopUit = await js(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Installeren')?.disabled`)
  await js(`document.querySelector('.ad-vinkje input')?.click()`)
  await wait(500)
  await js(`document.querySelector('.ad-vinkje')?.scrollIntoView({ block: 'center' })`)
  await wait(300)
  writeFileSync(join(werk, 'addons-plan-vinkje.png'), (await main.capturePage()).toPNG())

  // innerText volgt text-transform: koppen staan er in hoofdletters.
  const moet = [
    'bestanden geweigerd',
    'programmacode',
    'ik vertrouw de maker',
    'nooit neergezet',
    'snelkoppelingen',
    'rommelbestanden overgeslagen',
    '1 bestand op dezelfde plek',
    '1 bestand met een pad dat te lang is voor omsi',
    '1 bestand',
    'nodig'
  ]
  const mist = moet.filter((m) => !tekst.toLowerCase().includes(m))
  if (/(^|\s)1 bestanden\b/.test(tekst)) mist.push('(er staat nog "1 bestanden")')
  if (!/(^|\s)1 bestand(\s|$)/m.test(tekst)) mist.push('(nergens "1 bestand")')
  console.log(tekst.split('\n').filter(Boolean).slice(0, 40).join('\n'))
  console.log(`\nInstalleren uit: ${knopUit}`)
  console.log(mist.length ? `MIST: ${mist.join(', ')}` : 'alles staat in beeld')
  console.log(`afdrukken: ${join(werk, 'addons-plan.png')}, addons-plan-vinkje.png`)
  app.exit(mist.length ? 1 : 0)
})
