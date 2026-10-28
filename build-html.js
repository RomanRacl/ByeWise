// Sestaví samostatnou HTML verzi (jeden soubor, bez serveru): `npm run build:html`
// Výstup: buywise.html – ukázková data, úpravy, importy a záloha v prohlížeči (localStorage).
// Živá data, přihlášení, e-maily a push má jen verze nasazená na Vercelu.
//
// Jednoduchý bundler: každý modul dostane vlastní rozsah platnosti (funkci), importy se napojí na exporty.
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';

const ROOT = new URL('.', import.meta.url).pathname;
const read = (p) => readFile(join(ROOT, p), 'utf8');
const ENTRY = 'public/app.js';
// V samostatné verzi se administrace napojí na prohlížeč místo serveru.
const SWAP = { 'public/js/admin-api.js': 'public/js/local-api.js' };

const order = [];
const sources = {};

async function load(path) {
  path = SWAP[path] || path;
  if (sources[path] !== undefined) return path;
  sources[path] = null;
  const src = await read(path);
  const deps = [];
  for (const m of src.matchAll(/^import\s[\s\S]*?\sfrom\s+['"]([^'"]+)['"];?/gm)) deps.push(m[1]);
  for (const d of deps) await load(normalize(join(dirname(path), d)));
  sources[path] = src;
  order.push(path);
  return path;
}
await load(ENTRY);

const id = (p) => '__' + p.replace(/^public\//, '').replace(/[^a-zA-Z0-9]/g, '_');

function transform(path, src) {
  const exportsList = [];
  let out = src.replace(/^import\s+\{([\s\S]*?)\}\s+from\s+['"]([^'"]+)['"];?[ \t]*$/gm, (_, names, from) => {
    let dep = normalize(join(dirname(path), from));
    dep = SWAP[dep] || dep;
    const spec = names
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => s.replace(/\s+as\s+/, ': '))
      .join(', ');
    return `const { ${spec} } = ${id(dep)};`;
  });
  out = out.replace(/^export\s+\{([^}]*)\};?[ \t]*$/gm, (_, names) => {
    names.split(',').map((s) => s.trim()).filter(Boolean).forEach((n) => exportsList.push(n));
    return '';
  });
  out = out.replace(/^export\s+((?:async\s+)?function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/gm, (_, kw, name) => {
    exportsList.push(name);
    return `${kw} ${name}`;
  });
  if (/^\s*(import|export)\s/m.test(out)) throw new Error(`Nezpracovaný import/export v ${path}`);
  return `const ${id(path)} = (() => {\n${out}\nreturn { ${exportsList.join(', ')} };\n})();`;
}

const parts = {};
for (const p of order) parts[p] = sources[p];

// Úpravy pro samostatný režim
function replaceOnce(path, from, to, label) {
  if (!parts[path].includes(from)) throw new Error(`Náhrada nenalezena: ${label}`);
  parts[path] = parts[path].replace(from, to);
}
replaceOnce('public/js/core.js', 'standalone: false,', 'standalone: true,', 'standalone');
replaceOnce('public/js/core.js', "hash: location.protocol === 'file:',", 'hash: true,', 'hash');
replaceOnce('public/js/user.js', 'const dynImport = (u) => import(u);', "const dynImport = () => Promise.reject(new Error('offline'));", 'dynImport');
{
  const app = parts[ENTRY];
  replaceOnce(
    ENTRY,
    app.slice(app.indexOf('async function loadData()'), app.indexOf('async function loadConfig()')),
    `async function loadData() {
  const d = loadLocalData();
  return { mode: 'local', edited: d.edited, meta: { rates: DEMO_RATES }, settings: d.settings, products: d.products };
}

`,
    'loadData'
  );
  replaceOnce(ENTRY, "import { demoProducts, DEMO_RATES } from './lib/seed.js';", "import { demoProducts, DEMO_RATES } from './lib/seed.js';\nimport { loadLocalData } from './js/admin-api.js';", 'import loadLocalData');
}

const script = order.map((p) => `// ----- ${p.replace('public/', '')} -----\n${transform(p, parts[p])}`).join('\n\n');
if (/\bimport\(/.test(script)) throw new Error('Ve skriptu zůstal dynamický import');

const [html, css] = await Promise.all([read('public/index.html'), read('public/styles.css')]);
const favicon = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath d='M3 7q0-2 2-2h15l9 11-9 11H5q-2 0-2-2z' fill='%23FFC929'/%3E%3Ccircle cx='10' cy='15' r='3.4' fill='%2316222B'/%3E%3Ccircle cx='17' cy='15' r='3.4' fill='%2316222B'/%3E%3Ccircle cx='10.9' cy='14.2' r='1.1' fill='%23FFC929'/%3E%3Ccircle cx='17.9' cy='14.2' r='1.1' fill='%23FFC929'/%3E%3Cpath d='M12.4 19h2.2l-1.1 2.2z' fill='%2316222B'/%3E%3C/svg%3E";
let out = html
  .replace('<link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />', `<link rel="icon" href="${favicon}" />`)
  .replace(/\s*<link rel="apple-touch-icon"[^>]*>/, '')
  .replace(/\s*<meta property="og:image"[^>]*>/, '')
  .replace(/\s*<link rel="manifest"[^>]*>/, '')
  .replace('<link rel="stylesheet" href="/styles.css" />', () => `<style>\n${css}\n</style>`)
  .replace('<script type="module" src="/app.js"></script>', () => `<script type="module">\n${script.replace(/<\/script/gi, '<\\/script')}\n</script>`);
if (out.includes('src="/app.js"') || out.includes('href="/styles.css"')) throw new Error('Nepodařilo se vložit CSS/JS');

await writeFile(join(ROOT, 'buywise.html'), out);
console.log(`Hotovo: buywise.html (${(out.length / 1024).toFixed(0)} kB, ${order.length} modulů)`);
