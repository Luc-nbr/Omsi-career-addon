/**
 * Opent het voorbeeld van het dienstkaartje en legt het vast.
 *
 * Draaien met:  npx electron scripts/screenshotReceipt.cjs
 */
const { app, BrowserWindow } = require('electron')
const { writeFileSync } = require('node:fs')
const { join } = require('node:path')

require('../out/main/index.js')

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const js = (w, code) => w.webContents.executeJavaScript(code)

app.whenReady().then(async () => {
  await wait(1200)
  const [main] = BrowserWindow.getAllWindows()

  for (let i = 0; i < 80; i++) {
    if (await js(main, `Boolean(document.querySelector('select#map') || document.querySelector('#naam'))`)) break
    await wait(500)
  }

  if (await js(main, `Boolean(document.querySelector('#naam'))`)) {
    await js(main, `(() => {
      const i = document.querySelector('#naam')
      const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      s.call(i, 'Testchauffeur')
      i.dispatchEvent(new Event('input', { bubbles: true }))
    })()`)
    await wait(400)
    await js(main, `[...document.querySelectorAll('button')].find(b => b.textContent.includes('Profiel aanmaken'))?.click()`)
    await wait(1500)
  }

  await js(main, `[...document.querySelectorAll('button')].find(b => b.textContent.includes('Diensten zoeken'))?.click()`)
  for (let i = 0; i < 60; i++) {
    if (await js(main, `Boolean(document.querySelector('.duty-item'))`)) break
    await wait(500)
  }
  await js(main, `document.querySelector('.duty-item')?.click()`)

  for (let i = 0; i < 40; i++) {
    if (await js(main, `[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Voorbeeld')`)) break
    await wait(300)
  }
  // Even wachten tot de IBIS-routes binnen zijn; die horen op het kaartje.
  await wait(2500)
  await js(main, `[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Voorbeeld')?.click()`)

  let receipt
  for (let i = 0; i < 40; i++) {
    receipt = BrowserWindow.getAllWindows().find((w) => w !== main && w.getTitle() === 'Dienstkaartje')
    if (receipt) break
    await wait(300)
  }
  if (!receipt) {
    console.error('geen voorbeeldvenster')
    app.quit()
    return
  }

  await wait(1500)
  const height = await js(receipt, `document.body.scrollHeight`)
  console.log(`kaartje is ${height} px hoog (${(height * 25.4 / 96).toFixed(0)} mm)`)
  writeFileSync(join(process.env.SHOT_DIR, 'bonnetje.png'), (await receipt.capturePage()).toPNG())
  console.log('geschreven: bonnetje.png')
  app.quit()
})
