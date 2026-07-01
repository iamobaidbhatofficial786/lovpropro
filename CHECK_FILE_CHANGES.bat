@echo off
echo ========================================
echo   File Modification Check
echo ========================================
echo.
echo Checking when files were last modified...
echo.

echo EXTENSION FILES:
echo ----------------
dir "manifest.json" | find "manifest.json"
dir "extension-config.js" | find "extension-config.js"
dir "theme.css" | find "theme.css"
dir "sidepanel.html" | find "sidepanel.html"

echo.
echo ADMIN DASHBOARD FILES:
echo ----------------------
dir "admin-dashboard\package.json" | find "package.json"
dir "admin-dashboard\src\app\page.tsx" | find "page.tsx"
dir "admin-dashboard\src\app\globals.css" | find "globals.css"

echo.
echo ========================================
echo.
echo Now let's check the CONTENT of key files:
echo.

echo ========================================
echo CHECKING: manifest.json (Line 4 - version)
echo ========================================
findstr /N "version" manifest.json | findstr /C:"\"version\""
echo.

echo ========================================
echo CHECKING: theme.css (Line 35 - accent color)
echo ========================================
findstr /N "ql-accent:" theme.css | findstr /V "hover" | findstr /V "glow" | findstr /V "subtle" | findstr /V "cyan" | findstr /V "pink"
echo.

echo ========================================
echo CHECKING: extension-config.js (Line 5)
echo ========================================
findstr /N "EXTENSION_VERSION" extension-config.js
echo.

echo ========================================
echo.
echo EXPECTED VALUES:
echo - manifest.json version: "6.4.6"
echo - theme.css accent: #8b5cf6 (PURPLE)
echo - extension-config.js: "6.4.6"
echo.
echo If you see these values, the files ARE changed!
echo.
echo ========================================
pause
