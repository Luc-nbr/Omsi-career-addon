import type { Beginplek, VrijCheckVol } from './beginplek'
import type { LaunchResult } from './launch'
import type { SituationRequest, SituationResult } from './situation'
import type { StartupResult } from './startup'
import type { FreeResult, Klaargezet, VrijWanneer } from '../shared/api'
import type { WeatherKind } from '../shared/weather'

/*
 * VRIJ RIJDEN STARTEN
 *
 * "Er lädt garnix": dat was de tweede klacht. Wat daar misging, stond verspreid
 * over `free:start` -- een fout bij het klaarzetten van knoppen sloeg het
 * starten van OMSI over, een draaiend OMSI kreeg niets klaargezet en de
 * speler werd naar een situatie van een eerdere rit gestuurd, en een mislukte
 * start liet een overlay boven het bureaublad hangen. Hier staat de volgorde
 * los van Electron, zodat een proef hem kan nalopen (`probe-vrijstart.ts`):
 *
 * 1. Kijken of OMSI draait.
 * 2. Controleren: een bus, een plek, een kaart met tegels. Met OMSI dicht
 *    weigert START dan met een reden; draait OMSI al, dan gaat het door zonder
 *    iets klaar te zetten -- de overlay volgt toch wat de speler daar doet.
 *    Plek en moment komen van het scherm als de speler zelf een tijd koos;
 *    met een automatische tijd worden ze hier opnieuw bepaald.
 * 3. De situatie schrijven, altijd. Ook als OMSI al draait: dan kan de speler
 *    hem daar via Laden openen.
 * 4. Alleen met OMSI dicht: het startscherm klaarzetten, de wachtende knoppen
 *    bijschrijven (in een eigen `try`, want dat mag het starten nooit
 *    tegenhouden), en OMSI starten.
 */

export interface VrijStartDeps {
  isRunning(): Promise<boolean>
  check(folder: string, wanneer?: VrijWanneer): Promise<VrijCheckVol>
  /** Het inzetpunt `nr`, als het nog bestaat. */
  inzetpunt(folder: string, nr: number): Beginplek | undefined
  writeSituation(request: SituationRequest): SituationResult
  presetStartup(folder: string, file: string): StartupResult
  schrijfStraks(): Promise<void>
  launchOmsi(): Promise<LaunchResult>
  log(regel: string): void
}

export interface VrijStartVerzoek {
  mapFolder: string
  /** Door het hoofdproces aangevuld met kleurstelling, aanhanger en wagenpark. */
  vehicle?: SituationRequest['vehicle']
  wanneer?: VrijWanneer
  weather?: WeatherKind
  plek?: number
  moment?: { year: number; dayOfYear: number; minutes: number }
  /** De naam van de situatie in het laadmenu van OMSI. */
  naam: string
  beschrijving?: string
  /** Voor proeven: waar de situatie heen gaat. */
  into?: string
}

export interface VrijStartUitkomst {
  running: boolean
  launched: boolean
  start?: LaunchResult
  klaargezet: Klaargezet
  plek?: Beginplek
  moment?: { year: number; dayOfYear: number; minutes: number; bron: 'klok' | 'eersteVertrek' | 'gekozen' }
  fout?: FreeResult['fout']
  foutTekst?: string
  startup?: StartupResult
  situatie?: SituationResult
}

function tekstVan(fout: unknown): string {
  return fout instanceof Error ? fout.message : String(fout)
}

export async function startVrijeRit(deps: VrijStartDeps, req: VrijStartVerzoek): Promise<VrijStartUitkomst> {
  const running = await deps.isRunning()
  const weiger = (fout: NonNullable<FreeResult['fout']>, foutTekst?: string): VrijStartUitkomst => ({
    running,
    launched: false,
    klaargezet: 'niets',
    fout,
    foutTekst
  })
  /* Draait OMSI al, dan volgt de overlay wat de speler daar doet; er valt niets te weigeren. */
  const doorZonderIets = (reden: string): VrijStartUitkomst => {
    deps.log(`vrij rijden: ${reden} -- OMSI draait al, niets klaargezet`)
    return { running, launched: false, klaargezet: 'niets' }
  }

  if (!req.vehicle?.relativePath) {
    if (!running) return weiger('geenBus')
    return doorZonderIets('geen bus gekozen')
  }

  /*
   * De plek en het moment. Koos de speler zelf een tijd, dan wat de voet
   * noemde, als die plek nog bestaat. Met een automatische tijd (de klok van
   * de pc) bepaalt START ze opnieuw: de voet rekende ze uit toen de kaart
   * gekozen werd, en wie daarna tien minuten op de busstap bleef, startte
   * anders tien minuten in het verleden, bij een plek waar de ritten van toen
   * al weg waren. Een gekozen datum gaat mee in `wanneer` en blijft staan.
   */
  const tijdGekozen = req.wanneer?.tijd !== undefined
  let plek = tijdGekozen && req.plek !== undefined ? deps.inzetpunt(req.mapFolder, req.plek) : undefined
  let moment: VrijStartUitkomst['moment'] = tijdGekozen && req.moment ? { ...req.moment, bron: 'gekozen' } : undefined
  if (!plek || !moment) {
    let check: VrijCheckVol | undefined
    let foutTekst: string | undefined
    try {
      check = await deps.check(req.mapFolder, req.wanneer)
    } catch (fout) {
      foutTekst = tekstVan(fout)
    }
    if (check?.ok && check.plek) {
      plek ??= check.plek
      moment ??= check.moment
    } else {
      /*
       * Gooit het opnieuw bepalen een fout (de werker hapert) terwijl de voet
       * wel een plek had: dan die, liever dan weigeren wat net nog kon. Een
       * antwoord als "geen tegels" is geen hapering; dat hangt niet van de klok
       * af, en dan weigert START zoals de voet.
       */
      const vanScherm =
        !check && !tijdGekozen && req.plek !== undefined && req.moment ? deps.inzetpunt(req.mapFolder, req.plek) : undefined
      if (vanScherm && req.moment) {
        deps.log(`vrij rijden: plek en tijd niet opnieuw te bepalen (${foutTekst ?? '?'}); die van het scherm`)
        plek = vanScherm
        moment = { ...req.moment, bron: 'klok' }
      } else {
        const fout = check?.fout ?? 'geenDienstregeling'
        if (!running) return weiger(fout, foutTekst)
        return doorZonderIets(`controle zegt ${fout}${foutTekst ? ` (${foutTekst})` : ''}`)
      }
    }
  }

  let situatie: SituationResult
  try {
    situatie = deps.writeSituation({
      mapFolder: req.mapFolder,
      name: req.naam,
      description: req.beschrijving ?? '',
      year: moment.year,
      dayOfYear: moment.dayOfYear,
      minutes: moment.minutes,
      vehicle: req.vehicle,
      spawn: plek.spawn,
      weather: req.weather,
      into: req.into
    })
    if (!situatie.vehiclePlaced) throw new Error('de bus kon niet neergezet worden')
  } catch (fout) {
    if (!running) return weiger('schrijven', tekstVan(fout))
    deps.log(`vrij rijden: situatie niet geschreven (${tekstVan(fout)})`)
    return { running, launched: false, klaargezet: 'niets', plek, moment, foutTekst: tekstVan(fout) }
  }

  /* OMSI leest zijn startscherm alleen bij het opstarten: laststn.osn en options.cfg blijven van hem. */
  if (running) return { running, launched: false, klaargezet: 'situatie', plek, moment, situatie }

  let startup: StartupResult
  try {
    startup = deps.presetStartup(req.mapFolder, situatie.file)
  } catch {
    startup = { lastSituation: false, lastMap: false }
  }
  const klaargezet: Klaargezet = startup.lastSituation && startup.lastMap ? 'start' : 'situatie'

  try {
    /* Knoppen die nog aan een toets moesten: nu kan het, OMSI is nog dicht. */
    await deps.schrijfStraks()
  } catch (fout) {
    deps.log(`vrij rijden: knoppen bijschrijven mislukt (${tekstVan(fout)}); OMSI start toch`)
  }

  let start: LaunchResult
  let foutTekst: string | undefined
  try {
    start = await deps.launchOmsi()
  } catch (fout) {
    start = 'mislukt'
    foutTekst = tekstVan(fout)
  }
  return {
    running,
    launched: start === 'gestart',
    start,
    klaargezet,
    plek,
    moment,
    startup,
    situatie,
    foutTekst
  }
}
