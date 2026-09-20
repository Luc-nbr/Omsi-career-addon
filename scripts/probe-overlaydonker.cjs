/**
 * Blijft de overlay donker als Windows om licht vraagt?
 *
 *   npx electron scripts/probe-overlaydonker.cjs
 *
 * De overlay hangt over OMSI. Wat daar licht is, is geen vel op een scherm maar
 * een lamp op je voorruit. Hij hoort dus niet mee te gaan met de stand van
 * Windows, terwijl het opzetscherm dat juist wel moet doen.
 *
 * Dit laadt allebei de pagina's met `nativeTheme` op licht en daarna op donker,
 * en leest de werkelijk berekende kleuren uit. Er wordt niets geschreven en
 * OMSI wordt niet aangeraakt.
 */
const { app, BrowserWindow, nativeTheme } = require('electron')
const { pathToFileURL } = require('node:url')
const { join } = require('node:path')

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/*
 * Electron sluit zichzelf als het laatste venster dichtgaat, en wij sluiten er
 * een tussen de twee rondes door. Zonder dit zag je alleen de lichte stand.
 */
app.on('window-all-closed', () => {})

/** De gerekende ondergrond van een element, of niets als het er niet is. */
const kleurVan = (venster, kies) =>
  venster.webContents.executeJavaScript(
    `(() => {
       const el = document.querySelector(${JSON.stringify(kies)})
       if (!el) return null
       const s = getComputedStyle(el)
       return { grond: s.backgroundColor, ink: s.color }
     })()`
  )

app.whenReady().then(async () => {
  const uit = join(__dirname, '..', 'out', 'renderer')

  for (const stand of ['light', 'dark']) {
    nativeTheme.themeSource = stand

    const venster = new BrowserWindow({ show: false, width: 900, height: 600 })
    await venster.loadURL(pathToFileURL(join(uit, 'overlay.html')).href)
    await wait(1200)

    /*
     * Beide werelden in hetzelfde document. theme.css is hier ingeladen, dus
     * een los blokje met de klasse `setup` krijgt de regels van het
     * opzetscherm, en de overlay heeft de zijne al. Zo zijn ze in een keer
     * naast elkaar te lezen, zonder een tweede venster dat zijn brug mist.
     */
    const kleuren = await venster.webContents.executeJavaScript(
      `(() => {
         const proef = document.createElement('div')
         proef.className = 'setup'
         document.body.appendChild(proef)
         const lees = (el) => {
           const s = getComputedStyle(el)
           return {
             ink: s.getPropertyValue('--vel-ink').trim(),
             vel: s.getPropertyValue('--vel').trim(),
             grond: s.getPropertyValue('--grond').trim()
           }
         }
         const uit = { overlay: lees(document.querySelector('.overlay-body')), setup: lees(proef) }
         proef.remove()
         return uit
       })()`
    )

    console.log(`Windows op ${stand}:`)
    console.log(`  overlay      vel ${kleuren.overlay.vel}  ink ${kleuren.overlay.ink}`)
    console.log(`  opzetscherm  vel ${kleuren.setup.vel}  ink ${kleuren.setup.ink}`)

    venster.destroy()
    // Even lucht voordat het volgende venster laadt; anders faalt het laden.
    await wait(600)
  }

  app.exit(0)
})
