/**
 * Schaalt het venster mee?
 *
 *   npx electron scripts/probe-schaal.cjs [uitvoermap]
 *
 * Drie maten: een smal venster, een gewoon venster en een breed venster. Bij elk
 * de vraag die ertoe doet -- past de inhoud in de breedte, of komt er een
 * schuifbalk onderaan? Een schuifbalk betekent dat er iets vaststaat dat mee
 * had moeten geven.
 *
 * Bij het brede venster geldt het omgekeerde: dan hoort de inhoud de ruimte te
 * gebruiken in plaats van in een smalle kolom te blijven hangen.
 */
const { app, BrowserWindow } = require('electron')
const { mkdtempSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

const args = process.argv.slice(
  process.argv.findIndex((arg) => arg.endsWith('probe-schaal.cjs')) + 1
)
const outputDir = args[0] || __dirname
app.setPath('userData', mkdtempSync(join(tmpdir(), 'omsi-schaal-')))

setTimeout(() => {
  console.error('time-out')
  app.exit(1)
}, 120000).unref()
require('../out/main/index.js')

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const js = (window, code) => window.webContents.executeJavaScript(code)

async function waitFor(window, expression, tries = 60) {
  for (let i = 0; i < tries; i++) {
    if (await js(window, `Boolean(${expression})`)) return true
    await wait(250)
  }
  return false
}

app.whenReady().then(async () => {
  await wait(1200)
  const [main] = BrowserWindow.getAllWindows()

  // Een chauffeur, anders blijft het welkomstscherm staan.
  if (await waitFor(main, `document.querySelector('#welcome-name')`, 40)) {
    await js(
      main,
      `[...document.querySelectorAll('.lang')].find((b) => b.textContent.includes('Nederlands'))?.click()`
    )
    await wait(300)
    await js(
      main,
      `(() => {
        const i = document.querySelector('#welcome-name');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'Luc');
        i.dispatchEvent(new Event('input', { bubbles: true }));
      })()`
    )
    await wait(250)
    await js(main, `document.querySelector('.welcome .actions .btn')?.click()`)
    await wait(800)
  }
  // Door naar het scherm waar het om gaat: de zijbalk met de dienstkaart ernaast.
  await waitFor(main, `document.querySelector('.mode-grid, .modes, button')`)
  await js(
    main,
    `[...document.querySelectorAll('button, [role=button], .card')]
      .find((e) => e.textContent.trim().startsWith('Dienst'))?.click()`
  )
  await waitFor(main, `document.querySelector('.mode-bar')`)

  const maten = [
    { naam: 'smal', w: 760, h: 720 },
    { naam: 'gewoon', w: 1280, h: 860 },
    { naam: 'breed', w: 1920, h: 1080 }
  ]

  for (const maat of maten) {
    main.setContentSize(maat.w, maat.h)
    await wait(900)
    const meet = await js(
      main,
      `(() => {
        const d = document.documentElement;
        const kaart = document.querySelector('.card');
        return {
          scroll: d.scrollWidth,
          zicht: d.clientWidth,
          inhoud: kaart ? Math.round(kaart.getBoundingClientRect().width) : 0,
          zijbalk: Math.round((document.querySelector('.sidebar')?.getBoundingClientRect().width) ?? 0)
        }
      })()`
    )
    const past = meet.scroll <= meet.zicht + 1
    const benut = meet.zicht > 0 ? Math.round((meet.inhoud / meet.zicht) * 100) : 0
    const image = await main.capturePage()
    const file = join(outputDir, `schaal-${maat.naam}.png`)
    writeFileSync(file, image.toPNG())
    console.log(
      `${maat.naam.padEnd(7)} gevraagd ${maat.w}, werd ${meet.zicht}: ` +
        `${past ? 'past' : 'SCHUIFBALK (' + meet.scroll + ' > ' + meet.zicht + ')'}, ` +
        `zijbalk ${meet.zijbalk}, kaart ${meet.inhoud} (${benut}% van de breedte) -> ${file}`
    )
  }

  app.exit(0)
})
