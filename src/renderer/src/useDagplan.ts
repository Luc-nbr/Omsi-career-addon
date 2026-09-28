import { useEffect, useMemo, useRef, useState } from 'react'
import type { Bedrijf } from '../../core/bedrijf'
import type { DagPlan, Dagrooster, LopendeRit, PlanCijfers } from '../../core/planTypen'
import { afrekening, dagplan, PLAN_ACTIEF } from '../../core/rooster'
import type { CareerPayload } from '../../shared/api'

/*
 * Het plan van een dag, voor elke tab van de bedrijfsapp. De dagroosters komen
 * uit main (die leest de dienstregeling); het plan en de cijfers rekent het
 * venster zelf uit de kern, zodat een wijziging in het rooster meteen te zien
 * is zonder nog een vraag.
 *
 * Opnieuw ophalen gebeurt alleen als de dag, de concessies of de ankers
 * veranderen: dat zijn de enige dingen die de dagroosters zelf veranderen.
 */
export function useDagplan(
  b: Bedrijf | undefined,
  dag: number | undefined,
  lopend?: LopendeRit,
  onCareer?: (p: CareerPayload) => void
): { dagen?: Dagrooster[]; plan?: DagPlan; cijfers?: PlanCijfers; laden: boolean; ververs(): void } {
  const [dagen, setDagen] = useState<Dagrooster[]>()
  const [laden, setLaden] = useState(false)
  const [teller, setTeller] = useState(0)
  const sleutel = b && dag
    ? `${dag}|${b.concessies.map((c) => `${c.mapFolder}/${c.lineFile}`).join(',')}|${JSON.stringify(b.ankers ?? {})}`
    : ''

  /*
   * Zolang de planning uit staat, niets ophalen: een kaart die nog niet in het
   * geheugen staat, wordt in main gelezen, en dat liet het openen van de app
   * haperen voor een plan dat nog nergens getoond wordt.
   */
  useEffect(() => {
    if (!PLAN_ACTIEF || !sleutel || !dag) {
      setDagen(undefined)
      return
    }
    let weg = false
    setLaden(true)
    window.career
      .bedrijfDagen(Math.max(1, dag - 1), dag + 1)
      .then((uit) => {
        if (!weg) setDagen(uit)
      })
      .catch(() => {
        if (!weg) setDagen(undefined)
      })
      .finally(() => {
        if (!weg) setLaden(false)
      })
    return () => {
      weg = true
    }
  }, [sleutel, teller]) // eslint-disable-line react-hooks/exhaustive-deps

  /*
   * De eerste keer met de planning: een rooster voor een hele week, zodat de
   * eigen bussen en chauffeurs meteen meerijden (ontwerp §3.3). Pas als de
   * planning aan staat; tot dan zou de stub alles uitbesteden.
   */
  const gevraagd = useRef(false)
  useEffect(() => {
    if (!PLAN_ACTIEF || !b || gevraagd.current) return
    if (b.rooster || b.concessies.length === 0 || dag !== b.dag) return
    gevraagd.current = true
    void window.career.bedrijfRooster({ soort: 'vulAan', dag, bereik: 'week', eerste: true }).then((uit) => {
      onCareer?.(uit.payload)
      setTeller((t) => t + 1)
    })
  }, [b, dag, onCareer])

  const plan = useMemo(() => (b && dag && dagen ? dagplan(b, dagen, dag, lopend) : undefined), [b, dagen, dag, lopend])
  const cijfers = useMemo(() => (b && plan ? afrekening(b, plan) : undefined), [b, plan])
  return { dagen, plan, cijfers, laden, ververs: () => setTeller((t) => t + 1) }
}
