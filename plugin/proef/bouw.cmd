@echo off
REM Bouwt de nagebootste OMSI, 32 bits zoals het spel zelf; zie gastheer.c.
setlocal
call "C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\VC\Auxiliary\Build\vcvars32.bat" >nul
if errorlevel 1 exit /b 1
cd /d "%~dp0"
if not exist out mkdir out
cl /nologo /W3 /O2 /MT gastheer.c /Fe:out\gastheer.exe /Fo:out\
endlocal
