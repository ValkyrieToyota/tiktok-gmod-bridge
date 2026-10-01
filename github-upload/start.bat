@echo off
title TikTok Live to Garry's Mod Bridge
cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel% neq 0 goto :NO_NODE

if not exist "node_modules\" goto :INSTALL_DEPS

goto :RUN_SERVER

:NO_NODE
color 0c
echo ===================================================================
echo [ERROR] Node.js is not found on your system!
echo Please download and install Node.js from: https://nodejs.org/
echo ===================================================================
pause
exit /b 1

:INSTALL_DEPS
color 0e
echo ===================================================================
echo [SETUP] Installing required packages (npm install)...
echo Please wait...
echo ===================================================================
call npm install
if %errorlevel% neq 0 (
    color 0c
    echo [ERROR] Package installation failed. Please check internet connection.
    pause
    exit /b 1
)

:RUN_SERVER
color 0b
node server.js %*
if %errorlevel% neq 0 (
    color 0c
    echo.
    echo [ERROR] Server exited with code %errorlevel%.
    pause
)
