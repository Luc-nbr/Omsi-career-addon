# OMSI Career

Career mode voor OMSI 2. Je laadt je kaart en bus zelf in OMSI; de app stelt een
rooster samen uit de échte dienstregeling van die kaart, geeft de instructies en
de IBIS-codes, en hangt een overlay met live gegevens boven het spel.

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

Op elk eindpunt kiest de app willekeurig uit wat daar binnen dezelfde omloop
vertrekt — meestal terug waar je vandaan kwam, soms een variant of een
Betriebsfahrt. Welke omloop, welk tijdstip en welk stuk eruit is ook willekeurig,
dus dezelfde vraag levert twee keer achter elkaar een andere dienst op.

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

## Dienstkaartje printen

Het kaartje gaat op een bonprinter van 80 mm. Er wordt via het Windows-
stuurprogramma afgedrukt en niet met rauwe ESC/POS-opdrachten: dat laatste geeft
meer grip — automatisch afsnijden, vetgedrukte regels — maar vereist dat je weet
hoe de printer hangt, en vrijwel elke bonprinter installeert gewoon een
stuurprogramma.

De pagina is 80 mm breed met de inhoud op 72 mm, de gebruikelijke bedrukbare
breedte. De hoogte volgt de inhoud: de pagina meldt zelf hoe hoog hij geworden
is, zodat de printer geen halve meter wit papier doorschuift. Alles is zuiver
zwart op wit, want een thermische kop kent geen grijs — die brandt punten, en
grijstinten worden vlekkerig.

De knop **Voorbeeld** opent hetzelfde kaartje in een venster, zodat je het kunt
bekijken zonder papier te verbranden.

## Wat de app in OMSI verandert

Aan je bestanden niets. De app schrijft geen situatiebestanden en raakt
`options.cfg` niet aan. Je laadt je kaart en je bus zelf in OMSI en kiest daarna
in de app een dienst uit het rooster; de app levert alleen de instructies.

Bij "Dienst starten" wordt het spel wel aangezwengeld als het nog niet draait —
dat is puur `Omsi.exe` opstarten, zonder er iets voor klaar te zetten.

Het enige dat in de spelmap terechtkomt is de plugin voor de overlay, en dat
zijn twee bestanden in `plugins/` die je zo weer weghaalt.

Dat scheelt ook zorgen: geen sjabloon-afhankelijkheid meer, geen back-ups die
kunnen verjaren, en kaarten die je nooit eerder speelde doen gewoon mee.

## IBIS

De dienstkaart toont wat er in de IBIS moet: **Linie** en **Route**. Meer is het
niet — de bestemming hoort bij de route en verschijnt vanzelf op de film, dus die
staat er alleen ter controle bij.

De routes komen uit de `[infosystem_trip]`-blokken van het wagenpark-bestand
(`.hof`) dat naast het busmodel ligt: routenummer, omschrijving, bestemmingscode
en lijn. Eén bus heeft vaak een stuk of tien wagenparken, één per stad en per
tijdvak, en de codes verschillen echt — Johannesstift is in 1988 `221` en in 1994
`161`. De app kiest daarom het wagenpark dat de eindbestemmingen van de dienst
kent én op de speeldatum al gold.

Twee dingen die dat formaat oplegde:

**Sleutelwoorden tellen alleen aan het regelbegin.** De `.hof`-bestanden leggen
hun eigen blokformaat ingesprongen uit, als commentaar. Wie inspringing wegpoetst
leest die uitleg als gegevens en krijgt een route met de naam
`{routecode} (z.B. '540001', integer)`.

**De bestemming alleen is niet genoeg.** Op lijn 92 eindigen `9202` (STAD-FREU)
en `9226` (REIM-FREU) allebei op code 210. Welke van de twee klopt, blijkt uit de
haltelijst die bij elke route staat: de app kiest de route die het meest met de
rit overlapt, met het beginpunt als zwaarste weging.

Ritten zonder route — een Betriebsfahrt naar de remise bijvoorbeeld — staan als
zodanig op de kaart: die zet je met de hand op de film.

### Wat de plugin meet

De DLL wordt elk beeld aangeroepen en kan daardoor dingen uitrekenen die de app
van buitenaf niet ziet. Uit `Velocity` — km/h, want de busscripts delen hem door
3.6 voor hun natuurkunde — komt de versnelling, met de prestatieteller als klok
omdat `GetTickCount` met zijn stap van 15 ms te grof is voor een beeld van 16 ms.
Een gebeurtenis telt één keer, niet per beeld — bij zestig beelden per seconde
zou een remactie van twee tellen anders als honderdtwintig keer hard remmen in
het logboek belanden. De meting wordt gladgestreken, telt alleen boven 5 km/u,
moet een kwart seconde aanhouden en gaat pas weer open als het ruim onder de
drempel zakt. Die drempels liggen op 3,0 m/s² voor remmen en 2,0 voor optrekken:
een bus remt comfortabel op 1 à 1,5 en stevig rond 2,5, dus pas daarboven vliegen
staande passagiers naar voren.

De tellers lopen door over de sessie; de app trekt de stand bij het begin van de
dienst ervan af.

Daarmee is de stemming in de overlay afgeleid uit gemeten gedrag in plaats van
uit snelheid als ruwe maat. Een gemeten cijfer blijft het niet: OMSI geeft geen
passagiersstemming door. Wat het spel wél bijhoudt zijn chauffeursbeoordelingen
(`DG_Driver_Rating_Driving`, `_Ticket`, `_Comfort`), en die belanden pas na
afloop in `Drivers/*.odr`.

Verder komen `Envir_Brightness`, `StreetCond`, `precipRate`, de deurstanden, de
lichten en `IBIS_busstop_index` mee. Daarmee vinkt de overlay haltes af en
waarschuwt hij over rijden zonder dimlicht in het donker, rijden met een deur
open, en nat wegdek. De dienst rondt zichzelf af zodra de eindtijd voorbij is en
de bus stilstaat.

**Niet elke bus geeft alles door.** `lights_abbl` en `IBIS_busstop_index` komen
uit de scripts van het busmodel en ontbreken op modellen die ze niet kennen. De
plugin houdt daarom in een bitmasker (`seen`) bij welke variabelen OMSI werkelijk
heeft aangeroepen. Een bus die zijn lichten niet aanbiedt rijdt niet "met het
licht uit" — we weten het niet, en dan hoort er geen waarschuwing bij.

### De overlay indelen

De overlay bestaat uit twee elementen die los van elkaar staan: het dienstpaneel
met de gegevens en de navigatie met de kaart. Allebei kun je ze verslepen en
verschalen; de indeling staat in `overlay.json` naast de profielen en hoort bij
het scherm, niet bij een chauffeur.

Het dienstpaneel kent drie standen. **Beknopt** is een enkele regel met de klok,
de lijn, de volgende halte en de bezetting. **Normaal** zet daar de bestemming,
de aankomsttijd en de meters onder. **Uitgebreid** toont bovendien de haltes als
lijndiagram en de tellers van je rijstijl. Uitklappen zet hem een stand verder
en daarna weer terug naar beknopt; waarschuwingen blijven in elke stand staan,
want die moet je niet kunnen wegklappen.

Uitklappen kan met de knop rechtsboven in het paneel of met **Ctrl+Alt+V**.
Beide bestaan omdat de overlay muisklikken normaal gesproken doorlaat naar het
spel: een venster dat klikken opvangt, vangt ze overal op en pakt ook de
aandacht af van OMSI, en dan reageert je stuur niet meer. Daarom laat het
venster alleen de muisbewegingen doorgeven en vraagt het de muis pas op zodra
die boven die ene knop hangt. Werkt dat in jouw opstelling niet, dan doet de
sneltoets hetzelfde.

Verslepen gaat via de bewerkstand, met de knop in de app of met **Ctrl+Alt+O**.
Daarin zweeft de titelbalk bóven het element in plaats van erin: zo is het
tijdens het schuiven precies even groot als daarna en springt de inhoud niet weg
zodra je op Klaar drukt.

De kaart rijdt mee. Zodra de IBIS doorgeeft bij welke halte je bent, zoomt hij
in op het stuk weg tussen de vorige en de volgende halte — ingezoomd genoeg om
de straat te volgen. Een eigen positie geeft OMSI niet door; de plugin-API kent
er geen variabele voor, en ook Omni Navigation komt niet verder. Het weggedeelte
tussen twee haltes is wel precies waar je op zit.

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
