/*
 * Teksten van de planning, deel vlootkaart (ontwerp busbedrijf-planning §8.5).
 * Alles onder `bd.kaart.`; de sleutels `bd.fout.*` staan in fundament.ts.
 */
export const TEKST_VLOOTKAART = {
  'bd.kaart.omsi': { en: 'OMSI {tijd}', de: 'OMSI {tijd}', fr: 'OMSI {tijd}', nl: 'OMSI {tijd}' },
  'bd.kaart.eigen': { en: 'Company clock {tijd}', de: 'Betriebsuhr {tijd}', fr: 'Horloge de l’entreprise {tijd}', nl: 'Bedrijfsklok {tijd}' },
  'bd.kaart.speel': { en: 'Play', de: 'Abspielen', fr: 'Lecture', nl: 'Afspelen' },
  'bd.kaart.pauze': { en: 'Pause', de: 'Pause', fr: 'Pause', nl: 'Pauze' },
  'bd.kaart.nu': { en: 'Now', de: 'Jetzt', fr: 'Maintenant', nl: 'Nu' },
  'bd.kaart.snelheid': { en: '×{n}', de: '×{n}', fr: '×{n}', nl: '×{n}' },
  'bd.kaart.klok': { en: 'Time of day', de: 'Uhrzeit', fr: 'Heure', nl: 'Tijd van de dag' },
  'bd.kaart.kaarten': { en: 'Maps', de: 'Karten', fr: 'Cartes', nl: 'Kaarten' },
  'bd.kaart.gepland': {
    en: 'Positions follow the timetable and the driver’s experience; only your own bus is measured.',
    de: 'Positionen nach Fahrplan und Erfahrung des Fahrers; nur dein eigener Bus wird gemessen.',
    fr: 'Positions selon l’horaire et l’expérience du conducteur ; seul ton bus est mesuré.',
    nl: 'Plekken volgens de dienstregeling en de ervaring van de chauffeur; alleen jouw bus is gemeten.'
  },
  'bd.kaart.andereDatum': {
    en: 'OMSI is playing {datum}; your company is running day {dag} ({bdatum}).',
    de: 'OMSI spielt den {datum}; dein Betrieb fährt Tag {dag} ({bdatum}).',
    fr: 'OMSI joue le {datum} ; ton entreprise roule le jour {dag} ({bdatum}).',
    nl: 'OMSI speelt {datum}; je bedrijf rijdt dag {dag} ({bdatum}).'
  },
  'bd.kaart.andereKaart': {
    en: 'OMSI is playing another map; the company clock runs on its own.',
    de: 'OMSI spielt eine andere Karte; die Betriebsuhr läuft selbst.',
    fr: 'OMSI joue une autre carte ; l’horloge de l’entreprise tourne seule.',
    nl: 'OMSI speelt een andere kaart; de bedrijfsklok loopt zelf.'
  },
  'bd.kaart.onderweg': { en: 'On the road ({n})', de: 'Unterwegs ({n})', fr: 'En route ({n})', nl: 'Onderweg ({n})' },
  'bd.kaart.remise': { en: 'In the depot ({n})', de: 'Im Betriebshof ({n})', fr: 'Au dépôt ({n})', nl: 'In de remise ({n})' },
  'bd.kaart.uit': { en: 'Cancelled ({n})', de: 'Fällt aus ({n})', fr: 'Supprimé ({n})', nl: 'Valt uit ({n})' },
  'bd.kaart.leeg': { en: 'None', de: 'Keine', fr: 'Aucun', nl: 'Geen' },
  'bd.kaart.naar': { en: 'Line {lijn} → {eind}', de: 'Linie {lijn} → {eind}', fr: 'Ligne {lijn} → {eind}', nl: 'Lijn {lijn} → {eind}' },
  'bd.kaart.omloop': { en: 'Block {omloop}', de: 'Umlauf {omloop}', fr: 'Service {omloop}', nl: 'Omloop {omloop}' },
  'bd.kaart.omloopDienst': {
    en: 'Block {omloop} · shift {deel} of {delen} · {van}–{tot}',
    de: 'Umlauf {omloop} · Dienst {deel} von {delen} · {van}–{tot}',
    fr: 'Service {omloop} · poste {deel} sur {delen} · {van}–{tot}',
    nl: 'Omloop {omloop} · dienst {deel} van {delen} · {van}–{tot}'
  },
  'bd.kaart.bus': { en: 'Bus {nummer} · {naam}', de: 'Bus {nummer} · {naam}', fr: 'Bus {nummer} · {naam}', nl: 'Bus {nummer} · {naam}' },
  'bd.kaart.chauffeur': {
    en: 'Driver {naam} · experience {n}',
    de: 'Fahrer {naam} · Erfahrung {n}',
    fr: 'Conducteur {naam} · expérience {n}',
    nl: 'Chauffeur {naam} · ervaring {n}'
  },
  'bd.kaart.volgende': {
    en: 'Next stop {halte} · {tijd} ({vertraging})',
    de: 'Nächster Halt {halte} · {tijd} ({vertraging})',
    fr: 'Prochain arrêt {halte} · {tijd} ({vertraging})',
    nl: 'Volgende halte {halte} · {tijd} ({vertraging})'
  },
  'bd.kaart.opTijd': { en: 'on time', de: 'pünktlich', fr: 'à l’heure', nl: 'op tijd' },
  'bd.kaart.minuten': { en: '{n} min', de: '{n} Min', fr: '{n} min', nl: '{n} min' },
  'bd.kaart.jij': {
    en: 'You · live from OMSI · {kmh} km/h · {vertraging}',
    de: 'Du · live aus OMSI · {kmh} km/h · {vertraging}',
    fr: 'Toi · en direct d’OMSI · {kmh} km/h · {vertraging}',
    nl: 'Jij · live uit OMSI · {kmh} km/h · {vertraging}'
  },
  'bd.kaart.jijGepland': {
    en: 'You · from the timetable',
    de: 'Du · nach Fahrplan',
    fr: 'Toi · selon l’horaire',
    nl: 'Jij · volgens de dienstregeling'
  },
  'bd.kaart.onder': {
    en: 'Subcontracted · subcontractor’s bus',
    de: 'Vergeben · Bus des Subunternehmers',
    fr: 'Sous-traité · bus du sous-traitant',
    nl: 'Uitbesteed · bus van de onderaannemer'
  },
  'bd.kaart.uitzend': { en: 'Agency driver', de: 'Leihfahrer', fr: 'Conducteur intérimaire', nl: 'Uitzendkracht' },
  'bd.kaart.huur': { en: 'Hired bus', de: 'Mietbus', fr: 'Bus de location', nl: 'Huurbus' },
  'bd.kaart.valtUit': { en: 'Cancelled ({reden})', de: 'Fällt aus ({reden})', fr: 'Supprimé ({reden})', nl: 'Valt uit ({reden})' },
  'bd.kaart.wachtLaat': {
    en: 'Waiting for the driver (+{min} min)',
    de: 'Wartet auf den Fahrer (+{min} Min)',
    fr: 'Attend le conducteur (+{min} min)',
    nl: 'Wacht op de chauffeur (+{min} min)'
  },
  'bd.kaart.busStaat': { en: 'Condition {staat} · damage {schade}', de: 'Zustand {staat} · Schaden {schade}', fr: 'État {staat} · dégâts {schade}', nl: 'Staat {staat} · schade {schade}' },
  'bd.kaart.reden.ziek': { en: 'sick', de: 'krank', fr: 'malade', nl: 'ziek' },
  'bd.kaart.reden.telaat': { en: 'late', de: 'verspätet', fr: 'en retard', nl: 'te laat' },
  'bd.kaart.reden.afwezig': { en: 'absent', de: 'abwesend', fr: 'absent', nl: 'afwezig' },
  'bd.kaart.reden.weg': { en: 'gone', de: 'weg', fr: 'parti', nl: 'weg' },
  'bd.kaart.reden.dubbel': { en: 'double-booked', de: 'doppelt eingeteilt', fr: 'en double', nl: 'dubbel ingedeeld' },
  'bd.kaart.reden.monteur': { en: 'mechanic', de: 'Mechaniker', fr: 'mécanicien', nl: 'monteur' },
  'bd.kaart.reden.pech': { en: 'breakdown', de: 'Panne', fr: 'panne', nl: 'pech' },
  'bd.kaart.reden.werkplaats': { en: 'in the workshop', de: 'in der Werkstatt', fr: 'à l’atelier', nl: 'in de werkplaats' },
  'bd.kaart.reden.open': { en: 'not covered', de: 'nicht besetzt', fr: 'non pourvu', nl: 'niet ingevuld' },
  'bd.kaart.volgen': { en: 'Follow', de: 'Folgen', fr: 'Suivre', nl: 'Volgen' },
  'bd.kaart.inPlanning': { en: 'In the planning', de: 'In der Planung', fr: 'Dans le planning', nl: 'In de planning' },
  'bd.kaart.invullen': { en: 'Fill in', de: 'Besetzen', fr: 'Pourvoir', nl: 'Invullen' },
  'bd.kaart.zelfRijden': { en: 'Drive yourself', de: 'Selbst fahren', fr: 'Conduire toi-même', nl: 'Zelf rijden' },
  'bd.kaart.sluit': { en: 'Close', de: 'Schließen', fr: 'Fermer', nl: 'Sluiten' },
  'bd.kaart.laden': {
    en: 'Reading the map from the OMSI folder…',
    de: 'Karte wird aus dem OMSI-Ordner gelesen…',
    fr: 'Lecture de la carte dans le dossier OMSI…',
    nl: 'Kaart wordt uit de OMSI-map gelezen…'
  },
  'bd.kaart.geen': {
    en: 'No concessions yet: nothing is running.',
    de: 'Noch keine Konzessionen: es fährt noch nichts.',
    fr: 'Pas encore de concessions : rien ne roule.',
    nl: 'Nog geen concessies: er rijdt nog niets.'
  },
  'bd.kaart.weg': {
    en: 'The map {kaart} is not in your OMSI folder.',
    de: 'Die Karte {kaart} ist nicht in deinem OMSI-Ordner.',
    fr: 'La carte {kaart} n’est pas dans ton dossier OMSI.',
    nl: 'De kaart {kaart} staat niet in je OMSI-map.'
  },
  'bd.kaart.geenRitten': {
    en: 'No buses run on this map today.',
    de: 'Heute fahren auf dieser Karte keine Busse.',
    fr: 'Aucun bus ne roule sur cette carte aujourd’hui.',
    nl: 'Vandaag rijden er op deze kaart geen bussen.'
  },
  'bd.kaart.legenda.eigen': { en: 'own bus and driver', de: 'eigener Bus und Fahrer', fr: 'bus et conducteur propres', nl: 'eigen bus en chauffeur' },
  'bd.kaart.legenda.jij': { en: 'you', de: 'du', fr: 'toi', nl: 'jij' },
  'bd.kaart.legenda.uitzend': { en: 'agency driver or hired bus', de: 'Leihfahrer oder Mietbus', fr: 'intérimaire ou bus de location', nl: 'uitzendkracht of huurbus' },
  'bd.kaart.legenda.onder': { en: 'subcontracted', de: 'vergeben', fr: 'sous-traité', nl: 'uitbesteed' },
  'bd.kaart.legenda.uit': { en: 'cancelled', de: 'fällt aus', fr: 'supprimé', nl: 'valt uit' }
} as const satisfies Record<string, { en: string; de: string; fr: string; nl: string }>
