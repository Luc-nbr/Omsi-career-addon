import { existsSync } from 'node:fs'
import { basename, join } from 'node:path'
import { readOmsiLines } from './omsiFile'
import { leesTextuurKop, textuurId, type Bus3dTextuurBron } from './bus3d'
import type { Bus3dOmgeving, Bus3dTextuur } from '../shared/bus3d'

/**
 * DE OMGEVING "BUITEN" UIT DE EIGEN INSTALLATIE VAN DE SPELER (bus3d-ontwerp §5.6)
 *
 * Luc wees het beeld van openOMSI aan: een bus onder de hemel van OMSI zelf, met
 * wolken, op een grijze vloer. Die hemel staat in `envir.cfg`: `[sky_textures]`
 * noemt drie panorama's (dag, schemer, nacht; 2048x512, u = rondom, v = hoogte);
 * overdag de eerste. De wolken komen uit `Weather/clouds.cfg`: zonder gekozen weer
 * "Cumulus 1" (idee uit openOMSI, weather_setup.rs:26-31), een doorzichtige laag
 * van 2000 m per herhaling. `Texture/clouds.tga` is het grijze wolkendek van
 * "bewolkt" en past niet bij een zonnige middag.
 *
 * We leveren niets van OMSI mee: dit wordt bij de speler gelezen, en de texturen
 * gaan net als die van de bus op id door `omsi3d://t/<id>`.
 */

function textuurVan(pad: string): { textuur: Bus3dTextuur; bron: Bus3dTextuurBron } | undefined {
  if (!existsSync(pad)) return undefined
  const uit = leesTextuurKop(pad)
  if ('klacht' in uit) return undefined
  const id = textuurId(pad, uit.grootte, uit.mtime)
  return {
    textuur: {
      id,
      soort: uit.kop.route,
      formaat: uit.kop.formaat,
      srgb: true,
      b: uit.kop.b,
      h: uit.kop.h,
      mips: uit.kop.mips,
      niveaus: uit.kop.niveaus,
      mime: uit.kop.mime,
      vorm: uit.kop.vorm,
      bytes: uit.grootte,
      // Groot genoeg dat het textuurplan hem nooit weglaat; de hemel zakt niet.
      oppervlak: 1,
      uv: 1,
      naam: basename(pad)
    },
    bron: { id, pad, grootte: uit.grootte, mtime: Math.round(uit.mtime), mime: uit.kop.mime ?? 'application/octet-stream' }
  }
}

export function leesBus3dOmgeving(omsiMap: string): { omgeving: Bus3dOmgeving; textuurBronnen: Bus3dTextuurBron[] } {
  const omgeving: Bus3dOmgeving = { wolkMaat: 2000 }
  const textuurBronnen: Bus3dTextuurBron[] = []
  const pad = (rel: string): string => join(omsiMap, ...rel.split(/[\\/]+/).filter(Boolean))

  // De hemel: de eerste regel onder [sky_textures] (overdag).
  try {
    const regels = readOmsiLines(join(omsiMap, 'envir.cfg'))
    const i = regels.findIndex((r) => r.trimEnd() === '[sky_textures]')
    const rel = i >= 0 ? (regels[i + 1] ?? '').trim() : ''
    const t = rel ? textuurVan(pad(rel)) : undefined
    if (t) {
      omgeving.hemel = t.textuur
      textuurBronnen.push(t.bron)
    }
  } catch {
    // geen envir.cfg: dan het eigen verloop
  }

  // De wolken: "Cumulus 1", anders de eerste soort met "sct" (verspreid).
  try {
    const regels = readOmsiLines(join(omsiMap, 'Weather', 'clouds.cfg'))
    const soorten: Array<{ naam: string; textuur: string; maat: number; soort: string }> = []
    regels.forEach((r, i) => {
      if (r.trimEnd() !== '[cloudtype]') return
      soorten.push({
        naam: (regels[i + 1] ?? '').trim(),
        textuur: (regels[i + 2] ?? '').trim(),
        maat: Number((regels[i + 3] ?? '').trim()),
        soort: (regels[i + 4] ?? '').trim().toLowerCase()
      })
    })
    const keus = soorten.find((s) => s.naam.toLowerCase() === 'cumulus 1') ?? soorten.find((s) => s.soort === 'sct')
    const t = keus?.textuur ? textuurVan(join(omsiMap, 'Texture', keus.textuur)) : undefined
    if (t && keus) {
      omgeving.wolken = t.textuur
      if (Number.isFinite(keus.maat) && keus.maat > 10) omgeving.wolkMaat = keus.maat
      textuurBronnen.push(t.bron)
    }
  } catch {
    // geen weerbestand: dan zonder wolkenlaag (de hemel heeft er zelf ook)
  }
  return { omgeving, textuurBronnen }
}
