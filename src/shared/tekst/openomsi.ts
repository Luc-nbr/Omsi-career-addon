/*
 * Teksten van de koppeling met openOMSI (design/ontwerpen/openomsi-koppeling.md
 * §7): de keuze in welk spel START begint, wat er gevonden is, en eerlijk wat
 * er in openOMSI (nog) niet kan. In 0.7.0 is dat: geen overlay en geen live
 * gegevens (die komen met de Lua-brug in 0.8.0), en kaartje en wisselgeld
 * blijven grijs. De afrekening komt na afloop uit openOMSI zelf.
 */
export const TEKST_OPENOMSI = {
  'oo.titel': { en: 'Drive in', de: 'Fahren in', fr: 'Conduire dans', nl: 'Rijden in' },
  'oo.intro': {
    en: 'Which game START opens. Automatic takes the game that is running, otherwise the one you used last. The app never starts a second game next to one that runs.',
    de: 'Welches Spiel START öffnet. Automatisch nimmt das laufende Spiel, sonst das zuletzt benutzte. Die App startet nie ein zweites Spiel neben einem laufenden.',
    fr: 'Le jeu qu’ouvre DÉPART. Automatique prend le jeu en cours, sinon le dernier utilisé. L’app ne lance jamais un second jeu à côté d’un jeu en cours.',
    nl: 'Welk spel START opent. Automatisch neemt het spel dat draait, anders het laatst gebruikte. De app start nooit een tweede spel naast een spel dat draait.'
  },
  'oo.omsi': { en: 'OMSI 2', de: 'OMSI 2', fr: 'OMSI 2', nl: 'OMSI 2' },
  'oo.openomsi': { en: 'openOMSI', de: 'openOMSI', fr: 'openOMSI', nl: 'openOMSI' },
  'oo.automatisch': { en: 'Automatic', de: 'Automatisch', fr: 'Automatique', nl: 'Automatisch' },
  'oo.automatischUitleg': {
    en: 'the game that runs, else the last one',
    de: 'das laufende Spiel, sonst das letzte',
    fr: 'le jeu en cours, sinon le dernier',
    nl: 'het spel dat draait, anders het laatste'
  },
  'oo.gevonden': {
    en: 'Found: openOMSI {versie} ({map})',
    de: 'Gefunden: openOMSI {versie} ({map})',
    fr: 'Trouvé : openOMSI {versie} ({map})',
    nl: 'Gevonden: openOMSI {versie} ({map})'
  },
  'oo.mapOmsi': { en: 'OMSI 2 folder', de: 'OMSI-2-Ordner', fr: 'dossier OMSI 2', nl: 'OMSI 2-map' },
  'oo.zonderLauncher': {
    en: 'openomsi-launcher.exe is missing next to it; the app then starts the game itself with the same options.',
    de: 'Daneben fehlt openomsi-launcher.exe; die App startet das Spiel dann selbst mit denselben Optionen.',
    fr: 'openomsi-launcher.exe manque à côté ; l’app lance alors le jeu elle-même avec les mêmes options.',
    nl: 'openomsi-launcher.exe ontbreekt ernaast; de app start het spel dan zelf met dezelfde opties.'
  },
  'oo.nietGevonden': {
    en: 'openOMSI was not found next to OMSI 2. To drive in it, unpack openOMSI into the OMSI 2 folder.',
    de: 'openOMSI wurde neben OMSI 2 nicht gefunden. Um darin zu fahren, entpacke openOMSI in den OMSI-2-Ordner.',
    fr: 'openOMSI est introuvable à côté d’OMSI 2. Pour y conduire, décompressez openOMSI dans le dossier OMSI 2.',
    nl: 'openOMSI staat niet naast OMSI 2. Wie erin wil rijden, pakt openOMSI uit in de OMSI 2-map.'
  },
  'oo.zonderLive': {
    en: 'openOMSI does not pass live data to the app yet: no overlay while driving, and ticket and change stay grey. Kilometres, stops, early and late, collisions and jolts come afterwards from openOMSI itself, when the game ends normally. Live data follows in version 0.8.0.',
    de: 'openOMSI gibt der App noch keine Live-Daten: kein Overlay beim Fahren, Fahrschein und Wechselgeld bleiben grau. Kilometer, Haltestellen, zu früh und zu spät, Unfälle und Rucke kommen danach von openOMSI selbst, wenn das Spiel normal endet. Live-Daten folgen in Version 0.8.0.',
    fr: 'openOMSI ne transmet pas encore de données en direct à l’app : pas d’overlay en conduisant, et billet et monnaie restent grisés. Kilomètres, arrêts, en avance et en retard, collisions et secousses viennent ensuite d’openOMSI lui-même, quand le jeu se termine normalement. Les données en direct arrivent avec la version 0.8.0.',
    nl: 'openOMSI geeft de app nog geen live-gegevens: geen overlay tijdens het rijden, en kaartje en wisselgeld blijven grijs. Kilometers, haltes, te vroeg en te laat, aanrijdingen en schokken komen achteraf uit openOMSI zelf, als het spel netjes eindigt. Live-gegevens volgen in versie 0.8.0.'
  },
  'oo.koppelingNog': {
    en: 'Link with openOMSI (the omsihub plugin): comes in version 0.8.0.',
    de: 'Verbindung mit openOMSI (das Plugin omsihub): kommt in Version 0.8.0.',
    fr: 'Liaison avec openOMSI (le plugin omsihub) : arrive avec la version 0.8.0.',
    nl: 'Koppeling met openOMSI (de plugin omsihub): komt in versie 0.8.0.'
  },
  'oo.uitTemp': {
    en: 'openOMSI is running from a temporary folder (Rar). The last situation, keys and mods there disappear; unpack openOMSI into the OMSI 2 folder.',
    de: 'openOMSI läuft aus einem temporären Ordner (Rar). Letzte Situation, Tasten und Mods dort verschwinden; entpacke openOMSI in den OMSI-2-Ordner.',
    fr: 'openOMSI tourne depuis un dossier temporaire (Rar). La dernière situation, les touches et les mods y disparaissent ; décompressez openOMSI dans le dossier OMSI 2.',
    nl: 'openOMSI draait uit een tijdelijke map (Rar). Laststn, toetsen en mods daar verdwijnen; pak openOMSI uit in de OMSI 2-map.'
  },
  'oo.tweeSpellen': {
    en: 'Two openOMSI games are running; a duty follows the first.',
    de: 'Zwei openOMSI-Spiele laufen; ein Dienst folgt dem ersten.',
    fr: 'Deux jeux openOMSI tournent ; un service suit le premier.',
    nl: 'Er draaien twee openOMSI-spellen; een dienst volgt het eerste.'
  },
  'oo.startIn': { en: 'Start in openOMSI', de: 'In openOMSI starten', fr: 'Démarrer dans openOMSI', nl: 'Start in openOMSI' },
  'oo.anderSpel': {
    en: '{spel} is already running, and the app never starts a second game. Close {spel} first, or choose it under Settings > App > Drive in.',
    de: '{spel} läuft bereits, und die App startet nie ein zweites Spiel. Schließe {spel} zuerst oder wähle es unter Einstellungen > App > Fahren in.',
    fr: '{spel} tourne déjà, et l’app ne lance jamais un second jeu. Fermez d’abord {spel}, ou choisissez-le dans Réglages > App > Conduire dans.',
    nl: '{spel} draait al, en de app start nooit een tweede spel. Sluit {spel} eerst, of kies het onder Instellingen > App > Rijden in.'
  },
  'oo.gestart': {
    en: 'The duty starts in openOMSI. There is no overlay there yet (0.8.0); the settlement follows from openOMSI when you end the game.',
    de: 'Der Dienst startet in openOMSI. Dort gibt es noch kein Overlay (0.8.0); die Abrechnung folgt von openOMSI, wenn du das Spiel beendest.',
    fr: 'Le service démarre dans openOMSI. Il n’y a pas encore d’overlay (0.8.0) ; le décompte suit depuis openOMSI quand vous quittez le jeu.',
    nl: 'De dienst start in openOMSI. Daar is nog geen overlay (0.8.0); de afrekening volgt uit openOMSI als je het spel afsluit.'
  },
  'oo.meegereden': {
    en: 'openOMSI is already running: the duty follows that game.',
    de: 'openOMSI läuft bereits: der Dienst folgt diesem Spiel.',
    fr: 'openOMSI tourne déjà : le service suit ce jeu.',
    nl: 'openOMSI draait al: de dienst volgt dat spel.'
  },
  'oo.vrijGestart': {
    en: 'openOMSI starts on {map} with the bus at {plek}. No overlay in openOMSI yet (0.8.0).',
    de: 'openOMSI startet auf {map} mit dem Bus bei {plek}. In openOMSI noch kein Overlay (0.8.0).',
    fr: 'openOMSI démarre sur {map} avec le bus à {plek}. Pas encore d’overlay dans openOMSI (0.8.0).',
    nl: 'openOMSI start op {map} met de bus bij {plek}. In openOMSI nog geen overlay (0.8.0).'
  },
  'oo.status.geenSpel': {
    en: 'openOMSI has not started yet',
    de: 'openOMSI ist noch nicht gestartet',
    fr: 'openOMSI n’a pas encore démarré',
    nl: 'openOMSI is nog niet gestart'
  },
  'oo.status.loopt': {
    en: 'openOMSI is running, no driving data yet',
    de: 'openOMSI läuft, noch keine Fahrdaten',
    fr: 'openOMSI tourne, pas encore de données de conduite',
    nl: 'openOMSI draait, nog geen rijgegevens'
  },
  'oo.status.herstart': {
    en: 'openOMSI is starting again…',
    de: 'openOMSI startet neu…',
    fr: 'openOMSI redémarre…',
    nl: 'openOMSI start opnieuw…'
  },
  'oo.status.wacht': {
    en: 'openOMSI has closed; waiting for its trip record…',
    de: 'openOMSI ist beendet; warte auf den Fahrtbericht…',
    fr: 'openOMSI est fermé ; en attente de son relevé de trajet…',
    nl: 'openOMSI is dicht; wacht op zijn ritverslag…'
  },
  'oo.status.klaar': {
    en: 'openOMSI has closed; the settlement is ready. Finish the duty to book it.',
    de: 'openOMSI ist beendet; die Abrechnung liegt vor. Beende den Dienst, um sie zu buchen.',
    fr: 'openOMSI est fermé ; le décompte est prêt. Terminez le service pour l’enregistrer.',
    nl: 'openOMSI is dicht; de afrekening staat klaar. Rond de dienst af om hem te boeken.'
  },
  'oo.status.onvolledig': {
    en: 'Settlement incomplete: openOMSI wrote no trip (crashed or closed hard).',
    de: 'Abrechnung unvollständig: openOMSI schrieb keine Fahrt (abgestürzt oder hart beendet).',
    fr: 'Décompte incomplet : openOMSI n’a écrit aucun trajet (planté ou fermé de force).',
    nl: 'Afrekening onvolledig: openOMSI schreef geen rit (gecrasht of hard afgesloten).'
  },
  'oo.overlayNiet': {
    en: 'No overlay in openOMSI yet (0.8.0)',
    de: 'In openOMSI noch kein Overlay (0.8.0)',
    fr: 'Pas encore d’overlay dans openOMSI (0.8.0)',
    nl: 'In openOMSI nog geen overlay (0.8.0)'
  },
  'oo.stoppen': {
    en: 'Closing openOMSI and waiting for its trip record…',
    de: 'openOMSI wird beendet, warte auf den Fahrtbericht…',
    fr: 'Fermeture d’openOMSI, en attente de son relevé…',
    nl: 'openOMSI wordt afgesloten, wacht op het ritverslag…'
  },
  'oo.afrekening': {
    en: 'From openOMSI trip(s) {pids}: {km} km, {haltes} stops, {vroeg} early, {laat} late, {kaartjes} tickets, {aanrijdingen} collisions, {schokken} jolts.',
    de: 'Aus openOMSI-Fahrt(en) {pids}: {km} km, {haltes} Haltestellen, {vroeg} zu früh, {laat} zu spät, {kaartjes} Fahrscheine, {aanrijdingen} Unfälle, {schokken} Rucke.',
    fr: 'Du/des trajet(s) openOMSI {pids} : {km} km, {haltes} arrêts, {vroeg} en avance, {laat} en retard, {kaartjes} billets, {aanrijdingen} collisions, {schokken} secousses.',
    nl: 'Uit openOMSI-rit(ten) {pids}: {km} km, {haltes} haltes, {vroeg} te vroeg, {laat} te laat, {kaartjes} kaartjes, {aanrijdingen} aanrijdingen, {schokken} schokken.'
  },
  'oo.kaartjeGrijs': {
    en: 'Ticket and change: not in openOMSI (openOMSI handles them itself)',
    de: 'Fahrschein und Wechselgeld: nicht in openOMSI (openOMSI regelt sie selbst)',
    fr: 'Billet et monnaie : pas dans openOMSI (openOMSI les gère lui-même)',
    nl: 'Kaartje en wisselgeld: niet in openOMSI (openOMSI handelt die zelf af)'
  }
} as const satisfies Record<string, { en: string; de: string; fr: string; nl: string }>
