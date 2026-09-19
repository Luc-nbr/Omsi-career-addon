import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { Backdrop } from './Backdrop'
import '@fontsource/manrope/400.css'
import '@fontsource/manrope/500.css'
import '@fontsource/manrope/600.css'
import '@fontsource/manrope/700.css'
import '@fontsource/manrope/800.css'
/*
 * Hanken Grotesk is niet naar smaak gekozen: `impeccable font-match` heeft de
 * letters van de goedgekeurde afbeelding opgemeten (kaphoogte 18px, normale
 * breedte, vet) en deze kwam er als dichtstbijzijnde uit. Meegeleverd, niet van
 * internet, want de app moet ook zonder verbinding kloppen.
 */
import '@fontsource/hanken-grotesk/400.css'
import '@fontsource/hanken-grotesk/500.css'
import '@fontsource/hanken-grotesk/700.css'
import '@fontsource/hanken-grotesk/800.css'
import './theme.css'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Het lijnennet ligt achter elk scherm, niet achter één. */}
    <Backdrop />
    <App />
  </StrictMode>
)
