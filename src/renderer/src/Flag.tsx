import { useId, type JSX } from 'react'
import type { Language } from '../../shared/i18n'

/**
 * De vlag bij een taal, getekend in plaats van als emoji.
 *
 * Windows heeft geen vlagemoji: 🇩🇪 komt daar uit als twee letterblokjes "DE".
 * Zelf tekenen is dus de enige manier waarop het er overal hetzelfde uitziet,
 * en het scheelt een lettertype dat we anders moesten meeleveren.
 *
 * Alles staat in een vak van 60 bij 40. Voor Frankrijk en Nederland is dat de
 * juiste verhouding, voor Duitsland scheelt het een haartje, en de Britse vlag
 * is van 2:1 naar 3:2 geduwd — herkenbaar blijft hij wel.
 */
export function Flag({ code }: { code: Language }): JSX.Element {
  const clip = useId()

  if (code === 'de') {
    return (
      <svg className="flag" viewBox="0 0 60 40" aria-hidden="true">
        <rect width="60" height="40" fill="#000000" />
        <rect y="13.33" width="60" height="13.34" fill="#dd0000" />
        <rect y="26.67" width="60" height="13.33" fill="#ffce00" />
      </svg>
    )
  }

  if (code === 'fr') {
    return (
      <svg className="flag" viewBox="0 0 60 40" aria-hidden="true">
        <rect width="60" height="40" fill="#ffffff" />
        <rect width="20" height="40" fill="#002395" />
        <rect x="40" width="20" height="40" fill="#ed2939" />
      </svg>
    )
  }

  if (code === 'nl') {
    return (
      <svg className="flag" viewBox="0 0 60 40" aria-hidden="true">
        <rect width="60" height="40" fill="#ffffff" />
        <rect width="60" height="13.33" fill="#ae1c28" />
        <rect y="26.67" width="60" height="13.33" fill="#21468b" />
      </svg>
    )
  }

  // De Union Jack: eerst de witte schuine banen, dan de rode erop maar per
  // kwadrant een halve baan verschoven -- dat is wat de vlag zijn draai geeft.
  return (
    <svg className="flag" viewBox="0 0 60 40" aria-hidden="true">
      <clipPath id={clip}>
        <path d="M30,20 h30 v20 z v20 h-30 z h-30 v-20 z v-20 h30 z" />
      </clipPath>
      <rect width="60" height="40" fill="#012169" />
      <path d="M0,0 L60,40 M60,0 L0,40" stroke="#ffffff" strokeWidth="8" />
      <path
        d="M0,0 L60,40 M60,0 L0,40"
        clipPath={`url(#${clip})`}
        stroke="#c8102e"
        strokeWidth="4.8"
      />
      <path d="M30,0 V40 M0,20 H60" stroke="#ffffff" strokeWidth="13.3" />
      <path d="M30,0 V40 M0,20 H60" stroke="#c8102e" strokeWidth="8" />
    </svg>
  )
}
