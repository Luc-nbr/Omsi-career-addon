import { useEffect, useState, type JSX } from 'react'

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
 */
export function Versie({ klasse }: { klasse?: string }): JSX.Element | null {
  const [versie, setVersie] = useState<string>()

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
    return () => {
      geldig = false
    }
  }, [])

  if (!versie) return null
  return <span className={klasse ?? 'versie'}>{versie}</span>
}
