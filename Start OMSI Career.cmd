@echo off
REM Start de app via de Electron-runtime in plaats van als eigen exe.
REM
REM Smart App Control blokkeert onze gebouwde exe omdat die niet ondertekend is
REM en geen reputatie heeft. De electron.exe uit node_modules is net zo min
REM ondertekend, maar wordt wel doorgelaten. Dezelfde app, andere verpakking.

cd /d "%~dp0"

if not exist "node_modules\electron\dist\electron.exe" (
  echo Electron ontbreekt. Draai eerst:  npm install
  pause
  exit /b 1
)

if not exist "out\main\index.js" (
  echo De app is nog niet gebouwd. Even geduld...
  call npm run build || (echo Bouwen mislukt. & pause & exit /b 1)
)

start "" "node_modules\electron\dist\electron.exe" .
