import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { networkInterfaces } from 'node:os'
import { extname, join, resolve, sep } from 'node:path'
import { gzipSync } from 'node:zlib'
import type { ApparaatStand } from '../shared/api'

/*
 * De navigatie op je telefoon of tablet.
 *
 * WAT HET IS
 * Een kleine webserver in de app, alleen aan zolang de speler hem in de overlay
 * aanzet. Hij geeft de pagina `apparaat.html` -- dezelfde kaart als in de
 * telefoon van de overlay, zie renderer/src/navigatie.tsx -- en een stroom met
 * elk beeld dat ook naar de overlay gaat. Een telefoon die de QR-code scant,
 * opent die pagina in zijn eigen browser; er hoeft niets geïnstalleerd te
 * worden.
 *
 * WAAROM NIET LOCALHOST
 * Op een telefoon is localhost de telefoon zelf. Het adres in de QR-code is dat
 * van deze pc in het thuisnetwerk, en de server luistert dus op het netwerk en
 * niet alleen op deze machine. Windows vraagt de eerste keer of dat mag; dat
 * beslist de speler zelf, de app raakt de firewall niet aan.
 *
 * WAT ER DAARDOOR AFGESCHERMD MOET WORDEN
 * Iedereen op hetzelfde wifi kan de poort zien. Daarom:
 * - Alles staat achter een geheime sleutel in het pad (`/n/<sleutel>/`), 128
 *   bits uit `randomBytes`. Zonder sleutel antwoordt de server 404, ook op de
 *   pagina zelf -- hij zegt niet eens dat hij bestaat.
 * - Geen paden van buitenaf. De kaart en de routes zijn die van de dienst die
 *   nu loopt; de telefoon kan niet om een andere kaart of een ander bestand
 *   vragen. Wat er aan bestanden geserveerd wordt, komt uit de map met de
 *   gebouwde pagina's en nergens anders vandaan.
 * - Het personeelsnummer en de pincode gaan niet mee; zie `frameVoorApparaat`
 *   in index.ts. Aanmelden kan wel: het toestel stuurt wat er ingetoetst is
 *   naar de pc, en die kijkt na (`telefoonAanmelden`), met een rem op het
 *   aantal pogingen.
 * - Veranderen kan alleen via `POST api/telefoon`, en alleen de vijf dingen die
 *   op de telefoon zitten: aanmelden, overslaan, tekenen, pauze en IBIS. Er is
 *   geen adres dat aan je profiel, je kaarten of OMSI komt.
 */

/** Wat de server van het hoofdproces nodig heeft. */
export interface ApparaatBronnen {
  /** De map met de gebouwde pagina's: out/renderer. */
  paginas: string
  /** Het icoon voor het beginscherm van de telefoon. */
  icoon?: string
  /** Taal en versie, voor de pagina. */
  start(): unknown
  /** De geometrie van de kaart van de lopende dienst, of niets. */
  geometrie(): Promise<unknown | undefined>
  /** De routes van de ritten van de lopende dienst, of niets. */
  routes(): Promise<unknown | undefined>
  /** Wat de telefoon op het toestel doet; zie `TelefoonOpdracht`. */
  telefoon(opdracht: TelefoonOpdracht): unknown
  log(regel: string): void
}

/** Wat een toestel mag vragen. Alles wat er niet in staat, wordt geweigerd. */
export interface TelefoonOpdracht {
  wat: 'aanmelden' | 'overslaan' | 'aanvaard' | 'pauze' | 'ibis'
  nummer?: string
  pin?: string
  vanaf?: number
  tripKey?: string
}

/** Een eigen poort, zodat een bladwijzer op de telefoon blijft werken. */
export const APPARAAT_POORT = 47810

let server: Server | undefined
let sleutel = ''
let poort = 0
let fout: string | undefined
const kijkers = new Set<ServerResponse>()
let laatsteBeeld = ''
let wakker: ReturnType<typeof setInterval> | undefined
let bronnen: ApparaatBronnen | undefined

/** Een nieuwe sleutel voor in het adres. */
export function nieuweSleutel(): string {
  return randomBytes(16).toString('base64url')
}

/**
 * De adressen van deze pc in het thuisnetwerk, het waarschijnlijkste eerst.
 *
 * Een pc heeft er vaak meer dan één: wifi en kabel, maar ook de virtuele
 * netwerkkaarten van Hyper-V, WSL, VirtualBox of een VPN. Een telefoon op het
 * wifi bereikt alleen de echte. Dus eerst de gewone thuisreeksen (192.168.x,
 * dan 10.x, dan 172.16-31.x) op een kaart die niet virtueel klinkt, en de rest
 * daarachter. Een 169.254-adres is geen netwerk maar een kabel zonder router,
 * en telt niet mee.
 */
export function lanAdressen(): string[] {
  const gevonden: Array<{ adres: string; score: number }> = []
  for (const [naam, lijst] of Object.entries(networkInterfaces())) {
    for (const item of lijst ?? []) {
      if (item.family !== 'IPv4' || item.internal) continue
      if (item.address.startsWith('169.254.')) continue
      const virtueel = /vethernet|virtualbox|vmware|wsl|hyper-v|loopback|bluetooth|docker/i.test(naam)
      const [a, b] = item.address.split('.').map(Number)
      const reeks =
        a === 192 && b === 168 ? 0 : a === 10 ? 1 : a === 172 && b >= 16 && b <= 31 ? 2 : 3
      gevonden.push({ adres: item.address, score: reeks + (virtueel ? 10 : 0) })
    }
  }
  return gevonden.sort((x, y) => x.score - y.score).map((item) => item.adres)
}

/**
 * Op welk adres de server luistert. Op het netwerk, want daar staat de
 * telefoon. Een proef zet hem met OMSI_ENHANCER_APPARAAT_HOST op 127.0.0.1: dan
 * komt er geen vraag van de firewall op het scherm van iemand die niets aan het
 * testen is.
 */
function luisterAdres(): string {
  return process.env.OMSI_ENHANCER_APPARAAT_HOST || '0.0.0.0'
}

export function apparaatStand(): ApparaatStand {
  if (!server) return { aan: false, adressen: [], kijkers: 0, fout }
  const host = luisterAdres()
  const adressen = host === '0.0.0.0' ? lanAdressen() : [host]
  const eerste = adressen[0]
  return {
    aan: true,
    url: eerste ? `http://${eerste}:${poort}/n/${sleutel}/` : undefined,
    adressen: adressen.map((adres) => `http://${adres}:${poort}/n/${sleutel}/`),
    kijkers: kijkers.size,
    fout
  }
}

/** Is er iemand die meekijkt? Dan heeft het zin om beelden te maken. */
export function apparaatKijkt(): boolean {
  return kijkers.size > 0
}

/**
 * Zet de server aan. Staat hij al aan met dezelfde sleutel, dan blijft alles
 * zoals het is. Is de poort bezet, dan kiest Windows er een; die gaat terug naar
 * het hoofdproces zodat hij bewaard kan worden.
 */
export async function startApparaat(
  opties: { sleutel: string; poort?: number },
  metBronnen: ApparaatBronnen
): Promise<ApparaatStand & { poort: number }> {
  bronnen = metBronnen
  if (server && sleutel === opties.sleutel) return { ...apparaatStand(), poort }
  if (server) stopApparaat()
  sleutel = opties.sleutel
  fout = undefined

  const nieuw = createServer((vraag, antwoord) => {
    void behandel(vraag, antwoord).catch((reden) => {
      bronnen?.log(`apparaat: fout bij ${vraag.url?.replace(sleutel, '…') ?? '?'}: ${String(reden)}`)
      if (!antwoord.headersSent) antwoord.writeHead(500)
      antwoord.end()
    })
  })
  const gewenst = opties.poort ?? APPARAAT_POORT
  try {
    poort = await luister(nieuw, gewenst)
  } catch (reden) {
    const code = (reden as NodeJS.ErrnoException).code
    if (code !== 'EADDRINUSE' && code !== 'EACCES') {
      fout = String(reden)
      return { ...apparaatStand(), poort: 0 }
    }
    try {
      poort = await luister(nieuw, 0)
    } catch (opnieuw) {
      fout = String(opnieuw)
      return { ...apparaatStand(), poort: 0 }
    }
  }
  server = nieuw
  /*
   * Om de vijftien seconden een leeg regeltje. Een telefoon die een stroom een
   * tijd niets hoort, of een router ertussen, sluit hem anders; dan valt de
   * kaart stil terwijl er niets mis is.
   */
  wakker = setInterval(() => {
    for (const kijker of kijkers) kijker.write(': \n\n')
  }, 15000)
  bronnen.log(`apparaat: aan op poort ${poort} (${luisterAdres()}), ${lanAdressen().length} netwerkadres(sen)`)
  return { ...apparaatStand(), poort }
}

function luister(doel: Server, op: number): Promise<number> {
  return new Promise((klaar, mis) => {
    const bijFout = (reden: Error): void => {
      doel.off('listening', bijLuisteren)
      mis(reden)
    }
    const bijLuisteren = (): void => {
      doel.off('error', bijFout)
      const adres = doel.address()
      klaar(typeof adres === 'object' && adres ? adres.port : op)
    }
    doel.once('error', bijFout)
    doel.once('listening', bijLuisteren)
    doel.listen(op, luisterAdres())
  })
}

export function stopApparaat(): void {
  if (wakker) clearInterval(wakker)
  wakker = undefined
  for (const kijker of kijkers) kijker.end()
  kijkers.clear()
  if (server) {
    server.close()
    bronnen?.log('apparaat: uit')
  }
  server = undefined
  laatsteBeeld = ''
}

/** Een nieuw beeld voor wie meekijkt. Alleen als het iets anders is dan het vorige. */
export function apparaatBeeld(beeld: unknown): void {
  if (!server) return
  const tekst = JSON.stringify(beeld)
  if (tekst === laatsteBeeld) return
  laatsteBeeld = tekst
  for (const kijker of kijkers) kijker.write(`data: ${tekst}\n\n`)
}

const SOORTEN: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
}

const VEILIG = {
  'X-Content-Type-Options': 'nosniff',
  // De sleutel staat in het adres; die hoort niet mee te gaan naar ergens anders.
  'Referrer-Policy': 'no-referrer'
}

function stuurJson(vraag: IncomingMessage, antwoord: ServerResponse, waarde: unknown): void {
  const tekst = Buffer.from(JSON.stringify(waarde ?? null))
  /*
   * De geometrie van een kaart is al snel een paar megabyte; ingepakt is het
   * een fractie daarvan, en over wifi merk je dat.
   */
  const inpakken = /\bgzip\b/.test(String(vraag.headers['accept-encoding'] ?? '')) && tekst.length > 1024
  antwoord.writeHead(200, {
    ...VEILIG,
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...(inpakken ? { 'Content-Encoding': 'gzip' } : {})
  })
  antwoord.end(inpakken ? gzipSync(tekst) : tekst)
}

function nietGevonden(antwoord: ServerResponse): void {
  antwoord.writeHead(404, { ...VEILIG, 'Content-Type': 'text/plain; charset=utf-8' })
  antwoord.end('Niet gevonden')
}

/**
 * Het lijf van een POST, met een grens eraan: wat de telefoon stuurt past in
 * een paar honderd tekens, en een onbegrensde stroom is een manier om het
 * geheugen van de app vol te laten lopen.
 */
function leesLijf(vraag: IncomingMessage): Promise<string> {
  return new Promise((klaar, mis) => {
    let lijf = ''
    vraag.on('data', (stuk: Buffer) => {
      lijf += stuk
      if (lijf.length > 2048) {
        vraag.destroy()
        mis(new Error('te lang'))
      }
    })
    vraag.on('end', () => klaar(lijf))
    vraag.on('error', mis)
  })
}

async function behandel(vraag: IncomingMessage, antwoord: ServerResponse): Promise<void> {
  const methode = vraag.method
  if (!bronnen || (methode !== 'GET' && methode !== 'HEAD' && methode !== 'POST')) {
    return nietGevonden(antwoord)
  }
  const pad = decodeURIComponent(new URL(vraag.url ?? '/', 'http://x').pathname)
  const voor = `/n/${sleutel}/`
  // Zonder de juiste sleutel bestaat er niets; ook `/n/<sleutel>` zonder schuine streep niet.
  if (!sleutel || !pad.startsWith(voor)) {
    if (pad === `/n/${sleutel}` && sleutel) {
      antwoord.writeHead(308, { ...VEILIG, Location: voor })
      return void antwoord.end()
    }
    return nietGevonden(antwoord)
  }
  const rest = pad.slice(voor.length)

  /*
   * Het enige adres dat iets verandert. De opdracht wordt hier niet uitgevoerd
   * maar doorgegeven aan het hoofdproces, dat hem nakijkt; wat er niet in de
   * lijst staat, komt niet verder dan deze regel.
   */
  if (methode === 'POST') {
    if (rest !== 'api/telefoon') return nietGevonden(antwoord)
    let opdracht: TelefoonOpdracht
    try {
      opdracht = JSON.parse(await leesLijf(vraag)) as TelefoonOpdracht
    } catch {
      antwoord.writeHead(400, VEILIG)
      return void antwoord.end()
    }
    const soorten = ['aanmelden', 'overslaan', 'aanvaard', 'pauze', 'ibis']
    if (!opdracht || !soorten.includes(opdracht.wat)) {
      antwoord.writeHead(400, VEILIG)
      return void antwoord.end()
    }
    return stuurJson(vraag, antwoord, bronnen.telefoon(opdracht) ?? { ok: true })
  }
  if (methode !== 'GET' && methode !== 'HEAD') return nietGevonden(antwoord)

  if (rest === 'api/stroom') {
    antwoord.writeHead(200, {
      ...VEILIG,
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive'
    })
    // Na een onderbreking over twee tellen opnieuw proberen, en meteen het laatste beeld.
    antwoord.write('retry: 2000\n\n')
    if (laatsteBeeld) antwoord.write(`data: ${laatsteBeeld}\n\n`)
    kijkers.add(antwoord)
    vraag.on('close', () => kijkers.delete(antwoord))
    return
  }
  if (rest === 'api/start') return stuurJson(vraag, antwoord, bronnen.start())
  if (rest === 'api/geometrie') return stuurJson(vraag, antwoord, await bronnen.geometrie())
  if (rest === 'api/routes') return stuurJson(vraag, antwoord, await bronnen.routes())
  if (rest === 'manifest.webmanifest') {
    /*
     * Met "Zet op beginscherm" wordt de pagina een eigen icoon dat zonder
     * adresbalk opent, als een app. `start_url` is de pagina zelf, met de
     * sleutel -- relatief, zodat het ook klopt als het adres van de pc wisselt
     * en de speler de nieuwe code scant.
     */
    antwoord.writeHead(200, { ...VEILIG, 'Content-Type': 'application/manifest+json', 'Cache-Control': 'no-store' })
    return void antwoord.end(
      JSON.stringify({
        name: 'OMSI Enhancer',
        short_name: 'OMSI Nav',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#0e1522',
        theme_color: '#0e1522',
        icons: bronnen.icoon ? [{ src: 'icoon.png', sizes: '512x512', type: 'image/png' }] : []
      })
    )
  }
  if (rest === 'icoon.png' && bronnen.icoon) return stuurBestand(antwoord, bronnen.icoon, false)

  // De pagina zelf, en wat ze aan scripts, stijlen en letters inlaadt.
  const bestand = rest === '' ? 'apparaat.html' : rest
  const wortel = resolve(bronnen.paginas)
  const volledig = resolve(join(wortel, bestand))
  if (!volledig.startsWith(wortel + sep)) return nietGevonden(antwoord)
  // Alleen de pagina voor het apparaat, geen van de andere vensters van de app.
  if (extname(volledig) === '.html' && bestand !== 'apparaat.html') return nietGevonden(antwoord)
  return stuurBestand(antwoord, volledig, bestand.startsWith('assets/'))
}

async function stuurBestand(antwoord: ServerResponse, pad: string, blijvend: boolean): Promise<void> {
  let inhoud: Buffer
  try {
    inhoud = await readFile(pad)
  } catch {
    return nietGevonden(antwoord)
  }
  antwoord.writeHead(200, {
    ...VEILIG,
    'Content-Type': SOORTEN[extname(pad).toLowerCase()] ?? 'application/octet-stream',
    // De bestanden in assets/ dragen hun inhoud in de naam; die kunnen blijven liggen.
    'Cache-Control': blijvend ? 'public, max-age=31536000, immutable' : 'no-cache'
  })
  antwoord.end(inhoud)
}
