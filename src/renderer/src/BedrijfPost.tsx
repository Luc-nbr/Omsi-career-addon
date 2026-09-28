import { useState, type JSX } from 'react'
import type { Bedrijf, Bericht, BerichtSoort } from '../../core/bedrijf'
import type { CareerPayload } from '../../shared/api'
import { formatMoney } from '../../shared/format'
import { t, type Language, type TextKey } from '../../shared/i18n'
import { useLanguage, useT } from './language'

/*
 * Het postvak van het bedrijf.
 *
 * Eerst stond dit op de telefoon, maar die gebruik je alleen in het spel, en
 * Luc: "alleen info die relevant is tijdens het rijden moet in de telefoon, de
 * rest kan in de app". Een ziekmelding of een aflopende concessie is iets om
 * tussen twee diensten op te pakken, hier naast het personeel en de
 * concessies waar je er iets aan kunt doen.
 */

type Afzender = 'directie' | 'boekhouding' | 'opdrachtgever' | 'personeelszaken' | 'werkplaats' | 'opleidingen'

const AFZENDER: Record<BerichtSoort, Afzender> = {
  welkom: 'directie',
  niveau: 'directie',
  dagrapport: 'boekhouding',
  kas: 'boekhouding',
  rit: 'opdrachtgever',
  verlengd: 'opdrachtgever',
  vervallen: 'opdrachtgever',
  afloop: 'opdrachtgever',
  ziek: 'personeelszaken',
  vertrek: 'personeelszaken',
  ontevreden: 'personeelszaken',
  werkplaats: 'werkplaats',
  slijtage: 'werkplaats',
  opleiding: 'opleidingen',
  telaat: 'personeelszaken',
  pech: 'werkplaats',
  ochtend: 'directie',
  uitgevallen: 'opdrachtgever',
  rooster: 'directie',
  vorm: 'werkplaats'
}

/** Waarden in centen: die worden een bedrag voordat ze in de tekst gaan. */
const BEDRAGEN = new Set(['kas', 'resultaat', 'bedrag', 'boete', 'kosten'])

/**
 * Onderwerp en tekst van een bericht, in de taal van nu. Het bedrijf bewaart
 * alleen de soort en de waarden, zie `Bericht` in core/bedrijf.ts.
 */
export function berichtTekst(
  bericht: Bericht,
  naam: string,
  language: Language
): { van: string; onderwerp: string; tekst: string } {
  const v: Record<string, string | number> = { naam, dag: bericht.dag }
  for (const [sleutel, waarde] of Object.entries(bericht.v ?? {})) {
    v[sleutel] = BEDRAGEN.has(sleutel) && typeof waarde === 'number' ? formatMoney(waarde / 100, language) : waarde
  }
  if (bericht.soort === 'opleiding') v.cursus = t(language, `bd.course.${bericht.v?.id}` as TextKey)
  if (bericht.soort === 'vorm') v.vorm = t(language, `bd.vorm.${bericht.v?.vorm}` as TextKey)
  if (bericht.soort === 'rit') {
    const stap = Number(bericht.v?.stap ?? 0)
    v.stap = stap > 0 ? `+${stap}` : stap < 0 ? `${stap}` : '±0'
  }
  const soort = bericht.soort
  return {
    van: t(language, `tb.from.${AFZENDER[soort]}` as TextKey),
    onderwerp: t(language, `tb.msg.${soort}.t` as TextKey, v),
    tekst:
      soort === 'afloop'
        ? t(language, bericht.v?.verlengt ? 'tb.msg.afloop.ja' : 'tb.msg.afloop.nee')
        : t(language, `tb.msg.${soort}.b` as TextKey, v)
  }
}

/** Goed nieuws, slecht nieuws of gewoon nieuws: de kleur van de stip. */
function toon(bericht: Bericht): 'goed' | 'slecht' | 'gewoon' {
  switch (bericht.soort) {
    case 'kas':
    case 'vertrek':
    case 'vervallen':
    case 'ontevreden':
    case 'slijtage':
    case 'pech':
    case 'uitgevallen':
      return 'slecht'
    case 'ochtend':
      return Number(bericht.v?.open ?? 0) > 0 ? 'slecht' : 'gewoon'
    case 'afloop':
      return bericht.v?.verlengt ? 'gewoon' : 'slecht'
    case 'dagrapport':
      return Number(bericht.v?.resultaat ?? 0) < 0 ? 'slecht' : 'goed'
    case 'rit':
      return Number(bericht.v?.stap ?? 0) < 0 ? 'slecht' : 'goed'
    case 'opleiding':
    case 'niveau':
    case 'verlengd':
    case 'werkplaats':
    case 'rooster':
      return 'goed'
    default:
      return 'gewoon'
  }
}

export function Postvak({
  bedrijf,
  onCareer
}: {
  bedrijf: Bedrijf
  onCareer: (payload: CareerPayload) => void
}): JSX.Element {
  const tr = useT()
  const taal = useLanguage()
  const [open, setOpen] = useState<number>()
  const post = bedrijf.post ?? []
  const ongelezen = post.filter((b) => !b.gelezen).length
  const lees = (id?: number): void => void window.career.bedrijfPost(id).then(onCareer)

  return (
    <section className="bd-paneel breed">
      <div className="bd-paneelkop">
        <h2>{tr('bd.mailCount', { n: post.length, unread: ongelezen })}</h2>
        {ongelezen > 0 && (
          <button type="button" className="bd-link" onClick={() => lees()}>
            {tr('tb.allRead')}
          </button>
        )}
      </div>
      {post.length === 0 ? (
        <p className="bd-rustig">{tr('tb.noMail')}</p>
      ) : (
        <ul className="bd-post">
          {post.map((bericht) => {
            const { van, onderwerp, tekst } = berichtTekst(bericht, bedrijf.naam, taal)
            const isOpen = open === bericht.id
            return (
              <li key={bericht.id}>
                <button
                  type="button"
                  className={`${bericht.gelezen ? '' : 'nieuw'} ${isOpen ? 'open' : ''}`}
                  aria-expanded={isOpen}
                  onClick={() => {
                    setOpen(isOpen ? undefined : bericht.id)
                    if (!bericht.gelezen) lees(bericht.id)
                  }}
                >
                  <i className={`bd-poststip ${toon(bericht)}`} aria-hidden="true" />
                  <span className="bd-postvan">{van}</span>
                  <b>{onderwerp}</b>
                  <span className="bd-postdag">{tr('bd.dayN', { day: bericht.dag })}</span>
                  {isOpen && <p>{tekst}</p>}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
