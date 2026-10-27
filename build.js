// Build: copia src/ para dist/ (limpa dist/ antes), aplica as configurações de
// src/conteudo/home.yaml (hero), converte as imagens para AVIF e WebP (com <picture> e
// fallback para o original) e gera sitemap.xml e robots.txt.
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const SRC = path.join(__dirname, 'src');
const DIST = path.join(__dirname, 'dist');
const CONTEUDO = path.join(SRC, 'conteudo');
const CACHE = path.join(__dirname, '.cache', 'images');
const SITE_URL = 'https://gringoswashboard.com/';
const HERO_FADE = 1.5; // segundos de crossfade entre imagens do hero
const IMG_CONVERTIVEIS = /\.(png|jpe?g)$/i;
// Formatos gerados, pela ordem de preferência nos <source> do <picture>.
const FORMATOS = [
  { ext: 'avif', type: 'image/avif', opcoes: { quality: 50, effort: 4 } },
  { ext: 'webp', type: 'image/webp', opcoes: { quality: 75 } },
];

// Parser YAML mínimo (sem dependências): mapas (`chave: valor`) e listas (`- item`),
// aninhados por indentação com espaços. Uma `chave:` sem valor abre um mapa ou uma lista,
// consoante a primeira linha mais indentada que se lhe segue. Um item `- chave: valor` abre
// um mapa, cujas restantes chaves vêm nas linhas seguintes, alinhadas com a primeira.
function lerYaml(ficheiro) {
  const dados = {};
  const CHAVE = /^([\w-]+):(?:\s+(.*))?$/;
  // Contentores abertos, do mais exterior para o mais interior; `valor` fica null até se
  // saber se a chave é um mapa ou uma lista.
  const pilha = [{ indent: -1, valor: dados }];
  const escalar = (v) => {
    v = v.trim().replace(/^(['"])(.*)\1$/, '$2');
    return v !== '' && !isNaN(v) ? Number(v) : v;
  };
  const definir = (mapa, [, chave, valor = ''], indent) => {
    if (valor.trim() !== '') mapa[chave] = escalar(valor);
    else {
      mapa[chave] = null;
      pilha.push({ indent, pai: mapa, chave, valor: null });
    }
  };
  fs.readFileSync(ficheiro, 'utf8').split(/\r?\n/).forEach((linha, i) => {
    const texto = linha.replace(/\s+#.*$/, '').replace(/^\s*#.*$/, '').trimEnd();
    if (!texto) return;
    const erro = () => new Error(`${path.basename(ficheiro)}:${i + 1}: linha não suportada: ${linha}`);
    const indent = texto.match(/^ */)[0].length;
    while (pilha.length > 1 && pilha.at(-1).indent >= indent) pilha.pop();
    const topo = pilha.at(-1);
    const conteudo = texto.slice(indent);
    let m;
    if ((m = conteudo.match(/^-\s+(.*)$/))) {
      if (topo.valor === null) topo.pai[topo.chave] = topo.valor = [];
      if (!Array.isArray(topo.valor)) throw erro();
      const chave = m[1].match(CHAVE);
      if (!chave) return topo.valor.push(escalar(m[1]));
      const item = {};
      topo.valor.push(item);
      pilha.push({ indent, valor: item });
      definir(item, chave, texto.length - m[1].length);
    } else if ((m = conteudo.match(CHAVE))) {
      if (topo.valor === null) topo.pai[topo.chave] = topo.valor = {};
      if (Array.isArray(topo.valor)) throw erro();
      definir(topo.valor, m, indent);
    } else throw erro();
  });
  return dados;
}

function substituirMarcador(ficheiro, marcador, conteudo) {
  const texto = fs.readFileSync(ficheiro, 'utf8');
  if (!marcador.test(texto)) throw new Error(`Marcador ${marcador} não encontrado em ${ficheiro}`);
  fs.writeFileSync(ficheiro, texto.replace(marcador, () => conteudo));
}

// Converte cada PNG/JPG de src/images/ para AVIF e WebP em dist/images/, ao lado do original
// (que fica como fallback). As conversões ficam em .cache/images/ e só se refazem quando o
// original muda.
async function converterImagens() {
  const ficheiros = fs.readdirSync(path.join(SRC, 'images'), { recursive: true })
    .filter((f) => IMG_CONVERTIVEIS.test(f));
  let convertidas = 0;
  await Promise.all(ficheiros.flatMap((f) => FORMATOS.map(async ({ ext, opcoes }) => {
    const origem = path.join(SRC, 'images', f);
    const nome = f.replace(IMG_CONVERTIVEIS, '.' + ext);
    const cache = path.join(CACHE, nome);
    if (!fs.existsSync(cache) || fs.statSync(cache).mtimeMs < fs.statSync(origem).mtimeMs) {
      fs.mkdirSync(path.dirname(cache), { recursive: true });
      await sharp(origem)[ext](opcoes).toFile(cache);
      convertidas++;
    }
    fs.copyFileSync(cache, path.join(DIST, 'images', nome));
  })));
  return { total: ficheiros.length, convertidas };
}

// Envolve cada <img> de uma imagem local convertível num <picture> com <source> AVIF e WebP;
// o <img> original fica como fallback para browsers sem suporte para esses formatos.
function usarPicture(ficheiro) {
  const html = fs.readFileSync(ficheiro, 'utf8').replace(/<img\b[^>]*>/g, (img) => {
    const src = img.match(/\ssrc="(images\/[^"]+)"/);
    if (!src || !IMG_CONVERTIVEIS.test(src[1])) return img;
    const sources = FORMATOS.map(({ ext, type }) =>
      `<source srcset="${src[1].replace(IMG_CONVERTIVEIS, '.' + ext)}" type="${type}">`);
    return `<picture>${sources.join('')}${img}</picture>`;
  });
  fs.writeFileSync(ficheiro, html);
}

async function main() {
  const config = lerYaml(path.join(CONTEUDO, 'home.yaml'));

  fs.rmSync(DIST, { recursive: true, force: true });
  fs.cpSync(SRC, DIST, { recursive: true, filter: (f) => f !== CONTEUDO });

  // Hero (`section_hero`): <img> a partir de `hero` e animação de crossfade a partir de `duracao_hero`.
  const { hero, duracao_hero: duracao } = config.section_hero ?? {};
  if (!Array.isArray(hero) || hero.length === 0) throw new Error('home.yaml: `section_hero.hero` tem de ser uma lista de imagens');
  if (typeof duracao !== 'number' || duracao <= HERO_FADE) throw new Error(`home.yaml: \`section_hero.duracao_hero\` tem de ser um número maior que ${HERO_FADE}`);
  hero.forEach((img) => {
    if (!fs.existsSync(path.join(SRC, 'images', img))) throw new Error(`home.yaml: imagem do hero não existe: images/${img}`);
    if (!IMG_CONVERTIVEIS.test(img)) throw new Error(`home.yaml: imagem do hero tem de ser PNG ou JPG: ${img}`);
  });

  substituirMarcador(path.join(DIST, 'index.html'), /^[ \t]*<!-- @hero-imagens.*-->/m,
    hero.map((img) => `      <img src="images/${img}" alt="" width="1920" height="900">`).join('\n'));

  // Cada imagem fica `duracao` s visível; o ciclo é n × duracao. A imagem k começa a aparecer
  // em k × duracao − fade, para a primeira já estar visível ao carregar a página.
  // As imagens do hero ficam dentro de <picture> (ver usarPicture), daí o `picture:nth-of-type`.
  const ciclo = hero.length * duracao;
  const pct = (s) => `${+(s / ciclo * 100).toFixed(2)}%`;
  const s = (v) => `${+v.toFixed(2)}s`;
  const cssHero = hero.length === 1
    ? '.hero img { opacity: 1; }'
    : [
      `.hero img { animation: hero-fade ${s(ciclo)} infinite; }`,
      ...hero.map((_, k) => `.hero picture:nth-of-type(${k + 1}) img { animation-delay: -${s((ciclo - k * duracao + HERO_FADE) % ciclo)}; }`),
      '@keyframes hero-fade {',
      `  0% { opacity: 0; }`,
      `  ${pct(HERO_FADE)} { opacity: 1; }`,
      `  ${pct(duracao)} { opacity: 1; }`,
      `  ${pct(duracao + HERO_FADE)} { opacity: 0; }`,
      `  100% { opacity: 0; }`,
      '}',
    ].join('\n');
  substituirMarcador(path.join(DIST, 'css', 'style.css'), /\/\* @hero-animacao \*\//, cssHero);

  // Imagens: AVIF + WebP e <picture> em todas as páginas.
  const imagens = await converterImagens();
  fs.readdirSync(DIST).filter((f) => f.endsWith('.html')).forEach((f) => usarPicture(path.join(DIST, f)));

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

  console.log(`Build concluído: src/ → dist/ (${imagens.total} imagens em AVIF/WebP, ${imagens.convertidas} conversões novas; sitemap com ${urls.length} páginas, robots.txt)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
