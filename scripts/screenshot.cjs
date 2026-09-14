/**
 * Start de echte app en legt twee schermen vast: het toewijsformulier en de
 * dienstkaart die eruit rolt. Draaien met:  npx electron scripts/screenshot.cjs
 */
const { app, BrowserWindow } = require('electron')
const { writeFileSync } = require('node:fs')
const { join } = require('node:path')

require('../out/main/index.js')

const outputDir = process.env.SHOT_DIR || __dirname
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function shoot(window, name) {
  const image = await window.capturePage()
  const file = join(outputDir, `${name}.png`)
  writeFileSync(file, image.toPNG())
  console.log(`geschreven: ${file}`)
}

app.whenReady().then(async () => {
  await wait(1000)
  const [window] = BrowserWindow.getAllWindows()
  if (!window) {
    console.error('geen venster')
    app.quit()
    return
  }

  // Wachten tot kaarten en voertuigen zijn ingelezen.
  for (let i = 0; i < 60; i++) {
    const ready = await window.webContents.executeJavaScript(
      `Boolean(document.querySelector('select#map'))`
    )
    if (ready) break
    await wait(500)
  }
  await wait(500)
  await shoot(window, '01-toewijzen')

  const clicked = await window.webContents.executeJavaScript(
    `(() => {
       const button = [...document.querySelectorAll('button')]
         .find((b) => b.textContent.includes('Diensten zoeken'))
       if (!button) return false
       button.click()
       return true
     })()`
  )
  console.log(`knop gevonden: ${clicked}`)
  await wait(5000)
  await shoot(window, '02-rooster')

  // Eerste dienst uit het rooster kiezen.
  await window.webContents.executeJavaScript(`document.querySelector('.duty-item')?.click()`)
  await wait(2500)
  await shoot(window, '03-dienstkaart')

  // Eén rit openklappen en de instructies in beeld scrollen.
  await window.webContents.executeJavaScript(
    `document.querySelectorAll('.leg')[1]?.click()`
  )
  await wait(500)
  await window.webContents.executeJavaScript(
    `document.querySelector('.leg-detail')?.scrollIntoView({ block: 'center' })`
  )
  await wait(600)
  await shoot(window, '04-instructies')

  app.quit()
})
