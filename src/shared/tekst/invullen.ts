/*
 * Teksten van de planning, deel invullen: het paneel "Open diensten" en de
 * centrale (ontwerp busbedrijf-planning §6.4). De sleutels `bd.fout.*` staan
 * in fundament.ts.
 */
export const TEKST_INVULLEN = {
  'bd.inv.kop': { en: 'Open duties ({n})', de: 'Offene Dienste ({n})', fr: 'Services ouverts ({n})', nl: 'Open diensten ({n})' },
  'bd.inv.open': { en: 'Open', de: 'Offen', fr: 'Ouvert', nl: 'Open' },
  'bd.inv.reden.ziek': { en: 'sick', de: 'krank', fr: 'malade', nl: 'ziek' },
  'bd.inv.reden.telaat': { en: 'late ({min} min)', de: 'verspätet ({min} Min)', fr: 'en retard ({min} min)', nl: 'te laat ({min} min)' },
  'bd.inv.reden.laat': { en: 'late', de: 'verspätet', fr: 'en retard', nl: 'te laat' },
  'bd.inv.reden.pech': { en: 'bus will not start', de: 'Bus springt nicht an', fr: 'le bus ne démarre pas', nl: 'bus start niet' },
  'bd.inv.reden.afwezig': { en: 'absent', de: 'abwesend', fr: 'absent', nl: 'afwezig' },
  'bd.inv.reden.werkplaats': { en: 'bus in the workshop', de: 'Bus in der Werkstatt', fr: 'bus à l’atelier', nl: 'bus in de werkplaats' },
  'bd.inv.regel': {
    en: 'Line {lijn} · block {omloop} · {van}–{tot} · working time {werk} h · paid {betaald} h',
    de: 'Linie {lijn} · Umlauf {omloop} · {van}–{tot} · Arbeitszeit {werk} Std · bezahlt {betaald} Std',
    fr: 'Ligne {lijn} · rotation {omloop} · {van}–{tot} · temps de travail {werk} h · payé {betaald} h',
    nl: 'Lijn {lijn} · omloop {omloop} · {van}–{tot} · werktijd {werk} u · betaald {betaald} u'
  },
  'bd.inv.busRegel': {
    en: 'Line {lijn} · block {omloop} · bus {bus} · {van}–{tot}',
    de: 'Linie {lijn} · Umlauf {omloop} · Bus {bus} · {van}–{tot}',
    fr: 'Ligne {lijn} · rotation {omloop} · bus {bus} · {van}–{tot}',
    nl: 'Lijn {lijn} · omloop {omloop} · bus {bus} · {van}–{tot}'
  },
  'bd.inv.busRegelZonder': {
    en: 'Line {lijn} · block {omloop} · {van}–{tot}',
    de: 'Linie {lijn} · Umlauf {omloop} · {van}–{tot}',
    fr: 'Ligne {lijn} · rotation {omloop} · {van}–{tot}',
    nl: 'Lijn {lijn} · omloop {omloop} · {van}–{tot}'
  },
  'bd.inv.centraleDoet': { en: 'dispatch: {wat} ({geld})', de: 'Leitstelle: {wat} ({geld})', fr: 'régulation : {wat} ({geld})', nl: 'centrale: {wat} ({geld})' },
  'bd.inv.collega': { en: 'Colleague', de: 'Kollege', fr: 'Collègue', nl: 'Collega' },
  'bd.inv.collegaVrij': { en: '{naam} · {uren} h free', de: '{naam} · {uren} Std frei', fr: '{naam} · {uren} h libre', nl: '{naam} · {uren} u vrij' },
  'bd.inv.collegaGeen': { en: 'Nobody free who fits', de: 'Niemand frei, der passt', fr: 'Personne de libre qui convienne', nl: 'Niemand vrij die past' },
  'bd.inv.collegaBevoegd': { en: 'little experience on this bus', de: 'wenig Erfahrung mit diesem Bus', fr: 'peu d’expérience sur ce bus', nl: 'weinig ervaring op deze bus' },
  'bd.inv.collegaOveruren': { en: 'overtime {geld}', de: 'Überstunden {geld}', fr: 'heures sup. {geld}', nl: 'overuren {geld}' },
  'bd.inv.uitzend': { en: 'Agency driver · {geld}', de: 'Leihfahrer · {geld}', fr: 'Intérimaire · {geld}', nl: 'Uitzendkracht · {geld}' },
  'bd.inv.uitzendSub': { en: '{n} more available today', de: 'heute noch {n} verfügbar', fr: 'encore {n} disponible(s) aujourd’hui', nl: 'nog {n} beschikbaar vandaag' },
  'bd.inv.onder': { en: 'Subcontract · {geld}', de: 'Vergeben · {geld}', fr: 'Sous-traiter · {geld}', nl: 'Uitbesteden · {geld}' },
  'bd.inv.liggen': {
    en: 'Let it drop · −{geld}, reputation −{n}',
    de: 'Ausfallen lassen · −{geld}, Ruf −{n}',
    fr: 'Laisser tomber · −{geld}, réputation −{n}',
    nl: 'Laten liggen · −{geld}, reputatie −{n}'
  },
  'bd.inv.liggenKort': { en: 'Let it drop · −{geld}', de: 'Ausfallen lassen · −{geld}', fr: 'Laisser tomber · −{geld}', nl: 'Laten liggen · −{geld}' },
  'bd.inv.liggenSub': {
    en: 'the trips are cancelled: no fee and a penalty',
    de: 'die Fahrten fallen aus: keine Vergütung und eine Strafe',
    fr: 'les trajets sont annulés : pas de rémunération et une pénalité',
    nl: 'de ritten vallen uit: geen vergoeding en een boete'
  },
  'bd.inv.zelf': { en: 'Drive it yourself', de: 'Selbst fahren', fr: 'Conduire vous-même', nl: 'Zelf rijden' },
  'bd.inv.zelfSub': { en: 'saves {geld}', de: 'spart {geld}', fr: 'économise {geld}', nl: 'bespaart {geld}' },
  'bd.inv.busAnder': { en: 'Another own bus', de: 'Anderer eigener Bus', fr: 'Un autre bus à vous', nl: 'Andere eigen bus' },
  'bd.inv.busAnderGeen': { en: 'No own bus free', de: 'Kein eigener Bus frei', fr: 'Aucun bus à vous de libre', nl: 'Geen eigen bus vrij' },
  'bd.inv.busAnderOptie': { en: 'Bus {bus} · {geld}', de: 'Bus {bus} · {geld}', fr: 'Bus {bus} · {geld}', nl: 'Bus {bus} · {geld}' },
  'bd.inv.busVorm': { en: 'different type', de: 'andere Bauart', fr: 'autre type', nl: 'andere vorm' },
  'bd.inv.busHuur': { en: 'Hire a replacement bus · {geld}', de: 'Ersatzbus mieten · {geld}', fr: 'Louer un bus de remplacement · {geld}', nl: 'Vervangende bus huren · {geld}' },
  'bd.inv.busLiggen': { en: 'Cancel the block · −{geld}', de: 'Umlauf ausfallen lassen · −{geld}', fr: 'Annuler la rotation · −{geld}', nl: 'Omloop laten uitvallen · −{geld}' },
  'bd.inv.ongedaan': { en: 'Undo', de: 'Rückgängig', fr: 'Annuler', nl: 'Ongedaan maken' },
  'bd.inv.structureel': {
    en: '{n} duties are subcontracted ({geld})',
    de: '{n} Dienste sind vergeben ({geld})',
    fr: '{n} services sont sous-traités ({geld})',
    nl: '{n} diensten zijn uitbesteed ({geld})'
  },
  'bd.inv.tonen': { en: 'Show', de: 'Anzeigen', fr: 'Afficher', nl: 'Tonen' },
  'bd.inv.verbergen': { en: 'Hide', de: 'Ausblenden', fr: 'Masquer', nl: 'Verbergen' },
  'bd.inv.meer': { en: 'More…', de: 'Mehr…', fr: 'Plus…', nl: 'Meer…' },
  'bd.inv.gekozen.collega': { en: '{naam} steps in', de: '{naam} springt ein', fr: '{naam} remplace', nl: '{naam} valt in' },
  'bd.inv.gekozen.eigen': { en: '{naam} drives', de: '{naam} fährt', fr: '{naam} conduit', nl: '{naam} rijdt' },
  'bd.inv.gekozen.uitzend': { en: 'Agency driver', de: 'Leihfahrer', fr: 'Intérimaire', nl: 'Uitzendkracht' },
  'bd.inv.gekozen.onder': { en: 'Subcontracted', de: 'Vergeben', fr: 'Sous-traité', nl: 'Uitbesteed' },
  'bd.inv.gekozen.liggen': { en: 'You let it drop', de: 'Du lässt es ausfallen', fr: 'Vous laissez tomber', nl: 'Laat je liggen' },
  'bd.inv.gekozen.uitval': { en: 'Cancelled', de: 'Fällt aus', fr: 'Annulé', nl: 'Valt uit' },
  'bd.inv.gekozen.huur': { en: 'Hired bus', de: 'Mietbus', fr: 'Bus loué', nl: 'Huurbus' },
  'bd.inv.gekozen.eigenBus': { en: 'Bus {bus}', de: 'Bus {bus}', fr: 'Bus {bus}', nl: 'Bus {bus}' },
  'bd.inv.door.hand': { en: 'by you', de: 'von dir', fr: 'par vous', nl: 'door jou' },
  'bd.inv.door.centrale': { en: 'by dispatch', de: 'von der Leitstelle', fr: 'par la régulation', nl: 'door de centrale' },
  'bd.inv.toeslag': { en: '+20 % rush', de: '+20 % Eilzuschlag', fr: '+20 % urgence', nl: '+20 % spoed' },
  'bd.inv.geenOpen': { en: 'Nothing open today.', de: 'Heute ist nichts offen.', fr: 'Rien d’ouvert aujourd’hui.', nl: 'Niets open vandaag.' },
  'bd.inv.plots': { en: 'Sudden', de: 'Kurzfristig', fr: 'Imprévu', nl: 'Plots' }
} as const satisfies Record<string, { en: string; de: string; fr: string; nl: string }>
