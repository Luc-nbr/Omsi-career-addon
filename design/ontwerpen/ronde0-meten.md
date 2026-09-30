# Ronde 0: meten in OMSI (handleiding voor Luc)

Voordat er één voorval gebouwd wordt, moeten we weten wat OMSI werkelijk
doorgeeft. Dat kan alleen in het spel, en alleen jij kunt het. Deze handleiding
zegt wat je doet; de app doet de rest en maakt er één zip van die je opstuurt.

Achtergrond: `voorvallen-en-controleurs.md`, §3.2 "Ronde 0" en §5 "Wat Luc in
OMSI meet". De meetstand zelf staat in `src/core/meetstand.ts`.

## Wat we willen weten

- Wanneer de volgende halte verspringt: bij aankomst, bij deur dicht of bij
  het wegrijden. En hoe de afstand tot de halte (`nextDist`) verloopt.
- Welke deurnummers van OMSI (`PAX_Entry0..7`, `PAX_Exit0..7`) bij welke deur
  van de bus horen.
- Hoe knielen, de oprijplaat, de alarmlichten en het stopverzoek heten in de
  scripts van elke bus, en of de vering van de vooras zakt bij knielen.
- Of een reiziger die te laat komt echt op de deurknop drukt als de deuren al
  dicht zijn.
- De twee punten die nog openstonden (`HANDOVER.md`, stap 6 van onderweg):
  aan welke kant en op welke afstand de app een flitspaal ziet, en of
  `ticketSlecht` bij een verkoop betrouwbaar aangaat. Daarvoor hoef je niets
  apart te doen: elke regel heeft de plek van de bus op de kaart, het bestand
  heeft de flitspalen van de dienst, en bij een verkoop staat alles van de
  klant erin. Rij wel een stuk langs snelheidsborden, en verkoop aan de deur
  een paar kaartjes (één keer met te weinig wisselgeld, als het lukt).

De proef met `[vars]` in de situatie (B18: tank, vuil, een lamp) zit niet in
de meetstand: die zet iets in de situatie van OMSI en komt apart.

## De drie bussen

| Bus | Map in `Vehicles` | Naam in OMSI (`[friendlyname]`) |
|---|---|---|
| De C2 | `MB_C2_EN_BVG` | Mercedes-Benz Release, `MB_C2_E5_Solo` |
| De o530 U e2 | `Citybus 530 by Kajosoft` | Citybus by Kajosoft, `o530 U e2 1-2d` (de `09a/09b_o530u_e2_1`-bestanden) |
| De MAN NL | `MAN_NL_NG` | MAN, `NL202 - EN92` |

## Kaart en lijn

**Grundorf, lijn 76.** Van jouw kaarten is dat de enige waarvoor alle drie de bussen een
eigen wagenpark (`Grundorf.hof`) meebrengen: de IBIS-codes kloppen, en de app
vraagt niet om er een wagenpark bij te zetten. Neem een dienst van **30 tot 45
minuten**: genoeg om de lijst af te werken, met genoeg haltes met mensen.

Wil je meer reizigers (voor de laatkomer en het stopverzoek), dan kan
**Berlin-Spandau** (bijvoorbeeld lijn 92 of 94) ook. De o530 en de MAN hebben
daar een wagenpark; voor de C2 biedt de app aan er een bij te zetten. Meet wel
alle drie de bussen op dezelfde kaart, dan zijn ze te vergelijken.

Belangrijk: kies in OMSI de **dienstregeling uit het menu** zoals de app zegt.
Zonder dat kent de app de halte niet bij naam, en dan valt de helft van de
meting weg.

## Stap voor stap

### 1. Eén keer: de meetstand aan

Hoofdscherm, **OMSI-instellingen**, tabblad **App**, kaart **Meetstand (voor
de ontwikkelaar)**: zet hem op **Aan**. Daar staan later ook "Meting opslaan"
en "Map met metingen openen".

### 2. Per bus (drie keer)

1. In de app: **Dienst**, kaart Grundorf, lijn 76, een dienst, en op de
   busstap de bus uit de tabel hierboven. START.
2. In OMSI: de dienstregeling uit het menu, zoals de telefoon zegt.
3. Op de telefoon (in de overlay, of op je tablet): aanmelden, tekenen. In het
   balkje onderin staat nu een knop **Meting** (een klembord). Daar staat de
   afvinklijst. Het stipje op die knop betekent: er wordt gemeten.
4. Rij en werk de lijst af. **Vink af terwijl de bus in die stand staat** en
   houd de stand dan nog **3 tellen** vast: op dat moment legt de app een
   afdruk van álle getallen van de bus vast, en in het verschil met de afdruk
   van het begin staat de naam die we zoeken.

   | Stap | Wat je doet | Wanneer je afvinkt |
   |---|---|---|
   | Stoppen bij een halte | Een halte aanrijden zoals altijd, stilstaan met de deuren open | Met de deuren open; daarna dicht en wegrijden |
   | Elke deur apart | Stilstaand: elke deur los open en dicht, **van voor naar achter**, een paar tellen ertussen | Na de laatste deur |
   | Knielen | De bus laten knielen | Terwijl hij laag staat; daarna weer omhoog |
   | Oprijplaat | De plaat uitklappen (sla over als de bus er geen heeft) | Terwijl hij uit is; daarna weer in |
   | Alarmlichten | Alarmlichten aan | Terwijl ze knipperen; daarna uit |
   | Stopverzoek | Doorrijden tot iemand op de stopknop drukt | Terwijl het lampje brandt |
   | Laatkomer afwachten | Bij een halte met mensen: alle deuren dicht, **20 tellen stilstaan**, niet wegrijden | Na de 20 tellen |
   | Doorrijden | Een stuk rijden zonder te stoppen, langs een halte waar niemand wil | Daarna |

   Verkeerd afgevinkt? Tik nog eens: het vinkje gaat eraf, en dat staat ook in
   het bestand. Een stap die niet lukt, laat je gewoon open.
5. Rond de dienst af zoals altijd, of stop hem. De meting loopt door zolang de
   meetstand aanstaat; een andere bus begint vanzelf een nieuw bestand **in
   dezelfde meting**. Je kunt dus alle drie de bussen rijden en pas aan het
   eind opslaan.

### 3. Opslaan en opsturen

Na de derde bus: **Meting opslaan** (op de telefoon onderaan de lijst, of bij
de meetstand in de instellingen). De app maakt één zip:

```
%APPDATA%\omsi-enhancer\metingen\meting-JJJJMMDD-UUMMSS.zip
```

"Map met metingen openen" in de instellingen opent Verkenner met die zip
geselecteerd. Stuur dat ene bestand op. Zet daarna de meetstand weer **Uit**.

Na het opslaan staat de meting stil: de losse bestanden zijn weg (de zip heeft
alles), en de telefoon zegt "Meting opgeslagen". Een nieuwe meting begint pas
bij de volgende dienst of vrije rit, of als je de meetstand uit en weer aan
zet. Van de metingen blijven de nieuwste vijf staan; oudere gaan weg.

## Wat er in de zip zit, en wat niet

- `meting-<n>-<bus>.jsonl`: per bus een bestand, vier regels per seconde
  (elke 250 ms). Per regel: de tijd sinds het begin (`tijd`, ms), de klok van
  OMSI (`klok`), de halte (`halte`: onze index en naam, en die van OMSI zelf),
  `nextDist`, de snelheid en de snelheid over de grond, alle 32 deurgetallen
  (`deuren`, in de volgorde van `deurNamen` in de eerste regel), deur 0 zoals
  de .opl hem ziet, knipperlichten, licht, motor, de tank, de plek op de kaart
  (`plek`: x, y in meters en de koers, zoals de flitspalen hem zien; tijdens
  een dienst), de kaartverkoop (bij een klant ook `slecht`, `gegeven`, `prijs`
  en de soort), en de gevonden scriptgetallen (`getallen`: wat veranderde, en
  elke tien tellen alles met `vol`). Regels `vink` zeggen wanneer je wat
  afvinkte (en `geschrapt` als je hem meteen weer uitzette), `onbekend` welke
  namen deze bus niet kent, `palen` waar de flitspalen van de dienst staan.
- `dump-<n>-begin.json` en `dump-<n>-<stap>.json`: de afdruk van alle getallen
  van de bus bij het begin en bij elke vink. Vink je een stap nog eens af, dan
  komt er een tweede (`dump-<n>-<stap>-2.json`). Wat je in de IBIS als nummer
  of pincode intikt, staat er als `null` in (`gemaskeerd`).
- `meting.json`: welke bussen, hoeveel meetregels (`meetregels`; per bus ook
  alle regels van het bestand), wat er afgevinkt is.
- `spoor-dienst-<n>.jsonl`: het ritspoor van de diensten die tijdens de meting
  reden (hoe de app de haltes telde, met de deuren erbij).

**Niet** erin: je naam, je personeelsnummer of pincode, je profiel, of een pad
van je pc. Wel de bus, de kaart en de haltes; dat is spelmateriaal.

## Als er iets niet klopt

- **"Wacht op een dienst of vrije rit"**: er loopt geen dienst, of OMSI geeft
  (nog) niets door. De plugin moet versie 13 of hoger zijn, en de haltes bij
  naam lukken alleen op OMSI 2.3.004.
- **"N namen vielen buiten de 512"**: de plugin neemt hoogstens 512 getallen.
  Eerst gaan de getallen van alle voertuigen, dan die van de apparaten die je
  in de telefoon zette, dan de meting. Zet tijdens het meten geen extra
  apparaten in de telefoon; de namen voor knielen, oprijplaat, stopverzoek en
  alarmlicht blijven er ook dan in (`scripts/probe-meetnamen.ts`), alleen
  licht- en deurnamen vallen af.
- Het bestand wordt groot: 15 tot 30 MB per uur per bus (nagemeten 30-09:
  10 MB als er niets beweegt, meer naarmate de scriptgetallen van de bus
  veranderen); de zip is veel kleiner. Een meting stopt bij 250 MB: dan zegt
  de telefoon **"De meting is vol"**, en komt er niets meer bij tot je hem
  opslaat.
- **"Meting opgeslagen. Een nieuwe begint bij ..."**: je hebt net opgeslagen.
  Start een nieuwe dienst of vrije rit, of zet de meetstand uit en weer aan.
- **"Deze app staat op alleen bekijken"**: er draait een oudere versie van de
  app dan die je gegevens het laatst bijwerkte. Wat die opslaat is weg zodra
  hij sluit, dus hij meet niet. Start de nieuwste versie.
