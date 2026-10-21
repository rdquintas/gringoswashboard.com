// Build: por agora só copia src/ para dist/ (limpa dist/ antes).
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, 'src');
const DIST = path.join(__dirname, 'dist');

fs.rmSync(DIST, { recursive: true, force: true });
fs.cpSync(SRC, DIST, { recursive: true });

console.log('Build concluído: src/ → dist/');
