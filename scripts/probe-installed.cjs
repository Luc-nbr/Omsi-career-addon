/**
 * Ziet de app het als er een kaart of een bus bij is gezet?
 *
 *   npx electron scripts/probe-installed.cjs
 *
 * De knop "Controleer geïnstalleerde mappen" leest de OMSI-map opnieuw en
 * vergelijkt met wat de app de vorige keer zag; dat staat in `installed.json`
 * bij de gebruikersgegevens. Deze proef doet alsof er iets bij is gekomen door
 * dat bestand aan te passen -- een kaart en een busmap eruit halen is hetzelfde
 * als ze erbij installeren, gezien vanuit de app. Zo hoeft er niets in de
 * spelmap veranderd te worden: daar wordt alleen uit gelezen.
 *
 * Daarna wordt de knop in het venster ook echt ingedrukt.
 */
const { app, BrowserWindow } = require('electron')
const { mkdtempSync, readFileSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

const work = mkdtempSync(join(tmpdir(), 'omsi-installed-'))
app.setPath('userData', work)
setTimeout(() => {
  console.error('time-out')
  app.exit(1)
}, 180000).unref()
require('../out/main/index.js')

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const js = (window, code) => window.webContents.executeJavaScript(code)

async function waitFor(window, expression, tries = 200) {
  for (let i = 0; i < tries; i++) {
    if (await js(window, `Boolean(${expression})`)) return true
    await wait(250)
  }
  return false
}

const bestand = join(work, 'installed.json')
const lees = () => JSON.parse(readFileSync(bestand, 'utf8'))
const schrijf = (data) => writeFileSync(bestand, JSON.stringify(data, undefined, 2), 'utf8')

app.whenReady().then(async () => {
  await wait(1200)
  const [main] = BrowserWindow.getAllWindows()
  await waitFor(main, `window.career`)

  let ok = true
  const eis = (naam, goed, erbij = '') => {
    if (!goed) ok = false
    console.log(`   ${goed ? 'ja ' : 'NEE'} ${naam.padEnd(46)} ${erbij}`)
  }

  console.log('de eerste keer kijken:')
  const eerst = await js(main, `window.career.checkInstalled()`)
  eis('er komen kaarten terug', eerst.maps.length > 0, `${eerst.maps.length} kaarten`)
  eis('er komen bussen terug', eerst.vehicles.length > 0, `${eerst.vehicles.length} bussen`)
  eis('hij weet dat hij nog nooit gekeken heeft', eerst.first === true)
  eis(
    'en meldt niets als nieuw',
    eerst.addedMaps.length === 0 && eerst.addedBuses.length === 0,
    'want alles "nieuw" noemen is geen nieuws'
  )

  console.log('\nmeteen nog een keer:')
  const nogmaals = await js(main, `window.career.checkInstalled()`)
  eis('nu is er wel eerder gekeken', nogmaals.first === false)
  eis(
    'en er is niets veranderd',
    nogmaals.addedMaps.length === 0 &&
      nogmaals.addedBuses.length === 0 &&
      nogmaals.removedMaps.length === 0 &&
      nogmaals.removedBuses.length === 0
  )

  console.log('\nalsof er een kaart en een busmap bij zijn gezet:')
  const bewaard = lees()
  const kaartWeg = bewaard.maps[0]
  const busWeg = bewaard.buses[0]
  schrijf({ maps: bewaard.maps.slice(1), buses: bewaard.buses.slice(1) })
  const nieuw = await js(main, `window.career.checkInstalled()`)
  const kaartNaam = nieuw.maps.find((item) => item.folder === kaartWeg)?.name ?? kaartWeg
  eis('de kaart wordt gemeld', nieuw.addedMaps.includes(kaartNaam), `"${nieuw.addedMaps.join(', ')}"`)
  eis('de bus wordt gemeld', nieuw.addedBuses.includes(busWeg), `"${nieuw.addedBuses.join(', ')}"`)
  eis('en er is niets verdwenen', nieuw.removedMaps.length === 0 && nieuw.removedBuses.length === 0)
  eis('de kaartenlijst is compleet', nieuw.maps.some((item) => item.folder === kaartWeg))

  console.log('\nalsof er iets weggehaald is:')
  const nu = lees()
  schrijf({ maps: [...nu.maps, 'EenKaartDieNietBestaat'], buses: nu.buses })
  const weg = await js(main, `window.career.checkInstalled()`)
  eis('dat wordt ook gemeld', weg.removedMaps.includes('EenKaartDieNietBestaat'), `"${weg.removedMaps.join(', ')}"`)

  console.log('\nen de knop in het venster:')
  if (await waitFor(main, `document.querySelector('#welcome-name')`, 40)) {
    await js(
      main,
      `[...document.querySelectorAll('.lang')].find((b) => b.textContent.includes('Nederlands'))?.click()`
    )
    await wait(300)
    await js(
      main,
      `(() => { const i = document.querySelector('#welcome-name'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'Test'); i.dispatchEvent(new Event('input', { bubbles: true })) })()`
    )
    await wait(300)
    await js(main, `document.querySelector('.welcome .actions .btn')?.click()`)
  }
  // Van het moduskeuzescherm naar het scherm waar de balk met de knop staat.
  await waitFor(main, `document.querySelector('.modes')`)
  await js(
    main,
    `[...document.querySelectorAll('button')].find((b) => b.textContent.includes('Dienst'))?.click()`
  )
  await waitFor(main, `document.querySelector('.mode-bar')`)

  const knop = `[...document.querySelectorAll('.mode-bar button')].find((b) => b.textContent.includes('Controleer'))`
  eis('de knop staat er', await js(main, `Boolean(${knop})`))
  await js(main, `${knop}?.click()`)
  await waitFor(main, `document.querySelector('.mode-note')`)
  const tekst = await js(main, `document.querySelector('.mode-note')?.textContent ?? ''`)
  console.log(`   de knop zegt: "${tekst}"`)
  eis('hij meldt iets zinnigs', /kaart|bus|Niets nieuws/i.test(tekst))

  console.log(ok ? '\nde app ziet wat erbij komt' : '\nKLOPT NIET')
  app.exit(ok ? 0 : 1)
})
