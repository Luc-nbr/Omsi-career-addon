# Overdracht — OMSI Enhancer

Dit bestand is bedoeld voor wie het werk overneemt. Het beschrijft wat er staat,
wat er is nagerekend, waar de valkuilen zitten en wat er nog open ligt.

Repo: https://github.com/Luc-nbr/Omsi-career-addon — tak `master`.

---

## 1. Wat het is

Een Windows-app die van OMSI 2 een carrièremodus maakt, in de geest van Advanced
Omni Bus Driver maar modern. De app heette eerst OMSI Career; sinds hij ook de
instellingen en de toetsen van het spel beheert heet hij **OMSI Enhancer**. De
map met gebruikersgegevens heet daardoor `%APPDATA%\omsi-enhancer`, en bij de
eerste start worden de profielen uit `%APPDATA%\omsi-career` overgenomen (een
kopie, dus de oude versie blijft werken). Twee dingen houden hun oude naam met
opzet: de map `%LOCALAPPDATA%\OMSI Career` waar de plugin zijn `live.json`
neerzet -- dat pad zit in de DLL -- en de kopie `laststn.osn.voor-omsi-career`
die er bij sommigen al staat. De app zoekt een echte omloop uit de dienstregeling
van een kaart, geeft een dienstkaart met de IBIS-codes, zet de dienst klaar in
OMSI (kaart, bus, datum, tijd, dienstregeling), start het spel en hangt een
overlay boven het spel met live gegevens.

De app opent altijd met twee vragen: **wie rijdt er** (profielkeuze) en **hoe wil
je rijden**. Die tweede vraag kent drie antwoorden:

- **Carrière** — met papieren. Zonder rijexamen mag je niets; dat examen doe je op
  een route die je zelf kiest, en die route is daarna je eerste vergunning. Elke
  lijn erbij vraagt een eigen examen. De remise wijst de dienst toe en kiest
  alleen uit lijnen waar je een vergunning voor hebt.
- **Dienst** — hetzelfde rijden zonder die regels: eigen route, eigen lengte.
- **Vrij rijden** — niets wordt geboekt of beoordeeld. Je kiest lijn, bus, plek,
  weer, datum en tijd; de app zet het klaar en biedt de overlay aan.

Daarnaast beheert de app de **instellingen, toetsen en gamecontrollers van OMSI
zelf**: 37 van de 47 blokken uit `options.cfg` met uitleg erbij in vier talen,
alle 128 toetsbindingen uit `Inputs\keyboard.cfg`, en de apparaten uit
`Inputs\gamectrler.cfg` met hun assen en knoppen -- met de namen die OMSI er zelf
aan geeft. Bij de controllers beweegt de balk mee terwijl je stuurt of trapt (de
Gamepad-API van de browser), en een wizard vraagt de belangrijkste twaalf dingen
na; elke stap mag worden overgeslagen en de wizard ook. Er wordt alleen
geschreven wat je verandert; de rest van elk bestand blijft byte voor byte staan
(`probe-gamecfg.ts`, `probe-controllers.ts`).

Electron 33 + electron-vite + React 19 + TypeScript. `npm run dev` voor
ontwikkelen, `npm run typecheck`, `npm run build`, `npm run dist` voor de
installer.

**Wat de app in de spelmap schrijft**: de overlay-plugin in `plugins/`, en bij
het starten van een dienst `Situations\OMSI Enhancer.osn` (kaart, datum, tijd, bus
bij de eerste halte, gekozen dienstregeling) plus het weerbestand ernaast. Om het
startscherm van OMSI goed te zetten gaat diezelfde situatie ook naar
`maps\<kaart>\laststn.osn` -- daar leest OMSI "Last Situation" -- en wordt
`[last_map]` in `options.cfg` op die kaart gezet. Van de bestaande `laststn.osn`
blijft eenmalig een kopie staan als `laststn.osn.voor-omsi-career`. Verder niets.

---

## 2. Werkafspraken met de gebruiker

- **Antwoord in het Nederlands.** De gebruiker is Nederlandstalig.
- **Code-commentaar en commitberichten in het Nederlands**, in de stijl die er
  staat: leg uit *waarom*, niet *wat*. Kijk naar bestaande commits.
- **Geen processen van de gebruiker afschieten.** Als een bestand vastzit omdat
  de app draait, meld dat en laat de keuze aan hem.
- **De installer bouwen naar een tijdelijke map**
  (`npx electron-builder -c.directories.output=<tmp>`) en daarna kopiëren.
  Defender houdt `release/` regelmatig vast.
- **Valkuil: heredocs eten backslashes.** Python-scripts met `\` erin (paden,
  regex) moeten met het Write-gereedschap geschreven worden, niet via
  `python - <<'PY'`. Dit is meerdere keren misgegaan.
- **Valkuil: PowerShell knipt `-c.directories.output=...` doormidden.**
  `npx electron-builder -c.directories.output=$out` komt bij electron-builder aan
  als `-c` plus een los stuk, en dan leest hij dat stuk als de naam van een
  configuratiebestand. Zet het argument in een rij en geef die door:
  `$argv = @("-c.directories.output=$out"); npx electron-builder @argv`.
- **Valkuil: PowerShell 5.1 verminkt UTF-8.** `Get-Content -Raw` leest de
  bronbestanden als Windows-1252; wie dat met `Set-Content` terugschrijft maakt
  van "één" "Ã©Ã©n". Tijdelijke wijzigingen met het Edit-gereedschap doen.
- De gebruiker draait Smart App Control; ongetekende exes worden geblokkeerd.
  `Start OMSI Enhancer.cmd` start de app via `node_modules\electron\dist\electron.exe`.

---

## 3. Wat er staat, per laag

### `src/core/` — lezen van OMSI-bestanden (geen Electron-afhankelijkheden)

| Bestand | Rol |
|---|---|
| `omsiFile.ts` | Coderingsbewuste lezer (UTF-16LE met BOM óf Windows-1252) en `blockTag` |
| `timetable.ts` | `.ttl` (omlopen), `.ttp` (ritten), `Busstops.cfg` → `OmsiMap` |
| `network.ts` | Koppelt ritten aan elkaar tot doorlopende omlopen |
| `duty.ts` | Kiest een dienst van ongeveer de gevraagde lengte |
| `fleet.ts` | Wagenpark van de kaart uit `ailists.cfg`, en buskeuze |
| `hof.ts` | `.hof`-bestanden: bestemmingscodes en routes per wagenpark |
| `ibis.ts` | Bouwt het IBIS-plan (lijn + route per rit) |
| `geo.ts` | Tegelraster, halteposities, wegennet en rijstroken uit de tegels |
| `roads.ts` | Spline- en objectbanen: meetkunde, soort verkeer, rijrichting |
| `track.ts` | Route van een rit uit OMSI's eigen `.ttr` |
| `routing.ts` | Rijstrokennet en routeplanner van halte naar halte; kiest per rit `.ttr` of planner |
| `live.ts` | Leest `live.json` van de plugin, maakt er een `LiveStatus` van |
| `career.ts` | Loopbaan: diensten, uren, rangen, modi, vergunningen, examens |
| `exam.ts` | De eisen van het rijexamen en het oordeel erover |
| `startup.ts` | Het startscherm van OMSI: `laststn.osn` en `[last_map]` |
| `omsiOptions.ts` | `options.cfg` regel voor regel lezen en terugschrijven |
| `gameSettings.ts` | De brug tussen die blokken en de schuiven in het scherm |
| `omsiKeys.ts` | `keyboard.cfg`, de toetsnamen (`.kyb`) en de handelingen (`.olf`) |
| `omsiControllers.ts` | `gamectrler.cfg`: apparaten, assen en knoppen |
| `weather.ts` | Schrijft het `.owt`-bestand bij een situatie |
| `profiles.ts` | Profielen in `%APPDATA%\omsi-career\profiles\` |
| `settings.ts` | Taal, in `settings.json` |
| `installed.ts` | Wat er de vorige keer in de OMSI-map stond, in `installed.json` |
| `overlayLayout.ts` | Indeling van de overlay, in `overlay.json` |
| `kaartlaag.ts` | Alles wat uit de OMSI-map komt, met zijn caches; draait in het hoofdproces **en** in de werker |
| `logboek.ts` | Het logboek van de app zelf: `%APPDATA%\omsi-enhancer\logs\omsi-enhancer.log` |

### `src/shared/`

- `i18n.ts` — alle teksten, vier talen (en/de/fr/nl), Engels is standaard en
  terugval. Sleutels die pas tijdens het draaien bekend zijn (rangen,
  stemmingen, adviezen) gaan via `loose()`.
- `format.ts` — tijd, duur, bedrag, dagen. Alles wat een taal kent neemt die als
  laatste argument.
- `overlay.ts` — indeling en standen van de overlay.
- `weather.ts` — de weertypes waaruit gekozen kan worden, met hun waarden. Staat
  hier en niet in `core/` omdat de interface ze toont; de schrijver zit in
  `core/weather.ts`.
- `api.ts` — het contract tussen hoofdproces en interface.

### `src/renderer/src/`

**Let op: er is nog maar één wereld.** Tot september 2026 stonden er twee
schermenstelsels naast elkaar -- de oude glazen zijbalk met een keuzevak per
vraag, en het nieuwe opzetscherm met een stappenbalk. De dienstmodus was
overgezet en carrière en vrij rijden vielen nog op de oude terug. Die tweede
wereld is weg, met acht bestanden tegelijk: `Sidebar`, `CareerPanel`, `FreePlay`,
`DutyProposal`, `LinePicker` (de oude wereld) plus `Welcome`, `Profiles` en
`Modes` (al orphan sinds de eerste overzetting). Kom je ze in oude notities
tegen: ze bestaan niet meer.

- `App.tsx` — het hart. Kiest welk scherm er staat, houdt alle toestand vast,
  en bouwt per stap het `vel` dat `Setup` toont. Groot bestand; de `vel`-bouwer
  is een reeks `if (stap === …)`-takken die elk een titel, kolomkoppen, rijen of
  tegels, een voet en een hoofdknop teruggeven.
- `Setup.tsx` — de vorm waarin élke stap getoond wordt: de kaart als ondergrond,
  de stappenbalk, het vel met de keuzelijst, en de knoppenrij. Alle modi lopen
  dezelfde reeks; wat per modus verschilt is één stap tussen de kaart en de
  dienst (niets / vergunning / lijn) en dat staat in `STAPPEN_DIENST`,
  `STAPPEN_CARRIERE` en `STAPPEN_VRIJ` in `App.tsx`.
- `Welkom.tsx` — het allereerste scherm: waar staat OMSI 2? Niet te verwarren met
  het verdwenen `Welcome.tsx`.
- `Profiel.tsx` + `profiel.css` — de staat van dienst van een chauffeur: alles
  wat het logboek bijhield, als cijfers en staafjes.
- `Icoon.tsx` — alle icoontjes van de app op één plek; zie hieronder.
- `LiveDienst.tsx` — de dienstregeling die meeloopt tijdens het rijden, met de
  navigatie ernaast.
- `BusDialog.tsx`, `HofDialog.tsx` — de twee venstertjes op de busstap: neem je
  de aanbevolen bus, en zal ik er een wagenpark bij zetten.
- `StartingDialog.tsx` — het venstertje terwijl OMSI opstart.
- `ThemaKnop.tsx`, `Versie.tsx`, `Flag.tsx` — wat rechts in de stappenbalk hangt.
- `RouteCode.tsx` — een routenummer met het lijndeel gedempt (85302 leest als 02).
- `GameSetup.tsx` — de instellingen, de toetsen en de controllers van OMSI.
- `Controllers.tsx` — apparaten, assen met een meebewegende balk, knoppen met
  zoeken, en de wizard voor een nieuw apparaat.
- `DutyCard.tsx` — de dienstkaart met alle deelpanelen; leeft nog, getoond
  binnen het nieuwe vel zodra de dienst rijdt.
- `RunningDuty.tsx` — het compacte scherm tijdens het rijden.
- `RouteMap.tsx` — de kaart (halteborden, routes, zoomen, slepen), in SVG.
- `roadLayer.ts` — het wegennet op een canvas onder die SVG; per vak van 300 m
  gesneden en uitgezoomd gebufferd. Als één SVG-pad kostte slepen over
  HamburgLi20 350 ms per beeld, zo 7 ms.
- `DutyMap.tsx` — het paneel eromheen plus het routevenster.
- `Starthub.tsx` — het hoofdscherm: drie grote tegels voor de modus, je staat
  van dienst, en de weg naar de instellingen van OMSI en naar de chauffeurs.
- `Klaarzetten.tsx` — de installatiestap die de kaarten inleest, met een balk.
- `overlay.tsx` — de overlay boven het spel.
- `receipt.tsx` — het kaartje voor de bonprinter.
- `language.tsx` — `useT()` en `useLanguage()`.
- `theme.css` — de kleuren, gehangen aan `.setup` en `.overlay-body` en
  **niet** aan `:root`: `styles.css` gebruikt dezelfde namen met andere waarden
  en wordt later ingeladen, dus op `:root` wint die. De lichte stand geldt alleen
  voor `.setup`; de overlay is altijd donker (zie §4).

#### De icoontjes

Ze staan allemaal in `Icoon.tsx`, en ze zijn getekend en niet opgehaald. Dat is
een keuze met een reden: er stond al een handvol in `Setup.tsx` met erboven
"bewust klein en van één gewicht; ze zijn label, geen plaatje", en dat is een
stijl die je alleen houdt als er niets vreemds tussen komt. Een set uit een
pictogrammenpakket -- of uit een beeldmodel -- komt met andere lijndiktes en een
ander optisch gewicht, en dat zie je meteen naast de zes die er al waren.

Regels van de set:

- Veld van 24 × 24, gevuld en niet gelijnd. Bij zestien pixels valt een lijn van
  twee pixels uit elkaar; een vlak niet.
- `currentColor`, zodat ze de tekst volgen waar ze bij staan. De maat komt van de
  klasse, niet van het icoon.
- `vulling: 'nonzero'` voor vormen die uit overlappende delen bestaan (een wolk is
  drie cirkels en een balk). Standaard is `evenodd`, want een ring of een pasje
  met een uitsparing loopt anders dicht.
- **Beoordeel ze op zestien pixels.** `scripts/probe-iconen.ts` zet de hele set op
  een vel in vier maten en op beide achtergronden; `scripts/schermafdruk.cjs`
  maakt daar een plaatje van. Vier van de eerste lichting moesten opnieuw: wat op
  tweeënzeventig pixels een rozet was, was op zestien een poppetje met beentjes.

### `plugin/`

Een 32-bits DLL in C die OMSI laadt. Schrijft `%LOCALAPPDATA%\OMSI Career\live.json`.
Zie `README.md` voor de details; die zijn duur betaald en staan er goed in.

---

## 4. Wat is nagerekend (niet aannemen — gemeten)

Deze getallen komen uit de probes in `scripts/` (zie §6). Draai ze opnieuw als je
aan `geo.ts`, `roads.ts`, `track.ts` of `routing.ts` komt.

**Tegelmeetkunde (`geo.ts`, `roads.ts`)**

- Een tegel is 300 × 300 m; `tile_X_Y.map`. **Behalve** als `global.cfg` een
  regel `[worldcoordinates]` heeft: dan volgen de tegels het Mercator-raster van
  OpenStreetMap op 65.536 tegels, en is een tegel `2π·6378137/65536 · cos(φ)`
  meter, met `φ = atan(sinh(2π·y/65536))`. Berlin-Spandau is zo gebouwd (371,7 m).
  Met 300 m lagen daar alle 341 splinekoppelingen over een tegelgrens precies
  71,7 m verkeerd; met het raster 2 van de 341. Zie `readTileGrid()`.
- Blokken die weg dragen: `[spline]`, `[spline_h]` (zelfde indeling, met
  hoogteverloop) en `[object]` waarvan de `.sco` `[path]`-blokken heeft.
  Kruisingen, rotondes en in Hamburg hele straten zijn zulke objecten.
- Een `[spline]` kan een losse regel `mirror` hebben (Thüringer Wald): het
  dwarsprofiel ligt gespiegeld, rijstroken wisselen van kant én van richting.
- In een `[object]`-blok zijn veld 4 en 5 de grondcoördinaten, veld 6 de hoogte.
- In een `[spline]`-blok staat de hoogte **tussen** de twee grondcoördinaten in.
- **Beide hoogtes zijn wereldhoogtes, geen afstand tot de grond.** Nagemeten op
  de plekken waar een baan uit een object aansluit op een baan uit een spline:
  de twee komen in 96 tot 98 procent van de gevallen binnen een meter overeen
  (`probe-baanhoogte.ts`). Reken er dus niet het maaiveld bij op -- dat zit er op
  Spandau 33 m naast.
- **Een haltepaal is de uitzondering en zegt niets.** Zijn veld 6 staat op 0,00:
  mediaan over elke kaart, op Spandau 99% binnen een halve meter, terwijl het
  maaiveld daar op 32 m ligt. Nul betekent daar "op de grond" en is geen bruikbare
  wegdekhoogte (`probe-haltehoogte.ts`). Twee eerdere pogingen om hier iets uit te
  halen zijn op die meting gestrand; doe het niet nog eens.

**Waar de bus komt te staan (`spawn.ts`) — het maaiveld is de zwakke meting**

- Het wegdek wint, met het maaiveld als ondergrens en als terugval wanneer er
  geen rijstrook is. Er staat **geen bovengrens** meer, en dat is met opzet.
- Hier stond wel een grens: ligt het wegdek meer dan acht meter boven het
  maaiveld, dan is het geen talud maar een viaduct dat over de halte heen loopt,
  dus terug naar het maaiveld. Die gok was verkeerd, en hij was de oorzaak van
  "de bus spawnt onder de weg". Wat de gok voor een viaduct aanzag is het
  maaiveld dat niet klopt: op HamburgLi20 staat de Michaeliskirche met een
  maaiveld van **-11,5 m** in de boeken -- dat is de bodem van de Elbe en geen
  straat. Van de 47 haltes waar de grens aansloeg lag er geen enkele onder iets:
  geen van alle had ook maar één rijstrook beneden zich. De bus werd er tot
  vijftien meter onder gezet (`probe-viaduct.ts`).
- Van de 1934 haltes op deze installatie heeft **geen enkele** een rijstrook
  zonder hoogte; 189 hebben een weg die ónder het maaiveld ligt, gemiddeld 0,03
  tot 0,15 m -- meetruis, en daar vangt de `Math.max` hem op (`probe-wegdek.ts`).
- IJkpunt: de bus die OMSI zelf op Berlin-Spandau achterliet stond op 32,04; wij
  komen op 32,39 bij een halte 13 m verderop (`probe-bushoogte.ts`).
- Twee hypothesen die **niet** waar zijn, opgeschreven zodat ze niet opnieuw
  geprobeerd worden. (1) Splinehoogtes zijn relatief aan het terrein -- nee: op
  Spandau is de mediaan 33,0 bij een maaiveld van gemiddeld 33,0, ze lopen mee
  (`probe-splinehoogte.ts`). (2) Een spline draagt een hoogteverloop dat wij niet
  lezen -- het veld dat daarop leek haalt in de ketting 87% tegen 79% zonder, met
  uitschieters van 2000 m; dat is geen hoogteverschil (`probe-hoogteverloop.ts`).

**Het wagenpark (`.hof`) hoort bij een bus en een kaart**

- Niet bij een bus en een dienst. Dat scheelde twee scheve uitkomsten: een bus
  die de halve kaart kent maar net niet de vier haltes van déze dienst kreeg een
  aanbod dat hij niet nodig had, en bij vrij rijden -- waar geen dienst bestaat --
  werd er nooit iets gevraagd. `hof:offers`, `hof:offerFor` en `hof:place` nemen
  daarom een `mapFolder`, en de eindbestemmingen komen uit de ritten van de kaart
  zelf (`terminiOf` in `main/index.ts`). Aantallen per kaart: 3 (Grundorf) tot 159
  (Ahlheim 5).
- `scanHofs` leest 448 bestanden en dat kostte 1,0 tot 1,3 seconde, in het
  hoofdproces, bij elke vraag opnieuw. Nu één keer van schijf voor beide lezingen
  (716 ms) en daarna bewaard zolang de vingerafdruk klopt: de tijden van de 154
  voertuigmappen samen, 17 ms om na te vragen. `planHofs` ging van 1157 naar
  101 ms (`probe-hoftijd.ts`).

**De kilometerteller van een bus deugt niet altijd**

- `kmcounter_km` is een variabele van het voertuig. In het logboek van de
  gebruiker staat `drivenKm` bij alle negentien diensten ofwel precies nul, ofwel
  iets in de miljoenen: 2.094.964 km op een dienst van 49 minuten.
- Oorzaak: `alive` zegt dat de plugin schrijft, niet dat er een bus staat. Tussen
  het starten van OMSI en het inladen van de situatie schrijft hij al, met een
  kilometerstand van nul -- en dan is het begin nul en het eind de hele
  kilometerstand van dat voertuig. `captureBaseline` wacht daarom nu op
  `mem.ok === 1`, dezelfde vlag waar de kaartpositie aan hangt.
- En er staat een grens op de uitkomst (`gereden` in `main/index.ts`): meer dan
  in de verstreken tijd te rijden valt bij 100 km/u is geen afstand maar een
  kapotte teller, en dan wordt er níéts opgeschreven. `SessionResult.drivenKm` is
  daarom optioneel; "niet gemeten" is iets anders dan "nul kilometer".
- **Nog niet bevestigd in het spel.** Of de nulmeting nu op het goede moment valt
  is alleen te zien aan een volgende dienst: staat er dan een gewoon getal als
  24 km, dan is hij goed.

**Het hoofdproces doet één ding tegelijk (20-09-2026)**

Een melding uit Discord: "hängt sich ständig auf nach jedem drücken eines
Buttons ... besonders häufig in der Dienstauswahl". Gemeten in het nieuwe
logboek, bij een gewone opzet: `map:geometry` 2767 ms, `duty:list` 1989 ms,
`map:routes` 810 ms, `omsi:maps` 851 ms. Al die tijd stond de hele app stil --
geen knop, geen venster, geen overlay -- want dat werk liep in het hoofdproces.
Het voorwerk na het opstarten deed hetzelfde twaalf keer achter elkaar
(`probe-kaarttijd.ts`: 8,9 s samen, uitschieter 2516 ms voor Ahlheim 5).

Nu draait dat werk in `src/main/kaartwerker.ts`, een worker_thread die dezelfde
`core/kaartlaag.ts` gebruikt. Er zijn er **twee**: een voor wat de speler
vraagt en een voor het voorwerk. Met één stond een klik in de rij achter een
kaart van twee seconden -- `hof:offers` kwam zo op 3408 ms; met de splitsing op
726 ms. De achtergrondwerker sluit zichzelf zodra de kaarten klaarstaan en
geeft de buslijst nog even door aan de voorgrondwerker, zodat die klaarstaat
voor de busstap.

Wat er via de werker gaat: de kaarten (`kaart`), de kaartenlijst
(`overzicht`), de buslijst (`voertuigen`), het busvoorstel (`busvoorstel`),
het wagenparkaanbod (`hofaanbod`), de dienstenlijst (`diensten`) en de routes
(`routes`). Elke aanroep valt terug op het hoofdproces als de werker uitvalt. Gemeten met `scripts/probe-haperen.cjs`, dat vanuit
het scherm elke 50 ms de goedkoopste vraag stelt terwijl alle twaalf kaarten
ingelezen worden: 1200 vragen, midden 0 ms, langste 160 ms, één keer boven de
150 ms en geen enkele keer boven de halve seconde. Het werk duurt even lang; het
blokkeert alleen niets meer.

Wat nog in het hoofdproces gebeurt en boven de 150 ms uitkomt, schrijft zichzelf
op in het logboek (`TRAAG vraag ...`). Dat is de plek om te kijken als iemand
weer meldt dat het hapert.

**Waar de tijd zat bij het zoeken van diensten (20-09-2026)**

Het logboek van een speler met 46 kaarten op een tweede schijf gaf
`duty:list: 64249 ms`. Gemeten met `scripts/probe-dienstentijd.ts` kostte het
zoeken hier op elke kaart ongeveer 1,84 s -- ook op Grundorf met 112 ritten, dus
het lag niet aan de kaart. De uitsplitsing wees het aan: het zoeken zelf kostte
1 ms en het kiezen van een bus 1695 ms voor acht diensten.

`pickVehicleForDuty` liep voor elke dienst álle bussen langs en vroeg per bus
welk wagenpark het beste paste. De wagenparken staan per voertuigmap in de index
-- honderdtweeënzestig bussen uit één pakket delen dezelfde .hof-bestanden --
dus dezelfde vergelijking gebeurde honderden keren. Nu wordt het antwoord per
map onthouden, en over de acht diensten van één rooster heen
(`maakBusGeheugen()`). Zoeken over alle twaalf kaarten: 22,5 s -> 1,5 s.

Twee dingen die daarbij hoorden:

- **De kaartenlijst las elke dienstregeling in** om er een naam en een aantal
  omlopen uit te halen: 29,5 s bij die speler. Omlopen staan in de
  `.ttl`-bestanden, dus `readMapOverview()` laat elke `.ttp` dicht. Zelfde
  antwoord op alle kaarten, 0,86 s -> 0,17 s, en daarna staat het in de cache.
- **De wagenparkscan stond alleen in het geheugen** en werd dus elke start
  opnieuw gedaan (14,4 s bij die speler). De busindex en de .hof-lijst staan nu
  in de schijfcache, met de vingerafdruk van `Vehicles` als sleutel: 604 -> 47 ms
  en 565 -> 80 ms, met dezelfde uitkomst (`probe-wagenpark`).

**Het logboek van een "crash" (20-09-2026)**

Een speler meldde dat de app crashte en stuurde zijn logboek: 28 kaarten op een
tweede schijf, geen enkele `FOUT`-regel, en midden in het logboek een herstart.
Daar viel niets aan te zien -- er stond geen regel bij netjes afsluiten, dus een
crash en een gewone afsluiting zien er hetzelfde uit. Die regel staat er nu wel
(`afsluiten` bij `will-quit`): ontbreekt hij vóór een start, dan is de app
omgevallen.

Wat er in dat logboek wél stond, verklaart de klacht waarschijnlijk zonder
crash: `TRAAG vraag hof:offerFor: 18990 ms`. Die vraag komt bij **elke bus die
je in het busmenu aanwijst**, stond in het hoofdproces, en rekende zijn eigen
plan uit zonder de bewaarde lijst wagenparkbestanden -- dus met een lezing van
alle .hof van schijf erbij. Negentien seconden lang reageert er dan niets,
Windows zet "reageert niet" in de titelbalk, en wie dan op het kruisje drukt
heeft een app die "crasht". Nu doet de werker het, uit hetzelfde plan als de
lijst: 580 ms, en het scherm blijft intussen leven.

Drie dingen die daarbij hoorden:

- **De schijfcache van de bussen keek naar de verkeerde dingen.** `wagenpark()`
  en `wagenparkBestanden()` bewaarden hun uitkomst onder `vingerafdruk()` uit
  `kaartcache.ts`, en die kijkt naar `tile_*.map` en `global.cfg` -- bestanden
  die in `Vehicles` niet bestaan. De afdruk was daar dus een vaste waarde: de
  cache sloeg altijd aan, ook nadat er een bus bij was gezet of een .hof was
  neergelegd. `hofTool.wagenparkAfdruk()` kijkt naar de mappen zelf; bewezen met
  `probe-afdruk.ts`.
- **Wie op een gesloten werker wachtte, wachtte voor altijd.** `vergeetKaarten()`
  sluit beide werkers, en de vragen die op dat moment openstonden kregen nooit
  antwoord -- het scherm houdt dan zijn wachtdraaitje aan. Ze krijgen nu een
  "niet gelukt" en vallen terug. Let op het detail dat dit eerst fout ging: de
  wachtenden hangen aan de werker zelf, niet aan zijn soort, want een gesloten
  werker wordt meteen vervangen en zijn afscheidsbericht komt pas daarna.
- **De werker vertelt nu waar zijn tijd heen gaat.** `hofaanbod` was bij die
  speler 27724 ms en daar viel niet uit af te lezen wat traag was. Hier staat er
  nu bij: `159 bestemmingen 267 ms, 459 wagenparken 563 ms, vergelijken 55 ms`.

**Wat er in het hoofdproces mag staan, en wat niet**

- Het hoofdproces is enkeldradig. Zolang daar iets loopt tekent er geen venster,
  beweegt de overlay niet en wacht elke klik. Drie plekken stonden daar te lang:
  `tasklist` (89 ms per keer, stond op elke 1,5 s in het opstartvenstertje, nu op
  5 s), het wagenparkonderzoek hierboven, en het zoeken naar de OMSI-map.
- Dat laatste: `C:\` aanwijzen op het welkomstscherm kostte **12465 ms** om
  daarna te zeggen dat er niets gevonden was. De mappen die Windows voor zichzelf
  houdt worden nu overgeslagen en na anderhalve seconde houdt het op; `C:\` doet
  er 485 ms over, en alle zes manieren om dezelfde installatie aan te wijzen komen
  er nog steeds op uit (`probe-omsimap.ts`).
- `omsi:check` -- de knop "opnieuw kijken" en de eerste keer opstarten -- las in
  het hoofdproces elke dienstregeling van elke kaart in. Dat gaat nu langs de
  werker, met `overzicht()` en `voertuigen()`. Gemeten met `probe-check.cjs`:
  twaalf kaarten en 342 bussen, dezelfde namen en aantallen omlopen, en het
  hoofdproces staat onderwijl nooit langer dan 14 ms stil.
- Wat géén probleem bleek: de overlay stuurt tien keer per seconde een heel beeld
  door de IPC met de dienst erin. Vier ritten en 124 haltes is 5,1 kB en het wegen
  kost 0,01 ms per beeld (`probe-framegrootte.ts`). Zoek haperingen daar niet.

**De overlay is altijd donker**

Hij volgde de stand van Windows, net als het opzetscherm. Maar wat in een overlay
licht is, is geen vel op een scherm maar een lamp op je voorruit, en hij is
doorzichtig: de kleuren zijn op een donkere ondergrond gerekend. Gemeten met
Windows op licht: overlay `#141a26`, opzetscherm `#f7f8f8`
(`probe-overlaydonker.cjs`). De lichte regels in `theme.css` hangen daarom alleen
aan `.setup`.

**Beweging**

Er stond een regel dat het vel opkomt als je van stap wisselt, en die deed het
niet: het vel blijft tussen de stappen door hetzelfde element, dus speelde de
animatie precies één keer af, bij het openen van de app. Met een sleutel per stap
-- een sleutel op de stap plus de diepte van de kruimels -- komt hij werkelijk
opnieuw ter wereld. Gemeten in het draaiende venster met `document.getAnimations()`: bij een
stapwissel lopen `vel-op` (180 ms), `rij-op` (170 ms, laatste klaar na 346 ms) en
het streepje (260 ms); bij het aanwijzen van een andere dienst binnen dezelfde
stap alleen `route-tekenen` en géén `vel-op` -- de lijst waar je muis in staat
hoort niet onder je handen opnieuw op te komen (`probe-beweging.cjs`,
`probe-velsleutel.cjs`).
- Richting: graden, noord is nul, met de klok mee. Recht:
  `eind = start + lengte · (sin θ, cos θ)`. Bocht: `θ = lengte / straal`, lokaal
  `(R(1−cos t), R sin t)`, positieve straal buigt naar rechts.
- **Er bestaan twee veldindelingen naast elkaar**, ook binnen dezelfde
  tegelversie: de meeste blokken noemen de vorige én de volgende spline, een deel
  alleen de vorige. In Rheinhausen staan ze door elkaar. `parseSpline()` kiest per
  blok op inhoud (een koppelveld is een heel getal, een lengte is nooit negatief).
- Proef op de som (`probe-geo.ts`): het eindpunt van elke spline valt op het
  beginpunt van de volgende. Kijk naar het aantal **boven 1 m**, niet alleen naar
  de mediaan: die stond in Spandau op 0,000 terwijl een op de vier koppelingen
  72 m verkeerd lag. Nu hooguit 16 per kaart.

**Banen: soort, plek, richting**

- `.sli`: `[path]` en `[path_2]` (één veld extra; de DDR-straten van Spandau
  hebben alleen die). Velden: soort verkeer (0 weg, 1 voetganger, 2 spoor),
  zijwaartse afstand (rechts positief), hoogte, breedte, richting.
- `.sco`: `[path]` met x, y, hoogte, richting, straal, lengte, twee hellingen,
  soort verkeer, breedte, rijrichting, knipperlicht.
- Rijrichting: 0 met de baan mee, 1 ertegenin, 2 beide. Nagemeten tegen de
  routes die OMSI zelf in `.ttr`-bestanden rijdt (`probe-tracks.ts`): Hamburg109
  14.830 banen mee en 0 tegen; TH_Wald 39.593 tegen 4, maar alleen mét `mirror`.
- Objecten draaien met de klok mee en de baanrichting telt op bij die van het
  object (`probe-objjoin.ts`).
- Op de naam filteren werkt niet: Thüringer Wald gebruikt achthonderd
  verschillende splinebestanden.

**Situaties en het startscherm (`situation.ts`, `startup.ts`)**

- Een situatie kan `[TT_active]` dragen (vlag: er wordt met een dienstregeling
  gereden, met een lege regel erachter) en per voertuig `[settimetable]`. Dat
  laatste blok heeft zes velden: lijnbestand, naam van de omloop, volgnummer van
  de rit in die omloop, halte, een vlag, en de afwijking op de dienstregeling in
  seconden. Afgelezen aan de twee situaties die OMSI zelf schreef en nagerekend
  tegen de dienstregeling (`probe-settimetable.ts`): in het Spandau-scenario is
  veld 3 elf, en rit 11 van omloop "Mo-Fr 6" vertrekt om 14:04 terwijl de klok in
  het bestand op 14:06 staat.
- `options.cfg` is **gewone tekst in de Windows-codering met CRLF**, geen UTF-16.
  Lees en schrijf hem als losse bytes (`latin1`), dan blijven umlauten heel.
  `[last_map]` bepaalt op welke kaart het startscherm opent.
- Het startscherm biedt bovenaan "Last Situation" aan; dat is
  `maps\<kaart>\laststn.osn`. OMSI schrijft dat bestand zelf bij het afsluiten.
- Weer staat in `<situatie>.osn.owt`, UTF-16, zelfde blokindeling: `[fog]` (zicht
  in meters, helderheid), `[wind]`, `[temp]`, `[press]`, `[clouds]` (textuurnaam
  of -1, wolkenbasis in meters), `[precip]` (eerste veld 0 droog, 1 nat) en
  `[groundwet]`. De vijf keuzes in de app komen uit het weer dat OMSI meelevert.

**De instellingen en toetsen van OMSI (`omsiOptions.ts`, `omsiKeys.ts`)**

- `options.cfg` en `Inputs\keyboard.cfg` zijn **gewone tekst in de
  Windows-codering met CRLF**. Lezen en schrijven als losse bytes (`latin1`)
  houdt umlauten heel. Beide gaan byte-identiek heen en weer; zie
  `probe-gamecfg.ts`, dat ook elke vlag aan- en uitzet en controleert dat de
  blokken daarna weer gelijk zijn.
- **Bij een vlag telt alleen of het blok er staat.** `[no_collision]` met een
  lege regel eronder betekent: botsingen uit. Staat het blok er niet, dan
  staan ze aan. Tot 15 september dacht de app het omgekeerde (leeg blok = uit),
  waardoor hij vlaggen verkeerd toonde en ze niet kon uitzetten. Het bewijs zit
  in de presets die OMSI meelevert (`option_presets\*.oop`): in "PC 2006" t/m
  "PC 2013" en de Hamburg-presets ontbreekt `[no_collision]`, en
  `[no_stencilbuffer]` staat alleen in "Best Performance", niet in "Best
  Quality". De TH-Wald-presets zetten wel alle botsingen uit; wie die laadde,
  rijdt zonder. Een vlag aanzetten schrijft het blok met een lege regel, zoals
  OMSI; uitzetten haalt het blok weg.
- **De spiegelingen wegen in de bus het zwaarst.** `[performance_realreflexions]`
  (`economy` of `full`) tekent spiegels en ruiten; bij Luc gaf `full` in de bus
  ongeveer 30 fps tegen bijna 60 erbuiten. Daarom staan ook
  `[performance_minObjSizeRefl]`, `[performance_dyn_redrefl]` (eerste waarde:
  onder deze fps kort OMSI de spiegelingen zelf in) en `[no_rain_refl]` in de
  app en in de drie voorinstellingen.
- Tussen de blokken staan kopregels (" GRAPHICS -------"). Die horen bij niets;
  de lezer stopt op een regel met `-----`.
- `keyboard.cfg` heeft twee secties met samen 128 `[entry]`-blokken van drie
  regels: handeling, scancode, en een getal met de modificatietoetsen. **Bit 2 is
  Shift, bit 4 is Ctrl** -- af te lezen aan de IBIS-cijfers (Ctrl+numeriek) en aan
  "Quit OMSI" op Ctrl+Q. Bit 1 zit op gas, rem, sturen en nog wat; wat dat
  betekent is niet nagemeten, dus de app laat die bit staan en verandert alleen
  Shift en Ctrl.
- Scancodes zijn set 1; toetsen die met een voorvoegsel komen (pijlen, numeriek
  Enter, rechter Ctrl) staan er met 128 bij op. `shared/scancodes.ts` vertaalt de
  `event.code` van de browser naar dat nummer.
- De namen komen uit OMSI zelf: `Inputs\ENG.kyb` (130 toetsen) en
  `Languages\<taal>_key_game.olf` en `_key_veh_gen.olf` (samen 178 handelingen,
  genoeg voor 127 van de 128 bindingen).
- `gamectrler.cfg` heeft per apparaat `[ctrl]` (naam, en of OMSI het gebruikt),
  `[axis]`, `[buttons]` en `[FFScale]`. **`[axis]` is altijd zestien getallen**:
  acht paren, één per as in de volgorde waarin Windows ze aanlevert. Het eerste
  getal is wat de as doet: -1 niets, 0 sturen, 1 gas, 2 rem, 3 koppeling, 4 gas
  en rem samen. Dat is af te lezen aan de keuzelijst die OMSI er zelf bij zet
  ("<none>@Steering@Throttle@Brake@Clutch@Throttle/Brake") en bevestigd door de
  bestanden van de gebruiker: zijn pedalenset heeft 1, 2 en 3 op drie assen en
  zijn stuurbase 0 op de eerste. Het tweede getal hoort bij de kromme, de
  omkeerknop en "narrowed" uit OMSI's eigen scherm; welk bit wat is, is niet
  nagemeten, dus dat getal blijft staan.
- `[buttons]` is een aantal gevolgd door dat aantal paren (handeling, getal); de
  plaats in de lijst is het knopnummer. De handelingen zijn dezelfde namen als in
  `keyboard.cfg`.
- **Namen niet bijsnijden.** Eén apparaat heet "CH FLIGHT SIM YOKE USB " met een
  spatie, een ander eindigt op byte 0x90. Daarmee herkent OMSI ze; op het scherm
  halen we die tekens weg, in het bestand niet.

**Routes (`track.ts`, `routing.ts`)**

- Niet alleen treinen hebben een `.ttr`: Grundorf 3/3 ritten, TH_Wald 165/165,
  Hamburg109 113/124. Rheinhausen heeft er geen. Een `[track_entry]` is: id van
  spline of object in de tegel, volgnummer van de baan daarin (stoepen tellen
  mee), volgnummer van de tegel in `global.cfg`, volgnummer in de tegel, lengte.
- Een `.ttr` wordt niet bijgewerkt als de kaart verandert; hij wordt alleen
  gebruikt als alle banen gevonden zijn, alles naadloos aansluit en elke halte
  binnen 15 m ligt. Anders plant `LaneNetwork`.
- Planner tegen OMSI's eigen routes (`probe-routing.ts`): mediaan 100% van de lijn
  binnen 5 m in TH_Wald, HamburgLi20, Grundorf. Gevonden haltestukken: Spandau
  1392/1474, Rheinhausen 948/972, HamburgLi20 4116/4209. Wat mist valt terug op
  een rechte lijn.
- Losse rijstrookuiteinden koppelen aan een evenwijdige rijstrook binnen 12 m is
  nodig (zonder: Spandau 978, TH_Wald 878). Rijstrookwissels zijn geprobeerd en
  weer verwijderd: +9 stukken, twee keer zo traag.

---

## 5. Openstaand werk

### 5.0 Waar het nu staat (20-09-2026)

Vier dingen zijn deze ronde vastgelegd: `f0e29d4` (drie plekken waar het
hoofdproces stond te wachten), `113160a` (carrière en vrij rijden in de nieuwe
wereld), `a2bb62d` (de bus onder de weg, plus de hof-vraag, de terugknop en de
donkere overlay), `764621c` (de staat van dienst en de kilometerteller).

**Halverwege blijven liggen: de icoontjes.** De set staat er en is nagekeken, maar
hij hangt nog nergens:

- `src/renderer/src/Icoon.tsx` — 23 vormen, getekend en beoordeeld op zestien
  pixels. `Setup.tsx` haalt zijn stapicoontjes er al uit; de oude `PADEN` is weg,
  dus er is nog maar één set.
- `scripts/probe-iconen.ts` — zet de set op een vel in vier maten, licht en donker.
- `scripts/schermafdruk.cjs` — maakt van een HTML-bestand een plaatje; algemeen
  bruikbaar, het voorbeeldpaneel legt geen lokale bestanden vast.

De veertien nieuwe vormen -- weer, dagdeel, de koppen van het overzicht -- worden
dus nog door niemand getoond.

**Wat er nog moet gebeuren** is ze inbouwen waar ze voor bedoeld zijn. Die plekken
zijn uitgezocht en het zijn er drie:

1. **De weerchips op de ritstap** (`App.tsx`, bij `WEATHER_KINDS.map`) — nu kale
   tekst. Iconen: `weerHelder`, `weerZomer`, `weerBewolkt`, `weerRegen`,
   `weerMist`.
2. **De dagdeelchips op de dienststap** (`App.tsx`, bij `TIME_WINDOWS`) — ook kale
   tekst. Iconen: `dagHele`, `dagOchtend`, `dagMiddag`, `dagAvond`, `dagNacht`.
3. **De koppen van de staat van dienst** (`Profiel.tsx`, de `<h4>`'s in elk
   `.profiel-vak`) — iconen: `stipt`, `stuur`, `record`, `plek`, `bus`, `duty`,
   `licence`, `logboek`. Er is ook `kaartje` voor de tegel met de verkochte
   kaartjes, als je de tegels ook iconen wilt geven; dat is nog niet besloten.

De chips hebben nog geen ruimte voor een icoon in `setup.css` (`.regelaar-chips
button` is `padding: 5px 11px`, tekst alleen). Daar moet een `display:flex` met
een `gap` bij, en een maatklasse voor het icoontje van een pixel of veertien.

**Verder open:**

- **In vrije modus zelf ritten aan je dienst toevoegen.** De gebruiker vroeg dit
  expliciet ("in vrije modus is er selectie mogelijk per lijn en kunnen handmatig
  meer ritten worden toegevoegd") en het is nooit gebouwd. De ritstap van vrij
  rijden is nu een formulier (waar, wanneer, weer) en kent geen ritten.
- **Versie 0.3.2 staat nog niet op GitHub.** (0.3.0 evenmin: die is wel getagd,
  maar nooit uitgegeven. De notities in `uitgaven/0.3.0.md` dekken dus nog niet
  wat er na die tag bij kwam -- de spiegelingen, de staat van dienst, het
  logboek, de starthub en het werk hierboven aan de snelheid.) Het uitgeefscript werkt; `gh` is in
  de schil van de assistent aangemeld maar niet in het PowerShell-venster van de
  gebruiker (vermoedelijk verhoogd, dus een andere sessie en geen toegang tot de
  sleutelring). Commando:
  `node scripts/uitgeven.mjs 0.3.2 --publiceer --notities uitgaven/0.3.2.md`.
  De Discord-aankondiging staat klaar in
  `C:\OMSI Enhancer Discord\uitgaven\0.3.0.md` maar de links daarin zijn dood
  tot de release bestaat. **Publiceren doet de gebruiker zelf.**
- **De kilometerteller is niet in het spel bevestigd** — zie §4.
- **Twee getallen op hetzelfde scherm spreken elkaar tegen.** Op het remisescherm
  zeggen de tegels "0 van 2 bestemmingen" (dat gaat over je dienst) terwijl het
  venstertje "1 van de 87 op deze kaart" zegt. Allebei kloppen ze voor hun eigen
  vraag; naast elkaar lezen ze verkeerd. `duty:yards` is nog dienstgebaseerd.
- **De vergunningenlijst is nooit met een echte vergunning gezien.** Die verschijnt
  pas als je een examen werkelijk rijdt en haalt; de probe komt niet verder dan
  het examenscherm. De code volgt dezelfde logica als het oude `CareerPanel`.
- **Vrij rijden kan geen remise kiezen.** `duty:yards` heeft een dienst nodig, en
  die is er niet; het remisescherm toont daar alleen de tegel om er een bij te
  halen.

### 5.1 Wegennet en routes — opgelost, met twee losse eindjes

Het wegennet was niet te dun omdat kaarten geen splines gebruiken, maar omdat we
de helft niet lazen (`[spline_h]`, `[path_2]`, objecten met rijbanen) en Spandau
op het verkeerde tegelraster lag. Haltes binnen 25 m van een weg: nu 93–100% op
elke kaart (was 2–93%). Routes volgen de weg, zie §4.

Nog open:

- **Trams en stadsbanen rijden over de weg.** Lijn 5 in Rheinhausen is een
  stadsbaan zonder `.ttr`; de planner kent alleen wegrijstroken en neemt de straat
  naast het spoor. Oplossing: ook een spoornet bouwen en per rit kiezen welk net
  de haltes het best bedient.
- **Een stuk dat op de richting vastloopt, gaat over hetzelfde net zonder
  richtingen** (sinds 15-09-2026). Op Rheinhausen liggen Markuskirche en
  Herrenholz op 3,3 en 0,9 m van een rijstrook -- de straat is er dus -- en toch
  kwam er geen route uit: wij lezen de richting van een strook ergens verkeerd.
  `LaneNetwork.bothWays()` bouwt daarom eenmalig hetzelfde net met elke strook
  beide kanten op, en `routeStops` valt daarop terug. Een route die ergens tegen
  de richting in loopt is beter dan een kaarsrechte lijn door de huizen. Kosten:
  60-95 ms per kaart, alleen als het nodig is. Rheinhausen 17 -> 12 rechte lijnen,
  HamburgLi20 62 -> 30, Hamburg109_2 52 -> 42; `scripts/probe-gaps.ts` telt het.
- **Wat overblijft zijn haltes die los van de weg staan** (12 van 333 op
  Rheinhausen). Die staan echt ver van elke rijstrook: "Hauptbahnhof" 4457581
  staat op tile_5_-4, een tegel met alleen tramrails, 204 m van de dichtstbijzijnde
  rijstrook. Verder reiken bij het aanhaken zou helpen, maar haakt ook aan
  straten die niets met de halte te maken hebben; nog niet gedaan.
- **Onvolledig geïnstalleerde kaarten** zoals `Vienna_2005_Line_24A` hebben geen
  enkele tegel; de kaart blijft leeg. Dat is juist, maar er staat nog geen
  uitleg bij in de interface.

### 5.2 Wensen van de gebruiker voor de overlay

Gebouwd:

- **Het venster is niet groter dan zijn inhoud** (sinds 15-09-2026). Het lag
  doorzichtig over het hele scherm, en alles wat zo'n venster beslaat moet
  Windows bij elk spelbeeld opnieuw over OMSI heen mengen -- Luc merkte daar
  haperingen van. `overlay.tsx` meet het vak waar de elementen in staan (breedte
  uit de indeling, hoogte uit de inhoud, een `ResizeObserver` per element) en
  geeft dat door met `overlay:bounds`; het hoofdproces zet het venster precies zo
  groot en de pagina schuift zichzelf op met de hoek van dat vak, zodat alles op
  zijn eigen plek op het scherm blijft staan. In de bewerkstand wordt het weer
  schermvullend, anders kun je nergens heen slepen. Van 100% naar ~8% van het
  scherm; nagekeken met `scripts/probe-overlaybox.cjs`.
- **Minder werk per beeld.** De dienst kwam elke tel opnieuw door de brug, wat
  voor React een andere dienst is: `useStable` in `overlay.tsx` houdt dezelfde
  kopie vast zolang de ritten gelijk blijven, zodat de kaart zijn rekenwerk laat
  staan. Het hoofdproces stuurt niets meer als er niets veranderd is, en de
  verversing is te kiezen in de sleepbalk (`OVERLAY_RATES`: vloeiend 100 ms,
  rustig 200 ms, zuinig 500 ms; standaard rustig, bewaard in `settings.json`).
  **Let op**: wat het spel zelf kwijt is aan het mengen gebeurt in `dwm.exe` en
  valt hiervandaan niet te meten. `scripts/probe-overlaycost.cjs` meet alleen ons
  eigen verbruik; of de hapering echt weg is, weet alleen Luc in het spel.

- **De kaart tekent pas een route als de IBIS is ingetoetst** (`status.reportsStops`
  plus een halte-index), en dan alleen de rit die nu gereden wordt. Daarvoor staat
  de eerste halte van de rit in beeld met `ovl.mapWaiting`.
- **De kaart rijdt met de bus mee.** OMSI geeft geen positie door, maar wel de
  volgende halte en de kilometerteller. Op het moment dat de halte-index
  verspringt onthoudt `overlay.tsx` de stand; `RouteMap` legt de haltes op de
  routelijn (`trackAlong`, elke halte pas voorbij de vorige, want een rit komt
  vaak twee keer door dezelfde straat) en zet de bus zoveel meter over de route
  verder, nooit voorbij de volgende halte. Pijl in rijrichting, `ovl.busHere`
  eronder.
- **Slepen of zoomen geeft zes seconden rust**, dan veert de kaart terug.
  Centreerknop (`ovl.centre`) zet hem meteen terug. De kaart en de knoppen dragen
  `data-hit`, zodat ze in de overlay de muis vangen.
- Nagekeken met `scripts/screenshotNav.cjs` (nepframes, eigen overlayvenster,
  raakt `live.json` niet aan) op Rheinhausen en Berlin-Spandau.

**Busplek en dienstregeling uit het geheugen van OMSI** (sinds 15-09-2026). De
plugin leest in het proces van `Omsi.exe` het voertuig van de speler: tegel
(`+0x74`), positie binnen de tegel (`+0x04`), draaiing (`+0x50`) en wat het
dienstregelingsmenu erop zette (lijn/omloop/rit `+0x660..+0x66c`, volgende halte,
vertraging), plus de namen uit `TTimeTableMan`. Adressen uit OmsiHook
(space928/Omsi-Extensions), alleen geldig voor **2.3.004**. Let op: de
versie-informatie van `Omsi.exe` zegt 2.2.032, ook bij 2.3.004; de plugin telt
daarom de versietekst in het programma zelf. Andere versie → niets lezen, de app
valt terug op de IBIS. `src/core/vehicle.ts` rekent om naar kaartmeters en stelt
zelf vast welke Direct3D-as het noorden is (de lezing die op een rijstrook valt).
**Nog niet in het spel nagekeken**: de as, het teken van de draaiing, de eenheid
van de vertraging en of `tripName` een pad of een naam is. Kijk in `live.json`
onder `mem` zodra een bus staat. Proeven: `scripts/probe-vehicle.ts` (kern) en
`scripts/screenshotLive.cjs` (overlay met rijdende nepbus).

**De rit die aan de beurt is, is de eerste die nog niet is aangekomen** (sinds
15-09-2026). `describeLive` pakte de laatste rit die al vertrokken was, en die
bleef staan nadat hij was aangekomen: stond de bus op het eindpunt te wachten op
de volgende rit, dan lag de gereden route nog op de kaart en hoorden de
instructies bij een rit van een half uur geleden. Nu geldt overal dezelfde regel
-- wat in OMSI gekozen is gaat voor, anders de eerste rit met `arrival >
clockMinutes` -- en `overlay.tsx` rekent hem niet meer zelf na. Proef:
`scripts/probe-legswitch.ts`, zes standen inclusief "OMSI rijdt iets dat niet in
de dienst zit".

**Bij het kiezen van een vervolgrit telt de lijn, niet het aantal ritten**
(sinds 15-09-2026). `pickNext` woog per rit: stonden er op een knooppunt twintig
vervolgritten van de eigen lijn en een van een andere, dan hadden die twintig
samen twintig lootjes tegen de zes van die ene. Nu wordt eerst de lijn gekozen en
dan pas de rit. Rheinhausen ging van 23% naar 39% van de overgangen op een andere
lijn, TH_Wald naar 67%. Hohenkirchen blijft op 9%, en dat is de kaart: van de 569
eindpunten bieden er 18 een tweede lijn, en er zijn maar twee haltes waar meer
dan een lijn vertrekt. Proef: `scripts/probe-variety.ts`.

**De navigatie staat op 25 m zodra de bus stapvoets rijdt** (sinds 15-09-2026).
Onder de 30 km/u vast op 25/90 meter per punt -- de schaalbalk van de navigatie
mikt op negentig punten, dus dat leest als "25 m" -- en daarboven vloeiend open
tot 2 m per punt bij 80 km/u, zonder sprong op de grens. `liveZoom` in
`RouteMap.tsx`; proef: `scripts/probe-zoom.cjs`.

**De vormtaal** (sinds 15-09-2026). Luc vond de oude interface op een sjabloon
lijken; na een ronde ontwerpen op canvas is dit eruit gekomen:

- **Glas op een lijnennet.** Vlakken zijn doorschijnend wit met een lichte rand
  (`--glas`, `--glas-rand`, hoeken 22); erachter ligt `Backdrop.tsx`, een
  routekaart van vier lijnen en zeven knooppunten op drie procent wit. Glas
  heeft iets nodig om op te liggen -- zonder iets erachter is doorzichtig
  hetzelfde als grijs. Het net staat in `main.tsx`, achter elk scherm.
- **Kleur betekent twee dingen, en verder niets.** Geel (`--lijn`) is de lijn:
  het nummer op de bus en de knop die de dienst afmaakt. Rood, groen en blauw
  zijn de tijd: te laat, op tijd, te vroeg, met de grens op een minuut in
  `src/shared/status.ts`. Die ene bron voedt zowel het rijscherm als de overlay,
  zodat er niet op het ene scherm groen en op het andere rood staat. Alles wat
  vroeger ook kleur had -- de stip "dienst loopt", de rijstijl, de buspijl op de
  kaart -- is nu wit.
- **Manrope**, meegeleverd via `@fontsource/manrope` (het programma mag niet van
  het internet afhangen). De losse schrijfmachineletter is eruit: cijfers staan
  in Manrope met `font-variant-numeric: tabular-nums`, dus kolommen dansen niet.
- **De navigatie houdt zijn afspraken**: de Duitse H-bordjes (geel vlak, groene
  ring en H -- een echt object, geen statuskleur), de zoom op 25 m onder de
  30 km/u (`liveZoom`), en de gereden route verdwijnt achter je.
- De ontwerpbestanden staan in `design/`; het canvas erbij is een Artifact.

**Opnieuw kijken wat er geinstalleerd is** (sinds 15-09-2026). Kaarten en bussen
komen als een map de OMSI-map in en niets meldt dat aan de app, die ze alleen
bij het starten leest. De knop "Controleer geinstalleerde mappen" in de balk
boven het dienstscherm roept `omsi:check` aan: dat leegt alle kaartcaches (anders
blijft een bijgewerkte kaart de oude), leest `maps/` en `Vehicles/` opnieuw, en
vergelijkt met `installed.json` bij de gebruikersgegevens. Bussen worden per map
geteld, niet per `.bus`, anders meldt hij dertig aanwinsten voor een pakket. De
eerste keer valt er niets te vergelijken; dan zegt hij alleen wat er staat.
Proef: `scripts/probe-installed.cjs`, die doet alsof er iets bij komt door
`installed.json` aan te passen -- in de spelmap wordt niets veranderd.

**Tijdens het rijden toont de app zelf alleen de kern** (sinds 15-09-2026).
Zodra de dienst gestart is komt `RunningDuty.tsx` in beeld in plaats van de
dienstkaart: lijn, route, vertrektijd, de halte waar je begint en de richting,
plus of OMSI er al is. De hele dienstkaart en de routekaart (`RouteViewer` uit
`DutyMap.tsx`) zitten achter een knop; annuleren en afronden staan ernaast.
Nagekeken met `scripts/probe-running.cjs`, dat het scherm uit de bron bouwt en de
knoppen ook echt indrukt.

In de overlay: het dienstpaneel toont "kies je dienst in OMSI" (lijn, omloop,
vertrektijd) tot die in het menu gekozen is; de kaart toont de bus altijd en de
route pas daarna, en rijdt mee als een navigatiesysteem (rijrichting boven,
glijdend tussen metingen, uitzoomen met de snelheid).

Nog niet gebouwd:

1. **Knop in de overlay zelf om de indeling aan te passen** — "een knopje met pas
   layout aan". Nu kan dat via de app of Ctrl+Alt+O. Vertaling: `ovl.layout`.
2. **Het infoscherm toont eerst wat er ingetoetst moet worden** (lijn + route uit
   het IBIS-plan), en schakelt om zodra de IBIS gevuld is. Teksten:
   `ovl.ibisTitle`, `ovl.ibisWaiting`, `ovl.ibisNoSupport`.
3. **Situatie klaarzetten** — gebouwd. "Dienst starten" schrijft de situatie en
   start daarna pas het spel; de losse knop is weg.

**Nog in het spel na te kijken.** Dat het startscherm van OMSI de dienst al
geselecteerd heeft, is op bestandsniveau bewezen (`probe-startup.ts`) maar niet
met eigen ogen gezien: schermafdrukken van OMSI maken lukt niet vanuit deze
omgeving ("The handle is invalid" -- er is geen bureaublad om te grijpen). Wat er
nog gekeken moet worden zodra iemand voor het scherm zit:

- opent OMSI op de goede kaart met de situatie al aangewezen?
- staat in het dienstregelingsmenu de lijn, de omloop én de rit goed?
- klopt de vijfde waarde van `[settimetable]` (wij zetten 1) en de zesde (0)?

### 5.3 Kleiner grut

- (Opgelost op 20-09-2026.) Het zware werk stond in het hoofdproces en legde de
  hele app stil; zie "Het hoofdproces doet één ding tegelijk" in §4.
- De drie standen van het overlay-paneel zijn nog niet naast elkaar bekeken: er
  staat een oude `live.json` op de machine van de gebruiker waarin de dienst als
  uitgereden staat, en dan valt het paneel in alle standen terug op één regel.
- Builds van vóór de single-instance lock (Setup en draagbaar tot en met 15
  september 00:18) houden zich niet aan dat slot. Draait zo'n oude versie nog,
  dan kan een nieuwe er gewoon naast starten. Eenmalig de oude afsluiten en de
  nieuwe Setup installeren lost het op.

---

## 6. Hoe je iets nakijkt zonder de gebruiker lastig te vallen

Er staan probes in `scripts/`:

- `probe-geo.ts` — haltes, wegen, snelheid, en de aansluitingsproef.
- `probe-roads.ts` — afstand van haltes tot de dichtstbijzijnde weg.
- `probe-objjoin.ts` — draairichting van objecten, aan de aansluiting gemeten.
- `probe-tracks.ts` — routes uit `.ttr`: aansluiting, haltes, rijrichting.
- `probe-routing.ts` — de routeplanner, en hoe dicht hij bij OMSI's routes blijft.
- `render-roads.ts`, `render-area.ts` + `rasterize.cjs` — het wegennet of een
  uitsnede met rijrichtingen als plaatje, om een haperende plek te bekijken.
- `screenshotMap.cjs` — de kaart in de echte app op een gekozen kaart, met
  tijdelijke gebruikersmap, plus framtijden van slepen en zoomen.
- `probe.ts`, `probeChain.ts` — dienstregeling en ketens.
- `probe-settimetable.ts` — wat de velden van `[settimetable]` betekenen,
  gemeten aan situaties die OMSI zelf schreef.
- `probe-startup.ts` — zet een dienst klaar in een nagebouwde spelmap en leest
  terug of de situatie, `laststn.osn` en `[last_map]` kloppen.
- `probe-exam.ts` — hoe lang een examenrit per lijn duurt.
- `probe-gamecfg.ts` — of `options.cfg` en `keyboard.cfg` byte-identiek heen en
  weer gaan, of elke vlag goed aan en uit gaat (aan = het blok staat er), en of
  een ontbrekend blok onder de juiste kop terechtkomt.
- `probe-controllers.ts` — of `gamectrler.cfg` byte-identiek heen en weer gaat,
  en wat er per apparaat aan assen en knoppen staat.
- `probe-rebind.cjs` — een toets opnieuw toewijzen via het scherm, en kijken of
  het in keyboard.cfg landt. Zet zijn kopie daarna terug.
- `screenshotGameSetup.cjs` — de schermen met de instellingen, de toetsen en de
  controllers, plus de wizard.
- `prepare-real.ts` — zet één dienst klaar in de échte spelmap, om in OMSI zelf
  te kijken of het startscherm klopt.
- `screenshotModes.cjs` — loopt de schermen langs: chauffeur, modus, en de drie
  modi. Eigen gebruikersmap, raakt de spelmap niet aan.
- `screenshotExam.cjs` — het rijexamen van routekeuze tot examenrit.

Uit de ronde van september 2026, op volgorde van waar ze over gaan:

- `probe-wegdek.ts` — per halte: vindt `spawnAtStop` een plek, kent die plek een
  wegdekhoogte, en waarom valt hij anders terug op het maaiveld.
- `probe-viaduct.ts` — alleen de haltes waar de weg hoog boven het maaiveld ligt,
  met wat er verder omheen ligt. Dit is de probe die de achtmetergrens onderuit
  haalde; draai hem opnieuw als je aan `spawn.ts` komt.
- `probe-bushoogte.ts` — onze hoogte naast die van de bus die OMSI zelf achterliet.
- `probe-baanhoogte.ts` — of objecthoogtes wereldhoogtes zijn, gemeten aan de
  aansluitingen met splines.
- `probe-splinehoogte.ts`, `probe-haltehoogte.ts`, `probe-hoogteverloop.ts` — de
  drie hypothesen die het niet waren. Ze staan er zodat niemand ze opnieuw
  bedenkt.
- `probe-hoftijd.ts` — wat het lezen van alle wagenparken kost, koud en warm.
- `probe-hofvraag.cjs` — komt het venstertje als de bus de kaart niet kent, staat
  de tegel "Wagenpark toevoegen" er, en is er een terugknop.
- `probe-modi.cjs` — loopt carrière en vrij rijden stap voor stap af en meldt per
  stap wat er staat. Eigen gebruikersmap; er wordt niet op START gedrukt.
- `probe-profiel.cjs` — de staat van dienst met een **kopie** van een echt
  logboek, zodat het profiel van de gebruiker onaangeroerd blijft.
- `probe-beweging.cjs`, `probe-velsleutel.cjs` — welke animaties er werkelijk
  lopen, uit `document.getAnimations()`. Een plaatje bewijst niets over beweging.
- `probe-overlaydonker.cjs` — of de overlay donker blijft als Windows om licht
  vraagt, en het opzetscherm níét.
- `probe-framegrootte.ts` — wat een overlaybeeld weegt. Uitkomst: niets om aan te
  komen; staat er om dat vast te houden.
- `probe-iconen.ts` + `schermafdruk.cjs` — de icoontjes op een vel, en dat vel als
  plaatje. Beoordeel ze op zestien pixels.

Schermafdrukken maken kan door het hoofdproces te laden in een klein
Electron-scriptje en de renderer met `executeJavaScript` te bedienen; zie de
`screenshot*.cjs`-scripts. Voor het welkomsscherm: zet eerst
`app.setPath('userData', <tijdelijke map>)` zodat de echte profielen van de
gebruiker onaangeroerd blijven. De overlay kun je met een nepframe voeden via
`webContents.send('overlay:frame', …)`.

---

## 7. Dingen die geweigerd zijn, en waarom

- **Smart App Control uitzetten** — dat is een beveiligingsinstelling, kan niet
  per app, en uitzetten is onomkeerbaar zonder Windows opnieuw te installeren.
- **De door Defender in quarantaine gezette `d3d9.dll` terugzetten** — dat was
  DXVK; de gebruiker beslist zelf over zijn virusscanner.
- **De UI ín het spel vervangen** — dat zijn Delphi-interne zaken in `Omsi.exe`,
  daar kom je alleen met code-injectie. Een launcher *vóór* het spel kan wel;
  `options.cfg` (48 instellingen), `Inputs/keyboard.cfg` (128 toetsen) en
  `Inputs/ENG.kyb` zijn gewone tekstbestanden en de rondgang lezen→schrijven is
  byte-identiek nagerekend. Dat plan ligt er, maar is nooit gebouwd.
