# CLAUDE.md

Site estático da **Gringos Washboard Band** (gringoswashboard.com), por agora publicado no **GitHub Pages** a partir de `dist/` (`https://rdquintas.github.io/gringoswashboard.com/dist/`); o `netlify.toml` fica preparado para mais tarde. O `README.md` tem a documentação completa; este ficheiro é o resumo para trabalhar no código.

Idioma do projeto: **português (pt-PT)** — código, comentários, mensagens do build e commits. O conteúdo do site está em inglês.

## Estado atual

Site de uma página (`index.html`) com secções (hero, álbum + reviews, agenda, live session, música, a banda, footer com newsletter) e duas páginas de imprensa (`press.html`, `press-post.html`). HTML escrito à mão, **sem templates nem framework**; o build copia `src/` → `dist/` e preenche alguns marcadores a partir de `src/conteudo/home.yaml`. Única dependência: `sharp` (devDependency, conversão de imagens); sem testes nem linter: validar correndo `npm run build`.

Muitas imagens ainda são placeholders de `placehold.co`.

Inspiração para a evolução futura: o repositório [rdquintas/entrelinhasbar.com](https://github.com/rdquintas/entrelinhasbar.com) (build em Node que gera `dist/` a partir de YAML + templates).

## Comandos

```bash
npm run build        # node build.js → gera dist/
npm run dev          # build + npx serve dist (http://localhost:3000/)
```

Node 22 (`.nvmrc`, `netlify.toml`).

## Estrutura

- **`build.js`** — limpa `dist/`, copia `src/` para lá (exceto `conteudo/`), aplica as configurações de `src/conteudo/home.yaml` (parser YAML mínimo próprio: mapas e listas, incluindo listas de mapas `- chave: valor`, aninhados por indentação com espaços), converte as imagens e gera `sitemap.xml` (um URL por cada `.html` na raiz de `src/`, `lastmod` = data do ficheiro) e `robots.txt`. URL base na constante `SITE_URL`.
- **`src/`** — ficheiros do site:
  - `conteudo/home.yaml` — configurações do site, agrupadas por secção: `section_hero` com `hero` (lista de imagens do slideshow, em `images/`) e `duracao_hero` (segundos que cada imagem fica visível); `section_about` com `members` (lista com `nome`, `instrumento.pt`/`instrumento.en` e `foto`; ainda não usada pelo build).
  - `index.html`, `press.html`, `press-post.html` — o header, menu e footer estão repetidos em cada página (alterar em todas).
  - `css/style.css` — todos os estilos, organizados por secções (`/* ---------- Hero ---------- */`); cores e fontes como variáveis em `:root`.
  - `js/main.js` — JS vanilla sem dependências (IIFE): menu fullscreen, reveal ao fazer scroll, efeitos "tada"/pulse, slider de reviews, tabs da agenda, newsletter (mock), ano no footer. Acrescenta a classe `js` ao `<html>`.
  - `images/` — `hero01–03.png` (slideshow do hero), `band.jpg`, `musico01–05.png`.
- **`dist/`** — gerado, mas **versionado** (o GitHub Pages serve-o e não corre build): correr `npm run build` e fazer commit de `dist/` junto com `src/`.
- **`netlify.toml`** — `npm run build`, publica `dist`, Node 22, cabeçalhos de segurança.

## Convenções

- **Hero:** as imagens e o tempo vêm do `home.yaml`. O build substitui `<!-- @hero-imagens -->` em `index.html` pelas `<img>` e `/* @hero-animacao */` em `style.css` pela animação (`@keyframes hero-fade`, ciclo = nº de imagens × `duracao_hero`, `animation-delay` negativos, fade de 1,5s na constante `HERO_FADE`). Crossfade só com CSS.
- **Movimento reduzido:** respeitar `prefers-reduced-motion` — no CSS há um bloco global que desliga animações/transições, e o JS verifica `reduceMotion` antes de animar.
- **Acessibilidade:** `aria-label` nos links só com ícone, `alt=""` em imagens decorativas, `aria-expanded`/`aria-hidden` atualizados pelo JS no menu.

## Imagens

Pôr em `src/images/` só os originais (PNG/JPG). O build gera `.avif` e `.webp` ao lado de cada um em `dist/images/` (com `sharp`; qualidade em `FORMATOS` no `build.js`; cache em `.cache/images/`, refeita quando o original muda) e envolve cada `<img src="images/…">` das páginas num `<picture>` com `<source>` AVIF → WebP, ficando o `<img>` original como fallback. No HTML de `src/` escrever só o `<img>` normal. O CSS tem `picture { display: contents; }` para o `<picture>` não afetar o layout, mas seletores estruturais (`:nth-of-type`, `>`, `:first-child`) sobre imagens locais têm de contar com o `<picture>` (ex.: `.hero picture:nth-of-type(2) img`).

## Caminhos

Como o site é servido num subcaminho do GitHub Pages, **todos os caminhos de recursos são relativos** (`css/style.css`, `images/hero01.png`), nunca começam por `/`.

## Segurança / CSP

- **Sem scripts nem estilos inline** (nem atributos `style="..."` no HTML); CSS e JS vão em ficheiros. Alterar estilos a partir do JS via `element.style` é permitido.
- Domínios externos em uso: Google Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`), Font Awesome via `cdnjs.cloudflare.com` e imagens de `placehold.co` e `i.ytimg.com` (miniaturas do YouTube); o leitor do YouTube vem de `www.youtube-nocookie.com` (iframe criado pelo JS só ao clicar numa `.video-thumb[data-youtube]` ou `.embed[data-youtube]`; links com `data-play="<id do embed>"` também o arrancam).
- A CSP em `netlify.toml` permite `'self'` mais estes domínios (cada um só na diretiva de que precisa: `img-src`, `style-src`, `font-src`, `frame-src`). No GitHub Pages não tem efeito. Novos domínios externos têm de ser acrescentados lá; quando os placeholders forem substituídos, retirar `placehold.co`.
