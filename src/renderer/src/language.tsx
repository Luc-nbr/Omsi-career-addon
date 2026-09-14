import { createContext, useContext, useMemo, type JSX, type ReactNode } from 'react'
import { DEFAULT_LANGUAGE, t, type Language, type TextKey } from '../../shared/i18n'

/**
 * De gekozen taal, beschikbaar voor elk onderdeel.
 *
 * Doorgeven als eigenschap zou betekenen dat de dienstkaart hem naar zeven
 * deelpanelen moet doorschuiven die er verder niets mee doen. Een context is
 * hier het rustigste: wie tekst nodig heeft vraagt erom.
 */
const LanguageContext = createContext<Language>(DEFAULT_LANGUAGE)

export function LanguageProvider({
  language,
  children
}: {
  language: Language
  children: ReactNode
}): JSX.Element {
  return <LanguageContext.Provider value={language}>{children}</LanguageContext.Provider>
}

export function useLanguage(): Language {
  return useContext(LanguageContext)
}

/** Geeft een vertaalfunctie voor de huidige taal. */
export function useT(): (key: TextKey, vars?: Record<string, string | number>) => string {
  const language = useLanguage()
  return useMemo(() => (key, vars) => t(language, key, vars), [language])
}
