@echo off
echo ========================================
echo   PowerKits - Deploy to Vercel
echo ========================================
echo.

cd admin-dashboard

echo Step 1: Installing dependencies...
call npm install
if errorlevel 1 (
    echo ERROR: Failed to install dependencies
    pause
    exit /b 1
)

echo.
echo Step 2: Building production version...
call npm run build
if errorlevel 1 (
    echo ERROR: Build failed
    pause
    exit /b 1
)

echo.
echo Step 3: Deploying to Vercel...
echo.
echo Please make sure you're logged in to Vercel CLI
echo If not logged in, run: vercel login
echo.

call npx vercel --prod

echo.
echo ========================================
echo   Deployment Complete!
echo ========================================
echo.
echo Your new UI is now live on Vercel!
echo.
pause
