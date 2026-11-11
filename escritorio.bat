@echo off
rem Abre MTv MultiChat como app de escritorio (la primera vez descarga Electron).
cd /d "%~dp0"
node build\run-desktop.js
