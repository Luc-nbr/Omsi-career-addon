/*
 * Teksten van de planning, deel bedrijfsrit: zelf een dienst van je eigen
 * bedrijf rijden (ontwerp busbedrijf-planning §7.5). De sleutels `bd.fout.*`
 * staan in fundament.ts; hier alleen wat bij Zelf rijden hoort.
 */
export const TEKST_BEDRIJFSRIT = {
  'bd.rit.knop': { en: 'Drive yourself', de: 'Selbst fahren', fr: 'Conduire soi-même', nl: 'Zelf rijden' },
  'bd.rit.stap': { en: 'Company duty', de: 'Betriebsfahrt', fr: 'Service d’entreprise', nl: 'Bedrijfsrit' },
  'bd.rit.tegel': { en: 'Drive yourself', de: 'Selbst fahren', fr: 'Conduire soi-même', nl: 'Zelf rijden' },
  'bd.rit.kies.kop': { en: 'Drive yourself · duty {dienst}', de: 'Selbst fahren · Dienst {dienst}', fr: 'Conduire soi-même · service {dienst}', nl: 'Zelf rijden · dienst {dienst}' },
  'bd.rit.kies.van': { en: 'First trip', de: 'Erste Fahrt', fr: 'Premier trajet', nl: 'Eerste rit' },
  'bd.rit.kies.tot': { en: 'Last trip', de: 'Letzte Fahrt', fr: 'Dernier trajet', nl: 'Laatste rit' },
  'bd.rit.kies.jij': {
    en: 'You drive {van}–{tot} ({werk} h, {betaald} timetable hours).',
    de: 'Du fährst {van}–{tot} ({werk} h, {betaald} Fahrplanstunden).',
    fr: 'Vous conduisez de {van} à {tot} ({werk} h, {betaald} heures de service).',
    nl: 'Jij rijdt {van}–{tot} ({werk} u, {betaald} dienstregelingsuren).'
  },
  'bd.rit.kies.rest': {
    en: 'The rest ({van}–{tot}) is driven by {wie}: {geld}.',
    de: 'Den Rest ({van}–{tot}) fährt {wie}: {geld}.',
    fr: 'Le reste ({van}–{tot}) est assuré par {wie} : {geld}.',
    nl: 'De rest ({van}–{tot}) rijdt {wie}: {geld}.'
  },
  'bd.rit.kies.restGeen': { en: 'Nothing is left over.', de: 'Es bleibt nichts übrig.', fr: 'Il ne reste rien.', nl: 'Er blijft niets over.' },
  'bd.rit.kies.bespaart': {
    en: 'That saves your company {geld} today.',
    de: 'Das spart deinem Betrieb heute {geld}.',
    fr: 'Cela fait économiser {geld} à votre entreprise aujourd’hui.',
    nl: 'Dat bespaart je bedrijf {geld} vandaag.'
  },
  'bd.rit.kies.bespaartNiets': {
    en: 'This saves nothing: {naam} already drives this duty. You do get experience and the timing-point bonus.',
    de: 'Das spart nichts: {naam} fährt diesen Dienst schon. Du bekommst aber Erfahrung und den Bonus für die Zeitpunkte.',
    fr: 'Cela n’économise rien : {naam} assure déjà ce service. Vous gagnez quand même de l’expérience et le bonus de ponctualité.',
    nl: 'Dit bespaart niets: {naam} rijdt deze dienst al. Je krijgt wel ervaring en de tijdhaltebonus.'
  },
  'bd.rit.kies.nuRijden': { en: 'Drive now', de: 'Jetzt fahren', fr: 'Conduire maintenant', nl: 'Nu rijden' },
  'bd.rit.kies.later': { en: 'Book it, drive later', de: 'Festlegen, später fahren', fr: 'Réserver, conduire plus tard', nl: 'Vastleggen, later rijden' },
  'bd.rit.kies.annuleren': { en: 'Cancel', de: 'Abbrechen', fr: 'Annuler', nl: 'Annuleren' },
  'bd.rit.kies.andereOpen': {
    en: '{n} other duties are still open; the control room handles them if you do nothing.',
    de: 'Es sind noch {n} Dienste offen; die regelt die Leitstelle, wenn du nichts tust.',
    fr: 'Il reste {n} services ouverts ; le poste de contrôle s’en charge si vous ne faites rien.',
    nl: 'Er staan nog {n} diensten open; die regelt de centrale als je niets doet.'
  },
  'bd.rit.kies.geenPlan': {
    en: 'Today’s plan is not available yet. Try again in a moment.',
    de: 'Der Plan von heute ist noch nicht da. Versuch es gleich noch einmal.',
    fr: 'Le planning du jour n’est pas encore disponible. Réessayez dans un instant.',
    nl: 'Het plan van vandaag is er nog niet. Probeer het zo nog eens.'
  },
  'bd.rit.kies.terug': { en: 'Other duty', de: 'Anderer Dienst', fr: 'Autre service', nl: 'Andere dienst' },
  'bd.rit.voorstellen': { en: 'Suggestions', de: 'Vorschläge', fr: 'Suggestions', nl: 'Voorstellen' },
  'bd.rit.voorstel.open': {
    en: 'Open ({reden}) · {lijn} · {van}–{tot} · saves {geld}',
    de: 'Offen ({reden}) · {lijn} · {van}–{tot} · spart {geld}',
    fr: 'Ouvert ({reden}) · {lijn} · {van}–{tot} · économise {geld}',
    nl: 'Open ({reden}) · {lijn} · {van}–{tot} · bespaart {geld}'
  },
  'bd.rit.voorstel.stuk': {
    en: 'Short job: {van}–{tot} · saves {geld}',
    de: 'Kurzer Einsatz: {van}–{tot} · spart {geld}',
    fr: 'Petite mission : {van}–{tot} · économise {geld}',
    nl: 'Kort klusje: {van}–{tot} · bespaart {geld}'
  },
  'bd.rit.voorstel.uitbesteed': {
    en: '{lijn} · {van}–{tot} · saves {geld}',
    de: '{lijn} · {van}–{tot} · spart {geld}',
    fr: '{lijn} · {van}–{tot} · économise {geld}',
    nl: '{lijn} · {van}–{tot} · bespaart {geld}'
  },
  'bd.rit.voorstel.geen': {
    en: 'Nothing to drive today that saves money.',
    de: 'Heute gibt es nichts zu fahren, das Geld spart.',
    fr: 'Rien à conduire aujourd’hui qui fasse économiser de l’argent.',
    nl: 'Niets te rijden vandaag dat geld bespaart.'
  },
  'bd.rit.reden.ziek': { en: 'sick', de: 'krank', fr: 'malade', nl: 'ziek' },
  'bd.rit.reden.telaat': { en: 'late', de: 'verspätet', fr: 'en retard', nl: 'te laat' },
  'bd.rit.reden.afwezig': { en: 'absent', de: 'abwesend', fr: 'absent', nl: 'afwezig' },
  'bd.rit.reden.weg': { en: 'left', de: 'weg', fr: 'parti', nl: 'weg' },
  'bd.rit.reden.dubbel': { en: 'double-booked', de: 'doppelt eingeteilt', fr: 'affecté deux fois', nl: 'dubbel ingedeeld' },
  'bd.rit.reden.monteur': { en: 'mechanic', de: 'Mechaniker', fr: 'mécanicien', nl: 'monteur' },
  'bd.rit.reden.pech': { en: 'breakdown', de: 'Panne', fr: 'panne', nl: 'pech' },
  'bd.rit.wie.uitzend': { en: 'an agency driver', de: 'ein Leihfahrer', fr: 'un chauffeur intérimaire', nl: 'de uitzendkracht' },
  'bd.rit.wie.onderaannemer': { en: 'the subcontractor', de: 'der Subunternehmer', fr: 'le sous-traitant', nl: 'de onderaannemer' },
  'bd.rit.wie.liggen': { en: 'nobody (it drops)', de: 'niemand (fällt aus)', fr: 'personne (supprimé)', nl: 'niemand (valt uit)' },
  'bd.rit.wie.collega': { en: 'a colleague', de: 'ein Kollege', fr: 'un collègue', nl: 'een collega' },
  'bd.rit.banner.klaar': {
    en: 'Company duty ready: line {lijn}, block {omloop}, {van}–{tot} with {bus}.',
    de: 'Betriebsfahrt bereit: Linie {lijn}, Umlauf {omloop}, {van}–{tot} mit {bus}.',
    fr: 'Service d’entreprise prêt : ligne {lijn}, rotation {omloop}, {van}–{tot} avec {bus}.',
    nl: 'Bedrijfsrit klaar: lijn {lijn}, omloop {omloop}, {van}–{tot} met {bus}.'
  },
  'bd.rit.banner.verder': { en: 'On to the bus', de: 'Weiter zum Bus', fr: 'Vers le bus', nl: 'Verder naar de bus' },
  'bd.rit.banner.terug': { en: 'Hand back', de: 'Zurückgeben', fr: 'Rendre', nl: 'Teruggeven' },
  'bd.rit.banner.rijdt': {
    en: 'You are now driving block {omloop} for {bedrijf}.',
    de: 'Du fährst jetzt Umlauf {omloop} für {bedrijf}.',
    fr: 'Vous conduisez maintenant la rotation {omloop} pour {bedrijf}.',
    nl: 'Je rijdt nu omloop {omloop} voor {bedrijf}.'
  },
  'bd.rit.banner.naarRijscherm': { en: 'To the driving screen', de: 'Zum Fahrbildschirm', fr: 'Vers l’écran de conduite', nl: 'Naar het rijscherm' },
  'bd.rit.busEigen': { en: 'bus {nummer} ({naam})', de: 'Bus {nummer} ({naam})', fr: 'le bus {nummer} ({naam})', nl: 'bus {nummer} ({naam})' },
  'bd.rit.busOnder': { en: 'a bus from the subcontractor', de: 'einem Bus des Subunternehmers', fr: 'un bus du sous-traitant', nl: 'een bus van de onderaannemer' },
  'bd.rit.busNiet': {
    en: 'The bus of this block ({bus}) is not installed in OMSI.',
    de: 'Der Bus dieses Umlaufs ({bus}) ist in OMSI nicht installiert.',
    fr: 'Le bus de cette rotation ({bus}) n’est pas installé dans OMSI.',
    nl: 'De bus van deze omloop ({bus}) is niet geïnstalleerd in OMSI.'
  },
  'bd.rit.busVast': {
    en: 'This block runs with a bus of your own company; that one stays.',
    de: 'Dieser Umlauf fährt mit einem Bus deines Betriebs; der bleibt.',
    fr: 'Cette rotation roule avec un bus de votre entreprise ; il reste.',
    nl: 'Deze omloop rijdt met een bus van je eigen bedrijf; die blijft.'
  },
  'bd.rit.voorgesteld': { en: 'Drive with a suggested bus', de: 'Mit einem vorgeschlagenen Bus fahren', fr: 'Conduire avec un bus proposé', nl: 'Rijden met een voorgestelde bus' },
  'bd.rit.anderTeruggeven': { en: 'Hand back that duty and drive this one', de: 'Diesen Dienst zurückgeben und diesen fahren', fr: 'Rendre ce service et conduire celui-ci', nl: 'Die dienst teruggeven en deze rijden' },
  'bd.rit.naarDienst': { en: 'To your duty', de: 'Zu deinem Dienst', fr: 'Vers votre service', nl: 'Naar je dienst' },
  'bd.rit.chip': { en: 'Company duty · block {omloop} ({deel}/{delen})', de: 'Betriebsfahrt · Umlauf {omloop} ({deel}/{delen})', fr: 'Service d’entreprise · rotation {omloop} ({deel}/{delen})', nl: 'Bedrijfsrit · omloop {omloop} ({deel}/{delen})' },
  'bd.rit.telefoon': { en: 'Company duty · block {omloop} · until {tot}', de: 'Betriebsfahrt · Umlauf {omloop} · bis {tot}', fr: 'Service d’entreprise · rotation {omloop} · jusqu’à {tot}', nl: 'Bedrijfsrit · omloop {omloop} · tot {tot}' },
  'bd.rit.geboekt': {
    en: 'Duty {dienst} driven: {rituren} of {totaal} timetable hours count for your company.',
    de: 'Dienst {dienst} gefahren: {rituren} von {totaal} Fahrplanstunden zählen für deinen Betrieb.',
    fr: 'Service {dienst} effectué : {rituren} des {totaal} heures de service comptent pour votre entreprise.',
    nl: 'Dienst {dienst} gereden: {rituren} van {totaal} dienstregelingsuren telt voor je bedrijf.'
  },
  'bd.rit.hintDienst': {
    en: 'Driving for your own company? Pick your duty in My company → Planning; then it counts in your roster.',
    de: 'Fährst du für deinen eigenen Betrieb? Wähle deinen Dienst unter Mein Betrieb → Planung; dann zählt er in deinem Dienstplan.',
    fr: 'Vous conduisez pour votre propre entreprise ? Choisissez votre service dans Mon entreprise → Planning ; il comptera alors dans votre planning.',
    nl: 'Rijd je voor je eigen bedrijf? Kies je dienst in Mijn bedrijf → Planning; dan telt hij in je rooster.'
  },
  'bd.rit.naarBedrijf': { en: 'To My company', de: 'Zu Mein Betrieb', fr: 'Vers Mon entreprise', nl: 'Naar Mijn bedrijf' }
} as const satisfies Record<string, { en: string; de: string; fr: string; nl: string }>
