@echo off
REM Bouwt nepexe.exe (zie nepexe.c) in de map die je meegeeft, 64-bits zoals openOMSI.
REM   bouw.cmd <uitvoermap>
setlocal
call "C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\VC\Auxiliary\Build\vcvars64.bat" >nul
if errorlevel 1 exit /b 1
if "%~1"=="" exit /b 2
if not exist "%~1" mkdir "%~1"
cl /nologo /W3 /O2 /MT "%~dp0nepexe.c" /Fe:"%~1\nepexe.exe" /Fo:"%~1\\" /link /SUBSYSTEM:CONSOLE
endlocal
