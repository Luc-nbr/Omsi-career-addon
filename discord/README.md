# Discord voor OMSI Enhancer

De inrichting van de server staat in `server.json`, het script dat hem neerzet in
`setup.mjs`, en de teksten die je in de kanalen plakt staan hieronder.

## In vijf stappen

1. **Maak de server** in Discord zelf: plusje links, *Zelf maken* → *Voor mij en
   mijn vrienden*, naam `OMSI Enhancer`. Dit moet jij doen — een bot die een
   server aanmaakt wordt zelf de eigenaar, en dat wil je niet.
2. **Maak een bot** op <https://discord.com/developers/applications> → *New
   Application* → *Bot*. Kopieer het token; laat het verder nergens rondslingeren.
3. **Nodig de bot uit** met alleen wat hij nodig heeft: *OAuth2 → URL Generator*,
   scope `bot`, rechten *Manage Roles* en *Manage Channels*.
4. **Draai het script.** Het server-id krijg je door met rechtermuisknop op de
   server te klikken → *Server-ID kopiëren* (ontwikkelaarsmodus moet aan staan
   onder Instellingen → Geavanceerd).

   ```bash
   node discord/setup.mjs --droog
   ```

   Dat laat zien wat er zou gebeuren zonder iets aan te maken. Klopt het, dan:

   ```bash
   set DISCORD_TOKEN=...
   set DISCORD_GUILD=...
   node discord/setup.mjs
   ```

   Het script laat staan wat er al is, dus twee keer draaien levert geen dubbele
   kanalen op.
5. **Gooi de bot eruit** als je klaar bent. Hij heeft zijn werk gedaan, en een
   bot met rechten die niemand gebruikt is alleen maar een sleutel onder de mat.

## Wat er komt te staan

| categorie | kanalen |
|---|---|
| Begin hier | `welkom-en-regels`, `aankondigingen` (allebei alleen lezen) |
| Rijden | `algemeen`, `je-dienst`, `kaarten-en-bussen` |
| Hulp | `installeren`, `bugs-melden`, `ideeen` |
| Achter de schermen | `testrijden` (alleen testrijders), `ontwikkeling` (alleen lezen) |

Drie rollen: **Ontwikkelaar** (geel, jij), **Testrijder** (blauw, wie een versie
vooraf draait), **Chauffeur** (groen, iedereen). Dezelfde kleuren als in de app.

---

## De teksten

### #welkom-en-regels

> **OMSI Enhancer**
>
> Een programma naast OMSI 2 dat je een echte dienst geeft: het zoekt een omloop
> uit de dienstregeling van de kaart, zet hem klaar in het spel, en hangt een
> overlay boven je stuur met je haltes, je route en hoe je op de tijd ligt.
>
> **Hoe het hier werkt**
>
> 1. Wees normaal tegen elkaar. Dit is een hobby.
> 2. Vragen over installeren horen in #installeren, niet in #algemeen.
> 3. Werkt iets niet? #bugs-melden, met het sjabloon dat daar vastgepind staat.
>    Zonder versienummer en kaart kan niemand je helpen.
> 4. Geen links naar betaalde add-ons die je zelf hebt doorverkocht, en geen
>    gedeelde bestanden waar je geen rechten op hebt.
> 5. Nederlands of Engels, allebei goed.
>
> **Aan de slag**
>
> De laatste versie staat in #aankondigingen. Vertel gerust in #algemeen welke
> kaarten je rijdt — dan weet ik waar ik op moet testen.

### #bugs-melden — vastpinnen

> **Voordat je iets meldt**
>
> Kijk of het er al staat. Staat het er, reageer dan op dat bericht in plaats van
> een nieuw te beginnen; dan blijft alles bij elkaar.
>
> **Sjabloon — plak dit en vul het in**
>
> ```
> Versie van de app:
> Kaart en lijn:
> Bus:
>
> Wat ik deed:
> Wat ik verwachtte:
> Wat er gebeurde:
>
> Schermafbeelding:
> ```
>
> Die eerste drie regels zijn het belangrijkst. De meeste dingen die misgaan,
> gaan mis op één bepaalde kaart of bij één bepaalde bus.

### #aankondigingen — de eerste

> **OMSI Enhancer is er.**
>
> Wat het doet: het zoekt een echte dienst uit de dienstregeling van je kaart,
> zet hem klaar in OMSI — datum, tijd, bus bij de juiste halte, dienstregeling
> ingesteld — en start het spel. Tijdens het rijden hangt er een overlay boven je
> stuur met je haltes, een navigatie die met je meerijdt, en hoe je op de tijd
> ligt.
>
> Downloaden: [zet hier je link]
>
> Het werkt met de kaarten die je al hebt. Werkt er iets niet, dan hoor ik het
> graag in #bugs-melden.

### #testrijden — vastpinnen

> Hier staan versies die nog niet uit zijn. Ze kunnen stuk zijn; dat is het punt.
>
> Wat ik van je vraag: zeg erbij op welke kaart je reed, en of het vorige
> probleem weg is. Eén regel is genoeg.

---

## Nog te doen

- De downloadlink in #aankondigingen invullen zodra er een plek is waar de
  installers staan.
- Overwegen of de app een knop naar de server krijgt. Dat is één regel in de
  zijbalk, maar het betekent wel dat elke gebruiker de uitnodiging in handen
  heeft — dus pas doen als de server staat zoals je hem wilt.
