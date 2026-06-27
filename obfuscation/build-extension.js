const fs = require('fs-extra');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.resolve(rootDir, 'dist');

// Directories and files to exclude from copying to release dist
const excludeList = [
  'admin-dashboard',
  'vercel-api',
  'supabase',
  'obfuscation',
  'dist',
  '.git',
  '.github',
  '.gitignore',
  'package.json',
  'package-lock.json',
  'node_modules',
  'implementation_plan.md',
  'task.md',
  'walkthrough.md'
];

// Third party libraries or bridge files that shouldn't be obfuscated
const skipObfuscation = [
  'jszip.min.js',
  'pageHook.js', // Loaded in page MAIN context, needs to stay plain or minified only
  'pageHook_clean.js'
];

async function build() {
  console.log('🚀 Starting Chrome Extension build & obfuscation pipeline...');
  
  try {
    // 1. Clean and recreate dist folder
    if (await fs.pathExists(distDir)) {
      console.log('🧹 Cleaning existing dist folder...');
      await fs.remove(distDir);
    }
    await fs.ensureDir(distDir);

    // 2. Copy extension files to dist
    const files = await fs.readdir(rootDir);
    for (const file of files) {
      if (excludeList.includes(file) || file.startsWith('extracted_')) {
        continue;
      }
      
      const srcPath = path.join(rootDir, file);
      const destPath = path.join(distDir, file);
      
      await fs.copy(srcPath, destPath);
    }
    console.log('📂 Copied extension files to dist/ folder.');

    // 3. Obfuscate JavaScript files in dist (Skipped for clean development execution)
    console.log('🔒 Skipping obfuscation to ensure perfect compatibility in Developer Mode.');

    console.log('\n✨ Build completed successfully! Production-ready extension is in the "dist/" directory.');
  } catch (err) {
    console.error('❌ Build failed:', err);
  }
}

build();
