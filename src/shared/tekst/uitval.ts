/*
 * Teksten van de planning, deel uitval (ontwerp busbedrijf-planning §5.4):
 * de meldingen van vanochtend, de vraag bij het afsluiten van de dag, het
 * ochtendvenster en de berichten 'telaat', 'pech' en 'ochtend' in het postvak.
 * De sleutels `bd.fout.*` staan in fundament.ts.
 */
export const TEKST_UITVAL = {
  'bd.uitval.kop': { en: 'This morning', de: 'Heute Morgen', fr: 'Ce matin', nl: 'Vanochtend' },
  'bd.uitval.ziek': {
    en: '{naam} called in sick. Duty {dienst} ({van}–{tot}) is open.',
    de: '{naam} hat sich krank gemeldet. Dienst {dienst} ({van}–{tot}) ist offen.',
    fr: '{naam} s’est déclaré malade. Le service {dienst} ({van}–{tot}) est à pourvoir.',
    nl: '{naam} heeft zich ziek gemeld. Dienst {dienst} ({van}–{tot}) staat open.'
  },
  'bd.uitval.ziekVrij': {
    en: '{naam} called in sick, but was not rostered today.',
    de: '{naam} hat sich krank gemeldet, war heute aber nicht eingeteilt.',
    fr: '{naam} s’est déclaré malade, mais n’était pas planifié aujourd’hui.',
    nl: '{naam} heeft zich ziek gemeld, maar stond vandaag niet ingedeeld.'
  },
  'bd.uitval.telaat': {
    en: '{naam} will be {min} minutes late. {van}–{tot} of duty {dienst} is open.',
    de: '{naam} kommt {min} Minuten später. {van}–{tot} von Dienst {dienst} ist offen.',
    fr: '{naam} aura {min} minutes de retard. {van}–{tot} du service {dienst} est à pourvoir.',
    nl: '{naam} komt {min} minuten later. {van}–{tot} van dienst {dienst} staat open.'
  },
  'bd.uitval.telaatHeel': {
    en: '{naam} will be {min} minutes late and misses all of duty {dienst} ({van}–{tot}).',
    de: '{naam} kommt {min} Minuten später und verpasst den ganzen Dienst {dienst} ({van}–{tot}).',
    fr: '{naam} aura {min} minutes de retard et manque tout le service {dienst} ({van}–{tot}).',
    nl: '{naam} komt {min} minuten later en mist de hele dienst {dienst} ({van}–{tot}).'
  },
  'bd.uitval.telaatVrij': {
    en: '{naam} will be {min} minutes late, but was not rostered today.',
    de: '{naam} kommt {min} Minuten später, war heute aber nicht eingeteilt.',
    fr: '{naam} aura {min} minutes de retard, mais n’était pas planifié aujourd’hui.',
    nl: '{naam} komt {min} minuten later, maar stond vandaag niet ingedeeld.'
  },
  'bd.uitval.pech': {
    en: 'Bus {bus} won’t start. Block {omloop} has no bus.',
    de: 'Bus {bus} springt nicht an. Umlauf {omloop} hat keinen Bus.',
    fr: 'Le bus {bus} ne démarre pas. La rotation {omloop} n’a pas de bus.',
    nl: 'Bus {bus} start niet. Omloop {omloop} heeft geen bus.'
  },
  'bd.uitval.pechVrij': {
    en: 'Bus {bus} won’t start; it was not rostered today.',
    de: 'Bus {bus} springt nicht an; er war heute nicht eingeteilt.',
    fr: 'Le bus {bus} ne démarre pas ; il n’était pas planifié aujourd’hui.',
    nl: 'Bus {bus} start niet; hij stond vandaag niet ingedeeld.'
  },
  'bd.uitval.ziekKaal': { en: '{naam} called in sick.', de: '{naam} hat sich krank gemeldet.', fr: '{naam} s’est déclaré malade.', nl: '{naam} heeft zich ziek gemeld.' },
  'bd.uitval.telaatKaal': { en: '{naam} will be {min} minutes late.', de: '{naam} kommt {min} Minuten später.', fr: '{naam} aura {min} minutes de retard.', nl: '{naam} komt {min} minuten later.' },
  'bd.uitval.pechKaal': { en: 'Bus {bus} won’t start.', de: 'Bus {bus} springt nicht an.', fr: 'Le bus {bus} ne démarre pas.', nl: 'Bus {bus} start niet.' },
  'bd.uitval.geregeld': { en: 'Sorted: {wat}', de: 'Geregelt: {wat}', fr: 'Réglé : {wat}', nl: 'Geregeld: {wat}' },
  'bd.uitval.centrale': {
    en: 'If you do nothing, dispatch handles it: {wat} ({geld}).',
    de: 'Wenn du nichts tust, regelt die Leitstelle das: {wat} ({geld}).',
    fr: 'Si vous ne faites rien, la régulation s’en charge : {wat} ({geld}).',
    nl: 'Doe je niets, dan regelt de centrale het: {wat} ({geld}).'
  },
  'bd.uitval.centraleLiggen': {
    en: 'If you do nothing, it is dropped: {geld}.',
    de: 'Wenn du nichts tust, fällt er aus: {geld}.',
    fr: 'Si vous ne faites rien, il est supprimé : {geld}.',
    nl: 'Doe je niets, dan valt hij uit: {geld}.'
  },
  'bd.uitval.invullen': { en: 'Fill in', de: 'Besetzen', fr: 'Pourvoir', nl: 'Invullen' },
  'bd.uitval.spoed': { en: '+20% rush', de: '+20 % Eilzuschlag', fr: '+20 % d’urgence', nl: '+20 % spoed' },
  'bd.uitval.wie.uitzend': { en: 'agency driver', de: 'Leihfahrer', fr: 'chauffeur intérimaire', nl: 'uitzendkracht' },
  'bd.uitval.wie.onder': { en: 'subcontracted', de: 'fremdvergeben', fr: 'sous-traité', nl: 'uitbesteed' },
  'bd.uitval.wie.liggen': { en: 'dropped', de: 'fällt aus', fr: 'supprimé', nl: 'valt uit' },
  'bd.uitval.wie.collega': { en: '{naam} steps in', de: '{naam} springt ein', fr: '{naam} remplace', nl: '{naam} valt in' },
  'bd.uitval.wie.eigen': { en: '{naam} drives', de: '{naam} fährt', fr: '{naam} conduit', nl: '{naam} rijdt' },
  'bd.uitval.wie.huur': { en: 'replacement bus', de: 'Ersatzbus', fr: 'bus de remplacement', nl: 'huurbus' },
  'bd.uitval.wie.eigenBus': { en: 'bus {bus}', de: 'Bus {bus}', fr: 'bus {bus}', nl: 'bus {bus}' },
  'bd.uitval.kort.ziek': {
    en: '{naam} is sick: duty {dienst} is open',
    de: '{naam} ist krank: Dienst {dienst} ist offen',
    fr: '{naam} est malade : le service {dienst} est à pourvoir',
    nl: '{naam} is ziek: dienst {dienst} staat open'
  },
  'bd.uitval.kort.telaat': {
    en: '{naam} is {min} min late: the start of duty {dienst} is open',
    de: '{naam} kommt {min} Min später: der Anfang von Dienst {dienst} ist offen',
    fr: '{naam} a {min} min de retard : le début du service {dienst} est à pourvoir',
    nl: '{naam} komt {min} min later: het begin van dienst {dienst} staat open'
  },
  'bd.uitval.kort.pech': {
    en: 'Bus {bus} won’t start: block {omloop} has no bus',
    de: 'Bus {bus} springt nicht an: Umlauf {omloop} hat keinen Bus',
    fr: 'Le bus {bus} ne démarre pas : la rotation {omloop} n’a pas de bus',
    nl: 'Bus {bus} start niet: omloop {omloop} heeft geen bus'
  },

  'bd.afsluiten.vraagKop': { en: 'Close day {dag}?', de: 'Tag {dag} abschließen?', fr: 'Clôturer le jour {dag} ?', nl: 'Dag {dag} afsluiten?' },
  'bd.afsluiten.vraag': {
    en: 'Still open: {diensten} duties and {omlopen} blocks. Dispatch will cover them: {wat}.',
    de: 'Noch offen: {diensten} Dienste und {omlopen} Umläufe. Die Leitstelle regelt sie: {wat}.',
    fr: 'Encore à pourvoir : {diensten} services et {omlopen} rotations. La régulation s’en charge : {wat}.',
    nl: 'Nog open: {diensten} diensten en {omlopen} omlopen. De centrale regelt ze: {wat}.'
  },
  'bd.afsluiten.toeslag': {
    en: 'With a rush surcharge (20%); it goes away after the Scheduler course.',
    de: 'Mit Eilzuschlag (20 %); nach der Schulung Disponent entfällt er.',
    fr: 'Avec une majoration d’urgence (20 %) ; elle disparaît après la formation Planificateur.',
    nl: 'Met spoedtoeslag (20 %); na de opleiding Planner vervalt die.'
  },
  'bd.afsluiten.valtUit': {
    en: '{n} duties will be dropped: −{geld}, reputation −{rep}.',
    de: '{n} Dienste fallen aus: −{geld}, Ruf −{rep}.',
    fr: '{n} services seront supprimés : −{geld}, réputation −{rep}.',
    nl: '{n} diensten vallen uit: −{geld}, reputatie −{rep}.'
  },
  'bd.afsluiten.collegas': { en: '{n} × a colleague', de: '{n} × ein Kollege', fr: '{n} × un collègue', nl: '{n} × een collega' },
  'bd.afsluiten.eigenBussen': { en: '{n} × an own bus', de: '{n} × ein eigener Bus', fr: '{n} × un bus propre', nl: '{n} × een eigen bus' },
  'bd.afsluiten.uitzend': { en: '{n} × agency driver {geld}', de: '{n} × Leihfahrer {geld}', fr: '{n} × intérimaire {geld}', nl: '{n} × uitzendkracht {geld}' },
  'bd.afsluiten.huur': { en: '{n} × replacement bus {geld}', de: '{n} × Ersatzbus {geld}', fr: '{n} × bus de remplacement {geld}', nl: '{n} × huurbus {geld}' },
  'bd.afsluiten.eerst': { en: 'Fill in myself first', de: 'Erst selbst besetzen', fr: 'Pourvoir moi-même d’abord', nl: 'Eerst zelf invullen' },
  'bd.afsluiten.toch': { en: 'Close as it is', de: 'So abschließen', fr: 'Clôturer ainsi', nl: 'Zo afsluiten' },
  'bd.afsluiten.bezig': { en: 'Closing the day…', de: 'Der Tag wird abgeschlossen…', fr: 'Clôture de la journée…', nl: 'De dag wordt afgesloten…' },

  'bd.ochtend.kop': { en: 'Day {dag} closed', de: 'Tag {dag} abgeschlossen', fr: 'Jour {dag} clôturé', nl: 'Dag {dag} afgesloten' },
  'bd.ochtend.rapport': {
    en: 'Result {resultaat} · {uren} h run · {uitgevallen} h dropped',
    de: 'Ergebnis {resultaat} · {uren} Std gefahren · {uitgevallen} Std ausgefallen',
    fr: 'Résultat {resultaat} · {uren} h assurées · {uitgevallen} h supprimées',
    nl: 'Resultaat {resultaat} · {uren} u gereden · {uitgevallen} u uitgevallen'
  },
  'bd.ochtend.vandaag': { en: 'Today, day {dag} ({datum})', de: 'Heute, Tag {dag} ({datum})', fr: 'Aujourd’hui, jour {dag} ({datum})', nl: 'Vandaag, dag {dag} ({datum})' },
  'bd.ochtend.vandaagZonder': { en: 'Today, day {dag}', de: 'Heute, Tag {dag}', fr: 'Aujourd’hui, jour {dag}', nl: 'Vandaag, dag {dag}' },
  'bd.ochtend.rustig': {
    en: 'Everyone is here and all buses are running.',
    de: 'Alle sind da und alle Busse fahren.',
    fr: 'Tout le monde est là et tous les bus roulent.',
    nl: 'Iedereen is er en alle bussen rijden.'
  },
  'bd.ochtend.stil': {
    en: '{n} own buses or drivers have nothing to do today.',
    de: '{n} eigene Busse oder Fahrer haben heute nichts zu tun.',
    fr: '{n} bus ou chauffeurs propres n’ont rien à faire aujourd’hui.',
    nl: '{n} eigen bussen of chauffeurs hebben vandaag niets te doen.'
  },
  'bd.ochtend.laden': {
    en: 'Loading today’s plan…',
    de: 'Der Plan von heute wird geladen…',
    fr: 'Chargement du planning du jour…',
    nl: 'Het plan van vandaag wordt geladen…'
  },
  'bd.ochtend.allesUitzend': {
    en: 'Cover everything with agency drivers and replacement buses',
    de: 'Alles mit Leihfahrern und Ersatzbussen',
    fr: 'Tout couvrir avec des intérimaires et des bus de remplacement',
    nl: 'Alles met uitzendkrachten en huurbussen'
  },
  'bd.ochtend.naarPlanning': { en: 'Open the planning', de: 'Zur Planung', fr: 'Vers le planning', nl: 'Naar de planning' },
  'bd.ochtend.sluiten': { en: 'Close', de: 'Schließen', fr: 'Fermer', nl: 'Sluiten' },

  'tb.msg.telaat.t': { en: '{naam} will be late', de: '{naam} kommt später', fr: '{naam} aura du retard', nl: '{naam} komt later' },
  'tb.msg.telaat.b': {
    en: '{naam} called: {minuten} minutes late. The start of duty {dienst} is open.',
    de: '{naam} hat angerufen: {minuten} Minuten später. Der Anfang von Dienst {dienst} ist offen.',
    fr: '{naam} a appelé : {minuten} minutes de retard. Le début du service {dienst} est à pourvoir.',
    nl: '{naam} belde: {minuten} minuten later. Het begin van dienst {dienst} staat open.'
  },
  'tb.msg.pech.t': { en: 'Bus {nummer} won’t start', de: 'Bus {nummer} springt nicht an', fr: 'Le bus {nummer} ne démarre pas', nl: 'Bus {nummer} start niet' },
  'tb.msg.pech.b': {
    en: 'Towing and parts cost {kosten}. The bus stays in the workshop today and runs again tomorrow.',
    de: 'Abschleppen und Teile kosten {kosten}. Der Bus bleibt heute in der Werkstatt und fährt morgen wieder.',
    fr: 'Le remorquage et les pièces coûtent {kosten}. Le bus reste à l’atelier aujourd’hui et roule de nouveau demain.',
    nl: 'Sleepdienst en onderdelen kosten {kosten}. De bus blijft vandaag in de werkplaats en rijdt morgen weer.'
  },
  'tb.msg.ochtend.t': { en: 'Morning report, day {dag}', de: 'Morgenmeldung, Tag {dag}', fr: 'Point du matin, jour {dag}', nl: 'Ochtendmelding dag {dag}' },
  'tb.msg.ochtend.b': {
    en: '{open} duties and {omlopen} blocks are open. If you do nothing, dispatch handles it (± {kosten}). {stil} own buses or drivers have nothing to do today.',
    de: '{open} Dienste und {omlopen} Umläufe sind offen. Wenn du nichts tust, regelt die Leitstelle das (± {kosten}). {stil} eigene Busse oder Fahrer haben heute nichts zu tun.',
    fr: '{open} services et {omlopen} rotations sont à pourvoir. Si vous ne faites rien, la régulation s’en charge (± {kosten}). {stil} bus ou chauffeurs propres n’ont rien à faire aujourd’hui.',
    nl: '{open} diensten en {omlopen} omlopen staan open. Doe je niets, dan regelt de centrale het (± {kosten}). {stil} eigen bussen of chauffeurs hebben vandaag niets te doen.'
  }
} as const satisfies Record<string, { en: string; de: string; fr: string; nl: string }>
