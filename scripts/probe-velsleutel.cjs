/**
 * Komt het vel alleen op bij een stapwissel, en niet bij een keuze binnen een stap?
 *
 *   npx electron scripts/probe-velsleutel.cjs
 *
 * Het vel draagt een sleutel per stap, zodat de openingsbeweging bij elke stap
 * opnieuw loopt. Dat mag niet doorschieten: wie in de dienstenlijst de ene
 * dienst na de andere aanwijst, hoort de lijst waar zijn muis in staat niet
 * onder zijn handen opnieuw te zien opkomen.
 *
 * Deze probe wijst drie diensten achter elkaar aan en kijkt telkens of `vel-op`
 * loopt. Eigen gebruikersmap; OMSI blijft dicht.
 */
const { app, BrowserWindow } = require('electron')
const { mkdtempSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

app.setPath('userData', mkdtempSync(join(tmpdir(), 'omsi-enhancer-sleutel-')))
setTimeout(() => {
  console.error('time-out')
  app.exit(1)
}, 240000).unref()
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

const klik = (w, kies) => js(w, `document.querySelector(${JSON.stringify(kies)})?.click()`)

/** Namen van de animaties die op dit moment lopen. */
const lopend = (w) =>
  js(w, `[...document.getAnimations()].map((a) => a.animationName || 'overgang').sort()`)

app.whenReady().then(async () => {
  await wait(1500)
  const [main] = BrowserWindow.getAllWindows()
  main.setSize(1440, 960)

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

  // Doorklikken tot de dienstenlijst, met de kaart onderweg aangewezen.
  for (let i = 0; i < 10; i++) {
    const stap = await nuStap()
    if (stap.includes('Dienst')) break
    if (stap.includes('Kaart')) {
      await waitFor(main, `document.querySelectorAll('.dienstrij').length > 0`)
      await js(
        main,
        `[...document.querySelectorAll('.dienstrij')].find((r) => r.textContent.includes('Grundorf'))?.click()`
      )
      await wait(500)
    }
    await klik(main, '.startknop')
    await wait(1500)
  }

  await wait(3000)
  const aantal = await js(main, `document.querySelectorAll('.dienstrij').length`)
  console.log(`staat op "${await nuStap()}", ${aantal} diensten in de lijst\n`)
  if (aantal < 2) {
    console.log('te weinig diensten om iets te bewijzen')
    app.exit(1)
    return
  }

  // Eerst een stapwissel, als ijkpunt: daar HOORT het vel op te komen.
  await klik(main, '.stapknop')
  await wait(40)
  console.log(`terug naar een eerdere stap:  ${JSON.stringify(await lopend(main))}`)
  await wait(2500)

  for (let i = 0; i < 10; i++) {
    if ((await nuStap()).includes('Dienst')) break
    await klik(main, '.startknop')
    await wait(1500)
  }
  await wait(2500)

  // En dan drie keer een andere dienst aanwijzen binnen dezelfde stap.
  for (const rij of [1, 2, 0]) {
    await js(main, `document.querySelectorAll('.dienstrij')[${rij}]?.click()`)
    await wait(40)
    const namen = await lopend(main)
    const velOp = namen.includes('vel-op')
    console.log(
      `dienst ${rij} aangewezen:        ${JSON.stringify(namen)}  ${velOp ? '<< vel-op, dat hoort niet' : 'goed'}`
    )
    await wait(1600)
  }

  app.exit(0)
})
