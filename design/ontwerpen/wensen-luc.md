# Wensen van Luc voor de planning van het busbedrijf (letterlijk, in volgorde)

1. "hoe start ik nu een rit in mijn eigen busbedrijf?" -> "nee dat moet allemaal vanuit die modus kunnen"
2. "hoe koppel ik bussen en bestuurders aan mijn lijnen, er moet een planscherm komen, er moet een interactieve
   kaart komen om te zien waar de bestuurders rijden, welke diensten er open vallen door ziekte etc, die dan zelf
   invullen als eigenaar of iemand inhuren tijdelijk"
3. "de kaart moet getekend worden vanuit de map waar de speler op speelt"
4. (NA de start van het ontwerp-workflow wf_8a20343e-484 -- zit NIET in dat ontwerp, bij de bouw toevoegen:)
   "dat doen we al voor de navigatie, diezelfde map kan gebruikt worden als interactieve kaart waar je de bussen
   ziet, en als je dan op een bus klikt zie je extra informatie, deze informatie zweeft boven de bus en je beweegt
   mee terwijl de bus rijdt"
   -> dezelfde kaartcomponent als de navigatie (NavKaart/RouteMap) hergebruiken; klik op bus = zwevend
      informatiekaartje BOVEN de bus dat met de bus meebeweegt, en de kaart volgt de bus (camera beweegt mee).
5. (ook NA de start van het ontwerp -- nieuw deel F:)
   "er moet een robuuster systeem komen om bussen aan te schaffen, te leasen, te huren etc"
   -> wagenpark-aanschaf uitbreiden: kopen (nieuw/tweedehands), leasen (maandtermijn, looptijd, einde contract),
      huren (kort, per dag), mogelijk financieren/afbetalen, verkopen/inruilen, en dit laten meetellen in boeken en
      planning (een gehuurde bus is inzetbaar op het planscherm).
6. (nieuw deel G:) "ik wil een 3d view van de bussen die je koopt, we decoderen al de bussen in 3d dus een 3d
   viewer in de dealer moet wel lukken lijkt mij"
   -> in de busmarkt/dealer een draaibare 3D-weergave van de bus uit zijn eigen .o3d-modellen en texturen
      (core/o3d.ts, busmodel.ts, busbeeld.ts, textuur.ts bestaan al voor de busplaatjes).

# Los van het busbedrijf (workflow wf_5a384dbe-b6b, bouwt in dezelfde worktree VOOR de busbedrijf-bouw):
7. Wens van een gebruiker (Duits): vrij rijden alleen kaart + bus, haltekeuze helemaal weg, navi vindt route zelf;
   fouten "falsche Linien Route" en "lädt garnix" oplossen. Daarna committen + installer bouwen, en PAS DAN de
   busbedrijf-bouw starten (die raakt ook App.tsx).

