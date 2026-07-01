@echo off
cls
echo ========================================
echo   PowerKits - Test New UI Locally
echo ========================================
echo.
echo This will start the admin dashboard with
echo the NEW UI design on your local machine.
echo.
echo The server will run at: http://localhost:3000
echo.
echo Press Ctrl+C to stop the server when done.
echo.
pause

cd admin-dashboard

echo.
echo Installing dependencies (if needed)...
call npm install

echo.
echo ========================================
echo   Starting Development Server...
echo ========================================
echo.
echo Opening browser in 5 seconds...
echo.

start "" cmd /c "timeout /t 5 /nobreak && start http://localhost:3000"

call npm run dev
