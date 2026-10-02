/*
 * Teksten van de koppeling met openOMSI (design/ontwerpen/openomsi-koppeling.md
 * §7) en van de spelkeuze van Luc (01-10): "Spel: OMSI 2 / openOMSI", door de
 * speler zelf gekozen, bij de eerste START voorgesteld, altijd te wijzigen. In
 * 0.7.0 geeft openOMSI de app geen live-gegevens (die komen met de Lua-brug in
 * 0.8.0); de motoracties (kaartje, wisselgeld, knipperlicht, handrem,
 * koplampen) staan in openOMSI niet. De afrekening komt na afloop uit
 * openOMSI zelf.
 */
export const TEKST_OPENOMSI = {
  'oo.titel': { en: 'Game', de: 'Spiel', fr: 'Jeu', nl: 'Spel' },
  'oo.intro': {
    en: 'The game in which START begins your duties and free drives. You choose it yourself; the app never switches on its own. If the other game is already running, START says so and starts nothing.',
    de: 'Das Spiel, in dem START deine Dienste und freien Fahrten beginnt. Du wählst es selbst; die App wechselt nie von sich aus. Läuft schon das andere Spiel, sagt START das und startet nichts.',
    fr: 'Le jeu dans lequel DÉPART lance vos services et trajets libres. Vous le choisissez vous-même ; l’app ne change jamais d’elle-même. Si l’autre jeu tourne déjà, DÉPART le dit et ne lance rien.',
    nl: 'Het spel waarin START je diensten en vrije ritten begint. Je kiest het zelf; de app wisselt nooit uit zichzelf. Draait het andere spel al, dan zegt START dat en start er niets.'
  },
  'oo.omsi': { en: 'OMSI 2', de: 'OMSI 2', fr: 'OMSI 2', nl: 'OMSI 2' },
  'oo.openomsi': { en: 'openOMSI', de: 'openOMSI', fr: 'openOMSI', nl: 'openOMSI' },
  'oo.voorgesteld': { en: 'suggested', de: 'vorgeschlagen', fr: 'suggéré', nl: 'voorgesteld' },
  'oo.reden.draait': { en: 'running now', de: 'läuft gerade', fr: 'tourne en ce moment', nl: 'draait nu' },
  'oo.reden.laatst': { en: 'played last', de: 'zuletzt gespielt', fr: 'joué en dernier', nl: 'laatst gespeeld' },
  'oo.reden.alleen': { en: 'the only one here', de: 'das einzige hier', fr: 'le seul ici', nl: 'het enige hier' },
  'oo.reden.standaard': { en: 'as before', de: 'wie bisher', fr: 'comme avant', nl: 'zoals altijd' },
  'oo.nogNiet': {
    en: 'Not chosen yet. START asks once; suggested: {spel} ({reden}).',
    de: 'Noch nicht gewählt. START fragt einmal; vorgeschlagen: {spel} ({reden}).',
    fr: 'Pas encore choisi. DÉPART demande une fois ; suggéré : {spel} ({reden}).',
    nl: 'Nog niet gekozen. START vraagt het één keer; voorgesteld: {spel} ({reden}).'
  },
  'oo.kiesTitel': {
    en: 'Which game do you drive in?',
    de: 'In welchem Spiel fährst du?',
    fr: 'Dans quel jeu conduisez-vous ?',
    nl: 'In welk spel rijd je?'
  },
  'oo.kiesUitleg': {
    en: 'OMSI 2 and openOMSI are both on this PC. Choose where the app starts your duties and free drives. You can change it any time: next to START and under Settings > App > Game.',
    de: 'OMSI 2 und openOMSI sind beide auf diesem PC. Wähle, wo die App deine Dienste und freien Fahrten startet. Du kannst es jederzeit ändern: neben START und unter Einstellungen > App > Spiel.',
    fr: 'OMSI 2 et openOMSI sont tous deux sur ce PC. Choisissez où l’app lance vos services et trajets libres. Vous pouvez le changer à tout moment : à côté de DÉPART et dans Réglages > App > Jeu.',
    nl: 'OMSI 2 en openOMSI staan allebei op deze pc. Kies waarin de app je diensten en vrije ritten start. Je kunt het altijd wijzigen: naast START en onder Instellingen > App > Spel.'
  },
  'oo.kiesOmsi': {
    en: 'The original. Everything the app can do, with the overlay while driving.',
    de: 'Das Original. Alles, was die App kann, mit dem Overlay beim Fahren.',
    fr: 'L’original. Tout ce que l’app sait faire, avec l’overlay en conduisant.',
    nl: 'Het origineel. Alles wat de app kan, met de overlay tijdens het rijden.'
  },
  'oo.kiesOpenomsi': {
    en: 'The new engine. Starting, stopping and the settlement afterwards; live data while driving comes in 0.8.0.',
    de: 'Die neue Engine. Starten, Beenden und die Abrechnung danach; Live-Daten beim Fahren kommen in 0.8.0.',
    fr: 'Le nouveau moteur. Démarrer, arrêter et le décompte après ; les données en direct arrivent en 0.8.0.',
    nl: 'De nieuwe engine. Starten, stoppen en de afrekening achteraf; live-gegevens tijdens het rijden komen in 0.8.0.'
  },
  'oo.terug': { en: 'Back', de: 'Zurück', fr: 'Retour', nl: 'Terug' },
  'oo.gekozen': {
    en: 'Game: {spel}. Press START again.',
    de: 'Spiel: {spel}. Drücke noch einmal START.',
    fr: 'Jeu : {spel}. Appuyez à nouveau sur DÉPART.',
    nl: 'Spel: {spel}. Druk nog eens op START.'
  },
  'oo.vanDienst': {
    en: 'this duty runs in {spel}',
    de: 'dieser Dienst läuft in {spel}',
    fr: 'ce service roule dans {spel}',
    nl: 'deze dienst rijdt in {spel}'
  },
  'oo.nietGevondenStart': {
    en: 'openOMSI is chosen, but it was not found next to OMSI 2. Unpack openOMSI into the OMSI 2 folder, or choose OMSI 2 next to START.',
    de: 'openOMSI ist gewählt, wurde aber neben OMSI 2 nicht gefunden. Entpacke openOMSI in den OMSI-2-Ordner oder wähle OMSI 2 neben START.',
    fr: 'openOMSI est choisi, mais introuvable à côté d’OMSI 2. Décompressez openOMSI dans le dossier OMSI 2, ou choisissez OMSI 2 à côté de DÉPART.',
    nl: 'openOMSI is gekozen, maar staat niet naast OMSI 2. Pak openOMSI uit in de OMSI 2-map, of kies OMSI 2 naast START.'
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
    en: 'openOMSI does not pass live data to the app yet: no overlay while driving. Kilometres, stops, early and late, collisions and jolts come afterwards from openOMSI itself, when the game ends normally. Live data follows in version 0.8.0. Ticket, change, indicators, handbrake and headlights are handled by openOMSI itself; the app has no buttons for them there.',
    de: 'openOMSI gibt der App noch keine Live-Daten: kein Overlay beim Fahren. Kilometer, Haltestellen, zu früh und zu spät, Unfälle und Rucke kommen danach von openOMSI selbst, wenn das Spiel normal endet. Live-Daten folgen in Version 0.8.0. Fahrschein, Wechselgeld, Blinker, Handbremse und Scheinwerfer regelt openOMSI selbst; die App hat dort keine Knöpfe dafür.',
    fr: 'openOMSI ne transmet pas encore de données en direct à l’app : pas d’overlay en conduisant. Kilomètres, arrêts, en avance et en retard, collisions et secousses viennent ensuite d’openOMSI lui-même, quand le jeu se termine normalement. Les données en direct arrivent avec la version 0.8.0. Billet, monnaie, clignotants, frein à main et phares sont gérés par openOMSI lui-même ; l’app n’a pas de boutons pour eux là-bas.',
    nl: 'openOMSI geeft de app nog geen live-gegevens: geen overlay tijdens het rijden. Kilometers, haltes, te vroeg en te laat, aanrijdingen en schokken komen achteraf uit openOMSI zelf, als het spel netjes eindigt. Live-gegevens volgen in versie 0.8.0. Kaartje, wisselgeld, knipperlicht, handrem en koplampen regelt openOMSI zelf; daar heeft de app geen knoppen voor.'
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
    en: '{spel} is already running, and the app never starts a second game. Close {spel} first, or choose {spel} next to START.',
    de: '{spel} läuft bereits, und die App startet nie ein zweites Spiel. Schließe {spel} zuerst oder wähle {spel} neben START.',
    fr: '{spel} tourne déjà, et l’app ne lance jamais un second jeu. Fermez d’abord {spel}, ou choisissez {spel} à côté de DÉPART.',
    nl: '{spel} draait al, en de app start nooit een tweede spel. Sluit {spel} eerst, of kies {spel} naast START.'
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
  'oo.gevondenZonderVersie': {
    en: 'Found: openOMSI ({map})',
    de: 'Gefunden: openOMSI ({map})',
    fr: 'Trouvé : openOMSI ({map})',
    nl: 'Gevonden: openOMSI ({map})'
  },
  'oo.onzeker': {
    en: 'An openomsi.exe is running that the app cannot look into (running as administrator?). The app does not take it for a game: it does not hold OMSI 2 back, and a duty does not join it.',
    de: 'Es läuft eine openomsi.exe, in die die App nicht hineinsehen kann (als Administrator gestartet?). Die App hält sie nicht für ein Spiel: sie hält OMSI 2 nicht auf, und ein Dienst fährt nicht darin mit.',
    fr: 'Un openomsi.exe tourne dans lequel l’app ne peut pas regarder (lancé en administrateur ?). L’app ne le prend pas pour un jeu : il ne bloque pas OMSI 2, et un service ne s’y joint pas.',
    nl: 'Er draait een openomsi.exe waar de app niet in kan kijken (als beheerder gestart?). De app houdt het niet voor een spel: het houdt OMSI 2 niet tegen, en een dienst rijdt er niet in mee.'
  },
  'oo.invoerToetsen': {
    en: 'You chose openOMSI: these are openOMSI’s own keys (openOMSI\\Inputs\\keyboard.cfg). OMSI 2 keeps its own.',
    de: 'Du hast openOMSI gewählt: das sind die eigenen Tasten von openOMSI (openOMSI\\Inputs\\keyboard.cfg). OMSI 2 behält seine eigenen.',
    fr: 'Vous avez choisi openOMSI : ce sont les touches propres d’openOMSI (openOMSI\\Inputs\\keyboard.cfg). OMSI 2 garde les siennes.',
    nl: 'Je koos openOMSI: dit zijn de eigen toetsen van openOMSI (openOMSI\\Inputs\\keyboard.cfg). OMSI 2 houdt de zijne.'
  },
  'oo.invoerControllers': {
    en: 'You chose openOMSI: these are openOMSI’s own controller settings (openOMSI\\Inputs\\gamectrler.cfg). OMSI 2 keeps its own.',
    de: 'Du hast openOMSI gewählt: das sind die eigenen Controller-Einstellungen von openOMSI (openOMSI\\Inputs\\gamectrler.cfg). OMSI 2 behält seine eigenen.',
    fr: 'Vous avez choisi openOMSI : ce sont les réglages de manettes propres d’openOMSI (openOMSI\\Inputs\\gamectrler.cfg). OMSI 2 garde les siens.',
    nl: 'Je koos openOMSI: dit zijn de eigen controllerinstellingen van openOMSI (openOMSI\\Inputs\\gamectrler.cfg). OMSI 2 houdt de zijne.'
  },
  'oo.vrijZonderLive': {
    en: 'Driving freely in openOMSI. openOMSI does not pass live data to the app yet (0.8.0), so the app cannot follow the tour you pick there.',
    de: 'Freies Fahren in openOMSI. openOMSI gibt der App noch keine Live-Daten (0.8.0), daher kann die App dem Umlauf, den du dort wählst, nicht folgen.',
    fr: 'Conduite libre dans openOMSI. openOMSI ne transmet pas encore de données en direct à l’app (0.8.0) : l’app ne peut pas suivre le service que vous y choisissez.',
    nl: 'Vrij rijden in openOMSI. openOMSI geeft de app nog geen live-gegevens (0.8.0), dus de app kan de omloop die je daar kiest niet volgen.'
  },
  'oo.andereRit': {
    en: 'openOMSI is already running with another trip ({rit}). The duty does not join it: close openOMSI first and press START again.',
    de: 'openOMSI läuft bereits mit einer anderen Fahrt ({rit}). Der Dienst fährt darin nicht mit: schließe openOMSI zuerst und drücke noch einmal START.',
    fr: 'openOMSI tourne déjà avec un autre trajet ({rit}). Le service ne s’y joint pas : fermez d’abord openOMSI et appuyez à nouveau sur DÉPART.',
    nl: 'openOMSI draait al met een andere rit ({rit}). De dienst rijdt daar niet in mee: sluit openOMSI eerst en druk opnieuw op START.'
  },
  'oo.status.anders': {
    en: 'openOMSI recorded only another trip (different map, line or tour) than this duty: nothing of it counts for this duty.',
    de: 'openOMSI hat nur eine andere Fahrt (andere Karte, Linie oder Umlauf) als diesen Dienst aufgezeichnet: davon zählt nichts für diesen Dienst.',
    fr: 'openOMSI n’a enregistré qu’un autre trajet (autre carte, ligne ou service) que ce service : rien n’en compte pour ce service.',
    nl: 'openOMSI legde alleen een andere rit vast (andere kaart, lijn of omloop) dan deze dienst: daarvan telt niets voor deze dienst.'
  },
  'oo.stopMislukt': {
    en: 'openOMSI did not close, so nothing was booked and the duty continues. Close openOMSI yourself, then finish the duty.',
    de: 'openOMSI wurde nicht beendet, daher wurde nichts gebucht und der Dienst läuft weiter. Schließe openOMSI selbst und beende dann den Dienst.',
    fr: 'openOMSI ne s’est pas fermé : rien n’a été enregistré et le service continue. Fermez openOMSI vous-même, puis terminez le service.',
    nl: 'openOMSI sloot niet af, dus er is niets geboekt en de dienst loopt door. Sluit openOMSI zelf af en rond daarna de dienst af.'
  },
  'oo.heelSpel': {
    en: 'The duty joined an openOMSI game that was already running: these figures cover that whole game.',
    de: 'Der Dienst fuhr in einem openOMSI-Spiel mit, das schon lief: diese Zahlen gelten für das ganze Spiel.',
    fr: 'Le service s’est joint à une partie openOMSI déjà en cours : ces chiffres valent pour toute la partie.',
    nl: 'De dienst reed mee in een openOMSI-spel dat al draaide: deze cijfers gelden voor dat hele spel.'
  },
  'oo.crash': {
    en: 'openOMSI stopped at {tijd} without a trip record (crashed or closed hard).',
    de: 'openOMSI wurde um {tijd} ohne Fahrtbericht beendet (abgestürzt oder hart beendet).',
    fr: 'openOMSI s’est arrêté à {tijd} sans relevé de trajet (planté ou fermé de force).',
    nl: 'openOMSI is om {tijd} gestopt zonder ritverslag (gecrasht of hard afgesloten).'
  },
  'oo.herstartUitleg': {
    en: 'openOMSI continues from the last situation it saved during this duty (it saves every five minutes), otherwise from the start of the duty. What it drove before the crash it could not pass on.',
    de: 'openOMSI macht mit der letzten Situation weiter, die es während dieses Dienstes gespeichert hat (alle fünf Minuten), sonst ab dem Anfang des Dienstes. Was es vor dem Absturz gefahren ist, konnte es nicht weitergeben.',
    fr: 'openOMSI reprend à la dernière situation enregistrée pendant ce service (toutes les cinq minutes), sinon au début du service. Ce qu’il a conduit avant le plantage, il n’a pas pu le transmettre.',
    nl: 'openOMSI gaat verder vanaf de laatste stand die het tijdens deze dienst bewaarde (elke vijf minuten), anders vanaf het begin van de dienst. Wat het vóór de crash reed, kon het niet doorgeven.'
  },
  'oo.herstart': {
    en: 'Restart openOMSI with this duty',
    de: 'openOMSI mit diesem Dienst neu starten',
    fr: 'Relancer openOMSI avec ce service',
    nl: 'openOMSI opnieuw starten met deze dienst'
  },
  'oo.motorknoppenWeg': {
    en: 'Ticket, change, indicators, handbrake and headlights: not in openOMSI (openOMSI handles them itself)',
    de: 'Fahrschein, Wechselgeld, Blinker, Handbremse und Scheinwerfer: nicht in openOMSI (openOMSI regelt sie selbst)',
    fr: 'Billet, monnaie, clignotants, frein à main et phares : pas dans openOMSI (openOMSI les gère lui-même)',
    nl: 'Kaartje, wisselgeld, knipperlicht, handrem en koplampen: niet in openOMSI (openOMSI regelt die zelf)'
  }
} as const satisfies Record<string, { en: string; de: string; fr: string; nl: string }>
