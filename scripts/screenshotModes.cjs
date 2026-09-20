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
/* Een kaart op naam, om een zware kaart te kunnen meten in plaats van de eerste. */
const kaartnaam = args[3] || ''
const MODUSKNOP = { dienst: 'Dienst', carriere: 'Carrière', vrij: 'Vrij rijden' }

app.setPath('userData', mkdtempSync(join(tmpdir(), 'omsi-enhancer-modes-')))
setTimeout(() => {
  console.error('time-out')
  app.exit(1)
}, 300000).unref()
require('../out/main/index.js')

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
/*
 * Een pagina die herlaadt weigert JavaScript, en dat is hier geen fout maar de
 * gewone gang van zaken: het bevestigen van de OMSI-map herlaadt de app met
 * opzet. Zonder deze vangst viel het hele script daar stil, midden in de
 * eerste start.
 */
const js = async (window, code) => {
  try {
    return await window.webContents.executeJavaScript(code)
  } catch {
    return undefined
  }
}

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

  /*
   * Verse gebruikersmap, en dan in deze volgorde: eerst de taal, dan een
   * chauffeur, dan de vraag waar OMSI staat, en dan het klaarzetten.
   */
  if (await waitFor(main, `document.querySelector('.taaltegel')`, 60)) {
    await wait(400)
    await shoot('taalkeuze')
    const nederlands = await js(
      main,
      `(() => {
         const knop = [...document.querySelectorAll('.taaltegel')].find((b) => b.textContent.includes('Nederlands'))
         if (knop) knop.click()
         return Boolean(knop)
       })()`
    )
    if (!nederlands) await js(main, `document.querySelector('.taaltegel')?.click()`)
    await wait(600)
  }

  // De chauffeur: bij een verse map is er nog geen, dus die maken we hier.
  if (await waitFor(main, `document.querySelector('.startnaam .invoerveld')`, 60)) {
    await wait(600)
    await shoot('chauffeur')
    await js(
      main,
      `(() => { const i = document.querySelector('.startnaam .invoerveld'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'Testchauffeur'); i.dispatchEvent(new Event('input', { bubbles: true })) })()`
    )
    await wait(400)
    await js(main, `document.querySelector('.welkom-knop.primair')?.click()`)
    await wait(1200)
  }

  /*
   * En dan pas: waar staat OMSI? Te herkennen aan het pad of aan de melding dat
   * er niets gevonden is -- niet aan de knop, want die draagt het scherm
   * hiervoor ook.
   */
  if (await waitFor(main, `document.querySelector('.welkom-pad, .welkom-hint')`, 60)) {
    await wait(500)
    await shoot('welkom')
    await js(main, `document.querySelector('.welkom-knop.primair')?.click()`)
  }

  /*
   * Bij een verse gebruikersmap staan de kaarten nog niet klaar, en dan komt
   * eerst de installatiestap. Die leggen we vast en laten we daarna uitlopen:
   * de schermen erna zijn pas eerlijk te beoordelen als de kaarten er zijn.
   */
  if (await waitFor(main, `document.querySelector('.klaarbalk')`, 120)) {
    await wait(800)
    await shoot('kaarten-klaarzetten')
    await waitFor(main, `!document.querySelector('.klaarbalk')`, 600)
  }

  // Staat er al een chauffeur (geen verse map), dan die kiezen.
  if (await waitFor(main, `document.querySelector('.setup')`, 80)) {
    await wait(1200)
    if (!(await js(main, `Boolean(document.querySelector('.hub-tegel'))`))) {
      await js(main, `document.querySelector('.dienstrij, .tegel')?.click()`)
      await wait(400)
      await js(main, `document.querySelector('.startknop')?.click()`)
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
  let overgangGeschoten = false
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
    else if (kaartnaam && /kaart|map/i.test(stap)) {
      const raak = await js(
        main,
        `(() => {
           const keuzes = [...document.querySelectorAll('.tegel, .dienstrij')]
           const goed = keuzes.find((k) => (k.textContent || '').toLowerCase().includes(${JSON.stringify(kaartnaam.toLowerCase())}))
           if (goed) goed.click()
           return Boolean(goed)
         })()`
      )
      console.log(`   kaart "${kaartnaam}": ${raak ? 'gekozen' : 'niet gevonden, eerste genomen'}`)
      if (!raak) await js(main, `document.querySelector('.dienstrij, .tegel')?.click()`)
    } else await js(main, `document.querySelector('.dienstrij, .tegel')?.click()`)
    await wait(600)
    /*
     * De route tekent zichzelf van begin naar eind. Hier staat of de stukken
     * werkelijk achter elkaar beginnen: de vertraging hoort op te lopen en het
     * laatste stuk hoort rond de tekentijd te eindigen.
     */
    if (await js(main, `Boolean(document.querySelector('.route-intekenen .route-line'))`)) {
      const plan = await js(
        main,
        `(() => {
           const lijnen = [...document.querySelectorAll('.route-intekenen .route-line')]
           const uit = lijnen.map((l) => {
             const s = getComputedStyle(l)
             return { start: parseFloat(s.animationDelay), duur: parseFloat(s.animationDuration) }
           })
           const oplopend = uit.every((v, i) => i === 0 || v.start >= uit[i - 1].start - 0.001)
           const eind = Math.max(...uit.map((v) => v.start + v.duur))
           return uit.length + ' stukken, oplopend: ' + oplopend +
             ', laatste klaar na ' + Math.round(eind * 1000) + ' ms'
         })()`
      )
      console.log(`   route tekenen: ${plan}`)

      /*
       * En hoe zwaar is die kaart als je hem versleept? Een klacht van Luc:
       * "wanneer ik een dienst geselecteerd heb is de kaart erg laggy". Hier
       * staat wat de tekening kost: hoeveel elementen erin staan, en hoeveel
       * beelden per seconde er overblijven terwijl je sleept.
       */
      const zwaarte = await js(
        main,
        `(async () => {
           const svg = document.querySelector('.route-canvas')
           const doel = svg?.parentElement
           if (!doel) return 'geen kaart'
           const telling = {
             elementen: svg.querySelectorAll('*').length,
             lijnen: svg.querySelectorAll('polyline').length,
             tekst: svg.querySelectorAll('text').length,
             groepen: svg.querySelectorAll('g').length
           }
           const r = doel.getBoundingClientRect()
           const x = r.x + r.width / 2
           const y = r.y + r.height / 2
           const maak = (soort, px, py) =>
             new PointerEvent(soort, { pointerId: 3, isPrimary: true, bubbles: true, clientX: px, clientY: py, buttons: soort === 'pointerup' ? 0 : 1 })
           const beelden = []
           let vorig = performance.now()
           let loopt = true
           const tel = () => {
             const nu = performance.now()
             beelden.push(nu - vorig)
             vorig = nu
             if (loopt) requestAnimationFrame(tel)
           }
           requestAnimationFrame(tel)
           doel.dispatchEvent(maak('pointerdown', x, y))
           for (let i = 1; i <= 36; i++) {
             doel.dispatchEvent(maak('pointermove', x + Math.sin(i / 4) * 140, y + i * 4))
             await new Promise((k) => setTimeout(k, 16))
           }
           doel.dispatchEvent(maak('pointerup', x, y + 144))
           loopt = false
           await new Promise((k) => setTimeout(k, 120))
           const netto = beelden.slice(2)
           const gem = netto.reduce((a, b) => a + b, 0) / (netto.length || 1)
           return JSON.stringify({
             ...telling,
             beelden: netto.length,
             perSeconde: Math.round(1000 / gem),
             langste: Math.round(Math.max(...netto)),
             traag: netto.filter((d) => d > 33).length
           })
         })()`
      )
      console.log(`   kaart slepen: ${zwaarte}`)
    }

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
    /*
     * Het venster dat bij Verder over het scherm komt, met de bus erin. Eén
     * afdruk is genoeg -- hij is bij elke stap hetzelfde -- maar de melding
     * komt bij elke stap, zodat je ziet dat hij overal afgaat.
     */
    const monster = `(() => {
      const venster = document.querySelector('.busvenster')
      const b = document.querySelector('.busrit svg')
      if (!venster || !b)
        return 'weg (vel=' + Boolean(document.querySelector('.setup')) +
          ', vensters=' + document.querySelectorAll('.busvenster').length +
          ', laden=' + Boolean(document.querySelector('.main h1')) + ')'
      const r = b.getBoundingClientRect()
      const s = getComputedStyle(b)
      return 'dekking ' + (+getComputedStyle(venster).opacity).toFixed(2) +
        ', bus x=' + Math.round(r.x) + ' y=' + Math.round(r.y) +
        ' ' + Math.round(r.width) + 'x' + Math.round(r.height) +
        ' kleur=' + s.color + ' lijn=' + s.stroke + '/' + s.strokeWidth +
        ' vul=' + s.fill + ' dek=' + s.opacity + ' zicht=' + s.visibility +
        ' kinderen=' + b.children.length
    })()`
    const metingen = []
    for (const tel of [120, 200, 200, 200]) {
      await wait(tel)
      metingen.push(await js(main, monster))
      /* Eén afdruk terwijl hij rijdt; hij is bij elke stap dezelfde. */
      if (!overgangGeschoten && metingen.length === 1 && metingen[0] !== 'weg') {
        overgangGeschoten = true
        await shoot('overgang')
      }
    }
    console.log(`   overgang: ${metingen.join(' | ')}`)
  }

  /*
   * De remise: die zit achter de busstap -- een bus kiezen brengt je er
   * meteen heen. Hier hoort de knop "wagenpark toevoegen" altijd te staan,
   * ook als er niets te halen valt; dan uitgeschakeld met de reden erbij.
   */
  for (let i = 0; i < 3; i++) {
    if (await js(main, `Boolean(document.querySelector('.kruimels'))`)) {
      const remise = await js(
        main,
        `Boolean([...document.querySelectorAll('.kruimel-hier')].some((k) => /remise|depot|dépôt/i.test(k.textContent || '')))`
      )
      if (remise) break
    }
    await js(main, `document.querySelector('.tegel:not([disabled])')?.click()`)
    await wait(1500)
  }
  if (await js(main, `Boolean(document.querySelector('.tegel'))`)) {
    const stand = await js(
      main,
      `(() => {
         const tegels = [...document.querySelectorAll('.tegel')]
         const knop = tegels.find((k) => /toevoegen|add|hinzuf|ajouter/i.test(k.textContent || ''))
         return JSON.stringify({
           tegels: tegels.length,
           knopAanwezig: Boolean(knop),
           knopUit: knop ? knop.disabled : null,
           onder: knop ? (knop.querySelector('.tegel-onder')?.textContent || '').slice(0, 60) : ''
         })
       })()`
    )
    console.log(`   remise: ${stand}`)
    /* En de knop in de knoppenrij, die op elk busscherm hoort te staan. */
    const knoppen = await js(
      main,
      `JSON.stringify([...document.querySelectorAll('.tweedeknop')].map((b) => b.textContent.trim()))`
    )
    console.log(`   knoppenrij: ${knoppen}`)
    await shoot('remise')
  }

  // De staat van dienst hangt aan de naam in de stappenbalk.
  if (await js(main, `Boolean(document.querySelector('.balk-rechts .profielknop, .profielknop'))`)) {
    await js(main, `document.querySelector('.profielknop')?.click()`)
    await wait(1200)
    await shoot('staat-van-dienst')
  }

  app.exit(0)
})
