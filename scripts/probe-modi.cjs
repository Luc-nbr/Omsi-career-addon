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
}, 900000).unref()
// Een eigen map voor live.json: zo schrijft de app in deze proef nooit in de map van de echte plugin, ook niet als OMSI draait (tegenlezing 30-09).
process.env.OMSI_ENHANCER_LIVEMAP ??= require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'omsi-proef-live-'))
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

  /*
   * Een verse gebruikersmap, in de volgorde van de app: eerst de taal, dan een
   * chauffeur, dan de vraag waar OMSI staat, het klaarzetten van de kaarten en
   * de vraag over de busplaatjes (overgeslagen). Zo doet screenshotModes.cjs
   * het ook.
   */
  if (await waitFor(main, `document.querySelector('.taaltegel')`, 60)) {
    await js(main, `[...document.querySelectorAll('.taaltegel')].find((b) => b.textContent.includes('Nederlands'))?.click()`)
    await wait(600)
  }
  if (await waitFor(main, `document.querySelector('.startnaam .invoerveld')`, 60)) {
    await js(
      main,
      `(() => { const i = document.querySelector('.startnaam .invoerveld')
         Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'Proef')
         i.dispatchEvent(new Event('input', { bubbles: true })) })()`
    )
    await wait(400)
    await js(main, `document.querySelector('.welkom-knop.primair')?.click()`)
    await wait(1200)
  }
  if (await waitFor(main, `document.querySelector('.welkom-pad, .welkom-hint')`, 60)) {
    await js(main, `document.querySelector('.welkom-knop.primair')?.click()`)
  }
  if (await waitFor(main, `document.querySelector('.klaarbalk')`, 120)) {
    await waitFor(main, `!document.querySelector('.klaarbalk')`, 1200)
  }
  if (await waitFor(main, `document.querySelector('.fotoaantal')`, 40)) {
    await js(main, `document.querySelector('.welkom-knoppen .welkom-knop:not(.primair)')?.click()`)
    await wait(800)
  }
  await waitFor(main, `document.querySelector('.setup')`, 80)
  await wait(1200)
  /* Het personeelsnummer van de nieuwe chauffeur: gezien. */
  if (await waitFor(main, `document.querySelector('.dialog .btn:not(.ghost)')`, 12)) {
    await js(main, `document.querySelector('.dialog .btn:not(.ghost)')?.click()`)
    await wait(700)
  }

  /** Via het hoofdmenu naar een modus: de tegel met die modus. */
  const kiesModus = async (modus) => {
    await js(main, `document.querySelector('.balk-knop[aria-label]')?.click()`)
    await waitFor(main, `document.querySelector('.hub-tegel')`, 40)
    await js(main, `document.querySelector(".hub-tegel[data-modus='${modus}']")?.click()`)
    await wait(1200)
    // De lijst, niet de tegels: dan staan de kaarten als regels.
    await js(main, `document.querySelectorAll('.weergavekeuze button')[0]?.click()`)
    await wait(400)
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

  /*
   * Vrij rijden is sinds 0.4.8 alleen kaart en bus: de app kiest zelf waar de
   * bus staat, en de voet van de kaartstap zegt waar. Geen lijn, geen
   * beginpunt, geen dienst.
   */
  console.log('\n== VRIJ RIJDEN ==')
  await kiesModus('free')
  await meld('kaartstap')
  await waitFor(main, `document.querySelectorAll('.dienstrij').length > 0`)
  await js(
    main,
    `[...document.querySelectorAll('.dienstrij')].find((r) => r.textContent.includes(${JSON.stringify(mapNaam)}))?.click()`
  )
  const metPlek = await waitFor(main, `/staat klaar bij|onvolledig|geen plek/.test(document.querySelector('.velvoet')?.textContent ?? '')`, 160)
  const kaartstap = await meld('kaartstap met plek')
  await schiet('vrij-kaart')
  await klik(main, '.vrij-wanneer > summary', '')
  await wait(500)
  await schiet('vrij-kaart-tijd-en-weer')
  await klik(main, '.vrij-wanneer > summary', '')
  await klik(main, '.startknop', '')
  await wait(1500)
  const busstap = await meld('busstap')
  await schiet('vrij-bus')
  const balk = busstap.balk.join(' ').toUpperCase()
  const goed =
    metPlek && /staat klaar bij/.test(kaartstap.voet ?? '') && /bus/i.test(busstap.nu ?? '') && !/LIJN|BEGINPUNT|DIENST/.test(balk)
  console.log(`vrij rijden: ${goed ? 'kaart en bus, de plek in de voet' : 'KLOPT NIET'} (balk: ${balk})`)

  /*
   * Vrij rijden gaat voor: het examen in de carriere hieronder neemt een dienst
   * aan, en met een aangenomen dienst gaat de app daarmee verder in plaats van
   * vrij te rijden.
   */

  console.log('\n== CARRIERE ==')
  await kiesModus('career')
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

  console.log('\nklaar')
  app.exit(goed ? 0 : 1)
})
