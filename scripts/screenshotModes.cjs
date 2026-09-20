/**
 * Loopt de schermen langs en legt ze vast: het welkomstscherm, de chauffeur,
 * de modus, en daarna elke stap van de stappenbalk.
 *
 *   npx electron scripts/screenshotModes.cjs [uitvoermap] [modus] [breedtexhoogte]
 *
 * Modus is `dienst` (standaard), `carriere` of `vrij`. De maat is optioneel:
 * `720x560` is de ondergrens uit DESIGN.md en laat zien of alles daar nog past.
 * Draait met een eigen
 * gebruikersmap, dus de profielen van de gebruiker blijven onaangeroerd. Er
 * wordt niets in de spelmap geschreven: op "klaarzetten en starten" wordt niet
 * gedrukt.
 *
 * Het script kiest in elke stap de eerste tegel en gaat door tot de stappenbalk
 * niet meer verspringt. Zo hoeft het niet te weten welke stappen een modus
 * heeft; dat verschilt per modus en verandert nog.
 */
const { app, BrowserWindow } = require('electron')
const { mkdtempSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

const args = process.argv.slice(
  process.argv.findIndex((arg) => arg.endsWith('screenshotModes.cjs')) + 1
)
const outputDir = args[0] || __dirname
const modus = args[1] || 'dienst'
const MODUSKNOP = { dienst: 'Dienst', carriere: 'Carrière', vrij: 'Vrij rijden' }

app.setPath('userData', mkdtempSync(join(tmpdir(), 'omsi-enhancer-modes-')))
setTimeout(() => {
  console.error('time-out')
  app.exit(1)
}, 300000).unref()
require('../out/main/index.js')

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const js = (window, code) => window.webContents.executeJavaScript(code)

async function waitFor(window, expression, tries = 160) {
  for (let i = 0; i < tries; i++) {
    if (await js(window, `Boolean(${expression})`)) return true
    await wait(250)
  }
  return false
}

/** Klikt de knop waarvan de tekst dit bevat. */
const clickText = (window, text) =>
  js(
    window,
    `(() => {
       const button = [...document.querySelectorAll('button')].find((b) => b.textContent.includes(${JSON.stringify(text)}))
       if (button) button.click()
       return Boolean(button)
     })()`
  )

/** Welke stap er nu open staat, aan de stappenbalk afgelezen. */
const huidigeStap = (window) =>
  js(
    window,
    `document.querySelector('.stap[data-stand="nu"] .stapknop')?.textContent?.trim() ?? ''`
  )

app.whenReady().then(async () => {
  await wait(1200)
  const [main] = BrowserWindow.getAllWindows()
  const maat = (args[2] || '1360x900').split('x').map(Number)
  main.setSize(maat[0] || 1360, maat[1] || 900)

  let nummer = 0
  const shoot = async (name) => {
    main.showInactive()
    main.moveTop()
    await wait(300)
    /*
     * Twee keer vangen, de tweede telt.
     *
     * `capturePage` grijpt het beeld bij de eerstvolgende samenstelling, en die
     * kan later vallen dan de aanroep: de afdruk van de kaartstap liet de
     * tegels zien die pas na de afdruk werden aangezet, en twee afdrukken
     * waren daardoor tot op de byte gelijk. De eerste vangst dwingt een verse
     * samenstelling af, de tweede laat zien wat er op dat moment staat.
     */
    await main.capturePage()
    await wait(200)
    const png = (await main.capturePage()).toPNG()
    nummer += 1
    const file = join(outputDir, `modes-${String(nummer).padStart(2, '0')}-${name}.png`)
    writeFileSync(file, png)
    console.log(`${name}: ${png.length} bytes -> ${file}`)
  }

  // Verse gebruikersmap: eerst de vraag waar OMSI staat.
  if (await waitFor(main, `document.querySelector('.welkom-vel')`, 60)) {
    await clickText(main, 'Nederlands')
    await wait(500)
    await shoot('welkom')
    await js(main, `document.querySelector('.welkom-knop.primair')?.click()`)
  }

  /*
   * Bij een verse gebruikersmap staan de kaarten nog niet klaar, en dan komt
   * eerst de installatiestap. Die leggen we vast en laten we daarna uitlopen:
   * de schermen erna zijn pas eerlijk te beoordelen als de kaarten er zijn.
   */
  if (await waitFor(main, `document.querySelector('.klaarbalk')`, 20)) {
    await wait(800)
    await shoot('kaarten-klaarzetten')
    await waitFor(main, `!document.querySelector('.klaarbalk')`, 600)
  }

  // Daarna de chauffeur, en als er nog geen is: er een aanmaken.
  if (await waitFor(main, `document.querySelector('.setup')`, 80)) {
    await wait(1200)
    await shoot('chauffeur')
    const veld = `document.querySelector('.invoerveld')`
    if (await js(main, `Boolean(${veld})`)) {
      await js(
        main,
        `(() => { const i = ${veld}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'Testchauffeur'); i.dispatchEvent(new Event('input', { bubbles: true })) })()`
      )
      await wait(300)
      await js(main, `document.querySelector('.invoerknop')?.click()`)
    } else {
      await js(main, `document.querySelector('.tegel')?.click()`)
    }
  }

  /*
   * De starthub: het hoofdscherm met de drie modustegels. Hij staat buiten de
   * stappenbalk, dus hij krijgt zijn eigen afdruk en zijn eigen klik.
   */
  if (await waitFor(main, `document.querySelector('.hub-tegel')`, 40)) {
    await wait(700)
    await shoot('starthub')
    const tegel = { dienst: 1, carriere: 0, vrij: 2 }[modus] ?? 1
    await js(main, `document.querySelectorAll('.hub-tegel')[${tegel}]?.click()`)
  }

  // En daarna elke stap: afdruk, eerste keuze, hoofdknop.
  let vorige = ''
  for (let i = 0; i < 9; i++) {
    await wait(2500) // de kaart en de lijnen worden erbij gezocht
    const stap = await huidigeStap(main)
    if (!stap || stap === vorige) break
    vorige = stap
    const keuzes = await js(
      main,
      `document.querySelectorAll('.dienstrij, .tegel').length`
    )
    const naam = stap.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    console.log(`stap "${stap}": ${keuzes} keuzes`)
    await shoot(`stap-${naam}`)

    /*
     * De kaartstap kent twee vormen: de lijst en de tegels met de afbeelding
     * die OMSI zelf bij elke kaart heeft. Beide vastleggen, en daarna terug
     * naar de lijst -- de rest van de wandeling klikt op regels.
     */
    if (await js(main, `Boolean(document.querySelector('.weergavekeuze'))`)) {
      await js(main, `document.querySelectorAll('.weergavekeuze button')[1]?.click()`)
      await wait(900)
      const plaatjes = await js(
        main,
        `document.querySelectorAll('.tegel-beeld').length + '/' + document.querySelectorAll('.tegel').length`
      )
      console.log(`   tegels met een afbeelding: ${plaatjes}`)
      await shoot(`stap-${naam}-tegels`)
      /*
       * En met een kaart aangewezen: dan hoort het net ernaast te staan. Met
       * opzet de tweede tegel: de eerste staat al aangewezen, en een klik op de
       * tegel die je al hebt is de weg vooruit.
       */
      await js(main, `document.querySelectorAll('.tegel')[1]?.click()`)
      await wait(2500)
      await shoot(`stap-${naam}-tegels-gekozen`)
      await js(main, `document.querySelectorAll('.weergavekeuze button')[0]?.click()`)
      await wait(500)
    }

    /*
     * Een venstertje (de aanbevolen bus, het wagenpark) dimt het scherm
     * erachter. Dat is de stap zelf niet, dus die krijgt daarna een eigen
     * afdruk: eerst het venstertje, dan de stap eronder.
     */
    if (await js(main, `Boolean(document.querySelector('.backdrop .dialog'))`)) {
      await js(main, `document.querySelector('.dialog-actions .btn.ghost')?.click()`)
      await wait(700)
      await shoot(`stap-${naam}-zonder-venstertje`)
    }
    if (stap.toLowerCase().includes('mod')) await clickText(main, MODUSKNOP[modus] ?? 'Dienst')
    else await js(main, `document.querySelector('.dienstrij, .tegel')?.click()`)
    await wait(600)
    // De stappen gaan via de hoofdknop; op de laatste stap drukken we niet.
    const laatste = await js(
      main,
      `Boolean(document.querySelector('.startknop')?.textContent?.match(/start|klaarzet/i))`
    )
    if (laatste) {
      console.log(`laatste stap bereikt bij "${stap}"; niet gestart`)
      break
    }
    await js(main, `document.querySelector('.startknop')?.click()`)
  }

  // De staat van dienst hangt aan de naam in de stappenbalk.
  if (await js(main, `Boolean(document.querySelector('.balk-rechts .profielknop, .profielknop'))`)) {
    await js(main, `document.querySelector('.profielknop')?.click()`)
    await wait(1200)
    await shoot('staat-van-dienst')
  }

  app.exit(0)
})
