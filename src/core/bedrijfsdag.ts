import { heeftConcessie, meldBericht, opleidingKlaar, type Bedrijf } from './bedrijf'
import type { Dagrooster, LijnWeek } from './planTypen'
import { vulAan } from './rooster'
import { legeVandaag, meldUitval, uitvalVoorDag } from './uitval'
import type { Vehicle } from './vehicles'
import { vormVanVoertuig } from './voertuigvorm'

/*
 * De overgang naar de planning, en het begin van elke bedrijfsdag.
 *
 * `migreer` gebeurt één keer, bij de eerste schrijfactie in de versie met de
 * planning (ontwerp §3.3): de weken van de concessies uit de dienstregeling,
 * tellers voor de nummers, de busvorm van elke eigen bus uit OMSI, en een
 * rooster voor een hele week -- zodat Lucs bus en chauffeur na de update
 * meteen meerijden in plaats van stil te staan. Er komt een bericht bij met
 * de nieuwe rekensom.
 *
 * `beginDag` komt na elke afsluiting: een nieuwe `vandaag`, zo nodig zelf
 * aanvullen (na de opleiding Planner), en de uitval van vanochtend.
 */

type Weken = Record<string, Record<string, LijnWeek>>

export function migreer(
  b: Bedrijf,
  dagen: Dagrooster[],
  weken: Weken,
  voertuigen: Vehicle[]
): { bedrijf: Bedrijf; melding: { bussen: number; diensten: number } } {
  let uit: Bedrijf = {
    ...b,
    // De week van elke concessie waarvan de kaart gelezen kon worden.
    concessies: b.concessies.map((c) => {
      const w = weken[c.mapFolder]?.[c.lineFile]
      return w
        ? {
            ...c,
            week: {
              gemRituren: w.gemRituren,
              gemWerkuren: w.gemWerkuren,
              gemDiensten: w.gemDiensten,
              gemOmlopen: w.gemOmlopen,
              piekOmlopen: w.piekOmlopen,
              berekendOp: b.dag
            }
          }
        : c
    }),
    busTeller: Math.max(b.busTeller ?? 0, 100, ...(b.bussen ?? []).map((x) => x.nummer)),
    personeelTeller: Math.max(b.personeelTeller ?? 0, ...(b.personeel ?? []).map((m) => m.id)),
    // Een `vandaag` van een andere dag geldt niet.
    vandaag: b.vandaag?.dag === b.dag ? b.vandaag : undefined
  }

  // De vorm van elke eigen bus, zoals OMSI hem kent (een aanhanger is geleed).
  const bussen = (uit.bussen ?? []).map((bus) => {
    const v = voertuigen.find((x) => x.relativePath.toLowerCase() === bus.relativePath.toLowerCase())
    if (!v) return bus
    const vorm = vormVanVoertuig({ naam: `${v.manufacturer} ${v.type}`, relativePath: v.relativePath, aanhanger: v.aanhanger })
    if (vorm === bus.vorm) return bus
    uit = meldBericht(uit, 'vorm', { nummer: bus.nummer, vorm })
    return { ...bus, vorm }
  })
  uit = { ...uit, bussen, rooster: { bussen: {}, chauffeurs: {}, gemaakt: b.dag } }

  const aangevuld = vulAan(uit, dagen, b.dag, 'week')
  uit = aangevuld.bedrijf
  const vandaag = dagen.find((d) => d.dag === b.dag)
  const uren = (vandaag?.kaarten ?? [])
    .flatMap((k) => k.omlopen)
    .filter((o) => heeftConcessie(uit, o.mapFolder, o.lineFile))
    .reduce((s, o) => s + o.rituren, 0)
  uit = meldBericht(uit, 'rooster', {
    uren: Math.round(uren * 10) / 10,
    oud: Math.round(b.concessies.reduce((s, c) => s + c.urenPerDag, 0) * 10) / 10,
    bussen: aangevuld.bussen,
    diensten: aangevuld.diensten
  })
  return { bedrijf: uit, melding: { bussen: aangevuld.bussen, diensten: aangevuld.diensten } }
}

export function beginDag(b: Bedrijf, dagen: Dagrooster[], weken: Weken, voertuigen: Vehicle[]): Bedrijf {
  let uit = b.rooster ? b : migreer(b, dagen, weken, voertuigen).bedrijf
  uit = { ...uit, vandaag: uit.vandaag?.dag === uit.dag ? uit.vandaag : legeVandaag(uit.dag) }
  if (uit.rooster?.autoAanvullen && opleidingKlaar(uit, 'planner')) uit = vulAan(uit, dagen, uit.dag, 'dag').bedrijf
  uit = uitvalVoorDag(uit, dagen)
  return meldUitval(uit, dagen)
}
