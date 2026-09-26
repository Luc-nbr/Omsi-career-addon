/**
 * Het nagebouwde scherm van een apparaat IN DE OVERLAY, van begin tot eind.
 *
 *   npx electron scripts/probe-overlayscherm.cjs [uitvoermap]
 *
 * scripts/probe-apparaatscherm.cjs tekent het scherm in een los pagina'tje met
 * een nep-vorm, en scripts/probe-schermvorm.ts bouwt de vorm zonder app. Wat
 * geen van beide doet, is de weg die het in het spel aflegt: de plugin geeft
 * getallen door, het hoofdproces bouwt de vorm uit de echte model.cfg van de
 * bus, zet de plaatjes in zijn register, en de overlay haalt de vorm op via IPC
 * en de plaatjes via `omsischerm://`, binnen de CSP van overlay.html. Een fout
 * in één van die schakels -- een plaatje dat de CSP tegenhoudt, een protocol
 * dat niet geregistreerd staat, een vorm-id die de overlay niet kan ophalen --
 * valt in de losse proeven niet op.
 *
 * Wat er nagerekend wordt, met de ALMEX van de Hamburgse stadsbus:
 * - met een plugin van versie 13 en getallen erbij verschijnt het getekende
 *   scherm en niet meer het nagemeten vlak;
 * - het canvas heeft een beeld, en elk plaatje dat het vraagt komt aan (geen
 *   fout in de console, geen weigering door de CSP);
 * - de klok van de bus staat erop, in het lettertype van OMSI (nagegaan aan de
 *   hand van de beeldpunten waar de klok hoort, niet aan de tekst);
 * - de knoppen van het menu liggen als aanraakvlakken op het scherm;
 * - een ander menu (almex_menu) wisselt het beeld.
 *
 * Er wordt niets van de gebruiker aangeraakt: een kopie van de gebruikersmap,
 * een eigen live.json, en de server alleen op 127.0.0.1. OMSI wordt alleen
 * gelezen -- de model.cfg, de .o3d-bestanden, de texturen en de lettertypen.
 */
const { app, BrowserWindow, ipcMain } = require('electron')
const { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, utimesSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const http = require('node:http')

const uitvoer = process.argv.slice(2).find((a) => !a.startsWith('-') && !a.endsWith('.cjs'))
if (uitvoer) require('node:fs').mkdirSync(uitvoer, { recursive: true })
const NUMMER = '123456'
const PINCODE = '9876'

/** Een POST naar de eigen server van de app, zoals de telefoon hem doet. */
function post(url, lijf) {
  return new Promise((klaar) => {
    const v = http.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } }, (a) => {
      let t = ''
      a.on('data', (d) => (t += d))
      a.on('end', () => klaar(t))
    })
    v.on('error', () => klaar(''))
    v.write(JSON.stringify(lijf))
    v.end()
  })
}

/** De bus waar de proef mee rekent, en waar zijn ALMEX op reageert. */
const BUS = {
  naam: 'Stadtbus 2017',
  model: 'Model/model_17_solo.cfg',
  pad: 'Vehicles/HH_Stadtbus2017/',
  bestand: ''
}
let GETALLEN = { almex_menu: 0, trans_dauer: 1 }
const VARS = {
  almex_s_uhrzeit: '13:45',
  almex_s_ziel: '  5 WEDEL',
  almex_s_hst1: 'ALTONA',
  almex_s_hst2: 'BAHRENFELD',
  almex_s_bubble1: 'EINZEL 2,40',
  almex_s_bubble2: 'KURZ  1,70'
}

const map = mkdtempSync(join(tmpdir(), 'omsi-apparaat-'))
const bron = join(process.env.APPDATA, 'omsi-enhancer')
cpSync(join(bron, 'settings.json'), join(map, 'settings.json'))
cpSync(join(bron, 'profiles'), join(map, 'profiles'), { recursive: true })
const inst = JSON.parse(readFileSync(join(map, 'settings.json'), 'utf8'))
inst.tourSeen = true
delete inst.busmodules
delete inst.apparaatSleutel
delete inst.apparaatPoort
writeFileSync(join(map, 'settings.json'), JSON.stringify(inst, null, 2))
for (const naam of readdirSync(join(map, 'profiles')).filter((n) => n.endsWith('.json') && n !== 'active.json')) {
  const pad = join(map, 'profiles', naam)
  const p = JSON.parse(readFileSync(pad, 'utf8'))
  p.personeelsnummer = NUMMER
  p.pincode = PINCODE
  writeFileSync(pad, JSON.stringify(p, null, 2))
}
const live = join(mkdtempSync(join(tmpdir(), 'omsi-apparaat-live-')), 'OMSI Career')
mkdirSync(live, { recursive: true })
process.env.OMSI_ENHANCER_LIVEMAP = live
process.env.OMSI_ENHANCER_APPARAAT_HOST = '127.0.0.1'
process.env.OMSI_ENHANCER_PROEFPROCES = 'GeenOmsiProef'
app.setPath('userData', map)
setTimeout(() => app.exit(1), 120000).unref()
require('../out/main/index.js')
const wacht = (ms) => new Promise((r) => setTimeout(r, ms))
const js = (w, code) => w.webContents.executeJavaScript(code)
app.on('window-all-closed', () => {})
app.on('browser-window-created', (_e, w) => {
  if (w.webContents.isOffscreen()) return
  w.show = () => {}
  w.showInactive = () => {}
  w.hide()
})

app.whenReady().then(async () => {
  ipcMain.removeHandler('plugin:status')
  ipcMain.handle('plugin:status', () => ({ installed: true, upToDate: true, changed: false, target: '' }))
  await wacht(2500)
  const hoofd = BrowserWindow.getAllWindows()[0]
  const dienst = (await js(hoofd, `window.career.career().then((p) => p.state?.activeDuty?.assignment?.duty)`)) ?? {
    mapFolder: 'Hamburg', mapName: 'Hamburg', lineFile: '5.ttp', tourNumber: '3', depot: '',
    legs: [{
      tripFile: 'a', lineFile: '5.ttp', lineNumber: '5', terminus: 'Wedel', departure: 480,
      arrival: 520, minutes: 40, tourNumber: '3', switchInOmsi: false, layoverBefore: 0,
      stops: ['Altona', 'Bahrenfeld', 'Wedel'], stopIds: ['1', '2', '3'], stopTimes: [480, 500, 520]
    }],
    signOn: 470, start: 480, end: 640, durationMinutes: 160, totalStops: 3,
    lineNumbers: ['5'], days: 0, period: 0
  }
  const rit = dienst.legs[0]
  const schrijfLive = () => writeFileSync(join(live, 'live.json'), JSON.stringify({
    alive: true, seen: 8388607, seenSys: 63, seenStr: 63, strKind: 1, plugin: 13,
    time: 49500, day: 1, month: 7, year: 2026, velocity: 0, passengers: 6,
    scheduleActive: 1, targetIndex: 0, tankPercent: 0.7, km: 0, metres: 0,
    busstopIndex: 2, busstop: rit.stops[2] ?? '', line: rit.lineNumber, terminus: rit.terminus,
    matrix: '', delayMin: '', delaySec: '', entryRequest: 0, exitRequest: 0, ticket: -1,
    entryOpen: 0, exitOpen: 0, atStation: 0, brightness: 0.5, streetCond: 0, precipRate: 0,
    precipType: 0, lightsLow: 1, blinkerLeft: 0, blinkerRight: 0, brakeLight: 0, engineOn: 1,
    maxBrake: 0, maxAccel: 0, topSpeed: 0, harshBrakes: 0, harshAccels: 0, battery: 0,
    temperature: 0, collisions: 0, collisionEnergy: 0, worstCollision: 0, exeVersion: '2.3.004',
    bus: BUS, vars: VARS,
    /*
     * De getallen die de vorm nodig heeft. almex_menu kiest welk menu er
     * aanstaat; trans_dauer schuift de regels van menu 26 op hun plek (zie
     * core/schermvorm.ts). Met getalAantal > 0 weet het hoofdproces dat de
     * plugin getallen levert, en valt het nagemeten vlak weg.
     */
    getallen: GETALLEN, getalAantal: Object.keys(GETALLEN).length,
    ibis: { bestemming: '', lijn: '', lawo1: '', lawo2: '', lawo3: '', lawo4: '', afr1: '', afr2: '' },
    mem: { ok: 0 }
  }))
  schrijfLive()
  writeFileSync(join(live, 'schermen.json'), JSON.stringify({
    bus: BUS.naam, model: BUS.model, pad: BUS.pad, bestand: '', aantal: Object.keys(VARS).length, vars: VARS
  }))
  setInterval(() => { const nu = new Date(); utimesSync(join(live, 'live.json'), nu, nu) }, 2000).unref()

  await js(hoofd, `window.career.setOverlay(${JSON.stringify(dienst)}, true)`)
  await wacht(1500)
  /* Aanmelden en de dienst aannemen; anders staat de telefoon op het aanmeldscherm. */
  const stand = await js(hoofd, `window.career.apparaatStart()`)
  await post(stand.url + 'api/telefoon', { wat: 'aanmelden', nummer: NUMMER })
  await post(stand.url + 'api/telefoon', { wat: 'aanmelden', nummer: NUMMER, pin: PINCODE })
  await post(stand.url + 'api/telefoon', { wat: 'aanvaard' })
  await wacht(1200)
  const overlay = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('overlay'))
  if (!overlay) {
    console.log('geen overlay')
    app.exit(1)
    return
  }
  await js(overlay, `[...document.querySelectorAll('.dock-knop')].find((b) => b.getAttribute('aria-label') === 'IBIS')?.click()`)
  await wacht(1000)

  /* Wat de overlay zegt: fouten en CSP-weigeringen tellen mee. */
  const meldingen = []
  overlay.webContents.on('console-message', (_e, niveau, tekst) => {
    if (niveau >= 2) meldingen.push(tekst)
  })

  /* De ALMEX erbij, zoals de speler dat doet. */
  await js(overlay, `document.querySelector('.module-knop')?.click()`)
  await wacht(500)
  await js(overlay, `[...document.querySelectorAll('.module-lijst button')].find((b) => (b.querySelector('b')?.textContent ?? '').includes('ALMEX'))?.click()`)

  /*
   * DOEN WAT DE PLUGIN DOET
   *
   * Het hoofdproces zet in getallen.txt welke getalvariabelen het wil zien, en de
   * plugin beantwoordt ze allemaal. Een eerdere versie van deze proef gaf er maar
   * twee, en dan bleven de klok en de knoppen onderin weg: die hangen aan
   * almex_ein = 1 (de ALMEX staat aan), en een getal dat ontbreekt telt als
   * onzichtbaar. Dat was de proef, niet de app -- maar het laat wel zien dat deze
   * vraag echt gesteld moet worden. Dus: wachten tot de lijst er is, en dan alles
   * op nul behalve wat een aanstaande ALMEX in menu 0 hoort te zeggen.
   */
  let gevraagd = []
  for (let i = 0; i < 40 && gevraagd.length === 0; i++) {
    await wacht(150)
    try {
      gevraagd = readFileSync(join(live, "getallen.txt"), "utf8").split(/\r?\n/).filter(Boolean)
    } catch {
      // Nog niet geschreven.
    }
  }
  console.log(`de app vraagt ${gevraagd.length} getallen:`, gevraagd.slice(0, 8).join(', '), '...')
  const antwoord = (menu) => {
    const uit = Object.fromEntries(gevraagd.map((naam) => [naam, 0]))
    return { ...uit, almex_ein: 1, almex_riegel: 1, trans_dauer: 1, almex_menu: menu }
  }
  GETALLEN = antwoord(0)
  schrijfLive()

  /* De lijst met apparaten dicht, zoals de speler op Klaar drukt. */
  await wacht(300)
  await js(overlay, `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Klaar' || b.textContent.trim() === 'Done')?.click()`)

  /*
   * Het hoofdproces bouwt dan de vorm (een paar honderd .o3d-bestanden), en de
   * overlay haalt daarna vorm en plaatjes.
   */
  const staat = () => js(overlay, `(() => {
    const scherm = document.querySelector('.apparaatscherm')
    const doek = scherm?.querySelector('canvas')
    let gevuld = 0
    if (doek && doek.width > 0) {
      const d = doek.getContext('2d').getImageData(0, 0, doek.width, doek.height).data
      for (let i = 0; i < d.length; i += 4 * 97) if (d[i] + d[i + 1] + d[i + 2] > 30) gevuld++
    }
    return {
      scherm: Boolean(scherm),
      beeld: scherm?.dataset.beeld,
      vlak: Boolean(document.querySelector('.paneel-vlak')),
      doek: doek ? [doek.width, doek.height] : null,
      gevuld,
      klikken: [...document.querySelectorAll('.scherm-klik')].map((k) => k.dataset.actie),
      /*
       * Onder een touchscreen hoort niets te staan dan het scherm: geen grijze
       * rijen, wel een dichtgeklapt "Losse knoppen" voor de klep, de grendel en
       * het wisselgeld.
       */
      rijen: [...document.querySelectorAll('.paneel-rij')].filter((r) => r.offsetParent !== null).length,
      los: (() => {
        const knop = document.querySelector('.paneel-los-knop')
        return knop ? { tekst: knop.textContent.trim(), open: knop.getAttribute('aria-expanded') } : null
      })(),
      /*
       * Of er plaatjes op staan. performance.getEntriesByType ziet eigen
       * protocollen niet, dus kijken we naar het beeld: een foto of een
       * menuplaatje geeft honderden verschillende kleuren, een effen vlak met
       * alleen tekst een handvol.
       */
      kleuren: (() => {
        if (!doek || doek.width === 0) return 0
        const d = doek.getContext('2d').getImageData(0, 0, doek.width, doek.height).data
        const gezien = new Set()
        for (let i = 0; i < d.length; i += 4 * 7) gezien.add((d[i] >> 3) << 10 | (d[i + 1] >> 3) << 5 | (d[i + 2] >> 3))
        return gezien.size
      })()
    }
  })()`)

  let nu = await staat()
  for (let i = 0; i < 40 && nu.beeld !== 'ja'; i++) {
    await wacht(250)
    nu = await staat()
  }
  console.log('menu 0:', JSON.stringify({ ...nu, klikken: nu.klikken.length }))
  console.log('  aanraakvlakken:', nu.klikken.slice(0, 12).join(', '), nu.klikken.length > 12 ? '...' : '')

  if (uitvoer) {
    overlay.showInactive = BrowserWindow.prototype.showInactive
    overlay.showInactive()
    await wacht(400)
    writeFileSync(join(uitvoer, 'overlay-almex-menu0.png'), (await overlay.webContents.capturePage()).toPNG())
    console.log('  afdruk: overlay-almex-menu0.png')
  }

  /* De losse knoppen openklappen: daar horen de klep, de grendel en het wisselgeld. */
  await js(overlay, `document.querySelector('.paneel-los-knop')?.click()`)
  await wacht(300)
  const losOpen = await js(overlay, `({
    open: document.querySelector('.paneel-los-knop')?.getAttribute('aria-expanded'),
    knoppen: [...document.querySelectorAll('.paneel-los .paneel-knop')].map((b) => b.textContent.trim())
  })`)
  console.log('losse knoppen, opengeklapt:', JSON.stringify(losOpen))
  await js(overlay, `document.querySelector('.paneel-los-knop')?.click()`)
  await wacht(200)

  /* Een ander menu: het beeld hoort te wisselen. */
  const voor = nu.gevuld
  GETALLEN = antwoord(26)
  schrijfLive()
  await wacht(2500)
  const na = await staat()
  console.log('menu 26:', JSON.stringify({ beeld: na.beeld, gevuld: na.gevuld, kleuren: na.kleuren, klikken: na.klikken.length }))
  console.log('  aanraakvlakken:', na.klikken.slice(0, 12).join(', '))

  if (uitvoer) {
    writeFileSync(join(uitvoer, 'overlay-almex-menu26.png'), (await overlay.webContents.capturePage()).toPNG())
    console.log('  afdruk: overlay-almex-menu26.png')
  }

  const csp = meldingen.filter((m) => /Content Security Policy|Refused to load/i.test(m))
  const fouten = meldingen.filter((m) => !/Electron Security Warning|Kaart .* kon niet|willReadFrequently/.test(m))
  console.log('meldingen van de overlay:', fouten.length ? fouten.map((m) => m.slice(0, 160)) : 'geen')

  /*
   * DEZELFDE ALMEX OP DE TABLET
   *
   * Die haalt de vorm niet via IPC maar over het netwerk (api/scherm/<id>) en de
   * plaatjes als textuur/<id>, allebei alleen op een id uit het register van de
   * huidige bus. Een iPad is hier een verborgen venster op het adres van de
   * server; de aanmelding van hierboven geldt ook daar, want die hoort bij de
   * chauffeur en de dienst en niet bij het venster.
   */
  /*
   * Zonder backgroundThrottling uit tekent Chromium een canvas in een verborgen
   * venster niet bij: requestAnimationFrame staat stil. Een eerdere versie van
   * deze proef zag daardoor een leeg scherm dat er bij de schermafdruk -- toen
   * het venster wel zichtbaar werd -- gewoon stond.
   */
  /* Liggend, zoals een iPad in een houder naast het stuur: 1194 x 834. */
  const tablet = new BrowserWindow({
    width: 1194,
    height: 834,
    show: false,
    webPreferences: { backgroundThrottling: false }
  })
  const tabletMeldingen = []
  tablet.webContents.on('console-message', (_e, niveau, tekst) => {
    if (niveau >= 2) tabletMeldingen.push(tekst)
  })
  /*
   * En zichtbaar, al is het maar achter de rest: het canvas krijgt zijn maat van
   * een ResizeObserver, en die meldt niets in een venster dat nooit in beeld is
   * geweest. De haak bovenin maakt show en showInactive van elk nieuw venster
   * onschadelijk; hier is dat precies wat we niet willen.
   */
  tablet.showInactive = BrowserWindow.prototype.showInactive
  tablet.showInactive()
  await tablet.loadURL(stand.url)
  await wacht(1500)
  await js(tablet, `[...document.querySelectorAll('.dock-knop')].find((b) => b.getAttribute('aria-label') === 'IBIS')?.click()`)
  let opTablet = { beeld: undefined, klikken: 0, kleuren: 0 }
  for (let i = 0; i < 30 && opTablet.beeld !== 'ja'; i++) {
    await wacht(250)
    opTablet = await js(tablet, `(() => {
      const scherm = document.querySelector('.apparaatscherm')
      const doek = scherm?.querySelector('canvas')
      let kleuren = 0
      if (doek && doek.width > 0) {
        const d = doek.getContext('2d').getImageData(0, 0, doek.width, doek.height).data
        const gezien = new Set()
        for (let i = 0; i < d.length; i += 4 * 7) gezien.add((d[i] >> 3) << 10 | (d[i + 1] >> 3) << 5 | (d[i + 2] >> 3))
        kleuren = gezien.size
      }
      const vlak = scherm?.querySelector('.scherm-vlak')?.getBoundingClientRect()
      return {
        beeld: scherm?.dataset.beeld,
        doek: doek ? [doek.width, doek.height] : null,
        klikken: document.querySelectorAll('.scherm-klik').length,
        kleuren,
        /* Het touchscreen hoort in de laag over het hele scherm te staan. */
        volledig: Boolean(scherm?.closest('.scherm-volledig')),
        /*
         * Niets in de laag mag over een aanraakvlak liggen. Een eerdere versie
         * zette een regel tekst onderin, precies over het vinkje en FIMS.
         */
        bedekt: (() => {
          const laag = document.querySelector('.scherm-volledig')
          if (!laag) return []
          const klikken = [...laag.querySelectorAll('.scherm-klik')].map((k) => [k.dataset.actie, k.getBoundingClientRect()])
          const rest = [...laag.children].filter((n) => !n.classList.contains('apparaatscherm'))
          const uit = []
          for (const n of rest) {
            const r = n.getBoundingClientRect()
            for (const [actie, k] of klikken)
              if (r.left < k.right && r.right > k.left && r.top < k.bottom && r.bottom > k.top) uit.push(actie)
          }
          return uit
        })(),
        waarschuwt: Boolean(document.querySelector('.scherm-volledig-uit.waarschuwt')),
        vlak: vlak ? [Math.round(vlak.width), Math.round(vlak.height)] : null,
        venster: [innerWidth, innerHeight],
        balk: Boolean(document.querySelector('.dock-knop')?.offsetParent)
      }
    })()`)
  }
  console.log('op de tablet:', JSON.stringify(opTablet))
  const tabletFouten = tabletMeldingen.filter((m) => !/willReadFrequently|Kaart .* kon niet/.test(m))
  console.log('meldingen van de tablet:', tabletFouten.length ? tabletFouten.map((m) => m.slice(0, 160)) : 'geen')
  if (uitvoer) {
    tablet.showInactive = BrowserWindow.prototype.showInactive
    tablet.showInactive()
    await wacht(400)
    writeFileSync(join(uitvoer, 'tablet-almex.png'), (await tablet.webContents.capturePage()).toPNG())
    console.log('  afdruk: tablet-almex.png')
  }

  /*
   * Eruit stappen: de laag hoort weg te gaan en de telefoon met zijn balk hoort
   * er weer te staan, anders kom je nooit meer bij een andere app. En er weer in.
   */
  await js(tablet, `document.querySelector('.scherm-volledig-uit')?.click()`)
  await wacht(500)
  const eruit = await js(tablet, `({
    laag: Boolean(document.querySelector('.scherm-volledig')),
    balk: Boolean(document.querySelector('.dock-knop')?.offsetParent),
    terugKnop: Boolean(document.querySelector('.scherm-volledig-in'))
  })`)
  await js(tablet, `document.querySelector('.scherm-volledig-in')?.click()`)
  await wacht(500)
  const erin = await js(tablet, `Boolean(document.querySelector('.scherm-volledig .apparaatscherm'))`)
  console.log('eruit:', JSON.stringify(eruit), ' er weer in:', erin)

  /* In de overlay op de pc hoort er niets veranderd te zijn. */
  const overlayVolledig = await js(overlay, `Boolean(document.querySelector('.scherm-volledig'))`)
  console.log('laag in de overlay (hoort niet):', overlayVolledig)

  /*
   * Een id die niet in het register staat, of een pad in plaats van een id,
   * hoort een 404 te geven -- ook met de goede sleutel in het adres.
   */
  const status = (pad) =>
    new Promise((klaar) => {
      http.get(stand.url + pad, (a) => {
        a.resume()
        klaar(a.statusCode)
      }).on('error', () => klaar(0))
    })
  const weigert = {
    vreemdeId: await status('textuur/0123456789abcdef0123'),
    pad: await status('textuur/..%5C..%5Csettings.json'),
    vorm: await status('api/scherm/0123456789abcdef0123')
  }
  console.log('de server weigert:', JSON.stringify(weigert))

  const goed =
    nu.scherm &&
    nu.beeld === 'ja' &&
    !nu.vlak &&
    nu.doek && nu.doek[0] > 100 &&
    nu.gevuld > 50 &&
    nu.kleuren > 200 &&
    gevraagd.includes('almex_ein') &&
    nu.klikken.length >= 7 &&
    /* Alleen het touchscreen: geen rijen, en de losse knoppen dichtgeklapt. */
    nu.rijen === 0 &&
    nu.los !== null &&
    nu.los.open === 'false' &&
    losOpen.knoppen.length === 4 &&
    csp.length === 0 &&
    na.beeld === 'ja' &&
    na.klikken.join('|') !== nu.klikken.join('|') &&
    opTablet.beeld === 'ja' &&
    opTablet.volledig &&
    opTablet.bedekt.length === 0 &&
    /* In de proef hangen de knoppen niet aan een toets: dan hoort de stip er te staan. */
    opTablet.waarschuwt &&
    /* Vult het de hoogte (liggend is de hoogte de grens), op een paar punten na? */
    opTablet.vlak && opTablet.vlak[1] >= opTablet.venster[1] - 4 &&
    !eruit.laag && eruit.balk && eruit.terugKnop && erin &&
    !overlayVolledig &&
    opTablet.klikken > 0 &&
    opTablet.kleuren > 200 &&
    tabletFouten.length === 0 &&
    Object.values(weigert).every((code) => code === 404)
  console.log(goed ? 'het scherm staat in de overlay en op de tablet' : 'HET SCHERM STAAT NIET GOED')
  app.exit(goed ? 0 : 1)
})
