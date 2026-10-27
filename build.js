// Build: copia src/ para dist/ (limpa dist/ antes) e gera cada página numa versão por língua
// (pt em dist/, en em dist/en/), escolhendo os blocos {{#lang xx}}…{{/lang}}. Inclui os partials
// (header, footer), aplica as configurações de src/conteudo/home.yaml (hero) e site.yaml (redes
// sociais, contactos, Google Analytics), converte as imagens para AVIF e WebP (com <picture> e fallback para o
// original) e gera sitemap.xml e robots.txt.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');

const SRC = path.join(__dirname, 'src');
const DIST = path.join(__dirname, 'dist');
const CONTEUDO = path.join(SRC, 'conteudo');
const PARTIALS = path.join(SRC, 'partials');
const MODELOS = path.join(SRC, 'modelos');
const CACHE = path.join(__dirname, '.cache', 'images');
// URL público do site (og:url, og:image, sitemap). Por agora o do GitHub Pages; ao passar para o
// domínio próprio, mudar para 'https://gringoswashboard.com/'.
const SITE_URL = 'https://rdquintas.github.io/gringoswashboard.com/dist/';
const HERO_FADE = 1.5; // segundos de crossfade entre imagens do hero
const IMG_CONVERTIVEIS = /\.(png|jpe?g)$/i;
// Línguas do site: pasta em dist/ (a primeira é a principal, na raiz), código para lang/hreflang,
// locale do og:locale e nome e bandeira (em images/) do link para mudar de língua.
const LINGUAS = {
  pt: { pasta: '', codigo: 'pt-PT', og: 'pt_PT', nome: 'Português', bandeira: 'flag-pt.svg' },
  en: { pasta: 'en/', codigo: 'en', og: 'en_GB', nome: 'English', bandeira: 'flag-uk.svg' },
};
// Datas da agenda, por língua: dias da semana e meses abreviados para a lista (ex.: "Sex, 6 nov")
// e locale para a data por extenso nas páginas dos concertos (ex.: "sábado, 21 de novembro de 2026").
const DATAS = {
  pt: {
    dias: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'],
    meses: ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'],
    locale: 'pt-PT',
  },
  en: {
    dias: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    meses: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    locale: 'en-GB',
  },
};
// Textos da agenda e das páginas dos concertos gerados pelo build, por língua.
const ROTULOS = {
  pt: { bilhetes: 'Bilhetes', info: 'Informações', comprar: 'Comprar bilhetes', local: 'Local', mapa: 'Ver no mapa', voltar: 'Voltar à agenda', whatsapp: 'Conversar no WhatsApp' },
  en: { bilhetes: 'Tickets', info: 'Info', comprar: 'Buy tickets', local: 'Venue', mapa: 'View on map', voltar: 'Back to tour dates', whatsapp: 'Chat on WhatsApp' },
};
// Imagem de partilha (og:image) dos concertos: JPG com estas medidas, a partir de `imagem_v_4x5`.
const OG = { largura: 1440, altura: 1800, qualidade: 85 };
// Favicons: PNG quadrados gerados a partir do logo, em dist/images/ (nome → lado em px).
const FAVICON = { origem: 'logo.jpg', tamanhos: { 'favicon-32.png': 32, 'apple-touch-icon.png': 180 } };
// Tamanho máximo do resumo de um concerto (meta description e og:description).
const RESUMO_MAX = 200;
// Redes aceites em `links` (redes sociais) do site.yaml: nome (aria-label) e ícone do Font
// Awesome.
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

// `conteudo` pode ser texto ou uma função de substituição (recebe o que o marcador apanhou).
function substituirMarcador(texto, marcador, conteudo, onde) {
  if (!marcador.test(texto)) throw new Error(`Marcador ${marcador} não encontrado em ${onde}`);
  return texto.replace(marcador, typeof conteudo === 'function' ? conteudo : () => conteudo);
}

// Substitui cada `<!-- @partial nome chave="valor" … -->` pelo conteúdo de src/partials/nome.html,
// indentado como o marcador. Cada `{{chave}}` do partial leva o valor do atributo com o mesmo
// nome (obrigatório); `{{chave?}}` é opcional e fica vazio, e um `class=""` que daí resulte sai.
// No header, o link do menu para a própria página leva aria-current="page".
function incluirPartials(html, pagina) {
  return html.replace(/^([ \t]*)<!-- @partial ([\w-]+)((?:\s+[\w-]+="[^"]*")*)\s*-->/gm, (_, indent, nome, atributos) => {
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
}

// Fica só com o conteúdo dos blocos `{{#lang xx}}…{{/lang}}` da língua `lingua` (os blocos podem
// ocupar várias linhas, mas não se podem aninhar). Um bloco de outra língua que ocupe linhas
// inteiras sai com elas, para não deixar linhas em branco.
function escolherLingua(html, lingua, pagina) {
  const BLOCO = /(^[ \t]*)?\{\{#lang ([\w-]+)\}\}([\s\S]*?)\{\{\/lang\}\}([ \t]*\r?\n)?/gm;
  const resultado = html.replace(BLOCO, (_, inicio, l, conteudo, fim) => {
    if (!LINGUAS[l]) throw new Error(`${pagina}: língua desconhecida em {{#lang ${l}}} (conhecidas: ${Object.keys(LINGUAS).join(', ')})`);
    if (conteudo.includes('{{#lang')) throw new Error(`${pagina}: blocos {{#lang}} aninhados ou sem {{/lang}}`);
    if (l === lingua) return (inicio ?? '') + conteudo + (fim ?? '');
    return inicio !== undefined && fim !== undefined ? '' : (inicio ?? '') + (fim ?? '');
  });
  const solto = resultado.match(/\{\{[#/]lang\b[^}]*\}\}/);
  if (solto) throw new Error(`${pagina}: ${solto[0]} sem par`);
  return resultado;
}

// Numa página que fica numa subpasta de dist/ (ex.: en/), os caminhos relativos para recursos
// (css/, js/, images/…) passam a subir `nivel` pastas; os links para páginas .html ficam, porque
// cada língua tem as mesmas páginas.
function subirCaminhos(html, nivel) {
  const prefixo = '../'.repeat(nivel);
  const subir = (url) => (url === '' || /^([a-z][\w+.-]*:|#|\/)/i.test(url) || /\.html([#?]|$)/.test(url) ? url : prefixo + url);
  return html.replace(/(\s(?:src|href|srcset)=")([^"]*)"/g, (_, atributo, valor) =>
    atributo + (atributo.includes('srcset') ? valor.split(',').map((c) => c.trim().replace(/^\S+/, subir)).join(', ') : subir(valor)) + '"');
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

// Imagem de partilha de um concerto: `img` (de src/images/) em JPG OG.largura×OG.altura, cortada
// ao centro e sem nada por cima, em dist/images/og/<slug>.jpg. A conversão fica em
// .cache/images/og/ e só se refaz quando o original muda. Devolve true se converteu.
async function imagemOg(img, slug) {
  const origem = path.join(SRC, 'images', img);
  const cache = path.join(CACHE, 'og', img.replace(IMG_CONVERTIVEIS, '.jpg'));
  let convertida = false;
  if (!fs.existsSync(cache) || fs.statSync(cache).mtimeMs < fs.statSync(origem).mtimeMs) {
    fs.mkdirSync(path.dirname(cache), { recursive: true });
    await sharp(origem).resize(OG.largura, OG.altura, { fit: 'cover' }).flatten({ background: '#ffffff' })
      .jpeg({ quality: OG.qualidade, mozjpeg: true }).toFile(cache);
    convertida = true;
  }
  fs.mkdirSync(path.join(DIST, 'images', 'og'), { recursive: true });
  fs.copyFileSync(cache, path.join(DIST, 'images', 'og', `${slug}.jpg`));
  return convertida;
}

// Favicons (FAVICON) a partir do logo, em dist/images/.
async function gerarFavicons() {
  const origem = path.join(SRC, 'images', FAVICON.origem);
  if (!fs.existsSync(origem)) throw new Error(`build.js: \`FAVICON.origem\`: imagem não existe: images/${FAVICON.origem}`);
  await Promise.all(Object.entries(FAVICON.tamanhos).map(([nome, lado]) =>
    sharp(origem).resize(lado, lado, { fit: 'cover' }).png().toFile(path.join(DIST, 'images', nome))));
}

// Slug para URLs: minúsculas, sem acentos, só letras, números e hífenes (ex.: "Hot Clube" → "hot-clube").
function slugificar(texto) {
  return String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Envolve cada <img> de uma imagem local convertível num <picture> com <source> AVIF e WebP;
// o <img> original fica como fallback para browsers sem suporte para esses formatos.
function usarPicture(html) {
  return html.replace(/<img\b[^>]*>/g, (img) => {
    const src = img.match(/\ssrc="(images\/[^"]+)"/);
    if (!src || !IMG_CONVERTIVEIS.test(src[1])) return img;
    const sources = FORMATOS.map(({ ext, type }) =>
      `<source srcset="${src[1].replace(IMG_CONVERTIVEIS, '.' + ext)}" type="${type}">`);
    return `<picture>${sources.join('')}${img}</picture>`;
  });
}

async function main() {
  const config = lerYaml(path.join(CONTEUDO, 'home.yaml'));
  const site = lerYaml(path.join(CONTEUDO, 'site.yaml'));
  const escapar = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

  // As páginas (.html na raiz de src/) são geradas abaixo, uma vez por língua; o resto é copiado.
  const paginas = fs.readdirSync(SRC).filter((f) => f.endsWith('.html'))
    .sort((a, b) => (a === 'index.html' ? -1 : b === 'index.html' ? 1 : a.localeCompare(b)));
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.cpSync(SRC, DIST, {
    recursive: true,
    filter: (f) => f !== CONTEUDO && f !== PARTIALS && f !== MODELOS && !(path.dirname(f) === SRC && f.endsWith('.html')),
  });

  // Hero (`section_hero`): <img> a partir de `hero`, botões a partir de `cta1`/`cta2` e
  // animação de crossfade a partir de `duracao_hero`.
  const { hero, duracao_hero: duracao } = config.section_hero ?? {};
  if (!Array.isArray(hero) || hero.length === 0) throw new Error('home.yaml: `section_hero.hero` tem de ser uma lista de imagens');
  if (typeof duracao !== 'number' || duracao <= HERO_FADE) throw new Error(`home.yaml: \`section_hero.duracao_hero\` tem de ser um número maior que ${HERO_FADE}`);
  hero.forEach((item, k) => ['horizontal', 'vertical'].forEach((formato) => {
    const img = item?.[formato];
    if (typeof img !== 'string' || !img) throw new Error(`home.yaml: \`section_hero.hero\` (imagem ${k + 1}) tem de ter \`${formato}\``);
    if (!fs.existsSync(path.join(SRC, 'images', img))) throw new Error(`home.yaml: imagem do hero não existe: images/${img}`);
    if (!IMG_CONVERTIVEIS.test(img)) throw new Error(`home.yaml: imagem do hero tem de ser PNG ou JPG: ${img}`);
  }));
  // Cada imagem é um .hero-slide com as duas versões; o CSS mostra só uma, conforme a orientação
  // do ecrã. `loading="lazy"` para o browser não descarregar a versão escondida (display: none).
  const heroImagens = hero.map(({ horizontal, vertical }) => [
    '      <div class="hero-slide">',
    `        <img class="hero-h" src="images/${horizontal}" alt="" width="1920" height="900" loading="lazy">`,
    `        <img class="hero-v" src="images/${vertical}" alt="" width="1080" height="1920" loading="lazy">`,
    '      </div>',
  ].join('\n')).join('\n');

  // Botões do hero a partir de `cta1` (dourado) e `cta2` (preto), com o texto na língua da
  // página (`pt`, `en`). Um CTA sem `link` não é colocado; sem nenhum, não fica o contentor .hero-cta.
  const heroCta = (lingua) => {
    const ctas = [['cta1', 'btn--gold'], ['cta2', 'btn--black']]
      .filter(([chave]) => String(config.section_hero[chave]?.link ?? '').trim() !== '')
      .map(([chave, classe]) => {
        const { [lingua]: texto, link } = config.section_hero[chave];
        if (!texto) throw new Error(`home.yaml: \`section_hero.${chave}.${lingua}\` tem de ter o texto do botão`);
        return `        <a class="btn ${classe}" href="${escapar(link)}">${escapar(texto)}</a>`;
      });
    return ctas.length ? `      <div class="hero-cta">\n${ctas.join('\n')}\n      </div>\n` : '';
  };

  // Hero do EPK (epk.yaml): `<!-- @epk-hero -->` em epk.html dá lugar à imagem `hero_horizontal`
  // (.hero-h) e à `hero_vertical` (.hero-v, o CSS mostra-a só em ecrãs na vertical).
  const epk = lerYaml(path.join(CONTEUDO, 'epk.yaml'));
  const epkHero = (await Promise.all([['hero_horizontal', 'hero-h'], ['hero_vertical', 'hero-v']].map(async ([chave, classe]) => {
    const img = String(epk[chave] ?? '').trim();
    if (!img) throw new Error(`epk.yaml: falta \`${chave}\``);
    if (!fs.existsSync(path.join(SRC, 'images', img))) throw new Error(`epk.yaml: \`${chave}\`: imagem não existe: images/${img}`);
    if (!IMG_CONVERTIVEIS.test(img)) throw new Error(`epk.yaml: \`${chave}\` tem de ser PNG ou JPG: ${img}`);
    const { width, height } = await sharp(path.join(SRC, 'images', img)).metadata();
    return `<img class="${classe}" src="images/${img}" alt="" width="${width}" height="${height}" loading="lazy">`;
  })));
  // Imagem de partilha do EPK (`image_share`, images/og/_epk.jpg); vazia, fica a do site.yaml.
  const epkPartilha = String(epk.image_share ?? '').trim();
  if (epkPartilha && !fs.existsSync(path.join(SRC, 'images', epkPartilha))) throw new Error(`epk.yaml: \`image_share\`: imagem não existe: images/${epkPartilha}`);
  if (epkPartilha && !IMG_CONVERTIVEIS.test(epkPartilha)) throw new Error(`epk.yaml: \`image_share\` tem de ser PNG ou JPG: ${epkPartilha}`);

  // Agenda (`section_agenda.gigs`): cada concerto com `isEnabled: true` tem uma página própria em cada
  // língua (`evento-<slug>.html`, slug a partir do `id`, gerada a partir de modelos/evento.html)
  // e, se a data for de hoje em diante (data do build), um <li> na .tour-list do index, por ordem
  // cronológica; o main.js tira, pelo `data-date`, os que entretanto passaram (à data do
  // visitante). Os campos de texto podem ter versão inglesa com sufixo `_en` (ex.: `name_en`,
  // `location_en`); sem ela, fica o texto em português.
  const agenda = config.section_agenda?.gigs ?? [];
  if (!Array.isArray(agenda)) throw new Error('home.yaml: `section_agenda.gigs` tem de ser uma lista de concertos');
  const hoje = new Date();
  const hojeIso = [hoje.getFullYear(), hoje.getMonth() + 1, hoje.getDate()].map((n) => String(n).padStart(2, '0')).join('-');
  // Imagens por omissão (`section_agenda.default_images`): `hero` para os concertos sem
  // `imagem_h` e `hero_v` para os sem `imagem_v_4x5` (também na imagem de partilha).
  const imagensDefault = { imagem_h: 'hero', imagem_v_4x5: 'hero_v' };
  Object.values(imagensDefault).forEach((chave) => {
    const img = String(config.section_agenda?.default_images?.[chave] ?? '').trim();
    if (!img) return;
    if (!fs.existsSync(path.join(SRC, 'images', img))) throw new Error(`home.yaml: \`section_agenda.default_images.${chave}\`: imagem não existe: images/${img}`);
    if (!IMG_CONVERTIVEIS.test(img)) throw new Error(`home.yaml: \`section_agenda.default_images.${chave}\` tem de ser PNG ou JPG: ${img}`);
  });
  const slugs = new Set();
  const eventos = agenda.filter((c) => c?.isEnabled === true || c?.isEnabled === 'true').map((c, k) => {
    const onde = `\`section_agenda.gigs\` (${c.id ?? `concerto ${k + 1}`})`;
    const slug = slugificar(c.id ?? '');
    if (!slug) throw new Error(`home.yaml: ${onde} tem de ter \`id\``);
    if (slugs.has(slug)) throw new Error(`home.yaml: ${onde}: há outro concerto com o mesmo slug (${slug})`);
    slugs.add(slug);
    const data = String(c.data ?? '').match(/^(\d{4})(\d{2})(\d{2})$/);
    const dia = data && new Date(Date.UTC(data[1], data[2] - 1, data[3]));
    if (!data || dia.getUTCDate() !== Number(data[3])) throw new Error(`home.yaml: ${onde} tem de ter \`data\` no formato 'AAAAMMDD'`);
    ['name', 'location'].forEach((campo) => {
      if (!String(c[campo] ?? '').trim()) throw new Error(`home.yaml: ${onde} tem de ter \`${campo}\``);
    });
    const imagens = {};
    Object.entries(imagensDefault).forEach(([campo, chave]) => {
      const img = String(c[campo] ?? '').trim();
      imagens[campo] = img || String(config.section_agenda?.default_images?.[chave] ?? '').trim();
      if (!img) return;
      if (!fs.existsSync(path.join(SRC, 'images', img))) throw new Error(`home.yaml: ${onde}: imagem não existe: images/${img}`);
      if (!IMG_CONVERTIVEIS.test(img)) throw new Error(`home.yaml: ${onde}: \`${campo}\` tem de ser PNG ou JPG: ${img}`);
    });
    return { ...c, ...imagens, slug, pagina: `evento-${slug}.html`, dia, iso: `${data[1]}-${data[2]}-${data[3]}` };
  }).sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0));
  // Medidas das imagens dos concertos, para o width/height dos <img>.
  const medidas = {};
  await Promise.all(eventos.flatMap((c) => [c.imagem_h, c.imagem_v_4x5])
    .map((img) => String(img ?? '').trim()).filter(Boolean)
    .map(async (img) => { medidas[img] = await sharp(path.join(SRC, 'images', img)).metadata(); }));
  // Valor de um campo de um concerto na língua da página (vazio se não estiver preenchido).
  const campo = (c, nome, lingua) => String(c[`${nome}_${lingua}`] || c[nome] || '').trim();

  const concertos = eventos.filter((c) => c.iso >= hojeIso);
  const agendaHtml = (lingua) => (_, indent) => concertos.map((c) => {
    const { dias, meses } = DATAS[lingua];
    const bilhetes = campo(c, 'ticketsLink', lingua);
    return [
      `<li data-date="${c.iso}">`,
      `  <span class="date">${dias[c.dia.getUTCDay()]}, ${c.dia.getUTCDate()} ${meses[c.dia.getUTCMonth()]}</span>`,
      `  <a class="venue" href="${c.pagina}">${escapar(campo(c, 'name', lingua))}</a>`,
      `  <span class="city">${escapar(campo(c, 'location', lingua))}</span>`,
      bilhetes
        ? `  <a class="btn btn--ticket fx-tada" href="${escapar(bilhetes)}" target="_blank" rel="noopener">${ROTULOS[lingua].bilhetes}</a>`
        : `  <a class="btn btn--ticket fx-tada" href="${c.pagina}">${ROTULOS[lingua].info}</a>`,
      '</li>',
    ].map((l) => indent + l).join('\n');
  }).join('\n') + (concertos.length ? '\n' : '');

  // Página de um concerto: data por extenso e resumo (data, hora, local e o início do `info`) para
  // o <title>/meta description e a partilha (og:description).
  const modeloEvento = fs.readFileSync(path.join(MODELOS, 'evento.html'), 'utf8');
  const dataLonga = (c, lingua) => c.dia.toLocaleDateString(DATAS[lingua].locale,
    { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const resumo = (c, lingua) => {
    const quando = [dataLonga(c, lingua), campo(c, 'time', lingua)].filter(Boolean).join(', ');
    const texto = [`${quando} — ${campo(c, 'location', lingua)}.`, campo(c, 'info', lingua)].filter(Boolean).join(' ');
    return texto.length <= RESUMO_MAX ? texto : texto.slice(0, RESUMO_MAX - 1).replace(/\s+\S*$/, '') + '…';
  };
  // Conteúdo do <main> da página de um concerto (marcador `<!-- @evento -->`): hero, título, data,
  // hora, local, info, bilhetes e contactos do local. Um campo vazio não é colocado. O hero tem a
  // `imagem_h` e a `imagem_v_4x5` (o CSS mostra a vertical só em ecrãs na vertical) ou só a
  // que existir.
  const eventoHtml = (c, lingua) => (_, indent) => {
    const r = ROTULOS[lingua];
    const v = (nome) => campo(c, nome, lingua);
    const externo = (href, conteudo) => `<a href="${escapar(href)}" target="_blank" rel="noopener">${conteudo}</a>`;
    const img = (ficheiro, classe) => {
      const { width, height } = medidas[ficheiro];
      return `<img${classe ? ` class="${classe}"` : ''} src="images/${ficheiro}" alt="" width="${width}" height="${height}"${classe ? ' loading="lazy"' : ''}>`;
    };
    const [horizontal, vertical] = [c.imagem_h, c.imagem_v_4x5].map((f) => String(f ?? '').trim());
    const hero = horizontal && vertical
      ? ['<div class="evento-hero">', `  ${img(horizontal, 'hero-h')}`, `  ${img(vertical, 'hero-v')}`, '</div>']
      : horizontal || vertical ? ['<div class="evento-hero">', `  ${img(horizontal || vertical)}`, '</div>'] : [];
    const meta = [
      ['fa-regular fa-calendar', dataLonga(c, lingua)],
      ['fa-regular fa-clock', v('time')],
      ['fa-solid fa-location-dot', v('location')],
    ].filter(([, t]) => t).map(([icone, t]) => `<span><i class="${icone}"></i>${escapar(t)}</span>`).join('');
    const [morada, mapa, web, telefone, email] = ['address', 'mapsUrl', 'websiteUrl', 'phone', 'email'].map(v);
    const dados = [
      (morada || mapa) && ['fa-solid fa-map-location-dot', mapa ? externo(mapa, morada ? escapar(morada) : r.mapa) : escapar(morada)],
      web && ['fa-solid fa-globe', externo(web, escapar(web.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')))],
      telefone && ['fa-solid fa-phone', `<a href="tel:${escapar(telefone.replace(/[^\d+]/g, ''))}">${escapar(telefone)}</a>`],
      email && ['fa-solid fa-envelope', `<a href="mailto:${escapar(email)}">${escapar(email)}</a>`],
    ].filter(Boolean).map(([icone, conteudo]) => `    <li><i class="${icone}"></i>${conteudo}</li>`);
    return [
      ...hero,
      '<article class="post evento">',
      `  <h1>${escapar(v('name'))}</h1>`,
      `  <div class="meta">${meta}</div>`,
      ...(v('info') ? [`  <p class="lead">${escapar(v('info'))}</p>`] : []),
      ...(v('ticketsLink') ? [`  <a class="btn btn--pill fx-tada" href="${escapar(v('ticketsLink'))}" target="_blank" rel="noopener">${r.comprar}</a>`] : []),
      ...(dados.length ? [`  <h2>${r.local}</h2>`, '  <ul class="evento-dados">', ...dados, '  </ul>'] : []),
      `  <p class="evento-voltar"><a class="read-more" href="index.html#tour">← ${r.voltar}</a></p>`,
      '</article>',
    ].map((l) => indent + l).join('\n');
  };

  // Cada imagem fica `duracao` s visível; o ciclo é n × duracao. A imagem k começa a aparecer
  // em k × duracao − fade, para a primeira já estar visível ao carregar a página.
  // A animação é aplicada ao .hero-slide (os primeiros filhos da .hero, daí o `nth-child`).
  const ciclo = hero.length * duracao;
  const pct = (s) => `${+(s / ciclo * 100).toFixed(2)}%`;
  const s = (v) => `${+v.toFixed(2)}s`;
  const cssHero = hero.length === 1
    ? '.hero-slide { opacity: 1; }'
    : [
      `.hero-slide { animation: hero-fade ${s(ciclo)} infinite; }`,
      ...hero.map((_, k) => `.hero-slide:nth-child(${k + 1}) { animation-delay: -${s((ciclo - k * duracao + HERO_FADE) % ciclo)}; }`),
      '@keyframes hero-fade {',
      `  0% { opacity: 0; }`,
      `  ${pct(HERO_FADE)} { opacity: 1; }`,
      `  ${pct(duracao)} { opacity: 1; }`,
      `  ${pct(duracao + HERO_FADE)} { opacity: 0; }`,
      `  100% { opacity: 0; }`,
      '}',
    ].join('\n');
  const css = path.join(DIST, 'css', 'style.css');
  fs.writeFileSync(css, substituirMarcador(fs.readFileSync(css, 'utf8'), /\/\* @hero-animacao \*\//, cssHero, 'css/style.css'));

  // Ícones das redes (`links` do site.yaml): cada `<!-- @social -->` (partials) dá lugar à
  // lista de ícones, pela ordem do YAML, abertos noutra janela. Uma rede com link vazio não é
  // colocada; sem nenhuma, a lista também não.
  const icones = (chave) => Object.entries(site[chave] ?? {})
    .filter(([, link]) => String(link ?? '').trim() !== '')
    .map(([rede, link]) => {
      if (!REDES[rede]) throw new Error(`site.yaml: rede desconhecida em \`${chave}\`: ${rede} (conhecidas: ${Object.keys(REDES).join(', ')})`);
      const [nome, icone] = REDES[rede];
      return `<li><a class="fx-tada" href="${escapar(link)}" target="_blank" rel="noopener" aria-label="${nome}"><i class="fa-brands ${icone}"></i></a></li>`;
    });
  const listaIcones = (itens, classe) => (_, indent) =>
    itens.length ? [`${indent}<ul class="${classe}">`, ...itens.map((li) => `${indent}  ${li}`), `${indent}</ul>`].join('\n') + '\n' : '';
  const social = icones('links');
  // Contactos do site.yaml: cada `<!-- @email -->` dá lugar ao link mailto de `contactos.email`
  // e cada `<!-- @telefone -->` ao link tel de `contactos.telefone` (sem espaços no href).
  const email = String(site.contactos?.email ?? '').trim();
  if (!email) throw new Error('site.yaml: `contactos.email` tem de ter o email de contacto');
  const linkEmail = `<a href="mailto:${escapar(email)}">${escapar(email)}</a>`;
  const telefone = String(site.contactos?.telefone ?? '').trim();
  if (!telefone) throw new Error('site.yaml: `contactos.telefone` tem de ter o telefone de contacto');
  const linkTelefone = `<a href="tel:${escapar(telefone.replace(/\s/g, ''))}">${escapar(telefone)}</a>`;
  // `<!-- @whatsapp -->` (numa linha só): botão (images/whatsapp.png) que abre uma conversa no
  // WhatsApp com o número de `contactos.whatsapp` (wa.me só aceita dígitos). Vazio: tira a linha.
  const whatsapp = String(site.contactos?.whatsapp ?? '').trim().replace(/\D/g, '');
  const botaoWhatsapp = (lingua) => (_, indent) => whatsapp
    ? `${indent}<a class="contact-whatsapp fx-tada" href="https://wa.me/${whatsapp}" target="_blank" rel="noopener"><img src="images/whatsapp.png" alt="${ROTULOS[lingua].whatsapp}" width="300" height="300" loading="lazy"></a>\n`
    : '';
  // Google Analytics (`google_analytics_id` do site.yaml): `<!-- @analytics -->` (no <head>) dá
  // lugar a <meta name="ga-id">; o main.js só carrega o GA depois de o visitante aceitar os
  // cookies. Vazio: tira a linha (sem GA nem aviso de cookies).
  const gaId = String(site.google_analytics_id ?? '').trim();
  if (gaId && !/^G-[A-Z0-9]+$/.test(gaId)) throw new Error(`site.yaml: \`google_analytics_id\` tem de ser um ID do GA4 (G-XXXXXXXXXX): ${gaId}`);
  const metaAnalytics = (_, indent) => (gaId ? `${indent}<meta name="ga-id" content="${gaId}">\n` : '');

  // Cache busting: os links para css/style.css e js/main.js levam `?v=<hash do conteúdo>`, para
  // os browsers não usarem uma versão antiga em cache depois de um deploy.
  const versoes = ['css/style.css', 'js/main.js'].map((recurso) => {
    const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(DIST, recurso))).digest('hex').slice(0, 10);
    return [recurso, `${recurso}?v=${hash}`];
  });
  const versionar = (html) => versoes.reduce((h, [recurso, comVersao]) =>
    h.replace(new RegExp(`(\\s(?:href|src)=")${recurso.replace(/\./g, '\\.')}"`, 'g'), `$1${comVersao}"`), html);

  // URL público de uma página numa língua (index.html → raiz da pasta da língua).
  const url = (lingua, pagina) => SITE_URL + LINGUAS[lingua].pasta + (pagina === 'index.html' ? '' : pagina);

  // Imagem de partilha das páginas que não são de concertos (`default_share_image` do site.yaml).
  const imagemPartilha = String(site.default_share_image ?? '').trim();
  if (imagemPartilha && !fs.existsSync(path.join(SRC, 'images', imagemPartilha))) throw new Error(`site.yaml: \`default_share_image\`: imagem não existe: images/${imagemPartilha}`);
  if (imagemPartilha && !IMG_CONVERTIVEIS.test(imagemPartilha)) throw new Error(`site.yaml: \`default_share_image\` tem de ser PNG ou JPG: ${imagemPartilha}`);

  // `<!-- @og -->` (no <head>): og:url e og:locale e, nas páginas dos concertos com
  // `imagem_v_4x5`, a imagem de partilha (og:title e og:description vêm do header).
  // As restantes páginas usam a `default_share_image` do site.yaml (images/og/_default.jpg; o `_`
  // não aparece nos slugs, por isso não colide com nenhum concerto), exceto o EPK com
  // `image_share` no epk.yaml (images/og/_epk.jpg).
  const ogTags = (lingua, pagina, evento) => {
    const imagem = evento ? String(evento.imagem_v_4x5 ?? '').trim() && evento.slug
      : pagina === 'epk.html' && epkPartilha ? '_epk' : imagemPartilha && '_default';
    return [
      `<meta property="og:url" content="${url(lingua, pagina)}">`,
      `<meta property="og:locale" content="${LINGUAS[lingua].og}">`,
      ...(imagem ? [
        `<meta property="og:image" content="${SITE_URL}images/og/${imagem}.jpg">`,
        '<meta property="og:image:type" content="image/jpeg">',
        `<meta property="og:image:width" content="${OG.largura}">`,
        `<meta property="og:image:height" content="${OG.altura}">`,
        `<meta property="og:image:alt" content="${escapar(evento ? campo(evento, 'name', lingua) : "Gringo's Washboard Band")}">`,
        '<meta name="twitter:card" content="summary_large_image">',
      ] : []),
    ];
  };

  // Uma página numa língua: partials, blocos {{#lang}}, marcadores, <picture> e, nas línguas em
  // subpasta, caminhos dos recursos a subir até à raiz de dist/. `evento` só nas páginas dos concertos.
  const gerarPagina = (fonte, pagina, lingua, evento) => {
    const { pasta } = LINGUAS[lingua];
    const nivel = pasta.split('/').filter(Boolean).length;
    let html = incluirPartials(fonte, pagina);
    html = escolherLingua(html, lingua, pagina);
    if (pagina === 'index.html') {
      html = substituirMarcador(html, /^[ \t]*<!-- @hero-imagens.*-->/m, heroImagens, pagina);
      html = substituirMarcador(html, /^[ \t]*<!-- @hero-cta.*-->\r?\n?/m, heroCta(lingua), pagina);
      html = substituirMarcador(html, /^([ \t]*)<!-- @agenda -->\r?\n?/m, agendaHtml(lingua), pagina);
    }
    if (pagina === 'epk.html') {
      html = substituirMarcador(html, /^([ \t]*)<!-- @epk-hero -->/m, (_, indent) => epkHero.map((l) => indent + l).join('\n'), pagina);
    }
    if (evento) html = substituirMarcador(html, /^([ \t]*)<!-- @evento -->/m, eventoHtml(evento, lingua), pagina);
    // `<!-- @idioma -->`: link para a mesma página nas outras línguas; `<!-- @hreflang -->`:
    // um <link rel="alternate"> por língua (mais x-default, a principal).
    const idioma = Object.entries(LINGUAS).filter(([l]) => l !== lingua).map(([, outra]) =>
      `<a href="${'../'.repeat(nivel)}${outra.pasta}${pagina}" lang="${outra.codigo}" hreflang="${outra.codigo}">${outra.nome} <img class="flag" src="images/${outra.bandeira}" alt="" width="24" height="12"></a>`).join(' ');
    const hreflang = (indent) => [
      ...Object.entries(LINGUAS).map(([l, { codigo }]) => `<link rel="alternate" hreflang="${codigo}" href="${url(l, pagina)}">`),
      `<link rel="alternate" hreflang="x-default" href="${url(Object.keys(LINGUAS)[0], pagina)}">`,
    ].map((l) => indent + l).join('\n');
    html = html
      .replace(/^([ \t]*)<!-- @social -->\r?\n?/gm, listaIcones(social, 'social'))
      .replace(/^([ \t]*)<!-- @hreflang -->/gm, (_, indent) => hreflang(indent))
      .replace(/^([ \t]*)<!-- @analytics -->\r?\n?/gm, metaAnalytics)
      .replace(/^([ \t]*)<!-- @og -->/gm, (_, indent) => ogTags(lingua, pagina, evento).map((l) => indent + l).join('\n'))
      .replace(/<!-- @idioma -->/g, idioma)
      .replace(/<!-- @email -->/g, linkEmail)
      .replace(/<!-- @telefone -->/g, linkTelefone)
      .replace(/^([ \t]*)<!-- @whatsapp -->\r?\n?/gm, botaoWhatsapp(lingua));
    html = usarPicture(versionar(html));
    if (nivel) html = subirCaminhos(html, nivel);
    fs.writeFileSync(path.join(DIST, pasta, pagina), html);
  };

  // As páginas de src/ e a de cada concerto (o modelo com o <title> e a descrição do concerto),
  // em cada língua.
  Object.entries(LINGUAS).forEach(([lingua, { pasta }]) => {
    fs.mkdirSync(path.join(DIST, pasta), { recursive: true });
    paginas.forEach((pagina) => gerarPagina(fs.readFileSync(path.join(SRC, pagina), 'utf8'), pagina, lingua));
    eventos.forEach((c) => gerarPagina(modeloEvento
      .replace(/\[\[titulo\]\]/g, () => escapar(campo(c, 'name', lingua)))
      .replace(/\[\[descricao\]\]/g, () => escapar(resumo(c, lingua))), c.pagina, lingua, c));
  });

  // Imagens: AVIF + WebP (os <picture> já foram postos nas páginas) e as de partilha dos concertos.
  const imagens = await converterImagens();
  const ogNovas = (await Promise.all([
    ...eventos.filter((c) => String(c.imagem_v_4x5 ?? '').trim()).map((c) => imagemOg(String(c.imagem_v_4x5).trim(), c.slug)),
    ...(imagemPartilha ? [imagemOg(imagemPartilha, '_default')] : []),
    ...(epkPartilha ? [imagemOg(epkPartilha, '_epk')] : []),
  ])).filter(Boolean).length;
  await gerarFavicons();

  // Sitemap: uma entrada por cada página em cada língua (index.html → raiz da língua); as dos
  // concertos têm a data do home.yaml.
  const fontes = [
    ...paginas.map((pagina) => [pagina, path.join(SRC, pagina)]),
    ...eventos.map((c) => [c.pagina, path.join(CONTEUDO, 'home.yaml')]),
  ];
  const urls = Object.keys(LINGUAS).flatMap((lingua) => fontes.map(([pagina, fonte]) => {
    const lastmod = fs.statSync(fonte).mtime.toISOString().slice(0, 10);
    return `  <url>\n    <loc>${url(lingua, pagina)}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`;
  }));

  fs.writeFileSync(path.join(DIST, 'sitemap.xml'),
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.join('\n') + '\n</urlset>\n');

  fs.writeFileSync(path.join(DIST, 'robots.txt'),
    `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}sitemap.xml\n`);

  console.log(`Build concluído: src/ → dist/ (${paginas.length} páginas e ${eventos.length} de concertos em ${Object.keys(LINGUAS).join(', ')}; ${imagens.total} imagens em AVIF/WebP, ${imagens.convertidas} conversões novas, ${ogNovas} de partilha novas; sitemap com ${urls.length} URLs, robots.txt)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
