import { execFileSync } from 'node:child_process'
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

/*
 * De bouwstempel: welke broncode (korte git-hash, met een + als er
 * onvastgelegde wijzigingen in zaten) en wanneer. Tussen twee versienummers
 * worden er soms tien exe's gebouwd, en een oude draagbare exe met hetzelfde
 * nummer was niet van een nieuwe te onderscheiden. Of het de installatie of de
 * draagbare is, weet pas de draaiende app; zie main/versiewacht.ts.
 */
function bouw(): { hash: string; tijd: string; iso: string } {
  const git = (...args: string[]): string =>
    execFileSync('git', args, { cwd: __dirname, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  let hash = 'onbekend'
  try {
    hash = git('rev-parse', '--short=7', 'HEAD')
    if (git('status', '--porcelain', '--untracked-files=no')) hash += '+'
  } catch {
    // Geen git (een zip van de broncode): dan blijft het "onbekend".
  }
  const nu = new Date()
  const twee = (n: number): string => String(n).padStart(2, '0')
  const tijd =
    `${nu.getFullYear()}-${twee(nu.getMonth() + 1)}-${twee(nu.getDate())} ` +
    `${twee(nu.getHours())}:${twee(nu.getMinutes())}`
  // `iso` (UTC) om bouwen te vergelijken, `tijd` om te lezen; zie core/versiewacht.ts.
  return { hash, tijd, iso: nu.toISOString() }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    define: { __APP_VERSION__: JSON.stringify(versie), __BOUW__: JSON.stringify(bouw()) },
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
      /*
       * De stille filmpjes van wakker.ts altijd als bestand, ook als ze klein
       * zijn: als data:-adres houdt de CSP van apparaat.html ze tegen (media-src
       * valt onder default-src 'self'). De rest zoals Vite het wil.
       */
      assetsInlineLimit: (pad: string) => (/\.(mp4|webm)$/i.test(pad) ? false : undefined),
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
