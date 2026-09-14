@echo off
REM Bouwt de plugin als 32-bits DLL. OMSI is een 32-bits Delphi-programma,
REM dus een 64-bits build wordt simpelweg niet geladen.
setlocal
call "C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\VC\Auxiliary\Build\vcvars32.bat" >nul
if errorlevel 1 exit /b 1
cd /d "%~dp0"
if not exist out mkdir out
cl /nologo /W3 /O2 /LD /MT omsicareer.c /Fe:out\OMSICareerPlugin.dll /Fo:out\ /link /DEF:omsicareer.def /OUT:out\OMSICareerPlugin.dll
endlocal
