# Discord voor OMSI Enhancer

De inrichting van de server staat in `server.json`, het script dat hem neerzet in
`setup.mjs`, en de teksten die je in de kanalen plakt in `teksten.md`.

De server is **Duits en Engels**. Daarom staan de kanaalnamen in het Engels --
die lezen beide groepen -- zijn de onderwerpen tweetalig, en is er een
praatkanaal per taal: `#deutsch` en `#english`. De vaste teksten staan in beide
talen, Duits eerst, want OMSI is een Duits spel en daar komen de meeste kaarten
en bussen vandaan.

## In vijf stappen

1. **De server staat er al** (`OMSI Enhancer`), dus die stap is klaar.
2. **Maak een bot** op <https://discord.com/developers/applications> → *New
   Application* → *Bot*. Kopieer het token; laat het verder nergens rondslingeren.
3. **Nodig de bot uit** met alleen wat hij nodig heeft: *OAuth2 → URL Generator*,
   scope `bot`, rechten *Manage Roles* en *Manage Channels*.
4. **Draai het script.** Het id van de server staat al in `server.json`; alleen
   het token komt uit je eigen omgeving.

   ```bash
   node discord/setup.mjs --droog
   ```

   Dat laat zien wat er zou gebeuren zonder iets aan te maken — daar is geen
   token voor nodig. Klopt het, dan:

   ```bash
   set DISCORD_TOKEN=...
   node discord/setup.mjs
   ```

   Een andere server aanwijzen kan met `--guild <id>`.

   Het script laat staan wat er al is, dus twee keer draaien levert geen dubbele
   kanalen op.
5. **Gooi de bot eruit** als je klaar bent. Hij heeft zijn werk gedaan, en een
   bot met rechten die niemand gebruikt is alleen maar een sleutel onder de mat.

## Wat er komt te staan

| categorie | kanalen |
|---|---|
| Start here | `welcome-rules`, `announcements` (allebei alleen lezen) |
| Driving | `deutsch`, `english`, `your-duty`, `maps-and-buses` |
| Help | `install-help`, `bug-reports`, `ideas` |
| Behind the scenes | `beta` (alleen de rol Beta), `development` (alleen lezen) |

Drie rollen: **Developer** (geel, jij), **Beta** (blauw, wie een versie vooraf
draait), **Driver** (groen, iedereen). Dezelfde kleuren als in de app.

---

## Nog te doen

- De downloadlink in #aankondigingen invullen zodra er een plek is waar de
  installers staan.
- Overwegen of de app een knop naar de server krijgt. Dat is één regel in de
  zijbalk, maar het betekent wel dat elke gebruiker de uitnodiging in handen
  heeft — dus pas doen als de server staat zoals je hem wilt.
