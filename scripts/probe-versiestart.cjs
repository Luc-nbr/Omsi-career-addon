/**
 * De versiewacht bij het starten van de echte app (29-09):
 *
 *   npx electron-vite build
 *   npx electron scripts/probe-versiestart.cjs    (PROEF_MAP=<map> voor een eigen werkmap)
 *
 * Deze proef start de gebouwde app (out/) een paar keer als eigen proces, elk
 * met een eigen gebruikersmap, tijdelijke map en nagebouwde OMSI-map; niets van
 * de gebruiker wordt geraakt.
 *
 * 1. Een gewone start noteert meteen wie er schrijft (`laatst-geschreven.json`,
 *    met versie, hash, bouwtijd en variant) -- niet pas bij de eerste opslag
 *    via `schrijfVeilig`, waar instellingen en de overlay-indeling buitenom
 *    gaan.
 * 2. "Alleen bekijken" terwijl de kopie niet lukt (een bestand in de
 *    gebruikersmap dat een ander proces vasthoudt), en de speler kiest Afsluiten: de app gaat zelf dicht,
 *    laat geen halve kopie achter en laat het slot los -- een volgende start
 *    komt gewoon op.
 * 3. Hetzelfde, maar Toch doorgaan: de app draait op de echte map, en noteert
 *    zichzelf als laatste schrijver (de nieuwere blijft de hoogste).
 * 4. Een fout tijdens het opstarten, vóór er een venster is: de app gaat dicht
 *    (code 1) met de fout in het logboek, in plaats van onzichtbaar door te
 *    draaien met het slot in handen.
 *
 * Op d9eeeda faalt dit: 1 noteert niets, 2 draait door zonder venster (en de
 * volgende start stopt meteen), 4 idem.
 */
const { app, BrowserWindow } = require('electron')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

const werk = join(process.env.PROEF_MAP || tmpdir(), 'versiestart')
const rol = process.env.PROEF_ROL

if (!rol) ouder()
else kind(rol)

/* ---- het kind: één start van de app ---- */
function kind(geval) {
  const map = join(werk, process.env.PROEF_MAPNAAM)
  const data = join(map, 'userdata')
  const uitslag = (w) => console.log(`UITSLAG ${JSON.stringify(w)}`)
  process.env.OMSI_ENHANCER_PROEFPROCES = 'GeenOmsiProefVersiestart'
  process.env.OMSI_ENHANCER_LIVEMAP = join(map, 'live')
  app.setPath('userData', data)
  app.setPath('temp', join(map, 'tmp'))
  setTimeout(() => {
    uitslag({ geval, klaar: false, vensters: BrowserWindow.getAllWindows().length, slot: app.hasSingleInstanceLock() })
    app.exit(9)
  }, 25000).unref()
  if (geval === 'startfout') {
    // Iets in de start van de app laten mislukken, vóór het venster er is.
    const { protocol } = require('electron')
    protocol.handle = () => {
      throw new Error('proef: dit protocol lukt niet')
    }
  }
  require('../out/main/index.js')
  app.whenReady().then(() => {
    setTimeout(() => {
      uitslag({
        geval,
        klaar: true,
        vensters: BrowserWindow.getAllWindows().length,
        userData: app.getPath('userData')
      })
      app.exit(0)
    }, 4000)
  })
}

/* ---- de ouder: klaarzetten, starten, nakijken ---- */
function ouder() {
  fs.rmSync(werk, { recursive: true, force: true })
  let fouten = 0
  const klopt = (wat, ja) => {
    console.log(`${ja ? 'ok  ' : 'FOUT'} ${wat}`)
    if (!ja) fouten++
  }
  const pakket = JSON.parse(fs.readFileSync(join(__dirname, '..', 'package.json'), 'utf8'))

  const maakMap = (naam, nieuwere) => {
    const map = join(werk, naam)
    const omsi = join(map, 'OMSI 2')
    const data = join(map, 'userdata')
    fs.mkdirSync(omsi, { recursive: true })
    fs.mkdirSync(join(data, 'profiles'), { recursive: true })
    fs.mkdirSync(join(map, 'tmp'), { recursive: true })
    fs.writeFileSync(join(omsi, 'Omsi.exe'), '')
    fs.writeFileSync(join(data, 'settings.json'), JSON.stringify({ language: 'nl', omsiPath: omsi, omsiConfirmed: true }))
    fs.writeFileSync(join(data, 'profiles', 'abc.json'), JSON.stringify({ driver: 'Proef' }))
    fs.writeFileSync(join(data, 'vast.bin'), 'een ander proces houdt dit vast')
    if (nieuwere) {
      const n = { versie: '9.9.9', bouw: 'bouw fffffff · 2030-01-01 00:00 · setup', tijd: '2030-01-01T00:00:00.000Z' }
      fs.writeFileSync(join(data, 'laatst-geschreven.json'), JSON.stringify({ hoogste: n, laatst: n }))
    }
    return { map, data, tmp: join(map, 'tmp') }
  }

  const start = (geval, mapnaam, extra = {}) =>
    new Promise((klaar) => {
      const begin = Date.now()
      const k = spawn(process.execPath, [__filename], {
        env: { ...process.env, PROEF_ROL: geval, PROEF_MAPNAAM: mapnaam, ...extra },
        stdio: ['ignore', 'pipe', 'pipe']
      })
      let uit = ''
      k.stdout.on('data', (d) => (uit += d))
      k.stderr.on('data', (d) => (uit += d))
      k.on('exit', (code) => {
        const regel = uit.split(/\r?\n/).find((r) => r.startsWith('UITSLAG '))
        // Met PROEF_UITVOER=1 ook wat de app zelf zei.
        if (process.env.PROEF_UITVOER) console.log(`--- ${geval}, code ${code}:\n${uit.trim()}`)
        klaar({ code, duur: Date.now() - begin, uitslag: regel ? JSON.parse(regel.slice(8)) : undefined, uit })
      })
    })

  /*
   * Een bestand in de gebruikersmap dat een ander proces vasthoudt, zonder iets
   * te delen: de kopie lukt dan niet. Niet een profiel: dat leest de app bij
   * het starten zelf, en dan is het een andere fout (zie 4).
   */
  const houdVast = (pad) =>
    new Promise((klaar, mislukt) => {
      const ps = spawn(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `$f = [System.IO.File]::Open('${pad.replace(/'/g, "''")}', 'Open', 'Read', 'None'); Write-Output vast; Start-Sleep -Seconds 60; $f.Close()`
        ],
        { windowsHide: true }
      )
      ps.stdout.on('data', (d) => String(d).includes('vast') && klaar(ps))
      ps.on('exit', () => mislukt(new Error('PowerShell hield het profiel niet vast')))
    })

  const kopieen = (tmp) => (fs.existsSync(tmp) ? fs.readdirSync(tmp).filter((n) => n.startsWith('omsi-enhancer-bekijken-')) : [])

  ;(async () => {
    // 1. meteen noteren
    {
      const m = maakMap('nieuw', false)
      const r = await start('nieuw', 'nieuw', { OMSI_ENHANCER_PROEFKEUZE: 'doorgaan' })
      let notitie
      try {
        notitie = JSON.parse(fs.readFileSync(join(m.data, 'laatst-geschreven.json'), 'utf8'))
      } catch {
        notitie = undefined
      }
      const ik = notitie?.laatst
      klopt(`1. de app kwam op (${r.uitslag?.vensters ?? '?'} venster)`, r.uitslag?.klaar === true && r.uitslag.vensters >= 1)
      klopt(
        `1. bij het starten meteen genoteerd: ${ik ? `${ik.versie}, hash ${ik.hash}, gebouwd ${ik.gebouwd}, ${ik.variant}` : 'niets'}`,
        ik?.versie === pakket.version && typeof ik.hash === 'string' && typeof ik.gebouwd === 'string' && ik.variant === 'dev'
      )
    }

    // 2. de kopie lukt niet, Afsluiten
    {
      const m = maakMap('kopie-afsluiten', true)
      const ps = await houdVast(join(m.data, 'vast.bin'))
      try {
        const r = await start('kopie-afsluiten', 'kopie-afsluiten', {
          OMSI_ENHANCER_PROEFKEUZE: 'bekijken',
          OMSI_ENHANCER_PROEFKEUZE_KOPIE: 'afsluiten'
        })
        klopt(
          `2. kopie lukt niet, Afsluiten: de app ging zelf dicht (code ${r.code}, na ${(r.duur / 1000).toFixed(1)} s${r.uitslag ? `, ${JSON.stringify(r.uitslag)}` : ''})`,
          r.uitslag === undefined && r.duur < 20000
        )
        klopt(`2. geen halve kopie in de tijdelijke map (${kopieen(m.tmp).join(', ') || 'geen'})`, kopieen(m.tmp).length === 0)
        const notitie = JSON.parse(fs.readFileSync(join(m.data, 'laatst-geschreven.json'), 'utf8'))
        klopt('2. de notitie zegt nog steeds 9.9.9, ook als laatste', notitie.hoogste.versie === '9.9.9' && notitie.laatst.versie === '9.9.9')
      } finally {
        ps.kill()
      }
      // Het slot is los: een volgende start komt op.
      const nogEens = await start('nog-eens', 'kopie-afsluiten', { OMSI_ENHANCER_PROEFKEUZE: 'doorgaan' })
      klopt(
        `2. daarna komt een nieuwe start gewoon op (${nogEens.uitslag?.vensters ?? '?'} venster)`,
        nogEens.uitslag?.klaar === true && nogEens.uitslag.vensters >= 1
      )
    }

    // 3. de kopie lukt niet, Toch doorgaan
    {
      const m = maakMap('kopie-doorgaan', true)
      const ps = await houdVast(join(m.data, 'vast.bin'))
      let r
      try {
        r = await start('kopie-doorgaan', 'kopie-doorgaan', {
          OMSI_ENHANCER_PROEFKEUZE: 'bekijken',
          OMSI_ENHANCER_PROEFKEUZE_KOPIE: 'doorgaan'
        })
      } finally {
        ps.kill()
      }
      klopt(
        `3. kopie lukt niet, Toch doorgaan: de app komt op, op de echte map (${r.uitslag?.userData ?? '?'})`,
        r.uitslag?.klaar === true && r.uitslag.vensters >= 1 && r.uitslag.userData.toLowerCase() === m.data.toLowerCase()
      )
      const notitie = JSON.parse(fs.readFileSync(join(m.data, 'laatst-geschreven.json'), 'utf8'))
      klopt(
        `3. laatst ${notitie.laatst.versie}, hoogste blijft ${notitie.hoogste.versie}`,
        notitie.laatst.versie === pakket.version && notitie.hoogste.versie === '9.9.9'
      )
      klopt(`3. geen halve kopie in de tijdelijke map (${kopieen(m.tmp).join(', ') || 'geen'})`, kopieen(m.tmp).length === 0)
    }

    // 4. een fout tijdens het opstarten
    {
      const m = maakMap('startfout', false)
      const r = await start('startfout', 'startfout', { OMSI_ENHANCER_PROEFKEUZE: 'doorgaan' })
      let logboek = ''
      try {
        logboek = fs.readFileSync(join(m.data, 'logs', 'omsi-enhancer.log'), 'utf8')
      } catch {
        // Geen logboek: dan faalt de regel hieronder.
      }
      klopt(
        `4. fout bij het opstarten: de app ging dicht (code ${r.code}, na ${(r.duur / 1000).toFixed(1)} s${r.uitslag ? `, ${JSON.stringify(r.uitslag)}` : ''})`,
        r.code === 1 && r.uitslag === undefined
      )
      klopt('4. en de fout staat in het logboek', /FOUT {2}opstarten: proef: dit protocol lukt niet/.test(logboek))
      const nogEens = await start('nog-eens', 'startfout', { OMSI_ENHANCER_PROEFKEUZE: 'doorgaan' })
      klopt(`4. daarna komt een nieuwe start gewoon op (${nogEens.uitslag?.vensters ?? '?'} venster)`, nogEens.uitslag?.klaar === true && nogEens.uitslag.vensters >= 1)
    }

    console.log(fouten ? `\n${fouten} fout(en)` : '\nalles klopt')
    app.exit(fouten ? 1 : 0)
  })().catch((fout) => {
    console.log(`FOUT ${fout && fout.stack ? fout.stack : fout}`)
    app.exit(1)
  })
}
