/**
 * Lopen carriere en vrij rijden door de nieuwe wereld?
 *
 *   npx electron scripts/probe-modi.cjs <uitvoermap> [kaart]
 *
 * Loopt beide modi stap voor stap af en maakt van elke stap een plaatje. Eigen
 * gebruikersmap, dus de app van de gebruiker blijft staan; er wordt nergens op
 * "start" gedrukt, dus er gaat niets naar de spelmap en OMSI blijft dicht.
 */
const { app, BrowserWindow } = require('electron')
const { mkdtempSync, writeFileSync, mkdirSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

const args = process.argv.slice(process.argv.findIndex((a) => a.endsWith('probe-modi.cjs')) + 1)
const outputDir = args[0]
const mapNaam = args[1] || 'Grundorf'
if (outputDir) mkdirSync(outputDir, { recursive: true })

app.setPath('userData', mkdtempSync(join(tmpdir(), 'omsi-enhancer-modi-')))
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

/** Klik op de knop waarvan de tekst hiermee begint. */
const klik = (w, kies, tekst) =>
  js(
    w,
    `(() => {
       const knoppen = [...document.querySelectorAll(${JSON.stringify(kies)})]
       const doel = ${JSON.stringify(tekst)}
         ? knoppen.find((b) => b.textContent.trim().startsWith(${JSON.stringify(tekst)}))
         : knoppen[0]
       if (doel) doel.click()
       return Boolean(doel)
     })()`
  )

/** Welke stap er nu aan staat, en wat er in de balk staat. */
const stand = (w) =>
  js(
    w,
    `(() => {
       const balk = [...document.querySelectorAll('.stap')].map((s) => s.textContent.trim())
       const nu = document.querySelector('.stap[data-stand="nu"]')?.textContent.trim()
       return {
         balk,
         nu,
         titel: document.querySelector('.veltitel')?.textContent.trim(),
         voet: document.querySelector('.velvoet')?.textContent.trim(),
         knop: document.querySelector('.startknop')?.textContent.trim(),
         tweede: document.querySelector('.tweedeknop')?.textContent.trim(),
         rijen: document.querySelectorAll('.dienstrij').length,
         tegels: document.querySelectorAll('.tegel').length,
         vrij: Boolean(document.querySelector('.vrijerit'))
       }
     })()`
  )

app.whenReady().then(async () => {
  await wait(1500)
  const [main] = BrowserWindow.getAllWindows()
  main.setSize(1440, 960)

  let teller = 0
  const schiet = async (naam) => {
    if (!outputDir) return
    main.showInactive()
    main.moveTop()
    await wait(450)
    const bestand = `${String(++teller).padStart(2, '0')}-${naam}.png`
    writeFileSync(join(outputDir, bestand), (await main.capturePage()).toPNG())
    console.log(`  plaatje: ${bestand}`)
  }

  const meld = async (naam) => {
    const s = await stand(main)
    console.log(
      `  ${naam}: stap="${s.nu}" titel="${s.titel}" rijen=${s.rijen} tegels=${s.tegels}` +
        ` vrij=${s.vrij} knop="${s.knop}"${s.tweede ? ` tweede="${s.tweede}"` : ''}`
    )
    if (s.voet) console.log(`     voet: ${s.voet}`)
    return s
  }

  // Het welkomstscherm: de gevonden map bevestigen.
  if (await waitFor(main, `document.querySelector('.welkom-knop.primair')`, 40)) {
    await klik(main, '.welkom-talen button[aria-label="Nederlands"]', '')
    await wait(400)
    await klik(main, '.welkom-knop.primair', '')
    await wait(900)
  }

  // Chauffeur aanmaken.
  if (await waitFor(main, `document.querySelector('.invoerveld')`, 40)) {
    await js(
      main,
      `(() => { const i = document.querySelector('.invoerveld')
         Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'Proef')
         i.dispatchEvent(new Event('input', { bubbles: true })) })()`
    )
    await wait(300)
    await klik(main, '.invoerknop', '')
    await wait(900)
  }
  await waitFor(main, `document.querySelector('.startknop')`)
  await klik(main, '.startknop', '')
  await wait(700)

  /** Naar de modusstap en daar een modus aanwijzen. */
  const kiesModus = async (naam) => {
    await klik(main, '.stapknop', 'Modus')
    await wait(600)
    await js(
      main,
      `[...document.querySelectorAll('.dienstrij')].find((r) => r.textContent.includes(${JSON.stringify(naam)}))?.click()`
    )
    await wait(400)
    await klik(main, '.startknop', '')
    await wait(900)
  }

  const kiesKaart = async () => {
    await waitFor(main, `document.querySelectorAll('.dienstrij').length > 0`)
    await js(
      main,
      `[...document.querySelectorAll('.dienstrij')].find((r) => r.textContent.includes(${JSON.stringify(mapNaam)}))?.click()`
    )
    await wait(500)
    await klik(main, '.startknop', '')
    await wait(2500)
  }

  console.log('\n== CARRIERE ==')
  await kiesModus('Carrière')
  await meld('kaartstap')
  await schiet('carriere-kaart')
  await kiesKaart()
  await meld('vergunningstap')
  await schiet('carriere-vergunning')

  /*
   * Het examen werkelijk afleggen. Dat legt de rit vast in het profiel van dit
   * proefexemplaar en zet je op de busstap; OMSI wordt niet gestart, daar is de
   * knop START voor en die raken we niet aan.
   */
  await klik(main, '.startknop', '')
  await wait(2500)
  await meld('na het examen aannemen')
  await schiet('carriere-na-examen')

  // En dan terug naar de vergunningstap: nu staat er een vergunning.
  await klik(main, '.stapknop', 'Vergunning')
  await wait(1800)
  await meld('vergunningstap met een vergunning')
  await schiet('carriere-vergunninglijst')

  console.log('\n== VRIJ RIJDEN ==')
  await kiesModus('Vrij')
  await meld('kaartstap')
  await kiesKaart()
  await meld('lijnstap')
  await schiet('vrij-lijn')
  await klik(main, '.startknop', '')
  await wait(1500)
  await meld('ritstap')
  await schiet('vrij-rit')
  await klik(main, '.startknop', '')
  await wait(1500)
  await meld('busstap')
  await schiet('vrij-bus')

  console.log('\nklaar')
  app.exit(0)
})
