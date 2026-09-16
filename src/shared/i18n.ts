/**
 * De talen van de app en de teksten die erbij horen.
 *
 * Engels staat voorop: OMSI is een Duits spel met een internationale
 * gemeenschap, en wie de app voor het eerst opent heeft nog niets gekozen. De
 * volgorde daarna is Duits, Frans, Nederlands.
 *
 * Alle teksten staan per regel bij elkaar in plaats van per taal in een eigen
 * bestand. Zo zie je bij het toevoegen van een zin meteen welke taal nog
 * ontbreekt. Waar een waarde in de zin valt staat een naam tussen accolades.
 */

export const LANGUAGES = [
  { code: 'en', native: 'English' },
  { code: 'de', native: 'Deutsch' },
  { code: 'fr', native: 'Français' },
  { code: 'nl', native: 'Nederlands' }
] as const

export type Language = (typeof LANGUAGES)[number]['code']

export const DEFAULT_LANGUAGE: Language = 'en'

export function isLanguage(value: unknown): value is Language {
  return LANGUAGES.some((language) => language.code === value)
}

const TEXT = {
  // ---------- welkomsscherm ----------
  'welcome.title': {
    en: 'Welcome to OMSI Enhancer',
    de: 'Willkommen bei OMSI Enhancer',
    fr: 'Bienvenue dans OMSI Enhancer',
    nl: 'Welkom bij OMSI Enhancer'
  },
  'welcome.intro': {
    en: 'OMSI Enhancer turns the maps you already own into a job. Choose how long you want to drive and you get a real duty: the line, the tour, the IBIS codes to key in and the stop where your bus belongs.',
    de: 'OMSI Enhancer macht aus den Karten, die du schon hast, einen Dienst. Du wählst, wie lange du fahren möchtest, und bekommst einen echten Umlauf: Linie, Kurs, die IBIS-Eingaben und die Haltestelle, an der dein Bus stehen muss.',
    fr: 'OMSI Enhancer transforme les cartes que vous possédez déjà en service. Choisissez la durée de conduite et vous recevez un vrai roulement : la ligne, le tour, les codes IBIS à saisir et l’arrêt où placer votre bus.',
    nl: 'OMSI Enhancer maakt van de kaarten die je al hebt een dienst. Je kiest hoe lang je wilt rijden en krijgt een echte omloop: de lijn, het omloopnummer, de IBIS-codes die je moet intoetsen en de halte waar je bus hoort te staan.'
  },
  'welcome.language': { en: 'Language', de: 'Sprache', fr: 'Langue', nl: 'Taal' },
  'welcome.languageNote': {
    en: 'You can change this later in the sidebar.',
    de: 'Das lässt sich später in der Seitenleiste ändern.',
    fr: 'Vous pourrez le changer plus tard dans le panneau latéral.',
    nl: 'Dit kun je later in de zijbalk aanpassen.'
  },
  'welcome.accountTitle': {
    en: 'Your account',
    de: 'Dein Konto',
    fr: 'Votre compte',
    nl: 'Je account'
  },
  'welcome.accountIntro': {
    en: 'Your duties, kilometres and earnings are kept per driver. Everything stays on this computer — there is nothing to sign in to.',
    de: 'Deine Dienste, Kilometer und Einnahmen werden je Fahrer gespeichert. Alles bleibt auf diesem Rechner — es gibt nichts, wo du dich anmelden musst.',
    fr: 'Vos services, kilomètres et recettes sont enregistrés par conducteur. Tout reste sur cet ordinateur — il n’y a aucune connexion à créer.',
    nl: 'Je diensten, kilometers en verdiensten worden per chauffeur bewaard. Alles blijft op deze computer staan — er is nergens om in te loggen.'
  },
  'welcome.name': {
    en: 'Driver name',
    de: 'Name des Fahrers',
    fr: 'Nom du conducteur',
    nl: 'Naam van de chauffeur'
  },
  'welcome.create': {
    en: 'Create account',
    de: 'Konto anlegen',
    fr: 'Créer le compte',
    nl: 'Account aanmaken'
  },
  'welcome.creating': { en: 'Creating…', de: 'Wird angelegt…', fr: 'Création…', nl: 'Bezig…' },

  // ---------- chauffeur kiezen ----------
  'pick.title': {
    en: 'Who is driving?',
    de: 'Wer fährt?',
    fr: 'Qui conduit ?',
    nl: 'Wie rijdt er?'
  },
  'pick.intro': {
    en: 'Every driver keeps their own logbook, licences and running duty.',
    de: 'Jeder Fahrer hat sein eigenes Fahrtenbuch, seine Lizenzen und seinen laufenden Dienst.',
    fr: 'Chaque conducteur garde son carnet de bord, ses permis et son service en cours.',
    nl: 'Elke chauffeur heeft zijn eigen logboek, vergunningen en lopende dienst.'
  },
  'pick.continue': { en: 'Drive', de: 'Fahren', fr: 'Conduire', nl: 'Rijden' },
  'pick.new': { en: 'New driver', de: 'Neuer Fahrer', fr: 'Nouveau conducteur', nl: 'Nieuwe chauffeur' },
  'pick.create': { en: 'Create', de: 'Anlegen', fr: 'Créer', nl: 'Aanmaken' },
  'pick.cancel': { en: 'Cancel', de: 'Abbrechen', fr: 'Annuler', nl: 'Annuleren' },
  'pick.record': {
    en: '{count} duties, {duration} behind the wheel',
    de: '{count} Dienste, {duration} am Steuer',
    fr: '{count} services, {duration} au volant',
    nl: '{count} diensten, {duration} achter het stuur'
  },
  'pick.fresh': {
    en: 'No duties driven yet',
    de: 'Noch keine Dienste gefahren',
    fr: 'Aucun service effectué',
    nl: 'Nog geen diensten gereden'
  },
  'pick.onDuty': { en: 'Duty in progress', de: 'Dienst läuft', fr: 'Service en cours', nl: 'Dienst loopt' },
  'pick.remove': { en: 'Remove', de: 'Entfernen', fr: 'Supprimer', nl: 'Verwijderen' },
  'pick.removeAsk': {
    en: 'Remove {name}? The duties driven and the hours behind the wheel go with them.',
    de: '{name} entfernen? Die gefahrenen Dienste und die Stunden am Steuer gehen mit.',
    fr: 'Supprimer {name} ? Les services effectués et les heures au volant disparaissent aussi.',
    nl: '{name} verwijderen? De gereden diensten en de uren achter het stuur gaan mee.'
  },
  'pick.removeYes': { en: 'Remove', de: 'Entfernen', fr: 'Supprimer', nl: 'Verwijderen' },
  'pick.removeNo': { en: 'Keep', de: 'Behalten', fr: 'Garder', nl: 'Behouden' },

  // ---------- modus kiezen ----------
  'mode.title': {
    en: 'How do you want to drive, {driver}?',
    de: 'Wie möchtest du fahren, {driver}?',
    fr: 'Comment voulez-vous conduire, {driver} ?',
    nl: 'Hoe wil je rijden, {driver}?'
  },
  'mode.intro': {
    en: 'You can switch at any time. Your logbook keeps counting in every mode.',
    de: 'Du kannst jederzeit wechseln. Dein Fahrtenbuch zählt in jedem Modus weiter.',
    fr: 'Vous pouvez changer à tout moment. Votre carnet de bord continue dans tous les modes.',
    nl: 'Je kunt altijd wisselen. Je logboek telt in elke modus door.'
  },
  'mode.career': { en: 'Career', de: 'Karriere', fr: 'Carrière', nl: 'Carrière' },
  'mode.careerIntro': {
    en: 'The depot decides. First pass your driving test on a route you choose yourself; from then on you drive that line, and every extra line needs its own test.',
    de: 'Der Betriebshof entscheidet. Zuerst die Fahrprüfung auf einer Strecke deiner Wahl; danach fährst du diese Linie, und jede weitere Linie braucht ihre eigene Prüfung.',
    fr: 'Le dépôt décide. Passez d’abord l’examen sur un itinéraire de votre choix ; ensuite vous conduisez cette ligne, et chaque ligne supplémentaire exige son propre examen.',
    nl: 'De remise beslist. Eerst je rijexamen op een route die je zelf kiest; daarna rijd je die lijn, en elke extra lijn vraagt een eigen examen.'
  },
  'mode.service': { en: 'Service', de: 'Dienst', fr: 'Service', nl: 'Dienst' },
  'mode.serviceIntro': {
    en: 'Pick your own route and how long you want to drive. No licences, no rules; the app finds a real tour that fits.',
    de: 'Wähle Strecke und Dauer selbst. Keine Lizenzen, keine Regeln; die App sucht einen echten Umlauf dazu.',
    fr: 'Choisissez votre itinéraire et la durée. Aucun permis, aucune règle ; l’application trouve un vrai roulement.',
    nl: 'Kies zelf je route en hoe lang je wilt rijden. Geen vergunningen, geen regels; de app zoekt er een echte omloop bij.'
  },
  'mode.free': { en: 'Free play', de: 'Freies Fahren', fr: 'Jeu libre', nl: 'Vrij rijden' },
  'mode.freeIntro': {
    en: 'You choose the line, the bus, the place, the weather, the date and the time. The app only sets it up in OMSI and offers the overlay.',
    de: 'Du wählst Linie, Bus, Ort, Wetter, Datum und Uhrzeit. Die App richtet es nur in OMSI ein und bietet das Overlay an.',
    fr: 'Vous choisissez la ligne, le bus, le lieu, la météo, la date et l’heure. L’application ne fait que préparer OMSI et proposer la surimpression.',
    nl: 'Jij kiest de lijn, de bus, de plek, het weer, de datum en de tijd. De app zet het alleen klaar in OMSI en biedt de overlay aan.'
  },
  'mode.otherDriver': { en: 'Other driver', de: 'Anderer Fahrer', fr: 'Autre conducteur', nl: 'Andere chauffeur' },
  // ---------- opnieuw kijken wat er geïnstalleerd is ----------
  'check.button': {
    en: 'Check installed folders',
    de: 'Installierte Ordner prüfen',
    fr: 'Vérifier les dossiers installés',
    nl: 'Controleer geïnstalleerde mappen'
  },
  'check.busy': { en: 'Looking…', de: 'Schaue nach…', fr: 'Recherche…', nl: 'Even kijken…' },
  'check.first': {
    en: 'Found {maps} maps and {buses} bus folders. From now on this button reports what is new.',
    de: '{maps} Karten und {buses} Busordner gefunden. Ab jetzt meldet diese Schaltfläche, was neu ist.',
    nl: '{maps} kaarten en {buses} busmappen gevonden. Vanaf nu meldt deze knop wat erbij komt.',
    fr: '{maps} cartes et {buses} dossiers de bus trouvés. Désormais ce bouton signale les nouveautés.'
  },
  'check.nothing': {
    en: 'Nothing new: {maps} maps, {buses} bus folders.',
    de: 'Nichts Neues: {maps} Karten, {buses} Busordner.',
    fr: 'Rien de neuf : {maps} cartes, {buses} dossiers de bus.',
    nl: 'Niets nieuws: {maps} kaarten, {buses} busmappen.'
  },
  'check.newMaps': {
    en: 'New map: {items}.',
    de: 'Neue Karte: {items}.',
    fr: 'Nouvelle carte : {items}.',
    nl: 'Nieuwe kaart: {items}.'
  },
  'check.newBuses': {
    en: 'New buses: {items}.',
    de: 'Neue Busse: {items}.',
    fr: 'Nouveaux bus : {items}.',
    nl: 'Nieuwe bussen: {items}.'
  },
  'check.gone': {
    en: 'Gone: {items}.',
    de: 'Verschwunden: {items}.',
    fr: 'Disparu : {items}.',
    nl: 'Verdwenen: {items}.'
  },

  'mode.otherMode': { en: 'Other mode', de: 'Anderer Modus', fr: 'Autre mode', nl: 'Andere modus' },
  'mode.running': {
    en: 'A duty is waiting for you here',
    de: 'Hier wartet ein Dienst auf dich',
    fr: 'Un service vous attend ici',
    nl: 'Hier wacht een dienst op je'
  },
  'mode.licences': {
    en: '{count} lines licensed',
    de: '{count} Linien freigegeben',
    fr: '{count} lignes autorisées',
    nl: '{count} lijnen vrijgegeven'
  },
  'mode.noLicence': {
    en: 'Driving test not passed yet',
    de: 'Fahrprüfung noch offen',
    fr: 'Examen pas encore passé',
    nl: 'Rijexamen nog niet gehaald'
  },

  // ---------- examen en vergunningen ----------
  'exam.title': { en: 'Driving test', de: 'Fahrprüfung', fr: 'Examen de conduite', nl: 'Rijexamen' },
  'exam.lineTitle': { en: 'Line test', de: 'Linienprüfung', fr: 'Examen de ligne', nl: 'Lijnexamen' },
  'exam.intro': {
    en: 'Choose the route you want to be tested on. One trip, from the first stop to the terminus. Pass it and that line is yours to drive.',
    de: 'Wähle die Strecke für deine Prüfung. Eine Fahrt, von der ersten Haltestelle bis zur Endstation. Bestehst du, fährst du diese Linie.',
    fr: 'Choisissez l’itinéraire de votre examen. Un trajet, du premier arrêt au terminus. Réussissez et cette ligne est à vous.',
    nl: 'Kies de route waarop je examen doet. Eén rit, van de eerste halte tot het eindpunt. Haal je hem, dan mag je die lijn rijden.'
  },
  'exam.lineIntro': {
    en: 'Every line needs its own test before you may drive it in career mode.',
    de: 'Jede Linie braucht ihre eigene Prüfung, bevor du sie im Karrieremodus fahren darfst.',
    fr: 'Chaque ligne exige son propre examen avant de pouvoir la conduire en mode carrière.',
    nl: 'Elke lijn vraagt een eigen examen voordat je hem in de carrièremodus mag rijden.'
  },
  'exam.route': { en: 'Test route', de: 'Prüfungsstrecke', fr: 'Itinéraire d’examen', nl: 'Examenroute' },
  'exam.start': { en: 'Take the test', de: 'Prüfung ablegen', fr: 'Passer l’examen', nl: 'Examen afleggen' },
  'exam.searching': { en: 'Finding a trip…', de: 'Fahrt wird gesucht…', fr: 'Recherche d’un trajet…', nl: 'Rit zoeken…' },
  'exam.none': {
    en: 'No suitable trip on this line during the day.',
    de: 'Auf dieser Linie fährt tagsüber keine passende Fahrt.',
    fr: 'Aucun trajet adapté sur cette ligne en journée.',
    nl: 'Op deze lijn rijdt overdag geen geschikte rit.'
  },
  'exam.rules': { en: 'What you are judged on', de: 'Worauf geachtet wird', fr: 'Ce qui est évalué', nl: 'Waar je op beoordeeld wordt' },
  'exam.rule.finish': {
    en: 'Drive the whole trip to the terminus',
    de: 'Die ganze Fahrt bis zur Endstation fahren',
    fr: 'Conduire tout le trajet jusqu’au terminus',
    nl: 'De hele rit tot het eindpunt rijden'
  },
  'exam.rule.punctual': {
    en: 'Finish within {limit} minutes of the timetable',
    de: 'Höchstens {limit} Minuten vom Fahrplan abweichen',
    fr: 'Terminer à moins de {limit} minutes de l’horaire',
    nl: 'Hooguit {limit} minuten afwijken van de dienstregeling'
  },
  'exam.rule.smooth': {
    en: 'At most {limit} harsh stops or take-offs',
    de: 'Höchstens {limit} mal hart bremsen oder anfahren',
    fr: 'Au plus {limit} freinages ou démarrages brusques',
    nl: 'Hooguit {limit} keer hard remmen of optrekken'
  },
  'exam.rule.speed': {
    en: 'Never faster than {limit} km/h',
    de: 'Nie schneller als {limit} km/h',
    fr: 'Jamais plus vite que {limit} km/h',
    nl: 'Nooit harder dan {limit} km/u'
  },
  'exam.passed': { en: 'Passed', de: 'Bestanden', fr: 'Réussi', nl: 'Geslaagd' },
  'exam.failed': { en: 'Not passed', de: 'Nicht bestanden', fr: 'Échoué', nl: 'Niet gehaald' },
  'exam.score': { en: 'Score {score} out of 100', de: 'Note {score} von 100', fr: 'Note {score} sur 100', nl: 'Cijfer {score} van de 100' },
  'exam.finish': { en: 'Hand in the test', de: 'Prüfung abgeben', fr: 'Rendre l’examen', nl: 'Examen inleveren' },
  'exam.granted': {
    en: 'Licence granted for {line}. You may drive this line from now on.',
    de: 'Lizenz für {line} erteilt. Ab jetzt darfst du diese Linie fahren.',
    fr: 'Permis accordé pour {line}. Vous pouvez désormais conduire cette ligne.',
    nl: 'Vergunning voor {line} verleend. Vanaf nu mag je deze lijn rijden.'
  },
  'exam.again': {
    en: 'Not this time. You can take the test again whenever you like.',
    de: 'Diesmal nicht. Du kannst die Prüfung jederzeit wiederholen.',
    fr: 'Pas cette fois. Vous pouvez repasser l’examen quand vous voulez.',
    nl: 'Deze keer niet. Je mag het examen zo vaak overdoen als je wilt.'
  },
  'lic.title': { en: 'Your licences', de: 'Deine Lizenzen', fr: 'Vos permis', nl: 'Je vergunningen' },
  'lic.none': {
    en: 'No licences yet. Start with your driving test.',
    de: 'Noch keine Lizenzen. Fang mit der Fahrprüfung an.',
    fr: 'Aucun permis. Commencez par l’examen de conduite.',
    nl: 'Nog geen vergunningen. Begin met je rijexamen.'
  },
  'lic.noneHere': {
    en: 'No licence on this map yet. Pick another map, or take a test on a line here.',
    de: 'Auf dieser Karte noch keine Lizenz. Wähle eine andere Karte oder lege hier eine Prüfung ab.',
    fr: 'Aucun permis sur cette carte. Choisissez une autre carte ou passez un examen ici.',
    nl: 'Op deze kaart nog geen vergunning. Kies een andere kaart, of doe hier examen op een lijn.'
  },
  'lic.earned': { en: 'since {date}', de: 'seit {date}', fr: 'depuis le {date}', nl: 'sinds {date}' },
  'lic.another': { en: 'Learn another line', de: 'Weitere Linie lernen', fr: 'Apprendre une autre ligne', nl: 'Nieuwe lijn leren' },
  'lic.onlyThese': {
    en: 'In career mode the depot picks your duty from the lines you are licensed for.',
    de: 'Im Karrieremodus wählt der Betriebshof deinen Dienst aus den Linien, für die du eine Lizenz hast.',
    fr: 'En mode carrière, le dépôt choisit votre service parmi les lignes autorisées.',
    nl: 'In de carrièremodus kiest de remise je dienst uit de lijnen waar je een vergunning voor hebt.'
  },
  'lic.assign': { en: 'Give me a duty', de: 'Dienst zuteilen', fr: 'Attribuez-moi un service', nl: 'Wijs me een dienst toe' },

  // ---------- route kiezen ----------
  'line.pick': { en: 'Route', de: 'Strecke', fr: 'Itinéraire', nl: 'Route' },
  'line.any': { en: 'Any line on this map', de: 'Beliebige Linie dieser Karte', fr: 'N’importe quelle ligne', nl: 'Elke lijn van deze kaart' },
  'line.meta': {
    en: '{tours} tours, {trips} trips, around {minutes} min each',
    de: '{tours} Umläufe, {trips} Fahrten, je rund {minutes} Min.',
    fr: '{tours} roulements, {trips} trajets, environ {minutes} min',
    nl: '{tours} omlopen, {trips} ritten, elk ongeveer {minutes} min'
  },

  // ---------- vrij rijden ----------
  'free.title': { en: 'Set up your own drive', de: 'Eigene Fahrt einrichten', fr: 'Préparez votre trajet', nl: 'Zet je eigen rit klaar' },
  'free.intro': {
    en: 'Nothing is logged and nothing is judged. The app writes the situation, starts OMSI and puts the overlay on top.',
    de: 'Nichts wird gebucht und nichts bewertet. Die App schreibt die Situation, startet OMSI und legt das Overlay darüber.',
    fr: 'Rien n’est enregistré ni évalué. L’application écrit la situation, lance OMSI et pose la surimpression.',
    nl: 'Er wordt niets geboekt en niets beoordeeld. De app schrijft de situatie, start OMSI en legt de overlay erboven.'
  },
  'free.noLine': {
    en: 'Without a line you simply drive around; the overlay then has no route to show.',
    de: 'Ohne Linie fährst du einfach herum; das Overlay hat dann keine Strecke zu zeigen.',
    fr: 'Sans ligne, vous roulez librement ; la surimpression n’a alors aucun itinéraire à afficher.',
    nl: 'Zonder lijn rijd je gewoon rond; de overlay heeft dan geen route om te tonen.'
  },
  'free.stop': { en: 'Where the bus starts', de: 'Wo der Bus steht', fr: 'Où démarre le bus', nl: 'Waar de bus begint' },
  'free.stopAuto': { en: 'At the first stop of the line', de: 'An der ersten Haltestelle der Linie', fr: 'Au premier arrêt de la ligne', nl: 'Bij de eerste halte van de lijn' },
  'free.date': { en: 'Date', de: 'Datum', fr: 'Date', nl: 'Datum' },
  'free.time': { en: 'Time', de: 'Uhrzeit', fr: 'Heure', nl: 'Tijd' },
  'free.weather': { en: 'Weather', de: 'Wetter', fr: 'Météo', nl: 'Weer' },
  'free.start': { en: 'Set up and start OMSI', de: 'Einrichten und OMSI starten', fr: 'Préparer et lancer OMSI', nl: 'Klaarzetten en OMSI starten' },
  'free.starting': { en: 'Setting up…', de: 'Wird eingerichtet…', fr: 'Préparation…', nl: 'Bezig met klaarzetten…' },
  'free.ready': {
    en: 'Ready. OMSI opens on {map}; press Start there.',
    de: 'Fertig. OMSI öffnet auf {map}; drücke dort auf Start.',
    fr: 'Prêt. OMSI s’ouvre sur {map} ; appuyez sur Start.',
    nl: 'Klaar. OMSI opent op {map}; druk daar op Start.'
  },
  'weather.clear': { en: 'Clear', de: 'Klar', fr: 'Dégagé', nl: 'Helder' },
  'weather.summer': { en: 'Summer day', de: 'Sommertag', fr: 'Journée d’été', nl: 'Zomerdag' },
  'weather.cloudy': { en: 'Overcast', de: 'Bewölkt', fr: 'Couvert', nl: 'Bewolkt' },
  'weather.rain': { en: 'Rain', de: 'Regen', fr: 'Pluie', nl: 'Regen' },
  'weather.fog': { en: 'Fog', de: 'Nebel', fr: 'Brouillard', nl: 'Mist' },

  // ---------- starten in OMSI ----------
  'start.preparing': {
    en: 'Writing the situation…',
    de: 'Situation wird geschrieben…',
    fr: 'Écriture de la situation…',
    nl: 'Situatie wordt geschreven…'
  },
  'start.ready': {
    en: 'OMSI opens on {map} with this duty ready. Just press Start.',
    de: 'OMSI öffnet auf {map} mit diesem Dienst. Einfach auf Start drücken.',
    fr: 'OMSI s’ouvre sur {map} avec ce service prêt. Appuyez simplement sur Start.',
    nl: 'OMSI opent op {map} met deze dienst klaar. Je hoeft alleen op Start te drukken.'
  },
  'start.timetableSet': {
    en: 'Line and tour are already selected in the timetable menu.',
    de: 'Linie und Umlauf sind im Fahrplanmenü bereits gewählt.',
    fr: 'La ligne et le roulement sont déjà sélectionnés dans le menu horaires.',
    nl: 'De lijn en de omloop staan al gekozen in het dienstregelingsmenu.'
  },
  'start.alreadyRunning': {
    en: 'OMSI was already running, so it has not seen this yet. Restart the game, or load the situation OMSI Enhancer yourself.',
    de: 'OMSI lief bereits und kennt das noch nicht. Starte das Spiel neu oder lade die Situation OMSI Enhancer selbst.',
    fr: 'OMSI tournait déjà et ne l’a pas encore vu. Relancez le jeu ou chargez vous-même la situation OMSI Enhancer.',
    nl: 'OMSI draaide al en heeft dit nog niet gezien. Start het spel opnieuw, of laad de situatie OMSI Enhancer zelf.'
  },
  'start.failed': {
    en: 'Could not set it up: {reason}',
    de: 'Einrichten nicht möglich: {reason}',
    fr: 'Préparation impossible : {reason}',
    nl: 'Klaarzetten lukte niet: {reason}'
  },

  // ---------- instellingen van OMSI ----------
  'cfg.title': {
    en: 'OMSI settings',
    de: 'OMSI-Einstellungen',
    fr: 'Réglages d’OMSI',
    nl: 'Instellingen van OMSI'
  },
  'cfg.intro': {
    en: 'These are the settings of the game itself, in options.cfg. Everything this app does not show stays exactly as it was.',
    de: 'Das sind die Einstellungen des Spiels selbst, in options.cfg. Alles, was diese App nicht zeigt, bleibt genau so stehen.',
    fr: 'Ce sont les réglages du jeu lui-même, dans options.cfg. Tout ce que cette application n’affiche pas reste inchangé.',
    nl: 'Dit zijn de instellingen van het spel zelf, in options.cfg. Alles wat deze app niet toont, blijft precies zoals het stond.'
  },
  'cfg.tabSettings': { en: 'Settings', de: 'Einstellungen', fr: 'Réglages', nl: 'Instellingen' },
  'cfg.tabKeys': { en: 'Keys', de: 'Tasten', fr: 'Touches', nl: 'Toetsen' },
  'cfg.group.graphics': { en: 'Picture', de: 'Bild', fr: 'Image', nl: 'Beeld' },
  'cfg.group.sound': { en: 'Sound', de: 'Ton', fr: 'Son', nl: 'Geluid' },
  'cfg.group.game': { en: 'Game', de: 'Spiel', fr: 'Jeu', nl: 'Spel' },
  'cfg.group.traffic': { en: 'Traffic', de: 'Verkehr', fr: 'Circulation', nl: 'Verkeer' },
  'cfg.preset': {
    en: 'Start from:',
    de: 'Ausgangspunkt:',
    fr: 'Point de départ :',
    nl: 'Beginnen bij:'
  },
  'cfg.preset.low': { en: 'Smooth', de: 'Flüssig', fr: 'Fluide', nl: 'Vlot' },
  'cfg.preset.medium': { en: 'Balanced', de: 'Ausgewogen', fr: 'Équilibré', nl: 'Gemiddeld' },
  'cfg.preset.high': { en: 'Pretty', de: 'Schön', fr: 'Beau', nl: 'Mooi' },
  'cfg.running': {
    en: 'OMSI is running. It writes these files again when it closes, so change them with the game shut down.',
    de: 'OMSI läuft. Das Spiel schreibt diese Dateien beim Beenden neu -- ändere sie also bei geschlossenem Spiel.',
    fr: 'OMSI est en cours. Le jeu réécrit ces fichiers en quittant : modifiez-les jeu fermé.',
    nl: 'OMSI draait. Het spel schrijft deze bestanden bij het afsluiten opnieuw, dus pas ze aan met het spel dicht.'
  },
  'cfg.save': { en: 'Save', de: 'Speichern', fr: 'Enregistrer', nl: 'Opslaan' },
  'cfg.saving': { en: 'Saving…', de: 'Wird gespeichert…', fr: 'Enregistrement…', nl: 'Opslaan…' },
  'cfg.saved': { en: 'Saved to options.cfg.', de: 'In options.cfg gespeichert.', fr: 'Enregistré dans options.cfg.', nl: 'Opgeslagen in options.cfg.' },
  'cfg.revert': { en: 'Undo changes', de: 'Änderungen verwerfen', fr: 'Annuler les changements', nl: 'Wijzigingen ongedaan maken' },
  'cfg.changed': {
    en: '{count} changed',
    de: '{count} geändert',
    fr: '{count} modifiés',
    nl: '{count} gewijzigd'
  },
  'cfg.back': { en: 'Back', de: 'Zurück', fr: 'Retour', nl: 'Terug' },
  'cfg.failed': {
    en: 'Could not read the OMSI files: {reason}',
    de: 'Die OMSI-Dateien konnten nicht gelesen werden: {reason}',
    fr: 'Impossible de lire les fichiers OMSI : {reason}',
    nl: 'De bestanden van OMSI konden niet gelezen worden: {reason}'
  },
  'cfg.on': { en: 'On', de: 'An', fr: 'Activé', nl: 'Aan' },
  'cfg.off': { en: 'Off', de: 'Aus', fr: 'Désactivé', nl: 'Uit' },

  // ---------- de instellingen zelf ----------
  'set.maxFPS': { en: 'Frame rate limit', de: 'Bildrate begrenzen', fr: 'Limite d’images par seconde', nl: 'Maximale beeldsnelheid' },
  'set.maxFPS.hint': {
    en: 'Keep it just under what your screen can show; OMSI runs most evenly that way.',
    de: 'Knapp unter dem, was dein Bildschirm zeigen kann -- so läuft OMSI am gleichmäßigsten.',
    fr: 'Restez juste sous ce que votre écran peut afficher : OMSI tourne alors le plus régulièrement.',
    nl: 'Houd hem net onder wat je scherm aankan; zo loopt OMSI het gelijkmatigst.'
  },
  'set.performance_maxObjDist': { en: 'Object view distance (m)', de: 'Sichtweite Objekte (m)', fr: 'Distance d’affichage (m)', nl: 'Zichtafstand objecten (m)' },
  'set.performance_maxObjDist.hint': {
    en: 'How far buildings and trees stay visible. The biggest single lever on frame rate.',
    de: 'Wie weit Gebäude und Bäume sichtbar bleiben. Der größte Hebel für die Bildrate.',
    fr: 'Jusqu’où bâtiments et arbres restent visibles. Le plus gros levier sur la fluidité.',
    nl: 'Hoe ver gebouwen en bomen zichtbaar blijven. De grootste knop voor je beeldsnelheid.'
  },
  'set.performance_tiledistmax': { en: 'Visible tiles', de: 'Sichtbare Kacheln', fr: 'Tuiles visibles', nl: 'Zichtbare tegels' },
  'set.performance_tiledistmax.hint': {
    en: 'How many 300 m squares are drawn ahead of you. Each step costs a lot.',
    de: 'Wie viele 300-m-Kacheln vor dir gezeichnet werden. Jede Stufe kostet spürbar.',
    fr: 'Combien de carrés de 300 m sont dessinés devant vous. Chaque cran coûte cher.',
    nl: 'Hoeveel vakken van 300 meter er voor je uit getekend worden. Elke stap kost fors.'
  },
  'set.maxcomplexity': { en: 'Level of detail', de: 'Detailgrad', fr: 'Niveau de détail', nl: 'Detailniveau' },
  'set.maxcomplexity.hint': {
    en: 'How much detail objects are allowed to have.',
    de: 'Wie viel Detail Objekte haben dürfen.',
    fr: 'Le niveau de détail autorisé pour les objets.',
    nl: 'Hoeveel detail objecten mogen hebben.'
  },
  'set.maxcomplexity_map': { en: 'Level of detail, map', de: 'Detailgrad Karte', fr: 'Niveau de détail, carte', nl: 'Detailniveau kaart' },
  'set.texFilter.1': { en: 'Anisotropic filtering', de: 'Anisotrope Filterung', fr: 'Filtrage anisotrope', nl: 'Anisotropisch filteren' },
  'set.texFilter.1.hint': {
    en: 'Sharpness of surfaces seen at an angle -- the road ahead. Cheap, and it shows.',
    de: 'Schärfe schräg gesehener Flächen -- der Straße vor dir. Kostet wenig, bringt viel.',
    fr: 'Netteté des surfaces vues de biais, comme la route. Peu coûteux, très visible.',
    nl: 'Scherpte van vlakken die je schuin ziet, zoals de weg voor je. Kost weinig, levert veel.'
  },
  'set.texmemlimit': { en: 'Texture memory (MB)', de: 'Texturspeicher (MB)', fr: 'Mémoire de textures (Mo)', nl: 'Geheugen voor texturen (MB)' },
  'set.texmemlimit.hint': {
    en: 'Do not set this above what your graphics card actually has.',
    de: 'Nicht höher setzen, als deine Grafikkarte wirklich hat.',
    fr: 'Ne dépassez pas ce que votre carte graphique possède réellement.',
    nl: 'Zet dit niet hoger dan wat je videokaart werkelijk heeft.'
  },
  'set.performance_reflTexSize': { en: 'Mirror quality', de: 'Spiegelqualität', fr: 'Qualité des miroirs', nl: 'Kwaliteit van de spiegels' },
  'set.performance_reflTexSize.hint': {
    en: 'Size of the mirror image. Sharper mirrors cost frames.',
    de: 'Größe des Spiegelbilds. Schärfere Spiegel kosten Bildrate.',
    fr: 'Taille de l’image des miroirs. Plus net coûte des images par seconde.',
    nl: 'Grootte van het spiegelbeeld. Scherpere spiegels kosten beeldsnelheid.'
  },
  'set.shadow_stencil': { en: 'Hard shadows', de: 'Harte Schatten', fr: 'Ombres dures', nl: 'Harde schaduwen' },
  'set.sunglow': { en: 'Sun glare', de: 'Sonnenschein-Effekt', fr: 'Éblouissement du soleil', nl: 'Zonnegloed' },
  'set.no_humans_on_rain_refl': { en: 'No people in wet reflections', de: 'Keine Menschen in nassen Spiegelungen', fr: 'Pas de piétons dans les reflets', nl: 'Geen mensen in natte weerspiegeling' },
  'set.smokesystems': { en: 'Exhaust smoke', de: 'Abgasrauch', fr: 'Fumée d’échappement', nl: 'Uitlaatrook' },
  'set.texture_uselow': { en: 'Low-resolution textures', de: 'Texturen in niedriger Auflösung', fr: 'Textures en basse résolution', nl: 'Texturen op lage resolutie' },
  'set.texture_uselow.hint': {
    en: 'For weaker cards: everything loads smaller and faster, and looks blurrier.',
    de: 'Für schwächere Karten: alles lädt kleiner und schneller, sieht aber matschiger aus.',
    fr: 'Pour les cartes modestes : tout charge plus petit et plus vite, mais plus flou.',
    nl: 'Voor zwakkere videokaarten: alles laadt kleiner en sneller, en ziet er vager uit.'
  },
  'set.sound_vol_master': { en: 'Master volume', de: 'Gesamtlautstärke', fr: 'Volume général', nl: 'Hoofdvolume' },
  'set.sound_maxcount': { en: 'Maximum sounds at once', de: 'Maximale Anzahl Klänge', fr: 'Sons simultanés maximum', nl: 'Maximaal aantal geluiden tegelijk' },
  'set.sound_maxcount.hint': {
    en: 'More at once sounds fuller and costs processor time.',
    de: 'Mehr gleichzeitig klingt voller und kostet Rechenzeit.',
    fr: 'Plus de sons ensemble donne un rendu plus riche et coûte du processeur.',
    nl: 'Meer tegelijk klinkt voller en kost rekentijd.'
  },
  'set.sound_stereo': { en: 'Stereo width', de: 'Stereobreite', fr: 'Largeur stéréo', nl: 'Stereobreedte' },
  'set.sound_doppler': { en: 'Doppler effect', de: 'Doppler-Effekt', fr: 'Effet Doppler', nl: 'Dopplereffect' },
  'set.sound_scenery': { en: 'Ambient sound', de: 'Umgebungsgeräusche', fr: 'Ambiance sonore', nl: 'Omgevingsgeluid' },
  'set.language': { en: 'Language of OMSI', de: 'Sprache von OMSI', fr: 'Langue d’OMSI', nl: 'Taal van OMSI' },
  'set.language.hint': {
    en: 'The language of the game itself. This app keeps its own.',
    de: 'Die Sprache des Spiels selbst. Diese App behält ihre eigene.',
    fr: 'La langue du jeu lui-même. Cette application garde la sienne.',
    nl: 'De taal van het spel zelf. De app houdt zijn eigen taal.'
  },
  'set.ticketselling': { en: 'Ticket selling', de: 'Fahrkartenverkauf', fr: 'Vente de billets', nl: 'Kaartverkoop' },
  'set.ticketselling.hint': {
    en: 'Passengers buy a ticket from you. Without it they simply walk on.',
    de: 'Fahrgäste kaufen bei dir einen Fahrschein. Ohne das steigen sie einfach ein.',
    fr: 'Les passagers vous achètent un billet. Sinon ils montent directement.',
    nl: 'Passagiers kopen een kaartje bij je. Zonder dit lopen ze gewoon door.'
  },
  'set.see_own_driver': { en: 'See your own driver', de: 'Eigenen Fahrer sehen', fr: 'Voir son propre conducteur', nl: 'Je eigen chauffeur zien' },
  'set.driverview_smooth': { en: 'Smooth head movement', de: 'Weiche Kopfbewegung', fr: 'Mouvement de tête fluide', nl: 'Vloeiende hoofdbeweging' },
  'set.noAutoSave': { en: 'Do not save on exit', de: 'Beim Beenden nicht speichern', fr: 'Ne pas enregistrer en quittant', nl: 'Niet opslaan bij afsluiten' },
  'set.noAutoSave.hint': {
    en: 'OMSI normally keeps your situation when you close it. That is also what this app uses to set your duty up, so leave it off.',
    de: 'OMSI behält beim Beenden normalerweise deine Situation. Genau die nutzt diese App fürs Vorbereiten -- also besser aus lassen.',
    fr: 'OMSI conserve normalement votre situation en quittant. C’est ce que cette application utilise pour préparer votre service : laissez-le désactivé.',
    nl: 'OMSI bewaart bij afsluiten normaal je situatie. Die gebruikt deze app om je dienst klaar te zetten, dus laat dit uit staan.'
  },
  'set.no_collision': { en: 'Collisions off', de: 'Kollisionen aus', fr: 'Collisions désactivées', nl: 'Botsingen uit' },
  'set.no_collision.hint': {
    en: 'You drive through everything. Handy for practising a route, not for a test.',
    de: 'Du fährst durch alles hindurch. Gut zum Üben einer Strecke, nicht für eine Prüfung.',
    fr: 'Vous traversez tout. Pratique pour répéter un itinéraire, pas pour un examen.',
    nl: 'Je rijdt overal doorheen. Handig om een route te oefenen, niet om examen te doen.'
  },
  'set.no_collision_terrain': { en: 'No collision with terrain', de: 'Keine Kollision mit dem Gelände', fr: 'Pas de collision avec le terrain', nl: 'Geen botsing met het landschap' },
  'set.no_collision_vehToVeh': { en: 'No collision between vehicles', de: 'Keine Kollision zwischen Fahrzeugen', fr: 'Pas de collision entre véhicules', nl: 'Geen botsing tussen voertuigen' },
  'set.no_collision_pedastrians': { en: 'No collision with pedestrians', de: 'Keine Kollision mit Fußgängern', fr: 'Pas de collision avec les piétons', nl: 'Geen botsing met voetgangers' },
  'set.AIMaxCountRandom': { en: 'Traffic on the road', de: 'Verkehr auf der Straße', fr: 'Circulation sur la route', nl: 'Verkeer op straat' },
  'set.AIMaxCountRandom.hint': {
    en: 'How many cars drive around on their own.',
    de: 'Wie viele Autos eigenständig herumfahren.',
    fr: 'Combien de voitures circulent librement.',
    nl: 'Hoeveel auto’s er uit zichzelf rondrijden.'
  },
  'set.AIMaxCountParked': { en: 'Parked cars', de: 'Geparkte Autos', fr: 'Voitures stationnées', nl: 'Geparkeerde auto’s' },
  'set.AIMaxCountScheduled': { en: 'Buses on the timetable', de: 'Busse nach Fahrplan', fr: 'Bus à l’horaire', nl: 'Bussen op de dienstregeling' },
  'set.AIMaxCountScheduled.hint': {
    en: 'AI buses running to the timetable. These are the ones you meet on your own line.',
    de: 'KI-Busse, die nach Fahrplan fahren. Die begegnen dir auf deiner eigenen Linie.',
    fr: 'Les bus IA qui suivent l’horaire. Ce sont ceux que vous croisez sur votre ligne.',
    nl: 'AI-bussen die volgens de dienstregeling rijden. Die kom je op je eigen lijn tegen.'
  },
  'set.AIUnschedFactor': { en: 'Traffic density', de: 'Verkehrsdichte', fr: 'Densité du trafic', nl: 'Drukte van het verkeer' },
  'set.AIUnschedFactor.hint': {
    en: 'A percentage: higher means busier streets.',
    de: 'Ein Prozentwert: höher heißt vollere Straßen.',
    fr: 'Un pourcentage : plus haut, rues plus chargées.',
    nl: 'Een percentage: hoger is drukkere straten.'
  },
  'set.AIPassFactor': { en: 'Number of passengers', de: 'Anzahl Fahrgäste', fr: 'Nombre de passagers', nl: 'Aantal passagiers' },
  'set.AIPassFactor.hint': {
    en: 'A percentage of the normal crowd at the stops.',
    de: 'Ein Prozentwert der üblichen Menge an den Haltestellen.',
    fr: 'Un pourcentage de l’affluence habituelle aux arrêts.',
    nl: 'Een percentage van de gewone drukte bij de haltes.'
  },
  'set.AIPriorityScheduled': { en: 'Priority for scheduled buses', de: 'Vorrang für Linienbusse', fr: 'Priorité aux bus de ligne', nl: 'Voorrang voor lijnbussen' },

  // ---------- toetsen ----------
  'keys.intro': {
    en: 'Click a key combination and press the keys you want. Shift and Ctrl are picked up with it.',
    de: 'Klicke auf eine Tastenkombination und drücke die gewünschten Tasten. Shift und Strg werden mit übernommen.',
    fr: 'Cliquez sur une combinaison et appuyez sur les touches voulues. Maj et Ctrl sont pris en compte.',
    nl: 'Klik op een toetscombinatie en druk de toetsen in die je wilt. Shift en Ctrl gaan mee.'
  },
  'keys.search': { en: 'Search', de: 'Suchen', fr: 'Rechercher', nl: 'Zoeken' },
  'keys.press': { en: 'press a key…', de: 'Taste drücken…', fr: 'appuyez sur une touche…', nl: 'druk een toets…' },
  'keys.escape': {
    en: 'Esc cancels, Backspace clears the binding.',
    de: 'Esc bricht ab, Rücktaste löscht die Belegung.',
    fr: 'Échap annule, Retour arrière efface l’affectation.',
    nl: 'Esc annuleert, Backspace wist de toewijzing.'
  },
  'keys.none': { en: 'not set', de: 'nicht belegt', fr: 'non attribué', nl: 'niet ingesteld' },
  'keys.noMatch': {
    en: 'Nothing found for “{text}”. The names come from OMSI itself, so they are in the language the game is set to.',
    de: 'Nichts gefunden für „{text}“. Die Namen kommen aus OMSI selbst, also in der Sprache, auf die das Spiel steht.',
    fr: 'Rien pour « {text} ». Les noms viennent d’OMSI, donc dans la langue du jeu.',
    nl: 'Niets gevonden voor “{text}”. De namen komen uit OMSI zelf, dus in de taal waarop het spel staat.'
  },
  'keys.section.game': { en: 'Game', de: 'Spiel', fr: 'Jeu', nl: 'Spel' },
  'keys.section.vehicles': { en: 'Vehicle', de: 'Fahrzeug', fr: 'Véhicule', nl: 'Voertuig' },
  'keys.reset': { en: 'Restore OMSI defaults', de: 'OMSI-Standard wiederherstellen', fr: 'Rétablir les valeurs d’OMSI', nl: 'Standaard van OMSI herstellen' },
  'keys.resetAsk': {
    en: 'Put every key back the way OMSI ships it?',
    de: 'Alle Tasten auf den Auslieferungszustand von OMSI zurücksetzen?',
    fr: 'Rétablir toutes les touches telles qu’OMSI les livre ?',
    nl: 'Alle toetsen terugzetten zoals OMSI ze levert?'
  },
  'keys.saved': { en: 'Saved to keyboard.cfg.', de: 'In keyboard.cfg gespeichert.', fr: 'Enregistré dans keyboard.cfg.', nl: 'Opgeslagen in keyboard.cfg.' },
  'keys.taken': {
    en: 'Also used by: {action}',
    de: 'Auch belegt mit: {action}',
    fr: 'Déjà utilisé par : {action}',
    nl: 'Ook in gebruik bij: {action}'
  },
  'keys.unknown': {
    en: 'This key is not one OMSI knows.',
    de: 'Diese Taste kennt OMSI nicht.',
    fr: 'OMSI ne connaît pas cette touche.',
    nl: 'Deze toets kent OMSI niet.'
  },

  // ---------- gamecontrollers ----------
  'cfg.tabControllers': { en: 'Controllers', de: 'Controller', fr: 'Contrôleurs', nl: 'Controllers' },
  'ctrl.intro': {
    en: 'Wheel, pedals, shifter, button box. The bars move while you steer or press, so you can see which axis is which.',
    de: 'Lenkrad, Pedale, Schalthebel, Tastenbox. Die Balken bewegen sich mit, während du lenkst oder trittst -- so siehst du, welche Achse welche ist.',
    fr: 'Volant, pédales, levier, boîtier de boutons. Les barres bougent pendant que vous tournez ou appuyez : vous voyez quel axe est lequel.',
    nl: 'Stuur, pedalen, pook, knoppenkastje. De balken bewegen mee terwijl je stuurt of trapt, dus je ziet welke as welke is.'
  },
  'ctrl.devices': { en: 'Devices', de: 'Geräte', fr: 'Périphériques', nl: 'Apparaten' },
  'ctrl.connected': { en: 'connected', de: 'angeschlossen', fr: 'connecté', nl: 'aangesloten' },
  'ctrl.offline': { en: 'not connected', de: 'nicht angeschlossen', fr: 'non connecté', nl: 'niet aangesloten' },
  'ctrl.inUse': { en: 'used by OMSI', de: 'von OMSI genutzt', fr: 'utilisé par OMSI', nl: 'in gebruik door OMSI' },
  'ctrl.newDevices': {
    en: 'Connected, but not in the OMSI file yet',
    de: 'Angeschlossen, aber noch nicht in der OMSI-Datei',
    fr: 'Connecté, mais absent du fichier OMSI',
    nl: 'Aangesloten, maar nog niet in het bestand van OMSI'
  },
  'ctrl.add': { en: 'Add', de: 'Hinzufügen', fr: 'Ajouter', nl: 'Toevoegen' },
  'ctrl.addNote': {
    en: 'Adding writes the device into the OMSI file under the name Windows gives it. If OMSI spells it differently, pick the device once in the game and it appears here.',
    de: 'Beim Hinzufügen kommt das Gerät unter dem Namen in die OMSI-Datei, den Windows ihm gibt. Schreibt OMSI ihn anders, wähle das Gerät einmal im Spiel aus -- dann steht es hier.',
    fr: 'L’ajout inscrit le périphérique dans le fichier OMSI sous le nom donné par Windows. Si OMSI l’orthographie autrement, sélectionnez-le une fois dans le jeu et il apparaîtra ici.',
    nl: 'Toevoegen zet het apparaat in het bestand van OMSI onder de naam die Windows eraan geeft. Schrijft OMSI hem anders, kies het apparaat dan één keer in het spel; daarna staat het hier.'
  },
  'ctrl.use': {
    en: 'OMSI uses this device',
    de: 'OMSI nutzt dieses Gerät',
    fr: 'OMSI utilise ce périphérique',
    nl: 'OMSI gebruikt dit apparaat'
  },
  'ctrl.axes': { en: 'Axes', de: 'Achsen', fr: 'Axes', nl: 'Assen' },
  'ctrl.axesIntro': {
    en: 'Move a pedal or the wheel: the bar that jumps is that axis. Then say what it should do.',
    de: 'Bewege ein Pedal oder das Lenkrad: der Balken, der ausschlägt, ist diese Achse. Dann sagst du, was sie tun soll.',
    fr: 'Bougez une pédale ou le volant : la barre qui saute correspond à cet axe. Dites ensuite ce qu’il doit faire.',
    nl: 'Beweeg een pedaal of het stuur: de balk die uitslaat is die as. Daarna zeg je wat hij moet doen.'
  },
  'ctrl.axis': { en: 'Axis {number}', de: 'Achse {number}', fr: 'Axe {number}', nl: 'As {number}' },
  'ctrl.axisNone': { en: 'nothing', de: 'nichts', fr: 'rien', nl: 'niets' },
  'ctrl.fn.steering': { en: 'Steering', de: 'Lenkung', fr: 'Direction', nl: 'Sturen' },
  'ctrl.fn.throttle': { en: 'Throttle', de: 'Gas', fr: 'Accélérateur', nl: 'Gas' },
  'ctrl.fn.brake': { en: 'Brake', de: 'Bremse', fr: 'Frein', nl: 'Rem' },
  'ctrl.fn.clutch': { en: 'Clutch', de: 'Kupplung', fr: 'Embrayage', nl: 'Koppeling' },
  'ctrl.fn.throttleBrake': { en: 'Throttle and brake on one axis', de: 'Gas und Bremse auf einer Achse', fr: 'Accélérateur et frein sur un axe', nl: 'Gas en rem op één as' },
  'ctrl.buttons': { en: 'Buttons', de: 'Tasten', fr: 'Boutons', nl: 'Knoppen' },
  'ctrl.button': { en: 'Button {number}', de: 'Taste {number}', fr: 'Bouton {number}', nl: 'Knop {number}' },
  'ctrl.pressed': { en: 'pressed', de: 'gedrückt', fr: 'enfoncé', nl: 'ingedrukt' },
  'ctrl.noButtons': {
    en: 'No buttons found for this device.',
    de: 'Für dieses Gerät sind keine Tasten gefunden.',
    fr: 'Aucun bouton trouvé pour ce périphérique.',
    nl: 'Geen knoppen gevonden voor dit apparaat.'
  },
  'ctrl.clearAll': { en: 'Clear all buttons', de: 'Alle Tasten leeren', fr: 'Vider tous les boutons', nl: 'Alle knoppen leegmaken' },
  'ctrl.wizard': { en: 'Set up step by step', de: 'Schritt für Schritt einrichten', fr: 'Configurer pas à pas', nl: 'Stap voor stap instellen' },
  'ctrl.step': { en: 'Step {number} of {total}', de: 'Schritt {number} von {total}', fr: 'Étape {number} sur {total}', nl: 'Stap {number} van {total}' },
  'ctrl.moveAxis': {
    en: 'Move it now — the app watches which axis changes.',
    de: 'Jetzt bewegen — die App achtet darauf, welche Achse sich ändert.',
    fr: 'Bougez maintenant : l’application repère l’axe qui change.',
    nl: 'Beweeg hem nu — de app kijkt welke as verandert.'
  },
  'ctrl.pressButton': {
    en: 'Press it now — the app watches which button goes down.',
    de: 'Jetzt drücken — die App achtet darauf, welche Taste kommt.',
    fr: 'Appuyez maintenant : l’application repère le bouton pressé.',
    nl: 'Druk hem nu in — de app kijkt welke knop er komt.'
  },
  'ctrl.noDevice': {
    en: 'This device is not connected right now, so there is nothing to read. Plug it in, or skip.',
    de: 'Dieses Gerät ist gerade nicht angeschlossen, also gibt es nichts zu lesen. Anschließen oder überspringen.',
    fr: 'Ce périphérique n’est pas connecté : rien à lire. Branchez-le ou passez.',
    nl: 'Dit apparaat is nu niet aangesloten, dus er valt niets af te lezen. Sluit hem aan, of sla over.'
  },
  'ctrl.skipStep': { en: 'Skip this one', de: 'Diesen überspringen', fr: 'Passer celui-ci', nl: 'Deze overslaan' },
  'ctrl.skipAll': { en: 'Stop the wizard', de: 'Assistent beenden', fr: 'Arrêter l’assistant', nl: 'Wizard stoppen' },

  // ---------- wat de wizard vraagt ----------
  'ctrl.ask.steering': { en: 'Turn the wheel to the left', de: 'Dreh das Lenkrad nach links', fr: 'Tournez le volant à gauche', nl: 'Draai het stuur naar links' },
  'ctrl.ask.throttle': { en: 'Press the throttle', de: 'Gib Gas', fr: 'Appuyez sur l’accélérateur', nl: 'Geef gas' },
  'ctrl.ask.brake': { en: 'Press the brake', de: 'Tritt auf die Bremse', fr: 'Appuyez sur le frein', nl: 'Trap op de rem' },
  'ctrl.ask.clutch': { en: 'Press the clutch', de: 'Tritt die Kupplung', fr: 'Appuyez sur l’embrayage', nl: 'Trap de koppeling in' },
  'ctrl.ask.horn': { en: 'Press the button for the horn', de: 'Drücke die Taste für die Hupe', fr: 'Appuyez sur le bouton du klaxon', nl: 'Druk op de knop voor de claxon' },
  'ctrl.ask.blinkerLeft': { en: 'Indicator left', de: 'Blinker links', fr: 'Clignotant gauche', nl: 'Richtingaanwijzer links' },
  'ctrl.ask.blinkerRight': { en: 'Indicator right', de: 'Blinker rechts', fr: 'Clignotant droit', nl: 'Richtingaanwijzer rechts' },
  'ctrl.ask.blinkerOff': { en: 'Indicator off', de: 'Blinker aus', fr: 'Clignotant éteint', nl: 'Richtingaanwijzer uit' },
  'ctrl.ask.doorFront': { en: 'Front doors open and close', de: 'Vordere Türen auf und zu', fr: 'Portes avant ouvrir et fermer', nl: 'Deuren voor open en dicht' },
  'ctrl.ask.doorAft': { en: 'Rear doors open and close', de: 'Hintere Türen auf und zu', fr: 'Portes arrière ouvrir et fermer', nl: 'Deuren achter open en dicht' },
  'ctrl.ask.handbrake': { en: 'Parking brake', de: 'Feststellbremse', fr: 'Frein de stationnement', nl: 'Handrem' },
  'ctrl.ask.engine': { en: 'Start the engine', de: 'Motor starten', fr: 'Démarrer le moteur', nl: 'Motor starten' },

  // ---------- hoofdscherm ----------
  'app.loading': {
    en: 'Reading the timetables…',
    de: 'Fahrpläne werden eingelesen…',
    fr: 'Lecture des horaires…',
    nl: 'Dienstregeling inlezen…'
  },
  'app.loadingSub': {
    en: 'Going through every map, tour and vehicle you have installed.',
    de: 'Alle installierten Karten, Umläufe und Fahrzeuge werden durchgegangen.',
    fr: 'Toutes les cartes, tous les roulements et tous les véhicules installés sont parcourus.',
    nl: 'Alle kaarten, omlopen en voertuigen worden doorgenomen.'
  },
  'app.errorTitle': {
    en: 'Something went wrong',
    de: 'Etwas ist schiefgelaufen',
    fr: 'Un problème est survenu',
    nl: 'Er ging iets mis'
  },
  'app.noOmsi': {
    en: 'No OMSI 2 installation found. Is the game on another drive?',
    de: 'Keine OMSI-2-Installation gefunden. Liegt das Spiel auf einem anderen Laufwerk?',
    fr: 'Aucune installation d’OMSI 2 trouvée. Le jeu est-il sur un autre disque ?',
    nl: 'Geen OMSI 2-installatie gevonden. Staat het spel op een andere schijf?'
  },
  'app.title': {
    en: 'Pick a duty',
    de: 'Dienst wählen',
    fr: 'Choisir un service',
    nl: 'Dienst kiezen'
  },
  'app.subtitle': {
    en: 'Pick a duty and the app sets it up in OMSI: the map, the bus at the right stop, the date and the time. You press Start, the overlay does the rest.',
    de: 'Wähle einen Dienst, und die App richtet ihn in OMSI ein: Karte, Bus an der richtigen Haltestelle, Datum und Uhrzeit. Du drückst auf Start, das Overlay macht den Rest.',
    fr: 'Choisissez un service et l’application le prépare dans OMSI : la carte, le bus au bon arrêt, la date et l’heure. Vous appuyez sur Start, la surimpression fait le reste.',
    nl: 'Kies een dienst en de app zet hem klaar in OMSI: de kaart, de bus bij de juiste halte, de datum en de tijd. Jij drukt op Start, de overlay doet de rest.'
  },
  'app.map': { en: 'Map', de: 'Karte', fr: 'Carte', nl: 'Kaart' },
  'app.mapTours': {
    en: '{count} tours',
    de: '{count} Umläufe',
    fr: '{count} roulements',
    nl: '{count} omlopen'
  },
  'app.mapEra': {
    en: 'Set in {year}',
    de: 'Spielt {year}',
    fr: 'Se déroule en {year}',
    nl: 'Speelt in {year}'
  },
  'app.length': {
    en: 'Duty length',
    de: 'Dienstlänge',
    fr: 'Durée du service',
    nl: 'Dienstlengte'
  },
  'app.daypart': {
    en: 'Time of day',
    de: 'Tageszeit',
    fr: 'Moment de la journée',
    nl: 'Dagdeel'
  },
  'app.omsiReady': {
    en: 'OMSI is ready. Load your map and bus, and set the duty.',
    de: 'OMSI ist bereit. Lade Karte und Bus und stelle den Dienst ein.',
    fr: 'OMSI est prêt. Chargez votre carte et votre bus, puis réglez le service.',
    nl: 'OMSI staat klaar. Laad je kaart en bus, en stel de dienst in.'
  },
  'app.pluginChecking': {
    en: 'Checking plugin…',
    de: 'Plugin wird geprüft…',
    fr: 'Vérification du plugin…',
    nl: 'Plugin controleren…'
  },
  'app.pluginError': {
    en: 'Overlay: {error}',
    de: 'Overlay: {error}',
    fr: 'Surcouche : {error}',
    nl: 'Overlay: {error}'
  },
  'app.pluginReady': {
    en: 'Overlay plugin is ready in OMSI.',
    de: 'Overlay-Plugin steht in OMSI bereit.',
    fr: 'Le plugin de surcouche est prêt dans OMSI.',
    nl: 'Overlay-plugin staat klaar in OMSI.'
  },
  'app.noDuty': {
    en: 'No duty of about {length} in this part of the day on this map. Choose another length or a wider time of day.',
    de: 'Kein Dienst von etwa {length} in dieser Tageszeit auf dieser Karte. Wähle eine andere Länge oder eine weitere Tageszeit.',
    fr: 'Aucun service d’environ {length} à ce moment de la journée sur cette carte. Choisissez une autre durée ou une plage plus large.',
    nl: 'Geen dienst van ongeveer {length} in dit dagdeel op deze kaart. Kies een andere lengte of een ruimer dagdeel.'
  },
  'app.pluginUpdated': {
    en: 'Overlay plugin updated in OMSI.',
    de: 'Overlay-Plugin in OMSI aktualisiert.',
    fr: 'Plugin de surcouche mis à jour dans OMSI.',
    nl: 'Overlay-plugin bijgewerkt in OMSI.'
  },

  // ---------- dagdelen ----------
  'window.heledag': { en: 'All day', de: 'Ganzer Tag', fr: 'Toute la journée', nl: 'Hele dag' },
  'window.ochtend': { en: 'Morning', de: 'Morgen', fr: 'Matin', nl: 'Ochtend' },
  'window.middag': { en: 'Afternoon', de: 'Mittag', fr: 'Après-midi', nl: 'Middag' },
  'window.avond': { en: 'Evening', de: 'Abend', fr: 'Soir', nl: 'Avond' },
  'window.nacht': { en: 'Night', de: 'Nacht', fr: 'Nuit', nl: 'Nacht' },

  // ---------- rangen ----------
  'rank.leerling': { en: 'Trainee', de: 'Azubi', fr: 'Stagiaire', nl: 'Leerling' },
  'rank.chauffeur': { en: 'Driver', de: 'Fahrer', fr: 'Conducteur', nl: 'Chauffeur' },
  'rank.ervaren': {
    en: 'Experienced driver',
    de: 'Erfahrener Fahrer',
    fr: 'Conducteur expérimenté',
    nl: 'Ervaren chauffeur'
  },
  'rank.instructeur': {
    en: 'Line instructor',
    de: 'Linieninstrukteur',
    fr: 'Instructeur de ligne',
    nl: 'Lijninstructeur'
  },
  'rank.chef': {
    en: 'Fleet manager',
    de: 'Fuhrparkleiter',
    fr: 'Chef de parc',
    nl: 'Wagenparkchef'
  },

  // ---------- zijbalk ----------
  'side.toward': {
    en: '{percent}% towards {rank}',
    de: '{percent}% auf dem Weg zu {rank}',
    fr: '{percent}% vers {rank}',
    nl: '{percent}% op weg naar {rank}'
  },
  'side.otherProfile': {
    en: 'Other profile',
    de: 'Anderes Profil',
    fr: 'Autre profil',
    nl: 'Ander profiel'
  },
  'side.profileDuties': {
    en: '{driver} — {count} duties',
    de: '{driver} — {count} Dienste',
    fr: '{driver} — {count} services',
    nl: '{driver} — {count} diensten'
  },
  'side.newProfile': {
    en: '+ New profile',
    de: '+ Neues Profil',
    fr: '+ Nouveau profil',
    nl: '+ Nieuw profiel'
  },
  'side.duties': { en: 'duties', de: 'Dienste', fr: 'services', nl: 'diensten' },
  'side.driven': { en: 'driven', de: 'gefahren', fr: 'conduit', nl: 'gereden' },
  'side.stops': { en: 'stops', de: 'Haltestellen', fr: 'arrêts', nl: 'haltes' },
  'side.km': { en: 'kilometres', de: 'Kilometer', fr: 'kilomètres', nl: 'kilometers' },
  'side.logStops': {
    en: '{count} stops',
    de: '{count} Haltestellen',
    fr: '{count} arrêts',
    nl: '{count} haltes'
  },
  'side.earned': { en: 'earned', de: 'verdient', fr: 'gagné', nl: 'verdiend' },
  'side.log': { en: 'Logbook', de: 'Fahrtenbuch', fr: 'Carnet de bord', nl: 'Logboek' },
  'side.noEntries': {
    en: 'No duties driven yet.',
    de: 'Noch keine Dienste gefahren.',
    fr: 'Aucun service effectué pour l’instant.',
    nl: 'Nog geen diensten gereden.'
  },
  'side.logLine': {
    en: 'Line {lines} · {duration}',
    de: 'Linie {lines} · {duration}',
    fr: 'Ligne {lines} · {duration}',
    nl: 'Lijn {lines} · {duration}'
  },
  'side.logDelay': {
    en: '{minutes} min late',
    de: '{minutes} Min Verspätung',
    fr: '{minutes} min de retard',
    nl: '{minutes} min vertraging'
  },

  // ---------- de voorgestelde dienst ----------
  'app.generate': { en: 'Generate a duty', de: 'Dienst erzeugen', fr: 'Générer un service', nl: 'Genereer dienst' },
  'app.regenerate': { en: 'Generate another', de: 'Neu erzeugen', fr: 'En générer un autre', nl: 'Opnieuw genereren' },
  'prop.title': { en: 'Your duty', de: 'Dein Dienst', fr: 'Votre service', nl: 'Je dienst' },
  'prop.intro': {
    en: 'This is what the depot has for you. Everything you need is on the card. Not to your liking? Generate another.',
    de: 'Das hat der Betriebshof für dich. Alles, was du brauchst, steht auf der Karte. Gefällt er nicht? Erzeuge einen anderen.',
    fr: 'Voilà ce que le dépôt vous propose. Tout est sur la fiche. Pas à votre goût ? Générez-en un autre.',
    nl: 'Dit heeft de remise voor je. Alles wat je nodig hebt staat op de kaart. Bevalt hij niet? Genereer een andere.'
  },
  'prop.accepted': { en: 'Duty accepted', de: 'Dienst angenommen', fr: 'Service accepté', nl: 'Dienst aangenomen' },
  'prop.acceptedNote': {
    en: 'The duty is yours. Start it here: the app sets it up in OMSI and opens the game.',
    de: 'Der Dienst gehört dir. Starte ihn hier: die App richtet ihn in OMSI ein und öffnet das Spiel.',
    fr: 'Le service est à vous. Lancez-le ici : l’application le prépare dans OMSI et ouvre le jeu.',
    nl: 'De dienst is van jou. Start hem hier: de app zet hem klaar in OMSI en opent het spel.'
  },
  'prop.close': { en: 'Close', de: 'Schließen', fr: 'Fermer', nl: 'Sluiten' },

  // ---------- terwijl je rijdt ----------
  'run.title': { en: 'On the road', de: 'Unterwegs', fr: 'En service', nl: 'Je rijdt' },
  'run.sub': {
    en: '{map} · {trips} trips in this duty',
    de: '{map} · {trips} Fahrten in diesem Dienst',
    fr: '{map} · {trips} courses dans ce service',
    nl: '{map} · {trips} ritten in deze dienst'
  },
  'run.firstTrip': { en: 'first trip', de: 'erste Fahrt', fr: 'première course', nl: 'eerste rit' },
  'run.route': { en: 'Route', de: 'Route', fr: 'Parcours', nl: 'Route' },
  'run.departs': { en: 'Departs', de: 'Abfahrt', fr: 'Départ', nl: 'Vertrek' },
  'run.from': { en: 'From stop', de: 'Ab Haltestelle', fr: 'Depuis l’arrêt', nl: 'Vanaf halte' },
  'run.towards': { en: 'Towards', de: 'Richtung', fr: 'Direction', nl: 'Richting' },
  'run.stops': {
    en: '{stops} stops, {minutes} minutes',
    de: '{stops} Haltestellen, {minutes} Minuten',
    fr: '{stops} arrêts, {minutes} minutes',
    nl: '{stops} haltes, {minutes} minuten'
  },
  'run.waiting': {
    en: 'Waiting for OMSI — pick the duty in the game and the overlay takes over.',
    de: 'Warte auf OMSI — wähle den Dienst im Spiel, dann übernimmt das Overlay.',
    fr: 'En attente d’OMSI — choisissez le service dans le jeu et la surcouche prend le relais.',
    nl: 'Wacht op OMSI — kies de dienst in het spel, dan neemt de overlay het over.'
  },
  'run.live': { en: '{km} km driven, {delay}', de: '{km} km gefahren, {delay}', fr: '{km} km parcourus, {delay}', nl: '{km} km gereden, {delay}' },
  'run.onTime': { en: 'on time', de: 'pünktlich', fr: 'à l’heure', nl: 'op tijd' },
  'run.late': { en: '{minutes} min late', de: '{minutes} Min Verspätung', fr: '{minutes} min de retard', nl: '{minutes} min te laat' },
  'run.early': { en: '{minutes} min early', de: '{minutes} Min zu früh', fr: '{minutes} min d’avance', nl: '{minutes} min te vroeg' },
  'run.lateWord': { en: 'behind schedule', de: 'zu spät', fr: 'en retard', nl: 'te laat' },
  'run.earlyWord': { en: 'ahead of schedule', de: 'zu früh', fr: 'en avance', nl: 'te vroeg' },
  'run.onScheduleWord': {
    en: 'on schedule',
    de: 'nach Fahrplan',
    fr: 'à l’heure',
    nl: 'op de dienstregeling'
  },
  'run.driven': { en: '{km} km driven', de: '{km} km gefahren', fr: '{km} km parcourus', nl: '{km} km gereden' },
  'run.full': { en: 'View the whole duty', de: 'Ganzen Dienst ansehen', fr: 'Voir tout le service', nl: 'Bekijk volledige dienst' },
  'run.fullTitle': { en: 'The whole duty', de: 'Der ganze Dienst', fr: 'Le service complet', nl: 'De volledige dienst' },
  'run.viewRoute': { en: 'View the route', de: 'Route ansehen', fr: 'Voir l’itinéraire', nl: 'Bekijk route' },
  'run.note': {
    en: 'The overlay follows the rest of the duty. Finish when you are done; cancel and nothing is logged.',
    de: 'Das Overlay begleitet den Rest des Dienstes. Beende ihn, wenn du fertig bist; brichst du ab, wird nichts eingetragen.',
    fr: 'La surcouche suit le reste du service. Terminez quand vous avez fini ; en annulant, rien n’est enregistré.',
    nl: 'De overlay loopt de rest van de dienst met je mee. Afronden als je klaar bent; annuleer je, dan wordt er niets geboekt.'
  },

  // ---------- rooster ----------
  'list.tour': { en: 'tour {tour}', de: 'Umlauf {tour}', fr: 'roulement {tour}', nl: 'omloop {tour}' },
  'list.trips': { en: '{count} trips', de: '{count} Fahrten', fr: '{count} courses', nl: '{count} ritten' },
  'list.noBus': {
    en: 'no matching bus',
    de: 'kein passender Bus',
    fr: 'aucun bus adapté',
    nl: 'geen passende bus'
  },
  'list.now': { en: 'now', de: 'jetzt', fr: 'maintenant', nl: 'nu' },

  // ---------- overstappen op een andere lijn ----------
  'duty.switch': {
    en: 'Change of line here',
    de: 'Hier Linienwechsel',
    fr: 'Changement de ligne ici',
    nl: 'Hier wissel je van lijn'
  },
  'duty.switchHow': {
    en: 'Open Set Time Table in OMSI and pick Line {line}, Tour {tour}, the trip leaving at {time}. There are {minutes} minutes to do it.',
    de: 'Öffne in OMSI Set Time Table und wähle Line {line}, Tour {tour}, die Fahrt um {time}. Dafür sind {minutes} Minuten Zeit.',
    fr: 'Ouvrez Set Time Table dans OMSI et choisissez Line {line}, Tour {tour}, le trajet de {time}. Vous avez {minutes} minutes.',
    nl: 'Open in OMSI Set Time Table en kies Line {line}, Tour {tour}, de rit die om {time} vertrekt. Daar is {minutes} minuten voor.'
  },

  // ---------- dienstkaart ----------
  'duty.head': {
    en: '{days} · {trips} trips · {stops} stops · {depot}',
    de: '{days} · {trips} Fahrten · {stops} Haltestellen · {depot}',
    fr: '{days} · {trips} courses · {stops} arrêts · {depot}',
    nl: '{days} · {trips} ritten · {stops} haltes · {depot}'
  },
  'duty.depot': { en: 'depot {name}', de: 'Betriebshof {name}', fr: 'dépôt {name}', nl: 'remise {name}' },
  'duty.depotUnknown': {
    en: 'depot unknown',
    de: 'Betriebshof unbekannt',
    fr: 'dépôt inconnu',
    nl: 'remise onbekend'
  },
  'duty.signOn': {
    en: '{duration} · sign on {time}',
    de: '{duration} · Dienstbeginn {time}',
    fr: '{duration} · prise de service {time}',
    nl: '{duration} · aanmelden {time}'
  },
  'duty.routeNumber': {
    en: 'Route number for the IBIS',
    de: 'Routennummer für das IBIS',
    fr: 'Numéro de route pour l’IBIS',
    nl: 'Routenummer voor de IBIS'
  },
  'duty.from': { en: 'from {stop}', de: 'ab {stop}', fr: 'depuis {stop}', nl: 'vanaf {stop}' },
  'duty.legMeta': {
    en: '{stops} stops · {minutes} min',
    de: '{stops} Haltestellen · {minutes} Min',
    fr: '{stops} arrêts · {minutes} min',
    nl: '{stops} haltes · {minutes} min'
  },
  'duty.unknown': { en: 'unknown', de: 'unbekannt', fr: 'inconnu', nl: 'onbekend' },

  // ---------- zo kies je hem in OMSI ----------
  'select.title': {
    en: 'What is set up in OMSI',
    de: 'Was in OMSI eingestellt ist',
    fr: 'Ce qui est préparé dans OMSI',
    nl: 'Wat er in OMSI klaarstaat'
  },
  'select.preset': {
    en: 'The app selects this for you. The values are here in case you ever need to set them by hand.',
    de: 'Die App wählt das für dich aus. Die Werte stehen hier, falls du sie doch einmal selbst eingeben musst.',
    fr: 'L’application le sélectionne pour vous. Les valeurs sont ici au cas où vous devriez les saisir vous-même.',
    nl: 'De app kiest dit voor je. De waarden staan er voor het geval je ze ooit zelf moet invoeren.'
  },
  'select.howto': {
    en: 'Menu Set Time Table: choose Line {line}, Tour {tour}, the trip leaving at {time} for {terminus}, and {stop} as First stop — that is where OMSI puts you.',
    de: 'Menü Set Time Table: wähle Line {line}, Tour {tour}, die Fahrt um {time} nach {terminus} und als First stop {stop} — dort setzt OMSI dich ab.',
    fr: 'Menu Set Time Table : choisissez Line {line}, Tour {tour}, la course de {time} vers {terminus}, et {stop} comme First stop — c’est là qu’OMSI vous place.',
    nl: 'Menu Set Time Table: kies Line {line}, Tour {tour}, de rit die om {time} vertrekt naar {terminus}, en als First stop {stop} — daar zet OMSI je neer.'
  },

  'select.date': {
    en: 'Set the date to {date} — {kind}.',
    de: 'Stelle das Datum auf {date} — {kind}.',
    fr: 'Réglez la date sur {date} — {kind}.',
    nl: 'Zet de datum op {date} — {kind}.'
  },
  'select.dateWhy': {
    en: 'OMSI only lists the tours that run on the day you set.',
    de: 'OMSI zeigt nur die Umläufe, die am eingestellten Tag fahren.',
    fr: 'OMSI n’affiche que les roulements qui circulent à la date réglée.',
    nl: 'OMSI toont alleen de omlopen die op de ingestelde dag rijden.'
  },
  'day.school': {
    en: 'a school day',
    de: 'ein Schultag',
    fr: 'un jour d’école',
    nl: 'een schooldag'
  },
  'day.break': {
    en: 'school holidays',
    de: 'Schulferien',
    fr: 'vacances scolaires',
    nl: 'schoolvakantie'
  },
  'day.holiday': {
    en: 'a public holiday',
    de: 'ein Feiertag',
    fr: 'un jour férié',
    nl: 'een feestdag'
  },

  // ---------- kaart ----------
  'map.title': {
    en: 'Where to put the bus',
    de: 'Wo der Bus hin muss',
    fr: 'Où placer le bus',
    nl: 'Waar zet je de bus'
  },
  'map.reading': {
    en: 'Reading the map…',
    de: 'Karte wird gelesen…',
    fr: 'Lecture de la carte…',
    nl: 'Kaart wordt uitgelezen…'
  },
  'map.lead': {
    en: 'At {stop} — the sign with the ring. Put the camera there and then choose your bus.',
    de: 'An {stop} — das Schild mit dem Ring. Stelle die Kamera dorthin und wähle dann deinen Bus.',
    fr: 'À {stop} — le panneau cerclé. Placez la caméra là, puis choisissez votre bus.',
    nl: 'Bij {stop} — het bord met de ring. Zet de camera daar neer en kies dan je bus.'
  },
  'map.noPositions': {
    en: 'At {stop}. This map gives away no stop positions, so a map cannot be drawn here.',
    de: 'An {stop}. Diese Karte gibt keine Haltestellenpositionen preis, daher lässt sich hier keine Karte zeichnen.',
    fr: 'À {stop}. Cette carte ne révèle aucune position d’arrêt, impossible de dessiner un plan ici.',
    nl: 'Bij {stop}. Deze kaart geeft geen halteposities prijs, dus een kaartje kan hier niet.'
  },
  'map.view': { en: 'View route', de: 'Route ansehen', fr: 'Voir l’itinéraire', nl: 'Bekijk route' },
  'map.close': { en: 'Close', de: 'Schließen', fr: 'Fermer', nl: 'Sluiten' },
  'map.windowSub': {
    en: 'line {lines} · tour {tour} · {from} – {to}',
    de: 'Linie {lines} · Umlauf {tour} · {from} – {to}',
    fr: 'ligne {lines} · roulement {tour} · {from} – {to}',
    nl: 'lijn {lines} · omloop {tour} · {from} – {to}'
  },
  'map.entry': { en: 'Boarding point', de: 'Einstiegspunkt', fr: 'Point de départ', nl: 'Instappunt' },
  'map.entryNote': {
    en: 'This is where you put the bus. On the map it is the sign with the ring around it.',
    de: 'Hier stellst du den Bus hin. Auf der Karte ist es das Schild mit dem Ring darum.',
    fr: 'C’est ici que vous placez le bus. Sur le plan, c’est le panneau entouré d’un cercle.',
    nl: 'Hier zet je de bus neer. Op de kaart is het het bord met de ring eromheen.'
  },
  'map.legHead': {
    en: '{time} line {line} → {terminus}',
    de: '{time} Linie {line} → {terminus}',
    fr: '{time} ligne {line} → {terminus}',
    nl: '{time} lijn {line} → {terminus}'
  },
  'map.legRoute': { en: 'route {route}', de: 'Route {route}', fr: 'route {route}', nl: 'route {route}' },
  'map.zoomIn': { en: 'Zoom in', de: 'Heranzoomen', fr: 'Zoom avant', nl: 'Inzoomen' },
  'map.zoomOut': { en: 'Zoom out', de: 'Herauszoomen', fr: 'Zoom arrière', nl: 'Uitzoomen' },
  'map.fit': {
    en: 'Whole route in view',
    de: 'Ganze Route ins Bild',
    fr: 'Tout l’itinéraire à l’écran',
    nl: 'Hele route in beeld'
  },

  // ---------- bus ----------
  'bus.title': {
    en: 'Recommended bus',
    de: 'Empfohlener Bus',
    fr: 'Bus recommandé',
    nl: 'Aanbevolen bus'
  },
  'bus.none': {
    en: 'No matching bus found',
    de: 'Kein passender Bus gefunden',
    fr: 'Aucun bus adapté trouvé',
    nl: 'Geen passende bus gevonden'
  },
  'bus.noneNote': {
    en: 'None of your installed buses knows the destinations of this duty. Pick one yourself; the destination blinds may stay empty.',
    de: 'Keiner deiner installierten Busse kennt die Ziele dieses Dienstes. Wähle selbst einen; die Zielanzeigen bleiben dann möglicherweise leer.',
    fr: 'Aucun de vos bus installés ne connaît les destinations de ce service. Choisissez-en un vous-même ; les girouettes risquent de rester vides.',
    nl: 'Geen enkele geïnstalleerde bus kent de eindbestemmingen van deze dienst. Kies er zelf een; de bestemmingsfilms blijven dan mogelijk leeg.'
  },
  'bus.chosenSelf': {
    en: 'Chosen by you. The app suggested {bus}.',
    de: 'Selbst gewählt. Die App schlug {bus} vor.',
    fr: 'Choisi par vous. L’application proposait {bus}.',
    nl: 'Zelf gekozen. De app stelde {bus} voor.'
  },
  'bus.chosenFleet': {
    en: 'Chosen from {count} matching buses in the map’s fleet{yard}.',
    de: 'Aus {count} passenden Bussen im Fuhrpark der Karte gewählt{yard}.',
    fr: 'Choisi parmi {count} bus adaptés du parc de la carte{yard}.',
    nl: 'Gekozen uit {count} passende bussen uit het wagenpark van de kaart{yard}.'
  },
  'bus.chosenOutside': {
    en: 'Chosen from {count} matching buses — none of them is in the map’s fleet{yard}.',
    de: 'Aus {count} passenden Bussen gewählt — keiner davon steht im Fuhrpark der Karte{yard}.',
    fr: 'Choisi parmi {count} bus adaptés — aucun ne figure dans le parc de la carte{yard}.',
    nl: 'Gekozen uit {count} passende bussen — geen ervan staat in het wagenpark van de kaart{yard}.'
  },
  'bus.yard': { en: ', fleet {yard}', de: ', Fuhrpark {yard}', fr: ', parc {yard}', nl: ', wagenpark {yard}' },
  'bus.pick': { en: 'Bus', de: 'Bus', fr: 'Bus', nl: 'Bus' },
  'bus.other': { en: 'Another bus', de: 'Anderer Bus', fr: 'Autre bus', nl: 'Andere bus' },
  'bus.auto': { en: 'Automatic', de: 'Automatisch', fr: 'Automatique', nl: 'Automatisch' },
  'bus.yardPick': { en: 'Fleet file', de: 'Hofdatei', fr: 'Fichier de dépôt', nl: 'Wagenpark' },
  'bus.yardAuto': {
    en: 'Automatic (best match)',
    de: 'Automatisch (beste Übereinstimmung)',
    fr: 'Automatique (meilleure correspondance)',
    nl: 'Automatisch (beste overeenkomst)'
  },
  'bus.yardKnows': {
    en: 'knows {known} of {total} destinations',
    de: 'kennt {known} von {total} Zielen',
    fr: 'connaît {known} destinations sur {total}',
    nl: 'kent {known} van {total} bestemmingen'
  },

  // ---------- IBIS ----------
  'ibis.title': {
    en: 'Keying in the IBIS',
    de: 'IBIS eingeben',
    fr: 'Saisie IBIS',
    nl: 'IBIS invoeren'
  },
  'ibis.looking': {
    en: 'Looking up destination codes…',
    de: 'Zielcodes werden gesucht…',
    fr: 'Recherche des codes de destination…',
    nl: 'Bestemmingscodes worden opgezocht…'
  },
  'ibis.line': { en: 'Line', de: 'Linie', fr: 'Ligne', nl: 'Linie' },
  'ibis.routeAtStart': {
    en: 'Route at departure',
    de: 'Route bei Abfahrt',
    fr: 'Route au départ',
    nl: 'Route bij vertrek'
  },
  'ibis.film': { en: 'blind “{text}”', de: 'Anzeige „{text}“', fr: 'girouette « {text} »', nl: 'film “{text}”' },
  'ibis.allResolved': {
    en: 'Routes from fleet {yard}. You key in the line and the route; the destination belongs to the route and appears by itself. At every turning point you enter the route of the next trip.',
    de: 'Routen aus dem Fuhrpark {yard}. Du gibst Linie und Route ein; das Ziel gehört zur Route und erscheint von selbst. An jedem Wendepunkt gibst du die Route der nächsten Fahrt ein.',
    fr: 'Routes du parc {yard}. Vous saisissez la ligne et la route ; la destination appartient à la route et s’affiche d’elle-même. À chaque terminus, vous saisissez la route de la course suivante.',
    nl: 'Routes uit wagenpark {yard}. Je toetst lijn en route in; de bestemming hoort bij de route en verschijnt vanzelf. Bij elk keerpunt voer je de route van de volgende rit in.'
  },
  'ibis.someMissing': {
    en: 'Of {total} trips, {missing} have no route in fleet {yard}. You set those destinations on the blind by hand.',
    de: 'Von {total} Fahrten haben {missing} keine Route im Fuhrpark {yard}. Diese Ziele stellst du von Hand ein.',
    fr: 'Sur {total} courses, {missing} n’ont pas de route dans le parc {yard}. Vous réglez ces destinations à la main.',
    nl: 'Van {total} ritten hebben er {missing} geen route in wagenpark {yard}. Die bestemmingen zet je met de hand op de film.'
  },
  'ibis.noRoutes': {
    en: 'This bus does not know the routes of this line. Pick a bus that belongs to this fleet.',
    de: 'Dieser Bus kennt die Routen dieser Linie nicht. Wähle einen Bus, der zu diesem Fuhrpark gehört.',
    fr: 'Ce bus ne connaît pas les routes de cette ligne. Choisissez un bus appartenant à ce parc.',
    nl: 'Deze bus kent de routes van deze lijn niet. Kies een bus die bij dit wagenpark hoort.'
  },
  'ibis.noTable': {
    en: 'This fleet has no route table; you set this bus’s destination on the blind by hand.',
    de: 'Dieser Fuhrpark hat keine Routentabelle; das Ziel stellst du bei diesem Bus von Hand ein.',
    fr: 'Ce parc n’a pas de table de routes ; vous réglez la destination de ce bus à la main.',
    nl: 'Dit wagenpark heeft geen routetabel; deze bus zet je bestemming met de hand op de film.'
  },

  // ---------- rit-instructies ----------
  'leg.layover': {
    en: 'You wait {minutes} minutes at {stop}. Leave at {time}.',
    de: 'Du stehst {minutes} Minuten an {stop}. Abfahrt um {time}.',
    fr: 'Vous patientez {minutes} minutes à {stop}. Départ à {time}.',
    nl: 'Je staat {minutes} minuten stil op {stop}. Vertrek om {time}.'
  },
  'leg.ibis': {
    en: 'Key line {line} and route {route} into the IBIS{extra}.',
    de: 'Gib Linie {line} und Route {route} ins IBIS ein{extra}.',
    fr: 'Saisissez la ligne {line} et la route {route} dans l’IBIS{extra}.',
    nl: 'Toets in de IBIS lijn {line} en route {route} in{extra}.'
  },
  'leg.ibisNoRoute': {
    en: 'Key line {line} into the IBIS — this bus knows no route to {terminus}, set the blind by hand.',
    de: 'Gib Linie {line} ins IBIS ein — dieser Bus kennt keine Route nach {terminus}, stelle die Anzeige von Hand.',
    fr: 'Saisissez la ligne {line} dans l’IBIS — ce bus ne connaît pas de route vers {terminus}, réglez la girouette à la main.',
    nl: 'Toets in de IBIS lijn {line} in — deze bus kent geen route naar {terminus}, zet de film met de hand.'
  },
  'leg.blind': {
    en: '. The blind will show “{text}”',
    de: '. Auf der Anzeige erscheint „{text}“',
    fr: '. La girouette affichera « {text} »',
    nl: '. Op de film verschijnt “{text}”'
  },
  'leg.driveTo': {
    en: 'Drive to {terminus}: {stops} stops in {minutes} minutes, arriving {time}.',
    de: 'Fahre nach {terminus}: {stops} Haltestellen in {minutes} Minuten, Ankunft {time}.',
    fr: 'Roulez vers {terminus} : {stops} arrêts en {minutes} minutes, arrivée à {time}.',
    nl: 'Rijd naar {terminus}: {stops} haltes in {minutes} minuten, aankomst {time}.'
  },

  // ---------- knoppen ----------
  'act.confirm': { en: 'Accept duty', de: 'Dienst annehmen', fr: 'Accepter le service', nl: 'Dienst bevestigen' },
  'act.cancel': { en: 'Cancel duty', de: 'Dienst abgeben', fr: 'Annuler le service', nl: 'Dienst annuleren' },
  'act.cancelAsk': {
    en: 'Cancel this duty? It will not be entered in your logbook.',
    de: 'Diesen Dienst abgeben? Er wird nicht ins Fahrtenbuch eingetragen.',
    fr: 'Annuler ce service ? Il ne sera pas inscrit dans votre carnet de bord.',
    nl: 'Deze dienst annuleren? Hij komt dan niet in je logboek.'
  },
  'act.confirmNote': {
    en: 'Check the bus and the route, then accept the duty. It stays yours until you finish it.',
    de: 'Prüfe Bus und Strecke und nimm dann den Dienst an. Er bleibt deiner, bis du ihn beendest.',
    fr: 'Vérifiez le bus et l’itinéraire, puis acceptez le service. Il reste le vôtre jusqu’à ce que vous le terminiez.',
    nl: 'Controleer de bus en de route en bevestig dan de dienst. Hij blijft van jou tot je hem afrondt.'
  },
  'app.activeDuty': {
    en: 'You have an accepted duty. Finish or cancel it before choosing another.',
    de: 'Du hast einen angenommenen Dienst. Beende oder gib ihn ab, bevor du einen anderen wählst.',
    fr: 'Vous avez un service accepté. Terminez-le ou annulez-le avant d’en choisir un autre.',
    nl: 'Je hebt een bevestigde dienst. Rond hem af of annuleer hem voordat je een andere kiest.'
  },
  'act.start': { en: 'Start duty', de: 'Dienst beginnen', fr: 'Commencer le service', nl: 'Dienst starten' },
  'act.finish': { en: 'Finish duty', de: 'Dienst beenden', fr: 'Terminer le service', nl: 'Dienst afronden' },
  'act.overlayShow': { en: 'Show overlay', de: 'Overlay zeigen', fr: 'Afficher la surcouche', nl: 'Overlay tonen' },
  'act.overlayHide': { en: 'Close overlay', de: 'Overlay schließen', fr: 'Fermer la surcouche', nl: 'Overlay sluiten' },
  'act.overlayEdit': { en: 'Arrange overlay', de: 'Overlay anpassen', fr: 'Organiser la surcouche', nl: 'Overlay aanpassen' },
  'act.startedNote': {
    en: 'The odometer is recorded; when you finish, the app reads off what you drove.',
    de: 'Der Kilometerstand ist festgehalten; beim Beenden liest die App ab, was du gefahren bist.',
    fr: 'Le compteur est relevé ; à la fin, l’application lit ce que vous avez parcouru.',
    nl: 'De kilometerstand is vastgelegd; bij afronden leest de app af wat je gereden hebt.'
  },
  'act.overlayNote': {
    en: 'You can also rearrange it while driving: Ctrl+Alt+O.',
    de: 'Verschieben geht auch während der Fahrt: Strg+Alt+O.',
    fr: 'Vous pouvez aussi la réorganiser en roulant : Ctrl+Alt+O.',
    nl: 'Verslepen kan ook tijdens het rijden: Ctrl+Alt+O.'
  },
  'act.loadNote': {
    en: 'Press start here: the app writes the situation and opens OMSI with this duty ready.',
    de: 'Hier auf Beginnen drücken: die App schreibt die Situation und öffnet OMSI mit diesem Dienst.',
    fr: 'Appuyez ici sur Commencer : l’application écrit la situation et ouvre OMSI avec ce service prêt.',
    nl: 'Druk hier op starten: de app schrijft de situatie en opent OMSI met deze dienst klaar.'
  },

  // ---------- afdrukken ----------
  'print.title': {
    en: 'Print duty card',
    de: 'Dienstkarte drucken',
    fr: 'Imprimer la fiche de service',
    nl: 'Dienstkaartje printen'
  },
  'print.printer': { en: 'Printer', de: 'Drucker', fr: 'Imprimante', nl: 'Printer' },
  'print.noPrinter': {
    en: 'No printer found',
    de: 'Kein Drucker gefunden',
    fr: 'Aucune imprimante trouvée',
    nl: 'Geen printer gevonden'
  },
  'print.default': { en: ' (default)', de: ' (Standard)', fr: ' (par défaut)', nl: ' (standaard)' },
  'print.print': { en: 'Print', de: 'Drucken', fr: 'Imprimer', nl: 'Afdrukken' },
  'print.preview': { en: 'Preview', de: 'Vorschau', fr: 'Aperçu', nl: 'Voorbeeld' },
  'print.note': {
    en: 'Laid out for 80 mm receipt paper; the length follows the content.',
    de: 'Für 80-mm-Bonpapier gesetzt; die Länge richtet sich nach dem Inhalt.',
    fr: 'Mis en page pour du papier ticket de 80 mm ; la longueur suit le contenu.',
    nl: 'Opgemaakt voor bonpapier van 80 mm; de lengte volgt de inhoud.'
  },
  'print.failed': {
    en: 'Printing did not work.',
    de: 'Das Drucken hat nicht geklappt.',
    fr: 'L’impression a échoué.',
    nl: 'Het afdrukken is niet gelukt.'
  },
  'print.done': { en: 'Card printed.', de: 'Karte gedruckt.', fr: 'Fiche imprimée.', nl: 'Kaartje afgedrukt.' },

  // ---------- opstartvenster ----------
  'starting.title': {
    en: 'One moment',
    de: 'Einen Moment',
    fr: 'Un instant',
    nl: 'Moment geduld'
  },
  'starting.body': {
    en: 'OMSI 2 is starting up. Like a diesel, it needs a moment to warm up — control your emotions.',
    de: 'OMSI 2 wird gestartet. Wie ein Diesel braucht es kurz, um warm zu werden — beherrsche deine Gefühle.',
    fr: 'OMSI 2 démarre. Comme un diesel, il lui faut un instant pour chauffer — maîtrisez vos émotions.',
    nl: 'OMSI 2 wordt opgestart. Net als een diesel heeft dit even tijd nodig om warm te worden, beheers uw emoties.'
  },
  'starting.busy': {
    en: 'Starting up…',
    de: 'Wird gestartet…',
    fr: 'Démarrage…',
    nl: 'Bezig met opstarten…'
  },
  'starting.loading': {
    en: 'The map is loading; that takes a while.',
    de: 'Die Karte wird geladen; das dauert etwas.',
    fr: 'La carte se charge ; cela prend un moment.',
    nl: 'De kaart wordt ingeladen; dat duurt even.'
  },
  'starting.still': {
    en: 'Still going. Large maps take their time.',
    de: 'Immer noch dabei. Große Karten brauchen ihre Zeit.',
    fr: 'Toujours en cours. Les grandes cartes prennent leur temps.',
    nl: 'Nog steeds bezig. Grote kaarten nemen ruim de tijd.'
  },
  'starting.close': { en: 'Close', de: 'Schließen', fr: 'Fermer', nl: 'Sluiten' },

  // ---------- overlay ----------
  'ovl.waiting': {
    en: 'Waiting for OMSI…',
    de: 'Warte auf OMSI…',
    fr: 'En attente d’OMSI…',
    nl: 'Wacht op OMSI…'
  },
  'ovl.noData': { en: 'No data', de: 'Keine Daten', fr: 'Aucune donnée', nl: 'Geen gegevens' },
  'ovl.ontime': { en: 'on time', de: 'pünktlich', fr: 'à l’heure', nl: 'op tijd' },
  'ovl.onTheDot': { en: 'on the dot', de: 'auf die Sekunde', fr: 'à la seconde', nl: 'op de seconde' },
  'ovl.aheadBy': { en: '{time} early', de: '{time} zu früh', fr: '{time} en avance', nl: '{time} te vroeg' },
  'ovl.behindBy': { en: '{time} late', de: '{time} zu spät', fr: '{time} de retard', nl: '{time} te laat' },
  'ovl.late': { en: '+{minutes} min', de: '+{minutes} Min', fr: '+{minutes} min', nl: '+{minutes} min' },
  'ovl.done': {
    en: 'Duty finished — close it in the app',
    de: 'Dienst gefahren — schließe ihn in der App ab',
    fr: 'Service terminé — clôturez-le dans l’application',
    nl: 'Dienst uitgereden — rond hem af in de app'
  },
  'ovl.to': { en: 'To', de: 'Nach', fr: 'Vers', nl: 'Naar' },
  'ovl.arrival': {
    en: 'arrival {time} · trip {index} of {total}',
    de: 'Ankunft {time} · Fahrt {index} von {total}',
    fr: 'arrivée {time} · course {index} sur {total}',
    nl: 'aankomst {time} · rit {index} van {total}'
  },
  'ovl.arrivalShort': {
    en: 'arrival {time}',
    de: 'Ankunft {time}',
    fr: 'arrivée {time}',
    nl: 'aankomst {time}'
  },
  'ovl.nextStop': {
    en: 'Next stop',
    de: 'Nächste Haltestelle',
    fr: 'Prochain arrêt',
    nl: 'Volgende halte'
  },
  'ovl.stop': { en: 'Stop', de: 'Halt', fr: 'Arrêt', nl: 'Halte' },
  'ovl.remaining': {
    en: '{left} of {total} to go',
    de: 'noch {left} von {total}',
    fr: 'encore {left} sur {total}',
    nl: 'nog {left} van {total}'
  },
  'ovl.tight': {
    en: '{passengers}p · {speed} km/h',
    de: '{passengers}P · {speed} km/h',
    fr: '{passengers}p · {speed} km/h',
    nl: '{passengers}p · {speed} km/u'
  },
  'ovl.tightLeft': { en: ' · {left} left', de: ' · noch {left}', fr: ' · encore {left}', nl: ' · nog {left}' },
  'ovl.onboard': { en: 'on board', de: 'an Bord', fr: 'à bord', nl: 'aan boord' },
  'ovl.speed': { en: 'km/h', de: 'km/h', fr: 'km/h', nl: 'km/u' },
  'ovl.mood': { en: 'mood', de: 'Stimmung', fr: 'humeur', nl: 'stemming' },
  'ovl.harshBrakes': {
    en: '{count}× braked hard',
    de: '{count}× stark gebremst',
    fr: '{count}× freinage brusque',
    nl: '{count}× hard geremd'
  },
  'ovl.harshAccels': {
    en: '{count}× pulled away hard',
    de: '{count}× stark angefahren',
    fr: '{count}× démarrage brusque',
    nl: '{count}× hard opgetrokken'
  },
  'ovl.wantsIn': {
    en: 'Someone wants to board',
    de: 'Jemand möchte einsteigen',
    fr: 'Quelqu’un veut monter',
    nl: 'Iemand wil instappen'
  },
  'ovl.wantsOut': {
    en: 'Someone wants to get off',
    de: 'Jemand möchte aussteigen',
    fr: 'Quelqu’un veut descendre',
    nl: 'Iemand wil uitstappen'
  },
  'ovl.endpoint': { en: 'terminus', de: 'Endhalt', fr: 'terminus', nl: 'eindpunt' },
  'ovl.andMore': {
    en: 'and {count} more to {terminus}',
    de: 'und noch {count} bis {terminus}',
    fr: 'et encore {count} jusqu’à {terminus}',
    nl: 'en nog {count} verder naar {terminus}'
  },
  'ovl.ibisHint': {
    en: 'key the line and route into the IBIS and the map follows along',
    de: 'gib Linie und Route ins IBIS ein, dann folgt die Karte mit',
    fr: 'saisissez la ligne et la route dans l’IBIS et la carte suivra',
    nl: 'toets lijn en route in op de IBIS, dan volgt de kaart mee'
  },
  'ovl.noStopInfo': {
    en: 'this bus reports no stop — this is the whole trip',
    de: 'dieser Bus meldet keine Haltestelle — das ist die ganze Fahrt',
    fr: 'ce bus n’annonce aucun arrêt — voici toute la course',
    nl: 'deze bus geeft geen halte door — dit is de hele rit'
  },
  'ovl.noTrip': {
    en: 'no trip for this time',
    de: 'keine Fahrt zu dieser Zeit',
    fr: 'aucune course à cette heure',
    nl: 'geen rit voor dit tijdstip'
  },
  'ovl.mapLoading': {
    en: 'loading map…',
    de: 'Karte wird geladen…',
    fr: 'chargement de la carte…',
    nl: 'kaart wordt geladen…'
  },
  'ovl.panelDuty': { en: 'Duty', de: 'Dienst', fr: 'Service', nl: 'Dienst' },
  'ovl.panelNav': { en: 'Navigation', de: 'Navigation', fr: 'Navigation', nl: 'Navigatie' },
  'ovl.editTitle': {
    en: 'Arrange overlay',
    de: 'Overlay anpassen',
    fr: 'Organiser la surcouche',
    nl: 'Overlay aanpassen'
  },
  'ovl.editHint': {
    en: 'drag the bar, pull the corner — Ctrl+Alt+O closes this',
    de: 'an der Leiste ziehen, an der Ecke greifen — Strg+Alt+O schließt dies',
    fr: 'glissez la barre, tirez le coin — Ctrl+Alt+O ferme ceci',
    nl: 'sleep aan de balk, trek aan de hoek — Ctrl+Alt+O sluit dit'
  },
  'ovl.stopOf': { en: 'stop {at} / {total}', de: 'Halt {at} / {total}', fr: 'arrêt {at} / {total}', nl: 'halte {at} / {total}' },
  'ovl.thenStop': { en: 'then {stop}', de: 'danach {stop}', fr: 'ensuite {stop}', nl: 'daarna {stop}' },
  'ovl.rate': { en: 'Refresh', de: 'Auffrischen', fr: 'Rafraîchissement', nl: 'Verversing' },
  'ovl.rate.vloeiend': { en: 'Smooth', de: 'Flüssig', fr: 'Fluide', nl: 'Vloeiend' },
  'ovl.rate.rustig': { en: 'Steady', de: 'Ruhig', fr: 'Modéré', nl: 'Rustig' },
  'ovl.rate.zuinig': { en: 'Sparing', de: 'Sparsam', fr: 'Économe', nl: 'Zuinig' },
  'ovl.rateHint': {
    en: 'stuttering in the game? set it lower',
    de: 'ruckelt das Spiel? stelle es niedriger',
    fr: 'le jeu saccade ? réglez plus bas',
    nl: 'hapert het spel? zet hem lager'
  },
  'ovl.hidden': { en: 'Turned off:', de: 'Ausgeschaltet:', fr: 'Désactivé :', nl: 'Uitgezet:' },
  'ovl.reset': {
    en: 'Restore defaults',
    de: 'Standard wiederherstellen',
    fr: 'Rétablir les réglages',
    nl: 'Standaard herstellen'
  },
  'ovl.ready': { en: 'Done', de: 'Fertig', fr: 'Terminé', nl: 'Klaar' },
  'ovl.selectTitle': {
    en: 'Select your duty in OMSI',
    de: 'Wähle deinen Dienst in OMSI',
    fr: 'Choisissez votre service dans OMSI',
    nl: 'Kies je dienst in OMSI'
  },
  'ovl.selectHow': {
    en: 'Timetable menu: line {line} · tour {tour} · departs {time}',
    de: 'Fahrplanmenü: Linie {line} · Umlauf {tour} · ab {time}',
    fr: 'Menu des horaires : ligne {line} · tournée {tour} · départ {time}',
    nl: 'Dienstregelingsmenu: lijn {line} · omloop {tour} · vertrek {time}'
  },
  'ovl.menu': { en: 'In the OMSI menu', de: 'Im OMSI-Menü', fr: 'Dans le menu d’OMSI', nl: 'In het menu van OMSI' },
  'ovl.onTheIbis': { en: 'On the IBIS', de: 'Auf dem IBIS', fr: 'Sur l’IBIS', nl: 'Op de IBIS' },
  'ovl.menuTrip': { en: 'Trip', de: 'Fahrt', fr: 'Trajet', nl: 'Rit' },
  'ovl.menuFirst': { en: 'First stop', de: 'Erste Haltestelle', fr: 'Premier arrêt', nl: 'Eerste halte' },
  'ovl.selectSteps': {
    en: 'Set Time Table: pick the line, then the tour, then the trip leaving at {time}. Then key the line and route into the IBIS; the destination follows from the route.',
    de: 'Set Time Table: erst die Linie, dann den Umlauf, dann die Fahrt um {time}. Danach Linie und Route ins IBIS tippen; das Ziel folgt aus der Route.',
    fr: 'Set Time Table : la ligne, puis le roulement, puis le trajet de {time}. Ensuite saisissez la ligne et la route sur l’IBIS ; la destination suit la route.',
    nl: 'Set Time Table: eerst de lijn, dan de omloop, dan de rit die om {time} vertrekt. Toets daarna lijn en route in op de IBIS; de bestemming volgt uit de route.'
  },
  'ovl.nextTrip': {
    en: 'Trip done. Next: pick the trip leaving at {time} in OMSI and key route {route} into the IBIS.',
    de: 'Fahrt beendet. Weiter: in OMSI die Fahrt um {time} wählen und Route {route} ins IBIS tippen.',
    fr: 'Trajet terminé. Ensuite : choisissez le trajet de {time} dans OMSI et saisissez la route {route} sur l’IBIS.',
    nl: 'Rit klaar. Verder: kies in OMSI de rit die om {time} vertrekt en toets route {route} in op de IBIS.'
  },
  'ovl.nextTripPlain': {
    en: 'Trip done. Next: the trip leaving at {time} in OMSI.',
    de: 'Fahrt beendet. Weiter: die Fahrt um {time} in OMSI.',
    fr: 'Trajet terminé. Ensuite : le trajet de {time} dans OMSI.',
    nl: 'Rit klaar. Verder: de rit die om {time} vertrekt in OMSI.'
  },
  'ovl.ibisStepTitle': {
    en: 'Key in the IBIS',
    de: 'IBIS eingeben',
    fr: 'Saisir sur l’IBIS',
    nl: 'Toets de IBIS in'
  },
  'ovl.ibisStepHow': {
    en: 'The duty is selected in OMSI. Now key line {line} and route {route} into the IBIS — the route says which direction, so it differs on the way back.',
    de: 'Der Dienst ist in OMSI gewählt. Jetzt Linie {line} und Route {route} ins IBIS tippen -- die Route sagt die Richtung, zurück ist sie anders.',
    fr: 'Le service est sélectionné dans OMSI. Saisissez la ligne {line} et la route {route} sur l’IBIS — la route indique le sens, elle diffère au retour.',
    nl: 'De dienst staat gekozen in OMSI. Toets nu lijn {line} en route {route} in op de IBIS — de route zegt de richting, dus terug is hij anders.'
  },
  'ovl.ibisDone': {
    en: 'IBIS is in — start the trip',
    de: 'IBIS steht — Fahrt beginnen',
    fr: 'IBIS saisi — commencer le trajet',
    nl: 'IBIS ingevoerd — start de rit'
  },
  'ovl.selectWrong': {
    en: 'Selected in OMSI: line {line}, tour {tour}. That is not your accepted duty.',
    de: 'In OMSI gewählt: Linie {line}, Umlauf {tour}. Das ist nicht dein angenommener Dienst.',
    fr: 'Choisi dans OMSI : ligne {line}, tournée {tour}. Ce n’est pas votre service accepté.',
    nl: 'In OMSI gekozen: lijn {line}, omloop {tour}. Dat is niet je bevestigde dienst.'
  },
  'ovl.mapIbis': {
    en: 'The route appears once you have keyed the line and route into the IBIS.',
    de: 'Die Strecke erscheint, sobald Linie und Route im IBIS stehen.',
    fr: 'L’itinéraire apparaît dès que la ligne et la route sont saisies sur l’IBIS.',
    nl: 'De route verschijnt zodra je lijn en route op de IBIS hebt ingetoetst.'
  },
  'ovl.mapSelect': {
    en: 'The route appears once you select the duty in OMSI’s timetable menu.',
    de: 'Die Route erscheint, sobald du den Dienst im Fahrplanmenü von OMSI wählst.',
    fr: 'L’itinéraire apparaît dès que vous choisissez le service dans le menu des horaires d’OMSI.',
    nl: 'De route verschijnt zodra je de dienst kiest in het dienstregelingsmenu van OMSI.'
  },
  'ovl.close': {
    en: 'Close overlay',
    de: 'Overlay schließen',
    fr: 'Fermer la surcouche',
    nl: 'Overlay sluiten'
  },
  'ovl.hide': { en: 'Turn off', de: 'Ausschalten', fr: 'Désactiver', nl: 'Uitzetten' },
  'ovl.resizeW': {
    en: 'Wider or narrower',
    de: 'Breiter oder schmaler',
    fr: 'Plus large ou plus étroit',
    nl: 'Breder of smaller'
  },
  'ovl.resizeWH': {
    en: 'Bigger or smaller',
    de: 'Größer oder kleiner',
    fr: 'Plus grand ou plus petit',
    nl: 'Groter of kleiner'
  },
  'ovl.detail': {
    en: '{level} — expand (Ctrl+Alt+V)',
    de: '{level} — aufklappen (Strg+Alt+V)',
    fr: '{level} — déplier (Ctrl+Alt+V)',
    nl: '{level} — uitklappen (Ctrl+Alt+V)'
  },
  'ovl.detail0': { en: 'Compact', de: 'Kompakt', fr: 'Compact', nl: 'Beknopt' },
  'ovl.detail1': { en: 'Normal', de: 'Normal', fr: 'Normal', nl: 'Normaal' },
  'ovl.detail2': { en: 'Detailed', de: 'Ausführlich', fr: 'Détaillé', nl: 'Uitgebreid' },

  // ---------- stemming en adviezen ----------
  'mood.empty': { en: 'empty', de: 'leer', fr: 'vide', nl: 'leeg' },
  'mood.happy': { en: 'happy', de: 'zufrieden', fr: 'satisfaits', nl: 'tevreden' },
  'mood.calm': { en: 'calm', de: 'ruhig', fr: 'calmes', nl: 'rustig' },
  'mood.impatient': { en: 'impatient', de: 'ungeduldig', fr: 'impatients', nl: 'ongeduldig' },
  'mood.annoyed': { en: 'annoyed', de: 'genervt', fr: 'agacés', nl: 'geïrriteerd' },
  'advice.licht': {
    en: 'It is dark and your dipped beam is off.',
    de: 'Es ist dunkel und dein Abblendlicht ist aus.',
    fr: 'Il fait sombre et vos feux de croisement sont éteints.',
    nl: 'Het is donker en je dimlicht staat uit.'
  },
  'advice.deuren': {
    en: 'You are driving with a door open.',
    de: 'Du fährst mit offener Tür.',
    fr: 'Vous roulez avec une porte ouverte.',
    nl: 'Je rijdt met een deur open.'
  },
  'advice.nat': {
    en: 'Wet road — expect longer braking distances.',
    de: 'Nasse Fahrbahn — rechne mit längeren Bremswegen.',
    fr: 'Chaussée mouillée — prévoyez des distances de freinage plus longues.',
    nl: 'Nat wegdek — reken op langere remwegen.'
  },
  'advice.remmen': {
    en: 'Braked hard {count} times; your passengers notice.',
    de: '{count}-mal stark gebremst; deine Fahrgäste merken das.',
    fr: '{count} freinages brusques ; vos passagers le sentent.',
    nl: '{count} keer hard geremd; je passagiers merken dat.'
  },
  'advice.motor': {
    en: 'The engine is off with passengers on board.',
    de: 'Der Motor ist aus, während Fahrgäste an Bord sind.',
    fr: 'Le moteur est coupé avec des passagers à bord.',
    nl: 'De motor staat uit met passagiers aan boord.'
  },

  // ---------- nieuwe overlay-knoppen ----------
  'ovl.layout': {
    en: 'Adjust layout',
    de: 'Layout anpassen',
    fr: 'Ajuster la disposition',
    nl: 'Pas layout aan'
  },
  'ovl.smaller': { en: 'Smaller', de: 'Kleiner', fr: 'Plus petit', nl: 'Kleiner' },
  'ovl.bigger': { en: 'Bigger', de: 'Größer', fr: 'Plus grand', nl: 'Groter' },
  'ovl.opacity': {
    en: 'Transparency',
    de: 'Transparenz',
    fr: 'Transparence',
    nl: 'Doorzichtigheid'
  },
  'ovl.centre': {
    en: 'Centre on the bus',
    de: 'Auf den Bus zentrieren',
    fr: 'Centrer sur le bus',
    nl: 'Centreer op de bus'
  },
  'ovl.ibisTitle': {
    en: 'Key into the IBIS',
    de: 'Ins IBIS eingeben',
    fr: 'Saisir dans l’IBIS',
    nl: 'Voer in op de IBIS'
  },
  'ovl.ibisWaiting': {
    en: 'Waiting for the IBIS. Key in the line and the route; then the duty and the map come to life.',
    de: 'Warte auf das IBIS. Gib Linie und Route ein; dann erwachen Dienst und Karte zum Leben.',
    fr: 'En attente de l’IBIS. Saisissez la ligne et la route ; le service et la carte s’activeront.',
    nl: 'Wacht op de IBIS. Toets lijn en route in; dan komen de dienst en de kaart tot leven.'
  },
  'ovl.ibisNoSupport': {
    en: 'This bus has no IBIS that reports back. The duty is below; the map cannot follow along.',
    de: 'Dieser Bus hat kein IBIS, das zurückmeldet. Der Dienst steht unten; die Karte kann nicht mitlaufen.',
    fr: 'Ce bus n’a pas d’IBIS qui renvoie des données. Le service est ci-dessous ; la carte ne peut pas suivre.',
    nl: 'Deze bus heeft geen IBIS die iets terugmeldt. De dienst staat hieronder; de kaart kan niet meelopen.'
  },
  'ovl.mapWaiting': {
    en: 'The route appears once the IBIS knows the line and route.',
    de: 'Die Route erscheint, sobald das IBIS Linie und Route kennt.',
    fr: 'L’itinéraire appara\u00eet dès que l’IBIS conna\u00eet la ligne et la route.',
    nl: 'De route verschijnt zodra de IBIS de lijn en de route kent.'
  },
  'ovl.busHere': {
    en: 'Estimated from the odometer',
    de: 'Aus dem Kilometerzähler geschätzt',
    fr: 'Estimé d’après le compteur',
    nl: 'Geschat uit de kilometerstand'
  },

  // ---------- bonnetje ----------
  'receipt.sub': { en: 'duty card', de: 'Dienstkarte', fr: 'fiche de service', nl: 'dienstkaart' },
  'receipt.line': { en: 'LINE {line}', de: 'LINIE {line}', fr: 'LIGNE {line}', nl: 'LIJN {line}' },
  'receipt.meta': {
    en: '{duration} · {trips} trips · {stops} stops',
    de: '{duration} · {trips} Fahrten · {stops} Haltestellen',
    fr: '{duration} · {trips} courses · {stops} arrêts',
    nl: '{duration} · {trips} ritten · {stops} haltes'
  },
  'receipt.signOn': {
    en: 'Sign on {time}',
    de: 'Dienstbeginn {time}',
    fr: 'Prise de service {time}',
    nl: 'Aanmelden {time}'
  },
  'receipt.setup': {
    en: 'SET UP IN OMSI',
    de: 'IN OMSI EINSTELLEN',
    fr: 'RÉGLER DANS OMSI',
    nl: 'IN OMSI INSTELLEN'
  },
  'receipt.trips': { en: 'TRIPS', de: 'FAHRTEN', fr: 'COURSES', nl: 'RITTEN' },
  'receipt.legSub': {
    en: 'from {stop} · {stops} stops · {minutes} min',
    de: 'ab {stop} · {stops} Haltestellen · {minutes} Min',
    fr: 'depuis {stop} · {stops} arrêts · {minutes} min',
    nl: 'vanaf {stop} · {stops} haltes · {minutes} min'
  },
  'receipt.wait': {
    en: ' · {minutes} min wait',
    de: ' · {minutes} Min Wartezeit',
    fr: ' · {minutes} min d’attente',
    nl: ' · {minutes} min wachten'
  },
  'receipt.bus': { en: 'Bus: {bus}', de: 'Bus: {bus}', fr: 'Bus : {bus}', nl: 'Bus: {bus}' },
  'receipt.fleet': {
    en: 'Fleet: {yard}',
    de: 'Fuhrpark: {yard}',
    fr: 'Parc : {yard}',
    nl: 'Wagenpark: {yard}'
  },
  'receipt.driver': {
    en: 'Driver: {driver}',
    de: 'Fahrer: {driver}',
    fr: 'Conducteur : {driver}',
    nl: 'Chauffeur: {driver}'
  },
  'receipt.farewell': {
    en: 'have a good shift',
    de: 'gute Fahrt',
    fr: 'bon service',
    nl: 'goede dienst'
  },

  // ---------- dagen ----------
  'days.unknown': { en: 'unknown day', de: 'unbekannter Tag', fr: 'jour inconnu', nl: 'onbekende dag' },
  'days.weekdays': { en: 'weekdays', de: 'Mo–Fr', fr: 'en semaine', nl: 'doordeweeks' },
  'days.weekend': { en: 'weekend', de: 'Wochenende', fr: 'week-end', nl: 'weekend' },
  'days.every': { en: 'every day', de: 'täglich', fr: 'tous les jours', nl: 'elke dag' },
  'days.count': { en: '{count} days', de: '{count} Tage', fr: '{count} jours', nl: '{count} dagen' },
  'days.and': { en: 'and', de: 'und', fr: 'et', nl: 'en' },
  'days.mon': { en: 'Monday', de: 'Montag', fr: 'lundi', nl: 'maandag' },
  'days.tue': { en: 'Tuesday', de: 'Dienstag', fr: 'mardi', nl: 'dinsdag' },
  'days.wed': { en: 'Wednesday', de: 'Mittwoch', fr: 'mercredi', nl: 'woensdag' },
  'days.thu': { en: 'Thursday', de: 'Donnerstag', fr: 'jeudi', nl: 'donderdag' },
  'days.fri': { en: 'Friday', de: 'Freitag', fr: 'vendredi', nl: 'vrijdag' },
  'days.sat': { en: 'Saturday', de: 'Samstag', fr: 'samedi', nl: 'zaterdag' },
  'days.sun': { en: 'Sunday', de: 'Sonntag', fr: 'dimanche', nl: 'zondag' }
} as const

export type TextKey = keyof typeof TEXT

/**
 * Zoekt een tekst op en vult de waarden in. Ontbreekt de taal, dan valt hij
 * terug op het Engels — beter een zin die je misschien niet leest dan een lege
 * plek of een sleutel.
 */
/**
 * De naam van een rang. Die komt als sleutel uit de loopbaangegevens en is dus
 * niet vooraf bekend; een onbekende sleutel geven we ongewijzigd terug in
 * plaats van een lege plek.
 */
export function rankName(language: Language, rank: string): string {
  return loose(language, `rank.${rank}`, rank)
}

/**
 * Een tekst waarvan de sleutel pas tijdens het draaien bekend is: stemmingen en
 * adviezen komen als naam uit de live gegevens. Kent de lijst hem niet, dan
 * geven we de terugval terug in plaats van een lege plek.
 */
export function loose(
  language: Language,
  key: string,
  fallback: string,
  vars?: Record<string, string | number>
): string {
  return key in TEXT ? t(language, key as TextKey, vars) : fallback
}

export function t(
  language: Language,
  key: TextKey,
  vars?: Record<string, string | number>
): string {
  const entry: Record<string, string> = TEXT[key]
  const text = entry[language] ?? entry[DEFAULT_LANGUAGE]
  if (!vars) return text
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole
  )
}
