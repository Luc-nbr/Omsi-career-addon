import type { JSX } from 'react'
import { t, type Language } from '../../shared/i18n'

/** Welke stand de app aanhoudt. `systeem` volgt wat Windows zegt. */
export type Thema = 'systeem' | 'licht' | 'donker'

interface Props {
  language: Language
  thema: Thema
  /** `vanaf` is het midden van het knopje: daar begint de overgang (zie themaOvergang.ts). */
  onThema: (thema: Thema, vanaf?: { x: number; y: number }) => void
}

/**
 * Het knopje voor dag of nacht.
 *
 * De app volgde alleen Windows, en dat is goed genoeg tot je 's avonds in een
 * donkere kamer een lichte app krijgt omdat Windows nog op dag staat -- of
 * andersom. Eén knopje lost dat op.
 *
 * Hij toont waar hij heen gaat en niet waar hij staat: in het donker een
 * zonnetje, want dat is wat je krijgt als je hem indrukt. Een knop die de
 * huidige stand toont laat je raden wat er gebeurt.
 */
export function ThemaKnop({ language, thema, onThema }: Props): JSX.Element {
  /*
   * In de stand `systeem` weten we pas bij het tekenen wat het wordt, dus
   * vragen we het aan de browser. Zo klopt het pictogram ook voor wie de knop
   * nog nooit heeft aangeraakt.
   */
  const nuDonker =
    thema === 'donker' ||
    (thema === 'systeem' &&
      typeof window !== 'undefined' &&
      !window.matchMedia('(prefers-color-scheme: light)').matches)

  const naar: Thema = nuDonker ? 'licht' : 'donker'
  const label = t(language, nuDonker ? 'setup.themeLight' : 'setup.themeDark')

  return (
    <button
      type="button"
      className="themaknop"
      title={`${t(language, 'setup.theme')}: ${label}`}
      aria-label={label}
      onClick={(klik) => {
        const vak = klik.currentTarget.getBoundingClientRect()
        onThema(naar, { x: vak.left + vak.width / 2, y: vak.top + vak.height / 2 })
      }}
    >
      {nuDonker ? (
        // Zon: een schijf met stralen.
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="4.2" fill="currentColor" />
          <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M12 2.6v2.4M12 19v2.4M2.6 12h2.4M19 12h2.4" />
            <path d="M5.3 5.3 7 7M17 17l1.7 1.7M18.7 5.3 17 7M7 17l-1.7 1.7" />
          </g>
        </svg>
      ) : (
        // Maan: een schijf met een hap eruit.
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M20 14.2A8.4 8.4 0 0 1 9.8 4a8.4 8.4 0 1 0 10.2 10.2Z"
            fill="currentColor"
          />
        </svg>
      )}
    </button>
  )
}
