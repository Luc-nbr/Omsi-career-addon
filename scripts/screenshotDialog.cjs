/**
 * Legt het opstartvenster vast zonder OMSI echt te starten.
 *
 * De IPC-afhandelaar wordt hier vervangen; via de pagina lukt dat niet, want
 * contextBridge zet `window.career` vast.
 */
const { app, BrowserWindow, ipcMain } = require('electron')
const { writeFileSync } = require('node:fs')
const { join } = require('node:path')

require('../out/main/index.js')

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const js = (w, code) => w.webContents.executeJavaScript(code)

app.whenReady().then(async () => {
  await wait(1200)
  ipcMain.removeHandler('duty:begin')
  ipcMain.handle('duty:begin', () => ({ connected: false, launched: true, running: false }))
  ipcMain.removeHandler('omsi:live')
  ipcMain.handle('omsi:live', () => false)

  const [w] = BrowserWindow.getAllWindows()
  for (let i = 0; i < 80; i++) {
    if (await js(w, `Boolean(document.querySelector('select#map') || document.querySelector('#naam'))`)) break
    await wait(500)
  }

  if (await js(w, `Boolean(document.querySelector('#naam'))`)) {
    await js(w, `(() => {
      const i = document.querySelector('#naam')
      const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      s.call(i, 'Testchauffeur')
      i.dispatchEvent(new Event('input', { bubbles: true }))
    })()`)
    await wait(400)
    await js(w, `[...document.querySelectorAll('button')].find(b => b.textContent.includes('Profiel aanmaken'))?.click()`)
    await wait(1500)
  }

  await js(w, `[...document.querySelectorAll('button')].find(b => b.textContent.includes('Diensten zoeken'))?.click()`)
  // Wachten tot het rooster er staat in plaats van blind te tellen.
  for (let i = 0; i < 60; i++) {
    if (await js(w, `Boolean(document.querySelector('.duty-item'))`)) break
    await wait(500)
  }
  await js(w, `document.querySelector('.duty-item')?.click()`)

  for (let i = 0; i < 40; i++) {
    if (await js(w, `[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Dienst starten')`)) break
    await wait(300)
  }
  await js(w, `[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Dienst starten')?.click()`)

  await wait(6500)
  const shown = await js(w, `Boolean(document.querySelector('.dialog'))`)
  console.log(`venster zichtbaar: ${shown}`)
  writeFileSync(join(process.env.SHOT_DIR, 'dialoog.png'), (await w.capturePage()).toPNG())
  console.log('geschreven: dialoog.png')
  app.quit()
})
