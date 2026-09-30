/**
 * Vangrails voor een Electron-proef die het hoofdproces van de app laadt.
 *
 *   const { vangrails, nieuweGebruikersmap } = require('./proefvangrails.cjs')
 *
 * Voordat `out/main/index.js` geladen wordt: elke schrijfactie onder de spelmap
 * van OMSI, onder Lucs eigen gebruikersmap (`%APPDATA%\omsi-enhancer`) en onder
 * de map van de echte plugin (`%LOCALAPPDATA%\OMSI Career`) wordt geweigerd, en
 * een programma dat Omsi.exe start ook. Zo kan een proef die een dienst of een
 * meting nabootst nooit iets van de speler raken, ook niet als de app ergens
 * een pad verkeerd kiest. Naar het voorbeeld van probe-vrijrijden.cjs, maar
 * zonder omleiding: deze proeven hoeven nergens in de spelmap te schrijven.
 *
 * Lezen mag wel: de instellingen en de kaartcache van Luc worden gekopieerd
 * (`nieuweGebruikersmap`), zodat de app niet eerst alle kaarten inleest.
 */
const echteFs = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')

/** Een tijdelijke gebruikersmap met een kopie van de instellingen en de kaartcache. */
function nieuweGebruikersmap(voorvoegsel, extra = {}) {
  const map = echteFs.mkdtempSync(join(tmpdir(), voorvoegsel))
  const bron = join(process.env.APPDATA ?? '', 'omsi-enhancer')
  let instellingen = {}
  try {
    instellingen = JSON.parse(echteFs.readFileSync(join(bron, 'settings.json'), 'utf8'))
  } catch {
    // Geen instellingen van Luc: dan zoekt de app OMSI zelf.
  }
  /* Alleen wat de app nodig heeft om OMSI te vinden; geen sleutels, geen apparaten. */
  const schoon = {
    language: 'nl',
    languageChosen: true,
    tourSeen: true,
    busPhotosOffered: true,
    omsiPath: instellingen.omsiPath,
    omsiConfirmed: Boolean(instellingen.omsiPath),
    ...extra
  }
  echteFs.writeFileSync(join(map, 'settings.json'), JSON.stringify(schoon, null, 2))
  if (echteFs.existsSync(join(bron, 'kaartcache'))) {
    echteFs.cpSync(join(bron, 'kaartcache'), join(map, 'kaartcache'), { recursive: true })
  }
  return { map, omsiPath: instellingen.omsiPath }
}

/**
 * Zet de vangrails. `verboden` zijn de mappen waaronder niets geschreven mag
 * worden; de spelmap, Lucs gebruikersmap en de map van de plugin staan er
 * altijd bij. Geeft de lijst met wat geweigerd werd terug (leeg is goed).
 */
function vangrails({ spelmap, verboden = [] } = {}) {
  const geweigerd = []
  const mappen = [
    spelmap,
    join(process.env.APPDATA ?? '', 'omsi-enhancer'),
    join(process.env.LOCALAPPDATA ?? '', 'OMSI Career'),
    ...verboden
  ]
    .filter(Boolean)
    .map((m) => resolve(m).toLowerCase())
  const verbodenPad = (pad) => {
    if (typeof pad !== 'string' && !(pad instanceof URL)) return false
    const vol = resolve(String(pad)).toLowerCase()
    return mappen.some((m) => vol === m || vol.startsWith(m + '\\') || vol.startsWith(m + '/'))
  }
  /* Welk argument het doel is: bij kopiëren en hernoemen het tweede. */
  const schrijvers = {
    writeFileSync: [0], appendFileSync: [0], mkdirSync: [0], rmSync: [0], unlinkSync: [0], rmdirSync: [0],
    copyFileSync: [1], renameSync: [0, 1], cpSync: [1], writeFile: [0], appendFile: [0], copyFile: [1],
    rename: [0, 1], unlink: [0], mkdir: [0], rm: [0], createWriteStream: [0]
  }
  for (const [naam, plekken] of Object.entries(schrijvers)) {
    const echt = echteFs[naam]
    if (typeof echt !== 'function') continue
    echteFs[naam] = function (...args) {
      for (const i of plekken) {
        if (verbodenPad(args[i])) {
          geweigerd.push(`${naam} ${String(args[i])}`)
          throw new Error(`proef: hier wordt niet geschreven (${naam} ${String(args[i])})`)
        }
      }
      return echt.apply(this, args)
    }
  }
  const echtOpen = echteFs.openSync
  echteFs.openSync = function (pad, vlag, ...rest) {
    if (verbodenPad(pad) && !/^r$|^rs\+?$/.test(String(vlag ?? 'r'))) {
      geweigerd.push(`openSync ${pad} ${vlag}`)
      throw new Error(`proef: hier wordt niet geschreven (openSync ${pad})`)
    }
    return echtOpen.call(this, pad, vlag, ...rest)
  }
  const kinderen = require('node:child_process')
  for (const naam of ['spawn', 'execFile', 'execFileSync', 'exec', 'execSync', 'spawnSync']) {
    const echt = kinderen[naam]
    kinderen[naam] = function (commando, ...args) {
      const alles = [String(commando), ...(Array.isArray(args[0]) ? args[0].map(String) : [])].join(' ').toLowerCase()
      /* tasklist met "IMAGENAME eq Omsi.exe" leest alleen; starten niet. */
      const start = /omsi\.exe/.test(alles) && !/^tasklist/.test(String(commando).toLowerCase())
      if (start || (spelmap && alles.includes(resolve(spelmap).toLowerCase()))) {
        geweigerd.push(`${naam} ${alles.slice(0, 120)}`)
        throw new Error(`proef: het echte OMSI niet starten (${alles.slice(0, 80)})`)
      }
      return echt.call(this, commando, ...args)
    }
  }
  return geweigerd
}

/**
 * Een live.json zoals plugin 14 hem schrijft, met de velden die een proef
 * meestal niet nodig heeft al ingevuld. `mem` en de rest komen erbovenop.
 */
function nepLive(stand) {
  return {
    alive: true, seen: 8388607, seenSys: 255, seenStr: 63, strKind: 1, plugin: 14,
    time: 8 * 3600, day: 9, month: 11, year: 2016, velocity: 0, passengers: 3,
    scheduleActive: 1, targetIndex: 0, tankPercent: 0.7, km: 10, metres: 0,
    busstopIndex: 0, busstop: '', line: '', terminus: '',
    matrix: '', delayMin: '', delaySec: '', entryRequest: 0, exitRequest: 0, ticket: -1,
    entryOpen: 0, exitOpen: 0, atStation: 0, brightness: 0.8, streetCond: 0, precipRate: 0,
    precipType: 0, lightsLow: 0, blinkerLeft: 0, blinkerRight: 0, brakeLight: 0, engineOn: 1,
    maxBrake: 0, maxAccel: 0, topSpeed: 0, harshBrakes: 0, harshAccels: 0, temperature: 18,
    collisions: 0, collisionEnergy: 0, worstCollision: 0, exeVersion: '2.3.004',
    ibis: { bestemming: '', lijn: '', lawo1: '', lawo2: '', lawo3: '', lawo4: '', afr1: '', afr2: '' },
    ...stand,
    mem: {
      ok: 1, tile: 0, x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1, schedActive: 0, line: -1, lines: 0, tour: -1,
      tourEntry: -1, trip: -1, nextIndex: 0, nextDist: 0, delay: 0, lineName: '', tourName: '', tripName: '',
      nextStop: '', koper: -1, ticketSoort: -1, ticketIndex: -1, ticketPrijs: 0, ticketGegeven: 0, ticketSlecht: 0,
      ticketKlaar: 0,
      ...(stand && stand.mem)
    }
  }
}

/**
 * Een aangenomen én begonnen dienst in de proefmap, via de brug zoals de app
 * het zelf doet (createProfile, listDuties, confirmDuty). "Begonnen" zetten we
 * met de hand in het profiel: dat doet de app pas bij START, en daar hoort OMSI
 * bij. Geeft de dienst en de profielid terug.
 */
async function begonnenDienst(venster, map, kaart, chauffeur = 'Proef') {
  const js = (code) => venster.webContents.executeJavaScript(code)
  const na = await js(`window.career.createProfile(${JSON.stringify(chauffeur)})`)
  const id = na?.state?.id ?? na?.id
  const diensten = await js(
    `window.career.listDuties({ mapFolder: ${JSON.stringify(kaart)}, targetMinutes: 90, window: 'heledag' })`
  )
  const gekozen = (diensten ?? []).find((item) => item.vehicle && item.duty.legs.length > 0)
  if (!gekozen) return undefined
  await js(`window.career.confirmDuty(${JSON.stringify(gekozen)}, '', 'dienst')`)
  const profielen = join(map, 'profiles')
  const actief = JSON.parse(echteFs.readFileSync(join(profielen, 'active.json'), 'utf8')).id
  const pad = join(profielen, `${actief}.json`)
  const profiel = JSON.parse(echteFs.readFileSync(pad, 'utf8'))
  profiel.activeDuty.startedAt = new Date().toISOString()
  echteFs.writeFileSync(pad, JSON.stringify(profiel, null, 2))
  await js(`window.career.selectProfile(${JSON.stringify(actief)})`)
  return { duty: gekozen.duty, id: id ?? actief }
}

module.exports = { vangrails, nieuweGebruikersmap, nepLive, begonnenDienst }
