# OMSI Enhancer — afspraken voor Claude

Lees eerst `HANDOVER.md`: daar staat wat de app is, hoe hij in elkaar zit en
welke werkafspraken er gelden (Nederlands antwoorden, commentaar en commits in
het Nederlands, geen processen van de gebruiker afschieten).

## Elke wijziging gaat ook in de installer

Wens van Luc: na **elke** wijziging aan de app bouw je beide targets uit
`electron-builder.yml` opnieuw — de `nsis`-installer (`OMSI-Enhancer-Setup.exe`)
én de `portable`-versie (`OMSI-Enhancer-draagbaar.exe`) — en zet je ze in `release/`. Er mag geen
exe in `release/` achterblijven die ouder is dan de code: een oude draagbare
versie die nog draaide, hing ooit een tweede overlay boven OMSI en schreef in
dezelfde profielen.

Bouwen gebeurt buiten het project, want Defender houdt `release/app.asar`
regelmatig vast:

```bash
npx electron-vite build
npx electron-builder -p never -c.directories.output=%TEMP%/omsi-release
```

Kopieer daarna `OMSI-Enhancer-Setup.exe`, `OMSI-Enhancer-Setup.exe.blockmap`,
`latest.yml` en `OMSI-Enhancer-draagbaar.exe` uit `%TEMP%\omsi-release` naar
`release\` van de hoofdmap `C:\OMSI Career`, en controleer dat de kopieën gelijk
zijn. De namen dragen sinds de automatische updater geen versienummer en geen
spaties meer (GitHub maakt van een spatie een punt, en dan vindt de updater de
bijlage uit `latest.yml` niet); het versienummer staat in `latest.yml`. Ruim
oude `OMSI Enhancer <versie> ...exe`-bestanden in `release\` op.
`release/` staat in `.gitignore`; de exe's worden niet gecommit.

## Publiceren (de automatische updater)

De geïnstalleerde versie werkt zichzelf bij vanaf de releases op GitHub
(`Luc-nbr/Omsi-career-addon`, zie `src/main/bijwerken.ts`): 30 s na de start en
elke 4 uur kijken, op de achtergrond downloaden, stil installeren en opnieuw
starten zodra er geen dienst of vrije rit loopt en OMSI/openOMSI dicht is
(anders bij het afsluiten). De draagbare exe meldt alleen dat er een nieuwe
versie is. Een update bereikt spelers pas na publiceren:

1. Versie ophogen in `package.json`, committen.
2. Bouwen zoals hierboven (naar `%TEMP%\omsi-release`).
3. **Alleen na een ja van Luc:** `node scripts/publiceer.cjs` (of
   `node scripts/publiceer.cjs <bouwmap> --notities tekst.md`). Dat controleert
   versie en sha512 in `latest.yml` en maakt met `gh` de release `v<versie>`
   met Setup.exe, blockmap, `latest.yml` en draagbaar.exe. Een versie met een
   streepje wordt een pre-release, die de updater overslaat.

`scripts/uitgeven.mjs` gaat nog uit van de oude bestandsnamen; gebruik
`publiceer.cjs`.

Valkuilen bij het bouwen:

- **In een worktree geen junction naar `node_modules`.** electron-builder vindt
  dan de afhankelijkheden van afhankelijkheden niet (`cannot find path for
  dependency safer-buffer`) en laat ze uit `app.asar`, waarna iconv-lite in de
  gebouwde app niet laadt. Draai `npm ci` in de worktree.
- **De plugin-DLL komt uit `plugin/out/`**, en die map staat niet in git. In een
  verse worktree `plugin\build.cmd` draaien of de DLL uit de hoofdmap kopiëren.
- Controleer na het bouwen met `@electron/asar` dat `node_modules/iconv-lite` en
  `node_modules/safer-buffer` in `win-unpacked/resources/app.asar` zitten.

## Testen naast de app van Luc

De app laat één exemplaar tegelijk toe per map met gebruikersgegevens
(`%APPDATA%\omsi-enhancer`; profielen uit de tijd dat de app OMSI Career heette
worden bij de eerste start uit `%APPDATA%\omsi-career` overgenomen). Draait Lucs eigen app, sluit die dan niet af, maar
start je testexemplaar met een eigen map, zowel in dev
(`npx electron-vite dev -- --user-data-dir=<tijdelijke map>`) als met de
gebouwde exe (`"...draagbaar.exe" --user-data-dir=<tijdelijke map>`).
