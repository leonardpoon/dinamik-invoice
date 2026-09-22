@echo off
title Dinamik Invoice
cd /d "%~dp0"
chcp 65001 >nul
call "%~dp0scripts\ensure-node.cmd" || goto :fail
node "%~dp0scripts\start.mjs"
exit /b %errorlevel%

:fail
pause
exit /b 1
