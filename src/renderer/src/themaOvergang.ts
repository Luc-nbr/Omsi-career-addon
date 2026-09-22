import { flushSync } from 'react-dom'

/**
 * Van donker naar licht (en terug) als een cirkel die vanuit het knopje groeit.
 *
 * WAAROM ZO
 * De wissel was een knal: in één beeld sprong alles om, en in een donkere
 * kamer is een venster dat ineens wit wordt een klap in je gezicht. Luc vroeg
 * om een mooie overgang. Chromium kan een foto maken van het oude scherm en het
 * nieuwe eroverheen laten verschijnen (de View Transitions van de browser); hier
 * verschijnt het nieuwe als een cirkel die bij het zon/maan-knopje begint, zodat
 * je ziet waar het vandaan komt.
 *
 * `flushSync` omdat de foto van het nieuwe scherm genomen wordt zodra deze
 * functie terugkeert: React moet zijn deel (het pictogram op het knopje) dan al
 * getekend hebben, anders zie je in de cirkel nog de oude zon.
 *
 * Wie in Windows minder beweging heeft gekozen, krijgt de wissel zonder cirkel.
 */
export function wisselThema(zet: () => void, vanaf?: { x: number; y: number }): void {
  const rustig = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (rustig || typeof document.startViewTransition !== 'function') {
    zet()
    return
  }
  const x = vanaf?.x ?? window.innerWidth - 60
  const y = vanaf?.y ?? 40
  // Tot de verste hoek, zodat de cirkel aan het eind het hele venster dekt.
  const straal = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
  const overgang = document.startViewTransition(() => flushSync(zet))
  overgang.ready
    .then(() => {
      document.documentElement.animate(
        {
          clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${straal}px at ${x}px ${y}px)`]
        },
        {
          duration: 650,
          easing: 'cubic-bezier(0.65, 0, 0.35, 1)',
          pseudoElement: '::view-transition-new(root)'
        }
      )
    })
    .catch(() => {
      // Overgeslagen (een tweede klik halverwege): dan staat het thema er gewoon.
    })
}
