import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import type { Laag, LakFamilieInfo, LakPlaatsUitkomst, LakProject, StrookSjabloon } from '../../../../shared/lak'
import { cp1252Vriendelijk } from '../../../../shared/lak'
import { useT } from '../../language'
import type { ViewerHandvat } from '../verbinding'
import { Verbinding } from '../verbinding'
import type { LakKlaarInfo } from './lakdoek'
import { begin, doe, ongedaan, opnieuw, type Geschiedenis } from './lagen'
import { grondkleur, plaatsOp, strook, type Busmaat } from './recept'

/**
 * HET ONTWIKKELPANEEL VAN HET LAKDOEK (lakstudio-ontwerp §10, L1)
 *
 * Geen studio voor spelers (die komt in L3), maar genoeg om het lakdoek te
 * zien werken: de doelen met hun maat, texeldichtheid, gedeeld en gedekt; een
 * vulkleur, een strook, een tekst, het masker tonen, de platte aanzichten, de
 * tweede viewport, aanwijzen, ongedaan maken, en [Opslaan in OMSI] (L2). Het
 * project wordt 2 s na elke wijziging bewaard (§4.10). Alleen in het 3D-venster
 * in doel 'lakstudio', achter de schakelaar `bus3d`.
 */

interface Props {
  pad: string
  handvat?: ViewerHandvat
  projectId?: string
  bedrijf?: string
  licht: boolean
  /** Pas als de bus in beeld staat (de werker heeft de geometrie nodig). */
  klaarVoorLak: boolean
}

const STROKEN: StrookSjabloon[] = ['onderband', 'raamband', 'dakband', 'schuin', 'golf', 'tweekleurig']

export function Ontwikkelpaneel({ pad, handvat, projectId, bedrijf, licht, klaarVoorLak }: Props): JSX.Element {
  const t = useT()
  const brug = window.bus3d!
  const [familie, zetFamilie] = useState<LakFamilieInfo>()
  const [klaar, zetKlaar] = useState<LakKlaarInfo | { fout: string }>()
  const [gesch, zetGesch] = useState<Geschiedenis>()
  const [naam, zetNaam] = useState('')
  const [naamFout, zetNaamFout] = useState<string>()
  const [masker, zetMasker] = useState(false)
  const [tweede, zetTweede] = useState(false)
  const [bezig, zetBezig] = useState<string>()
  const [uitkomst, zetUitkomst] = useState<LakPlaatsUitkomst>()
  const [keuze, zetKeuze] = useState<unknown>()
  const [herstart, zetHerstart] = useState(false)
  const bewaarKlok = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const tweedeDoek = useRef<HTMLCanvasElement>(null)

  // Familie en project: één keer per bus.
  useEffect(() => {
    let weg = false
    void (async () => {
      const f = await brug.lakDoelen(pad)
      if (weg) return
      zetFamilie(f)
      const bestaand = projectId ? await brug.lakLaad(projectId) : (await brug.lakProjecten(pad))[0]
      const nu = new Date().toISOString()
      const p: LakProject =
        bestaand ??
        (await brug.lakBewaar({
          versie: 1,
          id: '',
          naam: cp1252Vriendelijk(bedrijf || 'Mijn lak 1'),
          bus: pad,
          start: 'effen',
          lagen: [],
          opties: {},
          spiegel: { aan: true },
          gemaakt: nu,
          bewaard: nu
        } as LakProject)) as LakProject
      if (weg || !p || 'fout' in p) return
      zetGesch(begin(p))
      zetNaam(p.naam)
    })()
    return () => {
      weg = true
    }
  }, [brug, pad, projectId, bedrijf])

  // Het lakdoek starten zodra de bus er staat en de familie bekend is.
  useEffect(() => {
    if (!handvat || !familie || !gesch || !klaarVoorLak || klaar) return
    if (familie.geenCtc || familie.doelen.length === 0) {
      zetKlaar({ fout: t('ls.geenCtc') })
      return
    }
    void handvat.studio.start(familie, gesch.heden.lagen, gesch.heden.spiegel, licht).then((k) => zetKlaar(k as LakKlaarInfo | { fout: string }))
    // Alleen bij het starten.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handvat, familie, gesch !== undefined, klaarVoorLak])

  useEffect(() => () => handvat?.studio.stop(), [handvat])

  // Na een contextverlies herstart de werker het lakdoek zelf, licht (P4): alleen de stand bijwerken.
  useEffect(() => {
    const v = Verbinding.get()
    v.opLakHerstart = (k) => {
      zetKlaar(k as LakKlaarInfo | { fout: string })
      zetHerstart(true)
    }
    return () => {
      if (v.opLakHerstart) v.opLakHerstart = undefined
    }
  }, [])

  // Elke wijziging: de werker, en 2 s later bewaren.
  const pas = useCallback(
    (g: Geschiedenis) => {
      zetGesch(g)
      handvat?.studio.lagen(g.heden.lagen, g.heden.spiegel)
      if (bewaarKlok.current) clearTimeout(bewaarKlok.current)
      bewaarKlok.current = setTimeout(() => void brug.lakBewaar(g.heden), 2000)
    },
    [handvat, brug]
  )

  // De tweede viewport (§4.8): een eigen doek, als tweede viewer bij dezelfde werker.
  useEffect(() => {
    if (!tweede || !tweedeDoek.current) return
    const doek = tweedeDoek.current
    doek.width = 320
    doek.height = 180
    const h = Verbinding.get().meld(doek, {})
    h.maat(320, 180, 1)
    h.studio.tweede(true)
    return () => {
      h.studio.tweede(false)
      h.weg()
    }
  }, [tweede])

  const k = klaar && !('fout' in klaar) ? klaar : undefined
  // De doos van het manifest staat in o3d-assen: dat is ook de busruimte van de lagen.
  const busruimte: Busmaat | undefined = k ? { min: k.doos.min as Busmaat['min'], max: k.doos.max as Busmaat['max'], raamlijn: k.raamlijn } : undefined

  const voegToe = (laag: Laag): void => {
    if (gesch) pas(doe(gesch, { soort: 'voegToe', laag }))
  }

  const opslaan = async (): Promise<void> => {
    if (!handvat || !gesch) return
    zetUitkomst(undefined)
    zetBezig(t('ls.maken'))
    const b = await brug.lakBewaar({ ...gesch.heden, naam })
    const bewaard = b && !('fout' in b) ? b : undefined
    const uit = (await handvat.studio.exporteer()) as Array<{ doel: string; dds: Uint8Array }> | { fout: string }
    if ('fout' in uit) {
      zetBezig(undefined)
      zetUitkomst({ fout: 'fout', detail: uit.fout })
      return
    }
    const r = await brug.lakPlaats(bewaard?.id ?? gesch.heden.id, naam, uit.map((x) => ({ doel: x.doel, dds: x.dds })))
    zetBezig(undefined)
    zetUitkomst(r)
  }

  const toetsNaam = async (n: string): Promise<void> => {
    zetNaam(n)
    const f = await brug.lakNaamVrij(pad, n, gesch?.heden.id)
    zetNaamFout(f ? (f.fout === 'bezet' ? t('ls.naamBezet') : f.fout === 'teken' ? t('ls.naamTeken', { teken: f.teken }) : f.fout) : undefined)
  }

  return (
    <section className="bv-blok lak-ontwikkel">
      <h2 className="bv-blokkop">{t('ls.dev.titel')}</h2>
      {!k ? (
        <p className="bv-zacht">{klaar && 'fout' in klaar ? klaar.fout : '…'}</p>
      ) : (
        <>
          {herstart ? <p className="bv-zacht">{t('ls.dev.herstart')}</p> : null}
          {k.doelen.map((d) => (
            <p key={d.id} className="bv-tekst" data-doel={d.id}>
              {t('ls.dev.doel', { id: d.id, naam: d.naam, b: d.b, h: d.h, texels: d.texelsPerM, gedeeld: d.gedeeld, gedekt: d.gedekt })}
              {d.sjabloon ? ' · sjabloon' : ''} · {d.zones.length} zones · {Object.entries(d.ms).map(([a, b]) => `${a} ${b}`).join(', ')} ms
            </p>
          ))}
          {familie && familie.leden.length > 1 ? <p className="bv-zacht">{t('ls.ookOp', { bussen: familie.leden.filter((l) => l.bus !== pad).map((l) => l.bus.split('\\').pop()).join(', ') })}</p> : null}
          <div className="lak-rij">
            <label>
              {t('ls.dev.kleur')}{' '}
              <input type="color" defaultValue="#1d3f8f" onChange={(e) => voegToe(grondkleur(e.target.value))} />
            </label>
            <select onChange={(e) => busruimte && voegToe(strook(e.target.value as StrookSjabloon, '#ffffff', busruimte))} defaultValue="">
              <option value="" disabled>
                {t('ls.dev.strook')}
              </option>
              {STROKEN.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() =>
                busruimte &&
                voegToe({
                  id: `t${Date.now()}`,
                  naam: 'Tekst',
                  zichtbaar: true,
                  dekking: 1,
                  detail: 1,
                  soort: 'tekst',
                  tekst: naam || 'Lakstudio',
                  lettertype: 'Arial',
                  hoogteCm: 25,
                  kleur: '#ffffff',
                  plaats: plaatsOp('R', 0.45, 1.6, Math.max(1, (naam || 'Lakstudio').length * 0.16), busruimte)
                })
              }
            >
              {t('ls.dev.tekst')}
            </button>
          </div>
          <div className="lak-rij">
            {(['links', 'rechts', 'voorvlak', 'achtervlak', 'dak', 'schuin'] as const).map((s) => (
              <button key={s} type="button" onClick={() => handvat?.invoer({ soort: 'stand', stand: s })}>
                {t(`ls.dev.stand.${s}`)}
              </button>
            ))}
          </div>
          <div className="lak-rij">
            <label>
              <input type="checkbox" checked={masker} onChange={(e) => (zetMasker(e.target.checked), handvat?.studio.masker(e.target.checked))} /> {t('ls.dev.masker')}
            </label>
            <label>
              <input type="checkbox" checked={tweede} onChange={(e) => zetTweede(e.target.checked)} /> {t('ls.dev.tweede')}
            </label>
            <button type="button" disabled={!gesch?.verleden.length} onClick={() => gesch && pas(ongedaan(gesch))}>
              ↶
            </button>
            <button type="button" disabled={!gesch?.toekomst.length} onClick={() => gesch && pas(opnieuw(gesch))}>
              ↷
            </button>
            <button type="button" onClick={() => void handvat?.studio.kies(0, 0).then(zetKeuze)}>
              {t('ls.dev.aanwijzen')}
            </button>
          </div>
          {keuze ? <pre className="bv-zacht lak-klein">{JSON.stringify(keuze)}</pre> : null}
          <canvas ref={tweedeDoek} className="lak-tweede" hidden={!tweede} />
          <div className="lak-rij">
            <input value={naam} onChange={(e) => void toetsNaam(e.target.value)} aria-label="naam" />
            <button type="button" className="bv-hoofdknop" disabled={Boolean(bezig) || Boolean(naamFout)} onClick={() => void opslaan()}>
              {t('ls.opslaan')}
            </button>
          </div>
          {naamFout ? <p className="bv-zacht">{naamFout}</p> : null}
          {bezig ? <p className="bv-zacht">{bezig}</p> : null}
          {uitkomst ? (
            <p className="bv-zacht" data-uitkomst={JSON.stringify(uitkomst)}>
              {'ok' in uitkomst
                ? t('ls.geplaatst', { naam })
                : 'klaargezet' in uitkomst
                  ? t('ls.klaargezet')
                  : `${uitkomst.fout}${uitkomst.detail ? `: ${uitkomst.detail}` : ''}`}
            </p>
          ) : null}
        </>
      )}
    </section>
  )
}
