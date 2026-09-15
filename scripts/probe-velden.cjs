/**
 * Zijn de invulvelden dekkend genoeg voor hun eigen uitklaplijst?
 *
 *   npx electron scripts/probe-velden.cjs
 *
 * De lijst die uitklapt bij een `select` wordt niet door de pagina getekend maar
 * door Windows, en die neemt de kleur van het veld over. Is die kleur
 * doorschijnend, dan komt de lijst licht uit terwijl onze letters wit zijn -- en
 * dan lees je alleen de regel waar de muis op staat.
 *
 * Die lijst valt van hieruit niet vast te leggen: het is een venster van het
 * besturingssysteem, geen deel van de pagina. Wat wel te controleren valt, is
 * dat het veld en zijn regels een dekkende kleur en een leesbare letterkleur
 * hebben. Dat is precies wat er misging.
 */
const { app, BrowserWindow } = require('electron')
const { mkdtempSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

app.setPath('userData', mkdtempSync(join(tmpdir(), 'omsi-velden-')))
setTimeout(() => {
  console.error('time-out')
  app.exit(1)
}, 120000).unref()
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

/** Is deze kleur dekkend? rgb(...) wel, rgba(...) met alfa onder 1 niet. */
function dekkend(kleur) {
  const m = /rgba?\(([^)]+)\)/.exec(kleur || '')
  if (!m) return false
  const delen = m[1].split(',').map((d) => Number.parseFloat(d))
  return delen.length < 4 || delen[3] >= 0.999
}

/** Hoe licht is een kleur, grof gezegd? 0 is zwart, 1 is wit. */
function helderheid(kleur) {
  const m = /rgba?\(([^)]+)\)/.exec(kleur || '')
  if (!m) return 0.5
  const [r, g, b] = m[1].split(',').map((d) => Number.parseFloat(d))
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

app.whenReady().then(async () => {
  await wait(1200)
  const [main] = BrowserWindow.getAllWindows()

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
  await waitFor(main, `document.querySelector('.modes')`)
  await js(
    main,
    `[...document.querySelectorAll('button')].find((b) => b.textContent.includes('Dienst'))?.click()`
  )
  await waitFor(main, `document.querySelector('select#map option')`)

  const gemeten = await js(
    main,
    `(() => {
       const veld = document.querySelector('select#map')
       const regel = veld.querySelector('option')
       const v = getComputedStyle(veld)
       const r = getComputedStyle(regel)
       return {
         veldAchter: v.backgroundColor,
         veldLetter: v.color,
         regelAchter: r.backgroundColor,
         regelLetter: r.color,
         schema: getComputedStyle(document.documentElement).colorScheme,
         regels: veld.options.length
       }
     })()`
  )

  let ok = true
  const eis = (naam, goed, erbij = '') => {
    if (!goed) ok = false
    console.log(`   ${goed ? 'ja ' : 'NEE'} ${naam.padEnd(44)} ${erbij}`)
  }

  console.log(`het kaartveld heeft ${gemeten.regels} regels\n`)
  eis('het veld is dekkend', dekkend(gemeten.veldAchter), gemeten.veldAchter)
  eis('de regels zijn dekkend', dekkend(gemeten.regelAchter), gemeten.regelAchter)
  eis('het veld is donker', helderheid(gemeten.veldAchter) < 0.4, `helderheid ${helderheid(gemeten.veldAchter).toFixed(2)}`)
  eis('de regels zijn donker', helderheid(gemeten.regelAchter) < 0.4, `helderheid ${helderheid(gemeten.regelAchter).toFixed(2)}`)
  eis('de letters zijn licht', helderheid(gemeten.regelLetter) > 0.7, gemeten.regelLetter)
  eis('het venster staat op donker', gemeten.schema.includes('dark'), gemeten.schema)

  console.log(ok ? '\nde uitklaplijst is leesbaar' : '\nKLOPT NIET')
  app.exit(ok ? 0 : 1)
})
