const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

function walk(dir) {
    return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
        const rel = path.posix.join(dir, entry.name);
        return entry.isDirectory() ? walk(rel) : [rel];
    });
}

async function loadTranslations() {
    const source = read('js/core/i18n.js');
    const match = source.match(/const translations = (\{[\s\S]*?\n\});\n\nconst SUPPORTED/);
    return new Function(`return ${match[1]}`)();
}

test('en and de define the same keys', async () => {
    const { en, de } = await loadTranslations();
    assert.deepEqual(Object.keys(en).sort(), Object.keys(de).sort());
});

test('every translation key used in HTML and JS exists', async () => {
    const { en } = await loadTranslations();
    const used = new Set();
    const html = read('index.html');
    for (const match of html.matchAll(/data-i18n(?:-placeholder|-aria)?="([^"]+)"/g)) used.add(match[1]);
    for (const file of walk('js').filter((name) => name.endsWith('.js') && name !== 'js/core/i18n.js')) {
        const source = read(file);
        for (const match of source.matchAll(/\bt\('([A-Za-z0-9]+)'/g)) used.add(match[1]);
        for (const match of source.matchAll(/(?:label|key|i18n):\s*'([A-Za-z0-9]+)'/g)) used.add(match[1]);
    }
    // Keys built dynamically as `rank${name}` are covered explicitly.
    ['Newcomer', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Master'].forEach((rank) => used.add(`rank${rank}`));
    const missing = [...used].filter((key) => !(key in en));
    assert.deepEqual(missing, []);
});

test('service worker precaches every css and js file plus the badges', () => {
    const sw = read('sw.js');
    const block = sw.match(/const SHELL = \[([\s\S]*?)\];/)[1];
    const shell = new Set([...block.matchAll(/'(\/[^']*)'/g)].map((match) => match[1]));
    const expected = [...walk('css'), ...walk('js')].map((file) => `/${file}`);
    const missing = expected.filter((file) => !shell.has(file));
    assert.deepEqual(missing, []);
    for (const file of shell) {
        if (file === '/') continue;
        assert.ok(fs.existsSync(path.join(ROOT, file)), `${file} is listed in sw.js but does not exist`);
    }
});

test('index.html uses no inline scripts, styles or handlers (strict CSP)', () => {
    const html = read('index.html');
    assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(html), 'inline <script>');
    assert.ok(!/\sstyle="/i.test(html), 'inline style attribute');
    assert.ok(!/\son[a-z]+="/i.test(html), 'inline event handler');
});

test('no inline style attributes or emoji are created by the frontend code', () => {
    for (const file of walk('js').filter((name) => name.endsWith('.js'))) {
        const source = read(file);
        assert.ok(!/setAttribute\('style'/.test(source), `${file} sets a style attribute`);
        assert.ok(!/\bstyle:\s*['`]/.test(source), `${file} passes a style attribute string`);
        assert.ok(!/\p{Extended_Pictographic}/u.test(source), `${file} contains an emoji`);
    }
});
