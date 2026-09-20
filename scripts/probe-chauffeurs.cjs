/**
 * Een chauffeur weghalen in het beginscherm.
 *
 *   npx electron scripts/probe-chauffeurs.cjs [uitvoermap]
 *
 * Draait de echte app met een eigen gegevensmap, zodat de profielen van de
 * gebruiker er buiten blijven: twee chauffeurs aanmaken, er een weggooien, en
 * nakijken of de vraag ertussen zit en of het daarna ook echt van de schijf af
 * is. Dat laatste is het punt -- een naam uit een lijstje halen is makkelijk,
 * maar hier hangt een heel logboek aan.
 */
const { app, BrowserWindow } = require('electron')
const { mkdtempSync, existsSync, readdirSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

const args = process.argv.slice(
  process.argv.findIndex((arg) => arg.endsWith('probe-chauffeurs.cjs')) + 1
)
const outputDir = args[0] || __dirname
const userData = mkdtempSync(join(tmpdir(), 'omsi-chauffeurs-'))
app.setPath('userData', userData)

setTimeout(() => {
  console.error('time-out')
  app.exit(1)
}, 120000).unref()
require('../out/main/index.js')

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const js = (window, code) => window.webContents.executeJavaScript(code)

async function waitFor(window, expression, tries = 80) {
  for (let i = 0; i < tries; i++) {
    if (await js(window, `Boolean(${expression})`)) return true
    await wait(250)
  }
  return false
}

/** Een naam invullen in het veld dat er nu staat, en op de knop drukken. */
async function typeName(window, naam, knop) {
  await js(
    window,
    `(() => {
      const i = document.querySelector('input');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(naam)});
      i.dispatchEvent(new Event('input', { bubbles: true }));
    })()`
  )
  await wait(250)
  await js(window, `document.querySelector(${JSON.stringify(knop)})?.click()`)
  await wait(600)
}

app.whenReady().then(async () => {
  await wait(1200)
  const [main] = BrowserWindow.getAllWindows()

  const shoot = async (naam) => {
    const image = await main.capturePage()
    const file = join(outputDir, `chauffeurs-${naam}.png`)
    writeFileSync(file, image.toPNG())
    return file
  }

  // ---- de eerste chauffeur, via het welkomstscherm ----
  if (await waitFor(main, `document.querySelector('#welcome-name')`, 40)) {
    await js(
      main,
      `[...document.querySelectorAll('.lang')].find((b) => b.textContent.includes('Nederlands'))?.click()`
    )
    await wait(300)
    await typeName(main, 'Luc', '.welcome .actions .btn')
  }
  /*
    * Na het aanmaken springt de app door naar het hoofdmenu; het chauffeursscherm
    * is waar hij mee opent. Dus even opnieuw laden om daar terug te komen.
    */
  const opnieuw = async () => {
    main.webContents.reload()
    await wait(1500)
    await waitFor(main, `document.querySelector('.driver-card')`)
  }
  await opnieuw()

  // ---- en een tweede, via de knop in het chauffeursscherm zelf ----
  await js(main, `document.querySelector('.welcome-card > .btn.secondary')?.click()`)
  await wait(400)
  await typeName(main, 'Tweede', '.driver-new .btn')
  await opnieuw()
  await waitFor(main, `document.querySelectorAll('.driver-card').length === 2`)

  const namen = () =>
    js(main, `[...document.querySelectorAll('.driver-pick-name')].map((e) => e.textContent).join(', ')`)
  console.log(`twee chauffeurs: ${await namen()} -> ${await shoot('1-twee')}`)

  // ---- het kruisje van de tweede ----
  await js(main, `[...document.querySelectorAll('.driver-remove')].at(-1)?.click()`)
  await wait(400)
  const vraag = await js(main, `document.querySelector('.driver-pick-ask')?.textContent ?? ''`)
  console.log(
    vraag.includes('Tweede')
      ? `de vraag noemt wie het betreft: "${vraag.slice(0, 60)}..." -> ${await shoot('2-vraag')}`
      : `MISLUKT: geen vraag met de naam erin, wel "${vraag}"`
  )

  // ---- weigeren moet niets doen ----
  await js(main, `document.querySelector('.driver-pick-ask .btn.secondary')?.click()`)
  await wait(400)
  const naWeigeren = await js(main, `document.querySelectorAll('.driver-card').length`)
  console.log(naWeigeren === 2 ? 'behouden laat ze allebei staan' : `MISLUKT: er zijn er nog ${naWeigeren}`)

  // ---- en dan echt weg ----
  await js(main, `[...document.querySelectorAll('.driver-remove')].at(-1)?.click()`)
  await wait(400)
  await js(main, `document.querySelector('.driver-pick-ask .btn.danger')?.click()`)
  await wait(900)
  const over = await js(main, `document.querySelectorAll('.driver-card').length`)
  console.log(
    over === 1 ? `er blijft er een over: ${await namen()}` : `MISLUKT: er staan er nog ${over}`
  )

  const map = join(userData, 'profiles')
  // active.json staat in dezelfde map en is geen chauffeur.
  const bestanden = (existsSync(map) ? readdirSync(map) : []).filter((n) => n !== 'active.json')
  console.log(
    bestanden.length === 1
      ? `en op de schijf ook: ${bestanden.length} profiel`
      : `MISLUKT: op de schijf staan er ${bestanden.length}`
  )
  console.log(await shoot('3-na'))

  app.exit(0)
})
