/**
 * Gaat de dienst mee dicht als de app sluit?
 *
 *   npx electron scripts/probe-afsluiten.cjs <profielmap> <fase>
 *
 * In twee fasen, met dezelfde profielmap, want een dienst die echt gereden is
 * kun je niet namaken zonder OMSI te starten -- en dat wil je in een proef niet.
 *
 *   fase 1  een chauffeur en een aangenomen dienst, daarna afsluiten.
 *           Die dienst is nooit begonnen, dus hij hoort te vervallen.
 *   fase 2  met een beginstand die er met de hand in is gezet: dan is de dienst
 *           wel gereden, en hoort hij bij het afsluiten in het logboek te komen.
 *
 * Tussen de twee fasen zet het aanroepende commando die beginstand in het
 * profiel. Zo blijft OMSI erbuiten en wordt toch allebei de takken gelopen.
 */
const { app, BrowserWindow } = require('electron')
const { join } = require('node:path')

const args = process.argv.slice(
  process.argv.findIndex((arg) => arg.endsWith('probe-afsluiten.cjs')) + 1
)
const profielMap = args[0]
const fase = Number(args[1] ?? 1)
if (!profielMap) {
  console.error('Geef een profielmap mee.')
  process.exit(1)
}
app.setPath('userData', profielMap)

setTimeout(() => {
  console.error('time-out')
  app.exit(1)
}, 120000).unref()
require('../out/main/index.js')

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const js = (window, code) => window.webContents.executeJavaScript(code)

app.whenReady().then(async () => {
  await wait(1500)
  const [main] = BrowserWindow.getAllWindows()
  for (let i = 0; i < 80; i++) {
    if (await js(main, `Boolean(window.career)`)) break
    await wait(250)
  }

  if (fase === 1) {
    await js(main, `window.career.createProfile('Proef')`)
    const assignments = await js(
      main,
      `window.career.listDuties({ mapFolder: 'Grundorf', targetMinutes: 90, window: 'heledag' })`
    )
    const gekozen = assignments.find((item) => item.vehicle && item.duty.legs.length > 0)
    if (!gekozen) {
      console.error('geen dienst met een bus')
      app.exit(1)
      return
    }
    await js(main, `window.career.confirmDuty(${JSON.stringify(gekozen)}, '', 'dienst')`)
    const na = await js(main, `window.career.career()`)
    // Bewaren, zodat fase 2 dezelfde dienst met een beginstand terug kan zetten.
    require('node:fs').writeFileSync(
      join(profielMap, 'dienst.json'),
      JSON.stringify(na.state.activeDuty ?? null, null, 2),
      'utf8'
    )
    console.log(
      `fase 1: dienst aangenomen (${na.state.activeDuty ? 'staat in het profiel' : 'MISLUKT'}), ` +
        `${na.state.entries.length} in het logboek`
    )
  } else {
    const nu = await js(main, `window.career.career()`)
    console.log(
      `fase 2: bij het opstarten ${nu.state.activeDuty ? 'staat de dienst er nog' : 'is er geen dienst'}` +
        `, beginstand ${nu.state.activeDuty?.baseline ? 'aanwezig' : 'ontbreekt'}`
    )
  }

  // En dan afsluiten zoals een gebruiker dat doet.
  app.quit()
})
