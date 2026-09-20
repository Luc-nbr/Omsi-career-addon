# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Spelers van OMSI 2 die de app naast het spel draaien. Eén persoon, twee
volstrekt verschillende houdingen:

- **Voor de rit, achter het bureau.** Muis en toetsenbord, volle aandacht. Hij
  kiest een profiel, een kaart, een lijn, een dienst en een bus, en laat de app
  OMSI starten.
- **Tijdens de rit, geen hand vrij.** De overlay ligt over het spel. Hij rijdt:
  hij kijkt opzij, een halve seconde, en moet dan weten waar hij heen moet, hoe
  hard hij mag en of hij op tijd is. Dit is de zeldzame eis in dit project --
  de meeste desktop-apps hoeven nooit gelezen te worden door iemand die iets
  anders aan het doen is.

De gebruikers zitten in Duitsland en in Engelstalige landen; de ontwikkelaar is
Nederlands. In de app zelf komt geen Nederlands voor.

## Product Purpose

OMSI 2 heeft geen carrière. Je kiest een kaart, een lijn en een bus, je rijdt,
en dat is het. OMSI Enhancer legt daar een loopbaan overheen: diensten met een
begin en een eind, loon, rijexamens, lijnvergunningen, en een beoordeling die
gebaseerd is op hoe je werkelijk reed.

Geslaagd is de app als hij rijk is aan mogelijkheden -- veel, en leuke. Niet
één ding dat goed werkt, maar een app waar steeds iets nieuws in zit om te
doen. Dat is een uitspraak over richting: het aantal schermen en functies gaat
toenemen, en wat we nu bouwen moet die groei kunnen dragen zonder te vervuilen.

## Positioning

**Het uiterlijk en het gevoel.** Dat is wat een andere OMSI-tool niet eerlijk
kan nadoen. De gereedschappen rondom OMSI 2 zien er allemaal uit als
gereedschap: vensters uit Delphi, tabellen, grijze knoppen. Deze app is de
enige die eruitziet alsof hij in dit decennium gemaakt is.

Dat heeft een gevolg dat in elke ontwerpbeslissing doorwerkt: het uiterlijk is
hier geen versiering bovenop de functie, het is de positie zelf. Slordige
uitlijning of een inconsequente knop kost hier meer dan elders -- het kost het
enige waarop de app zich onderscheidt.

## Operating Context

- OMSI 2 draait ernaast of eronder. De app start het spel zelf op, sinds
  0.2.0-beta.2 standaard in een venster; de speler kan dat uitzetten.
- De overlay ligt boven het spel. Boven een spel in exclusief volledig scherm
  verliest OMSI zijn Direct3D-apparaat en wordt het beeld zwart -- vandaar de
  venstermodus en de waarschuwing.
- Gegevens komen uit drie bronnen: de bestanden van de OMSI-installatie
  (tegels, splines, dienstregelingen, hof-bestanden), een 32-bits C-plugin die
  in het spel geladen wordt en tien keer per seconde een live.json wegschrijft,
  en het geheugen van OMSI zelf voor de positie van de bus.
- De app wordt getest door een groep bètatesters op Discord, die fouten meldt
  in een forumkanaal. Uitgaven gaan als GitHub-release, in het Duits en het
  Engels.

## Capabilities and Constraints

**Wat de app kan.** Profielen per chauffeur; kaarten, lijnen en diensten kiezen
uit OMSI's eigen dienstregelingen; de bus op de eerste halte neerzetten;
navigatie met route, manoeuvrepijl, snelheidsmeter en de maximumsnelheid van de
borden langs de weg; live meten van snelheid, deuren, passagiers, kaartverkoop,
brandstof, weer en IBIS; rijexamens en lijnvergunningen; loon en een bon na
afloop.

**Wat vastligt.**

- Electron 33, React 19, TypeScript, electron-vite, electron-builder (installer
  en draagbaar). De plugin is 32-bits C, met MSVC gebouwd.
- Twee talen, Duits en Engels, gelijkwaardig. Duitse teksten zijn structureel
  langer; elk element moet daartegen kunnen.
- Het venster mag zo klein als 720 bij 560 en moet tot forse breedtes meeschalen.
- De overlay ligt over een draaiend 3D-spel. Alles wat de GPU kost -- matglas,
  schaduwen, filters -- is daar duurder dan in het app-venster, en dat is meer
  dan een detail: het heeft eerder haperingen gegeven.
- De exe is niet ondertekend; Windows waarschuwt bij de eerste start.

**Nog niet beslist.** De naam "OMSI Enhancer" en het icoon liggen niet vast en
mogen in een vervanging mee. Of kleur exclusief voor tijd blijft, ligt ook niet
vast.

## Brand Commitments

Eén bindende afspraak: **het lijnnummer is geel**, in de app en in de overlay.
Geel staat hier voor identiteit, niet voor een waarschuwing.

Verder niets. Naam, icoon, letters, kleurgebruik en indeling zijn allemaal
vervangbaar.

## Evidence on Hand

- `build/icon.png` en `build/icon.ico` -- het huidige pictogram.
- `design/` -- een ontwerpcanvas uit een eerdere sessie: 38 artboards over elf
  pagina's, met de afwegingen erbij. Het bevat vooral wat al is afgewezen en
  waarom: gekleurde vlekken achter glas, pastelkleurige statuskleuren,
  brutalisme (te luid om acht uur naar te kijken), en het standaardpalet van
  een stijlcatalogus. Bruikbaar als anti-referentie, niet als richting.
- Echte foutmeldingen van bètatesters, in het Duits en Engels, uit het
  forumkanaal.
- Uitgaveteksten in twee talen in de map `uitgaven` van het Discord-project.
- Meetscripts in `scripts/` die schermen opnemen en gedrag narekenen, plus een
  logbestand van een gebruiker met een zwart scherm.

Wat er niet is: gebruikersonderzoek, gebruikstests, cijfers over wie welk
scherm gebruikt. Er zijn alleen meldingen van mensen die ergens op vastliepen.

## Product Principles

1. **Meten, niet vragen.** Wat de app uit het spel kan aflezen, vraagt hij niet
   aan de speler. De knop "IBIS ingevoerd" bestaat nog als nooduitgang, niet
   als werkwijze.
2. **De rijdende gebruiker heeft geen hand vrij.** Alles wat tijdens het rijden
   getoond wordt, moet met een blik van een halve seconde te lezen zijn. Wat
   dat niet haalt, hoort niet in de overlay.
3. **Het uiterlijk is de positie.** Craft is hier geen luxe. Een scheve
   uitlijning kost het enige waarop deze app zich onderscheidt.
4. **Bouwen voor groei.** Het doel is een app die rijk is aan mogelijkheden.
   Wat we maken moet tientallen schermen kunnen dragen zonder dat elk scherm
   een eigen uitzondering wordt.
5. **Twee talen, geen tweederangs taal.** Duits en Engels krijgen dezelfde
   zorg. Een element dat in het Duits breekt, is stuk.

## Accessibility & Inclusion

Geen productspecifieke eis vastgesteld. Wel twee bekende gebruiksomstandigheden
die als eis tellen: lezen terwijl je iets anders doet, en lange sessies in het
donker naast een spel dat zelf donker is.
