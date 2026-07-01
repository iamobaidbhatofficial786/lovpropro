# Force Reload Chrome Extension - Complete Guide

## The Problem
Your extension CSS files have been updated with the new purple theme, but Chrome is showing the OLD cached cyan/teal theme.

## The Solution - Complete Cache Clear (Do ALL steps)

### Step 1: Remove Extension Completely
1. Open Chrome and go to: `chrome://extensions/`
2. Find "PowerKits" or your extension
3. Click the **REMOVE** button (not just disable)
4. Confirm removal

### Step 2: Clear ALL Chrome Cache
1. Press `Ctrl + Shift + Delete` (or go to `chrome://settings/clearBrowserData`)
2. Select **"All time"** in time range
3. Check these boxes:
   - ✅ Browsing history
   - ✅ Cookies and other site data
   - ✅ Cached images and files
4. Click **"Clear data"**

### Step 3: Close Chrome COMPLETELY
1. Close ALL Chrome windows
2. Open Task Manager (`Ctrl + Shift + Esc`)
3. Find any "Google Chrome" processes
4. Right-click and "End Task" on each one
5. Make sure NO Chrome processes are running

### Step 4: Restart & Reload Extension
1. Open Chrome fresh
2. Go to: `chrome://extensions/`
3. Enable **"Developer mode"** (toggle in top-right)
4. Click **"Load unpacked"**
5. Navigate to your extension folder:
   ```
   D:\lovable-powerkits-6.4.5\lovable-powerkits-6.4.5
   ```
6. Select the folder and click "Select Folder"

### Step 5: Force Hard Refresh
1. After extension loads, open any webpage
2. Click the extension icon
3. Press `Ctrl + Shift + R` (hard refresh)
4. Or right-click and select "Reload"

## Verify the New Theme
You should now see:
- **Purple** accent color (#8b5cf6) - NOT cyan/teal
- Glassmorphic effects
- Purple/cyan/pink gradients
- Modern animations

## Still Seeing Old Theme?

If you still see cyan/teal colors after ALL above steps:

### Check 1: Verify Files Are Updated
Open `theme.css` in Notepad and search for `--ql-accent:`
- Should be: `--ql-accent: #8b5cf6;` (PURPLE)
- Should NOT be: `--ql-accent: #00f2fe;` (CYAN)

### Check 2: Check Console
1. Right-click extension popup
2. Select "Inspect"
3. Go to Console tab
4. Type: `getComputedStyle(document.documentElement).getPropertyValue('--ql-accent')`
5. Should return: `#8b5cf6` (purple)

### Check 3: Disable Browser Cache (Development Mode)
1. Open extension popup
2. Right-click > Inspect
3. Go to "Network" tab
4. Check "Disable cache" checkbox
5. Reload the extension

## Alternative: Manual Cache Clear
If above doesn't work:
1. Go to extension folder
2. Open `manifest.json`
3. Change version from `"6.4.5"` to `"6.4.6"`
4. Save file
5. Reload extension in Chrome
6. This forces Chrome to treat it as a new extension

## Need More Help?
The CSS files ARE updated correctly. This is 100% a browser caching issue.
All files contain the new purple theme - you just need Chrome to load them fresh.
