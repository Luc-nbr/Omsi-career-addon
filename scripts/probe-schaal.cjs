/**
 * Schaalt het venster mee?
 *
 *   npx electron scripts/probe-schaal.cjs [uitvoermap]
 *
 * Drie maten: een smal venster, een gewoon venster en een breed venster. Bij elk
 * de vraag die ertoe doet -- past de inhoud in de breedte, of komt er een
 * schuifbalk onderaan? Een schuifbalk betekent dat er iets vaststaat dat mee
 * had moeten geven.
 *
 * Bij het brede venster geldt het omgekeerde: dan hoort de inhoud de ruimte te
 * gebruiken in plaats van in een smalle kolom te blijven hangen.
 */
const { app, BrowserWindow } = require('electron')
const { mkdtempSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

const args = process.argv.slice(
  process.argv.findIndex((arg) => arg.endsWith('probe-schaal.cjs')) + 1
)
const outputDir = args[0] || __dirname
app.setPath('userData', mkdtempSync(join(tmpdir(), 'omsi-schaal-')))

setTimeout(() => {
  console.error('time-out')
  app.exit(1)
}, 120000).unref()
require('../out/main/index.js')

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const js = (window, code) => window.webContents.executeJavaScript(code)

async function waitFor(window, expression, tries = 60) {
  for (let i = 0; i < tries; i++) {
    if (await js(window, `Boolean(${expression})`)) return true
    await wait(250)
  }
  return false
}

app.whenReady().then(async () => {
  await wait(1200)
  const [main] = BrowserWindow.getAllWindows()

  // Een chauffeur, anders blijft het welkomstscherm staan.
  if (await waitFor(main, `document.querySelector('#welcome-name')`, 40)) {
    await js(
      main,
      `[...document.querySelectorAll('.lang')].find((b) => b.textContent.includes('Nederlands'))?.click()`
    )
    await wait(300)
    await js(
      main,
      `(() => {
        const i = document.querySelector('#welcome-name');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'Luc');
        i.dispatchEvent(new Event('input', { bubbles: true }));
      })()`
    )
    await wait(250)
    await js(main, `document.querySelector('.welcome .actions .btn')?.click()`)
    await wait(800)
  }
  // Door naar het scherm waar het om gaat: de zijbalk met de dienstkaart ernaast.
  await waitFor(main, `document.querySelector('.mode-grid, .modes, button')`)
  await js(
    main,
    `[...document.querySelectorAll('button, [role=button], .card')]
      .find((e) => e.textContent.trim().startsWith('Dienst'))?.click()`
  )
  await waitFor(main, `document.querySelector('.mode-bar')`)

  const maten = [
    { naam: 'smal', w: 760, h: 720 },
    { naam: 'gewoon', w: 1280, h: 860 },
    { naam: 'breed', w: 1920, h: 1080 }
  ]

  for (const maat of maten) {
    main.setContentSize(maat.w, maat.h)
    await wait(900)
    const meet = await js(
      main,
      `(() => {
        const d = document.documentElement;
        const kaart = document.querySelector('.card');
        return {
          scroll: d.scrollWidth,
          zicht: d.clientWidth,
          inhoud: kaart ? Math.round(kaart.getBoundingClientRect().width) : 0,
          zijbalk: Math.round((document.querySelector('.sidebar')?.getBoundingClientRect().width) ?? 0)
        }
      })()`
    )
    const past = meet.scroll <= meet.zicht + 1
    const benut = meet.zicht > 0 ? Math.round((meet.inhoud / meet.zicht) * 100) : 0
    const image = await main.capturePage()
    const file = join(outputDir, `schaal-${maat.naam}.png`)
    writeFileSync(file, image.toPNG())
    console.log(
      `${maat.naam.padEnd(7)} gevraagd ${maat.w}, werd ${meet.zicht}: ` +
        `${past ? 'past' : 'SCHUIFBALK (' + meet.scroll + ' > ' + meet.zicht + ')'}, ` +
        `zijbalk ${meet.zijbalk}, kaart ${meet.inhoud} (${benut}% van de breedte) -> ${file}`
    )
  }

  /*
   * En dan de overgang zelf: van een venster naar volledig scherm. Beginnen in
   * volledig scherm ging goed, maar overschakelen niet -- dus er is iets dat
   * bij het openen wordt uitgerekend en daarna blijft staan.
   */
  main.unmaximize()
  main.setContentSize(1000, 760)
  await wait(900)
  const voor = await js(
    main,
    `(() => {
      const d = document.documentElement;
      return { scrollLeft: d.scrollLeft, scroll: d.scrollWidth, zicht: d.clientWidth,
               zijbalk: Math.round(document.querySelector('.sidebar')?.getBoundingClientRect().left ?? -1) }
    })()`
  )
  console.log(`   venster 1000: links ${voor.zijbalk}, schuif ${voor.scrollLeft}, ${voor.scroll}/${voor.zicht}`)

  main.maximize()
  await wait(1400)
  const na = await js(
    main,
    `(() => {
      const d = document.documentElement;
      const kaart = document.querySelector('.card');
      return { scrollLeft: d.scrollLeft, scroll: d.scrollWidth, zicht: d.clientWidth,
               zijbalk: Math.round(document.querySelector('.sidebar')?.getBoundingClientRect().left ?? -1),
               kaart: kaart ? Math.round(kaart.getBoundingClientRect().width) : 0 }
    })()`
  )
  const image = await main.capturePage()
  writeFileSync(join(outputDir, 'schaal-naar-volledig.png'), image.toPNG())
  console.log(
    `   na maximaliseren: links ${na.zijbalk}, schuif ${na.scrollLeft}, ${na.scroll}/${na.zicht}, kaart ${na.kaart}`
  )
  console.log(
    na.zijbalk === 0 && na.scrollLeft === 0 && na.scroll <= na.zicht + 1
      ? 'de overgang staat recht'
      : 'MISLUKT: er blijft iets scheef staan'
  )

  /*
   * En het geval waar het misging: het routevenster staat open terwijl je naar
   * volledig scherm gaat. De kaart daarin meet zichzelf, dus als die meting
   * blijft staan klopt er daarna niets meer van.
   */
  main.unmaximize()
  main.setContentSize(1000, 760)
  await wait(700)
  await js(
    main,
    `[...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith('Genereer'))?.click()`
  )
  const gelukt = await waitFor(
    main,
    `[...document.querySelectorAll('button')].some((b) => b.textContent.trim().startsWith('Bekijk route'))`,
    // Een grote kaart doorlezen duurt; Ahlheim heeft 224 km2 aan tegels.
    360
  )
  if (!gelukt) {
    console.log('   geen dienst gekregen; het routevenster blijft ongetest')
    app.exit(0)
    return
  }
  await js(
    main,
    `[...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith('Bekijk route'))?.click()`
  )
  await waitFor(main, `document.querySelector('.map-window-inner')`)
  await wait(900)

  const meetVenster = () =>
    js(
      main,
      `(() => {
        const binnen = document.querySelector('.map-window-inner');
        const doek = document.querySelector('.map-window-inner canvas');
        const svg = document.querySelector('.map-window-inner svg');
        const r = binnen?.getBoundingClientRect();
        const c = doek?.getBoundingClientRect();
        return {
          zicht: document.documentElement.clientWidth,
          venster: r ? Math.round(r.width) + 'x' + Math.round(r.height) : '-',
          links: r ? Math.round(r.left) : -1,
          doekCss: c ? Math.round(c.width) + 'x' + Math.round(c.height) : '-',
          doekPixels: doek ? doek.width + 'x' + doek.height : '-',
          svgBreed: svg ? Math.round(svg.getBoundingClientRect().width) : -1
        }
      })()`
    )

  console.log(`   routevenster in een venster van 1000: ${JSON.stringify(await meetVenster())}`)
  main.maximize()
  await wait(1600)
  const na2 = await meetVenster()
  console.log(`   na maximaliseren: ${JSON.stringify(na2)}`)
  const image2 = await main.capturePage()
  writeFileSync(join(outputDir, 'schaal-route-volledig.png'), image2.toPNG())

  app.exit(0)
})
