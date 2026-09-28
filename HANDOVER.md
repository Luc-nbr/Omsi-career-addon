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
- **Vrij rijden** — niets wordt geboekt of beoordeeld. Je kiest alleen een kaart
  en een bus; de app zet de bus waar straks iets vertrekt, en de navigatie vindt
  zelf de omloop die je daarna in OMSI kiest (zie 5.0).

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
| `busscherm.ts` | De schermpjes van de bus uit zijn `model.cfg`: welke variabele, welk lettertype, welke kleur |
| `busprofiel.ts` | Per bus nagebouwde apparaten (AFR 200, LAWO 8401); anders de generieke weergave |
| `busmodule.ts` | Stelt uit het model van ELKE bus zelf een apparaat samen: schermpjes, knoppen en hun opschrift |
| `busvorm.ts` | Waar die schermpjes en knoppen OP het apparaat liggen, gemeten aan de `.o3d`-onderdelen van de bus |
| `bustoetsen.ts` | De knoppen die OMSI alleen op de muis heeft, bijgeschreven in `keyboard.cfg` |
| `schermcfg.ts` | Een `model.cfg` gelezen zoals Omsi.exe hem leest: alle `[mesh]`-regels, `[visible]`, `[newanim]`, materialen |
| `schermvorm.ts` | Het scherm van een apparaat: welke plaatjes, tekstvakken en aanraakvlakken, waar, en wanneer OMSI ze toont |
| `schermtextuur.ts` | Een textuur van het scherm opzoeken zoals OMSI dat doet, en de materiaalregels erop toepassen |
| `textuur.ts` | DDS en TGA uitgepakt tot RGBA; herkent het formaat aan de eerste bytes, niet aan de extensie |
| `png.ts` | PNG lezen en schrijven, voor wat de browser niet zelf kan of zou verkeerd doen |
| `oft.ts` | De bitmapfonts van OMSI (`Fonts/*.oft`), gelezen zoals Omsi.exe 2.3.004 ze leest |
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

Naast live.json lopen er drie bestandjes in dezelfde map:

| bestand | richting | waarvoor |
| --- | --- | --- |
| `opdracht.txt` | app -> plugin | een toets die in OMSI ingedrukt moet worden |
| `vragen.txt` | app -> plugin | welke stringvariabelen van de bus de app wil zien |
| `schermen.json` | plugin -> app | alles wat de bus aan tekst bijhoudt, eens per twee tellen |

De stringvariabelen komen sinds plugin 6 niet meer uit de `.opl` maar recht uit
het geheugen: de bus draagt zijn eigen namenlijst bij zich (`lees_busvars`).
Daardoor hoeft OMSI niet opnieuw op voor een bus die de app nog niet kende.
`plugin/proef/bus.c` zet een nagebootste bus op dezelfde adressen neer, zodat
dat na te rekenen is zonder het spel te starten.

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

**De eerste start is een wizard van drie kaarten (20-09-2026)**

Taal, chauffeur, waar staat OMSI -- in die volgorde, op wens van Luc. De
chauffeur kon daarbij niet de chauffeursstap uit het stappenvel zijn: dat vel
leunt op de kaarten en de bussen, en die zijn er nog niet, dus bleef de app op
"Dienstregeling inlezen..." staan wachten op iets wat niet kon komen. Vandaar
`Chauffeurstart.tsx` naast `Taalkeuze.tsx`, allebei in de vorm van het
welkomstscherm. De taalkeuze wordt onthouden met `languageChosen` en komt
daarna nooit meer terug.

Let op bij het testen: het bevestigen van de OMSI-map herlaadt de pagina met
opzet (`window.location.reload()`). `scripts/screenshotModes.cjs` viel daar
stil tot `js()` een mislukte aanroep opving -- een herladende pagina weigert
JavaScript, en dat is hier geen fout.

**De overgang tussen twee stappen (20-09-2026)**

Op Verder komt er een dekkend venster over het scherm waar een bus doorheen
rijdt: 900 ms, waarvan 700 voor de rit. Twee dingen zaten in de weg en staan
nu in de code:

- Het venster moet in `App.tsx` hangen, niet in het vel. Bij sommige stappen
  bouwt React het vel opnieuw op, en dan is de bus halverwege weg.
- `animationend` borrelt door. Het afscheidsbericht van de bus ruimde het
  venster op voordat hij de overkant haalde -- gemeten kwam hij niet verder dan
  x=-44, nog buiten beeld. Daarom toetst `Busrit.tsx` op de naam van de
  animatie.
- En de kleurtokens hangen aan `.setup`, `.hub` en `.overlay-body`. Het venster
  staat daarbuiten, dus `var(--route)` loste niet op en de bus kreeg
  `stroke: none`: onzichtbaar op een dekkend vlak. `.busvenster` staat nu in
  dezelfde reeks in `theme.css`, ook in de lichte varianten.

**De kaartkeuze in twee vormen (20-09-2026)**

De afbeeldingen komen uit OMSI zelf: elke kaartmap heeft een `picture.jpg` van
370 bij 280, het plaatje uit de kaartkeuze van het spel. Elf van de twaalf
kaarten hier hebben er een; Vienna 2005 valt terug op het monogram. Ze gaan
niet als gegevens-URL door de IPC -- 1,3 MB kopieerwerk voor iets dat de schijf
al heeft -- maar door een eigen schema `omsikaart://`, dat één bestand doorlaat:
`maps\<kaart>\picture.jpg` binnen de OMSI-map, met de naam uit het pad (de
hostnaam maakt "Ahlheim 5" kapot).

Voor de bussen bestaat dit niet: van de 166 voertuigmappen heeft er geen één een
voorbeeldplaatje, alleen Windows' eigen `Thumbs.db`. OMSI tekent daar het
3D-model live uit de `.o3d`-bestanden. Wie tegels met bussen wil, moet dus of
dat model tekenen, of iets afleiden uit de texturen (in veertig mappen: 257 dds,
133 bmp, 108 tga, 40 png) -- of het bij de monogrammen laten.

**De profielfoto van een chauffeur (20-09-2026)**

Dezelfde vorm als de kaartafbeeldingen, een map verder: een eigen schema
`omsifoto://` dat precies één map doorlaat, `<gebruikersgegevens>\profielfotos`.
De gekozen foto wordt gekópieerd (`career:photo` opent het venster in het
hoofdproces, filter jpg/jpeg/png/webp) en heet daarna `<profiel-id>.<ext>`; in
het profiel staat alleen die bestandsnaam. Op de tegel komt hij op de plek van
het monogram, rond bijgesneden met `object-fit: cover`, en hij loopt mee met de
drie maten van de chauffeurstegel: 44, 56 en 72 pixels.

Twee dingen die pas bij het naproeven bleken (`probe-profielfoto.cjs` in de
kladmap van die sessie):

- **Een vervangen foto kwam niet in beeld.** Zelfde bestandsnaam is dezelfde
  URL, en dan haalt Chromium helemaal niets op: 24x24 vervangen door 96x64 en de
  tegel bleef `naturalWidth 24` melden. Daarom hangt de pagina `?v=<photoAt>`
  achter de URL; het schema kijkt alleen naar het pad. `Cache-Control: no-store`
  is hiervoor geprobeerd en helpt niet -- er wordt niet opnieuw gevraagd, dus er
  valt ook niets te verversen.
- **`photoAt` is het moment van kiezen en niet de tijd van het bestand.**
  `copyFileSync` gaat op Windows via `CopyFileW`, en die neemt de tijdstempel van
  het origineel mee: drie foto's die minuten na elkaar gekozen werden kregen
  alle drie een tijd uit dezelfde milliseconde, want ze kwamen uit dezelfde map.
  Met de mtime als versie zouden twee foto's uit hetzelfde zipbestand dus niet
  van elkaar te onderscheiden zijn.

En een valkuil bij het nameten: het beleid van de pagina noemt `omsifoto:`
alleen bij `img-src`. Een `fetch()` naar het schema sneuvelt daardoor op
`connect-src` -- ook naar een geldige foto -- en zegt niets over de afhandelaar.
Toets hem met een `<img>`. Zo gemeten: de eigen foto laadt, en `..%2Fsettings.json`,
`..%2Fprofiles%2Factive.json` en een pad naar `Windows\win.ini` worden geweigerd.

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

### 5.00 De planning van het busbedrijf — deel 0 staat (28-09-2026)

Ontwerp: `design/ontwerpen/busbedrijf-planning.md`. Deel 0 is het fundament
waar de delen A-E op bouwen; **aan het spel verandert er nog niets**. De
schakelaar is `PLAN_ACTIEF` in `src/core/rooster.ts` (onwaar):

- zolang hij uit staat, sluit `bedrijf:dagAf` de dag af met de oude rekensom,
  wordt er niet gemigreerd, gaat de week van een lijn niet mee bij het
  inschrijven, en staan Planning en Kaart niet in de zijbalk;
- deel A vult `dagplan`, `afrekening`, `vulAan` en `pasRoosterToe` echt in en
  zet hem aan. Met de stubs van nu zou elke eigen bus en chauffeur niets meer
  opleveren (alles "uitbesteed").

Wat er staat:

- **Pure kern, af:** `planTypen.ts` (letterlijk uit het ontwerp §3.1),
  `bedrijfsplan.ts` (dagrooster uit de dienstregeling, knippen in diensten),
  `planregels.ts`, `plantarief.ts`, `voertuigvorm.ts` (heet zo omdat
  `busvorm.ts` al bestond), `bedrijfsdag.ts` (migreer, beginDag).
- **Stubs met de vaste signatuur:** `rooster.ts`, `uitval.ts`, `invulling.ts`,
  `bedrijfsrit.ts`, `lijnplan.ts`.
- **Getallen om aan te draaien** staan bij elkaar in `REGELS.planning`
  (`core/bedrijf.ts`): vergoeding per rituur, spoedtoeslag, werktijdgrenzen,
  dienstlengte, knippauze.
- **Main:** de kanalen `bedrijf:dagen`, `:rooster`, `:invullen`, `:rit`,
  `:ritBus` (stub), `:kaart`, `:klok`, `:lijnWeek`. Alles wat het bedrijf
  schrijft, ook `:koop` en `:inschrijven`, gaat door één slot (`inSlot`): een
  handler met een await leest `career.bedrijf` pas na die await opnieuw.
  `dagroostersVoor` leest per kaart; een kaart die niet te lezen is, krijgt
  `fout: 'kaart'` en haalt de rest niet onderuit.
- **Teksten:** `src/shared/tekst/` met een bestand per deel; `bd.fout.*` staat
  alleen in `fundament.ts`. `scripts/probe-teksten.ts` bewaakt dubbele
  sleutels, plaatshouders en de fouten.
- **Venster:** `Bedrijf.tsx` is de schil; Dashboard, Concessies, Wagenpark
  (met Markt) en Personeel staan in eigen bestanden, de bouwstenen in
  `BedrijfDelen.tsx` (ook `Boeken`, anders ging het dashboard in een kring
  naar de schil). Tab en melding wonen in App. `useDagplan.ts` haalt de
  dagroosters op en rekent het plan (pas als PLAN_ACTIEF aan staat: anders
  zou het openen van de app een kaart in main laden voor niets). De
  schermafdrukken van voor en na de
  splitsing zijn byte voor byte gelijk.
- **Proeven:** `probe-planfixture.ts` (Proefstad, zonder OMSI),
  `probe-bedrijf.ts` (met de nieuwe gevallen), `probe-teksten.ts`.

Lokaal nagemeten op 28-09-2026 (HafenCity, lijn 109): de dagroosters, de week,
de migratie en de klok kloppen; een koude kaartdag kost 43-165 ms per kaart,
een warme 0,3-1,4 ms. De tien fouten uit die meting zijn gerepareerd:

- een kaart die niet te lezen is, krijgt geen anker meer (het werd het jaar
  van de pc, en de kaart rekende daar voorgoed mee);
- `lijnWeek` staat in het geheugen van de kaartlaag, en `bedrijf:dagen`
  rekent geen weken meer;
- **`kaartDag` en `lijnWeek` uit de kaartlaag zijn bevroren** (Object.freeze,
  diep): ze worden per verwijzing gedeeld. Deel A en B maken een kopie als ze
  iets willen veranderen;
- de klok (`core/bedrijfsklok.ts`, proef `probe-bedrijfsklok.ts`): een
  lijnnaam telt alleen als bewijs voor een kaart als hij daar staat, en
  `kaartKlopt: false` bestaat nu echt (OMSI rijdt aantoonbaar een andere
  kaart). Geen crash zonder lijnnaam, geen datum van nullen;
- tweede en derde ronde (na dfb9636 en a78cc19): de klok kijkt eerst naar de
  plek van de lijn in OMSI's lijst (`mem.line`, de volgorde van readdir, die
  OMSI ook gebruikt), en pas dan naar de rit in de app; die kan na een crash
  oud zijn. Actieve chrono's laadt OMSI eerst en die schuiven de lijst op
  (Hamburger Dom: 109 op 45 in plaats van 44). Daarom schrijft **plugin 14**
  ook de lengte van de lijst (`mem.lines`), en telt de plek alleen op een
  kaart met evenveel .ttl. Dat scheidt ook de twaalf lijnen die op meer
  kaarten op dezelfde plek staan ("1"@0, "109"@1, "112"@2, 118/120/124@4-6,
  179/183@7-8). Met een oudere plugin telt de plek zonder die controle. De
  lijnindex bouwt opnieuw op als maps/ verandert of na vijf minuten. Lijnen
  die alleen in Chrono/*/TTData staan, zitten er niet in (bij Luc geen
  gevolgen: geen ervan heeft de naam van een basislijn elders);
- de boekingen noemen de kaart bij naam, en het lijnplan de goede datum;
- voor deel E staat in het ontwerp (§8.1) nu ook de avond ervoor (−15) in
  `klokUitOmsi`, en dat de klok doorloopt als OMSI pauzeert.

### 5.0 Waar het nu staat (26-09-2026)

**Het scherm van een apparaat staat nagebouwd in de overlay en op de tablet**
(26-09-2026). Niet meer de tekst in een eigen kadertje, maar het scherm zoals
OMSI het tekent: het plaatje van het menu dat aanstaat, de tekst in het
lettertype van het spel, en de knoppen als aanraakvlakken op hun plek. Over de
vloot: 351 bussen, 1618 apparaten, waarvan 1134 met een getekend scherm.

Dit werk lag een tijd onafgemaakt in de werkboom van deze tak -- de sessie die
het bouwde stopte voor het vastleggen. Een veiligheidskopie van die toestand
staat als `refs/onaf/ibis-schermen-2609` (een stash-object, niet op de
stash-stapel). Mag weg zodra niemand er meer naar kijkt.

De weg van plugin tot scherm:

1. De app zet in `getallen.txt` welke getalvariabelen de vorm nodig heeft
   (`schermGetallenVoor`); de plugin (13) beantwoordt ze in `live.json`, samen
   met de zichtbaarheid van elke mesh (`zichtbaar`, en `meshes.json` met de
   namen, zodat de app de volgorde kan nalopen).
2. `main/scherm.ts` bouwt per bus en apparaat één keer de vorm
   (`core/schermvorm.ts`), wacht daarvoor hooguit drie tellen op de getallen, en
   zet de plaatjes in een register (`main/schermtexturen.ts`) op een id.
3. Bij elk beeld komt de stand erbij: teksten, getallen, en de vlaggen van OMSI.
4. De overlay haalt de vorm op via IPC (`scherm:vorm`) en de plaatjes via het
   eigen protocol `omsischerm://t/<id>`; de tablet via `api/scherm/<id>` en
   `textuur/<id>`. Beide alleen op een id van twintig hextekens uit het
   register -- nooit een pad.
5. `renderer/apparaatscherm.tsx` tekent het op een canvas, met de
   aanraakvlakken erboven.

**Een touchscreen is alleen zijn scherm** (26-09-2026). Heeft het getekende
scherm zelf aanraakvlakken, dan staan er geen rijen knoppen meer onder. Wat er
overblijft wordt gescheiden op afstand tot het scherm (`LOS_VAN_HET_SCHERM_MM`,
100, in `core/schermvorm.ts`): toetsen OP het apparaat blijven staan (het
cijferblok van de RG-kastjes, tot 91 mm), de rest gaat naar `Paneel.losseRijen`
en staat dichtgeklapt onder "Losse knoppen" (de klep, de grendel en het
wisselgeld van de ALMEX, vanaf 124 mm). **Niet weggooien:** bij de muntwisselaar
van de MAN-A20 en de kaartautomaat van de VHH-bus lopen de munten door de grens
heen. De losse knoppen worden ook aan een toets gehangen.

**Op de tablet vult een touchscreen het hele scherm** (26-09-2026), in een laag
die met een portal onder `<body>` hangt -- niet in de telefoon, want die is met
CSS-zoom opgeschaald en een vaste laag daarbinnen schaalt mee. Linksboven een
knopje terug naar de telefoon; een oranje stip erop zolang de knoppen niet aan
een toets hangen. **Leg niets over het scherm:** elke plek kan een knop zijn --
een eerste versie legde een melding over het vinkje en FIMS van de ALMEX.
`probe-overlayscherm.cjs` controleert dat. In de overlay op de pc verandert er
niets; de vlag is `tablet` op `Telefoon`, alleen gezet door apparaat.tsx.

**Knoppen aan een toets hangen, en waarom een tik soms niets deed** (26-09-2026).
Een knop van een apparaat werkt in OMSI alleen via `Inputs\keyboard.cfg`: de app
geeft hem een vrije toets, en de plugin drukt die toets in (`opdracht.txt`). Vier
dingen stonden dat in de weg, allemaal opgelost:

1. **Bijschrijven mag alleen met OMSI dicht**, want het spel schrijft het bestand
   bij het afsluiten terug. De knop ervoor staat in de overlay en op de tablet,
   die je gebruikt terwijl OMSI draait -- het lukte dus nooit. Nu onthoudt de app
   het verzoek in `Settings.busknoppenStraks` (per model.cfg, want het
   bijschrijven heeft de scripts van die bus nodig) en schrijft bij zodra OMSI
   dicht is (`wachtOpOmsiDicht`, twee keer achter elkaar "dicht" gezien), bij het
   starten van de app, en vlak voordat de app OMSI zelf start (`schrijfStraks`).
2. **De tabletroute** (`case 'toets'` in de server) keek naar de sleutels van
   `OMSI_TOETSEN` in plaats van naar de namen; alles werd afgewezen. Nu gaat hij
   door `omsiToets`, net als de overlay -- en die laat alleen door wat bij een
   apparaat van deze bus hoort. **Dat is de beveiligingsgrens voor het netwerk;
   niet verruimen.**
3. **`bruikbareToetsen`** kende alleen de vaste lijst van de app, dus stond elke
   knop die uit het model van een bus komt voorgoed uit. Hij krijgt nu de knoppen
   van de apparaten in deze bus mee (`extra`).
4. **Te weinig toetsen.** Eerst waren er 53 vrije combinaties (Ctrl+letter,
   Ctrl+F-toets, Shift+letter); sinds "Bussen klaarmaken" ook Ctrl/Shift met de
   cijfers, Shift+F-toets en Ctrl/Shift met leestekens, samen 101 per bus
   (`TOETSEN_TOTAAL` in core/bustoetsen.ts). Ctrl+Shift doet in OMSI niets en is
   uit de lijst. Daarnaast **delen**: OMSI's eigen `keyboard_reset.cfg` hangt op tien plekken
   meerdere handelingen aan één toets (F8 is `bus_linie_plus` én
   `bus_rollband_setT`), omdat een bus alleen naar zijn eigen namen luistert. Een
   toets mag gedeeld worden als alles erop van ons is (niet in
   `keyboard.omsi-enhancer.bak`), niet een `{trigger:...}` is van de bus waarvoor
   we schrijven (`triggersVan` in core/schermvorm.ts), en niet van dezelfde bus.
   Zonder triggers wordt er niet gedeeld. De volgorde is: eerst wat op het scherm
   ligt, dan de toetsen op het apparaat, dan de losse knoppen.

**Niet in het spel gezien:** dat een GEDEELDE toets in OMSI werkt. Het
standaardbestand van OMSI doet het zelf, dus het is aannemelijk, maar het is niet
nagemeten. Werkt een knop van de ALMEX niet en een andere wel, kijk dan eerst of
de niet-werkende op een gedeelde toets staat (twee `[entry]`-blokken met dezelfde
scancode en modifier in keyboard.cfg).

Proeven: `scripts/probe-knoppenstraks.cjs` (het hele verloop, met een eigen
procesje als "OMSI" en een nagemaakte OMSI-map waarin alleen `Inputs` een kopie
is -- de rest zijn junctions naar de echte mappen die alleen gelezen worden, en
die aan het eind met rmdir zonder /s worden losgehaald; **die map nooit
recursief verwijderen**), en `scripts/probe-toetsdelen.ts` voor de regels van
het delen.

**Vrij rijden: alleen kaart en bus -- de navigatie vindt zelf wat je in OMSI
rijdt** (28-09-2026, 0.4.8). Een gebruiker, doorgestuurd door Luc: "meine Idee
wäre das die Haltestellen aussuchen Option komplett weg fällt in dem Modus nur
und nur noch Karte und Bus ausgesucht werden müssen und das Navi es von alleine
findet" -- en twee soorten fouten moesten weg: een verkeerde lijnroute in de
navigatie, en "er lädt garnix". Dit vervangt de versie van 27-09 met een
beginpunt (haltekeuze), die weer de versie met aangevinkte lijnen verving.

- **Opzet:** profiel -> modus -> KAART -> BUS -> START. De stap Beginpunt is weg
  (`STAPPEN_VRIJ` zonder `duty`; een oude stand op `duty` springt naar `bus`).
  Op de kaartstap staat "Tijd en weer" dichtgeklapt (`.vrij-wanneer`):
  automatisch is een schooldag door de week uit het tijdvak van de kaart
  (`dienstDatum(folder, 287)`), de klok van de pc, en het weer van de kaart.
  Wie datum of tijd verzet, krijgt een nieuwe plek; "Weer automatisch" zet het
  terug. De voet zegt waar de bus komt te staan ("je bus staat klaar bij
  [ 51 ] Krefrath Hbf; daar vertrekken tot 14:50 9 ritten", 's nachts "daar rukt
  om 04:22 de eerste omloop uit"), en de bus staat als marker op de kaart. Een
  kaart zonder tegels (Wenen), zonder dienstregeling of zonder plek: VERDER
  weigert met de reden.
- **Waar de bus staat** (`core/beginplek.ts`): op een inzetpunt van de kaart
  (`[entrypoints]` in global.cfg, twaalf regels per punt: twee ids, een nul, x,
  hoogte, z, quaternion x/y/z/w, tegel, naam). OMSI zet de bus in zijn eigen
  situaties exact op zo'n punt met hetzelfde quaternion; dat gaat daarom
  ongewijzigd mee (`SituationRequest.spawn.quaternion`). Gekozen wordt het punt
  waar tussen klok+5 en klok+45 binnen 300 m de meeste ritten vertrekken (bij
  gelijke stand: tot klok+90, dan een remisenaam, dan de volgorde in het
  bestand), anders tot klok+120; 's nachts met een automatische tijd gaat de
  klok naar tien minuten voor het eerste vertrek bij een inzetpunt. **Niet "de
  eerste remise"**: bij het Betriebshof Alsterdorf op HamburgLi20 begint geen
  enkele van de 252 omlopen, en tussen tien en vier rukt er uit een remise
  bijna niets uit. Kaarten zonder inzetpunten: de halte met de meeste
  vertrekken (`spawnAtStop`, in de werker). Alles in de werker
  (`vrijcheck`); het hoofdproces houdt de uitkomst vast, zodat START de bus
  zet waar de voet het zei -- als de speler zelf een tijd koos. Met een
  automatische tijd bepaalt START plek en tijd opnieuw (een gekozen datum
  blijft): de voet rekende ze uit bij het kiezen van de kaart, en wie daarna
  lang op de busstap bleef, startte op de klok van toen. Gooit die controle
  een fout, dan de plek van het scherm; "geen tegels" en dergelijke weigeren
  zoals de voet.
- **START** (`core/vrijstart.ts`, zonder Electron na te lopen): OMSI dicht ->
  situatie, `laststn.osn` + `[last_map]`, de wachtende knoppen (in een eigen
  `try`: een fout daar hield eerst het starten tegen), OMSI starten. Mislukt
  dat ('geweigerd', 'mislukt'), dan blijft het startvenster staan met de reden
  (`StartingDialog.melding`) en gaat het dicht zodra OMSI er is; de overlay
  opent dan pas -- niet meer boven het bureaublad. De voet van dat venster zegt
  dan "Wacht tot je OMSI zelf start…" (`StartingDialog.mislukt`), niet "Bezig
  met opstarten…" en na 25 s "De kaart wordt ingeladen". Het weer naast
  `laststn.osn` (kopiëren of het oude weghalen) staat in `presetStartup` in een
  eigen `try`: een `.owt` die niet weg kon maakte eerst de hele "Last
  Situation" tot mislukt (`StartupResult.weerFout`, alleen voor het logboek).
  `duty:begin` doet het net zo: de knoppen in een eigen `try` (een fout daar
  sloeg het starten van OMSI over), `launchOmsi` altijd, en `start`/`startFout`
  terug in `BeginResult`; de voet van de busstap noemt dan de reden
  (`start.launchRefused`, `start.notLaunchedReason`). OMSI al draaiend -> **alleen**
  `Situations\OMSI Enhancer.osn` (nooit `laststn.osn` of `options.cfg`) en de
  overlay; de voet zegt dat hij via Laden klaarstaat. De vrije rit bestaat pas
  na het schrijven; een weigering laat niets achter. Het logboek zegt per start
  de plek, de bron en het klaarzetten (`vrij rijden klaargezet: start|situatie|
  niets`). Staat het startscherm niet klaar, dan vervalt ook `klaargezet` van
  een eerdere rit (zoals bij meerijden); anders zette `herstelStartscherm` die
  na het afsluiten van OMSI terug.
- **Het sjabloon zonder eigen situaties** (`findTemplate(..., { zonderEigen })`):
  situaties die "OMSI Enhancer"/"OMSI Career" heten tellen niet voor het
  tijdvak; de kopieën `laststn.osn.voor-omsi-*` wel. Een zelfgekozen datum
  werd anders het tijdvak van de volgende sessie. Het overzicht in de
  schijfcache heet daarom `overzicht2`.
- **Het weer "zoals de kaart"** (`findWeather` in core/situation.ts) staat los
  van het sjabloon: het eerste `.owt` naast `laststn.osn`, de kopieën of een
  scenario van deze kaart (niet `OMSI Enhancer.osn`) dat de app niet zelf koos
  -- `isEigenWeer`: weer uit `writeWeather` heet "OMSI Enhancer - ..." /
  "OMSI Career - ...", en OMSI schrijft die naam na een rit zo terug. Eerst
  nam het het `.owt` van het sjabloon, en naast de kopie stond er nooit een:
  op zes kaarten werd het het standaardweer, en daarna haalde presetStartup
  ook `laststn.osn.owt` weg (tegenlezing 28-09). Nu op Lucs installatie: 11
  kaarten met weer van de kaart; Krefrath en Rheinhausen hebben alleen weer
  dat de app koos (Vienna geen), en krijgen het standaardweer. presetStartup zet één keer
  het weer van de kaart naast de kopie (`laststn.osn.voor-omsi-*.owt`, nooit
  gekozen weer) en haalt `laststn.osn.owt` alleen weg als de app dat weer
  koos; het weer van de kaart blijft staan. Het logboek noemt de bron
  ("weer van de kaart (maps\X\laststn.osn.owt)", `SituationResult.weerVan`).
- **De omloop vinden** (`core/omloopvolgen.ts`). De plugin geeft naast de namen
  ook de nummers: `line` (plek van het `.ttl` in readdir), `tour` (plek van de
  `[newtour]` in het bestand, ook lege omlopen tellen: `Tour.index`),
  `tourEntry` (plek van de `[addtrip]`, ook lege: `TourTrip.entry`) en `trip`.
  Koppelen gebeurt op nummer, met drie controles (de rit, de omloopnaam met
  tolerantie voor een verminkte naam van één teken, en de rijdag) en in beide
  volgordes (bestand en vertrektijd -- vier omlopen staan niet op tijd, en op
  22 plekken kloppen beide met een ander vervolg; dan `zeker: false`). Daarna
  terugvallen op de naam, dan de rit alleen, dan niets. Op naam gaat een
  exacte naam voor de rijdag: `naamGelijk("12", "1")` is waar (een verminkte
  "1"), en met de rijdag voorop koppelde OMSI "12" aan omloop "1" als "12"
  die dag niet reed. Tussen dagvarianten met dezelfde naam beslist de rijdag
  nog wel. De losse rit (`soort: 'rit'`) zoekt op de naam, en op het
  ritnummer alleen als OMSI geen bruikbare naam geeft: een rit van een
  andere kaart wees met zijn nummer in de ritlijst van deze kaart een
  willekeurige rit aan, en die route stond dan in de navigatie (590 van 728
  keuzes van een andere kaart; nu 706 `niets` en 0 een andere rit,
  `probe-koppelen.ts`). `dutyFromTour` (op de
  klok raden) is weg: dat was de "falsche Linien Route". Namen worden
  vergeleken via `vouw` (zonder pad, kleine letters, alles buiten ASCII als
  '?'; "TTData 853_..." met de spatie van `copy_text` telt ook). De plek
  `line` telt alleen als terugval (OMSI gaf geen bruikbare lijnnaam), en
  sinds plugin 14 alleen als OMSI's lijnlijst even lang is als de `.ttl` van
  de kaart (`mem.lines`): een actieve chrono schuift de lijst op (zie 5.00).
- **Elke volgende rit op nummer:** `legVolgensOmsi` (core/live.ts) wijst bij een
  op nummer gekoppelde dienst (`Duty.omsi`) de rit aan met `tourEntry`, en toetst
  lijn, omloop en rit. Klopt de rit niet, dan koppelt het volgen opnieuw met de
  andere volgorde voorop (`volgorde gecorrigeerd` in het logboek, alleen als de
  volgorde echt omdraait). Komt precies dezelfde koppeling terug -- klopt maar
  één volgorde -- dan gebeurt er niets: eerst stond elke 30 s dezelfde regel
  met "volgt OMSI" in het logboek, met nieuwe IBIS-codes. Een rit van
  vóór het begin van de koppeling (`Duty.omsi.vanaf`: de speler koos in OMSI
  terug) is een nieuwe keuze en wordt opnieuw gekoppeld; eerst wees
  `legVolgensOmsi` dan de eerste rit van de dienst aan, een latere dan OMSI reed.
- **Leegritten** (`DutyLeg.leer`: minder dan drie haltes en geen lijn of een
  bestemming als "Betriebsfahrt") horen in de dienst, zonder lijnnummer -- de
  naam van het lijnbestand kwam anders op de IBIS -- en met hun eigen route uit
  de `.ttr` (`routeZonderHaltes`). Het overzicht toont "Leegrit". Eén rit,
  halte of lijn staat in het enkelvoud: de voet ("nog één rit",
  `free.mapFootOne`), de kop van het dienstoverzicht (`duty.overviewTripOne`
  enz.; een losse rit gaf "1 ritten · ... · 1 lijnen") en een rit met één
  halte op de telefoon (`ovl.appStopOne`). Ook de volgende rit in de pauze
  op de telefoon en het lijnplaatje van de keuze- en IBIS-stap in de overlay
  zeggen "Leegrit" (`ovl.freeLeer`); daar stond "Lijn " met niets erachter
  of een leeg plaatje.
- **Routes: de `.ttr` met naden** (`metNaden` in core/routing.ts, achter de vlag
  `NADEN`). Een `.ttr` mag nu ook met hooguit 5% ontbrekende banen, als elke
  halte ernaast ligt en de gaten samen hooguit een vijfde van de lengte zijn;
  een naad boven een meter wordt gedicht over het rijstrokennet
  (`LaneNetwork.verbind`, verankerd op de strook in de rijrichting van het stuk
  ervoor en erna, hooguit drie keer het gat plus 50 m), anders een gestreepte
  gok. Meetpoort `probe-routing.ts --naden`: 479 ritten heel -> 999 met naden
  (Ahlheim 114 -> 489, TH_Wald 71 -> 121, Region Grundorf 37 -> 82), leegritten
  zonder haltes 360 -> 664, **0 ritten verder van OMSI's banen dan de planner**.
  De planner zelf is ongewijzigd (zelfde uitkomst als 28-09 ervoor).
- **Welke kaart?** (`core/kaartherkenning.ts`). De plek van de bus (tegel, x, z,
  hoogte) past maar op één kaart bij het maaiveld. Per plek: *klopt* (hooguit
  0,6 m van het maaiveld), *kan niet* (de tegel bestaat daar niet, of de bus
  staat meer dan 0,6 m ONDER het maaiveld) of *niets* (erboven: talud, brug;
  of geen hoogtebestand). Vanaf zes monsters: de helft klopt -> zeker; de
  helft kan niet, of minder dan 25% klopt terwijl een andere kaart 75%+ haalt
  -> een andere kaart. Eerst telde "erboven" als "past niet", en in Hamburg
  ligt het wegdek vaak een meter of meer boven de grond: op HafenCity zei de
  app bij 16% van de stukjes rijden "Je bus staat niet op ..." (Li20 12%,
  109_2 4,5%). Nu 1 van 2600 (een tunnel op Li20; was 81), en een echt
  verkeerde kaart wordt 80% herkend (was 83%; alleen "kan niet" haalde 53%).
  **Wisselen** ("OMSI speelt ...") alleen naar een kaart die als enige 75%+
  haalt terwijl geen andere kaart ook maar 50% haalt: zonder die eis ging de
  app in 57 van de 31200 gevallen (bus op K, app op een andere) naar een
  DERDE kaart (109_2/Li20 -> Hamburg109, TH_Wald -> Krefrath, Ahlheim ->
  Region Grundorf); nu 0, tegen 38,5% goede wissels (was 41,5%). Anders zegt
  hij dat de bus niet op de kaart staat. Een platte kaart twijfelt, en dan
  gebeurt er niets. Past een keuze van OMSI niet in de dienstregeling maar wel
  op precies één andere kaart (het `.ttl` bestaat, het ritnummer klopt, de
  plek spreekt het niet tegen), dan wisselt hij ook. Delen meer kaarten het
  terrein (HafenCityHamburg, Hamburg109, Hamburg109_2 en HamburgLi20) en
  rijdt OMSI een omloop, dan beslist dat koppelen, niet "andere kaart". Zonder
  gevolgde omloop (losgelaten, onbekend) kijkt de kaartherkenning weer mee.
  Er is één herkenning in het volgen, bovenaan `volgStap`; een tweede na een
  mislukte koppeling stelde dezelfde vraag over dezelfde monsters en was dood.
- **De herkenning draait in de werker** (`herken` en `elders` in
  core/kaartlaag.ts): de eerste keer leest hij global.cfg en het terrein van
  alle kaarten, 62 tot 75 ms, en dat stond in het hoofdproces. Het volgen
  wacht er niet op: bij elk nieuw monster gaat er een vraag weg en geldt het
  laatste oordeel over deze kaart van deze rit (`herkenningVoor`); een
  koppeling of een wissel gooit dat oordeel weg. Ook `free:yards` (de
  wagenparken bij vrij rijden) gaat door de werker (`vrijeWagenparken`): koud
  63 tot 348 ms, warm nog 30 ms voor 22 wagenparken naast de MAN SG. Die vraag
  staat in de rij achter het busvoorstel en de controle (koud tot 1,8 s), dus
  stelt `free:start` het wagenpark zelf vast (`wagenparkVoorStart`): het
  gevraagde als het naast deze bus ligt, anders het voorstel van de kaart.
  Eerst ging een START binnen twee tellen na VERDER zonder wagenpark ("door
  OMSI gekozen"). Het logboek zegt "(voorstel bij START)" als dat gebeurde.
- **Volgen** (`volgOmloopInOmsi` in main/index.ts): elk beeld, en elke seconde
  ook met de overlay dicht. Het zware werk (`koppel`, `vertrekken`, `herken`,
  `elders`, `vrijewagenparken`) in de werker; het hoofdproces laadt voor vrij
  rijden geen dienstregeling, rijstrokennet of terrein meer (alleen de
  tegellijst van de eigen kaart voor `busOpKaart`, 1 tot 6 ms, één keer). De staat (`vrijStaat`: wacht, geenBus, geenGeheugen,
  andereKaart, geenOmloop met wat er straks vertrekt, gevolgd, alleenRit,
  onbekend) gaat met `vrij:staat` naar het rijscherm en in `frame.vrij` naar de
  overlay en de telefoon; de zinnen staan op één plek (renderer/vrijstaat.ts).
  Een omloop die op naam gevolgd wordt (geen `Duty.omsi`) is dezelfde als
  OMSI er een noemt met precies die naam; `naamGelijk` las "10" als een
  verminkte "1" en liet de overlay dan "1" volgen. Een verminkte naam koppelt
  zo opnieuw, en komt dezelfde omloop (`volg.omloop`: lijnbestand en plek)
  terug met de rit erin, dan gebeurt er niets -- geen logregel, geen IBIS.
  Losgelaten in OMSI: na 30 s weg (`schedActive` kan kort wegvallen). Een keuze
  die nergens staat wist de oude dienst -- eerst bleef die staan alsof hij
  klopte. Staat de bus meer dan 150 m van de eerste halte van een rit die nog
  niet begon, dan een gestreepte rechte lijn met "Rijd naar ..." (fase 1: geen
  route).

**Niet in het spel gezien** (dat moet Luc doen): of de bus rechtop op het
inzetpunt staat; of het logboek bij een gekozen omloop "koppeling index" zegt;
Spandau lijn 92 op een werkdag met een omloop die in het `.ttl` na de Za/Zo-
omlopen staat (index of naam: dat leert of OMSI de lijst filtert); Hamburg109_2
omloop 66093 bij rit 7 (telt OMSI op tijd?); een rit uitrijden en `schedActive`
in live.json volgen (beslist over de 30 s); een andere kaart laden in OMSI.

**Fase 2, niet gebouwd:** een aanrijroute via de planner in plaats van de rechte
lijn; haltes op naam, richtingsneutraal; plugin 14 met een codepagina per veld
(`lineName`/`tripName` CP_ACP, `tourName`/`nextStop` 1252) en de lengte uit de
Delphi-string; de naam van de situatie in de taal van de speler.

Proeven: `probe-koppelen.ts` (alle kaarten, 53184 gevallen 100% `index`, 44717
varianten zonder fout, het monster van 21-09 en de reproducties, en 728
keuzes van een andere kaart zonder een andere rit), `probe-beginplek.ts`,
`probe-kaartherkenning.ts`, `probe-vrijstart.ts` (ook het weer, in een
nagemaakte spelmap),
`probe-routing.ts --naden`, en `probe-vrijrijden.cjs` (het hele verloop in de
echte app, met een eigen procesje als "OMSI" dat al draait). Starten met OMSI
dicht wordt daar met opzet NIET nagelopen, want dan schrijft de app in de
spelmap; dat doet `probe-vrijstart.ts` met nagemaakte stappen.

**LET OP -- wat er bij de eerste versie van die proef misging (27-09).** De
vraag "draait OMSI?" op de busstap (`omsi:running`) en de controle in
`duty:begin` zochten vast naar Omsi.exe; alleen de wacht keek naar
`OMSI_PROCES`. De proef had een eigen "OMSI", de app zag dat niet, vroeg dus
niet "meerijden?", zette de situatie klaar in de ECHTE spelmap en startte het
ECHTE spel. Gevolg bij Luc: OMSI ging open (en is om 10:13 afgesloten),
`[last_map]` in options.cfg wijst naar Rheinhausen, en
`maps\Rheinhausen\laststn.osn` is de situatie van de proef -- wat daar
stond is weg (er is alleen de kopie van 13-09, `.voor-omsi-enhancer`).
Rechtgezet: elke "draait OMSI?" gebruikt nu `OMSI_PROCES`. En de proef
weigert zelf, voordat de app laadt, elke schrijfactie onder de spelmap en elk
programma dat Omsi.exe start, en drukt pas op START als de app zegt dat
"OMSI" draait. **Een proef die de echte OMSI-map gebruikt, hoort die
vangrails te hebben** -- kopieer ze uit probe-vrijrijden.cjs. Sinds 0.4.8
schrijft vrij rijden met OMSI al draaiend `Situations\OMSI Enhancer.osn`; de
proef leidt precies die schrijfacties om naar een tijdelijke map en weigert de
rest nog steeds.

**Bussen klaarmaken, vanuit de app** (26-09-2026). Wens van de gebruiker: "de
gebruiker moet via de app zelf de bus kunnen toevoegen zodat de app de
benodigdheden zelf bouwt voor de bus". Op het hoofdmenu staat "Bussen
klaarmaken": de bussen per map als tegels (met foto, en "Klaar: ALMEX" als ze
klaar zijn); tik er een aan en de app leest hem uit, in de werker
(`core/busklaar.ts`, opdrachten `busmappen`, `busanalyse`, `busacties` in
`main/kaartwerker.ts`). Elk apparaat wordt een tegel met zijn soort --
touchscreen, scherm met knoppen, alleen knoppen, alleen een scherm -- en wat
een scherm én minstens vier knoppen heeft staat aangevinkt. "Klaarmaken"
(`busKlaarmaken` in main/index.ts) bewaart de keuze in `busmodules` onder
dezelfde sleutel die de plugin tijdens het rijden doorgeeft (de busmap in
kleine letters, `vehicles/hh20_ebus2021`), en hangt de knoppen **per variant**
(per model.cfg, met de triggers van die variant) aan een toets -- of zet ze in
de wachtrij als OMSI draait. Twee varianten rijden nooit tegelijk en mogen
toetsen delen.

Over de vloot: 28 van de 32 busmappen hebben een apparaat om klaar te maken;
uitlezen duurt tot 48 s (de Citybus 530 van Kajosoft, 122 varianten). Twee
mappen passen niet in 101 toetsen als alles aanstaat -- de Kajosoft-bussen met
vijf touchscreens en 174 knoppen per variant. Het scherm zegt dan hoeveel
knoppen geen toets kregen en vraagt er een uit te vinken.

Proeven: `scripts/probe-busklaar.ts` (het uitlezen, met `--vloot` over alle
bussen) en `scripts/probe-bussenklaar.cjs` (het scherm in de echte app, van het
hoofdmenu tot keyboard.cfg, met een nagemaakte OMSI-map zoals hierboven).
**Let op in proeven die een kopie van keyboard.cfg gebruiken:** de speler heeft
de HH20 inmiddels klaargemaakt, dus de ALMEX-knoppen staan al in zijn bestand.
`probe-knoppenstraks.cjs` en `probe-bussenklaar.cjs` halen ze daarom eerst uit
hun kopie; `probe-overlayscherm.cjs` leest het echte bestand en verwacht de
oranje stip alleen als ze er niet staan.

**Een getal dat de plugin niet levert, telt als onzichtbaar.** De klok en de
knoppen van een ALMEX hangen aan `almex_ein = 1`; ontbreekt dat getal, dan
blijft het scherm op die plekken leeg. In het spel levert de plugin elk getal
dat de app vraagt, maar wie een proef schrijft moet ze allemaal beantwoorden --
zie `scripts/probe-overlayscherm.cjs`.

**Proeven:**
- `scripts/probe-overlayscherm.cjs` -- de hele weg, met een eigen `live.json`:
  vraag, antwoord, vorm, overlay, tablet, menuwissel, en of de server een
  vreemde id of een pad weigert. Dit is de proef om als eerste te draaien.
- `scripts/probe-schermvorm.ts` -- de vorm over de hele vloot, met harde
  controles op de nagemeten bussen (`--snel` alleen die).
- `scripts/probe-apparaatscherm.cjs` -- het tekenen, in een los pagina'tje.
- `scripts/probe-schermtextuur.ts`, `scripts/probe-letters.ts` -- de plaatjes en
  de lettertypen.

**Niet in het spel gezien.** Alles hierboven is nagerekend zonder OMSI. Wat er
in het spel nog nagekeken moet worden:
- of een tik op een aanraakvlak in OMSI aankomt -- dat gaat via `keyboard.cfg`
  en vraagt dat de knoppen eerst aan een toets gehangen zijn (met OMSI dicht);
- of de vlaggen van de plugin (`zichtbaar`) met de volgorde van de app kloppen
  in een bus die niet de HH20 is;
- de drempel van alfatest (`[matl_alpha] 1`, nu 128), en of `[visible]` exact
  of afgerond vergelijkt -- allebei niet in het spel nagemeten.

**`[alphascale]` wordt nagetekend** (27-09-2026). Luc: "Probleempje met het
schermpje in de coach o560, dit scherm komt niet goed terug in de overlay" --
in het spel turquoise met een wit meldingsvak, in de overlay alleen de klok op
zwart. De Faremaster (uit de Urbino II) kiest zijn plaatje met
`[matl_freetex]` (`Faremaster_Maintexture = "FaremasterMain.dds"`), en dat
kwam wel goed door. Maar erover ligt `SU_II_dummy.dds`, een zwart vlak met
`[alphascale] Faremaster_Dim` (0 overdag, 0,3 of 0,6 bij dimmen). De app kende
die regel niet en tekende het vlak altijd dekkend. Nu: `alfaSchaal` in
core/schermcfg.ts, `alfaschaal` op het deel (core/schermvorm.ts), de variabele
gaat mee in getallen.txt, en `dekkingVan` in apparaatscherm.tsx vermenigvuldigt.
Levert de plugin geen getallen of kent de bus de naam niet, dan telt de laag
zoals zonder [alphascale]. In 444 model.cfg's van de vloot staat [alphascale].
Proef: `scripts/probe-schermdim.cjs` (Dim 0: licht 162, 225 kleuren; 0,6:
licht 64; 1: zwart).

**Wat er niet na te tekenen valt, en zo blijft:** 52 apparaten tekenen met een
`[scripttexture]` (het busscript schildert de beeldpunten zelf, zoals de Atron
van de Citaro C2); die krijgen een leeg vlak en hun knoppen werken wel. 12 hebben
versleutelde meshes waarvan de plek niet te redden is.

**0.4.1 is uit** (26-09-2026), als Latest op GitHub, op verzoek van Luc ("breng
de release uit met alles wat we hebben nu als 4.1"): met de notities in
`uitgaven/0.4.1.md`, de tag `v0.4.1` op `ed4de75`, en master en die tag gepusht
(origin/master stond daarvoor op `d193f7b`). De twee bestanden op GitHub zijn
byte voor byte die in `release/`. Tussendoor liep het nummer intern op tot
0.4.14 zonder uitgave; het publieke nummer volgt op 0.4.0, dus 0.4.1. De
Discord-aankondiging staat klaar in `C:\OMSI Enhancer Discord\uitgaven\0.4.1.md`
en is **niet geplaatst** -- dat doet de gebruiker zelf. Wat na de release op
master komt, is niet gepusht.

### 5.0a Eerder (22-09-2026)

**0.4.0 is uit** (22-09-2026), als Latest op GitHub, met de notities in
`uitgaven/0.4.0.md`. De tag `v0.4.0` hangt aan de tak `claude/ecstatic-noether-296800`;
master is niet meegegaan. Daarvoor gold:

**0.3.1 is uit.** Hij staat op GitHub als Latest, samen met 0.3.0 dat er alsnog
bij is gekomen. `master` en `origin/master` staan op `2eddb1e`; de tak
`claude/ecstatic-noether-296800` wijst naar hetzelfde punt en kan weg zodra de
worktree eronder niet meer nodig is.

Er stonden hier lange tijd tags zonder release -- `v0.2.0-beta.2`, `v0.3.2`,
`v0.3.3` en `v0.3.4`, restanten van het hernummeren naar "deze uitgave heet
0.3.1". Die zijn lokaal en op origin verwijderd; de commits waar ze naar wezen
staan gewoon op master, dus er is niets verloren. Wat er nu nog staat heeft
allemaal een release: `v0.1.0`, `v0.2.0-beta.1`, `v0.3.0`, `v0.3.1`.

**De kaartverkoop komt uit het geheugen van OMSI** (22-09-2026). OMSI zet
linksboven in beeld welk kaartje de passagier wil, wat het kost en wat hij
gegeven heeft, maar geeft dat niet aan een plugin door. De plugin leest het nu
uit het geheugen, met adressen uit OmsiHook (space928/Omsi-Extensions), en die
gelden alleen voor OMSI 2.3.004 -- net als de positie en de dienstregeling die
er al uit kwamen:

- in `TRoadVehicleInst` staat op `+0x7a8` wie er staat te betalen (`-1` = niemand);
- die index wijst in de lijst met mensen (`0x0086172c`, zelfde vorm als de
  voertuigenlijst), en bij die persoon staat het kaartje (`+0x61d`), de prijs
  (`+0x620`), het aangenomen geld (`+0x624`), te weinig wisselgeld (`+0x628`)
  en of hij klaar is (`+0x629`).
- De naam van het kaartje komt uit het kaartpakket van de kaart en wordt alleen
  getoond als de prijs daar op een cent na mee klopt; anders wijst de index
  ergens anders heen en noemen we geen naam.
- Wat er nog niet is: het geld aannemen of teruggeven in het spel zelf. OMSI
  doet dat met toetsen (Shift+T, T, Ctrl+T); de app registreert het teruggeven
  wel, maar drukt die toetsen nog niet.

**De navigatie kan op een telefoon of tablet** (22-09-2026, na 0.4.0). In de
telefoon van de overlay staat een zesde app, "Bekijk op apparaat": die zet een
kleine webserver aan (`src/main/apparaat.ts`, poort 47810) en toont een QR-code
naar `http://<adres van de pc>:47810/n/<sleutel>/`. Het toestel opent daar
`apparaat.html` in zijn eigen browser. Wat je moet weten:

- De kaart, de balk en de afleidingen staan in `src/renderer/src/navigatie.tsx`
  en worden door de overlay en de webpagina allebei gebruikt. Verander je iets
  aan de navigatie, dan verandert het op beide plekken.
- De sleutel (128 bits) en de poort staan in settings.json (`apparaatSleutel`,
  `apparaatPoort`), zodat een icoon op het beginscherm na een herstart blijft
  werken. "Nieuwe code" maakt een nieuwe sleutel; de oude geeft dan 404.
- De server geeft alleen lezen, alleen de kaart en routes van de dienst in de
  overlay, en nooit het personeelsnummer of de pincode (`frameVoorApparaat`).
- Windows vraagt de eerste keer of de app op het netwerk mag. Dat beslist de
  speler; de app raakt de firewall niet aan. Een proef zet de server met
  `OMSI_ENHANCER_APPARAAT_HOST=127.0.0.1` alleen op deze pc, dan komt die vraag
  niet.
- Nog niet op een echte iPhone of Android gezien, alleen in een browser op
  telefoon- en tabletformaat.

**De icoontjes zijn nog maar half in gebruik.** De set staat er en is nagekeken:

- `src/renderer/src/Icoon.tsx` — 26 vormen, getekend en beoordeeld op zestien
  pixels. `Setup.tsx` haalt zijn stapicoontjes er al uit; de oude `PADEN` is weg,
  dus er is nog maar één set.
- `scripts/probe-iconen.ts` — zet de set op een vel in vier maten, licht en donker.
- `scripts/schermafdruk.cjs` — maakt van een HTML-bestand een plaatje; algemeen
  bruikbaar, het voorbeeldpaneel legt geen lokale bestanden vast.

De starthub heeft er sindsdien drie bij getekend (`thuis`, `foto`, `fotoweg`) en
gebruikt `thuis`, `stuur`, `bus`, `logboek`, `profile`, `licence`, `duty` en
`map`. Wat nog nergens getoond wordt zijn de twaalf die voor de chips en het
chauffeursoverzicht bedoeld waren: de vijf van het weer, de vijf van het dagdeel,
en `stipt`, `record`, `plek` en `kaartje`.

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

**De telefoon is het toestel geworden waar je je dienst mee begint.** Aanmelden en
tekenen staan sinds 22-09-2026 in het navigatiepaneel en niet meer in het
dienstpaneel -- zie "Een dienst begint met aanmelden" in §5.2. Het zat er eerst
naast: een los cijferblok rechtsboven in beeld, terwijl de telefoon linksonder
zei dat de kaart aan het laden was.

**De lichte stand was op sommige schermen niet te lezen** (opgelost op
22-09-2026). Het rijscherm gaf witte letters op een wit vel: contrast 1.03. De
oorzaak is dat `RunningDuty.tsx` en `LiveDienst.tsx` nog aan de oude glaswereld
uit `styles.css` hangen -- wit op donker -- terwijl ze in een vel van het
opzetscherm liggen. Gemeten en verholpen met `scripts/probe-leesbaar.cjs`, dat
beide standen narekent en de plekken onder de WCAG-grens opsomt. Wat er veranderd
is, staat in de commentaren bij de wijzigingen zelf:

- De oude namen (`--text`, `--muted`, `--glas`, `--tint-tekst` en de aliassen)
  wijzen op `.setup` nu naar de inkt van het vel, zodat ze met de stand meedraaien.
- `--glas` is daar doorzichtig: een kaart die al op een vel ligt hoefde dat vel
  niet nog eens te tinten, en door dat stapelen haalde geen enkele inkt het nog.
- `--vel-zacht` had in geen van beide standen ruimte -- 4.54 in het licht, 4.41
  op een tegel in het donker. Nu #5d6470 en #959db0. **Dit is een afwijking van
  de gemeten waarden uit `.impeccable/build/spec.json`**; als iemand die
  afbeelding opnieuw als waarheid neemt, komt dit gebrek terug.
- Het woord naast het vertragingscijfer draagt de kleur niet meer. Rood, groen en
  blauw halen op vijftien pixels nergens 4.5 -- niet op hun eigen tint en ook niet
  op het kale vel. Het cijfer staat op veertig en houdt de kleur.

**Wat er nog onder de grens staat, en met opzet:** wit op de blauwe hoofdknop
(`--route`, #2a75f7) haalt 4.21 in plaats van 4.5. Dat is in beide standen
hetzelfde en het geldt voor elke hoofdknop in de app, dus het is geen fout van
een scherm maar de kleur zelf. `--route-diep` (#1b5fd0) zou 5.84 halen, maar die
is nu de zweefkleur; hem naar voren halen vraagt dus ook een nieuwe, diepere
zweefkleur. **Dit is aan de gebruiker, niet aan de volgende AI.** De proef meldt
het elke keer, en dat hoort ook zo.

**Nog niet nagerekend** zijn de overige oude schermen (de volledige dienstkaart in
het venster achter "Bekijk volledige dienst", de routekaart, het wachtvenster).
De proef tekent `RunningDuty`, `LiveDienst`, `Dienstpas` en `HofDialog`; wie er
meer bij zet, breidt `entry` in dat bestand uit. Let op: `entry` is een
template-literal, dus een accent grave in een commentaar erbinnen sluit de
string en geeft een foutmelding die nergens naar de oorzaak wijst.

**Verder open:**

- **Een oude wens over vrij rijden is vervallen.** Ooit: "in vrije modus is er
  selectie mogelijk per lijn en kunnen handmatig meer ritten worden
  toegevoegd". Op 27-09 zei Luc dat vrij rijden helemaal geen dienst hoort te
  maken; de omloop kies je in OMSI. Zie 5.0.
- **De Discord-aankondiging van 0.3.1 is geschreven maar mogelijk niet geplaatst.**
  Hij staat in `C:\OMSI Enhancer Discord\uitgaven\0.3.1.md`; de links erin werken,
  want de release bestaat. Of hij er ook staat weet de app niet -- vraag het.
  **Plaatsen doet de gebruiker zelf.**
- **Over uitgeven:** het script werkt
  (`node scripts/uitgeven.mjs <versie> --publiceer --notities uitgaven/<versie>.md`).
  Wel een valkuil die twee keer is misgegaan: met `--repo` werkt `gh` puur aan de
  serverkant, en dan moet de tag al gepusht zijn -- een tag die alleen lokaal
  staat geeft een release die nergens aan hangt.
- **De kilometerteller is niet in het spel bevestigd** — zie §4.
- **Twee getallen op hetzelfde scherm spreken elkaar tegen.** Op het remisescherm
  zeggen de tegels "0 van 2 bestemmingen" (dat gaat over je dienst) terwijl het
  venstertje "1 van de 87 op deze kaart" zegt. Allebei kloppen ze voor hun eigen
  vraag; naast elkaar lezen ze verkeerd. `duty:yards` is nog dienstgebaseerd.
- **De vergunningenlijst is nooit met een echte vergunning gezien.** Die verschijnt
  pas als je een examen werkelijk rijdt en haalt; de probe komt niet verder dan
  het examenscherm. De code volgt dezelfde logica als het oude `CareerPanel`.
- **Vrij rijden kan geen remise kiezen.** `duty:yards` heeft een dienst nodig, en
  bij vrij rijden is er vooraf geen; het remisescherm toont daar alleen de tegel
  om er een bij te halen. De IBIS-codes komen er onderweg alsnog, uit het
  wagenpark naast de bus (volgOmloopInOmsi).

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

**Een dienst begint met aanmelden** (sinds 22-09-2026). De volgorde in de overlay
is nu die van een remise, en hij speelt zich helemaal op de telefoon af -- dat is
het navigatiepaneel, `PANELS[1]`, het paneel met de appbalk eronder:

1. `AanmeldPaneel` -- personeelsnummer, dan pincode, op een cijferblok. De
   getallen komen uit het profiel (`nieuweDienstgegevens()` in `core/career.ts`,
   aangevuld door `zorgVoorDienstgegevens()` in `core/profiles.ts`) en reizen mee
   in het beeld als `frame.chauffeur`. Ze staan ook gewoon in het
   chauffeursoverzicht onder "je dienstgegevens", want wie ze kwijt is moet ze
   ergens terug kunnen lezen. Er wordt niets beveiligd: dit is je eigen pc, en
   dat je je aanmeldt is het punt, niet dat iemand buitengesloten wordt. Een
   chauffeur zonder gegevens krijgt een doorgaan-knop.
2. `DienstOpdracht` -- lijn, omloop, vertrek, terug om, aantal ritten, en
   "dienst aanvaarden". Je tekent voor de hele dienst en niet per rit:
   `aanvaardVoor === dienstSleutel`, en `dienstSleutel` is kaart, omloop en
   vertrektijd.
3. Pas daarna het gewone toestel: de kaart, de apps en de balk. En pas daarna
   vult het dienstpaneel zich met welke omloop je in OMSI moet kiezen en welke
   codes in de IBIS; tot die tijd staat daar alleen "meld je eerst aan op de
   telefoon" (`ovl.signonFirst`).

**Aanmelden en aanvaarden overleven het sluiten van de overlay.** Het
hoofdproces gooit het overlayvenster weg bij "Overlay verbergen" en bouwt bij
het openen een vers venster, dus wat alleen in de state stond was weg: midden
in je dienst moest je opnieuw nummer, pincode en handtekening geven. Daarom
schrijft de overlay elke stap ook naar localStorage, onder `overlay.handtekening`
(`HANDTEKENING` in `overlay.tsx`): één regel `{ sleutel, aanvaardVoor }` die
steeds overschreven wordt. De sleutel is profiel-id, `dienstSleutel` en
`confirmedAt` van de aangenomen dienst, zoals `activeKey` in `App.tsx`. Een vers
venster haalt het profiel op (`window.career.career()`) en neemt de aanmelding
alleen over als die sleutel klopt; tot dan schrijft het niets, anders
overschrijft het de regel voordat het hem gelezen heeft.

Opnieuw aanmelden hoort dus bij een andere chauffeur en bij elke nieuw
aangenomen dienst -- ook dezelfde omloop een dag later, want die krijgt een
nieuwe `confirmedAt`. Een herstart van de app midden in de dienst houdt de
sleutel, en dus de handtekening. Gewist wordt er niets: een oude regel past
gewoon nergens meer op. **Vrij rijden wordt niet bewaard**, alleen in het venster
zelf. Het staat niet in het profiel, het beeld draagt niets dat per start
verschilt, en `free:start` trekt bij dezelfde lijn en tijd al gauw dezelfde
omloop -- met alleen de dienst als sleutel kwam een volgende vrije rit, ook van
een andere chauffeur, al aangemeld op. Om dezelfde reden telt een vrije rit
terwijl er nog een dienst aangenomen staat niet mee: bewaard wordt alleen de
dienst die in het profiel staat.

**Alles wat je in de overlay kunt indrukken heeft `data-hit` nodig.** Het
overlayvenster ligt over het hele scherm en laat muisklikken dóór naar OMSI --
anders zou het ze overal opvangen. Alleen waar `[data-hit]` in de bovenliggende
elementen staat, wordt de muis even opgevraagd (zie de `mousemove`-luisteraar in
`overlay.tsx` en `overlayHit` in `main/index.ts`). Het cijferblok stond er
zonder, en dus was het een plaatje: je zag de toetsen, maar de klik ging dwars
door de bus in. Dit kost je niets bij het bouwen en niets bij het typen -- het
valt pas op als je het in het spel probeert. Zet het op het buitenste blok van
elk nieuw paneel dat een knop bevat. Dat geldt ook voor de apps op de telefoon:
de kaartjes en de pauze-app misten het net zo en hebben het nu op `.kaartjes`
en `.app-pauze`.

Nagerekend met `scripts/probe-aanmelden.cjs`: het telt de toetsen per paneel (12
in het navigatiepaneel, 0 in het dienstpaneel), kijkt of de appbalk en de kaart
er zolang niet zijn, tikt een verkeerd nummer in, dan het goede, dan de pincode,
en drukt op "dienst aanvaarden" om te zien of de balk en de IBIS-stap terugkomen.
Met een uitvoermap erachter schrijft hij er twee plaatjes bij.

**De dienstpas laat de gegevens eenmaal zien** (sinds 22-09-2026). De cijfers
werden stilletjes aangemaakt, en dat liet de chauffeur achter met een cijferblok
in de bus en geen idee wat hij moest intoetsen -- de gebruiker: "ook kon ik
nergens zien wat mijn code is en waar ik die aanmaak". Dus:

- `Dienstpas.tsx` -- een venstertje met het nummer, de pincode en waar ze blijven
  staan, plus een knop die je meteen naar je staat van dienst brengt.
- Het hangt in de `dialoog`-sleuf van `Starthub.tsx`. Dat is het eerste scherm na
  het kiezen van een profiel, en het moest **binnen** het `.hub`-element, want
  daar hangen de kleuren aan; ernaast valt het terug op de oude glaswereld en
  staat het in de lichte stand donker op donker.
- `CareerState.pasGezien` onthoudt dat het geweest is, via `career:pas:gezien` in
  het hoofdproces. Het staat in het profiel en niet bij de instellingen: het
  nummer hoort bij de chauffeur, dus een tweede chauffeur op dezelfde pc krijgt
  zijn pas ook een keer te zien. Een profiel van voor deze versie heeft de vlag
  niet en krijgt het venster dus bij de eerstvolgende start.
- Proef: `scripts/probe-dienstpas.cjs`, met `--donker` voor de andere stand.

Nog niet gebouwd:

1. **Knop in de overlay zelf om de indeling aan te passen** — "een knopje met pas
   layout aan". Nu kan dat via de app of Ctrl+Alt+O. Vertaling: `ovl.layout`.
2. **Het infoscherm toont eerst wat er ingetoetst moet worden** (lijn + route uit
   het IBIS-plan), en schakelt om zodra de IBIS gevuld is. Teksten:
   `ovl.ibisTitle`, `ovl.ibisWaiting`, `ovl.ibisNoSupport`.
3. **Situatie klaarzetten** — gebouwd. "Dienst starten" schrijft de situatie en
   start daarna pas het spel; de losse knop is weg.

**Het rijscherm heeft een eigen indeling** (sinds 22-09-2026). Er zijn nu drie:

| `data-vol` | wanneer | vel | kaart |
| --- | --- | --- | --- |
| `nee` | de keuzestappen | smalle kolom links, `clamp(288px, 27.4%, 420px)` | vult het venster, ondergrond |
| `ja` | profiel, modus, instellingen | het hele venster | weggelaten |
| `rijdend` | terwijl je rijdt | alles behalve de kaartkolom | kolom rechts, `clamp(300px, 32%, 480px)`, met eigen rand |

De derde is er gekomen omdat de tweede indeling niet klopte zodra je reed: op dat
vel staat de hele dienstregeling, de rit die loopt, de cijfers en de knoppen, en
in 368 pixels werd dat een koker met een schuifbalk waarin een haltenaam als
"Gesamtschule Hohenkirchen Bussteig 1" niet op een regel paste. De gebruiker:
"dit menu moet groter en de navigatie mag als een kleiner element in de
hoofdapp." Op 1344 is het vel nu 843 in plaats van 368.

Twee dingen die erbij horen en makkelijk vergeten worden: het vel wordt korter
(`calc(100% - 85px - 115px)`) om plaats te maken voor de knoppenrij, en die rij
houdt op waar de kaart begint. Bij `data-vol='nee'` mag een knop over de kaart
liggen -- daar is ze de ondergrond -- maar hier is ze een element met een rand,
en dan is dat gewoon een knop op de verkeerde plek.

**De verdeling is te verslepen** (sinds 22-09-2026). Welke van de twee het
grootst hoort te zijn weet de app niet -- wie op een tweede scherm rijdt kijkt
vooral naar de kaart, wie de overlay gebruikt juist niet -- dus mag de gebruiker
het zelf zeggen. De greep ligt in de kier ertussen (`.navgreep`), is breder dan
die kier want anders vind je hem niet met de muis, en wordt pas zichtbaar als je
er met de muis bij komt. Dubbelklikken zet hem terug op 0.32.

Bewaard als `Settings.navDeel`, een **deel** van de breedte en geen aantal
pixels: het venster verandert van maat, en een vaste kolom wordt dan op de ene
machine een strookje en op de andere de helft. `readSettings` knijpt hem tussen
0.18 en 0.62; zonder die grenzen zou een aangepast bestand de kaart tot een
streep maken en de greep onvindbaar. Wegschrijven gebeurt bij het loslaten en
niet tijdens het slepen -- anders is het een schrijfactie per pixel.

**Het rijscherm heeft een eigen stap in de balk**, `rijden`, met een eigen
icoontje (een open stuur, `Icoon.tsx`). Het stond op `stap="bus"`, en dan wees de
balk de busstap aan terwijl je allang onderweg was. De stap staat niet in
`STAPPEN_DIENST` en de andere twee lijsten -- een stap waar je niet naartoe kunt
is geen stap -- het rijscherm plakt hem er zelf achter.

**Je personeelsnummer en pincode staan op het rijscherm**, in dezelfde vakjes als
de codes voor de IBIS. Ze staan ook bij de staat van dienst, en dat is de plek om
ze op te zoeken; hier hoef je niets op te zoeken, want dit is het scherm dat
openstaat terwijl je in de bus zit met het cijferblok voor je.

Proef: `scripts/probe-rijscherm.cjs`. Hij meet op twee venstermaten of het vel
breder is dan de oude kolom, of de kaart ernaast staat zonder overlap, of alles
binnen het venster valt, of de hoofdknop niet over de kaart ligt, of de lange
haltenamen op een regel blijven, of de greep ertussen ligt, of de dienstgegevens
erop staan en of de balk de laatste stap aanwijst met een eigen vorm. Hij versleept
de greep ook echt, met muisgebeurtenissen en niet met een nagebootste aanroep, en
kijkt of de kaart meebeweegt en of er iets bewaard wordt. Met een uitvoermap
erachter schrijft hij de plaatjes; `--donker` voor de andere stand, `--breedte`
voor een eigen maat.

**Beginnen terwijl OMSI al draait** (sinds 22-09-2026). De app zet een dienst
klaar in het startscherm van OMSI -- kaart, situatie, dienstregeling, bus bij de
halte -- en start daarna het spel. Dat werkt **alleen bij het opstarten**: OMSI
leest dat scherm een keer en daarna nooit meer. Wie de app opende terwijl hij al
in de bus zat, kreeg dus een situatie klaargezet die hij pas de volgende keer zou
zien, plus achteraf de mededeling dat hij het spel maar opnieuw moest starten.

Nu peilt de app op de busstap of OMSI draait (elke vijf tellen, `omsiRunning`, en
alleen daar -- het is een `tasklist` van een tiende seconde), zegt het in de
waarschuwing boven de lijst, en maakt van START een vraag met twee antwoorden die
allebei ergens toe leiden (`DraaitDialog.tsx`):

- **Meerijden** -- `BeginRequest.meerijden`. Het hoofdproces slaat
  `prepareSituation` over: schrijven zou deze sessie niets opleveren en wel het
  startscherm van de volgende keer overschrijven met een dienst die dan misschien
  allang afgerond is. De dienst gaat lopen, de overlay gaat open, en die vertelt
  welke kaart, welke omloop en welke codes je zelf kiest -- precies de schermen
  (`SelectPanel`, `IbisPanel`) die er al waren voor wie zijn dienst in het spel
  aanwees. `BeginResult.meegereden` zorgt dat de app daarna niet "alles staat
  klaar" zegt, want dat zou niet waar zijn.
- **Toch klaarzetten** -- het oude gedrag, met de melding dat OMSI opnieuw moet.

**Niet bij vrij rijden.** Daar is het klaarzetten niet een deel van het starten
maar het hele starten: er is geen dienst om mee te rijden, alleen een situatie
die OMSI moet inlezen. De vraag komt daar dus niet en de oude melding klopt.

**De app sluit OMSI niet af** om het opnieuw te kunnen starten. Dat is het spel
van de gebruiker, met een rit erin die misschien nog loopt.

**Een andere dienst kiezen kan op de telefoon** (sinds 27-09-2026). Een
gebruiker vroeg of hij een andere omloop kon aannemen zonder OMSI opnieuw te
starten. Dat kon al via annuleren + nieuwe dienst + meerijden, maar over drie
schermen van de app. Nu staat er op de dienstopdracht en onderaan de dienst-app
een knop "andere dienst kiezen" (`AndereDienst` in `telefoon.tsx`):

- Het aanbod rekent het hoofdproces uit (`dienstAanbod` in `main/index.ts`):
  dezelfde kaart, ongeveer dezelfde lengte, vertrek vanaf de klok van OMSI tot
  twee uur later (`DutyRequest.earliestStart/latestStart`), en alleen omlopen die
  rijden op de datum die het spel speelt (`runsOn`) -- anders staan ze niet in
  het dienstregelingsmenu. In de carrière alleen vergunde lijnen. Zonder verse
  live.json valt het terug op de tijd en datum van de huidige dienst.
- De telefoon kiest met een volgnummer uit het aanbod en stuurt geen dienst
  terug; een tablet op het netwerk kan dus niets anders laten aannemen.
- `wisselDienst` is annuleren en aannemen in één: de oude dienst wordt niet
  geboekt, de bus blijft dezelfde (`vehicleOverride`), er wordt niets klaargezet
  (`klaargezet` gaat weg, zoals bij meerijden), en de nulmeting begint opnieuw.
  Aangemeld blijf je; tekenen moet opnieuw, want het is een andere opdracht.
- Het hoofdvenster hoort het via `dienst:gewisseld` en blijft op het rijscherm
  (`gewisseldRef` in `App.tsx`); zonder dat zou het nieuwe `confirmedAt` de
  vraag "verder rijden of verwijderen" oproepen.
- Niet bij een examen en niet bij vrij rijden: `TelefoonStand.wisselbaar`.

Nog niet in het spel nagekeken; alleen het scherm is met nepgegevens bekeken.

**De rittenstaat: per halte gepland tegenover werkelijk vertrek** (sinds
28-09-2026). Fase 1 van het busbedrijf-plan, en op zichzelf al nuttig: tot nu
toe telde alleen de vertraging aan het eind, en wie de hele rit te vroeg reed en
aan het eind wachtte was "op tijd".

- **De meetlus** (`meet` in `main/index.ts`) draait elke seconde zolang
  `activeDuty.startedAt` staat, los van `pushFrame` -- die liep alleen met de
  overlay open of een toestel erbij. Hij valt nu ook de nulmeting
  (`captureBaseline`). Het spoor gaat regel voor regel naar
  `%APPDATA%\omsi-enhancer\ritten\<profiel>-<aangenomen>.jsonl`; de laatste
  twintig blijven staan, om een proefrit na te kunnen lezen.
- **Wat een vertrek is** (`core/rittenstaat.ts`): het wegrijden rond het moment
  dat OMSI de volgende halte laat verspringen. Wanneer OMSI dat doet (aankomst,
  deur dicht, wegrijden) is **niet in het spel nagekeken**; de regel geeft in
  alle drie de gevallen hetzelfde vertrek (`probe-rittenstaat.ts`). Tot het in
  het spel bevestigd is, staat er "voorlopig".
- **Alleen met de dienstregeling uit het menu, en de halte op naam**
  (`LiveStatus.halteOpNaam`). De terugval van `stopIndex` op de klok is goed om
  te tonen, niet om op te meten. Dus alleen op 2.3.004; anders geen rittenstaat,
  en nooit een nul.
- **Oordeel alleen bij een vaste tijd** (`DutyLeg.stopVast`, uit
  `vasteVertrektijden`: vertrek, anders aankomst, uit het rijtijdprofiel; het
  beginpunt ligt altijd vast). Andere haltes tonen de verdeelde tijd met
  "geschat" en krijgen geen oordeel. Diensten die al in een profiel stonden
  hebben geen `stopVast`; daar is alleen het beginpunt vast.
- **De norm is voorlopig**: meer dan 30 s te vroeg of 3 min te laat (`NORM`).
  Luc kiest de definitieve. Op het scherm staan de tijden op de minuut
  (Luc: "de seconden mogen weg"); het oordeel rekent wel op de seconde. De
  rittenstaat verandert nog niets aan loon,
  examen of rang; hij staat in `CareerEntry.rittenstaat` en is uit te klappen
  onder de laatste diensten op de staat van dienst (`Rittenstaat.tsx`).
- Na een wissel via de telefoon begint een nieuw spoor; de ritten van de oude
  dienst tellen niet mee (`rittenstaatVanDienst` kijkt naar de dienstsleutel
  in de eerste regel).

**Het busbedrijf, stap 1: de kern** (sinds 28-09-2026). Luc wil alles uit de
Bus Company Simulator en de meldkamer-add-on, behalve 3D en multiplayer
("laat de multiplayer maar los, de rest wel"). Volgorde: kern → bussen en
onderhoud → personeel en rooster → opleidingen en levels → telefoon-apps →
flitsers, controleurs, gebeurtenissen en meldkamer → add-on-manager.

- **Regels in `core/bedrijf.ts`**, zonder schijf en zonder Electron; bedragen
  in hele centen, alle getallen in `REGELS`. Het bedrijf staat in het profiel
  (`CareerState.bedrijf`), het scherm is `Bedrijf.tsx` (knop "Mijn bedrijf" in
  het hoofdmenu, `screen === "bedrijf"`).
- **Concessies op bestaande lijnen** (vrij tekenen kan in OMSI niet). Inschrijven
  kost 2000 + 500 per omloop; een concessie loopt 28 bedrijfsdagen en wordt
  verlengd bij reputatie ≥ 45. Het hoofdproces leest de lijn zelf uit de kaart
  (`bedrijf:inschrijven`), het venster stuurt alleen kaart en lijnbestand.
- **De bedrijfsdag is een knop** ("dag afsluiten"): per concessie de vergoeding
  (95/uur, ±10 % met de reputatie) en de inhuur (86/uur -- tot er eigen bussen
  en personeel zijn). Dienstregelingsuren = ritvertrekken × gemiddelde rittijd
  uit `listLines`; dat telt alle dagsoorten mee, dus het is ruim. Gerekend.
- **Je eigen dienst telt gemeten mee** (`boekEigenDienst`): per tijdhalte op een
  lijn van je concessies een bonus of malus uit de rittenstaat, en de reputatie
  beweegt met het aandeel op tijd. Zonder rittenstaat boekt een dienst niets.
- Eén munt voor het hele bedrijf, getoond als euro, ook voor DM-kaarten.
- Proef: `scripts/probe-bedrijf.ts`.

**Stap 2: bussen, werkplaats, en een eigen app met dashboard** (28-09-2026).
Luc: "het busbedrijf moet zijn eigen UI krijgen en een uitgebreid dashboard".
- **Eigen scherm** (`BedrijfApp` in `Bedrijf.tsx`): venstervullend, zijbalk met
  Dashboard / Concessies / Wagenpark / Busmarkt / Boekingen, "dag afsluiten"
  onderaan. Geen stap van het opzetscherm meer; `App.tsx` geeft het terug vóór
  het hoofdmenu. Kleuren van `.hub`, dus beide thema's.
- **Dashboard**: zes tegels (kas, resultaat vandaag, reputatie met de
  verlenggrens, concessies, wagenpark, aandeel eigen bussen), grafieken van kas,
  resultaat en reputatie per bedrijfsdag (`BedrijfGrafiek.tsx`, eigen SVG, één
  reeks en één as per grafiek, kruisdraad bij aanwijzen), "aandacht nodig",
  staat van het wagenpark en de laatste boekingen. De grafieken komen uit
  `Bedrijf.historie`, dat `sluitDagAf` elke dag aanvult; het resultaat per dag
  telt investeringen (startkapitaal, bussen kopen en verkopen) niet mee.
- **Bussen** (`core/bedrijf.ts`): nieuw uit de geïnstalleerde bussen (prijs per
  vorm, uit de naam: midi/solo/geleed/dubbel), tweedehands vier per bedrijfsdag
  met een vaste toevalsreeks per dag. Een bus heeft km, staat en schade; hij
  slijt met de uren die hij rijdt, onderhoud en reparatie kosten een dag in de
  werkplaats, verkopen levert 85 % van de waarde. Het wagenpark is één poel:
  zoveel omlopen als er inzetbare bussen zijn rijden goedkoper (alleen de
  materieelkosten vallen weg; de chauffeur blijft ingehuurd tot stap 3). Welke
  vorm een omloop vraagt telt nog niet mee.
- **Schade uit je eigen rit**: aanrijdingen uit de rittenstaat komen op de eigen
  bus waarmee je reed (op pad van de bus, `boekEigenDienst(…, busPad)`).
- Startkapitaal 150.000; alle bedragen blijven in `REGELS`.

**Stap 3: personeel** (28-09-2026). Tabblad Personeel en een tegel op het
dashboard.
- **Rooster** (`dagprognose`), in uren: eerst de eigen chauffeurs die werken
  (niet ziek, 8 u per dienst), dan wat je zelf reed (`Bedrijf.zelfUren`,
  opgehoogd in `boekEigenDienst` naar rato van de gehaalde haltes, zoals het
  loon -- zonder rittenstaat telt het ook, want gereden is gereden), en wat
  overblijft is open en wordt ingehuurd. Eerst stond jij vooraan met hele
  diensten: een half uur invallen zette dan een betaalde chauffeur thuis. De
  uren van alle concessies samen worden op een tiende afgerond (drijvende komma
  gaf anders een spookdienst). `career:complete` boekt alleen zolang er een
  dienst loopt, zodat één dienst niet twee keer telt. `dagprognose` is nu de enige plek waar de dag
  wordt uitgerekend; `sluitDagAf` boekt precies wat die zegt (proef).
- **Geld**: de inhuur (86/u) is materieel 48 + chauffeur 38. Een eigen chauffeur
  bespaart 8 × 38 per dienst tegen een dagloon van 190 + 0,80 per
  ervaringspunt; een monteur kost 210 + 0,90 per punt en maakt onderhoud 15 %
  goedkoper en slijtage 10 % trager per monteur (tot 45 % en 40 %).
- **Mensen** (`Medewerker`): ervaring groeit met gewerkte dagen, tevredenheid
  beweegt naar een doel (60 bij marktloon, hoger bij meer betalen, lager als
  chauffeurs het werk niet rond krijgen), 2 % kans per dag op ziekte van 1-3
  dagen, onder 25 tevredenheid 10 % kans per dag op vertrek. Ervaren chauffeurs
  duwen de reputatie met een kans omhoog, beginners omlaag. Alle toeval komt uit
  een vaste reeks per dag: dezelfde dag geeft dezelfde uitkomst.
- **Sollicitanten**: drie per dag, meer beginners dan ervaren; het venster en het
  hoofdproces rekenen ze allebei met `sollicitanten()`. Ontslag kost vijf
  dagen loon en drie punten tevredenheid bij de rest; opslag is 10 %.

**Stap 4: niveaus, opleidingen en de werkplaats zelf** (28-09-2026). Tabblad
Opleidingen; niveau en XP-balk in de zijbalk.
- **Niveaus** (`NIVEAUS`, `niveauVan`, `heeftVoordeel`): XP voor elke twee
  dienstregelingsuren, 10 voor een dag met winst, 5 + 1 per halte op tijd voor
  een eigen dienst, 100 voor een afgeronde opleiding. Zeven niveaus (0, 300,
  800, 1600, 3000, 5000, 8000 XP), elk met een voordeel: sollicitant erbij,
  twee tweedehands bussen erbij, inschrijven 10 % goedkoper, vergoeding +3 %,
  werkplaats 10 % goedkoper, vergoeding nog eens +3 %. Een niveau erbij staat
  als boeking van nul euro in de boeken, zodat je ziet wanneer het kwam.
- **Opleidingen voor de eigenaar** (`OPLEIDINGEN`, `volgOpleiding`): werkplaats,
  schadeherstel, planner (inhuur 3 % goedkoper), instructeur (personeel 50 %
  sneller ervaring), onderhandelen (vergoeding +2 %). Elk kost geld en dagen en
  vraagt een niveau; `sluitDagAf` meldt ze af. Alle kortingen en toeslagen komen
  uit één plek, `bedrijfsfactoren()`, en `dagprognose` rekent ermee, zodat de
  prognose en de afsluiting gelijk blijven (proef, ook op niveau 5).
- **Bijscholing** (`stuurOpBijscholing`): 500, de medewerker is een dag weg
  (`cursusTot`, telt niet in het rooster) en krijgt +12 ervaring en +3
  tevredenheid.
- **Zelf onderhouden en repareren** (`zelfOnderhoud`, `zelfRepareren`): na de
  opleiding werkplaats of schadeherstel. Je betaalt 30 % (alleen de onderdelen)
  en speelt een spelletje (`WerkplaatsSpel` in `BedrijfOpleiding.tsx`):
  inspectie (12 onderdelen, 3-5 versleten, 25 s, elk goed onderdeel dat je
  openmaakt kost 5 %) of een stappenplan in de goede volgorde (elke fout 20 %).
  De score (0-1) bepaalt hoeveel beter de bus wordt: onderhoud 40-100 % van wat
  er aan staat ontbreekt, reparatie 30-100 % van de schade. Het hoofdproces
  klemt de score, dus een vreemde waarde uit het venster doet niets geks.

**Stap 5: post in de app, en je eigen lijn op de telefoon** (28-09-2026).
Eerst stond er een bedrijfsapp op de telefoon (overzicht, geld, post). Luc: "de
telefoon wordt alleen ingame gebruikt, dus alleen info die relevant is tijdens
het rijden moet in de telefoon, de rest kan in de app". Dus:
- **Post staat in Mijn bedrijf** (tabblad Post, `BedrijfPost.tsx`, met een
  teller in de zijbalk). Lezen via `bedrijf:post` (id, of zonder id alles).
- **Het postvak** (`Bedrijf.post`, `Bericht`, `meld`, `leesPost`): een bericht
  is een soort met waarden, de tekst staat in de vertalingen (`tb.msg.*`), dus
  het profiel wisselt niet mee met de taal. Berichten komen bij oprichten, bij
  een eigen dienst, en bij het afsluiten van de dag: dagrapport, ziekmelding,
  vertrek, ontevreden (alleen op het moment dat iemand onder 35 zakt),
  concessie loopt over drie dagen af (met of hij bij de reputatie van nu
  verlengd wordt), verlengd, vervallen, bus terug uit de werkplaats, bus onder
  staat 40, rood staan, opleiding klaar en nieuw niveau. Zestig bewaard.
- **Op de telefoon** alleen een kaart bovenaan de rit-app (`BedrijfKaart` in
  `telefoonBedrijf.tsx`), en alleen als de rit die nu loopt op een lijn van je
  eigen bedrijf ligt: hoeveel tijdhaltes op tijd, te vroeg en te laat met wat
  elk oplevert of kost, wat de dienst tot nu toe oplevert, je reputatie (rood
  onder de verlenggrens), hoeveel dagen de concessie nog loopt, en de staat en
  schade van de eigen bus waarin je zit. Geen eigen app en geen knop erbij.
- **De telling** komt uit dezelfde som als de boeking (`eigenDienstTelling`,
  ook gebruikt door `boekEigenDienst`), dus wat de telefoon zegt is wat er
  straks geboekt wordt (proef). Het hoofdproces leest het spoor alleen opnieuw
  als de meetlus er iets aan toevoegt (`lopendeStaat`), niet elke tik, en
  `ritVoorBedrijf` wordt alleen opnieuw gerekend als bedrijf, dienst of telling
  veranderen. Het gaat mee in het beeld van de overlay en de tablet.
- Proef: `probe-bedrijf.ts` (post, kaart, telling gelijk aan boeking). De
  telefoon en het postvak op beeld in een proefopstelling buiten het project;
  `probe-apparaat.cjs` (Electron) is hier niet gedraaid.

**Stap 6: onderweg -- flitspalen, controleurs en gebeurtenissen** (28-09-2026).
Alles in `core/onderweg.ts`; de app kan in OMSI niets neerzetten, dus alles is
gebouwd op wat al gemeten wordt. De meldkamer is er niet bij: die had Luc
eerder afgewezen.
- **Flitspalen**: een vaste keuze van 15 % van de echte snelheidsborden op de
  kaart (dezelfde borden als de snelheid in de navigatie), per kaart altijd
  dezelfde. De meetlus kijkt elke seconde of de bus langs een paal kwam aan de
  kant waar het bord voor geldt (rechts van de rijrichting, dezelfde regel als
  `signsAlong` in RouteMap), en of hij na 3 km/u correctie te hard reed. Boete
  20 euro plus 6 per km/u. Een flits gaat als regel in het spoor
  (`t: 'flits'`), komt bij de halte in de rittenstaat, en ligt een halve minuut
  als rode melding bovenin de telefoon.
- **Gebeurtenissen** (`gebeurtenisVoor`): 60 % van de diensten, geen bij een
  examen, uit een zaad van profiel + aannametijd + dienst, dus na een herstart
  dezelfde. Stiptheidsactie (1 euro per tijdhalte op tijd, eraf voor te vroeg
  of te laat), comfortcontrole (hoogstens 2 keer hard remmen of optrekken: 15
  euro), schadevrije dienst (10 euro), flitsactie (45 % van de borden flitst)
  en controleurs. De eerste vier staan bij de dienstopdracht op de telefoon;
  tijdens de rit staat er een kaart met de tussenstand boven de rit-app.
- **Controleurs**: echte kaartcontrole (zwartrijders) kan niet -- OMSI weet
  niet wie een kaartje heeft. Ze controleren daarom de chauffeur, zoals een
  meerijder van de opdrachtgever: ze stappen onaangekondigd in op een rit met
  genoeg haltes en rijden drie tot zes haltes mee; de kaart verschijnt pas als
  ze aan boord zijn. Ze noteren te vroeg vertrekken, hard remmen of optrekken,
  aanrijdingen en flitsen (dubbel) en te weinig wisselgeld. Rapport: 0 fouten
  +20, 1-2 +5, 3-4 niets, 5 of meer -15.
- **Wisselgeld** telt `telVerkoop` (een verkoop waarbij `ticketSlecht` ooit
  aan stond); de meetlus schrijft het verschil als `t: 'wisselgeld'` in het
  spoor. Let op: `telVerkoop` draait in `pushFrame`, dus alleen zolang de
  overlay of een tablet meekijkt -- de kaartverkoop zit in de overlay.
- **Afrekening**: `onderwegVan` bij het afronden (beide wegen), in
  `CareerEntry.onderweg`; het bedrag zit in `pay`, zodat het loon is wat je
  overhoudt (een boete kan het loon van een korte dienst overtreffen). In het
  logboek staat een regel met flitsen, boetes en de uitslag. Wat niet gemeten
  is (geen rittenstaat, geen tellers), telt niet voor en niet tegen.
- Proef: `scripts/probe-onderweg.ts`. Niet in OMSI gezien: of de kant van het
  bord en het bereik van 14 m kloppen op een echte kaart, en of `ticketSlecht`
  bij een verkoop betrouwbaar aan gaat.

**Stap 7: de add-on-manager** (28-09-2026). Knop "Add-ons" in het hoofdmenu,
eigen scherm (`Addons.tsx`, opbouw uit bedrijf.css) met Installeren,
Geïnstalleerd en Foutcontrole. Geen downloadlijst: je installeert wat je zelf
gedownload hebt (Luc koos optie 1; veel makers verbieden verspreiden).
- **Zip** (`core/zip.ts`): eigen lezer op zlib, geen afhankelijkheid erbij.
  Leest alleen de inhoudsopgave en daarna één bestand tegelijk (een kaart kan
  gigabytes zijn), namen in cp437 of UTF-8, crc wordt nagekeken. Geen zip64,
  geen wachtwoord, geen rar/7z -- dan zegt het venster: pak zelf uit en kies
  de map. Een map slepen of kiezen kan altijd.
- **Waar hoort het** (`plaatsVan` in `core/addon.ts`): een bekende OMSI-map
  in het pad (`Vehicles`, `maps`, `Sceneryobjects`, `Splines`, `Fonts`,
  `Texture`, ...) wordt het begin, wat ervoor staat (`OMSI 2/`, `Mijn bus
  v2/`) valt weg; een losse map met een `.bus`/`.ovh` gaat naar `Vehicles`,
  een met `global.cfg` naar `maps` -- die regel gaat voor, anders zou de
  `Texture`-map ín een bus naar OMSI's `Texture` gaan. Wat nergens past
  (leesmij, plaatjes) wordt niet geplaatst en staat apart in het plan.
- **Plan en installeren**: per bestand nieuw / staat er al precies zo / wordt
  overschreven (met de add-on waar het nu van is). Overschrijven maakt eerst
  een reservekopie in `%APPDATA%\omsi-enhancer\addon-reserve\<id>`. Het
  register is `addons.json`: per bestand het pad, de sha1 en hoe het was
  (`nieuw`, `gelijk`, `overschreven`). Niet als OMSI draait.
- **Verwijderen**: aangepast sinds de installatie → blijft (en wordt
  genoemd); overschreven → reserve terug; stond er al, of een andere add-on
  heeft het ook → blijft; anders weg, en lege mappen erachteraan, nooit de
  OMSI-mappen zelf.
- **Foutcontrole** (`core/addoncheck.ts`): per busmap alle `.bus`/`.ovh`:
  model.cfg, o3d's, texturen (via `leesBusModel`), scripts en varlists,
  `[paths]`/`[passengercabin]`, sound.cfg en de wav's erin. Per kaart: alle
  objecten en splines op de tegels (met hoe vaak), en in elk object dat er is
  zijn `[mesh]` en `[matl]`/`[texture]`; voertuigen uit `ailists.cfg`; de
  kaartset. Hoofdletters maken niet uit (`opSchijf`). Wat niet genoemd wordt,
  wordt niet gezocht: een lege lijst is "niets gevonden", geen garantie.
- Lange klussen lopen in stukjes in het hoofdproces met een pauze elke 25 ms
  (`inStukjes`), één tegelijk, met `addon:voortgang` naar het venster. Na
  installeren of verwijderen gaan de kaart- en bussencaches weg
  (`vergeetKaarten`).
- Meegenomen: in `busmodel.ts` splitste `/[\/]/` alleen op `/`; texturen die
  als `Repaints\x.bmp` genoemd worden, werden daardoor niet gevonden (ook op
  Windows, bij de busfoto's). Nu `/[\\/]/`.
- Proef: `scripts/probe-addon.ts` (zip, plaatsing, plan, installeren,
  verwijderen, foutcontrole op een nagebouwde OMSI-map). Niet gedaan: een echte
  add-on van een paar gigabyte, en de foutcontrole op een echte kaart --
  vooral of objecten hun `model/` en `texture/` echt zo vinden.

**Navigatie: doorzichtig, vaste zoom, en haltenamen die niet meer wegvallen**
(28-09-2026). Drie vragen van gebruikers, via Luc.
- **Achtergrond uit** (`PanelState.glas`, knop met een vierkantje in de
  titelbalk van de navigatie): het paneel, het waas, de rand en de
  kaartondergrond verdwijnen; de route, de borden en de namen blijven vol, met
  een dikkere donkere rand om de namen. Wat je leest -- manoeuvrebalk,
  snelheid, voetregel, knoppen, het balkje onderin, de schermen van de apps --
  krijgt een eigen vaste ondergrond. De schuif regelt in die stand alleen het
  wegennet. Alleen bij de navigatie; het dienstpaneel is tekst. Let op: de
  schuif doet in de gewone stand nog steeds alleen `.panel-body`; de
  `--glas-overlay`-kleuren in theme.css rekenen met `--fade` op `.overlay-body`,
  waar hij niet gezet is, dus het glas zelf vervaagt niet (was al zo).
- **Zoom automatisch of vast** (`PanelState.zoomVast`, `NavZoom` in RouteMap,
  knop "A" / blok bij de plus en min): automatisch is zoals het was
  (`liveZoom`, verder uit naarmate je harder rijdt); vast houdt de stand, en
  plus, min, het wieltje en knijpen verzetten dan de vaste stand in plaats van
  na zes tellen terug te veren (bewaard een halve tel nadat je stopt). De
  overlay bewaart het in de indeling, de tablet in zijn eigen localStorage.
- **Haltenamen**: de namen werden in dienstvolgorde over alle ritten geplaatst,
  alleen rechts van het bord; een gehad perron of een halte van de rit terug
  aan de overkant won het van de halte waar je heen rijdt ("ik mis soms
  haltes"). Nu eerst de volgende halte, dan de rest van deze rit, dan het
  begin, dan de rest; rechts, links, boven, onder; en als het niet past zonder
  de plaatsnaam ("Ortsm M P1"). Waar de balk, de snelheid, de schaalbalk en de
  knoppen over de kaart liggen (`bezetOpDeKaart` in navigatie.tsx) komt geen
  naam. Een halte die niet op de kaart gevonden wordt, krijgt nog steeds geen
  bord, maar staat nu één keer per dienst in het logboek ("navigatie: ...
  niet op de kaart gevonden"); dan is `probe-stopobjects.ts` de volgende stap.
- Nagekeken in een proefopstelling met een nagebouwd perroncluster; niet in
  OMSI. `screenshotNav.cjs` en `probe-zoom.cjs`: de laatste draait en klopt.

Proef in het spel die de open vragen beantwoordt: OMSI 2.3.004, dienstregeling
via het menu, drie haltes: A 60 s voor de plantijd weg, B 30 s na, C
doorrijden. Daarna het spoor in de map `ritten` naast de rittenstaat leggen.

**Bij het openen kom je in het hoofdmenu** (sinds 22-09-2026), en stond er nog
een dienst open, dan vraagt de app of je verder wilt (`HervatDialog.tsx`).
Verder rijden brengt je naar het rijscherm; **Verwijderen** (sinds 26-09-2026,
eerst "laat maar staan") doet hetzelfde als "dienst annuleren" op het
rijscherm: de dienst gaat uit het profiel, er wordt niets geboekt, en het
hoofdmenu zegt welke lijn weg is. Zonder tweede vraag, want het venster is de
vraag. Luc: "dit moet worden, verder rijden of verwijderen". De rode knop heeft
een vaste tint (#c62f25) en niet `--laat`: die is in het donkere thema te licht
voor witte letters. Proef: `scripts/probe-hervat.cjs`.

Wie in deze sessie zelf op START drukt gaat wel meteen naar het rijscherm; dat
staat in `begin`, want daar valt niets te vragen. Het onderscheid hangt aan
`activeKey`: die verandert bij het aannemen van een dienst en niet bij het
starten ervan, dus de vraag komt alleen voor een dienst die al liep toen hij
verscheen.

**Op het rijscherm staat een knop naar het hoofdmenu.** De balk bovenaan heeft er
al een huisje voor, en dat is een icoontje van zestien pixels in een hoek; dit
scherm staat uren open en je wilt er tussendoor uit.

Proeven: `scripts/probe-draait.cjs` tekent beide venstertjes, drukt alle knoppen
in en kijkt of de goede afhandeling loopt. `probe-rijscherm.cjs` kijkt of de knop
naar het hoofdmenu vooraan in de rij staat.

**Een lopende dienst slokte het hele menu op** (opgelost op 22-09-2026). Het
rijscherm stond achter `if (started && duty)`, en die voorwaarde stond boven de
instellingen, de chauffeurslijst en de staat van dienst. Elke knop in het
hoofdmenu kwam daardoor uit bij de lopende dienst -- de gebruiker: "de knoppen in
het hoofdmenu werken ook niet als een dienst actief is, ze sturen direct door naar
de actieve dienst". Nu is het `if (started && duty && screen === 'drive')`, en
brengt het effect op `activeKey` je naar `drive` op het moment dat de dienst
verschijnt: bij het aannemen, bij het starten van de app, en bij het wisselen naar
een chauffeur die rijdt. **Let op bij het toevoegen van een scherm:** de volgorde
van de `if`-takken in `App.tsx` is de hele schermrouter, en een tak zonder
`screen`-voorwaarde vangt alles af wat eronder staat.

De weg terug staat op de tegel van de modus waarin je rijdt: die zei "loopt" --
een mededeling waar je zelf bij moest bedenken dat je erop kon drukken -- en zegt
nu "verder rijden", in de blauwe van de route met een pijltje.

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
- `probe-rittenstaat.ts` — de rittenstaat op nagebootste ritten: hetzelfde
  vertrek of OMSI de halte nu bij aankomst, bij vertrek of bij de paal laat
  verspringen; doorrijden, tellers die teruglopen, geschatte tijden zonder oordeel.
- `probe-bedrijf.ts` — de regels van het busbedrijf: inschrijven, dag
  afsluiten, eigen dienst, verlengen en vervallen, hele centen; bussen,
  personeel, niveaus, opleidingen, bijscholing en zelf onderhouden, het
  postvak en de kaart voor de telefoon.
- `probe-addon.ts` — de add-on-manager op een nagebouwde OMSI-map: zip lezen,
  waar alles hoort, plan, installeren met reserve, verwijderen, foutcontrole.
- `probe-onderweg.ts` — flitspalen (welke borden, welke kant, boete),
  gebeurtenissen, het rapport van de controleurs en wat er van het loon af gaat.
- `probe-kaartmogelijkheden.ts` — proef 0 voor een busbedrijf-modus, alleen
  lezen: per kaart de soort ritten (.ttr / typ2 / oud), `StnLinks.cfg` ruw,
  haltes met meer dan één opvolger, KI-groepen per lijn, de wagenparklijsten
  (ook `#low` en Chrono) en wat `global.cfg` over geld en reizigers zegt.
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
- `probe-modi.cjs` — loopt vrij rijden en carrière stap voor stap af en meldt per
  stap wat er staat. Eigen gebruikersmap; er wordt niet op START gedrukt. De
  afsluitcode zegt of vrij rijden kaart -> bus is, met de plek in de voet.
- `probe-koppelen.ts`, `probe-beginplek.ts`, `probe-kaartherkenning.ts`,
  `probe-vrijstart.ts` — vrij rijden zonder de app: de omloop op nummer vinden
  (met "exacte naam": OMSI "12" naast "1" en "12" op een zaterdag),
  de plek van de bus, de kaart herkennen, en START in elke tak (zie 5.0; ook
  automatische tijd tegen gekozen tijd, en het weer naast `laststn.osn` dat
  niet weg kan, in een nagemaakte spelmap).
  `probe-kaartherkenning.ts` loopt naast de situaties en inzetpunten ook 2600
  stukjes rijden op de hoogte van het wegdek na (onterecht "andere kaart" op
  de eigen kaart hooguit 0,2%, nooit een wissel naar een derde kaart, een
  verkeerde kaart 75%+ herkend); `--snel` slaat dat deel (20 s) over.
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
