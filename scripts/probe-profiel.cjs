/**
 * Hoe ziet de staat van dienst eruit met een echt logboek?
 *
 *   npx electron scripts/probe-profiel.cjs <uitvoermap> [bronprofiel.json]
 *
 * Eigen gebruikersmap, met een kopie van een bestaand profiel erin gezet. Zo is
 * te zien wat er op het scherm komt bij werkelijke cijfers in plaats van bij een
 * verse chauffeur die nog niets gereden heeft -- en blijft het profiel van de
 * gebruiker onaangeroerd.
 *
 * Zonder tweede argument wordt het eerste profiel uit `%APPDATA%\\omsi-enhancer`
 * gekopieerd. Er wordt niets teruggeschreven en OMSI blijft dicht.
 */
const { app, BrowserWindow } = require('electron')
const { mkdtempSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, existsSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

const args = process.argv.slice(process.argv.findIndex((a) => a.endsWith('probe-profiel.cjs')) + 1)
const outputDir = args[0]
const bron = args[1]
if (outputDir) mkdirSync(outputDir, { recursive: true })

const userData = mkdtempSync(join(tmpdir(), 'omsi-enhancer-profiel-'))
app.setPath('userData', userData)

/* Een bestaand logboek meenemen, zodat er iets te tonen valt. */
const profielen = join(userData, 'profiles')
mkdirSync(profielen, { recursive: true })
const echteMap = join(process.env.APPDATA, 'omsi-enhancer', 'profiles')
let gekopieerd = ''
if (bron && existsSync(bron)) {
  copyFileSync(bron, join(profielen, 'proef.json'))
  gekopieerd = bron
} else if (existsSync(echteMap)) {
  for (const f of readdirSync(echteMap)) {
    // Alleen profielbestanden; er staan inmiddels ook mappen tussen.
    if (f === 'active.json' || !f.endsWith('.json')) continue
    copyFileSync(join(echteMap, f), join(profielen, 'proef.json'))
    gekopieerd = f
    break
  }
}
console.log(gekopieerd ? `logboek overgenomen uit ${gekopieerd}` : 'geen bestaand logboek gevonden')

setTimeout(() => {
  console.error('time-out')
  app.exit(1)
}, 240000).unref()
require('../out/main/index.js')

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const js = (w, code) => w.webContents.executeJavaScript(code)

async function waitFor(w, expressie, pogingen = 80) {
  for (let i = 0; i < pogingen; i++) {
    if (await js(w, `Boolean(${expressie})`)) return true
    await wait(250)
  }
  return false
}

const klik = (w, kies, tekst) =>
  js(
    w,
    `(() => {
       const knoppen = [...document.querySelectorAll(${JSON.stringify(kies)})]
       const doel = ${JSON.stringify(tekst || '')}
         ? knoppen.find((b) => b.textContent.trim().startsWith(${JSON.stringify(tekst || '')}))
         : knoppen[0]
       if (doel) doel.click()
       return Boolean(doel)
     })()`
  )

app.whenReady().then(async () => {
  await wait(1600)
  const [main] = BrowserWindow.getAllWindows()
  main.setSize(1440, 1000)

  if (await waitFor(main, `document.querySelector('.welkom-knop.primair')`, 40)) {
    await klik(main, '.welkom-talen button[aria-label="Nederlands"]')
    await wait(400)
    await klik(main, '.welkom-knop.primair')
    await wait(1200)
  }

  if (!(await waitFor(main, `document.querySelector('.tweedeknop')`))) {
    console.log('geen nevenknop gevonden; staat de app wel op de chauffeursstap?')
    app.exit(1)
    return
  }

  const knoppen = await js(
    main,
    `[...document.querySelectorAll('.tweedeknop')].map((b) => b.textContent.trim())`
  )
  console.log(`nevenknoppen: ${JSON.stringify(knoppen)}`)

  if (!(await klik(main, '.tweedeknop', 'Staat van dienst'))) {
    console.log('de knop naar het overzicht staat er niet')
    app.exit(1)
    return
  }
  await wait(1400)

  const gevonden = await js(
    main,
    `(() => {
       const el = (k) => document.querySelector(k)
       const alle = (k) => [...document.querySelectorAll(k)]
       return {
         titel: el('.veltitel')?.textContent.trim(),
         naam: el('.profiel-kop h3')?.textContent.trim(),
         sinds: el('.profiel-kop p')?.textContent.trim(),
         rang: el('.profiel-rang b')?.textContent.trim(),
         tegels: alle('.profiel-tegel').map((t) => t.querySelector('b')?.textContent.trim() + ' ' + t.querySelector('span')?.textContent.trim()),
         vakken: alle('.profiel-vak h4').map((h) => h.textContent.trim()),
         stiptheid: alle('.profiel-legenda li').map((l) => l.textContent.trim()),
         noot: el('.profiel-noot')?.textContent.trim(),
         top: alle('.profiel-top li .naam').map((n) => n.textContent.trim()),
         logboek: alle('.profiel-logboek li').length,
         klokbalken: alle('.profiel-klok > span').length,
         knop: el('.startknop')?.textContent.trim()
       }
     })()`
  )

  console.log(`\ntitel: ${gevonden.titel}`)
  console.log(`chauffeur: ${gevonden.naam} — ${gevonden.sinds} — rang ${gevonden.rang}`)
  console.log(`tegels: ${gevonden.tegels.join(' | ')}`)
  console.log(`vakken: ${gevonden.vakken.join(', ')}`)
  console.log(`stiptheid: ${gevonden.stiptheid.join('  ')}`)
  if (gevonden.noot) console.log(`  ${gevonden.noot}`)
  console.log(`top drie: ${gevonden.top.join(' | ')}`)
  console.log(`logboekregels: ${gevonden.logboek}, klokbalken: ${gevonden.klokbalken}`)
  console.log(`hoofdknop: ${gevonden.knop}`)

  if (outputDir) {
    main.showInactive()
    main.moveTop()
    await wait(600)
    writeFileSync(join(outputDir, 'profiel-boven.png'), (await main.capturePage()).toPNG())
    // En het onderste deel, want het vel scrollt.
    await js(main, `document.querySelector('.velinhoud')?.scrollTo(0, 99999)`)
    await wait(700)
    writeFileSync(join(outputDir, 'profiel-onder.png'), (await main.capturePage()).toPNG())
    console.log('plaatjes: profiel-boven.png, profiel-onder.png')
  }

  app.exit(0)
})
