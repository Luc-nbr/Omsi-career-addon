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
  /**
   * OMSI in een venster starten in plaats van op volledig scherm.
   *
   * Staat standaard aan, en dat is een keuze. De overlay is een venster dat
   * altijd bovenop ligt; boven een spel dat het scherm exclusief opeist is dat
   * de klassieke aanleiding voor een verloren Direct3D-apparaat, en dan blijft
   * het beeld zwart terwijl de menu's er gewoon overheen staan. Een gebruiker
   * meldde precies dat. In een venster speelt OMSI net zo goed, en de overlay
   * doet wat hij hoort te doen.
   *
   * Wie liever volledig scherm rijdt zet hem uit; dan start de app OMSI zoals
   * het spel het zelf zou doen.
   */
  windowedOmsi: boolean
  /**
   * De OMSI-map die de speler zelf heeft aangewezen.
   *
   * De app zoekt hem zelf op de gebruikelijke plekken, maar iemand kan het spel
   * ergens hebben staan waar niemand kijkt. Dan wijst hij hem eenmaal aan en is
   * het daarna klaar. Leeg betekent: zoek het zelf maar uit.
   */
  omsiPath?: string
  /**
   * Heeft de speler die map zelf bevestigd?
   *
   * Los van `omsiPath`, want de app kan hem ook zelf gevonden hebben. Pas als
   * dit aanstaat houdt hij op met vragen; tot die tijd legt hij zijn vondst
   * eenmaal voor. Iemand met twee installaties krijgt anders stil de verkeerde.
   */
  omsiConfirmed?: boolean
  /**
   * Dag of nacht. `systeem` volgt wat Windows zegt en is de beginstand.
   *
   * Los van Windows, want de app wordt 's avonds in een donkere kamer gebruikt
   * terwijl Windows nog op dag staat -- of andersom. Wie er niets van vindt
   * merkt er niets van; wie er wel iets van vindt drukt op het knopje.
   */
  theme?: 'systeem' | 'licht' | 'donker'
}

function settingsPath(userDataPath: string): string {
  return join(userDataPath, 'settings.json')
}

export function readSettings(userDataPath: string): Settings {
  try {
    const raw = JSON.parse(readFileSync(settingsPath(userDataPath), 'utf8')) as Partial<Settings>
    return {
      language: isLanguage(raw.language) ? raw.language : DEFAULT_LANGUAGE,
      overlayRate: isOverlayRate(raw.overlayRate) ? raw.overlayRate : 'rustig',
      windowedOmsi: raw.windowedOmsi !== false,
      omsiPath: typeof raw.omsiPath === 'string' && raw.omsiPath ? raw.omsiPath : undefined,
      omsiConfirmed: raw.omsiConfirmed === true,
      theme:
        raw.theme === 'licht' || raw.theme === 'donker' || raw.theme === 'systeem'
          ? raw.theme
          : 'systeem'
    }
  } catch {
    return { language: DEFAULT_LANGUAGE, overlayRate: 'rustig', windowedOmsi: true, theme: 'systeem' }
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
    overlayRate: isOverlayRate(settings.overlayRate) ? settings.overlayRate : current.overlayRate,
    windowedOmsi:
      typeof settings.windowedOmsi === 'boolean' ? settings.windowedOmsi : current.windowedOmsi,
    omsiPath:
      typeof settings.omsiPath === 'string'
        ? settings.omsiPath || undefined
        : current.omsiPath,
    omsiConfirmed:
      typeof settings.omsiConfirmed === 'boolean' ? settings.omsiConfirmed : current.omsiConfirmed,
    theme:
      settings.theme === 'licht' || settings.theme === 'donker' || settings.theme === 'systeem'
        ? settings.theme
        : current.theme
  }
  const path = settingsPath(userDataPath)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(clean, undefined, 2)}\n`, 'utf8')
  return clean
}
