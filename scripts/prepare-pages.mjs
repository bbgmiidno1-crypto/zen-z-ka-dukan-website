import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Prepare a GitHub Pages *artifact*, not a complete production deployment. The
// store still needs a separately hosted, durable, correctly configured API.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(root, process.argv[2] || 'dist-pages');
const base = '/zen-z-ka-dukan-website/';
const indexPath = path.join(out, 'index.html');
if (!fs.existsSync(indexPath)) throw new Error(`Build output not found at ${indexPath}; run the Vite Pages build first.`);
let index = fs.readFileSync(indexPath, 'utf8');
if (!index.includes(`${base}assets/`)) throw new Error('Build output does not use the required GitHub Pages base path.');

// GitHub Pages returns its 404.html for a direct SPA route. Redirect that request
// to the existing index, then restore the original same-origin route before
// React Router starts. No redirect to another host is accepted.
const restore = `<script>(function(){var p=new URLSearchParams(location.search).get('__zzkd_route');if(!p)return;try{var u=new URL(p,location.origin);if(u.origin===location.origin&&u.pathname.startsWith(${JSON.stringify(base)})){history.replaceState(null,'',u.pathname+u.search+u.hash);}}catch(e){}})();</script>`;
if (!index.includes('</head>')) throw new Error('The built index is missing </head>.');
index = index.replace('</head>', `  ${restore}\n  </head>`);
fs.writeFileSync(indexPath, index);
const fallback = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ZEN Z KA DUKAN</title></head><body><p>Opening the requested page…</p><script>(function(){var b=${JSON.stringify(base)};if(!location.pathname.startsWith(b))return;var r=location.pathname+location.search+location.hash;location.replace(b+'?__zzkd_route='+encodeURIComponent(r));})();</script></body></html>`;
fs.writeFileSync(path.join(out, '404.html'), fallback);
fs.writeFileSync(path.join(out, '.nojekyll'), '');

// These are the same catalogue photographs/frames already shipped in source.
// Runtime user uploads are intentionally not copied from the live store.
const seed = path.join(root, 'data', 'uploads', 'seed');
if (!fs.existsSync(seed)) throw new Error('Bundled seed media is missing.');
fs.cpSync(seed, path.join(out, 'media', 'seed'), { recursive: true });
console.log(`Prepared GitHub Pages artifact in ${out}; a compatible live API is still required.`);
