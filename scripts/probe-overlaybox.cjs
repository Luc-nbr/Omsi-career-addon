/**
 * Is het overlayvenster niet groter dan wat erin staat, en staat alles nog op
 * dezelfde plek op het scherm?
 *
 *   npx electron scripts/probe-overlaybox.cjs [kaartmap]
 *
 * Het venster ligt doorzichtig over OMSI heen, en elke punt die het beslaat moet
 * Windows bij elk spelbeeld opnieuw over het spel heen mengen -- ook de lege
 * hoeken. Daarom krimpt het naar zijn inhoud. Deze proef kijkt of dat gebeurt,
 * of de elementen daarbij op hun plek op het scherm blijven staan, en of het
 * venster weer schermvullend wordt zodra je gaat slepen (anders kun je nergens
 * heen).
 *
 * Er wordt niets in de spelmap geschreven en OMSI wordt niet gestart.
 */
const { app, BrowserWindow, screen } = require('electron')
const { mkdtempSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

const args = process.argv.slice(
  process.argv.findIndex((arg) => arg.endsWith('probe-overlaybox.cjs')) + 1
)
const mapFolder = args[0] || 'Rheinhausen'

app.setPath('userData', mkdtempSync(join(tmpdir(), 'omsi-vak-')))
setTimeout(() => {
  console.error('time-out')
  app.exit(1)
}, 180000).unref()
require('../out/main/index.js')

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const js = (window, code) => window.webContents.executeJavaScript(code)

async function waitFor(window, expression, tries = 200) {
  for (let i = 0; i < tries; i++) {
    if (await js(window, `Boolean(${expression})`)) return true
    await wait(250)
  }
  return false
}

app.whenReady().then(async () => {
  await wait(1200)
  const [main] = BrowserWindow.getAllWindows()

  // Eerst een chauffeur, anders komt de app niet verder dan het welkomstscherm.
  if (await waitFor(main, `document.querySelector('#welcome-name')`, 40)) {
    await js(
      main,
      `[...document.querySelectorAll('.lang')].find((b) => b.textContent.includes('Nederlands'))?.click()`
    )
    await wait(300)
    await js(
      main,
      `(() => { const i = document.querySelector('#welcome-name'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'Test'); i.dispatchEvent(new Event('input', { bubbles: true })) })()`
    )
    await wait(300)
    await js(main, `document.querySelector('.welcome .actions .btn')?.click()`)
  }
  await waitFor(main, `document.querySelector('select#map option')`)

  const assignments = await js(
    main,
    `window.career.listDuties({ mapFolder: ${JSON.stringify(mapFolder)}, targetMinutes: 90, window: 'heledag' })`
  )
  const duty = assignments[0]?.duty
  if (!duty) {
    console.error('geen dienst')
    app.exit(1)
    return
  }

  await js(main, `window.career.setOverlay(${JSON.stringify(duty)}, true)`)
  await wait(3000)

  const overlay = BrowserWindow.getAllWindows().find((w) => w !== main && !w.isDestroyed())
  if (!overlay) {
    console.error('geen overlayvenster')
    app.exit(1)
    return
  }
  await wait(2500)

  // Het hele scherm, niet het werkgebied: de overlay ligt over een spel heen
  // en trekt zich van de taakbalk niets aan.
  const area = screen.getPrimaryDisplay().bounds
  const vol = area.width * area.height

  let ok = true
  const eis = (naam, goed, erbij = '') => {
    if (!goed) ok = false
    console.log(`   ${goed ? 'ja ' : 'NEE'} ${naam.padEnd(44)} ${erbij}`)
  }

  const krap = overlay.getBounds()
  const deel = (krap.width * krap.height) / vol
  console.log(`scherm ${area.width}x${area.height}, venster ${krap.width}x${krap.height} op ${krap.x},${krap.y}\n`)
  console.log('zonder slepen:')
  eis('het venster is kleiner dan het scherm', krap.width < area.width && krap.height < area.height)
  eis(
    'het beslaat nog maar een deel van het beeld',
    deel < 0.5,
    `${(deel * 100).toFixed(0)}% van het scherm`
  )

  /*
   * En het belangrijkste: staat het element nog waar de chauffeur het heeft
   * neergezet? De indeling zegt waar het hoort; het venster plus de plek in de
   * pagina zegt waar het staat.
   */
  const layout = await js(main, `window.career.overlayLayout()`)
  const plek = await js(
    overlay,
    `(() => { const el = document.querySelector('.panel-dienst'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } })()`
  )
  if (!plek) {
    console.error('geen dienstpaneel in de overlay')
    app.exit(1)
    return
  }
  const opScherm = { x: krap.x + plek.x, y: krap.y + plek.y }
  const hoort = { x: area.x + layout.dienst.x, y: area.y + layout.dienst.y }
  eis(
    'het dienstpaneel staat op zijn eigen plek',
    Math.abs(opScherm.x - hoort.x) <= 2 && Math.abs(opScherm.y - hoort.y) <= 2,
    `staat op ${Math.round(opScherm.x)},${Math.round(opScherm.y)}, hoort op ${hoort.x},${hoort.y}`
  )
  eis(
    'het past helemaal in het venster',
    plek.x >= 0 && plek.y >= 0 && plek.x + plek.w <= krap.width + 1 && plek.y + plek.h <= krap.height + 1
  )

  console.log('\nin de sleepstand:')
  await js(main, `window.career.editOverlay(true)`)
  await wait(1200)
  const groot = overlay.getBounds()
  eis(
    'het venster beslaat het hele scherm',
    groot.width === area.width && groot.height === area.height,
    `${groot.width}x${groot.height}`
  )
  const plekGroot = await js(
    overlay,
    `(() => { const r = document.querySelector('.panel-dienst').getBoundingClientRect(); return { x: r.x, y: r.y } })()`
  )
  eis(
    'het paneel staat er nog steeds waar het hoort',
    Math.abs(groot.x + plekGroot.x - hoort.x) <= 2 && Math.abs(groot.y + plekGroot.y - hoort.y) <= 2,
    `staat op ${Math.round(groot.x + plekGroot.x)},${Math.round(groot.y + plekGroot.y)}`
  )

  console.log('\nen weer terug:')
  await js(main, `window.career.editOverlay(false)`)
  await wait(1500)
  const terug = overlay.getBounds()
  eis(
    'het venster krimpt weer naar zijn inhoud',
    terug.width < area.width && terug.height < area.height,
    `${terug.width}x${terug.height}`
  )

  /*
   * En de verversing zelf. Die staat bij de taal in hetzelfde bestand, en beide
   * worden los opgeslagen: de taal wisselen mag de verversing niet terugzetten
   * en andersom ook niet.
   */
  /*
   * En een element dat buiten beeld is gezet -- of daar stond sinds de overlay
   * nog het werkgebied gebruikte -- hoort weer helemaal zichtbaar te worden.
   */
  console.log('\neen element dat buiten beeld stond:')
  const ver = { ...layout, navigatie: { ...layout.navigatie, x: area.width + 400, y: area.height + 400 } }
  await js(main, `window.career.saveOverlayLayout(${JSON.stringify(ver)})`)
  // De overlay leest de indeling bij het openen, dus even dicht en weer open.
  await js(main, `window.career.setOverlay(undefined, false)`)
  await wait(800)
  await js(main, `window.career.setOverlay(${JSON.stringify(duty)}, true)`)
  await wait(4000)
  const opnieuw = BrowserWindow.getAllWindows().find((w) => w !== main && !w.isDestroyed())
  const terecht = await js(main, `window.career.overlayLayout()`)
  const nav = await js(
    opnieuw,
    `(() => { const el = document.querySelector('.panel-navigatie'); if (!el) return null; const r = el.getBoundingClientRect(); return { w: r.width, h: r.height } })()`
  )
  eis(
    'de navigatie is teruggehaald',
    terecht.navigatie.x + (nav?.w ?? 0) <= area.width + 1 &&
      terecht.navigatie.y + (nav?.h ?? 0) <= area.height + 1,
    `staat op ${Math.round(terecht.navigatie.x)},${Math.round(terecht.navigatie.y)} en is ${Math.round(nav?.w ?? 0)}x${Math.round(nav?.h ?? 0)}`
  )

  console.log('\nde instellingen:')
  const eerst = await js(main, `window.career.settings()`)
  const naRate = await js(main, `window.career.saveSettings({ overlayRate: 'zuinig' })`)
  eis('de verversing wordt bewaard', naRate.overlayRate === 'zuinig', `staat op ${naRate.overlayRate}`)
  eis('de taal blijft staan', naRate.language === eerst.language, `taal ${naRate.language}`)
  const naTaal = await js(main, `window.career.saveSettings({ language: 'de' })`)
  eis('de taal wisselen laat de verversing staan', naTaal.overlayRate === 'zuinig')
  eis('en de taal is om', naTaal.language === 'de')

  console.log(ok ? '\nhet venster volgt zijn inhoud' : '\nKLOPT NIET')
  app.exit(ok ? 0 : 1)
})
