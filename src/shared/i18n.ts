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
  'hub.title': {
    en: 'Hello {naam}',
    de: 'Hallo {naam}',
    fr: 'Bonjour {naam}',
    nl: 'Dag {naam}'
  },
  // De begroeting volgt de klok; zie `dagdeel` in beweging.ts.
  'hub.titleMorning': {
    en: 'Good morning, {naam}',
    de: 'Guten Morgen, {naam}',
    fr: 'Bonjour, {naam}',
    nl: 'Goedemorgen {naam}'
  },
  'hub.titleAfternoon': {
    en: 'Good afternoon, {naam}',
    de: 'Guten Tag, {naam}',
    fr: 'Bon après-midi, {naam}',
    nl: 'Goedemiddag {naam}'
  },
  'hub.titleEvening': {
    en: 'Good evening, {naam}',
    de: 'Guten Abend, {naam}',
    fr: 'Bonsoir, {naam}',
    nl: 'Goedenavond {naam}'
  },
  'hub.titleNight': {
    en: 'Night shift, {naam}?',
    de: 'Nachtschicht, {naam}?',
    fr: 'Service de nuit, {naam} ?',
    nl: 'Nachtdienst, {naam}?'
  },
  'hub.intro': {
    en: 'How do you want to drive today?',
    de: 'Wie möchtest du heute fahren?',
    fr: 'Comment voulez-vous conduire aujourd’hui ?',
    nl: 'Hoe wil je vandaag rijden?'
  },
  'hub.record': {
    en: 'Your record',
    de: 'Deine Bilanz',
    fr: 'Votre bilan',
    nl: 'Je staat van dienst'
  },
  'hub.duties': { en: 'duties', de: 'Dienste', fr: 'services', nl: 'diensten' },
  'hub.hours': { en: 'driven', de: 'gefahren', fr: 'au volant', nl: 'gereden' },
  'hub.km': { en: 'km', de: 'km', fr: 'km', nl: 'km' },
  'hub.licences': { en: 'licences', de: 'Lizenzen', fr: 'licences', nl: 'vergunningen' },
  /* Op de tegel van de modus waarin een dienst loopt: de weg terug erheen. */
  'hub.resume': {
    en: 'Carry on driving',
    de: 'Weiterfahren',
    fr: 'Reprendre le service',
    nl: 'Verder rijden'
  },
  'hub.log': {
    en: 'Open the log file',
    de: 'Logbuch öffnen',
    fr: 'Ouvrir le journal',
    nl: 'Logboek openen'
  },
  'hub.driver': {
    en: 'Driver: {naam}',
    de: 'Fahrer: {naam}',
    fr: 'Conducteur : {naam}',
    nl: 'Chauffeur: {naam}'
  },
  'prepare.title': {
    en: 'Getting your maps ready',
    de: 'Deine Karten werden vorbereitet',
    fr: 'Préparation de vos cartes',
    nl: 'De kaarten worden klaargezet'
  },
  'prepare.intro': {
    en: 'Every map is read once. After this the app opens them in a blink, and it only does this again for a map you add or change.',
    de: 'Jede Karte wird einmal gelesen. Danach öffnet die App sie im Nu, und nur eine neue oder geänderte Karte wird noch einmal gelesen.',
    fr: 'Chaque carte est lue une fois. Ensuite, l’application les ouvre en un clin d’œil, et seule une carte ajoutée ou modifiée sera relue.',
    nl: 'Elke kaart wordt één keer gelezen. Daarna opent de app ze in een oogwenk, en alleen een kaart die je toevoegt of wijzigt wordt opnieuw gelezen.'
  },
  'prepare.progress': {
    en: '{klaar} of {totaal} maps ready',
    de: '{klaar} von {totaal} Karten fertig',
    fr: '{klaar} cartes sur {totaal} prêtes',
    nl: '{klaar} van {totaal} kaarten klaar'
  },
  'prepare.almost': {
    en: 'Almost there',
    de: 'Fast fertig',
    fr: 'Presque fini',
    nl: 'Bijna klaar'
  },
  'prepare.skip': {
    en: 'Skip and start now',
    de: 'Überspringen und jetzt starten',
    fr: 'Passer et commencer',
    nl: 'Overslaan en nu beginnen'
  },
  'prepare.foot': {
    en: 'You can skip this. The rest happens in the background, and a map you open before it is ready simply takes a moment longer.',
    de: 'Du kannst das überspringen. Der Rest läuft im Hintergrund, und eine Karte, die noch nicht fertig ist, braucht dann kurz länger.',
    fr: 'Vous pouvez passer. Le reste se fait en arrière-plan ; une carte pas encore prête mettra simplement un instant de plus.',
    nl: 'Je mag dit overslaan. De rest gebeurt op de achtergrond, en een kaart die nog niet klaar is duurt dan even wat langer.'
  },
  'setup.busPickPaint': {
    en: 'Which livery? {aantal} to choose from — the Appearance list from OMSI.',
    de: 'Welche Lackierung? {aantal} zur Auswahl — die Appearance-Liste aus OMSI.',
    fr: 'Quelle livrée ? {aantal} au choix — la liste Appearance d’OMSI.',
    nl: 'Welke kleurstelling? {aantal} om uit te kiezen — de Appearance-lijst uit OMSI.'
  },
  'setup.paintDefault': {
    en: 'Default',
    de: 'Standard',
    fr: 'Par défaut',
    nl: 'Standaard'
  },
  'setup.paintDefaultSub': {
    en: 'As OMSI places it',
    de: 'So, wie OMSI ihn hinstellt',
    fr: 'Comme OMSI le place',
    nl: 'Zoals OMSI hem neerzet'
  },
  'setup.paintCount': {
    en: '{aantal} liveries',
    de: '{aantal} Lackierungen',
    fr: '{aantal} livrées',
    nl: '{aantal} kleurstellingen'
  },
  'done.cancelled': {
    en: 'Duty cancelled. Nothing was booked.',
    de: 'Dienst abgebrochen. Es wurde nichts gebucht.',
    fr: 'Service annulé. Rien n’a été enregistré.',
    nl: 'Dienst geannuleerd. Er is niets geboekt.'
  },
  'hub.dismiss': {
    en: 'Close',
    de: 'Schließen',
    fr: 'Fermer',
    nl: 'Sluiten'
  },
  'nav.home': {
    en: 'Main menu',
    de: 'Hauptmenü',
    fr: 'Menu principal',
    nl: 'Hoofdmenu'
  },
  'nav.settings': {
    en: 'OMSI settings',
    de: 'OMSI-Einstellungen',
    fr: 'Paramètres d’OMSI',
    nl: 'OMSI-instellingen'
  },
  'cfg.tabOverlays': {
    en: 'Overlays',
    de: 'Overlays',
    fr: 'Overlays',
    nl: 'Overlays'
  },
  'ovl.intro': {
    en: 'Steam, Discord and NVIDIA quietly hook into every game. OMSI 2 is a DirectX 9 game from 2013 and can freeze on it: logfile.txt then says “Direct3D-Device lost!” and the game stops responding. The app cannot switch them off, but it can see which ones are in OMSI and tell you where the switch is.',
    de: 'Steam, Discord und NVIDIA hängen sich unsichtbar in jedes Spiel. OMSI 2 ist ein DirectX-9-Spiel von 2013 und kann daran hängen bleiben: In der logfile.txt steht dann „Direct3D-Device lost!“, und das Spiel reagiert nicht mehr. Die App kann sie nicht ausschalten, sieht aber, welche in OMSI stecken, und sagt dir, wo der Schalter ist.',
    fr: 'Steam, Discord et NVIDIA s’accrochent discrètement à chaque jeu. OMSI 2 est un jeu DirectX 9 de 2013 et peut s’y bloquer : logfile.txt indique alors « Direct3D-Device lost! » et le jeu ne répond plus. L’application ne peut pas les désactiver, mais elle voit lesquels sont dans OMSI et vous dit où se trouve l’interrupteur.',
    nl: 'Steam, Discord en NVIDIA haken onzichtbaar in elk spel. OMSI 2 is een DirectX 9-spel uit 2013 en kan daarop vastlopen: in logfile.txt staat dan „Direct3D-Device lost!” en daarna reageert het spel niet meer. De app kan ze niet uitzetten, maar ziet wel welke er in OMSI zitten en zegt waar de schakelaar staat.'
  },
  'ovl.kijk': {
    en: 'Look in OMSI now',
    de: 'Jetzt in OMSI nachsehen',
    fr: 'Regarder dans OMSI',
    nl: 'Nu kijken in OMSI'
  },
  'ovl.kijkt': {
    en: 'Looking…',
    de: 'Sehe nach…',
    fr: 'Recherche…',
    nl: 'Kijken…'
  },
  'ovl.omsiUit': {
    en: 'OMSI is not running. Start it and look again — or drive a duty: the app then looks by itself once the map has loaded.',
    de: 'OMSI läuft nicht. Starte es und sieh noch einmal nach – oder fahre einen Dienst: Dann sieht die App nach dem Laden der Karte selbst nach.',
    fr: 'OMSI n’est pas lancé. Lancez-le et regardez de nouveau — ou conduisez un service : l’application regarde alors d’elle-même une fois la carte chargée.',
    nl: 'OMSI draait niet. Start het en kijk nog eens — of rijd een dienst: dan kijkt de app zelf zodra de kaart geladen is.'
  },
  'ovl.omsiDraait': {
    en: 'OMSI is running; this is what is in it now.',
    de: 'OMSI läuft; das steckt jetzt darin.',
    fr: 'OMSI est lancé ; voici ce qu’il contient maintenant.',
    nl: 'OMSI draait; dit zit er nu in.'
  },
  'ovl.omsiVast': {
    en: 'OMSI is not responding right now.',
    de: 'OMSI reagiert gerade nicht.',
    fr: 'OMSI ne répond pas en ce moment.',
    nl: 'OMSI reageert op dit moment niet.'
  },
  'ovl.extern': {
    en: 'Also running: {namen}. It grabs the picture from outside and injects nothing, but it sits in the display path.',
    de: 'Läuft auch: {namen}. Es greift das Bild von außen ab und injiziert nichts, sitzt aber im Anzeigeweg.',
    fr: 'Également lancé : {namen}. Il capte l’image de l’extérieur sans rien injecter, mais il se trouve sur le chemin de l’affichage.',
    nl: 'Draait ook: {namen}. Dat pakt het beeld van buitenaf en stopt niets in OMSI, maar zit wel in de weg naar je scherm.'
  },
  'ovl.inOmsi': {
    en: 'In OMSI.',
    de: 'Steckt in OMSI.',
    fr: 'Présent dans OMSI.',
    nl: 'Zit in OMSI.'
  },
  'ovl.nietInOmsi': {
    en: 'Not in OMSI.',
    de: 'Nicht in OMSI.',
    fr: 'Absent d’OMSI.',
    nl: 'Zit niet in OMSI.'
  },
  'ovl.onbekend': {
    en: 'Not checked yet: OMSI is not running.',
    de: 'Noch nicht geprüft: OMSI läuft nicht.',
    fr: 'Pas encore vérifié : OMSI n’est pas lancé.',
    nl: 'Nog niet bekeken: OMSI draait niet.'
  },
  'ovl.waarschuw': {
    en: 'Warn me when it is in OMSI',
    de: 'Warnen, wenn es in OMSI steckt',
    fr: 'M’avertir s’il est dans OMSI',
    nl: 'Waarschuw als hij in OMSI zit'
  },
  /*
   * De knoppen die de app werkelijk kan omzetten. Twee van de zes, en dat hoort
   * er met zoveel woorden bij te staan -- anders zoekt iemand zich blind naar de
   * knop bij Discord die er niet is.
   */
  'ovl.knop.uitzetten': {
    en: 'Turn this overlay off',
    de: 'Dieses Overlay ausschalten',
    fr: 'Désactiver cette superposition',
    nl: 'Deze overlay uitzetten'
  },
  'ovl.knop.aanzetten': {
    en: 'Turn this overlay on',
    de: 'Dieses Overlay einschalten',
    fr: 'Activer cette superposition',
    nl: 'Deze overlay aanzetten'
  },
  'ovl.knop.staataan': { en: 'Currently on', de: 'Steht an', fr: 'Actuellement active', nl: 'Staat nu aan' },
  'ovl.knop.staatuit': { en: 'Currently off', de: 'Steht aus', fr: 'Actuellement désactivée', nl: 'Staat nu uit' },
  'ovl.knop.onbekend': {
    en: 'Could not read the setting',
    de: 'Einstellung nicht lesbar',
    fr: 'Réglage illisible',
    nl: 'Instelling niet te lezen'
  },
  /* Steam schrijft localconfig.vdf bij het afsluiten terug over alles heen. */
  'ovl.knop.steamdraait': {
    en: 'Close Steam first — it rewrites its settings when it exits, over ours.',
    de: 'Schließe zuerst Steam — es schreibt seine Einstellungen beim Beenden über unsere.',
    fr: 'Fermez d’abord Steam : il réécrit ses réglages en quittant, par-dessus les nôtres.',
    nl: 'Sluit eerst Steam — die schrijft zijn instellingen bij het afsluiten over de onze heen.'
  },
  'ovl.knop.gedaan': {
    en: 'Done. It takes effect the next time the game starts.',
    de: 'Erledigt. Gilt ab dem nächsten Start des Spiels.',
    fr: 'Fait. Effectif au prochain démarrage du jeu.',
    nl: 'Gedaan. Het geldt vanaf de volgende keer dat het spel start.'
  },
  'ovl.knop.mislukt': {
    en: 'Did not work: {reden}',
    de: 'Hat nicht geklappt: {reden}',
    fr: 'Échec : {reden}',
    nl: 'Het lukte niet: {reden}'
  },
  /*
   * Wat er op de plek van {reden} komt. core/overlayknop.ts geeft vaste codes
   * terug; eerst kwamen die zelf in de zin ("Did not work: steam"), of de
   * Engelse foutmelding van `reg add`. Code `steam` gebruikt
   * 'ovl.knop.steamdraait'.
   */
  'ovl.knop.reden.allespellen': {
    en: 'Steam has its overlay switched off for all games. To have it in OMSI, switch it on in Steam › Settings › In-game — the app leaves that switch alone, because it applies to every game.',
    de: 'Steam hat sein Overlay für alle Spiele ausgeschaltet. Willst du es in OMSI haben, schalte es in Steam › Einstellungen › Im Spiel ein — die App lässt diesen Schalter in Ruhe, weil er für jedes Spiel gilt.',
    fr: 'Steam a désactivé son overlay pour tous les jeux. Pour l’avoir dans OMSI, réactivez-le dans Steam › Paramètres › En jeu — l’application ne touche pas à ce réglage, car il vaut pour tous les jeux.',
    nl: 'Steam heeft zijn overlay voor alle spellen uitgezet. Wil je hem in OMSI, zet hem dan aan in Steam › Instellingen › In-game — de app blijft van die schakelaar af, want hij geldt voor elk spel.'
  },
  /*
   * Het blok voor OMSI zet de app nu zelf erbij als Steam het nog niet had. Deze
   * reden komt alleen nog als het bestand van een account niet in de vorm staat
   * waarin de app het veilig kan aanvullen; dan blijft dat bestand onaangeroerd.
   */
  'ovl.knop.reden.geenblok': {
    en: 'The Steam settings file of at least one of your accounts is not laid out the way the app can safely edit, so the app left that file alone and the overlay stays on there. Do it in Steam: right-click OMSI 2 › Properties.',
    de: 'Die Steam-Einstellungsdatei von mindestens einem deiner Konten ist nicht so aufgebaut, dass die App sie sicher ändern kann. Die App hat sie darum nicht angerührt, und dort bleibt das Overlay an. Mach es in Steam: Rechtsklick auf OMSI 2 › Eigenschaften.',
    fr: 'le fichier de réglages Steam d’au moins un de vos comptes n’est pas écrit sous une forme que l’application sait modifier sans risque : elle n’y a donc pas touché, et l’overlay y reste actif. Faites-le dans Steam : clic droit sur OMSI 2 › Propriétés.',
    nl: 'het Steam-instellingenbestand van minstens één van je accounts staat niet in de vorm waarin de app het veilig kan aanpassen. Dat bestand heeft de app daarom laten staan, en daar blijft de overlay aan. Doe het in Steam: rechtsklik op OMSI 2 › Eigenschappen.'
  },
  'ovl.knop.reden.nietgevonden': {
    en: 'Steam’s settings file was not found.',
    de: 'Die Einstellungsdatei von Steam wurde nicht gefunden.',
    fr: 'le fichier de réglages de Steam est introuvable.',
    nl: 'het instellingenbestand van Steam is niet gevonden.'
  },
  'ovl.knop.reden.lezen': {
    en: 'Steam’s settings file could not be read.',
    de: 'Die Einstellungsdatei von Steam ließ sich nicht lesen.',
    fr: 'le fichier de réglages de Steam n’a pas pu être lu.',
    nl: 'het instellingenbestand van Steam was niet te lezen.'
  },
  'ovl.knop.reden.schrijven': {
    en: 'Steam’s settings file could not be written — it may be read-only or held open by another program.',
    de: 'Die Einstellungsdatei von Steam ließ sich nicht schreiben — vielleicht ist sie schreibgeschützt oder von einem anderen Programm geöffnet.',
    fr: 'le fichier de réglages de Steam n’a pas pu être écrit — il est peut-être en lecture seule ou ouvert par un autre programme.',
    nl: 'het instellingenbestand van Steam kon niet worden geschreven — misschien staat het op alleen-lezen of houdt een ander programma het open.'
  },
  'ovl.knop.reden.register': {
    en: 'Windows did not accept the change in the registry.',
    de: 'Windows hat die Änderung in der Registrierung nicht angenommen.',
    fr: 'Windows n’a pas accepté la modification dans le registre.',
    nl: 'Windows nam de wijziging in het register niet aan.'
  },
  /* Als de vraag zelf misging; de fout staat dan in het logboek (zie `handle` in main). */
  'ovl.knop.reden.fout': {
    en: 'something went wrong; the details are in the app’s log file.',
    de: 'Etwas ist schiefgelaufen; die Einzelheiten stehen im Logbuch der App.',
    fr: 'une erreur s’est produite ; les détails sont dans le journal de l’application.',
    nl: 'er ging iets mis; de details staan in het logboek van de app.'
  },
  /*
   * Waar de schakelaar met de hand staat. Eerst gaf core een vast Nederlands pad
   * mee, dat in elke taal zo in beeld kwam. Voor Steam de schakelaar van OMSI
   * zelf, want dat is ook de enige die de app omzet.
   */
  'ovl.knop.waar.steam': {
    en: 'By hand, for OMSI alone: in Steam, right-click OMSI 2 › Properties › General › “Enable the Steam Overlay while in-game”.',
    de: 'Von Hand, nur für OMSI: in Steam Rechtsklick auf OMSI 2 › Eigenschaften › Allgemein › Steam-Overlay im Spiel.',
    fr: 'À la main, pour OMSI seul : dans Steam, clic droit sur OMSI 2 › Propriétés › Général › overlay Steam en jeu.',
    nl: 'Met de hand, alleen voor OMSI: in Steam rechtsklik op OMSI 2 › Eigenschappen › Algemeen › Steam-overlay in het spel.'
  },
  'ovl.knop.waar.gamebar': {
    en: 'By hand: Windows Settings › Gaming › Xbox Game Bar.',
    de: 'Von Hand: Windows-Einstellungen › Spielen › Xbox Game Bar.',
    fr: 'À la main : Paramètres Windows › Jeux › Xbox Game Bar.',
    nl: 'Met de hand: Windows-instellingen › Gaming › Xbox Game Bar.'
  },
  /*
   * Wat de schakelaar van Steam niet doet. OMSI heeft Steam-DRM, dus Steam laadt
   * GameOverlayRenderer.dll hoe dan ook in het proces; de schakelaar stopt het
   * tekenen, niet het inhaken. Wie dat niet weet, ziet de DLL in de lijst staan
   * en denkt dat de knop niets deed.
   */
  'ovl.knop.steamdrm': {
    en: 'Steam still loads its file into OMSI — the game uses Steam DRM. The switch stops it drawing, not loading.',
    de: 'Steam lädt seine Datei trotzdem in OMSI — das Spiel nutzt Steam-DRM. Der Schalter stoppt das Zeichnen, nicht das Laden.',
    fr: 'Steam charge quand même son fichier dans OMSI — le jeu utilise le DRM Steam. Le réglage empêche l’affichage, pas le chargement.',
    nl: 'Steam laadt zijn bestand hoe dan ook in OMSI — het spel heeft Steam-DRM. De schakelaar stopt het tekenen, niet het inhaken.'
  },
  'ovl.naam.gamebar': { en: 'Xbox Game Bar', de: 'Xbox Game Bar', fr: 'Xbox Game Bar', nl: 'Xbox Game Bar' },
  'ovl.uitleg.gamebar': {
    en: 'Windows\u2019 own overlay, with background recording. The app switches all three registry values at once; one left on is enough for it to hook in.',
    de: 'Das Overlay von Windows selbst, mit Aufnahme im Hintergrund. Die App setzt alle drei Registrierungswerte zusammen; einer reicht, damit es sich einklinkt.',
    fr: 'La superposition de Windows, avec enregistrement en arrière-plan. L’application bascule les trois valeurs de registre ensemble ; une seule suffit pour qu’elle s’accroche.',
    nl: 'De overlay van Windows zelf, met opnemen op de achtergrond. De app zet alle drie de registerwaarden samen om; één die aan blijft staan is genoeg om alsnog in te haken.'
  },
  'ovl.naam.steam': {
    en: 'Steam overlay',
    de: 'Steam-Overlay',
    fr: 'Overlay Steam',
    nl: 'Steam-overlay'
  },
  'ovl.naam.discord': {
    en: 'Discord overlay',
    de: 'Discord-Overlay',
    fr: 'Overlay Discord',
    nl: 'Discord-overlay'
  },
  'ovl.naam.nvidia': {
    en: 'NVIDIA overlay',
    de: 'NVIDIA-Overlay',
    fr: 'Overlay NVIDIA',
    nl: 'NVIDIA-overlay'
  },
  'ovl.naam.rtss': {
    en: 'RivaTuner / MSI Afterburner',
    de: 'RivaTuner / MSI Afterburner',
    fr: 'RivaTuner / MSI Afterburner',
    nl: 'RivaTuner / MSI Afterburner'
  },
  'ovl.naam.obs': {
    en: 'OBS game capture',
    de: 'OBS-Spielaufnahme',
    fr: 'Capture de jeu OBS',
    nl: 'OBS-spelopname'
  },
  'ovl.naam.d3d9': {
    en: 'd3d9.dll in the OMSI folder',
    de: 'd3d9.dll im OMSI-Ordner',
    fr: 'd3d9.dll dans le dossier OMSI',
    nl: 'd3d9.dll in de OMSI-map'
  },
  'ovl.naam.opentrack': {
    en: 'opentrack / TrackIR',
    de: 'opentrack / TrackIR',
    fr: 'opentrack / TrackIR',
    nl: 'opentrack / TrackIR'
  },
  'ovl.uitleg.steam': {
    en: 'Cannot be switched off for good. Steam checks its own files at every start and puts the overlay back, and OMSI always starts through Steam. The switch in Steam does not stop it either.',
    de: 'Lässt sich nicht dauerhaft ausschalten. Steam prüft bei jedem Start seine eigenen Dateien und stellt das Overlay wieder her, und OMSI startet immer über Steam. Auch der Schalter in Steam hält es nicht ab.',
    fr: 'Impossible à désactiver durablement. Steam vérifie ses propres fichiers à chaque démarrage et remet l’overlay, et OMSI démarre toujours via Steam. L’interrupteur de Steam ne l’empêche pas non plus.',
    nl: 'Kan niet blijvend uit. Steam controleert bij elke start zijn eigen bestanden en zet de overlay terug, en OMSI start altijd via Steam. De schakelaar in Steam houdt hem ook niet tegen.'
  },
  'ovl.uitleg.discord': {
    en: 'Switch it off in Discord: Settings › Game Overlay.',
    de: 'Schalte es in Discord aus: Einstellungen › Spiel-Overlay.',
    fr: 'Désactivez-le dans Discord : Paramètres › Overlay de jeu.',
    nl: 'Zet hem uit in Discord: Instellingen › Game-overlay.'
  },
  'ovl.uitleg.nvidia': {
    en: 'Switch it off in the NVIDIA app (or GeForce Experience): Settings › in-game overlay.',
    de: 'Schalte es in der NVIDIA-App (oder GeForce Experience) aus: Einstellungen › In-Game-Overlay.',
    fr: 'Désactivez-le dans l’application NVIDIA (ou GeForce Experience) : Paramètres › overlay en jeu.',
    nl: 'Zet hem uit in de NVIDIA-app (of GeForce Experience): Instellingen › in-game-overlay.'
  },
  'ovl.uitleg.rtss': {
    en: 'Close RivaTuner Statistics Server, or add OMSI to its exceptions.',
    de: 'Beende RivaTuner Statistics Server oder setze OMSI dort auf die Ausnahmeliste.',
    fr: 'Fermez RivaTuner Statistics Server, ou ajoutez OMSI à ses exceptions.',
    nl: 'Sluit RivaTuner Statistics Server, of zet OMSI daar bij de uitzonderingen.'
  },
  'ovl.uitleg.obs': {
    en: 'Close OBS, or stop game capture for OMSI.',
    de: 'Beende OBS oder stoppe die Spielaufnahme für OMSI.',
    fr: 'Fermez OBS, ou arrêtez la capture de jeu pour OMSI.',
    nl: 'Sluit OBS, of stop de spelopname voor OMSI.'
  },
  'ovl.uitleg.d3d9': {
    en: 'A replacement for DirectX 9 next to Omsi.exe, from a graphics mod. Not an overlay, but it sits between OMSI and your graphics card.',
    de: 'Ein Ersatz für DirectX 9 neben der Omsi.exe, von einer Grafik-Mod. Kein Overlay, sitzt aber zwischen OMSI und deiner Grafikkarte.',
    fr: 'Un remplaçant de DirectX 9 à côté d’Omsi.exe, venant d’un mod graphique. Pas un overlay, mais il se place entre OMSI et votre carte graphique.',
    nl: 'Een vervanger voor DirectX 9 naast Omsi.exe, van een grafische mod. Geen overlay, maar hij zit wel tussen OMSI en je videokaart.'
  },
  'ovl.uitleg.opentrack': {
    en: 'Head tracking. You want to keep it; the app never warns about it.',
    de: 'Kopfsteuerung. Die willst du behalten; die App warnt nie davor.',
    fr: 'Suivi de la tête. Vous voulez le garder ; l’application ne l’avertit jamais.',
    nl: 'Hoofdbesturing. Die wil je houden; de app waarschuwt er nooit voor.'
  },
  'omsi.crash': {
    en: 'OMSI stopped at {tijd} without closing properly.',
    de: 'OMSI ist um {tijd} beendet worden, ohne sauber zu schließen.',
    fr: 'OMSI s’est arrêté à {tijd} sans se fermer correctement.',
    nl: 'OMSI is om {tijd} gestopt zonder netjes af te sluiten.'
  },
  'omsi.vast': {
    en: 'OMSI has not responded since {tijd}.',
    de: 'OMSI reagiert seit {tijd} nicht mehr.',
    fr: 'OMSI ne répond plus depuis {tijd}.',
    nl: 'OMSI reageert sinds {tijd} niet meer.'
  },
  'omsi.overlays': {
    en: 'Overlays that can freeze OMSI are hooked into the game: {namen}.',
    de: 'Im Spiel stecken Overlays, die OMSI hängen lassen können: {namen}.',
    fr: 'Des overlays qui peuvent bloquer OMSI sont accrochés au jeu : {namen}.',
    nl: 'In OMSI hangen overlays die het spel kunnen laten vastlopen: {namen}.'
  },
  'omsi.inHetSpel': {
    en: 'In the game were: {namen}.',
    de: 'Im Spiel steckten: {namen}.',
    fr: 'Dans le jeu se trouvaient : {namen}.',
    nl: 'In het spel zaten: {namen}.'
  },
  'omsi.herstartUitleg': {
    en: 'What you have driven so far still counts; the bus is back at the start of the duty.',
    de: 'Was du bisher gefahren bist, zählt weiter; der Bus steht wieder am Anfang des Dienstes.',
    fr: 'Ce que vous avez déjà conduit compte toujours ; le bus est de nouveau au début du service.',
    nl: 'Wat je al gereden hebt telt mee; de bus staat weer aan het begin van de dienst.'
  },
  'omsi.herstart': {
    en: 'Restart OMSI with this duty',
    de: 'OMSI mit diesem Dienst neu starten',
    fr: 'Relancer OMSI avec ce service',
    nl: 'OMSI opnieuw starten met deze dienst'
  },
  'omsi.afsluiten': {
    en: 'Close the frozen OMSI',
    de: 'Hängendes OMSI beenden',
    fr: 'Fermer l’OMSI bloqué',
    nl: 'Vastgelopen OMSI afsluiten'
  },
  'omsi.bekijken': {
    en: 'View overlays',
    de: 'Overlays ansehen',
    fr: 'Voir les overlays',
    nl: 'Overlays bekijken'
  },
  'omsi.negeren': {
    en: 'Dismiss',
    de: 'Ausblenden',
    fr: 'Ignorer',
    nl: 'Negeren'
  },
  'photos.title': {
    en: 'Pictures of your buses',
    de: 'Bilder deiner Busse',
    fr: 'Images de vos bus',
    nl: 'Plaatjes van je bussen'
  },
  'photos.syncTitle': {
    en: 'Updating bus pictures',
    de: 'Busbilder aktualisieren',
    fr: 'Mise à jour des images de bus',
    nl: 'Busplaatjes bijwerken'
  },
  'photos.intro': {
    en: 'The app draws a picture of every bus from its own 3D model, so you can see which bus and which livery you are choosing. It can do them all now in one go, or one by one whenever you open a bus.',
    de: 'Die App zeichnet von jedem Bus ein Bild aus seinem eigenen 3D-Modell, damit du bei der Auswahl siehst, welcher Bus und welche Lackierung es ist. Das geht jetzt in einem Rutsch oder einzeln, sobald du einen Bus aufrufst.',
    fr: 'L’application dessine une image de chaque bus à partir de son propre modèle 3D, pour que vous voyiez quel bus et quelle livrée vous choisissez. Elle peut toutes les faire maintenant, ou une par une quand vous ouvrez un bus.',
    nl: 'De app tekent van elke bus een plaatje uit zijn eigen 3D-model, zodat je bij het kiezen ziet welke bus en welke kleurstelling het is. Dat kan nu in één keer, of per bus zodra je hem opzoekt.'
  },
  'photos.count': {
    en: '{aantal} buses without a picture · about {minuten} min.',
    de: '{aantal} Busse ohne Bild · etwa {minuten} Min.',
    fr: '{aantal} bus sans image · environ {minuten} min',
    nl: '{aantal} bussen zonder plaatje · ongeveer {minuten} min.'
  },
  'photos.start': {
    en: 'Make them all now',
    de: 'Jetzt alle erstellen',
    fr: 'Tout faire maintenant',
    nl: 'Alles nu maken'
  },
  'photos.skip': {
    en: 'Skip',
    de: 'Überspringen',
    fr: 'Passer',
    nl: 'Overslaan'
  },
  'photos.foot': {
    en: 'You can skip this. A picture then appears when you open that bus, and “Update bus pictures” on the start screen makes all of them later – also for buses you add afterwards.',
    de: 'Du kannst das überspringen. Ein Bild erscheint dann, sobald du den Bus aufrufst, und „Busbilder aktualisieren“ auf dem Startbildschirm erstellt später alle – auch für Busse, die du danach hinzufügst.',
    fr: 'Vous pouvez passer. Une image apparaîtra quand vous ouvrirez ce bus, et « Mettre à jour les images » sur l’écran d’accueil les fera toutes plus tard – aussi pour les bus ajoutés ensuite.',
    nl: 'Je mag dit overslaan. Een plaatje komt dan zodra je de bus opzoekt, en met ‘Busplaatjes bijwerken’ op het startscherm maak je ze later alsnog allemaal – ook voor bussen die je er later bij zet.'
  },
  'photos.looking': {
    en: 'Looking which buses are there',
    de: 'Nachsehen, welche Busse da sind',
    fr: 'Recherche des bus installés',
    nl: 'Kijken welke bussen er zijn'
  },
  'photos.first': {
    en: 'The first picture is on its way',
    de: 'Das erste Bild ist unterwegs',
    fr: 'La première image arrive',
    nl: 'Het eerste plaatje komt eraan'
  },
  'photos.progress': {
    en: '{klaar} of {totaal} buses done',
    de: '{klaar} von {totaal} Bussen fertig',
    fr: '{klaar} bus sur {totaal} terminés',
    nl: '{klaar} van {totaal} bussen klaar'
  },
  'photos.rest': {
    en: 'About {minuten} min. to go',
    de: 'Noch etwa {minuten} Min.',
    fr: 'Encore environ {minuten} min',
    nl: 'Nog ongeveer {minuten} min.'
  },
  'photos.restShort': {
    en: 'Less than a minute to go',
    de: 'Noch weniger als eine Minute',
    fr: 'Moins d’une minute restante',
    nl: 'Nog minder dan een minuut'
  },
  'photos.stop': {
    en: 'Stop',
    de: 'Anhalten',
    fr: 'Arrêter',
    nl: 'Stoppen'
  },
  'photos.skipNow': {
    en: 'Skip and start now',
    de: 'Überspringen und jetzt starten',
    fr: 'Passer et commencer',
    nl: 'Overslaan en nu beginnen'
  },
  'photos.footBusy': {
    en: 'Pictures that are done stay done. If you stop, the next update carries on where this one left off.',
    de: 'Fertige Bilder bleiben erhalten. Wenn du anhältst, macht die nächste Aktualisierung dort weiter.',
    fr: 'Les images terminées sont gardées. Si vous arrêtez, la prochaine mise à jour reprend là où celle-ci s’est arrêtée.',
    nl: 'Wat klaar is blijft klaar. Stop je, dan gaat de volgende keer bijwerken verder waar deze ophield.'
  },
  'photos.done': {
    en: 'Done: {gemaakt} new pictures.',
    de: 'Fertig: {gemaakt} neue Bilder.',
    fr: 'Terminé : {gemaakt} nouvelles images.',
    nl: 'Klaar: {gemaakt} nieuwe plaatjes.'
  },
  'photos.doneNone': {
    en: 'No new pictures this time.',
    de: 'Diesmal keine neuen Bilder.',
    fr: 'Aucune nouvelle image cette fois.',
    nl: 'Er kwamen deze keer geen nieuwe plaatjes bij.'
  },
  'photos.stopped': {
    en: 'Stopped after {gemaakt} new pictures. The rest follows at the next update.',
    de: 'Angehalten nach {gemaakt} neuen Bildern. Der Rest folgt bei der nächsten Aktualisierung.',
    fr: 'Arrêté après {gemaakt} nouvelles images. Le reste suivra à la prochaine mise à jour.',
    nl: 'Gestopt na {gemaakt} nieuwe plaatjes. De rest volgt bij de volgende keer bijwerken.'
  },
  'photos.nothing': {
    en: 'Every bus already has a picture.',
    de: 'Jeder Bus hat schon ein Bild.',
    fr: 'Chaque bus a déjà une image.',
    nl: 'Alle bussen hebben al een plaatje.'
  },
  'photos.failed': {
    en: '{aantal} buses did not work out this time; they get another go at the next update.',
    de: '{aantal} Busse haben diesmal nicht geklappt; sie kommen bei der nächsten Aktualisierung wieder dran.',
    fr: '{aantal} bus n’ont pas marché cette fois ; ils seront réessayés à la prochaine mise à jour.',
    nl: '{aantal} bussen lukten deze keer niet; die komen bij de volgende keer bijwerken weer aan de beurt.'
  },
  'photos.none': {
    en: '{zonder} buses get no picture: their maker protected the model, or it cannot be read. They keep the icon.',
    de: '{zonder} Busse bekommen kein Bild: Ihr Hersteller hat das Modell geschützt, oder es ist nicht lesbar. Sie behalten das Symbol.',
    fr: '{zonder} bus n’auront pas d’image : leur auteur a protégé le modèle, ou il est illisible. Ils gardent l’icône.',
    nl: '{zonder} bussen krijgen geen plaatje: de maker heeft het model beveiligd, of het is niet te lezen. Die houden het icoon.'
  },
  'photos.continue': {
    en: 'Continue',
    de: 'Weiter',
    fr: 'Continuer',
    nl: 'Verder'
  },
  'photos.sync': {
    en: 'Update bus pictures',
    de: 'Busbilder aktualisieren',
    fr: 'Mettre à jour les images',
    nl: 'Busplaatjes bijwerken'
  },
  'photos.syncBusy': {
    en: 'Pictures: {klaar} of {totaal}',
    de: 'Bilder: {klaar} von {totaal}',
    fr: 'Images : {klaar} sur {totaal}',
    nl: 'Plaatjes: {klaar} van {totaal}'
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
  // ---------- de meelopende dienstregeling ----------
  'live.clock': { en: 'In the game', de: 'Im Spiel', fr: 'Dans le jeu', nl: 'In het spel' },
  'live.delay': { en: 'Delay', de: 'Verspätung', fr: 'Retard', nl: 'Vertraging' },
  'live.onboard': { en: 'On board', de: 'An Bord', fr: 'À bord', nl: 'Aan boord' },
  'live.speed': { en: 'Speed', de: 'Tempo', fr: 'Vitesse', nl: 'Snelheid' },
  'live.line': { en: 'line {line}', de: 'Linie {line}', fr: 'ligne {line}', nl: 'lijn {line}' },
  'live.route': { en: 'route {route}', de: 'Route {route}', fr: 'route {route}', nl: 'route {route}' },
  'live.layover': {
    en: '{minutes} min break before this trip',
    de: '{minutes} Min Pause vor dieser Fahrt',
    fr: '{minutes} min de pause avant ce trajet',
    nl: '{minutes} min pauze voor deze rit'
  },
  'start.presetFailed': {
    en: 'The app could not set up OMSI’s start screen — pick {map} and the situation OMSI Enhancer yourself.',
    de: 'Der Startbildschirm von OMSI ließ sich nicht vorbereiten — wähle {map} und die Situation OMSI Enhancer selbst.',
    fr: 'L’écran de démarrage d’OMSI n’a pas pu être préparé — choisissez {map} et la situation OMSI Enhancer vous-même.',
    nl: 'Het startscherm van OMSI kon niet worden klaargezet — kies zelf {map} en de situatie OMSI Enhancer.'
  },
  /*
   * OMSI draait al, en dan is klaarzetten zinloos: het spel leest zijn
   * startscherm alleen bij het opstarten. De vraag komt vooraf, want als je het
   * spel toch opnieuw gaat starten wil je dat weten voordat de dienst loopt.
   */
  /*
   * Bij het openen van de app, als er nog een dienst openstond. De app kwam daar
   * vanzelf op uit, en dat is handig als je verder wilt en hinderlijk in elk
   * ander geval. "Verlaten" breekt niets af -- de dienst blijft gewoon staan.
   */
  /* Op het rijscherm: eruit, zonder de dienst aan te raken. */
  'run.home': {
    en: 'To the main menu',
    de: 'Zum Hauptmenü',
    fr: 'Vers le menu principal',
    nl: 'Naar het hoofdmenu'
  },
  'hervat.title': {
    en: 'You had a duty open',
    de: 'Du hattest einen Dienst offen',
    fr: 'Un service était en cours',
    nl: 'Je had nog een dienst openstaan'
  },
  'hervat.body': {
    en: 'Line {line} on {map} is still running. Carry on with it, or leave it for now? It stays in your profile either way.',
    de: 'Linie {line} auf {map} läuft noch. Weiterfahren oder vorerst liegen lassen? Der Dienst bleibt so oder so in deinem Profil.',
    fr: 'La ligne {line} sur {map} est toujours en cours. Reprendre, ou laisser pour l’instant ? Le service reste dans votre profil.',
    nl: 'Lijn {line} op {map} loopt nog. Verder rijden, of voor nu laten staan? Hij blijft hoe dan ook in je profiel.'
  },
  'hervat.resume': {
    en: 'Carry on driving',
    de: 'Weiterfahren',
    fr: 'Reprendre',
    nl: 'Verder rijden'
  },
  'hervat.leave': {
    en: 'Leave it for now',
    de: 'Vorerst liegen lassen',
    fr: 'Laisser pour l’instant',
    nl: 'Laat maar staan'
  },
  'draait.title': {
    en: 'OMSI is already running',
    de: 'OMSI läuft schon',
    fr: 'OMSI tourne déjà',
    nl: 'OMSI draait al'
  },
  'draait.body': {
    en: 'The game reads its start screen only when it launches, so setting up {map} would not reach this session. Two ways on:',
    de: 'Das Spiel liest seinen Startbildschirm nur beim Start, ein Vorbereiten von {map} erreicht diese Sitzung also nicht. Zwei Wege:',
    fr: 'Le jeu ne lit son écran de démarrage qu’au lancement : préparer {map} n’atteindrait pas cette session. Deux options :',
    nl: 'Het spel leest zijn startscherm alleen bij het opstarten, dus {map} klaarzetten bereikt deze sessie niet meer. Twee wegen verder:'
  },
  'draait.rideName': { en: 'Ride along', de: 'Mitfahren', fr: 'Embarquer', nl: 'Meerijden' },
  'draait.rideWhat': {
    en: 'The duty starts now and the overlay opens. It tells you which map, which tour and which codes to pick in the game yourself.',
    de: 'Der Dienst beginnt jetzt und das Overlay geht auf. Es sagt dir, welche Karte, welchen Umlauf und welche Codes du im Spiel selbst wählst.',
    fr: 'Le service démarre et la superposition s’ouvre. Elle vous indique la carte, la rotation et les codes à choisir vous-même dans le jeu.',
    nl: 'De dienst begint nu en de overlay gaat open. Die vertelt welke kaart, welke omloop en welke codes je in het spel zelf kiest.'
  },
  'draait.prepName': {
    en: 'Set it up anyway',
    de: 'Trotzdem vorbereiten',
    fr: 'Préparer quand même',
    nl: 'Toch klaarzetten'
  },
  'draait.prepWhat': {
    en: 'Everything is written to the start screen. Close OMSI yourself and launch it again, and it is all preset.',
    de: 'Alles wird in den Startbildschirm geschrieben. Beende OMSI selbst und starte es neu, dann steht alles bereit.',
    fr: 'Tout est écrit dans l’écran de démarrage. Fermez OMSI vous-même et relancez-le : tout sera prêt.',
    nl: 'Alles wordt in het startscherm gezet. Sluit OMSI zelf af en start het opnieuw, dan staat alles klaar.'
  },
  'draait.ride': { en: 'Ride along', de: 'Mitfahren', fr: 'Embarquer', nl: 'Meerijden' },
  'draait.prep': {
    en: 'Set up anyway',
    de: 'Trotzdem vorbereiten',
    fr: 'Préparer quand même',
    nl: 'Toch klaarzetten'
  },
  'draait.back': { en: 'Not yet', de: 'Noch nicht', fr: 'Pas encore', nl: 'Nog niet' },
  /* Op het rijscherm, nadat je voor meerijden koos. */
  'start.riding': {
    en: 'You are riding along in the running game. Nothing was set up: pick the map and the tour in OMSI yourself — the overlay says which.',
    de: 'Du fährst im laufenden Spiel mit. Es wurde nichts vorbereitet: Wähle Karte und Umlauf in OMSI selbst -- das Overlay sagt welche.',
    fr: 'Vous embarquez dans la partie en cours. Rien n’a été préparé : choisissez la carte et la rotation dans OMSI -- la superposition vous le dit.',
    nl: 'Je rijdt mee in het spel dat al draait. Er is niets klaargezet: kies de kaart en de omloop zelf in OMSI -- de overlay zegt welke.'
  },
  /* Op de busstap, voordat je op START drukt. */
  'app.omsiDraaitAl': {
    en: 'OMSI is already running. Starting will ask whether you want to ride along in it or set things up for a fresh launch.',
    de: 'OMSI läuft bereits. Beim Starten wird gefragt, ob du mitfahren oder für einen Neustart vorbereiten willst.',
    fr: 'OMSI tourne déjà. Au démarrage, il vous sera demandé si vous voulez embarquer ou préparer un nouveau lancement.',
    nl: 'OMSI draait al. Bij het starten vraagt de app of je meerijdt of liever klaarzet voor een verse start.'
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
  // Het klaarzetten lukte wel; alleen het spel kwam niet op (UAC geweigerd, geen Omsi.exe).
  'start.notLaunched': {
    en: 'OMSI did not start. Everything is set up: try again, or start the game yourself.',
    de: 'OMSI ist nicht gestartet. Alles ist eingerichtet: versuch es noch einmal oder starte das Spiel selbst.',
    fr: 'OMSI n’a pas démarré. Tout est prêt : réessayez, ou lancez le jeu vous-même.',
    nl: 'OMSI is niet opgestart. Alles staat klaar: probeer het opnieuw, of start het spel zelf.'
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
  'set.performance_realreflexions': { en: 'Real-time reflections', de: 'Echtzeit-Spiegelungen', fr: 'Reflets en temps réel', nl: 'Echte spiegelingen' },
  'set.performance_realreflexions.hint': {
    en: 'Mirrors and windows draw the world a second time. Inside the bus this is the heaviest setting of all; "economy" refreshes them less often and often gains a lot.',
    de: 'Spiegel und Scheiben zeichnen die Umgebung ein zweites Mal. Im Bus ist das die schwerste Einstellung; „sparsam“ aktualisiert seltener und bringt oft viel.',
    fr: 'Les rétroviseurs et les vitres redessinent le décor. Dans le bus, c’est le réglage le plus lourd ; « économique » les rafraîchit moins souvent et fait souvent gagner beaucoup.',
    nl: 'Spiegels en ruiten tekenen de omgeving nog een keer. In de bus is dit de zwaarste instelling; "zuinig" ververst ze minder vaak en scheelt vaak veel.'
  },
  'set.performance_realreflexions.economy': { en: 'Economy', de: 'Sparsam', fr: 'Économique', nl: 'Zuinig' },
  'set.performance_realreflexions.full': { en: 'Full', de: 'Voll', fr: 'Complet', nl: 'Volledig' },
  'set.performance_minObjSizeRefl': { en: 'Smallest object in reflections', de: 'Kleinstes Objekt in Spiegelungen', fr: 'Plus petit objet dans les reflets', nl: 'Kleinste object in spiegelingen' },
  'set.performance_minObjSizeRefl.hint': {
    en: 'Objects smaller than this are left out of mirrors and windows. Higher is faster.',
    de: 'Kleinere Objekte fehlen in Spiegeln und Scheiben. Höher ist schneller.',
    fr: 'Les objets plus petits sont omis des rétroviseurs et des vitres. Plus haut, plus rapide.',
    nl: 'Kleinere objecten laat OMSI weg uit spiegels en ruiten. Hoger is sneller.'
  },
  'set.performance_dyn_redrefl': { en: 'Cut back reflections below (fps)', de: 'Spiegelungen reduzieren unter (FPS)', fr: 'Réduire les reflets sous (i/s)', nl: 'Spiegelingen inkorten onder (fps)' },
  'set.performance_dyn_redrefl.hint': {
    en: 'When the frame rate drops below this, OMSI shortens how far reflections reach, by itself.',
    de: 'Fällt die Bildrate darunter, verkürzt OMSI selbst die Reichweite der Spiegelungen.',
    fr: 'Si la fluidité passe en dessous, OMSI réduit de lui-même la portée des reflets.',
    nl: 'Zakt de beeldsnelheid hieronder, dan kort OMSI zelf in hoe ver spiegelingen reiken.'
  },
  'set.no_rain_refl': { en: 'No reflections on wet roads', de: 'Keine Spiegelungen auf nasser Straße', fr: 'Pas de reflets sur route mouillée', nl: 'Geen spiegelingen op natte weg' },
  'set.no_rain_refl.hint': {
    en: 'In rain, the road mirrors the world as well. Switching that off saves a lot.',
    de: 'Bei Regen spiegelt auch die Straße die Umgebung. Das auszuschalten spart viel.',
    fr: 'Sous la pluie, la route reflète aussi le décor. Le désactiver fait gagner beaucoup.',
    nl: 'Bij regen spiegelt ook de weg de omgeving. Dat uitzetten scheelt veel.'
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
  'run.loading': {
    en: 'OMSI is running and loading the map. Once your bus is there, the timetable follows along.',
    de: 'OMSI läuft und lädt die Karte. Sobald dein Bus da ist, läuft der Fahrplan mit.',
    fr: 'OMSI est lancé et charge la carte. Dès que votre bus est là, l’horaire suit.',
    nl: 'OMSI draait en laadt de kaart. Zodra je bus er staat, loopt de dienstregeling mee.'
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
  /*
    Een waarschuwing die pas verschijnt als hij ergens op slaat: OMSI draaide de
    vorige keer op volledig scherm, en daar gaat de overlay slecht mee samen.
  */
  'app.fullscreenFixed': {
    en: 'OMSI ran in fullscreen last time. The app will start it in a window from now on, so the overlay does not take the picture down with it.',
    de: 'OMSI lief zuletzt im Vollbild. Die App startet es ab jetzt im Fenster, damit das Overlay nicht das Bild mitnimmt.',
    fr: 'OMSI a tourné en plein écran la dernière fois. L’application le lancera désormais en fenêtre, pour que la superposition n’emporte pas l’image.',
    nl: 'OMSI draaide de vorige keer op volledig scherm. De app start hem voortaan in een venster, zodat de overlay het beeld niet meeneemt.'
  },
  'done.smooth': {
    en: 'Duty booked: {km} km, driven smoothly.',
    de: 'Dienst gebucht: {km} km, ruhig gefahren.',
    fr: 'Service enregistré : {km} km, conduite souple.',
    nl: 'Dienst geboekt: {km} km, vloeiend gereden.'
  },
  'done.harsh': {
    en: 'Duty booked: {km} km, braking hard {count} times.',
    de: 'Dienst gebucht: {km} km, {count}× hart gebremst.',
    fr: 'Service enregistré : {km} km, {count} freinages brusques.',
    nl: 'Dienst geboekt: {km} km, {count}× hard geremd.'
  },
  'done.collision': {
    en: '{km} km driven, with {count} collisions.',
    de: '{km} km gefahren, mit {count} Zusammenstößen.',
    fr: '{km} km parcourus, avec {count} collisions.',
    nl: '{km} km gereden, met {count} aanrijdingen.'
  },
  'done.nothing': {
    en: 'Duty booked. OMSI was not running, so there was nothing to measure.',
    de: 'Dienst gebucht. OMSI lief nicht, also gab es nichts zu messen.',
    fr: 'Service enregistré. OMSI ne tournait pas, il n’y avait rien à mesurer.',
    nl: 'Dienst geboekt. OMSI draaide niet, dus er viel niets te meten.'
  },
  'omsi.findTitle': {
    en: 'Where is OMSI 2?',
    de: 'Wo liegt OMSI 2?',
    fr: 'Où se trouve OMSI 2 ?',
    nl: 'Waar staat OMSI 2?'
  },
  'omsi.findIntro': {
    en: 'Everything the app does starts here: the maps, the buses, the timetables. Tell it once which OMSI 2 you drive.',
    de: 'Alles, was die App tut, fängt hier an: Karten, Busse, Fahrpläne. Sag ihr einmal, welches OMSI 2 du fährst.',
    fr: 'Tout ce que fait l’application part d’ici : les cartes, les bus, les horaires. Dites-lui une fois quel OMSI 2 vous utilisez.',
    nl: 'Alles wat de app doet begint hier: de kaarten, de bussen, de dienstregelingen. Zeg eenmaal welke OMSI 2 jij rijdt.'
  },
  'omsi.findButton': {
    en: 'Choose the OMSI 2 folder',
    de: 'OMSI-2-Ordner wählen',
    fr: 'Choisir le dossier OMSI 2',
    nl: 'Kies de map van OMSI 2'
  },
  'omsi.findConfirm': {
    en: 'Yes, that is it',
    de: 'Ja, das ist er',
    fr: 'Oui, c’est bien lui',
    nl: 'Ja, dat is hem'
  },
  'omsi.findOther': {
    en: 'Choose another folder',
    de: 'Anderen Ordner wählen',
    fr: 'Choisir un autre dossier',
    nl: 'Andere map kiezen'
  },
  'omsi.findFound': {
    en: 'Found here',
    de: 'Hier gefunden',
    fr: 'Trouvé ici',
    nl: 'Hier gevonden'
  },
  'omsi.findNothing': {
    en: 'The app could not find OMSI 2 by itself. Point at the folder that holds Omsi.exe — anything nearby will do, the app looks around.',
    de: 'Die App hat OMSI 2 nicht selbst gefunden. Zeig auf den Ordner mit der Omsi.exe — irgendetwas in der Nähe genügt, die App schaut sich um.',
    fr: 'L’application n’a pas trouvé OMSI 2 toute seule. Indiquez le dossier contenant Omsi.exe — un dossier voisin suffit, l’application cherche autour.',
    nl: 'De app heeft OMSI 2 niet zelf gevonden. Wijs de map aan waar Omsi.exe in staat — iets in de buurt mag ook, de app kijkt om zich heen.'
  },
  /* Wie de kaartenmap aanwijst heeft de installatie gevonden, niet gemist. */
  'omsi.findInside': {
    en: 'Found inside the folder you picked.',
    de: 'Im gewählten Ordner gefunden.',
    fr: 'Trouvé dans le dossier choisi.',
    nl: 'Gevonden in de map die je aanwees.'
  },
  'omsi.findAbove': {
    en: 'Found one level up from the folder you picked.',
    de: 'Eine Ebene über dem gewählten Ordner gefunden.',
    fr: 'Trouvé un niveau au-dessus du dossier choisi.',
    nl: 'Gevonden boven de map die je aanwees.'
  },
  'omsi.findNoMaps': {
    en: 'This installation has no maps yet, so there is nothing to drive on. Install a map and press “Check installed folders”.',
    de: 'In dieser Installation stehen noch keine Karten, also gibt es nichts zu fahren. Installiere eine Karte und drücke „Installierte Ordner prüfen“.',
    fr: 'Cette installation n’a pas encore de cartes, il n’y a donc rien à conduire. Installez une carte puis appuyez sur « Vérifier les dossiers installés ».',
    nl: 'In deze installatie staan nog geen kaarten, dus valt er niets te rijden. Zet een kaart neer en druk op "Controleer geïnstalleerde mappen".'
  },
  'omsi.findFoot': {
    en: 'Steam, Aerosoft box, a folder you moved yourself — all fine. The app only needs to know which one you drive.',
    de: 'Steam, Aerosoft-Box, ein selbst verschobener Ordner — alles recht. Die App muss nur wissen, welche du fährst.',
    fr: 'Steam, boîte Aerosoft, un dossier déplacé à la main — tout convient. L’application doit seulement savoir lequel vous utilisez.',
    nl: 'Steam, de doosversie, een map die je zelf hebt verplaatst — allemaal goed. De app hoeft alleen te weten welke jij rijdt.'
  },
  'omsi.findWrong': {
    en: 'No Omsi.exe in that folder. It is usually called "OMSI 2" and holds Omsi.exe next to a "maps" folder.',
    de: 'In diesem Ordner liegt keine Omsi.exe. Er heißt meist "OMSI 2" und enthält Omsi.exe neben einem Ordner "maps".',
    fr: 'Pas de Omsi.exe dans ce dossier. Il s’appelle généralement « OMSI 2 » et contient Omsi.exe à côté d’un dossier « maps ».',
    nl: 'Geen Omsi.exe in die map. Hij heet meestal "OMSI 2" en bevat Omsi.exe naast een map "maps".'
  },
  'app.windowed': {
    en: 'Start OMSI in a window',
    de: 'OMSI im Fenster starten',
    fr: 'Lancer OMSI en fenêtre',
    nl: 'OMSI in een venster starten'
  },
  'app.fullscreen': {
    en: 'OMSI ran in fullscreen last time. The overlay then sits on top of a game that claims the screen exclusively, which can leave the picture black. Switch OMSI to windowed or borderless.',
    de: 'OMSI lief zuletzt im Vollbild. Das Overlay liegt dann über einem Spiel, das den Bildschirm exklusiv beansprucht -- das kann ein schwarzes Bild geben. Stell OMSI auf Fenster oder randloses Fenster.',
    fr: 'OMSI a tourné en plein écran la dernière fois. La superposition se place alors au-dessus d un jeu qui monopolise l écran, ce qui peut donner une image noire. Passez OMSI en fenêtre ou fenêtre sans bordure.',
    nl: 'OMSI draaide de vorige keer op volledig scherm. De overlay ligt dan over een spel dat het scherm exclusief opeist, en dat kan een zwart beeld geven. Zet OMSI op venster of randloos venster.'
  },
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
  'ovl.loading': {
    en: 'OMSI is running — loading the map…',
    de: 'OMSI läuft — die Karte lädt…',
    fr: 'OMSI est lancé — chargement de la carte…',
    nl: 'OMSI draait — de kaart laadt…'
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
    en: 'The duty is selected in OMSI. Now key line {line} and route {route} into the IBIS — the route says which direction, so it differs on the way back. This screen disappears by itself once it is in.',
    de: 'Der Dienst ist in OMSI gewählt. Jetzt Linie {line} und Route {route} ins IBIS tippen -- die Route sagt die Richtung, zurück ist sie anders. Dieses Fenster verschwindet von allein, sobald es steht.',
    fr: 'Le service est sélectionné dans OMSI. Saisissez la ligne {line} et la route {route} sur l’IBIS — la route indique le sens, elle diffère au retour. Cet écran disparaît tout seul une fois saisi.',
    nl: 'De dienst staat gekozen in OMSI. Toets nu lijn {line} en route {route} in op de IBIS — de route zegt de richting, dus terug is hij anders. Dit scherm gaat vanzelf weg zodra het erin staat.'
  },
  /*
    Was "IBIS ingevoerd -- start de rit", en dat las als een opdracht: mensen
    dachten dat de app wachtte tot zij op die knop drukten. Sinds de app het
    zelf ziet is hij alleen nog de uitweg voor bussen die het niet doorgeven.
  */
  'ovl.ibisDone': {
    en: 'Not happening by itself? Start anyway',
    de: 'Geht nicht von allein? Trotzdem beginnen',
    fr: 'Rien ne se passe ? Commencer quand même',
    nl: 'Gaat het niet vanzelf? Begin toch'
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
  'advice.aanrijding': {
    en: '{count} collisions this duty.',
    de: '{count} Zusammenstöße in diesem Dienst.',
    fr: '{count} collisions durant ce service.',
    nl: '{count} aanrijdingen deze dienst.'
  },
  'advice.tank': {
    en: 'The tank is nearly empty.',
    de: 'Der Tank ist fast leer.',
    fr: 'Le réservoir est presque vide.',
    nl: 'De tank is bijna leeg.'
  },
  /*
   * Geen smaakkwestie maar een regel: §20 StVO geeft een bus die de halte
   * verlaat voorrang, en alleen als hij richting aangeeft.
   */
  'advice.knipperen': {
    en: 'Pulling away from the stop without indicating.',
    de: 'Ohne Blinker von der Haltestelle angefahren.',
    fr: 'Départ de l’arrêt sans clignotant.',
    nl: 'Zonder richting aan te geven van de halte weggereden.'
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
  'days.sun': { en: 'Sunday', de: 'Sonntag', fr: 'dimanche', nl: 'zondag' },

  /*
   * Het opzetscherm. De stappen staan in kapitalen op het scherm, maar niet in
   * de tekst zelf: Duits kent hoofdletters met betekenis, en een taal die je in
   * de opmaak schreeuwt kun je later niet meer normaal zetten.
   */
  /*
   * HET CHAUFFEURSOVERZICHT
   *
   * Cijfers die de app al bijhield en nergens teruggaf. De woorden zijn die van
   * het vak waar het over gaat -- dienst, halte, vertraging -- en niet die van
   * een spel dat punten uitdeelt.
   */
  'prof.title': { en: 'Your record', de: 'Deine Bilanz', fr: 'Votre parcours', nl: 'Jouw staat van dienst' },
  'prof.intro': {
    en: 'Everything the logbook kept, from the first duty to the last.',
    de: 'Alles, was das Fahrtenbuch festgehalten hat, vom ersten Dienst bis zum letzten.',
    fr: 'Tout ce que le carnet de bord a retenu, du premier service au dernier.',
    nl: 'Alles wat het logboek heeft bijgehouden, van de eerste dienst tot de laatste.'
  },
  'prof.open': { en: 'Your record', de: 'Bilanz', fr: 'Parcours', nl: 'Staat van dienst' },
  'prof.since': { en: 'Driving since {date}', de: 'Fährt seit {date}', fr: 'Au volant depuis le {date}', nl: 'Chauffeur sinds {date}' },
  'prof.toNext': { en: 'on the way to {rank}', de: 'unterwegs zu {rank}', fr: 'en route vers {rank}', nl: 'op weg naar {rank}' },
  'prof.empty': {
    en: 'Nothing driven yet. Complete a duty and it appears here: hours, kilometres, punctuality, and how you drove.',
    de: 'Noch nichts gefahren. Schließe einen Dienst ab, dann steht es hier: Stunden, Kilometer, Pünktlichkeit und wie du gefahren bist.',
    fr: 'Rien de conduit pour l’instant. Terminez un service et tout apparaît ici : heures, kilomètres, ponctualité et votre conduite.',
    nl: 'Nog niets gereden. Rond een dienst af, dan staat het hier: uren, kilometers, stiptheid en hoe je reed.'
  },
  'prof.staffNumber': { en: 'Staff number', de: 'Personalnummer', fr: 'Matricule', nl: 'Personeelsnummer' },
  'prof.pin': { en: 'PIN', de: 'PIN', fr: 'Code', nl: 'Pincode' },
  'prof.signonWhy': {
    en: 'You sign on with these on the phone in the overlay, before your duty starts.',
    de: 'Damit meldest du dich am Telefon im Overlay an, bevor dein Dienst beginnt.',
    fr: 'C’est avec cela que vous prenez votre service sur le téléphone de la superposition.',
    nl: 'Hiermee meld je je aan op de telefoon in de overlay, voordat je dienst begint.'
  },
  /*
   * De dienstpas: het venstertje dat de gegevens eenmalig laat zien. De toon is
   * die van een remise die je aanneemt, niet die van een app die iets meldt.
   */
  'pas.title': {
    en: 'Your staff number',
    de: 'Deine Personalnummer',
    fr: 'Votre matricule',
    nl: 'Je personeelsnummer'
  },
  'pas.body': {
    en: 'Welcome aboard, {driver}. The depot has taken you on; these are your details. You sign on with them on the phone in the overlay, before every duty.',
    de: 'Willkommen an Bord, {driver}. Der Betriebshof hat dich eingestellt; das sind deine Daten. Damit meldest du dich vor jedem Dienst am Telefon im Overlay an.',
    fr: 'Bienvenue, {driver}. Le dépôt vous a engagé ; voici vos informations. Vous prenez votre service avec elles sur le téléphone de la superposition.',
    nl: 'Welkom bij de club, {driver}. De remise heeft je aangenomen; dit zijn je gegevens. Hiermee meld je je voor elke dienst aan op de telefoon in de overlay.'
  },
  'pas.where': {
    en: 'Forgotten them? They stay on your service record — you never have to remember them.',
    de: 'Vergessen? Sie stehen in deiner Dienstakte -- auswendig lernen musst du sie nie.',
    fr: 'Oublies ? Ils restent sur votre feuille de service -- inutile de les retenir.',
    nl: 'Kwijt? Ze blijven in je staat van dienst staan -- onthouden hoeft dus nooit.'
  },
  'pas.show': {
    en: 'Show me where',
    de: 'Zeig mir wo',
    fr: 'Montrez-moi où',
    nl: 'Laat zien waar'
  },
  'pas.ok': { en: 'Noted', de: 'Notiert', fr: 'Noté', nl: 'Genoteerd' },
  'prof.duties': { en: 'Duties', de: 'Dienste', fr: 'Services', nl: 'Diensten' },
  'prof.behindWheel': { en: 'At the wheel', de: 'Am Steuer', fr: 'Au volant', nl: 'Achter het stuur' },
  'prof.driven': { en: 'Driven', de: 'Gefahren', fr: 'Parcourus', nl: 'Gereden' },
  'prof.stops': { en: 'Stops served', de: 'Haltestellen', fr: 'Arrêts desservis', nl: 'Haltes aangedaan' },
  'prof.passengers': { en: 'Tickets sold', de: 'Fahrscheine', fr: 'Billets vendus', nl: 'Kaartjes verkocht' },
  'prof.busloads': {
    en: 'enough to fill {count} buses',
    de: 'genug für {count} volle Busse',
    fr: 'de quoi remplir {count} bus',
    nl: 'genoeg voor {count} volle bussen'
  },
  'prof.noKm': {
    en: 'The odometer gave nothing usable on these duties',
    de: 'Der Kilometerzähler gab bei diesen Diensten nichts Brauchbares',
    fr: 'Le compteur n’a rien donné d’exploitable sur ces services',
    nl: 'De kilometerteller gaf op deze diensten niets bruikbaars'
  },
  'prof.earned': { en: 'Earned', de: 'Verdient', fr: 'Gagné', nl: 'Verdiend' },
  'prof.perHour': { en: '€ {amount} per hour', de: '{amount} € pro Stunde', fr: '{amount} € de l’heure', nl: '€ {amount} per uur' },
  'prof.punctual': { en: 'Punctuality', de: 'Pünktlichkeit', fr: 'Ponctualité', nl: 'Stiptheid' },
  'prof.early': { en: 'Early', de: 'Zu früh', fr: 'En avance', nl: 'Te vroeg' },
  'prof.onTime': { en: 'On time', de: 'Pünktlich', fr: 'À l’heure', nl: 'Op tijd' },
  'prof.late': { en: 'Late', de: 'Verspätet', fr: 'En retard', nl: 'Te laat' },
  'prof.avgDelay': {
    en: 'On average {minutes} min off the timetable',
    de: 'Im Schnitt {minutes} Min vom Fahrplan',
    fr: 'En moyenne {minutes} min d’écart avec l’horaire',
    nl: 'Gemiddeld {minutes} min van de dienstregeling'
  },
  /* Eerlijk zijn over waarover een gemiddelde gaat als niet elke dienst meetelt. */
  'prof.ofDuties': {
    en: 'measured on {count} of {total} duties',
    de: 'gemessen an {count} von {total} Diensten',
    fr: 'mesuré sur {count} des {total} services',
    nl: 'gemeten over {count} van de {total} diensten'
  },
  'prof.style': { en: 'How you drive', de: 'Wie du fährst', fr: 'Votre conduite', nl: 'Hoe je rijdt' },
  'prof.harsh': {
    en: 'Harsh braking and pulling away, per 100 km',
    de: 'Hartes Bremsen und Anfahren, pro 100 km',
    fr: 'Freinages et démarrages brusques, par 100 km',
    nl: 'Hard remmen en optrekken, per 100 km'
  },
  'prof.collisions': { en: 'Collisions', de: 'Zusammenstöße', fr: 'Collisions', nl: 'Aanrijdingen' },
  'prof.clean': { en: 'Since the last one', de: 'Seit dem letzten', fr: 'Depuis la dernière', nl: 'Sinds de laatste' },
  'prof.fuel': { en: 'Tanks used up', de: 'Verbrauchte Tanks', fr: 'Réservoirs consommés', nl: 'Tankinhouden verbruikt' },
  'prof.records': { en: 'Records', de: 'Bestwerte', fr: 'Records', nl: 'Records' },
  'prof.longest': { en: 'Longest duty', de: 'Längster Dienst', fr: 'Service le plus long', nl: 'Langste dienst' },
  'prof.furthest': { en: 'Furthest', de: 'Weiteste Fahrt', fr: 'Plus longue distance', nl: 'Verste rit' },
  'prof.busiest': { en: 'Busiest duty', de: 'Vollster Dienst', fr: 'Service le plus chargé', nl: 'Drukste dienst' },
  'prof.best': { en: 'Closest to the timetable', de: 'Am nächsten am Fahrplan', fr: 'Au plus près de l’horaire', nl: 'Dichtst bij de dienstregeling' },
  'prof.favMaps': { en: 'Where you drive', de: 'Wo du fährst', fr: 'Où vous conduisez', nl: 'Waar je rijdt' },
  'prof.favBuses': { en: 'What you drive', de: 'Was du fährst', fr: 'Ce que vous conduisez', nl: 'Waarmee je rijdt' },
  'prof.when': { en: 'When you finish a duty', de: 'Wann du Dienstschluss machst', fr: 'Quand vous terminez un service', nl: 'Wanneer je een dienst afrondt' },
  'prof.atHour': {
    en: '{count} duties around {hour}:00',
    de: '{count} Dienste gegen {hour}:00 Uhr',
    fr: '{count} services vers {hour}h00',
    nl: '{count} diensten rond {hour}:00'
  },
  'prof.licences': { en: 'Your licences', de: 'Deine Lizenzen', fr: 'Vos permis', nl: 'Je vergunningen' },
  'prof.score': { en: 'Scored {score}', de: 'Note {score}', fr: 'Note {score}', nl: 'Cijfer {score}' },
  'prof.recent': { en: 'Last duties', de: 'Letzte Dienste', fr: 'Derniers services', nl: 'Laatste diensten' },
  'setup.step.profile': { en: 'Profile', de: 'Profil', fr: 'Profil', nl: 'Profiel' },
  'setup.step.mode': { en: 'Mode', de: 'Modus', fr: 'Mode', nl: 'Modus' },
  'setup.step.map': { en: 'Map', de: 'Karte', fr: 'Carte', nl: 'Kaart' },
  'setup.step.line': { en: 'Line', de: 'Linie', fr: 'Ligne', nl: 'Lijn' },
  'setup.step.licence': { en: 'Licence', de: 'Lizenz', fr: 'Permis', nl: 'Vergunning' },
  'setup.step.duty': { en: 'Duty', de: 'Dienst', fr: 'Service', nl: 'Dienst' },
  /* Bij vrij rijden staat op die plek in de reeks geen dienst maar je eigen rit. */
  'setup.step.free': { en: 'Drive', de: 'Fahrt', fr: 'Trajet', nl: 'Rit' },
  'setup.step.bus': { en: 'Bus', de: 'Bus', fr: 'Bus', nl: 'Bus' },
  /* De laatste stap, en de enige waarin je niets kiest. */
  'setup.step.rijden': {
    en: 'On the road',
    de: 'Unterwegs',
    fr: 'En route',
    nl: 'Rijden'
  },
  'setup.duties': { en: 'Duties', de: 'Dienste', fr: 'Services', nl: 'Diensten' },
  'setup.pick': {
    en: 'Select a duty to continue',
    de: 'Wähle einen Dienst, um fortzufahren',
    fr: 'Choisissez un service pour continuer',
    nl: 'Kies een dienst om verder te gaan'
  },
  'setup.departure': { en: 'Departure', de: 'Abfahrt', fr: 'Départ', nl: 'Vertrek' },
  'setup.arrival': { en: 'Arrival', de: 'Ankunft', fr: 'Arrivée', nl: 'Aankomst' },
  'setup.duration': { en: 'Duration', de: 'Dauer', fr: 'Durée', nl: 'Duur' },
  'setup.available': {
    en: '{line} · {count} duties available',
    de: '{line} · {count} Dienste verfügbar',
    fr: '{line} · {count} services disponibles',
    nl: '{line} · {count} diensten beschikbaar'
  },
  /* Eén dienst is geen "1 duties"; dat leest als een fout in plaats van als een getal. */
  'setup.availableOne': {
    en: '{line} · one duty available',
    de: '{line} · ein Dienst verfügbar',
    fr: '{line} · un service disponible',
    nl: '{line} · één dienst beschikbaar'
  },
  'setup.start': { en: 'Start', de: 'Start', fr: 'Départ', nl: 'Start' },
  'setup.centre': {
    en: 'Centre the map on the route',
    de: 'Karte auf die Route zentrieren',
    fr: 'Centrer la carte sur l’itinéraire',
    nl: 'Kaart op de route centreren'
  },
  'setup.zoomIn': { en: 'Zoom in', de: 'Vergrößern', fr: 'Zoom avant', nl: 'Inzoomen' },
  'setup.zoomOut': { en: 'Zoom out', de: 'Verkleinern', fr: 'Zoom arrière', nl: 'Uitzoomen' },
  'setup.empty': {
    en: 'Nothing to choose here yet.',
    de: 'Hier gibt es noch nichts zu wählen.',
    fr: 'Rien à choisir ici pour l’instant.',
    nl: 'Hier valt nog niets te kiezen.'
  },
  /* De greep tussen de dienst en de kaart op het rijscherm. */
  'setup.splitter': {
    en: 'Drag to divide the duty and the map',
    de: 'Ziehen, um Dienst und Karte aufzuteilen',
    fr: 'Faites glisser pour partager le service et la carte',
    nl: 'Versleep om de dienst en de kaart te verdelen'
  },
  'setup.mapSoon': {
    en: 'The map appears here once you have picked a line and a duty.',
    de: 'Die Karte erscheint hier, sobald du Linie und Dienst gewählt hast.',
    fr: 'La carte apparaît ici dès que vous avez choisi une ligne et un service.',
    nl: 'De kaart verschijnt hier zodra je een lijn en een dienst hebt gekozen.'
  },
  'setup.next': { en: 'Next', de: 'Weiter', fr: 'Suivant', nl: 'Verder' },
  'setup.back': { en: 'Back', de: 'Zurück', fr: 'Retour', nl: 'Terug' },
  'setup.add': { en: 'Add', de: 'Anlegen', fr: 'Ajouter', nl: 'Toevoegen' },

  /* De chauffeurstap: waarmee de app opent. */
  'setup.driverTitle': { en: 'Drivers', de: 'Fahrer', fr: 'Conducteurs', nl: 'Chauffeurs' },
  'setup.driverIntro': {
    en: 'Who is driving today?',
    de: 'Wer fährt heute?',
    fr: 'Qui conduit aujourd’hui ?',
    nl: 'Wie rijdt er vandaag?'
  },
  'setup.colDriver': { en: 'Driver', de: 'Fahrer', fr: 'Conducteur', nl: 'Chauffeur' },
  'setup.colDuties': { en: 'Duties', de: 'Dienste', fr: 'Services', nl: 'Diensten' },
  'setup.colDriven': { en: 'Driven', de: 'Gefahren', fr: 'Conduit', nl: 'Gereden' },
  'setup.driverFoot': {
    en: '{count} drivers on this computer',
    de: '{count} Fahrer auf diesem Rechner',
    fr: '{count} conducteurs sur cet ordinateur',
    nl: '{count} chauffeurs op deze computer'
  },
  /* Eén chauffeur is geen "1 drivers"; dat leest als een fout. */
  'setup.driverFootOne': {
    en: 'one driver on this computer',
    de: 'ein Fahrer auf diesem Rechner',
    fr: 'un conducteur sur cet ordinateur',
    nl: 'één chauffeur op deze computer'
  },
  'setup.newDriver': { en: 'New driver', de: 'Neuer Fahrer', fr: 'Nouveau conducteur', nl: 'Nieuwe chauffeur' },
  'setup.driverTile': {
    en: '{count} duties · {time}',
    de: '{count} Dienste · {time}',
    fr: '{count} services · {time}',
    nl: '{count} diensten · {time}'
  },
  'setup.driverName': { en: 'Name', de: 'Name', fr: 'Nom', nl: 'Naam' },
  'setup.deleteDriver': {
    en: 'Delete this driver',
    de: 'Diesen Fahrer löschen',
    fr: 'Supprimer ce conducteur',
    nl: 'Deze chauffeur verwijderen'
  },
  /* De profielfoto: drie knoppen in de hoek van een chauffeurstegel. */
  'setup.photoAdd': {
    en: 'Add a photo',
    de: 'Foto hinzufügen',
    fr: 'Ajouter une photo',
    nl: 'Foto toevoegen'
  },
  'setup.photoChange': {
    en: 'Choose another photo',
    de: 'Anderes Foto wählen',
    fr: 'Choisir une autre photo',
    nl: 'Andere foto kiezen'
  },
  'setup.photoRemove': {
    en: 'Remove the photo',
    de: 'Foto entfernen',
    fr: 'Retirer la photo',
    nl: 'Foto weghalen'
  },
  'setup.onDuty': { en: 'on duty', de: 'im Dienst', fr: 'en service', nl: 'in dienst' },
  /* Een chauffeur weggooien wist zijn hele logboek; dat vraag je één keer na. */
  'setup.deleteAsk': {
    en: 'Delete {name}? Their duties, licences and logbook go with them.',
    de: '{name} löschen? Dienste, Lizenzen und Fahrtenbuch gehen mit.',
    fr: 'Supprimer {name} ? Ses services, licences et carnet de bord partent avec.',
    nl: '{name} verwijderen? Zijn diensten, vergunningen en logboek gaan mee.'
  },

  /* De modusstap. */
  'setup.modeTitle': { en: 'Modes', de: 'Modi', fr: 'Modes', nl: 'Modi' },
  'setup.modeIntro': {
    en: 'What are you doing today?',
    de: 'Was machst du heute?',
    fr: 'Que faites-vous aujourd’hui ?',
    nl: 'Wat ga je vandaag doen?'
  },
  'setup.colMode': { en: 'Mode', de: 'Modus', fr: 'Mode', nl: 'Modus' },
  'setup.colLicences': { en: 'Licences', de: 'Lizenzen', fr: 'Licences', nl: 'Vergunningen' },
  'setup.colStatus': { en: 'Status', de: 'Stand', fr: 'État', nl: 'Stand' },
  'setup.modeFoot': {
    en: 'The mode decides what the app asks of you',
    de: 'Der Modus bestimmt, was die App von dir verlangt',
    fr: 'Le mode décide de ce que l’application attend de vous',
    nl: 'De modus bepaalt wat de app van je vraagt'
  },
  'setup.modeRunning': { en: 'running', de: 'läuft', fr: 'en cours', nl: 'loopt' },
  'setup.modeNoLicences': {
    en: 'not needed',
    de: 'nicht nötig',
    fr: 'pas nécessaire',
    nl: 'niet nodig'
  },
  'setup.omsiSettings': {
    en: 'OMSI settings',
    de: 'OMSI-Einstellungen',
    fr: 'Réglages OMSI',
    nl: 'OMSI-instellingen'
  },

  /* Wat je in de aangewezen dienst gaat doen. */
  'duty.overviewHead': {
    en: '{trips} trips · {stops} stops · {lines} lines',
    de: '{trips} Fahrten · {stops} Haltestellen · {lines} Linien',
    fr: '{trips} courses · {stops} arrêts · {lines} lignes',
    nl: '{trips} ritten · {stops} haltes · {lines} lijnen'
  },
  'duty.overviewBreak': {
    en: '{time} break',
    de: '{time} Pause',
    fr: '{time} de pause',
    nl: '{time} pauze'
  },
  'duty.overviewSwitch': {
    en: 'Pick this line and tour in OMSI yourself',
    de: 'Diese Linie und diesen Umlauf in OMSI selbst wählen',
    fr: 'Choisissez cette ligne et ce service dans OMSI',
    nl: 'Deze lijn en omloop kies je in OMSI zelf'
  },

  /* De kaartstap. */
  'setup.mapTitle': { en: 'Maps', de: 'Karten', fr: 'Cartes', nl: 'Kaarten' },
  'setup.viewList': { en: 'List', de: 'Liste', fr: 'Liste', nl: 'Lijst' },
  'setup.viewTiles': { en: 'Tiles', de: 'Kacheln', fr: 'Vignettes', nl: 'Tegels' },
  'setup.viewSwitch': { en: 'View', de: 'Ansicht', fr: 'Affichage', nl: 'Weergave' },
  'setup.mapTile': {
    en: '{count} tours · {year}',
    de: '{count} Umläufe · {year}',
    fr: '{count} services · {year}',
    nl: '{count} omlopen · {year}'
  },
  'setup.noPicture': {
    en: 'This map has no picture of its own',
    de: 'Diese Karte hat kein eigenes Bild',
    fr: 'Cette carte n’a pas d’image',
    nl: 'Deze kaart heeft geen eigen afbeelding'
  },
  'setup.mapIntro': {
    en: 'Where are you driving today?',
    de: 'Wo fährst du heute?',
    fr: 'Où conduisez-vous aujourd’hui ?',
    nl: 'Waar rijd je vandaag?'
  },
  'setup.colMap': { en: 'Map', de: 'Karte', fr: 'Carte', nl: 'Kaart' },
  'setup.colTours': { en: 'Tours', de: 'Umläufe', fr: 'Rotations', nl: 'Omlopen' },
  'setup.colYear': { en: 'Era', de: 'Zeit', fr: 'Époque', nl: 'Tijdvak' },
  'setup.mapFoot': {
    en: '{count} maps installed',
    de: '{count} Karten installiert',
    fr: '{count} cartes installées',
    nl: '{count} kaarten geïnstalleerd'
  },

  /* De lijnstap. */
  'setup.lineTitle': { en: 'Lines', de: 'Linien', fr: 'Lignes', nl: 'Lijnen' },
  'setup.lineIntro': {
    en: 'Pick the line you want to drive',
    de: 'Wähle die Linie, die du fahren willst',
    fr: 'Choisissez la ligne que vous voulez conduire',
    nl: 'Kies de lijn die je wilt rijden'
  },
  'setup.colLine': { en: 'Line', de: 'Linie', fr: 'Ligne', nl: 'Lijn' },
  'setup.colTrips': { en: 'Trips', de: 'Fahrten', fr: 'Courses', nl: 'Ritten' },
  'setup.colAverage': { en: 'Average', de: 'Schnitt', fr: 'Moyenne', nl: 'Gemiddeld' },
  'setup.lineFoot': {
    en: '{map} · {count} lines',
    de: '{map} · {count} Linien',
    fr: '{map} · {count} lignes',
    nl: '{map} · {count} lijnen'
  },

  /* De busstap. */
  'setup.busTitle': { en: 'Buses', de: 'Busse', fr: 'Bus', nl: 'Bussen' },
  'setup.busIntro': {
    en: 'Which bus are you taking out?',
    de: 'Mit welchem Bus fährst du raus?',
    fr: 'Quel bus sortez-vous ?',
    nl: 'Met welke bus ga je rijden?'
  },
  /*
   * De vergunningstap, alleen in de carriere. Hier kies je geen lijn om te
   * rijden -- dat doet de remise -- maar je ziet waar je mag rijden en je haalt
   * er een lijn bij.
   */
  'setup.licTitle': { en: 'Your licences', de: 'Deine Lizenzen', fr: 'Vos permis', nl: 'Je vergunningen' },
  'setup.licIntro': {
    en: 'The depot only puts you on lines you are licensed for.',
    de: 'Der Betriebshof teilt dich nur auf Linien ein, für die du eine Lizenz hast.',
    fr: 'Le dépôt ne vous affecte qu’aux lignes pour lesquelles vous avez un permis.',
    nl: 'De remise zet je alleen op lijnen waar je een vergunning voor hebt.'
  },
  'setup.colSince': { en: 'Since', de: 'Seit', fr: 'Depuis', nl: 'Sinds' },
  'setup.colKind': { en: 'Test', de: 'Prüfung', fr: 'Examen', nl: 'Examen' },
  'setup.licKindBasic': { en: 'Driving test', de: 'Fahrprüfung', fr: 'Examen de conduite', nl: 'Rijexamen' },
  'setup.licKindLine': { en: 'Line test', de: 'Linienprüfung', fr: 'Examen de ligne', nl: 'Lijnexamen' },
  'setup.licFoot': {
    en: '{count} lines on {map} · the duty runs across all of them',
    de: '{count} Linien auf {map} · der Dienst läuft über alle',
    fr: '{count} lignes sur {map} · le service les parcourt toutes',
    nl: '{count} lijnen op {map} · de dienst loopt er overheen'
  },
  'setup.licFootOne': {
    en: 'One line on {map} · everything you drive here runs on it',
    de: 'Eine Linie auf {map} · alles, was du hier fährst, läuft darüber',
    fr: 'Une ligne sur {map} · tout ce que vous conduisez ici y passe',
    nl: 'Eén lijn op {map} · alles wat je hier rijdt, gaat daarover'
  },
  'setup.licFootNone': {
    en: 'No licence on {map} yet. Take a test to earn one.',
    de: 'Noch keine Lizenz auf {map}. Lege eine Prüfung ab.',
    fr: 'Aucun permis sur {map}. Passez un examen pour en obtenir un.',
    nl: 'Nog geen vergunning op {map}. Leg een examen af om er een te halen.'
  },
  'setup.licLearn': { en: 'Learn another line', de: 'Weitere Linie lernen', fr: 'Apprendre une autre ligne', nl: 'Nieuwe lijn leren' },
  'setup.examFoot': {
    en: 'Finish the trip, stay within {delay} min, drive smoothly, keep to the limit.',
    de: 'Fahrt beenden, höchstens {delay} Min Verspätung, ruhig fahren, Tempo halten.',
    fr: 'Terminez la course, {delay} min de retard au plus, conduisez en douceur, respectez la limite.',
    nl: 'Rit afmaken, hoogstens {delay} min afwijking, rustig rijden, je aan de limiet houden.'
  },
  'setup.examNone': {
    en: 'Every line here is already yours. Nothing left to learn on {map}.',
    de: 'Jede Linie hier gehört dir schon. Auf {map} gibt es nichts mehr zu lernen.',
    fr: 'Toutes les lignes ici sont déjà à vous. Plus rien à apprendre sur {map}.',
    nl: 'Elke lijn hier is al van jou. Op {map} valt niets meer te leren.'
  },
  /*
   * De ritstap, alleen bij vrij rijden. Daar is geen dienst om te kiezen, dus
   * staat op die plek in de reeks de vraag die er wel toe doet: waar, wanneer
   * en met wat voor weer.
   */
  /* De tegel die er een wagenpark bij haalt, naast de wagenparken die er al zijn. */
  'setup.yardAdd': {
    en: 'Add a depot file',
    de: 'Hofdatei hinzufügen',
    fr: 'Ajouter un fichier de dépôt',
    nl: 'Wagenpark toevoegen'
  },
  'setup.yardAddHave': {
    en: 'This bus already has {file}, the depot file of this map',
    de: 'Dieser Bus hat {file} schon — die Hofdatei dieser Karte',
    fr: 'Ce bus a déjà {file}, le fichier de dépôt de cette carte',
    nl: 'Deze bus heeft {file} al: het wagenpark van deze kaart'
  },
  'setup.yardAddOther': {
    en: '{file} · knows {matched} here, but its layout differs from this bus',
    de: '{file} · kennt hier {matched}, die Feldaufteilung passt aber nicht zu diesem Bus',
    fr: '{file} · en connaît {matched} ici, mais sa disposition diffère de ce bus',
    nl: '{file} · kent er hier {matched}, maar de indeling wijkt af van deze bus'
  },
  'setup.yardAddNone': {
    en: 'No yard file on this installation covers these destinations',
    de: 'Keine Hofdatei auf diesem Rechner kennt diese Ziele',
    fr: 'Aucun fichier de dépôt ici ne connaît ces destinations',
    nl: 'Geen wagenpark op deze computer kent deze bestemmingen'
  },
  'setup.yardAdded': {
    en: '{file} placed next to this bus',
    de: '{file} neben diesen Bus gelegt',
    fr: '{file} placé à côté de ce bus',
    nl: '{file} naast deze bus gelegd'
  },
  'setup.yardAddFrom': {
    en: '{file} · knows {matched} destinations here',
    de: '{file} · kennt hier {matched} Ziele',
    fr: '{file} · connaît {matched} destinations ici',
    nl: '{file} · kent hier {matched} bestemmingen'
  },
  'setup.noLine': { en: 'No line', de: 'Keine Linie', fr: 'Aucune ligne', nl: 'Geen lijn' },
  'setup.freeTitle': { en: 'Your drive', de: 'Deine Fahrt', fr: 'Votre trajet', nl: 'Je rit' },
  'setup.freeIntro': {
    en: 'No duty, no timetable to keep. Say where and when, and it is set up.',
    de: 'Kein Dienst, kein Fahrplan. Sag wo und wann, dann steht es bereit.',
    fr: 'Pas de service, pas d’horaire. Dites où et quand, et tout est prêt.',
    nl: 'Geen dienst, geen dienstregeling. Zeg waar en wanneer, dan staat het klaar.'
  },
  'setup.freeFoot': {
    en: 'Pick a bus next; {map} is ready at {time}.',
    de: 'Wähle als Nächstes einen Bus; {map} steht um {time} bereit.',
    fr: 'Choisissez ensuite un bus ; {map} est prêt à {time}.',
    nl: 'Kies hierna een bus; {map} staat klaar om {time}.'
  },
  'setup.colBus': { en: 'Bus', de: 'Bus', fr: 'Bus', nl: 'Bus' },
  'setup.colFleet': { en: 'Fleet', de: 'Fuhrpark', fr: 'Parc', nl: 'Wagenpark' },
  'setup.colFit': { en: 'Displays', de: 'Anzeigen', fr: 'Affichage', nl: 'Toont' },
  /* Het scherm terwijl de dienst loopt; `run.title` staat er al. */
  'run.intro': {
    en: 'OMSI is running {map}. Keep this window beside the game, or use the overlay.',
    de: 'OMSI läuft auf {map}. Lass dieses Fenster neben dem Spiel stehen, oder nutze das Overlay.',
    fr: 'OMSI tourne sur {map}. Gardez cette fenêtre à côté du jeu, ou utilisez la surimpression.',
    nl: 'OMSI draait op {map}. Laat dit venster naast het spel staan, of gebruik de overlay.'
  },
  /* De apps op de overlay; het balkje onderin de navigatie. */
  'ovl.appMap': { en: 'Map', de: 'Karte', fr: 'Carte', nl: 'Kaart' },
  'ovl.appDuty': { en: 'Duty', de: 'Dienst', fr: 'Service', nl: 'Dienst' },
  'ovl.appBreak': { en: 'Break', de: 'Pause', fr: 'Pause', nl: 'Pauze' },
  /*
   * De kaartjes-app in de overlay. Wat er niet in staat: iets over wat de
   * passagier vraagt of geeft -- OMSI geeft dat niet door, zie core/kaartjes.ts.
   * De app rekent, hij raadt niet.
   */
  /*
   * Aanmelden op de telefoon en tekenen voor je dienst. De toon is die van een
   * remise en niet die van een computer: "onbekend nummer" en niet "ongeldige
   * invoer", en "dienst aanvaarden" en niet "bevestigen".
   */
  'ovl.signonTitle': { en: 'Sign on', de: 'Anmelden', fr: 'Prise de service', nl: 'Aanmelden' },
  'ovl.signonNumber': {
    en: 'Your staff number',
    de: 'Deine Personalnummer',
    fr: 'Votre matricule',
    nl: 'Je personeelsnummer'
  },
  'ovl.signonPin': { en: 'Your PIN', de: 'Deine PIN', fr: 'Votre code', nl: 'Je pincode' },
  /* Wie zijn nummer kwijt is, leest het terug in de app; dat hoort er te staan. */
  /* "Kijk in de app" was te vaag: er staat nu bij waar in de app. */
  'ovl.signonWrong': {
    en: 'Not known here — it is on your service record in the app',
    de: 'Hier nicht bekannt — sie steht in der App in deiner Dienstakte',
    fr: 'Inconnu ici — il figure sur votre feuille de service dans l’application',
    nl: 'Hier niet bekend — hij staat in de app bij je staat van dienst'
  },
  'ovl.signonClear': { en: 'Clear', de: 'Löschen', fr: 'Effacer', nl: 'Wissen' },
  'ovl.signonNone': {
    en: 'This driver has no staff number yet.',
    de: 'Dieser Fahrer hat noch keine Personalnummer.',
    fr: 'Ce conducteur n’a pas encore de matricule.',
    nl: 'Deze chauffeur heeft nog geen personeelsnummer.'
  },
  'ovl.signonSkip': { en: 'Continue', de: 'Weiter', fr: 'Continuer', nl: 'Doorgaan' },
  /* Staat in het dienstpaneel zolang je op de telefoon nog niet getekend hebt. */
  'ovl.signonFirst': {
    en: 'Sign on with your phone first.',
    de: 'Melde dich erst auf dem Telefon an.',
    fr: 'Prenez d’abord votre service sur le téléphone.',
    nl: 'Meld je eerst aan op de telefoon.'
  },
  'ovl.dutyOrder': {
    en: 'Duty assignment',
    de: 'Dienstauftrag',
    fr: 'Ordre de service',
    nl: 'Dienstopdracht'
  },
  'ovl.dutyLine': { en: 'Line', de: 'Linie', fr: 'Ligne', nl: 'Lijn' },
  'ovl.dutyTour': { en: 'Tour', de: 'Umlauf', fr: 'Rotation', nl: 'Omloop' },
  'ovl.dutyStart': { en: 'Departure', de: 'Abfahrt', fr: 'Départ', nl: 'Vertrek' },
  'ovl.dutyEnd': { en: 'Back at', de: 'Zurück um', fr: 'Retour à', nl: 'Terug om' },
  'ovl.dutyTrips': { en: 'Trips', de: 'Fahrten', fr: 'Courses', nl: 'Ritten' },
  'ovl.dutyAccept': {
    en: 'Accept duty',
    de: 'Dienst annehmen',
    fr: 'Accepter le service',
    nl: 'Dienst aanvaarden'
  },
  'ovl.appTickets': { en: 'Tickets', de: 'Fahrscheine', fr: 'Billets', nl: 'Kaartjes' },
  'ovl.ticketsNone': {
    en: 'This map has no tickets: nothing is sold here.',
    de: 'Diese Karte hat keine Fahrscheine: hier wird nichts verkauft.',
    fr: 'Cette carte n’a pas de billets : on n’en vend pas ici.',
    nl: 'Deze kaart heeft geen kaartjes: hier wordt niets verkocht.'
  },
  'ovl.ticketStops': {
    en: 'up to {count} stops',
    de: 'bis {count} Haltestellen',
    fr: 'jusqu’à {count} arrêts',
    nl: 'tot {count} haltes'
  },
  'ovl.ticketGiven': { en: 'Given', de: 'Gegeben', fr: 'Donné', nl: 'Gegeven' },
  'ovl.ticketClear': { en: 'Clear', de: 'Zurücksetzen', fr: 'Effacer', nl: 'Wissen' },
  'ovl.ticketChange': { en: 'Change', de: 'Rückgeld', fr: 'Monnaie', nl: 'Terug' },
  /* Te weinig aangenomen; dan hoort er te staan hoeveel er nog bij moet. */
  'ovl.ticketShort': { en: 'Still to pay', de: 'Fehlt noch', fr: 'Reste à payer', nl: 'Nog te betalen' },
  'ovl.ticketExact': { en: 'exact', de: 'passend', fr: 'compte juste', nl: 'gepast' },
  'ovl.appTrip': { en: 'Trip', de: 'Fahrt', fr: 'Course', nl: 'Rit' },
  'ovl.appNoDuty': {
    en: 'No duty running.',
    de: 'Kein Dienst aktiv.',
    fr: 'Aucun service en cours.',
    nl: 'Er loopt geen dienst.'
  },
  'ovl.appLine': { en: 'line {line}', de: 'Linie {line}', fr: 'ligne {line}', nl: 'lijn {line}' },
  'ovl.appStops': { en: '{count} stops', de: '{count} Halte', fr: '{count} arrêts', nl: '{count} haltes' },
  'ovl.appLayover': {
    en: '{minutes} min break before this trip',
    de: '{minutes} Min Pause vor dieser Fahrt',
    fr: '{minutes} min de pause avant cette course',
    nl: '{minutes} min pauze voor deze rit'
  },
  'ovl.appBreakDue': {
    en: 'Scheduled break at the terminus',
    de: 'Geplante Pause an der Endhaltestelle',
    fr: 'Pause prévue au terminus',
    nl: 'Geplande pauze op het eindpunt'
  },
  'ovl.appBreakRunning': { en: 'On break for', de: 'Pause läuft seit', fr: 'En pause depuis', nl: 'Pauze loopt' },
  'ovl.appBreakLeft': {
    en: '{minutes} min left',
    de: 'noch {minutes} Min',
    fr: 'encore {minutes} min',
    nl: 'nog {minutes} min'
  },
  'ovl.appBreakOver': {
    en: '{minutes} min over',
    de: '{minutes} Min drüber',
    fr: '{minutes} min de trop',
    nl: '{minutes} min over tijd'
  },
  'ovl.appBreakStart': { en: 'Start break', de: 'Pause starten', fr: 'Démarrer la pause', nl: 'Pauze starten' },
  'ovl.appBreakStop': { en: 'End break', de: 'Pause beenden', fr: 'Terminer la pause', nl: 'Pauze beëindigen' },
  'ovl.appMinutes': { en: '{minutes} min', de: '{minutes} Min', fr: '{minutes} min', nl: '{minutes} min' },
  'ovl.appSpeed': { en: 'Speed', de: 'Tempo', fr: 'Vitesse', nl: 'Snelheid' },
  'ovl.appPassengers': { en: 'On board', de: 'An Bord', fr: 'À bord', nl: 'Aan boord' },
  'ovl.appStopsDone': { en: 'Stops', de: 'Halte', fr: 'Arrêts', nl: 'Haltes' },
  'ovl.appOdometer': { en: 'Odometer', de: 'Kilometerstand', fr: 'Compteur', nl: 'Kilometerstand' },
  'ovl.appDelay': { en: 'Delay', de: 'Verspätung', fr: 'Retard', nl: 'Vertraging' },
  // ---------- wagenparken overzetten ----------
  'setup.regenerate': {
    en: 'Find other duties',
    de: 'Andere Dienste suchen',
    fr: 'Chercher d’autres services',
    nl: 'Andere diensten zoeken'
  },
  'setup.searching': {
    en: 'Searching…',
    de: 'Wird gesucht…',
    fr: 'Recherche…',
    nl: 'Bezig met zoeken…'
  },
  'setup.hofTitle': {
    en: 'Destination files',
    de: 'Hofdateien',
    fr: 'Fichiers de destinations',
    nl: 'Wagenparken'
  },
  'setup.hofOffer': {
    en: '{count} buses do not know this map',
    de: '{count} Busse kennen diese Karte nicht',
    fr: '{count} bus ne connaissent pas cette carte',
    nl: '{count} bussen kennen deze kaart niet'
  },
  'setup.hofIntro': {
    en: 'These {count} buses have no depot file for this map, so their IBIS rejects the codes and the destination sign stays blank. The app can copy a matching file next to each of them.',
    de: 'Diesen {count} Bussen fehlt die Hofdatei dieser Karte: Das IBIS nimmt die Codes nicht an und die Zielanzeige bleibt leer. Die App kann jeweils eine passende Datei danebenlegen.',
    fr: 'Ces {count} bus n’ont pas de fichier de dépôt pour cette carte : l’IBIS refuse les codes et la girouette reste vide. L’application peut copier un fichier compatible à côté de chacun.',
    nl: 'Deze {count} bussen hebben geen wagenpark voor deze kaart: de IBIS neemt de codes niet aan en de bestemmingsfilm blijft leeg. De app kan er bij elk een passend bestand naast leggen.'
  },
  'busvraag.title': {
    en: 'This bus is ready for you',
    de: 'Dieser Bus steht für dich bereit',
    fr: 'Ce bus vous attend',
    nl: 'Deze bus staat voor je klaar'
  },
  'busvraag.perfect': {
    en: 'It knows every destination of this duty. Take it out, or pick one yourself.',
    de: 'Er kennt alle Ziele dieses Dienstes. Nimm ihn mit, oder wähle selbst.',
    fr: 'Il connaît toutes les destinations de ce service. Prenez-le, ou choisissez vous-même.',
    nl: 'Hij kent alle eindbestemmingen van deze dienst. Neem hem mee, of kies er zelf een.'
  },
  'busvraag.partly': {
    en: 'It knows {percent}% of the destinations of this duty — the best of what is installed. Take it out, or pick one yourself.',
    de: 'Er kennt {percent}% der Ziele dieses Dienstes — das Beste, was installiert ist. Nimm ihn mit, oder wähle selbst.',
    fr: 'Il connaît {percent}% des destinations de ce service — le meilleur parmi les bus installés. Prenez-le, ou choisissez vous-même.',
    nl: 'Hij kent {percent}% van de eindbestemmingen van deze dienst — het beste van wat er staat. Neem hem mee, of kies er zelf een.'
  },
  'busvraag.plain': {
    en: 'The app picked it for this duty. Take it out, or pick one yourself.',
    de: 'Die App hat ihn für diesen Dienst gewählt. Nimm ihn mit, oder wähle selbst.',
    fr: 'L’application l’a choisi pour ce service. Prenez-le, ou choisissez vous-même.',
    nl: 'De app koos hem voor deze dienst. Neem hem mee, of kies er zelf een.'
  },
  'busvraag.keep': {
    en: 'Take this one',
    de: 'Diesen nehmen',
    fr: 'Prendre celui-ci',
    nl: 'Deze nemen'
  },
  'busvraag.own': {
    en: 'Pick one myself',
    de: 'Selbst wählen',
    fr: 'Choisir moi-même',
    nl: 'Zelf kiezen'
  },
  'hofvraag.title': {
    en: 'This bus does not know this map',
    de: 'Dieser Bus kennt diese Karte nicht',
    fr: 'Ce bus ne connaît pas cette carte',
    nl: 'Deze bus kent deze kaart niet'
  },
  /*
   * Over de kaart en niet over de dienst: het wagenpark hoort bij een bus en
   * een kaart, en sinds de vraag daarop gebaseerd is zou "van deze dienst" een
   * getal noemen dat nergens op slaat.
   */
  'hofvraag.body': {
    en: '{bus} recognises {known} of the {total} destinations on this map, so the IBIS will not accept the codes and the destination sign stays blank.',
    de: '{bus} kennt {known} der {total} Ziele auf dieser Karte; das IBIS nimmt die Codes nicht an und die Zielanzeige bleibt leer.',
    fr: '{bus} reconnaît {known} des {total} destinations de cette carte : l’IBIS refusera les codes et la girouette restera vide.',
    nl: '{bus} kent {known} van de {total} bestemmingen op deze kaart. De IBIS neemt de codes dus niet aan en de bestemmingsfilm blijft leeg.'
  },
  'hofvraag.offer': {
    en: 'Place {file} beside this bus? It knows {matched} of {total}. Nothing is overwritten, and you still pick the depot in OMSI yourself.',
    de: '{file} neben diesen Bus legen? Sie kennt {matched} von {total}. Nichts wird überschrieben, und den Betriebshof wählst du in OMSI weiterhin selbst.',
    fr: 'Placer {file} à côté de ce bus ? Il connaît {matched} sur {total}. Rien n’est écrasé, et vous choisissez toujours le dépôt dans OMSI.',
    nl: 'Zal ik {file} bij deze bus neerzetten? Dat wagenpark kent er {matched} van {total}. Er wordt niets overschreven, en de remise kies je in OMSI nog steeds zelf.'
  },
  'hofvraag.yes': { en: 'Add it', de: 'Hinzufügen', fr: 'Ajouter', nl: 'Toevoegen' },
  'hofvraag.no': { en: 'Not now', de: 'Jetzt nicht', fr: 'Pas maintenant', nl: 'Niet nu' },
  'setup.hofBus': { en: 'Bus', de: 'Bus', fr: 'Bus', nl: 'Bus' },
  'setup.hofNow': { en: 'Knows now', de: 'Kennt jetzt', fr: 'Connaît', nl: 'Kent nu' },
  'setup.hofAfter': { en: 'Would know', de: 'Würde kennen', fr: 'Connaîtrait', nl: 'Zou kennen' },
  'setup.hofOf': { en: '{known} of {total}', de: '{known} von {total}', fr: '{known} sur {total}', nl: '{known} van {total}' },
  'setup.hofDo': { en: 'Copy them', de: 'Kopieren', fr: 'Copier', nl: 'Overzetten' },
  'setup.hofBusy': { en: 'Copying…', de: 'Wird kopiert…', fr: 'Copie…', nl: 'Bezig…' },
  'setup.hofDone': {
    en: '{count} destination files placed.',
    de: '{count} Hofdateien abgelegt.',
    fr: '{count} fichiers de destinations placés.',
    nl: '{count} wagenparken neergezet.'
  },
  /* Geen kleine lettertjes maar de afspraak: er wordt niets overschreven. */
  'setup.hofFoot': {
    en: 'The file is placed beside the ones already there; nothing is overwritten, and you still pick the depot in OMSI yourself.',
    de: 'Die Datei wird neben die vorhandenen gelegt; nichts wird überschrieben, und den Betriebshof wählst du in OMSI weiterhin selbst.',
    fr: 'Le fichier est placé à côté de ceux déjà présents ; rien n’est écrasé, et vous choisissez toujours le dépôt dans OMSI.',
    nl: 'Het bestand komt naast wat er al ligt; er wordt niets overschreven, en de remise kies je in OMSI nog steeds zelf.'
  },
  'ovl.appFuel': { en: 'Fuel', de: 'Tank', fr: 'Carburant', nl: 'Tank' },
  'ovl.appBattery': { en: 'Battery', de: 'Akku', fr: 'Batterie', nl: 'Accu' },
  'ovl.appNextTrip': {
    en: 'Next trip',
    de: 'Nächste Fahrt',
    fr: 'Trajet suivant',
    nl: 'Volgende rit'
  },
  'setup.yardTitle': { en: 'Depot', de: 'Betriebshof', fr: 'Dépôt', nl: 'Remise' },
  'setup.yardIntro': {
    en: 'The depot file decides which destinations your matrix sign can show.',
    de: 'Die Hofdatei bestimmt, welche Ziele deine Matrixanzeige zeigen kann.',
    fr: 'Le fichier de dépôt décide des destinations affichables sur la girouette.',
    nl: 'Het hof-bestand bepaalt welke bestemmingen je matrixbord kan tonen.'
  },
  'setup.yardKnows': {
    en: '{known} of {total} destinations',
    de: '{known} von {total} Zielen',
    fr: '{known} sur {total} destinations',
    nl: '{known} van {total} bestemmingen'
  },
  'setup.yardSuggested': {
    en: 'best match',
    de: 'beste Wahl',
    fr: 'meilleur choix',
    nl: 'past het best'
  },
  'setup.yardButton': { en: 'Depot file', de: 'Hofdatei', fr: 'Fichier de dépôt', nl: 'Hof-bestand' },
  'setup.busButton': { en: 'Bus', de: 'Bus', fr: 'Bus', nl: 'Bus' },
  'setup.busCount': {
    en: '{count} versions',
    de: '{count} Ausführungen',
    fr: '{count} versions',
    nl: '{count} uitvoeringen'
  },
  /* Eén uitvoering is geen "1 versions". */
  'setup.busCountOne': {
    en: 'one version',
    de: 'eine Ausführung',
    fr: 'une version',
    nl: 'één uitvoering'
  },
  'setup.busPickType': {
    en: 'Which model?',
    de: 'Welches Modell?',
    fr: 'Quel modèle ?',
    nl: 'Welk type?'
  },
  'setup.busPickTrim': {
    en: 'Which version? Gearbox, doors and cab differ.',
    de: 'Welche Ausführung? Getriebe, Türen und Kabine unterscheiden sich.',
    fr: 'Quelle version ? Boîte, portes et cabine diffèrent.',
    nl: 'Welke uitvoering? Bak, deuren en cabine verschillen.'
  },
  'setup.busFoot': {
    en: '{count} buses installed · the first one fits this duty best',
    de: '{count} Busse installiert · der erste passt am besten zu diesem Dienst',
    fr: '{count} bus installés · le premier convient le mieux à ce service',
    nl: '{count} bussen geïnstalleerd · de eerste past het best bij deze dienst'
  },
  'setup.theme': { en: 'Appearance', de: 'Darstellung', fr: 'Apparence', nl: 'Weergave' },
  'setup.themeSystem': { en: 'System', de: 'System', fr: 'Système', nl: 'Systeem' },
  'setup.themeDark': { en: 'Dark', de: 'Dunkel', fr: 'Sombre', nl: 'Donker' },
  'setup.themeLight': { en: 'Light', de: 'Hell', fr: 'Clair', nl: 'Licht' }
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
