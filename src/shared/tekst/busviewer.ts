/*
 * Teksten van de 3D-weergave van een bus (design/ontwerpen/bus3d.md §8.1, §9,
 * §11.3). Eigen bron met de sleutels `bv.*`, zonder aliassen: de sleutels
 * `bd.v3d.*` uit het vervallen deel G worden nooit gebouwd.
 *
 * Deze eerste lichting hoort bij de renderer (F2, eerste helft): de viewer, zijn
 * knoppen en de terugval. Het venster eromheen (zijpaneel, kiezen, dealer)
 * voegt hier zijn eigen sleutels aan toe.
 */
export const TEKST_BUSVIEWER = {
  'bv.open3d': { en: 'View in 3D', de: 'In 3D ansehen', fr: 'Voir en 3D', nl: 'Bekijk in 3D' },
  'bv.windowTitle': { en: '{naam} · 3D', de: '{naam} · 3D', fr: '{naam} · 3D', nl: '{naam} · 3D' },
  'bv.loading': {
    en: 'Loading 3D model… {klaar} of {totaal} parts',
    de: '3D-Modell wird geladen… {klaar} von {totaal} Teilen',
    fr: 'Chargement du modèle 3D… {klaar} sur {totaal} pièces',
    nl: '3D-model laden… {klaar} van {totaal} onderdelen'
  },
  'bv.loadingTextures': {
    en: 'Loading textures… {klaar} of {totaal}',
    de: 'Texturen werden geladen… {klaar} von {totaal}',
    fr: 'Chargement des textures… {klaar} sur {totaal}',
    nl: 'Texturen laden… {klaar} van {totaal}'
  },
  'bv.partial': {
    en: '{n} parts encrypted, not shown',
    de: '{n} Teile verschlüsselt, nicht angezeigt',
    fr: '{n} pièces chiffrées, non affichées',
    nl: '{n} onderdelen versleuteld, niet getoond'
  },
  'bv.incomplete': {
    en: 'Model incomplete: {n} textures are missing',
    de: 'Modell unvollständig: {n} Texturen fehlen',
    fr: 'Modèle incomplet : {n} textures manquent',
    nl: 'Model onvolledig: {n} texturen ontbreken'
  },
  'bv.noWebgl': {
    en: 'This computer cannot show 3D here (no WebGL 2). You still see the picture.',
    de: 'Dieser Computer kann hier kein 3D zeigen (kein WebGL 2). Du siehst weiterhin das Bild.',
    fr: 'Cet ordinateur ne peut pas afficher la 3D ici (pas de WebGL 2). L’image reste visible.',
    nl: 'Deze computer kan hier geen 3D tonen (geen WebGL 2). Je ziet wel het plaatje.'
  },
  'bv.lost': {
    en: 'The 3D view stopped. Try again?',
    de: 'Die 3D-Ansicht ist stehen geblieben. Noch einmal versuchen?',
    fr: 'La vue 3D s’est arrêtée. Réessayer ?',
    nl: 'De 3D-weergave viel stil. Opnieuw proberen?'
  },
  'bv.failed': {
    en: 'This bus could not be shown in 3D.',
    de: 'Dieser Bus konnte nicht in 3D gezeigt werden.',
    fr: 'Ce bus n’a pas pu être affiché en 3D.',
    nl: 'Deze bus kon niet in 3D getoond worden.'
  },
  'bv.paused': {
    en: '3D paused',
    de: '3D pausiert',
    fr: '3D en pause',
    nl: '3D gepauzeerd'
  },
  'bv.encrypted': {
    en: 'This model is encrypted with a key that is not registered in your OMSI (key {sleutel}). OMSI does not load those parts either, which is why we do not show them.',
    de: 'Dieses Modell ist mit einem Schlüssel verschlüsselt, der in deinem OMSI nicht registriert ist (Schlüssel {sleutel}). OMSI lädt diese Teile ebenfalls nicht, deshalb zeigen wir sie nicht.',
    fr: 'Ce modèle est chiffré avec une clé qui n’est pas enregistrée dans votre OMSI (clé {sleutel}). OMSI ne charge pas non plus ces pièces, c’est pourquoi nous ne les affichons pas.',
    nl: 'Dit model is versleuteld met een sleutel die in jouw OMSI niet geregistreerd is (sleutel {sleutel}). OMSI laadt die onderdelen dan ook niet, en daarom tonen wij ze niet.'
  },
  'bv.noModel': {
    en: 'This bus has no 3D model.',
    de: 'Dieser Bus hat kein 3D-Modell.',
    fr: 'Ce bus n’a pas de modèle 3D.',
    nl: 'Deze bus heeft geen 3D-model.'
  },
  'bv.tooHeavy': {
    en: 'This model is too heavy to show live; you see the picture.',
    de: 'Dieses Modell ist zu schwer für die Live-Ansicht; du siehst das Bild.',
    fr: 'Ce modèle est trop lourd pour la vue en direct ; vous voyez l’image.',
    nl: 'Dit model is te zwaar om live te tonen; je ziet het plaatje.'
  },
  'bv.omsiRunning': {
    en: 'OMSI is running: 3D in light mode',
    de: 'OMSI läuft: 3D im Sparmodus',
    fr: 'OMSI est lancé : 3D en mode léger',
    nl: 'OMSI draait: 3D in de lichte stand'
  },
  'bv.retry': { en: 'Try again', de: 'Erneut versuchen', fr: 'Réessayer', nl: 'Opnieuw' },
  'bv.resume': { en: 'Resume', de: 'Fortsetzen', fr: 'Reprendre', nl: 'Hervatten' },
  'bv.viewFront': { en: 'Front', de: 'Vorne', fr: 'Avant', nl: 'Voor' },
  'bv.viewSide': { en: 'Side', de: 'Seite', fr: 'Côté', nl: 'Zijkant' },
  'bv.viewRear': { en: 'Rear', de: 'Hinten', fr: 'Arrière', nl: 'Achter' },
  'bv.viewAngle': { en: 'Angled', de: 'Schräg', fr: 'Trois-quarts', nl: 'Schuin' },
  'bv.viewReset': { en: 'Reset view', de: 'Ansicht zurücksetzen', fr: 'Réinitialiser la vue', nl: 'Terug' },
  'bv.zoomIn': { en: 'Zoom in', de: 'Vergrößern', fr: 'Zoom avant', nl: 'Inzoomen' },
  'bv.zoomOut': { en: 'Zoom out', de: 'Verkleinern', fr: 'Zoom arrière', nl: 'Uitzoomen' },
  'bv.viewerLabel': {
    en: '3D view of {naam}. Drag to turn, scroll to zoom.',
    de: '3D-Ansicht von {naam}. Ziehen zum Drehen, Mausrad zum Zoomen.',
    fr: 'Vue 3D de {naam}. Faites glisser pour tourner, molette pour zoomer.',
    nl: '3D-weergave van {naam}. Slepen om te draaien, scrollen om te zoomen.'
  }
} as const satisfies Record<string, { en: string; de: string; fr: string; nl: string }>
