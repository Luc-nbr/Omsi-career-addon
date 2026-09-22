/**
 * Aanmelden op de telefoon: in de overlay én op een telefoon of tablet.
 *
 *   npx electron scripts/probe-aanmelden.cjs
 *
 * Wat er nagerekend wordt:
 * - het cijferblok staat in de telefoon en niet in het dienstpaneel, en het
 *   vangt de muis (anders gaat de klik door de overlay heen naar OMSI);
 * - een verkeerd nummer en een verkeerde pincode worden geweigerd, en het
 *   nakijken gebeurt in het hoofdproces -- het beeld dat een toestel krijgt
 *   draagt geen nummer en geen pincode, alleen hoeveel cijfers ze tellen;
 * - wie zich op het toestel aanmeldt, is ook in de overlay aangemeld: daar
 *   verdwijnt het cijferblok en verschijnt de dienstopdracht;
 * - na het tekenen staat het balkje met apps er, in beide.
 *
 * Er wordt niets van de gebruiker aangeraakt: de proef werkt in een kopie van
 * de gebruikersmap, met een verzonnen personeelsnummer en pincode, een eigen
 * live.json, en de server alleen op 127.0.0.1 (zo komt er ook geen vraag van
 * de firewall in beeld). OMSI blijft er helemaal buiten.
 */
const { app, BrowserWindow, ipcMain } = require('electron')
const {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  utimesSync,
  writeFileSync
} = require('node:fs')
const http = require('node:http')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

const NUMMER = '123456'
const PINCODE = '9876'

const map = mkdtempSync(join(tmpdir(), 'omsi-aanmelden-'))
const bron = join(process.env.APPDATA, 'omsi-enhancer')
cpSync(join(bron, 'settings.json'), join(map, 'settings.json'))
cpSync(join(bron, 'profiles'), join(map, 'profiles'), { recursive: true })
for (const naam of readdirSync(join(map, 'profiles')).filter((n) => n.endsWith('.json') && n !== 'active.json')) {
  const pad = join(map, 'profiles', naam)
  const profiel = JSON.parse(readFileSync(pad, 'utf8'))
  profiel.personeelsnummer = NUMMER
  profiel.pincode = PINCODE
  writeFileSync(pad, JSON.stringify(profiel, null, 2))
}

const live = join(mkdtempSync(join(tmpdir(), 'omsi-aanmelden-live-')), 'OMSI Career')
mkdirSync(live, { recursive: true })
process.env.OMSI_ENHANCER_LIVEMAP = live
process.env.OMSI_ENHANCER_APPARAAT_HOST = '127.0.0.1'
process.env.OMSI_ENHANCER_PROEFPROCES = 'GeenOmsiProef'
app.setPath('userData', map)
require('../out/main/index.js')

const wacht = (ms) => new Promise((r) => setTimeout(r, ms))
const js = (w, code) => w.webContents.executeJavaScript(code)
app.on('window-all-closed', () => {})
process.on('unhandledRejection', (reden) => {
  console.error('mislukt: ' + reden)
  app.exit(1)
})
setTimeout(() => {
  console.error('time-out')
  app.exit(1)
}, 120000).unref()

/** Geen enkel venster van deze proef komt op het scherm. */
app.on('browser-window-created', (_e, venster) => {
  venster.show = () => {}
  venster.showInactive = () => {}
  venster.hide()
})

function stuur(url, lijf) {
  return new Promise((klaar) => {
    const vraag = http.request(
      url,
      { method: lijf ? 'POST' : 'GET', headers: lijf ? { 'Content-Type': 'application/json' } : {} },
      (antwoord) => {
        let tekst = ''
        antwoord.on('data', (stuk) => (tekst += stuk))
        antwoord.on('end', () => klaar({ status: antwoord.statusCode, tekst }))
      }
    )
    vraag.on('error', (reden) => klaar({ status: 'fout ' + reden.message }))
    if (lijf) vraag.write(JSON.stringify(lijf))
    vraag.end()
  })
}

/** Het eerstvolgende beeld uit de stroom. */
function beeld(url) {
  return new Promise((klaar) => {
    const vraag = http.get(url + 'api/stroom', (antwoord) => {
      let tekst = ''
      antwoord.on('data', (stuk) => {
        tekst += stuk
        const treffer = tekst.match(/data: (.*)\n\n/)
        if (treffer) {
          vraag.destroy()
          klaar(JSON.parse(treffer[1]))
        }
      })
    })
    setTimeout(() => {
      vraag.destroy()
      klaar(undefined)
    }, 5000)
  })
}

app.whenReady().then(async () => {
  // De plugin blijft erbuiten; anders zou hij in de OMSI-map willen kijken.
  ipcMain.removeHandler('plugin:status')
  ipcMain.handle('plugin:status', () => ({ installed: true, upToDate: true, changed: false, target: '' }))
  await wacht(2500)

  const hoofd = BrowserWindow.getAllWindows()[0]
  const dienst = await js(hoofd, `window.career.career().then((p) => p.state?.activeDuty?.assignment?.duty)`)
  if (!dienst) {
    console.log('geen aangenomen dienst in het profiel; proef overgeslagen')
    app.exit(0)
    return
  }

  /* Een nep-live.json, zodat de kaart iets te tonen heeft. */
  const rit = dienst.legs[0]
  writeFileSync(
    join(live, 'live.json'),
    JSON.stringify({
      alive: true,
      seen: 8388607,
      seenSys: 63,
      seenStr: 63,
      strKind: 1,
      time: 43200,
      day: 1,
      month: 7,
      year: 2026,
      velocity: 11.1,
      passengers: 0,
      scheduleActive: 1,
      targetIndex: 0,
      tankPercent: 0.7,
      km: 0,
      metres: 0,
      busstopIndex: 2,
      busstop: rit.stops[2] ?? '',
      line: rit.lineNumber,
      terminus: rit.terminus,
      matrix: '',
      delayMin: '',
      delaySec: '',
      entryRequest: 0,
      exitRequest: 0,
      ticket: -1,
      entryOpen: 0,
      exitOpen: 0,
      atStation: 0,
      brightness: 0.5,
      streetCond: 0,
      precipRate: 0,
      precipType: 0,
      lightsLow: 1,
      blinkerLeft: 0,
      blinkerRight: 0,
      brakeLight: 0,
      engineOn: 1,
      maxBrake: 0,
      maxAccel: 0,
      topSpeed: 0,
      harshBrakes: 0,
      harshAccels: 0,
      battery: 0,
      temperature: 0,
      collisions: 0,
      collisionEnergy: 0,
      worstCollision: 0,
      smokesystems: 0,
      exeVersion: '2.3.004',
      mem: { ok: 0 }
    })
  )
  setInterval(() => {
    const nu = new Date()
    utimesSync(join(live, 'live.json'), nu, nu)
  }, 2000).unref()

  await js(hoofd, `window.career.setOverlay(${JSON.stringify(dienst)}, true)`)
  await wacht(1500)
  const stand = await js(hoofd, `window.career.apparaatStart()`)
  const url = stand.url
  const overlay = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('overlay'))
  await wacht(800)

  const eerst = await js(
    overlay,
    `({
      inTelefoon: document.querySelectorAll('.panel-navigatie .cijferblok button').length,
      inDienst: document.querySelectorAll('.panel-dienst .cijferblok button').length,
      balk: document.querySelectorAll('.panel-navigatie .dock button').length,
      toetsenVangen: [...document.querySelectorAll('.cijferblok button')].every((b) => b.closest('[data-hit]')),
      vakjes: document.querySelectorAll('.aanmeld-vakjes span').length
    })`
  )
  console.log('in de overlay: ' + JSON.stringify(eerst))

  const opHetToestel = await beeld(url)
  const geheim = /pincode|personeelsnummer|chauffeur/.test(JSON.stringify(opHetToestel))
  console.log(
    'het toestel krijgt: ' +
      JSON.stringify(opHetToestel?.telefoon) +
      ' | nummer of pincode erin: ' +
      geheim
  )

  const aanmelden = async (nummer, pin) =>
    JSON.parse((await stuur(url + 'api/telefoon', { wat: 'aanmelden', nummer, pin })).tekst).uitslag
  const misNummer = await aanmelden('000000')
  const goedNummer = await aanmelden(NUMMER)
  const misPin = await aanmelden(NUMMER, '0000')
  const goedPin = await aanmelden(NUMMER, PINCODE)
  console.log(
    `aanmelden vanaf het toestel: verkeerd nummer ${misNummer}, goed nummer ${goedNummer}, ` +
      `verkeerde pincode ${misPin}, goede pincode ${goedPin}`
  )

  await wacht(700)
  const naAanmelden = await js(
    overlay,
    `({ cijferblok: document.querySelectorAll('.cijferblok button').length, opdracht: Boolean(document.querySelector('.opdracht')) })`
  )
  console.log('overlay na aanmelden op het toestel: ' + JSON.stringify(naAanmelden))

  await stuur(url + 'api/telefoon', { wat: 'aanvaard' })
  await wacht(700)
  const naTekenen = await js(
    overlay,
    `({ balk: document.querySelectorAll('.panel-navigatie .dock button').length, opdracht: Boolean(document.querySelector('.opdracht')) })`
  )
  console.log('overlay na tekenen op het toestel: ' + JSON.stringify(naTekenen))

  /* En wat er niet mag: een andere opdracht, of iets lezen zonder de sleutel. */
  const onzin = await stuur(url + 'api/telefoon', { wat: 'profiel-wissen' })
  const zonderSleutel = await stuur(url.replace(/\/n\/[^/]+\//, '/n/xxxxxxxxxxxxxxxxxxxxxx/') + 'api/stroom')
  console.log(`geweigerd: onbekende opdracht ${onzin.status}, verkeerde sleutel ${zonderSleutel.status}`)

  const goed =
    eerst.inTelefoon === 12 &&
    eerst.inDienst === 0 &&
    eerst.balk === 0 &&
    eerst.toetsenVangen &&
    eerst.vakjes === NUMMER.length &&
    !geheim &&
    opHetToestel?.telefoon?.nummerLengte === NUMMER.length &&
    opHetToestel?.telefoon?.pinLengte === PINCODE.length &&
    misNummer === 'fout' &&
    goedNummer === 'nummer' &&
    misPin === 'fout' &&
    goedPin === 'aangemeld' &&
    naAanmelden.cijferblok === 0 &&
    naAanmelden.opdracht &&
    naTekenen.balk === 6 &&
    !naTekenen.opdracht &&
    onzin.status === 400 &&
    zonderSleutel.status === 404
  console.log(goed ? 'de telefoon klopt' : 'DE TELEFOON KLOPT NIET')
  app.exit(goed ? 0 : 1)
})
