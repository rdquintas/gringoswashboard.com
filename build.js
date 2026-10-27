// Build: copia src/ para dist/ (limpa dist/ antes) e gera sitemap.xml e robots.txt.
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, 'src');
const DIST = path.join(__dirname, 'dist');
const SITE_URL = 'https://gringoswashboard.com/';

fs.rmSync(DIST, { recursive: true, force: true });
fs.cpSync(SRC, DIST, { recursive: true });

// Sitemap: uma entrada por cada .html na raiz de src/ (index.html → raiz do site).
const urls = fs.readdirSync(SRC)
  .filter((f) => f.endsWith('.html'))
  .sort((a, b) => (a === 'index.html' ? -1 : b === 'index.html' ? 1 : a.localeCompare(b)))
  .map((f) => {
    const loc = SITE_URL + (f === 'index.html' ? '' : f);
    const lastmod = fs.statSync(path.join(SRC, f)).mtime.toISOString().slice(0, 10);
    return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`;
  });

fs.writeFileSync(path.join(DIST, 'sitemap.xml'),
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  urls.join('\n') + '\n</urlset>\n');

fs.writeFileSync(path.join(DIST, 'robots.txt'),
  `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}sitemap.xml\n`);

console.log(`Build concluído: src/ → dist/ (sitemap com ${urls.length} páginas, robots.txt)`);
