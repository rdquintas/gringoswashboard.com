# CLAUDE.md

Site estático da **Gringos Washboard Band** (gringoswashboard.com), por agora publicado no **GitHub Pages** a partir de `dist/` (`https://rdquintas.github.io/gringoswashboard.com/dist/`); o `netlify.toml` fica preparado para mais tarde. O `README.md` tem a documentação completa; este ficheiro é o resumo para trabalhar no código.

Idioma do projeto: **português (pt-PT)** — código, comentários, mensagens do build e commits. O conteúdo do site está em inglês.

## Estado atual

Ponto de partida mínimo: só `src/index.html` com um hero (`src/images/hero.jpg` em ecrã inteiro, `<h1>` centrado por cima), estilizado em `src/css/site.css`. **Sem JS, sem tema/template** — não acrescentar sem ser pedido. O build existe mas só copia `src/` → `dist/`. Sem dependências npm, testes nem linter: validar correndo `npm run build`.

Inspiração para a evolução futura: o repositório [rdquintas/entrelinhasbar.com](https://github.com/rdquintas/entrelinhasbar.com) (build em Node que gera `dist/` a partir de YAML + templates).

## Comandos

```bash
npm run build        # node build.js → gera dist/
npm run dev          # build + npx serve dist (http://localhost:3000/)
```

Node 22 (`.nvmrc`, `netlify.toml`).

## Estrutura

- **`build.js`** — limpa `dist/` e copia `src/` para lá.
- **`src/`** — ficheiros do site: `index.html`, `css/site.css` (estilos próprios), `images/`.
- **`dist/`** — gerado, mas **versionado** (o GitHub Pages serve-o e não corre build): correr `npm run build` e fazer commit de `dist/` junto com `src/`.
- **`netlify.toml`** — `npm run build`, publica `dist`, Node 22, cabeçalhos de segurança.

## Caminhos

Como o site é servido num subcaminho do GitHub Pages, **todos os caminhos de recursos são relativos** (`css/site.css`, `images/hero.jpg`), nunca começam por `/`.

## Segurança / CSP

Cabeçalhos e CSP em `netlify.toml`: tudo `'self'`, **sem scripts nem estilos inline** (nem atributos `style="..."`). CSS/JS futuros vão em ficheiros; novos domínios externos têm de ser acrescentados à CSP.
