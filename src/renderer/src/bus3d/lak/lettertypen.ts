import '@fontsource/manrope/700.css'
import type { Laag } from '../../../../shared/lak'
import { TEKST_VAK, tekstFont } from './recept'

/**
 * LETTERTYPEN EN TEKST OP DE BUS (lakstudio-ontwerp §1 "Tekst", §4.6, §7)
 *
 * Twee soorten:
 * - OFL-lettertypen die met de app meekomen: Hanken Grotesk en Manrope (beide
 *   SIL Open Font License 1.1, als @fontsource in de bundel; de licentie staat
 *   in node_modules/@fontsource/<naam>/LICENSE). D-DIN en Gidole uit het ontwerp
 *   zitten er nog niet in: die moeten eerst gedownload en nagekeken worden.
 * - Windows-lettertypen, alleen om mee te tekenen (niet om te delen): de lijst
 *   uit `queryLocalFonts()` als Chromium hem geeft, anders een vaste lijst van
 *   lettertypen die bij Windows horen, nagegaan door te meten (een lettertype
 *   dat er niet is, meet als de terugval).
 *
 * De tekst van een laag tekent HET VENSTER (met het echte lettertype) op een doek
 * van 1024×512 en stuurt hem als beeld naar de werker; zo meten venster en
 * werker dezelfde breedte en is er geen lettertype in de werker nodig.
 */

export const OFL_LETTERTYPEN = ['Hanken Grotesk', 'Manrope'] as const
export const STANDAARD_LETTERTYPE = 'Hanken Grotesk'

/** Lettertypen die bij Windows 10 en 11 horen; wat er op deze pc is, blijft over na het meten. */
const WINDOWS = [
  'Arial',
  'Arial Black',
  'Bahnschrift',
  'Calibri',
  'Cambria',
  'Candara',
  'Comic Sans MS',
  'Consolas',
  'Constantia',
  'Corbel',
  'Franklin Gothic Medium',
  'Gadugi',
  'Georgia',
  'Impact',
  'Lucida Sans Unicode',
  'Palatino Linotype',
  'Segoe UI',
  'Segoe UI Black',
  'Sitka Text',
  'Tahoma',
  'Times New Roman',
  'Trebuchet MS',
  'Verdana'
]

let meetDoek: CanvasRenderingContext2D | undefined
function meet(): CanvasRenderingContext2D {
  meetDoek ??= document.createElement('canvas').getContext('2d')!
  return meetDoek
}

/** Is dit lettertype op deze pc? Meten tegen twee terugvallen: gelijk aan allebei = er niet. */
export function bestaat(naam: string): boolean {
  if ((OFL_LETTERTYPEN as readonly string[]).includes(naam)) return true
  const ctx = meet()
  const proef = 'mmmmmmmmmmlli WWW 0123'
  const breedte = (font: string): number => {
    ctx.font = font
    return ctx.measureText(proef).width
  }
  for (const terug of ['monospace', 'serif']) {
    if (Math.abs(breedte(`72px "${naam}", ${terug}`) - breedte(`72px ${terug}`)) > 0.5) return true
  }
  return false
}

let windowsLijst: string[] | undefined
/**
 * De Windows-lettertypen op deze pc. Eerst de vaste lijst (gemeten), en als
 * Chromium `queryLocalFonts` toestaat de hele lijst van het systeem erbij. Dat
 * vraagt een klik van de speler (tijdelijke activering), dus pas als de lijst
 * opengaat.
 */
export async function windowsLettertypen(ookSysteem = false): Promise<string[]> {
  if (!windowsLijst) windowsLijst = WINDOWS.filter(bestaat)
  if (ookSysteem) {
    const vraag = (window as unknown as { queryLocalFonts?: () => Promise<Array<{ family: string }>> }).queryLocalFonts
    if (vraag) {
      try {
        const alle = await vraag()
        const families = [...new Set(alle.map((f) => f.family))].filter((f) => !f.startsWith('@'))
        windowsLijst = [...new Set([...windowsLijst, ...families])].sort((a, b) => a.localeCompare(b))
      } catch {
        // Geen toestemming of niet beschikbaar: de gemeten lijst.
      }
    }
  }
  return windowsLijst
}

/** Het lettertype dat getekend wordt: het gevraagde, of de vervanger als het hier ontbreekt (ls.lettertype). */
export function lettertypeVoor(naam: string): { naam: string; vervangen: boolean } {
  if (!naam || bestaat(naam)) return { naam: naam || STANDAARD_LETTERTYPE, vervangen: false }
  return { naam: STANDAARD_LETTERTYPE, vervangen: true }
}

/** De breedte van een tekst bij 200 px, met de letterafstand (procenten van de letterhoogte). */
export function tekstBreedtePx(tekst: string, lettertype: string, letterafstand = 0): number {
  const ctx = meet()
  ctx.font = tekstFont(lettertypeVoor(lettertype).naam)
  const extra = (letterafstand / 100) * 200 * Math.max(0, [...tekst].length - 1)
  return Math.max(1, ctx.measureText(tekst).width + extra)
}

/** Wacht tot een lettertype geladen is (de OFL-lettertypen komen als CSS; het eerste meten is anders met de terugval). */
export async function laadLettertype(naam: string): Promise<void> {
  try {
    await document.fonts.load(tekstFont(naam))
  } catch {
    // dan de terugval
  }
}

/**
 * De tekst van een laag op het doek van een decal (1024×512, wit met alfa),
 * precies zoals de werker hem zou tekenen: 200 px per letterhoogte, het vak 1,35
 * letterhoogte hoog, uitgerekt tot de hele breedte (de werker rekt terug met
 * `breedteM`, die met dezelfde meting is gemaakt).
 */
export async function tekstBeeld(l: Extract<Laag, { soort: 'tekst' }>): Promise<ImageBitmap> {
  const B = 1024
  const H = 512
  const lt = lettertypeVoor(l.lettertype).naam
  await laadLettertype(lt)
  const doek = new OffscreenCanvas(B, H)
  const ctx = doek.getContext('2d')!
  const breed = tekstBreedtePx(l.tekst, lt, l.letterafstand)
  ctx.save()
  ctx.scale(B / breed, H / TEKST_VAK)
  ctx.font = tekstFont(lt)
  ;(ctx as unknown as { letterSpacing: string }).letterSpacing = `${((l.letterafstand ?? 0) / 100) * 200}px`
  ctx.textBaseline = 'middle'
  // In kleur, met de omlijning in haar eigen kleur: de werker neemt de kleuren van dit beeld over.
  if (l.omlijning && l.omlijning.breedteCm > 0) {
    ctx.lineWidth = (l.omlijning.breedteCm / l.hoogteCm) * 200 * 2
    ctx.lineJoin = 'round'
    ctx.strokeStyle = l.omlijning.kleur
    ctx.strokeText(l.tekst, 0, TEKST_VAK / 2)
  }
  ctx.fillStyle = l.kleur
  ctx.fillText(l.tekst, 0, TEKST_VAK / 2)
  ctx.restore()
  return doek.transferToImageBitmap()
}
