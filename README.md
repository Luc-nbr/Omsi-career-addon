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
snijdt er een aaneengesloten stuk uit van de lengte die jij kiest, en trekt dat
stuk nooit over een stilstand van meer dan 45 minuten heen: daar wisselt in de
praktijk de chauffeur.

## Starten

```bash
npm install
npm run dev
```

Bouwen: `npm run build`.

### Installer maken

```bash
npm run dist
```

Levert in `release/` een installer (`OMSI Career 0.1.0 Setup.exe`) en een
draagbare versie die zonder installeren draait. Beide zijn 64-bits Windows en
ongeveer 77 MB; daar zit Electron zelf in.

Het icoon wordt gegenereerd met `npm run icon` en staat als `build/icon.ico`.

**De installer is niet ondertekend.** Windows SmartScreen toont daarom bij de
eerste start "Windows heeft uw pc beschermd"; via *Meer informatie -> Toch
uitvoeren* gaat hij gewoon door. Ondertekenen vraagt een code-signing­certificaat
op naam, en dat kost geld per jaar. De losse kern is te draaien zonder de app op te
starten met `npm run probe`, wat alle kaarten inleest en een voorbeelddienst
afdrukt.

## Wat de app in OMSI verandert

OMSI heeft geen startparameter om een situatie te openen; de enige switches zijn
`-editor`, `-windowed`, `-debug`, `-nolog`, `-logall` en `-savelogs`. De dienst
wordt daarom via bestanden klaargezet:

- `Situations/OMSI Career.osn` — kaart, datum, tijd, bus, lijn en bestemming
- `options.cfg` — alleen het blok `[last_map]`, met een back-up ernaast
  (`options.cfg.omsicareer-backup`)

In het spel kies je de situatie **OMSI Career** dan nog één keer in het menu.

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

## Nog te doen

- Punctualiteit en passagiers live meten. Dat vraagt een plugin-DLL in `plugins/`
  die voertuigvariabelen uitleest, en dus een C++-compiler.
- Diensten vrijspelen op rang, en repaints per wagenpark kiezen.
