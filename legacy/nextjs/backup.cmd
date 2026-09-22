@echo off
title Dinamik Invoice - Backup
cd /d "%~dp0"
chcp 65001 >nul
call "%~dp0scripts\ensure-node.cmd" || goto :fail
node "%~dp0scripts\backup.mjs"
pause
exit /b 0

:fail
pause
exit /b 1
