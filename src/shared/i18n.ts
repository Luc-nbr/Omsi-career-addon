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
    en: 'Welcome to OMSI Career',
    de: 'Willkommen bei OMSI Career',
    fr: 'Bienvenue dans OMSI Career',
    nl: 'Welkom bij OMSI Career'
  },
  'welcome.intro': {
    en: 'OMSI Career turns the maps you already own into a job. Choose how long you want to drive and you get a real duty: the line, the tour, the IBIS codes to key in and the stop where your bus belongs.',
    de: 'OMSI Career macht aus den Karten, die du schon hast, einen Dienst. Du wählst, wie lange du fahren möchtest, und bekommst einen echten Umlauf: Linie, Kurs, die IBIS-Eingaben und die Haltestelle, an der dein Bus stehen muss.',
    fr: 'OMSI Career transforme les cartes que vous possédez déjà en service. Choisissez la durée de conduite et vous recevez un vrai roulement : la ligne, le tour, les codes IBIS à saisir et l’arrêt où placer votre bus.',
    nl: 'OMSI Career maakt van de kaarten die je al hebt een dienst. Je kiest hoe lang je wilt rijden en krijgt een echte omloop: de lijn, het omloopnummer, de IBIS-codes die je moet intoetsen en de halte waar je bus hoort te staan.'
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
  'welcome.namePlaceholder': {
    en: 'For example Luc',
    de: 'Zum Beispiel Luc',
    fr: 'Par exemple Luc',
    nl: 'Bijvoorbeeld Luc'
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
    en: 'OMSI was already running, so it has not seen this yet. Restart the game, or load the situation OMSI Career yourself.',
    de: 'OMSI lief bereits und kennt das noch nicht. Starte das Spiel neu oder lade die Situation OMSI Career selbst.',
    fr: 'OMSI tournait déjà et ne l’a pas encore vu. Relancez le jeu ou chargez vous-même la situation OMSI Career.',
    nl: 'OMSI draaide al en heeft dit nog niet gezien. Start het spel opnieuw, of laad de situatie OMSI Career zelf.'
  },
  'start.failed': {
    en: 'Could not set it up: {reason}',
    de: 'Einrichten nicht möglich: {reason}',
    fr: 'Préparation impossible : {reason}',
    nl: 'Klaarzetten lukte niet: {reason}'
  },

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
  'app.search': {
    en: 'Find duties',
    de: 'Dienste suchen',
    fr: 'Chercher des services',
    nl: 'Diensten zoeken'
  },
  'app.searchAgain': {
    en: 'Another roster',
    de: 'Anderer Dienstplan',
    fr: 'Autre tableau de service',
    nl: 'Ander rooster'
  },
  'app.roster': {
    en: 'Roster — {count} duties',
    de: 'Dienstplan — {count} Dienste',
    fr: 'Tableau de service — {count} services',
    nl: 'Rooster — {count} diensten'
  },
  'app.pickDuty': {
    en: 'Choose a duty above.',
    de: 'Wähle oben einen Dienst.',
    fr: 'Choisissez un service ci-dessus.',
    nl: 'Kies hierboven een dienst.'
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
  'ovl.selectWrong': {
    en: 'Selected in OMSI: line {line}, tour {tour}. That is not your accepted duty.',
    de: 'In OMSI gewählt: Linie {line}, Umlauf {tour}. Das ist nicht dein angenommener Dienst.',
    fr: 'Choisi dans OMSI : ligne {line}, tournée {tour}. Ce n’est pas votre service accepté.',
    nl: 'In OMSI gekozen: lijn {line}, omloop {tour}. Dat is niet je bevestigde dienst.'
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
    en: 'It is raining — expect longer braking distances.',
    de: 'Es regnet — rechne mit längeren Bremswegen.',
    fr: 'Il pleut — prévoyez des distances de freinage plus longues.',
    nl: 'Het regent — reken op langere remwegen.'
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
