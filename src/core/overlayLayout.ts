import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { mergeLayout, type OverlayLayout } from '../shared/overlay'

/**
 * Waar de chauffeur zijn overlay heeft neergezet.
 *
 * Dit hoort niet bij een profiel maar bij het scherm: wie twee chauffeurs heeft,
 * wil zijn vensters niet twee keer slepen.
 */
function layoutPath(userDataPath: string): string {
  return join(userDataPath, 'overlay.json')
}

export function readOverlayLayout(userDataPath: string): OverlayLayout {
  try {
    const raw = readFileSync(layoutPath(userDataPath), 'utf8')
    return mergeLayout(JSON.parse(raw) as Partial<OverlayLayout>)
  } catch {
    return mergeLayout(undefined)
  }
}

export function writeOverlayLayout(userDataPath: string, layout: OverlayLayout): void {
  const path = layoutPath(userDataPath)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(layout, undefined, 2)}\n`, 'utf8')
}
