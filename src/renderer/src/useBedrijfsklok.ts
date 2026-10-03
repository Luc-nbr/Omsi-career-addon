import { useCallback, useEffect, useRef, useState } from 'react'
import type { BedrijfKlokStand } from '../../shared/bedrijfApi'
import { klokUitOmsi } from '../../shared/vloot'

/*
 * De klok van de vlootkaart.
 *
 * Rijdt OMSI deze kaart op de dag van het bedrijf, dan is het de klok van
 * OMSI: de kaart laat zien wat er nu in het spel zou rijden. Anders een eigen
 * klok die je afspeelt, pauzeert, versnelt of met de schuif verzet.
 *
 * De klok is alleen weergave (ontwerp busbedrijf-planning §1.9): hij wordt niet
 * opgeslagen in het bedrijf en beslist niets. Alleen de stand van de eigen
 * klok blijft per kaart in dit venster bewaard (localStorage), zodat de kaart
 * na het wisselen van tab niet terugspringt.
 *
 * Ontwerp: §8.1 (useBedrijfsklok) en §8.6 (hoe vaak er getekend wordt).
 */

export type Snelheid = 1 | 10 | 60

export interface Bedrijfsklok {
  /** Minuten na middernacht van de bedrijfsdatum, met een breuk. */
  minuten: number
  bron: 'omsi' | 'eigen'
  loopt: boolean
  snelheid: Snelheid
  van: number
  tot: number
  /** Alleen als OMSI een kaart rijdt: of het deze is. */
  kaartKlopt?: boolean
  /** Alleen als OMSI deze kaart rijdt: of het de dag van het bedrijf is. */
  datumKlopt?: boolean
  /** De datum die OMSI speelt, als die niet klopt. */
  omsiDatum?: string
  speel(): void
  pauze(): void
  snel(s: Snelheid): void
  zet(m: number): void
  nu(): void
}

/** Zo vaak vraagt het venster de klok van OMSI, zolang het zichtbaar is. */
const PEIL_MS = 2000

interface Eigen {
  /** De stand op `t0` (performance.now). */
  basis: number
  t0: number
  loopt: boolean
  snelheid: Snelheid
  /** Volgt deze klok OMSI, of loopt hij zelf? */
  bron: 'omsi' | 'eigen'
}

function pcMinuten(): number {
  const nu = new Date()
  return nu.getHours() * 60 + nu.getMinutes() + nu.getSeconds() / 60
}

function opslag(kaart: string | undefined): string {
  return `bd.klok.${kaart ?? ''}`
}

function bewaarde(kaart: string | undefined): number | undefined {
  try {
    const tekst = localStorage.getItem(opslag(kaart))
    const waarde = Number(tekst)
    return tekst !== null && tekst !== '' && Number.isFinite(waarde) ? waarde : undefined
  } catch {
    return undefined
  }
}

function bewaar(kaart: string | undefined, minuten: number): void {
  try {
    localStorage.setItem(opslag(kaart), String(Math.round(minuten * 10) / 10))
  } catch {
    // Geen opslag (privévenster, of geblokkeerd): dan begint de klok de volgende keer bij de pc-tijd.
  }
}

/** De stand van een klok op een moment. */
function standOp(k: Eigen, nu: number): number {
  // Nooit terug: een tik van vóór de laatste peiling telt als nul.
  return k.loopt ? k.basis + (Math.max(0, nu - k.t0) / 60_000) * k.snelheid : k.basis
}

export function useBedrijfsklok(
  mapFolder: string | undefined,
  plan: { van: number; tot: number; datum: string } | undefined
): Bedrijfsklok {
  const van = plan?.van ?? 0
  const tot = plan?.tot ?? 1440
  const datum = plan?.datum
  const binnen = useCallback((m: number) => Math.min(tot, Math.max(van, m)), [van, tot])

  const [klok, setKlok] = useState<Eigen>(() => ({
    basis: bewaarde(mapFolder) ?? pcMinuten(),
    t0: performance.now(),
    loopt: true,
    snelheid: 1,
    bron: 'eigen'
  }))
  const klokRef = useRef(klok)
  klokRef.current = klok
  const [nu, setNu] = useState(() => performance.now())
  const [stand, setStand] = useState<BedrijfKlokStand>({ bron: 'geen' })
  const [omsiDatum, setOmsiDatum] = useState<{ klopt: boolean; datum: string }>()
  /** Mag de klok OMSI volgen? Uit zodra je zelf aan de klok zit, tot [Nu]. */
  const volgOmsi = useRef(true)

  // Een andere kaart: zijn eigen klok, en weer OMSI volgen als die er is.
  const vorigeKaart = useRef(mapFolder)
  useEffect(() => {
    if (vorigeKaart.current === mapFolder) return
    bewaar(vorigeKaart.current, standOp(klokRef.current, performance.now()))
    vorigeKaart.current = mapFolder
    volgOmsi.current = true
    setStand({ bron: 'geen' })
    setOmsiDatum(undefined)
    setKlok({ basis: bewaarde(mapFolder) ?? pcMinuten(), t0: performance.now(), loopt: true, snelheid: 1, bron: 'eigen' })
  }, [mapFolder])

  // Bij het weggaan de stand bewaren.
  useEffect(
    () => () => {
      if (klokRef.current.bron === 'eigen') bewaar(vorigeKaart.current, standOp(klokRef.current, performance.now()))
    },
    []
  )

  /*
   * De klok van OMSI peilen, elke twee tellen zolang het venster zichtbaar is.
   * Pauzeert OMSI, dan schrijft de plugin niets meer en is de stand na een
   * vijftien tellen `geen`: dan loopt de klok door vanaf de laatste OMSI-tijd,
   * en springt hij niet terug naar de tijd van de pc.
   */
  useEffect(() => {
    if (!mapFolder) return
    let weg = false
    const peil = async (): Promise<void> => {
      if (document.visibilityState !== 'visible') return
      let s: BedrijfKlokStand
      try {
        s = await window.career.bedrijfKlok(mapFolder)
      } catch {
        s = { bron: 'geen' }
      }
      if (weg) return
      setStand(s)
      const m = s.bron === 'omsi' && s.kaartKlopt && datum ? klokUitOmsi(s.minuten, s.datum, datum, { van, tot }) : undefined
      setOmsiDatum(s.bron === 'omsi' && s.kaartKlopt ? { klopt: m !== undefined, datum: s.datum } : undefined)
      if (m !== undefined) {
        if (volgOmsi.current) setKlok({ basis: m, t0: performance.now(), loopt: true, snelheid: 1, bron: 'omsi' })
        return
      }
      // Geen bruikbare OMSI-tijd meer: zelf verder vanaf waar hij was.
      const oud = klokRef.current
      if (oud.bron === 'omsi') setKlok({ ...oud, bron: 'eigen' })
    }
    void peil()
    const timer = window.setInterval(() => void peil(), PEIL_MS)
    const zichtbaar = (): void => void peil()
    document.addEventListener('visibilitychange', zichtbaar)
    return () => {
      weg = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', zichtbaar)
    }
  }, [mapFolder, datum, van, tot])

  /*
   * Hoe vaak de kaart opnieuw tekent: elk beeld bij ×10 en ×60, één keer per
   * seconde bij ×1 (dan schuift een bus een paar meter), en niet als de klok
   * stilstaat.
   */
  useEffect(() => {
    if (!klok.loopt) {
      setNu(performance.now())
      return
    }
    if (klok.snelheid === 1) {
      setNu(performance.now())
      const timer = window.setInterval(() => setNu(performance.now()), 1000)
      return () => window.clearInterval(timer)
    }
    let frame = requestAnimationFrame(function tik(t) {
      setNu(t)
      frame = requestAnimationFrame(tik)
    })
    return () => cancelAnimationFrame(frame)
  }, [klok])

  /*
   * Komt het plan binnen (of een andere dag), en staat de eigen klok buiten
   * het bereik, dan begint hij aan de rand ervan in plaats van daar te blijven
   * hangen tot de tijd van de pc er vanzelf in loopt.
   */
  useEffect(() => {
    const k = klokRef.current
    if (k.bron !== 'eigen') return
    const t = performance.now()
    const m = standOp(k, t)
    if (m < van || m > tot) setKlok({ ...k, basis: Math.min(tot, Math.max(van, m)), t0: t })
  }, [van, tot])

  // Aan het eind van de dag stopt de eigen klok; OMSI loopt gewoon door.
  const ruw = standOp(klok, nu)
  useEffect(() => {
    if (klok.bron === 'eigen' && klok.loopt && ruw >= tot) setKlok({ ...klok, basis: tot, t0: performance.now(), loopt: false })
  }, [ruw, tot, klok])

  const zelf = useCallback(
    (wijzig: (huidig: number, oud: Eigen) => Partial<Eigen>) => {
      volgOmsi.current = false
      const oud = klokRef.current
      const t = performance.now()
      const huidig = binnen(standOp(oud, t))
      const nieuw: Eigen = { ...oud, basis: huidig, t0: t, bron: 'eigen', ...wijzig(huidig, oud) }
      nieuw.basis = binnen(nieuw.basis)
      setKlok(nieuw)
      bewaar(mapFolder, nieuw.basis)
    },
    [binnen, mapFolder]
  )

  const speel = useCallback(() => zelf((huidig) => ({ loopt: true, basis: huidig >= tot ? van : huidig })), [zelf, van, tot])
  const pauze = useCallback(() => zelf(() => ({ loopt: false })), [zelf])
  const snel = useCallback((s: Snelheid) => zelf(() => ({ snelheid: s, loopt: true })), [zelf])
  const zet = useCallback((m: number) => zelf(() => ({ basis: m })), [zelf])
  const naarNu = useCallback(() => {
    volgOmsi.current = true
    const t = performance.now()
    setKlok({ basis: binnen(pcMinuten()), t0: t, loopt: true, snelheid: 1, bron: 'eigen' })
    // Rijdt OMSI deze kaart, dan neemt de volgende peiling het over; vraag meteen.
    if (mapFolder) {
      void window.career
        .bedrijfKlok(mapFolder)
        .then((s) => {
          const m = s.bron === 'omsi' && s.kaartKlopt && datum ? klokUitOmsi(s.minuten, s.datum, datum, { van, tot }) : undefined
          if (m !== undefined && volgOmsi.current) setKlok({ basis: m, t0: performance.now(), loopt: true, snelheid: 1, bron: 'omsi' })
        })
        .catch(() => undefined)
    }
  }, [binnen, mapFolder, datum, van, tot])

  return {
    minuten: klok.bron === 'omsi' ? ruw : binnen(ruw),
    bron: klok.bron,
    loopt: klok.loopt,
    snelheid: klok.snelheid,
    van,
    tot,
    kaartKlopt: stand.bron === 'omsi' ? stand.kaartKlopt : undefined,
    datumKlopt: omsiDatum?.klopt,
    omsiDatum: omsiDatum && !omsiDatum.klopt ? omsiDatum.datum : undefined,
    speel,
    pauze,
    snel,
    zet,
    nu: naarNu
  }
}
