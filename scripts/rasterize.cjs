/**
 * Zet de SVG's uit render-roads.ts om naar PNG, met Chromium uit Electron.
 *   npx electron scripts/rasterize.cjs <map>
 */
const { app, BrowserWindow } = require('electron')
const { readdirSync, readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

const dir = process.argv[process.argv.length - 1]

app.whenReady().then(async () => {
  const window = new BrowserWindow({ width: 900, height: 900, show: false, useContentSize: true })
  for (const name of readdirSync(dir).filter((file) => file.endsWith('.svg'))) {
    const text = readFileSync(join(dir, name), 'utf8')
    const size = Number(/width="(\d+)"/.exec(text)[1])
    window.setContentSize(size, size)
    // loadFile en geen data-URL: een stad in SVG is al snel te groot voor een URL.
    // Eén venster hergebruiken; een nieuw venster per plaatje breekt het laden af.
    try {
      await window.loadFile(join(dir, name))
    } catch (error) {
      console.error(`${name}: ${error.message.slice(0, 80)}`)
      continue
    }
    await new Promise((resolve) => setTimeout(resolve, 400))
    const image = await window.webContents.capturePage()
    writeFileSync(join(dir, name.replace(/\.svg$/, '.png')), image.toPNG())
    console.log(`geschreven: ${name.replace(/\.svg$/, '.png')}`)
  }
  app.quit()
})
