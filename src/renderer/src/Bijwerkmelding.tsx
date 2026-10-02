import { useEffect, useState, type JSX } from 'react'
import type { BijwerkStand } from '../../core/bijwerken'
import { t, type Language } from '../../shared/i18n'

/**
 * De kleine melding van de automatische updater in de balk, naast het
 * versienummer (main/bijwerken.ts): een update die wacht tot OMSI dicht is,
 * "bijgewerkt naar" na de eerste start van een nieuwe versie, en in de
 * draagbare exe dat er een nieuwe versie is, met een knop naar GitHub.
 */
export function Bijwerkmelding({ language }: { language: Language }): JSX.Element | null {
  const [stand, setStand] = useState<BijwerkStand>()

  useEffect(() => {
    let geldig = true
    void window.career
      .bijwerkStand()
      .then((waarde) => {
        if (geldig && waarde) setStand(waarde)
      })
      .catch(() => {
        // Een oudere hoofdkant zonder updater: dan geen melding.
      })
    const opzeggen = window.career.opBijwerkStand((waarde) => setStand(waarde))
    return () => {
      geldig = false
      opzeggen()
    }
  }, [])

  // "Bijgewerkt naar" hoeft er niet te blijven staan.
  useEffect(() => {
    if (stand?.soort !== 'bijgewerkt') return
    const klok = setTimeout(() => sluit(), 20000)
    return () => clearTimeout(klok)
  }, [stand])

  function sluit(): void {
    setStand(undefined)
    void window.career.vergeetBijwerkStand().catch(() => undefined)
  }

  if (!stand) return null
  const tekst =
    stand.soort === 'wacht'
      ? t(language, 'bw.wacht', { versie: stand.versie })
      : stand.soort === 'bijgewerkt'
        ? t(language, 'bw.bijgewerkt', { versie: stand.versie })
        : t(language, 'bw.nieuw', { versie: stand.versie })
  return (
    <span className="bijwerkmelding" role="status">
      {tekst}
      {stand.soort === 'nieuw' && (
        <button
          type="button"
          className="bijwerkmelding-knop"
          onClick={() => void window.career.bijwerkPagina().catch(() => undefined)}
        >
          {t(language, 'bw.downloaden')}
        </button>
      )}
      <button type="button" aria-label={t(language, 'bw.sluiten')} title={t(language, 'bw.sluiten')} onClick={sluit}>
        ×
      </button>
    </span>
  )
}
