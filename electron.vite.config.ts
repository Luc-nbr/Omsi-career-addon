import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

/*
 * Het versienummer wordt bij het bouwen ingebakken.
 *
 * Vragen aan Electron kan ook, maar dat klopt alleen in een gebouwde app: draai
 * je vanuit de broncode of vanuit een proef, dan krijg je de versie van Electron
 * zelf terug -- 33.4.11 -- en dat is precies het nummer dat iemand dan in een
 * foutmelding plakt.
 */
const versie = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')).version

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    define: { __APP_VERSION__: JSON.stringify(versie) },
    build: { rollupOptions: { input: resolve(__dirname, 'src/main/index.ts') } }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: resolve(__dirname, 'src/preload/index.ts') } }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          overlay: resolve(__dirname, 'src/renderer/overlay.html'),
          receipt: resolve(__dirname, 'src/renderer/receipt.html')
        }
      }
    }
  }
})
