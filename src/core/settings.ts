import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DEFAULT_LANGUAGE, isLanguage, type Language } from '../shared/i18n'
import { isOverlayRate, type OverlayRate } from '../shared/overlay'

/**
 * Instellingen die voor de hele app gelden en niet bij een chauffeur horen.
 * De taal is er zo een: je kiest hem eenmaal, ook als je drie chauffeurs hebt.
 */
export interface Settings {
  language: Language
  /**
   * Hoe vaak de overlay wordt bijgewerkt. Een doorzichtig venster over het spel
   * moet Windows bij elke verversing opnieuw over het beeld heen mengen, en op
   * een machine die het al krap heeft kost dat merkbaar vloeiendheid in OMSI.
   */
  overlayRate: OverlayRate
}

function settingsPath(userDataPath: string): string {
  return join(userDataPath, 'settings.json')
}

export function readSettings(userDataPath: string): Settings {
  try {
    const raw = JSON.parse(readFileSync(settingsPath(userDataPath), 'utf8')) as Partial<Settings>
    return {
      language: isLanguage(raw.language) ? raw.language : DEFAULT_LANGUAGE,
      overlayRate: isOverlayRate(raw.overlayRate) ? raw.overlayRate : 'rustig'
    }
  } catch {
    return { language: DEFAULT_LANGUAGE, overlayRate: 'rustig' }
  }
}

/**
 * Bewaart wat er meegegeven wordt en laat de rest staan. De app slaat vaak maar
 * één ding op -- de taal bij het wisselen, de verversing bij het schuiven -- en
 * het zou raar zijn als de taal daarmee de vloeiendheid terugzet.
 */
export function writeSettings(userDataPath: string, settings: Partial<Settings>): Settings {
  const current = readSettings(userDataPath)
  const clean: Settings = {
    language: isLanguage(settings.language) ? settings.language : current.language,
    overlayRate: isOverlayRate(settings.overlayRate) ? settings.overlayRate : current.overlayRate
  }
  const path = settingsPath(userDataPath)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(clean, undefined, 2)}\n`, 'utf8')
  return clean
}
