/**
 * Start OMSI zonder de app om te laten vallen.
 *
 *   npx tsx scripts/probe-start.ts
 *
 * Wie in Windows bij `Omsi.exe` "als administrator uitvoeren" aanvinkt, kreeg
 * een EACCES terug -- en die fout kwam niet uit de aanroep maar later als
 * gebeurtenis binnen. Er stond wel een `try/catch` omheen, maar die vangt zoiets
 * niet, dus viel de hele app om met "A JavaScript error occurred in the main
 * process".
 *
 * Deze proef doet dat na met een `Omsi.exe` die geen programma is: dan geeft
 * Windows dezelfde EACCES. Geslaagd is niet "het spel start", maar "de fout komt
 * netjes terug en het proces blijft overeind".
 */
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchOmsi } from '../src/core/launch'

let omgevallen: unknown
process.on('uncaughtException', (reden) => {
  omgevallen = reden
})

const werk = mkdtempSync(join(tmpdir(), 'omsi-start-'))

async function main(): Promise<void> {
  // 1. Geen Omsi.exe: een leesbare fout, geen brok.
  const leeg = join(werk, 'leeg')
  mkdirSync(leeg)
  let fout: string | undefined
  try {
    await launchOmsi(leeg)
  } catch (reden) {
    fout = (reden as Error).message
  }
  console.log(
    fout && fout.includes('Omsi.exe')
      ? `1. ontbrekende Omsi.exe: "${fout}"`
      : `1. MISLUKT: verwachtte een melding over Omsi.exe, kreeg ${fout ?? 'niets'}`
  )

  /*
   * 2. Een Omsi.exe die Windows niet kan starten -- hier een map. Dat is een
   *    andere fout dan de rechtenfout, en die hoort gewoon terug te komen bij
   *    wie het vroeg, niet als losse brok door de app heen.
   */
  const dicht = join(werk, 'dicht')
  mkdirSync(dicht)
  mkdirSync(join(dicht, 'Omsi.exe'))
  let tweede: string | undefined
  try {
    await launchOmsi(dicht)
  } catch (reden) {
    tweede = (reden as { code?: string }).code ?? (reden as Error).message
  }
  console.log(
    tweede ? `2. onstartbaar programma: ${tweede}, netjes teruggegeven` : '2. MISLUKT: geen fout terug'
  )

  /*
   * 3. En de rechtenfout zelf. Die valt met een bestandje niet na te bootsen --
   *    daar is een spel voor nodig dat om rechten vraagt -- dus doen we de
   *    weigering na en kijken we of hij dan de weg via Windows neemt en met een
   *    antwoord terugkomt in plaats van om te vallen.
   */
  let gevraagd = false
  const uitkomst = await launchOmsi(
    dicht,
    false,
    () => {
      const fout = new Error('spawn Omsi.exe EACCES') as Error & { code: string }
      fout.code = 'EACCES'
      return Promise.reject(fout)
    },
    // Windows zelf blijft hier erbuiten: die zou een venster op het scherm
    // zetten, en wat we willen weten is alleen of hij deze weg inslaat.
    async () => {
      gevraagd = true
      return 'geweigerd'
    }
  )
  console.log(
    gevraagd && uitkomst === 'geweigerd'
      ? '3. rechtenfout: hij vraagt het aan Windows en geeft het antwoord door'
      : `3. MISLUKT: gevraagd=${gevraagd}, uitkomst=${uitkomst}`
  )

  // Even wachten: een losgeraakte fout komt altijd in de slag erna binnen.
  await new Promise((r) => setTimeout(r, 300))
  console.log(
    omgevallen ? `4. MISLUKT: er ontsnapte alsnog een fout: ${omgevallen}` : '4. geen enkele losse fout'
  )
}

void main()
