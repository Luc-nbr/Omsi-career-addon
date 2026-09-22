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
    /*
     * Twee ingangen: de app zelf, en de werker die kaarten uitleest. Die tweede
     * draait als worker_thread naast het hoofdproces, dus hij moet als eigen
     * bestand in `out/main` staan -- vandaar een naam in plaats van één pad.
     */
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          kaartwerker: resolve(__dirname, 'src/main/kaartwerker.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    /*
     * Twee bruggen: die van de app, en een kale voor het venster dat busfoto's
     * maakt. Dat venster hoort niets te kunnen behalve een tekening ontvangen
     * en een plaatje terugsturen.
     */
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
          busfoto: resolve(__dirname, 'src/preload/busfoto.ts')
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react()],
    build: {
      /*
       * Ook voor Safari. De pagina voor telefoon en tablet (apparaat.html) draait
       * niet in Electron maar in de browser van het toestel, en op een iPhone of
       * iPad is dat altijd Safari -- ook als je Chrome gebruikt. Standaard bouwt
       * electron-vite voor de Chromium van Electron alleen, en dan blijft er
       * schrijfwijze staan die een oudere iPhone niet leest.
       */
      target: ['chrome130', 'safari15'],
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          overlay: resolve(__dirname, 'src/renderer/overlay.html'),
          receipt: resolve(__dirname, 'src/renderer/receipt.html'),
          /* Het verborgen venster dat een bus in beeld brengt. */
          busfoto: resolve(__dirname, 'src/renderer/busfoto.html'),
          /* De navigatie op een telefoon of tablet, via main/apparaat.ts. */
          apparaat: resolve(__dirname, 'src/renderer/apparaat.html')
        }
      }
    }
  }
})
