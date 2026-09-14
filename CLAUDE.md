# OMSI Career — afspraken voor Claude

Lees eerst `HANDOVER.md`: daar staat wat de app is, hoe hij in elkaar zit en
welke werkafspraken er gelden (Nederlands antwoorden, commentaar en commits in
het Nederlands, geen processen van de gebruiker afschieten).

## Elke wijziging gaat ook in de installer

Wens van Luc: na **elke** wijziging aan de app bouw je beide targets uit
`electron-builder.yml` opnieuw — de `nsis`-installer (`Setup.exe`) én de
`portable`-versie (`draagbaar.exe`) — en zet je ze in `release/`. Er mag geen
exe in `release/` achterblijven die ouder is dan de code: een oude draagbare
versie die nog draaide, hing ooit een tweede overlay boven OMSI en schreef in
dezelfde profielen.

Bouwen gebeurt buiten het project, want Defender houdt `release/app.asar`
regelmatig vast:

```bash
npx electron-vite build
npx electron-builder -c.directories.output=%TEMP%/omsi-release
```

Kopieer daarna `OMSI Career <versie> Setup.exe`, `Setup.exe.blockmap` en
`OMSI Career <versie> draagbaar.exe` uit `%TEMP%\omsi-release` naar `release\`
van de hoofdmap `C:\OMSI Career`, en controleer dat de kopieën gelijk zijn.
`release/` staat in `.gitignore`; de exe's worden niet gecommit.

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
(`%APPDATA%\omsi-career`). Draait Lucs eigen app, sluit die dan niet af, maar
start je testexemplaar met een eigen map, zowel in dev
(`npx electron-vite dev -- --user-data-dir=<tijdelijke map>`) als met de
gebouwde exe (`"...draagbaar.exe" --user-data-dir=<tijdelijke map>`).
