// Build: copia src/ para dist/ (limpa dist/ antes) e gera cada página numa versão por língua
// (pt em dist/, en em dist/en/), escolhendo os blocos {{#lang xx}}…{{/lang}}. Inclui os partials
// (header, footer), aplica as configurações de src/conteudo/home.yaml (hero) e site.yaml (redes
// sociais, contactos, Google Analytics), converte as imagens para AVIF e WebP (com <picture> e fallback para o
// original) e gera sitemap.xml e robots.txt.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const YAML = require('yaml');

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
  pt: { bilhetes: 'Bilhetes', info: 'Informações', comprar: 'Comprar bilhetes', local: 'Local', mapa: 'Ver no mapa', voltar: 'Voltar à agenda', whatsapp: 'Conversar no WhatsApp', video: 'Ver vídeo no YouTube', imagemVideo: 'Imagem do vídeo' },
  en: { bilhetes: 'Tickets', info: 'Info', comprar: 'Buy tickets', local: 'Venue', mapa: 'View on map', voltar: 'Back to tour dates', whatsapp: 'Chat on WhatsApp', video: 'Watch on YouTube', imagemVideo: 'Video still' },
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
// Paletas de cores alternativas (conteudo/paletas.yaml): contraste mínimo (WCAG) para texto
// normal e para texto grande/ícones, e o do fundo escuro (header, menu, footer) com o branco.
const PALETA = { texto: 4.5, grande: 3, escuro: 14 };
// Formatos gerados, pela ordem de preferência nos <source> do <picture>.
const FORMATOS = [
  { ext: 'avif', type: 'image/avif', opcoes: { quality: 50, effort: 4 } },
  { ext: 'webp', type: 'image/webp', opcoes: { quality: 75 } },
];

// Lê um YAML de src/conteudo/ (pacote `yaml`, YAML completo: os ficheiros também são escritos
// pelo Pages CMS, ver .pages.yml). Nos textos tiram-se os espaços no fim das linhas e um caminho
// de imagem escrito com `images/` (como o Pages CMS os grava) fica só com o nome do ficheiro,
// como no resto do build.
function lerYaml(ficheiro) {
  let dados;
  try {
    dados = YAML.parse(fs.readFileSync(ficheiro, 'utf8'));
  } catch (e) {
    throw new Error(`${path.basename(ficheiro)}: ${e.message}`);
  }
  const limpar = (v) => {
    if (typeof v === 'string') return v.replace(/[ \t]+$/gm, '').replace(/^\/?images\/(?=\S+$)/, '');
    if (Array.isArray(v)) return v.map(limpar);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, limpar(x)]));
    return v;
  };
  return limpar(dados ?? {});
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

// Uma conversão em cache fica com a data de modificação do original; está válida enquanto as
// datas forem iguais. Comparar só "mais recente" falha quando o original é substituído por um
// ficheiro com data antiga (ex.: copiado de outro sítio, que mantém a data).
function cacheValida(cache, origem) {
  return fs.existsSync(cache)
    && Math.abs(fs.statSync(cache).mtimeMs - fs.statSync(origem).mtimeMs) < 1; // utimes arredonda ao ms
}

function marcarCache(cache, origem) {
  const { atime, mtime } = fs.statSync(origem);
  fs.utimesSync(cache, atime, mtime);
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
    if (!cacheValida(cache, origem)) {
      fs.mkdirSync(path.dirname(cache), { recursive: true });
      await sharp(origem)[ext](opcoes).toFile(cache);
      marcarCache(cache, origem);
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
  if (!cacheValida(cache, origem)) {
    fs.mkdirSync(path.dirname(cache), { recursive: true });
    await sharp(origem).resize(OG.largura, OG.altura, { fit: 'cover' }).flatten({ background: '#ffffff' })
      .jpeg({ quality: OG.qualidade, mozjpeg: true }).toFile(cache);
    marcarCache(cache, origem);
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

const escapar = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

// Markdown mínimo (sem dependências) para textos do YAML. Blocos separados por linhas em branco:
// `## Título` (h2; `###` h3, …, com .section-title), parágrafos, `> citação` (.pullquote),
// listas (`- item`), uma imagem sozinha (`![alt](band.jpg)`, ficheiro em images/) e HTML
// (bloco começado por `<`, fica igual). `{.classe …}` no fim de um bloco junta-lhe classes.
// `::: split` … `:::` põe os blocos lado a lado (.about-split): o texto numa coluna e a imagem
// na outra, pela ordem em que estão (imagem primeiro → .about-split--left).
// No texto: **negrito**, *itálico* (ou _itálico_), [link](url) (externo abre noutra janela) e
// HTML. Cada bloco do primeiro nível (e cada coluna) leva .reveal. Devolve as linhas do HTML.
function markdown(texto, onde) {
  const erro = (msg) => new Error(`${onde}: ${msg}`);
  const IMAGEM = /!\[([^\]]*)\]\(([^)\s]+)\)/;
  const caminhoImagem = (src) => {
    if (/^[a-z]+:|\//i.test(src)) return src;
    if (!fs.existsSync(path.join(SRC, 'images', src))) throw erro(`imagem não existe: images/${src}`);
    return `images/${src}`;
  };
  const imagem = (alt, src, classe = '') =>
    `<img${classe ? ` class="${classe}"` : ''} src="${escapar(caminhoImagem(src))}" alt="${escapar(alt)}" loading="lazy">`;
  // Imagens e links ficam de parte (\0n\0) enquanto se trata o negrito/itálico, para não mexer nos URLs.
  const emLinha = (t) => {
    const guardados = [];
    const guardar = (html) => `\0${guardados.push(html) - 1}\0`;
    const enfase = (s) => s
      .replace(/\*\*(?!\s)(.+?)(?<!\s)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(?!\s)(.+?)(?<!\s)\*/g, '<em>$1</em>')
      .replace(/(^|[^\w])_(?!\s)(.+?)(?<!\s)_(?!\w)/g, '$1<em>$2</em>');
    return enfase(t
      .replace(new RegExp(IMAGEM.source, 'g'), (_, alt, src) => guardar(imagem(alt, src)))
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, txt, href) => guardar(`<a href="${escapar(href)}"${
        /^https?:/.test(href) ? ' target="_blank" rel="noopener"' : ''}>${enfase(txt)}</a>`)))
      .replace(/\0(\d+)\0/g, (_, n) => guardados[n]);
  };

  // Blocos (listas de linhas); um título é sempre um bloco sozinho.
  const blocos = [];
  let atual = null;
  let caixa = null;
  texto.split(/\r?\n/).forEach((linha) => {
    const l = linha.trim();
    const abre = l.match(/^:::\s*(\S+)$/);
    if (abre || l === ':::') {
      atual = null;
      if (abre && caixa) throw erro('`:::` não se aninham');
      if (abre && abre[1] !== 'split') throw erro(`caixa desconhecida: ::: ${abre[1]} (conhecidas: split)`);
      if (!abre && !caixa) throw erro('`:::` a fechar sem nenhuma aberta');
      if (abre) caixa = { blocos: [] };
      else blocos.push(caixa), caixa = null;
      return;
    }
    if (!l) return (atual = null);
    const destino = caixa ? caixa.blocos : blocos;
    if (/^#+\s/.test(l)) return destino.push([l]), (atual = null);
    if (!atual) destino.push((atual = []));
    atual.push(l);
  });
  if (caixa) throw erro('falta `:::` a fechar o `::: split`');

  // Um bloco → [tipo, html]; `reveal` acrescenta essa classe.
  const bloco = (linhas, reveal) => {
    const atributos = linhas.at(-1).match(/\s*\{((?:\s*\.[\w-]+)+)\s*\}$/);
    if (atributos) linhas = [...linhas.slice(0, -1), linhas.at(-1).slice(0, atributos.index)].filter(Boolean);
    const classes = (base) => {
      const todas = [...base, ...(atributos ? atributos[1].trim().split(/\s+/).map((c) => c.slice(1)) : []), ...(reveal ? ['reveal'] : [])];
      return todas.length ? ` class="${todas.join(' ')}"` : '';
    };
    const juntar = (ls) => emLinha(ls.join(' '));
    const titulo = linhas[0].match(/^(#+)\s+(.*)$/);
    if (titulo) {
      if (titulo[1].length < 2 || titulo[1].length > 6) throw erro(`título com ${titulo[1].length} # (usar ## a ######; o h1 é o do hero): ${linhas[0]}`);
      return ['texto', `<h${titulo[1].length}${classes(['section-title'])}>${emLinha(titulo[2])}</h${titulo[1].length}>`];
    }
    const img = linhas.length === 1 && linhas[0].match(new RegExp(`^${IMAGEM.source}$`));
    if (img) return ['imagem', imagem(img[1], img[2], classes([]).replace(/^ class="|"$/g, ''))];
    if (linhas[0].startsWith('<')) return ['texto', linhas.join('\n')];
    if (linhas.every((l) => /^>/.test(l))) return ['texto', `<p${classes(['pullquote'])}>${juntar(linhas.map((l) => l.replace(/^>\s?/, '')))}</p>`];
    if (linhas.every((l) => /^[-*]\s/.test(l))) {
      return ['texto', [`<ul${classes([])}>`, ...linhas.map((l) => `  <li>${emLinha(l.slice(2).trim())}</li>`), '</ul>'].join('\n')];
    }
    return ['texto', `<p${classes([])}>${juntar(linhas)}</p>`];
  };
  const indentar = (html) => html.split('\n').map((l) => '  ' + l);

  return blocos.flatMap((b) => {
    if (Array.isArray(b)) return bloco(b, true)[1].split('\n');
    // ::: split — o texto seguido fica numa coluna (div.reveal); cada imagem é outra coluna.
    const colunas = [];
    b.blocos.forEach((linhas) => {
      const [tipo, html] = bloco(linhas, false);
      if (tipo === 'imagem') colunas.push(['imagem', html.replace(/^<img(?: class="([^"]*)")?/, (_, c) => `<img class="${c ? c + ' ' : ''}reveal"`)]);
      else if (colunas.at(-1)?.[0] === 'texto') colunas.at(-1)[1].push(html);
      else colunas.push(['texto', [html]]);
    });
    if (!colunas.length) throw erro('`::: split` vazio');
    return [
      `<div class="about-split${colunas[0][0] === 'imagem' ? ' about-split--left' : ''}">`,
      ...colunas.flatMap(([tipo, html]) => (tipo === 'imagem' ? indentar(html)
        : ['  <div class="reveal">', ...html.flatMap((h) => indentar(h).map((l) => '  ' + l)), '  </div>'])),
      '</div>',
    ];
  });
}

// Cores das paletas: [r, g, b] de 0 a 255.
const BRANCO = [255, 255, 255];
const PRETO = [0, 0, 0];
const corRgb = (hex) => [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
const corHex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const luminancia = (c) => {
  const [r, g, b] = c.map((v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contraste = (a, b) => {
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (escuro + 0.05);
};
const misturar = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
// Intensidade da cor (0 = cinzento, 1 = pura); ao contrário da saturação HSL, os tons pastel ficam baixos.
const croma = (c) => (Math.max(...c) - Math.min(...c)) / 255;
// Escurece `cor` (para o preto, aos poucos) até ter pelo menos `min` de contraste com cada fundo.
const escurecer = (cor, fundos, min) => {
  for (let k = 0; k <= 20; k++) {
    const c = misturar(cor, PRETO, k / 20);
    if (fundos.every((f) => contraste(c, f) >= min)) return c;
  }
  return PRETO;
};
const permutacoes = (lista) => (lista.length <= 1 ? [lista]
  : lista.flatMap((x, i) => permutacoes([...lista.slice(0, i), ...lista.slice(i + 1)]).map((p) => [x, ...p])));

// CSS de uma paleta de 4 cores: redefine as variáveis do style.css (e algumas regras onde a cor
// do texto tem de mudar), com cada cor no papel em que fica mais legível. As cores das secções
// (--rust, --gold, --grey-light, --aqua) são as 4 da paleta, pela combinação com mais pontos:
// contraste do texto de cada secção, do dourado (destaques, botões) sobre o fundo escuro, secções
// seguidas bem distintas, --rust escura (texto claro), --gold viva e --grey-light clara. O fundo
// escuro é a cor mais escura, escurecida até PALETA.escuro de contraste com o branco.
function cssPaleta(id) {
  const cores = id.match(/.{6}/g).map(corRgb);
  const escuro = escurecer([...cores].sort((a, b) => luminancia(a) - luminancia(b))[0], [BRANCO], PALETA.escuro);
  const texto = (fundo) => (contraste(escuro, fundo) >= contraste(BRANCO, fundo) ? escuro : BRANCO);
  // Acima de 7 (AAA) mais contraste já não conta.
  const pontos = (c, min) => Math.min(c, 7) - (c < min ? 20 : 0);
  const [, rust, gold, grey, aqua] = permutacoes(cores).map(([rust, gold, grey, aqua]) => {
    let p = [rust, gold, grey, aqua].reduce((s, f) => s + pontos(contraste(texto(f), f), PALETA.texto), 0);
    p += pontos(contraste(gold, escuro), PALETA.texto);
    // Ordem das secções: rust, gold, grey, aqua, gold (EPK).
    p += [[rust, gold], [gold, grey], [grey, aqua], [aqua, gold]].reduce((s, [a, b]) => s + Math.min(contraste(a, b), 3), 0);
    p += (texto(rust) === BRANCO ? 4 : 0) + croma(gold) * 6 + luminancia(grey) * 2;
    return [p, rust, gold, grey, aqua];
  }).sort((a, b) => b[0] - a[0])[0]
    // Uma secção cujo texto fique abaixo de PALETA.texto é ajustada o mínimo possível (escurecida
    // com texto claro, clareada com texto escuro).
    .map((f, i) => {
      if (i === 0 || contraste(texto(f), f) >= PALETA.texto) return f;
      const alvo = texto(f) === BRANCO ? PRETO : BRANCO;
      for (let k = 1; k <= 20; k++) {
        const c = misturar(f, alvo, k / 40);
        if (contraste(texto(c), c) >= PALETA.texto) return c;
      }
      return f;
    });

  // --ticket-red: texto sobre a secção dourada (agenda, especificações) e fundo do botão de
  // bilhetes (texto branco). A cor da paleta (ou o escuro) com mais contraste com os dois,
  // escurecida se não chegar.
  const fundosAcento = [gold, BRANCO];
  const minAcento = (c) => Math.min(...fundosAcento.map((f) => contraste(c, f)));
  const acento = escurecer([...cores.filter((c) => c !== gold), escuro]
    .sort((a, b) => minAcento(b) - minAcento(a))[0], fundosAcento, PALETA.texto);
  // --rust também é a cor dos links do menu (sobre o escuro) e de ícones/hovers nas páginas
  // brancas (imprensa, concertos, legais): onde não tiver contraste, fica outra cor.
  const menu = [rust, aqua, grey, BRANCO].find((c) => contraste(c, escuro) >= PALETA.texto) ?? BRANCO;
  const sobreBranco = contraste(rust, BRANCO) >= PALETA.grande ? rust : acento;
  const citacao = contraste(gold, rust) >= PALETA.grande ? gold : texto(rust);

  const h = corHex;
  const c = (a, b) => contraste(a, b).toFixed(1);
  return [
    `/* Paleta ${id} — gerada pelo build.js a partir de conteudo/paletas.yaml; não editar.`,
    `   https://colorhunt.co/palette/${id}`,
    `   Contrastes: texto/rust ${c(texto(rust), rust)}, texto/gold ${c(texto(gold), gold)}, texto/grey ${c(texto(grey), grey)}, texto/aqua ${c(texto(aqua), aqua)},`,
    `   gold/escuro ${c(gold, escuro)}, ticket-red/gold ${c(acento, gold)}, branco/ticket-red ${c(BRANCO, acento)}, menu/escuro ${c(menu, escuro)}. */`,
    ':root {',
    `  --black: ${h(escuro)};`,
    `  --text: ${h(escuro)};`,
    `  --rust: ${h(rust)};`,
    `  --gold: ${h(gold)};`,
    `  --gold-hot: ${h(gold)};`,
    `  --ticket-red: ${h(acento)};`,
    `  --grey-light: ${h(grey)};`,
    `  --aqua: ${h(aqua)};`,
    `  --card-dark: ${h(misturar(escuro, BRANCO, 0.1))};`,
    '}',
    `.section--rust { color: ${h(texto(rust))}; }`,
    `.section--gold { color: ${h(texto(gold))}; }`,
    `.section--grey { color: ${h(texto(grey))}; }`,
    `.section--aqua { color: ${h(texto(aqua))}; }`,
    `.hero, .evento-hero { background: ${h(escuro)}; }`,
    `.page-light { background: ${h(misturar([...cores].sort((a, b) => luminancia(b) - luminancia(a))[0], BRANCO, 0.6))}; }`,
    `.pullquote { color: ${h(citacao)}; }`,
    `.menu nav a { color: ${h(menu)}; }`,
    `.card h2 a:hover, .meta a:hover, .read-more:hover, .post .contacts a:hover, .post.evento .meta i,`,
    `.evento-dados i, .evento-dados a:hover, .post.legal a:hover { color: ${h(sobreBranco)}; }`,
    '.epk-cols > div + div { border-left-color: currentColor; }',
    '@media (max-width: 900px) { .tour-list .city { color: inherit; } }',
    '',
  ].join('\n');
}

// Paletas (conteudo/paletas.yaml, IDs ou links do colorhunt.co): gera dist/palettes/<id>.css e
// a lista de IDs (com a versão de cada CSS) no `/* @paletas */` do js/palette.js. Devolve os IDs.
function gerarPaletas() {
  const ficheiro = path.join(CONTEUDO, 'paletas.yaml');
  const lista = fs.existsSync(ficheiro) ? lerYaml(ficheiro).paletas ?? [] : [];
  if (!Array.isArray(lista)) throw new Error('paletas.yaml: `paletas` tem de ser uma lista');
  const ids = [...new Set(lista.map((item) => {
    const id = String(item).trim().toLowerCase().replace(/^.*\/palette\//, '').replace(/[#\s-]/g, '');
    if (!/^[0-9a-f]{24}$/.test(id)) throw new Error(`paletas.yaml: paleta inválida (4 cores hex, ex.: ff6082ffe4f6b26cff705eff): ${item}`);
    return id;
  }))];
  fs.mkdirSync(path.join(DIST, 'palettes'), { recursive: true });
  const versoes = Object.fromEntries(ids.map((id) => {
    const css = cssPaleta(id);
    fs.writeFileSync(path.join(DIST, 'palettes', `${id}.css`), css);
    return [id, crypto.createHash('sha256').update(css).digest('hex').slice(0, 10)];
  }));
  // Temas escritos à mão (src/palettes/<nome>.css, já copiados para dist/): ?palete_id=<nome>.
  const manuais = path.join(SRC, 'palettes');
  if (fs.existsSync(manuais)) fs.readdirSync(manuais).filter((f) => f.endsWith('.css')).forEach((f) => {
    const id = f.slice(0, -4);
    if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`palettes/${f}: o nome só pode ter minúsculas, dígitos e hífenes`);
    versoes[id] = crypto.createHash('sha256').update(fs.readFileSync(path.join(manuais, f))).digest('hex').slice(0, 10);
    ids.push(id);
  });
  const js = path.join(DIST, 'js', 'palette.js');
  fs.writeFileSync(js, substituirMarcador(fs.readFileSync(js, 'utf8'), /\/\* @paletas \*\/ \{\}/, JSON.stringify(versoes), 'js/palette.js'));
  return ids;
}

async function main() {
  const config = lerYaml(path.join(CONTEUDO, 'home.yaml'));
  const site = lerYaml(path.join(CONTEUDO, 'site.yaml'));

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

  // Secção "sobre" (`section_about`): o `texto_<língua>`, em Markdown, no lugar de `<!-- @about -->`.
  const sobre = Object.fromEntries(Object.keys(LINGUAS).map((lingua) => {
    const onde = `home.yaml: \`section_about.texto_${lingua}\``;
    const texto = String(config.section_about?.[`texto_${lingua}`] ?? '').trim();
    if (!texto) throw new Error(`${onde} tem de ter o texto da secção`);
    return [lingua, markdown(texto, onde)];
  }));

  const idYoutube = (link, onde) => {
    const id = link.match(/(?:[?&]v=|youtu\.be\/|\/(?:embed|shorts|live)\/)([\w-]{11})/)?.[1];
    if (!id) throw new Error(`${onde} não é um link do YouTube: ${link}`);
    return id;
  };

  // Vídeo em destaque (`section_single_video`), no lugar de `<!-- @video-destaque -->`: o embed
  // (.embed#live-video) com o `youtube` e, ao lado, o `title_<língua>` (h3) e o `text_<língua>`
  // (um <p> por parágrafo). Título ou texto vazio não é colocado (nem o .feature-text sem nenhum).
  const destaque = config.section_single_video ?? {};
  const destaqueLink = String(destaque.youtube ?? '').trim();
  if (!destaqueLink) throw new Error('home.yaml: `section_single_video.youtube` tem de ter o link do vídeo');
  const destaqueId = idYoutube(destaqueLink, 'home.yaml: `section_single_video.youtube`');
  const destaqueHtml = (lingua, indent) => {
    const r = ROTULOS[lingua];
    const titulo = String(destaque[`title_${lingua}`] ?? '').trim();
    const nome = titulo || "Gringo's Washboard Band";
    const paragrafos = String(destaque[`text_${lingua}`] ?? '').split(/\n\s*\n/)
      .map((p) => p.trim().replace(/\s*\n\s*/g, ' ')).filter(Boolean);
    const texto = titulo || paragrafos.length ? [
      `<div class="feature-text reveal">`,
      ...(titulo ? [`  <h3>${escapar(titulo)}</h3>`] : []),
      ...paragrafos.map((p) => `  <p>${escapar(p)}</p>`),
      `</div>`,
    ] : [];
    return [
      `<div class="embed feature-media reveal" id="live-video" data-youtube="${destaqueId}" data-title="${escapar(nome)}">`,
      `  <img src="https://i.ytimg.com/vi/${destaqueId}/maxresdefault.jpg" alt="${r.imagemVideo}: ${escapar(nome)}" loading="lazy">`,
      `  <div class="embed-bar"><span class="dot"></span>${escapar(nome)}</div>`,
      `  <button class="embed-play" type="button" aria-label="${r.video}: ${escapar(nome)}"><i class="fa-solid fa-play"></i></button>`,
      `</div>`,
      ...texto,
    ].map((l) => indent + l).join('\n');
  };

  // Vídeos da secção Média (`section_media`): um a.video-thumb por cada `youtube_1`/`youtube_2`
  // com link, no lugar de `<!-- @videos -->`; sem nenhum, não fica o contentor .video-grid.
  // Só com um, o contentor leva .video-grid--single (centrado e maior).
  const videos = ['youtube_1', 'youtube_2'].map((chave) => {
    const link = String(config.section_media?.[chave] ?? '').trim();
    return link ? { link, id: idYoutube(link, `home.yaml: \`section_media.${chave}\``) } : null;
  }).filter(Boolean);
  const videosHtml = (lingua, indent) => {
    if (!videos.length) return '';
    const r = ROTULOS[lingua];
    const nome = "Gringo's Washboard Band";
    return [
      `${indent}<div class="video-grid${videos.length === 1 ? ' video-grid--single' : ''} reveal">`,
      ...videos.map(({ link, id }) =>
        `${indent}  <a class="video-thumb" href="${escapar(link)}" data-youtube="${id}" target="_blank" rel="noopener" aria-label="${r.video}: ${escapar(nome)}"><img src="https://i.ytimg.com/vi/${id}/maxresdefault.jpg" alt="${r.imagemVideo}: ${escapar(nome)}" loading="lazy"></a>`),
      `${indent}</div>`,
    ].join('\n') + '\n';
  };

  // Fotos da secção Média (`section_media.fotos`, ficheiros em images/), no lugar de
  // `<!-- @fotos -->`: todas no .covers-grid (3 por linha no desktop, 2 no mobile).
  // Sem fotos, o contentor não é colocado.
  const fotos = (config.section_media?.fotos ?? []).map((f) => String(f ?? '').trim()).filter(Boolean);
  fotos.forEach((f) => {
    if (!fs.existsSync(path.join(SRC, 'images', f))) throw new Error(`home.yaml: \`section_media.fotos\`: imagem não existe: images/${f}`);
  });
  const fotosHtml = (indent) => fotos.length ? [
    `${indent}<div class="covers-grid reveal">`,
    ...fotos.map((f) => `${indent}  <a class="fx-tada" href="images/${escapar(f)}"><img src="images/${escapar(f)}" alt="" loading="lazy"></a>`),
    `${indent}</div>`,
  ].join('\n') : '';

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
  // Secções do EPK (`section_01` a `section_03` e `section_05`): `title.<língua>` (h2) e `text.<língua>` (Markdown,
  // como o `section_about`) no lugar de `<!-- @epk-section_NN -->`. Título vazio não é colocado.
  const EPK_SECOES = ['section_01', 'section_02', 'section_03', 'section_05'];
  const epkSecoes = Object.fromEntries(EPK_SECOES.map((secao) => [secao, Object.fromEntries(Object.keys(LINGUAS).map((lingua) => {
    const onde = `epk.yaml: \`${secao}.text.${lingua}\``;
    const titulo = String(epk[secao]?.title?.[lingua] ?? '').trim();
    const texto = String(epk[secao]?.text?.[lingua] ?? '').trim();
    if (!texto) throw new Error(`${onde} tem de ter o texto da secção`);
    return [lingua, [...(titulo ? [`<h2 class="section-title reveal">${escapar(titulo)}</h2>`] : []), ...markdown(texto, onde)]];
  }))]));

  // Vídeo do EPK (`section_04`): o `title.<língua>` (h2, também na barra e nos rótulos do vídeo) e o
  // embed (.embed.epk-video) do `youtube` (obrigatório) no lugar de `<!-- @epk-section_04 -->`.
  const epkVideoLink = String(epk.section_04?.youtube ?? '').trim();
  if (!epkVideoLink) throw new Error('epk.yaml: `section_04.youtube` tem de ter o link do vídeo');
  const epkVideoId = idYoutube(epkVideoLink, 'epk.yaml: `section_04.youtube`');
  const epkVideoHtml = (lingua, indent) => {
    const r = ROTULOS[lingua];
    const titulo = String(epk.section_04?.title?.[lingua] ?? '').trim();
    const nome = titulo || "Gringo's Washboard Band";
    return [
      ...(titulo ? [`<h2 class="section-title reveal">${escapar(titulo)}</h2>`] : []),
      `<div class="embed epk-video reveal" data-youtube="${epkVideoId}" data-title="${escapar(nome)}">`,
      `  <img src="https://i.ytimg.com/vi/${epkVideoId}/maxresdefault.jpg" alt="${r.imagemVideo}: ${escapar(nome)}" loading="lazy" width="1280" height="720">`,
      `  <div class="embed-bar"><span class="dot"></span>${escapar(nome)}</div>`,
      `  <button class="embed-play" type="button" aria-label="${r.video}: ${escapar(nome)}"><i class="fa-solid fa-play"></i></button>`,
      `</div>`,
    ].map((l) => indent + l).join('\n');
  };

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

  const paletas = gerarPaletas();

  // Cache busting: os links para css/style.css, js/main.js e js/palette.js levam
  // `?v=<hash do conteúdo>`, para os browsers não usarem uma versão antiga em cache depois de um deploy.
  const versoes = ['css/style.css', 'js/main.js', 'js/palette.js'].map((recurso) => {
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
      html = substituirMarcador(html, /^([ \t]*)<!-- @about.*-->/m, (_, indent) => sobre[lingua].map((l) => indent + l).join('\n'), pagina);
      html = substituirMarcador(html, /^([ \t]*)<!-- @agenda -->\r?\n?/m, agendaHtml(lingua), pagina);
      html = substituirMarcador(html, /^([ \t]*)<!-- @video-destaque -->/m, (_, indent) => destaqueHtml(lingua, indent), pagina);
      html = substituirMarcador(html, /^([ \t]*)<!-- @videos -->\r?\n?/m, (_, indent) => videosHtml(lingua, indent), pagina);
      html = substituirMarcador(html, /^([ \t]*)<!-- @fotos -->\r?\n?/m, (_, indent) => fotosHtml(indent) + (fotos.length ? '\n' : ''), pagina);
    }
    if (pagina === 'epk.html') {
      html = substituirMarcador(html, /^([ \t]*)<!-- @epk-hero -->/m, (_, indent) => epkHero.map((l) => indent + l).join('\n'), pagina);
      for (const secao of EPK_SECOES) {
        html = substituirMarcador(html, new RegExp(`^([ \\t]*)<!-- @epk-${secao}.*-->`, 'm'), (_, indent) => epkSecoes[secao][lingua].map((l) => indent + l).join('\n'), pagina);
      }
      html = substituirMarcador(html, /^([ \t]*)<!-- @epk-section_04.*-->/m, (_, indent) => epkVideoHtml(lingua, indent), pagina);
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
  paletas.forEach((id) => console.log(`Paleta ${id}: ${SITE_URL}?palete_id=${id}`));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
