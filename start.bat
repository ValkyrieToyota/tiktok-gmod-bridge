@echo off
chcp 65001 >nul
title TikTok Live to Garry's Mod Bridge
color 0b

echo ===================================================================
echo     🔴 TIKTOK LIVE TO GARRY'S MOD CONNECTOR BRIDGE
echo     Developed for Steam Workshop & TikTok Streamers
echo     Credit: @valkyrietoyota
echo ===================================================================
echo.

:: 1. ตรวจสอบว่าในเครื่องมี Node.js หรือไม่
where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0c
    echo [ERROR] ไม่พบ Node.js ในเครื่องของคุณ!
    echo.
    echo กรุณาดาวน์โหลดและติดตั้ง Node.js (ฟรี) ได้ที่:
    echo 👉 https://nodejs.org/ (แนะนำเวอร์ชัน LTS)
    echo เมื่อติดตั้งเสร็จแล้ว ให้เปิด start.bat ใหม่อีกครั้ง
    echo.
    pause
    exit /b
)

:: 2. ตรวจสอบว่าได้ติดตั้ง node_modules หรือยัง
cd /d "%~dp0"
if not exist "node_modules\" (
    color 0e
    echo [SETUP] กำลังดาวน์โหลดแพ็กเกจที่จำเป็นสำหรับ TikTok Connector ครั้งแรก...
    echo กรุณารอสักครู่ (ใช้เวลาประมาณ 30 วินาที)...
    echo.
    call npm install
    if %errorlevel% neq 0 (
        color 0c
        echo [ERROR] ติดตั้งแพ็กเกจไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต
        pause
        exit /b
    )
    echo.
    echo [SUCCESS] ติดตั้งแพ็กเกจเสร็จสมบูรณ์!
    echo.
)

color 0a
echo [READY] กำลังเริ่มทำงาน Server Bridge...
echo เข้าเกม Garry's Mod แล้วเปิดหน้าต่างเมนูด้วยคำสั่ง 'tiktok_menu' ได้เลย!
echo ===================================================================
echo.

node server.js
pause
