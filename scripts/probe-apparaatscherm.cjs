/**
 * Tekent `Apparaatscherm` (renderer/src/apparaatscherm.tsx) het scherm van een
 * apparaat zoals het in de bus staat, en komt een tik op de goede knop aan?
 *
 *   npx electron scripts/probe-apparaatscherm.cjs
 *   PROEF_DPR=3 npx electron scripts/probe-apparaatscherm.cjs   (als op een telefoon)
 *   PROEF_ALLEEN=echt npx electron scripts/probe-apparaatscherm.cjs   (alleen de echte ALMEX)
 *
 * Zonder de app en zonder OMSI: esbuild bundelt het onderdeel met een nep-vorm
 * in een los pagina'tje, en een onzichtbaar Electron-venster tekent het op 390
 * (telefoon) en 1194 (iPad) breed. De vorm lijkt op de ALMEX van de HH20: het
 * echte plaatje 17_almex_s_0.jpg (uv v -0,88..-0,12, dus met herhalen), het
 * rode vertragingsvlak als laag met alfa 2, de klok en de matrixregel in het
 * echte lettertype van OMSI (Fonts/HH20_HHAschedule_font.oft), een vlak in
 * kleur, een scripttextuur, een uitgerekte rand ('clamp'), een vlak met één
 * uv-punt, een onderdeel dat verborgen moet blijven, en zes aanraakvlakken.
 *
 * Wat er nagerekend wordt:
 * - de terugval staat er tot het eerste hele beeld, daarna het canvas;
 * - het canvas heeft zoveel beeldpunten als het in beeld beslaat, ook onder
 *   CSS-`zoom` (zoals op de tablet), en ook als de browser zich gedraagt als
 *   Safari (geen device-pixel-content-box, getBoundingClientRect zonder zoom);
 * - het plaatje ligt op de goede plek: beeldpunten van het canvas tegen het
 *   plaatje zelf, en ter vergelijking hetzelfde met een verschuiving;
 * - wat verborgen hoort (menu 5, menu 26) staat er niet, en de rand van 'clamp'
 *   en het vlak met één uv-punt hebben de kleur van het plaatje;
 * - een echte muisklik op een vlak roept toets(actie) aan, bij overlap die van
 *   het voorste (dezelfde als klikOp), en een uitgeschakeld of verborgen vlak
 *   doet niets;
 * - een ander menu wisselt het plaatje en de vlakken; twee nieuwe plaatjes
 *   worden tegelijk gevraagd, niet na elkaar;
 * - een plaatje dat niet bestaat laat eerst het vorige beeld staan en wordt na
 *   drie pogingen overgeslagen; een latere poging die blijft hangen zet het
 *   scherm niet stil;
 * - een plaatje dat blijft hangen: eerst het oude beeld MET zijn knoppen, na
 *   drie tellen zonder dat plaatje;
 * - zonder getallen en meshvlaggen (plugin van voor versie 13) blijft de
 *   terugval staan, zonder knoppen;
 * - geen zijwaartse schuifbalk.
 *
 * Daarna DE ECHTE ALMEX: core/schermvorm.ts bouwt de vorm uit model_21_main.cfg
 * van de HH20, core/schermtextuur.ts levert de plaatjes zoals de server, en het
 * onderdeel tekent menu 0 en menu 26 met de teksten van Lucs schermafdruk
 * ('    LEE', 'LEER', '--:--', '04:13:07'). Nagerekend: de achtergrond tegen
 * 17_almex_s_0.jpg en 17_almex_s_26.jpg met de afbeelding uit de vorm zelf, de
 * uitsnede rij 122,9..901,2 (nakijken_achtergrond.md §9), dat de klok precies
 * daar verandert waar tekstopmaak.ts hem zet, en een tik op 'Einstieg vorn'.
 *
 * De afdrukken en de bundel komen in de kladmap `bouw-tekenen` (of in de map
 * uit PROEF_UIT).
 */
const { app, BrowserWindow } = require('electron')
const http = require('node:http')
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { pathToFileURL } = require('node:url')

const WT = join(__dirname, '..')
/*
 * PROEF_BRON=<map>: het onderdeel en shared/schermteken.ts uit die map (met
 * dezelfde indeling als het project) in plaats van uit het project -- om een
 * oudere versie tegen dezelfde proef te houden.
 */
const BRON = process.env.PROEF_BRON || WT
const OMSI = 'C:/Program Files (x86)/Steam/steamapps/common/OMSI 2'
const TEXTUUR = join(OMSI, 'Vehicles/HH20_EBus2021/Texture')
/*
 * Waar de afdrukken heen gaan. Dit wees eerst naar het kladblok van de sessie
 * die de proef schreef, en dat bestaat voor niemand anders -- ook niet voor
 * dezelfde gebruiker een week later.
 */
const UIT = process.env.PROEF_UIT || join(require('node:os').tmpdir(), 'omsi-apparaatscherm')
mkdirSync(UIT, { recursive: true })
/*
 * PROEF_DPR=3: alles met drie beeldpunten per CSS-punt, zoals op een telefoon.
 * Via de schakelaar van Chromium en niet via enableDeviceEmulation: die laat
 * devicePixelRatio 3 zeggen maar tekent gewoon op 1.
 */
const DPR = Number(process.env.PROEF_DPR) || 1
if (DPR !== 1) app.commandLine.appendSwitch('force-device-scale-factor', String(DPR))
const NAAM = DPR !== 1 ? `-dpr${DPR}` : ''
/* Moet gelijk zijn aan LAAD_GEDULD_MS en OPNIEUW_NA_OPGEVEN_MS in apparaatscherm.tsx. */
const LAAD_GEDULD_MS = 3000
const OPNIEUW_NA_OPGEVEN_MS = 10_000

const wacht = (ms) => new Promise((r) => setTimeout(r, ms))
const js = (w, code) => w.webContents.executeJavaScript(code)
let fouten = 0
function klopt(ok, wat, extra) {
  if (!ok) fouten++
  console.log(`${ok ? 'OK  ' : 'FOUT'} ${wat}${extra !== undefined ? ': ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : ''}`)
}

/* ------------------------------------------------------------------------- *
 * Een lettertype van OMSI, gelezen zoals nakijken_letters.md §1-2 het zegt,
 * tot een `Schermfont` (shared/scherm.ts). Klein en alleen voor deze proef;
 * de echte lezer is core/oft.ts (nagerekend: voor HH20_HHAschedule_font geven
 * ze alle 79 tekens byte voor byte gelijk).
 * ------------------------------------------------------------------------- */
function leesFont(oftNaam, fontNaam) {
  const bytes = readFileSync(join(OMSI, 'Fonts', oftNaam))
  const tekst = bytes[0] === 0xff && bytes[1] === 0xfe ? bytes.subarray(2).toString('utf16le') : bytes.toString('latin1')
  /* Een regel eindigt op CR; de LF erna wordt overgeslagen. */
  const regels = tekst.split('\r').map((r, i) => (i > 0 && r.startsWith('\n') ? r.slice(1) : r))
  let i = 0
  const regel = () => (i < regels.length ? regels[i++] : '')
  const getal = (s) => {
    const t = s.replace(/^ +/, '')
    if (!/^[+-]?\d+$/.test(t)) throw new Error('geen getal: ' + JSON.stringify(s))
    return Number(t)
  }
  let font
  while (i < regels.length) {
    const r = regel()
    if (r === '[newfont]') {
      if (font && font.naam === fontNaam) break
      font = { naam: regel(), bitmap: regel(), alfa: regel(), hoogte: getal(regel()), sep: getal(regel()), tekens: [] }
    } else if (r === '[char]' && font) {
      const c = regel()
      const x1 = getal(regel())
      const x2 = getal(regel())
      const y = getal(regel())
      font.tekens.push({ c: c[0], x: x1, y, breedte: x2 - x1 })
    }
  }
  if (!font || font.naam !== fontNaam) throw new Error('font niet gevonden: ' + fontNaam)
  const bmp = readFileSync(join(OMSI, 'Fonts', font.alfa))
  const off = bmp.readUInt32LE(10)
  const w = bmp.readInt32LE(18)
  const h = bmp.readInt32LE(22)
  const bpp = bmp.readUInt16LE(28)
  const stride = Math.ceil((w * bpp) / 32) * 4
  const alfa = (x, y) => {
    if (y < 0 || y >= Math.abs(h)) return 0
    const p = off + (h > 0 ? Math.abs(h) - 1 - y : y) * stride + 3 * x
    return p < bmp.length ? bmp[p] : 0
  }
  return {
    naam: font.naam,
    hoogte: font.hoogte,
    sep: font.sep,
    tekens: font.tekens.map((t) => {
      const b = Math.max(0, t.breedte)
      const a = Buffer.alloc(b * font.hoogte)
      for (let y = 0; y < font.hoogte; y++) for (let x = 0; x < b; x++) a[y * b + x] = alfa(t.x + x, t.y + y)
      return { teken: t.c, breedte: t.breedte, alfa: a.toString('base64') }
    })
  }
}

/* ------------------------------------------------------------------------- *
 * Een servertje op 127.0.0.1 voor plaatjes die niet (meteen) komen: onder
 * /hang/ antwoordt het nooit (een tablet waarvan de wifi hapert), onder
 * /fout-dan-hang/ eerst drie keer 404 en daarna nooit meer.
 * ------------------------------------------------------------------------- */
function startServer() {
  const tel = new Map()
  const open = new Set()
  const server = http.createServer((req, res) => {
    const pad = decodeURIComponent((req.url || '').split('?')[0])
    const keer = (tel.get(pad) ?? 0) + 1
    tel.set(pad, keer)
    if (pad.startsWith('/hang/') || (pad.startsWith('/fout-dan-hang/') && keer > 3)) {
      open.add(req.socket)
      return
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('bestaat niet')
  })
  return new Promise((klaar) =>
    server.listen(0, '127.0.0.1', () =>
      klaar({
        tel,
        adres: `http://127.0.0.1:${server.address().port}`,
        stop: () => {
          for (const s of open) s.destroy()
          server.close()
        }
      })
    )
  )
}

/* ------------------------------------------------------------------------- *
 * De nep-vorm. Plekken in beeldpunten van 17_almex_s_0.jpg (1024 x 1024; het
 * scherm is rij 122,88..901,12), omgerekend naar (s, t).
 * ------------------------------------------------------------------------- */
const s = (x) => x / 1024
const t = (y) => (y - 122.88) / 778.24
/** Een rechthoek [s0, t0, s1, t1] uit jpg-beeldpunten. */
const vak = (x0, x1, y0, y1) => [s(x0), t(y0), s(x1), t(y1)]
/** Twee driehoeken: rechthoek op het scherm, rechthoek in het plaatje. */
function vierhoek([s0, t0, s1, t1], [u0, v0, u1, v1]) {
  return [s0, t0, u0, v0, s1, t0, u1, v0, s1, t1, u1, v1, s0, t0, u0, v0, s1, t1, u1, v1, s0, t1, u0, v1]
}
const MENU = 0
const deel = (extra) => ({ mesh: -1, zicht: [], diepte: 0, alfa: 0, adres: 'wrap', ...extra })
const HEEL = [0, 0, 1, 1]
const SCHERM_UV = [0.0005, -0.88, 1.0001, -0.12]
const achtergrond = (menu, textuur) => deel({ soort: 'beeld', zicht: [{ getal: MENU, waarde: menu }], textuur, driehoeken: vierhoek(HEEL, SCHERM_UV) })

const OVERLAGEN = {
  versp: vak(738, 855, 133, 206),
  groen: vak(20, 120, 600, 660),
  script: vak(130, 220, 600, 660),
  clamp: vak(20, 220, 250, 450),
  punt: vak(20, 220, 480, 560),
  klok: vak(252, 430, 132, 205),
  matrix: vak(444, 725, 133, 167),
  zwart: vak(20, 220, 700, 760)
}
const VERBORGEN = vak(430, 1000, 360, 540)
/* Alleen bij menu 3: een laag met een eigen plaatje, zodat dat menu twee nieuwe plaatjes nodig heeft. */
const LAAG3 = vak(600, 900, 600, 700)
const TT = (variabele, b, h, kleur, orientatie) => ({
  variabele, b, h, font: 'HH20_HHAschedule_font', fc: 0, kleur, orientatie, raster: 1
})

const vorm = {
  versie: 1,
  id: 'proef-almex-1',
  module: '/almex',
  verhouding: 185.3 / 133.9,
  leeg: '#000',
  delen: [
    /* De achtergronden, één per menu. */
    achtergrond(0, 's0'),
    achtergrond(26, 's26'),
    achtergrond(7, 'kapot'),
    achtergrond(3, 's3'),
    achtergrond(8, 'hang'),
    achtergrond(9, 'foutdanhang'),
    /* Het vertragingsvlak: rood, mengen met 0,75. */
    deel({ soort: 'beeld', textuur: 'rot', alfa: 2, kleur: [1, 1, 1, 0.75], diepte: 0.5, driehoeken: vierhoek(OVERLAGEN.versp, [0.7201, -0.8714, 0.8343, -0.7985]) }),
    deel({ soort: 'kleur', kleur: [0.15, 0.7, 0.3, 1], diepte: 0.5, driehoeken: vierhoek(OVERLAGEN.groen, [0, 0, 1, 1]) }),
    deel({ soort: 'script', diepte: 0.5, driehoeken: vierhoek(OVERLAGEN.script, [0, 0, 1, 1]) }),
    /* Rand doorgetrokken: u 0,8..1,3 van menu 26, rechts van u = 1 de laatste kolom. */
    deel({ soort: 'beeld', textuur: 's26', adres: 'clamp', diepte: 0.5, driehoeken: vierhoek(OVERLAGEN.clamp, [0.8, 0.35, 1.3, 0.6]) }),
    /* Alle uv's op één punt: het rood van almex_versp_rot.jpg (780, 170). */
    deel({ soort: 'beeld', textuur: 'rot', diepte: 0.5, driehoeken: vierhoek(OVERLAGEN.punt, [780.5 / 1024, 170.5 / 1024, 780.5 / 1024, 170.5 / 1024]) }),
    /* Hoort bij menu 5: mag er bij menu 0 niet staan. */
    deel({ soort: 'kleur', zicht: [{ getal: MENU, waarde: 5 }], kleur: [1, 0, 0, 1], diepte: 0.5, driehoeken: vierhoek(VERBORGEN, [0, 0, 1, 1]) }),
    deel({ soort: 'beeld', zicht: [{ getal: MENU, waarde: 3 }], textuur: 's4', diepte: 0.5, driehoeken: vierhoek(LAAG3, [0.3, 0.3, 0.6, 0.4]) }),
    /* De klok: 256 x 256 zoals in de cfg; de mesh toont de middelste band. */
    deel({ soort: 'tekst', alfa: 2, diepte: 1, tekst: TT(0, 256, 256, [240, 230, 210], 0), driehoeken: vierhoek(OVERLAGEN.klok, [0, 0.297, 1, 0.703]) }),
    deel({ soort: 'tekst', alfa: 2, diepte: 1, tekst: TT(1, 512, 62, [255, 190, 40], 1), driehoeken: vierhoek(OVERLAGEN.matrix, [0, 0, 1, 1]) }),
    /* Tekst zonder [matl_alpha]: zwart waar geen letter staat. */
    deel({ soort: 'tekst', alfa: 0, diepte: 1, tekst: TT(0, 256, 77, [240, 230, 210], 0), driehoeken: vierhoek(OVERLAGEN.zwart, [0, 0, 1, 1]) })
  ],
  klikken: [
    { actie: 'Almex_Gross', opschrift: 'Groot vlak achter', mesh: -1, zicht: [], x: s(598), y: t(814), b: s(850) - s(598), h: t(897) - t(814), diepte: 0 },
    { actie: 'Almex_Display', opschrift: 'Display einst.', mesh: -1, zicht: [], x: s(255), y: t(814), b: s(82), h: t(897) - t(814), diepte: 1 },
    { actie: 'Almex_Admin', opschrift: 'Admin', mesh: -1, zicht: [], x: s(341), y: t(814), b: s(82), h: t(897) - t(814), diepte: 1 },
    { actie: 'Almex_Dienst', opschrift: 'Dienst anmeld.', mesh: -1, zicht: [], x: s(512), y: t(814), b: s(82), h: t(897) - t(814), diepte: 1 },
    { actie: 'Almex_FIMS', opschrift: 'FIMS', mesh: -1, zicht: [], x: s(598), y: t(814), b: s(82), h: t(897) - t(814), diepte: 1 },
    { actie: 'Almex_Einstieg', opschrift: 'Einstieg vorn', mesh: -1, zicht: [{ getal: MENU, waarde: 26 }], x: s(400), y: t(317), b: s(500), h: t(392) - t(317), diepte: 1 },
    /* Een vlak met een onmogelijke maat (een NaN wordt null in JSON): mag geen knop worden (en niets breken). */
    { actie: 'Almex_Kapot', opschrift: '', mesh: -1, zicht: [], x: null, y: 0.1, b: 0.1, h: 0.1, diepte: 1 }
  ],
  fonts: { HH20_HHAschedule_font: leesFont('HH20_HHAschedule_font.oft', 'HH20_HHAschedule_font') },
  stringvars: ['almex_s_uhrzeit', 'almex_s_matrix1'],
  getallen: ['almex_menu'],
  onvolledig: ['script: \\S:2 (proef)']
}
const stand = (menu, klok = '13:45:07') => ({ vorm: vorm.id, t: [klok, 'S-BAHN WEDEL'], g: [menu] })
const nepStanden = {
  menu0: stand(0),
  menu26: stand(26),
  menu3: stand(3),
  kapot: stand(7),
  haper: stand(8),
  kapot2: stand(9),
  kapot2b: stand(9, '88:88:88'),
  /* Een plugin van voor versie 13: geen getallen, geen meshvlaggen. */
  zonder: { vorm: vorm.id, t: ['13:45:07', 'S-BAHN WEDEL'] }
}
const ZICHTBAAR_MENU0 = ['Almex_Gross', 'Almex_Display', 'Almex_Admin', 'Almex_Dienst(uit)', 'Almex_FIMS']

/* ------------------------------------------------------------------------- *
 * De echte ALMEX: core/schermvorm.ts en core/schermtextuur.ts, voor node
 * gebundeld. Geeft de vorm, de plaatjes als bestanden, en wat de metingen
 * nodig hebben (afbeeldingen uit de vorm zelf).
 * ------------------------------------------------------------------------- */
const ECHT_INGANG = `
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { modulesVanModel } from ${JSON.stringify(join(WT, 'src/core/busmodule.ts').replace(/\\/g, '/'))}
import { schermVormVan } from ${JSON.stringify(join(WT, 'src/core/schermvorm.ts').replace(/\\/g, '/'))}
import { leesOmsiFonts, zoekFont, schermfontVan } from ${JSON.stringify(join(WT, 'src/core/oft.ts').replace(/\\/g, '/'))}
import { zoekSchermtextuur, textuurBron, beeldVoorBrowser } from ${JSON.stringify(join(WT, 'src/core/schermtextuur.ts').replace(/\\/g, '/'))}
import { decodeerFont, maakOp } from ${JSON.stringify(join(WT, 'src/shared/tekstopmaak.ts').replace(/\\/g, '/'))}
import { driehoekgroepen, omhulsel, tekenvolgorde, pasToe } from ${JSON.stringify(join(WT, 'src/shared/schermteken.ts').replace(/\\/g, '/'))}

export function echteAlmex(omsi: string, map: string, teksten: Record<string, string>) {
  const modelcfg = join(omsi, 'Vehicles/HH20_EBus2021/Model/model_21_main.cfg')
  const module = modulesVanModel(modelcfg).find((m) => /almex/i.test(m.id))
  if (!module) throw new Error('geen ALMEX-module in ' + modelcfg)
  const fonts = leesOmsiFonts(omsi)
  const bronnen = new Map<string, any>()
  const uit = schermVormVan({
    modelcfg, omsiMap: omsi, module,
    getallen: { trans_dauer: 1, almex_ein: 1, almex_menu: 0 },
    font: (naam, volkleur) => { const f = zoekFont(fonts, naam); return f ? schermfontVan(omsi, f, volkleur) : undefined },
    zoekTextuur: (naam) => zoekSchermtextuur(modelcfg, omsi, naam),
    bron: (pad, vlaggen) => { const b = textuurBron(pad, vlaggen as any); bronnen.set(b.id, b); return b }
  })
  if (!uit) throw new Error('geen vorm')
  const vorm = uit.vorm
  mkdirSync(join(map, 'tex'), { recursive: true })
  const adressen: Record<string, string> = {}
  const paden: Record<string, string> = {}
  for (const [id, b] of bronnen) {
    const g = beeldVoorBrowser(b)
    if (!g) continue
    const bestand = join(map, 'tex', id + (g.type === 'image/png' ? '.png' : g.type === 'image/jpeg' ? '.jpg' : '.bmp'))
    writeFileSync(bestand, g.bytes)
    adressen[id] = pathToFileURL(bestand).href
    paden[id] = b.pad
  }
  const g = (menu: number) => vorm.getallen.map((naam) => (naam === 'almex_menu' ? menu : naam === 'almex_ein' || naam === 'trans_dauer' ? 1 : 0))
  const t = (extra: Record<string, string> = {}) => vorm.stringvars.map((naam) => ({ ...teksten, ...extra })[naam] ?? '')
  const standen = {
    menu0: { vorm: vorm.id, t: t(), g: g(0) },
    klokLeeg: { vorm: vorm.id, t: t({ almex_s_uhrzeit: '' }), g: g(0) },
    menu26: { vorm: vorm.id, t: t(), g: g(26) }
  }
  /* Per menu: de achtergrond, de afbeelding van (s, t) terug naar uv, en de vlakken van de rest. */
  const inverse = (m: number[]) => { const det = m[0] * m[3] - m[1] * m[2]; const a = m[3] / det, b = -m[1] / det, c = -m[2] / det, d = m[0] / det
    return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])] }
  const meting = (naam: 'menu0' | 'menu26') => {
    const stand = standen[naam]
    const zichtbaar = tekenvolgorde(vorm, stand)
    const bg = zichtbaar.find((i) => vorm.delen[i].soort === 'beeld' && vorm.delen[i].zicht.some((z) => vorm.getallen[z.getal] === 'almex_menu'))!
    const groep = driehoekgroepen(vorm.delen[bg].driehoeken)[0]
    const rest = zichtbaar.filter((i) => i !== bg).map((i) => omhulsel(vorm.delen[i].driehoeken.filter((_, k) => k % 4 < 2)))
    /* De gedeelde rand van de eerste twee driehoeken: daar komt een naad als ze apart geknipt worden. */
    const d = vorm.delen[bg].driehoeken
    const hoek = (k: number) => [d[k], d[k + 1]]
    const eerste = [0, 4, 8].map(hoek)
    const tweede = [12, 16, 20].map(hoek)
    const naad = eerste.filter((p) => tweede.some((q) => Math.abs(p[0] - q[0]) < 1e-9 && Math.abs(p[1] - q[1]) < 1e-9))
    return { adres: adressen[vorm.delen[bg].textuur!], pad: paden[vorm.delen[bg].textuur!], terug: inverse(groep.m!), rest, naad,
      groepen: driehoekgroepen(d).length, hoeken: [pasToe(inverse(groep.m!), [0, 0]), pasToe(inverse(groep.m!), [1, 1])] }
  }
  /* De klok: waar tekstopmaak.ts '04:13:07' in zijn textuur zet, en waar dat op het scherm komt. */
  const ki = vorm.delen.findIndex((d) => d.tekst && vorm.stringvars[d.tekst.variabele] === 'almex_s_uhrzeit')
  const kd = vorm.delen[ki]
  const font = decodeerFont(vorm.fonts[kd.tekst!.font])
  const op = maakOp(font, kd.tekst!, teksten.almex_s_uhrzeit)
  const x0 = op.regels[0].x!, x1 = x0 + op.regels[0].breedte, y0 = op.y0, y1 = y0 + font.hoogte
  const kg = driehoekgroepen(kd.driehoeken)
  const hoeken = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([x, y]) => pasToe(kg[0].m!, [x / kd.tekst!.b, y / kd.tekst!.h]))
  const klok = { groepen: kg.length, textuur: [x0, y0, x1, y1], st: [Math.min(...hoeken.map((p) => p[0])), Math.min(...hoeken.map((p) => p[1])), Math.max(...hoeken.map((p) => p[0])), Math.max(...hoeken.map((p) => p[1]))] }
  const einstieg = vorm.klikken.find((k) => k.actie === 'almex_click_sonderansg_1')
  return { vorm, adressen, standen, metingen: { menu0: meting('menu0'), menu26: meting('menu26') }, klok, einstieg,
    tellingen: { delen: vorm.delen.length, klikken: vorm.klikken.length, plaatjes: bronnen.size, onvolledig: vorm.onvolledig } }
}
`

async function echteAlmex(esbuild, map) {
  if (!existsSync(join(WT, 'src/core/schermvorm.ts'))) return undefined
  writeFileSync(join(map, 'echt-ingang.ts'), ECHT_INGANG)
  await esbuild.build({
    entryPoints: [join(map, 'echt-ingang.ts')],
    outfile: join(map, 'echt.cjs'),
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node20',
    external: ['electron'],
    logLevel: 'warning'
  })
  const teksten = { almex_s_ziel: '    LEE', almex_s_matrix1: 'LEER', almex_s_versp: '--:--', almex_s_uhrzeit: '04:13:07' }
  return require(join(map, 'echt.cjs')).echteAlmex(OMSI, map, teksten)
}

/* ------------------------------------------------------------------------- *
 * De testpagina: het onderdeel met de nep-vorm (en de echte), gebundeld met
 * esbuild.
 * ------------------------------------------------------------------------- */
const INGANG = `
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Apparaatscherm } from ${JSON.stringify(join(BRON, 'src/renderer/src/apparaatscherm.tsx').replace(/\\/g, '/'))}
import { klikOp } from ${JSON.stringify(join(BRON, 'src/shared/schermteken.ts').replace(/\\/g, '/'))}

const proef = (window as any).__proef
const toetsen: string[] = ((window as any).__toetsen = [])
let zet: (keuze: { welke: string; naam: string }) => void = () => {}
function Proef() {
  const [keuze, setKeuze] = useState({ welke: 'nep', naam: 'menu0' })
  zet = setKeuze
  const set = proef[keuze.welke]
  return (
    <div className="proef">
      <Apparaatscherm
        vorm={set.vorm}
        stand={set.standen[keuze.naam]}
        textuurAdres={(id) => set.adressen[id] ?? 'file:///bestaat/niet.jpg'}
        kan={(actie) => !proef.uit.includes(actie)}
        toets={(actie) => toetsen.push(actie)}
        fallback={<div className="terugval">terugval</div>}
      />
    </div>
  )
}
;(window as any).__zet = (naam: string) => zet({ welke: 'nep', naam })
;(window as any).__zetEcht = (naam: string) => zet({ welke: 'echt', naam })
;(window as any).__klikOp = (naam: string, s: number, t: number) => klikOp(proef.nep.vorm, proef.nep.standen[naam], s, t)?.actie ?? null
createRoot(document.getElementById('root')!).render(<Proef />)
`

/*
 * Vóór het onderdeel: elk plaatje dat de pagina vraagt, met het tijdstip; en
 * met ?safari een browser die zich gedraagt als WebKit -- geen
 * device-pixel-content-box, en getBoundingClientRect gedeeld door de `zoom`
 * (wat WebKit doet, en Chromium voor versie 128). De echte maat blijft te
 * vragen via __echteRect.
 */
const VOORAF = `
window.__verzoeken = []
;(() => {
  const d = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src')
  Object.defineProperty(HTMLImageElement.prototype, 'src', { ...d, set(w) { window.__verzoeken.push({ url: String(w), t: performance.now() }); d.set.call(this, w) } })
  const echt = Element.prototype.getBoundingClientRect
  window.__echteRect = (el) => echt.call(el)
  if (!location.search.includes('safari')) return
  window.__safari = true
  const zoomVan = (el) => { let z = 1; for (let n = el; n; n = n.parentElement) { const g = parseFloat(getComputedStyle(n).zoom); if (g > 0) z *= g } return z }
  Element.prototype.getBoundingClientRect = function () { const r = echt.call(this); const z = zoomVan(this); return new DOMRect(r.x / z, r.y / z, r.width / z, r.height / z) }
  const RO = window.ResizeObserver
  window.ResizeObserver = class extends RO {
    constructor(terug) { super((lijst, o) => terug(lijst.map((e) => ({ target: e.target, contentRect: e.contentRect, contentBoxSize: e.contentBoxSize, borderBoxSize: e.borderBoxSize })), o)) }
    observe(el, opties) { if (opties && opties.box === 'device-pixel-content-box') throw new TypeError('onbekende box'); super.observe(el, opties) }
  }
})()
`

async function bundel(server) {
  const esbuild = require(join(WT, 'node_modules/esbuild'))
  const map = join(UIT, 'bundel')
  mkdirSync(map, { recursive: true })
  writeFileSync(join(map, 'ingang.tsx'), INGANG)
  const echt = join(WT, 'src/shared/tekstopmaak.ts')
  await esbuild.build({
    entryPoints: [join(map, 'ingang.tsx')],
    outdir: map,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'chrome120',
    jsx: 'automatic',
    nodePaths: [join(WT, 'node_modules')],
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'warning',
    plugins: [
      {
        /* Bestaat shared/tekstopmaak.ts nog niet, dan een nep die de letters als blokjes zet. */
        name: 'tekstopmaak',
        setup(b) {
          b.onResolve({ filter: /tekstopmaak$/ }, () =>
            existsSync(echt) ? { path: echt } : { path: 'nep-tekstopmaak', namespace: 'nep' }
          )
          b.onLoad({ filter: /.*/, namespace: 'nep' }, () => ({
            loader: 'ts',
            contents: `
              export const decodeerFont = (f: any) => f
              export function tekenTekst(f: any, tt: any, tekst: string): Uint8ClampedArray {
                const uit = new Uint8ClampedArray(tt.b * tt.h * 4)
                const h = f ? f.hoogte : 0, y0 = Math.trunc((tt.h - h) / 2)
                let x = Math.max(0, Math.trunc((tt.b - tekst.length * 12) / 2))
                for (const _c of tekst) { for (let y = 0; y < h; y++) for (let j = 0; j < 9; j++) {
                  const px = x + j, py = y0 + y
                  if (px < 0 || py < 0 || px >= tt.b || py >= tt.h) continue
                  const i = (py * tt.b + px) * 4; uit[i] = tt.kleur[0]; uit[i + 1] = tt.kleur[1]; uit[i + 2] = tt.kleur[2]; uit[i + 3] = 255
                } x += 12 }
                return uit
              }`
          }))
        }
      }
    ]
  })
  console.log('tekstopmaak:', existsSync(echt) ? 'echt (src/shared/tekstopmaak.ts)' : 'nep')

  let echteVorm
  try {
    echteVorm = await echteAlmex(esbuild, map)
  } catch (fout) {
    klopt(false, 'echte ALMEX bouwen (core/schermvorm.ts)', String(fout && fout.stack ? fout.stack.split('\n').slice(0, 3).join(' | ') : fout))
  }

  const bestand = (naam) => pathToFileURL(join(TEXTUUR, naam)).href
  const proef = {
    nep: {
      vorm,
      standen: nepStanden,
      adressen: {
        s0: bestand('17_almex_s_0.jpg'),
        s26: bestand('17_almex_s_26.jpg'),
        s3: bestand('17_almex_s_3.jpg'),
        s4: bestand('17_almex_s_4.jpg'),
        rot: bestand('almex_versp_rot.jpg'),
        kapot: bestand('bestaat_niet_17_almex_s_7.jpg'),
        hang: `${server.adres}/hang/17_almex_s_8.jpg`,
        foutdanhang: `${server.adres}/fout-dan-hang/17_almex_s_9.jpg`
      }
    },
    echt: echteVorm ? { vorm: echteVorm.vorm, standen: echteVorm.standen, adressen: echteVorm.adressen } : undefined,
    uit: ['Almex_Dienst'],
    overlagen: OVERLAGEN,
    verborgen: VERBORGEN
  }
  writeFileSync(join(map, 'proef.js'), 'window.__proef = ' + JSON.stringify(proef) + ';\n')
  writeFileSync(join(map, 'vooraf.js'), VOORAF)
  writeFileSync(
    join(map, 'index.html'),
    `<!doctype html><html lang="nl"><head><meta charset="utf-8" />
<link rel="stylesheet" href="ingang.css" />
<style>
  html, body { margin: 0; background: #0e1522; color: #e8ebf2; font-family: system-ui, sans-serif; }
  .proef { box-sizing: border-box; width: 100%; padding: 16px; }
  .terugval { height: 120px; display: grid; place-items: center; border: 1px dashed #888; }
</style></head><body><div id="root"></div>
<script src="vooraf.js"></script><script src="proef.js"></script><script src="ingang.js"></script></body></html>`
  )
  return { pagina: join(map, 'index.html'), echt: echteVorm }
}

/* ------------------------------------------------------------------------- *
 * Metingen in de pagina.
 * ------------------------------------------------------------------------- */

/**
 * Het canvas tegen 17_almex_s_0.jpg: op een raster van punten buiten de lagen
 * het gemiddelde verschil per kanaal (0..255), en ter vergelijking hetzelfde
 * met het plaatje 1% van de hoogte verschoven. Het plaatje wordt rond elk punt
 * over de voetafdruk van één canvaspunt gemiddeld (het canvas is kleiner).
 */
const METING = `(async () => {
  const P = window.__proef.nep
  const doek = document.querySelector('.scherm-doek')
  const W = doek.width, H = doek.height
  const beeld = doek.getContext('2d').getImageData(0, 0, W, H).data
  const img = new Image(); img.src = P.adressen.s0; await img.decode()
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight
  const cx = c.getContext('2d'); cx.drawImage(img, 0, 0)
  const bron = cx.getImageData(0, 0, c.width, c.height).data
  const bw = c.width, bh = c.height
  const px = (X, Y, k) => { X = Math.min(bw - 1, Math.max(0, X)); Y = Math.min(bh - 1, Math.max(0, Y)); return bron[(Y * bw + X) * 4 + k] }
  const bilin = (X, Y, k) => { const x0 = Math.floor(X), y0 = Math.floor(Y), fx = X - x0, fy = Y - y0
    return px(x0, y0, k) * (1 - fx) * (1 - fy) + px(x0 + 1, y0, k) * fx * (1 - fy) + px(x0, y0 + 1, k) * (1 - fx) * fy + px(x0 + 1, y0 + 1, k) * fx * fy }
  const verwacht = (s, t, dv, k) => { const voet = bw / W; let som = 0, n = 0
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const u = 0.0005 + (s + (a * voet) / 3 / bw) * 0.9996, v = 0.12 + (t + (b * voet) / 3 / (0.76 * bh)) * 0.76 + dv
      som += bilin(u * bw - 0.5, v * bh - 0.5, k); n++ }
    return som / n }
  const uit = [...Object.values(window.__proef.overlagen)]
  const vrij = (s, t) => uit.every(([s0, t0, s1, t1]) => s < s0 - 0.02 || s > s1 + 0.02 || t < t0 - 0.02 || t > t1 + 0.02)
  let goed = 0, verschoven = 0, n = 0
  for (let j = 0; j < 30; j++) for (let i = 0; i < 40; i++) {
    const x = Math.floor(((i + 0.5) / 40) * W), y = Math.floor(((j + 0.5) / 30) * H)
    const s = (x + 0.5) / W, t = (y + 0.5) / H
    if (!vrij(s, t)) continue
    for (let k = 0; k < 3; k++) { const echt = beeld[(y * W + x) * 4 + k]
      goed += Math.abs(echt - verwacht(s, t, 0, k)); verschoven += Math.abs(echt - verwacht(s, t, 0.01, k)); n++ }
  }
  /* Een punt midden in een onderdeel, als [r, g, b]. */
  const op = ([s0, t0, s1, t1], fs = 0.5, ft = 0.5) => { const x = Math.floor((s0 + (s1 - s0) * fs) * W), y = Math.floor((t0 + (t1 - t0) * ft) * H)
    return [0, 1, 2].map((k) => beeld[(y * W + x) * 4 + k]) }
  /* Rechts van u = 1 in het 'clamp'-vlak: de laatste kolom van menu 26 op dezelfde rij. */
  const s26 = new Image(); s26.src = P.adressen.s26; await s26.decode()
  const c2 = document.createElement('canvas'); c2.width = 1024; c2.height = 1024; c2.getContext('2d').drawImage(s26, 0, 0)
  const cl = window.__proef.overlagen.clamp
  const fs = 0.8, ft = 0.5, v = 0.35 + ft * 0.25
  const rand = [...c2.getContext('2d').getImageData(1023, Math.floor(v * 1024), 1, 1).data].slice(0, 3)
  const vb = window.__proef.verborgen
  return { W, H, n: n / 3, verschil: +(goed / n).toFixed(2), verschilVerschoven: +(verschoven / n).toFixed(2),
    verborgen: op(vb, 0.2, 0.5), verborgenPlaatje: [0, 1, 2].map((k) => Math.round(verwacht(vb[0] + 0.2 * (vb[2] - vb[0]), (vb[1] + vb[3]) / 2, 0, k))),
    groen: op(window.__proef.overlagen.groen), script: op(window.__proef.overlagen.script), punt: op(window.__proef.overlagen.punt),
    clamp: op(cl, fs, ft), clampRand: rand, zwart: op(window.__proef.overlagen.zwart, 0.05, 0.1) }
})()`

const STAAT = `(() => {
  const w = document.querySelector('.apparaatscherm'), d = document.querySelector('.scherm-doek'), r = window.__echteRect(d)
  const v = window.__echteRect(document.querySelector('.scherm-vlak'))
  return { beeld: w.dataset.beeld, terugval: Boolean(document.querySelector('.terugval')), wacht: document.querySelector('.scherm-vlak').classList.contains('wacht'),
    doek: [d.width, d.height], css: [+r.width.toFixed(2), +r.height.toFixed(2)], dpr: devicePixelRatio,
    vlak: [v.left, v.top, v.width, v.height], klikken: [...document.querySelectorAll('.scherm-klik')].map((k) => k.dataset.actie + (k.disabled ? '(uit)' : '')),
    schuif: document.documentElement.scrollWidth > innerWidth }
})()`

/** Eén beeldpunt van het canvas op (fs, ft) als [r, g, b]. */
const PUNT = (fs, ft) =>
  `(() => { const d = document.querySelector('.scherm-doek'); return [...d.getContext('2d').getImageData(Math.floor(d.width * ${fs}), Math.floor(d.height * ${ft}), 1, 1).data].slice(0, 3) })()`

/** Een vingerafdruk van een stuk van het canvas, [s0, t0, s1, t1]. */
const AFDRUK = ([s0, t0, s1, t1]) => `(() => { const d = document.querySelector('.scherm-doek'), x = Math.floor(d.width * ${s0}), y = Math.floor(d.height * ${t0})
  const b = Math.max(1, Math.floor(d.width * ${s1}) - x), h = Math.max(1, Math.floor(d.height * ${t1}) - y)
  let som = 0; const p = d.getContext('2d').getImageData(x, y, b, h).data; for (let i = 0; i < p.length; i++) som = (som * 31 + p[i]) >>> 0; return som })()`

async function wachtOp(w, code, ms = 10000) {
  const tot = Date.now() + ms
  while (Date.now() < tot) {
    if (await js(w, code)) return true
    await wacht(50)
  }
  return false
}

/** Een echte muisklik op (s, t) van het scherm. */
async function klik(w, sT, tT) {
  const [x0, y0, b, h] = (await js(w, STAAT)).vlak
  const x = Math.round(x0 + sT * b)
  const y = Math.round(y0 + tT * h)
  w.webContents.sendInputEvent({ type: 'mouseMove', x, y })
  w.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 })
  w.webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 })
  await wacht(120)
  return js(w, 'window.__toetsen.splice(0)')
}

function nieuwVenster(breed, hoog) {
  const venster = new BrowserWindow({
    width: breed,
    height: hoog,
    show: false,
    useContentSize: true,
    /* webSecurity uit: alleen om het canvas met file://-plaatjes te mogen uitlezen. */
    webPreferences: { offscreen: true, webSecurity: false }
  })
  const staat = { laatste: undefined }
  venster.webContents.on('paint', (_e, _v, beeld) => (staat.laatste = beeld))
  venster.webContents.setFrameRate(30)
  venster.webContents.on('console-message', (_e, niveau, bericht) => niveau >= 2 && !/Security Warning|willReadFrequently/.test(bericht) && console.log('  pagina:', bericht))
  return { venster, staat }
}

async function afdruk(venster, staat, naam) {
  venster.webContents.invalidate()
  await wacht(400)
  if (staat.laatste && !staat.laatste.isEmpty()) {
    writeFileSync(join(UIT, naam), staat.laatste.toPNG())
    console.log('  afdruk:', join(UIT, naam), staat.laatste.getSize())
  } else klopt(false, 'afdruk ' + naam)
}

/* ------------------------------------------------------------------------- *
 * De nep-vorm op één maat.
 * ------------------------------------------------------------------------- */
async function nepProef(pagina, server, breed, hoog) {
  console.log(`\n== ${breed} x ${hoog}`)
  const { venster, staat } = nieuwVenster(breed, hoog)
  await venster.loadFile(pagina)
  if (breed > 1000) await js(venster, `document.querySelector('.proef').style.setProperty('--paneel-hoog', '780px')`)

  const eerst = await js(venster, STAAT)
  klopt(eerst.beeld === 'ja' || (eerst.terugval && eerst.wacht && eerst.klikken.length === 0), 'terugval tot het eerste beeld, zonder knoppen', eerst)
  klopt(await wachtOp(venster, `document.querySelector('.apparaatscherm').dataset.beeld === 'ja'`), 'eerste beeld getekend')
  await wacht(200)
  const na = await js(venster, STAAT)
  klopt(!na.terugval && !na.wacht, 'terugval weg')
  klopt(Math.abs(na.doek[0] - na.css[0] * na.dpr) <= 1 && Math.abs(na.doek[1] - na.css[1] * na.dpr) <= 1, 'canvas = CSS-maat x dpr', na)
  klopt(!na.schuif, 'geen zijwaartse schuifbalk')
  klopt(Math.abs(na.css[0] / na.css[1] - vorm.verhouding) < 0.01, 'verhouding van het scherm', +(na.css[0] / na.css[1]).toFixed(3))
  klopt(JSON.stringify(na.klikken) === JSON.stringify(ZICHTBAAR_MENU0), 'vlakken bij menu 0 (Einstieg verborgen, Dienst uit, NaN-vlak geen knop)', na.klikken)

  const m = await js(venster, METING)
  klopt(m.verschil < 10 && m.verschilVerschoven > 2 * m.verschil, 'plaatje op zijn plek (verschil tegen de jpg, en met 1% verschoven)', { punten: m.n, verschil: m.verschil, verschoven: m.verschilVerschoven })
  klopt(m.verborgen.every((k, i) => Math.abs(k - m.verborgenPlaatje[i]) < 30), 'menu-5-vlak niet getekend', { canvas: m.verborgen, plaatje: m.verborgenPlaatje })
  klopt(Math.abs(m.groen[0] - 38) < 3 && Math.abs(m.groen[1] - 179) < 3 && Math.abs(m.groen[2] - 77) < 3, "'kleur' in materiaalkleur", m.groen)
  klopt(m.script.every((k) => k === 0), "'script' in de lege kleur", m.script)
  klopt(m.punt[0] > 180 && m.punt[1] < 60 && m.punt[2] < 40, 'één uv-punt: effen rood', m.punt)
  klopt(m.clamp.every((k, i) => Math.abs(k - m.clampRand[i]) < 12), "'clamp': laatste kolom doorgetrokken", { canvas: m.clamp, kolom1023: m.clampRand })
  klopt(m.zwart.every((k) => k < 8), 'tekst met alfa 0: zwart waar geen letter staat', m.zwart)
  await afdruk(venster, staat, `apparaatscherm-${breed}${NAAM}.png`)

  /* Tikken. Midden op Display, op FIMS (voor Gross), op Meldg. (alleen Gross), op Dienst (uit), op Einstieg (verborgen). */
  const midden = (k) => [k.x + k.b / 2, k.y + k.h / 2]
  const [display, dienst, fims] = [vorm.klikken[1], vorm.klikken[3], vorm.klikken[4]]
  const proeven = [
    ['Display', midden(display)],
    ['FIMS over Gross', midden(fims)],
    ['alleen Gross', [s(810), t(855)]],
    ['Dienst (uit)', midden(dienst)],
    ['Einstieg (verborgen)', midden(vorm.klikken[5])]
  ]
  for (const [wat, [ks, kt]] of proeven) {
    const gekregen = await klik(venster, ks, kt)
    const volgensKlikOp = await js(venster, `window.__klikOp('menu0', ${ks}, ${kt})`)
    const verwacht = wat.startsWith('Dienst') ? [] : volgensKlikOp ? [volgensKlikOp] : []
    klopt(JSON.stringify(gekregen) === JSON.stringify(verwacht), `tik ${wat} -> toets`, { toets: gekregen, klikOp: volgensKlikOp })
  }

  /* CSS-zoom, zoals de tablet het paneel schaalt: meer beeldpunten, zelfde plek. */
  await js(venster, `document.querySelector('.proef').style.zoom = '1.5'`)
  await wacht(300)
  const zoom = await js(venster, STAAT)
  klopt(Math.abs(zoom.doek[0] - zoom.css[0] * zoom.dpr) <= 1, 'onder zoom 1,5 canvas = maat in beeld x dpr', zoom)
  await js(venster, `document.querySelector('.proef').style.zoom = ''`)
  await wacht(300)

  if (breed === 390) {
    /* Twee nieuwe plaatjes (menu 3: achtergrond en laag): tegelijk gevraagd, niet na elkaar. */
    await js(venster, `window.__verzoeken.length = 0; window.__zet('menu3')`)
    await wachtOp(venster, `window.__verzoeken.length >= 2`, 3000)
    await wacht(300)
    const verzoeken = await js(venster, `window.__verzoeken.filter((v) => /17_almex_s_[34]\\.jpg$/.test(v.url)).map((v) => [v.url.split('/').pop(), +v.t.toFixed(1)])`)
    const [a, b] = verzoeken
    klopt(verzoeken.length === 2 && Math.abs(a[1] - b[1]) < 8, 'menu 3: beide nieuwe plaatjes tegelijk gevraagd', verzoeken)

    /* Zonder getallen en meshvlaggen: de terugval, geen knoppen. Daarna weer het scherm. */
    await js(venster, `window.__zet('zonder')`)
    await wacht(300)
    const zonder = await js(venster, STAAT)
    klopt(zonder.terugval && zonder.wacht && zonder.klikken.length === 0, 'zonder getallen (plugin < 13): terugval, geen knoppen', zonder)
    await js(venster, `window.__zet('menu0')`)
    const terug = await wachtOp(venster, `!document.querySelector('.terugval') && document.querySelectorAll('.scherm-klik').length === 5`, 2000)
    klopt(terug, 'met getallen: weer het scherm met zijn knoppen')

    /* Menu 26: ander plaatje, Einstieg wel. */
    await js(venster, `window.__zet('menu26')`)
    await wacht(600)
    const m26 = await js(venster, STAAT)
    klopt(m26.klikken.includes('Almex_Einstieg'), 'menu 26: Einstieg erbij', m26.klikken)
    const tik = await klik(venster, ...midden(vorm.klikken[5]))
    klopt(JSON.stringify(tik) === '["Almex_Einstieg"]', 'menu 26: tik Einstieg', tik)
    await afdruk(venster, staat, `apparaatscherm-${breed}${NAAM}-menu26.png`)

    /*
     * Een plaatje dat blijft hangen (menu 8). Het oude beeld blijft staan, en
     * de knoppen horen bij DAT beeld: Einstieg blijft. Na LAAD_GEDULD_MS het
     * scherm zonder dat plaatje, met de knoppen van menu 8.
     */
    const pixel = PUNT(0.6, 0.55)
    const voor26 = await js(venster, pixel)
    const begin8 = Date.now()
    await js(venster, `window.__zet('haper')`)
    await wacht(400)
    const tijdens = await js(venster, STAAT)
    const tijdensPixel = await js(venster, pixel)
    klopt(JSON.stringify(tijdensPixel) === JSON.stringify(voor26) && tijdens.klikken.includes('Almex_Einstieg'), 'hangend plaatje: oude beeld blijft, met ZIJN knoppen', { pixel: tijdensPixel, klikken: tijdens.klikken })
    const zonderPlaatje = await wachtOp(venster, `(${pixel}).every((k) => k === 0) && ![...document.querySelectorAll('.scherm-klik')].some((k) => k.dataset.actie === 'Almex_Einstieg')`, LAAD_GEDULD_MS + 3000)
    klopt(zonderPlaatje, `hangend plaatje: na ${LAAD_GEDULD_MS / 1000} s zonder getekend, knoppen van het nieuwe menu`, `${((Date.now() - begin8) / 1000).toFixed(1)} s`)

    /* Menu 7: het plaatje bestaat niet. Eerst het oude beeld laten staan, dan zonder. */
    await js(venster, `window.__zet('menu0')`)
    await wacht(600)
    const voor = await js(venster, pixel)
    const begin = Date.now()
    await js(venster, `window.__zet('kapot')`)
    await wacht(1200)
    const tussen = await js(venster, pixel)
    klopt(JSON.stringify(tussen) === JSON.stringify(voor), 'ontbrekend plaatje: vorige beeld blijft staan', { voor, tussen })
    const gelukt = await wachtOp(venster, `(${pixel}).every((k) => k === 0)`, 15000)
    klopt(gelukt, 'na drie pogingen zonder het plaatje getekend', `${((Date.now() - begin) / 1000).toFixed(1)} s`)
    await afdruk(venster, staat, `apparaatscherm-${breed}${NAAM}-kapot.png`)

    /*
     * Menu 9: drie keer 404, en de vierde poging (na OPNIEUW_NA_OPGEVEN_MS)
     * blijft hangen. Die poging mag het scherm niet stilzetten: een andere
     * klok moet gewoon verschijnen.
     */
    const PAD9 = '/fout-dan-hang/17_almex_s_9.jpg'
    await js(venster, `window.__zet('kapot2')`)
    const opgegeven = await wachtOp(venster, `(${pixel}).every((k) => k === 0)`, 15000)
    klopt(opgegeven, 'menu 9: na drie keer 404 zonder het plaatje getekend', { verzoeken: server.tel.get(PAD9) })
    const tot = Date.now() + OPNIEUW_NA_OPGEVEN_MS + 5000
    while ((server.tel.get(PAD9) ?? 0) < 4 && Date.now() < tot) await wacht(100)
    klopt((server.tel.get(PAD9) ?? 0) >= 4, 'menu 9: vierde poging (die blijft hangen) is onderweg', { verzoeken: server.tel.get(PAD9) })
    const klok = AFDRUK(OVERLAGEN.klok)
    const klokVoor = await js(venster, klok)
    await js(venster, `window.__zet('kapot2b')`)
    const bijgewerkt = await wachtOp(venster, `(${klok}) !== ${klokVoor}`, 1500)
    klopt(bijgewerkt, 'menu 9: tijdens de hangende poging wordt de nieuwe klok getekend')
  }
  venster.destroy()
}

/* ------------------------------------------------------------------------- *
 * Als Safari: geen device-pixel-content-box en getBoundingClientRect zonder
 * zoom. De tablet vergroot het paneel met `zoom` en schaalt bij het draaien:
 * dat komt alleen via een 'resize' binnen.
 * ------------------------------------------------------------------------- */
async function safariProef(pagina) {
  console.log(`\n== als Safari, 390 breed`)
  const { venster } = nieuwVenster(390, DPR === 1 ? 844 : Math.floor(1400 / DPR))
  await venster.loadURL(pathToFileURL(pagina).href + '?safari')
  klopt(await wachtOp(venster, `document.querySelector('.apparaatscherm').dataset.beeld === 'ja'`), 'als Safari: eerste beeld getekend')
  for (const zoom of ['1', '1.5', '1.93']) {
    await js(venster, `document.querySelector('.proef').style.zoom = '${zoom}'; window.dispatchEvent(new Event('resize'))`)
    await wacht(500)
    const st = await js(venster, STAAT)
    klopt(Math.abs(st.doek[0] - st.css[0] * st.dpr) <= 1.5 && Math.abs(st.doek[1] - st.css[1] * st.dpr) <= 1.5, `als Safari, zoom ${zoom}: canvas = maat in beeld x dpr`, { doek: st.doek, inBeeld: st.css, dpr: st.dpr })
  }
  venster.destroy()
}

/* ------------------------------------------------------------------------- *
 * De echte ALMEX van de HH20.
 * ------------------------------------------------------------------------- */
const ECHT_METING = (naam) => `(async () => {
  const M = window.__meting['${naam}']
  const doek = document.querySelector('.scherm-doek')
  const W = doek.width, H = doek.height
  const beeld = doek.getContext('2d').getImageData(0, 0, W, H).data
  const img = new Image(); img.src = M.adres; await img.decode()
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight
  const cx = c.getContext('2d'); cx.drawImage(img, 0, 0)
  const bron = cx.getImageData(0, 0, c.width, c.height).data
  const bw = c.width, bh = c.height
  /* Herhalend, zoals 'wrap'. */
  const px = (X, Y, k) => { X = ((X % bw) + bw) % bw; Y = ((Y % bh) + bh) % bh; return bron[(Y * bw + X) * 4 + k] }
  const bilin = (X, Y, k) => { const x0 = Math.floor(X), y0 = Math.floor(Y), fx = X - x0, fy = Y - y0
    return px(x0, y0, k) * (1 - fx) * (1 - fy) + px(x0 + 1, y0, k) * fx * (1 - fy) + px(x0, y0 + 1, k) * (1 - fx) * fy + px(x0 + 1, y0 + 1, k) * fx * fy }
  const m = M.terug
  const uv = (s, t) => [m[0] * s + m[2] * t + m[4], m[1] * s + m[3] * t + m[5]]
  const verwacht = (s, t, dv, k) => { let som = 0, n = 0
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const [u, v] = uv(s + a / 3 / W, t + b / 3 / H); som += bilin(u * bw - 0.5, (v + dv) * bh - 0.5, k); n++ }
    return som / n }
  const vrij = (s, t) => M.rest.every(([x, y, b, h]) => s < x - 0.02 || s > x + b + 0.02 || t < y - 0.02 || t > y + h + 0.02)
  let goed = 0, verschoven = 0, n = 0
  for (let j = 0; j < 30; j++) for (let i = 0; i < 40; i++) {
    const x = Math.floor(((i + 0.5) / 40) * W), y = Math.floor(((j + 0.5) / 30) * H)
    const s = (x + 0.5) / W, t = (y + 0.5) / H
    if (!vrij(s, t)) continue
    for (let k = 0; k < 3; k++) { const echt = beeld[(y * W + x) * 4 + k]
      goed += Math.abs(echt - verwacht(s, t, 0, k)); verschoven += Math.abs(echt - verwacht(s, t, 0.01, k)); n++ }
  }
  /*
   * Langs de gedeelde rand van de twee driehoeken: elk beeldpunt dat de lijn
   * raakt, tegen het plaatje. Een naad maakt ze tot een kwart donkerder.
   */
  let naad = 0, nn = 0, slechtst = 0
  if (M.naad.length === 2) {
    const [[a0, b0], [a1, b1]] = M.naad, gezien = new Set()
    for (let i = 0; i <= 4 * W; i++) { const f = i / (4 * W), s = a0 + (a1 - a0) * f, t = b0 + (b1 - b0) * f
      const x = Math.min(W - 1, Math.floor(s * W)), y = Math.min(H - 1, Math.floor(t * H))
      if (gezien.has(x + ',' + y)) continue; gezien.add(x + ',' + y)
      const ps = (x + 0.5) / W, pt = (y + 0.5) / H
      if (!vrij(ps, pt) || ps < 0.02 || ps > 0.98 || pt < 0.02 || pt > 0.98) continue
      let som = 0; for (let k = 0; k < 3; k++) som += Math.abs(beeld[(y * W + x) * 4 + k] - verwacht(ps, pt, 0, k))
      naad += som; nn += 3; slechtst = Math.max(slechtst, som / 3) }
  }
  return { W, H, punten: n / 3, verschil: +(goed / n).toFixed(2), verschoven: +(verschoven / n).toFixed(2),
    naadPunten: nn / 3, naad: +(naad / Math.max(1, nn)).toFixed(2), naadSlechtst: +slechtst.toFixed(1), groepen: M.groepen }
})()`

/** Welke canvaspunten verschillen tussen twee opnamen, binnen en buiten [s0, t0, s1, t1] (plus twee punten marge). */
const VERSCHIL = (box) => `(() => {
  const [a, b] = window.__opnamen, d = document.querySelector('.scherm-doek'), W = d.width, H = d.height
  const x0 = ${box[0]} * W - 2, y0 = ${box[1]} * H - 2, x1 = ${box[2]} * W + 2, y1 = ${box[3]} * H + 2
  let binnen = 0, buiten = 0; const voorbeelden = []
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4
    if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) <= 24) continue
    if (x >= x0 && x <= x1 && y >= y0 && y <= y1) binnen++; else { buiten++; if (voorbeelden.length < 5) voorbeelden.push([x, y]) } }
  return { binnen, buiten, voorbeelden, box: [Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1)] }
})()`
const OPNAME = `(() => { const d = document.querySelector('.scherm-doek'); (window.__opnamen ??= []).push(d.getContext('2d').getImageData(0, 0, d.width, d.height).data); return window.__opnamen.length })()`

async function echteProef(pagina, echt, breed, hoog) {
  console.log(`\n== de echte ALMEX van de HH20, ${breed} x ${hoog}`)
  console.log('  vorm:', JSON.stringify(echt.tellingen))
  const [u0, v0] = echt.metingen.menu0.hoeken[0]
  const [u1, v1] = echt.metingen.menu0.hoeken[1]
  klopt(Math.abs(v0 - 122.9 / 1024) < 0.002 && Math.abs(v1 - 901.2 / 1024) < 0.002 && Math.abs(u0) < 0.002 && Math.abs(u1 - 1) < 0.002,
    'vorm: het scherm toont rij 122,9..901,2 van 17_almex_s_0.jpg over de volle breedte', { links_boven: [+(u0 * 1024).toFixed(1), +(v0 * 1024).toFixed(1)], rechts_onder: [+(u1 * 1024).toFixed(1), +(v1 * 1024).toFixed(1)] })

  const { venster, staat } = nieuwVenster(breed, hoog)
  await venster.loadFile(pagina)
  await js(venster, `window.__meting = ${JSON.stringify(echt.metingen)}; window.__proef.uit = []; window.__zetEcht('menu0')`)
  klopt(await wachtOp(venster, `document.querySelector('.apparaatscherm').dataset.beeld === 'ja' && document.querySelectorAll('.scherm-klik').length > 0 && document.querySelector('.scherm-klik').dataset.actie.startsWith('almex')`, 10000), 'echte ALMEX: menu 0 getekend')
  await wacht(300)
  const m0 = await js(venster, ECHT_METING('menu0'))
  klopt(m0.verschil < 10 && m0.verschoven > 2 * m0.verschil, 'echte ALMEX menu 0: achtergrond tegen 17_almex_s_0.jpg', m0)
  klopt(m0.naadPunten > 50 && m0.naad < m0.verschil + 3, 'echte ALMEX menu 0: geen naad over de diagonaal (twee driehoeken, elk hun eigen afbeelding)', { punten: m0.naadPunten, naad: m0.naad, slechtst: m0.naadSlechtst, rest: m0.verschil, groepen: m0.groepen })
  await afdruk(venster, staat, `echte-almex-${breed}${NAAM}-menu0.png`)

  /* De klok: alleen daar waar tekstopmaak.ts '04:13:07' zet, verandert er iets als de klok leeg is. */
  await js(venster, `window.__opnamen = []`)
  await js(venster, OPNAME)
  await js(venster, `window.__zetEcht('klokLeeg')`)
  await wacht(400)
  await js(venster, OPNAME)
  const v = await js(venster, VERSCHIL(echt.klok.st))
  klopt(v.binnen > 40 && v.buiten === 0, "echte ALMEX: '04:13:07' staat precies waar tekstopmaak.ts hem zet", { ...v, textuur: echt.klok.textuur, groepen: echt.klok.groepen })

  await js(venster, `window.__zetEcht('menu26')`)
  await wacht(600)
  const m26 = await js(venster, ECHT_METING('menu26'))
  klopt(m26.verschil < 10 && m26.verschoven > 2 * m26.verschil, 'echte ALMEX menu 26: achtergrond tegen 17_almex_s_26.jpg', m26)
  klopt(m26.naadPunten > 50 && m26.naad < m26.verschil + 3, 'echte ALMEX menu 26: geen naad over de diagonaal', { punten: m26.naadPunten, naad: m26.naad, slechtst: m26.naadSlechtst, rest: m26.verschil })
  const e = echt.einstieg
  if (e) {
    const tik = await klik(venster, e.x + e.b / 2, e.y + e.h / 2)
    klopt(JSON.stringify(tik) === '["almex_click_sonderansg_1"]', "echte ALMEX menu 26: tik op 'Einstieg vorn'", tik)
  } else klopt(false, 'echte ALMEX: klik almex_click_sonderansg_1 in de vorm')
  await afdruk(venster, staat, `echte-almex-${breed}${NAAM}-menu26.png`)
  venster.destroy()
}

app.on('window-all-closed', () => {})
app.whenReady().then(async () => {
  setTimeout(() => {
    console.log('te lang bezig')
    app.exit(2)
  }, 300000).unref()
  const server = await startServer()
  const { pagina, echt } = await bundel(server)

  /* Met meer beeldpunten per CSS-punt alleen de telefoon: een iPad van 1194 x 3 past niet op het scherm, en dan verkleint Windows het venster. */
  const maten = DPR === 1 ? [[390, 844], [1194, 834]] : [[390, Math.floor(1400 / DPR)]]
  /* PROEF_ALLEEN=echt: alleen de echte ALMEX (snel, om aan het tekenen te werken). */
  if (process.env.PROEF_ALLEEN !== 'echt') {
    for (const [breed, hoog] of maten) await nepProef(pagina, server, breed, hoog)
    await safariProef(pagina)
  }
  if (echt) await echteProef(pagina, echt, ...(DPR === 1 ? [1194, 834] : [390, Math.floor(1400 / DPR)]))
  else if (existsSync(join(WT, 'src/core/schermvorm.ts'))) klopt(false, 'echte ALMEX')

  server.stop()
  console.log(fouten ? `\n${fouten} FOUT(EN)` : '\nalles klopt')
  app.exit(fouten ? 1 : 0)
})
