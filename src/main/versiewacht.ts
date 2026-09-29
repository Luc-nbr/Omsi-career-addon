import { app, BrowserWindow, dialog } from 'electron'
import fs from 'node:fs'
import { join } from 'node:path'
import { logFout } from '../core/logboek'
import { readSettings } from '../core/settings'
import { sluitSchrijvenAf } from '../core/schrijfslot'
import { zetBekijkstand } from '../core/veilig'
import {
  bouwstempel,
  kopieVoorBekijken,
  nieuwereSchrijver,
  noteerSchrijver,
  variantVan,
  type Schrijver,
  type Wie
} from '../core/versiewacht'
import { DEFAULT_LANGUAGE, isLanguage, t } from '../shared/i18n'

/*
 * De bouwstempel en de wacht tegen oudere exe's; de regels staan in
 * core/versiewacht.ts, dit is de kant die Electron nodig heeft (het venster
 * met de vraag, het omzetten van de gebruikersmap).
 */

/** De bouwstempel van deze exe; `__BOUW__` bakt electron.vite.config.ts erin. */
export function stempel(): string {
  return bouwstempel(typeof __BOUW__ === 'undefined' ? undefined : __BOUW__, variantVan(app.isPackaged))
}

/** Deze exe: versie en bouw, om te noteren en te vergelijken. */
function ik(versie: string): Wie {
  const bouw = typeof __BOUW__ === 'undefined' ? undefined : __BOUW__
  return { versie, bouw: stempel(), hash: bouw?.hash, gebouwd: bouw?.iso, variant: variantVan(app.isPackaged) }
}

let bekijken: { nieuwere: Schrijver; kopie: string } | undefined

/** Draait de app alleen om te bekijken? Dan staat erin wie de map het laatst bijwerkte. */
export function alleenBekijken(): { versie: string; bouw?: string } | undefined {
  return bekijken ? { versie: bekijken.nieuwere.versie, bouw: bekijken.nieuwere.bouw } : undefined
}

/**
 * Bij het starten, vóór er iets in de gebruikersmap geschreven wordt: is deze
 * exe ouder dan wat de map het laatst bijwerkte, dan vragen wat de speler wil.
 *
 * - Alleen bekijken: de app draait op een kopie van de gebruikersmap in de
 *   tijdelijke map, en schrijft verder nergens -- niet in de echte map, niet
 *   in OMSI, niet bij Steam, niet in het register (`sluitSchrijvenAf` in
 *   core/schrijfslot.ts, ook in de kaartwerker; `zetBekijkstand`).
 *   Rondkijken kan, opslaan niet; START (een dienst, vrij rijden) weigert
 *   met een melding voordat er iets klaargezet wordt, en OMSI starten ook.
 *   Sinds de tegenlezing van 29-09 ook de overlay (een dienst die nog liep,
 *   hervat), de busknoppen en een bus klaarmaken.
 *   Chromium volgt de kopie ook; alleen zijn eigen `Local State` komt nog in
 *   de echte map (geen gegevens van de app).
 * - Toch doorgaan: zoals altijd.
 * - Afsluiten: de app gaat meteen weer dicht.
 *
 * Lukt de kopie niet (een profiel dat een ander programma vasthoudt, een
 * volle tijdelijke map), dan komt de vraag of de speler toch wil doorgaan of
 * afsluiten. Tot 29-09 ging die fout ongezien voorbij: de app draaide zonder
 * venster door, met het slot op de gebruikersmap in handen, en elke volgende
 * start stopte meteen -- tot de speler hem in Taakbeheer vond.
 *
 * Anders, en na "toch doorgaan", noteert de app meteen welke exe er schrijft
 * (`noteerSchrijver`). Tot 29-09 gebeurde dat pas bij de eerste opslag via
 * `schrijfVeilig`, en instellingen, de overlay-indeling en het register van de
 * add-ons gaan daar buitenom: een nieuwere versie die alleen die veranderde,
 * liet geen notitie achter, en een oudere exe daarna gooide de velden weg die
 * hij niet kende.
 *
 * `OMSI_ENHANCER_PROEFKEUZE` beantwoordt de vraag zonder venster, en
 * `OMSI_ENHANCER_PROEFKEUZE_KOPIE` die na een mislukte kopie, voor een proef
 * (scripts/probe-alleenbekijken.cjs, probe-bekijkenfout.cjs); in een gewone
 * start staan ze niet.
 */
export function bewaakVersie(versie: string): 'verder' | 'afsluiten' {
  const echt = app.getPath('userData')
  const nieuwere = nieuwereSchrijver(echt, ik(versie))
  if (nieuwere) {
    const keuze = vraag(echt, versie, nieuwere)
    if (keuze === 'afsluiten') return 'afsluiten'
    if (keuze === 'bekijken') {
      const fout = zetOpKopie(echt, versie, nieuwere)
      if (fout === undefined) return 'verder'
      if (vraagNaMislukteKopie(echt, fout) === 'afsluiten') return 'afsluiten'
    }
  }
  try {
    noteerSchrijver(echt, ik(versie))
  } catch {
    // Niet kunnen noteren mag het starten niet tegenhouden.
  }
  return 'verder'
}

/**
 * De app op een kopie van de gebruikersmap zetten om alleen te bekijken.
 * Geeft de fout terug als de kopie niet lukte; wat er al gekopieerd was, is
 * dan weer weg, en de app staat nog gewoon op de echte map.
 */
function zetOpKopie(echt: string, versie: string, nieuwere: Schrijver): unknown {
  const kopie = join(app.getPath('temp'), `omsi-enhancer-bekijken-${process.pid}`)
  ruimOudeKopieenOp(app.getPath('temp'))
  try {
    kopieVoorBekijken(echt, kopie)
  } catch (fout) {
    try {
      fs.rmSync(kopie, { recursive: true, force: true, maxRetries: 3 })
    } catch {
      // Dan ruimt `ruimOudeKopieenOp` hem een volgende keer op.
    }
    return fout ?? new Error('onbekende fout')
  }
  app.setPath('userData', kopie)
  bekijken = { nieuwere, kopie }
  sluitSchrijvenAf([kopie])
  zetBekijkstand(true)
  toonInTitel(echt, versie)
  app.on('will-quit', () => {
    try {
      fs.rmSync(kopie, { recursive: true, force: true })
    } catch {
      // Dan ruimt Windows de tijdelijke map later op.
    }
  })
  return undefined
}

/*
 * Kopieën van een vorige keer bekijken. Opruimen bij het afsluiten lukt niet
 * altijd helemaal (Chromium houdt er nog iets open), en een kopie kan honderd
 * megabyte zijn. Alleen wat ouder is dan twaalf uur: een kopie van een ander
 * exemplaar dat nu draait (met een eigen --user-data-dir) blijft staan.
 */
function ruimOudeKopieenOp(temp: string): void {
  try {
    for (const naam of fs.readdirSync(temp)) {
      if (!naam.startsWith('omsi-enhancer-bekijken-')) continue
      const map = join(temp, naam)
      if (Date.now() - fs.statSync(map).mtimeMs > 12 * 3600 * 1000) fs.rmSync(map, { recursive: true, force: true })
    }
  } catch {
    // Opruimen is geen voorwaarde om te kunnen bekijken.
  }
}

function taal(userData: string): Parameters<typeof t>[0] {
  try {
    const gekozen = readSettings(userData).language
    return isLanguage(gekozen) ? gekozen : DEFAULT_LANGUAGE
  } catch {
    return DEFAULT_LANGUAGE
  }
}

/** Een versie met zijn bouw erbij, als het nummer alleen niet zegt welke nieuwer is. */
function metBouw(wie: Wie, andere: Wie): string {
  return wie.versie === andere.versie && wie.hash ? `${wie.versie} (bouw ${wie.hash})` : wie.versie
}

function vraag(userData: string, versie: string, nieuwere: Schrijver): 'bekijken' | 'doorgaan' | 'afsluiten' {
  const proef = process.env.OMSI_ENHANCER_PROEFKEUZE
  if (proef === 'bekijken' || proef === 'doorgaan' || proef === 'afsluiten') return proef
  const tl = taal(userData)
  const eigen = ik(versie)
  const knop = dialog.showMessageBoxSync({
    type: 'warning',
    title: 'OMSI Enhancer',
    message: t(tl, 'vw.bericht', { nieuw: metBouw(nieuwere, eigen), eigen: metBouw(eigen, nieuwere) }),
    detail: [t(tl, 'vw.uitleg'), nieuwere.bouw ? `${nieuwere.versie}: ${nieuwere.bouw}\n${versie}: ${stempel()}` : '']
      .filter(Boolean)
      .join('\n\n'),
    buttons: [t(tl, 'vw.bekijken'), t(tl, 'vw.doorgaan'), t(tl, 'vw.afsluiten')],
    defaultId: 0,
    // Wegklikken is het veilige antwoord.
    cancelId: 0,
    noLink: true
  })
  return knop === 1 ? 'doorgaan' : knop === 2 ? 'afsluiten' : 'bekijken'
}

/** De kopie om te bekijken lukte niet: afsluiten (standaard, ook bij wegklikken) of toch doorgaan op de echte map. */
function vraagNaMislukteKopie(userData: string, fout: unknown): 'doorgaan' | 'afsluiten' {
  const proef = process.env.OMSI_ENHANCER_PROEFKEUZE_KOPIE
  if (proef === 'doorgaan' || proef === 'afsluiten') return proef
  const tl = taal(userData)
  const knop = dialog.showMessageBoxSync({
    type: 'error',
    title: 'OMSI Enhancer',
    message: t(tl, 'vw.kopieMislukt'),
    detail: `${t(tl, 'vw.kopieUitleg')}\n\n${fout instanceof Error ? fout.message : String(fout)}`,
    buttons: [t(tl, 'vw.afsluiten'), t(tl, 'vw.doorgaan')],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  })
  return knop === 1 ? 'doorgaan' : 'afsluiten'
}

/**
 * Een fout tijdens het opstarten (in `app.whenReady` van main/index.ts).
 *
 * Zonder dit werd zo'n fout een onafgehandelde belofte: de app draaide door
 * zonder venster, met het slot op de gebruikersmap in handen, en elke
 * volgende start zag dat slot en stopte meteen. Staat het venster er al, dan
 * gaat de fout alleen het logboek in, zoals elke andere; anders een melding,
 * en de app gaat dicht zodat een nieuwe start weer kan. In een proef
 * (`OMSI_ENHANCER_PROEFKEUZE` staat) zonder de melding, die anders wacht op
 * een klik.
 */
export function meldStartFout(fout: unknown, vensterEr: boolean): void {
  logFout('opstarten', fout)
  if (vensterEr) return
  try {
    const tl = taal(app.getPath('userData'))
    const tekst = `${t(tl, 'app.startFout')}\n\n${fout instanceof Error ? fout.message : String(fout)}`
    if (!process.env.OMSI_ENHANCER_PROEFKEUZE) dialog.showErrorBox('OMSI Enhancer', tekst)
  } finally {
    app.exit(1)
  }
}

/**
 * Elk venster zegt in zijn titel dat er niets opgeslagen wordt. Via de pagina
 * en niet via `browser-window-created`: die kwam in de proef niet aan, en de
 * pagina zet bij het laden haar eigen `<title>`; daarna zetten wij de onze.
 */
function toonInTitel(userData: string, versie: string): void {
  const titel = `OMSI Enhancer ${versie} — ${t(taal(userData), 'vw.titelBalk')}`
  app.on('web-contents-created', (_gebeurtenis, inhoud) => {
    const zet = (): void => {
      const venster = BrowserWindow.fromWebContents(inhoud)
      if (venster && !venster.isDestroyed() && venster.getTitle() !== titel) venster.setTitle(titel)
    }
    inhoud.on('page-title-updated', zet)
    inhoud.on('did-finish-load', zet)
  })
}
