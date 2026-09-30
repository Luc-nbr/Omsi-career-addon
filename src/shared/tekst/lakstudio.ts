/*
 * Teksten van de Lakstudio (design/ontwerpen/lakstudio.md §2.5). Eigen bron met
 * de sleutels `ls.*`. De meldingen van §2.5 staan er allemaal (de studio en
 * Addons gebruiken ze vanaf L3); de ontwikkelaarsteksten van het lakdoek (L1)
 * staan onder `ls.dev.*`.
 */
export const TEKST_LAKSTUDIO = {
  'ls.titel': { en: 'Livery studio', de: 'Lackierstudio', fr: 'Atelier de livrées', nl: 'Lakstudio' },
  'ls.klaargezet': {
    en: 'OMSI is open. Your livery will be added to OMSI as soon as you close OMSI. Your design has been saved.',
    de: 'OMSI ist offen. Deine Lackierung kommt in OMSI, sobald du OMSI schließt. Dein Entwurf ist gespeichert.',
    fr: "OMSI est ouvert. Ta livrée sera ajoutée à OMSI dès que tu fermeras OMSI. Ton projet est enregistré.",
    nl: 'OMSI is open. Je lak komt in OMSI zodra je OMSI sluit. Je ontwerp is bewaard.'
  },
  'ls.geplaatst': {
    en: "'{naam}' is now in OMSI.",
    de: "'{naam}' ist jetzt in OMSI.",
    fr: "'{naam}' est maintenant dans OMSI.",
    nl: "'{naam}' staat nu in OMSI."
  },
  'ls.wacht': { en: 'Waiting for OMSI', de: 'Wartet auf OMSI', fr: "En attente d'OMSI", nl: 'Wacht op OMSI' },
  'ls.naamBezet': {
    en: 'This bus already has that name, possibly with different capitals. Choose another one.',
    de: 'Diesen Namen gibt es bei diesem Bus schon, auch mit anderer Groß- und Kleinschreibung. Wähle einen anderen.',
    fr: 'Ce nom existe déjà pour ce bus, éventuellement avec d’autres majuscules. Choisis-en un autre.',
    nl: 'Die naam bestaat al bij deze bus, ook met andere hoofdletters. Kies een andere.'
  },
  'ls.naamTeken': {
    en: 'OMSI does not know this character: {teken}.',
    de: 'Dieses Zeichen kennt OMSI nicht: {teken}.',
    fr: 'OMSI ne connaît pas ce caractère : {teken}.',
    nl: 'Dit teken kent OMSI niet: {teken}.'
  },
  'ls.geenCtc': {
    en: 'This bus has no colour schemes in OMSI. A custom livery is not possible here.',
    de: 'Dieser Bus kennt in OMSI keine Farbschemata. Eine eigene Lackierung geht hier nicht.',
    fr: "Ce bus n'a pas de livrées dans OMSI. Une livrée personnelle n'est pas possible ici.",
    nl: 'Deze bus kent in OMSI geen kleurstellingen. Een eigen lak kan hier niet.'
  },
  'ls.vast': {
    en: 'This part has a fixed texture in OMSI and cannot be painted.',
    de: 'Dieses Teil hat in OMSI eine feste Textur und kann nicht lackiert werden.',
    fr: 'Cette pièce a une texture fixe dans OMSI et ne peut pas être peinte.',
    nl: 'Dit deel heeft in OMSI een vaste textuur en kan niet gelakt worden.'
  },
  'ls.gekoppeld': {
    en: 'This spot shares its texture with the other side: what you do here also shows there.',
    de: 'Diese Stelle teilt ihre Textur mit der anderen Seite: Was du hier machst, siehst du dort auch.',
    fr: "Cet endroit partage sa texture avec l'autre côté : ce que tu fais ici se voit aussi là-bas.",
    nl: 'Deze plek deelt zijn textuur met de andere kant: wat je hier doet, zie je daar ook.'
  },
  'ls.spiegelschrift': {
    en: 'On the other side this appears mirrored, because the bus shares the same paint there.',
    de: 'Auf der anderen Seite steht das spiegelverkehrt, weil der Bus dort dieselbe Lackierung teilt.',
    fr: "De l'autre côté, cela apparaît en miroir, car le bus y partage la même peinture.",
    nl: 'Aan de andere kant staat dit in spiegelschrift, want daar deelt de bus dezelfde lak.'
  },
  'ls.schuif': { en: 'Move to a free area', de: 'Auf eine freie Stelle schieben', fr: 'Déplacer vers une zone libre', nl: 'Schuif naar een vrij stuk' },
  'ls.kopieDeur': {
    en: 'The copy on the other side falls on a door or window.',
    de: 'Die Kopie auf der anderen Seite fällt auf eine Tür oder Scheibe.',
    fr: "La copie de l'autre côté tombe sur une porte ou une vitre.",
    nl: 'De kopie aan de andere kant valt op een deur of ruit.'
  },
  'ls.klein': {
    en: 'These letters are smaller than 10 pixels on the texture and will look blurry in OMSI.',
    de: 'Diese Buchstaben sind auf der Textur kleiner als 10 Pixel und werden in OMSI unscharf.',
    fr: 'Ces lettres font moins de 10 pixels sur la texture et seront floues dans OMSI.',
    nl: 'Deze letters zijn kleiner dan 10 beeldpunten op de lak en worden in OMSI onscherp.'
  },
  'ls.ruit': {
    en: "You can't paint windows yet.",
    de: 'Scheiben kannst du noch nicht lackieren.',
    fr: 'Tu ne peux pas encore peindre les vitres.',
    nl: 'Ruiten lak je nog niet.'
  },
  'ls.onderdeel': {
    en: 'This lettering is a separate part of the bus.',
    de: 'Diese Beschriftung ist ein eigenes Teil des Busses.',
    fr: 'Ce lettrage est une pièce séparée du bus.',
    nl: 'Dit opschrift is een los onderdeel van de bus.'
  },
  'ls.weghalen': { en: 'Remove', de: 'Entfernen', fr: 'Retirer', nl: 'Weghalen' },
  'ls.licht': {
    en: 'Preview at half sharpness. The livery in OMSI will be sharp.',
    de: 'Vorschau in halber Schärfe. Die Lackierung in OMSI wird scharf.',
    fr: 'Aperçu à demi-netteté. La livrée dans OMSI sera nette.',
    nl: 'Voorbeeld op halve scherpte. De lak in OMSI wordt wel scherp.'
  },
  'ls.ookOp': { en: 'Also on: {bussen}.', de: 'Kommt auch auf: {bussen}.', fr: 'Aussi sur : {bussen}.', nl: 'Komt ook op: {bussen}.' },
  'ls.nietOp': {
    en: "{bus} won't get this livery ({reden}). It won't exist there.",
    de: '{bus} bekommt diese Lackierung nicht ({reden}). Dort gibt es sie nicht.',
    fr: "{bus} n'aura pas cette livrée ({reden}). Elle n'y existera pas.",
    nl: '{bus} krijgt deze lak niet ({reden}). Daar bestaat hij niet.'
  },
  'ls.opties': {
    en: "Bus options aren't possible here: {bus} won't get this livery.",
    de: 'Busoptionen gehen hier nicht: {bus} bekommt diese Lackierung nicht.',
    fr: "Les options du bus ne sont pas possibles ici : {bus} n'aura pas cette livrée.",
    nl: 'Busopties kunnen hier niet: {bus} krijgt deze lak niet.'
  },
  'ls.conflict': {
    en: "This colour scheme would also appear on {bus}, but it doesn't fit there. That's why we won't add it to OMSI.",
    de: 'Dieses Farbschema würde auch bei {bus} erscheinen, passt dort aber nicht. Deshalb setzen wir es nicht in OMSI.',
    fr: "Cette livrée apparaîtrait aussi sur {bus}, mais ne s'y adapte pas. C'est pourquoi nous ne l'ajoutons pas à OMSI.",
    nl: 'Deze kleurstelling zou ook in {bus} verschijnen, maar past daar niet. Daarom zetten we haar niet in OMSI.'
  },
  'ls.handmatig': {
    en: 'Someone changed {n} file(s) of this livery by hand. We did not touch anything.',
    de: 'Jemand hat {n} Datei(en) dieser Lackierung von Hand geändert. Wir haben nichts angerührt.',
    fr: "Quelqu'un a modifié à la main {n} fichier(s) de cette livrée. Nous n'avons rien touché.",
    nl: 'Iemand heeft {n} bestand(en) van deze lak met de hand veranderd. We hebben niets aangeraakt.'
  },
  'ls.bezig': {
    en: 'Please wait: the app is already installing or removing something.',
    de: 'Einen Moment: Die App installiert oder entfernt gerade schon etwas.',
    fr: "Un instant : l'application installe ou supprime déjà quelque chose.",
    nl: 'Even wachten: de app installeert of verwijdert al iets.'
  },
  'ls.gebruik': {
    en: 'Buses {nummers} run in this livery. Afterwards they will run in Standard.',
    de: 'Die Busse {nummers} fahren in dieser Lackierung. Danach fahren sie in Standard.',
    fr: 'Les bus {nummers} roulent dans cette livrée. Ensuite, ils rouleront en Standard.',
    nl: 'Bus {nummers} rijden in deze lak. Daarna rijden ze in Standaard.'
  },
  'ls.wees': {
    en: 'Made with another installation of the app.',
    de: 'Mit einer anderen Installation der App erstellt.',
    fr: "Créée avec une autre installation de l'application.",
    nl: 'Gemaakt met een andere installatie van de app.'
  },
  'ls.klaar': {
    en: "'{naam}' is in OMSI. You can choose it in the bus selection, at the dealer and for repainting. AI buses of this type can also carry it.",
    de: "'{naam}' ist in OMSI. Du wählst sie in der Busauswahl, beim Händler und beim Umlackieren. Auch KI-Busse dieses Typs können sie tragen.",
    fr: "'{naam}' est dans OMSI. Tu la choisis dans la sélection de bus, chez le concessionnaire et pour repeindre. Les bus IA de ce type peuvent aussi la porter.",
    nl: "'{naam}' staat in OMSI. Je kiest hem in de buskeuze, bij de dealer en bij Overspuiten. Ook KI-bussen van dit type kunnen hem dragen."
  },
  'ls.lettertype': {
    en: 'Font {naam} is missing; we use {vervanger}.',
    de: 'Schriftart {naam} fehlt; wir verwenden {vervanger}.',
    fr: 'La police {naam} manque ; nous utilisons {vervanger}.',
    nl: 'Lettertype {naam} ontbreekt; we gebruiken {vervanger}.'
  },
  'ls.logo': {
    en: 'Only use logos you are allowed to use.',
    de: 'Verwende nur Logos, die du verwenden darfst.',
    fr: "N'utilise que des logos que tu as le droit d'utiliser.",
    nl: "Gebruik alleen logo's die je mag gebruiken."
  },
  'ls.opslaan': { en: 'Save to OMSI', de: 'In OMSI speichern', fr: 'Enregistrer dans OMSI', nl: 'Opslaan in OMSI' },
  'ls.klaarzetten': { en: 'Prepare for OMSI', de: 'Für OMSI bereitstellen', fr: 'Préparer pour OMSI', nl: 'Klaarzetten voor OMSI' },
  'ls.maken': {
    en: 'Making livery… Adding to OMSI…',
    de: 'Lackierung wird erstellt… In OMSI setzen…',
    fr: 'Création de la livrée… Ajout dans OMSI…',
    nl: 'Lak maken … In OMSI zetten …'
  },
  'ls.eigenLak': { en: '+ Custom livery', de: '+ Eigene Lackierung', fr: '+ Livrée perso', nl: '+ Eigen lak' },
  'ls.eigen': { en: 'Custom', de: 'Eigene', fr: 'Perso', nl: 'Eigen' },
  // ---- de studio voor spelers (L3, §2)
  'ls.lakMaken': { en: 'Make livery', de: 'Lackierung erstellen', fr: 'Créer une livrée', nl: 'Lak maken' },
  'ls.laden': { en: 'Preparing the studio …', de: 'Das Studio wird vorbereitet …', fr: "Préparation de l'atelier …", nl: 'De studio wordt klaargezet …' },
  'ls.tool.vullen': { en: 'Fill', de: 'Füllen', fr: 'Remplir', nl: 'Vullen' },
  'ls.tool.strook': { en: 'Stripe', de: 'Streifen', fr: 'Bande', nl: 'Strook' },
  'ls.tool.tekst': { en: 'Text', de: 'Text', fr: 'Texte', nl: 'Tekst' },
  'ls.tool.afbeelding': { en: 'Image', de: 'Bild', fr: 'Image', nl: 'Afbeelding' },
  'ls.tool.penseel': { en: 'Brush', de: 'Pinsel', fr: 'Pinceau', nl: 'Penseel' },
  'ls.spiegel': { en: 'Mirror', de: 'Spiegeln', fr: 'Miroir', nl: 'Spiegel' },
  'ls.ongedaan': { en: 'Undo (Ctrl+Z)', de: 'Rückgängig (Strg+Z)', fr: 'Annuler (Ctrl+Z)', nl: 'Ongedaan maken (Ctrl+Z)' },
  'ls.opnieuw': { en: 'Redo (Ctrl+Y)', de: 'Wiederholen (Strg+Y)', fr: 'Rétablir (Ctrl+Y)', nl: 'Opnieuw (Ctrl+Y)' },
  'ls.meer': { en: 'More', de: 'Mehr', fr: 'Plus', nl: 'Meer' },
  'ls.naam': { en: 'Name', de: 'Name', fr: 'Nom', nl: 'Naam' },
  'ls.mijnLak': { en: 'My livery {n}', de: 'Meine Lackierung {n}', fr: 'Ma livrée {n}', nl: 'Mijn lak {n}' },
  'ls.omsiOpen': {
    en: 'OMSI is open. Your livery will be added to OMSI as soon as you close OMSI.',
    de: 'OMSI ist offen. Deine Lackierung kommt in OMSI, sobald du OMSI schließt.',
    fr: "OMSI est ouvert. Ta livrée sera ajoutée à OMSI dès que tu fermeras OMSI.",
    nl: 'OMSI is open. Je lak komt in OMSI zodra je OMSI sluit.'
  },
  'ls.stap.maken': { en: 'Making livery …', de: 'Lackierung wird erstellt …', fr: 'Création de la livrée …', nl: 'Lak maken …' },
  'ls.stap.plaatsen': { en: 'Adding to OMSI …', de: 'In OMSI setzen …', fr: 'Ajout dans OMSI …', nl: 'In OMSI zetten …' },
  'ls.stap.klaarzetten': { en: 'Preparing for OMSI …', de: 'Für OMSI bereitstellen …', fr: 'Préparation pour OMSI …', nl: 'Klaarzetten voor OMSI …' },
  'ls.bakken': { en: 'Making the livery for {bus} …', de: 'Lackierung für {bus} wird erstellt …', fr: 'Création de la livrée pour {bus} …', nl: 'Lak maken voor {bus} …' },
  'ls.verderAanpassen': { en: 'Keep editing', de: 'Weiter bearbeiten', fr: 'Continuer à modifier', nl: 'Verder aanpassen' },
  'ls.sluiten': { en: 'Close', de: 'Schließen', fr: 'Fermer', nl: 'Sluiten' },
  'ls.terug': { en: 'Back to the liveries', de: 'Zurück zu den Lackierungen', fr: 'Retour aux livrées', nl: 'Terug naar de kleurstellingen' },
  'ls.annuleren': { en: 'Cancel', de: 'Abbrechen', fr: 'Annuler', nl: 'Annuleren' },
  'ls.klaargezetKort': { en: 'Prepared', de: 'Bereitgestellt', fr: 'Préparée', nl: 'Klaargezet' },
  'ls.bekijk': { en: 'View', de: 'Ansehen', fr: 'Voir', nl: 'Bekijk' },
  'ls.naam.leeg': { en: 'Give the livery a name.', de: 'Gib der Lackierung einen Namen.', fr: 'Donne un nom à la livrée.', nl: 'Geef de lak een naam.' },
  'ls.naam.lang': { en: 'At most {max} characters.', de: 'Höchstens {max} Zeichen.', fr: '{max} caractères au maximum.', nl: 'Hooguit {max} tekens.' },
  'ls.naam.rand': { en: 'No space at the start or end.', de: 'Kein Leerzeichen am Anfang oder Ende.', fr: "Pas d'espace au début ni à la fin.", nl: 'Geen spatie aan het begin of eind.' },
  'ls.naam.haak': { en: "A name can't start with [.", de: 'Ein Name darf nicht mit [ beginnen.', fr: 'Un nom ne peut pas commencer par [.', nl: 'Een naam mag niet met [ beginnen.' },
  'ls.naam.gereserveerd': { en: 'OMSI uses that name itself.', de: 'Diesen Namen verwendet OMSI selbst.', fr: 'OMSI utilise ce nom lui-même.', nl: 'Die naam gebruikt OMSI zelf.' },
  'ls.fout.formaat': {
    en: 'The livery could not be made ({detail}).',
    de: 'Die Lackierung konnte nicht erstellt werden ({detail}).',
    fr: "La livrée n'a pas pu être créée ({detail}).",
    nl: 'De lak kon niet gemaakt worden ({detail}).'
  },
  'ls.fout.bestaat': {
    en: "A file already exists there. We don't overwrite anything.",
    de: 'Dort liegt schon eine Datei. Wir überschreiben nichts.',
    fr: "Un fichier existe déjà à cet endroit. Nous n'écrasons rien.",
    nl: 'Daar staat al een bestand. We overschrijven niets.'
  },
  'ls.fout.ruimte': { en: 'There is not enough disk space.', de: 'Es ist nicht genug Speicherplatz frei.', fr: "Il n'y a pas assez d'espace disque.", nl: 'Er is niet genoeg ruimte op de schijf.' },
  'ls.fout.fout': { en: 'Something went wrong: {detail}', de: 'Etwas ist schiefgegangen: {detail}', fr: "Quelque chose s'est mal passé : {detail}", nl: 'Er ging iets mis: {detail}' },
  'ls.handmatig.weggooien': { en: 'Discard the change and save', de: 'Änderung verwerfen und speichern', fr: 'Annuler la modification et enregistrer', nl: 'Wijziging weggooien en opslaan' },
  'ls.handmatig.nieuw': { en: 'Save as a new livery', de: 'Als neue Lackierung speichern', fr: 'Enregistrer comme nouvelle livrée', nl: 'Als nieuwe lak opslaan' },
  'ls.handmatig.alles': { en: 'Remove everything', de: 'Alles entfernen', fr: 'Tout retirer', nl: 'Alles weghalen' },
  'ls.handmatig.laten': { en: 'Leave everything', de: 'Alles stehen lassen', fr: 'Tout laisser', nl: 'Alles laten staan' },
  'ls.verwijder.zeker': {
    en: "Remove '{naam}' from OMSI? Your design is kept.",
    de: "'{naam}' aus OMSI entfernen? Dein Entwurf bleibt gespeichert.",
    fr: "Retirer '{naam}' d'OMSI ? Ton projet est conservé.",
    nl: "'{naam}' uit OMSI weghalen? Je ontwerp blijft bewaard."
  },
  'ls.verwijderd': { en: "'{naam}' has been removed from OMSI.", de: "'{naam}' wurde aus OMSI entfernt.", fr: "'{naam}' a été retirée d'OMSI.", nl: "'{naam}' is uit OMSI gehaald." },
  'ls.verwijder.omsi': {
    en: 'OMSI is open. Close OMSI first, then remove the livery.',
    de: 'OMSI ist offen. Schließe zuerst OMSI, dann entferne die Lackierung.',
    fr: "OMSI est ouvert. Ferme d'abord OMSI, puis retire la livrée.",
    nl: 'OMSI is open. Sluit eerst OMSI, en haal de lak daarna weg.'
  },
  // Snelle lak (§2.1)
  'ls.snel.titel': { en: 'Quick livery', de: 'Schnelllackierung', fr: 'Livrée rapide', nl: 'Snelle lak' },
  'ls.kleur.titel': { en: 'Colour', de: 'Farbe', fr: 'Couleur', nl: 'Kleur' },
  'ls.snel.kleuren': { en: 'Colours', de: 'Farben', fr: 'Couleurs', nl: 'Kleuren' },
  'ls.snel.kleur1': { en: 'Colour 1: body', de: 'Farbe 1: Karosserie', fr: 'Couleur 1 : carrosserie', nl: 'Kleur 1: carrosserie' },
  'ls.snel.kleur2': { en: 'Colour 2: stripe', de: 'Farbe 2: Streifen', fr: 'Couleur 2 : bande', nl: 'Kleur 2: strook' },
  'ls.snel.kleur3': { en: 'Colour 3: text', de: 'Farbe 3: Text', fr: 'Couleur 3 : texte', nl: 'Kleur 3: tekst' },
  'ls.snel.strook': { en: 'Stripe', de: 'Streifen', fr: 'Bande', nl: 'Strook' },
  'ls.snel.naam': { en: 'Name on the bus', de: 'Name auf dem Bus', fr: 'Nom sur le bus', nl: 'Naam op de bus' },
  'ls.snel.logo': { en: 'Logo', de: 'Logo', fr: 'Logo', nl: 'Logo' },
  'ls.snel.sleep': { en: 'Drag an image here', de: 'Bild hierher ziehen', fr: 'Glisse une image ici', nl: 'Sleep een afbeelding hierheen' },
  'ls.snel.kies': { en: 'Choose…', de: 'Auswählen…', fr: 'Choisir…', nl: 'Kiezen…' },
  'ls.snel.logoWeg': { en: 'Remove logo', de: 'Logo entfernen', fr: 'Retirer le logo', nl: 'Logo weghalen' },
  'ls.snel.of': { en: 'Or start with:', de: 'Oder beginne mit:', fr: 'Ou commence par :', nl: 'Of begin met:' },
  'ls.verder': { en: 'Continue in the studio', de: 'Weiter im Studio', fr: "Continuer dans l'atelier", nl: 'Verder in de studio' },
  'ls.start.snel': { en: 'Quick livery', de: 'Schnelllackierung', fr: 'Livrée rapide', nl: 'Snelle lak' },
  'ls.start.effenKleuren': {
    en: 'Plain in the colours of this livery',
    de: 'Einfarbig in den Farben dieser Lackierung',
    fr: 'Uni dans les couleurs de cette livrée',
    nl: 'Effen in de kleuren van deze lak'
  },
  'ls.start.precies': { en: 'This livery exactly', de: 'Genau diese Lackierung', fr: 'Exactement cette livrée', nl: 'Deze lak precies' },
  'ls.start.effen': { en: 'Plain', de: 'Einfarbig', fr: 'Uni', nl: 'Effen' },
  'ls.strook.onderband': { en: 'Lower band', de: 'Unteres Band', fr: 'Bande basse', nl: 'Onderband' },
  'ls.strook.raamband': { en: 'Window band', de: 'Fensterband', fr: 'Bande de fenêtres', nl: 'Raamband' },
  'ls.strook.dakband': { en: 'Roof band', de: 'Dachband', fr: 'Bande de toit', nl: 'Dakband' },
  'ls.strook.schuin': { en: 'Diagonal stripe', de: 'Schräger Streifen', fr: 'Bande oblique', nl: 'Schuine streep' },
  'ls.strook.golf': { en: 'Wave', de: 'Welle', fr: 'Vague', nl: 'Golf' },
  'ls.strook.tweekleurig': { en: 'Two-tone', de: 'Zweifarbig', fr: 'Bicolore', nl: 'Tweekleurig' },
  'ls.strook.frontvlak': { en: 'Front face', de: 'Frontfläche', fr: 'Face avant', nl: 'Frontvlak' },
  'ls.strook.achtervlak': { en: 'Rear face', de: 'Heckfläche', fr: 'Face arrière', nl: 'Achtervlak' },
  // Lagen
  'ls.lagen': { en: 'Layers', de: 'Ebenen', fr: 'Calques', nl: 'Lagen' },
  'ls.lagen.leeg': {
    en: 'No layers yet. Choose a colour in Quick livery.',
    de: 'Noch keine Ebenen. Wähle eine Farbe in der Schnelllackierung.',
    fr: 'Pas encore de calques. Choisis une couleur dans Livrée rapide.',
    nl: 'Nog geen lagen. Kies een kleur in Snelle lak.'
  },
  'ls.basis': { en: 'Base: {naam}', de: 'Basis: {naam}', fr: 'Base : {naam}', nl: 'Basis: {naam}' },
  'ls.basis.std': { en: 'Standard', de: 'Standard', fr: 'Standard', nl: 'Standaard' },
  'ls.laag.grond': { en: 'Base colour', de: 'Grundfarbe', fr: 'Couleur de base', nl: 'Grondkleur' },
  'ls.laag.tekst': { en: 'Text', de: 'Text', fr: 'Texte', nl: 'Tekst' },
  'ls.laag.logo': { en: 'Logo', de: 'Logo', fr: 'Logo', nl: 'Logo' },
  'ls.laag.zone': { en: 'Zone {n}', de: 'Zone {n}', fr: 'Zone {n}', nl: 'Zone {n}' },
  'ls.laag.vorm': { en: 'Shape', de: 'Form', fr: 'Forme', nl: 'Vorm' },
  'ls.laag.afbeelding': { en: 'Image', de: 'Bild', fr: 'Image', nl: 'Afbeelding' },
  'ls.laag.penseel': { en: 'Brush', de: 'Pinsel', fr: 'Pinceau', nl: 'Penseel' },
  'ls.laag.zichtbaar': { en: 'Visible', de: 'Sichtbar', fr: 'Visible', nl: 'Zichtbaar' },
  'ls.laag.naam': { en: 'Layer name', de: 'Name der Ebene', fr: 'Nom du calque', nl: 'Naam van de laag' },
  'ls.laag.dekking': { en: 'Opacity', de: 'Deckkraft', fr: 'Opacité', nl: 'Dekking' },
  'ls.laag.detail': { en: 'Keep details', de: 'Details behalten', fr: 'Garder les détails', nl: 'Details behouden' },
  'ls.laag.rubbers': { en: 'Also over rubbers and lights', de: 'Auch über Gummis und Leuchten', fr: 'Aussi sur les joints et les feux', nl: 'Ook over rubbers en lampen' },
  'ls.laag.vergrendel': { en: 'Lock', de: 'Sperren', fr: 'Verrouiller', nl: 'Vergrendelen' },
  'ls.laag.dupliceer': { en: 'Duplicate', de: 'Duplizieren', fr: 'Dupliquer', nl: 'Dupliceren' },
  'ls.laag.weg': { en: 'Delete', de: 'Löschen', fr: 'Supprimer', nl: 'Verwijderen' },
  'ls.laag.omhoog': { en: 'Up', de: 'Nach oben', fr: 'Monter', nl: 'Omhoog' },
  'ls.laag.omlaag': { en: 'Down', de: 'Nach unten', fr: 'Descendre', nl: 'Omlaag' },
  'ls.laag.spiegel': { en: 'Also on the other side', de: 'Auch auf der anderen Seite', fr: "Aussi de l'autre côté", nl: 'Ook aan de andere kant' },
  'ls.laag.richting': { en: 'Same direction', de: 'Gleiche Richtung', fr: 'Même sens', nl: 'Zelfde richting' },
  'ls.laag.draai': { en: 'Rotate (°)', de: 'Drehen (°)', fr: 'Rotation (°)', nl: 'Draaien (°)' },
  'ls.laag.kleur': { en: 'Colour', de: 'Farbe', fr: 'Couleur', nl: 'Kleur' },
  // Gereedschap
  'ls.vul.uitleg': {
    en: 'Click the bus: the whole colour zone gets this colour, on all sides.',
    de: 'Klicke auf den Bus: Die ganze Farbzone bekommt diese Farbe, auf allen Seiten.',
    fr: 'Clique sur le bus : toute la zone de couleur prend cette couleur, de tous les côtés.',
    nl: 'Klik op de bus: de hele kleurzone krijgt deze kleur, aan alle kanten.'
  },
  'ls.vul.zones': { en: 'Colour zones of this livery', de: 'Farbzonen dieser Lackierung', fr: 'Zones de couleur de cette livrée', nl: 'Kleurzones van deze lak' },
  'ls.strook.uitleg': {
    en: 'Drag the edges on the bus; they snap to the window line and the middle line.',
    de: 'Ziehe die Kanten auf dem Bus; sie rasten an der Fensterlinie und der Mittellinie ein.',
    fr: 'Fais glisser les bords sur le bus ; ils s’accrochent à la ligne des fenêtres et à la ligne médiane.',
    nl: 'Sleep de randen op de bus; ze klikken vast aan de raamlijn en de middenlijn.'
  },
  'ls.strook.nieuw': { en: 'Add stripe', de: 'Streifen hinzufügen', fr: 'Ajouter une bande', nl: 'Strook erbij' },
  'ls.strook.rondom': { en: 'All around', de: 'Rundum', fr: 'Tout autour', nl: 'Rondom' },
  'ls.strook.zijden': { en: 'Sides only', de: 'Nur die Seiten', fr: 'Côtés seulement', nl: 'Alleen de zijkanten' },
  'ls.strook.onder': { en: 'Bottom edge (cm)', de: 'Unterkante (cm)', fr: 'Bord inférieur (cm)', nl: 'Onderkant (cm)' },
  'ls.strook.boven': { en: 'Top edge (cm)', de: 'Oberkante (cm)', fr: 'Bord supérieur (cm)', nl: 'Bovenkant (cm)' },
  'ls.strook.hoek': { en: 'Angle (°)', de: 'Winkel (°)', fr: 'Angle (°)', nl: 'Hoek (°)' },
  'ls.strook.golfHoogte': { en: 'Wave height (cm)', de: 'Wellenhöhe (cm)', fr: 'Hauteur de vague (cm)', nl: 'Golfhoogte (cm)' },
  'ls.raamlijn': { en: 'window line', de: 'Fensterlinie', fr: 'ligne des fenêtres', nl: 'raamlijn' },
  'ls.middenlijn': { en: 'middle line', de: 'Mittellinie', fr: 'ligne médiane', nl: 'middenlijn' },
  'ls.tekst.uitleg': {
    en: 'Click the bus to place a text; drag it to move it.',
    de: 'Klicke auf den Bus, um einen Text zu setzen; ziehe ihn, um ihn zu verschieben.',
    fr: 'Clique sur le bus pour placer un texte ; fais-le glisser pour le déplacer.',
    nl: 'Klik op de bus om een tekst te zetten; sleep hem om hem te verplaatsen.'
  },
  'ls.tekst.voorbeeld': { en: 'Text', de: 'Text', fr: 'Texte', nl: 'Tekst' },
  'ls.tekst.lettertype': { en: 'Font', de: 'Schriftart', fr: 'Police', nl: 'Lettertype' },
  'ls.tekst.ofl': { en: 'Included', de: 'Mitgeliefert', fr: 'Incluses', nl: 'Meegeleverd' },
  'ls.tekst.windows': { en: 'Windows', de: 'Windows', fr: 'Windows', nl: 'Windows' },
  'ls.tekst.meer': { en: 'More Windows fonts…', de: 'Weitere Windows-Schriften…', fr: 'Plus de polices Windows…', nl: 'Meer lettertypen van Windows…' },
  'ls.tekst.hoogte': { en: 'Letter height (cm)', de: 'Buchstabenhöhe (cm)', fr: 'Hauteur des lettres (cm)', nl: 'Letterhoogte (cm)' },
  'ls.tekst.omlijning': { en: 'Outline', de: 'Kontur', fr: 'Contour', nl: 'Omlijning' },
  'ls.tekst.omlijningDik': { en: 'Thickness (cm)', de: 'Stärke (cm)', fr: 'Épaisseur (cm)', nl: 'Dikte (cm)' },
  'ls.tekst.afstand': { en: 'Letter spacing (%)', de: 'Buchstabenabstand (%)', fr: 'Espacement (%)', nl: 'Letterafstand (%)' },
  'ls.afb.uitleg': {
    en: 'Your own image (PNG, JPG, WebP or SVG, at most 20 MB) or a shape. It goes on the side you are looking at; drag it afterwards.',
    de: 'Ein eigenes Bild (PNG, JPG, WebP oder SVG, höchstens 20 MB) oder eine Form. Es kommt auf die Seite, die du siehst; ziehe es danach.',
    fr: 'Ta propre image (PNG, JPG, WebP ou SVG, 20 Mo au maximum) ou une forme. Elle va sur le côté que tu regardes ; fais-la glisser ensuite.',
    nl: 'Een eigen beeld (PNG, JPG, WebP of SVG, hooguit 20 MB) of een vorm. Het komt op de kant die je ziet; sleep het daarna.'
  },
  'ls.afb.kies': { en: 'Choose image…', de: 'Bild auswählen…', fr: 'Choisir une image…', nl: 'Afbeelding kiezen…' },
  'ls.afb.wit': { en: 'White becomes transparent', de: 'Weiß wird transparent', fr: 'Le blanc devient transparent', nl: 'Wit wordt doorzichtig' },
  'ls.afb.breedte': { en: 'Width (cm)', de: 'Breite (cm)', fr: 'Largeur (cm)', nl: 'Breedte (cm)' },
  'ls.afb.vormen': { en: 'Shapes', de: 'Formen', fr: 'Formes', nl: 'Vormen' },
  'ls.afb.fout.soort': {
    en: 'The studio cannot read this image. Use PNG, JPG, WebP or SVG.',
    de: 'Dieses Bild kann das Studio nicht lesen. Verwende PNG, JPG, WebP oder SVG.',
    fr: "L'atelier ne peut pas lire cette image. Utilise PNG, JPG, WebP ou SVG.",
    nl: 'Dit beeld kan de studio niet lezen. Gebruik PNG, JPG, WebP of SVG.'
  },
  'ls.afb.fout.groot': { en: 'This image is larger than 20 MB.', de: 'Dieses Bild ist größer als 20 MB.', fr: 'Cette image dépasse 20 Mo.', nl: 'Dit beeld is groter dan 20 MB.' },
  'ls.afb.fout.stuk': { en: 'This image is damaged or unreadable.', de: 'Dieses Bild ist beschädigt oder unlesbar.', fr: 'Cette image est endommagée ou illisible.', nl: 'Dit beeld is beschadigd of onleesbaar.' },
  'ls.vorm.pijl': { en: 'Arrow', de: 'Pfeil', fr: 'Flèche', nl: 'Pijl' },
  'ls.vorm.streep': { en: 'Bar', de: 'Balken', fr: 'Barre', nl: 'Streep' },
  'ls.vorm.cirkel': { en: 'Circle', de: 'Kreis', fr: 'Cercle', nl: 'Cirkel' },
  'ls.vorm.ster': { en: 'Star', de: 'Stern', fr: 'Étoile', nl: 'Ster' },
  'ls.vorm.golf': { en: 'Wave', de: 'Welle', fr: 'Vague', nl: 'Golf' },
  'ls.vorm.rolstoel': { en: 'Wheelchair', de: 'Rollstuhl', fr: 'Fauteuil roulant', nl: 'Rolstoel' },
  'ls.vorm.kinderwagen': { en: 'Pram', de: 'Kinderwagen', fr: 'Poussette', nl: 'Kinderwagen' },
  'ls.vorm.fiets': { en: 'Bicycle', de: 'Fahrrad', fr: 'Vélo', nl: 'Fiets' },
  'ls.vorm.kader': { en: 'Frame for a coat of arms', de: 'Rahmen für ein Stadtwappen', fr: 'Cadre pour des armoiries', nl: 'Kader voor een stadswapen' },
  'ls.penseel.uitleg': {
    en: 'Paint on the bus. What you see is what you paint; nothing goes through the bus.',
    de: 'Male auf den Bus. Was du siehst, bemalst du; nichts geht durch den Bus hindurch.',
    fr: 'Peins sur le bus. Ce que tu vois, tu le peins ; rien ne traverse le bus.',
    nl: 'Schilder op de bus. Wat je ziet, verf je; niets gaat door de bus heen.'
  },
  'ls.penseel.maat': { en: 'Size (cm)', de: 'Größe (cm)', fr: 'Taille (cm)', nl: 'Maat (cm)' },
  'ls.penseel.hardheid': { en: 'Hardness', de: 'Härte', fr: 'Dureté', nl: 'Hardheid' },
  'ls.penseel.dekking': { en: 'Opacity', de: 'Deckkraft', fr: 'Opacité', nl: 'Dekking' },
  'ls.penseel.gum': { en: 'Eraser (E)', de: 'Radierer (E)', fr: 'Gomme (E)', nl: 'Gum (E)' },
  'ls.penseel.vol': {
    en: 'There can be at most two brush layers. Pick one in the layer list.',
    de: 'Es kann höchstens zwei Pinselebenen geben. Wähle eine in der Ebenenliste.',
    fr: 'Il peut y avoir au plus deux calques de pinceau. Choisis-en un dans la liste.',
    nl: 'Er kunnen hooguit twee penseellagen zijn. Kies er een in de lagenlijst.'
  },
  // Meer
  'ls.meer.opties': { en: 'Bus options', de: 'Busoptionen', fr: 'Options du bus', nl: 'Busopties' },
  'ls.meer.snel': { en: 'Quick livery again', de: 'Schnelllackierung neu', fr: 'Livrée rapide à nouveau', nl: 'Snelle lak opnieuw' },
  'ls.meer.start': { en: 'Change start', de: 'Start wechseln', fr: 'Changer de départ', nl: 'Start wisselen' },
  'ls.meer.vlak': { en: 'Mirror plane', de: 'Spiegelebene', fr: 'Plan de symétrie', nl: 'Spiegelvlak' },
  'ls.meer.ontwerp': {
    en: 'Open or export design (later)',
    de: 'Entwurf öffnen oder exportieren (später)',
    fr: 'Ouvrir ou exporter le projet (plus tard)',
    nl: 'Ontwerp openen of exporteren (later)'
  },
  'ls.meer.verwijder': { en: 'Remove from OMSI', de: 'Aus OMSI entfernen', fr: "Retirer d'OMSI", nl: 'Verwijderen uit OMSI' },
  'ls.opties.uitleg': {
    en: 'Parts that OMSI shows or hides with this livery.',
    de: 'Teile, die OMSI mit dieser Lackierung zeigt oder versteckt.',
    fr: 'Pièces qu’OMSI affiche ou masque avec cette livrée.',
    nl: 'Onderdelen die OMSI met deze kleurstelling toont of verbergt.'
  },
  'ls.opties.techniek': { en: 'Technology', de: 'Technik', fr: 'Technique', nl: 'Techniek' },
  'ls.opties.techniekUitleg': { en: 'Changes how the bus works.', de: 'Ändert, wie der Bus funktioniert.', fr: 'Change le fonctionnement du bus.', nl: 'Verandert hoe de bus werkt.' },
  'ls.opties.geen': { en: 'This bus has no bus options.', de: 'Dieser Bus hat keine Busoptionen.', fr: "Ce bus n'a pas d'options.", nl: 'Deze bus heeft geen busopties.' },
  'ls.opties.waarde': { en: 'Value', de: 'Wert', fr: 'Valeur', nl: 'Waarde' },
  'ls.vlak.uitleg': {
    en: 'The mirror plane lies in the middle of the bus. Shift it if the two sides are not the same.',
    de: 'Die Spiegelebene liegt in der Mitte des Busses. Verschiebe sie, wenn die beiden Seiten nicht gleich sind.',
    fr: 'Le plan de symétrie est au milieu du bus. Déplace-le si les deux côtés ne sont pas identiques.',
    nl: 'Het spiegelvlak ligt in het midden van de bus. Verschuif het als de twee kanten niet gelijk zijn.'
  },
  'ls.vlak.schuif': { en: 'Shift (cm)', de: 'Verschieben (cm)', fr: 'Décaler (cm)', nl: 'Verschuiven (cm)' },
  'ls.spiegel.tip': {
    en: 'Also on the other side. Turn off with [Mirror].',
    de: 'Auch auf der anderen Seite. Ausschalten mit [Spiegeln].',
    fr: "Aussi de l'autre côté. Désactiver avec [Miroir].",
    nl: 'Ook aan de andere kant. Uitzetten met [Spiegel].'
  },
  'ls.spiegel.anderKant': { en: 'The other side', de: 'Die andere Seite', fr: "L'autre côté", nl: 'De andere kant' },
  // Onderbalk
  'ls.zicht.links': { en: 'Left', de: 'Links', fr: 'Gauche', nl: 'Links' },
  'ls.zicht.rechts': { en: 'Right', de: 'Rechts', fr: 'Droite', nl: 'Rechts' },
  'ls.zicht.voor': { en: 'Front', de: 'Vorne', fr: 'Avant', nl: 'Voor' },
  'ls.zicht.achter': { en: 'Rear', de: 'Hinten', fr: 'Arrière', nl: 'Achter' },
  'ls.zicht.dak': { en: 'Roof', de: 'Dach', fr: 'Toit', nl: 'Dak' },
  'ls.zicht.schuin': { en: 'Angled', de: 'Schräg', fr: 'En biais', nl: 'Schuin' },
  'ls.voorna': { en: 'Before/after', de: 'Vorher/nachher', fr: 'Avant/après', nl: 'Voor/na' },
  'ls.voorna.uitleg': {
    en: 'Hold to see the original (or hold O).',
    de: 'Gedrückt halten für das Original (oder O halten).',
    fr: "Maintenir pour voir l'original (ou maintenir O).",
    nl: 'Ingedrukt houden toont het origineel (of O ingedrukt houden).'
  },
  'ls.dag': { en: 'Day', de: 'Tag', fr: 'Jour', nl: 'Dag' },
  'ls.status': { en: 'Livery {b}×{h} · {texels} texels/m', de: 'Lackierung {b}×{h} · {texels} Texel/m', fr: 'Livrée {b}×{h} · {texels} texels/m', nl: 'Lak {b}×{h} · {texels} texels/m' },
  'ls.status.ookOp': { en: 'also on: {bussen}', de: 'auch auf: {bussen}', fr: 'aussi sur : {bussen}', nl: 'ook op: {bussen}' },
  'ls.kiBussen': { en: '{n} AI buses', de: '{n} KI-Busse', fr: '{n} bus IA', nl: '{n} KI-bussen' },
  // Addons (§5.6-§5.8)
  'ls.ad.titel': { en: 'Custom liveries', de: 'Eigene Lackierungen', fr: 'Livrées personnelles', nl: 'Eigen kleurstellingen' },
  'ls.ad.geen': {
    en: 'No custom liveries yet. Make one with [Make livery] in the bus selection.',
    de: 'Noch keine eigenen Lackierungen. Erstelle eine mit [Lackierung erstellen] in der Busauswahl.',
    fr: 'Pas encore de livrées personnelles. Crée-en une avec [Créer une livrée] dans la sélection de bus.',
    nl: 'Nog geen eigen kleurstellingen. Maak er een met [Lak maken] in de buskeuze.'
  },
  'ls.ad.bewerken': { en: 'Edit', de: 'Bearbeiten', fr: 'Modifier', nl: 'Bewerken' },
  'ls.ad.verwijderen': { en: 'Remove', de: 'Entfernen', fr: 'Supprimer', nl: 'Verwijderen' },
  'ls.ad.ookOntwerp': { en: 'Also throw away the design', de: 'Auch den Entwurf verwerfen', fr: 'Supprimer aussi le projet', nl: 'Ook het ontwerp weggooien' },
  'ls.ad.nietPlaatsen': { en: "Don't add", de: 'Nicht einsetzen', fr: 'Ne pas ajouter', nl: 'Niet plaatsen' },
  'ls.ad.overnemen': { en: 'Adopt', de: 'Übernehmen', fr: 'Reprendre', nl: 'Overnemen' },
  'ls.ad.versie': { en: 'version {v} · {n} files', de: 'Version {v} · {n} Dateien', fr: 'version {v} · {n} fichiers', nl: 'versie {v} · {n} bestanden' },
  'ls.ad.uit': {
    en: 'Custom liveries appear here once the 3D view is switched on (Settings → App).',
    de: 'Eigene Lackierungen erscheinen hier, sobald die 3D-Ansicht eingeschaltet ist (Einstellungen → App).',
    fr: 'Les livrées personnelles apparaissent ici une fois la vue 3D activée (Réglages → App).',
    nl: 'Eigen kleurstellingen staan hier zodra de 3D-weergave aan staat (Instellingen → App).'
  },
  // ---- het ontwikkelpaneel van het lakdoek (L1, alleen met ?lakdev=1)
  'ls.dev.titel': { en: 'Paint canvas (developer)', de: 'Lackleinwand (Entwickler)', fr: 'Toile de peinture (développeur)', nl: 'Lakdoek (ontwikkelaar)' },
  'ls.dev.doel': {
    en: 'Target {id}: {naam}, {b}×{h}, {texels} texels/m, shared {gedeeld}%, covered {gedekt}%',
    de: 'Ziel {id}: {naam}, {b}×{h}, {texels} Texel/m, geteilt {gedeeld}%, bedeckt {gedekt}%',
    fr: 'Cible {id} : {naam}, {b}×{h}, {texels} texels/m, partagé {gedeeld} %, couvert {gedekt} %',
    nl: 'Doel {id}: {naam}, {b}×{h}, {texels} texels/m, gedeeld {gedeeld}%, gedekt {gedekt}%'
  },
  'ls.dev.masker': { en: 'Show mask', de: 'Maske zeigen', fr: 'Afficher le masque', nl: 'Masker tonen' },
  'ls.dev.kleur': { en: 'Fill colour', de: 'Füllfarbe', fr: 'Couleur de remplissage', nl: 'Vulkleur' },
  'ls.dev.export': { en: 'Export', de: 'Exportieren', fr: 'Exporter', nl: 'Exporteren' },
  'ls.dev.strook': { en: 'Stripe', de: 'Streifen', fr: 'Bande', nl: 'Strook' },
  'ls.dev.stand.links': { en: 'Left', de: 'Links', fr: 'Gauche', nl: 'Links' },
  'ls.dev.stand.rechts': { en: 'Right', de: 'Rechts', fr: 'Droite', nl: 'Rechts' },
  'ls.dev.stand.voorvlak': { en: 'Front', de: 'Front', fr: 'Avant', nl: 'Voorkant' },
  'ls.dev.stand.achtervlak': { en: 'Rear', de: 'Heck', fr: 'Arrière', nl: 'Achterkant' },
  'ls.dev.stand.dak': { en: 'Roof', de: 'Dach', fr: 'Toit', nl: 'Dak' },
  'ls.dev.stand.schuin': { en: 'Angled', de: 'Schräg', fr: 'En biais', nl: 'Schuin' },
  'ls.dev.tekst': { en: '+ Text', de: '+ Text', fr: '+ Texte', nl: '+ Tekst' },
  'ls.dev.tweede': { en: 'Second view', de: 'Zweite Ansicht', fr: 'Deuxième vue', nl: 'Tweede beeld' },
  'ls.dev.aanwijzen': { en: 'Pick (centre)', de: 'Zeigen (Mitte)', fr: 'Désigner (centre)', nl: 'Aanwijzen (midden)' },
  'ls.dev.herstart': {
    en: 'The graphics card was reset: the canvas restarted in light mode.',
    de: 'Die Grafikkarte wurde zurückgesetzt: die Leinwand läuft wieder, im leichten Modus.',
    fr: 'La carte graphique a été réinitialisée : la toile a redémarré en mode léger.',
    nl: 'De videokaart is opnieuw begonnen: het lakdoek draait weer, in de lichte stand.'
  }
} as const
