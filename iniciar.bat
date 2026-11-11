@echo off
rem Abre MTv MultiChat desde el código fuente y el dock en el navegador.
cd /d "%~dp0"
start "" http://localhost:7390/dock
node server.js
pause
