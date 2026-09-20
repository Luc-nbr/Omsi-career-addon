/**
 * Schermafdruk van het opzetscherm, op de maten van de goedgekeurde afbeelding.
 *
 *   npx electron scripts/schermafdruk-opzet.cjs [kaartmap] [uitvoerbestand]
 *
 * De bouwcontrole van impeccable legt een afdruk van de echte app naast de
 * goedgekeurde afbeelding (1344 bij 752). Daarvoor moet de app in de juiste
 * stand staan: een profiel aangemaakt, een kaart gekozen, diensten opgehaald.
 * Die stappen doet deze proef, zonder OMSI en met een eigen map met
 * gebruikersgegevens, zodat het exemplaar van Luc er niets van merkt.
 *
 * Met --licht komt het scherm in de lichte stand; zo zijn beide standen te
 * vergelijken zonder dat er iets in de code hoeft te veranderen.
 */
const { app, BrowserWindow } = require('electron')
const { mkdtempSync, mkdirSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { dirname, join } = require('node:path')

const args = process.argv.slice(
  process.argv.findIndex((arg) => arg.endsWith('schermafdruk-opzet.cjs')) + 1
)
const vlaggen = args.filter((arg) => arg.startsWith('--'))
const gewoon = args.filter((arg) => !arg.startsWith('--'))
const mapFolder = gewoon[0] || 'Grundorf'
const uit = gewoon[1] || join(__dirname, '..', '.impeccable', 'review', 'hero-repro.png')
const licht = vlaggen.includes('--licht')
const stapVlag = vlaggen.find((v) => v.startsWith('--stap='))
const stap = stapVlag ? stapVlag.slice('--stap='.length) : 'duty'
const merkVlag = (vlaggen.find((v) => v.startsWith('--merk=')) || '').slice('--merk='.length)
const maatVlag = vlaggen.find((v) => v.startsWith('--maat='))
const [breed, hoog] = maatVlag
  ? maatVlag.slice('--maat='.length).split('x').map(Number)
  : [1344, 752]

app.setPath('userData', mkdtempSync(join(tmpdir(), 'omsi-opzet-')))
setTimeout(() => {
  console.error('time-out')
  app.exit(1)
}, 240000).unref()
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

/** Een select vullen zoals een mens dat doet, zodat React het merkt. */
const kiesIn = (kiezer, waarde) =>
  `(() => {
    const el = document.querySelector(${JSON.stringify(kiezer)});
    if (!el) return false;
    const zet = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    zet.call(el, ${JSON.stringify(waarde)});
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`

app.whenReady().then(async () => {
  await wait(1200)
  const [main] = BrowserWindow.getAllWindows()

  // Het venster op de maat van de afbeelding; de vergelijking rekent in pixels.
  main.setContentSize(breed, hoog)
  await wait(400)

  /*
   * De app begint met de vraag waar OMSI staat, want deze proef draait met een
   * eigen map met gebruikersgegevens en daar is nog niets bevestigd. Met
   * --wizard leggen we dat scherm vast; anders bevestigen we de vondst en gaan
   * we door, net als een speler bij zijn eerste start.
   */
  if (await waitFor(main, `document.querySelector('.welkom')`, 60)) {
    /*
     * Met --taal=de het scherm in het Duits; dat is de langste taal die de app
     * kent en dus de toets of lange teksten netjes schalen.
     */
    const taalVlag = (vlaggen.find((v) => v.startsWith('--taal=')) || '').slice('--taal='.length)
    if (taalVlag) {
      await js(
        main,
        `(() => {
          const knop = [...document.querySelectorAll('.welkom-talen button')]
            .find((b) => (b.getAttribute('aria-label') || '').toLowerCase().startsWith(${JSON.stringify(taalVlag === 'de' ? 'deutsch' : taalVlag)}));
          if (knop) knop.click();
          return Boolean(knop);
        })()`
      )
      await wait(700)
    }
    if (vlaggen.includes('--wizard')) {
      const pad = await js(main, `document.querySelector('.welkom-pad')?.textContent ?? ''`)
      console.log(`gevonden map: ${pad || 'GEEN'}`)
      mkdirSync(dirname(uit), { recursive: true })
      await main.capturePage()
      await wait(800)
      writeFileSync(uit, (await main.capturePage()).toPNG())
      const knop = await js(
        main,
        `JSON.stringify((() => {
          const b = document.querySelector('.welkom-knop.primair');
          const r = b.getBoundingClientRect();
          return { tekst: b.textContent.trim(), breedte: Math.round(r.width), hoogte: Math.round(r.height), regels: Math.round(r.height / parseFloat(getComputedStyle(b).lineHeight || '20')) };
        })())`
      )
      console.log(`hoofdknop: ${knop}`)
      console.log(`afdruk: ${uit}`)
      app.exit(0)
      return
    }
    await js(main, `document.querySelector('.welkom-knop.primair')?.click()`)
    // Na het bevestigen laadt de pagina opnieuw; dat duurt even.
    await wait(3000)
  }

  /*
   * Bij een verse gegevensmap is er nog geen chauffeur, en dan staat het
   * invulveld van stap een al open. Even een naam invullen en bevestigen.
   */
  if (await waitFor(main, `document.querySelector('.setup .invoerveld')`, 40)) {
    await js(
      main,
      `(() => { const i = document.querySelector('.setup .invoerveld'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'Test'); i.dispatchEvent(new Event('input', { bubbles: true })) })()`
    )
    await wait(300)
    await js(main, `document.querySelector('.setup .invoerknop')?.click()`)
    await wait(1200)
  }

  /*
   * De app opent op de chauffeurstap van hetzelfde scherm. Welke stap actief is
   * hangt ervan af of er al een profiel was, dus kijken we het na in plaats van
   * blind door te klikken.
   */
  const actieveStap = () =>
    js(main, `document.querySelector('.setup .stap[data-stand="nu"]')?.textContent?.trim() ?? ''`)

  await waitFor(main, `document.querySelector('.setup .dienstrij')`, 80)
  const vroeg = stap === 'profile' || stap === 'mode'
  for (let poging = 0; poging < 6 && !vroeg; poging++) {
    const nu = (await actieveStap()).toLowerCase()
    if (nu.startsWith('map') || nu.startsWith('karte') || nu.startsWith('kaart')) break
    if (nu.startsWith('mode') || nu.startsWith('modus')) {
      // De dienstmodus is de tweede regel; de eerste is de loopbaan.
      await js(main, `[...document.querySelectorAll('.setup .dienstrij')][1]?.click()`)
      await wait(400)
    }
    await js(main, `document.querySelector('.setup .startknop')?.click()`)
    await wait(1200)
  }

  /*
   * Het welkomstscherm maakt meteen een chauffeur aan en springt naar de modus,
   * dus voor de eerste twee stappen klikken we in de balk terug -- precies zoals
   * een speler dat ook zou doen.
   */
  if (vroeg) {
    const woord = stap === 'profile' ? 'profile' : 'mode'
    await js(
      main,
      `(() => {
        const knop = [...document.querySelectorAll('.setup .stapknop')].find(
          (b) => b.textContent.trim().toLowerCase().startsWith(${JSON.stringify(woord)})
        );
        if (knop && !knop.disabled) knop.click();
        return Boolean(knop);
      })()`
    )
    await wait(1200)
  }

  // Het opzetscherm staat er meteen, op de kaartstap.
  if (
    !vroeg &&
    !(await waitFor(main, `document.querySelector('.setup .dienstrij, .setup .tegel')`, 80))
  ) {
    console.error('het opzetscherm kwam niet; op het scherm stond:')
    console.error(await js(main, `document.body.innerText.slice(0, 400)`))
    app.exit(1)
    return
  }

  // De kaart aanklikken in de lijst, op naam.
  const gekozen = vroeg ? 'n.v.t.' : await js(
    main,
    `(() => {
      const rij = [...document.querySelectorAll('.setup .dienstrij')].find((b) =>
        b.textContent.includes(${JSON.stringify(mapFolder.replace('-', '-'))}) ||
        b.textContent.toLowerCase().includes(${JSON.stringify(mapFolder.toLowerCase().split(/[-_ ]/)[0])})
      );
      if (rij) rij.click();
      return rij ? rij.textContent.trim() : null;
    })()`
  )
  if (!gekozen) {
    console.error('die kaart staat niet in de lijst')
    app.exit(1)
    return
  }
  await wait(1500)

  if (licht) await js(main, `document.documentElement.dataset.thema = 'licht'`)

  /*
   * Het opzetscherm staat er nu meteen, op de kaartstap. Doorklikken met de
   * hoofdknop brengt je langs lijn, dienst en bus.
   */
  /*
   * Doorklikken tot de gevraagde stap actief is, en niet een vast aantal keer.
   * Welke stappen er zijn hangt van de modus af -- in dienst en carriere kiest
   * de app de lijn zelf en staat die stap er niet -- en met een vast aantal
   * klikken schoot de proef er dan overheen, tot aan START toe.
   */
  const woordVan = {
    map: ['map', 'karte', 'kaart', 'carte'],
    line: ['line', 'linie', 'lijn', 'ligne'],
    duty: ['duty', 'dienst', 'service'],
    bus: ['bus']
  }
  const opStap = async (naam) => {
    const nu = (await actieveStap()).toLowerCase()
    return (woordVan[naam] ?? []).some((woord) => nu.startsWith(woord))
  }
  for (let i = 0; i < 6 && !vroeg; i++) {
    if (await opStap(stap)) break
    const was = await actieveStap()
    await waitFor(main, `document.querySelector('.setup .startknop:not([disabled])')`, 200)
    await js(main, `document.querySelector('.setup .startknop')?.click()`)
    // De lijnstap laat de kaart opnieuw tekenen; dat duurt het langst.
    await wait(was.toLowerCase().startsWith('line') ? 8000 : 2500)
  }

  if (!(await waitFor(main, `document.querySelector('.setup .dienstrij, .setup .tegel')`, 200))) {
    const tekst = await js(main, `document.body.innerText.slice(0, 300)`)
    console.error('het opzetscherm kwam niet; op het scherm stond:')
    console.error(tekst)
    app.exit(1)
    return
  }

  // De kaart tekent zichzelf pas als de tegels gelezen zijn.
  await waitFor(main, `document.querySelector('.setup-kaart svg, .setup-kaart canvas')`, 200)
  await wait(2500)

  /*
   * Met --hof door de vier niveaus heen klikken: merk, type, uitvoering, en dan
   * staat de remise er vanzelf.
   */
  if (vlaggen.includes('--hof') || merkVlag) {
    /*
     * Met --merk=<tekst> een bepaald merk kiezen in plaats van het eerste. De
     * vraag over het wagenpark komt alleen bij een bus die de kaart niet kent,
     * en dat is nooit het eerste merk in de lijst.
     */
    if (merkVlag) {
      const raak = await js(
        main,
        `(() => {
          const wens = ${JSON.stringify(merkVlag.toLowerCase())};
          const t = [...document.querySelectorAll('.setup .tegel')]
            .find((el) => el.textContent.toLowerCase().includes(wens));
          if (!t) return '';
          const naam = t.textContent;
          t.click();
          return naam;
        })()`
      )
      console.log(`merk: ${raak || 'NIET GEVONDEN'}`)
      await wait(900)
      for (let i = 0; i < 2; i++) {
        await js(main, `document.querySelector('.setup .tegel')?.click()`)
        await wait(900)
      }
    } else {
      for (let i = 0; i < 3; i++) {
        await js(main, `document.querySelector('.setup .tegel')?.click()`)
        await wait(900)
      }
    }
    // De vraag over het wagenpark komt na een rondje langs het hoofdproces.
    await wait(1500)
  }

  /*
   * Met --overzetten het scherm waarin de app aanbiedt wagenparken naar andere
   * bussen te zetten. Dat is de tweede knop op het merkenscherm; hij staat er
   * alleen als er werkelijk bussen zijn die de kaart niet kennen.
   */
  if (vlaggen.includes('--overzetten')) {
    const gelukt = await js(
      main,
      `(() => { const b = document.querySelector('.setup .tweedeknop'); if (!b) return false; b.click(); return true })()`
    )
    if (!gelukt) console.error('geen tweede knop op het merkenscherm')
    // Wachten tot de lijst er werkelijk staat; anders legt capturePage nog het vorige beeld vast.
    await waitFor(main, `document.querySelector('.setup .dienstrij')`, 60)
    await wait(1500)
  }

  /*
   * Met --rijdend het scherm ná START vastleggen, zonder OMSI te starten: we
   * vervangen de aanroep die het spel opstart door een antwoord dat zegt "het
   * staat klaar maar de plugin meldt zich nog niet". Daarmee doorloopt het
   * scherm precies dezelfde toestand als in het echt.
   */
  if (vlaggen.includes('--rijdend')) {
    await js(
      main,
      `(() => {
        window.career.beginDuty = async () => ({ connected: false, running: false, prepared: { timetableSet: true } });
        /*
         * De bewaker kijkt elke vijf seconden of de dienst is uitgereden en
         * rondt hem dan af. Bij deze nepdienst ligt de eindtijd al in het
         * verleden, dus dat gebeurt meteen -- vandaar ook deze stille versie.
         */
        window.career.checkSession = async () => ({ dutyComplete: false, drivenKm: 0, elapsedMinutes: 0 });
        return true;
      })()`
    )
    /*
     * Doorklikken tot de bus gekozen is. Een vast aantal klikken werkte niet
     * meer sinds de buskeuze drie niveaus diep is en daarna nog een remisestap
     * kent: dan klikt de proef de ene keer te weinig en de andere keer op iets
     * wat er niet is. Nu klikt hij zolang er tegels liggen, en meldt waar hij
     * blijft steken als de startknop uit blijft.
     */
    for (let i = 0; i < 6; i++) {
      const klaar = await js(
        main,
        `Boolean(document.querySelector('.setup .startknop:not([disabled])')) &&
         !document.querySelector('.setup .tegel')`
      )
      if (klaar) break
      const geklikt = await js(
        main,
        `(() => { const t = document.querySelector('.setup .tegel'); if (!t) return ''; const n = t.textContent; t.click(); return n })()`
      )
      console.log(`   klik ${i + 1}: ${geklikt || '(geen tegel)'}`)
      await wait(900)
    }
    const kopVoor = await js(main, `document.querySelector('.veltitel')?.textContent ?? ''`)
    console.log(`voor START: ${kopVoor}`)
    await js(main, `document.querySelector('.setup .startknop')?.click()`)
    /*
     * Wachten tot het scherm werkelijk om is. Op een vaste pauze vertrouwen gaf
     * een afdruk van de busstap terwijl de app al reed: capturePage levert dan
     * nog het vorige beeld.
     */
    await waitFor(main, `document.querySelector('.setup .rijdend, .setup .dialog')`, 60)
    // De kaart komt opnieuw ter wereld als het scherm omslaat; even wachten tot hij er is.
    await waitFor(main, `document.querySelector('.setup-kaart svg, .setup-kaart canvas')`, 80)
    await wait(2000)

    /*
     * Meteen vastleggen. De bewaker die kijkt of een dienst is uitgereden ziet
     * bij deze nepdienst een eindtijd die al voorbij is en rondt hem af; dat is
     * gedrag van de proef, niet van het scherm.
     */
    /*
     * Met --meet kijken wat het hoofdvenster werkelijk doet terwijl het
     * rijdende scherm staat.
     *
     * NIET MET requestAnimationFrame. Dat was de eerste poging, en die telt de
     * klok van het beeldscherm: 144 tikken per seconde, of er nu iets getekend
     * wordt of niet. Het zegt dus niets over kosten.
     *
     * Chromium houdt zelf bij hoeveel beelden hij heeft samengesteld en hoeveel
     * tijd er in opmaak, stijl en script ging. Dat is wat we willen weten, en
     * het komt via de debugger eruit.
     */
    if (vlaggen.includes('--meet')) {
      try {
        main.webContents.debugger.attach('1.3')
        await main.webContents.debugger.sendCommand('Performance.enable')
        const lees = async () => {
          const { metrics } = await main.webContents.debugger.sendCommand('Performance.getMetrics')
          return Object.fromEntries(metrics.map((m) => [m.name, m.value]))
        }
        const voor = await lees()
        await wait(5000)
        const na = await lees()
        const verschil = (naam) => +(na[naam] - voor[naam]).toFixed(3)
        console.log(
          `kosten hoofdvenster over 5 s: ` +
            JSON.stringify({
              beelden: verschil('Frames'),
              opmaak: verschil('LayoutCount'),
              stijl: verschil('RecalcStyleCount'),
              scriptS: verschil('ScriptDuration'),
              opmaakS: verschil('LayoutDuration'),
              stijlS: verschil('RecalcStyleDuration')
            })
        )
        main.webContents.debugger.detach()
      } catch (reden) {
        console.log(`meten lukte niet: ${reden}`)
      }
    }

    mkdirSync(dirname(uit), { recursive: true })
    // Twee keer; de eerste opname is geregeld nog het vorige beeld.
    await main.capturePage()
    await wait(1000)
    writeFileSync(uit, (await main.capturePage()).toPNG())
    const kopNu = await js(main, `document.querySelector('.veltitel')?.textContent ?? ''`)
    const wacht = await js(main, `Boolean(document.querySelector('.setup .dialog'))`)
    console.log(`kop tijdens het rijden: ${kopNu}`)
    console.log(`wachtvenster in beeld: ${wacht ? 'ja' : 'nee'}`)
    console.log(`afdruk: ${uit}`)
    app.exit(0)
    return
  }

  /*
   * Met --lengte=<index> de schuif verzetten en kijken of er werkelijk andere
   * diensten komen. De schuif hoort de generator opnieuw te laten zoeken; deed
   * hij dat niet, dan bleef de lijst staan en leek de knop stuk.
   */
  /*
   * Met --dagdeel=<n> het zoveelste dagdeel aanklikken en kijken of er andere
   * diensten komen. De vertrektijden horen dan in dat venster te vallen.
   */
  const dagdeelVlag = vlaggen.find((v) => v.startsWith('--dagdeel='))
  if (dagdeelVlag) {
    const tijden = () =>
      js(
        main,
        `[...document.querySelectorAll('.setup .dienstrij')].map((r) => r.children[1]?.textContent?.trim()).join(', ')`
      )
    const voor = await tijden()
    const naam = await js(
      main,
      `(() => {
        const knoppen = [...document.querySelectorAll('.regelaar-chips button')];
        const k = knoppen[${JSON.stringify(Number(dagdeelVlag.slice('--dagdeel='.length)))}];
        if (!k) return '';
        const n = k.textContent;
        k.click();
        return n;
      })()`
    )
    await wait(7000)
    const na = await tijden()
    console.log(`dagdeel: ${naam || 'NIET GEVONDEN'}`)
    console.log(`vertrek voor: ${voor}`)
    console.log(`vertrek na:   ${na}`)
    console.log(`veranderd:    ${voor === na ? 'NEE' : 'ja'}`)
  }

  const lengteVlag = vlaggen.find((v) => v.startsWith('--lengte='))
  if (lengteVlag) {
    const voor = await js(
      main,
      `[...document.querySelectorAll('.setup .dienstduur')].map((el) => el.textContent.trim()).join(', ')`
    )
    await js(
      main,
      `(() => {
        const schuif = document.getElementById('dienstlengte');
        if (!schuif) return false;
        const zetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        zetter.call(schuif, ${JSON.stringify(lengteVlag.slice('--lengte='.length))});
        schuif.dispatchEvent(new Event('input', { bubbles: true }));
        schuif.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()`
    )
    await wait(6000)
    const na = await js(
      main,
      `[...document.querySelectorAll('.setup .dienstduur')].map((el) => el.textContent.trim()).join(', ')`
    )
    console.log(`duur voor:  ${voor}`)
    console.log(`duur na:    ${na}`)
    console.log(`veranderd:  ${voor === na ? 'NEE' : 'ja'}`)
  }

  const actief = await js(
    main,
    `document.querySelector('.setup .stap[data-stand="nu"]')?.textContent?.trim() ?? '?'`
  )
  console.log(`actieve stap: ${actief} (gevraagd: ${stap})`)
  const thema = await js(
    main,
    `JSON.stringify({ attr: document.documentElement.dataset.thema ?? null, radius: getComputedStyle(document.querySelector('.setup')).getPropertyValue('--radius').trim(), grond: getComputedStyle(document.querySelector('.setup')).getPropertyValue('--grond').trim(), weg: getComputedStyle(document.documentElement).getPropertyValue('--weg-1').trim() })`
  )
  console.log(`thema: ${thema}`)
  const knop = await js(
    main,
    `(() => {
      const k = document.querySelector('.setup .startknop');
      const b = document.querySelector('.setup .setup-stappen');
      const st = getComputedStyle(k);
      return JSON.stringify({
        knopRechts: Math.round(window.innerWidth - k.getBoundingClientRect().right),
        balkRechts: Math.round(window.innerWidth - b.getBoundingClientRect().right),
        breedte: Math.round(k.getBoundingClientRect().width),
        cssRight: st.right,
        cssWidth: st.width,
        venster: window.innerWidth
      });
    })()`
  )
  console.log(`knop: ${knop}`)
  const aantal = await js(
    main,
    `document.querySelectorAll('.setup .dienstrij, .setup .tegel').length`
  )
  const titel = await js(main, `document.querySelector('.veltitel')?.textContent ?? ''`)
  const lijn = await js(main, `document.querySelector('.lijnplaatje')?.textContent ?? ''`)

  mkdirSync(dirname(uit), { recursive: true })
  /*
   * Twee keer vastleggen en de eerste weggooien.
   *
   * capturePage levert op dit venster geregeld nog het vorige beeld: de DOM
   * zei al "Destination files" terwijl de afdruk de buslijst liet zien. Een
   * tweede opname na een tel geeft wel wat er staat.
   */
  await main.capturePage()
  await wait(1000)
  const beeld = await main.capturePage()
  writeFileSync(uit, beeld.toPNG())
  const maat = beeld.getSize()

  console.log(`kaart: ${mapFolder}${licht ? ' (lichte stand)' : ''}`)
  console.log(`lijnplaatje: ${lijn || 'LEEG'}`)
  console.log(`kop: ${titel}`)
  console.log(`diensten in de lijst: ${aantal}`)
  console.log(`afdruk: ${uit} (${maat.width}x${maat.height})`)
  app.exit(aantal > 0 ? 0 : 1)
})
