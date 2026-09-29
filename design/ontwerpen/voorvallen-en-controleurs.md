# Definitief plan: wat Busbetrieb-Simulator doet, en hoe OMSI Enhancer het gratis en beter doet

## 0. Basis, bronnen en afkortingen

**Wat ik gedaan heb.** Ik heb alleen gelezen. In de worktree, in OMSI en in Lucs gegevens is niets gebouwd of veranderd. Om de cloudtak te kunnen lezen heb ik één keer `git fetch` van `origin/claude/awesome-wozniak-f2svst` gedaan. Dat verandert alleen de verwijzing naar de remote en raakt geen bestanden.

**Waar dit plan op steunt:**
- het BBS-onderzoek van 29-09-2026;
- de inventaris van onze app (tak `claude/busbedrijf-samen`, HEAD e0fa2b0, versie 0.5.0);
- het OMSI-onderzoek;
- het eerste plan en de tegenlezing daarvan.

**Wat ik deze ronde zelf heb nagekeken**

Onze app:
- `src/core/rittenstaat.ts:160-170, 205-232, 300-315`: er is alleen een vertrek, de norm is 30/180 s, en de eindhalte krijgt geen oordeel.
- `src/shared/status.ts:12-14`: `ON_TIME_S = 60`.
- `src/core/exam.ts:35-39`: 3 minuten.
- `plugin/OMSICareer.opl:44-52`: alleen deur 0. `:57-58`: knipperlichten. `:32`: `Weather_Temperature`.
- `plugin/omsicareer.c:8-16, 2272-2318`: de vlag `write` wordt niet gebruikt.
- `src/core/live.ts:107-146, 969, 1212-1250`.
- `src/core/onderweg.ts:116-120, 182-192`.
- `src/core/bedrijf.ts:65, 95-101, 150, 260-281, 393-412`. In de cloudtak is `Rol` nog `'chauffeur' | 'monteur'`.
- `src/core/bustoetsen.ts:14-50`, `busprofiel.ts:1-30`, `busklaar.ts:1-20`, `beginplek.ts:118-127`, `bedrijfsklok.ts:3-21`, `roads.ts:1-15`.
- `src/shared/weather.ts:15-17, 23-75`.
- `src/main/index.ts:1568-1598, 2098-2106, 6858-6870`.
- `HANDOVER.md:2076-2086, 2236-2240, 2266-2273`.
- `design/ontwerpen/busbedrijf-planning.md:20-24`.
- memory `openomsi-keuzes.md`.

OMSI (`C:/Program Files (x86)/Steam/steamapps/common/OMSI 2`):
- `Program/varlist_roadvehicle.txt:124` (`Cabinair_Temp`) en `Program/varlist_system.txt:18` (`Weather_Temperature`);
- `Program/varlist_human.txt` (4 namen);
- `Inputs/keyboard.cfg:262` (`blinker_warn_toggle`) en `:597` (`cp_schalter_kinderwagen`);
- `TicketPacks/Berlin_1/Berlin_1.otp:33-37`;
- `Weather/*.owt` (9 stuks, waaronder "Starker Schneefall", "Ueberfrierende Naesse" en "Eiseskälte") en `Weather/ICAO.txt` (103 regels);
- `Vehicles/MB_O530/Script/door.osc:119`;
- in `Omsi.exe` staan `SeatNrBus`, `Target_Station`, `AIModeEx` en `MeckerFahrstil`, maar niet `Fahrt_Mecker`.

Telling op de exacte naam in `Vehicles/*/Script/*varlist*`:

| Naam | Busmappen |
|---|---|
| `kneeling` | 16 |
| `rampe_aktiv` | 16 |
| `door_handrampe` | 17 |
| `door_kinderwagen` | 10 |
| `klima_an` | 9 |
| `lights_sw_warnblinker` | 37 |
| `haltewunsch` | 37 |
| `bremse_halte` | 38 |
| `engine_temperature` | 37 |

De dump van Lucs bus staat in `C:/Users/lucru/AppData/Local/OMSI Career/getallen.json` (de o530 U e2, 2136 getallen). Daarin:
- `PAX_Entry0..7_Open/_Req` en `PAX_Exit0..7_Open/_Req` staan op index 84–115;
- `Cabinair_Temp` = 21,2, `Dirt_Norm`, `wearlifespan` = 1.500.000 en `engine_temperature` = 87,6;
- knielen heet hier `cp_kneeling` en `bremse_kneeling`;
- de oprijplaat heet `ramp` en `cp_rampa_open`;
- het stopverzoek heet `haltewunsch_1..4`, de kinderwagenknop `door_kinderwagenwunsch`;
- `kneeling`, `rampe_aktiv`, `door_handrampe`, `door_kinderwagen` en `haltewunsch` staan er niet in.

BBS, in het kladwerk `…/scratchpad/bbs/`:
- `articles.txt:215-218, 443-446, 1175, 1213, 1242, 1246, 1256`;
- forumdraden 7544, 6853, 6845, 7376 en 10494 (de titels nagekeken);
- de structuur van het OMSI-geheugen: `omsistructs.cs:913-979, 1435-1474`. Die komt uit OmsiHook en dient alleen als bron over het geheugen. Er wordt geen code uit overgenomen.

**Afkortingen voor bronnen**
- A&lt;nr&gt; = https://community.pedepe.de/index.php?article/&lt;nr&gt;/ (als tekst in het kladwerk `articles.txt`).
- T&lt;nr&gt; = https://community.pedepe.de/index.php?thread/&lt;nr&gt;/
- W-&lt;code&gt; = https://busbetrieb-simulator.de/details.php?seite=&lt;code&gt;
- HB p.&lt;n&gt; = het handboek, https://busbetrieb-simulator.de/Manual_OMSI2_Busbetrieb_Simulator_de_web.pdf (kladwerk `bbs_manual.txt`).
- STEAM = https://store.steampowered.com/app/636630/
- STREV = de Steam-recensies op die pagina.
- F2P = de aankondiging van de gratis versie (zie T10566).
- Paden zonder map staan onder `src/`. #nn is een nummer in `design/ontwerpen/openomsi-voorstellen.md`.

**Nummers in dit plan:** V1–V32 zijn voorvallen, U1–U22 uitdagingen, B1–B36 bouwpunten en D1–D3 beslissingen voor Luc.

**Wat er kan (kolom "Kan")**
- **NU**: alleen werk in de app, met wat nu al binnenkomt.
- **SYS**: een systeemgetal van OMSI toevoegen aan `getallen.txt`. Elke bus heeft het: `PAX_Entry/Exit0..7_Open/_Req`, `Cabinair_Temp`, `Dirt_Norm`, `Velocity_Ground` en `Axle_Suspension_*`.
- **PROF**: een scriptgetal dat per busmodel anders heet. Het loopt via het voorvalprofiel (B4). Heeft een bus die naam niet, dan valt die stap weg.
- **START**: kan alleen vóór de start van OMSI (situatie, `[vars]`, weer).
- **LEES**: plugin 15, die alleen leest uit het geheugen.
- **SCHRIJF**: de plugin drukt een busknop in of schrijft een getal. Eerst een proef, en pas na beslissing D2.
- **NIET**: kan niet.

Waarde: H/M/L (hoog, middel, laag). Moeite: S/M/L (klein, middel, groot).

---

## 1. Busbetrieb-Simulator in vijf zinnen

1. **Wat het is.** BBS van PeDePe maakt van losse ritten in OMSI 2 een loopbaan en een busbedrijf. Het is een Windows-programma naast OMSI, met internet verplicht.
   - Sinds versie 4.4.4.1 (16-09-2026) meld je automatisch aan via Steam, zonder registratie (A489; `articles.txt:1213`).
   - De basisprijs is €24,95; op Steam wisselt die met de uitverkoop.
   - Vanaf 01-10-2026 is BBS gratis, maar veel zit achter premium. Premium kostte €4,99 per maand of €49,99 per jaar volgens T6537 uit 2022; die prijzen zijn niet opnieuw nagekeken (STEAM; F2P; T6537).
2. **Economie en spelmodi.** Het sterkst is de economie rond echte spelers: solliciteren, planners, concessies, bonusritten en ranglijsten (HB p.20–38; W-m4). In singleplayer kun je sinds juli 2026 een eigen bedrijf voeren. De oude carrière kan terug via "Alten Karrieremodus wiederherstellen", maar krijgt niets nieuws meer (A479; `articles.txt:1175`).
3. **Wagenpark.** Nieuw of tweedehands kopen, afbetalen en huren, onderhoud, APK, en reparatie met cursussen en minispellen. Een eigen schademodel laat onderdelen in OMSI echt uitvallen (W-k2; W-m3; W-f2; A463).
4. **Tijdens de rit.**
   - Een HUD, een minimap, flitsers en een beoordeling die het loon bepaalt.
   - Sinds 4.6.0.4 (23-09-2026) herkent BBS rode lichten en het verlaten van de rijbaan, in de categorie "Sicheres Fahren" (A497; `articles.txt:1246`; A499).
   - Met premium komen daar korte scenario's en kaartcontroleurs bij (W-f1; W-f6; W-f4; T7544; T6845).
5. **De zwakke plekken:**
   - een betaalmuur;
   - scenario's die zeldzaam, eentonig en kort zijn (ongeveer 1 minuut, hulp binnen seconden);
   - controleurs die alleen een eigenaar met premium kan aannemen, met de hand, met 15 minuten tussen twee controles;
   - verplicht internet.

   Bronnen: STREV; T6872; T6814; T7544; T7472; T6845; T7376; T10494.

---

## 2. Vergelijking per gebied

| Gebied | Busbetrieb-Simulator | Wij nu | Wij straks: beter en gratis |
|---|---|---|---|
| Prijs en internet | Internet verplicht; aanmelden via Steam. Premium en goud (T10494; T6537; A489) | Offline, geen account, alles gratis | Blijft zo. Er komt nooit iets achter een betaalmuur |
| Spelmodi | Vrij spel, singleplayer-bedrijf, oude carrière terug te zetten, multiplayer, lokale bedrijven (W-fs; A479) | Loopbaan, vrij rijden, busbedrijf voor één speler | Dezelfde drie. Een modus gooit nooit voortgang weg (T10497) |
| Rangen | Kosten geld, ervaringspunten en vergunningen; tot 200, of 500 met premium (HB p.21; A439) | 5 rangen op gereden uren, plus lijnexamens (`core/career.ts:446-475`; `core/exam.ts`) | Rijcijfer (B21) en badges erbij. Geen betaalde rangen |
| Examen | Betaald (W-k5) | Geeft een lijnvergunning | Blijft zonder voorvallen (`onderweg.ts:182-183`) |
| Dienst starten | BBS drukt zelf op Start (A497). OMSI start 12 s tegen 48–51 s bij ongeveer 340 voertuigmappen (`articles.txt:1242`) | De app zet kaart, bus, tijd en weer klaar (`core/situation.ts`, `core/weather.ts`) | Dienstopdracht met de kans op voorvallen en de keuze van uitdagingen. Sneller starten onderzoeken (B32) |
| Overlay | Instelbare HUD (W-f1) | Dienstpaneel, telefoon, tablet of echte telefoon | Een regel per voorval met afteller. Sneltoetsen alleen zolang er een vraag openstaat |
| Navigatie | Minimap; na 01-10 niet meer gratis (T10566) | Eigen navigatie | Voorvallen op de kaart. Flitspalen aan of uit (T9188) |
| Beoordeling | Stiptheid, kilometers, haltes, comfort, kaartverkoop, "veilig rijden" (T7648; A497) | Rittenstaat: voorlopig, alleen vertrek, norm 30/180 s (`rittenstaat.ts:166, 210`) | Aankomst en vertrek zoals OMSI (120/180 s) met verschoning. Rijcijfer met rood licht en rijbaan (B21) |
| Flitsers | Vast en mobiel, 3 km/u marge (W-f6) | 15 % van de echte borden, €20 plus €6 per km/u (`onderweg.ts:56-96`) | Mobiele flitser per dag (V20), boete per land, aan of uit op de navigatie |
| Schade | Eigen schademodel; onderdelen vallen uit (W-f2) | Aanrijdingen tellen; schade in het bedrijf | Storing zien (V22). Echt veroorzaken alleen na D2. Defect melden tijdens en na de rit (B22) |
| **Scenario's** | Premium. 0–1 per rit, ongeveer 1 min, geen gevolg (T7544; T6853; T6872) | Eén dienstopdracht per dienst (`onderweg.ts:182-196`) | 30 voorvallen met echte handelingen in OMSI, instelbaar, met verschoning, en te oefenen in vrij rijden |
| **Doelen** | Opdrachten, bonusmissie, events; in singleplayer met premium (W-k4; A413; A371) | Alleen records (`renderer/src/Profiel.tsx`) | Uitdagingen per dienst, weekdoelen die niet verlopen, badges, events. Gratis |
| **Controleurs** | Premium voor eigenaar én chauffeur, €1.000 per week, met de hand, 15 min wachten, niet bij AI (T7472; T6937; T6845; T7376; T10494) | Alleen de meerijder van de opdrachtgever (`onderweg.ts:182-296`) | Gratis. In de loopbaan als gebeurtenis; in het bedrijf in dienst, met de hand of automatisch, ook bij AI, met de kosten in beeld |
| Kaartverkoop | Telt mee (A1) | Uit het geheugen van OMSI; telt alleen met de overlay open | Tellen zonder overlay (B6). Onafgemaakte verkoop telt mee bij zwartrijders |
| Concessies | Per kaart (HB p.32–33) | Per lijn, bruto (vaste vergoeding per uur, `bedrijf.ts:399`) | Plus een controlequote als eis (D1) |
| Personeel | Echte spelers; AI hoogstens 10, met premium (A475) | AI-chauffeurs en -monteurs | Controleurs erbij, zoveel als je wilt |
| Wagenpark | Huur en privébus met premium (A405; A425) | Nieuw, tweedehands, onderhoud, Bus3D | Lease, huur en lening (deel F), APK, statistiek |
| Brandstof | Verbruik en tankrekening (HB p.40) | Vast uurbedrag (`bedrijf.ts:405-410`) | Eigen rit gemeten via `tankPercent` (B26) |
| Depot | 3D-terrein om te lopen (W-m1) | Vlootkaart (cloud) | Bewust geen verplicht lopen |
| Weer | Echt weer (A473), of zelf kiezen | 5 keuzes: clear, summer, cloudy, rain, fog (`shared/weather.ts:15-17`) | OMSI's sneeuw, ijzel en vorst (B16), echt weer via OMSI's eigen METAR (B17) |
| Telefoon-app | Deuren, IBIS, kassa, chat (A1; A493) | IBIS, kaartjes, dienst, rit, postvak | Knoppen voor voorvallen, "Controleurs roepen", "Defect melden" |
| Talen | 12 (STEAM) | 4: en, de, fr, nl (`shared/i18n.ts:21-26`) | Blijft zo |

---

## 3. Scenario's en uitdagingen tijdens de rit

### 3.1 Drie lagen

1. **Dienstopdracht.** Bestaat al (`core/onderweg.ts:182-196`) en blijft zoals hij is.
2. **Voorvallen.** Nieuw: iets dat midden in de rit gebeurt, met een opdracht, een tijdvenster en een meting. Dit is de wens van de gebruiker.
3. **Uitdagingen en doelen.** Nieuw: die kies je zelf, per dienst, per week of blijvend.

### 3.2 Het fundament, vóór alle voorvallen (uit de tegenlezing, punten 1, 4, 5 en 6)

**Ronde 0: meten.** Luc rijdt één dienst uit het menu met het spoor aan. Het spoor bestaat al: `%APPDATA%\omsi-enhancer\ritten\…jsonl` (`HANDOVER.md:2076-2079`). Dat gebeurt op drie bussen: de C2, de o530 U e2 en de MAN NL. Per bus maakt hij een getallen-dump. Daaruit leggen we vast:
- wanneer `nextIndex`/`nextStop` verspringt: bij aankomst, deur dicht of wegrijden. Dat is nu "voorlopig" (`HANDOVER.md:2080-2084`);
- hoe `nextDist` bij een halte verloopt;
- welke `PAX_EntryN`/`PAX_ExitN` bij welke deur hoort;
- of een reiziger die te laat komt echt op de deurknop drukt: `PAX_Entry*_Req` bij dichte deuren;
- de namen voor alarmlichten, knielen, oprijplaat en stopverzoek.

**`aanHalte()`.** Eén pure functie die zegt "de bus staat nu stil bij halte X". Ze kijkt naar de snelheid, naar `nextDist` onder een drempel uit ronde 0, of naar het moment net na de sprong. Er komt een proef met het echte spoor bij. Alle halte-voorvallen gebruiken deze functie. Nu kent de meetlus alleen `halteOpNaam`, bij een dienstregeling uit het menu (`main/index.ts:2101-2104`).

**Aankomst in de rittenstaat.** Er komt een nieuwe spoorregel `'aankomst'`:
- de eerste keer stilstaan binnen de drempel vóór de sprong;
- als de bus doorreed: de sprong zelf.

Daarna oordeelt de rittenstaat zo:
- **te laat:** de aankomst min de verschoning is meer dan 180 s na de dienstregeling;
- **te vroeg:** het vertrek is meer dan 120 s vóór de dienstregeling;
- **de eindhalte:** krijgt voortaan ook een oordeel, op de aankomst.

Zo wordt de keuze van Luc echt uitgevoerd. Later (LEES) vergelijken we dit met OMSI's eigen `ata`, `atd`, `arr_ok` en `dep_ok` (`omsistructs.cs:1435-1465`).

**Alle deuren.** Alle `PAX_Entry0..7_Open/_Req` en `PAX_Exit0..7_Open/_Req` gaan in `getallen.txt`. Dat zijn 32 van de 512 plaatsen (`live.ts:969`). Het zijn systeemgetallen, dus elke bus heeft ze. Nu leest de app alleen deur 0 (`OMSICareer.opl:46-50`, `live.ts:1244-1246`). In Lucs dump staat deur 0 dicht terwijl 1 tot en met 3 open staan. Welke deur voor zit en welke in het midden, komt uit de posities in `passengercabin.cfg`.

**Voorvalprofiel per busmodel,** in `core/busklaar.ts`. Dat leest een bus al van schijf, zonder plugin.
- Het zoekt in de varlists en in de `[mouseevent]`s van `model.cfg` met patronen: `kneel`, `ramp`/`rampa`, `kinderwagen`, `haltewunsch`, `warnblink`, `failure_general`, `bremse_halte` en `klima`.
- Alleen de namen van de bus die rijdt, gaan in `getallen.txt`.
- De betekenis wordt per naam vastgelegd. In `HH_Stadtbus2017/Script/17_bremse.osc:109,125,147` is `kneeling` bijvoorbeeld een stand 0/1/2, dus "≠ 0" betekent geknield.
- De C2, de o530 U e2 en de MAN NL controleren we met de hand in ronde 0. De andere bussen gaan automatisch. Een onbekende stap valt weg en telt niet.
- **Knielen op elke bus:** onderzoek of `Axle_Suspension_*` (systeemgetal, in de dump −0,10) duidelijk zakt bij knielen.
- **De echte toets tonen:**
  - Voor de alarmlichten bestaat een toets (`blinker_warn_toggle`, `keyboard.cfg:262`), net als voor de kinderwagen (`:597`).
  - Knielen heeft standaard geen toets. `bustoetsen.ts` kan een knop uit het model wel aan een toets hangen (`:14-38`). Dat kent nu alleen AFR, LAWO en IBIS (`:44-50`); er komt een soort `'cabine'` bij. Zonder toets zegt de kaart "knielen (schakelaar in de cabine)".

### 3.3 Wanneer komt een voorval

Er zijn drie soorten:
- **Gepland:** vastgelegd bij het aannemen van de dienst, uit hetzelfde zaad als de gebeurtenis (profiel + aannametijd + dienst). Na een herstart gebeurt dus hetzelfde.
- **Reactief:** het gevolg van iets wat jij doet of meemaakt, zoals een aanrijding, hard remmen, een storing, vertraging of een deurknop.
- **Bij de start:** komt uit het weer, de datum of de situatie.

Hoe vaak is een instelling (BBS-klacht T6872: te zeldzaam en niet te sturen):

| Stand | Gemiddeld | Hoogstens per dienst |
|---|---|---|
| Uit | geen | – |
| Rustig | ongeveer 1 per 90 min | 1 |
| Normaal (standaard) | ongeveer 1 per 40 min | 3 |
| Druk | ongeveer 1 per 20 min | 6 |

Per categorie aan of uit te zetten: reizigers, verkeer, techniek, weer en dienst. Reactieve voorvallen over veiligheid (V21, V22) tellen niet mee voor het maximum.

**Nooit:**
- bij een examen;
- in de eerste 5 minuten;
- in de laatste 2 haltes, behalve voorvallen voor het eindpunt;
- tijdens de pauze;
- binnen 8 minuten na het vorige voorval;
- twee tegelijk.

Op een OMSI-versie waarvan de plugin het geheugen niet leest (niet 2.3.004), komen alleen voorvallen met snelheid, deuren en licht.

### 3.4 Hoe de speler het ziet

- **Melding bovenin de telefoon**, 8 s, zoals de flitsmelding (`renderer/src/telefoonOnderweg.tsx:18-37`).
- **Voorvalkaart bovenaan de rit-app,** op de plek van de gebeurteniskaart (`telefoonOnderweg.tsx:40-100`). Daarop staan:
  - titel, één zin en een afteller;
  - een afvinklijst die live meetelt, met alleen de stappen die deze bus kan meten;
  - knoppen: [112] [Politie] [Melden] [Ja] [Nee];
  - de echte toets van de speler, als die er is (`core/omsiKeys.ts`).
- **Overlay:** één regel, bijvoorbeeld "Rolstoel · Rathaus · nog 2 haltes · 1:40".
- **Navigatie:** een pictogram op de halte, een gevarendriehoek, een gestreepte zone en de afstand ernaartoe.
- **Sneltoetsen zonder muis:**
  - Ze worden alleen geregistreerd zolang een voorval een antwoord vraagt, en daarna direct weer vrijgegeven.
  - Standaard Ctrl+Alt+F1, F2 en F3, in te stellen.
  - Niet Ctrl+Alt+1/2/3: op Windows is AltGr hetzelfde als Ctrl+Alt, en AltGr+2/3 geeft ²/³ (Duits), ~/# (Frans) of @/# (Belgisch en Zwitsers).
  - Bij het registreren controleren tegen de `keyboard.cfg` van de speler.
  - Dat volgt het patroon van Ctrl+Alt+O en Ctrl+Alt+V (`main/index.ts:6858-6870`).
- **Geluid, als je wilt,** standaard uit: een gong en een korte zin via spraaksynthese. Alleen talen waarvoor een stem in Windows staat; anders gong en tekst. Er komen geen stemmen van BBS of OMSI mee.
- **Na de dienst:**
  - een regel per voorval in het logboek (`renderer/src/Onderweg.tsx`);
  - in de rittenstaat bij de halte, bijvoorbeeld "+4:10, waarvan 3:30 verschoond: reiziger onwel" (`renderer/src/Rittenstaat.tsx`);
  - een tel in de staat van dienst.

### 3.5 Duur en stiptheid: twee soorten verschoning

BBS houdt scenario's kort (ongeveer 1 minuut), zodat de stiptheid niet lijdt. Spelers willen realistisch wachten zonder straf (T7544; T6853). Wij verschonen de tijd die het voorval kost, met een plafond per soort:

- **Stilstaan** (V1–V6, V13, V21, V22): de verschoning is de gemeten stilstand binnen het venster, hoogstens het plafond. Wie niet stilstaat, krijgt niets.
- **Langzaam rijden** (V14, V15, V16, V29, V30): de verschoning is de verloren tijd, hoogstens het plafond.
  - Verloren tijd = de afstand in de zone × (1/v_eis − 1/v_ref).
  - v_ref is de limiet van dat stuk, uit de borden die de flitscontrole al kent. Zonder bord: 50 km/u.
  - Er wordt gerekend met de eis en niet met je werkelijke snelheid. Nog langzamer rijden levert dus niets extra op.

Zo werkt de verschoning verder:
- Het oordeel volgt 3.2: te laat is de aankomst min de verschoning boven 180 s. Te vroeg blijft het ruwe vertrek, meer dan 120 s te vroeg. Verschoning maakt nooit iemand "op tijd" die te vroeg vertrok.
- De verschoning geldt voor de rest van de rit. Aan het eindpunt gaat mee: max(0, min(verschoning, de vertrekvertraging bij het eerste vertrek van de volgende rit)).
- Timers lopen op de klok van OMSI (`Meting.klok`, `rittenstaat.ts:48-50`). Pauzeer je OMSI, dan staat het voorval ook stil.
- Eerlijk melden: OMSI's eigen vertraging, OMSI's dossier en OMSI's reizigers zien de wachttijd wel. Ons oordeel, het loon en het bedrijf zien hem niet.

### 3.6 Beloning en straf

Een voorstel. Alle getallen staan als constanten in `REGELS`/`GEBEURTENIS` van `core/onderweg.ts`.

| Uitkomst | Loopbaan (loon) | Busbedrijf (kas, reputatie, XP) |
|---|---|---|
| Klein voorval goed | +€5 | +€5, XP +2 |
| Middel goed | +€10 | +€10, XP +5 |
| Groot goed (onwel, aanrijding, storing) | +€15 tot +€20 | +€20, reputatie +1, XP +10 |
| Gedeeltelijk | Naar het deel van de gemeten stappen dat gehaald is | Idem |
| Niet gereageerd, of verzoek geweigerd | €0 | €0 |
| Veiligheidsfout (doorgereden na een aanrijding, rijden met open deur bij een rolstoel) | −€15 tot −€50, plus een aantekening | Idem, plus reputatie −1 of −2 |

Wat niet gemeten is, telt niet, voor noch tegen de chauffeur (`onderweg.ts:235-238`).

### 3.7 Kiezen of overkomen

- **Voorvallen overkomen je.** Je kunt hele categorieën uitzetten, niet één voorval weigeren.
- **Verzoeken kun je weigeren** (aansluiting, eregast, extra rit). Nee kost niets.
- **Uitdagingen kies je zelf:** tot 3 bij de dienstopdracht (`renderer/src/telefoon.tsx:885-932`), en weekdoelen in een Doelen-scherm.
- **Oefenen:** in vrij rijden kies je een voorval en speel je het direct (3.13).

### 3.8 Moeilijkheid

- **Rustig, Normaal of Pittig.**
  - Vensters ×1,5, ×1 of ×0,75.
  - Aankondiging 2 haltes, 1 halte, of geen. **Geen aankondiging alleen bij voorvallen met een echt signaal in de bus** (V6, V21, V22).
  - Bij Rustig zijn knielen en de oprijplaat optioneel.
- **Groeit met de rang:** een leerling krijgt eerst alleen de basisvoorvallen, met uitleg.
- **Past bij de bus:** een stap die het profiel niet kan meten, valt weg.

### 3.9 Niet storend (harde regels)

- Nooit de focus van OMSI stelen, nooit een venster dat blokkeert.
- Eén voorval tegelijk, teksten van hoogstens 2 regels.
- Knop "Stil voor deze dienst".
- Geluid standaard uit.
- Deterministisch: geen verrassing na een herstart.

### 3.10 Echte signalen in OMSI (proef, en beslissing D2)

- **Wat al kan:**
  - De plugin kan OMSI een toets laten indrukken (`lees_opdracht`; `bustoetsen.ts:19`).
  - De koppeling heeft ook een `write`-vlag per getal, die onze plugin nu negeert (`omsicareer.c:2272-2318`).
  - `Omsi.exe` bevat `[triggers]` en `AccessTrigger`.
- **De proef:** één trigger en één geschreven getal, op één bus.
- **Mogelijke inzet:**
  - het kinderwagenlampje via `{trigger:door_kinderwagenwunsch}` (`MB_O530/Script/door.osc:119`);
  - een echte storing via `engine_failure_general`;
  - een echte kapotte lamp.
- **Wat hiervoor niet nodig is:** de laatkomer (V6) leest alleen `PAX_Entry*_Req` (SYS).
- **Het risico:** een busscript kan een waarde elke frame terugzetten, of iets doen wat niet terug te draaien is. Daarom per bus uitproberen en alleen na D2.

### 3.11 Techniek in het kort (nog geen code)

- **Types in `core/onderweg.ts`:**
  - `VoorvalSoort`;
  - `Voorval` met soort, start, stappen, `vensterS`, `verschoonMaxS`, `verschoonWijze` (`'stilstand' | 'verloren'`) en plek, zone of halte;
  - `VoorvalUitslag` met per stap true, false of niet gemeten, plus `verschoondS`, bedrag en reputatie.
- **`voorvallenVoor(duty, zaad, instelling, profiel)`** is puur. Het profiel komt uit B4.
- **`volgVoorval(stand, meting)`** is puur en loopt elke seconde in de meetlus (`main/index.ts:2089-2150`). Hij schrijft spoorregels `{ t: 'voorval', … }`, zoals `t: 'flits'`, zodat een voorval na een herstart verder loopt.
- **Rittenstaat:** de regel `'aankomst'` en per halte `verschoondS`.
- **Beeld:** `OnderwegBeeld` (`onderweg.ts:322-333`) krijgt `voorval?`.
- **Afrekening:** `Onderweg` krijgt `voorvallen: VoorvalUitslag[]`. **Dit is het contract met de cloud** (B7).
- **Teksten** in een eigen bestand `src/shared/tekst/onderweg.ts`.
- **Proeven:** `scripts/probe-aanhalte.ts` en `scripts/probe-voorval.ts`.

### 3.12 Catalogus van voorvallen

Soort: **V** = voorval dat je overkomt, **Z** = verzoek dat je kunt weigeren, **R** = reactief, **S** = bij de start. "Rd" is de bouwronde uit §5.

| # | Voorval | Soort | Wat je moet doen | Meting | Venster / verschoning | Kan | Rd |
|---|---|---|---|---|---|---|---|
| **Reizigers** | | | | | | | |
| V1 | Rolstoel bij halte X | V | Stoppen bij X, deur open, ≥ 30 s stil. Knielen en de oprijplaat als de bus ze heeft. Pas weg als alles dicht is | `aanHalte`, `velocity`, alle deuren, profiel (kneel, ramp) | 2 haltes vooraf / stilstand ≤ 90 s | SYS (basis), PROF (knielen, plaat), SCHRIJF (lampje) | 2 / 5 |
| V2 | Kinderwagen bij halte X | V | Middendeur open, knielen als de bus dat kan, wachten | Middendeur (`PAX_EntryN`, N ≠ voor), profiel | 1 halte / ≤ 45 s | SYS, PROF, SCHRIJF (lampje) | 2 / 5 |
| V3 | Reiziger onwel (idee uit BBS, eigen uitwerking) | V | Binnen 60 s stil, alarmlichten, een deur open, "112", 3–6 min wachten, dan verder | `velocity`, beide knipperlichten binnen 2 s (`OMSICareer.opl:57-58`) of profiel `warnblink`, deuren, de tik | 60 s / ≤ wachttijd + 60 s | NU + SYS | 2 |
| V4 | Ruzie aan boord | V | Volgende halte stoppen, deuren open, "Politie", 2–4 min, niet rijden met open deur | `aanHalte`, deuren, de tik | Tot de volgende halte / ≤ 4 min | SYS | 2 |
| V5 | Reiziger gevallen | R (hard remmen met reizigers, met kans) | Volgende halte ≥ 60 s stil, alarmlichten, "Melden" | `harshBrakes` (verschil), `passengers`, knipperlichten | Tot de volgende halte / ≤ 2 min | NU (echt staan: LEES `SeatNrBus`) | 2 |
| V6 | Laatkomer | R (`PAX_Entry*_Req` binnen 20 s nadat alle deuren dicht gingen, bus < 10 km/u) | Deur weer open, wachten tot hij binnen is. Doorrijden kost niets | `PAX_EntryN_Req/_Open`, `passengers` +1 | 15 s / ≤ 45 s | SYS (ronde 0 bevestigt het signaal) | 2 |
| V7 | Eregast van X naar Y | Z | Geen ruk, niet met open deur rijden, niet flitsen, hoogstens 60 s vertraging erbij | **Dezelfde meetfunctie als de comfortcontrole**, maar over een stuk van de rit | X tot Y / – | NU + SYS | 2 |
| V8 | *Vervallen* (bezetting doorgeven: triviaal met de overlay, frustrerend zonder; T7812) | | | | | | |
| V9 | Alleen voorin instappen na 20:00 | S | Achterdeuren alleen open bij een uitstapwens | `PAX_EntryN_Open` (N ≠ voor), `PAX_ExitN_Req`, klok | Rest van de dienst / – | SYS | 3 |
| V10 | Kaartcontrole aan boord | V | Zie §4 | §4 | §4 | NU | 3 |
| V11 | Uitstappers aangekondigd | Z | Elke uitstapwens bedienen | `Target_Station` per reiziger | Rit / – | LEES | 6 |
| V12 | Volle halte | V | Allemaal mee. De timer staat stil tijdens een verkoop | `AIModeEx = WaitingForBus` | 1 halte / ≤ 60 s | LEES | 6 |
| **Verkeer en route** | | | | | | | |
| V13 | Aansluiting vasthouden | Z | Wachten tot de getoonde tijd, daarna netjes inlopen | `aanHalte`, klok, flitsen, ruk | Tot die tijd / stilstand = de wachttijd | NU | 2 |
| V14 | Gevaar op de weg (idee "olie", eigen uitwerking) | V | "Melden" (**geen quiz**: elke dienst is goed; T7812) **en** binnen 100 m van de plek ≤ 20 km/u | Positie, `velocity`, de tik | Tot na de plek / verloren tijd, ≤ 30 s | NU | 2 |
| V15 | Tijdelijke 30-zone | V | ≤ 30 km/u; zone op de navigatie, soms een mobiele flitser erbij | Positie, `velocity` | Zone / verloren tijd | NU | 2 |
| V16 | Schoolzone | S (**werkdagen**, 07:15–08:15 en 13:00–14:00, datum uit OMSI) | ≤ 30 km/u binnen 200 m van haltes met Schule/School/Gymnasium in de naam | Positie, `core/haltes.ts`, klok, datum | Zone / verloren tijd | NU | 2 |
| V17 | Vertraging inlopen | R ((`mem.delay` − verschoning) > 5 min, **niet in een rit met verschoning**) | Binnen N haltes onder 3 min, zonder te flitsen of hard te remmen | `mem.delay`, verschoning, flitsen, ruk | N haltes / – | NU (na de aankomstmeting) | 2 (eind) |
| V18 | Van de route af | R (> 150 m van de eigen route) | Binnen 2 km terug, zonder een halte over te slaan | Afstand tot de route | 2 km / – | NU, **pas na B29** (anders vals bij omleidingen via een chrono) | 7 |
| V19 | Omleiding (werkzaamheden, demonstratie) | S (chrono) | Omleiding volgen, vervangende haltes bedienen | Datum, positie, `nextIndex` | Dienst / – | START + NU, na B29 | 7 |
| V20 | Mobiele flitser van de dag | V | Waarschuwing via de Centrale | **Dezelfde flitscode** (`onderweg.ts:116-144`), met een extra paal per kalenderdag | – | NU | 2 |
| **Bus en techniek** | | | | | | | |
| V21 | Aanrijding afhandelen | R (`collisions` omhoog) | Binnen 50 m stil, alarmlichten, ≥ 60 s, "Politie", niet doorrijden | `collisions`, `velocity`, knipperlichten | 60 s / ≤ 8 min | NU (doorrijden echt via het dossier: LEES) | 2 |
| V22 | Storing (inclusief de oude V24, motor te heet) | R (`*_failure_general` = 1, of de motor valt uit terwijl de bus vlak ervoor > 5 km/u reed. **Nooit aan de eindhalte**) | Alarmlichten, stil waar het kan, "Melden", OMSI-reparatie of een andere bus. **Geen "reizigers eruit":** dat kan OMSI niet | `engineOn`, `velocity`, profiel `engine_/elec_/antrieb_failure_general` (alleen 1 als OMSI's eigen storingen aan staan) | – / ≤ reparatietijd | PROF; veroorzaken: SCHRIJF | 5 |
| V23 | Lamp kapot | R/S | Melden; aan het eindpunt een andere bus of doorrijden | Profiel: een lamp met waarde 0 en een levensduur ≤ 0. **Niet `wearlifespan`**: dat is de levensduurfactor uit de opties (`Citybus 530 by Kajosoft/Script/lights.osc:828-835`) | Tot het eindpunt / – | PROF; veroorzaken: SCHRIJF | 5 |
| V24 | *Vervallen*: opgegaan in V22 (in de dump 87,6 °C; oververhitten komt alleen met een storing) | | | | | | |
| V25 | Tank bijna leeg | S (`tank_percent` via `[vars]`) | De dienst halen, of tanken zonder meer dan 5 min vertraging | `tankPercent` | Dienst / tanktijd | START (proef B18) + NU | 5 |
| V26 | Bereik van de e-bus | S | Eindigen met ≥ 15 % accu | `battery` | Dienst / – | NU | 2 |
| V27 | Vuile bus | S (`Dirt_Norm` via `[vars]`) | Wassen vóór de eerste rit | `Dirt_Norm` | Vóór de eerste rit / – | START + SYS | 5 |
| V28 | Hittegolf | S (zomerweer, **alleen bussen met koeling in het profiel**) | Binnen 5 min: binnen ≤ buiten − 3 °C | `Cabinair_Temp` (elke bus), `Weather_Temperature` (wordt al gelezen), profiel `klima*` | 5 min / – | START + SYS + PROF | 5 |
| V29 | Winterdienst of ijzel | S (OMSI's eigen "Starker Schneefall", "Ueberfrierende Naesse", "Eiseskälte") | Niet slippen, niet hard remmen, schadevrij | `Velocity` tegenover `Velocity_Ground`, ruk, `collisions`, `StreetCond` | Dienst / verloren tijd, ≤ 5 min | START + SYS | 5 |
| V30 | Mist of nacht | S | Licht aan, 10 km/u onder de limiet | `lightsLow`, `brightness`, `velocity` | Dienst / verloren tijd | NU | 2 |
| **Dienst** | | | | | | | |
| V31 | Keertijd aan het eindpunt | V | Pauze van min(N, geplande keertijd − aankomstvertraging), en niet meer dan 120 s te vroeg weg | Aankomst en vertrek uit de rittenstaat | Eindpunt / – | NU (na de aankomstmeting) | 2 (eind) |
| V32 | Op tijd naar de remise | V | Binnen N min in de remise | Positie. De remise is een beginpunt met een remisenaam (`beginplek.ts:123-127`), dus alleen op kaarten waar zo'n punt bestaat. Later `OnDepot` | N min / – | NU / LEES | 6 |

**Ronde 2 bevat samen 17 voorvallen:** V1 (basis), V2 (basis), V3–V7, V13–V16, V20, V21, V26 en V30, en aan het eind V17 en V31.

**Bewust niet:**
- een verzonnen wegafsluiting zonder chrono;
- hulpdiensten of reizigers neerzetten;
- onweer dat onder het rijden losbarst (§6).

### 3.13 Uitdagingen, doelen en badges

**Per dienst.** Kies er tot 3. Halen levert €5 tot €15 op; missen kost niets.

| # | Uitdaging | Meting | Kan |
|---|---|---|---|
| U1 | Stiptheidsreeks: 10 tijdhaltes op rij binnen de norm | Rittenstaat met aankomst | NU (na B2) |
| U2 | Nooit meer dan 120 s te vroeg weg | Rittenstaat | NU |
| U3 | Zijdezacht | `harshBrakes`/`harshAccels` | NU |
| U4 | Schadevrij en niet geflitst | `collisions`, flitsen | NU |
| U5 | Knipperen bij elk vertrek | `blinkerLeft`, het vertrek | NU |
| U6 | Deur dicht voor je rijdt (**alle deuren**) | `PAX_*_Open`, `velocity` | SYS |
| U7 | Geen stopverzoek gemist: de halte verspringt zonder stilstand terwijl er een verzoek was | Profiel `haltewunsch*` (op de o530: `haltewunsch_1..4`) plus `PAX_ExitN_Req` | PROF + SYS |
| U8 | Niemand laten staan | `PAX_EntryN_Req`, `koper`, `ticketKlaar`, `velocity` | SYS (na B6) |
| U9 | Foutloze kassa | `telVerkoop` (`main/index.ts:2896-2935`) | NU (na B6) |
| U10 | Haltestellenbremse bij elke halte | Profiel `bremse_halte` | PROF |
| U11 | Zuinig rijden | `tankPercent` per km | NU |
| U12 | Comfort voor reizigers: binnentemperatuur binnen de band, binnenlicht in het donker, nooit meer dan 5 min te laat | `Cabinair_Temp`, profiel voor het licht, `mem.delay` | SYS + PROF. **Niet** "via de klachten van OMSI" (zie §6) |
| U13 | Licht op orde | `lightsLow`, `brightness` | NU |
| U14 | Elke keertijd gehaald | Rittenstaat met aankomst | NU (na B2) |

**Weekdoelen (U15–U22).** Drie tegelijk. Ze blijven staan tot je ze haalt of wisselt, en wisselen is één keer per dag gratis. Niets verloopt, anders dan bij BBS (A351).
- U15: 3 kaarten.
- U16: 5 diensten zonder aanrijding.
- U17: een nachtdienst.
- U18: elke busvorm (`core/busvorm.ts`).
- U19: 500 km.
- U20: alle lijnen van één kaart.
- U21: 5 voorvallen goed.
- U22: een winterdienst schadevrij.

**Vervangingsritten (B27).** "Een collega valt uit": je valt in met een bonus, en weigeren kost niets. Het idee komt uit HB p.38.

**Badges** (blijvend):
- 100 en 1.000 stipte haltes;
- eerste rolstoel;
- 10 keer "onwel" goed afgehandeld;
- 50 diensten schadevrij;
- op elke kaart gereden;
- 1.000 kaartjes verkocht;
- nachtuil;
- weerheld;
- 10 foutloze rapporten van de meerijder;
- in het bedrijf: 100 zwartrijders betrapt.

Badges staan op de personeelspas (`telefoon.tsx:328`) en op de staat van dienst. Ze geven geen procent extra loon (bij BBS +1 % per badge, A499).

### 3.14 Hoe het past in de drie modi

- **Loopbaan.** De uitslag gaat naar het loon (`CareerEntry.onderweg`, `core/career.ts:87,376`) en naar het dossier. Examens krijgen geen voorvallen.
- **Vrij rijden.** "Oefenen", zonder economie, en het telt niet voor badges.
  - Er bestaat al een meetlus zonder dienst: `volgOmloopInOmsi`/`volgStap` (`main/index.ts:1571-1596`, `core/omloopvolgen.ts`). Die heeft halte-gegevens zodra de speler in OMSI een dienstregeling kiest. De voorvallen haken daar aan (B14).
  - Zonder dienstregeling komt de halte uit de positie (`core/haltes.ts`). Voorvallen die stiptheid nodig hebben, vallen dan weg.
- **Busbedrijf.**
  - **Eigen rit** (`boekEigenDienst`, in de cloudtak): de uitslag gaat naar de kas (boekingssoort `'onderweg'`, met `gemeten: true`), naar de reputatie en naar XP (B10).
  - **AI-diensten:** voorvallen als regels in het dagrapport en het postvak (nieuwe `BerichtSoort 'voorval'`). De kans op goed afhandelen stijgt met de ervaring van de chauffeur.
  - **Niet dubbel:** pech en te laat komen zitten al in deel B (`core/uitval.ts`; de berichtsoorten `'pech'` en `'telaat'` bestaan, `bedrijf.ts:275-276`).

---

## 4. Controleurs

### 4.1 Twee soorten, duidelijk uit elkaar

- **Meerijder van de opdrachtgever.** Bestaat al (`GebeurtenisSoort 'controle'`). Hij controleert de chauffeur. In de teksten heet hij voortaan "Meerijder".
- **Kaartcontroleurs.** Nieuw. Zij controleren de reizigers. Dit is wat de gebruiker bedoelt met "Kontrolleure kaufen".

### 4.2 Het zwartrijdersmodel (`core/kaartcontrole.ts`, puur)

OMSI kent geen zwartrijders. Wie geen kaartje koopt of stempelt, heeft voor OMSI een abonnement. In `Berlin_1.otp:33-35` staat de kans op stempelen op 0,3 en op kopen op 0,2, dus ongeveer de helft reist met een abonnement.

**Tegenlezing, punt 19, niet overgenomen in de kern.** Het voorstel was om zwartrijders te tellen als "ingestapt zonder dat er een kaartje verkocht of gestempeld is". Dan telt die abonnementsgroep mee, bij Berlin_1 rond 50 %.

**Wel overgenomen:** je eigen kassawerk telt mee. Een verkoop die niet afgemaakt werd (de koper stond klaar en de bus reed weg; `koper` en `ticketKlaar`, na B6) is een zekere zwartrijder. De rest komt uit het model.

Het model rekent zo:
1. **Wie gecontroleerd wordt:** de reizigers aan boord (spoorregel `'halte'` met `reizigers`, `rittenstaat.ts:68`), plus wie tijdens de controle instapt.
2. **Hoeveel:** ongeveer 1 reiziger per 10 s per controleur, sneller met ervaring, over de echte rijtijd.
3. **Kans per reiziger:** p = basis × druk × avond × chauffeur.
   - **Basis:** 3–7 % per lijn, vast gekozen per lijn.
   - **Druk:** 0,4 + 0,6 × (1 − e^(−dagen sinds de vorige controle / 5)).
   - **Avond:** ×1,5 na 20:00.
   - **Chauffeur:** hoger bij gemeten slordigheid, zoals een onafgemaakte verkoop of achterin laten instappen na 20:00 (V9).
4. **Boete:** een constante in `REGELS`, per land van de kaart. Standaard €60 in Duitsland (het wettelijke verhoogde vervoertarief) en €50 in Nederland. Dat laatste bedrag is nog per vervoerder na te kijken.
5. **Weigeraars:** één op de ongeveer twintig zwartrijders weigert. Dan volgt een V4-achtig voorval, verschoond.

### 4.3 In de loopbaan

- **Een aparte trekking** uit `hashVan(zaad + '|kaart')`, met een kans van ongeveer 10 % per dienst. **De lijst in `onderweg.ts:186` blijft ongewijzigd.** Anders krijgt een dienst die al liep na een update een andere gebeurtenis bij hetzelfde zaad (tegenlezing, punt 23). Is de meerijder op dezelfde rit, dan kiest de kaartcontrole een andere rit.
- **Niet aangekondigd.** De kaart verschijnt als ze instappen, met een live teller van gecontroleerd tegenover zonder kaartje, en op de navigatie de halte waar ze uitstappen. Het "aan boord van halte tot halte" komt van `controleAanBoord` (`:199-207`).
- **De taak van de chauffeur:** stoppen waar ze wachten, niet wegrijden tijdens een verkoop, en voorin laten instappen.
- **De uitslag:** de boetes zijn niet voor de chauffeur. Wel +€5 als er geen gemeten slordigheid was, en −€5 als die er wel was.

### 4.4 In het busbedrijf: in dienst nemen en inzetten, gratis (cloud)

- **Rol.** `Rol` krijgt `'controleur'` (`bedrijf.ts:150`). Die gebruikt wat er al is:
  - sollicitanten, met een verdeling 60/25/15;
  - `marktloon`;
  - ervaring, tevredenheid, ziekte en vertrek (`personeelNaDag`);
  - bijscholing.
- **Inzet per concessie:**
  - 0 tot N controleurdagen per week, of "automatisch: zoveel als loont". Een automatische stand heeft BBS geweigerd (T7376).
  - Straks als rij op het planscherm (deel A).
- **Geld volgt het contract.** Het bedrijf heeft nu brutoconcessies: een vaste vergoeding per dienstregelingsuur en geen kaartgeld (`bedrijf.ts:399-405`). Standaard, tot D1 anders beslist:
  - de boetes gaan naar de opdrachtgever;
  - het bedrijf krijgt een **controlepremie**: een deel van de geïnde boetes, standaard 50 % (constante in `REGELS`);
  - het bedrijf moet een **controlequote** halen, bijvoorbeeld ≥ 2 % van de reizigers gecontroleerd per 28 dagen. Wie eronder zit, verliest reputatie, en die weegt bij verlengen (≥ 45).
  - Zo verdien je niet dubbel en worden controleurs geen melkkoe.
- **Dagafrekening** (`sluitDagAf`):
  - het model rekent op de **rekenbezetting** per lijn (B13);
  - de premie als `BoekingSoort 'controle'`, het loon via `'loon'`;
  - per concessie worden `laatsteControle` en `druk` bewaard.
- **Je eigen rit:** een knop "Controleurs roepen", of automatisch. Ze stappen minstens 2 haltes verder in en rijden 3 tot 6 haltes mee. Er is geen wachttijd van 15 minuten (T6845); de enige grens is het rooster.
- **AI-chauffeurs** krijgen ook controles. Bij BBS kan dat niet (T10494).
- **Eerlijk over de kosten** (T6937):
  - het loon staat in het dagrapport en in de prognose;
  - elke week een postbericht met gecontroleerd, zonder kaartje, premie en loon;
  - een waarschuwing als een controleur meer kost dan hij opbrengt;
  - ontslag kan altijd.
- **Statistiek** per controleur en per lijn (bij BBS ontbreekt die, T7174).

### 4.5 Niet dubbel bouwen

**Hergebruiken:**
- `gebeurtenisVoor`, `controleAanBoord`, `OnderwegBeeld` en de kaart in `telefoonOnderweg.tsx`;
- het spoor en `telVerkoop`;
- `Medewerker`, sollicitanten, `marktloon` en `personeelNaDag`;
- `Boeking`, `Bericht`, het planscherm en `telefoonBedrijf.tsx`.

**Echt nieuw:**
- `core/kaartcontrole.ts`;
- `'kaartcontrole'` als eigen trekking;
- `'controleur'` in `Rol`;
- `'controle'` in `BoekingSoort` en `BerichtSoort`;
- het controleplan per concessie;
- de rekenbezetting;
- teksten in `shared/tekst/controle.ts`.

---

## 5. Bouwpunten, gerangschikt, en de rondes

**Wie doet wat.**
- **Lokaal** is deze tak of een nieuwe lokale sessie. Die bezit `core/onderweg.ts`, `rittenstaat.ts`, `live.ts`, `career.ts`, `busklaar.ts`, de plugin, de overlay, de telefoon (behalve `telefoonBedrijf.tsx`), vrij rijden en `Profiel.tsx`.
- **Cloud** is `origin/claude/awesome-wozniak-f2svst`. Die bezit `core/bedrijf.ts`, `rooster`, `uitval`, `invulling`, `bedrijfsrit`, `Bedrijf*.tsx` en `telefoonBedrijf.tsx`.
- Meten in OMSI en de plugin kunnen alleen lokaal.

| # | Bouwpunt | Waarde | Moeite | Hangt af van | Sessie | Bron |
|---|---|---|---|---|---|---|
| B1 | Ronde 0: proefrit met het spoor en dumps op de C2, de o530 U e2 en de MAN NL (3.2) | H | S | Luc | Lokaal + Luc | Tegenlezing 4–6 |
| B2 | Aankomstmeting en de norm 120/180 s. Eén drempel in de app: `rittenstaat.ts:210` (NORM), `shared/status.ts:14` (`ON_TIME_S`), `exam.ts:37` (3 min klopt al). De eindhalte krijgt een oordeel. **De cloud inlichten** (teVroeg en teLaat) | H | M | B1 | Lokaal | Keuze van Luc; tegenlezing 1 |
| B3 | `getallen.txt`: `PAX_Entry/Exit0..7_Open/_Req`, `Cabinair_Temp`, `Dirt_Norm`, `Velocity_Ground`, `Axle_Suspension_0_L/R` | H | S | – | Lokaal | Dump; `varlist_roadvehicle.txt` |
| B4 | Voorvalprofiel per busmodel in `busklaar.ts` (patronen plus handcontrole). Knopsoort `'cabine'` in `bustoetsen.ts` | H | M | B1 | Lokaal | Tegenlezing 5 |
| B5 | `aanHalte()` met een proef op het echte spoor | H | S | B1 | Lokaal | Tegenlezing 4 |
| B6 | Kaartverkoop tellen zonder overlay (#17) | H | S | – | Lokaal | Los eindje 2 |
| B7 | Het contract `VoorvalUitslag` en `Onderweg.voorvallen` vastleggen en naar beide takken | H | S | – | Lokaal, daarna de cloud mergen | 3.11 |
| B8 | De motor voor voorvallen, de 17 voorvallen van ronde 2, beide soorten verschoning, telefoon, overlay, navigatie en sneltoetsen (3.4) | H | M | B2–B5, B7 | Lokaal | §3 |
| B9 | Kaartcontrole in de loopbaan, het zwartrijdersmodel, en V9 | H | S–M | B3, B6 | Lokaal | §4.2–4.3 |
| B10 | Van onderweg naar het bedrijf: flitsboetes, premies en voorvallen naar kas, reputatie en XP (`gemeten: true`) | H | S | B7 | Cloud | Los eindje 3 |
| B11 | Controleurs in het bedrijf | H | M | B9, B13, deel A, D1 | Cloud | §4.4 |
| B12 | Uitdagingen, weekdoelen en badges | H | M | B2, B6, B8 | Lokaal | 3.13 |
| B13 | Rekenbezetting per lijn in het bedrijf | M | S | – | Cloud | §4.4 |
| B14 | Oefenen in vrij rijden, via `volgStap` | M | S–M | B8 | Lokaal | 3.14 |
| B15 | Flitspalen aan of uit op de navigatie, mobiele flitser per dag, boete per land | M | S | – | Lokaal | T9188; W-f6 |
| B16 | OMSI's sneeuw, ijzel en vorst als weerkeuze, plus seizoenen (#57) | M | S | – | Lokaal | `Weather/*.owt` |
| B17 | Echt weer via OMSI's eigen METAR (`Weather/ICAO.txt`, 103 stations) als keuze. Eerst nagaan hoe OMSI dat aanzet | M | S | – | Lokaal | A473 |
| B18 | Proef met de situatie: `[vars]` met `tank_percent`, `Dirt_Norm` en een lamp | M | S | B1 | Lokaal + Luc | OMSI-onderzoek D3 |
| B19 | Plugin 15, alleen lezen: dossier, rittenlog (`ata/atd/arr_ok/dep_ok`), velden per reiziger, `coll_pos_*`, `Pause`, `OnDepot`, **de fase van verkeerslichten** (`OmsiAmpel.actPhase`, `omsistructs.cs:913-979`; het beginadres moet nog gezocht worden), en onderzoek naar `MeckerFahrstil` | H | M–L | B1 | Lokaal | Tegenlezing 16–17 |
| B20 | Proef met schrijven en triggers (3.10) | M | S (proef), M per bus | B1, **D2** | Lokaal + Luc | Tegenlezing 13 |
| B21 | Rijcijfer "veilig rijden" (#26): rood licht (B19) en van de rijbaan (afstand tot de rijstroken uit `core/roads.ts`). Een rang die een cijfer eist (#51) | M | M | B2, B19 | Lokaal | A497; tegenlezing 16 |
| B22 | Defect melden: tijdens de rit (knop in de rit-app) en na de rit. Niet gemeld wordt later duurder | M | S | B10 | Lokaal (knop) + Cloud | HB p.48; A107 |
| B23 | Statistiek per bus en per medewerker, notities per bus | M | S | – | Cloud | A391; A357; A413 |
| B24 | APK voor eigen bussen | M | S | Wagenpark | Cloud | HB p.46–47 |
| B25 | Lease, huur en lening (deel F). De bedrijfsklok loopt alleen als je speelt (`bedrijfsklok.ts:3-21`), dus afbetalingen staan dan stil. Dat komt als eis in deel F | M | M | Deel A | Cloud | `busbedrijf-wagenpark.md`; A493 |
| B26 | Brandstof van de eigen rit gemeten (`tankPercent`) in plaats van het uurbedrag | M | S | B10 | Cloud + lokaal meten | HB p.40 |
| B27 | Vervangingsritten in de loopbaan | M | S | B12 | Lokaal | HB p.38 |
| B28 | Seizoensevents via de datum en de chrono's | M | M | B12, B29 | Lokaal | A293 en verder |
| B29 | Chrono lezen (#19); opent V18 en V19 | M | M–L | – | Lokaal | #19 |
| B30 | Drukte per dienst (#69) | M | S | – | Lokaal | #69 |
| B31 | Gong en spraak (alleen stemmen die in Windows staan) | M | S | B8 | Lokaal | T6846 |
| B32 | OMSI sneller laten starten, zonder mappen van de speler te verplaatsen: eerst onderzoeken hoe | M | onbekend | – | Lokaal (onderzoek) | `articles.txt:1242` |
| B33 | Verzekering als je dat wilt | L | S | B25 | Cloud | W-m6 |
| B34 | "Wat is er nieuw" na een update (#68) | L | S | – | Lokaal | #68 |
| B35 | Uitweg als je bus vastzit (BBS: botsingen uit tegen −50 %): onderzoeken | L | onbekend | – | Lokaal | HB p.49 |
| B36 | OMSI pauzeren bij "Dienst afronden" (pauzetoets via de plugin), als je dat wilt | L | S | – | Lokaal | HB p.46 |

**Rondes.** Na elke ronde worden de Setup én de draagbare versie opnieuw gebouwd en in `release/` gezet (CLAUDE.md).

0. **Meten (Luc en lokaal):** B1, en B18 in dezelfde sessie. B20 alleen als D2 ja is.
1. **Voorwerk (lokaal):** B2, B3, B4, B5, B6 en B7. De cloud hoort van de nieuwe norm en krijgt het contract.
2. **Voorvallen (lokaal):** B8 met V1 (basis), V2 (basis), V3–V7, V13–V16, V20, V21, V26 en V30, aan het eind V17 en V31. Daarbij B15 en B31.
3. **Controle en doelen (lokaal):** B9 (V9, V10), B12, B14, B27, en de knop van B22. Tegelijk in de cloud: B10 en B13.
4. **Bedrijf (cloud, na deel A):** B11, B22 (afhandeling), B23, B24 en B26. B25 volgt het eigen plan van de cloud.
5. **Profiel en weer (lokaal):** knielen en plaat bij V1 en V2, V22, V23, V25, V27, V28 en V29, plus B16 en B17. De varianten met schrijven alleen na D2 en B20.
6. **Plugin 15 (lokaal):** B19, daarna V11, V12, V32 (`OnDepot`), doorrijden bij V21, en B21.
7. **Later:** B28, B29 (daarna V18 en V19), B30, B32–B36.

**Wat Luc in OMSI meet (ronde 0).** De cloud kan dat niet.
- De halte-sprong en `nextDist`.
- De deuren per index.
- Stopverzoek, alarmlichten, knielen (scriptnamen en `Axle_Suspension`) en de oprijplaat, op 3 bussen.
- De laatkomer: komt er een `PAX_Entry*_Req` na het sluiten van de deuren?
- Wat nog openstaat (`HANDOVER.md:2271-2273`): de kant en het bereik van flitspalen, en of `ticketSlecht` betrouwbaar aangaat.
- De proef met `[vars]` (B18), en na D2 de proef met schrijven (B20).

**Gedeelde bestanden.**
- Teksten in eigen bestanden onder `shared/tekst/`.
- De meetlus in `main/index.ts` en `busklaar.ts` zijn lokaal.
- De typen in `core/bedrijf.ts` (`Rol`, `BoekingSoort`, `BerichtSoort`) worden alleen in de cloud uitgebreid.

---

## 6. Wat we bewust niet overnemen

**Geld en premium**
- Premium, goud, betaalde rangen, +10 % loon voor wie betaalt, een verloting, een betaalde minimap, advertenties (T6537; A357; A371; T10566).
- Procenten die zich opstapelen: geen loonprocent per badge (A499).

**Druk en straf**
- Straf voor niet spelen. Bij BBS gelden ontslag na 14 dagen en faillissement bij inactiviteit voor multiplayer en lokale bedrijven, niet voor singleplayer (`articles.txt:217, 445`; A493). Wij doen het nergens. Onze weekdoelen verlopen niet.
- Kosten die stil doorlopen (T6937).
- Kunstmatige remmen: 15 min tussen controles (T6845), controleurs alleen met de hand (T7376), een boete bij het reserveren van bonusritten (W-m9).
- Scenario's van één minuut en scenario's die alleen een knop zijn (T7544; T7812). Ook een quiz over "welke dienst bel je" (T7812).

**Rompslomp**
- Belastingaangifte, aanmaningen, een verplicht 3D-terrein (W-m6; STREV).
- Verplicht internet (T10494).
- Voortgang weggooien als een modus verandert (T10497).
- Anticheat die de carrière terugzet (A185).

**Nu niet**
- Multiplayer, chat, verbonden bedrijven, concessieprijzen door populariteit, een bedrijfsranglijst. Luc koos: nu niet.

**Van anderen**
- Geen teksten, afbeeldingen, stemmen, bedragentabellen of code van BBS of PeDePe.
- `omsistructs.cs` (OmsiHook) dient alleen als bron over het geheugen van OMSI.
- De Duitse boeteregels zijn openbaar recht.

**Wat in OMSI niet kan**
- Hulpdiensten, verkeer, voetgangers of reizigers neerzetten.
- Tijdens de rit een weg afsluiten. Dat kan alleen via een chrono bij de start.
- Weer of tijd veranderen tijdens de rit.
- Reizigers gezamenlijk laten uitstappen: OMSI laat ze alleen bij hun doel of aan het eindpunt uitstappen (`omsistructs.cs:1468-1474`).
- Zwartrijders als gegeven van OMSI: het blijft ons model.
- **De klachten van OMSI-reizigers als getal.** Ze zijn niet gevonden: `Fahrt_Mecker` staat niet in `Omsi.exe` en ook niet in de varlists. Er is alleen `whinge_prop` in het ticketpack (hoe vaak reizigers klagen) en de naam `MeckerFahrstil` in `Omsi.exe`. Dat onderzoeken we in B19, maar we beloven niets. U12 gebruikt daarom eigen metingen.
- Op een andere OMSI-versie dan 2.3.004 leest de plugin geen geheugen (3.3).

**Wat niet meer onder "kan niet" staat:** de fase van een verkeerslicht. De structuur is bekend; het beginadres moet nog gezocht worden (B19).

---

## 7. Zo is de tegenlezing verwerkt

| Punt | Oordeel | Wat veranderde |
|---|---|---|
| 1 Er is geen aankomstmeting | Overgenomen (zelf gezien: `rittenstaat.ts:166, 215-217, 310`) | B2 is nu moeite M, met de spoorregel `'aankomst'` en een oordeel voor de eindhalte. V31 en U14 komen daarna |
| 2 Stilstand dekt langzaam rijden niet | Overgenomen | Twee soorten verschoning, met de formule voor verloren tijd (3.5) |
| 3 V17 botst met de verschoning | Overgenomen | De trigger gebruikt de vertraging min de verschoning, en V17 komt niet in een rit die al verschoond is |
| 4 De haltes zijn niet nagekeken | Overgenomen | Ronde 0 (B1) en `aanHalte()` (B5) |
| 5 Namen per busmodel, en tellingen | Overgenomen (zelf nageteld: 16/16/17/10/9). **Deels weerlegd:** een toets voor knielen kan de app zelf bijschrijven via `bustoetsen.ts`, als het model een `[mouseevent]` heeft | Voorvalprofiel (B4), soort `'cabine'`, en onderzoek naar `Axle_Suspension` |
| 6 Alleen deur 0 | Overgenomen (gezien in de dump en in `OMSICareer.opl:46-50`) | Alle deuren in B3, systeemgetallen |
| 7 Pech klopt niet | Overgenomen | V22: geen "reizigers eruit", een strengere trigger, nooit aan de eindhalte |
| 8 Hittegolf | Overgenomen. Aanvulling: `Cabinair_Temp` is een voertuiggetal van elke bus (`varlist_roadvehicle.txt:124`) | Alleen met koeling, en een doel ten opzichte van buiten |
| 9 Motor te heet | Overgenomen | Opgegaan in V22 |
| 10 `wear_lifespan` | Overgenomen | V23 werkt via het profiel |
| 11 Bezetting doorgeven | Overgenomen | V8 vervallen |
| 12 Dienst kiezen als quiz | Overgenomen | Eén knop "Melden" |
| 13 Echte signalen | Overgenomen als proef. De uitwerking per bus is M, en schrijven verandert Lucs spel | 3.10, B20, beslissing D2. V6 reageert op een echt signaal, zonder te schrijven |
| 14 Keertijd | Overgenomen | V31 met min(N, …), na B2 |
| 15 AltGr | Overgenomen | Ctrl+Alt+F1–F3, alleen zolang er een vraag openstaat, in te stellen |
| 16 Verkeerslicht, rijbaan | Overgenomen (`articles.txt:1246, 1256`; `omsistructs.cs:913-979`) | B19 en B21 |
| 17 Klachten spreken elkaar tegen | Overgenomen (`Fahrt_Mecker` niet gevonden) | §6 en U12 zeggen nu hetzelfde |
| 18 Bruto tegenover kaartgeld | Overgenomen | Standaard bruto met premie en quote. Kaartgeld naar de kas alleen bij netto (D1) |
| 19 Zwartrijders uit "geen kaartje" | **Weerlegd in de kern:** dat zijn voor OMSI abonnementhouders (`Berlin_1.otp`: ongeveer 50 %). Het deel over het kassawerk is overgenomen | Een onafgemaakte verkoop is een zekere zwartrijder (4.2) |
| 20 Ontbrekende functies | Overgenomen | B17, B22, B25, B26, B27, B32, B35 en B36. Afbetalingen staan al stil door de bedrijfsklok |
| 21 Fouten over onze app | Overgenomen: 5 weerkeuzes, remise uit `beginplek.ts`, veld `gemeten`, `live.ts:1217` is de stemming, vrij rijden heeft `volgStap` | Overal verbeterd. Nieuwe nummering B1–B36 |
| 22 Fouten over BBS | Overgenomen (`articles.txt:1175, 1213, 217, 445`). De Steam-prijs zelf niet opnieuw nagekeken | §1 en §6 |
| 23 Zelfde zaad, andere gebeurtenis | Overgenomen | Aparte trekking voor de kaartcontrole (4.3) |
| 24 Kleine punten | Overgenomen | Weekdag bij V16. V18 naar ronde 7. De timer van V12 staat stil tijdens een verkoop. Spraak valt terug op gong en tekst. V7 en V20 delen de code met de comfortcontrole en de flitscontrole |

---

## 8. Standaardkeuzes

Dit zijn voorstellen, geen beslissingen. Ze staan als constanten in de code en kunnen later zonder ontwerpwijziging veranderen.
- **Afzender van de voorvallen:** "Centrale", zoals in `busbedrijf-planning.md:22`. Het is alleen een afzender, geen speelbare meldkamer (`HANDOVER.md:2238-2239`).
- **Frequentie en moeilijkheid:** Normaal en Normaal.
- **Badges:** alleen voor de sier.
- **Geluid:** standaard uit.
- **Oefenen in vrij rijden:** telt niet voor badges.
- **Boete bij een kaartcontrole:** €60 in Duitsland en €50 in Nederland (dat laatste nog na te kijken).
- **Veiligheidsfouten:** −€15 tot −€50, een aantekening, en reputatie −1 of −2.

---

## 9. Beslissingen voor Luc

- **D1. Controleurs en kaartgeld in het busbedrijf.**
  - (a) Het bedrijf blijft bruto, zoals nu: de boetes gaan naar de opdrachtgever, het bedrijf krijgt een controlepremie (50 % van de geïnde boetes) en moet een controlequote halen.
  - (b) Daarnaast netto-concessies bij de inschrijving: een lagere vergoeding per uur, en kaartgeld en boetes zijn van jou.

  Mijn advies: (a) nu en (b) later als keuze bij het inschrijven.
- **D2. Mag de app in OMSI schrijven of busknoppen indrukken?** Denk aan een echt kinderwagenlampje, een echte storing of een echte kapotte lamp.
  - Bij ja: eerst een proef in ronde 0.
  - Bij nee: de voorvallen blijven meldingen in de app, maar met echte metingen in OMSI.
- **D3. Mag het loon uit de loopbaan later startkapitaal worden van je eigen busbedrijf?** Dat is los eindje 4. Nu start het bedrijf met €150.000 (`bedrijf.ts:394`). Bij ja krijgen beloningen en boetes in de loopbaan een echte betekenis, en moet de cloud het startkapitaal aanpassen.