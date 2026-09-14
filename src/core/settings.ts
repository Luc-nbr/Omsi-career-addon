import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DEFAULT_LANGUAGE, isLanguage, type Language } from '../shared/i18n'

/**
 * Instellingen die voor de hele app gelden en niet bij een chauffeur horen.
 * De taal is er zo een: je kiest hem eenmaal, ook als je drie chauffeurs hebt.
 */
export interface Settings {
  language: Language
}

function settingsPath(userDataPath: string): string {
  return join(userDataPath, 'settings.json')
}

export function readSettings(userDataPath: string): Settings {
  try {
    const raw = JSON.parse(readFileSync(settingsPath(userDataPath), 'utf8')) as Partial<Settings>
    return { language: isLanguage(raw.language) ? raw.language : DEFAULT_LANGUAGE }
  } catch {
    return { language: DEFAULT_LANGUAGE }
  }
}

export function writeSettings(userDataPath: string, settings: Settings): Settings {
  const clean: Settings = {
    language: isLanguage(settings.language) ? settings.language : DEFAULT_LANGUAGE
  }
  const path = settingsPath(userDataPath)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(clean, undefined, 2)}\n`, 'utf8')
  return clean
}
