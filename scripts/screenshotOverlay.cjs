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

  await main.webContents.executeJavaScript(
    `[...document.querySelectorAll('button')].find((b) => b.textContent.includes('Dienst toewijzen'))?.click()`
  )
  await wait(4000)

  // Vertrektijd van de eerste rit uit de dienstkaart halen, zodat de overlay
  // een echte rit te pakken heeft.
  const first = await main.webContents.executeJavaScript(
    `document.querySelector('.leg-time')?.textContent?.trim() ?? ''`
  )
  const [hours, minutes] = first.split('–')[0].trim().split(':').map(Number)
  const seconds = (hours * 60 + minutes + 6) * 60
  console.log(`eerste rit vertrekt ${first}; klok gezet op ${Math.floor(seconds / 3600)}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}`)

  mkdirSync(liveDir, { recursive: true })
  writeFileSync(
    liveFile,
    JSON.stringify({
      alive: true,
      time: seconds,
      day: 14,
      month: 6,
      year: 1988,
      velocity: 38.4,
      passengers: 23,
      scheduleActive: 1,
      targetIndex: 3,
      tankPercent: 0.62,
      km: 152207,
      metres: 880,
      entryRequest: 1,
      exitRequest: 0,
      ticket: 0,
      busstop: 'U Rathaus Spandau',
      delayMin: '2',
      delaySec: '40',
      line: ' 92 ',
      terminus: 'Reimerweg',
      matrix: ' 92 '
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
