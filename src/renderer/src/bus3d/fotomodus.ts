import type { Bus3dBrug, Bus3dFotoVraag } from '../../../shared/bus3d'
import { klok, type StandBericht } from './berichten'
import { Verbinding } from './verbinding'

/**
 * HET FOTOVENSTER VAN DE FOTO V4 (bus3d-ontwerp §4.5, §9)
 *
 * Dezelfde pagina en dezelfde renderer als het 3D-venster, maar zonder React
 * en zonder zijpaneel: main (main/busfoto4.ts) laadt `bus3d.html?foto=1` in een
 * verborgen venster en stuurt fotovragen. Per vraag: het pakket van main, laden
 * tot alles scherp staat (of hooguit 25 s), dan één afdruk met `foto` --
 * 640x400, doorzichtig, 215°/8°, strak op 88% van de breedte -- als WebP terug.
 *
 * Eén vraag tegelijk; main zet ze in een rij. Dezelfde bus in een andere
 * kleurstelling laadt niet opnieuw, alleen de lak (§7).
 */
export function startFotomodus(brug: Bus3dBrug): void {
  const verbinding = Verbinding.get()
  const doek = document.createElement('canvas')
  doek.width = 2
  doek.height = 2
  let wachter: ((s: StandBericht | { fout: string }) => void) | undefined
  const h = verbinding.meld(doek, {
    opStand: (s) => {
      if (s.fase === 'scherp') wachter?.(s)
    },
    opFout: (f) => wachter?.({ fout: f.reden })
  })
  void brug.busOmgeving3d().then((o) => verbinding.omgeving(o), () => undefined)
  let maat = ''
  let rij: Promise<unknown> = Promise.resolve()

  async function maak(v: Bus3dFotoVraag): Promise<void> {
    const g = await verbinding.gereed
    if (!g.webgl) return brug.fotoKlaar(v.id, { reden: 'geen-webgl' })
    if (maat !== `${v.b}x${v.h}`) {
      maat = `${v.b}x${v.h}`
      h.maat(v.b, v.h, 1)
    }
    const t0 = klok()
    const antwoord = await brug.busModel3d(v.relatiefPad, v.kleurstelling)
    if ('reden' in antwoord) return brug.fotoKlaar(v.id, { reden: antwoord.reden })
    const klaar = new Promise<StandBericht | { fout: string }>((k) => {
      wachter = k
      // Wat na 25 s nog niet scherp staat, komt zoals het is op de foto: liever dat dan niets.
      setTimeout(() => k({ fout: 'tijd' }), 25_000)
    })
    h.laad(antwoord.manifest, antwoord.lak, antwoord.bron ?? 'cache', t0, v.licht, true)
    const uit = await klaar
    wachter = undefined
    if ('fout' in uit && uit.fout !== 'tijd') return brug.fotoKlaar(v.id, { reden: uit.fout })
    const beeld = await h.afdruk({ b: v.b, h: v.h, formaat: 'webp', foto: true })
    if ('fout' in beeld) return brug.fotoKlaar(v.id, { reden: beeld.fout })
    brug.fotoKlaar(v.id, { webp: beeld.beeld })
  }

  brug.opFotoVraag((v) => {
    rij = rij.then(
      () => maak(v).catch((fout: unknown) => brug.fotoKlaar(v.id, { reden: String(fout).slice(0, 200) })),
      () => undefined
    )
  })
  // Pas nu luisteren we: dit deel laadt na de pagina, dus 'did-finish-load' is voor main te vroeg.
  brug.fotoGereed()
}
