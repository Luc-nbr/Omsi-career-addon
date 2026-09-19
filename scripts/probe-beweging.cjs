/**
 * Loopt de beweging werkelijk, en houdt ze zich in?
 *
 *   npx electron scripts/probe-beweging.cjs [uitvoermap]
 *
 * Een plaatje bewijst niets over beweging. Dit vraagt de pagina zelf welke
 * animaties er op dat moment lopen -- `document.getAnimations()` -- en hoe lang
 * ze duren. Zo is na te gaan of het vel bij elke stap opnieuw opkomt, of de
 * regels na elkaar binnenkomen en of de route zichzelf tekent; en ook of er
 * niets blijft draaien dat hoort te stoppen.
 *
 * Eigen gebruikersmap, en er wordt nergens op "start" gedrukt: OMSI blijft dicht.
 */
const { app, BrowserWindow } = require('electron')
const { mkdtempSync, writeFileSync, mkdirSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

const args = process.argv.slice(process.argv.findIndex((a) => a.endsWith('probe-beweging.cjs')) + 1)
const outputDir = args[0]
if (outputDir) mkdirSync(outputDir, { recursive: true })

app.setPath('userData', mkdtempSync(join(tmpdir(), 'omsi-enhancer-beweeg-')))
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
       const doel = ${JSON.stringify(tekst)}
         ? knoppen.find((b) => b.textContent.trim().startsWith(${JSON.stringify(tekst)}))
         : knoppen[0]
       if (doel) doel.click()
       return Boolean(doel)
     })()`
  )

/** Welke animaties er nu lopen, samengevat per naam. */
const animaties = (w) =>
  js(
    w,
    `(() => {
       const per = new Map()
       for (const a of document.getAnimations()) {
         const naam = a.animationName || (a.effect && a.effect.target && a.effect.target.className) || '?'
         const duur = a.effect ? Math.round(a.effect.getTiming().duration) : 0
         const vorig = per.get(naam) || { aantal: 0, duur, laatsteEind: 0 }
         vorig.aantal++
         vorig.duur = duur
         const t = a.effect ? a.effect.getComputedTiming() : {}
         const eind = Math.round((t.delay || 0) + (t.activeDuration || 0))
         if (eind > vorig.laatsteEind) vorig.laatsteEind = eind
         per.set(naam, vorig)
       }
       return [...per.entries()].map(([naam, v]) => ({ naam, ...v }))
     })()`
  )

const meld = async (w, wat) => {
  const lijst = await animaties(w)
  if (lijst.length === 0) {
    console.log(`  ${wat}: geen beweging`)
    return lijst
  }
  for (const a of lijst) {
    console.log(
      `  ${wat}: ${a.naam} x${a.aantal}, ${a.duur} ms elk, laatste klaar na ${a.laatsteEind} ms`
    )
  }
  return lijst
}

app.whenReady().then(async () => {
  await wait(1500)
  const [main] = BrowserWindow.getAllWindows()
  main.setSize(1440, 960)

  if (await waitFor(main, `document.querySelector('.welkom-knop.primair')`, 40)) {
    await klik(main, '.welkom-talen button[aria-label="Nederlands"]', '')
    await wait(400)
    await klik(main, '.welkom-knop.primair', '')
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
    await klik(main, '.invoerknop', '')
    await wait(900)
  }
  await waitFor(main, `document.querySelector('.startknop')`)
  /** Op welke stap staan we nu? Sturen op de stand, niet op het aantal klikken. */
  const nuStap = () =>
    js(main, `document.querySelector('.stap[data-stand="nu"]')?.textContent.trim() ?? ''`)

  /** Doorklikken tot de gevraagde stap aan de beurt is; hoogstens tien keer. */
  const gaNaar = async (naam) => {
    for (let i = 0; i < 10; i++) {
      if ((await nuStap()).includes(naam)) return true
      await klik(main, '.startknop', '')
      await wait(1400)
    }
    console.log(`  !! ${naam} niet bereikt, staat op "${await nuStap()}"`)
    return false
  }

  console.log('\n== van stap naar stap ==')
  await klik(main, '.startknop', '')
  await wait(30)
  await meld(main, 'vlak na de wissel')
  await wait(1200)

  await gaNaar('Kaart')
  await waitFor(main, `document.querySelectorAll('.dienstrij').length > 0`)
  await js(
    main,
    `[...document.querySelectorAll('.dienstrij')].find((r) => r.textContent.includes('Grundorf'))?.click()`
  )
  await wait(500)
  await klik(main, '.startknop', '')
  await wait(30)
  await meld(main, 'binnenkomen op de dienstenlijst')

  console.log('\n== een andere dienst aanwijzen: tekent de route zich opnieuw? ==')
  const opDienst = await gaNaar('Dienst')
  await wait(3000)
  const aantal = await js(main, `document.querySelectorAll('.dienstrij').length`)
  console.log(`  ${aantal} diensten in de lijst, staat op "${await nuStap()}"`)
  if (opDienst && aantal > 1) {
    await js(main, `document.querySelectorAll('.dienstrij')[1].click()`)
    await wait(70)
    await meld(main, 'vlak na de klik')
    await wait(500)
    await meld(main, 'een halve tel later (de wegen zijn binnen)')
    if (outputDir) {
      main.showInactive()
      main.moveTop()
      for (const na of [0, 220, 460]) {
        if (na > 0) await wait(220)
        writeFileSync(
          join(outputDir, `route-${String(na).padStart(3, '0')}ms.png`),
          (await main.capturePage()).toPNG()
        )
        console.log(`  plaatje: route-${na}ms.png`)
      }
    }
    await wait(1500)
    await meld(main, 'anderhalve seconde later')
  }

  console.log('\nklaar')
  app.exit(0)
})
