/*
 * Teksten van de meetstand (ronde 0 van de voorvallen; zie shared/meetstand.ts
 * en design/ontwerpen/ronde0-meten.md). Een stand voor de ontwikkelaar, maar
 * hij staat in de instellingen en op de telefoon, dus in vier talen.
 */
export const TEKST_MEETSTAND = {
  'meet.settingTitle': {
    en: 'Measuring mode (for the developer)',
    de: 'Messmodus (für den Entwickler)',
    fr: 'Mode mesure (pour le développeur)',
    nl: 'Meetstand (voor de ontwikkelaar)'
  },
  'meet.settingIntro': {
    en: 'Records what OMSI reports during a duty or free drive, four times a second, with a checklist on the phone. Only needed to prepare the in-ride events; it asks the plugin for many more values. Off by default.',
    de: 'Zeichnet während eines Dienstes oder einer freien Fahrt viermal pro Sekunde auf, was OMSI meldet, mit einer Checkliste auf dem Telefon. Nur zur Vorbereitung der Ereignisse unterwegs nötig; fragt das Plugin nach viel mehr Werten. Standardmäßig aus.',
    fr: 'Enregistre ce que signale OMSI pendant un service ou une conduite libre, quatre fois par seconde, avec une liste à cocher sur le téléphone. Utile seulement pour préparer les incidents en route ; demande beaucoup plus de valeurs au plugin. Désactivé par défaut.',
    nl: 'Legt tijdens een dienst of vrije rit vier keer per seconde vast wat OMSI doorgeeft, met een afvinklijst op de telefoon. Alleen nodig om de voorvallen onderweg voor te bereiden; vraagt de plugin veel meer getallen. Standaard uit.'
  },
  'meet.aan': { en: 'On', de: 'An', fr: 'Activé', nl: 'Aan' },
  'meet.uit': { en: 'Off', de: 'Aus', fr: 'Désactivé', nl: 'Uit' },
  'meet.opslaan': { en: 'Save measurement', de: 'Messung speichern', fr: 'Enregistrer la mesure', nl: 'Meting opslaan' },
  'meet.openMap': { en: 'Open measurements folder', de: 'Ordner mit Messungen öffnen', fr: 'Ouvrir le dossier des mesures', nl: 'Map met metingen openen' },
  'meet.opgeslagen': {
    en: 'Saved as {bestand}. Send that file.',
    de: 'Gespeichert als {bestand}. Diese Datei verschicken.',
    fr: 'Enregistré sous {bestand}. Envoyez ce fichier.',
    nl: 'Opgeslagen als {bestand}. Stuur dat bestand op.'
  },
  'meet.nietsOpgeslagen': {
    en: 'Nothing measured yet.',
    de: 'Noch nichts gemessen.',
    fr: 'Rien de mesuré pour l’instant.',
    nl: 'Er is nog niets gemeten.'
  },
  'meet.app': { en: 'Measure', de: 'Messung', fr: 'Mesure', nl: 'Meting' },
  'meet.titel': { en: 'Measurement, round 0', de: 'Messung, Runde 0', fr: 'Mesure, tour 0', nl: 'Meting, ronde 0' },
  'meet.loopt': {
    en: '{bus} · {regels} lines · {tijd}',
    de: '{bus} · {regels} Zeilen · {tijd}',
    fr: '{bus} · {regels} lignes · {tijd}',
    nl: '{bus} · {regels} regels · {tijd}'
  },
  'meet.wacht': {
    en: 'Waiting for a duty or free drive with OMSI running.',
    de: 'Wartet auf einen Dienst oder eine freie Fahrt mit laufendem OMSI.',
    fr: 'En attente d’un service ou d’une conduite libre avec OMSI lancé.',
    nl: 'Wacht op een dienst of vrije rit terwijl OMSI draait.'
  },
  'meet.rust': {
    en: 'Measurement saved. A new one starts with the next duty or free drive.',
    de: 'Messung gespeichert. Eine neue beginnt mit dem nächsten Dienst oder der nächsten freien Fahrt.',
    fr: 'Mesure enregistrée. Une nouvelle commence au prochain service ou à la prochaine conduite libre.',
    nl: 'Meting opgeslagen. Een nieuwe begint bij de volgende dienst of vrije rit.'
  },
  'meet.vol': {
    en: 'The measurement is full (250 MB). Save it; nothing more is recorded until then.',
    de: 'Die Messung ist voll (250 MB). Speichere sie; bis dahin wird nichts mehr aufgezeichnet.',
    fr: 'La mesure est pleine (250 Mo). Enregistrez-la ; rien n’est plus enregistré d’ici là.',
    nl: 'De meting is vol (250 MB). Sla hem op; tot dan komt er niets meer bij.'
  },
  'meet.bekijken': {
    en: 'This app is in view-only mode: a measurement would be lost when it closes, so it does not measure.',
    de: 'Diese App ist im Nur-Ansehen-Modus: Eine Messung ginge beim Schließen verloren, deshalb misst sie nicht.',
    fr: 'Cette application est en mode consultation : une mesure serait perdue à la fermeture, elle ne mesure donc pas.',
    nl: 'Deze app staat op alleen bekijken: een meting zou verloren gaan zodra hij sluit, dus hij meet niet.'
  },
  'meet.afgevallen': {
    en: '{n} names did not fit in the 512',
    de: '{n} Namen passten nicht in die 512',
    fr: '{n} noms n’ont pas tenu dans les 512',
    nl: '{n} namen vielen buiten de 512'
  },
  'meet.vinkUitleg': {
    en: 'Tick a step while the bus is in that state (knelt, lights on) and hold it 3 seconds: the app then records every value of the bus.',
    de: 'Hake einen Schritt ab, während der Bus in diesem Zustand ist (abgesenkt, Licht an), und halte ihn 3 Sekunden: dann hält die App alle Werte des Busses fest.',
    fr: 'Cochez une étape pendant que le bus est dans cet état (agenouillé, feux allumés) et gardez-le 3 secondes : l’application enregistre alors toutes les valeurs du bus.',
    nl: 'Vink een stap af terwijl de bus in die stand staat (geknield, lichten aan) en houd hem 3 tellen vast: dan legt de app alle getallen van de bus vast.'
  },
  'meet.stap.halte': { en: 'Stop at a bus stop', de: 'An einer Haltestelle halten', fr: 'S’arrêter à un arrêt', nl: 'Stoppen bij een halte' },
  'meet.stap.halte.uitleg': {
    en: 'Approach a stop as usual, stand with the doors open, tick, then close and drive off.',
    de: 'Fahre wie immer eine Haltestelle an, stehe mit offenen Türen, hake ab, dann schließen und losfahren.',
    fr: 'Approchez un arrêt comme d’habitude, restez portes ouvertes, cochez, puis fermez et repartez.',
    nl: 'Rij een halte aan zoals altijd, sta stil met de deuren open, vink af, dan dicht en wegrijden.'
  },
  'meet.stap.deuren': { en: 'Each door separately', de: 'Jede Tür einzeln', fr: 'Chaque porte séparément', nl: 'Elke deur apart' },
  'meet.stap.deuren.uitleg': {
    en: 'Standing still: open and close each door on its own, front to back, a few seconds apart. Tick after the last one.',
    de: 'Im Stand: jede Tür einzeln öffnen und schließen, von vorn nach hinten, ein paar Sekunden dazwischen. Nach der letzten abhaken.',
    fr: 'À l’arrêt : ouvrez et fermez chaque porte seule, de l’avant vers l’arrière, à quelques secondes d’intervalle. Cochez après la dernière.',
    nl: 'Stilstaand: open en sluit elke deur apart, van voor naar achter, met een paar tellen ertussen. Vink af na de laatste.'
  },
  'meet.stap.knielen': { en: 'Kneeling', de: 'Absenken (Kneeling)', fr: 'Agenouillement', nl: 'Knielen' },
  'meet.stap.knielen.uitleg': {
    en: 'Let the bus kneel, tick while it is down, wait 3 seconds, raise it again.',
    de: 'Bus absenken, abhaken solange er unten ist, 3 Sekunden warten, wieder anheben.',
    fr: 'Faites s’agenouiller le bus, cochez pendant qu’il est bas, attendez 3 secondes, relevez-le.',
    nl: 'Laat de bus knielen, vink af terwijl hij laag staat, wacht 3 tellen, zet hem weer omhoog.'
  },
  'meet.stap.oprijplaat': { en: 'Ramp', de: 'Rampe', fr: 'Rampe', nl: 'Oprijplaat' },
  'meet.stap.oprijplaat.uitleg': {
    en: 'Fold the ramp out, tick while it is out, then fold it back in. Skip if the bus has none.',
    de: 'Rampe ausklappen, abhaken solange sie draußen ist, dann einklappen. Überspringen, wenn der Bus keine hat.',
    fr: 'Dépliez la rampe, cochez pendant qu’elle est sortie, puis repliez-la. À sauter si le bus n’en a pas.',
    nl: 'Klap de oprijplaat uit, vink af terwijl hij uit is, klap hem weer in. Sla over als de bus er geen heeft.'
  },
  'meet.stap.alarmlicht': { en: 'Hazard lights', de: 'Warnblinker', fr: 'Feux de détresse', nl: 'Alarmlichten' },
  'meet.stap.alarmlicht.uitleg': {
    en: 'Hazard lights on, tick while they flash, wait 3 seconds, off again.',
    de: 'Warnblinker an, abhaken während er blinkt, 3 Sekunden warten, wieder aus.',
    fr: 'Feux de détresse allumés, cochez pendant qu’ils clignotent, attendez 3 secondes, éteignez.',
    nl: 'Alarmlichten aan, vink af terwijl ze knipperen, wacht 3 tellen, weer uit.'
  },
  'meet.stap.stopverzoek': { en: 'Stop request', de: 'Haltewunsch', fr: 'Demande d’arrêt', nl: 'Stopverzoek' },
  'meet.stap.stopverzoek.uitleg': {
    en: 'Drive until a passenger presses the stop button; tick while the lamp is lit.',
    de: 'Fahre, bis ein Fahrgast den Haltewunsch drückt; abhaken, solange die Lampe leuchtet.',
    fr: 'Roulez jusqu’à ce qu’un passager appuie sur le bouton d’arrêt ; cochez pendant que le voyant est allumé.',
    nl: 'Rij tot een reiziger op de stopknop drukt; vink af terwijl het lampje brandt.'
  },
  'meet.stap.laatkomer': { en: 'Wait for a latecomer', de: 'Auf einen Nachzügler warten', fr: 'Attendre un retardataire', nl: 'Laatkomer afwachten' },
  'meet.stap.laatkomer.uitleg': {
    en: 'At a stop with people: close all doors, stand still for 20 seconds without driving off. Tick after the 20 seconds.',
    de: 'An einer Haltestelle mit Fahrgästen: alle Türen schließen, 20 Sekunden stehen bleiben, nicht losfahren. Nach den 20 Sekunden abhaken.',
    fr: 'À un arrêt avec du monde : fermez toutes les portes, restez 20 secondes à l’arrêt sans partir. Cochez après les 20 secondes.',
    nl: 'Bij een halte met mensen: alle deuren dicht, 20 tellen stilstaan zonder weg te rijden. Vink af na de 20 tellen.'
  },
  'meet.stap.doorrijden': { en: 'Drive past', de: 'Durchfahren', fr: 'Passer sans s’arrêter', nl: 'Doorrijden' },
  'meet.stap.doorrijden.uitleg': {
    en: 'Drive on without stopping, past at least one stop nobody wants. Tick afterwards.',
    de: 'Ohne anzuhalten weiterfahren, an mindestens einer Haltestelle vorbei, an der niemand will. Danach abhaken.',
    fr: 'Continuez sans vous arrêter, devant au moins un arrêt où personne ne veut descendre ni monter. Cochez ensuite.',
    nl: 'Rij door zonder te stoppen, langs minstens één halte waar niemand wil. Vink daarna af.'
  }
} as const satisfies Record<string, { en: string; de: string; fr: string; nl: string }>
