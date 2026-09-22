/**
 * De kaartverkoop: deur open, kaartje uit de bus, wisselgeld.
 *
 *   npx electron scripts/probe-kaartjes.cjs
 *
 * Wat er nagerekend wordt:
 * - zolang de deuren dicht zijn staat de telefoon op de kaart;
 * - gaat er een deur open, dan springt hij naar de kaartverkoop;
 * - het kaartje dat in de bus gekozen is (`GivenTicket`) staat er al, met zijn
 *   prijs, en de app zegt erbij waar die keuze vandaan komt;
 * - tik aan waarmee de passagier betaalt en het wisselgeld staat er meteen,
 *   uitgesplitst in munten.
 *
 * Er wordt niets van de gebruiker aangeraakt: een kopie van de gebruikersmap,
 * een eigen live.json, en de server alleen op 127.0.0.1. OMSI blijft erbuiten.
 */
const { app, BrowserWindow, ipcMain } = require('electron')
const { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, utimesSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const http = require('node:http')

const map = mkdtempSync(join(tmpdir(), 'omsi-kaartjes-'))
const bron = join(process.env.APPDATA, 'omsi-enhancer')
cpSync(join(bron, 'settings.json'), join(map, 'settings.json'))
cpSync(join(bron, 'profiles'), join(map, 'profiles'), { recursive: true })
const inst = JSON.parse(readFileSync(join(map, 'settings.json'), 'utf8'))
inst.tourSeen = true
delete inst.apparaatSleutel
delete inst.apparaatPoort
writeFileSync(join(map, 'settings.json'), JSON.stringify(inst, null, 2))
for (const naam of readdirSync(join(map, 'profiles')).filter((n) => n.endsWith('.json') && n !== 'active.json')) {
  const pad = join(map, 'profiles', naam)
  const p = JSON.parse(readFileSync(pad, 'utf8'))
  p.personeelsnummer = '123456'
  p.pincode = '9876'
  writeFileSync(pad, JSON.stringify(p, null, 2))
}
const live = join(mkdtempSync(join(tmpdir(), 'omsi-kaartjes-live-')), 'OMSI Career')
mkdirSync(live, { recursive: true })
process.env.OMSI_ENHANCER_LIVEMAP = live
process.env.OMSI_ENHANCER_APPARAAT_HOST = '127.0.0.1'
process.env.OMSI_ENHANCER_PROEFPROCES = 'GeenOmsiProef'
app.setPath('userData', map)
setTimeout(() => app.exit(1), 120000).unref()
require('../out/main/index.js')
const wacht = (ms) => new Promise((r) => setTimeout(r, ms))
const js = (w, code) => w.webContents.executeJavaScript(code)
app.on('browser-window-created', (_e, w) => { w.show = () => {}; w.showInactive = () => {}; w.hide() })

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

app.whenReady().then(async () => {
  ipcMain.removeHandler('plugin:status')
  ipcMain.handle('plugin:status', () => ({ installed: true, upToDate: true, changed: false, target: '' }))
  await wacht(2500)
  const hoofd = BrowserWindow.getAllWindows()[0]
  const dienst = await js(hoofd, `window.career.career().then((p) => p.state?.activeDuty?.assignment?.duty)`)
  const rit = dienst.legs[0]
  const beeld = (deur, ticket, verkoop) => ({
    alive: true, seen: 8388607, seenSys: 63, seenStr: 63, strKind: 1,
    time: 43200, day: 1, month: 7, year: 2026, velocity: deur ? 0 : 11.1, passengers: 4,
    scheduleActive: 1, targetIndex: 0, tankPercent: 0.7, km: 0, metres: 0,
    busstopIndex: 2, busstop: rit.stops[2] ?? '', line: rit.lineNumber, terminus: rit.terminus,
    matrix: '', delayMin: '', delaySec: '',
    entryRequest: deur ? 1 : 0, exitRequest: 0, ticket, entryOpen: deur ? 1 : 0, exitOpen: 0, atStation: deur ? 1 : 0,
    brightness: 0.5, streetCond: 0, precipRate: 0, precipType: 0, lightsLow: 1,
    blinkerLeft: 0, blinkerRight: 0, brakeLight: 0, engineOn: 1, maxBrake: 0, maxAccel: 0,
    topSpeed: 0, harshBrakes: 0, harshAccels: 0, battery: 0, temperature: 0,
    collisions: 0, collisionEnergy: 0, worstCollision: 0, exeVersion: '2.3.004',
    /*
     * Het geheugenblok van de plugin. Met een verkoop erin doet de app alsof er
     * iemand aan de deur staat te betalen; `ok: 1` hoort daarbij, anders leest
     * de app het blok niet.
     */
    mem: verkoop
      ? {
          ok: 1, tile: 4, x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1,
          schedActive: 0, line: 0, tour: 0, tourEntry: 0, trip: 0, nextIndex: -1,
          nextDist: 1000000, delay: 0, lineName: '', tourName: '', tripName: '', nextStop: '',
          koper: 7, ticketSoort: 0, ticketIndex: verkoop.kaartje,
          ticketPrijs: verkoop.prijs, ticketGegeven: verkoop.gegeven,
          ticketSlecht: 0, ticketKlaar: 0
        }
      : { ok: 0 }
  })
  const schrijf = (deur, ticket, verkoop) =>
    writeFileSync(join(live, 'live.json'), JSON.stringify(beeld(deur, ticket, verkoop)))
  schrijf(false, -1)
  setInterval(() => { const nu = new Date(); utimesSync(join(live, 'live.json'), nu, nu) }, 2000).unref()

  await js(hoofd, `window.career.setOverlay(${JSON.stringify(dienst)}, true)`)
  await wacht(1200)
  const stand = await js(hoofd, `window.career.apparaatStart()`)
  const url = stand.url
  await post(url + 'api/telefoon', { wat: 'aanmelden', nummer: '123456' })
  await post(url + 'api/telefoon', { wat: 'aanmelden', nummer: '123456', pin: '9876' })
  await post(url + 'api/telefoon', { wat: 'aanvaard' })
  await wacht(1200)

  const overlay = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('overlay'))
  const soorten = await js(overlay, `document.querySelectorAll('.kaartlijst button').length`)
  const voor = await js(overlay, `({ app: document.querySelector('.dock-knop[aria-pressed="true"]')?.getAttribute('aria-label'), kaartjes: Boolean(document.querySelector('.kaartjes')) })`)
  console.log('deur dicht:', JSON.stringify(voor))

  // De deur gaat open, met kaartje 1 gekozen in de bus.
  schrijf(true, 1)
  await wacht(1800)
  const na = await js(overlay, `({
    app: document.querySelector('.dock-knop[aria-pressed="true"]')?.getAttribute('aria-label'),
    kaartjes: Boolean(document.querySelector('.kaartjes')),
    gekozen: document.querySelector('.kaartgekozen .kaartnaam, .kaartjes .kaartnaam')?.textContent ?? null,
    prijs: document.querySelector('.kaartjes .kaartprijs')?.textContent ?? null,
    bron: document.querySelector('.kaartbron')?.textContent ?? null,
    knoppen: [...document.querySelectorAll('.kaartjes button')].map((b) => b.textContent.trim()).slice(0, 12)
  })`)
  console.log('deur open:', JSON.stringify(na))
  console.log('soorten kaartjes op deze kaart:', soorten)

  // Wisselgeld: de passagier geeft een briefje van tien.
  const terug = await js(overlay, `(() => {
    const knop = [...document.querySelectorAll('.kaartjes button')].find((b) => /10[.,]00/.test(b.textContent));
    knop?.click();
    return new Promise((klaar) => setTimeout(() => klaar({
      geklikt: Boolean(knop),
      terug: document.querySelector('.kaartterugbedrag b')?.textContent ?? null,
      munten: [...document.querySelectorAll('.kaartmunten span')].map((s) => s.textContent.trim())
    }), 400));
  })()`)
  console.log('na een briefje van tien:', JSON.stringify(terug))

  /* En dicht is rijden: dan hoort de kaart er weer te staan. */
  schrijf(false, -1)
  await wacht(1800)
  const dicht = await js(overlay, `({
    app: document.querySelector('.dock-knop[aria-pressed="true"]')?.getAttribute('aria-label'),
    kaartjes: Boolean(document.querySelector('.kaartjes'))
  })`)
  console.log('deur weer dicht:', JSON.stringify(dicht))

  /* De kaartsoorten staan als tegels, niet als lijst. */
  schrijf(true, -1)
  await wacht(1800)
  const tegels = await js(overlay, `({
    tegels: document.querySelectorAll('.kaarttegels button').length,
    lijst: document.querySelectorAll('.kaartlijst button').length,
    eerste: document.querySelector('.kaarttegels .kaartprijs')?.textContent ?? null
  })`)
  console.log('kaartsoorten als tegels:', JSON.stringify(tegels))

  /*
   * En de verkoop zoals het spel hem kent: kaartje 1 van deze kaart, met een
   * briefje van tien in de hand. Prijs en naam moeten uit dezelfde bron komen.
   */
  const prijsVanEen = await js(hoofd, `window.career.kaartjes ? 0 : 0`)
  void prijsVanEen
  const uitPak = JSON.parse(await js(overlay, `JSON.stringify([...document.querySelectorAll('.kaarttegels .kaartprijs')].map((e) => e.textContent))`))
  const prijs = Number(uitPak[1] ?? '1.90')
  schrijf(true, -1, { kaartje: 1, prijs, gegeven: 10 })
  await wacht(1800)
  const verkoop = await js(overlay, `({
    scherm: Boolean(document.querySelector('.verkoop')),
    kaartje: document.querySelector('.verkoop-kaartje b')?.textContent ?? null,
    prijs: document.querySelector('.verkoop-kaartje span')?.textContent ?? null,
    bedragen: [...document.querySelectorAll('.verkoop-geld dd')].map((d) => d.textContent),
    munten: [...document.querySelectorAll('.wisselaar button')].map((b) => b.textContent),
    geraden: [...document.querySelectorAll('.wisselaar button.raad')].map((b) => b.textContent)
  })`)
  console.log('verkoop uit het spel:', JSON.stringify(verkoop))

  /* Teruggeven met de wisselaar: tik de munten aan die hij geraden heeft. */
  const naTeruggeven = await js(overlay, `(async () => {
    const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
    for (const knop of [...document.querySelectorAll('.wisselaar button.raad')]) { knop.click(); await wacht(150) }
    await wacht(300);
    return {
      terug: document.querySelectorAll('.verkoop-geld dd')[1]?.textContent ?? null,
      klaar: document.querySelector('.verkoop-klaar')?.textContent ?? null
    };
  })()`)
  console.log('na teruggeven:', JSON.stringify(naTeruggeven))

  const goed =
    voor.app === 'Kaart' &&
    !voor.kaartjes &&
    na.app === 'Kaartjes' &&
    na.kaartjes &&
    Boolean(na.gekozen) &&
    na.bron !== null &&
    terug.geklikt &&
    terug.terug !== null &&
    terug.munten.length > 0 &&
    dicht.app === 'Kaart' &&
    !dicht.kaartjes &&
    tegels.tegels > 0 &&
    tegels.lijst === 0 &&
    verkoop.scherm &&
    verkoop.kaartje !== null &&
    verkoop.bedragen[0] === '10.00' &&
    verkoop.bedragen[1] === (10 - prijs).toFixed(2) &&
    verkoop.munten.length === 6 &&
    naTeruggeven.terug === '0.00' &&
    naTeruggeven.klaar !== null
  console.log(goed ? 'de kaartverkoop klopt' : 'DE KAARTVERKOOP KLOPT NIET')
  app.exit(goed ? 0 : 1)
})
