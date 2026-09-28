import { useEffect, useState, type JSX } from 'react'
import { useT } from './language'

/**
 * Welke versie hier draait.
 *
 * Stond alleen in de zijbalk van de oude schermen en onderin de overlay, en die
 * zijn allebei uit beeld zodra je in de nieuwe wereld werkt. Wie een fout meldt
 * moet kunnen zeggen welke versie hij heeft, en wie net bijgewerkt heeft wil het
 * zien -- dus staat het nummer nu in de balk die er altijd is.
 *
 * Hij haalt het zelf op in plaats van het door vier schermen heen door te geven:
 * het is één regel tekst die nooit verandert zolang de app draait.
 *
 * Sinds 28-09 staat de bouwstempel erachter (`bouw 1a2b3c4 · 2026-09-28 20:15
 * · setup`): tussen twee versienummers worden er soms tien exe's gebouwd, en
 * een oude draagbare met hetzelfde nummer was niet van een nieuwe te
 * onderscheiden. Kijkt deze exe alleen (een nieuwere versie werkte de
 * gebruikersmap bij), dan staat dat er ook.
 */
export function Versie({ klasse }: { klasse?: string }): JSX.Element | null {
  const tr = useT()
  const [versie, setVersie] = useState<string>()
  const [bouw, setBouw] = useState<{ stempel: string; alleenBekijken?: { versie: string } }>()

  useEffect(() => {
    let geldig = true
    void window.career
      .version()
      .then((waarde) => {
        if (geldig) setVersie(waarde)
      })
      .catch(() => {
        // Geen versie is geen fout die iemand hoeft te zien.
      })
    void window.career
      .bouw()
      .then((waarde) => {
        if (geldig) setBouw(waarde)
      })
      .catch(() => {
        // Een oudere hoofdkant zonder bouwstempel: dan alleen het nummer.
      })
    return () => {
      geldig = false
    }
  }, [])

  if (!versie) return null
  return (
    <span className={klasse ?? 'versie'} title={bouw?.stempel}>
      {versie}
      {bouw && <span style={{ opacity: 0.75 }}> · {bouw.stempel}</span>}
      {bouw?.alleenBekijken && <b> · {tr('vw.kort')}</b>}
    </span>
  )
}
