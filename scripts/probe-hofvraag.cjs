/**
 * Komt de vraag over het wagenpark altijd als de bus de kaart niet kent?
 *
 *   npx electron scripts/probe-hofvraag.cjs [uitvoermap] [kaart]
 *
 * De vraag bleef weg bij precies de bus die hem het hardst nodig heeft: een bus
 * zonder enig wagenpark. De voorwaarde sloeg die over ("geen wagenparken" werd
 * gelezen als "niets aan de hand" in plaats van "helemaal niets").
 *
 * Deze probe loopt de bussen van het busmenu langs, kiest er een, en kijkt of
 * het venstertje komt. Ook of de tegel "Wagenpark toevoegen" op het remisescherm
 * staat, en of de terugknop je een niveau omhoog brengt.
 *
 * Eigen gebruikersmap. Er wordt niet op "toevoegen" gedrukt en niet op START:
 * er gaat niets naar de spelmap en OMSI blijft dicht.
 */
const { app, BrowserWindow } = require('electron')
const { mkdtempSync, writeFileSync, mkdirSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

const args = process.argv.slice(process.argv.findIndex((a) => a.endsWith('probe-hofvraag.cjs')) + 1)
const outputDir = args[0]
const kaartNaam = args[1] || 'Hamburg'
if (outputDir) mkdirSync(outputDir, { recursive: true })

app.setPath('userData', mkdtempSync(join(tmpdir(), 'omsi-enhancer-hofvraag-')))
setTimeout(() => {
  console.error('time-out')
  app.exit(1)
}, 300000).unref()
require('../out/main/index.js')

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const js = (w, code) => w.webContents.executeJavaScript(code)

async function waitFor(w, expressie, pogingen = 120) {
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
  await wait(1500)
  const [main] = BrowserWindow.getAllWindows()
  main.setSize(1440, 960)

  const schiet = async (naam) => {
    if (!outputDir) return
    main.showInactive()
    main.moveTop()
    await wait(400)
    writeFileSync(join(outputDir, `${naam}.png`), (await main.capturePage()).toPNG())
  }

  if (await waitFor(main, `document.querySelector('.welkom-knop.primair')`, 40)) {
    await klik(main, '.welkom-talen button[aria-label="Nederlands"]')
    await wait(400)
    await klik(main, '.welkom-knop.primair')
    await wait(900)
  }
  if (await waitFor(main, `document.querySelector('.invoerveld')`, 40)) {
    await js(
      main,
      `(() => { const i = document.querySelector('.invoerveld')
         Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'Proef')
         i.dispatchEvent(new Event('input', { bubbles: true })) })()`
    )
    await wait(300)
    await klik(main, '.invoerknop')
    await wait(900)
  }

  const nuStap = () =>
    js(main, `document.querySelector('.stap[data-stand="nu"]')?.textContent.trim() ?? ''`)

  for (let i = 0; i < 12; i++) {
    const stap = await nuStap()
    if (stap.includes('Bus')) break
    if (stap.includes('Kaart')) {
      await waitFor(main, `document.querySelectorAll('.dienstrij').length > 0`)
      await js(
        main,
        `[...document.querySelectorAll('.dienstrij')].find((r) => r.textContent.includes(${JSON.stringify(kaartNaam)}))?.click()`
      )
      await wait(600)
    }
    await klik(main, '.startknop')
    await wait(1600)
  }
  await wait(2500)

  console.log(`staat op "${await nuStap()}"`)

  // Het venstertje over de aanbevolen bus eerst wegklikken.
  if (await js(main, `Boolean(document.querySelector('.dialog'))`)) {
    const tekst = await js(main, `document.querySelector('.dialog h2')?.textContent.trim()`)
    console.log(`venstertje bij binnenkomst: "${tekst}"`)
    await klik(main, '.dialog button', 'Zelf kiezen')
    await wait(900)
  }

  const terug = await js(main, `Boolean(document.querySelector('.terugknop'))`)
  console.log(`terugknop aanwezig: ${terug}`)

  /*
   * Elk merk langs tot er een bus komt die de kaart niet kent. Die bestaan
   * zeker: het busmenu meldt zelf hoeveel het er zijn.
   */
  const merken = await js(
    main,
    `[...document.querySelectorAll('.tegel .tegel-titel')].map((t) => t.textContent.trim())`
  )
  console.log(`${merken.length} merken op het eerste niveau`)

  let gevraagd = false
  for (const merk of merken.slice(0, 8)) {
    await js(
      main,
      `[...document.querySelectorAll('.tegel')].find((t) => t.textContent.includes(${JSON.stringify(merk)}))?.click()`
    )
    await wait(700)
    // Twee niveaus dieper tot er een uitvoering staat.
    for (let d = 0; d < 2; d++) {
      const tegels = await js(main, `document.querySelectorAll('.tegel').length`)
      if (tegels === 0) break
      await js(main, `document.querySelectorAll('.tegel')[0]?.click()`)
      await wait(1400)
      if (await js(main, `Boolean(document.querySelector('.dialog'))`)) break
    }

    if (await js(main, `Boolean(document.querySelector('.dialog'))`)) {
      const kop = await js(main, `document.querySelector('.dialog h2')?.textContent.trim()`)
      const body = await js(main, `document.querySelector('.dialog p')?.textContent.trim()`)
      console.log(`\nvenstertje na een buskeuze: "${kop}"`)
      console.log(`  ${body}`)
      await schiet('hof-venstertje')
      gevraagd = true
      await klik(main, '.dialog button', 'Nee')
      await wait(700)
      break
    }

    // Terug naar het merkenniveau voor de volgende poging.
    for (let t = 0; t < 3; t++) {
      if (await js(main, `Boolean(document.querySelector('.terugknop'))`)) {
        await klik(main, '.terugknop')
        await wait(700)
      }
    }
  }
  if (!gevraagd) console.log('\ngeen venstertje gezien bij de bekeken bussen')

  // En het remisescherm: staat de tegel om er een bij te halen?
  const opRemise = await js(
    main,
    `Boolean([...document.querySelectorAll('.tegel .tegel-titel')].find((t) => t.textContent.includes('Wagenpark toevoegen')))`
  )
  console.log(`tegel "Wagenpark toevoegen" zichtbaar: ${opRemise}`)
  await schiet('hof-remise')

  app.exit(0)
})
