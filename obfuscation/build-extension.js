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

    // 3. Obfuscate JavaScript files in dist
    const distFiles = await fs.readdir(distDir);
    const jsFiles = distFiles.filter(f => f.endsWith('.js') && !skipObfuscation.includes(f));

    console.log(`🔒 Obfuscating ${jsFiles.length} JavaScript files...`);

    for (const file of jsFiles) {
      const filePath = path.join(distDir, file);
      const code = await fs.readFile(filePath, 'utf8');

      console.log(`   - Obfuscating: ${file}`);

      const obfuscationResult = JavaScriptObfuscator.obfuscate(code, {
        compact: true,
        controlFlowFlattening: true,
        controlFlowFlatteningThreshold: 0.75,
        deadCodeInjection: true,
        deadCodeInjectionThreshold: 0.4,
        identifierNamesGenerator: 'hexadecimal',
        renameGlobals: false, // Set to false to avoid breaking cross-file global function bindings
        stringArray: true,
        stringArrayEncoding: ['base64'],
        stringArrayThreshold: 0.8,
        unicodeEscapeSequence: false,
        selfDefending: true,
        debugProtection: true,
        debugProtectionInterval: 4000,
        disableConsoleOutput: true,
        splitStrings: true
      });

      await fs.writeFile(filePath, obfuscationResult.getObfuscatedCode(), 'utf8');
    }

    console.log('\n✨ Build completed successfully! Production-ready extension is in the "dist/" directory.');
  } catch (err) {
    console.error('❌ Build failed:', err);
  }
}

build();
