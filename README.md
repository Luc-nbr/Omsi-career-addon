# OMSI Career

Career mode voor OMSI 2. Je kiest een kaart en hoe lang je wilt rijden, de app
wijst een dienst toe uit de échte dienstregeling van die kaart, toont een
dienstkaart en zet het spel klaar om hem te gaan rijden.

## Hoe het werkt

OMSI-kaarten bevatten hun eigen dienstregeling in `maps/<kaart>/TTData`:

| Bestand | Inhoud |
| --- | --- |
| `*.ttl` | Omlopen (Umläufe): alles wat één voertuig op een dag rijdt |
| `*.ttp` | Ritten: lijnnummer, eindbestemming, haltes en rijtijdprofielen |
| `Busstops.cfg` | Halte-id's met hun naam |

Een omloop is nog geen chauffeursdienst — die duurt vaak twintig uur. De app
bouwt er een dienst uit op van de lengte die jij kiest, met minimaal twee ritten
en minimaal een half uur.

### Hoe de ritten aansluiten

De ritten sluiten op elkaar aan, zodat je in OMSI nooit hoeft te verplaatsen.
Waar die aansluitingen liggen wordt niet geraden maar afgeleid: wat één voertuig
in een omloop achter elkaar rijdt, is per definitie berijdbaar. Haltenamen of
-id's vergelijken zou niet werken — op Thüringer Wald klopt de halte-id maar in
19% van de gevallen en zelfs de naam maar in 78%.

Die relatie wordt wel uitgebreid zonder iets te verzinnen. Volgt rit B ergens op
rit A, en volgt B ook op rit C, dan eindigen A en C op dezelfde plek; alles wat
op A mag volgen mag dan ook op C volgen. Union-find over eind- en beginpunten
maakt dat expliciet en verdubbelt tot verviervoudigt het aantal keuzes op een
eindpunt: van 1,5 naar 2,3 op Berlin-Spandau, van 1,9 naar 6,2 op HafenCity.

Op elk eindpunt kiest de app willekeurig uit wat daar vertrekt — terug waar je
vandaan kwam, of een andere lijn die daar ook begint. Dezelfde vraag levert twee
keer achter elkaar een andere dienst op.

Een dienst loopt nooit over een stilstand van meer dan 45 minuten heen: daar
wisselt in de praktijk de chauffeur.

### Dagtypes

Het derde veld van `[newtour]` is een bitmasker van de dagen waarop de omloop
rijdt: bit 0 is maandag tot en met bit 4 vrijdag, bit 5 zaterdag, bit 6 zondag.
Omlopen die "Mo-Fr" heten hebben masker 287 of 799, die met "Sa" 288 of 800.

Alle ritten van een dienst moeten op dezelfde weekdag rijden. De bits boven 6
zijn feestdagcategorieën en tellen daarbij niet mee: daar overlappen een
zaterdag- en een zondagomloop elkaar, en zonder die afkapping belanden ze in
dezelfde dienst. De datum die de app in OMSI zet is dan ook een dag waarop de
dienst echt rijdt.

### De bus

De bus wordt erbij gezocht zodra de dienst er is. Twee eisen, in volgorde: hij
moet in `ailists.cfg` van de kaart staan — dat is het wagenpark van de kaart en
regelt meteen stad en tijdvak — en hij moet een wagenparkbestand hebben dat de
eindbestemmingen van deze dienst kent, anders rijdt hij met lege
bestemmingsfilms. Onder de overblijvers wordt willekeurig gekozen. Op
Berlin-Spandau levert dat de MAN SD200 en SD202 op, en niet een Hamburgse gelede
bus uit 2017. Je kunt de keuze altijd overrulen.

## Starten

```bash
npm install
npm run dev
```

Bouwen: `npm run build`. De losse kern is te draaien zonder de app op te
starten met `npm run probe`, wat alle kaarten inleest en een voorbeelddienst
afdrukt.

### Installer maken

```bash
npm run dist
```

Levert in `release/` een installer (`OMSI Career 0.1.0 Setup.exe`) en een
draagbare versie die zonder installeren draait. Beide zijn 64-bits Windows en
ongeveer 77 MB; daar zit Electron zelf in.

Het icoon wordt gegenereerd met `npm run icon` en staat als `build/icon.ico`.

Faalt de build met `EBUSY: resource busy or locked, unlink ... app.asar`, dan
houdt Windows Defender het bestand vast dat electron-builder net uit de
Electron-distributie heeft gepakt. Bouwen naar een map buiten het project helpt:

```bash
npx electron-builder -c.directories.output=%TEMP%/omsi-release
```

De exe's uit die map zijn daarna gewoon naar `release/` te kopieren. Structureel
is een Defender-uitsluiting voor de projectmap de oplossing.

**De installer is niet ondertekend.** Windows SmartScreen toont daarom bij de
eerste start "Windows heeft uw pc beschermd"; via *Meer informatie -> Toch
uitvoeren* gaat hij gewoon door. Ondertekenen vraagt een code-signing-certificaat
op naam, en dat kost geld per jaar.

## Wat de app in OMSI verandert

OMSI heeft geen startparameter om een situatie te openen; de enige switches zijn
`-editor`, `-windowed`, `-debug`, `-nolog`, `-logall` en `-savelogs`. De dienst
wordt daarom via bestanden klaargezet:

- `maps/<kaart>/laststn.osn` — de laatste situatie van die kaart. Het startscherm
  van OMSI biedt drie keuzes (`Load last situation on map`, `Load map without
  busses`, `Load situation:`) en de bovenste opent precies dit bestand. Daarmee
  laadt **Start** de dienst zonder dat je nog iets hoeft aan te wijzen. De
  originele situatie wordt eenmalig bewaard als `laststn.osn.omsicareer-backup`.
- `Situations/OMSI Career.osn` — dezelfde dienst onder een eigen naam, voor wie
  liever `Load situation:` gebruikt.
- `options.cfg` — alleen het blok `[last_map]`, met een back-up ernaast
  (`options.cfg.omsicareer-backup`).

Welk keuzerondje voorgeselecteerd staat, bewaart OMSI nergens: `options.cfg` kent
alleen `[last_map]` en `[last_driver]`. Het valt dus terug op de bovenste keuze,
en dat is de keuze die wij vullen.

## IBIS

De dienstkaart toont wat er bij het instappen in de IBIS moet: **Linie**,
**Umlauf** en de **bestemmingscode**, plus de code van elke rit in de ritregel.

Die codes komen uit het wagenpark-bestand (`.hof`) dat naast het busmodel ligt.
Eén bus heeft er vaak een stuk of tien, één per stad en per tijdvak, en ze
verschillen echt: Johannesstift is in 1988 code `221` en in 1994 code `161`. De
app kiest daarom het wagenpark dat de eindbestemmingen van de dienst kent én op
de speeldatum al gold, en schrijft diezelfde keuze als `yard` in de situatie —
anders zou de bus in het spel een ander wagenpark laden dan waar de getoonde
codes uit komen.

### De beperking die daarbij hoort

De startpositie van je bus staat in het situatiebestand en hangt aan de tegels
van de kaart — die is niet te verzinnen. De app neemt daarom een bestaande
situatie van die kaart als sjabloon over. OMSI schrijft na elke sessie
`laststn.osn` per kaart, dus **een kaart die je één keer hebt gespeeld levert
vanaf dan automatisch een sjabloon op**. Heeft een kaart er nog geen, dan zet de
app alleen kaart en tijd goed en kies je zelf een bus.

## Opbouw

```
src/core/      OMSI-logica, zonder Electron: bestandsformaten, diensten, carrière
src/main/      Electron-hoofdproces met de IPC-handlers
src/preload/   De brug naar de interface
src/renderer/  React-interface
scripts/       probe.ts (kern zonder UI), screenshot.cjs (app fotografeert zichzelf)
```

## Wat de app na afloop uitleest

OMSI schrijft bij het afsluiten de hele wereldtoestand naar
`maps/<kaart>/laststn.osn`, inclusief de variabelen van je eigen bus. Daar staat
`kmcounter_km` in (de kilometerteller) en `IBIS_Delay_min` (de vertraging op het
display). De app leest die waarden bij het starten en nogmaals bij het afronden,
en het verschil is wat je werkelijk gereden hebt.

Zolang het bestand nog de dienst bevat die de app erin heeft gezet, is OMSI nog
niet afgesloten en valt er niets te meten; het logboek zegt dat dan ook.

Dit is bewust zonder plugin gedaan. Een echte OMSI-begeleidingstool zoals
OmniNavigation doet het anders: die laadt een eigen DLL in `plugins/` die
`PluginStart`, `PluginFinalize` en `AccessStringVariable` exporteert, legt via
een GUID in `omninavigation.cfg` contact met een losse applicatie, en leest zo
live mee. Dat geeft gegevens tijdens de rit in plaats van erna, maar vraagt een
C-compiler en een draaiend achtergrondproces.

## Nog te doen

- Punctualiteit en passagiers live meten. Dat vraagt een plugin-DLL in `plugins/`
  die voertuigvariabelen uitleest, en dus een C++-compiler.
- Diensten vrijspelen op rang, en repaints per wagenpark kiezen.
