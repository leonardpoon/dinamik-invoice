@echo off
rem Makes sure "node" is available. Uses the system Node.js if installed,
rem otherwise downloads a portable copy into runtime\node (no admin rights needed).
rem Called by install.cmd / start.cmd / stop.cmd / backup.cmd — do not run directly.

set "NODE_VER=v24.14.0"
set "PORTABLE=%~dp0..\runtime\node"

if exist "%PORTABLE%\node.exe" (
  set "PATH=%PORTABLE%;%PATH%"
  exit /b 0
)

where node >nul 2>&1
if %errorlevel%==0 exit /b 0

echo Node.js was not found - downloading a portable copy (about 35 MB)...
if not exist "%~dp0..\runtime" mkdir "%~dp0..\runtime"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ProgressPreference='SilentlyContinue'; [Net.ServicePointManager]::SecurityProtocol='Tls12';" ^
  "$rt='%~dp0..\runtime'; $zip=Join-Path $rt 'node.zip'; $tmp=Join-Path $rt 'node-tmp';" ^
  "Invoke-WebRequest -Uri 'https://nodejs.org/dist/%NODE_VER%/node-%NODE_VER%-win-x64.zip' -OutFile $zip;" ^
  "Expand-Archive -Path $zip -DestinationPath $tmp -Force;" ^
  "Move-Item (Join-Path $tmp 'node-%NODE_VER%-win-x64') (Join-Path $rt 'node');" ^
  "Remove-Item $zip -Force; Remove-Item $tmp -Recurse -Force"
if not exist "%PORTABLE%\node.exe" (
  echo Failed to download Node.js. Please install it from https://nodejs.org and run again.
  exit /b 1
)
set "PATH=%PORTABLE%;%PATH%"
exit /b 0
