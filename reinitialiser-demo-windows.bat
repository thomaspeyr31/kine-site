@echo off
setlocal
cd /d "%~dp0"
title Cabinet kine - reinitialisation

echo.
echo  Remise a zero de la base avec les donnees de demonstration :
echo  programmes, patients, rendez-vous et comptes de test.
echo  Toutes les donnees saisies seront effacees.
echo.
choice /c ON /m "Continuer"
if errorlevel 2 goto fin

where node >nul 2>nul
if errorlevel 1 (
  echo [X] Node.js n'est pas installe : lancez d'abord demarrer-windows.bat
  goto fin
)
if not exist node_modules call npm install --no-fund --no-audit
call npm run setup -- --reset
if errorlevel 1 (
  echo [X] Echec : MySQL est-il demarre dans XAMPP ?
  goto fin
)
echo.
echo  Base reinitialisee. Relancez demarrer-windows.bat pour ouvrir le site.

:fin
echo.
pause
