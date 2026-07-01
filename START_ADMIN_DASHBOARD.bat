@echo off
echo ========================================
echo   Starting PowerKits Admin Dashboard
echo ========================================
echo.

cd admin-dashboard

echo Checking dependencies...
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
)

echo.
echo Starting development server...
echo.
echo Dashboard will open at: http://localhost:3000
echo.
echo Press Ctrl+C to stop the server
echo ========================================
echo.

call npm run dev

pause
