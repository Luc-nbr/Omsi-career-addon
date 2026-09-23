@echo off
REM Bouwt de proefprogramma's, 32 bits zoals het spel zelf; zie gastheer.c,
REM vastloper.c en bus.c.
setlocal
call "C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\VC\Auxiliary\Build\vcvars32.bat" >nul
if errorlevel 1 exit /b 1
cd /d "%~dp0"
if not exist out mkdir out
cl /nologo /W3 /O2 /MT gastheer.c /Fe:out\gastheer.exe /Fo:out\
cl /nologo /W3 /O2 /MT vastloper.c /Fe:out\vastloper.exe /Fo:out\ user32.lib
REM Een vast beginadres, ver van alles wat Windows zelf neerzet: de plugin rekent
REM zijn adressen om vanaf het beginadres van het programma (zie mem_addr), dus het
REM hoeft niet 0x400000 te zijn -- het moet alleen vastliggen en vrij zijn.
cl /nologo /W3 /O2 /MT bus.c /Fe:out\bus.exe /Fo:out\ /link /DYNAMICBASE:NO /BASE:0x30000000
endlocal
