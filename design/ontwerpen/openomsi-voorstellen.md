# openOMSI: wat we overnemen

Onderzoek van 28-09-2026 naar openOMSI (github.com/turbo-devv/openOMSI, v0.1.7, MIT). We nemen ideeën en
nagemeten feiten over, geen code. Keuzes van Luc op 28-09-2026: multiplayer nu niet; de app mag op GitHub kijken
of er een nieuwe versie is en dat alleen melden; stiptheid zoals OMSI (te laat bij aankomst > 180 s, te vroeg bij
vertrek > 120 s). De 3D-weergave van bussen heeft voorrang en krijgt een eigen ontwerp (bus3d).

Deel 1 is de samenvatting met alle voorstellen en de bouwvolgorde; deel 2 de controle op volledigheid, met
correcties en de voorstellen 55-72.

## Deel 1: samenvatting


Afkortingen in de bronnen:
- **OO** = `C:/Users/lucru/AppData/Local/Temp/claude/C--OMSI-Career--claude-worktrees-ecstatic-noether-296800/69453af6-61d8-4662-b5b4-760aa670cb78/scratchpad/openomsi/bron/openOMSI/`. Dit is commit cd5232a (v0.1.7). Ik heb de code alleen gelezen en niets uitgevoerd.
- **ONS** = `C:/OMSI Career/.claude/worktrees/ecstatic-noether-296800/`
- **CLOUD** = `origin/claude/awesome-wozniak-f2svst`
- **OMSI** = `C:/Program Files (x86)/Steam/steamapps/common/OMSI 2/`

## 1. Wat openOMSI is, en waar het echt beter is

openOMSI (https://github.com/turbo-devv/openOMSI, MIT, "Copyright (c) 2026 usonskyyyy") is OMSI 2 opnieuw geschreven in Rust. Het draait op de kaarten en bussen van een geïnstalleerd OMSI 2. Er zit een eigen launcher bij met diensten, een navigator, OMSI's personeelsdossier, een add-on-installer en een updater. Het project bestaat pas één dag (aangemaakt 27-09-2026, zes releases in 18 uur) en de spelers melden nog basisfouten (issues #1-#7).

Omdat openOMSI de motor zelf is, ziet het pedalen, reizigers en rijstroken rechtstreeks en kan het knoppen direct indrukken. Veel daarvan kunnen wij niet overnemen.

Waar het aantoonbaar beter is:
- **Dienstregeling:** houdt rekening met chrono (datumwijzigingen van de kaart), zet de bus op een inzetpunt van de kaart en neemt de kortste weg naar de eerste halte.
- **Navigatie:** straatnamen, een afslag met afstand en straat, een nieuwe route als je afwijkt, een grote stadskaart en een snelheidslimiet op elke kaart.
- **Rijbeoordeling:** meet de dwarsversnelling in bochten, gebruikt een strafgetal dat per kilometer wegslijt, en telt te laat op aankomst en te vroeg op vertrek.
- **IBIS:** toetst in het juiste formaat in en drukt knoppen via de plugin-interface van OMSI (`AccessTrigger`).
- **Add-ons:** een veiligere installatie met padcontrole, een ruimtecontrole, eerst uitpakken naar een tussenmap en plugins standaard uit.
- **Uitgave:** een updater en een voorzichtige manier om een proces te stoppen.

Wij zijn sterker in:
- de loopbaan: rittenstaat, examen, loon, controleurs;
- de apparaatschermen die exact zijn nagebouwd op telefoon en tablet;
- de route, die we toetsen aan OMSI;
- het add-onregister met reservekopie en verwijderen;
- de kaartcontrole;
- de echte installer.

**Bijvangst: vier zwakke plekken in onze eigen app.**
1. **Zip-slip, bevestigd.**
   - `ONS/src/core/zip.ts:66-68` haalt `..` niet uit de bestandsnamen, en `ONS/src/core/addon.ts:236-253` voegt de paden samen met `join`.
   - Daardoor komt `Vehicles/../../BUITEN.txt` uit een zip boven de OMSI-map terecht.
2. **IBIS-invoer, waarschijnlijk fout voor lijnen vanaf 100.**
   - Wij vragen de speler "lijn 853 / route 85302" in te toetsen (`ONS/src/renderer/src/overlay.tsx:1330-1359`, `ONS/src/shared/i18n.ts:3036`).
   - De gewone IBIS rekent zo: LinieKurs = invoer/100 en de route = LinieKurs×100 + invoer (`OMSI/Vehicles/MAN_SD200/Script/IBIS.osc:119-127,158`, zelf gecontroleerd). Dat moet dus "85300" en daarna "02" zijn.
   - Dit is nog niet in het spel nagemeten.
3. **"OMSI afsluiten" controleert alleen het procesnummer (pid).** `ONS/src/core/omsiProces.ts:124-128` en `ONS/src/main/index.ts:4589-4594` kijken niet of dat pid nog steeds `Omsi.exe` is. Windows geeft een vrijgekomen pid aan een ander programma, dus de knop kan het verkeerde programma afschieten.
4. **OMSI-bestanden worden rechtstreeks overschreven.** Voor `keyboard.cfg`, `options.cfg` en `gamectrler.cfg` gebeurt dat zonder tijdelijk bestand en zonder eerst terug te lezen (`ONS/src/core/omsiKeys.ts:81-98`).

## 2. Alle voorstellen, gerangschikt (hoogste waarde per moeite eerst)

Alle voorstellen nemen alleen het idee, de werkwijze of feiten over. Er gaat geen code van openOMSI mee: die is Rust, de onze TypeScript en C. De MIT-licentie legt ons daarom niets op. Letterlijk kopiëren, bijvoorbeeld hun extensielijst of hun woordenlijst `WORDS`, mag alleen met de MIT-tekst en de copyrightregel erbij; dat raad ik niet aan.

"Feit" betekent: een bestandsformaat, drempelwaarde of variabelenaam die we zelf nameten aan OMSI.

### Groep A: klein, en het dicht een gat of een fout

**1. Padveiligheid en rommelfilter bij add-ons** (Add-ons)
- Omvang: klein
- Afhankelijk van: niets
- Licentie: idee (OO/crates/omsi-launcher-core/src/install.rs:478-515)
- Wat de speler merkt:
  - Een zip kan niets meer buiten de OMSI-map schrijven, en ook niets in de hoofdmap van OMSI.
  - Bestanden als `._*.bus`, `Thumbs.db` en `desktop.ini` komen niet meer in busmappen.
  - Het plan meldt "N bestanden geweigerd".
- Onze code: ONS/src/core/zip.ts:66-68 en ONS/src/core/addon.ts:236-253,377.

**2. Plugins en programma's in add-ons standaard niet installeren** (Add-ons)
- Omvang: klein tot middel
- Afhankelijk van: niets
- Licentie: idee (install.rs:682-693, OO/crates/omsi-app/src/lan_mods.rs:45-115)
- Wat de speler merkt: het plan krijgt een blok "Programmacode".
  - Een plugin staat uit, met een vinkje "ik vertrouw de maker".
  - Een `.exe` of `.bat` wordt niet geplaatst.
- Nu plaatst ONS/src/core/addon.ts:124 alles in `plugins/` zonder waarschuwing.

**3. IBIS-codes in het juiste formaat tonen, en IBIS-fouten uitleggen** (Bediening in de bus)
- Omvang: klein
- Afhankelijk van: plugin ≥ 13 (die hebben we al). **Eerst een proef in het spel.**
- Licentie: feit (IBIS.osc:119-127,158; OMSI/Tutorials/3/ENG/3100.html)
- Wat de speler merkt:
  - Er staat "Linie/Kurs 85300, Route 02" in plaats van "853 / 85302".
  - Een fout levert een melding op als "Route onbekend: typ alleen 02". Die komt uit `IBIS_mode` 4/6.
  - Of de route erin staat, leest de app voortaan aan `IBIS_RouteIndex` in plaats van aan de filmteksten.
- Per bus moet de app het formaat uit de scripts halen: de Atron en de ALMEX wijken af.

**4. OMSI alleen afsluiten als het nog hetzelfde Omsi.exe is** (Uitgave en launcher)
- Omvang: klein
- Afhankelijk van: niets
- Licentie: idee (OO/crates/omsi-launcher-core/src/instances.rs:168-178,339-343)
- Wat de speler merkt: de knop "OMSI afsluiten" bij een vastloper kan nooit een ander programma treffen. Is OMSI al weg, dan zegt de app "OMSI is al dicht".
- Hoe: de starttijd van het proces meenemen en `taskkill` alleen nog gebruiken met het filter `IMAGENAME eq Omsi.exe`.

**5. OMSI-bestanden veilig schrijven, en eerst teruglezen** (Uitgave en launcher)
- Omvang: klein
- Afhankelijk van: niets
- Licentie: idee (OO/crates/omsi-launcher-core/src/lib.rs:1386-1403)
- Wat de speler merkt: een crash of Defender laat geen halve `keyboard.cfg` of `options.cfg` meer achter, en een lege lijst uit het scherm wist niet meer alle toetsen.
- Hoe: via het bestaande `schrijfVeilig` (ONS/src/core/veilig.ts:31-50), met een stap die het tijdelijke bestand controleert voordat het de echte plek inneemt.

**6. Vrije ruimte controleren vóór en tijdens het installeren van een add-on** (Add-ons)
- Omvang: klein
- Afhankelijk van: niets
- Licentie: idee (install.rs:47-50,869-919,1219-1226)
- Wat de speler merkt: "Nodig 3,4 GB · vrij 2,1 GB", en dan staat de knop uit. Tijdens het installeren stopt de app netjes als de schijf volloopt.
- Ook de schijf van de reservekopie telt mee. Dat doet openOMSI niet.

**7. Bouwstempel en variant in de versie en het logboek** (Uitgave en launcher)
- Omvang: klein
- Afhankelijk van: niets. Nummers 22, 35 en 36 bouwen erop voort.
- Licentie: idee (OO/crates/omsi-app/build.rs:1-18)
- Wat de speler merkt: bij het versienummer staat bijvoorbeeld "bouw 3f2a1c9 · 28-09 17:40 · draagbaar", en dat staat ook in de eerste regel van het logboek. Luc weet bij een melding in Discord dan precies welke exe het is.

**8. Afstand tot de afslag tonen** (Navigatie)
- Omvang: klein
- Afhankelijk van: niets
- Licentie: idee
- Wat de speler merkt: naast de afslagpijl staat "150 m", en de afstand tot de halte staat apart.
- Nu gaan pijl en getal over verschillende dingen. `manoeuvre.metres` bestaat al (ONS/src/renderer/src/RouteMap.tsx:646; ONS/src/renderer/src/navigatie.tsx:287-334).

**9. Melding "waarom rijdt de bus niet"** (Bediening in de bus)
- Omvang: klein
- Afhankelijk van: plugin ≥ 13
- Licentie: idee en feit (OO/crates/omsi-app/src/diagnostics.rs:6-66; OMSI/Vehicles/MAN_SD200/Script/bremse.osc:131)
- Wat de speler merkt: geeft hij gas terwijl de bus niet rijdt, dan verschijnt binnen ongeveer 1 s bijvoorbeeld "Handrem staat aan: druk op <eigen toets>".
- De app kijkt naar motor uit, stand N, handrem, te weinig luchtdruk, halterem en open deur.

**10. Opstartchecklist die live afvinkt** (Bediening in de bus)
- Omvang: klein
- Afhankelijk van: plugin ≥ 13, en dezelfde getallen als nr. 9
- Licentie: idee
- Wat de speler merkt: de stappen stroom, motor, D, handrem los en lucht vol vinken vanzelf af, elk met de eigen toets van de speler.

**11. Rijden met open deur tellen** (Loopbaan en rijbeoordeling)
- Omvang: klein
- Afhankelijk van: niets. Deur 1-3 lezen we via de getallen van plugin 13.
- Licentie: idee (OO/crates/omsi-app/src/career.rs:226-229)
- Wat de speler merkt: "x s met open deur gereden" in het logboek. Controleurs en het rijcijfer rekenen het mee.
- Nu is het alleen een waarschuwing (ONS/src/core/live.ts:1071-1073).

**12. Een omloop over middernacht toetsen aan de dag waarop hij begon** (Dienstregeling)
- Omvang: klein
- Afhankelijk van: eerst proef T3
- Licentie: idee (OO/docs/ROUTES.md:49; openOMSI voert dit zelf niet uit)
- Wat de speler merkt: rond middernacht de juiste nachtomlopen. Op zondag om 00:40 wordt omloop 73401 van zaterdag gekoppeld, zonder "rijdt vandaag niet".
- Betreft onze bestanden: beginplek.ts:288, omloopvolgen.ts:160,353 en index.ts:2505. In de cloud: bedrijfsplan.ts:153-157.

**13. Stiptheid zoals OMSI hem meet** (Loopbaan en rijbeoordeling)
- Omvang: klein
- Afhankelijk van: niets. De uitkomst van teVroeg/teLaat in het busbedrijf verschuift iets.
- Licentie: idee (career.rs:26-28, OO/crates/omsi-app/src/schedule.rs:3812-3834)
- Wat de speler merkt: te laat telt op aankomst (meer dan 180 s), te vroeg op vertrek. Wie op tijd aankwam maar lang instappers had, telt niet meer als te laat.
- De drempels kiest Luc: "OMSI" (120/180) of "streng" (30/180).
- Onze code: ONS/src/core/rittenstaat.ts:204-210,306-323.

**14. Haltetijden verdelen naar de lengtes in StnLinks.cfg, en `[profile_otherstopping]` tonen** (Dienstregeling)
- Omvang: klein
- Afhankelijk van: niets
- Licentie: idee (schedule.rs:95-190)
- Wat de speler merkt: juiste geplande tijden bij tussenhaltes zonder vaste tijd. Dat is 63 % van de tussenhaltes op Spandau; die verdelen wij nu gelijk per halte (ONS/src/core/timetable.ts:185-226).

**15. Snelheidslimiet uit de `[rule] speedlimit` van de kaart, als terugval** (Navigatie)
- Omvang: klein
- Afhankelijk van: niets
- Licentie: feit, zelf gemeten
- Wat de speler merkt: een limiet op alle 13 kaarten in plaats van 3. Bij ons komt de limiet nu alleen uit `vz_NNkmh`-borden (ONS/src/core/geo.ts:206,275-281).
- De limiet uit de regel wordt anders getoond dan een bord, want het is de snelheid van de AI.
- Bron: OO/crates/omsi-app/src/scene.rs:9612-9622.

**16. Rijtijd en verwachte tijden bij de volgende haltes** (Navigatie)
- Omvang: klein
- Afhankelijk van: niets
- Licentie: idee (OO/crates/omsi-app/src/navigator.rs:1072-1076,1109-1125)
- Wat de speler merkt: "3 min" tot de halte, en bij de volgende haltes de verwachte tijd naast de geplande.

**17. Kaartverkoopcijfer en opbrengst, ook zonder overlay geteld** (Loopbaan en rijbeoordeling)
- Omvang: klein
- Afhankelijk van: optioneel een plugin
- Licentie: idee (OO/crates/omsi-app/src/humans.rs:6616-6624)
- Wat de speler merkt: "kaartverkoop 87 %" (juist wisselgeld 2 punten, fout 1) en de opbrengst per dienst.
- Nu telt `telVerkoop` alleen zolang de overlay of een tablet meekijkt (ONS/src/main/index.ts:2695-2738, ONS/HANDOVER.md:1756-1759).

**18. Meer soorten losse mappen herkennen bij plaatsing** (Add-ons)
- Omvang: klein
- Afhankelijk van: niets
- Licentie: idee en feit (install.rs:522-537)
- Wat de speler merkt: een zip met alleen objecten (`.sco`), splines, `.hum`, weer, fonts of een kaartset komt op de goede plek, in plaats van onder "niet geplaatst" (ONS/src/core/addon.ts:150-160).

### Groep B: grote waarde, middelgroot werk

**19. Dienstregeling volgens chrono: lijnen, ritten en OMSI's lijnvolgorde** (Dienstregeling)
- Omvang: middel voor de kern, groot met alle afnemers erbij
- Afhankelijk van: niets hard. **Wel overlap met de cloud:** de klok van de vlootkaart (bedrijfsklok.ts:57-80 en commit 1380dc3), de lijnindex in de cloud-kaartlaag en `omlopenVanDag` in bedrijfsplan.ts.
- Licentie: idee en formaatkennis (ROUTES.md:6-35; OO/crates/omsi-map/src/ailists.rs:198-279; OO/crates/omsi-timetable/src/lib.rs:374-454)
- Wat de speler merkt:
  - Op Spandau in 1988 (ons standaardtijdvak) de 13N zoals OMSI hem rijdt: 19 ritten, uit chrono 0100_Neuer13N vanaf 01-05-1987. Wij tonen nu de oude 13N met 15 ritten.
  - Vanaf 02-06-1991 de nieuwe lijnen 137, 130 en N33.
  - De plek van een lijn klopt voor omloop volgen en voor de klok van het busbedrijf. Nu staat 13N bij OMSI op plek 0 en bij ons op plek 1, terwijl beide lijsten 23 lijnen lang zijn. De lengtetoets van de cloud vangt dat dus niet op.
- Dit is de grootste losse winst in correctheid. Wij lezen nu alleen TTData (ONS/src/core/timetable.ts:236-278).

**20. Laten zien waarom een lijn of omloop er (niet) is, met namen uit `.dsc`** (Dienstregeling)
- Omvang: klein
- Afhankelijk van: nr. 19
- Licentie: idee (schedule.rs:3099-3114; OO/crates/omsi-launcher-core/src/lib.rs:877-948)
- Wat de speler merkt: bijvoorbeeld "Lijn 92 rijdt niet op 03-06-1991: dienstregelingswijziging 'Timetable change 2.6.1991'", of "rijdt pas op <datum>". Namen staan in zijn eigen taal.

**21. Kaartset per datum** (Dienstregeling)
- Omvang: klein
- Afhankelijk van: nr. 19
- Licentie: idee (scene.rs:1928-1933)
- Wat de speler merkt: Spandau Berlin_86 t/m 94 en Ahlheim VRR 2025 volgens de chrono-datum. Nu leest ONS/src/core/kaartjes.ts:42-58 alleen global.cfg.

**22. car_use bij de buskeuze, en remiseregels met een datum** (Dienstregeling)
- Omvang: klein
- Afhankelijk van: niets
- Licentie: idee. Wij gebruiken ook `[type_tour]`, dat openOMSI laat liggen.
- Wat de speler merkt: op Spandau de juiste bus per lijn en periode, bijvoorbeeld E522 alleen SD82-85. Van Lucs kaarten heeft alleen Spandau car_use-bestanden.
- Bron: omsi-timetable lib.rs:288-347; onze code in ONS/src/core/fleet.ts:56-84,168.

**23. Inzetpunt met de kortste weg, een getekende aanrijroute en de eerste haalbare rit** (Dienstregeling en navigatie samen)
- Omvang: middel
- Afhankelijk van: de vrije modus. Het hergebruikt `beginplek.ts` (:149, :220, :226) en `LaneNetwork.verbind` (ONS/src/core/routing.ts:514).
- Licentie: idee (OO/crates/omsi-app/src/duty_start.rs; schedule.rs:3567-3672)
- Wat de speler merkt:
  - Bij Dienst en Carrière staat de bus op het inzetpunt van de kaartmaker, niet meer op een rijstrook voor de halte.
  - De dienstkaart zegt bijvoorbeeld "850 m / 3 min naar de eerste halte", en de klok schuift mee.
  - Bij vrij rijden een echte aanrijroute in plaats van de rechte streep. Daarmee is fase 2 af (ONS/HANDOVER.md:929-933).
  - Wie een rit niet meer haalt, krijgt de eerste rit die nog wel te halen is.

**24. Nieuwe route bij afwijken** (Navigatie)
- Omvang: middel tot groot
- Afhankelijk van: dezelfde zoektocht over de rijstroken als nr. 23
- Licentie: idee (navigator.rs:443-594,1614-1699). Het zoekalgoritme (Dijkstra) is algemeen bekend.
- Wat de speler merkt: binnen ongeveer 2 s na een verkeerde afslag een weg terug, met "Route herberekend". Die weg slaat nooit een halte over.
- Nu "staat" wie verkeerd rijdt nog op de route (RouteMap.tsx:553-574).

**25. OMSI's eigen personeelsdossier (.odr) lezen, alleen lezen** (Loopbaan en rijbeoordeling)
- Omvang: middel
- Afhankelijk van: eerst nameten
- Licentie: idee; het formaat zelf gemeten
- Wat de speler merkt: een vak "Volgens OMSI" in Profiel en na een dienst, met rijden, comfort, kaartverkoop, haltes vroeg/laat, opbrengst en aanrijdingen.
- De huidige lezing van openOMSI past niet bij een echt bestand. In OMSI/Drivers/OMSI-Fan.odr:32-37 staat de waarde tussen 0 en 1 achteraan, niet vooraan zoals OO/crates/omsi-content/src/driver.rs:73-85 aanneemt.
- OMSI schrijft het bestand alleen bij het afsluiten. We schrijven er nooit zelf in.

**26. Rijcijfer met een strafgetal dat met de kilometers wegslijt** (Loopbaan en rijbeoordeling)
- Omvang: middel
- Afhankelijk van: eerst ijken op bestaande logboeken. De koppeling met het busbedrijf pas na de merge.
- Licentie: idee (career.rs:21-25,232-235)
- Wat de speler merkt: een cijfer van 0 tot 100, live en per dienst. Eén ruk kost 10 punten en is na ongeveer 3 km netjes rijden weer goedgemaakt.
- Het examen gaat van "≤ 5 gebeurtenissen" (ONS/src/core/exam.ts:46) naar een minimaal cijfer.

**27. Waarschuwen voordat reizigers klagen** (Loopbaan en rijbeoordeling)
- Omvang: klein tot middel
- Afhankelijk van: niets. De drempels moeten worden nagemeten tegen nr. 25.
- Licentie: idee (humans.rs:2231-2277)
- Wat de speler merkt: tips als "binnenverlichting aan", "te koud of te warm in de bus" en "meer dan 5 min te laat: reizigers klagen".

**28. Bescherming tegen oudere exe's die in dezelfde gegevens schrijven** (Uitgave en launcher)
- Omvang: klein tot middel
- Afhankelijk van: nr. 7
- Licentie: idee (OO/crates/omsi-app/src/updater.rs:581-600)
- Wat de speler merkt: "Bijgewerkt door 0.4.9, deze exe is 0.4.1", met de keuze tussen alleen bekijken, downloaden of toch doorgaan. Dit dekt het risico af dat in ONS/CLAUDE.md staat.

**29. Melding bij een nieuwe versie (fase A)** (Uitgave en launcher)
- Omvang: klein tot middel
- Afhankelijk van: nr. 7, en Lucs keuze, want elke start maakt contact met GitHub
- Licentie: idee (OO/crates/omsi-app/src/launcher/update.rs, updater.rs:103-258)
- Wat de speler merkt: "0.4.9 is uit" bij het versienummer, met de notities en een knop naar de downloadpagina.
- Staat uit bij ontwikkelbuilds en bij `--user-data-dir`.

**30. Add-ons eerst naar een tussenmap, dan verplaatsen, met logboek en afbreken** (Add-ons)
- Omvang: middel
- Afhankelijk van: niets. Hangt samen met nr. 6.
- Licentie: idee (install.rs:920-1023,1249-1284,381-411). Het logboek van de installatie voegen wij toe; openOMSI heeft dat niet.
- Wat de speler merkt:
  - Een kapotte zip, een volle schijf of "Afbreken" laat OMSI onaangeraakt.
  - Een voortgangsbalk in MB.
  - Na een crash zet de app bij de volgende start terug wat half geïnstalleerd was.

**31. De foutcontrole uitbreiden** (Add-ons)
- Omvang: middel
- Afhankelijk van: niets. Het busbedrijf kan het gebruiken voor `bd.v3d.incomplete` (busbedrijf-wagenpark.md:1256).
- Licentie: idee (OO/tools/omsi-check/src/fleet.rs:126-138,215-222,300-385,637-706)
- Wat de speler merkt:
  - Meldingen als "font Krueger_16 ontbreekt" en "achterwagen ontbreekt".
  - Ook nightmap, envmap en de andere texturen, `[CTC]`, en "mist 1.834 objecten uit 3 pakketten".
  - "Alle bussen" eindigt met een samenvatting per oorzaak.

**32. Straatnamen uit de straatnaambordjes** (Navigatie)
- Omvang: middel
- Afhankelijk van: niets. De vlootkaart van de cloud (wens 4) profiteert ervan.
- Licentie: idee en feit, met eigen metingen
- Wat de speler merkt: straatnamen langs de wegen op de kaart.
- We verbeteren daarbij drie dingen ten opzichte van openOMSI:
  - de Hamburg-bordjes `strsgn` meenemen;
  - de tweede naam op een bord meenemen;
  - per bordtype de hoek zelf afstellen, want Hohenkirchen staat op 0°, niet 90°.
- Bron: scene.rs:10065-10071, navigator.rs:1468-1612.

**33. Volgende afslag met straatnaam, en de straat waar je nu rijdt** (Navigatie)
- Omvang: klein zonder straatnamen, middel met straatnamen
- Afhankelijk van: nr. 32 voor de namen
- Licentie: idee (navigator.rs:662-694,955-985)
- Wat de speler merkt: een vakje met een icoon, "400 m" en "Gartenstraße", en onderin een pilletje met de straat waar de bus nu rijdt.

**34. Grote stadskaart op de tablet** (Navigatie)
- Omvang: middel
- Afhankelijk van: nr. 32. Stem af met de vlootkaart van de cloud (busbedrijf-planning.md:51).
- Licentie: idee (navigator.rs:1708-2149)
- Wat de speler merkt: een app "Kaart" met het noorden boven, die de bus volgt. Haltes staan erop met de verwachte tijd, het gereden stuk is grijs en er staan straatnamen op.

### Groep C: plugin 15 (samen in één pluginversie, ná de plugin 14 van de cloud)

**35. AccessTrigger: knoppen rechtstreeks naar OMSI** (Bediening in de bus)
- Omvang: middel
- Afhankelijk van: plugin 15 en eerst een proef met een `.opl` van 3 namen op de SD200
- Licentie: idee plus de openbare plugin-interface van OMSI (OO/docs/PLUGINS.md:183-205). Omsi.exe bevat "AccessTrigger" en "[triggers]".
- Wat de speler merkt: knoppen op telefoon en tablet werken ook als OMSI niet vooraan staat, zonder toetsen bij te schrijven, zonder toetsentekort en zonder F10-problemen.
- De whitelist blijft de grens voor wat via het netwerk mag.

**36. Dwarsversnelling: te hard door de bocht** (Loopbaan en rijbeoordeling)
- Omvang: klein tot middel
- Afhankelijk van: plugin 15
- Licentie: idee (career.rs:178-209)
- Wat de speler merkt: een nieuwe teller "bocht" in rijstijl, examen, controleurs en rittenstaat. De rotatie van de bus lezen we al (ONS/plugin/omsicareer.c:217,877).

**37. Tijdgebonden gladstrijken, en een aanrijding wegen naar de snelheid** (Loopbaan en rijbeoordeling)
- Omvang: klein
- Afhankelijk van: plugin 15
- Licentie: idee (career.rs:188-193,250-257)
- Wat de speler merkt: hard remmen telt hetzelfde bij 30 en bij 144 beelden per seconde, en een tik bij 5 km/u weegt minder dan een klap bij 50 km/u.
- Nu staat er `SMOOTH 0.25` per beeld (omsicareer.c:180).

**38. IBIS automatisch intoetsen, met terugkoppeling** (Bediening in de bus)
- Omvang: middel voor de gewone IBIS, groot voor de ALMEX en de Atron
- Afhankelijk van: nr. 35 en nr. 3
- Licentie: idee (OO/crates/omsi-sim/src/ibis.rs:199-747)
- Wat de speler merkt: een knop "Zet in IBIS", en bij elk keerpunt vanzelf de volgende route.
- Na elke druk leest de app terug en stopt met een melding als het misgaat. De variabelen worden nooit rechtstreeks geschreven, want dan slaan omroepen en de haltelijst over.

**39. Eén knop "Bus starten"** (Bediening in de bus)
- Omvang: middel
- Afhankelijk van: nr. 35
- Licentie: idee; de triggernamen zijn feiten (OO/crates/omsi-sim/src/startup.rs)
- Wat de speler merkt: stroom, starter en displays met één knop. De starter wordt vastgehouden tot de motor draait.

**40. Pendelen tussen gas en rem** (Loopbaan en rijbeoordeling)
- Omvang: middel
- Afhankelijk van: plugin 15 en de namen van de pedaalvariabelen per bus
- Licentie: idee (career.rs:210-223)
- Prioriteit laag.
- Wat de speler merkt: de tip "niet pendelen" en een kleine aftrek op het rijcijfer.

### Groep D: later, lage prioriteit, of eerst een keuze van Luc

**41. CI: bouwen bij elke push als artefact, een release alleen bij een tag** (Uitgave en launcher)
- Omvang: middel
- Afhankelijk van: nr. 7, en Lucs keuze, want de afspraak over `release/` verandert
- Licentie: idee (OO/.github/workflows/release.yml)
- Wat de speler merkt: niets direct. Elke exe komt uit een schone bouw, `npm ci` lost de valkuil met de junction op, en de controle op de asar gebeurt automatisch.

**42. Zelf bijwerken met electron-updater, alleen voor de Setup** (Uitgave en launcher)
- Omvang: middel
- Afhankelijk van: nr. 29 en nr. 7
- Licentie: idee. electron-updater zelf is MIT en komt erbij als afhankelijkheid.
- Wat de speler merkt: bijwerken met één klik, nooit terwijl OMSI draait.
- Risico's:
  - De exe is ongetekend, dus de app controleert alleen de hash.
  - Smart App Control blokkeert het bij Luc.
  - Tweestapsverificatie op GitHub is verplicht.

**43. Wachtende repaints** (Add-ons)
- Omvang: middel
- Afhankelijk van: niets
- Licentie: idee (install.rs:646-659,1287-1298)
- Wat de speler merkt: "Repaint voor MAN_NL202, maar die bus staat er niet. Bewaren?" Zodra de bus er is, volgt een aanbod om de repaint te installeren.

**44. Inbox-map voor downloads** (Add-ons)
- Omvang: middel
- Afhankelijk van: nr. 30, nr. 6 en nr. 2
- Licentie: idee (lib.rs:429-520)
- Wat de speler merkt: wat in de map klaarstaat, verschijnt als plankaart. Installeren blijft altijd één klik, nooit zonder plan.

**45. Zip64** (Add-ons)
- Omvang: klein tot middel
- Afhankelijk van: nr. 30, voor het uitpakken zonder alles in het geheugen te laden
- Licentie: feit
- Wat de speler merkt: kaarten boven 4 GB of met meer dan 65.535 bestanden werken zonder eerst zelf uit te pakken (ONS/src/core/zip.ts:104-128).

**46. Uitslagen van de controle bewaren** (Add-ons)
- Omvang: klein tot middel
- Afhankelijk van: nr. 31
- Licentie: idee (OO/crates/omsi-launcher-core/src/index.rs)
- Wat de speler merkt: de vorige uitslag staat er meteen, en "Alles controleren" leest alleen wat veranderd is.

**47. Iets breder zoeken naar OMSI** (Uitgave en launcher)
- Omvang: klein
- Afhankelijk van: niets. **Overlap:** de cloud veranderde install.ts (+13).
- Licentie: idee (OO/crates/omsi-cfg/src/install_search.rs:12,128-174)
- Wat de speler merkt: minder vaak "niet gevonden" bij een doosversie of een hernoemde map.
- Wij zoeken nu al beter dan openOMSI, dus de winst is klein.

**48. Leesbare knopnamen** (Bediening in de bus)
- Omvang: klein voor de varianten, middel voor een woordenlijst Duits naar Nederlands
- Afhankelijk van: niets
- Licentie: idee (OO/crates/omsi-app/src/describe.rs:72-110)
- Wat de speler merkt: namen voor knoppen zonder `.olf`-tekst, via varianten als `_mouse` en `kw_`↔`cp_`.

**49. OMSI's eigen tutorials bij het IBIS-paneel** (Bediening in de bus)
- Omvang: klein
- Afhankelijk van: niets
- Licentie: idee (OO/crates/omsi-app/src/tutorial.rs:1-79)
- Wat de speler merkt: "Hoe werkt de IBIS?" opent OMSI's eigen pagina's uit zijn eigen installatie. Die pagina's leveren wij niet mee.

**50. Internetradio** (Bediening in de bus)
- Omvang: klein tot middel
- Afhankelijk van: plugin ≥ 13
- Licentie: idee (OO/crates/omsi-app/src/radio.rs)
- Wat de speler merkt: de radio of cassette in de bus speelt een zender die de speler zelf invult.
- Bij ons alleen bevestigd voor de SD200-cassette en de NewLionsCity.

**51. Een rang hoger vraagt ook een minimaal rijcijfer** (Loopbaan en rijbeoordeling)
- Omvang: klein
- Afhankelijk van: nr. 26
- Licentie: idee
- Wat de speler merkt: de rangen (ONS/src/core/career.ts:438-445) kijken niet alleen naar uren.

**52. Busbedrijf: versterkingsritten via een eigen chrono-map** (Dienstregeling en busbedrijf)
- Omvang: groot
- Afhankelijk van: nr. 19 en de planning van de cloud
- Licentie: idee (OO/crates/omsi-app/src/launcher/timetable.rs:66-121,287-300). Wij doen het wel anders: via `Chrono/zz_OMSIEnhancer/`, niet door TTData ter plekke te bewerken.
- Wat de speler merkt: hij legt versterkingsritten in en OMSI rijdt ze. Eén knop zet alles terug.

**53. Licht naar dagdeel en weer in de 3D-viewer** (Uitgave en launcher, busbedrijf)
- Omvang: klein bovenop ontwerp G
- Afhankelijk van: de cloud moet G eerst bouwen
- Licentie: idee
- Wat de speler merkt: de bus bij dag, schemer, nacht of bewolkt.

**54. De draagbare exe vervangt zichzelf** (Uitgave en launcher)
- Omvang: middel
- Afhankelijk van: nr. 29
- Licentie: idee (updater.rs:462-579)
- Alleen doen als erom gevraagd wordt: de draagbare versie wordt 0 tot 3 keer per release gedownload.

## 3. Bouwvolgorde in rondes

**Hoe het nu staat.**
- Lokaal wordt de vrije modus afgerond. Die zit in beginplek.ts, omloopvolgen.ts, vrijstart.ts, kaartherkenning.ts, routing.ts, RouteMap.tsx, navigatie.tsx, kaartlaag.ts, live.ts, index.ts en andere bestanden.
- De installer 0.4.8 wordt ook lokaal afgerond. package.json staat op 0.4.8; in `C:/OMSI Career/release` staan nog de exe's van 0.4.7.
- De cloudtak verandert sinds b7f3d7b onder andere:
  - plugin/omsicareer.c, die naar versie 14 gaat;
  - kaartlaag.ts (+121), timetable.ts, duty.ts, live.ts, career.ts, install.ts, index.ts (+284), kaartwerker.ts, i18n.ts, api.ts en vehicles.ts;
  - bedrijf*.ts, plus nieuwe bestanden als bedrijfsklok.ts en bedrijfsplan.ts.
- **De cloud raakt deze bestanden niet:** addon*.ts, zip.ts, Addons.tsx, omsiKeys/omsiOptions/omsiControllers/omsiProces/veilig.ts, ibis.ts, overlay.tsx, RouteMap.tsx, navigatie.tsx, geo.ts, routing.ts, rittenstaat.ts, exam.ts en onderweg.ts.
- Na elke ronde bouw je beide installers opnieuw (ONS/CLAUDE.md).

**Ronde 0: nameten (Luc, met OMSI; er wordt niets gebouwd, dit kan nu al)**
- **T1, bits 8 en 9 van het dagmasker.** Ahlheim 5, dinsdag 06-04-2021. Staat "TA31 Mo-Do Ferien" erin en "TA11 Mo-Do Schule" niet?
- **T2, feestdag.** Region Grundorf V4, dinsdag 01-05-1990. Welke van de Stadtrundfahrt-omlopen 01-04 zijn te kiezen?
- **T3, middernacht.** Region Grundorf V4, zondag 06-05-1990 00:40. Is omloop 73401 te kiezen?
- **IBIS-proef.** SD200 op Grundorf, lijn 76: probeer "07600" + "02" tegenover "76" + "7602", en daarna een lijn van drie cijfers.
- **.odr-proef.** Een korte dienst met 1 fout wisselgeld, 1 ruk en 1 halte te vroeg. Vergelijk daarna het personeelsvenster van OMSI met het bestand, en kijk wanneer OMSI schrijft.
- **WM_CLOSE bij OMSI.** Vraagt OMSI dan iets, en bewaart het iets?
- **Keuzes van Luc:**
  - de stiptheidsnorm (nr. 13);
  - mag de app bij het starten GitHub raadplegen (nr. 29)?
  - CI ja of nee (nr. 41).

**Ronde 1: veiligheid, als 0.4.9, direct na 0.4.8**
- Dit kan ook tegelijk in een eigen worktree, want deze bestanden raakt noch de vrije modus noch de cloud.
- Nummers 1, 2, 6, 18, 4, 5 en 7. Daarna nr. 28.
- Nr. 3 zodra de IBIS-proef bevestigt dat onze invoer fout is.
- Houd de wijzigingen in index.ts, i18n.ts en api.ts klein, want die bestanden veranderen in beide takken.

**Ronde 2: voortbouwen op de vrije modus (na 0.4.8, kan vóór de merge)**
- **Nr. 12, middernacht:** beginplek.ts en omloopvolgen.ts, na T3. Het deel in bedrijfsplan.ts gaat naar ronde 3.
- **Nr. 23 en 24:** één gedeelde zoektocht over de rijstroken in de kaartwerker, gebouwd op beginplek.ts en `LaneNetwork.verbind`.
- **Nummers 8, 15 en 16:** navigatie.tsx, RouteMap.tsx en geo.ts. Zet de cache-versie `VORM` in kaartcache.ts omhoog.
- **Adviesbundel nummers 9, 10, 11 en 27:** één lijst getallen in `schrijfGetallen` plus `buildAdvice`. live.ts heeft in de cloud maar +2 regels.
- **Nr. 17 en nr. 14:** timetable.ts heeft in de cloud +8 regels; houd de wijziging klein.
- **Nr. 13, rittenstaat.ts:** meld de cloudsessie dat teVroeg/teLaat verschuift (bedrijf.ts:1077-1096, onderweg.ts:241-246).

**Ronde 3: na het samenvoegen van CLOUD (plugin 14 en bedrijf*)**
- **Nr. 19, chrono, samen met 20, 21 en 22.**
  - Het nieuwe, zuivere `src/core/chrono.ts` mag al in ronde 2 geschreven worden.
  - Het aansluiten gebeurt pas nu: de lijnindex in kaartlaag.ts, `ttlNamen` en bedrijfsklok/bedrijfsplan moeten dezelfde functie gebruiken.
  - Spreek met de cloudsessie af wie dit doet, want commit 1380dc3 werkt al aan hetzelfde probleem.
- Het cloud-deel van nr. 12: bedrijfsplan.ts en de daggrens van de bedrijfsklok.
- Nummers 25, 26 en 51 (career.ts, exam.ts, Profiel en de reputatie van het bedrijf).

**Ronde 4: plugin 15 (één keer de versie omhoog)**
- Eerst de proef voor AccessTrigger.
- Dan nummers 35, 36, 37 en 40.
- Daar bovenop nummers 38 en 39.

**Ronde 5: grote navigatie**
- Nummers 32, 33 en 34.
- **Overlap:** de vlootkaart (wens 4, ONS/design/ontwerpen/wensen-luc.md:9-13) hergebruikt RouteMap. Spreek de kaartstand en de straatnamen af met de cloudsessie.

**Zijspoor add-ons (in elke ronde mogelijk; de cloud raakt deze bestanden niet)**
- Eerst nr. 30.
- Dan nr. 31: laat de cloud die gebruiken voor `bd.v3d.incomplete`.
- Dan 43, 44, 45 en 46.

**Ronde 6: uitgave en losse wensen (keuzes van Luc)**
- 29, 41, 42, 54, 47. Let op: nr. 47 raakt install.ts, dat de cloud veranderde.
- 48, 49, 50.
- 52, na nr. 19 en na de planning van de cloud.
- 53, als de cloud ontwerp G heeft gebouwd.

## 4. Wat we bewust niet overnemen

- **Het spel zelf:** renderer, fysica, AI-verkeer, reizigers en script-VM. Dat geldt ook voor hun proefdraai-VM voor IBIS en `omsi-check --run`, callbacks en scriptcontrole, de gekantelde 3D-kaart, `routearrow`-objecten in de wereld, de showroom-renderer en hun inhoudmap als laag boven OMSI (VFS, zip ter plekke). **Reden:** dat is spelherbouw en valt buiten de opdracht. Wij kunnen ook geen objecten in OMSI plaatsen.
- **Multiplayer, LAN, dedicated server en mods via LAN.** **Reden:** valt buiten de opdracht.
- **Hun lezing van bits 8 en 9 in het dagmasker** (ROUTES.md:91-92). **Reden:** vrijwel zeker fout.
  - OMSI's eigen editor heeft de vakjes "No Hols" en "Hols" in die volgorde.
  - WebDisk-draad 4599 leest het net zo.
  - Kaartmakers noemen hun omlopen ernaar: in Ahlheim is "TA11 Mo-Do Schule" 271 en "TA31 Mo-Do Ferien" 527.
  - Onze lezing klopt dus. Alleen de feestdagregel is nog open (T2).
- **Hun betekenis van de modifierbits in keyboard.cfg** (OO/crates/omsi-content/src/input.rs:11). **Reden:** tegenstrijdig met hun eigen commentaar en met OMSI's keyboard_reset.cfg. Onze indeling (Shift = 2, Ctrl = 4) past beter.
- **Hun lezing van `[rating]` in de .odr.** **Reden:** hun eigen documenten spreken elkaar tegen, en een echt OMSI-bestand heeft P achteraan.
- **Hun XP- en niveausysteem** (lib.rs:1250-1262). **Reden:** naast onze rangen en het bedrijfsniveau zou dat een derde puntensysteem zijn. Alleen nr. 51 nemen we over.
- **Hun profielpagina.** **Reden:** armer dan onze Profiel. Hooguit de lijst "Recent runs" met lijn en omloop is het bekijken waard.
- **Hun zware drempels.** **Reden:** een ruk telt pas vanaf 5 m/s², dus hard remmen voor een halte wordt nooit gezien. Een aanrijding weegt min(v/5; 1), dus vanaf 18 km/u staat het strafgetal meteen op het maximum. Wij kiezen milder.
- **IBIS-variabelen standaard rechtstreeks schrijven.** **Reden:** dan slaan omroepen, de haltelijst en de printer over (schedule.rs:2488-2497).
- **Een lijnenlijst zonder filter op `userallowed`.** **Reden:** dan staan AI-lijnen, treinen en vliegtuigen ertussen.
- **Een roadbook dat de vaste haltetijden negeert.** **Reden:** de geplande tijden kloppen dan niet.
- **`ibis_info` met de eerste drie routes per lijn.** **Reden:** ons IBIS-plan per rit is rijker.
- **TTData ter plekke bewerken met een `.orig`.** **Reden:** zij schrijven in hun eigen map, wij zouden in de echte kaart schrijven. Het alternatief is nr. 52, via een eigen chrono-map.
- **Installeren zonder plan vooraf, stil overschrijven, geen register en geen reservekopie. Hard links vanuit de inbox.** **Reden:** openOMSI raakt de OMSI-map nooit, wij wel. Bij hard links is er geen winst, omdat de inbox en OMSI vaak op verschillende schijven staan.
- **Een release bij elke push, een versienummer uit het aantal commits, en notities uit de commitkoppen.** **Reden:** dan krijgt de speler steeds een updatemelding. Luc kiest zijn nummers zelf.
- **De eis van een "complete" OMSI-installatie, en hun eigen zoekvolgorde.** **Reden:** onze zoektocht via het register is al beter.
- **Wine, macOS en Android; hun stuurwielbediening (issues #3 en #4); een thema dat alleen donker is.** **Reden:** past niet bij onze app.
- **`OMSI_LAUNCHER_INPUT`, `--cli` en hun sessieregister met logboeken.** **Reden:** onze proeven sturen de echte app al aan, en logfile.txt lezen we al.
- **Een zip uitpakken in de programmamap om bij te werken.** **Reden:** NSIS en electron-updater doen dat beter.
- **Kleuren voor verkeersdrukte.** **Reden:** onze plugin ziet het AI-verkeer niet.
- **Rijstrookadvies voor een afslag.** **Reden:** ons rijstrookmodel `Lane` kent geen buurstroken. Dat is groot werk, voor later.
- **Aanraakbediening, een Lua-host en een host voor 32-bit plugins.** **Reden:** wij zijn zelf een plugin.
- **Hun vaste zenderlijst voor de radio en hun Engelse woordenlijst `WORDS`.** **Reden:** de zenders vullen we zelf in, en de woordenlijst gaat naar het Engels en valt onder MIT.
- **Algemeen voorbehoud:** een deel van hun kennis komt uit het ontleden van Omsi.exe, zoals de klachtdrempels en veldadressen (ROUTES.md:59-78). Die feiten meten we eerst zelf na voordat we erop bouwen.

## Bronnen

- **Web:**
  - https://github.com/turbo-devv/openOMSI en /releases en /issues
  - https://turbo-devv.github.io/openOMSI/
  - https://reboot.omsi-webdisk.de/community/thread/13595-openomsi-omsi-2-rewrite-in-rust-with-100-mod-map-compability-multiplayer-and-mor/
  - https://reboot.omsi-webdisk.de/community/thread/4599-wie-funktioniert-die-ttl-datei/
  - https://api.github.com/repos/Luc-nbr/Omsi-career-addon
  - https://www.electron.build/docs/features/auto-update/
- **Licentie:** OO/LICENSE (MIT).
- **Wat de cloud verandert:** `git diff --stat b7f3d7b origin/claude/awesome-wozniak-f2svst` (51 bestanden, +4183/−1017, plugin/omsicareer.c naar versie 14).

## Deel 2: controle op volledigheid


Afkortingen zoals in de samenvatting: OO = kloon cd5232a, ONS = worktree, CLOUD = origin/claude/awesome-wozniak-f2svst, OMSI = de OMSI 2-map.

Ik heb de code van openOMSI alleen gelezen en niets uitgevoerd. In ONS en de hoofdmap heb ik niets veranderd.

## A. Wat niet klopt (met bewijs)

1. **De draad op strefa-omsi.pl gaat over een ander project.** De samenvatting noemt hem een Poolse bespreking van hetzelfde project (onderdeel "verwarring").
   - Hij dateert van 22-12-2014: drie berichten, auteur "openOMSi".
   - Het gaat om een mod die aan OMSI 2 koppelt. Hij haalt gegevens over gereden en lopende ritten op en biedt een chauffeursprofiel, statistieken, ranglijsten en een chat binnen het spel.
   - Er staat geen link naar turbo-devv in en Rust komt niet ter sprake. Bron: https://strefa-omsi.pl/Watek-OMSI-2-openOMSI--7437
   - De zin "een ouder project met precies de naam OpenOMSI heb ik niet gevonden" klopt dus niet.
   - Dat oudere project lijkt als begeleidende app zelfs méér op het onze. Het is bij drie berichten gebleven.
   - Haal deze link weg uit de bronnen voor het Rust-project.

2. **De cijfers zijn verouderd.**
   - Er zijn nu 26 sterren en 11 open issues. De nieuwe issues #8-#11 zijn op 28-09 tussen 16:58 en 17:08 UTC geopend (`gh api repos/turbo-devv/openOMSI`, /issues).
   - Er zitten 16 uur tussen de releases, niet 18: v0.1.2 kwam om 27-09 23:45 uit en v0.1.7 om 28-09 15:41.
   - De releasenotities hebben geen changelog. Wat er veranderd is, staat alleen in de commitberichten: cd5232a, 7162ab1, 17543b7 en 7aaf933.

3. **Hoofdstuk 1 schrijft het IBIS-voordeel aan de verkeerde oorzaak toe.** Er staat "drukt knoppen via de plugin-interface van OMSI (`AccessTrigger`)".
   - openOMSI toetst de IBIS in binnen zijn eigen script-VM. Het probeert een invoerplan eerst uit op kopieën van de toestand van de bus (OO/crates/omsi-sim/src/ibis.rs:1-20).
   - `AccessTrigger` komt alleen voor in de host voor plugin-DLL's van anderen (OO/crates/omsi-plugin/src/lib.rs, OO/docs/PLUGINS.md:183-205).
   - openOMSI heeft `AccessTrigger` dus nooit in het echte OMSI gebruikt. Voor nr. 35 en 38 is het een onbeproefde aanname.
   - Voorwaarden die bij nr. 35 horen:
     - Een trigger vuurt alleen op een verandering ten opzichte van het vorige beeld. Drukken is dus één beeld `true` en daarna `false`; loslaten vuurt `<naam>_off` (PLUGINS.md:200-203).
     - De lijst triggers ligt bij de start vast via `[triggers]` in de `.opl`. Namen die de bus niet kent, worden overgeslagen (PLUGINS.md:187, 204). De `.opl` moet dus vooraf alle namen bevatten van alle bussen die we willen ondersteunen.

4. **Bits 8 en 9 zijn onvolledig beschreven.**
   - De samenvatting noemt hun lezing "vrijwel zeker fout" en citeert ROUTES.md:91-92.
   - Ze vermeldt niet dat ROUTES.md:43-47 zich ook beroept op de legenda van OMSI's gedrukte dienstregeling ("%" en "~").
   - In OMSI/Languages/ENG_basic.olf staat alleen "Holidays:"; die legenda heb ik niet kunnen terugvinden.
   - Ahlheim ondersteunt onze lezing: 271 = ma-do + bit 8 heet "Schule".
   - De conclusie blijft staan, maar noem het tegenbewijs en laat proef T1 de doorslag geven.

5. **Kanttekeningen bij de licentie ontbreken.**
   - MIT geldt ook voor hun documentatie (FORMATS.md, ROUTES.md). Parafraseren mag, overnemen alleen met de licentietekst erbij.
   - Hun machinevertaling gebruikt NLLB-200 (OO/crates/omsi-app/src/mt.rs:1-11). Dat model valt voor zover ik weet onder CC-BY-NC 4.0; dat heb ik niet nagekeken. Klopt het, dan is het niet bruikbaar in onze app.
   - Hun reverse-engineering zegt "OMSI 2.2.032" (OO/README.md:55). Maar de versie-informatie van Omsi.exe zegt ook bij 2.3.004 "2.2.032" (ONS/plugin/omsicareer.c:658-662). Of hun veldadressen (+0x7c8, +0x5e4) bij 2.2.032 of bij 2.3.004 horen, is dus onbekend. Dat maakt nameten verplicht.

6. **In "wij zijn sterker" ontbreken de punten waar openOMSI aantoonbaar vastloopt.**
   - **Stuurwielen:** issues #3 en #4, en de forumberichten over de G27 en G29 (geen force feedback, geen wizard). Wij hebben een wizard, bewegende asbalken en `[FFScale]` (ONS/src/core/omsiControllers.ts:80,102).
   - **Hof per datum:** issue #6 (in 1994 nog lijn 92), voor 0.1.8 beloofd. Wij kiezen de hof per jaar (ONS/src/core/hof.ts:247-270).
   - **OMSI vinden:** issue #8 en WebDisk-berichten #2 en #5.
   - **Toetsen van de speler:** issues #10 en #1 (hun eigen WASD-toetsen overschrijven die van de speler). Wij bewerken `keyboard.cfg` zelf, met zoeken en een botsingscontrole (ONS/src/renderer/src/GameSetup.tsx:620-767).
   - **Community:** in issue #1 vraagt een speler om een Discord. Wij hebben er een.

7. **De lijst "niet overnemen" is onvolledig.** Ontbreekt:
   - hun objecteditor, die tegelkopieën schrijft (OO/docs/USER_GUIDE.md:270-282);
   - tijdversnelling, "opstaan", instapmodi, "precies gepast betalen", de kaart te voet, voertuigen neerzetten en koppelen;
   - hun machinevertaling;
   - PBR-materialen voor modders (OO/docs/PBR.md).
   
   Allemaal spel of motor, dus buiten de opdracht.

## B. Wat ontbreekt (met bron)

**Binnenkort bij openOMSI:**
- De maker belooft voor 0.1.8: zoomen in het interieur (#5), hof per datum (#6) en het vinden van OMSI (#8).
- Hij belooft ook fixes voor toetsen (#10), scripttexturen (#11) en een betere pagina voor stuurwielen (#3).
- Roadmap "Next" (OO/docs/ARCHITECTURE.md:209-211): slijtage over een dienst (levensduur van lampen, leeftijd van de accu) en een keuze voor de remise, zodat de werkplaats weet of de bus in de remise staat. Dat overlapt met het wagenpark van CLOUD.

**Gemist in de functielijst:**
- weer uit `Weather/*.owt`, seizoenen en METAR;
- "Continue where you left off";
- een pagina met OMSI's lessen;
- `option_presets/*.oop`;
- chauffeurs (.odr) aanmaken en verwijderen;
- OMSI-opties die wij niet beheren, zoals `[wear_lifespan]`;
- codetabellen per bestand;
- namen uit `.dsc`;
- badges in de buslijst;
- stopverzoeken;
- de keuze van het wagennummer;
- tanken, wassen en repareren;
- Russisch als taal;
- de melding na een update.

**Aanvullingen op bestaande voorstellen:**
- **Nr. 38 en 39:** vuur nooit `ai_scheduled_settarget` op de bus van de speler. openOMSI zag daardoor de elektriek van de NL202 uitvallen (ARCHITECTURE.md:241-242).
  - Bij "Bus starten": wacht tot de motor aanslaat, controleer dat hij blijft lopen, en druk de eigen stroomschakelaar van het display in (ARCHITECTURE.md:419-420).
  - `AutoClutch` staat standaard op 1 (ARCHITECTURE.md:417).
- **Nr. 31:** extra controles om op te nemen.
  - `[collisionmesh]` is een verschrijving die OMSI negeert, dus zo'n object botst nergens tegen (OO/tools/omsi-check/src/main.rs:340-360).
  - Absolute paden naar texturen op de schijf van de maker (ARCHITECTURE.md:415).
  - Een pakket dat in twee versies geïnstalleerd staat (ARCHITECTURE.md:411-413).
- **Nr. 26:** openOMSI telt een ruk met reizigers aan boord apart (`harsh_pax`, OO/crates/omsi-app/src/career.rs:43,207).
- **Nr. 29 en 42:** de updater van 0.1.7 zet de nieuwe bestanden naast de draaiende versie, draait terug als er iets misgaat, ruimt de oude bestanden bij de volgende start op en meldt mappen waarin hij niet kan schrijven (commit cd5232a).

## C. Aanvullende voorstellen (zelfde formaat, doorgenummerd)

**55. Hof en remise precies zoals OMSI ze kiest** (Dienstregeling)
- Omvang: klein tot middel
- Afhankelijk van: nr. 19 (welke chrono-mappen actief zijn)
- Licentie: feit, zelf gemeten. Idee uit ROUTES.md:65-72 en issue #6.
- Hoe OMSI het doet: `[standarddepot]` in global.cfg → `[aigroup_depot]` in `ailists.cfg`, **plus** `Chrono/*/ailists_#upd.cfg` → de hof met die `[name]`.
- Op Spandau hebben 11 chrono-mappen zo'n bestand. Voorbeelden:
  - 0300 → "Spandau 1989-12";
  - 1000 → "Hof Potsdam/Spandau 1991";
  - 1300 → "Spandau 1994" en "Hof Potsdam/Havelland 1993".
- Per wagen staat er ook een regel met wagennummer, reclame en geldig van/tot, bijvoorbeeld `2702  Kaiser's (H)  19871101  19880131` (OMSI/maps/Berlin-Spandau/Chrono/0100_Neuer13N/ailists_#upd.cfg).
- openOMSI leest `#upd` niet; hun issue #6 is precies dit probleem.
- Wat de speler merkt: exact de juiste IBIS-codes per datum, en de juiste bus met de juiste reclame per wagennummer.
- Onze code:
  - ONS/src/core/fleet.ts:56-84 leest alleen `ailists.cfg`;
  - ONS/src/core/hof.ts:247-270 is een heuristiek op naam en jaar. Die blijft als terugval.

**56. Tijdvak begrensd door `[years]` uit global.cfg** (Dienstregeling)
- Omvang: klein
- Afhankelijk van: niets
- Licentie: feit, zelf gemeten. openOMSI leest het veld wel maar gebruikt het niet (OO/crates/omsi-map/src/global.rs:186-191).
- Wat er in de bestanden staat:
  - Alle 14 kaarten hebben een `[years]`: Spandau 1986-1994, Rheinhausen 2002-2016, Grundorf 1988-2000, Ahlheim 5 2025-2026.
  - Spandau heeft daarnaast `[realyearoffset] -25`.
  - Deze global.cfg's zijn UTF-16 met BOM.
- Het probleem nu: ONS/src/core/kaartlaag.ts:373-389 valt terug op het jaartal in de mapnaam, en anders op het huidige jaar (2026).
  - Alleen Spandau (4) en Krefrath (1) hebben een situatie die bij OMSI wordt meegeleverd.
  - Op de andere kaarten valt het tijdvak buiten het bereik, tenzij OMSI er zelf een laststn.osn heeft geschreven. Dan kiest de app een verkeerde hof of een verkeerd wagenpark.
- Wat de speler merkt: een datumkeuze binnen dat bereik, bijvoorbeeld 1991 op Spandau voor lijn 137.

**57. Echt weer: alle weerbestanden, een seizoen en METAR** (Uitgave en launcher)
- Omvang: middel
- Afhankelijk van: niets. Of de app contact maakt met het internet, kiest Luc.
- Licentie: idee. METAR is een openbare norm.
- Nu staan er vijf vaste weertypes in ONS/src/shared/weather.ts:15-60. Er is geen sneeuw, geen seizoen en geen weer van een mod.
- Wat openOMSI doet:
  - Het toont elk `Weather/*.owt` met naam en temperatuur (OO/crates/omsi-app/src/launcher/drive.rs:400-431).
  - Het filtert op seizoen: sneeuw alleen in de winter (OO/crates/omsi-app/src/launcher/state.rs:787-812).
  - Het biedt "Current weather" van het dichtstbijzijnde vliegveld. Dat komt uit `Weather/ICAO.txt` en `timezone.txt` van de kaart (drive.rs:690-732). Het rapport haalt het bij aviationweather.gov (weather_setup.rs:375-400) en zet het om naar een `.owt` (OO/crates/omsi-content/src/weather.rs:52-160).
- OMSI heeft zelf `[currWeather_ICAO]` in options.cfg. Of de eigen download van OMSI nog werkt, moet nog worden nagemeten.
- Wij schrijven het resultaat als `.osn.owt` (ONS/src/core/weather.ts).

**58. De eigen bus van het busbedrijf rijdt in OMSI met zijn eigen gegevens** (Busbedrijf en loopbaan)
- Omvang: klein
- Afhankelijk van: de merge van CLOUD, en eerst een proef
- Licentie: idee (OO/crates/omsi-app/src/game_lists.rs:262-266; spawn.rs:391-398; app_events.rs:1800-1803). Het formaat is zelf gemeten.
- Wat OMSI in een situatie bewaart (OMSI/Situations/Linie 5.osn):
  - stringvars `number` (3342) en `kennzeichen` (B-V 3342);
  - vars `tank_percent` en `Dirt_Norm`;
  - een veld voor de kilometerstand.
- Onze situatie schrijft alleen `SetLineTo`, `Matrix_Nr` en `IBIS_cabindisplay`, en een kilometerstand van 0.000 (ONS/src/core/situation.ts:328-344).
- CLOUD heeft al `EigenBus.nummer` ("ook het wagennummer op het scherm"), `km` en `staat` (CLOUD:src/core/bedrijf.ts:115-130).
- Wat de speler merkt: op de ruit en de kentekenplaat staat het wagennummer van het bedrijf. De tank, het vuil en de kilometerstand lopen door van de ene dienst naar de volgende.
- In de loopbaan kan het wagennummer uit de remiselijst van die datum komen (nr. 55).

**59. De eigen slijtage van OMSI koppelen aan de staat van de bus** (Busbedrijf)
- Omvang: klein
- Afhankelijk van: eerst nameten
- Licentie: feit, uit openOMSI's reverse-engineering, dus eerst zelf nameten
- `[wear_lifespan]` in options.cfg heeft vijf standen: 0 geen slijtage, 1 zeer slecht, 2 slecht, 3 normaal, 4 goed. Dat wordt `wearlifespan` 1,5e6 / 0,01 / 0,1 / 1 / 10 (OO/crates/omsi-app/src/settings.rs:49-51,369-371; OO/crates/omsi-launcher-core/src/lib.rs:172-174).
- Het blok staat in Lucs options.cfg, maar niet onder onze 37 beheerde blokken (ONS/src/shared/omsiSettings.ts).
- Wat de speler merkt: een verwaarloosde bus krijgt ook in het spel meer storingen. Na de dienst zet de app de stand terug.
- Het blok komt daarnaast als instelling "Onderhoudsstaat" in Instellingen.

**60. Elk profiel een eigen OMSI-chauffeur** (Loopbaan)
- Omvang: klein
- Afhankelijk van: nr. 25
- Licentie: idee (lib.rs:196-198 voor `[last_driver]`, lib.rs:1323-1343 voor `create_profile`)
- Hoe: `[last_driver]` in options.cfg bepaalt in welk .odr OMSI schrijft. Per profiel een eigen .odr aanmaken en die bij de start instellen.
- Wat de speler merkt: het vak "Volgens OMSI" hoort bij zijn eigen profiel.

**61. Stopverzoek in de navigatie en in de rittenstaat** (Bediening in de bus en loopbaan)
- Omvang: klein
- Afhankelijk van: plugin 13 of hoger
- Licentie: idee (ARCHITECTURE.md:164; OO/crates/omsi-app/src/humans.rs:1799; app_events.rs:687)
- `haltewunsch` komt 489 keer voor in de scripts in OMSI/Vehicles. ONS en CLOUD gebruiken hem nergens.
- Wat de speler merkt: "Halte aangevraagd" op de navigatie. De rittenstaat telt "halte voorbijgereden met stopverzoek".

**62. De tekenset per bestand herkennen** (Add-ons en dienstregeling)
- Omvang: klein
- Afhankelijk van: niets
- Licentie: idee. De heuristiek schrijven we zelf; bron OO/crates/omsi-cfg/src/codepage.rs:1-110.
- Wat openOMSI herkent: UTF-8 zonder BOM, 1250 en 1251, en zipnamen in CP866. Het voorbeeld dat ze geven: de LiAZ heette als 1252 gelezen "ËèÀÇ 5292.20".
- Wat wij nu doen: altijd win1252 (ONS/src/core/omsiFile.ts:33-44; schermcfg.ts:275), en CP437 voor namen in een zip (ONS/src/core/zip.ts:62-68).
- Wat de speler merkt: leesbare namen van Russische, Poolse en Tsjechische bussen, haltes en lijnen.

**63. Namen en beschrijvingen in de eigen taal uit `_<TAAL>.dsc`** (Dienstregeling)
- Omvang: klein
- Afhankelijk van: niets
- Licentie: idee (lib.rs:627-632,879-934)
- Lucs kaarten hebben 24 `global_*.dsc`-bestanden; bussen hebben ze ook. ONS leest geen enkele `.dsc`.
- Voor Nederlands valt de app terug op ENG.

**64. Badges in de buskeuze** (Add-ons)
- Omvang: klein
- Afhankelijk van: nr. 31 voor ontbrekende pakketten
- Licentie: idee (drive.rs:100-125; lib.rs:675-698)
- Wat de speler merkt: labels "Nieuw", "Add-on", "Onderdelen ontbreken: Urbino_II" en "3 kleurstellingen".
- De gegevens staan al in addoncheck.ts en het register.

**65. De grafische voorinstelling van de kaartmaker** (Uitgave en launcher)
- Omvang: klein
- Afhankelijk van: niets
- Licentie: idee (lib.rs:1561-1590; pages.rs:384-388)
- OMSI/option_presets bevat "Addon HafenCity - Best Performance/Quality", "Addon Hamburg 20 - …" en "TH-Wald_low/medium/high".
- Wat de speler merkt: bij een dienst op zo'n kaart biedt de app die voorinstelling aan, met een reservekopie. Nu heeft de app drie eigen voorinstellingen (ONS/src/shared/omsiSettings.ts:110-124).

**66. OMSI's vier lessen, een uitbreiding van nr. 49** (Bediening in de bus)
- Omvang: klein tot middel
- Afhankelijk van: een proef
- Licentie: idee (OO/crates/omsi-app/src/launcher/pages.rs:1254-1281; tutorial.rs:1-6; lib.rs:1532-1560)
- Wat er is: `OMSI/Tutorials/STRG|FAST|LIN|SPEZ.osn`, plus pagina's in `Tutorials/<n>/` en `menu_<n>_<TAAL>.html`.
- Wat de speler merkt: "Start de les" zet de situatie klaar; de pagina's staan op de tablet met vorige/volgende. OMSI's eigen automatische lesmodus draait dan niet mee.

**67. Verder rijden waar je in OMSI stopte** (Vrij rijden)
- Omvang: klein
- Afhankelijk van: niets
- Licentie: idee (drive.rs:645-653; lib.rs:1790-1805)
- Het probleem nu: de app overschrijft `laststn.osn` bij elke dienst en bewaart maar één keer een kopie (ONS/HANDOVER.md:50-55; startup.ts:48).
- Wat de speler merkt: een doorlopende reservekopie van zijn eigen laatste situatie, en de knop "Verder waar OMSI stopte".

**68. Eenmalig "Bijgewerkt naar x, wat is er nieuw"** (Uitgave)
- Omvang: klein
- Afhankelijk van: nr. 7
- Licentie: idee (launcher/update.rs:145-160; launcher/mod.rs:206-207)
- Wat de speler merkt: na een update één melding met de notities die al voor Discord geschreven worden (`C:\OMSI Enhancer Discord\uitgaven\*.md`). Er komt geen internet aan te pas.

**69. Drukte per dienst kiezen: rustig, normaal of druk** (Uitgave)
- Omvang: klein
- Afhankelijk van: niets
- Licentie: idee (drive.rs:375-392)
- Wat de speler merkt: die keuze staat op het startscherm en schrijft `[AIMaxCountRandom]`, `[AIPassFactor]` en `[AIMaxCountScheduled]`. Die beheren we al.

**70. Verkennen: openOMSI als tweede spelmotor** (Groep D)
- Omvang: middel
- Afhankelijk van: een proef, en dat openOMSI stabieler wordt
- Licentie: niet van toepassing, want het is een koppeling en geen code
- Waarom het kan:
  - openOMSI leest dezelfde OMSI-map.
  - Het neemt `--situation x.osn` of `--map/--bus/--time/--line/--tour/--entry` aan (OO/docs/USER_GUIDE.md:32-52).
  - Het laadt 32-bit plugin-DLL's in `omsi-plugin-host32.exe` (PLUGINS.md:209-218), vermoedelijk ook uit OMSI/plugins.
- Onze plugin zou in dat proces geen "2.3.004" vinden en dus geen geheugen lezen (omsicareer.c:664-693). Dan werken alleen de API-variabelen.
- Te bewijzen: laadt de DLL daar, verschijnt `live.json`, en hangt de overlay boven `openomsi.exe`?

**71. Opt-in ranglijst via Discord** (Community, lage prioriteit)
- Idee uit het project van 2014 op strefa-omsi, niet uit turbo-devv.
- Luc beslist hierover; de privacy moet eerst geregeld zijn.

**72. Downloadpagina en handleiding op GitHub Pages** (Uitgave, lage prioriteit)
- Licentie: idee (OO/site/app.js:42 haalt de nieuwste release op)
- `Luc-nbr/Omsi-career-addon` is openbaar maar heeft geen Pages (`has_pages:false`).

## Bronnen

- https://github.com/turbo-devv/openOMSI (issues #1-#11 en reacties via de API; commits via de API)
- https://reboot.omsi-webdisk.de/community/thread/13595-… (2 pagina's)
- https://strefa-omsi.pl/Watek-OMSI-2-openOMSI--7437 (2014, ander project)
- Paden in OO, ONS, CLOUD en OMSI zoals hierboven, met regelnummers.