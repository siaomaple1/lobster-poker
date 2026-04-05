@echo off
echo Starting Lobster Poker...
echo.
echo Opening two terminals for backend and frontend.
echo.

start "Lobster Poker - Backend" cmd /k "cd /d %~dp0backend && npm run dev"
timeout /t 2 /nobreak >nul
start "Lobster Poker - Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo Both servers starting...
echo Backend:  http://localhost:3001
echo Frontend: http://localhost:5173
echo.
timeout /t 4 /nobreak >nul
start http://localhost:5173
