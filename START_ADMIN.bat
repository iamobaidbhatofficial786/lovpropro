@echo off
echo ===================================
echo   PowerKits Admin Dashboard
echo   Starting Development Server...
echo ===================================
echo.

cd admin-dashboard

echo Installing dependencies...
call npm install

echo.
echo Starting dev server...
echo.
echo The dashboard will open at: http://localhost:3000
echo Press Ctrl+C to stop the server
echo.

call npm run dev

pause
