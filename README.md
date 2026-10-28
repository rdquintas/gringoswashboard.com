# gringoswashboard.com

Site estático da **Gringos Washboard Band**. Por agora publicado no **GitHub Pages** (`https://rdquintas.github.io/gringoswashboard.com/dist/`); o `netlify.toml` fica preparado para mais tarde. Sem backend, sem base de dados, sem segredos.

- **Build:** Node.js (`build.js`) gera o site final em `dist/`. Por agora só copia `src/` para `dist/`.
- **Conteúdo:** por agora é só uma página (`src/index.html`) com um hero (`src/images/hero.jpg` em ecrã inteiro e o título centrado por cima). Um CSS próprio (`src/css/site.css`), sem JavaScript e sem tema.

## Estrutura

```
src/              ficheiros do site (copiados para dist/ pelo build)
  index.html      página inicial
  css/site.css    estilos próprios do site
  images/         imagens (hero.jpg)
build.js          build: limpa dist/, copia src/ para lá e gera sitemap.xml e robots.txt
dist/             resultado do build; versionado, porque é o que o GitHub Pages serve
.pages.yml        configuração do Pages CMS (edição do conteúdo)
.github/workflows/build.yml  build automático + commit de dist/
netlify.toml      configuração do Netlify (comando, pasta publicada, Node 22, cabeçalhos de segurança)
```

## Testar localmente
```bash
npm run build        # gera dist/
npm run dev          # build + serve dist em http://localhost:3000/
```
(`netlify dev` também serve.) Node 22 (`.nvmrc`). Antes do primeiro build: `npm install` (devDependencies `sharp`, conversão de imagens, e `yaml`, leitura dos YAML de `src/conteudo/`).

## Fluxo de trabalho
1. Editar os ficheiros em `src/`.
2. `npm run build` (o GitHub Pages não corre o build).
3. `commit` + `push` na branch principal, **incluindo `dist/`**.

Se o `push` só mexer em `src/` (ou no `build.js`/`package*.json`), o workflow `.github/workflows/build.yml` corre o build no GitHub e faz ele o commit de `dist/` (também corre todos os dias às 5h UTC, para tirar da agenda os concertos passados, e à mão em **Actions → Build → Run workflow**). Antes de trabalhar localmente, fazer `git pull` para trazer esses commits.

## Pages CMS (edição do conteúdo)

O conteúdo pode ser editado em [Pages CMS](https://app.pagescms.org/) (entrar com a conta do GitHub e abrir este repositório). A configuração está em `.pages.yml`, na raiz:

- **Página inicial** → `src/conteudo/home.yaml` (hero, sobre, média, vídeo em destaque, agenda); **EPK** → `epk.yaml`; **Dados do site** → `site.yaml` (contactos, redes sociais, Google Analytics); **Paletas** → `paletas.yaml`.
- **Imagens:** ficam em `src/images/` (PNG ou JPG). O CMS grava-as como `images/ficheiro.png`; o build aceita com ou sem `images/`.
- Os textos em Markdown (sobre e EPK) usam um editor de código, para não estragar a sintaxe própria (`::: split`, `{.classe}`).
- Ao gravar, o CMS faz commit no GitHub; o workflow faz o build e o commit de `dist/` (1–2 minutos) e o GitHub Pages publica.
- O CMS reescreve o YAML inteiro ao gravar: **os comentários dos ficheiros perdem-se** e as aspas podem mudar (o build lê YAML normal, por isso não faz diferença).
- Ao acrescentar uma chave a um destes YAML, acrescentá-la também no `.pages.yml` (o CMS só mostra os campos que lá estão).

**Caminhos relativos:** no GitHub Pages o site não está na raiz do domínio, por isso os links para CSS, imagens, etc. têm de ser relativos (`css/site.css`, `images/hero.jpg`) e nunca começar por `/`.

## Netlify: configuração inicial (para mais tarde)
1. Fazer push deste repositório para o GitHub.
2. Netlify → *Add new site* → *Import from Git* → escolher o repositório. O `netlify.toml` já define o comando (`npm run build`), a pasta (`dist`) e o Node 22.
3. Configurar o domínio em *Domain management*.

## Google Analytics e cookies
- O ID do GA4 fica em `src/conteudo/site.yaml` (`google_analytics_id: 'G-…'`). Vazio = sem Google Analytics e sem aviso de cookies.
- O GA só é carregado depois de o visitante aceitar no aviso de cookies (fundo do ecrã). A escolha fica guardada no browser e pode ser mudada em "Preferências de cookies", no footer ou na página da política de cookies.
- Páginas legais: `src/privacidade.html` e `src/politica-cookies.html` (pt e en). Ao mudar o que o site recolhe (ex.: newsletter real, novos serviços externos), rever o texto e a data de atualização.

## Vídeos da secção Média
Os dois vídeos da secção Média do index vêm de `section_media` em `src/conteudo/home.yaml` (`youtube_1` e `youtube_2`, links do YouTube, ex.: `https://www.youtube.com/watch?v=…` ou `https://youtu.be/…`). Um link vazio não é mostrado; sem nenhum, a grelha de vídeos não aparece.

O vídeo em destaque (secção cinzenta, a seguir ao hero) vem de `section_single_video`: `youtube` (link do vídeo, obrigatório), `title_pt`/`title_en` (título, também usado na barra do vídeo) e `text_pt`/`text_en` (texto ao lado; linhas em branco separam parágrafos). Um título ou texto vazio não é mostrado.

## Fotos da secção Média
As fotos da secção Média vêm de `section_media.fotos` em `src/conteudo/home.yaml`: uma lista de ficheiros em `src/images/` (têm de existir), sem limite. Ficam numa grelha: 3 por linha no desktop (70% da largura do ecrã) e 2 no mobile. Clicar numa abre-a em tamanho total, com botões para a anterior e a seguinte (também com as setas do teclado ou a deslizar no telemóvel).

## Texto da secção "Sobre" (Markdown)
O texto da secção da banda no index vem de `section_about` em `src/conteudo/home.yaml` (`texto_pt` e `texto_en`, blocos `|-`), escrito em Markdown simples. O mesmo Markdown serve para as secções de texto do EPK, em `section_01`, `section_02`, `section_03` e `section_05` de `src/conteudo/epk.yaml` (`title.pt`/`title.en`, o título da secção, e `text.pt`/`text.en`, o texto). O vídeo do EPK vem de `section_04` (`title.pt`/`title.en` e `youtube`, link do vídeo, obrigatório). Blocos separados por uma linha em branco:

| Escrever | Dá |
|---|---|
| `## Título` / `### Subtítulo` | `<h2>` / `<h3>` com `.section-title` (`#` sozinho não: o h1 é o do hero) |
| texto | parágrafo (linhas seguidas juntam-se no mesmo parágrafo) |
| `> “Citação”` | citação em destaque (`.pullquote`) |
| `- item` | lista |
| `![descrição](band.jpg)` | imagem (ficheiro em `src/images/`, tem de existir; convertida para AVIF/WebP como as outras) |
| `::: split` … `:::` | texto e imagem lado a lado (`.about-split`); se a imagem vier primeiro, fica à esquerda |
| `{.classe}` no fim de um bloco | junta essa classe do CSS (ex.: `Texto {.pullquote}`) |
| bloco começado por `<` | HTML, fica igual (sem `style="…"`: ver CSP) |

No texto: `**negrito**`, `*itálico*` (ou `_itálico_`), `[link](https://…)` (links externos abrem noutra janela) e HTML. Cada bloco leva `.reveal` (aparece ao fazer scroll), exceto os de HTML.

## Paletas de cores (experimentação)
- Em `src/conteudo/paletas.yaml`, acrescentar à lista `paletas` o ID de uma paleta do [colorhunt.co](https://colorhunt.co/) (as 4 cores seguidas, sem `#`, ex.: `ff6082ffe4f6b26cff705eff`) ou o link dela.
- O `npm run build` gera `dist/palettes/<id>.css` e escreve no fim o URL para a ver: `…/dist/?palete_id=<id>` (funciona em qualquer página e em inglês; os links internos mantêm o parâmetro).
- O build escolhe sozinho o papel de cada cor (fundo de cada secção, destaques, botões) para o texto ficar legível (contraste ≥ 4,5); o fundo escuro do header/footer é a cor mais escura da paleta, escurecida. Os contrastes ficam no comentário do topo de cada CSS.
- Temas escritos à mão: cada `src/palettes/<nome>.css` (minúsculas, dígitos e hífenes) vê-se com `?palete_id=<nome>`, como as paletas. Ex.: `vintage` (claro, papel/linho, texto castanho-tinta, acentos terracota).
- Sem o parâmetro (ou com um ID que não esteja no YAML), o site fica com as cores originais do `style.css`.

## Notas
- Segurança: cabeçalhos e CSP no `netlify.toml`. A CSP só permite recursos do próprio domínio e **não permite scripts nem estilos inline**: quando se acrescentar CSS/JS, vai em ficheiros. Qualquer domínio externo novo tem de ser acrescentado à CSP.
