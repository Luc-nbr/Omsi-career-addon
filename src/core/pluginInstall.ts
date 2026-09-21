import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { metNieuwePogingen } from './veilig'

/**
 * De overlay-plugin hoort in `OMSI 2\plugins\`. Het installatieprogramma zet hem
 * er neer als het Steam via het register kan vinden, maar OMSI kan ook op een
 * andere schijf staan — en dan komt libraryfolders.vdf eraan te pas, wat in NSIS
 * niet te doen is. Daarom controleert de app het bij elke start zelf.
 */
export const PLUGIN_FILES = ['OMSICareerPlugin.dll', 'OMSICareer.opl'] as const

export interface PluginStatus {
  /** Staan beide bestanden in de plugins-map van OMSI? */
  installed: boolean
  /** Zijn ze gelijk aan wat deze versie van de app meebrengt? */
  upToDate: boolean
  /** Of er zojuist iets is neergezet of bijgewerkt. */
  changed: boolean
  target?: string
  error?: string
}

function digest(file: string): string {
  return createHash('sha1').update(readFileSync(file)).digest('hex')
}

/**
 * Waar de meegeleverde plugin staat: in een gebouwde app onder `resources`,
 * tijdens ontwikkelen gewoon in de projectmap.
 */
export function pluginSourceDir(resourcesPath: string, packaged: boolean): string {
  return packaged ? join(resourcesPath, 'plugin') : join(process.cwd(), 'plugin', 'out')
}

/**
 * Zet de plugin klaar in OMSI en meldt wat de stand is. Er wordt alleen
 * geschreven als het bestand ontbreekt of afwijkt, zodat een draaiend spel niet
 * onnodig wordt gestoord.
 */
export function ensurePlugin(
  omsiPath: string,
  sourceDir: string,
  fallbackDir?: string,
  /**
   * Draait OMSI? Alleen dan klopt de melding dat het spel de plugin vasthoudt.
   * Op 21-09 kwam die melding terwijl OMSI dicht was: het bestand zat even
   * vast, waarschijnlijk bij een virusscanner die de verse DLL bekeek.
   */
  omsiDraait?: boolean
): PluginStatus {
  const target = join(omsiPath, 'plugins')

  // De .opl staat in de projectmap naast de bron, de DLL in out/ ernaast.
  const locate = (name: string): string | undefined => {
    for (const dir of [sourceDir, fallbackDir].filter(Boolean) as string[]) {
      const candidate = join(dir, name)
      if (existsSync(candidate)) return candidate
    }
    return undefined
  }

  const sources = PLUGIN_FILES.map((name) => ({ name, path: locate(name) }))
  const missing = sources.filter((entry) => !entry.path).map((entry) => entry.name)
  if (missing.length > 0) {
    return {
      installed: false,
      upToDate: false,
      changed: false,
      target,
      error: `De app mist ${missing.join(' en ')}. Bouw de plugin met plugin\\build.cmd.`
    }
  }

  try {
    mkdirSync(target, { recursive: true })
    let changed = false
    for (const { name, path } of sources) {
      const destination = join(target, name)
      if (existsSync(destination) && digest(destination) === digest(path!)) continue
      // Even vastgehouden door een scanner is geen reden om de update over te slaan.
      metNieuwePogingen(() => copyFileSync(path!, destination))
      changed = true
    }
    return { installed: true, upToDate: true, changed, target }
  } catch (cause) {
    return {
      installed: PLUGIN_FILES.every((name) => existsSync(join(target, name))),
      upToDate: false,
      changed: false,
      target,
      error:
        cause instanceof Error && cause.message.includes('EBUSY') && omsiDraait !== false
          ? 'OMSI draait en houdt de plugin vast. Sluit het spel en start deze app opnieuw.'
          : cause instanceof Error
            ? `De plugin kon niet in de OMSI-map gezet worden: ${cause.message}`
            : String(cause)
    }
  }
}
