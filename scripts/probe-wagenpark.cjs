/**
 * Zelf een wagenpark (.hof) kiezen.
 *
 *   npx electron scripts/probe-wagenpark.cjs [kaartmap]
 *
 * Eén busmodel heeft er vaak meerdere naast zich liggen: Spandau 86 tot en met
 * 94, Grundorf, Rheinhausen. In elk staan andere bestemmingscodes, en dat is
 * precies wat de chauffeur op de IBIS intoetst. De app koos er zelf een; nu kun
 * je hem aanwijzen.
 *
 * De proef kijkt of die keuze ook echt doorwerkt: hetzelfde dienstvoorstel,
 * twee verschillende wagenparken, en dan horen de codes te verschillen. Zo niet,
 * dan is het een keuzevak dat nergens op aansluit.
 */
const { app, BrowserWindow } = require('electron')
const { mkdtempSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

const args = process.argv.slice(
  process.argv.findIndex((arg) => arg.endsWith('probe-wagenpark.cjs')) + 1
)
const mapFolder = args[0] || 'Rheinhausen'
app.setPath('userData', mkdtempSync(join(tmpdir(), 'omsi-wagenpark-')))

setTimeout(() => {
  console.error('time-out')
  app.exit(1)
}, 180000).unref()
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

  const assignments = await js(
    main,
    `window.career.listDuties({ mapFolder: ${JSON.stringify(mapFolder)}, targetMinutes: 90, window: 'heledag' })`
  )
  const gekozen = assignments.find((item) => item.vehicle && item.duty.legs.length > 0)
  if (!gekozen) {
    console.error('geen dienst met een bus')
    app.exit(1)
    return
  }
  const { duty, vehicle, yard } = gekozen
  console.log(`dienst ${duty.lineNumbers.join('/')}, bus ${vehicle.manufacturer} ${vehicle.type}`)
  console.log(`de app koos zelf: ${yard}`)

  const yards = await js(
    main,
    `window.career.yards(${JSON.stringify(duty)}, ${JSON.stringify(vehicle)}, 2016)`
  )
  console.log(`${yards.length} wagenparken naast deze bus:`)
  for (const optie of yards.slice(0, 6)) {
    console.log(
      `   ${optie.suggested ? '>' : ' '} ${optie.name} — kent ${optie.known} van ${optie.total}`
    )
  }
  if (yards.length < 2) {
    console.log('MISLUKT: er valt niets te kiezen bij deze bus')
    app.exit(1)
    return
  }

  const codes = async (naam) => {
    const plan = await js(
      main,
      `window.career.ibis(${JSON.stringify(duty)}, ${JSON.stringify(vehicle)}, 2016, ${JSON.stringify(naam)})`
    )
    return {
      yard: plan.yard,
      codes: plan.legs.map((leg) => `${leg.lineNumber}/${leg.route ?? '-'}/${leg.code ?? '-'}`).join(' ')
    }
  }

  const eerste = await codes(yards[0].name)
  const tweede = await codes(yards[yards.length - 1].name)
  console.log(`${eerste.yard}: ${eerste.codes.slice(0, 70)}`)
  console.log(`${tweede.yard}: ${tweede.codes.slice(0, 70)}`)

  console.log(
    eerste.yard === yards[0].name && tweede.yard === yards[yards.length - 1].name
      ? 'de keuze wordt gevolgd'
      : 'MISLUKT: de app houdt zich niet aan de keuze'
  )
  console.log(
    eerste.codes === tweede.codes
      ? 'let op: beide wagenparken geven dezelfde codes'
      : 'en de codes verschillen, zoals het hoort'
  )

  app.exit(0)
})
