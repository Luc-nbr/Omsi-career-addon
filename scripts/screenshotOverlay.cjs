/**
 * Test de overlay van begin tot eind: dienst laten toewijzen, een live-bestand
 * neerzetten alsof OMSI draait, de overlay openen en vastleggen.
 *
 * Draaien met:  npx electron scripts/screenshotOverlay.cjs
 */
const { app, BrowserWindow } = require('electron')
const { writeFileSync, mkdirSync, unlinkSync } = require('node:fs')
const { join } = require('node:path')

require('../out/main/index.js')

const outputDir = process.env.SHOT_DIR || __dirname
const liveDir = join(process.env.LOCALAPPDATA, 'OMSI Career')
const liveFile = join(liveDir, 'live.json')
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function shoot(window, name) {
  const image = await window.capturePage()
  const file = join(outputDir, `${name}.png`)
  writeFileSync(file, image.toPNG())
  console.log(`geschreven: ${file}`)
}

app.whenReady().then(async () => {
  await wait(1000)
  const [main] = BrowserWindow.getAllWindows()

  for (let i = 0; i < 60; i++) {
    const ready = await main.webContents.executeJavaScript(
      `Boolean(document.querySelector('select#map'))`
    )
    if (ready) break
    await wait(500)
  }

  // Profiel aanmaken als dat nog moet.
  if (await main.webContents.executeJavaScript(`Boolean(document.querySelector('#naam'))`)) {
    await main.webContents.executeJavaScript(
      `(() => {
         const input = document.querySelector('#naam')
         const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
         setter.call(input, 'Testchauffeur')
         input.dispatchEvent(new Event('input', { bubbles: true }))
       })()`
    )
    await wait(400)
    await main.webContents.executeJavaScript(
      `[...document.querySelectorAll('button')].find((b) => b.textContent.includes('Profiel aanmaken'))?.click()`
    )
    await wait(1500)
  }

  await main.webContents.executeJavaScript(
    `[...document.querySelectorAll('button')].find((b) => b.textContent.includes('Diensten zoeken'))?.click()`
  )
  await wait(5000)
  await main.webContents.executeJavaScript(`document.querySelector('.duty-item')?.click()`)
  await wait(2500)

  const first = await main.webContents.executeJavaScript(
    `document.querySelector('.leg-time')?.textContent?.trim() ?? ''`
  )
  const [hours, minutes] = first.split('–')[0].trim().split(':').map(Number)
  const seconds = (hours * 60 + minutes + 6) * 60
  console.log(`eerste rit vertrekt ${first}; klok gezet op ${Math.floor(seconds / 3600)}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}`)

  mkdirSync(liveDir, { recursive: true })
  // seen-masker: alle universele variabelen plus lights_abbl (bit 17) en
  // IBIS_busstop_index (bit 22), zodat de overlay die mag gebruiken.
  const seen = 0x1ffff | (1 << 17) | (1 << 21) | (1 << 22)
  writeFileSync(
    liveFile,
    JSON.stringify({
      alive: true,
      seen,
      time: seconds,
      day: 14, month: 6, year: 1988,
      velocity: 0,
      passengers: 0,
      scheduleActive: 1,
      targetIndex: 3,
      tankPercent: 0.62,
      km: 152207, metres: 880,
      entryRequest: 0, exitRequest: 0, ticket: 0,
      entryOpen: 0, exitOpen: 0,
      atStation: 0,
      brightness: 0.9,
      streetCond: 0.4,
      precipRate: 0,
      precipType: 1,
      lightsLow: 0,
      blinkerLeft: 0, blinkerRight: 0, brakeLight: 0,
      engineOn: 1,
      busstopIndex: 4,
      maxBrake: 3.9, maxAccel: 1.9, topSpeed: 61.2,
      harshBrakes: 0, harshAccels: 0,
      busstop: '',
      delayMin: '', delaySec: '',
      line: ' 92 ', terminus: 'Reimerweg', matrix: ' 92 '
    })
  )

  await main.webContents.executeJavaScript(
    `[...document.querySelectorAll('button')].find((b) => b.textContent.includes('Overlay tonen'))?.click()`
  )
  await wait(1800)

  const overlay = BrowserWindow.getAllWindows().find((w) => w !== main)
  if (!overlay) {
    console.error('geen overlayvenster')
  } else {
    await shoot(overlay, 'overlay')
  }

  try {
    unlinkSync(liveFile)
  } catch {}
  app.quit()
})
