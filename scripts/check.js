// Syntax-checks every first-party JS file (backend, database, scripts, tests, frontend, service worker).
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIRS = ['backend', 'database', 'scripts', 'test', 'js'];
const FILES = ['sw.js'];

function collect(dir) {
    const full = path.join(ROOT, dir);
    if (!fs.existsSync(full)) return [];
    return fs.readdirSync(full, { withFileTypes: true }).flatMap((entry) => {
        const rel = path.join(dir, entry.name);
        if (entry.isDirectory()) return collect(rel);
        return entry.name.endsWith('.js') ? [rel] : [];
    });
}

const files = [...DIRS.flatMap(collect), ...FILES.filter((file) => fs.existsSync(path.join(ROOT, file)))];
let failed = 0;
for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', path.join(ROOT, file)], { encoding: 'utf8' });
    if (result.status !== 0) {
        failed += 1;
        console.error(`FAIL ${file}\n${result.stderr}`);
    }
}
console.log(`${files.length - failed}/${files.length} files OK`);
process.exit(failed ? 1 : 0);
