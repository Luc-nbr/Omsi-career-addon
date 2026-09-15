import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { Backdrop } from './Backdrop'
import '@fontsource/manrope/400.css'
import '@fontsource/manrope/500.css'
import '@fontsource/manrope/600.css'
import '@fontsource/manrope/700.css'
import '@fontsource/manrope/800.css'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Het lijnennet ligt achter elk scherm, niet achter één. */}
    <Backdrop />
    <App />
  </StrictMode>
)
