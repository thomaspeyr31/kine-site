@echo off
setlocal
cd /d "%~dp0"
title Cabinet kine - demonstration

echo.
echo  =====================================================
echo    Cabinet kine - lancement du site de demonstration
echo  =====================================================
echo.

where node >nul 2>nul
if errorlevel 1 goto nonode

if exist node_modules goto deps_ok
echo [1/3] Installation des dependances, 1 a 2 minutes...
call npm install --no-fund --no-audit
if errorlevel 1 goto erreur
:deps_ok

if exist .env goto env_ok
echo [2/3] Creation de la base de donnees MySQL...
echo       XAMPP : MySQL doit etre demarre dans le XAMPP Control Panel.
echo.
call npm run setup
if errorlevel 1 goto erreur
:env_ok

echo [3/3] Demarrage du site...
echo.
echo   Adresse : http://localhost:3000
echo   Kine    : kine@cabinet.fr  /  MotDePasse123
echo   Patient : patient@test.fr  /  patient1234
echo.
echo   Pour arreter le site : fermez cette fenetre, ou Ctrl+C.
echo.
start "" /min cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:3000"
call npm start
goto fin

:nonode
echo [X] Node.js n'est pas installe sur cet ordinateur.
echo     Installez la version LTS depuis https://nodejs.org puis relancez ce fichier.
start "" https://nodejs.org/fr/download
goto fin

:erreur
echo.
echo [X] Une erreur est survenue : lisez le message ci-dessus.
echo     Si MySQL ne repond pas : XAMPP Control Panel, bouton Start en face de MySQL.

:fin
echo.
pause
