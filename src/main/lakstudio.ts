import { createHash } from 'node:crypto'
import { readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import { familieInfo, familieVan, lakInfoVan, lakOpties, type Familie, type LakInfo } from '../core/lakfamilie'
import {
  bewaarBeeld,
  bewaarProject,
  haalUitWachtrij,
  klaarzetten,
  lakLijst,
  leesBeeld,
  leesProject,
  leesWachtrij,
  nieuwProjectId,
  plaatsLak,
  projecten,
  verwerkWachtrij,
  verwijderLak,
  weesOvernemen,
  weesWeg,
  wezen,
  type LakOmgeving,
  type PlaatsUitkomst
} from '../core/lakstudio'
import { leesRegister } from '../core/addon'
import {
  LAK_KANALEN,
  bussenInKleurstelling,
  naamFout,
  omsiHoofdletters,
  type LakFamilieInfo,
  type LakPlaatsUitkomst,
  type LakProject,
  type NietOpReden
} from '../shared/lak'
import { busfoto4Map } from './busfoto4'
import { busfotoMap } from './busfoto'
import type { Bus3dDienst } from './bus3d'
import type { Bus3dVenster } from './bus3dvenster'
import type { Grendel } from './grendel'

/**
 * DE LAKSTUDIO IN MAIN (lakstudio-ontwerp §5, §8)
 *
 * Main is de enige die paden kent. Hier staan de IPC-kanalen van de studio en
 * van Addons, elk bewaakt (kritiek punt 18):
 * - van de STUDIO alleen als het bericht van het 3D-venster komt én dat venster
 *   nu in doel 'lakstudio' staat (`vanStudio`); het verborgen fotovenster laadt
 *   dezelfde brug, maar is een ander webContents;
 * - van ADDONS alleen als het van het hoofdvenster komt (`vanHoofd`).
 * Alles ook achter de schakelaar `bus3d` (beslissing 5): zonder schakelaar geeft
 * elk kanaal niets, en werkt de wachtrij niet.
 *
 * SCHRIJVEN gaat onder dezelfde grendel als de add-on-manager (main/grendel.ts),
 * en nooit terwijl OMSI draait: dan KLAARZETTEN (§5.7, beslissing 4), en main
 * plaatst zodra OMSI dicht is (de wacht in index.ts), bij het starten van de app,
 * en vlak voordat de app zelf OMSI start (`voorStart`).
 *
 * VERGETEN (§5.6 punt 7): na plaatsen, opnieuw opslaan en verwijderen de foto's
 * v3b en v4 en de heldenbeelden van die naam, voor elke bus van de familie; dan
 * de gebeurtenis `bus:kleurstellingenVeranderd` naar beide vensters.
 */

export interface LakstudioAfhankelijk {
  omsi: () => string
  userData: () => string
  log: (regel: string) => void
  logFout: (wat: string, fout: unknown) => void
  /** De schakelaar `bus3d`. */
  aan: () => boolean
  /** Draait OMSI (een verse peiling)? */
  omsiDraait: () => Promise<boolean>
  bus3d: () => Bus3dDienst
  venster: () => Bus3dVenster | undefined
  grendel: Grendel
  /** Een gebeurtenis naar het hoofdvenster. */
  naarHoofd: (kanaal: string, ...args: unknown[]) => void
  /** De eigen bussen van het busbedrijf (deel F); tot die er is: niemand. */
  eigenBussen?: () => ReadonlyArray<{ nummer: number; relatiefPad?: string; kleurstelling?: string | null }>
}

export interface Lakstudio {
  /** Maakt de studio nu een lak? Dan wacht een buswissel in het venster (§4.1). */
  bezig(): boolean
  /** Vlak voordat de app OMSI start: de wachtrij eerst (§5.7c). */
  voorStart(): Promise<void>
  /** OMSI is dicht (de wacht in index.ts), of de app start: de wachtrij afwerken. */
  omsiDicht(waarom: string): Promise<void>
  /** Voor `busKleurstellingen`: de namen die voor deze bus in de wachtrij staan. */
  wachtendVoor(relatiefPad: string): string[]
}

/** Een project-id: 16 hextekens. */
const isId = (x: unknown): x is string => typeof x === 'string' && /^[0-9a-f]{16}$/.test(x)
const isBus = (x: unknown): x is string =>
  typeof x === 'string' && /\.bus$/i.test(x) && !/^[\\/]|^[a-z]:/i.test(x) && !x.split(/[\\/]/).includes('..')

export function maakLakstudio(ipcMain: IpcMain, af: LakstudioAfhankelijk): Lakstudio {
  let maken = 0
  const omgeving = (): LakOmgeving => ({ omsi: af.omsi(), userData: af.userData(), log: af.log })

  /** Wat het pakket van elk lid weet; bouwt ontbrekende pakketten (in de werker). */
  async function infosVoor(familie: Familie): Promise<Map<string, LakInfo>> {
    const uit = new Map<string, LakInfo>()
    for (const lid of familie.leden) {
      const p = await af.bus3d().lakPakket(lid.rel)
      if ('reden' in p) {
        const reden: NietOpReden = p.reden === 'versleuteld' ? 'versleuteld' : 'geen-model'
        uit.set(lid.rel, { oppervlak: new Map(), glas: new Set(), bakbaar: reden })
      } else uit.set(lid.rel, lakInfoVan(p.manifest, p.kop))
    }
    return uit
  }

  /** De familie met de kennis van de pakketten, zoals §3 hem wil. */
  async function familieMet(relatiefPad: string, opties: { start?: string; extra?: Record<string, string[]>; eigenCti?: string } = {}): Promise<Familie> {
    const omsi = af.omsi()
    const kaal = familieVan(omsi, relatiefPad, { sjablonen: false })
    if (kaal.geenCtc) return kaal
    const infos = await infosVoor(kaal)
    return familieVan(omsi, relatiefPad, {
      info: (rel) => infos.get(rel),
      start: opties.start,
      eigenCti: opties.eigenCti,
      extra: (rel) => opties.extra?.[rel] ?? []
    })
  }

  /** De paden van de familie in het register van Bus3D, zodat de studio ze op id ophaalt. */
  function naarStudio(familie: Familie): LakFamilieInfo {
    const paden: string[] = []
    for (const d of familie.doelen) {
      if (d.standaard) paden.push(d.standaard)
      const s = d.sjabloon
      if (s) for (const p of [s.bs, s.al, s.ma, s.ad, s.mu]) if (p) paden.push(p)
    }
    const ids = af.bus3d().registreerLos(paden)
    return familieInfo(familie, (pad) => ids.get(pad))
  }

  /** Foto's en heldenbeelden van een naam vergeten, voor elke bus van de familie (§5.6 punt 7). */
  function vergeetKleurstelling(bussen: string[], naam: string): void {
    const ud = af.userData()
    const v3 = busfotoMap(ud)
    const v4 = busfoto4Map(ud)
    let weg = 0
    for (const rel of bussen) {
      const sleutel = createHash('sha1').update(`${rel.toLowerCase()}|${naam}`).digest('hex').slice(0, 16)
      for (const map of [v3, v4]) {
        try {
          for (const n of readdirSync(map)) {
            if (!n.startsWith(sleutel)) continue
            rmSync(join(map, n), { force: true })
            weg++
          }
        } catch {
          // geen map
        }
      }
    }
    af.bus3d().kleurstellingenVeranderd(bussen, naam)
    if (weg) af.log(`Lakstudio: ${weg} foto('s) van '${naam}' vergeten`)
  }

  function meldVeranderd(bussen: string[], naam: string): void {
    vergeetKleurstelling(bussen, naam)
    af.naarHoofd(LAK_KANALEN.kleurstellingenVeranderd, bussen)
    af.venster()?.stuur(LAK_KANALEN.kleurstellingenVeranderd, bussen)
  }

  /** Plaatsen of klaarzetten, onder de grendel (§5.6, §5.7). */
  async function plaats(
    project: LakProject,
    naam: string,
    texturen: Array<{ doel: string; dds: Uint8Array }>,
    keuze?: 'weggooien'
  ): Promise<LakPlaatsUitkomst> {
    maken++
    try {
      const uit = await af.grendel.probeer(async (): Promise<LakPlaatsUitkomst> => {
        const register = leesRegister(af.userData())
        const eigen = register.addons.find((a) => a.soort === 'lak' && a.lak?.projectId === project.id)
        const eigenCti = eigen?.bestanden.find((b) => /\.cti$/i.test(b.pad))?.pad.split('/').pop()
        // Eerst alles controleren: de familie opnieuw, met de pakketten.
        const familie = await familieMet(project.bus, { start: project.startKleurstelling, eigenCti })
        // OMSI vlak voor het eerste bestand nog eens nagaan (het uitrekenen van de familie kan seconden duren).
        if (await af.omsiDraait()) return klaarzetten(omgeving(), { familie, project, naam, texturen })
        const u: PlaatsUitkomst = plaatsLak(omgeving(), { familie, project, naam, texturen, keuze })
        if ('omsi' in u) return klaarzetten(omgeving(), { familie, project, naam, texturen })
        if ('fout' in u) return u
        bewaarProject(af.userData(), { ...project, naam: u.plan.naam, geplaatst: { naam: u.plan.naam, nnnn: u.nnnn, versie: u.versie } })
        meldVeranderd(familie.leden.map((l) => l.rel), u.plan.naam)
        return { ok: true, index: u.index, nnnn: u.nnnn, versie: u.versie }
      }, 'lakstudio: plaatsen')
      return uit
    } catch (fout) {
      af.logFout('Lakstudio plaatsen', fout)
      return { fout: 'fout', detail: fout instanceof Error ? fout.message : String(fout) }
    } finally {
      maken--
    }
  }

  async function omsiDicht(waarom: string): Promise<void> {
    if (!af.aan() || leesWachtrij(af.userData()).length === 0) return
    if (await af.omsiDraait()) return
    maken++
    try {
      await af.grendel.probeer(async () => {
        const families = new Map<string, Familie>()
        for (const w of leesWachtrij(af.userData())) {
          if (!families.has(w.bus)) families.set(w.bus, await familieMet(w.bus))
        }
        const klaar = verwerkWachtrij(omgeving(), (bus) => families.get(bus) ?? familieVan(af.omsi(), bus), () => false)
        for (const k of klaar) {
          if (!('ok' in k.uitkomst)) continue
          const f = families.get(leesProject(af.userData(), k.projectId)?.bus ?? '')
          meldVeranderd(f ? f.leden.map((l) => l.rel) : [], k.naam)
          af.naarHoofd(LAK_KANALEN.geplaatst, { naam: k.naam })
          af.venster()?.stuur(LAK_KANALEN.geplaatst, { naam: k.naam })
        }
        if (klaar.length) af.log(`Lakstudio: wachtrij afgewerkt (${waarom}): ${klaar.map((k) => `${k.naam} ${'ok' in k.uitkomst ? 'geplaatst' : 'wacht'}`).join(', ')}`)
      }, 'lakstudio: wachtrij')
    } catch (fout) {
      af.logFout('Lakstudio wachtrij', fout)
    } finally {
      maken--
    }
  }

  // ------------------------------------------------------------ IPC: de studio
  const studio = <T>(kanaal: string, doe: (e: IpcMainInvokeEvent, ...args: unknown[]) => Promise<T> | T, anders: T): void => {
    ipcMain.handle(kanaal, async (e, ...args) => {
      const v = af.venster()
      if (!af.aan() || !v?.vanStudio(e)) return anders
      try {
        return await doe(e, ...args)
      } catch (fout) {
        af.logFout(`Lakstudio ${kanaal}`, fout)
        return anders
      }
    })
  }
  const hoofd = <T>(kanaal: string, doe: (...args: unknown[]) => Promise<T> | T, anders: T): void => {
    ipcMain.handle(kanaal, async (e, ...args) => {
      if (!af.aan() || !af.venster()?.vanHoofd(e)) return anders
      try {
        return await doe(...args)
      } catch (fout) {
        af.logFout(`Lakstudio ${kanaal}`, fout)
        return anders
      }
    })
  }
  studio(LAK_KANALEN.projecten, (_e, rel) => (isBus(rel) ? projecten(af.userData(), rel) : []), [] as LakProject[])
  studio(
    LAK_KANALEN.doelen,
    async (_e, rel, start, extra) => {
      if (!isBus(rel)) return undefined
      const e = extra && typeof extra === 'object' ? (extra as Record<string, string[]>) : undefined
      const familie = await familieMet(rel, { start: typeof start === 'string' ? start : undefined, extra: e })
      return naarStudio(familie)
    },
    undefined as LakFamilieInfo | undefined
  )
  studio(
    LAK_KANALEN.opties,
    (_e, rel) => (isBus(rel) ? lakOpties(familieVan(af.omsi(), rel, { sjablonen: false })) : []),
    [] as ReturnType<typeof lakOpties>
  )
  studio(LAK_KANALEN.laad, (_e, id) => (isId(id) ? leesProject(af.userData(), id) : undefined), undefined as LakProject | undefined)
  studio(
    LAK_KANALEN.bewaar,
    (_e, p) => {
      const project = p as LakProject
      if (!project || typeof project !== 'object' || !isBus(project.bus)) return undefined
      const id = isId(project.id) ? project.id : nieuwProjectId()
      return bewaarProject(af.userData(), { ...project, id, gemaakt: project.gemaakt || new Date().toISOString() })
    },
    undefined as LakProject | undefined
  )
  studio(
    LAK_KANALEN.beeld,
    (_e, id, bytes) => (isId(id) && bytes instanceof Uint8Array ? bewaarBeeld(af.userData(), id, bytes) : undefined),
    undefined as { id: string; soort: string } | undefined
  )
  studio(
    LAK_KANALEN.beeldBytes,
    (_e, id, beeld) => (isId(id) && typeof beeld === 'string' ? leesBeeld(af.userData(), id, beeld) : undefined),
    undefined as Uint8Array | undefined
  )
  studio(
    LAK_KANALEN.naamVrij,
    (_e, rel, naam, projectId) => {
      if (!isBus(rel) || typeof naam !== 'string') return { fout: 'leeg' }
      const familie = familieVan(af.omsi(), rel, { sjablonen: false })
      const eigen = isId(projectId)
        ? leesRegister(af.userData()).addons.find((a) => a.soort === 'lak' && a.lak?.projectId === projectId)?.lak?.naam
        : undefined
      return naamFout(naam, familie.bestaandeNamen.filter((n) => eigen === undefined || omsiHoofdletters(n) !== omsiHoofdletters(eigen)))
    },
    { fout: 'leeg' } as ReturnType<typeof naamFout>
  )
  studio(
    LAK_KANALEN.plaats,
    async (_e, id, naam, texturen, keuze) => {
      if (!isId(id) || typeof naam !== 'string' || !Array.isArray(texturen)) return { fout: 'fout' } as LakPlaatsUitkomst
      const project = leesProject(af.userData(), id)
      if (!project) return { fout: 'fout', detail: 'geen project' } as LakPlaatsUitkomst
      const lijst = (texturen as Array<{ doel?: unknown; dds?: unknown }>)
        .filter((t) => typeof t?.doel === 'string' && /^d\d{1,2}$/.test(t.doel) && t.dds instanceof Uint8Array)
        .map((t) => ({ doel: t.doel as string, dds: t.dds as Uint8Array }))
      return plaats(project, naam, lijst, keuze === 'weggooien' ? 'weggooien' : undefined)
    },
    { fout: 'fout' } as LakPlaatsUitkomst
  )
  const verwijder = async (id: unknown, ookOntwerp: unknown, keuze: unknown): Promise<unknown> => {
    if (!isId(id)) return { fout: 'weg' }
    const r = await af.grendel.probeer(async () => {
      if (await af.omsiDraait()) return { fout: 'omsi' }
      const register = leesRegister(af.userData())
      const addon = register.addons.find((a) => a.soort === 'lak' && a.lak?.projectId === id)
      const uit = verwijderLak(omgeving(), id, {
        ookOntwerp: ookOntwerp === true,
        keuze: keuze === 'alles' || keuze === 'laten' ? keuze : undefined
      })
      if ('ok' in uit && addon?.lak) meldVeranderd(addon.lak.familie, addon.lak.naam)
      return uit
    }, 'lakstudio: verwijderen')
    return r
  }
  studio(LAK_KANALEN.verwijder, (_e, id, ookOntwerp, keuze) => verwijder(id, ookOntwerp, keuze), { fout: 'fout' } as unknown)
  studio(
    LAK_KANALEN.gebruik,
    (_e, rel, naam) => (isBus(rel) && typeof naam === 'string' ? bussenInKleurstelling(af.eigenBussen?.() ?? [], rel, naam) : []),
    [] as number[]
  )
  studio(LAK_KANALEN.exporteer, () => ({ fout: 'fase2' }), { fout: 'fase2' } as unknown)
  studio(LAK_KANALEN.importeer, () => ({ fout: 'fase2' }), { fout: 'fase2' } as unknown)

  // ------------------------------------------------------------ IPC: Addons (hoofdvenster)
  hoofd('lak:lijst', () => lakLijst(af.userData()), [] as ReturnType<typeof lakLijst>)
  hoofd('lak:wachtrij', () => leesWachtrij(af.userData()), [] as ReturnType<typeof leesWachtrij>)
  hoofd('lak:nietPlaatsen', (id) => (isId(id) ? haalUitWachtrij(af.userData(), id) : false), false)
  hoofd('lak:verwijderHoofd', (id, ookOntwerp, keuze) => verwijder(id, ookOntwerp, keuze), { fout: 'fout' } as unknown)
  hoofd('lak:wezen', () => wezen(omgeving()), [] as ReturnType<typeof wezen>)
  hoofd(
    'lak:weesWeg',
    async (id) => (typeof id === 'string' ? af.grendel.probeer(async () => ((await af.omsiDraait()) ? false : weesWeg(omgeving(), id))) : false),
    false as unknown
  )
  hoofd(
    'lak:weesOvernemen',
    async (id) => (typeof id === 'string' ? af.grendel.probeer(async () => weesOvernemen(omgeving(), id)) : false),
    false as unknown
  )

  /*
   * Staat er iets in de wachtrij, dan elke 20 s kijken of OMSI dicht is (§5.7a;
   * P15: binnen 35 s na het sluiten geplaatst). Zonder wachtrij geen peiling:
   * `tasklist` naast een spel hapert.
   */
  const klok = setInterval(() => {
    if (maken > 0 || !af.aan()) return
    if (leesWachtrij(af.userData()).length === 0) return
    void omsiDicht('controle van de wachtrij')
  }, 20_000)
  klok.unref?.()

  return {
    bezig: () => maken > 0,
    voorStart: () => omsiDicht('vlak voor het starten van OMSI'),
    omsiDicht,
    wachtendVoor: (rel) =>
      af.aan()
        ? leesWachtrij(af.userData())
            .filter((w) => w.bus.toLowerCase() === rel.toLowerCase())
            .map((w) => w.naam)
        : []
  }
}
