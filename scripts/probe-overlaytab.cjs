/**
 * Wat staat er op het tabblad Overlays, en klopt het met de machine?
 *
 *   npx electron scripts/probe-overlaytab.cjs [uitvoermap]
 *
 * Eigen gebruikersmap. ER WORDT NIET OP DE SCHAKELAAR GEDRUKT: die schrijft in
 * Steams instellingen en in het register, en dat hoort niet in een probe te
 * gebeuren. Dit leest alleen wat het scherm toont.
 *
 * Wat er hoort te staan zolang Steam draait: bij Steam geen knop maar de regel
 * dat je Steam eerst moet sluiten, en bij de Game Bar wél een knop.
 */
const { app, BrowserWindow } = require('electron')
const { mkdtempSync, writeFileSync, mkdirSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

const args = process.argv.slice(process.argv.findIndex((a) => a.endsWith('probe-overlaytab.cjs')) + 1)
const outputDir = args[0]
if (outputDir) mkdirSync(outputDir, { recursive: true })

app.setPath('userData', mkdtempSync(join(tmpdir(), 'omsi-overlaytab-')))
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
         ? knoppen.find((b) => b.textContent.trim().includes(${JSON.stringify(tekst || '')}))
         : knoppen[0]
       if (doel) doel.click()
       return Boolean(doel)
     })()`
  )

app.whenReady().then(async () => {
  await wait(1600)
  const [main] = BrowserWindow.getAllWindows()
  main.setSize(1440, 1000)

  /*
   * De eerste start is sinds 0.3.1 een wizard: eerst de taal in vier tegels,
   * dan je naam, dan waar OMSI staat. Elke stap wordt afgehandeld als hij er is.
   */
  if (await waitFor(main, `document.querySelector('.taaltegel')`, 40)) {
    await klik(main, '.taaltegel', 'Nederlands')
    await wait(1200)
  }
  if (await waitFor(main, `document.querySelector('.invoerveld')`, 40)) {
    await js(
      main,
      `(() => { const i = document.querySelector('.invoerveld')
         Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'Proef')
         i.dispatchEvent(new Event('input', { bubbles: true })) })()`
    )
    await wait(400)
    await klik(main, '.welkom-knop.primair, .invoerknop')
    await wait(1600)
  }
  // En de vraag waar OMSI staat.
  if (await waitFor(main, `document.querySelector('.welkom-knop.primair')`, 20)) {
    await klik(main, '.welkom-knop.primair')
    await wait(2500)
  }

  /*
   * Na het aanwijzen van de map leest de app alle kaarten eenmalig in. Dat mag
   * hier overgeslagen worden: we komen voor het tabblad Overlays.
   */
  for (let stap = 0; stap < 4; stap++) {
    const heeft = await js(
      main,
      `[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Overslaan'))`
    )
    if (!heeft) break
    await klik(main, 'button', 'Overslaan')
    await wait(2200)
  }

  /*
   * Naar de instellingen van OMSI. De weg erheen verschilt per scherm, dus we
   * zoeken op de tekst van de knop in plaats van op een vaste plek.
   */
  /*
   * De knop naar de OMSI-instellingen hangt aan de modusstap. Eerst daarheen --
   * de stappenbalk is de navigatie -- en dan de nevenknop.
   */
  const zoekInstellingen = () =>
    js(
      main,
      `[...document.querySelectorAll('button')].some((b) => /instelling/i.test(b.textContent))`
    )
  for (let stap = 0; stap < 3; stap++) {
    if (await zoekInstellingen()) break
    // Verder, tot de modusstap waar de knop naar de OMSI-instellingen hangt.
    await klik(main, '.startknop')
    await wait(1600)
  }
  await klik(main, 'button', 'nstelling')
  await wait(1800)

  if (!(await waitFor(main, `[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Overlays')`, 40))) {
    console.log('het tabblad Overlays is niet bereikt')
    const knoppen = await js(main, `[...document.querySelectorAll('button')].map((b) => b.textContent.trim()).slice(0, 25)`)
    console.log('knoppen op dit scherm: ' + JSON.stringify(knoppen))
    app.exit(1)
    return
  }
  await klik(main, 'button', 'Overlays')
  // Het kijken naar het proces kost anderhalve seconde.
  await wait(4000)

  const beeld = await js(
    main,
    `(() => {
       const kaarten = [...document.querySelectorAll('.card')].map((k) => ({
         titel: k.querySelector('.section-title')?.textContent.trim(),
         regels: [...k.querySelectorAll('p')].map((p) => p.textContent.trim()),
         knoppen: [...k.querySelectorAll('button')].map((b) => b.textContent.trim())
       }))
       return { kaarten }
     })()`
  )

  for (const k of beeld.kaarten) {
    console.log(`\n--- ${k.titel} ---`)
    for (const r of k.regels) console.log(`   ${r}`)
    if (k.knoppen.length) console.log(`   [knoppen] ${k.knoppen.join(' | ')}`)
  }

  if (outputDir) {
    main.showInactive()
    main.moveTop()
    await wait(600)
    writeFileSync(join(outputDir, 'overlaytab.png'), (await main.capturePage()).toPNG())
    console.log('\nplaatje: overlaytab.png')
  }

  app.exit(0)
})
