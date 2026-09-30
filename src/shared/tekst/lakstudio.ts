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
