@echo off
REM Draait bus.exe in alle vijf de scenario's (zie bus.c), elk met een eigen
REM LOCALAPPDATA onder de map die je meegeeft -- standaard %TEMP%\omsi-busproef.
REM Zo komt de proef nooit in de echte %LOCALAPPDATA%\OMSI Career, waar OMSI en
REM de app hun live.json hebben.
REM
REM   proef.cmd [map] [pad\naar\OMSICareerPlugin.dll]
REM
REM Eerst bouwen: ..\build.cmd voor de plugin, bouw.cmd voor bus.exe.
REM Exitcode 0 als elk scenario GOED zegt.
setlocal
cd /d "%~dp0"
set "BASIS=%~1"
if "%BASIS%"=="" set "BASIS=%TEMP%\omsi-busproef"
set "DLL=%~2"
if "%DLL%"=="" set "DLL=%~dp0..\out\OMSICareerPlugin.dll"
set FOUT=0
for %%s in (gewoon aanhanger zonderstrings exceptie getalfout) do (
  if not exist "%BASIS%\%%s" mkdir "%BASIS%\%%s"
  echo === %%s
  set "LOCALAPPDATA=%BASIS%\%%s"
  out\bus.exe "%DLL%" %%s
  if errorlevel 1 set FOUT=1
)
endlocal & exit /b %FOUT%
