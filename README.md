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

### Profielen

Elke chauffeur is een eigen profiel met een eigen logboek, opgeslagen in
`%APPDATA%\omsi-career\profiles\`. Bij de eerste start vraagt de app om een naam;
daarna wissel je links van chauffeur of maak je er een bij. Een oud `career.json`
uit de tijd dat de app maar een chauffeur kende wordt bij de eerste start
overgenomen als profiel en bewaard als `career.json.overgenomen`.

## Welke diensten je krijgt

Een dienst blijft binnen één omloop. In OMSI stel je een dienst in via **Set
Time Table**, en dat menu werkt in de volgorde Line → Tour → Trip: je kiest één
lijnbestand en daarbinnen één omloop. Een dienst die halverwege naar een andere
omloop springt kun je daar niet selecteren.

Het menu vraagt vier dingen en de app noemt ze alle vier: **Line**, **Tour**,
**Trip** en **First stop** — die laatste is de halte waar OMSI je neerzet.

"Line" in dat menu is het lijnbestand van de kaart, niet het lijnnummer uit de
rit. Op Berlin-Spandau is dat hetzelfde (`54`), maar op Thüringer Wald heet het
bestand `KI-OVF` terwijl de rit lijnnummer `8343` draagt — op dat nummer zoek je
je blind in het menu. De app toont daarom het lijnbestand, met een paneel dat
precies zegt wat je waar kiest.

## Hoe de ritten aansluiten

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

### Smart App Control blokkeert de gebouwde exe

Staat Smart App Control aan (`VerifiedAndReputablePolicyState = 1` onder
`HKLM:\SYSTEM\CurrentControlSet\Control\CI\Policy`), dan worden zowel de
installer, de draagbare versie als de geinstalleerde app geblokkeerd. Anders dan
bij Defender kun je daar geen uitzondering voor maken: het is een globale
schakelaar, en uitzetten kan niet ongedaan worden gemaakt zonder Windows opnieuw
te installeren.

De uitweg is de app via de Electron-runtime starten in plaats van als eigen exe.
Die `electron.exe` is net zo min ondertekend, maar heeft wel reputatie en wordt
doorgelaten:

```
Start OMSI Career.cmd
```

Wat er geblokkeerd is, staat in het logboek
`Microsoft-Windows-CodeIntegrity/Operational`, gebeurtenis 3077.

**De installer is niet ondertekend.** Windows SmartScreen toont daarom bij de
eerste start "Windows heeft uw pc beschermd"; via *Meer informatie -> Toch
uitvoeren* gaat hij gewoon door. Ondertekenen vraagt een code-signing-certificaat
op naam, en dat kost geld per jaar.

## Wat de app in OMSI verandert

Niets. De app schrijft geen situatiebestanden, raakt `options.cfg` niet aan en
start het spel niet op. Je laadt je kaart en je bus zelf in OMSI en kiest daarna
in de app een dienst uit het rooster; de app levert alleen de instructies.

Het enige dat in de spelmap terechtkomt is de plugin voor de overlay, en dat
zijn twee bestanden in `plugins/` die je zo weer weghaalt.

Dat scheelt ook zorgen: geen sjabloon-afhankelijkheid meer, geen back-ups die
kunnen verjaren, en kaarten die je nooit eerder speelde doen gewoon mee.

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

## Overlay met live gegevens

Boven het spel hangt een doorzichtig, klikdoorlatend venster met de klok, je
vertraging, de rit waar je mee bezig bent, de eerstvolgende halte, het aantal
passagiers en of er iemand wil in- of uitstappen.

De gegevens komen uit een eigen plugin in `plugin/`. OMSI's plugin-contract
staat in zijn eigen RTTI:

```
TAccessVariable(varindex, value, write)        TStart(AOwner)
TAccessSystemVariable(varindex, value, write)  TFinalize()
TAccessStringVariable(varindex, str, write)
```

Een `.opl` in `plugins/` kent vier lijsten: `[varlist]`, `[stringvarlist]`,
`[systemvarlist]` en `[triggers]`. **Elke lijst begint met het aantal namen**,
daarna pas de namen; OMSI leest dat aantal in zijn velden `NoVar`, `NoStr` en
`NoSys`. Zonder die regel meldt het spel `there was an error in line N` en wordt
de plugin niet geladen. De index die OMSI meegeeft is de positie in die lijst,
dus de volgorde moet gelijk lopen met de enums in `omsicareer.c`.

Welke namen bruikbaar zijn, is uit OMSI zelf af te leiden. `TScriptVarIndizes`
in de binary bevat de variabelen die OMSI in **elk** voertuig bijhoudt —
`Velocity`, `humans_count`, `kmcounter_km`, `tank_percent`, `schedule_active`,
`PAX_Entry_Req` — en die werken dus op iedere bus. De systeemvariabelen zijn te
vinden via `(L.S.naam)` in de busscripts: `Time`, `Day`, `Month`, `Year`,
`Weather_*`, `PrecipRate`. `Time` is seconden na middernacht; de scripts delen
hem door 3600 voor uren.

Variabelen als `IBIS_busstop_name` en `IBIS_Delay_min` bestaan alleen op bussen
mét IBIS — ongeveer elf van de busmappen. De overlay gebruikt ze als ze er zijn
en rekent de vertraging anders zelf uit tegen de dienstregeling. Een ster achter
een waarde betekent dat hij afgeleid is en niet rechtstreeks uit OMSI komt.

**Passagiersstemming bestaat niet als variabele.** OMSI houdt wel
chauffeursbeoordelingen bij (`DG_Driver_Rating_Driving`, `_Ticket`, `_Comfort`),
maar die belanden pas na afloop in `Drivers/*.odr`. De stemming in de overlay is
daarom een afgeleide van vertraging en rijstijl, en staat als zodanig gemarkeerd.

### Bouwen en plaatsen

```bash
plugin\build.cmd
```

OMSI is 32-bits Delphi, dus de DLL moet 32-bits zijn en de namen onversierd
geëxporteerd (via `omsicareer.def`).

Plaatsen gaat vanzelf, langs twee wegen. Het installatieprogramma zoekt Steam
in het register (`HKLM\SOFTWARE\WOW6432Node\Valve\Steam\InstallPath`)
en kopieert de twee bestanden naar `OMSI 2\plugins\`; het onthoudt dat pad
zodat het verwijderprogramma ze weer opruimt.

Staat OMSI in een andere Steam-bibliotheek, dan vindt NSIS hem niet —
libraryfolders.vdf uitlezen is daar geen doen. Daarom controleert de app het
bij elke start ook zelf en zet hem alsnog neer als hij ontbreekt of afwijkt,
vergeleken op sha1. De stand staat onder de zoekknop.

Met de hand weghalen is die twee bestanden uit `plugins\` verwijderen.

Bewust géén hook in de grafische laag: dat sloopt oude DX9-spellen. Het is een
gewoon venster erbovenop, wat werkt omdat OMSI in vensterstand draait.

## Nog te doen

- Bevestigen dat de plugin in OMSI laadt: start het spel en kijk of er geen
  `error in line` bij `OMSICareer.opl` in `logfile.txt` staat.
- Diensten vrijspelen op rang, en repaints per wagenpark kiezen.
