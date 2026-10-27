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
netlify.toml      configuração do Netlify (comando, pasta publicada, Node 22, cabeçalhos de segurança)
```

## Testar localmente
```bash
npm run build        # gera dist/
npm run dev          # build + serve dist em http://localhost:3000/
```
(`netlify dev` também serve.) Node 22 (`.nvmrc`). Não há dependências: o `npm install` não é necessário por agora.

## Fluxo de trabalho
1. Editar os ficheiros em `src/`.
2. `npm run build` (o GitHub Pages não corre o build).
3. `commit` + `push` na branch principal, **incluindo `dist/`**.

**Caminhos relativos:** no GitHub Pages o site não está na raiz do domínio, por isso os links para CSS, imagens, etc. têm de ser relativos (`css/site.css`, `images/hero.jpg`) e nunca começar por `/`.

## Netlify: configuração inicial (para mais tarde)
1. Fazer push deste repositório para o GitHub.
2. Netlify → *Add new site* → *Import from Git* → escolher o repositório. O `netlify.toml` já define o comando (`npm run build`), a pasta (`dist`) e o Node 22.
3. Configurar o domínio em *Domain management*.

## Google Analytics e cookies
- O ID do GA4 fica em `src/conteudo/site.yaml` (`google_analytics_id: 'G-…'`). Vazio = sem Google Analytics e sem aviso de cookies.
- O GA só é carregado depois de o visitante aceitar no aviso de cookies (fundo do ecrã). A escolha fica guardada no browser e pode ser mudada em "Preferências de cookies", no footer ou na página da política de cookies.
- Páginas legais: `src/privacidade.html` e `src/politica-cookies.html` (pt e en). Ao mudar o que o site recolhe (ex.: newsletter real, novos serviços externos), rever o texto e a data de atualização.

## Paletas de cores (experimentação)
- Em `src/conteudo/paletas.yaml`, acrescentar à lista `paletas` o ID de uma paleta do [colorhunt.co](https://colorhunt.co/) (as 4 cores seguidas, sem `#`, ex.: `ff6082ffe4f6b26cff705eff`) ou o link dela.
- O `npm run build` gera `dist/palettes/<id>.css` e escreve no fim o URL para a ver: `…/dist/?palete_id=<id>` (funciona em qualquer página e em inglês; os links internos mantêm o parâmetro).
- O build escolhe sozinho o papel de cada cor (fundo de cada secção, destaques, botões) para o texto ficar legível (contraste ≥ 4,5); o fundo escuro do header/footer é a cor mais escura da paleta, escurecida. Os contrastes ficam no comentário do topo de cada CSS.
- Sem o parâmetro (ou com um ID que não esteja no YAML), o site fica com as cores originais do `style.css`.

## Notas
- Segurança: cabeçalhos e CSP no `netlify.toml`. A CSP só permite recursos do próprio domínio e **não permite scripts nem estilos inline**: quando se acrescentar CSS/JS, vai em ficheiros. Qualquer domínio externo novo tem de ser acrescentado à CSP.
