'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');

// 1. Emit declaration files via tsc (JS emitting is handled by esbuild below)
execSync('tsc', { stdio: 'inherit', cwd: root });

// 2. Rename dist/index.d.ts -> dist/vanilla-router.d.ts
fs.renameSync(
    path.join(root, 'dist', 'index.d.ts'),
    path.join(root, 'dist', 'vanilla-router.d.ts')
);

// 3. Bundle all source into a single CJS file via esbuild
execSync(
    'esbuild src/index.ts --bundle --format=cjs --platform=browser --outfile=dist/vanilla-router.js',
    { stdio: 'inherit', cwd: root }
);

// 4. Minify
execSync(
    'terser dist/vanilla-router.js -o dist/vanilla-router.min.js --compress --mangle',
    { stdio: 'inherit', cwd: root }
);

console.log('Build complete: dist/vanilla-router.js, dist/vanilla-router.min.js, dist/vanilla-router.d.ts');
