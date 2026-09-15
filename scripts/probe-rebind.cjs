/**
 * Werkt het opnieuw toewijzen van een toets echt, van klik tot bestand?
 *
 *   npx electron scripts/probe-rebind.cjs
 *
 * Dit schrijft in `Inputs\keyboard.cfg` van de echte spelmap, dus er gaat eerst
 * een kopie opzij en die wordt aan het eind teruggezet -- ook als er onderweg
 * iets misgaat. Aan het slot staat of het bestand weer byte voor byte hetzelfde
 * is als aan het begin.
 */
const { app, BrowserWindow } = require('electron')
const { copyFileSync, mkdtempSync, readFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

app.setPath('userData', mkdtempSync(join(tmpdir(), 'omsi-enhancer-rebind-')))
setTimeout(() => {
  console.error('time-out')
  app.exit(1)
}, 180000).unref()
require('../out/main/index.js')

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const js = (window, code) => window.webContents.executeJavaScript(code)

async function waitFor(window, expression, tries = 160) {
  for (let i = 0; i < tries; i++) {
    if (await js(window, `Boolean(${expression})`)) return true
    await wait(250)
  }
  return false
}

const clickText = (window, text) =>
  js(
    window,
    `(() => {
       const button = [...document.querySelectorAll('button')].find((b) => b.textContent.includes(${JSON.stringify(text)}))
       if (button) button.click()
       return Boolean(button)
     })()`
  )

app.whenReady().then(async () => {
  await wait(1200)
  const [main] = BrowserWindow.getAllWindows()

  // Het pad van OMSI kennen we via de app zelf; hier zoeken we het opnieuw op.
  const omsi = await js(main, `window.career.status().then((s) => s.path)`)
  const keyboard = join(omsi, 'Inputs', 'keyboard.cfg')
  const backup = join(mkdtempSync(join(tmpdir(), 'omsi-keys-')), 'keyboard.cfg')
  copyFileSync(keyboard, backup)
  const before = readFileSync(keyboard)
  console.log(`kopie van ${keyboard} -> ${backup} (${before.length} bytes)`)

  let ok = false
  try {
    if (await waitFor(main, `document.querySelector('#welcome-name')`, 60)) {
      await clickText(main, 'Nederlands')
      await wait(400)
      await js(
        main,
        `(() => { const i = document.querySelector('#welcome-name'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'Test'); i.dispatchEvent(new Event('input', { bubbles: true })) })()`
      )
      await wait(300)
      await js(main, `document.querySelector('.welcome .actions .btn')?.click()`)
    }
    await waitFor(main, `document.querySelector('.mode-grid')`)
    await clickText(main, 'Instellingen van OMSI')
    await waitFor(main, `document.querySelector('.settings')`)
    await clickText(main, 'Toetsen')
    await waitFor(main, `document.querySelector('.key-row')`)
    await wait(800)

    // Zoek de regel van "Pause"; die staat op P en is makkelijk te herkennen.
    const found = await js(
      main,
      `(() => {
         const row = [...document.querySelectorAll('.key-row')].find((r) => r.querySelector('.key-name').textContent.trim() === 'Pause')
         if (!row) return null
         row.querySelector('.key-combo').click()
         return row.querySelector('.key-combo').textContent.trim()
       })()`
    )
    console.log(`regel gevonden, knop staat op: ${found}`)

    // En dan Shift+J indrukken, alsof de gebruiker dat doet.
    await wait(400)
    await js(
      main,
      `window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyJ', key: 'J', shiftKey: true, bubbles: true }))`
    )
    await wait(1200)

    const shown = await js(
      main,
      `[...document.querySelectorAll('.key-row')].find((r) => r.querySelector('.key-name').textContent.trim() === 'Pause')?.querySelector('.key-combo').textContent.trim()`
    )
    const text = readFileSync(keyboard, 'latin1')
    const at = text.indexOf('sim_pause')
    const block = text.slice(at, at + 40).split('\r\n').slice(0, 3)
    console.log(`knop toont nu: ${shown}`)
    console.log(`in het bestand: ${JSON.stringify(block)}`)
    // 36 is de scancode van J, 2 is Shift.
    ok = shown === 'Shift + J' && block[1] === '36' && block[2] === '2'
  } finally {
    copyFileSync(backup, keyboard)
    const after = readFileSync(keyboard)
    console.log(
      `\nteruggezet: ${after.equals(before) ? 'bestand is weer als voorheen' : 'LET OP: bestand wijkt af'}`
    )
    console.log(ok ? 'toets opnieuw toewijzen werkt' : 'TOEWIJZEN MISLUKT')
  }
  app.exit(ok ? 0 : 1)
})
