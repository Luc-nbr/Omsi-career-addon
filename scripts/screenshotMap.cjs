/**
 * Legt de kaart vast op een gekozen OMSI-kaart, in de echte app, en meet hoe
 * soepel slepen en zoomen gaan.
 *
 *   npx electron scripts/screenshotMap.cjs <kaartmap> [uitvoermap]
 *
 * Draait met een tijdelijke gebruikersmap: het welkomsscherm wordt doorlopen
 * met een testchauffeur, en de echte profielen blijven onaangeroerd.
 */
const { app, BrowserWindow } = require('electron')
const { mkdtempSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

const args = process.argv.slice(process.argv.findIndex((arg) => arg.endsWith('screenshotMap.cjs')) + 1)
const mapFolder = args[0] || 'Berlin-Spandau'
const outputDir = args[1] || __dirname

app.setPath('userData', mkdtempSync(join(tmpdir(), 'omsi-career-shot-')))
// Nooit blijven hangen: een script dat wacht op een knop die er niet komt, stopt zelf.
setTimeout(() => {
  console.error('time-out')
  app.exit(1)
}, 180000).unref()
require('../out/main/index.js')

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitFor(window, expression, tries = 80) {
  for (let i = 0; i < tries; i++) {
    if (await window.webContents.executeJavaScript(`Boolean(${expression})`)) return true
    await wait(250)
  }
  return false
}

async function shoot(window, name) {
  const image = await window.capturePage()
  const file = join(outputDir, `${mapFolder}-${name}.png`)
  writeFileSync(file, image.toPNG())
  console.log(`geschreven: ${file}`)
}

/** Sleept of zoomt een reeks beelden lang en meet de tijd tussen de beelden. */
function measure(window, selector, kind) {
  return window.webContents.executeJavaScript(`new Promise((resolve) => {
    const el = [...document.querySelectorAll(${JSON.stringify(selector)})].pop()
    const rect = el.getBoundingClientRect()
    const x0 = rect.left + rect.width / 2, y0 = rect.top + rect.height / 2
    const opts = (x, y) => ({ bubbles: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true })
    if (${JSON.stringify(kind)} === 'drag') el.dispatchEvent(new PointerEvent('pointerdown', opts(x0, y0)))
    const times = []
    let last = performance.now(), n = 0
    function frame() {
      const now = performance.now(); times.push(now - last); last = now
      n++
      if (${JSON.stringify(kind)} === 'drag') el.dispatchEvent(new PointerEvent('pointermove', opts(x0 + n * 6, y0 + n * 2)))
      else el.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: x0, clientY: y0, deltaY: n % 40 < 20 ? 60 : -60 }))
      if (n < 80) requestAnimationFrame(frame)
      else {
        if (${JSON.stringify(kind)} === 'drag') el.dispatchEvent(new PointerEvent('pointerup', opts(x0, y0)))
        times.shift(); times.sort((a, b) => a - b)
        resolve({ median: +times[times.length >> 1].toFixed(1), p90: +times[Math.floor(times.length * 0.9)].toFixed(1) })
      }
    }
    requestAnimationFrame(frame)
  })`)
}

app.whenReady().then(async () => {
  await wait(1000)
  const [window] = BrowserWindow.getAllWindows()
  if (!window) {
    console.error('geen venster')
    app.exit(1)
    return
  }
  window.setSize(1400, 950)

  if (await waitFor(window, `document.querySelector('#welcome-name')`, 40)) {
    await window.webContents.executeJavaScript(
      `[...document.querySelectorAll('.lang')].find((b) => b.textContent.includes('Nederlands'))?.click()`
    )
    await wait(300)
    await window.webContents.executeJavaScript(`(() => {
      const input = document.querySelector('#welcome-name')
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Testchauffeur')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })()`)
    await wait(300)
    await window.webContents.executeJavaScript(`document.querySelector('.welcome .actions .btn')?.click()`)
  }

  if (!(await waitFor(window, `document.querySelector('select#map option')`))) {
    console.error('geen kaartkeuze')
    app.exit(1)
    return
  }
  const picked = await window.webContents.executeJavaScript(`(() => {
    const select = document.querySelector('select#map')
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, ${JSON.stringify(mapFolder)})
    select.dispatchEvent(new Event('change', { bubbles: true }))
    return select.value
  })()`)
  console.log(`kaart: ${picked}`)
  await wait(500)
  await window.webContents.executeJavaScript(`document.querySelector('.main .actions .btn')?.click()`)
  if (!(await waitFor(window, `document.querySelector('.duty-item')`, 120))) {
    console.error('geen diensten')
    app.exit(1)
    return
  }
  await window.webContents.executeJavaScript(`document.querySelector('.duty-item').click()`)
  await waitFor(window, `document.querySelector('.map-box .route-roads')`, 120)
  await wait(1500)
  await window.webContents.executeJavaScript(`document.querySelector('.map-box')?.scrollIntoView({ block: 'center' })`)
  await wait(500)
  await shoot(window, 'paneel')

  await window.webContents.executeJavaScript(`document.querySelector('.map-head .ghost')?.click()`)
  await waitFor(window, `document.querySelector('.map-window .route-roads')`)
  await wait(1500)
  await shoot(window, 'venster')
  console.log('slepen, uitgezoomd:', JSON.stringify(await measure(window, '.route-canvas', 'drag')))
  if (process.env.SHOT_BASELINE) {
    // Zelfde meting zonder wegennet: wat kost de rest van de kaart?
    await window.webContents.executeJavaScript(
      `document.querySelectorAll('.route-roads').forEach((c) => (c.style.visibility = 'hidden')); 1`
    )
    console.log('slepen, zonder wegen:', JSON.stringify(await measure(window, '.route-canvas', 'drag')))
    await window.webContents.executeJavaScript(
      `document.querySelectorAll('.route-roads').forEach((c) => (c.style.visibility = '')); 1`
    )
  }
  console.log('zoomen:', JSON.stringify(await measure(window, '.route-canvas', 'wheel')))
  await wait(600)

  // Terug naar de hele route en dan inzoomen: het meten heeft het beeld verschoven.
  await window.webContents.executeJavaScript(`document.querySelectorAll('.map-window .map-tools button')[2].click()`)
  await wait(600)
  for (let i = 0; i < 4; i++) {
    await window.webContents.executeJavaScript(`document.querySelectorAll('.map-window .map-tools button')[0].click()`)
    await wait(250)
  }
  await wait(800)
  await shoot(window, 'ingezoomd')
  console.log('slepen, ingezoomd:', JSON.stringify(await measure(window, '.route-canvas', 'drag')))

  app.exit(0)
})
