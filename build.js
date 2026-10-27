// Build: copia src/ para dist/ (limpa dist/ antes), inclui os partials (header, footer),
// aplica as configurações de src/conteudo/home.yaml (hero) e site.yaml (redes sociais), converte as imagens para AVIF e WebP (com <picture> e
// fallback para o original) e gera sitemap.xml e robots.txt.
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const SRC = path.join(__dirname, 'src');
const DIST = path.join(__dirname, 'dist');
const CONTEUDO = path.join(SRC, 'conteudo');
const PARTIALS = path.join(SRC, 'partials');
const CACHE = path.join(__dirname, '.cache', 'images');
const SITE_URL = 'https://gringoswashboard.com/';
const HERO_FADE = 1.5; // segundos de crossfade entre imagens do hero
const IMG_CONVERTIVEIS = /\.(png|jpe?g)$/i;
// Redes sociais aceites em `links` do site.yaml: nome (aria-label) e ícone do Font Awesome.
const REDES = {
  facebook: ['Facebook', 'fa-facebook'],
  instagram: ['Instagram', 'fa-instagram'],
  youtube: ['YouTube', 'fa-youtube'],
  spotify: ['Spotify', 'fa-spotify'],
  soundcloud: ['SoundCloud', 'fa-soundcloud'],
  bandcamp: ['Bandcamp', 'fa-bandcamp'],
};
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
  // Valores entre aspas ficam sempre texto (ex.: '+351…'); só os outros podem ser números.
  const escalar = (v) => {
    v = v.trim();
    const aspas = v.match(/^(['"])(.*)\1$/);
    if (aspas) return aspas[2];
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

// Substitui cada `<!-- @partial nome chave="valor" … -->` pelo conteúdo de src/partials/nome.html,
// indentado como o marcador. Cada `{{chave}}` do partial leva o valor do atributo com o mesmo
// nome (obrigatório); `{{chave?}}` é opcional e fica vazio, e um `class=""` que daí resulte sai.
// No header, o link do menu para a própria página leva aria-current="page".
function incluirPartials(ficheiro) {
  const pagina = path.basename(ficheiro);
  const html = fs.readFileSync(ficheiro, 'utf8').replace(/^([ \t]*)<!-- @partial ([\w-]+)((?:\s+[\w-]+="[^"]*")*)\s*-->/gm, (_, indent, nome, atributos) => {
    const origem = path.join(PARTIALS, `${nome}.html`);
    if (!fs.existsSync(origem)) throw new Error(`${pagina}: partial não existe: partials/${nome}.html`);
    const valores = Object.fromEntries([...atributos.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => m.slice(1)));
    let partial = fs.readFileSync(origem, 'utf8').replace(/\r?\n$/, '')
      .replace(/\{\{([\w-]+)(\??)\}\}/g, (_, chave, opcional) => {
        if (chave in valores) return valores[chave];
        if (opcional) return '';
        throw new Error(`${pagina}: falta o atributo ${chave}="…" no <!-- @partial ${nome} -->`);
      })
      .replace(/ class=""/g, '');
    if (nome === 'header') partial = partial.replace(`<a href="${pagina}">`, `<a href="${pagina}" aria-current="page">`);
    return partial.split(/\r?\n/).map((l) => (l ? indent + l : l)).join('\n');
  });
  fs.writeFileSync(ficheiro, html);
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
  const site = lerYaml(path.join(CONTEUDO, 'site.yaml'));

  fs.rmSync(DIST, { recursive: true, force: true });
  fs.cpSync(SRC, DIST, { recursive: true, filter: (f) => f !== CONTEUDO && f !== PARTIALS });
  const paginas = fs.readdirSync(DIST).filter((f) => f.endsWith('.html'));
  paginas.forEach((f) => incluirPartials(path.join(DIST, f)));

  // Hero (`section_hero`): <img> a partir de `hero`, botões a partir de `cta1`/`cta2` e
  // animação de crossfade a partir de `duracao_hero`.
  const { hero, duracao_hero: duracao } = config.section_hero ?? {};
  if (!Array.isArray(hero) || hero.length === 0) throw new Error('home.yaml: `section_hero.hero` tem de ser uma lista de imagens');
  if (typeof duracao !== 'number' || duracao <= HERO_FADE) throw new Error(`home.yaml: \`section_hero.duracao_hero\` tem de ser um número maior que ${HERO_FADE}`);
  hero.forEach((img) => {
    if (!fs.existsSync(path.join(SRC, 'images', img))) throw new Error(`home.yaml: imagem do hero não existe: images/${img}`);
    if (!IMG_CONVERTIVEIS.test(img)) throw new Error(`home.yaml: imagem do hero tem de ser PNG ou JPG: ${img}`);
  });

  substituirMarcador(path.join(DIST, 'index.html'), /^[ \t]*<!-- @hero-imagens.*-->/m,
    hero.map((img) => `      <img src="images/${img}" alt="" width="1920" height="900">`).join('\n'));

  // Botões do hero a partir de `cta1` (dourado) e `cta2` (preto), com o texto em `pt`.
  // Um CTA sem `link` não é colocado; sem nenhum, não fica o contentor .hero-cta.
  const escapar = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const ctas = [['cta1', 'btn--gold'], ['cta2', 'btn--black']]
    .filter(([chave]) => String(config.section_hero[chave]?.link ?? '').trim() !== '')
    .map(([chave, classe]) => {
      const { pt, link } = config.section_hero[chave];
      if (!pt) throw new Error(`home.yaml: \`section_hero.${chave}.pt\` tem de ter o texto do botão`);
      return `        <a class="btn ${classe}" href="${escapar(link)}">${escapar(pt)}</a>`;
    });
  substituirMarcador(path.join(DIST, 'index.html'), /^[ \t]*<!-- @hero-cta.*-->\n?/m,
    ctas.length ? `      <div class="hero-cta">\n${ctas.join('\n')}\n      </div>\n` : '');

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

  // Redes sociais (`links` do site.yaml): cada `<!-- @social -->` dos partials dá lugar à
  // lista de ícones, pela ordem do YAML, abertos noutra janela. Uma rede com link vazio não
  // é colocada; sem nenhuma, a lista também não.
  const social = Object.entries(site.links ?? {})
    .filter(([, link]) => String(link ?? '').trim() !== '')
    .map(([rede, link]) => {
      if (!REDES[rede]) throw new Error(`site.yaml: rede social desconhecida em \`links\`: ${rede} (conhecidas: ${Object.keys(REDES).join(', ')})`);
      const [nome, icone] = REDES[rede];
      return `<li><a class="fx-tada" href="${escapar(link)}" target="_blank" rel="noopener" aria-label="${nome}"><i class="fa-brands ${icone}"></i></a></li>`;
    });
  // Contactos do site.yaml: cada `<!-- @email -->` dá lugar ao link mailto de `contactos.email`
  // e cada `<!-- @telefone -->` ao link tel de `contactos.telefone` (sem espaços no href).
  const email = String(site.contactos?.email ?? '').trim();
  if (!email) throw new Error('site.yaml: `contactos.email` tem de ter o email de contacto');
  const linkEmail = `<a href="mailto:${escapar(email)}">${escapar(email)}</a>`;
  const telefone = String(site.contactos?.telefone ?? '').trim();
  if (!telefone) throw new Error('site.yaml: `contactos.telefone` tem de ter o telefone de contacto');
  const linkTelefone = `<a href="tel:${escapar(telefone.replace(/\s/g, ''))}">${escapar(telefone)}</a>`;
  paginas.forEach((f) => {
    const ficheiro = path.join(DIST, f);
    const html = fs.readFileSync(ficheiro, 'utf8').replace(/^([ \t]*)<!-- @social -->\r?\n?/gm, (_, indent) =>
      social.length ? [`${indent}<ul class="social">`, ...social.map((li) => `${indent}  ${li}`), `${indent}</ul>`].join('\n') + '\n' : '')
      .replace(/<!-- @email -->/g, linkEmail)
      .replace(/<!-- @telefone -->/g, linkTelefone);
    fs.writeFileSync(ficheiro, html);
  });

  // Imagens: AVIF + WebP e <picture> em todas as páginas.
  const imagens = await converterImagens();
  paginas.forEach((f) => usarPicture(path.join(DIST, f)));

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
