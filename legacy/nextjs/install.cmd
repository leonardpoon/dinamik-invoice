@echo off
title Dinamik Invoice - Install
cd /d "%~dp0"
chcp 65001 >nul
call "%~dp0scripts\ensure-node.cmd" || goto :fail
node "%~dp0scripts\setup.mjs" || goto :fail
echo.
echo Installation complete. You can now double-click start.cmd
pause
exit /b 0

:fail
echo.
echo Installation failed - see the messages above.
pause
exit /b 1
