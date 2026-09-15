/**
 * Licht de knop op die je indrukt, en springt de lijst ernaartoe?
 *
 *   npx electron scripts/probe-padjump.cjs
 *
 * Er hangt hier geen stuur aan, dus we doen er een voor: `navigator.getGamepads`
 * geeft een verzonnen apparaat terug met één ingedrukte knop. De app kan het
 * verschil niet zien -- dat is precies wat we willen weten.
 *
 * Er wordt niets geschreven: alleen gekeken.
 */
const { app, BrowserWindow } = require('electron')
const { mkdtempSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

app.setPath('userData', mkdtempSync(join(tmpdir(), 'omsi-enhancer-pad-')))
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

/** Een verzonnen stuur met 24 knoppen; welke er ingedrukt is stel je in. */
const fakePad = (name, down) => `
  (() => {
    window.__down = ${down === null ? 'null' : down}
    if (!window.__faked) {
      window.__faked = true
      navigator.getGamepads = () => [{
        id: ${JSON.stringify(name)},
        index: 0,
        connected: true,
        mapping: '',
        timestamp: performance.now(),
        axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 24 }, (_, i) => ({
          pressed: i === window.__down,
          touched: false,
          value: i === window.__down ? 1 : 0
        }))
      }]
    }
    return true
  })()
`

app.whenReady().then(async () => {
  await wait(1200)
  const [main] = BrowserWindow.getAllWindows()
  main.setSize(1360, 900)

  let ok = false
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

  // Het verzonnen stuur heet naar een apparaat dat in het bestand van OMSI staat.
  await js(main, fakePad('MOZA R5 Base (Vendor: 346e Product: 0004)', null))
  await clickText(main, 'Controllers')
  await waitFor(main, `document.querySelector('.key-row')`)
  await wait(900)

  const rows = await js(main, `document.querySelectorAll('.key-row').length`)
  console.log(`knoppen in beeld: ${rows}`)

  // Knop 19 indrukken; die staat ver genoeg naar onderen om te moeten scrollen.
  await js(main, `window.__down = 18`)
  await wait(900)

  const lit = await js(
    main,
    `[...document.querySelectorAll('.key-row.pressed')].map((r) => r.querySelector('.key-name').textContent.trim()).join(', ')`
  )
  const inView = await js(
    main,
    `(() => {
       const row = document.querySelector('.key-row.pressed')
       if (!row) return null
       const box = row.getBoundingClientRect()
       return box.top >= 0 && box.bottom <= window.innerHeight
     })()`
  )
  // Een plaatje van het moment zelf, om te laten zien wat je ziet.
  if (process.env.SHOT_DIR) {
    main.showInactive()
    main.moveTop()
    await wait(250)
    const file = join(process.env.SHOT_DIR, 'pad-ingedrukt.png')
    writeFileSync(file, (await main.capturePage()).toPNG())
    console.log(`geschreven: ${file}`)
  }
  console.log(`opgelicht: ${lit || '(niets)'}`)
  console.log(`in beeld gescrold: ${inView}`)

  await js(main, `window.__down = null`)
  await wait(600)
  const afterRelease = await js(main, `document.querySelectorAll('.key-row.pressed').length`)
  console.log(`na loslaten nog opgelicht: ${afterRelease}`)

  ok = lit.includes('19') && inView === true && afterRelease === 0
  console.log(ok ? 'oplichten en meespringen werkt' : 'WERKT NIET')
  app.exit(ok ? 0 : 1)
})
