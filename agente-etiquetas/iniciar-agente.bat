@echo off
rem Programa de la etiquetadora de Azkell Fleet. Dejar abierto en la PC que tiene la etiquetadora conectada por USB.
title Etiquetadora Azkell
cd /d "%~dp0"
:inicio
node agente.js
echo.
echo El programa se detuvo. Reiniciando en 5 segundos... (cierra esta ventana para salir)
timeout /t 5 /nobreak >nul
goto inicio
